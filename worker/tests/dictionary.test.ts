import assert from "node:assert/strict";
import test from "node:test";
import { openDictionary } from "../src/dictionary.ts";

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

function environment() {
  return {
    CONTENT: {
      async get() { return null; },
      async list() {
        return {
          objects: [],
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
