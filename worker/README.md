# Authoring Worker

This Worker serves the authenticated same-origin authoring APIs used by
`xayah.me` and `dictionary.xayah.me`, plus public immutable media at
`media.xayah.me`.

## Data ownership

- `Xayah-Hina.github.io` on GitHub `master`: published Journal, Monthly Note, and Front matter Markdown Writing sources.
- `dictionary` on GitHub `master`: the standalone Dictionary source and published Personal Knowledge.
- Private R2 bucket: unpublished Writing and Dictionary drafts plus private Writing image uploads.
- Public R2 objects: immutable, content-addressed Journal and Writing media.
- GitHub Pages: independently builds allowlisted main-site and Dictionary artifacts.

No D1 database is used.

## Required Cloudflare resources

- Worker: `xayah-site-editor`
- R2 bucket: `xayah-site-editor-content`
- Custom domain: `media.xayah.me`
- Worker routes: `xayah.me/api/*` and `dictionary.xayah.me/api/*`
- One Cloudflare Access self-hosted application covering `xayah.me/api/*` and
  `dictionary.xayah.me/api/*`

Set these Worker secrets with `wrangler secret put`:

- `GITHUB_TOKEN`: fine-grained token with Contents read/write and Actions read access to both `Xayah-Hina.github.io` and `dictionary`. It must be able to commit Writing Markdown, publish Dictionary Personal Knowledge, and read Pages workflow status.

Set these Worker variables in the Cloudflare dashboard:

- `ACCESS_TEAM_DOMAIN`: full `https://<team>.cloudflareaccess.com` URL.
- `ACCESS_AUD`: the Access application's Audience tag.

Never commit `.dev.vars` or any real secret.

## Dictionary routing

The public Dictionary is served from `https://dictionary.xayah.me/`. Writing,
Journal, and Dictionary editing is enabled in place only after `/api/session`
confirms a valid Access session. Dictionary reads and publishes use `DICTIONARY_ORIGIN`,
`DICTIONARY_GITHUB_REPO`, and `DICTIONARY_GITHUB_BRANCH`, independently of the
main site repository variables.

## Writing API lifecycle

The in-page authoring UI saves metadata and Markdown body to `private/writing/drafts/<id>.json`. Each save includes the previous `savedAt`; conditional R2 writes return HTTP 409 instead of overwriting a newer tab.

Images are uploaded to `private/writing/assets/<id>/<sha256>.<ext>`. Publish copies only referenced images to the immutable `published/writing/<id>/` prefix, deterministically serializes Front matter, and commits `writing/<id>/<id>.md`. The authoring UI polls `/api/writing/deploy/status` until the public page exposes the matching `x-writing-revision`.

Unreferenced public Writing images are removed only after the new page revision is live.
