# Project State Architecture Strategic Plan

## Executive Summary

This document outlines strategic approaches to improve our project state management architecture. Currently, we have a dual-state system (project status + build events) that creates synchronization complexity and information loss. We present three strategic options ranging from incremental fixes to comprehensive architectural improvements.

**⚠️ ARCHITECTURE UPDATE (August 2025)**: Worker webhooks have been deprecated. Worker now writes directly to database, UI polls database. Current architecture is working reliably with `useCleanBuildEvents` hook.

## Current State Analysis

### 🔍 **Existing Architecture Issues**

#### **1. Dual State System Complexity**
```typescript
// Current: Two separate data sources
const { data: status } = useProjectStatus(projectId)        // Coarse-grained
const { events } = useCleanBuildEvents(buildId, userId)    // Fine-grained

// UI must correlate both sources
const isDeploying = status?.buildStatus === 'building' && 
                   events?.some(e => e.phase === 'deploy')
```

#### **2. Information Loss in State Mapping**
```typescript
// Worker provides rich context
workerStatus: 'completed' // = "AI generation done, starting deployment"

// Our mapper loses information  
case 'completed': return 'building' // ❌ What phase of building?
```

#### **3. Synchronization Problems**
- **Race conditions**: Project status vs build events updates
- **Inconsistency**: Status can be 'deployed' while events show 'failed'
- **Polling inefficiency**: Multiple endpoints for complete picture
- **Analytics complexity**: Need to correlate two data sources

### **Current Flow (Post-Webhook Architecture):**
```
✅ CURRENT: Worker API → Direct Database Write → Supabase project_build_events → UI Polling → React Components
```

**Flow Details:**
1. Worker writes build events directly to `project_build_events` table  
2. `useCleanBuildEvents` hook polls `/api/builds/[buildId]/events` every 1-3 seconds
3. Worker calls `create_version_on_success()` to update project to `'deployed'`
4. UI gets comprehensive state from single database source

**Current Issues (If Any):**
1. ~~Worker `'completed'` → Project status `'building'` (information loss)~~ **RESOLVED**: Worker writes rich events directly
2. ~~Build events provide real deployment progress (but disconnected from status)~~ **RESOLVED**: Same database source
3. ✅ `create_version_on_success()` updates project status correctly
4. ~~UI must check both project status AND build events for complete picture~~ **RESOLVED**: Database polling provides complete picture

### **✅ Current Architecture Strengths (August 2025)**

Our database-polling architecture has several advantages that should be considered before major changes:

#### **Reliability & Simplicity**
- **✅ Single Source of Truth**: Both Worker and UI use same Supabase database
- **✅ No Network Dependencies**: No webhook delivery failures or timeouts
- **✅ Fault Tolerant**: Database-first approach handles Worker/UI restarts gracefully
- **✅ Battle-Tested**: Standard polling pattern with React Query caching

#### **Performance & User Experience** 
- **✅ Real-time Updates**: 1-3 second adaptive polling provides excellent UX
- **✅ Smart Caching**: React Query eliminates unnecessary API calls
- **✅ Offline Resilience**: UI shows last known state when network unavailable
- **✅ Memory Efficient**: No persistent WebSocket connections

#### **Developer Experience**
- **✅ Simple Debugging**: Database queries are easy to inspect and trace
- **✅ Predictable Behavior**: Polling behavior is deterministic and testable
- **✅ Low Maintenance**: No webhook endpoint security or retry logic needed
- **✅ Framework Agnostic**: Works with any UI framework or backend

**Question for Strategic Planning**: Given these strengths, do we have evidence of actual problems that require architectural changes, or are we solving theoretical issues?

## Strategic Options

## Option A: Enhanced Mapper (Incremental) ⚡

### **Approach**
Enhance existing mapper to use build events context for richer state determination.

```typescript
export function mapWorkerStatusToProjectStatus(
  workerStatus: string,
  buildEvents?: CleanBuildEvent[],
  context?: {
    queuePosition?: number
    estimatedTime?: string
    deploymentPhase?: string
  }
): EnhancedProjectStatus {
  switch (workerStatus.toLowerCase()) {
    case 'queued':
      return {
        status: 'queued',
        phase: 'waiting',
        progress: 0,
        message: context?.queuePosition 
          ? `Queued (position ${context.queuePosition})`
          : 'Queued for processing',
        estimatedCompletion: context?.estimatedTime
      }
      
    case 'building':
      return {
        status: 'building', 
        phase: 'generation',
        progress: 50,
        message: 'AI generating your project...',
        estimatedCompletion: context?.estimatedTime
      }
      
    case 'completed':
      // Use build events to determine actual deployment state
      if (buildEvents?.length) {
        const latestEvent = buildEvents[buildEvents.length - 1]
        
        if (latestEvent.phase === 'deploy' && latestEvent.finished) {
          return {
            status: 'deployed',
            phase: 'complete', 
            progress: 100,
            message: 'Project deployed successfully',
            previewUrl: latestEvent.preview_url
          }
        }
        
        return {
          status: 'building',
          phase: latestEvent.phase || 'deploy',
          progress: latestEvent.overall_progress || 85,
          message: latestEvent.description || 'Deploying to live site...',
          estimatedCompletion: '30s'
        }
      }
      
      // Fallback without build events
      return {
        status: 'building',
        phase: 'deploy',
        progress: 85,
        message: 'Code ready, deploying to live site...'
      }
      
    default:
      return { status: 'queued', phase: 'waiting', progress: 0, message: 'Processing...' }
  }
}
```

