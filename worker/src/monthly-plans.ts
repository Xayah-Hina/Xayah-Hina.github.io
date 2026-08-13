import {
  getMonthlyPlanStateVersioned,
  putMonthlyPlanStateConditional,
} from "./storage";
import type {
  Env,
  MonthlyPlan,
  MonthlyPlanSchedule,
  MonthlyPlanState,
} from "./types";
import {
  asRecord,
  HttpError,
  randomHex,
  requiredString,
  singaporeTimestamp,
} from "./utils";

const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const PLAN_ID = /^plan-[a-f0-9]{24}$/;
const REVISION = /^[a-f0-9]{32}$/;
const MAX_PLANS = 200;
const MAX_PLAN_DAYS = 3660;
const EMPTY_REVISION = "0";

interface VersionedPlanState {
  state: MonthlyPlanState;
  etag: string | null;
}

interface ProjectedMonthlyPlan {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  schedule: MonthlyPlanSchedule;
  archivedAt?: string;
  scheduledDates: string[];
  completedDates: string[];
  completed: number;
  total: number;
  overallCompleted: number;
  overallTotal: number;
}

export interface MonthlyPlanMonthData {
  month: string;
  today: string;
  revision: string;
  updatedAt: string | null;
  plans: ProjectedMonthlyPlan[];
}

function emptyState(): MonthlyPlanState {
  return {
    schemaVersion: 1,
    revision: EMPTY_REVISION,
    updatedAt: "1970-01-01T00:00:00.000Z",
    plans: [],
  };
}

function timestampNow(): string {
  return singaporeTimestamp();
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

function parseMonth(value: unknown): string {
  if (typeof value !== "string" || !MONTH.test(value)) throw new HttpError(400, "Monthly Plan month is invalid.");
  return value;
}

function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return value;
}

function dateNumber(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function dateAfter(value: string, days: number): string {
  return new Date(dateNumber(value) + days * 86_400_000).toISOString().slice(0, 10);
}

function inclusiveDays(start: string, end: string): number {
  return Math.floor((dateNumber(end) - dateNumber(start)) / 86_400_000) + 1;
}

function isoWeekday(value: string): number {
  const sundayFirst = new Date(`${value}T00:00:00Z`).getUTCDay();
  return ((sundayFirst + 6) % 7) + 1;
}

function validateSchedule(value: unknown): MonthlyPlanSchedule {
  const record = asRecord(value, "Monthly Plan schedule is invalid.");
  if (record.type === "daily") return { type: "daily" };
  if (record.type !== "weekdays" || !Array.isArray(record.weekdays)) {
    throw new HttpError(400, "Monthly Plan schedule is invalid.");
  }
  const weekdays = [...new Set(record.weekdays.map(Number))].sort((left, right) => left - right);
  if (!weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new HttpError(400, "Monthly Plan weekdays are invalid.");
  }
  return { type: "weekdays", weekdays };
}

function isScheduled(plan: Pick<MonthlyPlan, "schedule">, date: string): boolean {
  return plan.schedule.type === "daily" || plan.schedule.weekdays.includes(isoWeekday(date));
}

function effectiveEndDate(plan: MonthlyPlan): string {
  if (!plan.archivedAt) return plan.endDate;
  const archivedDate = plan.archivedAt.slice(0, 10);
  return archivedDate < plan.endDate ? archivedDate : plan.endDate;
}

function validateStoredPlan(value: unknown): MonthlyPlan {
  const record = asRecord(value, "Stored Monthly Plan is invalid.");
  const id = requiredString(record.id, "Monthly Plan id", 64);
  if (!PLAN_ID.test(id)) throw new HttpError(500, `Stored Monthly Plan ${id} has an invalid id.`);
  const title = requiredString(record.title, "Monthly Plan title", 160);
  const startDate = parseDate(record.startDate, "Monthly Plan start date");
  const endDate = parseDate(record.endDate, "Monthly Plan end date");
  if (endDate < startDate || inclusiveDays(startDate, endDate) > MAX_PLAN_DAYS) {
    throw new HttpError(500, `Stored Monthly Plan ${id} has an invalid date range.`);
  }
  const schedule = validateSchedule(record.schedule);
  if (!Array.isArray(record.completedDates) || record.completedDates.length > MAX_PLAN_DAYS) {
    throw new HttpError(500, `Stored Monthly Plan ${id} has invalid check-ins.`);
  }
  const completedDates = [...new Set(record.completedDates.map((date) => parseDate(date, "Monthly Plan check-in date")))]
    .sort();
  if (completedDates.some((date) => date < startDate || date > endDate || !isScheduled({ schedule }, date))) {
    throw new HttpError(500, `Stored Monthly Plan ${id} contains a check-in outside its schedule.`);
  }
  const createdAt = parseTimestamp(record.createdAt, "Monthly Plan creation time");
  const updatedAt = parseTimestamp(record.updatedAt, "Monthly Plan update time");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new HttpError(500, `Stored Monthly Plan ${id} was updated before it was created.`);
  }
  const archivedAt = record.archivedAt === undefined
    ? undefined
    : parseTimestamp(record.archivedAt, "Monthly Plan archive time");
  if (archivedAt && Date.parse(archivedAt) < Date.parse(createdAt)) {
    throw new HttpError(500, `Stored Monthly Plan ${id} was archived before it was created.`);
  }
  if (archivedAt && completedDates.some((date) => date > archivedAt.slice(0, 10))) {
    throw new HttpError(500, `Stored Monthly Plan ${id} contains a check-in after it was archived.`);
  }
  return {
    id,
    title,
    startDate,
    endDate,
    schedule,
    completedDates,
    createdAt,
    updatedAt,
    ...(archivedAt ? { archivedAt } : {}),
  };
}

