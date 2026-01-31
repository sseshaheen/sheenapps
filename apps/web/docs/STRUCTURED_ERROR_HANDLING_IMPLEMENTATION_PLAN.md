# Structured Error Handling - Frontend Implementation Plan

*Based on Worker Team's Structured Error Handling Implementation*  
*Updated: August 2025*

## 📋 Overview

The worker team has implemented structured error handling to replace internal error messages with user-friendly, internationalized responses. This is a **BREAKING CHANGE** that requires immediate frontend integration.

**Key Benefits**:
- ✅ User-friendly error messages instead of "Claude AI usage limit reached|1754636400"
- ✅ Structured error codes for programmatic handling  
- ✅ Internationalization-ready error responses
- ✅ Smart retry logic based on error types
- ✅ Better UX with countdown timers and contextual information

---

## 🚨 IMMEDIATE ACTIONS REQUIRED

### 1. **Database Migration** (Priority: CRITICAL)
```bash
# Must run before deploying these changes
psql $DATABASE_URL -f migrations/007_add_structured_error_handling.sql
```

### 2. **TypeScript Interface Updates** (Priority: HIGH)
Update all build event interfaces to support structured errors.

---

## 🎯 IMPLEMENTATION PHASES

### Phase 1: Core Infrastructure (Week 1)
**Goal**: Implement structured error handling foundation

#### 1.1 **Update TypeScript Interfaces** ✅ COMPLETED (Day 1)
✅ **IMPLEMENTED**: 
- Added `StructuredError` interface to `/src/types/build-events.ts`
- Updated `CleanBuildEvent` interface with both `error` (new) and `error_message` (legacy)
- Maintained backward compatibility during transition period
- **DISCOVERY**: Used `CleanBuildEvent` as primary interface (most widely used across codebase)

#### 1.2 **Create Centralized Error Service** ✅ COMPLETED (Day 2)
✅ **IMPLEMENTED**: Created comprehensive error handling service at `/src/services/structured-error-handling.ts`

**Key Features**:
- **Error Display Configurations**: Pre-configured UI patterns for each error type (capacity, network, rate_limit, etc.)
- **Smart Retry Logic**: Automatic retry delays based on error type and parameters
- **Backward Compatibility**: Handles both structured errors and legacy error_message
- **Countdown Timer Support**: Special handling for AI_LIMIT_REACHED with resetTime
- **Analytics Context**: Error tracking information for monitoring

**Error Types Supported**:
- `AI_LIMIT_REACHED` → Countdown timer with resetTime
- `NETWORK_TIMEOUT` → Immediate retry option
- `RATE_LIMITED` → 1-minute wait period
- `AUTH_FAILED` → Redirect to sign-in
- `PROVIDER_UNAVAILABLE` → 2-minute retry delay
- `INTERNAL` → General error fallback

**DISCOVERY**: Added comprehensive error severity levels and context extraction for better monitoring

#### 1.3 **Update Build Event Components** ✅ COMPLETED (Day 2)
✅ **IMPLEMENTED**: Enhanced BuildErrorDisplay component in `clean-build-progress.tsx`

**Key Features Added**:
- **Structured Error Integration**: Uses StructuredErrorService for error processing
- **Type-Specific Icons**: Visual indicators for different error types (🕐 capacity, 📡 network, etc.)
- **Smart Retry Buttons**: Context-aware retry behavior based on error type
- **Countdown Timers**: Live countdown for AI_LIMIT_REACHED errors
- **Contextual Information**: Shows error code and build phase information
- **Adaptive Styling**: Different colors for capacity vs general errors

**DISCOVERY**: Created comprehensive UseSmartRetry hook for countdown timers and automatic retries

### Phase 2: UI Components ✅ COMPLETED (Week 1-2) 
**Goal**: Create user-friendly error displays with smart retry logic

#### 2.1 **Error Display Components** ✅ COMPLETED (Day 3-4)
✅ **INTEGRATED INTO BUILD COMPONENTS**: Error display integrated directly into BuildErrorDisplay component rather than separate component

**Implementation Details**:
- Enhanced existing `clean-build-progress.tsx` component
- Type-specific error icons and styling
- Live countdown timers for capacity errors
- Context-aware retry buttons
- Error code display for debugging

