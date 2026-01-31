/**
 * Event Logger - Expert requirement: events.on('*', console.log) 
 * Surfaces race conditions immediately during development
 */

import mitt, { type Emitter } from 'mitt'
import { FEATURE_FLAGS } from '@/config/feature-flags'

// Builder event types
export type BuilderEvents = {
  // Store events
  'store:action': { type: string; payload: any; timestamp: number }
  'store:state_change': { 
    before: any
    after: any
    action: string
    timestamp: number
  }
  'edit:committed': {
    sectionId: string
    userAction: string
    timestamp: number
  }
  'section:edited': {
    sectionId: string
    content: any
    userAction?: string
    timestamp: number
  }
  
  // Preview events
  'preview:mounted': { layoutId: string; timestamp: number }
  'preview:rendered': { layoutId: string; sectionCount: number; timestamp: number }
  'preview:error': { error: string; context: any; timestamp: number }
  
  // Section events (using the one defined above)
  'section:restored': {
    sectionId: string
    fromSnapshot: string
    timestamp: number
  }
  
  // Layout events
  'layout:changed': { 
    fromLayoutId: string | null
    toLayoutId: string
    timestamp: number
  }
  'layout:restored': {
    layoutId: string
    sectionsRestored: string[]
    timestamp: number
  }
  
  // History events
  'history:undo': { 
    sectionId: string
    fromIndex: number
    toIndex: number
    timestamp: number
  }
  'history:redo': { 
    sectionId: string
    fromIndex: number
    toIndex: number
    timestamp: number
  }
  'history:snapshot_created': {
    snapshotId: string
    sectionId: string
    userAction: string
    historyLength: number
    timestamp: number
  }
  
  // UI events
  'ui:modal_opened': { modalType: string; sectionId?: string; timestamp: number }
  'ui:modal_closed': { modalType: string; timestamp: number }
  'ui:button_clicked': { buttonType: string; sectionId?: string; timestamp: number }
  'previewModeChanged': { mode: 'edit' | 'preview' | 'compiled'; timestamp: number }
  
  // Performance events
  'perf:slow_operation': { 
    operation: string
    duration: number
    threshold: number
    timestamp: number
  }
  'perf:memory_warning': {
    operation: string
    memoryUsage: number
    growth: number
    timestamp: number
  }
  
  // Error events
  'error:race_condition': {
    operation: string
    conflictingOperation: string
    details: any
    timestamp: number
  }
  'error:state_corruption': {
    expectedState: any
    actualState: any
    operation: string
    timestamp: number
  }
  
  // Sprint 4: New comprehensive event types
  // Section-agnostic history events
  'history:section_agnostic_edit': {
    operationType: string
    sectionType: string
    layoutId: string
    performanceMs: number
    timestamp: number
  }
  'history:undo_section_agnostic': {
    sectionsModified: number
    sectionsCreated: number
    sectionsDeleted: number
    sectionTypes: string[]
    layoutId: string
    performanceMs: number
    timestamp: number
  }
  'history:redo_section_agnostic': {
    sectionsModified: number
    sectionsCreated: number
    sectionsDeleted: number
    sectionTypes: string[]
    layoutId: string
    performanceMs: number
    timestamp: number
  }
  'history:cross_layout_operation': {
    operation: string
    sectionType: string
    sourceLayoutId: string
    targetLayoutId: string
    timestamp: number
  }
  
  // Snapshot events
  'snapshot:created': {
    snapshotId: string
    sizeEstimate: number
    sectionsModified: number
    changeType: string
    patches: boolean
    timestamp: number
  }
  'snapshot:restored': {
    snapshotId: string
    restorationMethod: string
    performanceMs: number
    timestamp: number
  }
  'snapshot:restore_failed': {
    snapshotId: string
    error: string
    timestamp: number
  }
  'snapshots:cleanup': {
    removed: number
    memoryFreed: number
    remaining: number
    timestamp: number
  }
  
  // Builder-level events
  'builder:undo': {
    duration: number
    sectionsAffected: number
    method: string
    timestamp: number
  }
  'builder:redo': {
    duration: number
    sectionsAffected: number
    method: string
    timestamp: number
  }
  'builder:clear_history': {
    layoutId: string | undefined
    clearedSnapshots: number
    timestamp: number
  }
  
  // Store-preview integration events
  'preview:sync_start': {
    layoutId: string
    sectionCount: number
    timestamp: number
  }
  'preview:sync_complete': {
    layoutId: string
    duration: number
    timestamp: number
  }
  'preview:update_from_store': {
    sectionId: string
    source: string
    timestamp: number
  }
  
  // Layout transition events
  'layout:switching': {
    fromLayoutId: string | null
    toLayoutId: string
    timestamp: number
  }
  'layout:switch_complete': {
    layoutId: string
    duration: number
    timestamp: number
  }
  
  // Dashboard events (Expert optimized)
  'dashboard:project_action': {
    action: 'create' | 'rename' | 'duplicate' | 'archive' | 'restore' | 'delete' | 'open'
    projectIds: string[] // Always array for consistency (expert suggestion)
    projectCount: number // Explicit count for analytics (expert suggestion)
    projectName?: string // For single operations
    userId: string // Subject to anonymization
    duration?: number // Performance tracking
    timestamp: number
  }
  'dashboard:project_action_undo': {
    originalAction: string
    projectIds: string[]
    projectCount: number
    undoMethod: 'toast' | 'keyboard' | 'manual'
    timestamp: number
  }
  'dashboard:search': {
    query: string
    resultsCount: number
    filterBy: 'all' | 'active' | 'archived'
    sortBy: 'updated' | 'created' | 'name'
    debounced: true // Always true for search events (expert suggestion)
    timestamp: number
  }
  'dashboard:error': {
    action: string
    errorType: 'network' | 'validation' | 'permission' | 'unknown'
    errorMessage: string
    projectIds?: string[]
    userId: string
    timestamp: number
  }
  'dashboard:view_change': {
    from: 'grid' | 'list'
    to: 'grid' | 'list'
    timestamp: number
  }
  'dashboard:bulk_action': {
    action: string
    projectIds: string[]
    projectCount: number
    timestamp: number
  }
}

