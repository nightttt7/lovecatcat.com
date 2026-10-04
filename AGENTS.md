# AGENTS.md

Agent guidance for this repository. `README.md` holds human-facing documentation, the current
route/feature list, and the step-by-step deploy walkthrough. Explicit user instructions override
this file.

## Project

- Hono full-stack blog. The same Hono app runs on Node locally and on Cloudflare Workers in production.
- Local development uses Node plus SQLite `dev.db`. Production uses Cloudflare Workers plus D1.
- Styling is local Primer CSS only, served from `/static/primer.css`.
- Not implemented yet: image upload and Cloudflare R2 storage. Do not assume reusable code exists.
- Entry points: `src/app.ts` (routes and app factory), `src/server.ts` (Node), `src/worker.ts` (Worker).

## Commands

```bash
npm run dev              # build browser assets, then tsx watch src/server.ts on http://localhost:3000
npm run build:assets     # regenerate the browser Markdown preview bundle
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
npm run test:watch
npm run test:coverage
npm run smoke -- <url>   # read-only HTTP smoke checks
npm run wrangler -- <args>   # guarded Wrangler wrapper
```

`npm run smoke` verifies `/`, `/posts?page=2`, `/labels`, `/authors`, `/static/primer.css`, and that
`/api/lang?to=en` redirects with a `lang=en` cookie.

## Branches and Release Flow

- `dev` is the only long-lived development branch. Never do implementation work directly on `master`.
- `master` is the production release branch.
- Required order: develop on `dev` -> preview deploy -> preview smoke and UAT -> deactivate preview ->
  PR `dev` into `master` -> production deploy runs automatically on that push.
- Never skip preview, and never deploy production directly from `dev`.
- If the user only says "deploy", start with preview.

## Cloudflare Environments and Credentials

| | Production | Preview |
| --- | --- | --- |
| Wrangler environment | top level (`--env=""`) | `[env.preview]` |
| Worker | `lovecatcat` | `lovecatcat-preview` |
| D1 database | `lovecatcat-prod` | `lovecatcat-preview` |
| URL | https://lovecatcat.com (custom domain) | https://lovecatcat-preview.nightttt7.workers.dev |

- Local credentials are `CLOUDFLARE_API_TOKEN_LCC` (scoped to `lovecatcat-preview` only) and
  `CLOUDFLARE_ACCOUNT_ID`, set as OS environment variables. Never store them in repo `.env` files.
- `scripts/wrangler.mjs` guards every Wrangler call. It requires `CLOUDFLARE_API_TOKEN_LCC`, forwards
  it to Wrangler under Wrangler's required `CLOUDFLARE_API_TOKEN` name, rejects local commands that do
  not target `--env preview` (identity commands such as `whoami`, `--help`, `--version` are exempt),
  and permits production commands only inside GitHub Actions on `refs/heads/master`.
- Run `npm run wrangler -- whoami` before local preview work.
- GitHub holds `CLOUDFLARE_API_TOKEN_PREVIEW` and `CLOUDFLARE_API_TOKEN_PRODUCTION` as environment
  secrets, plus `CLOUDFLARE_ACCOUNT_ID` as a repository variable. The `preview` environment accepts
  only `dev`; the `production` environment accepts only `master`.
- Worker runtime secrets `ADMIN_EMAILS`, `LCC_DS_API_KEY`, and `LCC_DS_MODEL` do not inherit between
  preview and production. Configure each environment separately.
- Preview deploys with `workers_dev = false` to avoid Wrangler's account-wide subdomain lookup;
  `scripts/preview-subdomain.mjs` then enables the stable `workers.dev` URL. Keep it that way.
  `npm run deploy:preview:inactive` disables that URL through the API without redeploying or deleting
  the Worker, after which the preview URL should return Cloudflare's HTTP 404.
- Preview is UAT-only and never deactivates automatically. Close it before merging into `master`.
- The translation pipeline calls the DeepSeek API directly through `executionCtx.waitUntil`. There is
  no Cloudflare Queue or Workers AI binding to provision.
- The production workflow confirms the preview URL returns 404 and then deploys. It intentionally does
  not HTTP smoke test `https://lovecatcat.com`, because Cloudflare answers GitHub runner IPs with a
  managed challenge; a challenged response is not a deployment failure.
- App-level verification happens on preview, which runs the same code as production.

## Data Rules

- Local `dev.db`, preview D1, and production D1 are three independent data sets. Never assume local
  mock accounts, posts, or comments exist remotely.
- An empty preview D1 works as-is because the app bootstraps its base schema automatically.
- Do not copy production data into preview.

When changing `dev.db` mock data:

- Only admin-authored posts. Do not add or restore posts owned by non-admin accounts.
- Keep 40-50 visible posts, enough for roughly five pages of pagination. `admin_2@example.com` owns
  about one third of them, for author filtering and admin workflow checks.
- Keep bodies Markdown-rich (headings, bold, italic, blockquotes, lists, task lists, code blocks,
  tables, links, separators). Keep non-Markdown posts few and confined to private, draft, or
  supporting content.
- At least half of visible posts carry exactly one label, and a smaller number carry two or three.
  Never create one unique label per post; reuse a stable set across posts, such as `markdown`,
  `writing`, `testing`, `accessibility`, `performance`, `sqlite`, `d1`, `deploy`, `cloudflare`,
  `labels`, `search`, `pagination`, `layout`, `workflow`, `release`.
