import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  authoringJournalCatalogData,
  authoringJournalYearData,
  saveJournal,
} from "../src/journal.ts";
import { HttpError } from "../src/utils.ts";

const year = "2026";
const taskProjectId = `project-${"b".repeat(24)}`;
const relatedTaskId = `task-${"a".repeat(24)}`;
const entry = {
  id: "20260807-171423-7239",
  publishedAt: "2026-08-07T17:14:23+08:00",
  updatedAt: "2026-08-08T10:00:00+08:00",
  content: "Updated Journal content.",
  images: [],
  relatedWriting: null,
  relatedTask: null,
};

function storedTaskState(taskTitle = "Canonical Task title") {
  return {
    schemaVersion: 5,
    revision: "0",
    updatedAt: "2026-08-08T10:00:00+08:00",
    projects: [{
      id: taskProjectId,
      key: "SPEC",
      title: "Spectra",
      description: "",
      color: "#22c55e",
      status: "active",
      createdAt: "2026-08-01T10:00:00+08:00",
      updatedAt: "2026-08-01T10:00:00+08:00",
    }],
    tasks: [{
      id: relatedTaskId,
      code: "SPEC-2026-0001",
      projectId: taskProjectId,
      title: taskTitle,
      objective: "",
      position: 0,
      createdAt: "2026-08-01T10:00:00+08:00",
      updatedAt: "2026-08-01T10:00:00+08:00",
    }],
    sessions: [],
    contributions: [],
  };
}
function moduleSource(value: unknown): string {
  return `export default ${JSON.stringify(value, null, 2)};\n`;
}

function githubFile(path: string, value: unknown): Response {
  const source = moduleSource(value);
  return new Response(JSON.stringify({
    type: "file",
    path,
    sha: "a".repeat(40),
    encoding: "base64",
    content: Buffer.from(source).toString("base64"),
  }), { headers: { "Content-Type": "application/json" } });
}

function installJournalFetch(sourceEntry: unknown = entry): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/contents/journals/catalog.js")) {
      return githubFile("journals/catalog.js", { years: [2026] });
    }
    if (url.pathname.endsWith(`/contents/journals/${year}.js`)) {
      return githubFile(`journals/${year}.js`, [sourceEntry]);
    }
    if (url.pathname.endsWith("/git/ref/heads/master")) {
      return Response.json({ object: { sha: "c".repeat(40) } });
    }
    if (url.pathname.endsWith(`/git/commits/${"c".repeat(40)}`)) {
      return Response.json({ sha: "c".repeat(40), tree: { sha: "t".repeat(40) } });
    }
    if (url.pathname.endsWith("/git/blobs")) return Response.json({ sha: "b".repeat(40) }, { status: 201 });
    if (url.pathname.endsWith("/git/trees")) return Response.json({ sha: "d".repeat(40) }, { status: 201 });
    if (url.pathname.endsWith("/git/commits")) return Response.json({ sha: "e".repeat(40) }, { status: 201 });
    if (url.pathname.endsWith("/git/refs/heads/master")) return Response.json({ object: { sha: "e".repeat(40) } });
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

function environment(taskState: unknown = null) {
  const deleted: Array<string | string[]> = [];
  const puts: Array<{ key: string; options: unknown }> = [];
  return {
    deleted,
    puts,
    env: {
      CONTENT: {
        async get(key: string) {
          if (key !== "published/tasks/state.json" || taskState === null) return null;
          return {
            etag: "task-etag",
            async json() { return structuredClone(taskState); },
          };
        },
        async put(key: string, _value: unknown, options: unknown) {
          puts.push({ key, options });
          return { etag: `etag-${puts.length}` };
        },
        async head() { return null; },
        async list() {
          return { objects: [], truncated: false };
        },
        async delete(keys: string | string[]) {
          if (Array.isArray(keys) && keys.length === 0) {
            throw new Error("delete: The number of keys in the request must be between 1 and 1000 inclusive. (10027)");
          }
          deleted.push(keys);
        },
      },
      GITHUB_TOKEN: "test",
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo",
      GITHUB_BRANCH: "master",
      PUBLIC_SITE_ORIGIN: "https://xayah.me",
      DICTIONARY_ORIGIN: "https://dictionary.xayah.me",
      DICTIONARY_GITHUB_REPO: "dictionary",
      DICTIONARY_GITHUB_BRANCH: "master",
      MEDIA_ORIGIN: "https://media.xayah.me",
    } as never,
  };
}

test("an unchanged Journal edit never sends an empty R2 delete request", async () => {
  const restore = installJournalFetch();
  const { env, deleted } = environment();
  try {
    const result = await saveJournal(env, {
      mode: "edit",
      entry: {
        id: entry.id,
        publishedAt: entry.publishedAt,
        content: entry.content,
        relatedWriting: null,
      },
      images: [],
      uploads: [],
    });
    assert.equal(result.status, "unchanged");
    assert.deepEqual(deleted, []);
  } finally {
    restore();
  }
});

