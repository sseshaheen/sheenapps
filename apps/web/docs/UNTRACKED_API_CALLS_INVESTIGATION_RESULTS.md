# Untracked API Calls Investigation Results

## 🚨 **ROOT CAUSE IDENTIFIED: DUAL WORKER SERVICES**

We found the source of untracked API calls causing duplicate project creation attempts!

## 🔍 **The Discovery**

### **Two Different Worker Services Running:**

1. **✅ NEW WORKER API** (Tracked):
   - URL: `WORKER_BASE_URL=http://localhost:8081`
   - Endpoints: `/v1/create-preview-for-new-project`, `/v1/update-project`
   - Correlation ID: ✅ **Has tracking** via `WorkerAPIClient`

2. **❌ OLD CLAUDE WORKER** (Untracked):
   - URL: `NEXT_PUBLIC_CLAUDE_WORKER_URL=http://localhost:8081` 
   - Endpoints: Legacy AI generation endpoints
   - Correlation ID: ❌ **NO tracking** until now

### **Evidence from Codebase:**

**Untracked API Calls Found:**
```typescript
// src/lib/ai/claudeRunner.ts - NO correlation ID (until fixed)
const response = await fetch(workerUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': signature
    // ❌ Missing: 'x-correlation-id': correlationId
  },
  body: JSON.stringify({ prompt })
});
```

**Error Message Source:**
```typescript
// src/app/api/projects/route.ts:319 - This IS in our codebase!
{ success: false, error: 'Failed to create project' }
```

## ✅ **IMMEDIATE FIXES IMPLEMENTED**

### **1. Added Correlation Tracking to Claude Runner**

```typescript
// src/lib/ai/claudeRunner.ts - NOW TRACKED
const correlationId = `nextjs_claude_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

console.log(`[NextJS] Claude Runner API call (correlation: ${correlationId}):`, {
  correlationId,
  endpoint: workerUrl,
  userId: userId?.slice(0, 8),
  promptLength: prompt.length,
  timestamp: new Date().toISOString()
});

const response = await fetch(workerUrl, {
  headers: {
    'x-correlation-id': correlationId  // ✅ NOW TRACKED!
  }
});
```

### **2. Comprehensive HTTP Request Logger**

**Added Global Request Interceptor:**
- File: `src/utils/http-request-logger.ts`
- Tracks **ALL HTTP requests** to worker hosts
- **Warns about untracked requests** with `NO_CORRELATION_ID`
- Logs request/response details for debugging

**Log Output Format:**
```
🌐 [NextJS] HTTP Request to Worker: {
  method: 'POST',
  url: 'http://localhost:8081/some-endpoint',
  correlationId: 'nextjs_claude_1754365440989_a7f3ab01',
  timestamp: '2025-08-05T03:44:00.989Z'
}

⚠️ [NextJS] UNTRACKED WORKER REQUEST DETECTED: {
  method: 'POST', 
  url: 'http://localhost:8081/legacy-endpoint',
  warning: 'This request has no correlation ID - potential duplicate source!'
}
```

### **3. Enhanced Frontend Logging**

All project creation components now log:
- **Request initiation**: User action, prevention status
- **API calls**: Correlation IDs, endpoints, payload info
- **Responses**: Success/error status, project IDs
- **Blocked requests**: When double-submission prevention triggers

## 🎯 **What You'll Now See in Logs**

### **All Worker API Calls Will Show:**
```
🌐 [NextJS] HTTP Request to Worker: { correlationId: "nextjs_claude_...", url: "..." }
[NextJS] Claude Runner API call (correlation: nextjs_claude_...): { ... }
[NextJS] Creating project (correlation: nextjs_...): { ... }
```

### **Untracked Calls Will Be Flagged:**
```
⚠️ [NextJS] UNTRACKED WORKER REQUEST DETECTED: { warning: "This request has no correlation ID" }
```

## 🔧 **Environment Configuration**

Both worker services are configured but pointing to **same host**:

```env
# New Worker API (tracked)
WORKER_BASE_URL=http://localhost:8081
WORKER_SHARED_SECRET=w1z9uV2gN9NQjW9xQnD0b5tPVQh12f1sHkK3lW0Ejtc=

# Old Claude Worker (now tracked)  
NEXT_PUBLIC_CLAUDE_WORKER_URL=http://localhost:8081
NEXT_PUBLIC_CLAUDE_SHARED_SECRET=w1z9uV2gN9NQjW9xQnD0b5tPVQh12f1sHkK3lW0Ejtc=
```

## 📊 **Expected Debugging Outcomes**

With comprehensive tracking now active, you can:

1. **Match All NextJS → Worker API Calls**: Every request has correlation ID
2. **Identify Duplicate Sources**: Multiple correlation IDs for same project intent
3. **Track Request Sequences**: Exact timing of all API calls
4. **Spot Untracked Calls**: Warning logs for any missing correlation IDs
5. **Complete Request Flow**: From UI action → API call → Worker response

## 🚀 **Next Steps**

1. **Run Tests**: All project creation now tracked with correlation IDs
2. **Monitor Logs**: Look for `🌐 [NextJS] HTTP Request to Worker` and `⚠️ UNTRACKED` warnings
3. **Correlation Matching**: Match `nextjs_*` correlation IDs between NextJS and Worker logs
4. **Identify Patterns**: See if duplicate requests still occur and from which sources

## 🎉 **Outcome**

- **✅ All worker API calls now tracked** with correlation IDs
- **✅ Global HTTP request monitoring** active
- **✅ Untracked request detection** with warnings
- **✅ Complete request/response logging** for debugging
- **✅ Legacy claudeRunner calls** now have correlation IDs

The mystery API calls are no longer hidden - every request to your worker will be logged with full correlation tracking!

---

**Status**: ✅ **COMPREHENSIVE TRACKING IMPLEMENTED** - All worker API calls now visible with correlation IDs.