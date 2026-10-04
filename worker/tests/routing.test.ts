import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import worker, { endpointAllowed, isPublicDataPath, sessionResponse } from "../src/index.ts";

test("public API scopes expose only their own authoring endpoints", () => {
  assert.equal(endpointAllowed("main", "/api/session"), true);
  assert.equal(endpointAllowed("main", "/api/authoring/status"), true);
  assert.equal(endpointAllowed("main", "/api/editor/status"), false);
  assert.equal(endpointAllowed("main", "/api/writing/open"), true);
  assert.equal(endpointAllowed("main", "/api/journal/save"), true);
  assert.equal(endpointAllowed("main", "/api/tasks/save"), true);
  assert.equal(endpointAllowed("main", "/api/tasks/google/connect"), true);
  assert.equal(endpointAllowed("main", "/api/dictionary/open"), false);

  assert.equal(endpointAllowed("dictionary", "/api/session"), true);
  assert.equal(endpointAllowed("dictionary", "/api/dictionary/open"), true);
  assert.equal(endpointAllowed("dictionary", "/api/writing/open"), false);
  assert.equal(endpointAllowed("dictionary", "/api/journal/save"), false);
  assert.equal(isPublicDataPath("/data/tasks"), true);
  assert.equal(isPublicDataPath("/data/journal/catalog"), true);
  assert.equal(isPublicDataPath("/data/journal/year/2026"), true);
  assert.equal(isPublicDataPath("/data/journal/year/latest"), false);
  assert.equal(isPublicDataPath("/data/tasks/old"), false);
});

test("session return redirects stay on the requesting origin", () => {
  const response = sessionResponse(new URL("https://xayah.me/api/session?return=%2Fwriting%2F20260715-090945%2F%23section"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://xayah.me/writing/20260715-090945/#section");

  assert.throws(
    () => sessionResponse(new URL("https://xayah.me/api/session?return=%2F%2Fevil.example")),
    /return path is invalid/,
  );
  assert.throws(
    () => sessionResponse(new URL("https://xayah.me/api/session?return=%2F%5Cevil.example")),
    /return path is invalid/,
  );
});

test("public Journal data does not depend on an Access session", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.match(url.pathname, /\/contents\/journals\/catalog\.js$/);
    const source = 'export default {"years":[2026]};\n';
    return Response.json({
      type: "file",
      path: "journals/catalog.js",
      sha: "a".repeat(40),
      encoding: "base64",
      content: Buffer.from(source).toString("base64"),
    });
  };
  const env = {
    MEDIA_ORIGIN: "https://media.xayah.me",
    PUBLIC_SITE_ORIGIN: "https://xayah.me",
    DICTIONARY_ORIGIN: "https://dictionary.xayah.me",
    GITHUB_OWNER: "Xayah-Hina",
    GITHUB_REPO: "Xayah-Hina.github.io",
    GITHUB_BRANCH: "master",
    GITHUB_TOKEN: "test-token",
  } as never;
  try {
    const response = await worker.fetch(
      new Request("https://xayah.me/data/journal/catalog"),
      env,
      {} as never,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { years: ["2026"] });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    globalThis.fetch = original;
  }
});

test("unexpected Worker failures do not disclose internal error details", async () => {
  const env = {
    MEDIA_ORIGIN: "not a URL",
    PUBLIC_SITE_ORIGIN: "https://xayah.me",
    DICTIONARY_ORIGIN: "https://dictionary.xayah.me",
  } as never;
  const original = console.error;
  console.error = () => {};
  const response = await worker.fetch(new Request("https://xayah.me/api/session"), env, {} as never);
  console.error = original;
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "The authoring backend encountered an unexpected error." });
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
});

test("Worker-owned HTTP routes redirect to HTTPS", async () => {
  const response = await worker.fetch(
    new Request("http://media.xayah.me/writing/20260715-090945/example.png"),
    {} as never,
    {} as never,
  );
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://media.xayah.me/writing/20260715-090945/example.png");
});
