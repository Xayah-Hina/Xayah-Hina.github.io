import type { Env, WritingDraft } from "./types";
import { HttpError } from "./utils";

export const draftKey = (id: string) => `private/writing/drafts/${id}.json`;
export const privateWritingAssetKey = (id: string, name: string) => `private/writing/assets/${id}/${name}`;
export const publishedWritingAssetKey = (id: string, name: string) => `published/writing/${id}/${name}`;

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const object = await env.CONTENT.get(key);
  if (!object) return null;
  try {
    return await object.json<T>();
  } catch {
    throw new HttpError(500, `Stored editor data is invalid: ${key}`);
  }
}

export async function getDraftVersioned(env: Env, id: string): Promise<{ draft: WritingDraft; etag: string } | null> {
  const object = await env.CONTENT.get(draftKey(id));
  if (!object) return null;
  try {
    return { draft: await object.json<WritingDraft>(), etag: object.etag };
  } catch {
    throw new HttpError(500, `Stored editor data is invalid: ${draftKey(id)}`);
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
      const draft = await readJson<WritingDraft>(env, object.key);
      if (draft) drafts.push(draft);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return drafts;
}

export async function hasDrafts(env: Env): Promise<boolean> {
  const result = await env.CONTENT.list({ prefix: "private/writing/drafts/", limit: 1 });
  return result.objects.length > 0;
}

export async function deletePrefix(env: Env, prefix: string): Promise<void> {
  while (true) {
    const page = await env.CONTENT.list({ prefix, limit: 1000 });
    if (!page.objects.length) return;
    if (page.objects.length) await env.CONTENT.delete(page.objects.map((object) => object.key));
  }
}

export async function deleteWritingObjects(env: Env, id: string): Promise<void> {
  await env.CONTENT.delete([draftKey(id), `private/writing/current/${id}.json`]);
  await Promise.all([
    deletePrefix(env, `private/writing/builds/${id}/`),
    deletePrefix(env, `private/writing/previews/${id}/`),
    deletePrefix(env, `private/writing/assets/${id}/`),
    deletePrefix(env, `published/writing/${id}/`),
  ]);
}
