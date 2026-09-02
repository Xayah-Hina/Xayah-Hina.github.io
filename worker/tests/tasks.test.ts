import assert from "node:assert/strict";
import test from "node:test";
import { PROJECT_COLORS, saveTasks, tasksResponse } from "../src/tasks.ts";
import { HttpError, singaporeTimestamp } from "../src/utils.ts";

function environment(initial?: unknown) {
  const objects = new Map<string, { value: string; etag: string }>();
  let version = 0;
  if (initial) objects.set("published/tasks/state.json", { value: JSON.stringify(initial), etag: "etag-initial" });
  const content = {
    async get(key: string) {
      const object = objects.get(key);
      return object ? { etag: object.etag, async json<T>() { return JSON.parse(object.value) as T; } } : null;
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
    async delete(key: string | string[]) { for (const item of Array.isArray(key) ? key : [key]) objects.delete(item); },
  };
  return { env: { CONTENT: content } as never, objects };
}

function at(date: string, minute: number): string {
  const day = new Date(`${date}T00:00:00+08:00`);
  return new Date(day.getTime() + minute * 60 * 1000).toISOString();
}

async function createWorkspace(env: never) {
  const project = await saveTasks(env, {
    mode: "createProject",
    baseRevision: "0",
    project: { title: "Differentiable Solver", description: "Research and implementation", status: "active" },
  });
  const task = await saveTasks(env, {
    mode: "createTask",
    baseRevision: project.revision,
    task: { projectId: project.projects[0]!.id, title: "Implement the linear solve", objective: "A stable solve with regression coverage." },
  });
  return task;
}

test("Session model schedules multiple time ranges for one Task", async () => {
  const { env } = environment();
  const workspace = await createWorkspace(env);
  const date = singaporeTimestamp().slice(0, 10);
  const task = workspace.tasks[0]!;
  assert.equal(task.code, `DS-${date.slice(0, 4)}-0001`);
  assert.equal("status" in task, false);
  assert.equal("scheduledDate" in task, false);

  const morning = await saveTasks(env, {
    mode: "createSession",
    baseRevision: workspace.revision,
    session: { taskId: task.id, startsAt: at(date, 540), endsAt: at(date, 600), plan: "Implement the direct solve." },
  });
  const afternoon = await saveTasks(env, {
    mode: "createSession",
    baseRevision: morning.revision,
    session: { taskId: task.id, startsAt: at(date, 840), endsAt: at(date, 930), plan: "Add regression coverage." },
  });
  assert.equal(afternoon.sessions.length, 2);
  assert.deepEqual(afternoon.sessions.map((session) => [session.startsAt, session.endsAt]), [[at(date, 540), at(date, 600)], [at(date, 840), at(date, 930)]]);
  assert.ok(afternoon.sessions.every((session) => session.state === "scheduled"));
});

test("Sessions reject overlap and reviewed history cannot be removed", async () => {
  const { env } = environment();
  const workspace = await createWorkspace(env);
  const date = singaporeTimestamp().slice(0, 10);
  const planned = await saveTasks(env, {
    mode: "createSession",
    baseRevision: workspace.revision,
    session: { taskId: workspace.tasks[0]!.id, startsAt: at(date, 600), endsAt: at(date, 690), plan: "Build the solver." },
  });
  await assert.rejects(saveTasks(env, {
    mode: "createSession",
    baseRevision: planned.revision,
    session: { taskId: workspace.tasks[0]!.id, startsAt: at(date, 660), endsAt: at(date, 720), plan: "Overlap." },
  }), (error: unknown) => error instanceof HttpError && error.status === 409);

  const reviewed = await saveTasks(env, {
    mode: "updateSession",
    baseRevision: planned.revision,
    session: { id: planned.sessions[0]!.id, startsAt: at(date, 600), endsAt: at(date, 690), plan: "Build the solver.", outcome: "Core implementation landed.", state: "partial" },
  });
  assert.ok(reviewed.sessions[0]!.reviewedAt);
  await assert.rejects(saveTasks(env, {
    mode: "removeSession",
    baseRevision: reviewed.revision,
    session: { id: reviewed.sessions[0]!.id },
  }), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test("Task completion records one contribution and removes only scheduled Sessions", async () => {
  const { env } = environment();
  const workspace = await createWorkspace(env);
  const date = singaporeTimestamp().slice(0, 10);
  const first = await saveTasks(env, {
    mode: "createSession",
    baseRevision: workspace.revision,
    session: { taskId: workspace.tasks[0]!.id, startsAt: at(date, 540), endsAt: at(date, 600), plan: "Implement." },
  });
  const reviewed = await saveTasks(env, {
    mode: "updateSession",
    baseRevision: first.revision,
    session: { id: first.sessions[0]!.id, startsAt: at(date, 540), endsAt: at(date, 600), plan: "Implement.", outcome: "Done.", state: "done" },
  });
  const scheduled = await saveTasks(env, {
    mode: "createSession",
    baseRevision: reviewed.revision,
    session: { taskId: workspace.tasks[0]!.id, startsAt: at(date, 720), endsAt: at(date, 780), plan: "Follow up." },
  });
  const completed = await saveTasks(env, { mode: "completeTask", baseRevision: scheduled.revision, task: { id: workspace.tasks[0]!.id } });
  assert.ok(completed.tasks[0]!.completedAt);
  assert.equal(completed.sessions.length, 1);
  assert.equal(completed.sessions[0]!.state, "done");
  assert.equal(completed.contributions.length, 1);
  const reopened = await saveTasks(env, { mode: "reopenTask", baseRevision: completed.revision, task: { id: workspace.tasks[0]!.id } });
  const recompleted = await saveTasks(env, { mode: "completeTask", baseRevision: reopened.revision, task: { id: workspace.tasks[0]!.id } });
  assert.equal(recompleted.contributions.length, 1);
});

test("Task API publishes only the Session model", async () => {
  const { env } = environment();
  await createWorkspace(env);
  const response = await tasksResponse(env, new Request("https://xayah.me/data/tasks"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("etag")!, /^"v6-/);
  const current = await response.json() as Record<string, unknown>;
  assert.equal(current.schemaVersion, 6);
  assert.deepEqual(current.sessions, []);
  const unchanged = await tasksResponse(env, new Request("https://xayah.me/data/tasks", { headers: { "If-None-Match": response.headers.get("etag")! } }));
  assert.equal(unchanged.status, 304);

});

test("Sessions cross midnight while overlap checks span calendar dates", async () => {
  const { env } = environment();
  const workspace = await createWorkspace(env);
  const date = singaporeTimestamp().slice(0, 10);
  const overnight = await saveTasks(env, {
    mode: "createSession",
    baseRevision: workspace.revision,
    session: { taskId: workspace.tasks[0]!.id, startsAt: at(date, 1410), endsAt: at(date, 1500), plan: "Finish across midnight." },
  });
  assert.equal(overnight.sessions[0]!.startsAt, at(date, 1410));
  assert.equal(overnight.sessions[0]!.endsAt, at(date, 1500));
  await assert.rejects(saveTasks(env, {
    mode: "createSession",
    baseRevision: overnight.revision,
    session: { taskId: workspace.tasks[0]!.id, startsAt: at(date, 1470), endsAt: at(date, 1530), plan: "Overlap after midnight." },
  }), (error: unknown) => error instanceof HttpError && error.status === 409);
  await assert.rejects(saveTasks(env, {
    mode: "createSession",
    baseRevision: overnight.revision,
    session: { taskId: workspace.tasks[0]!.id, startsAt: at(date, 1800), endsAt: at(date, 1800 + 24 * 60 + 15), plan: "Too long." },
  }), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test("Project colors are automatic, distinct, and immutable", async () => {
  const { env } = environment();
  const first = await saveTasks(env, { mode: "createProject", baseRevision: "0", project: { title: "First", description: "", status: "active" } });
  const second = await saveTasks(env, { mode: "createProject", baseRevision: first.revision, project: { title: "Second", description: "", status: "active" } });
  const third = await saveTasks(env, { mode: "createProject", baseRevision: second.revision, project: { title: "Third", description: "", status: "paused" } });
  assert.deepEqual(third.projects.map((project) => project.color), PROJECT_COLORS.slice(0, 3));

  const updated = await saveTasks(env, { mode: "updateProject", baseRevision: third.revision, project: { id: third.projects[0]!.id, title: "First renamed", description: "", status: "active" } });
  assert.equal(updated.projects[0]!.color, PROJECT_COLORS[0]);
  await assert.rejects(saveTasks(env, { mode: "createProject", baseRevision: updated.revision, project: { title: "Manual", description: "", color: "#ffffff", status: "active" } }), (error: unknown) => error instanceof HttpError && error.status === 400);
  await assert.rejects(saveTasks(env, { mode: "updateProject", baseRevision: updated.revision, project: { id: updated.projects[0]!.id, title: "Manual", description: "", color: PROJECT_COLORS[1], status: "active" } }), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test("Task codes remain stable when moving between Projects", async () => {
  const { env } = environment();
  const year = singaporeTimestamp().slice(0, 4);
  const site = await saveTasks(env, { mode: "createProject", baseRevision: "0", project: { key: "SITE", title: "Personal Website", description: "", status: "active" } });
  const notes = await saveTasks(env, { mode: "createProject", baseRevision: site.revision, project: { key: "NOTES", title: "Notes", description: "", status: "active" } });
  const first = await saveTasks(env, { mode: "createTask", baseRevision: notes.revision, task: { projectId: site.projects[0]!.id, title: "First", objective: "" } });
  const second = await saveTasks(env, { mode: "createTask", baseRevision: first.revision, task: { projectId: site.projects[0]!.id, title: "Second", objective: "" } });
  assert.equal(first.tasks[0]!.code, `SITE-${year}-0001`);
  assert.equal(second.tasks[1]!.code, `SITE-${year}-0002`);
  const moved = await saveTasks(env, { mode: "updateTask", baseRevision: second.revision, task: { id: second.tasks[0]!.id, projectId: notes.projects[1]!.id, title: "First", objective: "" } });
  assert.equal(moved.tasks[0]!.code, `SITE-${year}-0001`);
  assert.equal(moved.tasks[0]!.projectId, notes.projects[1]!.id);
});
