# LoveCatCat Blog

- LoveCatCat is a full-stack blog project built with Hono.
- The UI is consistently styled with local Primer CSS.

## Commands

```bash
# Install dependencies
npm install

# Generate browser preview assets
npm run build:assets

# Local development
npm run dev

# Cloudflare
npm run deploy:preview
npm run deploy:preview:inactive
npm run deploy:production

# Quality checks
npm run typecheck
npm run test
npm run test:watch
npm run test:coverage
```

## Git Workflow

This repository uses a simple solo-development branch model:

- `dev` is the only long-lived development branch.
- `master` is reserved for UAT-approved production releases.
- Day-to-day coding, local verification, and preview deployment all happen from `dev`.
- Production deployment happens only after the approved `dev` state has been merged into `master`.

Each development cycle should follow this order:

```bash
# Stay on the solo development branch
git switch dev

# Develop and verify locally
npm run dev
npm run test

# Deploy the current dev state to preview for UAT
npm run deploy:preview

# Run preview smoke tests / UAT at https://lovecatcat-preview.nightttt7.workers.dev

# After UAT passes, close the public preview URL
npm run deploy:preview:inactive

# Merge the approved dev state into master
git switch master
git merge dev

# Deploy production from master
npm run deploy:production
```

If no special release branch is needed, keep working on `dev` for the next cycle and treat `master` only as the production-ready branch.

## Technology Stack

- TypeScript 5.6
- Hono 4.12
- Node.js >= 20.18.1
- Cloudflare Workers
- Cloudflare D1
- better-sqlite3 12.8
- unified / remark / rehype
- esbuild
- Vitest 4.1
- Wrangler 4.78

## Architecture

The project uses one shared application layer with two runtime entry points:

- [src/app.ts](src/app.ts): defines routes, page rendering, access checks, and business flows.
- [src/server.ts](src/server.ts): local Node.js entry point wired to SQLite `dev.db`.
- [src/worker.ts](src/worker.ts): Cloudflare Worker entry point wired to the D1 binding `DB`.
- [src/db/sqlite.ts](src/db/sqlite.ts) and [src/db/d1.ts](src/db/d1.ts): separate SQLite and D1 adapters that expose the same `BlogDb` interface.
- [src/markdown](src/markdown): shared Markdown rendering, sanitization, and browser preview logic.
- [src/render/layout.ts](src/render/layout.ts): shared page layout rendering.
- [src/utils](src/utils): shared logic for auth, access control, dates, language switching, and related helpers.
- [src/translation](src/translation): source-language detection, translation hashing, Workers AI integration, and queue message types.

The data flow is:

`request -> Hono routes -> BlogDb adapter -> SQLite or D1 -> HTML response`

The async translation flow is:

`post save -> source-language detection -> source post saved -> translation rows marked pending/stale -> Cloudflare Queue job -> Worker consumer -> Workers AI translation -> D1 post_translations update`

## Project Structure

```text
.
├─ .github/instructions/    # Collaboration rules, testing guidance, dev.db constraints
├─ src/
│  ├─ app.ts                # Main routes and application entry
│  ├─ server.ts             # Local Node.js development entry
│  ├─ worker.ts             # Cloudflare Worker entry
│  ├─ config.ts             # Site configuration
│  ├─ db/                   # SQLite / D1 data access layer and schema
│  ├─ markdown/             # Shared Markdown render/sanitize/browser-preview modules
│  ├─ render/               # Page layout rendering
│  ├─ translation/          # Source-language detection and async translation pipeline
│  ├─ utils/                # Auth, access, dates, i18n, and other helpers
│  └─ test/                 # Shared route-test factories and helpers
├─ scripts/                 # Small build and maintenance scripts
├─ dev.db                   # Local development database
├─ wrangler.toml            # Cloudflare Workers / D1 configuration
└─ package.json             # Scripts and dependencies
```

## Available Routes

