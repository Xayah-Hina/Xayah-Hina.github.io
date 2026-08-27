import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const lightboxStyle = html.match(/\.journal-lightbox \{([^}]+)\}/)?.[1] || "";

test("Journal lightbox stays in the viewport and preserves the page position", () => {
  assert.match(lightboxStyle, /position: fixed;/);
  assert.match(lightboxStyle, /inset: 50% auto auto 50%;/);
  assert.match(lightboxStyle, /transform: translate\(-50%, -50%\);/);
  assert.match(html, /lightbox\.returnScroll = \{\s*left: window\.scrollX,\s*top: window\.scrollY\s*\};/);
  assert.match(html, /showModal\(\);\s*lightbox\.dialog\.querySelector\([^\n]+\)\.focus\(\{ preventScroll: true \}\);\s*window\.scrollTo\(lightbox\.returnScroll\.left, lightbox\.returnScroll\.top\);/);
  assert.match(html, /if \(trigger\?\.isConnected\) trigger\.focus\(\{ preventScroll: true \}\);\s*if \(returnScroll\) window\.scrollTo\(returnScroll\.left, returnScroll\.top\);/);
});
