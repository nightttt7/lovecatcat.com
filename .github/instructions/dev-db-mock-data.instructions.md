---
applyTo: '**'
---

## dev.db Mock Data Guidelines

### Usage
- Use this when modifying, cleaning up, or extending mock data in the local development database `dev.db`.
- It applies to local validation data such as accounts, posts, and comments.
- Remote Preview has its own preview D1 database. Do not assume `dev.db` mock data is equivalent to Remote Preview data.

### Database Location
- The default development database is the project-root `dev.db`.
- Do not modify production D1 data unless the task explicitly requires it.

### Current Mock Data Constraints
- `posts` should include only posts authored by admin accounts. Do not add or restore posts authored by non-admin accounts.
- The target total is 40-50 visible posts so the home page keeps roughly five pages of pagination. If a small number of draft/private posts are retained, the visible post count should still stay within that range.
- `admin_2@example.com` should retain a meaningful number of authored posts for author filtering and admin workflow checks. Roughly one third of posts should belong to that account.
- Visible posts should be mostly Markdown-focused, with bodies that include rich Markdown syntax such as headings, bold, italic, blockquotes, lists, task lists, code blocks, tables, links, and separators.
- Keep only a small number of non-Markdown posts, preferably in supporting content such as private, draft, or internal-support posts.
- Single-label posts should not be too rare. At least half of visible posts should keep exactly one label to validate single-label lists, tag aggregation pages, and simpler card displays.
- Multi-label posts should still exist, but only as a supplement. Keep a small number of posts with two or three labels to validate multi-label rendering and tag-filter combinations.
- Do not create one unique label per post. Reuse a small stable set of core labels across multiple Markdown posts so each label maps to multiple posts.
- Label themes should cover a richer validation set such as `markdown`, `writing`, `testing`, `accessibility`, `performance`, `sqlite`, `d1`, `deploy`, `cloudflare`, `labels`, `search`, `pagination`, `layout`, `workflow`, and `release`, while still avoiding a fragmented one-label-per-post distribution.
- Maintain roughly five comments per post.
- When deleting a user, delete that user's `comments` and `sessions` first to avoid orphaned data.

### Development Accounts
- Admin account: `admin_1@example.com`
  Password: `admin123456`
- Admin account: `admin_2@example.com`
  Password: `admin123456`
- Regular user account: `test_user_1@example.com`
  Password: `test123456`
- Regular user account: `test_user_2@example.com`
  Password: `test123456`
- Regular user account: `test_user_3@example.com`
  Password: `test123456`
- Regular user account: `test_user_4@example.com`
  Password: `test123456`

### Remote Preview Accounts
- When Remote Preview requires account validation, prefer accounts that actually exist in the preview environment.
- Do not assume Remote Preview automatically inherits the accounts, posts, or comments from local `dev.db`.

### Change Rules
- Prefer editing `dev.db` directly instead of only changing bootstrap SQL or README notes.
- Before making changes, verify the current counts and relationships across `users`, `posts`, and `comments`.
- Prefer using the project's existing SQLite tooling and non-interactive scripts for changes and validation.
- After changes, at minimum verify that accounts can log in and that post counts, comment counts, and author ownership still satisfy the current constraints.