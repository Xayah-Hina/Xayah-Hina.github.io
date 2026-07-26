import { commitFiles, listPaths, readTextFile, workflowRunState } from "./github";
import {
  deleteWritingObjects,
  getDraftVersioned,
  hasDrafts,
  listDrafts,
  privateWritingAssetKey,
  publishedWritingAssetKey,
  putDraftConditional,
} from "./storage";
import type { Env, FileChange, SyncStatus, WritingDraft, WritingEntry } from "./types";
import {
  asRecord,
  HttpError,
  moduleSource,
  normalizeYears,
  requiredString,
  singaporeTimestamp,
  writingIdNow,
} from "./utils";

const WRITING_ID = /^\d{8}-\d{6}$/;
const SOURCE_HASH = /^[a-f0-9]{64}$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ASSET_NAME = /^([a-f0-9]{64})\.(jpg|jpeg|png|webp|gif|avif)$/;
const FRONT_MATTER_KEYS = ["id", "title", "summary", "createdAt", "updatedAt", "lang", "status"] as const;
const MAX_BODY = 2_000_000;
const MAX_IMAGE = 32 * 1024 * 1024;

type WritingStatus = WritingEntry["status"];

interface PublishedWriting {
  entry: WritingEntry;
  body: string;
  source: string;
}

interface ImageFormat {
  mime: string;
  extension: "jpg" | "png" | "webp" | "gif" | "avif";
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function savedAtNow(): string {
  return new Date().toISOString();
}

function validateId(value: unknown, year?: string): string {
  if (typeof value !== "string" || !WRITING_ID.test(value) || (year && value.slice(0, 4) !== year)) {
    throw new HttpError(400, "Writing id is invalid.");
  }
  return value;
}

function validateHash(value: unknown, label = "Writing revision"): string {
  if (typeof value !== "string" || !SOURCE_HASH.test(value)) throw new HttpError(400, `${label} is invalid.`);
  return value;
}

function validateTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return value;
}

function validateLanguage(value: unknown): string {
  const lang = requiredString(value, "Writing language", 35);
  if (!LANGUAGE.test(lang)) throw new HttpError(400, "Writing language is invalid.");
  return lang;
}

function validateStatus(value: unknown): WritingStatus {
  if (value !== "complete" && value !== "incomplete") throw new HttpError(400, "Writing status is invalid.");
  return value;
}

