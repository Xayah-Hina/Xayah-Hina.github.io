import crypto from "node:crypto";

const WRITING_ID = /^\d{8}-\d{6}$/;
const WRITING_ASSET = /^\.\/([a-f0-9]{64})\.(jpe?g|png|webp|gif|avif)$/i;
const FRONT_MATTER_KEYS = [
  "id",
  "title",
  "summary",
  "createdAt",
  "updatedAt",
  "lang",
  "status",
];

function normalizeText(value) {
  return String(value).replace(/\r\n?/g, "\n");
}

function requireString(value, label, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function validateWritingMetadata(value, expectedId = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Writing front matter is invalid.");
  }
  const keys = Object.keys(value);
  if (keys.length !== FRONT_MATTER_KEYS.length || keys.some((key, index) => key !== FRONT_MATTER_KEYS[index])) {
    throw new Error(`Writing front matter keys must be ordered as: ${FRONT_MATTER_KEYS.join(", ")}.`);
  }
  const id = requireString(value.id, "Writing id", 15);
  if (!WRITING_ID.test(id) || (expectedId && id !== expectedId)) {
    throw new Error(`Writing id ${id} does not match its directory.`);
  }
  const title = requireString(value.title, "Writing title", 200);
  const summary = requireString(value.summary, "Writing summary", 5000);
  const createdAt = requireString(value.createdAt, "Writing createdAt", 40);
  const updatedAt = requireString(value.updatedAt, "Writing updatedAt", 40);
  if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) {
    throw new Error(`Writing ${id} has an invalid timestamp.`);
  }
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error(`Writing ${id} updatedAt precedes createdAt.`);
  }
  const expectedCreatedPrefix = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}`;
  if (!createdAt.startsWith(expectedCreatedPrefix)) {
    throw new Error(`Writing ${id} createdAt does not match its id.`);
  }
  const lang = requireString(value.lang, "Writing language", 35);
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang)) {
    throw new Error(`Writing ${id} has an invalid language.`);
  }
  if (!["complete", "incomplete"].includes(value.status)) {
    throw new Error(`Writing ${id} has an invalid status.`);
  }
  return { id, title, summary, createdAt, updatedAt, lang, status: value.status };
}

export function parseWritingSource(source, expectedId = "") {
  const normalized = normalizeText(source);
  const match = /^---\n([\s\S]*?)\n---\n(?:\n)?([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error("Writing source must start with strict front matter.");
  const frontMatter = {};
  const lines = match[1].split("\n");
  if (lines.length !== FRONT_MATTER_KEYS.length) {
    throw new Error("Writing front matter contains an unexpected number of fields.");
  }
  for (let index = 0; index < lines.length; index += 1) {
    const key = FRONT_MATTER_KEYS[index];
    const prefix = `${key}: `;
    if (!lines[index].startsWith(prefix)) {
      throw new Error(`Writing front matter field ${key} is missing or out of order.`);
    }
    try {
      frontMatter[key] = JSON.parse(lines[index].slice(prefix.length));
    } catch {
      throw new Error(`Writing front matter field ${key} must use a JSON-compatible scalar.`);
    }
  }
  const metadata = validateWritingMetadata(frontMatter, expectedId);
  const body = match[2].trim();
  if (!body || body.length > 2_000_000) throw new Error(`Writing ${metadata.id} body is invalid.`);
  if (/^#\s+/m.test(body)) throw new Error(`Writing ${metadata.id} body must not contain an H1 heading.`);
  return { metadata, body: `${body}\n`, source: serializeWritingSource(metadata, body) };
}

export function serializeWritingSource(metadata, body) {
  const value = validateWritingMetadata(metadata, metadata.id);
  const normalizedBody = normalizeText(body).trim();
  if (!normalizedBody) {
    throw new Error(`Writing ${value.id} body is invalid.`);
  }
  if (/^#\s+/m.test(normalizedBody)) throw new Error(`Writing ${value.id} body must not contain an H1 heading.`);
  const frontMatter = FRONT_MATTER_KEYS
    .map((key) => `${key}: ${JSON.stringify(value[key])}`)
    .join("\n");
  return `---\n${frontMatter}\n---\n\n${normalizedBody}\n`;
}

export function writingSourceHash(source) {
  return crypto.createHash("sha256").update(normalizeText(source)).digest("hex");
}

export function referencedAssets(body) {
  const assets = new Set();
  const pattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
  for (const match of body.matchAll(pattern)) {
    const valid = WRITING_ASSET.exec(match[1]);
    if (!valid) throw new Error(`Writing image ${match[1]} is not content-addressed.`);
    assets.add(`${valid[1]}.${valid[2].toLowerCase()}`);
  }
  return [...assets].sort();
}
