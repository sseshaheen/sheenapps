'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseKeyboardNavigationProps {
  items: any[]
  onSelect: (item: any, index: number) => void
  onAction?: (action: string, item: any, index: number) => void
  isActive?: boolean
}

export function useKeyboardNavigation({
  items,
  onSelect,
  onAction,
  isActive = true
}: UseKeyboardNavigationProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  // Update refs array when items change
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length)
  }, [items.length])

  // Focus the element at the current index
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < items.length) {
      itemRefs.current[focusedIndex]?.focus()
    }
  }, [focusedIndex, items.length])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isActive || items.length === 0) return

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => {
          const newIndex = prev <= 0 ? items.length - 1 : prev - 1
          return newIndex
        })
        break

      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => {
          const newIndex = prev >= items.length - 1 ? 0 : prev + 1
          return newIndex
        })
        break

      case 'ArrowLeft':
        if (focusedIndex > 0) {
          e.preventDefault()
          setFocusedIndex(prev => prev - 1)
        }
        break

      case 'ArrowRight':
        if (focusedIndex < items.length - 1) {
          e.preventDefault()
          setFocusedIndex(prev => prev + 1)
        }
        break

      case 'Enter':
      case ' ':
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          e.preventDefault()
          onSelect(items[focusedIndex], focusedIndex)
        }
        break

      case 'Delete':
      case 'Backspace':
        if (focusedIndex >= 0 && focusedIndex < items.length && onAction) {
          e.preventDefault()
          onAction('delete', items[focusedIndex], focusedIndex)
        }
        break

      case 'r':
        if (e.metaKey || e.ctrlKey) {
          if (focusedIndex >= 0 && focusedIndex < items.length && onAction) {
            e.preventDefault()
            onAction('rename', items[focusedIndex], focusedIndex)
          }
        }
        break

      case 'd':
        if (e.metaKey || e.ctrlKey) {
          if (focusedIndex >= 0 && focusedIndex < items.length && onAction) {
            e.preventDefault()
            onAction('duplicate', items[focusedIndex], focusedIndex)
          }
        }
        break

      case 'Home':
        e.preventDefault()
        setFocusedIndex(0)
        break

      case 'End':
        e.preventDefault()
        setFocusedIndex(items.length - 1)
        break

      case 'Escape':
        e.preventDefault()
        setFocusedIndex(-1)
        // Remove focus from current element
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        break
    }
  }, [isActive, items, focusedIndex, onSelect, onAction])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const setItemRef = useCallback((index: number) => (el: HTMLElement | null) => {
    itemRefs.current[index] = el
  }, [])

  const resetFocus = useCallback(() => {
    setFocusedIndex(-1)
  }, [])

  return {
    focusedIndex,
    setFocusedIndex,
    setItemRef,
    resetFocus
  }
}