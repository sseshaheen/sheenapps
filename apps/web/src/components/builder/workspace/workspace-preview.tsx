'use client'

import React from 'react'
import { SimpleIframePreview } from '@/components/builder/preview/simple-iframe-preview'
import { EnhancedWorkspacePreview } from './enhanced-workspace-preview'
import { logger } from '@/utils/logger'

// Feature flag for responsive preview controls
// eslint-disable-next-line no-restricted-globals
const ENABLE_RESPONSIVE_PREVIEW = process.env.NEXT_PUBLIC_ENABLE_RESPONSIVE_PREVIEW !== 'false'

interface WorkspacePreviewProps {
  projectId: string
  projectData?: any
  currentBuildId?: string // Build ID from current workspace state
}

export function WorkspacePreview({ projectId, projectData, currentBuildId }: WorkspacePreviewProps) {
  // Fallback to original simple preview
  const buildId = currentBuildId || projectData?.buildId
  const previewUrl = projectData?.previewUrl
  const buildStatus = projectData?.status || projectData?.buildStatus

  // Debug logging for buildId selection and preview URL
  React.useEffect(() => {
    if (ENABLE_RESPONSIVE_PREVIEW) {
      return
    }

    const debugInfo = {
      currentBuildId: currentBuildId?.slice(0, 8) || 'null',
      projectDataBuildId: projectData?.buildId?.slice(0, 8) || 'null',
      selectedBuildId: buildId?.slice(0, 8) || 'null',
      previewUrl: previewUrl?.slice(0, 50) || 'null',
      buildStatus: buildStatus || 'null',
      source: currentBuildId ? 'currentBuildId' : 'projectData',
      responsiveEnabled: false
    }

    logger.info('workspace-preview', `📋 BuildId selection: ${debugInfo.selectedBuildId} (source: ${debugInfo.source})`)
    logger.info('workspace-preview', `🌐 Preview URL: ${debugInfo.previewUrl}, Status: ${debugInfo.buildStatus}`)
    logger.info('workspace-preview', `📱 Responsive controls: disabled (fallback mode)`)

    // CRITICAL: Warn if using stale project data instead of current buildId
    if (!currentBuildId && projectData?.buildId) {
      logger.warn('workspace-preview', `⚠️ Using potentially stale buildId from projectData: ${projectData.buildId.slice(0, 8)} (currentBuildId not provided)`)
    }
  }, [currentBuildId, projectData?.buildId, buildId, previewUrl, buildStatus])

  // Use enhanced responsive preview if enabled, otherwise fallback to simple preview
  if (ENABLE_RESPONSIVE_PREVIEW) {
    return (
      <EnhancedWorkspacePreview
        projectId={projectId}
        projectData={projectData}
        currentBuildId={currentBuildId}
        enableResponsiveControls={true}
        className="w-full h-full min-h-0"
      />
    )
  }

  return (
    <div className="w-full h-full min-h-0 bg-gray-100 p-1">
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
