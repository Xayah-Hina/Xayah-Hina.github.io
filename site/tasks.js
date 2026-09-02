const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,7}$/;
const TASK_CODE = /^([A-Z][A-Z0-9]{1,7})-(\d{4})-(\d{4})$/;
const SESSION_STATES = new Set(["scheduled", "done", "partial", "no_progress"]);
const PROJECT_STATUSES = new Set(["active", "paused", "completed"]);
const PROJECT_COLORS = new Set(["#7c3aed", "#059669", "#ea580c", "#0284c7", "#e11d48", "#65a30d", "#c026d3", "#ca8a04"]);
const HOUR_HEIGHT = 46;
const SNAP_MINUTES = 15;
const SNAP_MS = SNAP_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SESSION_MS = SNAP_MS;
const MAX_SESSION_MS = DAY_MS;

function singaporeDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Singapore" }).formatToParts(new Date());
  const part = (type) => parts.find((candidate) => candidate.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function emptyData() {
  return { schemaVersion: 6, revision: "0", today: singaporeDate(), updatedAt: null, projects: [], tasks: [], sessions: [], contributions: [] };
}

function validTimestamp(value) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function validateData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 6
    || typeof value.revision !== "string" || !DATE.test(value.today || "")
    || !Array.isArray(value.projects) || !Array.isArray(value.tasks)
    || !Array.isArray(value.sessions) || !Array.isArray(value.contributions)) {
    throw new TypeError("Task data is not the current Session model.");
  }
  const projectIds = new Set();
  const projects = value.projects.map((project) => ({ ...project }));
  for (const project of projects) {
    if (!project || typeof project.id !== "string" || projectIds.has(project.id)
      || !PROJECT_KEY.test(project.key || "") || typeof project.title !== "string"
      || !PROJECT_COLORS.has(String(project.color || "").toLowerCase()) || !PROJECT_STATUSES.has(project.status)) {
      throw new TypeError("Task data contains an invalid Project.");
    }
    projectIds.add(project.id);
  }
  const taskIds = new Set();
  const tasks = value.tasks.map((task) => ({ ...task }));
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || taskIds.has(task.id) || !projectIds.has(task.projectId)
      || !TASK_CODE.test(task.code || "") || typeof task.title !== "string" || typeof task.objective !== "string"
      || !Number.isInteger(task.position) || task.position < 0) {
      throw new TypeError("Task data contains an invalid Task.");
    }
    taskIds.add(task.id);
  }
  const sessionIds = new Set();
  const sessions = value.sessions.map((session) => ({ ...session }));
  for (const session of sessions) {
    const duration = Date.parse(session?.endsAt) - Date.parse(session?.startsAt);
    if (!session || typeof session.id !== "string" || sessionIds.has(session.id) || !taskIds.has(session.taskId)
      || !validTimestamp(session.startsAt) || !validTimestamp(session.endsAt) || duration < MIN_SESSION_MS || duration > MAX_SESSION_MS
      || typeof session.plan !== "string" || !session.plan.trim() || typeof session.outcome !== "string"
      || !SESSION_STATES.has(session.state) || !validTimestamp(session.createdAt) || !validTimestamp(session.updatedAt)) {
      throw new TypeError("Task data contains an invalid Session.");
    }
    sessionIds.add(session.id);
  }
  const contributions = value.contributions.map((contribution) => ({ ...contribution }));
  for (const contribution of contributions) {
    if (!contribution || !taskIds.has(contribution.taskId) || !projectIds.has(contribution.projectId)
      || !TASK_CODE.test(contribution.taskCode || "") || !PROJECT_KEY.test(contribution.projectKey || "")
      || typeof contribution.taskTitle !== "string" || !validTimestamp(contribution.completedAt)) {
      throw new TypeError("Task data contains an invalid Contribution.");
    }
  }
  return { schemaVersion: 6, revision: value.revision, today: value.today, updatedAt: value.updatedAt || null, projects, tasks, sessions, contributions };
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label, action, className = "task-text-button") {
  const control = node("button", className, label);
  control.type = "button";
  control.dataset.taskAction = action;
  return control;
}

