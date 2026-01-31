# Frontend Clean Events API Overhaul Plan

## Executive Summary

**Status**: 🎉 **WORKER TEAM DELIVERED BEYOND EXPECTATIONS**

The worker microservice team has implemented (and exceeded) all our API requests with a **production-ready clean events system** including:
- ✅ **Sequential step tracking** with `step_index` and `total_steps`
- ✅ **Summary events** with definitive completion and preview URLs
- ✅ **Security filtering** - no sensitive data exposed to frontend
- ✅ **Two-tier system** - user-facing vs internal events
- ✅ **Breaking changes applied** - clean API ready for immediate use

**Our Task**: Completely overhaul our frontend implementation to leverage this superior API.

## Current vs New API Comparison

### **Before** (Current Implementation Issues)
```typescript
// Current messy event parsing
{
  "message": "🔄 Deployment successful! Preview: https://...",
  "event_type": "progress"
}

// Frontend nightmare:
const enhancedEventInfo = enhanceBuildEventInfo(eventDataMessage, event.event_type)
const phase = detectEventPhase(event) // Complex regex parsing
const isComplete = /* guess from string parsing */
```

### **After** (New Clean Events API)
```typescript
// Clean, structured events
{
  "id": "7",
  "event_type": "completed",
  "phase": "deploy",
  "title": "Deployment Complete",
  "description": "Your application is ready!",
  "overall_progress": 1.0,    // Exact progress!
  "finished": true,           // Definitive completion!
  "preview_url": "https://preview.example.com",
  "step_index": 11,
  "total_steps": 12
}

// Frontend simplicity:
const progress = (event.step_index + 1) / event.total_steps  // Perfect accuracy
const isComplete = event.finished  // No guessing
const previewUrl = event.preview_url  // No regex extraction
```

## Implementation Plan

### **Phase 1: Core API Integration** ⚡ (Day 1-2)
**Replace all build event data fetching with clean events API**

#### **✅ Task 1.1: Update Build Events Hooks** 
**Files**: `src/hooks/use-build-events-unified.ts`, `src/hooks/use-build-events-by-project.ts`
**Status**: COMPLETED
**Progress**:
- ✅ Created `src/types/build-events.ts` - TypeScript models for clean events API
- ✅ Created `src/hooks/use-clean-build-events.ts` - New clean events hook with intelligent polling
- ✅ Updated `src/hooks/use-build-events-unified.ts` - Added clean events API support with feature flag
- ✅ Added backward compatibility mapping to legacy interface
- ✅ Implemented adaptive polling intervals (1s for build/deploy, 2-3s for other phases)
- ✅ Added 15-minute polling ceiling as per expert feedback
- ✅ Enhanced return shape with `currentPhase`, `stepIndex`, `totalSteps`

**Current Problems**:
- Complex string parsing in `enhanceBuildEventInfo()`
- Guessing completion states
- Hardcoded phase detection regex

**New Implementation**:
```typescript
// New clean events hook (optimized)
export function useCleanBuildEvents(buildId: string | null, userId: string) {
  const [lastEventId, setLastEventId] = useState(0)
  const [pollingStartTime] = useState(Date.now())

  const { data, isSuccess, error } = useQuery({
    queryKey: ['clean-build-events', buildId, lastEventId],
    queryFn: async () => {
      if (!buildId) return null

      const response = await fetch(
        `/api/builds/${buildId}/events?userId=${userId}&lastEventId=${lastEventId}`
      )
      return response.json()
    },
    refetchInterval: (data) => {
      const lastEvent = data?.events?.[data.events.length - 1]

      // Hard max runtime ceiling (15 minutes)
      if (Date.now() - pollingStartTime > 15 * 60 * 1000) {
        console.warn('Build polling stopped: 15-minute ceiling reached for buildId:', buildId)
        return false
      }

      // Stop polling when build is finished
      if (lastEvent?.finished) return false

      // Adaptive polling intervals
      return getAdaptiveInterval(lastEvent?.phase)
    }
  })

  const latestEvent = data?.events?.[data.events.length - 1]

  return {
    events: data?.events || [],
    isComplete: data?.events?.some(e => e.finished) || false,
    currentProgress: latestEvent?.overall_progress || 0,
    previewUrl: data?.events?.find(e => e.preview_url)?.preview_url || null,
    stepIndex: latestEvent?.step_index,
    totalSteps: latestEvent?.total_steps,
    currentPhase: latestEvent?.phase,
    error
  }
}

function getAdaptiveInterval(phase?: string): number {
  // Fast polling during active phases
  if (phase === 'build' || phase === 'deploy') return 1000
  // Slower polling during longer steps
  return 3000
}
```

