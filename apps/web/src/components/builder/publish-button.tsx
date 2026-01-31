'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'
import { useProjectStatus } from '@/hooks/use-project-status'
import { useCurrentVersion } from '@/hooks/use-version-history'
import { useVersionManagement } from '@/hooks/use-version-management'
import { isFirstPublish, markPublishedLocal } from '@/lib/publish/milestones'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { logger } from '@/utils/logger'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PublishSuccessModal } from './publish-success-modal'
import { useCelebration } from './engagement/celebration-effects'

/**
 * Publish state machine - explicit states prevent UI ambiguity
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 4
 */
type PublishState =
  | 'disabled_no_build'  // Gray, disabled — "No build yet"
  | 'building'           // Pulsing/loading — "Building..."
  | 'ready'              // Green, enabled — "Ready to publish"
  | 'publishing'         // Loading — "Publishing..."
  | 'live'               // Checkmark badge — "Live"
  | 'error'              // Red indicator — "Build failed"

interface PublishButtonProps {
  projectId: string
  className?: string
  variant?: 'desktop' | 'mobile'
}

/**
 * Phase 4: Simplified publish CTA button
 *
 * Replaces complex VersionStatusBadge dropdown with single-action button.
 * One-click publish with clear state indication.
 *
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 4
 */