function dateShift(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function weekStart(value) {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return dateShift(value, -((day + 6) % 7));
}

export function weekDates(value) {
  const start = weekStart(value);
  return Array.from({ length: 7 }, (_, index) => dateShift(start, index));
}

export function weekRangeLabel(value) {
  const [start, end] = [weekStart(value), dateShift(weekStart(value), 6)];
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const month = (date) => new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
  if (startDate.getUTCFullYear() === endDate.getUTCFullYear() && startDate.getUTCMonth() === endDate.getUTCMonth()) {
    return `${month(startDate)} ${startDate.getUTCDate()}–${endDate.getUTCDate()}, ${endDate.getUTCFullYear()}`;
  }
  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${month(startDate)} ${startDate.getUTCDate()} – ${month(endDate)} ${endDate.getUTCDate()}, ${endDate.getUTCFullYear()}`;
  }
  return `${month(startDate)} ${startDate.getUTCDate()}, ${startDate.getUTCFullYear()} – ${month(endDate)} ${endDate.getUTCDate()}, ${endDate.getUTCFullYear()}`;
}

export function localDateTime(date, minute) {
  const day = minute >= 1440 ? dateShift(date, Math.floor(minute / 1440)) : date;
  const normalized = minute % 1440;
  return new Date(`${day}T${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}:00+08:00`).toISOString();
}

export function singaporeParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type) => parts.find((candidate) => candidate.type === type)?.value || "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, minute: Number(part("hour")) * 60 + Number(part("minute")) };
}

function sessionDuration(session) {
  return Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60000);
}

function dayBounds(date) {
  const start = Date.parse(localDateTime(date, 0));
  return { start, end: start + DAY_MS };
}

export function sessionFragment(session, date) {
  const bounds = dayBounds(date);
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  if (start >= bounds.end || end <= bounds.start) return null;
  return {
    date,
    startMinute: Math.round((Math.max(start, bounds.start) - bounds.start) / 60000),
    endMinute: Math.round((Math.min(end, bounds.end) - bounds.start) / 60000),
    continuesFromPrevious: start < bounds.start,
    continuesNext: end > bounds.end,
  };
}

function sessionOverlapsRange(session, startDate, endDate) {
  return Date.parse(session.startsAt) < Date.parse(localDateTime(endDate, 0))
    && Date.parse(session.endsAt) > Date.parse(localDateTime(startDate, 0));
}

export function roundedCurrentSlot(now = Date.now()) {
  const rounded = new Date(Math.ceil(now / SNAP_MS) * SNAP_MS).toISOString();
  return singaporeParts(rounded);
}

function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC", ...options }).format(new Date(`${value}T00:00:00Z`));
}

function formatMinute(value) {
  if (value === 1440) return "24:00";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function timeInputValue(value) {
  return value === 1440 ? "00:00" : formatMinute(value);
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function orderedProjects(projects) {
  return [...projects].sort((left, right) => Number(Boolean(left.archivedAt)) - Number(Boolean(right.archivedAt))
    || ["active", "paused", "completed"].indexOf(left.status) - ["active", "paused", "completed"].indexOf(right.status)
    || left.createdAt.localeCompare(right.createdAt));
}

function tasksForProject(data, projectId) {
  return data.tasks.filter((task) => task.projectId === projectId).sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
}

function availableTasks(data) {
  const activeProjects = new Set(data.projects.filter((project) => !project.archivedAt && project.status === "active").map((project) => project.id));
  return data.tasks.filter((task) => activeProjects.has(task.projectId) && !task.completedAt && !task.archivedAt);
}

function completionDays(data) {
  const days = new Map();
  for (const contribution of data.contributions) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(contribution.completedAt));
    const entries = days.get(date) || [];
    entries.push(contribution);
    days.set(date, entries);
  }
  return days;
}

function heatmap(data) {
  const section = node("section", "task-section task-activity");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy");
  copy.append(node("h2", "task-panel-title", "Task completions"), node("p", "task-panel-caption", "One completed Task makes one contribution."));
  header.append(copy, node("span", "task-panel-meta", `${data.contributions.length} total`));
  const viewport = node("div", "task-heatmap-viewport");
  const map = node("div", "task-heatmap");
  const weekdays = node("div", "task-heatmap-weekdays");
  weekdays.append(node("span", "", "Mon"), node("span", "", "Wed"), node("span", "", "Fri"));
  const weeks = node("div", "task-heatmap-weeks");
  const today = new Date(`${data.today}T00:00:00Z`);
  const end = dateShift(data.today, (6 - today.getUTCDay() + 7) % 7);
  const start = dateShift(end, -(53 * 7 - 1));
  const days = completionDays(data);
  for (let weekIndex = 0; weekIndex < 53; weekIndex += 1) {
    const week = node("div", "task-heatmap-week");
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = dateShift(start, weekIndex * 7 + dayIndex);
      const entries = days.get(date) || [];
      const cell = node(entries.length ? "button" : "span", "task-heatmap-cell");
      if (entries.length) {
        cell.type = "button";
        cell.dataset.taskAction = "show-contribution";
        cell.dataset.contributionDate = date;
        cell.setAttribute("aria-label", `${entries.length} Task${entries.length === 1 ? "" : "s"} completed on ${formatDate(date)}`);
      }
      cell.dataset.level = date > data.today ? "future" : String(Math.min(4, entries.length));
      week.append(cell);
    }
    weeks.append(week);
  }
  map.append(weekdays, weeks);
  viewport.append(map);
  const legend = node("div", "task-heatmap-legend");
  legend.append(document.createTextNode("Less"));
  for (let level = 0; level <= 4; level += 1) {
    const swatch = node("span", "task-heatmap-cell");
    swatch.dataset.level = String(level);
    legend.append(swatch);
  }
  legend.append(document.createTextNode("More"));
  section.append(header, viewport, legend);
  return section;
}

function sessionBlock(session, task, project, editable, fragment) {
  const block = node("article", "task-session-block");
  block.dataset.sessionId = session.id;
  block.dataset.fragmentDate = fragment.date;
  block.dataset.taskAction = "open-session";
  block.dataset.state = session.state;
  const duration = fragment.endMinute - fragment.startMinute;
  block.dataset.density = duration < 45 ? "compact" : (duration < 90 ? "regular" : "roomy");
  block.tabIndex = 0;
  block.setAttribute("role", "button");
  const start = singaporeParts(session.startsAt);
  const end = singaporeParts(session.endsAt);
  block.setAttribute("aria-label", `${formatDate(start.date)} ${formatMinute(start.minute)} to ${formatDate(end.date)} ${formatMinute(end.minute)}, ${task.title}`);
  block.style.setProperty("--session-top", `${fragment.startMinute / 60 * HOUR_HEIGHT}px`);
  block.style.setProperty("--session-height", `${Math.max(24, duration / 60 * HOUR_HEIGHT)}px`);
  block.style.setProperty("--project-color", project.color);
  const top = node("div", "task-session-heading");
  const time = fragment.continuesFromPrevious
    ? `→ ${formatMinute(fragment.endMinute)}`
    : (fragment.continuesNext ? `${formatMinute(fragment.startMinute)} →` : `${formatMinute(fragment.startMinute)}–${formatMinute(fragment.endMinute)}`);
  top.append(node("time", "task-session-time", time), node("span", "task-session-code", task.code));
  block.append(top, node("strong", "task-session-title", task.title), node("p", "task-session-plan", session.plan));
  if (session.state !== "scheduled") block.append(node("span", `task-session-state task-session-state-${session.state}`, session.state.replace("no_progress", "no progress")));
  if (editable && session.state === "scheduled") {
    block.dataset.draggable = "true";
    if (!fragment.continuesFromPrevious) {
      const handle = node("span", "task-session-resize task-session-resize-start");
      handle.dataset.sessionResize = "start";
      handle.setAttribute("aria-hidden", "true");
      block.append(handle);
    }
    if (!fragment.continuesNext) {
      const handle = node("span", "task-session-resize task-session-resize-end");
      handle.dataset.sessionResize = "end";
      handle.setAttribute("aria-hidden", "true");
      block.append(handle);
    }
  }
  return block;
}

function currentMinuteInSingapore() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type) => Number(parts.find((candidate) => candidate.type === type)?.value || 0);
  return part("hour") * 60 + part("minute");
}

function calendarSection(data, ui, selectedWeekStart, calendar) {
  const section = node("section", "task-section task-calendar-section");
  const header = node("header", "task-panel-header task-calendar-header");
  const copy = node("div", "task-section-heading");
  copy.append(node("h2", "task-panel-title task-week-range", weekRangeLabel(selectedWeekStart)));
  const tools = node("div", "task-panel-tools");
  const navigation = node("div", "task-week-navigation");
  const previous = button("‹", "previous-week", "task-icon-button task-date-button");
  previous.setAttribute("aria-label", "Previous week");
  const current = button("This week", "this-week", "task-text-button");
  const next = button("›", "next-week", "task-icon-button task-date-button");
  next.setAttribute("aria-label", "Next week");
  navigation.append(previous, current, next);
  tools.append(navigation);
  if (ui.enabled) {
    const calendarLabel = calendar?.syncing ? "Syncing…" : (calendar?.lastError ? "Calendar issue" : (calendar?.connected ? "Calendar synced" : (calendar?.configured === false ? "Calendar setup" : "Google Calendar")));
    const calendarButton = button(calendarLabel, "calendar-settings", "control-button task-section-action");
    if (calendar?.connected) calendarButton.dataset.connected = "true";
    if (calendar?.lastError) calendarButton.dataset.error = "true";
    tools.append(calendarButton);
    if (availableTasks(data).length) tools.append(button("Add Session", "new-session", "control-button control-button-primary task-section-action"));
  }
  header.append(copy, tools);
  const dates = weekDates(selectedWeekStart);
  const weekSessions = data.sessions.filter((session) => sessionOverlapsRange(session, dates[0], dateShift(dates[6], 1))).sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const tasks = new Map(data.tasks.map((task) => [task.id, task]));
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const scroll = node("div", "task-week-scroll");
  scroll.dataset.weekStart = selectedWeekStart;
  const layout = node("div", "task-week-layout");
  const corner = node("div", "task-week-corner");
  const days = node("div", "task-week-days");
  const weekdayFormatter = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
  for (const date of dates) {
    const day = node("div", "task-week-day-header");
    if (date === data.today) day.dataset.current = "true";
    const parsed = new Date(`${date}T00:00:00Z`);
    day.append(node("span", "task-week-weekday", weekdayFormatter.format(parsed)), node("span", "task-week-date", String(parsed.getUTCDate())));
    days.append(day);
  }
  const labels = node("div", "task-calendar-hours");
  for (let hour = 0; hour <= 24; hour += 1) {
    const label = node("time", "task-calendar-hour", `${String(hour).padStart(2, "0")}:00`);
    label.style.top = `${hour * HOUR_HEIGHT}px`;
    labels.append(label);
  }
  const grid = node("div", "task-week-grid");
  for (const date of dates) {
    const day = node("div", "task-week-day");
    day.dataset.calendarDate = date;
    day.dataset.taskAction = "quick-session";
    if (date === data.today) day.dataset.current = "true";
    for (const session of weekSessions) {
      const fragment = sessionFragment(session, date);
      if (!fragment) continue;
      const task = tasks.get(session.taskId);
      const project = task && projects.get(task.projectId);
      if (task && project) day.append(sessionBlock(session, task, project, ui.enabled && !task.completedAt && !task.archivedAt, fragment));
    }
    if (date === data.today) {
      const now = node("span", "task-calendar-now");
      now.style.top = `${currentMinuteInSingapore() / 60 * HOUR_HEIGHT}px`;
      day.append(now);
    }
    grid.append(day);
  }
  layout.append(corner, days, labels, grid);
  scroll.append(layout);
  section.append(header, scroll);
  return section;
}

function taskRow(task, project, data, ui, focusedCode) {
  const item = node("li", `task-row${task.completedAt ? " task-row-completed" : ""}`);
  item.dataset.taskId = task.id;
  if (task.code === focusedCode) { item.dataset.taskFocusTarget = "true"; item.classList.add("task-row-focused"); }
  const copy = node("div", "task-row-copy");
  const heading = node("div", "task-row-heading");
  heading.append(node("span", "task-row-code", task.code));
  const title = button(task.title, "open-task", "task-row-title");
  title.dataset.taskCode = task.code;
  heading.append(title);
  const sessions = data.sessions.filter((session) => session.taskId === task.id);
  const reviewed = sessions.filter((session) => session.state !== "scheduled");
  const minutes = reviewed.reduce((total, session) => total + sessionDuration(session), 0);
  const metaText = task.completedAt
    ? `Completed ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "Asia/Singapore" }).format(new Date(task.completedAt))}`
    : (sessions.length ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}${minutes ? ` · ${formatDuration(minutes)} logged` : ""}` : "No sessions yet");
  copy.append(heading, node("span", "task-row-meta", metaText));
  item.append(copy);
  if (ui.enabled && !task.completedAt && !task.archivedAt && !project.archivedAt && project.status === "active") {
    const schedule = button("Schedule", "schedule-task", "task-text-button");
    item.append(schedule);
  }
  return item;
}

