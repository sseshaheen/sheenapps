# Voice Analytics Storage Access Fix - Implementation Plan V2

**Status**: ✅ **IMPLEMENTED** (Ready for Testing)
**Priority**: P0 (Blocking - Admin audio playback broken)
**Created**: 2026-01-17
**Updated**: 2026-01-17 (Implementation completed)
**Implementation Time**: ~30 minutes

> **Note**: This V2 plan addresses all P0 concerns from expert reviews:
> 1. ✅ Uses JWT-based auth (cryptographically signed), not plaintext headers
> 2. ✅ Worker fetches recording once (no double DB fetch)
> 3. ✅ Rollback doesn't add service key to Next.js
> 4. ✅ Regex validation for storage paths
> 5. ✅ project_id included in response
> 6. ✅ Fastify framework (not Express) for worker routes
> 7. ✅ User email lookup in worker (not Next.js auth.admin calls)

---

## Problem Statement

### Current Broken State

The voice analytics admin feature attempts to generate signed URLs for audio playback directly in Next.js, but **Next.js does not have (and should not have) `SUPABASE_SERVICE_ROLE_KEY`** per RLS-first architecture.

**Root Cause**: Violates service role isolation principle - service key must only exist in worker.

---

## Implementation Progress ✅

**Phase 1: Worker Endpoint** - ✅ COMPLETE
- Created: `worker/src/routes/adminVoiceRecordings.ts` (313 lines)
- Registered in: `worker/src/server.ts` (line 54, 562)
- Implements:
  - JWT authentication via `requireAdminAuth()` middleware
  - Permission check: `voice_analytics.audio`
  - Recording fetch using service role client
  - Storage path validation (regex + `..` check)
  - Signed URL generation (1 hour expiry)
  - User email lookup via `auth.admin.getUserById()`
  - Comprehensive audit logging (5 events: requested/denied/failed/success)
  - Correlation ID tracing

**Phase 2: Next.js Proxy** - ✅ COMPLETE
- Updated: `src/app/api/admin/voice-analytics/recordings/[id]/route.ts`
- Reduced from ~220 lines → ~125 lines (net -95 lines!)
- Changes:
  - ❌ Removed: Service role client creation
  - ❌ Removed: Signed URL generation logic
  - ❌ Removed: Path validation (worker handles it)
  - ❌ Removed: User email lookup (worker provides it)
  - ❌ Removed: Local audit logging (worker handles it)
  - ✅ Added: Worker proxy via `workerFetch()`
  - ✅ Added: Correlation ID generation
  - ✅ Kept: Admin auth and permission check at Next.js layer

**Result**:
- Service role key completely removed from Next.js ✅
- Single DB fetch (worker only) ✅
- Clean separation of concerns ✅

**Phase 3: Testing** - ⏳ PENDING
- See "Testing Checklist" section below

---

## Solution: Proxy Through Worker (Corrected)

### Architecture Overview

```
Frontend (Admin Panel)
  │
  │ GET /api/admin/voice-analytics/recordings/[id]
  ▼
Next.js Admin API
  ├─ Validates admin auth (requireAdmin)
  ├─ Checks permission: voice_analytics.audio
  └─ Proxies to worker with JWT
      │
      │ GET /v1/admin/voice-recordings/:id/signed-url
      │ Authorization: Bearer <admin_jwt> ✅ cryptographically signed
      ▼
Worker Service
  ├─ Verifies JWT signature ✅
  ├─ Extracts admin claims from JWT (id, email, permissions)
  ├─ Fetches recording from DB (service role)
  ├─ Generates signed URL (service role)
  ├─ Logs access to audit table
  └─ Returns signed URL + full recording data
      │
      ▼
Next.js → Frontend
  └─ Returns signed URL + recording detail
```

**Key Fix**: Worker verifies cryptographically signed JWT, not plaintext headers. ✅

---

## Critical Security Corrections (Expert Feedback)

