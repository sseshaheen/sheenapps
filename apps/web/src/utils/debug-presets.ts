// Debug Presets - Non-React utilities
import { logger } from './logger'
import { setupLogger } from './logger-config'

// Quick debugging presets (call from browser console)
export const debugPresets = {
  // Focus on layout switching issues
  layoutDebugging() {
    logger.setFocusMode(['layout', 'history'])
    logger.info('🎯 Logger focused on layout and history');
  },

  // Focus on component generation issues  
  componentDebugging() {
    logger.setFocusMode(['components', 'preview'])
    logger.info('🎯 Logger focused on components and preview');
  },

  // Focus on performance issues
  performanceDebugging() {
    logger.setFocusMode(['performance'])
    logger.configure({ level: 'DEBUG', maxDebugLogs: 50 })
    logger.info('🎯 Logger focused on performance');
  },

  // Show everything (for complex debugging)
  verboseDebugging() {
    logger.setDebugMode()
    logger.info('🔍 Verbose debugging enabled - expect lots of logs!');
  },

  // Quiet mode (errors only)
  quietMode() {
    logger.configure({ level: 'ERROR' })
    logger.info('🔇 Quiet mode - errors only');
  },

  // Reset to normal
  normalMode() {
    setupLogger()
    logger.info('🔄 Logger reset to normal mode');
  }
}

// Note: debugPresets is assigned to window in logger-init.tsx to avoid circular imports