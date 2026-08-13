import assert from "node:assert/strict";
import test from "node:test";
import {
  dictionaryStatus,
  openDictionary,
  publishDictionary,
  saveDictionary,
} from "../src/dictionary.ts";
import { HttpError } from "../src/utils.ts";

interface Entry {
  entryId: string;
  canonicalKey: string;
  word: string;
  shard: number;
}

interface StoredObject {
  value: string;
  etag: string;
}

const entry: Entry = {
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

function personal(entryId: string, summary = "") {
  return {
    schemaVersion: 1,
    entryId,
    summary,
    usageNotes: "",
    confusionNotes: "",
    examples: [],
    createdAt: "2026-08-13T10:00:00+08:00",
    updatedAt: "2026-08-13T10:00:00+08:00",
  };
}

function personalPath(value: Entry): string {
  return `personal/${value.canonicalKey.slice(0, 2)}/${value.canonicalKey}.json`;
}

function draftKey(value: Entry): string {
  return `private/dictionary/drafts/${encodeURIComponent(value.entryId)}.json`;
}

function draft(value: Entry, summary: string, synced = false) {
  return {
    schemaVersion: 1,
    entry: value,
    path: personalPath(value),
    personal: personal(value.entryId, summary),
    savedAt: "2026-08-13T10:00:00+08:00",
    ...(synced ? { syncedAt: "2026-08-13T10:01:00+08:00" } : {}),
  };
}

function memoryBucket() {
  const objects = new Map<string, StoredObject>();
  const puts: Array<{ key: string; value: string; options: Record<string, unknown> }> = [];
  const deletes: Array<string | string[]> = [];
  let revision = 0;
  let beforePut: (() => void) | null = null;

  function seed(key: string, value: unknown): string {
    const etag = `etag-${++revision}`;
    objects.set(key, { value: JSON.stringify(value), etag });
    return etag;
  }

  const bucket = {
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        etag: object.etag,
        async json() {
          return JSON.parse(object.value);
        },
      };
    },
    async put(
      key: string,
      value: unknown,
      options: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } } = {},
    ) {
      puts.push({ key, value: String(value), options });
      const hook = beforePut;
      beforePut = null;
      hook?.();
      const current = objects.get(key);
      if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
      if (options.onlyIf?.etagDoesNotMatch === "*" && current) return null;
      const etag = `etag-${++revision}`;
      objects.set(key, { value: String(value), etag });
      return { etag };
    },
    async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
      const prefix = options.prefix || "";
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const offset = Number(options.cursor || "0");
      const limit = options.limit || 1000;
      const selected = keys.slice(offset, offset + limit);
      const next = offset + selected.length;
      return {
        objects: selected.map((key) => ({ key, etag: objects.get(key)!.etag })),
        truncated: next < keys.length,
        cursor: next < keys.length ? String(next) : undefined,
      };
    },
    async delete(keys: string | string[]) {
      deletes.push(keys);
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };

  return {
    bucket,
    objects,
    puts,
    deletes,
    seed,
    interceptNextPut(callback: () => void) {
      beforePut = callback;
    },
    stored(key: string) {
      const object = objects.get(key);
      return object ? JSON.parse(object.value) : null;
    },
  };
}