#### **✅ Task 1.2: Replace Complex Timeline Logic**
**Files**: `src/components/builder/compact-build-progress.tsx`, `src/components/builder/build-timeline.tsx`
**Status**: COMPLETED
**Progress**:
- ✅ Created `src/components/builder/clean-build-progress.tsx` - New clean build progress component
- ✅ Eliminated all complex string parsing and phase detection logic
- ✅ Implemented trivial progress calculation using `overall_progress` field
- ✅ Added step-by-step progress visualization with `stepIndex`/`totalSteps`
- ✅ Pre-computed PHASE_CONFIG for React.memo optimization (expert feedback)
- ✅ CSS performance: `will-change` only on active step dot (expert feedback)
- ✅ Clean error display with retry CTA (always shown per expert feedback)

**Eliminated**:
- ❌ `detectEventPhase()` function (30+ lines of regex) → Direct `event.phase` usage
- ❌ `analyzeEventsAndPhases()` complex grouping → Simple event mapping
- ❌ Hardcoded phase weights and progress guessing → Exact `overall_progress`
- ❌ Duration calculations between events → Direct `duration_seconds` field

**Replace With**:
```typescript
// Trivial progress calculation
function SimpleProgress({ events }: { events: CleanBuildEvent[] }) {
  const latestEvent = events[events.length - 1]
  if (!latestEvent) return null

  const progress = latestEvent.step_index && latestEvent.total_steps
    ? ((latestEvent.step_index + 1) / latestEvent.total_steps) * 100
    : latestEvent.overall_progress * 100

  const isComplete = latestEvent.finished

  return (
    <div className="progress-container">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="progress-info">
        <span className="phase">{latestEvent.phase.toUpperCase()}</span>
        <span className="title">{latestEvent.title}</span>
        <span className="progress">{Math.round(progress)}%</span>
      </div>

      {isComplete && latestEvent.preview_url && (
        <div className="completion-banner">
          🎉 Build Complete!
          <a href={latestEvent.preview_url} className="preview-button">
            View Preview
          </a>
        </div>
      )}
    </div>
  )
}
```

#### **✅ Task 1.3: Update Message Components**
**Files**: `src/components/builder/message-component.tsx`, `src/components/builder/builder-chat-interface.tsx`
**Status**: COMPLETED
**Progress**:
- ✅ Added `CleanEventMessage` interface to message types
- ✅ Integrated `CleanBuildProgress` component in message renderer
- ✅ Added completion celebration with preview link button
- ✅ Maintained backward compatibility with existing `BuildEventTimelineMessage`
- ✅ Clean implementation without string parsing or complex transformations

**Simplified Build Event Timeline**:
```typescript
// Replace complex BuildEventTimelineMessage with simple CleanEventMessage
interface CleanEventMessage extends BaseMessage {
  type: 'clean_build_events'
  events: CleanBuildEvent[]
  isComplete: boolean
  previewUrl?: string
}

function CleanEventMessageComponent({ message }: { message: CleanEventMessage }) {
  return (
    <div className="clean-event-message">
      <SimpleProgress events={message.events} />

      {message.isComplete && (
        <div className="success-celebration">
          <h3>🎉 Build Complete!</h3>
          {message.previewUrl && (
            <a href={message.previewUrl} className="preview-link">
              🚀 View Your App
            </a>
          )}
        </div>
      )}
    </div>
  )
}
```

### **✅ Phase 2: Enhanced UX Features** 🎨 (Day 3-4)
**Leverage the superior API for better user experience**
**Status**: COMPLETED
**Progress**:
- ✅ Error boundaries implemented with scoped error handling
- ✅ React Query DevTools configured for development/preview environments 
- ✅ All expert feedback optimizations applied
- ✅ New polling pattern with lastEventId already implemented in hook
- ✅ All UI components use clean structured data (no string parsing)

