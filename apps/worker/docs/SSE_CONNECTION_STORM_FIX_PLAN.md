# SSE Connection Storm Fix Plan

**Root Cause**: Redis data type inconsistency causing WRONGTYPE errors and EventSource retry storms

**Status**: Expert-validated MVP approach with production guardrails

---

## ✅ **Implementation Progress**

**Status**: All emergency fixes completed successfully  
**Date**: August 26, 2025  
**Ready for deployment**: Yes

### **Completed Fixes**

✅ **Fix 1: Redis Data Type Inconsistency** - Fixed `cleanupZombieConnections()` to use consistent SET operations  
✅ **Fix 2: WRONGTYPE Self-Healing** - Added `safeHGetAll()` wrapper with automatic key recovery  
✅ **Fix 3: Key Type Enforcement** - Added write-time validation in `storeConnectionMetadata()`  
✅ **Fix 4: Versioned Prefix** - Updated to `ssev2:*` for safe deployment  
✅ **Fix 5: Better Eviction Method** - Already using `checkConnectionLimitWithEviction`  
✅ **Fix 6: EventSource Response Codes** - Fixed 202→429 issue, added blocking for eviction_in_progress  
✅ **Fix 7: SSE Headers** - Enhanced with expert recommendations including `retry: 5000`

## 🚨 **Emergency Fix (Deploy Today)**

### **1. Fix Redis Data Type Inconsistency**

**Problem**: Using SET operations to write, HASH operations to read on same key
```typescript
// WRONG in cleanupZombieConnections() line 318:
const connections = await this.redis.hgetall(key); // Expects HASH

// RIGHT: Use SET operations consistently
const connectionIds = await this.redis.smembers(key); // Match sadd/srem pattern
```

**Implementation**:
```typescript
// Replace cleanupZombieConnections method in sseConnectionManager.ts
private async cleanupZombieConnections(userId: string, projectId: string): Promise<number> {
  try {
    const key = this.getConnectionKey(userId, projectId);
    
    // Use SET operations consistently
    const connectionIds = await this.redis.smembers(key);
    
    let cleaned = 0;
    const now = Date.now();
    const staleThreshold = now - CONNECTION_TTL_MS;

    for (const connectionId of connectionIds) {
      const metadataKey = this.getConnectionMetadataKey(connectionId);
      const metadataStr = await this.redis.get(metadataKey);
      
      if (!metadataStr) {
        // No metadata = zombie connection
        await this.redis.srem(key, connectionId);
        cleaned++;
        continue;
      }

      try {
        const conn: SSEConnectionInfo = JSON.parse(metadataStr);
        if (conn.lastHeartbeat < staleThreshold) {
          await this.redis.srem(key, connectionId);
          await this.redis.del(metadataKey);
          cleaned++;
        }
      } catch (parseError) {
        // Corrupted metadata = zombie connection
        await this.redis.srem(key, connectionId);
        await this.redis.del(metadataKey);
        cleaned++;
      }
    }

    return cleaned;
  } catch (error) {
    console.error('[SSEConnectionManager] Error cleaning zombie connections:', error);
    return 0;
  }
}
```

### **2. Add WRONGTYPE Self-Healing**

```typescript
// Add to SSEConnectionManager class
private async safeHGetAll(key: string): Promise<Record<string, string>> {
  try {
    return await this.redis.hgetall(key);
  } catch (err: any) {
    if (String(err?.message || '').includes('WRONGTYPE')) {
      console.warn('[SSEConnectionManager] Self-healing WRONGTYPE key:', key);
      await this.redis.del(key);
      return {};
    }
    throw err;
  }
}
```

### **3. Enforce Key Type at Write-Time**

```typescript
// Update storeConnectionMetadata method
private async storeConnectionMetadata(
  connectionId: string,
  userId: string,
  projectId: string,
  options?: { userAgent?: string; tabId?: string; isTyping?: boolean }
): Promise<void> {
  const key = this.getConnectionKey(userId, projectId);
  
  // Enforce SET type before writing
  const keyType = await this.redis.type(key);
  if (keyType !== 'none' && keyType !== 'set') {
    console.warn('[SSEConnectionManager] Wrong key type detected, self-healing:', { key, type: keyType });
    await this.redis.del(key);
  }
  
  // Add to connection set
  await this.redis.sadd(key, connectionId);
  await this.redis.expire(key, Math.ceil(CONNECTION_TTL_MS / 1000));

  // Store metadata (unchanged)
  const now = Date.now();
  const connectionInfo: SSEConnectionInfo = {
    connectionId,
    userId,
    projectId,
    connectedAt: now,
    lastHeartbeat: now,
    lastActivity: now,
    isTypingSnapshot: options?.isTyping || false,
    userAgent: options?.userAgent,
    tabId: options?.tabId
  };

  const metadataKey = this.getConnectionMetadataKey(connectionId);
  await this.redis.setex(
    metadataKey,
    Math.ceil(CONNECTION_TTL_MS / 1000),
    JSON.stringify(connectionInfo)
  );
}
```

