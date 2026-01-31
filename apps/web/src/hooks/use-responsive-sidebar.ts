'use client'

import { useState, useEffect, useCallback } from 'react'
import { useResponsive } from './use-responsive'

export interface ResponsiveSidebarState {
  isCollapsed: boolean
  isVisible: boolean
  autoCollapse: boolean
  canCollapse: boolean
  sidebarWidth: string
}

/**
 * Hook for managing responsive sidebar behavior
 * Handles auto-collapse on tablet breakpoints and manual toggle
 */
export const useResponsiveSidebar = () => {
  const { showMobileUI, viewport, width, isHydrated } = useResponsive()
  
  // Initial state based on viewport
  const getInitialState = useCallback(() => {
    // Only consider mobile UI after hydration is complete
    if (isHydrated && showMobileUI) {
      return {
        isCollapsed: true,
        isVisible: false,
        autoCollapse: true,
        canCollapse: false,
        sidebarWidth: 'w-0'
      }
    }
    
    // Auto-collapse on tablet-size screens to give more room
    const shouldAutoCollapse = viewport === 'tablet' || (width > 768 && width < 1024)
    
    return {
      isCollapsed: shouldAutoCollapse,
      isVisible: true,
      autoCollapse: shouldAutoCollapse,
      canCollapse: true,
      sidebarWidth: shouldAutoCollapse ? 'w-16' : 'w-80 lg:w-96 xl:w-[400px]'
    }
  }, [showMobileUI, viewport, width, isHydrated])

  const [state, setState] = useState<ResponsiveSidebarState>(getInitialState)

  // Update state when viewport changes
  useEffect(() => {
    const newState = getInitialState()
    setState(prevState => ({
      ...newState,
      // Preserve user preference if they manually toggled
      isCollapsed: prevState.autoCollapse ? newState.isCollapsed : prevState.isCollapsed
    }))
  }, [getInitialState])

  const toggleSidebar = useCallback(() => {
    if (!state.canCollapse) return
    
    setState(prev => ({
      ...prev,
      isCollapsed: !prev.isCollapsed,
      autoCollapse: false, // User took manual control
      sidebarWidth: !prev.isCollapsed 
        ? 'w-16' 
        : 'w-80 lg:w-96 xl:w-[400px]'
    }))
  }, [state.canCollapse])

  const expandSidebar = useCallback(() => {
    if (!state.canCollapse) return
    
    setState(prev => ({
      ...prev,
      isCollapsed: false,
      sidebarWidth: 'w-80 lg:w-96 xl:w-[400px]'
    }))
  }, [state.canCollapse])

  const collapseSidebar = useCallback(() => {
    if (!state.canCollapse) return
    
    setState(prev => ({
      ...prev,
      isCollapsed: true,
      sidebarWidth: 'w-16'
    }))
  }, [state.canCollapse])

  return {
    ...state,
    toggleSidebar,
    expandSidebar,
    collapseSidebar
  }
}

/**
 * Hook for sidebar responsive CSS classes
 */
export const useSidebarClasses = () => {
  const sidebarState = useResponsiveSidebar()
  
  return {
    sidebarContainer: `
      flex-shrink-0 border-r border-gray-700 transition-all duration-300 ease-in-out
      ${sidebarState.isVisible ? 'flex' : 'hidden md:flex'} flex-col bg-gray-900
      ${sidebarState.sidebarWidth}
    `,
    sidebarContent: `
      flex-1 overflow-hidden ${sidebarState.isCollapsed ? 'hidden' : 'block'}
    `,
    collapseButton: `
      p-2 hover:bg-gray-800 rounded transition-colors
      ${sidebarState.canCollapse ? 'block' : 'hidden'}
    `,
    collapsedIconNav: `
      flex-1 flex flex-col items-center py-4 space-y-4
      ${sidebarState.isCollapsed ? 'block' : 'hidden'}
    `
  }
}