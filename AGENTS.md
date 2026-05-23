# AGENTS.md

Guidance for AI agents working in this repository.

## Project Overview

`mygh` creates polished share links for GitHub repositories and releases. The app fetches public GitHub metadata, renders a social preview card in the browser, stores link metadata and generated PNG images in Cloudflare KV, and serves crawler-friendly Open Graph pages from a Cloudflare Worker.

Core stack:

- Cloudflare Workers for the runtime.
- Cloudflare KV via the `MYGH_LINKS` binding for saved links and PNG previews.
- Static HTML, CSS, and browser JavaScript in `public/`.
- TypeScript Worker code in `src/index.ts`.
- npm, Wrangler, and TypeScript for local tooling.

## Commands

- Install dependencies: `npm install`
- Run locally: `npm run dev`
- Type-check: `npm run check`
- Regenerate Worker types: `npm run types`
- Deploy: `npm run deploy`

Do not deploy unless the user explicitly asks.

## Local Development Notes

- `npm run dev` runs `wrangler dev`.
- The app can inspect GitHub URLs without KV.
- Creating share links requires the `MYGH_LINKS` KV binding in `wrangler.jsonc`.
- Higher GitHub API limits require the `GITHUB_TOKEN` Worker secret. Do not store tokens in source files, `wrangler.jsonc`, or committed `.env` files.
- `wrangler.jsonc` intentionally contains commented examples for KV and production routes. Keep real IDs and route changes deliberate.

## Cloudflare Deployment

- Production domain: `https://mygh.site`.
- Use the Cloudflare plugin for Cloudflare account, DNS, Worker, KV, custom-domain, and observability checks.
- Deploy only when the user explicitly asks. Preferred deploy command:

  ```bash
  npx wrangler deploy --config wrangler.local.jsonc
  ```

- `wrangler.local.jsonc` is ignored and may contain the real `MYGH_LINKS` namespace ID. Do not commit local config files, KV IDs, secrets, `.dev.vars`, or generated Cloudflare caches.
- The Cloudflare zone for `mygh.site` is active and uses nameservers:
  - `malavika.ns.cloudflare.com`
  - `rocco.ns.cloudflare.com`
- The Worker name is `mygh`; the workers.dev fallback URL is `https://mygh.diogo-neves.workers.dev`.
- Custom domains should be `mygh.site` and `www.mygh.site`.
- If `wrangler deploy` fails with Cloudflare error `100117` about externally managed DNS records, inspect DNS before changing anything. The expected fix is to delete only conflicting A/CNAME-style records for the exact hostnames `mygh.site` and `www.mygh.site`, then rerun the deploy. Keep the Hover email MX record (`mx.hover.com.cust.hostedemail.com`) unless the user explicitly asks to change email routing.
- After deployment, verify:
  - `curl https://mygh.site/health`
  - `curl https://www.mygh.site/health`
  - `curl https://mygh.diogo-neves.workers.dev/health`
- The project has `observability.enabled` in Wrangler config, so Worker logs and built-in request/error/runtime metrics should be available in Cloudflare Workers observability after traffic reaches the Worker. Use Analytics Engine only for custom product metrics such as link creations, per-slug clicks, or top shared repositories.

## Code Style

- Keep Worker code compatible with the Cloudflare Workers runtime. Avoid Node-only APIs unless Wrangler/Workers explicitly supports them.
- Prefer platform primitives: `Request`, `Response`, `URL`, `Headers`, `fetch`, `crypto`, `KVNamespace`, and typed `Env` bindings.
- Keep `strict` TypeScript clean. Run `npm run check` after TypeScript changes.
- Preserve the current small-app shape. Do not add a framework, bundler, database, auth system, queue, or build step unless the user asks or the need is clear.
- Treat KV records and any future persisted data as production data. Changes to stored schemas, key names, slugs, image records, or link records must either be backward compatible with existing data or include a zero-downtime migration path where old and new data can be read safely during rollout.
- Keep route handling explicit and easy to scan in `src/index.ts`.
- Return JSON API errors through the existing `HttpError`/`errorResponse` pattern.
- Validate external input before using it. GitHub URL parsing, slug handling, image data URLs, and HTML escaping are security-sensitive paths.
- Escape any user-controlled or GitHub-provided text before rendering HTML.
- Keep crawler behavior intentional: social crawlers should receive OG HTML, while normal human visits to `/s/:slug` should redirect to GitHub.

## Frontend Guidelines

- Keep the frontend dependency-free unless there is a strong reason to change that.
- `public/index.html`, `public/styles.css`, and `public/app.js` are plain static assets served by the Worker assets binding.
- The generated social image is a 1200x630 PNG rendered client-side with Canvas. Preserve that size for Open Graph compatibility.
- Keep controls accessible: labels or `aria-label`s for inputs/buttons, useful status text, keyboard-friendly form behavior, and no text overlap on mobile.
- Before changing the visual design, check the app at both mobile and desktop widths.

## Verification

For most code changes:

1. Run `npm run check`.
2. If behavior changed, run `npm run dev` and exercise the affected route or UI.
3. For Worker/API changes, check relevant endpoints such as `/health`, `/api/inspect?url=...`, `/api/links`, `/s/:slug?preview=1`, and `/img/:slug.png` as applicable.
4. For frontend changes, verify the page renders, the form can inspect a GitHub URL, the preview updates, and the Canvas image generation path still works.

If a change cannot be verified because KV, secrets, network access, or Cloudflare credentials are unavailable, say that clearly in the final response.

## Documentation And Dependencies

- Update `README.md` when setup, routes, deployment, or product behavior changes.
- Use the Cloudflare plugin while developing this project, especially for Worker runtime behavior, KV bindings, Wrangler configuration, deployment, custom domains, and platform best practices.
- Use Context7 MCP for current documentation whenever the task asks about a library, framework, SDK, API, CLI tool, or cloud service. Start with `resolve-library-id`, then query the selected docs with the full user question.
- Prefer official Cloudflare, Wrangler, Workers, KV, TypeScript, and GitHub API documentation when checking platform behavior.

## Good Code Rubric

- Read `good-code-rubric.md` before making coding, review, or architecture decisions.
- Follow the rubric unless it conflicts with the existing `mygh` conventions in this file; when they conflict, prefer the repository-specific guidance here and in the rubric's `Repository-specific notes for mygh` section.
- Preserve the current small Cloudflare Worker shape: keep `src/index.ts` explicit, keep `public/` dependency-free, and extract helpers only when clarity or testability improves.
- For reviews, use the rubric checklist as a quality bar for file size, validation, side effects, naming, error handling, tests, and secret handling.

## Git And Commits

- The worktree may contain user changes. Do not revert or overwrite unrelated changes.
- Only commit when the user explicitly asks.
- Commit messages should follow the existing repo style: short sentence-case summaries, for example `Initial commit`.
- Do not include secrets, KV namespace IDs, generated local caches, `.wrangler/`, `node_modules/`, or `.env` files in commits.
