# Next-intl Context Error Diagnostic Report

**Date**: December 18, 2024
**Framework**: Next.js 15.3.3 with App Router
**i18n Library**: next-intl v4.1.0
**Issue**: ✅ **RESOLVED** - Root cause identified and surgically fixed
**Error Digest**: `2328829266` (was caused by root components outside [locale] tree)

---

## 🚨 **Current Error Manifestation**

### **Server Console Output**
```bash
GET /en 200 in 7803ms
GET /ar-eg/ 200 in 11316ms
○ Compiling /_not-found ...
✓ Compiled /_not-found in 916ms (4574 modules)
⨯ [Error: No intl context found. Have you configured the provider? See https://next-intl.dev/docs/usage/configuration#server-client-components] {
  digest: '2328829266'
}
GET /.well-known/appspecific/com.chrome.devtools.json 500 in 1140ms
⨯ [Error: No intl context found. Have you configured the provider? See https://next-intl.dev/docs/usage/configuration#server-client-components] {
  digest: '2328829266'
}
GET /.well-known/appspecific/com.chrome.devtools.json 500 in 28ms
```

### **Error Characteristics**
- **Consistent Digest**: `2328829266` indicates same root cause
- **Timing Correlation**: Errors appear after route compilation
- **Route Pattern**: Affects multiple locales (`/en`, `/ar-eg/`)
- **Additional Routes**: Chrome DevTools well-known endpoint also affected
- **Status**: Still occurring despite comprehensive architecture fixes

---

## 🏗️ **Current Implementation Analysis**

### **✅ Implemented Fixes (December 2024)**

#### **1. Provider Stability Fix**
**File**: `src/app/[locale]/layout.tsx`
```typescript
import { getMessages, setRequestLocale } from 'next-intl/server';

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;

  // EXPERT FIX: Bind request to locale for provider stability
  setRequestLocale(locale);

  const messages = await getMessages({ locale });

  return (
    <html lang={locale} dir={direction}>
      <body>
        <NextIntlProviderWithFallback locale={locale} messages={messages}>
          {/* Provider stack */}
          {children}
          <div id="portal-root" /> {/* Portal container fix */}
        </NextIntlProviderWithFallback>
      </body>
    </html>
  );
}
```

#### **2. ESLint Rules for API Separation**
**File**: `eslint.config.mjs`
```javascript
{
  // Server components: Enforce next-intl/server usage
  files: ["src/app/**/page.tsx", "src/app/**/layout.tsx"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "next-intl",
        importNames: ["useTranslations", "useLocale"],
        message: "Server components must use 'next-intl/server' APIs"
      }]
    }]
  }
}
```

#### **3. Portal Context Boundary Fix**
**File**: `src/components/builder/engagement/celebration-effects.tsx`
```typescript
// Before: createPortal(..., document.body) ❌
// After:
const portalRoot = document.getElementById('portal-root')
return createPortal(component, portalRoot || document.body) ✅
```

#### **4. Middleware Configuration**
**File**: `src/middleware/intl.ts`
```typescript
export const intlMiddleware = createMiddleware({
  ...routing,
  localePrefix: 'as-needed' // Expert recommendation
})
```

### **🔍 Potential Missing Pieces**

Despite implementing all expert recommendations, errors persist. Possible causes:

#### **1. Not-Found Page Context**
Error logs show `○ Compiling /_not-found` before context errors. The `_not-found` page might be:
- Trying to use next-intl hooks without proper provider context
- Being rendered outside the locale layout provider scope
- Missing proper error boundary handling

#### **2. Well-Known Routes**
Chrome DevTools is requesting `/.well-known/appspecific/com.chrome.devtools.json`:
- These routes may bypass middleware locale handling
- Could be hitting components that expect intl context
- May need explicit exclusion from i18n processing

#### **3. Static Route Handling**
Routes without locale prefixes might be:
- Processed by components expecting intl context
- Missing from middleware matcher exclusions
- Triggering context access during static generation

#### **4. Provider Initialization Timing**
Despite `setRequestLocale()`, there might be:
- Race conditions during Next.js compilation
- Context access before provider initialization
- Fast Refresh triggering premature context access

#### **5. Component-Level Context Access**
Some component might be:
- Calling next-intl hooks at module level (import time)
- Using context before provider is ready
- Accessing context in error boundaries or fallback components

---

## 📋 **Current File Structure Analysis**

### **Key Configuration Files**

#### **i18n Configuration**
- `src/i18n/config.ts` - Locale definitions and configuration
- `src/i18n/routing.ts` - next-intl routing setup
- `src/i18n/request.ts` - Request configuration with fallbacks

