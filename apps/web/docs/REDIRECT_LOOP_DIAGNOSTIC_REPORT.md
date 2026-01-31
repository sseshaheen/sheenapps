# 🚨 Root URL Redirect Loop - Diagnostic Report

## Problem Summary
When accessing `http://localhost:3000/`, the server returns a malformed 308 Permanent Redirect with empty `location` header, causing infinite redirect loops and "too many redirects" errors in browsers.

## Symptoms
- **Browser**: "too many redirects" error when visiting `http://localhost:3000/`
- **curl response**:
  ```
  HTTP/1.1 308 Permanent Redirect
  location: 
  Refresh: 0;url=
  ```
- **Expected**: Should redirect to `/en` (default locale)
- **Working URLs**: `/en`, `/en/dashboard`, etc. work perfectly (200 OK)

## Technical Environment
- **Next.js**: 15.3.3
- **next-intl**: Latest (with createMiddleware)
- **Locale setup**: 9 locales, `localePrefix: 'always'`, `defaultLocale: 'en'`
- **Development mode**: `npm run dev:safe`

## What We've Tried

### 1. Multiple Root Page Implementations
```typescript
// Attempt 1: Server-side redirect
export default function RootPage() {
  redirect('/en');
}

// Attempt 2: permanentRedirect
export default function RootPage() {
  permanentRedirect('/en');
}

// Attempt 3: Client-side redirect
'use client'
export default function RootPage() {
  useEffect(() => router.replace('/en'), []);
  return <div>Redirecting...</div>;
}

// Attempt 4: Meta refresh HTML
export default function RootPage() {
  return (
    <html>
      <head><meta httpEquiv="refresh" content="0;url=/en" /></head>
      <body>Redirecting...</body>
    </html>
  );
}

// Attempt 5: No root page (let intl middleware handle)
// Deleted /src/app/page.tsx entirely
```

**Result**: ALL attempts produce the same malformed 308 redirect.

### 2. Middleware Investigation
- **Intl middleware enabled/disabled**: Same issue with both
- **Middleware logs**: No logs show for `/` requests (they don't reach our middleware)
- **Middleware matcher**: Properly includes root path

### 3. Next.js Configuration
- **Disabled all redirects()**: Commented out entire redirects config
- **Results**: Still same malformed redirect

## Key Observations

### 🔍 The redirect happens BEFORE our code executes
- No server logs for `/` requests in dev server
- Root page component never renders (no compilation logs)
- Same behavior with/without intl middleware
- Same behavior with/without Next.js redirects config

### 🔍 Location header is consistently empty
```bash
< HTTP/1.1 308 Permanent Redirect
< location:          # <- EMPTY!
< Refresh: 0;url=    # <- ALSO EMPTY!
```

### 🔍 Locale-specific URLs work perfectly
```bash
curl -I http://localhost:3000/en
# Returns: HTTP/1.1 200 OK (loads homepage correctly)
```

## Configuration Files

### middleware.ts (Simplified)
```typescript
export async function middleware(request: NextRequest) {
  // ... security headers, API routes handled fine ...
  
  let response = await intlMiddleware(request)  // next-intl middleware
  
  // ... auth redirects work for other routes ...
  
  return response
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*|favicon.ico|robots.txt|sitemap.xml|opengraph-image|icon|apple-icon|manifest.webmanifest|\\.well-known|cdn-cgi).*)']
}
```

### src/middleware-utils/intl.ts
```typescript
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

export const intlMiddleware = createMiddleware({
  ...routing,
  localePrefix: 'always',
  defaultLocale: 'en'
})
```

### src/i18n/routing.ts
```typescript
export const routing = defineRouting({
  locales: ['en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'fr-ma', 'es', 'de'],
  defaultLocale: 'en'
})
```

## Debugging Questions for Expert

1. **Is this a known next-intl issue** with `localePrefix: 'always'` and root URL handling?

2. **Could there be a lower-level redirect** happening in Next.js internals or development server?

3. **Should we be handling root URL differently** with next-intl middleware?

4. **Is the middleware matcher interfering** with intl middleware's ability to handle root URLs?

5. **Could this be a development server specific issue** that won't occur in production?

## Current Workaround
Users can access the site via direct locale URLs (`/en`, `/fr`, etc.), but the root URL is broken.

## Expected Fix
The root URL `/` should redirect to `/en` (or be rewritten internally) and serve the English homepage, just like other next-intl implementations.

---

**Environment**: macOS, Node.js, Next.js development server  
**Urgency**: High - breaks user experience for root URL access  
**Status**: Needs expert diagnosis - issue appears to be at framework/middleware level