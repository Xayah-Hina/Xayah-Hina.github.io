import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleSource = (value) => `export default ${JSON.stringify(value, null, 2)};\n`;

function filesBelow(directory, nested = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(nested, entry.name);
    return entry.isDirectory() ? filesBelow(path.join(directory, entry.name), relative) : [relative.replaceAll("\\", "/")];
  });
}

function build(journals, output) {
  return execFileSync(process.execPath, ["scripts/build-site.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      XAYAH_JOURNALS_ROOT: journals,
      XAYAH_BUILD_OUTPUT: output,
    },
    stdio: "pipe",
  });
}

test("Journal build publishes only validated catalog modules and rejects unsafe data", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "xayah-journal-build-"));
  const journals = path.join(temporary, "journals");
  const output = path.join(temporary, "site");
  try {
    fs.cpSync(path.join(root, "journals"), journals, { recursive: true });
    fs.writeFileSync(path.join(journals, "secret.txt"), "must not be published");
    fs.mkdirSync(path.join(journals, "private"));
    fs.writeFileSync(path.join(journals, "private", "token.js"), "export default 'secret';\n");

    build(journals, output);

    const catalogUrl = `${pathToFileURL(path.join(output, "journals", "catalog.js")).href}?test=${Date.now()}`;
    const catalog = (await import(catalogUrl)).default;
    const expected = [
      "catalog.js",
      ...catalog.years.map((year) => `${year}.js`),
    ].sort();
    assert.deepEqual(filesBelow(path.join(output, "journals")).sort(), expected);
    assert.equal(fs.existsSync(path.join(output, "journals", "secret.txt")), false);
    assert.equal(fs.existsSync(path.join(output, "journals", "private")), false);

    const entriesPath = path.join(journals, `${catalog.years[0]}.js`);
    const entries = (await import(`${pathToFileURL(entriesPath).href}?test=${Date.now()}`)).default;
    entries[0].images.push({ src: "javascript:alert(1)", alt: "unsafe" });
    fs.writeFileSync(entriesPath, moduleSource(entries));
    fs.writeFileSync(path.join(output, "preflight-marker"), "preserved");

    assert.throws(() => build(journals, output), (error) => {
      assert.match(String(error.stderr), /unsafe image URL/);
      return true;
    });
    assert.equal(fs.readFileSync(path.join(output, "preflight-marker"), "utf8"), "preserved");
    assert.doesNotMatch(fs.readFileSync(path.join(output, "journals", `${catalog.years[0]}.js`), "utf8"), /javascript:/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
