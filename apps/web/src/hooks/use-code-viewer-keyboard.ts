/**
 * Code Viewer Keyboard Shortcuts Hook
 *
 * Handles keyboard navigation and shortcuts for the code viewer.
 * Similar to VS Code / IDE keyboard shortcuts.
 */

'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useCodeViewerStore } from '@/store/code-viewer-store'

// ============================================================================
// Types
// ============================================================================

interface UseCodeViewerKeyboardOptions {
  enabled?: boolean
  onSearchOpen?: () => void
  onSearchClose?: () => void
  containerRef?: React.RefObject<HTMLElement>
}

interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
  preventDefault?: boolean
}

// ============================================================================
// Platform Detection
// ============================================================================

const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

/**
 * Check if the modifier key is pressed (Cmd on Mac, Ctrl on Windows/Linux)
 */
function isModKey(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}

// ============================================================================
// Hook
// ============================================================================

export function useCodeViewerKeyboard({
  enabled = true,
  onSearchOpen,
  onSearchClose,
  containerRef,
}: UseCodeViewerKeyboardOptions = {}) {
  const isSearchOpen = useRef(false)

  // Store actions
  const toggleFileTree = useCodeViewerStore((state) => state.toggleFileTree)
  const closeFile = useCodeViewerStore((state) => state.closeFile)
  const setActiveFile = useCodeViewerStore((state) => state.setActiveFile)
  const setViewMode = useCodeViewerStore((state) => state.setViewMode)
  const toggleFollowMode = useCodeViewerStore((state) => state.toggleFollowMode)

  // Store state
  const openTabs = useCodeViewerStore((state) => state.openTabs)
  const activeFile = useCodeViewerStore((state) => state.activeFile)
  const fileOrder = useCodeViewerStore((state) => state.fileOrder)
  const viewMode = useCodeViewerStore((state) => state.viewMode)

  // Handle search toggle
  const handleSearchOpen = useCallback(() => {
    isSearchOpen.current = true
    onSearchOpen?.()
  }, [onSearchOpen])

  const handleSearchClose = useCallback(() => {
    isSearchOpen.current = false
    onSearchClose?.()
  }, [onSearchClose])

  // Navigate to tab by index (1-9)
  const navigateToTab = useCallback(
    (index: number) => {
      if (index >= 0 && index < openTabs.length) {
        setActiveFile(openTabs[index])
      }
    },
    [openTabs, setActiveFile]
  )

  // Navigate to next/previous file in tree
  const navigateFiles = useCallback(
    (direction: 'up' | 'down') => {
      if (!activeFile || fileOrder.length === 0) return

      const currentIndex = fileOrder.indexOf(activeFile)
      if (currentIndex === -1) return

      const newIndex =
        direction === 'up'
          ? Math.max(0, currentIndex - 1)
          : Math.min(fileOrder.length - 1, currentIndex + 1)

      if (newIndex !== currentIndex) {
        setActiveFile(fileOrder[newIndex])
      }
    },
    [activeFile, fileOrder, setActiveFile]
  )

  // Close current tab
  const closeCurrentTab = useCallback(() => {
    if (activeFile) {
      closeFile(activeFile)
    }
  }, [activeFile, closeFile])

  // Cycle view modes
  const cycleViewMode = useCallback(() => {
    const modes = ['code', 'diff', 'preview'] as const
    const currentIndex = modes.indexOf(viewMode)
    const nextIndex = (currentIndex + 1) % modes.length
    setViewMode(modes[nextIndex])
  }, [viewMode, setViewMode])

  // Main keyboard handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      // Don't handle if in input/textarea (except for specific shortcuts)
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      const mod = isModKey(e)

      // Cmd/Ctrl + F - Open search (always handle, even in inputs)
      if (mod && e.key === 'f') {
        e.preventDefault()
        handleSearchOpen()
        return
      }

      // Escape - Close search or deselect
      if (e.key === 'Escape') {
        if (isSearchOpen.current) {
          handleSearchClose()
        }
        return
      }

      // Don't handle other shortcuts if in input
      if (isInput) return

      // Cmd/Ctrl + B - Toggle file tree
      if (mod && e.key === 'b') {
        e.preventDefault()
        toggleFileTree()
        return
      }

      // Cmd/Ctrl + W - Close current tab
      if (mod && e.key === 'w') {
        e.preventDefault()
        closeCurrentTab()
        return
      }

      // Cmd/Ctrl + \ - Toggle file tree (alternative)
      if (mod && e.key === '\\') {
        e.preventDefault()
        toggleFileTree()
        return
      }

      // Cmd/Ctrl + D - Cycle view mode (code -> diff -> preview)
      if (mod && e.key === 'd') {
        e.preventDefault()
        cycleViewMode()
        return
      }

      // Cmd/Ctrl + L - Toggle follow mode (during streaming)
      if (mod && e.key === 'l') {
        e.preventDefault()
        toggleFollowMode()
        return
      }

      // Cmd/Ctrl + 1-9 - Switch to tab by number
      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const tabIndex = parseInt(e.key, 10) - 1
        navigateToTab(tabIndex)
        return
      }

      // Arrow keys for file navigation (when not in input)
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        navigateFiles('up')
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        navigateFiles('down')
        return
      }

      // [ and ] for navigating between tabs
      if (mod && e.key === '[') {
        e.preventDefault()
        if (activeFile && openTabs.length > 1) {
          const currentIndex = openTabs.indexOf(activeFile)
          const prevIndex = (currentIndex - 1 + openTabs.length) % openTabs.length
          setActiveFile(openTabs[prevIndex])
        }
        return
      }

      if (mod && e.key === ']') {
        e.preventDefault()
        if (activeFile && openTabs.length > 1) {
          const currentIndex = openTabs.indexOf(activeFile)
          const nextIndex = (currentIndex + 1) % openTabs.length
          setActiveFile(openTabs[nextIndex])
        }
        return
      }
    },
    [
      enabled,
      handleSearchOpen,
      handleSearchClose,
      toggleFileTree,
      closeCurrentTab,
      cycleViewMode,
      toggleFollowMode,
      navigateToTab,
      navigateFiles,
      activeFile,
      openTabs,
      setActiveFile,
    ]
  )

  // Attach event listener
  useEffect(() => {
    if (!enabled) return

    const target = containerRef?.current || window
    target.addEventListener('keydown', handleKeyDown as EventListener)

    return () => {
      target.removeEventListener('keydown', handleKeyDown as EventListener)
    }
  }, [enabled, handleKeyDown, containerRef])

  return {
    isSearchOpen: isSearchOpen.current,
    openSearch: handleSearchOpen,
    closeSearch: handleSearchClose,
  }
}

