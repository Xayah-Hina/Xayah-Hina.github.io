# Authoring Worker

This Worker serves the authenticated authoring APIs for `xayah.me` and
`dictionary.xayah.me`, the public Journal data API, and immutable Journal media
at `media.xayah.me`.

## Data ownership

- `Xayah-Hina.github.io` on GitHub `master`: published Journal source modules.
- `dictionary` on GitHub `master`: the standalone Dictionary source and published Personal Knowledge.
- R2 bucket: private Dictionary drafts and immutable Journal images.
- GitHub Pages: independently builds the main site and Dictionary artifacts.

No database is used.

## Required Cloudflare resources

- Worker: `xayah-site-editor`
- R2 bucket: `xayah-site-editor-content`
- Custom domain: `media.xayah.me`
- Worker routes: `xayah.me/api/*`, `xayah.me/data/*`, and `dictionary.xayah.me/api/*`
- A Cloudflare Access self-hosted application covering `xayah.me/api/*` and
  `dictionary.xayah.me/api/*`

Set `GITHUB_TOKEN` with `wrangler secret put`. It needs Contents read/write
access to `Xayah-Hina.github.io` and `dictionary`.

Set these Worker variables in the Cloudflare dashboard:

- `ACCESS_TEAM_DOMAIN`: full `https://<team>.cloudflareaccess.com` URL.
- `ACCESS_AUD`: the Access application's Audience tag.

Never commit `.dev.vars` or any real secret.

## Journal lifecycle

Public and authenticated views both read the current GitHub branch through
`GET /data/journal/catalog` and `GET /data/journal/year/:year`. Static Journal
modules are the fallback if the public endpoint is temporarily unavailable.

Journal changes use `/api/journal/save` and `/api/journal/delete`. Edits and
deletions include the complete original `baseEntry`; a stale baseline returns
HTTP 409 before any write. Images are stored under
`published/journals/<year>/` with immutable unique URLs. A failed upload is
removed before any GitHub commit is attempted; an uncertain commit result keeps
the image because the accepted commit may already reference it.

## Dictionary routing

Dictionary APIs are selected by the `dictionary.xayah.me` hostname and use
`DICTIONARY_ORIGIN`, `DICTIONARY_GITHUB_REPO`, and
`DICTIONARY_GITHUB_BRANCH`. Dictionary saves use the original `basePersonal`
to reject stale writes.
