# Server-Side Auth Architecture Plan for SheenApps

## Overview
This document outlines the plan to migrate from client-side Supabase authentication to a complete server-side auth architecture, eliminating CORS errors and improving security.

## Analysis of Current Implementation

### What We Have:
1. **Server Actions** (`auth-actions.ts`): Already using server actions for login, signup, password reset
2. **Middleware Auth**: Robust middleware handling auth checks, protected routes, and cookie management
3. **Supabase SSR**: Using `@supabase/ssr` with proper cookie handling
4. **Rate Limiting**: Already implemented in middleware
5. **Security Headers**: CSP, XSS protection, etc. already in place

### What's Missing:
1. **Token Refresh**: Still happening client-side (causing CORS errors)
2. **Service Role Key**: Not using admin SDK for revocation
3. **Session Endpoint**: No `/api/auth/me` for client to check auth status
4. **Cookie Optimization**: Using default Supabase cookie names
5. **CSRF Protection**: Not implemented for state-changing operations

## Current Issues
- Browser making direct calls to `https://dpnvqzrchxudbmxlofii.supabase.co/auth/v1/token`
- CORS errors: "Fetch API cannot load... due to access control checks"
- Tokens visible in browser network tab
- Unnecessary refresh attempts with invalid tokens
- No guard logic to check for cookies before attempting refresh

## Revised Implementation Plan (Leveraging Existing Code)

### Phase 1: API Routes (New - Priority High)

Since we already use Server Actions, we'll create minimal API routes for client-side needs:

#### `/api/auth/me` 
- **GET**: Get current user information
  - Check httpOnly cookies for tokens
  - Validate session with Supabase
  - Return user data (no tokens)
  - Single purpose: identity check only
  - Set cache headers: `Cache-Control: private, max-age=0, must-revalidate`

#### `/api/auth/refresh`
- **POST**: Refresh authentication tokens
  - Only attempt if refresh token cookie exists
  - Handle token rotation server-side
  - Update httpOnly cookies with new tokens
  - Clear cookies and force re-login on failure (no multiple retries)

**Note**: We already have login via Server Actions (`signInWithPassword`, `signInWithOAuth`), so no need for `/api/auth/login`

#### `/api/auth/logout`
- **POST**: Sign out user
  - Use Service Role Key for admin operations
  - Call `supabase.auth.admin.signOut(userId)` to revoke all sessions
  - Clear all auth cookies
  - Support global scope for complete revocation
  - Ensure refresh tokens cannot be reused

```typescript
// Logout implementation with admin revocation
export async function POST(request: Request) {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  
  const { userId } = await getUserFromCookies()
  
  // Revoke all sessions for this user
  await supabaseAdmin.auth.admin.signOut(userId, 'global')
  
  // Clear cookies
  clearAuthCookies()
  
  return NextResponse.json({ success: true })
}
```

#### Standardized Error Responses
```typescript
interface ErrorResponse {
  error: {
    code: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'BAD_REQUEST'
    status: 401 | 429 | 500 | 400
    message: string
    details?: any
  }
}
```

### Phase 2: Enhance Existing Auth Infrastructure

#### 1. Add Service Role Key Support

Update `lib/supabase.ts` to add admin client:

```typescript
// 🔐 Admin client for server-side operations
export const createAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
  }
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

#### 2. Environment Variables
```typescript
// Server-only (never exposed to client)
SUPABASE_SERVICE_ROLE_KEY  // For admin operations in API routes

