# Backend Requirements: Integration Status System

## Overview
Create unified integration status API that aggregates Sanity/GitHub/Vercel/Supabase connections for workspace UI. Frontend will display `[🗃️ DB] [📦 Git] [🚀 Deploy] [📝 CMS]` status indicators with real-time updates.

## API Endpoints Required

### 1. GET /api/integrations/status
**Purpose**: Single endpoint returning all integration statuses for a project

**Request**:
```
GET /api/integrations/status?projectId={projectId}
Headers: If-None-Match: {hash} (optional, for performance)
```

**Response**:
```typescript
type IntegrationStatus = {
  key: 'sanity'|'github'|'vercel'|'supabase';
  status: 'connected'|'warning'|'error'|'disconnected';
  summary?: string;                     // "Linked to main · Last push 2m ago"
  updatedAt: string;                    // ISO timestamp
  stale?: boolean;                      // true if from cache/circuit breaker
  problem?: {
    code: 'oauth_revoked'|'rate_limited'|'timeout'|'unknown';
    hint?: string;                      // "Click to reconnect"
  };
  actions?: Array<{
    id: string;                         // "deploy", "push", "sync", "connect"
    label: string;                      // "Deploy", "Push", "Sync", "Connect"
    can: boolean;                       // User permission check
    reason?: string;                    // "OAuth expired" if can=false
  }>;
};

type StatusEnvelope = {
  projectId: string;
  items: IntegrationStatus[];
  hash: string;                         // For ETag caching
};
```

**Headers**:
```
ETag: {hash}
Cache-Control: no-store
```

**Performance Requirements**:
- Return 304 if `If-None-Match` matches current hash
- Each provider adapter: 2-3s timeout with circuit breaker
- Cache results 10-20s with jitter
- Emit stale data if provider unavailable

### 2. POST /api/integrations/actions
**Purpose**: Execute quick actions (deploy, push, sync, connect)

**Request**:
```
POST /api/integrations/actions
Headers: Idempotency-Key: {uuid}
Body: {
  projectId: string;
  provider: 'sanity'|'github'|'vercel'|'supabase';
  action: string;  // "deploy", "push", "sync", "connect"
  payload?: any;   // Action-specific data
}
```

**Response**:
```typescript
{
  success: boolean;
  operationId?: string;    // For tracking progress
  error?: string;
}
```

### 3. GET /api/integrations/events (SSE)
**Purpose**: Real-time integration status updates

**Stream Events**:
```typescript
type IntegrationEvent =
 | { type:'deploy:started', provider:'vercel', projectId:string, operationId:string, ts:number }
 | { type:'deploy:finished', provider:'vercel', projectId:string, success:boolean, url?:string, ts:number }
 | { type:'github:push', projectId:string, branch:string, sha:string, ts:number }
 | { type:'sanity:webhook', projectId:string, count:number, ts:number }
 | { type:'status:update', projectId:string, items:IntegrationStatus[], ts:number };
```

## Integration Adapters Required

### GitHub Adapter
**Status Logic**:
- `connected`: Repository linked, recent activity
- `warning`: Repository linked, no recent pushes (>7 days)
- `error`: Auth expired, repository access revoked
- `disconnected`: No repository configured

**Actions**: `["push", "pull", "sync", "connect"]`

**Summary Examples**:
- "Linked to main · Last push 2m ago"
- "Linked to main · No recent activity"

### Vercel Adapter
**Status Logic**:
- `connected`: Project linked, deployments exist
- `warning`: Project linked, no deployments yet
- `error`: Auth expired, project access revoked
- `disconnected`: No project linked

**Actions**: `["deploy", "link", "connect"]`

**Summary Examples**:
- "3 deployments this week · Live"
- "Linked · No deployments yet"

### Sanity Adapter
**Status Logic**:
- `connected`: Project connected, recent webhook activity
- `warning`: Connected, webhook issues
- `error`: Auth expired, project access issues
- `disconnected`: No project connected

**Actions**: `["sync", "open-studio", "connect"]`

**Summary Examples**:
- "5 docs updated today · Live sync"
- "Connected · Webhook inactive"

### Supabase Adapter
**Status Logic**:
- `connected`: Database connected, healthy
- `warning`: Connected, performance issues
- `error`: Auth expired, connection failed
- `disconnected`: No database connected

**Actions**: `["test-connection", "reconnect", "connect"]`

**Summary Examples**:
- "Database healthy · 12ms avg"
- "Connected · High latency"

## Security & Privacy Requirements

### Permission Handling
- Determine `can` flags server-side based on user roles
- Never expose actions user cannot perform
- Redact sensitive data (repo names, org info) based on permissions

### Error Handling
- Normalize all provider errors to standard codes
- OAuth revocation = `oauth_revoked` with "Click to reconnect" hint
- Rate limits = `rate_limited` with retry timing
- Network issues = `timeout` with "Try again" hint

### Data Privacy
- Redact repository names for users without repo access
- Hide organization details for non-members
- Only show deployment URLs user can access

## Performance Requirements

### Response Times
- Status endpoint: <500ms total (includes all 4 providers)
- Individual adapters: 2-3s timeout with circuit breaker
- Cache results: 10-20s TTL with random jitter

### Reliability
- Circuit breaker: Emit stale data if provider down
- Graceful degradation: Show partial status if some providers fail
- SSE resilience: Handle client disconnects, support Last-Event-ID

### Caching Strategy
```typescript
// Per-adapter caching
interface AdapterCache {
  ttl: number;           // 10-20s base
  jitter: boolean;       // Random +/-20%
  staleWhileRevalidate: boolean;
}

// Response caching
interface ResponseCache {
  etag: string;          // Hash of current status
  maxAge: 0;            // No client caching
  mustRevalidate: true;
}
```

## Rate Limiting

### Quick Actions
- 5 actions per minute per user/project
- Use existing idempotency patterns for POST requests
- Return progress via SSE events (`deploy:started`, `deploy:finished`)

### Status Polling
- Frontend polls every 10s (React Query)
- SSE provides real-time updates between polls
- ETag prevents unnecessary data transfer

## Implementation Notes

### Leverage Existing Infrastructure
- ✅ Use existing Supabase connection management
- ✅ Extend current GitHub sync status patterns
- ✅ Build on Sanity webhook infrastructure
- ✅ Enhance Vercel OAuth integration

### Error Response Format
```typescript
{
  error: {
    code: 'oauth_revoked' | 'rate_limited' | 'timeout' | 'unknown';
    message: string;
    hint?: string;        // Actionable guidance
    retryAfter?: number;  // For rate limits
  }
}
```

### Idempotency
- All POST actions require `Idempotency-Key` header
- Use existing idempotency infrastructure
- Return same result for duplicate requests within 24h

## Testing Requirements

### Unit Tests
- Each adapter handles provider failures gracefully
- Status normalization logic works correctly
- Permission filtering removes unauthorized data

### Integration Tests
- Full status aggregation under 500ms
- SSE events trigger UI updates correctly
- Circuit breakers activate during provider outages

### Performance Tests
- 100 concurrent status requests
- SSE connection limits and cleanup
- ETag cache hit rates >80%

## Monitoring & Telemetry

### Metrics to Track
- `integration_status_request_duration` (by provider)
- `integration_adapter_timeout_rate` (by provider)
- `integration_action_success_rate` (by provider, action)
- `integration_sse_connection_count`

### Health Checks
- Each adapter timeout/error rate <5%
- Status endpoint p95 <500ms
- SSE connection stability >99%

This unified system will surface your powerful integrations through simple, reliable status indicators while maintaining excellent performance and security.