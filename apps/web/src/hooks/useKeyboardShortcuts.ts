/**
 * useKeyboardShortcuts Hook
 *
 * Milestone C - Day 3
 *
 * Provides keyboard shortcut functionality across the application.
 * Handles Cmd (Mac) / Ctrl (Windows/Linux) automatically.
 *
 * Usage:
 * ```typescript
 * useKeyboardShortcuts({
 *   'cmd+k': () => openQuickActions(),
 *   'cmd+i': () => toggleInfraPanel(),
 *   'cmd+enter': () => runQuery(),
 *   'escape': () => closeModal()
 * })
 * ```
 */

'use client'

import { useEffect, useCallback, useRef } from 'react'

/**
 * Supported keyboard shortcuts
 *
 * Modifiers: cmd (Cmd on Mac, Ctrl on Windows/Linux), shift, alt
 * Keys: Any lowercase key, enter, escape, etc.
 */
export type ShortcutKey =
  | 'cmd+k'        // Quick actions
  | 'cmd+i'        // Infrastructure panel
  | 'cmd+enter'    // Run query
  | 'cmd+/'        // Help
  | 'escape'       // Close modal/dialog
  | 'cmd+shift+d'  // Deploy (future)
  | string         // Allow any custom shortcut

/**
 * Shortcut handlers map
 */
export interface ShortcutHandlers {
  [shortcut: string]: () => void
}

/**
 * Options for keyboard shortcuts
 */
export interface UseKeyboardShortcutsOptions {
  /** Enable/disable shortcuts (default: true) */
  enabled?: boolean
  /** Prevent default browser behavior (default: true) */
  preventDefault?: boolean
  /** Target element (default: window) */
  target?: HTMLElement | Document | Window | null
}

/**
 * Detect if user is on Mac
 */
function isMac(): boolean {
  if (typeof window === 'undefined') return false
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
}

/**
 * Build shortcut string from keyboard event
 *
 * @param e - Keyboard event
 * @returns Shortcut string (e.g., "cmd+k", "shift+escape")
 */
function buildShortcutKey(e: KeyboardEvent): string {
  const parts: string[] = []

  // Modifier keys - use "cmd" for both Cmd and Ctrl
  if (e.metaKey || e.ctrlKey) {
    parts.push('cmd')
  }
  if (e.shiftKey) {
    parts.push('shift')
  }
  if (e.altKey) {
    parts.push('alt')
  }

  // Main key
  const key = e.key.toLowerCase()
  parts.push(key)

  return parts.join('+')
}

/**
 * Check if target is an input element
 *
 * @param target - Event target
 * @returns true if target is input/textarea/contenteditable
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  const isInput = tagName === 'input' || tagName === 'textarea'
  const isContentEditable = target.isContentEditable

  return isInput || isContentEditable
}

/**
 * useKeyboardShortcuts Hook
 *
 * Registers keyboard shortcuts and handles them appropriately.
 * Automatically handles Cmd (Mac) vs Ctrl (Windows/Linux).
 *
 * @param handlers - Map of shortcuts to handler functions
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * useKeyboardShortcuts({
 *   'cmd+k': () => setQuickActionsOpen(true),
 *   'escape': () => setModalOpen(false)
 * })
 * ```
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  options: UseKeyboardShortcutsOptions = {}
) {
  const {
    enabled = true,
    preventDefault = true,
    target = typeof window !== 'undefined' ? window : null,
  } = options

  // Store handlers in ref to avoid recreating listener on every render
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      // Build shortcut string from event
      const shortcut = buildShortcutKey(e)

      // Get handler for this shortcut
      const handler = handlersRef.current[shortcut]
      if (!handler) return

      // Special handling for certain shortcuts
      // Allow Escape to work even in input fields
      const allowInInput = shortcut === 'escape'

      // Skip if focused on input element (unless explicitly allowed)
      if (!allowInInput && isInputElement(e.target)) {
        return
      }

      // Prevent default browser behavior
      if (preventDefault) {
        e.preventDefault()
        e.stopPropagation()
      }

      // Execute handler
      handler()
    },
    [enabled, preventDefault]
  )

  useEffect(() => {
    if (!target) return
    if (!enabled) return

    // Add event listener
    target.addEventListener('keydown', handleKeyDown as EventListener)

    // Cleanup
    return () => {
      target.removeEventListener('keydown', handleKeyDown as EventListener)
    }
  }, [target, enabled, handleKeyDown])
}

/**
 * Get human-readable shortcut label
 *
 * Converts internal shortcut strings to display labels.
 * Handles Mac vs Windows/Linux automatically.
 *
 * @param shortcut - Shortcut string (e.g., "cmd+k")
 * @returns Display label (e.g., "⌘K" on Mac, "Ctrl+K" on Windows)
 *
 * @example
 * ```typescript
 * getShortcutLabel('cmd+k') // "⌘K" on Mac, "Ctrl+K" on Windows
 * getShortcutLabel('escape') // "Escape"
 * ```
 */
export function getShortcutLabel(shortcut: string): string {
  const mac = isMac()
  const parts = shortcut.split('+')

  const labels = parts.map(part => {
    switch (part) {
      case 'cmd':
        return mac ? '⌘' : 'Ctrl'
      case 'shift':
        return mac ? '⇧' : 'Shift'
      case 'alt':
        return mac ? '⌥' : 'Alt'
      case 'enter':
        return mac ? '↵' : 'Enter'
      case 'escape':
        return 'Esc'
      case '/':
        return '/'
      default:
        return part.toUpperCase()
    }
  })

  return mac ? labels.join('') : labels.join('+')
}

/**
 * Shortcut badge component helper
 *
 * Returns className and children for rendering a kbd element.
 *
 * @param shortcut - Shortcut string
 * @returns Props for kbd element
 *
 * @example
 * ```tsx
 * const { className, children } = getShortcutBadgeProps('cmd+k')
 * <kbd className={className}>{children}</kbd>
 * ```
 */
export function getShortcutBadgeProps(shortcut: string) {
  return {
    className:
      'inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded',
    children: getShortcutLabel(shortcut),
  }
}
