import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeBuildOutput } from "./build-output.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedOutput = process.env.XAYAH_BUILD_OUTPUT
  ? path.resolve(process.env.XAYAH_BUILD_OUTPUT)
  : path.join(root, "_site");
const journalSourceRoot = process.env.XAYAH_JOURNALS_ROOT
  ? path.resolve(process.env.XAYAH_JOURNALS_ROOT)
  : path.join(root, "journals");
const output = await safeBuildOutput(root, requestedOutput, journalSourceRoot);
const mediaOrigin = "https://media.xayah.me";

const moduleSource = (value) => `export default ${JSON.stringify(value, null, 2)};\n`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function parseJsonModule(source, relative) {
  const normalized = source.replaceAll("\r\n", "\n");
  const prefix = "export default ";
  const suffix = ";\n";
  if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix)) {
    throw new Error(`${relative} must be a canonical JSON default-export module.`);
  }
  let value;
  try {
    value = JSON.parse(normalized.slice(prefix.length, -suffix.length));
  } catch {
    throw new Error(`${relative} must contain valid JSON.`);
  }
  if (moduleSource(value) !== normalized) {
    throw new Error(`${relative} must be a canonical JSON default-export module.`);
  }
  return value;
}

function timestamp(value, label) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+08:00$/.exec(value || "");
  if (!match) throw new Error(`${label} must be a Singapore timestamp.`);
  const parts = match.slice(1).map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
  const normalized = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
  if (parts.some((part, index) => part !== normalized[index])) throw new Error(`${label} is not a valid date.`);
  return `${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}`;
}

function validateImage(value, year, entryId) {
  if (!exactKeys(value, ["src", "alt"])
    || typeof value.src !== "string" || value.src.length > 2000
    || typeof value.alt !== "string" || value.alt.length > 5000) {
    throw new Error(`Journal ${entryId} contains an invalid image.`);
  }
  let url;
  try {
    url = new URL(value.src);
  } catch {
    throw new Error(`Journal ${entryId} contains an unsafe image URL.`);
  }
  const extension = "(?:jpe?g|png|webp|gif|avif)";
  const pathPattern = new RegExp(`^/journals/${year}/${entryId}-(?:\\d{2}|[a-f0-9]{24})\\.${extension}$`);
  if (url.origin !== mediaOrigin || url.protocol !== "https:" || url.username || url.password
    || url.search || url.hash || value.src !== url.href || !pathPattern.test(url.pathname)) {
    throw new Error(`Journal ${entryId} contains an unsafe image URL.`);
  }
  return value.src;
}

function validateCatalog(value) {
  if (!exactKeys(value, ["years"]) || !Array.isArray(value.years)) {
    throw new Error("journals/catalog.js must contain only a years array.");
  }
  if (value.years.some((year) => !Number.isInteger(year) || !/^\d{4}$/.test(String(year)))
    || new Set(value.years).size !== value.years.length
    || value.years.some((year, index) => index > 0 && year >= value.years[index - 1])) {
    throw new Error("journals/catalog.js years must be unique four-digit integers in descending order.");
  }
  return value.years.map(String);
}

function validateEntries(value, year, ids, imageSources) {
  if (!Array.isArray(value)) throw new Error(`journals/${year}.js must export an array.`);
  let previous = null;
  for (const entry of value) {
    if (!exactKeys(entry, ["id", "publishedAt", "content", "images"], ["updatedAt"])
      || typeof entry.content !== "string" || entry.content.length > 100_000 || !Array.isArray(entry.images)) {
      throw new Error(`journals/${year}.js contains an invalid entry.`);
    }
    const idMatch = /^(\d{8}-\d{6})-[a-f0-9]{4}$/.exec(entry.id || "");
    const publishedId = timestamp(entry.publishedAt, `Journal ${entry.id} publishedAt`);
    if (!idMatch || idMatch[1] !== publishedId || entry.id.slice(0, 4) !== year) {
      throw new Error(`Journal ${entry.id || "entry"} has an invalid id or publication date.`);
    }
    if (ids.has(entry.id)) throw new Error(`Journal data contains duplicate id ${entry.id}.`);
    ids.add(entry.id);
    if (previous && entry.publishedAt > previous) throw new Error(`journals/${year}.js must be sorted newest first.`);
    previous = entry.publishedAt;
    if (!entry.content.trim() && entry.images.length === 0) throw new Error(`Journal ${entry.id} must contain text or an image.`);
    if (entry.updatedAt !== undefined) {
      timestamp(entry.updatedAt, `Journal ${entry.id} updatedAt`);
      if (Date.parse(entry.updatedAt) < Date.parse(entry.publishedAt)) {
        throw new Error(`Journal ${entry.id} updatedAt precedes publishedAt.`);
      }
    }
    for (const image of entry.images) {
      const source = validateImage(image, year, entry.id);
      if (imageSources.has(source)) throw new Error(`Journal data contains duplicate image URL ${source}.`);
      imageSources.add(source);
    }
  }
}

