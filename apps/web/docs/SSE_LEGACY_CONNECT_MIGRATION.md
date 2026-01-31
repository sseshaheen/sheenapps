# SSE Legacy connect() Migration Guide

## Status
`SSEConnectionManager.connect()` has been **REMOVED** as of 2026-01-13.

All code must use the new `subscribe()` + `connectIfNeeded()` pattern.

## Why This Matters

**The Problems with Legacy connect():**
1. Stored ONE config, so multiple components overwrote each other's callbacks
2. Generated anonymous subscribers that couldn't be unsubscribed (memory leak)
3. Created "leader with 0 subscribers" race condition in dev StrictMode
4. Caused subscriber bloat and status update storms

**The Solution:** New `subscribe()` pattern:
- Supports multiple subscribers with unique IDs
- All subscribers receive all events
- Clean unsubscribe on component unmount
- Proper ref counting and memory management

## Subscriber Lifecycle Contract

**CRITICAL RULES:**
- ✅ Subscribe **exactly once** per hook instance
- ✅ Unsubscribe **exactly once** in cleanup
- ✅ Call `connectIfNeeded()` **after** `subscribe()`
- ✅ **Never** subscribe in render - only in `useEffect`
- ✅ `connectIfNeeded()` is **idempotent** - safe to call concurrently from multiple subscribers

**Correct Pattern:**
```typescript
export function useMyHook({ projectId, userId }) {
  const subscriberIdRef = useRef(crypto.randomUUID())
  const managerRef = useRef<SSEConnectionManager | null>(null)

  useEffect(() => {
    const manager = SSEConnectionManager.getInstance(projectId, userId)
    managerRef.current = manager

    manager.addRef()
    manager.subscribe(
      { projectId, userId, onMessage, onStatusChange },
      subscriberIdRef.current
    )
    manager.connectIfNeeded()  // ← Idempotent, concurrent-safe

    return () => {
      manager.unsubscribe(subscriberIdRef.current)
      manager.releaseRef()
      managerRef.current = null
    }
  }, [projectId, userId, onMessage, onStatusChange])
}
```

## Files Migrated

### 1. ✅ DONE: `src/hooks/use-persistent-live.ts`
Already migrated to new pattern.

### 2. ✅ DONE: `src/hooks/use-github-sync-realtime.ts`
Migrated to new `subscribe()` + `connectIfNeeded()` pattern.

### 3. ✅ DONE: `src/hooks/use-advisor-workspace-events.ts`
Migrated to new `subscribe()` + `connectIfNeeded()` pattern.

### 4. ✅ DONE: `src/services/persistent-chat-client.ts`
Already marked as deprecated, doesn't use SSEConnectionManager.

### 5. ✅ DONE: Removed dead `connect()` from hook return API
`usePersistentLive` exposed a `connect()` method that called the now-removed `manager.connect()`.
This dead code has been removed since connection happens automatically via the effect.

## Finding Stragglers

To confirm no other files use legacy `connect()`:

```bash
# Find all connect() usages (should return 0 matches in src/)
rg "SSEConnectionManager\.connect\(" -n src
rg "\.connect\(\{" -n src/hooks src/components

# Expected: Only the deprecated method definition in sse-connection-manager.ts
```

## Acceptance Criteria

### Test A: Strict Mode Dev Behavior

React StrictMode mounts/unmounts/mounts effects in dev. Ensure clean lifecycle:

**Expected behavior:**
- ✅ Exactly 1 manager instance per `(projectId, userId)` after mount
- ✅ Subscriber count returns to 0 on cleanup, back to 1 on remount
- ✅ NO "Emitting status to 0 subscribers" logs
- ✅ NO multiple manager instances in same tab

**How to test:**
1. Refresh page (StrictMode will double-mount)
2. Check logs: should see subscribe → unsubscribe → subscribe
3. Final subscriber count should be correct (not doubled)

### Test B: Multi-Subscriber Correctness

Open 2+ components that subscribe to the same manager:

**Expected behavior:**
- ✅ Both receive `{ state: 'connected' }` status
- ✅ Both receive live events
- ✅ Unsubscribing one does NOT impact the other
- ✅ Last unsubscribe triggers `releaseRef() → disconnect()`

