import type { Env, MonthlyPlanState, WritingDraft } from "./types";
import { HttpError } from "./utils";

const draftKey = (id: string) => `private/writing/drafts/${id}.json`;
const monthlyPlanStateKey = "published/monthly-plans/state.json";
export const privateWritingAssetKey = (id: string, name: string) => `private/writing/assets/${id}/${name}`;
export const publishedWritingAssetKey = (id: string, name: string) => `published/writing/${id}/${name}`;

interface WritingDeletionLock {
  schemaVersion: 1;
  state: "deleting";
  id: string;
  lockedAt: string;
  draft?: WritingDraft | null;
}

interface WritingDeletionTombstone {
  schemaVersion: 1;
  state: "deleted";
  id: string;
  deletedAt: string;
}

type WritingDeletionMarker = WritingDeletionLock | WritingDeletionTombstone;

const WRITING_DELETION_LEASE_MS = 5 * 60 * 1000;

function isWritingDeletionLock(value: unknown): value is WritingDeletionLock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 && record.state === "deleting" && typeof record.id === "string";
}

function isWritingDeletionTombstone(value: unknown): value is WritingDeletionTombstone {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 && record.state === "deleted" && typeof record.id === "string";
}

function isWritingDeletionMarker(value: unknown): value is WritingDeletionMarker {
  return isWritingDeletionLock(value) || isWritingDeletionTombstone(value);
}

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const object = await env.CONTENT.get(key);
  if (!object) return null;
  try {
    return await object.json<T>();
  } catch {
    throw new HttpError(500, `Stored authoring data is invalid: ${key}`);
  }
}

export async function getDraftVersioned(env: Env, id: string): Promise<{ draft: WritingDraft; etag: string } | null> {
  const object = await env.CONTENT.get(draftKey(id));
  if (!object) return null;
  try {
    const value = await object.json<WritingDraft | WritingDeletionMarker>();
    if (isWritingDeletionLock(value)) {
      throw new HttpError(409, "This Writing is currently being deleted.");
    }
    if (isWritingDeletionTombstone(value)) return null;
    return { draft: value, etag: object.etag };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, `Stored authoring data is invalid: ${draftKey(id)}`);
  }
}

export async function putDraftConditional(
  env: Env,
  draft: WritingDraft,
  etag: string | null,
): Promise<boolean> {
  const result = await env.CONTENT.put(draftKey(draft.id), JSON.stringify(draft), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" },
  });
  return result !== null;
}

