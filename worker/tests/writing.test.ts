import assert from "node:assert/strict";
import test from "node:test";
import { createWriting, publishWriting, saveWriting, uploadWritingAsset } from "../src/writing.ts";
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
  const puts: Array<{ key: string; value: unknown; options: unknown }> = [];
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
    async put(key: string, value: unknown, options: unknown) {
      puts.push({ key, value, options });
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
  status: "incomplete",
  body: "## 中文章节\n\n中文与 English 可以混合书写。",
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

test("save rejects a leading body heading that duplicates the Writing title", async () => {
  const restore = installEmptyRepositoryFetch();
  const { env, puts } = environment();
  try {
    await assert.rejects(
      saveWriting(env, {
        ...savePayload,
        body: "## Changed title\n\nBody.",
        baseSavedAt: draft.savedAt,
      }),
      (error: unknown) => error instanceof HttpError
        && error.status === 400
        && /repeat its title/i.test(error.message),
    );
    assert.equal(puts.length, 0);
  } finally {
    restore();
  }
});

test("save accepts a legacy language field and removes it from the stored draft", async () => {
  const restore = installEmptyRepositoryFetch();
  const { env, puts } = environment();
  try {
    const result = await saveWriting(env, { ...savePayload, baseSavedAt: draft.savedAt });
    assert.match(result.body, /中文与 English/);
    assert.equal(puts.length, 1);
    const stored = JSON.parse(String(puts[0].value));
    assert.equal("lang" in stored, false);
    assert.match(stored.body, /中文与 English/);
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
    headers: { "Content-Length": "1024" },
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

test("create keeps the id and creation time aligned when repository checks cross a second", async () => {
  const restoreFetch = installEmptyRepositoryFetch();
  const OriginalDate = globalThis.Date;
  const ticks = [
    "2026-08-01T00:00:00.900Z",
    "2026-08-01T00:00:01.100Z",
  ];
  let tick = 0;
  class AdvancingDate extends OriginalDate {
    constructor(value?: string | number) {
      super(value ?? ticks[Math.min(tick++, ticks.length - 1)]);
    }
  }
  globalThis.Date = AdvancingDate as DateConstructor;
  const { env, puts } = environment();
  try {
    const result = await createWriting(env, {
      title: "New Writing",
      summary: "Summary",
      status: "incomplete",
    });
    assert.equal(result.entry.id, "20260801-080000");
    assert.equal(result.entry.createdAt, "2026-08-01T08:00:00+08:00");
    assert.equal(puts.length, 1);
    const stored = JSON.parse(String(puts[0].value));
    assert.equal(stored.id, result.entry.id);
    assert.equal(stored.createdAt, result.entry.createdAt);
    assert.equal("lang" in stored, false);
  } finally {
    globalThis.Date = OriginalDate;
    restoreFetch();
  }
});

test("image uploads require a bounded request length before multipart buffering", async () => {
  const { env, puts } = environment();
  const form = new FormData();
  form.set("id", id);
  form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "fake.png", { type: "image/png" }));
  const request = new Request("https://xayah.me/api/writing/assets/upload", { method: "POST", body: form });
  await assert.rejects(
    uploadWritingAsset(env, request),
    (error: unknown) => error instanceof HttpError && error.status === 411,
  );
  assert.equal(puts.length, 0);
});

test("a failed concurrent publish never rolls back content-addressed public media", async () => {
  const original = globalThis.fetch;
  const name = `${"b".repeat(64)}.png`;
  const publishingDraft = { ...draft, body: `## Section\n\n![Image](./${name})\n` };
  const publicKey = `published/writing/${id}/${name}`;
  const privateKey = `private/writing/assets/${id}/${name}`;
  const puts: string[] = [];
  const deletes: Array<string | string[]> = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    if (url.pathname.endsWith("/git/ref/heads/master")) return githubResponse({ object: { sha: "c".repeat(40) } });
    if (url.pathname.endsWith(`/git/commits/${"c".repeat(40)}`)) {
      return githubResponse({ sha: "c".repeat(40), tree: { sha: "t".repeat(40) } });
    }
    if (method === "GET" && url.pathname.endsWith(`/git/trees/${"t".repeat(40)}`)) {
      return githubResponse({ tree: [], truncated: false });
    }
    if (method === "POST" && url.pathname.endsWith("/git/blobs")) return githubResponse({ sha: "b".repeat(40) }, 201);
    if (method === "POST" && url.pathname.endsWith("/git/trees")) return githubResponse({ sha: "d".repeat(40) }, 201);
    if (method === "POST" && url.pathname.endsWith("/git/commits")) return githubResponse({ sha: "e".repeat(40) }, 201);
    if (method === "PATCH" && url.pathname.endsWith("/git/refs/heads/master")) {
      return githubResponse({ message: "Reference update failed" }, 409);
    }
    throw new Error(`Unexpected GitHub request: ${method} ${url}`);
  };
  const env = {
    CONTENT: {
      async get(key: string) {
        if (key === `private/writing/drafts/${id}.json`) {
          return { etag: "draft-etag", async json() { return structuredClone(publishingDraft); } };
        }
        if (key === privateKey) {
          return { body: new Uint8Array([1]), httpMetadata: { contentType: "image/png" }, customMetadata: {} };
        }
        return null;
      },
      async head() { return null; },
      async put(key: string) { puts.push(key); return { etag: "new" }; },
      async delete(keys: string | string[]) { deletes.push(keys); },
      async list() { return { objects: [], truncated: false }; },
    },
    GITHUB_TOKEN: "test",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "repo",
    GITHUB_BRANCH: "master",
    PUBLIC_SITE_ORIGIN: "https://xayah.me",
    DICTIONARY_ORIGIN: "https://dictionary.xayah.me",
    DICTIONARY_GITHUB_REPO: "dictionary",
    DICTIONARY_GITHUB_BRANCH: "master",
    MEDIA_ORIGIN: "https://media.xayah.me",
  } as never;
  try {
    await assert.rejects(
      publishWriting(env, { year: "2026", id }),
      (error: unknown) => error instanceof HttpError && error.status === 409,
    );
    assert.ok(puts.includes(publicKey));
    assert.deepEqual(deletes, []);
  } finally {
    globalThis.fetch = original;
  }
});
