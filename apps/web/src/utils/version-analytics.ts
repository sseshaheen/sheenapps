/**
 * Version Management Analytics
 * Complete funnel tracking for version operations with detailed outcome codes
 */

import { logger } from '@/utils/logger'

// Event types for version management analytics
export type VersionAnalyticsEvent = 
  | 'publish_clicked'
  | 'publish_success'
  | 'publish_error'
  | 'publish_duplicate'
  | 'rollback_clicked'
  | 'rollback_success'
  | 'rollback_error'
  | 'rollback_duplicate'
  | 'unpublish_clicked'
  | 'unpublish_success'
  | 'unpublish_error'
  | 'version_history_opened'
  | 'version_preview_clicked'
  | 'domain_added'
  | 'domain_verification_completed'

// Event data structure
interface VersionAnalyticsData {
  projectId: string
  versionId?: string
  userId?: string
  isFirstProject?: boolean
  operationDuration?: number
  errorCode?: string
  errorMessage?: string
  retryCount?: number
  source?: string
  context?: Record<string, any>
}

/**
 * Track version management events with complete funnel visibility
 */
export function trackVersionEvent(
  event: VersionAnalyticsEvent, 
  data: VersionAnalyticsData
): void {
  try {
    // Enhanced event data with metadata
    const eventData = {
      ...data,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined
    }

    // Log for development and debugging
    logger.info(`📊 Version Analytics: ${event}`, eventData)

    // Send to analytics service (implement based on your analytics provider)
    if (typeof window !== 'undefined') {
      sendToAnalyticsProvider(event, eventData)
    }

    // Track A/B testing variants if enabled
    if (data.context?.abTestVariant) {
      trackABTestEvent(event, data.context.abTestVariant, eventData)
    }

  } catch (error) {
    logger.error('Failed to track version analytics event:', error)
  }
}

/**
 * Generate or retrieve session ID for analytics correlation
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server-session'
  
  let sessionId = sessionStorage.getItem('version-analytics-session')
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('version-analytics-session', sessionId)
  }
  return sessionId
}

/**
 * Send events to your analytics provider
 * Customize this based on your analytics service (PostHog, Mixpanel, etc.)
 */
function sendToAnalyticsProvider(
  event: VersionAnalyticsEvent, 
  data: VersionAnalyticsData & { timestamp: string; sessionId: string }
): void {
  // Example for PostHog (if using)
  if (typeof window !== 'undefined' && (window as any).posthog) {
    (window as any).posthog.capture(`version_${event}`, data)
    return
  }

  // Example for Google Analytics 4 (if using)
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', event, {
      custom_parameter_project_id: data.projectId,
      custom_parameter_version_id: data.versionId,
      custom_parameter_source: data.source,
      value: data.operationDuration || 0
    })
    return
  }

  // Fallback to custom analytics endpoint (optional - don't break on failure)
  if (typeof window !== 'undefined') {
    fetch('/api/analytics/version-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data })
    }).catch(() => {
      // Silently ignore analytics failures - they're non-critical
      // The endpoint may not exist yet, which is fine
    })
  }
}

/**
 * Track A/B testing variants for version management features
 */
function trackABTestEvent(
  event: VersionAnalyticsEvent,
  variant: string,
  data: any
): void {
  // Track A/B test outcomes
  trackVersionEvent('ab_test_outcome' as VersionAnalyticsEvent, {
    ...data,
    context: {
      ...data.context,
      abTestEvent: event,
      variant
    }
  })
}

/**
 * Track complete publish funnel with timing
 */
export class PublishFunnelTracker {
  private startTime: number
  private projectId: string
  private versionId: string
  private userId: string
  private source: string

  constructor(
    projectId: string, 
    versionId: string, 
    userId: string, 
    source: string = 'status_bar'
  ) {
    this.startTime = Date.now()
    this.projectId = projectId
    this.versionId = versionId
    this.userId = userId
    this.source = source

    // Track click event
    trackVersionEvent('publish_clicked', {
      projectId,
      versionId,
      userId,
      source
    })
  }

  /**
   * Track successful publish completion
   */
  success(additionalData?: Record<string, any>): void {
    const duration = Date.now() - this.startTime

    trackVersionEvent('publish_success', {
      projectId: this.projectId,
      versionId: this.versionId,
      userId: this.userId,
      source: this.source,
      operationDuration: duration,
      context: additionalData
    })
  }

