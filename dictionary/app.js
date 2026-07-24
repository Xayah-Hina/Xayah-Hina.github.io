"use strict";

const byId = (id) => document.getElementById(id);
const elements = {
  name: byId("lexicon-name"),
  version: byId("lexicon-version"),
  summary: byId("lexicon-summary"),
  searchForm: byId("search-form"),
  searchInput: byId("search-input"),
  filter: byId("lexicon-filter"),
  suggestions: byId("search-suggestions"),
  pageStatus: byId("page-status"),
  workspace: byId("dictionary-workspace"),
  alphabet: byId("alphabet"),
  prefixPath: byId("prefix-path"),
  prefixBranches: byId("prefix-branches"),
  wordListKicker: byId("word-list-kicker"),
  wordListTitle: byId("word-list-title"),
  wordListCount: byId("word-list-count"),
  wordList: byId("word-list"),
  entry: byId("dictionary-entry"),
  authoring: byId("cloud-authoring"),
  cloudStatus: byId("cloud-status"),
  publishButton: byId("publish-button"),
  editor: byId("personal-editor"),
  personalForm: byId("personal-form"),
  editorTitle: byId("editor-title"),
  editorMessage: byId("editor-message"),
  examplesEditorList: byId("examples-editor-list"),
  exampleTemplate: byId("example-editor-template"),
};

const isCloudEditor = location.origin === "https://editor.xayah.me";
const SUGGESTION_LIMIT = 16;
const LOCATOR_PREFIX_LENGTH = 5;
const RELATION_LABELS = {
  lemma: "lemma",
  past: "past",
  pastParticiple: "past participle",
  presentParticiple: "present participle",
  thirdPersonSingular: "third-person singular",
  comparative: "comparative",
  superlative: "superlative",
  plural: "plural",
};
const state = {
  manifest: null,
  keys: [],
  byCanonical: new Map(),
  byEntryId: new Map(),
  payloadCache: new Map(),
  personalCache: new Map(),
  selectedKey: null,
  currentEntry: null,
  oovWord: "",
  prefix: "a",
  filterTag: "",
  suggestionEntries: [],
  activeSuggestion: -1,
  navigationVersion: 0,
  authoring: false,
  editorBaseline: "",
  editorBusy: false,
  dictionaryPendingCount: 0,
  unpublishedEntryIds: new Set(),
};

function canonicalKey(value) {
  return String(value || "").normalize("NFKC").toLowerCase();
}

