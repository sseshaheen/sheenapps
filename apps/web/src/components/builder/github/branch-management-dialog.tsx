/**
 * Branch Management Dialog
 * Provides GitHub branch management functionality
 * Features: View branches, create new branches, switch branches, branch protection status
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
  useGitHubSyncStore,
  useGitHubProjectConfig,
  useGitHubSyncUI
} from '@/store/github-sync-store'
import {
  getGitHubBranchesAction,
  createGitHubBranchAction,
  updateProjectGitHubConfigAction
} from '@/lib/actions/github-actions'
import { GitHubBranch } from '@/types/github-sync'
import { logger } from '@/utils/logger'
import { cn } from '@/lib/utils'

interface BranchManagementDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type View = 'list' | 'create'

export function BranchManagementDialog({
  projectId,
  open,
  onOpenChange
}: BranchManagementDialogProps) {
  const [currentView, setCurrentView] = useState<View>('list')
  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [branchesLoading, setBranchesLoading] = useState(false)
  
  // New branch creation state
  const [newBranchName, setNewBranchName] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [createFromCurrent, setCreateFromCurrent] = useState(true)

  const { projectConfig, isConfigured } = useGitHubProjectConfig()
  const { error, setError } = useGitHubSyncUI()

  // Load branches when dialog opens
  useEffect(() => {
    if (open && isConfigured && projectConfig) {
      loadBranches()
    }
  }, [open, isConfigured, projectConfig])

  const loadBranches = async () => {
    if (!projectConfig) return

    try {
      setBranchesLoading(true)
      const result = await getGitHubBranchesAction(
        projectConfig.installation_id,
        projectConfig.repository_id
      )
      
      if (result.success && result.data) {
        setBranches(result.data.branches)
        
        // Set base branch to current branch if not already set
        if (!baseBranch) {
          setBaseBranch(projectConfig.branch)
        }
      } else if (result.error) {
        setError({ code: 'BRANCHES_LOAD_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Failed to load branches', error)
      setError({ 
        code: 'BRANCHES_LOAD_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setBranchesLoading(false)
    }
  }

  const handleCreateBranch = async () => {
    if (!projectConfig || !newBranchName.trim()) return

    try {
      setIsLoading(true)
      
      const sourceBranch = createFromCurrent ? projectConfig.branch : baseBranch
      const result = await createGitHubBranchAction(
        projectConfig.installation_id,
        projectConfig.repository_id,
        newBranchName.trim(),
        sourceBranch
      )
      
      if (result.success && result.data) {
        // Add new branch to list
        setBranches(prev => [...prev, result.data!])
        
        // Reset form
        setNewBranchName('')
        setCurrentView('list')
        
        // Auto-switch to the new branch
        await handleSwitchBranch(newBranchName.trim())
      } else if (result.error) {
        setError({ code: 'BRANCH_CREATE_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Failed to create branch', error)
      setError({ 
        code: 'BRANCH_CREATE_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSwitchBranch = async (branchName: string) => {
    if (!projectConfig || branchName === projectConfig.branch) return

    try {
      setIsLoading(true)
      
      const result = await updateProjectGitHubConfigAction(projectId, {
        branch: branchName
      })
      
      if (result.success && result.data) {
        // Update project config in store
        useGitHubSyncStore.getState().setProjectConfig(result.data)
        
        // Close dialog
        onOpenChange(false)
      } else if (result.error) {
        setError({ code: 'BRANCH_SWITCH_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Failed to switch branch', error)
      setError({ 
        code: 'BRANCH_SWITCH_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getBranchTypeIcon = (branch: GitHubBranch) => {
    if (branch.name === 'main' || branch.name === 'master') {
      return '🏠' // Main branch
    }
    if (branch.protected) {
      return '🔒' // Protected branch
    }
    if (branch.name.startsWith('feature/')) {
      return '🚀' // Feature branch
    }
    if (branch.name.startsWith('hotfix/')) {
      return '🔥' // Hotfix branch
    }
    if (branch.name.startsWith('release/')) {
      return '🏷️' // Release branch
    }
    return '🌿' // Regular branch
  }

  const validateBranchName = (name: string) => {
    if (!name.trim()) return 'Branch name is required'
    if (name.length < 3) return 'Branch name must be at least 3 characters'
    if (!/^[a-zA-Z0-9._/-]+$/.test(name)) return 'Branch name contains invalid characters'
    if (branches.some(b => b.name === name)) return 'Branch name already exists'
    return null
  }

  const renderBranchList = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <DialogTitle className="text-white">Branch Management</DialogTitle>
          <DialogDescription>
            Manage branches for {projectConfig?.repository_full_name}
          </DialogDescription>
        </div>
        <button
          onClick={() => setCurrentView('create')}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <Icon name="plus" className="h-4 w-4" />
          New Branch
        </button>
      </div>

      {branchesLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
            <span>Loading branches...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {branches.map((branch) => (
            <div
              key={branch.name}
              className={cn(
                "p-4 border rounded-lg transition-colors",
                branch.name === projectConfig?.branch
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getBranchTypeIcon(branch)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{branch.name}</span>
                      {branch.name === projectConfig?.branch && (
                        <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full">
                          Current
                        </span>
                      )}
                      {branch.protected && (
                        <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full">
                          Protected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                      <span>SHA: {branch.commit.sha.slice(0, 7)}</span>
                      {branch.commit.url && (
                        <a
                          href={branch.commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          View Commit
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                
                {branch.name !== projectConfig?.branch && (
                  <button
                    onClick={() => handleSwitchBranch(branch.name)}
                    disabled={isLoading}
                    className="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Switching...' : 'Switch'}
                  </button>
                )}
              </div>

              {branch.protection && (
                <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                  <div className="text-xs text-yellow-400">
                    <Icon name="shield" className="inline h-3 w-3 me-1" />
                    Branch protection rules enabled
                    {branch.protection.required_status_checks && (
                      <div className="mt-1">
                        Required checks: {branch.protection.required_status_checks.contexts.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderCreateBranch = () => {
    const nameValidation = validateBranchName(newBranchName)
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle className="text-white">Create New Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from an existing branch
            </DialogDescription>
          </div>
          <button
            onClick={() => setCurrentView('list')}
            className="text-purple-400 hover:text-purple-300 text-sm"
          >
            ← Back to Branches
          </button>
        </div>

        <div className="space-y-4">
          {/* Branch Name */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Branch Name *
            </label>
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="e.g., feature/new-component"
              className={cn(
                "w-full px-3 py-2 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
                nameValidation ? "border-red-500" : "border-gray-700"
              )}
            />
            {nameValidation && (
              <p className="text-red-400 text-sm mt-1">{nameValidation}</p>
            )}
          </div>

          {/* Base Branch Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Create From
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="createFrom"
                  checked={createFromCurrent}
                  onChange={() => setCreateFromCurrent(true)}
                  className="text-purple-500 focus:ring-purple-500"
                />
                <span className="text-sm text-white">
                  Current branch ({projectConfig?.branch})
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="createFrom"
                  checked={!createFromCurrent}
                  onChange={() => setCreateFromCurrent(false)}
                  className="text-purple-500 focus:ring-purple-500"
                />
                <span className="text-sm text-white">Another branch</span>
              </label>
            </div>

            {!createFromCurrent && (
              <div className="mt-3">
                <select
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name} {branch.name === projectConfig?.branch && '(current)'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Branch Naming Suggestions */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-white mb-2">Branch Naming Suggestions</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setNewBranchName('feature/')}
                className="text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
              >
                <span className="text-green-400">feature/</span>
                <span className="text-gray-400 block">New features</span>
              </button>
              <button
                onClick={() => setNewBranchName('fix/')}
                className="text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
              >
                <span className="text-blue-400">fix/</span>
                <span className="text-gray-400 block">Bug fixes</span>
              </button>
              <button
                onClick={() => setNewBranchName('hotfix/')}
                className="text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
              >
                <span className="text-red-400">hotfix/</span>
                <span className="text-gray-400 block">Urgent fixes</span>
              </button>
              <button
                onClick={() => setNewBranchName('release/')}
                className="text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
              >
                <span className="text-purple-400">release/</span>
                <span className="text-gray-400 block">Release prep</span>
              </button>
            </div>
          </div>
        </div>

        {/* Create Button */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => setCurrentView('list')}
            className="flex-1 px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateBranch}
            disabled={isLoading || !!nameValidation || !newBranchName.trim()}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              <>
                <Icon name="git-branch" className="h-4 w-4" />
                Create Branch
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

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

        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {currentView === 'list' ? (
              <m.div
                key="branch-list"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {renderBranchList()}
              </m.div>
            ) : (
              <m.div
                key="create-branch"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {renderCreateBranch()}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}