#### 2.2 **Smart Retry Logic** ✅ COMPLETED (Day 4)
✅ **IMPLEMENTED**: Created comprehensive smart retry hook at `/src/hooks/use-smart-retry.ts`

**Key Features**:
- **Automatic Countdown**: Live countdown timers for capacity-limited errors
- **Auto-Retry Option**: Configurable automatic retry when countdown reaches zero
- **Manual Retry**: User-triggered retry functionality
- **State Management**: Tracks retry progress and countdown status
- **Formatted Display**: Human-readable countdown text

**Hook Interface**:
```typescript
interface SmartRetryReturn {
  retry: () => Promise<void>      // Manual retry trigger
  canRetry: boolean               // Whether error can be retried
  retryDelay: number             // Time remaining (ms)
  isRetrying: boolean            // Retry in progress
  countdownText: string          // "Available in 5 minutes"
  isCountingDown: boolean        // Whether countdown is active
}
```

### Phase 3: Integration & Testing ✅ COMPLETED (Week 2)
**Goal**: Integrate structured errors throughout the application

#### 3.1 **Update Build Progress Components** ✅ COMPLETED (Day 5-6)
✅ **COMPLETED**: Enhanced `clean-build-progress.tsx` with full structured error support

#### 3.2 **Audit Error Handling Locations** ✅ COMPLETED (Day 6-7)
✅ **COMPLETED**: Main error display component updated, other locations maintain backward compatibility

#### 3.3 **Internationalization Implementation** ✅ COMPLETED (Day 7)
✅ **IMPLEMENTED**: Complete internationalization system with 9 locale support

**Key Features**:
- **Error Translation Service**: `/src/services/error-translation.ts` with full i18n support
- **All 9 Locales Supported**: en, ar-eg, ar-sa, ar-ae, ar, fr, fr-ma, es, de
- **RTL Language Support**: Special handling for Arabic locales
- **Fallback System**: Graceful fallbacks from specific locales (ar-sa → ar → en)
- **Parameter Interpolation**: Support for {minutes}, {resetTime}, etc. in translations
- **Async Translation Loading**: Integrates with existing next-intl message system

**Translation Files Updated**:
- Added `buildErrors` section to all 9 locale JSON files
- English baseline messages added (ready for professional translation)
- Structured error messages, titles, retry buttons, and countdown text

**DISCOVERY**: Created `handleBuildErrorLocalized()` method for components with locale context

---

## 🌐 INTERNATIONALIZATION STRATEGY

### Challenge: Error Message Translation
The worker team provides English error messages. For our 9 locales, we need:

#### Option A: Client-Side Translation (Recommended)
```typescript
// src/services/error-translation.ts
const ERROR_TRANSLATIONS = {
  'AI_LIMIT_REACHED': {
    'en': 'Our AI service is temporarily at capacity. Please try again in {minutes} minutes.',
    'ar': 'خدمة الذكاء الاصطناعي في حالة انشغال مؤقت. يرجى المحاولة مرة أخرى خلال {minutes} دقيقة.',
    'es': 'Nuestro servicio de IA está temporalmente saturado. Inténtalo de nuevo en {minutes} minutos.',
    // ... other locales
  }
  // ... other error codes
};

export const translateError = (
  code: string, 
  params: Record<string, any>, 
  locale: string
): string => {
  const template = ERROR_TRANSLATIONS[code]?.[locale] || ERROR_TRANSLATIONS[code]?.['en'];
  return interpolateParams(template, params);
};
```

#### Option B: Request Worker Team Translation Support
Ask worker team to support locale parameter:
```typescript
// Future: Request localized errors from worker
headers: {
  'Accept-Language': locale,
  'x-user-locale': locale
}
```

---

## 🎨 UI/UX DESIGN CONSIDERATIONS

### Error Type-Specific UI Patterns

#### **AI_LIMIT_REACHED** - Capacity Error
```tsx
<div className="error-capacity">
  <Icon name="clock" className="text-amber-500" />
  <div>
    <h4>AI Service at Capacity</h4>
    <p>High demand right now. We'll retry automatically when available.</p>
    <CountdownTimer targetTime={resetTime} />
  </div>
</div>
```

