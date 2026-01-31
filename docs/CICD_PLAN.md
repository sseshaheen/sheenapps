# CI/CD Plan for SheenApps Worker Server

## Overview

This plan outlines the implementation of a proper CI/CD pipeline for the worker server using GitHub Actions, modeled after the playdate project's successful implementation but adapted for the worker server's specific architecture.

**Deployment Model:** Self-hosted server with SSH-based deployment and PM2 process management (same as playdate)



What's Left (Your Tasks)

1. Server Setup - Verify worker user has Node.js 22, pnpm, PM2 installed
2. GitHub Secrets - Add to repo settings:
  - SERVER_HOST: ssh.sheenapps.com
  - SERVER_USER: worker
  - SERVER_SSH_KEY: (generate new SSH key)
3. Branch Protection - Enable on main requiring CI to pass
4. Test - Push to a feature branch to test CI, then merge to test deploy



---

## Architecture Comparison

| Aspect | Playdate | Worker Server | Adaptation Needed |
|--------|----------|---------------|-------------------|
| Runtime | Node.js 20 | Node.js 22 | Update node version |
| Package Manager | pnpm 9 | pnpm (latest) | Same approach |
| Framework | NestJS | Fastify | Different build/start commands |
| Database | PostgreSQL (Supabase) | PostgreSQL (Supabase) | Same approach |
| Queue System | None | Redis + BullMQ | Add Redis to CI services |
| Process Manager | PM2 | PM2 | Same approach |
| Build Output | `dist/apps/backend/src/main` | `dist/server.js` | Adjust paths |
| Health Endpoint | `/api/v1/auth/health` | `/healthz` | Adjust endpoint |

---

## Phase 1: CI Pipeline (`.github/workflows/ci.yml`)

### Trigger Events
```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### Jobs

#### Job 1: Lint & Typecheck (Fast, No Services)
**Services Required:** None - pure TypeScript operations

**Why no services?** Lint and typecheck are pure operations that don't need DB/Redis. Keeping them service-free makes CI faster and eliminates flaky timeout failures.

**Steps:**
1. Checkout code
2. Setup pnpm
3. Setup Node.js 22 with pnpm cache
4. Install dependencies (`pnpm install --frozen-lockfile`)
5. Run linter (`npm run lint`)
6. Run typecheck (`npm run typecheck`)
7. Check for hardcoded URLs/secrets (grep pattern scan)

**Timeout:** 10 minutes

#### Job 2: Build
**Depends on:** lint-and-typecheck
**Services Required:** None

**Steps:**
1. Checkout, setup pnpm, setup Node.js
2. Install dependencies
3. Build project (`npm run build`)
4. Verify build output exists (`dist/server.js`)

**Timeout:** 10 minutes

#### Job 3: Tests (With Services)
**Depends on:** lint-and-typecheck

**Services Configuration:**
```yaml
services:
  postgres:
    image: postgres:15-alpine
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
```

**Steps:**
1. Checkout, setup pnpm, setup Node.js
2. Install dependencies
3. **Install psql client** (needed for migrations)
   ```bash
   sudo apt-get update && sudo apt-get install -y postgresql-client
   ```
4. **Bootstrap test database** (`npm run db:migrate:ci`)
5. Run tests (`npm run test`)

**Environment variables:**
```yaml
env:
  DATABASE_URL: postgresql://test:test@localhost:5432/testdb
  REDIS_HOST: localhost
  REDIS_PORT: 6379
  SUPABASE_URL: https://test.supabase.co
  SUPABASE_ANON_KEY: test-anon-key
  SUPABASE_SERVICE_ROLE_KEY: test-service-key
  SHARED_SECRET: test-shared-secret