#### **Middleware Stack**
- `middleware.ts` - Main middleware with auth + i18n
- `src/middleware/intl.ts` - next-intl middleware wrapper

#### **Provider Setup**
- `src/app/[locale]/layout.tsx` - Main locale layout with provider
- `src/components/providers/next-intl-provider-with-fallback.tsx` - Enhanced provider

#### **Critical Components Using next-intl**
- 15+ components importing from 'next-intl'
- All have `'use client'` directives (confirmed)
- Utilities properly structured as client components

### **Middleware Matcher Analysis**
**Current Pattern**: `'/((?!_next|.*\\..*|cdn-cgi).*)'`

**Potential Issues**:
- May not exclude all static routes
- Could be processing well-known routes
- Might miss edge cases in route matching

---

## 🔍 **Diagnostic Questions for Expert**

### **1. Error Source Investigation**
- **Question**: What specific component/code is triggering the context error?
- **Current Challenge**: Error digest `2328829266` doesn't provide stack trace
- **Need**: Method to identify exact component causing context access failure

### **2. Not-Found Page Context**
- **Question**: Should `_not-found` page have access to intl context?
- **Current State**: Appears to be compiled/accessed during route processing
- **Concern**: May be trying to use translations without provider

### **3. Route Exclusion Strategy**
- **Question**: Which routes should be completely excluded from i18n processing?
- **Current Issue**: `.well-known/*` routes causing context errors
- **Options**: Exclude via middleware matcher vs handle gracefully

### **4. Provider Scope Verification**
- **Question**: How to verify that `setRequestLocale()` is actually working?
- **Current Uncertainty**: No visible confirmation that locale binding is effective
- **Need**: Debug method to confirm provider stability

### **5. Context Access Timing**
- **Question**: Are there legitimate scenarios where context access happens before provider init?
- **Current Pattern**: Errors seem to occur during compilation/route processing
- **Concern**: Build-time vs runtime context access

---

## 🛠️ **Debugging Steps Attempted**

### **✅ Completed Verification**
1. **Provider Placement**: ✅ Confirmed in locale layout
2. **setRequestLocale**: ✅ Added to layout with correct API
3. **ESLint Rules**: ✅ Server/client API separation enforced
4. **Portal Containers**: ✅ All portals use provider-scoped container
5. **Component Directives**: ✅ All next-intl components have `'use client'`
6. **Middleware Config**: ✅ Added localePrefix for consistency

### **🔍 Still Need Investigation**
1. **Error Source**: Exact component triggering context error
2. **Route Exclusions**: Whether certain routes need i18n exemption
3. **Provider Timing**: Verification that context is available when needed
4. **Edge Case Routes**: Handling of well-known, not-found, and static routes

---

## 📊 **Environment Information**

### **Dependencies**
```json
{
  "next": "15.3.3",
  "next-intl": "4.1.0",
  "react": "19.0.0"
}
```

### **Configuration**
- **Locales**: 9 total (en, ar-eg, ar-sa, ar-ae, ar, fr, fr-ma, es, de)
- **Default Locale**: en
- **App Router**: ✅ Enabled
- **SSR**: ✅ Enabled with dynamic rendering

### **Build Environment**
- **Platform**: Next.js development server
- **Mode**: Development with Fast Refresh
- **Compilation**: Dynamic compilation on route access

---

## 🎯 **Expert Questions**

### **Priority 1: Error Source**
1. How can we identify which specific component is calling next-intl hooks and causing the context error?
2. Is there a way to get a stack trace from the `2328829266` digest?

### **Priority 2: Route Handling**
3. Should routes like `/_not-found` and `/.well-known/*` have access to intl context?
4. What's the correct middleware matcher pattern to exclude problematic routes?

### **Priority 3: Provider Verification**
5. How can we verify that `setRequestLocale()` is working correctly?
6. Are there additional provider configuration steps we're missing?

### **Priority 4: Architecture Validation**
7. Is our current provider setup in the locale layout the correct approach?
8. Are there Next.js 15 + next-intl v4.1.0 specific gotchas we should know about?

---

## 📝 **Reproduction Steps**

1. Start development server: `npm run dev:safe`
2. Navigate to any locale route (e.g., `/en`, `/ar-eg`)
3. Observe server console for context errors
4. Errors appear after route compilation completes
5. Consistent `digest: '2328829266'` across all occurrences

---

## 🎉 **Final Resolution (August 18, 2025)**

### **✅ Root Cause Identified by Expert**

The persistent `digest: '2328829266'` errors were caused by **components outside the `[locale]` tree** attempting to use next-intl without a provider:

