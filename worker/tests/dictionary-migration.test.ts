import assert from "node:assert/strict";
import test from "node:test";
import { openDictionary } from "../src/dictionary.ts";
import { editorPublicTarget } from "../src/index.ts";

const entry = {
  entryId: "entry-spurious",
  canonicalKey: "spurious",
  word: "spurious",
  shard: 7,
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function environment(storedDraft: unknown = null) {
  return {
    CONTENT: {
      async get(key: string) {
        if (!storedDraft || key !== "private/dictionary/drafts/entry-spurious.json") return null;
        return { async json() { return structuredClone(storedDraft); } };
      },
      async list() {
        return {
          objects: storedDraft ? [{ key: "private/dictionary/drafts/entry-spurious.json" }] : [],
          truncated: false,
        };
      },
    },
    GITHUB_TOKEN: "test",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "main-site",
    GITHUB_BRANCH: "master",
    PUBLIC_SITE_ORIGIN: "https://xayah.me",
    DICTIONARY_ORIGIN: "https://dictionary.xayah.me",
    DICTIONARY_GITHUB_REPO: "dictionary",
    DICTIONARY_GITHUB_BRANCH: "master",
    EDITOR_ORIGIN: "https://editor.xayah.me",
    MEDIA_ORIGIN: "https://media.xayah.me",
  } as never;
}

test("Dictionary reads data and Personal Knowledge from the standalone site and repository", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url === "https://dictionary.xayah.me/generated/blocks/0007.json") {
      return response([entry]);
    }
    if (url.includes("/repos/owner/dictionary/contents/personal/sp/spurious.json?ref=master")) {
      return response({ message: "Not Found" }, 404);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const result = await openDictionary(environment(), { entryId: entry.entryId, shard: entry.shard });
    assert.equal(result.entryId, entry.entryId);
    assert.equal(result.sync.branch, "master");
    assert.equal(requests.some((url) => url.includes("/repos/owner/main-site/")), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("Dictionary accepts an unpublished draft saved before the repository migration", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://dictionary.xayah.me/generated/blocks/0007.json") {
      return response([entry]);
    }
    if (url.includes("/repos/owner/dictionary/contents/personal/sp/spurious.json?ref=master")) {
      return response({ message: "Not Found" }, 404);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const legacyDraft = {
    schemaVersion: 1,
    entry,
    path: "dictionary/personal/sp/spurious.json",
    personal: {
      schemaVersion: 1,
      entryId: entry.entryId,
      summary: "旧草稿",
      usageNotes: "",
      confusionNotes: "",
      examples: [],
      createdAt: "2026-07-20T00:00:00+08:00",
      updatedAt: "2026-07-20T00:00:00+08:00",
    },
    savedAt: "2026-07-20T00:00:00+08:00",
  };

  try {
    const result = await openDictionary(environment(legacyDraft), {
      entryId: entry.entryId,
      shard: entry.shard,
    });
    assert.equal(result.personal.summary, "旧草稿");
    assert.equal(result.unpublished, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("Editor Dictionary paths are stripped before proxying to the standalone origin", () => {
  const env = environment();
  const dictionaryUrl = new URL("https://editor.xayah.me/dictionary/assets/app.js?version=1");
  assert.deepEqual(editorPublicTarget(env, dictionaryUrl), {
    origin: "https://dictionary.xayah.me",
    pathname: "/assets/app.js",
  });

  const writingUrl = new URL("https://editor.xayah.me/writing/20260715-090945/");
  assert.deepEqual(editorPublicTarget(env, writingUrl), {
    origin: "https://xayah.me",
    pathname: "/writing/20260715-090945/",
  });
});
