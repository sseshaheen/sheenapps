'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'
import { useTranslations } from 'next-intl'

interface ContainerQueryWorkspaceProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  header?: React.ReactNode
  className?: string
  isFullscreen?: boolean
  sidebarCollapsed?: boolean
  onSidebarCollapseChange?: (collapsed: boolean) => void
}

/**
 * Modern workspace layout using CSS Container Queries
 * Replaces useResponsive() and useResponsiveSidebar() hooks with pure CSS
 * 
 * Expert pattern applied:
 * 1. Container type: inline-size for responsive behavior
 * 2. Named container to prevent query leakage
 * 3. CSS handles all responsive logic
 * 4. No JavaScript viewport detection needed
 */
export function ContainerQueryWorkspace({
  children,
  sidebar,
  header,
  className,
  isFullscreen = false,
  sidebarCollapsed = false,
  onSidebarCollapseChange,
}: ContainerQueryWorkspaceProps) {
  const t = useTranslations('builder.workspace.chat')
  // 2025 SINGLE SOURCE OF TRUTH: No local state, parent controls everything
  const handleSidebarToggle = React.useCallback(() => {
    onSidebarCollapseChange?.(!sidebarCollapsed)
  }, [sidebarCollapsed, onSidebarCollapseChange])

  return (
    <div
      className={cn(
        'flex-1 flex flex-col overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* EXPERT FIX: Keep header in-flow so it doesn't overlay the preview */}
      {header && (
        <div className="flex-shrink-0 w-full max-w-full min-w-0 bg-gray-800 border-b border-gray-700">
          {header}
        </div>
      )}

      {/* EXPERT FIX: Workspace container - keep it simple and in-flow */}
      <div
        className={cn(
          "cq-workspace [container-type:inline-size]",
          "flex-1 flex flex-col md:flex-row overflow-hidden"
        )}
      >
        {sidebar && (
          <aside
              className={cn(
                'shrink-0 min-h-0 border-r border-gray-700 bg-gray-900',
                'flex flex-col transition-all duration-300 ease-in-out hide-on-mobile',
                sidebarCollapsed ? 'w-16 sidebar-collapsed' : 'w-80 lg:w-96 xl:w-[400px] sidebar-expanded',
                'sidebar-auto-collapse @lg:sidebar-auto-expand'
              )}
          >
            {/* 2025 UX PATTERN: Enhanced collapse button with tooltip and smooth animations */}
            <div className="flex justify-end p-2 border-b border-gray-700/50 desktop-only">
              <div className="relative group">
                <button
                  onClick={handleSidebarToggle}
                  className={cn(
                    "p-2 rounded-lg transition-all duration-200",
                    "min-h-[36px] min-w-[36px] flex items-center justify-center",
                    "hover:bg-gray-800 hover:scale-105 active:scale-95",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900",
                    "group-hover:shadow-lg"
                  )}
                  aria-label={sidebarCollapsed ? 'Expand chat sidebar' : 'Collapse chat sidebar'}
                >
                  <Icon 
                    name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} 
                    className={cn(
                      "w-4 h-4 transition-all duration-200",
                      "text-gray-400 group-hover:text-white",
                      "group-hover:scale-110"
                    )} 
                  />
                </button>
                
                {/* Tooltip - 2025 accessibility pattern */}
                <div className={cn(
                  "absolute top-full left-1/2 transform -translate-x-1/2 mt-2",
                  "px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg",
                  "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                  "pointer-events-none whitespace-nowrap z-50",
                  "border border-gray-700"
                )}>
                  {sidebarCollapsed ? t('expandChat') : t('collapseChat')}
                  <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-800 border-l border-t border-gray-700 rotate-45"></div>
                </div>
              </div>
            </div>
            {/* EXPERT FIX: Height-bearing wrapper for definite height resolution */}
            <div className="flex-1 min-h-0 h-full">
              {sidebar}
            </div>
          </aside>
        )}

        <main className="flex-1 flex flex-col overflow-hidden bg-gray-900">
          {children}
        </main>
      </div>
    </div>
  )
}

// Export for testing and comparison
export { ContainerQueryWorkspace as ModernWorkspace }