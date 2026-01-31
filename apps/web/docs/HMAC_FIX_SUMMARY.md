# HMAC Authentication Fix Summary

## Problem Identified
The worker team identified that our HMAC v1 signature was using the WRONG canonical format.

## The Fix

### ❌ OLD (Wrong) v1 Format:
```javascript
const canonical = body + pathWithQuery;  // WRONG!
```

### ✅ NEW (Correct) v1 Format:
```javascript
const canonical = timestamp + body;  // CORRECT!
// NO PATH IN v1!
```

## Files Updated

1. **`/src/utils/worker-auth.ts`**
   - Fixed `generateWorkerSignature()` to use `timestamp + body` instead of `body + path`
   - Updated `generateWorkerSignatureV2()` with correct format: `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY`
   - Updated `createWorkerAuthHeaders()` to pass method parameter

2. **`/src/server/services/worker-api-client.ts`**
   - Updated to use corrected v1 signature with timestamp parameter
   - Fixed signature generation to pass timestamp to generateWorkerSignatureV1

3. **`/src/app/api/worker/[...path]/route.ts`**
   - Fixed all HTTP method handlers to pass correct method name to createWorkerAuthHeaders
   - GET, POST, PUT, DELETE now all use proper method parameter

4. **`.env.local`**
   - Removed quotes from WORKER_SHARED_SECRET value
   - Was: `WORKER_SHARED_SECRET='REDACTED'`
   - Now: `WORKER_SHARED_SECRET=REDACTED`

## HMAC v2 Format (For Future Implementation)

```javascript
// Correct v2 canonical string format
const canonical = [
  method.toUpperCase(),    // "POST"
  pathWithQuery,           // "/v1/chat-plan"
  timestamp.toString(),    // "1754735981"
  nonce,                  // "abc123def456"
  body                    // '{"userId":"123",...}'
].join('\n');             // Join with newlines
```

## Testing Results

✅ **Authentication now working correctly**
- `/v1/billing/check-sufficient` returns 400 (validation error) instead of 403 (auth error)
- This confirms HMAC v1 signature is now correct

## Status

- **HMAC v1**: ✅ Fixed and working
- **HMAC v2**: ✅ Format documented, ready for rollout when needed
- **Chat Plan Endpoint**: Waiting for worker team to confirm `/v1/chat-plan` availability

## Next Steps

1. Worker team to confirm `/v1/chat-plan` endpoint is deployed
2. Test end-to-end Chat Plan Mode functionality
3. Consider implementing v2 signatures for future compatibility

## Key Lessons Learned

1. **v1 format is simple**: Just `timestamp + body`, no path involved
2. **Timestamp in seconds**: Not milliseconds
3. **Environment variables**: No quotes around secret values in .env files
4. **v2 uses newlines**: Components separated by `\n` not colons or dots
