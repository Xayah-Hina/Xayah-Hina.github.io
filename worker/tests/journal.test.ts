import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  authoringJournalCatalogData,
  authoringJournalYearData,
  saveJournal,
} from "../src/journal.ts";

const year = "2026";
const entry = {
  id: "20260807-171423-7239",
  publishedAt: "2026-08-07T17:14:23+08:00",
  updatedAt: "2026-08-08T10:00:00+08:00",
  content: "Updated Journal content.",
  images: [],
  relatedWriting: null,
};
const monthly = {
  "2026-08": {
    note: "August note",
    reportImage: null,
    updatedAt: "2026-08-08T10:00:00+08:00",
  },
};

function moduleSource(value: unknown): string {
  return `export default ${JSON.stringify(value, null, 2)};\n`;
}

function githubFile(path: string, value: unknown): Response {
  const source = moduleSource(value);
  return new Response(JSON.stringify({
    type: "file",
    path,
    sha: "a".repeat(40),
    encoding: "base64",
    content: Buffer.from(source).toString("base64"),
  }), { headers: { "Content-Type": "application/json" } });
}

function installJournalFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/contents/journals/catalog.js")) {
      return githubFile("journals/catalog.js", { years: [2026] });
    }
    if (url.pathname.endsWith(`/contents/journals/${year}.js`)) {
      return githubFile(`journals/${year}.js`, [entry]);
    }
    if (url.pathname.endsWith(`/contents/journals/monthly/${year}.js`)) {
      return githubFile(`journals/monthly/${year}.js`, monthly);
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

function environment() {
  const deleted: Array<string | string[]> = [];
  return {
    deleted,
    env: {
      CONTENT: {
        async list() {
          return { objects: [], truncated: false };
        },
        async delete(keys: string | string[]) {
          if (Array.isArray(keys) && keys.length === 0) {
            throw new Error("delete: The number of keys in the request must be between 1 and 1000 inclusive. (10027)");
          }
          deleted.push(keys);
        },
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
    } as never,
  };
}

test("an unchanged Journal edit never sends an empty R2 delete request", async () => {
  const restore = installJournalFetch();
  const { env, deleted } = environment();
  try {
    const result = await saveJournal(env, {
      mode: "edit",
      entry: {
        id: entry.id,
        publishedAt: entry.publishedAt,
        content: entry.content,
        relatedWriting: null,
      },
      images: [],
      uploads: [],
    });
    assert.equal(result.status, "unchanged");
    assert.deepEqual(deleted, []);
  } finally {
    restore();
  }
});

test("authoring Journal reads come from the latest GitHub source", async () => {
  const restore = installJournalFetch();
  const { env } = environment();
  try {
    assert.deepEqual(await authoringJournalCatalogData(env), { years: ["2026"] });
    const result = await authoringJournalYearData(env, year);
    assert.equal(result.entries[0].content, entry.content);
    assert.equal(result.monthly["2026-08"].note, "August note");
  } finally {
    restore();
  }
});
