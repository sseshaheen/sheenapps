- don't ever run a database migration on my behalf. Only create the migration file

## Migration Best Practices

**RLS Trigger Bypass**: Always bypass Row Level Security triggers when updating advisor fields in migrations:
```sql
BEGIN;
-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- Your migration updates here...

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';
COMMIT;
```

**Schema Verification**: Always verify column names before writing queries or migrations:
- Use `\d table_name` to check actual column structure
- Don't assume column names (e.g., `bio` vs `multilingual_bio`, `specializations` vs `specialties`)
- **Queries on non-existent columns return zero rows, not errors** - `WHERE type = 'easy_mode'` silently returns nothing if `type` column doesn't exist

**🚨 CRITICAL: User Table References**: Always use correct schema for user references:
```sql
-- ❌ WRONG - Will cause "relation users does not exist" error
REFERENCES users(id)
user_id IN (SELECT id FROM users WHERE ...)

-- ✅ CORRECT - Users table is in auth schema  
REFERENCES auth.users(id)
user_id IN (SELECT id FROM auth.users WHERE ...)
```
**Remember**: The `users` table is located in the `auth` schema, NOT the `public` schema. Always prefix with `auth.users` in foreign keys, JOINs, and SELECT statements.

**Project Ownership Column**: The `projects` table uses `owner_id`, NOT `user_id`:
```sql
-- ❌ WRONG - Column doesn't exist, causes silent 404 errors
WHERE user_id = $1
SELECT p.user_id FROM projects p  -- returns NULL
.eq('user_id', user.id)

-- ✅ CORRECT - Use owner_id for project ownership
WHERE owner_id = $1
SELECT p.owner_id FROM projects p
.eq('owner_id', user.id)
```
**Why this matters**: Queries with wrong column return zero rows (not errors), causing "Project not found" 404s that look like RLS/timing issues but are actually column name bugs. This pattern was copy-pasted across 10+ Vercel integration files before being caught.

**Other tables DO use `user_id`**: `migration_projects`, `referral_partners`, `billing_customers`, `support_tickets` - don't blindly replace all `user_id` references.

**Error Prevention**: Remove hardcoded fallbacks that hide validation errors - force proper validation instead

**Index Creation**: Never use `CREATE INDEX CONCURRENTLY` inside transaction blocks:
```sql
-- ❌ Wrong - will fail with "cannot run inside a transaction block"
BEGIN;
CREATE INDEX CONCURRENTLY idx_name ON table_name (column);
COMMIT;

-- ✅ Correct - inside transaction without CONCURRENTLY
BEGIN;
CREATE INDEX IF NOT EXISTS idx_name ON table_name (column);
COMMIT;

-- ✅ Correct - CONCURRENTLY outside transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table_name (column);
```

**Migration Idempotency**: Always make migrations re-runnable since they can fail mid-execution:
```sql
-- ✅ Tables, indexes, triggers
CREATE TABLE IF NOT EXISTS table_name (...);
CREATE INDEX IF NOT EXISTS idx_name ON table_name (column);

-- ✅ Constraints (conditional)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'constraint_name') THEN
    ALTER TABLE table_name ADD CONSTRAINT constraint_name CHECK (...);
  END IF;
END $$;

-- ✅ RLS Policies (conditional) 
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'policy_name') THEN
    CREATE POLICY policy_name ON table_name FOR SELECT USING (...);
  END IF;
END $$;

-- ✅ Triggers (conditional)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_name' AND tgrelid = 'table_name'::regclass) THEN
    CREATE TRIGGER trigger_name BEFORE UPDATE ON table_name FOR EACH ROW EXECUTE FUNCTION func();
  END IF;
END $$;
```

**Schema Validation**: Verify actual database schema before writing queries:
- **Column Names**: Check `pg_policy.polname` (not `policyname`), `pg_stat_user_indexes.relname` (not `tablename`)
- **Table Structure**: Ratings in `advisor_reviews.rating`, not `advisor_consultations.rating`
- **Field Existence**: Don't assume fields exist (e.g., `specialty_focus`, `booking_preferences`)

**No Interactive Commands**: Remove `\d table_name` and other psql commands from migration scripts

