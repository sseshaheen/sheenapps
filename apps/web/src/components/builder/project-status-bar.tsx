/**
 * Enhanced Project Status Bar
 * Shows publication status, build progress, and provides version management actions
 * Supports all rollback states and mobile-responsive design
 */

'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VersionBadge } from '@/components/version/version-badge'
import Icon from '@/components/ui/icon'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useProjectStatus,
  isActiveOperation,
  isErrorState,
  isStableState,
  getStatusMessage,
  type ProjectStatusData
} from '@/hooks/use-project-status'
import { useVersionManagement } from '@/hooks/use-version-management'
import { useAuthStore } from '@/store'
import { useCurrentBuildId } from '@/store/build-state-store'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { CleanBuildProgress } from './clean-build-progress'

interface ProjectStatusBarProps {
  projectId: string
  className?: string
  onPublishClick?: () => void
  onVersionHistoryClick?: () => void
  showActions?: boolean
}

export function ProjectStatusBar({
  projectId,
  className,
  onPublishClick,
  onVersionHistoryClick,
  showActions = true
}: ProjectStatusBarProps) {
  const { data: status, isLoading, error } = useProjectStatus(projectId)
  const { user } = useAuthStore()
  const currentBuildId = useCurrentBuildId()
  const [showProgressSheet, setShowProgressSheet] = useState(false)
  const [showErrorSheet, setShowErrorSheet] = useState(false)
  
  // Use the version management hook which already handles API calls
  const {
    publish,
    isPublishing,
    publishError,
    nextAllowedAt
  } = useVersionManagement({
    projectId,
    onSuccess: (operation) => {
      if (operation === 'publish') {
        logger.info(`✅ Published project ${projectId} successfully`)
      }
    },
    onError: (operation, error) => {
      if (operation === 'publish') {
        logger.error(`❌ Failed to publish project ${projectId}:`, error)
      }
    }
  })

  // Handle publish click with analytics and error handling
  const handlePublishClick = () => {
    if (onPublishClick) {
      onPublishClick()
      return
    }

    // Direct publish for simple cases using the hook
    publish({ source: 'status_bar' })
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 dark:border-purple-400"></div>
        <span className="text-sm text-gray-600 dark:text-gray-400">Loading status...</span>
      </div>
    )
  }

  if (error || !status) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Icon name="alert-circle" className="w-4 h-4 text-red-500 dark:text-red-400" />
        <span className="text-sm text-red-600 dark:text-red-400">Status unavailable</span>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4", className)}>
      {/* Status Badge */}
      <StatusBadge status={status} />
      
      {/* ✅ NEW: Version Badge */}
      {status.currentVersionId && (
        <VersionBadge 
          versionId={status.currentVersionId}
          versionName={status.currentVersionName}
          isProcessing={!status.currentVersionName}
          size="sm"
        />
      )}
      
      {/* Domain Display */}
      <DomainDisplay status={status} />
      
      {/* Action Buttons */}
      {showActions && (
        <ActionButtons
          status={status}
          onPublishClick={handlePublishClick}
          onVersionHistoryClick={onVersionHistoryClick}
          onViewProgress={() => setShowProgressSheet(true)}
          onRetry={() => setShowErrorSheet(true)}
          isPublishing={isPublishing}
          nextAllowedAt={nextAllowedAt}
        />
      )}

      {/* Build Progress Sheet */}
      <Sheet open={showProgressSheet} onOpenChange={setShowProgressSheet}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Icon name="activity" className="w-5 h-5" />
              Build Progress
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {user?.id && (
              <CleanBuildProgress
                buildId={currentBuildId}
                userId={user.id}
                projectId={projectId}
                projectBuildStatus={status.buildStatus as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null}
              />
            )}
            {!user?.id && (
              <div className="text-center text-muted-foreground py-8">
                Unable to load build progress
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Error Recovery Sheet */}
      <Sheet open={showErrorSheet} onOpenChange={setShowErrorSheet}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Icon name="alert-circle" className="w-5 h-5" />
              Build Error
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">
                The build encountered an error. You can try rebuilding or check the build logs for more details.
              </p>
            </div>
            {user?.id && currentBuildId && (
              <CleanBuildProgress
                buildId={currentBuildId}
                userId={user.id}
                projectId={projectId}
                projectBuildStatus={status.buildStatus as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null}
              />
            )}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowErrorSheet(false)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  // Trigger a rebuild by publishing
                  handlePublishClick()
                  setShowErrorSheet(false)
                }}
                className="flex-1"
              >
                <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
                Retry Build
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/**
 * Status Badge Component - Accessible with color + icon + text
 */