```

**Timeout:** 15 minutes

**Important:** Even though prod migrations are manual, CI tests need a real schema. The `db:migrate:ci` script applies migrations to the CI Postgres container.

---

## Phase 2: Deploy Pipeline (`.github/workflows/deploy.yml`)

### Trigger Events

**Why not `workflow_run`?** The `workflow_run` trigger doesn't support `paths:` filtering natively. Using push with paths filter + branch protection (require CI to pass) is cleaner and more reliable.

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'tsconfig.json'
      - 'ecosystem.config.js'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:  # Manual trigger for ad-hoc deployments

concurrency:
  group: worker-deploy
  cancel-in-progress: true  # Prevents two merges from racing

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
```

**Note:** Since the worker IS the repo root, paths filter targets actual files in the repo (src/, package.json, etc.), not a subdirectory.

**Important:** Enable branch protection on `main` requiring CI to pass before merge. This ensures deploy only runs after CI succeeds.

### Deployment Steps

**Timeout:** 10 minutes

1. **SSH into server**

2. **Update code:**
   ```bash
   cd /home/worker/sheenapps-claude-worker
   git fetch origin main
   git reset --hard origin/main
   ```

3. **Install dependencies:**
   ```bash
   pnpm install --frozen-lockfile
   ```

4. **Build:**
   ```bash
   npm run build
   ```

5. **Write version file (NOT sed on .env):**
   ```bash
   # Write commit SHA to .version file - cleaner than mutating .env
   echo "${{ github.sha }}" > .version
   ```

   **Why .version file?** Editing .env with sed is fragile (format differences, missing key, permissions). A dedicated .version file is simpler and safer.

6. **Restart PM2 process:**
   ```bash
   # Use ecosystem config as source of truth - more deterministic than bare process name
   pm2 startOrReload ecosystem.config.js --only sheenapps-worker --update-env
   ```

   **Why startOrReload?** More deterministic than `pm2 restart <name>` - won't silently do nothing if process name doesn't match.

7. **Health check verification:**
   ```bash
   # Poll /healthz endpoint - expects JSON { "status": "ok", "version": "..." }
   # Regex handles optional whitespace around colon (JSON formatting varies)
   for i in {1..12}; do
     if curl -sf http://localhost:3000/healthz | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
       echo "Health check passed"
       exit 0
     fi
     sleep 5
   done
   echo "Health check failed"
   exit 1
   ```

8. **Log deployment:**
   ```bash
   echo "$(date -Iseconds) ${{ github.sha }} deployed" >> .deploy.log
   ```

---

## Phase 3: Required Changes to Worker Server

### 3.1 Add Missing Scripts to `package.json`

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts --max-warnings 0",
    "lint:fix": "eslint src --ext .ts --fix",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "format": "prettier --write \"src/**/*.ts\"",
    "check": "npm run lint && npm run typecheck && npm run build && npm run test",
    "db:migrate:ci": "node scripts/migrate-ci.js"
  }
}
```

### 3.1.1 Create CI Migration Script

Create `scripts/migrate-ci.js` to apply migrations to CI Postgres:

```javascript
// scripts/migrate-ci.js
// Applies SQL migrations from migrations/ folder to CI database
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '../migrations');
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  console.log(`Applying ${file}...`);
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  // Use psql or your preferred method
  execSync(`psql "$DATABASE_URL" -f "${path.join(migrationsDir, file)}"`, { stdio: 'inherit' });
}
console.log('Migrations complete');
```

**Note:** Adjust this script based on your actual migration setup. If you use a migration tool, use that instead.

### 3.2 Add ESLint Configuration

Create `.eslintrc.js` if not present, or verify existing configuration is suitable for CI.

### 3.3 Update Health Endpoint

Enhance `/healthz` to return version information by reading from `.version` file:

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Helper to read version from .version file
function getVersion(): string {
  const versionFile = join(process.cwd(), '.version');
  if (existsSync(versionFile)) {
    return readFileSync(versionFile, 'utf-8').trim();
  }
  return 'unknown';
}

// Health endpoint
app.get('/healthz', async (req, reply) => {
  return {
    status: 'ok',
    version: getVersion(),
    timestamp: new Date().toISOString()
  };
});
```

