# Preview Privacy Features Implementation Plan

## Executive Summary

This document outlines the comprehensive implementation plan for preview privacy features based on expert analysis. The plan enables users to control who can access their preview sites with multiple privacy modes while maintaining optimal performance and security.

**Core Features:**
- 🌐 **Public** (default) - Anyone can view
- 🔒 **Owner-only** - Login required  
- 🔗 **Shared link** - Time-limited JWT access
- 🔑 **Password-protected** - Basic auth protection

---

## Frontend Implementation (Builder UI)

### 🎨 **Privacy Settings Interface**

#### **Radio Group Component:**
```typescript
// src/components/builder/privacy-settings.tsx
interface PrivacyMode {
  value: 'public' | 'owner' | 'token' | 'password'
  label: string
  description: string
  isPaid?: boolean
}

const PRIVACY_MODES: PrivacyMode[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone can view your preview'
  },
  {
    value: 'owner', 
    label: 'Owner-only',
    description: 'Login required to view',
    isPaid: true
  },
  {
    value: 'token',
    label: 'Shared link', 
    description: 'Time-limited access link',
    isPaid: true
  },
  {
    value: 'password',
    label: 'Password-protected',
    description: 'Requires password to access',
    isPaid: true
  }
]

export function PrivacySettings({ project, onUpdate }: PrivacySettingsProps) {
  const [visibility, setVisibility] = useState(project.visibility)
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    setIsLoading(true)
    try {
      await updateProjectVisibility(project.id, { visibility, password })
      onUpdate({ visibility, passwordLastSet: new Date() })
    } catch (error) {
      // Handle error
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <RadioGroup value={visibility} onValueChange={setVisibility}>
        {PRIVACY_MODES.map((mode) => (
          <PrivacyModeOption 
            key={mode.value}
            mode={mode}
            disabled={mode.isPaid && !project.isPaidPlan}
          />
        ))}
      </RadioGroup>

      {visibility === 'password' && (
        <PasswordConfiguration 
          password={password}
          onPasswordChange={setPassword}
          lastSet={project.passwordLastSet}
        />
      )}

      {visibility === 'token' && (
        <ShareLinkConfiguration 
          projectId={project.id}
          currentToken={project.shareToken}
        />
      )}

      <SaveButton 
        onClick={handleSave}
        loading={isLoading}
        disabled={!hasChanges}
      />
    </div>
  )
}
```

#### **Password Configuration Component:**
```typescript
// Password-specific UI with security best practices
function PasswordConfiguration({ password, onPasswordChange, lastSet }: PasswordConfigProps) {
  const [showPassword, setShowPassword] = useState(false)
  
  return (
    <div className="border rounded-lg p-4 bg-amber-50">
      <Label>Preview Password</Label>
      <div className="flex gap-2">
        <Input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Enter secure password"
          className="flex-1"
        />
        <Button
          variant="outline"
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </Button>
        <Button
          variant="outline" 
          onClick={() => onPasswordChange(generateSecurePassword())}
        >
          Generate
        </Button>
      </div>
      
      {lastSet && (
        <p className="text-sm text-gray-600 mt-2">
          Last changed {formatTimeAgo(lastSet)}
        </p>
      )}
      
      <div className="mt-3 p-3 bg-blue-50 rounded text-sm">
        <strong>Security Note:</strong> Use a unique password. This will be required 
        for anyone accessing your preview site.
      </div>
    </div>
  )
}
```

#### **Share Link Configuration:**
```typescript
// Time-limited share link management
function ShareLinkConfiguration({ projectId, currentToken }: ShareLinkProps) {
  const [shareUrl, setShareUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState<Date>()
  const [isGenerating, setIsGenerating] = useState(false)

  const generateShareLink = async () => {
    setIsGenerating(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/share-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlHours: 1 }) // 1-hour default
      })
      
      const { token, expiresAt } = await response.json()
      const url = `${window.location.origin}/preview-${projectId}?t=${token}`
      
      setShareUrl(url)
      setExpiresAt(new Date(expiresAt))
    } catch (error) {
      // Handle error
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-green-50">
      <div className="flex items-center justify-between mb-3">
        <Label>Share Link</Label>
        <Button 
          size="sm" 
          onClick={generateShareLink}
          loading={isGenerating}
        >
          {currentToken ? 'Regenerate' : 'Generate'} Link
        </Button>
      </div>
      
      {shareUrl && (
        <>
          <div className="flex gap-2">
            <Input 
              value={shareUrl} 
              readOnly 
              className="flex-1 font-mono text-sm"
            />
            <CopyButton text={shareUrl} />
          </div>
          
          <p className="text-sm text-gray-600 mt-2">
            Expires {formatTimeAgo(expiresAt)} • 
            <button 
              onClick={generateShareLink}
              className="text-blue-600 hover:underline ml-1"
            >
              Generate new link
            </button>
          </p>
        </>
      )}
    </div>
  )
}
```