export function PublishButton({ projectId, className, variant = 'desktop' }: PublishButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [successModalState, setSuccessModalState] = useState<{
    open: boolean
    isFirstPublish: boolean
    liveUrl: string
    versionLabel: string
  }>({ open: false, isFirstPublish: false, liveUrl: '', versionLabel: '' })

  const { success: showSuccessToast, error: showErrorToast } = useToastWithUndo()
  const t = useTranslations('builder.workspace.publish')
  const { user } = useAuthStore()
  const { triggerCelebration } = useCelebration()

  // Real API data
  const { data: projectStatus, isLoading: isProjectLoading, error: projectError } = useProjectStatus(projectId)
  const { data: currentVersion, isLoading: isVersionLoading, error: versionError } = useCurrentVersion(projectId)
  const {
    publish,
    isPublishing,
    publishError
  } = useVersionManagement({
    projectId,
    onSuccess: (operation, result: any) => {
      if (operation === 'publish') {
        const version = result.publishedVersion?.semver || result.publishedVersion?.name || 'Version'
        const liveUrl = result.liveUrl || result.previewUrl || projectStatus?.previewUrl || ''
        const versionLabel = `Version ${version}`

        // Determine if this is first publish
        // Server-truth: result.userFirstPublishedAt (if API provides it)
        // Fallback: localStorage
        const wasFirstPublish = isFirstPublish(
          result.userFirstPublishedAt,
          user?.id
        )

        // Always show toast
        showSuccessToast(`🎉 ${version} ${t('nowLive')}`)
        setShowConfirm(false)

        // For first publish: celebration + modal
        if (wasFirstPublish) {
          // Mark as published locally (fallback storage)
          if (user?.id) {
            markPublishedLocal(user.id)
          }

          // Trigger confetti celebration
          triggerCelebration({
            type: 'confetti',
            message: t('nowLive'),
            duration: 3000,
            particles: {
              count: 50,
              colors: ['#10b981', '#22c55e', '#34d399', '#6ee7b7'],
              shapes: ['circle', 'square']
            }
          })

          // Open success modal
          setSuccessModalState({
            open: true,
            isFirstPublish: true,
            liveUrl,
            versionLabel
          })
        }
      }
    },
    onError: (operation, error) => {
      if (operation === 'publish') {
        const errorMessage = error.message || t('publishFailed')
        showErrorToast(errorMessage)
      }
    }
  })

  // Derive the explicit state from API data
  const getPublishState = (): PublishState => {
    // Loading state
    if (isProjectLoading || isVersionLoading) {
      return 'disabled_no_build'
    }

    // Error state
    if (projectError || versionError || projectStatus?.buildStatus === 'failed') {
      return 'error'
    }

    // Publishing in progress
    if (isPublishing) {
      return 'publishing'
    }

    // Building in progress
    if (projectStatus?.buildStatus === 'building' || projectStatus?.buildStatus === 'queued') {
      return 'building'
    }

    // Already published/live
    if (currentVersion?.isPublished) {
      return 'live'
    }

    // Has a version ready to publish
    if (currentVersion && projectStatus?.buildStatus === 'deployed') {
      return 'ready'
    }

    // No build yet
    return 'disabled_no_build'
  }

  const publishState = getPublishState()

  // Handle publish click
  const handlePublish = async () => {
    if (!currentVersion?.id) {
      logger.warn('Cannot publish: no current version available')
      return
    }

    try {
      await publish({
        versionId: currentVersion.id,
        comment: '',
        source: 'publish_button'
      })
    } catch (error) {
      logger.error('Failed to publish:', error)
    }
  }

  // Get button content based on state
  const getButtonContent = () => {
    switch (publishState) {
      case 'disabled_no_build':
        return {
          icon: 'circle' as const,
          label: t('noBuild'),
          shortLabel: t('noBuildShort'),
          disabled: true,
          className: 'bg-gray-600/20 text-gray-400 border-gray-600/30 cursor-not-allowed'
        }
      case 'building':
        return {
          icon: 'loader-2' as const,
          label: t('building'),
          shortLabel: t('buildingShort'),
          disabled: true,
          className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse cursor-wait',
          iconAnimate: true
        }
      case 'ready':
        return {
          icon: 'rocket' as const,
          label: t('publish'),
          shortLabel: t('publishShort'),
          disabled: false,
          className: 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 hover:text-green-300'
        }
      case 'publishing':
        return {
          icon: 'loader-2' as const,
          label: t('publishing'),
          shortLabel: t('publishingShort'),
          disabled: true,
          className: 'bg-blue-500/20 text-blue-400 border-blue-500/30 cursor-wait',
          iconAnimate: true
        }
      case 'live':
        return {
          icon: 'check-circle' as const,
          label: t('live'),
          shortLabel: t('liveShort'),
          disabled: true,
          className: 'bg-green-500/20 text-green-400 border-green-500/30'
        }
      case 'error':
        return {
          icon: 'alert-circle' as const,
          label: t('error'),
          shortLabel: t('errorShort'),
          disabled: true,
          className: 'bg-red-500/20 text-red-400 border-red-500/30'
        }
    }
  }

  const content = getButtonContent()
  const isMobile = variant === 'mobile'

  // Show confirmation dialog for publish
  if (showConfirm && publishState === 'ready') {
    return (
      <div className={cn("relative", className)}>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowConfirm(false)}
        />

        {/* Confirmation Panel */}
        <div className="absolute top-full right-0 mt-2 z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4 min-w-64">
            <div className="text-sm font-medium text-white mb-2">
              {t('confirmTitle')}
            </div>
            <div className="text-xs text-gray-400 mb-4">
              {t('confirmDescription')}
            </div>

            {publishError && (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 mb-3">
                {publishError.message}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirm(false)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isPublishing ? (
                  <>
                    <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                    {t('publishing')}
                  </>
                ) : (
                  <>
                    <Icon name="rocket" className="w-4 h-4 mr-2" />
                    {t('confirm')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Button in confirm state */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "border rounded-md shadow-sm transition-all duration-200",
            isMobile ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
            content.className
          )}
        >
          <Icon
            name={content.icon}
            className={cn(
              "w-4 h-4",
              !isMobile && "mr-2",
              content.iconAnimate && "animate-spin"
            )}
          />
          {!isMobile && <span className="whitespace-nowrap">{content.label}</span>}
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (publishState === 'ready') {
            setShowConfirm(true)
          } else if (publishState === 'live' && projectStatus) {
            const shareUrl = projectStatus.subdomain
              ? `https://${projectStatus.subdomain}.sheenapps.com`
              : projectStatus.previewUrl || ''
            // Allow clicking "Live" to open share modal
            setSuccessModalState({
              open: true,
              isFirstPublish: false,
              liveUrl: shareUrl,
              versionLabel: `Version ${currentVersion?.semver || currentVersion?.name || ''}`
            })
          }
        }}
        disabled={content.disabled && publishState !== 'live'}
        className={cn(
          "border rounded-md shadow-sm transition-all duration-200",
          isMobile ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
          content.className,
          // Make "live" state clickable
          publishState === 'live' && "cursor-pointer hover:bg-green-500/30",
          className
        )}
        title={publishState === 'live' ? t('clickToShare') : content.label}
        data-testid="publish-button"
        data-publish-state={publishState}
      >
        <Icon
          name={content.icon}
          className={cn(
            "w-4 h-4",
            !isMobile && "mr-2",
            content.iconAnimate && "animate-spin"
          )}
        />
        {!isMobile && <span className="whitespace-nowrap">{content.label}</span>}
      </Button>

      {/* Publish Success Modal */}
      <PublishSuccessModal
        isOpen={successModalState.open}
        onClose={() => setSuccessModalState(s => ({ ...s, open: false }))}
        isFirstPublish={successModalState.isFirstPublish}
        liveUrl={successModalState.liveUrl}
        versionLabel={successModalState.versionLabel}
        projectName={projectStatus?.subdomain || projectId}
      />
    </>
  )
}
