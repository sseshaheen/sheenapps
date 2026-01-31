# Status Endpoint Consolidation - Implementation Plan

## Overview

Consolidate the redundant `/api/projects/[id]/status` endpoint into the main `/api/projects/[id]` endpoint to eliminate duplicate database queries and improve performance while maintaining essential rollback monitoring functionality.

## Key Improvements

### 1. Type Naming Consistency - Critical Gap Fixed ✅
**Problem**: Mixed naming conventions create "forever tax"  
**Solution**: Consistent camelCase for ALL API responses

```typescript
// ❌ Before: Mixed naming (snake_case + camelCase)
{
  preview_url: "...",           // snake_case from DB
  previewUrl: "...",           // camelCase client field
  current_version_id: "...",   // snake_case from DB  
  buildId: "..."               // camelCase client field
}

// ✅ After: Consistent camelCase
{
  previewUrl: "...",
  currentVersionId: "...",
  buildId: "...",
  buildStatus: "deployed",
  lastBuildStarted: "2025-08-03T23:04:08.785Z",
  lastBuildCompleted: "2025-08-03T23:05:15.975Z"
}
```

### 2. Optimized Polling Strategy ✅
**Problem**: Unnecessary polling during builds when build events system already handles progress  
**Solution**: Only poll during rollbacks, use `Infinity` for all other states

```typescript
// ✅ Optimized polling - only poll when absolutely necessary
refetchInterval: (query) => {
  const data = query.state.data;
  if (!data) return 10000;

  switch (data.buildStatus) {
    case 'building':
      return Infinity; // ✅ Build events system handles progress - no polling needed
    case 'rollingBack':
      return 2000;     // ✅ Only rollbacks need polling (no events system)
    case 'deployed':
    case 'failed': 
    case 'rollbackFailed':
      return Infinity; // ✅ Stops auto-polling, keeps manual refetch
    default:
      return 10000;
  }
}
```

**Key Insight**: Build progress is handled by `useCleanBuildEvents` system, making status polling redundant for builds. Rollbacks have no events system and require status polling for completion detection.

### 3. Mapping Utility - Eliminates Boilerplate ✅
**Problem**: Scattered mapping logic across components  
**Solution**: Centralized typed mapping utility

```typescript
// ✅ Clean mapping utility
export const mapProjectToStatus = (project: ProjectData): ProjectStatusData => ({
  id: project.id,
  buildStatus: project.buildStatus,
  currentVersionId: project.currentVersionId,
  currentVersionName: project.currentVersionName,
  previewUrl: project.previewUrl,
  subdomain: project.subdomain,
  lastBuildStarted: project.lastBuildStarted,
  lastBuildCompleted: project.lastBuildCompleted,
  updatedAt: project.updatedAt
});
```

## Implementation Phases

### Phase 1: Enhance Main Endpoint (Week 1)
**Goal**: Add status fields to `/api/projects/[id]` with consistent camelCase naming

#### 1.1 Update API Response Structure
**File**: `src/app/api/projects/[id]/route.ts`

```typescript
// ✅ Enhanced sanitizedProject with consistent camelCase
const sanitizedProject = {
  // Existing fields
  id: project.id,
  name: project.name,
  createdAt: project.created_at,
  updatedAt: project.updated_at,
  archivedAt: project.archived_at,
  ownerId: project.owner_id,
  businessIdea: (project.config as any)?.businessIdea || null,
  templateData: (project.config as any)?.templateData || null,
  hasTemplate: !!((project.config as any)?.templateData),
  
  // ✅ NEW: Status fields with consistent camelCase naming
  buildStatus: project.build_status || 'queued',
  currentBuildId: project.current_build_id,
  currentVersionId: project.current_version_id,
  currentVersionName: project.current_version_name,
  framework: project.framework,
  previewUrl: project.preview_url,
  subdomain: project.subdomain,
  lastBuildStarted: project.last_build_started,
  lastBuildCompleted: project.last_build_completed,
  
  // Legacy field mapping for backward compatibility during transition
  buildId: project.current_build_id, // Keep for existing components
  status: project.build_status || 'queued' // Keep for existing components
}
```

#### 1.2 Update TypeScript Interfaces
**File**: `src/types/project.ts`

