# Anonymous User Experience - Implementation Plan

**Date**: 2026-01-17 (Revised with Expert Feedback)
**Status**: Planning Phase - Production-Ready
**Priority**: High - Conversion Optimization
**Target Users**: Arabic-speaking, non-tech-savvy entrepreneurs

---

## ⚠️ Critical Revisions from Initial Plan

**Expert Feedback Round 1** (2026-01-17):

1. ✅ **Storage RLS Fixed**: Switched from folder-based to DB-based authorization (prevents post-conversion access issues)
2. ✅ **Service-Role Isolation**: Moved all admin operations to worker (adheres to platform architecture)
3. ✅ **Privacy Leak Fixed**: Business ideas stored server-side with draft IDs (not in URLs/logs/history)
4. ✅ **Quota Code Fixed**: Replaced `.sum()` with SQL/RPC (Supabase JS doesn't support aggregate methods)
5. ✅ **Schema Consistency Fixed**: Added `created_at` column (cleanup queries were using non-existent field)
6. ✅ **Feature Flag Security**: Added server-side enforcement (NEXT_PUBLIC is UI hint only, not security)
7. ✅ **Anonymous User Deletion**: Changed to soft-delete with 7-30 day retention (audit trail + safety)

**Expert Feedback Round 2** (2026-01-17 - Production-Ready Fixes):

**P0 Fixes (Must Have)**:
1. ✅ **Server Flag Enforcement**: Fixed API routes to use `isFeatureEnabledServerSide()` (not client-side `isFeatureEnabled()`)
2. ✅ **Cleanup Job Architecture**: Moved cleanup to worker with admin client (removed service-role from Next.js runtime)
3. ✅ **Email Confirmation Handling**: Added workaround options for Supabase email confirmation breaking claim flow

**P1 Fixes (Important)**:
4. ✅ **Analytics Schema**: Added `is_anonymous` column to enable analytics queries
5. ✅ **Draft Endpoint Caching**: Added explicit `no-store` configuration for sensitive draft data
6. ✅ **IP Privacy**: Changed `ip_address INET` to `ip_hash TEXT` with SHA-256 hashing
7. ✅ **Test Assertions**: Updated tests to expect soft-delete (not hard-delete)
8. ✅ **Documentation Consistency**: Fixed "Storage bucket policies" reference (now DB-based RLS)

**Key Architectural Changes**:
- Next.js → Worker proxy pattern for all privileged operations
- Storage access via DB row ownership, not folder naming
- Draft payload system for sensitive data (never in query params)
- SQL functions for aggregations (not client-side math)

---

## Executive Summary

This plan enables anonymous users to experience SheenApps' core value proposition (voice input → instant project creation) **before** requiring authentication. The goal is to reduce friction, increase conversion, and capture valuable voice/intent data while maintaining security and data quality.

### Key Features (All Flag-Controlled)

1. **Anonymous Voice Recording** - Save transcriptions + audio from unauthenticated users
2. **Anonymous First Build** - Let users see their project built before signing up
3. **Seamless Account Conversion** - Link anonymous data to created accounts
4. **Smart Onboarding Prompts** - Context-aware "Sign up to save" messaging

### Success Metrics

- **Conversion Rate**: % of anonymous users who complete sign-up after demo
- **Voice Recording Quality**: Transcription accuracy, language distribution
- **Time to Value**: Seconds from homepage → seeing deployed preview
- **Data Quality**: % of anonymous projects successfully claimed

---

## Problem Statement

### Current Friction Points

1. **Homepage Voice Button** - Opens modal, transcribes, but:
   - ❌ Doesn't save audio recording
   - ❌ Only fills textarea (user still needs to type or paste)
   - ❌ No immediate value demonstration

2. **Builder Page** - Requires sign-in before:
   - ❌ User sees any results
   - ❌ User understands what SheenApps can do
   - ❌ User invests time in describing their idea

3. **Lost Opportunities**:
   - No data from users who bounce before signing up
   - Can't analyze why users didn't convert
   - Can't A/B test value proposition before auth wall

### Target User Profile

**Persona**: Arabic-speaking small business owner
- Limited technical knowledge
- Time-constrained (wants quick results)
- Skeptical of "yet another platform"
- Needs to **see** before believing

**Behavioral Goals**:
- Speak idea in Arabic → See website in <60 seconds
- Zero typing required (voice-first UX)
- Minimal steps to "wow moment"
- Clear path to save/claim their project

---

## User Journey Comparison

### Current Flow (Authenticated-First)

```
Homepage
  ↓
Click "Start Building"
  ↓
[FRICTION] → Sign In Required Modal
  ↓
Create Account / Sign In
  ↓
Builder Page (Empty State)
  ↓
Type/Paste Business Idea
  ↓
Click "Start Building"
  ↓
Wait 60-90 seconds
  ↓
View Deployed Preview
```

**Time to Value**: ~5-8 minutes
**Drop-off Points**: Sign-in (60%), Empty builder (20%), Waiting (10%)

### Proposed Flow (Anonymous-First)

```
Homepage
  ↓
Click "استخدم الصوت" (Use Voice)
  ↓
[NO FRICTION] → Speak Idea (30 seconds)
  ↓
Auto-submit to Builder (Transcribed Text)
  ↓
Anonymous Build Starts Immediately
  ↓
Real-time Build Progress (45-60 seconds)
  ↓
[WOW MOMENT] → Preview Ready!
  ↓
[CONVERSION PROMPT] → "Sign up to save your project"
  ↓
Sign Up (Pre-filled with project context)
  ↓
Project Linked to Account ✅
```

**Time to Value**: ~90 seconds
**Drop-off Points**: After seeing results (expected <20%)

---

## Technical Architecture

### 1. Anonymous Session Management

#### **Option A: Lightweight Supabase Anonymous Users** (Recommended)

**Approach**: Use Supabase's built-in anonymous auth

```typescript
// Create anonymous user on first interaction
const { data, error } = await supabase.auth.signInAnonymously()

// Session stored in httpOnly cookie (secure)
// UID: valid UUID, works with all RLS policies
// Metadata: { is_anonymous: true, created_at, device_id }
```

**Benefits**:
- ✅ Works with existing RLS policies (auth.uid() available)
- ✅ Standard Supabase session cookies
- ✅ Easy conversion to authenticated user
- ✅ No schema changes to projects/voice_recordings tables
- ✅ Storage access via DB row ownership (RLS enforced)

**Drawbacks**:
- ⚠️ Creates auth.users entries (need cleanup job)
- ⚠️ Session expiry requires re-creation

**Implementation**:

```typescript
// src/lib/anonymous-session.ts
export async function ensureAnonymousSession() {
  const supabase = createClient()

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.user) {
    return session.user // Already authenticated (anon or real)
  }

  // Create anonymous user
  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: {
        is_anonymous: true,
        device_fingerprint: getDeviceFingerprint(),
        created_via: 'voice_input', // or 'homepage_demo'
        locale: navigator.language
      }
    }
  })

  if (error) throw error
  return data.user
}
```

#### **Option B: Device-ID + API Key Pairs** (Alternative)

**Approach**: Generate ephemeral API keys, no Supabase auth users

```typescript
// API endpoint creates device session
POST /api/anonymous/sessions
Response: { api_key: "anon_...", device_id: "...", expires_at: "..." }

// Stored in localStorage + httpOnly cookie
// Separate tables: anonymous_projects, anonymous_voice_recordings
```

**Benefits**:
- ✅ No auth.users table pollution
- ✅ Explicit separation of anonymous data
- ✅ Fine-grained TTL control

**Drawbacks**:
- ❌ Requires new tables + duplicate schema
- ❌ Bypasses RLS (custom auth middleware needed)
- ❌ More complex account conversion logic
- ❌ Can't reuse existing worker endpoints easily

**Decision**: Use **Option A** (Supabase Anonymous Auth) for v1.

---

### 2. Database Schema Changes

#### **No Schema Changes Required** ✅

Existing tables work with anonymous users:

```sql
-- projects table (no changes)
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id), -- Works with anon users!
  name TEXT,
  config JSONB,
  build_status TEXT,
  created_at TIMESTAMPTZ,
  ...
);

-- voice_recordings table (no changes)
CREATE TABLE voice_recordings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id), -- Works with anon users!
  project_id UUID REFERENCES projects(id),
  audio_url TEXT,
  transcription TEXT,
  created_at TIMESTAMPTZ,
  ...
);
```

#### **New: Anonymous User Metadata**

Add metadata tracking in `auth.users.raw_user_meta_data`:

```json
{
  "is_anonymous": true,
  "created_via": "voice_input",
  "device_fingerprint": "abc123...",
  "locale": "ar-sa",
  "conversion_completed": false,
  "converted_to_user_id": null,
  "converted_at": null
}
```

#### **New: Cleanup Tracking Table**

**SCHEMA FIX**: Add `created_at` for consistency with cleanup queries 🔧

```sql
-- Migration: 20260117_anonymous_session_tracking.sql
CREATE TABLE anonymous_session_metadata (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  created_via TEXT NOT NULL, -- 'voice_input' | 'homepage_demo' | 'builder_direct'
  locale TEXT,
  ip_hash TEXT, -- FIXED P1: SHA-256 hash for privacy (not raw IP)
  user_agent TEXT,
  is_anonymous BOOLEAN DEFAULT TRUE, -- FIXED P1: For analytics queries
  created_at TIMESTAMPTZ DEFAULT NOW(), -- ADDED: For cleanup queries
  first_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  conversion_completed BOOLEAN DEFAULT FALSE,
  converted_to_user_id UUID REFERENCES auth.users(id),
  converted_at TIMESTAMPTZ,

  -- Cleanup flags
  marked_for_deletion BOOLEAN DEFAULT FALSE,
  deletion_scheduled_at TIMESTAMPTZ,

  -- Analytics
  projects_created INT DEFAULT 0,
  voice_recordings_count INT DEFAULT 0,
  builds_started INT DEFAULT 0,

  CONSTRAINT valid_conversion CHECK (
    (conversion_completed = TRUE AND converted_to_user_id IS NOT NULL) OR
    (conversion_completed = FALSE AND converted_to_user_id IS NULL)
  )
);

CREATE INDEX idx_anon_cleanup ON anonymous_session_metadata(marked_for_deletion, deletion_scheduled_at)
  WHERE marked_for_deletion = TRUE;

CREATE INDEX idx_anon_conversion ON anonymous_session_metadata(conversion_completed)
  WHERE conversion_completed = FALSE;

-- Index for cleanup job (finds old sessions)
CREATE INDEX idx_anon_created_at ON anonymous_session_metadata(created_at)
  WHERE conversion_completed = FALSE;
```

---

### 3. RLS Policy Updates

#### **Existing Policies Work As-Is** ✅

Because anonymous users are real Supabase auth users, no RLS changes needed:

```sql
-- Projects: User sees their own projects (anon or authenticated)
CREATE POLICY "projects_select_own"
  ON projects FOR SELECT
  USING (auth.uid() = owner_id);

-- Voice Recordings: User sees their own recordings
CREATE POLICY "voice_recordings_select_own"
  ON voice_recordings FOR SELECT
  USING (auth.uid() = user_id);
```

#### **Optional: Enhanced Policies for Admin Visibility**

```sql
-- Allow admins to query anonymous user data
CREATE POLICY "admin_view_anonymous_projects"
  ON projects FOR SELECT
  USING (
    -- Regular user access
    auth.uid() = owner_id
    OR
    -- Admin access to anonymous projects (for support/moderation)
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.permissions @> '["projects.view_all"]'::jsonb
    )
  );
```

---

### 4. Storage Bucket Policies

#### **CRITICAL FIX: DB-Based Authorization Required** 🔧

**Problem**: Folder-based RLS breaks after account conversion. When we update `voice_recordings.user_id` from `anonUID` → `newUserID`, the storage file stays in `{anonUID}/...` folder, and the new user can't read it.

**Solution**: Authorize storage access via DB row ownership, not folder name.

```sql
-- FIXED: voice-recordings bucket policy - SELECT (read access)
CREATE POLICY "voice recordings readable by owner via DB"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'voice-recordings'
  AND EXISTS (
    SELECT 1
    FROM public.voice_recordings vr
    WHERE vr.storage_path = storage.objects.name
      AND vr.user_id = auth.uid()
  )
);

-- Keep folder-based policy for INSERT (initial upload)
CREATE POLICY "voice recordings upload allowed"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'voice-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

**Required Schema Change**:

```sql
-- Add storage_path column to voice_recordings table
ALTER TABLE voice_recordings
ADD COLUMN storage_path TEXT;

-- Update existing records
UPDATE voice_recordings
SET storage_path = audio_url
WHERE storage_path IS NULL;

-- Make it required
ALTER TABLE voice_recordings
ALTER COLUMN storage_path SET NOT NULL;

-- Add index for policy performance
CREATE INDEX idx_voice_recordings_storage_path
ON voice_recordings(storage_path);
```

**Application Change**:

When uploading, store the exact storage path:

```typescript
// Before upload
const storagePath = `${userId}/${recordingId}.webm`

// After upload
await supabase.from('voice_recordings').insert({
  user_id: userId,
  audio_url: `${STORAGE_URL}/${storagePath}`,
  storage_path: storagePath, // CRITICAL: Store for RLS policy
  // ...
})
```

✅ **Result**: After conversion, new user can read files via DB ownership, regardless of folder name.

---

### 5. AI Time Billing for Anonymous Users

#### **Strategy: Shared Daily Pool**

Anonymous users share a global daily quota (not per-user balance).

**Why**:
- Prevents abuse (one person can't drain entire pool)
- Encourages sign-up ("Sign up for unlimited builds")
- Simple rate limiting

**CODE FIX**: Supabase JS doesn't have `.sum()` - use SQL/RPC instead 🔧

**Implementation** (moved to worker with SQL aggregation):

```typescript
// Worker: src/services/anonymousQuota.ts
const ANONYMOUS_DAILY_QUOTA_SECONDS = 3600 // 1 hour total/day for all anon users
const ANONYMOUS_MAX_BUILDS_PER_SESSION = 1 // Only 1 build per anon session

export async function checkAnonymousQuota(userId: string): Promise<{
  allowed: boolean
  reason?: string
  suggestion?: string
}> {
  // Verify user is anonymous via metadata table (not auth.admin call)
  const { data: metadata } = await supabaseAdmin
    .from('anonymous_session_metadata')
    .select('builds_started')
    .eq('user_id', userId)
    .single()

  if (!metadata) {
    throw new Error('Not an anonymous user')
  }

  // Check 1: Already built once?
  if (metadata.builds_started >= ANONYMOUS_MAX_BUILDS_PER_SESSION) {
    return {
      allowed: false,
      reason: 'ANONYMOUS_BUILD_LIMIT_REACHED',
      suggestion: 'Sign up to create unlimited projects and save your work!'
    }
  }

  // Check 2: Global daily quota via SQL/RPC (not .sum() which doesn't exist)
  const { data: dailyTotal } = await supabaseAdmin.rpc('get_anon_builds_today')

  const estimatedSecondsUsed = (dailyTotal || 0) * 180 // Avg 3min/build

  if (estimatedSecondsUsed >= ANONYMOUS_DAILY_QUOTA_SECONDS) {
    return {
      allowed: false,
      reason: 'ANONYMOUS_DAILY_QUOTA_EXCEEDED',
      suggestion: 'Anonymous demo limit reached for today. Sign up for instant access!'
    }
  }

  return { allowed: true }
}
```

**Required SQL Function**:

```sql
-- Migration: Add RPC for global quota check
CREATE OR REPLACE FUNCTION public.get_anon_builds_today()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(builds_started), 0)
  FROM public.anonymous_session_metadata
  WHERE last_activity_at >= date_trunc('day', now());
