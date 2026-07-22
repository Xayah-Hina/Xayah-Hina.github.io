import { commitFiles, dispatchWorkflow, listPaths, readDataModule, readTextFile } from "./github";
import {
  buildKey,
  deleteDraft,
  deleteWritingObjects,
  getBuild,
  getDraft,
  hasDrafts,
  listDrafts,
  previewKey,
  putBuild,
  putDraft,
} from "./storage";
import type { BuildStatus, Env, FileChange, SyncStatus, WritingDraft, WritingEntry } from "./types";
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

function validateId(value: unknown, year?: string): string {
  if (typeof value !== "string" || !WRITING_ID.test(value) || (year && value.slice(0, 4) !== year)) {
    throw new HttpError(400, "Writing id is invalid.");
  }
  return value;
}

function validateEntry(value: unknown, year: string): WritingEntry {
  const record = asRecord(value, `Writing ${year} contains an invalid entry.`);
  const id = validateId(record.id, year);
  const title = requiredString(record.title, "Writing title", 200);
  const summary = requiredString(record.summary ?? "", "Writing summary", 5000, true);
  return summary ? { id, title, summary } : { id, title };
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
  if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) {
    throw new HttpError(500, `Stored Writing draft ${entry.id} has an invalid timestamp.`);
  }
  return { ...entry, source: value.source, savedAt: value.savedAt };
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

