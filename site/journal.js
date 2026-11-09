"use strict";

const TIME_ZONE = "Asia/Singapore";
const byId = (id) => document.getElementById(id);
const moduleVersion = Date.now().toString();
const requestTimeout = 8000;
const entriesByYear = new Map();
const loadPromises = new Map();
const loadErrors = new Map();
let years = [];
let catalogError = null;
let dataGeneration = 0;
let authoringSession = false;

const state = { year: "", query: "" };
const authoring = {
  connected: false,
  status: null,
  newButton: null,
  editorDialog: null,
  editorForm: null,
  editorImages: [],
  originalEntry: null,
  busy: false,
  confirmDialog: null,
  confirmResolver: null,
};
const lightbox = {
  dialog: null,
  image: null,
  caption: null,
  trigger: null,
  returnScroll: null,
};

function importDataModule(path) {
  const url = new URL(path, location.href);
  url.searchParams.set("v", moduleVersion);
  return import(url.href);
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeout);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    const result = response.type === "opaqueredirect" ? null : await response.json();
    return { response, result };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Cloud request timed out.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeYears(value) {
  if (!Array.isArray(value)) throw new TypeError("Catalog years must be an array.");
  return [...new Set(value.map(String).filter((year) => /^\d{4}$/.test(year)))]
    .sort((left, right) => right.localeCompare(left));
}

function validateEntries(value, year) {
  if (!Array.isArray(value)) throw new TypeError(`Journal ${year} must export an array.`);
  const ids = new Set();
  for (const entry of value) {
    if (!entry || typeof entry.id !== "string" || ids.has(entry.id)) {
      throw new TypeError(`Journal ${year} contains an invalid or duplicate id.`);
    }
    if (typeof entry.publishedAt !== "string" || entry.publishedAt.slice(0, 4) !== year
      || typeof entry.content !== "string" || !Array.isArray(entry.images)) {
      throw new TypeError(`Journal ${entry.id} contains invalid data.`);
    }
    if (entry.updatedAt && Number.isNaN(Date.parse(entry.updatedAt))) {
      throw new TypeError(`Journal ${entry.id} has an invalid update timestamp.`);
    }
    ids.add(entry.id);
  }
  return [...value].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

async function loadPublicCatalog() {
  try {
    const { response, result } = await fetchJson("/data/journal/catalog", { cache: "no-store" });
    if (!response.ok) throw new Error(result.error || "Journal catalog could not be loaded.");
    return result;
  } catch (publicError) {
    try {
      return (await importDataModule("journals/catalog.js")).default;
    } catch {
      throw publicError;
    }
  }
}

async function loadPublicYear(year) {
  try {
    const { response, result } = await fetchJson(`/data/journal/year/${year}`, { cache: "no-store" });
    if (!response.ok) throw new Error(result.error || `Journal ${year} could not be loaded.`);
    return result.entries;
  } catch (publicError) {
    try {
      return (await importDataModule(`journals/${year}.js`)).default;
    } catch {
      throw publicError;
    }
  }
}

function routeHash(year) {
  return `#journal${year ? `/${year}` : ""}`;
}

function requestedYear() {
  const match = /^#journal\/(\d{4})$/.exec(location.hash);
  return match && years.includes(match[1]) ? match[1] : years[0] || "";
}

function updateRoute(year, replace = false) {
  const url = new URL(location.href);
  url.hash = routeHash(year);
  history[replace ? "replaceState" : "pushState"](null, "", url);
}

async function refreshCatalog() {
  const generation = dataGeneration;
  const selectedYear = state.year;
  try {
    const catalog = await loadPublicCatalog();
    if (generation !== dataGeneration) return;
    years = normalizeYears(catalog?.years);
    catalogError = null;
    if (!years.includes(state.year)) state.year = requestedYear();
  } catch (error) {
    if (generation !== dataGeneration) return;
    if (!years.length) catalogError = error;
  }
  if (state.year !== selectedYear || location.hash !== routeHash(state.year)) updateRoute(state.year, true);
  render();
}

function loadYear(year) {
  if (!year) return Promise.resolve([]);
  if (entriesByYear.has(year)) return Promise.resolve(entriesByYear.get(year));
  if (loadPromises.has(year)) return loadPromises.get(year);
  loadErrors.delete(year);
  const generation = dataGeneration;
  const promise = loadPublicYear(year)
    .then((value) => {
      if (generation !== dataGeneration) return loadYear(year);
      const entries = validateEntries(value, year);
      entriesByYear.set(year, entries);
      return entries;
    })
    .catch((error) => {
      if (generation !== dataGeneration) return loadYear(year);
      loadErrors.set(year, error);
      throw error;
    })
    .finally(() => {
      if (loadPromises.get(year) === promise) loadPromises.delete(year);
    });
  loadPromises.set(year, promise);
  return promise;
}

function formatTimestamp(value) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((candidate) => candidate.type === type)?.value || "";
  return `${part("day")} ${part("month")} ${part("year")} · ${part("hour")}:${part("minute")}`;
}

