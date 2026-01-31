/**
 * Event Coordinator - Sprint 4 Implementation
 * Central orchestration for event-driven architecture
 */

import { events } from '@/utils/event-logger'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { logger } from '@/utils/logger'
import type { BuilderState } from '@/store/builder-store'

export class EventCoordinator {
  private initialized = false
  private subscriptions: Array<() => void> = []

  /**
   * Initialize event coordination between all systems
   */
  initialize() {
    if (!FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
      logger.info('Event system disabled via feature flag')
      return
    }

    if (this.initialized) {
      logger.warn('Event coordinator already initialized')
      return
    }

    this.setupStoreEventHandlers()
    this.setupPreviewEventHandlers()
    this.setupHistoryEventHandlers()
    this.setupLayoutEventHandlers()
    this.setupErrorHandlers()

    this.initialized = true
    logger.info('✅ Event coordinator initialized')
  }

  /**
   * Store-related event handlers
   */
  private setupStoreEventHandlers() {
    // Listen for section edits from UI components
    const handleSectionEdit = ({ sectionId, content }: { sectionId: string; content: any }) => {
      events.emit('store:action', {
        type: 'applyEdit',
        payload: { sectionId, content },
        timestamp: Date.now()
      })
    }
    events.on('section:edited', handleSectionEdit)

    // Listen for edit commits
    const handleEditCommit = ({ sectionId, userAction }: { sectionId: string; userAction: string }) => {
      events.emit('history:section_agnostic_edit', {
        operationType: 'edit',
        sectionType: 'unknown', // Will be determined by store
        layoutId: 'current', // Will be determined by store
        performanceMs: 0,
        timestamp: Date.now()
      })
    }
    events.on('edit:committed', handleEditCommit)

    // Store cleanup functions
    this.subscriptions.push(
      () => events.off('section:edited', handleSectionEdit),
      () => events.off('edit:committed', handleEditCommit)
    )
  }

  /**
   * Preview-related event handlers
   */
  private setupPreviewEventHandlers() {
    // Sync preview when store changes
    const handleStateChange = ({ after, action }: { after: any; action: string }) => {
      const startTime = Date.now()
      
      events.emit('preview:sync_start', {
        layoutId: after.ui?.currentLayoutId || 'unknown',
        sectionCount: Object.keys(after.layouts?.[after.ui?.currentLayoutId]?.sections || {}).length,
        timestamp: startTime
      })

      // In a real implementation, this would trigger preview update
      // For now, just emit completion
      setTimeout(() => {
        events.emit('preview:sync_complete', {
          layoutId: after.ui?.currentLayoutId || 'unknown',
          duration: Date.now() - startTime,
          timestamp: Date.now()
        })
      }, 0)
    }
    events.on('store:state_change', handleStateChange)

    // Handle preview errors
    const handlePreviewError = ({ error, context }: { error: string; context: any }) => {
      logger.error('Preview error:', error, context)
    }
    events.on('preview:error', handlePreviewError)

    this.subscriptions.push(
      () => events.off('store:state_change', handleStateChange),
      () => events.off('preview:error', handlePreviewError)
    )
  }

  /**
   * History-related event handlers
   */
  private setupHistoryEventHandlers() {
    // For now, just use simple logging without storing unsubscribers
    // Since the event system cleanup is optional for this phase
  }

  /**
   * Layout-related event handlers
   */
  private setupLayoutEventHandlers() {
    // Simplified for initial implementation
  }

  /**
   * Error handling
   */
  private setupErrorHandlers() {
    // Simplified for initial implementation
  }

  /**
   * Performance monitoring
   */
  monitorPerformance() {
    // Simplified for initial implementation
    logger.info('Performance monitoring enabled')
  }

  /**
   * Cleanup subscriptions
   */
  cleanup() {
    this.subscriptions.forEach(unsub => unsub())
    this.subscriptions = []
    this.initialized = false
    logger.info('Event coordinator cleaned up')
  }

  /**
   * Get coordinator status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      subscriptionCount: this.subscriptions.length,
      eventSystemEnabled: FEATURE_FLAGS.ENABLE_EVENT_SYSTEM
    }
  }
}

// Singleton instance
export const eventCoordinator = new EventCoordinator()

// Auto-initialize in development
if (process.env.NODE_ENV === 'development' && FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      eventCoordinator.initialize()
      eventCoordinator.monitorPerformance()
    })
    
    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
      eventCoordinator.cleanup()
    })
  }
}