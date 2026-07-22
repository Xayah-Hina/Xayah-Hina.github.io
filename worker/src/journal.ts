import { commitFiles, readDataModule } from "./github";
import { pendingWriting } from "./writing";
import type { Env, FileChange, JournalEntry, JournalImage, MonthlyNote, SyncStatus } from "./types";
import {
  asRecord,
  decodeBase64,
  HttpError,
  moduleSource,
  normalizeYears,
  randomHex,
  requiredString,
  singaporeTimestamp,
} from "./utils";

const JOURNAL_ID = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "image/avif": ["avif"],
};

interface Upload {
  key: string;
  name: string;
  type: string;
  bytes: Uint8Array;
  extension: string;
}

function sync(env: Env, state: SyncStatus["state"], message: string, writingPending: boolean): SyncStatus {
  return { enabled: true, state, message, branch: env.GITHUB_BRANCH, writingPending };
}

function validateId(value: unknown): string {
  if (typeof value !== "string" || !JOURNAL_ID.test(value)) throw new HttpError(400, "Journal id is invalid.");
  return value;
}

function validatePublishedAt(value: unknown, year?: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || (year && value.slice(0, 4) !== year)) {
    throw new HttpError(400, "Journal publication time is invalid.");
  }
  return value;
}

function validateImage(value: unknown): JournalImage {
  const record = asRecord(value, "A Journal image is invalid.");
  const src = requiredString(record.src, "Journal image source", 2000);
  const alt = requiredString(record.alt ?? "", "Journal image alternative text", 5000, true);
  return { src, alt };
}

function validateJournalEntry(value: unknown, year: string): JournalEntry {
  const record = asRecord(value, `Journal ${year} contains an invalid entry.`);
  const id = validateId(record.id);
  const publishedAt = validatePublishedAt(record.publishedAt, year);
  const content = requiredString(record.content ?? "", "Journal content", 100_000, true);
  if (!Array.isArray(record.images)) throw new HttpError(502, `Journal ${id} contains invalid images.`);
  const images = record.images.map(validateImage);
  let relatedWriting: JournalEntry["relatedWriting"] = null;
  if (record.relatedWriting !== null && record.relatedWriting !== undefined) {
    const related = asRecord(record.relatedWriting, `Journal ${id} has invalid related Writing data.`);
    relatedWriting = {
      id: requiredString(related.id, "Related Writing id", 64),
      title: requiredString(related.title, "Related Writing title", 200),
    };
  }
  const result: JournalEntry = { id, publishedAt, content, images, relatedWriting };
  if (record.updatedAt !== undefined) result.updatedAt = validatePublishedAt(record.updatedAt);
  return result;
}

function validateJournalEntries(value: unknown, year: string): JournalEntry[] {
  if (!Array.isArray(value)) throw new HttpError(502, `journals/${year}.js must export an array.`);
  const entries = value.map((entry) => validateJournalEntry(entry, year));
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new HttpError(502, `journals/${year}.js contains duplicate ids.`);
    ids.add(entry.id);
  }
  return entries.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function validateMonthly(value: unknown, year: string): Record<string, MonthlyNote> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(502, `journals/monthly/${year}.js must export an object.`);
  }
  const notes: Record<string, MonthlyNote> = {};
  for (const [month, raw] of Object.entries(value)) {
    if (!MONTH.test(month) || month.slice(0, 4) !== year) throw new HttpError(502, `Monthly note ${month} is invalid.`);
    const record = asRecord(raw, `Monthly note ${month} is invalid.`);
    const note = requiredString(record.note ?? "", "Monthly note content", 100_000, true);
    const reportImage = record.reportImage === null || record.reportImage === undefined ? null : validateImage(record.reportImage);
    notes[month] = { note, reportImage };
    if (record.updatedAt !== undefined) notes[month].updatedAt = validatePublishedAt(record.updatedAt);
  }
  return notes;
}

export async function journalYears(env: Env): Promise<string[]> {
  const catalog = await readDataModule<{ years?: unknown[] }>(env, "journals/catalog.js");
  if (!catalog || !Array.isArray(catalog.years)) throw new HttpError(502, "journals/catalog.js must contain a years array.");
  return normalizeYears(catalog.years);
}

async function journalEntries(env: Env, year: string, required = true): Promise<JournalEntry[]> {
  const raw = await readDataModule<unknown>(env, `journals/${year}.js`, env.GITHUB_BRANCH, required);
  return raw === null ? [] : validateJournalEntries(raw, year);
}

async function monthlyNotes(env: Env, year: string, required = false): Promise<Record<string, MonthlyNote>> {
  const raw = await readDataModule<unknown>(env, `journals/monthly/${year}.js`, env.GITHUB_BRANCH, required);
  return raw === null ? {} : validateMonthly(raw, year);
}

