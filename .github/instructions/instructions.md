---
applyTo: '**'
---

## Plan: Hono Full-Stack Blog
This plan is intended for multi-thread collaboration and covers architecture, data, authentication, pages, and deployment. Break work down by phase, keep key files and data sources explicit, and make sure dev/prod data stays aligned, iteration remains practical, and migration risk stays controlled. Complete part of the work in each thread and keep this instruction updated so multiple threads can collaborate toward the same overall goal.
The "Requirements" section will continue to change over time, and the plan should be adjusted to match the latest requirements.
The "Steps" section contains the tasks that need to be completed, but it can also be adjusted as implementation progresses and new requirements appear.
The "Progress" section must be kept up to date so completed steps and the current project state are always recorded.

### Requirements
Both the frontend and backend use Hono. The app is deployed on Cloudflare Workers, and the domain is also hosted on Cloudflare. The development database uses SQLite, while production uses Cloudflare D1. Images are stored locally during development, and Cloudflare R2 is planned for production.
Admins must register and sign in using pre-approved email addresses configured through the `ADMIN_EMAILS` environment variable so they can publish posts and manage the site. Regular users use the existing registration/login flow for commenting, and GitHub OAuth is no longer used.
Prefer Hono's official ecosystem where possible to reduce complexity. Frontend styling should consistently use local Primer CSS to maintain a minimal and coherent blog UI.
The core capabilities already implemented are: home-page pagination, author filtering, post details, registration and login, comments, the personal account page, admin post creation/editing/drafts, comment deletion, user block/unblock/delete, and Chinese/English language switching.
The capabilities not yet implemented are: local image upload, Cloudflare R2 integration, and in-editor Markdown live preview. When tasks touch these areas, treat them as future work rather than assuming reusable implementations already exist.
The site structure is:
Every page has a top banner that includes the home page and any future pages. After an admin signs in, `post` and `admin` links are also shown. The footer includes copyright text and external links such as GitHub.
The home page includes a paginated list of blog posts with title, author, publish time, update time, and draft status. Each item links to its post detail page, and draft posts are visible only to signed-in admins.
The post page includes the post title, author, publish time, update time, draft status, the full Markdown-rendered content, and a comment section. The comment section includes commenter name, content, and timestamp. Signed-in registered users can submit comments on the same page, but comments do not support Markdown. After signing in, admins can also delete posts, edit posts by navigating to the draft page, delete comments, and block users who wrote comments.
The admin page currently includes: listing all comments, deleting comments, and blocking comment authors.
The post page currently supports: entering a post title, tags, a body textarea, and saving as draft.
The draft page is similar to the post page and reuses the existing `posts` table, but preloads existing content and allows it to be updated, saved, or published.
If image upload, R2, or preview are implemented later, they should be added incrementally without breaking the current forms or the `posts` table structure.

### Steps
1. Design the dual-environment data and storage strategy: use SQLite + D1 as the current foundation, unify field and index strategy, and keep `posts` / `comments` / `users` structurally aligned across dev and prod. Plan image storage and R2 separately as future extensions.
2. Define authentication and authorization: admins are managed through a multi-email allowlist, regular users comment through the existing registration/login flow, user blocking is based on the current account model, and deployment is simplified through environment-variable configuration.
3. Define pages and routes: shared layout (header/footer), home-page paginated list, post details and comments, post/draft editing, and admin comment/account management. Specify the required fields and visibility logic for each page.
4. Implement in phases: complete the data layer and authentication first, then the home page / post details / comments, then admin management. Treat image upload and R2 as later phases, and validate output against the real structure using `dev.db`.

