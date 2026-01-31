'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'
import type { ApiResponse, DeployResponse } from '@/types/inhouse-api'
import { safeJson } from '@/lib/api/safe-json'
import { useDeploymentLogs, getCurrentStep, getStepProgress } from '@/hooks/useDeploymentLogs'

interface DeployDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  buildId: string | null
  subdomain: string
  translations: {
    dialogTitle: string
    buildLabel: string
    createdLabel: string
    deployTo: string
    includes: string
    staticFiles: string
    ssrBundle: string
    envVars: string
    warning: string
    previousBuild: string
    actions: {
      cancel: string
      deployNow: string
    }
    progress: {
      uploadingAssets: string
      deployingBundle: string
      updatingRouting: string
      complete: string
    }
    success: string
    error: string
    logs?: {
      showDetails: string
      hideDetails: string
    }
  }
}

type DeployPhase = 'idle' | 'uploading' | 'deploying' | 'routing' | 'complete' | 'error'

interface BuildArtifact {
  path: string
  size?: number
  content?: string
  contentType?: string
}

interface BuildArtifactsResponse {
  staticAssets: BuildArtifact[]
  serverBundle: {
    code: string
    entryPoint?: string
  }
  envVars?: Record<string, string>
}

/**
 * Deploy Dialog for Easy Mode Projects
 *
 * Shows deployment confirmation and progress:
 * 1. Build information
 * 2. Deploy target
 * 3. Progress steps
 * 4. Success/error handling
 *
 * EXPERT FIX ROUND 2: Removed userId prop (API uses session)
 */
