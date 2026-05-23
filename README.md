# mygh

mygh, short for "My GitHub", creates nicer share links for GitHub repositories, releases, files, commits, pull requests, and issues.

The user pastes a supported GitHub URL, previews a polished social card, optionally tweaks the copy, then gets a short mygh link. Social crawlers see Open Graph metadata and a generated preview image; normal human clicks redirect to the original GitHub URL.

## Core flow

```text
User pastes GitHub URL
  -> app fetches public GitHub metadata for the URL type
  -> browser renders a 1200x630 PNG card
  -> Worker stores metadata + PNG in Cloudflare KV
  -> user shares /s/:slug

Social crawler opens /s/:slug
  -> Worker returns HTML with og:title, og:description, og:image

Human opens /s/:slug
  -> Worker redirects to the original GitHub target
```

## Tech stack

- Runtime: Cloudflare Workers
- Storage: Cloudflare KV
- Frontend: static HTML, CSS, and browser JavaScript
- Language: TypeScript for the Worker
- Tooling: Wrangler, TypeScript
- External APIs: GitHub REST API for public repository, release, file, commit, pull request, and issue metadata

## Why this shape

- One Worker can serve the app, API, Open Graph HTML, images, and redirects.
- KV is enough for small share records and generated PNG cards.
- Browser-side image generation keeps Worker CPU usage low on the free tier.
- The first version does not need a database, auth, queues, or a framework.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Static app for creating links |
| `/api/inspect?url=...` | Parse a GitHub URL and fetch preview metadata |
| `/api/links` | Create a stored share link |
| `/s/:slug` | Return OG HTML for crawlers, redirect humans to GitHub |
| `/s/:slug?preview=1` | Force the preview page for manual testing |
| `/img/:slug.png` | Serve the generated social preview image |
| `/dev/share-preview` | Local-only saved-share preview without writing a KV link |
| `/health` | Basic Worker health check |

## Run locally

```bash
npm install
npm run check
npm test
npm run dev
```

Wrangler serves the app at the local URL it prints, usually `http://localhost:8787`.
If that port is busy, pick another one:

```bash
npm run dev -- --port 8788
```

Open the local URL in a browser and paste a public GitHub repository, release, file, commit, pull request, or issue URL.
The inspect/preview flow works as long as the Worker can reach the public GitHub API.
The save/share flow requires the `MYGH_LINKS` KV binding.

To test saving links locally without committing Cloudflare IDs, create an ignored local config:

```bash
cp wrangler.jsonc wrangler.local.jsonc
```

Add the real `MYGH_LINKS` namespace ID to `wrangler.local.jsonc`, then run:

```bash
npx wrangler dev --config wrangler.local.jsonc --port 8788
```

## Test locally

Useful smoke checks:

```bash
curl http://localhost:8787/health
curl "http://localhost:8787/api/inspect?url=https%3A%2F%2Fgithub.com%2Fcloudflare%2Fworkers-sdk"
curl http://localhost:8787/dev/share-preview
```

Replace `8787` with whichever local port Wrangler printed.

Open `/dev/share-preview` on localhost to inspect the saved-share page without creating a link or storing a preview image. The route is blocked on non-local hosts.

In the UI:

1. Paste a GitHub URL such as `https://github.com/cloudflare/workers-sdk`.
2. Click **Preview link**.
3. Confirm the preview card fills with metadata for that GitHub URL type.
4. Click **Save share link**.
5. Confirm a share URL appears and the preview link opens.

If `MYGH_LINKS` is not configured, the save step will show a clear KV binding error. The inspect step should still work.

If your local config includes custom-domain routes for `mygh.site`, Wrangler will generate `mygh.site` share URLs even while serving the app on localhost. Before DNS is active, test saved paths by replacing the origin with the local Wrangler origin, for example `http://localhost:8788/s/:slug?preview=1`.

## Cloudflare setup

1. Log in to Cloudflare:

   ```bash
   npx wrangler login
   ```

2. Create a KV namespace:

   ```bash
   npx wrangler kv namespace create MYGH_LINKS
   ```

3. Copy `wrangler.jsonc` to the ignored `wrangler.local.jsonc`, then paste the returned namespace ID into the `MYGH_LINKS` entry there. Keep real Cloudflare IDs out of committed config.

4. Optional but recommended for higher GitHub API limits:

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

5. Deploy:

   ```bash
   npx wrangler deploy --config wrangler.local.jsonc
   ```

## Domain setup

`mygh.site` is registered in Hover. To serve production traffic from Cloudflare:

1. Add `mygh.site` to Cloudflare as a full DNS zone.
2. Copy the two Cloudflare nameservers assigned to the zone.
3. In Hover, open the `mygh.site` domain control panel and replace the current nameservers with the two Cloudflare nameservers.
4. Wait for Cloudflare to mark the zone as active. This can take several hours and may take up to 24 hours.
5. Confirm `wrangler.jsonc` includes custom-domain routes for:
   - `mygh.site`
   - `www.mygh.site`
6. Deploy with `npx wrangler deploy --config wrangler.local.jsonc`.

Until the domain is active, deploys can still run on the generated `workers.dev` URL. The custom domains will not work until the Hover nameservers point to Cloudflare and Cloudflare finishes activation.

## Good inspiration for

- Tiny Cloudflare Worker products
- Social preview and Open Graph experiments
- GitHub release announcement tooling
- Browser-generated images that are stored and served from the edge
