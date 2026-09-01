import { getTaskStateVersioned, putTaskStateConditional } from "./storage";
import type { Env, TaskActivityDay, TaskItem, TaskProject, TaskState } from "./types";
import { asRecord, HttpError, randomHex, requiredString, singaporeTimestamp } from "./utils";

const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PROJECT_ID = /^project-[a-f0-9]{24}$/;
const TASK_ID = /^task-[a-f0-9]{24}$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,7}$/;
const TASK_CODE = /^([A-Z][A-Z0-9]{1,7})-(\d{4})-(\d{4})$/;
const REVISION = /^(?:0|[a-f0-9]{32})$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const MAX_PROJECTS = 100;
const MAX_TASKS = 2000;
const MAX_ACTIVITY_DAYS = 730;

type TaskMode =
  | "createProject"
  | "updateProject"
  | "archiveProject"
  | "createTask"
  | "updateTask"
  | "archiveTask";

interface VersionedTaskState {
  state: TaskState;
  etag: string | null;
}

export interface PublicTaskData extends TaskState {
  today: string;
  activity: Array<TaskActivityDay & { score: number }>;
}

function emptyState(): TaskState {
  return {
    schemaVersion: 2,
    revision: "0",
    updatedAt: "1970-01-01T00:00:00.000Z",
    projects: [],
    tasks: [],
    activity: [],
  };
}

function todayInSingapore(): string {
  return singaporeTimestamp().slice(0, 10);
}

function parseDate(value: unknown, label: string, optional = false): string | null {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new HttpError(400, `${label} is invalid.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return value;
}

function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new HttpError(500, `${label} is invalid.`);
  }
  return value;
}

function singaporeYear(value: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Singapore" })
    .format(new Date(value));
}

function projectKeyBase(title: string): string | null {
  const words = title.normalize("NFKD").match(/[A-Za-z0-9]+/g) || [];
  if (!words.length) return null;
  let base = words.length > 1
    ? words.map((word) => word[0]).join("")
    : words[0]!.slice(0, 4);
  base = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]/.test(base)) base = `P${base}`;
  if (base.length < 2) base = `${base}P`;
  return base.slice(0, 8);
}

function uniqueProjectKey(title: string, used: Set<string>): string {
  const base = projectKeyBase(title);
  if (!base) {
    for (let sequence = 1; sequence <= 9999; sequence += 1) {
      const candidate = `P${String(sequence).padStart(2, "0")}`;
      if (!used.has(candidate)) return candidate;
    }
    throw new HttpError(400, "No automatic Project key is available.");
  }
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const digits = String(suffix);
    const candidate = `${base.slice(0, 8 - digits.length)}${digits}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new HttpError(400, "No automatic Project key is available.");
}

function nextTaskCode(projectKey: string, createdAt: string, tasks: TaskItem[]): string {
  const year = singaporeYear(createdAt);
  const prefix = `${projectKey}-${year}-`;
  const sequence = tasks.reduce((maximum, task) => {
    if (!task.code.startsWith(prefix)) return maximum;
    return Math.max(maximum, Number(task.code.slice(prefix.length)) || 0);
  }, 0) + 1;
  if (sequence > 9999) throw new HttpError(400, `Project ${projectKey} has no Task numbers left for ${year}.`);
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

function migrateIdentifiers(projects: TaskProject[], tasks: TaskItem[]): void {
  const usedKeys = new Set<string>();
  for (const project of [...projects].sort((left, right) => left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id))) {
    project.key = uniqueProjectKey(project.title, usedKeys);
    usedKeys.add(project.key);
  }
  const projectKeys = new Map(projects.map((project) => [project.id, project.key]));
  const assigned: TaskItem[] = [];
  for (const task of [...tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id))) {
    task.code = nextTaskCode(projectKeys.get(task.projectId)!, task.createdAt, assigned);
    assigned.push(task);
  }
}

