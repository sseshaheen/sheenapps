# In-House Mode Context (Session Handoff)

Purpose: capture discovery and implementation context so future sessions can ramp quickly.

Last updated: 2026-01-16

## Current State Summary

### Implemented (Backend + Frontend Core)
- In-house DB schema + RLS for Easy Mode (infra_mode + 8 in-house tables).
- InhouseGatewayService with validation, rate limiting, quotas, column permissions.
- InhouseProjectService for Easy Mode project creation, API keys, table creation.
- InhouseDeploymentService for R2 + Workers for Platforms (dispatch namespace) + KV mappings.
- Frontend infrastructure UI and API proxies are in place (InfrastructurePanel, status cards, Deploy dialog, hooks, i18n).
- Easy/Pro mode selection UI in the builder new project flow.

### Recent Work (This Session)
- Easy Mode project creation now triggers the AI build pipeline (create-preview-for-new-project) and returns build metadata.
- Build worker routes Easy Mode deployments to in-house hosting (R2 + dispatch namespace) with a static-worker fallback.
- User Workers now bind R2 (ASSETS) + PROJECT_BUILDS for static asset serving.
- Easy Mode build pipeline supports optional Next.js static export and prefers `out` for deployment.
- Auth Service (Phase 2) started: new DB tables + worker auth routes for email/password + magic link.
- CMS Service (Phase 2) started: content types + entries + metadata tables, worker routes for CRUD.
- CMS admin HMAC routes added for dashboard (types/entries/media + R2 base64 uploads).
- Next.js CMS admin proxy routes added under `/api/inhouse/projects/[id]/cms/*`.
- CMS admin UI added to InfrastructurePanel with React Query hooks + media upload.
- Infrastructure translations updated with CMS strings across locales.
- `@sheenapps/cms` SDK scaffolded under `/packages/cms/`.
- CMS user API now includes media listing; SDK exposes `listMedia`.
- Auth UI kit added to InfrastructurePanel (signup/signin/magic link snippets).
- Auth UI kit now includes live preview calls to auth endpoints.
- Auth UI kit includes a session-checker for `/v1/inhouse/auth/user`.
- CMS editor polish: schema validation + form-based entry editor + select/email/url/date + range/length validation + format hints + range UI + required badges + quick fill.
- Phase 3 tools panel added (custom domains, export, table viewer, eject) wired to placeholder API routes.
- Phase 3 placeholder API routes added for domains/exports/eject under `/api/inhouse/projects/[id]/`.
  - Translation updates include `phase3Tools` strings across locales.
- Worker Phase 3 endpoints added under `/v1/inhouse/projects/:id` (domains/exports/eject) with env feature flags.
- Phase 3 persistence added:
  - `inhouse_custom_domains` table for domain status/verification placeholders.
  - `inhouse_eject_requests` table for admin visibility + status tracking.
- Domain verification placeholder endpoint added under `/v1/inhouse/projects/:id/domains/:domain/verify`.
- Admin endpoint added: `/v1/admin/inhouse/eject-requests`.

Key files touched:
- `sheenappsai/src/app/api/projects/route.ts` (Easy Mode creation triggers build)
- `sheenapps-claude-worker/src/workers/buildWorker.ts` (Easy Mode deploy path + export)
- `sheenapps-claude-worker/src/services/inhouse/InhouseDeploymentService.ts` (ASSETS binding)
- `docs/INHOUSE_MODE_PLAN.md` (progress updates)
- `docs/INHOUSE_MODE_FRONTEND_PLAN.md` (Option B auto-deploy note)
- `sheenappsai/supabase/migrations/20260115_inhouse_auth_service.sql` (auth tables)
- `sheenapps-claude-worker/src/routes/inhouseAuth.ts` (auth endpoints)
- `sheenapps-claude-worker/src/services/inhouse/InhouseAuthService.ts` (auth logic)
- `sheenappsai/supabase/migrations/20260115_inhouse_cms_service.sql` (cms tables)
- `sheenapps-claude-worker/src/routes/inhouseCms.ts` (cms endpoints)
- `sheenapps-claude-worker/src/services/inhouse/InhouseCmsService.ts` (cms logic)
- `sheenapps-claude-worker/src/routes/inhouseCmsAdmin.ts` (cms admin HMAC routes)
- `sheenapps-claude-worker/src/server.ts` (registered cms admin routes)
- `sheenappsai/src/app/api/inhouse/projects/[id]/cms/*` (CMS admin proxies)
- `sheenappsai/src/components/builder/infrastructure/cms/` (CMS admin UI)
- `sheenappsai/src/hooks/useCmsAdmin.ts` (CMS React Query hooks)
- `sheenappsai/src/types/inhouse-cms.ts` (CMS types)
- `packages/cms/` (new @sheenapps/cms SDK)
- `sheenappsai/supabase/migrations/20260116_inhouse_phase3_requests.sql` (custom domains + eject tables)

