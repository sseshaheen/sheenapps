# Easy Mode SDK - Remaining Work

> Extracted from EASY_MODE_SDK_PLAN.md on 2026-01-25
>
> This document tracks only incomplete items. For full context, see [EASY_MODE_SDK_PLAN.md](./EASY_MODE_SDK_PLAN.md).

---

## Status Overview

| Category | Status |
|----------|--------|
| **Priority 1: Foundation** | ✅ Complete (code done, migrations pending) |
| **Priority 2: SDKs** | ✅ Complete (code done, migrations pending) |
| **Priority 3: AI Generation** | ✅ Complete |
| **Priority 4: Polish** | ✅ Complete (TypeScript optimization deferred) |
| **Migrations** | ⏳ 6 pending (user task) |
| **Environment Variables** | ⏳ 3 to set (user task) |
| **Fail-fast Env Validation** | ✅ Implemented in `envValidation.ts` |
| **Health Routes** | ✅ Registered in `server.ts` |
| **Key Rotation Runbook** | ✅ Created at `/docs/runbooks/KEY_ROTATION.md` |

---

## 1. Immediate User Tasks

### Database Migrations to Apply

Run these in order via Supabase dashboard or CLI. All migrations use `IF NOT EXISTS` / `IF EXISTS` patterns for idempotency.

| # | Migration File | Service | Tables Created | Rollback |
|---|---------------|---------|----------------|----------|
| 1 | `20260123_inhouse_secrets_service.sql` | Secrets | `inhouse_secrets`, `inhouse_secrets_audit`, `inhouse_secrets_key_versions` | Drop if empty or staging |
| 2 | `107_inhouse_job_schedules.sql` | Jobs | `inhouse_job_schedules` | Drop if empty or staging |
| 3 | `108_inhouse_emails.sql` | Email | `inhouse_emails` | Drop if empty or staging |
| 4 | `109_inhouse_payments.sql` | Payments | `inhouse_payment_customers`, `inhouse_payment_events` | Drop if empty or staging |
| 5 | `110_inhouse_analytics.sql` | Analytics | `inhouse_analytics_events`, `inhouse_analytics_users` | Drop if empty or staging |
| 6 | `20260124_inhouse_backups.sql` | Backups | `inhouse_backups` | Drop if empty or staging |

**Locations** (files are split across two directories):
- `sheenappsai/supabase/migrations/`: #1 (secrets), #6 (backups)
- `sheenapps-claude-worker/migrations/`: #2-5 (jobs, emails, payments, analytics)

**Requirement**: Apply migrations only via Supabase migrations table/CLI, not copy-pasted ad hoc. This ensures a single source of truth for "what ran."

**Rollback strategy**: All migrations create new tables only (no ALTER on existing tables). If migration N fails, drop tables created in N and retry. **In production with data, rollback = forward migration** (never drop tables with data).

### Environment Variables to Set

| Variable | Service | Notes |
|----------|---------|-------|
| `SHEEN_SECRETS_MASTER_KEY` | Secrets | 32+ bytes, base64 encoded. Used for envelope encryption. |
| `RESEND_API_KEY` | Email | From Resend dashboard. Required for email delivery. |
| `SHEEN_BACKUP_MASTER_KEY` | Backups | 32+ bytes, base64 encoded. Used for backup encryption. |

**Set in**: Vercel project settings, worker deployment, local `.env` files.

**Fail-fast validation**: Worker must refuse to boot if required env vars are missing.

```typescript
const REQUIRED_ENV = [
  'SHEEN_SECRETS_MASTER_KEY',
  'RESEND_API_KEY',
  'SHEEN_BACKUP_MASTER_KEY',
] as const;

export function assertRequiredEnv() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

// Call at worker startup BEFORE server.listen() or queue init
assertRequiredEnv();
```

### Infrastructure Setup (Backups)

- [ ] Install `postgresql-client` in worker Docker image
- [ ] Configure R2 bucket: `sheenapps-backups` (or use existing)
- [ ] Deploy worker with backup services
- [ ] Verify `daily-backup` and `backup-cleanup` jobs run correctly

**Permissions tripwire** (high privilege service):
- [ ] Confirm least-privilege DB role for backups (read-only + `pg_dump` permissions)
- [ ] Confirm R2 credentials scoped to `sheenapps-backups/*` only (not full bucket access)

### Key Rotation Runbook

- [x] Created `/docs/runbooks/KEY_ROTATION.md` - Complete manual rotation procedure:
  1. Generate new master key, add as `_NEXT` variant
  2. Re-encrypt envelope keys / backup manifests with new key
  3. Promote new key as primary
  4. Keep old key for decryption for N days
  5. Remove old key after grace period