// ============================================================================
// Keyboard Shortcuts Help
// ============================================================================

export const KEYBOARD_SHORTCUTS: Array<{
  key: string
  description: string
  category: 'Navigation' | 'Actions' | 'View'
}> = [
  // Navigation
  { key: '↑/↓', description: 'Navigate files', category: 'Navigation' },
  { key: `${isMac ? '⌘' : 'Ctrl'}+[/]`, description: 'Previous/Next tab', category: 'Navigation' },
  { key: `${isMac ? '⌘' : 'Ctrl'}+1-9`, description: 'Go to tab', category: 'Navigation' },

  // Actions
  { key: `${isMac ? '⌘' : 'Ctrl'}+F`, description: 'Search in file', category: 'Actions' },
  { key: `${isMac ? '⌘' : 'Ctrl'}+W`, description: 'Close tab', category: 'Actions' },
  { key: 'Escape', description: 'Close search', category: 'Actions' },

  // View
  { key: `${isMac ? '⌘' : 'Ctrl'}+B`, description: 'Toggle sidebar', category: 'View' },
  { key: `${isMac ? '⌘' : 'Ctrl'}+D`, description: 'Cycle view mode', category: 'View' },
  { key: `${isMac ? '⌘' : 'Ctrl'}+L`, description: 'Toggle follow mode', category: 'View' },
]

export default useCodeViewerKeyboard
