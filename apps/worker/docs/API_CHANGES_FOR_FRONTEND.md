# 🚨 CRITICAL API CHANGES - Frontend Integration Required

**Date:** 2025-08-08  
**Version:** Phase 1 - Structured Error Handling Implementation  
**Impact:** BREAKING CHANGE for error handling in build events

## Overview

We've implemented structured error handling to replace embarrassing internal error messages with user-friendly, internationalization-ready error responses. This affects how build events with errors are returned by our APIs.

---

## 🔥 IMMEDIATE ACTION REQUIRED

### Database Migration Required
**Before deploying these changes**, run the database migration:

```bash
# Run migration 007 to add structured error columns
psql $DATABASE_URL -f migrations/007_add_structured_error_handling.sql
```

---

## 📡 API Changes

### 1. Build Events API - `/api/builds/:buildId/events`

#### BEFORE (Old Format)
```json
{
  "buildId": "abc123",
  "events": [
    {
      "id": "456",
      "event_type": "failed",
      "phase": "development",
      "error_message": "Claude AI usage limit reached|1754636400"  // 😱 EMBARRASSING!
    }
  ]
}
```

#### AFTER (New Format) ✅
```json
{
  "buildId": "abc123",
  "events": [
    {
      "id": "456",
      "event_type": "failed", 
      "phase": "development",
      "error": {
        "code": "AI_LIMIT_REACHED",
        "params": {
          "resetTime": 1754636400000,
          "provider": "anthropic"
        },
        "message": "Our AI service is temporarily at capacity. Please try again in 15 minutes."
      },
      "error_message": "Our AI service is temporarily at capacity. Please try again in 15 minutes."  // Legacy field
    }
  ]
}
```

---

## 🛠 Frontend Integration Guide

### TypeScript Interface Updates

```typescript
// NEW: Add this interface
interface StructuredError {
  code: string;                     // Stable error code (AI_LIMIT_REACHED, NETWORK_TIMEOUT, etc.)
  params?: Record<string, any>;     // Context parameters (resetTime, etc.)  
  message?: string;                 // User-friendly message (optional)
}

// UPDATED: UserBuildEvent interface
interface UserBuildEvent {
  id: string;
  build_id: string;
  event_type: 'started' | 'progress' | 'completed' | 'failed';
  phase: 'setup' | 'development' | 'dependencies' | 'build' | 'deploy' | 'metadata';
  title: string;
  description: string;
  overall_progress: number;
  finished: boolean;
  preview_url?: string;
  
  // NEW: Structured error handling
  error?: StructuredError;          // Use this for new error handling
  error_message?: string;           // DEPRECATED: Keep for backward compatibility
  
  created_at: string;
  duration_seconds?: number;
  versionId?: string;
  versionName?: string;
}
```

### Frontend Error Handling Code

```typescript
// NEW: Enhanced error handling function
function handleBuildError(event: UserBuildEvent): void {
  if (event.error) {
    // Use structured error (recommended)
    const { code, params, message } = event.error;
    
    switch (code) {
      case 'AI_LIMIT_REACHED':
        const resetTime = params?.resetTime;
        const minutes = resetTime ? Math.ceil((resetTime - Date.now()) / 60000) : 5;
        
        showErrorMessage(
          message || `AI service at capacity. Try again in ${minutes} minutes.`,
          {
            type: 'capacity',
            retryAfter: resetTime,
            showRetryButton: true
          }
        );
        break;
        
      case 'NETWORK_TIMEOUT':
        showErrorMessage(
          message || 'Network timeout. Please check your connection.',
          { 
            type: 'network',
            showRetryButton: true 
          }
        );
        break;
        
      case 'RATE_LIMITED':
        showErrorMessage(
          message || 'Too many requests. Please wait a moment.',
          { 
            type: 'rate_limit',
            showRetryButton: false 
          }
        );
        break;
        
      default:
        showErrorMessage(
          message || 'An unexpected error occurred.',
          { 
            type: 'general',
            showRetryButton: true 
          }
        );
    }
  } else if (event.error_message) {
    // Fallback to legacy error message
    showErrorMessage(event.error_message, { type: 'general' });
  }
}
```

### Migration Strategy