---

## 2. Deployment Sequence

Roll out in order of increasing external blast radius:

| Phase | Action | Risk Level |
|-------|--------|------------|
| 1 | Apply all 6 migrations | Low (new tables only) |
| 2 | Set env vars everywhere + add fail-fast validation | Low |
| 3 | Deploy worker (optionally behind `EASY_MODE_SDK_ENABLED=true` flag) | Low |
| 4 | Verify read-only operations (list backups, list analytics, etc.) | Low |
| 5 | Enable **secrets** (low external blast) | Low |
| 6 | Enable **jobs** (internal blast only) | Medium |
| 7 | Enable **analytics** (high volume, low harm) | Medium |
| 8 | Enable **email** (external blast - sends real emails) | High |
| 9 | Enable **payments** (external money blast) | High |
| 10 | Enable **backups** (high privilege - DB access) | High |

---

## 3. Production Readiness Checklist

### Pre-Deploy (Staging)

- [ ] Run full migration on staging
- [ ] Set all env vars on staging
- [ ] Backup restore test (deterministic):
  - [ ] Seed staging DB with known row set
  - [ ] Run backup job
  - [ ] Restore into isolated schema/database
  - [ ] Verify row counts match for: `inhouse_secrets`, `inhouse_emails`, `inhouse_analytics_events`
- [ ] All functional tests pass on staging

### Deploy

- [ ] Apply all 6 migrations to production
- [ ] Set all 3 environment variables
- [ ] Fail-fast env validation in place
- [ ] Deploy worker with updated code

### Post-Deploy Verification

**Functional checks** (per SDK):
- [ ] Secrets: create, get, delete
- [ ] Jobs: enqueue, schedule, cancel
- [ ] Email: send with template
- [ ] Payments: create checkout session
- [ ] Analytics: track event
- [ ] Backups: create, list, restore

**Cross-cutting checks** (critical for production):
- [ ] **AuthZ isolation**: Project A cannot access Project B's data (test with two test projects)
- [ ] **Rate limiting**: Email, analytics, payments endpoints reject excess requests
- [ ] **Idempotency**:
  - Payments: duplicate checkout session requests return same session
  - Email: duplicate send with same idempotency key returns 200 (not 201)
  - Jobs: duplicate enqueue with same idempotency key doesn't create duplicate job

### Health & Observability

Define "healthy" explicitly. Worker health endpoint should verify (fast + non-destructive):

- [ ] DB connectivity: `SELECT 1` (not a real table query)
- [ ] R2 connectivity: `HEAD` on bucket or known key prefix
- [ ] Redis connectivity: `PING`
- [ ] Email provider configured: `RESEND_API_KEY` present (env check only)

**Monitoring queries** (adapt to your actual logging schema):
```sql
-- If using inhouse_activity_log:
SELECT action, COUNT(*) FROM inhouse_activity_log
WHERE status = 'error' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action;

-- Top failing actions:
SELECT action, error_message, COUNT(*) FROM inhouse_activity_log
WHERE status = 'error' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action, error_message ORDER BY COUNT(*) DESC LIMIT 10;
```

---

## 4. Deferred Technical Debt

### TypeScript Optimization
- **Status**: Deferred
- **Reason**: Existing tsconfig issues in worker project
- **Impact**: Build times could be improved with incremental compilation
- **Effort**: Medium (needs dedicated PR to fix config conflicts)

### External KMS Integration
- **Status**: Using env var `SHEEN_SECRETS_MASTER_KEY`
- **Target**: AWS KMS or HashiCorp Vault
- **Why**: Production-grade key management with automatic rotation
- **Effort**: Medium-High (integration + key migration)

### SDK Consistency Polish

| Item | Description |
|------|-------------|
| Standardize result types | Ensure all SDKs use identical `SheenResult<T>` pattern |
| Add retryable field | Add `retryable: boolean` to all error types |
| URL normalization | Apply consistent URL handling across all SDKs |
| Zod validation | Replace manual type assertions in proxy routes |
| Standardize logging | Use `[ServiceName]` prefix in all services |
| SDK consistency guide | Document expected patterns for new SDKs |

---

## 5. Future SDK Phases

### Phase 3: Specialized (Not Started)

| Package | Purpose | Dependencies |
|---------|---------|--------------|
| `@sheenapps/realtime` | WebSocket subscriptions, presence | Cloudflare Durable Objects or Ably |
| `@sheenapps/notifications` | Orchestration over email + realtime + push | Requires email + realtime first |
| `@sheenapps/ai` | LLM wrapper (chat, embeddings, images) | None |

