'use client'

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { type UseResponsivePreviewReturn } from '@/hooks/use-responsive-preview'
import { useTranslations } from 'next-intl'

interface ResponsivePreviewContainerProps {
  url: string
  projectId: string
  previewState: UseResponsivePreviewReturn
  className?: string
  onLoad?: () => void
  onError?: () => void
  children?: React.ReactNode
}

export function ResponsivePreviewContainer({
  url,
  projectId,
  previewState,
  className,
  onLoad,
  onError,
  children
}: ResponsivePreviewContainerProps) {
  const { containerRef, actualDims, scale, fit } = previewState
  const [isLoading, setIsLoading] = useState(false)
  const t = useTranslations('builder.workspace.devices')
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false)

  // Set loading state when URL changes
  useEffect(() => {
    setIsLoading(true)
  }, [url])

  // Handle loading state transitions
  useEffect(() => {
    if (isLoading) {
      // Show skeleton after 200ms delay (expert recommendation)
      const timer = setTimeout(() => {
        setShowLoadingSkeleton(true)
      }, 200)

      return () => clearTimeout(timer)
    } else {
      setShowLoadingSkeleton(false)
    }
  }, [isLoading])

  const handleIframeLoad = () => {
    setIsLoading(false)
    onLoad?.()
  }

  const handleIframeError = () => {
    setIsLoading(false)
    onError?.()
  }

  // Enhanced sandbox logic with safe origin check
  const getSandboxAttributes = () => {
    const baseAttributes = "allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals allow-downloads"

    // Safe same-origin check using URL parsing (prevents URL spoofing)
    const isSameOrigin = (() => {
      try {
        return new URL(url).origin === window.location.origin
      } catch {
        return false
      }
    })()

    return isSameOrigin
      ? `allow-same-origin ${baseAttributes}`
      : baseAttributes
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "preview-container relative flex-1 overflow-hidden",
        "bg-gray-50", // Light background for better contrast
        className
      )}
      onWheel={(e) => {
        // Expert: Don't hijack mouse-wheel when zoomed - let iframe scroll naturally
        if (scale !== 1) {
          e.stopPropagation()
        }
      }}
    >
      {/* Scrollable area for the preview - flex centering instead of grid */}
      <div className="absolute inset-0 overflow-auto">
        <div className="min-h-full min-w-full flex items-start justify-center p-3">
          {/* Main preview frame with transform scaling */}
          <div
            className="preview-frame relative origin-top will-change-transform"
            style={{
              width: actualDims.width,
              height: actualDims.height,
              transform: `scale(${scale})`,
              transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* Iframe with stable key (no reloads!) */}
            <iframe
              key={`preview-${projectId}`}
              className="w-full h-full block border-0 rounded-lg shadow-lg"
              src={url}
              title="Responsive preview"
              referrerPolicy="no-referrer"
              loading="eager"
              sandbox={getSandboxAttributes()}
              allow="fullscreen"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />

            {/* Loading skeleton overlay */}
            {showLoadingSkeleton && (
              <div className="absolute inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-4" />
                  <p className="text-sm text-gray-600">{t('updatingPreview')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overlays (toolbars, device frames, etc.) - absolute positioned with constraints */}
      {children && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
          <div className="pointer-events-auto">
            {children}
          </div>
        </div>
      )}

      {/* Display mode indicator - constrained to container bounds */}
      <div className="absolute bottom-4 left-4 z-30 px-3 py-2 bg-black/90 text-white text-xs rounded-lg max-w-[calc(100%-2rem)]">
        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis">
          <span className="text-white/90">
            {actualDims.width} × {actualDims.height}
          </span>
          <span className="text-blue-300">
            @ {Math.round(scale * 100)}%
          </span>
          <span className="text-white/90">
            {fit ? t('fit') : t('pixel')}
          </span>
        </div>
      </div>
    </div>
  )
}