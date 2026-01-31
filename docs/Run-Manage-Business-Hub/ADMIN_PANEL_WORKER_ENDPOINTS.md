# Run Hub Admin Panel - Required Worker Endpoints

**Created:** 2026-01-30
**Purpose:** Document the worker API endpoints required for the new Run Hub admin pages.

---

## Overview

Three new admin pages were added to provide visibility into Run Hub operations:

| Admin Page | Purpose |
|------------|---------|
| `/admin/inhouse/workflows` | Monitor and manage workflow runs across projects |
| `/admin/inhouse/business-events` | Explore business events used for KPI computation |
| `/admin/inhouse/kpi-health` | Monitor KPI rollup health and data freshness |

These pages call worker endpoints through the existing `/api/admin/inhouse/[...path]` proxy. The worker needs to implement the endpoints below.

---

## 1. Workflow Runs Admin Endpoints

### GET `/v1/admin/inhouse/workflow-runs`

List workflow runs across all projects.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | No | Filter by project |
| `status` | enum | No | `queued`, `running`, `succeeded`, `failed` |
| `actionId` | string | No | Filter by action type |
| `limit` | number | No | Max results (default 50) |
| `cursor` | string | No | Pagination cursor |

**Response:**
```json
{
  "ok": true,
  "data": {
    "runs": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "projectName": "My Store",
        "actionId": "recover_abandoned",
        "status": "succeeded",
        "idempotencyKey": "...",
        "requestedAt": "2026-01-30T10:00:00Z",
        "startedAt": "2026-01-30T10:00:01Z",
        "completedAt": "2026-01-30T10:00:05Z",
        "leaseExpiresAt": "2026-01-30T10:30:00Z",
        "attempts": 1,
        "maxAttempts": 3,
        "params": { "locale": "en" },
        "result": {
          "totalRecipients": 25,
          "successful": 24,
          "failed": 1
        },
        "outcome": {
          "model": "email_exact",
          "windowHours": 48,
          "conversions": 3,
          "revenueCents": 15000,
          "currency": "USD",
          "confidence": "high",
          "matchedBy": "email_exact"
        },
        "error": null
      }
    ],
    "nextCursor": "..."
  }
}
```

### GET `/v1/admin/inhouse/workflow-runs/stuck`

List workflow runs that are stuck (running with expired lease).

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | No | Filter by project |

**Response:**
```json
{
  "ok": true,
  "data": {
    "runs": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "projectName": "My Store",
        "actionId": "send_promo",
        "requestedAt": "2026-01-30T09:00:00Z",
        "leaseExpiresAt": "2026-01-30T09:30:00Z",
        "attempts": 2
      }
    ]
  }
}
```

### POST `/v1/admin/inhouse/workflow-runs/:id/retry`

Retry a failed or stuck workflow run.

**Request Body:**
```json
{
  "reason": "Manual retry by admin after investigating error"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "newRunId": "uuid",
    "status": "queued"
  }
}
```

### POST `/v1/admin/inhouse/workflow-runs/:id/cancel`

Cancel a queued or running workflow run.

**Request Body:**
```json
{
  "reason": "Customer requested cancellation"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "status": "cancelled"
  }
}
```

### GET `/v1/admin/inhouse/workflow-sends`

List individual email sends from workflows (for debugging cooldowns).

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | No | Filter by project |
| `email` | string | No | Filter by recipient email |
| `limit` | number | No | Max results (default 50) |

**Response:**
```json
{
  "ok": true,
  "data": {
    "sends": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "projectName": "My Store",
        "runId": "uuid",
        "actionId": "recover_abandoned",
        "recipientEmail": "user@example.com",
        "status": "sent",
        "sentAt": "2026-01-30T10:00:05Z",
        "error": null
      }
    ]
  }
}
```

---

## 2. Business Events Admin Endpoints

### GET `/v1/admin/inhouse/business-events`

List business events across all projects.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | No | Filter by project |
| `eventType` | string | No | Filter by event type |
| `startDate` | string | No | Start of date range (YYYY-MM-DD) |
| `endDate` | string | No | End of date range (YYYY-MM-DD) |
| `limit` | number | No | Max results (default 50) |
| `cursor` | string | No | Pagination cursor |

**Response:**
```json
{
  "ok": true,
  "data": {
    "events": [
      {
        "id": 12345,
        "publicId": "evt_abc123",
        "projectId": "uuid",
        "projectName": "My Store",
        "eventType": "payment_succeeded",
        "occurredAt": "2026-01-30T10:00:00Z",
        "receivedAt": "2026-01-30T10:00:01Z",
        "source": "stripe",
        "actorType": "user",
        "actorId": "user_123",
        "entityType": "payment",
        "entityId": "pi_abc123",
        "sessionId": "sess_xyz",
        "anonymousId": null,
        "correlationId": "corr_123",
        "payload": {
          "amount": 5000,
          "currency": "USD",
          "customer_email": "user@example.com"
        }
      }
    ],
    "nextCursor": "..."
  }
}
```

### GET `/v1/admin/inhouse/business-events/stats`

Get event statistics for a date range.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | No | Filter by project |
| `startDate` | string | No | Start of date range |
| `endDate` | string | No | End of date range |

