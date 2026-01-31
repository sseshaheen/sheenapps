'use client'

/* eslint-disable no-restricted-globals */

/**
 * 🔍 GA4 Page Tracking Hook
 * Expert-corrected SPA routing pattern for Next.js App Router
 * - Manual page_view events (auto disabled in GA4 config)
 * - Locale-aware tracking across 9 languages
 * - Integrates with existing privacy controls
 */

import { useEffect } from 'react'
import { usePathname } from '@/i18n/routing'
import { useSearchParams, useParams } from 'next/navigation'
import { ga4Config, processGA4Event } from '@/config/analytics-config'
import { useAuthStore } from '@/store'

/**
 * Automatically track page views for SPA routing
 */
export function useGA4PageTracking() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams()
  const locale = params.locale as string

  useEffect(() => {
    // Only track if GA4 is enabled and loaded
    if (!ga4Config.enabled || typeof window === 'undefined' || !window.gtag) {
      return
    }

    // Don't track in development unless explicitly enabled
    if (process.env.NODE_ENV === 'development' && !ga4Config.debugMode) {
      return
    }

    // Send page_view event with custom parameters
    const pageViewData = {
      page_location: window.location.href,
      page_path: pathname,
      page_title: document.title,
      locale: locale || 'en',
      page_type: getPageType(pathname)
    }

    // Send to GA4
    window.gtag('event', 'page_view', pageViewData)

    // Debug logging in development
    if (ga4Config.debugMode) {
      console.log('📊 GA4 Page View:', pageViewData)
    }
  }, [pathname, searchParams, locale])
}

/**
 * Classify page type for better analytics segmentation
 */
function getPageType(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'marketing'
  if (pathname.startsWith('/auth/')) return 'auth'
  if (pathname.startsWith('/dashboard/')) return 'dashboard'
  if (pathname.startsWith('/builder/')) return 'builder'
  if (pathname.startsWith('/admin/')) return 'admin'
  
  // Other marketing pages
  return 'marketing'
}

/**
 * Send custom GA4 events with proper privacy processing
 */
export function useGA4Events() {
  const params = useParams()
  const pathname = usePathname()
  const locale = params.locale as string

  const trackEvent = (eventType: string, eventData: Record<string, any> = {}) => {
    // Only track if GA4 is enabled
    if (!ga4Config.enabled || typeof window === 'undefined' || !window.gtag) {
      return
    }

    // Apply GA4 event processing
    const processed = processGA4Event(eventType, {
      ...eventData,
      locale,
      pageType: getPageType(pathname)
    })

    if (!processed) return // Filtered by privacy controls

    // Send to GA4
    window.gtag('event', processed.eventName, processed.parameters)

    // Debug logging
    if (ga4Config.debugMode) {
      console.log('📊 GA4 Event:', processed)
    }
  }

  return { trackEvent }
}

/**
 * Common business event helpers
 */
export function useGA4BusinessEvents() {
  const { trackEvent } = useGA4Events()
  const params = useParams()
  // ✅ BACKEND CONFIRMED: Get user plan from auth store
  const { user } = useAuthStore()
  // TODO: Add subscription to AuthState type
  const userPlan = user?.user_metadata?.plan || 'free'

  return {
    trackSignUp: (method?: string) => {
      trackEvent('user_signup', {
        method: method || 'email',
        user_plan: userPlan
      })
    },

    trackLogin: (method?: string) => {
      trackEvent('user_login', {
        method: method || 'email',
        user_plan: userPlan
      })
    },

    trackProjectCreated: (projectId: string) => {
      trackEvent('project_created', {
        item_id: projectId,
        user_plan: userPlan
      })
    },

    trackProjectViewed: (projectId: string) => {
      trackEvent('project_viewed', {
        item_id: projectId,
        user_plan: userPlan
      })
    },

    trackPlanUpgrade: (fromPlan: string, toPlan: string, value?: number) => {
      trackEvent('plan_upgrade', {
        item_id: toPlan,
        item_name: `${toPlan}_plan`,
        value: value,
        currency: 'USD',
        user_plan: fromPlan
      })
    },

    trackFeatureUsed: (featureName: string) => {
      trackEvent('feature_used', {
        item_name: featureName,
        user_plan: userPlan
      })
    }
  }
}

// Development helpers
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // @ts-expect-error - Adding debug helper to window for development
  window.ga4PageType = getPageType
  
  console.group('📊 GA4 Page Tracking')
  console.log('Enabled:', ga4Config.enabled)
  console.log('Debug Mode:', ga4Config.debugMode)
  console.log('Page Type Helper Available:', typeof getPageType === 'function')
  console.groupEnd()
}
