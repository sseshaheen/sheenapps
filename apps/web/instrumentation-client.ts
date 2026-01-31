import * as Sentry from '@sentry/nextjs'

// Export required Sentry hooks
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

// Only initialize Sentry in production to avoid development noise
// To test in development, set NEXT_PUBLIC_ENABLE_SENTRY_DEV=true
const isProduction = process.env.NODE_ENV === 'production'
const enableInDev = process.env.NEXT_PUBLIC_ENABLE_SENTRY_DEV === 'true'

if (isProduction || enableInDev) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',

    // Performance Monitoring
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE 
      ? parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE)
      : process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Error sampling for quota control
    sampleRate: process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE
      ? parseFloat(process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE)
      : 1.0,

    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    // Global tags configuration
    initialScope: {
      tags: {
        env: process.env.NODE_ENV,
        region: process.env.NEXT_PUBLIC_REGION || 'default',
        version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      },
    },

    // Integrations
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        // Mask sensitive selectors
        mask: ['.payment-form', '[data-sensitive]'],
      }),
    ],

    // Filtering
    beforeSend(event, hint) {
      // Filter out user identification in production
      if (process.env.NODE_ENV === 'production') {
        if (event.user) {
          event.user = {
            id: event.user.id ? `user_${String(event.user.id).slice(0, 8)}` : undefined,
          }
        }
      }

      // Skip known development/build errors
      if (event.exception) {
        const error = hint.originalException
        if (error instanceof Error) {
          // Skip HMR-related errors
          if (error.message.includes('ChunkLoadError') ||
              error.message.includes('Loading chunk') ||
              error.message.includes('Loading CSS chunk')) {
            return null
          }
          
          // Skip hydration mismatches in development
          if (process.env.NODE_ENV === 'development' && 
              error.message.includes('Hydration')) {
            return null
          }
        }
      }

      return event
    },

    // Client-specific error filtering
    ignoreErrors: [
      // Browser extension errors
      'Non-Error promise rejection captured',
      'ResizeObserver loop limit exceeded',
      'Script error.',
      'ChunkLoadError',
      
      // Network-related errors that are user environment issues
      'NetworkError',
      'Failed to fetch',
      'Load failed',
    ]
  })
}

/**
 * 📊 PostHog Analytics Initialization
 * Expert-recommended configuration with dev/prod host switching and gated debug logs
 */
import posthog from 'posthog-js'

// Analytics debug gating - only when localStorage flag is set
export const ANALYTICS_DEBUG = typeof window !== 'undefined' && localStorage.getItem('ph_debug') === '1'

// Only initialize in browser environment
if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const IS_DEV = process.env.NODE_ENV !== 'production'
  const POSTHOG_HOST = IS_DEV ? 'https://eu.i.posthog.com' : '/api/posthog'

  // Make analytics gate authoritative
  const ANALYTICS_ENABLED = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'

  // SECURITY: Check if current route should exclude analytics
  // Also excludes /builder due to heavy DOM churn causing Clarity 64KB buffer overflow
  const shouldExcludeAnalytics = (pathname: string): boolean => {
    return pathname.startsWith('/admin') ||
           pathname.startsWith('/admin-login') ||
           pathname.startsWith('/api/admin') ||
           pathname.startsWith('/builder')
  }

  const currentPath = window.location.pathname
  const isExcluded = shouldExcludeAnalytics(currentPath)

  if (posthogKey && (ANALYTICS_ENABLED || IS_DEV) && !isExcluded) {
    posthog.init(posthogKey, {
      api_host: POSTHOG_HOST, // Direct host in dev, proxy in prod
      
      // Privacy-first configuration (aligned with existing analytics config)
      capture_pageview: false, // We'll handle this manually like GA4
      capture_pageleave: true,
      
      // Prevent hydration mismatches (fix for React Error #418)
      disable_external_dependency_loading: true, // Prevents remote script injection during SSR
      
      // Respect user privacy
      respect_dnt: true,
      opt_out_capturing_by_default: false, // We'll control this via analytics config
      
      // Performance optimizations
      loaded: (posthog) => {
        if (ANALYTICS_DEBUG) {
          console.log('📊 PostHog initialized successfully')
        }
        posthog.debug(ANALYTICS_DEBUG) // Only debug when flag is set
      },
      
      // Session recording - disabled by default for privacy
      disable_session_recording: true,
      
      // Advanced privacy controls
      property_blacklist: [
        // Block sensitive data
        '$password',
        '$email', // We'll explicitly send when needed
        '$credit_card',
        '$social_security_number'
      ],
      
      // Cross-domain tracking
      cross_subdomain_cookie: false,
      
      // Persistence configuration
      persistence: 'localStorage', // Use localStorage instead of cookies for better control
      
      // Custom person properties
      person_profiles: 'identified_only', // Only create profiles for identified users
      
      // Feature flags
      bootstrap: {
        // We can pre-load feature flags here if needed
      }
    })
    
    // Global error handler for PostHog
    posthog.onFeatureFlags((flags) => {
      if (ANALYTICS_DEBUG) {
        console.log('🚩 PostHog feature flags loaded:', flags)
      }
    })
  } else {
    if (ANALYTICS_DEBUG) {
      if (isExcluded) {
        console.log('🔒 PostHog: Disabled for admin route', { pathname: currentPath })
      } else {
        console.warn('⚠️ PostHog not initialized - missing environment variables')
      }
    }
  }
}