### 3.4 Add `.version` to `.gitignore`

```bash
echo ".version" >> .gitignore
```

The `.version` file is created during deployment and should not be committed.

---

## Phase 4: GitHub Secrets Required

| Secret | Description | Value |
|--------|-------------|-------|
| `SERVER_HOST` | Server hostname | `ssh.sheenapps.com` |
| `SERVER_USER` | SSH username | `worker` (matches ecosystem.config.js path) |
| `SERVER_SSH_KEY` | Private SSH key for authentication | (ed25519 or RSA key - generate new one for GitHub Actions) |

**Note:** CI tests will use GitHub Actions service containers for PostgreSQL and Redis, so no external database/Redis secrets needed for CI.

---

## Phase 5: Server Preparation

### 5.1 Server Requirements

Verify these are installed on `ssh.sheenapps.com`:

```bash
# Check Node.js version (need 22.x)
node --version

# Check pnpm
pnpm --version

# Check PM2
pm2 --version

# Check Redis
redis-cli ping
```

If any are missing:
```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2
npm install -g pm2
```

### 5.1.1 Redis Production Configuration

**Important:** Document where Redis is running in production.

If Redis is running locally on the server:
```bash
# Verify Redis is supervised by systemd
systemctl status redis

# Check memory policy (important for BullMQ)
redis-cli CONFIG GET maxmemory-policy
# Should be "noeviction" for BullMQ to work correctly

# Check persistence (optional but recommended)
redis-cli CONFIG GET appendonly
```

If using managed Redis (e.g., Railway Redis, Upstash, etc.):
- Document the connection URL in your environment notes
- Ensure `REDIS_HOST` and `REDIS_PORT` (or `REDIS_URL`) are set in `.env`

### 5.2 Initial Deployment Directory Setup

```bash
# On server (ssh root@ssh.sheenapps.com)
cd /root  # or wherever you want the worker to live

# Clone repository (if not already done)
git clone https://github.com/YOUR_ORG/sheenapps.git sheenapps-claude-worker
cd sheenapps-claude-worker

# Initial setup
pnpm install
npm run build

# Create .env file with production values
cp .env.example .env
nano .env  # Edit with production values

# Setup Claude CLI credentials manually
mkdir -p ~/.config/claude-code
# Add auth.json with credentials

# Start with PM2
pm2 start ecosystem.config.js --name sheenapps-worker
pm2 save
pm2 startup
```

### 5.3 SSH Key Setup for GitHub Actions

```bash
# On your local machine - generate a dedicated deploy key
ssh-keygen -t ed25519 -C "github-actions-sheenapps" -f ~/.ssh/sheenapps_deploy

# Copy public key to server (using worker user, not root)
ssh-copy-id -i ~/.ssh/sheenapps_deploy.pub worker@ssh.sheenapps.com

# Test connection
ssh -i ~/.ssh/sheenapps_deploy worker@ssh.sheenapps.com "echo 'Connection successful'"

# Add private key content to GitHub Secrets as SERVER_SSH_KEY
cat ~/.ssh/sheenapps_deploy
# Copy this output to GitHub Secrets
```

---

## Phase 6: Implementation Steps

### Step 1: Create CI Workflow
- [x] Create `.github/workflows/ci.yml`
- [x] Add lint & typecheck job (no services - fast)
- [x] Add build job (no services)
- [x] Add test job with PostgreSQL and Redis services
- [x] Add concurrency and timeout settings
- [ ] Test on a feature branch

### Step 2: Add Missing Scripts & Config
- [x] Add `lint` script to package.json (note: using typecheck as lint, no ESLint)
- [x] Add `check` script for local pre-commit validation
- [x] Add `db:migrate:ci` script for CI test database setup
- [x] Create `scripts/migrate-ci.js`
- [x] Add `.version` to `.gitignore`
- [x] Add `.deploy.log` to `.gitignore`