function formatMonth(month) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
}

function canAuthor() {
  return authoring.connected && !catalogError;
}

function renderYearFilter() {
  const container = byId("year-filter");
  container.replaceChildren();
  container.hidden = years.length === 0;
  for (const year of years) {
    const button = document.createElement("button");
    button.className = "year-filter-button";
    button.type = "button";
    button.dataset.year = year;
    button.setAttribute("aria-pressed", String(year === state.year));
    button.textContent = year;
    container.append(button);
  }
}

function renderEntry(entry) {
  const fragment = byId("journal-template").content.cloneNode(true);
  const post = fragment.querySelector(".journal-post");
  const header = fragment.querySelector(".journal-post-header");
  const time = fragment.querySelector(".journal-time");
  const content = fragment.querySelector(".journal-content");
  const media = fragment.querySelector(".journal-media");
  post.id = `journal-${entry.id}`;

  const published = document.createElement("time");
  published.dateTime = entry.publishedAt;
  published.textContent = formatTimestamp(entry.publishedAt);
  time.append(published);
  if (entry.updatedAt) {
    const updated = document.createElement("time");
    updated.dateTime = entry.updatedAt;
    updated.textContent = formatTimestamp(entry.updatedAt);
    time.append(" · Edited ", updated);
  }

  if (canAuthor()) {
    const actions = document.createElement("div");
    actions.className = "journal-actions";
    for (const [action, label, className] of [
      ["edit", "Edit", "journal-action-button"],
      ["delete", "Delete", "journal-action-button danger-action"],
    ]) {
      const button = document.createElement("button");
      button.className = className;
      button.type = "button";
      button.dataset.journalAction = action;
      button.dataset.journalId = entry.id;
      button.textContent = label;
      actions.append(button);
    }
    header.append(actions);
  }

  if (entry.content) {
    const paragraph = document.createElement("p");
    paragraph.textContent = entry.content;
    content.append(paragraph);
  }
  content.hidden = content.childElementCount === 0;

  media.dataset.count = String(entry.images.length);
  for (const imageData of entry.images) {
    const button = document.createElement("button");
    const image = document.createElement("img");
    const alt = imageData.alt || "";
    button.className = "journal-image-button";
    button.type = "button";
    button.dataset.journalImage = "";
    button.dataset.imageSrc = imageData.src;
    button.dataset.imageAlt = alt;
    button.setAttribute("aria-label", alt ? `View larger: ${alt}` : "View image larger");
    image.className = "journal-image";
    image.src = imageData.src;
    image.alt = alt;
    image.loading = "lazy";
    image.decoding = "async";
    button.append(image);
    media.append(button);
  }
  media.hidden = entry.images.length === 0;
  return fragment;
}

function renderMessage(message) {
  const notice = document.createElement("p");
  notice.className = "empty-state";
  notice.textContent = message;
  byId("archive-list").append(notice);
}

