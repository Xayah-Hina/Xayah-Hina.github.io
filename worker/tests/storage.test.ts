import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteWritingObjects,
  expiredWritingDeletionIds,
  getDraftVersioned,
  lockWritingDeletion,
  putDraftConditional,
  releaseWritingDeletionLock,
} from "../src/storage.ts";
import { HttpError } from "../src/utils.ts";

const draft = {
  id: "20260715-090945",
  title: "Title",
  summary: "Summary",
  createdAt: "2026-07-15T09:09:45+08:00",
  updatedAt: "2026-07-15T09:09:45+08:00",
  status: "incomplete" as const,
  body: "## Notes\n",
  savedAt: "2026-08-01T00:00:00.000Z",
  sourceHash: "a".repeat(64),
};

function environment() {
  const values = new Map<string, { value: string; etag: string }>();
  const listedPrefixes: string[] = [];
  let failNextAssetList = false;
  let version = 0;
  const key = `private/writing/drafts/${draft.id}.json`;
  values.set(key, { value: JSON.stringify(draft), etag: "etag-0" });
  const object = (stored: { value: string; etag: string }) => ({
    etag: stored.etag,
    async json<T>() { return JSON.parse(stored.value) as T; },
  });
  const content = {
    async get(name: string) {
      const stored = values.get(name);
      return stored ? object(stored) : null;
    },
    async head(name: string) {
      const stored = values.get(name);
      return stored ? { etag: stored.etag } : null;
    },
    async put(name: string, value: unknown, options: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } } = {}) {
      const current = values.get(name);
      if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
      if (options.onlyIf?.etagDoesNotMatch === "*" && current) return null;
      version += 1;
      const stored = { value: String(value), etag: `etag-${version}` };
      values.set(name, stored);
      return { etag: stored.etag };
    },
    async delete(name: string | string[]) {
      for (const item of Array.isArray(name) ? name : [name]) values.delete(item);
    },
    async list(options: { prefix?: string } = {}) {
      listedPrefixes.push(options.prefix || "");
      if (failNextAssetList && options.prefix === `private/writing/assets/${draft.id}/`) {
        failNextAssetList = false;
        throw new Error("temporary R2 list failure");
      }
      return {
        objects: [...values.entries()]
          .filter(([name]) => name.startsWith(options.prefix || ""))
          .map(([name, value]) => ({ key: name, etag: value.etag })),
        truncated: false,
      };
    },
  };
  return {
    env: { CONTENT: content } as never,
    content,
    key,
    listedPrefixes,
    failPrivateAssetListOnce() { failNextAssetList = true; },
  };
}

test("a Writing deletion lock rejects stale saves and can restore the original draft", async () => {
  const { env } = environment();
  const lock = await lockWritingDeletion(env, draft.id);
  assert.deepEqual(lock.draft, draft);
  assert.equal(lock.resumed, false);
  assert.equal(await putDraftConditional(env, { ...draft, title: "Stale overwrite" }, "etag-0"), false);
  await assert.rejects(
    getDraftVersioned(env, draft.id),
    (error: unknown) => error instanceof HttpError && error.status === 409 && /deleted/i.test(error.message),
  );
  await releaseWritingDeletionLock(env, draft.id, lock.etag, lock.draft);
  assert.deepEqual((await getDraftVersioned(env, draft.id))?.draft, draft);
});

test("Writing deletion cleans private media without invalidating immutable public media", async () => {
  const { env, listedPrefixes } = environment();
  const lock = await lockWritingDeletion(env, draft.id);
  assert.equal(await deleteWritingObjects(env, draft.id, lock.etag), false);
  assert.deepEqual(listedPrefixes, [`private/writing/assets/${draft.id}/`]);
  assert.equal(await getDraftVersioned(env, draft.id), null);
});

test("an abandoned Writing deletion lease can be resumed without exposing its draft", async () => {
  const { env, content, key } = environment();
  const first = await lockWritingDeletion(env, draft.id);
  const object = await content.get(key);
  assert.ok(object);
  const value = await object.json<Record<string, unknown>>();
  const expired = await content.put(key, JSON.stringify({ ...value, lockedAt: "2020-01-01T00:00:00.000Z" }), {
    onlyIf: { etagMatches: first.etag },
  });
  assert.ok(expired);

  const resumed = await lockWritingDeletion(env, draft.id);
  assert.equal(resumed.resumed, true);
  assert.deepEqual(resumed.draft, draft);
  await assert.rejects(
    lockWritingDeletion(env, draft.id),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
});

test("an old deletion request cannot remove a renewed deletion lock", async () => {
  const { env, content, key } = environment();
  const first = await lockWritingDeletion(env, draft.id);
  const object = await content.get(key);
  assert.ok(object);
  const value = await object.json<Record<string, unknown>>();
  const expired = await content.put(key, JSON.stringify({ ...value, lockedAt: "2020-01-01T00:00:00.000Z" }), {
    onlyIf: { etagMatches: first.etag },
  });
  assert.ok(expired);
  await lockWritingDeletion(env, draft.id);

  await assert.rejects(
    releaseWritingDeletionLock(env, draft.id, first.etag, first.draft),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  await assert.rejects(getDraftVersioned(env, draft.id), (error: unknown) => error instanceof HttpError && error.status === 409);
});

test("failed private media cleanup remains recoverable and completes on retry", async () => {
  const { env, failPrivateAssetListOnce } = environment();
  const lock = await lockWritingDeletion(env, draft.id);
  failPrivateAssetListOnce();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await deleteWritingObjects(env, draft.id, lock.etag), true);
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(await expiredWritingDeletionIds(env), [draft.id]);
  const resumed = await lockWritingDeletion(env, draft.id);
  assert.equal(resumed.resumed, true);
  assert.equal(await deleteWritingObjects(env, draft.id, resumed.etag), false);
  assert.equal(await getDraftVersioned(env, draft.id), null);
});
