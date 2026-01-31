# In-House Mode Infra Setup

This checklist covers the remaining infra wiring for Easy Mode.

## 1) Dispatch Worker Deployment

Location: `packages/dispatch-worker/`

1. Update `wrangler.toml` with real IDs (placeholders in repo):
   - `HOSTNAME_MAP` KV namespace ID
   - `PROJECT_BUILDS` KV namespace ID
   - `ASSETS` R2 bucket name
   - `DISPATCH_NAMESPACE` dispatch namespace
2. Deploy:
   - `pnpm --dir packages/dispatch-worker deploy:production`
3. Confirm wildcard routing in Cloudflare:
   - `*.sheenapps.com` route points to dispatch worker.

## 2) R2 Smoke Test

Run the R2 smoke test from the worker project:

```
node sheenapps-claude-worker/scripts/inhouse-r2-smoke.js
```

Required env vars:
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN_R2` (or `CF_API_TOKEN_WORKERS`)
- `CF_R2_BUCKET_BUILDS` (or `R2_BUCKET_NAME`)

## 3) Neon Postgres Connection

Ensure `DATABASE_URL` points to Neon (placeholder OK until available).

Smoke test:

```
node sheenapps-claude-worker/scripts/inhouse-neon-smoke.js
```

## 4) Dispatch Namespace + KV Bindings

Cloudflare resources expected:
- KV: `HOSTNAME_MAP` (placeholder ID for now)
- KV: `PROJECT_BUILDS` (placeholder ID for now)
- R2: `sheenapps-builds` (placeholder bucket for now)
- Dispatch namespace: `sheenapps-user-projects` (placeholder for now)

## 5) Verify Easy Mode Routing

- Create an Easy Mode project.
- Deploy a build.
- Verify:
  - `HOSTNAME_MAP` contains the subdomain → projectId mapping.
  - `PROJECT_BUILDS` contains projectId → buildId mapping.
  - `https://{subdomain}.sheenapps.com` serves assets from R2.

## 6) Phase 3 Feature Flags (Placeholders)

Enable these when Phase 3 endpoints are ready for real traffic:

- `INHOUSE_CUSTOM_DOMAINS_ENABLED` (set `true` to allow custom domain requests)
- `INHOUSE_CUSTOM_DOMAINS_CNAME_TARGET` (CNAME target for DNS instructions)
- `INHOUSE_EXPORTS_ENABLED` (set `true` to allow export job creation)
- `INHOUSE_EJECT_ENABLED` (set `true` to allow eject requests)
