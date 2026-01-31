// Logger Configuration for Different Scenarios
import { logger } from './logger'

// Configure logger based on environment and debugging needs
export function setupLogger() {
  // Check if we're in development
  const isDev = process.env.NODE_ENV === 'development'
  
  if (isDev) {
    // Development: Show WARN and above by default (reduced from INFO)
    logger.configure({
      level: 'WARN',
      categories: ['layout', 'history', 'preview', 'components', 'ai', 'performance', 'general'],
      maxDebugLogs: 10 // Dramatically reduced from 100
    })
    
    // Set up periodic cleanup of rate limiters
    setInterval(() => {
      logger.resetDebugCount()
    }, 30000) // Reset every 30 seconds
  } else {
    // Production: Only errors
    logger.configure({
      level: 'ERROR',
      categories: [],
      maxDebugLogs: 0
    })
  }
}

// Note: debugPresets moved to separate file to avoid Fast Refresh issues