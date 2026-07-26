import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const site = path.join(root, "_site");
const ids = [
  "20260715-090945",
  "20260717-034749",
  "20260717-061303",
  "20260717-124940",
];

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

test("allowlisted build produces four static articles and no source artifacts", () => {
  execFileSync(process.execPath, ["scripts/build-site.mjs"], { cwd: root, stdio: "pipe" });
  for (const id of ids) {
    const html = fs.readFileSync(path.join(site, "writing", id, "index.html"), "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="https://xayah\\.me/writing/${id}/">`));
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<meta name="x-writing-revision" content="[a-f0-9]{64}">/);
    assert.match(html, /<script type="application\/ld\+json">/);
    assert.match(html, /<h1 class="writing-title">/);
  }
  const catalog = fs.readFileSync(path.join(site, "writing", "catalog.js"), "utf8");
  const year = fs.readFileSync(path.join(site, "writing", "2026.js"), "utf8");
  assert.match(catalog, /"years": \[\s+2026/);
  assert.equal((year.match(/"article":/g) || []).length, 4);
  const forbidden = filesBelow(site).filter((file) => /\.(?:md|tex|bib|pdf)$/i.test(file));
  assert.deepEqual(forbidden, []);
  assert.equal(filesBelow(site).some((file) => file.includes(`${path.sep}worker${path.sep}`)), false);
});

test("homepage inline scripts remain syntactically valid", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  assert.ok(scripts.length >= 2);
  for (const source of scripts) assert.doesNotThrow(() => new Function(source));
});
