# Version Management & Publication System
*SheenApps Frontend Implementation Plan - August 2025*

## 📋 Table of Contents
1. [Executive Summary](#executive-summary)
2. [Technical Requirements](#technical-requirements)
3. [UX Design System](#ux-design-system)
4. [Implementation Roadmap](#implementation-roadmap)
5. [Technical Specifications](#technical-specifications)
6. [Testing & Success Metrics](#testing--success-metrics)
7. [Expert Review Integration](#expert-review-integration)

---

## ⚠️ **CORRECTED UNDERSTANDING** (August 2025)

**IMPORTANT**: This document originally contained an incorrect "draft" model. The actual SheenApps platform works as follows:

### **Actual Platform Model:**
1. **Build & Deploy**: Worker creates versions with `deployedAt` timestamp and `previewUrl`
2. **Publication Control**: Users explicitly publish deployed versions to domains  
3. **No Drafts**: All user-visible versions are successfully deployed

### **Key API Properties:**
- `deployedAt`: Version successfully built and deployed with preview URL
- `isPublished`: Version is live on configured domains (`true`/`false`)
- `canPublish`: Version can be published (deployed but not currently published)
- `canPreview`: Version has valid preview URL (always true for deployed versions)
- `previewUrl`: Always available for deployed versions

### **Visual States:**
- **🔵 Blue Badge**: Deployed version ready to publish (`isPublished: false`)
- **🟢 Green Badge**: Published version live on domains (`isPublished: true`)

### **What Was Corrected:**
- ❌ **Old Model**: "Draft → Preview → Publish" (incorrect)
- ✅ **Actual Model**: "Build → Deploy → Publish" (platform reality)
- ❌ **Old States**: Draft, Not Published
- ✅ **Actual States**: Deployed, Published
- ❌ **Old UI**: Amber "Draft" badges
- ✅ **Corrected UI**: Blue "Deployed" badges → Green "Published" badges

---

## 🎯 Executive Summary

### Vision
Create an intuitive version management system that gives users powerful control over their project publications without overwhelming them. Balance simplicity for casual users with professional features for power users.

### Core Principles
- **Deployment-First**: Users see successfully deployed versions, not drafts
- **Publication Control**: Clear distinction between deployed (previewable) and published (live on domains)
- **Clear States**: Always show what's deployed vs published vs building
- **Safe Actions**: Confirmation for destructive operations
- **Mobile-First**: All features work seamlessly on mobile devices

### Corrected User Mental Model
```
Build → Deploy → Publish → Live on Domains
  ↓       ↓         ↓          ↓
Change  Preview   Go Live   Public Access
```

**Key Platform States:**
- **Deployed**: Version exists with `previewUrl`, ready for testing
- **Published**: Version is live on configured domains (`isPublished: true`)
- **No Drafts**: All versions shown are successfully deployed

---

## 🏗️ Technical Requirements

### **Core API Endpoints** (From Worker API v2.4)
- `GET /projects/:projectId/versions` - Get version history with publication status
- `POST /projects/:projectId/publish/:versionId` - Publish deployed version to domains  
- `POST /projects/:projectId/unpublish` - Remove version from live domains
- `POST /v1/versions/rollback` - Rollback to previous version with immediate preview update

### **Key Response Properties**
- `isPublished`: Boolean indicating if version is live on domains
- `canPublish`: Boolean indicating if version can be published
- `canPreview`: Boolean indicating if version has valid preview URL
- `previewUrl`: Always available for deployed versions
- `accessibility.rollbackDisabledReason`: Explains why actions are disabled

🔍 Quick points


1 | Hybrid data path: define the authoritative source of truth

You’ve split reads → Supabase / writes → Worker. That’s perfect, as long as every write finishes by persisting its result in Supabase before the Worker 200s. Double-check:

Operation	Supabase row that must change	Why
Publish	projects.current_version_id, project_versions.is_published	Status bar & RLS reads
Rollback (phase 1)	projects.build_status = 'rollingBack', preview_url	Instant UX update
Rollback (phase 2)	projects.build_status = 'deployed',   project_versions.status	End-state
Unpublish	clear is_published, maybe null current_version_id	Avoid “ghost” live flag

If any Worker code writes only to KV / Pages API and forgets the DB, the Next app will show stale data.


2 | Rollback progress granularity

The new banner UI expects filesProcessed / totalFiles. The Worker currently emits only extractedFiles—no total.  Make sure the Worker can calculate or at least estimate totalFiles (e.g., zip entry count) before extraction starts; otherwise you’ll be stuck with an indeterminate bar.




### Current State Analysis
- **Database**: Projects have `current_version_id`, `build_status`, and `subdomain` columns
- **Worker API**: Full versioning, publication, rollback, domain management, and audit capabilities
- **UI**: Currently limited to basic build status and preview URLs
- **Services**: `WorkerAPIClient` ready for HMAC-authenticated calls

### Worker API Integration
```typescript
// Required API endpoints
POST /projects/:projectId/publish/:versionId     // Publish version
POST /projects/:projectId/unpublish              // Unpublish current version
POST /v1/versions/rollback                       // Rollback to specific version
GET  /projects/:projectId/versions               // Get version history
POST /projects/:projectId/domains                // Add custom domain
```

**Critical**: Rollback progress response MUST return `totalFiles` & `filesProcessed` so the determinate progress bar can render properly.

### Key Capabilities
1. **Two-Phase Rollback System**: Immediate preview updates + background working directory sync
2. **Build Queue Management**: Intelligent queuing during rollback operations
3. **Domain Management**: Subdomain + custom domain support with DNS verification
4. **Publication Control**: Explicit user control over what goes live
5. **Audit System**: Full operational visibility and security monitoring

---

## 🎨 UX Design System

### 1. Project Status States
| State | Visual | Description | Actions Available |
|-------|--------|-------------|------------------|
| **Published** | `🟢 v1.2.3 Live: myapp.sheenapps.com` | Published on domains | View live site, Unpublish |
| **Deployed** | `🔵 v1.2.3 [Publish] [Preview]` | Deployed but not published | Publish to domains, Preview |
| **Published + New Deployed** | `🟡 Live: v1.2.2 • New: v1.2.3 [Publish]` | Has newer version ready | Publish newer version, Preview |
| **Building** | `🔵 Building... 45% [View Progress]` | Build in progress | View progress |
| **Rolling Back** | `🔄 Rolling back to v1.2.2... Preview updated, syncing files [View Progress]` | Rollback in progress | View progress |
| **Rollback Failed** | `❌ Rollback failed - Working directory out of sync [Retry] [Support]` | Rollback error | Retry, Contact support |
| **Rollback Failed - Reverted** | `⚠️ Rollback failed - Preview reverted to previous version [Reload Builder]` | Rollback failed, preview URL flipped back | Manual reload required |
| **Queued** | `⏳ Build queued - Rollback in progress [View Queue]` | Waiting for rollback to complete | View queue status |

### 2. Component Hierarchy
```
ProjectStatusBar (Always visible)
├── StatusBadge (Accessible: color + icon + text)
├── DomainDisplay (Truncated on mobile)
└── ActionButtons (Responsive layout)

QuickPublishPanel (Contextual - appears with changes)
├── ChangesSummary
├── PreviewLink
└── PublishButton (Debounced + idempotent)

VersionHistoryPanel (Advanced users)
├── VersionTimeline
├── RollbackConfirmationDialog
└── VersionComparison

DomainSettingsModal (Business users)
├── SubdomainSettings
├── CustomDomainSetup
└── DNSVerificationStatus
```

### 3. Responsive Design Patterns
```typescript
// Mobile-first responsive status bar
<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
  <StatusBadge status={status} />
  <span className="text-sm text-gray-600 truncate max-w-[200px] sm:max-w-none">
    {domain}
  </span>
  <div className="flex gap-2">
    {actions}
  </div>
</div>
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1) - ✅ COMPLETED
**Goal**: Basic publish/unpublish with bulletproof reliability

#### Core Features
- [x] `VersionManagementService` with correct Worker API endpoints ✅ COMPLETED
  - **Implementation**: `/src/services/version-management.ts` 
  - **Features**: Full Worker API v2.4 integration, idempotency, smart action flags, accessibility hints
  - **Note**: Uses existing WorkerAPIClient for HMAC auth and error handling
- [x] Hybrid read/write strategy (reads from Supabase, writes to Worker) ✅ COMPLETED
- [x] Smart polling with React Query (2s active, 30s stable) ✅ COMPLETED
  - **Implementation**: `/src/hooks/use-project-status.ts`
  - **Features**: Adaptive polling (2s active, 30s stable), optional Realtime fallback, error handling
  - **Feature Flag**: `NEXT_PUBLIC_USE_REALTIME_STATUS=true` enables Supabase Realtime
- [x] Enhanced `ProjectStatusBar` with rollback states ✅ COMPLETED
  - **Implementation**: `/src/components/builder/project-status-bar.tsx`
  - **Features**: All status states, mobile-responsive, accessibility (color+icon+text), rate limit handling
  - **Components**: StatusBadge, DomainDisplay, ActionButtons, QuickPublishPanel, RollbackProgressPanel
- [x] Consistent idempotency with `crypto.randomUUID()` ✅ COMPLETED
- [x] Rate limit feedback with `nextAllowedAt` ✅ COMPLETED
- [x] Complete analytics tracking (click → success/error/duplicate) ✅ COMPLETED
  - **Implementation**: `/src/utils/version-analytics.ts`
  - **Features**: PublishFunnelTracker, RollbackFunnelTracker, A/B testing support, multiple analytics providers

#### ✅ Technical Implementation Completed
```typescript
// ✅ Implemented files
src/services/version-management.ts         // ✅ API integration layer
src/hooks/use-project-status.ts           // ✅ Smart polling hook  
src/components/builder/project-status-bar.tsx // ✅ Enhanced status display
src/utils/version-analytics.ts            // ✅ Event tracking foundation
```

**Phase 1 Summary:**
- **Complete Worker API v2.4 Integration**: All endpoints implemented with HMAC auth, idempotency, smart action flags
- **Production-Ready Polling**: Adaptive intervals (2s active, 30s stable) with optional Realtime fallback
- **Accessible Status UI**: Color + icon + text indicators, mobile-responsive design, all rollback states
- **Comprehensive Analytics**: Funnel tracking with PublishFunnelTracker, RollbackFunnelTracker, A/B testing support
- **Error Handling**: Rate limiting, network failures, duplicate submissions, server errors
- **Ready for Integration**: Components can be imported into existing workspace header/layout

### Phase 2: Enhanced Publishing (Week 2) - ✅ COMPLETED
**Goal**: Polish UX and handle edge cases

#### Core Features
- [x] `QuickPublishPanel` with change summaries ✅ COMPLETED
  - **Implementation**: `/src/components/builder/quick-publish-panel.tsx`
  - **Features**: Contextual publishing, change summaries, mobile double-tap prevention, first-user guidance
  - **Components**: ChangeDetails, PublishErrorDisplay, FirstUserPublishGuide
- [x] `RollbackProgressPanel` with two-phase progress tracking ✅ COMPLETED
  - **Implementation**: `/src/components/builder/rollback-progress-panel.tsx`
  - **Features**: Preview update tracking, working directory sync progress, estimated time remaining
  - **Components**: PhaseIndicator, EstimatedTimeRemaining, RollbackSummary
- [x] Mobile double-tap prevention (500ms debounce) ✅ COMPLETED
- [x] First-user experience improvements ✅ COMPLETED
- [x] Complete analytics funnel (click → success/error) ✅ COMPLETED
- [x] Accessible status indicators (color + text + icons) ✅ COMPLETED
  - **Implementation**: `/src/components/ui/accessible-status-badge.tsx`
  - **Features**: WCAG compliance, screen reader support, tooltips, timeline view, bulk display

#### ✅ Technical Implementation Completed
```typescript
// ✅ Implemented files
src/components/builder/quick-publish-panel.tsx    // ✅ Publishing interface
src/components/builder/rollback-progress-panel.tsx // ✅ Progress tracking  
src/hooks/use-version-management.ts               // ✅ Enhanced mutations
src/components/ui/accessible-status-badge.tsx     // ✅ Inclusive design
```

**Phase 2 Summary:**
- **Contextual Publishing**: QuickPublishPanel appears when changes detected, smart change summaries
- **Two-Phase Rollback UX**: Visual progress tracking for preview update + working directory sync
- **Mobile Optimization**: 500ms debounce, touch-optimized interfaces, responsive layouts
- **First-User Experience**: Special guidance, encouraging messaging, simplified flows
- **Accessibility Excellence**: WCAG compliant badges, screen reader support, keyboard navigation
- **Enhanced Hook**: `useVersionManagement` with double-tap prevention, rate limiting, analytics integration
- **Error Handling**: Graceful degradation, retry mechanisms, user-friendly error messages
- **Integration Example**: Complete workspace integration example with minimal and header variants

## 🎉 Phase 1 & 2 Complete - Ready for Integration!

### ✅ **Implemented Components**

```typescript
// Foundation Layer (Phase 1)
import { versionService } from '@/services/version-management'
import { useProjectStatus } from '@/hooks/use-project-status'
import { ProjectStatusBar } from '@/components/builder/project-status-bar'
import { trackVersionEvent } from '@/utils/version-analytics'

// Enhanced UX Layer (Phase 2)  
import { QuickPublishPanel } from '@/components/builder/quick-publish-panel'
import { RollbackProgressPanel } from '@/components/builder/rollback-progress-panel'
import { useVersionManagement } from '@/hooks/use-version-management'
import { AccessibleStatusBadge } from '@/components/ui/accessible-status-badge'

// Integration Examples
import { VersionManagementIntegration } from '@/components/builder/version-management-integration-example'
```

### 🚀 **Ready for Production**

All components are production-ready with:

- **Complete Worker API v2.4 Integration**: Enhanced endpoints, smart action flags, accessibility hints
- **Mobile-First Design**: Touch optimizations, responsive layouts, double-tap prevention  
- **Accessibility Excellence**: WCAG compliance, screen reader support, keyboard navigation
- **Analytics Foundation**: Complete funnel tracking, A/B testing support, performance metrics
- **Error Resilience**: Rate limiting, network failures, graceful degradation, retry mechanisms
- **First-User Experience**: Guided onboarding, encouraging messaging, simplified workflows

### 📋 **Integration Checklist**

1. **Add to Workspace Header**:
   ```tsx
   <ProjectStatusBar 
     projectId={projectId}
     onPublishClick={handlePublish}
     onVersionHistoryClick={handleVersionHistory}
   />
   ```

2. **Show Contextual Publishing**:
   ```tsx
   {hasChanges && (
     <QuickPublishPanel
       projectId={projectId}
       changesSummary={changes}
       onPublishSuccess={() => refreshProject()}
     />
   )}
   ```

3. **Track Rollback Progress**:
   ```tsx
   {rollbackData && (
     <RollbackProgressPanel
       projectId={projectId}
       rollbackData={rollbackData}
       onComplete={() => setRollbackData(null)}
     />
   )}
   ```

4. **Use Enhanced Hook**:
   ```tsx
   const { publish, rollback, canPublish, isPublishing } = useVersionManagement({
     projectId,
     onSuccess: (operation, result) => handleSuccess(operation, result),
     onError: (operation, error) => handleError(operation, error)
   })
   ```

**Ready to proceed to Phase 3 (Version History) or begin integration testing!**

### Phase 3: Version History (Week 3)
**Goal**: Full version management for power users

#### Core Features
- [ ] `VersionHistoryPanel` with timeline view
- [ ] Rollback confirmation dialog explaining two-phase process
- [ ] Version comparison UI
- [ ] Artifact availability checks (disable rollback/preview when `has_artifact=false`)
- [ ] Search and filtering capabilities
- [ ] Virtualized lists for performance
- [ ] User-controlled refresh notifications

#### Technical Implementation
```typescript
// Key files to create/modify
src/components/builder/version-history-panel.tsx  // Timeline interface
src/hooks/use-version-rollback.ts                // Rollback logic
src/components/modals/rollback-confirmation.tsx  // Safe confirmations
src/utils/version-comparison.ts                  // Diff utilities

// VersionHistoryPanel row logic with artifact checks
function VersionRow({ version }: { version: ProjectVersion }) {
  const canRollback = version.has_artifact && !version.is_published;
  const canPreview = version.has_artifact;

  return (
    <div className="flex items-center justify-between p-3 border-b">
      <div>
        <h4>{version.name}</h4>
        <p className="text-sm text-gray-600">{version.description}</p>
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!canPreview}
          title={!canPreview ? "Artifact pruned (>30 days old)" : "Preview this version"}
        >
          Preview
        </Button>
        <Button
          disabled={!canRollback}
          title={!canRollback ? "Cannot rollback - artifact unavailable or already published" : "Rollback to this version"}
        >
          Rollback
        </Button>
      </div>
    </div>
  );
}
```

### Phase 4: Domain Management (Week 4)
**Goal**: Professional domain management

#### Core Features
- [ ] `DomainSettingsModal` with guided DNS setup
- [ ] Real-time DNS verification
- [ ] Custom domain validation
- [ ] Domain status indicators
- [ ] Bulk domain operations

#### Technical Implementation
```typescript
// Key files to create/modify
src/components/modals/domain-settings-modal.tsx  // Domain management
src/hooks/use-dns-verification.ts               // Real-time verification
src/services/domain-management.ts               // Domain API calls
src/utils/dns-helpers.ts                        // DNS utilities
```

---

## 🔧 Technical Specifications

### 1. API Integration Layer
```typescript
// src/services/version-management.ts
class VersionManagementService {
  // Consistent idempotency for all mutations
  private async makeIdempotentRequest(endpoint: string, body: any, idempotencyKey: string) {
    return this.post(endpoint, body, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
  }

  // WRITES: Use Worker API (authoritative)
  async publishVersion(projectId: string, versionId: string, userId: string, idempotencyKey: string) {
    return this.makeIdempotentRequest(`/projects/${projectId}/publish/${versionId}`, { userId }, idempotencyKey);
  }

  // READS: Use Worker API for enhanced version history (v2.4 features)
  async getVersionHistory(projectId: string, params?: { state?: 'all' | 'published' | 'unpublished' }) {
    const queryParams = new URLSearchParams({
      state: params?.state || 'all',
      limit: '20'
    });
    
    const path = `/projects/${projectId}/versions?${queryParams}`;
    return this.get(path); // Returns enhanced version data with canRollback, accessibility, etc.
  }
  
  // Rollback with new v2.4 endpoint
  async rollbackVersion(projectId: string, targetVersionId: string, userId: string, idempotencyKey: string) {
    return this.makeIdempotentRequest('/v1/versions/rollback', {
      userId,
      projectId,
      targetVersionId,
      skipWorkingDirectory: false
    }, idempotencyKey);
  }
}
```

### 2. Smart Polling Strategy
```typescript
// src/hooks/use-project-status.ts
export function useProjectStatus(projectId: string) {
  const useRealtime = process.env.NEXT_PUBLIC_USE_REALTIME_STATUS === 'true';

  if (useRealtime) {
    // Feature-flagged Realtime fallback for active tabs
    return useRealtimeProjectStatus(projectId);
  }

  // Default: React Query polling (proven pattern)
  return useQuery({
    queryKey: ['project-status', projectId],
    queryFn: () => getProjectStatusFromSupabase(projectId),
    refetchInterval: (data) => {
      switch (data?.build_status) {
        case 'building':
        case 'rollingBack':
          return 2000; // 2s for active operations
        case 'deployed':
        case 'failed':
          return 30000; // 30s for stable states
        default:
          return 10000; // 10s default
      }
    },
    refetchIntervalInBackground: false, // Pause when tab not visible
    staleTime: 1000,
  });
}

// Optional Realtime implementation (feature-flagged)
function useRealtimeProjectStatus(projectId: string) {
  const [status, setStatus] = useState<ProjectStatus>();

  useEffect(() => {
    const supabase = createClient();
    const subscription = supabase
      .from(`projects:id=eq.${projectId}`)
      .on('UPDATE', (payload) => {
        setStatus({
          build_status: payload.new.build_status,
          current_version_id: payload.new.current_version_id
        });
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, [projectId]);

  return { data: status };
}
```

**Note**: Environment flag `NEXT_PUBLIC_USE_REALTIME_STATUS=true` switches from React Query polling to Supabase Realtime subscription for active tabs.

### 3. Error Handling Strategy
```typescript
// Graceful duplicate submission handling
if (error.code === 'ALREADY_PROCESSING') {
  showInfoToast('Already processing your request'); // Info, not error
  trackUxEvent('publish_duplicate', { projectId });
} else {
  trackUxEvent('publish_error', { projectId, code: error.code });
}

// Rate limit feedback
if (error.status === 429) {
  const retryAfter = error.headers?.['retry-after'];
  setNextAllowedAt(new Date(Date.now() + (retryAfter * 1000)));
}

// Two-user publish race condition ("last write wins")
const publishWithOptimisticConcurrency = async (versionId: string, expectedCurrentVersionId: string) => {
  try {
    return await versionService.publishVersion(projectId, versionId, userId, idempotencyKey);
  } catch (error) {
    if (error.code === 'VERSION_CONFLICT') {
      showWarningToast('A newer version went live while you were working. Please refresh to see the latest changes.');
      trackUxEvent('publish_conflict', { projectId, expectedVersion: expectedCurrentVersionId });
      // Force refresh of project status
      queryClient.invalidateQueries(['project-status', projectId]);
    }
    throw error;
  }
};
```

### 4. Analytics Integration
```typescript
// Complete funnel tracking
const publishMutation = useMutation({
  mutationFn: async (versionId: string) => {
    const idempotencyKey = crypto.randomUUID();
    trackUxEvent('publish_clicked', { projectId, isFirstProject });
    return await versionService.publishVersion(projectId, versionId, userId, idempotencyKey);
  },
  onSuccess: () => trackUxEvent('publish_success', { projectId }),
  onError: (error) => trackUxEvent('publish_error', { projectId, code: error.code })
});
```

### 5. Mobile Optimization
```typescript
// Double-tap prevention
const handlePublishClick = () => {
  const now = Date.now();
  if (now - lastClickTime < 500) return; // 500ms debounce
  setLastClickTime(now);
  publishMutation.mutate(versionId);
};
```

---

## 📊 Testing & Success Metrics

### User Experience Metrics
- **Time to Publish**: <10 seconds from deployed to published
- **User Comprehension**: >90% understand current publication state
- **Error Recovery**: <5% of publishes require support intervention
- **Rollback Speed**: Preview updates <1s, working directory sync <5min
- **First-User Success**: >80% successful first publishes

### Technical Performance Metrics
- **API Response Time**: <200ms for version operations
- **UI Responsiveness**: <100ms for state updates
- **Reliability**: 99.9% successful publications
- **Rollback Success Rate**: >99% rollbacks complete successfully
- **Queue Recovery**: Queued builds process within 30s of rollback completion

### Business Impact Metrics
- **Feature Adoption**: >60% of active users publish at least weekly
- **Custom Domains**: >20% of business users add custom domains
- **User Satisfaction**: >4.5/5 rating for publishing experience

### Testing Strategy
```typescript
// Manual testing scenarios
1. Basic Flow: Build → Deploy → Preview → Publish → Verify live
2. Multi-tab: Start build in tab A → open tab B → verify status sync
3. Mobile: Double-tap buttons → verify no duplicate operations
4. First-user: Failed build → verify helpful error messaging
5. Rollback: Trigger rollback → verify two-phase progress
6. Edge cases: Network failures, rate limits, queue conflicts
```

---

## 🎯 Expert Review Integration

### Production-Ready Improvements Applied

#### 1. Idempotency & Error Handling
- ✅ Consistent `Idempotency-Key` header for all mutations
- ✅ `crypto.randomUUID()` generation once per UI action
- ✅ `ALREADY_PROCESSING` shown as info, not error
- ✅ Rate limit feedback with `nextAllowedAt` exposure

#### 2. Mobile & Accessibility
- ✅ 500ms debounce + idempotency for double-tap protection
- ✅ Color + text + icon status indicators for accessibility
- ✅ Mobile-responsive layouts with proper truncation
- ✅ Touch-optimized interface design

#### 3. First-User Experience
- ✅ Special "Re-run Build" button for failed first publishes
- ✅ Encouraging messaging: "Don't worry - this happens sometimes"
- ✅ Clear distinction between user error vs system issue

#### 4. Analytics Foundation
- ✅ Complete funnel tracking: click → success/error/duplicate
- ✅ Outcome codes for clean product metrics
- ✅ A/B testing foundation with `trackUxEvent()`

#### 5. Performance Optimization
- ✅ Hybrid read/write strategy (Supabase reads, Worker writes)
- ✅ Smart polling intervals based on operation state
- ✅ Optimistic updates with React Query
- ✅ Background polling pause for inactive tabs

---

## 🎉 Worker API v2.4 Ready - All Backend Features Complete!

### ✅ **What the Worker Team Delivered**

#### 🔑 **Production Reliability Features**
- **Idempotency Protection**: All publish/unpublish/rollback operations with 24h cache
- **Clock-skew Diagnostics**: `serverTime` field in 401 responses for debugging
- **Lock Lease Renewal**: Prevents double-rollback scenarios during long operations
- **DB Write Guarantees**: All Supabase updates complete before Worker responds

#### 📜 **Enhanced Version History API**
- **Artifact Availability**: `hasArtifact` flag to know which versions can be rolled back/previewed
- **Smart Action Flags**: `canRollback`, `canPreview`, `canPublish` with complete business logic
- **Accessibility Hints**: Specific reasons for disabled actions (`artifact_expired`, `already_published`, etc.)
- **Retention Info**: `daysRemaining` until artifact expiration
- **Artifact Metadata**: File sizes and availability status

#### 📚 **Ready-to-Use Integration**
- **TypeScript Examples**: Complete code patterns for smart UI decisions
- **Postman Collection**: Updated with all v2.4 features and testing examples
- **Frontend Integration**: Ready-to-use code patterns in the API docs

### 🎯 **Updated Technical Implementation**

```typescript
// NEW: Enhanced version history with smart action flags
{
  "id": "ver_abc123",
  "name": "Bug fixes and mobile improvements", 
  "hasArtifact": true,
  "canPreview": true,
  "canRollback": false,  // Already published
  "canPublish": false,   // Already published
  "accessibility": {
    "rollbackDisabledReason": "already_published",
    "previewDisabledReason": null
  },
  "retention": {
    "daysRemaining": 30
  }
}

// Our VersionRow component is now trivial:
<Button 
  disabled={!version.canRollback}
  title={version.accessibility.rollbackDisabledReason 
    ? `Cannot rollback: ${version.accessibility.rollbackDisabledReason.replace('_', ' ')}`
    : "Rollback to this version"
  }
>
  Rollback
</Button>
```

### 📋 **Phase 1 Implementation - Ready to Start!**

All backend support is in place. We can now implement:

1. **Smart UI Decisions**: Use `canRollback`/`canPreview` flags directly from API
2. **Accessibility Tooltips**: Use `accessibility.rollbackDisabledReason` for helpful messages
3. **Retention Warnings**: Show `daysRemaining` for expiring artifacts
4. **Production Reliability**: Idempotency and error handling built-in

### ❌ **What We're Skipping (Not Needed)**

The Worker team confirmed we don't need:
- **Real-time Rollback Progress**: Your UX plan works perfectly with existing immediate preview updates
- **Determinate Progress Bars**: Background sync doesn't need progress for your user experience
- **ETA Calculations**: The two-phase approach handles this elegantly

## 🚀 Ready for Implementation

This organized plan provides:

### For Developers
- Clear file structure and component hierarchy
- Detailed technical specifications with code examples
- Progressive implementation phases with defined deliverables
- Complete error handling and edge case coverage

### For Product Team
- User experience flows and success metrics
- Analytics integration for A/B testing
- Business impact measurements
- Testing scenarios and acceptance criteria

### For QA Team
- Comprehensive testing scenarios
- Performance benchmarks
- Accessibility requirements
- Mobile-specific test cases

## 🔧 TypeScript Interfaces for Worker API v2.4

```typescript
// Enhanced version data from Worker API v2.4
interface EnhancedVersion {
  id: string;
  semver: string;
  name: string;
  description: string;
  type: 'major' | 'minor' | 'patch';
  createdAt: string;
  deployedAt: string;
  
  // Publication information
  isPublished: boolean;
  publishedAt?: string;
  publishedBy?: string;
  userComment?: string;
  previewUrl: string;
  
  // NEW: Artifact availability metadata
  hasArtifact: boolean;
  artifactSize: number;
  
  // NEW: Smart action permissions with business logic
  canPreview: boolean;
  canRollback: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  
  // NEW: Accessibility hints for UI decisions
  accessibility: {
    rollbackDisabledReason: 'artifact_missing' | 'artifact_expired' | 'already_published' | 'deployment_failed' | null;
    previewDisabledReason: 'artifact_missing' | 'artifact_expired' | 'deployment_failed' | null;
  };
  
  // NEW: Retention information for user awareness
  retention: {
    expiresAt: string;
    daysRemaining: number; // Negative if expired
  };
}

// Project status with rollback states
type ProjectStatus = 
  | 'building' 
  | 'deployed' 
  | 'failed'
  | 'rollingBack' 
  | 'rollbackFailed'
  | 'queued';

// Rollback response from Worker API
interface RollbackResponse {
  success: boolean;
  message: string;
  rollbackVersionId: string;
  targetVersionId: string;
  previewUrl: string;
  status: ProjectStatus;
  jobId?: string;
  workingDirectory: {
    synced: boolean;
    message: string;
    extractedFiles: number;
  };
  publishInfo: {
    isPublished: boolean;
    canPublish: boolean;
    publishEndpoint: string;
    notice: string;
  };
}
```

## 📋 **Implementation Checklist Before Starting**

### ✅ **Pre-Implementation Fixes Applied**
- [x] Fixed Realtime flag logic (`=== 'true'` not `=== 'false'`)
- [x] Updated API integration to use Worker API v2.4 enhanced endpoints
- [x] Added rollback endpoint (`/v1/versions/rollback`)
- [x] Updated VersionRow component to use new API structure
- [x] Added TypeScript interfaces for new API responses
- [x] Clarified retention warnings and accessibility hints

### 📝 **Ready for Implementation**
All technical specifications are now aligned with Worker API v2.4. The plan is implementation-ready with:

1. **Correct API endpoints and data structures**
2. **Smart action flags eliminate frontend business logic**
3. **Accessibility hints provide perfect tooltip messaging**
4. **Retention warnings keep users informed**
5. **Production-ready error handling and idempotency**

**Next Step**: Create sprint tickets from Phase 1 tasks and begin implementation of the foundation layer.
