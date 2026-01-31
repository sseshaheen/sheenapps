# Workspace Integration UX Enhancement Plan

## Executive Summary

**Challenge**: SheenApps has built powerful integrations (Sanity CMS, GitHub 2-way sync, Vercel deployments, Supabase) but the workspace UI doesn't surface these capabilities in an approachable way. Users likely don't discover or use the full potential of these integrations.

**Solution**: Reimagine the workspace UI to surface integrations through simplicity - making powerful capabilities discoverable and accessible without overwhelming users.

## Current State Analysis

### ✅ Backend Capabilities (Strong)
- **Sanity CMS**: Full headless CMS integration with real-time sync, webhooks, document management
- **GitHub**: Complete 2-way sync with push/pull, branch management, real-time status updates
- **Vercel**: OAuth connection, project linking, automated deployments, domain management
- **Supabase**: Database integration with OAuth, connection management, real-time status

### ❌ UI Exposure Gaps (Needs Improvement)
1. **Hidden Discovery**: Integrations buried behind secondary panels/modals
2. **Status Invisibility**: Only database status visible in header, others hidden
3. **Fragmented Access**: Multiple clicks needed to reach integration features
4. **No Integration Awareness**: Users don't know what's available
5. **Disconnected Workflow**: Integrations feel separate from main workspace
6. **Missing Onboarding**: No guided setup or contextual suggestions

## Design Philosophy: "Progressive Disclosure Through Simplicity"

### Core Principles
1. **Minimal Cognitive Load**: Don't overwhelm, but make power accessible
2. **Contextual Awareness**: Show relevant integrations at the right moment
3. **Status Transparency**: Clear visual indicators of integration health
4. **One-Click Actions**: Reduce friction for common integration tasks
5. **Smart Defaults**: Intelligent suggestions based on project state

## Implementation Strategy

*Expert feedback integrated: Single status source, unified adapters, one realtime channel, trimmed initial implementation*

### Phase 1: Enhanced Integration Status Bar (Week 1-2)

**Goal**: Make integration status visible at all times without cluttering the UI

**Key Expert Insight**: Create one backend "integrations status" endpoint (leveraging our existing SSE infrastructure) that aggregates all providers. Don't have the UI call four APIs.

**Backend First: Production-Ready Status Endpoint**
```typescript
// GET /api/integrations/status?projectId=...
// Expert enhancement: ETags, permissions, unified errors, privacy
type IntegrationKey = 'sanity'|'github'|'vercel'|'supabase';
type Status = 'connected'|'warning'|'error'|'disconnected';

type IntegrationStatus = {
  key: IntegrationKey;
  status: Status;
  summary?: string;                     // "Linked to main · Last push 2m ago"
  updatedAt: string;                    // ISO timestamp
  stale?: boolean;                      // true if from cache/circuit breaker
  problem?: {                           // Expert: unified error shape
    code: 'oauth_revoked'|'rate_limited'|'timeout'|'unknown';
    hint?: string;                      // "Click to reconnect"
  };
  actions?: Array<{                     // Expert: backend determines permissions
    id: string;
    label: string;                      // "Deploy", "Push", "Sync", "Open Studio"
    can: boolean;                       // Backend permission check
    reason?: string;                    // "OAuth expired" if can=false
  }>;
};

type StatusEnvelope = {
  projectId: string;
  items: IntegrationStatus[];
  hash: string;                         // Expert: ETag support for performance
};

// Enhanced adapter interface with expert production patterns
export interface IntegrationAdapter {
  key: 'sanity'|'github'|'vercel'|'supabase';
  getStatus(projectId: string, user: User): Promise<IntegrationStatus>;  // Privacy-aware
  quickActions(projectId: string, user: User): Promise<Action[]>;
  connect(projectId: string, payload?: any): Promise<void>;
  disconnect(projectId: string): Promise<void>;
  // Expert additions:
  timeout: number;                      // 2-3s per adapter
  circuitBreaker: CircuitBreaker;       // Emit stale data if provider down
  cache: { ttl: number; jitter: boolean }; // 10-20s + jitter
}
```

**Frontend Components:**
```typescript
// src/components/workspace/integration-status-bar.tsx
interface IntegrationStatusBarProps {
  projectId: string
  compact?: boolean
}

// Leverages our existing React Query + feature flags infrastructure
```

**Features (Expert-Enhanced Production Ready):**
- **Status Bar Layout**: `[🗃️ DB] [📦 Git] [🚀 Deploy] [📝 CMS]` with `role="toolbar"` in workspace header
- **Expert UI Patterns**: 16px monochrome icons + small dot badges (connected=green, warning=amber, error=red, off=gray)
- **Expert Copy (Verb-First & Actionable)**:
  - Disconnected: "Not connected · Connect"
  - Warning (Vercel): "Linked · No deployments yet · Deploy"
  - Error (GitHub): "Auth expired · Reconnect"
  - Connected: "Linked to main · Last push 2m ago"
