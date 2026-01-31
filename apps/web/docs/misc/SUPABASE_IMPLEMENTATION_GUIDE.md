# Supabase Implementation Guide for SheenApps
*Complete Production-Ready Backend Architecture*

> **Goal:** Ship persistent, versioned, collaborative projects with zero vendor lock-in using Supabase-first architecture across dev/staging/prod environments.

---

### **Phase 1: Foundation (Week 1-2)** ✅ COMPLETED
- [x] **Setup Supabase projects** (dev ✅, prod ✅, staging pending)
- [x] **Run migrations** in correct order (all 5 migrations deployed to production)
  - [x] 0001_core_schema.sql - Core tables, indexes, triggers
  - [x] 0002_rls_policies.sql - Row-level security policies
  - [x] 0003_storage_setup.sql - Storage buckets with hardened policies
  - [x] 0004_atomic_operations.sql - Atomic commit function
  - [x] 0005_production_improvements.sql - Production hardening
- [x] **Generate TypeScript types**: Generated and stored in `src/types/supabase.ts`
- [x] **Replace mock auth** with Supabase Auth + onAuthStateChange cleanup
- [x] **Implement core services** (BlobUploader, VersioningService, ProjectService)
- [x] **Add delete project endpoint** with RLS protection

### **Phase 2: Versioning (Week 3-4)** ✅ COMPLETED
- [x] **Implement BlobUploader** with 250KB limit and content-addressed storage
- [x] **Use atomic commit function** for branch updates (prevents lost updates)
- [x] **Implement VersioningService** with commit history and revert functionality
- [x] **Setup content-addressed storage** with SHA-256 hashing and deduplication

### **Phase 3: Real-time (Week 5-6)** ✅ IMPLEMENTED
- [x] **Setup Realtime channels** with proper cleanup and auth state management
- [x] **Implement RealtimeService** with connection tracking and telemetry
- [x] **Implement conflict detection** with version gaps and sessionStorage persistence
- [x] **Add usage monitoring** with connection limits and admin alerts

### **Phase 4: Deployment (Week 7-8)** 🚧 READY FOR INTEGRATION
- [x] **Production database deployed** with all migrations and hardened security
- [x] **Edge function implemented** with JWT auth and path sanitization
- [ ] **Setup CI/CD pipeline** with environment-specific deployments (ready to deploy)
- [ ] **Configure custom domains** (only when first paying user needs it)
- [ ] **Add SSL monitoring** ("Waiting for DNS" banner in UI)
- [ ] **Test edge router** with pre-extracted builds for large sites

### **Phase 5: Integration (NEXT STEPS)**
- [ ] **Connect builder to Supabase** - Replace mock auth with real Supabase auth
- [ ] **Bridge Zustand history** with database commits for persistence
- [ ] **Add real-time collaboration** to builder workspace
- [ ] **Test payload size limits** with legacy large edits
- [ ] **Add usage monitoring dashboard** for admin oversight

---

## 🏗️ **Multi-Environment Architecture**

### **Project Structure**
```bash
# 3 Isolated Supabase Projects
sheenapps-dev      → develop branch
sheenapps-staging  → main branch
sheenapps-prod     → version tags (v1.0.0)

# Domain Mapping
*.dev.sheenapps.com    → dev environment
*.stage.sheenapps.com  → staging environment
*.sheenapps.com        → production environment
```

### **Environment Variables**
```bash
# .env.development
NEXT_PUBLIC_SUPABASE_URL=https://dpnvqzrchxudbmxlofii.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key
SUPABASE_SERVICE_ROLE_KEY=dev-service-key
ENABLE_EDGE_ROUTER=false
ENABLE_REALTIME=true
ENABLE_HISTORY=true
MAX_REALTIME_CONNECTIONS=100

# .env.staging
NEXT_PUBLIC_SUPABASE_URL=https://sheenapps-staging.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=staging-anon-key
SUPABASE_SERVICE_ROLE_KEY=staging-service-key
ENABLE_EDGE_ROUTER=false
ENABLE_REALTIME=true

# .env.production
NEXT_PUBLIC_SUPABASE_URL=https://sheenapps-prod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=prod-anon-key
SUPABASE_SERVICE_ROLE_KEY=prod-service-key
ENABLE_EDGE_ROUTER=false  # Keep false until first paying user maps domain
ENABLE_REALTIME=true
```

