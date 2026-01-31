/**
 * Migration Progress View Component
 * Real-time migration progress with expert UX patterns
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/routing'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { useUnifiedEvents } from '@/hooks/use-unified-events'
import {
  type UnifiedEvent,
  type MigrationPhase,
  type ConnectionStatus,
  getMigrationPhaseProgress,
  isMigrationEvent
} from '@/types/migration'
import { logger } from '@/utils/logger'

// NODE_ENV is inlined at build time by Next.js - safe to use in client components
// eslint-disable-next-line no-restricted-globals
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'

interface MigrationProgressTranslations {
  progress: {
    title: string
    migrationId: string
    connection: {
      connected: string
      connecting: string
      disconnected: string
      error: string
      authRequired: string
      retryButton: string
    }
    status: {
      pending: string
      analyzing: string
      processing: string
      completed: string
      failed: string
      cancelled: string
    }
    phases: {
      verification: {
        title: string
        description: string
      }
      analysis: {
        title: string
        description: string
      }
      planning: {
        title: string
        description: string
      }
      transformation: {
        title: string
        description: string
      }
      deployment: {
        title: string
        description: string
      }
      completed: {
        title: string
        description: string
      }
    }
    phaseTimeline: {
      title: string
      complete: string
      inProgress: string
    }
    actions: {
      viewProject: string
      cancelMigration: string
      startNew: string
      copySupportId: string
    }
    messages: {
      initializing: string
      domainVerificationRequired: string
      domainVerificationCompleted: string
      migrationCompleted: string
      migrationFailed: string
      migrationCancelled: string
      supportId: string
      projectNotReady: string
      cancellationFailed: string
      cancellationSuccess: string
    }
    eventLog: {
      title: string
    }
  }
  common: {
    loading: string
    error: string
  }
}

interface MigrationProgressViewProps {
  migrationId: string
  translations: MigrationProgressTranslations
}

export function MigrationProgressView({ migrationId, translations }: MigrationProgressViewProps) {
  const router = useRouter()
  const [migrationStatus, setMigrationStatus] = useState<string>('pending')
  const [currentPhase, setCurrentPhase] = useState<MigrationPhase>('verification')
  const [progress, setProgress] = useState(0)
  const [currentMessage, setCurrentMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [correlationId, setCorrelationId] = useState<string>('')
  const [canCancel, setCanCancel] = useState(true)
  const [projectId, setProjectId] = useState<string | null>(null)

  const t = translations.progress
  const tCommon = translations.common

  // Helper: Get translated message from event type
  const getEventMessage = (event: UnifiedEvent): string => {
    if (!isMigrationEvent(event)) return event.message

    switch (event.type) {
      case 'migration_started':
        return t.messages.initializing
      case 'migration_progress':
        return event.message // Keep progress messages as they have phase context
      case 'migration_completed':
        return t.messages.migrationCompleted
      case 'migration_failed':
        return t.messages.migrationFailed
      case 'migration_cancelled':
        return t.messages.migrationCancelled
      case 'verification_required':
        return t.messages.domainVerificationRequired
      case 'verification_completed':
        return t.messages.domainVerificationCompleted
      default:
        return event.message
    }
  }

  // Connection to unified events
  const { events, connectionStatus, isConnected, retry } = useUnifiedEvents({
    migrationId
  })

  const isCompleted = migrationStatus === 'completed'
  const isFailed = migrationStatus === 'failed'
  const isCancelled = migrationStatus === 'cancelled'
  const isTerminalState = isCompleted || isFailed || isCancelled

  // Set initial message
  useEffect(() => {
    if (!currentMessage) {
      setCurrentMessage(t.messages.initializing)
    }
  }, [currentMessage, t.messages.initializing])

  // Process events to update migration state
  useEffect(() => {
    const migrationEvents = events.filter(isMigrationEvent)
    if (migrationEvents.length === 0) return

    // Get the latest event for this migration
    const latestEvent = migrationEvents
      .filter(event => event.migrationId === migrationId)
      .sort((a, b) => b.timestamp - a.timestamp)[0]

    if (!latestEvent) return

    logger.debug('migration', 'Processing migration event', {
      type: latestEvent.type,
      migrationId: latestEvent.migrationId,
      progress: latestEvent.progress
    })

    // Update state based on event type
    const translatedMessage = getEventMessage(latestEvent)

    switch (latestEvent.type) {
      case 'migration_started':
        setMigrationStatus('analyzing')
        setCurrentPhase('verification')
        setProgress(latestEvent.progress)
        setCurrentMessage(translatedMessage)
        setCorrelationId(latestEvent.correlationId || '')
        break

      case 'migration_progress':
        setMigrationStatus('processing')
        setProgress(latestEvent.progress)
        // For progress events, use raw message as it contains phase-specific info
        setCurrentMessage(latestEvent.message)
        if (latestEvent.phase) {
          setCurrentPhase(latestEvent.phase as MigrationPhase)
        }
        setCorrelationId(latestEvent.correlationId || '')
        break

      case 'migration_phase_change':
        setCurrentPhase(latestEvent.phase as MigrationPhase)
        setProgress(latestEvent.progress)
        setCurrentMessage(latestEvent.message)
        setCorrelationId(latestEvent.correlationId || '')
        break

      case 'migration_completed':
        setMigrationStatus('completed')
        setCurrentPhase('completed')
        setProgress(100)
        setCurrentMessage(translatedMessage)
        setCanCancel(false)
        setCorrelationId(latestEvent.correlationId || '')

        // Extract project ID from completed event
        if (latestEvent.projectId) {
          setProjectId(latestEvent.projectId)
        }

        toast.success(t.messages.migrationCompleted)
        break

      case 'migration_failed':
        setMigrationStatus('failed')
        setProgress(latestEvent.progress)
        setCurrentMessage(translatedMessage)
        setError(translatedMessage)
        setCanCancel(false)
        setCorrelationId(latestEvent.correlationId || '')
        toast.error(t.messages.migrationFailed)
        break

      case 'migration_cancelled':
        setMigrationStatus('cancelled')
        setProgress(latestEvent.progress)
        setCurrentMessage(translatedMessage)
        setCanCancel(false)
        setCorrelationId(latestEvent.correlationId || '')
        toast.info(t.messages.migrationCancelled)
        break

      case 'verification_required':
        setCurrentPhase('verification')
        setCurrentMessage(translatedMessage)
        break

      case 'verification_completed':
        setCurrentMessage(translatedMessage)
        break
    }
  }, [events, migrationId, t.messages])

  // Handle migration cancellation
  const handleCancel = async () => {
    if (!canCancel) return

    try {
      const response = await fetch(`/api/migration/${migrationId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID()
        }
      })

      if (response.ok) {
        toast.success(t.messages.cancellationSuccess)
        setCanCancel(false)
      } else {
        throw new Error(t.messages.cancellationFailed)
      }
    } catch (error) {
      logger.error('Migration cancellation failed', { error, migrationId })
      toast.error(t.messages.cancellationFailed)
    }
  }

  // Navigate to builder when project is ready
  const handleViewProject = async () => {
    if (!projectId) {
      toast.error(t.messages.projectNotReady)
      return
    }

    try {
      // Expert: Verify project ready with lightweight probe
      const response = await fetch(`/api/projects/${projectId}/healthz.json?t=${Date.now()}`)

      if (response.ok) {
        router.push(`/builder/projects/${projectId}`)
      } else {
        toast.error(t.messages.projectNotReady)
      }
    } catch (error) {
      toast.error(t.messages.projectNotReady)
    }
  }

  // Try to fetch projectId from API if missing from event
  useEffect(() => {
    if (isCompleted && !projectId && migrationId) {
      const fetchProjectId = async () => {
        try {
          const response = await fetch(`/api/migration/${migrationId}/status`)
          if (response.ok) {
            const data = await response.json()
            if (data.projectId) {
              setProjectId(data.projectId)
            }
          }
        } catch (error) {
          logger.error('Failed to fetch project ID from migration status', { error, migrationId })
        }
      }
      fetchProjectId()
    }
  }, [isCompleted, projectId, migrationId])

  // Get phase-specific information
  const getPhaseInfo = (phase: MigrationPhase) => {
    const phaseInfo = {
      verification: {
        title: t.phases.verification.title,
        description: t.phases.verification.description,
        icon: '🔍'
      },
      analysis: {
        title: t.phases.analysis.title,
        description: t.phases.analysis.description,
        icon: '🔬'
      },
      planning: {
        title: t.phases.planning.title,
        description: t.phases.planning.description,
        icon: '📋'
      },
      transformation: {
        title: t.phases.transformation.title,
        description: t.phases.transformation.description,
        icon: '⚡'
      },
      deployment: {
        title: t.phases.deployment.title,
        description: t.phases.deployment.description,
        icon: '🚀'
      },
      completed: {
        title: t.phases.completed.title,
        description: t.phases.completed.description,
        icon: '✅'
      }
    }

    return phaseInfo[phase] || phaseInfo.verification
  }

  const currentPhaseInfo = getPhaseInfo(currentPhase)

  // Get translated status
  const getTranslatedStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      'pending': t.status.pending,
      'analyzing': t.status.analyzing,
      'processing': t.status.processing,
      'completed': t.status.completed,
      'failed': t.status.failed,
      'cancelled': t.status.cancelled
    }
    return statusMap[status] || status
  }

  // Connection status indicator
  const getConnectionStatusInfo = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return { color: 'text-green-500', text: t.connection.connected, icon: '🟢' }
      case 'connecting':
        return { color: 'text-yellow-500', text: t.connection.connecting, icon: '🟡' }
      case 'disconnected':
        return { color: 'text-gray-500', text: t.connection.disconnected, icon: '⚪' }
      case 'error':
        return { color: 'text-red-500', text: t.connection.error, icon: '🔴' }
      case 'auth_required':
        return { color: 'text-orange-500', text: t.connection.authRequired, icon: '🟠' }
      default:
        return { color: 'text-gray-500', text: status, icon: '⚪' }
    }
  }

  const connectionInfo = getConnectionStatusInfo(connectionStatus)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground">{t.migrationId} {migrationId}</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection Status - Only show when migration is active */}
          {!isTerminalState && (
            <div className="flex items-center gap-2 text-sm">
              <span className={connectionInfo.color}>{connectionInfo.icon}</span>
              <span className={connectionInfo.color}>{connectionInfo.text}</span>
              {!isConnected && (
                <Button variant="outline" size="sm" onClick={retry}>
                  {t.connection.retryButton}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Success State - Prominent Card for Completed Migrations */}
      {isCompleted && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-2xl">
                ✅
              </div>
              <div className="flex-1">
                <CardTitle className="text-green-900 dark:text-green-100">
                  {t.phases.completed.title}
                </CardTitle>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  {t.phases.completed.description}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {projectId ? (
              <div className="space-y-3">
                <p className="text-sm text-green-800 dark:text-green-200">
                  {t.messages.migrationCompleted}
                </p>
                <Button
                  onClick={handleViewProject}
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {t.actions.viewProject}
                </Button>
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  {t.messages.projectNotReady}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Progress Card - Show during migration */}
      {!isCompleted && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">{currentPhaseInfo.icon}</span>
                {currentPhaseInfo.title}
              </CardTitle>
              <Badge variant={isFailed ? 'destructive' : 'secondary'}>
                {getTranslatedStatus(migrationStatus)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{currentMessage}</span>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Phase Description */}
            <p className="text-muted-foreground">
              {currentPhaseInfo.description}
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              {canCancel && !isFailed && !isCancelled && (
                <Button variant="outline" onClick={handleCancel}>
                  {t.actions.cancelMigration}
                </Button>
              )}

              {(isFailed || isCancelled) && (
                <Button
                  variant="outline"
                  onClick={() => router.push('/migrate')}
                >
                  {t.actions.startNew}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <div className="space-y-2">
              <p>{error}</p>
              {correlationId && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">{t.messages.supportId} {correlationId}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(correlationId)
                      toast.success('Support ID copied to clipboard')
                    }}
                  >
                    {t.actions.copySupportId}
                  </Button>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Migration Phases Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t.phaseTimeline.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(['verification', 'analysis', 'planning', 'transformation', 'deployment', 'completed'] as MigrationPhase[]).map((phase) => {
              const phaseInfo = getPhaseInfo(phase)
              const phaseProgress = getMigrationPhaseProgress(phase)
              const isCurrentPhase = currentPhase === phase
              const isPhaseCompleted = progress >= phaseProgress
              const isActive = isCurrentPhase && !isPhaseCompleted

              return (
                <div
                  key={phase}
                  className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary/10 border border-primary/20'
                      : isPhaseCompleted
                      ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800'
                      : 'bg-muted/20'
                  }`}
                >
                  <div className={`text-2xl ${
                    isPhaseCompleted
                      ? 'grayscale-0'
                      : isActive
                      ? 'grayscale-0'
                      : 'grayscale opacity-50'
                  }`}>
                    {phaseInfo.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-medium ${
                      isActive ? 'text-primary' : isPhaseCompleted ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'
                    }`}>
                      {phaseInfo.title}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {phaseInfo.description}
                    </p>
                  </div>
                  <div className="text-right">
                    {isPhaseCompleted && (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                        {t.phaseTimeline.complete}
                      </Badge>
                    )}
                    {isActive && (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                        {t.phaseTimeline.inProgress}
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Event Log (Debug) */}
      {IS_DEVELOPMENT && events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.eventLog.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {events
                .filter(isMigrationEvent)
                .filter(event => event.migrationId === migrationId)
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10)
                .map((event) => (
                  <div key={event.id} className="text-xs bg-muted p-2 rounded">
                    <div className="flex justify-between">
                      <span className="font-mono">{event.type}</span>
                      <span className="text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-muted-foreground">{getEventMessage(event)}</div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
