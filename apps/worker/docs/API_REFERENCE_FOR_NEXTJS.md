# Claude Worker API Reference for Next.js Team

**Date**: December 7, 2025
**Version**: 2.16 (Integration Status System + Vercel Integration + Career Portal + Promotion Validation + Security Alerts Enhancement + Trust & Safety Risk Factors + Admin Enhancements)

## ⚡ Integration Status System API (September 15, 2025)

### Unified integration status aggregation with real-time updates

The Integration Status System provides a single API endpoint to check the status of all project integrations (GitHub, Vercel, Sanity, Supabase) with real-time updates via Server-Sent Events.

#### Authentication Note
All Integration Status API endpoints use the project-specific authentication pattern. Include `userId` in query parameters for GET requests and request body for POST requests.

#### Get Project Integration Status

##### `GET /api/integrations/status`

**Purpose**: Get aggregated status for all project integrations with optimal caching

**Query Parameters:**
```
?projectId=<uuid>&userId=<uuid>&includeMetrics=<boolean>&forceRefresh=<boolean>
```

**Optional Headers:**
```
If-None-Match: W/"<hash>"  // For ETag caching
x-sheen-locale: en|ar|fr|es|de  // For localized responses
```

**Response:**
```json
{
  "projectId": "p_123",
  "overall": "warning",
  "hash": "2b8e7a1f",
  "renderHash": "9c3d4b2a",
  "items": [
    {
      "key": "github",
      "configured": true,
      "visible": true,
      "status": "connected",
      "summary": "Linked to main · Last push 2m ago",
      "updatedAt": "2025-09-15T12:34:56Z",
      "actions": [
        {"id": "push", "label": "Push", "can": true},
        {"id": "pull", "label": "Pull", "can": true},
        {"id": "sync", "label": "Sync", "can": true}
      ]
    },
    {
      "key": "vercel",
      "configured": true,
      "visible": true,
      "status": "warning",
      "summary": "Preview ok · Prod failing",
      "updatedAt": "2025-09-15T12:34:50Z",
      "environments": [
        {"name": "preview", "status": "connected", "url": "https://preview.app"},
        {"name": "production", "status": "error", "summary": "Build failed"}
      ],
      "actions": [{"id": "deploy", "label": "Deploy", "can": true}]
    },
    {
      "key": "sanity",
      "configured": false,
      "visible": true,
      "status": "disconnected",
      "summary": "Not connected",
      "updatedAt": "2025-09-15T12:34:45Z"
    },
    {
      "key": "supabase",
      "configured": true,
      "visible": true,
      "status": "connected",
      "summary": "Database healthy · 12ms avg",
      "updatedAt": "2025-09-15T12:34:55Z",
      "actions": [
        {"id": "test-connection", "label": "Test Connection", "can": true},
        {"id": "reconnect", "label": "Reconnect", "can": true}
      ]
    }
  ]
}
```

**Response Headers:**
```
ETag: W/"9c3d4b2a"
Cache-Control: private, max-age=0, must-revalidate
X-Integration-Hash: 2b8e7a1f
X-Response-Time: 245ms
```

**Status Codes:**
- `200` - Success with status data
- `304` - Not Modified (when using ETag)
- `400` - Invalid request parameters
- `500` - Server error

#### Execute Integration Actions

##### `POST /api/integrations/actions/{projectId}`

**Purpose**: Execute actions on specific integrations with idempotency support

**Required Headers:**
```
Idempotency-Key: <uuid>  // Required for idempotency
x-sheen-locale: en|ar|fr|es|de  // Optional
```

**Request Body:**
```json
{
  "userId": "user_uuid",
  "integrationKey": "github",
  "actionId": "push",
  "parameters": {
    "branch": "main",
    "message": "Optional commit message"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Push action completed successfully",
  "data": {
    "commitSha": "abc123...",
    "pushedFiles": 15
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "GitHub API rate limited",
  "retryAfter": 60
}
```

**Response Headers:**
```
X-Idempotency-Key: <uuid>
Retry-After: 60  // Only on rate limits
```

**Status Codes:**
- `200` - Action completed successfully
- `202` - Action accepted (requires OAuth redirect)
- `400` - Invalid action or parameters
- `429` - Rate limited (5 actions/min per user+project)

#### Get Available Actions

##### `GET /api/integrations/actions/{projectId}/{integrationKey}`

**Purpose**: Get available actions for a specific integration

**Query Parameters:**
```
?userId=<uuid>
```

**Response:**
```json
{
  "actions": [
    {"id": "push", "label": "Push Changes", "can": true},
    {"id": "deploy", "label": "Deploy", "can": false, "reason": "Requires admin permissions"},
    {"id": "connect", "label": "Connect", "can": true}
  ]
}
```

#### Real-time Status Updates (SSE)

##### `GET /api/integrations/events`

**Purpose**: Server-Sent Events stream for real-time integration status updates

**Query Parameters:**
```
?projectId=<uuid>&userId=<uuid>&lastEventId=<number>
```

**Response**: Server-Sent Events stream
```
event: connection.established
id: 1726393500001
data: {"connectionId":"conn_123","reason":"Integration status monitoring active"}

event: integration.status.updated
id: 1726393500002
data: {"projectId":"p_123","integrationKey":"github","status":{...}}

event: integration.action.completed
id: 1726393500003
data: {"projectId":"p_123","actionResult":{"integrationKey":"vercel","actionId":"deploy","success":true}}
```

**Event Types:**
- `connection.established` - SSE connection ready
- `integration.status.updated` - Status changed for one or more integrations
- `integration.action.completed` - Action execution finished
- `integration.connection.changed` - Integration connected/disconnected

**Headers:**
```
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

#### Force Refresh All Statuses

##### `POST /api/integrations/status/{projectId}/refresh`

**Purpose**: Force refresh all integration statuses (bypasses cache)

**Request Body:**
```json
{
  "userId": "user_uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "All integration statuses refreshed"
}
```

#### Integration Status Reference

**Integration Keys**: `github`, `vercel`, `sanity`, `supabase`

**Status Values**:
- `connected` - Integration working normally
- `warning` - Issues detected but functional
- `error` - Integration not working
- `disconnected` - Not configured or linked

**Overall Status Priority**: `error > warning > connected > disconnected`

**Available Actions**:
- **GitHub**: `push`, `pull`, `sync`, `connect`
- **Vercel**: `deploy`, `link`, `connect`
- **Sanity**: `sync`, `open-studio`, `connect`
- **Supabase**: `test-connection`, `reconnect`, `connect`

**Rate Limits**: 5 actions per minute per user+project

**Caching**:
- Default TTL: 10-45 seconds (varies by integration complexity)
- ETag support for bandwidth optimization
- Stale data fallback during API failures

## 🚀 Vercel Integration API (September 8, 2025)

### Complete Vercel deployment management and OAuth integration

The Vercel integration provides full OAuth flow management, project mapping, deployment tracking, and automated deployment capabilities.

#### OAuth Flow Endpoints

##### `GET /v1/integrations/vercel/auth/url`

**Purpose**: Generate Vercel OAuth authorization URL for user consent flow

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Query Parameters:**
```
?project_id=<uuid>&redirect_url=<encoded_url>
```

**Response:**
```json
{
  "authorization_url": "https://vercel.com/oauth/authorize?client_id=...&state=...",
  "state": "uuid-v4-state-token",
  "expires_in": 600
}
```

##### `POST /v1/integrations/vercel/auth/callback`

**Purpose**: Handle OAuth callback and exchange code for tokens

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Request Body:**
```json
{
  "code": "oauth_authorization_code",
  "state": "uuid-v4-state-token",
  "project_id": "uuid-optional"
}
```

**Response:**
```json
{
  "connection_id": "uuid",
  "team_name": "My Team",
  "account_type": "team",
  "granted_scopes": "user project deployment",
  "expires_at": "2025-09-08T12:00:00Z"
}
```

#### Connection Management

##### `GET /v1/integrations/vercel/connections`

**Purpose**: List user's Vercel connections

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Query Parameters:**
```
?project_id=<uuid>&status=connected
```

**Response:**
```json
{
  "connections": [
    {
      "id": "uuid",
      "team_name": "My Team",
      "account_type": "team",
      "status": "connected",
      "granted_scopes": "user project deployment",
      "last_sync_at": "2025-09-08T10:30:00Z",
      "created_at": "2025-09-07T14:20:00Z"
    }
  ],
  "total": 1
}
```

##### `DELETE /v1/integrations/vercel/connections/{connection_id}`

**Purpose**: Revoke Vercel connection and clean up resources

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Response:**
```json
{
  "success": true,
  "message": "Vercel connection revoked successfully"
}
```

#### Project Mapping

##### `GET /v1/integrations/vercel/projects`

**Purpose**: List available Vercel projects for mapping

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Query Parameters:**
```
?connection_id=<uuid>&team_id=<string>
```

**Response:**
```json
{
  "projects": [
    {
      "id": "vercel_project_id",
      "name": "my-nextjs-app",
      "framework": "nextjs",
      "git_repository": {
        "type": "github",
        "repo": "owner/repo",
        "branch": "main"
      },
      "environment_targets": ["production", "preview"],
      "mapped": false
    }
  ],
  "total": 1
}
```

##### `POST /v1/integrations/vercel/projects/{project_id}/map`

**Purpose**: Map local project to Vercel project

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Request Body:**
```json
{
  "connection_id": "uuid",
  "vercel_project_id": "vercel_project_id",
  "auto_deploy": true,
  "environment_targets": ["production", "preview"],
  "deployment_branch_patterns": ["main", "develop"],
  "build_settings": {
    "framework": "nextjs",
    "build_command": "npm run build",
    "output_directory": ".next",
    "install_command": "npm install",
    "node_version": "18.x"
  }
}
```

**Response:**
```json
{
  "mapping_id": "uuid",
  "vercel_project_id": "vercel_project_id",
  "auto_deploy": true,
  "environment_targets": ["production", "preview"],
  "created_at": "2025-09-08T12:00:00Z"
}
```

#### Deployment Management

##### `GET /v1/integrations/vercel/deployments`

**Purpose**: List deployments with filtering and pagination

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Query Parameters:**
```
?project_id=<uuid>&state=READY&type=PRODUCTION&limit=20&offset=0
```

**Response:**
```json
{
  "deployments": [
    {
      "id": "uuid",
      "deployment_id": "vercel_deployment_id",
      "deployment_url": "https://my-app-xyz.vercel.app",
      "deployment_state": "READY",
      "deployment_type": "PRODUCTION",
      "git_source": {
        "provider": "github",
        "repo": "owner/repo",
        "branch": "main",
        "commitSha": "abc123",
        "commitMsg": "Fix login bug"
      },
      "environment": "production",
      "build_duration_ms": 45000,
      "created_at": "2025-09-08T11:45:00Z",
      "ready_at": "2025-09-08T11:46:30Z"
    }
  ],
  "pagination": {
    "total": 50,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

##### `POST /v1/integrations/vercel/deployments/trigger`

**Purpose**: Trigger manual deployment

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`
- `X-Correlation-Id: <uuid>`

**Request Body:**
```json
{
  "project_id": "uuid",
  "vercel_project_id": "vercel_project_id",
  "target_environment": "production",
  "git_source": {
    "branch": "main",
    "commitSha": "abc123"
  },
  "build_override": {
    "build_command": "npm run build:prod",
    "environment_variables": {
      "NODE_ENV": "production"
    }
  }
}
```

**Response:**
```json
{
  "deployment_id": "vercel_deployment_id",
  "deployment_url": "https://my-app-xyz.vercel.app",
  "deployment_state": "QUEUED",
  "correlation_id": "uuid",
  "estimated_duration_ms": 60000
}
```

#### Webhook Management

##### `POST /v1/webhooks/vercel/github`

**Purpose**: Handle GitHub webhook events for auto-deployments

**Required Headers:**
- `X-GitHub-Event: push`
- `X-GitHub-Delivery: <delivery_id>`
- `X-Hub-Signature-256: <signature>`

**Request Body**: GitHub webhook payload

##### `POST /v1/webhooks/vercel/gitlab`

**Purpose**: Handle GitLab webhook events for auto-deployments

**Required Headers:**
- `X-Gitlab-Event: Push Hook`
- `X-Gitlab-Token: <webhook_token>`

**Request Body**: GitLab webhook payload

##### `POST /v1/webhooks/vercel/bitbucket`

**Purpose**: Handle Bitbucket webhook events for auto-deployments

**Required Headers:**
- `X-Event-Key: repo:push`
- `User-Agent: Bitbucket-Webhooks/2.0`

**Request Body**: Bitbucket webhook payload

#### Environment Variables Sync

##### `GET /v1/integrations/vercel/env`

**Purpose**: Get environment variable sync configuration

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Query Parameters:**
```
?project_id=<uuid>&mapping_id=<uuid>
```

**Response:**
```json
{
  "sync_config": {
    "sync_direction": "bidirectional",
    "env_targets": ["production", "preview"],
    "include_patterns": ["NEXT_*", "API_*"],
    "exclude_patterns": ["*_SECRET", "*_PRIVATE"],
    "last_sync_at": "2025-09-08T10:00:00Z",
    "last_sync_status": "success"
  }
}
```

##### `POST /v1/integrations/vercel/env/sync`

**Purpose**: Trigger environment variables synchronization

**Required Headers:**
- `Authorization: Bearer <user_jwt>`
- `X-User-Id: <uuid>`

**Request Body:**
```json
{
  "mapping_id": "uuid",
  "sync_direction": "to_vercel",
  "env_targets": ["production", "preview"],
  "variables": {
    "NEXT_PUBLIC_API_URL": "https://api.example.com",
    "DATABASE_URL": "postgres://..."
  },
  "force_update": false
}
```

**Response:**
```json
{
  "sync_id": "uuid",
  "synced_variables": 2,
  "skipped_variables": 0,
  "errors": [],
  "sync_status": "completed"
}
```

#### Administrative Endpoints

##### `GET /v1/admin/integrations/vercel/connections`

**Purpose**: Admin view of all Vercel connections with enhanced filtering

**Required Headers:**
- `Authorization: Bearer <admin_jwt>`
- `X-Admin-Id: <uuid>`

**Query Parameters:**
```
?status=connected&team_id=<string>&user_id=<uuid>&limit=50&offset=0
```

**Response:**
```json
{
  "connections": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "team_name": "My Team",
      "account_type": "team",
      "status": "connected",
      "circuit_breaker_state": {
        "consecutive_failures": 0,
        "is_open": false
      },
      "created_at": "2025-09-07T14:20:00Z",
      "last_sync_at": "2025-09-08T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
}
```

##### `GET /v1/admin/integrations/vercel/deployments/stats`

**Purpose**: Get deployment statistics for monitoring

**Required Headers:**
- `Authorization: Bearer <admin_jwt>`
- `X-Admin-Id: <uuid>`

**Query Parameters:**
```
?project_id=<uuid>&days_back=7
```

**Response:**
```json
{
  "total_deployments": 150,
  "successful_deployments": 142,
  "failed_deployments": 8,
  "avg_build_time_ms": 45000,
  "deployments_by_state": {
    "READY": 142,
    "ERROR": 8,
    "QUEUED": 0,
    "BUILDING": 0
  },
  "period": {
    "days_back": 7,
    "start_date": "2025-09-01T00:00:00Z",
    "end_date": "2025-09-08T23:59:59Z"
  }
}
```

## 🎯 Promotion Validation Endpoint (September 7, 2025)

### New Scenario Testing for Promotions

A new endpoint enables testing promotion configurations before deployment:

#### `POST /v1/admin/promotions/validate`

**Purpose**: Validate promotion configurations with test scenarios for admin scenario testing

**Required Headers:**
- `Authorization: Bearer <admin_jwt>`
- `X-Correlation-Id: <uuid>`
- `X-Admin-Reason: <reason>`

**Request Body:**
```json
{
  "promotion_config": {
    "name": "Black Friday",
    "discount_type": "percentage",
    "discount_value": 20,
    "currency": "USD",  // Required for fixed_amount
    "minimum_order_amount": 5000,
    "minimum_order_currency": "USD",
    "supported_providers": ["stripe", "fawry", "paymob"]
  },
  "test_scenarios": [
    {
      "region": "us",
      "currency": "USD",
      "order_amount": 10000,
      "provider": "stripe"
    },
    {
      "region": "eg",
      "currency": "EGP",
      "order_amount": 2000,
      "provider": "fawry"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "warnings": [],
  "scenario_results": [
    {
      "eligible": true,
      "discount_amount": 2000,
      "final_amount": 8000,
      "selected_provider": "stripe"
    },
    {
      "eligible": false,
      "discount_amount": 0,
      "final_amount": 2000,
      "selected_provider": "fawry",
      "reason": "Order amount 2000 EGP below minimum 5500 EGP"
    }
  ],
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Key Features:**
- ✅ Up to 10 test scenarios per request
- ✅ Multi-currency support with automatic conversion
- ✅ Minimum order validation across currencies
- ✅ Provider compatibility checking
- ✅ Real-time eligibility determination

## 🛡️ Security Alerts System Enhancement (September 7, 2025)

### Improved Security Monitoring for Admin Panel

The security alerts endpoint has been significantly enhanced to provide actionable security intelligence:

#### Key Improvements:
- **System Event Filtering**: Removed irrelevant migration/database events
- **Enhanced Alert Descriptions**: Clear, contextual information instead of cryptic event names
- **Better Metadata**: IP addresses, attempt counts, locations, confidence scores
- **Proper Alert Categorization**: Five distinct alert types with specific handling

#### New Security Alerts Endpoint: `GET /v1/admin/audit/alerts`

**Query Parameters:**
- `severity`: `'critical' | 'high' | 'medium' | 'low'`
- `resolved`: `boolean` - Filter by resolution status
- `limit`: `number` - Results per page (default: 50)
- `offset`: `number` - Pagination offset

**Response Format:**
```json
{
  "success": true,
  "alerts": [{
    "id": "123",
    "type": "login_failure",
    "severity": "high",
    "title": "Repeated Login Failures",
    "description": "5 failed login attempts detected for user@example.com",
    "timestamp": "2025-09-07T19:00:00Z",
    "metadata": {
      "ip_address": "192.168.1.100",
      "user_email": "user@example.com",
      "attempt_count": 5
    },
    "resolved": false
  }],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 8,
    "returned": 3,
    "has_more": false
  }
}
```

#### Alert Types and Descriptions:
1. **`login_failure`** → "Repeated Login Failures" (with attempt counts)
2. **`rate_limit`** → "Rate Limit Exceeded" (with request counts and endpoints)
3. **`security_breach`** → "Security Breach Detected" (with specific reasons)
4. **`new_location`** → "New Location Access" (with location details)
5. **`unusual_activity`** → "Suspicious Activity" (with confidence scores)

#### Frontend Integration:
```typescript
// Fetch security alerts
const alerts = await adminFetch('/v1/admin/audit/alerts?severity=high&resolved=false');

// Show only unresolved high-priority alerts
const criticalAlerts = alerts.alerts.filter(alert =>
  !alert.resolved && (alert.severity === 'critical' || alert.severity === 'high')
);
```

## 🔒 Trust & Safety Risk Assessment Update (September 7, 2025)

### Complete Risk Factor Breakdown Now Available!

The `GET /v1/admin/trust-safety/risk-scores` endpoint now returns detailed risk factors as requested:

```json
{
  "risk_scores": [{
    "user_id": "user_123",
    "user_email": "user@example.com",
    "risk_score": 26,
    "risk_level": "medium",
    "risk_factors": {           // ← NEW: Detailed breakdown
      "chargebacks": 1,
      "failed_payments": 3,
      "disputes": 0,
      "security_events": 2,
      "violations": 0,
      "suspicious_activity": 1
    },
    "recommendations": [        // ← NEW: Action items
      "Monitor payment activity",
      "Review recent security events"
    ]
  }],
  "metrics": {                  // ← NEW: Dashboard stats
    "total_users": 1250,
    "high_risk_users": 12,
    "violations_today": 3,
    "security_events_today": 7,
    "chargebacks": { "total": 15, "trend": "stable" },
    "fraud_detection": { "attempts_blocked": 23, "success_rate": 95.2 }
  }
}
```

## 🚀 Admin Panel Enhancements (September 7, 2025)

### New Features Added:
1. **JWT Refresh Endpoint**: `POST /v1/admin/auth/refresh` - Dedicated token refresh
2. **SLA Metrics**: Support tickets now include response/resolution time metrics
3. **Seed Data Script**: `npm run seed:admin` for development testing
4. **Pricing Analytics**: Confirmed working at `/v1/admin/pricing/analytics`

## 📊 Pagination Standardization Update (September 4, 2025)

**BREAKING CHANGE**: All admin endpoints now return consistent pagination format with `total` field.

### ✅ New Pagination Format (All Admin Endpoints)
```json
{
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 25,
    "total": 150  // ← Now included in ALL admin endpoints
  }
}
```

### 📋 Updated Endpoints:
- ✅ `GET /v1/admin/users` - Now includes `pagination.total`
- ✅ `GET /v1/admin/trust-safety/security-events` - Now includes `pagination.total`
- ✅ `GET /v1/admin/trust-safety/risk-scores` - Now includes `pagination.total`
- ✅ `GET /v1/admin/pricing/catalogs` - Now includes `pagination.total`
- ✅ `GET /v1/admin/advisors/applications` - Converted from `total_returned` to `pagination.total`
- ✅ `GET /v1/admin/support/tickets` - Converted from `total_returned` to `pagination.total`

### 🚀 Frontend Benefits:
- Proper pagination UI support ("Page 1 of 3", "Showing 1-25 of 150 results")
- Accurate next/previous button enabling/disabling
- No more workarounds needed for total count

---

## 🚨 API Endpoint Migration Notice

**Date**: August 9, 2025

All API endpoints have been migrated to use the `/v1/` prefix for consistency and versioning. Please update your integrations accordingly.

### Key Changes:
- `/api/builds/*` → `/v1/builds/*`
- `/projects/*/versions` → `/v1/projects/*/versions`
- `/cf-pages-callback` → `/v1/webhooks/cloudflare-callback`
- `/audit/*` → `/v1/admin/audit/*`
- `/hmac/*` → `/v1/admin/hmac/*`

---

**Base URL**: `https://worker.sheenapps.com` (production) | `http://localhost:3000` (local)

## 🚨 **CRITICAL SECURITY REQUIREMENTS**

### Authentication (HMAC v1 & v2)

The Worker API supports dual signature validation during the migration period. You can use either v1 OR v2 (or both).

#### 🔴 IMPORTANT: Correct Header Names
- ✅ **v1 signature**: `x-sheen-signature`
- ✅ **v2 signature**: `x-sheen-sig-v2` (NOT `x-sheen-signature-v2`!)
- ✅ **Timestamp**: `x-sheen-timestamp`
- ✅ **Nonce**: `x-sheen-nonce`

#### HMAC v1 Format (Simpler, Recommended for Now)

```typescript
import crypto from 'crypto';

// CORRECT v1 Format: timestamp + body (NO PATH!)
// IMPORTANT: For GET/DELETE requests, body is ALWAYS empty string!
function generateHMACv1(body: string, timestamp: string, secret: string): string {
  const canonical = timestamp + body;  // ✅ CORRECT FORMAT
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

// Example usage for POST request
const body = JSON.stringify({ userId: 'user123', projectId: 'proj456' });
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = generateHMACv1(body, timestamp, process.env.WORKER_SHARED_SECRET);

// Example for GET request (BODY IS ALWAYS EMPTY!)
const getTimestamp = Math.floor(Date.now() / 1000).toString();
const getSignature = generateHMACv1('', getTimestamp, process.env.WORKER_SHARED_SECRET);  // Empty body!

const response = await fetch(`${WORKER_BASE_URL}/v1/chat-plan`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': signature,       // ✅ Just hex string
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  },
  body
});
```

#### HMAC v2 Format (More Secure, Optional)

⚠️ **CRITICAL**: v2 requires **alphabetically sorted query parameters**!

```typescript
// v2 Format: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
// IMPORTANT: Query parameters MUST be sorted alphabetically!

function generateHMACv2(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  nonce: string,
  secret: string
): string {
  // CRITICAL: Sort query parameters alphabetically
  let canonicalPath = path;
  if (path.includes('?')) {
    const [basePath, queryString] = path.split('?');
    const params = new URLSearchParams(queryString);
    // Sort parameters alphabetically by key
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b));
    canonicalPath = basePath + '?' + new URLSearchParams(sortedParams).toString();
  }

  const canonical = [method, canonicalPath, timestamp, nonce, body].join('\n');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

// Example showing the sorting requirement:
// Original URL: /v1/projects/123/versions?state=all&limit=10&offset=0
// Canonical URL: /v1/projects/123/versions?limit=10&offset=0&state=all
//                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                          Parameters sorted alphabetically!

// Full example with sorting
const originalPath = '/v1/projects/123/versions?state=all&limit=10&offset=0&includePatches=true';
const sortedPath = '/v1/projects/123/versions?includePatches=true&limit=10&offset=0&state=all';

const v2Signature = generateHMACv2('GET', originalPath, '', timestamp, nonce, SECRET);
// The function will automatically sort to: ?includePatches=true&limit=10&offset=0&state=all
```

**Why Query Parameter Sorting?**
- Ensures consistent signatures regardless of parameter order
- Prevents signature bypass attacks via parameter reordering
- Handles differences between HTTP clients and frameworks
- Required for CDN and proxy compatibility

**Recommendation**: Use v1 for endpoints with query parameters (simpler, no sorting needed)

#### GET Request Example

```typescript
// For GET requests, body is always empty string
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(16).toString('hex');

// v1 for GET
const v1Signature = generateHMACv1('', timestamp, process.env.WORKER_SHARED_SECRET);

// v2 for GET
const v2Signature = generateHMACv2(
  'GET',
  '/v1/projects/123/versions',
  '',  // Empty body for GET
  timestamp,
  nonce,
  process.env.WORKER_SHARED_SECRET
);

const response = await fetch(`${WORKER_BASE_URL}/v1/projects/123/versions`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': v1Signature,
    'x-sheen-sig-v2': v2Signature,        // Optional but recommended
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': nonce
  }
});
```

### Environment Variables Required
```bash
# IMPORTANT: Use the exact value AS-IS (the trailing '=' is part of the secret, NOT base64 padding)
WORKER_SHARED_SECRET=9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=
WORKER_BASE_URL=https://worker.sheenapps.com

# Redis Configuration (optional - defaults to localhost)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Artifact Retention Policy (optional - defaults to 30 days)
ARTIFACT_RETENTION_DAYS=120
```


## 📊 Query Parameters and Signatures

### Quick Decision Guide

| Scenario | Recommended | Why |
|----------|-------------|-----|
| No query params | v1 or v2 | Both work equally well |
| Simple query params | v1 only | No sorting needed, simpler |
| Complex query params | v1 only | Avoids sorting complexity |
| Maximum security | v2 with sorting | Most secure but complex |

### v1 vs v2 with Query Parameters

#### v1 (Simpler - Recommended)
```typescript
// v1 IGNORES the path and query params entirely
// Only uses: timestamp + body
// IMPORTANT: For GET/DELETE requests, body is ALWAYS empty string!

const url = '/v1/projects/123/versions?state=all&limit=10&offset=0';
const v1Signature = generateHMACv1('', timestamp, SECRET);  // Empty body for GET!
// Same signature regardless of query parameter order!
```

#### v2 (Complex - Requires Sorting)
```typescript
// v2 INCLUDES the path and REQUIRES sorted query params

// ❌ WRONG - Unsorted parameters
const wrong = 'GET\n/v1/projects/123/versions?state=all&limit=10\n...';

// ✅ CORRECT - Sorted parameters
const correct = 'GET\n/v1/projects/123/versions?limit=10&state=all\n...';
```

### Common Query Parameter Pitfall

```typescript
// Your request URL
const url = '/v1/projects/123/versions?state=all&limit=10&offset=0';

// What v2 actually signs (sorted!)
const canonical = '/v1/projects/123/versions?limit=10&offset=0&state=all';

// If you don't sort, your signature will be WRONG!
```

### GET Request Signatures - Critical Information

⚠️ **CRITICAL**: For GET and DELETE requests, the body is ALWAYS empty for signatures!

```typescript
// ✅ CORRECT - GET request with empty body
const getSignature = generateHMACv1('', timestamp, SECRET);  // Empty string!

// ❌ WRONG - Using query string as body
const wrongSignature = generateHMACv1('state=all&limit=10', timestamp, SECRET);  // NEVER do this!

// Complete GET request example
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(16).toString('hex');

// v1: Always empty body for GET
const v1Sig = crypto.createHmac('sha256', SECRET)
  .update(timestamp + '')  // timestamp + empty string
  .digest('hex');

// v2: Method, sorted path, timestamp, nonce, empty body
const sortedPath = '/v1/projects/123/versions?limit=10&offset=0&state=all';
const v2Canonical = `GET\n${sortedPath}\n${timestamp}\n${nonce}\n`;
const v2Sig = crypto.createHmac('sha256', SECRET)
  .update(v2Canonical)
  .digest('hex');
```

### Common HMAC Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| 403 "Invalid signature" | Wrong canonical format | v1: Use `timestamp + body`, NOT `body + path` |
| 403 "version_checked: none" | Wrong header name | Use `x-sheen-sig-v2`, NOT `x-sheen-signature-v2` |
| 403 "Invalid signature" | Wrong secret format | Use secret AS-IS, do NOT base64 decode |
| 408 "Timestamp out of range" | Clock skew | Ensure timestamp is Unix seconds (not milliseconds) |
| 409 "Replay attack" | Nonce reused | Generate unique nonce for each request |

---

## 🚀 **Project Creation Endpoints**

### Endpoint Overview

The Worker API provides **two project creation endpoints** with different architectures:

| Endpoint | Status | Architecture | Use Case |
|----------|--------|--------------|----------|
| **`POST /v1/create-preview-for-new-project`** | ✅ **Primary** | Advanced modular system | Production use, plan-based execution |
| **`POST /v1/build-preview`** | ⚠️ **Legacy** | Simple stream worker | Testing, rapid prototyping |

#### Key Differences

**`/v1/create-preview-for-new-project` (Recommended)**:
- 🎯 **Plan-based execution** - Shows task breakdown before execution
- 🔄 **Session context** - Files have coherent imports/exports
- 🛡️ **Production safeguards** - AI billing, usage limits, system validation
- 🔧 **Advanced error recovery** - TypeScript fixing, dependency resolution
- 📊 **Transparency** - Users see execution plan and progress
- ✅ **Proper versioning** - Uses `/v1/` prefix for API evolution

**`/v1/build-preview` (Legacy)**:
- ⚡ **Simple execution** - Direct stream worker approach
- 🏗️ **Basic building** - Standard build pipeline
- 🧪 **Testing focus** - Good for quick experiments
- ⚠️ **No versioning** - Will be deprecated in v3.0

**Recommendation**: Use `/v1/create-preview-for-new-project` for all production integrations.

---

## 📝 **Sanity CMS Integration API** (September 8, 2025)

### Complete Sanity CMS first-class integration with breakglass recovery

The Sanity integration provides full connection management, content operations, preview system, and emergency access capabilities following Vercel's integration patterns.

**Key Features:**
- 🔒 **Encrypted Token Storage** - AES-256-GCM encryption with breakglass plaintext fallback
- 🔄 **Real-time Webhooks** - Sanity webhook processing with signature validation  
- 📊 **Preview System** - Secure preview generation with SHA-256 hashed secrets
- 🚨 **Breakglass Recovery** - Emergency plaintext token access with audit logging
- 🌐 **i18n Support** - MENA-ready with Arabic content support strategies
- ⚡ **Performance** - Query caching with configurable TTL and circuit breaker protection

#### Authentication
All endpoints require HMAC signature authentication except webhooks (which use Sanity signature validation).

**Required Headers:**
```
X-Signature: hmac-sha256=<signature>
X-Timestamp: <unix_timestamp>
Content-Type: application/json
```

### Connection Management

##### `POST /api/integrations/sanity/connect`

**Purpose**: Create new Sanity connection with encrypted token storage and breakglass fallback

**Request Body:**
```json
{
  "userId": "uuid",
  "projectId": "uuid-optional",
  "sanityProjectId": "8-char-id",
  "datasetName": "production",
  "projectTitle": "My Sanity Project",
  "authToken": "sanity-auth-token",
  "robotToken": "sanity-robot-token-optional",
  "tokenType": "personal",
  "apiVersion": "2023-05-03",
  "useCdn": true,
  "perspective": "published",
  "realtimeEnabled": false,
  "webhookSecret": "webhook-secret-optional",
  "i18nStrategy": "document"
}
```

**Response:**
```json
{
  "success": true,
  "connection": {
    "id": "uuid",
    "user_id": "uuid",
    "project_id": "uuid",
    "sanity_project_id": "8-char-id",
    "dataset_name": "production",
    "project_title": "My Sanity Project",
    "status": "connected",
    "api_version": "2023-05-03",
    "use_cdn": true,
    "perspective": "published",
    "realtime_enabled": false,
    "i18n_strategy": "document",
    "created_at": "2025-09-08T12:00:00Z",
    "updated_at": "2025-09-08T12:00:00Z"
  },
  "breakglass": {
    "available": true,
    "expires_at": "2025-09-09T12:00:00Z"
  }
}
```

##### `GET /api/integrations/sanity/connections`

**Purpose**: List user's Sanity connections

**Query Parameters:**
```
?userId=<uuid>&limit=50&offset=0&includeInactive=false
```

**Response:**
```json
{
  "success": true,
  "connections": [
    {
      "id": "uuid",
      "sanity_project_id": "abcd1234",
      "dataset_name": "production",
      "project_title": "My Project",
      "status": "connected",
      "created_at": "2025-09-08T12:00:00Z"
    }
  ],
  "total": 5,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 5
  }
}
```

##### `GET /api/integrations/sanity/connections/:connectionId`

**Purpose**: Get detailed connection information

**Response:**
```json
{
  "success": true,
  "connection": {
    "id": "uuid",
    "sanity_project_id": "abcd1234",
    "dataset_name": "production",
    "status": "connected",
    "health": {
      "last_check": "2025-09-08T12:00:00Z",
      "status": "healthy",
      "response_time": 120
    },
    "webhook_url": "https://app.example.com/api/sanity/webhook/uuid",
    "breakglass_available": true
  }
}
```

##### `PUT /api/integrations/sanity/connections/:connectionId`

**Purpose**: Update connection configuration

**Request Body:**
```json
{
  "userId": "uuid",
  "projectTitle": "Updated Title",
  "apiVersion": "2023-05-03",
  "useCdn": false,
  "perspective": "previewDrafts",
  "realtimeEnabled": true,
  "i18nStrategy": "field"
}
```

##### `DELETE /api/integrations/sanity/connections/:connectionId`

**Purpose**: Delete connection and cleanup resources

**Query Parameters:**
```
?userId=<uuid>
```

**Response:**
```json
{
  "success": true,
  "message": "Connection deleted successfully"
}
```

### Connection Testing & Health

##### `POST /api/integrations/sanity/test-connection`

**Purpose**: Test connection parameters before saving

**Request Body:**
```json
{
  "sanityProjectId": "abcd1234",
  "datasetName": "production", 
  "authToken": "sanity-token",
  "apiVersion": "2023-05-03"
}
```

**Response:**
```json
{
  "success": true,
  "test_results": {
    "connection_status": "success",
    "response_time": 156,
    "dataset_exists": true,
    "token_permissions": ["read", "write"],
    "project_title": "My Sanity Project"
  }
}
```

##### `POST /api/integrations/sanity/connections/:connectionId/health-check`

**Purpose**: Perform comprehensive health check

**Response:**
```json
{
  "success": true,
  "health": {
    "overall": "healthy",
    "sanity_api": {
      "status": "healthy", 
      "response_time": 120,
      "last_check": "2025-09-08T12:00:00Z"
    },
    "webhook_delivery": {
      "status": "healthy",
      "last_delivery": "2025-09-08T11:30:00Z"
    },
    "token_validity": {
      "status": "valid",
      "expires_at": null
    }
  }
}
```

##### `POST /api/integrations/sanity/connections/:connectionId/sync-schema`

**Purpose**: Sync and cache Sanity schema

**Response:**
```json
{
  "success": true,
  "schema": {
    "types": 15,
    "fields": 89,
    "last_synced": "2025-09-08T12:00:00Z",
    "schema_version": "v2023-05-03"
  }
}
```

### Cache Management

##### `GET /api/integrations/sanity/cache-stats`

**Purpose**: Get cache performance statistics

**Response:**
```json
{
  "success": true,
  "stats": {
    "query_cache": {
      "total_entries": 1250,
      "hit_rate": 0.87,
      "memory_usage": "45MB"
    },
    "schema_cache": {
      "entries": 8,
      "last_refresh": "2025-09-08T10:00:00Z"
    }
  }
}
```

##### `POST /api/integrations/sanity/clear-cache`

**Purpose**: Clear connection-specific cache

**Request Body:**
```json
{
  "connectionId": "uuid-optional",
  "cacheType": "query" // or "schema" or "all"
}
```

### Preview System

##### `POST /api/integrations/sanity/connections/:connectionId/preview`

**Purpose**: Create secure preview with hashed secret

**Request Body:**
```json
{
  "documentIds": ["doc1", "doc2"],
  "expiresIn": 3600,
  "allowedOrigins": ["https://app.example.com"],
  "previewMode": "draft"
}
```

**Response:**
```json
{
  "success": true,
  "preview": {
    "id": "uuid",
    "secret_hash": "sha256-hash",
    "preview_url": "https://worker.example.com/preview/uuid",
    "expires_at": "2025-09-08T13:00:00Z",
    "document_count": 2
  }
}
```

##### `GET /api/integrations/sanity/preview/:previewId/validate`

**Purpose**: Validate preview access

**Query Parameters:**
```
?secret=<preview_secret>&origin=<requesting_origin>
```

**Response:**
```json
{
  "valid": true,
  "expires_at": "2025-09-08T13:00:00Z",
  "document_count": 2
}
```

##### `GET /api/integrations/sanity/preview/:previewId/content`

**Purpose**: Retrieve preview content

**Query Parameters:**
```
?secret=<preview_secret>&documentId=<optional>
```

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "_id": "doc1",
      "_type": "article",
      "title": "Preview Article",
      "content": "...",
      "_updatedAt": "2025-09-08T12:00:00Z"
    }
  ]
}
```

##### `GET /api/integrations/sanity/connections/:connectionId/previews`

**Purpose**: List active previews

**Response:**
```json
{
  "success": true,
  "previews": [
    {
      "id": "uuid",
      "document_count": 2,
      "expires_at": "2025-09-08T13:00:00Z",
      "created_at": "2025-09-08T12:00:00Z"
    }
  ]
}
```

##### `DELETE /api/integrations/sanity/preview/:previewId`

**Purpose**: Revoke preview access

### Breakglass Recovery (Admin Only)

##### `GET /api/integrations/sanity/breakglass/:connectionId/status`

**Purpose**: Check breakglass availability

**Response:**
```json
{
  "success": true,
  "available": true,
  "expires_at": "2025-09-09T12:00:00Z",
  "access_count": 0,
  "max_access_count": 10,
  "reason": "automatic_on_connection_create"
}
```

##### `POST /api/integrations/sanity/breakglass/:connectionId/access`

**Purpose**: Emergency access to plaintext credentials (super_admin only)

**Request Body:**
```json
{
  "adminId": "uuid",
  "justification": "Production emergency - encrypted tokens corrupted"
}
```

**Response:**
```json
{
  "success": true,
  "credentials": {
    "sanity_project_id": "abcd1234",
    "dataset_name": "production",
    "auth_token": "plaintext-token",
    "robot_token": "plaintext-robot-token",
    "webhook_secret": "plaintext-webhook-secret",
    "api_version": "2023-05-03",
    "access_count": 1,
    "max_remaining_uses": 9,
    "expires_at": "2025-09-09T12:00:00Z",
    "warning": "⚠️ BREAKGLASS ACCESS: These are emergency plaintext credentials. Rotate immediately after use."
  }
}
```

##### `GET /api/integrations/sanity/breakglass`

**Purpose**: List breakglass entries (admin only)

**Query Parameters:**
```
?userId=<uuid>&expired=false&limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "entries": [
    {
      "id": "uuid",
      "connection_id": "uuid",
      "sanity_project_id": "abcd1234",
      "expires_at": "2025-09-09T12:00:00Z",
      "access_count": 0,
      "is_active": true,
      "reason": "automatic_on_connection_create"
    }
  ],
  "total": 15
}
```

##### `DELETE /api/integrations/sanity/breakglass/:entryId`

**Purpose**: Revoke breakglass entry (admin only)

**Request Body:**
```json
{
  "adminId": "uuid", 
  "reason": "Security rotation"
}
```

### Webhook Processing

##### `POST /api/integrations/sanity/webhook/:connectionId`

**Purpose**: Process Sanity webhooks (no HMAC auth - uses Sanity signature)

**Headers:**
```
Sanity-Webhook-Signature: signature
Content-Type: application/json
```

**Request Body:**
```json
{
  "_type": "document",
  "_id": "doc-123",
  "operation": "update",
  "document": { /* document data */ }
}
```

**Response:**
```json
{
  "success": true,
  "processed": true,
  "cache_invalidated": true
}
```

##### `GET /api/integrations/sanity/connections/:connectionId/webhooks`

**Purpose**: Get webhook delivery history

**Query Parameters:**
```
?limit=50&offset=0&status=success
```

**Response:**
```json
{
  "success": true,
  "webhooks": [
    {
      "id": "uuid",
      "operation": "update",
      "status": "success",
      "response_time": 45,
      "received_at": "2025-09-08T12:00:00Z",
      "document_type": "article"
    }
  ],
  "total": 234
}
```

##### `POST /api/integrations/sanity/webhooks/:eventId/retry`

**Purpose**: Retry failed webhook processing

**Response:**
```json
{
  "success": true,
  "retry_result": {
    "status": "success",
    "processed_at": "2025-09-08T12:05:00Z"
  }
}
```

### Error Responses

All endpoints use consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "SANITY_CONNECTION_FAILED",
    "message": "Failed to connect to Sanity project",
    "details": {
      "sanity_project_id": "abcd1234",
      "status_code": 401
    }
  }
}
```

**Common Error Codes:**
- `SANITY_CONNECTION_FAILED` - Cannot connect to Sanity
- `INVALID_SANITY_PROJECT` - Project ID or dataset invalid
- `TOKEN_ENCRYPTION_FAILED` - Token encryption error
- `BREAKGLASS_ACCESS_DENIED` - Insufficient admin permissions
- `PREVIEW_EXPIRED` - Preview secret expired
- `WEBHOOK_SIGNATURE_INVALID` - Webhook signature verification failed

---

## 🎯 **Clean Build Events API (NextJS Team)**

### Overview
The worker now provides a clean, structured event API specifically designed for NextJS frontend integration. This eliminates the need for string parsing and provides reliable progress tracking with security filtering.

**Key Features:**
- 🏗️ **Structured Events**: No more emoji or string parsing - clean `title`, `description`, and `phase` fields
- 📊 **Accurate Progress**: Single `overall_progress` field (0.0-1.0) for progress bars
- ✅ **Reliable Completion**: Boolean `finished` flag for definitive completion detection
- 🔒 **Security Filtered**: All file paths, UUIDs, and sensitive data removed from user-facing events
- 🔄 **Backward Compatible**: Legacy events still available during migration

### 1. **GET /v1/builds/:buildId/events** - Main NextJS API

Get clean, structured build events for a project build.

#### Request
```typescript
const response = await fetch(`${WORKER_BASE_URL}/v1/builds/${buildId}/events?userId=${userId}&lastEventId=${lastEventId}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': generateHMACv1('', timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  }
});
```

#### Query Parameters
- `userId` *(required)*: User ID for security filtering
- `lastEventId` *(optional)*: Last event ID received for incremental polling (defaults to 0)

#### Response (200 OK)
```typescript
interface BuildEventsResponse {
  buildId: string;
  events: UserBuildEvent[];
  lastEventId: number;
}

