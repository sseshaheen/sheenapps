/**
 * Quick Publish Panel
 * Contextual publishing interface that appears when there are unpublished changes
 * Features: change summaries, mobile optimization, double-tap prevention
 */

'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { useAuthStore } from '@/store'
import { 
  PublishFunnelTracker, 
  trackVersionEvent, 
  isFirstProject 
} from '@/utils/version-analytics'
import { useProjectStatus } from '@/hooks/use-project-status'
import { useVersionManagement } from '@/hooks/use-version-management'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'

interface QuickPublishPanelProps {
  projectId: string
  changesSummary?: {
    sections: Array<{
      type: 'added' | 'modified' | 'removed'
      name: string
      description?: string
    }>
    totalChanges: number
    lastModified: Date
  }
  onPreview?: () => void
  onPublishSuccess?: () => void
  className?: string
  showChangeDetails?: boolean
}

export function QuickPublishPanel({
  projectId,
  changesSummary,
  onPreview,
  onPublishSuccess,
  className,
  showChangeDetails = true
}: QuickPublishPanelProps) {
  const { user } = useAuthStore()
  const { data: projectStatus } = useProjectStatus(projectId)
  
  // Mobile double-tap prevention
  const [lastClickTime, setLastClickTime] = useState(0)
  
  // Comment state
  const [showCommentInput, setShowCommentInput] = useState(false)
  const [comment, setComment] = useState('')
  
  // Use version management hook for publishing
  const {
    publish,
    isPublishing,
    canPublish,
    publishError
  } = useVersionManagement({
    projectId,
    onSuccess: (operation) => {
      if (operation === 'publish') {
        logger.info(`✅ Quick publish successful for project ${projectId}`)
        
        // Track successful completion
        trackVersionEvent('publish_success', {
          projectId,
          userId: user?.id,
          isFirstProject: isFirstProject(user?.id || ''),
          source: 'quick_publish'
        })
        
        // Call success callback
        onPublishSuccess?.()
      }
    },
    onError: (operation, error) => {
      if (operation === 'publish') {
        logger.error(`❌ Quick publish failed for project ${projectId}:`, error)
      }
    }
  })

  // Handle publish click with mobile optimization
  const handlePublishClick = useCallback(() => {
    // Double-tap prevention (500ms debounce)
    const now = Date.now()
    if (now - lastClickTime < 500) {
      logger.debug('general', 'Preventing double-tap publish action')
      return
    }
    setLastClickTime(now)

    // Prevent multiple concurrent publishes
    if (isPublishing) {
      logger.debug('general', 'Publish already in progress, ignoring click')
      return
    }

    // Use the hook to publish
    publish({ 
      comment: comment || 'Published via Quick Publish Panel',
      source: 'quick_publish' 
    })
    
    // Reset comment after successful publish
    if (!isPublishing) {
      setComment('')
      setShowCommentInput(false)
    }
  }, [lastClickTime, isPublishing, publish, comment])

  // Handle preview click
  const handlePreviewClick = useCallback(() => {
    // Track preview interaction
    trackVersionEvent('version_preview_clicked', {
      projectId,
      versionId: projectStatus?.currentVersionId,
      userId: user?.id,
      source: 'quick_publish'
    })

    onPreview?.()
  }, [projectId, projectStatus?.currentVersionId, user?.id, onPreview])

  // Generate smart change summary
  const changeSummaryText = useMemo(() => {
    if (!changesSummary) return 'Ready to publish your changes'

    const { sections, totalChanges } = changesSummary
    if (totalChanges === 0) return 'No changes to publish'

    if (totalChanges === 1) {
      const change = sections[0]
      return `${change.type === 'added' ? 'Added' : change.type === 'modified' ? 'Updated' : 'Removed'} ${change.name}`
    }

    if (totalChanges <= 3) {
      return sections.map(s => s.name).join(', ')
    }

    return `${sections.slice(0, 2).map(s => s.name).join(', ')} and ${totalChanges - 2} more changes`
  }, [changesSummary])

  // Don't show panel if no changes or project not ready
  if (!projectStatus || projectStatus.buildStatus !== 'deployed') {
    return null
  }

  if (changesSummary && changesSummary.totalChanges === 0) {
    return null
  }

  return (
    <Card className={cn(
      "bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 shadow-sm",
      className
    )}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="external-link" className="w-4 h-4 text-blue-600" />
              <h4 className="font-medium text-blue-900">Ready to publish</h4>
              {changesSummary && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  {changesSummary.totalChanges} {changesSummary.totalChanges === 1 ? 'change' : 'changes'}
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-blue-700 mb-3">
              {changeSummaryText}
            </p>
            
            {/* Comment Input Section */}
            {showCommentInput && (
              <div className="mb-3">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment for this version (optional)"
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-md",
                    "bg-white border border-blue-200",
                    "placeholder-gray-400",
                    "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  )}
                  maxLength={200}
                  disabled={isPublishing}
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-500">
                    This will appear in version history
                  </span>
                  <span className={cn(
                    "text-xs",
                    comment.length > 180 ? "text-yellow-600" : "text-gray-500"
                  )}>
                    {comment.length}/200
                  </span>
                </div>
              </div>
            )}

            {/* Change Details (expandable on mobile) */}
            {showChangeDetails && changesSummary && changesSummary.sections.length > 0 && (
              <ChangeDetails changes={changesSummary.sections} />
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            {onPreview && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePreviewClick}
                className="min-w-[80px]"
              >
                <Icon name="eye" className="w-3 h-3 sm:mr-1" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
            )}
            
            {!showCommentInput && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowCommentInput(true)}
                className="min-w-[32px] bg-white hover:bg-gray-50"
                title="Add comment"
              >
                <Icon name="message-square" className="w-3 h-3" />
              </Button>
            )}
            
            <Button 
              size="sm" 
              onClick={handlePublishClick}
              disabled={isPublishing || !canPublish()}
              className="min-w-[80px] bg-blue-600 hover:bg-blue-700"
            >
              {isPublishing ? (
                <>
                  <Icon name="loader-2" className="w-3 h-3 mr-1 animate-spin" />
                  Publishing
                </>
              ) : (
                <>
                  <Icon name="external-link" className="w-3 h-3 sm:mr-1" />
                  Publish
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {publishError && (
          <PublishErrorDisplay 
            error={publishError}
            onRetry={handlePublishClick}
            projectId={projectId}
          />
        )}
      </div>
    </Card>
  )
}

/**
 * Change Details Component - Expandable list of changes
 */
function ChangeDetails({ 
  changes 
}: { 
  changes: Array<{ type: 'added' | 'modified' | 'removed'; name: string; description?: string }> 
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const showExpandButton = changes.length > 3

  const visibleChanges = isExpanded ? changes : changes.slice(0, 3)

  return (
    <div className="space-y-2">
      {visibleChanges.map((change, index) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <ChangeIcon type={change.type} />
          <span className="text-blue-600 font-medium">{change.name}</span>
          {change.description && (
            <span className="text-blue-500">- {change.description}</span>
          )}
        </div>
      ))}

      {showExpandButton && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Icon 
            name={isExpanded ? "chevron-right" : "chevron-down"} 
            className="w-3 h-3" 
          />
          {isExpanded ? 'Show less' : `Show ${changes.length - 3} more`}
        </button>
      )}
    </div>
  )
}