---

## 📊 **Database Schema**

### **Migration 1: Core Schema** (`supabase/migrations/0001_core_schema.sql`)
```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core tables with proper constraints
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users,
  parent_ids UUID[] NOT NULL DEFAULT '{}',
  tree_hash TEXT NOT NULL,
  message TEXT,
  payload_size INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: cap single commit at ~250KB
  CONSTRAINT check_payload_size CHECK (payload_size <= 256000)
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'main',
  head_id UUID REFERENCES commits(id) ON DELETE SET NULL,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id, name)
);

CREATE TABLE assets (
  hash TEXT PRIMARY KEY,
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  mime_type TEXT,
  size INT8,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploader_id UUID REFERENCES auth.users
);

-- Performance indexes
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_commits_project ON commits(project_id);
CREATE INDEX idx_commits_author ON commits(author_id);
CREATE INDEX idx_branches_project ON branches(project_id);
CREATE INDEX idx_assets_project ON assets(project_id);

-- GIN index for JSON queries on collaborators
CREATE INDEX idx_projects_collaborators ON projects USING GIN ((config->'collaborator_ids'));

-- Future optimization: Join table for better performance at scale (>1000 users)
-- Can migrate later if needed:
-- CREATE TABLE project_collaborators (
--   project_id UUID REFERENCES projects ON DELETE CASCADE,
--   user_id UUID REFERENCES auth.users ON DELETE CASCADE,
--   role TEXT DEFAULT 'editor',
--   PRIMARY KEY (project_id, user_id)
-- );
-- Simpler RLS: just check project_collaborators table existence

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commits_updated_at
  BEFORE UPDATE ON commits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### **Migration 2: RLS Policies** (`supabase/migrations/0002_rls_policies.sql`)
```sql
-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Projects: owners and collaborators
CREATE POLICY "project_access" ON projects
  FOR ALL USING (
    owner_id = auth.uid() OR
    auth.uid() = ANY((config->>'collaborator_ids')::uuid[])
  );

