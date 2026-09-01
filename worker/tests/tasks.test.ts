import assert from "node:assert/strict";
import test from "node:test";
import { saveTasks, tasksResponse } from "../src/tasks.ts";
import { HttpError, singaporeTimestamp } from "../src/utils.ts";

function environment() {
  const objects = new Map<string, { value: string; etag: string }>();
  let version = 0;
  const content = {
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        etag: object.etag,
        async json<T>() { return JSON.parse(object.value) as T; },
      };
    },
    async put(key: string, value: unknown, options: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } } = {}) {
      const current = objects.get(key);
      if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
      if (options.onlyIf?.etagDoesNotMatch === "*" && current) return null;
      version += 1;
      const stored = typeof value === "string" ? value : new TextDecoder().decode(value as Uint8Array);
      const result = { value: stored, etag: `etag-${version}` };
      objects.set(key, result);
      return { etag: result.etag };
    },
    async head() { return null; },
    async list() { return { objects: [], truncated: false }; },
    async delete() {},
  };
  return { env: { CONTENT: content } as never, objects };
}

test("Tasks create a project and child task, then record a completion", async () => {
  const { env, objects } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const projectResult = await saveTasks(env, {
    mode: "createProject",
    baseRevision: "0",
    project: {
      title: "Differentiable Solver",
      description: "Research and implementation",
      color: "#2f855a",
      status: "active",
    },
  });
  assert.equal(projectResult.status, "created");
  assert.equal(projectResult.projects.length, 1);
  assert.equal(projectResult.activity[0].updates, 1);

  const taskResult = await saveTasks(env, {
    mode: "createTask",
    baseRevision: projectResult.revision,
    task: {
      projectId: projectResult.projects[0].id,
      title: "Implement the linear solve",
      status: "todo",
      priority: "high",
      scheduledDate: today,
    },
  });
  assert.equal(taskResult.tasks.length, 1);

  const completed = await saveTasks(env, {
    mode: "updateTask",
    baseRevision: taskResult.revision,
    task: { ...taskResult.tasks[0], status: "done" },
  });
  assert.equal(completed.tasks[0].status, "done");
  assert.equal(completed.activity[0].updates, 3);
  assert.equal(completed.activity[0].completions, 1);
  assert.equal(completed.activity[0].score, 5);
  assert.ok(objects.has("published/tasks/state.json"));
  assert.ok([...objects.keys()].some((key) => key.startsWith("private/tasks/history/")));

  const response = await tasksResponse(env, new Request("https://xayah.me/data/tasks"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  const data = await response.json() as typeof completed;
  assert.equal(data.today, today);
  assert.equal(data.tasks[0].title, "Implement the linear solve");
  const unchanged = await tasksResponse(env, new Request("https://xayah.me/data/tasks", {
    headers: { "If-None-Match": response.headers.get("etag")! },
  }));
  assert.equal(unchanged.status, 304);
});

test("Tasks reject stale revisions and unavailable projects", async () => {
  const { env } = environment();
  const projectResult = await saveTasks(env, {
    mode: "createProject",
    baseRevision: "0",
    project: { title: "Spectra", description: "Renderer", color: "#2563eb", status: "active" },
  });
  await assert.rejects(
    saveTasks(env, {
      mode: "updateProject",
      baseRevision: "0",
      project: { ...projectResult.projects[0], title: "Changed" },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  await assert.rejects(
    saveTasks(env, {
      mode: "createTask",
      baseRevision: projectResult.revision,
      task: {
        projectId: `project-${"f".repeat(24)}`,
        title: "Orphan",
        status: "todo",
        priority: "normal",
        scheduledDate: null,
      },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
});

test("archiving a project also archives its open tasks", async () => {
  const { env } = environment();
  const projectResult = await saveTasks(env, {
    mode: "createProject",
    baseRevision: "0",
    project: { title: "Music", description: "Practice", color: "#a855f7", status: "active" },
  });
  const taskResult = await saveTasks(env, {
    mode: "createTask",
    baseRevision: projectResult.revision,
    task: {
      projectId: projectResult.projects[0].id,
      title: "Practice 春日影",
      status: "in_progress",
      priority: "normal",
      scheduledDate: null,
    },
  });
  const archived = await saveTasks(env, {
    mode: "archiveProject",
    baseRevision: taskResult.revision,
    project: { id: projectResult.projects[0].id },
  });
  assert.ok(archived.projects[0].archivedAt);
  assert.ok(archived.tasks[0].archivedAt);
});