1. **Root `not-found.tsx`**: Was importing `Link` from `@/i18n/routing` (which uses next-intl internally)
2. **Chrome DevTools Requests**: `/.well-known/appspecific/com.chrome.devtools.json` hitting app router and triggering components with next-intl

### **🔧 Surgical Fixes Applied**

#### **1. Intl-Free Root Fallbacks**
```typescript
// ✅ src/app/not-found.tsx - ROOT (intl-free)
export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>404</h1>
          <p>Page not found.</p>
          <a href="/en">Go Home</a> {/* Plain anchor, not next-intl Link */}
        </main>
      </body>
    </html>
  );
}

// ✅ src/app/error.tsx - ROOT (intl-free)
'use client'
export default function RootError({error}) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <pre>{error.message}</pre>
        </main>
      </body>
    </html>
  );
}
```

#### **2. Localized Versions (Can Use next-intl)**
```typescript
// ✅ src/app/[locale]/not-found.tsx - LOCALIZED (can use next-intl)
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'

export default async function LocalizedNotFound() {
  const t = await getTranslations('errors')
  return (
    <div>
      <h1>{t('404.title')}</h1>
      <Link href="/">{t('404.goHome')}</Link>
    </div>
  )
}
```

#### **3. Static Well-Known Files**
```bash
# ✅ Moved to static serving (bypasses app router)
public/.well-known/appspecific/com.chrome.devtools.json
```

#### **4. Tightened Middleware Matcher**
```typescript
// ✅ Exclude system routes from i18n processing
export const config = {
  matcher: [
    '/((?!_next|api|.*\\..*|favicon.ico|robots.txt|sitemap.xml|opengraph-image|icon|apple-icon|manifest.webmanifest|\\.well-known|cdn-cgi).*)'
  ]
};
```

### **🏗️ Architecture Pattern**

The solution implements clean separation:

- **Root fallbacks** (`app/not-found.tsx`, `app/error.tsx`): Never use intl, handle non-localized routes
- **Localized fallbacks** (`app/[locale]/not-found.tsx`, `app/[locale]/error.tsx`): Inside provider scope, can use intl freely
- **System routes** (`.well-known/*`, `api/*`, static assets): Excluded from middleware or served statically

### **🎯 Verification Results**

#### **Grep Audits (All Pass)**
```bash
# ✅ No next-intl imports outside [locale] directory
rg -n "from 'next-intl" src/app | rg -v "app/\[locale]/"
# Result: Clean

# ✅ No server API imports in root special files
rg -n "from 'next-intl/server'" src/app/{not-found,error,global-error}.tsx
# Result: Clean

# ✅ No portals directly to document.body
rg -n "createPortal.*document\.body" src/
# Result: Clean - all use #portal-root
```

#### **Architecture Verification**
- **Root Layout**: ✅ Intl-free (only metadata and basic HTML structure)
- **Portal Targets**: ✅ All use `#portal-root` inside provider scope
- **Middleware Exclusions**: ✅ System routes properly excluded
- **Provider Stability**: ✅ `setRequestLocale()` implemented in [locale]/layout.tsx

### **📊 Expected Outcome**

**Zero "No intl context found" errors** because:

1. **Non-localized routes** (`/this/does/not/exist`) → Root fallbacks (intl-free)
2. **Chrome DevTools requests** (`/.well-known/*`) → Static files (bypass app router)
3. **Localized routes** (`/en/this/does/not/exist`) → Localized fallbacks (inside provider scope)

### **🔍 Post-Fix Validation**

The expert recommended these verification steps:

#### **Dev Server Test**
- ✅ Visit `/en` and `/ar-eg` → No server errors
- ✅ Hit `/.well-known/appspecific/com.chrome.devtools.json` → Served statically (200), no intl logs

#### **Force Not-Found Test**
- ✅ Visit `/en/this/does/not/exist` → Localized 404 rendered (no errors)
- ✅ Visit `/this/does/not/exist` (no locale) → Root 404 rendered (no intl, no errors)

#### **Architecture Audit**
- ✅ No next-intl imports in root special files
- ✅ Static `.well-known` files served from `public/`
- ✅ All portals use provider-scoped container

### **💡 Key Learnings**

1. **Context Boundary Issues**: Next-intl context only exists within the `[locale]` tree
2. **System Route Conflicts**: Well-known and static routes can trigger app router components
3. **Middleware Scope**: Overly broad matchers can process routes that shouldn't use i18n
4. **Root vs Localized Fallbacks**: Need separate fallback strategies for different route patterns

**Result**: "Boring and correct" i18n architecture achieved - errors eliminated through proper separation of concerns rather than complex workarounds.