**Function Constraints**: Avoid non-immutable functions in index expressions and predicates:
```sql
-- ❌ WRONG - Functions in WHERE clauses must be IMMUTABLE
CREATE INDEX idx_cleanup ON table_name(created_at) WHERE created_at < NOW() - INTERVAL '7 days';
CREATE INDEX idx_expired ON table_name(expires_at) WHERE expires_at < CURRENT_TIMESTAMP;

-- ✅ CORRECT - Remove non-immutable functions from index predicates
CREATE INDEX idx_cleanup ON table_name(created_at);
CREATE INDEX idx_expired ON table_name(expires_at);

-- ✅ ALTERNATIVE - Use application logic for time-based filtering instead
```
**Note**: Functions like `NOW()`, `CURRENT_TIMESTAMP`, `CURRENT_DATE`, and `DATE_TRUNC()` are not IMMUTABLE and cannot be used in index WHERE clauses.

**Role Dependencies**: Always check if roles exist before creating policies that reference them:
```sql
-- ❌ WRONG - Will fail if role doesn't exist
CREATE POLICY service_policy ON table_name FOR ALL TO app_service USING (true);

-- ✅ CORRECT - Conditional policy creation
IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND 
   NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'service_policy') THEN
  CREATE POLICY service_policy ON table_name FOR ALL TO app_service USING (true);
END IF;
```
**Remember**: Database roles may not exist in all environments (dev/staging/prod). Always make role-dependent operations conditional.

## Version Record Principle

**Core Principle**: Version records in the `project_versions` table should ONLY be created for successful deployments or successful rollbacks.

**Implementation Rules**:
- ✅ **Successful Build/Deploy** → Create version record with `status: 'deployed'`
- ✅ **Successful Rollback** → Create version record with `status: 'deployed'` 
- ❌ **Failed Build** → No version record created (build tracked only in `project_build_metrics`)
- ❌ **Failed Rollback** → No version record created

**Rationale**: Version records represent deployable artifacts that users can interact with. Failed builds produce no deployable artifacts, so they should not have version records. This maintains data integrity and prevents confusion in version history APIs.

## Security (Authorization & Identity)

**🚨 CRITICAL: Project Authorization on ALL Endpoints**

Every endpoint that touches project-scoped data MUST verify access:
```typescript
// Create centralized helper
async function assertProjectAccess(projectId: string, userId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1 FROM projects p
     WHERE p.id = $1
       AND (p.owner_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc
         WHERE pc.project_id = p.id AND pc.user_id = $2
       ))`,
    [projectId, userId]
  );
  if (rows.length === 0) {
    throw { statusCode: 403, code: 'UNAUTHORIZED_PROJECT_ACCESS' };
  }
}

// Apply to EVERY endpoint
await assertProjectAccess(projectId, userId); // Before ANY read/write
```

**Why this matters**: Without this, anyone who guesses a projectId can read/write to it. This was missed on 10+ endpoints and caught in Round 18 review.

**Never Trust Client Headers for Identity**:
```typescript
// ❌ WRONG - Client can spoof this
const userType = request.headers['x-user-type'] as 'client' | 'assistant' | 'advisor';

// ✅ CORRECT - Force server-side
const userType = 'client' as const; // Public endpoints always 'client'
const actorType = 'client' as const; // Ignore body.actor_type
```

**Rule**: Any field that affects authorization, permissions, or identity MUST be set server-side, never trusted from client input.

## SSE & Real-Time Chat Architecture

**🚨 CRITICAL: Serialize ALL SSE Writes**

Multiple concurrent writers (subscriber, replay, heartbeat) WILL corrupt SSE frames:
```typescript
// ❌ WRONG - Interleaving corrupts frames
reply.raw.write(`id: ${id}\n`);
reply.raw.write(`event: ${event}\n`);
reply.raw.write(`data: ${data}\n\n`);

// ✅ CORRECT - Single-writer queue
let writeChain = Promise.resolve();
const enqueueWrite = (chunk: string) => {
  writeChain = writeChain.then(() => writeSafe(chunk));
  return writeChain;
};