### Step 3: Update Health Endpoint
- [x] Created new `/healthz` endpoint that returns JSON with version from `.version` file
- [x] Kept existing `/myhealthz` endpoint for backwards compatibility
- [ ] Test locally by creating a `.version` file

### Step 4: Create Deploy Workflow
- [x] Create `.github/workflows/deploy.yml`
- [x] Configure push trigger with paths filter
- [x] Add concurrency group
- [x] Configure SSH action (using appleboy/ssh-action@v1.0.3)
- [x] Add deployment steps (including .version file creation)
- [x] Add health check verification

### Step 5: Server Setup (ssh.sheenapps.com)
- [ ] Verify Node.js 22, pnpm, PM2, Redis installed
- [ ] Document Redis configuration (local vs managed)
- [ ] Clone repo to deployment directory
- [ ] Configure PM2 ecosystem
- [ ] Set up SSH keys for GitHub Actions
- [ ] Create production .env file
- [ ] Manually configure Claude CLI credentials

### Step 6: GitHub Configuration
- [ ] Add `SERVER_HOST` secret (`ssh.sheenapps.com`)
- [ ] Add `SERVER_USER` secret (`worker`)
- [ ] Add `SERVER_SSH_KEY` secret (private key)
- [ ] **Enable branch protection on `main`** requiring CI to pass (required for deploy strategy)

### Step 7: Testing & Validation
- [ ] Test CI on feature branch
- [ ] Merge to main and verify deploy triggers
- [ ] Verify health check returns JSON with version
- [ ] Test rollback procedure

---

## File Structure After Implementation

```
sheenapps-claude-worker/
├── .github/
│   └── workflows/
│       ├── ci.yml           # CI pipeline (lint, test, build)
│       └── deploy.yml       # Deployment pipeline
├── .eslintrc.js             # ESLint configuration
├── .prettierrc              # Prettier configuration (if not present)
├── .gitignore               # Updated to include .version
├── .version                 # Created during deploy (not committed)
├── ecosystem.config.js      # PM2 configuration (already exists)
├── package.json             # Updated with new scripts
└── src/
    └── server.ts            # Updated health endpoint
```

---

## Rollback Procedure

If a deployment fails or causes issues:

```bash
# SSH into server
ssh worker@ssh.sheenapps.com

# Check PM2 logs
pm2 logs sheenapps-claude-worker --lines 100

# Rollback to previous commit
cd /home/worker/sheenapps-claude-worker
git log --oneline -5  # Find previous good commit
git reset --hard <PREVIOUS_COMMIT_SHA>
pnpm install --frozen-lockfile
npm run build
echo "<PREVIOUS_COMMIT_SHA>" > .version
pm2 startOrReload ecosystem.config.js --only sheenapps-claude-worker --update-env

# Verify health
curl http://localhost:3000/healthz
```

---

## Monitoring & Alerts

### Recommended Additions

1. **Slack/Discord notifications** on deploy success/failure
2. **Deployment status badge** in README
3. **Automatic rollback** on health check failure (advanced)

### Example Slack Notification Step

```yaml
- name: Notify Slack
  if: always()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'Worker deployment ${{ job.status }}'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Security Considerations

1. **Never commit secrets** - All sensitive values in GitHub Secrets
2. **Use environment-specific configs** - Separate .env files for each environment
3. **Audit logging** - All deployments logged with timestamp and commit SHA
4. **SSH key rotation** - Rotate deployment keys periodically
5. **Branch protection** - Require CI to pass before merge to main

### Near-Term Security Upgrade: Stop Deploying as Root

Currently deploying as `root@ssh.sheenapps.com`. This works but is a security risk - if the deploy process is compromised, attacker has full server access.

**Recommended fix (do after initial CI/CD is working):**
```bash
# On server - create dedicated deploy user
useradd -m -s /bin/bash deploy
mkdir -p /home/deploy/sheenapps-claude-worker
chown -R deploy:deploy /home/deploy/sheenapps-claude-worker

