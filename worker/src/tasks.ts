import { getTaskStateVersioned, putTaskStateConditional } from "./storage";
import type {
  Env,
  JournalRelatedTask,
  TaskContribution,
  TaskDay,
  TaskItem,
  TaskProject,
  TaskState,
} from "./types";
import { asRecord, HttpError, randomHex, requiredString, singaporeTimestamp } from "./utils";

const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PROJECT_ID = /^project-[a-f0-9]{24}$/;
const TASK_ID = /^task-[a-f0-9]{24}$/;
const TASK_DAY_ID = /^taskday-[a-f0-9]{24}$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,7}$/;
const TASK_CODE = /^([A-Z][A-Z0-9]{1,7})-(\d{4})-(\d{4})$/;
const REVISION = /^(?:0|[a-f0-9]{32})$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const TASK_DAY_STATES = new Set<TaskDay["state"]>(["planned", "completed", "partial", "no_progress"]);
const MAX_PROJECTS = 100;
const MAX_TASKS = 2000;
const MAX_TASK_DAYS = 20_000;

type TaskMode =
  | "createProject"
  | "updateProject"
  | "archiveProject"
  | "createTask"
  | "updateTask"
  | "completeTask"
  | "reopenTask"
  | "archiveTask"
  | "createTaskDay"
  | "updateTaskDay"
  | "removeTaskDay"
  | "reorderTaskDays";

interface VersionedTaskState {
  state: TaskState;
  etag: string | null;
}

export interface PublicTaskData extends TaskState {
  today: string;
}

function emptyState(): TaskState {
  return {
    schemaVersion: 4,
    revision: "0",
    updatedAt: "1970-01-01T00:00:00.000Z",
    projects: [],
    tasks: [],
    taskDays: [],
    contributions: [],
  };
}

function todayInSingapore(): string {
  return singaporeTimestamp().slice(0, 10);
}

