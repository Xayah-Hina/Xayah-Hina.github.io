import assert from "node:assert/strict";
import test from "node:test";
import { saveWriting, uploadWritingAsset } from "../src/writing.ts";
import { HttpError } from "../src/utils.ts";

const id = "20260715-090945";
const draft = {
  id,
  title: "Title",
  summary: "Summary",
  createdAt: "2026-07-15T09:09:45+08:00",
  updatedAt: "2026-07-15T09:09:45+08:00",
  lang: "zh-CN",
  status: "incomplete" as const,
  body: "## Section\n\nBody.\n",
  savedAt: "2026-07-26T12:00:00.000Z",
  sourceHash: "a".repeat(64),
};

function githubResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installEmptyRepositoryFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/git/ref/heads/")) return githubResponse({ object: { sha: "c".repeat(40) } });
    if (url.includes("/git/commits/")) return githubResponse({ sha: "c".repeat(40), tree: { sha: "t".repeat(40) } });
    if (url.includes("/git/trees/")) return githubResponse({ tree: [], truncated: false });
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

function environment(putResult: unknown = { etag: "next" }) {
  const puts: Array<{ key: string; options: unknown }> = [];
  const content = {
    async get(key: string) {
      if (key === `private/writing/drafts/${id}.json`) {
        return {
          etag: "draft-etag",
          async json() {
            return structuredClone(draft);
          },
        };
      }
      return null;
    },
    async put(key: string, _value: unknown, options: unknown) {
      puts.push({ key, options });
      return putResult;
    },
    async head() {
      return null;
    },
    async list() {
      return { objects: [], truncated: false };
    },
    async delete() {},
  };
  return {
    env: {
      CONTENT: content,
      GITHUB_TOKEN: "test",
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo",
      GITHUB_BRANCH: "master",
      PUBLIC_SITE_ORIGIN: "https://xayah.me",
      DICTIONARY_ORIGIN: "https://dictionary.xayah.me",
      DICTIONARY_GITHUB_REPO: "dictionary",
      DICTIONARY_GITHUB_BRANCH: "master",
      MEDIA_ORIGIN: "https://media.xayah.me",
    } as never,
    puts,
  };
}

const savePayload = {
  year: "2026",
  id,
  title: "Changed title",
  summary: "Summary",
  lang: "zh-CN",
  status: "incomplete",
  body: "## Section\n\nChanged.",
};

test("save rejects a stale savedAt before writing R2", async () => {
  const restore = installEmptyRepositoryFetch();
  const { env, puts } = environment();
  try {
    await assert.rejects(
      saveWriting(env, { ...savePayload, baseSavedAt: "2026-07-26T11:59:00.000Z" }),
      (error: unknown) => error instanceof HttpError && error.status === 409,
    );
    assert.equal(puts.length, 0);
  } finally {
    restore();
  }
});

test("save reports 409 when the conditional R2 write loses a race", async () => {
  const restore = installEmptyRepositoryFetch();
  const { env, puts } = environment(null);
  try {
    await assert.rejects(
      saveWriting(env, { ...savePayload, baseSavedAt: draft.savedAt }),
      (error: unknown) => error instanceof HttpError && error.status === 409,
    );
    assert.equal(puts.length, 1);
    assert.deepEqual((puts[0].options as { onlyIf: unknown }).onlyIf, { etagMatches: "draft-etag" });
  } finally {
    restore();
  }
});

test("image upload rejects a MIME and magic-number mismatch", async () => {
  const restore = installEmptyRepositoryFetch();
  const { env, puts } = environment();
  const form = new FormData();
  form.set("id", id);
  form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "fake.png", { type: "image/png" }));
  const request = new Request("https://xayah.me/api/writing/assets/upload", {
    method: "POST",
    body: form,
  });
  try {
    await assert.rejects(
      uploadWritingAsset(env, request),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
    assert.equal(puts.length, 0);
  } finally {
    restore();
  }
});