# Give deploy user permission to restart PM2
# (configure PM2 to run as deploy user, or use sudo with specific commands)

# Update GitHub secrets
# SERVER_USER: deploy (instead of root)
```

This limits blast radius if deployment credentials are compromised.

---

## Resolved Questions

| Question | Answer |
|----------|--------|
| Database migrations | Manual via Supabase dashboard SQL editor - not automated in CI/CD |
| Multiple workers | Single worker currently (may scale later) |
| Staging environment | Production only |
| Claude CLI credentials | Manual setup on server (not part of CI/CD) |
| Server details | `root@ssh.sheenapps.com` |

---

## Estimated Complexity

| Phase | Complexity | Notes |
|-------|------------|-------|
| CI Pipeline | Medium | Redis service adds complexity vs playdate |
| Deploy Pipeline | Medium | Similar to playdate, straightforward |
| Code Changes | Low | Minor script additions |
| Server Setup | Medium | One-time setup, well-documented |
| Testing | Low | Follow playdate patterns |

---

## Future Enhancements (Not Needed Now)

These are good practices to consider as the system scales, but would be overengineering for the current setup:

### Atomic Release Directories
Instead of git pull in place, deploy to versioned directories with symlinks:
```
/releases/abc123/
/releases/def456/
/current -> /releases/def456/  # symlink
```
Benefits: Instant rollback (just repoint symlink), no "half-updated" state during deploy.

### Zero-Downtime Reloads
Use PM2 cluster mode with `pm2 startOrReload` for near-zero downtime deploys.

### Split Unit/Integration Tests
As the test suite grows, separate tests that need services (integration) from those that don't (unit) for faster CI feedback.

### Staging Environment
Add a staging server for testing deploys before production.

---

## Next Steps

1. ~~Review this plan and approve~~ Done
2. ~~Begin implementation with Phase 1 (CI Pipeline)~~ Done
3. Complete server setup (Step 5)
4. Add GitHub secrets (Step 6)
5. Test CI/CD pipeline (Step 7)

---

## Implementation Log

### 2024-01-08: Initial Implementation Complete

**Files Created:**
- `.github/workflows/ci.yml` - CI pipeline with lint, build, test jobs
- `.github/workflows/deploy.yml` - Deploy pipeline with SSH action
- `scripts/migrate-ci.js` - CI database migration script

**Files Modified:**
- `package.json` - Added `check` and `db:migrate:ci` scripts
- `src/server.ts` - Added `/healthz` endpoint with version support
- `.gitignore` - Added `.version` and `.deploy.log`

**Discoveries During Implementation:**

1. **Health endpoint was `/myhealthz` not `/healthz`**
   - Created new `/healthz` endpoint for CI/CD (returns `{ status: 'ok', version }`)
   - Kept `/myhealthz` for backwards compatibility (returns more detailed info)

2. **No ESLint installed**
   - The existing `lint` script was just `tsc --noEmit` (same as typecheck)
   - Kept it simple - typecheck catches the important errors
   - Can add ESLint later if needed

3. **GitHub repo URL**
   - Confirmed: `github.com/sseshaheen/sheenapps-claude-worker`

4. **PM2 configuration discrepancies (FIXED)**
   - Process name: `sheenapps-claude-worker` (not `sheenapps-worker`)
   - Server path: `/home/worker/sheenapps-claude-worker` (not `/root/...`)
   - Updated deploy.yml to match ecosystem.config.js

5. **SSH user**
   - ecosystem.config.js expects `/home/worker/` path
   - GitHub secret `SERVER_USER` should be `worker` (not `root`)

**What's Left (User Tasks):**
- Server setup (install dependencies, clone repo, configure PM2)
- Generate SSH key and add to GitHub secrets
- Enable branch protection on `main`
- Test the pipeline