export function DeployDialog({
  open,
  onOpenChange,
  projectId,
  buildId,
  subdomain,
  translations
}: DeployDialogProps) {
  const [phase, setPhase] = useState<DeployPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [artifactSummary, setArtifactSummary] = useState<{
    assetCount: number
    assetsMb: number
    bundleMb: number
    envCount: number
  } | null>(null)

  // EXPERT FIX ROUND 2: Track timeout ref to clear on unmount (prevents state updates after close)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // EXPERT FIX ROUND 7: Clear existing timeouts before scheduling new ones (prevents stale callbacks)
  const clearCloseTimeouts = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  // Live deployment logs via SSE
  const {
    events: logEvents,
    status: logStatus,
    isComplete: logsComplete,
    reset: resetLogs,
  } = useDeploymentLogs({
    projectId,
    deploymentId,
    enabled: !!deploymentId && phase !== 'idle' && phase !== 'complete',
  })

  // Derive progress from live events
  const currentStep = getCurrentStep(logEvents)
  const progress = getStepProgress(currentStep)

  // EXPERT FIX ROUND 5: Update phase based on live events and auto-close on completion
  useEffect(() => {
    if (!deploymentId) return
    if (!logsComplete) return

    const lastEvent = logEvents[logEvents.length - 1]

    // Handle error state
    if (lastEvent?.level === 'error') {
      setPhase('error')
      setError(lastEvent.message)
      return
    }

    // Handle successful completion - SSE says deployment is done
    if (lastEvent?.step === 'done') {
      setPhase('complete')

      // EXPERT FIX ROUND 7: Clear any pending timeouts before scheduling new ones
      clearCloseTimeouts()

      // Auto-close after showing success briefly
      closeTimeoutRef.current = setTimeout(() => {
        onOpenChange(false)
        closeTimeoutRef.current = setTimeout(() => {
          setPhase('idle')
          setDeployedUrl(null)
          setDeploymentId(null)
          resetLogs()
        }, 300)
      }, 2000)
    }
  }, [logsComplete, logEvents, deploymentId, onOpenChange, resetLogs])

  // EXPERT FIX ROUND 2: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearCloseTimeouts()
    }
  }, [])

  const handleDeploy = async () => {
    if (!buildId) {
      setError('No build available to deploy')
      return
    }

    setPhase('uploading')
    setError(null)

    try {
      // Fetch real build artifacts first
      const artifactsRes = await fetch(`/api/builds/${buildId}/artifacts`, {
        method: 'GET'
      })

      if (!artifactsRes.ok) {
        setPhase('error') // EXPERT FIX ROUND 4: Explicit phase setting on error
        throw new Error('Build artifacts are not ready yet. Please try again in a moment.')
      }

      // EXPERT FIX ROUND 2: Use safe JSON parsing (handles HTML error pages)
      const artifacts = await safeJson<BuildArtifactsResponse>(artifactsRes)

      if (!artifacts?.staticAssets || !artifacts?.serverBundle) {
        setPhase('error')
        throw new Error('Build artifacts are incomplete or not ready yet.')
      }

      // EXPERT FIX ROUND 4: Compute real artifact summary (no fake numbers)
      const assets = artifacts.staticAssets ?? []
      const totalAssetBytes = assets.reduce((sum, asset) => sum + (asset.size ?? 0), 0)
      const bundleBytes = artifacts.serverBundle?.code
        ? new Blob([artifacts.serverBundle.code]).size
        : 0

      setArtifactSummary({
        assetCount: assets.length,
        assetsMb: totalAssetBytes / (1024 * 1024),
        bundleMb: bundleBytes / (1024 * 1024),
        envCount: artifacts.envVars ? Object.keys(artifacts.envVars).length : 0
      })

      setPhase('deploying')

      // Deploy with real artifacts (not dummy data)
      const response = await fetch('/api/inhouse/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId,
          buildId,
          staticAssets: artifacts.staticAssets,
          serverBundle: artifacts.serverBundle,
          envVars: artifacts.envVars || {}
        })
      })

      // EXPERT FIX ROUND 6: Use safeJson for deploy response (handles HTML error pages)
      const data = await safeJson<ApiResponse<DeployResponse>>(response)

      if (!response.ok || !data?.ok) {
        setPhase('error')
        throw new Error(data?.ok === false ? data.error.message : 'Deployment failed')
      }

      // Set deployed URL for display
      setDeployedUrl(data.data.url)

      // Set deployment ID to enable live logs streaming
      // EXPERT FIX ROUND 5: Don't set 'complete' yet - let SSE drive completion
      if (data.data.deploymentId) {
        setDeploymentId(data.data.deploymentId)
        // Stay in 'routing' phase while waiting for SSE to confirm completion
        setPhase('routing')
      } else {
        // No deploymentId means we can't stream logs - fall back to immediate complete
        setPhase('complete')

        // EXPERT FIX ROUND 7: Clear any pending timeouts before scheduling new ones
        clearCloseTimeouts()

        closeTimeoutRef.current = setTimeout(() => {
          onOpenChange(false)
          closeTimeoutRef.current = setTimeout(() => {
            setPhase('idle')
            setDeployedUrl(null)
            setDeploymentId(null)
            resetLogs()
          }, 300)
        }, 2000)
      }

    } catch (err) {
      // EXPERT FIX ROUND 4: Ensure phase is always 'error' on any failure
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Deployment failed')
    }
  }

  // EXPERT FIX ROUND 4: Proper onOpenChange handler that accepts boolean (Radix requirement)
  const handleOpenChange = (nextOpen: boolean) => {
    // If user is trying to close while deploying, ignore
    if (!nextOpen && (phase === 'uploading' || phase === 'deploying' || phase === 'routing')) {
      return
    }

    onOpenChange(nextOpen)

    // If closing, reset state after animation
    if (!nextOpen) {
      setTimeout(() => {
        setPhase('idle')
        setError(null)
        setDeployedUrl(null)
        setDeploymentId(null)
        setArtifactSummary(null)
        setShowDetails(false)
        resetLogs()
      }, 300)
    }
  }

  const isDeploying = phase === 'uploading' || phase === 'deploying' || phase === 'routing'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translations.dialogTitle}</DialogTitle>
          <DialogDescription>
            {translations.deployTo}: <span className="font-semibold">{subdomain}.sheenapps.com</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Build Info - Milestone C: Smooth transition added */}
          {phase === 'idle' && buildId && (
            <div className={cn(
              "space-y-3 transition-all duration-300",
              "animate-in fade-in-0 slide-in-from-bottom-4"
            )}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{translations.buildLabel}:</span>
                <span className="font-mono text-xs">{buildId.slice(0, 12)}</span>
              </div>

              <div className="p-3 bg-muted rounded-md space-y-2">
                <p className="text-xs font-medium text-foreground">{translations.includes}</p>
                {/* EXPERT FIX ROUND 4: Show real artifact summary (computed during deploy), not fake numbers */}
                {artifactSummary ? (
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>
                      • {translations.staticFiles
                        .replace('{count}', String(artifactSummary.assetCount))
                        .replace('{size}', artifactSummary.assetsMb.toFixed(1))}
                    </li>
                    <li>
                      • {translations.ssrBundle
                        .replace('{size}', artifactSummary.bundleMb.toFixed(1))}
                    </li>
                    <li>
                      • {translations.envVars
                        .replace('{count}', String(artifactSummary.envCount))}
                    </li>
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Build artifacts will be loaded when you deploy
                  </p>
                )}

              <Alert>
                <Icon name="alert-circle" className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {translations.warning}
                </AlertDescription>
              </Alert>
            </div>
            </div>
          )}

          {/* No Build Available */}
          {phase === 'idle' && !buildId && (
            <Alert variant="destructive">
              <Icon name="alert-circle" className="h-4 w-4" />
              <AlertDescription>
                No build available to deploy. Please build your project first.
              </AlertDescription>
            </Alert>
          )}

          {/* Deploy Progress - Enhanced with live logs */}
          {isDeploying && (
            <div className={cn(
              "space-y-3 transition-all duration-300",
              "animate-in fade-in-0 slide-in-from-bottom-4"
            )}>
              <div className="flex items-center gap-3">
                <Icon name="loader-2" className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-medium">
                    {/* Show last log message or fallback to phase-based text */}
                    {logEvents.length > 0
                      ? logEvents[logEvents.length - 1].message
                      : (
                        <>
                          {phase === 'uploading' && translations.progress.uploadingAssets.replace(
                            '{count}',
                            artifactSummary ? String(artifactSummary.assetCount) : '...'
                          )}
                          {phase === 'deploying' && translations.progress.deployingBundle}
                          {phase === 'routing' && translations.progress.updatingRouting}
                        </>
                      )
                    }
                  </p>
                  <div className="h-1 bg-muted rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{
                        width: logEvents.length > 0 ? `${progress}%` : (
                          phase === 'uploading' ? '33%' : phase === 'deploying' ? '66%' : '100%'
                        )
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Expandable live logs */}
              {logEvents.length > 1 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Icon
                      name={showDetails ? 'chevron-down' : 'chevron-right'}
                      className="w-3 h-3"
                    />
                    {showDetails
                      ? (translations.logs?.hideDetails ?? 'Hide details')
                      : (translations.logs?.showDetails ?? 'Show details')
                    }
                  </button>

                  {showDetails && (
                    <div className="bg-muted/50 rounded-md p-2 max-h-32 overflow-y-auto">
                      <div className="space-y-1">
                        {logEvents.map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "text-xs font-mono flex items-start gap-2",
                              event.level === 'error' && "text-destructive",
                              event.level === 'warn' && "text-warning",
                              event.level === 'info' && "text-muted-foreground"
                            )}
                          >
                            <span className="text-muted-foreground/60 flex-shrink-0">
                              {new Date(event.ts).toLocaleTimeString()}
                            </span>
                            <span>{event.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Success - Milestone C: Smooth transition added */}
          {phase === 'complete' && deployedUrl && (
            <Alert className={cn(
              "border-primary bg-primary/5 transition-all duration-300",
              "animate-in fade-in-0 slide-in-from-bottom-4"
            )}>
              <Icon name="check-circle" className="h-4 w-4 text-primary" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">{translations.success}</p>
                  <p className="text-xs text-muted-foreground">
                    {translations.progress.complete.replace('{url}', deployedUrl)}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Error - Milestone C: Smooth transition added */}
          {phase === 'error' && error && (
            <Alert variant="destructive" className={cn(
              "transition-all duration-300",
              "animate-in fade-in-0 slide-in-from-bottom-4"
            )}>
              <Icon name="alert-circle" className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">{translations.error}</p>
                  <p className="text-xs">{error}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          {phase === 'idle' && (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isDeploying}
              >
                {translations.actions.cancel}
              </Button>
              <Button
                onClick={handleDeploy}
                disabled={!buildId || isDeploying}
              >
                <Icon name="rocket" className="w-4 h-4 me-2" />
                {translations.actions.deployNow}
              </Button>
            </>
          )}

          {phase === 'error' && (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          )}

          {phase === 'complete' && (
            <Button
              onClick={() => deployedUrl && window.open(deployedUrl, '_blank', 'noopener,noreferrer')}
            >
              <Icon name="external-link" className="w-4 h-4 me-2" />
              Open Site
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
