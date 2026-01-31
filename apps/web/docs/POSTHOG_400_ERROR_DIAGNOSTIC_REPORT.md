# PostHog 400 Bad Request - Diagnostic Report

## Issue Summary
Production PostHog feature flags API consistently returning 400 Bad Request despite proxy route fixes.

**Error Pattern:**
```
POST https://www.sheenapps.com/api/posthog/flags?v=2&config=true&ip=0&_=1755374203454&ver=1.260.1&compression=base64 400 (Bad Request)
```

## Environment Details
- **Domain:** www.sheenapps.com
- **PostHog Version:** 1.260.1  
- **Target:** PostHog EU instance (eu.i.posthog.com)
- **Proxy Route:** `/api/posthog/[...path]/route.ts`
- **Browser:** Chrome 138.0.0.0

## Error Context
- **Endpoint:** `/api/posthog/flags` (feature flags configuration)
- **Required Parameters:** `v=2&config=true&ip=0&compression=base64`
- **Status:** 400 Bad Request (consistently)
- **Working Endpoints:** `/api/posthog/e` (events) return 200 OK
- **Config Endpoint:** `/api/posthog/array/.../config.js` returns 200 OK

## Server Logs Analysis
From production Vercel logs:

### Failing Requests
```csv
TimeUTC,requestPath,responseStatusCode,requestQueryString
2025-08-16 19:42:52,/api/posthog/flags,400,v=2&config=true&ip=0&_=1755373371537&ver=1.260.1&compression=base64
2025-08-16 19:42:40,/api/posthog/flags,400,v=2&config=true&ip=0&_=1755373360446&ver=1.260.1&compression=base64
2025-08-16 19:41:34,/api/posthog/flags,400,v=2&config=true&ip=0&_=1755373294249&ver=1.260.1&compression=base64
```

### Working Requests  
```csv
TimeUTC,requestPath,responseStatusCode
2025-08-16 19:42:56,/api/posthog/e,200
2025-08-16 19:42:51,/api/posthog/e,200
2025-08-16 19:41:37,/api/posthog/e,200
2025-08-16 19:41:34,/api/posthog/array/.../config.js,200
```

## PostHog Configuration

### Client Initialization (instrumentation-client.ts)
```typescript
posthog.init(posthogKey, {
  api_host: '/api/posthog', // Local proxy
  capture_pageview: false,
  disable_external_dependency_loading: true, // Prevents hydration issues
  respect_dnt: true,
  // ... other config
})
```

### Environment Variables
```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_xk3WXrVFInmFvRsMhtombCLVoElDGvebqLnZHgVuW2s
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

## Proxy Route Implementation

### Fixed POST Handler
```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const proxyPath = path.join('/')
  const body = await request.text()
  const searchParams = request.nextUrl.searchParams.toString()
  const url = `https://eu.i.posthog.com/${proxyPath}${searchParams ? `?${searchParams}` : ''}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': request.headers.get('User-Agent') || '',
      },
      body,
    })
    // ... response handling
  } catch (error) {
    console.error('PostHog proxy error:', error)
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 })
  }
}
```

## Attempted Fixes

### ✅ Fixed Query Parameter Bug
- **Issue:** POST requests were missing query parameters
- **Fix:** Added `searchParams` to POST URL construction
- **Result:** Parameters now correctly forwarded to PostHog EU

### ✅ Fixed Hydration Mismatches  
- **Issue:** Remote script loading causing React Error #418
- **Fix:** Added `disable_external_dependency_loading: true`
- **Result:** Hydration errors resolved

### ✅ Fixed DOM Manipulation
- **Issue:** ClientFontLoader replacing CSS classes
- **Fix:** Use `classList.add()` instead of `className` replacement
- **Result:** Class manipulation hydration issues resolved

## Current Hypothesis

### Possible Root Causes

1. **PostHog EU Server Issue**
   - The EU instance (`eu.i.posthog.com`) may have stricter validation
   - Feature flags endpoint may require specific headers/formatting

2. **Request Body/Headers Mismatch**
   - The proxy may not be forwarding all required headers
   - Request body encoding might be incompatible with flags endpoint

3. **PostHog Project Configuration**
   - Feature flags may be disabled for this project
   - Project key may not have flags permissions on EU instance

4. **Content-Type Header Issue**
   - Flags endpoint may require different Content-Type than events endpoint
   - Body compression may be incompatible

## Testing Recommendations

### Direct PostHog EU Test
```bash
# Test direct call to PostHog EU (bypassing proxy)
curl -X POST "https://eu.i.posthog.com/flags?v=2&config=true&ip=0&compression=base64" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 ..." \
  -d '{your_request_body}'
```

### Headers Comparison
Compare working `/e` endpoint vs failing `/flags` endpoint:
- Request headers
- Request body format  
- Content-Type requirements

### PostHog Dashboard Check
1. Go to PostHog EU dashboard: https://eu.i.posthog.com
2. Verify project key: `phc_xk3WXrVFInmFvRsMhtombCLVoElDGvebqLnZHgVuW2s`
3. Check if feature flags are enabled for this project
4. Review API endpoint permissions

## Debug Steps

### 1. Enable Detailed Logging
Add to proxy route:
```typescript
console.log('PostHog proxy request:', {
  method: 'POST',
  path: proxyPath,
  searchParams,
  headers: Object.fromEntries(request.headers.entries()),
  bodyLength: body.length
})
```

### 2. Response Analysis
Log the actual 400 response:
```typescript
if (!response.ok) {
  const errorText = await response.text()
  console.error('PostHog error response:', {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: errorText
  })
}
```

### 3. Header Comparison
Check if flags endpoint needs different headers than events endpoint.

## Next Steps for Expert Review

1. **Verify PostHog EU project settings** - Feature flags enabled?
2. **Test direct API calls** - Does the issue exist without the proxy?
3. **Header analysis** - What headers does `/flags` require vs `/e`?
4. **Request body inspection** - Is the compression/encoding correct?
5. **PostHog version compatibility** - Does v1.260.1 have known issues with EU instance?

## File Locations
- **Proxy Route:** `/src/app/api/posthog/[...path]/route.ts`
- **PostHog Init:** `/instrumentation-client.ts`
- **Config:** `/src/config/analytics-config.ts`
- **Environment:** `/.env.local`

## Additional Context
- Events endpoint (`/e`) works perfectly (200 OK)
- Config endpoint (`/array/.../config.js`) works (200 OK)  
- Only feature flags endpoint (`/flags`) fails consistently (400 Bad Request)
- Issue affects all users, not locale-specific
- Proxy correctly forwards query parameters after fix