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

# Cloudflare preview (local)
npm run deploy:preview
npm run deploy:preview:inactive

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

# Push dev, then open a GitHub pull request from dev into master.
# Merge the pull request on GitHub to trigger production deployment.
git push origin dev
```

If no special release branch is needed, keep working on `dev` for the next cycle and treat `master` only as the production-ready branch.

## Technology Stack

- TypeScript 5.9
- Hono 4.13
- Node.js >= 20.18.1
- Cloudflare Workers
- Cloudflare D1
- better-sqlite3 12.8
- unified / remark / rehype
- esbuild
- Vitest 5.0
- Wrangler 4.130

## Architecture

The project uses one shared application layer with two runtime entry points:

- [src/app.ts](src/app.ts): defines routes, page rendering, access checks, and business flows.
- [src/server.ts](src/server.ts): local Node.js entry point wired to SQLite `dev.db`.
- [src/worker.ts](src/worker.ts): Cloudflare Worker entry point wired to the D1 binding `DB`.
- [src/db/sqlite.ts](src/db/sqlite.ts) and [src/db/d1.ts](src/db/d1.ts): separate SQLite and D1 adapters that expose the same `BlogDb` interface.
- [src/markdown](src/markdown): shared Markdown rendering, sanitization, and browser preview logic.
- [src/render/layout.ts](src/render/layout.ts): shared page layout rendering.
- [src/utils](src/utils): shared logic for auth, access control, dates, language switching, and related helpers.
- [src/translation](src/translation): source-language detection, translation hashing, DeepSeek translation provider, and shared dispatcher.

The data flow is:

`request -> Hono routes -> BlogDb adapter -> SQLite or D1 -> HTML response`

The async translation flow is:

`post save -> source post saved -> admin opens the post editor -> source-language detection / manual confirmation -> admin clicks generate translation -> translation row marked pending/processing -> in-process DeepSeek translation (waitUntil on Cloudflare, fire-and-forget on Node) -> post_translations updated to completed/failed -> admin reloads editor to review and optionally edit the translated title/body before publishing`

## Project Structure

```text
.
├─ AGENTS.md                # Agent guidance: commands, release flow, conventions
├─ .github/workflows/       # Preview and production Cloudflare deploy workflows
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

The main routes currently include the home page `/` and post index `/posts`, the default post reader `/posts/:id`, post original pages `/posts/:id/original`, published translation pages `/posts/:id/translation`, comment submission `/posts/:id/comments`, authentication `/login` `/signup` `/logout`, the account page `/account`, admin post creation and editing `/posts/new` `/posts/:id/original/edit` `/posts/:id/translation/edit`, the admin dashboard `/admin`, user management `/admin/users/:id/block` `/unblock` `/delete`, and language switching via `/api/lang`.

The default post reader sends authors to the source-language page. For non-authors, when the post source language differs from the current UI language and a published translation exists, it sends them to the translated page.

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
npm run wrangler -- whoami

# Configure preview secrets if needed
npm run wrangler -- secret put ADMIN_EMAILS --env preview

# Configure the preview DeepSeek API key if needed
npm run wrangler -- secret put LCC_DS_API_KEY --env preview

# Deploy preview first
npm run deploy:preview

# Run read-only HTTP smoke checks and UAT on preview
npm run smoke -- https://lovecatcat-preview.nightttt7.workers.dev

# After UAT, deactivate the preview URL while keeping the preview Worker and preview D1
npm run deploy:preview:inactive

# Push the approved dev state, then open a GitHub pull request: dev -> master.
# Merge that pull request on GitHub. The push created by the merge triggers production deployment.
git push origin dev
```

The current production Worker is `lovecatcat`, backed by database `lovecatcat-prod`, and served at `https://lovecatcat.com`.