### Environment and Deployment Rules
- Local `npm run dev` depends only on Node.js and the project-root `dev.db` by default and does not need to connect to Cloudflare.
- `npm run wrangler:dev:remote` can be used as the Playwright browser-test entry point and connects to the preview environment with its own preview D1.
- `npm run wrangler:dev:remote`, `npm run deploy:preview`, `npm run deploy:preview:inactive`, and `npm run deploy:production` connect to Cloudflare, so Wrangler must already have working Cloudflare access before they are run.
- `npm run wrangler:dev:remote` always targets the preview environment, using Worker `lovecatcat-preview` and D1 `lovecatcat-preview`. Do not treat it as a production remote-debug entry point.
- The default release order is `npm run deploy:preview`, then pause for human preview UAT and `npm run deploy:preview:inactive`, and only after confirmation proceed to `npm run deploy:production`. Do not skip preview and deploy straight to production.
- For local machines or CI accessing Cloudflare, the current convention is to use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for authentication and account selection.
- On local Windows development machines, prefer system environment variables for Cloudflare credentials rather than storing secrets in repository `.env` files.
- Cloudflare Worker runtime variables are separate from local `.env` files. Secrets such as `ADMIN_EMAILS` do not inherit between preview and production and must be configured separately.
- `DB` is a D1 binding, not a normal environment variable. Production currently uses `lovecatcat-prod`, while preview uses `lovecatcat-preview`.
- The top-level configuration in `wrangler.toml` maps to production Worker `lovecatcat`, while `[env.preview]` maps to preview Worker `lovecatcat-preview`.
- `wrangler.preview-inactive.toml` is used only to close down preview exposure and performs a redeploy of `[env.preview]` with `workers_dev = false`.
- Production does not expose `workers.dev`, while preview uses the stable URL `https://lovecatcat-preview.nightttt7.workers.dev`.
- The project does not currently depend on version-level Preview URLs. Browser-level regression should prefer the stable preview `workers.dev` URL.
- Preview is an independent UAT-only environment and does not automatically deactivate after production deployment. After UAT, run `npm run deploy:preview:inactive` to disable the `workers.dev` exposure before production deployment.
- After preview enters inactive mode, the stable `workers.dev` URL should return a Cloudflare 404 page rather than the app home page. The currently verified result is HTTP `404 Not Found` with `error code: 1042`.
- Preview D1, production D1, and local `dev.db` are three independent data sets. Do not assume local mock accounts and posts automatically exist in Cloudflare environments.
- An empty preview D1 can start directly because the app automatically bootstraps the base schema.

### Authentication and Data Constraints
- Admin access must always be derived only from `ADMIN_EMAILS`. Unless a task explicitly requires a permission-model refactor, do not switch admin identity to depend on a role column in the `users` table.
- Authentication-related schema is automatically bootstrapped in both SQLite and D1 runtimes, including fields or tables such as `sessions`, `users.is_blocked`, and `comments.user_id`. When changing local Node/SQLite startup logic, keep `dev.db` opened in writable mode rather than falling back to read-only access.
- `/account` is only for the currently signed-in user's personal profile and comment history. `/admin` is the global comment and account management entry point. Do not blur those page responsibilities when editing routes or templates.
- Post visibility is represented by `posts.is_private` and is separate from draft state. For home-page, detail-page, tag-page, author-page, or author-post-list queries, private posts must continue following the rule that they are visible only to their author.

### SQLite Schema Change Constraints
- If the `posts` table is rebuilt through a pattern such as `ALTER TABLE posts RENAME TO posts__legacy`, the `comments.post_id` foreign-key redirection problem must be handled at the same time.
- This kind of repair should rebuild `comments` first, then delete `posts__legacy`, and finally validate with `PRAGMA foreign_key_list(comments)` and `PRAGMA foreign_key_check`. Do not rely only on whether table creation succeeded.

### Progress
1. Built the Hono project foundation and the home-page / post-detail skeleton, with SQLite/D1 dual-adapter data access and a base layout style.
2. Completed core project infrastructure: integrated the Vitest unit-test framework, including date utility tests, and organized `.gitignore` plus helper scripts/testing notes under `.github/instructions`.
3. Finished migrating the production database to Cloudflare D1 and configured the D1 binding `DB` in `wrangler.toml`. Local development continues to use `dev.db`.
4. Removed temporary migration scripts and outdated documents, and kept README plus instructions synchronized so unfinished capabilities are not described as already implemented.
5. Completed the base UI refactor: switched fully to local Primer CSS and established shared visual rules for layout, post lists, post details, and comments.
6. Clarified environment-variable and deployment rules: local development defaults to `.env` / `.env.development` plus `dev.db`, while Cloudflare operations use `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, Worker `ADMIN_EMAILS`, and D1 binding `DB`.
7. Current editing capabilities are limited to title, tags, body textarea, and draft toggle. Image upload, R2 storage, and live editor preview are still pending.
8. Deployed the Worker to Cloudflare under the name `lovecatcat`. The production primary domain has been switched to `https://lovecatcat.com`, and production `workers.dev` has been disabled.
9. Verified through Playwright MCP that the stable preview URL can load the app directly. The current deployment and remote-debug flow treats the independent preview environment as the only test entry point.
10. Confirmed that production D1 currently holds independent site data and is not equivalent to local `dev.db`. Future production validation must not assume local admin test accounts already exist.
11. Established an independent `preview` Worker environment and `lovecatcat-preview` D1. Future Cloudflare releases should follow the default flow: preview -> human UAT -> `npm run deploy:preview:inactive` -> production.