## Architecture Decisions

### Easy Mode Deployment Model (Phase 1)
- Option B selected: single auto-deploy to `{subdomain}.sheenapps.com`.
- No separate preview vs production for Easy Mode in Phase 1.
- Deploy button can remain as manual/rollback control but build auto-deploys.

### Dispatch Worker
- Already implemented under `packages/dispatch-worker/`.
- Requires KV bindings: HOSTNAME_MAP, PROJECT_BUILDS, R2 bucket ASSETS, DISPATCH_NAMESPACE.

### Build Pipeline
- AI build creation uses `/v1/create-preview-for-new-project` in worker.
- Pro Mode continues to deploy to Cloudflare Pages previews.
- Easy Mode build artifacts are uploaded to R2 via InhouseDeploymentService.
- A default Worker bundle serves static assets from R2 using PROJECT_BUILDS + ASSETS.

## Remaining Gaps / Next Steps

### Hosting/Infra Integration
- Deploy the dispatch worker and configure bindings in Cloudflare (placeholders until IDs are available).
- Configure/verify CF dispatch namespace, KV namespaces, and R2 bucket (placeholders OK for now).
- Confirm Easy Mode requests resolve via HOSTNAME_MAP and PROJECT_BUILDS.
- Run R2 smoke test (upload + list + serve a static asset) once creds are available.
- Add Neon connection config + verify migrations (placeholder URL for now).
- Enable Phase 3 flags when ready: `INHOUSE_CUSTOM_DOMAINS_ENABLED`, `INHOUSE_EXPORTS_ENABLED`, `INHOUSE_EJECT_ENABLED`.

### SDK Publish Pipelines
- Add CI build/publish workflows for `@sheenapps/db` and `@sheenapps/cms` (npm publish + versioning).
- Document release steps and required env vars (npm token, provenance).
- Workflow: `.github/workflows/publish-inhouse-sdks.yml`
- Guide: `docs/INHOUSE_SDK_RELEASE.md`
- `@sheenapps/auth` SDK scaffolded under `/packages/auth/`.
- Phase 3 placeholder UI + tools panel added to Infrastructure panel.

### Infra Setup Guide
- See `docs/INHOUSE_INFRA_SETUP.md` for deployment steps and smoke tests.

### Build Output
- If SSR is needed, replace static-worker fallback with a proper Next.js Workers bundle.
- Otherwise ensure Easy Mode templates support `pnpm run export`.

### External Services Still Unwired
- Neon connection config (DB).
- Real R2 bucket smoke test.
- Dispatch namespace setup in Cloudflare.
- `@sheenapps/db` SDK build/publish pipeline (package exists under `packages/db/`).
- `@sheenapps/cms` SDK build/publish pipeline (package exists under `packages/cms/`).

## Useful References

Plans and status:
- `docs/INHOUSE_MODE_PLAN.md`
- `docs/INHOUSE_MODE_FRONTEND_PLAN.md`
- `docs/INHOUSE_API_ENDPOINTS.md`

Dispatch worker:
- `packages/dispatch-worker/` (routing worker + wrangler config)

In-house services:
- `sheenapps-claude-worker/src/services/inhouse/`

Frontend infrastructure UI:
- `sheenappsai/src/components/builder/infrastructure/`
- `sheenappsai/src/app/api/inhouse/`

## Notes
- Easy Mode now auto-deploys to production subdomain after build.
- Deploy pipeline expects R2 assets under `builds/{projectId}/{buildId}/...`.
- Build worker static fallback worker uses PROJECT_BUILDS and ASSETS bindings.
- Frontend data fetching: prefer React Query for new CMS UI; avoid introducing new SWR usage.
