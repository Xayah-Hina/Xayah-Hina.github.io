import {
  deleteGoogleCalendarConnection,
  deleteGoogleOAuthState,
  getGoogleCalendarConnection,
  getGoogleCalendarConnectionVersioned,
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
const SYNC_LEASE_MS = 5 * 60 * 1000;
const TASK_OPERATION_METADATA = "xayah-google-calendar-operation";

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
    signal: AbortSignal.timeout(30_000),
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
  const response = await fetch(`${GOOGLE_API}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
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
    ...(connection?.syncLease && Date.parse(connection.syncLease.expiresAt) > Date.now() ? { syncing: true } : {}),
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
  const previous = await getGoogleCalendarConnectionVersioned(env);
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
  const connected = await putGoogleCalendarConnection(env, {
    schemaVersion: 1,
    calendarId: calendar.id,
    refreshTokenCiphertext: encrypted.ciphertext,
    refreshTokenIv: encrypted.iv,
    links: {},
    connectedAt: new Date().toISOString(),
  }, previous.etag);
  if (!connected) {
    await googleRequest<void>(token, `/calendars/${encodeURIComponent(calendar.id)}`, { method: "DELETE" }).catch(() => {});
    throw new HttpError(409, "The Google Calendar connection changed. Reconnect to try again.");
  }
  await syncGoogleCalendar(env);
  return Response.redirect(taskPageUrl(env, "connected"), 302);
}

export function googleEventId(sessionId: string): string {
  return `task${sessionId.replace("session-", "")}`;
}

function eventBody(session: TaskSession, task: TaskItem, project: TaskProject, operationId?: string): Record<string, unknown> {
  const description = [session.plan, session.outcome ? `Outcome: ${session.outcome}` : "", `Project: ${project.key} · ${project.title}`, "Managed by xayah.me Tasks."].filter(Boolean).join("\n\n");
  return {
    id: googleEventId(session.id),
    summary: `${task.code} · ${task.title}`,
    description,
    start: { dateTime: session.startsAt, timeZone: TIME_ZONE },
    end: { dateTime: session.endsAt, timeZone: TIME_ZONE },
    transparency: "opaque",
    extendedProperties: { private: {
      xayahManaged: "true", xayahSessionId: session.id, xayahTaskId: task.id,
      ...(operationId ? { xayahWriteId: operationId } : {}),
    } },
  };
}

async function eventFingerprint(session: TaskSession, task: TaskItem, project: TaskProject): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(eventBody(session, task, project))));
  return encodeBase64(new Uint8Array(digest));
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
    // Keep known event IDs so full-sync deletion tombstones can still be
    // associated with Sessions, but recheck every outbound event: a full
    // response can omit events that have disappeared since the expired cursor.
    for (const link of Object.values(connection.links)) delete link.eventFingerprint;
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

async function putEvent(token: string, connection: GoogleCalendarConnection, session: TaskSession, task: TaskItem, project: TaskProject, exists: boolean, operationId: string): Promise<GoogleEvent> {
  const body = eventBody(session, task, project, operationId);
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
  const current = await getGoogleCalendarConnectionVersioned(env);
  const connection = current.connection;
  if (!connection) return { configured: true, connected: false, status: "not_connected" };
  if (connection.syncLease && Date.parse(connection.syncLease.expiresAt) > Date.now()) {
    return { configured: true, connected: true, status: "busy" };
  }
  // All connection writes use the acquired ETag. In particular a disconnected
  // connection can never be recreated by the success or error path of a sync.
  const baseline = structuredClone(connection);
  const owner = randomHex(16);
  baseline.syncLease = { owner, expiresAt: new Date(Date.now() + SYNC_LEASE_MS).toISOString() };
  let leaseEtag = await putGoogleCalendarConnection(env, baseline, current.etag);
  if (!leaseEtag) return { configured: true, connected: true, status: "busy" };
  const renewLease = async () => {
    baseline.syncLease = { owner, expiresAt: new Date(Date.now() + SYNC_LEASE_MS).toISOString() };
    const renewed = await putGoogleCalendarConnection(env, baseline, leaseEtag);
    if (!renewed) throw new HttpError(409, "The Google Calendar connection changed during sync.");
    leaseEtag = renewed;
  };
  try {
    const token = await accessToken(env, connection);
    connection.lastError = undefined;
    if (connection.pendingTaskWrite) {
      const prior = await loadTaskStateVersioned(env);
      if (prior.customMetadata[TASK_OPERATION_METADATA] === connection.pendingTaskWrite.operationId) {
        // The Task object and its metadata are committed by one R2 put. This
        // confirms an accepted write even when its response was lost or the
        // Worker stopped before saving the connection checkpoint. Ordinary
        // Task edits preserve metadata, so later website changes stay intact.
        connection.links = structuredClone(connection.pendingTaskWrite.links);
        baseline.links = structuredClone(connection.links);
      }
      delete connection.pendingTaskWrite;
      delete baseline.pendingTaskWrite;
      await renewLease();
    }
    const changed = await listChangedEvents(token, connection);
    const versioned = await loadTaskStateVersioned(env);
    const state = cloneState(versioned.state);
    let taskDataChanged = false;
    const orphanEventIds = new Set<string>();
    const now = new Date().toISOString();

    for (const event of changed.events) {
      // Google deletion records may contain only id + status, without private
      // properties. Resolve those records only against our known event IDs.
      const sessionId = event.status === "cancelled"
        ? Object.keys(connection.links).find((id) => googleEventId(id) === event.id)
          || state.sessions.find((session) => googleEventId(session.id) === event.id)?.id
        : event.extendedProperties?.private?.xayahManaged === "true" ? event.extendedProperties.private.xayahSessionId : undefined;
      if (!sessionId) continue;
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
      const pending = connection.links[sessionId]?.pendingWrite;
      if (pending && event.extendedProperties?.private?.xayahWriteId === pending.operationId
        && range?.startsAt === pending.startsAt && range.endsAt === pending.endsAt) {
        // Google may accept a PUT/POST whose response never reaches us. Only
        // acknowledge the exact recorded operation AND range as our own echo;
        // subsequent Google moves keep private fields but change the range and
        // must still be imported through the normal conflict-checked path.
        connection.links[sessionId] = {
          googleUpdatedAt: event.updated,
          taskUpdatedAt: pending.taskUpdatedAt,
          eventFingerprint: pending.eventFingerprint,
        };
        continue;
      }
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
      const operationId = randomHex(16);
      connection.pendingTaskWrite = { operationId, links: structuredClone(connection.links) };
      baseline.pendingTaskWrite = structuredClone(connection.pendingTaskWrite);
      await renewLease();
      state.revision = randomHex(16);
      state.updatedAt = now;
      const saved = await saveSyncedTaskState(env, state, versioned.etag, {
        ...versioned.customMetadata,
        [TASK_OPERATION_METADATA]: operationId,
      });
      // A definite CAS rejection has no side effect. For an exception, retain
      // the intent so a retry can determine the outcome from object metadata.
      if (!saved) {
        delete connection.pendingTaskWrite;
        delete baseline.pendingTaskWrite;
        throw new HttpError(409, "Tasks changed during Google Calendar sync; the next sync will retry.");
      }
      delete connection.pendingTaskWrite;
      delete baseline.pendingTaskWrite;
    }
    // Only mark Google edits handled after their Task write succeeds. Retain
    // this checkpoint if a later remote write fails, so replaying the old
    // cursor cannot apply the same edit over a newer website change.
    baseline.links = structuredClone(connection.links);

    for (const id of orphanEventIds) {
      await renewLease();
      await deleteEvent(token, connection.calendarId, id);
    }
    const sessionsById = new Map(state.sessions.map((session) => [session.id, session]));
    for (const sessionId of Object.keys(connection.links)) {
      if (sessionsById.has(sessionId)) continue;
      await renewLease();
      await deleteEvent(token, connection.calendarId, googleEventId(sessionId));
      delete connection.links[sessionId];
      delete baseline.links[sessionId];
    }
    const tasksById = new Map(state.tasks.map((task) => [task.id, task]));
    const projectsById = new Map(state.projects.map((project) => [project.id, project]));
    for (const session of state.sessions) {
      const task = tasksById.get(session.taskId);
      const project = task && projectsById.get(task.projectId);
      if (!task || !project) continue;
      const link = connection.links[session.id];
      const fingerprint = await eventFingerprint(session, task, project);
      if (link?.eventFingerprint === fingerprint) continue;
      const operationId = randomHex(16);
      connection.links[session.id] = {
        ...link || { googleUpdatedAt: "", taskUpdatedAt: "" },
        pendingWrite: { operationId, startsAt: session.startsAt, endsAt: session.endsAt, eventFingerprint: fingerprint, taskUpdatedAt: session.updatedAt },
      };
      baseline.links[session.id] = structuredClone(connection.links[session.id]!);
      // Persist intent before the remote side effect, including on lease
      // takeover. Response loss must not turn our old output into user input.
      await renewLease();
      const event = await putEvent(token, connection, session, task, project, Boolean(link), operationId);
      connection.links[session.id] = {
        googleUpdatedAt: event.updated || new Date().toISOString(),
        taskUpdatedAt: session.updatedAt,
        eventFingerprint: fingerprint,
      };
      baseline.links[session.id] = { ...connection.links[session.id]! };
    }
    connection.syncToken = changed.syncToken;
    connection.lastSyncedAt = new Date().toISOString();
    delete connection.syncLease;
    if (!await putGoogleCalendarConnection(env, connection, leaseEtag)) throw new HttpError(409, "The Google Calendar connection changed during sync.");
    return { configured: true, connected: true, status: "synced", lastSyncedAt: connection.lastSyncedAt, changed: taskDataChanged };
  } catch (error) {
    // A failed Task CAS preserves the original links; successful Task changes
    // keep their checkpoint. The cursor advances only after a complete sync.
    baseline.lastError = error instanceof Error ? error.message : "Google Calendar sync failed.";
    delete baseline.syncLease;
    await putGoogleCalendarConnection(env, baseline, leaseEtag).catch(() => null);
    throw error;
  }
}

export async function disconnectGoogleCalendar(env: Env): Promise<Record<string, unknown>> {
  const current = await getGoogleCalendarConnectionVersioned(env);
  const connection = current.connection;
  if (!connection) return { disconnected: true };
  if (!current.etag || !await deleteGoogleCalendarConnection(env, current.etag)) {
    throw new HttpError(409, "The Google Calendar connection changed. Try disconnecting again.");
  }
  let warning: string | null = null;
  try {
    await googleRequest<void>(await accessToken(env, connection), `/calendars/${encodeURIComponent(connection.calendarId)}`, { method: "DELETE" });
  } catch (error) {
    warning = error instanceof Error ? error.message : "The dedicated Google calendar could not be deleted.";
  }
  return { disconnected: true, warning };
}