### 🔍 **Visibility Indicators & Status**

#### **Privacy Status Badge:**
```typescript
// src/components/builder/privacy-status-badge.tsx
export function PrivacyStatusBadge({ project }: { project: Project }) {
  const getStatusConfig = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return { 
          color: 'green', 
          icon: Globe, 
          label: 'Public',
          description: 'Visible to everyone, indexed by search engines'
        }
      case 'owner':
        return { 
          color: 'blue', 
          icon: Lock, 
          label: 'Owner-only',
          description: 'No-index, private-cached'
        }
      case 'password':
        return { 
          color: 'amber', 
          icon: Key, 
          label: 'Password-protected',
          description: 'No-index, private-cached'
        }
      case 'token':
        return { 
          color: 'purple', 
          icon: Link, 
          label: 'Shared link',
          description: 'No-index, private-cached'
        }
    }
  }

  const config = getStatusConfig(project.visibility)

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100">
      <config.icon className="w-4 h-4" />
      <span className="text-sm font-medium">{config.label}</span>
      <Tooltip content={config.description}>
        <Info className="w-3 h-3 text-gray-500" />
      </Tooltip>
    </div>
  )
}
```

#### **SEO & Caching Indicators:**
```typescript
// Enhanced status bar with technical details
export function PreviewStatusBar({ project }: PreviewStatusBarProps) {
  const showSEOWarning = project.visibility !== 'public'
  
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
      <div className="flex items-center gap-4">
        <PrivacyStatusBadge project={project} />
        
        {showSEOWarning && (
          <div className="flex items-center gap-1 text-sm text-amber-600">
            <AlertTriangle className="w-4 h-4" />
            No-index, private-cached
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <AnalyticsToggle 
          enabled={project.countOwnerVisits}
          onChange={(enabled) => updateAnalyticsSettings(project.id, enabled)}
        />
      </div>
    </div>
  )
}
```

### 🚫 **Disabled States & Contextual Tooltips**

#### **Smart Action Buttons:**
```typescript
// src/components/builder/preview-actions.tsx
export function PreviewActions({ project }: PreviewActionsProps) {
  const canPreview = project.hasSuccessfulBuild && !project.isArtifactExpired
  const canRollback = project.hasMultipleVersions && !project.isArtifactExpired
  
  return (
    <div className="flex gap-2">
      <Tooltip 
        content={
          !canPreview 
            ? project.isArtifactExpired 
              ? "Artifact expired - rebuild required"
              : "No successful build available"
            : "Open preview in new tab"
        }
      >
        <Button 
          disabled={!canPreview}
          onClick={() => openPreview(project)}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Preview
        </Button>
      </Tooltip>
      
      <Tooltip
        content={
          !canRollback
            ? project.isArtifactExpired
              ? "Artifacts expired - rollback unavailable"  
              : "Only one version available"
            : "Rollback to previous version"
        }
      >
        <Button
          variant="outline"
          disabled={!canRollback}
          onClick={() => openRollbackModal(project)}
        >
          <RotateCounterClockwise className="w-4 h-4 mr-2" />
          Rollback
        </Button>
      </Tooltip>
    </div>
  )
}
```

### 📊 **Owner Visit Analytics Toggle**

#### **Analytics Configuration:**
```typescript
// src/components/builder/analytics-toggle.tsx
export function AnalyticsToggle({ enabled, onChange }: AnalyticsToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch 
        checked={enabled}
        onCheckedChange={onChange}
        id="count-visits"
      />
      <Label htmlFor="count-visits" className="text-sm">
        Count my visits
      </Label>
      <Tooltip content="When disabled, your visits won't appear in analytics">
        <Info className="w-3 h-3 text-gray-500" />
      </Tooltip>
    </div>
  )
}
```

### 🔄 **Edge Case UX Handling**