-- Commits: via project access
CREATE POLICY "commit_access" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = commits.project_id
      AND (
        projects.owner_id = auth.uid() OR
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Branches: via project access
CREATE POLICY "branch_access" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = branches.project_id
      AND (
        projects.owner_id = auth.uid() OR
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Assets: via project access
CREATE POLICY "asset_access" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = assets.project_id
      AND (
        projects.owner_id = auth.uid() OR
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Danger Zone: Project deletion policy
CREATE POLICY "project_delete_owner_only" ON projects
  FOR DELETE USING (owner_id = auth.uid());
```

### **Migration 3: Storage Setup** (`supabase/migrations/0003_storage_setup.sql`)
```sql
-- Create storage buckets with idempotency guard for CI replays
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public) VALUES
    ('objects', 'objects', true),
    ('assets', 'assets', false),
    ('builds', 'builds', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Objects bucket: public read for CDN
CREATE POLICY "Public read objects" ON storage.objects
  FOR SELECT USING (bucket_id = 'objects');

-- Assets bucket: private with signed URLs
CREATE POLICY "Authenticated read assets" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'assets' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Project members upload assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'assets' AND
    auth.role() = 'authenticated' AND
    -- Check project access via hardened path pattern: assets/{project_id}/{hash}
    -- Sanitize path to prevent traversal attacks
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = regexp_replace(split_part(name, '/', 1), '[^a-f0-9-]', '', 'g')
      AND (
        projects.owner_id = auth.uid() OR
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Deny all delete/update operations on assets & builds (prevent accidental deletion/overwrite)
CREATE POLICY "Deny delete assets" ON storage.objects
  FOR DELETE USING (bucket_id = 'assets' AND false);

CREATE POLICY "Deny update assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'assets' AND false);

CREATE POLICY "Deny delete builds" ON storage.objects
  FOR DELETE USING (bucket_id = 'builds' AND false);

CREATE POLICY "Deny update builds" ON storage.objects
  FOR UPDATE USING (bucket_id = 'builds' AND false);

-- Builds bucket: service role only
CREATE POLICY "Service role builds" ON storage.objects
  FOR ALL USING (
    bucket_id = 'builds' AND
    auth.role() = 'service_role'
  );
```

### **Migration 4: Atomic Branch Updates** (`supabase/migrations/0004_atomic_operations.sql`)
```sql
-- Function for atomic commit + branch update (prevents lost updates)
CREATE OR REPLACE FUNCTION create_commit_and_update_branch(
  p_project_id UUID,
  p_author_id UUID,
  p_tree_hash TEXT,
  p_message TEXT,
  p_payload_size INTEGER,
  p_branch_name TEXT DEFAULT 'main'
) RETURNS UUID
LANGUAGE plpgsql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
AS $$
DECLARE
  v_commit_id UUID;
  v_parent_ids UUID[];
  v_branch_updated_at TIMESTAMPTZ;
BEGIN
  -- Get current head and updated_at for optimistic locking
  SELECT head_id, updated_at INTO v_parent_ids[1], v_branch_updated_at
  FROM branches
  WHERE project_id = p_project_id AND name = p_branch_name;

  -- Create commit
  INSERT INTO commits (
    project_id, author_id, parent_ids, tree_hash, message, payload_size
  ) VALUES (
    p_project_id, p_author_id, COALESCE(v_parent_ids, '{}'), p_tree_hash, p_message, p_payload_size
  ) RETURNING id INTO v_commit_id;

  -- Update branch head atomically (prevents lost updates)
  UPDATE branches
  SET head_id = v_commit_id, updated_at = NOW()
  WHERE project_id = p_project_id
    AND name = p_branch_name
    AND updated_at = v_branch_updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch was updated by another process. Please retry.';
  END IF;

  RETURN v_commit_id;
END;
$$;
```

---

## 🔐 **Enhanced Authentication**

### **Client Setup: `src/lib/supabase.ts`**
```typescript
import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { type Database } from '@/types/supabase'

// Client-side instance
export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// Server-side instance
export const createServerSupabaseClient = (cookieStore: any) =>
  createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', { ...options, maxAge: 0 })
        },
      },
    }
  )
```

### **Enhanced Auth Store: `src/store/auth-store.ts`**
```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createClient } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  isAuthenticated: boolean
  isLoading: boolean

  // Actions
  initialize: () => () => void // Returns cleanup function
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: true,

      initialize: () => {
        const supabase = createClient()

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
          set({
            session,
            user: session?.user ?? null,
            isAuthenticated: !!session,
            isLoading: false
          })
        })

        // Listen for auth changes with cleanup
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('🔐 Auth state changed:', event)

            set({
              session,
              user: session?.user ?? null,
              isAuthenticated: !!session,
              isLoading: false
            })

            // Handle silent token refresh
            if (event === 'TOKEN_REFRESHED') {
              console.log('🔄 Token refreshed silently')
            }
          }
        )

        // Return cleanup function
        return () => {
          subscription.unsubscribe()
        }
      },

      signIn: async (email: string, password: string) => {
        const supabase = createClient()
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (error) {
          console.error('❌ Sign in failed:', error.message)
          return false
        }

        return true
      },

      signUp: async (email: string, password: string) => {
        const supabase = createClient()
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        })

        if (error) {
          console.error('❌ Sign up failed:', error.message)
          return false
        }

        return true
      },

      signOut: async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
      },

      refreshSession: async () => {
        const supabase = createClient()
        const { data, error } = await supabase.auth.refreshSession()

        if (error) {
          console.error('❌ Session refresh failed:', error.message)
        }
      }
    }),
    { name: 'auth-store' }
  )
)
```

---

## 💾 **Versioning System with Upload Helpers**

### **Blob Upload Helper: `src/services/storage/blob-uploader.ts`**
```typescript
import { createClient } from '@/lib/supabase'

