# Environment Variables & PM2 Configuration Plan

## Executive Summary
This plan outlines the migration from our current minimal PM2 configuration to a robust, production-ready setup with proper environment variable management, secrets handling, and operational safety rails.

## Current State
- **PM2 Config**: Basic ecosystem.config.js without dotenv preloading
- **Secrets**: Unclear source of truth (possibly hardcoded or missing)
- **Safety**: No fail-fast on missing required variables
- **Dev Parity**: No .env.example for local development

## Target State
- **PM2 Config**: Hardened ecosystem.config.cjs with dotenv preloading
- **Secrets**: .env file as single source of truth with proper permissions
- **Safety**: Fail-fast checks on startup for required variables
- **Dev Parity**: Complete .env.example with all variables documented

## Implementation Plan

### Phase 1: Environment Variable Inventory ✅

#### Required Variables (MUST have for app to function)
```
SHARED_SECRET           # Authentication between services
DATABASE_URL            # PostgreSQL connection string
CF_ACCOUNT_ID           # Cloudflare account identifier
CF_API_TOKEN_WORKERS    # Cloudflare Workers API token
CF_API_TOKEN_R2         # Cloudflare R2 API token
R2_BUCKET_NAME          # R2 storage bucket name
R2_ACCESS_KEY_ID        # R2 access key
R2_SECRET_ACCESS_KEY    # R2 secret key
CF_KV_NAMESPACE_ID      # Cloudflare KV namespace
CF_PAGES_PROJECT_NAME   # Cloudflare Pages project
CLOUDFLARE_API_TOKEN    # General Cloudflare API token
CLOUDFLARE_ACCOUNT_ID   # Cloudflare account (duplicate?)
```

#### Optional Variables
```
NODE_ENV                # Environment (default: production)
PORT                    # Server port (default: 3000)
LOG_LEVEL               # Logging verbosity (default: info)
DISABLE_REQUEST_LOGGING # Request log toggle (default: false)
REDIS_HOST              # Redis host (optional if SKIP_QUEUE)
REDIS_PORT              # Redis port (optional if SKIP_QUEUE)
OTEL_SERVICE_NAME       # OpenTelemetry service name
OTEL_EXPORTER_OTLP_ENDPOINT # OTLP endpoint
OTEL_SDK_DISABLED       # Disable telemetry (default: false)
```

### Phase 2: PM2 Configuration Upgrade

#### 2.1 Create new ecosystem.config.cjs
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "sheenapps-claude-worker",
      cwd: "/home/worker/sheenapps-claude-worker",
      script: "./dist/server.js",
      
      // Process management
      exec_mode: "cluster",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      watch: false,
      
      // Force Node 22 via nvm
      interpreter: "/home/worker/.nvm/versions/node/v22.18.0/bin/node",
      
      // 🔑 Critical: Preload dotenv
      node_args: "-r dotenv/config",
      env_production: {
        NODE_ENV: "production",
        DOTENV_CONFIG_PATH: "/home/worker/sheenapps-claude-worker/.env"
      },
      
      // Logging
      error_file: "/home/worker/sheenapps-claude-worker/logs/pm2-error.log",
      out_file: "/home/worker/sheenapps-claude-worker/logs/pm2-out.log",
      log_file: "/home/worker/sheenapps-claude-worker/logs/pm2-combined.log",
      time: true,
      log_date_format: "YYYY-MM-DDTHH:mm:ss"
    }
  ]
};
```

#### 2.2 Migration Commands
```bash
# Backup current config
cd /home/worker/sheenapps-claude-worker
mv ecosystem.config.js ecosystem.config.js.bak

# Apply new config
pm2 delete sheenapps-claude-worker
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup  # If not already configured

# Verify
pm2 env 0 | grep -E 'SHARED_SECRET|DATABASE_URL|CF_|R2_'
```

### Phase 3: Add Startup Safety Rails

#### 3.1 Fail-fast implementation in src/server.ts
```typescript
// At the very top of src/server.ts (before any imports)
const required = [
  "SHARED_SECRET",
  "DATABASE_URL",
  "CF_ACCOUNT_ID",
  "CF_API_TOKEN_WORKERS",
  "CF_API_TOKEN_R2",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "CF_KV_NAMESPACE_ID",
  "CF_PAGES_PROJECT_NAME",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("FATAL: Required environment variables missing:", missing.join(", "));
  process.exit(1);
}
```

### Phase 4: Developer Experience

#### 4.1 Create .env.example
```bash
# --- Core ---
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DISABLE_REQUEST_LOGGING=false

