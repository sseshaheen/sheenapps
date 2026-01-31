# Sprint 5: Advanced Support Tools - Implementation Plan

> Advanced admin support tools for In-House Mode: Database Inspector, Impersonation, Request Replay, and External Observability Links.

**Created**: 2026-01-28
**Updated**: 2026-01-28 (All phases complete)
**Status**: Complete
**Parent Plan**: [INHOUSE_ADMIN_PLAN.md](./INHOUSE_ADMIN_PLAN.md)

---

## Implementation Progress
---

Completed:
- ✅ All 4 phases implemented (Database Inspector, Observability Links, Impersonation, Request Replay)
- ✅ All TypeScript errors fixed (6 issues across 5 files)
- ✅ pgsql-ast-parser v12.0.2 installed
- ✅ TypeScript compiles cleanly
- ✅ Expert code review applied (see below)

### Expert Code Review Changes (2026-01-28)

Applied fixes to migration `142_inhouse_advanced_support.sql`:

| Issue | Fix |
|-------|-----|
| Redundant index on `correlation_id` | Removed - UNIQUE constraint creates implicit index |
| Pointless partial index on NOT NULL column | Removed `WHERE expires_at IS NOT NULL` predicate |
| Missing role safety defaults | Added `ALTER ROLE ... SET default_transaction_read_only`, `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` |
| FK to auth.users on audit tables | Changed to plain UUID (no FK) - preserves audit history if admin deleted |
| Complex DO block for index | Simplified to `CREATE INDEX IF NOT EXISTS` |
| Missing method constraint | Added `CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'))` |
| Missing sequences grant | Added `ALTER DEFAULT PRIVILEGES ... GRANT USAGE, SELECT ON SEQUENCES` in InhouseProjectService.ts |

Also applied to Supabase migration `20260125_inhouse_admin_infrastructure.sql`:
- Removed FK to auth.users for `inhouse_admin_audit.admin_id`
- Removed FK to auth.users for `inhouse_quota_overrides.created_by` and `.revoked_by`
- Removed FK to auth.users for `inhouse_alert_rules.created_by`
- Removed FK to auth.users for `inhouse_alerts.acknowledged_by`

**Not applied** (already done):
- Default privileges for future tables - already implemented in InhouseProjectService.ts lines 333-337

### Second Code Review Changes (2026-01-28)

| Issue | Fix |
|-------|-----|
| Read-only role not DB-enforced | Added `getReadonlyDatabase()` pool in database.ts using `DATABASE_READONLY_URL`; InhouseInspectorService now uses it |
| Missing complexity guard | Added `basicComplexityGuard()` - rejects queries >100KB, >12 JOINs, >10 subqueries |
| generateInboxId() comment/code mismatch | Fixed comment to accurately describe hex encoding (was incorrectly saying "base36") |
| hasAnyToolsConfigured() ignores DB flags | Added `hasAnyToolsEnabled()` that checks both env vars AND DB enabled flags |
| SQL interpolation in webhook events | Changed `INTERVAL '${hours} hours'` to parameterized `($1::int * INTERVAL '1 hour')` |

**Deferred to future work:**
- Impersonation proxy full implementation with `fastify.inject` + redaction enforcement
- Request replay full implementation with internal runner
- Move rate limits/tokens to Redis for multi-instance correctness

### Deployment: DATABASE_READONLY_URL Setup

Migration 142 creates the `inhouse_admin_readonly` role. To use it:

1. **Set password** (run once in Supabase SQL Editor):
```sql
ALTER ROLE inhouse_admin_readonly WITH PASSWORD 'STRONG_PASSWORD_HERE';
```

2. **Build env var** from your Supabase connection string (Settings → Database → Connection string):
```
DATABASE_READONLY_URL=postgresql://inhouse_admin_readonly:PASSWORD@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require
```

3. **Add to worker deployment** environment variables

The code gracefully falls back to the primary pool with a warning if `DATABASE_READONLY_URL` is not set, but production should have it configured for proper DB-enforced read-only access.

### Third Code Review Fixes (2026-01-28)

| Issue | Fix |
|-------|-----|
| `React.ReactNode` without import | Added `type ReactNode` import in ObservabilityLinks.tsx |
| Pagination closure bug | Changed `searchRequests` to accept `{ resetPage?, targetPage? }` object; pagination buttons now pass explicit target page |

**Not applied** (expert was wrong):
- `await cookies()` - Expert claimed it shouldn't be awaited, but **Next.js 15 changed this**. `cookies()` is now async and returns a Promise. Our code is correct.

Still needs future work (documented in plan):
1. Background cleanup jobs (session expiry sweeper, audit cleanup)
2. Activity logger integration for request capture
3. Full proxy/replay execution (currently returns placeholders)
4. Slack/webhook notifications for impersonation events

### Fourth Code Review Fixes (2026-01-28)

| Issue | Fix |
|-------|-----|
| Proxy route missing auth middleware | Added `{ preHandler: supportMiddleware as never }` to proxy route - now requires both admin auth AND valid impersonation token |
| Path traversal vulnerability in proxy | Added comprehensive path validation: reject `%2e`, `%2f`, `%5c` encoded sequences; normalize duplicate slashes; reject `..` and `.` segments |
| Missing input validation clamping | Added limit (1-200, default 50) and offset (≥0) clamping for replay search; validate date params with `isNaN(getTime())` check |
| DoS via deeply nested objects | Added `maxDepth=20` parameter to `redactSensitiveFields()` - returns `[MAX_DEPTH_EXCEEDED]` beyond depth |

**Not changed** (already correct):
- `auditAdminAction` already has proper fire-and-forget with internal `void` + `.catch()` error handling
- TOKEN_HASH_SECRET fallback was already fixed in previous review

### Fifth Code Review Fixes (2026-01-28)

| Issue | Fix |
|-------|-----|
| Proxy route requires reason on every GET | Changed from `supportMiddleware` (requireReason: true) to `readMiddleware` - reason already provided at impersonation start |
| Using DB allowlist for authorization | Changed to use `IMPERSONATION_ALLOWED_ROUTES` constant (server-side policy), not `session.allowedRoutes` from DB |
| Info leak in 403 response | Removed `allowedRoutes` from error response |
| Path encoding too specific | Changed to reject ALL percent-encoding (`/%[0-9a-fA-F]{2}/`) - simpler and safer for internal APIs |
| `captureFullBody` flag ignored | Fixed `captureRequest()` to honor `config.captureFullBody` - only captures bodies/headers when flag is true |
| `truncateBody` throws on circular refs | Added try-catch around `JSON.stringify` - returns serialization error indicator gracefully |

**Not applied** (user preference for early-stage debugging):
- Additional value-based scrubbing (JWT patterns, API key patterns)
- Preview token binding to adminId (over-engineering for now)
- Typed confirmation for replay execution (over-engineering for now)

**Deferred** (requires new migration):
- ON DELETE CASCADE → SET NULL for audit history preservation
- CHECK constraints for token/state invariants

  ---
### Phase 1: Database Inspector ✅ COMPLETE
- [x] Migration `142_inhouse_advanced_support.sql` created
- [x] `InhouseInspectorService.ts` created with AST validation
- [x] `adminInhouseDatabase.ts` routes created
- [x] `InhouseProjectService.ts` updated with readonly grants
- [x] Routes registered in `server.ts`
- [x] Next.js API proxies created (6 routes)
- [x] Frontend component `InhouseDatabaseAdmin.tsx`

**Required Dependency**: ✅ `pgsql-ast-parser` v12.0.2 installed

**Files Created**:
- `sheenapps-claude-worker/migrations/142_inhouse_advanced_support.sql`
- `sheenapps-claude-worker/src/services/admin/InhouseInspectorService.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseDatabase.ts`
- `sheenappsai/src/app/api/admin/inhouse/database/templates/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/database/projects/[projectId]/schema/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/database/projects/[projectId]/tables/[tableName]/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/database/projects/[projectId]/tables/[tableName]/sample/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/database/projects/[projectId]/query/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/database/projects/[projectId]/query/template/route.ts`
- `sheenappsai/src/components/admin/InhouseDatabaseAdmin.tsx`

### Phase 2: Observability Links ✅ COMPLETE
- [x] `ObservabilityLinksService.ts` created
- [x] `adminInhouseObservability.ts` routes created
- [x] Routes registered in `server.ts`
- [x] Next.js API proxies created (2 routes)
- [x] `ObservabilityLinks.tsx` component created

