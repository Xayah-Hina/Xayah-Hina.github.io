# Writing Markdown authoring

Published Writing content lives only in `writing/<id>/<id>.md`. The Pages build parses these files, renders static article HTML, and generates `writing/catalog.js` plus yearly modules inside `_site`; generated modules are not source files.

## Required Front matter

Use exactly these fields in this order:

```yaml
---
id: "20260715-090945"
title: "Article title"
summary: "A concise description used in archives and metadata."
createdAt: "2026-07-15T09:09:45+08:00"
updatedAt: "2026-07-17T00:00:00+08:00"
lang: "zh-CN"
status: "incomplete"
---
```

- Every field is required. `status` is `complete` or `incomplete`.
- `id` must match the directory and filename.
- `createdAt` must match the timestamp encoded by `id` and never changes.
- `updatedAt` changes only on explicit Publish.
- The page title is generated from Front matter. Body headings start at `##`; an H1 fails the build.
- Raw HTML is disabled. Use footnotes and a `## References` section instead of BibTeX/CSL.

## Images

Writing images use content-addressed names:

```markdown
![Alternative text](./<sha256>.png "Visible caption")
```

The Cloud Editor accepts JPEG, PNG, WebP, GIF, and AVIF files up to 32 MiB, verifies their file signatures, and inserts the canonical syntax. The build rewrites the relative path to the article's public R2 URL.

## Local verification

From the repository root:

```sh
npm ci
npm test
npm run build
```

Only `_site` is uploaded to Pages. Markdown, Worker source, TeX, and repository internals must never appear in that directory.