// Client-safe (can be exposed)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  // Only for public operations
```

**Important**: Use Service Role Key in `/api/auth/*` handlers for:
- Token revocation
- Admin operations
- Secure session management

#### 3. Update Middleware Cookie Handling

Our middleware already handles Supabase cookies well, but we'll add:
- Cookie existence check before attempting refresh
- Better error handling for invalid tokens

#### 4. Cookie Configuration
```typescript
// Example cookie setting in API route
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 1 week
  expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000), // For older browsers
  ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }) // e.g., '.example.com'
}

// Option 1: Separate cookies (watch size limits)
cookies().set('sb-access-token', session.access_token, cookieOptions)
cookies().set('sb-refresh-token', session.refresh_token, cookieOptions)

// Option 2: Single combined cookie (recommended for size)
cookies().set('sb-auth', JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at
}), cookieOptions)

// App-specific flags (avoid sb- prefix)
cookies().set('app-has-auth', 'true', {
  ...cookieOptions,
  httpOnly: false // Allow client to check existence
})
```

### Phase 3: Update Client Auth Store (supabase-auth-store.ts)

The main changes needed:
1. Remove direct refresh attempts
2. Add API route calls
3. Handle cookie-based auth state

#### New Client Flow
```typescript
// Instead of: supabase.auth.getSession()
const response = await fetch('/api/auth/me')
const { user, isAuthenticated } = await response.json()

// Instead of: supabase.auth.refreshSession()
const response = await fetch('/api/auth/refresh', { method: 'POST' })

// Handle standardized errors
if (!response.ok) {
  const { error } = await response.json()
  switch (error.code) {
    case 'UNAUTHORIZED':
      // Redirect to login
      break
    case 'RATE_LIMITED':
      // Show rate limit message
      break
    default:
      // Generic error handling
  }
}
```

### 4. Add Guards to Prevent Unnecessary Calls

#### Server-Side Guards Only
```typescript
// In API route handlers
export async function GET(request: Request) {
  const cookieStore = cookies()
  
  // Check for auth cookies before attempting any Supabase calls
  if (!cookieStore.has('sb-access-token')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', status: 401, message: 'No session' } },
      { status: 401 }
    )
  }
  
  // Proceed with Supabase validation...
}
```

#### No Client-Side Cookie Checks Needed
- Server components and middleware handle all auth checks
- Client receives already-validated auth state
- Eliminates race conditions and security issues

#### Simplified Refresh Logic
```typescript
// Server-side refresh handler
export async function POST(request: Request) {
  const cookieStore = cookies()
  
  if (!cookieStore.has('sb-refresh-token')) {
    // Clear all auth cookies and force re-login
    clearAuthCookies()
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', status: 401, message: 'Session expired' } },
      { status: 401 }
    )
  }
  
  try {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      // No retries - clear cookies and force re-login
      clearAuthCookies()
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', status: 401, message: 'Refresh failed' } },
        { status: 401 }
      )
    }
    
    // Update cookies with new tokens
    setAuthCookies(data.session)
    return NextResponse.json({ user: data.user })
  } catch (error) {
    // Single attempt only - no exponential backoff
    clearAuthCookies()
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', status: 500, message: 'Internal error' } },
      { status: 500 }
    )
  }
}
```

### 5. Security Improvements

#### Rate Limiting
- Implement rate limiting on auth endpoints
- Different limits per endpoint:
  - `/api/auth/login`: 5 attempts per minute per IP
  - `/api/auth/refresh`: 10 attempts per minute per user
  - `/api/auth/me`: 30 requests per minute per user
- Use Redis or in-memory store

#### CSRF Protection
- SameSite=Lax cookies provide baseline protection
- Add double-submit CSRF token for enhanced security:

```typescript
// Generate CSRF token
const generateCSRFToken = () => {
  const token = crypto.randomBytes(32).toString('hex')
  cookies().set('app-csrf-token', token, {
    httpOnly: false, // Needs to be readable by JS
    secure: true,
    sameSite: 'strict'
  })
  return token
}

// Validate CSRF token in POST handlers
export async function POST(request: Request) {
  const cookieToken = cookies().get('app-csrf-token')?.value
  const headerToken = request.headers.get('X-CSRF-Token')
  
  if (!cookieToken || cookieToken !== headerToken) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', status: 400, message: 'Invalid CSRF token' } },
      { status: 400 }
    )
  }
  
  // Continue with request...
}
```

- Also validate `Origin` header matches expected domain
- Apply to all state-changing endpoints (`/refresh`, `/logout`, `/login`)

#### Audit Logging
```typescript
// Log all auth events
interface AuthEvent {
  type: 'login' | 'logout' | 'refresh' | 'failed_attempt'
  userId?: string
  ip: string
  userAgent: string
  timestamp: Date
  success: boolean
  error?: string
}
```

## Benefits

### Security
- No tokens in localStorage or accessible via JS
- No direct client → Supabase communication
- CSRF protection built-in
- Rate limiting prevents abuse

### Performance
- Fewer unnecessary network requests
- No CORS preflight requests
- Server-side caching opportunities
- Reduced client bundle size

### User Experience
- No more auth refresh loops
- Faster page loads
- Silent token refresh
- Better error handling

## Implementation Progress

### ✅ Completed
1. **Phase 1**: API Routes
   - ✅ Created `/api/auth/me` - Returns user info with proper cache headers
   - ✅ Created `/api/auth/refresh` - Handles token refresh server-side
   - Both routes check for cookie existence before Supabase calls
   - Proper error handling with standardized responses

2. **Phase 2**: Service Role Key Support
   - ✅ Added `createAdminClient()` to lib/supabase.ts
   - ✅ Created `signOut()` server action with admin token revocation
   - Fallback to regular signOut if Service Role Key not available
   - Clears app-specific cookies on logout

3. **Phase 3**: Client Auth Store Updates
   - ✅ Created new `server-auth-store.ts` that uses API routes
   - ✅ Added `ENABLE_SERVER_AUTH` feature flag
   - ✅ Conditional store export based on feature flag
   - No more direct Supabase auth calls from client
   - Handles session expiry gracefully with user-friendly messages

### ✅ Implementation Complete!

All core functionality has been implemented:
- ✅ API routes for auth (`/api/auth/me`, `/api/auth/refresh`)
- ✅ Service Role Key support for admin operations
- ✅ Client auth store using API routes (no more CORS!)
- ✅ Feature flag for gradual rollout
- ✅ Backward compatibility maintained

### 🔜 Future Enhancements (Optional)
- CSRF protection for server actions
- Rate limiting refinements
- Enhanced audit logging

## Testing Instructions

### To Enable Server-Side Auth:
1. Add to `.env.development` or `.env.local`:
   ```
   NEXT_PUBLIC_ENABLE_SERVER_AUTH=true
   ```

2. Restart the dev server:
   ```bash
   npm run dev:safe
   ```

3. Clear browser cookies and localStorage to test fresh

### What to Test:
1. **No More CORS Errors**: Check Network tab - no direct calls to dpnvqzrchxudbmxlofii.supabase.co
2. **Login Flow**: Should work as before via server actions
3. **Session Persistence**: Refresh page - should maintain auth
4. **Token Refresh**: Leave tab open for extended time - should auto-refresh
5. **Logout**: Should clear all sessions globally

### Monitoring:
- Check browser console for auth logs
- Network tab should show calls to `/api/auth/me` and `/api/auth/refresh`
- No failed refresh token requests

## Rollback Plan

- Feature flag to toggle between old/new auth
- Gradual rollout by user percentage
- Monitor error rates and performance
- Quick revert capability

## Success Metrics

- Zero CORS errors in production
- 50% reduction in auth-related network requests
- No token refresh loops
- Improved Core Web Vitals scores
- Zero security incidents

## Key Differences from Generic Plan

### Leveraging Existing Code:
1. **Keep Server Actions**: We already have working server actions for auth operations
2. **Minimal New Routes**: Only add `/api/auth/me` and `/api/auth/refresh` 
3. **Reuse Middleware**: Our middleware already handles auth well, just needs minor updates
4. **Existing Rate Limiting**: Already implemented in middleware
5. **CSP Headers**: Already configured properly

### SheenApps-Specific Considerations:
1. **Multi-locale Support**: All auth routes must work with our 9 locales
2. **Feature Flags**: Use existing `FEATURE_FLAGS.ENABLE_SUPABASE` for rollout
3. **Logging**: Integrate with existing `logger` utility
4. **Error Messages**: Follow existing `AuthResult` pattern from server actions

## Summary of Key Changes Based on Feedback

1. **Separated Endpoints**: Split `/api/auth/session` into `/api/auth/me` (GET) and `/api/auth/refresh` (POST) for single-purpose clarity
2. **Added Login Endpoint**: Included `/api/auth/login` to complete the auth flow
3. **Standardized Errors**: Added consistent error response format with codes (401, 429, 500)
4. **Cookie Naming**: Use `app-` prefix for app-specific cookies, reserve `sb-` for Supabase
5. **Cookie Compatibility**: Added both `maxAge` and `expires` for older browser support
6. **Domain Handling**: Added optional domain configuration for cross-subdomain scenarios
7. **Server-Only Guards**: Removed client-side cookie checks - all validation happens server-side
8. **No Retry Logic**: Server-side refresh attempts once only, then forces re-login
9. **Endpoint-Specific Rate Limits**: Different limits for login, refresh, and identity checks
10. **Token Revocation**: Logout uses admin API with Service Role Key for complete revocation
11. **Cookie Optimization**: Option to combine tokens into single cookie to avoid size limits
12. **Cache Control**: `/api/auth/me` sets proper cache headers to prevent stale auth
13. **Environment Security**: Service Role Key only in server handlers, never exposed to client
14. **Enhanced CSRF**: Double-submit token pattern + Origin validation for state-changing endpoints
15. **ISR/SSG Safety**: Revalidate paths on auth changes to prevent stale cached pages

## SSR/SSG Integration

### Server-Side Rendering (SSR)
```typescript
// In getServerSideProps, call auth logic directly
export async function getServerSideProps({ req, res }) {
  // Direct function call instead of HTTP request
  const { user, isAuthenticated } = await checkAuthSession(req, res)
  
  if (!isAuthenticated) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
  
  return {
    props: { user }
  }
}
```

### Static Site Generation (SSG) & ISR
- **Critical**: Revalidate pages on login/logout to prevent serving stale HTML
- Use on-demand revalidation when auth state changes:

```typescript
// In login/logout handlers, trigger revalidation
import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  // ... handle login/logout ...
  
  // Revalidate user-specific pages
  revalidatePath('/dashboard')
  revalidatePath('/profile')
  revalidateTag('user-data')
  
  return response
}
```

- **ISR Considerations**:
  - Set short revalidation periods for auth-sensitive pages
  - Use middleware to verify auth before serving ISR pages
  - Consider dynamic rendering for highly personalized content

- **Hybrid Approach**: 
  - Static shell with loading states
  - Client-side auth check fills in user data
  - Prevents wrong user data from being cached

## Graceful UX on Session Expiry

### Client-Side Handling
```typescript
// Auth store error handling
const handleAuthError = (error: ErrorResponse) => {
  if (error.code === 'UNAUTHORIZED') {
    // Clear local state
    clearAuthState()
    
    // Redirect with message
    router.push('/login?message=' + encodeURIComponent('Your session expired, please sign in again'))
  }
}
```

### User-Friendly Messages
- Session expired: "Your session expired, please sign in again"
- Rate limited: "Too many attempts. Please try again in a few minutes"
- Network error: "Connection issue. Please check your internet and try again"

### Progressive Enhancement
- Show loading states during auth checks
- Optimistic UI updates where safe
- Graceful degradation for auth failures