const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthBounds(month) {
  const [year, value] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, "0")}`, days };
}

function monthLabel(month) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function weekdayIndex(date) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function validateMonthData(value, month) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.month !== month) {
    throw new TypeError(`Monthly Plans for ${month} are invalid.`);
  }
  if (typeof value.today !== "string" || !DATE.test(value.today)
    || typeof value.revision !== "string" || !Array.isArray(value.plans)) {
    throw new TypeError(`Monthly Plans for ${month} have invalid metadata.`);
  }
  const ids = new Set();
  const plans = value.plans.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || typeof raw.id !== "string" || typeof raw.title !== "string" || !raw.title.trim()
      || !DATE.test(raw.startDate || "") || !DATE.test(raw.endDate || "")
      || !Array.isArray(raw.scheduledDates) || !Array.isArray(raw.completedDates)
      || !raw.schedule || typeof raw.schedule !== "object"
      || !["daily", "weekdays"].includes(raw.schedule.type)
      || !Number.isInteger(raw.completed) || !Number.isInteger(raw.total)
      || !Number.isInteger(raw.overallCompleted) || !Number.isInteger(raw.overallTotal)) {
      throw new TypeError(`Monthly Plans for ${month} contain an invalid plan.`);
    }
    if (ids.has(raw.id)) throw new TypeError(`Monthly Plans for ${month} contain duplicate ids.`);
    ids.add(raw.id);
    const scheduledDates = [...new Set(raw.scheduledDates.map(String))].sort();
    const completedDates = [...new Set(raw.completedDates.map(String))].sort();
    if (scheduledDates.some((date) => !DATE.test(date) || date.slice(0, 7) !== month)
      || completedDates.some((date) => !scheduledDates.includes(date))) {
      throw new TypeError(`Monthly Plan ${raw.id} contains invalid dates.`);
    }
    let schedule;
    if (raw.schedule.type === "daily") {
      schedule = { type: "daily" };
    } else {
      if (!Array.isArray(raw.schedule.weekdays)
        || raw.schedule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
        throw new TypeError(`Monthly Plan ${raw.id} has invalid weekdays.`);
      }
      schedule = { type: "weekdays", weekdays: [...new Set(raw.schedule.weekdays)].sort() };
    }
    return {
      id: raw.id,
      title: raw.title,
      startDate: raw.startDate,
      endDate: raw.endDate,
      schedule,
      ...(typeof raw.archivedAt === "string" ? { archivedAt: raw.archivedAt } : {}),
      scheduledDates,
      completedDates,
      completed: raw.completed,
      total: raw.total,
      overallCompleted: raw.overallCompleted,
      overallTotal: raw.overallTotal
    };
  });
  return {
    month,
    today: value.today,
    revision: value.revision,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    plans
  };
}

function planState(plan, date, today) {
  if (!plan.scheduledDates.includes(date)) return "off";
  if (plan.completedDates.includes(date)) return "done";
  if (date === today) return "today";
  if (date < today) return "missed";
  return "future";
}

function stateLabel(state) {
  return {
    off: "Not scheduled",
    done: "Complete",
    today: "Today",
    missed: "Missed",
    future: "Upcoming"
  }[state];
}

function scheduleLabel(plan) {
  if (plan.schedule.type === "daily") return "Daily";
  return plan.schedule.weekdays.map((day) => WEEKDAYS[day - 1]).join(" · ");
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dialogMarkup() {
  return `
    <form class="journal-editor-form monthly-plan-manager-form" novalidate>
      <header class="dialog-header">
        <h2 class="dialog-title">Manage plans</h2>
        <button class="dialog-close" type="button" data-plan-manager-action="close" aria-label="Close">×</button>
      </header>
      <div class="dialog-body">
        <p class="editor-published-at monthly-plan-manager-month"></p>
        <div class="monthly-plan-manager-list"></div>
        <section class="monthly-plan-fields" hidden aria-label="Plan details">
          <label class="field-group">
            <span class="field-label">Title</span>
            <input class="field-input" name="title" maxlength="160" required>
          </label>
          <div class="monthly-plan-date-fields">
            <label class="field-group">
              <span class="field-label">Start date</span>
              <input class="field-input" name="startDate" type="date" required>
            </label>
            <label class="field-group">
              <span class="field-label">End date</span>
              <input class="field-input" name="endDate" type="date" required>
            </label>
          </div>
          <label class="field-group">
            <span class="field-label">Schedule</span>
            <select class="field-input" name="scheduleType">
              <option value="daily">Daily</option>
              <option value="weekdays">Selected weekdays</option>
            </select>
          </label>
          <fieldset class="monthly-plan-weekday-fields" hidden>
            <legend class="field-label">Weekdays</legend>
            <div class="monthly-plan-weekday-options">
              ${WEEKDAYS.map((day, index) => `<label><input type="checkbox" name="weekday" value="${index + 1}"> ${day}</label>`).join("")}
            </div>
          </fieldset>
          <div class="monthly-plan-field-actions">
            <button class="control-button" type="button" data-plan-manager-action="cancel-edit">Cancel</button>
            <button class="control-button control-button-primary" type="submit">Save plan</button>
          </div>
        </section>
        <p class="editor-message" role="alert"></p>
      </div>
      <footer class="dialog-actions">
        <button class="control-button" type="button" data-plan-manager-action="close">Close</button>
        <button class="control-button control-button-primary" type="button" data-plan-manager-action="add">Add plan</button>
      </footer>
    </form>`;
}

export function createMonthlyPlansController({ canAuthor, request, setStatus, confirmAction }) {
  const cache = new Map();
  const etags = new Map();
  const loads = new Map();
  const expanded = new Map();
  const pending = new Map();
  const timers = new Map();
  const saving = new Set();
  const manager = {
    dialog: null,
    form: null,
    month: "",
    mode: "create",
    planId: "",
    busy: false
  };

  async function loadMonth(month, force = false) {
    if (!force && cache.has(month)) return cache.get(month);
    if (loads.has(month)) return loads.get(month);
    const headers = new Headers();
    if (etags.has(month)) headers.set("If-None-Match", etags.get(month));
    const promise = fetch(`/data/monthly-plans/${month}`, { headers, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 304 && cache.has(month)) return cache.get(month);
        const value = await response.json().catch(() => null);
        if (!response.ok) throw new Error(value?.error || "Monthly Plans could not be loaded.");
        const data = validateMonthData(value, month);
        cache.set(month, data);
        const etag = response.headers.get("etag");
        if (etag) etags.set(month, etag);
        return data;
      })
      .finally(() => loads.delete(month));
    loads.set(month, promise);
    return promise;
  }

  function rootsForMonth(month) {
    return [...document.querySelectorAll(`[data-monthly-plans-root][data-month="${CSS.escape(month)}"]`)];
  }

  function renderAll(month) {
    for (const root of rootsForMonth(month)) renderRoot(root, month);
  }

  function strip(plan, data) {
    const bounds = monthBounds(data.month);
    const track = element("span", "monthly-plan-strip");
    track.setAttribute("aria-hidden", "true");
    for (let day = 1; day <= bounds.days; day += 1) {
      const date = `${data.month}-${String(day).padStart(2, "0")}`;
      const state = planState(plan, date, data.today);
      const mark = element("span", "monthly-plan-strip-mark");
      mark.dataset.state = state;
      mark.dataset.label = `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))} · ${stateLabel(state)}`;
      track.append(mark);
    }
    return track;
  }

  function dayCell(plan, data, day) {
    const date = `${data.month}-${String(day).padStart(2, "0")}`;
    const state = planState(plan, date, data.today);
    const actionable = canAuthor() && state !== "off" && state !== "future";
    const cell = element(actionable ? "button" : "span", "monthly-plan-day");
    if (actionable) {
      cell.type = "button";
      cell.dataset.planCheckIn = plan.id;
      cell.dataset.date = date;
      cell.dataset.completed = String(state !== "done");
    }
    cell.dataset.state = state;
    cell.setAttribute("aria-label", `${date}: ${stateLabel(state)}`);
    cell.append(
      element("span", "monthly-plan-day-number", String(day)),
      element("small", "monthly-plan-day-weekday", WEEKDAYS[weekdayIndex(date)])
    );
    return cell;
  }

  function weeklyBands(plan, data) {
    const detail = element("div", "monthly-plan-detail");
    const head = element("div", "monthly-plan-detail-head");
    const summary = plan.overallTotal !== plan.total
      ? `${scheduleLabel(plan)} · Overall ${plan.overallCompleted} / ${plan.overallTotal}`
      : scheduleLabel(plan);
    head.append(
      element("span", "monthly-plan-detail-title", monthLabel(data.month)),
      element("span", "monthly-plan-detail-summary", summary)
    );
    detail.append(head);
    const list = element("div", "monthly-plan-week-list");
    const days = monthBounds(data.month).days;
    for (let start = 1; start <= days; start += 7) {
      const end = Math.min(start + 6, days);
      const week = element("div", "monthly-plan-week");
      const label = element("span", "monthly-plan-week-label", `${start}–${end} ${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${data.month}-01T00:00:00Z`))}`);
      const cells = element("div", "monthly-plan-week-days");
      cells.setAttribute("role", "grid");
      let complete = 0;
      let scheduled = 0;
      for (let day = start; day <= end; day += 1) {
        const date = `${data.month}-${String(day).padStart(2, "0")}`;
        if (plan.scheduledDates.includes(date)) scheduled += 1;
        if (plan.completedDates.includes(date)) complete += 1;
        cells.append(dayCell(plan, data, day));
      }
      for (let day = end + 1; day < start + 7; day += 1) cells.append(element("span", "monthly-plan-day-placeholder"));
      const score = element("span", "monthly-plan-week-score", `${complete}/${scheduled}`);
      week.append(label, cells, score);
      list.append(week);
    }
    detail.append(list);
    return detail;
  }

  function renderRoot(root, month) {
    const data = cache.get(month);
    const visiblePlans = data?.plans.filter((plan) => plan.total > 0) || [];
    root.replaceChildren();
    root.hidden = visiblePlans.length === 0;
    if (!visiblePlans.length) return;
    const list = element("div", "monthly-plan-list");
    for (const plan of visiblePlans) {
      const item = element("section", "monthly-plan-item");
      const row = element("button", "monthly-plan-row");
      row.type = "button";
      row.dataset.planExpand = plan.id;
      const isExpanded = expanded.get(month) === plan.id;
      row.setAttribute("aria-expanded", String(isExpanded));
      row.setAttribute("aria-label", `${plan.title}, ${plan.completed} of ${plan.total} complete`);
      row.append(
        element("span", "monthly-plan-name", plan.title),
        strip(plan, data),
        element("span", "monthly-plan-count", `${plan.completed} / ${plan.total}`),
        element("span", "monthly-plan-chevron", "⌄")
      );
      item.append(row);
      if (isExpanded) item.append(weeklyBands(plan, data));
      list.append(item);
    }
    root.append(list);
  }

  function applyLocalChange(data, planId, date, completed) {
    const plan = data.plans.find((candidate) => candidate.id === planId);
    if (!plan) return;
    const dates = new Set(plan.completedDates);
    const wasComplete = dates.has(date);
    if (completed) dates.add(date);
    else dates.delete(date);
    plan.completedDates = [...dates].sort();
    const delta = Number(completed) - Number(wasComplete);
    plan.completed += delta;
    plan.overallCompleted += delta;
  }

  function queueCheckIn(month, planId, date, completed) {
    const data = cache.get(month);
    if (!data || !canAuthor()) return;
    applyLocalChange(data, planId, date, completed);
    renderAll(month);
    if (!pending.has(month)) pending.set(month, new Map());
    pending.get(month).set(`${planId}:${date}`, { planId, date, completed });
    window.clearTimeout(timers.get(month));
    timers.set(month, window.setTimeout(() => void flushCheckIns(month), 250));
  }

  async function flushCheckIns(month) {
    if (saving.has(month) || !pending.get(month)?.size) return;
    saving.add(month);
    const changes = [...pending.get(month).values()];
    pending.set(month, new Map());
    const baseRevision = cache.get(month).revision;
    try {
      const result = validateMonthData(await request("plans/check-ins", { month, baseRevision, changes }), month);
      const queued = [...(pending.get(month)?.values() || [])];
      for (const change of queued) applyLocalChange(result, change.planId, change.date, change.completed);
      cache.set(month, result);
      renderAll(month);
      setStatus("Monthly Plan check-in saved.", "status");
    } catch (error) {
      pending.set(month, new Map());
      try {
        await loadMonth(month, true);
      } catch {}
      renderAll(month);
      setStatus(error.message || "The Monthly Plan check-in could not be saved.", "error");
    } finally {
      saving.delete(month);
      if (pending.get(month)?.size) void flushCheckIns(month);
    }
  }

  function managerMessage(message, kind = "status") {
    const target = manager.dialog.querySelector(".editor-message");
    target.textContent = message;
    target.dataset.kind = kind;
  }

  function setManagerBusy(busy) {
    manager.busy = busy;
    for (const control of manager.form.elements) control.disabled = busy;
  }

  function showPlanFields(plan = null) {
    const fields = manager.dialog.querySelector(".monthly-plan-fields");
    manager.dialog.querySelector('[data-plan-manager-action="add"]').hidden = true;
    const form = manager.form.elements;
    const bounds = monthBounds(manager.month);
    manager.mode = plan ? "edit" : "create";
    manager.planId = plan?.id || "";
    form.title.value = plan?.title || "";
    form.startDate.value = plan?.startDate || bounds.start;
    form.endDate.value = plan?.endDate || bounds.end;
    form.scheduleType.value = plan?.schedule.type || "daily";
    for (const checkbox of manager.form.querySelectorAll('[name="weekday"]')) {
      checkbox.checked = plan?.schedule.type === "weekdays" && plan.schedule.weekdays.includes(Number(checkbox.value));
    }
    fields.hidden = false;
    updateWeekdayFields();
    form.title.focus();
  }

  function hidePlanFields() {
    manager.dialog.querySelector(".monthly-plan-fields").hidden = true;
    manager.dialog.querySelector('[data-plan-manager-action="add"]').hidden = false;
    manager.mode = "create";
    manager.planId = "";
    managerMessage("");
  }

  function updateWeekdayFields() {
    manager.dialog.querySelector(".monthly-plan-weekday-fields").hidden = manager.form.elements.scheduleType.value !== "weekdays";
  }

  function renderManager() {
    const data = cache.get(manager.month);
    const list = manager.dialog.querySelector(".monthly-plan-manager-list");
    list.replaceChildren();
    if (!data?.plans.length) {
      list.append(element("p", "monthly-plan-manager-empty", "No plans overlap this month."));
      return;
    }
    for (const plan of data.plans) {
      const row = element("div", "monthly-plan-manager-row");
      const copy = element("div", "monthly-plan-manager-copy");
      copy.append(
        element("strong", "monthly-plan-manager-title", plan.title),
        element("span", "monthly-plan-manager-meta", `${plan.startDate} → ${plan.endDate} · ${scheduleLabel(plan)}`)
      );
      const actions = element("div", "monthly-plan-manager-actions");
      const edit = element("button", "control-button", "Edit");
      edit.type = "button";
      edit.dataset.planManagerAction = "edit";
      edit.dataset.planId = plan.id;
      const archive = element("button", "control-button", plan.archivedAt ? "Restore" : "Archive");
      archive.type = "button";
      archive.dataset.planManagerAction = plan.archivedAt ? "restore" : "archive";
      archive.dataset.planId = plan.id;
      actions.append(edit, archive);
      row.append(copy, actions);
      list.append(row);
    }
  }

  async function openManager(month) {
    if (!canAuthor() || manager.busy) return;
    manager.month = month;
    manager.dialog.querySelector(".dialog-title").textContent = `Manage plans · ${monthLabel(month)}`;
    manager.dialog.querySelector(".monthly-plan-manager-month").textContent = "Plans appear in every Monthly Note they overlap.";
    managerMessage("Loading...");
    manager.dialog.showModal();
    try {
      await loadMonth(month, true);
      renderManager();
      hidePlanFields();
    } catch (error) {
      managerMessage(error.message || "Monthly Plans could not be loaded.", "error");
    }
  }

  async function savePlan(event, discardExcludedCheckIns = false) {
    event?.preventDefault();
    if (manager.busy) return;
    const form = manager.form.elements;
    const weekdays = [...manager.form.querySelectorAll('[name="weekday"]:checked')].map((checkbox) => Number(checkbox.value));
    if (!form.title.value.trim() || !form.startDate.value || !form.endDate.value) {
      managerMessage("Title, start date, and end date are required.", "error");
      return;
    }
    if (form.scheduleType.value === "weekdays" && !weekdays.length) {
      managerMessage("Select at least one weekday.", "error");
      return;
    }
    const data = cache.get(manager.month);
    const payload = {
      mode: manager.mode,
      month: manager.month,
      baseRevision: data.revision,
      plan: {
        ...(manager.planId ? { id: manager.planId } : {}),
        title: form.title.value.trim(),
        startDate: form.startDate.value,
        endDate: form.endDate.value,
        schedule: form.scheduleType.value === "daily"
          ? { type: "daily" }
          : { type: "weekdays", weekdays }
      },
      discardExcludedCheckIns
    };
    setManagerBusy(true);
    managerMessage("Saving...");
    try {
      const result = validateMonthData(await request("plans/save", payload), manager.month);
      cache.set(manager.month, result);
      renderAll(manager.month);
      renderManager();
      hidePlanFields();
      setStatus("Monthly Plan saved.", "status");
    } catch (error) {
      if (!discardExcludedCheckIns && /excludes \d+ existing check-in/i.test(error.message || "")) {
        setManagerBusy(false);
        const confirmed = await confirmAction(
          "Discard excluded check-ins?",
          error.message,
          "Discard and save"
        );
        if (confirmed) return savePlan(null, true);
      }
      managerMessage(error.message || "The Monthly Plan could not be saved.", "error");
    } finally {
      setManagerBusy(false);
    }
  }

  async function changeArchiveState(planId, mode) {
    const data = cache.get(manager.month);
    const plan = data.plans.find((candidate) => candidate.id === planId);
    if (!plan || manager.busy) return;
    if (mode === "archive") {
      const confirmed = await confirmAction(
        "Archive this plan?",
        `${plan.title} will stop scheduling future dates. Historical check-ins remain visible.`,
        "Archive"
      );
      if (!confirmed) return;
    }
    setManagerBusy(true);
    managerMessage(mode === "archive" ? "Archiving..." : "Restoring...");
    try {
      const result = validateMonthData(await request("plans/save", {
        mode,
        month: manager.month,
        baseRevision: data.revision,
        plan: { id: plan.id }
      }), manager.month);
      cache.set(manager.month, result);
      renderAll(manager.month);
      renderManager();
      managerMessage(mode === "archive" ? "Plan archived." : "Plan restored.");
    } catch (error) {
      managerMessage(error.message || "The Monthly Plan could not be updated.", "error");
    } finally {
      setManagerBusy(false);
    }
  }

  function ensureManager() {
    if (manager.dialog) return;
    manager.dialog = document.createElement("dialog");
    manager.dialog.className = "journal-dialog monthly-plan-manager-dialog";
    manager.dialog.setAttribute("aria-label", "Manage Monthly Plans");
    manager.dialog.innerHTML = dialogMarkup();
    manager.form = manager.dialog.querySelector("form");
    document.body.append(manager.dialog);
    manager.form.addEventListener("submit", (event) => void savePlan(event));
    manager.form.elements.scheduleType.addEventListener("change", updateWeekdayFields);
    manager.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!manager.busy) manager.dialog.close();
    });
    manager.dialog.addEventListener("click", (event) => {
      const button = event.target.closest("[data-plan-manager-action]");
      if (!button || manager.busy) return;
      const action = button.dataset.planManagerAction;
      if (action === "close") manager.dialog.close();
      if (action === "add") showPlanFields();
      if (action === "cancel-edit") hidePlanFields();
      if (action === "edit") {
        const plan = cache.get(manager.month)?.plans.find((candidate) => candidate.id === button.dataset.planId);
        if (plan) showPlanFields(plan);
      }
      if (action === "archive" || action === "restore") void changeArchiveState(button.dataset.planId, action);
    });
  }

  function mount(root, month, actionHost) {
    if (!MONTH.test(month)) return;
    root.dataset.monthlyPlansRoot = "";
    root.dataset.month = month;
    root.hidden = true;
    root.addEventListener("click", (event) => {
      const expand = event.target.closest("[data-plan-expand]");
      if (expand) {
        expanded.set(month, expanded.get(month) === expand.dataset.planExpand ? "" : expand.dataset.planExpand);
        renderAll(month);
        return;
      }
      const checkIn = event.target.closest("[data-plan-check-in]");
      if (checkIn) {
        queueCheckIn(month, checkIn.dataset.planCheckIn, checkIn.dataset.date, checkIn.dataset.completed === "true");
      }
    });
    root.addEventListener("keydown", (event) => {
      const current = event.target.closest?.("[data-plan-check-in]");
      if (!current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const buttons = [...root.querySelectorAll(`[data-plan-check-in="${CSS.escape(current.dataset.planCheckIn)}"]`)];
      const index = buttons.indexOf(current);
      let target = null;
      if (event.key === "ArrowLeft") target = buttons[index - 1] || null;
      if (event.key === "ArrowRight") target = buttons[index + 1] || null;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const date = shiftDate(current.dataset.date, event.key === "ArrowUp" ? -7 : 7);
        target = buttons.find((button) => button.dataset.date === date) || null;
      }
      if (!target) return;
      event.preventDefault();
      target.focus();
    });
    if (canAuthor() && actionHost && !actionHost.querySelector("[data-manage-monthly-plans]")) {
      const manage = element("button", "journal-action-button", "Manage plans");
      manage.type = "button";
      manage.dataset.manageMonthlyPlans = month;
      manage.addEventListener("click", () => void openManager(month));
      actionHost.append(manage);
    }
    loadMonth(month)
      .then(() => {
        if (root.isConnected) renderRoot(root, month);
      })
      .catch(() => {
        root.hidden = true;
      });
  }

  ensureManager();
  return { mount, loadMonth };
}

export { monthBounds, planState, validateMonthData };
