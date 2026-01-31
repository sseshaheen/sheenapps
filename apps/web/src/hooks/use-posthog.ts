'use client'

/* eslint-disable no-restricted-globals */

/**
 * 📊 PostHog Integration Hooks
 * Privacy-first PostHog hooks that integrate with existing analytics system
 */

import { useEffect, useCallback } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { posthogConfig, sendToAllAnalytics } from '@/config/analytics-config'
import posthog from 'posthog-js'

/**
 * Main PostHog hook with privacy controls
 */
export function usePostHog() {
  const isEnabled = posthogConfig.enabled
  
  const capture = useCallback((eventName: string, properties?: Record<string, any>) => {
    if (!isEnabled) return
    
    // Use unified analytics function to respect privacy controls
    sendToAllAnalytics(eventName, properties)
  }, [isEnabled])
  
  const identify = useCallback((userId: string, properties?: Record<string, any>) => {
    if (!isEnabled || typeof window === 'undefined') return
    
    try {
      posthog.identify(userId, {
        // Apply privacy controls
        $set: {
          ...properties,
          // Don't include email directly for privacy
          $analytics_consent: true,
          $privacy_processed: true
        }
      })
    } catch (error) {
      console.warn('PostHog identify failed:', error)
    }
  }, [isEnabled])
  
  const reset = useCallback(() => {
    if (!isEnabled || typeof window === 'undefined') return
    
    try {
      posthog.reset()
    } catch (error) {
      console.warn('PostHog reset failed:', error)
    }
  }, [isEnabled])
  
  const setPersonProperties = useCallback((properties: Record<string, any>) => {
    if (!isEnabled || typeof window === 'undefined') return
    
    try {
      posthog.setPersonProperties(properties)
    } catch (error) {
      console.warn('PostHog setPersonProperties failed:', error)
    }
  }, [isEnabled])
  
  return {
    capture,
    identify,
    reset,
    setPersonProperties,
    isEnabled,
    isLoaded: typeof window !== 'undefined' && posthog.__loaded
  }
}

/**
 * PostHog page tracking with manual page views (like GA4)
 */
export function usePostHogPageTracking() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams()
  const locale = params.locale as string
  
  useEffect(() => {
    if (!posthogConfig.enabled || typeof window === 'undefined') return
    
    // Send page view using unified analytics function
    sendToAllAnalytics('page_view', {
      page_location: window.location.href,
      page_path: pathname,
      page_title: document.title,
      locale: locale || 'en',
      pageType: getPageType(pathname),
      timestamp: Date.now()
    })
    
    if (posthogConfig.debugMode) {
      console.log('📊 PostHog Page View:', {
        pathname,
        locale,
        pageType: getPageType(pathname)
      })
    }
  }, [pathname, searchParams, locale])
}

/**
 * PostHog feature flags hook
 */
export function usePostHogFeatureFlags() {
  const { isEnabled } = usePostHog()
  
  const getFeatureFlag = useCallback((key: string, defaultValue?: any) => {
    if (!isEnabled || typeof window === 'undefined') return defaultValue
    
    try {
      return posthog.getFeatureFlag(key) ?? defaultValue
    } catch (error) {
      console.warn('PostHog getFeatureFlag failed:', error)
      return defaultValue
    }
  }, [isEnabled])
  
  const isFeatureEnabled = useCallback((key: string) => {
    if (!isEnabled || typeof window === 'undefined') return false
    
    try {
      return posthog.isFeatureEnabled(key) ?? false
    } catch (error) {
      console.warn('PostHog isFeatureEnabled failed:', error)
      return false
    }
  }, [isEnabled])
  
  const onFeatureFlags = useCallback((callback: (flags: string[]) => void) => {
    if (!isEnabled || typeof window === 'undefined') return
    
    try {
      posthog.onFeatureFlags(callback)
    } catch (error) {
      console.warn('PostHog onFeatureFlags failed:', error)
    }
  }, [isEnabled])
  
  return {
    getFeatureFlag,
    isFeatureEnabled,
    onFeatureFlags,
    isEnabled
  }
}

