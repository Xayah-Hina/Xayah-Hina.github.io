import { commitFiles, readTextFile } from "./github";
import type { Env, FileChange } from "./types";
import { asRecord, HttpError, randomHex, requiredString, singaporeTimestamp } from "./utils";

interface DictionaryEntry {
  entryId: string;
  canonicalKey: string;
  word: string;
  shard: number;
}

interface PersonalExample {
  id: string;
  sentence: string;
  translation: string;
  source: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

interface PersonalEntry {
  schemaVersion: 1;
  entryId: string;
  summary: string;
  usageNotes: string;
  confusionNotes: string;
  examples: PersonalExample[];
  createdAt: string;
  updatedAt: string;
}

interface DictionaryDraft {
  schemaVersion: 1;
  entry: DictionaryEntry;
  path: string;
  personal: PersonalEntry;
  savedAt: string;
}

const DRAFT_PREFIX = "private/dictionary/drafts/";
const MAX_DRAFTS = 500;

function draftKey(entryId: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(entryId)}.json`;
}

function encodedPathPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

function personalPath(entry: DictionaryEntry): string {
  const prefix = Array.from(entry.canonicalKey).slice(0, 2).join("") || "_";
  return `dictionary/personal/${encodedPathPart(prefix)}/${encodedPathPart(entry.canonicalKey)}.json`;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return value;
}

async function resolveEntry(env: Env, payload: Record<string, unknown>): Promise<DictionaryEntry> {
  const entryId = requiredString(payload.entryId, "Dictionary entryId", 500);
  const shard = integer(payload.shard, "Dictionary shard", 0, 9999);
  const filename = String(shard).padStart(4, "0");
  const response = await fetch(`${env.PUBLIC_SITE_ORIGIN}/dictionary/generated/blocks/${filename}.json`, {
    headers: { "Accept": "application/json" },
  });
  if (!response.ok) throw new HttpError(502, "The Dictionary entry index could not be loaded.");
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new HttpError(502, "The Dictionary entry index is invalid.");
  }
  if (!Array.isArray(value)) throw new HttpError(502, "The Dictionary entry index is invalid.");
  const found = value.find((candidate) => (
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && (candidate as Record<string, unknown>).entryId === entryId
  ));
  if (!found) throw new HttpError(404, "The Dictionary entry is no longer available.");
  const record = found as Record<string, unknown>;
  if (
    typeof record.canonicalKey !== "string"
    || !record.canonicalKey
    || typeof record.word !== "string"
    || !record.word
    || record.shard !== shard
  ) {
    throw new HttpError(502, "The Dictionary entry index is inconsistent.");
  }
  return { entryId, canonicalKey: record.canonicalKey, word: record.word, shard };
}

function storedText(value: unknown, label: string, allowEmpty = true): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new HttpError(500, `Stored Dictionary ${label} is invalid.`);
  }
  return value;
}

function storedRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(500, message);
  return value as Record<string, unknown>;
}

function validateStoredPersonal(value: unknown, expectedEntryId: string): PersonalEntry {
  const record = storedRecord(value, "Stored Dictionary Personal Knowledge is invalid.");
  if (record.schemaVersion !== 1 || record.entryId !== expectedEntryId) {
    throw new HttpError(500, "Stored Dictionary Personal Knowledge has an invalid identity.");
  }
  if (!Array.isArray(record.examples) || record.examples.length > 200) {
    throw new HttpError(500, "Stored Dictionary examples are invalid.");
  }
  const exampleIds = new Set<string>();
  const examples = record.examples.map((value, index): PersonalExample => {
    const example = storedRecord(value, `Stored Dictionary example ${index + 1} is invalid.`);
    const id = storedText(example.id, `example ${index + 1} id`, false);
    if (exampleIds.has(id)) throw new HttpError(500, "Stored Dictionary example ids are duplicated.");
    exampleIds.add(id);
    return {
      id,
      sentence: storedText(example.sentence, `example ${index + 1} sentence`, false),
      translation: storedText(example.translation, `example ${index + 1} translation`),
      source: storedText(example.source, `example ${index + 1} source`),
      comment: storedText(example.comment, `example ${index + 1} comment`),
      createdAt: storedText(example.createdAt, `example ${index + 1} createdAt`),
      updatedAt: storedText(example.updatedAt, `example ${index + 1} updatedAt`),
    };
  });
  return {
    schemaVersion: 1,
    entryId: expectedEntryId,
    summary: storedText(record.summary, "summary"),
    usageNotes: storedText(record.usageNotes, "usage notes"),
    confusionNotes: storedText(record.confusionNotes, "confusion notes"),
    examples,
    createdAt: storedText(record.createdAt, "createdAt"),
    updatedAt: storedText(record.updatedAt, "updatedAt"),
  };
}

function emptyPersonal(entryId: string): PersonalEntry {
  return {
    schemaVersion: 1,
    entryId,
    summary: "",
    usageNotes: "",
    confusionNotes: "",
    examples: [],
    createdAt: "",
    updatedAt: "",
  };
}

async function readPublishedPersonal(env: Env, entry: DictionaryEntry): Promise<PersonalEntry> {
  const source = await readTextFile(env, personalPath(entry), env.GITHUB_BRANCH, false);
  if (source === null) return emptyPersonal(entry.entryId);
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new HttpError(500, `Published Personal Knowledge for ${entry.word} is invalid.`);
  }
  return validateStoredPersonal(value, entry.entryId);
}

async function readDraftObject(env: Env, key: string): Promise<DictionaryDraft | null> {
  const object = await env.CONTENT.get(key);
  if (!object) return null;
  let value: unknown;
  try {
    value = await object.json();
  } catch {
    throw new HttpError(500, "A stored Dictionary draft is invalid.");
  }
  const record = storedRecord(value, "A stored Dictionary draft is invalid.");
  const entryRecord = storedRecord(record.entry, "A stored Dictionary draft entry is invalid.");
  const entry: DictionaryEntry = {
    entryId: storedText(entryRecord.entryId, "draft entryId", false),
    canonicalKey: storedText(entryRecord.canonicalKey, "draft canonical key", false),
    word: storedText(entryRecord.word, "draft word", false),
    shard: typeof entryRecord.shard === "number" && Number.isInteger(entryRecord.shard) ? entryRecord.shard : -1,
  };
  if (
    record.schemaVersion !== 1
    || entry.shard < 0
    || record.path !== personalPath(entry)
    || key !== draftKey(entry.entryId)
  ) {
    throw new HttpError(500, "A stored Dictionary draft has invalid metadata.");
  }
  return {
    schemaVersion: 1,
    entry,
    path: record.path,
    personal: validateStoredPersonal(record.personal, entry.entryId),
    savedAt: storedText(record.savedAt, "draft savedAt", false),
  };
}

async function readDraft(env: Env, entry: DictionaryEntry): Promise<DictionaryDraft | null> {
  const draft = await readDraftObject(env, draftKey(entry.entryId));
  if (!draft) return null;
  if (
    draft.entry.canonicalKey !== entry.canonicalKey
    || draft.entry.word !== entry.word
    || draft.entry.shard !== entry.shard
  ) {
    throw new HttpError(500, "The stored Dictionary draft no longer matches the frozen lexicon.");
  }
  return draft;
}

async function listDraftKeys(env: Env): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.CONTENT.list({ prefix: DRAFT_PREFIX, cursor, limit: 1000 });
    keys.push(...page.objects.map((object) => object.key));
    if (keys.length > MAX_DRAFTS) throw new HttpError(409, "Too many Dictionary drafts are pending publication.");
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function listDrafts(env: Env): Promise<Array<{ key: string; draft: DictionaryDraft }>> {
  const keys = await listDraftKeys(env);
  const drafts = await Promise.all(keys.map(async (key) => {
    const draft = await readDraftObject(env, key);
    if (!draft) throw new HttpError(500, "A Dictionary draft disappeared while it was being read.");
    return { key, draft };
  }));
  return drafts;
}

function inputText(value: unknown, label: string, maximum: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text.`);
  const result = value.trim();
  if (result.length > maximum) throw new HttpError(400, `${label} is too long.`);
  return result;
}

