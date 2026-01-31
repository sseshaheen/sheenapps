# Worker Preview Privacy Features - Implementation Guide

## 🎯 Overview

Enable users to control access to their `preview-*.sheenapps.com` sites with multiple privacy modes while maintaining security and performance.

**Core Features:**
- 🌐 **Public** (default) - Anyone can view, search indexed
- 🔒 **Owner-only** - Requires Supabase authentication  
- 🔑 **Password-protected** - Basic auth with bcrypt verification
- 🔗 **Shared link** - Time-limited JWT access (Phase 2)

**Implementation Timeline:**
- **Phase 1** (MVP): 2-3 weeks - Core privacy modes
- **Phase 2** (Advanced): 4-6 weeks - JWT tokens, enhanced features

---

## 📋 Implementation Checklist

### Phase 1: Core Privacy Features

#### Database & Schema
- [ ] Create migration file: `preview_privacy_support.sql`
- [ ] Add `visibility`, `preview_password_hash`, `preview_password_set_at` columns to projects
- [ ] Add `is_owner`, `count_owner_visits` columns for analytics
- [ ] Create indexes for efficient queries
- [ ] Test migration in staging environment

#### API Endpoints
- [ ] Implement `PATCH /projects/:id/visibility` endpoint
- [ ] Enhance `GET /projects/:id` with privacy fields
- [ ] Add input validation and rate limiting
- [ ] Add paid plan validation for non-public modes
- [ ] Write API tests

#### Worker Logic
- [ ] Implement main access control flow
- [ ] Add password verification with bcrypt
- [ ] Implement owner authentication with Supabase
- [ ] Add cookie-based password persistence
- [ ] Implement privacy headers and caching controls

#### Security & Rate Limiting  
- [ ] Implement subnet-based password attempt limiting
- [ ] Add cookie invalidation on password rotation
- [ ] Implement Supabase token refresh logic
- [ ] Store JWT secrets in Workers Secrets
- [ ] Add security headers for private previews

#### Testing
- [ ] Unit tests for access control logic
- [ ] Integration tests for each privacy mode
- [ ] Security tests for authentication flows
- [ ] Performance tests for fast-path optimizations

### Phase 2: Advanced Features
- [ ] JWT share token generation and verification
- [ ] Enhanced CDN cache controls for token mode
- [ ] Analytics TTL cleanup jobs
- [ ] Advanced rate limiting features
- [ ] Performance monitoring and metrics

---

## 🗃️ Database Implementation

### Migration: `preview_privacy_support.sql`

```sql
-- Core privacy columns
ALTER TABLE projects 
ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' 
  CHECK (visibility IN ('public', 'owner', 'password', 'token'));

ALTER TABLE projects 
ADD COLUMN preview_password_hash TEXT,
ADD COLUMN preview_password_set_at TIMESTAMPTZ,
ADD COLUMN count_owner_visits BOOLEAN DEFAULT TRUE;

-- Performance indexes
CREATE INDEX idx_projects_visibility ON projects(visibility);
CREATE INDEX idx_projects_password_set ON projects(preview_password_set_at) 
  WHERE preview_password_set_at IS NOT NULL;

-- Analytics enhancements
ALTER TABLE preview_analytics 
ADD COLUMN is_owner BOOLEAN DEFAULT FALSE,
ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days');

CREATE INDEX idx_preview_analytics_owner ON preview_analytics(project_id, is_owner, timestamp);
CREATE INDEX idx_preview_analytics_ttl ON preview_analytics(expires_at);
```

### Security Considerations
- `preview_password_hash` uses bcrypt with salt rounds ≥12
- Password hashes never exposed via API responses
- Only project owners can modify visibility settings via RLS

---

## 🔌 API Implementation

### PATCH /projects/:id/visibility

Update project privacy settings with proper authorization and validation.

