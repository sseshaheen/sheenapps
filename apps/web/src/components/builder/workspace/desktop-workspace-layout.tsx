'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'
import { useResponsiveSidebar } from '@/hooks/use-responsive-sidebar'

interface DesktopWorkspaceLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  header?: React.ReactNode
  className?: string
}

/**
 * Enhanced desktop workspace layout component
 * Provides responsive sidebar, header, and main content areas
 */
export function DesktopWorkspaceLayout({ 
  children, 
  sidebar, 
  header,
  className 
}: DesktopWorkspaceLayoutProps) {
  const sidebarState = useResponsiveSidebar()

  return (
    <div className={cn(
      "flex flex-col min-h-0",
      className
    )}>
      {/* Header */}
      {header && (
        <div className="flex-shrink-0 border-b border-gray-700">
          {header}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebar && sidebarState.isVisible && (
          <div className={cn(
            "flex-shrink-0 border-r border-gray-700 transition-all duration-300 ease-in-out",
            "hidden md:flex flex-col bg-gray-900",
            sidebarState.sidebarWidth
          )}>
            {/* Sidebar Collapse Button */}
            {sidebarState.canCollapse && (
              <div className="flex justify-end p-2 border-b border-gray-700/50">
                <button
                  onClick={sidebarState.toggleSidebar}
                  className="p-1 hover:bg-gray-800 rounded transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                  aria-label={sidebarState.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <Icon 
                    name={sidebarState.isCollapsed ? 'chevron-right' : 'chevron-left'} 
                    className="w-4 h-4 text-gray-400 hover:text-gray-300" 
                  />
                </button>
              </div>
            )}

            {/* Sidebar Content */}
            <div className={cn(
              "flex-1 min-h-0", // MODERN 2024 FIX: Remove overflow-hidden, add min-h-0 for flex
              sidebarState.isCollapsed && "hidden"
            )}>
              {sidebar}
            </div>

            {/* Collapsed Sidebar - Single Expand Button */}
            {sidebarState.isCollapsed && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <button 
                  className="w-10 h-10 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center justify-center transition-colors shadow-lg"
                  onClick={sidebarState.expandSidebar}
                  aria-label="Expand chat sidebar"
                  title="Expand chat sidebar"
                >
                  <Icon name="message-circle" className="w-5 h-5 text-white" />
                </button>
                <div className="mt-2 text-xs text-gray-400 text-center px-1">
                  Chat
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}