```typescript
// ✅ Unified project interface with consistent naming
export interface ProjectData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  ownerId: string;
  businessIdea: string | null;
  templateData: object | null;
  hasTemplate: boolean;
  
  // Status fields with consistent camelCase
  buildStatus: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed';
  currentBuildId: string | null;
  currentVersionId: string | null;
  currentVersionName: string | null;
  framework: string;
  previewUrl: string | null;
  subdomain: string | null;
  lastBuildStarted: string | null;
  lastBuildCompleted: string | null;
  
  // Legacy fields (to be removed after migration)
  buildId?: string | null;
  status?: string;
}

export interface ProjectStatusData {
  id: string;
  buildStatus: string;
  currentVersionId: string | null;
  currentVersionName: string | null;
  previewUrl: string | null;
  subdomain: string | null;
  lastBuildStarted: string | null;
  lastBuildCompleted: string | null;
  updatedAt: string;
}
```

### Phase 2: Create Mapping Utility (Week 1)
**Goal**: Centralize mapping logic to eliminate boilerplate

#### 2.1 Create Mapping Utility
**File**: `src/utils/project-mapping.ts`

```typescript
import type { ProjectData, ProjectStatusData } from '@/types/project'

/**
 * Maps unified ProjectData to legacy ProjectStatusData interface
 * Used during transition period to maintain existing component compatibility
 */
export const mapProjectToStatus = (project: ProjectData): ProjectStatusData => ({
  id: project.id,
  buildStatus: project.buildStatus,
  currentVersionId: project.currentVersionId,
  currentVersionName: project.currentVersionName,
  previewUrl: project.previewUrl,
  subdomain: project.subdomain,
  lastBuildStarted: project.lastBuildStarted,
  lastBuildCompleted: project.lastBuildCompleted,
  updatedAt: project.updatedAt
});

/**
 * Type guard to check if project has status data
 */
export const hasStatusData = (project: any): project is ProjectData => {
  return project && typeof project.buildStatus === 'string';
};

/**
 * Validates that all required status fields are present
 */
export const validateStatusFields = (project: ProjectData): boolean => {
  const requiredFields = ['id', 'buildStatus', 'updatedAt'];
  return requiredFields.every(field => project[field as keyof ProjectData] !== undefined);
};
```

### Phase 3: Update Client Code (Week 2)
**Goal**: Switch `useProjectStatus` to use consolidated endpoint with improved refetch logic

#### 3.1 Update Status Hook
**File**: `src/hooks/use-project-status.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { mapProjectToStatus } from '@/utils/project-mapping'
import type { ProjectStatusData } from '@/types/project'

/**
 * Fetch project data from consolidated endpoint
 */
async function getProjectStatusFromAPI(projectId: string): Promise<ProjectStatusData> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch project: ${response.status}`);
  }

  const result = await response.json();
  
  if (!result.success || !result.project) {
    throw new Error('Invalid API response format');
  }

  // ✅ Use mapping utility to convert to status interface
  return mapProjectToStatus(result.project);
}

/**
 * Enhanced project status hook with improved refetch logic
 */
