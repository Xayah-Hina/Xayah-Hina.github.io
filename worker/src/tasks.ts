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
const MAX_LEGACY_ACTIVITY_DAYS = 730;
const V4_ACCEPT = "application/vnd.xayah.tasks.v4+json";

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

type StoredSchemaVersion = 1 | 2 | 3 | 4;

interface VersionedTaskState {
  state: TaskState;
  etag: string | null;
  migrated: boolean;
}

interface StoredTaskResult {
  task: TaskItem;
  legacyStatus: "todo" | "in_progress" | "done" | null;
  legacyScheduledDate: string | null;
}

export interface PublicTaskData extends TaskState {
  today: string;
}

interface LegacyPublicTaskData {
  schemaVersion: 3;
  revision: string;
  updatedAt: string;
  projects: TaskProject[];
  tasks: Array<Omit<TaskItem, "objective" | "position"> & {
    status: "todo" | "in_progress" | "done";
    priority: "normal";
    scheduledDate: string | null;
  }>;
  contributions: TaskContribution[];
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

function storedProject(value: unknown, schemaVersion: StoredSchemaVersion): TaskProject {
  const record = asRecord(value, "Stored Task data contains an invalid project.");
  if (!PROJECT_ID.test(String(record.id || ""))
    || !["active", "paused", "completed"].includes(String(record.status || ""))
    || !COLOR.test(String(record.color || ""))
    || (schemaVersion >= 2 && !PROJECT_KEY.test(String(record.key || "")))) {
    throw new HttpError(500, "Stored Task data contains an invalid project.");
  }
  const project: TaskProject = {
    id: String(record.id),
    key: schemaVersion >= 2 ? String(record.key) : "",
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

function storedTask(value: unknown, schemaVersion: StoredSchemaVersion, position: number): StoredTaskResult {
  const record = asRecord(value, "Stored Task data contains an invalid task.");
  const legacyStatus = schemaVersion < 4 ? String(record.status || "") : null;
  if (!TASK_ID.test(String(record.id || "")) || !PROJECT_ID.test(String(record.projectId || ""))
    || (schemaVersion >= 2 && !TASK_CODE.test(String(record.code || "")))
    || (schemaVersion < 4 && !["todo", "in_progress", "done"].includes(legacyStatus!))
    || (schemaVersion < 4 && !["normal", "high"].includes(String(record.priority || "")))) {
    throw new HttpError(500, "Stored Task data contains an invalid task.");
  }
  const task: TaskItem = {
    id: String(record.id),
    code: schemaVersion >= 2 ? String(record.code) : "",
    projectId: String(record.projectId),
    title: requiredString(record.title, "Stored task title", 180),
    objective: schemaVersion >= 4
      ? requiredString(record.objective ?? "", "Stored task objective", 2000, true)
      : "",
    position: schemaVersion >= 4
      ? parsePosition(record.position, "Stored task position", MAX_TASKS)
      : position,
    createdAt: parseTimestamp(record.createdAt, "Stored task createdAt"),
    updatedAt: parseTimestamp(record.updatedAt, "Stored task updatedAt"),
  };
  if (record.completedAt !== undefined) task.completedAt = parseTimestamp(record.completedAt, "Stored task completedAt");
  if (record.archivedAt !== undefined) task.archivedAt = parseTimestamp(record.archivedAt, "Stored task archivedAt");
  return {
    task,
    legacyStatus: legacyStatus as StoredTaskResult["legacyStatus"],
    legacyScheduledDate: schemaVersion < 4
      ? parseDate(record.scheduledDate, "Stored task scheduledDate", true)
      : null,
  };
}

function storedTaskDay(value: unknown): TaskDay {
  const record = asRecord(value, "Stored Task data contains an invalid Task Day.");
  if (!TASK_DAY_ID.test(String(record.id || "")) || !TASK_ID.test(String(record.taskId || ""))
    || !TASK_DAY_STATES.has(String(record.state || "") as TaskDay["state"])) {
    throw new HttpError(500, "Stored Task data contains an invalid Task Day.");
  }
  const taskDay: TaskDay = {
    id: String(record.id),
    taskId: String(record.taskId),
    date: parseDate(record.date, "Stored Task Day date")!,
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

function validateLegacyActivity(value: unknown): { date: string } {
  const record = asRecord(value, "Stored Task data contains an invalid activity day.");
  const date = parseDate(record.date, "Stored activity date");
  if (!Number.isInteger(record.updates) || Number(record.updates) < 0
    || !Number.isInteger(record.completions) || Number(record.completions) < 0) {
    throw new HttpError(500, "Stored Task data contains an invalid activity day.");
  }
  return { date: date! };
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

function migrateContributions(projects: TaskProject[], tasks: TaskItem[]): TaskContribution[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return tasks
    .filter((task) => task.completedAt)
    .sort((left, right) => left.completedAt!.localeCompare(right.completedAt!) || left.id.localeCompare(right.id))
    .map((task) => {
      const project = projectById.get(task.projectId);
      if (!project) throw new HttpError(500, "Stored Task data contains an orphaned task.");
      return contributionSnapshot(task, project, task.completedAt!);
    });
}

function storedContribution(value: unknown): TaskContribution {
  const record = asRecord(value, "Stored Task data contains an invalid contribution.");
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

function migrateTaskDays(
  record: Record<string, unknown>,
  schemaVersion: StoredSchemaVersion,
  storedTasks: StoredTaskResult[],
): TaskDay[] {
  if (schemaVersion === 4) return (record.taskDays as unknown[]).map(storedTaskDay);
  const today = todayInSingapore();
  let position = 0;
  return storedTasks.flatMap(({ task, legacyStatus, legacyScheduledDate }) => {
    if (legacyStatus === "done" || task.archivedAt || !legacyScheduledDate || legacyScheduledDate > today) return [];
    const timestamp = parseTimestamp(record.updatedAt, "Stored Task updatedAt");
    return [{
      id: `taskday-${task.id.slice(5)}`,
      taskId: task.id,
      date: today,
      plan: task.title,
      outcome: "",
      state: "planned" as const,
      position: position++,
      createdAt: timestamp,
      updatedAt: timestamp,
    }];
  });
}

function validateState(value: unknown): TaskState {
  const record = asRecord(value, "Stored Task data is invalid.");
  const schemaVersion = Number(record.schemaVersion) as StoredSchemaVersion;
  if (![1, 2, 3, 4].includes(schemaVersion) || !REVISION.test(String(record.revision || ""))
    || !Array.isArray(record.projects) || record.projects.length > MAX_PROJECTS
    || !Array.isArray(record.tasks) || record.tasks.length > MAX_TASKS
    || (schemaVersion < 3 && (!Array.isArray(record.activity) || record.activity.length > MAX_LEGACY_ACTIVITY_DAYS))
    || (schemaVersion >= 3 && (!Array.isArray(record.contributions) || record.contributions.length > MAX_TASKS))
    || (schemaVersion === 4 && (!Array.isArray(record.taskDays) || record.taskDays.length > MAX_TASK_DAYS))) {
    throw new HttpError(500, "Stored Task data is invalid.");
  }
  const projects = record.projects.map((project) => storedProject(project, schemaVersion));
  const positions = new Map<string, number>();
  const storedTasks = record.tasks.map((value) => {
    const raw = asRecord(value, "Stored Task data contains an invalid task.");
    const projectId = String(raw.projectId || "");
    const position = positions.get(projectId) || 0;
    positions.set(projectId, position + 1);
    return storedTask(value, schemaVersion, position);
  });
  const tasks = storedTasks.map(({ task }) => task);
  if (schemaVersion === 1) migrateIdentifiers(projects, tasks);
  const legacyActivity = schemaVersion < 3
    ? (record.activity as unknown[]).map(validateLegacyActivity)
    : [];
  const taskDays = migrateTaskDays(record, schemaVersion, storedTasks);
  const contributions = (schemaVersion >= 3
    ? (record.contributions as unknown[]).map(storedContribution)
    : migrateContributions(projects, tasks))
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.taskId.localeCompare(right.taskId));
  if (new Set(projects.map((project) => project.id)).size !== projects.length
    || new Set(tasks.map((task) => task.id)).size !== tasks.length
    || new Set(taskDays.map((taskDay) => taskDay.id)).size !== taskDays.length
    || new Set(projects.map((project) => project.key)).size !== projects.length
    || new Set(tasks.map((task) => task.code)).size !== tasks.length
    || new Set(taskDays.map((taskDay) => `${taskDay.taskId}:${taskDay.date}`)).size !== taskDays.length
    || new Set(legacyActivity.map((day) => day.date)).size !== legacyActivity.length
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
  if (!current) return { state: emptyState(), etag: null, migrated: false };
  const record = asRecord(current.state, "Stored Task data is invalid.");
  return {
    state: validateState(record),
    etag: current.etag,
    migrated: Number(record.schemaVersion) !== 4,
  };
}

async function publicVersionedState(env: Env): Promise<VersionedTaskState> {
  const current = await versionedState(env);
  if (!current.migrated) return current;
  const migrated: TaskState = {
    ...current.state,
    revision: randomHex(16),
    updatedAt: singaporeTimestamp(),
  };
  if (await putTaskStateConditional(env, migrated, current.etag)) {
    return { state: migrated, etag: null, migrated: false };
  }
  return versionedState(env);
}

function publicData(state: TaskState): PublicTaskData {
  return { ...state, today: todayInSingapore() };
}

function legacyPublicData(state: TaskState): LegacyPublicTaskData {
  const today = todayInSingapore();
  const daysByTask = new Map<string, TaskDay[]>();
  for (const taskDay of state.taskDays) {
    const days = daysByTask.get(taskDay.taskId) || [];
    days.push(taskDay);
    daysByTask.set(taskDay.taskId, days);
  }
  return {
    schemaVersion: 3,
    revision: state.revision,
    updatedAt: state.updatedAt,
    projects: state.projects,
    tasks: state.tasks.map((task) => {
      const taskDays = daysByTask.get(task.id) || [];
      const { objective: _objective, position: _position, ...legacyTask } = task;
      return {
        ...legacyTask,
        status: task.completedAt
          ? "done"
          : (taskDays.some((day) => day.state === "completed" || day.state === "partial") ? "in_progress" : "todo"),
        priority: "normal",
        scheduledDate: !task.completedAt && taskDays.some((day) => day.date === today) ? today : null,
      };
    }),
    contributions: state.contributions,
    today,
  };
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
  clientSchema: 3 | 4;
} {
  const mode = String(payload.mode || "") as TaskMode;
  const modes: TaskMode[] = [
    "createProject", "updateProject", "archiveProject", "createTask", "updateTask", "completeTask",
    "reopenTask", "archiveTask", "createTaskDay", "updateTaskDay", "removeTaskDay", "reorderTaskDays",
  ];
  if (!modes.includes(mode)) throw new HttpError(400, "Task operation is invalid.");
  const baseRevision = String(payload.baseRevision ?? "");
  if (!REVISION.test(baseRevision)) throw new HttpError(400, "Task revision is invalid.");
  const source = mode.endsWith("Project")
    ? payload.project
    : (mode.includes("TaskDay") || mode === "reorderTaskDays" ? payload.taskDay : payload.task);
  return {
    mode,
    baseRevision,
    value: asRecord(source, "Task operation data is invalid."),
    clientSchema: payload.clientSchema === 4 ? 4 : 3,
  };
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
  original: TaskItem | null = null,
): Pick<TaskItem, "projectId" | "title" | "objective"> {
  const projectId = String(value.projectId || original?.projectId || "");
  if (!PROJECT_ID.test(projectId)) throw new HttpError(400, "Task project is invalid.");
  return {
    projectId,
    title: requiredString(value.title, "Task title", 180),
    objective: value.objective === undefined && original
      ? original.objective
      : requiredString(value.objective ?? "", "Task objective", 2000, true),
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

function responseData(state: TaskState, clientSchema: 3 | 4): PublicTaskData | LegacyPublicTaskData {
  return clientSchema === 4 ? publicData(state) : legacyPublicData(state);
}

export async function saveTasks(
  env: Env,
  payload: Record<string, unknown>,
): Promise<(PublicTaskData | LegacyPublicTaskData) & { status: string }> {
  const { mode, baseRevision, value, clientSchema } = mutationPayload(payload);
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
      return { ...responseData(current.state, clientSchema), status: "unchanged" };
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
      ...(value.status === "done" ? { completedAt: timestamp } : {}),
    };
    tasks.push(task);
    if (task.completedAt) contributions.push(contributionSnapshot(task, project, timestamp));
    status = "created";
  } else if (mode === "updateTask") {
    const id = String(value.id || "");
    const index = tasks.findIndex((task) => task.id === id && !task.archivedAt);
    if (index < 0) throw new HttpError(404, "Task was not found.");
    const original = tasks[index]!;
    const input = taskInput(value, original);
    const project = projects.find((candidate) => candidate.id === input.projectId && !candidate.archivedAt);
    if (!project) throw new HttpError(400, "Task project is unavailable.");
    const legacyStatus = typeof value.status === "string" ? value.status : null;
    const completing = legacyStatus === "done" && !original.completedAt;
    const reopening = legacyStatus !== null && legacyStatus !== "done" && Boolean(original.completedAt);
    if (sameTask(original, input) && !completing && !reopening) {
      return { ...responseData(current.state, clientSchema), status: "unchanged" };
    }
    const updated: TaskItem = {
      ...original,
      ...input,
      updatedAt: timestamp,
      ...(completing ? { completedAt: timestamp } : {}),
      ...(reopening ? { completedAt: undefined } : {}),
    };
    tasks[index] = updated;
    if (completing && !contributions.some((contribution) => contribution.taskId === updated.id)) {
      contributions.push(contributionSnapshot(updated, project, timestamp));
    }
  } else if (mode === "completeTask") {
    const task = tasks.find((candidate) => candidate.id === String(value.id || "") && !candidate.archivedAt);
    if (!task) throw new HttpError(404, "Task was not found.");
    if (task.completedAt) return { ...responseData(current.state, clientSchema), status: "unchanged" };
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
    if (!task.completedAt) return { ...responseData(current.state, clientSchema), status: "unchanged" };
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
      return { ...responseData(current.state, clientSchema), status: "unchanged" };
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
      return { ...responseData(current.state, clientSchema), status: "unchanged" };
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
  return { ...responseData(next, clientSchema), status };
}

export async function tasksResponse(env: Env, request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "Published Tasks are read-only.");
  }
  const current = await publicVersionedState(env);
  const clientSchema = request.headers.get("accept")?.includes(V4_ACCEPT) ? 4 : 3;
  const data = responseData(current.state, clientSchema);
  const etag = `"v${data.schemaVersion}-${data.revision}-${data.today}"`;
  const requestEtags = (request.headers.get("if-none-match") || "")
    .split(",").map((value) => value.trim().replace(/^W\//, ""));
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: etag,
    Vary: "Accept",
  };
  if (requestEtags.includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : JSON.stringify(data), { headers });
}
