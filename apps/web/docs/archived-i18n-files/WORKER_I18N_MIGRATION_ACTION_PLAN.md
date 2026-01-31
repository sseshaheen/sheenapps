# Worker i18n Migration - Frontend Action Plan

## ✅ Implementation Complete - Ready for Testing

### What We've Implemented (Today)

1. **✅ x-sheen-locale Header** 
   - `WorkerAPIClient` now sends locale header on all requests
   - Converts regional locales to base (ar-eg → ar)
   - Falls back to Accept-Language and cookies

2. **✅ Locale Cookie**
   - Middleware sets `locale` cookie on every request
   - 1-year persistence for user preference
   - Worker can read for fallback detection

3. **✅ Structured Error Handling**
   - Already supports `{ code, params }` format
   - Uses our localized messages, not worker's
   - Graceful fallback during transition

4. **✅ Build Event Formatting**
   - Added translations for all event codes
   - Created `formatBuildEvent()` helper
   - Supports both new and legacy formats

5. **✅ All Translations Added**
   - Error codes in 9 locales
   - Build event codes added to builder.json
   - Parameter interpolation working

# Worker i18n Migration - Frontend Action Plan

## 🚨 Critical Gaps Identified

### 1. **NOT Sending x-sheen-locale Header** ❌
- Worker expects `x-sheen-locale` header for locale detection
- Our `WorkerAPIClient` doesn't send this header
- **Impact**: Worker defaults to English for all requests

### 2. **NOT Setting Locale Cookies** ❌  
- Worker checks cookies as fallback for locale preference
- We don't set any locale cookies when user changes language
- **Impact**: Worker can't persist user's language preference

### 3. **NOT Handling Structured Errors** ⚠️
- Worker sends: `{ code: "AI_LIMIT_REACHED", params: { resetTime, retryAfter }}`
- We expect: `{ message: "Try again in 5 minutes" }`
- **Impact**: Error messages won't display correctly after legacy removal

### 4. **NOT Handling New Event Format** ⚠️
- Worker sends: `{ code: "BUILD_DEPENDENCIES_INSTALLING", params: { step, total, progress }}`
- We expect: `{ message: "Installing dependencies... (2 of 5 steps)" }`
- **Impact**: Build progress won't display after legacy removal

## 📅 Timeline Constraints

- **Week 1** (Current): Worker implements with legacy compatibility
- **Week 2**: We MUST update our handling (THIS WEEK)
- **Week 3**: Worker removes legacy fields - **BREAKING CHANGES**

## 🎯 Required Actions

### Action 1: Update WorkerAPIClient to Send Locale Header

**File**: `/src/services/worker-api-client.ts`

```typescript
// Add locale detection and header
async request<T>(pathWithQuery: string, options: WorkerRequestOptions = {}): Promise<T> {
  // Get current locale (from Next.js context or cookie)
  const locale = this.getCurrentLocale();
  
  const response = await fetch(`${this.baseUrl}${pathWithQuery}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': signature,
      'x-sheen-locale': locale, // ADD THIS
      ...options.headers,
    },
  });
}