The main routes currently include the home page `/`, post details `/posts/:id`, comment submission `/posts/:id/comments`, authentication `/login` `/signup` `/logout`, the account page `/account`, admin post creation and editing `/post` `/post/:id/edit`, the admin dashboard `/admin`, user management `/admin/users/:id/block` `/unblock` `/delete`, and language switching via `/api/lang`.

## Getting Started

### Install

```bash
npm install
```

### Local Development

```bash
npm run dev
```

Default URL: `http://localhost:3000`

This mode uses only local Node.js and SQLite `dev.db`.
`npm run dev` now runs `npm run build:assets` first so the browser-side Markdown preview bundle stays in sync with the shared Markdown source modules.

### Deploy

```bash
# Start from the solo development branch
git switch dev

# Confirm the Cloudflare account and token are pointing to the correct account first
npx wrangler whoami

# Configure ADMIN_EMAILS for preview and production if needed
npx wrangler secret put ADMIN_EMAILS --env preview
npx wrangler secret put ADMIN_EMAILS

# Deploy preview first
npm run deploy:preview

# Then run smoke tests / UAT at https://lovecatcat-preview.nightttt7.workers.dev

# After UAT, deactivate the preview URL while keeping the preview Worker and preview D1
npm run deploy:preview:inactive

# Merge the approved dev state into master
git switch master
git merge dev

# Deploy to production from master; the script explicitly targets the top-level production environment
# Equivalent to: wrangler deploy --env=""
npm run deploy:production
```

The current production Worker is `lovecatcat`, backed by database `lovecatcat-prod`, and served at `https://lovecatcat.com`.

The preview Worker is `lovecatcat-preview`, backed by database `lovecatcat-preview`, with the stable preview URL `https://lovecatcat-preview.nightttt7.workers.dev`.

Preview is intended only for short-lived UAT from `dev`. After validation, run `npm run deploy:preview:inactive` to disable the `workers.dev` entry so it does not remain publicly accessible, then merge the approved `dev` state into `master` before running production deployment. Re-run `npm run deploy:preview` when the next UAT cycle starts.

Before any deploy, confirm that `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `npx wrangler whoami` are all correct, and that `ADMIN_EMAILS` has been configured separately for preview and production.

### Environment Variables: Cloudflare API

Do not commit secrets into project files. Use system environment variables instead:

```powershell
[System.Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'your_cloudflare_api_token', 'User')
[System.Environment]::SetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', 'your_cloudflare_account_id', 'User')
```

### Environment Variables: Local Development

Local development loads `.env` and `.env.development` in that order:

- `ADMIN_EMAILS`: required, the list of admin email addresses, separated by commas, semicolons, or new lines.
- `DB_PATH`: optional, the local SQLite path. The default is the project-root `dev.db`.
- `PORT`: optional, the local port. If occupied, the app automatically switches to another available port.

`.env.development` is not gitignored and can be committed as an example/default environment file.

### Environment Variables: Deploy

- Cloudflare Worker runtime: `ADMIN_EMAILS` must be configured separately for preview and production because they are isolated environment secrets and do not inherit automatically. Use Wrangler to write them directly to Cloudflare:

```bash
npx wrangler secret put ADMIN_EMAILS --env preview
npx wrangler secret put ADMIN_EMAILS
```

For example, enter:

```text
admin_1@example.com,admin_2@example.com
```

### Environment Variables: DB

`DB` is not a regular environment variable. It is a Cloudflare D1 binding. The project already configures it separately for preview and production in [wrangler.toml](wrangler.toml):

```bash
[[d1_databases]]
binding = "DB"
database_name = "lovecatcat-prod"