// All writes through queue
await enqueueWrite(`id: ${id}\nevent: ${event}\ndata: ${data}\n\n`);
```

**Why**: Even with async/await, callbacks can interleave. One heartbeat between `id:` and `data:` breaks the entire frame.

**"id = seq" Invariant**:
- **Durable events** (message.new, message.replay): Use `id: seq.toString()`
- **Ephemeral events** (typing.*, presence.*, plan.*): Omit `id` entirely
- **Control events** (connection.established, server_close): Omit `id`

This prevents Last-Event-ID corruption from non-numeric IDs.

**Backpressure Handling**:
```typescript
const writeSafe = async (chunk: string): Promise<boolean> => {
  const ok = reply.raw.write(chunk);
  if (!ok) {
    // Race drain with close/error + 2s timeout fuse
    await Promise.race([
      new Promise(resolve => {
        reply.raw.once('drain', resolve);
        reply.raw.once('close', resolve);
        reply.raw.once('error', resolve);
      }),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
  }
  return !cleaned;
};
```

**Temporal Dead Zones Kill**:
```typescript
// ❌ WRONG - Used before declared
const sseHeartbeat = setInterval(() => { enqueueWrite(':keep-alive\n\n'); }, 25_000);
const enqueueWrite = (chunk: string) => { /* ... */ }; // Too late!

// ✅ CORRECT - Declare functions BEFORE intervals/callbacks
const enqueueWrite = (chunk: string) => { /* ... */ };
const sseHeartbeat = setInterval(() => { enqueueWrite(':keep-alive\n\n'); }, 25_000);
```

**setTimeout Cleanup**:
```typescript
// Always clear timers on success
let timer: ReturnType<typeof setTimeout> | null = null;
const onDone = () => {
  if (timer) clearTimeout(timer); // Prevent post-mortem firing
  resolve();
};
timer = setTimeout(onDone, 2000);
```

## Persistent Chat System

**Status**: Production-ready MVP with i18n support implemented (2025-08-24)

**Key Implementation Files**:
- `migrations/040-043`: Atomic sequencing, read receipts, FTS, i18n locale support  
- `src/services/enhancedChatService.ts`: Idempotency, sequence pagination, system messages
- `src/services/presenceService.ts`: Redis TTL-based presence with i18n events
- `src/routes/persistentChat.ts`: 9 REST endpoints with optional X-Locale headers
- `docs/FRONTEND_PERSISTENT_CHAT_INTEGRATION.md`: Complete Next.js integration guide

**Critical Design Patterns**:
- **Sequence-based pagination**: `seq` field prevents race conditions in infinite scroll
- **Idempotency**: `client_msg_id` UUID prevents duplicates (201→200 pattern)  
- **I18n system messages**: Machine-readable codes + params in existing `response_data` JSONB
- **Advisor network ready**: `actor_type`, `project_memberships` tables already deployed
- **Production-safe migrations**: All indexes use `CONCURRENTLY`, batched backfills

**API Essentials**:
- All endpoints accept optional `x-sheen-locale` header (values: en|ar|fr|es|de)
- Session locale auto-persists in `unified_chat_sessions.preferred_locale`
- System events generate i18n-ready codes for frontend localization
- 100% backwards compatible - no breaking changes

## Header Standards

**Locale Header**: Always use `x-sheen-locale` (NOT `x-locale`) across all API endpoints
- **Values**: `en|ar|fr|es|de` (simple language codes, not BCP-47)
- **Usage**: Optional header for internationalization
- **Consistency**: All routes (persistent chat, payments, advisor network) use this standard

## HMAC Signature Validation

**Critical Lesson**: Never use `JSON.parse()` + `JSON.stringify()` for HMAC signature validation

**Problem**: JSON property order changes break signatures (e.g., `{"a":1,"b":2}` becomes `{"b":2,"a":1}`)
**Solution**: Use raw request body string with custom Fastify content type parser
**Implementation**:
- `server.ts`: Custom JSON parser stores `request.rawBody`
- `hmacValidation.ts`: Use `rawBody` for byte-perfect signature validation

**Raw Body Requires Explicit Setup**: Fastify's `config: { rawBody: true }` alone isn't enough. You need:
- Custom content-type parser that preserves the raw buffer
- Verify `request.rawBody` actually exists before using it for webhook signature verification

## SQL Migration Best Practices

**Critical Patterns for Production Migrations**:

1. **Scalar Subqueries with GROUP BY**: Always wrap grouped results in outer SELECT
```sql
-- ❌ Wrong - returns multiple rows
(SELECT jsonb_object_agg(gateway, ...) FROM table GROUP BY gateway)

-- ✅ Correct - properly nested
(SELECT jsonb_object_agg(x.gateway, x.val) FROM 
  (SELECT gateway, ... AS val FROM table GROUP BY gateway) x)
```

2. **Partial Unique Indexes**: Prevent NULL conflicts in unique constraints
```sql
CREATE UNIQUE INDEX ux_name ON table(col1, col2) WHERE col2 IS NOT NULL;
```

3. **CHECK Constraints**: Validate all related columns together
```sql
-- For discount scenarios, validate original, discount, and final amounts
CHECK (
  (discount = 0 AND final = original) OR
  (discount > 0 AND original = snapshot_value AND final = original - discount)
)
```

4. **Column Consistency**: Verify exact column names across migrations
- Check existing tables with `\d table_name` before adding columns
- Maintain consistent naming: `is_active` vs `active`, `valid_from` vs `active_from`
- Use consistent case for region codes across all tables

5. **Index Naming**: Match index names to actual tables
```sql
-- Index name should reflect the table it's on
CREATE INDEX idx_reservations_status ON promotion_reservations(status);
-- NOT idx_redemptions_status ON promotion_reservations
```

6. **Function Safety**: Intersect results with allowed values
```sql
-- When returning provider lists, intersect with supported providers
RETURN (SELECT ARRAY(SELECT unnest(preferred) INTERSECT SELECT unnest(supported)));
```

## Postman Collection Editing Best Practices

**Lessons Learned**: Complex JSON files require proper data structure handling, not text manipulation.

### **❌ What Doesn't Work:**
- **Direct sed/awk on large JSON**: Complex structure causes syntax errors
- **Manual string insertion**: Breaks JSON delimiters and nesting
- **Line-by-line editing**: Hard to maintain proper JSON structure

### **✅ What Works Best:**
- **Python + json module**: Parse → modify → save ensures valid JSON
- **Find logical insertion points**: Search by section names/descriptions  
- **Insert entire objects**: Don't try to edit individual JSON lines
- **Always validate**: `python3 -m json.tool` to verify structure

### **🎯 Best Practice Workflow:**
```python
import json

# 1. Load with Python for proper parsing
with open('collection.json', 'r') as f:
    collection = json.load(f)

# 2. Find insertion index by searching collection structure
for i, item in enumerate(collection['item']):
    if 'target_section_name' in item.get('description', ''):
        insertion_index = i + 1
        break

# 3. Insert complete sections as objects
collection['item'].insert(insertion_index, new_section_object)

# 4. Save with formatting for readability
with open('collection.json', 'w') as f:
    json.dump(collection, f, indent=2, ensure_ascii=False)

# 5. Validate immediately
# python3 -m json.tool collection.json > /dev/null
```

### **🔑 Key Takeaway:**
**Treat JSON as data structure, not text file.** Python's JSON handling beats text manipulation every time for complex nested structures.

## Integration Status System

**Core Principle**: Integration status (GitHub/Vercel/Sanity/Supabase) is aggregated through a unified endpoint for workspace UI.

**API Endpoints**:
- `GET /api/integrations/status?projectId={id}` - Single endpoint returning all integration statuses
- `POST /api/integrations/actions` - Quick actions (deploy, push, sync, connect) with idempotency
- `GET /api/integrations/events` - SSE for real-time updates

**Key Features**:
- **Performance**: <500ms total response with parallel adapter execution, circuit breakers, Redis caching
- **Real-time**: SSE with BroadcastChannel sharing, heartbeats, Last-Event-ID resumption
- **Security**: Server-side permission filtering, data redaction, OAuth scope validation
- **Reliability**: Always returns all 4 keys for stable UI layout, stale data fallback

**Status Priority**: `error > warning > connected > disconnected` (computed server-side)

## API Authentication Pattern

**Core Principle**: SheenApps uses explicit user ID parameters instead of authentication middleware for API routes.

**Implementation Pattern**:
- **GET requests**: `userId` passed as query parameter
- **POST/PUT/DELETE requests**: `userId` passed in request body
- **No `request.user` property** - authentication is handled explicitly by each endpoint

**✅ Correct Patterns**:
```typescript
// GET endpoint
fastify.get<{
  Params: { projectId: string };
  Querystring: { userId: string; other?: string };
}>('/endpoint', async (request, reply) => {
  const { userId } = request.query;
  // ... rest of implementation
});

// POST endpoint
fastify.post<{
  Params: { projectId: string };
  Body: { userId: string; data: any };
}>('/endpoint', async (request, reply) => {
  const { userId, data } = request.body;
  // ... rest of implementation
});
```

**❌ Wrong Patterns**:
```typescript
// DON'T use request.user - this property doesn't exist
const userId = request.user?.id; // ❌ TypeScript error

// DON'T assume authentication middleware
// Each endpoint must explicitly require userId parameter
```

**Rationale**: This pattern provides explicit authentication control per endpoint and maintains clear API contracts with frontend clients.

## Data Consistency & Validation

**Locale Normalization Three-Step Pattern**:
```typescript
// Step 1: Accept BCP-47 in schema (before normalization runs)
'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' }

// Step 2: Normalize to base locale
const resolvedLocale = rawLocale ? resolveLocaleWithChain(rawLocale).base : undefined;

// Step 3: Validate against SUPPORTED_LOCALES
const locale = resolvedLocale && SUPPORTED_LOCALES.includes(resolvedLocale) ? resolvedLocale : undefined;
```

**Why all three steps**:
- Schema accepts `en-us` (lowercase) or `en-US` (uppercase)
- Normalization converts both to `en`
- Validation prevents storing unsupported locales like `xx`

**Schema Types: integer vs number**:
```typescript
// ❌ WRONG - Allows fractional values
limit: { type: 'number', minimum: 1, maximum: 100 }
before_seq: { type: 'number', minimum: 1 }

// ✅ CORRECT - Integer semantics for counts/sequences
limit: { type: 'integer', minimum: 1, maximum: 100 }
before_seq: { type: 'integer', minimum: 1 }
```

Allows `limit=20.7` or `seq=12.3` → weird paging bugs.

**UUID Format Consistency**:
```typescript
// ❌ WRONG - Mixed formats break validators
const clientMsgId = `system-${ulid()}`; // Not a UUID!

// ✅ CORRECT - Consistent UUID format
const clientMsgId = randomUUID(); // Proper UUID v4
```

If schema says `format: 'uuid'`, ALL values must be valid UUIDs.

**API Naming: snake_case for DB/PostgreSQL**:
```typescript
// ❌ WRONG - Mismatch causes silent failures
interface Request { actorTypes?: string[]; }
WHERE actor_type = ANY($actorTypes) // actorTypes is undefined!

// ✅ CORRECT - Match PostgreSQL convention
interface Request { actor_types?: string[]; }
WHERE actor_type = ANY($actor_types) // Works
```

**TypeScript Literal Types for Security**:
```typescript
// ❌ WRONG - String widening allows any value
const actorType = 'client'; // type: string
message.actor_type = actorType; // Could be anything

// ✅ CORRECT - Literal type prevents tampering
const actorType = 'client' as const; // type: 'client'
message.actor_type = actorType; // Type-safe
```

## Resource Management

**Singleton Services for Stateful Connections**:
```typescript
// ❌ WRONG - New instance per request = connection leak
export function registerRoutes(fastify: FastifyInstance) {
  const unifiedChatService = new UnifiedChatService(); // Opens Redis connection
  fastify.post('/endpoint', async (req, reply) => { /* ... */ });
}

// ✅ CORRECT - Singleton pattern
let serviceInstance: UnifiedChatService | null = null;
function getService(): UnifiedChatService {
  if (!serviceInstance) {
    serviceInstance = new UnifiedChatService();
  }
  return serviceInstance;
}
```

**Rule**: Any service that opens Redis, DB, or external connections MUST be a singleton.

## AI Time Operation Types

The AI Time Billing Service supports the following operation types:

**Existing Operations:**
- `main_build` - Main project builds (180s default)
- `metadata_generation` - Metadata generation (30s default)
- `update` - Project updates (120s default)
- `plan_consultation` - Plan consultations (60s default)
- `plan_question` - Plan questions (30s default)
- `plan_feature` - Plan feature requests (120s default)
- `plan_fix` - Plan fixes (90s default)
- `plan_analysis` - Plan analysis (180s default)

**Migration Operations (Added in Migration Integration):**
- `website_migration` - Website migration tool (1200s default / 20 minutes)

**Usage in Migration Services:**
```typescript
// Start migration AI time tracking
const tracking = await aiTimeBillingService.startTracking(
  `migration-${migrationId}-${phase}`,
  'website_migration', // ← New operation type
  { projectId: migrationId, versionId: phase, userId }
);
```

**Integration Points:**
- Migration AI Time Service uses this for budget enforcement
- Migration phases (ANALYZE, PLAN, TRANSFORM, VERIFY, DEPLOY) all use `website_migration` type
- Budget validation checks against user balance before each migration phase starts

## Route Development Patterns

**Leverage Existing Services**: Always check for existing utilities before building new ones:
- `workspaceFileAccessService` - Secure file reads with rate limiting
- `workspacePathValidator` - Directory listing with security checks
- `SecurePathValidator.getProjectRoot()` - Cross-platform project path resolution
- `subscribeToEvents()` from `eventService` - Real-time event subscription for SSE

**HMAC Middleware**: All routes use `requireHmacSignature()` as preHandler. Follow established pattern:
```typescript
const hmacMiddleware = requireHmacSignature();
fastify.get('/endpoint', { preHandler: hmacMiddleware as any }, handler);
```

**Query Params for File Paths**: Use `?path=src/App.tsx` instead of `/files/src/App.tsx` to avoid URL routing issues with slashes.

**TypeScript Type Checking**:
- Always verify union/enum types before comparisons (e.g., `BuildPhase` only includes specific values)
- Check interface definitions for required properties before casting responses
- Don't assume properties exist on types - verify with the actual type definition

## Easy Mode / In-House Infrastructure Lessons

### Security
- **Don't bake dynamic values into static deployments** - Use KV lookups for values that change (e.g., buildId for rollback)
- **Filter data at the boundary** - If users can't read a column, don't expose its existence in schema endpoints
- **Validate all paths as hostile** - Reject `..`, backslashes, control chars, double slashes, AND percent-encoded traversal (`%2e`, `%2f`, `%5c`)
- **Inference attacks are real** - Filtering/sorting by sensitive columns reveals values; check read permissions
- **Rate limit verification endpoints, not just creation** - Magic link verify, OTP verify, password reset verify are all brute-forceable
- **HMAC-authenticated endpoints are already trusted** - Don't over-engineer (URL allowlists, session-derived userId) for server-to-server calls; if they have the secret key, they're authorized
- **"Optional userId means optional auth"** - Require userId for all billable/mutating operations; use `isProjectOwner` helper for owner-only actions

### PostgreSQL
- **`SET LOCAL` requires a transaction** - Without `BEGIN`, it's silently ignored
- **`SET statement_timeout` on pooled connections leaks** - Without a transaction, the setting persists on that connection and affects other requests. Always use `SET LOCAL` inside a transaction, or use `withStatementTimeout()` helper from `utils/dbTimeout.ts`
- **`Promise.race()` doesn't cancel queries** - Use `statement_timeout` inside a transaction to actually kill runaway queries
- **`pool.query()` doesn't guarantee same connection** - Each call may use a different connection; use `pool.connect()` + dedicated client for transactions that need `SET LOCAL` to persist across queries
- **Centralize repeated predicates** - If multiple files check the same condition (e.g., `infra_mode = 'easy'`), make it a constant to prevent drift and silent bugs

### Memory Management
- **TTL without cleanup = memory leak** - In-memory Maps need periodic pruning, not just lazy eviction on access

### Code Quality
- **Copy-paste bugs hide in plain sight** - `x ? a.length : a.length` passed multiple reviews
- **`string.length` ≠ bytes** - Use `Buffer.byteLength(str, 'utf8')` for UTF-8 strings

### Fail-Safe Design
- **Check return values of critical operations** - Silent `false` returns cause "successful" operations that don't work
- **Fail closed on uncertainty** - Quota/permission checks should deny on DB errors, not allow unlimited access
- **Separate reliable ops from fire-and-forget** - Quota counting must be awaited; analytics logging can fail silently
- **Partial failures should fail entirely** - Don't mark deployment "successful" if some assets failed to upload
- **Guard failure-path DB updates** - Wrap "mark as failed" queries in try/catch so DB errors don't mask original error
- **Don't run long async operations inline** - `service.execute().catch()` in request handlers is fragile; if process restarts, operation is orphaned. Queue it instead.

### Data Consistency
- **Normalize inputs once, use everywhere** - If SQL and metadata both derive from input, normalize first to avoid mismatch
- **Store validated values, not raw input** - If you validate `col.type` → `validatedType`, store `validatedType`
- **Validate multi-row insert consistency** - All rows must have identical keys; missing keys become undefined → NULL

### URL/Path Safety
- **URL-encode ALL dynamic path segments** - `encodeURIComponent()` for KV keys, R2 bucket names, namespace IDs, script names - even if they "should" be safe (defense in depth)
- **Block reserved names in user input** - Env vars, bindings, identifiers that could collide with system values

### Resource Protection
- **Estimate size before allocating** - Base64 decode size ≈ `(encoded.length * 3) / 4`; reject before `Buffer.from()`
- **Early cumulative size rejection** - Check running total BEFORE decoding each item, not after decoding everything (prevents memory spike attacks)
- **Validate base64 strictly** - Check length % 4, valid chars, reject data URLs; `Buffer.from(..., 'base64')` is too permissive
- **Limit env vars three ways** - Count (50), per-value size (5KB), total size (128KB)
- **Cap pagination offset** - Large offsets are expensive; use MAX_OFFSET (e.g., 100K) and suggest keyset pagination
- **Body limits on all POST routes** - Even internal APIs need bodyLimit (e.g., 256KB for query contracts)
- **Rate limit metadata endpoints** - Schema/introspection endpoints can be abused to cause cache churn

### Path Validation
- **Segment-based traversal checks** - Don't block `..` anywhere (rejects `foo..bar.js`); split by `/` and reject segments equal to `.` or `..`
- **Use indexed loops for segment validation** - `indexOf('')` always returns first match; use `for (let i = 0; ...)` to check correct segment index
- **Validate entryPoint/filename fields** - Length limit, no path separators, only safe chars `[A-Za-z0-9._-]`
- **Prototype pollution defense** - Reject `__proto__`, `prototype`, `constructor` keys in user-provided objects
- **Validate string types for env values** - JSON can send `{ FOO: 123 }`; `Buffer.byteLength(123)` throws

### URL Encoding
- **Encode path segments individually** - `key.split('/').map(encodeURIComponent).join('/')` - some APIs choke on `%2F` encoded slashes

### Column/Permission Resolution
- **Fail closed on empty resolved columns** - If `resolveSelectColumns()` returns `[]`, return error not `SELECT *`
- **Empty array is truthy** - `columns: []` won't trigger `if (!columns)` checks; explicitly check `.length === 0`

### Error Codes
- **Use singular form in canonical codes** - `REQUEST_QUOTA_EXCEEDED` not `REQUESTS_QUOTA_EXCEEDED`; map from internal violation types to canonical codes

### Admin API Patterns
- **Structured errors over strings** - `{ code: 'INTERNAL_ERROR', message: '...' }` beats bare strings; update Reply types AND error handlers together
- **DELETE with body is non-standard** - Use POST action endpoints (`/revoke`, `/cleanup`) instead
- **Feature flag bucketing** - Use stable key (`flagKey:userId`), not dynamic values (`userId + default_value`)
- **JSONB array containment** - Use `?` operator (`channels ? $1`), not `LIKE '%value%'`
- **Stats queries must respect filters** - Easy to accidentally query unfiltered data when building filtered endpoints

### AI Cost Tracking
- **Per-model pricing varies dramatically** - Track input/output tokens separately; use real pricing constants, not flat-rate estimates
- **Model pricing reference** - GPT-4o: $2.50/$10 per 1M tokens; Claude 3.5 Sonnet: $3/$15; GPT-4o-mini: $0.15/$0.60

### Before Writing Code
- **Check what already exists** - e.g., `withStatementTimeout` already had transactions (withTx was unnecessary)
- **Count the scope** - 144 string errors vs 14 structured showed the real magnitude before batch transformation

### Email & Inbound Pipeline
- **Fail-open for inbound, fail-closed for outbound** - Spam filter returns "not spam" on errors (don't lose mail); auto-reply skips when Redis dedup is unavailable (don't send duplicates)
- **Dedupe at every layer** - DB unique index for storage, BullMQ deterministic `jobId` for queue, Redis NX for auto-reply, atomic `reserveProjectQuota` at send time
- **JSONB containment (`@>`) over text casts for index predicates** - `(metadata->>'spam')::boolean` throws on non-boolean values; `metadata @> '{"spam": true}'` is safe
- **Match partial index columns to actual query patterns** - Include `created_at DESC` if queries order by time, not just filter
- **Normalize email Message-IDs to angle brackets** (`<...>`) - Providers are inconsistent; threading breaks without RFC 5322 format
- **Preserve full References chain** - Append original References + Message-ID; don't replace
- **Prevent "Re: Re: Re:" stacking** - Check if subject already starts with `Re:` before prepending
- **Sanitize URLs for HTML attribute context** - Protocol validation alone doesn't prevent `"` or `>` breaking out of `href="..."`; reject URLs containing `<>"'\s`

### Shared Redis & Shutdown
- **One shared best-effort Redis client** (`src/services/redisBestEffort.ts`) - Prevents per-service singleton accumulation; uses `enableOfflineQueue: false` for fail-fast
- **Close BullMQ Queues/QueueEvents on shutdown** - Worker shutdown alone isn't enough; Queue and QueueEvents hold their own Redis connections. Call `closeAllQueues()` in shutdown handler
- **Use structured logging (`createLogger`) for degraded-mode paths** - `console.warn` is invisible in production; Pino with `{ projectId, mode: 'degraded' }` fields enables search and alerting

### SDK ↔ Backend Consistency
- **SDK paths must match backend routes exactly** - SDK calling `/v1/inhouse/jobs` while backend expects `/v1/inhouse/projects/:projectId/jobs` = silent 404s
- **Enforce one URL pattern across all services** - Mixed patterns (`/v1/inhouse/{service}` vs `/v1/inhouse/projects/:projectId/{service}`) cause bugs; pick one
- **Admin panel proxies mask SDK bugs** - If Next.js routes construct correct paths, direct SDK usage can be broken without anyone noticing
- **Audit sibling services when one has a mismatch** - Jobs bug → check Storage, Notifications, etc. (found two bugs, not one)

## Easy Mode SDK Context Injection Architecture

**Important**: CLAUDE.md files are NOT read by the platform during user prompts or AI provider work. SDK context is injected programmatically.

### System Prompt Building Flow for Easy Mode Projects

When a user sends a prompt for an Easy Mode project, the system builds a context-aware prompt:

```
User Prompt → buildWorker.ts → buildSDKContext() → [SDK Context] + [User Request] → Claude
```

### Key Files

| File | Purpose |
|------|---------|
| `src/services/ai/sdk-context.ts` | **Primary SDK injection point** - Contains SDK_API_REFERENCE, SDK_RULES, SDK_PATTERNS, detectFeatureType() |
| `src/workers/buildWorker.ts` | Calls `buildSDKContext()` for Easy Mode projects (lines ~332-344, ~470-482) |
| `src/services/recommendationsPrompt.ts` | Generates SDK-aware feature recommendations |
| `src/workers/recommendationsWorker.ts` | Processes recommendation jobs with `isEasyMode` flag |
| `src/workers/streamWorker.ts` | Handles metadata generation with SDK-aware recommendations |
| `packages/scripts/generate-sdk-context.js` | Auto-generates SDK context from package source files |

### SDK Context Components in sdk-context.ts

1. **SDK_API_REFERENCE**: API documentation for each SDK (auth, db, storage, jobs, secrets, email, payments, analytics)
2. **SDK_RULES**: Usage guidelines (server-only, error handling, environment variables)
3. **SDK_PATTERNS**: Code patterns keyed by feature type (e.g., `user_registration`, `checkout`, `email_template`)
4. **detectFeatureType()**: Keyword-based detection from user prompts to select relevant patterns
5. **enabledPrimitives**: List of available SDKs for the project (default: all 8)

### Adding a New SDK

1. Add to `SDK_PACKAGES` in `packages/scripts/generate-sdk-context.js`
2. Add API reference to `SDK_API_REFERENCE` in `sdk-context.ts`
3. Add rules to `SDK_RULES` in `sdk-context.ts`
4. Add patterns to `SDK_PATTERNS` in `sdk-context.ts`
5. Add keywords to `detectFeatureType()` in `sdk-context.ts`
6. Update `enabledPrimitives` in `buildWorker.ts` (2 locations)
7. Update `sdkGuidance` in `recommendationsPrompt.ts`

### Recommendations System SDK Awareness

The recommendations system suggests next-step features. For Easy Mode projects, it's SDK-aware:

```typescript
// recommendationsPrompt.ts
const sdkGuidance = opts.isEasyMode ? `
## Available Platform Features (Easy Mode)
- **@sheenapps/auth**: User authentication...
- **@sheenapps/payments**: Stripe integration...
// etc.
` : '';
```

Workers query `infraMode` from the database to determine if SDK guidance applies:

```typescript
// recommendationsWorker.ts, streamWorker.ts
const infraMode = await getProjectInfraMode(projectId);
const isEasyMode = infraMode === 'easy';
buildRecommendationsPrompt({ ..., isEasyMode });
```

### Preamble Pattern

SDK context is prepended to user prompts:
```
[SDK Context Block]
---
[User's Original Request]
```

This ensures Claude has full SDK knowledge before processing the user's request.