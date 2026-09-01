const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,7}$/;
const TASK_CODE = /^([A-Z][A-Z0-9]{1,7})-(\d{4})-(\d{4})$/;
const PROJECT_STATUSES = new Set(["active", "paused", "completed"]);
const TASK_DAY_STATES = new Set(["planned", "completed", "partial", "no_progress"]);

function dateShift(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function singaporeDate() {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Singapore"
  }).formatToParts(new Date());
  const part = (type) => parts.find((candidate) => candidate.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function emptyData() {
  return {
    schemaVersion: 4,
    revision: "0",
    today: singaporeDate(),
    updatedAt: null,
    projects: [],
    tasks: [],
    taskDays: [],
    contributions: []
  };
}

function validTimestamp(value) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function validateData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== 4 || typeof value.revision !== "string"
    || !DATE.test(value.today || "") || !Array.isArray(value.projects)
    || !Array.isArray(value.tasks) || !Array.isArray(value.taskDays)
    || !Array.isArray(value.contributions)) {
    throw new TypeError("Task data is invalid.");
  }
  const projectIds = new Set();
  const projects = value.projects.map((project) => ({ ...project }));
  for (const project of projects) {
    if (!project || typeof project.id !== "string" || projectIds.has(project.id)
      || typeof project.title !== "string" || !PROJECT_STATUSES.has(project.status)
      || !PROJECT_KEY.test(project.key || "") || !/^#[0-9a-f]{6}$/i.test(project.color || "")) {
      throw new TypeError("Task data contains an invalid Project.");
    }
    projectIds.add(project.id);
  }
  const taskIds = new Set();
  const tasks = value.tasks.map((task) => ({ ...task }));
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || taskIds.has(task.id)
      || !projectIds.has(task.projectId) || typeof task.title !== "string"
      || typeof task.objective !== "string" || !Number.isInteger(task.position) || task.position < 0
      || !TASK_CODE.test(task.code || "")
      || (task.completedAt !== undefined && !validTimestamp(task.completedAt))) {
      throw new TypeError("Task data contains an invalid Task.");
    }
    taskIds.add(task.id);
  }
  const taskDayIds = new Set();
  const taskDatePairs = new Set();
  const taskDays = value.taskDays.map((taskDay) => ({ ...taskDay }));
  for (const taskDay of taskDays) {
    const pair = `${taskDay?.taskId}:${taskDay?.date}`;
    if (!taskDay || typeof taskDay.id !== "string" || taskDayIds.has(taskDay.id)
      || !taskIds.has(taskDay.taskId) || taskDatePairs.has(pair) || !DATE.test(taskDay.date || "")
      || typeof taskDay.plan !== "string" || !taskDay.plan.trim()
      || typeof taskDay.outcome !== "string" || !TASK_DAY_STATES.has(taskDay.state)
      || !Number.isInteger(taskDay.position) || taskDay.position < 0) {
      throw new TypeError("Task data contains an invalid Task Day.");
    }
    taskDayIds.add(taskDay.id);
    taskDatePairs.add(pair);
  }
  const contributionTaskIds = new Set();
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const contributions = value.contributions.map((contribution) => ({ ...contribution }));
  for (const contribution of contributions) {
    const task = tasksById.get(contribution?.taskId);
    const project = projectsById.get(contribution?.projectId);
    if (!contribution || !task || !project || contributionTaskIds.has(contribution.taskId)
      || !TASK_CODE.test(contribution.taskCode || "") || !PROJECT_KEY.test(contribution.projectKey || "")
      || typeof contribution.taskTitle !== "string" || typeof contribution.projectTitle !== "string"
      || !/^#[0-9a-f]{6}$/i.test(contribution.projectColor || "")
      || !validTimestamp(contribution.completedAt) || contribution.taskCode !== task.code
      || contribution.projectKey !== project.key) {
      throw new TypeError("Task data contains an invalid contribution.");
    }
    contributionTaskIds.add(contribution.taskId);
  }
  return {
    schemaVersion: 4,
    revision: value.revision,
    today: value.today,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    projects,
    tasks,
    taskDays,
    contributions
  };
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

function formatDay(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function dayLabel(value, today) {
  if (value === today) return "Today";
  if (value === dateShift(today, -1)) return "Yesterday";
  return formatDay(value);
}

function contributionMap(data) {
  const days = new Map();
  for (const contribution of data.contributions) {
    const date = contribution.completedAt.slice(0, 10);
    const entries = days.get(date) || [];
    entries.push(contribution);
    days.set(date, entries);
  }
  return days;
}

function contributionLevel(contributions) {
  return Math.min(4, contributions?.length || 0);
}

function currentStreak(data) {
  const days = contributionMap(data);
  let cursor = data.today;
  if (!days.get(cursor)?.length) cursor = dateShift(cursor, -1);
  let count = 0;
  while (days.get(cursor)?.length) {
    count += 1;
    cursor = dateShift(cursor, -1);
  }
  return count;
}

function formatCompletionTime(value) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Singapore"
  }).format(new Date(value));
}

function contributionPopoverContent(date, contributions) {
  const fragment = document.createDocumentFragment();
  const header = node("header", "task-contribution-popover-header");
  const day = node("time", "task-contribution-popover-date", formatDay(date));
  day.dateTime = date;
  header.append(day, node("span", "task-contribution-popover-count", `${contributions.length} completed`));
  const list = node("ul", "task-contribution-list");
  for (const contribution of contributions) {
    const item = node("li", "task-contribution-item");
    const heading = node("div", "task-contribution-heading");
    heading.append(
      node("span", "task-contribution-check", "✓"),
      node("span", "task-contribution-code", contribution.taskCode),
      node("time", "task-contribution-time", formatCompletionTime(contribution.completedAt))
    );
    const title = node("strong", "task-contribution-title", contribution.taskTitle);
    const meta = node("span", "task-contribution-project");
    const dot = node("span", "task-contribution-project-dot");
    dot.style.setProperty("--project-color", contribution.projectColor);
    meta.append(dot, document.createTextNode(`${contribution.projectKey} · ${contribution.projectTitle}`));
    item.append(heading, title, meta);
    list.append(item);
  }
  fragment.append(header, list);
  return fragment;
}

