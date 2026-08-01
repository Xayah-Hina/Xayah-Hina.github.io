import assert from "node:assert/strict";
import test from "node:test";
import { endpointAllowed, publicMonthlyPlanMonth, sessionResponse } from "../src/index.ts";

test("public API scopes expose only their own authoring endpoints", () => {
  assert.equal(endpointAllowed("main", "/api/session"), true);
  assert.equal(endpointAllowed("main", "/api/authoring/status"), true);
  assert.equal(endpointAllowed("main", "/api/editor/status"), false);
  assert.equal(endpointAllowed("main", "/api/writing/open"), true);
  assert.equal(endpointAllowed("main", "/api/journal/save"), true);
  assert.equal(endpointAllowed("main", "/api/dictionary/open"), false);

  assert.equal(endpointAllowed("dictionary", "/api/session"), true);
  assert.equal(endpointAllowed("dictionary", "/api/dictionary/open"), true);
  assert.equal(endpointAllowed("dictionary", "/api/writing/open"), false);
  assert.equal(endpointAllowed("dictionary", "/api/journal/save"), false);
  assert.equal(publicMonthlyPlanMonth("/data/monthly-plans/2026-08"), "2026-08");
  assert.equal(publicMonthlyPlanMonth("/data/monthly-plans/2026-13"), null);
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
