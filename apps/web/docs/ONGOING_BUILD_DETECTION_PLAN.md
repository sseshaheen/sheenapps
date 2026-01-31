# Ongoing Build Detection: Robust Implementation Plan

## Problem Statement

**Critical UX Issue**: When a user initiates a project update (build) and then:
- Opens the same project in a new tab, OR
- Refreshes the page

The new tab/refreshed page shows **no indication** of the ongoing build, even though the worker process is still running and events are being tracked in the database.

**User Impact**: 
- Confusing experience - build appears "lost"
- Users may start duplicate builds
- No progress visibility for ongoing operations
- Potential data inconsistency

## Root Cause Analysis

Based on comprehensive codebase analysis, the issue is a **buildId persistence gap**:

### Current Implementation Status

#### ✅ **What Works (Architecture is Sound)**
1. **Build Events System**: Clean events API correctly tracks builds in `project_build_events` table
2. **Database Structure**: Projects have `current_build_id` column for persistence (migrated from `config.buildId`)
3. **Polling System**: `useCleanBuildEvents` hook with intelligent React Query polling
4. **Initial Project Creation**: buildId correctly saved to database during project creation

#### ❌ **The Critical Gap**
**BuildId persistence is inconsistent across the system:**

**✅ Initial Project Creation** (`/api/projects/route.ts`):
```typescript
if (deployResult.buildId) {
  // ✅ Now saved to new schema columns
  // build_status: 'building'
  // current_build_id: buildId  
  // last_build_started: timestamp
}
```

**❌ Chat/Workspace Updates** (Multiple components):
```typescript
if (updateResult.success && updateResult.buildId) {
  setCurrentBuildId(updateResult.buildId)  // ✅ Local state only
  // ❌ MISSING: No database persistence!
}
```

### Affected Components
1. `/src/components/builder/builder-chat-interface.tsx` (line ~475)
2. `/src/components/builder/responsive-workspace-content-simple.tsx` (line ~76) 
3. `/src/components/builder/workspace-page.tsx` (line ~148)

## Comprehensive Solution Plan

### Phase 1: Immediate Fix - BuildId Persistence 🚨 **CRITICAL**

#### 1.1 Create BuildId Update API Endpoint
**File**: `/src/app/api/projects/[id]/build/route.ts`

```typescript
import { createServerSupabaseClientNew } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { buildId } = await request.json()
    
    const supabase = await createServerSupabaseClientNew()
    
    // Update project config with new buildId
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        config: { buildId },
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, project: data })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
```

#### 1.2 Update All Build-Triggering Components

**Template for each component**:
```typescript
// After successful build initiation
if (updateResult.success && updateResult.buildId) {
  setCurrentBuildId(updateResult.buildId)
  
  // 🔧 NEW: Persist to database
  try {
    await fetch(`/api/projects/${projectId}/build`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildId: updateResult.buildId })
    })
    console.log('✅ BuildId persisted to database:', updateResult.buildId)
  } catch (error) {
    console.error('❌ Failed to persist buildId:', error)
    // Non-blocking - build continues even if persistence fails
  }
}
```

#### 1.3 Enhanced Project Data Loading
**File**: `/src/hooks/use-workspace-project.ts`

Ensure buildId is properly extracted from project config:
```typescript
const processedProject = {
  ...project,
  buildId: project.config?.buildId || null
}
```

### Phase 2: Build State Recovery 🔄 **HIGH PRIORITY**

#### 2.1 Build State Detection Logic
**File**: `/src/hooks/use-ongoing-build-detection.ts` (New)

```typescript
export function useOngoingBuildDetection(projectId: string, userId: string) {
  const { data: project } = useWorkspaceProject(projectId)
  const buildId = project?.buildId
  
  // Use existing clean build events hook
  const { 
    events, 
    isComplete, 
    currentProgress, 
    error 
  } = useCleanBuildEvents(buildId, userId, {
    autoPolling: true
  })
  
  // Determine if build is genuinely ongoing
  const hasOngoingBuild = buildId && !isComplete && !error && events.length > 0
  const buildAge = events[0] ? Date.now() - new Date(events[0].created_at).getTime() : 0
  const isStale = buildAge > 20 * 60 * 1000 // 20 minutes
  
  return {
    hasOngoingBuild: hasOngoingBuild && !isStale,
    buildId,
    progress: currentProgress,
    events,
    isStale
  }
}
```

#### 2.2 Build Notification System
**File**: `/src/components/builder/ongoing-build-banner.tsx` (New)

