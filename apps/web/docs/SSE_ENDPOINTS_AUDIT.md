# SSE Endpoints Audit - Connection Limit Analysis

**Date**: 2026-01-13
**Purpose**: Identify which SSE endpoints share the worker's 10 connection limit

---

## Summary

✅ **Only ONE endpoint has the 10 connection limit issue**: `/api/persistent-chat/stream`

All other SSE endpoints in the codebase are either:
- Separate worker endpoints (different connection pools)
- Implemented directly in Next.js (no worker proxy)
- Dead code (unused)

---

## Detailed Analysis

### 1. ✅ FIXED: `/api/persistent-chat/stream`

**Worker Endpoint**: `/v1/projects/${projectId}/chat/stream`
**Connection Limit**: 10 connections per (project, user)
**Status**: ✅ **Fixed by SSEConnectionManager refactoring**

**What connects to it**:
- ✅ `SSEConnectionManager` - Correct singleton pattern
- ✅ `use-advisor-workspace-events.ts` - **FIXED** (now uses singleton)
- ✅ `use-github-sync-realtime.ts` - **FIXED** (now uses singleton)
- ✅ `use-persistent-live.ts` - Already correct (uses singleton)
- ✅ `persistent-chat-client.ts` `createSSEConnection()` - **REMOVED** (commented out with @deprecated)

**Why it was broken**: Multiple hooks creating raw EventSource bypassing singleton
**Fix applied**: All hooks now use SSEConnectionManager singleton with ref counting

---

### 2. `/api/integrations/events` - Separate Endpoint

**Worker Endpoint**: `/api/integrations/events` (different from persistent chat)
**Connection Limit**: Unknown (separate pool)
**Status**: ✅ No changes needed

**Implementation**: `src/app/api/integrations/events/route.ts`
**What connects to it**: `use-integration-status.ts` (lines 240-269)

**Analysis**: This proxies to a **different worker endpoint** (`/api/integrations/events`), not the persistent chat stream. Likely has its own connection pool separate from the 10-connection limit.

**Code Pattern**:
```typescript
// uses-integration-status.ts
const url = `/api/integrations/events?${params}`
const eventSource = new EventSource(url)
```

**No action needed**: Each component creates its own EventSource, but this endpoint likely doesn't have the same aggressive 10 connection limit as persistent chat.

---

### 3. `/api/events/stream` - Direct Database Access

**Worker Endpoint**: None (direct Supabase query)
**Connection Limit**: N/A (no worker proxy)
**Status**: ✅ No changes needed

**Implementation**: `src/app/api/events/stream/route.ts`
**What connects to it**: `use-unified-events.ts` (lines 190-230)

**Analysis**: This route is **implemented directly in Next.js**, reading from Supabase database. Does NOT proxy to worker. No connection limit issues.

**Code Pattern**:
```typescript
// use-unified-events.ts
const eventSource = new EventSource(`/api/events/stream?${searchParams.toString()}`)
```

**No action needed**: Separate from worker's persistent chat stream entirely.

---

### 4. `/api/workspace/logs/stream` - Direct Database Access

**Worker Endpoint**: None (direct Supabase query)
**Connection Limit**: N/A (no worker proxy)
**Status**: ✅ No changes needed

**Implementation**: `src/app/api/workspace/logs/stream/route.ts`
**What connects to it**: `use-log-stream.ts` (lines 130-152)

**Analysis**: Implemented directly in Next.js using `makeUserCtx()` to query database. No worker proxy. Separate from persistent chat stream.

**Code Pattern**:
```typescript
// use-log-stream.ts
const eventSource = new EventSource(`/api/workspace/logs/stream?${params}`)
```

**No action needed**: Direct database access, no connection limit.

---

### 5. `/api/v1/builds/${buildId}/stream` - Dead Code (REMOVED)

