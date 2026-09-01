const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,7}$/;
const TASK_CODE = /^([A-Z][A-Z0-9]{1,7})-(\d{4})-(\d{4})$/;
const PROJECT_STATUSES = new Set(["active", "paused", "completed"]);
const TASK_STATUSES = new Set(["todo", "in_progress", "done"]);

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
    schemaVersion: 3,
    revision: "0",
    today: singaporeDate(),
    updatedAt: null,
    projects: [],
    tasks: [],
    contributions: []
  };
}

function timestampYear(value) {
  return new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Singapore" })
    .format(new Date(value));
}

function projectKeyBase(title) {
  const words = String(title || "").normalize("NFKD").match(/[A-Za-z0-9]+/g) || [];
  if (!words.length) return null;
  let base = words.length > 1
    ? words.map((word) => word[0]).join("")
    : words[0].slice(0, 4);
  base = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]/.test(base)) base = `P${base}`;
  if (base.length < 2) base = `${base}P`;
  return base.slice(0, 8);
}

function suggestProjectKey(title, projects) {
  const used = new Set(projects.map((project) => project.key).filter(Boolean));
  const base = projectKeyBase(title);
  if (!base) {
    for (let sequence = 1; sequence <= 9999; sequence += 1) {
      const candidate = `P${String(sequence).padStart(2, "0")}`;
      if (!used.has(candidate)) return candidate;
    }
    return "";
  }
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const digits = String(suffix);
    const candidate = `${base.slice(0, 8 - digits.length)}${digits}`;
    if (!used.has(candidate)) return candidate;
  }
  return "";
}

function nextTaskCode(project, createdAt, tasks) {
  if (!project) return "";
  const prefix = `${project.key}-${timestampYear(createdAt)}-`;
  const sequence = tasks.reduce((maximum, task) => task.code?.startsWith(prefix)
    ? Math.max(maximum, Number(task.code.slice(prefix.length)) || 0)
    : maximum, 0) + 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

function migrateIdentifiers(projects, tasks) {
  const assignedProjects = [];
  for (const project of [...projects].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt))
    || left.id.localeCompare(right.id))) {
    project.key = suggestProjectKey(project.title, assignedProjects);
    assignedProjects.push(project);
  }
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const assignedTasks = [];
  for (const task of [...tasks].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt))
    || left.id.localeCompare(right.id))) {
    task.code = nextTaskCode(projectsById.get(task.projectId), task.createdAt, assignedTasks);
    assignedTasks.push(task);
  }
}

function validTimestamp(value) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function contributionSnapshot(task, project) {
  return {
    taskId: task.id,
    taskCode: task.code,
    taskTitle: task.title,
    projectId: project.id,
    projectKey: project.key,
    projectTitle: project.title,
    projectColor: project.color,
    completedAt: task.completedAt
  };
}

function migrateContributions(projects, tasks) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  return tasks
    .filter((task) => validTimestamp(task.completedAt))
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id))
    .map((task) => contributionSnapshot(task, projectsById.get(task.projectId)));
}