### **Enhanced Project Status Interface**
```typescript
export interface EnhancedProjectStatus {
  status: 'queued' | 'building' | 'deployed' | 'failed'
  phase: 'waiting' | 'generation' | 'setup' | 'development' | 'dependencies' | 'build' | 'deploy' | 'complete'
  progress: number // 0-100
  message: string
  estimatedCompletion?: string
  previewUrl?: string
  queuePosition?: number
}
```

### **Pros & Cons**
**✅ Pros:**
- Quick implementation (2-3 days)
- Maintains backward compatibility
- Preserves existing APIs
- Immediate improvement to user experience
- Low risk refactor

**❌ Cons:**
- Still dual state system underneath
- Complexity in mapper function
- Build events dependency creates coupling
- Doesn't solve synchronization issues
- Technical debt remains

### **Implementation Timeline: 3 days**
- Day 1: Enhanced status interface + mapper function
- Day 2: Update project status hook to use enhanced mapper
- Day 3: UI component updates + testing

---

## Option B: Unified State Architecture (Strategic) 🏆

### **Vision**
Replace dual state system with single, comprehensive project state that incorporates all information sources.

### **Unified State Interface**
```typescript
export interface UnifiedProjectState {
  // Overall project state
  overall: 'queued' | 'generating' | 'deploying' | 'deployed' | 'failed' | 'rollingBack'
  
  // Current execution phase
  phase: 'waiting' | 'setup' | 'development' | 'dependencies' | 'build' | 'deploy' | 'complete'
  
  // Progress and timing
  progress: number // 0-100 overall progress
  phaseProgress: number // 0-100 current phase progress
  estimatedCompletion?: string
  startedAt: string
  completedAt?: string
  
  // User-facing information
  message: string
  detailedMessage?: string
  
  // Build context
  buildId?: string
  currentBuildId?: string
  queuePosition?: number
  
  // Deployment info
  previewUrl?: string
  deployedAt?: string
  
  // Version management
  currentVersionId?: string
  currentVersionName?: string
  
  // Error handling
  error?: {
    message: string
    code: string
    recoverable: boolean
    retryAfter?: string
  }
  
  // System metadata
  workerInfo?: {
    workerId: string
    region: string
  }
  
  // Real-time capabilities
  subscriptionStatus: 'connected' | 'connecting' | 'disconnected'
  lastUpdated: string
}
```