### Phase 4: Power Features (Not Started)

| Package | Purpose |
|---------|---------|
| `@sheenapps/search` | Full-text search across database content |
| `@sheenapps/flags` | Feature flags and A/B testing |
| `@sheenapps/forms` | Form handling with validation, spam protection |

---

## 6. Related Plans

### Admin Panel
- **Plan**: [INHOUSE_ADMIN_PLAN.md](./INHOUSE_ADMIN_PLAN.md)
- **Scope**: Multi-tenant dashboard, service-specific tools, monitoring, support tools
- **Status**: In progress (see task list)

### E2E Testing
- **Plan**: [EASY_MODE_PLAYWRIGHT_PLAN.md](./EASY_MODE_PLAYWRIGHT_PLAN.md)
- **Scope**: SDK integration tests for all 8 packages
- **Status**: Planned

---

## 7. Quick Reference

### What's Complete (Code Done)

| SDK | Worker Service | Worker Routes | Next.js Proxy | Notes |
|-----|---------------|---------------|---------------|-------|
| `@sheenapps/auth` | ✅ | ✅ | ✅ | Existing |
| `@sheenapps/db` | ✅ | ✅ | ✅ | Existing |
| `@sheenapps/cms` | ✅ | ✅ | ✅ | Existing |
| `@sheenapps/storage` | ✅ | ✅ | ✅ | New |
| `@sheenapps/jobs` | ✅ | ✅ | ✅ | New |
| `@sheenapps/secrets` | ✅ | ✅ | ✅ | New |
| `@sheenapps/email` | ✅ | ✅ | ✅ | New |
| `@sheenapps/payments` | ✅ | ✅ | ✅ | New |
| `@sheenapps/analytics` | ✅ | ✅ | ✅ | New |
| `@sheenapps/backups` | ✅ | ✅ | ✅ | New |

### AI Generation Context

| Component | Status |
|-----------|--------|
| SDK context injection in buildWorker.ts | ✅ |
| Recommendations system SDK-aware | ✅ |
| CLAUDE.md documentation | ✅ |
| SDK context generator script | ✅ |

---

## 8. Implementation Log (2026-01-25)

### Completed Tasks

| Task | Description | Files Changed |
|------|-------------|---------------|
| Fix secrets migration idempotency | Added `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, DO $$ blocks | `sheenappsai/supabase/migrations/20260123_inhouse_secrets_service.sql` |
| Add fail-fast env validation | Added `validateEasyModeSDKEnvironment()` for 3 SDK keys | `sheenapps-claude-worker/src/config/envValidation.ts` |
| Register health routes | Imported and registered comprehensive health.ts routes | `sheenapps-claude-worker/src/server.ts` |
| Create key rotation runbook | Full manual rotation procedure | `docs/runbooks/KEY_ROTATION.md` |

### Findings During Implementation

**Migration File Locations**: Files are scattered across two directories:
- `sheenappsai/supabase/migrations/` - secrets, backups
- `sheenapps-claude-worker/migrations/` - jobs, emails, payments, analytics

Consider consolidating to single location before next major migration.

**Idempotency Issue Found**: `20260123_inhouse_secrets_service.sql` was missing `IF NOT EXISTS` patterns. Fixed - now all 6 migrations are idempotent.

**Health Routes Were Not Registered**: `src/routes/health.ts` existed with 10+ comprehensive endpoints but was never imported/registered in `server.ts`. Now registered.

**Env Validation Pattern**: Worker already had `validateEnvironment()` + `validateInhouseEnvironment()`. Added new `validateEasyModeSDKEnvironment()` following same pattern. Fail-fast is conditional on `INHOUSE_MODE_ENABLED=true`.

### Available Health Endpoints (Now Active)

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Basic health check for load balancers |
| `GET /health/detailed` | Full metrics: AI capacity, system, workload, redis |
| `GET /health/capacity` | AI provider availability and limits |
| `GET /health/cluster` | Multi-server cluster health summary |
| `GET /health/logs` | Recent server logs (debug) |
| `GET /health/errors` | Error summary by hour |

### Improvements Identified (Future)

| Item | Description | Priority |
|------|-------------|----------|
| Consolidate migrations | Move all to single directory | Low |
| Add R2/Redis to health.ts | Current health.ts doesn't check R2 or Redis specifically | Medium |
| Health endpoint auth | DELETE endpoints have TODO for auth | Medium |
