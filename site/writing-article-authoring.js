"use strict";

const authLink = document.querySelector("[data-auth-link]");
const editButton = document.querySelector("[data-edit-writing]");
const articleId = editButton?.dataset.editWriting || "";
let authenticated = false;

function currentReturnPath() {
  return `${location.pathname}${location.search}${location.hash}`;
}

function setLoginLink() {
  if (!authLink) return;
  authLink.textContent = "Log in";
  authLink.href = `/api/session?return=${encodeURIComponent(currentReturnPath())}`;
}

function closeEditorOverlay() {
  const overlay = document.querySelector("[data-writing-editor-overlay]");
  if (!overlay) return;
  overlay.remove();
  document.body.classList.remove("article-editor-open");
  editButton?.focus();
}

function openEditorOverlay() {
  if (!/^\d{8}-\d{6}$/.test(articleId) || document.querySelector("[data-writing-editor-overlay]")) return;
  const overlay = document.createElement("div");
  const frame = document.createElement("iframe");
  overlay.className = "article-editor-overlay";
  overlay.dataset.writingEditorOverlay = "";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Writing editor");
  frame.className = "article-editor-frame";
  frame.title = "Writing editor";
  frame.src = `/?edit-writing=${encodeURIComponent(articleId)}#writing/${articleId.slice(0, 4)}`;
  overlay.append(frame);
  document.body.append(overlay);
  document.body.classList.add("article-editor-open");
}

async function initializeAuthoring() {
  setLoginLink();
  authLink?.addEventListener("click", () => {
    if (!authenticated) setLoginLink();
  });
  try {
    const response = await fetch("/api/session", {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    });
    if (!response.ok || response.type === "opaqueredirect") return;
    const session = await response.json();
    if (!session.authenticated || !session.canEdit) return;
  } catch {
    return;
  }

  if (authLink) {
    authenticated = true;
    authLink.textContent = "Log out";
    authLink.href = "/cdn-cgi/access/logout";
  }
  if (editButton) editButton.hidden = false;
}

editButton?.addEventListener("click", openEditorOverlay);
window.addEventListener("message", (event) => {
  if (event.origin === location.origin && event.data?.type === "xayah-writing-editor-close") closeEditorOverlay();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("[data-writing-editor-overlay]")) {
    closeEditorOverlay();
  }
});

initializeAuthoring();
