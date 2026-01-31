# Authentication Locale Redirect Diagnostic Report

## 🚨 **Issue Summary**

**Problem**: Authentication redirect flow drops locale prefix after successful login
**Current Behavior**: 
1. User visits: `http://localhost:3000/en/builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b` (not logged in)
2. Middleware redirects to: `http://localhost:3000/en/auth/login?returnTo=%2Fbuilder%2Fworkspace%2F1d712582-cb89-4e13-9d16-88d1c2f7422b` 
3. After login success: `http://localhost:3000/builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b?auth_success=true` ❌ **LOCALE DROPPED**

**Expected**: Final redirect should be `http://localhost:3000/en/builder/workspace/...`

---

## 🔍 **Detailed Flow Analysis**

### **Step 1: Initial Request & Middleware Redirect**
```
GET /en/builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b
↓
Middleware detects no auth cookies → redirects to:
/en/auth/login?returnTo=%2Fbuilder%2Fworkspace%2F1d712582-cb89-4e13-9d16-88d1c2f7422b
```

**Issue Identified**: `returnTo` parameter is `/builder/workspace/...` (missing `/en` prefix)

### **Step 2: Login Form Submission**
```
POST /api/auth/sign-in
Form Data:
- email: [user_email]
- password: [user_password] 
- locale: en
- returnTo: /builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b
```

**Issue Confirmed**: `returnTo` value lacks locale prefix

### **Step 3: API Route Redirect**
```
📝 POST /api/auth/sign-in 303 in 1802ms
Location: /builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b?auth_success=true
```

**Root Cause**: API route uses `returnTo` value as-is, which is missing locale

### **Step 4: Final Request**
```
GET /builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b?auth_success=true 404 in 721ms
```

**Result**: 404 because route doesn't exist without locale prefix

---

## 🧐 **Server Console Analysis**

### **Key Logs**
```
📝 WARN: 🔐 Server auth snapshot: Auth error { error: 'Auth session missing!' }
GET /en/builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b 200 in 3757ms
GET /en/auth/login?returnTo=%2Fbuilder%2Fworkspace%2F1d712582-cb89-4e13-9d16-88d1c2f7422b 200 in 1054ms
POST /api/auth/sign-in 303 in 1802ms
GET /builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b?auth_success=true 404 in 721ms
```

### **Critical Observation**
- Middleware redirect preserves `/en` in URL
- But `returnTo` query parameter is **URL-encoded** and **missing locale prefix**
- API route constructs redirect from this malformed `returnTo` parameter

---

## 🔧 **Current Implementation Analysis**

### **Middleware Logic** (`middleware.ts:206`)
```typescript
const loginUrl = new URL(`/${locale}/auth/login`, request.url)
loginUrl.searchParams.set('returnTo', pathname) // ❌ pathname includes locale but...
```

### **Issue**: `pathname` vs Expected Value
- **`pathname`**: `/en/builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b`
- **`returnTo` Set**: `/builder/workspace/1d712582-cb89-4e13-9d16-88d1c2f7422b` (locale stripped)

### **Login Form** (`login-form.tsx:258`)
```typescript
<input type="hidden" name="returnTo" value={returnTo || `/${locale}/dashboard`} />
```

### **API Route** (`/api/auth/sign-in/route.ts:104`)
```typescript
const normalizedReturnTo = returnTo.startsWith('/') ? returnTo : `/${returnTo}`
const redirectTo = new URL(normalizedReturnTo, origin)
```

---

## 🎯 **Root Cause Hypothesis**

### **Primary Theory**: Middleware `returnTo` Parameter Construction Error
The middleware is setting `returnTo` with a value that has the locale stripped out.

**Evidence**:
1. URL shows: `returnTo=%2Fbuilder%2Fworkspace%2F...` (URL-decoded: `/builder/workspace/...`)
2. Should be: `returnTo=%2Fen%2Fbuilder%2Fworkspace%2F...` (URL-decoded: `/en/builder/workspace/...`)

### **Secondary Theory**: `pathname` Processing in Middleware
The middleware may be using an incorrect value for `pathname` or stripping the locale during processing.

---

## 📊 **next-intl Configuration Context**

### **Routing Configuration**
- **Locale Prefix**: `'always'` (confirmed from middleware patterns)
- **Default Locale**: `'en'`
- **All Routes**: Should include locale prefix

### **Middleware Pattern**
```typescript
// Current pattern (line 206):
loginUrl.searchParams.set('returnTo', pathname)

// Expected pattern:
loginUrl.searchParams.set('returnTo', pathname) // pathname should INCLUDE locale
```

---

## 🧪 **Test Cases for Verification**

### **Test 1**: Middleware `pathname` Value Logging
```typescript
// Add to middleware.ts around line 206:
console.log('🔍 MIDDLEWARE DEBUG:', {
  originalPathname: pathname,
  effectivePath,
  locale: detectLocaleFromPath(effectivePath),
  returnToValue: pathname // This is what gets set as returnTo
})
```

### **Test 2**: API Route Input Logging
```typescript
// Add to /api/auth/sign-in/route.ts around line 22:
console.log('🔍 API DEBUG:', {
  returnTo,
  locale,
  normalizedReturnTo,
  finalRedirectUrl: redirectTo.toString()
})
```

---

## 💡 **Expert Questions for Investigation**

1. **Middleware**: Why is `returnTo` parameter missing locale prefix when `pathname` should include it?

2. **next-intl Integration**: Is there a specific pattern for preserving locale in auth redirects with `localePrefix: 'always'`?

3. **URL Construction**: Should the API route be responsible for adding locale prefix, or should middleware provide it?

4. **Alternative Approach**: Should we use `next-intl`'s `redirect()` function in API routes instead of `NextResponse.redirect()`?

---

## 🔧 **Potential Solutions to Investigate**

### **Solution A**: Fix Middleware `returnTo` Construction
```typescript
// In middleware.ts, ensure returnTo includes locale:
loginUrl.searchParams.set('returnTo', effectivePath) // Use effectivePath instead of pathname
```

### **Solution B**: API Route Locale Injection
```typescript
// In API route, ensure locale is preserved:
const returnToWithLocale = returnTo.startsWith(`/${locale}/`) 
  ? returnTo 
  : `/${locale}${returnTo}`
```

### **Solution C**: Use next-intl `redirect()` in API Routes
```typescript
import { redirect } from '@/i18n/routing'
// Instead of NextResponse.redirect, use:
redirect({ href: returnTo, locale })
```

---

## 📁 **Files to Investigate**

1. **`middleware.ts:200-225`** - Middleware redirect logic
2. **`/api/auth/sign-in/route.ts:98-106`** - API redirect construction  
3. **`src/i18n/config.ts`** - next-intl routing configuration
4. **`src/middleware-utils/intl.ts`** - next-intl middleware setup

---

## 🎯 **Immediate Next Steps**

1. **Add Debug Logging**: Insert debug logs in middleware and API route to trace exact values
2. **Verify next-intl Config**: Confirm `localePrefix: 'always'` setting and expected behavior
3. **Test Alternative Approaches**: Try next-intl `redirect()` function in API routes
4. **Check GitHub Issues**: Search next-intl repository for similar auth redirect patterns

---

**Status**: Ready for expert analysis and guided solution implementation
**Priority**: High - affects core authentication user experience
**Impact**: Users get 404 errors after successful login