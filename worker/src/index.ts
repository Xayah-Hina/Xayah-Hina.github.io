import { verifyAccess } from "./auth";
import { dictionaryStatus, openDictionary, publishDictionary, saveDictionary } from "./dictionary";
import { deleteJournal, journalYears, saveJournal, saveMonthlyNote } from "./journal";
import type { Env } from "./types";
import { HttpError, jsonResponse, readJsonObject } from "./utils";
import {
  createWriting,
  deleteWriting,
  editorWritingCatalog,
  editorWritingYear,
  openWriting,
  pendingWriting,
  previewWritingAsset,
  publishWriting,
  saveWriting,
  uploadWritingAsset,
  writingDeploymentStatus,
} from "./writing";

async function editorStatus(env: Env): Promise<Response> {
  let journalError: string | null = null;
  let writingError: string | null = null;
  let dictionaryError: string | null = null;
  let writingPending = false;
  let dictionaryPending = false;
  let dictionaryPendingCount = 0;
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
  try {
    const status = await dictionaryStatus(env);
    dictionaryPending = status.pending;
    dictionaryPendingCount = status.pendingCount;
  } catch (error) {
    dictionaryError = error instanceof Error ? error.message : "Dictionary data could not be loaded.";
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

async function editorApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/editor/status") return editorStatus(env);
  const preview = url.pathname.match(/^\/api\/writing\/assets\/preview\/(\d{8}-\d{6})\/([a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif|avif))$/);
  if (request.method === "GET" && preview) return previewWritingAsset(env, preview[1], preview[2]);
  if (request.method !== "POST") throw new HttpError(405, "This Editor endpoint requires POST.");
  const origin = request.headers.get("origin");
  if (origin !== env.EDITOR_ORIGIN) throw new HttpError(403, "The Editor request origin was rejected.");
  if (url.pathname === "/api/writing/assets/upload") {
    return jsonResponse(await uploadWritingAsset(env, request));
  }
  const payload = await readJsonObject(request);
  const actions: Record<string, (env: Env, payload: Record<string, unknown>) => Promise<unknown>> = {
    "/api/journal/save": saveJournal,
    "/api/journal/delete": deleteJournal,
    "/api/journal/monthly/save": saveMonthlyNote,
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
  if (!action) throw new HttpError(404, "Unknown Editor endpoint.");
  return jsonResponse(await action(env, payload));
}

async function proxyPublicSite(request: Request, url: URL, origin: string, pathname = url.pathname): Promise<Response> {
  const target = new URL(`${pathname}${url.search}`, origin);
  const headers = new Headers();
  const accept = request.headers.get("accept");
  if (accept) headers.set("Accept", accept);
  const response = await fetch(target, { method: request.method === "HEAD" ? "HEAD" : "GET", headers, redirect: "follow" });
  const resultHeaders = new Headers(response.headers);
  resultHeaders.set("X-Robots-Tag", "noindex, nofollow");
  if (
    url.pathname === "/"
    || url.pathname.endsWith(".html")
    || url.pathname.startsWith("/writing/")
    || url.pathname.startsWith("/journals/")
    || url.pathname.startsWith("/dictionary/")
  ) {
    resultHeaders.set("Cache-Control", "private, no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: resultHeaders });
}

export function editorPublicTarget(env: Env, url: URL): { origin: string; pathname: string } {
  if (url.pathname.startsWith("/dictionary/")) {
    return {
      origin: env.DICTIONARY_ORIGIN,
      pathname: url.pathname.slice("/dictionary".length),
    };
  }
  return { origin: env.PUBLIC_SITE_ORIGIN, pathname: url.pathname };
}

async function handleEditor(request: Request, env: Env, url: URL): Promise<Response> {
  await verifyAccess(request, env);
  if (url.pathname.startsWith("/api/")) return editorApi(request, env, url);
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "The Editor only accepts read requests outside its API.");
  if (url.pathname === "/dictionary") {
    return Response.redirect(`${env.EDITOR_ORIGIN}/dictionary/${url.search}`, 308);
  }
  if (url.pathname === "/writing/catalog.js") return editorWritingCatalog(env);
  const year = url.pathname.match(/^\/writing\/(\d{4})\.js$/);
  if (year) return editorWritingYear(env, year[1]);
  const target = editorPublicTarget(env, url);
  return proxyPublicSite(request, url, target.origin, target.pathname);
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
      if (url.hostname === new URL(env.EDITOR_ORIGIN).hostname) return await handleEditor(request, env, url);
      if (url.hostname === new URL(env.MEDIA_ORIGIN).hostname) return await publicMedia(request, env, url);
      throw new HttpError(404, "Unknown hostname.");
    } catch (error) {
      if (error instanceof HttpError) {
        if (url.pathname.startsWith("/api/")) return jsonResponse({ error: error.message }, error.status);
        return new Response(error.message, { status: error.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
      console.error(error);
      const message = error instanceof Error ? error.message : "Unexpected Worker error.";
      if (url.pathname.startsWith("/api/")) return jsonResponse({ error: message }, 500);
      return new Response("The Editor backend encountered an unexpected error.", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
