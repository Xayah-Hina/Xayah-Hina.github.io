import { verifyAccess } from "./auth";
import { deleteJournal, journalYears, saveJournal, saveMonthlyNote } from "./journal";
import type { Env } from "./types";
import { HttpError, jsonResponse, readJsonObject, secureEqual } from "./utils";
import {
  buildSource,
  compilationStatus,
  compileWriting,
  completeBuild,
  createWriting,
  deleteWriting,
  editorWritingCatalog,
  editorWritingYear,
  openWriting,
  previewWriting,
  publishWriting,
  saveWriting,
  writingStatus,
} from "./writing";

async function editorStatus(env: Env): Promise<Response> {
  let journalError: string | null = null;
  let writingError: string | null = null;
  let writingPending = false;
  try {
    await journalYears(env);
  } catch (error) {
    journalError = error instanceof Error ? error.message : "Journal data could not be loaded.";
  }
  try {
    const status = await writingStatus(env);
    writingPending = status.pending;
  } catch (error) {
    writingError = error instanceof Error ? error.message : "Writing data could not be loaded.";
  }
  return jsonResponse({
    journalError,
    writingError,
    compiler: "On-demand Tectonic 0.16.9 via GitHub Actions · PDFs stored in R2",
    publishing: {
      enabled: true,
      state: "ready",
      message: "Cloud publishing is ready.",
      branch: env.GITHUB_BRANCH,
      writingPending,
    },
  });
}

async function editorApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/editor/status") return editorStatus(env);
  const preview = url.pathname.match(/^\/api\/writing\/preview\/(\d{8}-\d{6})\/([a-f0-9]{64})\.pdf$/);
  if (request.method === "GET" && preview) return previewWriting(env, preview[1], preview[2]);
  if (request.method !== "POST") throw new HttpError(405, "This Editor endpoint requires POST.");
  const origin = request.headers.get("origin");
  if (origin !== env.EDITOR_ORIGIN) throw new HttpError(403, "The Editor request origin was rejected.");
  const payload = await readJsonObject(request);
  const actions: Record<string, (env: Env, payload: Record<string, unknown>) => Promise<unknown>> = {
    "/api/journal/save": saveJournal,
    "/api/journal/delete": deleteJournal,
    "/api/journal/monthly/save": saveMonthlyNote,
    "/api/writing/open": openWriting,
    "/api/writing/create": createWriting,
    "/api/writing/save": saveWriting,
    "/api/writing/compile": compileWriting,
    "/api/writing/compile/status": compilationStatus,
    "/api/writing/publish": publishWriting,
    "/api/writing/delete": deleteWriting,
  };
  const action = actions[url.pathname];
  if (!action) throw new HttpError(404, "Unknown Editor endpoint.");
  return jsonResponse(await action(env, payload));
}

async function proxyPublicSite(request: Request, env: Env, url: URL): Promise<Response> {
  const target = new URL(`${url.pathname}${url.search}`, env.PUBLIC_SITE_ORIGIN);
  const headers = new Headers();
  const accept = request.headers.get("accept");
  if (accept) headers.set("Accept", accept);
  const response = await fetch(target, { method: request.method === "HEAD" ? "HEAD" : "GET", headers, redirect: "follow" });
  const resultHeaders = new Headers(response.headers);
  resultHeaders.set("X-Robots-Tag", "noindex, nofollow");
  if (url.pathname === "/" || url.pathname.endsWith(".html") || url.pathname.startsWith("/writing/") || url.pathname.startsWith("/journals/")) {
    resultHeaders.set("Cache-Control", "private, no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: resultHeaders });
}

async function handleEditor(request: Request, env: Env, url: URL): Promise<Response> {
  await verifyAccess(request, env);
  if (url.pathname.startsWith("/api/")) return editorApi(request, env, url);
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "The Editor only accepts read requests outside its API.");
  if (url.pathname === "/writing/catalog.js") return editorWritingCatalog(env);
  const year = url.pathname.match(/^\/writing\/(\d{4})\.js$/);
  if (year) return editorWritingYear(env, year[1]);
  return proxyPublicSite(request, env, url);
}

function buildAuthorized(request: Request, env: Env): boolean {
  const authorization = request.headers.get("authorization");
  const value = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  return secureEqual(value, env.BUILD_CALLBACK_TOKEN);
}

async function publicMedia(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname.startsWith("/_build/")) {
    if (!buildAuthorized(request, env)) throw new HttpError(403, "Build authorization failed.");
    if (request.method === "GET" && url.pathname === "/_build/writing/source") {
      return buildSource(
        env,
        url.searchParams.get("id") || "",
        url.searchParams.get("job") || "",
        url.searchParams.get("source_hash") || "",
      );
    }
    if (request.method === "POST" && url.pathname === "/_build/writing/complete") return completeBuild(env, request);
    throw new HttpError(404, "Unknown build endpoint.");
  }
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Published media is read-only.");
  const publishedPath = /^(?:\/(?:journals|monthly)\/\d{4}|\/writing\/\d{8}-\d{6})\/[A-Za-z0-9._-]+$/;
  if (!publishedPath.test(url.pathname)) throw new HttpError(404, "Published media was not found.");
  const stableWritingPdf = url.pathname.match(/^\/writing\/(\d{8}-\d{6})\/\1\.pdf$/);
  let key = `published${url.pathname}`;
  if (stableWritingPdf) {
    const pointer = await env.CONTENT.get(`private/writing/current/${stableWritingPdf[1]}.json`);
    if (!pointer) throw new HttpError(404, "Published media was not found.");
    const value = await pointer.json<{ sourceHash?: unknown }>();
    if (typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceHash)) {
      throw new HttpError(500, "Published Writing PDF metadata is invalid.");
    }
    key = `published/writing/${stableWritingPdf[1]}/${value.sourceHash}.pdf`;
  }
  const object = request.method === "HEAD" ? await env.CONTENT.head(key) : await env.CONTENT.get(key);
  if (!object) throw new HttpError(404, "Published media was not found.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", stableWritingPdf ? "public, max-age=0, must-revalidate" : "public, max-age=31536000, immutable");
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
        if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_build/")) return jsonResponse({ error: error.message }, error.status);
        return new Response(error.message, { status: error.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
      console.error(error);
      const message = error instanceof Error ? error.message : "Unexpected Worker error.";
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_build/")) return jsonResponse({ error: message }, 500);
      return new Response("The Editor backend encountered an unexpected error.", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