export { posthog }

/**
 * 📊 Microsoft Clarity Analytics Initialization
 * Privacy-first configuration with session recordings and heatmaps
 * SECURITY: Automatically disabled on admin routes to protect sensitive data
 */
import clarity from '@microsoft/clarity'

// Only initialize in browser environment
if (typeof window !== 'undefined') {
  const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
  const clarityEnabled = process.env.NEXT_PUBLIC_ENABLE_CLARITY === 'true'
  const IS_DEV = process.env.NODE_ENV !== 'production'

  // SECURITY: Check if current route should exclude analytics
  // Also excludes /builder due to heavy DOM churn causing Clarity 64KB buffer overflow
  const shouldExcludeClarityAnalytics = (pathname: string): boolean => {
    return pathname.startsWith('/admin') ||
           pathname.startsWith('/admin-login') ||
           pathname.startsWith('/api/admin') ||
           pathname.startsWith('/builder')
  }

  const currentPath = window.location.pathname
  const isExcluded = shouldExcludeClarityAnalytics(currentPath)

  // Skip Clarity entirely in development unless explicitly forced
  const forceInDev = process.env.NEXT_PUBLIC_FORCE_CLARITY_DEV === 'true'

  if (clarityProjectId && clarityEnabled && !isExcluded && (!IS_DEV || forceInDev)) {
    // Initialize Clarity with project ID only (configuration is done via dashboard)
    clarity.init(clarityProjectId)
    
    if (ANALYTICS_DEBUG) {
      console.log('📊 Microsoft Clarity initialized successfully')
      console.log('🎥 Session recordings:', process.env.NEXT_PUBLIC_CLARITY_ENABLE_RECORDINGS !== 'false' ? 'enabled' : 'disabled')
    }
    
    // Set custom tags for session segmentation
    if (window.clarity) {
      // Add locale information for multi-locale tracking
      const locale = window.location.pathname.split('/')[1] || 'en'
      window.clarity('set', 'locale', locale)
      
      // Add page type classification
      const pageType = getPageTypeForClarity(window.location.pathname)
      window.clarity('set', 'page_type', pageType)
      
      if (ANALYTICS_DEBUG) {
        console.log('📊 Clarity custom tags set:', { locale, pageType })
      }
    }
  } else {
    if (ANALYTICS_DEBUG) {
      if (isExcluded) {
        console.log('🔒 Microsoft Clarity: Disabled for admin route', { pathname: currentPath })
      } else if (IS_DEV && !forceInDev) {
        console.log('🔒 Microsoft Clarity: Disabled in development (set NEXT_PUBLIC_FORCE_CLARITY_DEV=true to enable)')
      } else {
        console.warn('⚠️ Microsoft Clarity not initialized - missing project ID or disabled')
      }
    }
  }
}

/**
 * Helper function to classify page types for Clarity session segmentation
 */
function getPageTypeForClarity(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'marketing'
  if (pathname.startsWith('/auth/')) return 'auth'
  if (pathname.startsWith('/dashboard/')) return 'dashboard'
  if (pathname.startsWith('/builder/')) return 'builder'
  if (pathname.startsWith('/admin/')) return 'admin'
  
  return 'marketing'
}

// Global type declaration for Clarity
declare global {
  interface Window {
    clarity: (command: string, ...args: any[]) => void
  }
}