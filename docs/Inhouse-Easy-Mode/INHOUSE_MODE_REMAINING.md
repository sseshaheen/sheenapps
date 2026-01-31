# In-House Mode: Remaining Implementation Gaps

**Date**: 2026-01-23
**Status**: ✅ ALL TASKS COMPLETE
**Last Updated**: 2026-01-23 (Task 5 verified as already implemented)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Current Implementation Status](#current-implementation-status)
4. [Implementation Plan](#implementation-plan)
5. [Detailed Specifications](#detailed-specifications)
6. [File Reference](#file-reference)

---

## Executive Summary

### What is In-House Mode?

In-House Mode (aka "Easy Mode") transforms SheenApps from a "bring your own infrastructure" platform into a "we handle everything" experience. Users can build and deploy complete applications without creating accounts on Supabase, Vercel, Sanity, or GitHub.

### Current State

| Phase | Status | Completeness |
|-------|--------|--------------|
| **Phase 1: Infrastructure** | ✅ Complete | 100% |
| **Phase 2: Auth + CMS** | ✅ Complete | 100% |
| **Phase 3: Domains/Export/Eject** | Placeholder | 40% |
| **Frontend UI (Phase 1-2)** | ✅ Complete | 100% |

*Note: Phase 3 is future work (custom domains, export, eject to Pro Mode). This document covered Phase 1-2 polish tasks.*

### Remaining Work (5 Features)

| # | Feature | Effort | Status |
|---|---------|--------|--------|
| 1 | Skeleton loading states | 2-3 hours | ✅ Complete |
| 2 | Deployment history + list endpoint | 1 day | ✅ Complete |
| 3 | Chat deploy button | 4-6 hours | ✅ Complete |
| 4 | API key regeneration (with rotation) | 4-6 hours | ✅ Complete |
| 5 | Live deployment logs (Hybrid SSE) | 2-3 days | ✅ Complete |

**All Tasks Complete**: The In-House Mode frontend implementation is now feature-complete.

### North Star Principle

> **"Make deployments feel observable and reversible."**
> Once users feel they can see what's happening and undo mistakes, In-House Mode stops feeling like a black box and starts feeling like a platform.

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER'S BROWSER                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Next.js 15 App (sheenappsai)                                           ││
│  │  ├── /app/api/inhouse/*  (API proxy routes to worker)                   ││
│  │  ├── /components/builder/infrastructure/*  (Infrastructure UI)          ││
│  │  ├── /components/builder/chat/*  (AI Chat interface)                    ││
│  │  └── /components/builder/workspace/*  (Workspace shell)                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HMAC-signed requests
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FASTIFY WORKER (sheenapps-claude-worker)                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Routes:                                                                 ││
│  │  ├── /v1/inhouse/db/*        (Database gateway - API key auth)          ││
│  │  ├── /v1/inhouse/projects/*  (Project management - HMAC auth)           ││
│  │  ├── /v1/inhouse/deploy/*    (Deployment - HMAC auth)                   ││
│  │  ├── /v1/inhouse/auth/*      (End-user auth - API key auth)             ││
│  │  ├── /v1/inhouse/cms/*       (CMS public API - API key auth)            ││
│  │  └── /v1/inhouse/cms/admin/* (CMS admin - HMAC auth)                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │   Neon      │ │ Cloudflare  │ │ Cloudflare  │
            │  Postgres   │ │     R2      │ │     KV      │
            │ (schema per │ │  (assets,   │ │ (hostname   │
            │  tenant)    │ │   media)    │ │  mappings)  │
            └─────────────┘ └─────────────┘ └─────────────┘
```

### User App Hosting Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     END USER ACCESSING DEPLOYED APP                          │
│                     https://myblog.sheenapps.com                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DISPATCH WORKER (routing)                             │
│  packages/dispatch-worker/                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  1. Parse hostname (myblog.sheenapps.com)                                ││
│  │  2. Lookup project_id from KV (HOSTNAME_MAP)                             ││
│  │  3. Get current buildId from KV (PROJECT_BUILDS)                         ││
│  │  4. If static asset → serve from R2                                      ││
│  │  5. If dynamic → dispatch to user Worker in namespace                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                    │                               │
                    ▼                               ▼
        ┌─────────────────────┐     ┌─────────────────────────────────┐
        │   R2 ASSETS         │     │   WORKERS FOR PLATFORMS         │
        │   /builds/{proj}/   │     │   Dispatch Namespace            │
        │   └── {buildId}/    │     │   ├── project-abc Worker        │
        │       ├── index.html│     │   ├── project-def Worker        │
        │       └── _next/... │     │   └── project-xyz Worker        │
        └─────────────────────┘     └─────────────────────────────────┘
```

---

## Current Implementation Status

### Backend Services (sheenapps-claude-worker)

| Service | File | Status |
|---------|------|--------|
| InhouseGatewayService | `services/inhouse/InhouseGatewayService.ts` | ✅ Complete |
| InhouseProjectService | `services/inhouse/InhouseProjectService.ts` | ✅ Complete |
| InhouseDeploymentService | `services/inhouse/InhouseDeploymentService.ts` | ✅ Complete |
| InhouseAuthService | `services/inhouse/InhouseAuthService.ts` | ✅ Complete |
| InhouseCmsService | `services/inhouse/InhouseCmsService.ts` | ✅ Complete |

### Frontend Components (sheenappsai)

```
src/components/builder/infrastructure/
├── InfrastructurePanel.tsx      ✅ Complete (with skeletons)
├── InfraModeSelector.tsx        ✅ Complete
├── DatabaseStatusCard.tsx       ✅ Complete (Task 1: skeleton)
├── HostingStatusCard.tsx        ✅ Complete (Task 2: history)
├── QuotasCard.tsx               ✅ Complete
├── ApiKeysCard.tsx              ✅ Complete (Task 4: regeneration)
├── DeployButton.tsx             ✅ Complete (Task 3: shared hook)
├── DeployDialog.tsx             ✅ Complete (Task 5: live logs via SSE)
├── database/
│   ├── SchemaBrowser.tsx        ✅ Complete (with skeleton)
│   ├── CreateTableDialog.tsx    ✅ Complete
│   └── QueryConsole.tsx         ✅ Complete (with skeleton)
├── auth/                        ✅ Complete
├── cms/                         ✅ Complete
└── phase3/                      ✅ Complete (placeholders)
```

---

## Implementation Plan

### Priority Order (Recommended)

1. **Skeletons** (2-3h) - Fast UX win, prevents layout shift
2. **Deployment History** (1d) - Core trust & rollback safety
3. **Chat Deploy Button** (4-6h) - Main flow delight
4. **API Key Regeneration** (4-6h) - Security without breaking production
5. **Hybrid SSE Logs** (2-3d) - Most complex, "pro-grade" feel

---

## Detailed Specifications

### 1. Skeleton Loading States

**Decision**: Pulse animation, match layout roughly, respect reduced motion.

**Implementation Pattern**:
```tsx
function CardSkeleton() {
  return (
    <div aria-busy="true" className="motion-reduce:animate-none">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 animate-pulse">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 animate-pulse">
          {/* Match card layout roughly */}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Key Points**:
- Use `aria-busy="true"` on container while loading
- Use `motion-reduce:animate-none` for users who disable animation
- Skeletons should preserve spacing to avoid layout shift
- Pulse animation is fine (shimmer is prettier but more code)

**Files to Modify**:
- `ApiKeysCard.tsx`
- `HostingStatusCard.tsx`
- `DatabaseStatusCard.tsx`

---

### 2. Deployment History

**Decision**: Compact expandable in HostingStatusCard (last 5), "View all" opens DeployDialog History tab.

#### UI Design

**HostingStatusCard** shows:
- Current live build + "Last deployed X ago"
- Expandable "Recent deployments" (last 5)
- Button "View all" → opens DeployDialog with History tab

**Rollback**: Keep rollback actions in "View all" view (less chance of fat-fingering). Require confirmation modal showing target build ID.

#### Backend Endpoint

**New**: `GET /v1/inhouse/projects/:projectId/deployments?limit=20&cursor=...`

**Response**:
```typescript
interface DeploymentHistoryResponse {
  ok: true
  data: {
    deployments: DeploymentHistoryItem[]
    nextCursor: string | null
  }
}

interface DeploymentHistoryItem {
  id: string                    // dpl_xxx
  buildId: string               // bld_xxx
  status: 'pending' | 'deploying' | 'active' | 'failed' | 'rolled_back'
  deployedAt: string | null
  deployedBy: string | null
  rollbackTarget: string | null
  isCurrentlyActive: boolean
  metadata: {
    assetCount?: number
    totalSizeBytes?: number
    durationMs?: number
  }
}
```

**Pagination**: Cursor-based (not offset - offset gets slow as table grows).

Cursor = `base64(created_at + ':' + id)`

Query pattern:
```sql
SELECT * FROM inhouse_deployments
WHERE project_id = $1
  AND (created_at, id) < ($2, $3)  -- for DESC pagination
ORDER BY created_at DESC, id DESC
LIMIT 20
```

#### Database Index (Add)

```sql
CREATE INDEX idx_inhouse_deployments_project_created
ON inhouse_deployments(project_id, created_at DESC, id DESC);
```

**Files to Create/Modify**:
- Create: `src/components/builder/infrastructure/DeploymentHistory.tsx`
- Create: `src/app/api/inhouse/projects/[id]/deployments/route.ts`
- Modify: `sheenapps-claude-worker/src/routes/inhouseDeployment.ts`
- Modify: `HostingStatusCard.tsx` (add expandable section)
- Modify: `DeployDialog.tsx` (add History tab)

---

### 3. Chat Deploy Button

**Decision**: Quick Deploy for subsequent deploys, open DeployDialog for first deploy only.

#### Decision Tree (Simplified)

```
Build Complete
    │
    ├── No prior successful deploy?
    │   └── YES → Open DeployDialog (first deploy is a "moment")
    │
    └── Has prior successful deploy?
        └── Quick Deploy with inline status + "View details" link
            └── If deploy fails → Show error inline + "Open deploy details"
```

#### Both Easy Mode and Pro Mode

Do not restrict to Easy Mode only. Behavior adapts:
- **Easy Mode**: Quick deploy triggers managed pipeline
- **Pro Mode**: "Deploy" opens dialog explaining what will happen

#### Implementation

Refactor deploy logic into shared hook/service so both `DeployButton` (Infrastructure Panel) and Chat deploy call the same thing.

```tsx
// hooks/useDeploy.ts
export function useDeploy(projectId: string) {
  const quickDeploy = async (buildId: string) => {
    // Shared deploy logic
  }

  const hasDeployedBefore = // check from project status

  return { quickDeploy, hasDeployedBefore, isDeploying, error }
}
```

```tsx
// In build-run-card.tsx
function BuildCompleteActions({ build, project }) {
  const { quickDeploy, hasDeployedBefore, isDeploying } = useDeploy(project.id)

  if (!hasDeployedBefore) {
    return <Button onClick={() => openDeployDialog()}>Deploy</Button>
  }

  return (
    <Button onClick={() => quickDeploy(build.id)} disabled={isDeploying}>
      {isDeploying ? 'Deploying...' : 'Deploy'}
    </Button>
  )
}
```

**Files to Create/Modify**:
- Create: `src/hooks/useDeploy.ts`
- Modify: `src/components/builder/chat/build-run-card.tsx`
- Modify: `src/components/builder/infrastructure/DeployButton.tsx` (use shared hook)

---

### 4. API Key Regeneration (with Rotation)

**Decision**: Support rotation, NOT instant revoke. Old key gets grace period to avoid breaking live apps.

#### Why Rotation Matters

If the server key is used by deployed apps to call the inhouse gateway, immediate invalidation will hard-break production until the app gets redeployed with the new key.

#### Rotation Behavior

1. User clicks "Regenerate"
2. New key created
3. Old key marked as "expiring" with 15-minute overlap
4. UI shows: "New key created. Old key will stop working at 14:32."
5. After 15 minutes, old key stops working

#### Schema Changes

Add to `inhouse_api_keys` table:
```sql
ALTER TABLE inhouse_api_keys
ADD COLUMN expires_at TIMESTAMPTZ,
ADD COLUMN revoked_at TIMESTAMPTZ;
```

**Gateway validation logic**:
```sql
-- Key is valid if:
-- 1. Not revoked (revoked_at IS NULL)
-- 2. Not expired (expires_at IS NULL OR now() < expires_at)
SELECT * FROM inhouse_api_keys
WHERE key_hash = $1
  AND revoked_at IS NULL
  AND (expires_at IS NULL OR now() < expires_at)
```

#### Rate Limiting

- 3 regenerations per hour per project
- 10 regenerations per day per project
- If >3/day consistently, flag as "possible compromise" in admin view (future)

#### Confirmation UX

Simple confirmation modal showing:
- "Are you sure you want to regenerate the server API key?"
- "Old key will continue working for 15 minutes."
- "You'll need to update any apps using the old key."
- [Cancel] [Regenerate]

No need for typing "REGENERATE" - that's friction for a recoverable action.

**Files to Create/Modify**:
- Create: `src/app/api/inhouse/projects/[id]/api-keys/regenerate/route.ts`
- Modify: `src/components/builder/infrastructure/ApiKeysCard.tsx`
- Modify: `sheenapps-claude-worker/src/routes/inhouseProjects.ts`
- Modify: `InhouseGatewayService.ts` (check expires_at)
- Migration: Add `expires_at`, `revoked_at` columns

---

### 5. Live Deployment Logs (Hybrid SSE)

**Decision**: Hybrid approach - deploy returns ID immediately, SSE streams events from DB-persisted log.

#### Why Hybrid

| Approach | Pros | Cons |
|----------|------|------|
| Polling only | Simple | Feels dead during 10-60s deploy |
| SSE only | Real-time | Fragile on mobile, no history |
| **Hybrid** | Best UX, reconnect-friendly, history | Slightly more work |

**Why DB-as-truth**: Persisting events to DB before streaming means:
- Clients can reconnect and resume via `Last-Event-ID`
- History is available for debugging
- No complex pub/sub infrastructure needed

#### Architecture

```
1. POST /deploy → returns { deploymentId } immediately
2. UI opens SSE connection to GET /deployments/:id/logs
3. Worker writes progress events to DB as it progresses
4. Next.js SSE endpoint tails DB rows and streams to client
5. If SSE drops, client can poll GET /deployments/:id for status, then reconnect
```

#### New Table: Deployment Events

```sql
CREATE TABLE inhouse_deployment_events (
  id BIGSERIAL PRIMARY KEY,
  deployment_id VARCHAR(64) NOT NULL REFERENCES inhouse_deployments(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  step TEXT NOT NULL,  -- 'upload_assets' | 'deploy_worker' | 'update_kv' | 'activate' | 'done'
  message TEXT NOT NULL,
  meta JSONB
);

CREATE INDEX idx_deploy_events_deploy_id_id
ON inhouse_deployment_events(deployment_id, id);
```

**Retention**: 14 days (cheap, provides debugging history). Can add cleanup job later.

#### SSE Endpoint Behavior (Resume-Friendly)

Use `Last-Event-ID` header (EventSource sets this automatically on reconnect).

**Production Requirements**:
- Handle client abort signal (prevent interval leaks)
- Send keepalive pings every 15s (prevents proxy/CF idle disconnects)
- Hard timeout of 2 minutes (zombie stream protection)
- Poll every 1000ms (not 500ms - avoids DB pressure at scale)
- Explicit authorization check

```typescript
// GET /api/inhouse/projects/[id]/deployments/[deploymentId]/logs
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

function sse(controller: ReadableStreamDefaultController, chunk: string) {
  controller.enqueue(encoder.encode(chunk))
}

// Note: In Next.js 15, params is a Promise and must be awaited
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; deploymentId: string }> }
) {
  const { id: projectId, deploymentId } = await params

  // 1. AUTHZ: verify user owns project AND deployment belongs to project
  // (deployment IDs are guessable if leaked - must verify ownership)
  await assertCanReadDeploymentLogs({ request, projectId, deploymentId })

  const lastEventIdHeader = request.headers.get('Last-Event-ID')
  let lastId = lastEventIdHeader ? Number(lastEventIdHeader) : 0
  if (!Number.isFinite(lastId) || lastId < 0) lastId = 0

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        try { controller.close() } catch {}
      }

      // Handle client disconnect
      request.signal.addEventListener('abort', close)

      // Set retry interval for client reconnection
      sse(controller, `retry: 1500\n\n`)

      // Replay existing events (for reconnect scenarios)
      const replay = await fetchEvents({ deploymentId, afterId: lastId })
      for (const ev of replay) {
        lastId = ev.id
        sse(controller, `id: ${ev.id}\nevent: log\ndata: ${JSON.stringify(ev)}\n\n`)
      }

      const startedAt = Date.now()
      const MAX_MS = 2 * 60 * 1000  // 2 minute hard timeout
      const POLL_MS = 1000          // Poll every 1s (not 500ms)

      // Keepalive pings prevent proxy/CF idle disconnects
      const keepAlive = setInterval(() => {
        if (!closed) {
          try { sse(controller, `: ping\n\n`) } catch {}
        }
      }, 15_000)

      const poll = setInterval(async () => {
        if (request.signal.aborted || closed) {
          clearInterval(poll)
          clearInterval(keepAlive)
          return
        }

        // Hard timeout - prevent zombie streams
        if (Date.now() - startedAt > MAX_MS) {
          clearInterval(poll)
          clearInterval(keepAlive)
          sse(controller, `event: timeout\ndata: ${JSON.stringify({ reason: 'max_duration' })}\n\n`)
          return close()
        }

        try {
          const newEvents = await fetchEvents({ deploymentId, afterId: lastId })
          for (const ev of newEvents) {
            lastId = ev.id
            sse(controller, `id: ${ev.id}\nevent: log\ndata: ${JSON.stringify(ev)}\n\n`)
          }

          // Check if deployment is terminal (project-scoped to prevent mismatch)
          const deployment = await fetchDeploymentStatus({ deploymentId, projectId })
          if (deployment.status === 'active' || deployment.status === 'failed') {
            clearInterval(poll)
            clearInterval(keepAlive)
            // Include IDs for UI reconciliation (multiple dialogs)
            sse(controller, `event: done\ndata: ${JSON.stringify({
              status: deployment.status,
              deploymentId,
              buildId: deployment.buildId
            })}\n\n`)
            return close()
          }
        } catch {
          // Don't crash on transient DB errors - client can reconnect
        }
      }, POLL_MS)

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(poll)
        clearInterval(keepAlive)
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // Prevents nginx/proxy buffering
    }
  })
}
```

#### UX: High-Level Steps First

Show progress like:
1. "Uploading assets..." (with count if available)
2. "Deploying worker..."
3. "Updating routes..."
4. "Activating build..."
5. "Done ✓"

Add expandable "Show details" for raw-ish lines (still curated, not noise).

**Event volume guideline**: Keep it under ~60 events per deployment. These are meaningful milestones, not every file uploaded.

#### UI Reconnection Handling

When SSE drops (network blip, tab sleep), the UI should:
- Show "Reconnecting..." indicator
- Keep already-received log entries visible (don't blank the list)
- EventSource auto-reconnects with `Last-Event-ID` - server replays missed events

```tsx
// In useDeploymentLogs hook
function useDeploymentLogs(deploymentId: string | null) {
  const [logs, setLogs] = useState<DeploymentEvent[]>([])
  const [connectionState, setConnectionState] = useState<'idle' | 'connected' | 'reconnecting' | 'done'>('idle')
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!deploymentId) return

    // Close previous connection if deploymentId changes
    eventSourceRef.current?.close()

    const url = `/api/inhouse/projects/${projectId}/deployments/${deploymentId}/logs`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => setConnectionState('connected')
    es.onerror = () => setConnectionState('reconnecting')

    es.addEventListener('log', (e) => {
      const event = JSON.parse(e.data)
      setLogs(prev => [...prev, event])
    })

    es.addEventListener('done', (e) => {
      const { status, deploymentId: doneId, buildId } = JSON.parse(e.data)
      setConnectionState('done')
      es.close()
    })

    // Cleanup on unmount or deploymentId change
    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [deploymentId, projectId])

  return { logs, connectionState }
}
```

#### Worker Changes

Modify `InhouseDeploymentService.deploy()` to write events as it progresses.

**Important**: Create the deployment row BEFORE writing any events, so the SSE route can verify status exists.

```typescript
async deploy(input: DeployInput) {
  const deploymentId = generateDeploymentId()

  // Create deployment row FIRST (so SSE route can verify it exists)
  await this.createDeploymentRecord(deploymentId, input.projectId, input.buildId)

  await this.logEvent(deploymentId, 'info', 'upload_assets', 'Uploading assets...')
  await this.uploadAssets(input.staticAssets)

  await this.logEvent(deploymentId, 'info', 'deploy_worker', 'Deploying worker...')
  await this.deployWorker(input.serverBundle)

  await this.logEvent(deploymentId, 'info', 'update_kv', 'Updating routes...')
  await this.updateKVMappings()

  await this.logEvent(deploymentId, 'info', 'activate', 'Activating build...')
  await this.activateBuild()

  await this.logEvent(deploymentId, 'info', 'done', 'Deployment complete')

  return { deploymentId, status: 'active' }
}

private async logEvent(deploymentId: string, level: string, step: string, message: string) {
  await db.query(`
    INSERT INTO inhouse_deployment_events (deployment_id, level, step, message)
    VALUES ($1, $2, $3, $4)
  `, [deploymentId, level, step, message])
}
```

#### Authorization Helper

The SSE route must verify both project ownership AND deployment belongs to project:

```typescript
async function assertCanReadDeploymentLogs({
  request,
  projectId,
  deploymentId
}: {
  request: Request
  projectId: string
  deploymentId: string
}) {
  const { userId } = await getServerAuthState()
  if (!userId) {
    throw new Response('Unauthorized', { status: 401 })
  }

  // Verify user owns project
  const project = await getProject(projectId)
  if (!project || project.owner_id !== userId) {
    throw new Response('Forbidden', { status: 403 })
  }

  // Verify deployment belongs to this project (project-scoped query)
  const deployment = await getDeployment(deploymentId, projectId)
  if (!deployment) {
    throw new Response('Not Found', { status: 404 })
  }
}

// Project-scoped deployment fetch (prevents mismatch bugs)
async function fetchDeploymentStatus({ deploymentId, projectId }: { deploymentId: string; projectId: string }) {
  const result = await db.query(`
    SELECT id, status, build_id as "buildId"
    FROM inhouse_deployments
    WHERE id = $1 AND project_id = $2
  `, [deploymentId, projectId])
  return result.rows[0]
}
```

**Files to Create/Modify**:
- Create: `src/app/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts`
- Create: `src/hooks/useDeploymentLogs.ts` (EventSource consumer with reconnection state)
- Modify: `src/components/builder/infrastructure/DeployDialog.tsx` (show live logs)
- Modify: `InhouseDeploymentService.ts` (write events, create deployment row first)
- Migration: Create `inhouse_deployment_events` table
- Modify: `/api/inhouse/deploy/route.ts` (return immediately with deploymentId)

---

## Additional Notes

### Build Artifacts: Don't Ship Through Browser

The deploy endpoint should take `buildId` and the worker fetches artifacts from R2 directly. The UI never needs the full artifact payload - only status, logs, and metadata (counts/sizes).

If DeployDialog needs a "what will deploy" summary, use build metadata stored at build time (`assetCount`, `totalSizeBytes`, `commitHash`).

### Eventing: DB as Truth

Don't overbuild queues yet. The simplest reliable pattern is:
- Worker writes `inhouse_deployment_events` rows as it progresses
- Next.js SSE endpoint tails those rows (1s polling is fine for ~30-60s deploys)

**Why this works**: Deployments are short-lived (30-60s). Polling at 1s intervals means ~30-60 queries per deployment per viewer. Even with 10 concurrent deployments being watched, that's 600 queries/minute - trivial for Postgres.

**Future optimization (not needed now)**: If we ever need "instant push" without polling:
- Add Postgres `LISTEN/NOTIFY` or Redis pub/sub keyed by `deploymentId`
- SSE subscribes and forwards messages
- Still persist to DB for replay

Avoid "worker calls back to Next.js" unless we have robust internal auth + retry. DB-as-truth is calmer.

---

## File Reference

### Files to Create

```
src/components/builder/infrastructure/
└── DeploymentHistory.tsx

src/app/api/inhouse/projects/[id]/
├── deployments/
│   ├── route.ts                     # List deployments
│   └── [deploymentId]/
│       └── logs/route.ts            # SSE stream
└── api-keys/
    └── regenerate/route.ts

src/hooks/
├── useDeploy.ts
├── useDeploymentHistory.ts
└── useDeploymentLogs.ts
```

### Files to Modify

```
Frontend:
├── ApiKeysCard.tsx                  # Skeleton + regeneration
├── HostingStatusCard.tsx            # Skeleton + compact history
├── DatabaseStatusCard.tsx           # Skeleton
├── DeployDialog.tsx                 # History tab + live logs
├── DeployButton.tsx                 # Use shared hook
└── build-run-card.tsx               # Deploy button in chat

Backend (worker):
├── inhouseDeployment.ts             # List endpoint + event logging
├── inhouseProjects.ts               # Regenerate endpoint
├── InhouseDeploymentService.ts      # Write events during deploy
└── InhouseGatewayService.ts         # Check expires_at on keys
```

### Database Migrations

```sql
-- 1. Deployment events table
CREATE TABLE inhouse_deployment_events (
  id BIGSERIAL PRIMARY KEY,
  deployment_id VARCHAR(64) NOT NULL REFERENCES inhouse_deployments(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  step TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB
);

CREATE INDEX idx_deploy_events_deploy_id_id
ON inhouse_deployment_events(deployment_id, id);

-- 2. API key rotation columns
ALTER TABLE inhouse_api_keys
ADD COLUMN expires_at TIMESTAMPTZ,
ADD COLUMN revoked_at TIMESTAMPTZ;

-- 3. Deployment history index
CREATE INDEX idx_inhouse_deployments_project_created
ON inhouse_deployments(project_id, created_at DESC, id DESC);
```

---

## Summary

| Feature | Approach | Effort |
|---------|----------|--------|
| Skeletons | Pulse, aria-busy, motion-reduce | 2-3h |
| Deployment History | Compact in card, full in dialog, cursor pagination | 1d |
| Chat Deploy | Quick deploy (subsequent), dialog (first) | 4-6h |
| API Key Regeneration | 15-min rotation overlap, not instant revoke | 4-6h |
| Live Logs | Hybrid SSE, DB-persisted events, resume-friendly | 2-3d |

**Total estimated effort**: ~5-6 days

---

## Implementation Progress

### Task 1: Skeleton Loading States - COMPLETED

**Date**: 2026-01-23

**Discovery**: Skeleton loading states were **already implemented** at the InfrastructurePanel level (lines 270-375). The individual cards (ApiKeysCard, HostingStatusCard, DatabaseStatusCard) receive data as props from the parent, which shows comprehensive skeletons during the loading phase.

**What was added**:
1. **Accessibility improvements** to the Skeleton component:
   - Added `motion-reduce:animate-none` to respect user's reduced motion preferences
   - Files: `src/components/ui/skeleton.tsx`

2. **ARIA attributes** for screen readers:
   - Added `aria-busy="true"` and `aria-label` to loading containers
   - Files: `InfrastructurePanel.tsx`, `SchemaBrowser.tsx`, `QueryConsole.tsx`

**Files Modified**:
- `src/components/ui/skeleton.tsx` - Added motion-reduce support
- `src/components/builder/infrastructure/InfrastructurePanel.tsx` - Added aria-busy
- `src/components/builder/infrastructure/database/SchemaBrowser.tsx` - Added aria-busy
- `src/components/builder/infrastructure/database/QueryConsole.tsx` - Added aria-busy

**Time**: ~15 minutes (vs estimated 2-3h - most work was already done)

---

### Task 2: Deployment History - COMPLETED

**Date**: 2026-01-23

**What was implemented**:

1. **Backend (Worker)**:
   - Added `getDeploymentHistory()` method to `InhouseDeploymentService.ts`
   - Added `GET /v1/inhouse/projects/:projectId/deployments` endpoint
   - Cursor-based pagination with `base64(created_at:id)` format
   - Identifies currently active deployment

2. **Next.js API Route**:
   - Created `src/app/api/inhouse/projects/[id]/deployments/route.ts`
   - Session-based authentication
   - Proper error handling and no-cache headers

3. **React Hooks**:
   - Created `useDeploymentHistory` - infinite query with cursor pagination
   - Created `useLatestDeployments` - simple query for compact views

4. **DeploymentHistory Component**:
   - Expandable list with status badges
   - Rollback confirmation dialog
   - Loading skeleton with accessibility

5. **HostingStatusCard Updates**:
   - Added collapsible "Recent Deployments" section
   - Integrated DeploymentHistory component
   - Added projectId prop

6. **Translations**:
   - Added `hosting.history.*` to all 9 locales
   - Arabic, French, German, Spanish translations

7. **Database Migration**:
   - Created `060_deployment_history_index.sql`
   - Index on `(project_id, created_at DESC, id DESC)` for efficient pagination

**Files Created**:
- `sheenapps-claude-worker/migrations/060_deployment_history_index.sql`
- `sheenappsai/src/app/api/inhouse/projects/[id]/deployments/route.ts`
- `sheenappsai/src/hooks/useDeploymentHistory.ts`
- `sheenappsai/src/components/builder/infrastructure/DeploymentHistory.tsx`

**Files Modified**:
- `sheenapps-claude-worker/src/services/inhouse/InhouseDeploymentService.ts`
- `sheenapps-claude-worker/src/routes/inhouseDeployment.ts`
- `sheenappsai/src/types/inhouse-api.ts`
- `sheenappsai/src/components/builder/infrastructure/HostingStatusCard.tsx`
- `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx`
- All 9 `messages/*/infrastructure.json` files

**Time**: ~2 hours

---

### Task 3: Chat Deploy Button - COMPLETED

**Date**: 2026-01-23

**What was implemented**:

1. **Shared Deploy Hook** (`useDeploy.ts`):
   - Uses `useLatestDeployments` to detect first-time vs subsequent deploys
   - Provides `quickDeploy()` method for inline deployment
   - Manages deploy phase states (idle, uploading, deploying, routing, complete, error)
   - Auto-resets state after successful deployment

2. **BuildRunCard Updates**:
   - Added `infraMode`, `subdomain` props to detect Easy Mode projects
   - Added `deployState`, `onOpenDeployDialog`, `onQuickDeploy` props
   - Deploy button appears next to Preview button when build is complete
   - Shows deploying spinner, deployed link, or error state inline
   - Decision tree: first deploy → opens dialog, subsequent → quick deploy

3. **UnifiedMessageList Updates**:
   - Threads deploy props from container down to BuildRunCard
   - All 3 BuildRunCard render locations updated

4. **UnifiedChatContainer Updates**:
   - Accepts `infraMode` and `subdomain` props
   - Uses `useDeploy` hook for deploy state management
   - Renders `DeployDialog` for first-time deployments
   - Provides deploy callbacks and translations to message list

5. **Translations**:
   - Added deploy-related keys to `buildProgress` section in all 9 locales:
     - `deploy`, `deploying`, `deployed`, `deployFailed`, `viewSite`

**Files Created**:
- `sheenappsai/src/hooks/useDeploy.ts`

**Files Modified**:
- `sheenappsai/src/components/persistent-chat/build-run-card.tsx`
- `sheenappsai/src/components/persistent-chat/unified-message-list.tsx`
- `sheenappsai/src/components/persistent-chat/unified-chat-container.tsx`
- `sheenappsai/src/messages/en/builder.json`
- `sheenappsai/src/messages/ar/builder.json`
- `sheenappsai/src/messages/ar-eg/builder.json`
- `sheenappsai/src/messages/ar-sa/builder.json`
- `sheenappsai/src/messages/ar-ae/builder.json`
- `sheenappsai/src/messages/fr/builder.json`
- `sheenappsai/src/messages/fr-ma/builder.json`
- `sheenappsai/src/messages/es/builder.json`
- `sheenappsai/src/messages/de/builder.json`

**Architecture Decision**:
- Chose to pass `infraMode` and `subdomain` as props rather than using context to keep the deploy feature opt-in and explicit
- The useDeploy hook is separate from the Infrastructure Panel's DeployButton to allow different UX in chat (inline) vs panel (dialog-first)

**Time**: ~1.5 hours

---

### Task 4: API Key Regeneration - COMPLETED

**Date**: 2026-01-23

**What was implemented**:

1. **Backend (Worker) - InhouseProjectService**:
   - Added `regenerateApiKey()` method with 15-minute grace period
   - Old key gets `expires_at` set 15 minutes in the future (not immediately revoked)
   - Rate limiting: 3 regenerations/hour, 10/day per project
   - Generates new key and returns it (shown once to user)

2. **Backend (Worker) - Route**:
   - Added `POST /v1/inhouse/projects/:id/keys/:type/regenerate` endpoint
   - Returns `{ newKey, newKeyPrefix, oldKeyExpiresAt, gracePeriodMinutes }`
   - Returns 429 for rate limit exceeded

3. **Gateway Service**:
   - Already checked `expires_at` in key validation (no changes needed)
   - Keys with `expires_at < now()` are rejected automatically

4. **Next.js API Route**:
   - Created `src/app/api/inhouse/projects/[id]/api-keys/[type]/regenerate/route.ts`
   - Session-based authentication (verifies user owns project)
   - Proxies to worker with HMAC signature

5. **ApiKeysCard Component Updates**:
   - Added "Regenerate Key" button on server key section
   - Confirmation dialog with warning about 15-minute grace period
   - After regeneration, shows new key with copy button
   - Shows old key expiration time
   - Added `onKeyRegenerated` callback to notify parent to refetch

6. **Translations**:
   - Added to all 9 locales:
     - `apiKeys.status.expiring`
     - `apiKeys.actions.regenerate`, `apiKeys.actions.regenerating`
     - `apiKeys.regenerate.*` (confirmTitle, confirmDescription, warning, cancel, confirm, success, successDescription, error, newKeyLabel, oldKeyExpires)

7. **Type Updates**:
   - Updated `InfrastructurePanelProps` apiKeys type
   - Updated `InfrastructureDrawerProps` apiKeys type

**Files Created**:
- `sheenappsai/src/app/api/inhouse/projects/[id]/api-keys/[type]/regenerate/route.ts`

**Files Modified**:
- `sheenapps-claude-worker/src/services/inhouse/InhouseProjectService.ts`
- `sheenapps-claude-worker/src/routes/inhouseProjects.ts`
- `sheenappsai/src/components/builder/infrastructure/ApiKeysCard.tsx`
- `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx`
- `sheenappsai/src/components/builder/workspace/infrastructure-drawer.tsx`
- All 9 `messages/*/infrastructure.json` files

**No migration needed**: Gateway already checks `expires_at` - the column was already in the schema.

**Time**: ~1 hour

---

### Task 5: Live Deployment Logs - COMPLETED

**Date**: 2026-01-23

**Discovery**: Task 5 was already fully implemented! The implementation includes all expert-recommended patterns.

#### Implementation Summary

**1. Database Migration** (`sheenapps-claude-worker/migrations/061_deployment_events.sql`):
- `inhouse_deployment_events` table with BIGSERIAL id for cursor-based streaming
- Index on `(deployment_id, id)` for efficient retrieval
- Retention policy documented (14 days)

**2. Worker Service** (`InhouseDeploymentService.ts`):
- `logEvent()` method - fire-and-forget event logging during deployment
- `getDeploymentEvents()` method - cursor-based pagination for SSE endpoint
- Events logged at each deployment step: `upload_assets`, `deploy_worker`, `update_kv`, `activate`, `done`, `error`
- Rich metadata: asset counts, byte sizes, timing

**3. Worker Route** (`inhouseDeployment.ts`):
- `GET /v1/inhouse/deployments/:deploymentId/events?after={cursor}`
- Returns events array + isComplete flag + deployment status

**4. Next.js SSE Route** (`/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts`):
- ✅ Async polling loop (500ms, prevents overlaps)
- ✅ Keepalive pings every 15s
- ✅ Max 120 polls (~60s timeout)
- ✅ Abort signal handling
- ✅ `X-Accel-Buffering: no` header
- ✅ `Last-Event-ID` support for reconnection
- ✅ Project ownership verification via `requireProjectOwner()`
- ✅ Safe close helper prevents double-close errors
- ✅ Timeout protection on all fetches (8s)

**5. React Hook** (`useDeploymentLogs.ts`):
- ✅ EventSource connection management
- ✅ Automatic reconnection (max 5 attempts)
- ✅ Event deduplication via lastEventId tracking
- ✅ Cleanup on unmount
- ✅ Helper functions: `getCurrentStep()`, `getStepProgress()`, `groupEventsByStep()`

**6. UI Integration** (`DeployDialog.tsx`):
- ✅ Live logs display with progress bar
- ✅ Phase tracking based on SSE events
- ✅ Expandable details view
- ✅ Auto-close on successful completion
- ✅ Error handling with user-friendly messages

#### Expert Recommendations Applied

| Recommendation | Status | Implementation |
|----------------|--------|----------------|
| Poll at 1000ms (not 500ms) | ⚠️ Using 500ms | Async loop prevents overlaps, acceptable |
| Handle abort signal | ✅ | `request.signal.abort` + `closeSafely()` |
| Keepalive pings (15s) | ✅ | `event: ping` every 15s |
| Hard timeout | ✅ | 120 polls × 500ms = ~60s |
| Explicit auth check | ✅ | `requireProjectOwner()` helper |
| `X-Accel-Buffering: no` | ✅ | In response headers |
| EventSource cleanup | ✅ | Hook closes on unmount/deploymentId change |
| Next.js 15 params | ✅ | `await params` with proper typing |

**Files Involved**:
- `sheenapps-claude-worker/migrations/061_deployment_events.sql`
- `sheenapps-claude-worker/src/services/inhouse/InhouseDeploymentService.ts` (lines 826-890)
- `sheenapps-claude-worker/src/routes/inhouseDeployment.ts` (lines 606-641)
- `sheenappsai/src/app/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts`
- `sheenappsai/src/hooks/useDeploymentLogs.ts`
- `sheenappsai/src/components/builder/infrastructure/DeployDialog.tsx`

**Time**: Already implemented (discovered during verification)

---

## Improvement Ideas

_Section for noting improvements discovered during implementation_

1. **Consider extracting skeleton patterns**: The skeleton loaders in InfrastructurePanel are inline JSX. Could be extracted into reusable skeleton components (e.g., `DatabaseCardSkeleton`, `HostingCardSkeleton`) for consistency and easier maintenance.

2. **SSE polling interval optimization** (Task 5): Currently polls at 500ms. Could bump to 1000ms as expert recommended to reduce DB load at scale. The async loop prevents overlapping requests so 500ms is safe, but 1000ms would halve the query load.

3. **SSE timeout extension**: Current max timeout is ~60s (120 polls × 500ms). For very large deployments (many assets), consider extending to 2-3 minutes. However, deployments typically complete in 10-30s so this may not be needed.

4. **Event retention cleanup job**: The `inhouse_deployment_events` table has 14-day retention documented but no automated cleanup job. Consider adding a scheduled job to prune old events.

5. **`complete` event enrichment**: The SSE 'complete' event currently returns `{ status }`. Per expert recommendation, could include `deploymentId` and `buildId` for multi-dialog reconciliation. However, the current implementation handles this client-side via hook state.

---

*Implementation plan finalized with expert review feedback incorporated.*
