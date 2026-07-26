# Cloud Editor Worker

This Worker serves the authenticated editor at `editor.xayah.me`, public immutable media at `media.xayah.me`, and the API used by the Journal, Writing, and Dictionary authoring UI.

## Data ownership

- GitHub `master`: published Journal, Monthly Note, Front matter Markdown Writing sources, and Dictionary Personal Knowledge.
- Private R2 bucket: unpublished Writing and Dictionary drafts plus private Writing image uploads.
- Public R2 objects: immutable, content-addressed Journal and Writing media.
- GitHub Pages: builds `_site` from the repository allowlist and turns Writing Markdown into static HTML.

No D1 database is used.

## Required Cloudflare resources

- Worker: `xayah-site-editor`
- R2 bucket: `xayah-site-editor-content`
- Custom domains: `editor.xayah.me` and `media.xayah.me`
- Cloudflare Access self-hosted application covering `editor.xayah.me`

Set these Worker secrets with `wrangler secret put`:

- `GITHUB_TOKEN`: repository-scoped fine-grained token with Contents read/write and Actions read access. It must be able to commit Writing Markdown and read the Pages workflow status.

Set these Worker variables in the Cloudflare dashboard:

- `ACCESS_TEAM_DOMAIN`: full `https://<team>.cloudflareaccess.com` URL.
- `ACCESS_AUD`: the Access application's Audience tag.

Never commit `.dev.vars` or any real secret.

## Writing API lifecycle

The editor saves metadata and Markdown body to `private/writing/drafts/<id>.json`. Each save includes the previous `savedAt`; conditional R2 writes return HTTP 409 instead of overwriting a newer tab.

Images are uploaded to `private/writing/assets/<id>/<sha256>.<ext>`. Publish copies only referenced images to the immutable `published/writing/<id>/` prefix, deterministically serializes Front matter, and commits `writing/<id>/<id>.md`. The editor polls `/api/writing/deploy/status` until the public page exposes the matching `x-writing-revision`.

Old public media is removed only after the new page revision is live.

## Production cutover order

1. Push the site build while the existing Worker remains online, then wait for all four `/writing/<id>/` pages to expose the source hash from the generated yearly module.
2. Deploy this Worker. The final media route intentionally no longer serves PDFs or non-hashed Writing images.
3. Call `/api/writing/deploy/status` once for each migrated article. A matching live revision deletes its legacy PDF/pointer/preview/build objects and any non-hashed public Writing media while retaining the referenced hash image.
4. Confirm every HTML page and referenced image returns 200 and every former PDF URL returns 404.
5. Remove the obsolete Cloudflare `BUILD_CALLBACK_TOKEN` Worker secret and GitHub `WRITING_BUILD_TOKEN` Actions secret.

Do not perform steps 2–5 before step 1 is live: the old public site still depends on the PDF media route.