### **State Computation Engine**
```typescript
export class UnifiedStateComputer {
  /**
   * Compute unified state from all data sources
   */
  computeState(
    project: Project,
    buildEvents: CleanBuildEvent[],
    workerStatus?: string
  ): UnifiedProjectState {
    
    // Phase 1: Determine overall state
    const overall = this.computeOverallState(project, buildEvents, workerStatus)
    
    // Phase 2: Determine current phase and progress
    const { phase, progress, phaseProgress } = this.computePhaseInfo(buildEvents, overall)
    
    // Phase 3: Generate user messages
    const { message, detailedMessage } = this.computeMessages(overall, phase, buildEvents)
    
    // Phase 4: Extract deployment info
    const deploymentInfo = this.extractDeploymentInfo(project, buildEvents)
    
    // Phase 5: Error handling
    const error = this.extractErrorInfo(buildEvents, project)
    
    return {
      overall,
      phase,
      progress,
      phaseProgress,
      message,
      detailedMessage,
      buildId: project.current_build_id,
      currentVersionId: project.current_version_id,
      ...deploymentInfo,
      error,
      subscriptionStatus: 'connected',
      lastUpdated: new Date().toISOString()
    }
  }
  
  private computeOverallState(
    project: Project, 
    buildEvents: CleanBuildEvent[],
    workerStatus?: string
  ): UnifiedProjectState['overall'] {
    
    // Priority 1: Database project status (final authority)
    if (project.build_status === 'deployed') return 'deployed'
    if (project.build_status === 'failed') return 'failed'
    if (project.build_status === 'rollingBack') return 'rollingBack'
    
    // Priority 2: Build events (real-time status)
    const latestEvent = buildEvents[buildEvents.length - 1]
    if (latestEvent?.error_message) return 'failed'
    if (latestEvent?.phase === 'deploy' && latestEvent?.finished) return 'deployed'
    if (latestEvent?.phase === 'deploy') return 'deploying'
    if (buildEvents.length > 0) return 'generating'
    
    // Priority 3: Worker status (initial state)
    if (workerStatus === 'completed') return 'deploying'
    if (workerStatus === 'building') return 'generating' 
    if (workerStatus === 'queued') return 'queued'
    
    // Default fallback
    return project.build_status === 'building' ? 'generating' : 'queued'
  }
  
  private computePhaseInfo(
    buildEvents: CleanBuildEvent[], 
    overall: string
  ): { phase: string, progress: number, phaseProgress: number } {
    
    if (overall === 'deployed') {
      return { phase: 'complete', progress: 100, phaseProgress: 100 }
    }
    
    if (overall === 'failed') {
      const latestEvent = buildEvents[buildEvents.length - 1]
      return { 
        phase: latestEvent?.phase || 'unknown', 
        progress: latestEvent?.overall_progress || 0,
        phaseProgress: 0
      }
    }
    
    const latestEvent = buildEvents[buildEvents.length - 1]
    if (latestEvent) {
      return {
        phase: latestEvent.phase,
        progress: latestEvent.overall_progress,
        phaseProgress: this.computePhaseProgress(latestEvent)
      }
    }
    
    // Phase mapping for overall states without events
    const phaseMap = {
      'queued': { phase: 'waiting', progress: 0 },
      'generating': { phase: 'development', progress: 25 },
      'deploying': { phase: 'deploy', progress: 85 }
    }
    
    const mapped = phaseMap[overall] || { phase: 'waiting', progress: 0 }
    return { ...mapped, phaseProgress: 50 }
  }
  
  private computeMessages(
    overall: string, 
    phase: string, 
    buildEvents: CleanBuildEvent[]
  ): { message: string, detailedMessage?: string } {
    
    const latestEvent = buildEvents[buildEvents.length - 1]
    
    // Use event description if available
    if (latestEvent?.description) {
      return {
        message: latestEvent.description,
        detailedMessage: latestEvent.title
      }
    }
    
    // Fallback to computed messages
    const messages = {
      'queued': 'Queued for processing',
      'generating': 'AI generating your project...',
      'deploying': 'Deploying to live site...',
      'deployed': 'Project deployed successfully',
      'failed': 'Build failed - check logs for details',
      'rollingBack': 'Rolling back to previous version...'
    }
    
    return { message: messages[overall] || 'Processing...' }
  }
}
```

### **New API Architecture**
```typescript
// Single endpoint for complete state
// GET /api/projects/[id]/state
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id
  
  // Fetch all data sources in parallel
  const [project, buildEvents, workerStatus] = await Promise.all([
    fetchProject(projectId),
    fetchBuildEvents(project.current_build_id),
    fetchWorkerStatus(project.current_build_id) // Optional
  ])
  
  // Compute unified state
  const computer = new UnifiedStateComputer()
  const state = computer.computeState(project, buildEvents, workerStatus)
  
  return NextResponse.json({ success: true, state })
}
```

### **Enhanced Hook Architecture**
```typescript
export function useProjectState(projectId: string) {
  return useQuery({
    queryKey: ['project-state', projectId],
    queryFn: () => fetchProjectState(projectId),
    refetchInterval: (query) => {
      const state = query.state.data as UnifiedProjectState | null
      if (!state) return 5000
      
      // Smart polling based on unified state
      switch (state.overall) {
        case 'generating':
        case 'deploying':
          return 2000 // Active operations need frequent updates
        case 'deployed':
        case 'failed':
          return Infinity // Final states don't need polling
        case 'queued':
          return 10000 // Queued state needs occasional checks
        default:
          return 5000
      }
    }
  })
}

// Simplified component usage
export function ProjectStatusDisplay({ projectId }: { projectId: string }) {
  const { data: state, isLoading } = useProjectState(projectId)
  
  if (isLoading) return <LoadingSpinner />
  if (!state) return <ErrorState />
  
  return (
    <div className="project-status">
      <ProgressBar value={state.progress} />
      <StatusMessage message={state.message} />
      {state.previewUrl && <PreviewLink url={state.previewUrl} />}
      {state.error && <ErrorDisplay error={state.error} />}
    </div>
  )
}
```

