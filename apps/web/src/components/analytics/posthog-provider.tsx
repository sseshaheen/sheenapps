'use client'

/**
 * 📊 PostHog Provider Component
 * Integrates PostHog tracking throughout the application
 * SECURITY: Automatically disabled on admin routes to protect sensitive data
 */

import React, { createContext, useContext, useEffect } from 'react'
import { usePostHog, usePostHogPageTracking } from '@/hooks/use-posthog'
import { posthogConfig } from '@/config/analytics-config'
import { usePathname } from 'next/navigation'
import { shouldExcludeAnalytics } from '@/utils/analytics-exclusions'

interface PostHogContextType {
  isEnabled: boolean
  isLoaded: boolean
  capture: (eventName: string, properties?: Record<string, any>) => void
  identify: (userId: string, properties?: Record<string, any>) => void
  reset: () => void
}

const PostHogContext = createContext<PostHogContextType | null>(null)

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const pathname = usePathname()
  const posthog = usePostHog()

  // SECURITY: Check if analytics should be disabled for this route
  const shouldExclude = shouldExcludeAnalytics(pathname)

  // Auto-track page views (like GA4) - only if not excluded
  usePostHogPageTracking()

  // Context value with security exclusion
  const contextValue: PostHogContextType = {
    isEnabled: posthog.isEnabled && !shouldExclude,
    isLoaded: posthog.isLoaded && !shouldExclude,
    capture: shouldExclude ? () => {} : posthog.capture,
    identify: shouldExclude ? () => {} : posthog.identify,
    reset: shouldExclude ? () => {} : posthog.reset
  }
  
  // Development logging
  useEffect(() => {
    // eslint-disable-next-line no-restricted-globals
    if (process.env.NODE_ENV === 'development') {
      if (shouldExclude) {
        console.log('🔒 PostHog: Disabled for admin route', { pathname })
      } else if (posthog.isEnabled) {
        console.log('📊 PostHog Provider initialized', {
          enabled: posthog.isEnabled,
          loaded: posthog.isLoaded,
          config: posthogConfig
        })
      }
    }
  }, [posthog.isEnabled, posthog.isLoaded, shouldExclude, pathname])
  
  return (
    <PostHogContext.Provider value={contextValue}>
      {children}
    </PostHogContext.Provider>
  )
}

/**
 * Hook to use PostHog context
 */
export function usePostHogContext() {
  const context = useContext(PostHogContext)
  
  if (!context) {
    throw new Error('usePostHogContext must be used within a PostHogProvider')
  }
  
  return context
}

/**
 * Higher-order component to wrap components with PostHog context
 */
export function withPostHog<P extends object>(Component: React.ComponentType<P>) {
  return function PostHogWrappedComponent(props: P) {
    return (
      <PostHogProvider>
        <Component {...props} />
      </PostHogProvider>
    )
  }
}