// Create event emitter based on feature flag
function createEventEmitter(): Emitter<BuilderEvents> {
  if (FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
    return mitt<BuilderEvents>()
  }
  
  // Return a no-op implementation when disabled
  return {
    on: () => {},
    off: () => {},
    emit: () => {},
    all: new Map()
  } as Emitter<BuilderEvents>
}

export const events = createEventEmitter()

// Event statistics
export class EventStats {
  private eventCounts = new Map<string, number>()
  private eventTiming = new Map<string, number[]>()
  private raceConditions: Array<{ event1: string; event2: string; timestamp: number }> = []
  
  recordEvent(type: string, timestamp: number) {
    // Count events
    this.eventCounts.set(type, (this.eventCounts.get(type) || 0) + 1)
    
    // Track timing
    if (!this.eventTiming.has(type)) {
      this.eventTiming.set(type, [])
    }
    this.eventTiming.get(type)!.push(timestamp)
    
    // Detect potential race conditions (events within 10ms)
    const recentEvents = Array.from(this.eventTiming.entries())
      .filter(([eventType, times]) => {
        const lastTime = times[times.length - 1]
        return Math.abs(lastTime - timestamp) < 10 && eventType !== type
      })
    
    if (recentEvents.length > 0) {
      recentEvents.forEach(([eventType]) => {
        this.raceConditions.push({
          event1: type,
          event2: eventType,
          timestamp
        })
        
        safeEmit('error:race_condition', {
          operation: type,
          conflictingOperation: eventType,
          details: { timeDiff: Math.abs(timestamp - Date.now()) },
          timestamp
        })
      })
    }
  }
  
  getStats() {
    return {
      eventCounts: Object.fromEntries(this.eventCounts),
      totalEvents: Array.from(this.eventCounts.values()).reduce((sum, count) => sum + count, 0),
      raceConditions: this.raceConditions.length,
      recentRaceConditions: this.raceConditions.slice(-10)
    }
  }
  
  reset() {
    this.eventCounts.clear()
    this.eventTiming.clear()
    this.raceConditions = []
  }
}

export const eventStats = new EventStats()