```typescript
export function OngoingBuildBanner({ projectId }: { projectId: string }) {
  const { user } = useAuthStore()
  const { hasOngoingBuild, progress, buildId } = useOngoingBuildDetection(
    projectId, 
    user?.id || ''
  )
  
  if (!hasOngoingBuild) return null
  
  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
      <div className="flex items-center">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mr-3" />
        <div className="flex-1">
          <p className="text-sm text-blue-800">
            Build in progress... {Math.round(progress * 100)}% complete
          </p>
          <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
        <button 
          onClick={() => console.log('Show build details')}
          className="text-blue-600 text-sm hover:underline ml-4"
        >
          View Details
        </button>
      </div>
    </div>
  )
}
```

### Phase 3: Enhanced User Experience 🎨 **MEDIUM PRIORITY**

#### 3.1 Multi-Tab Build Synchronization
- **Cross-tab communication** using `BroadcastChannel` API
- **Build status sync** across all open tabs of same project
- **Notification system** for build completion

#### 3.2 Build History & Recovery
- **Recent builds list** in project interface
- **Resume build monitoring** for interrupted builds
- **Build retry mechanism** for failed builds

#### 3.3 Visual Improvements
- **Build progress in browser tab title** (`Building... 45%`)
- **Favicon animation** during builds
- **Toast notifications** for cross-tab updates

### Phase 4: Monitoring & Analytics 📊 **LOW PRIORITY**

#### 4.1 Build Metrics Dashboard
- **Average build times** by project type
- **Success/failure rates** tracking
- **User engagement** during builds

#### 4.2 Performance Optimization
- **Intelligent polling intervals** based on build phase
- **Event batching** for high-frequency updates
- **Memory usage optimization** for long-running builds

## Implementation Priority & Timeline

### 🚨 **IMMEDIATE (Phase 1)** - 2-3 hours
- [ ] Create `/api/projects/[id]/build` endpoint
- [ ] Update 3 build-triggering components with persistence
- [ ] Test buildId persistence across page refreshes

### 🔄 **HIGH PRIORITY (Phase 2)** - 4-6 hours  
- [ ] Create `useOngoingBuildDetection` hook
- [ ] Implement `OngoingBuildBanner` component
- [ ] Integration testing with multiple tabs/refreshes

### 🎨 **MEDIUM PRIORITY (Phase 3)** - 1-2 days
- [ ] Cross-tab synchronization
- [ ] Enhanced visual feedback
- [ ] Build history features

### 📊 **LOW PRIORITY (Phase 4)** - Future iteration
- [ ] Analytics and monitoring
- [ ] Performance optimizations
- [ ] Advanced features

## Testing Strategy

### Manual Testing Scenarios
1. **Basic Flow**: Start build → refresh page → verify ongoing build detected
2. **Multi-tab**: Start build in tab A → open tab B → verify build status sync
3. **Network Issues**: Simulate API failures → verify graceful degradation
4. **Edge Cases**: Multiple builds, stale builds, build failures

### Automated Testing
- **Unit tests** for detection hooks
- **Integration tests** for API endpoints  
- **E2E tests** for complete user flows

## Risk Assessment & Mitigation

### High Risk
- **Database performance**: BuildId updates add write operations
  - *Mitigation*: Non-blocking persistence with error handling
- **Race conditions**: Multiple tabs updating same project
  - *Mitigation*: Optimistic locking with timestamp comparison

### Medium Risk  
- **Stale build detection**: Old builds appearing as active
  - *Mitigation*: Time-based staleness detection (20-minute threshold)
- **Cross-browser compatibility**: BroadcastChannel support
  - *Mitigation*: Progressive enhancement with fallbacks

### Low Risk
- **Memory leaks**: Long-running polling in background tabs
  - *Mitigation*: Tab visibility API to pause inactive polling

## Success Metrics

### User Experience
- **Zero "lost build" scenarios** after refresh/new tab
- **<2 second detection time** for ongoing builds
- **100% build status visibility** across all project entry points

### Technical Performance
- **<100ms API response time** for buildId persistence
- **<5MB memory usage** for build status tracking
- **99.9% reliability** for build state recovery

## Conclusion

This comprehensive plan addresses the critical ongoing build detection issue through a phased approach:

1. **Immediate fix**: Simple buildId persistence (2-3 hours)
2. **Robust detection**: Enhanced build state recovery (4-6 hours)
3. **Improved UX**: Cross-tab sync and visual enhancements (1-2 days)
4. **Future enhancements**: Analytics and optimization (future iterations)

The solution leverages existing infrastructure (clean events API, React Query) while adding minimal complexity. The phased approach ensures quick resolution of the critical user experience issue while building toward a comprehensive build management system.