import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { parseWritingSource, referencedAssets, writingSourceHash } from "./writing-frontmatter.mjs";
import { renderMarkdown } from "./writing-markdown.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.XAYAH_BUILD_OUTPUT
  ? path.resolve(process.env.XAYAH_BUILD_OUTPUT)
  : path.join(root, "_site");
const journalSourceRoot = process.env.XAYAH_JOURNALS_ROOT
  ? path.resolve(process.env.XAYAH_JOURNALS_ROOT)
  : path.join(root, "journals");
const mediaOrigin = "https://media.xayah.me";
const siteOrigin = "https://xayah.me";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const moduleSource = (value) => `export default ${JSON.stringify(value, null, 2)};\n`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);

async function copyFile(relative) {
  const source = path.join(root, relative);
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

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
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
  const normalized = [utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds()];
  if (parts.some((part, index) => part !== normalized[index])) throw new Error(`${label} is not a valid date.`);
  return `${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}`;
}

function validWritingId(value) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(value || "");
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
  return parts.every((part, index) => part === [
    utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(),
    utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(),
  ][index]);
}

function validateImage(value, { year, owner, monthly = false }) {
  if (!exactKeys(value, ["src", "alt"]) || typeof value.src !== "string" || value.src.length > 2000
    || typeof value.alt !== "string" || value.alt.length > 5000) {
    throw new Error(`${owner} contains an invalid image.`);
  }
  let url;
  try {
    url = new URL(value.src);
  } catch {
    throw new Error(`${owner} contains an unsafe image URL.`);
  }
  const extension = "(?:jpe?g|png|webp|gif|avif)";
  const pathPattern = monthly
    ? new RegExp(`^/monthly/${year}/${owner}-report-(?:[a-f0-9]{8}|[a-f0-9]{24})\\.${extension}$`)
    : new RegExp(`^/journals/${year}/${owner}-(?:\\d{2}|[a-f0-9]{24})\\.${extension}$`);
  if (url.origin !== mediaOrigin || url.protocol !== "https:" || url.username || url.password
    || url.search || url.hash || value.src !== url.href || !pathPattern.test(url.pathname)) {
    throw new Error(`${owner} contains an unsafe image URL.`);
  }
  return value.src;
}

function validateJournalCatalog(value) {
  if (!exactKeys(value, ["years"]) || !Array.isArray(value.years)) {
    throw new Error("journals/catalog.js must contain only a years array.");
  }
  const years = value.years;
  if (years.some((year) => !Number.isInteger(year) || !/^\d{4}$/.test(String(year)))
    || new Set(years).size !== years.length
    || years.some((year, index) => index > 0 && year >= years[index - 1])) {
    throw new Error("journals/catalog.js years must be unique four-digit integers in descending order.");
  }
  return years.map(String);
}

function validateJournalEntries(value, year, ids, imageSources) {
  if (!Array.isArray(value)) throw new Error(`journals/${year}.js must export an array.`);
  let previous = null;
  for (const entry of value) {
    if (!exactKeys(entry, ["id", "publishedAt", "content", "images", "relatedWriting"], ["updatedAt"])
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
      if (Date.parse(entry.updatedAt) < Date.parse(entry.publishedAt)) throw new Error(`Journal ${entry.id} updatedAt precedes publishedAt.`);
    }
    if (entry.relatedWriting !== null && (!exactKeys(entry.relatedWriting, ["id", "title"])
      || !validWritingId(entry.relatedWriting.id)
      || typeof entry.relatedWriting.title !== "string" || !entry.relatedWriting.title.trim()
      || entry.relatedWriting.title.length > 200)) {
      throw new Error(`Journal ${entry.id} has invalid related Writing data.`);
    }
    for (const image of entry.images) {
      const src = validateImage(image, { year, owner: entry.id });
      if (imageSources.has(src)) throw new Error(`Journal data contains duplicate image URL ${src}.`);
      imageSources.add(src);
    }
  }
}

function validateMonthlyNotes(value, year, imageSources) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`journals/monthly/${year}.js must export an object.`);
  }
  for (const [month, note] of Object.entries(value)) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || !month.startsWith(year)
      || !exactKeys(note, ["note", "reportImage"], ["updatedAt"])
      || typeof note.note !== "string" || note.note.length > 100_000) {
      throw new Error(`Monthly note ${month} is invalid.`);
    }
    if (!note.note.trim() && note.reportImage === null) throw new Error(`Monthly note ${month} is empty.`);
    if (note.updatedAt !== undefined) timestamp(note.updatedAt, `Monthly note ${month} updatedAt`);
    if (note.reportImage !== null) {
      const src = validateImage(note.reportImage, { year, owner: month, monthly: true });
      if (imageSources.has(src)) throw new Error(`Journal data contains duplicate image URL ${src}.`);
      imageSources.add(src);
    }
  }
}