#### **Error Boundaries & Fallbacks:**
```typescript
// src/components/preview/preview-error-boundary.tsx
export function PreviewErrorBoundary({ error, retry }: PreviewErrorProps) {
  const getErrorMessage = (error: PreviewError) => {
    switch (error.type) {
      case 'EXPIRED_SHARE_LINK':
        return {
          title: 'Link Expired',
          message: 'This share link has expired. Request a new one from the site owner.',
          action: 'Contact Owner'
        }
      case 'PASSWORD_CHANGED':
        return {
          title: 'Password Updated', 
          message: 'The password for this preview has been changed. Please enter the new password.',
          action: 'Re-enter Password'
        }
      case 'ACCESS_DENIED':
        return {
          title: 'Access Denied',
          message: 'You don\'t have permission to view this preview.',
          action: 'Request Access'
        }
      case 'ARTIFACT_EXPIRED':
        return {
          title: 'Preview Unavailable',
          message: 'This preview is no longer available. The site owner needs to rebuild it.',
          action: 'Notify Owner'
        }
    }
  }

  const errorConfig = getErrorMessage(error)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {errorConfig.title}
      </h1>
      <p className="text-gray-600 text-center max-w-md mb-6">
        {errorConfig.message}
      </p>
      <Button onClick={retry}>
        {errorConfig.action}
      </Button>
    </div>
  )
}
```

### 📝 **Custom Domain Clarification**

#### **Settings Page Notice:**
```typescript
// src/components/settings/domain-settings.tsx
export function DomainSettings({ project }: DomainSettingsProps) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Preview vs Published Sites</h3>
            <p className="text-sm text-blue-700 mt-1">
              Privacy settings apply to <strong>preview URLs only</strong> (preview-123.sheenapps.com). 
              Published sites and custom domains are always public and indexed by search engines.
            </p>
          </div>
        </div>
      </div>
      
      {/* Rest of domain settings */}
    </div>
  )
}
```

---

## API Implementation

### 🔐 **Visibility Management Endpoint**

#### **PATCH /api/projects/[id]/visibility**
```typescript
// src/app/api/projects/[id]/visibility/route.ts
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { visibility, password } = await request.json()
    const supabase = await createServerSupabaseClientNew()
    
    // Verify user owns this project (RLS will also enforce this)
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, plan')
      .eq('id', params.id)
      .single()
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    // Paid tier check for non-public modes
    if (visibility !== 'public' && project.plan === 'free') {
      return NextResponse.json(
        { error: 'Preview privacy is a paid feature' }, 
        { status: 403 }
      )
    }
    
    // Prepare updates
    const updates: any = { visibility }
    
    if (visibility === 'password' && password) {
      // Server-side bcrypt hashing (never trust client)
      const bcrypt = await import('bcrypt')
      updates.preview_password_hash = await bcrypt.hash(password, 12)
      updates.preview_password_set_at = new Date().toISOString()
    } else if (visibility !== 'password') {
      // Clear password when switching away from password mode  
      updates.preview_password_hash = null
      updates.preview_password_set_at = null
    }
    
    const { error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', params.id)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    
    return NextResponse.json({ 
      success: true,
      visibility: updates.visibility,
      passwordLastSet: updates.preview_password_set_at
    })
    
  } catch (error) {
    console.error('Visibility update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}
```

### 🔗 **Share Token Generation**

#### **POST /api/projects/[id]/share-token**
```typescript
// src/app/api/projects/[id]/share-token/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { ttlHours = 1 } = await request.json()
    const supabase = await createServerSupabaseClientNew()
    
    // Verify ownership
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', params.id)
      .single()
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const jwt = await import('jsonwebtoken')
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
    
    const token = jwt.sign(
      { 
        projectId: params.id,
        exp: Math.floor(expiresAt.getTime() / 1000)
      },
      process.env.JWT_SECRET!
    )
    
    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      url: `${process.env.NEXT_PUBLIC_APP_URL}/preview-${params.id}?t=${token}`
    })
    
  } catch (error) {
    console.error('Share token generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}
```

### 📊 **Enhanced Project Details**

#### **GET /api/projects/[id] (Enhanced)**
```typescript
// Enhanced project details with privacy information
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClientNew()
  
  const { data: project } = await supabase
    .from('projects')
    .select(`
      *,
      visibility,
      preview_password_set_at,
      build_artifacts!left (
        id,
        created_at,
        expires_at
      )
    `)
    .eq('id', params.id)
    .single()
  
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  
  // Calculate derived states
  const latestArtifact = project.build_artifacts?.[0]
  const isArtifactExpired = latestArtifact 
    ? new Date(latestArtifact.expires_at) < new Date()
    : true
  
  const enhancedProject = {
    ...project,
    // Privacy info
    hasPassword: !!project.preview_password_set_at,
    passwordLastSet: project.preview_password_set_at,
    
    // Build status
    hasSuccessfulBuild: !!latestArtifact,
    isArtifactExpired,
    hasMultipleVersions: project.build_artifacts?.length > 1,
    
    // Analytics
    countOwnerVisits: project.analytics_settings?.count_owner_visits ?? true
  }
  
  // Remove sensitive fields
  delete enhancedProject.preview_password_hash
  delete enhancedProject.build_artifacts
  
  return NextResponse.json(enhancedProject)
}
```

