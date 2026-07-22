import { commitFiles, dispatchWorkflow, listPaths, readDataModule, readTextFile } from "./github";
import {
  deleteDraft,
  deleteBuild,
  deletePrefix,
  deleteWritingObjects,
  getBuild,
  getDraft,
  hasDrafts,
  listDrafts,
  previewKey,
  putBuild,
  putDraft,
} from "./storage";
import type { BuildStatus, Env, FileChange, SyncStatus, WritingDraft, WritingEntry, WritingPdf } from "./types";
import {
  asRecord,
  HttpError,
  jsonResponse,
  moduleSource,
  normalizeYears,
  randomHex,
  requiredString,
  singaporeTimestamp,
  writingIdNow,
} from "./utils";
import { writingSourceTemplate } from "./writing-template";

const WRITING_ID = /^\d{8}-\d{6}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const COMPILER = "Tectonic 0.16.9";
const BUILD_FINGERPRINT = "writing-build-v1|tectonic-0.16.9";

interface WritingAsset {
  name: string;
  url: string;
  sha256: string;
}

type WritingAssetManifest = Record<string, WritingAsset[]>;

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function validateId(value: unknown, year?: string): string {
  if (typeof value !== "string" || !WRITING_ID.test(value) || (year && value.slice(0, 4) !== year)) {
    throw new HttpError(400, "Writing id is invalid.");
  }
  return value;
}

function validateSourceHash(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new HttpError(400, "Writing source hash is invalid.");
  return value;
}

function validatePdf(value: unknown, id: string): WritingPdf | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value, `Writing ${id} has invalid PDF metadata.`);
  const sourceHash = validateSourceHash(record.sourceHash);
  const compiler = requiredString(record.compiler, "Writing PDF compiler", 100);
  const url = requiredString(record.url, "Writing PDF URL", 500);
  const expected = `https://media.xayah.me/writing/${id}/${sourceHash}.pdf`;
  if (url !== expected || compiler !== COMPILER) throw new HttpError(502, `Writing ${id} has invalid PDF metadata.`);
  return { url, sourceHash, compiler };
}

function validateEntry(value: unknown, year: string): WritingEntry {
  const record = asRecord(value, `Writing ${year} contains an invalid entry.`);
  const id = validateId(record.id, year);
  const title = requiredString(record.title, "Writing title", 200);
  const summary = requiredString(record.summary ?? "", "Writing summary", 5000, true);
  const pdf = validatePdf(record.pdf, id);
  return { id, title, ...(summary ? { summary } : {}), ...(pdf ? { pdf } : {}) };
}

function validateEntries(value: unknown, year: string): WritingEntry[] {
  if (!Array.isArray(value)) throw new HttpError(502, `writing/${year}.js must export an array.`);
  const ids = new Set<string>();
  const entries = value.map((item) => validateEntry(item, year));
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new HttpError(502, `writing/${year}.js contains duplicate ids.`);
    ids.add(entry.id);
  }
  return entries.sort((left, right) => right.id.localeCompare(left.id));
}

function validateDraft(value: WritingDraft): WritingDraft {
  const entry = validateEntry(value, String(value.id || "").slice(0, 4));
  if (typeof value.source !== "string" || !value.source.trim() || value.source.length > 2_000_000) {
    throw new HttpError(500, `Stored Writing draft ${entry.id} has invalid source.`);
  }
  const sourceHash = validateSourceHash(value.sourceHash);
  if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) {
    throw new HttpError(500, `Stored Writing draft ${entry.id} has an invalid timestamp.`);
  }
  return { ...entry, source: value.source, sourceHash, savedAt: value.savedAt };
}

function validateAssetManifest(value: unknown, env: Env): WritingAssetManifest {
  const record = asRecord(value, "writing/assets.json must contain an object.");
  const manifest: WritingAssetManifest = {};
  for (const [id, rawAssets] of Object.entries(record)) {
    validateId(id);
    if (!Array.isArray(rawAssets)) throw new HttpError(502, `Writing asset list ${id} is invalid.`);
    const names = new Set<string>();
    manifest[id] = rawAssets.map((value) => {
      const asset = asRecord(value, `Writing asset ${id} is invalid.`);
      const name = requiredString(asset.name, "Writing asset name", 255);
      const url = requiredString(asset.url, "Writing asset URL", 500);
      const sha256 = validateSourceHash(asset.sha256);
      if (!/^[A-Za-z0-9._-]+$/.test(name) || names.has(name)) throw new HttpError(502, `Writing asset name ${id}/${name} is invalid.`);
      if (url !== `${env.MEDIA_ORIGIN}/writing/${id}/${name}`) throw new HttpError(502, `Writing asset URL ${id}/${name} is invalid.`);
      names.add(name);
      return { name, url, sha256 };
    });
  }
  return manifest;
}

