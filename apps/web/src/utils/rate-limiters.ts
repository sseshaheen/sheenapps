// Rate-limited console replacements - Non-React utilities only
import { logger } from './logger'

// Rate-limited console replacements for specific components
export const rateLimiters = {
  // For iframe monitoring (most problematic)
  iframeMonitor: logger.rateLimit('iframe-monitor', 'DEBUG'),
  
  // For section editing
  sectionEdit: logger.rateLimit('section-edit', 'DEBUG'),
  
  // For component generation
  componentGen: logger.rateLimit('component-gen', 'INFO'),
  
  // For undo/redo operations
  undoRedo: logger.rateLimit('undo-redo', 'DEBUG'),
  
  // For preview updates
  previewUpdate: logger.rateLimit('preview-update', 'DEBUG'),
  
  // For AI generation
  aiGeneration: logger.rateLimit('ai-generation', 'INFO'),
  
  // General rate-limited debug logging
  debug: logger.rateLimit('debug', 'DEBUG'),
  
  // Workspace state changes
  workspaceState: logger.rateLimit('workspace-state', 'DEBUG')
}

// Helper function to replace console.log in specific contexts
export function createRateLimitedConsole(category: string, _maxPerSecond = 3) {
  return logger.rateLimit(category, 'DEBUG')
}