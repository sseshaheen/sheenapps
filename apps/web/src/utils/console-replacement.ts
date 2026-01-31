// Console Log Replacement System - React Components Only
// Use this to replace problematic console.log statements with rate-limited logging

import { rateLimiters } from './rate-limiters'

// Re-export for React components
export const consoleReplacements = rateLimiters

// Global console override for development (use sparingly)
export function enableSmartConsoleOverride() {
  if (process.env.NODE_ENV !== 'development') return
  
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  }
  
  // Override console.log with rate limiting
  console.log = (...args: any[]) => {
    // Check if this is a repetitive log pattern
    const message = args[0]?.toString() || ''
    
    // Skip logging for known problematic patterns
    if (
      // Original patterns
      message.includes('Iframe monitor:') ||
      message.includes('Preview container mutation:') ||
      message.includes('Component generation progress:') ||
      message.includes('Undo/Redo visibility check:') ||
      message.includes('Question flow init check:') ||
      message.includes('Preview engine init check:') ||
      message.includes('Enhanced Workspace State:') ||
      message.includes('Starting question flow with idea:') ||
      message.includes('Store: Starting question flow') ||
      message.includes('Store: Running prompt analysis') ||
      message.includes('Store: Calling lightweight first question') ||
      message.includes('Store: First question loaded:') ||
      message.includes('Store: AI-powered question flow') ||
      message.includes('Engagement tracked:') ||
      // Current problematic patterns from actual logs
      message.includes('🔄 Switching to layout:') ||
      message.includes('🔄 Updated currentPreview in store') ||
      message.includes('🆔 Layout ID after initialization:') ||
      message.includes('🔐 Auth state changed:') ||
      message.includes('🔄 UPDATING: Button state changed') ||
      message.includes('📊 DETAILED history state') ||
      message.includes('🎬 Rendering overlay:') ||
      message.includes('📋 Pre-queuing all modular choices:') ||
      message.includes('✨ Auto-selecting first option:') ||
      message.includes('🤖 Auto-selecting with AI generation') ||
      message.includes('📞 CALLING applyPreviewImpactWithAI') ||
      message.includes('🤖 Starting AI-simulated preview') ||
      message.includes('🧠 Actually started generating:') ||
      message.includes('🚀 Starting real component generation') ||
      message.includes('🔄 Generating') ||
      message.includes('🔄 Syncing layout ID') ||
      message.includes('🏁 Auto-selection process complete') ||
      message.includes('🔄 Using layout ID for button updates:') ||
      message.includes('🔄 Updating buttons for sections:') ||
      message.includes('🔄 iframe ready for button updates') ||
      message.includes('Iframe check:') ||
      // Button-related spam
      message.includes('updateUndoRedoButtons called:') ||
      message.includes('iframe button search results:') ||
      message.includes('No undo button found') ||
      message.includes('No redo button found') ||
      message.includes('All undo buttons in iframe:') ||
      message.includes('All redo buttons in iframe:') ||
      // Iframe-related spam
      message.includes('Preview iframe ready') ||
      message.includes('Navigation prevention activated') ||
      message.includes('Setting up triple-click') ||
      message.includes('Click event listener added') ||
      message.includes('Initializing undo/redo button states')
    ) {
      return // Silently drop these logs
    }
    
    // Use original console for everything else
    originalConsole.log(...args)
  }
  
  // Restore function
  return () => {
    Object.assign(console, originalConsole)
  }
}