/**
 * Visual Viewport Height Hook
 * Handles mobile keyboard overlay by tracking actual visual viewport height
 * 
 * Expert recommendation for iOS/Android keyboard handling that prevents layout jumps
 * Uses window.visualViewport API when available, falls back to window.innerHeight
 */

'use client'

import { useEffect, useState } from 'react'

/**
 * Hook that sets CSS custom property --vvh for mobile keyboard-aware heights
 * 
 * Usage in CSS: height: var(--vvh, 100dvh)
 * This prevents layout jumps when mobile keyboards appear/disappear
 * 
 * Key benefits:
 * - Prevents iOS Safari keyboard causing layout jumps  
 * - Android keyboard overlay handling
 * - Graceful fallback to innerHeight on unsupported browsers
 * - Reactive to orientation changes
 */
export function useVisualViewportHeight(): void {
  useEffect(() => {
    // Update function to set CSS custom property
    const updateViewportHeight = () => {
      // Use visual viewport height when available (modern mobile browsers)
      // Fall back to window.innerHeight for older browsers
      const height = window.visualViewport?.height ?? window.innerHeight
      
      // Set CSS custom property that can be used in styles
      document.documentElement.style.setProperty('--vvh', `${height}px`)
    }

    // Initial update
    updateViewportHeight()

    // Listen for visual viewport changes (keyboard show/hide, orientation)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportHeight)
    }
    
    // Fallback for browsers without visual viewport support
    window.addEventListener('resize', updateViewportHeight)
    window.addEventListener('orientationchange', updateViewportHeight)

    // Cleanup event listeners
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewportHeight)
      }
      window.removeEventListener('resize', updateViewportHeight)
      window.removeEventListener('orientationchange', updateViewportHeight)
    }
  }, [])
}

/**
 * Hook that returns current visual viewport dimensions
 * Use when you need the actual values in JavaScript, not just CSS
 */
export function useVisualViewportDimensions() {
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0 }
    }
    return {
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight
    }
  })

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight
      })
    }

    // Initial update
    updateDimensions()

    // Listen for changes
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateDimensions)
    }
    window.addEventListener('resize', updateDimensions)
    window.addEventListener('orientationchange', updateDimensions)

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateDimensions)
      }
      window.removeEventListener('resize', updateDimensions)
      window.removeEventListener('orientationchange', updateDimensions)
    }
  }, [])

  return dimensions
}