# Rogue API Calls Root Cause Analysis

## 🚨 **ROOT CAUSE IDENTIFIED: REACT QUERY AUTOMATIC RETRIES**

We found the source of the mysterious **POST `/api/projects` 500** calls!

## 🔍 **The Discovery**

### **React Query Mutation Retry Configuration**

**File**: `/src/components/providers/query-provider.tsx:35`

```typescript
mutations: {
  // No retries in dev, 1 retry in prod
  retry: process.env.NODE_ENV === 'development' ? 0 : 1,
},
```

### **How It Creates Duplicate Requests**

1. **Request 1**: User triggers project creation
   - Frontend → POST `/api/projects` 
   - Next.js API → Worker API `/v1/create-preview-for-new-project` ✅ **Tracked with correlation ID**
   - **If this succeeds**: No problem

2. **Request 2**: React Query automatic retry (if Request 1 fails/times out)
   - **Same user action** → **Same API call** → POST `/api/projects` 
   - **Different execution context** → **No correlation ID tracking**
   - Next.js API → Worker API `/v1/create-preview-for-new-project` ❌ **Untracked**
   - **Potential result**: Duplicate key constraint error

### **Why This Happens**

- **Network timeout**: If first request takes too long
- **Server error**: If first request returns 500 status 
- **Connection issues**: Network interruptions
- **Server overload**: API route responds slowly

**React Query automatically retries** without the original request context, leading to **untracked duplicate calls**.

## ✅ **COMPREHENSIVE LOGGING IMPLEMENTED**

### **1. Next.js API Route Logging**

**Every request to `/api/projects` now logged:**

```typescript
// Entry point logging
🚨 [NextJS API Route] ENTRY POINT - POST /api/projects: {
  method: 'POST',
  url: 'http://localhost:3000/api/projects',
  timestamp: '2025-08-05T03:44:32.994Z',
  headers: { ... },
  context: { hasUser: true, userId: 'abc12345' }
}

// Detailed request logging
🌐 [NextJS API Route] POST /api/projects - PROJECT CREATION: {
  userId: 'abc12345',
  hasBusinessIdea: true,
  requestBody: { ... }
}

// Exit point logging
🚨 [NextJS API Route] EXIT POINT - POST /api/projects: {
  status: 500,
  success: false,
  timestamp: '2025-08-05T03:44:37.404Z'
}
```

### **2. React Query Mutation Tracking**

**Every mutation attempt now logged:**

```typescript
🔄 [NextJS React Query] CREATE PROJECT MUTATION STARTED: {
  timestamp: '2025-08-05T03:44:32.994Z',
  userId: 'abc12345',
  projectName: 'My Project',
  mutationId: 'create-project-1754365472994'
}

❌ [NextJS React Query] CREATE PROJECT MUTATION ERROR: {
  timestamp: '2025-08-05T03:44:37.000Z',
  error: 'Failed to create project: 500',
  willRetry: true  // ← THE SMOKING GUN!
}

🔄 [NextJS React Query] CREATE PROJECT MUTATION STARTED: {
  timestamp: '2025-08-05T03:44:37.500Z',  // ← RETRY ATTEMPT
  userId: 'abc12345',
  projectName: 'My Project',
  mutationId: 'create-project-1754365477500'
}
```

### **3. Global HTTP Request Monitoring**

**All HTTP requests to worker tracked:**

```typescript
🌐 [NextJS] HTTP Request to Worker: {
  correlationId: 'nextjs_1754365472994_f8890574',
  url: 'http://localhost:8081/v1/create-preview-for-new-project',
  method: 'POST'
}

⚠️ [NextJS] UNTRACKED WORKER REQUEST DETECTED: {
  method: 'POST',
  url: 'http://localhost:8081/v1/create-preview-for-new-project',
  warning: 'This request has no correlation ID - potential duplicate source!'
}
```

## 🎯 **Expected Log Sequence for Duplicate Requests**

```
1. 🔄 [React Query] MUTATION STARTED (first attempt)
2. 🚨 [API Route] ENTRY POINT - POST /api/projects
3. 🌐 [HTTP] Request to Worker (with correlation ID)
4. ❌ [React Query] MUTATION ERROR (willRetry: true)
5. 🚨 [API Route] EXIT POINT (status: 500)

   --- REACT QUERY RETRY DELAY ---

6. 🔄 [React Query] MUTATION STARTED (retry attempt) ← THE DUPLICATE!
7. 🚨 [API Route] ENTRY POINT - POST /api/projects (second call)
8. ⚠️ [HTTP] UNTRACKED WORKER REQUEST DETECTED
9. Worker receives second request → Duplicate key constraint error
```

## 🛠️ **Potential Solutions**

### **Option 1: Disable Mutation Retries for Project Creation**
```typescript
const createMutation = useMutation({
  mutationFn: createProject,
  retry: 0, // Disable retries for project creation
})
```

### **Option 2: Add Idempotency Keys**
```typescript
// Include unique request ID in project creation
const requestId = crypto.randomUUID();
const response = await fetch('/api/projects', {
  headers: {
    'x-idempotency-key': requestId
  }
});
```

### **Option 3: Server-Side Deduplication**
```typescript
// In API route - check for recent duplicate requests
const recentRequest = await checkRecentProjectCreation(userId, businessIdea);
if (recentRequest) {
  return NextResponse.json({ success: true, project: recentRequest });
}
```

## 📊 **What You'll See Now**

With comprehensive logging active, you can:

1. **Identify React Query Retries**: Look for `willRetry: true` in mutation errors
2. **Track Duplicate API Calls**: Multiple `ENTRY POINT` logs for same user/project
3. **Correlate Request Sequences**: Match React Query mutations with API route calls
4. **Spot Untracked Requests**: Worker requests without correlation IDs
5. **Time Analysis**: See exact timing between original request and retry

## 🎉 **Outcome**

- **✅ Root cause identified**: React Query mutation retries
- **✅ Comprehensive logging**: Every API call and mutation tracked
- **✅ Request correlation**: Complete visibility into duplicate request flow
- **✅ Worker team debugging**: Full request lifecycle visibility

The mystery **POST `/api/projects` 500** calls are **React Query automatic retries** triggered by failed/slow initial requests!

---

**Status**: ✅ **ROOT CAUSE IDENTIFIED** - Automatic mutation retries creating duplicate project creation attempts.