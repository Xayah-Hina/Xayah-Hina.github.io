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
- Worker routes: `xayah.me/api/*`, `xayah.me/data/*`, and `dictionary.xayah.me/api/*`
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

Public and authenticated Journal views both read the current GitHub branch through `GET /data/journal/catalog` and `GET /data/journal/year/:year`. Static Journal modules remain a shared fallback if that public endpoint is temporarily unavailable, so authentication can never select a different published dataset.

Journal edits and deletions send the original `baseEntry`; Dictionary saves send
the original `basePersonal`. A stale or missing baseline returns HTTP 409 before
any content write. Deploy the main-site and standalone Dictionary frontends
before the Worker update that requires these baselines. Previously opened tabs
must reload before saving. Existing published sources and private draft formats
remain compatible; no content migration is needed.

## Writing API lifecycle

The in-page authoring UI saves metadata and Markdown body to `private/writing/drafts/<id>.json`. Each save includes the previous `savedAt`; conditional R2 writes return HTTP 409 instead of overwriting a newer tab.

Images are uploaded to `private/writing/assets/<id>/<sha256>.<ext>`. Publish copies only referenced images to the immutable `published/writing/<id>/` prefix, deterministically serializes Front matter, and commits `writing/<id>/<id>.md`. The authoring UI polls `/api/writing/deploy/status` until the public page exposes the matching `x-writing-revision`.

Public Writing and Journal images are retained to honor their immutable cache
URLs. A failed Journal upload can clean up its own newly created objects before
any GitHub commit is attempted; an uncertain GitHub commit result must retain
those images because the accepted commit may already reference them.

Writing deletion advances the Git branch even for a private-only draft. This
empty commit fences publishers that already read the old draft: their old branch
head cannot commit after deletion. R2 deletion locks and tombstones also prevent
stale saves and allow interrupted cleanup to resume.

## Tasks lifecycle

Projects, their child Tasks, scheduled Sessions, and immutable completion records are operational state rather than published Journal source. The single schema-6 document lives at `published/tasks/state.json` in R2. Conditional ETag writes reject stale tabs with HTTP 409; no previous Task schema is read or migrated.

`GET /data/tasks` is public. Authenticated changes use `/api/tasks/save`. A Session owns ISO `startsAt` and `endsAt` timestamps, a plan, optional outcome, and review state. Its duration is 15 minutes to 24 hours and may cross midnight. The same Task may have multiple Sessions on one day, while overlapping blocks are rejected. Completing or archiving a Task removes its unreviewed scheduled Sessions but preserves reviewed work history. Only completing the whole Task creates a contribution; reopening removes it, and completing again produces one canonical contribution rather than a duplicate.

Projects receive an immutable 2–8 character key. Tasks receive an immutable code in the form `PROJECT-YYYY-NNNN`, where the year is the Singapore creation year and the sequence belongs to that Project and year.

A Task keeps its original code when moved to another Project. Journal links keep
the Task code and a snapshot of its Project at the time of linking; the code
prefix does not need to match that snapshot's current Project key.

Google Calendar synchronization creates a dedicated `Xayah Tasks` calendar using only the `calendar.app.created` OAuth scope. Task and Project content, Session review state, and contributions remain site-owned. Google may move or resize a Session, including across midnight; invalid durations or overlapping edits are restored from the site. Incremental synchronization runs after Task saves, on demand, and every two minutes through the Worker cron. The encrypted connection lives at `private/tasks/google-calendar.json`.

Connection writes use ETag checks and a synchronization lease. A failed Tasks
write does not consume Google changes. Event comparison includes Task and
Project content. Before writing an event, synchronization stores the intended
time range and operation ID. If Google accepts the write but its response is
lost, a retry recognizes that write without importing its old time range over
newer site edits; a later Google time change is still imported normally.
Disconnect removes stored credentials using a conditional tombstone, so an
older synchronization cannot recreate the connection. The additional connection
metadata is optional for existing connections and does not change Task schema 6.
Applying Google changes also records an operation ID in the Tasks object's R2
custom metadata, atomically with the content write. Ordinary Task saves preserve
that metadata. This lets a retry recognize an already-applied change after a
lost response without replaying it over a newer site edit; the public Tasks JSON
format remains unchanged.
