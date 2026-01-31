'use client'

/* eslint-disable no-restricted-globals */

/**
 * 📊 Microsoft Clarity Integration Hooks
 * Session recordings and heatmaps with privacy-first configuration
 */

import { useEffect, useCallback } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { clarityConfig } from '@/config/analytics-config'
import { shouldExcludeAnalytics } from '@/utils/analytics-exclusions'

/**
 * Main Clarity hook with privacy controls
 */
export function useClarity() {
  const isEnabled = clarityConfig.enabled
  
  const setCustomTag = useCallback((key: string, value: string) => {
    if (!isEnabled || typeof window === 'undefined' || !window.clarity) return
    
    try {
      window.clarity('set', key, value)
      
      if (clarityConfig.debugMode) {
        console.log('📊 Clarity custom tag set:', { key, value })
      }
    } catch (error) {
      console.warn('Clarity setCustomTag failed:', error)
    }
  }, [isEnabled])
  
  const sendEvent = useCallback((eventName: string, data?: Record<string, any>) => {
    if (!isEnabled || typeof window === 'undefined' || !window.clarity) return
    
    try {
      if (data) {
        window.clarity('event', eventName, data)
      } else {
        window.clarity('event', eventName)
      }
      
      if (clarityConfig.debugMode) {
        console.log('📊 Clarity event sent:', { eventName, data })
      }
    } catch (error) {
      console.warn('Clarity sendEvent failed:', error)
    }
  }, [isEnabled])
  
  const identifyUser = useCallback((userId: string, sessionData?: Record<string, any>) => {
    if (!isEnabled || typeof window === 'undefined' || !window.clarity) return
    
    try {
      // Set user ID as custom tag for session segmentation
      window.clarity('set', 'user_id', userId)
      
      // Add additional session data if provided
      if (sessionData) {
        Object.entries(sessionData).forEach(([key, value]) => {
          window.clarity('set', key, String(value))
        })
      }
      
      if (clarityConfig.debugMode) {
        console.log('📊 Clarity user identified:', { userId, sessionData })
      }
    } catch (error) {
      console.warn('Clarity identifyUser failed:', error)
    }
  }, [isEnabled])
  
  const upgradeSession = useCallback(() => {
    if (!isEnabled || typeof window === 'undefined' || !window.clarity) return
    
    try {
      // Upgrade session to ensure it's recorded (useful for important user actions)
      window.clarity('upgrade')
      
      if (clarityConfig.debugMode) {
        console.log('📊 Clarity session upgraded')
      }
    } catch (error) {
      console.warn('Clarity upgradeSession failed:', error)
    }
  }, [isEnabled])
  
  return {
    setCustomTag,
    sendEvent,
    identifyUser,
    upgradeSession,
    isEnabled,
    isLoaded: typeof window !== 'undefined' && !!window.clarity
  }
}

/**
 * Clarity page tracking with automatic locale and page type tagging
 * SECURITY: Respects analytics exclusions for admin routes
 */
export function useClarityPageTracking() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams()
  const locale = params.locale as string
  const { setCustomTag } = useClarity()

  useEffect(() => {
    if (!clarityConfig.enabled) return

    if (shouldExcludeAnalytics(pathname)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔒 Clarity page tracking: Disabled for admin route', { pathname })
      }
      return
    }
    
    // Set locale for session segmentation
    if (locale) {
      setCustomTag('locale', locale)
    }
    
    // Set page type for session segmentation
    const pageType = getPageType(pathname)
    setCustomTag('page_type', pageType)
    
    // Set specific page for detailed analysis
    setCustomTag('current_page', pathname)
    
    if (clarityConfig.debugMode) {
      console.log('📊 Clarity page tracking:', {
        pathname,
        locale,
        pageType
      })
    }
  }, [pathname, searchParams, locale, setCustomTag])
}

/**
 * Business event helpers for Clarity (lightweight events for session context)
 */
export function useClarityBusinessEvents() {
  const { sendEvent, upgradeSession } = useClarity()
  const params = useParams()
  const pathname = usePathname()
  const locale = params.locale as string
  
  return {
    trackSignUp: useCallback((method?: string, userPlan?: string) => {
      sendEvent('user_signup', {
        method: method || 'email',
        user_plan: userPlan || 'free',
        locale
      })
      upgradeSession() // Ensure signup sessions are recorded
    }, [sendEvent, upgradeSession, locale]),
    
    trackLogin: useCallback((method?: string, userPlan?: string) => {
      sendEvent('user_login', {
        method: method || 'email',
        user_plan: userPlan || 'free',
        locale
      })
      upgradeSession() // Ensure login sessions are recorded
    }, [sendEvent, upgradeSession, locale]),
    
    trackProjectCreated: useCallback((projectId: string, userPlan?: string) => {
      sendEvent('project_created', {
        project_id: projectId,
        user_plan: userPlan || 'free',
        locale
      })
      upgradeSession() // Ensure project creation sessions are recorded
    }, [sendEvent, upgradeSession, locale]),
    
    trackPlanUpgrade: useCallback((fromPlan: string, toPlan: string, value?: number) => {
      sendEvent('plan_upgrade', {
        from_plan: fromPlan,
        to_plan: toPlan,
        value: value,
        locale
      })
      upgradeSession() // Ensure conversion sessions are recorded
    }, [sendEvent, upgradeSession, locale]),
    
    trackCriticalError: useCallback((errorType: string, errorMessage?: string) => {
      sendEvent('critical_error', {
        error_type: errorType,
        error_message: errorMessage?.substring(0, 100), // Truncate for privacy
        page_type: getPageType(pathname),
        locale
      })
      upgradeSession() // Ensure error sessions are recorded
    }, [sendEvent, upgradeSession, pathname, locale])
  }
}

/**
 * Clarity session management for user identification
 */
export function useClarityUserContext() {
  const { identifyUser, setCustomTag } = useClarity()
  
  const setUserContext = useCallback((userId: string, userData?: {
    email?: string
    plan?: string
    signupDate?: string
    lastLogin?: string
  }) => {
    // Set basic user identification
    identifyUser(userId, {
      user_plan: userData?.plan || 'free',
      signup_date: userData?.signupDate,
      last_login: userData?.lastLogin
    })
    
    // Note: We don't set email directly for privacy
    // Clarity will capture user behavior without PII
  }, [identifyUser])
  
  const updateUserPlan = useCallback((plan: string) => {
    setCustomTag('user_plan', plan)
  }, [setCustomTag])
  
  const markAsImportantSession = useCallback(() => {
    setCustomTag('important_session', 'true')
  }, [setCustomTag])
  
  return {
    setUserContext,
    updateUserPlan,
    markAsImportantSession
  }
}

/**
 * Classify page type for analytics segmentation (consistent with other analytics)
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
  ;(window as any).clarityHooks = {
    useClarity,
    useClarityPageTracking,
    useClarityBusinessEvents,
    useClarityUserContext
  }
  
  console.group('📊 Microsoft Clarity Hooks')
  console.log('Enabled:', clarityConfig.enabled)
  console.log('Recordings:', clarityConfig.enableRecordings)
  console.log('Sample Rate:', clarityConfig.sampleRate)
  console.log('Project ID:', clarityConfig.projectId ? '✅' : '❌')
  console.groupEnd()
}
