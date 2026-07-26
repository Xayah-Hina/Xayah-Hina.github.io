const links = [...document.querySelectorAll("[data-toc-link]")];
const headings = links
  .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
  .filter(Boolean);
const dialog = document.querySelector("[data-toc-dialog]");
const openButton = document.querySelector("[data-toc-open]");
const closeButton = document.querySelector("[data-toc-close]");

function setCurrent(id) {
  for (const link of links) {
    if (decodeURIComponent(link.hash.slice(1)) === id) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}

function closeDialog(restoreFocus = true) {
  if (!dialog?.open) return;
  dialog.close();
  if (restoreFocus) openButton?.focus();
}

if ("IntersectionObserver" in window && headings.length) {
  const visible = new Map();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) visible.set(entry.target.id, entry);
    const current = headings
      .map((heading) => visible.get(heading.id))
      .filter((entry) => entry?.isIntersecting)
      .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
    if (current) setCurrent(current.target.id);
  }, { rootMargin: "-12% 0px -72% 0px", threshold: [0, 1] });
  headings.forEach((heading) => observer.observe(heading));
}

openButton?.addEventListener("click", () => dialog?.showModal());
closeButton?.addEventListener("click", () => closeDialog());
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});
dialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});

for (const link of links) {
  link.addEventListener("click", () => {
    if (dialog?.open) closeDialog(false);
    const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!heading) return;
    window.setTimeout(() => {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }, 0);
  });
}