async function validateRelated(env: Env, value: unknown): Promise<JournalEntry["relatedWriting"]> {
  if (value === null || value === undefined) return null;
  const record = asRecord(value, "Related Writing is invalid.");
  const id = requiredString(record.id, "Related Writing id", 64);
  if (!/^\d{8}-\d{6}$/.test(id)) throw new HttpError(400, "Related Writing is invalid.");
  const entries = await readDataModule<unknown>(env, `writing/${id.slice(0, 4)}.js`, env.GITHUB_BRANCH, false);
  if (entries === null || !Array.isArray(entries)) throw new HttpError(400, "Related Writing must be published before it can be linked.");
  const match = entries
    .map((entry) => asRecord(entry, "Published Writing data is invalid."))
    .find((entry) => entry.id === id);
  if (!match) throw new HttpError(400, "Related Writing must be published before it can be linked.");
  return { id, title: requiredString(match.title, "Related Writing title", 200) };
}

function parseUploads(value: unknown): Map<string, Upload> {
  if (!Array.isArray(value)) throw new HttpError(400, "Journal image uploads are invalid.");
  const uploads = new Map<string, Upload>();
  for (const raw of value) {
    const record = asRecord(raw, "An uploaded image is invalid.");
    const key = requiredString(record.key, "Image upload key", 200);
    const name = requiredString(record.name, "Image filename", 500);
    const type = requiredString(record.type, "Image content type", 100);
    if (!ALLOWED_TYPES[type] || typeof record.data !== "string") throw new HttpError(400, "An uploaded image type is unsupported.");
    const bytes = decodeBase64(record.data);
    if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new HttpError(400, "Each image must be between 1 byte and 32 MiB.");
    const valid = (
      (type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (type === "image/png" && bytes[0] === 0x89 && new TextDecoder().decode(bytes.subarray(1, 4)) === "PNG")
      || (type === "image/webp" && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP")
      || (type === "image/gif" && ["GIF87a", "GIF89a"].includes(new TextDecoder().decode(bytes.subarray(0, 6))))
      || (type === "image/avif" && new TextDecoder().decode(bytes.subarray(4, 8)) === "ftyp" && ["avif", "avis"].includes(new TextDecoder().decode(bytes.subarray(8, 12))))
    );
    if (!valid) throw new HttpError(400, "An uploaded file does not match its image format.");
    let extension = name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_TYPES[type].includes(extension)) extension = ALLOWED_TYPES[type][0];
    if (uploads.has(key)) throw new HttpError(400, "An uploaded image key is duplicated.");
    uploads.set(key, { key, name, type, bytes, extension });
  }
  return uploads;
}

function mediaKey(env: Env, src: string): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.origin !== env.MEDIA_ORIGIN || !/^\/(?:journals|monthly)\/\d{4}\/[A-Za-z0-9._-]+$/.test(url.pathname)) return null;
  return `published${url.pathname}`;
}

function legacyImagePath(src: string, kind: "journal" | "monthly"): string | null {
  const pattern = kind === "journal"
    ? /^journals\/images\/\d{4}\/[A-Za-z0-9._-]+$/
    : /^journals\/monthly\/images\/\d{4}\/[A-Za-z0-9._-]+$/;
  return pattern.test(src) ? src : null;
}

function withoutUpdatedAt<T extends { updatedAt?: string }>(value: T): Omit<T, "updatedAt"> {
  const clone = structuredClone(value) as T;
  delete clone.updatedAt;
  return clone;
}

async function cleanupMedia(env: Env, images: string[]): Promise<string[]> {
  const failures: string[] = [];
  for (const src of images) {
    const key = mediaKey(env, src);
    if (!key) continue;
    try {
      await env.CONTENT.delete(key);
    } catch {
      failures.push(src);
    }
  }
  return failures;
}