The preview Worker is `lovecatcat-preview`, backed by database `lovecatcat-preview`, with the stable preview URL `https://lovecatcat-preview.nightttt7.workers.dev`.
Preview is intended only for short-lived UAT from `dev`. Deploy or deactivate it locally with the commands above, or run the `Deploy preview` GitHub Actions workflow on `dev` and choose `deploy` or `deactivate`. Preview code is deployed with `workers_dev = false`; `scripts/preview-subdomain.mjs` enables the preview URL after deployment and disables it after UAT without redeploying code. After UAT, close the preview URL, then merge the approved `dev` state into `master`. Every push to `master` triggers the `Deploy production` workflow; it checks that the preview URL is inactive before deploying. That workflow does not HTTP smoke test `https://lovecatcat.com`, because Cloudflare answers GitHub runner IPs with a managed challenge (`HTTP 403` plus `cf-mitigated: challenge`). App-level verification happens in the preview workflow against the same code, and the production deploy step itself confirms the Worker and its routes.

Before a local preview operation, verify `CLOUDFLARE_API_TOKEN_LCC` and `CLOUDFLARE_ACCOUNT_ID` by running `npm run wrangler -- whoami`. Keep the preview and production Worker runtime secrets configured separately.

### Environment Variables: Cloudflare API

Local Cloudflare credentials are for `lovecatcat-preview` only. Do not commit tokens into project files. Set the preview token and account ID as User environment variables:

```powershell
[System.Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN_LCC', 'your_preview_only_cloudflare_api_token', 'User')
[System.Environment]::SetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', 'your_cloudflare_account_id', 'User')
```

After changing User environment variables, restart the terminal or IDE before running Wrangler commands so the new values are loaded.

Project Wrangler commands read `CLOUDFLARE_API_TOKEN_LCC` only from the process environment. The wrapper does not load the token from `.env` or `.env.development`, and stops if the variable is missing. It passes the value to Wrangler as `CLOUDFLARE_API_TOKEN`, the name Wrangler requires. Outside the production GitHub Actions job, the wrapper requires commands to target `--env preview`. The Cloudflare token's Worker scope is the access boundary; replace any existing broad local token with the preview-only token.

### GitHub Actions deployment setup

In the repository, open **Settings > Environments**. Create `preview` and `production`. Open each environment and set **Deployment branches and tags > Selected branches and tags > Add deployment branch or tag rule**. Choose **Branch** and enter exactly `dev` for `preview` or `master` for `production`. Add these **Environment secrets** under the corresponding environment:

| Environment | Secret name | Cloudflare token scope |
| --- | --- | --- |
| `preview` | `CLOUDFLARE_API_TOKEN_PREVIEW` | Workers `Editor` for existing Worker `lovecatcat-preview` only |
| `production` | `CLOUDFLARE_API_TOKEN_PRODUCTION` | Workers `Editor` for existing Worker `lovecatcat` only |

In **Settings > Secrets and variables > Actions > Variables > New repository variable**, add `CLOUDFLARE_ACCOUNT_ID` with the Cloudflare account ID. Each workflow passes its own token to `CLOUDFLARE_API_TOKEN_LCC` for the project wrapper. The production token must remain in the `production` Environment; it is never needed on a local machine. Create account-owned Cloudflare API tokens with Workers `Editor` scoped to the corresponding existing Worker. No `D1 Write` is needed for deployment of the existing binding. Add `Zone > Workers Routes > Write` scoped to `lovecatcat.com` only if a deployment must change its custom-domain connection. See [Cloudflare Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/).

In **Settings > Rules > Rulesets > New ruleset > New branch ruleset**, target only `master`, set enforcement to **Active**, leave the bypass list empty, and enable **Require a pull request before merging**, **Restrict deletions**, and **Block force pushes**. Leave required approvals at zero for this single-owner repository and do not require a status check that does not run on pull requests. Merge `dev` into `master` through a GitHub pull request after preview UAT and deactivation; direct pushes to `master` will be blocked. `Deploy production` then runs automatically on the merge push after asset build, typecheck, tests, and a check that the preview URL is inactive, then deploys the Worker. It deliberately leaves out a public HTTP smoke test: Cloudflare returns a managed challenge (`HTTP 403` plus `cf-mitigated: challenge`) to GitHub runner IPs, so such a check cannot distinguish a broken deploy from edge bot protection. Rely on the preview workflow's smoke test for app behavior. Do not add required reviewers to the `production` Environment if deployment should remain automatic. `Deploy preview` is started manually in Actions using the `dev` branch and also runs the HTTP smoke test; GitHub shows this manual workflow after the workflow file exists on the default `master` branch. For the first rollout, run preview UAT locally before merging the workflow files into `master`.

