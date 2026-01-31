# Horizontal Scaling Notes

> **Purpose**: Track all components that need attention when horizontally scaling the SheenApps Easy Mode infrastructure. This is a living document - add items as they're discovered.

---

## Current State

As of 2026-01-12, the Easy Mode API Gateway (`sheenapps-claude-worker`) runs as a **single instance**. Many components use in-memory state that works fine for single-instance but will need migration for horizontal scaling.

---

## Components Requiring Migration

### 1. Rate Limiting (P1)

**File**: `sheenapps-claude-worker/src/services/inhouse/InhouseGatewayService.ts`

**Current Implementation**:
```typescript
const rateLimitWindows = new Map<string, { count: number; windowStart: number }>()
```

**Problem**: Each instance has its own rate limit counters. A user hitting 3 instances gets 3x the rate limit.

**Solution Options**:
| Option | Latency | Cost | Complexity |
|--------|---------|------|------------|
| **Upstash Redis** | +1-3ms | ~$10/mo | Low |
| Cloudflare Durable Objects | +5-10ms | Usage-based | Medium |
| Database (with caching) | +5-20ms | $0 (existing) | Medium |

**Recommended**: Upstash Redis - purpose-built for this, minimal latency, simple API.

**Migration Steps**:
1. Add Upstash Redis dependency
2. Replace `Map` with Redis `INCR` + `EXPIRE`
3. Handle Redis connection errors (fail open vs closed - decide based on threat model)

---

### 2. Table Metadata Cache (P2)

**File**: `sheenapps-claude-worker/src/services/inhouse/InhouseGatewayService.ts`

**Current Implementation**:
```typescript
const tableMetadataCache = new Map<string, { metadata: Map<string, TableMetadata>, expiresAt: number }>()
const METADATA_CACHE_TTL_MS = 60_000 // 1 minute

// Periodic cleanup every 5 minutes
setInterval(cleanupStaleMetadataCacheEntries, 5 * 60 * 1000)
```

**Status**: ✅ Memory leak fixed with periodic cleanup (like rate limiting).

**Problem**: Cache is per-instance. After schema changes, some instances serve stale metadata until TTL expires.

**Impact**: Low - 1 minute staleness is acceptable for schema metadata. Users don't change schemas frequently.

**Solution Options**:
| Option | Notes |
|--------|-------|
| **Accept current behavior** | 1 min staleness is fine for MVP |
| Redis cache | Shared cache, can invalidate on schema change |
| Reduce TTL to 30s | More DB queries but fresher data |
| Pub/sub invalidation | Complex but immediate consistency |

**Recommended**: Accept current behavior for Phase 1. Consider Redis cache if schema changes become frequent.

---

### 3. Database Connection Pooling (P1)

**File**: `sheenapps-claude-worker/src/services/database.ts` (assumed)

**Current State**: Unknown - needs audit.

**Considerations**:
- Neon has connection limits per project
- Each instance opening N connections = total connections = instances × N
- Neon's serverless driver handles this better than traditional pg

**Action Items**:
- [ ] Audit current connection handling
- [ ] Verify using Neon's serverless driver (HTTP-based, no persistent connections)
- [ ] If using traditional pg, implement connection pooling (PgBouncer or Hyperdrive)

---

## Components That Are Already Horizontally Safe

### API Key Validation
- Stateless - queries database on each request
- No caching issues

### Query Execution
- Stateless - generates SQL and executes
- Database handles concurrency

### Quota Checking
- Database is source of truth
- Atomic updates with `UPDATE ... WHERE`
- Daily reset is idempotent

### Request Logging
- Fire-and-forget inserts
- No ordering guarantees needed

---

## Future Considerations

### WebSocket/Real-time Subscriptions (Phase 2+)
If we add real-time database subscriptions:
- Need sticky sessions OR
- Redis pub/sub for cross-instance broadcast OR
- Cloudflare Durable Objects per-project

### Session State (Phase 2+)
If we add server-side sessions for user app auth:
- Store in database (simple, slower)
- Store in Redis (fast, another dependency)
- Use stateless JWTs (no server state needed)

### Build Queue (Phase 2+)
If builds become long-running:
- Need distributed job queue
- Options: BullMQ (Redis), Cloudflare Queues, database-backed queue

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-12 | Keep in-memory rate limiting with TTL cleanup | Single instance for now; Redis when scaling |
| 2026-01-12 | Accept 1-min metadata cache staleness | Acceptable for schema data; not user-facing |

---

## Monitoring Checklist

Before horizontal scaling, ensure monitoring for:

- [ ] Rate limit effectiveness (are users exceeding limits?)
- [ ] Cache hit rates (is metadata cache useful?)
- [ ] Database connection count (approaching limits?)
- [ ] Memory usage per instance (are Maps growing?)
- [ ] Request distribution across instances (even load?)

---

## Quick Reference: Migration Priority

| Component | Priority | Trigger to Migrate |
|-----------|----------|-------------------|
| Rate Limiting | P1 | When adding 2nd instance |
| DB Connection Pooling | P1 | When adding 2nd instance |
| Metadata Cache | P2 | If schema staleness causes issues |
| (Future) Sessions | P1 | When implementing auth |
| (Future) Real-time | P1 | When implementing subscriptions |

---

*Last updated: 2026-01-12*