---

## Edge Worker Implementation

### 🛡️ **Preview Access Control**

#### **Enhanced Middleware:**
```typescript
// middleware.ts - Enhanced with preview privacy
export async function middleware(request: NextRequest) {
  const url = new URL(request.url)
  
  // Check if this is a preview subdomain
  const isPreviewDomain = url.hostname.match(/^preview-(\d+)\./)
  if (!isPreviewDomain) {
    return NextResponse.next() // Not a preview domain
  }
  
  const projectId = isPreviewDomain[1]
  const project = await getProjectVisibility(projectId)
  
  if (!project) {
    return notFoundResponse()
  }
  
  return handlePreviewAccess(request, project)
}

async function handlePreviewAccess(request: NextRequest, project: Project) {
  switch (project.visibility) {
    case 'public':
      // Fast path for public previews - no auth checks needed
      return NextResponse.next()
      
    case 'owner': {
      const session = parseSupabaseCookie(request)
      const isOwner = session?.user?.id === project.owner_id
      
      if (isOwner) {
        const response = NextResponse.next()
        // Mark as owner visit for analytics exclusion
        response.headers.set('X-Preview-Context', 'owner')
        return addPrivateHeaders(response)
      }
      
      return unauthorizedResponse('This preview requires login')
    }
    
    case 'password': {
      // Check for valid password cookie first (avoid repeated Basic Auth prompts)
      const passwordCookie = request.cookies.get(`pw-${project.id}`)
      if (passwordCookie && await verifyPasswordCookie(passwordCookie.value, project.id)) {
        return addPrivateHeaders(NextResponse.next())
      }
      
      // Check Basic Auth header
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Basic ')) {
        const credentials = parseBasicAuth(authHeader)
        if (credentials && await verifyProjectPassword(credentials.password, project.preview_password_hash)) {
          const response = NextResponse.next()
          
          // Set password cookie to avoid repeated prompts (7-day expiry)
          response.cookies.set(`pw-${project.id}`, 
            await signPasswordCookie(project.id), 
            {
              maxAge: 7 * 24 * 60 * 60, // 7 days
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax'
            }
          )
          
          return addPrivateHeaders(response)
        }
      }
      
      // Prompt for password
      return passwordPromptResponse()
    }
    
    case 'token': {
      const token = url.searchParams.get('t')
      if (token && await verifyShareToken(token, project.id)) {
        return addPrivateHeaders(NextResponse.next())
      }
      
      return unauthorizedResponse('Invalid or expired share link')
    }
    
    default:
      return unauthorizedResponse('Invalid privacy configuration')
  }
}

// Add privacy headers for non-public previews
function addPrivateHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  response.headers.set('Vary', 'Authorization, Cookie')
  return response
}

// Password prompt using HTTP Basic Auth
function passwordPromptResponse(): NextResponse {
  return new NextResponse('Password Required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Preview Password"',
      'Content-Type': 'text/plain'
    }
  })
}
```

### 🔐 **Security Utilities**

#### **Password & Token Verification:**
```typescript
// src/lib/preview-security.ts
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { createHash, createHmac } from 'crypto'

export async function verifyProjectPassword(
  plainPassword: string, 
  hashedPassword: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword)
  } catch (error) {
    console.error('Password verification error:', error)
    return false
  }
}

export async function verifyShareToken(
  token: string, 
  projectId: string
): Promise<boolean> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    return decoded.projectId === projectId
  } catch (error) {
    return false // Token invalid or expired
  }
}

export async function signPasswordCookie(projectId: string): Promise<string> {
  const payload = { projectId, iat: Date.now() }
  const signature = createHmac('sha256', process.env.JWT_SECRET!)
    .update(JSON.stringify(payload))
    .digest('hex')
  
  return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64')
}

export async function verifyPasswordCookie(
  cookieValue: string, 
  projectId: string
): Promise<boolean> {
  try {
    const payload = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
    
    // Verify signature
    const expectedSignature = createHmac('sha256', process.env.JWT_SECRET!)
      .update(JSON.stringify({ projectId: payload.projectId, iat: payload.iat }))
      .digest('hex')
    
    if (payload.signature !== expectedSignature) return false
    if (payload.projectId !== projectId) return false
    
    // Check expiry (7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000
    return (Date.now() - payload.iat) < maxAge
    
  } catch (error) {
    return false
  }
}

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
```