async function readJournalModules() {
  const catalog = parseJsonModule(await fs.readFile(path.join(journalSourceRoot, "catalog.js"), "utf8"), "journals/catalog.js");
  const years = validateJournalCatalog(catalog);
  const ids = new Set();
  const imageSources = new Set();
  const modules = [{ relative: "journals/catalog.js", value: catalog }];
  for (const year of years) {
    const entryRelative = `journals/${year}.js`;
    const monthlyRelative = `journals/monthly/${year}.js`;
    const entries = parseJsonModule(await fs.readFile(path.join(journalSourceRoot, `${year}.js`), "utf8"), entryRelative);
    const monthly = parseJsonModule(await fs.readFile(path.join(journalSourceRoot, "monthly", `${year}.js`), "utf8"), monthlyRelative);
    validateJournalEntries(entries, year, ids, imageSources);
    validateMonthlyNotes(monthly, year, imageSources);
    modules.push({ relative: entryRelative, value: entries }, { relative: monthlyRelative, value: monthly });
  }
  return modules;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function tocMarkup(headings) {
  return `<ol class="toc-list">${headings.map((heading) => (
    `<li class="toc-level-${heading.level}"><a data-toc-link href="#${encodeURIComponent(heading.id)}">${escapeHtml(heading.text)}</a></li>`
  )).join("")}</ol>`;
}

function articleHtml(entry, rendered, assets) {
  const { metadata, sourceHash } = entry;
  const url = `${siteOrigin}/writing/${metadata.id}/`;
  const hasToc = rendered.headings.filter((heading) => heading.level === 2).length >= 3;
  const toc = hasToc ? tocMarkup(rendered.headings) : "";
  const status = metadata.status === "incomplete"
    ? '<span class="writing-status">Incomplete</span>'
    : "";
  const title = `${metadata.title} - Xayah Hina`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: metadata.title,
    description: metadata.summary,
    author: { "@type": "Person", name: "Xayah Hina", url: siteOrigin },
    datePublished: metadata.createdAt,
    dateModified: metadata.updatedAt,
    mainEntityOfPage: url,
    ...(assets.length ? { image: assets.map((name) => `${mediaOrigin}/writing/${metadata.id}/${name}`) } : {}),
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metadata.summary)}">
  <meta name="x-writing-revision" content="${sourceHash}">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#090c10">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(metadata.title)}">
  <meta property="og:description" content="${escapeHtml(metadata.summary)}">
  <meta property="og:url" content="${url}">
  <meta property="article:published_time" content="${metadata.createdAt}">
  <meta property="article:modified_time" content="${metadata.updatedAt}">
  <meta name="twitter:card" content="summary">
  <link rel="canonical" href="${url}">
  <link rel="icon" href="https://raw.githubusercontent.com/Xayah-Graphics/imagebed/7772e40fee3de8f8ca11134d04ef5f5816b8ef60/Hatsune.Miku.full.1961310.JPG">
  <link rel="stylesheet" href="/assets/generated/${assetsManifest.typographyCss}">
  <link rel="stylesheet" href="/assets/generated/${assetsManifest.shellCss}">
  <link rel="stylesheet" href="/assets/generated/${assetsManifest.katexCss}">
  <link rel="stylesheet" href="/assets/generated/${assetsManifest.readerCss}">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <a class="skip-link" href="#article">Skip to article</a>
  <nav class="site-nav" aria-label="Site navigation">
    <a class="site-name" href="/">Xayah Hina</a>
    <div class="section-switch" role="group" aria-label="Choose a section">
      <a class="section-switch-button" href="/#writing/${metadata.id.slice(0, 4)}" aria-current="page">Writing</a>
      <a class="section-switch-button" href="/#journal/${metadata.id.slice(0, 4)}">Journal</a>
      <a class="section-switch-button" href="/#task">Task</a>
    </div>
  </nav>
  <main id="article" class="article-container">
    <div class="writing-layout">
      <header class="writing-header">
        <div class="writing-kicker"><a href="/#writing/${metadata.id.slice(0, 4)}">Writing</a>${status}<button class="writing-edit-button" type="button" data-edit-writing="${metadata.id}" hidden>Edit</button></div>
        <h1 class="writing-title">${escapeHtml(metadata.title)}</h1>
        <p class="writing-summary">${escapeHtml(metadata.summary)}</p>
        <div class="writing-meta">
          <span>Xayah Hina</span><span aria-hidden="true">·</span>
          <time datetime="${metadata.createdAt}">${escapeHtml(formatDate(metadata.createdAt))}</time>
          ${metadata.updatedAt !== metadata.createdAt ? `<span aria-hidden="true">·</span><span>Updated <time datetime="${metadata.updatedAt}">${escapeHtml(formatDate(metadata.updatedAt))}</time></span>` : ""}
        </div>
      </header>
      ${hasToc ? `<noscript><style>.toc-fab{display:none!important}</style><nav class="toc-noscript" aria-label="Table of contents"><p class="toc-title">Contents</p>${toc}</nav></noscript>` : ""}
      <article class="writing-body">${rendered.html}</article>
      ${hasToc ? `<aside class="toc-rail" aria-label="Table of contents"><div class="toc-rail-inner"><p class="toc-title">Contents</p>${toc}</div></aside>` : ""}
    </div>
  </main>
  ${hasToc ? `<button class="toc-fab" type="button" data-toc-open aria-haspopup="dialog" aria-controls="writing-contents"><b aria-hidden="true">☰</b><span>Contents</span></button>
  <dialog id="writing-contents" class="toc-dialog" data-toc-dialog aria-labelledby="writing-contents-title">
    <div class="toc-dialog-header"><strong id="writing-contents-title">Contents</strong><button class="toc-close" type="button" data-toc-close aria-label="Close contents">×</button></div>
    ${toc}
  </dialog>` : ""}
  <footer class="site-footer">
    <div class="footer-inner">
      <blockquote class="footer-quote"><p>In solitude, where we are least alone.</p></blockquote>
      <div class="footer-meta-group">
        <p class="footer-meta">© ${new Date().getFullYear()} Xayah Hina. All rights reserved.</p>
        <a class="footer-auth-link" data-auth-link href="/api/session">Log in</a>
      </div>
    </div>
  </footer>
  ${hasToc ? `<script type="module" src="/assets/generated/${assetsManifest.readerJs}"></script>` : ""}
  <script type="module" src="/assets/generated/${assetsManifest.articleAuthoringJs}"></script>
  <script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"f670dcb518704a2d893ab5685a09cdf8"}'></script>
