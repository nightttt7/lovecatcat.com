---
applyTo: '**'
---

## Cloudflare Deploy Flow

### Release Sequence
- Use `dev` as the only long-lived development branch. Do not do normal implementation work directly on `master`.
- Treat `master` as the production-release branch. Production deploys must come from code that has already been approved on `dev`.
- Default to this release order: develop on `dev` -> `npm run deploy:preview` from `dev` -> preview smoke test / human UAT -> `npm run deploy:preview:inactive` -> merge `dev` into `master` -> `npm run deploy:production` from `master`.
- If the user only says "deploy", start with preview and do not go directly to production.
- Preview deploy and preview UAT belong to `dev`. Production deploy belongs to `master`.
- `npm run deploy:production` must explicitly use the top-level environment, which is equivalent to `wrangler deploy --env=""`. Do not rely on Wrangler's implicit target resolution in a multi-environment setup.
- Preview is only for short-lived UAT. After UAT, `npm run deploy:preview:inactive` must be run first to deactivate the preview `workers.dev` URL, and only then may `dev` be merged into `master` for production deployment.
- After preview deployment, the agent should run a basic smoke test against the stable preview URL, at minimum confirming that the home page loads and basic paths such as pagination or language switching work.
- After preview deployment, the agent should explicitly remind the human to complete three steps: preview UAT, then `npm run deploy:preview:inactive` after UAT passes, then merge `dev` into `master`.
- Production deployment can proceed only after all three steps are complete.

### Environment Mapping
- Production uses the top-level configuration and maps to Worker `lovecatcat`, D1 `lovecatcat-prod`, and custom domain `https://lovecatcat.com`.
- Preview uses `[env.preview]` and maps to Worker `lovecatcat-preview`, D1 `lovecatcat-preview`, and stable URL `https://lovecatcat-preview.nightttt7.workers.dev`.
- Preview currently uses `workers_dev = true` and `preview_urls = false`, so the stable `workers.dev` URL is the canonical preview URL.
- Preview does not bind a custom domain, does not depend on version-level Preview URLs, and does not deactivate automatically after production deployment. It stays alive only during the UAT window and must be explicitly deactivated afterward.
- `npm run deploy:preview:inactive` uses the dedicated `wrangler.preview-inactive.toml` configuration to redeploy the same preview environment with `workers_dev` switched to `false`.

### Closing Preview via CLI
- After UAT, run `npm run deploy:preview:inactive` so the preview Worker remains deployed but the `workers.dev` entry is disabled.
- This approach does not require deleting the Worker and does not require a token with Worker deletion permissions.
- After the inactive deployment, the stable preview URL is expected to return a Cloudflare 404 page instead of the app. The currently verified result is HTTP `404 Not Found` with body `error code: 1042`.
- Only after that should `dev` be merged into `master`, and only then should `npm run deploy:production` run.
- When the next UAT cycle starts, reactivate preview with `npm run deploy:preview`.

### Pre-Deploy Checks
- Run `npx wrangler whoami` first to confirm the token is connected to the correct account.
- `ADMIN_EMAILS` and `OPENAI_API_KEY_CAT` are environment-scoped secrets and must be configured separately for preview and production.
- Configure the preview secrets with `npx wrangler secret put ADMIN_EMAILS --env preview` and `npx wrangler secret put OPENAI_API_KEY_CAT --env preview`.
- Configure the production secrets with `npx wrangler secret put ADMIN_EMAILS` and `npx wrangler secret put OPENAI_API_KEY_CAT`.
- The translation pipeline calls the OpenAI API directly from the Worker via `executionCtx.waitUntil`. There is no Cloudflare Queue or Workers AI binding to provision.

### Preview URL Rules
- Use the preview environment URL `https://lovecatcat-preview.nightttt7.workers.dev` as the stable test entry point.
- Version-level Preview URLs are not used at the moment. If they are reintroduced later, add the corresponding rules.
- After preview deployment, the agent should use this stable URL for automated smoke tests and should not treat the production domain as the preview verification entry.
- Before suggesting a production deployment, the agent should confirm that preview UAT is complete, that `npm run deploy:preview:inactive` has already been run, and that `dev` has already been merged into `master`.

### Data Rules
- Preview D1, production D1, and local `dev.db` are separate and must not be mixed.
- An empty preview D1 can be deployed directly because the app bootstraps its base schema automatically.
- Test-data import is a separate step. Do not assume production data should be copied into preview.