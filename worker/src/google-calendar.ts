import {
  deleteGoogleCalendarConnection,
  deleteGoogleOAuthState,
  getGoogleCalendarConnection,
  getGoogleOAuthState,
  putGoogleCalendarConnection,
  putGoogleOAuthState,
} from "./storage";
import {
  loadTaskStateVersioned,
  saveSyncedTaskState,
  sessionsOverlap,
} from "./tasks";
import type {
  Env,
  GoogleCalendarConnection,
  TaskItem,
  TaskProject,
  TaskSession,
  TaskState,
} from "./types";
import { decodeBase64, encodeBase64, HttpError, randomHex } from "./utils";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TIME_ZONE = "Asia/Singapore";
const CALENDAR_NAME = "Xayah Tasks";

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  updated?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

class GoogleApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function configured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_TOKEN_KEY);
}

function requireConfiguration(env: Env): asserts env is Env & Required<Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_TOKEN_KEY">> {
  if (!configured(env)) throw new HttpError(503, "Google Calendar OAuth is not configured yet.");
}

function callbackUrl(env: Env): string {
  return new URL("/api/tasks/google/callback", env.PUBLIC_SITE_ORIGIN).toString();
}

function taskPageUrl(env: Env, result: "connected" | "error"): string {
  const url = new URL(env.PUBLIC_SITE_ORIGIN);
  url.searchParams.set("calendar", result);
  url.hash = "task";
  return url.toString();
}

async function tokenKey(env: Env): Promise<CryptoKey> {
  requireConfiguration(env);
  const bytes = decodeBase64(env.GOOGLE_TOKEN_KEY);
  if (bytes.byteLength !== 32) throw new HttpError(503, "GOOGLE_TOKEN_KEY must contain exactly 32 random bytes in base64.");
  return crypto.subtle.importKey("raw", arrayBuffer(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptRefreshToken(env: Env, token: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(env), new TextEncoder().encode(token));
  return { ciphertext: encodeBase64(new Uint8Array(ciphertext)), iv: encodeBase64(iv) };
}

async function decryptRefreshToken(env: Env, connection: GoogleCalendarConnection): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: arrayBuffer(decodeBase64(connection.refreshTokenIv)) },
      await tokenKey(env),
      arrayBuffer(decodeBase64(connection.refreshTokenCiphertext)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new HttpError(503, "The stored Google Calendar authorization can no longer be decrypted. Reconnect it.");
  }
}

async function exchangeToken(env: Env, values: Record<string, string>): Promise<Record<string, unknown>> {
  requireConfiguration(env);
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...values }),
  });
  const data: Record<string, unknown> = await response.json<Record<string, unknown>>().catch(() => ({}));
  if (!response.ok) throw new GoogleApiError(response.status, String(data.error_description || data.error || "Google OAuth rejected the request."));
  return data;
}

async function accessToken(env: Env, connection: GoogleCalendarConnection): Promise<string> {
  const data = await exchangeToken(env, {
    grant_type: "refresh_token",
    refresh_token: await decryptRefreshToken(env, connection),
  });
  if (typeof data.access_token !== "string") throw new GoogleApiError(502, "Google OAuth did not return an access token.");
  return data.access_token;
}