function renderArchive() {
  const container = byId("archive-list");
  container.replaceChildren();
  if (catalogError) {
    byId("archive-summary").textContent = "";
    renderMessage("Journal data could not be loaded.");
    return;
  }
  if (state.year && !entriesByYear.has(state.year)) {
    byId("archive-summary").textContent = "";
    renderMessage(loadErrors.has(state.year)
      ? `Journal ${state.year} could not be loaded.`
      : `Loading Journal ${state.year}...`);
    return;
  }

  const query = state.query.trim().toLocaleLowerCase();
  const entries = (entriesByYear.get(state.year) || []).filter((entry) => {
    const text = [entry.content, ...entry.images.map((image) => image.alt)]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return !query || text.includes(query);
  });
  byId("archive-summary").textContent = `${entries.length} ${entries.length === 1 ? "post" : "posts"}${state.year ? ` in ${state.year}` : ""}`;
  if (!entries.length) {
    renderMessage(query ? "No journal entries match this search." : "No journal entries have been published yet.");
    return;
  }

  const groups = new Map();
  for (const entry of entries) {
    const month = entry.publishedAt.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(entry);
  }
  for (const [month, monthEntries] of groups) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    const feed = document.createElement("div");
    section.className = "journal-month-group";
    heading.className = "journal-month-title";
    heading.id = `month-${month}`;
    heading.textContent = formatMonth(month);
    feed.className = "journal-feed";
    section.setAttribute("aria-labelledby", heading.id);
    for (const entry of monthEntries) feed.append(renderEntry(entry));
    section.append(heading, feed);
    container.append(section);
  }
}

function render() {
  renderYearFilter();
  if (state.year && !entriesByYear.has(state.year)
    && !loadPromises.has(state.year) && !loadErrors.has(state.year) && !catalogError) {
    const requested = state.year;
    loadYear(requested)
      .then(() => {
        if (state.year === requested) renderArchive();
      })
      .catch(() => {
        if (state.year === requested) renderArchive();
      });
  }
  renderArchive();
}

function selectYear(year) {
  if (!years.includes(year) || year === state.year) return;
  state.year = year;
  updateRoute(year);
  render();
}

function applyRoute() {
  const year = requestedYear();
  state.year = year;
  if (location.hash !== routeHash(year)) updateRoute(year, true);
  render();
}

function openLightbox(trigger) {
  if (lightbox.dialog.open) return;
  const alt = trigger.dataset.imageAlt || "";
  lightbox.trigger = trigger;
  lightbox.returnScroll = { left: window.scrollX, top: window.scrollY };
  lightbox.image.src = trigger.dataset.imageSrc || "";
  lightbox.image.alt = alt;
  lightbox.caption.textContent = alt;
  lightbox.caption.hidden = !alt;
  lightbox.dialog.showModal();
  lightbox.dialog.querySelector('[data-lightbox-action="close"]').focus({ preventScroll: true });
  window.scrollTo(lightbox.returnScroll.left, lightbox.returnScroll.top);
}

function setAuthoringBusy(busy) {
  authoring.busy = busy;
  if (authoring.newButton) authoring.newButton.disabled = busy || !canAuthor();
  if (authoring.editorForm) {
    for (const control of authoring.editorForm.elements) control.disabled = busy;
  }
}

function setAuthoringStatus(message, kind = "status") {
  if (!authoring.status) return;
  authoring.status.textContent = message;
  authoring.status.dataset.kind = kind;
}

function setEditorMessage(message, kind = "status") {
  const element = authoring.editorDialog?.querySelector(".editor-message");
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
}

