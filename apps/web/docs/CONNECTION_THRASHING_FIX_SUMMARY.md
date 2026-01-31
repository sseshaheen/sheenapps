# Connection Thrashing Fix - Implementation Summary

**Date**: 2026-01-13 (Evening)
**Issue**: Rapid view switching caused 429 errors due to duplicate SSE connections (11/10 limit exceeded)

---

## Problem Analysis

### Symptoms
- Rapid switching between Preview and Code views triggered 429 errors
- Logs showed 11 connections when max is 10
- All connections displayed `clientInstanceId: undefined`
- Connection ID `69facc89` was removed/evicted 4 times
- URLs contained `_t` timestamps and `user_id` params (not added by SSEConnectionManager)

### Root Cause
Found **4 different places** creating SSE connections:
1. ❌ `use-advisor-workspace-events.ts` - Created raw EventSource bypassing singleton
2. ❌ `use-github-sync-realtime.ts` - Created raw EventSource bypassing singleton
3. ✅ `sse-connection-manager.ts` - Correct singleton pattern
4. ⚠️ `persistent-chat-client.ts` - Legacy `createSSEConnection()` method (unused, dead code)

**Why It Failed**:
- Each component mount created a new EventSource object
- Rapid view switching → mount/unmount/mount cycles
- Browser EventSource close is async → new connection created before old one cleaned up
- No coordination between tabs → each tab created separate connections
- **Result**: 11 connections when limit is 10

---

## Solution Implemented

### Strategy
Refactor all hooks to use `SSEConnectionManager` singleton with reference counting pattern.

### Key Changes

#### 1. Refactored `use-advisor-workspace-events.ts`

**Before** (lines 106-120):
```typescript
// ❌ Creates NEW EventSource on every mount
const params = new URLSearchParams({
  project_id: projectId,
  _t: Date.now().toString() // Cache busting
})
if (userId) {
  params.set('user_id', userId)
}
const url = `/api/persistent-chat/stream?${params.toString()}`
const eventSource = new EventSource(url)
eventSourceRef.current = eventSource
```

**After**:
```typescript
// ✅ Uses singleton manager
const manager = SSEConnectionManager.getInstance(projectId, userId)
manager.addRef() // Reference counting

manager.connect({
  projectId,
  userId,
  onMessage: handleMessage, // Filter for advisor.workspace_ready events
  onStatusChange: handleStatusChange
})

// Cleanup with ref counting
return () => {
  if (didReleaseRef.current) return
  didReleaseRef.current = true
  manager.releaseRef() // Only disconnects when last ref released
}
```

#### 2. Refactored `use-github-sync-realtime.ts`

**Before** (lines 58-118):
```typescript
// ❌ Created raw EventSource with custom reconnect logic
const url = new URL('/api/persistent-chat/stream', window.location.origin)
url.searchParams.set('project_id', projectId)
url.searchParams.set('include_github_events', 'true')
const eventSource = new EventSource(url.toString())

// Custom exponential backoff reconnect logic
eventSource.onerror = (error) => {
  if (shouldConnect && reconnectAttempts.current < maxReconnectAttempts) {
    scheduleReconnect() // Custom retry logic
  }
}
```

**After**:
```typescript
// ✅ Uses singleton manager (built-in reconnect logic)
const manager = SSEConnectionManager.getInstance(projectId, userId!)
manager.addRef()

manager.connect({
  projectId,
  userId: userId!,
  onMessage: handleMessage, // Filter for github-sync events
  onStatusChange: handleStatusChange // Manager handles reconnects
})

// Cleanup
return () => {
  if (didReleaseRef.current) return
  didReleaseRef.current = true
  manager.releaseRef()
}
```

**Additional changes**:
- Added `userId` parameter to hook signature
- Updated helper hooks `useGitHubSyncConnection` and `useGitHubSyncStatus` to accept userId
- Removed custom reconnect logic (manager handles it)

#### 3. Updated `github-sync-panel.tsx`

Added user context to pass userId to hook:

```typescript
import { useAuthStore } from '@/store'

export function GitHubSyncPanel({ projectId }: GitHubSyncPanelProps) {
  const { user } = useAuthStore() // ✅ Get user from auth store

  const {
    isConnected: isRealtimeConnected,
    latestOperation,
    recentOperations
  } = useGitHubSyncStatus(projectId, user?.id) // ✅ Pass userId
```

---

## Benefits of the Fix

### 1. Reference Counting Pattern
```typescript
// Multiple components can safely mount/unmount
Component A mounts → manager.addRef() // refCount = 1, creates EventSource
Component B mounts → manager.addRef() // refCount = 2, reuses EventSource
Component A unmounts → manager.releaseRef() // refCount = 1, keeps EventSource
Component B unmounts → manager.releaseRef() // refCount = 0, closes EventSource
```

### 2. Leader-Tab Coordination
- Only ONE SSE connection per (projectId, userId) across ALL tabs
- Leader tab holds actual EventSource
- Follower tabs receive events via BroadcastChannel
- Automatic failover if leader tab closes

