# Create Preview Endpoint Plan

## Overview

Create a new endpoint `/create-preview-for-new-project` that uses the modular system with session-based context support.

## Key Differences from Build Preview

1. **Uses Modular System**: TaskExecutorService instead of buildWorker
2. **Session Support**: Maintains context across tasks via Claude CLI sessions
3. **Plan-Based**: Generates a plan first, then executes tasks
4. **Better Code Quality**: Files will have proper imports and coherent structure

## Implementation Plan

### 1. Create Route File
```typescript
// src/routes/createPreview.ts
```

Features to implement:
- Same security (HMAC signature verification)
- Same rate limiting (IP, user, project)
- Similar request/response structure
- Support for direct and queued modes

### 2. Integration Points

#### Required Services:
- `PlanGeneratorService` - Generate task plan from prompt
- `TaskExecutorService` - Execute tasks with session support
- `SessionManager` - Manage Claude CLI sessions
- `WebhookService` - Progress updates
- `PathGuard` - Security

#### Execution Flow:
1. Validate request and security
2. Generate plan using PlanGeneratorService
3. Create session for the plan
4. Execute tasks with TaskExecutorService
5. Return results or job ID

### 3. Direct Mode Implementation

For direct (synchronous) execution:
```typescript
// 1. Generate plan
const plan = await planGenerator.generatePlan(prompt, context);

// 2. Execute with sessions
const results = await taskExecutor.executePlan(plan, projectContext);

// 3. Aggregate results
const files = results.flatMap(r => r.files || []);
const deploymentUrl = await deployFiles(files);
```

### 4. Queue Mode Implementation

For queued execution:
- Create new queue: `modular-preview-queue`
- Queue job with plan ID
- Worker executes plan with sessions
- Webhooks for progress updates

### 5. Response Format

Keep similar to existing endpoint:
```json
{
  "success": true,
  "jobId": "xxx",
  "planId": "xxx", // New: plan identifier
  "sessionId": "xxx", // New: Claude session ID
  "status": "completed|queued|failed",
  "deploymentUrl": "https://...",
  "files": [...], // New: list of created files
  "message": "..."
}
```

## Benefits

1. **Better Code Quality**: Session context ensures files work together
2. **Transparency**: Users can see the plan before execution
3. **Modularity**: Each task is independent and trackable
4. **Extensibility**: Easy to add new task types

## Security Considerations

- Keep all existing security measures
- Validate task types in plan
- Sanitize file paths in tasks
- Limit plan size/complexity

## Testing Strategy

1. Test with simple React app creation
2. Verify session continuity across tasks
3. Check that imports/exports match
4. Test error recovery with sessions

## Implementation Status

### ✅ Completed
- Created `/create-preview-for-new-project` endpoint in `src/routes/createPreview.ts`
- Integrated with modular system (PlanGeneratorService + TaskExecutorService)
- Same security features as build-preview (signature, rate limiting)
- Support for both direct and queued execution
- Registered route in server.ts

### ⚠️ Session Support Disabled
The SessionManager implementation was reverted by the linter. The endpoint is ready but sessions are commented out. To enable:

1. Uncomment the SessionManager import
2. Re-enable SessionManager instantiation in executeCreatePreviewDirect
3. Pass sessionManager to TaskExecutorService constructor
4. Uncomment session retrieval code

### 📝 Testing the Endpoint

```bash
# Generate signature using helper script
node scripts/generate-signature.js YOUR_SHARED_SECRET '{"userId":"test-user","projectId":"test-project","prompt":"Create a simple React app with a header and a button","framework":"react"}'

# This will output the signature and a ready-to-use cURL command

# Or manually test with:
curl -X POST http://localhost:8080/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: YOUR_SIGNATURE_HERE" \
  -d '{
    "userId": "test-user",
    "projectId": "test-project", 
    "prompt": "Create a simple React app with a header and a button",
    "framework": "react"
  }'
```

The endpoint will:
1. Generate a plan with multiple tasks
2. Execute each task (create files, components, etc.)
3. Return results with file list and deployment URL

### 🔄 Next Steps

1. **Re-implement SessionManager** - The code is ready but was reverted
2. **Test with Claude CLI** - Verify that the modular system works correctly
3. **Deploy files** - Implement actual file deployment (currently returns mock URL)
4. **Add progress tracking** - Webhook updates during execution