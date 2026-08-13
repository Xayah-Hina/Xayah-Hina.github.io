import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { commitFiles, readTextFile } from "../src/github.ts";
import { HttpError } from "../src/utils.ts";

function environment() {
  return {
    GITHUB_TOKEN: "test",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "repo",
    GITHUB_BRANCH: "master",
  } as never;
}

test("large GitHub files fall back from Contents to the Git Blobs API", async () => {
  const original = globalThis.fetch;
  const sha = "a".repeat(40);
  const source = `export default ${JSON.stringify("x".repeat(1_100_000))};\n`;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/contents/journals/2026.js")) {
      return Response.json({ type: "file", path: "journals/2026.js", sha, encoding: "none" });
    }
    if (url.endsWith(`/git/blobs/${sha}`)) {
      return Response.json({ sha, encoding: "base64", content: Buffer.from(source).toString("base64") });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
  try {
    assert.equal(await readTextFile(environment(), "journals/2026.js"), source);
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("GitHub commits reject a stale repository snapshot before creating blobs", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/git/ref/heads/master")) {
      return Response.json({ object: { sha: "b".repeat(40) } });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
  try {
    await assert.rejects(
      commitFiles(environment(), "Edit", [{ path: "journals/2026.js", content: "new" }], "master", "a".repeat(40)),
      (error: unknown) => error instanceof HttpError && error.status === 409,
    );
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
