'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'
import { useLatestDeployments } from '@/hooks/useDeploymentHistory'
import type { DeploymentHistoryItem } from '@/types/inhouse-api'

interface DeploymentHistoryProps {
  projectId: string
  /** Number of deployments to show (default 5) */
  limit?: number
  /** Callback when "View all" is clicked */
  onViewAll?: () => void
  /** Callback to rollback to a build */
  onRollback?: (buildId: string) => Promise<void>
  translations: {
    title: string
    viewAll: string
    live: string
    ago: string
    failed: string
    deployed: string
    deploying: string
    uploading: string
    rollbackTo: string
    rollbackConfirm: string
    rollbackDescription: string
    cancel: string
    confirmRollback: string
    rollingBack: string
    rollbackSuccess: string
    rollbackError: string
    empty: string
    loadMore: string
  }
}

/**
 * Compact deployment history component
 *
 * Shows recent deployments with status badges and rollback actions.
 * Used in HostingStatusCard as an expandable section.
 */
export function DeploymentHistory({
  projectId,
  limit = 5,
  onViewAll,
  onRollback,
  translations
}: DeploymentHistoryProps) {
  const { deployments, isLoading, error, refetch } = useLatestDeployments({
    projectId,
    enabled: true,
    limit
  })

  const [rollbackTarget, setRollbackTarget] = useState<DeploymentHistoryItem | null>(null)
  const [isRollingBack, setIsRollingBack] = useState(false)

  const handleRollback = async () => {
    if (!rollbackTarget || !onRollback) return

    setIsRollingBack(true)
    try {
      await onRollback(rollbackTarget.buildId)
      setRollbackTarget(null)
      refetch()
    } catch {
      // Error handling is done in the parent via toast
    } finally {
      setIsRollingBack(false)
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center justify-between p-2 rounded-md border">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="text-sm text-muted-foreground p-2 text-center">
        {error.message}
      </div>
    )
  }

  // Empty state
  if (deployments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        <Icon name="clock" className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>{translations.empty}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{translations.title}</span>
        {onViewAll && (
          <Button
            variant="link"
            size="sm"
            onClick={onViewAll}
            className="h-auto p-0 text-xs"
          >
            {translations.viewAll}
            <Icon name="chevron-right" className="w-3 h-3 ms-1" />
          </Button>
        )}
      </div>

      {/* Deployment list */}
      <div className="space-y-1">
        {deployments.map(deployment => (
          <DeploymentHistoryRow
            key={deployment.id}
            deployment={deployment}
            translations={translations}
            onRollback={
              onRollback && !deployment.isCurrentlyActive && deployment.status === 'deployed'
                ? () => setRollbackTarget(deployment)
                : undefined
            }
          />
        ))}
      </div>

      {/* Rollback confirmation dialog */}
      <Dialog open={!!rollbackTarget} onOpenChange={(open) => !open && setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translations.rollbackConfirm.replace('{buildId}', rollbackTarget?.buildId.slice(0, 8) || '')}
            </DialogTitle>
            <DialogDescription>
              {translations.rollbackDescription.replace('{buildId}', rollbackTarget?.buildId.slice(0, 8) || '')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isRollingBack}
              onClick={() => setRollbackTarget(null)}
            >
              {translations.cancel}
            </Button>
            <Button
              onClick={handleRollback}
              disabled={isRollingBack}
              variant="destructive"
            >
              {isRollingBack ? (
                <>
                  <Icon name="loader-2" className="w-4 h-4 me-1 animate-spin" />
                  {translations.rollingBack}
                </>
              ) : (
                translations.confirmRollback
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface DeploymentHistoryRowProps {
  deployment: DeploymentHistoryItem
  translations: DeploymentHistoryProps['translations']
  onRollback?: () => void
}

function DeploymentHistoryRow({ deployment, translations, onRollback }: DeploymentHistoryRowProps) {
  const getStatusBadge = () => {
    if (deployment.isCurrentlyActive) {
      return (
        <Badge variant="default" className="text-xs">
          {translations.live}
        </Badge>
      )
    }

    switch (deployment.status) {
      case 'deployed':
        return (
          <Badge variant="secondary" className="text-xs">
            {translations.deployed}
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="text-xs">
            {translations.failed}
          </Badge>
        )
      case 'deploying':
        return (
          <Badge variant="outline" className="text-xs">
            <Icon name="loader-2" className="w-3 h-3 me-1 animate-spin" />
            {translations.deploying}
          </Badge>
        )
      case 'uploading':
        return (
          <Badge variant="outline" className="text-xs">
            <Icon name="loader-2" className="w-3 h-3 me-1 animate-spin" />
            {translations.uploading}
          </Badge>
        )
      default:
        return null
    }
  }

  const timeAgo = deployment.deployedAt
    ? formatDistanceToNow(new Date(deployment.deployedAt), { addSuffix: false })
    : formatDistanceToNow(new Date(deployment.createdAt), { addSuffix: false })

  return (
    <div className="flex items-center justify-between p-2 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {getStatusBadge()}
        <span className="font-mono text-xs truncate">
          {deployment.buildId.slice(0, 8)}
        </span>
        <span className="text-xs text-muted-foreground">
          {timeAgo} {translations.ago}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {onRollback && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRollback}
            className="h-6 px-2 text-xs"
            title={translations.rollbackTo}
          >
            <Icon name="undo-2" className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

export default DeploymentHistory
