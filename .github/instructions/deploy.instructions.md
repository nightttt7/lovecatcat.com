---
applyTo: '**'
---

## Cloudflare Deploy Flow

### Release Sequence
- Use `dev` as the only long-lived development branch. Do not do normal implementation work directly on `master`.
- Treat `master` as the production-release branch. Production deploys must come from code that has already been approved on `dev`.
- Default to this release order: develop on `dev` -> deploy preview locally or through the manual GitHub Actions workflow -> preview smoke test / UAT -> deactivate preview locally or through Actions -> merge a `dev` to `master` pull request to trigger the production Actions workflow.
- If the user only says "deploy", start with preview and do not go directly to production.
- Preview deploy and preview UAT belong to `dev`. Production deploy belongs to `master`.
- Production deployment is only performed by `.github/workflows/deploy-production.yml` on pushes to `master`. Its Wrangler command explicitly uses the top-level environment with `--env=""`.
- Keep the production Cloudflare token only in the `production` GitHub Environment. The local `CLOUDFLARE_API_TOKEN_LCC` and the `preview` Environment token must be scoped only to `lovecatcat-preview`.
- Preview is only for short-lived UAT. After UAT, deactivate its `workers.dev` URL locally or through the preview Actions workflow, and only then may `dev` be merged into `master` for production deployment.
- After preview deployment, the agent should run a basic smoke test against the stable preview URL, at minimum confirming that the home page loads and basic paths such as pagination or language switching work.
- After preview deployment, complete preview UAT, deactivate preview after it passes, then merge `dev` into `master` through a pull request.
- Production deployment can proceed only after all three steps are complete.

### Environment Mapping
- Production uses the top-level configuration and maps to Worker `lovecatcat`, D1 `lovecatcat-prod`, and custom domain `https://lovecatcat.com`.
- Preview uses `[env.preview]` and maps to Worker `lovecatcat-preview`, D1 `lovecatcat-preview`, and stable URL `https://lovecatcat-preview.nightttt7.workers.dev`.
- Preview deploys with `workers_dev = false` and `preview_urls = false`; `scripts/preview-subdomain.mjs` then enables the stable `workers.dev` URL for UAT.
- Preview does not bind a custom domain, does not depend on version-level Preview URLs, and does not deactivate automatically after production deployment. It stays alive only during the UAT window and must be explicitly deactivated afterward.
- `npm run deploy:preview:inactive` disables only the preview Worker's `workers.dev` entry through the Cloudflare API without redeploying code.

### Closing Preview via CLI
- After UAT, run `npm run deploy:preview:inactive` so the preview Worker remains deployed but the `workers.dev` entry is disabled.
- This approach does not require deleting the Worker and does not require a token with Worker deletion permissions.
- After deactivation, the stable preview URL is expected to return Cloudflare's HTTP 404 "Page not found" page instead of the app.
- Only after that should the `dev` to `master` pull request be merged, which automatically starts the production Actions workflow.
- When the next UAT cycle starts, reactivate preview with `npm run deploy:preview`.

### Pre-Deploy Checks
- Before local preview operations, run `npm run wrangler -- whoami` to confirm the preview token is connected to the correct account.
- `ADMIN_EMAILS`, `LCC_DS_API_KEY`, and `LCC_DS_MODEL` are environment-scoped secrets and must be configured separately for preview and production.
- Configure the preview secrets with `npm run wrangler -- secret put ADMIN_EMAILS --env preview`, `npm run wrangler -- secret put LCC_DS_API_KEY --env preview`, and `npm run wrangler -- secret put LCC_DS_MODEL --env preview`.
- Production Worker secrets are not changed locally. Updating one creates a deployment and requires a separate GitHub Actions workflow.
- The translation pipeline calls the DeepSeek API directly from the Worker via `executionCtx.waitUntil`. There is no Cloudflare Queue or Workers AI binding to provision.

### Preview URL Rules
- Use the preview environment URL `https://lovecatcat-preview.nightttt7.workers.dev` as the stable test entry point.
- Version-level Preview URLs are not used at the moment. If they are reintroduced later, add the corresponding rules.
- After preview deployment, the agent should use this stable URL for automated smoke tests and should not treat the production domain as the preview verification entry.
- Before suggesting a push to `master`, the agent should confirm that preview UAT is complete and preview has been deactivated. That push automatically starts production deployment.

### Data Rules
- Preview D1, production D1, and local `dev.db` are separate and must not be mixed.
- An empty preview D1 can be deployed directly because the app bootstraps its base schema automatically.
- Test-data import is a separate step. Do not assume production data should be copied into preview.