### **Real-time Integration**
```typescript
export class UnifiedStateRealtimeManager {
  private supabase = createClient()
  private stateComputer = new UnifiedStateComputer()
  
  subscribeToProject(projectId: string, callback: (state: UnifiedProjectState) => void) {
    // Subscribe to project changes
    const projectSub = this.supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
          (payload) => this.handleProjectChange(projectId, payload, callback))
      .subscribe()
    
    // Subscribe to build events
    const eventsSub = this.supabase
      .channel(`build-events-${projectId}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'project_build_events' },
          (payload) => this.handleBuildEvent(projectId, payload, callback))
      .subscribe()
    
    return () => {
      projectSub.unsubscribe()
      eventsSub.unsubscribe()
    }
  }
  
  private async handleProjectChange(
    projectId: string, 
    payload: any, 
    callback: (state: UnifiedProjectState) => void
  ) {
    // Recompute unified state when project changes
    const state = await this.computeCurrentState(projectId)
    callback(state)
  }
  
  private async handleBuildEvent(
    projectId: string,
    payload: any,
    callback: (state: UnifiedProjectState) => void
  ) {
    // Recompute unified state when new build event arrives
    const state = await this.computeCurrentState(projectId)
    callback(state)
  }
}
```

### **Migration Strategy**
```typescript
// Phase 1: Parallel API (maintain backward compatibility)
// GET /api/projects/[id]/status (existing)
// GET /api/projects/[id]/state (new unified)

// Phase 2: Component migration
export function useProjectStatusCompat(projectId: string) {
  const { data: unifiedState } = useProjectState(projectId)
  
  // Backward compatibility adapter
  return {
    data: unifiedState ? {
      buildStatus: mapUnifiedToLegacyStatus(unifiedState.overall),
      previewUrl: unifiedState.previewUrl,
      currentVersionId: unifiedState.currentVersionId
      // ... other legacy fields
    } : null
  }
}

// Phase 3: Gradual component updates
// Phase 4: Remove legacy APIs
```

### **Pros & Cons**
**✅ Pros:**
- **Single source of truth** - no more synchronization issues
- **Rich state preservation** - no information loss from worker
- **Real-time architecture** - immediate UI updates
- **Developer experience** - one API call for everything
- **Analytics friendly** - unified data source
- **Future-proof** - supports complex workflows (rollbacks, A/B testing)
- **Performance** - single API call vs multiple endpoints

**❌ Cons:**
- **Implementation complexity** - requires careful state computation logic
- **Migration effort** - need to update all components gradually
- **Testing complexity** - more sophisticated state logic to test
- **Backward compatibility** - need adapter layer during migration

### **Implementation Timeline: 10 days**
- **Days 1-2:** Unified state interface + computation engine
- **Days 3-4:** New API endpoint + real-time subscriptions  
- **Days 5-6:** Enhanced hooks + backward compatibility adapters
- **Days 7-8:** Component migration (high-priority components)
- **Days 9-10:** Testing + documentation + remaining components

---

## Option C: Event-Driven Architecture (Advanced) 🚀

### **Vision**
Implement a comprehensive event-driven state machine that eliminates mapping entirely and handles complex state transitions through events.

### **State Machine Architecture**
```typescript
export type ProjectEvent = 
  | { type: 'BUILD_QUEUED', payload: { buildId: string, queuePosition: number } }
  | { type: 'BUILD_STARTED', payload: { buildId: string, workerId: string } }
  | { type: 'PHASE_ENTERED', payload: { phase: string, estimatedDuration: number } }
  | { type: 'PHASE_PROGRESS', payload: { phase: string, progress: number, message: string } }
  | { type: 'PHASE_COMPLETED', payload: { phase: string, duration: number, artifacts?: any[] } }
  | { type: 'DEPLOYMENT_STARTED', payload: { deploymentId: string, environment: string } }
  | { type: 'DEPLOYMENT_PROGRESS', payload: { progress: number, step: string } }
  | { type: 'DEPLOYMENT_COMPLETED', payload: { previewUrl: string, deployedAt: string } }
  | { type: 'BUILD_FAILED', payload: { error: string, phase: string, recoverable: boolean } }
  | { type: 'ROLLBACK_INITIATED', payload: { targetVersionId: string, reason: string } }
  | { type: 'ROLLBACK_COMPLETED', payload: { newVersionId: string } }

export interface ProjectStateMachine {
  // Current state
  current: {
    state: 'idle' | 'queued' | 'generating' | 'building' | 'deploying' | 'deployed' | 'failed' | 'rollingBack'
    phase?: string
    progress: number
    context: ProjectContext
  }
  
  // State transition definitions
  states: {
    [key: string]: {
      on: { [eventType: string]: string | { target: string, actions?: string[] } }
      entry?: string[] // Actions to execute on entering state
      exit?: string[] // Actions to execute on exiting state
    }
  }
  
