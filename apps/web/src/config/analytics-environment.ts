/**
 * 🌍 Analytics Environment Detection
 * Robust environment detection to prevent dev data pollution in production analytics
 */

export type EnvironmentType = 
  | 'development'    // localhost, NODE_ENV=development
  | 'staging'        // preview deployments, testing domains
  | 'production'     // live production domain

export interface AnalyticsEnvironment {
  type: EnvironmentType
  shouldEnableAnalytics: boolean
  reason: string
  hostname?: string
}

/**
 * Core environment detection function with multi-layer fallbacks
 */
export function getAnalyticsEnvironment(): AnalyticsEnvironment {
  // Layer 1: Force overrides (highest priority)
  if (process.env.NEXT_PUBLIC_FORCE_ANALYTICS === 'true') {
    return { 
      type: 'development', 
      shouldEnableAnalytics: true, 
      reason: 'FORCE_ANALYTICS override enabled' 
    }
  }
  
  if (process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === 'true') {
    return { 
      type: 'production', 
      shouldEnableAnalytics: false, 
      reason: 'DISABLE_ANALYTICS override enabled' 
    }
  }
  
  // Layer 2: NODE_ENV detection (build-time)
  if (process.env.NODE_ENV === 'development') {
    return { 
      type: 'development', 
      shouldEnableAnalytics: false, 
      reason: 'NODE_ENV=development detected' 
    }
  }
  
  // Layer 3: Client-side hostname detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    
    // Localhost detection (catches production builds on localhost)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return { 
        type: 'development', 
        shouldEnableAnalytics: false, 
        reason: 'localhost hostname detected',
        hostname 
      }
    }
    
    // Production domain whitelist
    const PRODUCTION_DOMAINS = [
      'sheenapps.com', 
      'www.sheenapps.com',
      ...(process.env.NEXT_PUBLIC_PRODUCTION_DOMAINS?.split(',') || [])
    ]
    
    if (PRODUCTION_DOMAINS.includes(hostname)) {
      return { 
        type: 'production', 
        shouldEnableAnalytics: true, 
        reason: 'production domain confirmed',
        hostname 
      }
    }
    
    // Staging/preview detection patterns
    if (hostname.includes('.vercel.app') || 
        hostname.includes('preview') || 
        hostname.includes('staging') ||
        hostname.includes('dev.') ||
        hostname.includes('test.')) {
      return { 
        type: 'staging', 
        shouldEnableAnalytics: false, 
        reason: 'staging/preview domain detected',
        hostname 
      }
    }
    
    // Unknown domain - disable analytics for safety
    return { 
      type: 'staging', 
      shouldEnableAnalytics: false, 
      reason: 'unknown domain - analytics disabled for safety',
      hostname 
    }
  }
  
  // Layer 4: SSR fallback (server-side rendering)
  // In SSR, we can't access window.location, so we use conservative defaults
  
  // If we have a production override, respect it
  if (process.env.NEXT_PUBLIC_SIMULATE_PRODUCTION === 'true') {
    return { 
      type: 'production', 
      shouldEnableAnalytics: true, 
      reason: 'SIMULATE_PRODUCTION override (SSR)' 
    }
  }
  
  // Conservative SSR default - disable analytics until client-side detection
  return { 
    type: 'development', 
    shouldEnableAnalytics: false, 
    reason: 'SSR fallback - awaiting client-side hostname detection' 
  }
}

/**
 * Server-safe environment detection (for SSR)
 */
export function getServerSideAnalyticsState(): AnalyticsEnvironment {
  // Only use server-detectable factors
  if (process.env.NEXT_PUBLIC_FORCE_ANALYTICS === 'true') {
    return { 
      type: 'development', 
      shouldEnableAnalytics: true, 
      reason: 'FORCE_ANALYTICS override (server)' 
    }
  }
  
  if (process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === 'true') {
    return { 
      type: 'production', 
      shouldEnableAnalytics: false, 
      reason: 'DISABLE_ANALYTICS override (server)' 
    }
  }
  
  if (process.env.NODE_ENV === 'development') {
    return { 
      type: 'development', 
      shouldEnableAnalytics: false, 
      reason: 'NODE_ENV=development (server)' 
    }
  }
  
  // Conservative server default
  return { 
    type: 'development', 
    shouldEnableAnalytics: false, 
    reason: 'conservative server default - awaiting client detection' 
  }
}

/**
 * Check if analytics is enabled for a specific provider
 */
export function isAnalyticsEnabledForProvider(
  provider: 'ga4' | 'posthog' | 'clarity',
  environment?: AnalyticsEnvironment
): boolean {
  const env = environment || getAnalyticsEnvironment()
  
  // Global analytics disable
  if (!env.shouldEnableAnalytics) {
    return false
  }
  
  // Provider-specific overrides
  const providerOverrides = {
    ga4: process.env.NEXT_PUBLIC_FORCE_GA4 === 'true',
    posthog: process.env.NEXT_PUBLIC_FORCE_POSTHOG === 'true',
    clarity: process.env.NEXT_PUBLIC_FORCE_CLARITY === 'true'
  }
  
  // If there's a provider-specific override, use it regardless of global state
  if (providerOverrides[provider]) {
    return true
  }
  
  // Provider-specific disable
  const providerDisables = {
    ga4: process.env.NEXT_PUBLIC_DISABLE_GA4 === 'true',
    posthog: process.env.NEXT_PUBLIC_DISABLE_POSTHOG === 'true',
    clarity: process.env.NEXT_PUBLIC_DISABLE_CLARITY === 'true'
  }
  
  if (providerDisables[provider]) {
    return false
  }
  
  return env.shouldEnableAnalytics
}

/**
 * Development logging utility
 */
export function logAnalyticsEnvironment(environment: AnalyticsEnvironment): void {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    console.group('📊 Analytics Environment Detection')
    console.log('Environment Type:', environment.type)
    console.log('Analytics Enabled:', environment.shouldEnableAnalytics ? '✅ YES' : '❌ NO')
    console.log('Detection Reason:', environment.reason)
    if (environment.hostname) {
      console.log('Hostname:', environment.hostname)
    }
    
    // Provider-specific status
    console.log('Provider Status:', {
      GA4: isAnalyticsEnabledForProvider('ga4', environment) ? '✅ Enabled' : '❌ Disabled',
      PostHog: isAnalyticsEnabledForProvider('posthog', environment) ? '✅ Enabled' : '❌ Disabled',
      Clarity: isAnalyticsEnabledForProvider('clarity', environment) ? '✅ Enabled' : '❌ Disabled'
    })
    
    console.groupEnd()
  }
}

/**
 * Testing utilities (development/testing only)
 */
export const analyticsEnvironmentUtils = {
  getCurrentEnvironment: getAnalyticsEnvironment,
  
  forceEnable: () => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('🧪 Analytics force-enabled for testing. Add NEXT_PUBLIC_FORCE_ANALYTICS=true to .env.local for persistence.')
    }
  },
  
  testProviderStatus: () => {
    const env = getAnalyticsEnvironment()
    return {
      environment: env,
      ga4: isAnalyticsEnabledForProvider('ga4', env),
      posthog: isAnalyticsEnabledForProvider('posthog', env),
      clarity: isAnalyticsEnabledForProvider('clarity', env)
    }
  }
}

// Global development utilities
if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) {
  ;(window as any).analyticsEnvironment = analyticsEnvironmentUtils
  
  // Auto-log environment on load
  const environment = getAnalyticsEnvironment()
  logAnalyticsEnvironment(environment)
}