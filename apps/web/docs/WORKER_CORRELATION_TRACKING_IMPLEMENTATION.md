# Worker Correlation Tracking Implementation

## 🎯 **Response to Worker Team Request**

We've implemented comprehensive request correlation tracking to help debug duplicate project creation issues, as requested by the worker team.

## ✅ **Implementation Summary**

### **1. Client Correlation ID Headers** ✅

**Location**: `/src/services/worker-api-client.ts`

```typescript
// Auto-generated correlation ID for every request
const correlationId = `nextjs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

// Added to all POST requests
headers: {
  'x-correlation-id': correlationId,
  'x-sheen-signature': signature,
  // ... other headers
}
```

### **2. Comprehensive Client-Side Logging** ✅

**Enhanced Request Logging** (`worker-api-client.ts`):
```typescript
logger.info(`[NextJS] Creating project (correlation: ${correlationId}):`, {
  correlationId,
  userId: data?.userId,
  timestamp: new Date().toISOString(),
  endpoint: pathWithQuery,
  hasProjectId: !!data?.projectId,
  projectId: data?.projectId || 'SERVER_GENERATED'
});
```

**Request Payload Logging** (`worker-api-client.ts`):
```typescript
logger.info(`[NextJS] Request payload (correlation: ${correlationId}):`, {
  correlationId,
  hasProjectId: !!data?.projectId,
  projectId: data?.projectId || 'SERVER_GENERATED',
  metadata: data?.metadata,
  promptLength: data?.prompt?.length || 0,
  hasTemplateFiles: !!(data?.templateFiles && Object.keys(data.templateFiles).length > 0)
});
```

**Response Tracking** (`worker-api-client.ts`):
```typescript
// Success responses
logger.info(`[NextJS] Project creation response (correlation: ${correlationId}):`, {
  correlationId,
  success: !!(result as any)?.success,
  projectId: (result as any)?.projectId,
  buildId: (result as any)?.buildId,
  status: (result as any)?.status
});

// Error responses
logger.error(`[NextJS] Project creation error (correlation: ${correlationId}):`, {
  correlationId,
  error: error instanceof Error ? error.message : String(error),
  errorType: error instanceof Error ? error.constructor.name : 'Unknown'
});
```

### **3. UI-Level Request Tracking** ✅

**Project Creation Sources Tracked**:

1. **Business Idea Form** (`new-project-page.tsx`):
```typescript
console.log('[NextJS] Starting project creation from business idea:', {
  timestamp: new Date().toISOString(),
  businessIdea: businessIdea.slice(0, 100) + '...',
  ideaLength: businessIdea.length,
  userId: user?.id?.slice(0, 8),
  source: 'new-project-page',
  preventionLayer: 'multi-layer-guards-active'
});
```

2. **Template Selection** (`new-project-page.tsx`):
```typescript
console.log('[NextJS] Starting project creation from template:', {
  timestamp: new Date().toISOString(),
  templateId,
  tier,
  userId: user?.id?.slice(0, 8),
  source: 'new-project-page-template',
  preventionLayer: 'multi-layer-guards-active'
});
```

3. **Dashboard Dialog** (`create-project-dialog.tsx`):
```typescript
console.log('[NextJS] Starting project creation from dialog:', {
  timestamp: new Date().toISOString(),
  projectName,
  source: 'create-project-dialog',
  preventionLayer: 'multi-layer-guards-active'
});
```

### **4. Double-Submission Prevention** ✅

**Multi-Layer Protection** implemented in all handlers:

```typescript
// Layer 1: Synchronous guard check
if (isLoading || isProcessingRef.current) {
  console.log('[NextJS] Project creation blocked - already in progress:', {
    isLoading,
    isProcessingRef: isProcessingRef.current,
    // ... context info
  });
  return
}

// Layer 2: Immediate flag set (eliminates race window)
isProcessingRef.current = true
setIsLoading(true)

// Layer 3: Guaranteed cleanup
finally {
  setIsLoading(false)
  isProcessingRef.current = false
}
```

## 🔍 **What You'll See in Logs**

### **Normal Single Request Flow**:
```
[NextJS] Starting project creation from business idea: { userId: "abc12345", source: "new-project-page", preventionLayer: "multi-layer-guards-active" }
[NextJS] Creating project (correlation: nextjs_1701234567890_abc12345): { correlationId, userId, endpoint: "/v1/create-preview-for-new-project" }
[NextJS] Request payload (correlation: nextjs_1701234567890_abc12345): { hasProjectId: false, projectId: "SERVER_GENERATED" }
[NextJS] Project creation response (correlation: nextjs_1701234567890_abc12345): { success: true, projectId: "generated-id" }
[NextJS] Project creation successful, redirecting: { projectId: "generated-id", source: "new-project-page-business-idea" }
```

### **Blocked Duplicate Request**:
```
[NextJS] Starting project creation from business idea: { preventionLayer: "multi-layer-guards-active" }
[NextJS] Project creation blocked - already in progress: { isLoading: true, isProcessingRef: true }
```

## 📊 **Expected Debugging Outcomes**

With this implementation, you can now identify:

1. **Multiple UI Triggers**: If same user triggers multiple creation attempts
2. **Race Conditions**: Timing between blocked vs. successful requests
3. **Request Sequencing**: Exact order and timing of API calls
4. **Correlation Tracking**: Match NextJS logs with Worker API logs using correlation ID
5. **Prevention Effectiveness**: Whether our double-submission guards are working

## 🚨 **Key Questions This Will Answer**

1. ✅ **Are you preventing double-clicks?** → YES: Multi-layer guards with logging
2. ✅ **Do you have retry logic?** → NO: No automatic retry on worker API calls
3. ✅ **Are there race conditions?** → FIXED: `useRef` eliminates React state race windows
4. ✅ **Automatic retry on network errors?** → NO: Errors are logged and shown to user

## 🎯 **Worker Team Integration**

**Correlation ID Format**: `nextjs_{timestamp}_{8-char-uuid}`

**Header**: `x-correlation-id`

**Log Prefix**: `[NextJS]` for easy filtering

You can now match our correlation IDs with your worker service logs to see the complete request flow and identify any duplicates that make it through our prevention layers.

---

**Status**: ✅ **FULLY IMPLEMENTED** - All requested correlation tracking active in production code.