---

## Database Schema & Migrations

### 📊 **Core Schema Extensions**

#### **Migration: Add Privacy Columns**
```sql
-- Migration 001: Add preview privacy support
ALTER TABLE projects 
ADD COLUMN visibility text NOT NULL DEFAULT 'public' 
  CHECK (visibility IN ('public', 'owner', 'token', 'password'));

ALTER TABLE projects 
ADD COLUMN preview_password_hash text,
ADD COLUMN preview_password_set_at timestamptz;

-- Index for efficient privacy queries
CREATE INDEX idx_projects_visibility ON projects(visibility);
CREATE INDEX idx_projects_password_set ON projects(preview_password_set_at) 
  WHERE preview_password_set_at IS NOT NULL;

-- Analytics enhancement
ALTER TABLE preview_events 
ADD COLUMN is_owner BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_preview_events_owner ON preview_events(project_id, is_owner, created_at);

-- RLS Policies
CREATE POLICY "Users can update their own project visibility" 
  ON projects FOR UPDATE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can view their own project privacy settings" 
  ON projects FOR SELECT 
  USING (auth.uid() = owner_id);
```

#### **Migration: Analytics Settings**
```sql
-- Migration 002: Add analytics configuration
ALTER TABLE projects 
ADD COLUMN analytics_settings jsonb DEFAULT '{"count_owner_visits": true}';

-- Function to exclude owner visits from public analytics
CREATE OR REPLACE FUNCTION get_public_preview_stats(project_uuid uuid)
RETURNS TABLE (
  total_views bigint,
  unique_visitors bigint,
  avg_session_duration interval
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_views,
    COUNT(DISTINCT visitor_id) as unique_visitors,
    AVG(session_duration) as avg_session_duration
  FROM preview_events 
  WHERE project_id = project_uuid 
    AND is_owner = FALSE  -- Exclude owner visits
    AND created_at >= NOW() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 🔒 **Row Level Security**

#### **Enhanced RLS Policies:**
```sql
-- Strict RLS for sensitive privacy data
CREATE POLICY "Only owners can read password hashes" 
  ON projects FOR SELECT 
  USING (
    auth.uid() = owner_id AND 
    auth.role() = 'authenticated'
  );

-- Prevent accidental exposure of password hashes
CREATE OR REPLACE VIEW public_project_details AS
SELECT 
  id,
  name,
  description,
  visibility,
  preview_password_set_at,
  -- Explicitly exclude preview_password_hash
  created_at,
  updated_at,
  owner_id
FROM projects;

