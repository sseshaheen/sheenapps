'use client'

import { useState, useEffect, useCallback } from 'react'

export type Viewport = 'mobile' | 'mobile-lg' | 'tablet' | 'tablet-lg' | 'desktop' | 'desktop-lg'
export type Orientation = 'portrait' | 'landscape'

export interface ResponsiveState {
  viewport: Viewport
  orientation: Orientation
  width: number
  height: number
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  showMobileUI: boolean
  isPortrait: boolean
  isLandscape: boolean
  isHydrated: boolean
}

// Breakpoint definitions matching our mobile strategy
const BREAKPOINTS = {
  'mobile': 320,      // Small phones (iPhone SE)
  'mobile-lg': 480,   // Large phones (iPhone 12/13)
  'tablet': 768,      // Tablets (iPad)
  'tablet-lg': 1024,  // Large tablets (iPad Pro)
  'desktop': 1280,    // Desktop
  'desktop-lg': 1536  // Large desktop
} as const

/**
 * Determines viewport category based on window width
 */
const getViewport = (width: number): Viewport => {
  if (width < BREAKPOINTS['mobile-lg']) return 'mobile'
  if (width < BREAKPOINTS['tablet']) return 'mobile-lg'
  if (width < BREAKPOINTS['tablet-lg']) return 'tablet'
  if (width < BREAKPOINTS['desktop']) return 'tablet-lg'
  if (width < BREAKPOINTS['desktop-lg']) return 'desktop'
  return 'desktop-lg'
}

/**
 * Determines orientation based on window dimensions
 */
const getOrientation = (width: number, height: number): Orientation => {
  return width > height ? 'landscape' : 'portrait'
}

/**
 * Hook for responsive design state management
 * Provides current viewport information and helper booleans
 */
export const useResponsive = (): ResponsiveState => {
  const [isHydrated, setIsHydrated] = useState(false)
  const [state, setState] = useState<ResponsiveState>(() => {
    // Server-side safe defaults - always default to desktop to prevent mobile UI flash
    if (typeof window === 'undefined') {
      return {
        viewport: 'desktop',
        orientation: 'landscape',
        width: 1280,
        height: 800,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        showMobileUI: false,
        isPortrait: false,
        isLandscape: true,
        isHydrated: false
      }
    }

    const width = window.innerWidth
    const height = window.innerHeight
    const viewport = getViewport(width)
    const orientation = getOrientation(width, height)

    return {
      viewport,
      orientation,
      width,
      height,
      isMobile: viewport === 'mobile' || viewport === 'mobile-lg',
      isTablet: viewport === 'tablet' || viewport === 'tablet-lg',
      isDesktop: viewport === 'desktop' || viewport === 'desktop-lg',
      showMobileUI: viewport === 'mobile' || viewport === 'mobile-lg',
      isPortrait: orientation === 'portrait',
      isLandscape: orientation === 'landscape',
      isHydrated: false
    }
  })

  const updateState = useCallback(() => {
    if (typeof window === 'undefined') return

    const width = window.innerWidth
    const height = window.innerHeight
    const viewport = getViewport(width)
    const orientation = getOrientation(width, height)

    setState({
      viewport,
      orientation,
      width,
      height,
      isMobile: viewport === 'mobile' || viewport === 'mobile-lg',
      isTablet: viewport === 'tablet' || viewport === 'tablet-lg',
      isDesktop: viewport === 'desktop' || viewport === 'desktop-lg',
      showMobileUI: viewport === 'mobile' || viewport === 'mobile-lg',
      isPortrait: orientation === 'portrait',
      isLandscape: orientation === 'landscape',
      isHydrated: true
    })
  }, [])

  useEffect(() => {
    // Ensure hydration happens immediately on mount
    setIsHydrated(true)
    
    // Force update state immediately after hydration to get correct client-side values
    setTimeout(() => {
      updateState()
    }, 0)

    // Also update on next tick to catch any timing issues
    const timeoutId = setTimeout(() => {
      updateState()
    }, 100)

    // Throttled resize handler using requestAnimationFrame for 60fps performance
    let rafId: number | null = null
    const handleResize = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          updateState()
          rafId = null
        })
      }
    }

    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('orientationchange', updateState, { passive: true })

    return () => {
      clearTimeout(timeoutId)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', updateState)
    }
  }, [updateState])

  return { ...state, isHydrated }
}

/**
 * Hook for media query matching
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Hook for specific breakpoint detection
 */
export const useBreakpoint = (breakpoint: keyof typeof BREAKPOINTS): boolean => {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[breakpoint]}px)`)
}

/**
 * Hook for touch device detection
 */
export const useTouchDevice = (): boolean => {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }

    checkTouch()
    window.addEventListener('touchstart', checkTouch, { once: true })

    return () => {
      window.removeEventListener('touchstart', checkTouch)
    }
  }, [])

  return isTouch
}

/**
 * Hook for responsive class names
 */
export const useResponsiveClasses = (classes: {
  mobile?: string
  tablet?: string
  desktop?: string
  default?: string
}) => {
  const { viewport } = useResponsive()
  
  if (viewport === 'mobile' || viewport === 'mobile-lg') {
    return classes.mobile || classes.default || ''
  }
  
  if (viewport === 'tablet' || viewport === 'tablet-lg') {
    return classes.tablet || classes.default || ''
  }
  
  return classes.desktop || classes.default || ''
}

/**
 * Constants for use in components
 */
export const RESPONSIVE_BREAKPOINTS = BREAKPOINTS
export const MOBILE_BREAKPOINT = BREAKPOINTS.tablet
export const DESKTOP_BREAKPOINT = BREAKPOINTS.desktop