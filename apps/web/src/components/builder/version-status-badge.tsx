
'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'
import { useTransitionFeedback } from '@/hooks/use-build-status-transitions'
import { useCleanBuildEvents } from '@/hooks/use-clean-build-events'
import { useProjectStatus } from '@/hooks/use-project-status'
import { useCurrentVersion } from '@/hooks/use-version-history'
import { useVersionManagement } from '@/hooks/use-version-management'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { useBuildStateStore } from '@/store/build-state-store'
import { logger } from '@/utils/logger'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { StatusTransitionFeedback } from './status-transition-feedback'
import { VersionHistoryModal } from './version-history-modal'

interface VersionStatusBadgeProps {
  projectId: string
  className?: string
  variant?: 'desktop' | 'mobile'
}

/**
 * Simplified version status badge with real API integration
 * Progressive disclosure: Level 1 (status) → Level 2 (quick actions)
 */
export function VersionStatusBadge({ projectId, className, variant = 'desktop' }: VersionStatusBadgeProps) {
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const { user } = useAuthStore()
  const { success: showSuccessToast, error: showErrorToast } = useToastWithUndo()
  const queryClient = useQueryClient()
  const t = useTranslations('builder.workspace.version')

  // Get current buildId from global store
  const currentBuildId = useBuildStateStore(state => state.currentBuildId)
  const userId = user?.id || ''

  // Track status transitions for animations
  const {
    currentStatus,
    showSuccessAnimation,
    showFailureAnimation,
    animationMessage,
    dismissAnimation,
    isRollingBack,
    lastEvent
  } = useTransitionFeedback(projectId)

  // Force refetch when rollback starts
  useEffect(() => {
    if (lastEvent === 'rollback_started') {
      logger.info('🔄 Rollback started, increasing polling frequency')
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['project-status', projectId] })
        queryClient.invalidateQueries({ queryKey: ['version-history', projectId] })
      }, 2000) // Poll every 2 seconds during rollback

      return () => clearInterval(interval)
    }
  }, [lastEvent, projectId, queryClient])

  // Monitor build events to determine if we're waiting for version
  const {
    hasDeployCompleted,
    hasRecommendationsGenerated,
    isComplete
  } = useCleanBuildEvents(currentBuildId, userId, {
    autoPolling: true,
    projectBuildStatus: null
  })

  // Determine if we're waiting for version name (deploy complete but no recommendations yet)
  const isWaitingForVersion = !!(currentBuildId && hasDeployCompleted && !hasRecommendationsGenerated && !isComplete)

  // Log state changes for debugging
  useEffect(() => {
    if (currentBuildId) {
      logger.info('🏷️ Version badge state', {
        buildId: currentBuildId.slice(0, 8),
        hasDeployCompleted,
        hasRecommendationsGenerated,
        isComplete,
        isWaitingForVersion
      }, 'version-badge')
    }
  }, [currentBuildId, hasDeployCompleted, hasRecommendationsGenerated, isComplete, isWaitingForVersion])

  // When recommendations are generated, refetch version info
  useEffect(() => {
    if (hasRecommendationsGenerated && currentBuildId) {
      logger.info('📦 Recommendations generated, fetching updated version info', {
        buildId: currentBuildId.slice(0, 8),
        projectId
      }, 'version-badge')

      // Invalidate version queries to fetch fresh data
      queryClient.invalidateQueries({ queryKey: ['version-history', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-status', projectId] })
    }
  }, [hasRecommendationsGenerated, currentBuildId, projectId, queryClient])

  // Real API data
  const { data: projectStatus, isLoading: isProjectLoading, error: projectError } = useProjectStatus(projectId)
  const { data: currentVersion, isLoading: isVersionLoading, error: versionError } = useCurrentVersion(projectId)
  const {
    publish,
    unpublish,
    canPublish,
    canUnpublish,
    isPublishing,
    isUnpublishing,
    publishError,
    unpublishError
  } = useVersionManagement({
    projectId,
    onSuccess: (operation, result: any) => {
      logger.info(`✅ ${operation} successful:`, result)
      setShowQuickActions(false)

      // Show success toast with appropriate message
      if (operation === 'publish') {
        const version = result.publishedVersion?.semver || result.publishedVersion?.name || 'Version'
        showSuccessToast(`🎉 ${version} is now live on your site!`)
      } else if (operation === 'unpublish') {
        showSuccessToast('Your site has been taken offline')
      }
    },
    onError: (operation, error) => {
      logger.error(`❌ ${operation} failed:`, error)
      // Keep modals open to show error state

      // Show error toast
      const errorMessage = error.message || `Failed to ${operation}`
      showErrorToast(errorMessage)
    }
  })

  // Loading state
  const isLoading = isProjectLoading || isVersionLoading
  const hasError = projectError || versionError

  // TODO: Remove debug logging once version display is working correctly
  // React.useEffect(() => {
  //   console.log('🔍 Version Status Badge Debug:', {
  //     isProjectLoading,
  //     isVersionLoading,
  //     projectStatus,
  //     currentVersion,
  //     projectError,
  //     versionError
  //   })
  // }, [isProjectLoading, isVersionLoading, projectStatus, currentVersion, projectError, versionError])

  // Derive display data from real API
  const getVersionDisplay = () => {
    // If rolling back, show special indicator
    if (isRollingBack) {
      return (
        <span className="flex items-center gap-1">
          <Icon name="rotate-ccw" className="w-3 h-3 animate-spin" />
          <span className="text-xs">{t('rollingBack')}</span>
        </span>
      )
    }

    // If waiting for version name (deploy complete but metadata processing)
    if (isWaitingForVersion) {
      return (
        <span className="flex items-center gap-1">
          <Icon name="loader-2" className="w-3 h-3 animate-spin" />
          <span className="text-xs">{t('processing')}</span>
        </span>
      )
    }

    // Priority 1: Use display name from Worker API if available
    if (currentVersion?.name) {
      return currentVersion.name
    }

    // Priority 2: Fallback to semantic version if name not available
    if (currentVersion?.semver) {
      return currentVersion.semver
    }

    // Priority 3: Use current_version_id from database if available
    if (projectStatus?.currentVersionId) {
      return projectStatus.currentVersionId.slice(-8)
    }

    // Priority 3: If we're still loading, show loading
    if (isLoading) {
      return t('loading')
    }

    // Priority 4: If deployed but no version info, show "v1.0"
    if (projectStatus?.buildStatus === 'deployed') {
      return 'v1.0'
    }

    // Priority 5: Show generic version
    return 'v1.0'
  }

  const versionDisplay = getVersionDisplay()
  const previewUrl = currentVersion?.previewUrl || projectStatus?.previewUrl
  const isPublished = currentVersion?.isPublished || false
  const isDeployed = projectStatus?.buildStatus === 'deployed'
  const isBuilding = projectStatus?.buildStatus === 'building'
  const isFailed = projectStatus?.buildStatus === 'failed'
  const canPreview = currentVersion?.canPreview && !!previewUrl

  // Get domains for published status
  const getDomainText = () => {
    if (projectStatus?.subdomain) {
      return `${projectStatus.subdomain}.sheenapps.com`
    }
    return t('yourDomains')
  }

  // Human-friendly status text for non-technical users
  const getStatusText = () => {
    if (hasError) return t('errorLoading')
    if (isWaitingForVersion) return t('finalizingVersion')
    if (isLoading) return t('loading')
    if (isRollingBack) return t('loading')
    if (isPublishing) return t('makingLive')
    if (isUnpublishing) return t('takingOffline')
    if (isBuilding) return t('creatingVersion')
    if (isPublished) return t('liveOnSite')
    // If we have a version but it's not published, it's ready to go live
    if (currentVersion && !isPublished) return t('readyToPublish')
    // No version exists yet
    if (!currentVersion && !projectStatus?.currentVersionId) return t('noVersion')
    return t('readyToPublish')
  }

  const getStatusIcon = () => {
    if (hasError) return '❌'
    if (isLoading) return '⏳'
    if (isRollingBack) return '↩️'
    if (isPublishing || isUnpublishing) return '🔄'
    if (isBuilding) return '🏗️'
    if (isPublished) return '✅'
    // If we have a version ready to publish
    if (currentVersion && !isPublished) return '📦'
    // No version yet
    if (!currentVersion && !projectStatus?.currentVersionId) return '⚪'
    return '📦'
  }

  const handleGoLive = async () => {
    // Check if we have a version to publish
    if (!currentVersion?.id) {
      logger.warn('Cannot publish: no current version available')
      return
    }

    try {
      await publish({
        versionId: currentVersion.id,
        comment: '', // No default comment - let user add if they want
        source: 'version_status_badge'
      })
    } catch (error) {
      logger.error('Failed to go live:', error)
    }
  }


  const handleVersionHistory = () => {
    logger.info('Opening version history for project:', projectId)
    setShowQuickActions(false)
    setShowVersionHistory(true)
  }

  const handleTakeOffline = async () => {
    if (!canUnpublish()) {
      logger.warn('Cannot unpublish: conditions not met')
      return
    }

    const confirmed = confirm(t('confirmTakeOffline', { domain: getDomainText() }))
    if (!confirmed) return

    try {
      await unpublish({
        source: 'version_status_badge'
      })
    } catch (error) {
      logger.error('Failed to take site offline:', error)
    }
  }

  // Determine button styling based on VERSION state
  const getButtonClassName = () => {
    const baseColors = (() => {
      if (hasError) return "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:text-white"
      if (isLoading) return "bg-gray-500/10 text-gray-400 border-gray-500/30"
      if (isRollingBack) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 animate-pulse"
      if (isPublishing || isUnpublishing) return "bg-blue-500/10 text-blue-400 border-blue-500/30"
      if (isBuilding) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20 hover:text-white"
      if (isPublished) return "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20 hover:text-white"
      // Ready to publish - inviting blue color
      if (currentVersion && !isPublished) return "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20 hover:text-white"
      // No version yet
      return "bg-gray-500/10 text-gray-400 border-gray-500/30 hover:bg-gray-500/20 hover:text-white"
    })()

    return baseColors
  }

  // Get compact status indicator for mobile
  const getStatusIndicator = () => {
    if (isRollingBack) return "🔄"
    if (isPublishing || isUnpublishing) return "🔄"
    if (isBuilding) return "🔄"
    if (isPublished) return "🟢"
    if (currentVersion && !isPublished) return "🔵"
    return "⚫"
  }

  return (
    <>
      {/* Status Transition Feedback Animations */}
      <StatusTransitionFeedback
        show={showSuccessAnimation}
        type="success"
        message={animationMessage}
        onDismiss={dismissAnimation}
      />

      <StatusTransitionFeedback
        show={showFailureAnimation}
        type="failure"
        message={animationMessage}
        onDismiss={dismissAnimation}
      />

      <div className={cn(
        "relative min-w-0",
        isRollingBack && "animate-pulse",
        className
      )}>
        {/* Level 1: Status Indicator (Always Visible) */}
        <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowQuickActions(!showQuickActions)}
        disabled={isLoading}
        className={cn(
          variant === 'mobile'
            ? "h-7 px-2 text-xs font-medium transition-all duration-200"
            : "h-9 px-3 text-sm font-medium transition-all duration-200 max-w-[320px]",
          "border rounded-md shadow-sm min-w-0 w-full",
          getButtonClassName()
        )}
        title={isPublished ? "Your site is live. Click to manage." : "Your site is ready to publish. Click for options."}
      >
        {variant === 'mobile' ? (
          /* Mobile: Compact single-line layout */
          <div className="flex items-center gap-1">
            <span className="font-semibold">{versionDisplay}</span>
            <span className="text-xs">{getStatusIndicator()}</span>
            {!isLoading && (
              <Icon
                name="chevron-down"
                className={cn(
                  "w-3 h-3 opacity-60 transition-transform",
                  showQuickActions && "rotate-180"
                )}
              />
            )}
          </div>
        ) : (
          /* Desktop: Single-line layout with truncation to prevent overflow */
          <div className="flex items-center gap-2 whitespace-nowrap leading-none min-w-0 w-full overflow-hidden">
            {/* Status Indicator */}
            <span className="text-base leading-none shrink-0">{getStatusIcon()}</span>

            {/* Version & Status - single line with separator, status can truncate */}
            <span className="text-xs font-semibold shrink-0">{versionDisplay}</span>
            <span className="text-gray-500 shrink-0">•</span>
            <span className="text-xs opacity-90 truncate min-w-0 flex-1">{getStatusText()}</span>

            {/* Dropdown Indicator */}
            {!isLoading && (
              <Icon
                name="chevron-down"
                className={cn(
                  "w-3 h-3 opacity-60 transition-transform",
                  showQuickActions && "rotate-180"
                )}
              />
            )}
          </div>
        )}
      </Button>

      {/* Level 2: Quick Actions Panel */}
      {showQuickActions && !isLoading && !hasError && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowQuickActions(false)}
          />

          {/* Quick Actions Panel */}
          <div className="absolute top-full right-0 mt-2 z-50">
            <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-64 max-w-sm">
              <div className="p-3 space-y-2">
                {/* Current Version Status */}
                <div className="mb-3">
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    <span className="text-lg">{getStatusIcon()}</span>
                    {t('version')} {versionDisplay}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {getStatusText()}
                  </div>
                </div>

                {/* Error Display */}
                {(publishError || unpublishError) && (
                  <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 mb-3">
                    {publishError ? t('publishFailed', { message: publishError.message }) :
                     unpublishError ? t('unpublishFailed', { message: unpublishError.message }) : ''}
                  </div>
                )}

                {/* Quick Action: Make it Live */}
                {/* Show publish button if we have a version that's not published */}
                {currentVersion && !isPublished && !isPublishing && (
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700 justify-start"
                    onClick={handleGoLive}
                    disabled={isPublishing || isUnpublishing}
                  >
                    <Icon name="rocket" className="w-4 h-4 mr-2" />
                    {t('makeItLive')}
                  </Button>
                )}

                {/* Publishing State */}
                {isPublishing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-blue-400"
                    disabled
                  >
                    <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                    {t('goingLive')}
                  </Button>
                )}


                {/* Version History */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-700/50"
                  onClick={handleVersionHistory}
                  disabled={isPublishing || isUnpublishing}
                >
                  <Icon name="clock" className="w-4 h-4 mr-2" />
                  {t('versionHistory')}
                </Button>

                {/* Take Site Offline - only show if published */}
                {isPublished && !isUnpublishing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-red-300 hover:text-red-200 hover:bg-red-900/20"
                    onClick={handleTakeOffline}
                    disabled={isPublishing || isUnpublishing}
                  >
                    <Icon name="x" className="w-4 h-4 mr-2" />
                    {t('takeOffline')}
                  </Button>
                )}

                {/* Unpublishing State */}
                {isUnpublishing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-blue-400"
                    disabled
                  >
                    <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                    {t('takingSiteOffline')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}


      {/* Version History Modal */}
      <VersionHistoryModal
        projectId={projectId}
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
      />
    </div>
    </>
  )
}
