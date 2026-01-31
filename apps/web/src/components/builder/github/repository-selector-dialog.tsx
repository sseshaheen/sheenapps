/**
 * Repository Selector Dialog
 * Allows users to connect their project to a GitHub repository
 * Features: Installation selection, repository search, pagination, branch selection
 */

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'
import { 
  useGitHubSyncStore,
  useGitHubInstallations,
  useGitHubRepositories,
  useGitHubSyncUI
} from '@/store/github-sync-store'
import {
  getGitHubInstallationsAction,
  getGitHubRepositoriesAction,
  getGitHubBranchesAction,
  updateProjectGitHubConfigAction
} from '@/lib/actions/github-actions'
import { 
  GitHubInstallation, 
  GitHubRepository, 
  GitHubBranch,
  GitHubSyncMode 
} from '@/types/github-sync'
import { logger } from '@/utils/logger'
import { cn } from '@/lib/utils'
import { debounce, withGitHubPerformanceMonitoring } from '@/utils/github-performance'

interface RepositorySelectorDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'installations' | 'repositories' | 'configuration'

export function RepositorySelectorDialog({
  projectId,
  open,
  onOpenChange
}: RepositorySelectorDialogProps) {
  const [currentStep, setCurrentStep] = useState<Step>('installations')
  const [selectedInstallation, setSelectedInstallation] = useState<GitHubInstallation | null>(null)
  const [selectedRepository, setSelectedRepository] = useState<GitHubRepository | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [selectedSyncMode, setSelectedSyncMode] = useState<GitHubSyncMode>('protected_pr')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)

  const { installations, isConnected } = useGitHubInstallations()
  const { 
    repositories, 
    repositoriesLoading, 
    repositoryPagination,
    setRepositories,
    addRepositories,
    setRepositoriesLoading,
    setRepositoryPagination 
  } = useGitHubRepositories()
  const { error, setError } = useGitHubSyncUI()

  // Debounced search for better performance
  const debouncedSetSearchQuery = useCallback(
    debounce((query: string) => {
      setDebouncedSearchQuery(query)
    }, 300),
    []
  )

  // Load installations when dialog opens
  useEffect(() => {
    if (open && !isConnected) {
      loadInstallations()
    }
  }, [open, isConnected])

  // Update debounced search query
  useEffect(() => {
    debouncedSetSearchQuery(searchQuery)
  }, [searchQuery, debouncedSetSearchQuery])

  // Load repositories when installation is selected
  useEffect(() => {
    if (selectedInstallation && currentStep === 'repositories') {
      loadRepositories(true) // Reset search
    }
  }, [selectedInstallation, currentStep])

  // Load branches when repository is selected
  useEffect(() => {
    if (selectedRepository && currentStep === 'configuration') {
      loadBranches()
    }
  }, [selectedRepository, currentStep])

  const loadInstallations = async () => {
    try {
      setIsLoading(true)
      const result = await getGitHubInstallationsAction()
      
      if (result.success && result.data) {
        useGitHubSyncStore.getState().setInstallations(result.data.installations)
        
        // Auto-select if only one installation
        if (result.data.installations.length === 1) {
          setSelectedInstallation(result.data.installations[0])
          setCurrentStep('repositories')
        }
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

  const loadRepositories = async (resetSearch = false) => {
    if (!selectedInstallation) return

    try {
      setRepositoriesLoading(true)
      
      if (resetSearch) {
        setRepositories([])
        setRepositoryPagination({ has_next: false, loading: false })
        setSearchQuery('')
      }

      const result = await getGitHubRepositoriesAction(selectedInstallation.id, {
        search: resetSearch ? '' : searchQuery,
        limit: 20
      })
      
      if (result.success && result.data) {
        if (resetSearch) {
          setRepositories(result.data.repositories)
        } else {
          addRepositories(result.data.repositories)
        }
        
        setRepositoryPagination({
          has_next: result.data.has_next,
          cursor: result.data.next_cursor,
          loading: false
        })
      } else if (result.error) {
        setError({ code: 'REPOSITORIES_LOAD_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Failed to load GitHub repositories', error)
      setError({ 
        code: 'REPOSITORIES_LOAD_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setRepositoriesLoading(false)
    }
  }

  const loadBranches = async () => {
    if (!selectedInstallation || !selectedRepository) return

    try {
      setBranchesLoading(true)
      const result = await getGitHubBranchesAction(selectedInstallation.id, selectedRepository.id)
      
      if (result.success && result.data) {
        setBranches(result.data.branches)
        // Auto-select default branch
        setSelectedBranch(result.data.default_branch)
      } else if (result.error) {
        setError({ code: 'BRANCHES_LOAD_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Failed to load GitHub branches', error)
      setError({ 
        code: 'BRANCHES_LOAD_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setBranchesLoading(false)
    }
  }

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query)
      
      if (!selectedInstallation) return
      
      try {
        setRepositoriesLoading(true)
        const result = await getGitHubRepositoriesAction(selectedInstallation.id, {
          search: query,
          limit: 20
        })
        
        if (result.success && result.data) {
          setRepositories(result.data.repositories)
          setRepositoryPagination({
            has_next: result.data.has_next,
            cursor: result.data.next_cursor,
            loading: false
          })
        }
      } catch (error) {
        logger.error('Repository search failed', error)
      } finally {
        setRepositoriesLoading(false)
      }
    },
    [selectedInstallation, setRepositories, setRepositoriesLoading, setRepositoryPagination]
  )

  const handleConnect = async () => {
    if (!selectedInstallation || !selectedRepository || !selectedBranch) return

    try {
      setIsLoading(true)
      
      const config = {
        installation_id: selectedInstallation.id,
        repository_id: selectedRepository.id,
        repository_full_name: selectedRepository.full_name,
        sync_mode: selectedSyncMode,
        branch: selectedBranch,
        auto_sync: true
      }

      const result = await updateProjectGitHubConfigAction(projectId, config)
      
      if (result.success && result.data) {
        useGitHubSyncStore.getState().setProjectConfig(result.data)
        onOpenChange(false)
        
        // Reset dialog state
        setCurrentStep('installations')
        setSelectedInstallation(null)
        setSelectedRepository(null)
        setSelectedBranch('')
        setSearchQuery('')
      } else if (result.error) {
        setError({ code: 'CONNECTION_FAILED', message: result.error })
      }
    } catch (error) {
      logger.error('Repository connection failed', error)
      setError({ 
        code: 'CONNECTION_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const filteredRepositories = useMemo(() => {
    if (!debouncedSearchQuery) return repositories
    const query = debouncedSearchQuery.toLowerCase()
    return repositories.filter(repo => 
      repo.name.toLowerCase().includes(query) ||
      repo.full_name.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query)
    )
  }, [repositories, debouncedSearchQuery])

  const renderInstallationStep = () => (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <DialogTitle className="text-lg sm:text-xl text-white">Select GitHub Account</DialogTitle>
        <DialogDescription className="text-sm sm:text-base">
          Choose the GitHub account or organization to connect your project to.
        </DialogDescription>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
            <span>Loading installations...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {installations.map((installation) => (
            <button
              key={installation.id}
              onClick={() => {
                setSelectedInstallation(installation)
                setCurrentStep('repositories')
              }}
              className="w-full p-3 sm:p-4 text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors min-h-[60px] sm:min-h-[auto] touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <img
                  src={installation.avatar_url}
                  alt={installation.login}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm sm:text-base truncate">{installation.login}</span>
                    <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full flex-shrink-0">
                      {installation.type}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">
                    {installation.repository_selection === 'all' 
                      ? 'All repositories' 
                      : 'Selected repositories'
                    }
                  </p>
                </div>
                <Icon name="chevron-right" className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const renderRepositoryStep = () => (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
        <div className="flex-1">
          <DialogTitle className="text-lg sm:text-xl text-white">Select Repository</DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Choose a repository from {selectedInstallation?.login}.
          </DialogDescription>
        </div>
        <button
          onClick={() => setCurrentStep('installations')}
          className="text-purple-400 hover:text-purple-300 text-xs sm:text-sm px-2 py-1 sm:px-0 sm:py-0 rounded touch-manipulation"
        >
          ← Change Account
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Repository List */}
      {repositoriesLoading && repositories.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
            <span>Loading repositories...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredRepositories.map((repository) => (
            <button
              key={repository.id}
              onClick={() => {
                setSelectedRepository(repository)
                setCurrentStep('configuration')
              }}
              className="w-full p-3 sm:p-4 text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors min-h-[60px] sm:min-h-[auto] touch-manipulation"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    repository.private ? "bg-yellow-500" : "bg-green-500"
                  )}></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">{repository.name}</span>
                    {repository.fork && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-600 text-gray-300 rounded">
                        Fork
                      </span>
                    )}
                  </div>
                  {repository.description && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                      {repository.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    {repository.language && (
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        {repository.language}
                      </span>
                    )}
                    <span>{repository.stargazers_count} stars</span>
                    <span>Updated {new Date(repository.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <Icon name="chevron-right" className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {repositoryPagination.has_next && (
        <button
          onClick={() => loadRepositories(false)}
          disabled={repositoriesLoading}
          className="w-full py-2 text-sm text-purple-400 hover:text-purple-300 disabled:opacity-50"
        >
          {repositoriesLoading ? 'Loading...' : 'Load more repositories'}
        </button>
      )}
    </div>
  )

  const renderConfigurationStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <DialogTitle className="text-white">Configure Sync</DialogTitle>
          <DialogDescription>
            Set up sync settings for {selectedRepository?.name}.
          </DialogDescription>
        </div>
        <button
          onClick={() => setCurrentStep('repositories')}
          className="text-purple-400 hover:text-purple-300 text-sm"
        >
          ← Change Repository
        </button>
      </div>

      {/* Repository Info */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <img
            src={selectedInstallation?.avatar_url}
            alt={selectedInstallation?.login}
            className="w-6 h-6 rounded-full"
          />
          <span className="font-medium text-white">
            {selectedRepository?.full_name}
          </span>
          <span className={cn(
            "text-xs px-2 py-1 rounded-full",
            selectedRepository?.private 
              ? "bg-yellow-500/20 text-yellow-400" 
              : "bg-green-500/20 text-green-400"
          )}>
            {selectedRepository?.private ? 'Private' : 'Public'}
          </span>
        </div>
      </div>

      {/* Branch Selection */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Branch
        </label>
        {branchesLoading ? (
          <div className="flex items-center gap-2 text-gray-400 py-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
            <span>Loading branches...</span>
          </div>
        ) : (
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {branches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name} {branch.protected && '🔒'}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Sync Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Sync Mode
        </label>
        <div className="space-y-3">
          {[
            {
              value: 'protected_pr' as GitHubSyncMode,
              title: 'Protected PR (Recommended)',
              description: 'Creates pull requests for review before merging changes'
            },
            {
              value: 'hybrid' as GitHubSyncMode,
              title: 'Hybrid',
              description: 'Direct commits to development branch, PRs to main branch'
            },
            {
              value: 'direct_commit' as GitHubSyncMode,
              title: 'Direct Commit',
              description: 'Commits directly to the selected branch (use with caution)'
            }
          ].map((mode) => (
            <label
              key={mode.value}
              className={cn(
                "block p-3 border rounded-lg cursor-pointer transition-colors",
                selectedSyncMode === mode.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="syncMode"
                  value={mode.value}
                  checked={selectedSyncMode === mode.value}
                  onChange={(e) => setSelectedSyncMode(e.target.value as GitHubSyncMode)}
                  className="mt-1 text-purple-500 focus:ring-purple-500"
                />
                <div>
                  <div className="font-medium text-white">{mode.title}</div>
                  <div className="text-sm text-gray-400 mt-1">{mode.description}</div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Connect Button */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={() => onOpenChange(false)}
          className="flex-1 px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConnect}
          disabled={isLoading || !selectedBranch}
          className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Connecting...
            </>
          ) : (
            'Connect Repository'
          )}
        </button>
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col mx-2 sm:mx-0">
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
          {currentStep === 'installations' && renderInstallationStep()}
          {currentStep === 'repositories' && renderRepositoryStep()}
          {currentStep === 'configuration' && renderConfigurationStep()}
        </div>
      </DialogContent>
    </Dialog>
  )
}