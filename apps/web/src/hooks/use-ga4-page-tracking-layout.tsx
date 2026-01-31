'use client'

/**
 * 📊 GA4 Layout Integration Hook
 * Integrates GA4 page tracking into app layout and key components
 */

import { useEffect } from 'react'
import { useGA4PageTracking, useGA4Events, useGA4BusinessEvents } from './use-ga4-page-tracking'

/**
 * App-wide GA4 integration for layout components
 */
export function useGA4AppIntegration() {
  // Auto-track all page views
  useGA4PageTracking()
  
  // Auto-track consent updates
  const { trackEvent } = useGA4Events()
  
  useEffect(() => {
    // Track initial app load
    trackEvent('app_loaded', {
      referrer: document.referrer || 'direct',
      userAgent: navigator.userAgent.substring(0, 100)
    })
  }, [trackEvent])
  
  return { trackEvent }
}

/**
 * Auth component integration
 */
export function useGA4AuthIntegration() {
  const { trackSignUp, trackLogin } = useGA4BusinessEvents()
  
  return {
    onSignUp: (method?: string) => trackSignUp(method),
    onLogin: (method?: string) => trackLogin(method)
  }
}

/**
 * Header/navigation integration
 */
export function useGA4NavigationIntegration() {
  const { trackEvent } = useGA4Events()
  
  return {
    onMenuToggle: () => trackEvent('menu_toggle'),
    onLanguageChange: (locale: string) => trackEvent('language_change', { locale }),
    onThemeToggle: (theme: string) => trackEvent('theme_change', { theme })
  }
}