# mygh

- GitHub: https://github.com/DiogoNeves/mygh
- Local path: /Users/diogoneves/Projects/mygh
- Production domain: https://mygh.site
- Platform: Cloudflare Workers + KV

## What it does

mygh, short for "My GitHub", creates nicer share links for GitHub repositories and releases.

The user pastes a GitHub repo or release URL, previews a polished social card, optionally tweaks the copy, then gets a short mygh link. Social crawlers see Open Graph metadata and a generated preview image; normal human clicks redirect to the original GitHub URL.

## Core flow

```text
User pastes GitHub URL
  -> app fetches public GitHub repo/release metadata
  -> browser renders a 1200x630 PNG card
  -> Worker stores metadata + PNG in Cloudflare KV
  -> user shares /s/:slug

Social crawler opens /s/:slug
  -> Worker returns HTML with og:title, og:description, og:image

Human opens /s/:slug
  -> Worker redirects to the original GitHub repo or release
```

## Tech stack

- Runtime: Cloudflare Workers
- Storage: Cloudflare KV
- Frontend: static HTML, CSS, and browser JavaScript
- Language: TypeScript for the Worker
- Tooling: Wrangler, TypeScript
- External APIs: GitHub REST API for public repository and release metadata

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
| `/health` | Basic Worker health check |

## Local setup

```bash
npm install
npm run dev
```

The app can inspect GitHub URLs without KV. Creating share links requires a KV namespace.

## Cloudflare setup

1. Log in to Cloudflare:

   ```bash
   npx wrangler login
   ```

2. Create a KV namespace:

   ```bash
   npx wrangler kv namespace create MYGH_LINKS
   ```

3. Paste the returned namespace ID into `wrangler.jsonc` by uncommenting the `kv_namespaces` block.

4. Optional but recommended for higher GitHub API limits:

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

5. Deploy:

   ```bash
   npm run deploy
   ```

## Domain setup

`mygh.site` is registered in Hover. To serve production traffic from Cloudflare:

1. Add `mygh.site` to Cloudflare.
2. Update the domain nameservers in Hover to the nameservers Cloudflare provides.
3. Add Worker custom domains or routes for:
   - `mygh.site`
   - `www.mygh.site`
4. After the domain is active in Cloudflare, update `wrangler.jsonc` with routes for the domain.

Until the domain is connected, deploys can run on the generated `workers.dev` URL.

## Good inspiration for

- Tiny Cloudflare Worker products
- Social preview and Open Graph experiments
- GitHub release announcement tooling
- Browser-generated images that are stored and served from the edge