  // Event handlers
  actions: {
    [actionName: string]: (context: ProjectContext, event: ProjectEvent) => ProjectContext
  }
}
```

### **State Machine Definition**
```typescript
export const projectStateMachine: ProjectStateMachine = {
  current: {
    state: 'idle',
    progress: 0,
    context: {
      projectId: '',
      buildId: null,
      queuePosition: null,
      currentPhase: null,
      error: null,
      deploymentInfo: null
    }
  },
  
  states: {
    idle: {
      on: {
        'BUILD_QUEUED': { target: 'queued', actions: ['setBuildInfo', 'setQueuePosition'] }
      }
    },
    
    queued: {
      on: {
        'BUILD_STARTED': { target: 'generating', actions: ['clearQueuePosition', 'setStartTime'] },
        'BUILD_FAILED': { target: 'failed', actions: ['setError'] }
      },
      entry: ['notifyQueued']
    },
    
    generating: {
      on: {
        'PHASE_ENTERED': { target: 'generating', actions: ['setCurrentPhase'] },
        'PHASE_PROGRESS': { target: 'generating', actions: ['updateProgress'] },
        'PHASE_COMPLETED': { 
          target: 'building', 
          actions: ['completePhase'],
          cond: 'isGenerationPhase'
        },
        'BUILD_FAILED': { target: 'failed', actions: ['setError'] }
      }
    },
    
    building: {
      on: {
        'PHASE_ENTERED': { target: 'building', actions: ['setCurrentPhase'] },
        'PHASE_PROGRESS': { target: 'building', actions: ['updateProgress'] },
        'DEPLOYMENT_STARTED': { target: 'deploying', actions: ['setDeploymentInfo'] },
        'BUILD_FAILED': { target: 'failed', actions: ['setError'] }
      }
    },
    
    deploying: {
      on: {
        'DEPLOYMENT_PROGRESS': { target: 'deploying', actions: ['updateDeploymentProgress'] },
        'DEPLOYMENT_COMPLETED': { target: 'deployed', actions: ['setDeploymentComplete'] },
        'BUILD_FAILED': { target: 'failed', actions: ['setError'] }
      },
      entry: ['notifyDeploymentStarted']
    },
    
    deployed: {
      on: {
        'BUILD_QUEUED': { target: 'queued', actions: ['setBuildInfo'] }, // For updates
        'ROLLBACK_INITIATED': { target: 'rollingBack', actions: ['setRollbackInfo'] }
      },
      entry: ['notifyDeploymentComplete', 'updateProjectStatus']
    },
    
    failed: {
      on: {
        'BUILD_QUEUED': { target: 'queued', actions: ['clearError', 'setBuildInfo'] } // Retry
      },
      entry: ['notifyFailure', 'updateProjectStatus']
    },
    
    rollingBack: {
      on: {
        'ROLLBACK_COMPLETED': { target: 'deployed', actions: ['setRollbackComplete'] },
        'BUILD_FAILED': { target: 'failed', actions: ['setRollbackError'] }
      },
      entry: ['notifyRollbackStarted']
    }
  },
  
  actions: {
    setBuildInfo: (context, event) => ({
      ...context,
      buildId: event.payload.buildId,
      startTime: new Date().toISOString()
    }),
    
    setQueuePosition: (context, event) => ({
      ...context,
      queuePosition: event.payload.queuePosition
    }),
    
    setCurrentPhase: (context, event) => ({
      ...context,
      currentPhase: event.payload.phase,
      phaseStartTime: new Date().toISOString()
    }),
    
    updateProgress: (context, event) => ({
      ...context,
      progress: event.payload.progress,
      message: event.payload.message,
      lastUpdate: new Date().toISOString()
    }),
    
    setDeploymentInfo: (context, event) => ({
      ...context,
      deploymentInfo: {
        deploymentId: event.payload.deploymentId,
        environment: event.payload.environment,
        startedAt: new Date().toISOString()
      }
    }),
    
    setDeploymentComplete: (context, event) => ({
      ...context,
      previewUrl: event.payload.previewUrl,
      deployedAt: event.payload.deployedAt,
      progress: 100
    }),
    
    setError: (context, event) => ({
      ...context,
      error: {
        message: event.payload.error,
        phase: event.payload.phase,
        recoverable: event.payload.recoverable,
        timestamp: new Date().toISOString()
      }
    })
  }
}
```

### **Event Processing Engine**
```typescript
export class ProjectStateMachineEngine {
  private machine: ProjectStateMachine
  private listeners: Map<string, (state: any) => void> = new Map()
  
  constructor(initialContext: ProjectContext) {
    this.machine = {
      ...projectStateMachine,
      current: {
        ...projectStateMachine.current,
        context: initialContext
      }
    }
  }
  