-- Grant access to the safe view
GRANT SELECT ON public_project_details TO authenticated;
```

---

## Testing Strategy

### 🧪 **Component Testing**

#### **Privacy Settings Tests:**
```typescript
// src/components/builder/__tests__/privacy-settings.test.tsx
describe('PrivacySettings', () => {
  it('shows upgrade prompt for free users on paid features', async () => {
    const freeProject = { ...mockProject, plan: 'free' }
    
    render(<PrivacySettings project={freeProject} onUpdate={jest.fn()} />)
    
    // Try to select owner-only mode
    fireEvent.click(screen.getByLabelText('Owner-only'))
    
    expect(screen.getByText(/upgrade to enable/i)).toBeInTheDocument()
  })
  
  it('generates secure passwords', async () => {
    const paidProject = { ...mockProject, plan: 'pro' }
    
    render(<PrivacySettings project={paidProject} onUpdate={jest.fn()} />)
    
    fireEvent.click(screen.getByLabelText('Password-protected'))
    fireEvent.click(screen.getByText('Generate'))
    
    const passwordInput = screen.getByPlaceholderText('Enter secure password')
    const generatedPassword = passwordInput.value
    
    // Verify password meets security requirements
    expect(generatedPassword).toHaveLength(16)
    expect(generatedPassword).toMatch(/[A-Z]/) // Uppercase
    expect(generatedPassword).toMatch(/[a-z]/) // Lowercase  
    expect(generatedPassword).toMatch(/[0-9]/) // Numbers
    expect(generatedPassword).toMatch(/[!@#$%^&*]/) // Special chars
  })
})
```

### 🔐 **Security Testing**

#### **Access Control Tests:**
```typescript
// tests/integration/preview-privacy.test.ts
describe('Preview Privacy Integration', () => {
  it('blocks access to owner-only previews for unauthenticated users', async () => {
    const project = await createTestProject({ visibility: 'owner' })
    
    const response = await fetch(`http://preview-${project.id}.localhost:3000`)
    
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('Bearer')
  })
  
  it('allows owner access to their own private previews', async () => {
    const { project, user } = await createTestProjectWithOwner({ visibility: 'owner' })
    
    const response = await fetch(`http://preview-${project.id}.localhost:3000`, {
      headers: { 
        Cookie: await getAuthCookie(user) 
      }
    })
    
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Preview-Context')).toBe('owner')
  })
  
  it('verifies password-protected access', async () => {
    const project = await createTestProject({ 
      visibility: 'password',
      password: 'test-password-123'
    })
    
    // Wrong password
    const wrongResponse = await fetch(`http://preview-${project.id}.localhost:3000`, {
      headers: { 
        Authorization: 'Basic ' + btoa('user:wrong-password') 
      }
    })
    expect(wrongResponse.status).toBe(401)
    
    // Correct password
    const correctResponse = await fetch(`http://preview-${project.id}.localhost:3000`, {
      headers: { 
        Authorization: 'Basic ' + btoa('user:test-password-123') 
      }
    })
    expect(correctResponse.status).toBe(200)
  })
})
```

### 📊 **Analytics Testing**

#### **Owner Visit Exclusion Tests:**
```typescript
// tests/unit/analytics.test.ts
describe('Preview Analytics', () => {
  it('excludes owner visits from public analytics', async () => {
    const project = await createTestProject()
    
    // Record owner visit
    await recordPreviewView(project.id, { 
      isOwner: true,
      visitorId: project.owner_id 
    })
    
    // Record public visit  
    await recordPreviewView(project.id, { 
      isOwner: false,
      visitorId: 'visitor-123' 
    })
    
    const stats = await getPublicPreviewStats(project.id)
    
    expect(stats.totalViews).toBe(1) // Only public visit counted
    expect(stats.uniqueVisitors).toBe(1)
  })
})
```

---

## Expert Assessment & My Analysis

### ✅ **What I Strongly Agree With:**

1. **Paid Tier Gating** - Privacy features as premium functionality makes business sense
2. **Server-Side Password Hashing** - Never trust client with bcrypt operations
3. **7-Day Password Cookies** - Reduces friction while maintaining security
4. **Owner Visit Exclusion** - Critical for accurate public analytics
5. **SEO Headers** - `noindex, nofollow` for private previews prevents leaks
6. **Artifact Expiry Handling** - Clear UX when previews are unavailable

### ⚠️ **What I Question (Potential Over-Engineering):**

1. **Multiple Auth Modes** - 4 different privacy modes might confuse users. Consider starting with just Public/Owner-only/Password.

2. **JWT Share Links** - While technically elegant, this adds significant complexity. Simple password sharing might serve 90% of use cases.

3. **Edge Worker Requirement** - Adds infrastructure dependency and deployment complexity. Consider if Next.js middleware can handle most cases.

4. **Complex Cookie Signing** - The password cookie verification logic is sophisticated but might be overkill for this use case.

### 🎯 **Recommended Implementation Phases:**

#### **Phase 1: Core Privacy (2-3 weeks)**
- Public/Owner-only/Password modes
- Basic UI with radio buttons
- Server-side password hashing
- Next.js middleware enforcement

#### **Phase 2: UX Polish (1-2 weeks)**  
- Status indicators and badges
- Disabled state tooltips
- Owner analytics exclusion
- Error boundary handling

#### **Phase 3: Advanced Features (Future)**
- JWT share links (if user demand exists)
- Edge worker optimization (if performance needed)
- Organization-level access (enterprise feature)

The expert's plan is architecturally sound and comprehensive, but I'd recommend starting with core functionality and adding complexity based on actual user needs rather than theoretical requirements.

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Analyze expert preview feature recommendations", "status": "completed", "priority": "high"}, {"id": "2", "content": "Update Supabase auth document with relevant backend changes", "status": "completed", "priority": "high"}, {"id": "3", "content": "Create comprehensive Preview Features document", "status": "completed", "priority": "high"}, {"id": "4", "content": "Identify over-engineering concerns and simplification opportunities", "status": "completed", "priority": "medium"}]