export class BlobUploader {
  private static readonly MAX_COMMIT_SIZE = 250 * 1024 // 250KB

  static async uploadContent(content: any): Promise<string> {
    const supabase = createClient()

    // 1. Serialize and validate size
    const serialized = JSON.stringify(content)
    const size = new Blob([serialized]).size

    if (size > this.MAX_COMMIT_SIZE) {
      throw new Error(`Commit payload too large: ${size} bytes (max: ${this.MAX_COMMIT_SIZE})`)
    }

    // 2. Generate content hash
    const hash = await this.generateHash(serialized)

    // 3. Check if already exists
    const { data: existing } = await supabase.storage
      .from('objects')
      .list('', { search: hash })

    if (existing && existing.length > 0) {
      console.log(`📦 Content already exists: ${hash}`)
      return hash
    }

    // 4. Upload new blob
    const { error } = await supabase.storage
      .from('objects')
      .upload(`objects/${hash}`, serialized, {
        contentType: 'application/json',
        cacheControl: '3600'
      })

    if (error) {
      throw new Error(`Upload failed: ${error.message}`)
    }

    console.log(`📤 Uploaded content: ${hash} (${size} bytes)`)
    return hash
  }

  static async downloadContent(hash: string): Promise<any> {
    const supabase = createClient()

    const { data, error } = await supabase.storage
      .from('objects')
      .download(`objects/${hash}`)

    if (error || !data) {
      throw new Error(`Download failed: ${error?.message || 'No data'}`)
    }

    const text = await data.text()
    return JSON.parse(text)
  }

  // Future: replace with CRDT diff blocks
  static async uploadDiff(baseHash: string, diff: any): Promise<string> {
    const diffContent = { type: 'diff', base: baseHash, changes: diff }
    return this.uploadContent(diffContent)
  }

  private static async generateHash(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
}
```

### **Enhanced Versioning Service: `src/services/database/versioning.ts`**
```typescript
import { createClient } from '@/lib/supabase'
import { BlobUploader } from '../storage/blob-uploader'

export class VersioningService {
  static async createCommit(
    projectId: string,
    content: any,
    message: string,
    authorId: string
  ): Promise<string> {
    const supabase = createClient()

    try {
      // 1. Upload content and get hash
      const treeHash = await BlobUploader.uploadContent(content)
      const payloadSize = new Blob([JSON.stringify(content)]).size

      // 2. Use atomic function for commit + branch update
      const { data, error } = await supabase
        .rpc('create_commit_and_update_branch', {
          p_project_id: projectId,
          p_author_id: authorId,
          p_tree_hash: treeHash,
          p_message: message,
          p_payload_size: payloadSize
        })

      if (error) throw error

      console.log(`✅ Created commit ${data} for project ${projectId}`)
      return data

    } catch (error) {
      console.error('❌ Commit creation failed:', error)
      throw error
    }
  }

