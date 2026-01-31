/**
 * GitHub Sync Panel
 * Provides GitHub repository connection and sync controls within workspace sidebar
 *
 * @deprecated DEAD CODE - Only imported by workspace-sidebar.tsx which is not rendered.
 * Kept for potential future use when GitHub sync UI is revived.
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md
 */

'use client'

import React, { useState, useEffect } from 'react'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { useFeatureFlags } from '@/config/feature-flags'
import { useAuthStore } from '@/store'
import {
  useGitHubSyncStore,
  useGitHubInstallations,
  useGitHubRepositories,
  useGitHubProjectConfig,
  useGitHubSyncOperations,
  useGitHubSyncUI
} from '@/store/github-sync-store'
import {
  getGitHubInstallationsAction,
  getGitHubRepositoriesAction,
  getProjectGitHubConfigAction,
  updateProjectGitHubConfigAction,
  pushProjectToGitHubAction,
  pullProjectFromGitHubAction,
  syncProjectWithGitHubAction
} from '@/lib/actions/github-actions'
import { GitHubInstallation, GitHubRepository, GitHubSyncMode } from '@/types/github-sync'
import { logger } from '@/utils/logger'
import { RepositorySelectorDialog } from './repository-selector-dialog'
import { AdvancedSyncDialog } from './advanced-sync-dialog'
import { BranchManagementDialog } from './branch-management-dialog'
import { GitHubErrorDisplay } from './github-error-display'
import { useGitHubSyncStatus } from '@/hooks/use-github-sync-realtime'

interface GitHubSyncPanelProps {
  projectId: string
}