$$;

-- Grant execute to authenticated users (worker uses service role)
GRANT EXECUTE ON FUNCTION public.get_anon_builds_today() TO authenticated;
```

**Config in Feature Flags**:

```typescript
// src/lib/feature-flags.ts
export const ANONYMOUS_QUOTAS = {
  DAILY_SECONDS: 3600,           // Total AI time for all anon users/day
  MAX_BUILDS_PER_SESSION: 1,     // Each anon user gets 1 build
  MAX_VOICE_RECORDINGS: 3,       // Each anon user gets 3 voice recordings
  SESSION_TTL_HOURS: 24          // Anonymous session expires after 24h
} as const
```

---

## Feature Breakdown with Flags

### Feature Flag Architecture

**SECURITY FIX**: NEXT_PUBLIC is client-side only - enforce on server too 🔧

All anonymous features controlled via centralized flags:

```typescript
// src/lib/feature-flags.ts
export type FeatureFlag =
  | 'ANONYMOUS_VOICE_RECORDING'
  | 'ANONYMOUS_FIRST_BUILD'
  | 'ANONYMOUS_SESSION_PERSISTENCE'
  | 'ANONYMOUS_TO_AUTH_CONVERSION'
  | 'ANONYMOUS_PROJECT_CLAIMING'
  | 'ANONYMOUS_SMART_PROMPTS'