```typescript
// src/routes/projects/visibility.ts
import bcrypt from 'bcrypt'

interface VisibilityUpdateRequest {
  visibility: 'public' | 'owner' | 'password' | 'token'
  password?: string // Required only for password mode
}

export async function updateProjectVisibility(
  projectId: string, 
  request: VisibilityUpdateRequest,
  userId: string
) {
  // Rate limiting check
  if (!(await checkVisibilityUpdates(projectId))) {
    throw new Error('Too many visibility updates. Try again later.')
  }

  // Validate input
  const validation = validateVisibilityRequest(request)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Get project and verify ownership
  const project = await db.projects.findFirst({
    where: { id: projectId, owner_id: userId }
  })
  
  if (!project) {
    throw new Error('Project not found')
  }

  // Paid plan validation for non-public modes
  if (request.visibility !== 'public' && project.plan === 'free') {
    throw new Error('Preview privacy is a paid feature')
  }

  // Prepare updates
  const updates: any = { visibility: request.visibility }
  
  if (request.visibility === 'password' && request.password) {
    // Server-side bcrypt hashing (never trust client)
    updates.preview_password_hash = await bcrypt.hash(request.password, 12)
    updates.preview_password_set_at = new Date()
  } else if (request.visibility !== 'password') {
    // Clear password when switching away from password mode  
    updates.preview_password_hash = null
    updates.preview_password_set_at = null
  }

  await db.projects.update({
    where: { id: projectId },
    data: updates
  })

  return {
    success: true,
    visibility: updates.visibility,
    passwordLastSet: updates.preview_password_set_at
  }
}
```

### Enhanced GET /projects/:id

Include privacy information in project details response.

```typescript
// Enhanced project response
export async function getProjectDetails(projectId: string, userId: string) {
  const project = await db.projects.findFirst({
    where: { id: projectId, owner_id: userId },
    include: {
      build_artifacts: {
        orderBy: { created_at: 'desc' },
        take: 2
      }
    }
  })

  if (!project) {
    throw new Error('Project not found')
  }

  // Calculate derived states
  const latestArtifact = project.build_artifacts[0]
  const isArtifactExpired = latestArtifact 
    ? new Date(latestArtifact.expires_at) < new Date()
    : true

  return {
    ...project,
    // Privacy info (hash excluded for security)
    hasPassword: !!project.preview_password_set_at,
    passwordLastSet: project.preview_password_set_at,
    
    // Build status
    hasSuccessfulBuild: !!latestArtifact,
    isArtifactExpired,
    hasMultipleVersions: project.build_artifacts.length > 1,
    
    // Remove sensitive fields
    preview_password_hash: undefined,
    build_artifacts: undefined
  }
}
```

### Input Validation

```typescript
// src/utils/validation.ts
export function validateVisibilityRequest(body: any): { valid: boolean; error?: string } {
  const { visibility, password } = body
  
  if (!['public', 'owner', 'password', 'token'].includes(visibility)) {
    return { valid: false, error: 'Invalid visibility mode' }
  }
  
  if (visibility === 'password') {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password required for password mode' }
    }
    
    if (password.length < 8 || password.length > 128) {
      return { valid: false, error: 'Password must be 8-128 characters' }
    }
  }
  
  return { valid: true }
}
```

---

## ⚡ Worker Implementation

### Main Access Control Logic

```typescript
// src/worker/preview-access-control.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    
    // Extract project ID from subdomain
    const projectMatch = url.hostname.match(/^preview-(\d+)\./)
    if (!projectMatch) {
      return new Response('Invalid preview domain', { status: 404 })
    }
    
    const projectId = projectMatch[1]
    const project = await getProjectVisibility(projectId, env)
    
    if (!project) {
      return new Response('Preview not found', { status: 404 })
    }
    
    return handlePreviewAccess(request, project, env)
  }
}

async function handlePreviewAccess(
  request: Request, 
  project: ProjectVisibility, 
  env: Env
): Promise<Response> {
  const context = { isOwner: false, userId: null }
  
  switch (project.visibility) {
    case 'public':
      return fetchPreviewContent(request, project, context)
      
    case 'owner':
      return handleOwnerOnlyAccess(request, project, context, env)
    
    case 'password':
      return handlePasswordAccess(request, project, context, env)
    
    case 'token': // Phase 2
      return handleTokenAccess(request, project, context, env)
    
    default:
      return new Response('Invalid privacy configuration', { status: 500 })
  }
}
```

### Owner-Only Access Handler

