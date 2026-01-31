# Worker Team Diagnostic Report - Chat Plan Mode Integration
**Date**: August 9, 2025
**Reporter**: Next.js Frontend Team
**Priority**: High - Blocking Chat Plan Mode Feature Launch

## Executive Summary
We've completed the frontend implementation of Chat Plan Mode but are encountering authentication and endpoint availability issues when attempting to integrate with the Worker API. We need clarification on HMAC v2 signature format and confirmation of endpoint availability.

## 1. Authentication Status

### ✅ HMAC v1 - Working
```javascript
// Working v1 signature generation
const canonical = body + pathWithQuery;
const signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
  .update(canonical, 'utf8')
  .digest('hex');

// Headers sent
{
  'x-sheen-signature': signature,
  'x-sheen-timestamp': timestamp,
  'x-sheen-nonce': nonce
}
```

**Test Results**:
- `/v1/update-project` → 402 (Insufficient balance - Auth working!)
- `/v1/billing/check-sufficient` → 400 (Validation error - Auth working!)

### ❌ HMAC v2 - Format Unclear
```javascript
// We've tried these canonical formats - all return 403 Invalid Signature:
1. `${timestamp}.${nonce}.${body}${pathWithQuery}`
2. `${timestamp}.${nonce}.${pathWithQuery}.${body}`
3. `${timestamp}:${nonce}:${pathWithQuery}:${body}`
4. `${pathWithQuery}:${body}:${timestamp}:${nonce}`

// Worker response
{
  "error": "Signature validation failed",
  "code": "INVALID_SIGNATURE",
  "details": {
    "version_checked": "none",
    "timestamp_valid": true,
    "nonce_valid": true
  },
  "rollout_info": {
    "dualSignatureEnabled": true,
    "acceptsV1": true,
    "acceptsV2": true
  }
}
```

**Question for Worker Team**: What is the correct canonical string format for HMAC v2?

## 2. Endpoint Availability

### ❌ Chat Plan Endpoints - Not Found
```bash
# Request
POST http://localhost:8081/v1/chat-plan
Headers: Valid HMAC v1 signature + timestamp + nonce
Body: {
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "projectId": "456e7890-e89b-12d3-a456-426614174001",
  "message": "How do I add a dark mode toggle?",
  "locale": "en",
  "context": {}
}

# Response
403 Forbidden - Signature validation failed
```

### Endpoints We Need
1. **POST** `/v1/chat-plan` - Send chat message for AI planning
2. **GET** `/v1/chat-plan/stream` - SSE streaming for real-time responses
3. **POST** `/v1/chat-plan/convert` - Convert plan to build
4. **GET** `/v1/projects/{id}/timeline` - Fetch project timeline

**Question for Worker Team**: Are these endpoints deployed? If not, what's the timeline?

## 3. Test Environment

### Configuration
```env
WORKER_BASE_URL=http://localhost:8081
WORKER_SHARED_SECRET=REDACTED
```

### Test Scripts Available
We've created test scripts to help diagnose:

```bash
# Test v1 authentication (working)
node test-v1-update.js

# Test chat plan endpoint
node test-chat-plan.js

# Test worker authentication with detailed output
node test-worker-auth.js
```

## 4. What We Need From Worker Team

### Immediate Needs
1. **HMAC v2 Canonical Format**: Please provide the exact format for the canonical string
   - Order of elements?
   - Separators (dots, colons, none)?
   - Example: `timestamp.nonce.method.path.body` or something else?

2. **Chat Plan Endpoint Status**:
   - Is `/v1/chat-plan` deployed?
   - If not, when will it be available?
   - Are there any alternative endpoints we should use?

### Documentation Requests
1. Example of a working HMAC v2 signature generation
2. List of all available Chat Plan Mode endpoints
3. Expected request/response formats for each endpoint
4. Any special headers or parameters required

## 5. Our Implementation Status

### ✅ Completed (Frontend)
- All UI components for Chat Plan Mode
- API routes ready to proxy to Worker
- React Query hooks for data fetching
- SSE streaming client implementation
- Full i18n support (9 locales)
- TypeScript types for all responses

### 🔄 Blocked
- Cannot test end-to-end flow without working endpoints
- Cannot verify SSE streaming implementation
- Cannot test plan-to-build conversion

## 6. Proposed Next Steps

1. **Worker Team**: Provide HMAC v2 canonical format documentation
2. **Worker Team**: Confirm `/v1/chat-plan` endpoint availability or timeline
3. **Frontend Team**: Update HMAC v2 implementation once format is confirmed
4. **Both Teams**: Joint testing session once endpoints are available

## 7. Contact Information

**Frontend Team Lead**: [Your Name]
**Slack Channel**: #frontend-worker-integration
**This Report Location**: `/WORKER_TEAM_DIAGNOSTIC_REPORT.md`

## Appendix A: Sample Test Output

### Successful v1 Authentication
```bash
$ node test-v1-update.js
🔐 Testing v1 with update project
Path: /v1/update-project
Signature v1: 89e5fc88ada3dbf3436d22ea7cc3b59eac70beffbed54d02d6807c40b8f1dd1b
Response status: 402
Response: {"error":"insufficient_ai_time","message":"Insufficient AI time balance to start update","balance":null,"required":180}
✅ V1 signature is valid! (got balance error, not auth error)
```

### Failed Chat Plan Request
```bash
$ node test-chat-plan.js
🚀 Testing Chat Plan API...
Response status: 500
Response: {"error":"WORKER_API_ERROR","message":"HTTP 403","code":500}
```

## Appendix B: Code Samples

### Our Current Implementation
```typescript
// src/server/services/worker-api-client.ts
async request<T>(pathWithQuery: string, options: WorkerRequestOptions = {}): Promise<T> {
  const body = options.body || '';

  // Currently using v1 only due to v2 format issues
  const signatureV1 = generateWorkerSignatureV1(body.toString(), pathWithQuery);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  const response = await fetch(`${this.baseUrl}${pathWithQuery}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': signatureV1,
      'x-sheen-timestamp': timestamp.toString(),
      'x-sheen-nonce': nonce,
      'x-sheen-locale': locale,
      ...options.headers,
    },
  });

  // Handle response...
}
```

### Expected Chat Plan Response Format
```typescript
interface ChatPlanResponse {
  mode: 'question' | 'feature' | 'fix' | 'analysis' | 'general';
  session_id: string;

  // Mode-specific data
  question_response?: {
    answer: string;
    code_references?: Array<{
      file: string;
      line_start: number;
      line_end: number;
      snippet: string;
    }>;
    related_questions?: string[];
  };

  feature_plan?: {
    description: string;
    steps: string[];
    acceptance_criteria: string[];
    estimated_time_minutes: number;
    complexity: 'simple' | 'moderate' | 'complex';
    feasibility: 'easy' | 'moderate' | 'challenging';
  };

  // ... other mode-specific fields

  metadata: {
    billed_seconds: number;
    tokens_used: number;
    model_used: string;
  };
}
```

---

**Please respond with**:
1. HMAC v2 canonical string format
2. Timeline for `/v1/chat-plan` endpoint availability
3. Any corrections to our implementation approach

Thank you for your assistance in completing this integration!