- **Accessibility (Expert A11y)**:
  - Status items as buttons with `aria-pressed` (connected state)
  - Tooltip content mirrored in `aria-describedby`
  - Color + icon + text (not color alone)
- **Performance & Resilience**:
  - ETag support: `If-None-Match` to skip unchanged responses
  - SSE with backoff (1s→2s→5s→10s→60s max), fallback to polling
  - Render optimistic, hydrate with real status (don't block header)
- **Security & Privacy**:
  - Backend redacts repo/org names for users without permissions
  - Only expose actions user can perform
  - Handle revoked OAuth as first-class status (not generic error)

**Location**: Replace/enhance the current database button section in workspace header

**Leverages Existing Infrastructure:**
- ✅ Feature flags system for gradual rollout
- ✅ SSE patterns from admin logs and GitHub sync (enhanced with expert resilience)
- ✅ React Query caching with 10-20s cache + jitter
- ✅ Existing idempotency hooks for quick actions

### Phase 2: Smart Integration Sidebar (Week 3-4)

**Goal**: Contextual integration suggestions and quick actions

**Expert Insight**: Start with 3-5 deterministic rules; add ML later. Add context logic guardrails to prevent nagging.

**Components to Build:**
```typescript
// src/components/workspace/smart-integration-panel.tsx
interface SmartIntegrationPanelProps {
  projectId: string
  projectType: string
  currentContext: 'building' | 'deploying' | 'content' | 'debugging'
}

// Context logic guardrails (expert requirement)
interface SuggestionCooldown {
  suggestionId: string
  lastShown: number
  dismissedUntil?: number
  permanentlyDismissed: boolean
}
```

**Features (Simplified with Expert Guardrails):**
- **Deterministic Context Rules** (5 specific triggers):
  - `iterations >= 3` → Suggest GitHub sync setup
  - `contentBlocks > 5` → Highlight Sanity CMS
  - `satisfaction_score > 7` → Promote Vercel connection
  - `export_attempted` → Vercel deployment suggestion
  - `manual_save_action` → GitHub backup suggestion
- **Quick Actions**: Verb-first labels ("Deploy", "Push", "Sync", "Open Studio") with one-click execution
- **Anti-Nag System**: Per-suggestion cooldown (24h) + dismissal memory (local + server)
- **Capability Gating**: Only show Vercel if GitHub connected or local export exists
- **Permissions Respect**: Hide actions user can't perform; handle revoked OAuth as first-class status

**Location**: Enhance existing workspace sidebar with collapsible integration section

### Phase 3: Integration Command Center (Week 5-6)

**Goal**: Unified hub for all integration management

**Expert Trim**: Make it a Settings → Integrations tab first (list + details); "workflow" canvas can come later.

**Components to Build:**
```typescript
// src/components/workspace/integration-command-center.tsx
// Enhanced version of existing project-settings-panel.tsx
```

**Features (Simplified):**
- **Settings → Integrations Tab**: Enhanced version of existing project settings with unified patterns
- **List + Details View**: All integrations in consistent cards with status, actions, last activity
- **Batch Connection**: Connect multiple integrations in sequence with dependency mapping
- **Health Monitoring**: Proactive alerts using our existing SSE infrastructure
- **Real Usage Analytics**: Show actual value (deployments count, syncs frequency, content updates)

**Location**: Enhanced project settings panel with dedicated integration tab (builds on existing implementation)

### Phase 4: Contextual Integration Prompts (Week 7-8)

**Goal**: Proactive integration suggestions at optimal moments

**Components to Build:**
```typescript
// src/components/workspace/contextual-prompts.tsx
// src/hooks/use-integration-opportunities.ts
```

**Features:**
- **Smart Timing**: Suggest integrations when they'd add most value
- **Non-Intrusive**: Subtle prompts that don't interrupt workflow
- **Dismissible**: Users can say "not now" or "never show again"
- **Value-Focused**: Clear benefit explanation for each suggestion

**Examples:**
- After 3+ iterations: "Ready to save to GitHub?"
- Content-heavy project: "Connect Sanity CMS for easier content management"
- Satisfied with design: "Deploy to Vercel to share with others"

## Expert Implementation Details (Copy/Paste Ready)

*Concrete patterns, testing approach, and rollout strategy from expert review*

### Data & Events Patterns

**Client Cache (React Query)**:
```typescript
// Leverages our existing React Query setup
useQuery(['integrations', projectId], fetchStatus, {
  refetchInterval: 10000,
  staleTime: 5000
});
```

**Server Emitted Events** (using our SSE infrastructure):
```typescript
type IntegrationEvent =
 | { type:'deploy:started', provider:'vercel', projectId:string, url?:string, ts:number }
 | { type:'deploy:finished', provider:'vercel', projectId:string, previewUrl:string, ts:number, success:boolean }
 | { type:'github:push', projectId:string, branch:string, sha:string, ts:number }
 | { type:'sanity:webhook', projectId:string, count:number, ts:number };
```

**Expert Production API Implementation**:
```typescript
// Minimal server sketch (GET /api/integrations/status)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId')!;
  const user = await requireUser(); // includes role/permissions

  const [github, vercel, sanity, supabase] = await Promise.allSettled([
    adapters.github.getStatus(projectId, user),
    adapters.vercel.getStatus(projectId, user),
    adapters.sanity.getStatus(projectId, user),
    adapters.supabase.getStatus(projectId, user),
  ]);

  const items = normalize([github, vercel, sanity, supabase], user);
  const hash = stableHash(items);

  // Expert: ETag support for performance
  if (req.headers.get('if-none-match') === hash) {
    return new Response(null, { status: 304 });
  }

  return Response.json({ projectId, items, hash }, {
    headers: { 'ETag': hash, 'Cache-Control': 'no-store' }
  });
}

// Minimal client hook (poll + SSE with expert resilience)
function useIntegrationStatus(projectId: string) {
  const q = useQuery({
    queryKey: ['integrations', projectId],
    queryFn: () => fetchJSON(`/api/integrations/status?projectId=${projectId}`),
    refetchInterval: 10000,
    staleTime: 5000,
  });

  useEffect(() => {
    let retry = 1000, es: EventSource | null = null, closed = false;

    function connect(lastId?: string) {
      const url = `/api/integrations/events?projectId=${projectId}`;
      es = new EventSource(url);

      es.onmessage = (e) => {
        retry = 1000; // reset backoff
        const delta = JSON.parse(e.data);
        queryClient.setQueryData(['integrations', projectId], (prev) =>
          mergeDelta(prev, delta)
        );
      };

      es.onerror = () => {
        if (closed) return;
        es?.close();
        // Expert: backoff with max 60s
        setTimeout(() => connect(/* optionally pass Last-Event-ID */),
          Math.min(retry *= 2, 60000)
        );
      };
    }

    connect();
    return () => { closed = true; es?.close(); };
  }, [projectId]);

  return q;
}
```

**Status Bar Tooltips (Expert Copy - Verb-First & Actionable)**:
- GitHub (connected): "Linked to main · Last push 2m ago"
- Vercel (warning): "Linked · No deployments yet · Deploy"
- Sanity (connected): "3 docs updated today · Open Studio"
- Supabase (error): "Auth expired · Reconnect"
- Disconnected states: "Not connected · Connect"

### Testing Checklist (Expert-Validated)

**Unit Testing**:
- Status reducer merges deltas → deterministic UI state
- Suggestion cooldown logic prevents nagging
- Permission filtering works correctly

**E2E Testing**:
- Status bar renders 4 items; colors change on simulated events
- "Deploy to Vercel" triggers POST and shows live progress toast
- Revoked OAuth → "Reconnect" path works
- Dismiss prompt persists across reloads

**Performance Testing**:
- Status polling doesn't block typing
- WebSocket reconnect backoff works (1s→2s→5s…)
- Single SSE channel vs multiple connections

### Rollout Strategy (Using Our Feature Flags)

**Phase 1: Feature Flag Rollout**:
```typescript
// Add to src/config/feature-flags.ts
ENABLE_INTEGRATION_STATUS_BAR: process.env.NEXT_PUBLIC_ENABLE_INTEGRATION_STATUS_BAR === 'true'

// Rollout progression
// Week 1: 10% → 50% → 100% using existing rollout percentage system
```

**Telemetry & KPIs**:
- `integrations_status_view` - Status bar visibility
- `integration_quick_action_click (provider, action)` - Action usage
- `integration_connect_success/fail (provider)` - Connection rates
- `prompt_shown/dismissed/accepted` - Suggestion effectiveness

**90-Day Success Metrics**:
- +X% users with ≥2 integrations connected
- ↓ time-to-first-deploy
- ↓ support tickets on "where is deploy/push?"

### Accessibility Implementation

**Expert A11y Patterns**:
- Each status item is a button with `aria-pressed` state
- Tooltip content mirrored in `aria-describedby`
- Color + icon + text for status (not color alone)
- Keyboard navigation for all integration controls
- Screen reader announcements for status changes

### Critical Gotchas to Avoid

**Technical**:
- ❌ Don't open 4 WebSockets; use one channel
- ❌ Don't block the header render on status; render optimistic then hydrate
- ❌ Don't bury fixes behind modals; quick actions should be immediate
- ❌ Don't leak repo/org names to viewers without permission

**UX**:
- ❌ Never expose integration actions a user can't perform
- ❌ Handle revoked OAuth as first-class status (not generic error)
- ❌ Don't show Vercel without GitHub connected or local export capability

## Detailed Component Specifications

### 1. Enhanced Integration Status Bar

**Visual Design:**
```
[🏠 Logo] • [Project Name] | [🗃️ DB] [📦 Git] [🚀 Deploy] [📝 CMS] | [⚙️ Settings] [👤 User]
```

**Status States:**
- **Connected & Healthy**: Green dot, integration icon
- **Connected & Warning**: Yellow dot, icon with badge
- **Not Connected**: Gray dot, faded icon
- **Error State**: Red dot, icon with alert badge

**Interaction:**
- **Hover**: Tooltip with status details and last activity
- **Click**: Context menu with quick actions
- **Long-press/Right-click**: Direct to full integration settings

### 2. Smart Integration Panel

**Layout:**
```
┌─ Smart Integrations ─────────────┐
│ 💡 Suggestions for you:          │
│ [📦 Setup GitHub Sync] [Quick]   │
│ [🚀 Deploy to Vercel] [Recommend]│
│                                  │
│ 🔗 Connected:                    │
│ [🗃️ Database] [Live ✓]          │
│ [📝 CMS] [3 docs synced]         │
│                                  │
│ ⚡ Quick Actions:               │
│ [Push Changes] [Deploy] [Sync]   │
└──────────────────────────────────┘
```

**Smart Logic:**
```typescript
const getContextualSuggestions = (project: Project, integrations: Integration[]) => {
  const suggestions = []

  // Logic examples:
  if (project.iterations > 2 && !integrations.github) {
    suggestions.push({ type: 'github', priority: 'high', reason: 'Save your progress' })
  }

  if (project.contentBlocks > 5 && !integrations.sanity) {
    suggestions.push({ type: 'sanity', priority: 'medium', reason: 'Manage content easier' })
  }

  return suggestions.sort((a, b) => priorityScore(a) - priorityScore(b))
}
```

### 3. Integration Command Center

**Full-Screen Experience:**
- Tab-based navigation: Overview | Setup | Health | Analytics
- Drag-and-drop integration setup flow
- Real-time connection testing with progress indicators
- Integration dependency mapping (e.g., "GitHub required for Vercel auto-deploy")
- Bulk configuration export/import for team consistency

### 4. Contextual Integration Prompts

**Trigger Conditions:**
```typescript
const integrationPrompts = {
  github: {
    triggers: ['iteration_count >= 3', 'time_spent > 30min', 'manual_save_action'],
    cooldown: '24h',
    message: 'Save your progress to GitHub',
    benefits: ['Version history', 'Collaboration', 'Backup safety']
  },
  vercel: {
    triggers: ['satisfaction_score > 7', 'preview_viewed > 5', 'export_attempted'],
    cooldown: '12h',
    message: 'Share your creation with a live URL',
    benefits: ['Instant deployment', 'Custom domain', 'Global CDN']
  }
}
```

## Implementation Timeline (Expert-Optimized)

*Trimmed phases leveraging existing infrastructure for faster delivery*

### Week 1-2: Unified Status Foundation (Expert-Enhanced)
- [ ] **Backend**: Create unified status endpoint with ETag support and permission-aware responses
- [ ] **Adapters**: Build integration adapters with circuit breakers (2-3s timeout, stale data fallback)
- [ ] **SSE Channel**: Extend existing SSE with expert resilience (1s→2s→5s→60s backoff, Last-Event-ID)
- [ ] **Feature Flag**: Add `ENABLE_INTEGRATION_STATUS_BAR` with 10%→50%→100% rollout
- [ ] **Status Bar**: Build with `role="toolbar"`, `aria-pressed` states, optimistic rendering
- [ ] **Quick Actions**: Implement with existing idempotency hooks and progress events

### Week 3-4: Smart Suggestions (Expert Anti-Nag)
- [ ] **Context Rules**: 5 deterministic triggers with capability gating
- [ ] **Dismissal Memory**: Per-user+project+suggestion storage (local + server)
- [ ] **Rate Limiting**: 5 actions/min per user/project for quick actions
- [ ] **Permissions**: Backend `can` flags prevent unauthorized action exposure

### Week 5-6: Enhanced Settings (Production-Ready)
- [ ] **Settings Tab**: Enhanced project-settings-panel.tsx with unified error shapes
- [ ] **Privacy**: Backend redacts repo/org names based on user permissions
- [ ] **OAuth Handling**: Revoked tokens as first-class status with reconnect flows
- [ ] **Usage Analytics**: Real metrics with expert telemetry keys

### Week 7-8: Expert Testing & Rollout
- [ ] **E2E Happy Paths**: connect, push, deploy, reconnect OAuth flows
- [ ] **Failure Paths**: provider down, revoked token, 429s → actionable UI hints
- [ ] **Performance**: ETag effectiveness, SSE vs polling, status render blocking
- [ ] **Accessibility**: Screen reader testing, keyboard navigation, color blindness
- [ ] **Gradual Rollout**: Feature flag progression with telemetry monitoring

**Expert Production Patterns Applied:**
- ✅ **Idempotent Actions**: POST with `Idempotency-Key`, progress via events
- ✅ **Error Normalization**: `oauth_revoked|rate_limited|timeout|unknown` with hints
- ✅ **Backend Permissions**: UI never guesses what user can do
- ✅ **Resilient SSE**: Circuit breakers, backoff, polling fallback
- ✅ **Privacy-First**: Sensitive data redaction at API level

## User Experience Flows

### New User Onboarding
1. **First Project Creation**: Clean workspace, no overwhelming options
2. **After 10 minutes**: Subtle suggestion to connect database for dynamic content
3. **After first export attempt**: Prompt for Vercel deployment with clear benefits
4. **After 3 iterations**: GitHub suggestion with version control benefits

### Power User Experience
1. **Dashboard Overview**: All integrations status at-a-glance
2. **Workspace**: Contextual quick actions based on current task
3. **Command Center**: Advanced configuration and batch operations
4. **Automation**: Smart workflows triggered by integration events

### Mobile Experience
- Simplified status indicators (dot colors only)
- Swipe-accessible integration panel
- Essential quick actions prioritized
- Full features available in responsive modal

## Success Metrics

### Quantitative
- **Integration Adoption**: % of users connecting each integration
- **Time to First Integration**: From signup to first connection
- **Integration Usage**: Daily/weekly active integration usage
- **User Retention**: Users with 2+ integrations vs. 0-1 integrations
- **Support Tickets**: Reduction in integration-related issues

### Qualitative
- **User Interviews**: Perceived ease of integration setup
- **Task Completion**: Success rate for common integration workflows
- **Feature Discovery**: Users finding and using integration capabilities
- **Satisfaction**: Net Promoter Score for integration experience

## Technical Considerations

### Performance
- Lazy load integration panels to avoid initial bundle bloat
- WebSocket connections for real-time status (with graceful fallbacks)
- Efficient React Query caching for integration status
- Virtualized lists for large integration histories

### Accessibility
- ARIA labels for all integration status indicators
- Keyboard navigation for all integration controls
- High contrast mode support for status indicators
- Screen reader announcements for status changes

### Mobile Optimization
- Touch-friendly tap targets (44px minimum)
- Swipe gestures for integration panel access
- Responsive modal patterns for full features
- Progressive enhancement from basic to advanced features

## Risk Mitigation

### Technical Risks
- **Integration Failures**: Robust error handling and retry mechanisms
- **Rate Limiting**: Smart backoff strategies for external APIs
- **Performance**: Bundle size monitoring and code splitting

### UX Risks
- **Overwhelming Users**: A/B testing for suggestion frequency
- **Feature Discoverability**: User testing for UI effectiveness
- **Integration Complexity**: Graduated complexity (basic → advanced)

### Business Risks
- **User Confusion**: Clear benefit communication for each integration
- **Support Load**: Comprehensive documentation and error messages
- **Adoption Rate**: Gradual rollout with feature flags

## Future Enhancements (Phase 2)

### Advanced Features
- **Integration Marketplace**: Third-party integration discovery
- **Custom Workflows**: User-defined automation between integrations
- **Team Integrations**: Shared integration configurations
- **Integration Analytics**: Detailed usage and performance insights

### AI-Powered Features
- **Smart Recommendations**: ML-based integration suggestions
- **Automated Setup**: AI-assisted integration configuration
- **Anomaly Detection**: Proactive issue identification
- **Content Migration**: AI-powered migration between CMS platforms

## Expert Feedback Integration Summary

### ✅ Key Expert Insights Incorporated (Two Rounds)

**Round 1: Architecture & UX Foundation**
1. **Single Status Source** → Unified `/api/integrations/status` endpoint aggregating all 4 providers
2. **Unified Adapter Interface** → Consistent abstraction over provider-specific APIs
3. **One Realtime Channel** → Extended existing SSE infrastructure instead of 4 separate WebSockets
4. **Implementation Trims** → Simplified phases, Settings tab first, ML/workflows later
5. **Context Guardrails** → Anti-nag system with cooldowns and dismissal memory

**Round 2: Production Hardening & Performance**
6. **ETag Performance** → `If-None-Match` support to skip unchanged responses
7. **Backend Permission Flags** → Server determines what actions user `can` perform
8. **Unified Error Shape** → Consistent `oauth_revoked|rate_limited|timeout|unknown` handling
9. **SSE Resilience** → Backoff (1s→60s), circuit breakers, polling fallback
10. **Privacy-First** → Backend redacts sensitive data based on user permissions
11. **Expert A11y Patterns** → `role="toolbar"`, `aria-pressed`, proper ARIA attributes
12. **Idempotent Actions** → POST with `Idempotency-Key` using existing hooks
13. **Actionable Copy** → Verb-first, specific error messages with clear next steps

### 🏗️ Leveraged Existing Infrastructure

- ✅ **Feature Flags System**: Gradual rollout with percentage controls
- ✅ **SSE Infrastructure**: Real-time updates without new WebSocket connections
- ✅ **React Query Setup**: Caching with 10-20s intervals + jitter
- ✅ **GitHub Realtime**: Existing patterns for connection management
- ✅ **Project Settings Panel**: Enhanced existing component vs building new

### 🎯 Why This Approach Works

**Faster Delivery**: Builds on proven infrastructure instead of greenfield development
**Lower Risk**: Expert-validated patterns reduce technical and UX risks
**Better UX**: Concrete implementation details ensure consistent, accessible experience
**Maintainable**: Unified adapters contain provider complexity, clean separation of concerns

## Backend API Implementation Details ✅

**Status**: Backend team has implemented the unified integration status API and provided implementation answers.

### Authentication Pattern
- **Method**: Explicit `userId` parameters (query for GET, body for POST)
- **Pattern**: Standard SheenApps approach used across 30+ routes
- **No JWT cookies**: Each endpoint explicitly requires userId parameter

### Error Response Format
Follow the existing StructuredError pattern:
```typescript
{
  "error": "oauth_revoked",           // Stable error code
  "message": "GitHub authentication expired",  // User-friendly message
  "code": "GITHUB_OAUTH_REVOKED",     // Optional: structured code
  "params": {                         // Optional: context data
    "provider": "github",
    "reconnectUrl": "/auth/github"
  }
}
```

### TypeScript Interfaces
Created `src/types/integrationStatus.ts` with complete type definitions:
```typescript
import {
  IntegrationStatusResponse,
  IntegrationActionRequest,
  IntegrationStatusEvent
} from '@/types/integrationStatus';
```

### SSE Implementation
No special headers beyond authentication. Pattern for new SSE hook:
```typescript
const useIntegrationStatusSSE = (projectId: string, userId: string) => {
  // Create EventSource with Last-Event-ID resumption support
  // Handle connection state and event parsing
  // Return { events, connectionState }
}
```

### Action Execution
Manual UUID generation for idempotency:
```typescript
import { v4 as uuidv4 } from 'uuid';

const executeAction = async (actionRequest: IntegrationActionRequest) => {
  const idempotencyKey = uuidv4();
  // POST to /api/integrations/actions/{projectId} with Idempotency-Key header
}
```

### React Query Integration
Recommended patterns with 10s stale time and optimistic updates:
```typescript
const useIntegrationStatus = (projectId: string, userId: string) => {
  return useQuery({
    queryKey: ['integrations', 'status', projectId],
    queryFn: () => fetchIntegrationStatus(projectId, userId),
    staleTime: 10 * 1000, // 10s based on cache TTL
    refetchInterval: 30 * 1000, // 30s background refresh
    refetchOnWindowFocus: true,
  });
};
```

### Backend API Response Format (Production Ready)
```typescript
{
  "projectId": "p_123",
  "overall": "warning",           // error > warning > connected > disconnected
  "hash": "2b8e7a1f",            // stable hash for caching
  "renderHash": "9c3d4b2a",      // includes timestamps for UI invalidation
  "items": [
    {
      "key": "github",
      "configured": true,
      "visible": true,
      "status": "connected",       // connected|warning|error|disconnected
      "summary": "Linked to main · Last push 2m ago",
      "updatedAt": "2025-09-15T12:34:56Z",
      "actions": [
        {"id": "push", "label": "Push", "can": true},
        {"id": "pull", "label": "Pull", "can": true}
      ]
    },
    {
      "key": "vercel",
      "status": "warning",
      "summary": "Preview ok · Prod failing",
      "environments": [
        {"name": "preview", "status": "connected", "url": "https://preview.app"},
        {"name": "production", "status": "error", "summary": "Build failed"}
      ]
    }
    // ... sanity, supabase
  ]
}
```

### Smart Enhancements by Backend Team
1. **Dual Hash Strategy**: Separate hashes for caching vs UI invalidation
2. **Overall Status Priority**: Single status for workspace header indicator
3. **Vercel Environments**: Handles preview/production deployment complexity
4. **Visibility Control**: Allows hiding irrelevant integrations

---

## Implementation Progress Log

### ✅ Backend Ready (September 2025)
- [x] Unified integration status API (`/api/integrations/status`)
- [x] Real-time SSE events (`/api/integrations/events`)
- [x] Idempotent actions (`/api/integrations/actions/{projectId}`)
- [x] ETag caching and performance optimization
- [x] Last-Event-ID resumption support
- [x] Rate limiting (5 actions/min per user+project)

### 🔄 Current Implementation Progress (September 2025)

**Phase 1: Core Infrastructure** - ✅ **COMPLETED**
- [x] TypeScript interfaces created (`/src/types/integrationStatus.ts`)
- [x] React hooks implemented (`/src/hooks/use-integration-status.ts`)
- [x] Feature flags added (`ENABLE_INTEGRATION_STATUS_BAR`, `ENABLE_INTEGRATION_STATUS_SSE`, `ENABLE_INTEGRATION_ACTIONS`)
- [x] Integration status bar component (`/src/components/workspace/integration-status-bar.tsx`)
- [x] API route handlers for all 3 endpoints:
  - [x] Status endpoint (`/api/integrations/status`)
  - [x] Actions endpoint (`/api/integrations/actions/[projectId]`)
  - [x] Events SSE endpoint (`/api/integrations/events`)
- [x] Workspace header integration with feature flag support

**Implementation Details Completed**:
- ✅ **Authentication Pattern**: Explicit userId parameters following backend specifications
- ✅ **React Query Integration**: Optimistic updates with 10s stale time and cache invalidation
- ✅ **SSE Implementation**: Event resumption with Last-Event-ID and connection management
- ✅ **Error Handling**: StructuredError pattern with actionable error messages
- ✅ **Feature Flag Integration**: Progressive rollout ready with development environment enabled
- ✅ **Accessibility Compliance**: `role="toolbar"`, `aria-pressed` states, and screen reader support
- ✅ **Expert UI Patterns**: 16px monochrome icons, status dots, verb-first tooltips

**Files Created**:
```
src/types/integrationStatus.ts               # Complete TypeScript interfaces
src/hooks/use-integration-status.ts          # React Query hooks with SSE
src/components/workspace/integration-status-bar.tsx  # Main UI component
src/app/api/integrations/status/route.ts     # Status endpoint proxy
src/app/api/integrations/actions/[projectId]/route.ts # Actions endpoint proxy
src/app/api/integrations/events/route.ts     # SSE events proxy
src/config/feature-flags.ts                  # Updated with integration flags
src/components/builder/workspace/workspace-header.tsx # Updated with status bar
```

**Ready for Testing**: Core infrastructure is complete and ready for frontend testing with feature flags enabled in development environment.

**Phase 3: Integration Command Center** - ✅ **COMPLETED**
- [x] Enhanced project settings with tabbed interface (Overview | Setup | Health | Analytics)
- [x] Unified integration management with real-time status cards
- [x] Health monitoring with live SSE event stream
- [x] Quick actions with progress indicators and error handling
- [x] Backward compatibility with legacy setup interface
- [x] Feature flag controlled rollout (`ENABLE_INTEGRATION_STATUS_BAR`)

**Phase 3 Implementation Details**:
- ✅ **Tabbed Interface**: 4-tab navigation (Overview, Setup, Health, Analytics)
- ✅ **Integration Cards**: Rich status display with actions, environments, and diagnostics
- ✅ **Real-time Monitoring**: Live SSE events with connection state indicators
- ✅ **Batch Operations**: Multiple actions supported with progress tracking
- ✅ **Legacy Fallback**: Original setup interface available in Setup tab
- ✅ **Analytics Placeholder**: Future-ready analytics tab structure

**Files Updated for Phase 3**:
```
src/components/workspace/integration-command-center.tsx   # Main command center component
src/components/builder/project-settings-panel.tsx        # Updated to use command center
```

### 🔍 Implementation Discoveries & Next Steps

**Key Implementation Discoveries**:
1. **Feature Flag Integration**: Successfully integrated with existing feature flag system using progressive rollout pattern
2. **Authentication Alignment**: Matched backend specification for explicit userId parameters in all endpoints
3. **React Query Compatibility**: Used modern React Query v5 syntax with proper query key objects and cache invalidation
4. **SSE Resilience**: Implemented robust connection management with Last-Event-ID resumption and exponential backoff
5. **Accessibility First**: Built with ARIA compliance from the start - `role="toolbar"`, `aria-pressed`, screen reader support
6. **Error Boundary Patterns**: Structured error responses with actionable hints following existing codebase patterns

**Integration Points Identified**:
- ✅ **Workspace Header**: Clean integration with feature flag fallback to existing database button
- ✅ **Existing SSE Infrastructure**: Leveraged patterns from admin logs and GitHub sync implementations
- ✅ **Worker Auth System**: Used existing `createWorkerAuthHeaders()` for dual signature compatibility
- ✅ **Logger Integration**: Consistent logging with correlation IDs for debugging

**Testing Strategy** (Next Phase):
1. **Development Environment**: Feature flags enabled for testing
   ```env
   NEXT_PUBLIC_ENABLE_INTEGRATION_STATUS_BAR=true
   NEXT_PUBLIC_ENABLE_INTEGRATION_STATUS_SSE=true
   NEXT_PUBLIC_ENABLE_INTEGRATION_ACTIONS=true
   ```

2. **Testing Checklist**:
   - [ ] Verify status bar appears in workspace header when feature flag enabled
   - [ ] Test graceful fallback to database button when feature flag disabled
   - [ ] Validate API endpoint proxying to backend with authentication
   - [ ] Test SSE connection establishment and event handling
   - [ ] Verify optimistic updates on action execution
   - [ ] Test accessibility with screen readers and keyboard navigation

3. **Mock Data Strategy** (Backend Unavailable):
   - Create mock API responses matching backend interface
   - Test UI states: loading, error, all 4 integration statuses
   - Validate tooltip content and action button states

**Known Integration Considerations**:
- **Worker API Dependency**: Requires `WORKER_BASE_URL` configuration
- **Backend Coordination**: API endpoints proxy to backend - ensure backend is running for full testing
- **Development Fallbacks**: Consider mock data endpoints for isolated frontend development

**Phase 2 & 4 Backend Requirements**:
- 📋 **Backend Specification Created**: `SMART_INTEGRATION_SUGGESTIONS_BACKEND_REQUIREMENTS.md`
- 🔄 **Metrics Tracking Needed**: User iterations, content changes, session duration, satisfaction scores
- 🎯 **Suggestion Engine**: Rule-based system with dismissal tracking and cooldown logic
- 📊 **4 New API Endpoints**: Metrics tracking, suggestion context, dismissal handling, history
- 🗄️ **Database Tables**: `project_metrics`, `suggestion_dismissals` with proper indexing
- ⚡ **Performance Ready**: <300ms response times, rate limiting, data retention policies

**Phase 2 Implementation Path**:
1. **Backend Team**: Implement metrics tracking API from specification document
2. **Frontend Team**: Build smart suggestions panel using new endpoints
3. **Integration**: Connect suggestion logic with existing integration status system

**Backend Dependencies for Phase 2/4**:
- ❌ **Blocking**: Need metrics tracking endpoints for intelligent suggestions
- ✅ **Ready**: All other infrastructure (auth, integration status, SSE) complete
- 📋 **Specification**: Complete backend requirements document ready for development

### 🔍 Phase 3 Implementation Discoveries

**Key Technical Discoveries**:
1. **Tabbed Interface Excellence**: Using shadcn/ui Tabs component provides clean navigation between Overview/Setup/Health/Analytics
2. **Card-Based Status Display**: Rich integration cards show more context than simple status dots
3. **Vercel Environments Handling**: Backend's dual environment support (preview/production) maps well to card sub-items
4. **SSE Event Integration**: Real-time health monitoring enhances user confidence in integration status
5. **Legacy Compatibility**: Seamless fallback to original setup components maintains existing functionality

**UX Improvements Achieved**:
- **Progressive Disclosure**: Overview tab shows all integrations, Setup tab has detailed configuration
- **Visual Hierarchy**: Color-coded status indicators, clear action buttons, contextual error messages
- **Real-time Feedback**: Live event stream in Health tab, action progress indicators
- **Error Transparency**: Problem details with actionable hints (OAuth expired → Reconnect button)
- **Mobile Responsive**: Sheet layout adapts to different screen sizes

**Architecture Benefits**:
- **Component Reuse**: Leverages existing Connect* components in Setup tab
- **Feature Flag Control**: Same integration status bar flag controls command center enhancement
- **Data Consistency**: Uses same hooks and API endpoints as status bar
- **Future Extensibility**: Analytics tab placeholder ready for metrics implementation

**Performance Considerations**:
- **Lazy Loading**: Only active tab content is rendered
- **SSE Efficiency**: Health monitoring only connects when Health tab is active
- **Optimistic UI**: Action buttons show immediate feedback while backend processes
- **Caching Strategy**: React Query cache shared between status bar and command center

**Opportunities for Future Enhancement**:
1. **Analytics Tab**: Could show integration usage patterns, performance metrics, cost analysis
2. **Batch Operations**: Connect multiple integrations in sequence with dependency resolution
3. **Integration Templates**: Pre-configured integration sets for common project types
4. **Workflow Automation**: Trigger sequences (Deploy → Notify → Update CMS)
5. **Health Alerting**: Proactive notifications when integrations need attention

**Integration Command Center Benefits**:
- Transforms hidden integration settings into discoverable, actionable interface
- Provides comprehensive integration management without overwhelming users
- Maintains expert-validated accessibility and performance patterns
- Creates foundation for advanced integration workflows and analytics

---

## Conclusion

This plan transforms SheenApps from a tool with hidden powerful integrations into a platform where those integrations naturally enhance the user workflow. **Two rounds of expert feedback** plus **production-ready backend implementation** provide the foundation for enterprise-grade reliability.

**Backend Implementation Completed**:
- ✅ **Unified Status API**: Single endpoint aggregating all 4 integrations with dual hash strategy
- ✅ **Real-time Events**: SSE with Last-Event-ID resumption and 30s heartbeats
- ✅ **Idempotent Actions**: POST with rate limiting and progress tracking
- ✅ **Smart Enhancements**: Overall status priority, environment support, visibility control

**Frontend Implementation Ready**:
- ✅ **TypeScript Interfaces**: Complete type definitions created
- ✅ **Authentication Pattern**: Explicit userId parameters confirmed
- ✅ **React Query Integration**: Optimistic updates with 10s stale time
- ✅ **SSE Implementation**: Event resumption and connection management patterns

**Key Success Factors**:
1. **Production-Ready Backend**: Expert-validated API with performance optimization
2. **Seamless Integration**: Each integration feels like a natural extension of workspace workflow
3. **Leverage Existing**: Build on proven infrastructure (SSE, feature flags, React Query)
4. **Privacy & Security**: Backend-controlled permissions and data redaction

The backend implementation exceeds the original requirements with intelligent enhancements that will simplify frontend development and improve user experience.