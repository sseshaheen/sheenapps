/**
 * Dashboard Event Coordinator
 * Expert-optimized event coordination for dashboard analytics
 */

import { events, eventHelpers } from '@/utils/event-logger'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { analyticsConfig } from '@/config/analytics-config'
import { 
  safeEmitWithPrivacy, 
  createDebouncedEmitter, 
  classifyErrorSafely,
  errorRateLimiter,
  actionContextManager
} from '@/utils/event-privacy'
import { logger } from '@/utils/logger'

export class DashboardEventCoordinator {
  private initialized = false
  private subscriptions: Array<() => void> = []
  private debouncedEmitters = new Map<string, (eventType: string, data: any) => void>()

  /**
   * Initialize dashboard event coordination
   */
  initialize() {
    if (!FEATURE_FLAGS.ENABLE_DASHBOARD_ANALYTICS) {
      logger.info('Dashboard analytics disabled via feature flag')
      return
    }

    if (this.initialized) {
      logger.warn('Dashboard event coordinator already initialized')
      return
    }

    this.setupProjectActionHandlers()
    this.setupSearchEventHandlers()
    this.setupErrorEventHandlers()
    this.setupUndoEventHandlers()
    this.setupPerformanceMonitoring()

    this.initialized = true
    logger.info('✅ Dashboard event coordinator initialized')
  }

  /**
   * Project action event handlers with privacy controls
   */
  private setupProjectActionHandlers() {
    if (!analyticsConfig.trackProjectActions) return

    const handleProjectAction = (data: any) => {
      // Record action context for potential undo
      if (data.action !== 'open' && data.projectIds?.length > 0) {
        const undoable = ['archive', 'restore', 'rename'].includes(data.action)
        const actionId = actionContextManager.recordAction(
          data.action,
          data.projectIds,
          undoable
        )
        
        // Add action ID to event data
        data.actionId = actionId
      }

      // Emit with privacy processing
      safeEmitWithPrivacy(events, 'dashboard:project_action', data)
    }

    events.on('dashboard:project_action', handleProjectAction)
    this.subscriptions.push(() => events.off('dashboard:project_action', handleProjectAction))
  }

  /**
   * Search event handlers with debouncing (expert suggestion)
   */
  private setupSearchEventHandlers() {
    if (!analyticsConfig.trackSearchBehavior) return

    // Create debounced emitter for search events
    const debouncedSearchEmit = createDebouncedEmitter(
      (eventType: string, data: any) => {
        safeEmitWithPrivacy(events, eventType, {
          ...data,
          debounced: true // Expert requirement
        })
      },
      analyticsConfig.searchDebounceMs
    )

    const handleSearchEvent = (data: any) => {
      debouncedSearchEmit('dashboard:search', data)
    }

    events.on('dashboard:search', handleSearchEvent)
    this.subscriptions.push(() => events.off('dashboard:search', handleSearchEvent))
  }

  /**
   * Error event handlers with rate limiting
   */
  private setupErrorEventHandlers() {
    if (!analyticsConfig.trackErrorEvents) return

    const handleErrorEvent = (data: any) => {
      const { type, safeMessage, shouldTrack } = classifyErrorSafely(data.error)
      
      if (!shouldTrack) return // Skip privacy-sensitive errors
      
      // Apply rate limiting
      if (!errorRateLimiter.shouldAllowError(type, safeMessage)) {
        return // Rate limited
      }

      const errorEventData = {
        ...data,
        errorType: type,
        errorMessage: safeMessage,
        error: undefined // Remove original error object
      }

      safeEmitWithPrivacy(events, 'dashboard:error', errorEventData)
    }

    events.on('dashboard:error', handleErrorEvent)
    this.subscriptions.push(() => events.off('dashboard:error', handleErrorEvent))
  }

  /**
   * Undo event handlers (expert enhancement)
   */
  private setupUndoEventHandlers() {
    if (!analyticsConfig.enableUndoTracking) return

    const handleUndoEvent = (data: any) => {
      // Get original action context
      const context = actionContextManager.getActionContext(data.actionId)
      
      if (context) {
        // Enrich undo event with original action data
        const enrichedData = {
          ...data,
          originalTimestamp: context.timestamp,
          timeSinceAction: Date.now() - context.timestamp,
          projectCount: context.projectIds.length
        }

        safeEmitWithPrivacy(events, 'dashboard:project_action_undo', enrichedData)
        
        // Clean up context after undo
        actionContextManager.removeContext(data.actionId)
      }
    }

    events.on('dashboard:project_action_undo', handleUndoEvent)
    this.subscriptions.push(() => events.off('dashboard:project_action_undo', handleUndoEvent))
  }