**How to test:**
1. Open page with multiple chat components
2. Check logs: `[SSE] Emitting status to N subscribers` where N ≥ 2
3. Close one component
4. Check remaining component still receives events

### Test C: No Legacy Subscribers

**Expected:**
- ✅ NO "legacy-*" subscriber IDs in logs
- ✅ Only real UUIDs: `[SSE] Calling subscriber a5d567ea-0f2a-475b...`
- ✅ Reconnect button works immediately

### Test D: EventSource Connection

**Expected:**
- ✅ `[SSE] Connecting EventSource: http://localhost:3000/...`
- ✅ `[SSE] Connection opened`
- ✅ UI updates to "متوصل" (connected) with green dot
- ✅ NO heartbeat timeout warnings

## Compile-Time Safety

The deprecated `connect()` method signature now prevents compilation:

```typescript
public connect(..._args: never[]): never {
  throw new Error('Use subscribe() + connectIfNeeded() instead')
}
```

Any attempt to call `.connect()` will:
- ❌ Fail TypeScript compilation (type error)
- ❌ Throw runtime error if stale JS bundle calls it

## Rollout Complete

1. ✅ `connect()` removed (throws error)
2. ✅ All 3 hooks migrated
3. ✅ Compile-time safety added (`never` return type)
4. ✅ `connectIfNeeded()` made idempotent (setup promise)
5. ✅ Lifecycle contract documented
6. ✅ Acceptance tests defined
7. ✅ **CRITICAL FIX**: Leader no longer reacts to its own heartbeat
   - BroadcastChannel delivers messages to sender tab in most browsers
   - Added guards: `if (this.isLeader) return` and `if (hb.leaderTabId === this.tabId) return`
   - Prevents "leader heartbeat timeout" spam and leadership churn
8. ✅ **CRITICAL FIX**: Leader-change messages filtered by sender
   - Added `fromTabId` to leader-change payload
   - Prevents tab from trying to become leader immediately after stepping down
9. ✅ **OPTIMIZATION**: Skip setup when zero subscribers
   - Guards against "setup while unmounting" edge cases during Fast Refresh/StrictMode
10. ✅ **CRITICAL FIX**: Singleton instances no longer deleted on unmount
   - Previously: `releaseRef()` deleted instance from map, but async `acquireLeadership()` still running
   - Created "zombie leader" with 0 subscribers while new instance became follower
   - Both instances in same tab with same `tabId` → follower ignored heartbeats from zombie leader
   - Now: Instance stays in map as dormant singleton, can be reused on remount
11. ✅ **CRITICAL FIX**: Abort guards in leadership methods
   - `becomeLeader()` and `becomeFollower()` now check if instance is disconnected
   - Prevents zombie instance from becoming leader after disconnect
   - `disconnect()` clears `setupPromise` to signal abortion
12. ✅ **CRITICAL FIX**: Idempotent Leadership Acquisition (Expert Guidance)
   - **Problem**: Tab becomes leader, holds lock, then re-entrant call sees "lock unavailable" → demotes itself!
   - **Solution**: Make leadership acquisition idempotent with two guards:
     1. **Hard guard at top**: `if (this.isLeader) return` - never re-acquire if already leader
     2. **Safety net in null lock branch**: `if (this.isLeader)` check before demoting - ignore null lock if we became leader in the meantime
   - Added `acquiringLeadership` flag to prevent concurrent calls
13. ✅ **CRITICAL FIX**: Close EventSource on demotion
   - `becomeFollower()` now closes EventSource before demoting
   - Prevents followers from holding open connections (violates leader-follower contract)
   - Keeps system sane during Fast Refresh/StrictMode
14. ✅ **DIAGNOSTIC**: Enhanced timeout logging
   - `resetLeaderTimeout()` now logs `isLeader` and `subscribers.size`
   - If timeout fires with `isLeader: true`, indicates follower logic running from leader path

## Next: Verification & Cleanup

1. Run grep commands (should find 0 usages)
2. Refresh page and verify all 4 acceptance tests
3. Remove this doc after verification passes