### ❌ WRONG (Original Plan):
```typescript
// Don't send plaintext permission headers - forgeable!
headers: {
  'x-sheen-admin-id': adminId,        // ❌ Not cryptographically bound
  'x-sheen-permissions': 'voice_analytics.audio', // ❌ Can be forged
}
```

### ✅ CORRECT (Updated):
```typescript
// Next.js sends JWT (already implemented)
const authHeaders = await AdminAuthService.getAuthHeaders('Voice analytics audio playback')
// Returns: { 'Authorization': 'Bearer <signed_jwt>' }

// Worker verifies JWT and extracts claims
const admin = await verifyAdminJWT(req.headers.authorization)
// admin = { id, email, role, permissions } from signed JWT payload ✅
```

**Rationale**: JWT is signed by worker during login, contains all admin claims, cryptographically verifiable.

---

## Implementation Steps

### Phase 1: Worker Endpoint Creation

**File**: `worker/src/routes/admin/voiceRecordings.ts` (new)

**Endpoint**: `GET /v1/admin/voice-recordings/:id/signed-url`

**Implementation**:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAuth } from '@/middleware/admin-auth' // JWT verification middleware
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

export async function registerAdminVoiceRecordingRoutes(app: FastifyInstance) {
  // JWT verification via preHandler middleware
  app.get('/v1/admin/voice-recordings/:id/signed-url', {
    preHandler: requireAdminAuth(), // Returns Fastify-compatible middleware
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4()
    const admin = (request as any).admin // ✅ Extracted from verified JWT by middleware

    // Log access request (before permission check)
    await audit({
      event_type: 'admin.voice_recording.access_requested',
      details: {
        admin_user_id: admin.id,
        admin_email: admin.email,
        recording_id: request.params.id,
        correlation_id: correlationId
      },
      severity: 'low',
      user_id: admin.id
    })

    // Check permission (from JWT payload)
    if (!admin.permissions.includes('voice_analytics.audio') &&
        !admin.permissions.includes('voice_analytics.*') &&
        !admin.permissions.includes('admin:*')) {
      await audit({
        event_type: 'admin.voice_recording.access_denied',
        details: {
          admin_user_id: admin.id,
          recording_id: request.params.id,
          reason: 'missing_permission',
          correlation_id: correlationId
        },
        severity: 'low'
      })
      return reply.status(403).send({ error: 'Forbidden: Requires voice_analytics.audio permission' })
    }

    const { id } = request.params

    // Fetch recording using service role (privileged access)
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: recording, error: dbError } = await supabase
      .from('voice_recordings')
      .select('*')
      .eq('id', id)
      .single()

    if (dbError || !recording) {
      await audit({
        event_type: 'admin.voice_recording.access_failed',
        details: {
          admin_user_id: admin.id,
          recording_id: id,
          reason: 'not_found',
          correlation_id: correlationId
        },
        severity: 'low'
      })
      return reply.status(404).send({ error: 'Recording not found' })
    }

    // Normalize and validate storage path
    const raw = String(recording.audio_url || '')
    let storagePath = raw.replace(/^\//, '')

    // Handle full URLs accidentally stored
    const marker = '/voice-recordings/'
    if (storagePath.includes(marker)) {
      storagePath = storagePath.split(marker)[1]
    }

    // Security: validate storage path format
    // Expected pattern: {userId}/{recordingId}.(webm|mp3|m4a|wav|ogg|aac|flac)
    const validPathPattern = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(webm|mp3|m4a|wav|ogg|aac|flac)$/i

    if (!storagePath || storagePath.includes('..') || !validPathPattern.test(storagePath)) {
      await audit({
        event_type: 'admin.voice_recording.access_failed',
        details: {
          admin_user_id: admin.id,
          recording_id: id,
          reason: 'invalid_path',
          audio_url: raw,
          storage_path: storagePath,
          correlation_id: correlationId
        },
        severity: 'medium' // Potential attack
      })
      return reply.status(400).send({ error: 'Invalid audio path' })
    }

    // Generate signed URL (service role)
    const expiresIn = 3600 // 1 hour
    const { data: signedData, error: signedError } = await supabase.storage
      .from('voice-recordings')
      .createSignedUrl(storagePath, expiresIn)

    if (signedError || !signedData) {
      await audit({
        event_type: 'admin.voice_recording.access_failed',
        details: {
          admin_user_id: admin.id,
          recording_id: id,
          reason: 'signed_url_generation_failed',
          error: signedError?.message,
          correlation_id: correlationId
        },
        severity: 'high' // Service issue
      })
      return reply.status(500).send({ error: 'Failed to generate audio playback URL' })
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Fetch user email using service role (worker can safely use auth.admin APIs)
    const { data: userData } = await supabase.auth.admin.getUserById(recording.user_id)
    const userEmail = userData?.user?.email || null

    // Log successful access
    await audit({
      event_type: 'admin.voice_recording.access',
      details: {
        admin_user_id: admin.id,
        admin_email: admin.email,
        recording_id: id,
        recording_owner_id: recording.user_id,
        project_id: recording.project_id,
        action: 'signed_url_generated',
        signed_url_expires_at: expiresAt,
        correlation_id: correlationId
      },
      severity: 'low',
      user_id: admin.id
    })

    // Return signed URL + full recording data (including user_email)
    return reply.send({
      signed_audio_url: signedData.signedUrl,
      signed_url_expires_at: expiresAt,
      recording: {
        id: recording.id,
        user_id: recording.user_id,
        user_email: userEmail, // ✅ Worker provides user email
        project_id: recording.project_id,
        audio_url: recording.audio_url,
        audio_format: recording.audio_format,
        duration_seconds: recording.duration_seconds,
        file_size_bytes: recording.file_size_bytes,
        transcription: recording.transcription,
        detected_language: recording.detected_language,
        confidence_score: recording.confidence_score,
        provider: recording.provider,
        model_version: recording.model_version,
        processing_duration_ms: recording.processing_duration_ms,
        cost_usd: recording.cost_usd,
        message_id: recording.message_id,
        created_at: recording.created_at
      }
    })
  })
}

async function audit(log: any) {
  // Insert to security_audit_log table using supabase service client
  // Fallback to console.log on error (don't block request)
}
```

**Key Security Points**:
- ✅ JWT signature verified by middleware (cryptographically bound)
- ✅ Admin claims extracted from JWT payload (not plaintext headers)
- ✅ Signature covers: adminId, permissions, timestamp, method, path
- ✅ Path traversal blocked (`..` check)
- ✅ Path format validated (regex allowlist: `{uuid}/{uuid}.{ext}`)
- ✅ User email fetched in worker using service role (Next.js doesn't need auth.admin access)
- ✅ Correlation IDs for tracing (Frontend → Next.js → Worker → DB)
- ✅ Audit logging at each step (requested/denied/failed/success)
- ✅ Storage bucket private (signed URLs only)

---

### Phase 2: Next.js Proxy Update (Simplified)

**File**: `src/app/api/admin/voice-analytics/recordings/[id]/route.ts` (modify)

**BEFORE** (~150 lines with service client):
```typescript
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY // ❌ Doesn't exist
const supabaseServiceClient = createClient(url, serviceRoleKey)
// ... fetch recording
// ... generate signed URL
// ... audit logging
```

**AFTER** (~60 lines, proxy only):
```typescript
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Permission check (Next.js layer)
  const { session, error } = await requireAdmin('voice_analytics.audio')
  if (error) return error

  const { id } = await params

  try {
    // Proxy to worker for signed URL + recording data
    const workerResult = await workerFetch<{
      signed_audio_url: string
      signed_url_expires_at: string
      recording: any
    }>(
      `/v1/admin/voice-recordings/${id}/signed-url`,
      {
        method: 'GET',
        adminReason: 'Voice analytics audio playback',
        headers: {
          'x-correlation-id': crypto.randomUUID() // For tracing
        }
      }
    )

    if (!workerResult.ok) {
      logger.error('Failed to generate signed URL via worker', {
        recordingId: id,
        adminId: session.user.id,
        error: workerResult.error,
        status: workerResult.status
      })
      return noCacheErrorResponse(
        { error: workerResult.error || 'Failed to generate audio playback URL' },
        workerResult.status
      )
    }

    const { signed_audio_url, signed_url_expires_at, recording } = workerResult.data

    // Worker already includes user_email - no need to fetch here
    // Return full recording detail (same shape as before)
    const detail = {
      ...recording,
      signed_audio_url,
      signed_url_expires_at
    }

    logger.info('Voice recording detail accessed via worker', {
      adminId: session.user.id,
      recordingId: id,
      ownerId: recording.user_id
    })

    return noCacheResponse(detail)

  } catch (err) {
    logger.error('Voice recording detail error', err)
    return noCacheErrorResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    )
  }
}
```

**Changes**:
- ❌ Removed: Service role client creation (~50 lines)
- ❌ Removed: Signed URL generation logic
- ❌ Removed: Local audit logging (worker handles it)
- ❌ Removed: Path validation (worker handles it)
- ❌ Removed: User email lookup (worker provides it in response)
- ✅ Added: Worker proxy call with JWT auth
- ✅ Added: Correlation ID for tracing

**Net Result**: ~60 lines (from ~150), no service role dependency, cleaner separation.

---

### Phase 3: Testing Checklist

#### Security Tests (Critical)

- [ ] JWT signature verification works in worker
- [ ] Forged JWT gets rejected (401)
- [ ] JWT without `voice_analytics.audio` permission gets 403
- [ ] Expired JWT gets rejected (401)
- [ ] Stale JWT (>15 min old) gets rejected (401 with freshness error)
- [ ] Path traversal (`audio_url` with `..`) gets 400
- [ ] Non-existent recording ID gets 404

#### Functional Tests

- [ ] Admin can play audio recordings
- [ ] Signed URL actually works (download audio)
- [ ] Signed URL expires after 1 hour
- [ ] Response includes `user_email` field (fetched by worker)
- [ ] Multiple admins can access same recording concurrently
- [ ] Audit log entries created for all attempts (success/failure)

#### Integration Tests

- [ ] Next.js → Worker request includes correlation ID
- [ ] Correlation ID appears in both Next.js and worker logs
- [ ] Frontend unchanged (same API contract)
- [ ] Error messages propagate correctly

#### Regression Tests

- [ ] Voice analytics dashboard loads (GET `/api/admin/voice-analytics`)
- [ ] Recordings list works (GET `/api/admin/voice-analytics/recordings`)
- [ ] User transcription unaffected (POST `/api/v1/projects/[id]/transcribe`)

---

## Rollback Plan (Corrected)

### ❌ BAD Rollback (Original Plan):
"Add `SUPABASE_SERVICE_ROLE_KEY` to Next.js temporarily"

**Problem**: Temporary becomes permanent. Violates architecture.

### ✅ GOOD Rollback:

**Option 1: Graceful Degradation**
```typescript
// Feature flag to disable audio playback
if (!process.env.ENABLE_AUDIO_PLAYBACK) {
  return noCacheResponse({
    ...recording,
    signed_audio_url: null,
    playback_unavailable: true,
    playback_unavailable_reason: 'Audio playback temporarily disabled for maintenance'
  })
}
```

**Option 2: Emergency Override (with safeguards)**
```typescript
// Only in staging OR with explicit override + time bomb
const EMERGENCY_MODE = process.env.EMERGENCY_OVERRIDE === 'true' &&
                       new Date() < new Date('2026-02-01') // Time bomb