function projectCard(project, data, ui, focusedCode) {
  const card = node("article", "task-project-card");
  card.dataset.projectId = project.id;
  card.style.setProperty("--project-color", project.color);
  const header = node("header", "task-project-head");
  const identity = node("div", "task-project-identity");
  const dot = node("span", "task-project-dot");
  dot.style.setProperty("--project-color", project.color);
  identity.append(dot, node("span", "task-project-key", project.key), node("h3", "task-project-title", project.title));
  header.append(identity, node("span", "task-project-status", project.status));
  card.append(header);
  if (project.description) card.append(node("p", "task-project-description", project.description));
  const tasks = tasksForProject(data, project.id).filter((task) => !task.archivedAt);
  const open = tasks.filter((task) => !task.completedAt);
  const completed = tasks.filter((task) => task.completedAt);
  if (open.length) {
    const list = node("ul", "task-project-task-list");
    for (const task of open) list.append(taskRow(task, project, data, ui, focusedCode));
    card.append(list);
  } else {
    card.append(node("p", "task-project-empty", "No open Tasks."));
  }
  if (completed.length) {
    const details = node("details", "task-completed-group");
    const summary = node("summary", "task-completed-summary", `${completed.length} completed`);
    const list = node("ul", "task-project-task-list task-completed-list");
    for (const task of completed) list.append(taskRow(task, project, data, ui, focusedCode));
    details.append(summary, list);
    card.append(details);
  }
  if (ui.enabled && !project.archivedAt) {
    const actions = node("footer", "task-project-actions");
    if (project.status === "active") actions.append(button("New Task", "new-project-task"));
    actions.append(button("Edit Project", "edit-project"));
    card.append(actions);
  }
  return card;
}

function projectsSection(data, ui, focusedCode) {
  const section = node("section", "task-section task-projects");
  const projects = orderedProjects(data.projects.filter((project) => !project.archivedAt));
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-section-heading");
  copy.append(node("h2", "task-panel-title", "Projects"), node("span", "task-panel-meta", `${projects.filter((project) => project.status === "active").length} active`));
  header.append(copy);
  if (ui.enabled) header.append(button("New Project", "new-project", "control-button task-section-action"));
  section.append(header);
  if (!projects.length) {
    const empty = node("div", "task-workspace-empty");
    empty.append(node("strong", "", "Start with a Project"), node("p", "", "Projects hold the Tasks you can schedule into focused Sessions."));
    if (ui.enabled) empty.append(button("Create Project", "new-project", "control-button control-button-primary"));
    section.append(empty);
    return section;
  }
  const grid = node("div", "task-project-grid");
  for (const project of projects) grid.append(projectCard(project, data, ui, focusedCode));
  section.append(grid);
  return section;
}

function page(data, ui, focusedCode, selectedWeekStart, calendar) {
  const main = node("div", "task-page");
  main.append(heatmap(data), calendarSection(data, ui, selectedWeekStart, calendar), projectsSection(data, ui, focusedCode));
  if (ui.message) {
    const feedback = node("p", "task-feedback", ui.message);
    feedback.dataset.kind = ui.messageKind;
    main.prepend(feedback);
  }
  return main;
}

function staticDialog(className, content) {
  const dialog = node("dialog", className);
  dialog.innerHTML = content;
  document.body.append(dialog);
  return dialog;
}

function projectDialog() {
  return staticDialog("task-dialog", `<form class="journal-editor-form" method="dialog">
    <header class="dialog-header"><h2 class="dialog-title">Project</h2><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header>
    <div class="dialog-body">
      <label class="field-group"><span class="field-label">Title</span><input class="field-input" name="title" maxlength="120" required></label>
      <label class="field-group"><span class="field-label">Project key</span><input class="field-input" name="key" maxlength="8" pattern="[A-Z][A-Z0-9]{1,7}" autocapitalize="characters"><span class="field-hint">Generated from the title and fixed after creation.</span></label>
      <label class="field-group"><span class="field-label">Description</span><textarea class="field-input field-textarea task-small-textarea" name="description" maxlength="600"></textarea></label>
      <label class="field-group"><span class="field-label">Status</span><select class="field-input" name="status"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select><span class="field-hint" data-project-status-hint></span></label>
      <p class="editor-message" role="status"></p>
    </div>
    <footer class="dialog-actions"><button class="control-button control-button-danger" type="button" data-project-archive hidden>Archive</button><span class="dialog-action-spacer"></span><button class="control-button" type="button" data-dialog-close>Cancel</button><button class="control-button control-button-primary" type="submit">Save</button></footer>
  </form>`);
}

function taskDialog() {
  return staticDialog("task-dialog", `<form class="journal-editor-form" method="dialog">
    <header class="dialog-header"><h2 class="dialog-title">Task</h2><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header>
    <div class="dialog-body"><label class="field-group"><span class="field-label">Project</span><select class="field-input" name="projectId" required></select></label><label class="field-group"><span class="field-label">Title</span><input class="field-input" name="title" maxlength="160" required></label><label class="field-group"><span class="field-label">Objective</span><textarea class="field-input field-textarea task-objective-input" name="objective" maxlength="1200" placeholder="What will be true when this Task is complete?"></textarea></label><span class="field-hint" data-task-code-preview></span><p class="editor-message" role="status"></p></div>
    <footer class="dialog-actions"><span class="dialog-action-spacer"></span><button class="control-button" type="button" data-dialog-close>Cancel</button><button class="control-button control-button-primary" type="submit">Save</button></footer>
  </form>`);
}

function sessionDialog() {
  return staticDialog("task-session-dialog", `<form class="journal-editor-form" method="dialog">
    <header class="dialog-header"><div><h2 class="dialog-title">Plan Session</h2><p class="task-dialog-subtitle">Reserve a concrete time block for one Task.</p></div><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header>
    <div class="dialog-body">
      <label class="field-group"><span class="field-label">Task</span><select class="field-input" name="taskId" required></select></label>
      <div class="task-session-start-fields"><label class="field-group"><span class="field-label">Starts</span><input class="field-input" name="startDate" type="date" required></label><label class="field-group"><span class="field-label">Time</span><input class="field-input" name="startTime" type="time" step="900" required></label><button class="task-now-button" type="button" data-session-now>Now</button></div>
      <fieldset class="task-duration-field"><legend class="field-label">Duration</legend><div class="task-duration-options"><button type="button" data-session-duration="60">1h</button><button type="button" data-session-duration="120">2h</button><button type="button" data-session-duration="180">3h</button><button type="button" data-session-duration="240">4h</button><button type="button" data-session-duration="300">5h</button><button type="button" data-session-duration="custom">Custom</button></div></fieldset>
      <div class="task-session-end"><span class="field-label">Ends</span><strong data-session-ends></strong><span class="task-next-day-badge" data-session-day-offset hidden></span></div>
      <div class="task-session-custom-end" data-session-custom-end hidden><label class="field-group"><span class="field-label">End date</span><input class="field-input" name="endDate" type="date"></label><label class="field-group"><span class="field-label">End time</span><input class="field-input" name="endTime" type="time" step="900"></label></div>
      <label class="field-group"><span class="field-label">Plan</span><textarea class="field-input field-textarea task-plan-input" name="plan" maxlength="600" placeholder="What specific move will this Session complete?" required></textarea></label>
      <div data-session-review hidden><label class="field-group"><span class="field-label">Result</span><select class="field-input" name="state"><option value="scheduled">Scheduled</option><option value="done">Done</option><option value="partial">Partial</option><option value="no_progress">No progress</option></select></label><label class="field-group"><span class="field-label">Outcome</span><textarea class="field-input field-textarea task-outcome-input" name="outcome" maxlength="2000" placeholder="What actually happened?"></textarea><span class="field-hint">Required for Partial and No progress.</span></label></div>
      <p class="editor-message" role="status"></p>
    </div>
    <footer class="dialog-actions"><button class="control-button control-button-danger" type="button" data-session-remove hidden>Remove</button><span class="dialog-action-spacer"></span><button class="control-button" type="button" data-dialog-close>Cancel</button><button class="control-button control-button-primary" type="submit">Save Session</button></footer>
  </form>`);
}

