//src/config/feature-flags.ts
/**
 * Feature Flags - Expert requirement: Progressive rollout capability
 * Enables instant rollback of new features
 */

// Environment-based feature flags
export const FEATURE_FLAGS = {
  // Store migration flags
  ENABLE_NEW_STORE: process.env.NEXT_PUBLIC_ENABLE_NEW_STORE === 'true',
  ENABLE_PURE_HISTORY: process.env.NEXT_PUBLIC_ENABLE_PURE_HISTORY === 'true',

  // Preview system flags
  ENABLE_REACT_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_REACT_PREVIEW === 'true',
  ENABLE_IFRAME_FALLBACK: process.env.NEXT_PUBLIC_ENABLE_IFRAME_FALLBACK !== 'false', // Default true

  ENABLE_PIXEL_PERFECT_PREVIEW: false, // Disabled due to style isolation issues with Shadow DOM
  ENABLE_IFRAME_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_IFRAME_PREVIEW === 'true', // Secure iframe-based preview
  ENABLE_PROMPT_TO_CODE: process.env.NEXT_PUBLIC_ENABLE_PROMPT_TO_CODE === 'true', // Natural language code editing
  ENABLE_PREVIEW_V2: process.env.NEXT_PUBLIC_ENABLE_PREVIEW_V2 === 'true', // V2 preview system

  // Event system flags
  ENABLE_EVENT_SYSTEM: process.env.NEXT_PUBLIC_ENABLE_EVENT_SYSTEM === 'true',
  ENABLE_PERFORMANCE_MONITORING: process.env.NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITORING !== 'false', // Default true

  // Dashboard analytics flags (expert suggestions)
  ENABLE_DASHBOARD_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_DASHBOARD_ANALYTICS !== 'false', // Default true
  ENABLE_PROJECT_ACTION_TRACKING: process.env.NEXT_PUBLIC_ENABLE_PROJECT_ACTION_TRACKING !== 'false', // Default true
  ENABLE_SEARCH_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_SEARCH_ANALYTICS !== 'false', // Default true
  ANONYMIZE_USER_IDS: process.env.NEXT_PUBLIC_ANONYMIZE_USER_IDS === 'true', // Default false (expert privacy control)

  // Debug flags
  ENABLE_DEV_DASHBOARD: process.env.NEXT_PUBLIC_ENABLE_DEV_DASHBOARD !== 'false', // Default true in dev
  ENABLE_EVENT_LOGGING: process.env.NEXT_PUBLIC_ENABLE_EVENT_LOGGING !== 'false', // Default true in dev

  // Claude Worker flags
  ENABLE_CLAUDE_WORKER: process.env.NEXT_PUBLIC_ENABLE_CLAUDE_WORKER !== 'false', // Default true
  CLAUDE_WORKER_AS_DEFAULT: process.env.NEXT_PUBLIC_CLAUDE_WORKER_AS_DEFAULT !== 'false', // Default true for web design
  CLAUDE_WORKER_FOR_ALL_REQUESTS: process.env.NEXT_PUBLIC_CLAUDE_WORKER_FOR_ALL === 'true', // Default false - only for web design

  // GitHub sync flags
  ENABLE_GITHUB_SYNC: process.env.NEXT_PUBLIC_ENABLE_GITHUB_SYNC === 'true', // Default false - progressive rollout
  ENABLE_GITHUB_SYNC_UI: process.env.NEXT_PUBLIC_ENABLE_GITHUB_SYNC_UI === 'true', // Default false - UI components
  ENABLE_GITHUB_REALTIME: process.env.NEXT_PUBLIC_ENABLE_GITHUB_REALTIME === 'true', // Default false - real-time updates

  // Integration status flags (September 2025)
  ENABLE_INTEGRATION_STATUS_BAR: process.env.NEXT_PUBLIC_ENABLE_INTEGRATION_STATUS_BAR !== 'false', // Default true - production ready
  ENABLE_INTEGRATION_STATUS_SSE: process.env.NEXT_PUBLIC_ENABLE_INTEGRATION_STATUS_SSE !== 'false', // Default true - real-time updates
  ENABLE_INTEGRATION_ACTIONS: process.env.NEXT_PUBLIC_ENABLE_INTEGRATION_ACTIONS !== 'false', // Default true - quick actions

  // Easy Mode flags
  ENABLE_EASY_DEPLOY: process.env.NEXT_PUBLIC_ENABLE_EASY_DEPLOY !== 'false', // Default true

  // Admin panel flags
  ENABLE_MULTI_PROVIDER_PROMOTIONS: typeof window === 'undefined' 
    ? process.env.ENABLE_MULTI_PROVIDER_PROMOTIONS === 'true' // Server-only env
    : process.env.NEXT_PUBLIC_ENABLE_MULTI_PROVIDER_PROMOTIONS === 'true', // Client fallback
  
  // CRITICAL: Admin mock data fallback - defaults to false for safety
  // When false, admin endpoints will return errors instead of mock data
  ENABLE_ADMIN_MOCK_FALLBACK: process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true', // Server-only, defaults to false

  // Coming Soon / Maintenance Mode
  // When enabled, homepage shows a preview/waitlist version with disabled CTAs
  ENABLE_COMING_SOON_MODE: process.env.NEXT_PUBLIC_ENABLE_COMING_SOON_MODE === 'true',

  // Migration flags
  ENABLE_MIGRATION_MODE: process.env.NEXT_PUBLIC_ENABLE_MIGRATION_MODE === 'true',
  ENABLE_LEGACY_COMPATIBILITY: process.env.NEXT_PUBLIC_ENABLE_LEGACY_COMPATIBILITY !== 'false', // Default true

  // Plan Context flags (Code Explanation Context feature - Phase 2.3)
  // Shows which plan step relates to current file during code generation
  ENABLE_PLAN_CONTEXT: process.env.NEXT_PUBLIC_ENABLE_PLAN_CONTEXT !== 'false', // Default true (experimental)

  // Website migration system flags (September 2025)
  ENABLE_MIGRATION_SYSTEM: process.env.NEXT_PUBLIC_ENABLE_MIGRATION_SYSTEM === 'true',
  ENABLE_MIGRATION_SSE: process.env.NEXT_PUBLIC_ENABLE_MIGRATION_SSE !== 'false', // Default true when system enabled
  ENABLE_MIGRATION_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_MIGRATION_ANALYTICS === 'true',
  ENABLE_MIGRATION_ENTERPRISE: process.env.NEXT_PUBLIC_ENABLE_MIGRATION_ENTERPRISE === 'true',
  ENABLE_MIGRATION_BULK_OPS: process.env.NEXT_PUBLIC_ENABLE_MIGRATION_BULK_OPS === 'true',
  ENABLE_MIGRATION_DEBUG: process.env.NEXT_PUBLIC_ENABLE_MIGRATION_DEBUG === 'true',
  ENABLE_MIGRATION_SKIP_VERIFY: process.env.NODE_ENV === 'development', // Auto-enabled in dev
} as const

