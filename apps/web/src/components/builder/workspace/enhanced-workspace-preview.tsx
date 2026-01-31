'use client'

import React from 'react'
import { SimpleIframePreview } from '@/components/builder/preview/simple-iframe-preview'
import { ResponsivePreviewContainer } from '@/components/builder/responsive-preview/responsive-preview-container'
import { DeviceSelectorToolbar } from '@/components/builder/responsive-preview/device-selector-toolbar'
import { useResponsivePreview } from '@/hooks/use-responsive-preview'
import { logger } from '@/utils/logger'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface EnhancedWorkspacePreviewProps {
  projectId: string
  projectData?: any
  currentBuildId?: string // Build ID from current workspace state
  enableResponsiveControls?: boolean // Feature flag for gradual rollout
  className?: string
}

export function EnhancedWorkspacePreview({
  projectId,
  projectData,
  currentBuildId,
  enableResponsiveControls = true, // Default to enabled
  className
}: EnhancedWorkspacePreviewProps) {
  // Use currentBuildId from workspace state (preferred) or fallback to projectData
  const buildId = currentBuildId || projectData?.buildId
  const previewUrl = projectData?.previewUrl
  const buildStatus = projectData?.status || projectData?.buildStatus

  // Initialize responsive preview state
  const previewState = useResponsivePreview(projectId, {
    defaultViewport: 'desktop',
    defaultZoom: 100,
    defaultFit: true,
    defaultOrientation: 'portrait'
  })

  // Translations
  const t = useTranslations('builder.workspace.preview')
  const tDevices = useTranslations('builder.workspace.devices')
  const tBuildStatus = useTranslations('builder.workspace.buildStatus')

  // Debug logging for buildId selection and preview URL
  React.useEffect(() => {
    const debugInfo = {
      currentBuildId: currentBuildId?.slice(0, 8) || 'null',
      projectDataBuildId: projectData?.buildId?.slice(0, 8) || 'null',
      selectedBuildId: buildId?.slice(0, 8) || 'null',
      previewUrl: previewUrl?.slice(0, 50) || 'null',
      buildStatus: buildStatus || 'null',
      source: currentBuildId ? 'currentBuildId' : 'projectData',
      responsiveEnabled: enableResponsiveControls
    }

    logger.info('workspace-preview', `📋 BuildId selection: ${debugInfo.selectedBuildId} (source: ${debugInfo.source})`)
    logger.info('workspace-preview', `🌐 Preview URL: ${debugInfo.previewUrl}, Status: ${debugInfo.buildStatus}`)
    logger.info('workspace-preview', `📱 Responsive controls: ${debugInfo.responsiveEnabled ? 'enabled' : 'disabled'}`)

    // CRITICAL: Warn if using stale project data instead of current buildId
    if (!currentBuildId && projectData?.buildId) {
      logger.warn('workspace-preview', `⚠️ Using potentially stale buildId from projectData: ${projectData.buildId.slice(0, 8)} (currentBuildId not provided)`)
    }
  }, [currentBuildId, projectData?.buildId, buildId, previewUrl, buildStatus, enableResponsiveControls])

  // Early return with fallback if responsive controls disabled
  if (!enableResponsiveControls) {
    return (
      <div className={cn("w-full h-full min-h-0 bg-gray-100 p-1", className)}>
        <div className="w-full h-full min-h-0 bg-white rounded overflow-hidden">
          <SimpleIframePreview
            projectId={projectId}
            buildId={buildId}
            projectPreviewUrl={previewUrl}
            projectBuildStatus={buildStatus}
            className="h-full"
          />
        </div>
      </div>
    )
  }

  // Enhanced responsive preview layout
  return (
    <div className={cn("w-full h-full min-h-0 flex flex-col", className)}>
      {/* Device selector toolbar */}
      <DeviceSelectorToolbar
        previewState={previewState}
        className="flex-shrink-0 min-w-0"
        showQuickReset={true}
      />

      {/* Responsive preview container */}
      <div className="flex-1 min-h-0">
        {previewUrl ? (
          <ResponsivePreviewContainer
            url={previewUrl}
            projectId={projectId}
            previewState={previewState}
            className="h-full"
            onLoad={() => {
              logger.debug('workspace-preview', 'Responsive preview loaded successfully')
            }}
            onError={() => {
              logger.warn('workspace-preview', 'Responsive preview failed to load')
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-gray-400 text-6xl mb-4">📱</div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('noPreviewAvailable')}</h3>
              <p className="text-gray-600 max-w-md">
                {buildStatus === 'building' || buildStatus === 'queued'
                  ? t('projectBuilding')
                  : t('projectNotBuilt')
                }
              </p>
              {buildId && (
                <p className="text-xs text-gray-500 mt-2">
                  {t('buildId', { id: buildId.slice(0, 8) })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        <div className="flex items-center justify-between gap-4 min-w-0 overflow-x-auto whitespace-nowrap">
          <div className="flex items-center gap-4 shrink-0">
            <span>{t('project', { id: projectId.slice(0, 8) })}</span>
            {buildId && <span>{t('build', { id: buildId.slice(0, 8) })}</span>}
            {buildStatus && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shrink-0",
                buildStatus === 'deployed' && "bg-green-100 text-green-800",
                buildStatus === 'building' && "bg-blue-100 text-blue-800",
                buildStatus === 'failed' && "bg-red-100 text-red-800",
                buildStatus === 'queued' && "bg-yellow-100 text-yellow-800"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  buildStatus === 'deployed' && "bg-green-500",
                  buildStatus === 'building' && "bg-blue-500 animate-pulse",
                  buildStatus === 'failed' && "bg-red-500",
                  buildStatus === 'queued' && "bg-yellow-500"
                )} />
                {tBuildStatus(buildStatus)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span>{t('viewport', { viewport: tDevices(previewState.viewport), orientation: tDevices(previewState.orientation) })}</span>
            <span>{t('scale', { scale: String(Math.round(previewState.scale * 100)) })}</span>
            <span>{t('mode', { mode: previewState.fit ? tDevices('fit') : tDevices('pixel') })}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Export both for backward compatibility
export { EnhancedWorkspacePreview as ResponsiveWorkspacePreview }