interface UserBuildEvent {
  id: string;
  build_id: string;
  event_type: 'started' | 'progress' | 'completed' | 'failed';
  phase: 'setup' | 'development' | 'dependencies' | 'build' | 'deploy';
  title: string;                    // Clean, user-friendly title (no emojis)
  description: string;              // Safe description (no technical details)
  overall_progress: number;         // 0.0-1.0 for progress bar
  finished: boolean;                // Definitive completion flag
  preview_url?: string;             // Available when deployment completes
  error_message?: string;           // Clean error message (when event_type = 'failed')
  created_at: string;               // ISO 8601 timestamp
  duration_seconds?: number;        // Duration (only on final summary)

  // 🆕 Version Information (available in completion events)
  versionId?: string;               // Version ULID for API operations (e.g., "01J123ABC456DEF789GHI012")
  versionName?: string;             // Human-readable version name (e.g., "v1.2.3" or "Added Login")
}
```

#### Example Response
```json
{
  "buildId": "build_123",
  "events": [
    {
      "id": "1",
      "build_id": "build_123",
      "event_type": "started",
      "phase": "development",
      "title": "Starting Development",
      "description": "Initializing AI session to create your application",
      "overall_progress": 0.1,
      "finished": false,
      "created_at": "2025-07-30T20:57:54.260Z"
    },
    {
      "id": "2",
      "build_id": "build_123",
      "event_type": "progress",
      "phase": "dependencies",
      "title": "Installing Dependencies",
      "description": "Setting up your project dependencies",
      "overall_progress": 0.4,
      "finished": false,
      "created_at": "2025-07-30T20:58:12.150Z"
    },
    {
      "id": "3",
      "build_id": "build_123",
      "event_type": "completed",
      "phase": "deploy",
      "title": "Deployment Complete",
      "description": "Your application is ready!",
      "overall_progress": 1.0,
      "finished": true,
      "preview_url": "https://preview.example.com",
      "created_at": "2025-07-30T21:02:30.450Z",
      "duration_seconds": 180,
      "versionId": "01J123ABC456DEF789GHI012",
      "versionName": "Added Product Search"
    }
  ],
  "lastEventId": 3
}
```

### 2. **GET /v1/builds/:buildId/status** - Build Status Summary

Get current build status with progress information.

#### Request
```typescript
const response = await fetch(`${WORKER_BASE_URL}/v1/builds/${buildId}/status?userId=${userId}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': generateHMACv1('', timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  }
});
```

#### Response (200 OK)
```typescript
interface BuildStatusResponse {
  buildId: string;
  status: 'starting' | 'developing' | 'installing' | 'building' | 'deploying' | 'completed' | 'failed';
  progress: number;                 // 0-100 percentage
  previewUrl: string | null;
  error: string | null;
  currentPhase: string | null;
  finished: boolean;
  eventCount: number;
  lastUpdate: string | null;        // ISO 8601 timestamp
}
```

### 3. **Incremental Polling Pattern**

```typescript
// NextJS Integration Example
class BuildProgressPoller {
  private lastEventId = 0;
  private intervalId: NodeJS.Timeout | null = null;

  async startPolling(buildId: string, userId: string, onUpdate: (event: UserBuildEvent) => void) {
    this.intervalId = setInterval(async () => {
      try {
        const response = await fetch(`/v1/builds/${buildId}/events?userId=${userId}&lastEventId=${this.lastEventId}`);
        const data = await response.json();

        // Process new events
        data.events.forEach(onUpdate);

        // Update pointer for next poll
        if (data.events.length > 0) {
          this.lastEventId = data.lastEventId;
        }

        // Stop polling if build finished
        const lastEvent = data.events[data.events.length - 1];
        if (lastEvent?.finished) {
          this.stopPolling();
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  }

  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

### 4. **Security & Filtering**

**✅ Safe for End Users (User-Facing Events):**
- Clean titles like "Building Application", "Installing Dependencies"
- User-friendly descriptions without technical details
- Progress percentages for UI components
- Safe error messages ("Build failed due to TypeScript errors")
- Preview URLs when ready

**🔒 Filtered Out (Not Visible to End Users):**
- File system paths (`/Users/sh/projects/...`)
- Internal server paths (`/opt/homebrew/bin/claude`)
- Shell commands and system operations
- Build IDs, User IDs, Project IDs (UUIDs)
- Error stack traces with internal code paths
- Memory usage, CPU metrics, file counts
- Installation strategy details

### 5. **Clean Events Only**

**No Legacy API** - Since the product is not launched yet, clean events are the only API. No backward compatibility endpoints are provided.

### 6. **Error Handling for Clean Events**

```typescript
try {
  const response = await fetch(`/v1/builds/${buildId}/events?userId=${userId}`);

  if (response.status === 400) {
    // Missing userId parameter
    throw new Error('User ID is required for security');
  }

  if (response.status === 500) {
    // Server error - retry once
    console.error('Server error retrieving events');
    return [];
  }

  const data = await response.json();
  return data.events;
} catch (error) {
  console.error('Failed to fetch build events:', error);
  return [];
}
```

**Migration Notes:**
- The `/v1/builds/:buildId/events` endpoint returns clean events only
- No legacy endpoints - clean events are the single source of truth
- All builds emit clean events with security filtering
- `userId` parameter is required for security on all event endpoints

---

## 🆕 **Project Version Information**

### Overview
The worker now automatically populates version information for projects, available both in build completion events and in your existing project status queries.

**Key Features:**
- **Automatic Version Classification**: AI determines version names and semantic versioning
- **Real-time Updates**: Version info populated during build completion
- **Multiple Access Points**: Available via build events and project database queries
- **Graceful Degradation**: System works correctly even if version classification is pending

### Database Fields Available

When querying your `projects` table, these fields now contain version information:

```sql
SELECT
  id,
  name,
  current_version_id,      -- UUID of current version (populated immediately)
  current_version_name,    -- Human-readable name (populated after AI classification)
  build_status,
  preview_url,
  last_build_completed
FROM projects
WHERE owner_id = $1;
```

#### Field Details:
- **`current_version_id`**: Always populated when build completes (ULID format)
- **`current_version_name`**: Populated after AI classification (~30s-2min delay)
  - Examples: `"v1.2.3"`, `"Added Product Search"`, `"Fixed Login Bug"`
  - Falls back to semantic version format if custom name not available

### Usage in Your Frontend

```typescript
// Your existing project status query now includes version info
const project = await supabase
  .from('projects')
  .select('id, name, current_version_id, current_version_name, build_status, preview_url')
  .eq('id', projectId)
  .single();

// Version info available immediately after build completes
console.log(`Current version: ${project.current_version_name || 'Processing...'}`);

// Use current_version_id for API operations (publish, rollback, etc.)
if (project.current_version_id) {
  await publishVersion(project.current_version_id);
}
```

### Version Information Timing

| **Source** | **Timing** | **Version ID** | **Version Name** |
|------------|------------|----------------|------------------|
| Build completion events | Immediate | ✅ Always | ⚠️ Sometimes* |
| Projects table | Immediate | ✅ Always | ⚠️ Sometimes* |

*Version names require AI classification which runs in background (~30s-2min). Most builds will have names available, but some may need a brief wait.

---

## 🎯 **Build Recommendations API**

### Overview
The worker generates AI-powered recommendations for next features to add to projects after each build completion. This API provides structured recommendation data with consistency guarantees.

**Key Features:**
- **Direct buildId lookup** - No complex project/version mapping needed
- **Standardized structure** - Consistent format across all recommendations
- **User security isolation** - Users only see their own recommendations
- **Rich metadata** - Priority, complexity, impact, and version hints included

### 1. **GET /v1/builds/:buildId/recommendations**

Get AI-generated recommendations for a specific build.

#### Request
```typescript
const buildId = 'build_abc123'; // From build process
const userId = 'user_456'; // Current user ID

const response = await fetch(`/v1/builds/${buildId}/recommendations?userId=${userId}`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

#### Query Parameters
- **`userId`** *(required)*: User ID for security filtering and ownership verification

#### Response (200 OK)
```typescript
interface RecommendationsResponse {
  success: boolean;
  buildId: string;
  projectId: string;
  versionId: string;
  recommendations: StandardizedRecommendation[];
}

interface StandardizedRecommendation {
  // Core fields (always present)
  id: number;
  title: string;
  description: string;
  category: string;                           // e.g., "ui/ux", "functionality", "seo"
  priority: 'low' | 'medium' | 'high';       // User impact priority
  complexity: 'low' | 'medium' | 'high';     // Implementation difficulty
  impact: 'low' | 'medium' | 'high';         // Expected user benefit
  versionHint: 'patch' | 'minor' | 'major';  // Suggested version bump
  prompt: string;                             // Ready-to-use prompt for next build

  // Optional legacy fields (backward compatibility)
  legacy_id?: string;                         // Original AI-generated ID
  files?: string[];                           // Suggested files to modify
  steps?: string[];                           // Implementation steps
}
```

#### Example Response
```json
{
  "success": true,
  "buildId": "build_abc123",
  "projectId": "proj_456",
  "versionId": "ver_789",
  "recommendations": [
    {
      "id": 1,
      "title": "Add User Authentication",
      "description": "Users need to log in securely to access personalized features",
      "category": "functionality",
      "priority": "high",
      "complexity": "medium",
      "impact": "high",
      "versionHint": "minor",
      "prompt": "Add user authentication with login and signup forms, including session management",
      "files": ["src/auth/", "src/components/LoginForm.tsx"]
    },
    {
      "id": 2,
      "title": "Improve Mobile Responsiveness",
      "description": "Optimize the layout for mobile devices and tablets",
      "category": "ui/ux",
      "priority": "medium",
      "complexity": "low",
      "impact": "medium",
      "versionHint": "patch",
      "prompt": "Add responsive CSS and media queries for mobile-first design",
      "files": ["src/style.css", "src/components/Layout.tsx"]
    }
  ]
}
```

#### Error Responses
- **400**: Missing or invalid `userId` parameter
- **404**: Build not found or no recommendations available yet
- **500**: Server error retrieving recommendations

#### Example Integration
```typescript
async function fetchRecommendations(buildId: string, userId: string) {
  try {
    const response = await fetch(`/v1/builds/${buildId}/recommendations?userId=${userId}`);

    if (response.status === 400) {
      throw new Error('userId parameter is required');
    }

    if (response.status === 404) {
      // Recommendations not ready yet - show loading state
      return { recommendations: [], loading: true };
    }

    const data = await response.json();
    return { recommendations: data.recommendations, loading: false };
  } catch (error) {
    console.error('Failed to fetch recommendations:', error);
    return { recommendations: [], loading: false, error: true };
  }
}

// Usage in React component
function BuildRecommendations({ buildId, userId }) {
  const [state, setState] = useState({ recommendations: [], loading: true });

  useEffect(() => {
    fetchRecommendations(buildId, userId).then(setState);
  }, [buildId, userId]);

  if (state.loading) return <div>Loading recommendations...</div>;
  if (state.error) return <div>Failed to load recommendations</div>;

  return (
    <div>
      <h3>Recommended Next Steps</h3>
      {state.recommendations.map(rec => (
        <div key={rec.id} className={`priority-${rec.priority}`}>
          <h4>{rec.title}</h4>
          <p>{rec.description}</p>
          <div className="metadata">
            <span>Complexity: {rec.complexity}</span>
            <span>Impact: {rec.impact}</span>
            <span>Type: {rec.versionHint}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 2. **GET /projects/:projectId/recommendations** *(Legacy)*

Get recommendations by project ID (requires version lookup).

#### Request
```typescript
const response = await fetch(`/projects/${projectId}/recommendations?userId=${userId}&versionId=${versionId}`, {
  method: 'GET'
});
```

**Note**: This endpoint is maintained for backward compatibility. New integrations should use the buildId-based endpoint above for better performance.

### **Data Consistency**

The recommendations API automatically standardizes data from different AI generation periods:

- **Legacy Structure 1**: `files` + `priority` → Standardized format
- **Legacy Structure 2**: `id` + `effort` → Standardized format
- **Legacy Structure 3**: `steps` + categories → Standardized format

This ensures consistent frontend consumption regardless of when recommendations were generated.

### **Security & Performance Notes**

- **User Isolation**: `userId` parameter ensures users only see their own recommendations
- **Direct Lookup**: Uses buildId index for fast database queries
- **No Joins**: Self-contained table with user_id for optimal performance
- **Standardization**: Runtime conversion ensures consistent API responses

---

## 🆕 **AI Time Billing APIs** (Expert-Enhanced with International Support)

### Overview
The worker provides comprehensive billing endpoints that Next.js uses to:
- Check user balance before operations
- Display current enhanced balance in UI
- Support multi-currency pricing catalogs
- Provide standardized 402 error handling with resume tokens
- Batch operation preflight checks
- Currency-aware purchase flows

**Architecture**: Worker owns consumption + catalog, Next.js owns payments. Expert-validated bucket system with consumption priority.

### 1. **GET /v1/billing/balance/:userId** (🆕 Enhanced with Plan Metadata)

Get user's current enhanced AI time balance with bucket breakdown and plan information.

#### Request
```typescript
const response = await fetch(`${WORKER_BASE_URL}/v1/billing/balance/${userId}`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1('', timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  }
});
```

#### Response (200 OK)
```typescript
interface EnhancedBalanceResponse {
  version: string;
  plan_key?: string;              // 🆕 For frontend gating ('free', 'paid')
  subscription_status?: string;   // 🆕 For frontend gating ('active', 'none')
  catalog_version?: string;       // 🆕 For cache busting
  totals: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
    next_expiry_at: string | null;
  };
  buckets: {
    daily: Array<{ seconds: number; expires_at: string; }>;
    paid: Array<{ seconds: number; expires_at: string; source: string; }>;
  };
  bonus: {
    daily_minutes: number;
    used_this_month_minutes: number;
    monthly_cap_minutes: number;
  };
}
```

#### Example Response
```json
{
  "version": "2025-09-01",
  "plan_key": "free",
  "subscription_status": "none",
  "catalog_version": "2025-09-01",
  "totals": {
    "total_seconds": 1800,
    "paid_seconds": 0,
    "bonus_seconds": 1800,
    "next_expiry_at": "2025-09-02T00:00:00Z"
  },
  "buckets": {
    "daily": [
      { "seconds": 900, "expires_at": "2025-09-02T00:00:00Z" }
    ],
    "paid": []
  },
  "bonus": {
    "daily_minutes": 15,
    "used_this_month_minutes": 120,
    "monthly_cap_minutes": 300
  }
}
```

---

### 2. **GET /v1/billing/catalog** (🆕 Currency-Aware with ETag Caching)

Get pricing catalog with currency support and ETag caching for optimal performance.

#### Request
```typescript
const currency = 'USD'; // 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'AED'
const response = await fetch(`${WORKER_BASE_URL}/v1/billing/catalog?currency=${currency}`, {
  method: 'GET',
  headers: {
    'If-None-Match': lastKnownETag // Optional: for 304 responses
  }
});
```

#### Response (200 OK)
```typescript
interface PricingCatalog {
  version: string;
  currency_fallback_from?: string; // 🆕 When requested currency unavailable
  rollover_policy: {
    days: number;
  };
  subscriptions: Array<{
    key: string;
    name: string;
    minutes: number;
    price: number;
    taxInclusive: boolean;          // 🆕 Show "(incl. tax)" in UI
    bonusDaily?: number;
    monthlyBonusCap?: number;
    rolloverCap?: number;
    advisor: {
      eligible: boolean;
      payoutUSD?: number;
    };
  }>;
  packages: Array<{
    key: string;
    name: string;
    minutes: number;
    price: number;
    taxInclusive: boolean;          // 🆕 Show "(incl. tax)" in UI
  }>;
}
```

#### Response Headers
- `ETag`: `"2025-09-01-1725264000-USD"` (version-timestamp-currency)
- `Cache-Control`: `public, max-age=300` (5 minute cache)

#### Example Response
```json
{
  "version": "2025-09-01",
  "currency_fallback_from": "EGP",
  "rollover_policy": { "days": 90 },
  "subscriptions": [
    {
      "key": "free",
      "name": "Free Tier",
      "minutes": 0,
      "price": 0,
      "taxInclusive": true,
      "monthlyBonusCap": 300,
      "advisor": { "eligible": false }
    }
  ],
  "packages": [
    {
      "key": "mini",
      "name": "Mini Package",
      "minutes": 60,
      "price": 9.99,
      "taxInclusive": true
    }
  ]
}
```

---

### 3. **POST /v1/billing/check-sufficient** (🆕 Enhanced with Resume Tokens)

Check if user has sufficient balance. Returns standardized 402 error with resume token for post-purchase retry.

#### Request
```typescript
interface SufficientCheckRequest {
  userId: string;
  operationType: 'main_build' | 'metadata_generation' | 'update';
  projectSize?: 'small' | 'medium' | 'large';
  isUpdate?: boolean;
}

const body = JSON.stringify({
  userId: 'user123',
  operationType: 'main_build',
  projectSize: 'medium'
});

const response = await fetch(`${WORKER_BASE_URL}/v1/billing/check-sufficient`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  },
  body
});
```

#### Response (402 Payment Required) - Standardized Error
```typescript
interface InsufficientFundsError {
  error: 'INSUFFICIENT_AI_TIME';
  http_status: 402;
  balance_seconds: number;
  breakdown_seconds: {
    bonus_daily: number;
    paid: number;
  };
  suggestions: Array<{
    type: 'package' | 'upgrade';
    key?: string;
    plan?: string;
    minutes?: number;
  }>;
  catalog_version: string;
  resume_token: string;           // 🆕 For auto-retry after purchase (1 hour TTL)
}
```

#### Example 402 Response
```json
{
  "error": "INSUFFICIENT_AI_TIME",
  "http_status": 402,
  "balance_seconds": 300,
  "breakdown_seconds": {
    "bonus_daily": 300,
    "paid": 0
  },
  "suggestions": [
    {
      "type": "package",
      "key": "mini",
      "minutes": 60
    },
    {
      "type": "upgrade",
      "plan": "starter"
    }
  ],
  "catalog_version": "2025-09-01",
  "resume_token": "abc123def456..."
}
```

---

### 4. **POST /v1/billing/check-sufficient-batch** (🆕 Batch Operations)

Check multiple operations at once to avoid chatty API calls for bulk workflows.

#### Request
```typescript
interface BatchCheckRequest {
  userId: string;
  operations: Array<{
    operation: 'build' | 'plan' | 'export' | 'metadata_generation';
    estimate_seconds: number;
  }>;
}

const body = JSON.stringify({
  userId: 'user123',
  operations: [
    { operation: 'build', estimate_seconds: 120 },
    { operation: 'plan', estimate_seconds: 30 },
    { operation: 'export', estimate_seconds: 45 }
  ]
});

const response = await fetch(`${WORKER_BASE_URL}/v1/billing/check-sufficient-batch`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  },
  body
});
```

#### Response (200 OK)
```typescript
interface BatchOperationResult {
  operation: string;
  ok: boolean;
  deficit_seconds: number;
  suggestions?: Array<{
    type: 'package' | 'upgrade';
    key?: string;
    plan?: string;
    minutes?: number;
  }>;
}
```

#### Example Response
```json
[
  { "operation": "build", "ok": true, "deficit_seconds": 0 },
  { "operation": "plan", "ok": true, "deficit_seconds": 0 },
  {
    "operation": "export",
    "ok": false,
    "deficit_seconds": 15,
    "suggestions": [
      { "type": "package", "key": "mini", "minutes": 60 }
    ]
  }
]
```

---

### 5. **POST /v1/billing/packages/purchase** (🆕 Multi-Provider Purchase)

Create checkout session with automatic provider selection based on region and currency.

#### Request
```typescript
interface PurchaseRequest {
  package_key: string;
  currency?: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR';  // Updated: Supported currencies
  region?: 'us' | 'ca' | 'gb' | 'eu' | 'eg' | 'sa';  // 🆕 Regional provider routing
  locale?: 'en' | 'ar';  // 🆕 Arabic support for MENA regions
}

const body = JSON.stringify({
  package_key: 'mini',
  currency: 'EGP',  // Egypt pounds
  region: 'eg',     // Egypt region
  locale: 'ar'      // Arabic interface
});

const response = await fetch(`${WORKER_BASE_URL}/v1/billing/packages/purchase`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
    'x-sheen-locale': 'ar'  // 🆕 Optional locale header
  },
  body
});
```

#### Response (200 OK) - Redirect Flow
```typescript
interface PurchaseResponseRedirect {
  checkout_url: string;               // Redirect to provider (Stripe, PayTabs, etc.)
  currency: string;                   // Final currency used
  unit_amount_cents: number;
  display_price: number;
  package_minutes: number;
  session_id: string;
  order_id: string;                   // 🆕 Unique order identifier

  // 🆕 Multi-provider fields
  payment_provider: 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs';
  checkout_type: 'redirect';          // Redirect to external payment page
  redirect_expires_at: string;        // Payment link expiration
  currency_fallback_from?: string;    // When requested currency unavailable
}
```

#### Response (200 OK) - Voucher Flow
```typescript
interface PurchaseResponseVoucher {
  checkout_url: null;                 // No redirect needed
  currency: string;
  unit_amount_cents: number;
  display_price: number;
  package_minutes: number;
  session_id: string;
  order_id: string;

  // 🆕 Multi-provider fields
  payment_provider: 'fawry';          // Cash payment provider
  checkout_type: 'voucher';           // Show voucher UI

  // 🆕 Voucher-specific fields
  voucher_reference: string;          // Payment reference code
  voucher_expires_at: string;         // Voucher expiration
  voucher_instructions: string;       // Localized payment instructions
  voucher_barcode_url?: string;       // QR code URL
}
```

#### Error Responses
```typescript
// Region/Currency not supported
{
  "error": "NOT_SUPPORTED",
  "message": "No payment provider available for region: jp, currency: JPY, productType: package",
  "actionRequired": "This combination is not currently supported. Please contact support."
}

// Missing required phone number (for STC Pay)
{
  "error": "MISSING_PHONE",
  "message": "Phone number required for this payment method",
  "provider": "stcpay",
  "actionRequired": "Please add a Saudi phone number to use STC Pay"
}

// Arabic locale required (for Fawry)
{
  "error": "MISSING_LOCALE",
  "message": "Arabic locale required for this provider",
  "provider": "fawry",
  "actionRequired": "Please switch to Arabic locale"
}
```

#### Frontend Integration Examples

**Handle Different Checkout Types:**
```typescript
const handlePurchase = async () => {
  const result = await purchasePackage('mini', 'EGP', 'eg', 'ar');

  if (result.checkout_type === 'redirect') {
    // Card payments - redirect immediately
    window.location.href = result.checkout_url;

  } else if (result.checkout_type === 'voucher') {
    // Cash payments - show voucher UI
    showVoucherModal({
      reference: result.voucher_reference,
      qrCode: result.voucher_barcode_url,
      instructions: result.voucher_instructions,
      expiresAt: result.voucher_expires_at
    });
  }
};
```

**Voucher UI Component:**
```tsx
function VoucherPayment({ voucher }: { voucher: PurchaseResponseVoucher }) {
  const [timeLeft, setTimeLeft] = useState<number>();

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const expiry = new Date(voucher.voucher_expires_at).getTime();
      setTimeLeft(Math.max(0, expiry - now));
    }, 1000);

    return () => clearInterval(interval);
  }, [voucher.voucher_expires_at]);

  return (
    <div className="voucher-payment" dir="rtl">
      <h3>الدفع عبر فوري</h3>

      {/* QR Code */}
      <div className="qr-section">
        <QRCode value={voucher.voucher_reference} size={200} />
        <p>رقم المرجع: <code>{voucher.voucher_reference}</code></p>
      </div>

      {/* Instructions */}
      <div className="instructions">
        <p>{voucher.voucher_instructions}</p>
      </div>

      {/* Timer */}
      {timeLeft > 0 && (
        <div className="expiry-timer">
          الوقت المتبقي: {Math.floor(timeLeft / 60000)}:{String(Math.floor((timeLeft % 60000) / 1000)).padStart(2, '0')}
        </div>
      )}
    </div>
  );
}
```

#### Use Cases
- **Regional Expansion**: Support Egypt (EGP) and Saudi Arabia (SAR) markets
- **Payment Method Diversity**: Cards, mobile wallets, cash payments
- **Localized Experience**: Arabic interface for MENA regions
- **Provider Redundancy**: Automatic failover if primary provider unavailable
- **Currency Optimization**: Local currency pricing reduces conversion fees

---

## 📦 **Project Export & Download APIs**

### Overview
Download project versions as ZIP files with secure, time-limited signed URLs. Perfect for user data portability, backups, and version management.

**Key Features:**
- Secure signed URLs (24-hour expiry)
- Artifact integrity verification via SHA256 checksums
- Size limits for safe downloads (2GB max)
- Ownership verification and access control

### 1. **GET /v1/projects/:projectId/export**

Export the latest version of a project as a downloadable ZIP file.

#### Request
```typescript
const path = `/v1/projects/${projectId}/export`;
const signature = generateHMACv1('', timestamp, WORKER_SHARED_SECRET);

const response = await fetch(`${WORKER_BASE_URL}${path}?userId=${userId}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': signature
  }
});
```

#### Response (200 OK)
```typescript
{
  "success": true,
  "downloadUrl": "https://pub-xxxx.r2.dev/signed-url-with-auth-token",
  "expiresAt": "2025-07-28T15:30:00.000Z", // 24 hours from now
  "filename": "my-project-latest.zip",
  "size": 15728640, // Size in bytes
  "version": {
    "id": "01J3EXAMPLE123",
    "prompt": "Add dark mode toggle",
    "createdAt": "2025-07-27T15:30:00.000Z"
  }
}
```

#### Error Responses
- **404**: No artifact available for this project
- **413**: Artifact too large for download (>2GB) - *Note: Large projects can still rebuild (R2 upload limit 5GB)*
- **401**: Invalid signature or unauthorized access

#### Example Integration
```typescript
async function downloadLatestProject(projectId: string) {
  try {
    const response = await fetch(`/api/worker/projects/${projectId}/export`);
    const data = await response.json();

    if (response.ok) {
      // Redirect user to signed download URL
      window.open(data.downloadUrl, '_blank');

      // Show success message with expiry info
      toast.success(`Download ready! Link expires at ${new Date(data.expiresAt).toLocaleTimeString()}`);
    } else if (response.status === 413) {
      toast.error(`Project too large: ${data.message}`);
    }
  } catch (error) {
    toast.error('Failed to generate download link');
  }
}
```

### 2. **GET /v1/v1/v1/versions/${versionId}/download**

Download a specific project version by version ID.

#### Request
```typescript
const path = `/v1/versions/${versionId}/download`;
const signature = generateHMACv1('', timestamp, WORKER_SHARED_SECRET);

const response = await fetch(`${WORKER_BASE_URL}${path}?userId=${userId}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': signature
  }
});
```

#### Response (200 OK)
```typescript
{
  "success": true,
  "downloadUrl": "https://pub-xxxx.r2.dev/signed-url-with-auth-token",
  "expiresAt": "2025-07-28T15:30:00.000Z",
  "filename": "my-project-01J3EXAMPLE123.zip",
  "size": 15728640,
  "version": {
    "id": "01J3EXAMPLE123",
    "prompt": "Add dark mode toggle",
    "createdAt": "2025-07-27T15:30:00.000Z",
    "projectId": "my-project"
  }
}
```

#### Special Error Response (404 with rebuild option)
```typescript
{
  "error": "Artifact not available",
  "message": "This version has no downloadable artifact",
  "canRebuild": true,
  "rebuildUrl": "/v1/versions/01J3EXAMPLE123/rebuild"
}
```

#### Version History Integration
```typescript
function VersionRow({ version }: { version: ProjectVersion }) {
  const handleDownload = async () => {
    const response = await fetch(`/v1/versions/${version.id}/download`);

    if (response.status === 404) {
      const error = await response.json();
      if (error.canRebuild) {
        // Offer rebuild option
        const rebuild = confirm('This version has no download available. Rebuild it now?');
        if (rebuild) {
          await fetch(error.rebuildUrl, { method: 'POST' });
        }
      }
    } else {
      const data = await response.json();
      window.open(data.downloadUrl, '_blank');
    }
  };

  return (
    <tr>
      <td>{version.prompt}</td>
      <td>{version.createdAt}</td>
      <td>
        <button onClick={handleDownload}>
          📥 Download
        </button>
      </td>
    </tr>
  );
}
```

### 3. **Security & Best Practices**

#### Rate Limiting & Headers
```typescript
// Implement client-side rate limiting to prevent abuse
const downloadCache = new Map<string, { url: string; expiresAt: string }>();

async function getCachedDownloadUrl(versionId: string) {
  const cached = downloadCache.get(versionId);

  // Return cached URL if still valid (with 5min buffer)
  if (cached && new Date(cached.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return cached.url;
  }

  // Generate new signed URL with rate limit awareness
  const response = await fetch(`/v1/versions/${versionId}/download`);

  // Check rate limit headers for intelligent backoff
  const remaining = response.headers.get('x-ratelimit-remaining');
  const resetTime = response.headers.get('x-ratelimit-reset');

  if (remaining && parseInt(remaining) < 5) {
    console.warn(`Rate limit approaching: ${remaining} requests remaining`);
    // Consider delaying next request or showing user notice
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after') || resetTime;
    throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
  }

  const data = await response.json();
  downloadCache.set(versionId, { url: data.downloadUrl, expiresAt: data.expiresAt });
  return data.downloadUrl;
}
```

#### Error Handling
```typescript
async function handleDownloadError(response: Response) {
  const error = await response.json();

  switch (response.status) {
    case 404:
      if (error.canRebuild) {
        return { type: 'missing', canRebuild: true, rebuildUrl: error.rebuildUrl };
      }
      return { type: 'not_found' };

    case 413:
      return {
        type: 'too_large',
        size: error.size,
        suggestion: error.suggestion
      };

    case 401:
      return { type: 'unauthorized' };

    default:
      return { type: 'unknown', message: error.message };
  }
}
```

---

## 🧪 **Legacy Build Endpoint (Testing Only)**

### POST /v1/build-preview

**⚠️ Status**: Legacy endpoint for testing and rapid prototyping. Use `/v1/create-preview-for-new-project` for production.

#### Request
```typescript
const response = await fetch(`${WORKER_BASE_URL}/v1/build-preview`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  },
  body: JSON.stringify({
    userId: 'user123',
    projectId: 'my-app',
    prompt: 'Create a React landing page for a salon booking app',
    framework: 'react' // optional: react|nextjs|vue|svelte
  })
});
```

#### Response (200 OK)
```json
{
  "success": true,
  "jobId": "stream-job-123",
  "buildId": "build-456",
  "status": "queued|completed",
  "message": "Build job queued successfully",
  "deploymentUrl": "https://abc123.pages.dev" // when status=completed
}
```

#### Limitations
- No plan visibility
- No session context between files
- No AI billing integration
- No advanced error recovery
- Simple stream worker architecture
- No production safeguards

**Migration Path**: Replace with `/v1/create-preview-for-new-project` for better reliability and features.

---

## 🔥 **Enhanced Build APIs with Billing Integration**

### Modified Behavior
Build endpoints now return **402 Payment Required** if user has insufficient balance.

### 1. **POST /v1/create-preview-for-new-project**

**🎯 Enhanced Project Creation with Server-Side ID Generation**

The endpoint now supports **server-side project ID generation** for improved security and data integrity. The `projectId` parameter is now **optional** - when omitted, the worker generates a secure UUID and returns it in the response.

#### Request
```typescript
const body = JSON.stringify({
  userId: 'user_123',
  // projectId: 'my-project', // ⚠️ OPTIONAL: Omit for server-generated IDs (recommended)
  prompt: 'Create a React landing page for a salon booking app',
  framework: 'react' // optional: react|nextjs|vue|svelte
});