/**
 * Change Type Icon Component
 */
function ChangeIcon({ type }: { type: 'added' | 'modified' | 'removed' }) {
  switch (type) {
    case 'added':
      return <Icon name="plus" className="w-3 h-3 text-green-600" />
    case 'modified':
      return <Icon name="edit" className="w-3 h-3 text-blue-600" />
    case 'removed':
      return <Icon name="minus" className="w-3 h-3 text-red-600" />
    default:
      return <Icon name="circle" className="w-3 h-3 text-gray-400" />
  }
}

/**
 * Publish Error Display Component
 */
function PublishErrorDisplay({ 
  error, 
  onRetry, 
  projectId 
}: { 
  error: any
  onRetry: () => void
  projectId: string 
}) {
  const getErrorMessage = (error: any) => {
    if (error.code === 'ALREADY_PROCESSING') {
      return 'Publishing is already in progress'
    }
    if (error.status === 402) {
      return 'Insufficient AI credits - please add more to continue'
    }
    if (error.status === 429) {
      return 'Too many requests - please wait a moment'
    }
    return error.message || 'Publishing failed - please try again'
  }

  const canRetry = !['ALREADY_PROCESSING'].includes(error.code)

  return (
    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-2">
        <Icon name="alert-circle" className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-red-800 font-medium">
            {getErrorMessage(error)}
          </p>
          {error.status === 402 && (
            <Button
              variant="link"
              size="sm"
              className="text-red-700 underline p-0 h-auto mt-1"
              onClick={() => {
                // Navigate to billing page
                window.open('/billing', '_blank')
              }}
            >
              Add AI Credits
            </Button>
          )}
        </div>
        {canRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="text-red-700 hover:bg-red-100"
          >
            <Icon name="refresh-cw" className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * First-User Experience Helper Component
 */
export function FirstUserPublishGuide({ 
  projectId, 
  onDismiss 
}: { 
  projectId: string
  onDismiss: () => void 
}) {
  return (
    <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200 mb-4">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="bg-green-100 rounded-full p-2">
            <Icon name="star" className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-green-900 mb-1">
              Ready for your first publish! 🎉
            </h4>
            <p className="text-sm text-green-700 mb-3">
              Your project looks great! Click "Publish" to make it live and share it with the world.
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700">
                <Icon name="external-link" className="w-3 h-3 mr-1" />
                Publish My Project
              </Button>
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Maybe later
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}