async function googleRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json; charset=utf-8");
  const response = await fetch(`${GOOGLE_API}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const data: Record<string, unknown> = await response.json<Record<string, unknown>>().catch(() => ({}));
  if (!response.ok) {
    const nested = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : null;
    throw new GoogleApiError(response.status, String(nested?.message || data.error || "Google Calendar rejected the request."));
  }
  return data as T;
}

export async function googleCalendarStatus(env: Env): Promise<Record<string, unknown>> {
  const connection = await getGoogleCalendarConnection(env);
  return {
    configured: configured(env),
    connected: Boolean(connection),
    calendarName: connection ? CALENDAR_NAME : null,
    lastSyncedAt: connection?.lastSyncedAt || null,
    lastError: connection?.lastError || null,
  };
}

export async function beginGoogleCalendarConnection(env: Env): Promise<Response> {
  requireConfiguration(env);
  const value = randomHex(24);
  await putGoogleOAuthState(env, {
    schemaVersion: 1,
    value,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(env),
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: value,
  }).toString();
  return Response.redirect(url.toString(), 302);
}

export async function finishGoogleCalendarConnection(env: Env, url: URL): Promise<Response> {
  requireConfiguration(env);
  const savedState = await getGoogleOAuthState(env);
  await deleteGoogleOAuthState(env);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (url.searchParams.has("error")) return Response.redirect(taskPageUrl(env, "error"), 302);
  if (!savedState || savedState.value !== state || Date.parse(savedState.expiresAt) < Date.now() || !code) {
    throw new HttpError(400, "The Google Calendar authorization response is invalid or expired.");
  }
  const tokenData = await exchangeToken(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(env),
  });
  if (typeof tokenData.refresh_token !== "string") throw new HttpError(502, "Google did not return long-lived calendar access. Reconnect and grant access.");
  const token = String(tokenData.access_token || "");
  if (!token) throw new HttpError(502, "Google did not return calendar access.");
  const calendar = await googleRequest<{ id?: string }>(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: CALENDAR_NAME, timeZone: TIME_ZONE }),
  });
  if (!calendar.id) throw new HttpError(502, "Google did not return the new calendar identifier.");
  const encrypted = await encryptRefreshToken(env, tokenData.refresh_token);
  await putGoogleCalendarConnection(env, {
    schemaVersion: 1,
    calendarId: calendar.id,
    refreshTokenCiphertext: encrypted.ciphertext,
    refreshTokenIv: encrypted.iv,
    links: {},
    connectedAt: new Date().toISOString(),
  });
  await syncGoogleCalendar(env);
  return Response.redirect(taskPageUrl(env, "connected"), 302);
}

export function googleEventId(sessionId: string): string {
  return `task${sessionId.replace("session-", "")}`;
}

function eventBody(session: TaskSession, task: TaskItem, project: TaskProject): Record<string, unknown> {
  const description = [session.plan, session.outcome ? `Outcome: ${session.outcome}` : "", `Project: ${project.key} · ${project.title}`, "Managed by xayah.me Tasks."].filter(Boolean).join("\n\n");
  return {
    id: googleEventId(session.id),
    summary: `${task.code} · ${task.title}`,
    description,
    start: { dateTime: session.startsAt, timeZone: TIME_ZONE },
    end: { dateTime: session.endsAt, timeZone: TIME_ZONE },
    transparency: "opaque",
    extendedProperties: { private: { xayahManaged: "true", xayahSessionId: session.id, xayahTaskId: task.id } },
  };
}

function eventRange(event: GoogleEvent): Pick<TaskSession, "startsAt" | "endsAt"> | null {
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  const start = Date.parse(event.start.dateTime);
  const end = Date.parse(event.end.dateTime);
  const duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || duration < 15 * 60 * 1000 || duration > 24 * 60 * 60 * 1000) return null;
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}

async function changedEvents(token: string, connection: GoogleCalendarConnection): Promise<{ events: GoogleEvent[]; syncToken: string }> {
  const events: GoogleEvent[] = [];
  let pageToken = "";
  let nextSyncToken = "";
  do {
    const query = new URLSearchParams({ showDeleted: "true", singleEvents: "true", maxResults: "2500" });
    if (connection.syncToken) query.set("syncToken", connection.syncToken);
    if (pageToken) query.set("pageToken", pageToken);
    const page = await googleRequest<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
      token,
      `/calendars/${encodeURIComponent(connection.calendarId)}/events?${query}`,
    );
    events.push(...(page.items || []));
    pageToken = page.nextPageToken || "";
    nextSyncToken = page.nextSyncToken || nextSyncToken;
  } while (pageToken);
  if (!nextSyncToken) throw new GoogleApiError(502, "Google Calendar did not return an incremental sync token.");
  return { events, syncToken: nextSyncToken };
}

async function listChangedEvents(token: string, connection: GoogleCalendarConnection): Promise<{ events: GoogleEvent[]; syncToken: string }> {
  try {
    return await changedEvents(token, connection);
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 410 || !connection.syncToken) throw error;
    connection.syncToken = undefined;
    connection.links = {};
    return changedEvents(token, connection);
  }
}

async function deleteEvent(token: string, calendarId: string, id: string): Promise<void> {
  try {
    await googleRequest<void>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return;
    throw error;
  }
}

async function putEvent(token: string, connection: GoogleCalendarConnection, session: TaskSession, task: TaskItem, project: TaskProject, exists: boolean): Promise<GoogleEvent> {
  const body = eventBody(session, task, project);
  const id = googleEventId(session.id);
  if (exists) {
    try {
      return await googleRequest<GoogleEvent>(token, `/calendars/${encodeURIComponent(connection.calendarId)}/events/${id}`, { method: "PUT", body: JSON.stringify(body) });
    } catch (error) {
      if (!(error instanceof GoogleApiError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
  }
  try {
    return await googleRequest<GoogleEvent>(token, `/calendars/${encodeURIComponent(connection.calendarId)}/events`, { method: "POST", body: JSON.stringify(body) });
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
    return googleRequest<GoogleEvent>(token, `/calendars/${encodeURIComponent(connection.calendarId)}/events/${id}`, { method: "PUT", body: JSON.stringify(body) });
  }
}

function cloneState(state: TaskState): TaskState {
  return {
    ...state,
    projects: state.projects.map((project) => ({ ...project })),
    tasks: state.tasks.map((task) => ({ ...task })),
    sessions: state.sessions.map((session) => ({ ...session })),
    contributions: state.contributions.map((contribution) => ({ ...contribution })),
  };
}

export async function syncGoogleCalendar(env: Env): Promise<Record<string, unknown>> {
  if (!configured(env)) return { configured: false, connected: false, status: "not_configured" };
  const connection = await getGoogleCalendarConnection(env);
  if (!connection) return { configured: true, connected: false, status: "not_connected" };
  try {
    const token = await accessToken(env, connection);
    connection.lastError = undefined;
    const changed = await listChangedEvents(token, connection);
    const versioned = await loadTaskStateVersioned(env);
    let state = cloneState(versioned.state);
    let taskDataChanged = false;
    const orphanEventIds = new Set<string>();
    const now = new Date().toISOString();

    for (const event of changed.events) {
      const sessionId = event.extendedProperties?.private?.xayahSessionId;
      if (!sessionId || event.extendedProperties?.private?.xayahManaged !== "true") continue;
      const sessionIndex = state.sessions.findIndex((candidate) => candidate.id === sessionId);
      const session = state.sessions[sessionIndex];
      if (event.status === "cancelled") {
        if (session?.state === "scheduled") {
          state.sessions.splice(sessionIndex, 1);
          taskDataChanged = true;
        } else if (session) {
          delete connection.links[sessionId];
        }
        continue;
      }
      if (!session) {
        if (event.id) orphanEventIds.add(event.id);
        delete connection.links[sessionId];
        continue;
      }
      if (!event.updated || connection.links[sessionId]?.googleUpdatedAt === event.updated) continue;
      const range = eventRange(event);
      if (range && !sessionsOverlap({ id: session.id, ...range }, state.sessions)) {
        if (session.startsAt !== range.startsAt || session.endsAt !== range.endsAt) {
          session.startsAt = range.startsAt;
          session.endsAt = range.endsAt;
          session.updatedAt = now;
          taskDataChanged = true;
        }
        connection.links[sessionId] = { googleUpdatedAt: event.updated, taskUpdatedAt: "" };
      } else {
        connection.lastError = range
          ? "A Google Calendar edit overlapped another Task Session and was restored."
          : "A Google Calendar edit lost its time range or exceeded 24 hours and was restored.";
        connection.links[sessionId] = { googleUpdatedAt: event.updated, taskUpdatedAt: "" };
      }
    }

    if (taskDataChanged) {
      state.revision = randomHex(16);
      state.updatedAt = now;
      if (!await saveSyncedTaskState(env, state, versioned.etag)) throw new HttpError(409, "Tasks changed during Google Calendar sync; the next sync will retry.");
    }

    for (const id of orphanEventIds) await deleteEvent(token, connection.calendarId, id);
    const sessionsById = new Map(state.sessions.map((session) => [session.id, session]));
    for (const sessionId of Object.keys(connection.links)) {
      if (sessionsById.has(sessionId)) continue;
      await deleteEvent(token, connection.calendarId, googleEventId(sessionId));
      delete connection.links[sessionId];
    }
    const tasksById = new Map(state.tasks.map((task) => [task.id, task]));
    const projectsById = new Map(state.projects.map((project) => [project.id, project]));
    for (const session of state.sessions) {
      const task = tasksById.get(session.taskId);
      const project = task && projectsById.get(task.projectId);
      if (!task || !project) continue;
      const link = connection.links[session.id];
      if (link?.taskUpdatedAt === session.updatedAt) continue;
      const event = await putEvent(token, connection, session, task, project, Boolean(link));
      connection.links[session.id] = {
        googleUpdatedAt: event.updated || new Date().toISOString(),
        taskUpdatedAt: session.updatedAt,
      };
    }
    connection.syncToken = changed.syncToken;
    connection.lastSyncedAt = new Date().toISOString();
    await putGoogleCalendarConnection(env, connection);
    return { configured: true, connected: true, status: "synced", lastSyncedAt: connection.lastSyncedAt, changed: taskDataChanged };
  } catch (error) {
    connection.lastError = error instanceof Error ? error.message : "Google Calendar sync failed.";
    await putGoogleCalendarConnection(env, connection);
    throw error;
  }
}

export async function disconnectGoogleCalendar(env: Env): Promise<Record<string, unknown>> {
  const connection = await getGoogleCalendarConnection(env);
  if (!connection) return { disconnected: true };
  let warning: string | null = null;
  try {
    await googleRequest<void>(await accessToken(env, connection), `/calendars/${encodeURIComponent(connection.calendarId)}`, { method: "DELETE" });
  } catch (error) {
    warning = error instanceof Error ? error.message : "The dedicated Google calendar could not be deleted.";
  }
  await deleteGoogleCalendarConnection(env);
  return { disconnected: true, warning };
}