</body>
</html>
`;
}

const journalModules = await readJournalModules();

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

await copyFile("CNAME");
for (const { relative, value } of journalModules) {
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, moduleSource(value));
}

const generatedAssets = path.join(output, "assets", "generated");
await fs.mkdir(generatedAssets, { recursive: true });
const fontPackages = [
  { name: "geist", styles: ["index.css", "wght-italic.css"] },
  { name: "geist-mono", styles: ["index.css", "wght-italic.css"] },
  { name: "noto-sans-sc", styles: ["index.css"] },
  { name: "noto-serif-sc", styles: ["index.css"] },
];
const typographyCssSource = Buffer.from((await Promise.all(fontPackages.flatMap(({ name, styles }) => (
  styles.map(async (style) => {
    const source = await fs.readFile(path.join(root, "node_modules", "@fontsource-variable", name, style), "utf8");
    return source.replaceAll("./files/", "./fonts/");
  })
)))).join("\n"));
const shellCssSource = await fs.readFile(path.join(root, "site", "site-shell.css"));
const readerCssSource = await fs.readFile(path.join(root, "site", "writing-reader.css"));
const readerJsSource = await fs.readFile(path.join(root, "site", "writing-reader.js"));
const articleAuthoringJsSource = await fs.readFile(path.join(root, "site", "writing-article-authoring.js"));
const katexCssSource = await fs.readFile(path.join(root, "node_modules", "katex", "dist", "katex.min.css"));
const authoringJsBundle = await esbuild({
  entryPoints: [path.join(root, "site", "writing-authoring-editor.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  write: false,
});
const authoringCssBundle = await esbuild({
  entryPoints: [path.join(root, "site", "writing-authoring.css")],
  bundle: true,
  minify: true,
  write: false,
});
const tasksJsBundle = await esbuild({
  entryPoints: [path.join(root, "site", "tasks.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  write: false,
});
const tasksCssBundle = await esbuild({
  entryPoints: [path.join(root, "site", "tasks.css")],
  bundle: true,
  minify: true,
  write: false,
});
const authoringJsSource = authoringJsBundle.outputFiles[0]?.contents;
const authoringCssSource = authoringCssBundle.outputFiles[0]?.contents;
const tasksJsSource = tasksJsBundle.outputFiles[0]?.contents;
const tasksCssSource = tasksCssBundle.outputFiles[0]?.contents;
if (!authoringJsSource || !authoringCssSource || !tasksJsSource || !tasksCssSource) {
  throw new Error("Site interactive assets could not be bundled.");
}
const assetsManifest = {
  typographyCss: `typography.${hash(typographyCssSource)}.css`,
  shellCss: `site-shell.${hash(shellCssSource)}.css`,
  readerCss: `writing-reader.${hash(readerCssSource)}.css`,
  readerJs: `writing-reader.${hash(readerJsSource)}.js`,
  articleAuthoringJs: `writing-article-authoring.${hash(articleAuthoringJsSource)}.js`,
  authoringJs: `writing-authoring.${hash(authoringJsSource)}.js`,
  authoringCss: `writing-authoring.${hash(authoringCssSource)}.css`,
  tasksJs: `tasks.${hash(tasksJsSource)}.js`,
  tasksCss: `tasks.${hash(tasksCssSource)}.css`,
  katexCss: `katex.${hash(katexCssSource)}.css`,
};
await Promise.all([
  fs.writeFile(path.join(generatedAssets, assetsManifest.typographyCss), typographyCssSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.shellCss), shellCssSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.readerCss), readerCssSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.readerJs), readerJsSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.articleAuthoringJs), articleAuthoringJsSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.authoringJs), authoringJsSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.authoringCss), authoringCssSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.tasksJs), tasksJsSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.tasksCss), tasksCssSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.katexCss), katexCssSource),
]);
const shellPlaceholder = "__SITE_SHELL_CSS__";
const typographyPlaceholder = "__TYPOGRAPHY_CSS__";
const katexPlaceholder = "__KATEX_CSS__";
const authoringCssPlaceholder = "__WRITING_AUTHORING_CSS__";
const authoringJsPlaceholder = "__WRITING_AUTHORING_JS__";
const tasksJsPlaceholder = "__TASKS_JS__";
const tasksCssPlaceholder = "__TASKS_CSS__";
const htmlReplacements = new Map([
  ["index.html", [
    [typographyPlaceholder, assetsManifest.typographyCss],
    [shellPlaceholder, assetsManifest.shellCss],
    [katexPlaceholder, assetsManifest.katexCss],
    [authoringCssPlaceholder, assetsManifest.authoringCss],
    [authoringJsPlaceholder, assetsManifest.authoringJs],
    [tasksJsPlaceholder, assetsManifest.tasksJs],
    [tasksCssPlaceholder, assetsManifest.tasksCss],
  ]],
]);
for (const [relative, replacements] of htmlReplacements) {
  const source = await fs.readFile(path.join(root, relative), "utf8");
  let rendered = source;
  for (const [placeholder, value] of replacements) {
    if (rendered.split(placeholder).length !== 2) {
      throw new Error(`${relative} must contain exactly one ${placeholder} placeholder.`);
    }
    rendered = rendered.replace(placeholder, value);
  }
  await fs.writeFile(path.join(output, relative), rendered);
}
const katexFontsSource = path.join(root, "node_modules", "katex", "dist", "fonts");
const katexFontsDestination = path.join(generatedAssets, "fonts");
await fs.cp(katexFontsSource, katexFontsDestination, { recursive: true });
for (const { name } of fontPackages) {
  const packageRoot = path.join(root, "node_modules", "@fontsource-variable", name);
  for (const file of await fs.readdir(path.join(packageRoot, "files"))) {
    await fs.copyFile(path.join(packageRoot, "files", file), path.join(katexFontsDestination, file));
  }
  await fs.copyFile(path.join(packageRoot, "LICENSE"), path.join(katexFontsDestination, `LICENSE-${name}.txt`));
}

const writingRoot = path.join(root, "writing");
const entries = [];
for (const directory of await fs.readdir(writingRoot, { withFileTypes: true })) {
  if (!directory.isDirectory() || !/^\d{8}-\d{6}$/.test(directory.name)) continue;
  const sourcePath = path.join(writingRoot, directory.name, `${directory.name}.md`);
  const parsed = parseWritingSource(await fs.readFile(sourcePath, "utf8"), directory.name);
  const sourceHash = writingSourceHash(parsed.source);
  const assetNames = referencedAssets(parsed.body);
  const rendered = renderMarkdown(parsed.body, {
    assetBase: `${mediaOrigin}/writing/${directory.name}`,
  });
  const entry = {
    ...parsed,
    sourceHash,
  };
  entries.push(entry);
  const destination = path.join(output, "writing", directory.name, "index.html");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, articleHtml(entry, rendered, assetNames));
}

entries.sort((left, right) => right.metadata.id.localeCompare(left.metadata.id));
const byYear = new Map();
for (const entry of entries) {
  const year = entry.metadata.id.slice(0, 4);
  const list = byYear.get(year) || [];
  list.push({
    ...entry.metadata,
    article: {
      url: `${siteOrigin}/writing/${entry.metadata.id}/`,
      sourceHash: entry.sourceHash,
    },
  });
  byYear.set(year, list);
}
const years = [...byYear.keys()].sort((left, right) => right.localeCompare(left));
await fs.mkdir(path.join(output, "writing"), { recursive: true });
await fs.writeFile(path.join(output, "writing", "catalog.js"), moduleSource({ years: years.map(Number) }));
for (const year of years) {
  await fs.writeFile(path.join(output, "writing", `${year}.js`), moduleSource(byYear.get(year)));
}

console.log(`Built ${entries.length} Writing article(s) into ${path.relative(root, output)}.`);