const response = await fetch(`${WORKER_BASE_URL}/v1/create-preview-for-new-project`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  },
  body
});
```

#### Request Body
- `userId` *(required)*: User ID for ownership verification
- `projectId` *(optional)*: Project identifier. **If omitted, server generates secure UUID**
- `prompt` *(required)*: Description of what to build
- `framework` *(optional)*: Target framework (`react`|`nextjs`|`vue`|`svelte`). Default: `react`

#### Response (200 OK)
```json
{
  "success": true,
  "projectId": "550e8400-e29b-41d4-a716-446655440000", // ← Server-generated UUID
  "jobId": "01HZXK2M3P7QR8F5Y6W1B2C3D4",
  "buildId": "01HZXK2M3P7QR8F5Y6W1B2C3D5",
  "planId": "01HZXK2M3P7QR8F5Y6W1B2C3D5",
  "status": "queued",
  "message": "Preview creation job queued successfully (stream mode)",
  "estimatedTime": "60-90 seconds for new projects"
}
```

#### **🔒 Security & Data Integrity Benefits**
- **Race condition prevention**: Advisory database locking prevents double-click issues
- **Atomic creation**: Project + version + build metrics created in single transaction
- **Server-controlled IDs**: Eliminates client-side ID manipulation vectors
- **Complete audit trail**: All operations traceable with `created_by: 'worker-service'`

#### **⚡ Backward Compatibility**
- Existing code with `projectId` continues to work during transition
- NextJS can immediately start omitting `projectId` for new projects
- No breaking changes to response format

#### New Error Response (402)
```json
{
  "error": "insufficient_ai_time",
  "message": "Insufficient AI time balance to start build",
  "balance": {
    "welcomeBonus": 0,
    "dailyGift": 300,
    "paid": 0,
    "total": 300
  },
  "estimate": {
    "estimatedSeconds": 180
  },
  "required": 180
}
```

**⚠️ CDN Compatibility Note**: Some CDNs may strip response bodies for 402 status codes. Always check both `response.json()` and fallback to the `error` field:

```typescript
if (response.status === 402) {
  let errorData;
  try {
    errorData = await response.json();
  } catch {
    // CDN stripped body - use generic fallback
    errorData = {
      error: 'insufficient_ai_time',
      message: 'Please add AI time credits to continue building'
    };
  }
  handleInsufficientBalance(errorData);
}
```

#### Frontend Handling
```typescript
try {
  const response = await createPreview(userData);
  // Handle success
} catch (error) {
  if (error.status === 402) {
    // Redirect to purchase flow
    router.push(`/purchase?required=${error.required}&available=${error.balance.total}`);
  }
}
```

### 2. **POST /v1/update-project**

Same 402 error handling as create-preview.

#### Important Notes
- **Updates typically use less AI time** than full builds (30-45s vs 90-120s)
- Use `operationType: 'update'` and `isUpdate: true` for better estimates
- Worker automatically tracks and bills for actual time used

---

## 📊 **Integration Patterns for Next.js**

### 1. **Dashboard Balance Display**

```typescript
// components/BalanceDisplay.tsx
import { useEffect, useState } from 'react';

interface BalanceInfo {
  balance: { total: number; welcomeBonus: number; dailyGift: number; paid: number };
  usage: { todayUsed: number; lifetimeUsed: number };
}

export function BalanceDisplay({ userId }: { userId: string }) {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBalance() {
      try {
        const response = await fetch(`/api/worker/billing/balance/${userId}`);
        const data = await response.json();
        setBalance(data);
      } catch (error) {
        console.error('Failed to fetch balance:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchBalance();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  if (loading) return <div>Loading balance...</div>;
  if (!balance) return <div>Unable to load balance</div>;

  const totalMinutes = Math.floor(balance.balance.total / 60);

  return (
    <div className="balance-display">
      <h3>AI Time Remaining: {totalMinutes} minutes</h3>
      <div className="balance-breakdown">
        <div>Welcome Bonus: {Math.floor(balance.balance.welcomeBonus / 60)}m</div>
        <div>Daily Gift: {Math.floor(balance.balance.dailyGift / 60)}m</div>
        <div>Purchased: {Math.floor(balance.balance.paid / 60)}m</div>
      </div>
      <div className="usage-stats">
        Used today: {Math.floor(balance.usage.todayUsed / 60)}m
      </div>
    </div>
  );
}
```

### 2. **Pre-Build Validation**

```typescript
// hooks/usePreBuildCheck.ts
import { useState } from 'react';

interface BuildCheckResult {
  canBuild: boolean;
  estimate?: { estimatedMinutes: number; confidence: string };
  recommendation?: { suggestedPackage: string; costToComplete: number };
}

export function usePreBuildCheck() {
  const [checking, setChecking] = useState(false);

  const checkBuildability = async (
    userId: string,
    operationType: 'main_build' | 'update',
    projectSize?: 'small' | 'medium' | 'large'
  ): Promise<BuildCheckResult> => {
    setChecking(true);
    try {
      const response = await fetch('/api/worker/billing/check-sufficient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, operationType, projectSize })
      });

      const data = await response.json();

      return {
        canBuild: data.sufficient,
        estimate: data.estimate ? {
          estimatedMinutes: data.estimate.estimatedMinutes,
          confidence: data.estimate.confidence
        } : undefined,
        recommendation: data.recommendation
      };
    } finally {
      setChecking(false);
    }
  };

  return { checkBuildability, checking };
}
```

### 3. **Build Button with Balance Check**

```typescript
// components/BuildButton.tsx
import { useState } from 'react';
import { usePreBuildCheck } from '../hooks/usePreBuildCheck';

interface BuildButtonProps {
  userId: string;
  projectId: string;
  operationType: 'main_build' | 'update';
  onInsufficientBalance: (recommendation: any) => void;
}

export function BuildButton({ userId, projectId, operationType, onInsufficientBalance }: BuildButtonProps) {
  const [building, setBuilding] = useState(false);
  const { checkBuildability, checking } = usePreBuildCheck();

  const handleBuild = async () => {
    // Pre-flight balance check
    const buildCheck = await checkBuildability(userId, operationType);

    if (!buildCheck.canBuild) {
      onInsufficientBalance(buildCheck.recommendation);
      return;
    }

    setBuilding(true);
    try {
      // Proceed with build - worker will do final balance check
      const response = await fetch('/api/worker/v1/create-preview-for-new-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, prompt: '...' })
      });

      if (response.status === 402) {
        // Handle edge case where balance changed between checks
        const errorData = await response.json();
        onInsufficientBalance(errorData);
        return;
      }

      // Handle successful build
      const result = await response.json();
      // ...
    } catch (error) {
      console.error('Build failed:', error);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <button
      onClick={handleBuild}
      disabled={building || checking}
      className="build-button"
    >
      {checking ? 'Checking balance...' : building ? 'Building...' : 'Start Build'}
      {buildCheck?.estimate && (
        <span className="estimate">
          ~{buildCheck.estimate.estimatedMinutes}m
        </span>
      )}
    </button>
  );
}
```

### 4. **Purchase Flow Integration**

```typescript
// pages/purchase.tsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function PurchasePage() {
  const router = useRouter();
  const { required, available, userId } = router.query;
  const [selectedPackage, setSelectedPackage] = useState<string>('');

  // After successful payment, balance will be automatically available
  // Next.js webhook handler should credit the user_ai_time_balance table
  const handlePaymentSuccess = async (paymentId: string) => {
    // Next.js handles the payment and credits balance
    // Worker will see the updated balance immediately

    // Redirect back to build flow
    router.push('/dashboard?payment=success');
  };

  return (
    <div className="purchase-flow">
      <h2>Add AI Time</h2>
      <div className="balance-info">
        <p>You need {Math.ceil(Number(required) / 60)} minutes</p>
        <p>You have {Math.floor(Number(available) / 60)} minutes</p>
      </div>

      {/* Package selection and Stripe integration */}
      <PackageSelector onSelect={setSelectedPackage} />
      <StripeCheckout
        package={selectedPackage}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
```

---

## 🔄 **Webhook Integration Pattern**

### Architecture Flow
1. **User purchases** → Stripe processes payment
2. **Stripe webhook** → Next.js `/api/webhooks/stripe`
3. **Next.js handler** → Credits `user_ai_time_balance.paid_seconds_remaining`
4. **Worker reads** → Updated balance immediately available

### Critical Implementation Notes

#### Next.js Webhook Handler
```typescript
// pages/api/webhooks/stripe.ts
import { stripe } from '../../lib/stripe';
import { db } from '../../lib/database';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const payload = req.body;

  try {
    // Verify Stripe signature
    const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;

      // Extract purchase details from metadata
      const { userId, packageName, minutesPurchased } = paymentIntent.metadata;
      const secondsPurchased = parseInt(minutesPurchased) * 60;

      // ATOMIC TRANSACTION: Insert purchase + credit balance
      await db.transaction(async (trx) => {
        // Insert purchase record
        await trx('user_ai_time_purchases').insert({
          user_id: userId,
          purchase_type: 'package',
          package_name: packageName,
          minutes_purchased: minutesPurchased,
          price: paymentIntent.amount / 100, // Convert from cents
          payment_id: paymentIntent.id,
          payment_status: 'completed',
          purchased_at: new Date()
        });

        // Credit user balance - Worker will see this immediately
        await trx('user_ai_time_balance').insert({
          user_id: userId,
          paid_seconds_remaining: secondsPurchased
        }).onConflict('user_id').merge({
          paid_seconds_remaining: trx.raw('paid_seconds_remaining + ?', [secondsPurchased]),
          updated_at: new Date()
        });
      });

      console.log(`Credited ${minutesPurchased} minutes to user ${userId}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
}
```

---

## ⚠️ **Error Handling Guide**

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|---------|
| `200` | Success | Process response |
| `400` | Bad Request | Fix request parameters |
| `401` | Unauthorized | Check HMAC signature |
| `402` | Payment Required | Redirect to purchase flow |
| `404` | Not Found | Check user exists |
| `429` | Rate Limited | Implement retry with backoff |
| `500` | Server Error | Retry once, then alert |

### Common Error Scenarios

#### 1. **Insufficient Balance (402)**
```typescript
if (response.status === 402) {
  const error = await response.json();

  // Show purchase modal/redirect
  showPurchaseModal({
    required: error.required,
    available: error.balance.total,
    estimate: error.estimate
  });
}
```

#### 2. **Invalid Signature (401)**
```typescript
if (response.status === 401) {
  // Check HMAC signature generation
  console.error('Invalid signature - check WORKER_SHARED_SECRET');

  // In development, log the expected signature
  if (process.env.NODE_ENV === 'development') {
    console.log('Expected signature for body:', generateSignature(body, secret));
  }
}
```

#### 3. **Rate Limiting (429)**
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || '60';

  // Exponential backoff
  await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
  return retryRequest();
}
```

---

## 🚀 **Performance & Optimization**

### 1. **Caching Strategy**
- **Balance data**: Cache for 30-60 seconds (balances don't change frequently)
- **Estimates**: Cache for 5 minutes per operation type
- **User context**: Cache user preferences for better estimates

### 2. **Polling Patterns**
```typescript
// Efficient balance polling after payment
const pollBalanceAfterPayment = async (userId: string, expectedMinimum: number) => {
  const maxAttempts = 12; // 60 seconds total
  let attempts = 0;

  while (attempts < maxAttempts) {
    const balance = await fetchBalance(userId);

    if (balance.total >= expectedMinimum) {
      return balance; // Payment processed
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }

  throw new Error('Payment not reflected in balance after 60 seconds');
};
```

### 3. **Batch Operations**
```typescript
// Check multiple users' balances efficiently
const checkMultipleBalances = async (userIds: string[]) => {
  const promises = userIds.map(userId =>
    fetch(`/api/worker/billing/balance/${userId}`)
      .then(r => r.json())
      .catch(e => ({ userId, error: e.message }))
  );

  return Promise.all(promises);
};
```

---

## 🌐 **Publication System API**

### Overview
The publication system provides explicit user control over version deployment. Users create versions for preview/testing, then explicitly publish them to custom domains.

**Key Features:**
- **Publication-First Architecture**: Separate version creation from publication
- **Idempotent Operations**: Publishing is idempotent and usually completes in ≤5s (200). If redeployment is needed, you'll receive 202 Accepted with a job handle
- **Multi-Domain Support**: Both sheenapps.com subdomains and custom domains
- **Automatic Domain Resolution**: CNAME records updated on publication
- **Publication Control**: Users decide what goes live

### Request Signatures
All publication endpoints require HMAC-SHA256 signatures:

**Canonical string format**: `<raw-body><path-without-query>`
- Path example: `/projects/proj123/publish/ver456` (no query params)
- Use lowercase hex SHA-256 HMAC with your shared secret
- Empty body for GET requests: `<empty-string><path>`

```typescript
// Signature generation
const canonical = requestBody + pathWithoutQuery;
const signature = crypto.createHmac('sha256', sharedSecret).update(canonical).digest('hex');
```

### 1. **POST /v1/projects/${projectId}/publish/:versionId**

Publish a version to make it live on all configured domains.

#### Request
```typescript
const projectId = 'proj_abc123';
const versionId = 'ver_def456';
const body = JSON.stringify({
  userId: 'user_789',
  comment: 'Publishing stable version with bug fixes'
});

const response = await fetch(`${WORKER_BASE_URL}/v1/projects/${projectId}/publish/${versionId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
    'Idempotency-Key': 'unique-key-123' // Optional: Prevents double-publishing
  },
  body
});
```

#### Response

**Success (200) - Immediate completion:**
```typescript
{
  "success": true,
  "message": "Version published successfully",
  "publication": {
    "versionId": "ver_def456",
    "publishedAt": "2025-08-02T10:30:00Z",
    "publishedBy": "user_789",
    "comment": "Publishing stable version with bug fixes"
  },
  "domains": {
    "updated": [
      {
        "domain": "myapp.sheenapps.com",
        "type": "sheenapps",
        "status": "active",
        "previewUrl": "https://abc123.pages.dev"
      },
      {
        "domain": "app.example.com",
        "type": "custom",
        "status": "pending_verification",
        "previewUrl": "https://abc123.pages.dev"
      }
    ],
    "failed": []
  }
}
```

**Queued (202) - Async processing:**
```typescript
{
  "success": true,
  "state": "queued",
  "jobId": "job_xyz789",
  "estimatedTime": "30-60s",
  "message": "Publication queued for processing"
}
```

### 2. **POST /v1/projects/${projectId}/unpublish**

Unpublish the current live version.

#### Request
```typescript
const body = JSON.stringify({ userId: 'user_789' });

const response = await fetch(`${WORKER_BASE_URL}/v1/projects/${projectId}/unpublish`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  },
  body
});
```

#### Response
```typescript
{
  "success": true,
  "message": "Version unpublished successfully",
  "unpublishedVersion": "ver_def456",
  "notice": "Project has no published version until you publish a new one"
}
```

**Important**: Unpublishing removes the current live version entirely. The project will have no public site until you explicitly publish another version.

### 3. **GET /v1/projects/${projectId}/versions**

Get version history with publication status.

#### Request
```typescript
const params = new URLSearchParams({
  state: 'all', // 'published' | 'unpublished' | 'all'
  limit: '20',
  offset: '0'
});

const path = `/v1/projects/${projectId}/versions?${params}`;
const response = await fetch(`${WORKER_BASE_URL}${path}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': generateHMACv1('', timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  }
});
```

#### Response
```typescript
{
  "success": true,
  "versions": [
    {
      "id": "ver_def456",
      "name": "v2.4.3",
      "description": "Bug fixes and performance improvements",
      "type": "patch",
      "createdAt": "2025-08-02T09:15:00Z",
      "isPublished": true,
      "publishedAt": "2025-08-02T10:30:00Z",
      "publishedBy": "user_789",
      "previewUrl": "https://abc123.pages.dev",
      "canPreview": true,
      "canPublish": false,
      "canUnpublish": true
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### Publication Action Rules

The `canPublish`, `canUnpublish`, and `canPreview` flags follow these rules:

- **`canPublish: true`** - Version is deployed, not soft-deleted, and not currently published
- **`canPublish: false`** - Version is already published, soft-deleted, or build failed
- **`canUnpublish: true`** - Version is currently published
- **`canPreview: true`** - Version has a valid preview URL and deployment succeeded

### 4. **POST /v1/projects/${projectId}/domains**

Add a domain to the project.

**Domain Verification States:**
- **`pending_verification`** → Show DNS setup banner
- **`failed`** → Surface error & retry button
- **`active`** → Normal operation

#### Request
```typescript
const body = JSON.stringify({
  userId: 'user_789',
  domain: 'app.example.com',
  type: 'custom' // 'sheenapps' | 'custom'
});

const response = await fetch(`${WORKER_BASE_URL}/v1/projects/${projectId}/domains`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
  },
  body
});
```

---

## ↩️ **Rollback System API**

### Overview
The rollback system provides immediate version rollback with production-ready reliability. Users can instantly revert to any previous version while background processes handle working directory synchronization.

**Key Features:**
- **Immediate Response**: Preview URL updated instantly (< 1 second)
- **Background Sync**: Working directory synchronization handled asynchronously
- **Production Safety**: Redis locking, idempotency, and failure recovery
- **Build Queue Management**: Queues new builds during rollback, processes after completion
- **Publication Control**: Rollbacks create unpublished versions requiring explicit publication

### Request Signatures
All rollback endpoints require HMAC-SHA256 signatures with timing-safe comparison:

**Canonical string format**: `<raw-body><path-without-query>`
- Example: `{"userId":"user123","projectId":"proj456","targetVersionId":"ver789"}/v1/versions/rollback`
- Use lowercase hex SHA-256 HMAC with your shared secret

### 1. **POST /v1/versions/rollback**

Rollback to a previous version with immediate preview update and background working directory sync.

#### Request
```typescript
const body = JSON.stringify({
  userId: 'user_123',
  projectId: 'proj_456',
  targetVersionId: 'ver_789',
  skipWorkingDirectory: false // Optional: true for CI/CD scenarios
});

const response = await fetch(`${WORKER_BASE_URL}/v1/versions/rollback`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
    'Idempotency-Key': 'rollback-unique-key-123' // Optional: Prevents duplicate rollbacks
  },
  body
});
```

#### Request Body
- `userId` *(required)*: User ID for ownership verification
- `projectId` *(required)*: Project identifier
- `targetVersionId` *(required)*: Version to rollback to
- `skipWorkingDirectory` *(optional)*: Skip working directory sync (useful for CI/CD)

#### Response

**Success (200) - Immediate response:**
```typescript
{
  "success": true,
  "message": "Rollback initiated - preview updated immediately",
  "rollbackVersionId": "ver_rollback_123",
  "targetVersionId": "ver_789",
  "previewUrl": "https://abc123.pages.dev",
  "status": "rollingBack", // or "deployed" if skipWorkingDirectory: true
  "jobId": "job_456", // Present if background sync is running
  "workingDirectory": {
    "synced": false, // true if skipWorkingDirectory: true
    "message": "Background sync queued", // or "Working directory sync skipped"
    "extractedFiles": 0
  },
  "publishInfo": {
    "isPublished": false,
    "canPublish": true,
    "publishEndpoint": "/projects/proj_456/publish/ver_rollback_123",
    "notice": "This rollback version is available for preview but not published. Use the publish endpoint to make it live."
  }
}
```

**Error Responses:**
- **401 Unauthorized**: Invalid HMAC signature
- **404 Not Found**: Target version not found or no artifact available
- **409 Conflict**: Another rollback already in progress for this project
- **422 Unprocessable Entity**: Target version has no preview URL (never deployed)

```typescript
// Example error response
{
  "error": "rollback_in_progress",
  "message": "Another rollback is already in progress for this project"
}
```

### 2. **Build Request Behavior During Rollback**

When a project is in `rollingBack` status, new build requests are automatically queued and processed after rollback completion:

#### Automatic Queuing Response
```typescript
{
  "success": true,
  "queued": true,
  "jobId": "job_789",
  "buildId": "build_456",
  "status": "queued_rollback_pending",
  "message": "Request queued - rollback in progress. Build will start when rollback completes."
}
```

### 3. **Project Status States**

The rollback system introduces new project status states:

- **`rollingBack`**: Transitional state during background sync
- **`rollbackFailed`**: Final error state when rollback sync fails
- **`deployed`**: Normal state after successful rollback completion

When status is `rollbackFailed`, new build requests are rejected:
```typescript
{
  "error": "rollback_failed",
  "message": "Recent rollback failed. Please resolve issues before building.",
  "status": "rollbackFailed"
}
```

### 4. **Idempotency and Rate Limiting**

#### Idempotency Protection
- Use `Idempotency-Key` header to prevent duplicate rollbacks
- Keys are cached for 24 hours for successful rollbacks only
- Failed rollbacks are not cached to allow retries

#### Lock Protection
- Redis-based locking prevents concurrent rollbacks per project
- Lock TTL is configurable via `MAX_ROLLBACK_DURATION_SECONDS` (default: 300s)
- Lock automatically renewed for large artifacts during background sync

### 5. **Migration from Deprecated Endpoint**

**⚠️ Deprecated Endpoint**: `POST /v1/projects/${projectId}/versions/:versionId/rollback`

The old async endpoint has been removed. Requests to the deprecated endpoint return:

```typescript
// HTTP 410 Gone
{
  "error": "endpoint_deprecated",
  "message": "This endpoint has been deprecated and removed",
  "replacement": {
    "endpoint": "POST /v1/versions/rollback",
    "documentation": "/docs/API_REFERENCE_FOR_NEXTJS.md",
    "changes": [
      "Requires HMAC signature authentication",
      "Immediate response with background processing",
      "Enhanced error handling and idempotency"
    ]
  },
  "deprecatedSince": "2025-08-03",
  "removedSince": "2025-08-03"
}
```

### Integration Example

```typescript
// Complete rollback flow with status polling
export async function rollbackVersion(
  projectId: string,
  targetVersionId: string,
  userId: string
) {
  const rollbackBody = JSON.stringify({
    userId,
    projectId,
    targetVersionId,
    skipWorkingDirectory: false
  });

  // 1. Initiate rollback
  const rollbackResponse = await fetch(`${WORKER_BASE_URL}/v1/versions/rollback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(rollbackBody, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'Idempotency-Key': `rollback-${projectId}-${Date.now()}`
    },
    body: rollbackBody
  });

  const rollback = await rollbackResponse.json();

  if (!rollback.success) {
    throw new Error(rollback.message);
  }

  // 2. Preview is immediately available
  console.log('Preview updated:', rollback.previewUrl);

  // 3. Poll job status if background sync is running
  if (rollback.jobId && rollback.status === 'rollingBack') {
    await pollRollbackCompletion(rollback.jobId);
  }

  return rollback;
}

async function pollRollbackCompletion(jobId: string) {
  // Poll build events API for job completion
  // Implementation depends on your event polling system
}
```

---

## 🔍 **Audit & Monitoring API**

### Overview
Audit endpoints provide operational visibility for incident response and security monitoring.

**All Audit endpoints are read-only; they never mutate the working directory or deployment state.**

**Key Features:**
- **Automatic audit logging** - Every rollback/sync automatically appears in the audit log (no opt-in required)
- **Strict security limits** - Pagination and date-range limits prevent abuse
- **Classic offset pagination** - Uses standard `limit`/`offset` parameters (not cursor tokens)

### Common Error Responses

| Code | Error | When it happens |
|------|-------|----------------|
| 401 | `invalid_signature` | HMAC doesn't match |
| 404 | `not_found` | Project / version / domain missing |
| 409 | `publish_in_progress` | A publish/unpublish already running |
| 422 | `domain_unverified` | Custom domain hasn't passed DNS check |
| 422 | `version_not_deployable` | Version lacks required artifact or metadata |

### 1. **GET /v1/admin/v1/admin/audit/working-directory/changes**

Investigate file changes for incident response.

**⚠️ Note**: Rows appear only after automatic checksum verification passes; you may see a ~1-2s delay after a rollback.

#### Request
```typescript
const params = new URLSearchParams({
  projectId: 'proj_abc123',
  filename: 'main.css', // Optional: specific file
  fromDate: '2025-08-02T03:00:00Z',
  toDate: '2025-08-02T06:00:00Z',
  limit: '50',
  offset: '0'
});

const path = `/v1/admin/v1/admin/audit/working-directory/changes?${params}`;
const response = await fetch(`${WORKER_BASE_URL}${path}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': generateHMACv1('', timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex') // GET requests always sign an empty body
  }
});
```

#### Response
```typescript
{
  "success": true,
  "changes": [
    {
      "timestamp": "2025-08-02T03:15:42Z",
      "userId": "user_123",
      "projectId": "proj_456",
      "versionId": "ver_789",
      "action": "working_dir_sync",
      "filesWritten": 147, // count of filesystem entries created/overwritten
      "gitCommit": "a1b2c3d",
      "syncSource": "rollback"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**Rate Limits**:
- Max 100 entries per request
- Max 30-day date range
- Default: 7 days if no dates specified

### 2. **GET /v1/admin/v1/admin/audit/working-directory/suspicious**

Security monitoring for unusual activity.

**⚠️ Note**: Heuristics run hourly; querying more often will return identical data and may count against rate limits.

#### Response
```typescript
{
  "success": true,
  "suspicious": [
    {
      "timestamp": "2025-08-02T03:15:42Z",
      "userId": "user_123",
      "projectId": "proj_456",
      "suspiciousReasons": [
        "Operation performed outside business hours",
        "Unusually large number of files written"
      ],
      "filesWritten": 1247 // count of filesystem entries created/overwritten
    }
  ]
}
```

**Rate Limits**:
- Max 7-day date range for security queries
- Default: 24 hours if no dates specified

### 3. **GET /v1/admin/v1/admin/audit/working-directory/performance**

Performance monitoring for sync operations.

#### Response
```typescript
{
  "success": true,
  "performance": {
    "totalOperations": 156,
    "avgSyncTimeMs": 2340,
    "avgFilesWritten": 89,
    "successRate": 0.987, // success rate (0-1)
    "slowOperations": [
      {
        "timestamp": "2025-08-02T02:30:00Z",
        "userId": "user_123",
        "projectId": "proj_456",
        "elapsedMs": 45000,
        "filesWritten": 2100
      }
    ]
  }
}
```

**Rate Limits**:
- Max 14-day date range for performance queries
- Default: 24 hours if no dates specified

---

## 🔧 **Development & Testing**

### Environment Setup
```bash
# .env.local
WORKER_BASE_URL=http://localhost:3000
WORKER_SHARED_SECRET=dev-secret-123

# .env.production
WORKER_BASE_URL=https://worker.sheenapps.com
WORKER_SHARED_SECRET=prod-secret-xyz
```

### Testing Endpoints
```typescript
// Test balance endpoint
const testBalance = async () => {
  const response = await fetch('/api/worker/billing/balance/test-user-123');
  console.log('Balance:', await response.json());
};

// Test insufficient balance scenario
const testInsufficientBalance = async () => {
  const response = await fetch('/api/worker/billing/check-sufficient', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'user-with-no-balance',
      operationType: 'main_build',
      projectSize: 'large'
    })
  });
  console.log('Check result:', await response.json());
};
```

### Postman Collection
Import the updated collection: `docs/POSTMAN_SheenApps-Claude_Worker_API.postman_collection-2-Aug-2025.json`

- Set `sharedSecret` variable to your actual secret
- Test "AI Time Billing" folder for new endpoints
- Use "Error Examples" to test edge cases

---

## 📋 **Production Checklist**

### Before Going Live
- [ ] **Database migrations** - Run migrations 029, 030, and 031 for publication system
- [ ] **Secrets rotation** - Update `WORKER_SHARED_SECRET` in both apps
- [ ] **Webhook testing** - Verify Stripe webhooks credit balance correctly
- [ ] **Publication testing** - Test publish/unpublish workflow
- [ ] **Domain verification** - Test custom domain setup and DNS validation
- [ ] **Rate limit testing** - Verify 402 responses don't break UI
- [ ] **Balance polling** - Test post-payment balance updates
- [ ] **Error handling** - Test all 4xx/5xx scenarios
- [ ] **Performance testing** - Load test billing and publication endpoints
- [ ] **Monitoring setup** - Alert on daily reset failures and R2 garbage collection
- [ ] **Security audit** - Verify working directory endpoints are removed

### Monitoring Endpoints
- `GET /myhealthz` - Overall health
- `GET /claude-executor/health` - Claude executor health
- Daily reset job logs for billing system health

---

## 💡 **Best Practices**

### 1. **User Experience**
- **Always check balance** before showing build buttons
- **Show estimates** to set user expectations
- **Graceful degradation** when billing APIs are down
- **Clear error messages** for insufficient balance

### 2. **Performance**
- **Cache balance data** appropriately (30-60s)
- **Debounce balance checks** on rapid user actions
- **Batch API calls** when possible
- **Use estimates** to avoid unnecessary API calls

### 3. **Security**
- **Never expose** `WORKER_SHARED_SECRET` to frontend
- **Validate signatures** on all worker API calls
- **Sanitize user inputs** before worker API calls
- **Rate limit** your API routes that call worker
- ⚠️ **Critical: No request logging** - Proxy routes must NOT log signed request bodies (would leak secret)

### 4. **Reliability**
- **Implement retries** with exponential backoff
- **Handle partial failures** gracefully
- **Monitor billing endpoints** separately from core APIs
- **Have fallback flows** when billing is unavailable

---

## 📜 **Enhanced Version History API**

### Overview
Get comprehensive version history with artifact availability, action permissions, and retention information for intelligent UI decisions.

**New Features in v2.4:**
- **Artifact Availability Metadata**: Know which versions can be rolled back or previewed
- **Action Permissions**: Smart `canRollback`, `canPreview`, `canPublish` flags with business logic
- **Accessibility Hints**: Specific reasons why actions are disabled (`artifact_expired`, `already_published`, etc.)
- **Retention Information**: Days until artifact expiration for user awareness

### 1. **GET /v1/projects/${projectId}/versions**

Get version history with publication status and artifact availability.

#### Request
```typescript
const response = await fetch(`${WORKER_BASE_URL}/v1/projects/${projectId}/versions?state=all&limit=20`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

#### Query Parameters
- `state` *(optional)*: Filter by publication state (`published`, `unpublished`, `all`). Default: `all`
- `limit` *(optional)*: Number of versions to return (max 100). Default: `20`
- `offset` *(optional)*: Pagination offset. Default: `0`
- `includePatches` *(optional)*: Include patch versions. Default: `false`
- `showDeleted` *(optional)*: Include soft-deleted versions. Default: `false`

#### Enhanced Response Format
```typescript
{
  "success": true,
  "versions": [
    {
      "id": "ver_abc123",
      "semver": "1.2.3",
      "name": "Bug fixes and mobile improvements",
      "description": "Fixed layout issues on mobile devices",
      "type": "patch",
      "createdAt": "2025-08-03T10:30:00Z",
      "deployedAt": "2025-08-03T10:32:15Z",
      "stats": {
        "filesChanged": 8,
        "linesAdded": 45,
        "linesRemoved": 12
      },

      // Publication information
      "isPublished": true,
      "publishedAt": "2025-08-03T11:00:00Z",
      "publishedBy": "user_456",
      "userComment": "Emergency mobile fix",
      "previewUrl": "https://abc123.pages.dev",

      // 🆕 Artifact availability metadata
      "hasArtifact": true,
      "artifactSize": 15728640,

      // 🆕 Smart action permissions with business logic
      "canPreview": true,
      "canRollback": false,  // Published versions can't be rolled back
      "canPublish": false,   // Already published
      "canUnpublish": true,

      // 🆕 Accessibility hints for UI decisions
      "accessibility": {
        "rollbackDisabledReason": "already_published",
        "previewDisabledReason": null
      },

      // 🆕 Retention information for user awareness
      "retention": {
        "expiresAt": "2025-09-02T10:30:00Z",
        "daysRemaining": 30
      }
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Frontend Integration Example
```typescript
// Smart UI decisions based on artifact availability
function VersionRow({ version }: { version: Version }) {
  return (
    <div className="flex items-center justify-between p-3 border-b">
      <div>
        <h4>{version.name}</h4>
        <p className="text-sm text-gray-600">{version.description}</p>
        {!version.hasArtifact && (
          <p className="text-xs text-amber-600">
            ⚠️ Artifact expired ({version.retention.daysRemaining} days ago)
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!version.canPreview}
          title={version.accessibility.previewDisabledReason
            ? `Cannot preview: ${version.accessibility.previewDisabledReason.replace('_', ' ')}`
            : "Preview this version"
          }
        >
          Preview
        </Button>
        <Button
          disabled={!version.canRollback}
          title={version.accessibility.rollbackDisabledReason
            ? `Cannot rollback: ${version.accessibility.rollbackDisabledReason.replace('_', ' ')}`
            : "Rollback to this version"
          }
        >
          Rollback
        </Button>
      </div>
    </div>
  );
}
```

#### Accessibility Reason Codes
- `"artifact_missing"`: Version has no artifact URL
- `"artifact_expired"`: Artifact pruned due to retention policy
- `"already_published"`: Cannot rollback published versions
- `"deployment_failed"`: Version deployment failed
- `null`: No restrictions, action is available

---

## 📞 **Support & Contact**

For questions about this API reference:
- **Technical questions**: Create issue in worker repository
- **Integration help**: Review Postman collection examples
- **Production issues**: Check monitoring dashboards first

This reference covers all billing integration patterns. The worker APIs are production-ready and the Next.js team can now implement the frontend purchase flows and balance management.

## 💬 **Chat Plan Mode API**

### Overview
Chat Plan Mode provides a conversational interface with **AI-powered intent classification**. Simply send a message and the AI automatically determines the appropriate response type (question, feature, fix, analysis, etc.). No need to specify chat mode or manage session state - everything is handled backend-side.

### 🚀 Simplified v1 API Changes

| What Changed | Old (Never Released) | New (Production v1) |
|--------------|---------------------|--------------------|
| **Intent Classification** | Frontend specifies `chatMode` | AI auto-detects from message |
| **Session Management** | Frontend passes `sessionId` | Backend uses `projects.last_ai_session_id` |
| **Version/Build Context** | Frontend provides `versionId`/`buildId` | Backend fetches from projects table |
| **Request Complexity** | 7-9 fields required | Only 3-4 fields needed |
| **Response Mode** | Predetermined by request | AI-determined, shown in response |

### Key Features
- 🤖 **AI Auto-Detection**: AI classifies intent from natural language
- 🔄 **Automatic Session Continuity**: Backend manages sessionId via projects table
- 🌍 **Multi-language Support**: Full i18n with locale-aware responses
- 📡 **SSE Streaming**: Real-time response updates
- 🔨 **Build Conversion**: Transform plans into executable builds
- 📊 **Unified Timeline**: All interactions in one chronological view

### 1. Process Chat Plan Request (Simplified)

**Endpoint**: `POST /v1/chat-plan`

Send a message to the AI assistant. The AI automatically determines intent and responds appropriately.

#### Request
```typescript
interface SimplifiedChatPlanRequest {
  userId: string;
  projectId: string;
  message: string;
  locale?: string;         // e.g., 'en-US', 'ar-EG', 'fr-FR'
  context?: {              // Optional additional context
    includeVersionHistory?: boolean;
    includeProjectStructure?: boolean;
    includeBuildErrors?: boolean;
  };
}
// Note: No chatMode, sessionId, versionId, or buildId needed!
// Backend automatically:
// - Determines intent via AI classification
// - Uses last_ai_session_id from projects table
// - Fetches versionId/buildId from projects table
```

#### Response (Standard JSON)
```typescript
interface ChatPlanResponse {
  type: 'chat_response';
  subtype: 'success' | 'error' | 'partial';
  sessionId: string;        // For reference only - frontend doesn't manage
  messageId: string;
  timestamp: string;
  mode: ChatMode;           // AI-determined: 'question' | 'feature' | 'fix' | 'analysis' | 'build' | 'general'
  data: QuestionResponse | FeaturePlanResponse | FixPlanResponse | AnalysisResponse | GeneralResponse;
  metadata: {
    duration_ms: number;
    tokens_used: number;
    cache_hits?: number;
    projectContext: {
      versionId?: string;
      buildId?: string;
      lastModified: string;
    };
  };
  availableActions?: Array<{
    type: 'convert_to_build' | 'save_plan' | 'share' | 'export';
    label: string;
    payload?: any;
  }>;
}
```

#### AI Intent Classification

The AI automatically detects intent from message patterns:
- **Questions**: "How do I...", "What is...", "Where is..."
- **Features**: "Add...", "Implement...", "Create..."
- **Fixes**: "Fix...", "Not working", "Error when..."
- **Analysis**: "Analyze...", "Review...", "Check..."
- **Build**: "Build this", "Execute", "Deploy"
- **General**: Everything else

#### Response Types by Mode

**Question Mode**:
```typescript
interface QuestionResponse {
  answer: string;
  references?: Array<{
    file: string;
    line: number;
    snippet: string;
  }>;
  relatedTopics?: string[];
}
```

**Feature Mode**:
```typescript
interface FeaturePlanResponse {
  summary: string;
  feasibility: 'simple' | 'moderate' | 'complex';
  plan: {
    overview: string;
    steps: Array<{
      order: number;
      title: string;
      description: string;
      files: string[];
      estimatedEffort: 'low' | 'medium' | 'high';
    }>;
    dependencies: Array<{
      name: string;
      version?: string;
      reason: string;
    }>;
    risks: string[];
    alternatives?: string[];
  };
  buildPrompt?: string;  // Pre-generated prompt for conversion to build
}
```

**Fix Mode**:
```typescript
interface FixPlanResponse {
  issue: {
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
  };
  rootCause: string;
  solution: {
    approach: string;
    changes: Array<{
      file: string;
      changeType: 'modify' | 'create' | 'delete';
      description: string;
    }>;
    testingStrategy: string;
  };
  preventionTips?: string[];
  buildPrompt?: string;
}
```

#### SSE Streaming Support
For real-time updates, add `Accept: text/event-stream` header:

```typescript
function streamChat(projectId: string, message: string, onUpdate: (data: any) => void) {
  const eventSource = new EventSource('/v1/chat-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',  // Enable SSE
      'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
    },
    body: JSON.stringify({
      userId: currentUser.id,
      projectId,
      message,  // AI determines intent
      locale: currentUser.locale
    })
  });

  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    onUpdate(data);

    // Log AI-detected mode when available
    if (data.mode) {
      console.log('AI detected intent:', data.mode);
    }
  });

  eventSource.addEventListener('complete', () => {
    eventSource.close();
  });

  eventSource.addEventListener('error', (error) => {
    console.error('SSE error:', error);
    eventSource.close();
  });

  return eventSource;
}
```

### 2. Convert Plan to Build

**Endpoint**: `POST /v1/chat-plan/convert-to-build`

Convert a chat plan session into an actual build request.

#### Request
```typescript
interface ConvertToBuildRequest {
  sessionId: string;
  planData: any;      // The structured plan from chat response
  userId: string;
  projectId: string;
}
```

#### Response
```typescript
interface ConvertToBuildResponse {
  buildId: string;
  status: 'queued' | 'started';
}
```

### 3. Get Project Timeline

**Endpoint**: `GET /v1/project/:projectId/timeline`

Retrieve unified timeline of chat messages, builds, and deployments.

#### Query Parameters
- `limit`: Number of items (1-100, default 50)
- `offset`: Pagination offset (default 0)
- `mode`: Filter by mode ('all' | 'plan' | 'build', default 'all')
- `includeHidden`: Include hidden messages (default false)

#### Response
```typescript
interface TimelineResponse {
  items: Array<{
    id: string;
    project_id: string;
    user_id: string;
    created_at: string;
    timeline_seq: number;
    mode: 'plan' | 'build';
    chat_mode?: string;
    message_text: string;
    message_type: 'user' | 'assistant' | 'system' | 'error' | 'build_reference';
    response_data?: any;
    build_id?: string;
    version_id?: string;
    session_id?: string;
    locale?: string;
    language?: string;
    preview_url?: string;
    version_status?: string;
    artifact_url?: string;
    build_status?: string;
    build_duration?: number;
    timeline_status: 'deployed' | 'failed' | 'in_progress' | 'planning' | 'unknown';
  }>;
  hasMore: boolean;
  total: number;
  limit: number;
  offset: number;
}
```

### 4. Get Session Details (DISABLED)

**Endpoint**: `GET /v1/chat-plan/session/:sessionId` ⚠️ **Currently disabled for security**

Retrieve details about a specific chat plan session.

**Note**: This endpoint is currently commented out as it exposes sensitive session data. It should only be available to admin users when re-enabled.

#### Response
```typescript
interface SessionDetailsResponse {
  session: {
    id: string;
    user_id: string;
    project_id: string;
    session_id: string;
    created_at: string;
    last_active: string;
    message_count: number;
    total_tokens_used: number;
    total_ai_seconds_consumed: number;
    total_cost_usd: number;
    status: 'active' | 'converted' | 'expired' | 'archived';
    converted_to_build_id?: string;
    conversion_prompt?: string;
    metadata: any;
  };
  messages: Array<{
    // Same structure as timeline items
  }>;
}
```

### Frontend Integration Examples

#### Simple Message (AI Determines Intent)
```typescript
async function sendMessage(projectId: string, message: string) {
  const request: SimplifiedChatPlanRequest = {
    userId: currentUser.id,
    projectId,
    message,  // Just send the message - AI figures out the rest!
    locale: currentUser.locale
  };

  const response = await callWorkerAPI('/v1/chat-plan', 'POST', request);

  // Check what the AI determined
  console.log('AI detected mode:', response.mode);

  // Handle response based on mode
  switch (response.mode) {
    case 'question':
      showAnswer(response.data.answer, response.data.references);
      break;
    case 'feature':
      showFeaturePlan(response.data.plan);
      break;
    case 'fix':
      showFixProposal(response.data.solution);
      break;
    // ... etc
  }
}
```

#### Continuous Conversation
```typescript
async function continueConversation(projectId: string, followUp: string) {
  // No need to pass sessionId - backend uses last_ai_session_id from projects table!
  const response = await callWorkerAPI('/v1/chat-plan', 'POST', {
    userId: currentUser.id,
    projectId,
    message: followUp,
    locale: currentUser.locale
  });

  // Session continuity is automatic
  return response;
}
```

#### Feature Planning with Conversion
```typescript
async function sendFeatureRequest(projectId: string, description: string) {
  // 1. Send the message (AI will detect it's a feature request)
  const planResponse = await callWorkerAPI('/v1/chat-plan', 'POST', {
    userId: currentUser.id,
    projectId,
    message: description,  // e.g., "Add a dark mode toggle to settings"
    locale: currentUser.locale
  });

  // 2. Verify AI detected it as a feature
  if (planResponse.mode === 'feature') {
    const userApproved = await showFeaturePlan(planResponse.data.plan);

    if (userApproved) {
      // 3. Convert to build
      const buildResponse = await callWorkerAPI('/v1/chat-plan/convert-to-build', 'POST', {
      sessionId: planResponse.sessionId,
      planData: planResponse.data,
      userId: currentUser.id,
      projectId
    });

    // 4. Navigate to build progress
    router.push(`/project/${projectId}/build/${buildResponse.buildId}`);
  }
}
```

#### Timeline Component
```typescript
function ProjectTimeline({ projectId }: { projectId: string }) {
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState<'all' | 'plan' | 'build'>('all');

  useEffect(() => {
    async function loadTimeline() {
      const response = await callWorkerAPI(
        `/v1/project/${projectId}/timeline?mode=${mode}&limit=50`,
        'GET'
      );
      setItems(response.items);
    }
    loadTimeline();
  }, [projectId, mode]);

  return (
    <div className="timeline">
      {items.map(item => (
        <TimelineItem key={item.id} item={item} />
      ))}
    </div>
  );
}
```

### i18n Template Support

Assistant responses use template keys for consistent internationalization:

```typescript
// Frontend i18n bundle (messages/en.json)
{
  "chat": {
    "templates": {
      "initial_build_greeting": "I'll help you build {business_idea_summary}\!",
      "plan_thinking": "Analyzing your request...",
      "plan_suggestion": "Based on your codebase, I suggest {suggestion}",
      "question_response": "Here's what I found: {answer}",
      "feature_response": "I've created a plan for your feature: {summary}"
    }
  }
}

// Render template
function renderMessage(item: TimelineItem) {
  if (item.response_data?.template) {
    const template = t(`chat.templates.${item.response_data.template}`);
    return interpolate(template, item.response_data.variables);
  }
  return item.message_text;
}
```

### Billing & Rate Limits

#### AI Time Consumption by Auto-Detected Mode
- **Question**: ~30 seconds AI time
- **Feature**: ~120 seconds AI time
- **Fix**: ~90 seconds AI time
- **Analysis**: ~180 seconds AI time
- **Build**: ~150 seconds AI time
- **General**: ~30 seconds AI time

#### Rate Limits
- Per user: 100 requests/hour
- Per project: 200 requests/hour
- Per session: 50 messages max, 100k tokens max

### Error Handling

```typescript
try {
  const response = await callWorkerAPI('/v1/chat-plan', 'POST', request);
  // Handle success
} catch (error) {
  if (error.message === 'INSUFFICIENT_BALANCE') {
    // Show billing prompt
    showBillingPrompt();
  } else if (error.message === 'SESSION_EXPIRED') {
    // Start new session
    startNewSession();
  } else {
    // Generic error
    showError(error.message);
  }
}
```

### Best Practices

1. **No State Management**: Don't store sessionId/versionId/buildId - backend handles everything
2. **Trust AI Classification**: Let AI determine intent from natural language
3. **Locale Support**: Always pass user's locale for proper i18n
4. **Streaming**: Use SSE for long-running analysis/feature planning
5. **Show AI Mode**: Display detected mode to users for transparency
6. **Conversion Flow**: Show plan details before converting to build
7. **Timeline Pagination**: Implement infinite scroll with offset/limit
8. **Error Recovery**: Handle balance/rate limit errors gracefully
9. **Billing Awareness**: Show estimates based on AI-detected mode

---

## 🚀 **Cloudflare Three-Lane Deployment API**

### Overview
The Cloudflare Three-Lane Deployment system automatically routes applications to optimal deployment targets based on runtime requirements, code patterns, and infrastructure needs. It provides intelligent detection and deployment to:

- **Pages Static**: Static sites and SSG applications
- **Pages Edge**: Edge-optimized applications with dynamic features
- **Workers Node.js**: Full Node.js runtime for complex server-side applications

### Key Features
- 🤖 **Intelligent Detection**: Automatic deployment target selection based on code analysis
- 🔄 **Flexible Switching**: Runtime target switching based on build log analysis
- 🔗 **Supabase Integration**: Seamless environment variable injection for different deployment lanes
- 📊 **Analytics**: Comprehensive tracking of deployment lane selection and switching
- 🌍 **PPR Support**: Partial Prerendering detection for Next.js 15+
- 📈 **Performance Optimization**: ISR pattern detection and edge compatibility analysis

### 1. **POST /v1/cloudflare/detect-target**

Analyze a project and determine the optimal Cloudflare deployment target.

#### Request
```typescript
interface DetectTargetRequest {
  projectPath: string;
  userId?: string;
  projectId?: string;
  versionId?: string;
  options?: {
    forceReanalysis?: boolean;
    includeManifest?: boolean;
    skipCache?: boolean;
  };
}
```

#### Example
```typescript
const detectResponse = await callWorkerAPI('/v1/cloudflare/detect-target', 'POST', {
  projectPath: '/path/to/nextjs-project',
  userId: 'user_123',
  projectId: 'proj_456',
  options: {
    includeManifest: true
  }
});
```

#### Response
```typescript
interface DetectTargetResponse {
  success: true;
  data: {
    target: 'pages-static' | 'pages-edge' | 'workers-node';
    confidence: number;                    // 0.0 - 1.0
    reasons: string[];                     // Human-readable detection reasons
    origin: 'detection' | 'manual';       // How target was determined
    detectedAt: string;                    // ISO timestamp

    // Pattern detection results
    patterns: {
      hasServerComponents: boolean;
      hasApiRoutes: boolean;
      hasMiddleware: boolean;
      hasEdgeRuntime: boolean;
      hasISR: boolean;
      hasPPR: boolean;
      nextVersion: string;
      usesSupabase: boolean;
    };

    // Supabase integration details
    supabaseIntegration?: {
      detected: boolean;
      needsServiceRole: boolean;
      hasOAuth: boolean;
      environmentStrategy: 'basic' | 'oauth' | 'advanced';
    };

    // Full detection manifest (when requested)
    manifest?: {
      analysis: {
        packageJson: any;
        nextConfig: any;
        routeAnalysis: any;
      };
      recommendations: string[];
      alternatives: Array<{
        target: string;
        reasoning: string;
        tradeoffs: string[];
      }>;
      notes: string[];
    };
  };
}
```

#### Detection Logic
The system analyzes multiple factors to determine the optimal deployment target:

**Pages Static** (SSG/Static):
- No server components or API routes
- Static export configuration
- No middleware or edge runtime
- Simple Supabase client-side usage

**Pages Edge** (Edge-Optimized):
- Edge runtime compatibility
- Moderate server-side features
- PPR (Partial Prerendering) usage
- ISR patterns detected
- OAuth integrations

**Workers Node.js** (Full Runtime):
- Complex server components
- Heavy Node.js dependencies
- Service role Supabase usage
- Advanced middleware patterns
- Database integrations requiring full runtime

### 2. **POST /v1/cloudflare/deploy**

Deploy a project using the three-lane system with intelligent target selection.

#### Request
```typescript
interface ThreeLaneDeployRequest {
  projectPath: string;
  userId: string;
  projectId: string;
  versionId?: string;

  // Deployment configuration
  target?: 'pages-static' | 'pages-edge' | 'workers-node';  // Optional override
  envVars?: Record<string, string>;                        // Additional env vars
  buildCommand?: string;                                   // Custom build command

  // Advanced options
  options?: {
    allowTargetSwitching?: boolean;     // Allow runtime switching (default: true)
    validateAfterDeploy?: boolean;      // Run post-deploy validation (default: true)
    captureDeploymentUrl?: boolean;     // Capture final URL (default: true)
    monitorBuildLogs?: boolean;         // Monitor for switching triggers (default: true)
  };
}
```

#### Example
```typescript
const deployResponse = await callWorkerAPI('/v1/cloudflare/deploy', 'POST', {
  projectPath: '/path/to/nextjs-project',
  userId: 'user_123',
  projectId: 'proj_456',
  versionId: 'ver_789',
  envVars: {
    'CUSTOM_API_KEY': 'value123'
  },
  options: {
    allowTargetSwitching: true,
    validateAfterDeploy: true
  }
});
```

#### Response
```typescript
interface ThreeLaneDeployResponse {
  success: true;
  data: {
    deploymentId: string;
    initialTarget: string;
    finalTarget: string;
    switched: boolean;
    switchReason?: string;

    // Deployment results
    deploymentUrl: string;
    previewUrl?: string;
    buildDuration: number;           // milliseconds
    deployedAt: string;             // ISO timestamp

    // Build information
    buildLog: {
      summary: string;
      warnings: string[];
      errors: string[];
      switchTriggers?: string[];    // Log lines that triggered switching
    };

    // Environment details
    environment: {
      injectedVars: string[];      // Names of injected env vars
      supabaseConfig?: {
        strategy: string;
        varsInjected: string[];
      };
    };

    // Validation results
    validation?: {
      passed: boolean;
      checks: Array<{
        name: string;
        status: 'passed' | 'failed' | 'skipped';
        details?: string;
      }>;
    };
  };
}
```

### 3. **GET /v1/cloudflare/validate-deployment**

Validate a deployed application with lightweight smoke tests.

#### Query Parameters
- `deploymentUrl` (required): The deployment URL to validate
- `projectId` (optional): Project ID for context
- `checks` (optional): Comma-separated list of checks to run

#### Example
```typescript
const validationResponse = await callWorkerAPI(
  `/v1/cloudflare/validate-deployment?deploymentUrl=${encodeURIComponent(deploymentUrl)}&projectId=proj_456&checks=basic,supabase,performance`,
  'GET'
);
```

#### Response
```typescript
interface ValidationResponse {
  success: true;
  data: {
    deploymentUrl: string;
    validatedAt: string;
    overallStatus: 'healthy' | 'degraded' | 'failed';

    checks: Array<{
      name: string;
      status: 'passed' | 'failed' | 'warning';
      duration: number;           // milliseconds
      details: string;
      metrics?: Record<string, any>;
    }>;

    summary: {
      totalChecks: number;
      passed: number;
      failed: number;
      warnings: number;
    };

    recommendations?: string[];
  };
}
```

#### Available Validation Checks
- **basic**: HTTP status, response time, basic functionality
- **supabase**: Database connectivity, auth endpoints
- **performance**: Core Web Vitals, loading metrics
- **security**: HTTPS, headers, CSP validation
- **api**: API route functionality (if detected)

### 4. **GET /v1/cloudflare/deployment-history**

Get deployment history and analytics for a project or user.

#### Query Parameters
- `projectId` (optional): Filter by project
- `userId` (optional): Filter by user
- `limit` (optional): Number of records (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `includeAnalytics` (optional): Include aggregated analytics (default: false)

#### Example
```typescript
const historyResponse = await callWorkerAPI(
  `/v1/cloudflare/deployment-history?projectId=proj_456&limit=50&includeAnalytics=true`,
  'GET'
);
```

#### Response
```typescript
interface DeploymentHistoryResponse {
  success: true;
  data: {
    deployments: Array<{
      deploymentId: string;
      projectId: string;
      versionId?: string;
      userId: string;

      // Deployment details
      initialTarget: string;
      finalTarget: string;
      switched: boolean;
      switchReason?: string;

      // Timestamps
      detectedAt: string;
      deployedAt: string;

      // Results
      deploymentUrl?: string;
      buildDuration: number;
      status: 'deployed' | 'failed' | 'building' | 'analyzing';

      // Detection info
      reasons: string[];
      confidence: number;
      origin: 'detection' | 'manual';
    }>;

    // Analytics (when requested)
    analytics?: {
      totalDeployments: number;
      targetDistribution: {
        'pages-static': number;
        'pages-edge': number;
        'workers-node': number;
      };
      switchRate: number;           // Percentage of deployments that switched
      averageBuildTime: number;     // Milliseconds
      successRate: number;          // Percentage

      // Trends
      trendsLast30Days: {
        deploymentsPerDay: Array<{ date: string; count: number; }>;
        switchingTrends: Array<{ date: string; switchRate: number; }>;
      };
    };

    // Pagination
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
}
```

### 5. **GET /v1/cloudflare/deployment-guidance**

Get deployment guidance and recommendations for a project.

#### Query Parameters
- `projectPath` (required): Path to the project
- `framework` (optional): Override framework detection
- `includeAlternatives` (optional): Include alternative deployment strategies

#### Example
```typescript
const guidanceResponse = await callWorkerAPI(
  `/v1/cloudflare/deployment-guidance?projectPath=${encodeURIComponent('/path/to/project')}&includeAlternatives=true`,
  'GET'
);
```

#### Response
```typescript
interface DeploymentGuidanceResponse {
  success: true;
  data: {
    recommendedTarget: string;
    confidence: number;
    reasoning: string[];

    // Detailed guidance
    guidance: {
      preparation: Array<{
        step: string;
        description: string;
        required: boolean;
        commands?: string[];
      }>;

      configuration: Array<{
        file: string;
        changes: string[];
        optional: boolean;
      }>;

      environmentVars: Array<{
        name: string;
        description: string;
        required: boolean;
        source: 'supabase' | 'manual' | 'detection';
      }>;
    };

    // Alternative strategies
    alternatives?: Array<{
      target: string;
      pros: string[];
      cons: string[];
      migrationEffort: 'low' | 'medium' | 'high';
      useCase: string;
    }>;

    // Performance expectations
    performance: {
      buildTime: string;          // Estimated range
      coldStart: string;          // Expected cold start time
      scalability: string;        // Scaling characteristics
      costTier: 'free' | 'pro' | 'business';
    };

    // Best practices
    bestPractices: string[];
    commonPitfalls: string[];
  };
}
```

### Frontend Integration Examples

#### 1. **Smart Project Analysis**
```typescript
async function analyzeProject(projectPath: string, projectId: string) {
  try {
    // Get deployment recommendation
    const detection = await callWorkerAPI('/v1/cloudflare/detect-target', 'POST', {
      projectPath,
      projectId,
      options: { includeManifest: true }
    });

    // Show results to user
    setRecommendation({
      target: detection.data.target,
      confidence: detection.data.confidence,
      reasons: detection.data.reasons,
      patterns: detection.data.patterns
    });

    // Get detailed guidance
    const guidance = await callWorkerAPI(
      `/v1/cloudflare/deployment-guidance?projectPath=${encodeURIComponent(projectPath)}&includeAlternatives=true`,
      'GET'
    );

    setDeploymentGuidance(guidance.data);

  } catch (error) {
    console.error('Project analysis failed:', error);
    showError('Failed to analyze project for deployment');
  }
}
```

#### 2. **One-Click Deployment**
```typescript
async function deployWithThreeLanes(projectPath: string, projectId: string, versionId: string) {
  try {
    // Start deployment
    setDeploymentStatus('analyzing');

    const deployment = await callWorkerAPI('/v1/cloudflare/deploy', 'POST', {
      projectPath,
      userId: currentUser.id,
      projectId,
      versionId,
      options: {
        allowTargetSwitching: true,
        validateAfterDeploy: true,
        captureDeploymentUrl: true
      }
    });

    // Update UI with results
    setDeploymentStatus('deployed');
    setDeploymentResults({
      url: deployment.data.deploymentUrl,
      target: deployment.data.finalTarget,
      switched: deployment.data.switched,
      buildTime: deployment.data.buildDuration,
      validation: deployment.data.validation
    });

    // Show switching notification if target changed
    if (deployment.data.switched) {
      showNotification(
        `Deployment automatically switched to ${deployment.data.finalTarget}: ${deployment.data.switchReason}`,
        'info'
      );
    }

  } catch (error) {
    setDeploymentStatus('failed');
    showError(`Deployment failed: ${error.message}`);
  }
}
```

#### 3. **Deployment History Dashboard**
```typescript
function DeploymentHistoryDashboard({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await callWorkerAPI(
          `/v1/cloudflare/deployment-history?projectId=${projectId}&limit=50&includeAnalytics=true`,
          'GET'
        );
        setHistory(response.data);
      } catch (error) {
        console.error('Failed to load deployment history:', error);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [projectId]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="deployment-history">
      {/* Analytics Summary */}
      <div className="analytics-grid">
        <MetricCard
          title="Total Deployments"
          value={history.analytics.totalDeployments}
        />
        <MetricCard
          title="Switch Rate"
          value={`${history.analytics.switchRate}%`}
        />
        <MetricCard
          title="Success Rate"
          value={`${history.analytics.successRate}%`}
        />
        <MetricCard
          title="Avg Build Time"
          value={`${Math.round(history.analytics.averageBuildTime / 1000)}s`}
        />
      </div>

      {/* Target Distribution Chart */}
      <TargetDistributionChart data={history.analytics.targetDistribution} />

      {/* Deployment Timeline */}
      <div className="deployment-timeline">
        {history.deployments.map(deployment => (
          <DeploymentTimelineItem
            key={deployment.deploymentId}
            deployment={deployment}
          />
        ))}
      </div>
    </div>
  );
}
```

#### 4. **Real-time Validation**
```typescript
async function validateDeployment(deploymentUrl: string, projectId: string) {
  try {
    setValidationStatus('running');

    const validation = await callWorkerAPI(
      `/v1/cloudflare/validate-deployment?deploymentUrl=${encodeURIComponent(deploymentUrl)}&projectId=${projectId}&checks=basic,supabase,performance`,
      'GET'
    );

    setValidationResults(validation.data);

    // Show status indicator
    const status = validation.data.overallStatus;
    setHealthStatus(status);

    // Alert on failures
    if (status === 'failed') {
      const failedChecks = validation.data.checks.filter(c => c.status === 'failed');
      showAlert(`Validation failed: ${failedChecks.map(c => c.name).join(', ')}`);
    }

  } catch (error) {
    setValidationStatus('error');
    console.error('Validation failed:', error);
  }
}
```

### Database Integration

The three-lane deployment system automatically tracks deployment decisions in your database. Query deployment lane data using:

```sql
-- View all deployment lanes for projects
SELECT
    p.name as project_name,
    p.deployment_lane,
    p.deployment_lane_detected_at,
    p.deployment_lane_reasons,
    p.deployment_lane_switched
FROM projects p
WHERE p.deployment_lane IS NOT NULL;

-- View deployment analytics
SELECT * FROM deployment_lane_analytics
ORDER BY total_deployments DESC;

-- Get project deployment history
SELECT * FROM get_project_deployment_history('your-project-uuid');
```

See the included `scripts/query-deployment-lanes-db.sql` for comprehensive analytics queries.

### Error Handling

```typescript
try {
  const result = await callWorkerAPI('/v1/cloudflare/detect-target', 'POST', request);
} catch (error) {
  switch (error.code) {
    case 'PROJECT_NOT_FOUND':
      showError('Project not found. Please check the project path.');
      break;
    case 'INVALID_FRAMEWORK':
      showError('Unsupported framework. Only Next.js projects are currently supported.');
      break;
    case 'DETECTION_FAILED':
      showError('Unable to analyze project. Please check project structure.');
      break;
    case 'DEPLOYMENT_FAILED':
      showError(`Deployment failed: ${error.details}`);
      break;
    case 'VALIDATION_FAILED':
      showError('Post-deployment validation failed. Deployment may have issues.');
      break;
    default:
      showError(`Deployment error: ${error.message}`);
  }
}
```

### Rate Limits & Billing

- **Detection**: ~15-30 seconds processing time
- **Deployment**: ~2-5 minutes depending on target and project size
- **Validation**: ~10-30 seconds depending on checks selected
- **Rate Limits**:
  - 50 detections per hour per user
  - 20 deployments per hour per user
  - 100 validations per hour per user

### Best Practices

1. **Trust the Detection**: The system analyzes multiple factors - trust the recommended target
2. **Enable Target Switching**: Allow runtime switching for optimal deployment outcomes
3. **Use Validation**: Always validate deployments, especially for production
4. **Monitor Analytics**: Track deployment patterns to optimize your workflow
5. **Database Queries**: Use provided SQL queries for deployment analytics
6. **Error Recovery**: Handle detection and deployment failures gracefully
7. **Performance Monitoring**: Use validation checks to ensure deployment health

---

## 📱 **Persistent Chat API (NEW - Aug 24, 2025)**

### Overview

Production-ready real-time team collaboration with persistent message history, cross-device synchronization, and enterprise-scale features including SSE connection limits and comprehensive i18n support.

**🚀 NEW: SSE Connection Limits**
- **DoS Protection**: Maximum 5 SSE connections per user/project
- **429 Rate Limiting**: Graceful fallback with BroadcastChannel follower mode
- **Automatic Leader Election**: Cross-tab coordination for optimal resource usage
- **Connection Monitoring**: Debug endpoints for troubleshooting

### Key Features

- 🔢 **Sequence-based pagination**: Race-condition free infinite scroll
- 🆔 **Idempotency protection**: `client_msg_id` prevents duplicates
- 📱 **Cross-device sync**: Messages persist across all sessions
- 🌍 **i18n system messages**: Multi-language presence notifications
- 📡 **Real-time SSE streaming**: Connection-limited WebSocket alternative
- 🔍 **PostgreSQL FTS**: Full-text search with unaccent/trigram
- ✅ **Read receipts**: Cross-device synchronized read status
- 👥 **Presence & typing**: TTL-based indicators with auto-cleanup

### Core Endpoints

#### **POST /v1/projects/:projectId/chat/messages**
Send messages with idempotency protection.

```typescript
// Send message
const response = await fetch('/v1/projects/proj-123/chat/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'user-456',
    'x-user-type': 'client',
    'x-sheen-locale': 'en',
    'x-sheen-signature': generateHMACv1(body, timestamp, secret),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': nonce
  },
  body: JSON.stringify({
    text: 'Hello team! Let\'s add authentication.',
    mode: 'unified',
    client_msg_id: crypto.randomUUID() // Required for idempotency
  })
});
```

#### **GET /v1/projects/:projectId/chat/stream** (SSE)
Real-time streaming with connection limits.

⚠️ **CONNECTION LIMITS**: Max 5 per user/project. On limit exceeded (429), implement BroadcastChannel follower mode.

```typescript
const eventSource = new EventSource('/v1/projects/proj-123/chat/stream?from_seq=0');