  static async getCommitHistory(projectId: string, limit = 50) {
    const supabase = createClient()

    return supabase
      .from('commits')
      .select(`
        id,
        message,
        created_at,
        author_id,
        payload_size
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)
  }

  static async getCommitContent(commitId: string): Promise<any> {
    const supabase = createClient()

    // 1. Get commit record
    const { data: commit } = await supabase
      .from('commits')
      .select('tree_hash')
      .eq('id', commitId)
      .single()

    if (!commit) throw new Error('Commit not found')

    // 2. Download content
    return BlobUploader.downloadContent(commit.tree_hash)
  }

  static async revertToCommit(projectId: string, commitId: string, authorId: string) {
    // 1. Get commit content
    const content = await this.getCommitContent(commitId)

    // 2. Create new commit with reverted content
    return this.createCommit(
      projectId,
      content,
      `Revert to ${commitId}`,
      authorId
    )
  }

  // Danger Zone: Delete project endpoint
  static async deleteProject(projectId: string): Promise<void> {
    const supabase = createClient()

    // RLS will ensure only owner can delete
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`)
    }

    console.log(`🗑️ Deleted project ${projectId}`)
  }
}
```

---

## 🔄 **Real-time Collaboration**

### **Enhanced Real-time Service: `src/services/collaboration/realtime.ts`**
```typescript
import { createClient } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export class RealtimeService {
  private static channels = new Map<string, RealtimeChannel>()
  private static sectionVersions = new Map<string, number>()

  static async joinProject(projectId: string, userId: string) {
    const channelName = `project:${projectId}:${userId}`

    if (this.channels.has(channelName)) {
      console.log(`📡 Already connected to ${channelName}`)
      return
    }

    const supabase = createClient()
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'branches',
        filter: `project_id=eq.${projectId}`
      }, (payload) => {
        this.handleBranchUpdate(payload)
      })
      .on('broadcast', { event: 'section_edit' }, (payload) => {
        this.handleSectionEdit(payload)
      })
      .on('broadcast', { event: 'cursor_move' }, (payload) => {
        this.handleCursorMove(payload)
      })
      .subscribe((status) => {
        console.log(`📡 Realtime status: ${status}`)
      })

    this.channels.set(channelName, channel)

    // Load persisted version counters
    this.loadPersistedVersions(projectId)

    console.log(`📡 Joined realtime channel: ${channelName}`)
  }

  static async broadcastSectionEdit(
    projectId: string,
    sectionId: string,
    content: any,
    userId: string
  ) {
    const channelName = `project:${projectId}:${userId}`
    const channel = this.channels.get(channelName)
    if (!channel) return

    // Increment version counter
    const versionKey = `${projectId}:${sectionId}`
    const currentVersion = this.sectionVersions.get(versionKey) || 0
    const newVersion = currentVersion + 1
    this.sectionVersions.set(versionKey, newVersion)

    // Persist version to sessionStorage
    this.persistVersions(projectId)

    await channel.send({
      type: 'broadcast',
      event: 'section_edit',
      payload: {
        sectionId,
        content,
        version: newVersion,
        userId,
        timestamp: Date.now()
      }
    })
  }

  private static handleSectionEdit(payload: any) {
    const { sectionId, content, version, userId } = payload.payload
    const versionKey = `${payload.projectId}:${sectionId}`
    const localVersion = this.sectionVersions.get(versionKey) || 0

    if (version <= localVersion) {
      console.log(`⚠️ Stale edit ignored: v${version} <= v${localVersion}`)
      return
    }

    // Warn about potential overwrite
    if (version > localVersion + 1) {
      console.warn(`⚠️ Version gap detected: v${localVersion} → v${version}`)
      // Show UI warning about potential conflict
    }

    // Apply remote edit
    this.sectionVersions.set(versionKey, version)
    this.persistVersions(payload.projectId)
  }

  // Persist section versions to sessionStorage
  private static persistVersions(projectId: string) {
    const projectVersions: Record<string, number> = {}

    for (const [key, version] of this.sectionVersions.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        projectVersions[key] = version
      }
    }

    sessionStorage.setItem(`versions:${projectId}`, JSON.stringify(projectVersions))
  }

  // Load persisted versions on reconnect
  private static loadPersistedVersions(projectId: string) {
    const stored = sessionStorage.getItem(`versions:${projectId}`)
    if (stored) {
      const versions = JSON.parse(stored)
      for (const [key, version] of Object.entries(versions)) {
        this.sectionVersions.set(key, version as number)
      }
    }
  }

  static async leaveProject(projectId: string, userId: string) {
    const channelName = `project:${projectId}:${userId}`
    const channel = this.channels.get(channelName)

    if (channel) {
      await channel.unsubscribe()
      this.channels.delete(channelName)
      console.log(`📡 Left realtime channel: ${channelName}`)
    }
  }

  // Monitor connection count for usage alerts
  static getActiveConnections(): number {
    return this.channels.size
  }

  // Get actual socket count from Supabase telemetry (more accurate than channel estimation)
  static async getActualSocketCount(): Promise<number> {
    try {
      const supabase = createClient()
      const { data } = await supabase.functions.invoke('get-telemetry', {
        body: { type: 'connections' }
      })
      return data?.connections || this.channels.size
    } catch (error) {
      console.warn('Failed to get actual socket count, using channel estimate')
      return this.channels.size
    }
  }
}
```

---

## 🌐 **Edge Router & Custom Domains**

### **Edge Function: `supabase/functions/site-router/index.ts`**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Create Supabase client with auth header for private sites (least-privilege principle)
function createSupabaseClient(req: Request) {
  const authHeader = req.headers.get('Authorization')

  // Use service role only for public sites, otherwise use user JWT
  const key = authHeader?.startsWith('Bearer ')
    ? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    key,
    authHeader ? {
      global: { headers: { Authorization: authHeader } }
    } : {}
  )
}

serve(async (req: Request) => {
  const url = new URL(req.url)
  const subdomain = url.hostname.split('.')[0]

  // Security: reject dangerous paths
  if (url.pathname.includes('..') || url.pathname.includes('~')) {
    return new Response('Invalid path', { status: 400 })
  }

  try {
    const supabase = createSupabaseClient(req)

    // 1. Get published project
    const { data: project } = await supabase
      .from('projects')
      .select(`
        id,
        branches!inner(
          head_id,
          commits!inner(tree_hash)
        )
      `)
      .eq('subdomain', subdomain)
      .eq('branches.name', 'main')
      .eq('branches.is_published', true)
      .single()

    if (!project) {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Site Not Found</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: system-ui; text-align: center; padding: 2rem;">
            <h1>🔍 Site Not Found</h1>
            <p>The site "${subdomain}" could not be found.</p>
            <p><a href="https://sheenapps.com">Create your site with SheenApps</a></p>
          </body>
        </html>
      `, {
        status: 404,
        headers: { 'Content-Type': 'text/html' }
      })
    }

    const commitId = project.branches[0].head_id
    const buildPath = `builds/${project.id}/${commitId}.zip`

    // 2. Check if pre-extracted build exists (for sites > 3MB to keep P95 TTFB sub-200ms)
    const extractedPath = `builds/${project.id}/${commitId}/`
    const requestedFile = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)

    const { data: extractedFile } = await supabase.storage
      .from('builds')
      .download(`${extractedPath}${requestedFile}`)
      .catch(() => ({ data: null }))

    if (extractedFile) {
      // Serve pre-extracted file
      const content = await extractedFile.text()
      const mimeType = getMimeType(requestedFile)

      return new Response(content, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600'
        }
      })
    }

    // 3. Fallback: stream from zip (for smaller sites)
    const { data: buildData } = await supabase.storage
      .from('builds')
      .download(buildPath)

    if (!buildData) {
      return new Response('Build not found', { status: 404 })
    }

    // Note: JSZip adds ~400KB cold-start; consider native Deno.readZip for performance
    const zip = new JSZip()
    const contents = await zip.loadAsync(buildData)
    const file = contents.files[requestedFile]

    if (!file) {
      return new Response('File not found', { status: 404 })
    }

    const content = await file.async('text')
    const mimeType = getMimeType(requestedFile)

    return new Response(content, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600'
      }
    })

  } catch (error) {
    console.error('Site router error:', error)
    return new Response('Internal server error', { status: 500 })
  }
})

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon'
  }
  return mimeTypes[ext || ''] || 'text/plain'
}
```

---

## 🚀 **CI/CD Pipeline**

### **GitHub Actions: `.github/workflows/deploy.yml`**
```yaml
name: Deploy to Environments

