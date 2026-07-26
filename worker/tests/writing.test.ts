import assert from "node:assert/strict";
import test from "node:test";
import { openWriting, saveWriting, uploadWritingAsset } from "../src/writing.ts";
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
      EDITOR_ORIGIN: "https://editor.xayah.me",
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
  const request = new Request("https://editor.xayah.me/api/writing/assets/upload", {
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

test("opening a legacy TeX draft migrates it to a Markdown draft without publishing", async () => {
  const restore = installEmptyRepositoryFetch();
  const legacyId = "20260724-145229";
  let stored: Record<string, unknown> = {
    id: legacyId,
    title: "少一点解构主义：这个，不需要了。",
    summary: "旧草稿摘要",
    source: [
      "\\documentclass{ctexart}",
      "\\begin{document}",
      "\\maketitle",
      "\\begin{abstract}",
      "旧草稿摘要",
      "\\end{abstract}",
      "\\section{解构主义：阿Q精神的画皮}",
      "\\end{document}",
      "",
    ].join("\n"),
    sourceHash: "b".repeat(64),
    savedAt: "2026-07-24T15:07:57+08:00",
  };
  let etag = "legacy-etag";
  const puts: Array<{ key: string; value: string; options: unknown }> = [];
  const key = `private/writing/drafts/${legacyId}.json`;
  const object = () => ({
    etag,
    async json() {
      return structuredClone(stored);
    },
  });
  const content = {
    async get(requested: string) {
      return requested === key ? object() : null;
    },
    async put(requested: string, value: string, options: unknown) {
      puts.push({ key: requested, value, options });
      stored = JSON.parse(value) as Record<string, unknown>;
      etag = "markdown-etag";
      return { etag };
    },
    async head() {
      return null;
    },
    async list(options: { prefix?: string }) {
      return options.prefix === "private/writing/drafts/"
        ? { objects: [{ key, etag }], truncated: false }
        : { objects: [], truncated: false };
    },
    async delete() {},
  };
  const env = {
    CONTENT: content,
    GITHUB_TOKEN: "test",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "repo",
    GITHUB_BRANCH: "master",
    PUBLIC_SITE_ORIGIN: "https://xayah.me",
    EDITOR_ORIGIN: "https://editor.xayah.me",
    MEDIA_ORIGIN: "https://media.xayah.me",
  } as never;
  try {
    const result = await openWriting(env, { year: "2026", id: legacyId });
    assert.equal(result.entry.createdAt, "2026-07-24T14:52:29+08:00");
    assert.equal(result.entry.updatedAt, result.entry.createdAt);
    assert.equal(result.entry.lang, "zh-CN");
    assert.equal(result.entry.status, "incomplete");
    assert.equal(result.body, "## 解构主义：阿Q精神的画皮\n");
    assert.equal(result.savedAt, "2026-07-24T15:07:57+08:00");
    assert.equal(result.sync.writingPending, true);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].key, key);
    assert.deepEqual((puts[0].options as { onlyIf: unknown }).onlyIf, { etagMatches: "legacy-etag" });
    assert.equal("source" in stored, false);
    assert.equal(typeof stored.sourceHash, "string");
    assert.equal(String(stored.sourceHash).length, 64);
  } finally {
    restore();
  }
});