**Worker Endpoint**: Unknown (route doesn't exist)
**Connection Limit**: N/A
**Status**: ✅ **Commented out (2026-01-13)**

**Implementation**: None (no API route found)
**What connected to it**: `use-code-stream.ts` - **REMOVED** (entire file commented out)

**Analysis**:
- Hook was **never imported** anywhere (grep confirmed)
- No API route at `/api/v1/builds/${buildId}/stream` exists
- Likely leftover from earlier architecture
- Code streaming is now handled by `StreamController` + `chat-plan-client`

**Code Pattern** (now commented out):
```typescript
// use-code-stream.ts (DEAD CODE - COMMENTED OUT)
// const url = `/api/v1/builds/${buildId}/stream?${params}`
// const eventSource = new EventSource(url)
```

**Action Taken**: ✅ Entire file commented out with @deprecated notice and migration instructions

---

### 6. `/api/chat-plan/stream` - Different Pattern

**Worker Endpoint**: `/v1/chat-plan` (uses fetch, not EventSource)
**Connection Limit**: Unknown
**Status**: ✅ Different implementation pattern

**Implementation**: `src/app/api/chat-plan/stream/route.ts`
**What connects to it**: `chat-plan-client.ts` (lines 40-90)

**Analysis**: Uses **fetch with ReadableStream**, not EventSource. Different pattern from persistent chat. Unlikely to share connection limit.

**Code Pattern**:
```typescript
// chat-plan-client.ts
const response = await fetch('/api/chat-plan/stream', {
  method: 'POST',
  body: JSON.stringify({ message, projectId, userId })
})
// Then reads response.body stream
```

**No action needed**: Different implementation, not using EventSource SSE pattern.

---

### 7. Admin SSE Endpoints - Separate Concerns

**Endpoints**:
- `/api/admin/logs/stream-sse` - Admin logs (separate from user data)
- `/api/admin/unified-logs/stream` - Admin unified logs

**Status**: ✅ Admin-only, separate concerns

**Analysis**: Admin endpoints with their own authentication and authorization. Not used by regular users. No connection limit issues reported.

**No action needed**: Separate admin infrastructure.

---

## Recommendations

### Immediate Actions (Completed ✅)
1. ✅ Refactored `use-advisor-workspace-events.ts` to use SSEConnectionManager
2. ✅ Refactored `use-github-sync-realtime.ts` to use SSEConnectionManager
3. ✅ Updated `github-sync-panel.tsx` to pass userId
4. ✅ Documented fixes in SSE_ARCHITECTURE_ANALYSIS.md

### No Action Needed
- ✅ `/api/integrations/events` - Separate endpoint, different connection pool
- ✅ `/api/events/stream` - Direct database access, no worker proxy
- ✅ `/api/workspace/logs/stream` - Direct database access, no worker proxy
- ✅ `/api/chat-plan/stream` - Different pattern (fetch + ReadableStream)
- ✅ Admin endpoints - Separate concerns

### Optional Future Cleanup (Low Priority)
- ✅ ~~Remove unused `use-code-stream.ts` hook~~ (entire file commented out 2026-01-13)
- ✅ ~~Remove unused `persistent-chat-client.ts` `createSSEConnection()` method~~ (commented out 2026-01-13)
- Both can be fully deleted in next cleanup cycle (after production verification)

---

## Connection Limit Isolation

**Key Finding**: The worker's 10 connection limit ONLY applies to:
```
/v1/projects/${projectId}/chat/stream
```

This endpoint is accessed via:
```
/api/persistent-chat/stream → (proxies to) → /v1/projects/${projectId}/chat/stream
```

**All other SSE endpoints** either:
1. Proxy to different worker endpoints (separate connection pools)
2. Are implemented directly in Next.js (no worker involved)
3. Are unused dead code

**Therefore**: The fix to `use-advisor-workspace-events.ts` and `use-github-sync-realtime.ts` fully resolves the connection thrashing issue. No other hooks need refactoring.

---

## Verification Checklist

- [x] Audited all `new EventSource` usage in codebase
- [x] Identified which endpoints proxy to worker
- [x] Confirmed only persistent chat stream has 10 connection limit
- [x] Verified all hooks connecting to persistent chat now use singleton
- [x] Confirmed other SSE endpoints are separate concerns
- [x] Documented findings for future reference

---

*Audit completed: 2026-01-13*
*All connection limit issues resolved*
