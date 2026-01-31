/**
 * Analytics Configuration - Admin Panel Ready
 * Expert-optimized settings with environment-based disabling
 */

import { FEATURE_FLAGS } from './feature-flags'
import { getAnalyticsEnvironment, isAnalyticsEnabledForProvider, type AnalyticsEnvironment } from './analytics-environment'

// Get environment detection results
export const analyticsEnvironment: AnalyticsEnvironment = getAnalyticsEnvironment()

// Admin-configurable analytics settings
export const analyticsConfig = {
  // Environment-aware enablement (CRITICAL: Prevents dev data pollution)
  enableUserTracking: FEATURE_FLAGS.ENABLE_DASHBOARD_ANALYTICS && analyticsEnvironment.shouldEnableAnalytics,
  
  // Environment information for debugging
  environment: analyticsEnvironment,
  
  // Privacy settings (admin configurable)
  anonymizeUserIds: FEATURE_FLAGS.ANONYMIZE_USER_IDS,
  dataRetentionDays: parseInt(process.env.NEXT_PUBLIC_ANALYTICS_RETENTION_DAYS || '30', 10),
  
  // Performance settings (expert recommendations)
  searchDebounceMs: parseInt(process.env.NEXT_PUBLIC_SEARCH_DEBOUNCE_MS || '250', 10), // Expert: 250ms
  eventSamplingRate: parseInt(process.env.NEXT_PUBLIC_EVENT_SAMPLING_RATE || '100', 10), // 1-100%
  enableRealTimeEvents: process.env.NEXT_PUBLIC_ENABLE_REALTIME_EVENTS !== 'false',
  
  // Feature toggles (admin panel ready)
  trackProjectActions: FEATURE_FLAGS.ENABLE_PROJECT_ACTION_TRACKING,
  trackSearchBehavior: FEATURE_FLAGS.ENABLE_SEARCH_ANALYTICS,
  trackErrorEvents: FEATURE_FLAGS.ENABLE_DASHBOARD_ANALYTICS,
  enableUndoTracking: FEATURE_FLAGS.ENABLE_DASHBOARD_ANALYTICS, // Expert suggestion
  
  // Performance thresholds
  slowOperationThresholdMs: parseInt(process.env.NEXT_PUBLIC_SLOW_OPERATION_MS || '1000', 10),
  batchEventSize: parseInt(process.env.NEXT_PUBLIC_BATCH_EVENT_SIZE || '10', 10),
  flushIntervalMs: parseInt(process.env.NEXT_PUBLIC_FLUSH_INTERVAL_MS || '5000', 10),
  
  // Error handling
  maxErrorsPerMinute: parseInt(process.env.NEXT_PUBLIC_MAX_ERRORS_PER_MINUTE || '10', 10),
  enableErrorGrouping: process.env.NEXT_PUBLIC_ENABLE_ERROR_GROUPING !== 'false',
  
  // Undo system (expert enhancement)
  undoTimeoutMs: parseInt(process.env.NEXT_PUBLIC_UNDO_TIMEOUT_MS || '10000', 10), // 10 second undo window
  maxUndoActions: parseInt(process.env.NEXT_PUBLIC_MAX_UNDO_ACTIONS || '10', 10),
} as const

// Admin-configurable event sampling
export function shouldSampleEvent(eventType: string, userId?: string): boolean {
  if (analyticsConfig.eventSamplingRate >= 100) return true
  if (analyticsConfig.eventSamplingRate <= 0) return false
  
  // Simple hash-based sampling (consistent per user)
  const hash = (userId || eventType).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return (hash % 100) < analyticsConfig.eventSamplingRate
}

// User ID anonymization (expert privacy control)
export function anonymizeUserId(userId: string): string {
  if (!analyticsConfig.anonymizeUserIds) return userId
  
  // Simple hash for anonymization (production should use crypto.subtle)
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `anon_${Math.abs(hash).toString(36)}`
}

