import type { Env, FileChange } from "./types";
import { decodeUtf8Base64, encodeBase64, HttpError, parseModule } from "./utils";

interface GitHubRef {
  object: { sha: string };
}

interface GitHubCommit {
  sha: string;
  tree: { sha: string };
}

interface GitHubContent {
  type: "file" | "dir";
  content?: string;
  encoding?: string;
  sha: string;
  path: string;
}

interface GitHubTree {
  tree: Array<{ path: string; type: string; sha: string }>;
  truncated: boolean;
}

const API_VERSION = "2022-11-28";

function repoPath(env: Env): string {
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
}

function encodedFilePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubRequest<T>(env: Env, path: string, init: RequestInit = {}, accepted: number[] = [200]): Promise<T> {
  if (!env.GITHUB_TOKEN) throw new HttpError(503, "The GitHub editor credential is not configured.");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "xayah-site-editor-worker",
      "X-GitHub-Api-Version": API_VERSION,
      ...(init.headers || {}),
    },
  });
  if (!accepted.includes(response.status)) {
    let detail = "";
    try {
      const value = await response.json() as { message?: string };
      detail = value.message || "";
    } catch {
      detail = await response.text();
    }
    const status = response.status === 409 || response.status === 422 ? 409 : (response.status === 401 || response.status === 403 ? 503 : 502);
    throw new HttpError(status, detail ? `GitHub: ${detail}` : `GitHub request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function readTextFile(env: Env, path: string, branch = env.GITHUB_BRANCH, required = true): Promise<string | null> {
  const url = `${repoPath(env)}/contents/${encodedFilePath(path)}?ref=${encodeURIComponent(branch)}`;
  let response: GitHubContent;
  try {
    response = await githubRequest<GitHubContent>(env, url);
  } catch (error) {
    if (!required && error instanceof HttpError && /Not Found/i.test(error.message)) return null;
    throw error;
  }
  if (response.type !== "file" || response.encoding !== "base64" || typeof response.content !== "string") {
    throw new HttpError(502, `GitHub did not return file content for ${path}.`);
  }
  return decodeUtf8Base64(response.content);
}

export async function readDataModule<T>(env: Env, path: string, branch = env.GITHUB_BRANCH, required = true): Promise<T | null> {
  const source = await readTextFile(env, path, branch, required);
  return source === null ? null : parseModule<T>(source, path);
}

async function currentCommit(env: Env, branch: string): Promise<GitHubCommit> {
  const ref = await githubRequest<GitHubRef>(env, `${repoPath(env)}/git/ref/heads/${encodeURIComponent(branch)}`);
  return githubRequest<GitHubCommit>(env, `${repoPath(env)}/git/commits/${ref.object.sha}`);
}

export async function listPaths(env: Env, prefix: string, branch = env.GITHUB_BRANCH): Promise<string[]> {
  const commit = await currentCommit(env, branch);
  const tree = await githubRequest<GitHubTree>(env, `${repoPath(env)}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new HttpError(502, "The GitHub tree is too large to safely update.");
  return tree.tree
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix))
    .map((entry) => entry.path);
}

export async function commitFiles(env: Env, message: string, changes: FileChange[], branch = env.GITHUB_BRANCH): Promise<string> {
  if (changes.length === 0) throw new HttpError(400, "No GitHub changes were requested.");
  const paths = new Set<string>();
  for (const change of changes) {
    if (!change.path || change.path.startsWith("/") || change.path.includes("..") || paths.has(change.path)) {
      throw new HttpError(400, "A GitHub file change is invalid or duplicated.");
    }
    paths.add(change.path);
  }

  const parent = await currentCommit(env, branch);
  const treeEntries = await Promise.all(changes.map(async (change) => {
    if (change.content === null) return { path: change.path, mode: "100644", type: "blob", sha: null };
    const bytes = typeof change.content === "string" ? new TextEncoder().encode(change.content) : change.content;
    const blob = await githubRequest<{ sha: string }>(env, `${repoPath(env)}/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: encodeBase64(bytes), encoding: "base64" }),
    }, [201]);
    return { path: change.path, mode: "100644", type: "blob", sha: blob.sha };
  }));

  const tree = await githubRequest<{ sha: string }>(env, `${repoPath(env)}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries }),
  }, [201]);
  const commit = await githubRequest<{ sha: string }>(env, `${repoPath(env)}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: tree.sha, parents: [parent.sha] }),
  }, [201]);
  try {
    await githubRequest(env, `${repoPath(env)}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      throw new HttpError(409, "The site changed while this save was running. Reload the Editor and try again.");
    }
    throw error;
  }
  return commit.sha;
}

export async function dispatchWorkflow(env: Env, workflow: string, inputs: Record<string, string>): Promise<void> {
  await githubRequest(env, `${repoPath(env)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: env.GITHUB_BRANCH, inputs }),
  }, [204]);
}
