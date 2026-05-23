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

## Code Style

- Keep Worker code compatible with the Cloudflare Workers runtime. Avoid Node-only APIs unless Wrangler/Workers explicitly supports them.
- Prefer platform primitives: `Request`, `Response`, `URL`, `Headers`, `fetch`, `crypto`, `KVNamespace`, and typed `Env` bindings.
- Keep `strict` TypeScript clean. Run `npm run check` after TypeScript changes.
- Preserve the current small-app shape. Do not add a framework, bundler, database, auth system, queue, or build step unless the user asks or the need is clear.
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

## Git And Commits

- The worktree may contain user changes. Do not revert or overwrite unrelated changes.
- Only commit when the user explicitly asks.
- Commit messages should follow the existing repo style: short sentence-case summaries, for example `Initial commit`.
- Do not include secrets, KV namespace IDs, generated local caches, `.wrangler/`, `node_modules/`, or `.env` files in commits.