test("authoring Journal reads come from the latest GitHub source", async () => {
  const restore = installJournalFetch();
  const { env } = environment();
  try {
    assert.deepEqual(await authoringJournalCatalogData(env), { years: ["2026"] });
    const result = await authoringJournalYearData(env, year);
    assert.equal(result.entries[0].content, entry.content);
  } finally {
    restore();
  }
});

test("Journal Related Task snapshots come from canonical Task storage", async () => {
  const restore = installJournalFetch();
  const { env } = environment(storedTaskState());
  try {
    const result = await saveJournal(env, {
      mode: "edit",
      entry: {
        id: entry.id,
        publishedAt: entry.publishedAt,
        content: `${entry.content} Linked.`,
        relatedWriting: null,
        relatedTask: {
          id: relatedTaskId,
          code: "FORGED-2099-9999",
          title: "Forged title",
          project: { id: taskProjectId, key: "BAD", title: "Forged", color: "#000000" },
        },
      },
      images: [],
      uploads: [],
    });
    assert.deepEqual(result.entries[0]?.relatedTask, {
      id: relatedTaskId,
      code: "SPEC-2026-0001",
      title: "Canonical Task title",
      project: { id: taskProjectId, key: "SPEC", title: "Spectra", color: "#22c55e" },
    });
  } finally {
    restore();
  }
});

test("editing a Journal preserves an existing Related Task snapshot", async () => {
  const snapshot = {
    id: relatedTaskId,
    code: "SPEC-2026-0001",
    title: "Original Task title",
    project: { id: taskProjectId, key: "SPEC", title: "Original Project title", color: "#16a34a" },
  };
  const restore = installJournalFetch({ ...entry, relatedTask: snapshot });
  const { env } = environment(storedTaskState("Renamed Task title"));
  try {
    const result = await saveJournal(env, {
      mode: "edit",
      entry: {
        id: entry.id,
        publishedAt: entry.publishedAt,
        content: `${entry.content} Edited.`,
        relatedWriting: null,
        relatedTask: { id: relatedTaskId },
      },
      images: [],
      uploads: [],
    });
    assert.deepEqual(result.entries[0]?.relatedTask, snapshot);
  } finally {
    restore();
  }
});

test("new Journal media uses non-reusable immutable object names", async () => {
  const restore = installJournalFetch();
  const first = environment();
  const second = environment();
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const payload = {
    mode: "edit",
    entry: {
      id: entry.id,
      publishedAt: entry.publishedAt,
      content: entry.content,
      relatedWriting: null,
    },
    images: [{ kind: "new", key: "upload", alt: "Test" }],
    uploads: [{ key: "upload", name: "test.png", type: "image/png", data: bytes.toString("base64") }],
  };
  try {
    await saveJournal(first.env, payload);
    await saveJournal(second.env, payload);
    const firstMedia = first.puts.find(({ key }) => key.startsWith("published/journals/"));
    const secondMedia = second.puts.find(({ key }) => key.startsWith("published/journals/"));
    assert.ok(firstMedia && secondMedia);
    assert.match(firstMedia.key, new RegExp(`^published/journals/${year}/${entry.id}-[a-f0-9]{24}\\.png$`));
    assert.notEqual(firstMedia.key, secondMedia.key);
    assert.deepEqual((firstMedia.options as { onlyIf: unknown }).onlyIf, { etagDoesNotMatch: "*" });
  } finally {
    restore();
  }
});

test("Journal saves reject ids and timestamps that the static build cannot publish", async () => {
  const restore = installJournalFetch();
  const { env } = environment();
  try {
    await assert.rejects(
      saveJournal(env, {
        mode: "create",
        entry: { id: "custom-slug", publishedAt: "2026-08-13T10:00:00+08:00", content: "Test", relatedWriting: null },
        images: [],
        uploads: [],
      }),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
    await assert.rejects(
      saveJournal(env, {
        mode: "create",
        entry: { id: "20260813-100000-abcd", publishedAt: "2026-08-13T02:00:00Z", content: "Test", relatedWriting: null },
        images: [],
        uploads: [],
      }),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
    await assert.rejects(
      saveJournal(env, {
        mode: "create",
        entry: { id: "20260813-100000-abcd", publishedAt: "2026-08-12T10:00:00+08:00", content: "Test", relatedWriting: null },
        images: [],
        uploads: [],
      }),
      (error: unknown) => error instanceof HttpError && error.status === 400 && /does not match/i.test(error.message),
    );
  } finally {
    restore();
  }
});
