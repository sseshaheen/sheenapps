/**
 * Event Privacy Utilities
 * Expert-guided privacy controls for dashboard analytics
 */

import { analyticsConfig, processEventForAnalytics } from '@/config/analytics-config'

// Privacy-aware event emission wrapper
export function safeEmitWithPrivacy(events: any, eventType: string, eventData: any) {
  try {
    // Process event through privacy pipeline
    const processedEvent = processEventForAnalytics({
      type: eventType,
      ...eventData
    })
    
    // Skip if event was filtered by sampling
    if (!processedEvent) return
    
    // Remove analytics metadata before emitting
    const { _analytics, ...cleanEvent } = processedEvent
    
    // Emit the privacy-processed event
    if (events && typeof events.emit === 'function') {
      events.emit(eventType, cleanEvent)
    }
  } catch (error) {
    // Silently fail if privacy processing has issues
    console.warn('Privacy processing failed for event:', eventType, error)
  }
}

// Debounced event emission (expert suggestion for search)
export function createDebouncedEmitter(
  emitFunction: (eventType: string, data: any) => void,
  debounceMs: number = analyticsConfig.searchDebounceMs
) {
  const debounceTimers = new Map<string, NodeJS.Timeout>()
  
  return function debouncedEmit(eventType: string, eventData: any) {
    // Clear existing timer for this event type
    const existingTimer = debounceTimers.get(eventType)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      emitFunction(eventType, eventData)
      debounceTimers.delete(eventType)
    }, debounceMs)
    
    debounceTimers.set(eventType, timer)
  }
}

// Error classification with privacy considerations
export function classifyErrorSafely(error: any): {
  type: 'network' | 'validation' | 'permission' | 'unknown'
  safeMessage: string
  shouldTrack: boolean
} {
  if (!error) {
    return {
      type: 'unknown',
      safeMessage: 'Unknown error occurred',
      shouldTrack: false
    }
  }
  
  const message = error.message?.toLowerCase() || ''
  const status = error.status || error.statusCode
  
  // Classify error type
  let type: 'network' | 'validation' | 'permission' | 'unknown' = 'unknown'
  let shouldTrack = true
  
  if (status >= 400 && status < 500) {
    if (status === 401 || status === 403) {
      type = 'permission'
      shouldTrack = false // Don't track auth errors for privacy
    } else if (status === 400 || status === 422) {
      type = 'validation'
    }
  } else if (status >= 500 || message.includes('network') || message.includes('fetch')) {
    type = 'network'
  } else if (message.includes('validation') || message.includes('invalid')) {
    type = 'validation'
  } else if (message.includes('permission') || message.includes('unauthorized')) {
    type = 'permission'
    shouldTrack = false
  }
  
  // Sanitize error message
  const safeMessage = sanitizeErrorMessage(error.message || 'Unknown error')
  
  return { type, safeMessage, shouldTrack }
}

// Sanitize error messages to remove sensitive data
function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error'
  
  return message
    // Remove email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    // Remove UUIDs
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '[UUID]')
    // Remove API keys
    .replace(/\b(sk_|pk_|whsec_)[a-zA-Z0-9]+\b/g, '[API_KEY]')
    // Remove bearer tokens
    .replace(/\bBearer\s+[a-zA-Z0-9_.-]+\b/gi, 'Bearer [TOKEN]')
    // Remove JWT tokens (rough pattern)
    .replace(/\beyJ[a-zA-Z0-9_.-]+\b/g, '[JWT]')
    // Remove URLs with sensitive params
    .replace(/\bhttps?:\/\/[^\s]+[?&][^\s]*\b/g, '[URL_WITH_PARAMS]')
    // Limit length
    .substring(0, 200)
}

// Rate limiting for error events (prevent spam)
class ErrorRateLimiter {
  private errorCounts = new Map<string, { count: number; lastReset: number }>()
  private readonly maxErrorsPerMinute = analyticsConfig.maxErrorsPerMinute
  private readonly windowMs = 60000 // 1 minute
  
  shouldAllowError(errorType: string, errorMessage: string): boolean {
    const key = `${errorType}:${errorMessage.substring(0, 50)}` // Group similar errors
    const now = Date.now()
    
    const entry = this.errorCounts.get(key)
    if (!entry) {
      this.errorCounts.set(key, { count: 1, lastReset: now })
      return true
    }
    
    // Reset count if window expired
    if (now - entry.lastReset > this.windowMs) {
      entry.count = 1
      entry.lastReset = now
      return true
    }
    
    // Check if under limit
    if (entry.count < this.maxErrorsPerMinute) {
      entry.count++
      return true
    }
    
    return false // Rate limited
  }
  
  getStats() {
    return {
      trackedErrorTypes: this.errorCounts.size,
      maxErrorsPerMinute: this.maxErrorsPerMinute,
      windowMs: this.windowMs
    }
  }
}

export const errorRateLimiter = new ErrorRateLimiter()

// User action context (for undo correlation)
interface ActionContext {
  actionId: string
  action: string
  projectIds: string[]
  timestamp: number
  undoable: boolean
}

class ActionContextManager {
  private contexts = new Map<string, ActionContext>()
  private readonly maxContexts = analyticsConfig.maxUndoActions
  private readonly contextTimeoutMs = analyticsConfig.undoTimeoutMs
  
  recordAction(action: string, projectIds: string[], undoable: boolean = true): string {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const context: ActionContext = {
      actionId,
      action,
      projectIds,
      timestamp: Date.now(),
      undoable
    }
    
    this.contexts.set(actionId, context)
    
    // Clean up old contexts
    this.cleanupOldContexts()
    
    // Limit total contexts
    if (this.contexts.size > this.maxContexts) {
      const oldestKey = Array.from(this.contexts.keys())[0]
      this.contexts.delete(oldestKey)
    }
    
    return actionId
  }
  
  getActionContext(actionId: string): ActionContext | null {
    return this.contexts.get(actionId) || null
  }
  
  removeContext(actionId: string): void {
    this.contexts.delete(actionId)
  }
  
  private cleanupOldContexts(): void {
    const now = Date.now()
    for (const [actionId, context] of this.contexts.entries()) {
      if (now - context.timestamp > this.contextTimeoutMs) {
        this.contexts.delete(actionId)
      }
    }
  }
  
  getStats() {
    return {
      activeContexts: this.contexts.size,
      maxContexts: this.maxContexts,
      timeoutMs: this.contextTimeoutMs
    }
  }
}

export const actionContextManager = new ActionContextManager()

// Development helpers
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).errorRateLimiter = errorRateLimiter
  ;(window as any).actionContextManager = actionContextManager
  
  // Privacy debugging helpers
  ;(window as any).testPrivacyProcessing = (eventData: any) => {
    console.log('Original:', eventData)
    console.log('Processed:', processEventForAnalytics(eventData))
  }
}