async function readJournalModules() {
  const catalog = parseJsonModule(
    await fs.readFile(path.join(journalSourceRoot, "catalog.js"), "utf8"),
    "journals/catalog.js",
  );
  const years = validateCatalog(catalog);
  const ids = new Set();
  const imageSources = new Set();
  const modules = [{ relative: "journals/catalog.js", value: catalog }];
  for (const year of years) {
    const relative = `journals/${year}.js`;
    const entries = parseJsonModule(
      await fs.readFile(path.join(journalSourceRoot, `${year}.js`), "utf8"),
      relative,
    );
    validateEntries(entries, year, ids, imageSources);
    modules.push({ relative, value: entries });
  }
  return modules;
}

const journalModules = await readJournalModules();
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.copyFile(path.join(root, "CNAME"), path.join(output, "CNAME"));

for (const { relative, value } of journalModules) {
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, moduleSource(value));
}

const generatedAssets = path.join(output, "assets", "generated");
const generatedFonts = path.join(generatedAssets, "fonts");
await fs.mkdir(generatedFonts, { recursive: true });
const fontPackages = [
  { name: "geist", styles: ["index.css", "wght-italic.css"] },
  { name: "noto-sans-sc", styles: ["index.css"] },
];
const typographyCss = Buffer.from((await Promise.all(fontPackages.flatMap(({ name, styles }) => (
  styles.map(async (style) => {
    const source = await fs.readFile(path.join(root, "node_modules", "@fontsource-variable", name, style), "utf8");
    return source.replaceAll("./files/", "./fonts/");
  })
)))).join("\n"));
const shellCss = await fs.readFile(path.join(root, "site", "site-shell.css"));
const journalCss = await fs.readFile(path.join(root, "site", "journal.css"));
const journalJs = await fs.readFile(path.join(root, "site", "journal.js"));
const assets = {
  typographyCss: `typography.${hash(typographyCss)}.css`,
  shellCss: `site-shell.${hash(shellCss)}.css`,
  journalCss: `journal.${hash(journalCss)}.css`,
  journalJs: `journal.${hash(journalJs)}.js`,
};
await Promise.all([
  fs.writeFile(path.join(generatedAssets, assets.typographyCss), typographyCss),
  fs.writeFile(path.join(generatedAssets, assets.shellCss), shellCss),
  fs.writeFile(path.join(generatedAssets, assets.journalCss), journalCss),
  fs.writeFile(path.join(generatedAssets, assets.journalJs), journalJs),
]);

for (const { name } of fontPackages) {
  const packageRoot = path.join(root, "node_modules", "@fontsource-variable", name);
  for (const file of await fs.readdir(path.join(packageRoot, "files"))) {
    await fs.copyFile(path.join(packageRoot, "files", file), path.join(generatedFonts, file));
  }
  await fs.copyFile(path.join(packageRoot, "LICENSE"), path.join(generatedFonts, `LICENSE-${name}.txt`));
}

const replacements = [
  ["__TYPOGRAPHY_CSS__", assets.typographyCss],
  ["__SITE_SHELL_CSS__", assets.shellCss],
  ["__JOURNAL_CSS__", assets.journalCss],
  ["__JOURNAL_JS__", assets.journalJs],
];
let html = await fs.readFile(path.join(root, "index.html"), "utf8");
for (const [placeholder, value] of replacements) {
  if (html.split(placeholder).length !== 2) {
    throw new Error(`index.html must contain exactly one ${placeholder} placeholder.`);
  }
  html = html.replace(placeholder, value);
}
await fs.writeFile(path.join(output, "index.html"), html);

const entryCount = journalModules.slice(1).reduce((total, module) => total + module.value.length, 0);
console.log(`Built ${entryCount} Journal entries into ${path.relative(root, output)}.`);