- Keep about five comments per post.
- Edit `dev.db` directly instead of only changing bootstrap SQL or README notes. Check current counts
  and relationships across `users`, `posts`, and `comments` first, then confirm the accounts still log
  in and the counts still satisfy these rules.
- Deleting a user requires deleting that user's `comments` and `sessions` first.
- Do not modify production D1 unless the task explicitly requires it.
- Local accounts: `admin_1@example.com` and `admin_2@example.com` use `admin123456`;
  `test_user_1@example.com` through `test_user_4@example.com` use `test123456`. Preview only
  guarantees `test_user_1@example.com`.

## Code Conventions

### UI and CSS

- Primer CSS only. Never introduce Tailwind, Bootstrap, or another framework, and avoid adding custom CSS.
- Keep `data-color-mode="light"` and `data-light-theme="light"` on `<html>`, and keep the page
  background `bg-gray-light`.
- Compose with Primer utilities: `container-lg`, `Header Header--dark`, `Box` / `Box-header` /
  `Box-body`, `markdown-body` for rendered Markdown, and `f6` / `text-gray` / `text-bold` for metadata.
- UI lives in Hono `html` template strings, so prefer recomposing Primer classes over adding selectors
  or non-semantic wrapper elements.
- Do not change copy, field order, information architecture, or route semantics for presentation reasons.
- Do not "simplify" by deleting responsive pagination CSS. Keep the `full`, `compact`, and `minimal`
  variants, keep `.responsive-pagination` overriding Primer's `.pagination > *` rules, and make sure
  `data-pagination-has-responsive-variants="false"` never hides pagination on mobile.
- Keep the mobile header menu as a `details` panel. Reverting it to Primer `dropdown-menu` has already
  proved unstable at narrow widths.
- When changing mobile-menu or pagination markers, update the assertions in `src/render/layout.test.ts`.

### Tests

- Vitest only. Test files live under `src/` and are named `*.test.ts`.
- Prioritize pure functions and directly testable logic: utils, DB query logic, and access control.
- Reuse the shared factories and helpers in `src/test/` for route tests instead of rebuilding `BlogDb`
  mocks, site config, or auth state in every file.
- Wrap form submissions with the shared `application/x-www-form-urlencoded` helpers rather than
  ad hoc `URLSearchParams` construction.

### Invariants

- Admin identity comes only from `ADMIN_EMAILS`. Do not move admin checks onto a `users` role column
  unless a task explicitly refactors the permission model.
- `/account` is the signed-in user's own profile and comment history. `/admin` is global comment and
  account management. Do not blur those responsibilities.
- Post visibility uses `posts.is_private`, which is separate from draft state. Private posts remain
  visible only to their author across home, detail, tag, author, and author-list queries.
- Keep `dev.db` opened read-write when touching local startup logic.

### Schema Changes

- Rebuilding `posts` (for example `ALTER TABLE posts RENAME TO posts__legacy`) breaks `comments.post_id`
  foreign-key redirection. Rebuild `comments` in the same change, drop `posts__legacy` afterwards, then
  verify with `PRAGMA foreign_key_list(comments)` and `PRAGMA foreign_key_check`.
- Do not treat successful table creation as proof that the migration is correct.

## Browser Testing

- Prefer browser automation over reading rendered HTML, and confirm the resulting page title, text,
  URL, or error message after each interaction.
- Use this machine's global Playwright installation and prefer the `playwright` CLI. Do not add a local
  dependency or reinstall it. On PowerShell, set
  `$env:NODE_PATH = 'C:/Users/zhang/AppData/Roaming/npm/node_modules'` when a temporary script needs to
  resolve `playwright`. If browser tools are unavailable, fall back to the CLI or a temporary script
  and state the limitation.
- Default to local dev at `http://localhost:3000/`, started with `npm run dev`. If that port is
  occupied, read the fallback URL from the dev output instead of assuming the default. For deployed
  checks, use the stable preview URL.
- Cover at least three core flows and record locators, expected results, and actual results. Do not
  write ad hoc regression scripts for a single validation pass unless the user asks for repository
  automation.
- Delete temporary Playwright scripts before finishing and confirm they are not left in the diff.
- Attach `pageerror` and error-level `console` listeners before navigation or reload. A browser script
  error fails the smoke check even when the page renders.

### Flows to Cover

- Pagination: the URL and the post list content must both change.
- Author filtering: only that author's posts, and pagination preserves `authorId`.
- Post reader default: authors land on `/posts/:id/original`; non-authors land on
  `/posts/:id/translation` when the source language differs from the UI language and a published
  translation exists.
- Post detail while signed out: the comment list plus login/signup links, not a comment form.
- Failed login shows a message rather than silently doing nothing, and admin controls appear only for
  admins.
- Language switching: exercise both `/api/lang?to=en` and `/api/lang?to=zh` and confirm the current
  path and query string are preserved.
- Sign out through `/logout` between authenticated scenarios, and prefer the listed test accounts over
  registering new ones.

### Mobile

- Use Playwright `Pixel 7` emulation rather than a narrowed desktop window, and confirm the reported
  `innerWidth` matches the device.
- Check `scrollWidth === clientWidth` on key pages, including the post editor with its panes toggled.
- Open the mobile menu first and click the visible `.mobile-menu-panel` link; the desktop header link
  is hidden at narrow widths.
- When `data-pagination-has-responsive-variants="false"` (thin local seed data), confirm the full
  pagination still fits and works on mobile.
- With variants present, the first-page minimal pagination should read `1 2 ...`, and a minimal
  pagination that excludes page 1 should carry a leading `...`, such as `... 5 6 7 ...`.
