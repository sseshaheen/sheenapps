/**
 * UI Constants and Configuration
 * Centralized location for all UI-related constants
 */

// Timing constants (in milliseconds)
export const TIMEOUTS = {
  GUIDANCE_DEBOUNCE: 300,
  BUTTON_UPDATE_DELAY: 100,
  UNDO_REDO_UPDATE_DELAY: 200,
  COMPLETION_ANIMATION: 3000,
  BUTTON_VISIBILITY: 3000,
  IFRAME_RETRY: 500,
  BUTTON_DEBOUNCE: 50,
  SECONDARY_UPDATE: 500,
  DOM_UPDATE_WAIT: 400
} as const

// Button styles
export const BUTTON_STYLES = {
  undo: {
    background: 'rgba(251, 146, 60, 0.9)',
    hoverBackground: 'rgba(251, 146, 60, 1)',
    color: 'white',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600'
  },
  redo: {
    background: 'rgba(34, 197, 94, 0.9)',
    hoverBackground: 'rgba(34, 197, 94, 1)',
    color: 'white',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600'
  }
} as const

// Button icons
export const BUTTON_ICONS = {
  undo: '⟲',
  redo: '⟳',
  edit: '✏️'
} as const

// Animation constants
export const ANIMATIONS = {
  BUTTON_SCALE_HOVER: 1.02,
  BUTTON_SCALE_NORMAL: 1,
  TRANSITION_DURATION: '0.2s',
  TRANSITION_EASE: 'ease'
} as const

// Retry limits
export const RETRY_LIMITS = {
  HISTORY_CHECK: 5,
  IFRAME_LOAD: 3
} as const

// Z-index layers
export const Z_INDEX = {
  // Highest priority - should always be on top
  DROPDOWN_MENU: 50,        // User menus, dropdown menus
  DIALOG_BACKDROP: 60,      // Dialog backdrops (even higher)
  DIALOG: 50,               // Dialogs themselves
  
  // Medium priority - overlays and controls
  GENERATION_OVERLAY: 40,   // AI generation overlays
  TOAST: 40,                // Toast notifications
  
  // Lower priority - in-page controls
  SECTION_CONTROLS: 30,     // Edit/undo/redo buttons in sections
  SECTION_TOOLTIP: 20,      // Section info tooltips
  SECTION_HOVER: 10         // Hover states
} as const