// CLIENT-SIDE: UI hints only (not security)
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const config = FEATURE_CONFIG[flag]
  return config?.enabled ?? false
}

// SERVER-SIDE: Security enforcement (use in API routes + worker)
export function isFeatureEnabledServerSide(flag: FeatureFlag): boolean {
  // Check server env vars (not NEXT_PUBLIC)
  switch (flag) {
    case 'ANONYMOUS_VOICE_RECORDING':
      return process.env.ENABLE_ANON_VOICE === '1'
    case 'ANONYMOUS_FIRST_BUILD':
      return process.env.ENABLE_ANON_BUILD === '1'
    case 'ANONYMOUS_SESSION_PERSISTENCE':
      return process.env.ENABLE_ANON_SESSIONS === '1'
    case 'ANONYMOUS_TO_AUTH_CONVERSION':
      return process.env.ENABLE_ANON_CONVERSION === '1'
    case 'ANONYMOUS_PROJECT_CLAIMING':
      return process.env.ENABLE_PROJECT_CLAIMING === '1'
    case 'ANONYMOUS_SMART_PROMPTS':
      return process.env.ENABLE_SMART_PROMPTS === '1'
    default:
      return false
  }
}

export const FEATURE_CONFIG = {
  ANONYMOUS_VOICE_RECORDING: {
    enabled: process.env.NEXT_PUBLIC_ENABLE_ANON_VOICE === '1', // UI hint only
    description: 'Allow anonymous users to record voice and save transcriptions',
    dependencies: []
  },
  ANONYMOUS_FIRST_BUILD: {
    enabled: process.env.NEXT_PUBLIC_ENABLE_ANON_BUILD === '1',
    description: 'Allow anonymous users to create and deploy one project',
    dependencies: ['ANONYMOUS_SESSION_PERSISTENCE']
  },
  ANONYMOUS_SESSION_PERSISTENCE: {
    enabled: process.env.NEXT_PUBLIC_ENABLE_ANON_SESSIONS === '1',
    description: 'Create and persist anonymous Supabase sessions',
    dependencies: []
  },
  ANONYMOUS_TO_AUTH_CONVERSION: {
    enabled: process.env.NEXT_PUBLIC_ENABLE_ANON_CONVERSION === '1',
    description: 'Convert anonymous users to authenticated accounts',
    dependencies: ['ANONYMOUS_SESSION_PERSISTENCE']
  },
  ANONYMOUS_PROJECT_CLAIMING: {
    enabled: process.env.NEXT_PUBLIC_ENABLE_PROJECT_CLAIMING === '1',
    description: 'Link anonymous projects to authenticated user after sign-up',
    dependencies: ['ANONYMOUS_TO_AUTH_CONVERSION']
  },
  ANONYMOUS_SMART_PROMPTS: {
    enabled: process.env.NEXT_PUBLIC_ENABLE_SMART_PROMPTS === '1',
    description: 'Context-aware sign-up prompts based on user actions',
    dependencies: []
  }
} as const