function validateData(value) {
  const schemaVersion = Number(value?.schemaVersion);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![1, 2, 3].includes(schemaVersion) || typeof value.revision !== "string"
    || !DATE.test(value.today || "") || !Array.isArray(value.projects)
    || !Array.isArray(value.tasks)
    || (schemaVersion < 3 && !Array.isArray(value.activity))
    || (schemaVersion === 3 && !Array.isArray(value.contributions))) {
    throw new TypeError("Task data is invalid.");
  }
  const projectIds = new Set();
  const projects = value.projects.map((project) => ({ ...project }));
  for (const project of projects) {
    if (!project || typeof project.id !== "string" || projectIds.has(project.id)
      || typeof project.title !== "string" || !PROJECT_STATUSES.has(project.status)
      || !/^#[0-9a-f]{6}$/i.test(project.color || "")
      || (schemaVersion >= 2 && !PROJECT_KEY.test(project.key || ""))) {
      throw new TypeError("Task data contains an invalid project.");
    }
    projectIds.add(project.id);
  }
  const taskIds = new Set();
  const tasks = value.tasks.map((task) => ({ ...task }));
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || taskIds.has(task.id)
      || !projectIds.has(task.projectId) || typeof task.title !== "string"
      || !TASK_STATUSES.has(task.status)
      || (schemaVersion >= 2 && !TASK_CODE.test(task.code || ""))
      || (task.completedAt !== undefined && !validTimestamp(task.completedAt))
      || (task.scheduledDate !== null && !DATE.test(task.scheduledDate || ""))) {
      throw new TypeError("Task data contains an invalid task.");
    }
    taskIds.add(task.id);
  }
  if (schemaVersion === 1) migrateIdentifiers(projects, tasks);
  if (new Set(projects.map((project) => project.key)).size !== projects.length
    || new Set(tasks.map((task) => task.code)).size !== tasks.length) {
    throw new TypeError("Task data contains duplicate identifiers.");
  }
  if (schemaVersion < 3) {
    for (const day of value.activity) {
      if (!day || !DATE.test(day.date || "") || !Number.isInteger(day.updates)
        || !Number.isInteger(day.completions) || !Number.isFinite(day.score)) {
        throw new TypeError("Task data contains invalid activity.");
      }
    }
  }
  const contributions = schemaVersion === 3
    ? value.contributions.map((contribution) => ({ ...contribution }))
    : migrateContributions(projects, tasks);
  const contributionTaskIds = new Set();
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  for (const contribution of contributions) {
    const task = tasksById.get(contribution?.taskId);
    const project = projectsById.get(contribution?.projectId);
    if (!contribution || !taskIds.has(contribution.taskId) || contributionTaskIds.has(contribution.taskId)
      || !TASK_CODE.test(contribution.taskCode || "") || !projectIds.has(contribution.projectId)
      || !PROJECT_KEY.test(contribution.projectKey || "") || typeof contribution.taskTitle !== "string"
      || typeof contribution.projectTitle !== "string" || !/^#[0-9a-f]{6}$/i.test(contribution.projectColor || "")
      || !validTimestamp(contribution.completedAt) || contribution.taskCode !== task?.code
      || contribution.projectKey !== project?.key) {
      throw new TypeError("Task data contains an invalid contribution.");
    }
    contributionTaskIds.add(contribution.taskId);
  }
  return {
    schemaVersion: 3,
    revision: value.revision,
    today: value.today,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    projects,
    tasks,
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

function taskCompletedToday(task, today) {
  return task.status === "done" && typeof task.completedAt === "string"
    && task.completedAt.slice(0, 10) === today;
}

function todayTasks(data) {
  return data.tasks
    .filter((task) => !task.archivedAt && (
      taskCompletedToday(task, data.today)
      || (task.status !== "done" && task.scheduledDate && task.scheduledDate <= data.today)
    ))
    .sort((left, right) => {
      if (left.status === "done" && right.status !== "done") return 1;
      if (right.status === "done" && left.status !== "done") return -1;
      if (left.priority !== right.priority) return left.priority === "high" ? -1 : 1;
      return String(left.scheduledDate).localeCompare(String(right.scheduledDate));
    });
}

function contributionPopoverContent(date, contributions) {
  const fragment = document.createDocumentFragment();
  const header = node("header", "task-contribution-popover-header");
  const day = node("time", "task-contribution-popover-date", formatDay(date));
  day.dateTime = date;
  header.append(
    day,
    node("span", "task-contribution-popover-count", `${contributions.length} completed`)
  );
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
  header.append(copy, node(
    "span",
    "task-panel-meta",
    `${displayed.length} completed · ${streak} day streak`
  ));

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
    const left = Math.min(
      window.innerWidth - panel.width - edge,
      Math.max(edge, anchor.left + anchor.width / 2 - panel.width / 2)
    );
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
        cell.addEventListener("mouseenter", () => {
          if (!pinned) showPopover(cell, date, contributions);
        });
        cell.addEventListener("mouseleave", scheduleHide);
        cell.addEventListener("focus", () => {
          if (!pinned) showPopover(cell, date, contributions);
        });
        cell.addEventListener("blur", scheduleHide);
        cell.addEventListener("click", () => {
          if (pinned && activeCell === cell) closePopover();
          else showPopover(cell, date, contributions, true);
        });
        cell.addEventListener("keydown", (event) => {
          if (event.key === "Escape") closePopover();
        });
      } else if (!future) {
        cell.title = `${formatDay(date)} · No task completed`;
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
  popover.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });
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

