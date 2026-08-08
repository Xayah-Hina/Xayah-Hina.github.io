import { verifyAccess } from "./auth";
import { dictionaryStatus, openDictionary, publishDictionary, saveDictionary } from "./dictionary";
import {
  authoringJournalCatalogData,
  authoringJournalYearData,
  deleteJournal,
  journalYears,
  saveJournal,
  saveMonthlyNote,
} from "./journal";
import { monthlyPlansResponse, saveMonthlyPlan, saveMonthlyPlanCheckIns } from "./monthly-plans";
import type { Env } from "./types";
import { HttpError, jsonResponse, readJsonObject } from "./utils";
import {
  createWriting,
  deleteWriting,
  authoringWritingCatalogData,
  authoringWritingYearData,
  openWriting,
  pendingWriting,
  previewWritingAsset,
  publishWriting,
  saveWriting,
  uploadWritingAsset,
  writingDeploymentStatus,
} from "./writing";

type ApiScope = "main" | "dictionary";

async function authoringStatus(env: Env, scope: ApiScope): Promise<Response> {
  let journalError: string | null = null;
  let writingError: string | null = null;
  let dictionaryError: string | null = null;
  let writingPending = false;
  let dictionaryPending = false;
  let dictionaryPendingCount = 0;
  if (scope !== "dictionary") {
    try {
      await journalYears(env);
    } catch (error) {
      journalError = error instanceof Error ? error.message : "Journal data could not be loaded.";
    }
    try {
      writingPending = await pendingWriting(env);
    } catch (error) {
      writingError = error instanceof Error ? error.message : "Writing data could not be loaded.";
    }
  }
  if (scope !== "main") {
    try {
      const status = await dictionaryStatus(env);
      dictionaryPending = status.pending;
      dictionaryPendingCount = status.pendingCount;
    } catch (error) {
      dictionaryError = error instanceof Error ? error.message : "Dictionary data could not be loaded.";
    }
  }
  return jsonResponse({
    journalError,
    writingError,
    dictionaryError,
    publishing: {
      enabled: true,
      state: "ready",
      message: "Cloud publishing is ready.",
      branch: env.GITHUB_BRANCH,
      writingPending,
      dictionaryPending,
      dictionaryPendingCount,
    },
  });
}

export function endpointAllowed(scope: ApiScope, pathname: string): boolean {
  if (pathname === "/api/session" || pathname === "/api/authoring/status") return true;
  if (scope === "main") return pathname.startsWith("/api/writing/") || pathname.startsWith("/api/journal/");
  return pathname.startsWith("/api/dictionary/");
}