// Environment variable reference:
// .env.local (server-side):
// ENABLE_ANON_VOICE=1
// ENABLE_ANON_BUILD=1
// ...
//
// .env.local (client-side):
// NEXT_PUBLIC_ENABLE_ANON_VOICE=1
// NEXT_PUBLIC_ENABLE_ANON_BUILD=1
// ...
```

**Rule**: ALWAYS use `isFeatureEnabledServerSide()` in API routes and worker endpoints.

---

### Feature 1: Anonymous Voice Recording

**Flag**: `ANONYMOUS_VOICE_RECORDING`

**Scope**: Save voice recordings from homepage modal WITHOUT requiring sign-in

**Implementation**:

```typescript
// src/components/sections/voice-recording-modal.tsx (updated)
const transcribeAudio = useCallback(async (blob: Blob) => {
  try {
    setIsTranscribing(true)

    // Ensure anonymous session if not authenticated
    // Note: Client-side check OK here (UI hint, not security enforcement)
    if (isFeatureEnabled('ANONYMOUS_VOICE_RECORDING')) {
      await ensureAnonymousSession()
    }

    const formData = new FormData()
    formData.append('audio', blob)
    formData.append('language', navigator.language.split('-')[0])

    // Use REAL endpoint (not demo) - saves to database
    const response = await fetch('/api/v1/voice/transcribe-anonymous', {
      method: 'POST',
      body: formData
    })

    const result = await response.json()
    onTranscription(result.transcription)
    onClose()

  } catch (err) {
    // Handle errors...
  }
}, [onTranscription, onClose])
```

**New API Endpoint**:

```typescript
// src/app/api/v1/voice/transcribe-anonymous/route.ts
export async function POST(request: NextRequest) {
  // FIXED P0: Server routes must use server-side flag check
  if (!isFeatureEnabledServerSide('ANONYMOUS_VOICE_RECORDING')) {
    return noCacheErrorResponse({ error: 'Feature not enabled' }, 403)
  }

  // Get or create anonymous session
  const supabase = await createServerSupabaseClientNew()
  let { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) return noCacheErrorResponse({ error: 'Session creation failed' }, 500)
    user = data.user
  }

  // Validate anonymous quota
  if (user.user_metadata.is_anonymous) {
    const quota = await checkAnonymousVoiceQuota(user.id)
    if (!quota.allowed) {
      return noCacheErrorResponse({
        error: quota.reason,
        suggestion: quota.suggestion
      }, 429)
    }
  }

  // Same logic as authenticated endpoint (saves to DB with user.id)
  // ... (transcription code)

  return noCacheResponse({
    transcription: result.transcription,
    voiceRecordingId: recordingId,
    isAnonymous: user.user_metadata.is_anonymous
  })
}
```

**Database Impact**:
- ✅ `voice_recordings` entries with `user_id` = anonymous UID
- ✅ Audio files in storage: `{anonUID}/{recordingId}.webm`
- ✅ No orphaned data (FK constraints work)

---

### Feature 2: Anonymous First Build

**Flag**: `ANONYMOUS_FIRST_BUILD`

**Scope**: Let anonymous users create ONE project and see it deployed

**User Flow**:

```
Homepage → Voice Input → Transcribed
  ↓
Auto-redirect to /builder/preview?anon=true
  ↓
Build starts immediately (no "Start Building" click)
  ↓
Progress shown in real-time
  ↓
Preview deployed → Share link + Sign-up CTA
```

**PRIVACY FIX**: Don't put business idea in URL (leaks to logs/history/screenshots) 🔧

**Implementation**:

```typescript
// src/components/sections/hero-v2-client.tsx
const handleVoiceTranscription = async (transcribedText: string) => {
  setIdeaText(transcribedText)

  // Feature flag: Auto-build for anonymous users
  // Note: Client-side check OK here (UI hint, not security enforcement)
  if (isFeatureEnabled('ANONYMOUS_FIRST_BUILD')) {
    const user = await getCurrentUser()

    if (user?.user_metadata?.is_anonymous) {
      // FIXED: Create server-side draft, redirect with ID only
      const response = await fetch('/api/v1/anon/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcribedText })
      })

      const { draftId } = await response.json()

      // Redirect with clean URL (no user data)
      router.push(`/builder/preview?draft=${draftId}&autostart=1`)
      return
    }
  }

  // Regular flow: Just fill textarea
  setIdeaFocused(true)
}
```

**New Draft Storage Endpoint**:

```typescript
// src/app/api/v1/anon/draft/route.ts