// Development logging (expert requirement)
if (FEATURE_FLAGS.ENABLE_EVENT_SYSTEM && process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // Log ALL events with full context
  try {
    events.on('*', (type, data) => {
      const timestamp = Date.now()
      eventStats.recordEvent(type, timestamp)
      
      console.group(`🎯 Builder Event: ${type}`)
      console.log('📊 Data:', data)
      console.log('⏰ Timestamp:', new Date(timestamp).toISOString())
      console.log('📈 Event Count:', eventStats.getStats().eventCounts[type] || 1)
      
      // Add extra context for critical events
      if (type.includes('error') || type.includes('race_condition')) {
        console.warn('🚨 Critical Event Detected!')
        console.log('🔍 Stats:', eventStats.getStats())
      }
      
      if (type.includes('history') || type.includes('undo') || type.includes('redo')) {
        console.log('📚 History Context:', {
          canUndo: data && 'fromIndex' in data ? data.fromIndex >= 0 : 'unknown',
          canRedo: data && 'toIndex' in data ? data.toIndex < 50 : 'unknown' // Assuming max 50 history
        })
      }
      
      console.groupEnd()
    })
  } catch (error) {
    console.warn('Failed to setup event logging:', error)
  }
  
  // Periodic stats logging
  setInterval(() => {
    const stats = eventStats.getStats()
    if (stats.totalEvents > 0) {
      console.log(`📊 Event Stats (last 30s):`, stats)
      
      if (stats.raceConditions > 0) {
        console.warn(`🚨 Race Conditions Detected: ${stats.raceConditions}`)
        console.table(stats.recentRaceConditions)
      }
    }
  }, 30000) // Every 30 seconds
}

// Safe event emission helper
const safeEmit = (type: keyof BuilderEvents, data: any) => {
  try {
    if (events && typeof events.emit === 'function') {
      events.emit(type, data)
    }
  } catch (error) {
    // Silently fail if events system is not working
  }
}

