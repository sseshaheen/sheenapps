'use client'

import React, { useEffect } from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import {
  type ViewportType,
  type OrientationType,
  type UseResponsivePreviewReturn,
  VIEWPORT_BREAKPOINTS,
  ZOOM_STEPS
} from '@/hooks/use-responsive-preview'

interface DeviceSelectorToolbarProps {
  previewState: UseResponsivePreviewReturn
  className?: string
  showQuickReset?: boolean
}

export function DeviceSelectorToolbar({
  previewState,
  className,
  showQuickReset = true
}: DeviceSelectorToolbarProps) {
  const {
    viewport,
    zoom,
    fit,
    orientation,
    scale,
    actualDims,
    setViewport,
    setZoom,
    setFit,
    setOrientation,
    reset,
    snapToNearestZoom
  } = previewState
  const t = useTranslations('builder.workspace.devices')

  // Device labels mapping
  const deviceLabels: Record<ViewportType, string> = {
    mobile: t('mobile'),
    tablet: t('tablet'),
    desktop: t('desktop')
  }

  // Orientation labels
  const orientationLabel = orientation === 'portrait' ? t('portrait') : t('landscape')

  // Keyboard shortcuts (expert: avoid Cmd conflicts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with modifier keys or when typing in inputs
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case '1':
          e.preventDefault()
          setViewport('mobile')
          break
        case '2':
          e.preventDefault()
          setViewport('tablet')
          break
        case '3':
          e.preventDefault()
          setViewport('desktop')
          break
        case '[':
          e.preventDefault()
          {
            const currentIndex = ZOOM_STEPS.indexOf(zoom as any)
            const nextIndex = Math.max(0, currentIndex - 1)
            setZoom(ZOOM_STEPS[nextIndex])
          }
          break
        case ']':
          e.preventDefault()
          {
            const currentIndex = ZOOM_STEPS.indexOf(zoom as any)
            const nextIndex = Math.min(ZOOM_STEPS.length - 1, currentIndex + 1)
            setZoom(ZOOM_STEPS[nextIndex])
          }
          break
        case 'r':
          if (!e.shiftKey) {
            e.preventDefault()
            setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewport, zoom, orientation, setViewport, setZoom, setOrientation])

  const copyDimensions = async () => {
    try {
      await navigator.clipboard?.writeText(`${actualDims.width} × ${actualDims.height}`)
    } catch (e) {
      console.warn('Failed to copy dimensions:', e)
    }
  }

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 p-3 border-b border-border bg-background",
      "min-w-0 overflow-x-auto whitespace-nowrap", // Scroll on mobile, no text wrap
      className
    )}>
      {/* Left side - Device buttons and controls */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Device selector radiogroup - inline-flex w-fit sizes to content, prevents "gray slab" */}
        <div
          role="radiogroup"
          aria-label="Device viewport selection"
          className="inline-flex w-fit gap-1 p-1 bg-gray-200 dark:bg-gray-900 rounded-lg flex-none"
        >
          {(['mobile', 'tablet', 'desktop'] as const).map((device) => (
            <button
              key={device}
              role="radio"
              aria-checked={viewport === device}
              onClick={() => setViewport(device)}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                "flex items-center gap-2 min-h-[44px] shrink-0 whitespace-nowrap", // Touch-friendly, no shrink/wrap
                viewport === device
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-800/50"
              )}
              title={t('switchTo', { device: deviceLabels[device], key: device === 'mobile' ? '1' : device === 'tablet' ? '2' : '3' })}
            >
              <Icon name={VIEWPORT_BREAKPOINTS[device].icon} className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{deviceLabels[device]}</span>
            </button>
          ))}
        </div>

        {/* Orientation toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}
          className="flex items-center gap-2 shrink-0"
          title={t('toggleOrientation', { orientation: orientationLabel })}
        >
          <Icon
            name="rotate-cw"
            className={cn(
              "w-4 h-4 transition-transform",
              orientation === 'landscape' && "rotate-90"
            )}
          />
          <span className="hidden md:inline">{orientationLabel}</span>
        </Button>

        {/* Fit mode toggle */}
        <Button
          variant={fit ? "default" : "outline"}
          size="sm"
          onClick={() => setFit(!fit)}
          className="min-w-[60px] shrink-0"
          title={t('displayMode', { mode: fit ? t('fitToContainer') : t('pixelAccurate') })}
        >
          {fit ? t('fit') : t('pixel')}
        </Button>

        {/* Zoom controls - keep LTR for RTL layouts (numeric +/- stays consistent) */}
        <div dir="ltr" className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const currentIndex = ZOOM_STEPS.indexOf(zoom as any)
              const nextIndex = Math.max(0, currentIndex - 1)
              setZoom(ZOOM_STEPS[nextIndex])
            }}
            disabled={zoom <= ZOOM_STEPS[0]}
            title={t('zoomOut')}
            className="w-8 h-8 p-0"
          >
            <Icon name="minus" className="w-4 h-4" />
          </Button>

          <span className="text-sm font-mono min-w-[50px] text-center">
            {zoom}%
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const currentIndex = ZOOM_STEPS.indexOf(zoom as any)
              const nextIndex = Math.min(ZOOM_STEPS.length - 1, currentIndex + 1)
              setZoom(ZOOM_STEPS[nextIndex])
            }}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            title={t('zoomIn')}
            className="w-8 h-8 p-0"
          >
            <Icon name="plus" className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Right side - Status and actions */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Copyable dimension chip - clamped width to prevent "gray slab" on mobile */}
        <button
          onClick={copyDimensions}
          className={cn(
            "shrink-0 inline-flex items-center gap-2",
            "px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors cursor-pointer",
            "max-w-[190px] sm:max-w-none" // Clamp on mobile to prevent expansion
          )}
          title={t('copyDimensions')}
        >
          <span className="font-mono truncate">
            {actualDims.width} × {actualDims.height}
          </span>
          {/* Hide scale on very small screens to reduce width pressure */}
          <span className="hidden sm:inline text-xs text-gray-600 dark:text-gray-400 shrink-0">
            @ {Math.round(scale * 100)}%
          </span>
        </button>

        {/* Quick reset */}
        {showQuickReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground"
            title={t('resetToDefault')}
          >
            {t('reset')}
          </Button>
        )}
      </div>

      {/* Screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {t('ariaLabel', {
          viewport: deviceLabels[viewport],
          width: String(actualDims.width),
          height: String(actualDims.height),
          scale: String(Math.round(scale * 100)),
          orientation: orientationLabel,
          mode: fit ? t('fitToContainer') : t('pixelAccurate')
        })}
      </div>
    </div>
  )
}