import type { BuildStatus, Env, WritingDraft } from "./types";
import { HttpError } from "./utils";

export const draftKey = (id: string) => `private/writing/drafts/${id}.json`;
export const previewKey = (id: string, sourceHash: string) => `private/writing/previews/${id}/${sourceHash}.pdf`;
export const buildKey = (jobId: string) => `private/writing/builds/${jobId.slice(0, 15)}/${jobId}.json`;

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const object = await env.CONTENT.get(key);
  if (!object) return null;
  try {
    return await object.json<T>();
  } catch {
    throw new HttpError(500, `Stored editor data is invalid: ${key}`);
  }
}

export async function getDraft(env: Env, id: string): Promise<WritingDraft | null> {
  return readJson<WritingDraft>(env, draftKey(id));
}

export async function putDraft(env: Env, draft: WritingDraft): Promise<void> {
  await env.CONTENT.put(draftKey(draft.id), JSON.stringify(draft), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function deleteDraft(env: Env, id: string): Promise<void> {
  await env.CONTENT.delete(draftKey(id));
}

export async function listDrafts(env: Env): Promise<WritingDraft[]> {
  const drafts: WritingDraft[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.CONTENT.list({ prefix: "private/writing/drafts/", cursor, limit: 1000 });
    for (const object of page.objects) {
      const draft = await readJson<WritingDraft>(env, object.key);
      if (draft) drafts.push(draft);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return drafts;
}

export async function hasDrafts(env: Env): Promise<boolean> {
  const result = await env.CONTENT.list({ prefix: "private/writing/drafts/", limit: 1 });
  return result.objects.length > 0;
}

export async function getBuild(env: Env, jobId: string): Promise<BuildStatus | null> {
  return readJson<BuildStatus>(env, buildKey(jobId));
}

export async function putBuild(env: Env, status: BuildStatus): Promise<void> {
  await env.CONTENT.put(buildKey(status.jobId), JSON.stringify(status), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function deleteBuild(env: Env, jobId: string): Promise<void> {
  await env.CONTENT.delete(buildKey(jobId));
}

export async function deletePrefix(env: Env, prefix: string): Promise<void> {
  while (true) {
    const page = await env.CONTENT.list({ prefix, limit: 1000 });
    if (!page.objects.length) return;
    if (page.objects.length) await env.CONTENT.delete(page.objects.map((object) => object.key));
  }
}

export async function deleteWritingObjects(env: Env, id: string): Promise<void> {
  await env.CONTENT.delete([draftKey(id), `private/writing/previews/${id}.pdf`, `private/writing/current/${id}.json`]);
  await Promise.all([
    deletePrefix(env, `private/writing/builds/${id}/`),
    deletePrefix(env, `private/writing/previews/${id}/`),
    deletePrefix(env, `published/writing/${id}/`),
  ]);
}
