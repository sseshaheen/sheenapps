# CORS Header Fix: x-correlation-id

## Issue Report from NextJS Team

**Date**: August 5, 2025  
**Reporter**: NextJS Team  
**Issue**: Billing check API calls failing due to CORS preflight rejection

> "I found the root cause! The issue is that the billing check is using workerClient.post() which automatically adds the x-correlation-id header, but the worker API server isn't configured to accept this custom header in CORS preflight requests."

## Root Cause

The Worker API server's CORS configuration was missing the `x-correlation-id` header in the `allowedHeaders` array. This caused browser preflight requests to fail when the NextJS client automatically added correlation IDs for request tracking.

### CORS Configuration Before Fix
```typescript
allowedHeaders: ['Content-Type', 'Authorization', 'x-sheen-signature', 'x-direct-mode']
```

### CORS Configuration After Fix  
```typescript
allowedHeaders: ['Content-Type', 'Authorization', 'x-sheen-signature', 'x-direct-mode', 'x-correlation-id']
```

## Technical Details

**File Modified**: `src/server.ts` line 109  
**Change Type**: CORS header allowlist update  
**Impact**: Enables NextJS client to include correlation IDs in API requests  

## Why This Matters

1. **Request Tracing**: Correlation IDs enable end-to-end request tracking across microservices
2. **Debugging**: Essential for correlating logs between NextJS and Worker services  
3. **Monitoring**: Required for distributed tracing and observability
4. **User Experience**: Failed preflight requests cause API timeouts and errors

## Validation

After applying this fix:
- [ ] NextJS billing check API calls should succeed
- [ ] CORS preflight requests should pass for requests with `x-correlation-id` header
- [ ] Request correlation should work end-to-end
- [ ] No console errors related to CORS in browser developer tools

## Related Architecture

This fix supports the **microservice communication pattern** where:
- **NextJS frontend** generates correlation IDs for request tracking
- **Worker backend** receives and logs correlation IDs for debugging
- **Logs** can be correlated across both services using the same ID

## Future Considerations

As we add more custom headers for microservice communication, ensure they are included in the CORS `allowedHeaders` configuration to prevent similar issues.

---

**Status**: ✅ **FIXED**  
**Applied**: August 5, 2025  
**Validation**: Pending NextJS team testing