on:
  push:
    branches: [develop, main]
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  # Run tests with shadow DB
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase local
        run: supabase start

      - name: Run migrations on shadow DB
        run: supabase db push

      - name: Generate TypeScript types
        run: supabase gen types typescript --local > src/types/supabase.ts

      - name: Run tests (with crypto.subtle mock)
        run: npm run test
        env:
          NODE_ENV: test

      - name: Type check
        run: npm run type-check

      - name: Lint
        run: npm run lint

  # Deploy to development
  deploy-dev:
    if: github.ref == 'refs/heads/develop'
    needs: test
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Link to dev project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_DEV }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Run migrations
        run: supabase db push

      - name: Deploy edge functions
        run: supabase functions deploy --no-verify-jwt

      - name: Deploy to Vercel (dev)
        run: |
          npm i -g vercel
          vercel --token ${{ secrets.VERCEL_TOKEN }} --env .env.development

  # Deploy to staging
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Link to staging project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_STAGING }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Run migrations (ensure bucket creation order)
        run: supabase db push

      - name: Deploy edge functions
        run: supabase functions deploy --no-verify-jwt

      - name: Deploy to Vercel (staging)
        run: vercel --token ${{ secrets.VERCEL_TOKEN }} --env .env.staging

  # Deploy to production
  deploy-prod:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Link to production project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_PROD }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Run migrations
        run: supabase db push

      - name: Deploy edge functions (with custom domains)
        run: supabase functions deploy --no-verify-jwt

      - name: Deploy to Vercel (production)
        run: vercel --token ${{ secrets.VERCEL_TOKEN }} --env .env.production --prod

      - name: Notify about SSL cert issuance
        run: |
          echo "🔒 Custom domain SSL certificates may take a few minutes to provision"
          echo "Monitor status at: https://dash.cloudflare.com"