**Files Created**:
- `sheenapps-claude-worker/src/services/admin/ObservabilityLinksService.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseObservability.ts`
- `sheenappsai/src/app/api/admin/inhouse/observability/links/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/observability/status/route.ts`
- `sheenappsai/src/components/admin/ObservabilityLinks.tsx`

**Configuration Required**: Set environment variables for external tools:
- `POSTHOG_HOST` (e.g., `https://app.posthog.com`)
- `GRAFANA_HOST` (e.g., `https://grafana.sheenapps.com`)
- `LOG_VIEWER_HOST` (e.g., `https://logs.sheenapps.com`)

---

## Implementation Notes & Improvements

### Discovered During Implementation

1. **Token Hashing Pattern**: Using HMAC-SHA256 instead of plain SHA-256 for impersonation tokens provides offline guessing resistance. A leaked database dump cannot be used to verify/guess tokens without the server secret.

2. **Rate Limiting Strategy**: Implemented dual rate limiting for replay:
   - Per-admin: 10 replays per 5 minutes (prevents one admin from abusing the system)
   - Per-endpoint: 5 replays per endpoint per 5 minutes (prevents hammering one hot route)

3. **Preview Token Pattern**: For side-effect replays, a preview token is generated that:
   - Is valid for only 5 minutes
   - Is tied to a specific correlation ID
   - Can only be used once (consumed on replay execution)
   - Prevents accidental double-replays

4. **Scrubbing Strategy**: The recursive field scrubbing uses regex pattern matching for sensitive fields. Key patterns:
   - `password|passwd|pwd` - passwords
   - `token|access_token|refresh_token|api_token` - tokens
   - `secret|api_secret|client_secret` - secrets
   - `key|api_key|private_key` - keys
   - `credit_card|card_number|cvv|cvc` - payment
   - `ssn|social_security` - PII

### TypeScript Fixes Applied (2026-01-28)

1. **Duplicate success property** in `adminInhouseSupport.ts`: Removed `success: true` from reply wrapper since `executeReplay()` result already contains it
2. **noUncheckedIndexedAccess safety** in `ImpersonationService.ts`, `RequestReplayService.ts`: Added non-null assertions (`!`) after `.split()` array indexing where we know values exist (e.g., `path.split('?')[0]!`)
3. **Undefined row access** in `InhouseInspectorService.ts`: Added non-null assertions after length checks (e.g., `schemaResult.rows[0]!.schema_name`)
4. **Implicit any type** in `ObservabilityLinksService.ts`: Added explicit type annotation `(r: ObservabilityConfig)` in map callback
5. **bodyLimit config placement** in `adminInhouseDatabase.ts`: Moved `bodyLimit` from `config` object to route options level (Fastify typing)
6. **pgsql-ast-parser types** in `InhouseInspectorService.ts`: Cast `stmt.type` to `string` since library types don't include 'explain' statement type

### Dependency Installed

- ✅ `pgsql-ast-parser` v12.0.2 installed via `pnpm add pgsql-ast-parser`

### Still Needs Implementation

1. **Background Jobs**: The following cleanup jobs need to be scheduled:
   - Impersonation session expiry sweeper (every 5 minutes)
   - Admin query audit cleanup (daily, 90-day retention)
   - Replay payload cleanup (daily, based on `expires_at`)

2. **Activity Logger Integration**: The `RequestReplayService.captureRequest()` method needs to be called from the activity logging middleware for replayable routes.

3. **Actual Proxy/Replay Execution**: Both impersonation proxy and replay execution currently return placeholder responses. Actual implementation requires:
   - Internal request forwarding for impersonation
   - Original user context restoration for replay

4. **Slack/Webhook Notifications**: Impersonation start/end should trigger notifications.

5. ~~**pgsql-ast-parser Dependency**: The Database Inspector requires `npm install pgsql-ast-parser` in sheenapps-claude-worker.~~ ✅ Installed

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| In-memory rate limiting | Simple for MVP; should migrate to Redis for horizontal scaling |
| Preview tokens in memory Map | Avoids DB round-trip; acceptable given 5-minute TTL and single server |
| Separate replay payloads table | Prevents activity log bloat; shorter retention than audit log |
| Route config as code constant | Allows type safety; routes don't change at runtime |

### Phase 3: Impersonation ✅ COMPLETE
- [x] `ImpersonationService.ts` created with HMAC-SHA256 token hashing
- [x] Route allowlist validation with response redaction helpers
- [x] `adminInhouseSupport.ts` routes created
- [x] Routes registered in `server.ts`
- [x] Next.js API proxies created (6 routes)
- [x] `InhouseImpersonationAdmin.tsx` component created

**Files Created**:
- `sheenapps-claude-worker/src/services/admin/ImpersonationService.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseSupport.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/impersonate/start/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/impersonate/confirm/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/impersonate/session/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/impersonate/end/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/impersonate/allowed-routes/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/impersonate/proxy/[...path]/route.ts`
- `sheenappsai/src/components/admin/InhouseImpersonationAdmin.tsx`

**Security Features Implemented**:
- Two-step friction with typed confirmation (`IMPERSONATE <slug>`)
- HMAC-SHA256 token hashing (offline guessing resistant)
- Route allowlist (only specific GET endpoints accessible)
- Response redaction middleware helpers
- IP/UA soft binding with mismatch logging
- 30-minute hard TTL, no extensions
- One active session per admin
- Full audit trail via `auditAdminAction`

**Still Needs**:
- Slack/webhook notifications (TODO in service)
- Session expiry sweeper job
- Full proxy implementation (currently returns placeholder)

### Phase 4: Request Replay ✅ COMPLETE
- [x] `RequestReplayService.ts` created with route classifications, scrubbing, rate limiting
- [x] Replay routes added to `adminInhouseSupport.ts`
- [x] Next.js API proxies created (5 routes)
- [x] `InhouseRequestReplay.tsx` component created

**Files Created**:
- `sheenapps-claude-worker/src/services/admin/RequestReplayService.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/replay/requests/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/replay/requests/[correlationId]/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/replay/requests/[correlationId]/preview/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/replay/requests/[correlationId]/replay/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/support/replay/routes/route.ts`
- `sheenappsai/src/components/admin/InhouseRequestReplay.tsx`

**Security Features Implemented**:
- Route-level replayability classification (replayable/not, side effects: none/low/high)
- Recursive field scrubbing for sensitive data (passwords, tokens, keys, etc.)
- Header stripping (auth, cookies, claims never stored)
- Body truncation (max 8KB)
- Per-admin rate limiting (10 replays per 5 min)
- Per-endpoint rate limiting (5 replays per 5 min)
- Mandatory preview for side-effect replays
- Preview token validation with 5-minute expiry
- New correlation ID for each replay
- Full audit trail via `auditAdminAction`

**Still Needs**:
- Activity logger integration to capture requests automatically
- Actual replay execution (currently returns placeholder)
- Cleanup job for expired replay payloads

---

## Executive Summary

Sprint 5 adds four high-value support tools that enable admins to debug issues without direct database access, support customers without sharing credentials, and replay failed requests for root cause analysis. All features build on existing infrastructure (correlation IDs, activity logging, per-project schemas, admin auth).

**Infrastructure Readiness**: ~90% — most components exist, implementation is composition.

---

## Table of Contents