**Option 1: Immediate Migration (Recommended)**
```typescript
function getErrorMessage(event: UserBuildEvent): string {
  // Prefer structured error message
  if (event.error?.message) {
    return event.error.message;
  }
  
  // Fallback to legacy field
  return event.error_message || 'An error occurred';
}

function isRetryableError(event: UserBuildEvent): boolean {
  if (event.error?.code) {
    return ['AI_LIMIT_REACHED', 'NETWORK_TIMEOUT', 'RATE_LIMITED'].includes(event.error.code);
  }
  return false; // Conservative approach for legacy errors
}
```

**Option 2: Gradual Migration**
```typescript
function handleError(event: UserBuildEvent): void {
  // Check if new structured error exists
  if (event.error) {
    handleStructuredError(event.error);
  } else {
    // Use legacy error handling
    handleLegacyError(event.error_message);
  }
}
```

---

## 🌐 Error Code Reference

### Standard Error Codes

| Code | Description | Retryable | Typical Wait Time |
|------|-------------|-----------|-------------------|
| `AI_LIMIT_REACHED` | AI provider at capacity | Yes | `params.resetTime` or 5-15 min |
| `RATE_LIMITED` | Too many requests | Yes | 1 minute |
| `NETWORK_TIMEOUT` | Network connectivity issue | Yes | 30 seconds |
| `AUTH_FAILED` | Authentication problem | No | Redirect to login |
| `PROVIDER_UNAVAILABLE` | AI service unavailable | Yes | 2 minutes |
| `INTERNAL` | Unexpected system error | Yes | 1 minute |

### Error Parameters

#### `AI_LIMIT_REACHED` params:
```typescript
{
  resetTime: number;        // Epoch timestamp when limit resets
  provider: string;         // AI provider name ('anthropic', 'openai')
  region?: string;          // Provider region ('us-east', 'eu-west')
}
```

#### Usage in UI:
```typescript
if (event.error?.code === 'AI_LIMIT_REACHED') {
  const resetTime = event.error.params?.resetTime;
  const timeUntil = resetTime - Date.now();
  const minutes = Math.ceil(timeUntil / 60000);
  
  showCountdownTimer(resetTime, 'AI service will be available in');
}
```

---

## 🔄 Backward Compatibility

- **`error_message` field**: Still populated for backward compatibility
- **Existing error handling**: Will continue to work but shows less user-friendly messages
- **Migration timeline**: Recommend updating within 2 weeks

---

## 🧪 Testing

### Test Scenarios

1. **AI Limit Error**: Trigger when Claude API hits usage limits
2. **Network Error**: Test with network connectivity issues  
3. **Rate Limit**: Test with rapid API requests
4. **Generic Error**: Test with unexpected system errors

### Test Data Examples

```json
// AI Limit Reached Event
{
  "error": {
    "code": "AI_LIMIT_REACHED",
    "params": {
      "resetTime": 1754636400000,
      "provider": "anthropic"
    },
    "message": "Our AI service is temporarily at capacity. Please try again in 15 minutes."
  }
}

// Network Timeout Event  
{
  "error": {
    "code": "NETWORK_TIMEOUT",
    "message": "Request timed out. Please check your connection and try again."
  }
}
```

---

## 🚀 Deployment Checklist

### Backend Team
- [x] Database migration 007 applied
- [x] New error handling services deployed
- [x] API endpoints updated with structured errors
- [x] Global AI limit service active

### Frontend Team - TODO
- [ ] Update TypeScript interfaces
- [ ] Implement structured error handling
- [ ] Add retry logic for recoverable errors
- [ ] Update error UI components
- [ ] Test with various error scenarios
- [ ] Deploy error handling updates

---

## 🔗 Related APIs

### Other APIs Affected
- `GET /api/builds/:buildId/status` - Also returns structured errors
- Future: All APIs will gradually adopt structured error format

### Monitoring Endpoints (New)
- `GET /system/health/detailed` - Server health with AI limits
- `GET /api/internal/builds/:buildId/events` - Full debug info (internal only)

---

## 📞 Support

**Questions?** Contact the backend team:
- Issues with error codes or parameters
- Need additional error types
- Integration support

**Priority:** This is a critical user experience improvement. The old error messages were embarrassing and exposed internal implementation details.