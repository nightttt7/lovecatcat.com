---
applyTo: '**'
---

## Playwright Testing Guidelines

### Usage
- Use this for browser-level validation, regression checks, interaction exploration, and Playwright test generation against the local site.
- Prioritize real user flows such as home-page pagination, author filtering, post details, language switching, login/signup, and comment submission.

### Global Playwright Rules
- On this machine, prefer the user-level global Playwright installation. Do not assume the current repository needs a local Playwright dependency.
- Only check for globally available `playwright` when browser automation is actually needed.
- If a temporary Node script uses `require('playwright')`, first confirm that the current shell can resolve global Node modules, for example through a valid `NODE_PATH` setup. On Windows PowerShell, prefer a forward-slash path such as `$env:NODE_PATH = 'C:/Users/zhang/AppData/Roaming/npm/node_modules'`.
- When using the CLI directly, prefer `playwright ...` instead of reinstalling Playwright with `npm install playwright`.
- If you create a temporary Playwright script for one-off validation, delete it before finishing and confirm it is not left in the git diff.

### Runtime Rules
- If the target environment is not specified, default to local dev.
- Start the local service first with `npm run dev`.
- The default local test URL is `http://localhost:3000/`.
- If port `3000` is occupied, detect the fallback local dev URL from terminal output and use that URL instead of assuming the default port.
- For deployed preview validation, use the stable preview URL after `npm run deploy:preview`.
- Browser-level validation must include real clicks, typing, form submission, and navigation rather than only checking static HTML.

### Recommended Flow
1. Open the home page first and confirm that the top navigation, post list, and pagination links render correctly.
2. Cover at least three core flows and record the key locators, expected results, and actual results.
3. For authenticated testing, prefer reusing the test accounts listed below instead of registering unrelated temporary accounts that pollute the data set.
4. When validating Chinese/English switching, test both `/api/lang?to=en` and `/api/lang?to=zh`, and confirm the page returns to the source page.
5. After tests that involve login state, visit `/logout` first to clean up the session before the next scenario.
6. Use browser tools first for interaction and validation. Only fall back to `run_playwright_code` when the built-in browser actions are too limited for the targeted check.
7. Attach `pageerror` and error-level `console` listeners before navigation or reload when using Playwright code. Treat browser script errors as failed smoke coverage even when the page visually renders.

### MCP Browser Testing Requirements
- Prefer the browser MCP / Playwright tools for real interaction.
- Confirm the resulting page title, text, URL, or error message.
- If browser tools are unavailable, fall back to the global Playwright CLI or a temporary Node script and state the limitation clearly.
- Do not create ad hoc regression scripts just to perform a single validation pass unless the user explicitly asks for repository automation.
- For desktop smoke testing, browser MCP snapshots are usually enough. For true mobile validation, use Playwright device emulation if the integrated browser viewport does not report the expected `window.innerWidth`.

### Mobile Testing Requirements
- Default to `Pixel 7` device emulation for mobile testing rather than a manually narrowed desktop browser.
- Confirm the emulated page reports the expected mobile viewport, for example `innerWidth`, `document.documentElement.clientWidth`, and `document.documentElement.scrollWidth` around the device width.
- Validate there is no horizontal overflow on key pages by checking `scrollWidth === clientWidth`.
- Local seed data may have too few pages to render responsive pagination variants. When `data-pagination-has-responsive-variants="false"`, validate full pagination fits on mobile, taps change both URL and content, and labels localize correctly.
- When responsive pagination variants are present, validate the first-page minimal pagination displays `1 2 ...`.
- Validate that when the minimal pagination does not show page 1, it includes a leading `...`, for example `... 5 6 7 ...`.
- After tapping mobile pagination, both the URL and the post list content must change.
- Validate that language switching keeps the current page while changing navigation, headings, and pagination labels. On mobile, open the menu first and click the visible `.mobile-menu-panel` language link rather than a hidden desktop header link.
- Validate that author filtering shows only posts for the selected author and preserves the `authorId` pagination parameter.
- Validate post editor pane toggling without horizontal overflow.

### Recommended Core Flows
- Home-page pagination: clicking a pagination link should change both the URL and the post list content.
- Author filtering: clicking an author name should show only that author's posts, and pagination should preserve `authorId`.
- Default post reader: generic article links should use `/posts/:id`. Non-authors should land on `/posts/:id/translation` when the source language differs from the UI language and a published translation exists; authors should land on `/posts/:id/original`.
- Post detail: when an unauthenticated user opens a post page, they should see the comment list and login/signup links rather than a comment form.
- Translation notice: the translated-version flash should appear only when source language and reader language differ and a published translation exists; action-card links can still include original/translation actions independently.
- Language switching: clicking the language switcher should keep the current page while changing navigation and page text.
- Language switching on filtered pagination: on pages such as `/?authorId=...&page=2`, switching `zh -> en -> zh` should keep the current path and query parameters while updating headings and pagination labels.
- Failed login: submitting an incorrect account or password should show a clear error message.
- Comment after login: after a regular user signs in, they should see a comment input on the post detail page and be able to submit a comment.
- Admin capabilities: after an admin signs in, they should see admin entry points and post/comment management controls. Admin non-authors should only see delete controls on other authors' posts; admin authors should see edit/read/delete actions appropriate to the current original or translation surface.
- Post editor breakout: validate desktop widths around `1366`, `1440`, `1680`, and `1920`, confirming that the editor stays in the standard rhythm below the threshold and expands without horizontal overflow above it.

### Test Accounts
- Local `dev.db` accounts:
  - Admin: `admin_1@example.com` / `admin123456`
  - Admin: `admin_2@example.com` / `admin123456`
  - Regular user: `test_user_1@example.com` / `test123456`
  - Regular user: `test_user_2@example.com` / `test123456`
  - Regular user: `test_user_3@example.com` / `test123456`
  - Regular user: `test_user_4@example.com` / `test123456`
- Remote Preview accounts:
  - Regular user: `test_user_1@example.com` / `test123456`

### Remote Preview Notes
- Remote Preview uses independent preview D1 data and is appropriate for browser-level testing and integration checks.
- For already deployed preview testing, you can also use the stable preview `workers.dev` URL directly.
- Do not assume local `dev.db` seed data exists in Remote Preview.
- If an admin-only feature needs to be tested in Remote Preview or deployed preview, ask the user to log in with an admin account in the shared browser session before continuing.

### Account Usage Rules
- Use admin accounts to validate admin entry points, post management, comment deletion, user management, and other admin-only capabilities.
- Use regular accounts to validate commenting after login, personal pages, and regular-user permission boundaries.
- If login fails, check that local test data has been initialized correctly before changing business logic.
- Treat local login failures as an environment or seed-data problem first, not an immediate app regression.

### Test Output Requirements
- When reporting results, include the actual test steps, key locators used, expected results, and actual results.
- When generating automation, split tests by user flow and use clear names rather than packing too many large flows into one test.
- For regression runs, return results grouped by scenario, and include environment URL, viewport, account used, and pass/fail status for each scenario.