  /**
   * Process an event through the state machine
   */
  send(event: ProjectEvent): void {
    const currentState = this.machine.current.state
    const stateDefinition = this.machine.states[currentState]
    
    if (!stateDefinition?.on[event.type]) {
      console.warn(`Event ${event.type} not handled in state ${currentState}`)
      return
    }
    
    const transition = stateDefinition.on[event.type]
    let nextState: string
    let actions: string[] = []
    
    if (typeof transition === 'string') {
      nextState = transition
    } else {
      nextState = transition.target
      actions = transition.actions || []
      
      // Check conditions if any
      if (transition.cond && !this.checkCondition(transition.cond, event)) {
        return // Transition blocked by condition
      }
    }
    
    // Execute exit actions
    const exitActions = stateDefinition.exit || []
    for (const action of exitActions) {
      this.executeAction(action, event)
    }
    
    // Execute transition actions
    for (const action of actions) {
      this.executeAction(action, event)
    }
    
    // Update state
    this.machine.current.state = nextState as any
    
    // Execute entry actions
    const nextStateDefinition = this.machine.states[nextState]
    const entryActions = nextStateDefinition?.entry || []
    for (const action of entryActions) {
      this.executeAction(action, event)
    }
    
    // Notify listeners
    this.notifyListeners()
  }
  
  private executeAction(actionName: string, event: ProjectEvent): void {
    const action = this.machine.actions[actionName]
    if (action) {
      this.machine.current.context = action(this.machine.current.context, event)
    }
  }
  
  private checkCondition(conditionName: string, event: ProjectEvent): boolean {
    // Implement condition checking logic
    switch (conditionName) {
      case 'isGenerationPhase':
        return ['setup', 'development', 'dependencies'].includes(event.payload.phase)
      default:
        return true
    }
  }
  
  /**
   * Get current state and context
   */
  getState(): { state: string, context: ProjectContext, progress: number } {
    return {
      state: this.machine.current.state,
      context: this.machine.current.context,
      progress: this.machine.current.progress
    }
  }
  
  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: any) => void): () => void {
    const id = Math.random().toString(36)
    this.listeners.set(id, listener)
    
    return () => {
      this.listeners.delete(id)
    }
  }
  
  private notifyListeners(): void {
    const state = this.getState()
    for (const listener of this.listeners.values()) {
      listener(state)
    }
  }
}
```

### **Event Integration with Build Events**
```typescript
export class BuildEventToStateMachineAdapter {
  private engines: Map<string, ProjectStateMachineEngine> = new Map()
  
  /**
   * Convert build event to state machine event
   */
  processBuildEvent(buildEvent: CleanBuildEvent, projectId: string): void {
    let engine = this.engines.get(projectId)
    if (!engine) {
      engine = new ProjectStateMachineEngine({ projectId, buildId: buildEvent.build_id })
      this.engines.set(projectId, engine)
    }
    
    // Convert build event to state machine event
    const stateMachineEvent = this.convertBuildEvent(buildEvent)
    if (stateMachineEvent) {
      engine.send(stateMachineEvent)
    }
  }
  
  private convertBuildEvent(buildEvent: CleanBuildEvent): ProjectEvent | null {
    switch (buildEvent.event_type) {
      case 'started':
        if (buildEvent.phase === 'setup') {
          return { type: 'BUILD_STARTED', payload: { buildId: buildEvent.build_id, workerId: 'unknown' } }
        }
        return { type: 'PHASE_ENTERED', payload: { phase: buildEvent.phase, estimatedDuration: 60 } }
        
      case 'progress':
        return { 
          type: 'PHASE_PROGRESS', 
          payload: { 
            phase: buildEvent.phase, 
            progress: buildEvent.overall_progress,
            message: buildEvent.description 
          } 
        }
        
      case 'completed':
        if (buildEvent.phase === 'deploy') {
          return { 
            type: 'DEPLOYMENT_COMPLETED', 
            payload: { 
              previewUrl: buildEvent.preview_url || '',
              deployedAt: buildEvent.created_at 
            } 
          }
        }
        return { 
          type: 'PHASE_COMPLETED', 
          payload: { 
            phase: buildEvent.phase, 
            duration: buildEvent.duration_seconds || 0 
          } 
        }
        
      case 'failed':
        return { 
          type: 'BUILD_FAILED', 
          payload: { 
            error: buildEvent.error_message || 'Build failed',
            phase: buildEvent.phase,
            recoverable: true 
          } 
        }
        
      default:
        return null
    }
  }
  
  /**
   * Get state machine for project
   */
  getEngine(projectId: string): ProjectStateMachineEngine | null {
    return this.engines.get(projectId) || null
  }
}
```

### **React Integration**
```typescript
export function useProjectStateMachine(projectId: string) {
  const [state, setState] = useState<any>(null)
  const engineRef = useRef<ProjectStateMachineEngine | null>(null)
  
  useEffect(() => {
    // Initialize state machine
    const engine = new ProjectStateMachineEngine({ projectId })
    engineRef.current = engine
    
    // Subscribe to state changes
    const unsubscribe = engine.subscribe(setState)
    
    // Initialize with current state
    setState(engine.getState())
    
    return unsubscribe
  }, [projectId])
  
  // Sync with build events
  const { events } = useCleanBuildEvents(state?.context.buildId, userId)
  
  useEffect(() => {
    if (events && engineRef.current) {
      const adapter = new BuildEventToStateMachineAdapter()
      for (const event of events) {
        adapter.processBuildEvent(event, projectId)
      }
    }
  }, [events, projectId])
  
  return {
    state: state?.state,
    context: state?.context,
    progress: state?.progress,
    send: (event: ProjectEvent) => engineRef.current?.send(event)
  }
}