export async function saveJournal(env: Env, payload: Record<string, unknown>) {
  const mode = payload.mode;
  if (mode !== "create" && mode !== "edit") throw new HttpError(400, "Journal save mode is invalid.");
  const rawEntry = asRecord(payload.entry, "Journal entry is invalid.");
  const id = validateId(rawEntry.id);
  const publishedAt = validatePublishedAt(rawEntry.publishedAt);
  const year = publishedAt.slice(0, 4);
  const content = requiredString(rawEntry.content ?? "", "Journal content", 100_000, true);
  const relatedWriting = await validateRelated(env, rawEntry.relatedWriting);
  const years = await journalYears(env);
  const previous = await journalEntries(env, year, years.includes(year));
  const original = previous.find((entry) => entry.id === id) || null;
  if (mode === "create" && original) throw new HttpError(409, "Journal id already exists.");
  if (mode === "edit" && !original) throw new HttpError(404, "The Journal entry is no longer available.");
  if (original && original.publishedAt !== publishedAt) throw new HttpError(400, "The Journal publication time cannot be changed.");

  if (!Array.isArray(payload.images)) throw new HttpError(400, "Journal images are invalid.");
  const uploads = parseUploads(payload.uploads);
  const originals = new Map((original?.images || []).map((image) => [image.src, image]));
  const usedUploads = new Set<string>();
  const usedIndices = new Set<number>();
  for (const src of originals.keys()) {
    const match = src.match(/-(\d+)\.[A-Za-z0-9]+$/);
    if (match) usedIndices.add(Number(match[1]));
  }
  let nextIndex = 1;
  const images: JournalImage[] = [];
  const newKeys: string[] = [];
  const pendingUploads: Array<{ objectKey: string; upload: Upload }> = [];
  for (const raw of payload.images) {
    const spec = asRecord(raw, "A Journal image descriptor is invalid.");
    const kind = spec.kind;
    const alt = requiredString(spec.alt ?? "", "Image alternative text", 5000, true);
    if (kind === "existing") {
      const src = requiredString(spec.src, "Existing image source", 2000);
      if (!originals.has(src)) throw new HttpError(400, "An existing image is not part of this Journal entry.");
      images.push({ src, alt });
      continue;
    }
    if (kind !== "new") throw new HttpError(400, "A Journal image descriptor is invalid.");
    const key = requiredString(spec.key, "Image upload key", 200);
    const upload = uploads.get(key);
    if (!upload || usedUploads.has(key)) throw new HttpError(400, "An uploaded image does not match its descriptor.");
    usedUploads.add(key);
    while (usedIndices.has(nextIndex)) nextIndex += 1;
    const name = `${id}-${String(nextIndex).padStart(2, "0")}.${upload.extension}`;
    usedIndices.add(nextIndex);
    nextIndex += 1;
    const objectKey = `published/journals/${year}/${name}`;
    pendingUploads.push({ objectKey, upload });
    images.push({ src: `${env.MEDIA_ORIGIN}/journals/${year}/${name}`, alt });
  }
  if (usedUploads.size !== uploads.size) {
    throw new HttpError(400, "The request contains an unused image upload.");
  }
  if (!content && images.length === 0) {
    throw new HttpError(400, "Add content or at least one image.");
  }
  try {
    for (const { objectKey, upload } of pendingUploads) {
      await env.CONTENT.put(objectKey, upload.bytes, { httpMetadata: { contentType: upload.type } });
      newKeys.push(objectKey);
    }
  } catch (error) {
    await env.CONTENT.delete(newKeys);
    throw error;
  }

  const candidate: JournalEntry = { id, publishedAt, content, images, relatedWriting };
  if (original && JSON.stringify(withoutUpdatedAt(original)) === JSON.stringify(candidate)) {
    await env.CONTENT.delete(newKeys);
    return {
      year, years, entries: previous, status: "unchanged", cleanupFailures: [],
      sync: sync(env, "unchanged", "No remote update was needed.", await pendingWriting(env)),
    };
  }
  if (original) candidate.updatedAt = singaporeTimestamp();
  const entries = [...previous.filter((entry) => entry.id !== id), candidate]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  const nextYears = normalizeYears([...years, year]);
  const retained = new Set(images.map((image) => image.src));
  const removed = (original?.images || []).filter((image) => !retained.has(image.src)).map((image) => image.src);
  const changes: FileChange[] = [
    { path: `journals/${year}.js`, content: moduleSource(entries) },
    { path: "journals/catalog.js", content: moduleSource({ years: nextYears.map(Number) }) },
  ];
  if (!years.includes(year)) changes.push({ path: `journals/monthly/${year}.js`, content: moduleSource({}) });
  for (const src of removed) {
    const legacy = legacyImagePath(src, "journal");
    if (legacy) changes.push({ path: legacy, content: null });
  }
  try {
    await commitFiles(env, `${original ? "Journal: update" : "Journal: publish"} ${id}`, changes);
  } catch (error) {
    await env.CONTENT.delete(newKeys);
    throw error;
  }
  const cleanupFailures = await cleanupMedia(env, removed);
  return {
    year,
    years: nextYears,
    entries,
    status: original ? "updated" : "created",
    cleanupFailures,
    sync: sync(env, "synced", "Published to GitHub; Pages deployment has started.", await pendingWriting(env)),
  };
}