function storedProject(value: unknown, schemaVersion: 1 | 2): TaskProject {
  const record = asRecord(value, "Stored Task data contains an invalid project.");
  if (!PROJECT_ID.test(String(record.id || ""))
    || !["active", "paused", "completed"].includes(String(record.status || ""))
    || !COLOR.test(String(record.color || ""))
    || (schemaVersion === 2 && !PROJECT_KEY.test(String(record.key || "")))) {
    throw new HttpError(500, "Stored Task data contains an invalid project.");
  }
  const project: TaskProject = {
    id: String(record.id),
    key: schemaVersion === 2 ? String(record.key) : "",
    title: requiredString(record.title, "Stored project title", 120),
    description: requiredString(record.description, "Stored project description", 600, true),
    color: String(record.color).toLowerCase(),
    status: record.status as TaskProject["status"],
    createdAt: parseTimestamp(record.createdAt, "Stored project createdAt"),
    updatedAt: parseTimestamp(record.updatedAt, "Stored project updatedAt"),
  };
  if (record.completedAt !== undefined) project.completedAt = parseTimestamp(record.completedAt, "Stored project completedAt");
  if (record.archivedAt !== undefined) project.archivedAt = parseTimestamp(record.archivedAt, "Stored project archivedAt");
  return project;
}

function storedTask(value: unknown, schemaVersion: 1 | 2): TaskItem {
  const record = asRecord(value, "Stored Task data contains an invalid task.");
  if (!TASK_ID.test(String(record.id || "")) || !PROJECT_ID.test(String(record.projectId || ""))
    || !["todo", "in_progress", "done"].includes(String(record.status || ""))
    || !["normal", "high"].includes(String(record.priority || ""))
    || (schemaVersion === 2 && !TASK_CODE.test(String(record.code || "")))) {
    throw new HttpError(500, "Stored Task data contains an invalid task.");
  }
  const task: TaskItem = {
    id: String(record.id),
    code: schemaVersion === 2 ? String(record.code) : "",
    projectId: String(record.projectId),
    title: requiredString(record.title, "Stored task title", 180),
    status: record.status as TaskItem["status"],
    priority: record.priority as TaskItem["priority"],
    scheduledDate: parseDate(record.scheduledDate, "Stored task scheduledDate", true),
    createdAt: parseTimestamp(record.createdAt, "Stored task createdAt"),
    updatedAt: parseTimestamp(record.updatedAt, "Stored task updatedAt"),
  };
  if (record.completedAt !== undefined) task.completedAt = parseTimestamp(record.completedAt, "Stored task completedAt");
  if (record.archivedAt !== undefined) task.archivedAt = parseTimestamp(record.archivedAt, "Stored task archivedAt");
  return task;
}

function storedActivity(value: unknown): TaskActivityDay {
  const record = asRecord(value, "Stored Task data contains an invalid activity day.");
  const date = parseDate(record.date, "Stored activity date");
  if (!Number.isInteger(record.updates) || Number(record.updates) < 0
    || !Number.isInteger(record.completions) || Number(record.completions) < 0) {
    throw new HttpError(500, "Stored Task data contains an invalid activity day.");
  }
  return { date: date!, updates: Number(record.updates), completions: Number(record.completions) };
}

function validateState(value: unknown): TaskState {
  const record = asRecord(value, "Stored Task data is invalid.");
  if (![1, 2].includes(Number(record.schemaVersion)) || !REVISION.test(String(record.revision || ""))
    || !Array.isArray(record.projects) || record.projects.length > MAX_PROJECTS
    || !Array.isArray(record.tasks) || record.tasks.length > MAX_TASKS
    || !Array.isArray(record.activity) || record.activity.length > MAX_ACTIVITY_DAYS) {
    throw new HttpError(500, "Stored Task data is invalid.");
  }
  const schemaVersion = Number(record.schemaVersion) as 1 | 2;
  const projects = record.projects.map((project) => storedProject(project, schemaVersion));
  const tasks = record.tasks.map((task) => storedTask(task, schemaVersion));
  const activity = record.activity.map(storedActivity).sort((left, right) => left.date.localeCompare(right.date));
  if (schemaVersion === 1) migrateIdentifiers(projects, tasks);
  if (new Set(projects.map((project) => project.id)).size !== projects.length
    || new Set(tasks.map((task) => task.id)).size !== tasks.length
    || new Set(projects.map((project) => project.key)).size !== projects.length
    || new Set(tasks.map((task) => task.code)).size !== tasks.length
    || new Set(activity.map((day) => day.date)).size !== activity.length) {
    throw new HttpError(500, "Stored Task data contains duplicate records.");
  }
  const projectIds = new Set(projects.map((project) => project.id));
  const projectKeys = new Set(projects.map((project) => project.key));
  if (tasks.some((task) => !projectIds.has(task.projectId))) {
    throw new HttpError(500, "Stored Task data contains an orphaned task.");
  }
  for (const task of tasks) {
    const match = TASK_CODE.exec(task.code);
    if (!match || !projectKeys.has(match[1]) || match[2] !== singaporeYear(task.createdAt) || match[3] === "0000") {
      throw new HttpError(500, "Stored Task data contains an invalid Task code.");
    }
  }
  return {
    schemaVersion: 2,
    revision: String(record.revision),
    updatedAt: parseTimestamp(record.updatedAt, "Stored Task updatedAt"),
    projects,
    tasks,
    activity,
  };
}