// Feature flag hook for components
export function useFeatureFlags() {
  return FEATURE_FLAGS
}

// Feature flag with user-specific overrides (for progressive rollout)
export async function getFeatureFlagsForUser(userId?: string): Promise<typeof FEATURE_FLAGS> {
  // Base flags from environment
  const baseFlags = { ...FEATURE_FLAGS }

  // User-specific overrides could come from API/database
  if (userId && process.env.NODE_ENV === 'development') {
    // Development overrides for testing
    const devOverrides = {
      // Internal team gets new features first
      ENABLE_NEW_STORE: true,
      ENABLE_EVENT_SYSTEM: true,
      ENABLE_DEV_DASHBOARD: true,
    }

    return { ...baseFlags, ...devOverrides }
  }

  return baseFlags
}

// Feature flag validation (ensures required flags are set correctly)
export function validateFeatureFlags(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  // Ensure new store is enabled if pure history is enabled
  if (FEATURE_FLAGS.ENABLE_PURE_HISTORY && !FEATURE_FLAGS.ENABLE_NEW_STORE) {
    errors.push('ENABLE_PURE_HISTORY requires ENABLE_NEW_STORE to be true')
  }

  // Ensure React preview has fallback available
  if (FEATURE_FLAGS.ENABLE_REACT_PREVIEW && !FEATURE_FLAGS.ENABLE_IFRAME_FALLBACK) {
    errors.push('ENABLE_REACT_PREVIEW should have ENABLE_IFRAME_FALLBACK as backup')
  }

  // Development warnings
  if (process.env.NODE_ENV === 'development') {
    if (!FEATURE_FLAGS.ENABLE_EVENT_LOGGING) {
      errors.push('Event logging should be enabled in development for debugging')
    }

    if (!FEATURE_FLAGS.ENABLE_PERFORMANCE_MONITORING) {
      errors.push('Performance monitoring should be enabled in development')
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

// Feature flag utilities
export const featureFlagUtils = {
  // Check if we're in migration mode (new + old systems running)
  isMigrationMode(): boolean {
    return FEATURE_FLAGS.ENABLE_MIGRATION_MODE ||
           (FEATURE_FLAGS.ENABLE_NEW_STORE && FEATURE_FLAGS.ENABLE_LEGACY_COMPATIBILITY)
  },

  // Check if new architecture is fully enabled
  isNewArchitectureFullyEnabled(): boolean {
    return FEATURE_FLAGS.ENABLE_NEW_STORE &&
           FEATURE_FLAGS.ENABLE_PURE_HISTORY &&
           FEATURE_FLAGS.ENABLE_EVENT_SYSTEM
  },

  // Get rollout percentage (for gradual rollout)
  getRolloutPercentage(): number {
    const percentage = process.env.NEXT_PUBLIC_ROLLOUT_PERCENTAGE
    return percentage ? parseInt(percentage, 10) : 100
  },

  // Check if user is in rollout group
  isUserInRollout(userId: string): boolean {
    const percentage = this.getRolloutPercentage()
    if (percentage >= 100) return true
    if (percentage <= 0) return false

    // Simple hash-based assignment (consistent per user)
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return (hash % 100) < percentage
  }
}

// Environment configuration helpers
export const envConfig = {
  // Development environment - Sprint 4 features ready for testing
  development: {
    NEXT_PUBLIC_ENABLE_NEW_STORE: 'true', // Re-enabled with store initialization fix
    NEXT_PUBLIC_ENABLE_PURE_HISTORY: 'false',
    NEXT_PUBLIC_ENABLE_REACT_PREVIEW: 'true', // Stable, 2-5x performance improvement
    NEXT_PUBLIC_ENABLE_EVENT_SYSTEM: 'true', // Tested and working
    NEXT_PUBLIC_ENABLE_DEV_DASHBOARD: 'true',
    NEXT_PUBLIC_ENABLE_EVENT_LOGGING: 'true',
    NEXT_PUBLIC_ENABLE_MIGRATION_MODE: 'true',
    NEXT_PUBLIC_ROLLOUT_PERCENTAGE: '100', // Full access in development
    // Dashboard analytics (expert optimized)
    NEXT_PUBLIC_ENABLE_DASHBOARD_ANALYTICS: 'true',
    NEXT_PUBLIC_ENABLE_PROJECT_ACTION_TRACKING: 'true',
    NEXT_PUBLIC_ENABLE_SEARCH_ANALYTICS: 'true',
    NEXT_PUBLIC_ANONYMIZE_USER_IDS: 'false', // Privacy off in dev for debugging
    // Claude Worker settings
    NEXT_PUBLIC_ENABLE_CLAUDE_WORKER: 'true',
    NEXT_PUBLIC_CLAUDE_WORKER_AS_DEFAULT: 'true',
    NEXT_PUBLIC_CLAUDE_WORKER_FOR_ALL: 'false', // Only for web design in dev
    // New preview features
    NEXT_PUBLIC_ENABLE_IFRAME_PREVIEW: 'true',
    NEXT_PUBLIC_ENABLE_PROMPT_TO_CODE: 'true',
    // GitHub sync features (development testing)
    NEXT_PUBLIC_ENABLE_GITHUB_SYNC: 'true',
    NEXT_PUBLIC_ENABLE_GITHUB_SYNC_UI: 'true',
    NEXT_PUBLIC_ENABLE_GITHUB_REALTIME: 'true',
    // Integration status features (development testing)
    NEXT_PUBLIC_ENABLE_INTEGRATION_STATUS_BAR: 'true',
    NEXT_PUBLIC_ENABLE_INTEGRATION_STATUS_SSE: 'true',
    NEXT_PUBLIC_ENABLE_INTEGRATION_ACTIONS: 'true',
    // Migration system features (development testing)
    NEXT_PUBLIC_ENABLE_MIGRATION_SYSTEM: 'true',
    NEXT_PUBLIC_ENABLE_MIGRATION_SSE: 'true',
    NEXT_PUBLIC_ENABLE_MIGRATION_ANALYTICS: 'true',
    NEXT_PUBLIC_ENABLE_MIGRATION_DEBUG: 'true'
  },

  // Testing environment - New architecture enabled
  testing: {
    NEXT_PUBLIC_ENABLE_NEW_STORE: 'true', // Infinite loop fixed
    NEXT_PUBLIC_ENABLE_PURE_HISTORY: 'true', // Pure data history working
    NEXT_PUBLIC_ENABLE_REACT_PREVIEW: 'true', // React preview active
    NEXT_PUBLIC_ENABLE_EVENT_SYSTEM: 'true', // Event system stable
    NEXT_PUBLIC_ENABLE_DEV_DASHBOARD: 'true', // Debug capabilities
    NEXT_PUBLIC_ROLLOUT_PERCENTAGE: '100' // Full new architecture
  },

  // Production environment - New architecture ready
  production: {
    NEXT_PUBLIC_ENABLE_NEW_STORE: 'true', // Store initialization working
    NEXT_PUBLIC_ENABLE_PURE_HISTORY: 'true', // Pure data operations
    NEXT_PUBLIC_ENABLE_REACT_PREVIEW: 'true', // 2-5x performance improvement
    NEXT_PUBLIC_ENABLE_EVENT_SYSTEM: 'true', // Event system stable
    NEXT_PUBLIC_ENABLE_DEV_DASHBOARD: 'false', // Disable in production
    NEXT_PUBLIC_ENABLE_EVENT_LOGGING: 'false', // Reduce noise in production
    NEXT_PUBLIC_ROLLOUT_PERCENTAGE: '100', // Full rollout
    // Dashboard analytics (expert optimized for production)
    NEXT_PUBLIC_ENABLE_DASHBOARD_ANALYTICS: 'true',
    NEXT_PUBLIC_ENABLE_PROJECT_ACTION_TRACKING: 'true',
    NEXT_PUBLIC_ENABLE_SEARCH_ANALYTICS: 'true',
    NEXT_PUBLIC_ANONYMIZE_USER_IDS: 'true', // Privacy on in production (expert suggestion)
    // Claude Worker settings
    NEXT_PUBLIC_ENABLE_CLAUDE_WORKER: 'true',
    NEXT_PUBLIC_CLAUDE_WORKER_AS_DEFAULT: 'true',
    NEXT_PUBLIC_CLAUDE_WORKER_FOR_ALL: 'false', // Only for web design in production
    // Migration system features (Phase 1: Basic migration only)
    NEXT_PUBLIC_ENABLE_MIGRATION_SYSTEM: 'true',
    NEXT_PUBLIC_ENABLE_MIGRATION_SSE: 'true',
    NEXT_PUBLIC_ENABLE_MIGRATION_ANALYTICS: 'false',  // Phase 2
    NEXT_PUBLIC_ENABLE_MIGRATION_ENTERPRISE: 'false', // Phase 3
    NEXT_PUBLIC_ENABLE_MIGRATION_DEBUG: 'false'
  },

  // Production rollout phases (uncomment when ready)
  // Phase 1: Event system only
  // NEXT_PUBLIC_ENABLE_EVENT_SYSTEM: 'true'
  // NEXT_PUBLIC_ROLLOUT_PERCENTAGE: '5'

  // Phase 2: Add React preview
  // NEXT_PUBLIC_ENABLE_REACT_PREVIEW: 'true'
  // NEXT_PUBLIC_ROLLOUT_PERCENTAGE: '15'

  // Phase 3: Full architecture (when store issue resolved)
  // NEXT_PUBLIC_ENABLE_NEW_STORE: 'true'
  // NEXT_PUBLIC_ENABLE_PURE_HISTORY: 'true'
  // NEXT_PUBLIC_ROLLOUT_PERCENTAGE: '50'
}

// Development helpers (browser only)
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // Global access for debugging
  ;(window as any).featureFlags = FEATURE_FLAGS
  ;(window as any).featureFlagUtils = featureFlagUtils

  // Log feature flag status
  console.group('🚩 Feature Flags Status')
  Object.entries(FEATURE_FLAGS).forEach(([key, value]) => {
    console.log(`${key}: ${value ? '✅' : '❌'}`)
  })
  console.groupEnd()

  // Validate flags
  const validation = validateFeatureFlags()
  if (!validation.isValid) {
    console.warn('⚠️ Feature Flag Validation Errors:')
    validation.errors.forEach(error => console.warn(`  - ${error}`))
  }
}