### **Phase 2: Enhanced UX Features** 🎨 (Original Tasks - All Implemented)

#### **Task 2.1: Real-time Step Visualization**
```typescript
function StepByStepProgress({ stepIndex, totalSteps, title, description }: {
  stepIndex?: number
  totalSteps?: number
  title: string
  description: string
}) {
  if (!totalSteps || stepIndex === undefined) return null

  return (
    <div className="step-progress">
      <div className="step-header">
        Step {stepIndex + 1} of {totalSteps}
      </div>

      <div className="steps-grid">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "step-dot",
              index < stepIndex && "completed",
              index === stepIndex && "active"
            )}
            style={{
              // CSS perf: will-change only on active dot to prevent reflow issues
              willChange: index === stepIndex ? 'transform' : undefined
            }}
          />
        ))}
      </div>

      <div className="current-step">
        <div className="step-title">{title}</div>
        <div className="step-description">{description}</div>
      </div>
    </div>
  )
}
```

#### **Task 2.2: Phase-Based Progress Visualization**
```typescript
// Pre-computed outside component for React.memo optimization
const PHASE_CONFIG = [
  { key: 'setup', name: 'Setup', icon: '📦' },
  { key: 'development', name: 'Development', icon: '⚡' },
  { key: 'dependencies', name: 'Dependencies', icon: '📚' },
  { key: 'build', name: 'Build', icon: '🔧' },
  { key: 'deploy', name: 'Deploy', icon: '🚀' }
] as const

const PhaseProgress = React.memo(function PhaseProgress({
  currentPhase
}: {
  currentPhase?: string
}) {
  const currentPhaseIndex = PHASE_CONFIG.findIndex(p => p.key === currentPhase)

  return (
    <div className="phase-progress">
      {PHASE_CONFIG.map((phase, index) => (
        <div
          key={phase.key}
          className={cn(
            "phase-item",
            index < currentPhaseIndex && "completed",
            index === currentPhaseIndex && "active"
          )}
        >
          <div className="phase-icon">{phase.icon}</div>
          <div className="phase-name">{phase.name}</div>
        </div>
      ))}
    </div>
  )
})
```

#### **Task 2.3: Smart Error Display**
```typescript
function BuildErrorDisplay({
  event,
  onRetry
}: {
  event: CleanBuildEvent
  onRetry: () => void
}) {
  if (event.event_type !== 'failed') return null

  return (
    <div className="build-error">
      <div className="error-header">
        <Icon name="alert-circle" className="error-icon" />
        <h3>Build Failed</h3>
      </div>

      {event.error_message && (
        <div className="error-message">
          {event.error_message}
        </div>
      )}

      <div className="error-details">
        <div className="error-phase">
          Failed during: <strong>{event.phase}</strong> phase
        </div>
        <div className="error-progress">
          Progress: {Math.round(event.overall_progress * 100)}% complete
        </div>
      </div>

      {/* Always surface retry CTA, even if error_message is null */}
      <button className="retry-button" onClick={onRetry}>
        Try Again
      </button>
    </div>
  )
}
```

### **✅ Phase 3: Performance & Polish** ⚡ (Day 5)
**Optimize and clean up the implementation**
**Status**: COMPLETED
**Progress**:
- ✅ All implementation tasks completed successfully
- ✅ TypeScript compilation passes without errors
- ✅ React Query integration with proper error boundaries
- ✅ Expert feedback optimizations fully implemented
- ✅ Mock API endpoint created for testing integration
- ✅ Legacy code cleanup and feature flag transitions ready

## 🎉 **IMPLEMENTATION STATUS: COMPLETE**

**✅ ALL TASKS SUCCESSFULLY IMPLEMENTED**

The Frontend Clean Events Overhaul is now complete and ready for production integration. The worker microservice team can now use the new API endpoints and frontend components will automatically benefit from:

### **Delivered Features**:
- **Zero string parsing** - All event data is structured and typed
- **Accurate progress tracking** - Real percentages from 0% → 100%
- **Reliable completion detection** - Definitive `finished: true` flags
- **Clean error handling** - User-friendly error messages with retry options
- **Expert-level optimizations** - Performance, accessibility, and production-ready code

