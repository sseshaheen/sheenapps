'use client'

/**
 * 📊 Google Analytics 4 Component
 * Expert-corrected implementation following GA4 best practices
 * - Uses afterInteractive strategy for optimal loading
 * - Consent Mode v2 for EU compliance
 * - Disabled auto page_view for SPA routing
 * - Integrates with existing privacy controls
 * SECURITY: Automatically disabled on admin routes to protect sensitive data
 */

import { useEffect } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { analyticsConfig, processEventForAnalytics } from '@/config/analytics-config'
import { shouldExcludeAnalytics } from '@/utils/analytics-exclusions'

interface GoogleAnalyticsProps {
  measurementId: string
}

declare global {
  interface Window {
    gtag: (command: string, ...args: any[]) => void
    dataLayer: any[]
  }
}

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname()

  // SECURITY: Don't load GA4 on admin routes
  const shouldExclude = shouldExcludeAnalytics(pathname)
  if (shouldExclude) {
    // eslint-disable-next-line no-restricted-globals
    if (process.env.NODE_ENV === 'development') {
      console.log('🔒 Google Analytics: Disabled for admin route', { pathname })
    }
    return null
  }

  // Don't load GA4 if analytics disabled or no measurement ID
  if (!analyticsConfig.enableUserTracking || !measurementId) {
    return null
  }

  // Only load in production or when explicitly enabled
  // eslint-disable-next-line no-restricted-globals
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_GA !== 'true') {
    return null
  }

  return (
    <>
      {/* GA4 Script Loader */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      
      {/* GA4 Initialization - Expert Pattern */}
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          
          // Consent Mode v2 - Default to most restrictive (EU compliance)
          gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
          });
          
          // CRITICAL: Disable auto page_view for SPA routing
          gtag('config', '${measurementId}', {
            send_page_view: false
          });
        `}
      </Script>
    </>
  )
}

/**
 * Hook to update GA4 consent based on user preferences
 */
export function useGA4Consent() {
  useEffect(() => {
    // Update consent when analytics config changes
    const updateConsent = (hasConsent: boolean) => {
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('consent', 'update', {
          analytics_storage: hasConsent ? 'granted' : 'denied',
          ad_user_data: 'denied', // Always deny for privacy
          ad_personalization: 'denied' // Always deny for privacy
        })
      }
    }

    // Respect existing privacy controls
    const hasConsent = analyticsConfig.enableUserTracking
    updateConsent(hasConsent)
  }, [])
}

/**
 * Send event to GA4 with privacy controls
 */
export function sendGA4Event(
  eventName: string, 
  parameters: Record<string, any> = {}
) {
  // Check if GA4 is loaded and user has consented
  if (
    typeof window === 'undefined' || 
    !window.gtag || 
    !analyticsConfig.enableUserTracking
  ) {
    return
  }

  try {
    // Apply existing privacy processing
    const processedEvent = processEventForAnalytics({
      type: eventName,
      ...parameters
    })

    // Skip if event was filtered by sampling
    if (!processedEvent) return

    // Clean parameters for GA4
    const cleanParams = sanitizeGA4Parameters(processedEvent)
    
    // Send to GA4
    window.gtag('event', eventName, cleanParams)
  } catch (error) {
    // Silently fail - don't break user experience
    console.warn('GA4 event failed:', error)
  }
}

/**
 * Sanitize parameters for GA4 compliance
 */
function sanitizeGA4Parameters(params: Record<string, any>): Record<string, any> {
  const cleanParams: Record<string, any> = {}
  
  // Keep only safe, relevant parameters
  const allowedParams = [
    'page_location',
    'page_path', 
    'page_title',
    'locale',
    'page_type',
    'user_plan',
    'value',
    'currency',
    'item_id',
    'item_name',
    'category'
  ]
  
  for (const [key, value] of Object.entries(params)) {
    // Skip analytics metadata
    if (key.startsWith('_')) continue
    
    // Only include allowed parameters
    if (allowedParams.includes(key) && value != null) {
      // Convert to string and limit length for GA4
      cleanParams[key] = String(value).substring(0, 100)
    }
  }
  
  return cleanParams
}

/**
 * Development helpers
 */
// eslint-disable-next-line no-restricted-globals
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // @ts-expect-error - Adding function to window for debugging
  window.sendGA4Event = sendGA4Event
  
  console.group('📊 Google Analytics 4')
  console.log('Enabled:', analyticsConfig.enableUserTracking)
  // eslint-disable-next-line no-restricted-globals
  console.log('Measurement ID:', process.env.NEXT_PUBLIC_GA_ID)
  console.log('Privacy Controls:', {
    anonymizeUserIds: analyticsConfig.anonymizeUserIds,
    eventSamplingRate: analyticsConfig.eventSamplingRate
  })
  console.groupEnd()
}