// FIXED P1: Explicit no-cache for sensitive draft data
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientNew()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return noCacheErrorResponse({ error: 'UNAUTHENTICATED' }, 401)
  }

  const { text } = await request.json()

  if (!text || text.length > 2000) {
    return noCacheErrorResponse({ error: 'Invalid draft text' }, 400)
  }

  const draftId = crypto.randomUUID()

  // Store in KV or session table (short TTL, 1 hour)
  await redis.set(
    `draft:${user.id}:${draftId}`,
    text,
    { ex: 3600 } // Expire after 1 hour
  )

  return noCacheResponse({ draftId })
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClientNew()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return noCacheErrorResponse({ error: 'UNAUTHENTICATED' }, 401)
  }

  const { searchParams } = new URL(request.url)
  const draftId = searchParams.get('id')

  if (!draftId) {
    return noCacheErrorResponse({ error: 'Missing draft ID' }, 400)
  }

  const text = await redis.get(`draft:${user.id}:${draftId}`)

  if (!text) {
    return noCacheErrorResponse({ error: 'Draft not found or expired' }, 404)
  }

  return noCacheResponse({ text })
}
```

**Builder Page Consumes Draft**:

```typescript
// src/app/[locale]/builder/preview/page.tsx
export default async function AnonymousPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ draft?: string; autostart?: string }>
}) {
  const { draft: draftId, autostart } = await searchParams

  let ideaText = ''

  if (draftId) {
    // Fetch draft from server-side
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/v1/anon/draft?id=${draftId}`, {
      headers: { 'Cookie': cookies().toString() }
    })

    if (response.ok) {
      const { text } = await response.json()
      ideaText = text
    }
  }

  return (
    <AnonymousBuilderPage
      initialIdea={ideaText}
      autoStart={autostart === '1'}
    />
  )
}
```

✅ **Result**: User's business idea never appears in URL, browser history, or server logs.

**New Builder Route**:

```typescript
// src/app/[locale]/builder/preview/page.tsx
export default async function AnonymousPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ idea?: string; autostart?: string }>
}) {
  // FIXED P0: Server component must use server-side flag check
  if (!isFeatureEnabledServerSide('ANONYMOUS_FIRST_BUILD')) {
    redirect('/builder/new')
  }

  const { idea, autostart } = await searchParams
  const supabase = await createServerSupabaseClientNew()
  const { data: { user } } = await supabase.auth.getUser()

  // FIXED P0: Server component must use server-side flag check
  if (!isFeatureEnabledServerSide('ANONYMOUS_FIRST_BUILD') || !user?.user_metadata?.is_anonymous) {
    // Authenticated users or feature disabled → regular builder
    redirect('/builder/new')
  }

  // Check quota
  const quota = await checkAnonymousQuota(user.id)
  if (!quota.allowed) {
    return <AnonymousQuotaExceeded reason={quota.reason} suggestion={quota.suggestion} />
  }

  return (
    <AnonymousBuilderPage
      initialIdea={idea || ''}
      autoStart={autostart === '1'}
      userId={user.id}
    />
  )
}
```

**Worker Endpoint Compatibility**:

No changes needed! Existing `/v1/create-preview-for-new-project` works with anonymous UIDs:

```typescript
// Worker receives:
{
  userId: "anon-uuid-...",  // ✅ Valid auth.users ID
  prompt: "أريد بيع الكوكيز...",
  metadata: { source: 'anonymous_demo' }
}

// Worker creates project:
owner_id: "anon-uuid-..." // ✅ FK valid, RLS works
```

**Database Impact**:
- ✅ `projects` table: `owner_id` = anonymous UID
- ✅ `project_build_metrics`: Tracks anonymous builds
- ✅ Build queue: Uses anonymous UID for deduplication

---

### Feature 3: Anonymous to Authenticated Conversion

**Flag**: `ANONYMOUS_TO_AUTH_CONVERSION`

**Scope**: Link anonymous session data to newly created account

**Trigger Points**:

1. **After Build Completes**: Show "Sign up to save" modal
2. **After Voice Recording**: Toast with "Create account to access later"
3. **On Preview Page**: Persistent banner "Save your project"

**ARCHITECTURE FIX**: Move all service-role operations to worker (per platform rules) 🔧

**Implementation Pattern**: Next.js → Worker Proxy

**Next.js API Route** (no service-role key):

```typescript
// src/app/api/v1/anon/claim/route.ts
export async function POST(request: NextRequest) {
  // Check feature flag server-side (not just NEXT_PUBLIC)
  if (!isFeatureEnabledServerSide('ANONYMOUS_TO_AUTH_CONVERSION')) {
    return noCacheErrorResponse({ error: 'Feature not enabled' }, 403)
  }

  const supabase = await createServerSupabaseClientNew()
  const { data: { user } } = await supabase.auth.getUser()

  // FIXED P0: Handle email confirmation scenario
  // If email confirmation is enabled, signUp() won't return a session immediately
  // User must either:
  //   A) Confirm email first, then call this endpoint
  //   B) Use conversion token (see alternative implementation below)
  if (!user) {
    return noCacheErrorResponse({
      error: 'UNAUTHENTICATED',
      message: 'If email confirmation is required, please confirm your email before claiming projects'
    }, 401)
  }

  const { anonymousUserId } = await request.json()

  // Validate UUID format
  if (!anonymousUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anonymousUserId)) {
    return noCacheErrorResponse({ error: 'Invalid anonymousUserId' }, 400)
  }

  // IMPORTANT: No service-role work here. Proxy to worker.
  const headers = createWorkerAuthHeaders('POST', '/v1/anon/claim', JSON.stringify({
    anonymousUserId,
    newUserId: user.id
  }))

  const response = await fetch(`${process.env.WORKER_BASE_URL}/v1/anon/claim`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      anonymousUserId,
      newUserId: user.id
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Conversion failed' }))
    return noCacheErrorResponse(error, response.status)
  }

  const result = await response.json()
  return noCacheResponse(result)
}
```

**Email Confirmation Workaround** (P0):

If email confirmation is enabled in Supabase Auth settings, users must confirm their email before a session is established. This breaks the immediate claim flow. Choose one solution:

**Option A: Disable Email Confirmation** (Simplest, recommended for launch)
```typescript
// Supabase Dashboard: Authentication → Email Auth → Disable "Confirm email"
// Pro: Immediate session after signUp, seamless claim
// Con: Less secure (consider adding 2FA later)
```

**Option B: Post-Confirmation Claim** (More secure)
```typescript
// Flow: signUp → email sent → user confirms → redirect to claim
// In sign-up success page:
const { anonymousUserId } = sessionStorage.getItem('anon_claim_pending')
if (anonymousUserId && user) {
  await fetch('/api/v1/anon/claim', {
    method: 'POST',
    body: JSON.stringify({ anonymousUserId })
  })
  sessionStorage.removeItem('anon_claim_pending')
}
```

**Option C: Conversion Token** (Most complex, best UX)
```typescript
// Before signUp, mint a secure token:
const conversionToken = await mintConversionToken(anonymousUserId)
// Store in Redis with 15-minute TTL, tied to device fingerprint

// After signUp (even without session), verify via worker:
// POST /v1/anon/claim-token { token, email }
// Worker validates token + fingerprint, queues claim job
```

**Recommendation**: Start with **Option A** (no email confirmation) for MVP. Add Option B or C if abuse becomes an issue.

---

**Worker Endpoint** (privileged operations):

```typescript
// worker: src/routes/anonymousClaim.ts
export default async function anonymousClaimRoutes(app: FastifyInstance) {
  app.post<{
    Body: { anonymousUserId: string; newUserId: string }
  }>(
    '/v1/anon/claim',
    {
      preHandler: requireHmacSignature()
    },
    async (request, reply) => {
      const { anonymousUserId, newUserId } = request.body

      // 1) Verify anon user via admin auth
      const { data: anonUserData } = await supabaseAdmin.auth.admin.getUserById(anonymousUserId)

      if (!anonUserData?.user?.user_metadata?.is_anonymous) {
        return reply.status(400).send({ error: 'NOT_ANON' })
      }

      // 2) Transfer DB ownership (projects + voice_recordings)
      const { data: projects } = await supabaseAdmin
        .from('projects')
        .update({ owner_id: newUserId })
        .eq('owner_id', anonymousUserId)
        .select('id')

      const { data: recordings } = await supabaseAdmin
        .from('voice_recordings')
        .update({ user_id: newUserId })
        .eq('user_id', anonymousUserId)
        .select('id')

      // 3) Mark conversion in metadata
      await supabaseAdmin
        .from('anonymous_session_metadata')
        .update({
          conversion_completed: true,
          converted_to_user_id: newUserId,
          converted_at: new Date().toISOString()
        })
        .eq('user_id', anonymousUserId)

      // 4) OPTIONAL: Delete anon user (see below - keep for 7-30 days recommended)
      // await supabaseAdmin.auth.admin.deleteUser(anonymousUserId)

      return reply.send({
        ok: true,
        projectsClaimed: projects?.length ?? 0,
        recordingsClaimed: recordings?.length ?? 0
      })
    }
  )
}
```

**Sign-Up Flow Integration**:

```typescript
// src/app/api/auth/signup/route.ts
export async function POST(request: NextRequest) {
  const { email, password, anonymousUserId } = await request.json()

  const supabase = await createServerSupabaseClientNew()

  // Create authenticated account
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        converted_from_anonymous: anonymousUserId || null
      }
    }
  })

  if (error) return noCacheErrorResponse({ error: error.message }, 400)

  // Link anonymous data if provided (via worker proxy)
  if (anonymousUserId && isFeatureEnabledServerSide('ANONYMOUS_PROJECT_CLAIMING')) {
    try {
      const claimResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/v1/anon/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || '' // Forward session
        },
        body: JSON.stringify({ anonymousUserId })
      })

      if (claimResponse.ok) {
        const claimed = await claimResponse.json()
        return noCacheResponse({
          user: data.user,
          session: data.session,
          claimed
        })
      }
    } catch (err) {
      console.error('Anonymous conversion failed:', err)
      // Don't block sign-up on conversion failure
    }
  }

  return noCacheResponse({ user: data.user, session: data.session })
}
```

**IMPORTANT: Anonymous User Deletion Strategy**

Don't delete immediately (audit trail + safety):

```typescript
// Recommended: Keep for 7-30 days, soft-delete first
await supabaseAdmin
  .from('anonymous_session_metadata')
  .update({
    marked_for_deletion: true,
    deletion_scheduled_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  })
  .eq('user_id', anonymousUserId)

// Cleanup job deletes auth user later (see Data Retention section)
```

---

### Feature 4: Smart Onboarding Prompts

**Flag**: `ANONYMOUS_SMART_PROMPTS`

**Scope**: Context-aware sign-up CTAs based on user journey

**Prompt Variants**:

| Trigger | Message (Arabic) | Message (English) |
|---------|------------------|-------------------|
| After voice recording | "سجل الآن لحفظ تسجيلاتك الصوتية" | "Sign up to save your voice recordings" |
| Build completed | "مشروعك جاهز! أنشئ حساب للاحتفاظ به" | "Your project is ready! Create an account to keep it" |
| Viewing preview | "أنشئ حساب للوصول لاحقًا" | "Sign up to access later" |
| After 3 voice recordings | "وصلت للحد الأقصى. سجل للمواصلة" | "Limit reached. Sign up to continue" |

**Implementation**:

```typescript
// src/components/anonymous/smart-prompt.tsx
export function SmartSignUpPrompt({
  trigger,
  context
}: {
  trigger: 'voice_recorded' | 'build_complete' | 'viewing_preview' | 'quota_reached'
  context?: { projectId?: string; recordingCount?: number }
}) {
  const t = useTranslations('anonymous')

  // Note: Client component check OK here (UI hint, not security enforcement)
  if (!isFeatureEnabled('ANONYMOUS_SMART_PROMPTS')) {
    return null
  }

  const messages = {
    voice_recorded: {
      title: t('prompts.voiceRecorded.title'),
      description: t('prompts.voiceRecorded.description'),
      cta: t('prompts.voiceRecorded.cta')
    },
    build_complete: {
      title: t('prompts.buildComplete.title'),
      description: t('prompts.buildComplete.description'),
      cta: t('prompts.buildComplete.cta')
    },
    // ... other variants
  }

  const msg = messages[trigger]

  return (
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{msg.title}</DialogTitle>
          <DialogDescription>{msg.description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => /* dismiss */}>
            {t('prompts.maybeLater')}
          </Button>
          <Button onClick={() => /* redirect to sign-up with context */}>
            {msg.cta}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Anonymous session infrastructure

- [ ] Add Supabase anonymous auth support
- [ ] Create `anonymous_session_metadata` table
- [ ] Implement `ensureAnonymousSession()` helper
- [ ] Add feature flags to config
- [ ] Create anonymous quota checking service
- [ ] Write cleanup job for expired sessions

**Deliverable**: Anonymous users can be created and tracked

---

### Phase 2: Voice Recording (Week 1-2)

**Goal**: Save voice recordings from anonymous users

- [ ] Update voice recording modal to use anonymous sessions
- [ ] Create `/api/v1/voice/transcribe-anonymous` endpoint
- [ ] Add quota validation (max 3 recordings per session)
- [ ] Test storage bucket access with anonymous UIDs
- [ ] Add analytics tracking for anonymous voice usage

**Deliverable**: Homepage voice button saves recordings to database

---

### Phase 3: First Build Demo (Week 2-3)

**Goal**: Let anonymous users see one project built

- [ ] Create `/builder/preview` route for anonymous users
- [ ] Implement auto-build on voice transcription
- [ ] Add build progress UI for anonymous sessions
- [ ] Implement anonymous quota (1 build per session)
- [ ] Add "Sign up to save" modal after build completes
- [ ] Test end-to-end flow with worker

**Deliverable**: Anonymous users can build and preview one project

---

### Phase 4: Account Conversion (Week 3-4)

**Goal**: Link anonymous data to new accounts

- [ ] Implement `convertAnonymousToAuthenticated()` function
- [ ] Update sign-up flow to accept `anonymousUserId`
- [ ] Handle storage file ownership transfer
- [ ] Add success messaging ("2 projects claimed!")
- [ ] Create conversion analytics dashboard
- [ ] Test edge cases (multiple anon sessions, expired sessions)

**Deliverable**: Anonymous projects seamlessly link to new accounts

---

### Phase 5: Smart Prompts & Polish (Week 4-5)

**Goal**: Optimize conversion with context-aware CTAs

- [ ] Implement SmartSignUpPrompt component
- [ ] Add all prompt variants with translations
- [ ] A/B test prompt timing and messaging
- [ ] Add "Continue as Guest" option (extend session)
- [ ] Implement session persistence across page reloads
- [ ] Mobile optimization for Arabic RTL layouts

**Deliverable**: Polished, conversion-optimized experience

---

## Security Considerations

### 1. Abuse Prevention

**Rate Limiting**:
```typescript
// Per IP address
- Max 10 anonymous sessions per day
- Max 5 builds per IP per day
- Max 20 voice recordings per IP per day

// Per device fingerprint
- Max 3 anonymous sessions per week
- Max 2 builds per fingerprint per day
```

**Implementation**:
```typescript
// src/middleware/anonymous-rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import crypto from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
})

