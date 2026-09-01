import assert from "node:assert/strict";
import test from "node:test";
import { saveTasks, tasksResponse } from "../src/tasks.ts";
import { HttpError, singaporeTimestamp } from "../src/utils.ts";

const v4 = <T extends Record<string, unknown>>(payload: T) => ({ ...payload, clientSchema: 4 });

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

async function createProjectAndTask(env: never) {
  const projectResult = await saveTasks(env, v4({
    mode: "createProject",
    baseRevision: "0",
    project: {
      title: "Differentiable Solver",
      description: "Research and implementation",
      color: "#2f855a",
      status: "active",
    },
  }));
  const taskResult = await saveTasks(env, v4({
    mode: "createTask",
    baseRevision: projectResult.revision,
    task: {
      projectId: projectResult.projects[0]!.id,
      title: "Implement the linear solve",
      objective: "A stable solve with regression coverage.",
    },
  }));
  return { projectResult, taskResult };
}

test("Tasks use a binary completion state and record independent Task Days", async () => {
  const { env, objects } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const { taskResult } = await createProjectAndTask(env);
  const task = taskResult.tasks[0]!;
  assert.equal(task.code, `DS-${today.slice(0, 4)}-0001`);
  assert.equal(task.objective, "A stable solve with regression coverage.");
  assert.equal(task.completedAt, undefined);
  assert.equal("status" in task, false);
  assert.equal("scheduledDate" in task, false);
  assert.equal("priority" in task, false);

  const planned = await saveTasks(env, v4({
    mode: "createTaskDay",
    baseRevision: taskResult.revision,
    taskDay: { taskId: task.id, plan: "Finish the direct solver and its tests." },
  }));
  assert.equal(planned.taskDays.length, 1);
  assert.deepEqual(planned.taskDays[0], {
    id: planned.taskDays[0]!.id,
    taskId: task.id,
    date: today,
    plan: "Finish the direct solver and its tests.",
    outcome: "",
    state: "planned",
    position: 0,
    createdAt: planned.taskDays[0]!.createdAt,
    updatedAt: planned.taskDays[0]!.updatedAt,
  });

  await assert.rejects(
    saveTasks(env, v4({
      mode: "updateTaskDay",
      baseRevision: planned.revision,
      taskDay: { ...planned.taskDays[0], state: "partial", outcome: "" },
    })),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
  const partial = await saveTasks(env, v4({
    mode: "updateTaskDay",
    baseRevision: planned.revision,
    taskDay: { ...planned.taskDays[0], state: "partial", outcome: "The solver works; two tests remain." },
  }));
  assert.equal(partial.taskDays[0]!.state, "partial");
  assert.ok(partial.taskDays[0]!.reviewedAt);

  const completed = await saveTasks(env, v4({
    mode: "completeTask",
    baseRevision: partial.revision,
    task: { id: task.id },
  }));
  assert.ok(completed.tasks[0]!.completedAt);
  assert.equal(completed.contributions.length, 1);
  assert.equal(completed.contributions[0]!.taskTitle, "Implement the linear solve");

  const reopened = await saveTasks(env, v4({
    mode: "reopenTask",
    baseRevision: completed.revision,
    task: { id: task.id },
  }));
  assert.equal(reopened.tasks[0]!.completedAt, undefined);
  const recompleted = await saveTasks(env, v4({
    mode: "completeTask",
    baseRevision: reopened.revision,
    task: { id: task.id },
  }));
  assert.equal(recompleted.contributions.length, 1);
  assert.ok(objects.has("published/tasks/state.json"));
  assert.ok([...objects.keys()].some((key) => key.startsWith("private/tasks/history/")));
});

test("Task responses keep the old frontend compatible while exposing schema 4 explicitly", async () => {
  const { env } = environment();
  const { taskResult } = await createProjectAndTask(env);
  const v4Response = await tasksResponse(env, new Request("https://xayah.me/data/tasks", {
    headers: { Accept: "application/vnd.xayah.tasks.v4+json" },
  }));
  assert.equal(v4Response.status, 200);
  assert.equal(v4Response.headers.get("vary"), "Accept");
  assert.match(v4Response.headers.get("etag")!, /^"v4-/);
  const current = await v4Response.json() as Record<string, any>;
  assert.equal(current.schemaVersion, 4);
  assert.deepEqual(current.taskDays, []);
  assert.equal(current.tasks[0].objective, "A stable solve with regression coverage.");

  const legacyResponse = await tasksResponse(env, new Request("https://xayah.me/data/tasks"));
  assert.match(legacyResponse.headers.get("etag")!, /^"v3-/);
  const legacy = await legacyResponse.json() as Record<string, any>;
  assert.equal(legacy.schemaVersion, 3);
  assert.equal(legacy.tasks[0].status, "todo");
  assert.equal(legacy.tasks[0].priority, "normal");
  assert.equal(legacy.tasks[0].scheduledDate, null);
  assert.equal("objective" in legacy.tasks[0], false);
  assert.equal("taskDays" in legacy, false);

  const unchanged = await tasksResponse(env, new Request("https://xayah.me/data/tasks", {
    headers: {
      Accept: "application/vnd.xayah.tasks.v4+json",
      "If-None-Match": v4Response.headers.get("etag")!,
    },
  }));
  assert.equal(unchanged.status, 304);
  assert.equal(taskResult.schemaVersion, 4);
});

test("previous plans can be reviewed and continued without moving history", async () => {
  const { env, objects } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const previousDate = yesterday.toISOString().slice(0, 10);
  const projectId = `project-${"a".repeat(24)}`;
  const taskId = `task-${"b".repeat(24)}`;
  const dayId = `taskday-${"c".repeat(24)}`;
  objects.set("published/tasks/state.json", {
    etag: "etag-state",
    value: JSON.stringify({
      schemaVersion: 4,
      revision: "0",
      updatedAt: `${previousDate}T20:00:00+08:00`,
      projects: [{
        id: projectId, key: "FLOW", title: "FlowDiT", description: "", color: "#6d2e84",
        status: "active", createdAt: `${previousDate}T09:00:00+08:00`, updatedAt: `${previousDate}T09:00:00+08:00`,
      }],
      tasks: [{
        id: taskId, code: `FLOW-${today.slice(0, 4)}-0001`, projectId, title: "Lecture Note",
        objective: "A complete course note.", position: 0,
        createdAt: `${previousDate}T09:01:00+08:00`, updatedAt: `${previousDate}T09:01:00+08:00`,
      }],
      taskDays: [{
        id: dayId, taskId, date: previousDate, plan: "Finish lecture 1.", outcome: "", state: "planned",
        position: 0, createdAt: `${previousDate}T09:02:00+08:00`, updatedAt: `${previousDate}T09:02:00+08:00`,
      }],
      contributions: [],
    }),
  });

  const continued = await saveTasks(env, v4({
    mode: "updateTaskDay",
    baseRevision: "0",
    taskDay: {
      id: dayId,
      plan: "Finish lecture 1.",
      outcome: "The derivation is complete; examples remain.",
      state: "partial",
      continueToday: true,
      nextPlan: "Add the lecture examples.",
    },
  }));
  assert.equal(continued.taskDays.length, 2);
  assert.equal(continued.taskDays.find((day) => day.date === previousDate)!.state, "partial");
  assert.deepEqual(continued.taskDays.find((day) => day.date === today), {
    id: continued.taskDays.find((day) => day.date === today)!.id,
    taskId,
    date: today,
    plan: "Add the lecture examples.",
    outcome: "",
    state: "planned",
    position: 0,
    createdAt: continued.taskDays.find((day) => day.date === today)!.createdAt,
    updatedAt: continued.taskDays.find((day) => day.date === today)!.updatedAt,
  });
});

test("Tasks reject stale revisions, duplicate Today claims, and unavailable Projects", async () => {
  const { env } = environment();
  const { projectResult, taskResult } = await createProjectAndTask(env);
  await assert.rejects(
    saveTasks(env, v4({
      mode: "updateProject",
      baseRevision: "0",
      project: { ...projectResult.projects[0], title: "Changed" },
    })),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  const planned = await saveTasks(env, v4({
    mode: "createTaskDay",
    baseRevision: taskResult.revision,
    taskDay: { taskId: taskResult.tasks[0]!.id, plan: "Start the solve." },
  }));
  await assert.rejects(
    saveTasks(env, v4({
      mode: "createTaskDay",
      baseRevision: planned.revision,
      taskDay: { taskId: taskResult.tasks[0]!.id, plan: "Duplicate." },
    })),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  await assert.rejects(
    saveTasks(env, v4({
      mode: "createTask",
      baseRevision: planned.revision,
      task: { projectId: `project-${"f".repeat(24)}`, title: "Orphan", objective: "" },
    })),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
});

test("Task codes increment per Project and remain stable when moved", async () => {
  const { env } = environment();
  const year = singaporeTimestamp().slice(0, 4);
  const site = await saveTasks(env, v4({
    mode: "createProject",
    baseRevision: "0",
    project: { key: "SITE", title: "Personal Website", description: "", color: "#2563eb", status: "active" },
  }));
  const notes = await saveTasks(env, v4({
    mode: "createProject",
    baseRevision: site.revision,
    project: { key: "NOTES", title: "Notes", description: "", color: "#a855f7", status: "active" },
  }));
  const first = await saveTasks(env, v4({
    mode: "createTask",
    baseRevision: notes.revision,
    task: { projectId: site.projects[0]!.id, title: "First", objective: "" },
  }));
  const second = await saveTasks(env, v4({
    mode: "createTask",
    baseRevision: first.revision,
    task: { projectId: site.projects[0]!.id, title: "Second", objective: "" },
  }));
  assert.equal(first.tasks[0]!.code, `SITE-${year}-0001`);
  assert.equal(second.tasks[1]!.code, `SITE-${year}-0002`);
  const moved = await saveTasks(env, v4({
    mode: "updateTask",
    baseRevision: second.revision,
    task: { ...second.tasks[0], projectId: notes.projects[1]!.id },
  }));
  assert.equal(moved.tasks[0]!.projectId, notes.projects[1]!.id);
  assert.equal(moved.tasks[0]!.code, `SITE-${year}-0001`);
});

test("schema version 1 receives deterministic identifiers and persists as schema 4", async () => {
  const { env, objects } = environment();
  const projectId = `project-${"a".repeat(24)}`;
  const taskId = `task-${"b".repeat(24)}`;
  objects.set("published/tasks/state.json", {
    etag: "etag-legacy",
    value: JSON.stringify({
      schemaVersion: 1,
      revision: "0",
      updatedAt: "2026-09-01T09:00:00+08:00",
      projects: [{
        id: projectId, title: "Differentiable Solver", description: "Research", color: "#2f855a",
        status: "active", createdAt: "2026-09-01T09:00:00+08:00", updatedAt: "2026-09-01T09:00:00+08:00",
      }],
      tasks: [{
        id: taskId, projectId, title: "T090101", status: "todo", priority: "normal", scheduledDate: null,
        createdAt: "2026-09-01T09:01:00+08:00", updatedAt: "2026-09-01T09:01:00+08:00",
      }],
      activity: [],
    }),
  });
  const response = await tasksResponse(env, new Request("https://xayah.me/data/tasks", {
    headers: { Accept: "application/vnd.xayah.tasks.v4+json" },
  }));
  const migrated = await response.json() as Record<string, any>;
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.projects[0].key, "DS");
  assert.equal(migrated.tasks[0].code, "DS-2026-0001");
  assert.equal(migrated.tasks[0].objective, "");
  assert.deepEqual(migrated.taskDays, []);
  await saveTasks(env, v4({
    mode: "updateTask",
    baseRevision: migrated.revision,
    task: { ...migrated.tasks[0], title: "Implement the solver" },
  }));
  const stored = JSON.parse(objects.get("published/tasks/state.json")!.value);
  assert.equal(stored.schemaVersion, 4);
  assert.deepEqual(stored.taskDays, []);
});

test("schema version 3 migrates only currently surfaced open work into Today", async () => {
  const { env, objects } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const year = today.slice(0, 4);
  const projectId = `project-${"c".repeat(24)}`;
  const doneId = `task-${"d".repeat(24)}`;
  const todayId = `task-${"e".repeat(24)}`;
  const futureId = `task-${"f".repeat(24)}`;
  const future = `${Number(year) + 1}-01-01`;
  const completedAt = `${today}T08:00:00+08:00`;
  objects.set("published/tasks/state.json", {
    etag: "etag-v3",
    value: JSON.stringify({
      schemaVersion: 3,
      revision: "0",
      updatedAt: `${today}T09:00:00+08:00`,
      projects: [{
        id: projectId, key: "SPEC", title: "Spectra", description: "Renderer", color: "#842e2e",
        status: "active", createdAt: `${today}T07:00:00+08:00`, updatedAt: `${today}T07:00:00+08:00`,
      }],
      tasks: [
        { id: doneId, code: `SPEC-${year}-0001`, projectId, title: "Done", status: "done", priority: "high", scheduledDate: today, createdAt: `${today}T07:01:00+08:00`, updatedAt: completedAt, completedAt },
        { id: todayId, code: `SPEC-${year}-0002`, projectId, title: "Work today", status: "in_progress", priority: "normal", scheduledDate: today, createdAt: `${today}T07:02:00+08:00`, updatedAt: `${today}T07:02:00+08:00` },
        { id: futureId, code: `SPEC-${year}-0003`, projectId, title: "Future pool", status: "todo", priority: "high", scheduledDate: future, createdAt: `${today}T07:03:00+08:00`, updatedAt: `${today}T07:03:00+08:00` },
      ],
      contributions: [{
        taskId: doneId, taskCode: `SPEC-${year}-0001`, taskTitle: "Done", projectId, projectKey: "SPEC",
        projectTitle: "Spectra", projectColor: "#842e2e", completedAt,
      }],
    }),
  });
  const response = await tasksResponse(env, new Request("https://xayah.me/data/tasks", {
    headers: { Accept: "application/vnd.xayah.tasks.v4+json" },
  }));
  const migrated = await response.json() as Record<string, any>;
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.tasks[0].completedAt, completedAt);
  assert.equal(migrated.tasks[1].completedAt, undefined);
  assert.equal(migrated.taskDays.length, 1);
  assert.equal(migrated.taskDays[0].taskId, todayId);
  assert.equal(migrated.taskDays[0].plan, "Work today");
  assert.equal(migrated.taskDays.some((day: any) => day.taskId === futureId), false);
});