export function publicMonthlyPlanMonth(pathname: string): string | null {
  return /^\/data\/monthly-plans\/(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(pathname)?.[1] || null;
}

export function sessionResponse(url: URL): Response {
  const returnPath = url.searchParams.get("return");
  if (returnPath) {
    const target = new URL(returnPath, url.origin);
    if (!returnPath.startsWith("/") || target.origin !== url.origin) {
      throw new HttpError(400, "The login return path is invalid.");
    }
    return Response.redirect(target.toString(), 302);
  }
  return jsonResponse({ authenticated: true, canEdit: true });
}

async function authoringApi(request: Request, env: Env, url: URL, scope: ApiScope): Promise<Response> {
  if (!endpointAllowed(scope, url.pathname)) throw new HttpError(404, "Unknown authoring endpoint.");
  if (request.method === "GET" && url.pathname === "/api/session") return sessionResponse(url);
  if (request.method === "GET" && url.pathname === "/api/authoring/status") return authoringStatus(env, scope);
  if (request.method === "GET" && url.pathname === "/api/writing/catalog") {
    return jsonResponse(await authoringWritingCatalogData(env));
  }
  if (request.method === "GET" && url.pathname === "/api/journal/catalog") {
    return jsonResponse(await authoringJournalCatalogData(env));
  }
  const journalYear = url.pathname.match(/^\/api\/journal\/year\/(\d{4})$/);
  if (request.method === "GET" && journalYear) {
    return jsonResponse(await authoringJournalYearData(env, journalYear[1]));
  }
  const writingYear = url.pathname.match(/^\/api\/writing\/year\/(\d{4})$/);
  if (request.method === "GET" && writingYear) {
    return jsonResponse(await authoringWritingYearData(env, writingYear[1]));
  }
  const preview = url.pathname.match(/^\/api\/writing\/assets\/preview\/(\d{8}-\d{6})\/([a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif|avif))$/);
  if (request.method === "GET" && preview) return previewWritingAsset(env, preview[1], preview[2]);
  if (request.method !== "POST") throw new HttpError(405, "This authoring endpoint requires POST.");
  const origin = request.headers.get("origin");
  if (origin !== url.origin) throw new HttpError(403, "The authoring request origin was rejected.");
  if (url.pathname === "/api/writing/assets/upload") {
    return jsonResponse(await uploadWritingAsset(env, request));
  }
  const payload = await readJsonObject(request);
  const actions: Record<string, (env: Env, payload: Record<string, unknown>) => Promise<unknown>> = {
    "/api/journal/save": saveJournal,
    "/api/journal/delete": deleteJournal,
    "/api/journal/monthly/save": saveMonthlyNote,
    "/api/journal/plans/save": saveMonthlyPlan,
    "/api/journal/plans/check-ins": saveMonthlyPlanCheckIns,
    "/api/writing/open": openWriting,
    "/api/writing/create": createWriting,
    "/api/writing/save": saveWriting,
    "/api/writing/publish": publishWriting,
    "/api/writing/deploy/status": writingDeploymentStatus,
    "/api/writing/delete": deleteWriting,
    "/api/dictionary/open": openDictionary,
    "/api/dictionary/save": saveDictionary,
    "/api/dictionary/publish": publishDictionary,
  };
  const action = actions[url.pathname];
  if (!action) throw new HttpError(404, "Unknown authoring endpoint.");
  return jsonResponse(await action(env, payload));
}

async function handlePublicApi(request: Request, env: Env, url: URL, scope: ApiScope): Promise<Response> {
  await verifyAccess(request, env);
  return authoringApi(request, env, url, scope);
}

async function publicMedia(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Published media is read-only.");
  const journalPath = /^\/(?:journals|monthly)\/\d{4}\/[A-Za-z0-9._-]+$/;
  const writingPath = /^\/writing\/\d{8}-\d{6}\/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif|avif)$/;
  if (!journalPath.test(url.pathname) && !writingPath.test(url.pathname)) {
    throw new HttpError(404, "Published media was not found.");
  }
  const key = `published${url.pathname}`;
  const object = request.method === "HEAD" ? await env.CONTENT.head(key) : await env.CONTENT.get(key);
  if (!object) throw new HttpError(404, "Published media was not found.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  const body = request.method === "HEAD" ? null : (object as R2ObjectBody).body;
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.hostname === new URL(env.MEDIA_ORIGIN).hostname) return await publicMedia(request, env, url);
      const monthlyPlanMonth = publicMonthlyPlanMonth(url.pathname);
      if (url.hostname === new URL(env.PUBLIC_SITE_ORIGIN).hostname && monthlyPlanMonth) {
        return await monthlyPlansResponse(env, request, monthlyPlanMonth);
      }
      if (url.hostname === new URL(env.PUBLIC_SITE_ORIGIN).hostname && url.pathname.startsWith("/api/")) {
        return await handlePublicApi(request, env, url, "main");
      }
      if (url.hostname === new URL(env.DICTIONARY_ORIGIN).hostname && url.pathname.startsWith("/api/")) {
        return await handlePublicApi(request, env, url, "dictionary");
      }
      throw new HttpError(404, "Unknown hostname.");
    } catch (error) {
      const jsonPath = url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/monthly-plans/");
      if (error instanceof HttpError) {
        if (jsonPath) return jsonResponse({ error: error.message }, error.status);
        return new Response(error.message, { status: error.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
      console.error(error);
      const message = error instanceof Error ? error.message : "Unexpected Worker error.";
      if (jsonPath) return jsonResponse({ error: message }, 500);
      return new Response("The authoring backend encountered an unexpected error.", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
