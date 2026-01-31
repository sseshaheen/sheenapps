// TypeScript models for Clean Build Events API
// Single source of truth for all build event types

// 🆕 NEW: Structured Error Handling (Worker Team Implementation)
export interface StructuredError {
  code: string                          // Stable error code (AI_LIMIT_REACHED, NETWORK_TIMEOUT, etc.)
  params?: Record<string, any>          // Context parameters (resetTime, provider, etc.)
  message?: string                      // User-friendly message (optional)
}

export interface CleanBuildEvent {
  id: string
  build_id: string
  event_type: 'started' | 'progress' | 'completed' | 'failed' | 'deploy_completed' | string
  phase: 'setup' | 'development' | 'dependencies' | 'build' | 'deploy' | 'metadata' | string
  title?: string              // Legacy fallback (English) - may be empty when event_code is present
  description?: string
  overall_progress: number
  finished: boolean
  preview_url?: string
  
  // 🔄 ERROR HANDLING: New structured errors (preferred) + legacy fallback
  error?: StructuredError              // NEW: Use this for structured error handling
  error_message?: string               // DEPRECATED: Keep for backward compatibility
  
  step_index?: number
  total_steps?: number
  created_at: string
  duration_seconds?: number
  event_code?: string     // For specific event types like BUILD_RECOMMENDATIONS_GENERATED
  event_params?: Record<string, string | number | boolean | null>  // i18n interpolation params

  // ✅ NEW: Version information (worker team integration)
  versionId?: string      // "01J123ABC456DEF789GHI012" (ULID, available immediately)
  versionName?: string    // "1.2.3" (available after AI classification, 30s-2min)
}

export interface CleanBuildApiResponse {
  buildId: string
  events: CleanBuildEvent[]
  lastEventId: number
}

export interface BuildStatus {
  buildId: string
  status: 'starting' | 'developing' | 'installing' | 'building' | 'deploying' | 'completed' | 'failed'
  progress: number // 0-100 percentage
  previewUrl: string | null
  error: string | null
  currentPhase: string | null
  finished: boolean
  eventCount: number
  lastUpdate: string | null
}

// Enhanced hook return type (as per expert feedback)
export interface CleanBuildEventsReturn {
  events: CleanBuildEvent[]
  isComplete: boolean
  currentProgress: number
  previewUrl: string | null
  stepIndex?: number
  totalSteps?: number
  currentPhase?: string
  hasRecommendationsGenerated?: boolean
  hasDeployCompleted?: boolean // Indicates deploy phase is done (preview ready)
  error: Error | null
  isLoading: boolean
}