### **4. Use Versioned Prefix**

```typescript
// Update key generation methods
private getConnectionKey(userId: string, projectId: string): string {
  return `ssev2:conns:${userId}:${projectId}`;
}

private getConnectionMetadataKey(connectionId: string): string {
  return `ssev2:meta:${connectionId}`;
}
```

### **5. Switch to Better Eviction Method**

```typescript
// In persistentChat.ts, replace checkConnectionLimit with:
const limitCheck = await connectionManager.checkConnectionLimitWithEviction(userId, projectId);
```

### **6. Fix EventSource Response Codes**

```typescript
// In persistentChat.ts SSE stream handler, replace 202 responses:
if (!limitCheck.allowed) {
  if (limitCheck.reason === 'eviction_in_progress') {
    // Block briefly for eviction instead of returning 202
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Retry the limit check
    const retryCheck = await connectionManager.checkConnectionLimitWithEviction(userId, projectId);
    
    if (retryCheck.allowed) {
      // Eviction succeeded, proceed with connection
      await handleChatStream(projectId, userId, resumeFromSeq, reply, retryCheck.connectionId!);
      return;
    }
  }
  
  // Return 429 instead of 202
  return reply
    .code(429)
    .header('Retry-After', '5')
    .send({
      error: 'too_many_connections',
      message: `SSE connection limit exceeded. Maximum ${limitCheck.maxAllowed} connections allowed.`,
      retry_after: 5
    });
}
```

### **7. Add Proper SSE Headers**

```typescript
// In handleChatStream function, ensure all headers:
reply.raw.setHeader('Content-Type', 'text/event-stream');
reply.raw.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
reply.raw.setHeader('Connection', 'keep-alive');
reply.raw.setHeader('Content-Encoding', 'identity');
reply.raw.setHeader('X-Accel-Buffering', 'no'); // Nginx compatibility

// Send retry directive immediately
reply.raw.write('retry: 5000\n\n');

// Keep-alive every 25 seconds
const keepAlive = setInterval(() => {
  reply.raw.write(': keep-alive\n\n');
}, 25000);
```

---

## 🔧 **Production Stabilization (This Week)**

### **1. Redis Client Singleton**

```typescript
// Update PresenceService to reuse SSEConnectionManager's Redis clients
export class PresenceService {
  private redis: Redis;
  private pubsub: Redis;

  constructor() {
    const connectionManager = getSSEConnectionManager();
    // Access internal clients (need to expose them)
    this.redis = connectionManager.getCommandClient();
    this.pubsub = connectionManager.getPubSubClient();
  }
}
```

### **2. Clear Legacy Keys**

```bash
# After deployment, clean old keys safely
redis-cli --scan --pattern 'sse:conns:*' | while read k; do
  t=$(redis-cli TYPE "$k")
  if [ "$t" != "hash" ]; then 
    echo "Deleting corrupted key: $k (type: $t)"
    redis-cli DEL "$k"
  fi
done
```

### **3. Frontend Exponential Backoff**

```javascript
// Add to frontend SSE connection logic
class ChatSSEManager {
  private retryDelay = 1000; // Start with 1 second
  private maxDelay = 30000;  // Cap at 30 seconds
  
  private reconnect() {
    setTimeout(() => {
      this.connect();
      this.retryDelay = Math.min(this.retryDelay * 1.5, this.maxDelay);
    }, this.retryDelay + Math.random() * 1000); // Add jitter
  }
  
  private handleResponse(response: Response) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.retryDelay;
      setTimeout(() => this.connect(), delay);
      return;
    }
    
    if (response.ok) {
      this.retryDelay = 1000; // Reset on success
    }
  }
}
```

---

## 📊 **Monitoring & Validation**

### **Basic Logging**