### Environment Variables: Local Development

Local development loads `.env` and `.env.development` in that order for non-secret local settings. `LCC_DS_API_KEY` is intentionally not loaded from either file and should be configured as a Windows User or Machine environment variable instead:

```powershell
[System.Environment]::SetEnvironmentVariable('LCC_DS_API_KEY', 'your_deepseek_api_key', 'User')
```

The local files still support values such as `LCC_DS_MODEL`:

- `ADMIN_EMAILS`: required, the list of admin email addresses, separated by commas, semicolons, or new lines.
- `LCC_DS_API_KEY`: required for translation generation, but do not place it in `.env` or `.env.development`. Local development should read it from the Windows User / Machine environment, and Cloudflare should read it from Wrangler-managed secrets. Without it, translation jobs are dropped with a warning.
- `LCC_DS_MODEL`: required, the DeepSeek model id used by the translation provider (for example `deepseek-v4-flash`). It is not a secret and may be placed in `.env` / `.env.development` locally; on Cloudflare configure it as a Wrangler secret. An invalid or unavailable model id will make translation jobs fail.
- `DB_PATH`: optional, the local SQLite path. The default is the project-root `dev.db`.
- `PORT`: optional, the local port. If occupied, the app automatically switches to another available port.

`.env.development` is not gitignored and can be committed as an example/default environment file.

### Environment Variables: Deploy

- Cloudflare Worker runtime: `ADMIN_EMAILS`, `LCC_DS_API_KEY`, and `LCC_DS_MODEL` must be configured separately for preview and production because they are isolated environment secrets and do not inherit automatically. Local Wrangler commands can update preview secrets:

```bash
npm run wrangler -- secret put ADMIN_EMAILS --env preview
npm run wrangler -- secret put LCC_DS_API_KEY --env preview
npm run wrangler -- secret put LCC_DS_MODEL --env preview
```

The production workflow deploys code using the existing production Worker secrets. Changing a production Worker secret creates a new deployment; add a separate GitHub Actions workflow when such a change is needed.

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

The translation pipeline shares the same DeepSeek API across local development, preview, and production. Locally, `LCC_DS_API_KEY` should come from the Windows User / Machine environment. In Cloudflare, it should come from the Wrangler secret defined per environment alongside the `DB` D1 binding.

Preview D1, production D1, and local `dev.db` are maintained independently. They do not automatically share local mock accounts, posts, or comments. After deployment, account validation should use accounts that actually exist in the target environment database rather than assuming local seed data is present.

## Translation Pipeline

- `posts` stores the source content, and `post_translations` stores per-language translated variants.
- Saving a post stores the source language but does not auto-generate translated versions.
- In the post editor, admins can manually trigger translation generation after reviewing or overriding the detected source language.
- Translation runs asynchronously via the DeepSeek API. The translation row is marked `processing` immediately so the editor reflects the in-flight state on reload, then transitions to `completed` or `failed` once the DeepSeek call returns.
- After a translation completes, admins can reload the editor to review the translated title/body, manually edit it, and then publish the translated version.
- Post pages prefer the current UI language when a completed translation exists, with a visible original/translated toggle.
- The same DeepSeek provider is used in every environment so dev, preview, and production behave consistently. Configure `LCC_DS_API_KEY` locally as a Windows User / Machine environment variable and as a Wrangler secret for preview and production.

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

On mobile, use the visible mobile menu for navigation and language switching; header links that exist for desktop can be hidden and should not be targeted directly. Also check browser `pageerror` / console errors and horizontal overflow during smoke runs.

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
