# HMAC Endpoints Reference

**Date**: August 9, 2025  
**Status**: UPDATED

## Endpoints Requiring HMAC Authentication

### ✅ Protected Endpoints (HMAC Required)

| Endpoint | Method | HMAC Status | Notes |
|----------|--------|------------|-------|
| `/v1/chat-plan` | POST | ✅ Configured | Chat plan mode |
| `/v1/chat-plan/convert` | POST | ✅ Configured | Convert plan to build |
| `/v1/chat-plan/stream` | GET | ✅ Configured | SSE streaming |
| `/v1/billing/balance/:userId` | GET | ✅ Configured | Get user balance |
| `/v1/billing/check-sufficient` | POST | ✅ Configured | Check sufficient balance |
| `/v1/update-project` | POST | ✅ Configured | Update existing project |
| `/v1/create-preview-for-new-project` | POST | ✅ Fixed | Create new project |
| `/v1/build-preview` | POST | ✅ Fixed | Build preview |
| `/v1/versions/rollback` | POST | ✅ Fixed | Rollback version |
| `/v1/versions/:versionId/rebuild` | POST | ✅ Fixed | Rebuild version |
| `/v1/projects/:projectId/export` | GET | ✅ Fixed | Export project |
| `/v1/versions/:versionId/download` | GET | ✅ Fixed | Download version |
| `/projects/:projectId/versions` | GET | ✅ JUST FIXED | Get version history |
| `/projects/:projectId/versions/milestone` | POST | ✅ JUST FIXED | Create milestone |
| `/build-preview-for-new-project` | POST | ⚠️ Legacy | Needs HMAC |
| `/generate` | POST | ⚠️ Legacy | Old endpoint |

### 🔓 Public Endpoints (No HMAC)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/health/detailed` | GET | Detailed health |
| `/health/capacity` | GET | Capacity check |
| `/cluster/status` | GET | Cluster status |
| `/myhealthz` | GET | K8s health check |
| `/` | GET | Root endpoint |

### 📊 Internal/Admin Endpoints

These should ideally have admin authentication:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/cluster/*` | Various | Cluster management |
| `/health/logs` | GET/DELETE | Log management |
| `/debug/*` | Various | Debug endpoints |

## Testing HMAC for Version History Endpoint

### Test Script for NextJS Team

```javascript
const crypto = require('crypto');
const fetch = require('node-fetch');

// Configuration
const WORKER_SHARED_SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';
const WORKER_BASE_URL = 'http://localhost:8081';

async function testVersionHistory() {
  const projectId = '34095156-1ffb-471e-b941-47207fa7448f';
  const path = `/projects/${projectId}/versions`;
  const queryParams = '?state=all&limit=1&offset=0&includePatches=true&showDeleted=false';
  
  // For GET requests, body is empty string
  const body = '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // CORRECT v1 signature: timestamp + body
  const canonical = timestamp + body;
  const signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(canonical)
    .digest('hex');
  
  const response = await fetch(`${WORKER_BASE_URL}${path}${queryParams}`, {
    method: 'GET',
    headers: {
      'x-sheen-signature': signature,
      'x-sheen-timestamp': timestamp,
      'x-sheen-nonce': nonce
    }
  });
  
  console.log('Status:', response.status);
  const result = await response.json();
  console.log('Response:', result);
}

testVersionHistory().catch(console.error);
```

## Common HMAC Issues and Solutions

### 1. **403 Forbidden - Invalid Signature**

**Causes**:
- Using wrong canonical format (should be `timestamp + body`)
- Wrong shared secret value
- Missing or incorrect timestamp header
- Body serialization mismatch

**Solution**:
```javascript
// ALWAYS use this format:
const canonical = timestamp + body;  // NOT body + path!
```

### 2. **401 Unauthorized - Missing Headers**

**Required Headers**:
```javascript
{
  'x-sheen-signature': signature,
  'x-sheen-timestamp': timestamp,  // Unix seconds as string
  'x-sheen-nonce': nonce           // Optional but recommended
}
```

### 3. **408 Request Timeout - Timestamp Out of Range**

The timestamp must be within ±2 minutes of server time:
```javascript
const timestamp = Math.floor(Date.now() / 1000).toString();
```

### 4. **Empty Body for GET Requests**

For GET requests, always use empty string for body:
```javascript
const body = '';  // NOT undefined or null
const canonical = timestamp + body;
```

## Environment Variables

```bash
# Worker side
SHARED_SECRET=9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=

# NextJS side
WORKER_SHARED_SECRET=9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=
WORKER_BASE_URL=http://localhost:8081
```

## Status After Fixes

- ✅ All v1 endpoints use correct HMAC format
- ✅ Version history endpoints now have HMAC validation
- ✅ Database queries fixed for chat plan
- ✅ Documentation updated with correct examples
- ✅ Postman collection updated

The `/projects/:projectId/versions` endpoint should now work with proper HMAC authentication!