// FIXED P1: Hash IP addresses for privacy (don't store raw)
function hashIP(ip: string): string {
  const salt = process.env.IP_HASH_SALT! // Rotate periodically
  return crypto.createHash('sha256').update(ip + salt).digest('hex')
}

const ipRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '24 h'),
  prefix: 'anon_ip'
})

const fingerprintRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '7 d'),
  prefix: 'anon_fingerprint'
})

// Usage in middleware/endpoint:
export async function checkAnonymousRateLimit(request: NextRequest) {
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] || request.ip || 'unknown'
  const ipHash = hashIP(clientIP) // FIXED P1: Use hash, not raw IP

  const { success } = await ipRateLimit.limit(ipHash)
  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 })
  }
}
```

### 2. Data Validation

**Voice Recordings**:
- Max file size: 25MB (OpenAI limit)
- Allowed formats: webm, mp3, wav, m4a only
- Content scanning: Flag suspicious transcriptions
- Language validation: Must match declared locale

**Project Prompts**:
- Max length: 2000 characters
- Spam detection: Block repeated identical prompts
- Content moderation: Flag offensive/malicious text

### 3. Storage Quota

**Per Anonymous Session**:
- Voice recordings: Max 75MB total (3 × 25MB)
- Project assets: Max 100MB (one small project)
- Total cleanup after 7 days if unconverted

### 4. Privacy Compliance

**Data Retention**:
- Anonymous sessions: Soft-delete after 7-30 days (marked for cleanup)
- Unconverted projects: Archive after 7 days
- Voice recordings: Retain for analytics (anonymized)
- IP addresses: SHA-256 hashed with salt for rate limiting (FIXED P1: never store raw IPs)

**GDPR Compliance**:
- Anonymous data is pseudonymous (no PII)
- Right to deletion: Provide API for session cleanup
- Transparency: Show "Anonymous session" badge in UI
- Consent: Implicit consent via feature usage

---

## Data Retention & Cleanup

### Cleanup Jobs

**FIXED P0**: Cleanup must run in worker, not Next.js (architecture violation to use service-role in web runtime).

```typescript
// worker/src/jobs/anonymousCleanup.ts (MOVED TO WORKER)
export async function cleanupExpiredAnonymousSessions() {
  const supabase = createAdminSupabaseClient() // Worker uses admin client

  // Find sessions older than 30 days, unconverted
  const { data: expiredSessions } = await supabase
    .from('anonymous_session_metadata')
    .select('user_id')
    .eq('conversion_completed', false)
    .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  for (const session of expiredSessions || []) {
    // Delete projects (cascades to builds, versions)
    await supabase
      .from('projects')
      .delete()
      .eq('owner_id', session.user_id)

    // Delete voice recordings (manually delete storage files)
    const { data: recordings } = await supabase
      .from('voice_recordings')
      .select('audio_url')
      .eq('user_id', session.user_id)

    for (const recording of recordings || []) {
      await supabase.storage
        .from('voice-recordings')
        .remove([recording.audio_url])
    }

    await supabase
      .from('voice_recordings')
      .delete()
      .eq('user_id', session.user_id)

    // Delete auth user
    await supabase.auth.admin.deleteUser(session.user_id)

    // Delete metadata
    await supabase
      .from('anonymous_session_metadata')
      .delete()
      .eq('user_id', session.user_id)
  }

  console.log(`Cleaned up ${expiredSessions?.length || 0} expired anonymous sessions`)
}

