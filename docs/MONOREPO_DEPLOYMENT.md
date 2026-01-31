# Monorepo Deployment Guide

**Date:** 2026-02-01
**Purpose:** Document deployment settings for the SheenApps monorepo

---

## Repository Structure

```
sheenapps/
├── apps/
│   ├── web/        # Next.js 16 → Vercel
│   └── worker/     # Fastify → Railway/Docker
├── packages/
│   ├── api-contracts/
│   ├── capabilities/
│   ├── platform-tokens/
│   └── translations/
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Vercel Configuration (apps/web)

### Project Settings

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `apps/web` |
| **Build Command** | `cd ../.. && pnpm turbo build --filter=@sheenapps/web` |
| **Output Directory** | `.next` (default) |
| **Install Command** | `cd ../.. && pnpm install` |
| **Node.js Version** | 22.x |

### Why These Settings

1. **Root Directory = `apps/web`**: Vercel needs to know where the Next.js app lives
2. **Build Command with `cd ../..`**: Build must run from monorepo root for:
   - Turborepo to find `turbo.json`
   - pnpm to resolve workspace packages
   - `outputFileTracingRoot` to trace dependencies correctly
3. **Install Command with `cd ../..`**: pnpm workspace install must happen at root

### Environment Variables

All existing environment variables remain unchanged. Add these to your Vercel project:

```
# Required for GitHub Packages (if using @sheenapps/templates)
NODE_AUTH_TOKEN=<github-token>

# All existing env vars from sheenappsai...
```

### next.config.ts Requirements

The web app's `next.config.ts` must have these settings for monorepo:

```typescript
import path from 'path';

const nextConfig: NextConfig = {
  // CRITICAL: Must point to monorepo root for Vercel output tracing
  outputFileTracingRoot: path.resolve(__dirname, '../..'),

  // CRITICAL: Must match outputFileTracingRoot for Turbopack
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },

  // ... rest of config
}
```

---

## Worker Deployment (apps/worker)

### Railway/Docker Settings

The worker can be deployed from the monorepo using:

```bash
# Build from monorepo root
pnpm turbo build --filter=@sheenapps/worker

# Start
cd apps/worker && node dist/server.js
```

### Dockerfile Example

```dockerfile
FROM node:22-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/worker ./apps/worker
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm turbo build --filter=@sheenapps/worker

# Start
WORKDIR /app/apps/worker
CMD ["node", "dist/server.js"]
```

---

## Local Development

### First Time Setup

```bash
# Clone and install
git clone <repo>
cd sheenapps
pnpm install

# Start all apps in dev mode
pnpm dev

# Or start specific app
pnpm --filter @sheenapps/web dev
pnpm --filter @sheenapps/worker dev
```

### Build Commands

```bash
# Build everything (with caching)
pnpm build

# Build specific package/app
pnpm turbo build --filter=@sheenapps/web
pnpm turbo build --filter=@sheenapps/worker
pnpm turbo build --filter=@sheenapps/api-contracts

# Build with dependencies
pnpm turbo build --filter=@sheenapps/web...
```

---

## CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Build & Deploy

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 10.28.2

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm turbo build

      - name: Type check
        run: pnpm turbo typecheck

      - name: Test
        run: pnpm turbo test
```

### Turborepo Remote Caching (Optional)

To enable remote caching for faster CI:

```bash
# Login to Vercel (one-time)
npx turbo login

# Link to Vercel team
npx turbo link
```

Then add to CI:
```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

---

## Troubleshooting

### "Cannot find module @sheenapps/..."

**Cause:** Workspace packages not built before app build.

**Fix:** Use turbo with `...` suffix to build dependencies:
```bash
pnpm turbo build --filter=@sheenapps/web...
```

### Vercel Build Fails with "Module not found"

**Cause:** Build command not running from monorepo root.

**Fix:** Ensure build command starts with `cd ../.. &&`:
```
cd ../.. && pnpm turbo build --filter=@sheenapps/web
```

### "Next.js inferred your workspace root" Warning

**Cause:** `outputFileTracingRoot` or `turbopack.root` not set correctly.

**Fix:** Both must point to monorepo root in `next.config.ts`:
```typescript
outputFileTracingRoot: path.resolve(__dirname, '../..'),
turbopack: {
  root: path.resolve(__dirname, '../..'),
},
```

### pnpm Install Fails in CI

**Cause:** NODE_AUTH_TOKEN not set for GitHub Packages.

**Fix:** Add secret to CI environment:
```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NODE_AUTH_TOKEN }}
```

---

## Checklist for New Deployments

- [ ] Vercel Root Directory set to `apps/web`
- [ ] Build Command uses `cd ../..` prefix
- [ ] Install Command uses `cd ../..` prefix
- [ ] NODE_AUTH_TOKEN secret configured
- [ ] All existing env vars migrated
- [ ] `next.config.ts` has correct `outputFileTracingRoot`
- [ ] Test build locally with `pnpm turbo build --filter=@sheenapps/web`
- [ ] Test Vercel preview deployment before merging