  /**
   * Performance monitoring for dashboard operations
   */
  private setupPerformanceMonitoring() {
    const handleSlowOperation = (data: any) => {
      if (data.duration > analyticsConfig.slowOperationThresholdMs) {
        logger.warn('🐌 Slow dashboard operation detected', {
          operation: data.operation,
          duration: `${data.duration}ms`,
          threshold: `${analyticsConfig.slowOperationThresholdMs}ms`
        })

        // Emit performance event if enabled
        if (FEATURE_FLAGS.ENABLE_PERFORMANCE_MONITORING) {
          eventHelpers.slowOperation(data.operation, data.duration)
        }
      }
    }

    events.on('dashboard:project_action', (data) => {
      if (data.duration) {
        handleSlowOperation({
          operation: `dashboard:${data.action}`,
          duration: data.duration
        })
      }
    })
  }

  /**
   * Emit dashboard project action with performance tracking
   */
  emitProjectAction(
    action: string,
    projectIds: string | string[],
    userId: string,
    projectName?: string
  ) {
    const startTime = Date.now()
    const projectIdsArray = Array.isArray(projectIds) ? projectIds : [projectIds]

    // Record action context
    const actionId = actionContextManager.recordAction(action, projectIdsArray)

    const eventData = {
      action,
      projectIds: projectIdsArray,
      projectCount: projectIdsArray.length,
      projectName,
      userId,
      actionId,
      timestamp: startTime
    }

    return {
      actionId,
      complete: (duration?: number) => {
        const finalData = {
          ...eventData,
          duration: duration || (Date.now() - startTime)
        }
        
        eventHelpers.dashboardProjectAction(
          action,
          projectIdsArray,
          userId,
          projectName,
          finalData.duration
        )
      }
    }
  }

  /**
   * Emit search event (automatically debounced)
   */
  emitSearchEvent(
    query: string,
    resultsCount: number,
    filterBy: 'all' | 'active' | 'archived',
    sortBy: 'updated' | 'created' | 'name'
  ) {
    eventHelpers.dashboardSearch(query, resultsCount, filterBy, sortBy)
  }

  /**
   * Emit error event with classification
   */
  emitErrorEvent(action: string, error: any, userId: string, projectIds?: string[]) {
    eventHelpers.dashboardError(action, error, userId, projectIds)
  }

  /**
   * Emit view change event
   */
  emitViewChange(from: 'grid' | 'list', to: 'grid' | 'list') {
    eventHelpers.dashboardViewChange(from, to)
  }

  /**
   * Get coordinator status and stats
   */
  getStatus() {
    return {
      initialized: this.initialized,
      subscriptionCount: this.subscriptions.length,
      enabledFeatures: {
        dashboardAnalytics: FEATURE_FLAGS.ENABLE_DASHBOARD_ANALYTICS,
        projectActionTracking: analyticsConfig.trackProjectActions,
        searchAnalytics: analyticsConfig.trackSearchBehavior,
        errorTracking: analyticsConfig.trackErrorEvents,
        undoTracking: analyticsConfig.enableUndoTracking
      },
      configuration: {
        searchDebounceMs: analyticsConfig.searchDebounceMs,
        eventSamplingRate: analyticsConfig.eventSamplingRate,
        anonymizeUserIds: analyticsConfig.anonymizeUserIds
      },
      runtime: {
        errorRateLimiter: errorRateLimiter.getStats(),
        actionContextManager: actionContextManager.getStats()
      }
    }
  }

  /**
   * Cleanup subscriptions and contexts
   */
  cleanup() {
    this.subscriptions.forEach(unsub => unsub())
    this.subscriptions = []
    this.debouncedEmitters.clear()
    this.initialized = false
    logger.info('Dashboard event coordinator cleaned up')
  }
}

// Singleton instance
export const dashboardEventCoordinator = new DashboardEventCoordinator()

// Auto-initialization removed to prevent race conditions
// Dashboard components should explicitly initialize when mounted

// Development helpers
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).dashboardEventCoordinator = dashboardEventCoordinator
  
  // Debug helper
  ;(window as any).getDashboardEventStats = () => {
    console.table(dashboardEventCoordinator.getStatus())
  }
}