import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { parseWritingSource, referencedAssets, writingSourceHash } from "./writing-frontmatter.mjs";
import { renderMarkdown } from "./writing-markdown.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "_site");
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

async function copyTree(relative, filter = () => true) {
  const source = path.join(root, relative);
  const walk = async (directory, nested = "") => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const next = path.join(nested, entry.name);
      if (!filter(next, entry)) continue;
      if (entry.isDirectory()) await walk(child, next);
      else if (entry.isFile()) {
        const destination = path.join(output, relative, next);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(child, destination);
      }
    }
  };
  await walk(source);
}

function formatDate(value, lang) {
  return new Intl.DateTimeFormat(lang, {
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
    ? '<span class="writing-status">未完成</span>'
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
    inLanguage: metadata.lang,
    mainEntityOfPage: url,
    ...(assets.length ? { image: assets.map((name) => `${mediaOrigin}/writing/${metadata.id}/${name}`) } : {}),
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="${escapeHtml(metadata.lang)}">
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
    </div>
  </nav>
  <main id="article" class="article-container">
    <div class="writing-layout">
      <header class="writing-header">
        <div class="writing-kicker"><a href="/#writing/${metadata.id.slice(0, 4)}">Writing</a>${status}</div>
        <h1 class="writing-title">${escapeHtml(metadata.title)}</h1>
        <p class="writing-summary">${escapeHtml(metadata.summary)}</p>
        <div class="writing-meta">
          <span>Xayah Hina</span><span aria-hidden="true">·</span>
          <time datetime="${metadata.createdAt}">${escapeHtml(formatDate(metadata.createdAt, metadata.lang))}</time>
          ${metadata.updatedAt !== metadata.createdAt ? `<span aria-hidden="true">·</span><span>Updated <time datetime="${metadata.updatedAt}">${escapeHtml(formatDate(metadata.updatedAt, metadata.lang))}</time></span>` : ""}
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
      <p class="footer-meta">© ${new Date().getFullYear()} Xayah Hina. All rights reserved.</p>
    </div>
  </footer>
  ${hasToc ? `<script type="module" src="/assets/generated/${assetsManifest.readerJs}"></script>` : ""}
  <script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"f670dcb518704a2d893ab5685a09cdf8"}'></script>
</body>
</html>
`;
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

await copyFile("CNAME");
await copyTree("journals");
await copyTree("dictionary", (nested, entry) => {
  const first = nested.split(path.sep)[0];
  if (entry.isDirectory()) return ["generated", "licenses"].includes(first);
  return ["index.html", "app.js", "styles.css"].includes(nested) || first === "generated" || first === "licenses";
});

const generatedAssets = path.join(output, "assets", "generated");
await fs.mkdir(generatedAssets, { recursive: true });
const shellCssSource = await fs.readFile(path.join(root, "site", "site-shell.css"));
const readerCssSource = await fs.readFile(path.join(root, "site", "writing-reader.css"));
const readerJsSource = await fs.readFile(path.join(root, "site", "writing-reader.js"));
const katexCssSource = await fs.readFile(path.join(root, "node_modules", "katex", "dist", "katex.min.css"));
const previewBundle = await esbuild({
  entryPoints: [path.join(root, "scripts", "writing-markdown.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  write: false,
});
const assetsManifest = {
  shellCss: `site-shell.${hash(shellCssSource)}.css`,
  readerCss: `writing-reader.${hash(readerCssSource)}.css`,
  readerJs: `writing-reader.${hash(readerJsSource)}.js`,
  katexCss: `katex.${hash(katexCssSource)}.css`,
};
await Promise.all([
  fs.writeFile(path.join(generatedAssets, assetsManifest.shellCss), shellCssSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.readerCss), readerCssSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.readerJs), readerJsSource),
  fs.writeFile(path.join(generatedAssets, assetsManifest.katexCss), katexCssSource),
  fs.writeFile(path.join(generatedAssets, "site-shell.css"), shellCssSource),
  fs.writeFile(path.join(generatedAssets, "writing-reader.css"), readerCssSource),
  fs.writeFile(path.join(generatedAssets, "katex.css"), katexCssSource),
  fs.writeFile(path.join(generatedAssets, "writing-preview.js"), previewBundle.outputFiles[0].contents),
]);
const shellPlaceholder = "__SITE_SHELL_CSS__";
for (const relative of ["index.html", path.join("dictionary", "index.html")]) {
  const source = await fs.readFile(path.join(root, relative), "utf8");
  if (source.split(shellPlaceholder).length !== 2) {
    throw new Error(`${relative} must contain exactly one ${shellPlaceholder} placeholder.`);
  }
  await fs.writeFile(
    path.join(output, relative),
    source.replace(shellPlaceholder, assetsManifest.shellCss),
  );
}
const katexFontsSource = path.join(root, "node_modules", "katex", "dist", "fonts");
const katexFontsDestination = path.join(generatedAssets, "fonts");
await fs.cp(katexFontsSource, katexFontsDestination, { recursive: true });

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
