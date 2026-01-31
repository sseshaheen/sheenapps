# ✅ HMAC v1 Migration Complete

**Date**: August 9, 2025  
**Status**: COMPLETED

## Summary

All endpoints have been successfully migrated to use the **CORRECT** HMAC v1 signature format.

## Correct HMAC v1 Format

```javascript
// ✅ CORRECT FORMAT
const canonical = timestamp + body;  // NO PATH!
const signature = crypto.createHmac('sha256', SHARED_SECRET)
  .update(canonical)
  .digest('hex');
```

### Required Headers
```javascript
{
  'x-sheen-signature': signature,      // HMAC signature
  'x-sheen-timestamp': timestamp,      // Unix timestamp in seconds
  'x-sheen-nonce': nonce               // Random string (optional but recommended)
}
```

### Environment Configuration
```bash
SHARED_SECRET=9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=
# Note: Value includes trailing '=' character
```

## What Was Fixed

### 1. Core Services
- ✅ `hmacSignatureService.ts` - Now uses `SHARED_SECRET` env var (was using wrong `HMAC_SECRET`)
- ✅ `chatPlanService.ts` - Fixed database column references (`current_version_id`, `current_build_id`)

### 2. Routes Updated
All routes were using **WRONG** format: `body + path`  
Now all use **CORRECT** format: `timestamp + body`

| Route | Status | Implementation |
|-------|--------|---------------|
| `/v1/billing/*` | ✅ Fixed | Using HMAC middleware |
| `/v1/chat-plan` | ✅ Fixed | Using HMAC middleware |
| `/v1/update-project` | ✅ Fixed | Using HMAC middleware |
| `/v1/create-preview-for-new-project` | ✅ Fixed | Using hmacHelpers |
| `/v1/build-preview` | ✅ Fixed | Using hmacHelpers |
| `/v1/versions/*` | ✅ Fixed | Using hmacHelpers |

### 3. Documentation Updated
- ✅ `API_REFERENCE_FOR_NEXTJS.md` - All examples use correct format
- ✅ `POSTMAN_SheenApps-Claude_Worker_API.postman_collection-2-Aug-2025.json` - All requests updated

## Migration Files Created

1. **`/src/utils/hmacHelpers.ts`** - Shared helper functions with correct v1 format
2. **`/migrations/035_fix_chat_plan_column_references.sql`** - Documents DB column fixes
3. **`/migrations/036_fix_hmac_validation_all_routes.sql`** - Documents HMAC fixes
4. **`/docs/NEXTJS_TEAM_HMAC_SOLUTION.md`** - Solution guide for NextJS team

## For NextJS Team

### Quick Test
```javascript
const crypto = require('crypto');

// Configuration
const WORKER_SHARED_SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';
const WORKER_BASE_URL = 'http://localhost:8081';

// Test chat-plan endpoint
async function testChatPlan() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({
    userId: "test-user",
    projectId: "test-project", 
    message: "How do I add dark mode?",
    locale: "en-US"
  });
  
  // CORRECT v1 signature
  const canonical = timestamp + body;  // ✅ NOT body + path!
  const signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(canonical)
    .digest('hex');
  
  const response = await fetch(`${WORKER_BASE_URL}/v1/chat-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': signature,
      'x-sheen-timestamp': timestamp,
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
    },
    body: body
  });
  
  console.log('Status:', response.status);
  const result = await response.json();
  console.log('Response:', result);
}

testChatPlan();
```

## Verification

All endpoints now:
1. Accept HMAC v1 signatures with format: `timestamp + body`
2. Require `x-sheen-timestamp` header
3. Optionally accept `x-sheen-nonce` for replay protection
4. Use the shared secret: `9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=`

## Status Codes

- `200` - Success
- `401` - Missing signature headers
- `403` - Invalid signature
- `408` - Timestamp out of range
- `409` - Replay attack detected (nonce reused)

## Next Steps

The NextJS team should:
1. Update their signature generation to use `timestamp + body`
2. Add required headers (`x-sheen-timestamp`, optionally `x-sheen-nonce`)
3. Test with the provided script
4. All endpoints should now work with proper authentication

---

**Migration Complete** ✅