function environment(content: ReturnType<typeof memoryBucket>["bucket"]) {
  return {
    CONTENT: content,
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

function installFetch(
  entries: Entry[],
  published = new Map<string, string>(),
  afterCommit?: () => void,
  heads = ["parent-sha"],
): () => void {
  const original = globalThis.fetch;
  let headIndex = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    if (url.origin === "https://dictionary.xayah.me") {
      const shard = Number(url.pathname.match(/\/([0-9]{4})\.json$/)?.[1]);
      return response(entries.filter((candidate) => candidate.shard === shard));
    }
    const contents = "/repos/owner/dictionary/contents/";
    if (url.pathname.startsWith(contents)) {
      const path = url.pathname.slice(contents.length).split("/").map(decodeURIComponent).join("/");
      const source = published.get(path);
      return source === undefined
        ? response({ message: "Not Found" }, 404)
        : response({ type: "file", encoding: "base64", content: Buffer.from(source).toString("base64") });
    }
    if (method === "GET" && url.pathname.includes("/git/ref/heads/")) {
      const sha = heads[Math.min(headIndex++, heads.length - 1)];
      return response({ object: { sha } });
    }
    if (method === "GET" && url.pathname.endsWith("/git/commits/parent-sha")) {
      return response({ sha: "parent-sha", tree: { sha: "parent-tree" } });
    }
    if (method === "POST" && url.pathname.endsWith("/git/blobs")) {
      return response({ sha: "blob-sha" }, 201);
    }
    if (method === "POST" && url.pathname.endsWith("/git/trees")) {
      return response({ sha: "tree-sha" }, 201);
    }
    if (method === "POST" && url.pathname.endsWith("/git/commits")) {
      return response({ sha: "commit-sha" }, 201);
    }
    if (method === "PATCH" && url.pathname.includes("/git/refs/heads/")) {
      afterCommit?.();
      return response({});
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

test("Dictionary reads data and Personal Knowledge from the standalone site and repository", async () => {
  const content = memoryBucket();
  const restore = installFetch([entry]);
  try {
    const result = await openDictionary(environment(content.bucket), {
      entryId: entry.entryId,
      shard: entry.shard,
    });
    assert.equal(result.entryId, entry.entryId);
    assert.equal(result.sync.branch, "master");
    assert.equal(result.unpublished, false);
  } finally {
    restore();
  }
});

test("Dictionary saves use ETag CAS and report a lost update as 409", async () => {
  const content = memoryBucket();
  const key = draftKey(entry);
  const originalEtag = content.seed(key, draft(entry, "original draft"));
  content.interceptNextPut(() => {
    content.seed(key, draft(entry, "concurrent draft"));
  });
  const restore = installFetch([entry]);
  try {
    await assert.rejects(
      saveDictionary(environment(content.bucket), {
        entryId: entry.entryId,
        shard: entry.shard,
        personal: { summary: "requested change" },
      }),
      (error: unknown) => error instanceof HttpError && error.status === 409,
    );
    assert.deepEqual(content.puts[0].options.onlyIf, { etagMatches: originalEtag });
    assert.equal(content.stored(key).personal.summary, "concurrent draft");
    assert.equal(content.deletes.length, 0);
  } finally {
    restore();
  }
});

test("Dictionary reverts use a conditional synced marker instead of deleting", async () => {
  const content = memoryBucket();
  const key = draftKey(entry);
  const originalEtag = content.seed(key, draft(entry, "private change"));
  const publishedPersonal = personal(entry.entryId, "published content");
  const published = new Map([[personalPath(entry), `${JSON.stringify(publishedPersonal, null, 2)}\n`]]);
  const restore = installFetch([entry], published);
  try {
    const result = await saveDictionary(environment(content.bucket), {
      entryId: entry.entryId,
      shard: entry.shard,
      personal: { summary: "published content" },
    });
    assert.equal(result.status, "reverted");
    assert.equal(result.unpublished, false);
    assert.deepEqual(content.puts[0].options.onlyIf, { etagMatches: originalEtag });
    assert.equal(content.stored(key).personal.summary, "published content");
    assert.equal(typeof content.stored(key).syncedAt, "string");
    assert.equal(content.deletes.length, 0);
  } finally {
    restore();
  }
});

test("Dictionary creates use create-only CAS and synced markers are not pending", async () => {
  const content = memoryBucket();
  const syncedEntry = { entryId: "entry-synced", canonicalKey: "synced", word: "synced", shard: 7 };
  content.seed(draftKey(syncedEntry), draft(syncedEntry, "already published", true));
  const restore = installFetch([entry, syncedEntry]);
  try {
    const result = await saveDictionary(environment(content.bucket), {
      entryId: entry.entryId,
      shard: entry.shard,
      personal: { summary: "new draft" },
    });
    assert.equal(result.unpublished, true);
    assert.deepEqual(content.puts[0].options.onlyIf, { etagDoesNotMatch: "*" });
    assert.deepEqual(await dictionaryStatus(environment(content.bucket)), { pending: true, pendingCount: 1 });
  } finally {
    restore();
  }
});

test("Dictionary checks the 500-draft limit before creation but still edits existing drafts", async () => {
  const content = memoryBucket();
  const entries = Array.from({ length: 500 }, (_, index): Entry => ({
    entryId: `entry-${index}`,
    canonicalKey: `word${index}`,
    word: `word${index}`,
    shard: 7,
  }));
  for (const candidate of entries) content.seed(draftKey(candidate), draft(candidate, `draft ${candidate.entryId}`));
  const newEntry = { entryId: "entry-new", canonicalKey: "newword", word: "newword", shard: 7 };
  const restore = installFetch([...entries, newEntry]);
  try {
    await assert.rejects(
      saveDictionary(environment(content.bucket), {
        entryId: newEntry.entryId,
        shard: newEntry.shard,
        personal: { summary: "must not be written" },
      }),
      (error: unknown) => error instanceof HttpError && error.status === 409,
    );
    assert.equal(content.puts.length, 0);
    assert.equal(content.objects.has(draftKey(newEntry)), false);

    const edited = await saveDictionary(environment(content.bucket), {
      entryId: entries[0].entryId,
      shard: entries[0].shard,
      personal: { summary: "edited at the limit" },
    });
    assert.equal(edited.status, "saved");
    assert.equal(edited.sync.dictionaryPendingCount, 500);
  } finally {
    restore();
  }
});

test("Dictionary publishes legacy overflow drafts and replaces them with synced markers", async () => {
  const content = memoryBucket();
  const entries = Array.from({ length: 501 }, (_, index): Entry => ({
    entryId: `overflow-${index}`,
    canonicalKey: `overflow${index}`,
    word: `overflow${index}`,
    shard: 8,
  }));
  const published = new Map<string, string>();
  for (const candidate of entries) {
    const storedDraft = draft(candidate, `draft ${candidate.entryId}`);
    content.seed(draftKey(candidate), storedDraft);
    published.set(personalPath(candidate), `${JSON.stringify(storedDraft.personal, null, 2)}\n`);
  }
  const restore = installFetch(entries, published);
  try {
    const result = await publishDictionary(environment(content.bucket), {});
    assert.equal(result.status, "unchanged");
    assert.equal(result.publishedEntryIds.length, 501);
    assert.equal(result.sync.dictionaryPendingCount, 0);
    assert.equal(content.deletes.length, 0);
    assert.equal([...content.objects.keys()].every((key) => Boolean(content.stored(key).syncedAt)), true);
  } finally {
    restore();
  }
});

test("Dictionary publish rejects a changed repository head before committing", async () => {
  const content = memoryBucket();
  const key = draftKey(entry);
  content.seed(key, draft(entry, "private change"));
  const publishedBefore = personal(entry.entryId, "published before");
  const published = new Map([[personalPath(entry), `${JSON.stringify(publishedBefore, null, 2)}\n`]]);
  const restore = installFetch([entry], published, undefined, ["snapshot-head", "newer-head"]);
  try {
    await assert.rejects(
      publishDictionary(environment(content.bucket), {}),
      (error: unknown) => error instanceof HttpError && error.status === 409,
    );
    assert.equal(content.puts.length, 0);
    assert.equal(content.stored(key).personal.summary, "private change");
    assert.equal("syncedAt" in content.stored(key), false);
  } finally {
    restore();
  }
});

test("Dictionary publish never overwrites a newer draft saved after its read", async () => {
  const content = memoryBucket();
  const key = draftKey(entry);
  const publishedBefore = personal(entry.entryId, "published before");
  const publishing = draft(entry, "publishing now");
  const newer = draft(entry, "newer concurrent draft");
  const published = new Map([[personalPath(entry), `${JSON.stringify(publishedBefore, null, 2)}\n`]]);
  const originalEtag = content.seed(key, publishing);
  const restore = installFetch([entry], published, () => {
    published.set(personalPath(entry), `${JSON.stringify(publishing.personal, null, 2)}\n`);
    content.seed(key, newer);
  });
  try {
    const result = await publishDictionary(environment(content.bucket), {});
    assert.equal(result.status, "published");
    assert.equal(result.sync.dictionaryPendingCount, 1);
    assert.deepEqual(content.puts[0].options.onlyIf, { etagMatches: originalEtag });
    assert.equal(content.stored(key).personal.summary, "newer concurrent draft");
    assert.equal("syncedAt" in content.stored(key), false);
    assert.equal(content.deletes.length, 0);
  } finally {
    restore();
  }
});

test("Dictionary publish reactivates a stale concurrent revert marker", async () => {
  const content = memoryBucket();
  const key = draftKey(entry);
  const publishedBefore = personal(entry.entryId, "published before");
  const publishing = draft(entry, "publishing now");
  const staleRevert = draft(entry, "published before", true);
  const published = new Map([[personalPath(entry), `${JSON.stringify(publishedBefore, null, 2)}\n`]]);
  content.seed(key, publishing);
  const restore = installFetch([entry], published, () => {
    published.set(personalPath(entry), `${JSON.stringify(publishing.personal, null, 2)}\n`);
    content.seed(key, staleRevert);
  });
  try {
    const result = await publishDictionary(environment(content.bucket), {});
    assert.equal(result.sync.dictionaryPendingCount, 1);
    assert.equal(content.stored(key).personal.summary, "published before");
    assert.equal("syncedAt" in content.stored(key), false);
  } finally {
    restore();
  }
});
