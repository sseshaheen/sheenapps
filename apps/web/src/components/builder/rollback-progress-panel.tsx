/**
 * Rollback Progress Panel
 * Two-phase progress tracking for rollback operations
 * Phase 1: Immediate preview update (<1s)
 * Phase 2: Background working directory sync (up to 5min)
 */

'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { useProjectStatus } from '@/hooks/use-project-status'
import { trackVersionEvent } from '@/utils/version-analytics'

interface RollbackProgressPanelProps {
  projectId: string
  rollbackData?: {
    rollbackVersionId: string
    targetVersionId: string
    previewUrl: string
    jobId?: string
    workingDirectory: {
      synced: boolean
      message: string
      extractedFiles: number
    }
  }
  onComplete?: () => void
  onError?: (error: string) => void
  className?: string
}

interface ProgressPhase {
  phase: 'preview' | 'working_directory' | 'completed' | 'failed'
  progress: {
    current: number
    total: number
  }
  message: string
  startTime: number
  estimatedDuration?: number
}

export function RollbackProgressPanel({
  projectId,
  rollbackData,
  onComplete,
  onError,
  className
}: RollbackProgressPanelProps) {
  const { data: projectStatus } = useProjectStatus(projectId)
  const [currentPhase, setCurrentPhase] = useState<ProgressPhase>({
    phase: 'preview',
    progress: { current: 0, total: 100 },
    message: 'Updating preview...',
    startTime: Date.now(),
    estimatedDuration: 1000 // 1 second for preview
  })

  // Track rollback phases and progress
  useEffect(() => {
    if (!rollbackData) return

    // Phase 1: Preview update (immediate)
    if (rollbackData.previewUrl && currentPhase.phase === 'preview') {
      logger.info('Rollback Phase 1: Preview updated immediately')
      
      // Simulate quick preview update progress
      const progressInterval = setInterval(() => {
        setCurrentPhase(prev => {
          if (prev.progress.current >= 100) {
            clearInterval(progressInterval)
            
            // Move to Phase 2 if working directory sync needed
            if (!rollbackData.workingDirectory.synced) {
              return {
                phase: 'working_directory',
                progress: { current: 0, total: 100 },
                message: 'Syncing working directory...',
                startTime: Date.now(),
                estimatedDuration: 180000 // 3 minutes estimated
              }
            } else {
              // Skip to completed if no sync needed
              return {
                phase: 'completed',
                progress: { current: 100, total: 100 },
                message: 'Rollback completed successfully',
                startTime: prev.startTime
              }
            }
          }
          
          return {
            ...prev,
            progress: {
              ...prev.progress,
              current: Math.min(prev.progress.current + 20, 100)
            }
          }
        })
      }, 100) // Fast progress for preview
    }
  }, [rollbackData, currentPhase.phase])

  // Monitor project status for working directory sync completion
  useEffect(() => {
    if (projectStatus && currentPhase.phase === 'working_directory') {
      // Check if rollback completed
      if (projectStatus.buildStatus === 'deployed') {
        logger.info('Rollback Phase 2: Working directory sync completed')
        
        setCurrentPhase(prev => ({
          phase: 'completed',
          progress: { current: 100, total: 100 },
          message: 'Rollback completed successfully',
          startTime: prev.startTime
        }))
        
        // Track successful completion
        trackVersionEvent('rollback_success', {
          projectId,
          versionId: rollbackData?.rollbackVersionId,
          operationDuration: Date.now() - currentPhase.startTime,
          context: {
            phase: 'completed',
            targetVersionId: rollbackData?.targetVersionId
          }
        })
        
        onComplete?.()
      }
      
      // Check if rollback failed
      if (projectStatus.buildStatus === 'rollbackFailed') {
        logger.error('Rollback Phase 2: Working directory sync failed')
        
        setCurrentPhase(prev => ({
          phase: 'failed',
          progress: { current: 0, total: 100 },
          message: 'Rollback failed - working directory sync error',
          startTime: prev.startTime
        }))
        
        onError?.('Working directory sync failed')
      }
    }
  }, [projectStatus, currentPhase.phase, currentPhase.startTime, rollbackData, onComplete, onError, projectId])

  // Simulate progress for working directory phase
  useEffect(() => {
    if (currentPhase.phase === 'working_directory') {
      const progressInterval = setInterval(() => {
        setCurrentPhase(prev => {
          const elapsed = Date.now() - prev.startTime
          const estimatedProgress = Math.min(
            (elapsed / (prev.estimatedDuration || 180000)) * 100,
            95 // Cap at 95% until actual completion
          )
          
          return {
            ...prev,
            progress: {
              ...prev.progress,
              current: Math.max(prev.progress.current, estimatedProgress)
            }
          }
        })
      }, 2000) // Update every 2 seconds

      return () => clearInterval(progressInterval)
    }
  }, [currentPhase.phase, currentPhase.startTime])

  if (!rollbackData) return null

  const percentage = Math.round(currentPhase.progress.current)
  const isCompleted = currentPhase.phase === 'completed'
  const isFailed = currentPhase.phase === 'failed'

  return (
    <Card className={cn(
      "transition-all duration-300",
      isCompleted && "bg-green-50 border-green-200",
      isFailed && "bg-red-50 border-red-200",
      !isCompleted && !isFailed && "bg-yellow-50 border-yellow-200",
      className
    )}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full",
            isCompleted && "bg-green-100",
            isFailed && "bg-red-100",
            !isCompleted && !isFailed && "bg-yellow-100"
          )}>
            {isCompleted ? (
              <Icon name="check" className="w-4 h-4 text-green-600" />
            ) : isFailed ? (
              <Icon name="x" className="w-4 h-4 text-red-600" />
            ) : (
              <Icon name="rotate-ccw" className="w-4 h-4 text-yellow-600 animate-spin" />
            )}
          </div>
          
          <div className="flex-1">
            <h4 className={cn(
              "font-medium",
              isCompleted && "text-green-900",
              isFailed && "text-red-900",
              !isCompleted && !isFailed && "text-yellow-900"
            )}>
              {isCompleted ? 'Rollback Complete' : isFailed ? 'Rollback Failed' : 'Rolling Back'}
            </h4>
            <p className={cn(
              "text-sm",
              isCompleted && "text-green-700",
              isFailed && "text-red-700",
              !isCompleted && !isFailed && "text-yellow-700"
            )}>
              {currentPhase.message}
            </p>
          </div>
          
          {!isCompleted && !isFailed && (
            <div className="text-sm font-medium text-gray-600">
              {percentage}%
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {!isCompleted && (
          <div className="mb-3">
            <Progress 
              value={percentage} 
              className={cn(
                "h-2",
                isFailed && "bg-red-200"
              )}
            />
          </div>
        )}

        {/* Phase Indicators */}
        <div className="flex items-center gap-4 text-xs">
          <PhaseIndicator
            label="Preview"
            status={currentPhase.phase === 'preview' ? 'active' : 'completed'}
            icon="eye"
          />
          <div className="flex-1 border-t border-gray-300" />
          <PhaseIndicator
            label="Working Directory"
            status={
              currentPhase.phase === 'working_directory' ? 'active' :
              currentPhase.phase === 'preview' ? 'pending' :
              currentPhase.phase === 'failed' ? 'failed' : 'completed'
            }
            icon="folder"
          />
        </div>

        {/* Estimated Time Remaining */}
        {currentPhase.phase === 'working_directory' && !isFailed && (
          <EstimatedTimeRemaining
            startTime={currentPhase.startTime}
            estimatedDuration={currentPhase.estimatedDuration || 180000}
            currentProgress={percentage}
          />
        )}

        {/* Actions */}
        {(isCompleted || isFailed) && (
          <div className="flex gap-2 mt-4">
            {isCompleted && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  window.open(rollbackData.previewUrl, '_blank')
                }}
              >
                <Icon name="external-link" className="w-3 h-3 mr-1" />
                View Result
              </Button>
            )}
            
            {isFailed && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // TODO: Implement retry rollback
                    logger.info('Retrying rollback for project:', projectId)
                  }}
                >
                  <Icon name="refresh-cw" className="w-3 h-3 mr-1" />
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // TODO: Open support modal
                    logger.info('Opening support for rollback failure:', projectId)
                  }}
                >
                  <Icon name="help-circle" className="w-3 h-3 mr-1" />
                  Get Help
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * Phase Indicator Component
 */
