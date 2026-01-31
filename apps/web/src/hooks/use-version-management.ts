/**
 * Version Management Hook
 * Enhanced mutations with mobile optimization, analytics, and first-user experience
 *
 * CLIENT-SAFE: Uses API routes instead of direct server service calls
 */

'use client';

import { useProjectStatus } from '@/hooks/use-project-status';
import { apiGet, apiPost } from '@/lib/client/api-fetch';
import { useAuthStore } from '@/store';
import type { PublicationResponse, RollbackResponse } from '@/types/version-management';
import { logger } from '@/utils/logger';
import {
  isFirstProject,
  PublishFunnelTracker,
  RollbackFunnelTracker,
  trackVersionEvent
} from '@/utils/version-analytics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

interface UseVersionManagementOptions {
  projectId: string
  onSuccess?: (operation: 'publish' | 'unpublish' | 'rollback' | 'restore', result: any) => void
  onError?: (operation: 'publish' | 'unpublish' | 'rollback' | 'restore', error: any) => void
}

export function useVersionManagement({
  projectId,
  onSuccess,
  onError
}: UseVersionManagementOptions) {
  const { user } = useAuthStore()
  const { data: projectStatus } = useProjectStatus(projectId)
  const queryClient = useQueryClient()

  // Mobile double-tap prevention
  const [lastActionTime, setLastActionTime] = useState<Record<string, number>>({})
  const [nextAllowedAt, setNextAllowedAt] = useState<Date | null>(null)

  // Prevent double-tap with 500ms debounce
  const preventDoubleTap = useCallback((action: string): boolean => {
    const now = Date.now()
    const lastTime = lastActionTime[action] || 0

    if (now - lastTime < 500) {
      logger.debug('general', `Preventing double-tap for action: ${action}`)
      return false
    }

    setLastActionTime(prev => ({ ...prev, [action]: now }))
    return true
  }, [lastActionTime])

  // Check rate limiting
  const isRateLimited = useCallback((): boolean => {
    return nextAllowedAt !== null && nextAllowedAt > new Date()
  }, [nextAllowedAt])

  // Handle rate limit response
  const handleRateLimit = useCallback((error: any) => {
    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'] || 60
      setNextAllowedAt(new Date(Date.now() + (retryAfter * 1000)))
    }
  }, [])

  // Publish mutation with enhanced UX
  const publishMutation = useMutation({
    mutationFn: async ({
      versionId,
      comment,
      source = 'version_management'
    }: {
      versionId?: string
      comment?: string
      source?: string
    }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const targetVersionId = versionId || projectStatus?.currentVersionId
      if (!targetVersionId) throw new Error('No version to publish')

      // Prevent double-tap
      if (!preventDoubleTap('publish')) {
        throw new Error('DOUBLE_TAP_PREVENTED')
      }

      // Check rate limiting
      if (isRateLimited()) {
        throw new Error('RATE_LIMITED')
      }

      // Initialize analytics tracking
      const tracker = new PublishFunnelTracker(
        projectId,
        targetVersionId,
        user.id,
        source
      )

      try {
        // Use API route for publishing
        const result = await apiPost<PublicationResponse>(
          '/api/worker/versions/publish',
          {
            projectId,
            versionId: targetVersionId,
            comment
          }
        )

        // Track success
        tracker.success({
          isFirstProject: isFirstProject(user.id),
          source
        })

        return { result, tracker, operation: 'publish' as const }
      } catch (error: any) {
        // Track error or duplicate
        if (error.code === 'ALREADY_PROCESSING') {
          tracker.duplicate()
        } else {
          tracker.error(error)
        }
        throw error
      }
    },
    onSuccess: ({ result, operation }) => {
      logger.info(`✅ ${operation} successful for project ${projectId}`)

      // Invalidate all related queries to force UI refresh
      queryClient.invalidateQueries({ queryKey: ['project-status', projectId] })
      queryClient.invalidateQueries({ queryKey: ['version-history', projectId] })
      queryClient.invalidateQueries({ queryKey: ['current-version', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] }) // Refresh project list if it exists

      // Also refetch immediately for faster UI update
      queryClient.refetchQueries({ queryKey: ['project-status', projectId] })
      queryClient.refetchQueries({ queryKey: ['version-history', projectId] })

      onSuccess?.(operation, result)
    },
    onError: (error: any) => {
      logger.error(`❌ Publish failed for project ${projectId}:`, error)

      // Handle specific errors
      handleRateLimit(error)

      // Don't call onError for prevented double-taps
      if (error.message !== 'DOUBLE_TAP_PREVENTED') {
        onError?.('publish', error)
      }
    }
  })

  // Unpublish mutation
  const unpublishMutation = useMutation({
    mutationFn: async ({ source = 'version_management' }: { source?: string } = {}) => {
      if (!user?.id) throw new Error('User not authenticated')

      // Prevent double-tap
      if (!preventDoubleTap('unpublish')) {
        throw new Error('DOUBLE_TAP_PREVENTED')
      }

      // Check rate limiting
      if (isRateLimited()) {
        throw new Error('RATE_LIMITED')
      }

      // Use API route for unpublishing
      const result = await apiPost(
        '/api/worker/versions/unpublish',
        {
          projectId
        }
      )

      // Track event
      trackVersionEvent('unpublish_success', {
        projectId,
        userId: user.id,
        source
      })

      return { result, operation: 'unpublish' as const }
    },
    onSuccess: ({ result, operation }) => {
      logger.info(`✅ ${operation} successful for project ${projectId}`)

      // Invalidate all related queries to force UI refresh
      queryClient.invalidateQueries({ queryKey: ['project-status', projectId] })
      queryClient.invalidateQueries({ queryKey: ['version-history', projectId] })
      queryClient.invalidateQueries({ queryKey: ['current-version', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })

      // Also refetch immediately for faster UI update
      queryClient.refetchQueries({ queryKey: ['project-status', projectId] })
      queryClient.refetchQueries({ queryKey: ['version-history', projectId] })

      onSuccess?.(operation, result)
    },
    onError: (error: any) => {
      logger.error(`❌ Unpublish failed for project ${projectId}:`, error)

      handleRateLimit(error)

      if (error.message !== 'DOUBLE_TAP_PREVENTED') {
        onError?.('unpublish', error)
      }
    }
  })

  // Rollback mutation with two-phase tracking
  const rollbackMutation = useMutation({
    mutationFn: async ({
      targetVersionId,
      skipWorkingDirectory = false,
      source = 'version_management'
    }: {
      targetVersionId: string
      skipWorkingDirectory?: boolean
      source?: string
    }) => {
      if (!user?.id) throw new Error('User not authenticated')

      // Prevent double-tap
      if (!preventDoubleTap('rollback')) {
        throw new Error('DOUBLE_TAP_PREVENTED')
      }

      // Check rate limiting
      if (isRateLimited()) {
        throw new Error('RATE_LIMITED')
      }

      // Initialize analytics tracking
      const tracker = new RollbackFunnelTracker(
        projectId,
        targetVersionId,
        user.id,
        source
      )

      try {
        // Use API route for rollback with longer timeout
        // Rollback operations can take up to 5.5 minutes
        const result = await apiPost<RollbackResponse>(
          '/api/worker/versions/rollback',
          {
            projectId,
            targetVersionId,
            skipWorkingDirectory
          },
          {
            timeout: 60000, // 60 seconds for rollback operations
            retries: 0 // No retries to prevent 409 conflicts
          }
        )

        return { result, tracker, operation: 'rollback' as const }
      } catch (error: any) {
        // Handle 409 Conflict specially - check if rollback already in progress
        if (error.status === 409) {
          logger.info('Got 409 on rollback - operation already in progress')
          // For rollback, 409 is a legitimate error (unlike restore)
          // since we track the operation status separately
        }

        // Track rollback error
        tracker.error(error)
        throw error
      }
    },
    onSuccess: ({ result, tracker, operation }) => {
      logger.info(`✅ ${operation} initiated for project ${projectId}`)

      // Track initial success (Phase 1: preview updated)
      tracker.success(result.rollbackVersionId, {
        phase: 'preview_updated',
        previewUrl: result.previewUrl,
        workingDirectorySynced: result.workingDirectory.synced
      })

      // Refresh project status immediately
      queryClient.invalidateQueries({ queryKey: ['project-status', projectId] })

      onSuccess?.(operation, result)
    },
    onError: (error: any) => {
      logger.error(`❌ Rollback failed for project ${projectId}:`, error)

      handleRateLimit(error)

      if (error.message !== 'DOUBLE_TAP_PREVENTED') {
        onError?.('rollback', error)
      }
    }
  })

  // Restore mutation - creates new version from previous version content
  const restoreMutation = useMutation({
    mutationFn: async ({
      sourceVersionId,
      createBackup = true,
      comment,
      source = 'version_management'
    }: {
      sourceVersionId: string
      createBackup?: boolean
      comment?: string
      source?: string
    }) => {
      if (!user?.id) throw new Error('User not authenticated')

      // Prevent double-tap
      if (!preventDoubleTap('restore')) {
        throw new Error('DOUBLE_TAP_PREVENTED')
      }

      // Check rate limiting
      if (isRateLimited()) {
        throw new Error('RATE_LIMITED')
      }

      logger.info(`🔄 Starting version restore for project ${projectId}`, {
        sourceVersionId,
        createBackup,
        comment
      })

      // Use API route for restore with longer timeout and no retries
      // Rollback operations can take up to 5.5 minutes, but the initial API call returns quickly
      // The actual rollback happens asynchronously with status updates
      let result: any

      try {
        result = await apiPost(
          '/api/worker/versions/restore',
          {
            projectId,
            sourceVersionId,
            createBackup,
            comment: comment || `Restored from version ${sourceVersionId.slice(-8)}`
          },
          {
            timeout: 30000, // 30 seconds for rollback initiation
            retries: 0 // No retries to prevent 409 conflicts
          }
        )
      } catch (error: any) {
        // Handle 409 Conflict specially - it might mean the operation already succeeded
        if (error.status === 409) {
          logger.info('Got 409 on restore - checking if rollback already succeeded...')

          // Wait a moment for the status to update
          await new Promise(resolve => setTimeout(resolve, 2000))

          // Check current project status to see if rollback succeeded
          const status = await apiGet<any>(
            `/api/projects/${projectId}/status`,
            { timeout: 5000, retries: 0 }
          )

          // If status is deployed and not rollingBack, the operation likely succeeded
          if (status.buildStatus === 'deployed') {
            logger.info('✅ Rollback already completed successfully (409 was from duplicate request)')
            result = {
              success: true,
              message: 'Rollback already completed',
              newVersionId: status.currentVersionId
            }
          } else if (status.buildStatus === 'rollingBack') {
            // If still rolling back, it's a legitimate in-progress error
            throw new Error('Another rollback is already in progress')
          } else {
            // Unknown status, re-throw the original error
            throw error
          }
        } else {
          // Re-throw other errors
          throw error
        }
      }

      // Track event (using generic event tracking for now)
      logger.info('Version restore completed successfully', {
        projectId,
        userId: user.id,
        sourceVersionId,
        newVersionId: result.newVersionId,
        source
      })

      return { result, operation: 'restore' as const }
    },
    onSuccess: ({ result, operation }) => {
      logger.info(`✅ ${operation} successful for project ${projectId}`, result)

      // Refresh queries to show new version
      queryClient.invalidateQueries({ queryKey: ['project-status', projectId] })
      queryClient.invalidateQueries({ queryKey: ['version-history', projectId] })

      onSuccess?.(operation, result)
    },
    onError: (error: any) => {
      logger.error(`❌ Restore failed for project ${projectId}:`, error)

      handleRateLimit(error)

      if (error.message !== 'DOUBLE_TAP_PREVENTED') {
        onError?.('restore', error)
      }
    }
  })

  // Convenience methods
  const publish = useCallback((options: {
    versionId?: string
    comment?: string
    source?: string
  } = {}) => {
    return publishMutation.mutateAsync(options)
  }, [publishMutation])

  const unpublish = useCallback((options: { source?: string } = {}) => {
    return unpublishMutation.mutateAsync(options)
  }, [unpublishMutation])

  const rollback = useCallback((options: {
    targetVersionId: string
    skipWorkingDirectory?: boolean
    source?: string
  }) => {
    return rollbackMutation.mutateAsync(options)
  }, [rollbackMutation])

  const restore = useCallback((options: {
    sourceVersionId: string
    createBackup?: boolean
    comment?: string
    source?: string
  }) => {
    return restoreMutation.mutateAsync(options)
  }, [restoreMutation])

  // Check if operations are available
  const canPublish = useCallback((): boolean => {
    if (!projectStatus || !user) return false
    if (isRateLimited()) return false
    if (publishMutation.isPending) return false
    return projectStatus.buildStatus === 'deployed'
  }, [projectStatus, user, publishMutation.isPending, isRateLimited])

  const canUnpublish = useCallback((): boolean => {
    if (!projectStatus || !user) return false
    if (isRateLimited()) return false
    if (unpublishMutation.isPending) return false
    // TODO: Check if currently published
    return true
  }, [projectStatus, user, unpublishMutation.isPending, isRateLimited])

  const canRollback = useCallback((targetVersionId?: string): boolean => {
    if (!projectStatus || !user || !targetVersionId) return false
    if (isRateLimited()) return false
    if (rollbackMutation.isPending) return false
    // Don't allow rollback during active operations
    return !['building', 'rollingBack', 'queued'].includes(projectStatus.buildStatus)
  }, [projectStatus, user, rollbackMutation.isPending, isRateLimited])

  const canRestore = useCallback((): boolean => {
    if (!user) return false
    if (isRateLimited()) return false
    if (restoreMutation.isPending) return false
    // Can restore as long as user is authenticated and not rate limited
    return true
  }, [user, isRateLimited, restoreMutation.isPending])

  // Get operation status
  const getOperationStatus = useCallback(() => {
    return {
      isPublishing: publishMutation.isPending,
      isUnpublishing: unpublishMutation.isPending,
      isRollingBack: rollbackMutation.isPending,
      isRestoring: restoreMutation.isPending,
      isRateLimited: isRateLimited(),
      nextAllowedAt,
      publishError: publishMutation.error,
      unpublishError: unpublishMutation.error,
      rollbackError: rollbackMutation.error,
      restoreError: restoreMutation.error
    }
  }, [
    publishMutation.isPending,
    publishMutation.error,
    unpublishMutation.isPending,
    unpublishMutation.error,
    rollbackMutation.isPending,
    rollbackMutation.error,
    restoreMutation.isPending,
    restoreMutation.error,
    isRateLimited,
    nextAllowedAt
  ])

  return {
    // Actions
    publish,
    unpublish,
    rollback,
    restore,

    // Capability checks
    canPublish,
    canUnpublish,
    canRollback,
    canRestore,

    // Status
    ...getOperationStatus(),

    // Raw mutations for advanced usage
    publishMutation,
    unpublishMutation,
    rollbackMutation,
    restoreMutation
  }
}

/**
 * Hook for first-user experience enhancements
 */
export function useFirstUserExperience(projectId: string) {
  const { user } = useAuthStore()
  const isFirstUser = user ? isFirstProject(user.id) : false

  return {
    isFirstUser,
    shouldShowGuidance: isFirstUser,
    trackFirstUserEvent: (event: string, data?: any) => {
      if (isFirstUser && user) {
        trackVersionEvent(event as any, {
          projectId,
          userId: user.id,
          context: {
            isFirstUser: true,
            ...data
          }
        })
      }
    }
  }
}