function mergedEntries(published: WritingEntry[], drafts: WritingDraft[], year: string): WritingEntry[] {
  const entries = new Map(published.map((entry) => [entry.id, entry]));
  for (const draft of drafts) {
    if (draft.id.slice(0, 4) !== year) continue;
    const entry: WritingEntry = draft.summary
      ? { id: draft.id, title: draft.title, summary: draft.summary }
      : { id: draft.id, title: draft.title };
    entries.set(entry.id, entry);
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

async function findWriting(env: Env, year: string, id: string): Promise<{ entry: WritingEntry; draft: WritingDraft | null; published: boolean }> {
  validateId(id, year);
  const draftValue = await getDraft(env, id);
  const draft = draftValue ? validateDraft(draftValue) : null;
  const years = await publishedYears(env);
  const publicEntry = years.includes(year)
    ? (await publishedEntries(env, year)).find((entry) => entry.id === id) || null
    : null;
  if (!draft && !publicEntry) throw new HttpError(404, "The Writing entry is no longer available.");
  return {
    entry: draft ? validateEntry(draft, year) : publicEntry!,
    draft,
    published: Boolean(publicEntry),
  };
}

async function editorData(env: Env, year: string, entry: WritingEntry, source: string, pending: boolean) {
  const values = await collection(env, year);
  const preview = await env.CONTENT.head(previewKey(entry.id));
  let pdfExists = Boolean(preview);
  let pdfUrl = `/api/writing/preview/${entry.id}.pdf`;
  let pdfVersion = preview?.uploaded.getTime() || 0;
  if (!preview) {
    pdfUrl = `writing/${entry.id}/${entry.id}.pdf`;
    const response = await fetch(`${env.PUBLIC_SITE_ORIGIN}/${pdfUrl}`, { method: "HEAD" });
    pdfExists = response.ok;
    pdfVersion = response.ok ? Date.parse(response.headers.get("last-modified") || "") || 0 : 0;
  }
  return {
    year,
    entry,
    source,
    pdfUrl,
    pdfExists,
    pdfVersion,
    ...values,
    sync: sync(env, pending ? "pending" : "ready", pending ? "Draft saved privately in R2." : "Published source loaded from GitHub.", pending),
  };
}

function draftFromPayload(payload: Record<string, unknown>): WritingDraft {
  const year = requiredString(payload.year, "Writing year", 4);
  if (!/^\d{4}$/.test(year)) throw new HttpError(400, "Writing year is invalid.");
  const id = validateId(payload.id, year);
  const title = requiredString(payload.title, "Writing title", 200);
  const summary = requiredString(payload.summary ?? "", "Writing summary", 5000, true);
  const source = typeof payload.source === "string" ? payload.source.trimEnd() + "\n" : "";
  if (!source.trim() || source.length > 2_000_000) throw new HttpError(400, "Writing source is invalid or too long.");
  return { id, title, ...(summary ? { summary } : {}), source, savedAt: singaporeTimestamp() };
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
  return editorData(env, year, found.entry, source, Boolean(found.draft));
}

export async function createWriting(env: Env, payload: Record<string, unknown>) {
  const title = requiredString(payload.title, "Writing title", 200);
  const summary = requiredString(payload.summary ?? "", "Writing summary", 5000, true);
  const id = writingIdNow();
  const year = id.slice(0, 4);
  const existing = (await collection(env, year)).entries.some((entry) => entry.id === id);
  if (existing || await getDraft(env, id)) throw new HttpError(409, "A Writing entry already exists for this second. Try again in a moment.");
  const draft: WritingDraft = {
    id,
    title,
    ...(summary ? { summary } : {}),
    source: writingSourceTemplate(id, title, summary),
    savedAt: singaporeTimestamp(),
  };
  await putDraft(env, draft);
  return editorData(env, year, validateEntry(draft, year), draft.source, true);
}

export async function saveWriting(env: Env, payload: Record<string, unknown>) {
  const draft = draftFromPayload(payload);
  await findWriting(env, draft.id.slice(0, 4), draft.id);
  await putDraft(env, draft);
  return editorData(env, draft.id.slice(0, 4), validateEntry(draft, draft.id.slice(0, 4)), draft.source, true);
}

export async function compileWriting(env: Env, payload: Record<string, unknown>) {
  const saved = await saveWriting(env, payload);
  const id = saved.entry.id as string;
  const jobId = `${id}-${Date.now()}-${randomHex(4)}`;
  const status: BuildStatus = {
    id,
    jobId,
    state: "queued",
    log: "Compilation queued on GitHub Actions.",
    createdAt: singaporeTimestamp(),
  };
  await putBuild(env, status);
  try {
    await dispatchWorkflow(env, "compile-writing.yml", { writing_id: id, job_id: jobId });
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
  const draft = await getDraft(env, id);
  if (!draft) throw new HttpError(404, "The Writing draft is no longer available.");
  const data = await editorData(env, id.slice(0, 4), validateEntry(draft, id.slice(0, 4)), draft.source, true);
  const pending = status.state === "queued" || status.state === "running";
  return {
    ...data,
    compile: {
      pending,
      jobId,
      ok: pending ? null : status.state === "succeeded",
      log: status.log,
    },
  };
}

export async function publishWriting(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Writing year", 4);
  const id = validateId(payload.id, year);
  const draftValue = await getDraft(env, id);
  if (!draftValue) throw new HttpError(400, "There are no unpublished changes to publish.");
  const draft = validateDraft(draftValue);
  const years = await publishedYears(env);
  const entries = await publishedEntries(env, year, years.includes(year));
  const entry = validateEntry(draft, year);
  const nextEntries = [...entries.filter((candidate) => candidate.id !== id), entry]
    .sort((left, right) => right.id.localeCompare(left.id));
  const nextYears = normalizeYears([...years, year]);
  await commitFiles(env, `Writing: publish ${id}`, [
    { path: `writing/${id}/${id}.tex`, content: draft.source },
    { path: `writing/${year}.js`, content: moduleSource(nextEntries) },
    { path: "writing/catalog.js", content: moduleSource({ years: nextYears.map(Number) }) },
  ]);
  await deleteDraft(env, id);
  const values = await collection(env, year);
  return {
    year,
    entry,
    source: draft.source,
    pdfUrl: `/api/writing/preview/${id}.pdf`,
    pdfExists: Boolean(await env.CONTENT.head(previewKey(id))),
    pdfVersion: Date.now(),
    ...values,
    status: "published",
    sync: sync(env, "synced", "Published to GitHub; Pages deployment has started.", false),
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
    const changes: FileChange[] = directoryPaths.map((path) => ({ path, content: null }));
    changes.push({ path: `writing/${year}.js`, content: nextEntries.length ? moduleSource(nextEntries) : null });
    if (!nextEntries.length) changes.push({ path: "writing/catalog.js", content: moduleSource({ years: nextYears.map(Number) }) });
    await commitFiles(env, `Writing: delete ${id}`, changes);
  }
  await deleteWritingObjects(env, id);
  const values = await collection(env, year);
  return {
    year,
    ...values,
    status: "deleted",
    sync: sync(env, found.published ? "synced" : "unchanged", found.published ? "Deleted from GitHub." : "Private draft deleted.", false),
  };
}

export async function previewWriting(env: Env, id: string): Promise<Response> {
  validateId(id);
  const object = await env.CONTENT.get(previewKey(id));
  if (!object) throw new HttpError(404, "No compiled preview is available.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/pdf");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", `inline; filename="${id}.pdf"`);
  return new Response(object.body, { headers });
}

export async function buildSource(env: Env, id: string, jobId: string): Promise<Response> {
  validateId(id);
  const status = await getBuild(env, jobId);
  if (!status || status.id !== id || !["queued", "running"].includes(status.state)) {
    throw new HttpError(404, "The compilation job is unavailable.");
  }
  const draft = await getDraft(env, id);
  if (!draft) throw new HttpError(404, "The Writing draft is unavailable.");
  status.state = "running";
  status.log = "Tectonic is compiling the private draft on GitHub Actions.";
  await putBuild(env, status);
  return new Response(draft.source, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function completeBuild(env: Env, request: Request): Promise<Response> {
  const form = await request.formData();
  const id = validateId(form.get("id"));
  const jobId = requiredString(form.get("job"), "Compilation job", 160);
  const status = await getBuild(env, jobId);
  if (!status || status.id !== id) throw new HttpError(404, "The compilation job is unavailable.");
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
    await env.CONTENT.put(previewKey(id), bytes, { httpMetadata: { contentType: "application/pdf" } });
  }
  status.state = ok ? "succeeded" : "failed";
  status.log = log;
  status.finishedAt = singaporeTimestamp();
  status.previewVersion = ok ? Date.now() : undefined;
  await putBuild(env, status);
  return jsonResponse({ ok: true, state: status.state });
}

export async function pendingWriting(env: Env): Promise<boolean> {
  return hasDrafts(env);
}