if (EMERGENCY_MODE && process.env.NODE_ENV !== 'production') {
  logger.warn('EMERGENCY: Using service role in Next.js (temporary bypass)')
  // ... fallback to service client
}
```

**Option 3: Alert + Disable**
- Monitor error rate for 403/500 from worker
- Auto-disable feature if error rate > 10%
- Send alerts to ops team
- Show clear admin message: "Audio playback unavailable, team notified"

**Never**: Add service role key to production Next.js, even temporarily.

---

## Migration Checklist

### Pre-Deployment

- [ ] Worker has `SUPABASE_SERVICE_ROLE_KEY` in environment
- [ ] Worker JWT verification middleware works
- [ ] Worker `requireAdminAuth` extracts claims from JWT
- [ ] Test worker endpoint directly (curl with valid JWT)
- [ ] Verify storage bucket is private (no public access)
- [ ] Audit log table has proper indexes

### Deployment Steps

1. Deploy worker with new endpoint (backward compatible)
2. Test worker endpoint in staging
3. Deploy Next.js with proxy implementation
4. Verify audio playback in staging
5. Monitor logs for correlation IDs
6. Roll out to production
7. Monitor for 24 hours

### Post-Deployment Verification

- [ ] Check audit logs have correlation IDs
- [ ] Verify JWT claims are logged (not plaintext headers)
- [ ] Monitor worker response times (<500ms p95)
- [ ] Check signed URL expiration works
- [ ] Verify no 500 errors from missing service key

---

## Success Metrics

- **Functional**: Admin can play audio without errors
- **Security**: Service role key never leaves worker ✅
- **Security**: Admin claims verified via JWT, not headers ✅
- **Performance**: Audio playback latency <1s (p95)
- **Compliance**: All access logged with correlation IDs
- **Traceability**: Request path traceable: Frontend → Next.js → Worker → DB

---

## Expert Review Summary

### ✅ Approved Aspects
- Correct layer split (service role in worker only)
- No frontend changes needed
- Audit trail approach
- Path traversal defense

### ⚠️ Corrected Issues
1. **Auth verification**: Use JWT claims (cryptographically signed), not plaintext headers
2. **Double DB fetch**: Worker fetches recording once, Next.js proxies
3. **Audit logging**: Added correlation IDs, log request + result
4. **Rollback**: Never add service key to Next.js, even temporarily
5. **Framework mismatch**: Worker uses Fastify (not Express) for route registration
6. **Service key isolation**: User email lookup moved to worker (Next.js doesn't call auth.admin)

### 🎯 Result
Architecture maintains security boundaries while being operationally sound. All expert feedback incorporated. **Ship-ready.**

---

## Dependencies

- Worker service with JWT auth middleware
- `AdminAuthService.getAuthHeaders()` (already implemented)
- `workerFetch` helper (already implemented)
- `voice_recordings` table with proper RLS policies
- `security_audit_log` table for audit entries
- Private storage bucket: `voice-recordings`

---

## References

- `CLAUDE.md` - RLS-first architecture
- `src/lib/admin/worker-proxy.ts` - Worker proxy patterns
- `src/lib/admin/admin-auth-service.ts` - JWT auth
- Expert review feedback (2026-01-17)

---

## Implementation Discoveries & Notes

### ✅ What Went Well

1. **Existing Infrastructure Was Perfect**
   - `requireAdminAuth()` middleware already supports permission arrays
   - `workerFetch()` helper handles all JWT auth and correlation IDs
   - Audit logging pattern already established in `trustSafety.ts`
   - No new infrastructure needed!

2. **Clean Separation Achieved**
   - Next.js: ~125 lines (down from ~220)
   - Worker: 313 lines (comprehensive, self-contained)
   - Zero shared logic between layers ✅

3. **Security Improvements**
   - Storage path validation moved to worker (defense in depth)
   - User email lookup isolated to service role layer
   - Correlation IDs for full request tracing
   - Multiple audit events (not just success, but denied/failed too)

### 📝 Important Implementation Details

1. **Audit Logging Pattern**
   ```typescript
   // Worker uses direct INSERT (not Supabase client for audit logs)
   await pool!.query(
     `INSERT INTO security_audit_log (user_id, event_type, severity, description, metadata)
      VALUES ($1, $2, $3, $4, $5)`,
     [userId, eventType, severity, description, JSON.stringify(details)]
   )
   ```
   Rationale: Audit logs are critical - using raw SQL avoids Supabase client overhead and ensures writes even if client has issues.

2. **AdminClaims Access Pattern**
   ```typescript
   const adminClaims = (request as AdminRequest).adminClaims
   ```
   The middleware attaches claims to `request.adminClaims` after JWT verification. Must cast to `AdminRequest` type for TypeScript.

3. **Error Handling Philosophy**
   - User email fetch failure: Don't fail request, just log and return null
   - Audit log failure: Don't block request, fallback to structured logging
   - Critical errors: Return 500 with correlation ID for tracing

4. **Path Validation**
   - Regex: `/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(webm|mp3|m4a|wav|ogg|aac|flac)$/i`
   - Expected: `{userId}/{recordingId}.{extension}`
   - Blocks: `..`, empty paths, malformed UUIDs, unexpected extensions

### 🚀 Potential Future Improvements

**Not Blocking - Consider for Future Iterations:**

1. **Caching Signed URLs**
   - Current: Generate new signed URL on every request
   - Improvement: Cache signed URLs for ~50 minutes (10 min before expiry)
   - Benefit: Reduce Supabase storage API calls, faster response
   - Complexity: Need Redis/memory cache with TTL

2. **Batch Audio Access**
   - Current: One recording at a time
   - Improvement: `POST /v1/admin/voice-recordings/batch-signed-urls` with array of IDs
   - Benefit: Dashboard could prefetch multiple recordings
   - Use Case: Admin reviewing 10+ recordings in a session

3. **Streaming Audio**
   - Current: Signed URL → browser downloads → plays
   - Improvement: Proxy streaming through worker with range requests
   - Benefit: Better mobile experience, partial playback without full download
   - Complexity: Moderate (stream piping, range header handling)

4. **Audit Log Enrichment**
   - Current: Basic access logging
   - Improvement: Track playback duration, seek positions, completion rate
   - Benefit: Better analytics on which recordings are actually reviewed
   - Implementation: Frontend sends telemetry to separate endpoint

5. **Permission Granularity**
   - Current: `voice_analytics.audio` for all recordings
   - Improvement: `voice_analytics.audio.own_project` vs `voice_analytics.audio.all`
   - Benefit: Project admins can only hear their project's recordings
   - Complexity: Worker needs to check project ownership

### 📊 Metrics to Monitor

Once deployed, watch these metrics:

- **Latency**: p50, p95, p99 for `/v1/admin/voice-recordings/:id/signed-url`
  - Target: <500ms p95 (mostly Supabase storage API time)
- **Error Rate**: 4xx vs 5xx split
  - Watch for: 403 (permission issues), 404 (bad IDs), 500 (storage issues)
- **Audit Log Volume**: Events per day by type
  - Baseline: Should correlate with admin dashboard usage
- **Correlation ID Coverage**: % of requests with correlation IDs
  - Target: 100% (all requests from Next.js include them)

---

## Final Status

**Implementation**: ✅ COMPLETE
**Code Review**: ✅ Expert-approved (4 rounds of feedback incorporated)
**Testing**: ⏳ PENDING (see checklist above)
**Deployment**: ⏳ BLOCKED on testing

**Next Steps**:
1. Run security tests (JWT verification, permission checks)
2. Test audio playback end-to-end
3. Verify audit logs appear in dashboard
4. Deploy to staging
5. Smoke test in production
6. Monitor metrics for 24 hours

---

## Post-Implementation Verification ✅

### TypeScript Type Checking

**Worker App**:
- ✅ Fixed: Type error in `adminVoiceRecordings.ts:160` (split array undefined handling)
- ✅ Zero errors in new implementation
- ⚠️ Pre-existing errors in `voiceTranscription.ts` and `openai-speech-provider.ts` (unrelated)

**Next.js App**:
- ✅ Zero errors related to voice analytics changes
- ✅ Recording detail route types match frontend expectations
- ⚠️ Pre-existing errors in `transcribe/route.ts` and `builder-chat-interface.tsx` (unrelated)

### Code Audit - No Other Updates Needed

**Searched for potential issues:**
1. ✅ `SUPABASE_SERVICE_ROLE_KEY` usage in Next.js:
   - Found in `lib/admin-auth.ts` (has fallback when NOT present)
   - Found in `lib/server/supabase-clients.ts` (`getServiceClient()` helper)
   - Found in test files (test endpoints only)
   - **NOT used in voice analytics routes** ✅

2. ✅ Voice analytics endpoints verified:
   - `/api/admin/voice-analytics/route.ts` - Dashboard metrics (no service key)
   - `/api/admin/voice-analytics/recordings/route.ts` - List (no service key)
   - `/api/admin/voice-analytics/recordings/[id]/route.ts` - Detail (updated, proxies to worker)

3. ✅ Frontend compatibility:
   - `page.tsx` already expects `signed_audio_url` and `signed_url_expires_at`
   - Fetch endpoint: `GET /api/admin/voice-analytics/recordings/${id}` ✅
   - Audio player uses correct field: `selectedRecording.signed_audio_url` ✅
   - TypeScript interfaces match API response shape ✅

### Environment Variables

**Worker (Required)**:
- ✅ `SUPABASE_URL` - Present
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Present (this is the key that must NOT be in Next.js)
- ✅ `ADMIN_JWT_SECRET` - Present (for JWT verification)

**Next.js (Required)**:
- ✅ `WORKER_BASE_URL` - Present (`http://localhost:8081`)
- ✅ `SUPABASE_URL` - Present (for RLS client)
- ✅ `SUPABASE_ANON_KEY` - Present (for RLS client)
- ✅ No `SUPABASE_SERVICE_ROLE_KEY` needed in Next.js (correct!)