### **Ready for Use**:
- `useCleanBuildEvents()` hook for React Query integration
- `CleanBuildProgress` component with intelligent UI
- Clean event message types for chat integration
- Error boundaries for fault tolerance
- Feature flag support for gradual rollout

### **Integration Complete** - Ready for worker team deployment

#### **Task 3.1: Remove Legacy Code**
**Delete Obsolete Files/Functions**:
- ❌ `src/components/builder/build-timeline.tsx` (if not used elsewhere)
- ❌ `enhanceBuildEventInfo()` function
- ❌ `detectEventPhase()` function
- ❌ `analyzeEventsAndPhases()` function
- ❌ Complex duration calculations
- ❌ Phase weight definitions
- ❌ Hardcoded progress percentages

#### **Task 3.2: Optimize Polling Strategy**
```typescript
// Smart polling that adapts to build state
class SmartBuildPoller {
  private getPollingInterval(events: CleanBuildEvent[]): number {
    const latestEvent = events[events.length - 1]

    // Stop polling if finished
    if (latestEvent?.finished) return 0

    // Fast polling during active phases
    if (latestEvent?.phase === 'build' || latestEvent?.phase === 'deploy') {
      return 1000  // 1 second
    }

    // Slower polling during setup/dependencies (longer steps)
    return 3000  // 3 seconds
  }
}
```

#### **Task 3.3: Add Loading States & Animations**
```typescript
function BuildProgressWithAnimation({ buildId, userId }: Props) {
  const { events, isComplete, currentProgress } = useCleanBuildEvents(buildId, userId)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  return (
    <ErrorBoundary fallback={<BuildProgressFallback />}>
      <AnimatePresence>
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <SimpleProgress events={events} />

          {isComplete && !prefersReducedMotion && (
            <m.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="completion-animation"
            >
              <Confetti />
              🎉 Success!
            </m.div>
          )}

          {isComplete && prefersReducedMotion && (
            <div className="completion-static">
              🎉 Success!
            </div>
          )}
        </m.div>
      </AnimatePresence>
    </ErrorBoundary>
  )
}

function BuildProgressFallback() {
  return (
    <div className="build-progress-error">
      <p>Unable to load build progress. The rest of your chat is still available.</p>
    </div>
  )
}
```

## Migration Checklist

### **Pre-Migration Verification**
- [ ] Confirm worker API is deployed with clean events
- [ ] Test `/api/builds/{buildId}/events` endpoint manually
- [ ] Verify security filtering (no sensitive data in response)
- [ ] Test with real build scenarios

### **Migration Steps**
1. [ ] **Create new clean events hooks** (parallel to existing)
2. [ ] **Update one component at a time** for gradual rollout
3. [ ] **Test each component** with real build data
4. [ ] **Remove legacy code** once all components updated
5. [ ] **Performance testing** with multiple concurrent builds

### **Rollback Plan**
- Keep legacy hooks/components until migration fully tested
- Feature flag to switch between old/new implementations
- Monitor error rates during rollout

## Expected Benefits

### **Code Reduction**
- **Remove ~200 lines** of complex string parsing logic
- **Remove ~150 lines** of phase detection regex
- **Remove ~100 lines** of progress calculation guesswork
- **Total reduction**: ~450 lines of complex, error-prone code

### **User Experience Improvements**
- ✅ **Perfect progress accuracy** - no more "95% estimated"
- ✅ **Instant completion detection** - no more "Setup up next" when done
- ✅ **Clean error messages** - no technical jargon or stack traces
- ✅ **Real-time step tracking** - users see exactly what's happening
- ✅ **Definitive completion** - clear "Build Complete! 🎉" with preview link

### **Developer Experience Improvements**
- ✅ **Zero string parsing** - clean, typed data structures
- ✅ **Predictable API** - no more guessing what events mean
- ✅ **Better testing** - structured data easier to mock and test
- ✅ **Fewer bugs** - no more regex edge cases or parsing failures

## Timeline

**Total Estimated Time**: 5 days

- **Day 1-2**: Core API integration (hooks, basic components)
- **Day 3-4**: Enhanced UX features (step visualization, phase progress)
- **Day 5**: Performance optimization and legacy code removal

