# Worker API HMAC Authentication Standard

## 🔐 Official Standard (Effective August 2025)

### HMAC v1 Format (CURRENT STANDARD)

**Canonical String**: `timestamp + body`  
**Example**: `1754736000{"test":"data"}`  
**NO PATH** in the canonical string!

### Required Headers

All requests to Worker API MUST include:
```
x-sheen-signature: [HMAC-SHA256 hex]
x-sheen-timestamp: [Unix timestamp in seconds]
x-sheen-nonce: [Random hex string]
Content-Type: application/json
```

### Implementation

```typescript
// CORRECT implementation
function generateWorkerSignature(body: string, timestamp: number): string {
  const canonical = timestamp.toString() + body;
  return crypto
    .createHmac('sha256', WORKER_SHARED_SECRET)
    .update(canonical, 'utf8')
    .digest('hex');
}
```

## ✅ What We Fixed

1. **Fixed `/api/chat-plan/stream` endpoint** - Was using wrong parameter order for `createWorkerAuthHeaders`
2. **Standardized all `/api/worker/[...path]` routes** - All now use correct method parameter
3. **Fixed WorkerAPIClient** - Uses correct v1 format throughout
4. **Created comprehensive test suite** - `/src/utils/__tests__/worker-auth.test.ts`
5. **Created centralized configuration** - `/src/config/worker-auth-config.ts`

## 🧪 Testing

### Unit Tests
```bash
npm test worker-auth.test.ts
```

### Integration Tests
```bash
node test-all-hmac-consistency.js
```

### Quick Verification
```bash
# Test a single endpoint
curl -X POST http://localhost:8081/v1/billing/check-sufficient \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $(node -e "
    const crypto = require('crypto');
    const ts = Math.floor(Date.now()/1000);
    const body = '{\"userId\":\"test\",\"projectId\":\"test\",\"estimatedCost\":1,\"operationType\":\"update\"}';
    const sig = crypto.createHmac('sha256', '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=')
      .update(ts + body).digest('hex');
    console.log(sig);
  ")" \
  -H "x-sheen-timestamp: $(date +%s)" \
  -H "x-sheen-nonce: $(openssl rand -hex 16)" \
  -d '{"userId":"test","projectId":"test","estimatedCost":1,"operationType":"update"}'
```

## 📁 Key Files

### Core Implementation
- `/src/utils/worker-auth.ts` - HMAC signature generation
- `/src/server/services/worker-api-client.ts` - Worker API client
- `/src/config/worker-auth-config.ts` - Centralized configuration

### API Routes
- `/src/app/api/worker/[...path]/route.ts` - Generic worker proxy
- `/src/app/api/chat-plan/message/route.ts` - Chat plan endpoint
- `/src/app/api/chat-plan/stream/route.ts` - SSE streaming endpoint
- `/src/app/api/chat-plan/convert-to-build/route.ts` - Plan conversion

### Tests
- `/src/utils/__tests__/worker-auth.test.ts` - Unit tests
- `/test-all-hmac-consistency.js` - Integration tests

## 🚨 Common Mistakes to Avoid

### ❌ WRONG - Including path in v1
```typescript
// DON'T DO THIS
const canonical = body + pathWithQuery;
```

### ❌ WRONG - Wrong parameter order
```typescript
// DON'T DO THIS
createWorkerAuthHeaders(body, path, headers);
```

### ✅ CORRECT
```typescript
// DO THIS
const canonical = timestamp + body;
createWorkerAuthHeaders(method, path, body, headers);
```

## 🔮 Future: HMAC v2 Format

When we migrate to v2, the format will be:
```
METHOD\n
PATH\n
TIMESTAMP\n
NONCE\n
BODY
```

Example:
```
POST
/v1/chat-plan
1754736000
abc123def456
{"test":"data"}
```

## 🎯 Checklist for New Endpoints

When adding a new Worker endpoint:

- [ ] Use `WorkerAPIClient` class (don't make direct fetch calls)
- [ ] If you must use fetch, use `createWorkerAuthHeaders(method, path, body, headers)`
- [ ] Include all required headers
- [ ] Handle 401/403 as auth errors
- [ ] Handle 402 as balance error
- [ ] Handle 429 with exponential backoff
- [ ] Add tests to `worker-auth.test.ts`
- [ ] Add to `test-all-hmac-consistency.js`

## 📊 Current Status

### Endpoints Verified ✅
- `/v1/chat-plan` - Chat Plan API
- `/v1/billing/check-sufficient` - Billing check
- `/v1/update-project` - Project updates
- `/api/worker/*` - All proxy routes
- `/api/chat-plan/*` - All chat plan routes

### Authentication Status
- **v1 HMAC**: ✅ Working everywhere
- **v2 HMAC**: 📝 Documented, ready for future
- **Consistency**: ✅ All endpoints use same format
- **Tests**: ✅ Comprehensive test coverage

## 🤝 Agreement with Worker Team

Both NextJS and Worker teams have agreed on:
1. **v1 Format**: `timestamp + body` (no path)
2. **Environment**: `WORKER_SHARED_SECRET` on NextJS, `HMAC_SECRET` on Worker
3. **Headers**: Standard x-sheen-* headers
4. **Migration**: Will coordinate v2 rollout when ready

---

**Last Updated**: August 9, 2025  
**Status**: Production Ready ✅