export function useProjectStatus(projectId: string) {
  return useQuery({
    queryKey: ['project-status', projectId],
    queryFn: () => getProjectStatusFromAPI(projectId),
    refetchInterval: (query) => {
      const data = query.state.data as ProjectStatusData | null;
      if (!data) return 10000;

      switch (data.buildStatus) {
        case 'rollingBack':
          return 2000; // Only rollbacks need polling - no events system
        case 'building':
          return Infinity; // Build events system handles progress
        case 'queued':
          return 5000; // Moderate polling for queued
        case 'deployed':
        case 'failed':
        case 'rollbackFailed':
          return Infinity; // ✅ Stop auto-polling, preserve manual refetch
        default:
          return 10000;
      }
    },
    refetchIntervalInBackground: false,
    staleTime: 1000,
    retry: (failureCount, error) => {
      if (failureCount < 3) return true;
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });
}
```

#### 3.2 Add Event-Driven Refresh
**File**: `src/hooks/use-project-with-recommendations.ts`

```typescript
import { useEffect } from 'react'
import { useProjectStatus } from './use-project-status'
import { usePostBuildRecommendations } from './use-project-recommendations'

/**
 * Coordinated hook that refreshes project status when recommendations arrive
 * This provides event-driven updates for build completions
 */
export function useProjectWithRecommendations(projectId: string, userId: string) {
  const { data: project, refetch: refreshProject } = useProjectStatus(projectId);
  const { recommendations, hasRecommendations } = usePostBuildRecommendations(
    projectId,
    userId,
    project?.buildStatus === 'deployed'
  );

  // ✅ Event-driven refresh when recommendations arrive (build completed)
  useEffect(() => {
    if (hasRecommendations) {
      refreshProject(); // Get fresh version info
    }
  }, [hasRecommendations, refreshProject]);

  return { 
    project, 
    recommendations, 
    hasRecommendations,
    refreshProject 
  };
}
```

### Phase 4: Remove Status Endpoint (Week 2)
**Goal**: Clean up redundant endpoint after migration

#### 4.1 Remove Status Route File
- Delete: `src/app/api/projects/[id]/status/route.ts`
- Update any remaining imports/references

#### 4.2 Update Component Imports
Replace direct `useProjectStatus` usage with the new consolidated approach where beneficial:

```typescript
// ✅ For components that need both project data and recommendations
const { project, recommendations } = useProjectWithRecommendations(projectId, userId);

// ✅ For components that only need status polling (rollback, etc.)
const { data: projectStatus } = useProjectStatus(projectId);
```

## Testing Strategy

### Manual Testing Checklist
- [ ] **Version Display**: VersionBadge components show correct `currentVersionName`
- [ ] **Publishing Logic**: Publish operations use correct `currentVersionId`
- [ ] **Build Progress**: Status badges update during active builds
- [ ] **Rollback Monitoring**: RollbackProgressPanel tracks status transitions correctly
- [ ] **Stable State Efficiency**: No polling when `buildStatus === 'deployed'`
- [ ] **Manual Refetch**: Manual refresh works when auto-polling is stopped

### Performance Validation
- [ ] **API Call Reduction**: Monitor network tab - should see near-zero polling except during rollbacks
- [ ] **Response Time**: Consolidated endpoint response time comparable to status endpoint
- [ ] **Database Load**: Single query per request instead of duplicate queries
- [ ] **Build Progress**: Confirm build events system handles progress without status polling

## Success Metrics

### Performance Improvements
- **95%+ reduction** in API calls - Only poll during rollbacks (rare operations)
- **Eliminate redundant endpoint** - Single database query instead of two  
- **Consistent data model** - No more mapping between different field names
- **Build progress optimization** - Leverage existing build events system instead of status polling

### Code Quality  
- **Reduced complexity** - One endpoint instead of two
- **Type safety** - Consistent camelCase naming prevents mapping errors
- **Maintainability** - Centralized mapping utility eliminates boilerplate

### User Experience
- **Proper rollback monitoring** - Real-time progress during rollback operations  
- **Efficient stable state handling** - No unnecessary polling when deployed
- **Event-driven build updates** - Fresh version info via recommendations timing

## Rollback Plan

If issues arise, rollback is simple:
1. **Restore status endpoint file** from git history
2. **Revert useProjectStatus hook** to use `/status` endpoint  
3. **Keep enhanced main endpoint** - no breaking changes to existing functionality

The implementation is designed to be **additive and reversible** with minimal risk.

## Implementation Progress

### ✅ COMPLETED  
- Analysis and planning phase
- Optimized polling strategy design  
- Implementation plan documentation
- **Phase 1**: Enhanced main endpoint (`/api/projects/[id]`) with status fields + camelCase naming
- **Phase 2**: Created mapping utility (`src/utils/project-mapping.ts`) with type safety
- **Phase 3**: Updated client code (`useProjectStatus` hook) with optimized polling (rollbacks only)
- **Phase 4**: Removed redundant status endpoint (`/api/projects/[id]/status`)
- **Build Events Fix**: Fixed field naming consistency (`preview_url` vs `previewUrl`)
- **TypeScript Compilation**: All compilation errors resolved

### 🧪 TESTING IN PROGRESS
- [x] TypeScript compilation clean (no errors)
- [x] Build process successful 
- [ ] Functional testing - rollback monitoring validation
- [ ] Performance testing - API call reduction verification  
- [ ] Build events integration validation

### ⏱️ ACTUAL TIMELINE
- **Day 1**: Complete implementation (Phases 1-4) ✅
- **Day 1**: Fix TypeScript issues and field naming ✅  
- **Day 2**: Testing and validation 🔄

## Implementation Notes

**Key Decision**: Only poll during `rollingBack` status - build progress handled by existing `useCleanBuildEvents` system.

**Performance Impact**: Expected 95%+ reduction in status API calls since rollbacks are rare compared to builds.

This approach provides immediate benefits while maintaining all existing functionality, especially the critical rollback monitoring capabilities.