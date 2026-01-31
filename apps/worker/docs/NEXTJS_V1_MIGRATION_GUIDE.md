# NextJS Team - v1 API Migration Guide

**Date**: August 9, 2025  
**Priority**: HIGH - Breaking Changes  
**Timeline**: Immediate action required

## 🚨 Critical Updates Required

All Worker API endpoints have been migrated to use the `/v1/` prefix. Your application needs to update all API calls immediately.

## Quick Migration Checklist

```javascript
// ❌ OLD ENDPOINTS (NO LONGER WORK)
'/api/builds/123/events'
'/projects/456/versions'
'/cf-pages-callback'
'/versions/789'
'/audit/working-directory/changes'

// ✅ NEW ENDPOINTS (USE THESE)
'/v1/builds/123/events'
'/v1/projects/456/versions'
'/v1/webhooks/cloudflare-callback'
'/v1/versions/detail/789'
'/v1/admin/audit/working-directory/changes'
```

## Complete Endpoint Migration Map

### 1. Build & Progress Monitoring
| Old Endpoint | New Endpoint |
|-------------|--------------|
| `GET /api/builds/:buildId/events` | `GET /v1/builds/:buildId/events` |
| `GET /api/builds/:buildId/status` | `GET /v1/builds/:buildId/status` |
| `GET /api/builds/:buildId/recommendations` | `GET /v1/builds/:buildId/recommendations` |
| `GET /api/webhooks/status` | `GET /v1/webhooks/status` |

### 2. Project & Version Management
| Old Endpoint | New Endpoint |
|-------------|--------------|
| `GET /projects/:projectId/versions` | `GET /v1/projects/:projectId/versions` |
| `POST /projects/:projectId/versions/milestone` | `POST /v1/projects/:projectId/versions/milestone` |
| `POST /projects/:projectId/publish/:versionId` | `POST /v1/projects/:projectId/publish/:versionId` |
| `POST /projects/:projectId/unpublish` | `POST /v1/projects/:projectId/unpublish` |
| `GET /projects/:projectId/domains` | `GET /v1/projects/:projectId/domains` |
| `POST /projects/:projectId/domains` | `POST /v1/projects/:projectId/domains` |
| `DELETE /projects/:projectId/domains/:domainName` | `DELETE /v1/projects/:projectId/domains/:domainName` |
| `POST /projects/:projectId/domains/:domainName/verify` | `POST /v1/projects/:projectId/domains/:domainName/verify` |
| `GET /projects/:projectId/publication-status` | `GET /v1/projects/:projectId/publication-status` |

### 3. Version Operations
| Old Endpoint | New Endpoint |
|-------------|--------------|
| `GET /versions/:userId/:projectId` | `GET /v1/versions/list/:userId/:projectId` |
| `GET /versions/:versionId` | `GET /v1/versions/detail/:versionId` |
| `GET /versions/:id1/diff/:id2` | `GET /v1/versions/:id1/diff/:id2` |

### 4. Webhooks
| Old Endpoint | New Endpoint |
|-------------|--------------|
| `POST /cf-pages-callback` | `POST /v1/webhooks/cloudflare-callback` |
| `GET /cf-pages-callback/health` | `GET /v1/webhooks/cloudflare-callback/health` |

### 5. Build Preview
| Old Endpoint | New Endpoint |
|-------------|--------------|
| `POST /build-preview-for-new-project` | `POST /v1/build-preview` |

## Code Updates Required

### 1. Update Your API Client

```typescript
// worker-api-client.ts

// ❌ OLD
const ENDPOINTS = {
  BUILD_EVENTS: '/api/builds',
  PROJECT_VERSIONS: '/projects',
  WEBHOOK_CALLBACK: '/cf-pages-callback'
};

// ✅ NEW
const ENDPOINTS = {
  BUILD_EVENTS: '/v1/builds',
  PROJECT_VERSIONS: '/v1/projects',
  WEBHOOK_CALLBACK: '/v1/webhooks/cloudflare-callback'
};
```

### 2. Update Polling Functions

```typescript
// ❌ OLD
async function pollBuildEvents(buildId: string) {
  const response = await fetch(`/api/builds/${buildId}/events`);
  // ...
}

// ✅ NEW
async function pollBuildEvents(buildId: string) {
  const response = await fetch(`/v1/builds/${buildId}/events`);
  // ...
}
```

### 3. Update Version Management

```typescript
// ❌ OLD
async function getProjectVersions(projectId: string) {
  const response = await fetch(`/projects/${projectId}/versions`);
  // ...
}

// ✅ NEW
async function getProjectVersions(projectId: string) {
  const response = await fetch(`/v1/projects/${projectId}/versions`);
  // ...
}
```

### 4. Update Webhook Configuration

```typescript
// ❌ OLD
const WEBHOOK_URL = 'https://worker.sheenapps.com/cf-pages-callback';

// ✅ NEW
const WEBHOOK_URL = 'https://worker.sheenapps.com/v1/webhooks/cloudflare-callback';
```

## HMAC Authentication Updates

All endpoints still require HMAC v1 authentication with the correct format:

```typescript
// CORRECT v1 Format
const timestamp = Math.floor(Date.now() / 1000).toString();
const canonical = timestamp + body;  // NOT body + path!
const signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
  .update(canonical)
  .digest('hex');

// Required headers
headers: {
  'x-sheen-signature': signature,
  'x-sheen-timestamp': timestamp,
  'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
}
```

## Testing Your Updates

### 1. Test Build Events
```bash
curl -X GET "http://localhost:8081/v1/builds/123/events?userId=test" \
  -H "x-sheen-signature: [calculated]" \
  -H "x-sheen-timestamp: $(date +%s)" \
  -H "x-sheen-nonce: $(openssl rand -hex 16)"
```

### 2. Test Project Versions
```bash
curl -X GET "http://localhost:8081/v1/projects/456/versions?state=all" \
  -H "x-sheen-signature: [calculated]" \
  -H "x-sheen-timestamp: $(date +%s)" \
  -H "x-sheen-nonce: $(openssl rand -hex 16)"
```

## Endpoints That Haven't Changed

These endpoints already had `/v1/` prefix and remain the same:
- `POST /v1/chat-plan`
- `POST /v1/create-preview-for-new-project`
- `POST /v1/update-project`
- `POST /v1/versions/rollback`
- `GET /v1/versions/:versionId/download`
- `GET /v1/projects/:projectId/export`
- `GET /v1/billing/balance/:userId`
- `POST /v1/billing/check-sufficient`

## Resources

- **Updated API Reference**: `/docs/API_REFERENCE_FOR_NEXTJS.md`
- **Updated Postman Collection**: `/docs/POSTMAN_SheenApps-Claude_Worker_API.postman_collection-2-Aug-2025.json`
- **Security Audit Report**: `/SECURITY_AUDIT.md`
- **Full Migration List**: `/V1_MIGRATION_SUMMARY.md`

## Support

If you encounter any issues:
1. Check that you're using the correct v1 endpoint
2. Verify HMAC signature format (`timestamp + body`)
3. Ensure all required headers are present
4. Check the response error message for specific issues

## Timeline

- **Immediate**: Update all API calls to use v1 endpoints
- **Next 7 days**: Test all integrations thoroughly
- **30 days**: Old endpoints will return deprecation warnings
- **60 days**: Old endpoints will be removed

---

**Action Required**: Please update your codebase immediately as old endpoints may stop working without notice during the deprecation period.