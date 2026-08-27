import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("Journal lightbox preserves the page position while managing focus", () => {
  assert.match(html, /lightbox\.returnScroll = \{\s*left: window\.scrollX,\s*top: window\.scrollY\s*\};/);
  assert.match(html, /showModal\(\);\s*lightbox\.dialog\.querySelector\([^\n]+\)\.focus\(\{ preventScroll: true \}\);\s*window\.scrollTo\(lightbox\.returnScroll\.left, lightbox\.returnScroll\.top\);/);
  assert.match(html, /if \(trigger\?\.isConnected\) trigger\.focus\(\{ preventScroll: true \}\);\s*if \(returnScroll\) window\.scrollTo\(returnScroll\.left, returnScroll\.top\);/);
});