function validateStoredState(value: unknown): MonthlyPlanState {
  const record = asRecord(value, "Stored Monthly Plan state is invalid.");
  if (record.schemaVersion !== 1 || typeof record.revision !== "string" || !REVISION.test(record.revision)) {
    throw new HttpError(500, "Stored Monthly Plan state has an unsupported version.");
  }
  const updatedAt = parseTimestamp(record.updatedAt, "Monthly Plan state update time");
  if (!Array.isArray(record.plans) || record.plans.length > MAX_PLANS) {
    throw new HttpError(500, "Stored Monthly Plan state contains too many plans.");
  }
  const plans = record.plans.map(validateStoredPlan);
  if (new Set(plans.map((plan) => plan.id)).size !== plans.length) {
    throw new HttpError(500, "Stored Monthly Plan state contains duplicate ids.");
  }
  return { schemaVersion: 1, revision: record.revision, updatedAt, plans };
}

async function loadState(env: Env): Promise<VersionedPlanState> {
  const versioned = await getMonthlyPlanStateVersioned(env);
  if (!versioned) return { state: emptyState(), etag: null };
  try {
    return { state: validateStoredState(versioned.state), etag: versioned.etag };
  } catch (error) {
    if (error instanceof HttpError) throw new HttpError(500, `Stored Monthly Plan data is invalid: ${error.message}`);
    throw error;
  }
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, value] = month.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(endDay).padStart(2, "0")}` };
}

function scheduledDatesBetween(plan: MonthlyPlan, start: string, end: string): string[] {
  const first = plan.startDate > start ? plan.startDate : start;
  const effectiveEnd = effectiveEndDate(plan);
  const last = effectiveEnd < end ? effectiveEnd : end;
  if (last < first) return [];
  const dates: string[] = [];
  for (let date = first; date <= last; date = dateAfter(date, 1)) {
    if (isScheduled(plan, date)) dates.push(date);
  }
  return dates;
}

function projectState(state: MonthlyPlanState, month: string): MonthlyPlanMonthData {
  const bounds = monthBounds(month);
  const today = todayInSingapore();
  const plans = state.plans
    .map((plan): ProjectedMonthlyPlan | null => {
      const scheduledDates = scheduledDatesBetween(plan, bounds.start, bounds.end);
      const overlapsOriginalRange = plan.startDate <= bounds.end && plan.endDate >= bounds.start;
      if (!scheduledDates.length && !(plan.archivedAt && overlapsOriginalRange)) return null;
      const scheduled = new Set(scheduledDates);
      const completedDates = plan.completedDates.filter((date) => scheduled.has(date));
      const overallDates = scheduledDatesBetween(plan, plan.startDate, effectiveEndDate(plan));
      const overallScheduled = new Set(overallDates);
      return {
        id: plan.id,
        title: plan.title,
        startDate: plan.startDate,
        endDate: plan.endDate,
        schedule: plan.schedule,
        ...(plan.archivedAt ? { archivedAt: plan.archivedAt } : {}),
        scheduledDates,
        completedDates,
        completed: completedDates.length,
        total: scheduledDates.length,
        overallCompleted: plan.completedDates.filter((date) => overallScheduled.has(date)).length,
        overallTotal: overallDates.length,
      };
    })
    .filter((plan): plan is ProjectedMonthlyPlan => plan !== null)
    .sort((left, right) => {
      const archived = Number(Boolean(left.archivedAt)) - Number(Boolean(right.archivedAt));
      return archived || left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title);
    });
  return {
    month,
    today,
    revision: state.revision,
    updatedAt: state.revision === EMPTY_REVISION ? null : state.updatedAt,
    plans,
  };
}

function validateBaseRevision(value: unknown, current: string): void {
  if (typeof value !== "string" || value !== current) {
    throw new HttpError(409, "Monthly Plans changed in another tab. Reload them before saving.");
  }
}

function planInput(value: unknown): {
  id?: string;
  title: string;
  startDate: string;
  endDate: string;
  schedule: MonthlyPlanSchedule;
} {
  const record = asRecord(value, "Monthly Plan is invalid.");
  const id = record.id === undefined ? undefined : requiredString(record.id, "Monthly Plan id", 64);
  if (id && !PLAN_ID.test(id)) throw new HttpError(400, "Monthly Plan id is invalid.");
  const title = requiredString(record.title, "Monthly Plan title", 160);
  const startDate = parseDate(record.startDate, "Monthly Plan start date");
  const endDate = parseDate(record.endDate, "Monthly Plan end date");
  if (endDate < startDate) throw new HttpError(400, "Monthly Plan end date precedes its start date.");
  if (inclusiveDays(startDate, endDate) > MAX_PLAN_DAYS) {
    throw new HttpError(400, "Monthly Plans cannot span more than 3660 days.");
  }
  const schedule = validateSchedule(record.schedule);
  let hasScheduledDate = false;
  for (let date = startDate; date <= endDate && !hasScheduledDate; date = dateAfter(date, 1)) {
    hasScheduledDate = isScheduled({ schedule }, date);
  }
  if (!hasScheduledDate) throw new HttpError(400, "The Monthly Plan schedule has no dates in its range.");
  return { id, title, startDate, endDate, schedule };
}

async function persistState(
  env: Env,
  current: VersionedPlanState,
  plans: MonthlyPlan[],
  timestamp: string,
): Promise<MonthlyPlanState> {
  const next: MonthlyPlanState = {
    schemaVersion: 1,
    revision: randomHex(16),
    updatedAt: timestamp,
    plans,
  };
  if (!(await putMonthlyPlanStateConditional(env, next, current.etag))) {
    throw new HttpError(409, "Monthly Plans changed in another tab. Reload them before saving.");
  }
  return next;
}

export async function saveMonthlyPlan(env: Env, payload: Record<string, unknown>) {
  const month = parseMonth(payload.month);
  const mode = payload.mode;
  if (!["create", "edit", "archive", "restore"].includes(String(mode))) {
    throw new HttpError(400, "Monthly Plan save mode is invalid.");
  }
  const current = await loadState(env);
  validateBaseRevision(payload.baseRevision, current.state.revision);
  const timestamp = timestampNow();
  let plans = [...current.state.plans];
  let status: "created" | "updated" | "archived" | "restored";

  if (mode === "create") {
    if (plans.length >= MAX_PLANS) throw new HttpError(400, "Monthly Plans has reached its 200-plan limit.");
    const input = planInput(payload.plan);
    const plan: MonthlyPlan = {
      id: `plan-${randomHex(12)}`,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      schedule: input.schedule,
      completedDates: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    plans.push(plan);
    status = "created";
  } else {
    const record = asRecord(payload.plan, "Monthly Plan is invalid.");
    const id = requiredString(record.id, "Monthly Plan id", 64);
    if (!PLAN_ID.test(id)) throw new HttpError(400, "Monthly Plan id is invalid.");
    const index = plans.findIndex((plan) => plan.id === id);
    if (index < 0) throw new HttpError(404, "The Monthly Plan is no longer available.");
    const original = plans[index];
    if (mode === "archive") {
      if (original.archivedAt) throw new HttpError(409, "The Monthly Plan is already archived.");
      plans[index] = { ...original, archivedAt: timestamp, updatedAt: timestamp };
      status = "archived";
    } else if (mode === "restore") {
      if (!original.archivedAt) throw new HttpError(409, "The Monthly Plan is not archived.");
      const restored = { ...original, updatedAt: timestamp };
      delete restored.archivedAt;
      plans[index] = restored;
      status = "restored";
    } else {
      const input = planInput(payload.plan);
      const included = original.completedDates.filter((date) => (
        date >= input.startDate && date <= input.endDate && isScheduled({ schedule: input.schedule }, date)
      ));
      const excluded = original.completedDates.length - included.length;
      if (excluded && payload.discardExcludedCheckIns !== true) {
        throw new HttpError(409, `This change excludes ${excluded} existing check-in${excluded === 1 ? "" : "s"}. Confirm their removal before saving.`);
      }
      plans[index] = {
        ...original,
        title: input.title,
        startDate: input.startDate,
        endDate: input.endDate,
        schedule: input.schedule,
        completedDates: included,
        updatedAt: timestamp,
      };
      status = "updated";
    }
  }

  const next = await persistState(env, current, plans, timestamp);
  return { ...projectState(next, month), status };
}

export async function saveMonthlyPlanCheckIns(env: Env, payload: Record<string, unknown>) {
  const month = parseMonth(payload.month);
  if (!Array.isArray(payload.changes) || !payload.changes.length || payload.changes.length > 100) {
    throw new HttpError(400, "Monthly Plan check-in changes are invalid.");
  }
  const current = await loadState(env);
  validateBaseRevision(payload.baseRevision, current.state.revision);
  const today = todayInSingapore();
  const plans = current.state.plans.map((plan) => ({ ...plan, completedDates: [...plan.completedDates] }));
  const changes = new Set<string>();
  const changedPlans = new Set<string>();
  for (const raw of payload.changes) {
    const record = asRecord(raw, "Monthly Plan check-in change is invalid.");
    const planId = requiredString(record.planId, "Monthly Plan id", 64);
    const date = parseDate(record.date, "Monthly Plan check-in date");
    if (typeof record.completed !== "boolean") throw new HttpError(400, "Monthly Plan check-in state is invalid.");
    const key = `${planId}:${date}`;
    if (changes.has(key)) throw new HttpError(400, "Monthly Plan check-in changes contain a duplicate date.");
    changes.add(key);
    const plan = plans.find((candidate) => candidate.id === planId);
    if (!plan) throw new HttpError(404, "The Monthly Plan is no longer available.");
    if (date > today) throw new HttpError(400, "Future Monthly Plan dates cannot be completed.");
    if (date < plan.startDate || date > effectiveEndDate(plan) || !isScheduled(plan, date)) {
      throw new HttpError(400, "The Monthly Plan date is outside its active schedule.");
    }
    const completed = new Set(plan.completedDates);
    if (record.completed) completed.add(date);
    else completed.delete(date);
    const nextDates = [...completed].sort();
    if (nextDates.join("\n") !== plan.completedDates.join("\n")) {
      plan.completedDates = nextDates;
      changedPlans.add(plan.id);
    }
  }
  if (!changedPlans.size) return { ...projectState(current.state, month), status: "unchanged" as const };
  const timestamp = timestampNow();
  for (const plan of plans) if (changedPlans.has(plan.id)) plan.updatedAt = timestamp;
  const next = await persistState(env, current, plans, timestamp);
  return { ...projectState(next, month), status: "updated" as const };
}

export async function monthlyPlansResponse(env: Env, request: Request, monthValue: string): Promise<Response> {
  const month = parseMonth(monthValue);
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "Monthly Plan data is read-only.");
  }
  const current = await loadState(env);
  const data = projectState(current.state, month);
  // The public projection includes `today`, which changes at Singapore
  // midnight even when no plan is edited. Include it in the validator so a
  // browser cannot reuse yesterday's JSON via a stale 304 response.
  const etag = `"${data.revision}-${data.today}"`;
  const headers = new Headers({
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Content-Type": "application/json; charset=utf-8",
    "ETag": etag,
    "X-Content-Type-Options": "nosniff",
  });
  const validators = (request.headers.get("if-none-match") || "")
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""));
  if (validators.includes("*") || validators.includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : JSON.stringify(data), { headers });
}