```typescript
async function handleOwnerOnlyAccess(
  request: Request,
  project: ProjectVisibility,
  context: PreviewContext,
  env: Env
): Promise<Response> {
  // Try both access token and refresh token for robust auth
  const session = await parseSupabaseCookie(request, env)
  let isValidOwner = session?.user?.id === project.owner_id
  
  // If access token expired, try refresh token
  if (!isValidOwner && session?.refresh_token) {
    const refreshedSession = await refreshSupabaseToken(session.refresh_token, env)
    isValidOwner = refreshedSession?.user?.id === project.owner_id
  }
  
  if (isValidOwner) {
    context.isOwner = true
    context.userId = session.user.id
    const response = await fetchPreviewContent(request, project, context)
    return addPrivacyHeaders(response)
  }
  
  return new Response('Login required to view this preview', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Bearer realm="Preview Access"',
      'Cache-Control': 'no-store'
    }
  })
}
```

### Password Access Handler

```typescript
async function handlePasswordAccess(
  request: Request,
  project: ProjectVisibility,
  context: PreviewContext,
  env: Env
): Promise<Response> {
  // Check for valid password cookie first (avoid repeated Basic Auth prompts)
  const passwordCookie = getCookie(request, `pw-${project.id}`)
  if (passwordCookie && await verifyPasswordCookie(passwordCookie, project.id, project.preview_password_hash, env)) {
    const response = await fetchPreviewContent(request, project, context)
    return addPrivacyHeaders(response)
  }
  
  // Check Basic Auth header
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Basic ')) {
    const credentials = parseBasicAuth(authHeader)
    if (credentials && await verifyProjectPassword(credentials.password, project.preview_password_hash)) {
      const response = await fetchPreviewContent(request, project, context)
      
      // Set password cookie (7-day expiry) to avoid future prompts
      const cookieValue = await signPasswordCookie(project.id, project.preview_password_hash, env)
      response.headers.set('Set-Cookie', 
        `pw-${project.id}=${cookieValue}; ` +
        `HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/; Domain=${new URL(request.url).hostname}`
      )
      
      return addPrivacyHeaders(response)
    }
  }
  
  // Prompt for password
  return new Response('Password Required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Preview Password"',
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store'
    }
  })
}
```

### Token Access Handler (Phase 2)

```typescript
async function handleTokenAccess(
  request: Request,
  project: ProjectVisibility,
  context: PreviewContext,
  env: Env
): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t')
  if (token && await verifyShareToken(token, project.id, env)) {
    const response = await fetchPreviewContent(request, project, context)
    // Critical: Force no-cache for token mode to prevent CDN serving cached responses
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
    headers.set('Vary', 'Authorization, Cookie, Query-Token')
    headers.set('X-Robots-Tag', 'noindex, nofollow')
    return new Response(response.body, { ...response, headers })
  }
  return new Response('Invalid or expired share link', {
    status: 401,
    headers: { 'Cache-Control': 'no-store' }
  })
}
```

---

## 🔐 Security Utilities

### Password Verification & Cookie Management

```typescript
// src/worker/security-utils.ts
import bcrypt from 'bcrypt'

// Password verification with bcrypt
export async function verifyProjectPassword(
  plainPassword: string, 
  hashedPassword: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword)
  } catch (error) {
    console.error('Password verification failed:', error)
    return false
  }
}

// HMAC-signed password cookies with hash fingerprint for invalidation
export async function signPasswordCookie(
  projectId: string, 
  passwordHash: string, 
  env: Env
): Promise<string> {
  // Include first 32 chars of password hash to invalidate on password rotation
  const hashFingerprint = passwordHash.substring(0, 32) // bcrypt hash prefix
  const payload = { 
    projectId, 
    iat: Date.now(),
    hashFp: hashFingerprint 
  }
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', await env.JWT_SECRET, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    new TextEncoder().encode(JSON.stringify(payload))
  )
  
  return btoa(JSON.stringify({ ...payload, signature: Array.from(new Uint8Array(signature)) }))
}

// Enhanced cookie verification with hash fingerprint
export async function verifyPasswordCookie(
  cookieValue: string, 
  projectId: string,
  currentPasswordHash: string,
  env: Env
): Promise<boolean> {
  try {
    const payload = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
    
    // Verify signature
    const expectedSignature = await crypto.subtle.sign(
      'HMAC',
      await crypto.subtle.importKey('raw', await env.JWT_SECRET, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      new TextEncoder().encode(JSON.stringify({ 
        projectId: payload.projectId, 
        iat: payload.iat,
        hashFp: payload.hashFp 
      }))
    )
    
    const signatureArray = Array.from(new Uint8Array(expectedSignature))
    if (!arraysEqual(payload.signature, signatureArray)) return false
    if (payload.projectId !== projectId) return false
    
    // Check if password was rotated (hash fingerprint mismatch)
    const currentHashFp = currentPasswordHash.substring(0, 32)
    if (payload.hashFp !== currentHashFp) return false
    
    // Check expiry (7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000
    return (Date.now() - payload.iat) < maxAge
    
  } catch (error) {
    return false
  }
}

// Basic Auth parsing utility
export function parseBasicAuth(authHeader: string): { username: string; password: string } | null {
  try {
    const base64Credentials = authHeader.split(' ')[1]
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
    const [username, password] = credentials.split(':')
    return { username, password }
  } catch (error) {
    return null
  }
}

// Array comparison utility
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
```