eventSource.onerror = async (error) => {
  // Check for 429 - connection limit exceeded
  if (error.status === 429) {
    const errorData = await response.json();
    console.log('Connection limit exceeded:', errorData.recommendation);
    // Implement BroadcastChannel follower mode
    switchToFollowerMode();
  }
};
```

#### **GET /v1/projects/:projectId/chat/messages**
Message history with sequence-based pagination.

```typescript
// Recent messages
const recent = await fetch('/v1/projects/proj-123/chat/messages?limit=20&order=desc');

// Infinite scroll (older messages)
const older = await fetch(`/v1/projects/proj-123/chat/messages?before_seq=100&limit=20`);
```

#### **PUT /v1/projects/:projectId/chat/read**
Mark messages as read (throttled updates recommended).

```typescript
// Throttled pattern (recommended)
const throttledMarkAsRead = throttle(async (seq) => {
  await fetch(`/v1/projects/${projectId}/chat/read`, {
    method: 'PUT',
    body: JSON.stringify({ up_to_seq: seq })
  });
}, 2000);
```

### Connection Limit Handling

When SSE connections exceed 5 per user/project:

**429 Response:**
```json
{
  "error": "too_many_connections",
  "current_connections": 5,
  "max_connections": 5,
  "retry_after_ms": 10000,
  "recommendation": "Close other chat windows or switch this tab to follower mode"
}
```

**Client Implementation:**
```typescript
class PersistentChatConnection {
  private mode: 'leader' | 'follower' | 'disconnected' = 'disconnected';

  async connect() {
    try {
      const eventSource = new EventSource(`/v1/projects/${projectId}/chat/stream`);
      this.mode = 'leader';
    } catch (error) {
      if (error.status === 429) {
        this.mode = 'follower';
        this.setupBroadcastChannelListener(); // Cross-tab message sharing
        this.scheduleLeaderRetry(error.retry_after_ms);
      }
    }
  }
}
```

### i18n System Messages

System messages include localization data for multi-language support:

```typescript
// Frontend localization
const localizeSystemMessage = (message) => {
  const systemData = message.response_data?.systemMessage;
  if (!systemData) return message.text;

  // Direct integration with existing i18n
  return t(systemData.code, systemData.params, { lng: locale });
};

// Example system message data
{
  "response_data": {
    "systemMessage": {
      "code": "presence.user_joined",
      "params": { "userName": "John", "userId": "user-123" },
      "timestamp": "2025-08-24T10:30:00Z"
    }
  }
}
```

**Translation keys to add:**
```json
{
  "presence.user_joined": "{userName} joined the chat",
  "presence.user_left": "{userName} left the chat",
  "presence.typing_start": "{userName} is typing...",
  "presence.typing_stop": "{userName} stopped typing"
}
```

### Debug & Monitoring

**GET /v1/debug/sse-connections/:projectId** - Monitor connection usage:

```typescript
const debug = await fetch('/v1/debug/sse-connections/proj-123');
// Returns: connection_count, max_connections, active connections, health status
```

### Best Practices

1. **Always use client_msg_id** - Required for idempotency
2. **Handle 429 gracefully** - Implement BroadcastChannel follower mode
3. **Throttle read receipts** - Max every 2 seconds
4. **Use sequence pagination** - More reliable than timestamp-based
5. **Monitor connection limits** - Use debug endpoint for troubleshooting
6. **Cross-tab coordination** - One SSE connection per user/project
7. **Memoize system messages** - Optimize frequent presence updates
8. **Clean disconnections** - Close EventSource on unmount

### Rate Limits

- **Messages**: 100/minute per user
- **SSE connections**: 5 simultaneous per user/project
- **Presence updates**: 1/second (recommended: 15s heartbeat)
- **Search**: 60 queries/minute per user

For complete implementation guide with connection management examples, see `docs/CLIENT_SSE_CONNECTION_LIMITS.md`.

---

## 💳 Stripe Payments Integration

**NEW**: Complete Stripe payments system integrated into Worker backend (Aug 25, 2025)

### Overview

The Worker now handles all Stripe payment processing with production-ready security and async webhook processing.

**Key Features:**
- ✅ Plan-based subscriptions (Starter, Growth, Scale)
- 🔒 HMAC authentication with claims-based authorization
- 🔄 Idempotency protection
- 🌍 Internationalization support (EN/AR/FR)
- 🛡️ Server-side price validation
- ⚡ Async webhook processing

### Authentication Requirements

Payment endpoints require **both HMAC signatures AND user claims**:

```typescript
interface PaymentClaims {
  userId: string
  email: string
  roles: string[]
  issued: number    // Unix timestamp
  expires: number   // Unix timestamp
}

// Example headers for payment requests
const headers = {
  'x-sheen-signature': generateHMACv1(body, timestamp, secret),
  'x-sheen-sig-v2': generateHMACv2('POST', path, body, timestamp, nonce, secret),
  'x-sheen-timestamp': timestamp.toString(),
  'x-sheen-nonce': randomNonce,
  'x-sheen-claims': btoa(JSON.stringify(claims)),
  'x-idempotency-key': uniqueKey,
  'x-sheen-locale': 'en' // Optional
}
```

### Endpoints

#### 1. Create Checkout Session

**POST /v1/payments/checkout**

Create a Stripe checkout session for plan subscription.

```typescript
// Request
interface CheckoutRequest {
  planId: 'starter' | 'growth' | 'scale'
  trial?: boolean  // Optional 14-day trial
}

// Response
interface CheckoutResponse {
  success: true
  url: string           // Stripe checkout URL
  sessionId: string     // Session ID for tracking
  correlationId: string
}

// Usage example
const createCheckout = async (planId: string, userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(16).toString('hex')
  const idempotencyKey = `checkout-${userSession.user.id}-${planId}-${Date.now()}`

  const claims: PaymentClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['user'],
    issued: timestamp,
    expires: timestamp + 300 // 5 minutes
  }

  const body = JSON.stringify({ planId, trial: true })

  const response = await fetch(`${WORKER_BASE_URL}/v1/payments/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': nonce,
      'x-sheen-claims': btoa(JSON.stringify(claims)),
      'x-idempotency-key': idempotencyKey,
      'x-sheen-locale': 'en'
    },
    body
  })

  if (response.ok) {
    const { url } = await response.json()
    window.location.href = url // Redirect to Stripe checkout
  }
}
```

#### 2. Create Billing Portal Session

**POST /v1/payments/portal**

Create a Stripe billing portal session for subscription management.

```typescript
// Request
interface PortalRequest {
  returnUrl?: string  // Optional return URL
}

// Response
interface PortalResponse {
  success: true
  url: string           // Billing portal URL
  correlationId: string
}

// Usage
const manageBilling = async (userSession: Session, returnUrl?: string) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: PaymentClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['user'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const body = JSON.stringify({ returnUrl })

  const response = await fetch(`${WORKER_BASE_URL}/v1/payments/portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims))
    },
    body
  })

  if (response.ok) {
    const { url } = await response.json()
    window.open(url, '_blank') // Open portal in new tab
  }
}
```

#### 3. Cancel Subscription

**POST /v1/payments/cancel**

Cancel user's active subscription.

```typescript
// Request
interface CancelRequest {
  immediately?: boolean  // Default: false (cancel at period end)
}

// Response
interface CancelResponse {
  success: true
  canceledImmediately: boolean
  correlationId: string
}