function parseDate(value: unknown, label: string): string {
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

function parsePosition(value: unknown, label: string, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new HttpError(500, `${label} is invalid.`);
  }
  return Number(value);
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

function storedProject(value: unknown): TaskProject {
  const record = asRecord(value, "Stored Task data contains an invalid project.");
  assertOnlyKeys(record, [
    "id", "key", "title", "description", "color", "status", "createdAt", "updatedAt", "completedAt", "archivedAt",
  ], "Stored Project", 500);
  if (!PROJECT_ID.test(String(record.id || ""))
    || !["active", "paused", "completed"].includes(String(record.status || ""))
    || !COLOR.test(String(record.color || ""))
    || !PROJECT_KEY.test(String(record.key || ""))) {
    throw new HttpError(500, "Stored Task data contains an invalid project.");
  }
  const project: TaskProject = {
    id: String(record.id),
    key: String(record.key),
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

function storedTask(value: unknown): TaskItem {
  const record = asRecord(value, "Stored Task data contains an invalid task.");
  assertOnlyKeys(record, [
    "id", "code", "projectId", "title", "objective", "position", "createdAt", "updatedAt", "completedAt", "archivedAt",
  ], "Stored Task", 500);
  if (!TASK_ID.test(String(record.id || "")) || !PROJECT_ID.test(String(record.projectId || ""))
    || !TASK_CODE.test(String(record.code || ""))) {
    throw new HttpError(500, "Stored Task data contains an invalid task.");
  }
  const task: TaskItem = {
    id: String(record.id),
    code: String(record.code),
    projectId: String(record.projectId),
    title: requiredString(record.title, "Stored task title", 180),
    objective: requiredString(record.objective ?? "", "Stored task objective", 2000, true),
    position: parsePosition(record.position, "Stored task position", MAX_TASKS),
    createdAt: parseTimestamp(record.createdAt, "Stored task createdAt"),
    updatedAt: parseTimestamp(record.updatedAt, "Stored task updatedAt"),
  };
  if (record.completedAt !== undefined) task.completedAt = parseTimestamp(record.completedAt, "Stored task completedAt");
  if (record.archivedAt !== undefined) task.archivedAt = parseTimestamp(record.archivedAt, "Stored task archivedAt");
  return task;
}

function storedTaskDay(value: unknown): TaskDay {
  const record = asRecord(value, "Stored Task data contains an invalid Task Day.");
  assertOnlyKeys(record, [
    "id", "taskId", "date", "plan", "outcome", "state", "position", "createdAt", "updatedAt", "reviewedAt",
  ], "Stored Task Day", 500);
  if (!TASK_DAY_ID.test(String(record.id || "")) || !TASK_ID.test(String(record.taskId || ""))
    || !TASK_DAY_STATES.has(String(record.state || "") as TaskDay["state"])) {
    throw new HttpError(500, "Stored Task data contains an invalid Task Day.");
  }
  const taskDay: TaskDay = {
    id: String(record.id),
    taskId: String(record.taskId),
    date: parseDate(record.date, "Stored Task Day date"),
    plan: requiredString(record.plan, "Stored Task Day plan", 600),
    outcome: requiredString(record.outcome ?? "", "Stored Task Day outcome", 2000, true),
    state: record.state as TaskDay["state"],
    position: parsePosition(record.position, "Stored Task Day position", MAX_TASK_DAYS),
    createdAt: parseTimestamp(record.createdAt, "Stored Task Day createdAt"),
    updatedAt: parseTimestamp(record.updatedAt, "Stored Task Day updatedAt"),
  };
  if (record.reviewedAt !== undefined) taskDay.reviewedAt = parseTimestamp(record.reviewedAt, "Stored Task Day reviewedAt");
  return taskDay;
}

function contributionSnapshot(task: TaskItem, project: TaskProject, completedAt: string): TaskContribution {
  return {
    taskId: task.id,
    taskCode: task.code,
    taskTitle: task.title,
    projectId: project.id,
    projectKey: project.key,
    projectTitle: project.title,
    projectColor: project.color,
    completedAt,
  };
}

function storedContribution(value: unknown): TaskContribution {
  const record = asRecord(value, "Stored Task data contains an invalid contribution.");
  assertOnlyKeys(record, [
    "taskId", "taskCode", "taskTitle", "projectId", "projectKey", "projectTitle", "projectColor", "completedAt",
  ], "Stored contribution", 500);
  if (!TASK_ID.test(String(record.taskId || ""))
    || !TASK_CODE.test(String(record.taskCode || ""))
    || !PROJECT_ID.test(String(record.projectId || ""))
    || !PROJECT_KEY.test(String(record.projectKey || ""))
    || !COLOR.test(String(record.projectColor || ""))) {
    throw new HttpError(500, "Stored Task data contains an invalid contribution.");
  }
  return {
    taskId: String(record.taskId),
    taskCode: String(record.taskCode),
    taskTitle: requiredString(record.taskTitle, "Stored contribution Task title", 180),
    projectId: String(record.projectId),
    projectKey: String(record.projectKey),
    projectTitle: requiredString(record.projectTitle, "Stored contribution Project title", 120),
    projectColor: String(record.projectColor).toLowerCase(),
    completedAt: parseTimestamp(record.completedAt, "Stored contribution completedAt"),
  };
}

function validateState(value: unknown): TaskState {
  const record = asRecord(value, "Stored Task data is invalid.");
  assertOnlyKeys(record, [
    "schemaVersion", "revision", "updatedAt", "projects", "tasks", "taskDays", "contributions",
  ], "Stored Task data", 500);
  if (record.schemaVersion !== 4 || !REVISION.test(String(record.revision || ""))
    || !Array.isArray(record.projects) || record.projects.length > MAX_PROJECTS
    || !Array.isArray(record.tasks) || record.tasks.length > MAX_TASKS
    || !Array.isArray(record.contributions) || record.contributions.length > MAX_TASKS
    || !Array.isArray(record.taskDays) || record.taskDays.length > MAX_TASK_DAYS) {
    throw new HttpError(500, "Stored Task data is invalid.");
  }
  const projects = record.projects.map(storedProject);
  const tasks = record.tasks.map(storedTask);
  const taskDays = record.taskDays.map(storedTaskDay);
  const contributions = record.contributions.map(storedContribution)
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.taskId.localeCompare(right.taskId));
  if (new Set(projects.map((project) => project.id)).size !== projects.length
    || new Set(tasks.map((task) => task.id)).size !== tasks.length
    || new Set(taskDays.map((taskDay) => taskDay.id)).size !== taskDays.length
    || new Set(projects.map((project) => project.key)).size !== projects.length
    || new Set(tasks.map((task) => task.code)).size !== tasks.length
    || new Set(taskDays.map((taskDay) => `${taskDay.taskId}:${taskDay.date}`)).size !== taskDays.length
    || new Set(contributions.map((contribution) => contribution.taskId)).size !== contributions.length) {
    throw new HttpError(500, "Stored Task data contains duplicate records.");
  }
  const projectIds = new Set(projects.map((project) => project.id));
  const projectKeys = new Set(projects.map((project) => project.key));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  if (tasks.some((task) => !projectIds.has(task.projectId))
    || taskDays.some((taskDay) => !tasksById.has(taskDay.taskId))) {
    throw new HttpError(500, "Stored Task data contains an orphaned record.");
  }
  for (const task of tasks) {
    const match = TASK_CODE.exec(task.code);
    if (!match || !projectKeys.has(match[1]) || match[2] !== singaporeYear(task.createdAt) || match[3] === "0000") {
      throw new HttpError(500, "Stored Task data contains an invalid Task code.");
    }
  }
  for (const contribution of contributions) {
    const task = tasksById.get(contribution.taskId);
    const project = projectsById.get(contribution.projectId);
    if (!task || !project || contribution.taskCode !== task.code || contribution.projectKey !== project.key) {
      throw new HttpError(500, "Stored Task data contains an orphaned contribution.");
    }
  }
  return {
    schemaVersion: 4,
    revision: String(record.revision),
    updatedAt: parseTimestamp(record.updatedAt, "Stored Task updatedAt"),
    projects,
    tasks,
    taskDays,
    contributions,
  };
}

async function versionedState(env: Env): Promise<VersionedTaskState> {
  const current = await getTaskStateVersioned(env);
  if (!current) return { state: emptyState(), etag: null };
  return { state: validateState(current.state), etag: current.etag };
}

function publicData(state: TaskState): PublicTaskData {
  return { ...state, today: todayInSingapore() };
}

export async function relatedTaskSnapshot(env: Env, id: string): Promise<JournalRelatedTask | null> {
  if (!TASK_ID.test(id)) return null;
  const { state } = await versionedState(env);
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) return null;
  const project = state.projects.find((candidate) => candidate.id === task.projectId);
  if (!project) return null;
  return {
    id: task.id,
    code: task.code,
    title: task.title,
    project: { id: project.id, key: project.key, title: project.title, color: project.color },
  };
}

function mutationPayload(payload: Record<string, unknown>): {
  mode: TaskMode;
  baseRevision: string;
  value: Record<string, unknown>;
} {
  const mode = String(payload.mode || "") as TaskMode;
  const modes: TaskMode[] = [
    "createProject", "updateProject", "archiveProject", "createTask", "updateTask", "completeTask",
    "reopenTask", "archiveTask", "createTaskDay", "updateTaskDay", "removeTaskDay", "reorderTaskDays",
  ];
  if (!modes.includes(mode)) throw new HttpError(400, "Task operation is invalid.");
  const baseRevision = String(payload.baseRevision ?? "");
  if (!REVISION.test(baseRevision)) throw new HttpError(400, "Task revision is invalid.");
  const container = mode.endsWith("Project")
    ? "project"
    : (mode.includes("TaskDay") || mode === "reorderTaskDays" ? "taskDay" : "task");
  assertOnlyKeys(payload, ["mode", "baseRevision", container], "Task operation");
  const value = asRecord(payload[container], "Task operation data is invalid.");
  const fields: Record<TaskMode, string[]> = {
    createProject: ["key", "title", "description", "color", "status"],
    updateProject: ["id", "title", "description", "color", "status"],
    archiveProject: ["id"],
    createTask: ["projectId", "title", "objective"],
    updateTask: ["id", "projectId", "title", "objective"],
    completeTask: ["id"],
    reopenTask: ["id"],
    archiveTask: ["id"],
    createTaskDay: ["taskId", "plan"],
    updateTaskDay: ["id", "plan", "outcome", "state", "continueToday", "nextPlan"],
    removeTaskDay: ["id"],
    reorderTaskDays: ["ids"],
  };
  assertOnlyKeys(value, fields[mode], "Task operation data");
  return {
    mode,
    baseRevision,
    value,
  };
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: string[], label: string, status = 400): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new HttpError(status, `${label} contains an unsupported field.`);
  }
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