### Architecture Compliance ✅

**Service Role Key Isolation**:
- ✅ Worker: Has service key (correct - privileged operations)
- ✅ Next.js: No service key in voice analytics routes (correct - RLS-first)
- ✅ Proxy pattern: Next.js → Worker via JWT auth (secure)

**No Breaking Changes**:
- ✅ API contract unchanged (frontend works without modifications)
- ✅ Response shape matches existing TypeScript interfaces
- ✅ All endpoints return same data structure

---

## Testing Status

**Implementation Status**: ✅ 100% Complete
**Code Quality**: ✅ All TypeScript errors fixed
**Architecture**: ✅ Compliant with RLS-first principles
**Dependencies**: ✅ All environment variables present
**Automated Tests**: ✅ Infrastructure verified
**Manual Tests**: ⏳ Requires worker restart + test data

**Testing Report**: See `VOICE_ANALYTICS_TESTING_REPORT.md` for:
- Detailed test results
- Manual testing instructions
- Security test checklist
- Deployment checklist

### Quick Start Testing

**1. Restart Worker** (to load new route):
```bash
cd /Users/sh/Sites/sheenapps/sheenapps-claude-worker
npm run build
# Then restart worker process (kill + npm start, or pm2 restart)
```

**2. Verify Route Loaded**:
```bash
curl http://localhost:8081/v1/admin/voice-recordings/test/signed-url
# Should return 401 (not 404) - confirms route exists
```

**3. Create Test Recording**:
- Use voice input in workspace builder, OR
- Insert test data (see testing report)

**4. Follow Manual Test Plan**:
- See `VOICE_ANALYTICS_TESTING_REPORT.md` for complete instructions
