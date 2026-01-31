import { useEffect } from 'react'

/**
 * Mobile scroll lock hook - iOS-safe implementation
 * Prevents background page scrolling when mobile panels are active
 * 
 * EXPERT PATTERN: Uses "fixed body" technique instead of overflow:hidden
 * to avoid viewport shrinking on mobile Safari during scroll lock.
 * 
 * Benefits:
 * - Prevents visual viewport changes mid-frame on iOS
 * - Maintains scroll position across lock/unlock cycles
 * - More reliable than html/body overflow manipulation
 */
export function useMobileScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return

    // Capture current scroll position
    const scrollY = window.scrollY
    const { style } = document.body
    
    // Store previous values for restoration
    const prev = {
      position: style.position,
      top: style.top,
      width: style.width,
      overflow: style.overflow,
    }

    // EXPERT FIX: Lock without shrinking the visual viewport
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'
    style.overflow = 'hidden'

    // Cleanup function - restore everything
    return () => {
      style.position = prev.position
      style.top = prev.top
      style.width = prev.width
      style.overflow = prev.overflow
      
      // Restore scroll position
      window.scrollTo(0, scrollY)
    }
  }, [active])
}