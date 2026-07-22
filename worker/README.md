# Cloud Editor Worker

This Worker serves the authenticated editor at `editor.xayah.me`, public immutable media at `media.xayah.me`, and the API used by the existing Journal and Writing UI.

## Data ownership

- GitHub `master`: published Journal, Monthly Note, and Writing source/metadata.
- Private R2 bucket: unpublished Writing drafts, Writing preview PDFs, build status, and published site media.
- GitHub Actions: asynchronous Tectonic compilation for private Writing previews.

No D1 database is used.

## Required Cloudflare resources

- Worker: `xayah-site-editor`
- R2 bucket: `xayah-site-editor-content`
- Custom domains: `editor.xayah.me` and `media.xayah.me`
- Cloudflare Access self-hosted application covering `editor.xayah.me`

Set these Worker secrets with `wrangler secret put`:

- `GITHUB_TOKEN`: repository-scoped fine-grained token with Contents and Actions read/write access.
- `BUILD_CALLBACK_TOKEN`: random shared secret also stored as the GitHub Actions secret `WRITING_BUILD_TOKEN`.

Set these Worker variables in the Cloudflare dashboard:

- `ACCESS_TEAM_DOMAIN`: full `https://<team>.cloudflareaccess.com` URL.
- `ACCESS_AUD`: the Access application's Audience tag.

Never commit `.dev.vars` or any real secret.