private getCurrentLocale(): string {
  // Option 1: From cookies in server context
  if (typeof window === 'undefined') {
    const { cookies } = require('next/headers');
    return cookies().get('locale')?.value || 'en';
  }
  // Option 2: From window location in client
  return window.location.pathname.split('/')[1] || 'en';
}
```

### Action 2: Set Locale Cookie on Language Change

**File**: Create `/src/middleware/locale-cookie.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = pathname.split('/')[1];
  
  const response = NextResponse.next();
  
  // Set locale cookie for worker API
  if (locale && ['en', 'ar', 'fr', 'es', 'de'].includes(locale)) {
    response.cookies.set('locale', locale, {
      httpOnly: false, // Worker needs to read it
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }
  
  return response;
}
```

### Action 3: Update Error Handling for Structured Format

**File**: `/src/services/structured-error-handling.ts`

```typescript
interface WorkerStructuredError {
  code: string;
  params?: Record<string, any>;
  message?: string; // Legacy, will be removed
}

export async function formatWorkerError(
  error: WorkerStructuredError, 
  locale: string
): Promise<LocalizedError> {
  // Use our i18n system to format the error
  const messages = await loadErrorMessages(locale);
  
  // Get localized message using code and params
  const localizedMessage = messages.errors[error.code];
  if (localizedMessage && error.params) {
    return {
      title: messages.titles[error.code],
      message: interpolateParams(localizedMessage, error.params),
      button: messages.buttons[error.code],
      canRetry: RETRYABLE_ERROR_CODES.includes(error.code)
    };
  }
  
  // Fallback to legacy message if available
  if (error.message) {
    return { title: 'Error', message: error.message, canRetry: true };
  }
  
  // Ultimate fallback
  return { 
    title: 'Error', 
    message: messages.errors['INTERNAL_ERROR'], 
    canRetry: true 
  };
}
```

### Action 4: Update Event Stream Handling

**File**: `/src/hooks/use-build-events.ts`

```typescript
interface WorkerBuildEvent {
  type: string;
  code: string;
  params?: {
    step?: number;
    total?: number;
    progress?: number;
    [key: string]: any;
  };
  message?: string; // Legacy, will be removed
}

export function formatBuildEvent(
  event: WorkerBuildEvent,
  locale: string,
  messages: any
): string {
  // Map event codes to our translation keys
  const eventMessages = {
    'BUILD_DEPENDENCIES_INSTALLING': messages.builder?.installingDependencies,
    'BUILD_FRAMEWORK_DETECTING': messages.builder?.detectingFramework,
    'BUILD_CODE_GENERATING': messages.builder?.generatingCode,
    // ... add all event codes
  };
  
  const template = eventMessages[event.code];
  if (template && event.params) {
    // Format with params (e.g., "Step {step} of {total}")
    return interpolateParams(template, event.params);
  }
  
  // Fallback to legacy message
  if (event.message) {
    return event.message;
  }
  
  // Ultimate fallback
  return `${event.type}: ${event.code}`;
}
```

### Action 5: Add Missing Translations for Worker Events

**File**: `/src/messages/en/builder.json`

```json
{
  "installingDependencies": "Installing dependencies... (Step {step} of {total})",
  "detectingFramework": "Detecting framework... (Step {step} of {total})",
  "generatingCode": "Generating code... (Step {step} of {total})",
  "optimizingAssets": "Optimizing assets... (Step {step} of {total})",
  "deployingProject": "Deploying project... (Step {step} of {total})",
  "buildComplete": "Build complete!",
  "buildFailed": "Build failed: {reason}"
}
```

## 🧪 Testing Strategy

### 1. **Mock Worker Responses** (Immediate)
Create mock responses in new format to test our handling:

```typescript
// Test new error format
const mockError = {
  code: 'AI_LIMIT_REACHED',
  params: { resetTime: Date.now() + 300000, retryAfter: 300 }
  // NO message field to simulate Week 3
};

// Test new event format  
const mockEvent = {
  code: 'BUILD_DEPENDENCIES_INSTALLING',
  params: { step: 2, total: 5, progress: 0.4 }
  // NO message field to simulate Week 3
};
```

### 2. **Gradual Rollout**
- Week 1: Deploy with dual handling (code + legacy)
- Week 2: Monitor and fix any issues
- Week 3: Worker removes legacy fields

## 📊 Success Metrics

- [ ] All API calls include `x-sheen-locale` header
- [ ] Locale cookie set on language change
- [ ] Error messages display correctly without legacy field
- [ ] Build events display correctly without legacy field
- [ ] No console errors about missing message fields

## 🔄 Migration Checklist

### Week 1 (This Week) - URGENT
- [ ] Update WorkerAPIClient to send locale header
- [ ] Add middleware to set locale cookie
- [ ] Update error handling for structured format
- [ ] Update event stream handling
- [ ] Add missing translations for worker events
- [ ] Test with mock responses (no legacy fields)

### Week 2 (Next Week) - Testing
- [ ] Deploy changes to staging
- [ ] Test with real worker responses
- [ ] Monitor for any formatting issues
- [ ] Fix any edge cases

### Week 3 - Worker Removes Legacy
- [ ] Verify everything works without legacy fields
- [ ] Monitor error rates
- [ ] Quick fixes if needed

## 🚀 Priority Order

1. **TODAY**: Update WorkerAPIClient (Critical - affects ALL worker calls)
2. **TODAY**: Update error handling (High - user-facing errors)
3. **TOMORROW**: Update event handling (High - build progress display)
4. **TOMORROW**: Set locale cookie (Medium - persistence)
5. **THIS WEEK**: Add translations (Medium - can use fallbacks initially)

## ⚠️ Risk Mitigation

1. **Dual Handling**: Support both old and new formats during transition
2. **Fallbacks**: Always have fallback to English if locale detection fails
3. **Monitoring**: Log when using legacy vs new format
4. **Kill Switch**: Environment flag to force legacy handling if needed

## 📝 Notes for Worker Team

1. **Accept-Language Header**: We'll also send standard Accept-Language for browser compatibility
2. **Regional Variants**: We use regional locales (ar-eg, fr-ma) but understand worker uses base only
3. **ICU Formatting**: We handle all ICU formatting client-side, raw primitives are perfect
4. **Transition Period**: 2 weeks is sufficient for migration