# Server Locale Utils Migration Plan

**Status**: Ready for Implementation  
**Created**: August 2025  
**Priority**: High Impact Optimization  

## **📋 Overview**

This document outlines the migration plan for adopting `server-locale-utils` across the codebase to standardize locale detection and eliminate duplicate code patterns.

### **🎯 Background**

Currently implemented robust locale detection utility (`/src/lib/server-locale-utils.ts`) as part of the advisor system internationalization fix. The utility provides:

- **Smart context detection**: Works in API routes, server actions, and page components
- **4-tier priority system**: Explicit locale → `x-sheen-locale` header → `Accept-Language` → 'en' fallback
- **Full BCP-47 support**: Preserves regional variants (`ar-eg`, `fr-ma`, etc.)
- **Type-safe**: Proper integration with `@/i18n/config` locale types

### **🔍 Current State Analysis**

**Duplicate Patterns Found**: ~15-20 files with manual locale parsing  
**Lines of Duplicate Code**: ~50-100 lines  
**Primary Issues**:
- Inconsistent locale detection logic across API routes
- Hardcoded 'en' fallbacks missing browser preference detection
- Complex custom parsing logic in worker API client
- No standardized error handling for locale detection

---

## **🎯 Migration Candidates**

### **1. HIGH PRIORITY** (Big impact, easy migration)

#### **A) Persistent Chat API Routes** (6-8 files)
**Impact**: High - Most duplicated code  
**Effort**: Low - Simple find-and-replace

**Current Pattern** (duplicated across 6 files):
```typescript
// Every persistent chat route has this duplicated pattern:
const acceptLanguage = request.headers.get('accept-language')
const locale = parseLocale(acceptLanguage) || 'en'
```

**Target Files**:
- `/api/persistent-chat/messages/route.ts`
- `/api/persistent-chat/stream/route.ts`
- `/api/persistent-chat/read/route.ts`
- `/api/persistent-chat/search/route.ts`
- `/api/persistent-chat/presence/route.ts`
- `/api/persistent-chat/unified/route.ts`

**Migration**:
```typescript
// Before (~5 lines per file)
const acceptLanguage = request.headers.get('accept-language')
const locale = parseLocale(acceptLanguage) || 'en'

// After (1 line per file)
import { getLocaleFromRequest } from '@/lib/server-locale-utils'
const locale = await getLocaleFromRequest(request)
```

**Benefits**:
- ✅ Remove ~30 lines of duplicate code
- ✅ Better fallback logic (browser preferences vs hardcoded 'en')
- ✅ Consistent locale detection across all chat features

---

#### **B) Worker API Client** (`/server/services/worker-api-client.ts`)
**Impact**: High - Central service affecting many features  
**Effort**: Medium - Replace custom logic

**Current Pattern**:
```typescript
// Has its own complex locale detection logic (~30+ lines)
private async getCurrentLocale(): Promise<string> {
  // Custom cookie parsing
  // Custom header parsing  
  // Custom fallback logic
}
```

**Migration**:
```typescript
// Replace entire method with:
import { detectServerLocale } from '@/lib/server-locale-utils'

private async getCurrentLocale(): Promise<string> {
  const locale = await detectServerLocale()
  return locale
}
```

**Benefits**:
- ✅ Replace 30+ lines of custom logic with 2 lines
- ✅ Get full BCP-47 support (`ar-eg` instead of just `ar`)
- ✅ Consistent behavior with rest of application
- ✅ Better error handling and logging

---

#### **C) Auth API Routes** (4 files)
**Impact**: Medium - Better UX for international users  
**Effort**: Low - Simple parameter replacement

**Current Pattern**:
```typescript
// Manual hardcoded fallbacks
const locale = url.searchParams.get('locale') ?? 'en'
const locale = String(form.get('locale') ?? 'en')
```

**Target Files**:
- `/api/auth/sign-up/route.ts`
- `/api/auth/oauth/start/route.ts`
- `/api/auth/sign-in/route.ts`
- `/auth/confirm/route.ts`

**Migration**:
```typescript
// Before
const locale = url.searchParams.get('locale') ?? 'en'

// After  
import { detectServerLocale } from '@/lib/server-locale-utils'
const explicitLocale = url.searchParams.get('locale')
const locale = await detectServerLocale(explicitLocale, request)
```

**Benefits**:
- ✅ Smart fallback to browser preferences instead of always 'en'
- ✅ Better auth experience for non-English users
- ✅ Consistent locale handling across auth flow

---

### **2. MEDIUM PRIORITY** (Good cleanup)

#### **D) Billing API Routes** (2 files)
**Impact**: Medium - Better billing locale consistency  
**Effort**: Low

**Current Pattern**:
```typescript
// Manual header parsing
const rawLocale = request.headers.get('x-locale') || 
                 request.headers.get('x-sheen-locale') || 'en';
```

