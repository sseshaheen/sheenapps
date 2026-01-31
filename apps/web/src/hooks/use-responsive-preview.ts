'use client'

import { useEffect, useRef, useState } from 'react'

// Viewport breakpoints (industry standard 2025)
export const VIEWPORT_BREAKPOINTS = {
  mobile: { width: 375, height: 667, icon: 'smartphone' },
  tablet: { width: 768, height: 1024, icon: 'tablet' },
  desktop: { width: 1200, height: 800, icon: 'monitor' }
} as const

export type ViewportType = keyof typeof VIEWPORT_BREAKPOINTS
export type OrientationType = 'portrait' | 'landscape'

// Crisp zoom steps to prevent text blur (expert recommendation)
export const ZOOM_STEPS = [50, 67, 75, 100, 125] as const

export interface UseResponsivePreviewOptions {
  defaultViewport?: ViewportType
  defaultZoom?: number
  defaultFit?: boolean
  defaultOrientation?: OrientationType
}

export interface UseResponsivePreviewReturn {
  // Current state
  viewport: ViewportType
  zoom: number
  fit: boolean
  orientation: OrientationType
  scale: number

  // Computed dimensions (with orientation support)
  dims: { width: number; height: number }
  actualDims: { width: number; height: number }

  // State setters
  setViewport: (viewport: ViewportType) => void
  setZoom: (zoom: number) => void
  setFit: (fit: boolean) => void
  setOrientation: (orientation: OrientationType) => void

  // Container ref for ResizeObserver
  containerRef: React.RefObject<HTMLDivElement>

  // Utility functions
  reset: () => void
  snapToNearestZoom: (zoom: number) => number
}

// URL and localStorage utilities
function getFromURL(): Partial<{
  viewport: ViewportType
  zoom: number
  fit: boolean
  orientation: OrientationType
}> {
  if (typeof window === 'undefined') return {}

  const params = new URLSearchParams(window.location.search)
  const result: any = {}

  const vp = params.get('vp')
  if (vp && ['mobile', 'tablet', 'desktop'].includes(vp)) {
    result.viewport = vp as ViewportType
  }

  const z = params.get('z')
  if (z) {
    const zoom = parseInt(z, 10)
    if (!isNaN(zoom) && zoom >= 25 && zoom <= 200) {
      result.zoom = zoom
    }
  }

  const f = params.get('fit')
  if (f === '1' || f === '0') {
    result.fit = f === '1'
  }

  const o = params.get('o')
  if (o && ['portrait', 'landscape'].includes(o)) {
    result.orientation = o as OrientationType
  }

  return result
}

function getFromLocalStorage(projectId: string): Partial<{
  viewport: ViewportType
  zoom: number
  fit: boolean
  orientation: OrientationType
}> {
  if (typeof window === 'undefined') return {}

  try {
    const key = `responsive-preview-${projectId}`
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.warn('Failed to parse responsive preview settings from localStorage:', e)
  }

  return {}
}

function saveToLocalStorage(projectId: string, state: {
  viewport: ViewportType
  zoom: number
  fit: boolean
  orientation: OrientationType
}): void {
  if (typeof window === 'undefined') return

  try {
    const key = `responsive-preview-${projectId}`
    localStorage.setItem(key, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save responsive preview settings to localStorage:', e)
  }
}

function updateURL(state: {
  viewport: ViewportType
  zoom: number
  fit: boolean
  orientation: OrientationType
}): void {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)

  // Update responsive preview params
  params.set('vp', state.viewport)
  params.set('z', state.zoom.toString())
  params.set('fit', state.fit ? '1' : '0')
  params.set('o', state.orientation)

  // Use pushState for shallow updates (doesn't trigger navigation)
  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState({}, '', newUrl)
}

// Debounce utility
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout
  return ((...args: any[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }) as T
}

export function useResponsivePreview(
  projectId: string,
  options: UseResponsivePreviewOptions = {}
): UseResponsivePreviewReturn {
  // Load order: URL → localStorage → default (expert recommended)
  const [viewport, setViewportState] = useState<ViewportType>(() => {
    const urlState = getFromURL()
    const localState = getFromLocalStorage(projectId)
    return urlState.viewport ?? localState.viewport ?? options.defaultViewport ?? 'desktop'
  })

  const [zoom, setZoomState] = useState<number>(() => {
    const urlState = getFromURL()
    const localState = getFromLocalStorage(projectId)
    return urlState.zoom ?? localState.zoom ?? options.defaultZoom ?? 100
  })

  const [fit, setFitState] = useState<boolean>(() => {
    const urlState = getFromURL()
    const localState = getFromLocalStorage(projectId)
    return urlState.fit ?? localState.fit ?? options.defaultFit ?? true
  })

  const [orientation, setOrientationState] = useState<OrientationType>(() => {
    const urlState = getFromURL()
    const localState = getFromLocalStorage(projectId)
    return urlState.orientation ?? localState.orientation ?? options.defaultOrientation ?? 'portrait'
  })

  const [scale, setScale] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  // Get base viewport dimensions
  const dims = VIEWPORT_BREAKPOINTS[viewport]

  // Apply orientation (swap width/height for landscape)
  const actualDims = orientation === 'landscape'
    ? { width: dims.height, height: dims.width }
    : dims

  // Auto-fit calculation with ResizeObserver (expert pattern)
  useEffect(() => {
    if (!containerRef.current) return

    const updateScale = () => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const containerWidth = containerRect.width
      const containerHeight = containerRect.height

      // Expert's scale calculation with blur prevention
      const base = fit
        ? Math.min(containerWidth / actualDims.width, containerHeight / actualDims.height)
        : 1

      const newScale = +((base * zoom / 100).toFixed(2)) // Round to 2 decimals
      setScale(newScale)
    }

    const ro = new ResizeObserver(() => {
      updateScale()
    })

    ro.observe(containerRef.current)
    updateScale() // Initial calculation

    return () => ro.disconnect()
  }, [viewport, zoom, fit, orientation, actualDims.width, actualDims.height])

  // Persist to URL + localStorage (debounced)
  const debouncedSave = debounce((state: {
    viewport: ViewportType
    zoom: number
    fit: boolean
    orientation: OrientationType
  }) => {
    saveToLocalStorage(projectId, state)
    updateURL(state)
  }, 150)

  useEffect(() => {
    debouncedSave({ viewport, zoom, fit, orientation })
  }, [viewport, zoom, fit, orientation, projectId, debouncedSave])

  // Utility functions
  const snapToNearestZoom = (targetZoom: number): number => {
    return ZOOM_STEPS.reduce((prev, curr) =>
      Math.abs(curr - targetZoom) < Math.abs(prev - targetZoom) ? curr : prev
    )
  }

  const setViewport = (newViewport: ViewportType) => {
    setViewportState(newViewport)
  }

  const setZoom = (newZoom: number) => {
    const clampedZoom = Math.max(25, Math.min(200, newZoom))
    setZoomState(clampedZoom)
  }

  const setFit = (newFit: boolean) => {
    setFitState(newFit)
  }

  const setOrientation = (newOrientation: OrientationType) => {
    setOrientationState(newOrientation)
  }

  const reset = () => {
    setViewportState('desktop')
    setZoomState(100)
    setFitState(true)
    setOrientationState('portrait')
  }

  return {
    viewport,
    zoom,
    fit,
    orientation,
    scale,
    dims,
    actualDims,
    setViewport,
    setZoom,
    setFit,
    setOrientation,
    containerRef,
    reset,
    snapToNearestZoom
  }
}