async function versionedState(env: Env): Promise<VersionedTaskState> {
  const current = await getTaskStateVersioned(env);
  if (!current) return { state: emptyState(), etag: null };
  return { state: validateState(current.state), etag: current.etag };
}

function publicData(state: TaskState): PublicTaskData {
  return {
    ...state,
    today: todayInSingapore(),
    activity: state.activity.map((day) => ({ ...day, score: day.updates + day.completions * 2 })),
  };
}

function addActivity(activity: TaskActivityDay[], completions = 0): TaskActivityDay[] {
  const today = todayInSingapore();
  const next = activity.map((day) => ({ ...day }));
  const existing = next.find((day) => day.date === today);
  if (existing) {
    existing.updates += 1;
    existing.completions += completions;
  } else {
    next.push({ date: today, updates: 1, completions });
  }
  return next.sort((left, right) => left.date.localeCompare(right.date)).slice(-MAX_ACTIVITY_DAYS);
}

function mutationPayload(payload: Record<string, unknown>): { mode: TaskMode; baseRevision: string; value: Record<string, unknown> } {
  const mode = String(payload.mode || "") as TaskMode;
  if (!["createProject", "updateProject", "archiveProject", "createTask", "updateTask", "archiveTask"].includes(mode)) {
    throw new HttpError(400, "Task operation is invalid.");
  }
  const baseRevision = String(payload.baseRevision ?? "");
  if (!REVISION.test(baseRevision)) throw new HttpError(400, "Task revision is invalid.");
  const source = mode.endsWith("Project") ? payload.project : payload.task;
  return { mode, baseRevision, value: asRecord(source, "Task operation data is invalid.") };
}

function projectInput(value: Record<string, unknown>): Pick<TaskProject, "title" | "description" | "color" | "status"> {
  const status = String(value.status || "active") as TaskProject["status"];
  const color = String(value.color || "#2f855a").toLowerCase();
  if (!["active", "paused", "completed"].includes(status)) throw new HttpError(400, "Project status is invalid.");
  if (!COLOR.test(color)) throw new HttpError(400, "Project color is invalid.");
  return {
    title: requiredString(value.title, "Project title", 120),
    description: requiredString(value.description ?? "", "Project description", 600, true),
    color,
    status,
  };
}

function taskInput(value: Record<string, unknown>): Pick<TaskItem, "projectId" | "title" | "status" | "priority" | "scheduledDate"> {
  const projectId = String(value.projectId || "");
  const status = String(value.status || "todo") as TaskItem["status"];
  const priority = String(value.priority || "normal") as TaskItem["priority"];
  if (!PROJECT_ID.test(projectId)) throw new HttpError(400, "Task project is invalid.");
  if (!["todo", "in_progress", "done"].includes(status)) throw new HttpError(400, "Task status is invalid.");
  if (!["normal", "high"].includes(priority)) throw new HttpError(400, "Task priority is invalid.");
  return {
    projectId,
    title: requiredString(value.title, "Task title", 180),
    status,
    priority,
    scheduledDate: parseDate(value.scheduledDate, "Task scheduled date", true),
  };
}

function sameProject(left: TaskProject, right: ReturnType<typeof projectInput>): boolean {
  return left.title === right.title && left.description === right.description
    && left.color === right.color && left.status === right.status;
}

function sameTask(left: TaskItem, right: ReturnType<typeof taskInput>): boolean {
  return left.projectId === right.projectId && left.title === right.title
    && left.status === right.status && left.priority === right.priority
    && left.scheduledDate === right.scheduledDate;
}