export async function deleteJournal(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Journal year", 4);
  const id = validateId(payload.id);
  const years = await journalYears(env);
  if (!years.includes(year)) throw new HttpError(404, "The Journal year is no longer available.");
  const previous = await journalEntries(env, year);
  const original = previous.find((entry) => entry.id === id);
  if (!original) throw new HttpError(404, "The Journal entry is no longer available.");
  const entries = previous.filter((entry) => entry.id !== id);
  const nextYears = entries.length ? years : years.filter((value) => value !== year);
  const changes: FileChange[] = [
    { path: `journals/${year}.js`, content: entries.length ? moduleSource(entries) : null },
    { path: "journals/catalog.js", content: moduleSource({ years: nextYears.map(Number) }) },
  ];
  for (const image of original.images) {
    const legacy = legacyImagePath(image.src, "journal");
    if (legacy) changes.push({ path: legacy, content: null });
  }
  await commitFiles(env, `Journal: delete ${id}`, changes);
  const cleanupFailures = await cleanupMedia(env, original.images.map((image) => image.src));
  return {
    year, years: nextYears, entries, status: "deleted", cleanupFailures,
    sync: sync(env, "synced", "Deleted from GitHub; Pages deployment has started.", await pendingWriting(env)),
  };
}

export async function saveMonthlyNote(env: Env, payload: Record<string, unknown>) {
  const year = requiredString(payload.year, "Monthly note year", 4);
  const month = requiredString(payload.month, "Monthly note month", 7);
  if (!/^\d{4}$/.test(year) || !MONTH.test(month) || month.slice(0, 4) !== year) throw new HttpError(400, "Monthly note date is invalid.");
  const years = await journalYears(env);
  if (!years.includes(year)) throw new HttpError(404, "The Journal year is no longer available.");
  const entries = await journalEntries(env, year);
  if (!entries.some((entry) => entry.publishedAt.slice(0, 7) === month)) throw new HttpError(404, "The Journal month is no longer available.");
  const noteRecord = asRecord(payload.note, "Monthly note is invalid.");
  const note = requiredString(noteRecord.content ?? "", "Monthly note content", 100_000, true);
  const previous = await monthlyNotes(env, year);
  const original = previous[month] || null;
  const uploads = parseUploads(payload.uploads);
  const spec = payload.reportImage;
  let reportImage: JournalImage | null = null;
  let newKey: string | null = null;
  if (spec !== null && spec !== undefined) {
    const image = asRecord(spec, "Monthly report image is invalid.");
    const alt = requiredString(image.alt ?? "", "Monthly report image alternative text", 5000, true);
    if (image.kind === "existing") {
      const src = requiredString(image.src, "Monthly report image source", 2000);
      if (!original?.reportImage || original.reportImage.src !== src || uploads.size) throw new HttpError(400, "The existing monthly report image is invalid.");
      reportImage = { src, alt };
    } else if (image.kind === "new") {
      const key = requiredString(image.key, "Monthly image upload key", 200);
      const upload = uploads.get(key);
      if (!upload || uploads.size !== 1) throw new HttpError(400, "A monthly image upload does not match its descriptor.");
      const name = `${month}-report-${randomHex(4)}.${upload.extension}`;
      newKey = `published/monthly/${year}/${name}`;
      await env.CONTENT.put(newKey, upload.bytes, { httpMetadata: { contentType: upload.type } });
      reportImage = { src: `${env.MEDIA_ORIGIN}/monthly/${year}/${name}`, alt };
    } else {
      throw new HttpError(400, "Monthly report image is invalid.");
    }
  } else if (uploads.size) {
    throw new HttpError(400, "The request contains an unused monthly report image upload.");
  }

  const candidate: MonthlyNote = { note, reportImage };
  const hasContent = Boolean(note || reportImage);
  if ((original && hasContent && JSON.stringify(withoutUpdatedAt(original)) === JSON.stringify(candidate)) || (!original && !hasContent)) {
    if (newKey) await env.CONTENT.delete(newKey);
    return {
      year, month, notes: previous, status: "unchanged", cleanupFailures: [],
      sync: sync(env, "unchanged", "No remote update was needed.", await pendingWriting(env)),
    };
  }
  const notes = { ...previous };
  let status: "created" | "updated" | "cleared";
  if (hasContent) {
    candidate.updatedAt = singaporeTimestamp();
    notes[month] = candidate;
    status = original ? "updated" : "created";
  } else {
    delete notes[month];
    status = "cleared";
  }
  const changes: FileChange[] = [{ path: `journals/monthly/${year}.js`, content: moduleSource(notes) }];
  const oldSrc = original?.reportImage?.src;
  if (oldSrc && oldSrc !== reportImage?.src) {
    const legacy = legacyImagePath(oldSrc, "monthly");
    if (legacy) changes.push({ path: legacy, content: null });
  }
  try {
    await commitFiles(env, `Journal: update monthly note ${month}`, changes);
  } catch (error) {
    if (newKey) await env.CONTENT.delete(newKey);
    throw error;
  }
  const cleanupFailures = oldSrc && oldSrc !== reportImage?.src ? await cleanupMedia(env, [oldSrc]) : [];
  return {
    year, month, notes, status, cleanupFailures,
    sync: sync(env, "synced", "Published to GitHub; Pages deployment has started.", await pendingWriting(env)),
  };
}