### Supabase Authentication

```typescript
// src/worker/supabase-auth.ts

// Parse Supabase session from cookies
export async function parseSupabaseCookie(request: Request, env: Env): Promise<any> {
  const authCookie = getCookie(request, 'sb-access-token')
  const refreshCookie = getCookie(request, 'sb-refresh-token')
  
  if (!authCookie) return null
  
  try {
    // Verify JWT access token
    const payload = await verifyJWT(authCookie, env.SUPABASE_JWT_SECRET)
    return {
      user: { id: payload.sub },
      access_token: authCookie,
      refresh_token: refreshCookie
    }
  } catch (error) {
    // Token invalid/expired - return refresh token for retry
    return refreshCookie ? { refresh_token: refreshCookie } : null
  }
}

// Refresh Supabase token
export async function refreshSupabaseToken(refreshToken: string, env: Env): Promise<any> {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    })
    
    if (!response.ok) return null
    
    const data = await response.json()
    return data.user ? { user: data.user, access_token: data.access_token } : null
  } catch (error) {
    console.error('Token refresh failed:', error)
    return null
  }
}

// Get cookie value from request
function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie')
  if (!cookieHeader) return null
  
  const cookies = cookieHeader.split(';').map(c => c.trim())
  const cookie = cookies.find(c => c.startsWith(`${name}=`))
  return cookie ? cookie.split('=')[1] : null
}
```

### JWT Share Tokens (Phase 2)

```typescript
// src/worker/jwt-utils.ts
import jwt from 'jsonwebtoken'

// Verify JWT share token
export async function verifyShareToken(
  token: string, 
  projectId: string, 
  env: Env
): Promise<boolean> {
  try {
    const decoded = jwt.verify(token, await env.JWT_SECRET) as any
    return decoded.projectId === projectId
  } catch (error) {
    return false // Token invalid or expired
  }
}

// Generate share token (API endpoint)
export async function generateShareToken(
  projectId: string, 
  ttlHours: number = 1,
  env: Env
): Promise<{ token: string; expiresAt: Date; shareUrl: string }> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
  
  const token = jwt.sign(
    { 
      projectId,
      exp: Math.floor(expiresAt.getTime() / 1000)
    },
    await env.JWT_SECRET
  )
  
  return {
    token,
    expiresAt,
    shareUrl: `https://preview-${projectId}.sheenapps.com/?t=${token}`
  }
}
```

---

## 🛡️ Rate Limiting & Security

### Rate Limiting Implementation

```typescript
// src/worker/rate-limiting.ts

// Password attempt limiting (per subnet to prevent IP rotation)
export async function checkPasswordAttempts(
  ip: string, 
  projectId: string, 
  env: Env
): Promise<{ allowed: boolean; remaining: number }> {
  // Use /24 subnet for IPv4, /56 for IPv6 to prevent easy IP rotation
  const subnet = normalizeIPToSubnet(ip)
  const key = `pwd_attempts:${subnet}:${projectId}`
  const attempts = await env.RATE_LIMITER.get(key) || 0
  
  if (attempts >= 20) { // 20 attempts per 10 minutes
    return { allowed: false, remaining: 0 }
  }
  
  await env.RATE_LIMITER.put(key, attempts + 1, { expirationTtl: 600 })
  return { allowed: true, remaining: 20 - attempts - 1 }
}

