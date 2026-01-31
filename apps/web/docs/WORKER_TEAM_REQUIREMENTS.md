# Worker Team Requirements - Outstanding Items

*Based on BUILDER_ACTIONABLE_PLAN.md - Items pending worker microservice implementation*  
*Updated: August 2025*

## ✅ COMPLETED BY WORKER TEAM
- **HMAC Signature Verification**: ✅ Full dual signature rollout implementation complete
- **Anti-Replay Protection**: ✅ Nonce validation with Redis cache implemented
- **Monitoring & Debugging**: ✅ Comprehensive rollout tracking and security alerts

---

## 🔴 HIGH PRIORITY (Phase 4 - Week 4)

### 1. **Idempotency Support** 
**Goal**: Prevent duplicate builds from double-clicks or retry logic

**Implementation Required**:
- Accept `Idempotency-Key` header on all POST/PUT/PATCH endpoints
- Store processed keys in Redis with 24hr TTL
- Return cached response (same status + body) for duplicate keys
- Log idempotency hits with original `x-request-id` for debugging

**Affected Endpoints**:
- `POST /v1/builds` - Build creation
- `PUT/PATCH /v1/projects/{id}` - Project updates  
- `POST /v1/credits/reserve` - Credit operations
- Any other mutating operations

**Example Implementation**:
```typescript
// Header: Idempotency-Key: ${buildId}:create:${sessionId}
// Redis key: idempotency:${hash(key)}
// Value: { statusCode: 200, body: {...}, timestamp: "..." }
```

---

### 2. **Build State Machine Enforcement**
**Goal**: Prevent invalid build state transitions and concurrent builds

**Implementation Required**:
- **Valid Transitions**: `queued → building → (deployed|failed)`
- **Database Constraints**: Add state transition validation
- **Concurrent Build Prevention**: Max 1 active build per project (unless flagged)
- **State Validation**: Reject invalid state change requests

**Database Schema Updates**:
```sql
ALTER TABLE builds ADD CONSTRAINT valid_build_transitions 
CHECK (
  (previous_state = 'queued' AND current_state IN ('building', 'cancelled')) OR
  (previous_state = 'building' AND current_state IN ('deployed', 'failed', 'cancelled')) OR
  (previous_state IS NULL AND current_state = 'queued')
);

-- Index for concurrent build prevention
CREATE UNIQUE INDEX idx_one_active_build_per_project 
ON builds (project_id) 
WHERE current_state IN ('queued', 'building');
```

**API Changes**:
- Return `409 Conflict` for invalid state transitions
- Return `429 Too Many Requests` for concurrent build attempts
- Include current state in all build response objects

---

## 🟡 MEDIUM PRIORITY (Week 3-4)

### 3. **Credit Reservation System**
**Goal**: Reserve credits before build, commit/release on completion

**Endpoints to Implement**:
```typescript
// Reserve credits before build starts
POST /v1/credits/reserve
{
  "buildId": "build_123",
  "estimatedCredits": 150,
  "userId": "user_456",
  "idempotencyKey": "reserve_build_123_session_abc"
}
Response: { "reservationId": "res_789", "reserved": 150, "expires": "2024-01-15T10:40:00Z" }

// Commit actual usage (release unused)
POST /v1/credits/commit  
{
  "reservationId": "res_789",
  "actualCredits": 120,
  "buildId": "build_123"
}
Response: { "charged": 120, "refunded": 30, "newBalance": 450 }

// Release unused reservation (build failed/cancelled)
POST /v1/credits/release
{
  "reservationId": "res_789", 
  "reason": "build_failed"
}
Response: { "released": 150, "newBalance": 580 }
```

**Requirements**:
- All operations must be idempotent
- Reservations expire after 30 minutes
- Automatic cleanup of expired reservations
- Audit trail for all credit operations

---

### 4. **Enhanced Error Responses** 
**Goal**: Provide actionable error information with upgrade recommendations