// Usage in components
export function ProjectDashboard({ projectId }: { projectId: string }) {
  const { state, context, progress } = useProjectStateMachine(projectId)
  
  return (
    <div>
      <h2>Project Status: {state}</h2>
      <ProgressBar value={progress} />
      {context.currentPhase && <PhaseIndicator phase={context.currentPhase} />}
      {context.error && <ErrorDisplay error={context.error} />}
      {context.previewUrl && <PreviewLink url={context.previewUrl} />}
    </div>
  )
}
```

### **Advanced Features**

#### **Multi-Environment Deployments**
```typescript
// State machine can handle complex deployment flows
const advancedStates = {
  // ... existing states
  
  'staging-deployed': {
    on: {
      'PROMOTE_TO_PRODUCTION': { target: 'promoting', actions: ['startPromotion'] },
      'ROLLBACK_STAGING': { target: 'staging-rolling-back', actions: ['startStagingRollback'] }
    }
  },
  
  'promoting': {
    on: {
      'PROMOTION_COMPLETED': { target: 'production-deployed', actions: ['setProductionUrl'] },
      'PROMOTION_FAILED': { target: 'staging-deployed', actions: ['setPromotionError'] }
    }
  }
}
```

#### **A/B Testing Support**
```typescript
// State machine can model parallel deployments
const abTestingEvents = [
  { type: 'AB_TEST_STARTED', payload: { variants: ['A', 'B'], trafficSplit: 50 } },
  { type: 'VARIANT_DEPLOYED', payload: { variant: 'A', url: 'https://a.example.com' } },
  { type: 'AB_TEST_WINNER', payload: { winner: 'A', confidence: 95 } }
]
```

### **Pros & Cons**
**✅ Pros:**
- **Comprehensive state modeling** - handles any complexity (rollbacks, A/B tests, multi-env)
- **Event-driven architecture** - natural fit for real-time systems
- **Predictable state transitions** - state machine ensures valid transitions only
- **Excellent testing** - state machines are highly testable
- **Visual modeling** - can generate state diagrams for documentation
- **Time-travel debugging** - can replay events to debug issues
- **Extensibility** - easy to add new states and transitions

**❌ Cons:**
- **High complexity** - requires deep understanding of state machines
- **Learning curve** - team needs to understand event-driven patterns
- **Over-engineering risk** - may be too complex for current needs
- **Implementation time** - significant upfront development
- **Migration complexity** - complete rewrite of state management

### **Implementation Timeline: 15-20 days**
- **Days 1-3:** State machine definition + event types
- **Days 4-6:** State machine engine + event processing
- **Days 7-9:** Build event adapter + integration layer
- **Days 10-12:** React hooks + component integration
- **Days 13-15:** Advanced features (rollbacks, multi-env)
- **Days 16-18:** Migration from existing system
- **Days 19-20:** Testing + documentation

---

## Comparison Matrix

| Aspect | Enhanced Mapper (A) | Unified State (B) | Event-Driven (C) |
|--------|-------------------|------------------|------------------|
| **Implementation Time** | 3 days | 10 days | 15-20 days |
| **Complexity** | Low | Medium | High |
| **Information Preservation** | Medium | High | Highest |
| **Synchronization Issues** | Reduced | Eliminated | Eliminated |
| **Real-time Capabilities** | Basic | Advanced | Comprehensive |
| **Future Extensibility** | Limited | Good | Excellent |
| **Learning Curve** | Minimal | Moderate | Steep |
| **Risk Level** | Low | Medium | High |
| **Backward Compatibility** | Full | Good (with adapters) | Requires migration |

## Expert Review & Refined Recommendation

### **Expert Feedback Analysis (Refined Option B)**

An expert review provided a **pragmatic refinement** of Option B that eliminates over-engineering while preserving strategic benefits:

#### **🏆 Expert's Key Insights:**
1. **Pure Reducer Pattern** - `reduceEvents(projectRow, events[]) => UnifiedProjectState`
2. **Smart Polling Strategy** - State-aware intervals (2s active, 5s queued, ∞ final)
3. **Single Database Query** - Optimized join for project + events
4. **Incremental Migration** - Keep existing schemas, migrate gradually

#### **🎯 Refined Implementation (Expert-Guided):**

```typescript
// Pure reducer approach (expert recommended)
export function reduceEvents(
  projectRow: Project, 
  events: CleanBuildEvent[]
): UnifiedProjectState {
  
  // Priority 1: Database status (final authority)
  if (projectRow.build_status === 'deployed') {
    return createDeployedState(projectRow, events)
  }
  
  // Priority 2: Build events (real-time progress)
  const latestEvent = events[events.length - 1]
  if (latestEvent) {
    return createEventBasedState(projectRow, latestEvent, events)
  }
  
  // Priority 3: Fallback to database status
  return createFallbackState(projectRow)
}
```

**Smart Polling (Expert Strategy):**
```typescript
refetchInterval: (query) => {
  const state = query.state.data?.state
  switch (state?.overall) {
    case 'building': case 'deploying': case 'rollingBack':
      return 2000 // Fast updates for active operations
    case 'queued': case 'generating':
      return 5000 // Medium updates for slower phases  
    case 'deployed': case 'failed':
      return Infinity // Stop polling for final states
  }
}
```

#### **🤔 Expert Feedback Analysis:**

**✅ What We're Adopting:**
- **Pure reducer pattern** - Excellent for testing and debugging
- **Smart polling intervals** - Performance optimized and user-friendly
- **Single endpoint approach** - `/api/projects/[id]/state`
- **Incremental migration** - Low-risk, gradual transition

**⚠️ What We're Refining:**
- **Event complexity** - Keep existing `CleanBuildEvent` structure instead of Option C events
- **Event limit** - Fetch all events for current build (not N=20 limit) for complete state
- **Timeline** - 8 days instead of 10 (more focused scope)

### **Final Strategic Recommendation: Expert-Refined Option B**

**Choose Expert-Refined Unified State** - The optimal balance of strategic improvement and practical implementation:

#### **Why This Approach Wins:**
- ✅ **Proven expertise** - Incorporates expert production experience
- ✅ **Right-sized complexity** - Strategic benefits without over-engineering
- ✅ **Fast implementation** - 8 days vs 10-20 for other options
- ✅ **Low risk** - Pure functions are predictable and testable
- ✅ **Performance optimized** - Smart polling reduces server load
- ✅ **Future-proof** - Clean architecture supports future enhancements

## Implementation Roadmap

### **Phase 1: Immediate Fix** (Week 1)
- Implement Enhanced Mapper (Option A)
- Resolve current worker status mapping issues
- Maintain full backward compatibility

### **Phase 2: Strategic Improvement** (Month 2-3)
- Implement Unified State Architecture (Option B)
- Gradual migration from dual state system
- Enhanced developer experience and UI capabilities

### **Phase 3: Advanced Architecture** (Quarter 2)
- Evaluate need for Event-Driven Architecture (Option C)
- Implement if complex workflows are required
- Complete migration to event-driven patterns

## Success Metrics

### **Option A Success Metrics**
- ✅ Status mapping accuracy: 100%
- ✅ User confusion incidents: <5/month
- ✅ Development time: <3 days
- ✅ Zero breaking changes

### **Option B Success Metrics**
- ✅ API endpoint consolidation: 2+ endpoints → 1
- ✅ Component complexity reduction: 30%+ fewer lines of state management
- ✅ Real-time update latency: <500ms
- ✅ Developer onboarding time: 50% reduction

### **Option C Success Metrics**
- ✅ State transition coverage: 100% of business workflows
- ✅ Event replay capability: Full debugging support
- ✅ Complex workflow support: A/B testing, multi-env, rollbacks
- ✅ System extensibility: New features added via events only

## Conclusion

### **Updated Assessment (August 2025)**

After webhook deprecation and architecture confirmation, our current database-polling approach is working reliably. The original problems that motivated this strategic plan have largely been resolved:

- ✅ **Information Loss**: Worker now writes rich events directly to database
- ✅ **Synchronization Issues**: Single database source eliminates race conditions  
- ✅ **Polling Inefficiency**: React Query + adaptive intervals are performant
- ✅ **Developer Experience**: Simple, predictable polling patterns

### **Revised Recommendations**

**🏆 Primary Recommendation: Stick with Current Architecture**

Our database-polling architecture with `useCleanBuildEvents` is:
- Reliable and battle-tested
- Simple to debug and maintain  
- Providing excellent user experience
- Handling all current use cases successfully

**🔄 Secondary Recommendation: Incremental Improvements**

If specific issues arise, consider targeted improvements:
- **Option A (Enhanced Mapper)**: For richer status display needs
- **Option B (Unified State)**: If dual-state complexity becomes problematic
- **Option C (Event-Driven)**: Only for complex multi-environment workflows

### **When to Revisit This Plan**

Consider architectural changes if we encounter:
- Actual performance problems (not theoretical)
- Complex workflow requirements (A/B testing, multi-env deployments)
- User confusion about build states (evidence-based)
- Developer productivity issues with current patterns

**Key Principle**: "Don't fix what isn't broken" - our current architecture is working well.