// Visibility update limiting (per project)
export async function checkVisibilityUpdates(
  projectId: string, 
  env: Env
): Promise<boolean> {
  const key = `visibility_updates:${projectId}`
  const updates = await env.RATE_LIMITER.get(key) || 0
  
  if (updates >= 10) { // 10 updates per hour
    return false
  }
  
  await env.RATE_LIMITER.put(key, updates + 1, { expirationTtl: 3600 })
  return true
}

// Normalize IP to subnet for rate limiting
function normalizeIPToSubnet(ip: string): string {
  if (ip.includes(':')) {
    // IPv6 - use /56 subnet (first 7 groups)
    const groups = ip.split(':')
    return groups.slice(0, 7).join(':') + '::/56'
  } else {
    // IPv4 - use /24 subnet
    const octets = ip.split('.')
    return octets.slice(0, 3).join('.') + '.0/24'
  }
}
```

### Privacy Headers

```typescript
// src/worker/headers.ts

// Add privacy headers for non-public previews
export function addPrivacyHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store, max-age=0')
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  headers.set('Vary', 'Authorization, Cookie')
  return new Response(response.body, { ...response, headers })
}
```

---

## 📊 Analytics Integration

### Owner Visit Tracking

```typescript
// src/worker/analytics.ts

// Track preview visits with owner context
export async function recordPreviewView(
  projectId: string, 
  request: Request, 
  context: PreviewContext, 
  env: Env
): Promise<void> {
  // Skip recording if project owner visits and analytics disabled
  const project = await getProject(projectId, env)
  if (context.isOwner && !project.count_owner_visits) {
    return
  }
  
  const visitorId = context.isOwner ? context.userId : getVisitorId(request)
  
  await env.DB.prepare(`
    INSERT INTO preview_analytics 
    (project_id, visitor_id, is_owner, ip_address, user_agent, timestamp, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    projectId,
    visitorId,
    context.isOwner,
    request.headers.get('CF-Connecting-IP'),
    request.headers.get('User-Agent'),
    Date.now(),
    Date.now() + (90 * 24 * 60 * 60 * 1000) // 90-day TTL
  ).run()
}

// Public analytics query (excludes owner visits)
export async function getPublicPreviewStats(projectId: string, env: Env) {
  return await env.DB.prepare(`
    SELECT 
      COUNT(*) as total_views,
      COUNT(DISTINCT visitor_id) as unique_visitors,
      COUNT(DISTINCT DATE(timestamp/1000, 'unixepoch')) as active_days
    FROM preview_analytics 
    WHERE project_id = ? 
      AND is_owner = FALSE
      AND timestamp > ? -- Last 30 days
      AND expires_at > ? -- Not expired
  `).bind(
    projectId, 
    Date.now() - 30 * 24 * 60 * 60 * 1000,
    Date.now()
  ).first()
}
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// tests/unit/preview-access-control.test.ts
describe('Preview Access Control', () => {
  test('allows public access to public previews', async () => {
    const project = { id: '123', visibility: 'public' }
    const request = new Request('https://preview-123.sheenapps.com')
    
    const response = await handlePreviewAccess(request, project, mockEnv)
    
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Robots-Tag')).toBeNull()
  })
  
  test('blocks owner-only previews for unauthenticated users', async () => {
    const project = { id: '123', visibility: 'owner', owner_id: 'user-456' }
    const request = new Request('https://preview-123.sheenapps.com')
    
    const response = await handlePreviewAccess(request, project, mockEnv)
    
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })
  
  test('verifies password-protected access with correct credentials', async () => {
    const project = { 
      id: '123', 
      visibility: 'password', 
      preview_password_hash: await bcrypt.hash('test123', 12)
    }
    const request = new Request('https://preview-123.sheenapps.com', {
      headers: { 'Authorization': 'Basic ' + btoa('user:test123') }
    })
    
    const response = await handlePreviewAccess(request, project, mockEnv)
    
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
  })
})
```

### Integration Tests

```typescript
// tests/integration/preview-privacy.test.ts
describe('Preview Privacy Integration', () => {
  test('complete password flow with cookie persistence', async () => {
    const project = await createTestProject({ 
      visibility: 'password',
      password: 'secure-test-password'
    })
    
    // Initial request without auth
    let response = await fetch(`http://preview-${project.id}.localhost:3000`)
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('Basic')
    
    // Request with correct password
    response = await fetch(`http://preview-${project.id}.localhost:3000`, {
      headers: { 
        'Authorization': 'Basic ' + btoa('user:secure-test-password')
      }
    })
    expect(response.status).toBe(200)
    
    // Extract password cookie
    const setCookie = response.headers.get('Set-Cookie')
    expect(setCookie).toContain(`pw-${project.id}=`)
    
    // Subsequent request with cookie should work
    response = await fetch(`http://preview-${project.id}.localhost:3000`, {
      headers: { 'Cookie': setCookie }
    })
    expect(response.status).toBe(200)
  })
})
```

---

## 🚀 Deployment Strategy

### Environment Configuration

```typescript
// wrangler.toml
[env.production.vars]
PREVIEW_PRIVACY_ENABLED = "true"
JWT_SHARE_LINKS_ENABLED = "false" # Phase 2

