import assert from "node:assert/strict";
import test from "node:test";
import { HttpError, readJsonObject } from "../src/utils.ts";

test("JSON request limits apply even without a Content-Length header", async () => {
  const request = new Request("https://xayah.me/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(100) }),
  });
  request.headers.delete("content-length");
  await assert.rejects(
    readJsonObject(request, 32),
    (error: unknown) => error instanceof HttpError && error.status === 413,
  );
});