[[env.preview.d1_databases]]
binding = "DB"
database_name = "lovecatcat-preview"
```

The translation pipeline also depends on two Cloudflare bindings configured in [wrangler.toml](wrangler.toml):

- `AI`: Workers AI binding used by the queue consumer for translation.
- `TRANSLATION_QUEUE`: Cloudflare Queue used for async translation jobs.

Preview D1, production D1, and local `dev.db` are maintained independently. They do not automatically share local mock accounts, posts, or comments. After deployment, account validation should use accounts that actually exist in the target environment database rather than assuming local seed data is present.

## Translation Pipeline

- `posts` stores the source content, and `post_translations` stores per-language translated variants.
- Saving a post auto-detects the source language, marks target translations as `pending` or `stale`, and enqueues async translation work.
- Post pages prefer the current UI language when a completed translation exists, with a visible original/translated toggle.
- `npm run dev` simulates the async pipeline locally with a marked DEV placeholder instead of real AI output.
- `LOCAL_TRANSLATION_MIN_DELAY_MS`, `LOCAL_TRANSLATION_MAX_DELAY_MS`, and `LOCAL_TRANSLATION_FAILURE_RATE` can be used to tune local delay and failure behavior.
- Preview and production use the real Cloudflare Queue plus Workers AI pipeline.

## Coding Standards

- Keep page and routing logic centralized in the Hono application layer instead of scattering it across multiple entry points.
- Share the same data interface and schema constraints between local development and production whenever possible.
- Derive admin access only from `ADMIN_EMAILS`, not from a role column in the database.
- Prefer reusing local Primer CSS for frontend styling.
- When adjusting `dev.db` mock data, keep post volume, author distribution, and comment volume stable whenever possible.

## dev.db Conventions

The local development database is the project-root `dev.db`. Current mock-data constraints are:

- `posts` should include only posts authored by admin accounts.
- Keep the total number of visible posts around 40-50 so the home page has about five pages for pagination testing.
- Preserve a meaningful number of posts authored by `admin_2@example.com` for author filtering and admin workflow checks.
- Maintain about five comments per post.
- When deleting a user, delete that user's `comments` and `sessions` first.

When updating local mock data, modify `dev.db` directly rather than only editing bootstrap SQL or documentation.

## Unit Test

The project uses Vitest. Test files live under `src/` and are named `*.test.ts`.

```bash
npm run test
npm run test:watch
npm run test:coverage
```

Primary test coverage includes:

- Route behavior
- Access control
- SQLite and D1 data access layers
- Authentication and environment handling
- Layout and rendering helpers

For browser-level validation, prioritize home-page pagination, author filtering, post details, language switching, failed login, commenting after login, and admin capabilities.

## Playwright Test

When running browser-level tests, start the target service first:

```bash
npm run dev
```

Prefer Playwright MCP for real clicks, typing, submissions, and navigation. Cover at least three core flows and document the key locators, expected results, and actual results.

Recommended priority flows are home-page pagination, author filtering, post details, language switching, failed login, commenting after login, and admin capabilities.

Only check for globally available `playwright` when browser automation is actually needed. Do not reinstall Playwright locally in this repository by default. If a temporary Node script is needed, first confirm that the current machine can resolve the Playwright module directly.

If you need to test the deployed preview environment, use the stable preview `workers.dev` URL.

For mobile regression testing, default to Chrome / Playwright `Pixel 7` device emulation rather than a manually narrowed desktop window.

## History Log
- 2017-09-14: start project 
- 2017-09-18: add 2 simple folder
- 2017-09-24: add login function
- 2017-09-26: change database to mysql
- 2019-12-15: basic edition (have index, login and Blog)
- 2019-12-20: add post (add post related part)
- 2019-12-20: add comment (add post comment part)
- 2019-12-22: add register (add post register part, this web "could in use" now)
- 2019-12-30: ready to production environment
- 2020-03-15: deploy
- 2020-07-05: change front-end to Primer CSS (all to Primer CSS)
- 2020-07-06: change and adapt (change login and reg page, adapt for cellphone)
- 2020-08-07: add timesheet page (something new and javascript)
- 2021-07-19: change name and fine tune contents
- 2021-08-31: add new features
- 2022-12-12: Flask & Primer CSS version
- 2026-04-06: rewrite whole project with Hono, Primer CSS, and Cloudflare, assisted by GitHub Copilot
