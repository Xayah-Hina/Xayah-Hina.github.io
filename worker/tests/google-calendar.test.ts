import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  beginGoogleCalendarConnection,
  disconnectGoogleCalendar,
  finishGoogleCalendarConnection,
  googleEventId,
  googleCalendarStatus,
  syncGoogleCalendar,
} from "../src/google-calendar.ts";

test("Google event IDs use only Calendar base32hex characters", () => {
  const id = googleEventId("session-ace96059a587abd55886e8d9");
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.equal(id, "taskace96059a587abd55886e8d9");
});

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

test("Google Calendar creates a cross-day event with the canonical Session range", async () => {
  const { env, objects } = environment();
  const startsAt = "2026-09-02T15:30:00.000Z";
  const endsAt = "2026-09-02T17:00:00.000Z";
  objects.set("published/tasks/state.json", JSON.stringify({
    schemaVersion: 6,
    revision: "0123456789abcdef0123456789abcdef",
    updatedAt: "2026-09-02T12:00:00.000Z",
    projects: [{ id: "project-0123456789abcdef01234567", key: "FLOW", title: "Flow", description: "", color: "#7c3aed", status: "active", createdAt: "2026-09-02T12:00:00.000Z", updatedAt: "2026-09-02T12:00:00.000Z" }],
    tasks: [{ id: "task-0123456789abcdef01234567", code: "FLOW-2026-0001", projectId: "project-0123456789abcdef01234567", title: "Lecture note", objective: "", position: 0, createdAt: "2026-09-02T12:00:00.000Z", updatedAt: "2026-09-02T12:00:00.000Z" }],
    sessions: [{ id: "session-ace96059a587abd55886e8d9", taskId: "task-0123456789abcdef01234567", startsAt, endsAt, plan: "Write overnight.", outcome: "", state: "scheduled", createdAt: "2026-09-02T12:00:00.000Z", updatedAt: "2026-09-02T12:00:00.000Z" }],
    contributions: [],
  }));
  const connect = await beginGoogleCalendarConnection(env);
  const state = new URL(connect.headers.get("location")!).searchParams.get("state")!;
  let createdEvent: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      const body = String(init?.body || "");
      return Response.json(body.includes("authorization_code")
        ? { access_token: "connect-token", refresh_token: "refresh-token" }
        : { access_token: "sync-token" });
    }
    if (url.endsWith("/calendar/v3/calendars") && init?.method === "POST") return Response.json({ id: "xayah-tasks@group.calendar.google.com" });
    if (url.includes("/events?") && !init?.method) return Response.json({ items: [], nextSyncToken: "next-sync-token" });
    if (url.endsWith("/events") && init?.method === "POST") {
      createdEvent = JSON.parse(String(init.body));
      return Response.json({ id: createdEvent!.id, updated: "2026-09-02T12:01:00.000Z" });
    }
    throw new Error(`Unexpected Google request: ${url}`);
  }) as typeof fetch;
  try {
    const response = await finishGoogleCalendarConnection(env, new URL(`https://xayah.me/api/tasks/google/callback?code=code&state=${state}`));
    assert.equal(response.status, 302);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(createdEvent!.id, "taskace96059a587abd55886e8d9");
  assert.deepEqual(createdEvent!.start, { dateTime: startsAt, timeZone: "Asia/Singapore" });
  assert.deepEqual(createdEvent!.end, { dateTime: endsAt, timeZone: "Asia/Singapore" });
  const connection = JSON.parse(objects.get("private/tasks/google-calendar.json")!);
  assert.equal(connection.lastError, undefined);
  assert.equal(connection.links["session-ace96059a587abd55886e8d9"].taskUpdatedAt, "2026-09-02T12:00:00.000Z");
});
