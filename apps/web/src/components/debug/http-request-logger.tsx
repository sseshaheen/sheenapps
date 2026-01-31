'use client'

import { useEffect } from 'react'

export function HTTPRequestLogger() {
  useEffect(() => {
    // EXPERT DIAGNOSTIC: Temporarily disable to test if this is causing caching
    // WORKER TEAM DEBUGGING: Enable logging to catch duplicate API calls
    // Temporarily always enabled to debug duplicate project creation issue
    if (false) { // DISABLED FOR TESTING - was: if (true)
      import('@/utils/http-request-logger').then(() => {
        console.log('🔍 [NextJS] HTTP Request Logger loaded')
        // Test the logging system
        import('@/utils/test-logging').then(({ testEnhancedLogging }) => {
          testEnhancedLogging()
        })
      })
    }
  }, [])

  return null // This component renders nothing
}