function hasPersonalContent(personal: PersonalEntry): boolean {
  return Boolean(personal.summary || personal.usageNotes || personal.confusionNotes || personal.examples.length);
}

function personalContent(personal: PersonalEntry): unknown {
  return {
    summary: personal.summary,
    usageNotes: personal.usageNotes,
    confusionNotes: personal.confusionNotes,
    examples: personal.examples.map((example) => ({
      id: example.id,
      sentence: example.sentence,
      translation: example.translation,
      source: example.source,
      comment: example.comment,
    })),
  };
}

function samePersonalContent(left: PersonalEntry, right: PersonalEntry): boolean {
  return JSON.stringify(personalContent(left)) === JSON.stringify(personalContent(right));
}

function normalizePersonal(entry: DictionaryEntry, value: unknown, original: PersonalEntry): PersonalEntry {
  const personal = asRecord(value, "Personal Knowledge must be an object.");
  const examplesValue = personal.examples ?? [];
  if (!Array.isArray(examplesValue) || examplesValue.length > 200) {
    throw new HttpError(400, "Personal examples must be an array of at most 200 items.");
  }
  const now = singaporeTimestamp();
  const originalExamples = new Map(original.examples.map((example) => [example.id, example]));
  const seenIds = new Set<string>();
  const examples = examplesValue.map((value, index): PersonalExample => {
    const example = asRecord(value, `Example ${index + 1} must be an object.`);
    let id = inputText(example.id, `Example ${index + 1} id`, 200);
    const previous = id ? originalExamples.get(id) : undefined;
    if (id && !previous) throw new HttpError(400, `Example ${index + 1} has an unknown id.`);
    if (!id) id = randomHex(16);
    if (seenIds.has(id)) throw new HttpError(400, "Personal example ids must be unique.");
    seenIds.add(id);
    const sentence = inputText(example.sentence, `Example ${index + 1} sentence`, 20_000);
    if (!sentence) throw new HttpError(400, `Example ${index + 1} sentence is required.`);
    return {
      id,
      sentence,
      translation: inputText(example.translation, `Example ${index + 1} translation`, 20_000),
      source: inputText(example.source, `Example ${index + 1} source`, 5_000),
      comment: inputText(example.comment, `Example ${index + 1} comment`, 20_000),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
  });
  return {
    schemaVersion: 1,
    entryId: entry.entryId,
    summary: inputText(personal.summary, "Chinese summary", 50_000),
    usageNotes: inputText(personal.usageNotes, "Usage notes", 50_000),
    confusionNotes: inputText(personal.confusionNotes, "Confusion notes", 50_000),
    examples,
    createdAt: original.createdAt || now,
    updatedAt: now,
  };
}

function dictionarySync(env: Env, pendingCount: number, state: "ready" | "pending" | "unchanged" | "synced", message: string) {
  return {
    enabled: true,
    state,
    message,
    branch: env.GITHUB_BRANCH,
    dictionaryPending: pendingCount > 0,
    dictionaryPendingCount: pendingCount,
  };
}

export async function dictionaryStatus(env: Env): Promise<{ pending: boolean; pendingCount: number }> {
  const pendingCount = (await listDraftKeys(env)).length;
  return { pending: pendingCount > 0, pendingCount };
}

export async function openDictionary(env: Env, payload: Record<string, unknown>) {
  const entry = await resolveEntry(env, payload);
  const [published, draft, status] = await Promise.all([
    readPublishedPersonal(env, entry),
    readDraft(env, entry),
    dictionaryStatus(env),
  ]);
  const personal = draft?.personal || published;
  return {
    entryId: entry.entryId,
    word: entry.word,
    personal,
    personalHasContent: hasPersonalContent(personal),
    unpublished: Boolean(draft),
    savedAt: draft?.savedAt || null,
    sync: dictionarySync(
      env,
      status.pendingCount,
      draft ? "pending" : "ready",
      draft ? "Private Dictionary draft loaded from R2." : "Published Personal Knowledge loaded from GitHub.",
    ),
  };
}

export async function saveDictionary(env: Env, payload: Record<string, unknown>) {
  const entry = await resolveEntry(env, payload);
  const [published, existingDraft] = await Promise.all([
    readPublishedPersonal(env, entry),
    readDraft(env, entry),
  ]);
  const original = existingDraft?.personal || published;
  const normalized = normalizePersonal(entry, payload.personal, original);
  let personal = normalized;
  let status: "saved" | "unchanged" | "reverted" = "saved";
  let unpublished = true;

  if (samePersonalContent(normalized, original)) {
    personal = original;
    status = "unchanged";
    unpublished = Boolean(existingDraft);
  } else if (samePersonalContent(normalized, published)) {
    await env.CONTENT.delete(draftKey(entry.entryId));
    personal = published;
    status = "reverted";
    unpublished = false;
  } else {
    const draft: DictionaryDraft = {
      schemaVersion: 1,
      entry,
      path: personalPath(entry),
      personal: normalized,
      savedAt: singaporeTimestamp(),
    };
    await env.CONTENT.put(draftKey(entry.entryId), JSON.stringify(draft), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }

  const pending = await dictionaryStatus(env);
  const message = status === "unchanged"
    ? (unpublished ? "Dictionary draft is unchanged." : "No Dictionary changes were needed.")
    : (status === "reverted" ? "Dictionary draft was reverted to the published version." : "Dictionary draft saved privately in R2.");
  return {
    entryId: entry.entryId,
    word: entry.word,
    personal,
    personalHasContent: hasPersonalContent(personal),
    unpublished,
    status,
    sync: dictionarySync(env, pending.pendingCount, unpublished ? "pending" : "unchanged", message),
  };
}

export async function publishDictionary(env: Env, _payload: Record<string, unknown>) {
  const storedDrafts = await listDrafts(env);
  if (!storedDrafts.length) {
    return {
      status: "unchanged",
      publishedEntryIds: [],
      sync: dictionarySync(env, 0, "unchanged", "No Dictionary drafts are waiting to be published."),
    };
  }

  const changes: FileChange[] = [];
  for (const { draft } of storedDrafts) {
    const source = await readTextFile(env, draft.path, env.GITHUB_BRANCH, false);
    if (!hasPersonalContent(draft.personal)) {
      if (source !== null) changes.push({ path: draft.path, content: null });
      continue;
    }
    const content = `${JSON.stringify(draft.personal, null, 2)}\n`;
    if (source !== content) changes.push({ path: draft.path, content });
  }

  let commitSha: string | null = null;
  if (changes.length) {
    const label = storedDrafts.length === 1 ? storedDrafts[0].draft.entry.word : `${storedDrafts.length} entries`;
    commitSha = await commitFiles(env, `Dictionary: publish ${label}`, changes);
  }
  await env.CONTENT.delete(storedDrafts.map(({ key }) => key));
  return {
    status: changes.length ? "published" : "unchanged",
    publishedEntryIds: storedDrafts.map(({ draft }) => draft.entry.entryId),
    commitSha,
    sync: dictionarySync(
      env,
      0,
      changes.length ? "synced" : "unchanged",
      changes.length ? "Dictionary Personal Knowledge was published to GitHub." : "Dictionary drafts already matched GitHub.",
    ),
  };
}
