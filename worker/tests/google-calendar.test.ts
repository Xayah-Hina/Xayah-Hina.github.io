import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  beginGoogleCalendarConnection,
  disconnectGoogleCalendar,
  googleCalendarStatus,
  syncGoogleCalendar,
} from "../src/google-calendar.ts";

function environment(configured = true) {
  const objects = new Map<string, string>();
  const content = {
    async get(key: string) {
      const value = objects.get(key);
      return value === undefined ? null : { async json<T>() { return JSON.parse(value) as T; } };
    },
    async put(key: string, value: unknown) {
      objects.set(key, typeof value === "string" ? value : new TextDecoder().decode(value as Uint8Array));
      return { etag: "etag" };
    },
    async delete(key: string) { objects.delete(key); },
  };
  return {
    env: {
      CONTENT: content,
      PUBLIC_SITE_ORIGIN: "https://xayah.me",
      ...(configured ? {
        GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "secret",
        GOOGLE_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
      } : {}),
    } as never,
    objects,
  };
}

test("Google Calendar status is explicit when OAuth is not configured", async () => {
  const { env } = environment(false);
  assert.deepEqual(await googleCalendarStatus(env), {
    configured: false,
    connected: false,
    calendarName: null,
    lastSyncedAt: null,
    lastError: null,
  });
  assert.deepEqual(await syncGoogleCalendar(env), { configured: false, connected: false, status: "not_configured" });
});

test("Google OAuth connection uses the narrow app-created-calendar scope and expiring state", async () => {
  const { env, objects } = environment();
  const response = await beginGoogleCalendarConnection(env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.app.created");
  assert.equal(location.searchParams.get("redirect_uri"), "https://xayah.me/api/tasks/google/callback");
  assert.equal(location.searchParams.get("access_type"), "offline");
  const state = JSON.parse(objects.get("private/tasks/google-oauth-state.json")!);
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.value, location.searchParams.get("state"));
  assert.ok(Date.parse(state.expiresAt) > Date.now());
  assert.deepEqual(await disconnectGoogleCalendar(env), { disconnected: true });
});
