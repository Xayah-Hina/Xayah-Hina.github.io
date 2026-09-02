# Authoring Worker

This Worker serves the authenticated same-origin authoring APIs used by
`xayah.me` and `dictionary.xayah.me`, plus public immutable media at
`media.xayah.me`.

## Data ownership

- `Xayah-Hina.github.io` on GitHub `master`: published Journal and Front matter Markdown Writing sources.
- `dictionary` on GitHub `master`: the standalone Dictionary source and published Personal Knowledge.
- Private R2 bucket: unpublished Writing and Dictionary drafts, private Writing image uploads, and encrypted Google Calendar authorization.
- Public R2 objects: immutable, content-addressed Journal and Writing media.
- GitHub Pages: independently builds allowlisted main-site and Dictionary artifacts.

No D1 database is used.

## Required Cloudflare resources

- Worker: `xayah-site-editor`
- R2 bucket: `xayah-site-editor-content`
- Custom domain: `media.xayah.me`
- Worker routes: `xayah.me/api/*`, `xayah.me/data/tasks`, and `dictionary.xayah.me/api/*`
- One Cloudflare Access self-hosted application covering `xayah.me/api/*` and
  `dictionary.xayah.me/api/*`

Set these Worker secrets with `wrangler secret put`:

- `GITHUB_TOKEN`: fine-grained token with Contents read/write and Actions read access to both `Xayah-Hina.github.io` and `dictionary`. It must be able to commit Writing Markdown, publish Dictionary Personal Knowledge, and read Pages workflow status.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Web OAuth client for the enabled Google Calendar API. Its redirect URI is `https://xayah.me/api/tasks/google/callback`.
- `GOOGLE_TOKEN_KEY`: base64 encoding of exactly 32 random bytes, used to encrypt the Google refresh token stored in R2.

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

Authenticated Journal catalog and year reads come directly from the current GitHub branch. This keeps the author view consistent immediately after a save, even while the public GitHub Pages deployment is still propagating.

## Writing API lifecycle

The in-page authoring UI saves metadata and Markdown body to `private/writing/drafts/<id>.json`. Each save includes the previous `savedAt`; conditional R2 writes return HTTP 409 instead of overwriting a newer tab.

Images are uploaded to `private/writing/assets/<id>/<sha256>.<ext>`. Publish copies only referenced images to the immutable `published/writing/<id>/` prefix, deterministically serializes Front matter, and commits `writing/<id>/<id>.md`. The authoring UI polls `/api/writing/deploy/status` until the public page exposes the matching `x-writing-revision`.

Unreferenced public Writing images are removed only after the new page revision is live.

## Tasks lifecycle

Projects, their child Tasks, scheduled Sessions, and immutable completion records are operational state rather than published Journal source. The single schema-5 document lives at `published/tasks/state.json` in R2. Conditional ETag writes reject stale tabs with HTTP 409; no previous Task schema is read or migrated.

`GET /data/tasks` is public. Authenticated changes use `/api/tasks/save`. A Session owns one date, start and end minute, plan, optional outcome, and review state. The same Task may have multiple Sessions on one day, while overlapping blocks are rejected. Completing or archiving a Task removes its unreviewed scheduled Sessions but preserves reviewed work history. Only completing the whole Task creates a contribution; reopening removes it, and completing again produces one canonical contribution rather than a duplicate.

Projects receive an immutable 2–8 character key. Tasks receive an immutable code in the form `PROJECT-YYYY-NNNN`, where the year is the Singapore creation year and the sequence belongs to that Project and year.

Google Calendar synchronization creates a dedicated `Xayah Tasks` calendar using only the `calendar.app.created` OAuth scope. Task and Project content, Session review state, and contributions remain site-owned. Google may move or resize a Session; invalid cross-midnight or overlapping edits are restored from the site. Incremental synchronization runs after Task saves, on demand, and every two minutes through the Worker cron. The encrypted connection lives at `private/tasks/google-calendar.json`.