function taskInput(
  value: Record<string, unknown>,
): Pick<TaskItem, "projectId" | "title" | "objective"> {
  const projectId = String(value.projectId || "");
  if (!PROJECT_ID.test(projectId)) throw new HttpError(400, "Task project is invalid.");
  return {
    projectId,
    title: requiredString(value.title, "Task title", 180),
    objective: requiredString(value.objective ?? "", "Task objective", 2000, true),
  };
}

function sameProject(left: TaskProject, right: ReturnType<typeof projectInput>): boolean {
  return left.title === right.title && left.description === right.description
    && left.color === right.color && left.status === right.status;
}

function sameTask(left: TaskItem, right: ReturnType<typeof taskInput>): boolean {
  return left.projectId === right.projectId && left.title === right.title && left.objective === right.objective;
}

function nextPosition(values: Array<{ position: number }>): number {
  return values.reduce((maximum, value) => Math.max(maximum, value.position), -1) + 1;
}

export async function saveTasks(
  env: Env,
  payload: Record<string, unknown>,
): Promise<PublicTaskData & { status: string }> {
  const { mode, baseRevision, value } = mutationPayload(payload);
  const current = await versionedState(env);
  if (current.state.revision !== baseRevision) {
    throw new HttpError(409, "Tasks changed in another session. Reload and try again.");
  }
  const timestamp = singaporeTimestamp();
  const today = timestamp.slice(0, 10);
  let projects = current.state.projects.map((project) => ({ ...project }));
  let tasks = current.state.tasks.map((task) => ({ ...task }));
  let taskDays = current.state.taskDays.map((taskDay) => ({ ...taskDay }));
  const contributions = current.state.contributions.map((contribution) => ({ ...contribution }));
  let status = "updated";

  if (mode === "createProject") {
    if (projects.length >= MAX_PROJECTS) throw new HttpError(400, "The 100-project limit has been reached.");
    const input = projectInput(value);
    const usedKeys = new Set(projects.map((project) => project.key));
    const requestedKey = String(value.key || "").trim().toUpperCase();
    const key = requestedKey || uniqueProjectKey(input.title, usedKeys);
    if (!PROJECT_KEY.test(key)) throw new HttpError(400, "Project key must contain 2–8 uppercase letters or numbers and begin with a letter.");
    if (usedKeys.has(key)) throw new HttpError(400, `Project key ${key} is already in use.`);
    projects.push({
      id: `project-${randomHex(12)}`,
      key,
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.status === "completed" ? { completedAt: timestamp } : {}),
    });
    status = "created";
  } else if (mode === "updateProject") {
    const id = String(value.id || "");
    const index = projects.findIndex((project) => project.id === id && !project.archivedAt);
    if (index < 0) throw new HttpError(404, "Project was not found.");
    const input = projectInput(value);
    if (sameProject(projects[index]!, input)) {
      return { ...publicData(current.state), status: "unchanged" };
    }
    const original = projects[index]!;
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
    const project = projects.find((candidate) => candidate.id === input.projectId && !candidate.archivedAt);
    if (!project) throw new HttpError(400, "Task project is unavailable.");
    const task: TaskItem = {
      id: `task-${randomHex(12)}`,
      code: nextTaskCode(project.key, timestamp, tasks),
      ...input,
      position: nextPosition(tasks.filter((candidate) => candidate.projectId === input.projectId)),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    tasks.push(task);
    status = "created";
  } else if (mode === "updateTask") {
    const id = String(value.id || "");
    const index = tasks.findIndex((task) => task.id === id && !task.archivedAt);
    if (index < 0) throw new HttpError(404, "Task was not found.");
    const original = tasks[index]!;
    const input = taskInput(value);
    const project = projects.find((candidate) => candidate.id === input.projectId && !candidate.archivedAt);
    if (!project) throw new HttpError(400, "Task project is unavailable.");
    if (sameTask(original, input)) {
      return { ...publicData(current.state), status: "unchanged" };
    }
    const updated: TaskItem = {
      ...original,
      ...input,
      updatedAt: timestamp,
    };
    tasks[index] = updated;
  } else if (mode === "completeTask") {
    const task = tasks.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt);
    if (!task) throw new HttpError(404, "Task was not found.");
    if (task.completedAt) return { ...publicData(current.state), status: "unchanged" };
    const project = projects.find((candidate) => candidate.id === task.projectId)!;
    task.completedAt = timestamp;
    task.updatedAt = timestamp;
    const todayEntry = taskDays.find((taskDay) => taskDay.taskId === task.id && taskDay.date === today);
    if (todayEntry?.state === "planned") {
      todayEntry.state = "completed";
      todayEntry.reviewedAt = timestamp;
      todayEntry.updatedAt = timestamp;
    }
    if (!contributions.some((contribution) => contribution.taskId === task.id)) {
      contributions.push(contributionSnapshot(task, project, timestamp));
    }
    status = "completed";
  } else if (mode === "reopenTask") {
    const task = tasks.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt);
    if (!task) throw new HttpError(404, "Task was not found.");
    if (!task.completedAt) return { ...publicData(current.state), status: "unchanged" };
    task.completedAt = undefined;
    task.updatedAt = timestamp;
    status = "reopened";
  } else if (mode === "archiveTask") {
    const task = tasks.find((candidate) => candidate.id === String(value.id || ""));
    if (!task || task.archivedAt) throw new HttpError(404, "Task was not found.");
    task.archivedAt = timestamp;
    task.updatedAt = timestamp;
    status = "archived";
  } else if (mode === "createTaskDay") {
    if (taskDays.length >= MAX_TASK_DAYS) throw new HttpError(400, "The Task Day limit has been reached.");
    const taskId = String(value.taskId || "");
    const task = tasks.find((candidate) => candidate.id === taskId && !candidate.archivedAt && !candidate.completedAt);
    const project = task && projects.find((candidate) => candidate.id === task.projectId && !candidate.archivedAt);
    if (!task || !project || project.status !== "active") throw new HttpError(400, "Task is unavailable for Today.");
    if (taskDays.some((taskDay) => taskDay.taskId === taskId && taskDay.date === today)) {
      throw new HttpError(409, "Task is already in Today.");
    }
    taskDays.push({
      id: `taskday-${randomHex(12)}`,
      taskId,
      date: today,
      plan: requiredString(value.plan, "Today plan", 600),
      outcome: "",
      state: "planned",
      position: nextPosition(taskDays.filter((taskDay) => taskDay.date === today)),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    status = "created";
  } else if (mode === "updateTaskDay") {
    const taskDay = taskDays.find((candidate) => candidate.id === String(value.id || ""));
    if (!taskDay) throw new HttpError(404, "Task Day was not found.");
    const state = String(value.state || "") as TaskDay["state"];
    if (!TASK_DAY_STATES.has(state)) throw new HttpError(400, "Task Day state is invalid.");
    const plan = requiredString(value.plan, "Today plan", 600);
    const outcome = requiredString(value.outcome ?? "", "Task Day outcome", 2000, true);
    if (state === "partial" && !outcome) throw new HttpError(400, "Partial work needs a short outcome.");
    const continueToday = value.continueToday === true;
    if (taskDay.plan === plan && taskDay.outcome === outcome && taskDay.state === state && !continueToday) {
      return { ...publicData(current.state), status: "unchanged" };
    }
    taskDay.plan = plan;
    taskDay.outcome = outcome;
    taskDay.state = state;
    taskDay.updatedAt = timestamp;
    taskDay.reviewedAt = state === "planned" ? undefined : timestamp;
    if (continueToday) {
      if (taskDay.date >= today || state === "planned") {
        throw new HttpError(400, "Only a reviewed previous Task Day can continue today.");
      }
      const task = tasks.find((candidate) => candidate.id === taskDay.taskId && !candidate.archivedAt && !candidate.completedAt);
      if (!task) throw new HttpError(400, "Task is unavailable for Today.");
      if (!taskDays.some((candidate) => candidate.taskId === task.id && candidate.date === today)) {
        taskDays.push({
          id: `taskday-${randomHex(12)}`,
          taskId: task.id,
          date: today,
          plan: requiredString(value.nextPlan ?? plan, "Today plan", 600),
          outcome: "",
          state: "planned",
          position: nextPosition(taskDays.filter((candidate) => candidate.date === today)),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  } else if (mode === "removeTaskDay") {
    const index = taskDays.findIndex((candidate) => candidate.id === String(value.id || ""));
    const taskDay = taskDays[index];
    if (!taskDay) throw new HttpError(404, "Task Day was not found.");
    if (taskDay.date !== today || taskDay.state !== "planned" || taskDay.outcome) {
      throw new HttpError(400, "Only an untouched Today plan can be removed.");
    }
    taskDays.splice(index, 1);
    status = "removed";
  } else {
    if (!Array.isArray(value.ids) || value.ids.some((id) => typeof id !== "string")) {
      throw new HttpError(400, "Today order is invalid.");
    }
    const todayDays = taskDays.filter((taskDay) => taskDay.date === today).sort((left, right) => left.position - right.position);
    const ids = value.ids as string[];
    if (ids.length !== todayDays.length || new Set(ids).size !== ids.length
      || ids.some((id) => !todayDays.some((taskDay) => taskDay.id === id))) {
      throw new HttpError(400, "Today order is invalid.");
    }
    if (ids.every((id, index) => todayDays[index]?.id === id)) {
      return { ...publicData(current.state), status: "unchanged" };
    }
    const order = new Map(ids.map((id, index) => [id, index]));
    taskDays = taskDays.map((taskDay) => taskDay.date === today
      ? { ...taskDay, position: order.get(taskDay.id)!, updatedAt: timestamp }
      : taskDay);
    status = "reordered";
  }

  const next: TaskState = {
    schemaVersion: 4,
    revision: randomHex(16),
    updatedAt: timestamp,
    projects,
    tasks,
    taskDays,
    contributions: contributions.sort((left, right) => left.completedAt.localeCompare(right.completedAt)
      || left.taskId.localeCompare(right.taskId)),
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
  const etag = `"v4-${data.revision}-${data.today}"`;
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