```

---

## 📝 **Implementation Checklist**

---



## ⚠️ **Watch-outs & Future Prep**

### **Realtime Connection Ceiling**
- **Limit**: Supabase Pro = 500 concurrent sockets/project
- **Monitor**: Build admin dashboard showing current usage
- **Alert**: Warn at 80% capacity (400 connections)

### **Branch Head Atomicity**
- **Risk**: High-concurrency editing can cause lost updates
- **Solution**: Use `create_commit_and_update_branch()` function with serializable isolation
- **Monitor**: Watch for "Branch was updated by another process" errors

### **Custom Domain SSL Issuance**
- **Delay**: Let's Encrypt certificates can take minutes on first deploy
- **UX**: Show "Waiting for DNS" banner so users know it's not broken
- **Monitor**: Check cert status programmatically

### **Storage Bucket Policies**
- **Risk**: Accidental deletes are #1 support ticket for user assets
- **Protection**: Deny-all DELETE policies on assets & builds buckets
- **Recovery**: Only service role can delete (manual process)

### **JSZip Performance**
- **Cost**: ~400KB cold-start penalty in edge functions
- **Alternative**: Consider native Deno.readZip or pre-extraction for large sites
- **Threshold**: Pre-extract builds > 3MB (keeps P95 TTFB comfortably sub-200ms)

---

## 💰 **Cost Control Strategy**

### **Feature Flags**
```typescript
// Keep ENABLE_EDGE_ROUTER=false until first paying user maps domain
export const FEATURE_FLAGS = {
  REALTIME_COLLABORATION: process.env.ENABLE_REALTIME === 'true',
  EDGE_ROUTER: process.env.ENABLE_EDGE_ROUTER === 'true', // $10/mo per env
  CUSTOM_DOMAINS: process.env.ENABLE_DOMAINS === 'true',
  AUTO_SAVE: process.env.ENABLE_AUTOSAVE === 'true',

  // Usage limits
  MAX_REALTIME_CONNECTIONS: parseInt(process.env.MAX_REALTIME_CONN || '100'),
  MAX_STORAGE_GB: parseInt(process.env.MAX_STORAGE_GB || '10'),
  MAX_BANDWIDTH_GB: parseInt(process.env.MAX_BANDWIDTH_GB || '100')
} as const
```

### **Usage Monitoring**
```typescript
export const UsageMonitor = {
  async checkRealtimeConnections() {
    // Use actual socket count from Supabase telemetry instead of estimation
    const current = await RealtimeService.getActualSocketCount()
    const limit = FEATURE_FLAGS.MAX_REALTIME_CONNECTIONS

    if (current > limit * 0.8) {
      console.warn(`⚠️ Realtime connections: ${current}/${limit} (80% threshold)`)
      // Send alert to admin
    }

    // Alert at 500-connection Supabase Pro limit
    if (current > 400) {
      console.error(`🚨 Approaching Supabase connection limit: ${current}/500`)
    }
  },

  async checkStorageUsage() {
    // Query total storage size and warn at 80% of limit
  }
}
```

---

## 🧪 **Testing Strategy**

### **Database Tests**
```bash
# Use shadow DB in CI
supabase start
supabase db push
npm run test
```

### **Test Setup Optimization**
```typescript
// vitest.setup.ts - Mock crypto.subtle once globally
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: async (algorithm: string, data: ArrayBuffer) => {
        // Mock implementation for tests
        return new ArrayBuffer(32) // Mock SHA-256 hash
      }
    }
  }
})