### 3. Built-in Resilience
- Exponential backoff retry logic
- Heartbeat + timeout for crash detection
- Web Locks API with localStorage fallback
- Split-brain prevention

---

## Files Modified

| File | Type | Description |
|------|------|-------------|
| `sheenappsai/src/hooks/use-advisor-workspace-events.ts` | Complete Rewrite | Refactored to use SSEConnectionManager singleton |
| `sheenappsai/src/hooks/use-github-sync-realtime.ts` | Complete Rewrite | Refactored to use SSEConnectionManager singleton, added userId param |
| `sheenappsai/src/components/builder/github/github-sync-panel.tsx` | Updated | Added user context, pass userId to hook |
| `docs/SSE_ARCHITECTURE_ANALYSIS.md` | Documentation | Added "Connection Thrashing Fix" section |

---

## Testing Verification

### Manual Testing Checklist
- [ ] Rapid view switching (Preview ↔ Code) no longer creates duplicate connections
- [ ] All connections show `client_instance_id` in worker logs
- [ ] Connection count stays at 1 per (project, user, browser instance)
- [ ] No more 429 "CONNECTION_LIMIT_REACHED" errors
- [ ] Advisor workspace events still received correctly (test with match flow)
- [ ] GitHub sync events still received correctly (test with sync operation)
- [ ] Multiple tabs only create one connection (test leader-follower pattern)
- [ ] Tab crash/close triggers proper failover to another tab

### Automated Testing
- ✅ TypeScript compilation passes (`npx tsc --noEmit`)
- ✅ No type errors introduced
- ✅ All imports resolved correctly

---

## Implementation Notes

### Dead Code Removed
- ✅ `persistent-chat-client.ts` `createSSEConnection()` method commented out with @deprecated notice
- ✅ `use-code-stream.ts` entire file commented out with @deprecated notice
- Grep confirmed both were never imported or used anywhere
- Added clear migration instructions in JSDoc for future reference
- Both safe to fully delete in next cleanup cycle (after production verification)

### Event Filtering Pattern
Each hook filters events by type in `onMessage` callback:

```typescript
const handleMessage = useCallback((payload: EventPayload) => {
  // Only handle specific event type
  if (payload.data?.event !== 'advisor.workspace_ready') return

  // Process event...
}, [dependencies])
```

This allows multiple hooks to share one SSE connection without interference.

### Backwards Compatibility
- Made `userId` optional in hook signatures (`userId?: string`)
- Hooks gracefully handle missing userId (just won't connect)
- Existing code without userId continues to work (just no real-time updates)

---

## Next Steps

1. **Test in staging environment**:
   - Verify rapid view switching doesn't cause 429s
   - Monitor worker logs for connection count
   - Test with multiple tabs open

2. **Monitor production metrics**:
   - Track 429 error rates
   - Monitor SSE connection count per user
   - Verify advisor/GitHub events still working

3. **Optional cleanup** (low priority):
   - Remove unused `createSSEConnection()` from `persistent-chat-client.ts`
   - Add deprecation warning if kept for backwards compatibility

---

## Related Documentation

- `/Users/sh/Sites/sheenapps/docs/SSE_ARCHITECTURE_ANALYSIS.md` - Full architecture and all fixes
- `/Users/sh/Sites/sheenapps/sheenappsai/src/services/sse-connection-manager.ts` - Singleton implementation
- `/Users/sh/Sites/sheenapps/sheenappsai/src/hooks/use-persistent-live.ts` - Reference implementation (correct pattern)

---

## Reconnect Button Fix (2026-01-13 Late Evening)

### Additional Issue Found
User reported clicking "وصّل تاني" (reconnect) button did nothing.

### Root Cause
The `forceReconnect()` method only worked for **leader tabs**:
```typescript
// Before (broken):
forceReconnect(): void {
  if (this.isLeader) {  // ❌ Follower tabs ignored
    // reconnect...
  }
}
```

In the leader-follower pattern, when a follower tab user clicked reconnect, nothing happened because they weren't the leader.

### Fix Applied
Modified `forceReconnect()` to handle both leader and follower tabs:
```typescript
// After (fixed):
forceReconnect(): void {
  if (this.isLeader) {
    // Leader: reconnect directly
    this.retryCount = 0
    this.eventSource?.close()
    this.eventSource = null
    this.connectEventSource()
  } else {
    // Follower: attempt to acquire leadership
    this.acquireLeadership().catch(err => {
      console.warn('[SSE] Failed to acquire leadership for reconnection:', err)
    })
  }
}
```

**How it works**:
- Leader tab → reconnects immediately (existing behavior)
- Follower tab → attempts to become leader, which triggers connection

### Files Modified
| File | Changes |
|------|---------|
| `src/services/sse-connection-manager.ts` | Updated `forceReconnect()` to handle follower tabs (lines 577-598) |
| `docs/SSE_ARCHITECTURE_ANALYSIS.md` | Documented reconnect button fix |

---

*Fix completed: 2026-01-13 (late evening)*
*Ready for staging/production testing*
