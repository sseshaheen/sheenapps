'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { useResponsive } from '@/hooks/use-responsive'
import { MobileWorkspaceLayout } from './mobile-workspace-layout'
import { DesktopWorkspaceLayout } from './desktop-workspace-layout'

interface AdaptiveWorkspaceLayoutProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  header?: React.ReactNode
  isFullscreen?: boolean
  isLoading?: boolean
}

/**
 * Adaptive workspace layout that switches between mobile and desktop layouts
 * based on viewport size. Provides responsive foundation for the builder.
 */
export function AdaptiveWorkspaceLayout({ 
  children,
  sidebar,
  header,
  isFullscreen = false,
  isLoading = false
}: AdaptiveWorkspaceLayoutProps) {
  const { showMobileUI, viewport, isPortrait, isHydrated } = useResponsive()

  return (
    <>
      {/* Only show mobile UI after hydration confirms we're on mobile */}
      {isHydrated && showMobileUI ? (
        <MobileWorkspaceLayout 
          viewport={viewport} 
          isPortrait={isPortrait}
          isLoading={isLoading}
          header={header}
        >
          {children}
        </MobileWorkspaceLayout>
      ) : (
        <div className={cn(
          "flex flex-col bg-gray-900 text-white overflow-hidden desktop-workspace min-h-0",
          isFullscreen ? "fixed inset-0 z-50" : "h-full"
        )}>
          <DesktopWorkspaceLayout 
            sidebar={sidebar}
            header={header}
            className="flex-1 min-h-0"
          >
            {children}
          </DesktopWorkspaceLayout>
        </div>
      )}
    </>
  )
}

/**
 * Legacy workspace layout wrapper for backward compatibility
 * This will be replaced gradually as we migrate components
 */
export function WorkspaceLayoutWrapper({ children, sidebar, header, isFullscreen }: AdaptiveWorkspaceLayoutProps) {
  const { showMobileUI, isHydrated } = useResponsive()
  
  // For now, use the original layout for desktop and new adaptive for mobile
  // Only switch to mobile after hydration confirms viewport
  if (!isHydrated || !showMobileUI) {
    return (
      <div className={cn(
        "flex flex-col bg-gray-900 text-white",
        isFullscreen ? "fixed inset-0 z-50" : "h-screen"
      )}>
        {children}
      </div>
    )
  }

  return (
    <AdaptiveWorkspaceLayout 
      sidebar={sidebar}
      header={header}
      isFullscreen={isFullscreen}
    >
      {children}
    </AdaptiveWorkspaceLayout>
  )
}