export async function listDrafts(env: Env): Promise<WritingDraft[]> {
  const drafts: WritingDraft[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.CONTENT.list({ prefix: "private/writing/drafts/", cursor, limit: 1000 });
    for (const object of page.objects) {
      const draft = await readJson<WritingDraft | WritingDeletionMarker>(env, object.key);
      if (draft && !isWritingDeletionMarker(draft)) drafts.push(draft);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return drafts;
}

export async function hasDrafts(env: Env): Promise<boolean> {
  let cursor: string | undefined;
  do {
    const page = await env.CONTENT.list({ prefix: "private/writing/drafts/", cursor, limit: 1000 });
    for (const object of page.objects) {
      const value = await readJson<WritingDraft | WritingDeletionMarker>(env, object.key);
      if (value && !isWritingDeletionMarker(value)) return true;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return false;
}

export async function lockWritingDeletion(
  env: Env,
  id: string,
): Promise<{ draft: WritingDraft | null; etag: string; resumed: boolean }> {
  const key = draftKey(id);
  const object = await env.CONTENT.get(key);
  let draft: WritingDraft | null = null;
  let resumed = false;
  if (object) {
    try {
      const value = await object.json<WritingDraft | WritingDeletionMarker>();
      if (isWritingDeletionLock(value)) {
        const lockedAt = Date.parse(value.lockedAt);
        if (Number.isFinite(lockedAt) && Date.now() - lockedAt < WRITING_DELETION_LEASE_MS) {
          throw new HttpError(409, "This Writing is already being deleted. Try again in a few minutes.");
        }
        draft = value.draft || null;
        resumed = true;
      } else if (isWritingDeletionTombstone(value)) {
        draft = null;
      } else {
        draft = value;
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, `Stored authoring data is invalid: ${key}`);
    }
  }
  const lock: WritingDeletionLock = {
    schemaVersion: 1,
    state: "deleting",
    id,
    lockedAt: new Date().toISOString(),
    draft,
  };
  const result = await env.CONTENT.put(key, JSON.stringify(lock), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
  });
  if (!result) throw new HttpError(409, "This Writing changed while deletion was starting. Try again.");
  return { draft, etag: result.etag, resumed };
}

async function completeWritingDeletion(env: Env, id: string, etag: string): Promise<void> {
  const tombstone: WritingDeletionTombstone = {
    schemaVersion: 1,
    state: "deleted",
    id,
    deletedAt: new Date().toISOString(),
  };
  const completed = await env.CONTENT.put(draftKey(id), JSON.stringify(tombstone), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    onlyIf: { etagMatches: etag },
  });
  if (!completed) throw new HttpError(409, "The Writing deletion lock changed unexpectedly.");
}

export async function releaseWritingDeletionLock(
  env: Env,
  id: string,
  etag: string,
  draft: WritingDraft | null,
): Promise<void> {
  if (draft) {
    const restored = await env.CONTENT.put(draftKey(id), JSON.stringify(draft), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      onlyIf: { etagMatches: etag },
    });
    if (!restored) throw new HttpError(409, "The Writing deletion lock changed unexpectedly.");
    return;
  }
  await completeWritingDeletion(env, id, etag);
}

export async function expiredWritingDeletionIds(env: Env): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.CONTENT.list({ prefix: "private/writing/drafts/", cursor, limit: 1000 });
    for (const object of page.objects) {
      const value = await readJson<WritingDraft | WritingDeletionMarker>(env, object.key);
      if (!value || !isWritingDeletionLock(value)) continue;
      const lockedAt = Date.parse(value.lockedAt);
      if (!Number.isFinite(lockedAt) || Date.now() - lockedAt >= WRITING_DELETION_LEASE_MS) ids.push(value.id);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

export async function getMonthlyPlanStateVersioned(
  env: Env,
): Promise<{ state: MonthlyPlanState; etag: string } | null> {
  const object = await env.CONTENT.get(monthlyPlanStateKey);
  if (!object) return null;
  try {
    return { state: await object.json<MonthlyPlanState>(), etag: object.etag };
  } catch {
    throw new HttpError(500, "Stored Monthly Plan data is invalid.");
  }
}

export async function putMonthlyPlanStateConditional(
  env: Env,
  state: MonthlyPlanState,
  etag: string | null,
): Promise<boolean> {
  const value = JSON.stringify(state);
  const result = await env.CONTENT.put(monthlyPlanStateKey, value, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" },
  });
  if (!result) return false;
  const timestamp = state.updatedAt.replace(/[^0-9A-Za-z.-]/g, "-");
  const historyKey = `private/monthly-plans/history/${timestamp}-${state.revision}.json`;
  try {
    await env.CONTENT.put(historyKey, value, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      onlyIf: { etagDoesNotMatch: "*" },
    });
  } catch (error) {
    console.warn("Monthly Plan state was saved, but its recovery snapshot was deferred", error);
  }
  return true;
}

async function deletePrefix(env: Env, prefix: string): Promise<void> {
  while (true) {
    const page = await env.CONTENT.list({ prefix, limit: 1000 });
    if (!page.objects.length) return;
    if (page.objects.length) await env.CONTENT.delete(page.objects.map((object) => object.key));
  }
}

export async function deleteWritingObjects(env: Env, id: string, lockEtag: string): Promise<boolean> {
  // Public media is intentionally retained: its responses advertise a
  // one-year immutable cache lifetime, so deleting it earlier would break
  // already-cached article HTML. Private draft media has no such contract.
  try {
    await deletePrefix(env, `private/writing/assets/${id}/`);
  } catch (error) {
    console.warn(`Writing ${id} was deleted, but private media cleanup was deferred.`, error);
    // Make the completed request immediately eligible for the best-effort
    // recovery pass while preserving the draft and lock identity via CAS.
    try {
      const current = await env.CONTENT.get(draftKey(id));
      if (current?.etag === lockEtag) {
        const value = await current.json<WritingDeletionLock>();
        if (isWritingDeletionLock(value)) {
          await env.CONTENT.put(draftKey(id), JSON.stringify({ ...value, lockedAt: "1970-01-01T00:00:00.000Z" }), {
            httpMetadata: { contentType: "application/json; charset=utf-8" },
            onlyIf: { etagMatches: lockEtag },
          });
        }
      }
    } catch (markerError) {
      console.warn(`Writing ${id} cleanup recovery marker could not be renewed.`, markerError);
    }
    return true;
  }
  await completeWritingDeletion(env, id, lockEtag);
  return false;
}