function StatusBadge({ status }: { status: ProjectStatusData }) {
  const getStatusConfig = () => {
    switch (status.buildStatus) {
      case 'building':
        return {
          variant: 'default' as const,
          className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
          icon: 'loader-2' as const,
          text: 'Building',
          spinning: true
        }
      case 'rollingBack':
        return {
          variant: 'default' as const,
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
          icon: 'rotate-ccw' as const,
          text: 'Rolling back',
          spinning: true
        }
      case 'queued':
        return {
          variant: 'default' as const,
          className: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
          icon: 'clock' as const,
          text: 'Queued'
        }
      case 'deployed':
        return {
          variant: 'default' as const,
          className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
          icon: 'check-circle' as const,
          text: 'Live'
        }
      case 'failed':
        return {
          variant: 'destructive' as const,
          className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
          icon: 'alert-circle' as const,
          text: 'Failed'
        }
      case 'rollbackFailed':
        return {
          variant: 'destructive' as const,
          className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
          icon: 'alert-triangle' as const,
          text: 'Rollback failed'
        }
      default:
        return {
          variant: 'secondary' as const,
          className: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
          icon: 'help-circle' as const,
          text: 'Unknown'
        }
    }
  }

  const config = getStatusConfig()

  return (
    <Badge 
      variant={config.variant}
      className={cn("flex items-center gap-1.5 px-2 py-1", config.className)}
    >
      <Icon 
        name={config.icon} 
        className={cn("w-3 h-3", config.spinning && "animate-spin")} 
      />
      <span className="font-medium">{config.text}</span>
    </Badge>
  )
}

/**
 * Domain Display Component - Shows current domain with truncation on mobile
 */
function DomainDisplay({ status }: { status: ProjectStatusData }) {
  if (!status.subdomain && !status.previewUrl) {
    return null
  }

  const domain = status.subdomain 
    ? `${status.subdomain}.sheenapps.com`
    : status.previewUrl?.replace(/^https?:\/\//, '') || 'Preview available'

  return (
    <div className="flex items-center gap-1">
      <Icon name="globe" className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      <span 
        className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px] sm:max-w-none"
        title={domain}
      >
        {domain}
      </span>
    </div>
  )
}

/**
 * Action Buttons Component - Responsive layout with proper state handling
 */
function ActionButtons({
  status,
  onPublishClick,
  onVersionHistoryClick,
  onViewProgress,
  onRetry,
  isPublishing,
  nextAllowedAt
}: {
  status: ProjectStatusData
  onPublishClick: () => void
  onVersionHistoryClick?: () => void
  onViewProgress: () => void
  onRetry: () => void
  isPublishing: boolean
  nextAllowedAt: Date | null
}) {
  const isRateLimited = nextAllowedAt && nextAllowedAt > new Date()
  const canPublish = isStableState(status.buildStatus) && !isRateLimited
  const canViewHistory = !isActiveOperation(status.buildStatus)

  return (
    <div className="flex gap-2">
      {/* Publish Button */}
      {status.buildStatus === 'deployed' && (
        <Button
          size="sm"
          onClick={onPublishClick}
          disabled={!canPublish || isPublishing}
          className="min-w-[80px]"
        >
          {isPublishing ? (
            <>
              <Icon name="loader-2" className="w-3 h-3 mr-1 animate-spin" />
              Publishing
            </>
          ) : isRateLimited ? (
            'Rate limited'
          ) : (
            <>
              <Icon name="external-link" className="w-3 h-3 mr-1" />
              Publish
            </>
          )}
        </Button>
      )}

      {/* Build Progress Button for Active Operations */}
      {isActiveOperation(status.buildStatus) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logger.info('Opening build progress for project:', status.id)
            onViewProgress()
          }}
        >
          <Icon name="activity" className="w-3 h-3 mr-1" />
          View Progress
        </Button>
      )}

      {/* Error Recovery Button */}
      {isErrorState(status.buildStatus) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logger.info('Opening error recovery for project:', status.id)
            onRetry()
          }}
        >
          <Icon name="refresh-cw" className="w-3 h-3 mr-1" />
          Retry
        </Button>
      )}

      {/* Version History Button */}
      {onVersionHistoryClick && canViewHistory && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onVersionHistoryClick}
        >
          <Icon name="clock" className="w-3 h-3 mr-1" />
          <span className="hidden sm:inline">History</span>
        </Button>
      )}
    </div>
  )
}

/**
 * Helper Components for Progressive Disclosure
 */

// Quick Publish Panel (appears with changes)
export function QuickPublishPanel({
  projectId,
  changesSummary,
  onPublish,
  onPreview
}: {
  projectId: string
  changesSummary: string
  onPublish: () => void
  onPreview: () => void
}) {
  return (
    <div className="bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Ready to publish</h4>
          <p className="text-sm text-blue-700 dark:text-blue-300">{changesSummary}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onPreview}>
            Preview
          </Button>
          <Button size="sm" onClick={onPublish}>
            Publish
          </Button>
        </div>
      </div>
    </div>
  )
}

// Rollback Progress Panel (two-phase progress tracking)
export function RollbackProgressPanel({
  progress,
  phase
}: {
  progress: { current: number; total: number }
  phase: 'preview' | 'working_directory'
}) {
  const percentage = Math.round((progress.current / progress.total) * 100)

  return (
    <div className="bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <Icon name="rotate-ccw" className="w-5 h-5 text-yellow-600 dark:text-yellow-400 animate-spin" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
              {phase === 'preview' 
                ? 'Preview updated, syncing files...' 
                : 'Rolling back to previous version...'}
            </span>
            <span className="text-sm text-yellow-700 dark:text-yellow-300">{percentage}%</span>
          </div>
          <div className="w-full bg-yellow-200 dark:bg-yellow-900/30 rounded-full h-2">
            <div 
              className="bg-yellow-600 dark:bg-yellow-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}