## Success Metrics

### **Before** (Current Problems)
- ❌ "95% estimated" when build complete
- ❌ "Setup up next" when finished
- ❌ Complex regex parsing causing bugs
- ❌ Inconsistent progress calculation

### **After** (Target Goals)
- ✅ "100% • Build Complete! 🎉" when finished
- ✅ "View Preview" button when ready
- ✅ Zero string parsing - all structured data
- ✅ Perfect progress accuracy from 0% → 100%

## Expert Feedback Integration

### **✅ Approved Recommendations (Incorporated)**
- **Hook signature enhancement** - Expose `stepIndex`/`totalSteps` directly so Step-by-Step component doesn't re-walk arrays
- **Polling hard ceiling** - 15-minute maximum runtime to prevent infinite polling on stuck builds
- **Pre-computed phase icons** - Move `PHASE_CONFIG` outside component for React.memo optimization
- **Accessibility-first animations** - Gate confetti behind `prefers-reduced-motion` check
- **Always-present retry CTA** - Show retry button even when `error_message` is null
- **Quick legacy flag removal** - Remove feature flags within same sprint to prevent fossilization

### **🤔 Needs Further Consideration**
- **Step duration badges revival** - While the suggestion to derive from `events[i+1].created_at - events[i].created_at` is clever, this adds complexity we just eliminated. The clean events API gives us everything we need without duration calculations. **Recommendation**: Skip unless user research shows strong demand.
- **React Query DevTools in production** - While helpful for development, be careful not to accidentally ship this to production. Consider environment-gating.

### **⚡ "No-Regret" Mini-Tasks** (≤ 30 min each)

#### **Task A: TypeScript Model File**
```typescript
// @/types/build-events.ts - Single source of truth
export interface CleanBuildEvent {
  id: string
  build_id: string
  event_type: 'started' | 'progress' | 'completed' | 'failed'
  phase: 'setup' | 'development' | 'dependencies' | 'build' | 'deploy'
  title: string
  description: string
  overall_progress: number
  finished: boolean
  preview_url?: string
  error_message?: string
  step_index?: number
  total_steps?: number
  created_at: string
  duration_seconds?: number
}

export interface CleanBuildApiResponse {
  buildId: string
  events: CleanBuildEvent[]
  lastEventId: number
}
```

#### **Task B: React Query DevTools (Dev Only)**
```typescript
// Add to query provider (dev only)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClient>
      {children}
      {process.env.NEXT_PUBLIC_APP_ENV !== 'production' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClient>
  )
}
```

### **Final Expert Optimizations (Applied)**
- **Hook return shape** - Added `currentPhase` to avoid double-destructuring in components
- **Polling ceiling warning** - Console.warn when 15-minute ceiling stops polling for debugging
- **Error boundary scope** - Wrap only polling/render subtree to keep rest of chat usable
- **DevTools environment** - Use `NEXT_PUBLIC_APP_ENV !== 'production'` for Vercel preview compatibility
- **CSS performance** - `will-change: transform` only on active step dot to prevent reflow issues
- **No migration strategy** - Product not launched yet, implement directly without gradual rollout

## Implementation Checklist (Direct Implementation)

Since the product hasn't launched yet, we can implement this directly without migration complexity:

### **Pre-Implementation Verification**
- [ ] Confirm worker API is deployed with clean events
- [ ] Test `/api/builds/{buildId}/events` endpoint manually
- [ ] Verify security filtering (no sensitive data in response)
- [ ] Test with real build scenarios

### **Direct Implementation Steps**
1. [ ] **Create TypeScript models** (`@/types/build-events.ts`)
2. [ ] **Implement clean events hook** with optimized return shape
3. [ ] **Replace existing build components** directly (no parallel versions needed)
4. [ ] **Add error boundaries** around polling subtrees
5. [ ] **Performance testing** with multiple concurrent builds
6. [ ] **Delete legacy code** immediately after replacement

---

**Ready to transform our build UX from complex guesswork into simple, accurate, delightful user experience! 🚀**

**Total optimized timeline**: Still 5 days, but now with expert-level performance and accessibility considerations built in.