// Usage
const cancelSubscription = async (userSession: Session, immediately = false) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: PaymentClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['user'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const body = JSON.stringify({ immediately })

  const response = await fetch(`${WORKER_BASE_URL}/v1/payments/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims))
    },
    body
  })

  const result = await response.json()
  if (result.success) {
    // Handle cancellation success
    if (result.canceledImmediately) {
      // Subscription canceled immediately
    } else {
      // Will cancel at end of current period
    }
  }
}
```

#### 4. Get Subscription Status

**GET /v1/payments/status/:userId**

Get current subscription status for a user.

```typescript
// Response
interface StatusResponse {
  hasSubscription: boolean
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | null
  planName: string | null
  currentPeriodEnd: string | null  // ISO date
  cancelAtPeriodEnd: boolean | null
}

// Usage
const getSubscriptionStatus = async (userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: PaymentClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['user'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const response = await fetch(`${WORKER_BASE_URL}/v1/payments/status/${userSession.user.id}`, {
    method: 'GET',
    headers: {
      'x-sheen-signature': generateHMACv1('', timestamp.toString(), secret), // Empty body for GET
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims))
    }
  })

  const status: StatusResponse = await response.json()
  return status
}

// Usage in component
const SubscriptionStatus = () => {
  const [status, setStatus] = useState<StatusResponse | null>(null)

  useEffect(() => {
    const loadStatus = async () => {
      const userStatus = await getSubscriptionStatus(session)
      setStatus(userStatus)
    }
    loadStatus()
  }, [])

  if (!status?.hasSubscription) {
    return <UpgradePrompt />
  }

  return (
    <div className="subscription-status">
      <h3>Subscription: {status.planName}</h3>
      <p>Status: {status.status}</p>
      {status.currentPeriodEnd && (
        <p>Next billing: {new Date(status.currentPeriodEnd).toLocaleDateString()}</p>
      )}
      {status.cancelAtPeriodEnd && (
        <p className="text-yellow-600">Will cancel at period end</p>
      )}
    </div>
  )
}
```

#### 5. Webhook Endpoint (Stripe Only)

**POST /v1/payments/webhooks**

⚠️ **This endpoint does NOT use HMAC authentication** - it uses Stripe's signature verification.

```typescript
// This endpoint is called directly by Stripe
// No authentication headers required from your app
// Stripe includes 'stripe-signature' header for verification

// The webhook handles these events automatically:
// - checkout.session.completed
// - checkout.session.async_payment_succeeded
// - checkout.session.async_payment_failed
// - customer.subscription.updated
// - invoice.payment_succeeded (renewals)
// - invoice.payment_failed
```

#### 6. Health Check

**GET /v1/payments/health**

Check payment system health (no authentication required).

```typescript
// Response
interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  stripe: {
    configured: boolean
    environment: 'test' | 'live'
    priceCount: number
  }
  database: {
    connected: boolean
    migrations: 'up-to-date' | 'pending'
  }
  queue: {
    active: boolean
    pending: number
    failed: number
  }
}

// Usage
const checkPaymentHealth = async () => {
  const response = await fetch(`${WORKER_BASE_URL}/v1/payments/health`)
  const health: HealthResponse = await response.json()

  if (health.status !== 'healthy') {
    console.warn('Payment system health check failed', health)
  }

  return health
}
```

### Integration Patterns

#### React Hook for Subscription Management

```typescript
// hooks/useSubscription.ts
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface SubscriptionHook {
  status: StatusResponse | null
  loading: boolean
  error: string | null
  createCheckout: (planId: string) => Promise<void>
  manageBilling: () => Promise<void>
  cancelSubscription: (immediately?: boolean) => Promise<void>
  refresh: () => Promise<void>
}

export const useSubscription = (): SubscriptionHook => {
  const { data: session } = useSession()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    if (!session?.user) return

    try {
      setLoading(true)
      const newStatus = await getSubscriptionStatus(session)
      setStatus(newStatus)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription')
    } finally {
      setLoading(false)
    }
  }

  const createCheckout = async (planId: string) => {
    if (!session?.user) return
    await createCheckout(planId, session)
  }

  const manageBilling = async () => {
    if (!session?.user) return
    await manageBilling(session)
  }

  const cancelSubscription = async (immediately = false) => {
    if (!session?.user) return
    await cancelSubscription(session, immediately)
    await refresh() // Reload status after cancellation
  }

  useEffect(() => {
    if (session?.user) {
      refresh()
    }
  }, [session?.user])

  return {
    status,
    loading,
    error,
    createCheckout,
    manageBilling,
    cancelSubscription,
    refresh
  }
}
```

#### Component Examples

```tsx
// components/PricingCard.tsx
const PricingCard = ({ planId, price, features }: PricingCardProps) => {
  const { createCheckout, status, loading } = useSubscription()
  const isCurrentPlan = status?.planName?.toLowerCase().includes(planId)

  return (
    <div className="pricing-card">
      <h3>{planId.charAt(0).toUpperCase() + planId.slice(1)} Plan</h3>
      <p className="price">${price}/month</p>
      <ul>
        {features.map((feature, i) => <li key={i}>{feature}</li>)}
      </ul>

      <button
        onClick={() => createCheckout(planId)}
        disabled={loading || isCurrentPlan}
        className={isCurrentPlan ? 'current-plan' : 'upgrade-button'}
      >
        {isCurrentPlan ? 'Current Plan' : 'Choose Plan'}
      </button>
    </div>
  )
}

// components/BillingSection.tsx
const BillingSection = () => {
  const { status, manageBilling, cancelSubscription, loading } = useSubscription()

  if (loading) return <div>Loading subscription...</div>

  if (!status?.hasSubscription) {
    return <PricingCards />
  }

  return (
    <div className="billing-section">
      <h2>Subscription Management</h2>

      <div className="current-plan">
        <h3>{status.planName}</h3>
        <p>Status: {status.status}</p>
        {status.currentPeriodEnd && (
          <p>Next billing: {new Date(status.currentPeriodEnd).toLocaleDateString()}</p>
        )}
      </div>

      <div className="billing-actions">
        <button onClick={manageBilling} className="primary">
          Manage Billing
        </button>

        {!status.cancelAtPeriodEnd && (
          <button
            onClick={() => cancelSubscription(false)}
            className="secondary"
          >
            Cancel Subscription
          </button>
        )}

        {status.cancelAtPeriodEnd && (
          <p className="text-yellow-600">
            Subscription will cancel at period end
          </p>
        )}
      </div>
    </div>
  )
}
```

### Error Handling

```typescript
// Common error responses
interface PaymentError {
  success: false
  error: string
  code?: string
  timestamp: string
}

// Handle payment errors
const handlePaymentError = (error: PaymentError) => {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
      // User has no Stripe customer record
      return 'Please contact support to set up billing'

    case 'SUBSCRIPTION_NOT_FOUND':
      // No active subscription to cancel
      return 'No active subscription found'

    case 'INVALID_PLAN':
      // Invalid plan ID provided
      return 'Selected plan is not available'

    default:
      return error.error || 'Payment operation failed'
  }
}
```

### Testing

#### Environment Setup

```bash
# Required environment variables
STRIPE_SECRET_KEY=sk_test_... # or sk_live_...
STRIPE_WEBHOOK_SECRET_PRIMARY=whsec_...
STRIPE_PRICE_STARTER_USD=price_...
STRIPE_PRICE_GROWTH_USD=price_...
STRIPE_PRICE_SCALE_USD=price_...
```

#### Test Workflow

1. **Health Check**: Verify system configuration
2. **Checkout Flow**: Create session → Complete payment → Verify webhook
3. **Status Check**: Confirm subscription activation
4. **Portal Access**: Test billing management
5. **Cancellation**: Test both immediate and end-of-period cancellation

```typescript
// Test helper
const testPaymentFlow = async () => {
  // 1. Check health
  const health = await checkPaymentHealth()
  console.log('Payment system health:', health.status)

  // 2. Get initial status
  const initialStatus = await getSubscriptionStatus(session)
  console.log('Initial subscription:', initialStatus.hasSubscription)

  // 3. Create checkout (redirects to Stripe)
  await createCheckout('starter', session)

  // 4. After payment success, poll for status
  setTimeout(async () => {
    const updatedStatus = await getSubscriptionStatus(session)
    console.log('Post-payment status:', updatedStatus.status)
  }, 5000)
}
```

### Security Notes

1. **Claims Validation**: All payment endpoints validate user claims and expiration
2. **Price Allowlist**: Server validates all price IDs against allowlist
3. **Idempotency**: Use unique keys to prevent duplicate operations
4. **Webhook Security**: Multi-secret verification with signature validation
5. **User Authorization**: Users can only access their own subscription data

### Rate Limits

- **Checkout Creation**: 10 requests/minute per user
- **Status Queries**: 60 requests/minute per user
- **Portal Sessions**: 5 requests/minute per user
- **Cancellations**: 2 requests/minute per user

### Migration from Next.js Payments

If migrating from existing Next.js Stripe integration:

1. Update checkout flow to use Worker endpoints
2. Replace direct Stripe calls with Worker API calls
3. Update webhook processing to point to Worker
4. Migrate customer data using provided migration scripts
5. Test thoroughly in Stripe test mode before going live

---

## 🎯 **Advisor Network Endpoints**

**Status**: ✅ Production Ready (August 25, 2025)
**Features**: Expert consultations, platform-fixed pricing, monthly payouts

### Overview

The Advisor Network allows **approved advisors** to offer paid consultations to clients at platform-fixed rates:
- **15 minutes**: $9.00 (Advisor gets $6.30, Platform $2.70)
- **30 minutes**: $19.00 (Advisor gets $13.30, Platform $5.70)
- **60 minutes**: $35.00 (Advisor gets $24.50, Platform $10.50)

**Key Features**:
- 🎯 Platform-fixed pricing (non-negotiable)
- 🔒 Privacy protection (advisors only see client first names)
- ⏰ Automatic refund policy (>24h = refund, ≤24h = no refund)
- 💰 Monthly advisor payouts via Stripe Connect
- 📅 Cal.com integration for scheduling
- ⭐ Rating and review system

### Authentication Requirements

All authenticated endpoints require **HMAC signatures AND user claims** (same pattern as payment endpoints):

```typescript
interface AdvisorClaims {
  userId: string
  email: string
  roles: string[]  // 'user', 'advisor', 'admin'
  issued: number   // Unix timestamp
  expires: number  // Unix timestamp
}

// Example headers for advisor network requests
const headers = {
  'x-sheen-signature': generateHMACv1(body, timestamp, secret),
  'x-sheen-timestamp': timestamp.toString(),
  'x-sheen-nonce': randomNonce,
  'x-sheen-claims': btoa(JSON.stringify(claims)),
  'x-correlation-id': uuid(), // Recommended for tracking
  'x-sheen-locale': 'en'   // Optional: en|ar|fr|es|de
}
```

---

### Public Endpoints (No Authentication)

#### 1. Get Platform Pricing

**GET /api/v1/consultations/pricing?advisor_user_id={userId}** (Required)

Get consultation pricing for a specific advisor. Returns advisor-specific free consultation offerings. Uses user_id, not advisor table id.

```typescript
// Response
interface PricingResponse {
  success: true
  pricing: {
    15: {
      duration_minutes: 15
      price_cents: 900
      price_display: "$9.00"
      currency: "USD"
    }
    30: {
      duration_minutes: 30
      price_cents: 1900
      price_display: "$19.00"
      currency: "USD"
    }
    60: {
      duration_minutes: 60
      price_cents: 3500
      price_display: "$35.00"
      currency: "USD"
    }
  }
  platform_fee_percentage: 30
  currency: "USD"

  // NEW: Advisor-specific fields (only when advisor_id provided)
  advisor_pricing_model?: "platform_fixed" | "free_only" | "hybrid"
  free_consultations_available?: {
    "15": boolean
    "30": boolean
    "60": boolean
  }
}

// Usage Examples
const getAdvisorPricing = async (advisorId: string) => {
  // Advisor-specific pricing with free consultation detection
  // Note: advisor_id is now REQUIRED (use advisor.id from profile API)
  const response = await fetch(`${WORKER_BASE_URL}/api/v1/consultations/pricing?advisor_user_id=${advisorUserId}`)
  const pricing = await response.json()

  // Check if advisor offers free consultations
  const isFree15 = pricing.free_consultations_available?.["15"] === true
  console.log('15-min with advisor:', pricing.pricing[15].price_display) // "Free" or "$9.00"

  // Use in booking flow
  if (isFree15) {
    // Skip payment flow for free consultation
    bookDirectly()
  } else {
    // Use existing Stripe payment flow
    processPayment(pricing.pricing[15].price_cents)
  }
}
```

#### 2. Search Advisors

**GET /api/v1/advisors/search**

Discover advisors with filtering capabilities.

```typescript
// Query parameters
interface AdvisorSearchParams {
  specialty?: string     // 'frontend', 'fullstack', 'ecommerce'
  language?: string      // 'English', 'Arabic', 'French'
  rating_min?: number    // Minimum rating (0-5)
  limit?: number         // Results limit (default: 20, max: 50)

  // Pagination: Use either page OR offset (not both)
  page?: number          // Page number (1-based, default: 1)
  offset?: number        // Direct offset (0-based, overrides page)
}

// Response
interface AdvisorSearchResponse {
  success: true
  advisors: Advisor[]
  total_found: number
  pagination: {
    limit: number
    offset: number
  }
}

interface Advisor {
  id: string
  display_name: string                    // Localized based on x-sheen-locale header
  bio?: string                           // Localized based on x-sheen-locale header
  avatar_url?: string
  skills: string[]                       // ['React', 'Node.js', 'TypeScript']
  specialties: string[]   // ['frontend', 'fullstack']
  languages: string[]     // ['English', 'Arabic']
  rating: number          // 0-5 average from reviews
  review_count: number
  cal_com_event_type_url?: string
  approval_status: 'pending' | 'approved' | 'rejected'
  is_accepting_bookings: boolean
  country_code: string    // ISO country code (e.g., 'US', 'GB')
  created_at: string
}

// Usage example
const searchAdvisors = async (specialty?: string) => {
  const params = new URLSearchParams()
  if (specialty) params.append('specialty', specialty)
  params.append('limit', '20')

  const response = await fetch(
    `${WORKER_BASE_URL}/api/v1/advisors/search?${params}`
  )

  const { advisors } = await response.json()
  return advisors
}
```

#### 3. Get Advisor Profile

**GET /api/v1/advisors/{userId}**

Get detailed advisor profile for approved advisors only. Uses user_id, not advisor table id.

**Multilingual Support**: Add `x-sheen-locale` header for localized content:
- `x-sheen-locale: ar` - Arabic display name, bio, and specialties
- `x-sheen-locale: fr` - French display name, bio, and specialties
- `x-sheen-locale: en` - English (default)

```typescript
// Response
interface AdvisorProfileResponse {
  success: true
  advisor: Advisor & {
    localized_bio: string                    // Translated bio
    available_languages: string[]           // ["en", "ar", "fr"]
    localized_specialties: Array<{
      specialty_key: string
      display_name: string                  // Translated specialty name
      description?: string                  // Translated description
    }>
  }
  language: string                          // Requested language
}

// Usage examples
const getAdvisorProfile = async (advisorId: string, locale = 'en') => {
  const response = await fetch(
    `${WORKER_BASE_URL}/api/v1/advisors/${advisorId}`,
    {
      headers: {
        'x-sheen-locale': locale
      }
    }
  )

  if (response.status === 404) {
    throw new Error('Advisor not found or not approved')
  }

  const { advisor } = await response.json()
  return advisor
}

// Get Omar's profile in Arabic
const omarArabic = await getAdvisorProfile('45267073-2690-4d8b-b58c-acbc6bf9c618', 'ar')
console.log(omarArabic.display_name)  // "عمر خليل"
console.log(omarArabic.localized_bio) // Arabic bio text
```

---

### Authenticated Advisor Endpoints

#### 4. Apply to Become Advisor

**POST /api/v1/advisors/apply**

Submit application to become an advisor. Requires authentication.

```typescript
// Request
interface AdvisorApplicationRequest {
  display_name: string                    // Required
  bio?: string
  avatar_url?: string
  skills: string[]                        // ['React', 'Node.js']
  specialties: string[]                   // ['frontend', 'fullstack', 'ecommerce']
  languages: string[]                     // ['English', 'Arabic']
  cal_com_event_type_url?: string        // Cal.com booking URL
  country_code: string                    // Required for Stripe Connect (e.g., 'US', 'GB')
}

// Response
interface AdvisorApplicationResponse {
  success: true
  message: "Advisor application submitted successfully"
  application_id: string
  status: "pending"
  submitted_at: string
  correlation_id: string
}

// Usage example
const applyAsAdvisor = async (applicationData: AdvisorApplicationRequest, userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(16).toString('hex')

  const claims: AdvisorClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['user'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const body = JSON.stringify(applicationData)

  const response = await fetch(`${WORKER_BASE_URL}/api/v1/advisors/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': nonce,
      'x-sheen-claims': btoa(JSON.stringify(claims)),
      'x-correlation-id': crypto.randomUUID()
    },
    body
  })

  const result = await response.json()

  if (response.status === 400 && result.error.includes('already exists')) {
    throw new Error('You have already submitted an advisor application')
  }

  return result
}
```

#### 5. Get Own Advisor Profile

**GET /api/v1/advisors/profile**

Get own advisor profile (for advisors only).

```typescript
// Response
interface AdvisorOwnProfileResponse {
  success: true
  profile: {
    id: string
    user_id: string
    display_name: string
    bio?: string
    avatar_url?: string
    skills: string[]
    specialties: string[]
    languages: string[]
    rating: number
    review_count: number
    approval_status: 'pending' | 'approved' | 'rejected'
    stripe_connect_account_id?: string
    cal_com_event_type_url?: string
    is_accepting_bookings: boolean
    country_code: string
    approved_by?: string
    approved_at?: string
    created_at: string
    updated_at: string
  }
}

// Usage example
const getOwnAdvisorProfile = async (userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: AdvisorClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['advisor'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const response = await fetch(`${WORKER_BASE_URL}/api/v1/advisors/profile`, {
    headers: {
      'x-sheen-signature': generateHMACv1('', timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims))
    }
  })

  if (response.status === 404) {
    throw new Error('No advisor profile found. Please apply first.')
  }

  const { profile } = await response.json()
  return profile
}
```

#### 6. Update Advisor Profile

**PUT /api/v1/advisors/profile**

Update advisor profile (approved advisors only).

```typescript
// Request (all fields optional)
interface AdvisorUpdateRequest {
  display_name?: string
  bio?: string
  avatar_url?: string
  skills?: string[]
  specialties?: string[]
  languages?: string[]
  cal_com_event_type_url?: string
  is_accepting_bookings?: boolean
}

// Response
interface AdvisorUpdateResponse {
  success: true
  message: "Profile updated successfully"
  advisor: {
    id: string
    display_name: string
    updated_at: string
  }
  correlation_id: string
}
```

#### 7. Toggle Booking Availability

**PUT /api/v1/advisors/booking-status**

Quick endpoint to enable/disable accepting new bookings.

```typescript
// Request
interface BookingStatusRequest {
  is_accepting_bookings: boolean
}

// Response
interface BookingStatusResponse {
  success: true
  message: "Booking availability enabled" | "Booking availability disabled"
  is_accepting_bookings: boolean
}
```

#### 8. Get Advisor Earnings

**GET /api/v1/advisors/earnings**

Get monthly earnings summary for advisor.

```typescript
// Query parameters
interface EarningsParams {
  year?: number    // Default: current year
  month?: number   // Default: current month (1-12)
}

// Response
interface EarningsResponse {
  success: true
  period: {
    year: number
    month: number
  }
  earnings: {
    consultations_count: number
    earned_cents: number           // From successful consultations
    adjustments_cents: number      // Refunds/bonuses/chargebacks
    total_earnings_cents: number   // earned + adjustments
    total_earnings_display: string // "$245.60"
  }
}

// Usage example
const getMonthlyEarnings = async (year: number, month: number, userSession: Session) => {
  const params = new URLSearchParams({
    year: year.toString(),
    month: month.toString()
  })

  const timestamp = Math.floor(Date.now() / 1000)
  const claims: AdvisorClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['advisor'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const response = await fetch(
    `${WORKER_BASE_URL}/api/v1/advisors/earnings?${params}`, {
    headers: {
      'x-sheen-signature': generateHMACv1('', timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims))
    }
  })

  const { earnings } = await response.json()
  return earnings
}
```

---

### Consultation Management Endpoints

#### 9. Book Consultation

**POST /api/v1/consultations/book**

Book a consultation with payment processing. Creates both consultation record and Stripe payment intent.

```typescript
// Request
interface ConsultationBookingRequest {
  advisor_id: string
  duration_minutes: 15 | 30 | 60        // Platform-fixed durations only
  project_id?: string                    // Optional project association
  cal_booking_id: string                 // From Cal.com widget integration
  locale?: string                        // For emails (e.g., 'en-us', 'ar-eg')
  client_timezone?: string               // For display (e.g., 'America/New_York')
}

// Response
interface ConsultationBookingResponse {
  success: true
  consultation: {
    id: string
    advisor_name: string
    duration_minutes: number
    price_cents: number
    advisor_earnings_cents: number
    created_at: string
  }
  payment: {
    payment_intent_id: string      // For Stripe Elements
    client_secret: string          // For Stripe Elements
    total_amount: number
  }
  pricing_snapshot: {
    sku: string                    // "30min"
    currency: "USD"
    rate_cents: number
  }
  correlation_id: string
}

// Usage example with Stripe Elements
const bookConsultation = async (bookingData: ConsultationBookingRequest, userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: AdvisorClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['user'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const body = JSON.stringify(bookingData)

  const response = await fetch(`${WORKER_BASE_URL}/api/v1/consultations/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims)),
      'x-correlation-id': crypto.randomUUID()
    },
    body
  })

  if (response.status === 400) {
    const error = await response.json()
    if (error.error.includes('not accepting bookings')) {
      throw new Error('This advisor is not currently accepting bookings')
    }
  }

  const booking = await response.json()

  // Use booking.payment.client_secret with Stripe Elements
  return booking
}
```

#### 10. Get Consultation Details

**GET /api/v1/consultations/{id}**

Get consultation details with privacy protection.

```typescript
// Response (varies by user role)
interface ConsultationResponse {
  success: true
  consultation: {
    id: string
    duration_minutes: number
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
    scheduled_at: string
    video_url?: string              // Cal.com meeting URL
    price_cents: number
    created_at: string

    // For clients: see full advisor info
    advisor?: {
      id: string
      name: string
    }

    // For advisors: see limited client info (privacy-protected)
    client?: {
      first_name: string           // ONLY first name, no email/PII
    }
  }
}

// Usage example
const getConsultationDetails = async (consultationId: string, userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: AdvisorClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: userSession.user.roles,
    issued: timestamp,
    expires: timestamp + 300
  }

  const response = await fetch(
    `${WORKER_BASE_URL}/api/v1/consultations/${consultationId}`, {
    headers: {
      'x-sheen-signature': generateHMACv1('', timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims))
    }
  })

  if (response.status === 403) {
    throw new Error('Access denied - you can only view your own consultations')
  }

  const { consultation } = await response.json()
  return consultation
}
```

#### 11. Cancel Consultation

**PUT /api/v1/consultations/{id}/cancel**

Cancel consultation with automatic refund policy enforcement.

```typescript
// Request
interface CancelConsultationRequest {
  reason?: string  // Optional cancellation reason
}

// Response
interface CancelConsultationResponse {
  success: true
  message: "Consultation cancelled successfully"
  consultation: {
    id: string
    status: "cancelled"
    cancelled_at: string
  }
  refund?: {
    will_be_refunded: boolean
    refund_amount_cents?: number
    refund_reason: string
  }
  correlation_id: string
}

// Usage example
const cancelConsultation = async (consultationId: string, reason: string, userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: AdvisorClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: userSession.user.roles,
    issued: timestamp,
    expires: timestamp + 300
  }

  const body = JSON.stringify({ reason })

  const response = await fetch(
    `${WORKER_BASE_URL}/api/v1/consultations/${consultationId}/cancel`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims)),
      'x-correlation-id': crypto.randomUUID()
    },
    body
  })

  const result = await response.json()

  // Check refund status
  if (result.refund?.will_be_refunded) {
    console.log(`Refund of $${result.refund.refund_amount_cents / 100} will be processed`)
  } else {
    console.log('No refund:', result.refund?.refund_reason)
  }

  return result
}
```

#### 12. Submit Review

**POST /api/v1/consultations/{id}/review**

Submit rating and review after completed consultation (clients only).

```typescript
// Request
interface ReviewSubmissionRequest {
  rating: number                      // 1-5 required
  review_text?: string               // Optional text review
  expertise_rating?: number          // 1-5 optional
  communication_rating?: number      // 1-5 optional
  helpfulness_rating?: number        // 1-5 optional
}

// Response
interface ReviewSubmissionResponse {
  success: true
  message: "Review submitted successfully"
  review: {
    id: string
    rating: number
    submitted_at: string
  }
  correlation_id: string
}

// Usage example
const submitReview = async (consultationId: string, reviewData: ReviewSubmissionRequest, userSession: Session) => {
  const timestamp = Math.floor(Date.now() / 1000)
  const claims: AdvisorClaims = {
    userId: userSession.user.id,
    email: userSession.user.email,
    roles: ['user'],
    issued: timestamp,
    expires: timestamp + 300
  }

  const body = JSON.stringify(reviewData)

  const response = await fetch(
    `${WORKER_BASE_URL}/api/v1/consultations/${consultationId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp.toString(), secret),
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-claims': btoa(JSON.stringify(claims)),
      'x-correlation-id': crypto.randomUUID()
    },
    body
  })

  if (response.status === 400) {
    const error = await response.json()
    if (error.error.includes('already reviewed')) {
      throw new Error('You have already reviewed this consultation')
    }
    if (error.error.includes('completed')) {
      throw new Error('You can only review completed consultations')
    }
  }

  const review = await response.json()
  return review
}
```

---

### Admin Endpoints

#### 13. List Advisor Applications

**GET /api/v1/admin/advisor-applications**

List pending advisor applications (admin only).

```typescript
// Query parameters
interface AdminApplicationsParams {
  status?: 'pending' | 'approved' | 'rejected'  // Default: 'pending'
  limit?: number                                 // Default: 50
  offset?: number                               // Default: 0
}

// Response
interface AdminApplicationsResponse {
  success: true
  applications: Array<{
    id: string
    display_name: string
    bio?: string
    skills: string[]
    specialties: string[]
    languages: string[]
    country_code: string
    cal_com_event_type_url?: string
    approval_status: string
    created_at: string
    email: string                    // Admin sees applicant email
  }>
  filters: {
    status: string
    limit: number
    offset: number
  }
  total_returned: number
}
```

#### 14. Approve/Reject Advisor

**PUT /api/v1/admin/advisors/{id}/approve**

Approve or reject advisor application (admin only).

```typescript
// Request
interface AdminApprovalRequest {
  approval_status: 'approved' | 'rejected'
  notes?: string  // Optional admin notes
}

// Response
interface AdminApprovalResponse {
  success: true
  message: "Advisor application approved" | "Advisor application rejected"
  advisor: {
    id: string
    display_name: string
    approval_status: string
    approved_at?: string
  }
  admin_notes?: string
}
```

---

### Webhook Endpoint

#### Cal.com Integration

**POST /api/v1/webhooks/calcom**

Processes Cal.com booking lifecycle events. This endpoint is called by Cal.com webhooks.

```typescript
// Webhook payload (sent by Cal.com)
interface CalComWebhookPayload {
  id: string
  type: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED'
  createdAt: string
  data: {
    booking: {
      id: string
      uid: string
      title: string
      startTime: string
      endTime: string
      status: string
      attendees: Array<{
        email: string
        name: string
      }>
      metadata: {
        consultation_id: string    // Must be included in Cal.com booking
        advisor_id: string
        duration_minutes: string
      }
      videoCallUrl?: string
    }
  }
}

// Response
interface CalComWebhookResponse {
  success: true
  message: "Webhook received"
  correlation_id: string
}
```

**Cal.com Setup Requirements**:
1. Configure webhook URL: `https://worker.sheenapps.com/api/v1/webhooks/calcom`
2. Set webhook secret in environment: `CALCOM_WEBHOOK_SECRET`
3. Include consultation metadata in all bookings
4. Configure event types for 15/30/60 minute durations

---

### Error Handling

All advisor network endpoints return consistent error responses:

```typescript
interface AdvisorErrorResponse {
  success: false
  error: string
  correlation_id?: string
}

// Common error types
const handleAdvisorError = (error: AdvisorErrorResponse) => {
  switch (error.error) {
    case 'Advisor not found or not approved':
      return 'This advisor is not available for bookings'

    case 'duration_minutes must be 15, 30, or 60':
      return 'Please select a valid consultation duration'

    case 'Advisor is not currently accepting bookings':
      return 'This advisor is temporarily unavailable'

    case 'No refund for cancellations within 24 hours':
      return 'Cancellations within 24 hours are not refundable'

    case 'You can only review completed consultations':
      return 'Reviews can only be submitted after consultations are completed'

    default:
      return error.error || 'Operation failed'
  }
}
```

### Rate Limits

- **Consultation Booking**: 5 requests/minute per user
- **Profile Updates**: 10 requests/minute per user
- **Search Requests**: 30 requests/minute per IP
- **Review Submissions**: 2 requests/minute per user
- **Admin Operations**: 20 requests/minute per admin

### Testing

#### Environment Setup

```bash
# Required environment variables (add to existing)
CALCOM_WEBHOOK_SECRET=your_calcom_webhook_secret
CALCOM_API_KEY=your_calcom_api_key  # If needed

# Existing Stripe variables work for consultation payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET_PRIMARY=whsec_...
```

#### Test Workflow

1. **Advisor Application**: Submit → Admin approve → Profile visible
2. **Consultation Booking**: Search advisor → Book → Payment → Cal.com integration
3. **Consultation Lifecycle**: Schedule → Attend → Review → Payout calculation
4. **Refund Testing**: Cancel >24h (refund) vs ≤24h (no refund)

```typescript
// Test helper for full advisor workflow
const testAdvisorWorkflow = async () => {
  // 1. Apply as advisor
  const application = await applyAsAdvisor({
    display_name: 'Test Advisor',
    bio: 'Expert in React and Node.js',
    skills: ['React', 'Node.js'],
    specialties: ['frontend'],
    languages: ['English'],
    country_code: 'US'
  }, session)

  console.log('Application submitted:', application.application_id)

  // 2. Admin approval (manual step in UI)
  // ...

  // 3. Client books consultation
  const booking = await bookConsultation({
    advisor_id: 'approved-advisor-id',
    duration_minutes: 30,
    cal_booking_id: 'cal-booking-123'
  }, clientSession)

  console.log('Consultation booked:', booking.consultation.id)

  // 4. Test cancellation policy
  const cancellation = await cancelConsultation(
    booking.consultation.id,
    'Testing cancellation',
    clientSession
  )

  console.log('Refund status:', cancellation.refund?.will_be_refunded)
}
```

### Security Notes

1. **Privacy Protection**: Advisors never see client email/phone
2. **Platform Pricing**: Rates are fixed and non-negotiable
3. **Payment Security**: Uses existing Stripe infrastructure
4. **Data Access**: Users can only access their own consultations
5. **Admin Controls**: Only admins can approve advisors and access sensitive data

This completes the comprehensive Advisor Network API integration. The backend is production-ready with all 13 endpoints implemented and tested.

---

## 🎯 **Intelligent Advisor Matching System** (NEW)

**Date**: January 15, 2025
**Version**: 1.0 (Startup-Optimized Algorithm with Admin Controls)

### Overview

The intelligent advisor matching system connects projects with suitable advisors based on expertise, availability, and preferences. Designed for startup-scale operations (2-10 advisors) with automatic scaling to complex algorithms for enterprise growth (50+ advisors).

**Key Features**:
- 🧠 **Smart Algorithm**: Startup-optimized (availability-first) with automatic scaling
- 👥 **Admin Controls**: Manual assignments, preference rules, override capabilities
- ⚡ **High Performance**: <500ms response time with race-safe assignment
- 📊 **Real-time Dashboard**: Pool status, workload analysis, performance metrics
- 🌐 **Internationalized**: Full i18n support with x-sheen-locale header
- 🛡️ **Production Ready**: State machine enforcement, RLS security, expert-validated

### Authentication

All endpoints require HMAC authentication with userId in query parameters (GET) or request body (POST/PUT).

### Core Match Flow

#### Create Match Request
```http
POST /api/advisor-matching/match-requests
```

**Request:**
```json
{
  "userId": "user_123",
  "projectId": "proj_456",
  "matchCriteria": {
    "expertise": ["frontend", "react"],
    "budget_range": [1000, 5000],
    "timeline": "urgent",
    "language": "en"
  },
  "expiresInHours": 2
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "match_789",
    "projectId": "proj_456",
    "status": "pending",
    "matchedAdvisorId": "advisor_123",
    "expiresAt": "2025-01-15T16:00:00Z",
    "correlationId": "corr_abc123"
  }
}
```

#### Get Project Matches
```http
GET /api/advisor-matching/projects/{projectId}/matches?userId={userId}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "match_789",
      "status": "pending",
      "matchedAdvisor": {
        "id": "advisor_123",
        "name": "Expert Developer",
        "expertise": ["frontend", "react"],
        "rating": 4.8
      },
      "createdAt": "2025-01-15T14:00:00Z",
      "expiresAt": "2025-01-15T16:00:00Z"
    }
  ]
}
```

#### Client Decision
```http
POST /api/advisor-matching/matches/{matchId}/client-decision
```

**Request:**
```json
{
  "userId": "user_123",
  "decision": "approved", // or "declined"
  "reason": "Perfect expertise match"
}
```

#### Advisor Decision
```http
POST /api/advisor-matching/matches/{matchId}/advisor-decision
```

**Request:**
```json
{
  "userId": "advisor_123",
  "decision": "approved", // or "declined"
  "reason": "Interesting project"
}
```

### Advisor Management

#### Get Availability
```http
GET /api/advisor-matching/availability?userId={advisorId}
```

#### Update Availability
```http
PUT /api/advisor-matching/availability?userId={advisorId}
```

**Request:**
```json
{
  "userId": "advisor_123",
  "status": "available", // "busy" | "offline"
  "maxConcurrentProjects": 3,
  "availabilityPreferences": {
    "timezone": "UTC",
    "preferred_hours": "9-17"
  }
}
```

#### Set Work Hours
```http
POST /api/advisor-matching/work-hours?userId={advisorId}
```

**Request:**
```json
{
  "userId": "advisor_123",
  "timezone": "America/New_York",
  "schedule": {
    "monday": "09:00-17:00",
    "tuesday": "09:00-17:00",
    "friday": "09:00-15:00"
  }
}
```

#### Set Time Off
```http
POST /api/advisor-matching/time-off?userId={advisorId}
```

**Request:**
```json
{
  "userId": "advisor_123",
  "timeOffPeriods": [
    {
      "start": "2025-01-20T00:00:00Z",
      "end": "2025-01-25T23:59:59Z",
      "reason": "vacation"
    }
  ]
}
```

### Admin Controls (Admin Role Required)

#### Manual Advisor Assignment
```http
POST /api/advisor-matching/admin/assign-advisor?userId={adminUserId}
```

**Request:**
```json
{
  "userId": "admin_123",
  "projectId": "proj_456",
  "advisorId": "advisor_789",
  "priority": "high",
  "reason": "Emergency project requirements",
  "skipAvailabilityCheck": false
}
```

#### Create Preference Rule
```http
POST /api/advisor-matching/admin/preference-rules?userId={adminUserId}
```

**Request:**
```json
{
  "userId": "admin_123",
  "ruleType": "prefer_advisor",
  "targetAdvisorId": "advisor_123",
  "conditions": {
    "expertise": ["frontend", "react"],
    "projectType": "urgent"
  },
  "priority": 90,
  "isActive": true,
  "expiresAt": "2025-02-15T00:00:00Z"
}
```

#### Override Match Result
```http
POST /api/advisor-matching/admin/override-match?userId={adminUserId}
```

**Request:**
```json
{
  "userId": "admin_123",
  "matchRequestId": "match_789",
  "newAdvisorId": "advisor_456",
  "reason": "Better expertise match identified"
}
```

### Dashboard & Analytics (Admin Role Required)

#### Pool Status
```http
GET /api/advisor-matching/admin/dashboard/pool-status?userId={adminUserId}&includeDetails=true
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalAdvisors": 15,
      "activeAdvisors": 12,
      "availableNow": 8,
      "utilizationRate": 0.73
    },
    "algorithm": "startup_optimized",
    "performance": {
      "avgResponseTime": "1.2s",
      "successRate": 0.94
    }
  }
}
```

#### Available Advisors
```http
GET /api/advisor-matching/admin/available-advisors?userId={adminUserId}
```

#### Match Queue Status
```http
GET /api/advisor-matching/admin/matches?userId={adminUserId}&status=pending&limit=50&offset=0
```

#### Advisor Workloads
```http
GET /api/advisor-matching/admin/dashboard/advisor-workloads?userId={adminUserId}&sortBy=utilization
```

#### System Health
```http
GET /api/advisor-matching/admin/dashboard/system-health?userId={adminUserId}
```

#### Matching Metrics
```http
GET /api/advisor-matching/admin/dashboard/matching-metrics?userId={adminUserId}&period=week
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "week",
    "totalRequests": 47,
    "successRate": 0.94,
    "approvalRate": 0.87,
    "avgResponseTime": "3.2 minutes",
    "topExpertise": [
      { "skill": "frontend", "requests": 18, "successRate": 0.95 }
    ]
  }
}
```

### Headers & Internationalization

All endpoints support:
```
x-sheen-locale: en|ar|fr|es|de  // Optional localization
x-sheen-signature: [HMAC signature]
x-sheen-timestamp: [Unix timestamp]
x-sheen-nonce: [Random nonce]
Content-Type: application/json
```

### Error Handling

Standard error format with correlation IDs:
```json
{
  "success": false,
  "error": {
    "code": "ADVISOR_NOT_AVAILABLE",
    "message": "No advisors currently available for this expertise",
    "correlationId": "corr_xyz789"
  }
}
```

### Algorithm Configuration

The system automatically switches algorithms based on advisor pool size:
- **≤49 advisors**: Startup-optimized (availability-first with fairness)
- **50+ advisors**: Complex algorithm (comprehensive scoring)

Configuration via environment variables:
```
ADVISOR_MATCHING_COMPLEX_THRESHOLD=50
ADVISOR_MATCHING_SMALL_THRESHOLD=10
```

---

## 📝 **Phase 2 Advisor Application System** (NEW)

**Date**: August 27, 2025
**Version**: 3.0 (Multi-Step Applications with Auto-Save)

### Overview

Phase 2 introduces an advanced advisor application system with auto-save drafts, event timeline tracking, and comprehensive admin review workflow.

**Key Features**:
- 💾 **Auto-Save Drafts**: Prevent data loss with debounced saves
- 📋 **Event Timeline**: Complete audit trail for admin review
- 🎯 **Progress Tracking**: Section completion monitoring
- 👑 **Admin Workflow**: Start/complete review process with timestamps
- 🌐 **i18n Ready**: Machine-readable event codes for localization
- 🛡️ **RLS Security**: Field-level protection prevents unauthorized modifications

### Authentication Requirements

All endpoints require **HMAC signatures AND user claims** (same pattern as existing advisor endpoints):

```typescript
// Example headers for Phase 2 endpoints
const headers = {
  'x-sheen-signature': generateHMACv1(body, timestamp, secret),
  'x-sheen-timestamp': timestamp.toString(),
  'x-sheen-nonce': randomNonce,
  'x-sheen-claims': btoa(JSON.stringify(claims)),
  'x-correlation-id': uuid(), // Optional but recommended
  'x-sheen-locale': 'en'      // Optional: en|ar|fr|es|de
}
```

---

### Draft Management Endpoints

#### 1. Get Draft Application

**GET /api/advisor/draft**

Retrieve the current draft application for the authenticated user.