export async function saveTasks(env: Env, payload: Record<string, unknown>): Promise<PublicTaskData & { status: string }> {
  const { mode, baseRevision, value } = mutationPayload(payload);
  const current = await versionedState(env);
  if (current.state.revision !== baseRevision) {
    throw new HttpError(409, "Tasks changed in another session. Reload and try again.");
  }
  const timestamp = singaporeTimestamp();
  let projects = current.state.projects.map((project) => ({ ...project }));
  let tasks = current.state.tasks.map((task) => ({ ...task }));
  let activity = current.state.activity;
  let status = "updated";
  let completions = 0;

  if (mode === "createProject") {
    if (projects.length >= MAX_PROJECTS) throw new HttpError(400, "The 100-project limit has been reached.");
    const input = projectInput(value);
    const usedKeys = new Set(projects.map((project) => project.key));
    const requestedKey = String(value.key || "").trim().toUpperCase();
    const key = requestedKey || uniqueProjectKey(input.title, usedKeys);
    if (!PROJECT_KEY.test(key)) throw new HttpError(400, "Project key must contain 2–8 uppercase letters or numbers and begin with a letter.");
    if (usedKeys.has(key)) throw new HttpError(400, `Project key ${key} is already in use.`);
    const project: TaskProject = {
      id: `project-${randomHex(12)}`,
      key,
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.status === "completed" ? { completedAt: timestamp } : {}),
    };
    projects.push(project);
    status = "created";
  } else if (mode === "updateProject") {
    const id = String(value.id || "");
    const index = projects.findIndex((project) => project.id === id && !project.archivedAt);
    if (index < 0) throw new HttpError(404, "Project was not found.");
    const input = projectInput(value);
    if (sameProject(projects[index], input)) return { ...publicData(current.state), status: "unchanged" };
    const original = projects[index];
    projects[index] = {
      ...original,
      ...input,
      updatedAt: timestamp,
      ...(input.status === "completed"
        ? { completedAt: original.completedAt || timestamp }
        : { completedAt: undefined }),
    };
  } else if (mode === "archiveProject") {
    const id = String(value.id || "");
    const project = projects.find((candidate) => candidate.id === id);
    if (!project || project.archivedAt) throw new HttpError(404, "Project was not found.");
    project.archivedAt = timestamp;
    project.updatedAt = timestamp;
    tasks = tasks.map((task) => task.projectId === id && !task.archivedAt
      ? { ...task, archivedAt: timestamp, updatedAt: timestamp }
      : task);
    status = "archived";
  } else if (mode === "createTask") {
    if (tasks.length >= MAX_TASKS) throw new HttpError(400, "The 2,000-task limit has been reached.");
    const input = taskInput(value);
    if (!projects.some((project) => project.id === input.projectId && !project.archivedAt)) {
      throw new HttpError(400, "Task project is unavailable.");
    }
    const task: TaskItem = {
      id: `task-${randomHex(12)}`,
      code: nextTaskCode(projects.find((project) => project.id === input.projectId)!.key, timestamp, tasks),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.status === "done" ? { completedAt: timestamp } : {}),
    };
    tasks.push(task);
    if (input.status === "done") completions = 1;
    status = "created";
  } else if (mode === "updateTask") {
    const id = String(value.id || "");
    const index = tasks.findIndex((task) => task.id === id && !task.archivedAt);
    if (index < 0) throw new HttpError(404, "Task was not found.");
    const input = taskInput(value);
    if (!projects.some((project) => project.id === input.projectId && !project.archivedAt)) {
      throw new HttpError(400, "Task project is unavailable.");
    }
    if (sameTask(tasks[index], input)) return { ...publicData(current.state), status: "unchanged" };
    const original = tasks[index];
    if (original.status !== "done" && input.status === "done") completions = 1;
    tasks[index] = {
      ...original,
      ...input,
      updatedAt: timestamp,
      ...(input.status === "done"
        ? { completedAt: original.status === "done" ? original.completedAt : timestamp }
        : { completedAt: undefined }),
    };
  } else {
    const id = String(value.id || "");
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task || task.archivedAt) throw new HttpError(404, "Task was not found.");
    task.archivedAt = timestamp;
    task.updatedAt = timestamp;
    status = "archived";
  }

  activity = addActivity(activity, completions);
  const next: TaskState = {
    schemaVersion: 2,
    revision: randomHex(16),
    updatedAt: timestamp,
    projects,
    tasks,
    activity,
  };
  if (!await putTaskStateConditional(env, next, current.etag)) {
    throw new HttpError(409, "Tasks changed while saving. Reload and try again.");
  }
  return { ...publicData(next), status };
}

export async function tasksResponse(env: Env, request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "Published Tasks are read-only.");
  }
  const current = await versionedState(env);
  const data = publicData(current.state);
  const etag = `"v${data.schemaVersion}-${data.revision}-${data.today}"`;
  const requestEtags = (request.headers.get("if-none-match") || "")
    .split(",").map((value) => value.trim().replace(/^W\//, ""));
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: etag,
  };
  if (requestEtags.includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : JSON.stringify(data), { headers });
}