**Standard Error Format**:
```json
{
  "error": "INSUFFICIENT_CREDITS",
  "message": "User requires 150 more credits",
  "data": {
    "required": 500,
    "available": 350,
    "recommendation": {
      "package": "pro", 
      "cost": 29.99,
      "credits": 1000,
      "savings": "Best value - 2x credits"
    }
  },
  "requestId": "req_xyz",
  "correlationId": "nextjs_1735689600000_a1b2c3d4", 
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Enhanced Error Codes**:
- `INSUFFICIENT_CREDITS` - Include recommendation object
- `BUILD_ALREADY_RUNNING` - Include ETA for completion
- `INVALID_STATE_TRANSITION` - Include valid next states
- `RATE_LIMITED` - Include retry-after and current usage

---

### 5. **Metrics Endpoints**
**Goal**: Expose operational metrics for monitoring dashboards

**Implementation Required**:
```typescript
// Prometheus-compatible metrics endpoint
GET /metrics
Response: text/plain (Prometheus format)

// Key metrics to expose:
- build_queue_depth (gauge) - Current builds in queue
- active_builds_total (gauge) - Currently processing builds  
- build_completion_rate (histogram) - Build duration distribution
- build_success_rate (counter) - Successful vs failed builds
- credit_usage_total (counter) - Credits consumed by operation type
- api_request_duration (histogram) - Request latency by endpoint
- worker_memory_usage (gauge) - Current memory consumption
- worker_cpu_usage (gauge) - Current CPU utilization
```

**Operational Dashboards**:
- Real-time build queue status
- Success/failure rates by time period  
- Credit consumption patterns
- System resource utilization
- Error rate monitoring by endpoint

---

## 🔵 NICE TO HAVE (Future Versions)

### 6. **Bulk Operations**
- `POST /v1/builds/batch` - Start multiple builds atomically
- `GET /v1/projects/batch?ids=1,2,3` - Fetch multiple projects
- All with full idempotency support

### 7. **Event Replay & Recovery**
- `POST /v1/builds/{buildId}/replay` - Replay events from specific point
- Useful for debugging failed builds and data recovery

### 8. **Cost Estimation**
- `POST /v1/estimate` - Estimate credits before actual operation
- Help users understand costs upfront

### 9. **Build Analytics**
- `GET /v1/analytics/builds` - Build patterns, popular features
- `GET /v1/analytics/usage` - Credit usage trends by user segment

---

## 🔧 INTEGRATION NOTES

### Request/Response Headers
All responses should include:
```
x-request-id: req_xyz (from NextJS middleware)
x-correlation-id: nextjs_1735689600000_a1b2c3d4 (from NextJS)
x-worker-version: 2.3.1
x-processing-time-ms: 245
```

### Error Handling
- Always include `requestId` and `correlationId` in error responses
- Use consistent HTTP status codes (400, 409, 422, 429, 500)
- Provide actionable error messages with next steps

### Security
- ✅ HMAC v2 signatures validated (COMPLETED)
- ✅ Anti-replay protection active (COMPLETED)
- Validate all input parameters and sanitize user data
- Rate limiting per user/IP with proper Retry-After headers

---

## 📊 SUCCESS METRICS

### Week 4 Completion Criteria:
- [ ] Zero duplicate builds (idempotency working)
- [ ] Build state machine preventing invalid transitions  
- [ ] Credit reservation system handling build failures gracefully
- [ ] Enhanced error responses with upgrade recommendations
- [ ] Metrics endpoint available for monitoring setup

### Performance Targets:
- P95 API response time < 200ms for all endpoints
- Build queue processing < 30 seconds from submit to start
- Credit operations < 100ms (reserve/commit/release)
- Zero data inconsistency in credit accounting
- 99.9% uptime for build pipeline

---

*This document tracks outstanding worker team requirements. HMAC signature verification is complete and deployed.*  
*Next review: After Phase 4 implementation*