// Schedule: Daily at 2 AM UTC
```

### Archival Strategy

**Before Deletion** (for analytics):
```sql
-- Archive table for long-term analysis
CREATE TABLE anonymous_session_archive (
  session_id UUID PRIMARY KEY,
  created_via TEXT,
  locale TEXT,
  projects_created INT,
  voice_recordings_count INT,
  builds_started INT,
  converted BOOLEAN,
  conversion_time_hours INT, -- Time from create to convert
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Populate before cleanup
INSERT INTO anonymous_session_archive
SELECT
  user_id,
  created_via,
  locale,
  projects_created,
  voice_recordings_count,
  builds_started,
  conversion_completed,
  EXTRACT(EPOCH FROM (converted_at - first_interaction_at)) / 3600,
  NOW()
FROM anonymous_session_metadata
WHERE marked_for_deletion = TRUE;
```

---

## Monitoring & Analytics

### Key Metrics Dashboard

```typescript
// Admin dashboard queries
const ANONYMOUS_METRICS = {
  // Funnel metrics (FIXED P1: All queries now use is_anonymous column)
  sessionsCreated: 'SELECT COUNT(*) FROM anonymous_session_metadata WHERE is_anonymous = TRUE AND created_at > NOW() - INTERVAL \'7 days\'',
  voiceRecordingsCount: 'SELECT COUNT(*) FROM voice_recordings WHERE user_id IN (SELECT user_id FROM anonymous_session_metadata WHERE is_anonymous = TRUE)',
  buildsStarted: 'SELECT SUM(builds_started) FROM anonymous_session_metadata WHERE is_anonymous = TRUE',
  conversionsCompleted: 'SELECT COUNT(*) FROM anonymous_session_metadata WHERE conversion_completed = TRUE AND is_anonymous = TRUE',

  // Conversion rate
  conversionRate: `
    SELECT
      (COUNT(*) FILTER (WHERE conversion_completed = TRUE)::FLOAT / COUNT(*)) * 100 as rate
    FROM anonymous_session_metadata
    WHERE created_at > NOW() - INTERVAL '7 days'
  `,

  // Time to conversion
  avgConversionTime: `
    SELECT AVG(EXTRACT(EPOCH FROM (converted_at - first_interaction_at)) / 3600) as hours
    FROM anonymous_session_metadata
    WHERE conversion_completed = TRUE
  `,

  // Locale distribution
  localeBreakdown: `
    SELECT locale, COUNT(*) as count
    FROM anonymous_session_metadata
    GROUP BY locale
    ORDER BY count DESC
  `,

  // Entry points
  entryPointBreakdown: `
    SELECT created_via, COUNT(*) as count
    FROM anonymous_session_metadata
    GROUP BY created_via
    ORDER BY count DESC
  `
}
```

### Conversion Funnel Tracking

```typescript
// Track step completion
enum AnonymousFunnelStep {
  SESSION_CREATED = 'session_created',
  VOICE_RECORDED = 'voice_recorded',
  BUILD_STARTED = 'build_started',
  BUILD_COMPLETED = 'build_completed',
  PREVIEW_VIEWED = 'preview_viewed',
  SIGNUP_PROMPTED = 'signup_prompted',
  SIGNUP_COMPLETED = 'signup_completed'
}

// Log events
trackAnonymousFunnelEvent(userId: string, step: AnonymousFunnelStep, metadata?: object)
```

---

## Rollback Strategy

### Feature Flag Disable

**Immediate Rollback**:
```bash
# Disable all anonymous features instantly
export NEXT_PUBLIC_ENABLE_ANON_VOICE=0
export NEXT_PUBLIC_ENABLE_ANON_BUILD=0
export NEXT_PUBLIC_ENABLE_ANON_SESSIONS=0

# Redeploy Next.js
vercel --prod
```

**Gradual Rollback**:
```typescript
// Percentage rollout (10% of traffic)
export function isAnonymousFeatureEnabled(flag: string): boolean {
  if (!isFeatureEnabled(flag)) return false

  // Random sampling
  const roll = Math.random() * 100
  const rolloutPercentage = parseInt(process.env.ANON_ROLLOUT_PERCENTAGE || '100', 10)

  return roll < rolloutPercentage
}
```

### Data Migration

If rollback needed after data creation:
```sql
-- Mark anonymous users for manual review
UPDATE anonymous_session_metadata
SET marked_for_deletion = TRUE,
    deletion_scheduled_at = NOW() + INTERVAL '7 days'
WHERE conversion_completed = FALSE;

-- Notify users via email (if we captured it)
-- Otherwise, passive expiry
```

---

## Testing Strategy

### Unit Tests

```typescript
// Test anonymous session creation
describe('ensureAnonymousSession', () => {
  it('creates anonymous user if none exists', async () => {
    const user = await ensureAnonymousSession()
    expect(user.user_metadata.is_anonymous).toBe(true)
  })

  it('returns existing session if present', async () => {
    const user1 = await ensureAnonymousSession()
    const user2 = await ensureAnonymousSession()
    expect(user1.id).toEqual(user2.id)
  })
})

// Test quota enforcement
describe('checkAnonymousQuota', () => {
  it('allows first build', async () => {
    const result = await checkAnonymousQuota(anonUserId)
    expect(result.allowed).toBe(true)
  })

  it('blocks second build', async () => {
    await createProject(anonUserId) // First build
    const result = await checkAnonymousQuota(anonUserId)
    expect(result.allowed).toBe(false)
    expect(result.reason).toEqual('ANONYMOUS_BUILD_LIMIT_REACHED')
  })
})
```

### Integration Tests

```typescript
// Test full flow: Voice → Build → Convert
describe('Anonymous to Authenticated Flow', () => {
  it('completes full journey', async () => {
    // 1. Create anonymous session
    const anonUser = await createAnonymousUser()

    // 2. Record voice
    const recording = await recordVoice(anonUser.id, audioBlob)
    expect(recording.user_id).toEqual(anonUser.id)

    // 3. Start build
    const project = await createProject(anonUser.id, prompt)
    expect(project.owner_id).toEqual(anonUser.id)

    // 4. Sign up
    const authUser = await signUp(email, password, anonUser.id)

    // 5. Verify conversion
    const claimed = await getProjects(authUser.id)
    expect(claimed).toHaveLength(1)
    expect(claimed[0].id).toEqual(project.id)

    // 6. Verify soft-delete (FIXED P1: Not hard-deleted, marked for cleanup)
    const anonUserStatus = await getAnonymousSessionMetadata(anonUser.id)
    expect(anonUserStatus.conversion_completed).toBe(true)
    expect(anonUserStatus.marked_for_deletion).toBe(true)
    expect(anonUserStatus.deletion_scheduled_at).toBeTruthy()
    // Note: Actual deletion happens after 7-30 day retention period
  })
})
```

### Manual QA Checklist

- [ ] Homepage voice button works for unauthenticated users
- [ ] Voice recording saved to database with anonymous UID
- [ ] Audio file uploaded to storage bucket
- [ ] Auto-redirect to builder after voice transcription
- [ ] Build starts automatically with transcribed text
- [ ] Build progress shows correctly
- [ ] Preview deploys successfully
- [ ] Sign-up modal appears after build
- [ ] Sign-up with anonymous context links projects
- [ ] Projects appear in authenticated user's dashboard
- [ ] Voice recordings accessible from authenticated account
- [ ] Anonymous session deleted after conversion
- [ ] Quota limits enforced (1 build, 3 recordings)
- [ ] Rate limiting works (per IP, per fingerprint)
- [ ] Cleanup job deletes expired sessions
- [ ] Analytics dashboard shows correct metrics
- [ ] Feature flags disable/enable features correctly
- [ ] Arabic UI/UX works perfectly
- [ ] Mobile experience smooth and fast

---

## Success Criteria

### Launch Readiness

- [ ] All feature flags implemented and tested
- [ ] Conversion funnel tracked end-to-end
- [ ] Security review passed (rate limiting, abuse prevention)
- [ ] Performance benchmarks met (<60s time to preview)
- [ ] Analytics dashboard deployed
- [ ] Cleanup jobs scheduled and tested
- [ ] Rollback procedure documented and tested
- [ ] Arabic translations complete and reviewed
- [ ] Mobile UX tested on real devices
- [ ] A/B test framework ready

### Post-Launch Targets (30 days)

- **Conversion Rate**: >30% of anonymous users sign up
- **Time to Value**: <90 seconds from homepage → preview
- **Voice Recording Quality**: >90% transcription accuracy (Arabic)
- **Build Success Rate**: >95% for anonymous builds
- **Quota Abuse**: <2% of sessions hit rate limits
- **Data Quality**: >80% of anonymous projects claimed

---

## Open Questions & Decisions Needed

1. **Session Duration**: 24 hours or 7 days before prompting re-auth?
2. **Build Limits**: 1 build per session or allow 2-3 iterations?
3. **Voice Quota**: 3 recordings reasonable or too limiting?
4. **Storage Cleanup**: Delete unconverted projects after 7 or 30 days?
5. **Email Capture**: Ask for email before or after build?
6. **Share Links**: Allow anonymous users to share preview URLs?
7. **Locale Persistence**: Store preferred locale in session or ask every time?
8. **Mobile App**: Will anonymous sessions work in mobile app context?

---

## Next Steps

1. **Review this plan** with product/engineering team
2. **Prioritize features** - Which flags to enable first?
3. **Spike on Supabase anonymous auth** - Validate technical approach
4. **Design mockups** for smart prompts and conversion flow
5. **Create implementation tickets** per phase
6. **Set up analytics dashboard** to track metrics
7. **Begin Phase 1** - Anonymous session infrastructure

---

**Document Owner**: Claude Code Agent
**Last Updated**: 2026-01-17
**Review Cycle**: After each phase completion
**Stakeholders**: Product, Engineering, Data/Analytics