/**
 * Business event helpers for PostHog (consistent with GA4 implementation)
 */
export function usePostHogBusinessEvents() {
  const { capture } = usePostHog()
  const params = useParams()
  const pathname = usePathname()
  const locale = params.locale as string
  
  return {
    trackSignUp: useCallback((method?: string, userPlan?: string) => {
      capture('user_signup', {
        method: method || 'email',
        user_plan: userPlan || 'free',
        locale,
        pageType: getPageType(pathname)
      })
    }, [capture, locale, pathname]),
    
    trackLogin: useCallback((method?: string, userPlan?: string) => {
      capture('user_login', {
        method: method || 'email',
        user_plan: userPlan || 'free',
        locale,
        pageType: getPageType(pathname)
      })
    }, [capture, locale, pathname]),
    
    trackProjectCreated: useCallback((projectId: string, userPlan?: string) => {
      capture('project_created', {
        project_id: projectId,
        user_plan: userPlan || 'free',
        locale,
        pageType: getPageType(pathname)
      })
    }, [capture, locale, pathname]),
    
    trackProjectViewed: useCallback((projectId: string, userPlan?: string) => {
      capture('project_viewed', {
        project_id: projectId,
        user_plan: userPlan || 'free',
        locale,
        pageType: getPageType(pathname)
      })
    }, [capture, locale, pathname]),
    
    trackPlanUpgrade: useCallback((fromPlan: string, toPlan: string, value?: number) => {
      capture('plan_upgrade', {
        from_plan: fromPlan,
        to_plan: toPlan,
        value: value,
        currency: 'USD',
        locale,
        pageType: getPageType(pathname)
      })
    }, [capture, locale, pathname]),
    
    trackFeatureUsed: useCallback((featureName: string, userPlan?: string) => {
      capture('feature_used', {
        feature_name: featureName,
        user_plan: userPlan || 'free',
        locale,
        pageType: getPageType(pathname)
      })
    }, [capture, locale, pathname])
  }
}

/**
 * PostHog user identification helper
 */
export function usePostHogIdentification() {
  const { identify, setPersonProperties, reset } = usePostHog()
  
  const identifyUser = useCallback((userId: string, userEmail?: string, userPlan?: string) => {
    const properties: Record<string, any> = {
      $user_plan: userPlan || 'free',
      $last_seen: new Date().toISOString()
    }
    
    // Only include email if explicitly provided and not in privacy mode
    if (userEmail && !posthogConfig.debugMode) {
      properties.$email = userEmail
    }
    
    identify(userId, properties)
  }, [identify])
  
  const updateUserProperties = useCallback((properties: Record<string, any>) => {
    setPersonProperties(properties)
  }, [setPersonProperties])
  
  const logoutUser = useCallback(() => {
    reset()
  }, [reset])
  
  return {
    identifyUser,
    updateUserProperties,
    logoutUser
  }
}

/**
 * Classify page type for analytics segmentation (consistent with GA4)
 */
function getPageType(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'marketing'
  if (pathname.startsWith('/auth/')) return 'auth'
  if (pathname.startsWith('/dashboard/')) return 'dashboard'
  if (pathname.startsWith('/builder/')) return 'builder'
  if (pathname.startsWith('/admin/')) return 'admin'
  
  return 'marketing'
}

// Development helpers
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).posthogHooks = {
    usePostHog,
    usePostHogPageTracking,
    usePostHogFeatureFlags,
    usePostHogBusinessEvents,
    usePostHogIdentification
  }
  
  console.group('📊 PostHog Hooks')
  console.log('Enabled:', posthogConfig.enabled)
  console.log('Debug Mode:', posthogConfig.debugMode)
  console.log('Feature Flags:', posthogConfig.featureFlags)
  console.log('Session Recording:', posthogConfig.sessionRecording)
  console.groupEnd()
}