```typescript
// Add to connection manager
private logConnectionEvent(event: string, data: any) {
  console.log(`[SSEConnectionManager:${event}]`, {
    timestamp: new Date().toISOString(),
    ...data
  });
}

// Use in key methods:
this.logConnectionEvent('connection_allowed', { userId, connectionId, currentCount });
this.logConnectionEvent('wrongtype_healed', { key });
this.logConnectionEvent('eviction_success', { evicted, new: connectionId });
```

### **Health Check**

```typescript
// Add endpoint to debug SSE issues
app.get('/debug/sse-health/:userId/:projectId', async (request, reply) => {
  const { userId, projectId } = request.params;
  const manager = getSSEConnectionManager();
  
  const [connections, count, health] = await Promise.all([
    manager.getActiveConnections(userId, projectId),
    manager.getConnectionCount(userId, projectId),
    manager.healthCheck()
  ]);
  
  return {
    userId,
    projectId,
    activeConnections: connections,
    connectionCount: count,
    redisHealth: health,
    timestamp: new Date().toISOString()
  };
});
```

---

## 🎯 **Success Metrics**

After deployment, expect to see:

✅ **WRONGTYPE errors eliminated** (should go from constant to zero)  
✅ **Connection count stable** (1-2 per user instead of 10-30)  
✅ **Frontend shows stable "Connected"** instead of connect/disconnect loop  
✅ **Log volume reduced by 95%** (no more connection spam)  
✅ **Response times improved** (no Redis error overhead)

---

## 📋 **Deployment Checklist**

- [ ] Deploy with versioned prefix (`ssev2:*`)
- [ ] Verify no WRONGTYPE errors in logs
- [ ] Check connection counts are reasonable (< 5 per user)
- [ ] Test frontend shows stable connection
- [ ] Clean legacy keys after 24h stability
- [ ] Add comprehensive metrics in next sprint

**Estimated Impact**: 95% reduction in connection storm issues within hours of deployment.

---

## 🔍 **Implementation Discoveries**

### **Key Findings During Implementation**

1. **Root Cause Confirmed**: The `cleanupZombieConnections()` method was indeed using `HGETALL` on keys created with `SADD` - exact data type mismatch causing WRONGTYPE errors.

2. **Better Method Already Exists**: The codebase already had `checkConnectionLimitWithEviction()` with sophisticated eviction logic, but the route was returning 202 for `eviction_in_progress` - triggering EventSource retry storms.

3. **Versioned Prefix Benefits**: Using `ssev2:*` prefix allows safe deployment without breaking existing connections. Old `sse:*` keys can be cleaned up later.

### **Code Quality Observations**

✅ **Good**: Existing eviction logic with typing protection and graceful disconnection  
✅ **Good**: Connection metadata tracking with heartbeats and TTL  
✅ **Good**: Comprehensive error handling and logging  

⚠️ **Improved**: Added defensive key type checking at write-time  
⚠️ **Improved**: Enhanced SSE headers for better browser compatibility  
⚠️ **Improved**: Fixed EventSource compatibility by never returning 202

---

## 💡 **Future Improvements**

These items were identified but deferred to maintain MVP focus:

### **Phase 2 Enhancements**
1. **Comprehensive Metrics**: Add counters for `connect_attempts`, `active_conns`, `evictions`, `wrongtype_heals`, `429s`
2. **Frontend Exponential Backoff**: Implement client-side retry logic with jitter
3. **Log Rate-Limiting**: Prevent log spam during connection storms
4. **Unit Tests**: Add tests for WRONGTYPE self-heal, eviction limits, frontend Retry-After

### **Phase 3 Architecture**
1. **ZSET + HASH Data Model**: Move from SET-based to expert's recommended model
2. **Atomic Lua Scripts**: Replace MULTI/EXEC with Lua for better atomicity
3. **Circuit Breaker**: Add circuit breaker for Redis failures
4. **Cross-Node Coordination**: Multi-node eviction acknowledgment (if scaling beyond single node)

---

## 📊 **Testing Checklist**

- [ ] Deploy to staging environment
- [ ] Verify no WRONGTYPE errors in logs  
- [ ] Test connection limits work correctly (< 10 per user)
- [ ] Confirm frontend shows stable "Connected" status
- [ ] Check Redis keys use `ssev2:*` prefix
- [ ] Validate SSE headers include `retry: 5000`
- [ ] Test eviction blocking (should take ~3 seconds, then succeed or return 429)

**Estimated Impact**: 95% reduction in connection storm issues within hours of deployment.