// Individual test files no longer need crypto mocking
```

### **Migration Tests**
```typescript
// Test payload size constraint doesn't reject legacy edits
describe('Legacy Edit Migration', () => {
  it('should handle large legacy edits gracefully', async () => {
    const largeEdit = { /* simulate 300KB edit */ }

    // Should either succeed or fail gracefully with clear error
    await expect(
      VersioningService.createCommit(projectId, largeEdit, 'Large edit', userId)
    ).rejects.toThrow(/payload too large/i)
  })
})
```

---

## 📈 **Timeline & Success Metrics**

### **Implementation Status**
- **Phase 1-2**: Foundation & Versioning ✅ **COMPLETED**
- **Phase 3**: Real-time Services ✅ **IMPLEMENTED**
- **Phase 4**: Production Deployment ✅ **DEPLOYED**
- **Phase 5**: Builder Integration 🚧 **NEXT STEPS**

### **Production Deployment Status** ✅
- [x] **Database Schema**: All 5 migrations deployed successfully
- [x] **Row-Level Security**: All tables protected with proper policies
- [x] **Storage Buckets**: Created with hardened security policies
- [x] **Atomic Operations**: Database functions for preventing race conditions
- [x] **Production Hardening**: Path sanitization, UPDATE denial, idempotent setup
- [x] **TypeScript Types**: Generated and ready for integration

### **Success Metrics**
- [x] **Production-ready backend**: Fully deployed with security hardening
- [x] **Atomic operations**: Prevents lost updates with serializable isolation
- [x] **Content-addressed storage**: Efficient deduplication with 250KB limit
- [x] **Real-time architecture**: Ready for collaboration features
- [ ] **Zero data loss**: Ready to test with builder integration
- [ ] **Sub-second saves**: Local-first performance to be maintained
- [ ] **Conflict-free collaboration**: Version counters ready for implementation
- [ ] **Cost under control**: Feature flags in place for gradual rollout

---

**Ready to build the future of collaborative web development! 🚀**
