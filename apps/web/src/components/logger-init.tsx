'use client'

import { setupLogger } from '@/utils/logger-config'
import { debugPresets } from '@/utils/debug-presets'
import { enableSmartConsoleOverride } from '@/utils/console-replacement'
import { useEffect } from 'react'
import { logger } from '@/utils/logger';

export function LoggerInit() {
  useEffect(() => {
    // Initialize logger on app startup
    setupLogger()
    
    // Enable smart console override to catch remaining console.log statements
    const restoreConsole = enableSmartConsoleOverride()
    
    // Add global debug shortcuts to window
    if (typeof window !== 'undefined') {
      // Ensure debugPresets is properly assigned to window
      Object.assign(window, { debugPresets })
      ;(window as any).__ENABLE_LOGS__ = false // Disable production logs by default
      
      // In production, completely silence all console.log statements
      // eslint-disable-next-line no-restricted-globals
      if (process.env.NODE_ENV === 'production') {
        const originalLog = console.log
        console.log = (...args: any[]) => {
          // Only allow logs if explicitly enabled
          if ((window as any).__ENABLE_LOGS__ === true) {
            originalLog.apply(console, args)
          }
        }
      }
      
      // Add emergency quiet mode
      ;(window as any).emergencyQuiet = () => {
        console.log = () => {} // Completely disable console.log
        logger.info('🔇 Emergency quiet mode - all console.log disabled');
      }
      
      // Debug utilities available (production logging disabled)
    }
    
    // Cleanup function
    return () => {
      if (restoreConsole) {
        restoreConsole()
      }
    }
  }, [])

  return null // This component doesn't render anything
}