function calendarDialog() {
  return staticDialog("task-calendar-dialog", `<div><header class="dialog-header"><div><h2 class="dialog-title">Google Calendar</h2><p class="task-dialog-subtitle">A dedicated calendar mirrors Task Sessions without embedding Google UI.</p></div><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header><div class="dialog-body" data-calendar-body></div><footer class="dialog-actions" data-calendar-actions></footer></div>`);
}

function detailDialog() {
  return staticDialog("task-detail-dialog", `<div class="task-detail-shell"><header class="task-detail-header"><div data-detail-heading></div><button class="dialog-close" type="button" data-detail-close aria-label="Close Task details">×</button></header><div class="task-detail-body"></div></div>`);
}

export function createTasksController({ canAuthor = () => false, request, confirmAction } = {}) {
  let data = emptyData();
  let root = null;
  let loading = null;
  let loaded = false;
  let focusedCode = "";
  let suppressDetailRoute = false;
  let selectedWeekStart = weekStart(singaporeDate());
  let calendar = null;
  let calendarLoading = false;
  let calendarRefreshTimer = null;
  let drag = null;
  let suppressClickUntil = 0;
  let calendarScroll = { weekStart: "", top: null, left: 0 };
  const ui = { enabled: false, busy: false, message: "", messageKind: "status" };
  const editor = { projectDialog: null, projectForm: null, projectId: "", projectKeyManual: false, taskDialog: null, taskForm: null, taskId: "", sessionDialog: null, sessionForm: null, sessionId: "", sessionDuration: 60, sessionCustom: false, detailDialog: null, calendarDialog: null };

  function render() {
    if (!root?.isConnected) return;
    const previousScroll = root.querySelector(".task-week-scroll");
    if (previousScroll?.dataset.initialized === "true") {
      calendarScroll = { weekStart: previousScroll.dataset.weekStart || "", top: previousScroll.scrollTop, left: previousScroll.scrollLeft };
    }
    ui.enabled = Boolean(canAuthor());
    root.replaceChildren(page(data, ui, focusedCode, selectedWeekStart, calendar));
    syncDetail();
    if (ui.enabled && !calendar && !calendarLoading) void loadCalendarStatus();
    requestAnimationFrame(scrollCalendar);
  }

  function scrollCalendar() {
    const scroll = root?.querySelector(".task-week-scroll");
    if (!scroll) return;
    if (calendarScroll.weekStart === selectedWeekStart && calendarScroll.top !== null) {
      scroll.scrollTop = calendarScroll.top;
      scroll.scrollLeft = calendarScroll.left;
      scroll.dataset.initialized = "true";
      return;
    }
    const dates = weekDates(selectedWeekStart);
    const fragments = data.sessions.flatMap((session) => dates.map((date) => sessionFragment(session, date)).filter(Boolean));
    const first = fragments.sort((left, right) => left.startMinute - right.startMinute)[0];
    const currentWeek = dates.includes(data.today);
    const targetMinute = first ? Math.max(0, first.startMinute - 60) : (currentWeek ? Math.max(0, currentMinuteInSingapore() - 90) : 8 * 60);
    scroll.scrollTop = targetMinute / 60 * HOUR_HEIGHT;
    if (currentWeek && scroll.scrollWidth > scroll.clientWidth) {
      const index = dates.indexOf(data.today);
      const grid = scroll.querySelector(".task-week-grid");
      const dayWidth = grid ? grid.getBoundingClientRect().width / 7 : 0;
      scroll.scrollLeft = Math.max(0, index * dayWidth - (scroll.clientWidth - dayWidth) / 2);
    }
    scroll.dataset.initialized = "true";
  }

  async function load(force = false) {
    if (loaded && !force) return data;
    if (loading) return loading;
    loading = fetch("/data/tasks", { cache: "no-store" }).then(async (response) => {
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Tasks could not be loaded.");
      return validateData(result);
    }).then((value) => { data = value; loaded = true; return value; }).finally(() => { loading = null; });
    return loading;
  }

  async function post(path, payload = {}) {
    const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const value = await response.json().catch(() => null);
    if (!response.ok) throw new Error(value?.error || "The request could not be completed.");
    return value;
  }

  async function loadCalendarStatus() {
    if (!ui.enabled || calendarLoading) return;
    calendarLoading = true;
    try {
      const response = await fetch("/api/tasks/google/status", { cache: "no-store", credentials: "same-origin" });
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new Error(value?.error || "Calendar status could not be loaded.");
      calendar = value;
    } catch (error) {
      calendar = { configured: false, connected: false, lastError: error?.message || "Calendar status unavailable." };
    } finally {
      calendarLoading = false;
      render();
    }
  }

  function refreshCalendarAfterSave(previousSync, attempt = 0) {
    if (calendarRefreshTimer) clearTimeout(calendarRefreshTimer);
    calendarRefreshTimer = setTimeout(async () => {
      calendarRefreshTimer = null;
      await loadCalendarStatus();
      if (calendar?.connected && !calendar.lastError && calendar.lastSyncedAt === previousSync && attempt < 4) {
        calendar = { ...calendar, syncing: true };
        render();
        refreshCalendarAfterSave(previousSync, attempt + 1);
      }
    }, 700 + attempt * 450);
  }

  function dialogMessage(form, message, kind = "error") {
    const target = form.querySelector(".editor-message");
    target.textContent = message;
    target.dataset.kind = kind;
  }

  function setBusy(form, busy) {
    for (const control of form.elements) control.disabled = busy;
  }

  async function send(payload, form = null) {
    if (ui.busy) return null;
    ui.busy = true;
    if (form) setBusy(form, true);
    try {
      const result = request ? await request(payload) : await post("/api/tasks/save", payload);
      data = validateData(result);
      loaded = true;
      if (calendar?.connected) {
        const previousSync = calendar.lastSyncedAt || null;
        calendar = { ...calendar, syncing: true, lastError: null };
        refreshCalendarAfterSave(previousSync);
      }
      ui.message = "Saved.";
      ui.messageKind = "status";
      return result;
    } catch (error) {
      ui.message = error?.message || "Task changes could not be saved.";
      ui.messageKind = "error";
      if (form) dialogMessage(form, ui.message);
      if (/changed|revision/i.test(ui.message)) { loaded = false; await load(true).catch(() => {}); }
      return null;
    } finally {
      ui.busy = false;
      if (form) setBusy(form, false);
      render();
    }
  }

  function closeDialog(dialog) {
    if (dialog?.open && !ui.busy) dialog.close();
  }

  function ensureEditors() {
    if (editor.projectDialog) return;
    editor.projectDialog = projectDialog();
    editor.projectForm = editor.projectDialog.querySelector("form");
    editor.taskDialog = taskDialog();
    editor.taskForm = editor.taskDialog.querySelector("form");
    editor.sessionDialog = sessionDialog();
    editor.sessionForm = editor.sessionDialog.querySelector("form");
    editor.calendarDialog = calendarDialog();
    for (const dialog of [editor.projectDialog, editor.taskDialog, editor.sessionDialog, editor.calendarDialog]) {
      dialog.querySelectorAll("[data-dialog-close]").forEach((control) => control.addEventListener("click", () => closeDialog(dialog)));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(dialog); });
    }
    editor.projectForm.addEventListener("submit", saveProject);
    editor.taskForm.addEventListener("submit", saveTask);
    editor.sessionForm.addEventListener("submit", saveSession);
    editor.sessionForm.elements.startDate.addEventListener("input", updateSessionTiming);
    editor.sessionForm.elements.startTime.addEventListener("input", updateSessionTiming);
    editor.sessionForm.elements.endDate.addEventListener("input", updateSessionTiming);
    editor.sessionForm.elements.endTime.addEventListener("input", updateSessionTiming);
    editor.sessionDialog.querySelector("[data-session-now]").addEventListener("click", useCurrentSessionTime);
    editor.sessionDialog.querySelectorAll("[data-session-duration]").forEach((control) => control.addEventListener("click", () => setSessionDuration(control.dataset.sessionDuration)));
    editor.projectForm.elements.title.addEventListener("input", updateProjectKey);
    editor.projectForm.elements.key.addEventListener("input", () => {
      editor.projectKeyManual = Boolean(editor.projectForm.elements.key.value.trim());
      editor.projectForm.elements.key.value = editor.projectForm.elements.key.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    });
    editor.projectDialog.querySelector("[data-project-archive]").addEventListener("click", archiveProject);
    editor.sessionDialog.querySelector("[data-session-remove]").addEventListener("click", removeSession);
  }

  function projectKeyBase(title) {
    const words = String(title || "").normalize("NFKD").match(/[A-Za-z0-9]+/g) || [];
    if (!words.length) return "";
    let base = words.length > 1 ? words.map((word) => word[0]).join("") : words[0].slice(0, 4);
    base = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]/.test(base)) base = `P${base}`;
    if (base.length < 2) base = `${base}P`;
    return base.slice(0, 8);
  }

  function updateProjectKey() {
    if (editor.projectId || editor.projectKeyManual) return;
    const used = new Set(data.projects.map((project) => project.key));
    const base = projectKeyBase(editor.projectForm.elements.title.value);
    if (!base || !used.has(base)) { editor.projectForm.elements.key.value = base; return; }
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${base.slice(0, 8 - String(suffix).length)}${suffix}`;
      if (!used.has(candidate)) { editor.projectForm.elements.key.value = candidate; return; }
    }
  }

  function openProject(project = null) {
    if (!ui.enabled) return;
    ensureEditors();
    editor.projectId = project?.id || "";
    editor.projectKeyManual = false;
    editor.projectForm.reset();
    editor.projectForm.elements.title.value = project?.title || "";
    editor.projectForm.elements.key.value = project?.key || "";
    editor.projectForm.elements.key.disabled = Boolean(project);
    editor.projectForm.elements.description.value = project?.description || "";
    editor.projectForm.elements.status.value = project?.status || "active";
    const openCount = project ? data.tasks.filter((task) => task.projectId === project.id && !task.archivedAt && !task.completedAt).length : 0;
    editor.projectForm.elements.status.querySelector('option[value="completed"]').disabled = openCount > 0;
    editor.projectDialog.querySelector("[data-project-status-hint]").textContent = openCount ? "Complete or archive every open Task first." : "";
    editor.projectDialog.querySelector(".dialog-title").textContent = project ? "Edit Project" : "New Project";
    editor.projectDialog.querySelector("[data-project-archive]").hidden = !project;
    dialogMessage(editor.projectForm, "", "status");
    updateProjectKey();
    editor.projectDialog.showModal();
    editor.projectForm.elements.title.focus();
  }

  function fillProjectOptions(select) {
    select.replaceChildren();
    for (const project of orderedProjects(data.projects.filter((candidate) => !candidate.archivedAt && candidate.status === "active"))) {
      const option = node("option", "", `${project.key} · ${project.title}`);
      option.value = project.id;
      select.append(option);
    }
  }

  function openTask(task = null, projectId = "") {
    if (!ui.enabled) return;
    ensureEditors();
    editor.taskId = task?.id || "";
    editor.taskForm.reset();
    fillProjectOptions(editor.taskForm.elements.projectId);
    editor.taskForm.elements.projectId.value = task?.projectId || projectId || editor.taskForm.elements.projectId.options[0]?.value || "";
    editor.taskForm.elements.title.value = task?.title || "";
    editor.taskForm.elements.objective.value = task?.objective || "";
    editor.taskDialog.querySelector(".dialog-title").textContent = task ? "Edit Task" : "New Task";
    editor.taskDialog.querySelector("[data-task-code-preview]").textContent = task ? `${task.code} · permanent code` : "A permanent Project–year–sequence code is generated automatically.";
    dialogMessage(editor.taskForm, "", "status");
    editor.taskDialog.showModal();
    editor.taskForm.elements.title.focus();
  }

  function fillTaskOptions(select) {
    select.replaceChildren();
    const choices = availableTasks(data);
    for (const project of orderedProjects(data.projects.filter((candidate) => !candidate.archivedAt && candidate.status === "active"))) {
      const projectTasks = choices.filter((task) => task.projectId === project.id);
      if (!projectTasks.length) continue;
      const group = document.createElement("optgroup");
      group.label = `${project.key} · ${project.title}`;
      for (const task of projectTasks) {
        const option = node("option", "", `${task.code} · ${task.title}`);
        option.value = task.id;
        group.append(option);
      }
      select.append(group);
    }
  }

  function nextSlot(startsAt, duration = 60, ignoredId = "") {
    let start = Math.ceil(Date.parse(startsAt) / SNAP_MS) * SNAP_MS;
    const durationMs = duration * 60 * 1000;
    for (let attempt = 0; attempt < 7 * 24 * 4; attempt += 1) {
      const end = start + durationMs;
      const collision = data.sessions.filter((session) => session.id !== ignoredId && start < Date.parse(session.endsAt) && end > Date.parse(session.startsAt))
        .sort((left, right) => Date.parse(left.endsAt) - Date.parse(right.endsAt))[0];
      if (!collision) return new Date(start).toISOString();
      start = Math.ceil(Date.parse(collision.endsAt) / SNAP_MS) * SNAP_MS;
    }
    return new Date(start).toISOString();
  }

  function sessionStartAt(form = editor.sessionForm) {
    const minute = parseTime(form.elements.startTime.value);
    return DATE.test(form.elements.startDate.value || "") && Number.isFinite(minute) ? localDateTime(form.elements.startDate.value, minute) : "";
  }

  function sessionEndAt(form = editor.sessionForm) {
    const startsAt = sessionStartAt(form);
    if (!startsAt) return "";
    if (!editor.sessionCustom) return new Date(Date.parse(startsAt) + editor.sessionDuration * 60 * 1000).toISOString();
    const minute = parseTime(form.elements.endTime.value);
    return DATE.test(form.elements.endDate.value || "") && Number.isFinite(minute) ? localDateTime(form.elements.endDate.value, minute) : "";
  }

  function updateSessionTiming() {
    if (!editor.sessionForm) return;
    const startsAt = sessionStartAt();
    const endsAt = sessionEndAt();
    const summary = editor.sessionDialog.querySelector("[data-session-ends]");
    const badge = editor.sessionDialog.querySelector("[data-session-day-offset]");
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      summary.textContent = "Choose a valid end time";
      badge.hidden = true;
      return;
    }
    if (editor.sessionCustom) editor.sessionDuration = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000);
    const start = singaporeParts(startsAt);
    const end = singaporeParts(endsAt);
    summary.textContent = `${new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${end.date}T00:00:00Z`))} · ${formatMinute(end.minute)}`;
    const dayOffset = Math.round((Date.parse(`${end.date}T00:00:00Z`) - Date.parse(`${start.date}T00:00:00Z`)) / DAY_MS);
    badge.textContent = dayOffset ? `+${dayOffset} day${dayOffset === 1 ? "" : "s"}` : "";
    badge.hidden = !dayOffset;
    if (!editor.sessionCustom) {
      editor.sessionForm.elements.endDate.value = end.date;
      editor.sessionForm.elements.endTime.value = timeInputValue(end.minute);
    }
  }

  function setSessionDuration(value) {
    const custom = value === "custom";
    const previousEnd = sessionEndAt();
    editor.sessionCustom = custom;
    if (!custom) editor.sessionDuration = Number(value);
    const customFields = editor.sessionDialog.querySelector("[data-session-custom-end]");
    customFields.hidden = !custom;
    editor.sessionForm.elements.endDate.disabled = !custom;
    editor.sessionForm.elements.endTime.disabled = !custom;
    editor.sessionDialog.querySelectorAll("[data-session-duration]").forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.sessionDuration === value)));
    if (custom && previousEnd) {
      const end = singaporeParts(previousEnd);
      editor.sessionForm.elements.endDate.value = end.date;
      editor.sessionForm.elements.endTime.value = timeInputValue(end.minute);
    }
    updateSessionTiming();
  }

  function useCurrentSessionTime() {
    const current = roundedCurrentSlot();
    const startsAt = nextSlot(localDateTime(current.date, current.minute), editor.sessionDuration, editor.sessionId);
    const start = singaporeParts(startsAt);
    editor.sessionForm.elements.startDate.value = start.date;
    editor.sessionForm.elements.startTime.value = timeInputValue(start.minute);
    if (editor.sessionCustom) {
      const end = singaporeParts(new Date(Date.parse(startsAt) + editor.sessionDuration * 60 * 1000).toISOString());
      editor.sessionForm.elements.endDate.value = end.date;
      editor.sessionForm.elements.endTime.value = timeInputValue(end.minute);
    }
    updateSessionTiming();
  }

  function openSession(session = null, taskId = "", startMinute = null, requestedDate = "") {
    if (!ui.enabled) return;
    ensureEditors();
    editor.sessionId = session?.id || "";
    editor.sessionForm.reset();
    fillTaskOptions(editor.sessionForm.elements.taskId);
    const dates = new Set(weekDates(selectedWeekStart));
    const now = roundedCurrentSlot();
    const preferredDate = requestedDate || (taskId ? data.today : (dates.has(data.today) ? data.today : selectedWeekStart));
    const initialStart = session?.startsAt || (startMinute === null
      ? nextSlot(localDateTime(preferredDate, now.minute), 60)
      : localDateTime(preferredDate, Math.max(0, Math.min(1425, startMinute))));
    const start = singaporeParts(initialStart);
    const duration = session ? sessionDuration(session) : 60;
    editor.sessionForm.elements.taskId.value = session?.taskId || taskId || editor.sessionForm.elements.taskId.options[0]?.value || "";
    editor.sessionForm.elements.taskId.disabled = Boolean(session);
    editor.sessionForm.elements.startDate.value = start.date;
    editor.sessionForm.elements.startTime.value = timeInputValue(start.minute);
    editor.sessionForm.elements.plan.value = session?.plan || "";
    editor.sessionForm.elements.state.value = session?.state || "scheduled";
    editor.sessionForm.elements.outcome.value = session?.outcome || "";
    editor.sessionDialog.querySelector("[data-session-review]").hidden = !session;
    editor.sessionDialog.querySelector("[data-session-remove]").hidden = !session || session.state !== "scheduled";
    editor.sessionDialog.querySelector(".dialog-title").textContent = session ? "Session" : "Plan Session";
    const preset = [60, 120, 180, 240, 300].includes(duration) ? String(duration) : "custom";
    editor.sessionDuration = duration;
    editor.sessionCustom = false;
    const end = singaporeParts(session?.endsAt || new Date(Date.parse(initialStart) + duration * 60 * 1000).toISOString());
    editor.sessionForm.elements.endDate.value = end.date;
    editor.sessionForm.elements.endTime.value = timeInputValue(end.minute);
    setSessionDuration(preset);
    dialogMessage(editor.sessionForm, "", "status");
    editor.sessionDialog.showModal();
    (session ? editor.sessionForm.elements.plan : editor.sessionForm.elements.taskId).focus();
  }

  async function saveProject(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const result = await send({ mode: editor.projectId ? "updateProject" : "createProject", baseRevision: data.revision, project: { ...(editor.projectId ? { id: editor.projectId } : { key: form.elements.key.value }), title: form.elements.title.value, description: form.elements.description.value, status: form.elements.status.value } }, form);
    if (result) editor.projectDialog.close();
  }

  async function saveTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const result = await send({ mode: editor.taskId ? "updateTask" : "createTask", baseRevision: data.revision, task: { ...(editor.taskId ? { id: editor.taskId } : {}), projectId: form.elements.projectId.value, title: form.elements.title.value, objective: form.elements.objective.value } }, form);
    if (result) editor.taskDialog.close();
  }

  async function saveSession(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const startsAt = sessionStartAt(form);
    const endsAt = sessionEndAt(form);
    const duration = Date.parse(endsAt) - Date.parse(startsAt);
    if (!startsAt || !endsAt || duration < MIN_SESSION_MS || duration > MAX_SESSION_MS) {
      dialogMessage(form, "Session duration must be between 15 minutes and 24 hours.");
      return;
    }
    const state = editor.sessionId ? form.elements.state.value : "scheduled";
    if ((state === "partial" || state === "no_progress") && !form.elements.outcome.value.trim()) {
      dialogMessage(form, "Partial and No progress reviews need a short outcome.");
      return;
    }
    const session = { ...(editor.sessionId ? { id: editor.sessionId } : { taskId: form.elements.taskId.value }), startsAt, endsAt, plan: form.elements.plan.value, ...(editor.sessionId ? { state, outcome: form.elements.outcome.value } : {}) };
    const result = await send({ mode: editor.sessionId ? "updateSession" : "createSession", baseRevision: data.revision, session }, form);
    if (result) { selectedWeekStart = weekStart(singaporeParts(session.startsAt).date); editor.sessionDialog.close(); render(); }
  }

  async function archiveProject() {
    const project = data.projects.find((candidate) => candidate.id === editor.projectId);
    if (!project) return;
    const approved = confirmAction ? await confirmAction("Archive Project", `Archive “${project.title}”, its open Tasks, and their scheduled Sessions?`, "Archive") : window.confirm(`Archive “${project.title}”?`);
    if (!approved) return;
    const result = await send({ mode: "archiveProject", baseRevision: data.revision, project: { id: project.id } }, editor.projectForm);
    if (result) editor.projectDialog.close();
  }

  async function removeSession() {
    const session = data.sessions.find((candidate) => candidate.id === editor.sessionId);
    if (!session) return;
    const result = await send({ mode: "removeSession", baseRevision: data.revision, session: { id: session.id } }, editor.sessionForm);
    if (result) editor.sessionDialog.close();
  }

  function showContribution(control) {
    const date = control.dataset.contributionDate;
    const entries = completionDays(data).get(date) || [];
    let tooltip = document.querySelector(".task-contribution-tooltip");
    if (!tooltip) { tooltip = node("div", "task-contribution-tooltip"); tooltip.setAttribute("role", "tooltip"); document.body.append(tooltip); }
    tooltip.replaceChildren();
    const header = node("header", "task-contribution-tooltip-header");
    header.append(node("strong", "", formatDate(date)), node("span", "", `${entries.length} completed`));
    const list = node("ul", "task-contribution-list");
    for (const contribution of entries) {
      const item = node("li", "task-contribution-item");
      const top = node("div", "task-contribution-heading");
      const dot = node("span", "task-project-dot");
      dot.style.setProperty("--project-color", contribution.projectColor);
      top.append(dot, node("span", "task-row-code", contribution.taskCode));
      item.append(top, node("strong", "", contribution.taskTitle), node("span", "task-row-meta", `${contribution.projectKey} · ${contribution.projectTitle}`));
      list.append(item);
    }
    tooltip.append(header, list);
    const rect = control.getBoundingClientRect();
    tooltip.hidden = false;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    tooltip.style.top = `${Math.max(8, rect.top - height - 8)}px`;
  }

  function hideContribution() {
    const tooltip = document.querySelector(".task-contribution-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function openCalendarSettings() {
    ensureEditors();
    const body = editor.calendarDialog.querySelector("[data-calendar-body]");
    const actions = editor.calendarDialog.querySelector("[data-calendar-actions]");
    body.replaceChildren();
    actions.replaceChildren();
    if (!calendar?.configured) {
      body.append(node("p", "task-calendar-status", "Google OAuth has not been configured for this site yet."), node("p", "task-calendar-note", calendar?.lastError || "Add the Worker OAuth secrets, then reload this page."));
      actions.append(button("Close", "close-calendar", "control-button"));
    } else if (!calendar.connected) {
      body.append(node("p", "task-calendar-status", "Connect Google Calendar"), node("p", "task-calendar-note", "This creates one dedicated “Xayah Tasks” calendar. Other calendars remain private and untouched."));
      actions.append(button("Cancel", "close-calendar", "control-button"), button("Connect", "connect-calendar", "control-button control-button-primary"));
    } else {
      body.append(node("p", "task-calendar-status", calendar.syncing ? "Syncing changes…" : "Connected to Xayah Tasks"), node("p", "task-calendar-note", calendar.lastSyncedAt ? `Last synced ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" }).format(new Date(calendar.lastSyncedAt))}` : "Waiting for the first sync."));
      if (calendar.lastError) { const error = node("p", "task-calendar-warning", calendar.lastError); body.append(error); }
      actions.append(button("Disconnect", "disconnect-calendar", "control-button control-button-danger"), node("span", "dialog-action-spacer"), button("Close", "close-calendar", "control-button"), button("Sync now", "sync-calendar", "control-button control-button-primary"));
    }
    editor.calendarDialog.showModal();
  }

  async function calendarAction(action) {
    if (action === "close-calendar") { editor.calendarDialog.close(); return; }
    if (action === "connect-calendar") { location.assign("/api/tasks/google/connect"); return; }
    if (action === "disconnect-calendar") {
      const approved = confirmAction ? await confirmAction("Disconnect Google Calendar", "Delete the dedicated Xayah Tasks calendar and remove its authorization?", "Disconnect") : window.confirm("Disconnect Google Calendar?");
      if (!approved) return;
    }
    const buttonTarget = editor.calendarDialog.querySelector(`[data-task-action="${action}"]`);
    if (buttonTarget) buttonTarget.disabled = true;
    try {
      if (action === "sync-calendar") {
        await post("/api/tasks/google/sync");
        await load(true);
        ui.message = "Google Calendar synced.";
      }
      if (action === "disconnect-calendar") {
        await post("/api/tasks/google/disconnect");
        ui.message = "Google Calendar disconnected.";
      }
      editor.calendarDialog.close();
      calendar = null;
      await loadCalendarStatus();
    } catch (error) {
      ui.message = error?.message || "Google Calendar action failed.";
      ui.messageKind = "error";
      if (buttonTarget) buttonTarget.disabled = false;
      render();
    }
  }

  function ensureDetail() {
    if (editor.detailDialog) return;
    editor.detailDialog = detailDialog();
    editor.detailDialog.querySelector("[data-detail-close]").addEventListener("click", () => editor.detailDialog.close());
    editor.detailDialog.addEventListener("cancel", (event) => { event.preventDefault(); editor.detailDialog.close(); });
    editor.detailDialog.addEventListener("close", () => { if (!suppressDetailRoute && location.hash.startsWith("#task/")) location.hash = "task"; });
    editor.detailDialog.addEventListener("click", handleDetailClick);
  }

  function detailStat(label, value) {
    const item = node("div", "task-detail-stat");
    item.append(node("strong", "", value), node("span", "", label));
    return item;
  }

  function syncDetail() {
    const task = data.tasks.find((candidate) => candidate.code === focusedCode);
    if (!task) {
      if (editor.detailDialog?.open) { suppressDetailRoute = true; editor.detailDialog.close(); suppressDetailRoute = false; }
      return;
    }
    ensureDetail();
    const project = data.projects.find((candidate) => candidate.id === task.projectId);
    if (!project) return;
    const heading = editor.detailDialog.querySelector("[data-detail-heading]");
    const body = editor.detailDialog.querySelector(".task-detail-body");
    heading.replaceChildren();
    const eyebrow = node("div", "task-detail-eyebrow");
    const dot = node("span", "task-project-dot");
    dot.style.setProperty("--project-color", project.color);
    eyebrow.append(dot, node("span", "task-row-code", task.code), document.createTextNode(project.title));
    heading.append(eyebrow, node("h2", "task-detail-title", task.title));
    body.replaceChildren();
    if (task.objective) body.append(node("p", "task-detail-objective", task.objective));
    const actions = node("div", "task-detail-actions");
    const editable = ui.enabled && !task.archivedAt && !project.archivedAt && project.status === "active";
    if (editable) {
      if (!task.completedAt) actions.append(button("Schedule Session", "detail-schedule", "control-button control-button-primary"));
      actions.append(button("Edit", "detail-edit", "control-button"), button(task.completedAt ? "Reopen" : "Complete Task", task.completedAt ? "detail-reopen" : "detail-complete", "control-button"), button("Archive", "detail-archive", "task-text-button task-danger-button"));
    }
    if (actions.childElementCount) body.append(actions);
    const sessions = data.sessions.filter((session) => session.taskId === task.id).sort((left, right) => right.startsAt.localeCompare(left.startsAt));
    const logged = sessions.filter((session) => session.state !== "scheduled").reduce((total, session) => total + sessionDuration(session), 0);
    const stats = node("div", "task-detail-stats");
    stats.append(detailStat("Sessions", String(sessions.length)), detailStat("Time logged", formatDuration(logged)), detailStat("Done", String(sessions.filter((session) => session.state === "done").length)));
    body.append(stats);
    const history = node("section", "task-detail-history");
    history.append(node("h3", "task-detail-section-title", "Session history"));
    if (!sessions.length) history.append(node("p", "task-detail-empty", "No Sessions yet."));
    else {
      const list = node("ol", "task-history-list");
      for (const session of sessions) {
        const item = node("li", "task-history-item");
        item.dataset.sessionId = session.id;
        const top = node("div", "task-history-heading");
        const start = singaporeParts(session.startsAt);
        const end = singaporeParts(session.endsAt);
        const range = start.date === end.date
          ? `${formatDate(start.date)} · ${formatMinute(start.minute)}–${formatMinute(end.minute)}`
          : `${formatDate(start.date)} ${formatMinute(start.minute)} → ${formatDate(end.date)} ${formatMinute(end.minute)}`;
        top.append(node("time", "", range), node("span", `task-session-state task-session-state-${session.state}`, session.state.replace("no_progress", "no progress")));
        item.append(top, node("p", "task-history-plan", session.plan));
        if (session.outcome) item.append(node("p", "task-history-outcome", session.outcome));
        if (ui.enabled) item.append(button("Open", "detail-open-session", "task-text-button"));
        list.append(item);
      }
      history.append(list);
    }
    body.append(history);
    if (!editor.detailDialog.open) editor.detailDialog.showModal();
  }

  async function handleDetailClick(event) {
    const control = event.target.closest("[data-task-action]");
    if (!control) return;
    const task = data.tasks.find((candidate) => candidate.code === focusedCode);
    if (!task) return;
    const action = control.dataset.taskAction;
    if (action === "detail-schedule") openSession(null, task.id);
    if (action === "detail-edit") openTask(task);
    if (action === "detail-open-session") {
      const session = data.sessions.find((candidate) => candidate.id === control.closest("[data-session-id]")?.dataset.sessionId);
      if (session) openSession(session);
    }
    if (action === "detail-reopen") await send({ mode: "reopenTask", baseRevision: data.revision, task: { id: task.id } });
    if (action === "detail-complete") {
      const approved = confirmAction ? await confirmAction("Complete Task", `Complete “${task.title}”? Scheduled Sessions will be removed and one contribution will be recorded.`, "Complete") : window.confirm(`Complete “${task.title}”?`);
      if (approved) await send({ mode: "completeTask", baseRevision: data.revision, task: { id: task.id } });
    }
    if (action === "detail-archive") {
      const approved = confirmAction ? await confirmAction("Archive Task", `Archive “${task.title}” and remove its scheduled Sessions?`, "Archive") : window.confirm(`Archive “${task.title}”?`);
      if (approved && await send({ mode: "archiveTask", baseRevision: data.revision, task: { id: task.id } })) location.hash = "task";
    }
  }

  function handleClick(event) {
    const control = event.target.closest("[data-task-action]");
    if (!control) return;
    const action = control.dataset.taskAction;
    if (action === "show-contribution") { showContribution(control); return; }
    if (action === "open-task") {
      const task = data.tasks.find((candidate) => candidate.code === control.dataset.taskCode);
      if (task) location.hash = `task/${task.code}`;
      return;
    }
    if (action === "open-session") {
      if (Date.now() < suppressClickUntil) return;
      const session = data.sessions.find((candidate) => candidate.id === control.dataset.sessionId);
      if (session && ui.enabled) openSession(session);
      return;
    }
    if (action === "previous-week") { selectedWeekStart = dateShift(selectedWeekStart, -7); render(); return; }
    if (action === "next-week") { selectedWeekStart = dateShift(selectedWeekStart, 7); render(); return; }
    if (action === "this-week") { selectedWeekStart = weekStart(data.today); render(); return; }
    if (!ui.enabled) return;
    const projectId = control.closest("[data-project-id]")?.dataset.projectId || "";
    const taskId = control.closest("[data-task-id]")?.dataset.taskId || "";
    if (action === "new-project") openProject();
    if (action === "edit-project") openProject(data.projects.find((project) => project.id === projectId));
    if (action === "new-project-task") openTask(null, projectId);
    if (action === "schedule-task") openSession(null, taskId);
    if (action === "new-session") openSession();
    if (action === "calendar-settings") openCalendarSettings();
    if (action === "quick-session" && event.target === control && availableTasks(data).length) {
      const minute = Math.max(0, Math.min(1380, Math.round((event.clientY - control.getBoundingClientRect().top) / HOUR_HEIGHT * 60 / SNAP_MINUTES) * SNAP_MINUTES));
      openSession(null, "", minute, control.dataset.calendarDate);
    }
  }

  function handleKeydown(event) {
    const session = event.target.closest?.(".task-session-block");
    if (session && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); session.click(); }
  }

  function handleHover(event) {
    const cell = event.target.closest?.('[data-task-action="show-contribution"]');
    if (cell) showContribution(cell);
  }

  function handleHoverEnd(event) {
    const cell = event.target.closest?.('[data-task-action="show-contribution"]');
    if (cell && !cell.contains(event.relatedTarget)) hideContribution();
  }

  function clearDragGhosts() {
    root?.querySelectorAll(".task-session-drag-ghost").forEach((ghost) => ghost.remove());
    root?.querySelectorAll(".task-session-block[data-drag-source]").forEach((block) => delete block.dataset.dragSource);
  }

  function renderDragGhosts() {
    root.querySelectorAll(".task-session-drag-ghost").forEach((ghost) => ghost.remove());
    const task = data.tasks.find((candidate) => candidate.id === drag.session.taskId);
    const project = task && data.projects.find((candidate) => candidate.id === task.projectId);
    if (!task || !project) return;
    const preview = { ...drag.session, startsAt: new Date(drag.nextStart).toISOString(), endsAt: new Date(drag.nextEnd).toISOString() };
    for (const date of weekDates(selectedWeekStart)) {
      const fragment = sessionFragment(preview, date);
      const day = fragment && root.querySelector(`.task-week-day[data-calendar-date="${date}"]`);
      if (!fragment || !day) continue;
      const ghost = sessionBlock(preview, task, project, false, fragment);
      ghost.classList.add("task-session-drag-ghost");
      ghost.removeAttribute("data-task-action");
      ghost.removeAttribute("data-session-id");
      ghost.removeAttribute("role");
      ghost.removeAttribute("tabindex");
      ghost.setAttribute("aria-hidden", "true");
      day.append(ghost);
    }
  }

  function handlePointerDown(event) {
    const block = event.target.closest?.(".task-session-block[data-draggable]");
    if (!block || !ui.enabled || matchMedia("(pointer: coarse)").matches) return;
    const session = data.sessions.find((candidate) => candidate.id === block.dataset.sessionId);
    if (!session || session.state !== "scheduled") return;
    const day = block.closest(".task-week-day");
    const resize = event.target.closest("[data-session-resize]")?.dataset.sessionResize;
    const start = Date.parse(session.startsAt);
    const end = Date.parse(session.endsAt);
    drag = { pointerId: event.pointerId, block, session, mode: resize || "move", originX: event.clientX, originY: event.clientY, dayWidth: day?.getBoundingClientRect().width || 1, originDay: weekDates(selectedWeekStart).indexOf(block.dataset.fragmentDate), start, end, nextStart: start, nextEnd: end };
    root.querySelectorAll(`.task-session-block[data-session-id="${session.id}"]`).forEach((source) => { source.dataset.dragSource = "true"; });
    block.setPointerCapture(event.pointerId);
    block.dataset.dragging = "true";
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = Math.round((event.clientY - drag.originY) / HOUR_HEIGHT * 60 / SNAP_MINUTES) * SNAP_MS;
    if (drag.mode === "move") {
      const dayIndex = Math.max(0, Math.min(6, drag.originDay + Math.round((event.clientX - drag.originX) / drag.dayWidth)));
      const dayDelta = dayIndex - drag.originDay;
      drag.nextStart = drag.start + dayDelta * DAY_MS + delta;
      drag.nextEnd = drag.end + dayDelta * DAY_MS + delta;
    } else if (drag.mode === "start") {
      drag.nextStart = Math.max(drag.end - MAX_SESSION_MS, Math.min(drag.end - MIN_SESSION_MS, drag.start + delta));
      drag.nextEnd = drag.end;
    } else if (drag.mode === "end") {
      drag.nextStart = drag.start;
      drag.nextEnd = Math.max(drag.start + MIN_SESSION_MS, Math.min(drag.start + MAX_SESSION_MS, drag.end + delta));
    }
    renderDragGhosts();
  }

  async function handlePointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    if (current.block.hasPointerCapture(event.pointerId)) current.block.releasePointerCapture(event.pointerId);
    delete current.block.dataset.dragging;
    clearDragGhosts();
    if (event.type === "pointercancel") { render(); return; }
    if (current.nextStart === current.start && current.nextEnd === current.end) return;
    suppressClickUntil = Date.now() + 400;
    await send({ mode: "updateSession", baseRevision: data.revision, session: { id: current.session.id, startsAt: new Date(current.nextStart).toISOString(), endsAt: new Date(current.nextEnd).toISOString(), plan: current.session.plan, outcome: current.session.outcome, state: current.session.state } });
  }

  function handleDialogClick(event) {
    const action = event.target.closest("[data-task-action]")?.dataset.taskAction;
    if (action) void calendarAction(action);
  }

  function mount(element, taskCode = "") {
    if (root !== element) {
      if (root) {
        root.removeEventListener("click", handleClick);
        root.removeEventListener("keydown", handleKeydown);
        root.removeEventListener("pointerdown", handlePointerDown);
        root.removeEventListener("pointermove", handlePointerMove);
        root.removeEventListener("pointerup", handlePointerUp);
        root.removeEventListener("pointercancel", handlePointerUp);
        root.removeEventListener("pointerover", handleHover);
        root.removeEventListener("pointerout", handleHoverEnd);
        root.removeEventListener("focusin", handleHover);
        root.removeEventListener("focusout", handleHoverEnd);
      }
      root = element;
      root.addEventListener("click", handleClick);
      root.addEventListener("keydown", handleKeydown);
      root.addEventListener("pointerdown", handlePointerDown);
      root.addEventListener("pointermove", handlePointerMove);
      root.addEventListener("pointerup", handlePointerUp);
      root.addEventListener("pointercancel", handlePointerUp);
      root.addEventListener("pointerover", handleHover);
      root.addEventListener("pointerout", handleHoverEnd);
      root.addEventListener("focusin", handleHover);
      root.addEventListener("focusout", handleHoverEnd);
    }
    focusedCode = TASK_CODE.test(taskCode) ? taskCode : "";
    const query = new URL(location.href).searchParams.get("calendar");
    if (query) {
      ui.message = query === "connected" ? "Google Calendar connected." : "Google Calendar connection was not completed.";
      ui.messageKind = query === "connected" ? "status" : "error";
      const clean = new URL(location.href);
      clean.searchParams.delete("calendar");
      history.replaceState(history.state, "", `${clean.pathname}${clean.search}${clean.hash}`);
    }
    render();
    void load().then(render).catch(() => { if (root?.isConnected) root.replaceChildren(node("p", "empty-state", "Task data could not be loaded.")); });
    if (Boolean(canAuthor())) {
      ensureEditors();
      editor.calendarDialog.removeEventListener("click", handleDialogClick);
      editor.calendarDialog.addEventListener("click", handleDialogClick);
    }
  }

  async function relatedChoices() {
    await load();
    const projects = new Map(data.projects.map((project) => [project.id, project]));
    return data.tasks.flatMap((task) => {
      const project = projects.get(task.projectId);
      return project ? [{ id: task.id, code: task.code, title: task.title, completed: Boolean(task.completedAt), archived: Boolean(task.archivedAt || project.archivedAt), project: { id: project.id, key: project.key, title: project.title, color: project.color } }] : [];
    });
  }

  return { mount, refresh: () => load(true).then(render), relatedChoices };
}
