import { getTaskStateVersioned, putTaskStateConditional } from "./storage";
import type {
  Env,
  JournalRelatedTask,
  TaskContribution,
  TaskItem,
  TaskProject,
  TaskSession,
  TaskState,
} from "./types";
import { asRecord, HttpError, randomHex, requiredString, singaporeTimestamp } from "./utils";

const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PROJECT_ID = /^project-[a-f0-9]{24}$/;
const TASK_ID = /^task-[a-f0-9]{24}$/;
const SESSION_ID = /^session-[a-f0-9]{24}$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,7}$/;
const TASK_CODE = /^([A-Z][A-Z0-9]{1,7})-(\d{4})-(\d{4})$/;
const REVISION = /^(?:0|[a-f0-9]{32})$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const SESSION_STATES = new Set<TaskSession["state"]>(["scheduled", "done", "partial", "no_progress"]);
const MAX_PROJECTS = 100;
const MAX_TASKS = 2000;
const MAX_SESSIONS = 20_000;

type TaskMode =
  | "createProject"
  | "updateProject"
  | "archiveProject"
  | "createTask"
  | "updateTask"
  | "completeTask"
  | "reopenTask"
  | "archiveTask"
  | "createSession"
  | "updateSession"
  | "removeSession";

export interface VersionedTaskState {
  state: TaskState;
  etag: string | null;
}

export interface PublicTaskData extends TaskState {
  today: string;
}

export function emptyTaskState(): TaskState {
  return {
    schemaVersion: 5,
    revision: "0",
    updatedAt: "1970-01-01T00:00:00.000Z",
    projects: [],
    tasks: [],
    sessions: [],
    contributions: [],
  };
}

export function todayInSingapore(date = new Date()): string {
  return singaporeTimestamp(date).slice(0, 10);
}

function parseDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !DATE.test(value)) throw new HttpError(400, `${label} is invalid.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return value;
}

function storedTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new HttpError(500, `${label} is invalid.`);
  }
  return value;
}

function storedPosition(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > MAX_TASKS) {
    throw new HttpError(500, `${label} is invalid.`);
  }
  return Number(value);
}

function sessionMinute(value: unknown, label: string, allowEnd = false): number {
  const maximum = allowEnd ? 1440 : 1439;
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return Number(value);
}

function singaporeYear(value: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function projectKeyBase(title: string): string | null {
  const words = title.normalize("NFKD").match(/[A-Za-z0-9]+/g) || [];
  if (!words.length) return null;
  let base = words.length > 1 ? words.map((word) => word[0]).join("") : words[0]!.slice(0, 4);
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
  const prefix = `${projectKey}-${singaporeYear(createdAt)}-`;
  const sequence = tasks.reduce((maximum, task) => task.code.startsWith(prefix)
    ? Math.max(maximum, Number(task.code.slice(prefix.length)) || 0)
    : maximum, 0) + 1;
  if (sequence > 9999) throw new HttpError(400, `Project ${projectKey} has no Task numbers left this year.`);
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

function assertOnlyKeys(record: Record<string, unknown>, keys: string[], message: string): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new HttpError(400, message);
}

function storedProject(value: unknown): TaskProject {
  const record = asRecord(value, "Stored Task data contains an invalid Project.");
  assertOnlyKeys(record, ["id", "key", "title", "description", "color", "status", "createdAt", "updatedAt", "completedAt", "archivedAt"], "Stored Task data contains an invalid Project.");
  if (!PROJECT_ID.test(String(record.id || "")) || !PROJECT_KEY.test(String(record.key || ""))
    || !COLOR.test(String(record.color || "")) || !["active", "paused", "completed"].includes(String(record.status || ""))) {
    throw new HttpError(500, "Stored Task data contains an invalid Project.");
  }
  const project: TaskProject = {
    id: String(record.id),
    key: String(record.key),
    title: requiredString(record.title, "Stored Project title", 120),
    description: requiredString(record.description ?? "", "Stored Project description", 600, true),
    color: String(record.color).toLowerCase(),
    status: record.status as TaskProject["status"],
    createdAt: storedTimestamp(record.createdAt, "Stored Project creation time"),
    updatedAt: storedTimestamp(record.updatedAt, "Stored Project update time"),
  };
  if (record.completedAt !== undefined) project.completedAt = storedTimestamp(record.completedAt, "Stored Project completion time");
  if (record.archivedAt !== undefined) project.archivedAt = storedTimestamp(record.archivedAt, "Stored Project archive time");
  return project;
}

function storedTask(value: unknown): TaskItem {
  const record = asRecord(value, "Stored Task data contains an invalid Task.");
  assertOnlyKeys(record, ["id", "code", "projectId", "title", "objective", "position", "createdAt", "updatedAt", "completedAt", "archivedAt"], "Stored Task data contains an invalid Task.");
  if (!TASK_ID.test(String(record.id || "")) || !TASK_CODE.test(String(record.code || ""))
    || !PROJECT_ID.test(String(record.projectId || ""))) {
    throw new HttpError(500, "Stored Task data contains an invalid Task.");
  }
  const task: TaskItem = {
    id: String(record.id),
    code: String(record.code),
    projectId: String(record.projectId),
    title: requiredString(record.title, "Stored Task title", 160),
    objective: requiredString(record.objective ?? "", "Stored Task objective", 1200, true),
    position: storedPosition(record.position, "Stored Task position"),
    createdAt: storedTimestamp(record.createdAt, "Stored Task creation time"),
    updatedAt: storedTimestamp(record.updatedAt, "Stored Task update time"),
  };
  if (record.completedAt !== undefined) task.completedAt = storedTimestamp(record.completedAt, "Stored Task completion time");
  if (record.archivedAt !== undefined) task.archivedAt = storedTimestamp(record.archivedAt, "Stored Task archive time");
  return task;
}

function storedSession(value: unknown): TaskSession {
  const record = asRecord(value, "Stored Task data contains an invalid Session.");
  assertOnlyKeys(record, ["id", "taskId", "date", "startMinute", "endMinute", "plan", "outcome", "state", "createdAt", "updatedAt", "reviewedAt"], "Stored Task data contains an invalid Session.");
  if (!SESSION_ID.test(String(record.id || "")) || !TASK_ID.test(String(record.taskId || ""))
    || !SESSION_STATES.has(String(record.state || "") as TaskSession["state"])) {
    throw new HttpError(500, "Stored Task data contains an invalid Session.");
  }
  const startMinute = sessionMinute(record.startMinute, "Stored Session start");
  const endMinute = sessionMinute(record.endMinute, "Stored Session end", true);
  if (endMinute <= startMinute) throw new HttpError(500, "Stored Task data contains an invalid Session range.");
  const session: TaskSession = {
    id: String(record.id),
    taskId: String(record.taskId),
    date: parseDate(record.date, "Stored Session date"),
    startMinute,
    endMinute,
    plan: requiredString(record.plan, "Stored Session plan", 600),
    outcome: requiredString(record.outcome ?? "", "Stored Session outcome", 2000, true),
    state: record.state as TaskSession["state"],
    createdAt: storedTimestamp(record.createdAt, "Stored Session creation time"),
    updatedAt: storedTimestamp(record.updatedAt, "Stored Session update time"),
  };
  if (record.reviewedAt !== undefined) session.reviewedAt = storedTimestamp(record.reviewedAt, "Stored Session review time");
  return session;
}

function storedContribution(value: unknown): TaskContribution {
  const record = asRecord(value, "Stored Task data contains an invalid Contribution.");
  assertOnlyKeys(record, ["taskId", "taskCode", "taskTitle", "projectId", "projectKey", "projectTitle", "projectColor", "completedAt"], "Stored Task data contains an invalid Contribution.");
  if (!TASK_ID.test(String(record.taskId || "")) || !TASK_CODE.test(String(record.taskCode || ""))
    || !PROJECT_ID.test(String(record.projectId || "")) || !PROJECT_KEY.test(String(record.projectKey || ""))
    || !COLOR.test(String(record.projectColor || ""))) {
    throw new HttpError(500, "Stored Task data contains an invalid Contribution.");
  }
  return {
    taskId: String(record.taskId),
    taskCode: String(record.taskCode),
    taskTitle: requiredString(record.taskTitle, "Stored Contribution Task title", 160),
    projectId: String(record.projectId),
    projectKey: String(record.projectKey),
    projectTitle: requiredString(record.projectTitle, "Stored Contribution Project title", 120),
    projectColor: String(record.projectColor).toLowerCase(),
    completedAt: storedTimestamp(record.completedAt, "Stored Contribution completion time"),
  };
}

export function parseTaskState(value: unknown): TaskState {
  const record = asRecord(value, "Stored Task data is invalid.");
  assertOnlyKeys(record, ["schemaVersion", "revision", "updatedAt", "projects", "tasks", "sessions", "contributions"], "Stored Task data is invalid.");
  if (record.schemaVersion !== 5 || !REVISION.test(String(record.revision || ""))
    || !Array.isArray(record.projects) || record.projects.length > MAX_PROJECTS
    || !Array.isArray(record.tasks) || record.tasks.length > MAX_TASKS
    || !Array.isArray(record.sessions) || record.sessions.length > MAX_SESSIONS
    || !Array.isArray(record.contributions) || record.contributions.length > MAX_TASKS) {
    throw new HttpError(500, "Stored Task data is not the current Session model.");
  }
  const projects = record.projects.map(storedProject);
  const tasks = record.tasks.map(storedTask);
  const sessions = record.sessions.map(storedSession);
  const contributions = record.contributions.map(storedContribution);
  const projectIds = new Set(projects.map((project) => project.id));
  const projectKeys = new Set(projects.map((project) => project.key));
  const taskIds = new Set(tasks.map((task) => task.id));
  const taskCodes = new Set(tasks.map((task) => task.code));
  const sessionIds = new Set(sessions.map((session) => session.id));
  if (projectIds.size !== projects.length || projectKeys.size !== projects.length
    || taskIds.size !== tasks.length || taskCodes.size !== tasks.length || sessionIds.size !== sessions.length
    || tasks.some((task) => !projectIds.has(task.projectId))
    || sessions.some((session) => !taskIds.has(session.taskId))
    || contributions.some((contribution) => !taskIds.has(contribution.taskId) || !projectIds.has(contribution.projectId))
    || new Set(contributions.map((contribution) => contribution.taskId)).size !== contributions.length) {
    throw new HttpError(500, "Stored Task relationships are invalid.");
  }
  return {
    schemaVersion: 5,
    revision: String(record.revision),
    updatedAt: storedTimestamp(record.updatedAt, "Stored Task update time"),
    projects,
    tasks,
    sessions,
    contributions,
  };
}

export async function loadTaskStateVersioned(env: Env): Promise<VersionedTaskState> {
  const stored = await getTaskStateVersioned(env);
  return stored ? { state: parseTaskState(stored.state), etag: stored.etag } : { state: emptyTaskState(), etag: null };
}

export function publicTaskData(state: TaskState): PublicTaskData {
  return { ...state, today: todayInSingapore() };
}

export async function saveSyncedTaskState(env: Env, state: TaskState, etag: string | null): Promise<boolean> {
  return putTaskStateConditional(env, state, etag);
}

export function sessionsOverlap(candidate: Pick<TaskSession, "id" | "date" | "startMinute" | "endMinute">, sessions: TaskSession[]): boolean {
  return sessions.some((session) => session.id !== candidate.id && session.date === candidate.date
    && candidate.startMinute < session.endMinute && candidate.endMinute > session.startMinute);
}

function nextPosition(tasks: TaskItem[], projectId: string): number {
  return tasks.filter((task) => task.projectId === projectId).reduce((maximum, task) => Math.max(maximum, task.position), -1) + 1;
}

function projectInput(value: unknown): Record<string, unknown> {
  return asRecord(value, "Project data is invalid.");
}

function taskInput(value: unknown): Record<string, unknown> {
  return asRecord(value, "Task data is invalid.");
}

function sessionInput(value: unknown): Record<string, unknown> {
  return asRecord(value, "Session data is invalid.");
}

function activeTask(id: string, tasks: TaskItem[], projects: TaskProject[]): { task: TaskItem; project: TaskProject } {
  const task = tasks.find((candidate) => candidate.id === id && !candidate.archivedAt && !candidate.completedAt);
  const project = task && projects.find((candidate) => candidate.id === task.projectId && !candidate.archivedAt && candidate.status === "active");
  if (!task || !project) throw new HttpError(400, "Task is not available for scheduling.");
  return { task, project };
}

export async function saveTasks(env: Env, payload: Record<string, unknown>): Promise<PublicTaskData & { status: string }> {
  assertOnlyKeys(payload, ["mode", "baseRevision", "project", "task", "session"], "Task request is invalid.");
  const mode = String(payload.mode || "") as TaskMode;
  const modes = new Set<TaskMode>(["createProject", "updateProject", "archiveProject", "createTask", "updateTask", "completeTask", "reopenTask", "archiveTask", "createSession", "updateSession", "removeSession"]);
  if (!modes.has(mode)) throw new HttpError(400, "Task action is invalid.");
  if (!REVISION.test(String(payload.baseRevision || ""))) throw new HttpError(400, "Task revision is invalid.");
  const current = await loadTaskStateVersioned(env);
  if (payload.baseRevision !== current.state.revision) throw new HttpError(409, "Tasks changed while editing. Reload and try again.");

  const projects = current.state.projects.map((project) => ({ ...project }));
  const tasks = current.state.tasks.map((task) => ({ ...task }));
  let sessions = current.state.sessions.map((session) => ({ ...session }));
  let contributions = current.state.contributions.map((contribution) => ({ ...contribution }));
  const timestamp = new Date().toISOString();
  let status = "saved";

  if (mode === "createProject") {
    if (projects.length >= MAX_PROJECTS) throw new HttpError(400, "The Project limit has been reached.");
    const value = projectInput(payload.project);
    assertOnlyKeys(value, ["key", "title", "description", "color", "status"], "Project data is invalid.");
    const title = requiredString(value.title, "Project title", 120);
    const requestedKey = typeof value.key === "string" ? value.key.trim().toUpperCase() : "";
    const key = requestedKey || uniqueProjectKey(title, new Set(projects.map((project) => project.key)));
    if (!PROJECT_KEY.test(key) || projects.some((project) => project.key === key)) throw new HttpError(400, "Project key is invalid or already used.");
    const color = String(value.color || "").toLowerCase();
    if (!COLOR.test(color)) throw new HttpError(400, "Project color is invalid.");
    const projectStatus = String(value.status || "active") as TaskProject["status"];
    if (!["active", "paused"].includes(projectStatus)) throw new HttpError(400, "New Project status is invalid.");
    projects.push({
      id: `project-${randomHex(12)}`,
      key,
      title,
      description: requiredString(value.description ?? "", "Project description", 600, true),
      color,
      status: projectStatus,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    status = "created";
  } else if (mode === "updateProject") {
    const value = projectInput(payload.project);
    assertOnlyKeys(value, ["id", "title", "description", "color", "status"], "Project data is invalid.");
    const project = projects.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt);
    if (!project) throw new HttpError(404, "Project was not found.");
    const projectStatus = String(value.status || "") as TaskProject["status"];
    if (!["active", "paused", "completed"].includes(projectStatus)) throw new HttpError(400, "Project status is invalid.");
    if (projectStatus === "completed" && tasks.some((task) => task.projectId === project.id && !task.archivedAt && !task.completedAt)) {
      throw new HttpError(400, "Complete or archive every open Task first.");
    }
    const color = String(value.color || "").toLowerCase();
    if (!COLOR.test(color)) throw new HttpError(400, "Project color is invalid.");
    project.title = requiredString(value.title, "Project title", 120);
    project.description = requiredString(value.description ?? "", "Project description", 600, true);
    project.color = color;
    project.status = projectStatus;
    project.completedAt = projectStatus === "completed" ? (project.completedAt || timestamp) : undefined;
    project.updatedAt = timestamp;
  } else if (mode === "archiveProject") {
    const value = projectInput(payload.project);
    assertOnlyKeys(value, ["id"], "Project data is invalid.");
    const project = projects.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt);
    if (!project) throw new HttpError(404, "Project was not found.");
    project.archivedAt = timestamp;
    project.updatedAt = timestamp;
    const affected = new Set(tasks.filter((task) => task.projectId === project.id && !task.archivedAt).map((task) => task.id));
    for (const task of tasks) if (affected.has(task.id)) { task.archivedAt = timestamp; task.updatedAt = timestamp; }
    sessions = sessions.filter((session) => !affected.has(session.taskId) || session.state !== "scheduled");
    status = "archived";
  } else if (mode === "createTask") {
    if (tasks.length >= MAX_TASKS) throw new HttpError(400, "The Task limit has been reached.");
    const value = taskInput(payload.task);
    assertOnlyKeys(value, ["projectId", "title", "objective"], "Task data is invalid.");
    const project = projects.find((candidate) => candidate.id === String(value.projectId || "") && !candidate.archivedAt && candidate.status === "active");
    if (!project) throw new HttpError(400, "Choose an active Project.");
    tasks.push({
      id: `task-${randomHex(12)}`,
      code: nextTaskCode(project.key, timestamp, tasks),
      projectId: project.id,
      title: requiredString(value.title, "Task title", 160),
      objective: requiredString(value.objective ?? "", "Task objective", 1200, true),
      position: nextPosition(tasks, project.id),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    status = "created";
  } else if (mode === "updateTask") {
    const value = taskInput(payload.task);
    assertOnlyKeys(value, ["id", "projectId", "title", "objective"], "Task data is invalid.");
    const task = tasks.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt);
    if (!task) throw new HttpError(404, "Task was not found.");
    const project = projects.find((candidate) => candidate.id === String(value.projectId || "") && !candidate.archivedAt && candidate.status === "active");
    if (!project) throw new HttpError(400, "Choose an active Project.");
    if (task.projectId !== project.id) {
      task.projectId = project.id;
      task.position = nextPosition(tasks, project.id);
    }
    task.title = requiredString(value.title, "Task title", 160);
    task.objective = requiredString(value.objective ?? "", "Task objective", 1200, true);
    task.updatedAt = timestamp;
  } else if (mode === "completeTask") {
    const value = taskInput(payload.task);
    assertOnlyKeys(value, ["id"], "Task data is invalid.");
    const { task, project } = activeTask(String(value.id || ""), tasks, projects);
    task.completedAt = timestamp;
    task.updatedAt = timestamp;
    sessions = sessions.filter((session) => session.taskId !== task.id || session.state !== "scheduled");
    contributions = contributions.filter((contribution) => contribution.taskId !== task.id);
    contributions.push({
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      projectId: project.id,
      projectKey: project.key,
      projectTitle: project.title,
      projectColor: project.color,
      completedAt: timestamp,
    });
    status = "completed";
  } else if (mode === "reopenTask") {
    const value = taskInput(payload.task);
    assertOnlyKeys(value, ["id"], "Task data is invalid.");
    const task = tasks.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt && candidate.completedAt);
    const project = task && projects.find((candidate) => candidate.id === task.projectId && !candidate.archivedAt && candidate.status === "active");
    if (!task || !project) throw new HttpError(400, "Task cannot be reopened in this Project.");
    task.completedAt = undefined;
    task.updatedAt = timestamp;
    contributions = contributions.filter((contribution) => contribution.taskId !== task.id);
    status = "reopened";
  } else if (mode === "archiveTask") {
    const value = taskInput(payload.task);
    assertOnlyKeys(value, ["id"], "Task data is invalid.");
    const task = tasks.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt);
    if (!task) throw new HttpError(404, "Task was not found.");
    task.archivedAt = timestamp;
    task.updatedAt = timestamp;
    sessions = sessions.filter((session) => session.taskId !== task.id || session.state !== "scheduled");
    status = "archived";
  } else if (mode === "createSession") {
    if (sessions.length >= MAX_SESSIONS) throw new HttpError(400, "The Session limit has been reached.");
    const value = sessionInput(payload.session);
    assertOnlyKeys(value, ["taskId", "date", "startMinute", "endMinute", "plan"], "Session data is invalid.");
    activeTask(String(value.taskId || ""), tasks, projects);
    const candidate: TaskSession = {
      id: `session-${randomHex(12)}`,
      taskId: String(value.taskId),
      date: parseDate(value.date, "Session date"),
      startMinute: sessionMinute(value.startMinute, "Session start"),
      endMinute: sessionMinute(value.endMinute, "Session end", true),
      plan: requiredString(value.plan, "Session plan", 600),
      outcome: "",
      state: "scheduled",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (candidate.endMinute <= candidate.startMinute) throw new HttpError(400, "Session end must be after its start.");
    if (sessionsOverlap(candidate, sessions)) throw new HttpError(409, "This Session overlaps another calendar block.");
    sessions.push(candidate);
    status = "created";
  } else if (mode === "updateSession") {
    const value = sessionInput(payload.session);
    assertOnlyKeys(value, ["id", "date", "startMinute", "endMinute", "plan", "outcome", "state"], "Session data is invalid.");
    const session = sessions.find((candidate) => candidate.id === String(value.id || ""));
    if (!session) throw new HttpError(404, "Session was not found.");
    const state = String(value.state || "") as TaskSession["state"];
    if (!SESSION_STATES.has(state)) throw new HttpError(400, "Session state is invalid.");
    const candidate = {
      id: session.id,
      date: parseDate(value.date, "Session date"),
      startMinute: sessionMinute(value.startMinute, "Session start"),
      endMinute: sessionMinute(value.endMinute, "Session end", true),
    };
    if (candidate.endMinute <= candidate.startMinute) throw new HttpError(400, "Session end must be after its start.");
    if (sessionsOverlap(candidate, sessions)) throw new HttpError(409, "This Session overlaps another calendar block.");
    const outcome = requiredString(value.outcome ?? "", "Session outcome", 2000, true);
    if ((state === "partial" || state === "no_progress") && !outcome) throw new HttpError(400, "This review needs a short outcome.");
    session.date = candidate.date;
    session.startMinute = candidate.startMinute;
    session.endMinute = candidate.endMinute;
    session.plan = requiredString(value.plan, "Session plan", 600);
    session.outcome = outcome;
    session.state = state;
    session.updatedAt = timestamp;
    session.reviewedAt = state === "scheduled" ? undefined : timestamp;
  } else {
    const value = sessionInput(payload.session);
    assertOnlyKeys(value, ["id"], "Session data is invalid.");
    const index = sessions.findIndex((candidate) => candidate.id === String(value.id || ""));
    if (index < 0) throw new HttpError(404, "Session was not found.");
    if (sessions[index]!.state !== "scheduled") throw new HttpError(400, "Reviewed Sessions are permanent work history.");
    sessions.splice(index, 1);
    status = "removed";
  }

  const next: TaskState = {
    schemaVersion: 5,
    revision: randomHex(16),
    updatedAt: timestamp,
    projects,
    tasks,
    sessions: sessions.sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.id.localeCompare(right.id)),
    contributions: contributions.sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.taskId.localeCompare(right.taskId)),
  };
  if (!await putTaskStateConditional(env, next, current.etag)) throw new HttpError(409, "Tasks changed while saving. Reload and try again.");
  return { ...publicTaskData(next), status };
}

function relatedTaskSnapshotFromState(state: TaskState, id: string): JournalRelatedTask | null {
  const task = state.tasks.find((candidate) => candidate.id === id);
  const project = task && state.projects.find((candidate) => candidate.id === task.projectId);
  return task && project ? {
    id: task.id,
    code: task.code,
    title: task.title,
    project: { id: project.id, key: project.key, title: project.title, color: project.color },
  } : null;
}

export async function relatedTaskSnapshot(env: Env, id: string): Promise<JournalRelatedTask | null> {
  return relatedTaskSnapshotFromState((await loadTaskStateVersioned(env)).state, id);
}

export async function tasksResponse(env: Env, request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Published Tasks are read-only.");
  const data = publicTaskData((await loadTaskStateVersioned(env)).state);
  const etag = `"v5-${data.revision}-${data.today}"`;
  const requestEtags = (request.headers.get("if-none-match") || "").split(",").map((value) => value.trim().replace(/^W\//, ""));
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate", ETag: etag };
  if (requestEtags.includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : JSON.stringify(data), { headers });
}