// Event processing pipeline (expert pattern)
export function processEventForAnalytics(event: any): any {
  // Apply sampling
  if (!shouldSampleEvent(event.type, event.userId)) {
    return null // Event filtered out
  }
  
  // Apply privacy controls
  const processedEvent = { ...event }
  if (processedEvent.userId) {
    processedEvent.userId = anonymizeUserId(processedEvent.userId)
  }
  
  // Add analytics metadata
  processedEvent._analytics = {
    sampled: true,
    anonymized: analyticsConfig.anonymizeUserIds,
    processedAt: Date.now(),
    version: '1.0'
  }
  
  return processedEvent
}

// Validation helpers for admin panel
export function validateAnalyticsConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (analyticsConfig.searchDebounceMs < 100) {
    errors.push('Search debounce should be at least 100ms to prevent spam')
  }
  
  if (analyticsConfig.eventSamplingRate < 1 || analyticsConfig.eventSamplingRate > 100) {
    errors.push('Event sampling rate must be between 1-100%')
  }
  
  if (analyticsConfig.dataRetentionDays < 1) {
    errors.push('Data retention must be at least 1 day')
  }
  
  if (analyticsConfig.undoTimeoutMs < 1000) {
    errors.push('Undo timeout should be at least 1 second')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Admin panel integration helpers
export const adminHelpers = {
  // Get current config for admin display
  getCurrentConfig() {
    return {
      ...analyticsConfig,
      _validation: validateAnalyticsConfig()
    }
  },
  
  // Preview config changes (for admin panel)
  previewConfigChange(changes: Partial<typeof analyticsConfig>) {
    const previewConfig = { ...analyticsConfig, ...changes }
    return {
      config: previewConfig,
      validation: validateAnalyticsConfig()
    }
  },
  
  // Get analytics stats (for admin dashboard)
  getAnalyticsStats() {
    return {
      samplingRate: analyticsConfig.eventSamplingRate,
      privacyEnabled: analyticsConfig.anonymizeUserIds,
      trackingEnabled: analyticsConfig.enableUserTracking,
      configuredAt: Date.now()
    }
  }
}

// GA4 Integration
export const ga4Config = {
  measurementId: process.env.NEXT_PUBLIC_GA_ID || '',
  enabled: process.env.NEXT_PUBLIC_ENABLE_GA === 'true' && 
           isAnalyticsEnabledForProvider('ga4', analyticsEnvironment),
  debugMode: analyticsEnvironment.type === 'development',
  environment: analyticsEnvironment.type,
  
  // GA4 recommended events mapping
  eventMapping: {
    'user_signup': 'sign_up',
    'user_login': 'login',
    'plan_upgrade': 'purchase',
    'trial_started': 'begin_checkout',
    'project_created': 'generate_lead',
    'project_viewed': 'view_item',
    'builder_opened': 'select_content',
    'feature_used': 'select_content'
  } as const
}

// PostHog Integration
export const posthogConfig = {
  projectKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || '',
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST || '',
  enabled: !!process.env.NEXT_PUBLIC_POSTHOG_KEY && 
           isAnalyticsEnabledForProvider('posthog', analyticsEnvironment),
  debugMode: analyticsEnvironment.type === 'development',
  environment: analyticsEnvironment.type,
  
  // PostHog-specific settings
  sessionRecording: false, // Disabled for privacy by default
  featureFlags: true,
  
  // Event mapping for consistency with GA4
  eventMapping: {
    'user_signup': 'signed_up',
    'user_login': 'logged_in', 
    'plan_upgrade': 'plan_upgraded',
    'trial_started': 'trial_started',
    'project_created': 'project_created',
    'project_viewed': 'project_viewed',
    'builder_opened': 'builder_opened',
    'feature_used': 'feature_used'
  } as const,
  
  // Property mappings for consistent naming
  propertyMapping: {
    'locale': '$locale',
    'pageType': '$page_type', 
    'userPlan': '$user_plan',
    'projectId': '$project_id'
  } as const
}

// Enhanced event processing for GA4
export function processGA4Event(eventType: string, eventData: any): { 
  eventName: string, 
  parameters: Record<string, any> 
} | null {
  // Apply existing privacy processing
  const processedEvent = processEventForAnalytics({
    type: eventType,
    ...eventData
  })
  
  // Skip if filtered by sampling
  if (!processedEvent) return null
  
  // Map to GA4 recommended event names
  const eventName = ga4Config.eventMapping[eventType as keyof typeof ga4Config.eventMapping] || eventType
  
  // Clean parameters for GA4
  const parameters: Record<string, any> = {}
  
  // Standard GA4 parameters
  if (processedEvent.locale) parameters.locale = processedEvent.locale
  if (processedEvent.pageType) parameters.page_type = processedEvent.pageType
  if (processedEvent.userPlan) parameters.user_plan = processedEvent.userPlan
  if (processedEvent.projectId) parameters.item_id = processedEvent.projectId
  if (processedEvent.value) parameters.value = processedEvent.value
  
  return { eventName, parameters }
}

// Enhanced event processing for PostHog
export function processPostHogEvent(eventType: string, eventData: any): {
  eventName: string,
  properties: Record<string, any>
} | null {
  // Apply existing privacy processing
  const processedEvent = processEventForAnalytics({
    type: eventType,
    ...eventData
  })
  
  // Skip if filtered by sampling
  if (!processedEvent) return null
  
  // Map to PostHog event names
  const eventName = posthogConfig.eventMapping[eventType as keyof typeof posthogConfig.eventMapping] || eventType
  
  // Clean properties for PostHog
  const properties: Record<string, any> = {}
  
  // Map standard properties using PostHog naming conventions
  if (processedEvent.locale) properties.$locale = processedEvent.locale
  if (processedEvent.pageType) properties.$page_type = processedEvent.pageType
  if (processedEvent.userPlan) properties.$user_plan = processedEvent.userPlan
  if (processedEvent.projectId) properties.$project_id = processedEvent.projectId
  
  // Additional PostHog-specific properties
  if (processedEvent.value) properties.value = processedEvent.value
  if (processedEvent.currency) properties.currency = processedEvent.currency
  
  // Add processing metadata
  properties.$analytics_version = '1.0'
  properties.$processed_at = Date.now()
  
  return { eventName, properties }
}

// Microsoft Clarity Integration
export const clarityConfig = {
  projectId: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || '',
  enabled: !!process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID && 
           process.env.NEXT_PUBLIC_ENABLE_CLARITY === 'true' && 
           isAnalyticsEnabledForProvider('clarity', analyticsEnvironment),
  enableRecordings: process.env.NEXT_PUBLIC_CLARITY_ENABLE_RECORDINGS !== 'false', // Default true
  debugMode: analyticsEnvironment.type === 'development',
  environment: analyticsEnvironment.type,
  
  // Privacy settings aligned with existing system
  maskSensitiveElements: true,
  respectDNT: true,
  sampleRate: 1.0, // 100% sampling as requested
  
  // Event mapping for consistency with GA4/PostHog
  eventMapping: {
    'user_signup': 'user_signup',
    'user_login': 'user_login',
    'plan_upgrade': 'plan_upgrade', 
    'project_created': 'project_created',
    'project_viewed': 'project_viewed',
    'builder_opened': 'builder_opened',
    'feature_used': 'feature_used'
  } as const,
  
  // Custom tags for session segmentation
  customTags: {
    'locale': 'user_locale',
    'pageType': 'page_type',
    'userPlan': 'user_plan'
  } as const
}

// Enhanced event processing for Microsoft Clarity
export function processClarityEvent(eventType: string, eventData: any): {
  name: string,
  data: Record<string, any>
} | null {
  // Apply existing privacy processing
  const processedEvent = processEventForAnalytics({
    type: eventType,
    ...eventData
  })
  
  // Skip if filtered by sampling
  if (!processedEvent) return null
  
  // Map to Clarity event names
  const eventName = clarityConfig.eventMapping[eventType as keyof typeof clarityConfig.eventMapping] || eventType
  
  // Clean data for Clarity (keep it simple - Clarity prefers lightweight events)
  const data: Record<string, any> = {}
  
  // Essential properties only
  if (processedEvent.locale) data.locale = processedEvent.locale
  if (processedEvent.pageType) data.page_type = processedEvent.pageType
  if (processedEvent.userPlan) data.user_plan = processedEvent.userPlan
  if (processedEvent.value) data.value = processedEvent.value
  
  return { name: eventName, data }
}

// Unified analytics function - sends to GA4, PostHog, and Clarity
export function sendToAllAnalytics(eventType: string, eventData: any = {}) {
  // Send to GA4
  if (ga4Config.enabled) {
    const ga4Event = processGA4Event(eventType, eventData)
    if (ga4Event && typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', ga4Event.eventName, ga4Event.parameters)
    }
  }
  
  // Send to PostHog
  if (posthogConfig.enabled) {
    const posthogEvent = processPostHogEvent(eventType, eventData)
    if (posthogEvent) {
      // Import PostHog dynamically to avoid SSR issues
      import('posthog-js').then(({ default: posthog }) => {
        if (posthog.__loaded) {
          posthog.capture(posthogEvent.eventName, posthogEvent.properties)
        }
      }).catch(console.warn)
    }
  }
  
  // Send to Microsoft Clarity
  if (clarityConfig.enabled) {
    const clarityEvent = processClarityEvent(eventType, eventData)
    if (clarityEvent && typeof window !== 'undefined' && (window as any).clarity) {
      try {
        ;(window as any).clarity('event', clarityEvent.name, clarityEvent.data)
      } catch (error) {
        console.warn('Clarity event failed:', error)
      }
    }
  }
}

// Development helpers with environment awareness
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).analyticsConfig = analyticsConfig
  ;(window as any).ga4Config = ga4Config
  ;(window as any).posthogConfig = posthogConfig
  ;(window as any).clarityConfig = clarityConfig
  ;(window as any).sendToAllAnalytics = sendToAllAnalytics
  ;(window as any).adminHelpers = adminHelpers
  
  console.group('📊 Analytics Configuration')
  console.log('🌍 Environment Detection:', {
    type: analyticsEnvironment.type,
    shouldEnableAnalytics: analyticsEnvironment.shouldEnableAnalytics,
    reason: analyticsEnvironment.reason,
    hostname: analyticsEnvironment.hostname
  })
  console.log('🔒 Privacy Controls:', {
    anonymizeUserIds: analyticsConfig.anonymizeUserIds,
    dataRetentionDays: analyticsConfig.dataRetentionDays,
    enableUserTracking: analyticsConfig.enableUserTracking
  })
  console.log('⚡ Performance Settings:', {
    searchDebounceMs: analyticsConfig.searchDebounceMs,
    eventSamplingRate: analyticsConfig.eventSamplingRate
  })
  console.log('🚩 Feature Toggles:', {
    trackProjectActions: analyticsConfig.trackProjectActions,
    trackSearchBehavior: analyticsConfig.trackSearchBehavior,
    enableUndoTracking: analyticsConfig.enableUndoTracking
  })
  console.log('📊 Analytics Providers:', {
    ga4: ga4Config.enabled ? '✅ Enabled' : '❌ Disabled',
    posthog: posthogConfig.enabled ? '✅ Enabled' : '❌ Disabled',
    clarity: clarityConfig.enabled ? '✅ Enabled' : '❌ Disabled',
    measurementId: ga4Config.measurementId ? '✅ Configured' : '❌ Missing',
    posthogKey: posthogConfig.projectKey ? '✅ Configured' : '❌ Missing',
    clarityProjectId: clarityConfig.projectId ? '✅ Configured' : '❌ Missing'
  })
  
  // Show data protection status
  if (!analyticsEnvironment.shouldEnableAnalytics) {
    console.log('🛡️ DATA PROTECTION: Development data pollution prevented!')
    console.log('💡 To test analytics: Add NEXT_PUBLIC_FORCE_ANALYTICS=true to .env.local')
  }
  
  console.groupEnd()
  
  // Validate configuration
  const validation = validateAnalyticsConfig()
  if (!validation.isValid) {
    console.warn('⚠️ Analytics Configuration Issues:')
    validation.errors.forEach(error => console.warn(`  - ${error}`))
  }
}