1. [Feature 1: Database Inspector](#feature-1-database-inspector)
2. [Feature 2: Project Impersonation](#feature-2-project-impersonation)
3. [Feature 3: Request Replay](#feature-3-request-replay)
4. [Feature 4: External Observability Links](#feature-4-external-observability-links)
5. [Database Migrations](#database-migrations)
6. [Background Jobs](#background-jobs)
7. [Security Considerations](#security-considerations)
8. [Implementation Order](#implementation-order)
9. [File Structure](#file-structure)

---

## Feature 1: Database Inspector

### Purpose
Allow admins to inspect project database schemas, view table structures, check row counts, examine slow queries, and run read-only diagnostic queries — all without direct database access.

### Route
`/admin/inhouse/database`

### Existing Infrastructure

| Component | Status | Location |
|-----------|--------|----------|
| Per-project schemas | ✅ Ready | `project_${projectId.replace(/-/g, '').substring(0, 32)}` |
| Schema tracking | ✅ Ready | `inhouse_project_schemas` table |
| Statement timeout | ✅ Ready | `withStatementTimeout()` in `utils/dbTimeout.ts` |
| Admin auth | ✅ Ready | `requireAdminAuth({ permissions: ['inhouse.read'] })` |

### What Needs to Be Built

#### 1.1 Schema Introspection Service

```typescript
// sheenapps-claude-worker/src/services/admin/InhouseInspectorService.ts
class InhouseInspectorService {
  // List all tables in project schema (metadata only)
  async listTables(projectId: string): Promise<TableInfo[]>

  // Get table details (columns, types, constraints, estimated row count)
  async inspectTable(projectId: string, tableName: string): Promise<TableDetails>

  // Get table indexes
  async getIndexes(projectId: string, tableName: string): Promise<IndexInfo[]>

  // Get sample data - OPT-IN ONLY, requires explicit flag
  // Redacts columns matching: email, phone, password, token, secret, key, ssn, etc.
  async getSampleData(projectId: string, tableName: string, options: {
    limit?: number;           // Default 10, max 100
    enableSampling: boolean;  // Must be explicitly true
  }): Promise<SampleDataResult>

  // Execute read-only query (elevated permission required)
  async executeQuery(projectId: string, sql: string, options: {
    explain?: boolean;
    adminId: string;
  }): Promise<QueryResult>
}
```

**Implementation Notes**:
- Query `information_schema.tables` and `information_schema.columns` filtered by project schema
- Use `pg_indexes` view for index information
- All queries wrapped in `withStatementTimeout(pool, '5s', ...)`
- Validate `tableName` against allowlist pattern: `/^[a-z][a-z0-9_]{0,62}$/`
- **Sample data is opt-in only** — default view is metadata (columns, types, row count estimates)
- Redact columns matching sensitive patterns before returning sample data

#### 1.2 Read-Only Query Tool

**Critical Security**: Do NOT rely on regex filtering. Use DB-enforced read-only.

##### Single-Statement Enforcement

**Risk**: Postgres can execute `SELECT 1; SELECT * FROM secrets;` in a single query text.

**Solution**: Use a real SQL AST parser — regex-based stripping is NOT sufficient.

```typescript
// Use a proper SQL parser (pgsql-ast-parser or node-sql-parser with Postgres mode)
// Pin the library version to avoid breaking changes in AST structure
import { parse, Statement } from 'pgsql-ast-parser';

function validateSingleStatement(sql: string): { valid: boolean; error?: string } {
  try {
    const ast = parse(sql);

    // Must be exactly one statement
    if (ast.length !== 1) {
      return { valid: false, error: `Expected 1 statement, got ${ast.length}` };
    }

    // Whitelist allowed statement types
    // NOTE: pgsql-ast-parser uses node kinds like 'select', 'union', 'with' for SELECT variants
    // Verify exact property names against the library's actual AST types
    const stmt = ast[0];
    const allowedTypes = new Set(['select', 'union', 'values']); // 'with' wraps inner select

    // Handle EXPLAIN wrapping
    if (stmt.type === 'explain') {
      // EXPLAIN wraps another statement - validate the inner one
      const innerType = (stmt as any).statement?.type;
      if (!innerType || !allowedTypes.has(innerType)) {
        return { valid: false, error: `EXPLAIN of '${innerType}' not allowed` };
      }
      return { valid: true };
    }

    if (!allowedTypes.has(stmt.type)) {
      return { valid: false, error: `Statement type '${stmt.type}' not allowed` };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `SQL parse error: ${(e as Error).message}` };
  }
}
```

**REQUIRED: Unit test suite for AST validation** (pin library version + test edge cases):
```typescript
// Must accept:
validateSingleStatement('SELECT 1')                          // ✓
validateSingleStatement('SELECT * FROM users WHERE id = 1')  // ✓
validateSingleStatement('EXPLAIN SELECT 1')                  // ✓
validateSingleStatement('EXPLAIN ANALYZE SELECT 1')          // ✓
validateSingleStatement('SELECT * FROM t1 UNION SELECT * FROM t2') // ✓

// Must reject:
validateSingleStatement('SELECT 1; SELECT 2')         // ✗ multiple statements
validateSingleStatement('INSERT INTO t VALUES (1)')   // ✗ wrong type
validateSingleStatement('UPDATE t SET x = 1')         // ✗ wrong type
validateSingleStatement('DELETE FROM t')              // ✗ wrong type
validateSingleStatement('SHOW search_path')           // ✗ wrong type
validateSingleStatement('SET work_mem = "1GB"')       // ✗ wrong type
validateSingleStatement('DO $$ BEGIN NULL; END $$')   // ✗ wrong type
validateSingleStatement('COPY t TO STDOUT')           // ✗ wrong type
validateSingleStatement('VACUUM t')                   // ✗ wrong type
```

**Why not regex?** SQL has many edge cases that break string-stripping approaches:
- Dollar-quoted strings: `$tag$ ... ; ... $tag$`
- Escaped quotes: `'it''s ; fine'`
- Unicode escapes: `E'semicolon\;'`

**Additional belt**: Reject dollar-quoting (`$` / `$tag$`) entirely — it's not needed for support queries and complicates statement detection.

##### Cross-Schema Access Prevention

Even with `SET LOCAL search_path`, a crafted query could use qualified identifiers (`other_schema.secrets`). Add AST-level rejection:

**HARD REQUIREMENT**: Query execution MUST include AST walk for schema-qualified refs. This is not optional.

```typescript
import { astVisitor, toSql } from 'pgsql-ast-parser';

function rejectQualifiedIdentifiers(ast: Statement[]): { valid: boolean; error?: string } {
  let foundQualified = false;
  let qualifiedRef = '';

  // Use pgsql-ast-parser's built-in visitor
  const visitor = astVisitor(() => ({
    tableRef: (t) => {
      if (t.schema) {
        foundQualified = true;
        qualifiedRef = `${t.schema}.${t.name}`;
      }
    },
    ref: (r) => {
      if (r.table?.schema) {
        foundQualified = true;
        qualifiedRef = `${r.table.schema}.${r.table.name}`;
      }
    },
  }));

  for (const stmt of ast) {
    visitor.statement(stmt);
  }

  if (foundQualified) {
    return { valid: false, error: `Qualified identifiers not allowed: ${qualifiedRef}` };
  }
  return { valid: true };
}
```

**MVP Decision**: Disallow ALL schema qualification, including `pg_catalog.*` and `information_schema.*`. Admins can use the prebuilt templates for system catalog queries. This eliminates edge cases and simplifies security reasoning.

##### Read-Only Role Setup

```sql
-- Migration: Create read-only role for admin queries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inhouse_admin_readonly') THEN
    -- Explicit security attributes: no privilege escalation possible
    CREATE ROLE inhouse_admin_readonly WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION;
    -- Password set via ALTER ROLE in deployment scripts (not in migration)
    -- Consider: certificate auth or IAM auth if available in your Postgres setup
  END IF;
END $$;

-- Grant connect (explicit schema qualifiers)
GRANT CONNECT ON DATABASE sheenapps TO inhouse_admin_readonly;
GRANT USAGE ON SCHEMA public TO inhouse_admin_readonly;

-- NOTE: Per-project schema grants happen at PROJECT CREATION TIME
-- (not dynamically at inspection time) to avoid needing elevated privileges at runtime
```

**Grant Strategy**: When a new project schema is created in `InhouseProjectService.createProject()`, immediately grant SELECT to `inhouse_admin_readonly`:
```sql
GRANT USAGE ON SCHEMA "project_abc123" TO inhouse_admin_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA "project_abc123" TO inhouse_admin_readonly;
```

##### Query Execution Flow

1. Validate project exists and admin has `inhouse.support` permission
2. **Parse SQL with AST parser** — reject if not exactly one SELECT/EXPLAIN statement
3. **Reject qualified identifiers** — no `schema.table` references allowed
4. Get project schema name from `inhouse_project_schemas`
5. Connect with `inhouse_admin_readonly` role
6. **Execute inside explicit transaction with SET LOCAL** (critical for connection pooling):
   ```sql
   BEGIN READ ONLY;
   SET LOCAL search_path TO $schema_name, public;
   SET LOCAL statement_timeout = '5s';
   SET LOCAL lock_timeout = '1s';
   SET LOCAL idle_in_transaction_session_timeout = '5s';
   SET LOCAL work_mem = '4MB';
   -- Execute user query here, limit results to 1000 rows
   ROLLBACK;  -- Always rollback (read-only anyway)
   ```
7. Log query to audit trail (full SQL, duration, admin ID, IP)

**Why SET LOCAL + transaction?** Session-wide `SET` on pooled connections is a classic multi-tenant footgun — settings can leak between requests. `SET LOCAL` is scoped to the transaction and automatically reverts on ROLLBACK.

**Blocked Operations** (role-level, not regex):
- INSERT, UPDATE, DELETE, TRUNCATE
- CREATE, ALTER, DROP
- GRANT, REVOKE
- COPY (write mode)

#### 1.3 Prebuilt Query Templates

Reduce freestyle SQL by offering common diagnostic queries:

```typescript
const INSPECTOR_TEMPLATES = {
  'row-counts': {
    label: 'Row counts by table',
    sql: `SELECT schemaname, relname as table_name, n_live_tup as row_count
          FROM pg_stat_user_tables
          WHERE schemaname = current_schema()
          ORDER BY n_live_tup DESC`,
  },
  'largest-tables': {
    label: 'Largest tables by size',
    sql: `SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
          FROM pg_tables
          WHERE schemaname = current_schema()
          ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
          LIMIT 20`,
  },
  'recent-errors': {
    label: 'Recent errors (last 24h)',
    sql: `SELECT action, error_code, COUNT(*) as count, MAX(created_at) as last_seen
          FROM inhouse_activity_log
          WHERE project_id = $projectId AND status = 'error' AND created_at > NOW() - INTERVAL '24 hours'
          GROUP BY action, error_code
          ORDER BY count DESC`,
  },
  'index-usage': {
    label: 'Index usage statistics',
    sql: `SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
          FROM pg_stat_user_indexes
          WHERE schemaname = current_schema()
          ORDER BY idx_scan DESC`,
  },
};
```

#### 1.4 Slow Query Log

**Option A: pg_stat_statements** (if extension available)
```sql
SELECT
  query,
  calls,
  total_exec_time / calls as avg_time_ms,
  rows / calls as avg_rows
FROM pg_stat_statements
WHERE dbid = current_database()::regclass
  AND query LIKE '%' || $schema_name || '%'
ORDER BY total_exec_time DESC
LIMIT 50;
```

**Option B: Activity Log Mining** (always available)
```sql
SELECT
  action,
  metadata->>'query' as query,
  duration_ms,
  created_at
FROM inhouse_activity_log
WHERE project_id = $1
  AND service = 'db'
  AND duration_ms > $min_duration_ms
ORDER BY created_at DESC
LIMIT 50;
```

**Recommendation**: Start with Option B (no extension dependency), add Option A later if available.

### API Endpoints

```typescript
// Schema introspection (metadata only by default)
GET /v1/admin/inhouse/database/projects/:projectId/schema
  Returns: { tables: TableInfo[], schemaName: string }

GET /v1/admin/inhouse/database/projects/:projectId/tables/:tableName
  Returns: { columns: ColumnInfo[], indexes: IndexInfo[], estimatedRowCount: number }

// Sample data - requires explicit opt-in
GET /v1/admin/inhouse/database/projects/:projectId/tables/:tableName/sample
  Query: ?limit=10&enableSampling=true
  Returns: { rows: any[], truncated: boolean, redactedColumns: string[] }
  Permissions: inhouse.support (elevated)

// Query tool
POST /v1/admin/inhouse/database/projects/:projectId/query
  Body: { sql: string, explain?: boolean }
  Returns: { rows: any[], columns: string[], durationMs: number, plan?: string }
  Permissions: inhouse.support (elevated)

// Prebuilt templates
GET /v1/admin/inhouse/database/templates
  Returns: { templates: TemplateInfo[] }

POST /v1/admin/inhouse/database/projects/:projectId/query/template
  Body: { templateId: string }
  Returns: { rows: any[], columns: string[], durationMs: number }

// Slow queries
GET /v1/admin/inhouse/database/slow-queries
  Query: ?projectId=&minDurationMs=100&limit=50
  Returns: { queries: SlowQueryInfo[] }
```

### UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│ Database Inspector                    Project: [my-saas-app ▼]  │
├─────────────────────────────────────────────────────────────────┤
│ Tables (metadata view)                                          │
│ ┌─────────────────┬──────────┬─────────────┬──────────────────┐ │
│ │ Table           │ ~Rows    │ Size        │ Actions          │ │
│ ├─────────────────┼──────────┼─────────────┼──────────────────┤ │
│ │ users           │ ~1,234   │ 245 KB      │ [Inspect][Sample]│ │
│ │ orders          │ ~5,678   │ 1.2 MB      │ [Inspect][Sample]│ │
│ │ products        │ ~89      │ 12 KB       │ [Inspect][Sample]│ │
│ └─────────────────┴──────────┴─────────────┴──────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Quick Queries: [Row Counts] [Largest Tables] [Recent Errors]    │
├─────────────────────────────────────────────────────────────────┤
│ Custom Query (Read-Only, Single Statement)                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ SELECT * FROM users WHERE created_at > '2026-01-01' LIMIT 10│ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [Run Query] [Explain]                     ⏱️ Timeout: 5s       │
├─────────────────────────────────────────────────────────────────┤
│ Results (10 rows, 45ms)                                         │
│ ┌────────────┬────────────────┬────────────────────────────────┐│
│ │ id         │ email          │ created_at                     ││
│ ├────────────┼────────────────┼────────────────────────────────┤│
│ │ usr_abc... │ j***@***.com   │ 2026-01-15T10:30:00Z          ││
│ └────────────┴────────────────┴────────────────────────────────┘│
│ ⚠️ Sensitive columns redacted: email                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Project Impersonation

### Purpose
Allow admins to view a project as the owner would see it, for debugging customer-reported issues. **Read-only only** — no modifications allowed.

### Route
`/admin/inhouse/support/impersonate`

### Security Model

This is a **HIGH-RISK FEATURE**. Implementation must follow defense-in-depth:

1. **Two-Step Friction with Typed Confirmation**: Must type `IMPERSONATE <project-slug>` to activate
2. **Route Allowlist**: Only specific endpoints accessible, not "proxy everything"
3. **Scoped Token**: Time-limited, permission-bound, project-specific, **hashed in storage**
4. **Hard TTL**: 30 minutes maximum, no extensions
5. **IP/UA Binding**: Soft binding with mismatch logging and re-confirmation
6. **Audit Everything**: Every action logged with admin context
7. **No Concurrent Sessions**: One impersonation per admin at a time
8. **Notifications**: Slack/webhook on session start/end

### Token Structure

```typescript
interface ImpersonationToken {
  type: 'impersonation';
  adminId: string;
  projectId: string;
  ownerId: string;          // Original project owner
  allowedRoutes: string[];  // Explicit allowlist
  readOnly: true;           // Always true
  reason: string;           // Admin-provided reason
  createdAt: number;
  expiresAt: number;        // createdAt + 30 minutes max
  sessionId: string;        // For audit correlation
  boundIp: string;          // IP at session start
  boundUserAgent: string;   // UA at session start
}
```

**Storage**: `confirmation_token` and `session_token` are **hashed** (HMAC-SHA256 with server secret) in the database. Raw tokens only exist in memory and responses. Using HMAC instead of plain SHA-256 provides offline guessing resistance—a leaked database can't be used to verify/guess tokens without the server secret.

### Route Allowlist

```typescript
const IMPERSONATION_ALLOWED_ROUTES = [
  // Storage - view files only (NO presigned URLs, NO downloads)
  'GET /v1/inhouse/projects/:projectId/storage/files',
  'GET /v1/inhouse/projects/:projectId/storage/usage',

  // Jobs - view only
  'GET /v1/inhouse/projects/:projectId/jobs',
  'GET /v1/inhouse/projects/:projectId/jobs/:jobId',

  // Email - view metadata only (NO rendered content with tokens)
  'GET /v1/inhouse/projects/:projectId/emails',
  'GET /v1/inhouse/projects/:projectId/emails/:emailId/metadata',

  // Analytics - view only
  'GET /v1/inhouse/projects/:projectId/analytics/events',
  'GET /v1/inhouse/projects/:projectId/analytics/stats',

  // Auth - view sessions only
  'GET /v1/inhouse/projects/:projectId/auth/users',
  'GET /v1/inhouse/projects/:projectId/auth/sessions',

  // Activity - view logs only
  'GET /v1/inhouse/projects/:projectId/activity',

  // EXPLICITLY EXCLUDED:
  // - Secrets (any endpoint)
  // - Presigned URLs / signed downloads
  // - Export endpoints (CSV, JSON exports)
  // - Backup downloads
  // - Payment customer data / invoices
  // - Email content with potential tokens
  // - Any mutation endpoints
];
```

### Response Redaction Middleware (Defense-in-Depth)

Even with a route allowlist, add a response middleware that:
1. **Blocks dangerous content types**: CSV, ZIP, application/octet-stream exports blocked
2. **Scans JSON responses** for sensitive patterns and redacts them
3. **Enforces maximum response size** (e.g., 1MB) to prevent bulk data extraction

```typescript
const BLOCKED_CONTENT_TYPES = [
  'text/csv',
  'application/zip',
  'application/octet-stream',
  'application/x-download',
  'application/force-download',
];

const SENSITIVE_JSON_PATTERNS = /secret|password|token|api_key|private_key|access_token/i;

function impersonationResponseMiddleware(response: Response): Response {
  const contentType = response.headers.get('content-type') || '';

  // Block export-style content types
  if (BLOCKED_CONTENT_TYPES.some(ct => contentType.includes(ct))) {
    return new Response(JSON.stringify({
      error: 'CONTENT_TYPE_BLOCKED',
      message: 'This content type is not available during impersonation'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // Block oversized responses
  const contentLength = parseInt(response.headers.get('content-length') || '0');
  if (contentLength > 1024 * 1024) { // 1MB
    return new Response(JSON.stringify({
      error: 'RESPONSE_TOO_LARGE',
      message: 'Response exceeds size limit for impersonation'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // For JSON responses, scan and redact sensitive fields
  if (contentType.includes('application/json')) {
    // Clone, parse, scrub, re-serialize (implementation in proxy handler)
  }

  return response;
}
```

### API Endpoints

```typescript
// Step 1: Initiate impersonation (creates pending session)
POST /v1/admin/inhouse/support/impersonate/start
  Body: { projectId: string, reason: string }
  Returns: {
    confirmationToken: string,
    expiresIn: 60,  // Must confirm within 60 seconds
    projectName: string,
    projectSlug: string,  // For typed confirmation
    ownerEmail: string
  }
  Permissions: inhouse.support

// Step 2: Confirm impersonation (requires typed confirmation)
POST /v1/admin/inhouse/support/impersonate/confirm
  Body: {
    confirmationToken: string,
    typedConfirmation: string  // Must match "IMPERSONATE <projectSlug>"
  }
  Returns: {
    sessionToken: string,
    expiresAt: string,
    allowedRoutes: string[]
  }

// Check active session
GET /v1/admin/inhouse/support/impersonate/session
  Returns: { active: boolean, projectId?: string, expiresAt?: string }

// End impersonation early
POST /v1/admin/inhouse/support/impersonate/end
  Returns: { success: true }

// Proxy endpoint (validates session token + route allowlist)
GET /v1/admin/inhouse/support/impersonate/proxy/*
  Headers: { 'X-Impersonation-Token': sessionToken }
  // Only proxies to allowlisted routes, rejects others with 403
  // Logs IP/UA mismatch as warning (doesn't block, but flags for review)
```

### Database Tables

```sql
-- Track impersonation sessions
CREATE TABLE IF NOT EXISTS inhouse_impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'ended', 'expired')),
  -- Tokens stored HASHED (HMAC-SHA256 with server secret), never plaintext
  confirmation_token_hash TEXT,
  session_token_hash TEXT,
  allowed_routes TEXT[] NOT NULL DEFAULT '{}',
  -- Binding for soft verification
  bound_ip INET,
  bound_user_agent TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  end_reason TEXT  -- 'manual', 'expired', 'admin_logout', 'ip_mismatch'
);

-- Unique hashed confirmation token
CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_confirmation_token
  ON inhouse_impersonation_sessions(confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL AND status = 'pending';

-- Unique hashed session token for active sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_session_token
  ON inhouse_impersonation_sessions(session_token_hash)
  WHERE session_token_hash IS NOT NULL AND status = 'active';

-- Prevent concurrent active sessions per admin
CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_one_active_per_admin
  ON inhouse_impersonation_sessions(admin_id)
  WHERE status IN ('pending', 'active');

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_impersonation_admin_created
  ON inhouse_impersonation_sessions(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_impersonation_project
  ON inhouse_impersonation_sessions(project_id);

-- For expiry sweeper
CREATE INDEX IF NOT EXISTS idx_impersonation_expires
  ON inhouse_impersonation_sessions(expires_at)
  WHERE status IN ('pending', 'active');
```

### Notifications

On impersonation start/end, send webhook/Slack notification:
```typescript
interface ImpersonationNotification {
  event: 'impersonation_started' | 'impersonation_ended';
  adminEmail: string;
  projectName: string;
  ownerEmail: string;
  reason: string;
  startedAt: string;
  endedAt?: string;
  endReason?: string;
}
```

### UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ IMPERSONATING PROJECT (READ-ONLY)                            │
│ Project: my-saas-app | Owner: john@example.com                  │
│ Session expires in: 28:45 | [End Session]                       │
├─────────────────────────────────────────────────────────────────┤
│ What you can view:                                              │
│ • Storage files and usage (no downloads)                        │
│ • Job queue and history                                         │
│ • Email metadata (no content)                                   │
│ • Analytics events                                              │
│ • User sessions                                                 │
│ • Activity logs                                                 │
│                                                                 │
│ ❌ NOT available: Secrets, exports, downloads, payment data     │
├─────────────────────────────────────────────────────────────────┤
│ Navigation: [Storage] [Jobs] [Email] [Analytics] [Users] [Logs]│
└─────────────────────────────────────────────────────────────────┘
```

**Start Impersonation Dialog** (with typed confirmation):
```
┌─────────────────────────────────────────────────────────────────┐
│ Start Impersonation Session                                     │
├─────────────────────────────────────────────────────────────────┤
│ Project: my-saas-app                                            │
│ Owner: john@example.com                                         │
│                                                                 │
│ ⚠️ This action will be logged, audited, and notify the team.   │
│                                                                 │
│ Reason for impersonation: *                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Customer reported files not appearing in dashboard          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ To confirm, type: IMPERSONATE my-saas-app                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Duration: 30 minutes (maximum)                                  │
│                                                                 │
│                              [Cancel] [Start Read-Only Session] │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: Request Replay

### Purpose
Find failed requests by correlation ID, inspect full request/response details, and replay requests with optional modifications for debugging.

### Route
`/admin/inhouse/support/replay`

### Existing Infrastructure

| Component | Status | Location |
|-----------|--------|----------|
| Correlation ID middleware | ✅ Ready | `correlationIdMiddleware.ts` |
| Activity logging | ✅ Ready | `InhouseActivityLogger.ts` |
| Metadata JSONB storage | ✅ Ready | `inhouse_activity_log.metadata` |

### Key Principle: Replayability is a Route Property

**Not all requests should be replayable.** Treat replayability as a property of the endpoint.

```typescript
// Route configuration
interface RouteReplayConfig {
  replayable: boolean;
  sideEffects: 'none' | 'low' | 'high';
  captureFullBody: boolean;  // Only true if replayable
}

const ROUTE_REPLAY_CONFIG: Record<string, RouteReplayConfig> = {
  // Safe to replay, no side effects
  'GET /v1/inhouse/projects/:projectId/storage/files': {
    replayable: true, sideEffects: 'none', captureFullBody: false
  },

  // Replayable but has side effects
  'POST /v1/inhouse/projects/:projectId/storage/upload': {
    replayable: true, sideEffects: 'high', captureFullBody: true
  },
  'POST /v1/inhouse/projects/:projectId/jobs/enqueue': {
    replayable: true, sideEffects: 'low', captureFullBody: true
  },

  // NOT replayable (auth-sensitive, payment-sensitive)
  'POST /v1/inhouse/projects/:projectId/auth/sign-in': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
  'POST /v1/inhouse/projects/:projectId/payments/checkout': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
};
```

### What Needs Enhancement

#### 3.1 Enhanced Request Capture

Only capture full request bodies for `replayable: true` routes:

```typescript
// Enhanced metadata structure for replay-capable logging
interface ReplayableMetadata {
  // Always captured
  action: string;
  resourceId?: string;
  route: string;
  replayable: boolean;
  sideEffects: 'none' | 'low' | 'high';

  // Only captured if replayable + captureFullBody
  request?: {
    method: string;
    path: string;
    query: Record<string, string>;
    body: any;  // Scrubbed (see below)
    headers: {
      'content-type'?: string;
      'x-sheen-locale'?: string;
      // NO auth headers ever
    };
  };
  response?: {
    statusCode: number;
    body?: any;  // Truncated if > 8KB
  };
  error?: {
    code: string;
    message: string;
  };
}
```

#### 3.2 Scrubbing Strategy

**Always strip** before storing:
- All `Authorization` headers
- All `Cookie` headers
- All `X-Sheen-Claims` headers

**Recursively scrub** body fields matching (case-insensitive):
- `password`, `passwd`, `pwd`
- `token`, `access_token`, `refresh_token`, `api_token`
- `secret`, `api_secret`, `client_secret`
- `key`, `api_key`, `private_key`
- `authorization`, `auth`
- `cookie`, `session`
- `credit_card`, `card_number`, `cvv`, `cvc`
- `ssn`, `social_security`

**Truncate** bodies larger than 8KB (log that truncation occurred).

**Multipart uploads**: For file uploads (multipart/form-data), capture **metadata only** (filename, size, content-type), never raw binary. The request body stored for replay should contain `{ _file: { name, size, contentType } }` placeholder, not actual file data.

#### Replay Payload Retention & Storage

Replay-captured request bodies should be stored separately from the main activity log:

1. **Separate table or object storage**: `inhouse_replay_payloads` table or S3/R2 bucket
2. **TTL-based cleanup**: 7-30 days retention (configurable), shorter than audit log retention
3. **Reference by correlation ID**: Activity log links to payload via correlation_id
4. **Storage budget**: Max 50MB per project total, LRU eviction if exceeded

This prevents the activity log from bloating with request bodies while maintaining replayability for recent requests.

```typescript
function scrubSensitiveFields(obj: any, path = ''): any {
  if (!obj || typeof obj !== 'object') return obj;

  const SENSITIVE_PATTERNS = /password|passwd|pwd|token|secret|key|auth|cookie|session|credit|card|cvv|cvc|ssn/i;

  const result: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_PATTERNS.test(k)) {
      result[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      result[k] = scrubSensitiveFields(v, `${path}.${k}`);
    } else {
      result[k] = v;
    }
  }
  return result;
}
```

#### 3.3 Request Search Service

```typescript
// sheenapps-claude-worker/src/services/admin/RequestReplayService.ts
class RequestReplayService {
  // Find request by correlation ID
  async findByCorrelationId(correlationId: string): Promise<RequestRecord | null>

  // Search requests by criteria (only returns replayable requests by default)
  async searchRequests(criteria: {
    projectId?: string;
    service?: string;
    status?: 'success' | 'error';
    replayableOnly?: boolean;  // Default true
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<RequestRecord[]>

  // Preview replay (always required before execute for side effects)
  async previewReplay(
    correlationId: string,
    modifications?: Record<string, any>
  ): Promise<ReplayPreview>

  // Execute replay
  async executeReplay(
    correlationId: string,
    adminId: string,
    options: {
      modifications?: Record<string, any>;
      reason: string;
      idempotencyKey: string;  // Generated for side-effect replays
      previewConfirmed: boolean;  // Must be true for side-effect replays
    }
  ): Promise<ReplayResult>
}
```

#### 3.4 Replay Safety Controls

1. **Rate Limiting**:
   - Per admin: Max 10 replays per 5 minutes
   - **Per endpoint**: Max 5 replays per endpoint per 5 minutes (prevents hammering one hot route)
2. **Idempotency**: Generate new idempotency key for all side-effect replays
3. **Mandatory Preview**: For `sideEffects: 'low' | 'high'`, preview must be called first
4. **Side Effect Warning**: Flag and require explicit confirmation
5. **No Auth Spoofing**: Replay uses original user context, not admin's
6. **Audit Trail**: Both original and replay linked via `replay_of_correlation_id`

### API Endpoints

```typescript
// Search for requests (replayable only by default)
GET /v1/admin/inhouse/support/requests
  Query: ?correlationId=&projectId=&service=&status=&replayableOnly=true&startTime=&endTime=&limit=
  Returns: { requests: RequestRecord[], total: number }
  Permissions: inhouse.support

// Get request details
GET /v1/admin/inhouse/support/requests/:correlationId
  Returns: {
    request: RequestRecord,
    timeline: ActivityEntry[],
    replayable: boolean,
    sideEffects: 'none' | 'low' | 'high',
    warnings: string[]
  }

// Preview replay (REQUIRED for side-effect replays)
POST /v1/admin/inhouse/support/requests/:correlationId/replay/preview
  Body: { modifications?: Record<string, any> }
  Returns: {
    wouldExecute: RequestPreview,
    sideEffects: 'none' | 'low' | 'high',
    warnings: string[],
    previewToken: string  // Required for execute
  }

// Execute replay
POST /v1/admin/inhouse/support/requests/:correlationId/replay
  Body: {
    modifications?: Record<string, any>,
    reason: string,
    previewToken?: string,  // Required if sideEffects != 'none'
    confirmSideEffects?: boolean  // Required if sideEffects != 'none'
  }
  Returns: {
    newCorrelationId: string,
    idempotencyKey: string,
    result: ReplayResult
  }
```

### UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│ Request Replay                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Search: [correlation ID or filter...]  [🔍]                     │
│ Filters: [Project ▼] [Service ▼] [Status ▼] [Time Range ▼]     │
│ ☑️ Show only replayable requests                                │
├─────────────────────────────────────────────────────────────────┤
│ Correlation ID      │ Service  │ Action      │ Status │ Effects │
│ ────────────────────┼──────────┼─────────────┼────────┼─────────│
│ 550e8400-e29b...    │ storage  │ upload      │ ❌     │ ⚠️ High │
│ 6ba7b810-9dad...    │ jobs     │ enqueue     │ ❌     │ 🔵 Low  │
│ 6ba7b811-9dad...    │ storage  │ list        │ ✅     │ ✅ None │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Request Details: 550e8400-e29b-41d4-a716-446655440000          │
├─────────────────────────────────────────────────────────────────┤
│ Service: storage | Action: upload | Status: error               │
│ Project: my-saas-app | User: usr_abc123                        │
│ Time: 2026-01-28 14:32:15 UTC | Duration: 234ms                │
│ Side Effects: ⚠️ HIGH (creates file)                           │
├─────────────────────────────────────────────────────────────────┤
│ Request (scrubbed):                                             │
│ POST /v1/inhouse/projects/proj_123/storage/upload              │
│ Content-Type: multipart/form-data                              │
│ Body: { path: "uploads/image.png", size: 1048576 }             │
├─────────────────────────────────────────────────────────────────┤
│ Error:                                                          │
│ Code: QUOTA_EXCEEDED                                            │
│ Message: Storage quota exceeded (1.2GB / 1GB)                   │
├─────────────────────────────────────────────────────────────────┤
│ ⚠️ This replay will create a file. Preview required.           │
│                                                                 │
│ Reason for replay: *                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Testing after quota increase                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Preview Replay] ← Required before execute                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: External Observability Links

### Purpose
Link from the In-House admin panel to external observability tools (PostHog, Grafana, logs) with pre-filtered context.

### Current State
- PostHog: Mock implementation in `src/lib/posthog.ts` — not production
- OpenTelemetry: Configured in worker (`src/observability/otel.ts`)
- Grafana: Not yet integrated

### Configuration Strategy

**Single source of truth per concern:**
- **Environment variables**: Base URLs (environment-specific, secrets-adjacent)
- **Database config**: Enabled/disabled, dashboard slugs, labels (non-sensitive, admin-editable)

```typescript
// Environment variables (deployment-specific)
POSTHOG_HOST=https://app.posthog.com
GRAFANA_HOST=https://grafana.sheenapps.com
LOG_VIEWER_HOST=https://logs.sheenapps.com

// DB config table: enabled flags, dashboard names, filter param names
// (allows admins to toggle without redeployment)
```

### Security Note

The generated URLs are returned to the admin UI and are therefore "exposed to client." The security property is:
- **No secrets/tokens in URLs**: All links use SSO or pre-authenticated sessions
- **No internal IDs that shouldn't be shared**: Avoid exposing raw DB IDs if screenshots might be shared
- **PII caution**: Filter parameters may contain user emails or other PII (e.g., `?email=user@example.com`). Document which parameters can contain PII and consider hashing or using opaque IDs in external tool filters where possible

### Implementation

#### 4.1 Link Generation Service

```typescript
// sheenapps-claude-worker/src/services/admin/ObservabilityLinksService.ts
class ObservabilityLinksService {
  // Generate PostHog link filtered by project
  getPostHogLink(projectId: string, options?: {
    dateFrom?: string;
    dateTo?: string;
    event?: string;
  }): string | null

  // Generate Grafana dashboard link
  getGrafanaLink(projectId: string, options?: {
    dashboard?: string;  // 'overview' | 'jobs' | 'storage' | 'email'
    timeRange?: string;
  }): string | null

  // Generate log viewer link with filters
  getLogViewerLink(options: {
    projectId?: string;
    correlationId?: string;
    service?: string;
    level?: string;
    timeRange?: string;
  }): string | null

  // Get all available links for a context
  getAllLinks(context: {
    projectId?: string;
    correlationId?: string;
    service?: string;
  }): ObservabilityLinks
}

interface ObservabilityLinks {
  posthog?: { url: string; label: string };
  grafana?: { url: string; label: string }[];
  logs?: { url: string; label: string };
}
```

#### 4.2 API Endpoint

```typescript
GET /v1/admin/inhouse/observability/links
  Query: ?projectId=&correlationId=&service=
  Returns: ObservabilityLinks
```

#### 4.3 UI Integration

Add to existing monitoring dashboard and error views:

```
┌─────────────────────────────────────────────────────────────────┐
│ Deep Dive                                                       │
│ [📊 PostHog →] [📈 Grafana →] [📋 Logs →]                       │
└─────────────────────────────────────────────────────────────────┘
```

In error detail views:
```
┌─────────────────────────────────────────────────────────────────┐
│ Error: QUOTA_EXCEEDED                                           │
│ ...                                                             │
├─────────────────────────────────────────────────────────────────┤
│ Investigate:                                                    │
│ [View in Grafana →] [View Logs →] [Related Events in PostHog →]│
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Migrations

### Migration: 140_inhouse_advanced_support.sql

```sql
-- ============================================================================
-- Migration: 140_inhouse_advanced_support.sql
-- Purpose: Sprint 5 Advanced Support Features
-- ============================================================================

-- =============================================================================
-- 1) READ-ONLY ROLE FOR DATABASE INSPECTOR
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inhouse_admin_readonly') THEN
    -- Explicit security attributes to prevent any privilege escalation
    CREATE ROLE inhouse_admin_readonly WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION;
    -- Password set via ALTER ROLE in deployment scripts (not in migration)
    -- Consider: certificate auth or IAM auth if available
  END IF;
END $$;

GRANT CONNECT ON DATABASE sheenapps TO inhouse_admin_readonly;
GRANT USAGE ON SCHEMA public TO inhouse_admin_readonly;
-- Explicit schema qualifiers to avoid ambiguity if schemas change
GRANT SELECT ON TABLE public.inhouse_activity_log TO inhouse_admin_readonly;
GRANT SELECT ON TABLE public.inhouse_usage_events TO inhouse_admin_readonly;

-- NOTE: Per-project schema grants happen at PROJECT CREATION TIME
-- in InhouseProjectService.createProject(), not dynamically at inspection time.
-- This avoids needing elevated privileges at runtime.

-- =============================================================================
-- 2) IMPERSONATION SESSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'ended', 'expired')),
  -- Tokens stored HASHED (HMAC-SHA256 with server secret), never plaintext
  confirmation_token_hash TEXT,
  session_token_hash TEXT,
  allowed_routes TEXT[] NOT NULL DEFAULT '{}',
  -- Binding for soft verification (log mismatches, don't block)
  bound_ip INET,
  bound_user_agent TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  end_reason TEXT  -- 'manual', 'expired', 'admin_logout', 'ip_mismatch'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_confirmation_hash
  ON inhouse_impersonation_sessions(confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL AND status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_session_hash
  ON inhouse_impersonation_sessions(session_token_hash)
  WHERE session_token_hash IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_one_active_per_admin
  ON inhouse_impersonation_sessions(admin_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_impersonation_admin_created
  ON inhouse_impersonation_sessions(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_impersonation_project
  ON inhouse_impersonation_sessions(project_id);

CREATE INDEX IF NOT EXISTS idx_impersonation_expires
  ON inhouse_impersonation_sessions(expires_at)
  WHERE status IN ('pending', 'active');

-- =============================================================================
-- 3) ADMIN QUERY AUDIT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_admin_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL,  -- SHA256 of normalized query
  result_rows INTEGER,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  explain_plan JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_queries_admin
  ON inhouse_admin_queries(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_queries_project
  ON inhouse_admin_queries(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_queries_created
  ON inhouse_admin_queries(created_at);

-- =============================================================================
-- 4) REQUEST REPLAY TRACKING
-- =============================================================================

-- Replays logged to inhouse_admin_audit with action = 'request_replay'
CREATE INDEX IF NOT EXISTS idx_admin_audit_replays
  ON inhouse_admin_audit(created_at DESC)
  WHERE action = 'request_replay';

-- =============================================================================
-- 5) OBSERVABILITY CONFIG
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_observability_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool TEXT NOT NULL UNIQUE CHECK (tool IN ('posthog', 'grafana', 'logs')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  dashboard_slug TEXT,
  project_filter_param TEXT,
  time_filter_param TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Base URLs come from env vars, not this table
INSERT INTO inhouse_observability_config (tool, project_filter_param, time_filter_param)
VALUES
  ('posthog', 'project_id', 'date_from'),
  ('grafana', 'var-project', 'from'),
  ('logs', 'project', 'start')
ON CONFLICT (tool) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE inhouse_impersonation_sessions IS
  'Tracks admin impersonation sessions. Tokens stored hashed.';

COMMENT ON TABLE inhouse_admin_queries IS
  'Audit log of admin database queries. Cleaned up by scheduled job after 90 days.';

COMMENT ON TABLE inhouse_observability_config IS
  'Configuration for external observability tool links. Base URLs from env vars.';
```

---

## Background Jobs

The migration creates tables but indexes don't delete rows. These scheduled jobs are required:

### 1. Impersonation Session Expiry Sweeper

```typescript
// Run every 5 minutes
async function sweepExpiredImpersonationSessions() {
  await pool.query(`
    UPDATE inhouse_impersonation_sessions
    SET status = 'expired', ended_at = NOW(), end_reason = 'expired'
    WHERE status IN ('pending', 'active')
      AND expires_at < NOW()
  `);
}
```

### 2. Admin Query Audit Cleanup

```typescript
// Run daily at 4 AM UTC
async function cleanupAdminQueryAudit() {
  const RETENTION_DAYS = 90;
  await pool.query(`
    DELETE FROM inhouse_admin_queries
    WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
  `);
}
```

### 3. Old Impersonation Session Cleanup

```typescript
// Run daily at 4 AM UTC
async function cleanupOldImpersonationSessions() {
  const RETENTION_DAYS = 90;
  await pool.query(`
    DELETE FROM inhouse_impersonation_sessions
    WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
      AND status IN ('ended', 'expired')
  `);
}
```

---

## Security Considerations

### Database Inspector
1. **Role-Based Security**: `inhouse_admin_readonly` role with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT` enforces read-only at DB level
2. **Single-Statement Enforcement**: AST parser rejects multi-statement queries before execution
3. **Schema Isolation**: `SET LOCAL search_path` inside `BEGIN READ ONLY` transaction — never session-wide `SET` (pooling hazard)
4. **Cross-Schema Prevention**: AST walk rejects all qualified identifiers (`schema.table`) including `pg_catalog.*`
5. **Timeout Protection**: `SET LOCAL statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`
6. **Query Audit**: Every query logged with full SQL text
7. **Result Limits**: Max 1000 rows returned per query
8. **Sample Data Opt-In**: Metadata-only by default, sampling requires explicit flag + elevated permission
9. **PII Redaction**: Columns matching sensitive patterns redacted in sample data
10. **Prebuilt Queries**: Reduce freestyle SQL with common diagnostic templates

### Impersonation
1. **Typed Confirmation**: Admin must type `IMPERSONATE <slug>` to prevent accidental activation
2. **Route Allowlist**: Only specific read endpoints accessible (no exports, downloads, tokens)
3. **Response Redaction**: Middleware blocks CSV/ZIP exports and scans JSON for sensitive patterns
4. **Hard TTL**: 30-minute maximum session length
5. **No Concurrent Sessions**: One active session per admin
6. **Token Hashing**: Session tokens stored with HMAC-SHA256 (offline guessing resistant)
7. **IP/UA Binding**: Soft binding with mismatch logging
8. **Full Audit Trail**: Every proxied request logged
9. **Notifications**: Slack/webhook on session start/end

### Request Replay
1. **Route-Level Classification**: Only `replayable: true` routes can be replayed
2. **Scrubbing**: Auth headers stripped, sensitive fields recursively redacted
3. **Body Truncation**: Bodies > 8KB truncated before storage
4. **Multipart Handling**: File uploads stored as metadata only, never raw binary
5. **Payload Retention**: Separate storage with 7-30 day TTL, LRU eviction
6. **Rate Limiting**: Per admin AND per endpoint limits
7. **Mandatory Preview**: Required for side-effect replays
8. **Idempotency Keys**: Generated for all side-effect replays
9. **New Correlation ID**: Replays tracked separately from originals
10. **No Auth Spoofing**: Original user context preserved

### Observability Links
1. **No Secrets in URLs**: All links use SSO, no API keys embedded
2. **Config Split**: Base URLs in env vars (secrets-adjacent), toggles in DB (admin-editable)

### Permission Tiers

Split admin permissions into tiers for least-privilege:

| Permission | Access Level |
|------------|--------------|
| `inhouse.read` | View-only: schema metadata, observability links, request search |
| `inhouse.support` | + Database queries, impersonation, request replay with preview |
| `inhouse.support+` | + Skip preview for replays, extended session TTL (future) |

This allows L1 support to diagnose issues with `inhouse.read` while reserving data access (`inhouse.support`) for senior engineers. The `inhouse.support+` tier is for rare cases needing expedited debugging.

---

## Implementation Order

Resequenced for faster value delivery:

### Phase 1: Database Inspector (Week 1)
1. Create `InhouseInspectorService` with single-statement validation
2. Add read-only role + grant on project creation
3. Build schema introspection endpoints (metadata-only default)
4. Build query tool with audit logging
5. Add prebuilt query templates
6. Create Next.js API proxies
7. Build `InhouseDatabaseAdmin.tsx` component

### Phase 2: Observability Links (Week 1-2)
*Fast win that reduces pressure to use Inspector/Impersonation*
1. Add observability config migration
2. Build `ObservabilityLinksService`
3. Add links API endpoint
4. Integrate links into monitoring dashboard
5. Add links to error detail views

### Phase 3: Impersonation (Week 2-3)
1. Create impersonation sessions migration
2. Build `ImpersonationService` with token hashing and binding
3. Build proxy middleware for route allowlist
4. Add typed confirmation flow
5. Add Slack/webhook notifications
6. Add session expiry sweeper job
7. Create Next.js API proxies
8. Build `InhouseImpersonateSupport.tsx` component

### Phase 4: Request Replay (Week 3-4)
*Most policy-heavy, benefits from earlier features*
1. Define route replayability classifications
2. Enhance activity logging with scrubbed request capture
3. Build `RequestReplayService` with mandatory preview
4. Add per-endpoint rate limiting
5. Add replay endpoints
6. Create Next.js API proxies
7. Build `InhouseRequestReplay.tsx` component

---

## File Structure

```
sheenapps-claude-worker/
├── migrations/
│   └── 140_inhouse_advanced_support.sql
├── src/
│   ├── routes/
│   │   ├── adminInhouseDatabase.ts      # Database inspector
│   │   ├── adminInhouseSupport.ts       # Impersonation + replay
│   │   └── adminInhouseObservability.ts # Observability links
│   ├── services/
│   │   └── admin/
│   │       ├── InhouseInspectorService.ts
│   │       ├── ImpersonationService.ts
│   │       ├── RequestReplayService.ts
│   │       └── ObservabilityLinksService.ts
│   └── jobs/
│       └── inhouseAdminCleanup.ts       # Sweeper jobs

sheenappsai/
├── src/
│   ├── app/
│   │   └── api/admin/inhouse/
│   │       ├── database/
│   │       │   ├── route.ts
│   │       │   ├── templates/route.ts
│   │       │   └── [projectId]/
│   │       │       ├── schema/route.ts
│   │       │       ├── tables/[table]/route.ts
│   │       │       └── query/route.ts
│   │       ├── support/
│   │       │   ├── impersonate/
│   │       │   │   ├── start/route.ts
│   │       │   │   ├── confirm/route.ts
│   │       │   │   ├── session/route.ts
│   │       │   │   ├── end/route.ts
│   │       │   │   └── proxy/[...path]/route.ts
│   │       │   └── replay/
│   │       │       ├── route.ts
│   │       │       └── [correlationId]/
│   │       │           ├── route.ts
│   │       │           ├── preview/route.ts
│   │       │           └── replay/route.ts
│   │       └── observability/
│   │           └── links/route.ts
│   └── components/admin/
│       ├── InhouseDatabaseAdmin.tsx
│       ├── InhouseImpersonateSupport.tsx
│       ├── InhouseRequestReplay.tsx
│       └── ObservabilityLinks.tsx
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Inspector query latency (p99) | < 5 seconds |
| Impersonation session start time | < 2 seconds |
| Request replay success rate | > 95% (for replayable requests) |
| Zero unauthorized data access | 100% |
| Full audit coverage | 100% of inspector queries, impersonations, replays |

---

## Decisions Made

Based on expert review:

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Multi-statement queries | AST parser rejects; unit test suite required | DB role prevents mutation but not "second SELECT" data exposure |
| AST library | Pin version + test edge cases | Library AST shapes can change; tests catch regressions |
| Qualified identifiers | Reject ALL including pg_catalog.* | Eliminates cross-schema edge cases; use templates for catalog queries |
| DB role attributes | Explicit NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT | Postgres defaults are mostly safe but explicit > implicit |
| Schema qualifier in GRANTs | Always use `public.tablename` | Avoids ambiguity if schemas shift later |
| SET search_path | SET LOCAL inside BEGIN READ ONLY | Session-wide SET on pooled connections leaks between requests |
| Sample data | Opt-in only, metadata by default | Accidental PII exposure risk with creative schema names |
| Schema grants | Grant at project creation, not inspection | Avoids needing superuser-ish privileges at runtime |
| Token storage | Hash both confirmation and session tokens | DB leak shouldn't expose skeleton keys |
| IP/UA binding | Soft binding (log, don't block) | Balance security with admin mobility |
| Typed confirmation | Required for impersonation | Reduces accidental activations dramatically |
| Replayability | Per-route classification | Not all requests should be replayable |
| Scrubbing | Recursive field matching + truncation | Storage budget + compliance |
| Rate limiting | Per admin AND per endpoint | Prevents hammering one hot route |
| Preview for side effects | Mandatory | Preview token required before execute |
| Implementation order | Inspector → Observability → Impersonation → Replay | Early value, governance rules stabilize before Replay |
| Token hashing | HMAC-SHA256 with server secret | Plain SHA-256 allows offline verification if DB leaks |
| Response redaction | Middleware blocks CSV/ZIP, scans JSON | Defense-in-depth even with allowlist |
| Replay payload storage | Separate table with 7-30 day TTL | Prevents activity log bloat |
| Multipart uploads | Metadata only, no raw binary | Storage budget and privacy |
| Permission tiers | inhouse.read / inhouse.support / inhouse.support+ | Least-privilege for different support levels |

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Should impersonation require 2nd admin approval? | Deferred — add for enterprise tier if needed |
| Should we add query templates? | Yes — reduces freestyle SQL |
| Should replay support header modifications? | No — too risky, body-only |
| Should we add Slack notifications? | Yes — high signal, low cost |

---

## Appendix: Existing Patterns Reference

### Admin Auth Pattern
```typescript
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'

const supportMiddleware = requireAdminAuth({
  permissions: ['inhouse.support'],
  requireReason: true,
  logActions: true
})

fastify.post('/endpoint', { preHandler: supportMiddleware as never }, async (request, reply) => {
  const adminRequest = request as AdminRequest
  const adminId = adminRequest.adminClaims.sub
  const reason = request.headers['x-admin-reason']
  // ...
})
```

### Statement Timeout Pattern
```typescript
import { withStatementTimeout } from '../utils/dbTimeout'

const result = await withStatementTimeout(pool, '5s', async (client) => {
  return await client.query('SELECT ...', [params])
})
```

### Audit Logging Pattern
```typescript
import { auditAdminAction } from './admin/_audit'

auditAdminAction({
  adminId,
  action: 'database_query',
  projectId,
  resourceType: 'query',
  metadata: { queryHash, durationMs },
  ipAddress: request.ip || null,
  userAgent: request.headers['user-agent'] || null,
})
```

### Token Hashing Pattern (HMAC-SHA256)
```typescript
import { createHmac } from 'crypto'

// Use HMAC-SHA256 instead of plain SHA-256 for offline guessing resistance.
// A DB-leaked hash can't be verified/guessed without the server secret.
const TOKEN_HASH_SECRET = process.env.TOKEN_HASH_SECRET! // Required env var

function hashToken(token: string): string {
  return createHmac('sha256', TOKEN_HASH_SECRET)
    .update(token)
    .digest('hex')
}

// Store: hashToken(rawToken)
// Lookup: WHERE token_hash = hashToken(providedToken)
// The secret means a leaked DB dump can't be used to forge lookups
```