# Store in Workers Secrets (not env vars)
# wrangler secret put JWT_SECRET
# wrangler secret put SUPABASE_JWT_SECRET
```

### Feature Flags

```typescript
// src/worker/feature-flags.ts
export const FEATURE_FLAGS = {
  PREVIEW_PRIVACY_ENABLED: env.PREVIEW_PRIVACY_ENABLED === 'true',
  JWT_SHARE_LINKS_ENABLED: env.JWT_SHARE_LINKS_ENABLED === 'true',
  ENHANCED_RATE_LIMITING: env.ENHANCED_RATE_LIMITING === 'true'
}

// Gradual rollout with fallback
export async function handlePreviewAccessWithFlags(request, project, env) {
  if (!FEATURE_FLAGS.PREVIEW_PRIVACY_ENABLED) {
    // Fallback to current public-only behavior
    return fetchPreviewContent(request, project, { isOwner: false })
  }
  
  // New privacy logic
  return handlePreviewAccess(request, project, env)
}
```

### Rollout Plan

1. **Database Migration** - Deploy schema changes (backward compatible)
2. **Worker Logic** - Deploy with `PREVIEW_PRIVACY_ENABLED=false`
3. **API Endpoints** - Deploy backend API changes
4. **Frontend Release** - Deploy UI with privacy settings
5. **Feature Activation** - Set `PREVIEW_PRIVACY_ENABLED=true`
6. **Monitor & Optimize** - Watch metrics, fix issues
7. **Phase 2** - Enable JWT tokens when ready

### Monitoring

```typescript
// Key metrics to track
interface PreviewPrivacyMetrics {
  privacy_mode_usage: Record<string, number>
  password_attempts_blocked: number
  owner_visits_excluded: number
  auth_refresh_success_rate: number
  access_denied_rate: number
}
```

---

## ✅ Acceptance Criteria

### Phase 1 - Must Have
- [ ] Public previews work exactly as before (no regression)
- [ ] Owner-only mode blocks unauthenticated users
- [ ] Owner-only mode allows authenticated project owners
- [ ] Password mode prompts for Basic Auth
- [ ] Password mode remembers auth with 7-day cookies
- [ ] Password rotation invalidates existing cookies
- [ ] All non-public modes return `noindex, nofollow` headers
- [ ] Rate limiting prevents brute force attacks
- [ ] Paid plan validation works correctly
- [ ] Owner visits can be excluded from analytics

### Phase 1 - Performance
- [ ] Public previews have zero auth overhead
- [ ] Cookie verification < 5ms average
- [ ] Database queries use proper indexes
- [ ] Rate limiting uses efficient storage

### Phase 2 - Advanced Features
- [ ] JWT share tokens work with proper expiration
- [ ] Token mode prevents CDN caching issues
- [ ] Analytics TTL cleanup runs correctly
- [ ] Enhanced rate limiting by subnet works

This organized plan provides clear implementation steps, proper code organization, and comprehensive testing strategy for the preview privacy features.