export function GitHubSyncPanel({ projectId }: GitHubSyncPanelProps) {
  const featureFlags = useFeatureFlags()
  const { user } = useAuthStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showBranchDialog, setShowBranchDialog] = useState(false)

  const { installations, isConnected } = useGitHubInstallations()
  const { repositories, repositoriesLoading } = useGitHubRepositories()
  const { projectConfig, isConfigured } = useGitHubProjectConfig()
  const { currentOperation, syncStatus, hasActiveOperation } = useGitHubSyncOperations()
  const { error, setError, showRepositorySelector, setShowRepositorySelector, showSyncDialog, setShowSyncDialog } = useGitHubSyncUI()

  // Real-time sync status updates
  const {
    isConnected: isRealtimeConnected,
    latestOperation,
    recentOperations
  } = useGitHubSyncStatus(projectId, user?.id)

  // Load project GitHub config on mount
  useEffect(() => {
    if (!featureFlags.ENABLE_GITHUB_SYNC_UI) {
      return
    }
    loadProjectConfig()
  }, [featureFlags.ENABLE_GITHUB_SYNC_UI, projectId])

  // Don't render if GitHub sync is not enabled
  if (!featureFlags.ENABLE_GITHUB_SYNC_UI) {
    return null
  }

  const loadProjectConfig = async () => {
    try {
      setIsLoading(true)
      const result = await getProjectGitHubConfigAction(projectId)
      
      if (result.success && result.data) {
        useGitHubSyncStore.getState().setProjectConfig(result.data)
      } else if (result.error) {
        setError({ code: 'CONFIG_LOAD_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Failed to load project GitHub config', error)
      setError({ 
        code: 'CONFIG_LOAD_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadInstallations = async () => {
    try {
      setIsLoading(true)
      const result = await getGitHubInstallationsAction()
      
      if (result.success && result.data) {
        useGitHubSyncStore.getState().setInstallations(result.data.installations)
      } else if (result.error) {
        setError({ code: 'INSTALLATIONS_LOAD_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Failed to load GitHub installations', error)
      setError({ 
        code: 'INSTALLATIONS_LOAD_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickPush = async () => {
    if (!projectConfig) return

    try {
      setIsLoading(true)
      const result = await pushProjectToGitHubAction(projectId, {
        commitMessage: `Update from SheenApps - ${new Date().toISOString()}`
      })
      
      if (result.success && result.data) {
        useGitHubSyncStore.getState().addOperation(result.data)
      } else if (result.error) {
        setError({ code: 'PUSH_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Quick push failed', error)
      setError({ 
        code: 'PUSH_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickPull = async () => {
    if (!projectConfig) return

    try {
      setIsLoading(true)
      const result = await pullProjectFromGitHubAction(projectId)
      
      if (result.success && result.data) {
        useGitHubSyncStore.getState().addOperation(result.data)
      } else if (result.error) {
        setError({ code: 'PULL_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Quick pull failed', error)
      setError({ 
        code: 'PULL_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getSyncStatusDisplay = () => {
    // Use real-time operation data if available
    const activeOp = latestOperation || currentOperation
    
    if (hasActiveOperation || (activeOp?.status === 'in_progress')) {
      const progress = activeOp?.metadata?.progress_percentage
      return {
        icon: '⏳',
        text: activeOp?.operation_type === 'push' ? 'Pushing...' : 
              activeOp?.operation_type === 'pull' ? 'Pulling...' : 'Syncing...',
        color: 'text-blue-400',
        progress,
        subtitle: progress ? `${progress}% complete` : 
                  activeOp?.metadata?.current_file ? `Processing ${activeOp.metadata.current_file}` : 
                  undefined
      }
    }

    if (activeOp?.status === 'failed') {
      return { 
        icon: '❌', 
        text: 'Failed', 
        color: 'text-red-400',
        subtitle: activeOp.error_message ? activeOp.error_message.slice(0, 50) + '...' : undefined
      }
    }

    switch (syncStatus) {
      case 'syncing':
        return { icon: '⏳', text: 'Syncing', color: 'text-blue-400' }
      case 'error':
        return { icon: '⚠️', text: 'Error', color: 'text-red-400' }
      case 'conflict':
        return { icon: '⚠️', text: 'Conflict', color: 'text-yellow-400' }
      default:
        return { 
          icon: '✅', 
          text: isRealtimeConnected ? 'Live' : 'Synced', 
          color: isRealtimeConnected ? 'text-green-400' : 'text-gray-400',
          subtitle: isRealtimeConnected ? 'Real-time updates active' : 'Real-time updates offline'
        }
    }
  }

  const statusDisplay = getSyncStatusDisplay()

  return (
    <div className="border-t border-gray-700 pt-3 md:pt-4">
      <div className="mb-2 md:mb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between text-xs md:text-sm font-medium text-gray-400 hover:text-gray-300 transition-colors"
          disabled={isLoading}
        >
          <div className="flex items-center gap-2">
            <span>🔗</span>
            <span>GitHub Sync</span>
          </div>
          <div className="flex items-center gap-2">
            {isConfigured && (
              <div className="flex items-center gap-1">
                <span className="text-xs">{statusDisplay.icon}</span>
                <div className="flex flex-col items-end">
                  <span className={`text-xs ${statusDisplay.color}`}>
                    {statusDisplay.text}
                  </span>
                  {statusDisplay.subtitle && (
                    <span className="text-xs text-gray-500 text-right">
                      {statusDisplay.subtitle}
                    </span>
                  )}
                </div>
              </div>
            )}
            <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </div>
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 md:space-y-3 pb-3 md:pb-4">
              <GitHubErrorDisplay
                error={error}
                onDismiss={() => setError(null)}
                onRetry={async () => {
                  // Determine what to retry based on current state
                  if (!isConfigured) {
                    await loadInstallations()
                  } else {
                    await loadProjectConfig()
                  }
                }}
                onRefresh={() => window.location.reload()}
                onOpenSettings={() => setShowRepositorySelector(true)}
                onInstallGitHubApp={() => {
                  window.open('https://github.com/apps/sheenapps-sync/installations/new', '_blank')
                }}
                compact
              />

              {!isConfigured ? (
                <div className="space-y-2">
                  <p className="text-xs md:text-sm text-gray-400">
                    Connect your project to a GitHub repository to enable sync
                  </p>
                  <button
                    onClick={() => setShowRepositorySelector(true)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 md:py-3 text-xs md:text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors min-h-[44px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Loading...' : 'Connect Repository'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {projectConfig && (
                    <div className="bg-gray-800/50 rounded-lg p-2 md:p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs md:text-sm text-gray-400">Connected to</span>
                      </div>
                      <p className="text-xs md:text-sm font-medium text-white">
                        {projectConfig.repository_full_name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">Branch:</span>
                        <button
                          onClick={() => setShowBranchDialog(true)}
                          className="text-xs text-purple-400 font-mono hover:text-purple-300 underline underline-offset-2"
                        >
                          {projectConfig.branch}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">Mode:</span>
                        <span className="text-xs text-blue-400">
                          {projectConfig.sync_mode === 'protected_pr' ? 'Protected PR' :
                           projectConfig.sync_mode === 'hybrid' ? 'Hybrid' : 'Direct'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleQuickPush}
                      disabled={isLoading || hasActiveOperation}
                      className="px-2 md:px-3 py-2 text-xs md:text-sm bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 hover:border-green-600/50 rounded-lg transition-colors min-h-[36px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="me-1">↑</span> Push
                    </button>
                    <button
                      onClick={handleQuickPull}
                      disabled={isLoading || hasActiveOperation}
                      className="px-2 md:px-3 py-2 text-xs md:text-sm bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 hover:border-blue-600/50 rounded-lg transition-colors min-h-[36px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="me-1">↓</span> Pull
                    </button>
                  </div>

                  <button
                    onClick={() => setShowSyncDialog(true)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 text-xs md:text-sm text-gray-300 hover:bg-gray-800 border border-gray-600 hover:border-gray-500 rounded-lg transition-colors min-h-[36px] flex items-center justify-center"
                  >
                    Advanced Sync
                  </button>
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Repository Selector Dialog */}
      <RepositorySelectorDialog
        projectId={projectId}
        open={showRepositorySelector}
        onOpenChange={setShowRepositorySelector}
      />

      {/* Advanced Sync Dialog */}
      <AdvancedSyncDialog
        projectId={projectId}
        open={showSyncDialog}
        onOpenChange={setShowSyncDialog}
      />

      {/* Branch Management Dialog */}
      <BranchManagementDialog
        projectId={projectId}
        open={showBranchDialog}
        onOpenChange={setShowBranchDialog}
      />
    </div>
  )
}