function clear(node) {
  node.replaceChildren();
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function fetchJson(path, version = "") {
  const url = new URL(path, location.href);
  if (version) url.searchParams.set("v", version);
  const response = await fetch(url, { cache: version ? "default" : "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}

function setPageStatus(message, isError = false) {
  elements.pageStatus.textContent = message;
  elements.pageStatus.hidden = !message;
  elements.pageStatus.style.color = isError ? "var(--danger)" : "";
}

function updateUrl(parameters, push = true) {
  const url = new URL(location.href);
  url.search = "";
  if (state.filterTag) url.searchParams.set("view", state.filterTag);
  for (const [key, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(key, value);
  }
  history[push ? "pushState" : "replaceState"]({}, "", url);
}

function lowerBound(value) {
  let low = 0;
  let high = state.keys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (state.keys[middle].canonicalKey < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function matchesActiveView(entry) {
  return !state.filterTag || entry.tags.includes(state.filterTag);
}

function allEntriesForPrefix(prefix) {
  if (!prefix) return state.keys;
  const start = lowerBound(prefix);
  const end = lowerBound(`${prefix}\uffff`);
  return state.keys.slice(start, end);
}

function closeSuggestions() {
  state.suggestionEntries = [];
  state.activeSuggestion = -1;
  clear(elements.suggestions);
  elements.suggestions.hidden = true;
  elements.searchInput.setAttribute("aria-expanded", "false");
  elements.searchInput.removeAttribute("aria-activedescendant");
}

function setActiveSuggestion(index) {
  if (!state.suggestionEntries.length) return;
  state.activeSuggestion = (index + state.suggestionEntries.length) % state.suggestionEntries.length;
  const options = [...elements.suggestions.querySelectorAll('[role="option"]')];
  options.forEach((option, optionIndex) => option.setAttribute("aria-selected", String(optionIndex === state.activeSuggestion)));
  const active = options[state.activeSuggestion];
  if (active) {
    elements.searchInput.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }
}

function renderSuggestions() {
  const query = canonicalKey(elements.searchInput.value).trim();
  closeSuggestions();
  if (!query) return;
  state.suggestionEntries = entriesForPrefix(query).slice(0, SUGGESTION_LIMIT);
  if (!state.suggestionEntries.length) return;

  const fragment = document.createDocumentFragment();
  state.suggestionEntries.forEach((entry, index) => {
    const button = makeElement("button", "suggestion-button");
    button.type = "button";
    button.id = `search-suggestion-${index}`;
    button.tabIndex = -1;
    button.dataset.suggestionIndex = String(index);
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    const viewTags = state.manifest.browseViews.map((view) => view.id).filter((tag) => entry.tags.includes(tag));
    button.append(
      makeElement("span", "suggestion-word", entry.word),
      makeElement("span", "suggestion-meta", `${viewTags.map((tag) => tag.toUpperCase()).join(" · ") || "General"} · #${entry.rank}`),
    );
    fragment.append(button);
  });
  elements.suggestions.append(fragment);
  elements.suggestions.hidden = false;
  elements.searchInput.setAttribute("aria-expanded", "true");
}

function selectSuggestion(index) {
  const entry = state.suggestionEntries[index];
  if (!entry) return;
  closeSuggestions();
  locateWord(entry);
}

function renderAlphabet(activePrefix = "") {
  clear(elements.alphabet);
  for (let code = 97; code <= 122; code += 1) {
    const letter = String.fromCharCode(code);
    const button = makeElement("button", "", letter.toUpperCase());
    button.type = "button";
    button.dataset.prefix = letter;
    button.setAttribute("aria-pressed", String(activePrefix.startsWith(letter)));
    elements.alphabet.append(button);
  }
}

function entriesForPrefix(prefix) {
  return allEntriesForPrefix(prefix).filter(matchesActiveView);
}

function renderPrefixMap(prefix) {
  const effective = prefix || "a";
  renderAlphabet(effective);
  clear(elements.prefixPath);
  for (let length = 1; length <= effective.length; length += 1) {
    const part = effective.slice(0, length);
    const button = makeElement("button", "", part.toUpperCase());
    button.type = "button";
    button.dataset.prefix = part;
    elements.prefixPath.append(button);
  }

  clear(elements.prefixBranches);
  const branches = new Map();
  for (const entry of entriesForPrefix(effective)) {
    const next = entry.canonicalKey.slice(0, effective.length + 1);
    if (next.length <= effective.length) continue;
    branches.set(next, (branches.get(next) || 0) + 1);
  }
  if (branches.size === 0) {
    elements.prefixBranches.append(makeElement("p", "empty-message", "No deeper branches."));
    return;
  }
  for (const [branch, count] of [...branches].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const button = makeElement("button", "prefix-branch");
    button.type = "button";
    button.dataset.prefix = branch;
    button.append(makeElement("span", "", branch), makeElement("span", "", String(count)));
    elements.prefixBranches.append(button);
  }
}

function renderWordList(entries, { title, kicker }) {
  elements.wordListTitle.textContent = title;
  elements.wordListKicker.textContent = kicker;
  elements.wordListCount.textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  clear(elements.wordList);
  if (entries.length === 0) {
    elements.wordList.append(makeElement("p", "empty-message", "No entries in this region."));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const button = makeElement("button", "word-button");
    button.type = "button";
    button.dataset.entryId = entry.entryId;
    button.setAttribute("aria-current", String(entry.entryId === state.selectedKey?.entryId));
    button.append(makeElement("span", "", entry.word), makeElement("small", "", `#${entry.rank}`));
    fragment.append(button);
  }
  elements.wordList.append(fragment);
  const selected = elements.wordList.querySelector('[aria-current="true"]');
  if (selected) {
    elements.wordList.scrollTop = Math.max(0, selected.offsetTop - elements.wordList.clientHeight / 2);
  } else {
    elements.wordList.scrollTop = 0;
  }
}

function updateWordListSelection() {
  for (const button of elements.wordList.querySelectorAll("[data-entry-id]")) {
    button.setAttribute("aria-current", String(button.dataset.entryId === state.selectedKey?.entryId));
  }
}

function renderBrowseContext() {
  const entries = entriesForPrefix(state.prefix);
  renderPrefixMap(state.prefix);
  const viewLabel = state.filterTag ? state.filterTag.toUpperCase() : "General";
  renderWordList(entries, { title: state.prefix.toUpperCase(), kicker: `${viewLabel} prefix region` });
  return entries;
}

function renderPrefixOverview(prefix, entries) {
  clear(elements.entry);
  const wrapper = makeElement("div", "oov-panel");
  wrapper.append(
    makeElement("p", "eyebrow", "Prefix region"),
    makeElement("h2", "", prefix.toUpperCase()),
    makeElement("p", "", `${entries.length} frozen entries begin with “${prefix}”. Select a word to inspect its dictionary entry.`),
  );
  elements.entry.append(wrapper);
}

function showPrefix(rawPrefix, push = true) {
  state.navigationVersion += 1;
  const prefix = canonicalKey(rawPrefix).trim();
  const effective = prefix || "a";
  state.prefix = effective;
  state.selectedKey = null;
  state.currentEntry = null;
  state.oovWord = "";
  elements.searchInput.value = effective;
  closeSuggestions();
  const entries = renderBrowseContext();
  renderPrefixOverview(effective, entries);
  updateUrl({ prefix: effective }, push);
}

function renderOov(rawWord, push = true) {
  state.navigationVersion += 1;
  const word = String(rawWord || "").trim();
  state.selectedKey = null;
  state.currentEntry = null;
  state.oovWord = word;
  elements.searchInput.value = word;
  closeSuggestions();
  updateWordListSelection();
  clear(elements.entry);
  const wrapper = makeElement("div", "oov-panel");
  wrapper.append(
    makeElement("p", "eyebrow", "Out of vocabulary"),
    makeElement("h2", "", word || "Unknown entry"),
    makeElement("p", "", `Not in ${state.manifest.name} ${state.manifest.version}. This frozen version cannot create or insert new keys.`),
  );
  elements.entry.append(wrapper);
  updateUrl({ prefix: state.prefix, word }, push);
}

async function loadEntry(key) {
  if (!state.payloadCache.has(key.shard)) {
    const filename = String(key.shard).padStart(4, "0");
    const entries = await fetchJson(`generated/blocks/${filename}.json`, state.manifest.dataVersion);
    state.payloadCache.set(key.shard, new Map(entries.map((entry) => [entry.entryId, entry])));
  }
  return state.payloadCache.get(key.shard).get(key.entryId);
}

async function loadPersonal(key) {
  if (state.personalCache.has(key.entryId)) return state.personalCache.get(key.entryId);
  if (!state.manifest.personalShards.includes(key.shard)) {
    state.personalCache.set(key.entryId, null);
    return null;
  }
  const filename = String(key.shard).padStart(4, "0");
  const records = await fetchJson(`generated/personal/${filename}.json`, state.manifest.dataVersion);
  for (const record of records) state.personalCache.set(record.entryId, record);
  if (!state.personalCache.has(key.entryId)) state.personalCache.set(key.entryId, null);
  return state.personalCache.get(key.entryId);
}

function addressBadge(text) {
  return makeElement("span", "address-badge", text);
}

function appendTextSection(parent, title, values, unavailableMessage) {
  const section = makeElement("section", "entry-section");
  section.append(makeElement("h3", "", title));
  if (!values?.length) {
    section.append(makeElement("p", "unavailable", unavailableMessage));
  } else {
    for (const value of values) section.append(makeElement("p", "", value));
  }
  parent.append(section);
}

function renderRelations(parent, relations) {
  const section = makeElement("section", "entry-section");
  section.append(makeElement("h3", "", "Word forms and lemma"));
  const list = makeElement("div", "relations");
  if (!relations.length) {
    list.append(makeElement("p", "unavailable", "No exchange relations provided by ECDICT."));
  } else {
    for (const relation of relations) {
      const target = relation.targetEntryId ? state.byEntryId.get(relation.targetEntryId) : null;
      const element = target ? makeElement("button", "relation-button") : makeElement("span", "relation-label");
      if (target) {
        element.type = "button";
        element.dataset.entryId = target.entryId;
      }
      element.append(makeElement("span", "relation-kind", RELATION_LABELS[relation.kind] || relation.kind), document.createTextNode(relation.word));
      list.append(element);
    }
  }
  section.append(list);
  parent.append(section);
}

function appendPersonalField(parent, title, value) {
  if (!value) return;
  const field = makeElement("div", "personal-field");
  field.append(makeElement("h4", "", title), makeElement("p", "", value));
  parent.append(field);
}

function renderPersonal(parent, personal) {
  const section = makeElement("section", "entry-section personal-section");
  const heading = makeElement("div", "personal-heading");
  heading.append(makeElement("h3", "", "Personal Knowledge"));
  if (state.authoring) {
    const actions = makeElement("div", "personal-actions");
    if (state.unpublishedEntryIds.has(state.currentEntry?.entryId)) {
      actions.append(makeElement("span", "draft-badge", "Private draft"));
    }
    const edit = makeElement("button", "text-button", "Edit");
    edit.type = "button";
    edit.dataset.action = "edit-personal";
    actions.append(edit);
    heading.append(actions);
  }
  section.append(heading);
  if (!personal) {
    section.append(makeElement("p", "unavailable", "No personal knowledge has been published for this entry."));
    parent.append(section);
    return;
  }
  appendPersonalField(section, "Chinese summary", personal.summary);
  appendPersonalField(section, "Usage notes", personal.usageNotes);
  appendPersonalField(section, "Confusion notes", personal.confusionNotes);
  if (personal.examples.length) {
    const field = makeElement("div", "personal-field");
    field.append(makeElement("h4", "", "Examples"));
    const list = makeElement("ol", "example-list");
    for (const example of personal.examples) {
      const item = makeElement("li", "example-card");
      item.append(makeElement("p", "", example.sentence));
      if (example.translation) item.append(makeElement("p", "", example.translation));
      const meta = [example.source, example.comment].filter(Boolean).join(" · ");
      if (meta) item.append(makeElement("p", "example-meta", meta));
      list.append(item);
    }
    field.append(list);
    section.append(field);
  }
  if (![personal.summary, personal.usageNotes, personal.confusionNotes].some(Boolean) && !personal.examples.length) {
    section.append(makeElement("p", "unavailable", "This personal entry is empty."));
  }
  parent.append(section);
}

function renderMetadata(parent, metadata) {
  const details = makeElement("details", "entry-section");
  details.append(makeElement("summary", "", "ECDICT metadata"));
  const grid = makeElement("dl", "metadata-grid");
  const items = [
    ["Tags", metadata.tags.join(" · ") || "Unavailable"],
    ["Included by", (metadata.inclusionReasons || []).join(" · ") || "Unavailable"],
    ["Collins", metadata.collins ? `${metadata.collins} ${metadata.collins === 1 ? "star" : "stars"}` : "Unavailable"],
    ["Oxford 3000", metadata.oxford3000 ? "Yes" : "No"],
    ["BNC rank", metadata.bncRank ? String(metadata.bncRank) : "Unavailable"],
    ["Frequency rank", metadata.frqRank ? String(metadata.frqRank) : "Unavailable"],
  ];
  for (const [term, description] of items) {
    const cell = makeElement("div", "");
    cell.append(makeElement("dt", "", term), makeElement("dd", "", description));
    grid.append(cell);
  }
  details.append(grid);
  parent.append(details);
}

function renderEntry(entry, personal) {
  clear(elements.entry);
  const header = makeElement("header", "entry-header");
  const heading = makeElement("div", "");
  heading.append(makeElement("h2", "", entry.word));
  heading.append(makeElement("p", entry.phonetic ? "phonetic" : "phonetic unavailable", entry.phonetic || "Pronunciation unavailable in ECDICT."));
  const navigation = makeElement("div", "entry-navigation");
  const previous = state.keys[entry.rank - 2];
  const next = state.keys[entry.rank];
  for (const [label, target] of [["← Previous", previous], ["Next →", next]]) {
    const button = makeElement("button", "", label);
    button.type = "button";
    button.disabled = !target;
    if (target) button.dataset.entryId = target.entryId;
    navigation.append(button);
  }
  header.append(heading, navigation);
  elements.entry.append(header);

  const address = makeElement("div", "entry-address");
  address.append(
    addressBadge(`${state.manifest.name} ${state.manifest.version}`),
    addressBadge(`Rank ${entry.rank} / ${state.manifest.totalEntries}`),
    addressBadge(`Block ${entry.block}`),
    addressBadge(`Slot ${entry.slot} / ${state.manifest.cognitiveBlockSize}`),
  );
  elements.entry.append(address);
  appendTextSection(elements.entry, "Chinese translation", entry.translations, "Chinese translation unavailable in ECDICT.");
  appendTextSection(elements.entry, "English definition", entry.definitions, "English definition unavailable in ECDICT.");
  renderRelations(elements.entry, entry.relations);
  renderPersonal(elements.entry, personal);
  renderMetadata(elements.entry, entry.metadata);
}

async function showWord(key, push = true) {
  if (!key) return;
  const navigationVersion = ++state.navigationVersion;
  closeSuggestions();
  setPageStatus("Loading entry…");
  try {
    const [entry, personal] = await Promise.all([loadEntry(key), loadPersonal(key)]);
    if (navigationVersion !== state.navigationVersion) return;
    if (!entry) throw new Error("The selected entry is missing from its payload shard.");
    state.selectedKey = key;
    state.currentEntry = entry;
    state.oovWord = "";
    updateWordListSelection();
    renderEntry(entry, personal);
    updateUrl({ prefix: state.prefix, word: entry.word }, push);
    setPageStatus("");
  } catch (error) {
    if (navigationVersion !== state.navigationVersion) return;
    setPageStatus(error.message || "The entry could not be loaded.", true);
  }
}

function locatorPrefix(key) {
  return key.canonicalKey.slice(0, Math.min(LOCATOR_PREFIX_LENGTH, key.canonicalKey.length)) || "a";
}

function locateWord(key, push = true) {
  if (!key) return;
  if (!matchesActiveView(key)) {
    state.filterTag = "";
    elements.filter.value = "";
    renderLexiconSummary();
  }
  state.prefix = locatorPrefix(key);
  state.selectedKey = key;
  state.currentEntry = null;
  state.oovWord = "";
  elements.searchInput.value = key.word;
  closeSuggestions();
  renderBrowseContext();
  showWord(key, push);
}

function applyLocation(push = false) {
  state.navigationVersion += 1;
  const parameters = new URLSearchParams(location.search);
  const requestedView = parameters.get("view") || "";
  const validViews = new Set((state.manifest.browseViews || []).map((view) => view.id));
  state.filterTag = validViews.has(requestedView) ? requestedView : "";
  elements.filter.value = state.filterTag;
  renderLexiconSummary();
  const requestedWord = parameters.get("word");
  const requestedKey = requestedWord === null ? null : state.byCanonical.get(canonicalKey(requestedWord));
  const requestedPrefix = parameters.get("prefix");
  state.prefix = canonicalKey(requestedPrefix || (requestedKey ? locatorPrefix(requestedKey) : "a")).trim() || "a";
  state.selectedKey = null;
  state.currentEntry = null;
  state.oovWord = "";
  const entries = renderBrowseContext();
  if (requestedWord !== null) {
    elements.searchInput.value = requestedWord;
    if (requestedKey) showWord(requestedKey, push);
    else renderOov(requestedWord, push);
    return;
  }
  elements.searchInput.value = state.prefix;
  renderPrefixOverview(state.prefix, entries);
  updateUrl({ prefix: state.prefix }, push);
}

function renderLexiconSummary() {
  const activeView = (state.manifest.browseViews || []).find((view) => view.id === state.filterTag);
  const viewText = activeView
    ? `${activeView.label} view: ${activeView.totalEntries.toLocaleString()} keys`
    : `${state.manifest.totalEntries.toLocaleString()} immutable keys`;
  elements.summary.textContent = `${viewText} · fixed ${state.manifest.cognitiveBlockSize}-word address blocks · strict lexicographic ranks`;
}

function populateBrowseViews() {
  elements.filter.options[0].textContent = `All words (${state.manifest.totalEntries.toLocaleString()})`;
  for (const view of state.manifest.browseViews || []) {
    const option = makeElement("option", "", `${view.label} (${view.totalEntries.toLocaleString()})`);
    option.value = view.id;
    elements.filter.append(option);
  }
}

function refreshActiveView() {
  closeSuggestions();
  state.filterTag = elements.filter.value;
  renderLexiconSummary();
  renderBrowseContext();
  updateUrl({ prefix: state.prefix, word: state.currentEntry?.word || state.oovWord }, false);
}

function editorSnapshot() {
  const form = elements.personalForm.elements;
  const examples = [...elements.examplesEditorList.querySelectorAll(".example-editor-item")].map((item) => {
    const value = (field) => item.querySelector(`[data-example-field="${field}"]`).value;
    return {
      id: value("id"),
      sentence: value("sentence").trim(),
      translation: value("translation").trim(),
      source: value("source").trim(),
      comment: value("comment").trim(),
    };
  }).filter((example) => Object.entries(example).some(([key, value]) => key !== "id" && value));
  return {
    summary: form.summary.value.trim(),
    usageNotes: form.usageNotes.value.trim(),
    confusionNotes: form.confusionNotes.value.trim(),
    examples,
  };
}

function serializedEditor() {
  return JSON.stringify(editorSnapshot());
}

function renumberExamples() {
  [...elements.examplesEditorList.querySelectorAll(".example-editor-item")].forEach((item, index) => {
    item.querySelector("[data-example-number]").textContent = `Example ${index + 1}`;
  });
}

function addExampleEditor(example = {}) {
  const fragment = elements.exampleTemplate.content.cloneNode(true);
  const item = fragment.querySelector(".example-editor-item");
  for (const field of ["id", "sentence", "translation", "source", "comment"]) {
    item.querySelector(`[data-example-field="${field}"]`).value = example[field] || "";
  }
  elements.examplesEditorList.append(fragment);
  renumberExamples();
}

async function cloudRequest(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The cloud Dictionary editor returned an invalid response.");
  }
  if (!response.ok) throw new Error(result.error || "The cloud Dictionary request failed.");
  return result;
}

function updateCloudStatus(sync, fallback = "Cloud Dictionary editing is ready.") {
  if (!sync?.enabled) {
    elements.cloudStatus.textContent = fallback;
    elements.publishButton.disabled = true;
    return;
  }
  const count = Number(sync.dictionaryPendingCount);
  if (Number.isInteger(count) && count >= 0) state.dictionaryPendingCount = count;
  const pending = state.dictionaryPendingCount;
  elements.cloudStatus.textContent = pending
    ? `${pending} private ${pending === 1 ? "draft" : "drafts"} waiting to be published.`
    : (sync.message || fallback);
  elements.publishButton.disabled = state.editorBusy || pending === 0;
}

function updateEntryDraftState(entryId, unpublished) {
  if (unpublished) state.unpublishedEntryIds.add(entryId);
  else state.unpublishedEntryIds.delete(entryId);
}

function applyDictionaryResult(result) {
  const personal = result.personalHasContent ? result.personal : null;
  state.personalCache.set(result.entryId, personal);
  updateEntryDraftState(result.entryId, Boolean(result.unpublished));
  updateCloudStatus(result.sync);
  if (state.currentEntry?.entryId === result.entryId) renderEntry(state.currentEntry, personal);
}

function setEditorBusy(busy) {
  state.editorBusy = busy;
  for (const control of elements.personalForm.querySelectorAll("button, input, textarea")) control.disabled = busy;
  elements.publishButton.disabled = busy || state.dictionaryPendingCount === 0;
}

async function openEditor() {
  if (!state.authoring || !state.currentEntry || !state.selectedKey || state.editorBusy) return;
  const selectedKey = state.selectedKey;
  setEditorBusy(true);
  elements.cloudStatus.textContent = `Loading ${state.currentEntry.word}…`;
  try {
    const result = await cloudRequest("/api/dictionary/open", {
      entryId: selectedKey.entryId,
      shard: selectedKey.shard,
    });
    if (state.selectedKey?.entryId !== selectedKey.entryId) return;
    applyDictionaryResult(result);
    const personal = result.personal;
    const form = elements.personalForm.elements;
    form.summary.value = personal.summary || "";
    form.usageNotes.value = personal.usageNotes || "";
    form.confusionNotes.value = personal.confusionNotes || "";
    clear(elements.examplesEditorList);
    for (const example of personal.examples || []) addExampleEditor(example);
    elements.editorTitle.textContent = `Edit ${state.currentEntry.word}`;
    elements.editorMessage.textContent = result.unpublished ? "Loaded private draft from R2." : "";
    state.editorBaseline = serializedEditor();
    setEditorBusy(false);
    elements.editor.showModal();
    form.summary.focus();
  } catch (error) {
    elements.cloudStatus.textContent = error.message || "Personal Knowledge could not be opened.";
    setPageStatus(error.message || "Personal Knowledge could not be opened.", true);
  } finally {
    if (!elements.editor.open) setEditorBusy(false);
  }
}

function editorIsDirty() {
  return elements.editor.open && serializedEditor() !== state.editorBaseline;
}

function closeEditor() {
  if (state.editorBusy) return;
  if (editorIsDirty() && !window.confirm("Discard unsaved Personal Knowledge changes?")) return;
  elements.editor.close();
}

async function saveEditor(event) {
  event.preventDefault();
  if (!state.currentEntry || !state.selectedKey || state.editorBusy) return;
  const selectedKey = state.selectedKey;
  const personal = editorSnapshot();
  if (personal.examples.some((example) => !example.sentence)) {
    elements.editorMessage.textContent = "Every non-empty example needs an English sentence.";
    return;
  }
  setEditorBusy(true);
  elements.editorMessage.textContent = "Saving private draft…";
  try {
    const result = await cloudRequest("/api/dictionary/save", {
      entryId: selectedKey.entryId,
      shard: selectedKey.shard,
      personal,
    });
    applyDictionaryResult(result);
    state.editorBaseline = JSON.stringify({
      summary: result.personal.summary || "",
      usageNotes: result.personal.usageNotes || "",
      confusionNotes: result.personal.confusionNotes || "",
      examples: (result.personal.examples || []).map(({ id, sentence, translation, source, comment }) => ({
        id, sentence, translation, source, comment,
      })),
    });
    elements.editor.close();
  } catch (error) {
    elements.editorMessage.textContent = error.message || "Personal Knowledge could not be saved.";
  } finally {
    setEditorBusy(false);
  }
}

async function publishPersonal() {
  if (!state.authoring || state.editorBusy || state.dictionaryPendingCount === 0) return;
  setEditorBusy(true);
  elements.cloudStatus.textContent = "Publishing Personal Knowledge to GitHub…";
  try {
    const result = await cloudRequest("/api/dictionary/publish", {});
    for (const entryId of result.publishedEntryIds || []) state.unpublishedEntryIds.delete(entryId);
    updateCloudStatus(result.sync, "Personal Knowledge is published.");
    if (state.currentEntry) {
      renderEntry(state.currentEntry, state.personalCache.get(state.currentEntry.entryId) || null);
    }
  } catch (error) {
    elements.cloudStatus.textContent = error.message || "Personal Knowledge could not be published.";
  } finally {
    setEditorBusy(false);
  }
}

async function setupCloudAuthoring() {
  if (!isCloudEditor) return;
  elements.authoring.hidden = false;
  try {
    const response = await fetch("/api/editor/status", { cache: "no-store" });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("The cloud Editor returned an invalid status response.");
    }
    if (!response.ok) throw new Error(result.error || "The cloud Editor is unavailable.");
    if (result.dictionaryError) throw new Error(result.dictionaryError);
    state.authoring = true;
    updateCloudStatus(result.publishing);
    if (state.currentEntry) renderEntry(state.currentEntry, state.personalCache.get(state.currentEntry.entryId) || null);
  } catch (error) {
    state.authoring = false;
    elements.cloudStatus.textContent = error.message || "The cloud Dictionary editor is unavailable.";
    elements.publishButton.disabled = true;
  }
}

function bindEvents() {
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = elements.searchInput.value.trim();
    if (!query) return;
    closeSuggestions();
    const exact = state.byCanonical.get(canonicalKey(query));
    if (exact) locateWord(exact);
    else if (entriesForPrefix(canonicalKey(query)).length) showPrefix(query);
    else if (allEntriesForPrefix(canonicalKey(query)).length) {
      state.filterTag = "";
      elements.filter.value = "";
      renderLexiconSummary();
      showPrefix(query);
    } else renderOov(query);
  });
  elements.searchInput.addEventListener("input", renderSuggestions);
  elements.searchInput.addEventListener("focus", renderSuggestions);
  elements.searchInput.addEventListener("blur", closeSuggestions);
  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (elements.suggestions.hidden) renderSuggestions();
      setActiveSuggestion(state.activeSuggestion + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (elements.suggestions.hidden) renderSuggestions();
      setActiveSuggestion(state.activeSuggestion < 0 ? state.suggestionEntries.length - 1 : state.activeSuggestion - 1);
    } else if (event.key === "Enter" && state.activeSuggestion >= 0) {
      event.preventDefault();
      selectSuggestion(state.activeSuggestion);
    } else if (event.key === "Escape") {
      closeSuggestions();
    }
  });
  elements.suggestions.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  });
  elements.suggestions.addEventListener("click", (event) => {
    const option = event.target.closest("[data-suggestion-index]");
    if (option) selectSuggestion(Number(option.dataset.suggestionIndex));
  });
  elements.filter.addEventListener("change", refreshActiveView);
  document.addEventListener("pointerdown", (event) => {
    if (!elements.searchForm.contains(event.target)) closeSuggestions();
  });
  elements.alphabet.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prefix]");
    if (button) showPrefix(button.dataset.prefix);
  });
  elements.prefixPath.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prefix]");
    if (button) showPrefix(button.dataset.prefix);
  });
  elements.prefixBranches.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prefix]");
    if (button) showPrefix(button.dataset.prefix);
  });
  elements.wordList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entry-id]");
    if (button) showWord(state.byEntryId.get(button.dataset.entryId));
  });
  elements.entry.addEventListener("click", (event) => {
    const target = event.target.closest("[data-entry-id]");
    if (target) showWord(state.byEntryId.get(target.dataset.entryId));
    if (event.target.closest('[data-action="edit-personal"]')) openEditor();
  });
  elements.personalForm.addEventListener("submit", saveEditor);
  elements.personalForm.addEventListener("click", (event) => {
    const action = event.target.closest("[data-editor-action]")?.dataset.editorAction;
    if (action === "close") closeEditor();
    if (action === "add-example") {
      addExampleEditor();
      elements.examplesEditorList.lastElementChild.querySelector('[data-example-field="sentence"]').focus();
    }
    if (event.target.closest('[data-example-action="remove"]')) {
      event.target.closest(".example-editor-item").remove();
      renumberExamples();
    }
  });
  elements.personalForm.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      elements.personalForm.requestSubmit();
    }
  });
  elements.editor.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEditor();
  });
  elements.publishButton.addEventListener("click", publishPersonal);
  window.addEventListener("popstate", () => applyLocation(false));
  window.addEventListener("beforeunload", (event) => {
    if (!editorIsDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function initialize() {
  bindEvents();
  const manifest = await fetchJson("generated/manifest.json");
  const keys = await fetchJson("generated/keys.json", manifest.dataVersion);
  if (!Array.isArray(keys) || keys.length !== manifest.totalEntries || keys.some((entry) => !Array.isArray(entry.tags))) {
    throw new Error("Dictionary key index is inconsistent.");
  }
  state.manifest = manifest;
  state.keys = keys;
  state.byCanonical = new Map(keys.map((entry) => [entry.canonicalKey, entry]));
  state.byEntryId = new Map(keys.map((entry) => [entry.entryId, entry]));
  elements.name.textContent = manifest.name;
  elements.version.textContent = manifest.version;
  populateBrowseViews();
  elements.workspace.hidden = false;
  setPageStatus("");
  await setupCloudAuthoring();
  applyLocation(false);
}

initialize().catch((error) => {
  console.error("Dictionary initialization failed.", error);
  setPageStatus(error.message || "Dictionary initialization failed.", true);
});
