'use client'

/**
 * 📊 Microsoft Clarity Provider Component
 * Provides Clarity context and automatic page tracking for session recordings and heatmaps
 * SECURITY: Automatically disabled on admin routes to protect sensitive data
 */

import { clarityConfig } from '@/config/analytics-config'
import { useClarityPageTracking } from '@/hooks/use-clarity'
import { useParams, usePathname } from 'next/navigation'
import { createContext, ReactNode, useContext, useEffect } from 'react'
import { shouldExcludeAnalytics } from '@/utils/analytics-exclusions'

interface ClarityContextType {
  isEnabled: boolean
  isLoaded: boolean
  projectId: string
}

const ClarityContext = createContext<ClarityContextType>({
  isEnabled: false,
  isLoaded: false,
  projectId: ''
})

interface ClarityProviderProps {
  children: ReactNode
}

export function ClarityProvider({ children }: ClarityProviderProps) {
  const pathname = usePathname()
  const params = useParams()
  const locale = params.locale as string

  // SECURITY: Check if analytics should be disabled for this route
  const shouldExclude = shouldExcludeAnalytics(pathname)

  // Conditional page tracking hook - only track if not excluded
  useClarityPageTracking()

  useEffect(() => {
    if (!clarityConfig.enabled || !clarityConfig.projectId || shouldExclude) {
      // eslint-disable-next-line no-restricted-globals
      if (process.env.NODE_ENV === 'development' && shouldExclude) {
        console.log('🔒 Microsoft Clarity: Disabled for admin route', { pathname })
      }
      return
    }

    // Verify Clarity is loaded from instrumentation
    if (typeof window !== 'undefined' && window.clarity) {
      // Set locale for session segmentation
      if (locale) {
        window.clarity('set', 'locale', locale)
      }

      // Set initial page context
      window.clarity('set', 'initial_page', pathname)

      if (clarityConfig.debugMode) {
        console.log('📊 Clarity Provider: Context set', {
          locale,
          pathname,
          projectId: clarityConfig.projectId
        })
      }
    // eslint-disable-next-line no-restricted-globals
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Microsoft Clarity not loaded. Check instrumentation-client.ts')
    }
  }, [pathname, locale])

  const contextValue: ClarityContextType = {
    isEnabled: clarityConfig.enabled && !shouldExclude,
    isLoaded: typeof window !== 'undefined' && !!window.clarity && !shouldExclude,
    projectId: clarityConfig.projectId
  }

  return (
    <ClarityContext.Provider value={contextValue}>
      {children}
    </ClarityContext.Provider>
  )
}

/**
 * Hook to access Clarity context
 */
export function useClarityContext(): ClarityContextType {
  const context = useContext(ClarityContext)

  if (!context) {
    throw new Error('useClarityContext must be used within a ClarityProvider')
  }

  return context
}

/**
 * Development helper - adds Clarity provider info to window
 */
// eslint-disable-next-line no-restricted-globals
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).clarityProviderInfo = {
    enabled: clarityConfig.enabled,
    projectId: clarityConfig.projectId,
    recordings: clarityConfig.enableRecordings,
    sampleRate: clarityConfig.sampleRate
  }
}