// Helper functions for common events
export const eventHelpers = {
  // Store events
  storeAction: (type: string, payload: any) => {
    safeEmit('store:action', { type, payload, timestamp: Date.now() })
  },
  
  stateChange: (before: any, after: any, action: string) => {
    safeEmit('store:state_change', { before, after, action, timestamp: Date.now() })
  },
  
  // Section events
  sectionEdited: (sectionId: string, content: any, userAction: string) => {
    safeEmit('section:edited', { sectionId, content, userAction, timestamp: Date.now() })
  },
  
  sectionRestored: (sectionId: string, fromSnapshot: string) => {
    safeEmit('section:restored', { sectionId, fromSnapshot, timestamp: Date.now() })
  },
  
  // Layout events
  layoutChanged: (fromLayoutId: string | null, toLayoutId: string) => {
    safeEmit('layout:changed', { fromLayoutId, toLayoutId, timestamp: Date.now() })
  },
  
  layoutRestored: (layoutId: string, sectionsRestored: string[]) => {
    safeEmit('layout:restored', { layoutId, sectionsRestored, timestamp: Date.now() })
  },
  
  // History events
  historyUndo: (sectionId: string, fromIndex: number, toIndex: number) => {
    safeEmit('history:undo', { sectionId, fromIndex, toIndex, timestamp: Date.now() })
  },
  
  historyRedo: (sectionId: string, fromIndex: number, toIndex: number) => {
    safeEmit('history:redo', { sectionId, fromIndex, toIndex, timestamp: Date.now() })
  },
  
  snapshotCreated: (snapshotId: string, sectionId: string, userAction: string, historyLength: number) => {
    safeEmit('history:snapshot_created', { 
      snapshotId, 
      sectionId, 
      userAction, 
      historyLength, 
      timestamp: Date.now() 
    })
  },
  
  // Preview events
  previewMounted: (layoutId: string) => {
    safeEmit('preview:mounted', { layoutId, timestamp: Date.now() })
  },
  
  previewRendered: (layoutId: string, sectionCount: number) => {
    safeEmit('preview:rendered', { layoutId, sectionCount, timestamp: Date.now() })
  },
  
  previewError: (error: string, context: any) => {
    safeEmit('preview:error', { error, context, timestamp: Date.now() })
  },
  
  // UI events
  modalOpened: (modalType: string, sectionId?: string) => {
    safeEmit('ui:modal_opened', { modalType, sectionId, timestamp: Date.now() })
  },
  
  modalClosed: (modalType: string) => {
    safeEmit('ui:modal_closed', { modalType, timestamp: Date.now() })
  },
  
  buttonClicked: (buttonType: string, sectionId?: string) => {
    safeEmit('ui:button_clicked', { buttonType, sectionId, timestamp: Date.now() })
  },
  
  // Performance events
  slowOperation: (operation: string, duration: number, threshold: number = 100) => {
    if (duration > threshold) {
      safeEmit('perf:slow_operation', { operation, duration, threshold, timestamp: Date.now() })
    }
  },
  
  memoryWarning: (operation: string, memoryUsage: number, growth: number) => {
    safeEmit('perf:memory_warning', { operation, memoryUsage, growth, timestamp: Date.now() })
  },
  
  // Error events
  raceCondition: (operation: string, conflictingOperation: string, details: any) => {
    safeEmit('error:race_condition', { operation, conflictingOperation, details, timestamp: Date.now() })
  },
  
  stateCorruption: (expectedState: any, actualState: any, operation: string) => {
    safeEmit('error:state_corruption', { expectedState, actualState, operation, timestamp: Date.now() })
  },

  // Dashboard event helpers (expert-optimized)
  dashboardProjectAction: (
    action: string, 
    projectId: string | string[], 
    userId: string, 
    projectName?: string, 
    duration?: number
  ) => {
    const projectIds = Array.isArray(projectId) ? projectId : [projectId]
    safeEmit('dashboard:project_action', {
      action: action as any,
      projectIds,
      projectCount: projectIds.length,
      projectName,
      userId,
      duration,
      timestamp: Date.now()
    })
  },

  dashboardProjectActionUndo: (
    originalAction: string,
    projectIds: string[],
    undoMethod: 'toast' | 'keyboard' | 'manual'
  ) => {
    safeEmit('dashboard:project_action_undo', {
      originalAction,
      projectIds,
      projectCount: projectIds.length,
      undoMethod,
      timestamp: Date.now()
    })
  },

  dashboardSearch: (
    query: string,
    resultsCount: number,
    filterBy: 'all' | 'active' | 'archived',
    sortBy: 'updated' | 'created' | 'name'
  ) => {
    safeEmit('dashboard:search', {
      query,
      resultsCount,
      filterBy,
      sortBy,
      debounced: true, // Always true (expert suggestion)
      timestamp: Date.now()
    })
  },

  dashboardError: (
    action: string,
    error: any,
    userId: string,
    projectIds?: string[]
  ) => {
    safeEmit('dashboard:error', {
      action,
      errorType: classifyError(error),
      errorMessage: sanitizeErrorMessage(error?.message || 'Unknown error'),
      projectIds,
      userId,
      timestamp: Date.now()
    })
  },

  dashboardViewChange: (from: 'grid' | 'list', to: 'grid' | 'list') => {
    safeEmit('dashboard:view_change', {
      from,
      to,
      timestamp: Date.now()
    })
  },

  dashboardBulkAction: (action: string, projectIds: string[]) => {
    safeEmit('dashboard:bulk_action', {
      action,
      projectIds,
      projectCount: projectIds.length,
      timestamp: Date.now()
    })
  }
}

// Error handling utilities for dashboard events
function classifyError(error: any): 'network' | 'validation' | 'permission' | 'unknown' {
  if (!error) return 'unknown'
  
  const message = error.message?.toLowerCase() || ''
  const status = error.status || error.statusCode
  
  if (status >= 400 && status < 500) {
    if (status === 401 || status === 403) return 'permission'
    if (status === 400 || status === 422) return 'validation'
  }
  
  if (status >= 500 || message.includes('network') || message.includes('fetch')) {
    return 'network'
  }
  
  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation'
  }
  
  if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) {
    return 'permission'
  }
  
  return 'unknown'
}

function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error'
  
  // Remove sensitive information patterns
  return message
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '[UUID]')
    .replace(/\b(sk_|pk_|whsec_)[a-zA-Z0-9]+\b/g, '[API_KEY]')
    .substring(0, 200) // Limit length
}

// Global access for debugging (browser only)
if (FEATURE_FLAGS.ENABLE_EVENT_SYSTEM && process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  try {
    ;(window as any).events = events
    ;(window as any).eventHelpers = eventHelpers
    ;(window as any).eventStats = eventStats
  } catch (error) {
    console.warn('Failed to assign debug globals:', error)
  }
  
  // Console helper
  (window as any).logEventStats = () => {
    console.table(eventStats.getStats())
  }
}