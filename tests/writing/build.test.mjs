import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const site = path.join(root, "_site");
const ids = fs.readdirSync(path.join(root, "writing"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d{8}-\d{6}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

test("allowlisted build produces every static article and no source artifacts", () => {
  execFileSync(process.execPath, ["scripts/build-site.mjs"], { cwd: root, stdio: "pipe" });
  const homepage = fs.readFileSync(path.join(site, "index.html"), "utf8");
  const typographyMatch = homepage.match(/href="\/assets\/generated\/(typography\.[a-f0-9]{12}\.css)"/);
  const shellMatch = homepage.match(/href="\/assets\/generated\/(site-shell\.[a-f0-9]{12}\.css)"/);
  const authoringCssMatch = homepage.match(/href="\/assets\/generated\/(writing-authoring\.[a-f0-9]{12}\.css)"/);
  const authoringJsMatch = homepage.match(/import\("\/assets\/generated\/(writing-authoring\.[a-f0-9]{12}\.js)"\)/);
  assert.ok(typographyMatch, "homepage should load the local variable font definitions");
  assert.ok(shellMatch, "homepage should load the hashed shared site shell");
  assert.ok(authoringCssMatch, "homepage should load the hashed visual editor theme");
  assert.ok(authoringJsMatch, "homepage should lazy-load the hashed visual editor");
  assert.doesNotMatch(homepage, /__(?:TYPOGRAPHY_CSS|SITE_SHELL_CSS|KATEX_CSS|WRITING_AUTHORING_(?:CSS|JS))__/);
  assert.match(homepage, /fetch\("\/api\/authoring\/status"/);
  assert.doesNotMatch(homepage, /\/api\/editor\/status|editor\.xayah\.me/);
  assert.doesNotMatch(homepage, /class="section-switch-button"[^>]*href="\/api\/session"/);
  assert.match(homepage, /<footer class="site-footer">[\s\S]*id="auth-link" class="footer-auth-link" href="\/api\/session">Log in<\/a>/);
  assert.doesNotMatch(homepage, /writing-preview(?:-frame|-pane|\.js)/);
  assert.match(homepage, /class="writing-composer-root"/);
  assert.match(homepage, /data-writing-view="visual" aria-pressed="true">Visual/);
  assert.match(homepage, /data-writing-view="source" aria-pressed="false">Markdown/);
  assert.doesNotMatch(homepage, /writing-lang-input|name="lang"/);
  assert.match(homepage, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#090c10">/);
  const typographyCss = fs.readFileSync(path.join(site, "assets", "generated", typographyMatch[1]), "utf8");
  const shellCss = fs.readFileSync(path.join(site, "assets", "generated", shellMatch[1]), "utf8");
  const authoringCss = fs.readFileSync(path.join(site, "assets", "generated", authoringCssMatch[1]), "utf8");
  const authoringJs = fs.readFileSync(path.join(site, "assets", "generated", authoringJsMatch[1]), "utf8");
  assert.match(shellCss, /--page: #090c10;/);
  assert.match(shellCss, /--card: #14191f;/);
  assert.match(shellCss, /--card-hover: #1a2027;/);
  assert.match(shellCss, /--line: #252c35;/);
  assert.match(shellCss, /--link: #86bdf2;/);
  assert.match(typographyCss, /font-family: 'Geist Variable'/);
  assert.match(typographyCss, /font-family: 'Geist Mono Variable'/);
  assert.match(typographyCss, /font-family: 'Noto Sans SC Variable'/);
  assert.match(typographyCss, /font-family: 'Noto Serif SC Variable'/);
  assert.doesNotMatch(typographyCss, /https?:\/\//);
  assert.match(shellCss, /--font-sans: "Geist Variable", "Noto Sans SC Variable"/);
  assert.match(shellCss, /--font-serif: "Noto Serif SC Variable"/);
  assert.match(shellCss, /--font-mono: "Geist Mono Variable", "Noto Sans SC Variable"/);
  assert.match(authoringCss, /--crepe-font-default:\s*var\(--font-serif\)/);
  assert.match(authoringCss, /--crepe-font-code:\s*var\(--font-mono\)/);
  assert.match(authoringCss, /\.writing-composer-root/);
  assert.match(authoringJs, /Start writing/);
  assert.equal(fs.existsSync(path.join(site, "assets", "generated", "writing-preview.js")), false);
  assert.equal(fs.existsSync(path.join(site, "dictionary")), false);
  for (const id of ids) {
    const html = fs.readFileSync(path.join(site, "writing", id, "index.html"), "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="https://xayah\\.me/writing/${id}/">`));
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<meta name="x-writing-revision" content="[a-f0-9]{64}">/);
    assert.match(html, /<script type="application\/ld\+json">/);
    assert.match(html, /<html lang="en">/);
    assert.doesNotMatch(html, /"inLanguage"/);
    assert.match(html, /<time datetime="[^"]+">[A-Z][a-z]{2} \d{2}, \d{4}<\/time>/);
    assert.match(html, /<h1 class="writing-title">/);
    assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#090c10">/);
    assert.match(html, new RegExp(`href="/assets/generated/${shellMatch[1].replaceAll(".", "\\.")}"`));
    assert.match(html, new RegExp(`href="/assets/generated/${typographyMatch[1].replaceAll(".", "\\.")}"`));
    assert.match(html, /<nav class="site-nav" aria-label="Site navigation">/);
    assert.match(html, /class="section-switch-button" href="\/#writing\/2026" aria-current="page"/);
    assert.doesNotMatch(html, /class="section-switch-button"[^>]*data-auth-link/);
    const readerAsset = html.match(/href="\/assets\/generated\/(writing-reader\.[a-f0-9]{12}\.css)"/);
    assert.ok(readerAsset, "article should load the hashed reader stylesheet");
    const readerCss = fs.readFileSync(path.join(site, "assets", "generated", readerAsset[1]), "utf8");
    assert.match(readerCss, /\.writing-body[\s\S]*font-family: var\(--font-serif\)/);
    assert.match(readerCss, /\.writing-body h2[\s\S]*font-family: var\(--font-sans\)/);
    assert.match(html, new RegExp(`data-edit-writing="${id}" hidden>Edit</button>`));
    assert.match(html, /writing-article-authoring\.[a-f0-9]{12}\.js/);
    assert.match(html, /<footer class="site-footer">[\s\S]*class="footer-auth-link" data-auth-link href="\/api\/session">Log in<\/a>/);
    assert.match(html, /In solitude, where we are least alone\./);
    assert.doesNotMatch(html, /class="writing-(?:nav|footer)"/);
  }
  const catalog = fs.readFileSync(path.join(site, "writing", "catalog.js"), "utf8");
  const year = fs.readFileSync(path.join(site, "writing", "2026.js"), "utf8");
  assert.match(catalog, /"years": \[\s+2026/);
  assert.equal((year.match(/"article":/g) || []).length, ids.filter((id) => id.startsWith("2026")).length);
  const outputFiles = filesBelow(site);
  const fontFiles = outputFiles.filter((file) => file.endsWith(".woff2"));
  assert.ok(fontFiles.length > 200, "the local unicode-range font assets should be allowlisted");
  assert.ok(outputFiles.some((file) => file.endsWith("LICENSE-geist.txt")));
  assert.ok(outputFiles.some((file) => file.endsWith("LICENSE-noto-serif-sc.txt")));
  const forbidden = outputFiles.filter((file) => /\.(?:md|tex|bib|pdf)$/i.test(file));
  assert.deepEqual(forbidden, []);
  assert.equal(outputFiles.some((file) => path.basename(file).startsWith(".")), false);
  assert.equal(outputFiles.some((file) => file.includes(`${path.sep}worker${path.sep}`)), false);
  assert.equal(outputFiles.some((file) => file.includes(`${path.sep}dictionary${path.sep}`)), false);
});

test("homepage inline scripts remain syntactically valid", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  assert.ok(scripts.length >= 2);
  for (const source of scripts) assert.doesNotThrow(() => new Function(source));
});