function heatmap(data) {
  const today = new Date(`${data.today}T00:00:00Z`);
  const daysUntilSaturday = (6 - today.getUTCDay() + 7) % 7;
  const end = dateShift(data.today, daysUntilSaturday);
  const start = dateShift(end, -(53 * 7 - 1));
  const section = node("section", "task-section task-contributions");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy");
  copy.append(node("h3", "task-panel-title", "Contributions"));
  const days = contributionMap(data);
  const displayed = data.contributions.filter((contribution) => {
    const date = contribution.completedAt.slice(0, 10);
    return date >= start && date <= data.today;
  });
  const streak = currentStreak(data);
  header.append(copy, node("span", "task-panel-meta", `${displayed.length} completed · ${streak} day streak`));

  const viewport = node("div", "task-heatmap-viewport");
  const graph = node("div", "task-heatmap");
  graph.setAttribute("role", "group");
  graph.setAttribute("aria-label", `Task contributions during the past year, ${displayed.length} completed`);
  const labels = node("div", "task-heatmap-weekdays");
  labels.setAttribute("aria-hidden", "true");
  labels.append(node("span", "", "Mon"), node("span", "", "Wed"), node("span", "", "Fri"));

  const popover = node("div", "task-contribution-popover");
  popover.id = "task-contribution-popover";
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "tooltip");
  const supportsPopover = typeof popover.showPopover === "function";
  let activeCell = null;
  let pinned = false;
  let fallbackOpen = false;
  let hideTimer = 0;
  const isOpen = () => supportsPopover ? popover.matches(":popover-open") : fallbackOpen;
  const clearHide = () => window.clearTimeout(hideTimer);
  const closePopover = () => {
    clearHide();
    activeCell?.setAttribute("aria-expanded", "false");
    activeCell = null;
    pinned = false;
    if (supportsPopover && isOpen()) popover.hidePopover();
    if (!supportsPopover) {
      fallbackOpen = false;
      popover.removeAttribute("data-open");
    }
  };
  const positionPopover = (cell) => {
    const anchor = cell.getBoundingClientRect();
    const panel = popover.getBoundingClientRect();
    const edge = 8;
    const left = Math.min(window.innerWidth - panel.width - edge,
      Math.max(edge, anchor.left + anchor.width / 2 - panel.width / 2));
    const above = anchor.top - panel.height - 10;
    const top = above >= edge ? above : Math.min(window.innerHeight - panel.height - edge, anchor.bottom + 10);
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(edge, top)}px`;
  };
  const showPopover = (cell, date, contributions, shouldPin = false) => {
    clearHide();
    if (activeCell && activeCell !== cell) activeCell.setAttribute("aria-expanded", "false");
    activeCell = cell;
    pinned = shouldPin;
    popover.replaceChildren(contributionPopoverContent(date, contributions));
    popover.style.visibility = "hidden";
    if (supportsPopover && !isOpen()) popover.showPopover();
    if (!supportsPopover) {
      fallbackOpen = true;
      popover.dataset.open = "true";
    }
    cell.setAttribute("aria-expanded", "true");
    positionPopover(cell);
    popover.style.visibility = "";
  };
  const scheduleHide = () => {
    clearHide();
    if (!pinned) hideTimer = window.setTimeout(closePopover, 140);
  };

  const weeks = node("div", "task-heatmap-weeks");
  for (let week = 0; week < 53; week += 1) {
    const column = node("div", "task-heatmap-week");
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = dateShift(start, week * 7 + weekday);
      const contributions = days.get(date) || [];
      const future = date > data.today;
      const active = !future && contributions.length > 0;
      const cell = node(active ? "button" : "span", "task-heatmap-cell");
      cell.dataset.level = future ? "future" : String(contributionLevel(contributions));
      if (active) {
        cell.type = "button";
        cell.setAttribute("aria-label", `${formatDay(date)}, ${contributions.length} completed`);
        cell.setAttribute("aria-controls", popover.id);
        cell.setAttribute("aria-expanded", "false");
        cell.addEventListener("mouseenter", () => { if (!pinned) showPopover(cell, date, contributions); });
        cell.addEventListener("mouseleave", scheduleHide);
        cell.addEventListener("focus", () => { if (!pinned) showPopover(cell, date, contributions); });
        cell.addEventListener("blur", scheduleHide);
        cell.addEventListener("click", () => {
          if (pinned && activeCell === cell) closePopover();
          else showPopover(cell, date, contributions, true);
        });
        cell.addEventListener("keydown", (event) => { if (event.key === "Escape") closePopover(); });
      } else if (!future) {
        cell.title = `${formatDay(date)} · No Task completed`;
      }
      column.append(cell);
    }
    weeks.append(column);
  }
  graph.append(labels, weeks);
  viewport.append(graph);
  const legend = node("div", "task-heatmap-legend");
  legend.append(node("span", "", "Less"));
  for (let level = 0; level <= 4; level += 1) {
    const swatch = node("span", "task-heatmap-cell");
    swatch.dataset.level = String(level);
    swatch.setAttribute("aria-hidden", "true");
    legend.append(swatch);
  }
  legend.append(node("span", "", "More"));
  popover.addEventListener("mouseenter", clearHide);
  popover.addEventListener("mouseleave", scheduleHide);
  popover.addEventListener("keydown", (event) => { if (event.key === "Escape") closePopover(); });
  popover.addEventListener("toggle", (event) => {
    if (event.newState === "closed") {
      activeCell?.setAttribute("aria-expanded", "false");
      activeCell = null;
      pinned = false;
    }
  });
  viewport.addEventListener("scroll", closePopover, { passive: true });
  section.append(header, viewport, legend, popover);
  return section;
}

function stateLabel(state, past = false) {
  if (state === "completed") return "Done today";
  if (state === "partial") return "Partial";
  if (state === "no_progress") return "No progress";
  return past ? "Needs review" : "Planned";
}

function taskStats(task, data) {
  const days = data.taskDays.filter((taskDay) => taskDay.taskId === task.id);
  const worked = days.filter((taskDay) => taskDay.state === "completed" || taskDay.state === "partial");
  const completed = days.filter((taskDay) => taskDay.state === "completed");
  const partial = days.filter((taskDay) => taskDay.state === "partial");
  const lastWorked = [...worked].sort((left, right) => right.date.localeCompare(left.date))[0]?.date || null;
  return { days, worked, completed, partial, lastWorked };
}

function taskMeta(task, data) {
  const stats = taskStats(task, data);
  if (task.completedAt) return `Completed ${formatDay(task.completedAt.slice(0, 10))}`;
  const today = stats.days.find((taskDay) => taskDay.date === data.today);
  if (today?.state === "planned") return "Planned today";
  if (today?.state === "no_progress") return "No progress today";
  if (stats.worked.length) {
    return `${stats.worked.length} work ${stats.worked.length === 1 ? "day" : "days"} · Last worked ${dayLabel(stats.lastWorked, data.today).toLocaleLowerCase()}`;
  }
  const pendingReviews = stats.days.filter((taskDay) => taskDay.date < data.today && taskDay.state === "planned").length;
  if (pendingReviews) return `${pendingReviews} ${pendingReviews === 1 ? "plan needs" : "plans need"} review`;
  if (stats.days.length) return "No progress recorded";
  return "Not started";
}

function todayTaskDayRow(taskDay, task, project, data, editable, index, total) {
  const item = node("li", "task-today-row");
  item.dataset.taskDayId = taskDay.id;
  item.dataset.taskId = task.id;
  const marker = editable ? button("", "quick-complete", "task-day-marker") : node("span", "task-day-marker");
  marker.dataset.state = taskDay.state;
  marker.setAttribute("aria-label", taskDay.state === "completed" ? `${task.title} completed today` : `Mark ${task.title} done today`);
  if (taskDay.state !== "planned") marker.dataset.taskAction = editable ? "review-day" : "";
  const copy = node("div", "task-today-copy");
  const heading = node("div", "task-row-heading");
  const title = button(task.title, "open-task", "task-row-title");
  title.dataset.taskCode = task.code;
  heading.append(node("span", "task-row-code", task.code), title);
  const plan = node("p", "task-day-plan", taskDay.plan);
  const meta = node("span", "task-row-meta");
  const dot = node("span", "task-project-dot");
  dot.style.setProperty("--project-color", project.color);
  meta.append(dot, document.createTextNode(`${project.title} · ${stateLabel(taskDay.state)}`));
  copy.append(heading, plan, meta);
  item.append(marker, copy);
  if (editable) {
    const actions = node("div", "task-row-actions");
    const review = button("Review", "review-day", "task-text-button");
    review.setAttribute("aria-label", `Review ${task.title} for today`);
    actions.append(review);
    if (index > 0) actions.append(button("↑", "move-day-up", "task-icon-button"));
    if (index < total - 1) actions.append(button("↓", "move-day-down", "task-icon-button"));
    item.append(actions);
  }
  return item;
}

function reviewPanel(data, editable) {
  const pending = data.taskDays
    .filter((taskDay) => taskDay.date < data.today && taskDay.state === "planned")
    .sort((left, right) => right.date.localeCompare(left.date) || left.position - right.position);
  if (!pending.length) return null;
  const section = node("section", "task-review-panel");
  const header = node("header", "task-review-header");
  header.append(
    node("strong", "task-review-title", `${pending.length} previous ${pending.length === 1 ? "plan needs" : "plans need"} review`),
    node("span", "task-review-note", "Past plans stay on their original day.")
  );
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const list = node("div", "task-review-list");
  for (const taskDay of pending) {
    const task = tasksById.get(taskDay.taskId);
    if (!task) continue;
    const row = node("div", "task-review-row");
    row.dataset.taskDayId = taskDay.id;
    const copy = node("span", "task-review-copy");
    copy.append(node("span", "task-review-date", dayLabel(taskDay.date, data.today)), document.createTextNode(task.title));
    row.append(copy);
    if (editable) row.append(button("Review", "review-day", "task-text-button"));
    list.append(row);
  }
  section.append(header, list);
  return section;
}

function todayPanel(data, editable) {
  const section = node("section", "task-section task-today");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy task-section-heading");
  const date = node("time", "task-section-date", formatDay(data.today));
  date.dateTime = data.today;
  copy.append(node("h3", "task-panel-title", "Today"), date);
  const days = data.taskDays.filter((taskDay) => taskDay.date === data.today)
    .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
  const completed = days.filter((taskDay) => taskDay.state === "completed").length;
  const partial = days.filter((taskDay) => taskDay.state === "partial").length;
  const tools = node("div", "task-panel-tools");
  tools.append(node("span", "task-panel-meta", `${days.length} planned · ${completed} done${partial ? ` · ${partial} partial` : ""}`));
  if (editable) tools.append(button("Add from Tasks", "add-from-tasks", "control-button task-section-action"));
  header.append(copy, tools);
  section.append(header);
  const review = reviewPanel(data, editable);
  if (review) section.append(review);
  if (!days.length) {
    const empty = node("div", "task-empty-compact");
    empty.append(node("strong", "", "Choose what deserves your attention today."));
    if (!editable) empty.append(node("span", "", "Nothing has been planned yet."));
    section.append(empty);
    return section;
  }
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const projectsById = new Map(data.projects.map((project) => [project.id, project]));
  const list = node("ul", "task-today-list");
  days.forEach((taskDay, index) => {
    const task = tasksById.get(taskDay.taskId);
    const project = task && projectsById.get(task.projectId);
    if (task && project) list.append(todayTaskDayRow(taskDay, task, project, data, editable, index, days.length));
  });
  section.append(list);
  return section;
}

function projectTaskRow(task, project, data, editable, focused = false) {
  const item = node("li", "task-row");
  item.dataset.taskId = task.id;
  item.dataset.taskCode = task.code;
  if (focused) {
    item.classList.add("task-row-focused");
    item.dataset.taskFocusTarget = "true";
    item.tabIndex = -1;
    item.setAttribute("aria-current", "true");
  }
  const copy = node("div", "task-row-copy");
  const heading = node("div", "task-row-heading");
  const title = button(task.title, "open-task", "task-row-title");
  title.dataset.taskCode = task.code;
  heading.append(node("span", "task-row-code", task.code), title);
  copy.append(heading, node("span", "task-row-meta", taskMeta(task, data)));
  item.append(copy);
  if (editable && !task.completedAt && project.status === "active") {
    const todayEntry = data.taskDays.find((taskDay) => taskDay.taskId === task.id && taskDay.date === data.today);
    const add = button(todayEntry ? "Today ✓" : "+ Today", todayEntry ? "review-day-for-task" : "add-task-today", "task-today-button");
    add.disabled = Boolean(todayEntry);
    item.append(add);
  }
  return item;
}

function projectCard(project, data, editable, focusedCode = "") {
  const card = node("article", "task-project-card");
  card.dataset.projectId = project.id;
  const head = node("div", "task-project-head");
  const identity = node("div", "task-project-identity");
  const dot = node("span", "task-project-dot");
  dot.style.setProperty("--project-color", project.color || "#2f855a");
  identity.append(dot, node("span", "task-project-key", project.key), node("h4", "task-project-title", project.title));
  head.append(identity, node("span", "task-project-status", project.status));
  card.append(head);
  if (project.description) card.append(node("p", "task-project-description", project.description));
  const open = data.tasks.filter((task) => task.projectId === project.id && !task.archivedAt && !task.completedAt)
    .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
  const completed = data.tasks.filter((task) => task.projectId === project.id && !task.archivedAt && task.completedAt)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  if (open.length) {
    const list = node("ul", "task-project-task-list");
    for (const task of open) list.append(projectTaskRow(task, project, data, editable, task.code === focusedCode));
    card.append(list);
  } else {
    card.append(node("p", "task-project-empty", "No open Tasks."));
  }
  if (completed.length) {
    const details = node("details", "task-completed-group");
    const summary = node("summary", "task-completed-summary", `${completed.length} completed`);
    const list = node("ul", "task-project-task-list task-completed-list");
    for (const task of completed) list.append(projectTaskRow(task, project, data, editable, task.code === focusedCode));
    details.append(summary, list);
    card.append(details);
  }
  if (editable) {
    const actions = node("div", "task-project-actions");
    actions.append(button("New Task", "new-project-task"), button("Edit Project", "edit-project"));
    card.append(actions);
  }
  return card;
}

function projectsPanel(data, editable, focusedCode = "") {
  const section = node("section", "task-section task-projects");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy");
  copy.append(node("h3", "task-panel-title", "Projects"));
  const focusedTask = data.tasks.find((task) => task.code === focusedCode);
  const projects = data.projects.filter((project) => !project.archivedAt || project.id === focusedTask?.projectId);
  const active = projects.filter((project) => project.status === "active");
  const tools = node("div", "task-panel-tools");
  tools.append(node("span", "task-panel-meta", `${active.length} active`));
  if (editable) tools.append(button("New Project", "new-project", "control-button task-section-action"));
  header.append(copy, tools);
  section.append(header);
  if (!projects.length) {
    section.append(node("p", "task-empty-compact", "Create a Project to build a durable Task pool."));
    return section;
  }
  const grid = node("div", "task-project-grid");
  const order = { active: 0, paused: 1, completed: 2 };
  projects.sort((left, right) => order[left.status] - order[right.status]
    || String(right.updatedAt).localeCompare(String(left.updatedAt)));
  for (const project of projects) grid.append(projectCard(project, data, editable, focusedCode));
  section.append(grid);
  return section;
}

function page(data, authoring, focusedCode = "") {
  const root = node("div", "task-page");
  root.append(node("h2", "visually-hidden", "Tasks"), heatmap(data));
  if (authoring.message) {
    const feedback = node("p", "task-feedback", authoring.message);
    feedback.dataset.kind = authoring.messageKind;
    feedback.setAttribute("role", authoring.messageKind === "error" ? "alert" : "status");
    root.append(feedback);
  }
  if (focusedCode && !data.tasks.some((task) => task.code === focusedCode)) {
    const notice = node("p", "task-feedback", `Task ${focusedCode} could not be found.`);
    notice.dataset.kind = "error";
    notice.setAttribute("role", "status");
    root.append(notice);
  }
  root.append(todayPanel(data, authoring.enabled), projectsPanel(data, authoring.enabled, focusedCode));
  return root;
}

function staticDialog(className, content) {
  const dialog = node("dialog", `editor-dialog ${className}`);
  dialog.innerHTML = content;
  document.body.append(dialog);
  return dialog;
}

function projectDialog() {
  return staticDialog("task-dialog", `<form class="journal-editor-form" method="dialog">
    <header class="dialog-header"><h2 class="dialog-title">Project</h2><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header>
    <div class="dialog-body">
      <label class="field-group"><span class="field-label">Title</span><input class="field-input" name="title" maxlength="120" required></label>
      <label class="field-group"><span class="field-label">Project key</span><input class="field-input task-key-input" name="key" maxlength="8" pattern="[A-Z][A-Z0-9]{1,7}" autocapitalize="characters"><span class="field-hint">Generated from the title. Fixed after creation.</span></label>
      <label class="field-group"><span class="field-label">Description</span><textarea class="field-input field-textarea task-small-textarea" name="description" maxlength="600"></textarea></label>
      <div class="task-dialog-grid">
        <label class="field-group"><span class="field-label">Color</span><input class="field-input task-color-input" name="color" type="color" value="#2f855a"></label>
        <label class="field-group"><span class="field-label">Status</span><select class="field-input" name="status"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
      </div>
      <p class="editor-message" role="status"></p>
    </div>
    <footer class="dialog-actions"><button class="control-button control-button-danger" type="button" data-project-archive hidden>Archive</button><span class="dialog-action-spacer"></span><button class="control-button" type="button" data-dialog-close>Cancel</button><button class="control-button control-button-primary" type="submit">Save</button></footer>
  </form>`);
}

function taskDialog() {
  return staticDialog("task-dialog", `<form class="journal-editor-form" method="dialog">
    <header class="dialog-header"><h2 class="dialog-title">Task</h2><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header>
    <div class="dialog-body">
      <label class="field-group"><span class="field-label">Project</span><select class="field-input" name="projectId" required></select></label>
      <label class="field-group"><span class="field-label">Title</span><input class="field-input" name="title" maxlength="180" required></label>
      <label class="field-group"><span class="field-label">Objective</span><textarea class="field-input field-textarea task-objective-input" name="objective" maxlength="2000" placeholder="What will be true when this Task is complete?"></textarea></label>
      <span class="field-hint" data-task-code-preview></span>
      <p class="editor-message" role="status"></p>
    </div>
    <footer class="dialog-actions"><span class="dialog-action-spacer"></span><button class="control-button" type="button" data-dialog-close>Cancel</button><button class="control-button control-button-primary" type="submit">Save</button></footer>
  </form>`);
}

function pickerDialog() {
  return staticDialog("task-picker-dialog", `<form class="journal-editor-form" method="dialog">
    <header class="dialog-header"><div><h2 class="dialog-title">Add to Today</h2><p class="task-dialog-subtitle">Choose a durable Task, then define today's concrete move.</p></div><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header>
    <div class="dialog-body">
      <label class="field-group"><span class="field-label">Find a Task</span><input class="field-input" name="search" type="search" placeholder="Search code, Task, or Project" autocomplete="off"></label>
      <div class="task-picker-options" role="listbox"></div>
      <div class="task-picker-plan" hidden>
        <div class="task-picker-selected"></div>
        <label class="field-group"><span class="field-label">Today's plan</span><textarea class="field-input field-textarea task-plan-input" name="plan" maxlength="600" placeholder="What will move this Task forward today?" required></textarea></label>
      </div>
      <p class="editor-message" role="status"></p>
    </div>
    <footer class="dialog-actions"><span class="dialog-action-spacer"></span><button class="control-button" type="button" data-dialog-close>Cancel</button><button class="control-button control-button-primary" type="submit" disabled>Add to Today</button></footer>
  </form>`);
}

function reviewDialog() {
  return staticDialog("task-review-dialog", `<form class="journal-editor-form" method="dialog">
    <header class="dialog-header"><div><h2 class="dialog-title">Review Task Day</h2><p class="task-dialog-subtitle" data-day-context></p></div><button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button></header>
    <div class="dialog-body">
      <label class="field-group"><span class="field-label">Plan</span><textarea class="field-input field-textarea task-plan-input" name="plan" maxlength="600" required></textarea></label>
      <label class="field-group"><span class="field-label">Result</span><select class="field-input" name="state"><option value="planned">Planned</option><option value="completed">Done today</option><option value="partial">Partial</option><option value="no_progress">No progress</option></select></label>
      <label class="field-group"><span class="field-label">Outcome</span><textarea class="field-input field-textarea task-outcome-input" name="outcome" maxlength="2000" placeholder="What actually moved forward?"></textarea><span class="field-hint">Required for Partial.</span></label>
      <label class="task-continue-control" hidden><input name="continueToday" type="checkbox"> <span>Continue this Task today</span></label>
      <label class="field-group task-next-plan" hidden><span class="field-label">Today's new plan</span><textarea class="field-input field-textarea task-plan-input" name="nextPlan" maxlength="600"></textarea></label>
      <p class="editor-message" role="status"></p>
    </div>
    <footer class="dialog-actions"><button class="control-button control-button-danger" type="button" data-day-remove hidden>Remove from Today</button><span class="dialog-action-spacer"></span><button class="control-button" type="button" data-dialog-close>Cancel</button><button class="control-button control-button-primary" type="submit">Save review</button></footer>
  </form>`);
}

function detailDialog() {
  return staticDialog("task-detail-dialog", `<div class="task-detail-shell"><header class="task-detail-header"><div data-detail-heading></div><button class="dialog-close" type="button" data-detail-close aria-label="Close Task details">×</button></header><div class="task-detail-body"></div></div>`);
}

export function createTasksController({ canAuthor = () => false, request, confirmAction } = {}) {
  let data = emptyData();
  let loading = null;
  let loaded = false;
  let root = null;
  let focusedCode = "";
  let revealedCode = "";
  let suppressDetailRoute = false;
  const authoring = { enabled: false, busy: false, message: "", messageKind: "status" };
  const editor = {
    projectDialog: null,
    projectForm: null,
    projectId: "",
    projectKeyManual: false,
    taskDialog: null,
    taskForm: null,
    taskId: "",
    pickerDialog: null,
    pickerForm: null,
    pickerTaskId: "",
    reviewDialog: null,
    reviewForm: null,
    reviewDayId: "",
    detailDialog: null
  };

  function render() {
    if (!root?.isConnected) return;
    authoring.enabled = Boolean(canAuthor());
    root.replaceChildren(page(data, authoring, focusedCode));
    syncDetail();
    if (!focusedCode || revealedCode === focusedCode) return;
    requestAnimationFrame(() => {
      const target = root?.querySelector("[data-task-focus-target]");
      if (!target) return;
      revealedCode = focusedCode;
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
      target.focus({ preventScroll: true });
    });
  }

  async function load(force = false) {
    if (loaded && !force) return data;
    if (loading) return loading;
    loading = fetch("/data/tasks", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) return emptyData();
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "Tasks could not be loaded.");
        return validateData(result);
      })
      .then((value) => {
        data = value;
        loaded = true;
        return value;
      })
      .finally(() => { loading = null; });
    return loading;
  }

  function dialogMessage(form, message, kind = "error") {
    const target = form.querySelector(".editor-message");
    target.textContent = message;
    target.dataset.kind = kind;
  }

  function setDialogBusy(form, busy) {
    for (const control of form.elements) control.disabled = busy;
  }

  function closeDialog(dialog) {
    if (dialog?.open && !authoring.busy) dialog.close();
  }

  function ensureDetail() {
    if (editor.detailDialog) return;
    editor.detailDialog = detailDialog();
    editor.detailDialog.querySelector("[data-detail-close]").addEventListener("click", () => editor.detailDialog.close());
    editor.detailDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      editor.detailDialog.close();
    });
    editor.detailDialog.addEventListener("close", () => {
      if (suppressDetailRoute) return;
      if (location.hash.startsWith("#task/")) location.hash = "task";
    });
    editor.detailDialog.addEventListener("click", handleDetailClick);
  }

  function ensureEditors() {
    if (editor.projectDialog) return;
    editor.projectDialog = projectDialog();
    editor.projectForm = editor.projectDialog.querySelector("form");
    editor.taskDialog = taskDialog();
    editor.taskForm = editor.taskDialog.querySelector("form");
    editor.pickerDialog = pickerDialog();
    editor.pickerForm = editor.pickerDialog.querySelector("form");
    editor.reviewDialog = reviewDialog();
    editor.reviewForm = editor.reviewDialog.querySelector("form");
    for (const dialog of [editor.projectDialog, editor.taskDialog, editor.pickerDialog, editor.reviewDialog]) {
      for (const control of dialog.querySelectorAll("[data-dialog-close]")) {
        control.addEventListener("click", () => closeDialog(dialog));
      }
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeDialog(dialog);
      });
    }
    editor.projectForm.addEventListener("submit", saveProject);
    editor.taskForm.addEventListener("submit", saveTask);
    editor.pickerForm.addEventListener("submit", savePickedTaskDay);
    editor.reviewForm.addEventListener("submit", saveDayReview);
    editor.projectForm.elements.title.addEventListener("input", updateProjectKeySuggestion);
    editor.projectForm.elements.key.addEventListener("input", () => {
      editor.projectKeyManual = Boolean(editor.projectForm.elements.key.value.trim());
      editor.projectForm.elements.key.value = editor.projectForm.elements.key.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    });
    editor.projectDialog.querySelector("[data-project-archive]").addEventListener("click", archiveProject);
    editor.pickerForm.elements.search.addEventListener("input", renderPickerOptions);
    editor.pickerDialog.querySelector(".task-picker-options").addEventListener("click", (event) => {
      const option = event.target.closest("[data-picker-task-id]");
      if (option) selectPickerTask(option.dataset.pickerTaskId);
    });
    editor.reviewForm.elements.continueToday.addEventListener("change", updateContinueFields);
    editor.reviewDialog.querySelector("[data-day-remove]").addEventListener("click", removeReviewedDay);
  }

  function updateProjectKeySuggestion() {
    if (editor.projectId || editor.projectKeyManual) return;
    editor.projectForm.elements.key.value = suggestProjectKey(editor.projectForm.elements.title.value, data.projects);
  }

  function projectKeyBase(title) {
    const words = String(title || "").normalize("NFKD").match(/[A-Za-z0-9]+/g) || [];
    if (!words.length) return null;
    let base = words.length > 1 ? words.map((word) => word[0]).join("") : words[0].slice(0, 4);
    base = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]/.test(base)) base = `P${base}`;
    if (base.length < 2) base = `${base}P`;
    return base.slice(0, 8);
  }

  function suggestProjectKey(title, projects) {
    const used = new Set(projects.map((project) => project.key));
    const base = projectKeyBase(title);
    if (!base) return "";
    if (!used.has(base)) return base;
    for (let suffix = 2; suffix <= 9999; suffix += 1) {
      const digits = String(suffix);
      const candidate = `${base.slice(0, 8 - digits.length)}${digits}`;
      if (!used.has(candidate)) return candidate;
    }
    return "";
  }

  function openProject(project = null) {
    if (!canAuthor()) return;
    ensureEditors();
    editor.projectId = project?.id || "";
    editor.projectKeyManual = false;
    editor.projectForm.reset();
    editor.projectForm.elements.title.value = project?.title || "";
    editor.projectForm.elements.key.value = project?.key || "";
    editor.projectForm.elements.key.disabled = Boolean(project);
    editor.projectForm.elements.description.value = project?.description || "";
    editor.projectForm.elements.color.value = project?.color || "#2f855a";
    editor.projectForm.elements.status.value = project?.status || "active";
    editor.projectDialog.querySelector(".dialog-title").textContent = project ? "Edit Project" : "New Project";
    editor.projectDialog.querySelector("[data-project-archive]").hidden = !project;
    dialogMessage(editor.projectForm, "", "status");
    updateProjectKeySuggestion();
    editor.projectDialog.showModal();
    editor.projectForm.elements.title.focus();
  }

  function openTask(task = null, projectId = "") {
    if (!canAuthor()) return;
    ensureEditors();
    editor.taskId = task?.id || "";
    editor.taskForm.reset();
    const select = editor.taskForm.elements.projectId;
    select.replaceChildren();
    for (const project of data.projects.filter((candidate) => !candidate.archivedAt)) {
      const option = node("option", "", `${project.key} · ${project.title}`);
      option.value = project.id;
      select.append(option);
    }
    select.value = task?.projectId || projectId || select.options[0]?.value || "";
    editor.taskForm.elements.title.value = task?.title || "";
    editor.taskForm.elements.objective.value = task?.objective || "";
    editor.taskDialog.querySelector(".dialog-title").textContent = task ? "Edit Task" : "New Task";
    editor.taskDialog.querySelector("[data-task-code-preview]").textContent = task
      ? `Code ${task.code} · Fixed after creation`
      : "A permanent Task code will be created automatically.";
    dialogMessage(editor.taskForm, "", "status");
    editor.taskDialog.showModal();
    editor.taskForm.elements.title.focus();
  }

  function availablePickerTasks() {
    const todayIds = new Set(data.taskDays.filter((taskDay) => taskDay.date === data.today).map((taskDay) => taskDay.taskId));
    const projects = new Map(data.projects.map((project) => [project.id, project]));
    return data.tasks.filter((task) => {
      const project = projects.get(task.projectId);
      return !task.archivedAt && !task.completedAt && !todayIds.has(task.id) && project?.status === "active" && !project.archivedAt;
    }).sort((left, right) => {
      const leftStats = taskStats(left, data);
      const rightStats = taskStats(right, data);
      return String(rightStats.lastWorked || "").localeCompare(String(leftStats.lastWorked || ""))
        || left.position - right.position;
    });
  }

  function openPicker(taskId = "") {
    if (!canAuthor()) return;
    ensureEditors();
    editor.pickerTaskId = "";
    editor.pickerForm.reset();
    editor.pickerDialog.querySelector(".task-picker-plan").hidden = true;
    editor.pickerForm.querySelector('[type="submit"]').disabled = true;
    dialogMessage(editor.pickerForm, "", "status");
    renderPickerOptions();
    editor.pickerDialog.showModal();
    if (taskId) selectPickerTask(taskId);
    else editor.pickerForm.elements.search.focus();
  }

  function renderPickerOptions() {
    if (!editor.pickerDialog) return;
    const query = editor.pickerForm.elements.search.value.trim().toLocaleLowerCase();
    const projects = new Map(data.projects.map((project) => [project.id, project]));
    const matches = availablePickerTasks().filter((task) => {
      const project = projects.get(task.projectId);
      return !query || [task.code, task.title, task.objective, project?.key, project?.title]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(query);
    }).slice(0, 10);
    const list = editor.pickerDialog.querySelector(".task-picker-options");
    list.replaceChildren();
    if (!matches.length) {
      list.append(node("p", "task-picker-empty", query ? "No matching open Tasks." : "Every open Task is already in Today."));
      return;
    }
    for (const task of matches) {
      const project = projects.get(task.projectId);
      const option = node("button", "task-picker-option");
      option.type = "button";
      option.dataset.pickerTaskId = task.id;
      option.setAttribute("role", "option");
      const heading = node("span", "task-picker-option-heading");
      const dot = node("span", "task-project-dot");
      dot.style.setProperty("--project-color", project.color);
      heading.append(dot, node("span", "task-row-code", task.code), node("strong", "", task.title));
      option.append(heading, node("span", "task-picker-option-meta", `${project.title} · ${taskMeta(task, data)}`));
      list.append(option);
    }
  }

  function selectPickerTask(id) {
    const task = availablePickerTasks().find((candidate) => candidate.id === id);
    if (!task) return;
    const project = data.projects.find((candidate) => candidate.id === task.projectId);
    editor.pickerTaskId = id;
    const selected = editor.pickerDialog.querySelector(".task-picker-selected");
    selected.replaceChildren();
    const dot = node("span", "task-project-dot");
    dot.style.setProperty("--project-color", project.color);
    selected.append(dot, node("span", "task-row-code", task.code), node("strong", "", task.title));
    editor.pickerDialog.querySelector(".task-picker-plan").hidden = false;
    editor.pickerForm.querySelector('[type="submit"]').disabled = false;
    editor.pickerForm.elements.plan.value = "";
    editor.pickerForm.elements.plan.focus();
  }

  function openDay(taskDay) {
    if (!canAuthor()) return;
    ensureEditors();
    const task = data.tasks.find((candidate) => candidate.id === taskDay.taskId);
    const project = task && data.projects.find((candidate) => candidate.id === task.projectId);
    if (!task || !project) return;
    editor.reviewDayId = taskDay.id;
    editor.reviewForm.reset();
    editor.reviewForm.elements.plan.value = taskDay.plan;
    editor.reviewForm.elements.state.value = taskDay.state;
    editor.reviewForm.elements.outcome.value = taskDay.outcome;
    editor.reviewDialog.querySelector("[data-day-context]").textContent = `${dayLabel(taskDay.date, data.today)} · ${task.code} · ${task.title}`;
    const canContinue = taskDay.date < data.today && !task.completedAt && !task.archivedAt
      && !data.taskDays.some((candidate) => candidate.taskId === task.id && candidate.date === data.today);
    editor.reviewDialog.querySelector(".task-continue-control").hidden = !canContinue;
    editor.reviewDialog.querySelector("[data-day-remove]").hidden = !(taskDay.date === data.today && taskDay.state === "planned" && !taskDay.outcome);
    updateContinueFields();
    dialogMessage(editor.reviewForm, "", "status");
    editor.reviewDialog.showModal();
    editor.reviewForm.elements.plan.focus();
  }

  function updateContinueFields() {
    if (!editor.reviewDialog) return;
    const enabled = editor.reviewForm.elements.continueToday.checked;
    const group = editor.reviewDialog.querySelector(".task-next-plan");
    group.hidden = !enabled;
    editor.reviewForm.elements.nextPlan.required = enabled;
    if (enabled && !editor.reviewForm.elements.nextPlan.value) {
      editor.reviewForm.elements.nextPlan.value = editor.reviewForm.elements.plan.value;
    }
  }

  async function send(payload, form = null) {
    if (authoring.busy) return null;
    authoring.busy = true;
    if (form) setDialogBusy(form, true);
    try {
      const result = request
        ? await request(payload)
        : await fetch("/api/tasks/save", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }).then(async (response) => {
            const value = await response.json().catch(() => null);
            if (!response.ok) throw new Error(value?.error || "Task changes could not be saved.");
            return value;
          });
      data = validateData(result);
      loaded = true;
      authoring.message = result.status === "unchanged" ? "Nothing changed." : "Task workspace updated.";
      authoring.messageKind = "status";
      return result;
    } catch (error) {
      const message = error?.message || "Task changes could not be saved.";
      authoring.message = message;
      authoring.messageKind = "error";
      if (form) dialogMessage(form, message);
      if (/changed|revision/i.test(message)) {
        loaded = false;
        await load(true).catch(() => {});
      }
      return null;
    } finally {
      authoring.busy = false;
      if (form) setDialogBusy(form, false);
      render();
    }
  }

  async function saveProject(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const result = await send({
      mode: editor.projectId ? "updateProject" : "createProject",
      baseRevision: data.revision,
      project: {
        ...(editor.projectId ? { id: editor.projectId } : { key: form.elements.key.value }),
        title: form.elements.title.value,
        description: form.elements.description.value,
        color: form.elements.color.value,
        status: form.elements.status.value
      }
    }, form);
    if (result) editor.projectDialog.close();
  }

  async function saveTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const result = await send({
      mode: editor.taskId ? "updateTask" : "createTask",
      baseRevision: data.revision,
      task: {
        ...(editor.taskId ? { id: editor.taskId } : {}),
        projectId: form.elements.projectId.value,
        title: form.elements.title.value,
        objective: form.elements.objective.value
      }
    }, form);
    if (result) editor.taskDialog.close();
  }

  async function savePickedTaskDay(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !editor.pickerTaskId) return;
    const result = await send({
      mode: "createTaskDay",
      baseRevision: data.revision,
      taskDay: { taskId: editor.pickerTaskId, plan: form.elements.plan.value }
    }, form);
    if (result) editor.pickerDialog.close();
  }

  async function saveDayReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (form.elements.state.value === "partial" && !form.elements.outcome.value.trim()) {
      dialogMessage(form, "Partial work needs a short outcome.");
      form.elements.outcome.focus();
      return;
    }
    const result = await send({
      mode: "updateTaskDay",
      baseRevision: data.revision,
      taskDay: {
        id: editor.reviewDayId,
        plan: form.elements.plan.value,
        outcome: form.elements.outcome.value,
        state: form.elements.state.value,
        continueToday: form.elements.continueToday.checked,
        nextPlan: form.elements.nextPlan.value
      }
    }, form);
    if (result) editor.reviewDialog.close();
  }

  async function archiveProject() {
    const project = data.projects.find((candidate) => candidate.id === editor.projectId);
    if (!project) return;
    const approved = confirmAction
      ? await confirmAction("Archive Project", `Archive “${project.title}” and its open Tasks? History will remain available.`, "Archive")
      : window.confirm(`Archive “${project.title}”?`);
    if (!approved) return;
    const result = await send({ mode: "archiveProject", baseRevision: data.revision, project: { id: project.id } }, editor.projectForm);
    if (result) editor.projectDialog.close();
  }

  async function removeReviewedDay() {
    const day = data.taskDays.find((candidate) => candidate.id === editor.reviewDayId);
    if (!day) return;
    const result = await send({ mode: "removeTaskDay", baseRevision: data.revision, taskDay: { id: day.id } }, editor.reviewForm);
    if (result) editor.reviewDialog.close();
  }

  async function quickComplete(day) {
    await send({
      mode: "updateTaskDay",
      baseRevision: data.revision,
      taskDay: { id: day.id, plan: day.plan, outcome: day.outcome, state: "completed" }
    });
  }

  async function moveDay(day, direction) {
    const ordered = data.taskDays.filter((candidate) => candidate.date === data.today)
      .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
    const index = ordered.findIndex((candidate) => candidate.id === day.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await send({
      mode: "reorderTaskDays",
      baseRevision: data.revision,
      taskDay: { ids: ordered.map((candidate) => candidate.id) }
    });
  }

  function openTaskRoute(task) {
    if (!task) return;
    location.hash = `task/${task.code}`;
  }

  function detailStat(label, value) {
    const item = node("div", "task-detail-stat");
    item.append(node("strong", "", value), node("span", "", label));
    return item;
  }

  function syncDetail() {
    ensureDetail();
    const task = data.tasks.find((candidate) => candidate.code === focusedCode);
    if (!task) {
      if (editor.detailDialog.open) {
        suppressDetailRoute = true;
        editor.detailDialog.close();
        suppressDetailRoute = false;
      }
      return;
    }
    const project = data.projects.find((candidate) => candidate.id === task.projectId);
    const stats = taskStats(task, data);
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
    if (authoring.enabled) {
      const todayEntry = data.taskDays.find((taskDay) => taskDay.taskId === task.id && taskDay.date === data.today);
      if (!task.completedAt && !task.archivedAt && project.status === "active" && !todayEntry) {
        const add = button("Add to Today", "detail-add-today", "control-button control-button-primary");
        add.dataset.taskId = task.id;
        actions.append(add);
      }
      actions.append(button("Edit", "detail-edit-task", "control-button"));
      actions.append(button(task.completedAt ? "Reopen" : "Complete Task", task.completedAt ? "detail-reopen-task" : "detail-complete-task", "control-button"));
      actions.append(button("Archive", "detail-archive-task", "task-text-button task-danger-button"));
    }
    if (actions.childElementCount) body.append(actions);
    const statsGrid = node("div", "task-detail-stats");
    statsGrid.append(
      detailStat("Days planned", String(stats.days.length)),
      detailStat("Days worked", String(stats.worked.length)),
      detailStat("Goals completed", String(stats.completed.length)),
      detailStat("Partial days", String(stats.partial.length))
    );
    body.append(statsGrid);
    const activity = node("section", "task-detail-history");
    activity.append(node("h3", "task-detail-section-title", "Work history"));
    if (!stats.days.length) {
      activity.append(node("p", "task-detail-empty", "No daily plans yet."));
    } else {
      const list = node("ol", "task-history-list");
      for (const taskDay of [...stats.days].sort((left, right) => right.date.localeCompare(left.date))) {
        const item = node("li", "task-history-item");
        item.dataset.taskDayId = taskDay.id;
        const top = node("div", "task-history-heading");
        top.append(node("time", "", dayLabel(taskDay.date, data.today)), node("span", `task-day-state task-day-state-${taskDay.state}`, stateLabel(taskDay.state, taskDay.date < data.today)));
        item.append(top, node("p", "task-history-plan", taskDay.plan));
        if (taskDay.outcome) item.append(node("p", "task-history-outcome", taskDay.outcome));
        if (authoring.enabled) item.append(button("Review", "detail-review-day", "task-text-button"));
        list.append(item);
      }
      activity.append(list);
    }
    body.append(activity);
    if (!editor.detailDialog.open) editor.detailDialog.showModal();
  }

  async function handleDetailClick(event) {
    const control = event.target.closest("[data-task-action]");
    if (!control) return;
    const task = data.tasks.find((candidate) => candidate.code === focusedCode);
    if (!task) return;
    const action = control.dataset.taskAction;
    if (action === "detail-add-today") openPicker(task.id);
    if (action === "detail-edit-task") openTask(task);
    if (action === "detail-review-day") {
      const day = data.taskDays.find((candidate) => candidate.id === control.closest("[data-task-day-id]")?.dataset.taskDayId);
      if (day) openDay(day);
    }
    if (action === "detail-reopen-task") {
      await send({ mode: "reopenTask", baseRevision: data.revision, task: { id: task.id } });
    }
    if (action === "detail-complete-task") {
      const approved = confirmAction
        ? await confirmAction("Complete Task", `Complete “${task.title}” and add it to Contributions?`, "Complete")
        : window.confirm(`Complete “${task.title}”?`);
      if (approved) await send({ mode: "completeTask", baseRevision: data.revision, task: { id: task.id } });
    }
    if (action === "detail-archive-task") {
      const approved = confirmAction
        ? await confirmAction("Archive Task", `Archive “${task.title}”? Its work history will remain available.`, "Archive")
        : window.confirm(`Archive “${task.title}”?`);
      if (approved) {
        const result = await send({ mode: "archiveTask", baseRevision: data.revision, task: { id: task.id } });
        if (result) location.hash = "task";
      }
    }
  }

  function handleClick(event) {
    const control = event.target.closest("[data-task-action]");
    if (!control) return;
    const action = control.dataset.taskAction;
    const projectId = control.closest("[data-project-id]")?.dataset.projectId || "";
    const taskId = control.closest("[data-task-id]")?.dataset.taskId || "";
    const taskDayId = control.closest("[data-task-day-id]")?.dataset.taskDayId || "";
    const project = data.projects.find((candidate) => candidate.id === projectId);
    const task = data.tasks.find((candidate) => candidate.id === taskId || candidate.code === control.dataset.taskCode);
    const taskDay = data.taskDays.find((candidate) => candidate.id === taskDayId);
    if (action === "open-task") openTaskRoute(task);
    if (!canAuthor()) return;
    if (action === "new-project") openProject();
    if (action === "new-project-task") openTask(null, projectId);
    if (action === "edit-project" && project) openProject(project);
    if (action === "add-from-tasks") openPicker();
    if (action === "add-task-today" && task) openPicker(task.id);
    if (action === "review-day" && taskDay) openDay(taskDay);
    if (action === "quick-complete" && taskDay) void quickComplete(taskDay);
    if (action === "move-day-up" && taskDay) void moveDay(taskDay, -1);
    if (action === "move-day-down" && taskDay) void moveDay(taskDay, 1);
  }

  function mount(element, taskCode = "") {
    if (root !== element) {
      root?.removeEventListener("click", handleClick);
      root = element;
      root.addEventListener("click", handleClick);
    }
    const nextFocusedCode = TASK_CODE.test(taskCode) ? taskCode : "";
    if (nextFocusedCode !== focusedCode) revealedCode = "";
    focusedCode = nextFocusedCode;
    render();
    void load().then(render).catch(() => {
      if (!root?.isConnected) return;
      root.replaceChildren(node("p", "empty-state", "Task data could not be loaded."));
    });
  }

  async function relatedChoices() {
    await load();
    const projects = new Map(data.projects.map((project) => [project.id, project]));
    return data.tasks.flatMap((task) => {
      const project = projects.get(task.projectId);
      if (!project) return [];
      return [{
        id: task.id,
        code: task.code,
        title: task.title,
        completed: Boolean(task.completedAt),
        archived: Boolean(task.archivedAt || project.archivedAt),
        project: { id: project.id, key: project.key, title: project.title, color: project.color }
      }];
    });
  }

  return { mount, refresh: () => load(true).then(render), relatedChoices };
}