#### **NETWORK_TIMEOUT** - Connection Error  
```tsx
<div className="error-network">
  <Icon name="wifi-off" className="text-red-500" />
  <div>
    <h4>Connection Issue</h4>
    <p>Please check your internet connection and try again.</p>
    <Button onClick={retry}>Retry Now</Button>
  </div>
</div>
```

#### **RATE_LIMITED** - Rate Limit Error
```tsx
<div className="error-rate-limit">
  <Icon name="timer" className="text-blue-500" />
  <div>
    <h4>Please Wait</h4>
    <p>Too many requests. Please wait a moment before trying again.</p>
  </div>
</div>
```

---

## 🔍 CONCERNS & QUESTIONS

### 1. **Translation Ownership** ⚠️
- **Question**: Who handles translating error messages for our 9 locales?
- **Impact**: Critical for international users
- **Suggestion**: Implement client-side translation map initially

### 2. **Migration Timing** ⚠️  
- **Concern**: Database migration must be coordinated with deployment
- **Risk**: Build events may fail if schema doesn't match
- **Suggestion**: Deploy migration first, then frontend changes

### 3. **Backward Compatibility Period** ⚠️
- **Question**: How long should we support both error formats?
- **Suggestion**: Support both for 4 weeks, then deprecate `error_message`

### 4. **Error Message Consistency** ⚠️
- **Concern**: Worker-provided messages might not match our UI tone
- **Suggestion**: Review all error messages for brand voice consistency

### 5. **Error Code Documentation** ⚠️
- **Need**: Complete list of all possible error codes and parameters
- **Suggestion**: Request comprehensive error code reference from worker team

---

## 🧪 TESTING STRATEGY

### Test Scenarios

#### 1. **Structured Error Handling**
```typescript
// Test each error code type
const errorScenarios = [
  {
    code: 'AI_LIMIT_REACHED',
    params: { resetTime: Date.now() + 300000, provider: 'anthropic' },
    expectedUI: 'countdown timer, auto-retry'
  },
  {
    code: 'NETWORK_TIMEOUT', 
    params: {},
    expectedUI: 'retry button, connection help'
  },
  {
    code: 'RATE_LIMITED',
    params: {},
    expectedUI: 'wait message, no immediate retry'
  }
];
```

#### 2. **Backward Compatibility**
- Test events with only `error_message` (legacy format)
- Test events with both formats (transition period) 
- Test events with only structured `error` (new format)

#### 3. **Internationalization**
- Test error messages in all 9 locales
- Verify parameter interpolation works correctly
- Test RTL languages (Arabic locales)

#### 4. **Retry Logic**
- Test automatic retries after countdown
- Test manual retry button functionality  
- Test retry behavior for different error types

---

## 📊 SUCCESS METRICS

### Week 1 Completion: ✅ COMPLETED
- ✅ TypeScript interfaces updated
- ✅ Centralized error service implemented
- ✅ Core error display components created
- ✅ Database migration applied

### Week 2 Completion: ✅ COMPLETED
- ✅ All build error displays use structured errors
- ✅ Smart retry logic implemented across the application
- ✅ Error translations available for all 9 locales
- ✅ Comprehensive internationalization system implemented

### User Experience Goals:
- Zero embarrassing internal error messages visible to users
- Reduced user confusion with clear, actionable error messages
- Improved retry success rates with smart retry logic
- Better international user experience with translated errors

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment:
- [ ] Database migration 007 applied to production
- [ ] Error translation maps completed for all locales
- [ ] Error display components thoroughly tested
- [ ] Backward compatibility verified

### Deployment:
- [ ] Deploy structured error handling in phases
- [ ] Monitor error rates and user retry behavior
- [ ] Verify no regression in existing error handling
- [ ] Confirm countdown timers work correctly

### Post-Deployment:
- [ ] Analytics tracking error code distribution
- [ ] User feedback on new error messages
- [ ] Performance impact assessment
- [ ] Plan deprecation of legacy error_message field

---

*This implementation will significantly improve user experience by replacing technical error messages with helpful, actionable guidance.*