async function assetManifest(env: Env): Promise<WritingAssetManifest> {
  const source = await readTextFile(env, "writing/assets.json");
  if (!source) throw new HttpError(502, "writing/assets.json is missing.");
  try {
    return validateAssetManifest(JSON.parse(source), env);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "writing/assets.json is not valid JSON.");
  }
}

async function writingSourceHash(env: Env, id: string, source: string): Promise<string> {
  const assets = ((await assetManifest(env))[id] || [])
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
  const bibliography = normalizeText(await readTextFile(env, `writing/${id}/${id}.bib`, env.GITHUB_BRANCH, false) || "");
  const material = JSON.stringify({ build: BUILD_FINGERPRINT, source: normalizeText(source), bibliography, assets });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publishedPdfKey(id: string, sourceHash: string): string {
  return `published/writing/${id}/${sourceHash}.pdf`;
}

function currentPdfKey(id: string): string {
  return `private/writing/current/${id}.json`;
}

function publishedPdf(id: string, sourceHash: string, env: Env): WritingPdf {
  return {
    url: `${env.MEDIA_ORIGIN}/writing/${id}/${sourceHash}.pdf`,
    sourceHash,
    compiler: COMPILER,
  };
}

async function publishedYears(env: Env): Promise<string[]> {
  const catalog = await readDataModule<{ years?: unknown[] }>(env, "writing/catalog.js");
  if (!catalog || !Array.isArray(catalog.years)) throw new HttpError(502, "writing/catalog.js must contain a years array.");
  return normalizeYears(catalog.years);
}

async function publishedEntries(env: Env, year: string, required = true): Promise<WritingEntry[]> {
  const raw = await readDataModule<unknown>(env, `writing/${year}.js`, env.GITHUB_BRANCH, required);
  return raw === null ? [] : validateEntries(raw, year);
}

async function allDrafts(env: Env): Promise<WritingDraft[]> {
  return (await listDrafts(env)).map(validateDraft);
}

function draftEntry(draft: WritingDraft, published?: WritingEntry): WritingEntry {
  return {
    id: draft.id,
    title: draft.title,
    ...(draft.summary ? { summary: draft.summary } : {}),
    ...(published?.pdf ? { pdf: published.pdf } : {}),
  };
}

function mergedEntries(published: WritingEntry[], drafts: WritingDraft[], year: string): WritingEntry[] {
  const entries = new Map(published.map((entry) => [entry.id, entry]));
  for (const draft of drafts) {
    if (draft.id.slice(0, 4) !== year) continue;
    entries.set(draft.id, draftEntry(draft, entries.get(draft.id)));
  }
  return [...entries.values()].sort((left, right) => right.id.localeCompare(left.id));
}

async function collection(env: Env, year: string, drafts?: WritingDraft[]): Promise<{ years: string[]; entries: WritingEntry[] }> {
  const draftValues = drafts || await allDrafts(env);
  const publicYears = await publishedYears(env);
  const years = normalizeYears([...publicYears, ...draftValues.map((draft) => draft.id.slice(0, 4))]);
  const entries = mergedEntries(await publishedEntries(env, year, publicYears.includes(year)), draftValues, year);
  return { years, entries };
}

function sync(env: Env, state: SyncStatus["state"], message: string, writingPending: boolean): SyncStatus {
  return {
    enabled: true,
    state,
    message,
    branch: env.GITHUB_BRANCH,
    writingPending,
  };
}

async function findWriting(env: Env, year: string, id: string): Promise<{ entry: WritingEntry; draft: WritingDraft | null; published: WritingEntry | null }> {
  validateId(id, year);
  const draftValue = await getDraft(env, id);
  const draft = draftValue ? validateDraft(draftValue) : null;
  const years = await publishedYears(env);
  const published = years.includes(year)
    ? (await publishedEntries(env, year)).find((entry) => entry.id === id) || null
    : null;
  if (!draft && !published) throw new HttpError(404, "The Writing entry is no longer available.");
  return {
    entry: draft ? draftEntry(draft, published || undefined) : published!,
    draft,
    published,
  };
}

async function editorData(env: Env, year: string, entry: WritingEntry, source: string, sourceHash: string, pending: boolean) {
  const values = await collection(env, year);
  const preview = await env.CONTENT.head(previewKey(entry.id, sourceHash));
  const published = entry.pdf?.sourceHash === sourceHash
    ? await env.CONTENT.head(publishedPdfKey(entry.id, sourceHash))
    : null;
  const compiled = Boolean(preview || published);
  const pdfUrl = preview
    ? `/api/writing/preview/${entry.id}/${sourceHash}.pdf`
    : (published ? entry.pdf!.url : "");
  return {
    year,
    entry,
    source,
    sourceHash,
    compiled,
    pdfUrl,
    pdfExists: compiled,
    pdfVersion: sourceHash,
    ...values,
    sync: sync(env, pending ? "pending" : "ready", pending ? "Draft saved privately in R2." : "Published source loaded from GitHub.", pending),
  };
}

async function draftFromPayload(env: Env, payload: Record<string, unknown>): Promise<WritingDraft> {
  const year = requiredString(payload.year, "Writing year", 4);
  if (!/^\d{4}$/.test(year)) throw new HttpError(400, "Writing year is invalid.");
  const id = validateId(payload.id, year);
  const title = requiredString(payload.title, "Writing title", 200);
  const summary = requiredString(payload.summary ?? "", "Writing summary", 5000, true);
  const source = typeof payload.source === "string" ? normalizeText(payload.source).trimEnd() + "\n" : "";
  if (!source.trim() || source.length > 2_000_000) throw new HttpError(400, "Writing source is invalid or too long.");
  const sourceHash = await writingSourceHash(env, id, source);
  return { id, title, ...(summary ? { summary } : {}), source, sourceHash, savedAt: singaporeTimestamp() };
}

export async function editorWritingCatalog(env: Env): Promise<Response> {
  const drafts = await allDrafts(env);
  const years = normalizeYears([...(await publishedYears(env)), ...drafts.map((draft) => draft.id.slice(0, 4))]);
  return new Response(moduleSource({ years: years.map(Number) }), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function editorWritingYear(env: Env, year: string): Promise<Response> {
  if (!/^\d{4}$/.test(year)) throw new HttpError(404, "Writing year was not found.");
  const drafts = await allDrafts(env);
  const publicYears = await publishedYears(env);
  const entries = mergedEntries(await publishedEntries(env, year, publicYears.includes(year)), drafts, year);
  return new Response(moduleSource(entries), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function writingStatus(env: Env): Promise<{ years: string[]; pending: boolean }> {
  const drafts = await allDrafts(env);
  return {
    years: normalizeYears([...(await publishedYears(env)), ...drafts.map((draft) => draft.id.slice(0, 4))]),
    pending: drafts.length > 0,
  };
}

export async function openWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const found = await findWriting(env, year, id);
  const source = found.draft?.source || await readTextFile(env, `writing/${id}/${id}.tex`);
  if (!source) throw new HttpError(502, `Missing source file ${id}.tex.`);
  const sourceHash = found.draft?.sourceHash || await writingSourceHash(env, id, source);
  return editorData(env, year, found.entry, source, sourceHash, Boolean(found.draft));
}

export async function createWriting(env: Env, payload: Record<string, unknown>) {
  const title = requiredString(payload.title, "Writing title", 200);
  const summary = requiredString(payload.summary ?? "", "Writing summary", 5000, true);
  const id = writingIdNow();
  const year = id.slice(0, 4);
  const existing = (await collection(env, year)).entries.some((entry) => entry.id === id);
  if (existing || await getDraft(env, id)) throw new HttpError(409, "A Writing entry already exists for this second. Try again in a moment.");
  const source = writingSourceTemplate(id, title, summary);
  const draft: WritingDraft = {
    id,
    title,
    ...(summary ? { summary } : {}),
    source,
    sourceHash: await writingSourceHash(env, id, source),
    savedAt: singaporeTimestamp(),
  };
  await putDraft(env, draft);
  return editorData(env, year, validateEntry(draft, year), draft.source, draft.sourceHash, true);
}

export async function saveWriting(env: Env, payload: Record<string, unknown>) {
  const draft = await draftFromPayload(env, payload);
  const found = await findWriting(env, draft.id.slice(0, 4), draft.id);
  await putDraft(env, draft);
  return editorData(env, draft.id.slice(0, 4), draftEntry(draft, found.published || undefined), draft.source, draft.sourceHash, true);
}

export async function compileWriting(env: Env, payload: Record<string, unknown>) {
  const saved = await saveWriting(env, payload);
  const id = saved.entry.id as string;
  const sourceHash = saved.sourceHash as string;
  if (saved.compiled) {
    return {
      ...saved,
      compile: {
        pending: false,
        ok: true,
        reused: true,
        log: "The current source is unchanged; its existing PDF was reused from R2.",
      },
    };
  }
  const jobId = `${id}-${Date.now()}-${randomHex(4)}`;
  const status: BuildStatus = {
    id,
    jobId,
    sourceHash,
    state: "queued",
    log: "Compilation queued on GitHub Actions.",
    createdAt: singaporeTimestamp(),
  };
  await deletePrefix(env, `private/writing/builds/${id}/`);
  await putBuild(env, status);
  try {
    await dispatchWorkflow(env, "compile-writing.yml", { writing_id: id, job_id: jobId, source_hash: sourceHash });
    return { ...saved, compile: { pending: true, jobId, ok: null, log: status.log } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The compilation workflow could not be started.";
    status.state = "failed";
    status.log = message;
    status.finishedAt = singaporeTimestamp();
    await putBuild(env, status);
    return { ...saved, compile: { pending: false, jobId, ok: false, log: message } };
  }
}

export async function compilationStatus(env: Env, payload: Record<string, unknown>) {
  const id = validateId(payload.id);
  const jobId = requiredString(payload.jobId, "Compilation job", 160);
  const status = await getBuild(env, jobId);
  if (!status || status.id !== id) throw new HttpError(404, "The compilation job was not found.");
  const draftValue = await getDraft(env, id);
  if (!draftValue) throw new HttpError(404, "The Writing draft is no longer available.");
  const draft = validateDraft(draftValue);
  const found = await findWriting(env, id.slice(0, 4), id);
  const data = await editorData(env, id.slice(0, 4), draftEntry(draft, found.published || undefined), draft.source, draft.sourceHash, true);
  const pending = status.state === "queued" || status.state === "running";
  const current = status.sourceHash === draft.sourceHash;
  const result = {
    ...data,
    compile: {
      pending,
      jobId,
      ok: pending ? null : status.state === "succeeded" && current && data.compiled,
      log: current ? status.log : `${status.log}\n\nThe draft changed after this build started. Compile the current source again.`,
    },
  };
  if (!pending) await deleteBuild(env, jobId);
  return result;
}

async function updateCurrentPdf(env: Env, id: string, pdf: WritingPdf): Promise<void> {
  await env.CONTENT.put(currentPdfKey(id), JSON.stringify(pdf), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function cleanupPublishedPdfs(env: Env, id: string, keepHashes: Set<string>): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.CONTENT.list({ prefix: `published/writing/${id}/`, cursor, limit: 1000 });
    const stale = page.objects
      .filter((object) => object.key.endsWith(".pdf"))
      .filter((object) => !keepHashes.has(object.key.slice(object.key.lastIndexOf("/") + 1, -4)))
      .map((object) => object.key);
    if (stale.length) await env.CONTENT.delete(stale);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function publishWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const draftValue = await getDraft(env, id);
  if (!draftValue) throw new HttpError(400, "There are no unpublished changes to publish.");
  const draft = validateDraft(draftValue);
  const years = await publishedYears(env);
  const entries = await publishedEntries(env, year, years.includes(year));
  const previous = entries.find((candidate) => candidate.id === id) || null;
  const sourceHash = draft.sourceHash;
  const publicKey = publishedPdfKey(id, sourceHash);
  const preview = await env.CONTENT.get(previewKey(id, sourceHash));
  const existingPublic = await env.CONTENT.head(publicKey);
  if (!preview && !existingPublic) {
    throw new HttpError(409, "Compile the current source successfully before publishing.");
  }

  let uploaded = false;
  if (preview && !existingPublic) {
    await env.CONTENT.put(publicKey, preview.body, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { sourceHash, compiler: COMPILER },
    });
    uploaded = true;
  }
  const pdf = publishedPdf(id, sourceHash, env);
  const entry: WritingEntry = {
    id,
    title: draft.title,
    ...(draft.summary ? { summary: draft.summary } : {}),
    pdf,
  };
  const nextEntries = [...entries.filter((candidate) => candidate.id !== id), entry]
    .sort((left, right) => right.id.localeCompare(left.id));
  const nextYears = normalizeYears([...years, year]);
  try {
    await commitFiles(env, `Writing: publish ${id}`, [
      { path: `writing/${id}/${id}.tex`, content: draft.source },
      { path: `writing/${year}.js`, content: moduleSource(nextEntries) },
      { path: "writing/catalog.js", content: moduleSource({ years: nextYears.map(Number) }) },
    ]);
  } catch (error) {
    if (uploaded) await env.CONTENT.delete(publicKey);
    throw error;
  }
  await updateCurrentPdf(env, id, pdf);
  await deleteDraft(env, id);
  await deletePrefix(env, `private/writing/previews/${id}/`);
  const keepHashes = new Set([sourceHash]);
  if (previous?.pdf?.sourceHash) keepHashes.add(previous.pdf.sourceHash);
  try {
    await cleanupPublishedPdfs(env, id, keepHashes);
  } catch (error) {
    console.warn("Could not clean old Writing PDFs", error);
  }
  const data = await editorData(env, year, entry, draft.source, sourceHash, false);
  return {
    ...data,
    status: "published",
    sync: sync(env, "synced", "Published source metadata to GitHub and its PDF to R2.", false),
  };
}

export async function deleteWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const found = await findWriting(env, year, id);
  if (found.published) {
    const years = await publishedYears(env);
    const entries = await publishedEntries(env, year);
    const nextEntries = entries.filter((entry) => entry.id !== id);
    const nextYears = nextEntries.length > 0 ? years : years.filter((value) => value !== year);
    const directoryPaths = await listPaths(env, `writing/${id}/`);
    const manifest = await assetManifest(env);
    const changes: FileChange[] = directoryPaths.map((path) => ({ path, content: null }));
    changes.push({ path: `writing/${year}.js`, content: nextEntries.length ? moduleSource(nextEntries) : null });
    if (manifest[id]) {
      delete manifest[id];
      changes.push({ path: "writing/assets.json", content: `${JSON.stringify(manifest, null, 2)}\n` });
    }
    if (!nextEntries.length) changes.push({ path: "writing/catalog.js", content: moduleSource({ years: nextYears.map(Number) }) });
    await commitFiles(env, `Writing: delete ${id}`, changes);
  }
  await deleteWritingObjects(env, id);
  const values = await collection(env, year);
  return {
    year,
    ...values,
    status: "deleted",
    sync: sync(env, found.published ? "synced" : "unchanged", found.published ? "Deleted from GitHub and R2." : "Private draft deleted.", false),
  };
}

export async function previewWriting(env: Env, id: string, sourceHash: string): Promise<Response> {
  validateId(id);
  validateSourceHash(sourceHash);
  const object = await env.CONTENT.get(previewKey(id, sourceHash));
  if (!object) throw new HttpError(404, "No compiled preview is available for the current source.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/pdf");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", `inline; filename="${id}.pdf"`);
  return new Response(object.body, { headers });
}

export async function buildSource(env: Env, id: string, jobId: string, sourceHash: string): Promise<Response> {
  validateId(id);
  validateSourceHash(sourceHash);
  const status = await getBuild(env, jobId);
  if (!status || status.id !== id || status.sourceHash !== sourceHash || !["queued", "running"].includes(status.state)) {
    throw new HttpError(404, "The compilation job is unavailable.");
  }
  const draftValue = await getDraft(env, id);
  if (!draftValue) throw new HttpError(404, "The Writing draft is unavailable.");
  const draft = validateDraft(draftValue);
  if (draft.sourceHash !== sourceHash) {
    status.state = "failed";
    status.log = "The draft changed before compilation started. Compile the current source again.";
    status.finishedAt = singaporeTimestamp();
    await putBuild(env, status);
    throw new HttpError(409, status.log);
  }
  status.state = "running";
  status.log = "Tectonic is compiling this source revision on GitHub Actions.";
  await putBuild(env, status);
  return new Response(draft.source, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function completeBuild(env: Env, request: Request): Promise<Response> {
  const form = await request.formData();
  const id = validateId(form.get("id"));
  const jobId = requiredString(form.get("job"), "Compilation job", 160);
  const sourceHash = validateSourceHash(form.get("source_hash"));
  const status = await getBuild(env, jobId);
  if (!status || status.id !== id || status.sourceHash !== sourceHash || !["queued", "running"].includes(status.state)) {
    throw new HttpError(404, "The compilation job is unavailable.");
  }
  const ok = form.get("ok") === "true";
  const rawLog = typeof form.get("log") === "string" ? String(form.get("log")) : "";
  const log = rawLog.slice(-200_000) || (ok ? "Compilation completed successfully." : "Compilation failed without a log.");
  if (ok) {
    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || pdf.size < 5 || pdf.size > 50 * 1024 * 1024) {
      throw new HttpError(400, "The compiled PDF is missing or invalid.");
    }
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      throw new HttpError(400, "The compiled file is not a PDF.");
    }
    await env.CONTENT.put(previewKey(id, sourceHash), bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { sourceHash, compiler: COMPILER },
    });
  }
  status.state = ok ? "succeeded" : "failed";
  status.log = log;
  status.finishedAt = singaporeTimestamp();
  await putBuild(env, status);
  return jsonResponse({ ok: true, state: status.state });
}

export async function pendingWriting(env: Env): Promise<boolean> {
  return hasDrafts(env);
}