**Headers**: Standard HMAC + Claims
**Parameters**: None

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "draft_uuid",
    "user_id": "user_uuid",
    "status": "draft",
    "professional_data": {
      "bio": "Frontend developer with 5 years experience...",
      "skills": ["React", "TypeScript", "Node.js"],
      "specialties": ["frontend", "fullstack"],
      "languages": ["English", "Arabic"],
      "yearsExperience": 5,
      "portfolioUrl": "https://johndoe.dev",
      "isComplete": false,
      "completedSections": ["basic", "skills"]
    },
    "created_at": "2025-08-25T10:00:00Z",
    "updated_at": "2025-08-27T14:30:00Z"
  },
  "correlationId": "req_123"
}
```

**Error Response** (404 if no draft exists):
```json
{
  "success": false,
  "error": "Draft not found",
  "correlationId": "req_124"
}
```

#### 2. Create/Update Draft (Auto-Save)

**POST /api/advisor/draft**

Create or update draft application with auto-save functionality.

**Headers**: Standard HMAC + Claims
**Body**:
```json
{
  "professionalData": {
    "bio": "Experienced frontend developer...",
    "skills": ["React", "TypeScript", "JavaScript"],
    "specialties": ["frontend", "fullstack"],
    "languages": ["English", "Arabic"],
    "yearsExperience": 5,
    "portfolioUrl": "https://johndoe.dev",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "githubUrl": "https://github.com/johndoe",
    "timezone": "America/New_York",
    "weeklyAvailabilityHours": 20,
    "preferredSessionDuration": [30, 60],
    "communicationStyle": "Clear and patient",
    "preferredLanguages": ["English"],
    "isComplete": false,
    "completedSections": ["basic", "skills", "portfolio"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "draft_uuid",
    "status": "draft",
    "professional_data": { /* updated data */ },
    "updated_at": "2025-08-27T14:35:00Z"
  },
  "message": "Draft saved successfully",
  "correlationId": "req_125"
}
```

**Frontend Auto-Save Implementation**:
```typescript
// Debounced auto-save every 30 seconds
const debouncedSave = useMemo(
  () => debounce(async (data: ProfessionalData) => {
    try {
      const response = await fetch('/api/advisor/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sheen-claims': authClaims,
          'x-sheen-signature': generateHMACv1(JSON.stringify({professionalData: data}), timestamp, secret),
          'x-sheen-timestamp': timestamp.toString(),
          'x-sheen-nonce': crypto.randomUUID()
        },
        body: JSON.stringify({ professionalData: data })
      });

      if (!response.ok) {
        console.error('Auto-save failed:', response.statusText);
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }, 30000),
  []
);

// Trigger auto-save on form changes
useEffect(() => {
  if (formData.isComplete || Object.keys(formData).length > 0) {
    debouncedSave(formData);
  }
}, [formData, debouncedSave]);
```

#### 3. Submit Application

**POST /api/advisor/draft/submit**

Submit completed application for admin review.

**Headers**: Standard HMAC + Claims
**Body**: None

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "id": "draft_uuid",
    "status": "submitted",
    "submitted_at": "2025-08-27T14:40:00Z",
    "professional_data": { /* complete data */ }
  },
  "message": "Application submitted successfully",
  "correlationId": "req_126"
}
```

**Response** (Validation Error):
```json
{
  "success": false,
  "error": "Application incomplete: At least 3 skills are required",
  "correlationId": "req_127"
}
```

**Validation Requirements**:
- `bio`: Required, max 2000 characters
- `skills`: Minimum 3, maximum 20
- `specialties`: Minimum 1, maximum 10
- `languages`: At least 1 communication language
- `yearsExperience`: 1-50 range

---

### Profile Management Endpoints

#### 4. Get Advisor Profile

**GET /api/advisor/profile**

Get complete advisor profile with onboarding status.

**Headers**: Standard HMAC + Claims
**Parameters**: None

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "advisor_uuid",
    "display_name": "John Doe",
    "bio": "Expert frontend developer...",
    "avatar_url": "https://example.com/avatar.jpg",
    "skills": ["React", "TypeScript"],
    "specialties": ["frontend", "ui-ux"],
    "languages": ["English", "Arabic"],
    "rating": 4.8,
    "review_count": 25,
    "approval_status": "approved",
    "is_accepting_bookings": true,
    "onboarding_steps": {
      "profile_completed": true,
      "skills_added": true,
      "availability_set": true,
      "stripe_connected": true,
      "cal_connected": true,
      "admin_approved": true
    },
    "review_started_at": "2025-08-20T10:00:00Z",
    "review_completed_at": "2025-08-21T15:30:00Z",
    "created_at": "2025-08-15T09:00:00Z",
    "updated_at": "2025-08-27T14:30:00Z"
  },
  "correlationId": "req_128"
}
```

#### 5. Update Advisor Profile

**PATCH /api/advisor/profile/:advisorId**

Update advisor profile fields (user-editable fields only).

**Headers**: Standard HMAC + Claims
**URL Parameters**: `advisorId` - Advisor UUID

**Body**:
```json
{
  "display_name": "John Doe - React Expert",
  "bio": "Updated bio with recent experience...",
  "avatar_url": "https://example.com/new-avatar.jpg",
  "skills": ["React", "TypeScript", "Next.js", "GraphQL"],
  "specialties": ["frontend", "fullstack", "performance"],
  "languages": ["English", "Arabic", "French"],
  "cal_com_event_type_url": "https://cal.com/johndoe/consultation",
  "is_accepting_bookings": true,
  "country_code": "US"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "advisor_uuid",
    "display_name": "Updated Name",
    "updated_at": "2025-08-27T14:45:00Z"
    /* ... rest of profile data ... */
  },
  "message": "Profile updated successfully",
  "correlationId": "req_129"
}
```

**Protected Fields** (Admin Only - cannot be updated via this endpoint):
- `approval_status`
- `review_started_at`, `review_completed_at`
- `onboarding_steps`
- `rating`, `review_count`

---

### Event Timeline Endpoints

#### 6. Get Event Timeline

**GET /api/advisor/timeline?limit=50**

Get application event timeline for admin review tracking.

**Headers**: Standard HMAC + Claims
**Query Parameters**:
- `limit` (optional): Number of events to retrieve (default: 50, max: 100)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "event_uuid_1",
      "event_type": "application_submitted",
      "event_data": {
        "submittedAt": "2025-08-25T14:30:00Z",
        "completedSections": ["basic", "skills", "portfolio"]
      },
      "event_code": "advisor.application.submitted",
      "created_at": "2025-08-25T14:30:00Z"
    },
    {
      "id": "event_uuid_2",
      "event_type": "review_started",
      "event_data": {
        "adminUserId": "admin_uuid"
      },
      "event_code": "advisor.review.started",
      "created_at": "2025-08-26T09:15:00Z"
    },
    {
      "id": "event_uuid_3",
      "event_type": "profile_updated",
      "event_data": {
        "updatedFields": ["display_name", "bio"]
      },
      "event_code": "advisor.profile.updated",
      "created_at": "2025-08-27T10:30:00Z"
    }
  ],
  "correlationId": "req_130"
}
```

**Event Types**:
- `draft_created`: Initial application creation
- `draft_updated`: Auto-save or manual updates
- `profile_updated`: Profile information changes
- `application_submitted`: Submitted for review
- `review_started`: Admin began review process
- `review_completed`: Admin finished review
- `status_changed`: Approval status updates
- `admin_note_added`: Admin comments added

**i18n Event Localization**:
```typescript
const EVENT_TRANSLATIONS = {
  'advisor.application.submitted': {
    en: 'Application submitted for review',
    ar: 'تم تقديم الطلب للمراجعة',
    fr: 'Candidature soumise pour examen'
  },
  'advisor.review.approved': {
    en: 'Application approved',
    ar: 'تم قبول الطلب',
    fr: 'Candidature approuvée'
  }
  // ... more translations
};
```

---

### Admin Endpoints (Admin Role Required)

#### 7. Get Applications for Review

**GET /api/admin/advisor/applications?status=submitted**

Get list of advisor applications for admin review.

**Headers**: Standard HMAC + Claims (with `admin` or `staff` role)
**Query Parameters**:
- `status` (optional): Filter by application status

**Status Options**:
- `submitted`: Ready for admin review
- `under_review`: Currently being reviewed
- `approved`: Approved applications
- `rejected`: Rejected applications
- `returned_for_changes`: Needs user modifications

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "draft_uuid",
      "user_id": "user_uuid",
      "status": "submitted",
      "professional_data": {
        "bio": "Experienced developer...",
        "skills": ["React", "TypeScript"],
        "specialties": ["frontend"],
        "yearsExperience": 5
      },
      "submitted_at": "2025-08-25T14:30:00Z",
      "updated_at": "2025-08-25T14:30:00Z"
    }
  ],
  "correlationId": "admin_req_131"
}
```

**Error Response** (403 for non-admin):
```json
{
  "success": false,
  "error": "Admin access required",
  "correlationId": "admin_req_132"
}
```

#### 8. Start Review Process

**POST /api/admin/advisor/review/start**

Mark advisor application review as started.

**Headers**: Standard HMAC + Claims (with `admin` or `staff` role)
**Body**:
```json
{
  "userId": "user-uuid-to-review"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Review started successfully",
  "correlationId": "admin_req_133"
}
```

**Error Response** (Already Started):
```json
{
  "success": false,
  "error": "Advisor not found or review already started",
  "correlationId": "admin_req_134"
}
```

#### 9. Complete Review Process

**POST /api/admin/advisor/review/complete**

Complete advisor application review with approve/reject decision.

**Headers**: Standard HMAC + Claims (with `admin` or `staff` role)
**Body**:
```json
{
  "userId": "user-uuid-to-review",
  "approved": true,
  "notes": "Excellent background in React and strong communication skills. Portfolio demonstrates solid expertise."
}
```

**Fields**:
- `userId`: UUID of user being reviewed (required)
- `approved`: Boolean decision (required)
- `notes`: Admin feedback (optional, max 1000 characters)

**Response** (Success):
```json
{
  "success": true,
  "message": "Review completed - advisor approved",
  "correlationId": "admin_req_135"
}
```

**Response** (Not In Review):
```json
{
  "success": false,
  "error": "Advisor not found or review not in progress",
  "correlationId": "admin_req_136"
}
```

---

### Application Status Management

**Status Flow**:
```
draft → submitted → under_review → approved/rejected
                                 ↓
                      returned_for_changes → draft
```

**Status Descriptions**:
- `draft`: Editable by user, auto-save active
- `submitted`: Waiting for admin review, read-only for user
- `under_review`: Admin is currently reviewing
- `approved`: Approved - user becomes advisor, can accept bookings
- `rejected`: Rejected - user can create new application
- `returned_for_changes`: Needs user modifications, becomes editable

---

### Frontend Integration Examples

#### Complete Application Flow

```typescript
// 1. Load existing draft or create new one
const loadDraft = async () => {
  try {
    const response = await fetch('/api/advisor/draft', {
      headers: getAuthHeaders()
    });

    if (response.ok) {
      const result = await response.json();
      setFormData(result.data.professional_data);
      setApplicationStatus(result.data.status);
    } else if (response.status === 404) {
      // No draft exists - start fresh
      setFormData(getEmptyFormData());
    }
  } catch (error) {
    console.error('Failed to load draft:', error);
  }
};

// 2. Auto-save on form changes
useEffect(() => {
  const saveTimeout = setTimeout(() => {
    if (applicationStatus === 'draft' && hasFormChanges) {
      saveDraft(formData);
    }
  }, 30000); // 30 second debounce

  return () => clearTimeout(saveTimeout);
}, [formData, applicationStatus, hasFormChanges]);

