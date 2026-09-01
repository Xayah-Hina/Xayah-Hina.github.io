const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
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
    schemaVersion: 1,
    revision: "0",
    today: singaporeDate(),
    updatedAt: null,
    projects: [],
    tasks: [],
    activity: []
  };
}

function validateData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== 1 || typeof value.revision !== "string"
    || !DATE.test(value.today || "") || !Array.isArray(value.projects)
    || !Array.isArray(value.tasks) || !Array.isArray(value.activity)) {
    throw new TypeError("Task data is invalid.");
  }
  const projectIds = new Set();
  for (const project of value.projects) {
    if (!project || typeof project.id !== "string" || projectIds.has(project.id)
      || typeof project.title !== "string" || !PROJECT_STATUSES.has(project.status)) {
      throw new TypeError("Task data contains an invalid project.");
    }
    projectIds.add(project.id);
  }
  const taskIds = new Set();
  for (const task of value.tasks) {
    if (!task || typeof task.id !== "string" || taskIds.has(task.id)
      || !projectIds.has(task.projectId) || typeof task.title !== "string"
      || !TASK_STATUSES.has(task.status)
      || (task.scheduledDate !== null && !DATE.test(task.scheduledDate || ""))) {
      throw new TypeError("Task data contains an invalid task.");
    }
    taskIds.add(task.id);
  }
  for (const day of value.activity) {
    if (!day || !DATE.test(day.date || "") || !Number.isInteger(day.updates)
      || !Number.isInteger(day.completions) || !Number.isFinite(day.score)) {
      throw new TypeError("Task data contains invalid activity.");
    }
  }
  return {
    schemaVersion: 1,
    revision: value.revision,
    today: value.today,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    projects: value.projects.map((project) => ({ ...project })),
    tasks: value.tasks.map((task) => ({ ...task })),
    activity: value.activity.map((day) => ({ ...day }))
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

function activityMap(data) {
  return new Map(data.activity.map((day) => [day.date, day]));
}

function contributionLevel(day) {
  const score = Number(day?.score || 0);
  if (score <= 0) return 0;
  if (score <= 2) return 1;
  if (score <= 4) return 2;
  if (score <= 7) return 3;
  return 4;
}

function currentStreak(data) {
  const days = activityMap(data);
  let cursor = data.today;
  if (!days.get(cursor)?.score) cursor = dateShift(cursor, -1);
  let count = 0;
  while (days.get(cursor)?.score) {
    count += 1;
    cursor = dateShift(cursor, -1);
  }
  return count;
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

function heatmap(data) {
  const today = new Date(`${data.today}T00:00:00Z`);
  const daysUntilSaturday = (6 - today.getUTCDay() + 7) % 7;
  const end = dateShift(data.today, daysUntilSaturday);
  const start = dateShift(end, -(53 * 7 - 1));
  const section = node("section", "task-panel task-contributions");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy");
  copy.append(
    node("h3", "task-panel-title", "Daily activity"),
    node("p", "task-panel-subtitle", "Every update counts. Completions carry a little more weight.")
  );
  const activeDays = data.activity.filter((day) => day.date >= start && day.date <= data.today && day.score > 0).length;
  header.append(copy, node("span", "task-panel-meta", `${activeDays} active ${activeDays === 1 ? "day" : "days"}`));

  const viewport = node("div", "task-heatmap-viewport");
  const graph = node("div", "task-heatmap");
  graph.setAttribute("role", "img");
  graph.setAttribute("aria-label", `Task activity during the past year, ${activeDays} active days`);
  const labels = node("div", "task-heatmap-weekdays");
  labels.setAttribute("aria-hidden", "true");
  labels.append(node("span", "", "Mon"), node("span", "", "Wed"), node("span", "", "Fri"));

  const days = activityMap(data);
  const weeks = node("div", "task-heatmap-weeks");
  weeks.setAttribute("aria-hidden", "true");
  for (let week = 0; week < 53; week += 1) {
    const column = node("div", "task-heatmap-week");
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = dateShift(start, week * 7 + weekday);
      const activity = days.get(date);
      const cell = node("span", "task-heatmap-cell");
      const future = date > data.today;
      const updates = Number(activity?.updates || 0);
      const completions = Number(activity?.completions || 0);
      const detail = future
        ? `${formatDay(date)} · future`
        : `${formatDay(date)} · ${updates} ${updates === 1 ? "update" : "updates"}, ${completions} completed`;
      cell.dataset.level = future ? "future" : String(contributionLevel(activity));
      cell.title = detail;
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
  section.append(header, viewport, legend);
  return section;
}

function taskRow(task, project, data, editable) {
  const item = node("li", "task-row");
  item.dataset.taskId = task.id;
  const marker = editable ? button("", "toggle-task", "task-check") : node("span", "task-check");
  marker.dataset.status = task.status;
  marker.setAttribute("aria-label", task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`);
  const copy = node("div", "task-row-copy");
  const title = node(editable ? "button" : "strong", "task-row-title", task.title);
  if (editable) {
    title.type = "button";
    title.dataset.taskAction = "edit-task";
  }
  copy.append(title);
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
  const section = node("section", "task-panel task-today");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy");
  copy.append(
    node("p", "task-eyebrow", formatDay(data.today)),
    node("h3", "task-panel-title", "Today")
  );
  const tasks = todayTasks(data);
  const completed = tasks.filter((task) => taskCompletedToday(task, data.today)).length;
  header.append(copy, node("span", "task-panel-meta", `${completed}/${tasks.length} done`));
  section.append(header);

  if (!tasks.length) {
    const empty = node("div", "task-empty-compact");
    empty.append(
      node("strong", "", "A clear day."),
      node("p", "", editable
        ? "Schedule a task for today, or enjoy the breathing room."
        : "Nothing is scheduled here today.")
    );
    section.append(empty);
    return section;
  }

  const list = node("ul", "task-list");
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  for (const task of tasks) list.append(taskRow(task, projects.get(task.projectId), data, editable));
  section.append(list);
  return section;
}

function projectCard(project, data, editable) {
  const card = node("article", "task-project-card");
  card.dataset.projectId = project.id;
  const head = node("div", "task-project-head");
  const identity = node("div", "task-project-identity");
  const dot = node("span", "task-project-dot");
  dot.style.setProperty("--project-color", project.color || "#2f855a");
  identity.append(dot, node("h4", "task-project-title", project.title));
  const status = node("span", "task-project-status", project.status);
  head.append(identity, status);
  card.append(head);
  if (project.description) card.append(node("p", "task-project-description", project.description));

  const projectTasks = data.tasks
    .filter((task) => task.projectId === project.id && !task.archivedAt)
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
    for (const task of projectTasks) list.append(taskRow(task, null, data, editable));
    card.append(list);
  }
  if (editable) {
    const actions = node("div", "task-project-actions");
    actions.append(button("Add task", "new-project-task"), button("Edit", "edit-project"));
    card.append(actions);
  }
  return card;
}

function projectsPanel(data, editable) {
  const section = node("section", "task-panel task-projects");
  const header = node("header", "task-panel-header");
  const copy = node("div", "task-panel-copy");
  copy.append(
    node("h3", "task-panel-title", "Projects"),
    node("p", "task-panel-subtitle", "Direction above, next actions below.")
  );
  const projects = data.projects.filter((project) => !project.archivedAt);
  const active = projects.filter((project) => project.status === "active");
  header.append(copy, node("span", "task-panel-meta", `${active.length} active`));
  section.append(header);

  if (!projects.length) {
    const empty = node("div", "task-empty-compact");
    empty.append(
      node("strong", "", "No projects yet."),
      node("p", "", editable
        ? "Create one when you are ready to turn a direction into smaller steps."
        : "Projects will appear here as they take shape.")
    );
    section.append(empty);
    return section;
  }

  const grid = node("div", "task-project-grid");
  const order = { active: 0, paused: 1, completed: 2 };
  projects.sort((left, right) => order[left.status] - order[right.status]
    || String(right.updatedAt).localeCompare(String(left.updatedAt)));
  for (const project of projects) grid.append(projectCard(project, data, editable));
  section.append(grid);
  return section;
}

function page(data, authoring) {
  const root = node("div", "task-page");
  const top = node("header", "task-page-header");
  const copy = node("div", "task-page-copy");
  copy.append(
    node("h2", "task-page-title", "Tasks"),
    node("p", "task-page-lede", "Keep the big picture visible, then move it forward one concrete task at a time.")
  );
  const today = todayTasks(data);
  const todayDone = today.filter((task) => taskCompletedToday(task, data.today)).length;
  const activeProjects = data.projects.filter((project) => project.status === "active" && !project.archivedAt).length;
  const stats = node("div", "task-stats");
  for (const [value, label] of [
    [`${todayDone}/${today.length}`, "Today"],
    [String(activeProjects), "Active projects"],
    [String(currentStreak(data)), "Day streak"]
  ]) {
    const stat = node("div", "task-stat");
    stat.append(node("strong", "task-stat-value", value), node("span", "task-stat-label", label));
    stats.append(stat);
  }
  copy.append(stats);
  top.append(copy);

  if (authoring.enabled) {
    const side = node("div", "task-page-side");
    const actions = node("div", "task-page-actions");
    const newTask = button("New task", "new-task", "control-button");
    newTask.disabled = !data.projects.some((project) => !project.archivedAt);
    const newProject = button("New project", "new-project", "control-button control-button-primary");
    actions.append(newTask, newProject);
    side.append(actions);
    top.append(side);
  }

  if (authoring.message) {
    const feedback = node("p", "task-feedback", authoring.message);
    feedback.dataset.kind = authoring.messageKind;
    feedback.setAttribute("role", authoring.messageKind === "error" ? "alert" : "status");
    root.append(top, feedback);
  } else {
    root.append(top);
  }
  const columns = node("div", "task-columns");
  columns.append(todayPanel(data, authoring.enabled), projectsPanel(data, authoring.enabled));
  root.append(heatmap(data), columns);
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
          <label class="field-group"><span class="field-label">Description</span><textarea class="field-textarea task-description-field" name="description" maxlength="600" placeholder="What does success look like?"></textarea></label>
          <div class="task-dialog-grid">
            <label class="field-group"><span class="field-label">Color</span><input class="field-input task-color-field" name="color" type="color" value="#2f855a"></label>
            <label class="field-group"><span class="field-label">Status</span><select class="field-input" name="status"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
          </div>
        ` : `
          <label class="field-group"><span class="field-label">Project</span><select class="field-input" name="projectId" required></select></label>
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
  const authoring = { enabled: false, busy: false, message: "", messageKind: "status" };
  const editor = {
    projectDialog: null,
    projectForm: null,
    projectId: "",
    taskDialog: null,
    taskForm: null,
    taskId: ""
  };

  function render() {
    if (!root?.isConnected) return;
    authoring.enabled = Boolean(canAuthor());
    root.replaceChildren(page(data, authoring));
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
    editor.projectForm.querySelector("[data-task-dialog-archive]").addEventListener("click", archiveProject);
    editor.taskForm.querySelector("[data-task-dialog-archive]").addEventListener("click", archiveTask);
  }

  function openProject(project = null) {
    if (!canAuthor()) return;
    ensureEditors();
    editor.projectId = project?.id || "";
    editor.projectForm.reset();
    editor.projectForm.elements.title.value = project?.title || "";
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
      const option = node("option", "", project.title);
      option.value = project.id;
      select.append(option);
    }
    select.value = task?.projectId || projectId || select.options[0]?.value || "";
    editor.taskForm.elements.title.value = task?.title || "";
    editor.taskForm.elements.scheduledDate.value = task?.scheduledDate || data.today;
    editor.taskForm.elements.priority.value = task?.priority || "normal";
    editor.taskForm.elements.status.value = task?.status || "todo";
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

  function mount(element) {
    if (root !== element) {
      root?.removeEventListener("click", handleClick);
      root = element;
      root.addEventListener("click", handleClick);
    }
    render();
    void load().then(render).catch(() => {
      if (!root?.isConnected) return;
      const notice = node("p", "empty-state", "Task data could not be loaded.");
      root.replaceChildren(notice);
    });
  }

  return { mount, refresh: () => load(true).then(render) };
}
