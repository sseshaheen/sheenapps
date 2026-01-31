# SheenApps Dispatch Worker

This is the edge router for `*.sheenapps.com`. It is a **deployable Cloudflare Worker** (not an importable library).

## What it does
- Resolves `hostname -> projectId` (KV: `HOSTNAME_MAP`)
- Resolves `projectId -> buildId` (KV: `PROJECT_BUILDS`)
- Serves static assets from R2 (`ASSETS` bucket)
- Routes dynamic requests:
  - **WFP enabled**: dispatch to per-project Workers
  - **WFP disabled**: proxy to a fallback origin (DO worker)

## Environments
Configured in `wrangler.toml`:
- `development`, `staging`, `production`
- `wfp` (Workers for Platforms enabled)

## Required bindings (per env)
- KV namespaces:
  - `HOSTNAME_MAP`
  - `PROJECT_BUILDS`
- R2 bucket:
  - `ASSETS`
- (WFP only) dispatch namespace:
  - `DISPATCH_NAMESPACE`

## Required vars (per env)
- `DEFAULT_DOMAIN= sheenapps.com`
- `WFP_ENABLED=true|false`
- `FALLBACK_ORIGIN=https://worker.sheenapps.com`
- `FALLBACK_AUTH_HEADER=X-SheenApps-Dispatch-Secret`
 - `DISPATCH_KV_SYNC_ENABLED=true|false` (default true)
- `DISPATCH_KV_SYNC_CRON="0 4 * * *"` (UTC, default)
- `DISPATCH_KV_FULL_RECONCILE=true|false` (default true)
- `DISPATCH_MAP_CUSTOM_DOMAINS=true|false` (default true)
- `DISPATCH_MAP_PENDING_CUSTOM_DOMAINS=true|false` (default true)
 - `DISPATCH_KV_DRY_RUN=true|false` (default false)

## Secrets
- `FALLBACK_AUTH_TOKEN` (Cloudflare secret)
  - Must match `SHARED_SECRET` on the DO worker.

## Deploy
From this folder:
```
npx wrangler deploy --env production
```

## KV setup (example)
```
npx wrangler kv key put --env production HOSTNAME_MAP "myapp.sheenapps.com" "proj_123"
npx wrangler kv key put --env production PROJECT_BUILDS "proj_123" "build_456"
```

## Manual sync (optional)
```
npm run dispatch:kv:sync -- --dry-run
npm run dispatch:kv:sync -- --no-reconcile
```

## Notes
- Automation syncs **subdomains + custom domains** (pending + active by default).
- A startup sync runs ~60s after worker boot, plus a daily cron.
- Full reconcile deletes stale KV keys to prevent drift.