function validateMetadata(value: unknown, expectedId = ""): Omit<WritingEntry, "article"> {
  const record = asRecord(value, "Writing metadata is invalid.");
  const id = validateId(record.id);
  if (expectedId && id !== expectedId) throw new HttpError(400, `Writing id ${id} does not match its directory.`);
  const title = requiredString(record.title, "Writing title", 200);
  const summary = requiredString(record.summary, "Writing summary", 5000);
  const createdAt = validateTimestamp(record.createdAt, "Writing creation time");
  const updatedAt = validateTimestamp(record.updatedAt, "Writing update time");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new HttpError(400, "Writing update time precedes its creation time.");
  const expectedCreatedPrefix = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}`;
  if (!createdAt.startsWith(expectedCreatedPrefix)) throw new HttpError(400, "Writing creation time does not match its id.");
  const lang = validateLanguage(record.lang);
  const status = validateStatus(record.status);
  return { id, title, summary, createdAt, updatedAt, lang, status };
}

function normalizeBody(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Writing Markdown body is invalid.");
  const body = normalizeText(value).trim();
  if (!body || body.length > MAX_BODY) throw new HttpError(400, "Writing Markdown body is invalid or too long.");
  if (/^#\s+/m.test(body)) throw new HttpError(400, "Writing Markdown body must not contain an H1 heading.");
  return `${body}\n`;
}

function serializeWriting(entry: Omit<WritingEntry, "article">, body: string): string {
  const metadata = validateMetadata(entry, entry.id);
  const normalizedBody = normalizeBody(body);
  const frontMatter = FRONT_MATTER_KEYS
    .map((key) => `${key}: ${JSON.stringify(metadata[key])}`)
    .join("\n");
  return `---\n${frontMatter}\n---\n\n${normalizedBody}`;
}

function parseWritingSource(source: string, expectedId: string): { metadata: Omit<WritingEntry, "article">; body: string; source: string } {
  const normalized = normalizeText(source);
  const match = /^---\n([\s\S]*?)\n---\n(?:\n)?([\s\S]*)$/.exec(normalized);
  if (!match) throw new HttpError(502, `Writing ${expectedId} must start with strict front matter.`);
  const lines = match[1].split("\n");
  if (lines.length !== FRONT_MATTER_KEYS.length) throw new HttpError(502, `Writing ${expectedId} has invalid front matter.`);
  const raw: Record<string, unknown> = {};
  for (let index = 0; index < FRONT_MATTER_KEYS.length; index += 1) {
    const key = FRONT_MATTER_KEYS[index];
    const prefix = `${key}: `;
    if (!lines[index].startsWith(prefix)) throw new HttpError(502, `Writing ${expectedId} front matter is missing ${key} or is out of order.`);
    try {
      raw[key] = JSON.parse(lines[index].slice(prefix.length));
    } catch {
      throw new HttpError(502, `Writing ${expectedId} front matter field ${key} is invalid.`);
    }
  }
  let metadata: Omit<WritingEntry, "article">;
  try {
    metadata = validateMetadata(raw, expectedId);
  } catch (error) {
    if (error instanceof HttpError) throw new HttpError(502, error.message);
    throw error;
  }
  let body: string;
  try {
    body = normalizeBody(match[2]);
  } catch (error) {
    if (error instanceof HttpError) throw new HttpError(502, error.message);
    throw error;
  }
  return { metadata, body, source: serializeWriting(metadata, body) };
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function articleUrl(env: Env, id: string): string {
  return `${env.PUBLIC_SITE_ORIGIN.replace(/\/$/, "")}/writing/${id}/`;
}

function validateDraft(value: WritingDraft): WritingDraft {
  const metadata = validateMetadata(value, String(value.id || ""));
  const body = normalizeBody(value.body);
  const sourceHash = validateHash(value.sourceHash, "Stored Writing source hash");
  if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) {
    throw new HttpError(500, `Stored Writing draft ${metadata.id} has an invalid timestamp.`);
  }
  return { ...metadata, body, savedAt: value.savedAt, sourceHash };
}

async function allDrafts(env: Env): Promise<WritingDraft[]> {
  return (await listDrafts(env)).map(validateDraft);
}

async function publishedWriting(env: Env): Promise<PublishedWriting[]> {
  const paths = (await listPaths(env, "writing/"))
    .filter((path) => /^writing\/(\d{8}-\d{6})\/\1\.md$/.test(path))
    .sort();
  const articles = await Promise.all(paths.map(async (path) => {
    const id = path.split("/")[1];
    const raw = await readTextFile(env, path);
    if (raw === null) throw new HttpError(502, `Writing source ${path} is missing.`);
    const parsed = parseWritingSource(raw, id);
    const sourceHash = await sha256(parsed.source);
    return {
      ...parsed,
      entry: {
        ...parsed.metadata,
        article: { url: articleUrl(env, id), sourceHash },
      },
    };
  }));
  return articles.sort((left, right) => right.entry.id.localeCompare(left.entry.id));
}

function draftEntry(draft: WritingDraft, published?: WritingEntry): WritingEntry {
  return {
    id: draft.id,
    title: draft.title,
    summary: draft.summary,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    lang: draft.lang,
    status: draft.status,
    ...(published?.article ? { article: published.article } : {}),
  };
}

function mergedEntries(published: PublishedWriting[], drafts: WritingDraft[], year: string): WritingEntry[] {
  const entries = new Map(
    published
      .filter((article) => article.entry.id.startsWith(year))
      .map((article) => [article.entry.id, article.entry]),
  );
  for (const draft of drafts) {
    if (!draft.id.startsWith(year)) continue;
    entries.set(draft.id, draftEntry(draft, entries.get(draft.id)));
  }
  return [...entries.values()].sort((left, right) => right.id.localeCompare(left.id));
}

function isDraftPending(draft: WritingDraft, published?: WritingEntry): boolean {
  return draft.sourceHash !== published?.article?.sourceHash;
}

async function collection(
  env: Env,
  year: string,
  drafts?: WritingDraft[],
  published?: PublishedWriting[],
): Promise<{ years: string[]; entries: WritingEntry[]; pending: boolean }> {
  const draftValues = drafts || await allDrafts(env);
  const publicValues = published || await publishedWriting(env);
  const publishedById = new Map(publicValues.map((article) => [article.entry.id, article.entry]));
  const pending = draftValues.some((draft) => isDraftPending(draft, publishedById.get(draft.id)));
  return {
    years: normalizeYears([
      ...publicValues.map((article) => article.entry.id.slice(0, 4)),
      ...draftValues.map((draft) => draft.id.slice(0, 4)),
    ]),
    entries: mergedEntries(publicValues, draftValues, year),
    pending,
  };
}

function sync(env: Env, pending: boolean, message?: string): SyncStatus {
  return {
    enabled: true,
    state: pending ? "pending" : "synced",
    message: message || (pending ? "Draft saved privately in R2." : "Published Markdown loaded from GitHub."),
    branch: env.GITHUB_BRANCH,
    writingPending: pending,
  };
}

async function editorData(
  env: Env,
  draft: WritingDraft | null,
  publishedArticle: PublishedWriting | null,
  allDraftValues?: WritingDraft[],
  allPublishedValues?: PublishedWriting[],
) {
  const entry = draft
    ? draftEntry(draft, publishedArticle?.entry)
    : publishedArticle?.entry;
  if (!entry) throw new HttpError(404, "The Writing entry is no longer available.");
  const body = draft?.body || publishedArticle!.body;
  const pending = draft ? isDraftPending(draft, publishedArticle?.entry) : false;
  const values = await collection(env, entry.id.slice(0, 4), allDraftValues, allPublishedValues);
  return {
    year: entry.id.slice(0, 4),
    entry,
    body,
    savedAt: draft?.savedAt || null,
    years: values.years,
    entries: values.entries,
    sync: sync(env, pending),
  };
}

async function findWriting(
  env: Env,
  id: string,
): Promise<{ draftVersion: { draft: WritingDraft; etag: string } | null; publishedArticle: PublishedWriting | null; published: PublishedWriting[] }> {
  validateId(id);
  const [rawDraft, published] = await Promise.all([getDraftVersioned(env, id), publishedWriting(env)]);
  const draftVersion = rawDraft ? { draft: validateDraft(rawDraft.draft), etag: rawDraft.etag } : null;
  const publishedArticle = published.find((article) => article.entry.id === id) || null;
  if (!draftVersion && !publishedArticle) throw new HttpError(404, "The Writing entry is no longer available.");
  return { draftVersion, publishedArticle, published };
}

function referencedAssets(body: string): string[] {
  const names = new Set<string>();
  const image = /!\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
  for (const match of body.matchAll(image)) {
    const destination = match[1];
    const asset = /^\.\/([a-f0-9]{64}\.(?:jpe?g|png|webp|gif|avif))$/i.exec(destination);
    if (!asset) throw new HttpError(400, `Writing image ${destination} is not a content-addressed local image.`);
    const name = asset[1].toLowerCase();
    names.add(name);
  }
  return [...names].sort();
}

function imageFormat(bytes: Uint8Array, declaredMime: string): ImageFormat {
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  let detected: ImageFormat | null = null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detected = { mime: "image/jpeg", extension: "jpg" };
  } else if (
    bytes.length >= 8
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    detected = { mime: "image/png", extension: "png" };
  } else if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    detected = { mime: "image/webp", extension: "webp" };
  } else if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(text(0, 6))) {
    detected = { mime: "image/gif", extension: "gif" };
  } else if (bytes.length >= 16 && text(4, 8) === "ftyp") {
    const brands = [text(8, 12)];
    for (let offset = 16; offset + 4 <= Math.min(bytes.length, 64); offset += 4) brands.push(text(offset, offset + 4));
    if (brands.some((brand) => brand === "avif" || brand === "avis")) {
      detected = { mime: "image/avif", extension: "avif" };
    }
  }
  if (!detected || detected.mime !== declaredMime) throw new HttpError(400, "The uploaded file does not match its declared image format.");
  return detected;
}

async function copyReferencedAssets(env: Env, id: string, names: string[]): Promise<string[]> {
  const copied: string[] = [];
  try {
    for (const name of names) {
      const publicKey = publishedWritingAssetKey(id, name);
      if (await env.CONTENT.head(publicKey)) continue;
      const privateObject = await env.CONTENT.get(privateWritingAssetKey(id, name));
      if (!privateObject) throw new HttpError(409, `Referenced image ${name} has not been uploaded.`);
      const created = await env.CONTENT.put(publicKey, privateObject.body, {
        httpMetadata: privateObject.httpMetadata,
        customMetadata: { ...(privateObject.customMetadata || {}), source: "writing-publish" },
        onlyIf: { etagDoesNotMatch: "*" },
      });
      if (created) copied.push(publicKey);
    }
    return copied;
  } catch (error) {
    if (copied.length) await env.CONTENT.delete(copied);
    throw error;
  }
}

async function deleteObjectsExcept(env: Env, prefix: string, keep: Set<string>): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.CONTENT.list({ prefix, cursor, limit: 1000 });
    const stale = page.objects.filter((object) => !keep.has(object.key.slice(prefix.length))).map((object) => object.key);
    if (stale.length) await env.CONTENT.delete(stale);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function editorWritingCatalogData(env: Env) {
  const values = await collection(env, writingIdNow().slice(0, 4));
  return { years: values.years.map(Number) };
}

export async function editorWritingCatalog(env: Env): Promise<Response> {
  const values = await editorWritingCatalogData(env);
  return new Response(moduleSource(values), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function editorWritingYearData(env: Env, year: string) {
  if (!/^\d{4}$/.test(year)) throw new HttpError(404, "Writing year was not found.");
  const values = await collection(env, year);
  return values.entries;
}

export async function editorWritingYear(env: Env, year: string): Promise<Response> {
  return new Response(moduleSource(await editorWritingYearData(env, year)), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function openWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const found = await findWriting(env, id);
  return editorData(env, found.draftVersion?.draft || null, found.publishedArticle, undefined, found.published);
}

export async function createWriting(env: Env, payload: Record<string, unknown>) {
  const title = requiredString(payload.title, "Writing title", 200);
  const summary = requiredString(payload.summary, "Writing summary", 5000);
  const lang = validateLanguage(payload.lang);
  const status = validateStatus(payload.status);
  const id = writingIdNow();
  const existing = await findWriting(env, id).catch((error) => {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  });
  if (existing) throw new HttpError(409, "A Writing entry already exists for this second. Try again in a moment.");
  const timestamp = singaporeTimestamp();
  const metadata = { id, title, summary, createdAt: timestamp, updatedAt: timestamp, lang, status };
  const body = "## Notes\n\nStart writing here.\n";
  const sourceHash = await sha256(serializeWriting(metadata, body));
  const draft: WritingDraft = { ...metadata, body, savedAt: savedAtNow(), sourceHash };
  if (!(await putDraftConditional(env, draft, null))) {
    throw new HttpError(409, "A Writing entry already exists for this second. Try again in a moment.");
  }
  return editorData(env, draft, null);
}

export async function saveWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const found = await findWriting(env, id);
  const current = found.draftVersion;
  const baseSavedAt = payload.baseSavedAt;
  if (
    (current && (typeof baseSavedAt !== "string" || baseSavedAt !== current.draft.savedAt))
    || (!current && baseSavedAt !== null && baseSavedAt !== undefined)
  ) {
    throw new HttpError(409, "This Writing changed in another tab. Reload it before saving.");
  }
  const title = requiredString(payload.title, "Writing title", 200);
  const summary = requiredString(payload.summary, "Writing summary", 5000);
  const lang = validateLanguage(payload.lang);
  const status = validateStatus(payload.status);
  const body = normalizeBody(payload.body);
  const previous = current?.draft || found.publishedArticle?.entry;
  if (!previous) throw new HttpError(404, "The Writing entry is no longer available.");
  const metadata = {
    id,
    title,
    summary,
    createdAt: previous.createdAt,
    updatedAt: previous.updatedAt,
    lang,
    status,
  };
  const sourceHash = await sha256(serializeWriting(metadata, body));
  const draft: WritingDraft = {
    ...metadata,
    body,
    savedAt: savedAtNow(),
    sourceHash,
  };
  if (!(await putDraftConditional(env, draft, current?.etag || null))) {
    throw new HttpError(409, "This Writing changed in another tab. Reload it before saving.");
  }
  return editorData(env, draft, found.publishedArticle, undefined, found.published);
}

export async function uploadWritingAsset(env: Env, request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new HttpError(415, "Expected a multipart image upload.");
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_IMAGE + 1024 * 1024) throw new HttpError(413, "The uploaded image is too large.");
  const form = await request.formData();
  const id = validateId(form.get("id"));
  await findWriting(env, id);
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_IMAGE) {
    throw new HttpError(400, "Each image must be between 1 byte and 32 MiB.");
  }
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type)) {
    throw new HttpError(400, "Only JPEG, PNG, WebP, GIF, and AVIF images are supported.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = imageFormat(bytes, file.type);
  const name = `${await sha256(bytes)}.${format.extension}`;
  const privateKey = privateWritingAssetKey(id, name);
  const publicKey = publishedWritingAssetKey(id, name);
  if (!(await env.CONTENT.head(privateKey) || await env.CONTENT.head(publicKey))) {
    await env.CONTENT.put(privateKey, bytes, {
      httpMetadata: { contentType: format.mime },
      customMetadata: { sha256: name.slice(0, 64), originalName: file.name.slice(0, 500) },
      onlyIf: { etagDoesNotMatch: "*" },
    });
  }
  return {
    id,
    name,
  };
}

export async function previewWritingAsset(env: Env, idValue: string, nameValue: string): Promise<Response> {
  const id = validateId(idValue);
  const name = nameValue.toLowerCase();
  if (!ASSET_NAME.test(name)) throw new HttpError(404, "Writing image was not found.");
  const object = await env.CONTENT.get(privateWritingAssetKey(id, name))
    || await env.CONTENT.get(publishedWritingAssetKey(id, name));
  if (!object) throw new HttpError(404, "Writing image was not found.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

export async function publishWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const found = await findWriting(env, id);
  if (!found.draftVersion) throw new HttpError(400, "There are no private Writing changes to publish.");
  const draft = found.draftVersion.draft;
  if (!isDraftPending(draft, found.publishedArticle?.entry)) {
    throw new HttpError(400, "The current Writing is already published.");
  }
  const metadata = {
    id,
    title: draft.title,
    summary: draft.summary,
    createdAt: draft.createdAt,
    updatedAt: singaporeTimestamp(),
    lang: draft.lang,
    status: draft.status,
  };
  const source = serializeWriting(metadata, draft.body);
  const revision = await sha256(source);
  const assets = referencedAssets(draft.body);
  const copied = await copyReferencedAssets(env, id, assets);
  let commitSha: string;
  try {
    commitSha = await commitFiles(env, `Writing: publish ${id}`, [
      { path: `writing/${id}/${id}.md`, content: source },
    ]);
  } catch (error) {
    if (copied.length) await env.CONTENT.delete(copied);
    throw error;
  }

  const publishedEntry: WritingEntry = {
    ...metadata,
    article: { url: articleUrl(env, id), sourceHash: revision },
  };
  const syncedDraft: WritingDraft = {
    ...metadata,
    body: draft.body,
    savedAt: savedAtNow(),
    sourceHash: revision,
  };
  const synchronized = await putDraftConditional(env, syncedDraft, found.draftVersion.etag);
  const responseDraft = synchronized
    ? syncedDraft
    : validateDraft((await getDraftVersioned(env, id))?.draft || syncedDraft);
  const response = await editorData(env, responseDraft, { entry: publishedEntry, body: draft.body, source });
  return {
    ...response,
    commitSha,
    revision,
    sync: sync(env, !synchronized, synchronized
      ? "Committed Markdown to GitHub. Waiting for Pages."
      : "Committed Markdown, but a newer private draft exists in another tab."),
  };
}

export async function writingDeploymentStatus(env: Env, payload: Record<string, unknown>) {
  const id = validateId(payload.id);
  const revision = validateHash(payload.revision);
  const commitSha = requiredString(payload.commitSha, "GitHub commit", 64);
  if (!/^[a-f0-9]{40,64}$/.test(commitSha)) throw new HttpError(400, "GitHub commit is invalid.");
  try {
    const response = await fetch(`${articleUrl(env, id)}?revision=${revision}&t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (response.ok) {
      const html = await response.text();
      const liveRevision = /<meta\s+name=["']x-writing-revision["']\s+content=["']([a-f0-9]{64})["']/i.exec(html)?.[1];
      if (liveRevision === revision) {
        try {
          const published = await publishedWriting(env);
          const article = published.find((candidate) => candidate.entry.id === id);
          if (article?.entry.article?.sourceHash === revision) {
            const liveAssets = new Set(referencedAssets(article.body));
            const currentDraft = await getDraftVersioned(env, id);
            const privateKeep = new Set<string>();
            if (currentDraft) {
              const draft = validateDraft(currentDraft.draft);
              if (draft.sourceHash !== revision) {
                for (const name of referencedAssets(draft.body)) privateKeep.add(name);
              }
            }
            await Promise.all([
              deleteObjectsExcept(env, `private/writing/assets/${id}/`, privateKeep),
              deleteObjectsExcept(env, `published/writing/${id}/`, liveAssets),
            ]);
          }
        } catch (error) {
          console.warn("The Writing page is live, but stale media cleanup was deferred", error);
        }
        return { state: "live", revision, message: "The public article is live." };
      }
    }
  } catch (error) {
    console.warn("Could not inspect the public Writing revision", error);
  }
  const workflow = await workflowRunState(env, "pages.yml", commitSha);
  if (workflow === "failed") return { state: "failed", revision, message: "GitHub Pages reported a failed deployment." };
  return {
    state: workflow,
    revision,
    message: workflow === "queued" ? "The Pages deployment is queued." : "The Pages deployment is in progress.",
  };
}

export async function deleteWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const [draftVersion, paths] = await Promise.all([
    getDraftVersioned(env, id),
    listPaths(env, `writing/${id}/`),
  ]);
  const tracked = paths.filter((path) => path.startsWith(`writing/${id}/`));
  if (!draftVersion && !tracked.length) throw new HttpError(404, "The Writing entry is no longer available.");
  let commitSha: string | null = null;
  if (tracked.length) {
    const changes: FileChange[] = tracked.map((path) => ({ path, content: null }));
    commitSha = await commitFiles(env, `Writing: delete ${id}`, changes);
  }
  await deleteWritingObjects(env, id);
  const values = await collection(env, year);
  return {
    year,
    entries: values.entries,
    years: values.years,
    commitSha,
    sync: sync(env, values.pending, "Writing deleted from GitHub and R2."),
  };
}

export async function publishedWritingById(env: Env, idValue: string): Promise<WritingEntry | null> {
  const id = validateId(idValue);
  return (await publishedWriting(env)).find((article) => article.entry.id === id)?.entry || null;
}

export async function pendingWriting(env: Env): Promise<boolean> {
  if (!(await hasDrafts(env))) return false;
  const values = await collection(env, writingIdNow().slice(0, 4));
  return values.pending;
}