# --- Secrets (REQUIRED) ---
SHARED_SECRET=replace-with-32-char-random
DATABASE_URL=postgresql://user:pass@host:5432/db

# --- Cloudflare / R2 (REQUIRED) ---
CF_ACCOUNT_ID=
CF_API_TOKEN_WORKERS=
CF_API_TOKEN_R2=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
CF_KV_NAMESPACE_ID=
CF_PAGES_PROJECT_NAME=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=

# --- Redis (optional if SKIP_QUEUE) ---
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# --- Telemetry (optional) ---
OTEL_SERVICE_NAME=sheenapps-worker
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SDK_DISABLED=false
```

#### 4.2 Update README with local development instructions
```markdown
## Local Development
1. Copy environment template: `cp .env.example .env`
2. Fill in required values in `.env`
3. Install dependencies: `pnpm i`
4. Run locally: `pnpm dev` or `pm2 start ecosystem.config.cjs --env production`
```

### Phase 5: Security Hardening

#### 5.1 File permissions
```bash
cd ~/sheenapps-claude-worker
touch .env
chmod 600 .env  # Only owner can read/write
chown worker:worker .env
```

#### 5.2 Gitignore verification
Ensure `.gitignore` contains:
```
.env
.env.*
!.env.example
```

### Phase 6: Operational Procedures

#### 6.1 Standard Operations
```bash
# Restart after env change
pm2 restart sheenapps-claude-worker --update-env && pm2 save

# Check health
curl -sS localhost:3000/health
curl -sS localhost:3000/health/detailed
curl -sS localhost:3000/health/capacity

# Verify Node version
pm2 describe sheenapps-claude-worker | grep -i 'node_version\|interpreter'

# View logs
pm2 logs sheenapps-claude-worker --lines 100

# Monitor
pm2 monit
```

#### 6.2 Secret Rotation Procedure
1. Create backup: `cp .env .env.$(date +%Y%m%d)`
2. Update secrets in `.env`
3. Apply: `pm2 restart sheenapps-claude-worker --update-env`
4. Verify: `pm2 env 0 | grep [SECRET_NAME]`
5. Document in private SECRETS_CHANGELOG.md

### Phase 7: Validation Checklist

- [ ] New ecosystem.config.cjs created and tested
- [ ] .env file created with all required variables
- [ ] .env permissions set to 600
- [ ] Fail-fast checks added to src/server.ts
- [ ] .env.example created and committed
- [ ] README updated with local dev instructions
- [ ] PM2 restart tested with --update-env
- [ ] Health endpoints verified working
- [ ] Logs aggregating correctly
- [ ] Node 22 verified in PM2 process

## Rollback Plan

If issues occur during migration:
```bash
cd /home/worker/sheenapps-claude-worker
pm2 delete sheenapps-claude-worker
mv ecosystem.config.js.bak ecosystem.config.js
pm2 start ecosystem.config.js
```

## Open Questions for Dev Team

1. **Duplicate Cloudflare IDs**: Both `CF_ACCOUNT_ID` and `CLOUDFLARE_ACCOUNT_ID` exist - are both needed?
2. **Redis Optional**: Confirm Redis is truly optional when `SKIP_QUEUE` is set
3. **Build-time vars**: Confirm no build-time environment variables are needed (e.g., NEXT_PUBLIC_*)
4. **Health endpoints**: Verify `/health`, `/health/detailed`, `/health/capacity` endpoints exist and work
5. **Scaling plan**: When should we increase PM2 instances from 1 to multiple?

## Success Criteria

- ✅ Application never runs with missing required variables
- ✅ Secrets are never committed to git
- ✅ PM2 consistently loads environment from .env
- ✅ New developers can run locally within 5 minutes
- ✅ Secret rotation doesn't require code changes
- ✅ Logs provide clear feedback on startup failures

## Timeline

- **Day 1**: Implement Phase 1-3 (inventory, PM2 config, fail-fast)
- **Day 2**: Implement Phase 4-5 (dev experience, security)
- **Day 3**: Test, validate, and document procedures
- **Day 4**: Deploy to production with monitoring

## Risk Mitigation

- **Risk**: App fails to start after migration
  - **Mitigation**: Test in staging first, keep rollback procedure ready
  
- **Risk**: Secrets exposed in logs
  - **Mitigation**: Review logging code, ensure no env vars are logged
  
- **Risk**: PM2 doesn't load .env
  - **Mitigation**: Verify with `pm2 env 0` command before considering complete

## Notes

- This plan prioritizes security (secrets in .env) over convenience (secrets in ecosystem)
- The approach uses dotenv preloading to ensure consistency across environments
- PM2 cluster mode is configured but limited to 1 instance initially for safety