/**
 * Advanced Sync Dialog
 * Provides detailed GitHub sync operations with conflict resolution
 * Features: Push/Pull/Bidirectional sync, conflict resolution, operation monitoring
 */

'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { 
  useGitHubProjectConfig,
  useGitHubSyncOperations,
  useGitHubSyncUI
} from '@/store/github-sync-store'
import {
  pushProjectToGitHubAction,
  pullProjectFromGitHubAction,
  syncProjectWithGitHubAction,
  getGitHubSyncOperationAction,
  cancelGitHubSyncOperationAction,
  createGitHubBranchAction
} from '@/lib/actions/github-actions'
import { GitHubSyncOperation, GitHubSyncMode } from '@/types/github-sync'
import { logger } from '@/utils/logger'
import { cn } from '@/lib/utils'

interface AdvancedSyncDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SyncDirection = 'push' | 'pull' | 'bidirectional'
type ConflictResolution = 'ours' | 'theirs' | 'manual'

export function AdvancedSyncDialog({
  projectId,
  open,
  onOpenChange
}: AdvancedSyncDialogProps) {
  const [selectedDirection, setSelectedDirection] = useState<SyncDirection>('push')
  const [commitMessage, setCommitMessage] = useState('')
  const [createPR, setCreatePR] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution>('ours')
  const [isLoading, setIsLoading] = useState(false)
  const [activeOperation, setActiveOperation] = useState<GitHubSyncOperation | null>(null)
  const [showConflictResolution, setShowConflictResolution] = useState(false)

  const { projectConfig, isConfigured } = useGitHubProjectConfig()
  const { currentOperation, hasActiveOperation } = useGitHubSyncOperations()
  const { error, setError } = useGitHubSyncUI()

  // Auto-generate commit message based on timestamp
  useEffect(() => {
    if (open && !commitMessage) {
      const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
      setCommitMessage(`Update from SheenApps - ${timestamp}`)
    }
  }, [open, commitMessage])

  // Auto-generate PR title when createPR is enabled
  useEffect(() => {
    if (createPR && !prTitle && commitMessage) {
      setPrTitle(commitMessage)
      setPrBody(`## Summary\n\nUpdated project files from SheenApps builder interface.\n\n## Changes\n\n- Updated project configuration\n- Refined component structure\n- Applied latest design changes\n\n🤖 Generated via SheenApps GitHub Sync`)
    }
  }, [createPR, prTitle, commitMessage])

  const handleSync = async () => {
    if (!projectConfig) return

    try {
      setIsLoading(true)
      let result

      if (selectedDirection === 'push') {
        result = await pushProjectToGitHubAction(projectId, {
          commitMessage,
          ...(createPR ? {
            createPR: true,
            prTitle: prTitle || commitMessage,
            prBody: prBody || `Updated from SheenApps - ${new Date().toISOString()}`
          } : {})
        })
      } else if (selectedDirection === 'pull') {
        result = await pullProjectFromGitHubAction(projectId)
      } else {
        result = await syncProjectWithGitHubAction(projectId, {
          direction: 'bidirectional',
          resolveConflicts: conflictResolution
        })
      }
      
      if (result.success && result.data) {
        setActiveOperation(result.data)
        
        // Start monitoring the operation
        monitorOperation(result.data.id)
      } else if (result.error) {
        setError({ code: 'SYNC_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Advanced sync failed', error)
      setError({ 
        code: 'SYNC_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const monitorOperation = async (operationId: string) => {
    const checkOperation = async () => {
      try {
        const result = await getGitHubSyncOperationAction(operationId)
        
        if (result.success && result.data) {
          setActiveOperation(result.data)
          
          if (result.data.status === 'completed') {
            // Operation completed successfully
            setTimeout(() => {
              setActiveOperation(null)
              onOpenChange(false)
            }, 2000)
          } else if (result.data.status === 'failed') {
            // Operation failed
            setError({ 
              code: 'SYNC_FAILED', 
              message: result.data.error_message || 'Sync operation failed' 
            })
            setActiveOperation(null)
          } else if (result.data.status === 'in_progress') {
            // Check for conflicts
            if (result.data.metadata?.conflict_detected) {
              setShowConflictResolution(true)
            }
            
            // Continue monitoring
            setTimeout(checkOperation, 2000)
          }
        }
      } catch (error) {
        logger.error('Failed to monitor sync operation', error)
      }
    }

    // Start monitoring after a short delay
    setTimeout(checkOperation, 1000)
  }

  const handleCancelOperation = async () => {
    if (!activeOperation) return

    try {
      await cancelGitHubSyncOperationAction(activeOperation.id)
      setActiveOperation(null)
    } catch (error) {
      logger.error('Failed to cancel sync operation', error)
      setError({ 
        code: 'CANCEL_FAILED', 
        message: error instanceof Error ? error.message : 'Failed to cancel operation' 
      })
    }
  }

  const renderSyncDirectionOptions = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-white mb-3">
          Sync Direction
        </label>
        <div className="space-y-3">
          {[
            {
              value: 'push' as SyncDirection,
              icon: '↑',
              title: 'Push to GitHub',
              description: 'Send your latest changes to GitHub repository'
            },
            {
              value: 'pull' as SyncDirection,
              icon: '↓',
              title: 'Pull from GitHub',
              description: 'Get the latest changes from GitHub repository'
            },
            {
              value: 'bidirectional' as SyncDirection,
              icon: '↕️',
              title: 'Bidirectional Sync',
              description: 'Merge changes from both directions intelligently'
            }
          ].map((direction) => (
            <label
              key={direction.value}
              className={cn(
                "block p-4 border rounded-lg cursor-pointer transition-colors",
                selectedDirection === direction.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="syncDirection"
                  value={direction.value}
                  checked={selectedDirection === direction.value}
                  onChange={(e) => setSelectedDirection(e.target.value as SyncDirection)}
                  className="mt-1 text-purple-500 focus:ring-purple-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{direction.icon}</span>
                    <span className="font-medium text-white">{direction.title}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{direction.description}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Push Options */}
      {selectedDirection === 'push' && (
        <div className="space-y-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Commit Message
            </label>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe your changes..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>

          {projectConfig?.sync_mode === 'protected_pr' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createPR}
                  onChange={(e) => setCreatePR(e.target.checked)}
                  className="text-purple-500 focus:ring-purple-500 rounded"
                />
                <span className="text-sm text-white">Create Pull Request</span>
              </label>

              {createPR && (
                <div className="space-y-3 pl-6 border-l-2 border-purple-500/30">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      PR Title
                    </label>
                    <input
                      type="text"
                      value={prTitle}
                      onChange={(e) => setPrTitle(e.target.value)}
                      placeholder="Pull request title..."
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      PR Description
                    </label>
                    <textarea
                      value={prBody}
                      onChange={(e) => setPrBody(e.target.value)}
                      placeholder="Describe the changes in this pull request..."
                      rows={4}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bidirectional Sync Options */}
      {selectedDirection === 'bidirectional' && (
        <div className="space-y-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Conflict Resolution Strategy
            </label>
            <div className="space-y-2">
              {[
                {
                  value: 'ours' as ConflictResolution,
                  title: 'Prefer Our Changes',
                  description: 'Keep SheenApps changes when conflicts occur'
                },
                {
                  value: 'theirs' as ConflictResolution,
                  title: 'Prefer Their Changes',
                  description: 'Keep GitHub changes when conflicts occur'
                },
                {
                  value: 'manual' as ConflictResolution,
                  title: 'Manual Resolution',
                  description: 'Pause sync and ask for manual conflict resolution'
                }
              ].map((strategy) => (
                <label
                  key={strategy.value}
                  className={cn(
                    "block p-3 border rounded-lg cursor-pointer transition-colors",
                    conflictResolution === strategy.value
                      ? "border-purple-500 bg-purple-500/5"
                      : "border-gray-700 hover:border-gray-600"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="conflictResolution"
                      value={strategy.value}
                      checked={conflictResolution === strategy.value}
                      onChange={(e) => setConflictResolution(e.target.value as ConflictResolution)}
                      className="mt-0.5 text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-white text-sm">{strategy.title}</div>
                      <div className="text-xs text-gray-400 mt-1">{strategy.description}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const renderOperationProgress = () => (
    <div className="space-y-4">
      <div className="text-center">
        <div className="inline-flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <div>
            <p className="font-medium text-white">
              {activeOperation?.operation_type === 'push' ? 'Pushing Changes' :
               activeOperation?.operation_type === 'pull' ? 'Pulling Changes' : 
               'Syncing Changes'}
            </p>
            <p className="text-sm text-gray-400">
              This may take a few moments...
            </p>
          </div>
        </div>
      </div>

      {activeOperation?.metadata && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h4 className="font-medium text-white mb-2">Operation Details</h4>
          <div className="space-y-2 text-sm">
            {activeOperation.metadata.files_changed && (
              <div className="flex justify-between">
                <span className="text-gray-400">Files Changed:</span>
                <span className="text-white">{activeOperation.metadata.files_changed}</span>
              </div>
            )}
            {activeOperation.metadata.additions && (
              <div className="flex justify-between">
                <span className="text-gray-400">Lines Added:</span>
                <span className="text-green-400">+{activeOperation.metadata.additions}</span>
              </div>
            )}
            {activeOperation.metadata.deletions && (
              <div className="flex justify-between">
                <span className="text-gray-400">Lines Removed:</span>
                <span className="text-red-400">-{activeOperation.metadata.deletions}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleCancelOperation}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors"
        >
          Cancel Operation
        </button>
      </div>
    </div>
  )

  const renderConflictResolution = () => (
    <div className="space-y-4">
      <div className="text-center p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <Icon name="alert-triangle" className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
        <h3 className="font-medium text-white">Conflicts Detected</h3>
        <p className="text-sm text-gray-400 mt-1">
          Manual intervention required to resolve conflicts
        </p>
      </div>

      <div className="bg-gray-800/50 rounded-lg p-4">
        <h4 className="font-medium text-white mb-3">Conflict Resolution Options</h4>
        <div className="space-y-3">
          <button
            onClick={async () => {
              // Resolve with our changes
              if (activeOperation) {
                await syncProjectWithGitHubAction(projectId, {
                  direction: 'bidirectional',
                  resolveConflicts: 'ours'
                })
                setShowConflictResolution(false)
              }
            }}
            className="w-full p-3 text-left bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 hover:border-green-600/50 rounded-lg transition-colors"
          >
            <div className="font-medium text-green-400">Keep SheenApps Changes</div>
            <div className="text-sm text-gray-400 mt-1">
              Prioritize changes made in SheenApps builder
            </div>
          </button>

          <button
            onClick={async () => {
              // Resolve with their changes
              if (activeOperation) {
                await syncProjectWithGitHubAction(projectId, {
                  direction: 'bidirectional',
                  resolveConflicts: 'theirs'
                })
                setShowConflictResolution(false)
              }
            }}
            className="w-full p-3 text-left bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 hover:border-blue-600/50 rounded-lg transition-colors"
          >
            <div className="font-medium text-blue-400">Keep GitHub Changes</div>
            <div className="text-sm text-gray-400 mt-1">
              Prioritize changes from GitHub repository
            </div>
          </button>

          <button
            onClick={() => {
              // Open GitHub to manually resolve
              if (projectConfig) {
                window.open(`https://github.com/${projectConfig.repository_full_name}`, '_blank')
              }
            }}
            className="w-full p-3 text-left bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 hover:border-purple-600/50 rounded-lg transition-colors"
          >
            <div className="font-medium text-purple-400">Resolve on GitHub</div>
            <div className="text-sm text-gray-400 mt-1">
              Open GitHub to manually resolve conflicts
            </div>
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleCancelOperation}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors"
        >
          Cancel Sync
        </button>
      </div>
    </div>
  )

  if (!isConfigured || !projectConfig) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-2">
              <Icon name="alert-triangle" className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-red-300 text-sm font-medium">
                  {error.code}
                </p>
                <p className="text-red-400 text-sm mt-1">
                  {error.message}
                </p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300 p-1"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <DialogHeader>
          <DialogTitle className="text-white">Advanced GitHub Sync</DialogTitle>
          <DialogDescription>
            Configure detailed sync options for {projectConfig.repository_full_name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {showConflictResolution ? (
              <m.div
                key="conflict-resolution"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {renderConflictResolution()}
              </m.div>
            ) : activeOperation ? (
              <m.div
                key="operation-progress"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {renderOperationProgress()}
              </m.div>
            ) : (
              <m.div
                key="sync-options"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {renderSyncDirectionOptions()}
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {!activeOperation && !showConflictResolution && (
          <div className="flex gap-3 pt-4 border-t border-gray-700">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSync}
              disabled={isLoading || hasActiveOperation}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Starting Sync...
                </>
              ) : (
                <>
                  <span>
                    {selectedDirection === 'push' ? '↑' :
                     selectedDirection === 'pull' ? '↓' : '↕️'}
                  </span>
                  Start Sync
                </>
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}