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

async function createProjectAndTask(env: never) {
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
  const taskResult = await saveTasks(env, {
    mode: "createTask",
    baseRevision: projectResult.revision,
    task: {
      projectId: projectResult.projects[0]!.id,
      title: "Implement the linear solve",
      objective: "A stable solve with regression coverage.",
    },
  });
  return { projectResult, taskResult };
}

test("Tasks use binary completion and independent Task Days", async () => {
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

  const planned = await saveTasks(env, {
    mode: "createTaskDay",
    baseRevision: taskResult.revision,
    taskDay: { taskId: task.id, plan: "Finish the direct solver and its tests." },
  });
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
    saveTasks(env, {
      mode: "updateTaskDay",
      baseRevision: planned.revision,
      taskDay: {
        id: planned.taskDays[0]!.id,
        plan: planned.taskDays[0]!.plan,
        outcome: "",
        state: "partial",
      },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
  const partial = await saveTasks(env, {
    mode: "updateTaskDay",
    baseRevision: planned.revision,
    taskDay: {
      id: planned.taskDays[0]!.id,
      plan: planned.taskDays[0]!.plan,
      outcome: "The solver works; two tests remain.",
      state: "partial",
    },
  });
  assert.equal(partial.taskDays[0]!.state, "partial");
  assert.ok(partial.taskDays[0]!.reviewedAt);

  const completed = await saveTasks(env, {
    mode: "completeTask",
    baseRevision: partial.revision,
    task: { id: task.id },
  });
  assert.ok(completed.tasks[0]!.completedAt);
  assert.equal(completed.contributions.length, 1);

  const reopened = await saveTasks(env, {
    mode: "reopenTask",
    baseRevision: completed.revision,
    task: { id: task.id },
  });
  const recompleted = await saveTasks(env, {
    mode: "completeTask",
    baseRevision: reopened.revision,
    task: { id: task.id },
  });
  assert.equal(recompleted.contributions.length, 1);
  assert.ok(objects.has("published/tasks/state.json"));
  assert.ok([...objects.keys()].some((key) => key.startsWith("private/tasks/history/")));
});

test("Task API exposes only schema 4 and rejects obsolete contracts", async () => {
  const { env } = environment();
  const { taskResult } = await createProjectAndTask(env);
  const response = await tasksResponse(env, new Request("https://xayah.me/data/tasks"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("vary"), null);
  assert.match(response.headers.get("etag")!, /^"v4-/);
  const current = await response.json() as Record<string, any>;
  assert.equal(current.schemaVersion, 4);
  assert.deepEqual(current.taskDays, []);
  assert.equal(current.tasks[0].objective, "A stable solve with regression coverage.");

  const unchanged = await tasksResponse(env, new Request("https://xayah.me/data/tasks", {
    headers: { "If-None-Match": response.headers.get("etag")! },
  }));
  assert.equal(unchanged.status, 304);

  await assert.rejects(
    saveTasks(env, {
      mode: "updateTask",
      baseRevision: taskResult.revision,
      task: {
        id: taskResult.tasks[0]!.id,
        projectId: taskResult.tasks[0]!.projectId,
        title: taskResult.tasks[0]!.title,
        objective: taskResult.tasks[0]!.objective,
        status: "done",
      },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );

  await assert.rejects(
    saveTasks(env, {
      mode: "completeTask",
      baseRevision: taskResult.revision,
      task: { id: taskResult.tasks[0]!.id },
      clientSchema: 4,
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );

  const obsolete = environment();
  obsolete.objects.set("published/tasks/state.json", {
    etag: "etag-obsolete",
    value: JSON.stringify({
      schemaVersion: 3,
      revision: "0",
      updatedAt: "2026-09-01T09:00:00+08:00",
      projects: [],
      tasks: [],
      contributions: [],
    }),
  });
  await assert.rejects(
    tasksResponse(obsolete.env, new Request("https://xayah.me/data/tasks")),
    (error: unknown) => error instanceof HttpError && error.status === 500,
  );
});

test("Previous plans can be reviewed and continued without moving history", async () => {
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

  const paused = await saveTasks(env, {
    mode: "updateProject",
    baseRevision: "0",
    project: {
      id: projectId,
      title: "FlowDiT",
      description: "",
      color: "#6d2e84",
      status: "paused",
    },
  });
  const review = {
    id: dayId,
    plan: "Finish lecture 1.",
    outcome: "The derivation is complete; examples remain.",
    state: "partial",
    continueToday: true,
    nextPlan: "Add the lecture examples.",
  };
  await assert.rejects(
    saveTasks(env, {
      mode: "updateTaskDay",
      baseRevision: paused.revision,
      taskDay: review,
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
  const active = await saveTasks(env, {
    mode: "updateProject",
    baseRevision: paused.revision,
    project: {
      id: projectId,
      title: "FlowDiT",
      description: "",
      color: "#6d2e84",
      status: "active",
    },
  });
  const continued = await saveTasks(env, {
    mode: "updateTaskDay",
    baseRevision: active.revision,
    taskDay: review,
  });
  assert.equal(continued.taskDays.length, 2);
  assert.equal(continued.taskDays.find((day) => day.date === previousDate)!.state, "partial");
  assert.equal(continued.taskDays.find((day) => day.date === today)!.plan, "Add the lecture examples.");
});

test("Tasks reject stale revisions, duplicate Today claims, and unavailable Projects", async () => {
  const { env } = environment();
  const { projectResult, taskResult } = await createProjectAndTask(env);
  await assert.rejects(
    saveTasks(env, {
      mode: "updateProject",
      baseRevision: "0",
      project: {
        id: projectResult.projects[0]!.id,
        title: "Changed",
        description: projectResult.projects[0]!.description,
        color: projectResult.projects[0]!.color,
        status: projectResult.projects[0]!.status,
      },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  const planned = await saveTasks(env, {
    mode: "createTaskDay",
    baseRevision: taskResult.revision,
    taskDay: { taskId: taskResult.tasks[0]!.id, plan: "Start the solve." },
  });
  await assert.rejects(
    saveTasks(env, {
      mode: "createTaskDay",
      baseRevision: planned.revision,
      taskDay: { taskId: taskResult.tasks[0]!.id, plan: "Duplicate." },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  await assert.rejects(
    saveTasks(env, {
      mode: "createTask",
      baseRevision: planned.revision,
      task: { projectId: `project-${"f".repeat(24)}`, title: "Orphan", objective: "" },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
});

test("Task codes increment per Project and remain stable when moved", async () => {
  const { env } = environment();
  const year = singaporeTimestamp().slice(0, 4);
  const site = await saveTasks(env, {
    mode: "createProject",
    baseRevision: "0",
    project: { key: "SITE", title: "Personal Website", description: "", color: "#2563eb", status: "active" },
  });
  const notes = await saveTasks(env, {
    mode: "createProject",
    baseRevision: site.revision,
    project: { key: "NOTES", title: "Notes", description: "", color: "#a855f7", status: "active" },
  });
  const first = await saveTasks(env, {
    mode: "createTask",
    baseRevision: notes.revision,
    task: { projectId: site.projects[0]!.id, title: "First", objective: "" },
  });
  const second = await saveTasks(env, {
    mode: "createTask",
    baseRevision: first.revision,
    task: { projectId: site.projects[0]!.id, title: "Second", objective: "" },
  });
  assert.equal(first.tasks[0]!.code, `SITE-${year}-0001`);
  assert.equal(second.tasks[1]!.code, `SITE-${year}-0002`);
  const moved = await saveTasks(env, {
    mode: "updateTask",
    baseRevision: second.revision,
    task: {
      id: second.tasks[0]!.id,
      projectId: notes.projects[1]!.id,
      title: second.tasks[0]!.title,
      objective: second.tasks[0]!.objective,
    },
  });
  assert.equal(moved.tasks[0]!.projectId, notes.projects[1]!.id);
  assert.equal(moved.tasks[0]!.code, `SITE-${year}-0001`);
});

test("Only active Projects accept Task changes and Projects with open Tasks cannot complete", async () => {
  const { env } = environment();
  const { projectResult, taskResult } = await createProjectAndTask(env);
  const project = projectResult.projects[0]!;
  const task = taskResult.tasks[0]!;

  await assert.rejects(
    saveTasks(env, {
      mode: "updateProject",
      baseRevision: taskResult.revision,
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        color: project.color,
        status: "completed",
      },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400
      && error.message === "Complete every open Task before completing this Project.",
  );

  const paused = await saveTasks(env, {
    mode: "updateProject",
    baseRevision: taskResult.revision,
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      color: project.color,
      status: "paused",
    },
  });
  await assert.rejects(
    saveTasks(env, {
      mode: "createTask",
      baseRevision: paused.revision,
      task: { projectId: project.id, title: "Unavailable", objective: "" },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
  await assert.rejects(
    saveTasks(env, {
      mode: "updateTask",
      baseRevision: paused.revision,
      task: { id: task.id, projectId: project.id, title: "Unavailable", objective: task.objective },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
  await assert.rejects(
    saveTasks(env, {
      mode: "completeTask",
      baseRevision: paused.revision,
      task: { id: task.id },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );

  const active = await saveTasks(env, {
    mode: "updateProject",
    baseRevision: paused.revision,
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      color: project.color,
      status: "active",
    },
  });
  const completedTask = await saveTasks(env, {
    mode: "completeTask",
    baseRevision: active.revision,
    task: { id: task.id },
  });
  const completedProject = await saveTasks(env, {
    mode: "updateProject",
    baseRevision: completedTask.revision,
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      color: project.color,
      status: "completed",
    },
  });
  await assert.rejects(
    saveTasks(env, {
      mode: "reopenTask",
      baseRevision: completedProject.revision,
      task: { id: task.id },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
});