// 3. Submit application
const submitApplication = async () => {
  try {
    setSubmitting(true);

    const response = await fetch('/api/advisor/draft/submit', {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (result.success) {
      setApplicationStatus('submitted');
      showNotification('Application submitted successfully!', 'success');
      router.push('/advisor/status');
    } else {
      showNotification(result.error, 'error');
    }
  } catch (error) {
    showNotification('Failed to submit application', 'error');
  } finally {
    setSubmitting(false);
  }
};

// 4. Progress tracking
const calculateProgress = (completedSections: string[]): number => {
  const totalSections = ['basic', 'skills', 'portfolio', 'availability'];
  return completedSections.length / totalSections.length;
};
```

#### Admin Review Dashboard

```typescript
// Admin dashboard for reviewing applications
const AdminReviewDashboard = () => {
  const [applications, setApplications] = useState([]);
  const [currentReview, setCurrentReview] = useState(null);

  const loadApplications = async (status = 'submitted') => {
    const response = await fetch(`/api/admin/advisor/applications?status=${status}`, {
      headers: getAdminAuthHeaders()
    });

    if (response.ok) {
      const result = await response.json();
      setApplications(result.data);
    }
  };

  const startReview = async (userId: string) => {
    const response = await fetch('/api/admin/advisor/review/start', {
      method: 'POST',
      headers: { ...getAdminAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    if (response.ok) {
      setCurrentReview(userId);
      showNotification('Review started', 'success');
    }
  };

  const completeReview = async (userId: string, approved: boolean, notes: string) => {
    const response = await fetch('/api/admin/advisor/review/complete', {
      method: 'POST',
      headers: { ...getAdminAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, approved, notes })
    });

    if (response.ok) {
      showNotification(`Application ${approved ? 'approved' : 'rejected'}`, 'success');
      loadApplications(); // Refresh list
      setCurrentReview(null);
    }
  };

  return (
    <div className="admin-review-dashboard">
      {applications.map(app => (
        <ApplicationCard
          key={app.id}
          application={app}
          onStartReview={() => startReview(app.user_id)}
          onCompleteReview={(approved, notes) => completeReview(app.user_id, approved, notes)}
        />
      ))}
    </div>
  );
};
```

---

### Error Handling

**Standard Error Format**:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "correlationId": "req_137"
}
```

**Common Error Scenarios**:

1. **Draft Not Found** (404):
   - User hasn't created a draft yet
   - Handle by initializing new draft form

2. **Validation Errors** (400):
   - Incomplete application data
   - Invalid field values
   - Display specific validation messages

3. **Already Submitted** (400):
   - Attempting to submit already submitted application
   - Show appropriate status message

4. **Admin Access Required** (403):
   - Non-admin trying to access admin endpoints
   - Redirect to access denied page

5. **Authentication Errors** (401):
   - Invalid or expired claims
   - HMAC signature mismatch
   - Redirect to login

---

### Performance & Best Practices

#### Auto-Save Optimization
```typescript
// Optimized auto-save with conflict resolution
const optimizedAutoSave = {
  // Debounce multiple rapid changes
  debounceMs: 30000,

  // Retry on failure
  maxRetries: 3,

  // Show save status to user
  showSaveStatus: true,

  // Handle conflicts gracefully
  conflictResolution: 'merge'
};
```

#### Form State Management
```typescript
// Track completion status for progress bars
interface FormState {
  data: ProfessionalData;
  completedSections: string[];
  isComplete: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
}

// Section validation
const validateSection = (section: string, data: ProfessionalData): boolean => {
  switch (section) {
    case 'basic':
      return !!(data.bio && data.yearsExperience);
    case 'skills':
      return data.skills.length >= 3 && data.specialties.length >= 1;
    case 'portfolio':
      return !!(data.portfolioUrl || data.githubUrl);
    case 'availability':
      return !!(data.timezone && data.weeklyAvailabilityHours);
    default:
      return false;
  }
};
```

#### Timeline Performance
```typescript
// Implement pagination for long timelines
const loadTimeline = async (limit = 50, offset = 0) => {
  const response = await fetch(`/api/advisor/timeline?limit=${limit}&offset=${offset}`, {
    headers: getAuthHeaders()
  });

  if (response.ok) {
    const result = await response.json();
    return result.data;
  }

  return [];
};

// Infinite scroll implementation
const useInfiniteTimeline = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    const newEvents = await loadTimeline(50, events.length);

    setEvents(prev => [...prev, ...newEvents]);
    setHasMore(newEvents.length === 50);
    setLoading(false);
  }, [events.length, loading, hasMore]);

  return { events, loadMore, loading, hasMore };
};
```

---

### Testing

#### Environment Setup
```bash
# Add to existing environment variables
ENABLE_PHASE_2_APPLICATIONS=true

# Existing variables work with Phase 2
WORKER_SHARED_SECRET=your_hmac_secret
DATABASE_URL=postgresql://...
```

#### Test Workflow
```typescript
// Complete Phase 2 test workflow
const testPhase2Workflow = async () => {
  // 1. Create draft application
  const draft = await createDraft({
    bio: 'Test advisor bio',
    skills: ['React', 'TypeScript', 'Node.js'],
    specialties: ['frontend'],
    languages: ['English'],
    yearsExperience: 3
  });

  // 2. Test auto-save
  await updateDraft(draft.id, {
    portfolioUrl: 'https://test-portfolio.com'
  });

  // 3. Submit application
  await submitApplication(draft.id);

  // 4. Admin review workflow
  const applications = await getApplicationsForReview();
  await startReview(applications[0].user_id);
  await completeReview(applications[0].user_id, true, 'Approved for testing');

  // 5. Verify timeline events
  const timeline = await getTimeline(applications[0].user_id);
  expect(timeline).toContain({ event_type: 'review_completed' });
};
```

---

### Security Notes

1. **Field-Level Security**: RLS policies prevent users from modifying admin-controlled fields
2. **Auto-Save Protection**: Draft modifications are restricted to draft owners only
3. **Admin Role Validation**: Review endpoints check for `admin` or `staff` roles
4. **Timeline Privacy**: Users can only see their own application events
5. **Data Validation**: Comprehensive server-side validation prevents invalid submissions
6. **HMAC Authentication**: All endpoints require proper signature validation

This completes the Phase 2 Advisor Application System integration. The backend is production-ready with auto-save functionality, comprehensive admin workflow, and full audit trail capabilities.

---

## 👑 Admin Panel API (v1.0) - Production Ready

**Date**: August 31, 2025
**Status**: Backend Complete - Frontend Integration Ready

The admin panel provides comprehensive administrative functionality with security-first architecture, audit logging, and job-focused workflows.

### Authentication & Authorization

Admin endpoints use a secure two-step authentication flow with Supabase integration:

#### Step 1: Admin Authentication

You have two options for obtaining an Admin JWT:

##### Option A: Direct Login (Recommended for Development)

Login directly with email and password:

```typescript
POST /v1/admin/auth/login
Content-Type: application/json

{
  "email": "admindev@sheenapps.com",
  "password": "your_password_here"
}
```

**Requirements:**
- Valid admin user credentials
- Admin privileges in database (user_admin_status table or JWT metadata)

##### Option B: Token Exchange (Production with MFA)

Exchange your Supabase access token for an Admin JWT:

```typescript
POST /v1/admin/auth/exchange
Content-Type: application/json

{
  "supabase_access_token": "your_supabase_access_token"
}
```

**Requirements:**
- Valid Supabase access token
- MFA enrolled and verified (if REQUIRE_MFA=true)
- Admin privileges in database
- Active session with proper permissions

**Response (Both Endpoints):**
```json
{
  "success": true,
  "admin_jwt": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "expires_at": "2025-08-31T10:42:00Z",
  "expires_in": 720,
  "session_id": "admin_1693478400_xyz789",
  "permissions": ["users.read", "users.write", "finance.refund"],
  "user": {
    "id": "user_uuid",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

#### Step 2: API Calls

Use the Admin JWT for all admin operations:

```typescript
// All admin endpoints require
headers: {
  'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...',  // Admin JWT from exchange
  'x-correlation-id': generateUUID(),        // For troubleshooting & audit trails
  'content-type': 'application/json'
}

// Sensitive operations also require
headers: {
  'x-admin-reason': '[T02] Harassment reported by multiple users',  // Structured: [CODE] description
  'idempotency-key': generateUUID(),          // For POST/PUT operations that change state
}
```

#### Legacy Support (Grace Period)

During transition, both authentication methods are supported:
- ✅ **Preferred**: `Authorization: Bearer <admin_jwt>`
- ⚠️ **Legacy**: `x-sheen-claims: <base64_claims>` (will be removed)

#### Admin JWT Claims Structure

```typescript
interface AdminClaims {
  sub: string;              // User ID (standard JWT claim)
  userId: string;           // User ID (backward compatibility)
  email: string;            // User email
  role: string;             // 'admin' or 'super_admin'
  is_admin: boolean;        // Must be true
  admin_permissions: string[]; // Array of permissions
  exp: number;              // Expiration timestamp (12 minutes)
  iat: number;              // Issued at timestamp
  session_id: string;       // Session identifier for audit trails
  aud: string;              // Audience: 'sheen-admin-panel'
  iss: string;              // Issuer: 'sheen-admin'
}
```

#### Role Hierarchy

- **`super_admin`**: Can create/revoke admin users, has all permissions
- **`admin`**: Can manage users, support, advisors based on permissions

#### Available Permissions

- `users.read` - View user information and activity
- `users.write` - Modify user status, suspend/ban users
- `advisors.approve` - Approve/reject advisor applications
- `support.read` - View support tickets and conversations
- `support.write` - Create tickets, reply to customers, escalate issues
- `finance.read` - View financial overview and transaction data
- `finance.refund` - Process refunds and financial adjustments
- `violations.enforce` - Enforce trust & safety policies
- `admin.audit` - Access administrative audit logs

#### Structured Reason Codes

Use these codes in `x-admin-reason` header format: `[CODE] detailed description`

**Trust & Safety Codes:**
- `T01` - Spam or promotional content
- `T02` - Harassment or abusive behavior
- `T03` - Fraud or chargeback risk
- `T04` - Policy evasion or circumvention
- `T05` - Illegal content or activity

**Financial Codes:**
- `F01` - Duplicate charge or billing error
- `F02` - Customer dissatisfaction or complaint
- `F03` - Fraud reversal or chargeback

### Control Center Dashboard

#### GET /v1/admin/dashboard

Get administrative dashboard with key KPIs and health status.

**Required Permission**: Any admin permission
**Headers**: Standard admin headers

**Response**:
```json
{
  "success": true,
  "kpis": {
    "open_tickets": 12,
    "due_2h": 3,
    "pending_advisors": 8,
    "revenue_today": 2450.00,
    "build_errors_24h": 2,
    "critical_alerts": 0
  },
  "health_status": {
    "tickets": "warning",      // "good" | "warning" | "critical"
    "advisors": "good",
    "alerts": "good"
  },
  "correlation_id": "corr_abc123",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

### User Management

> **📊 Pagination Update (September 4, 2025)**: All admin endpoints now include `total` in pagination responses for proper UI pagination support.

#### GET /v1/admin/users

Search and list users with filtering options.

**Required Permission**: `users.read`
**Headers**: Standard admin headers

**Query Parameters**:
- `search` (optional): Search by email, name, or ID
- `status` (optional): Filter by user status (`active`, `suspended`, `banned`)
- `exclude_admin_users` (optional): When `true`, excludes users with admin roles/permissions
- `exclude_advisor_users` (optional): When `true`, excludes users with advisor roles or profiles
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Results offset for pagination

**Response**:
```json
{
  "success": true,
  "users": [
    {
      "id": "user_123",
      "email": "user@example.com",
      "created_at": "2025-08-15T10:00:00Z",
      "last_active": "2025-08-30T15:30:00Z",
      "status": "active",
      "project_count": 5,
      "total_spent": 45.00
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 25,
    "total": 150
  },
  "correlation_id": "corr_def456",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

#### PUT /v1/admin/users/:userId/status

Update user status (suspend, ban, or activate).

**Required Permission**: `users.write`
**Required Headers**: Standard admin headers + `x-admin-reason`

**Body**:
```json
{
  "action": "suspend",           // "suspend" | "ban" | "activate"
  "duration_days": 7,           // For suspensions only
  "reason": "Policy violation"   // Additional context
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "User suspended successfully",
  "user": {
    "id": "user_123",
    "status": "suspended",
    "suspended_until": "2025-09-07T10:30:00Z"
  },
  "admin_action": {
    "admin_id": "admin_456",
    "reason": "[T02] Harassment reported by multiple users",
    "timestamp": "2025-08-31T10:30:00Z"
  },
  "correlation_id": "corr_ghi789",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

### Advisor Management

#### GET /v1/admin/advisors/applications

List pending advisor applications for review.

**Required Permission**: `advisors.approve`
**Headers**: Standard admin headers

**Query Parameters**:
- `status` (optional): Filter by status (`pending`, `under_review`, `completed`)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Results offset

**Response**:
```json
{
  "success": true,
  "applications": [
    {
      "id": "app_789",
      "user_id": "user_123",
      "user_email": "advisor@example.com",
      "expertise": ["Business Strategy", "Marketing"],
      "languages": ["en", "ar"],
      "status": "pending",
      "submitted_at": "2025-08-30T14:00:00Z",
      "experience_years": 8
    }
  ],
  "correlation_id": "corr_jkl012",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

#### PUT /v1/admin/advisors/:applicationId/review

Approve or reject advisor application.

**Required Permission**: `advisors.approve`
**Required Headers**: Standard admin headers + `x-admin-reason`

**Body**:
```json
{
  "action": "approve",          // "approve" | "reject"
  "notes": "Strong experience in target markets"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Advisor application approved successfully",
  "advisor": {
    "id": "adv_123",
    "status": "approved",
    "approved_at": "2025-08-31T10:30:00Z"
  },
  "admin_action": {
    "admin_id": "admin_456",
    "action": "approve",
    "reason": "Strong qualifications and experience",
    "notes": "Strong experience in target markets"
  },
  "correlation_id": "corr_mno345",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

### Admin User Management (Super Admin Only)

#### POST /v1/admin/management/users/create

Create a new admin user. This endpoint implements a multi-step process to ensure the user can authenticate properly despite Supabase schema drift issues.

**Required Role**: `super_admin` (regular admins cannot create other admins)
**Required Headers**: Standard admin headers + `x-admin-reason`

**Body**:
```json
{
  "email": "newadmin@example.com",
  "password": "SecurePassword123",     // Min 8 characters
  "role": "admin",                     // "admin" | "super_admin"
  "permissions": ["admin:users", "admin:support"], // Optional, defaults to ["admin:*"]
  "display_name": "John Doe"           // Optional
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "Admin user created successfully",
  "user": {
    "id": "user_uuid",
    "email": "newadmin@example.com",
    "role": "admin",
    "permissions": ["admin:users", "admin:support"],
    "temporary_password": "SecurePassword123",
    "created_by": "superadmin@example.com",
    "created_at": "2025-09-03T14:10:00.150Z"
  },
  "instructions": "User should change password on first login",
  "correlation_id": "corr_xyz123"
}
```

**Error Responses**:
- `403 Forbidden`: If requesting user is not super_admin
- `409 Conflict`: If email already exists as admin
- `400 Bad Request`: If password too short or email invalid

#### GET /v1/admin/management/users

List all admin users and their permissions.

**Required Role**: `admin` or `super_admin`
**Required Headers**: Standard admin headers + `x-admin-reason`

**Response**:
```json
{
  "success": true,
  "admins": [
    {
      "id": "user_123",
      "email": "admin@example.com",
      "role": "super_admin",
      "permissions": ["admin:*", "super_admin:*"],
      "created_at": "2025-01-01T00:00:00Z",
      "created_by": "system"
    },
    {
      "id": "user_456",
      "email": "support@example.com",
      "role": "admin",
      "permissions": ["admin:users", "admin:support"],
      "created_at": "2025-08-01T00:00:00Z",
      "created_by": "superadmin@example.com"
    }
  ],
  "total": 2,
  "correlation_id": "corr_abc789"
}
```

#### DELETE /v1/admin/management/users/:userId

Revoke admin privileges from a user.

**Required Role**: `super_admin`
**Required Headers**: Standard admin headers + `x-admin-reason`

**Response** (Success):
```json
{
  "success": true,
  "message": "Admin privileges revoked successfully",
  "correlation_id": "corr_def456"
}
```

**Error Responses**:
- `403 Forbidden`: If requesting user is not super_admin
- `400 Bad Request`: If trying to revoke own privileges
- `404 Not Found`: If user doesn't exist

**Important Security Notes**:
1. **Privilege Escalation Prevention**: Even if a regular admin has `admin.elevated` permission, they cannot create admin users unless their role is `super_admin`
2. **Audit Logging**: All admin creation/revocation attempts are logged, including failed attempts
3. **Reason Enforcement**: All operations require `x-admin-reason` header for audit trail
4. **No Self-Escalation**: Admins cannot grant themselves higher privileges
5. **Password Requirements**: Minimum 8 characters, should be changed on first login

### Support System

#### GET /v1/admin/support/tickets

List support tickets with filtering and priority indicators.

**Required Permission**: `support.read`
**Headers**: Standard admin headers

**Query Parameters**:
- `status` (optional): Filter by status (`open`, `assigned`, `resolved`, `closed`)
- `priority` (optional): Filter by priority (`low`, `medium`, `high`, `urgent`)
- `assigned_to` (optional): Filter by assigned admin
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Results offset

**Response**:
```json
{
  "success": true,
  "tickets": [
    {
      "id": "tick_001",
      "ticket_number": "SUP-2025-001",
      "user_id": "user_123",
      "user_email": "customer@example.com",
      "subject": "Billing inquiry",
      "status": "open",
      "priority": "medium",
      "category": "billing",
      "created_at": "2025-08-30T09:00:00Z",
      "sla_due_at": "2025-08-31T17:00:00Z",
      "assigned_to": "admin_456",
      "last_message_at": "2025-08-30T15:30:00Z"
    }
  ],
  "correlation_id": "corr_pqr678",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

### Financial Operations

#### GET /v1/admin/finance/overview

Get financial overview and key metrics.

**Required Permission**: `finance.read`
**Headers**: Standard admin headers

**Response**:
```json
{
  "success": true,
  "overview": {
    "revenue_today": 2450.00,
    "revenue_month": 58900.00,
    "pending_payouts": {
      "count": 12,
      "total_amount": 3400.00
    },
    "refund_requests": 3
  },
  "correlation_id": "corr_stu901",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

#### POST /v1/admin/finance/refunds

Process customer refund with comprehensive audit trail and automatic two-person approval for high-value transactions.

**Required Permission**: `finance.refund`
**Required Headers**: Standard admin headers + `idempotency-key`
**Auto-Enforced**: Reason validation for refund operations

**Body**:
```json
{
  "invoice_id": "inv_abc123",
  "amount": 45.00,              // Optional partial refund (full refund if omitted)
  "reason": "Customer dissatisfaction with service quality",
  "notify_user": true           // Send email notification
}
```

**Workflow**:
- **≤$500**: Immediate processing with Stripe integration
- **>$500**: Automatic two-person approval queue
- **UUID Pairing**: Same correlation ID used for API → Database → Stripe
- **Idempotency**: Atomic duplicate prevention with request hashing

**Response** (Immediate processing ≤$500):
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "refund": {
    "invoice_id": "inv_abc123",
    "amount": 45.00,
    "reason": "Customer dissatisfaction with service quality",
    "stripe_refund_id": "re_stripe123",
    "processed_by": "admin_456",
    "processed_at": "2025-08-31T10:30:00Z"
  },
  "correlation_id": "corr_vwx234",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

**Response** (Two-person approval required >$500):
```json
{
  "success": true,
  "status": "pending_approval",
  "approval_id": "approval_def456",
  "message": "Refund of $750.00 requires approval (threshold: $500)",
  "refund": {
    "invoice_id": "inv_abc123",
    "amount": 750.00,
    "reason": "[F03] Fraud reversal - chargeback initiated",
    "requested_by": "admin_456",
    "expires_at": "2025-09-01T10:30:00Z"
  },
  "correlation_id": "corr_yza567",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

**HTTP Status**: `202 Accepted` for pending approval, `200 OK` for immediate processing

### Admin Promotion Management System

#### GET /admin/providers/availability

Get available payment providers and their capabilities.

**Required Permission**: `promotion:read`
**Headers**:
- `Authorization: Bearer <admin_jwt>`

**Response**:
```json
{
  "providers": [
    {
      "key": "stripe",
      "name": "Stripe",
      "supported_currencies": ["USD", "EUR", "GBP"],
      "supported_regions": ["us", "ca", "gb", "eu"],
      "checkout_types": ["redirect"],
      "status": "active",
      "features": {
        "supports_percentage_discount": true,
        "supports_fixed_discount": true,
        "supports_minimum_order": true,
        "max_discount_percentage": 100
      }
    },
    {
      "key": "fawry",
      "name": "Fawry",
      "supported_currencies": ["EGP"],
      "supported_regions": ["eg"],
      "checkout_types": ["voucher"],
      "status": "active",
      "features": {
        "supports_percentage_discount": true,
        "supports_fixed_discount": true,
        "supports_minimum_order": true,
        "max_discount_percentage": 50
      }
    }
  ],
  "last_updated": "2025-09-02T10:00:00Z",
  "cache_ttl_seconds": 300
}
```

#### POST /admin/promotions/validate

Validate promotion configuration with scenario testing.

**Required Permission**: `promotion:read`
**Headers**:
- `Authorization: Bearer <admin_jwt>`
- `Content-Type: application/json`

**Request Body**:
```json
{
  "promotion_config": {
    "name": "Summer Sale",
    "discount_type": "percentage",
    "discount_value": 20,
    "currency": null,
    "codes": ["SUMMER20"],
    "supported_providers": ["stripe", "fawry"],
    "checkout_type_restrictions": ["redirect"],
    "minimum_order_amount": 5000,
    "minimum_order_currency": "USD"
  },
  "test_scenarios": [
    {
      "region": "us",
      "currency": "USD",
      "order_amount": 10000,
      "provider": "stripe"
    }
  ]
}
```

**Response**:
```json
{
  "valid": true,
  "warnings": ["Only two providers selected - consider adding more for redundancy"],
  "errors": [],
  "scenario_results": [
    {
      "scenario": {
        "region": "us",
        "currency": "USD",
        "order_amount": 10000,
        "provider": "stripe"
      },
      "eligible": true,
      "discount_amount": 2000,
      "final_amount": 8000,
      "selected_provider": "stripe",
      "reason": "Eligible for discount"
    }
  ]
}
```

#### POST /admin/promotions/multi-provider

Create a multi-provider promotion with regional configuration.

**Required Permission**: `promotion:write` or `promotion:provider_config`
**Headers**:
- `Authorization: Bearer <admin_jwt>`
- `Content-Type: application/json`
- `x-admin-reason: <reason>` (required)

**Request Body**:
```json
{
  "name": "Global Summer Campaign",
  "description": "20% off for all regions",
  "discount_type": "percentage",
  "discount_value": 20,
  "currency": null,
  "codes": ["GLOBAL20", "SUMMER2025"],
  "max_total_uses": 1000,
  "max_uses_per_user": 1,
  "valid_from": "2025-09-01T00:00:00Z",
  "valid_until": "2025-09-30T23:59:59Z",
  "supported_providers": ["stripe", "fawry", "paymob"],
  "minimum_order_amount": 5000,
  "minimum_order_currency": "USD",
  "regional_configs": [
    {
      "region_code": "eg",
      "preferred_providers": ["fawry", "paymob"],
      "localized_name": {
        "en": "Egypt Summer Sale",
        "ar": "تخفيضات الصيف مصر"
      },
      "min_order_override": 10000
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "promotion_id": "promo_abc123",
  "warnings": [],
  "correlation_id": "corr_xyz789"
}
```

#### PATCH /admin/promotions/:id/providers

Update promotion provider configuration.

**Required Permission**: `promotion:provider_config`
**Headers**:
- `Authorization: Bearer <admin_jwt>`
- `Content-Type: application/json`
- `x-admin-reason: <reason>` (required)

**Request Body**:
```json
{
  "supported_providers": ["stripe", "paytabs"],
  "currency": "USD",
  "checkout_type_restrictions": ["redirect"]
}
```

**Response**:
```json
{
  "success": true,
  "promotion": {
    "id": "promo_abc123",
    "name": "Global Summer Campaign",
    "supported_providers": ["stripe", "paytabs"],
    "currency": "USD",
    "checkout_type_restrictions": ["redirect"]
  }
}
```

#### GET /admin/promotions/:id/provider-analytics

Get provider-specific analytics for a promotion.

**Required Permission**: `promotion:analytics`
**Headers**:
- `Authorization: Bearer <admin_jwt>`

**Response**:
```json
{
  "promotion_id": "promo_abc123",
  "name": "Global Summer Campaign",
  "status": "active",
  "discount_type": "percentage",
  "discount_value": 20,
  "supported_providers": ["stripe", "fawry"],
  "metrics": {
    "total_redemptions": 150,
    "unique_users": 120,
    "total_discount_given": 3000000,
    "utilization_percentage": 15.0,
    "active_reservations": 5
  },
  "provider_breakdown": {
    "stripe": 100,
    "fawry": 50
  },
  "currency_breakdown": {
    "USD": 100,
    "EGP": 50
  }
}
```

#### GET /admin/promotions/regional-defaults

Get smart defaults based on region.

**Required Permission**: `promotion:read`
**Headers**:
- `Authorization: Bearer <admin_jwt>`

**Query Parameters**:
- `region`: Region code (us, ca, gb, eu, eg, sa)

**Response**:
```json
{
  "region": "eg",
  "defaults": {
    "providers": ["fawry", "paymob"],
    "currency": "EGP",
    "checkoutTypes": ["voucher", "redirect"]
  }
}
```

### Admin Audit & Compliance System

#### GET /v1/admin/approvals/pending

List all pending two-person approval requests for sensitive operations.

**Required Permission**: `admin.read`
**Headers**: Standard admin headers

**Response**:
```json
{
  "success": true,
  "pending_approvals": [
    {
      "id": "approval_abc123",
      "action": "refund.issue",
      "resource_type": "invoice",
      "resource_id": "inv_456",
      "payload": {
        "invoice_id": "inv_456",
        "amount": 750.00,
        "reason": "[F03] Fraud reversal - chargeback initiated",
        "notify_user": true
      },
      "threshold": 750.00,
      "requested_by": "admin_789",
      "requested_by_email": "admin@company.com",
      "correlation_id": "corr_original123",
      "created_at": "2025-08-31T09:15:00Z"
    }
  ],
  "count": 1,
  "correlation_id": "corr_list456",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

#### POST /v1/admin/approvals/:id/approve

Approve a pending two-person request and execute the requested action.

**Required Permission**: `admin.approve`
**Required Headers**: Standard admin headers + `x-admin-reason`

**Body**:
```json
{
  "reason": "Verified chargeback with bank - legitimate fraud case documented"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Request approved and processed successfully",
  "approval": {
    "id": "approval_abc123",
    "action": "refund.issue",
    "approved_by": "admin_super",
    "approved_at": "2025-08-31T10:30:00Z",
    "reason": "Verified chargeback with bank - legitimate fraud case documented"
  },
  "correlation_id": "corr_approve789",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

**Notes**:
- Approver must be different from the original requester
- For refund approvals, the Stripe refund is automatically processed upon approval
- All approvals are logged to the admin audit trail with correlation tracking

#### POST /v1/admin/approvals/:id/reject

Reject a pending two-person request with documented reason.

**Required Permission**: `admin.approve`
**Required Headers**: Standard admin headers + `x-admin-reason`

**Body**:
```json
{
  "reason": "Insufficient documentation - customer inquiry not verified through support"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Request rejected successfully",
  "rejection": {
    "id": "approval_abc123",
    "rejected_by": "admin_super",
    "rejected_at": "2025-08-31T10:30:00Z",
    "reason": "Insufficient documentation - customer inquiry not verified through support"
  },
  "correlation_id": "corr_reject321",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

### Trust & Safety

#### PUT /v1/admin/users/:userId/trust-action

Enforce trust and safety policies.

**Required Permission**: `violations.enforce`
**Required Headers**: Standard admin headers + `x-admin-reason`

**Body**:
```json
{
  "action": "suspend",          // "suspend" | "ban" | "warn" | "activate"
  "violation_code": "T02",      // T01-T05 policy violation code
  "duration_days": 7,           // For suspensions
  "notes": "Multiple harassment reports confirmed"
}
```

### Error Responses

All admin endpoints return structured error responses with correlation IDs:

```json
{
  "success": false,
  "error": "Permission denied",
  "code": "INSUFFICIENT_PRIVILEGES",
  "correlation_id": "corr_error123",
  "timestamp": "2025-08-31T10:30:00Z"
}
```

**Common Error Codes**:
- `MISSING_REASON` - Required reason header not provided
- `INSUFFICIENT_PRIVILEGES` - User lacks required permissions
- `INVALID_CLAIMS` - JWT claims are malformed or expired
- `REFUND_PROCESSING_ERROR` - Financial operation failed

### Rate Limits

- **Standard Operations**: 60 requests/minute per admin
- **Financial Operations**: 20 requests/minute per admin
- **Bulk Operations**: 10 requests/minute per admin

### Audit Trail

All admin actions are automatically logged with:
- Admin user ID and email
- Action performed and target resource
- Reason provided and correlation ID
- Timestamp and source IP address
- Request/response data (sanitized)

Admin audit logs are accessible via separate audit endpoints for compliance and security monitoring.

---

## 💳 **Multi-Provider Payment Admin APIs** (NEW - September 2, 2025)

**Status**: ✅ Production Ready
**Features**: Provider health monitoring, circuit breaker controls, dunning management
**Security**: Admin JWT authentication, dual-approval workflows

### Overview

The multi-provider admin system provides comprehensive monitoring and control for payment operations across 5 providers (Stripe, Fawry, Paymob, STC Pay, PayTabs) spanning 5 currencies (USD, EUR, GBP, EGP, SAR).

### Authentication

All admin endpoints require Admin JWT authentication (see Admin Panel API section above):

```typescript
headers: {
  'Authorization': 'Bearer <admin_jwt>',
  'x-correlation-id': generateUUID(),
  'Content-Type': 'application/json'
}
```

### 1. **GET /v1/admin/providers/dashboard**

Get comprehensive provider monitoring dashboard data.

#### Response
```typescript
{
  success: true,
  data: {
    provider_health: [
      {
        provider: "stripe",
        isHealthy: true,
        successRate: 0.97,
        lastHealthCheck: "2025-09-02T15:30:00Z",
        failureCount: 1
      }
    ],
    webhook_stats: [
      {
        payment_provider: "fawry",
        total_events: "125",
        processed_events: "123",
        failed_events: "2",
        success_rate: "0.984"
      }
    ],
    mapping_coverage: [
      {
        item_key: "mini",
        item_type: "package",
        provider_count: 5,
        available_providers: ["stripe", "fawry", "paymob", "stcpay", "paytabs"],
        available_currencies: ["USD", "EGP", "SAR"]
      }
    ],
    regional_availability: [
      {
        region: "eg",
        subscription_providers: ["paymob", "stripe"],
        package_providers: ["fawry", "paymob"],
        recommended_currencies: ["EGP", "USD"],
        is_supported: true
      }
    ],
    slo_compliance: [
      {
        provider: "stripe",
        payment_success_rate: 0.97,
        webhook_success_rate: 0.99,
        is_healthy: true,
        slo_compliance: {
          payment_slo_met: true,      // >95% threshold
          webhook_slo_met: true,      // >99% threshold
          overall_compliant: true
        }
      }
    ]
  },
  timestamp: "2025-09-02T15:30:00Z"
}
```

### 2. **GET /v1/admin/providers/:provider/metrics**

Get detailed metrics for a specific provider.

#### Parameters
- `provider`: `stripe|fawry|paymob|stcpay|paytabs`

#### Response
```typescript
{
  success: true,
  provider: "fawry",
  data: {
    health: {
      provider: "fawry",
      isHealthy: true,
      successRate: 0.94,
      lastHealthCheck: "2025-09-02T15:30:00Z",
      failureCount: 2
    },
    webhooks: {
      total_events: 85,
      processed_events: 83,
      failed_events: 2
    },
    mappings: [
      {
        currency: "EGP",
        total_mappings: 4,
        subscription_mappings: 0,
        package_mappings: 4,
        mapped_items: ["mini", "plus", "mega", "max"]
      }
    ],
    transactions: {
      total_transactions: 156,
      successful_transactions: 145,
      failed_transactions: 11,
      total_volume_cents: 487500,
      avg_transaction_cents: 3125,
      currencies_processed: ["EGP"]
    }
  },
  timestamp: "2025-09-02T15:30:00Z"
}
```

### 3. **POST /v1/admin/providers/:provider/circuit-breaker/:action**

Manual circuit breaker controls for providers.

#### Parameters
- `provider`: `stripe|fawry|paymob|stcpay|paytabs`
- `action`: `trip|recover`

#### Request Headers
```typescript
{
  'x-admin-reason': '[P01] Manual maintenance window',
  'idempotency-key': generateUUID()
}
```

#### Response (Recovery)
```typescript
{
  success: true,
  message: "Circuit breaker recovered for fawry",
  provider: "fawry",
  action: "recovered",
  timestamp: "2025-09-02T15:30:00Z"
}
```

### 4. **GET /v1/admin/providers/validate-mappings**

Validate price mapping completeness and capability matches.

#### Response
```typescript
{
  success: true,
  data: {
    missing_mappings: [
      {
        item_key: "ultra",
        item_type: "subscription",
        base_currency: "USD",
        available_providers: []
      }
    ],
    capability_mismatches: [
      {
        item_key: "starter",
        item_type: "subscription",
        payment_provider: "fawry",
        supports_recurring: false,  // Problem: subscription mapped to non-recurring provider
        currency: "EGP"
      }
    ],
    validation_passed: false
  },
  timestamp: "2025-09-02T15:30:00Z"
}
```

### 5. **POST /v1/admin/webhooks/:provider/:eventId/replay**

Manually replay a webhook event.

#### Parameters
- `provider`: `stripe|fawry|paymob|stcpay|paytabs`
- `eventId`: Provider event ID to replay

#### Response
```typescript
{
  success: true,
  message: "Event replayed successfully",
  eventId: "fawry_event_123",
  provider: "fawry",
  timestamp: "2025-09-02T15:30:00Z"
}
```

### 6. **GET /v1/admin/webhooks/stats?provider=<provider>**

Get webhook processing statistics.

#### Query Parameters
- `provider` (optional): Filter by specific provider

#### Response
```typescript
{
  success: true,
  data: [
    {
      payment_provider: "stripe",
      total_events: "450",
      processed_events: "448",
      failed_events: "2",
      replayed_events: "1",
      success_rate: "0.996"
    }
  ],
  timestamp: "2025-09-02T15:30:00Z"
}
```

### Frontend Integration Example

```typescript
// Multi-provider admin dashboard
function ProviderDashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      const response = await fetch('/api/admin/providers/dashboard', {
        headers: {
          'Authorization': `Bearer ${adminJWT}`,
          'x-correlation-id': generateUUID()
        }
      });

      const data = await response.json();
      setDashboardData(data);
      setLoading(false);
    };

    fetchDashboard();
  }, []);

  const handleCircuitBreaker = async (provider: string, action: 'trip' | 'recover') => {
    const response = await fetch(`/api/admin/providers/${provider}/circuit-breaker/${action}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminJWT}`,
        'x-admin-reason': '[M01] Manual intervention required',
        'x-correlation-id': generateUUID(),
        'idempotency-key': generateUUID()
      }
    });

    if (response.ok) {
      toast.success(`Provider ${provider} ${action}ped successfully`);
      // Refresh dashboard
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="provider-dashboard">
      {/* Provider Health Cards */}
      <div className="provider-health-grid">
        {dashboardData.data.provider_health.map(provider => (
          <div key={provider.provider} className={`provider-card ${provider.isHealthy ? 'healthy' : 'unhealthy'}`}>
            <h3>{provider.provider}</h3>
            <div className="health-metrics">
              <div className="success-rate">
                Success Rate: {(provider.successRate * 100).toFixed(1)}%
              </div>
              <div className="failure-count">
                Failures: {provider.failureCount}
              </div>
            </div>

            {/* Circuit Breaker Controls */}
            <div className="circuit-controls">
              <button
                onClick={() => handleCircuitBreaker(provider.provider, 'trip')}
                className="trip-button"
              >
                Trip Circuit
              </button>
              <button
                onClick={() => handleCircuitBreaker(provider.provider, 'recover')}
                className="recover-button"
              >
                Recover
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* SLO Compliance Dashboard */}
      <div className="slo-compliance">
        <h2>SLO Compliance</h2>
        {dashboardData.data.slo_compliance.map(slo => (
          <div key={slo.provider} className="slo-row">
            <span className="provider-name">{slo.provider}</span>
            <span className={`slo-badge ${slo.slo_compliance.overall_compliant ? 'compliant' : 'non-compliant'}`}>
              {slo.slo_compliance.overall_compliant ? '✅ Compliant' : '❌ Non-Compliant'}
            </span>
            <span className="payment-slo">
              Payment: {(slo.payment_success_rate * 100).toFixed(1)}%
            </span>
            <span className="webhook-slo">
              Webhook: {(slo.webhook_success_rate * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 💰 **Admin Billing & Customer Analytics APIs** (NEW - September 2, 2025)

**Status**: ✅ Production Ready
**Purpose**: Customer 360 financial intelligence, multi-provider revenue analytics, health scoring
**Implementation**: Complete admin billing enhancement system

### Overview

The Admin Billing system provides comprehensive financial intelligence and customer analytics for revenue operations teams. Features include:

- **Customer 360 Profiles**: Complete financial view with health scoring
- **Multi-Currency Revenue Analytics**: MRR/ARR tracking across USD/EUR/GBP/EGP/SAR
- **Provider Performance Monitoring**: Success rates and error analytics
- **Risk Identification**: Automated health scoring with transparent formula
- **Real-time Data**: Materialized views with sub-300ms query performance

### Authentication

All admin billing endpoints require:
- Standard HMAC authentication
- Admin JWT token with appropriate permissions
- Admin role verification

### 1. **GET /v1/admin/billing/overview**

Executive dashboard with key financial and customer metrics.

#### Headers
```typescript
{
  'Authorization': 'Bearer <admin_jwt>',
  'x-sheen-signature': '<hmac_signature>',
  'x-sheen-timestamp': '<unix_timestamp>',
  'x-sheen-nonce': '<random_nonce>',
  'x-correlation-id': '<uuid>' // Optional for request tracing
}
```

#### Response
```typescript
{
  success: true,
  data: {
    // Revenue metrics
    revenue: {
      total_mrr_usd_cents: 245000,        // $2,450.00 MRR
      total_arr_usd_cents: 2940000,       // $29,400.00 ARR
      growth_rate_percent: 15.2,
      currency_breakdown: {
        USD: { mrr_cents: 180000, subscribers: 45 },
        EUR: { mrr_cents: 45000, subscribers: 12 },
        GBP: { mrr_cents: 15000, subscribers: 3 },
        EGP: { mrr_cents: 3500, subscribers: 8 },
        SAR: { mrr_cents: 1500, subscribers: 2 }
      }
    },

    // Customer metrics
    customers: {
      total_customers: 156,
      active_subscribers: 70,
      at_risk_customers: 12,
      health_distribution: {
        low: 98,      // Health score 71-100
        medium: 34,   // Health score 41-70
        high: 24      // Health score 0-40
      }
    },

    // Provider performance
    providers: {
      stripe: { success_rate: 0.987, total_revenue_cents: 210000 },
      fawry: { success_rate: 0.945, total_revenue_cents: 25000 },
      paymob: { success_rate: 0.923, total_revenue_cents: 8000 },
      stcpay: { success_rate: 0.978, total_revenue_cents: 1500 },
      paytabs: { success_rate: 0.912, total_revenue_cents: 500 }
    }
  },
  timestamp: "2025-09-02T15:30:00Z"
}
```

### 2. **GET /v1/admin/billing/customers/:userId/financial-profile**

Complete Customer 360 financial view with health scoring breakdown.

#### URL Parameters
- `userId` (string): Customer user ID

#### Response
```typescript
{
  success: true,
  data: {
    customer_id: "cust_12345",
    user_id: "user_67890",
    email: "customer@example.com",
    health_score: 78,
    risk_level: "low",
    subscription: {
      id: "sub_abc123",
      plan_name: "Builder Plan",
      status: "active",
      amount_cents: 3900,
      currency: "USD"
    },
    payments: {
      successful_payments: 7,
      failed_payments: 1,
      total_paid_cents: 27300
    },
    usage: {
      remaining_time_seconds: 54200,
      minutes_runway_days: 23.5
    }
  }
}
```

### 3. **GET /v1/admin/billing/analytics/revenue**

Multi-currency revenue analytics with provider attribution.

#### Query Parameters
- `period`: 'month' | 'quarter' | 'year' (default: month)
- `currency`: Filter by currency (optional)
- `provider`: Filter by provider (optional)

### 4. **GET /v1/admin/billing/customers/at-risk**

Customers identified as at-risk based on health scoring.

#### Query Parameters
- `risk_level`: 'high' | 'medium' | 'all' (default: high)
- `limit`: Max 200 (default: 50)
- `sort_by`: 'health_score' | 'last_activity' | 'payment_risk'

### 5. **GET /v1/admin/billing/providers/performance**

Provider performance analytics with error categorization.

#### Query Parameters
- `provider`: Filter by specific provider (optional)
- `period_days`: Max 365 (default: 30)
- `include_errors`: Include error breakdown (default: true)

### 6. **GET /v1/admin/billing/analytics/packages**

Package revenue analytics (separate from MRR).

### 7. **GET /v1/admin/billing/health/distribution**

Customer health score distribution analysis.

### 8. **POST /v1/admin/billing/maintenance/refresh-views**

Refresh materialized views for updated analytics data.

### Frontend Integration Example

```typescript
// Admin billing dashboard component
function AdminBillingDashboard() {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    const fetchBillingData = async () => {
      const response = await fetch('/v1/admin/billing/overview', {
        headers: {
          'Authorization': `Bearer ${adminJWT}`,
          'x-sheen-signature': generateSignature(),
          'x-sheen-timestamp': timestamp,
          'x-sheen-nonce': nonce
        }
      });
      const data = await response.json();
      setOverview(data.data);
    };

    fetchBillingData();
  }, []);

  return (
    <div className="admin-billing-dashboard">
      <div className="revenue-section">
        <h2>Revenue Analytics</h2>
        <div className="metric-card">
          <h3>Monthly Recurring Revenue</h3>
          <p>${(overview.revenue.total_mrr_usd_cents / 100).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
```

### Performance & Health Score Formula

**Query Performance**: Overview < 500ms, Customer 360 < 300ms, Revenue < 400ms

**Health Score Formula** (Transparent):
- Usage Trend (35%): 30-day vs 60-day consumption ratio
- Payment Risk (25%): Failed payment frequency in 90 days
- Minutes Runway (20%): Available time vs usage rate projection
- Last Activity (10%): Days since last system interaction
- Support Friction (10%): Support ticket count in 30 days

---

## 🚀 **Unified Multi-Tier Logs API** (NEW - September 13, 2025)

**Status**: ✅ Production Ready  
**Features**: Complete observability across all application tiers  
**Authentication**: Admin JWT with `read_logs` permission  
**Tiers**: system, build, deploy, action, lifecycle

### Overview

The **Unified Multi-Tier Logging System** provides comprehensive observability across all application layers. Unlike legacy build-specific logs, this system captures server-wide events, user actions, deployments, and lifecycle events in a structured, queryable format.

**Key Advantages:**
- **5-Tier Coverage**: system, build, deploy, action, lifecycle logs
- **Structured Format**: Consistent NDJSON schema across all tiers
- **Advanced Filtering**: Time ranges, tier filtering, instance-specific queries
- **Segment-Based Storage**: Hourly segments for optimal performance
- **Multi-Instance Safe**: Unique instance IDs prevent conflicts

### 🔐 Authentication

All unified log endpoints use admin JWT authentication:

```typescript
const headers = {
  'Authorization': `Bearer ${adminJwt}`,
  'Content-Type': 'application/json'
};
```

**Required Permission**: `read_logs`

### API Endpoints

#### **1. GET /admin/unified-logs/segments** - List Log Segments

Discover available log segments with comprehensive metadata.

**Query Parameters:**
- `startDate` (optional): Start date filter (YYYY-MM-DD format)
- `endDate` (optional): End date filter (YYYY-MM-DD format)
- `tier` (optional): Tier filter (`system`|`build`|`deploy`|`action`|`lifecycle`)
- `instanceId` (optional): Filter by server instance

**Response:**
```typescript
{
  success: true,
  segments: [{
    path: string,
    filename: string,
    tier: string,
    hour: string,
    instanceId: string,
    size: number,
    modified: string
  }],
  query: { startDate: string, endDate: string, tier?: string }
}
```

**Frontend Integration Example:**
```typescript
const fetchLogSegments = async (tier?: string) => {
  const params = new URLSearchParams({
    ...(tier && { tier }),
    startDate: '2025-09-13'
  });
  
  const response = await fetch(`/admin/unified-logs/segments?${params}`, {
    headers: { 'Authorization': `Bearer ${adminJwt}` }
  });
  
  const data = await response.json();
  return data.segments;
};
```

#### **2. GET /admin/unified-logs/stream** - Stream Unified Logs

Stream logs across multiple tiers with advanced filtering.

**Query Parameters:**
- `tier` (optional): Tier filter (`system`|`build`|`deploy`|`action`|`lifecycle`)
- `startDate` (optional): Start date filter (YYYY-MM-DD format)
- `endDate` (optional): End date filter (YYYY-MM-DD format)
- `instanceId` (optional): Filter by server instance
- `format` (optional): Output format (`ndjson`|`raw`, default: `ndjson`)
- `limit` (optional): Max entries (default: 1000, max: 10000)
- `sortOrder` (optional): Sort order (`asc`|`desc`, default: `desc`) - Orders by timestamp

**Response Formats:**

**NDJSON Format (default):**
```json
{"timestamp":1726229415123,"instanceId":"ABC123","tier":"system","severity":"info","event":"daily_bonus_granted","message":"Daily bonus granted to user 01HZ8X9J2K","userId":"01HZ8X9J2K"}
{"timestamp":1726229416456,"instanceId":"ABC123","tier":"build","severity":"info","event":"stdout","message":"npm install completed","buildId":"01HZ8X9J2K3L4M5N6P7Q8R9S0T"}
```

**Raw Text Format (format=raw):**
```
[2025-09-13T14:30:15.123Z] SYSTEM [ABC123] INFO daily_bonus_granted: Daily bonus granted to user 01HZ8X9J2K
[2025-09-13T14:30:16.456Z] BUILD [ABC123] [01HZ8X9J2K3L4M5N6P7Q8R9S0T] (stdout) npm install completed
[2025-09-13T14:30:17.789Z] DEPLOY [ABC123] [01HZ8X9J2K3L4M5N6P7Q8R9S0T] started: Cloudflare deployment initiated
[2025-09-13T14:30:18.012Z] ACTION [ABC123] create_preview_success POST /v1/create-preview-for-new-project (200) 2847ms
```


**Frontend Integration Example:**
```typescript
const streamUnifiedLogs = async (tier: string = 'build') => {
  const params = new URLSearchParams({
    tier,
    limit: '1000' // Uses NDJSON by default for consistency
  });
  
  const response = await fetch(`/admin/unified-logs/stream?${params}`, {
    headers: { 'Authorization': `Bearer ${adminJwt}` }
  });
  
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { value, done } = await reader!.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        console.log(line); // Raw formatted log line
      }
    }
  }
};
```

#### **3. GET /admin/unified-logs/segments/:segmentId** - Download Segment

Download specific log segment with optional format conversion.

**Parameters:**
- `segmentId` (path, required): Segment filename (e.g., "build-14-ABC123-DEF456.ndjson")
- `format` (query, optional): Output format (`ndjson`|`raw`, default: `ndjson`)

**Response:**
- **Content-Type**: `text/plain` (raw) or `application/x-ndjson` (ndjson)
- **Cache-Control**: `public, max-age=3600` (segments are immutable)

**Frontend Integration Example:**
```typescript
const downloadSegment = async (segmentId: string, format: 'ndjson' | 'raw' = 'ndjson') => {
  const response = await fetch(`/admin/unified-logs/segments/${segmentId}?format=${format}`, {
    headers: { 'Authorization': `Bearer ${adminJwt}` }
  });
  
  return await response.text();
};
```

### 📋 Multi-Tier Log Categories

#### System Logs (`tier=system`)
**Server-wide events and system health:**
- AI time balance changes and daily bonus grants
- Rate limiting events and queue processing  
- Authentication failures and security events
- Background job execution results

**Example Events:**
- `daily_bonus_granted` - Daily bonus allocated to user
- `ai_time_consumed` - AI time usage with balance changes
- `rate_limit_hit` - Rate limit reached with queue status
- `log_cleanup_complete` - Automated log retention completed

#### Build Logs (`tier=build`)
**Claude CLI process tracking:**
- Build stdout/stderr streams with sequence numbers
- Build start/completion metadata and performance metrics
- Error conditions and exit codes

#### Deploy Logs (`tier=deploy`)
**Deployment workflows:**
- Cloudflare/Vercel deployment start/completion
- DNS propagation and domain mapping results
- Provider-specific deployment outputs

#### Action Logs (`tier=action`)
**User actions and API interactions:**
- Project creation and configuration changes
- Billing operations and balance queries
- Integration modifications and team management

#### Lifecycle Logs (`tier=lifecycle`)
**High-level system milestones:**
- Server startup/shutdown events
- Component initialization and health checks
- System status changes

### 📊 React Components for Unified Logs

#### Multi-Tier Log Viewer
```typescript
interface UnifiedLogViewerProps {
  adminJwt: string;
  tier?: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle';
  startDate?: string;
  endDate?: string;
  limit?: number;
  realTime?: boolean;
}

const UnifiedLogViewer: React.FC<UnifiedLogViewerProps> = ({
  adminJwt,
  tier = 'build',
  startDate,
  endDate,
  limit = 1000,
  realTime = false
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({
      tier,
      // format defaults to 'ndjson' for consistency
      limit: limit.toString(),
      ...(startDate && { startDate }),
      ...(endDate && { endDate })
    });

    try {
      const response = await fetch(`/admin/unified-logs/stream?${params}`, {
        headers: { 'Authorization': `Bearer ${adminJwt}` }
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const newLogs: string[] = [];

      while (true) {
        const { value, done } = await reader!.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            newLogs.push(line);
          }
        }
      }

      setLogs(realTime ? prev => [...prev, ...newLogs] : newLogs);
    } catch (error) {
      console.error('Failed to fetch unified logs:', error);
    } finally {
      setLoading(false);
    }
  }, [adminJwt, tier, startDate, endDate, limit, realTime]);

  useEffect(() => {
    fetchLogs();
    
    if (realTime) {
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchLogs, realTime]);

  return (
    <div className="unified-log-viewer">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          {tier.toUpperCase()} Logs 
          {realTime && <span className="ml-2 text-red-500">● LIVE</span>}
        </h3>
        
        <select 
          value={tier} 
          onChange={e => setTier(e.target.value)}
          className="border rounded px-3 py-1"
        >
          <option value="system">System</option>
          <option value="build">Build</option>
          <option value="deploy">Deploy</option>
          <option value="action">Action</option>
          <option value="lifecycle">Lifecycle</option>
        </select>
      </div>
      
      <div className="border rounded bg-black text-green-400 p-4 max-h-96 overflow-y-auto font-mono text-sm">
        {loading ? (
          <div className="text-center text-gray-400">Loading {tier} logs...</div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={getLogLineStyle(line)}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Helper function for log line styling
const getLogLineStyle = (line: string): string => {
  if (line.includes(' ERROR ')) return 'text-red-400';
  if (line.includes(' WARN ')) return 'text-yellow-400';
  if (line.includes(' INFO ')) return 'text-blue-400';
  if (line.includes(' DEBUG ')) return 'text-gray-400';
  return 'text-green-400';
};
```

### 🔄 Migration from Legacy Build Logs

**Legacy Approach (Deprecated):**
```typescript
// ⚠️ Old way - deprecated
const buildLogs = await fetch(`/v1/admin/builds/${buildId}/logs`, {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});
```

**New Approach (Recommended):**
```typescript
// ✅ New way - unified logs with enhanced filtering (NDJSON by default)
const buildLogs = await fetch('/admin/unified-logs/stream?tier=build&limit=5000', {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});
```

**Migration Benefits:**
1. **Multi-tier access**: View system, deploy, action, and lifecycle logs
2. **Better performance**: Segment-based streaming with configurable limits
3. **Enhanced filtering**: Time ranges, instance filtering, tier-specific queries
4. **Structured data**: Consistent NDJSON format across all tiers
5. **Future-proof**: Built for R2 integration and real-time streaming

---

## 🔍 **Admin Build Logs API** (DEPRECATED - September 13, 2025)

> ⚠️ **DEPRECATED**: This API is deprecated in favor of the **Unified Multi-Tier Logs API** above.
> 
> **Migration Guide**: Use `/admin/unified-logs/stream?tier=build` instead of build-specific endpoints.
> 
> These endpoints will be removed in a future release.

**Status**: ⚠️ Deprecated  
**Features**: Per-build Claude agent logs, streaming access, security redaction  
**Authentication**: Admin JWT with `read_logs` permission

### Overview

Admin-only access to per-build Claude agent logs for debugging and troubleshooting. Provides streaming log access, build metadata, and comprehensive build listing with automatic security redaction.

### 🔐 Authentication

All endpoints require admin JWT authentication:

```typescript
const headers = {
  'Authorization': `Bearer ${adminJwt}`,
  'Content-Type': 'application/json'
};
```

**Required Permission**: `read_logs`

### API Endpoints

#### **1. GET /v1/admin/builds/{buildId}/logs** - Stream Build Logs

Stream Claude agent logs with optional range support for tailing functionality.

**Parameters:**
- `buildId` (path, required): Build identifier (ULID format)
- `bytes` (query, optional): Range for partial content (e.g., "-1024" for last 1KB)

**Headers:**
- `Range`: Alternative to `bytes` parameter (e.g., "bytes=-1024")

**Response Format**: `application/x-ndjson; charset=utf-8`

**Response Status:**
- `200`: Full log file
- `206`: Partial content (with Range)
- `404`: Build not found or no access
- `403`: Insufficient permissions

**NDJSON Format:**
```typescript
// Metadata records
{ kind: "meta", buildId: string, userId: string, projectId: string, startedAt: string, version: string }
{ kind: "meta", buildId: string, endedAt: string }

// Log line records  
{ kind: "line", ts: number, seq: number, src: "stdout"|"stderr", buildId: string, msg: string }
```

**Frontend Integration Example:**
```typescript
const streamBuildLogs = async (buildId: string, tail = false) => {
  const url = `/v1/admin/builds/${buildId}/logs${tail ? '?bytes=-5120' : ''}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${adminJwt}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.status}`);
  }

  // Process NDJSON stream
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader!.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line
    
    for (const line of lines) {
      if (line.trim()) {
        const logEntry = JSON.parse(line);
        if (logEntry.kind === 'line') {
          console.log(`[${logEntry.src}] ${logEntry.msg}`);
        }
      }
    }
  }
};
```

#### **2. GET /v1/admin/builds/{buildId}/info** - Get Build Metadata

Retrieve comprehensive build information including log status and metrics.

**Parameters:**
- `buildId` (path, required): Build identifier (ULID format)

**Response:**
```typescript
interface BuildInfo {
  buildId: string;
  projectId: string;
  userId: string;
  userEmail?: string;
  status: string;                    // "building" | "completed" | "failed"
  createdAt: string;
  updatedAt: string;
  buildDurationMs?: number;
  totalLinesProcessed?: number;
  claudeRequests?: number;
  memoryPeakMb?: number;
  errorMessage?: string;
  logExists: boolean;               // Whether log file is available
  logSizeBytes: number;             // Size of log file in bytes
  correlation_id: string;
}
```

**Frontend Usage:**
```typescript
const getBuildInfo = async (buildId: string) => {
  const response = await fetch(`/v1/admin/builds/${buildId}/info`, {
    headers: { 'Authorization': `Bearer ${adminJwt}` }
  });

  if (!response.ok) {
    throw new Error(`Build not found: ${response.status}`);
  }

  const buildInfo: BuildInfo = await response.json();
  
  return {
    ...buildInfo,
    logSizeKB: Math.round(buildInfo.logSizeBytes / 1024),
    duration: buildInfo.buildDurationMs ? `${Math.round(buildInfo.buildDurationMs / 1000)}s` : 'N/A'
  };
};
```

#### **3. GET /v1/admin/builds** - List Recent Builds

List recent builds with filtering options and log availability status.

**Query Parameters:**
- `limit` (optional): Number of builds to return (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by build status ("building", "completed", "failed")
- `userId` (optional): Filter by user UUID
- `projectId` (optional): Filter by project UUID

**Response:**
```typescript
interface BuildsList {
  builds: Array<{
    build_id: string;
    project_id: string;
    user_id: string;
    user_email?: string;
    status: string;
    created_at: string;
    updated_at: string;
    build_duration_ms?: number;
    error_message?: string;
    logExists: boolean;             // Whether logs are available
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  correlation_id: string;
}
```

**Frontend Usage:**
```typescript
const listBuilds = async (filters: {
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
} = {}) => {
  const params = new URLSearchParams({
    limit: (filters.limit || 25).toString(),
    offset: (filters.offset || 0).toString(),
    ...(filters.status && { status: filters.status }),
    ...(filters.userId && { userId: filters.userId })
  });

  const response = await fetch(`/v1/admin/builds?${params}`, {
    headers: { 'Authorization': `Bearer ${adminJwt}` }
  });

  return response.json() as Promise<BuildsList>;
};

// Usage examples
const failedBuilds = await listBuilds({ status: 'failed', limit: 20 });
const userBuilds = await listBuilds({ userId: 'user-uuid-here' });
```

### 🛡️ Security Features

#### **Automatic Redaction**
All log content is automatically redacted for security:
- **Bearer tokens**: `Bearer [REDACTED]`
- **API keys**: `sk-[REDACTED]`, `api_key=[REDACTED]`
- **AWS credentials**: `AWS_SECRET_ACCESS_KEY=[REDACTED]`
- **PEM blocks**: Multi-line private key redaction
- **Authorization headers**: `authorization: [REDACTED]`
- **DoS protection**: Lines >256KB truncated with `[TRUNCATED]`

#### **Access Control**
- **Admin authentication**: Requires valid admin JWT with `read_logs` permission
- **Server-side validation**: Build ownership verified via `project_build_metrics` table
- **Audit logging**: All access logged with admin ID and correlation IDs
- **Path protection**: ULID validation prevents directory traversal attacks

### 📊 Frontend Component Examples

#### **Log Viewer Component**
```typescript
interface LogViewerProps {
  buildId: string;
  adminJwt: string;
  tailMode?: boolean;
}

const LogViewer: React.FC<LogViewerProps> = ({ buildId, adminJwt, tailMode }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        await streamBuildLogs(buildId, tailMode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load logs');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [buildId, tailMode]);

  if (loading) return <div>Loading logs...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="log-viewer font-mono text-sm">
      {logs.map((entry, i) => (
        <div key={i} className={`log-line ${entry.src === 'stderr' ? 'text-red-600' : ''}`}>
          <span className="text-gray-500 text-xs">
            {new Date(entry.ts).toISOString().slice(11, 23)}
          </span>
          <span className="ml-2 text-blue-600">[{entry.src}]</span>
          <span className="ml-2">{entry.msg}</span>
        </div>
      ))}
    </div>
  );
};
```

#### **Build List Component**
```typescript
const BuildsList: React.FC<{ adminJwt: string }> = ({ adminJwt }) => {
  const [builds, setBuilds] = useState<BuildsList | null>(null);
  const [filters, setFilters] = useState({ status: '', limit: 25, offset: 0 });

  useEffect(() => {
    listBuilds(filters).then(setBuilds);
  }, [filters]);

  const getStatusIcon = (status: string, logExists: boolean) => {
    if (status === 'building') return '🔄';
    if (status === 'failed' && logExists) return '❌📄';
    if (status === 'completed' && logExists) return '✅📄';
    return logExists ? '📄' : '🚫';
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex gap-4">
        <select 
          value={filters.status} 
          onChange={(e) => setFilters({...filters, status: e.target.value, offset: 0})}
        >
          <option value="">All Status</option>
          <option value="building">Building</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Build Table */}
      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Build ID</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">User</th>
            <th className="border p-2">Created</th>
            <th className="border p-2">Duration</th>
            <th className="border p-2">Logs</th>
          </tr>
        </thead>
        <tbody>
          {builds?.builds.map(build => (
            <tr key={build.build_id}>
              <td className="border p-2 font-mono text-xs">
                {build.build_id.slice(0, 8)}...
              </td>
              <td className="border p-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  build.status === 'completed' ? 'bg-green-100 text-green-800' :
                  build.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {build.status}
                </span>
              </td>
              <td className="border p-2">{build.user_email}</td>
              <td className="border p-2">
                {new Date(build.created_at).toLocaleDateString()}
              </td>
              <td className="border p-2">
                {build.build_duration_ms ? `${Math.round(build.build_duration_ms / 1000)}s` : '-'}
              </td>
              <td className="border p-2">
                {build.logExists ? (
                  <a 
                    href={`/admin/builds/${build.build_id}/logs`}
                    className="text-blue-600 hover:underline"
                  >
                    {getStatusIcon(build.status, build.logExists)} View Logs
                  </a>
                ) : (
                  <span className="text-gray-400">No logs</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {builds && builds.pagination.total > builds.pagination.limit && (
        <div className="mt-4 flex justify-between items-center">
          <button 
            disabled={filters.offset === 0}
            onClick={() => setFilters({...filters, offset: Math.max(0, filters.offset - filters.limit)})}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            Previous
          </button>
          
          <span>
            Showing {filters.offset + 1}-{Math.min(filters.offset + filters.limit, builds.pagination.total)} of {builds.pagination.total}
          </span>
          
          <button 
            disabled={filters.offset + filters.limit >= builds.pagination.total}
            onClick={() => setFilters({...filters, offset: filters.offset + filters.limit})}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
```

### 📈 Real-time Updates

For active builds (`status: 'building'`), implement polling to get real-time log updates:

```typescript
const useRealTimeLogs = (buildId: string, isActive: boolean) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  useEffect(() => {
    if (!isActive) return;
    
    const pollInterval = setInterval(async () => {
      try {
        // Fetch only recent logs (last 1KB)
        const newLogs = await streamBuildLogs(buildId, true);
        setLogs(prevLogs => [...prevLogs, ...newLogs]);
      } catch (error) {
        console.error('Failed to fetch real-time logs:', error);
      }
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(pollInterval);
  }, [buildId, isActive]);
  
  return logs;
};
```

### 🗂️ Log Storage Architecture

**Directory Structure:**
```
./logs/builds/
├── 2025-09-13/
│   ├── 01HZ8X9J2K3L4M5N6P7Q8R9S0T.log
│   └── 01HZ8X9J2K3L4M5N6P7Q8R9S0U.log
└── 2025-09-14/
    └── ...
```

**File Format:**
- **Format**: JSONL (newline-delimited JSON)
- **Size**: Typically 5-50KB per build
- **Permissions**: 0640 (owner read/write, group read)
- **Encoding**: UTF-8 with invalid byte replacement

---

## 🐙 **GitHub 2-Way Sync Integration** (NEW - January 26, 2025)

**Status**: ✅ Production Ready
**Features**: Bidirectional sync, conflict resolution, multiple sync modes
**Security**: GitHub App authentication, HMAC webhook validation

### Overview

The GitHub 2-way sync system enables real-time bidirectional synchronization between SheenApps projects and GitHub repositories. Features include:

- **Real-time sync**: Webhook-driven updates from GitHub + manual/automatic pushes to GitHub
- **Conflict resolution**: Smart handling with multiple strategies (GitHub wins, Local wins, Manual review, Auto-merge)
- **Configurable modes**: `protected_pr` (default), `hybrid`, `direct_commit` (Lovable-style)
- **Enterprise security**: GitHub App authentication, enhanced SHA tracking, branch protection awareness

### Authentication

All GitHub integration endpoints require standard HMAC authentication. The system uses GitHub App installation tokens with 1-hour expiry and automatic refresh.

### Repository Discovery Endpoints

#### 1. List GitHub App Installations

**Endpoint**: `GET /v1/github/installations`

**Description**: List GitHub App installations accessible to the user. Currently returns guidance for manual installation ID retrieval.

**Headers**: Standard HMAC headers

**Response**:
```typescript
{
  error: "Installation discovery requires user OAuth integration",
  error_code: "INSUFFICIENT_PERMISSIONS",
  recovery_url: "https://github.com/apps/your-app/installations/select_target",
  details: {
    message: "Users must install the GitHub App and provide the installation ID",
    documentation: "Use the GitHub App installation URL to guide users"
  }
}
```

**Status**: `501 Not Implemented` - Future OAuth integration planned

#### 2. List Repositories for Installation

**Endpoint**: `GET /v1/github/installations/:installationId/repos`

**Description**: Retrieve repositories accessible through a specific GitHub App installation.

**Headers**: Standard HMAC headers

**Query Parameters**:
```typescript
{
  query?: string;     // Optional search term
  page?: string;      // Page number (default: 1)
  per_page?: string;  // Items per page (default: 30, max: 100)
}
```

**Response**:
```typescript
{
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    private: boolean;
    default_branch: string;
    archived: boolean;
    disabled: boolean;
    language: string | null;
    updated_at: string;
    html_url: string;
  }>,
  total_count: number;
  page: number;
  per_page: number;
}
```

**Error Codes**:
- `INVALID_INSTALLATION`: Installation not found or inaccessible
- `INSUFFICIENT_PERMISSIONS`: App lacks permission for installation
- `RATE_LIMIT`: GitHub API rate limit exceeded

### Core Integration Endpoints

#### 1. Link Project to GitHub Repository

**Endpoint**: `POST /v1/projects/:projectId/github/link`

**Description**: Connect a SheenApps project to a GitHub repository for bidirectional sync.

**Headers**: Standard HMAC headers

**Body**:
```typescript
{
  repoOwner: string;        // GitHub username or organization
  repoName: string;         // Repository name
  installationId: string;   // GitHub App installation ID
  branch?: string;          // Branch to sync (auto-detected if omitted)
  syncMode?: 'protected_pr' | 'hybrid' | 'direct_commit';
  webhookSecret?: string;   // Optional override for webhook secret
}
```

**Response**:
```typescript
{
  success: true,
  message: "GitHub repository linked successfully",
  repository: {
    owner: "myorg",
    name: "myrepo",
    branch: "main",          // Actual default branch from GitHub
    protected: false         // Branch protection status
  },
  syncMode: "protected_pr",
  webhookUrl: "https://api.sheenapps.com/v1/webhooks/github/project123"
}
```

#### 2. Get GitHub Sync Status

**Endpoint**: `GET /v1/projects/:projectId/github/status`

**Description**: Get current sync status and recent operations for a project.

**Headers**: Standard HMAC headers

**Response**:
```typescript
{
  enabled: boolean;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  syncMode?: 'protected_pr' | 'hybrid' | 'direct_commit';
  lastSync?: string;           // ISO timestamp
  lastRemoteSha?: string;      // Latest GitHub commit SHA
  lastLocalSha?: string;       // Latest synced local SHA
  pendingOperations?: number;  // Count of queued operations
  recentOperations?: Array<{
    id: string;
    type: string;              // 'push_to_github', 'pull_from_github', etc.
    status: string;            // 'pending', 'processing', 'success', 'failed'
    createdAt: string;
    completedAt?: string;
    error?: string;
  }>;
}
```

#### 3. Trigger Manual Sync

**Endpoint**: `POST /v1/projects/:projectId/github/sync/trigger`

**Description**: Manually trigger sync operations in one or both directions.

**Headers**: Standard HMAC headers

**Body**:
```typescript
{
  direction: 'to_github' | 'from_github' | 'both';
  versionId?: string;  // Required for 'to_github' direction
  force?: boolean;     // Force sync even if conflicts detected
}
```

**Response**:
```typescript
{
  success: true,
  message: "GitHub sync operations queued",
  operations: [
    {
      direction: "to_github",
      jobId: "github-push-project123-version456",
      type: "push",
      versionId: "version456"
    }
  ],
  repository: "myorg/myrepo"
}
```

#### 4. Resolve Sync Conflicts

**Endpoint**: `POST /v1/projects/:projectId/github/sync/resolve-conflict`

**Description**: Resolve conflicts when simultaneous changes occur on GitHub and SheenApps.

**Headers**: Standard HMAC headers

**Body**:
```typescript
{
  strategy: 'github_wins' | 'local_wins' | 'manual_review' | 'auto_merge';
  localCommitSha: string;   // Local commit SHA
  remoteCommitSha: string;  // GitHub commit SHA
}
```

**Response**:
```typescript
{
  success: true,
  strategy: "github_wins",
  message: "Conflict resolved successfully",
  result: {
    commitSha: "abc123...",
    prUrl?: "https://github.com/owner/repo/pull/123",  // If PR created
    filesResolved: 5,
    manualReviewRequired: false
  },
  warnings: ["Local changes were overwritten with GitHub version"]
}
```

#### 5. Unlink GitHub Repository

**Endpoint**: `DELETE /v1/projects/:projectId/github/unlink`

**Description**: Disconnect project from GitHub and disable sync.

**Headers**: Standard HMAC headers

**Response**:
```typescript
{
  success: true,
  message: "GitHub repository unlinked successfully",
  projectId: "project123"
}
```

### Webhook Integration

#### GitHub Webhook Handler

**Endpoint**: `POST /v1/webhooks/github/:projectId`

**Description**: Receives GitHub webhook events for real-time sync. Automatically configured when linking repository.

**Headers**:
- `x-github-delivery`: Unique delivery ID for deduplication
- `x-hub-signature-256`: GitHub HMAC signature
- `x-github-event`: Event type (push, ping, etc.)

**Features**:
- Signature verification using `X-Hub-Signature-256`
- Redis-based deduplication with 7-day TTL
- 202 responses within 10 seconds (GitHub requirement)
- Async processing via BullMQ
- Ping event handling

#### Webhook Health Check

**Endpoint**: `GET /v1/webhooks/github/health`

**Response**:
```typescript
{
  status: "healthy",
  webhookEnabled: true,
  githubAppConfigured: true,
  timestamp: "2025-01-26T10:30:00Z"
}
```

### Admin & Monitoring Endpoints

#### 1. Get Sync Operations History

**Endpoint**: `GET /v1/admin/github/sync-operations`

**Query Parameters**:
- `projectId?: string` - Filter by project
- `status?: string` - Filter by status
- `limit?: number` - Results per page (default: 50)
- `offset?: number` - Pagination offset

**Response**:
```typescript
{
  operations: [
    {
      id: "sync-123",
      project_id: "project123",
      operation_type: "push",
      status: "success",
      direction: "to_github",
      github_commit_sha: "abc123...",
      local_version_id: "version456",
      files_changed: 5,
      insertions: 23,
      deletions: 7,
      created_at: "2025-01-26T10:30:00Z",
      completed_at: "2025-01-26T10:30:15Z"
    }
  ],
  pagination: {
    total: 150,
    limit: 50,
    offset: 0,
    hasMore: true
  }
}
```

#### 2. GitHub Sync System Status

**Endpoint**: `GET /v1/admin/github/sync-status`

**Response**:
```typescript
{
  status: "healthy",
  githubAppConfigured: true,
  webhookSecretConfigured: true,
  stats: {
    projects: {
      total_projects: 50,
      enabled_projects: 25,
      recently_synced: 12
    },
    operations: {
      success: 145,
      failed: 5,
      pending: 2
    }
  },
  timestamp: "2025-01-26T10:30:00Z"
}
```

### Sync Modes Explained

#### 1. Protected PR Mode (Default)
- **Behavior**: All changes create pull requests for manual review
- **Use case**: Teams prioritizing safety and code review
- **Branch protection**: Respects all branch protection rules

#### 2. Hybrid Mode
- **Behavior**: Smart switching - direct commits when safe, PRs when conflicts
- **Use case**: Balanced approach for most teams
- **Logic**: Fast-forward commits go direct, conflicts create PRs

#### 3. Direct Commit Mode
- **Behavior**: Lovable-style real-time sync directly to main branch
- **Use case**: Individual developers wanting instant sync
- **Caution**: Can force-push if "GitHub wins" policy configured

### Error Handling

All GitHub endpoints return standardized error responses with machine-readable error codes for frontend handling.

**Standard Error Format**:
```typescript
{
  error: string;           // Human-readable error message
  error_code: string;      // Machine-readable error code
  recovery_url?: string;   // Optional recovery action URL
  details?: any;           // Additional error context
}
```

**Standardized Error Codes**:
- `APP_NOT_INSTALLED` - GitHub App not installed on repository
- `BRANCH_PROTECTED` - Cannot push to protected branch (auto-switches to PR mode)
- `NOT_FAST_FORWARD` - Remote has changes, needs pull before push
- `REPO_ARCHIVED` - Repository is archived and read-only
- `FILE_TOO_LARGE` - File exceeds GitHub's 100MiB limit
- `APP_UNINSTALLED` - GitHub App was uninstalled after linking
- `RATE_LIMIT` - GitHub API rate limit exceeded (auto-retries)
- `INVALID_INSTALLATION` - Installation ID not found or inaccessible
- `INSUFFICIENT_PERMISSIONS` - App lacks required permissions

**Error Response Examples**:

Repository not found:
```typescript
{
  error: "GitHub installation or repository not found",
  error_code: "APP_NOT_INSTALLED",
  recovery_url: "https://github.com/apps/your-app/installations/select_target"
}
```

Rate limit exceeded:
```typescript
{
  error: "GitHub API rate limit exceeded",
  error_code: "RATE_LIMIT",
  details: {
    reset_time: "2025-01-26T11:00:00Z",
    retry_after: 3600
  }
}
```

Branch protection conflict:
```typescript
{
  error: "Cannot push to protected branch",
  error_code: "BRANCH_PROTECTED",
  details: {
    branch: "main",
    created_pr_url: "https://github.com/org/repo/pull/42"
  }
}
```

### Integration Examples

#### Setup Flow
```typescript
// 1. Link repository
const linkResponse = await fetch(`/v1/projects/${projectId}/github/link`, {
  method: 'POST',
  headers: { ...hmacHeaders },
  body: JSON.stringify({
    repoOwner: 'myorg',
    repoName: 'myrepo',
    installationId: '12345',
    syncMode: 'hybrid'
  })
});

// 2. Configure webhook URL in GitHub App settings
console.log('Webhook URL:', linkResponse.webhookUrl);

// 3. Test with manual sync
await fetch(`/v1/projects/${projectId}/github/sync/trigger`, {
  method: 'POST',
  headers: { ...hmacHeaders },
  body: JSON.stringify({
    direction: 'both',
    versionId: 'current-version-id'
  })
});
```

#### Status Monitoring
```typescript
// Check sync status
const status = await fetch(`/v1/projects/${projectId}/github/status`, {
  headers: { ...hmacHeaders }
});

// Handle conflicts
if (status.pendingOperations > 0) {
  // Check for failed operations that need conflict resolution
  const operations = status.recentOperations.filter(op =>
    op.status === 'failed' && op.error?.includes('conflict')
  );
}
```

### Performance & Limits

- **Webhook processing**: < 10 second response time (GitHub requirement)
- **Sync operations**: Typically complete within 30 seconds
- **File limits**: Warnings at 50MiB, blocks at 100MiB per file
- **Rate limiting**: Handled automatically with exponential backoff
- **Concurrency**: 2 sync operations per project maximum

### Security Features

- **GitHub App permissions**: Minimal required scopes (contents, PRs, metadata)
- **Token security**: 1-hour expiry with automatic refresh
- **Webhook validation**: HMAC signature verification with timing-safe comparison
- **Audit logging**: All operations logged with correlation IDs
- **Branch protection**: Automatic detection and respect for GitHub rules

### Real-time SSE Events (NEW)

The GitHub sync system now emits GitHub-specific SSE events for real-time frontend updates:

#### SSE Event Types

**Event Name**: `github_sync_started`
```typescript
{
  operationId: string;         // Use for event filtering
  projectId: string;
  direction: 'to_github' | 'from_github';
  syncMode: 'protected_pr' | 'hybrid' | 'direct_commit';
  timestamp: string;           // ISO format
}
```

**Event Name**: `github_sync_progress` (Throttled: +5% or max 1/sec)
```typescript
{
  operationId: string;
  projectId: string;
  message: string;             // "Creating GitHub tree...", "Pushing changes..."
  percent: number;             // 0-100
  timestamp: string;
}
```

**Event Name**: `github_sync_conflict`
```typescript
{
  operationId: string;
  projectId: string;
  conflicts: string[];         // Array of conflicting file paths
  strategy: 'github_wins' | 'local_wins' | 'manual_review';
  resolutionRequired: boolean;
  timestamp: string;
}
```

**Event Name**: `github_sync_completed`
```typescript
{
  operationId: string;
  projectId: string;
  status: 'success';
  direction: 'to_github' | 'from_github';
  filesChanged: number;
  commitSha?: string;          // GitHub commit SHA
  prUrl?: string;              // If PR was created
  branchName?: string;         // If branch was created
  duration: number;            // Operation duration in ms
  timestamp: string;
}
```

**Event Name**: `github_sync_failed`
```typescript
{
  operationId: string;
  projectId: string;
  status: 'failed';
  error_code: 'APP_NOT_INSTALLED' | 'RATE_LIMIT' | 'BRANCH_PROTECTED' | /* other codes */;
  message: string;
  retryable: boolean;          // Whether operation can be retried
  retryAfter?: number;         // Seconds until retry (for rate limits)
  recovery_url?: string;       // Action URL for user
  timestamp: string;
}
```

#### SSE Integration Pattern

1. **Trigger Sync and Get Operation ID**:
```typescript
const response = await fetch(`/v1/projects/${projectId}/github/sync/trigger`, {
  method: 'POST',
  headers: { ...hmacHeaders },
  body: JSON.stringify({ direction: 'both', versionId: 'ver_123' })
});

const data = await response.json();
const operationId = data.operations[0].operationId;
```

2. **Connect to SSE Stream**:
```typescript
const eventSource = new EventSource(`/api/projects/${projectId}/stream`);

// Filter events by operationId
eventSource.addEventListener('github_sync_progress', (event) => {
  const eventData = JSON.parse(event.data).data;
  if (eventData.operationId === operationId) {
    updateProgressBar(eventData.percent, eventData.message);
  }
});

eventSource.addEventListener('github_sync_completed', (event) => {
  const eventData = JSON.parse(event.data).data;
  if (eventData.operationId === operationId) {
    showSuccess('Sync completed!', eventData.prUrl);
    eventSource.close();
  }
});

eventSource.addEventListener('github_sync_failed', (event) => {
  const eventData = JSON.parse(event.data).data;
  if (eventData.operationId === operationId) {
    showError(eventData.message, eventData.recovery_url);
    eventSource.close();
  }
});
```

#### SSE Features

- **Progress Throttling**: Prevents SSE spam with +5% delta detection or max 1 event/second
- **Terminal Event Guarantee**: Always emits either `github_sync_completed` or `github_sync_failed`
- **Operation Filtering**: Use `operationId` to track specific operations in multi-operation scenarios
- **Error Recovery**: Standardized error codes with actionable recovery URLs
- **Memory Management**: Automatic throttle state cleanup on operation completion

This GitHub integration provides enterprise-grade bidirectional sync capabilities with real-time SSE feedback while maintaining the security and reliability standards of the SheenApps platform.

## 💼 Career Portal API (September 2025)

### Overview
A modern career portal system with multilingual support (Arabic-first), trigram search, and comprehensive admin management.

### Public Endpoints

#### 1. List Job Postings
`GET /api/careers/jobs`

**Query Parameters:**
- `search`: Text search using PostgreSQL trigram matching
- `department`: Filter by department
- `location`: Filter by location (searches both ar/en)
- `employment_type`: `full_time`, `part_time`, `contract`, `internship`
- `experience_level`: `entry`, `mid`, `senior`, `executive`
- `is_remote`: Boolean - filter remote-friendly jobs
- `limit`: Number (default: 20, max: 100)
- `offset`: Number (default: 0)

**Headers:**
- `x-sheen-locale`: `ar` or `en` (defaults to `ar`)

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "slug": "senior-backend-engineer",
      "title": "Senior Backend Engineer",
      "description": "<p>HTML content...</p>",
      "location": "Cairo, Egypt",
      "department": "Engineering",
      "employment_type": "full_time",
      "experience_level": "senior",
      "salary": {
        "min": 15000,
        "max": 25000,
        "currency": "EGP",
        "period": "monthly"
      },
      "posted_at": "2025-12-01T10:00:00Z",
      "application_deadline": "2025-12-31T23:59:59Z",
      "is_remote": true,
      "is_featured": true
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

#### 2. Get Job Details
`GET /api/careers/jobs/:slug`

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "slug": "senior-backend-engineer",
    "title": "Senior Backend Engineer",
    "description": "<p>Full HTML description...</p>",
    "requirements": "<ul><li>5+ years experience...</li></ul>",
    "benefits": "<ul><li>Health insurance...</li></ul>",
    "location": "Cairo, Egypt",
    "department": "Engineering",
    "employment_type": "full_time",
    "experience_level": "senior",
    "salary": {
      "min": 15000,
      "max": 25000,
      "currency": "EGP",
      "period": "monthly"
    },
    "posted_at": "2025-12-01T10:00:00Z",
    "application_deadline": "2025-12-31T23:59:59Z",
    "is_remote": true,
    "is_featured": true,
    "view_count": 234,
    "application_count": 12
  },
  "jsonLd": {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Senior Backend Engineer",
    "description": "...",
    "datePosted": "2025-12-01",
    "validThrough": "2025-12-31",
    "employmentType": "FULL_TIME",
    "hiringOrganization": {
      "@type": "Organization",
      "name": "SheenApps"
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Cairo, Egypt"
      }
    }
  }
}
```

#### 3. Submit Job Application
`POST /api/careers/jobs/:id/apply`

**Request Body:**
```json
{
  "full_name": "Ahmed Hassan",
  "email": "ahmed@example.com",
  "phone": "+201234567890",
  "cover_letter": "I am interested in this position because...",
  "linkedin_url": "https://linkedin.com/in/ahmed-hassan",
  "portfolio_url": "https://ahmed-portfolio.com",
  "years_of_experience": 5,
  "resume_file": "data:application/pdf;base64,JVBERi0xLjQKJcfs...",
  "captcha_token": "recaptcha-token-here"
}
```

**Important Notes:**
- Resume file must be base64 encoded (PDF, DOC, DOCX only, max 5MB)
- CAPTCHA token is required (use reCAPTCHA/hCaptcha)
- Rate limited to 5 applications per hour per IP per job

**Response:**
```json
{
  "success": true,
  "application_id": "app_uuid",
  "message": "Application submitted successfully"
}
```

**Error Responses:**
- `400`: Validation error
- `404`: Job not found or no longer accepting applications
- `409`: Duplicate application
- `422`: CAPTCHA verification failed
- `429`: Rate limit exceeded

#### 4. List Departments
`GET /api/careers/departments`

**Response:**
```json
{
  "success": true,
  "departments": [
    {
      "department": "Engineering",
      "job_count": 12
    },
    {
      "department": "Marketing",
      "job_count": 5
    }
  ]
}
```

#### 5. Get Sitemap Data
`GET /api/careers/sitemap`

**Response:**
```json
{
  "success": true,
  "urls": [
    {
      "loc": "https://sheenapps.com/careers",
      "lastmod": "2025-12-07",
      "changefreq": "daily",
      "priority": 1.0
    },
    {
      "loc": "https://sheenapps.com/careers/senior-backend-engineer",
      "lastmod": "2025-12-01",
      "changefreq": "weekly",
      "priority": 0.8
    }
  ]
}
```

### Key Features

#### Multilingual Support
- **Arabic-first approach**: All content requires Arabic, English is optional
- **Locale normalization**: All `ar-*` variants treated as `ar`
- **Header**: Use `x-sheen-locale` (not `x-locale`)
- **Fallback chain**: Requested locale → Arabic → English

#### Search & Performance
- **Trigram search**: PostgreSQL pg_trgm for fuzzy text matching
- **Generated search column**: Pre-computed for performance
- **Optimized indexes**: For featured, remote, department filters
- **View tracking**: Asynchronous increment to avoid blocking

#### Security
- **HTML sanitization**: Strict whitelist (p, ul/ol/li, a, b/strong, i/em, h1-h4, br)
- **CAPTCHA required**: All applications need token verification
- **Rate limiting**: 5 applications/hour/IP/job
- **File validation**: PDF/DOC/DOCX only, max 5MB
- **Duplicate prevention**: One application per email per job

#### File Storage
- **R2 path structure**: `career/resumes/{yyyy}/{mm}/{uuid}-{slugified-filename}.ext`
- **Signed URLs**: Secure access to uploaded resumes
- **Retention**: Standard retention policy

### Integration Example

```typescript
// Job listing with search
const searchJobs = async (query: string, filters: any) => {
  const params = new URLSearchParams({
    search: query,
    ...filters,
    limit: '20',
    offset: '0'
  });

  const response = await fetch(`/api/careers/jobs?${params}`, {
    headers: {
      'x-sheen-locale': currentLocale // 'ar' or 'en'
    }
  });

  return response.json();
};

// Submit application with file upload
const submitApplication = async (jobId: string, formData: any, file: File) => {
  // Convert file to base64
  const reader = new FileReader();
  const base64File = await new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  const response = await fetch(`/api/careers/jobs/${jobId}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-locale': currentLocale
    },
    body: JSON.stringify({
      ...formData,
      resume_file: base64File,
      captcha_token: await grecaptcha.execute()
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Application failed');
  }

  return response.json();
};
```

### Migration & Setup

1. **Run migration**: `psql -d your_db -f migrations/081_career_portal_foundation.sql`
2. **Configure CAPTCHA**: Set `RECAPTCHA_SECRET` or `HCAPTCHA_SECRET` env var
3. **Enable R2**: Ensure Cloudflare R2 credentials are configured
4. **Set locale**: Frontend should send `x-sheen-locale` header

### Testing Checklist

- [ ] Arabic content displays when `x-sheen-locale: ar`
- [ ] English fallback works when English content missing
- [ ] Trigram search returns fuzzy matches
- [ ] Department/location filters work correctly
- [ ] Resume upload accepts PDF/DOC/DOCX under 5MB
- [ ] CAPTCHA blocks submissions without valid token
- [ ] Rate limiting prevents spam (5/hour/IP/job)
- [ ] Duplicate applications return 409 error
- [ ] SEO structured data included in job details

---

## 🚀 **Website Migration Tool API** (NEW - December 2025)

### AI-Powered Website Migration System

The Website Migration Tool enables users to migrate existing websites to modern Next.js 14 projects using AI-powered analysis and transformation. The system includes ownership verification, quality gates, and real-time progress tracking.

#### Core Features
- **AI-Driven Migration**: 4-agent system (Planner, Transformer, Critic, Executive) for comprehensive migrations
- **Ownership Verification**: DNS TXT records and file upload verification
- **Quality Gates**: Build validation, Lighthouse testing, accessibility compliance
- **Real-time Progress**: Server-Sent Events for live migration updates
- **Enterprise Support**: Bulk operations and organization-level analytics
- **Budget Controls**: AI time tracking and cost enforcement

#### Authentication
All migration endpoints use explicit userId parameters:
- **GET requests**: `userId` passed as query parameter
- **POST requests**: `userId` passed in request body

#### Migration Workflow
1. **Start Migration** → URL + user preferences
2. **Ownership Verification** → DNS or file validation
3. **Site Analysis** → Puppeteer crawling and technology detection
4. **AI Transformation** → Next.js 14 component generation
5. **Quality Gates** → Build, performance, and accessibility validation
6. **Project Delivery** → Complete Next.js 14 App Router + SSG + Tailwind project

### Core Migration Endpoints

#### **POST /api/migration/start**

Start a new website migration with AI-powered analysis.

**Headers:**
```http
Content-Type: application/json
Idempotency-Key: <uuid>  # Optional for duplicate prevention
```

**Request Body:**
```json
{
  "userId": "user_123",
  "sourceUrl": "https://example.com",
  "userBrief": {
    "goals": "modernize",
    "style_preferences": {
      "colors": ["#ff6b35", "#f7931e"],
      "typography": "minimal",
      "spacing": "normal",
      "motion": "subtle"
    },
    "framework_preferences": {
      "strict_url_preservation": true,
      "allow_route_consolidation": false,
      "prefer_ssg": true
    },
    "content_tone": "marketing",
    "risk_appetite": "balanced",
    "custom_instructions": "Keep the existing brand colors and make it mobile-friendly"
  }
}
```

**Response (201 Created):**
```json
{
  "migrationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "analyzing",
  "message": "Migration started successfully",
  "verificationRequired": true,
  "analysisStarted": true,
  "estimatedDuration": "10-15 minutes"
}
```

#### **GET /api/migration/:id/status**

Get current migration progress and status.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "id": "migration_123",
  "status": "processing",
  "progress": 65,
  "currentPhase": "TRANSFORM",
  "verificationStatus": "verified",
  "targetProjectId": "project_456",
  "createdAt": "2025-12-07T10:00:00Z",
  "updatedAt": "2025-12-07T10:15:00Z",
  "estimatedCompletion": "2025-12-07T10:20:00Z"
}
```

#### **POST /api/migration/:id/verify**

Submit ownership verification for the source website.

**Request Body:**
```json
{
  "userId": "user_123",
  "method": "dns",  // or "file"
  "token": "optional-file-token"
}
```

**Response (200 OK):**
```json
{
  "method": "dns",
  "token": "sheenapps-verify-abc123def456",
  "instructions": "Add TXT record: _sheenapps-verify.example.com → sheenapps-verify-abc123def456",
  "expiresAt": "2025-12-08T10:00:00Z",
  "verified": false
}
```

#### **GET /api/migration/:id/verify**

Check ownership verification status.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "verified": true,
  "method": "dns",
  "verifiedAt": "2025-12-07T10:05:00Z",
  "token": "sheenapps-verify-abc123def456",
  "expiresAt": "2025-12-08T10:00:00Z"
}
```

#### **POST /api/migration/:id/process**

Begin AI transformation process after verification.

**Headers:**
```http
Content-Type: application/json
Idempotency-Key: <uuid>  # Required for duplicate prevention
```

**Request Body:**
```json
{
  "userId": "user_123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Migration processing started",
  "jobId": "job_789",
  "estimatedDuration": 600
}
```

### Enhanced Migration Endpoints (Phase 2 & 3)

#### **GET /api/migration/:id/stream**

**NEW**: Real-time migration progress via Server-Sent Events.

**Query Parameters:**
```
?userId=<uuid>
```

**Headers:**
```http
Last-Event-ID: <string>  # Optional for resuming from specific event
```

**Response:** Server-Sent Events stream:
```
data: {
  "type": "migration_started",
  "migrationId": "migration_123",
  "status": "processing",
  "progress": 25,
  "message": "AI Planner analyzing website structure",
  "phase": "ANALYZE",
  "timestamp": 1701945600000
}

data: {
  "type": "phase_completed",
  "migrationId": "migration_123",
  "status": "processing",
  "progress": 50,
  "message": "Analysis complete, starting transformation",
  "phase": "TRANSFORM",
  "timestamp": 1701945900000
}
```

#### **POST /api/migration/:id/retry**

**NEW**: Retry a failed migration with enhanced options.

**Headers:**
```http
Content-Type: application/json
Idempotency-Key: <uuid>  # Required for duplicate prevention
```

**Request Body:**
```json
{
  "userId": "user_123",
  "retryOptions": {
    "retryReason": "user_request",
    "newUserBrief": {
      "goals": "modernize",
      "custom_instructions": "Make it more conservative this time"
    },
    "increasedBudget": {
      "softBudgetSeconds": 3600,
      "hardBudgetSeconds": 5400
    },
    "reuseSeeds": true
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "retryId": "retry_456",
  "message": "Migration retry initiated",
  "estimatedDuration": 900,
  "previousAttempts": 1
}
```

#### **GET /api/migration/:id/analytics**

**NEW**: Detailed analytics and metrics for a migration.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "metrics": {
    "totalDuration": 850000,
    "aiTimeConsumed": 1250,
    "phaseDurations": {
      "ANALYZE": 180000,
      "PLAN": 120000,
      "TRANSFORM": 450000,
      "VERIFY": 100000
    },
    "retryCount": 0,
    "verificationAttempts": 1
  },
  "performance": {
    "successRate": 95.2,
    "averageCompletionTime": 720000,
    "bottlenecks": ["Large asset optimization", "Complex component transformation"]
  },
  "costs": {
    "aiTimeUsed": 1250,
    "estimatedCost": 31.25,
    "breakdown": {
      "ANALYZE": 5.50,
      "PLAN": 4.25,
      "TRANSFORM": 18.75,
      "VERIFY": 2.75
    }
  }
}
```

#### **GET /api/migration/:id/billing**

**NEW**: Detailed AI time billing breakdown.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "totalAITime": 1250,
  "breakdown": [
    {
      "phase": "ANALYZE",
      "aiTimeSeconds": 220,
      "cost": 5.50,
      "startedAt": "2025-12-07T10:00:00Z",
      "completedAt": "2025-12-07T10:03:40Z",
      "efficiency": 92
    },
    {
      "phase": "TRANSFORM",
      "aiTimeSeconds": 750,
      "cost": 18.75,
      "startedAt": "2025-12-07T10:05:00Z",
      "completedAt": "2025-12-07T10:17:30Z",
      "efficiency": 88
    }
  ],
  "comparison": {
    "estimated": 1200,
    "actual": 1250,
    "variance": 4.2
  },
  "budget": {
    "softLimit": 1800,
    "hardLimit": 3600,
    "remaining": 2350,
    "exceeded": false
  }
}
```

### Enterprise Migration Endpoints (Phase 3)

#### **PUT /api/migration/org/:orgId/config**

**NEW**: Organization-level migration configuration.

**Request Body:**
```json
{
  "userId": "user_123",
  "config": {
    "customBudgets": {
      "softBudgetSeconds": 3600,
      "hardBudgetSeconds": 7200,
      "perPhaseCapSeconds": 1800,
      "monthlyAllowanceSeconds": 50000
    },
    "migrationLimits": {
      "concurrentMigrations": 10,
      "dailyMigrations": 50,
      "monthlyMigrations": 500
    },
    "advancedFeatures": {
      "bulkMigrations": true,
      "whiteGloveService": true,
      "customIntegrations": true,
      "advancedAnalytics": true
    }
  }
}
```

**Response (200 OK):**
```json
{
  "orgId": "org_123",
  "config": {
    "customBudgets": { "..." },
    "migrationLimits": { "..." },
    "advancedFeatures": { "..." }
  },
  "updatedAt": "2025-12-07T10:00:00Z"
}
```

#### **POST /api/migration/bulk/start**

**NEW**: Start bulk migration operations for enterprise customers.

**Request Body:**
```json
{
  "userId": "user_123",
  "orgId": "org_123",
  "bulkRequest": {
    "name": "Q4 Website Migrations",
    "description": "Migrate all regional websites",
    "urls": [
      "https://region1.company.com",
      "https://region2.company.com",
      "https://region3.company.com"
    ],
    "userBrief": {
      "goals": "modernize",
      "style_preferences": {
        "typography": "professional",
        "spacing": "normal"
      },
      "risk_appetite": "conservative"
    },
    "scheduling": {
      "immediate": false,
      "scheduledFor": "2025-12-08T02:00:00Z",
      "batchSize": 5,
      "delayBetweenBatches": 300
    },
    "notifications": {
      "email": "admin@company.com",
      "webhook": "https://company.com/api/webhooks/migration"
    }
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "bulkId": "bulk_456",
  "totalUrls": 3,
  "estimatedCompletionTime": "2025-12-08T03:30:00Z",
  "message": "Bulk migration scheduled successfully"
}
```

#### **GET /api/migration/bulk/:bulkId/status**

**NEW**: Get bulk migration status.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "bulkId": "bulk_456",
  "name": "Q4 Website Migrations",
  "status": "running",
  "totalUrls": 3,
  "completedMigrations": 1,
  "failedMigrations": 0,
  "currentBatch": 1,
  "totalBatches": 1,
  "estimatedCompletionTime": "2025-12-08T03:30:00Z",
  "migrations": [
    {
      "migrationId": "migration_789",
      "url": "https://region1.company.com",
      "status": "completed",
      "progress": 100,
      "aiTimeConsumed": 1100
    },
    {
      "migrationId": "migration_790",
      "url": "https://region2.company.com",
      "status": "processing",
      "progress": 75,
      "aiTimeConsumed": 850
    }
  ]
}
```

### Analysis & Reporting Endpoints

#### **GET /api/migration/:id/analysis**

Get preliminary site analysis results.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "technologies": ["WordPress", "jQuery", "Bootstrap 4", "Google Analytics"],
  "pageCount": 24,
  "complexity": "medium",
  "recommendations": [
    "Consolidate similar pages to reduce maintenance",
    "Optimize images for better performance",
    "Replace jQuery with modern vanilla JS"
  ],
  "crawlData": {
    "pages": [
      {
        "url": "https://example.com/",
        "title": "Home - Example Company",
        "statusCode": 200
      },
      {
        "url": "https://example.com/about",
        "title": "About Us - Example Company",
        "statusCode": 200
      }
    ],
    "assets": [
      {
        "type": "css",
        "url": "https://example.com/css/main.css",
        "size": 45678
      },
      {
        "type": "image",
        "url": "https://example.com/images/logo.png",
        "size": 12345
      }
    ]
  }
}
```

#### **GET /api/migration/:id/map**

Get URL mapping for SEO preservation.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "mappings": [
    {
      "sourceUrl": "https://example.com/",
      "targetRoute": "/",
      "redirectCode": 200,
      "status": "verified",
      "canonical": true
    },
    {
      "sourceUrl": "https://example.com/about-us",
      "targetRoute": "/about",
      "redirectCode": 301,
      "status": "planned",
      "canonical": false
    },
    {
      "sourceUrl": "https://example.com/old-page",
      "targetRoute": "/new-page",
      "redirectCode": 301,
      "status": "generated",
      "canonical": false
    }
  ],
  "totalMappings": 24,
  "preservationRate": 87.5
}
```

#### **GET /api/migration/:id/phases**

Get detailed phase progress with AI reasoning.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "phases": [
    {
      "name": "ANALYZE",
      "status": "completed",
      "progress": 100,
      "startedAt": "2025-12-07T10:00:00Z",
      "completedAt": "2025-12-07T10:03:00Z",
      "output": {
        "technologies": ["WordPress", "jQuery"],
        "complexity": "medium",
        "recommendations": ["Modernize jQuery usage"]
      }
    },
    {
      "name": "TRANSFORM",
      "status": "running",
      "progress": 65,
      "startedAt": "2025-12-07T10:05:00Z",
      "output": {
        "componentsGenerated": 12,
        "currentComponent": "ProductGrid",
        "nextSteps": ["Generate cart functionality"]
      }
    },
    {
      "name": "VERIFY",
      "status": "pending",
      "progress": 0
    }
  ],
  "currentPhase": "TRANSFORM",
  "overallProgress": 52
}
```

### Management Endpoints

#### **POST /api/migration/:id/cancel**

Cancel a running migration.

**Request Body:**
```json
{
  "userId": "user_123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Migration cancelled successfully",
  "cancelledAt": "2025-12-07T10:15:00Z"
}
```

#### **GET /api/migration/:id/tools**

Get audit trail of AI tool calls and operations.

**Query Parameters:**
```
?userId=<uuid>
```

**Response (200 OK):**
```json
{
  "toolCalls": [
    {
      "id": "tool_123",
      "agent": "planner",
      "tool": "crawl.fetch@1.0.0",
      "args": {
        "url": "https://example.com",
        "renderJS": true
      },
      "result": {
        "pages": 24,
        "technologies": ["WordPress", "jQuery"]
      },
      "tokens": 150,
      "createdAt": "2025-12-07T10:00:30Z"
    },
    {
      "id": "tool_124",
      "agent": "transformer",
      "tool": "transform.htmlToComponent@1.2.0",
      "args": {
        "htmlRef": "content_ref_456",
        "componentName": "Hero"
      },
      "result": {
        "success": true,
        "componentPath": "/components/Hero.tsx"
      },
      "tokens": 320,
      "createdAt": "2025-12-07T10:05:15Z"
    }
  ],
  "totalTokens": 1250,
  "totalCost": 31.25
}
```

### Error Handling

#### Common Error Codes
- `400` - Bad Request (validation errors)
- `402` - Payment Required (insufficient AI time balance)
- `404` - Migration not found or access denied
- `409` - Conflict (migration already processing)
- `429` - Rate limit exceeded (3 migrations/hour/user)
- `500` - Internal server error

#### Error Response Format
```json
{
  "error": "insufficient_ai_time",
  "message": "Insufficient AI time balance to start migration",
  "statusCode": 402,
  "timestamp": "2025-12-07T10:00:00Z",
  "details": {
    "balance": {
      "welcomeBonus": 0,
      "dailyGift": 300,
      "paid": 0,
      "total": 300
    },
    "required": 1200
  }
}
```

### Frontend Integration Examples

#### Simple Migration Flow
```typescript
// Start migration
const startMigration = async (url: string, prompt?: string) => {
  const response = await fetch('/api/migration/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: session.user.id,
      sourceUrl: url,
      userBrief: {
        goals: 'modernize',
        custom_instructions: prompt,
        risk_appetite: 'balanced'
      }
    })
  });

  return response.json();
};

// Real-time progress monitoring
const connectToMigrationStream = (migrationId: string, userId: string) => {
  const eventSource = new EventSource(
    `/api/migration/${migrationId}/stream?userId=${userId}`
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateMigrationProgress(data);
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    // Fallback to polling
    pollMigrationStatus();
  };

  return eventSource;
};
```

#### Enterprise Bulk Operations
```typescript
// Create bulk migration
const createBulkMigration = async (orgId: string, bulkRequest: any) => {
  const response = await fetch('/api/migration/bulk/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: session.user.id,
      orgId,
      bulkRequest
    })
  });

  return response.json();
};

// Monitor bulk progress
const getBulkStatus = async (bulkId: string) => {
  const response = await fetch(
    `/api/migration/bulk/${bulkId}/status?userId=${session.user.id}`
  );

  return response.json();
};
```

### Rate Limiting
- **Migration start**: 3 per hour per user
- **Status checks**: 60 per minute per user
- **Other operations**: 30 per minute per user
- **Enterprise bulk**: 1 per hour per organization

### AI Time Integration
Migration operations consume AI time from user balance:
- **Small sites** (1-5 pages): ~300 seconds (5 minutes)
- **Medium sites** (5-20 pages): ~900 seconds (15 minutes)
- **Large sites** (20+ pages): ~1800 seconds (30 minutes)
- **Enterprise sites**: Custom budgets with organization limits

### Quality Thresholds
- **Build success rate**: >95%
- **URL redirect accuracy**: >95%
- **Lighthouse performance**: >80
- **WCAG A compliance**: >90%
- **Legacy block ratio**: <25%

### Migration Features
- ✅ **Next.js 14 App Router** with TypeScript
- ✅ **Static Site Generation** for optimal performance
- ✅ **Tailwind CSS** with responsive design
- ✅ **SEO preservation** with proper redirects
- ✅ **Accessibility compliance** (WCAG A)
- ✅ **Performance optimization** with image optimization
- ✅ **Security hardening** with CSP and sanitization
- ✅ **Mobile-first** responsive design

### Production Readiness
The Migration Tool is production-ready with comprehensive features:
- **Security**: SSRF protection, ownership verification, rate limiting
- **Quality**: Build validation, Lighthouse testing, accessibility checks
- **Reliability**: Error recovery, retry mechanisms, audit trails
- **Performance**: Concurrent processing, optimized crawling, caching
- **Enterprise**: Bulk operations, organization management, advanced analytics
- **Monitoring**: Real-time progress, detailed metrics, comprehensive logging


