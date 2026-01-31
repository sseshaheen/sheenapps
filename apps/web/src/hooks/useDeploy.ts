'use client'

import { useState, useCallback } from 'react'
import { useLatestDeployments } from './useDeploymentHistory'
import type { ApiResponse, DeployResponse } from '@/types/inhouse-api'
import { safeJson } from '@/lib/api/safe-json'

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

export type DeployPhase = 'idle' | 'uploading' | 'deploying' | 'routing' | 'complete' | 'error'

interface UseDeployOptions {
  projectId: string
  enabled?: boolean
}

interface UseDeployResult {
  /** Whether there's a prior successful deploy (false = first deploy) */
  isFirstDeploy: boolean
  /** Whether the hook is loading deployment history */
  isLoadingHistory: boolean
  /** Current deploy phase */
  deployPhase: DeployPhase
  /** Error message if deploy failed */
  deployError: string | null
  /** Deployed URL on success */
  deployedUrl: string | null
  /** Whether currently deploying */
  isDeploying: boolean
  /** Quick deploy without dialog (for subsequent deploys) */
  quickDeploy: (buildId: string) => Promise<{ success: boolean; url?: string; error?: string }>
  /** Reset deploy state */
  resetDeployState: () => void
}

/**
 * Shared deploy hook for Easy Mode projects
 *
 * Used by both Infrastructure Panel (DeployButton) and Chat (BuildRunCard)
 *
 * Decision tree per INHOUSE_MODE_REMAINING.md:
 * - If no prior successful deploy (isFirstDeploy=true) → caller should open DeployDialog
 * - Otherwise → caller can use quickDeploy() for inline deployment
 *
 * @param options.projectId - The project ID
 * @param options.enabled - Whether the hook is enabled (default: true)
 */
export function useDeploy({ projectId, enabled = true }: UseDeployOptions): UseDeployResult {
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle')
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null)

  // Check if there's a prior successful deploy
  const { deployments, isLoading: isLoadingHistory } = useLatestDeployments({
    projectId,
    enabled,
    limit: 1 // Only need to check if at least one exists
  })

  // First deploy = no deployments OR no successful deployments
  const isFirstDeploy = !deployments || deployments.length === 0 ||
    !deployments.some(d => d.status === 'deployed')

  const isDeploying = deployPhase === 'uploading' || deployPhase === 'deploying' || deployPhase === 'routing'

  const resetDeployState = useCallback(() => {
    setDeployPhase('idle')
    setDeployError(null)
    setDeployedUrl(null)
  }, [])

  /**
   * Quick deploy for subsequent deployments (no dialog)
   * Returns success/failure with URL or error message
   */
  const quickDeploy = useCallback(async (buildId: string): Promise<{ success: boolean; url?: string; error?: string }> => {
    if (!buildId) {
      return { success: false, error: 'No build ID provided' }
    }

    setDeployPhase('uploading')
    setDeployError(null)
    setDeployedUrl(null)

    try {
      // Fetch build artifacts
      const artifactsRes = await fetch(`/api/builds/${buildId}/artifacts`, {
        method: 'GET'
      })

      if (!artifactsRes.ok) {
        setDeployPhase('error')
        const errMsg = 'Build artifacts are not ready yet. Please try again in a moment.'
        setDeployError(errMsg)
        return { success: false, error: errMsg }
      }

      const artifacts = await safeJson<BuildArtifactsResponse>(artifactsRes)

      if (!artifacts?.staticAssets || !artifacts?.serverBundle) {
        setDeployPhase('error')
        const errMsg = 'Build artifacts are incomplete or not ready yet.'
        setDeployError(errMsg)
        return { success: false, error: errMsg }
      }

      setDeployPhase('deploying')

      // Deploy with real artifacts
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

      const data = await response.json() as ApiResponse<DeployResponse>

      if (!response.ok || !data.ok) {
        setDeployPhase('error')
        const errMsg = data.ok === false ? data.error.message : 'Deployment failed'
        setDeployError(errMsg)
        return { success: false, error: errMsg }
      }

      setDeployPhase('routing')
      await new Promise(resolve => setTimeout(resolve, 300))

      setDeployPhase('complete')
      setDeployedUrl(data.data.url)

      // Auto-reset after 3 seconds
      setTimeout(() => {
        resetDeployState()
      }, 3000)

      return { success: true, url: data.data.url }

    } catch (err) {
      setDeployPhase('error')
      const errMsg = err instanceof Error ? err.message : 'Deployment failed'
      setDeployError(errMsg)
      return { success: false, error: errMsg }
    }
  }, [projectId, resetDeployState])

  return {
    isFirstDeploy,
    isLoadingHistory,
    deployPhase,
    deployError,
    deployedUrl,
    isDeploying,
    quickDeploy,
    resetDeployState
  }
}