**Target Files**:
- `/api/billing/portal/route.ts`
- `/api/billing/checkout/route.ts`

**Benefits**:
- ✅ Consistent with billing locale preferences
- ✅ Proper currency/region detection

---

#### **E) Chat Plan API Routes** (4-5 files)
**Impact**: Medium - Better AI responses in user's language  
**Effort**: Low

**Target Files**:
- `/api/chat-plan/stream/route.ts`
- `/api/chat-plan/convert-to-build/route.ts`
- `/api/chat-plan/message/route.ts`

**Benefits**:
- ✅ AI responses match user's language preference
- ✅ Consistent locale handling for AI features

---

### **3. LOW PRIORITY** (Future enhancement)

#### **F) Client-Side Hooks**
**Impact**: Low - Would need client-safe version  
**Effort**: High - Requires new client-safe utility

**Current Pattern**:
```typescript
// src/hooks/use-billing-query.ts
'x-sheen-locale': document.documentElement.lang || 'en'
```

**Note**: Would require creating a client-safe version of locale detection

---

## **📊 Implementation Plan**

### **Phase 1: High-Impact Quick Wins**
**Estimated Effort**: 2-3 hours  
**Files**: 10-12 files  

1. **Persistent Chat Routes** (30 minutes)
   - Simple find-and-replace across 6 files
   - Test one route thoroughly, batch update the rest

2. **Auth Routes** (45 minutes)
   - Update 4 auth-related files
   - Test auth flow with different browser languages

3. **Worker API Client** (60 minutes)
   - Replace custom `getCurrentLocale()` method
   - Test worker API calls with different locales

### **Phase 2: Cleanup & Consistency**
**Estimated Effort**: 1-2 hours  
**Files**: 4-6 files

4. **Billing Routes** (30 minutes)
5. **Chat Plan Routes** (45 minutes)

### **Phase 3: Testing & Validation**
**Estimated Effort**: 1 hour

6. **Integration Testing**
   - Test with different browser language settings
   - Verify Arabic/French users get proper responses
   - Confirm fallback behavior works correctly

---

## **🧪 Testing Strategy**

### **Manual Testing Scenarios**:

1. **Browser Language Tests**:
   - Set browser to `ar-EG` → Should detect `ar-eg`
   - Set browser to `fr-FR` → Should detect `fr` (closest match)
   - Set browser to `zh-CN` → Should fallback to `en`

2. **Header Override Tests**:
   - Send `x-sheen-locale: fr-ma` → Should use `fr-ma`
   - Send malformed locale → Should fallback gracefully

3. **API Route Tests**:
   - Persistent chat with different locales
   - Auth flow in different languages
   - Worker API responses in correct language

### **Automated Testing**:
```typescript
// Example test cases
describe('server-locale-utils migration', () => {
  test('persistent chat routes use consistent locale detection')
  test('worker API client respects BCP-47 locales') 
  test('auth routes fallback to browser preferences')
})
```

---

## **🎯 Success Metrics**

### **Quantitative**:
- ✅ **Code Reduction**: Remove 50-100 lines of duplicate locale parsing
- ✅ **File Count**: Standardize locale detection in 15-20 files
- ✅ **Performance**: No performance impact (same or better)

### **Qualitative**:
- ✅ **Consistency**: All API routes use same locale detection logic
- ✅ **Maintainability**: Single place to update locale detection behavior
- ✅ **User Experience**: Better fallback behavior for international users
- ✅ **Developer Experience**: Clear, documented locale detection patterns

---

## **⚠️ Risks & Mitigations**

### **Risk 1**: Breaking existing locale detection
**Mitigation**: Thorough testing with existing locale patterns before migration

### **Risk 2**: Performance impact from `await headers()`
**Mitigation**: Current patterns already use headers, no additional overhead

### **Risk 3**: Edge cases in locale parsing
**Mitigation**: Comprehensive test suite covering edge cases and fallbacks

---

## **🚀 Next Steps**

### **Immediate Actions**:
1. **Review & Approve**: Get team approval for migration plan
2. **Schedule Work**: Plan Phase 1 implementation
3. **Test Setup**: Create test environment for locale testing

### **Implementation Order**:
1. Start with **Persistent Chat Routes** (biggest impact, lowest risk)
2. Move to **Worker API Client** (central service)
3. Complete **Auth Routes** (user-facing improvements)
4. Clean up remaining files in phases 2-3

---

## **📚 References**

- **Implementation**: `/src/lib/server-locale-utils.ts`
- **Usage Examples**: Advisor system implementation
- **Locale Config**: `/src/i18n/config.ts`
- **Current Patterns**: Search codebase for `parseLocale`, `Accept-Language`

---

**Ready for Implementation** ✅  
**Next Action**: Schedule Phase 1 migration work