function taskRow(task, project, data, editable, focused = false) {
  const item = node("li", "task-row");
  item.dataset.taskId = task.id;
  item.dataset.taskCode = task.code;
  if (focused) {
    item.classList.add("task-row-focused");
    item.dataset.taskFocusTarget = "true";
    item.tabIndex = -1;
    item.setAttribute("aria-current", "true");
  }
  const marker = editable ? button("", "toggle-task", "task-check") : node("span", "task-check");
  marker.dataset.status = task.status;
  marker.setAttribute("aria-label", task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`);
  const copy = node("div", "task-row-copy");
  const title = node(editable ? "button" : "strong", "task-row-title", task.title);
  if (editable) {
    title.type = "button";
    title.dataset.taskAction = "edit-task";
  }
  const heading = node("div", "task-row-heading");
  heading.append(node("span", "task-row-code", task.code), title);
  copy.append(heading);
  const meta = [
    project?.title,
    task.priority === "high" ? "High priority" : null,
    task.scheduledDate && task.scheduledDate < data.today && task.status !== "done" ? "Overdue" : null,
    task.scheduledDate === data.today ? "Today" : null,
    task.status === "in_progress" ? "In progress" : null
  ].filter(Boolean).join(" · ");
  if (meta) copy.append(node("span", "task-row-meta", meta));
  item.append(marker, copy);
  return item;
}

function todayPanel(data, editable) {
  const section = node("section", "task-section task-today");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy task-section-heading");
  const date = node("time", "task-section-date", formatDay(data.today));
  date.dateTime = data.today;
  copy.append(node("h3", "task-panel-title", "Today"), date);
  const tasks = todayTasks(data);
  const completed = tasks.filter((task) => taskCompletedToday(task, data.today)).length;
  const tools = node("div", "task-panel-tools");
  tools.append(node("span", "task-panel-meta", `${completed}/${tasks.length} done`));
  if (editable) {
    const newTask = button("New task", "new-task", "control-button task-section-action");
    newTask.disabled = !data.projects.some((project) => !project.archivedAt);
    tools.append(newTask);
  }
  header.append(copy, tools);
  section.append(header);

  if (!tasks.length) {
    const empty = node("div", "task-empty-compact");
    empty.append(node("strong", "", "Nothing scheduled."));
    section.append(empty);
    return section;
  }

  const list = node("ul", "task-list");
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  for (const task of tasks) list.append(taskRow(task, projects.get(task.projectId), data, editable));
  section.append(list);
  return section;
}

function projectCard(project, data, editable, focusedCode = "") {
  const card = node("article", "task-project-card");
  card.dataset.projectId = project.id;
  const head = node("div", "task-project-head");
  const identity = node("div", "task-project-identity");
  const dot = node("span", "task-project-dot");
  dot.style.setProperty("--project-color", project.color || "#2f855a");
  identity.append(dot, node("span", "task-project-key", project.key), node("h4", "task-project-title", project.title));
  const status = node("span", "task-project-status", project.status);
  head.append(identity, status);
  card.append(head);
  if (project.description) card.append(node("p", "task-project-description", project.description));

  const projectTasks = data.tasks
    .filter((task) => task.projectId === project.id && (!task.archivedAt || task.code === focusedCode))
    .sort((left, right) => {
      if (left.status === "done" && right.status !== "done") return 1;
      if (right.status === "done" && left.status !== "done") return -1;
      return String(left.scheduledDate || "9999").localeCompare(String(right.scheduledDate || "9999"));
    });
  const completed = projectTasks.filter((task) => task.status === "done").length;
  const progress = projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0;
  const track = node("div", "task-progress");
  const fill = node("span", "task-progress-fill");
  fill.style.width = `${progress}%`;
  track.append(fill);
  const meta = node("div", "task-project-meta");
  meta.append(node("span", "", `${completed} of ${projectTasks.length} tasks`), node("span", "", `${progress}%`));
  card.append(track, meta);

  if (projectTasks.length) {
    const list = node("ul", "task-project-task-list");
    for (const task of projectTasks) list.append(taskRow(task, null, data, editable, task.code === focusedCode));
    card.append(list);
  }
  if (editable) {
    const actions = node("div", "task-project-actions");
    actions.append(button("Add task", "new-project-task"), button("Edit", "edit-project"));
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
  if (editable) tools.append(button("New project", "new-project", "control-button task-section-action"));
  header.append(copy, tools);
  section.append(header);

  if (!projects.length) {
    const empty = node("div", "task-empty-compact");
    empty.append(node("strong", "", "No projects yet."));
    section.append(empty);
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

function dialogShell(kind) {
  const dialog = node("dialog", "journal-dialog task-dialog");
  const project = kind === "project";
  dialog.innerHTML = `
    <form class="journal-editor-form" novalidate>
      <header class="dialog-header">
        <h2 class="dialog-title">${project ? "New project" : "New task"}</h2>
        <button class="dialog-close" type="button" data-task-dialog-close aria-label="Close">×</button>
      </header>
      <div class="dialog-body">
        ${project ? `
          <label class="field-group"><span class="field-label">Title</span><input class="field-input" name="title" maxlength="120" required></label>
          <label class="field-group"><span class="field-label">Project key</span><input class="field-input task-key-field" name="key" maxlength="8" pattern="[A-Z][A-Z0-9]{1,7}" autocomplete="off" required><span class="task-field-help">2–8 uppercase letters or numbers. Fixed after creation.</span></label>
          <label class="field-group"><span class="field-label">Description</span><textarea class="field-textarea task-description-field" name="description" maxlength="600" placeholder="What does success look like?"></textarea></label>
          <div class="task-dialog-grid">
            <label class="field-group"><span class="field-label">Color</span><input class="field-input task-color-field" name="color" type="color" value="#2f855a"></label>
            <label class="field-group"><span class="field-label">Status</span><select class="field-input" name="status"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
          </div>
        ` : `
          <label class="field-group"><span class="field-label">Project</span><select class="field-input" name="projectId" required></select></label>
          <p class="task-code-preview" data-task-code-preview></p>
          <label class="field-group"><span class="field-label">Task</span><input class="field-input" name="title" maxlength="180" required></label>
          <div class="task-dialog-grid">
            <label class="field-group"><span class="field-label">Schedule</span><input class="field-input" name="scheduledDate" type="date"></label>
            <label class="field-group"><span class="field-label">Priority</span><select class="field-input" name="priority"><option value="normal">Normal</option><option value="high">High</option></select></label>
          </div>
          <label class="field-group"><span class="field-label">Status</span><select class="field-input" name="status"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label>
        `}
        <p class="editor-message" role="alert"></p>
      </div>
      <footer class="dialog-actions">
        <button class="control-button task-archive-button" type="button" data-task-dialog-archive hidden>Archive</button>
        <span class="task-dialog-spacer"></span>
        <button class="control-button" type="button" data-task-dialog-close>Cancel</button>
        <button class="control-button control-button-primary" type="submit">Save</button>
      </footer>
    </form>`;
  return dialog;
}

export function createTasksController({ canAuthor = () => false, request, confirmAction } = {}) {
  let data = emptyData();
  let loading = null;
  let loaded = false;
  let root = null;
  let focusedCode = "";
  let revealedCode = "";
  const authoring = { enabled: false, busy: false, message: "", messageKind: "status" };
  const editor = {
    projectDialog: null,
    projectForm: null,
    projectId: "",
    projectKeyManual: false,
    taskDialog: null,
    taskForm: null,
    taskId: ""
  };

  function render() {
    if (!root?.isConnected) return;
    authoring.enabled = Boolean(canAuthor());
    root.replaceChildren(page(data, authoring, focusedCode));
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

  function setDialogBusy(form, busy) {
    for (const control of form.elements) control.disabled = busy;
    form.querySelector("[data-task-dialog-archive]").disabled = busy;
  }

  function dialogMessage(form, message, kind = "error") {
    const target = form.querySelector(".editor-message");
    target.textContent = message;
    target.dataset.kind = kind;
  }

  function closeDialog(dialog) {
    if (dialog?.open && !authoring.busy) dialog.close();
  }

  function updateTaskCodePreview(task = null) {
    const target = editor.taskForm?.querySelector("[data-task-code-preview]");
    if (!target) return;
    if (task) {
      target.textContent = `Code ${task.code} · Fixed after creation`;
      return;
    }
    const project = data.projects.find((candidate) => candidate.id === editor.taskForm.elements.projectId.value);
    const code = nextTaskCode(project, `${data.today}T00:00:00+08:00`, data.tasks);
    target.textContent = code ? `Next code ${code}` : "A code will be assigned when the Task is created.";
  }

  function ensureEditors() {
    if (editor.projectDialog) return;
    editor.projectDialog = dialogShell("project");
    editor.projectForm = editor.projectDialog.querySelector("form");
    editor.taskDialog = dialogShell("task");
    editor.taskForm = editor.taskDialog.querySelector("form");
    document.body.append(editor.projectDialog, editor.taskDialog);

    for (const dialog of [editor.projectDialog, editor.taskDialog]) {
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeDialog(dialog);
      });
      for (const close of dialog.querySelectorAll("[data-task-dialog-close]")) {
        close.addEventListener("click", () => closeDialog(dialog));
      }
    }
    editor.projectForm.addEventListener("submit", saveProject);
    editor.taskForm.addEventListener("submit", saveTask);
    editor.projectForm.elements.title.addEventListener("input", () => {
      if (editor.projectId || editor.projectKeyManual) return;
      editor.projectForm.elements.key.value = suggestProjectKey(editor.projectForm.elements.title.value, data.projects);
    });
    editor.projectForm.elements.key.addEventListener("input", () => {
      editor.projectKeyManual = true;
      const input = editor.projectForm.elements.key;
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    });
    editor.taskForm.elements.projectId.addEventListener("change", () => {
      updateTaskCodePreview(data.tasks.find((task) => task.id === editor.taskId) || null);
    });
    editor.projectForm.querySelector("[data-task-dialog-archive]").addEventListener("click", archiveProject);
    editor.taskForm.querySelector("[data-task-dialog-archive]").addEventListener("click", archiveTask);
  }

  function openProject(project = null) {
    if (!canAuthor()) return;
    ensureEditors();
    editor.projectId = project?.id || "";
    editor.projectKeyManual = false;
    editor.projectForm.reset();
    editor.projectForm.elements.title.value = project?.title || "";
    editor.projectForm.elements.key.value = project?.key || suggestProjectKey("", data.projects);
    editor.projectForm.elements.key.readOnly = Boolean(project);
    editor.projectForm.elements.description.value = project?.description || "";
    editor.projectForm.elements.color.value = project?.color || "#2f855a";
    editor.projectForm.elements.status.value = project?.status || "active";
    editor.projectDialog.querySelector(".dialog-title").textContent = project ? "Edit project" : "New project";
    editor.projectForm.querySelector("[data-task-dialog-archive]").hidden = !project;
    dialogMessage(editor.projectForm, "", "status");
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
    editor.taskForm.elements.scheduledDate.value = task?.scheduledDate || data.today;
    editor.taskForm.elements.priority.value = task?.priority || "normal";
    editor.taskForm.elements.status.value = task?.status || "todo";
    updateTaskCodePreview(task);
    editor.taskDialog.querySelector(".dialog-title").textContent = task ? "Edit task" : "New task";
    editor.taskForm.querySelector("[data-task-dialog-archive]").hidden = !task;
    dialogMessage(editor.taskForm, "", "status");
    editor.taskDialog.showModal();
    editor.taskForm.elements.title.focus();
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
    const project = {
      ...(editor.projectId ? { id: editor.projectId } : {}),
      ...(!editor.projectId ? { key: form.elements.key.value } : {}),
      title: form.elements.title.value,
      description: form.elements.description.value,
      color: form.elements.color.value,
      status: form.elements.status.value
    };
    const result = await send({
      mode: editor.projectId ? "updateProject" : "createProject",
      baseRevision: data.revision,
      project
    }, form);
    if (result) editor.projectDialog.close();
  }

  async function saveTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const task = {
      ...(editor.taskId ? { id: editor.taskId } : {}),
      projectId: form.elements.projectId.value,
      title: form.elements.title.value,
      scheduledDate: form.elements.scheduledDate.value || null,
      priority: form.elements.priority.value,
      status: form.elements.status.value
    };
    const result = await send({
      mode: editor.taskId ? "updateTask" : "createTask",
      baseRevision: data.revision,
      task
    }, form);
    if (result) editor.taskDialog.close();
  }

  async function archiveProject() {
    const project = data.projects.find((candidate) => candidate.id === editor.projectId);
    if (!project) return;
    const approved = confirmAction
      ? await confirmAction("Archive project", `Archive “${project.title}” and all of its tasks?`, "Archive")
      : window.confirm(`Archive “${project.title}” and all of its tasks?`);
    if (!approved) return;
    const result = await send({
      mode: "archiveProject",
      baseRevision: data.revision,
      project: { id: project.id }
    }, editor.projectForm);
    if (result) editor.projectDialog.close();
  }

  async function archiveTask() {
    const task = data.tasks.find((candidate) => candidate.id === editor.taskId);
    if (!task) return;
    const approved = confirmAction
      ? await confirmAction("Archive task", `Archive “${task.title}”?`, "Archive")
      : window.confirm(`Archive “${task.title}”?`);
    if (!approved) return;
    const result = await send({
      mode: "archiveTask",
      baseRevision: data.revision,
      task: { id: task.id }
    }, editor.taskForm);
    if (result) editor.taskDialog.close();
  }

  async function toggleTask(task) {
    await send({
      mode: "updateTask",
      baseRevision: data.revision,
      task: {
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        scheduledDate: task.scheduledDate,
        priority: task.priority,
        status: task.status === "done" ? "todo" : "done"
      }
    });
  }

  function handleClick(event) {
    const control = event.target.closest("[data-task-action]");
    if (!control || !canAuthor()) return;
    const action = control.dataset.taskAction;
    const projectId = control.closest("[data-project-id]")?.dataset.projectId || "";
    const taskId = control.closest("[data-task-id]")?.dataset.taskId || "";
    const project = data.projects.find((candidate) => candidate.id === projectId);
    const task = data.tasks.find((candidate) => candidate.id === taskId);
    if (action === "new-project") openProject();
    if (action === "new-task") openTask();
    if (action === "new-project-task") openTask(null, projectId);
    if (action === "edit-project" && project) openProject(project);
    if (action === "edit-task" && task) openTask(task);
    if (action === "toggle-task" && task) void toggleTask(task);
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
      const notice = node("p", "empty-state", "Task data could not be loaded.");
      root.replaceChildren(notice);
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
        status: task.status,
        scheduledDate: task.scheduledDate,
        archived: Boolean(task.archivedAt || project.archivedAt),
        project: {
          id: project.id,
          key: project.key,
          title: project.title,
          color: project.color
        }
      }];
    });
  }

  return { mount, refresh: () => load(true).then(render), relatedChoices };
}