  /**
   * Track publish error with detailed error information
   */
  error(error: any, retryCount: number = 0): void {
    const duration = Date.now() - this.startTime

    trackVersionEvent('publish_error', {
      projectId: this.projectId,
      versionId: this.versionId,
      userId: this.userId,
      source: this.source,
      operationDuration: duration,
      errorCode: error.code || error.status?.toString(),
      errorMessage: error.message,
      retryCount,
      context: {
        errorType: error.constructor.name,
        stack: error.stack?.split('\n').slice(0, 3) // First 3 lines of stack trace
      }
    })
  }

  /**
   * Track duplicate/idempotent publish attempts
   */
  duplicate(): void {
    const duration = Date.now() - this.startTime

    trackVersionEvent('publish_duplicate', {
      projectId: this.projectId,
      versionId: this.versionId,
      userId: this.userId,
      source: this.source,
      operationDuration: duration
    })
  }
}

/**
 * Track complete rollback funnel with timing
 */
export class RollbackFunnelTracker {
  private startTime: number
  private projectId: string
  private targetVersionId: string
  private userId: string
  private source: string

  constructor(
    projectId: string, 
    targetVersionId: string, 
    userId: string, 
    source: string = 'version_history'
  ) {
    this.startTime = Date.now()
    this.projectId = projectId
    this.targetVersionId = targetVersionId
    this.userId = userId
    this.source = source

    // Track click event
    trackVersionEvent('rollback_clicked', {
      projectId,
      versionId: targetVersionId,
      userId,
      source
    })
  }

  /**
   * Track successful rollback completion
   */
  success(rollbackVersionId: string, additionalData?: Record<string, any>): void {
    const duration = Date.now() - this.startTime

    trackVersionEvent('rollback_success', {
      projectId: this.projectId,
      versionId: rollbackVersionId,
      userId: this.userId,
      source: this.source,
      operationDuration: duration,
      context: {
        targetVersionId: this.targetVersionId,
        ...additionalData
      }
    })
  }

  /**
   * Track rollback error with detailed error information
   */
  error(error: any, retryCount: number = 0): void {
    const duration = Date.now() - this.startTime

    trackVersionEvent('rollback_error', {
      projectId: this.projectId,
      versionId: this.targetVersionId,
      userId: this.userId,
      source: this.source,
      operationDuration: duration,
      errorCode: error.code || error.status?.toString(),
      errorMessage: error.message,
      retryCount,
      context: {
        errorType: error.constructor.name
      }
    })
  }
}

/**
 * Track version history interactions
 */
export function trackVersionHistoryEvent(
  action: 'opened' | 'version_clicked' | 'preview_clicked' | 'rollback_clicked',
  projectId: string,
  versionId?: string,
  source: string = 'status_bar'
): void {
  trackVersionEvent('version_history_opened', {
    projectId,
    versionId,
    source,
    context: { action }
  })
}

/**
 * Track domain management events
 */
export function trackDomainEvent(
  action: 'added' | 'verified' | 'failed',
  projectId: string,
  domain: string,
  domainType: 'sheenapps' | 'custom'
): void {
  if (action === 'added') {
    trackVersionEvent('domain_added', {
      projectId,
      context: { domain, domainType }
    })
  } else if (action === 'verified') {
    trackVersionEvent('domain_verification_completed', {
      projectId,
      context: { domain, domainType, success: true }
    })
  }
}

/**
 * Helper for first-user experience tracking
 */
export function isFirstProject(userId: string): boolean {
  if (typeof window === 'undefined') return false
  
  const key = `first-project-${userId}`
  const isFirst = !localStorage.getItem(key)
  
  if (isFirst) {
    localStorage.setItem(key, 'true')
  }
  
  return isFirst
}

/**
 * Get user-friendly error codes for analytics
 */
export function getAnalyticsErrorCode(error: any): string {
  if (error.code) return error.code
  if (error.status === 402) return 'insufficient_balance'
  if (error.status === 429) return 'rate_limited'
  if (error.status === 409) return 'already_processing'
  if (error.status >= 500) return 'server_error'
  if (error.status >= 400) return 'client_error'
  return 'unknown_error'
}