function PhaseIndicator({
  label,
  status,
  icon
}: {
  label: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  icon: string
}) {
  return (
    <div className="flex items-center gap-1">
      <div className={cn(
        "flex items-center justify-center w-4 h-4 rounded-full text-xs",
        status === 'pending' && "bg-gray-200 text-gray-400",
        status === 'active' && "bg-yellow-200 text-yellow-600",
        status === 'completed' && "bg-green-200 text-green-600",
        status === 'failed' && "bg-red-200 text-red-600"
      )}>
        <Icon 
          name={icon as any} 
          className={cn(
            "w-2 h-2",
            status === 'active' && "animate-pulse"
          )} 
        />
      </div>
      <span className={cn(
        "text-xs font-medium",
        status === 'pending' && "text-gray-400",
        status === 'active' && "text-yellow-600",
        status === 'completed' && "text-green-600",
        status === 'failed' && "text-red-600"
      )}>
        {label}
      </span>
    </div>
  )
}

/**
 * Estimated Time Remaining Component
 */
function EstimatedTimeRemaining({
  startTime,
  estimatedDuration,
  currentProgress
}: {
  startTime: number
  estimatedDuration: number
  currentProgress: number
}) {
  const [timeRemaining, setTimeRemaining] = useState<string>('')

  useEffect(() => {
    const updateTimer = () => {
      const elapsed = Date.now() - startTime
      const progressRatio = currentProgress / 100
      
      if (progressRatio > 0) {
        const estimatedTotal = elapsed / progressRatio
        const remaining = Math.max(0, estimatedTotal - elapsed)
        
        if (remaining > 60000) {
          setTimeRemaining(`${Math.ceil(remaining / 60000)} min remaining`)
        } else if (remaining > 5000) {
          setTimeRemaining(`${Math.ceil(remaining / 1000)} sec remaining`)
        } else {
          setTimeRemaining('Almost done...')
        }
      } else {
        setTimeRemaining('Calculating...')
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [startTime, currentProgress])

  return (
    <div className="mt-2 text-xs text-gray-500 text-center">
      {timeRemaining}
    </div>
  )
}

/**
 * Rollback Summary Component
 * Shows what was rolled back and current state
 */
export function RollbackSummary({
  rollbackData,
  targetVersion
}: {
  rollbackData: {
    rollbackVersionId: string
    targetVersionId: string
    previewUrl: string
  }
  targetVersion?: {
    name: string
    semver: string
    createdAt: string
  }
}) {
  return (
    <Card className="bg-blue-50 border-blue-200">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="rotate-ccw" className="w-4 h-4 text-blue-600" />
          <h4 className="font-medium text-blue-900">Rollback Summary</h4>
        </div>
        
        <div className="space-y-2 text-sm text-blue-700">
          <div className="flex justify-between">
            <span>Rolled back to:</span>
            <span className="font-medium">
              {targetVersion?.name || targetVersion?.semver || rollbackData.targetVersionId}
            </span>
          </div>
          
          {targetVersion?.createdAt && (
            <div className="flex justify-between">
              <span>Version created:</span>
              <span className="font-medium">
                {new Date(targetVersion.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span>New version ID:</span>
            <span className="font-mono text-xs">
              {rollbackData.rollbackVersionId.slice(0, 8)}...
            </span>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full mt-3"
          onClick={() => window.open(rollbackData.previewUrl, '_blank')}
        >
          <Icon name="external-link" className="w-3 h-3 mr-1" />
          View Rolled Back Version
        </Button>
      </div>
    </Card>
  )
}