**Response:**
```json
{
  "ok": true,
  "data": {
    "totalEvents": 15000,
    "startDate": "2026-01-23",
    "endDate": "2026-01-30",
    "byType": [
      { "eventType": "payment_succeeded", "count": 500 },
      { "eventType": "lead_created", "count": 1200 },
      { "eventType": "checkout_started", "count": 800 }
    ]
  }
}
```

### GET `/v1/admin/inhouse/business-events/:id`

Get a single business event by ID.

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": 12345,
    "publicId": "evt_abc123",
    "projectId": "uuid",
    "projectName": "My Store",
    "eventType": "payment_succeeded",
    "occurredAt": "2026-01-30T10:00:00Z",
    "receivedAt": "2026-01-30T10:00:01Z",
    "source": "stripe",
    "actorType": "user",
    "actorId": "user_123",
    "entityType": "payment",
    "entityId": "pi_abc123",
    "sessionId": "sess_xyz",
    "anonymousId": null,
    "correlationId": "corr_123",
    "payload": { ... }
  }
}
```

---

## 3. KPI Health Admin Endpoints

### GET `/v1/admin/inhouse/kpi-health/summary`

Get overall KPI health summary.

**Response:**
```json
{
  "ok": true,
  "data": {
    "totalProjects": 150,
    "healthyProjects": 120,
    "staleProjects": 25,
    "noDataProjects": 5,
    "lastGlobalRollupAt": "2026-01-30T10:15:00Z",
    "rollupJobStatus": "idle",
    "rollupIntervalMinutes": 15,
    "avgRollupDurationMs": 2500
  }
}
```

### GET `/v1/admin/inhouse/kpi-health/projects`

Get per-project KPI health status.

**Response:**
```json
{
  "ok": true,
  "data": {
    "projects": [
      {
        "projectId": "uuid",
        "projectName": "My Store",
        "lastRollupAt": "2026-01-30T10:15:00Z",
        "lastEventAt": "2026-01-30T10:10:00Z",
        "todayRevenueCents": 50000,
        "todayLeads": 15,
        "todayPayments": 8,
        "currencyCode": "USD",
        "status": "healthy"
      },
      {
        "projectId": "uuid2",
        "projectName": "Another Store",
        "lastRollupAt": "2026-01-30T08:00:00Z",
        "lastEventAt": "2026-01-30T07:00:00Z",
        "todayRevenueCents": 0,
        "todayLeads": 0,
        "todayPayments": 0,
        "currencyCode": "USD",
        "status": "stale"
      }
    ]
  }
}
```

### GET `/v1/admin/inhouse/kpi-health/rollup-job`

Get rollup job status and recent errors.

**Response:**
```json
{
  "ok": true,
  "data": {
    "status": "idle",
    "lastRunAt": "2026-01-30T10:15:00Z",
    "lastDurationMs": 2500,
    "nextScheduledAt": "2026-01-30T10:30:00Z",
    "recentErrors": [
      {
        "occurredAt": "2026-01-30T09:15:00Z",
        "message": "Database connection timeout"
      }
    ]
  }
}
```

### POST `/v1/admin/inhouse/kpi-health/trigger-rollup`

Manually trigger a KPI rollup.

**Request Body:**
```json
{
  "projectId": "uuid",  // Optional - if omitted, triggers for all projects
  "reason": "Manual trigger after fixing data issue"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "triggered": true,
    "projectsAffected": 1,
    "estimatedDurationMs": 2500
  }
}
```

---

## Implementation Notes

### Database Tables Used

1. **workflow_runs** - Status, params, results, outcomes
2. **workflow_sends** - Per-recipient send records with cooldown tracking
3. **business_events** - Transactional events (different from analytics_events)
4. **business_kpi_daily** - Aggregated daily KPIs

### Security

All endpoints require admin authentication via `x-sheen-admin-token` or session cookie with `inhouse.read` permission.

### Audit Logging

All write operations (retry, cancel, trigger-rollup) should create audit log entries with:
- Admin user ID
- Reason provided
- Target resource ID
- Timestamp

---

## Status

| Endpoint | Worker Implementation |
|----------|----------------------|
| `GET /workflow-runs` | ✅ Done |
| `GET /workflow-runs/stuck` | ✅ Done |
| `POST /workflow-runs/:id/retry` | ✅ Done |
| `POST /workflow-runs/:id/cancel` | ✅ Done |
| `GET /workflow-sends` | ✅ Done |
| `GET /business-events` | ✅ Done |
| `GET /business-events/stats` | ✅ Done |
| `GET /business-events/:id` | ✅ Done |
| `GET /kpi-health/summary` | ✅ Done |
| `GET /kpi-health/projects` | ✅ Done |
| `GET /kpi-health/rollup-job` | ✅ Done |
| `POST /kpi-health/trigger-rollup` | ✅ Done |

**Legend:**
- 🔴 Needed - Endpoint needs to be implemented in worker
- ✅ Done - Endpoint implemented and tested

**Implementation Date:** 2026-01-30
**File:** `sheenapps-claude-worker/src/routes/adminInhouseRunHub.ts`