async function editorRequest(action, payload) {
  const response = await fetch(`/api/journal/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Cloud authoring returned an invalid response.");
  }
  if (!response.ok) throw new Error(result.error || "The cloud authoring request failed.");
  return result;
}

function operationFeedback(result, message) {
  const sync = result?.sync;
  if (!sync?.enabled) return message;
  if (sync.state === "synced") return `${message} ${sync.message}`;
  if (sync.state === "unchanged") return `${message} No remote update was needed.`;
  return `${message} ${sync.message || ""}`.trim();
}

function resetEditor() {
  for (const image of authoring.editorImages) {
    if (image.kind === "new") URL.revokeObjectURL(image.previewUrl);
  }
  authoring.editorImages = [];
  authoring.originalEntry = null;
  authoring.editorForm.reset();
  authoring.editorDialog.querySelector(".editor-image-list").replaceChildren();
  setEditorMessage("");
}

function openNewEditor() {
  if (!canAuthor() || authoring.busy) return;
  resetEditor();
  authoring.editorDialog.querySelector(".dialog-title").textContent = "New Journal";
  authoring.editorDialog.querySelector('[data-editor-action="save"]').textContent = "Publish";
  authoring.editorDialog.querySelector(".editor-published-at").hidden = true;
  authoring.editorDialog.showModal();
  authoring.editorForm.elements.content.focus();
}

function openEditEditor(id) {
  const entry = entriesByYear.get(state.year)?.find((candidate) => candidate.id === id);
  if (!entry) return;
  resetEditor();
  authoring.originalEntry = structuredClone(entry);
  authoring.editorForm.elements.content.value = entry.content;
  authoring.editorImages = entry.images.map((image) => ({
    key: crypto.randomUUID(),
    kind: "existing",
    src: image.src,
    alt: image.alt || "",
    previewUrl: new URL(image.src, location.href).href,
  }));
  renderEditorImages();
  authoring.editorDialog.querySelector(".dialog-title").textContent = "Edit Journal";
  authoring.editorDialog.querySelector('[data-editor-action="save"]').textContent = "Save";
  const published = authoring.editorDialog.querySelector(".editor-published-at");
  published.hidden = false;
  published.textContent = `Published ${formatTimestamp(entry.publishedAt)}`;
  authoring.editorDialog.showModal();
  authoring.editorForm.elements.content.focus();
}

function closeEditor() {
  if (authoring.busy) return;
  if (authoring.editorDialog.open) authoring.editorDialog.close();
  resetEditor();
}

function addEditorImages(event) {
  const accepted = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
  const rejected = [];
  for (const file of event.currentTarget.files) {
    if (!accepted.has(file.type)) {
      rejected.push(file.name);
      continue;
    }
    authoring.editorImages.push({
      key: crypto.randomUUID(),
      kind: "new",
      file,
      alt: "",
      previewUrl: URL.createObjectURL(file),
    });
  }
  event.currentTarget.value = "";
  renderEditorImages();
  setEditorMessage(
    rejected.length ? `Unsupported image: ${rejected.join(", ")}` : "",
    rejected.length ? "error" : "status",
  );
}

function removeEditorImage(key) {
  const image = authoring.editorImages.find((candidate) => candidate.key === key);
  if (image?.kind === "new") URL.revokeObjectURL(image.previewUrl);
  authoring.editorImages = authoring.editorImages.filter((candidate) => candidate.key !== key);
  renderEditorImages();
}

function renderEditorImages() {
  const list = authoring.editorDialog.querySelector(".editor-image-list");
  list.replaceChildren();
  for (const imageData of authoring.editorImages) {
    const item = document.createElement("div");
    const image = document.createElement("img");
    const alt = document.createElement("input");
    const remove = document.createElement("button");
    item.className = "editor-image-item";
    item.dataset.imageKey = imageData.key;
    image.className = "editor-image-preview";
    image.src = imageData.previewUrl;
    image.alt = "";
    alt.className = "field-input";
    alt.type = "text";
    alt.value = imageData.alt;
    alt.placeholder = "Alternative text (optional)";
    alt.setAttribute("aria-label", "Image alternative text");
    remove.className = "editor-image-remove";
    remove.type = "button";
    remove.dataset.removeImage = imageData.key;
    remove.textContent = "Remove";
    item.append(image, alt, remove);
    list.append(item);
  }
}

function confirmDeletion() {
  if (authoring.confirmResolver) return Promise.resolve(false);
  authoring.confirmDialog.returnValue = "cancel";
  authoring.confirmDialog.showModal();
  return new Promise((resolve) => { authoring.confirmResolver = resolve; });
}

function singaporeTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  const part = (type) => parts.find((candidate) => candidate.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}+08:00`;
}

function createJournalId(timestamp) {
  const compact = timestamp.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const random = [...crypto.getRandomValues(new Uint8Array(2))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${compact}-${random}`;
}

function encodeImageFile(image) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error(`Image ${image.file.name} could not be encoded.`));
        return;
      }
      resolve({
        key: image.key,
        name: image.file.name,
        type: image.file.type,
        data: result.slice(separator + 1),
      });
    });
    reader.addEventListener("error", () => reject(
      reader.error || new Error(`Image ${image.file.name} could not be read.`),
    ));
    reader.readAsDataURL(image.file);
  });
}

function applyJournalData(year, entries, nextYears, pushHistory = false) {
  dataGeneration += 1;
  loadPromises.clear();
  years = normalizeYears(nextYears);
  catalogError = null;
  loadErrors.delete(year);
  if (entries.length) {
    entriesByYear.set(year, [...entries].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)));
  } else {
    entriesByYear.delete(year);
  }
  state.year = entries.length ? year : years[0] || "";
  if (location.hash !== routeHash(state.year)) updateRoute(state.year, !pushHistory);
  render();
}

async function saveEditor(event) {
  event.preventDefault();
  if (!canAuthor() || authoring.busy) return;
  const body = authoring.editorForm.elements.content.value.trim();
  if (!body && authoring.editorImages.length === 0) {
    setEditorMessage("Add content or at least one image.", "error");
    return;
  }
  setAuthoringBusy(true);
  setEditorMessage(authoring.originalEntry ? "Saving..." : "Publishing...");
  let completed = false;
  try {
    const original = authoring.originalEntry;
    const publishedAt = original?.publishedAt || singaporeTimestamp();
    const year = publishedAt.slice(0, 4);
    const id = original?.id || createJournalId(publishedAt);
    const imageSpecs = authoring.editorImages.map((image) => image.kind === "existing"
      ? { kind: "existing", src: image.src, alt: image.alt.trim() }
      : { kind: "new", key: image.key, alt: image.alt.trim() });
    const uploads = await Promise.all(
      authoring.editorImages.filter((image) => image.kind === "new").map(encodeImageFile),
    );
    const result = await editorRequest("save", {
      mode: original ? "edit" : "create",
      ...(original ? { baseEntry: original } : {}),
      entry: { id, publishedAt, content: body, images: [] },
      images: imageSpecs,
      uploads,
    });
    const resultYear = String(result.year || "");
    const nextEntries = validateEntries(result.entries, resultYear);
    applyJournalData(resultYear, nextEntries, result.years, result.status === "created");
    setAuthoringStatus(operationFeedback(
      result,
      result.status === "unchanged"
        ? "No Journal changes to save."
        : (result.status === "updated" ? "Journal updated." : "Journal published."),
    ));
    completed = true;
  } catch (error) {
    setEditorMessage(error.message || "The Journal could not be saved.", "error");
  } finally {
    setAuthoringBusy(false);
    if (completed) closeEditor();
  }
}

async function deleteJournal(id) {
  const currentEntries = entriesByYear.get(state.year) || [];
  const entry = currentEntries.find((candidate) => candidate.id === id);
  if (!entry || !(await confirmDeletion())) return;
  setAuthoringBusy(true);
  setAuthoringStatus("Deleting Journal...");
  try {
    const result = await editorRequest("delete", { year: state.year, id, baseEntry: entry });
    const nextEntries = result.entries.length ? validateEntries(result.entries, state.year) : [];
    applyJournalData(state.year, nextEntries, result.years);
    setAuthoringStatus(operationFeedback(result, "Journal deleted."));
  } catch (error) {
    setAuthoringStatus(error.message || "The Journal could not be deleted.", "error");
  } finally {
    setAuthoringBusy(false);
  }
}

async function setupCloudAuthoring() {
  const authLink = byId("auth-link");
  const setLoginReturn = () => {
    const current = `${location.pathname}${location.search}${location.hash}`;
    authLink.href = `/api/session?return=${encodeURIComponent(current)}`;
  };
  setLoginReturn();
  authLink.addEventListener("click", () => { if (!authoringSession) setLoginReturn(); });
  try {
    const { response, result } = await fetchJson("/api/session", {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    });
    if (!response.ok || response.type === "opaqueredirect" || !result.authenticated || !result.canEdit) return;
  } catch {
    return;
  }

  authoringSession = true;
  authLink.textContent = "Log out";
  authLink.href = "/cdn-cgi/access/logout";

  const row = byId("journal-authoring-template").content.cloneNode(true);
  authoring.status = row.querySelector(".journal-authoring-status");
  authoring.newButton = row.querySelector('[data-authoring-action="new"]');
  byId("journal-editor-slot").append(row);

  const editor = byId("journal-editor-template").content.cloneNode(true);
  authoring.editorDialog = editor.querySelector("dialog");
  authoring.editorForm = editor.querySelector("form");
  document.body.append(editor);

  const confirm = byId("confirm-template").content.cloneNode(true);
  authoring.confirmDialog = confirm.querySelector("dialog");
  document.body.append(confirm);

  authoring.newButton.addEventListener("click", openNewEditor);
  authoring.editorForm.addEventListener("submit", saveEditor);
  authoring.editorForm.elements.images.addEventListener("change", addEditorImages);
  authoring.editorDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!authoring.busy) closeEditor();
  });
  for (const button of authoring.editorDialog.querySelectorAll('[data-editor-action="close"]')) {
    button.addEventListener("click", closeEditor);
  }

  const imageList = authoring.editorDialog.querySelector(".editor-image-list");
  imageList.addEventListener("input", (event) => {
    const item = event.target.closest("[data-image-key]");
    const image = authoring.editorImages.find((candidate) => candidate.key === item?.dataset.imageKey);
    if (image && event.target.matches("input")) image.alt = event.target.value;
  });
  imageList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-image]");
    if (button) removeEditorImage(button.dataset.removeImage);
  });

  for (const button of authoring.confirmDialog.querySelectorAll("[data-confirm-value]")) {
    button.addEventListener("click", () => authoring.confirmDialog.close(button.dataset.confirmValue));
  }
  authoring.confirmDialog.addEventListener("close", () => {
    authoring.confirmResolver?.(authoring.confirmDialog.returnValue === "delete");
    authoring.confirmResolver = null;
  });

  try {
    const { response, result } = await fetchJson("/api/authoring/status", { cache: "no-store" });
    if (!response.ok) throw new Error(result.error || "Cloud authoring is unavailable.");
    authoring.connected = !result.journalError;
    authoring.newButton.disabled = !canAuthor();
    setAuthoringStatus(
      result.journalError
        ? result.journalError
        : `Cloud Journal authoring is enabled${result.publishing?.branch ? ` on ${result.publishing.branch}` : ""}.`,
      result.journalError ? "error" : "status",
    );
  } catch {
    authoring.connected = false;
    authoring.newButton.disabled = true;
    setAuthoringStatus("Cloud authoring is unavailable. Reload or sign in again.", "error");
  }
  render();
}

function setupLightbox() {
  const fragment = byId("journal-lightbox-template").content.cloneNode(true);
  lightbox.dialog = fragment.querySelector("dialog");
  lightbox.image = fragment.querySelector(".journal-lightbox-image");
  lightbox.caption = fragment.querySelector(".journal-lightbox-caption");
  document.body.append(fragment);
  const close = () => lightbox.dialog.close();
  lightbox.dialog.addEventListener("click", (event) => { if (event.target === lightbox.dialog) close(); });
  lightbox.dialog.querySelector('[data-lightbox-action="close"]').addEventListener("click", close);
  lightbox.image.addEventListener("click", close);
  lightbox.dialog.addEventListener("close", () => {
    const trigger = lightbox.trigger;
    const scroll = lightbox.returnScroll;
    lightbox.trigger = null;
    lightbox.returnScroll = null;
    lightbox.image.removeAttribute("src");
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      if (scroll) window.scrollTo(scroll.left, scroll.top);
    });
  });
}

async function initialize() {
  try {
    const catalog = (await importDataModule("journals/catalog.js")).default;
    years = normalizeYears(catalog?.years);
  } catch (error) {
    catalogError = error;
  }
  state.year = requestedYear();
  if (location.hash !== routeHash(state.year)) updateRoute(state.year, true);
  byId("footer-text").textContent = `© ${new Date().getFullYear()} Xayah Hina. All rights reserved.`;
  setupLightbox();

  byId("year-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-year]");
    if (button) selectYear(button.dataset.year);
  });
  byId("search-input").addEventListener("input", (event) => {
    state.query = event.currentTarget.value;
    renderArchive();
  });
  byId("archive-list").addEventListener("click", (event) => {
    const image = event.target.closest("[data-journal-image]");
    if (image) {
      openLightbox(image);
      return;
    }
    const button = event.target.closest("[data-journal-action]");
    if (!button || !canAuthor() || authoring.busy) return;
    if (button.dataset.journalAction === "edit") openEditEditor(button.dataset.journalId);
    if (button.dataset.journalAction === "delete") void deleteJournal(button.dataset.journalId);
  });

  let routeQueued = false;
  const scheduleRoute = () => {
    if (routeQueued) return;
    routeQueued = true;
    queueMicrotask(() => {
      routeQueued = false;
      applyRoute();
    });
  };
  window.addEventListener("popstate", scheduleRoute);
  window.addEventListener("hashchange", scheduleRoute);

  render();
  void refreshCatalog();
  void setupCloudAuthoring();
}

initialize().catch((error) => {
  console.error("Journal initialization failed.", error);
  const message = document.createElement("p");
  message.className = "empty-state";
  message.textContent = "The page could not be initialized.";
  byId("archive-list")?.replaceChildren(message);
});
