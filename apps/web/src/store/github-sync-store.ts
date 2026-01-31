/**
 * GitHub Sync Store
 * Manages GitHub 2-way sync state and operations
 * Uses Zustand for client-side state management
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  GitHubInstallation,
  GitHubRepository,
  ProjectGitHubConfig,
  GitHubSyncOperation,
  GitHubSyncError,
  GitHubSyncState,
  GitHubSyncAction
} from '@/types/github-sync'
import { logger } from '@/utils/logger'

interface GitHubSyncStoreState {
  // State properties (from GitHubSyncState)
  isConnected: boolean
  installations: GitHubInstallation[]
  selectedInstallation: GitHubInstallation | null
  repositories: GitHubRepository[]
  repositoriesLoading: boolean
  repositorySearchQuery: string
  repositoryPagination: { has_next: boolean; cursor?: string; loading: boolean }
  projectConfig: ProjectGitHubConfig | null
  operations: GitHubSyncOperation[]
  currentOperation: GitHubSyncOperation | null
  syncStatus: 'idle' | 'syncing' | 'conflict' | 'error'
  lastSyncAt: string | null
  error: GitHubSyncError | null
  showSyncDialog: boolean
  showRepositorySelector: boolean
  
  // Actions
  setInstallations: (installations: GitHubInstallation[]) => void
  selectInstallation: (installation: GitHubInstallation | null) => void
  setRepositories: (repositories: GitHubRepository[]) => void
  addRepositories: (repositories: GitHubRepository[]) => void
  setRepositoriesLoading: (loading: boolean) => void
  setRepositorySearch: (query: string) => void
  setRepositoryPagination: (pagination: { has_next: boolean; cursor?: string; loading: boolean }) => void
  setProjectConfig: (config: ProjectGitHubConfig | null) => void
  addOperation: (operation: GitHubSyncOperation) => void
  updateOperation: (id: string, update: Partial<GitHubSyncOperation>) => void
  setCurrentOperation: (operation: GitHubSyncOperation | null) => void
  setSyncStatus: (status: 'idle' | 'syncing' | 'conflict' | 'error') => void
  setLastSyncAt: (timestamp: string | null) => void
  setError: (error: GitHubSyncError | null) => void
  setShowSyncDialog: (show: boolean) => void
  setShowRepositorySelector: (show: boolean) => void
  resetState: () => void
  
  // Computed getters
  getSelectedRepository: () => GitHubRepository | null
  isConfigured: () => boolean
  hasActiveOperation: () => boolean
  getOperationsByProject: (projectId: string) => GitHubSyncOperation[]
}

const initialState = {
  // Connection status
  isConnected: false,
  installations: [],
  selectedInstallation: null,
  
  // Repository management
  repositories: [],
  repositoriesLoading: false,
  repositorySearchQuery: '',
  repositoryPagination: {
    has_next: false,
    cursor: undefined,
    loading: false
  },
  
  // Current project sync config
  projectConfig: null,
  
  // Operations tracking
  operations: [],
  currentOperation: null,
  
  // Real-time sync status
  syncStatus: 'idle' as const,
  lastSyncAt: null,
  
  // Errors
  error: null,
  
  // UI state
  showSyncDialog: false,
  showRepositorySelector: false
}

/**
 * GitHub Sync Store with Zustand
 * Provides centralized state management for GitHub sync operations
 */
export const useGitHubSyncStore = create<GitHubSyncStoreState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Installation management
    setInstallations: (installations: GitHubInstallation[]) => 
      set((state) => ({
        ...state,
        installations,
        isConnected: installations.length > 0,
        error: null
      })),

    selectInstallation: (installation: GitHubInstallation | null) => 
      set((state) => ({
        ...state,
        selectedInstallation: installation,
        repositories: [], // Clear repositories when changing installation
        repositorySearchQuery: '',
        repositoryPagination: initialState.repositoryPagination,
        error: null
      })),

    // Repository management
    setRepositories: (repositories: GitHubRepository[]) =>
      set((state) => ({
        ...state,
        repositories,
        repositoriesLoading: false,
        error: null
      })),

    addRepositories: (repositories: GitHubRepository[]) =>
      set((state) => ({
        ...state,
        repositories: [...state.repositories, ...repositories],
        repositoriesLoading: false,
        error: null
      })),

    setRepositoriesLoading: (loading: boolean) =>
      set((state) => ({
        ...state,
        repositoriesLoading: loading
      })),

    setRepositorySearch: (query: string) =>
      set((state) => ({
        ...state,
        repositorySearchQuery: query,
        repositories: [], // Clear when starting new search
        repositoryPagination: { ...initialState.repositoryPagination }
      })),

    setRepositoryPagination: (pagination: { has_next: boolean; cursor?: string; loading: boolean }) =>
      set((state) => ({
        ...state,
        repositoryPagination: pagination
      })),

    // Project configuration
    setProjectConfig: (config: ProjectGitHubConfig | null) =>
      set((state) => ({
        ...state,
        projectConfig: config,
        syncStatus: config ? 'idle' : 'idle',
        error: null
      })),

    // Operations management
    addOperation: (operation: GitHubSyncOperation) =>
      set((state) => {
        const updatedOperations = [operation, ...state.operations.slice(0, 9)] // Keep last 10
        return {
          ...state,
          operations: updatedOperations,
          currentOperation: operation,
          syncStatus: operation.status === 'in_progress' ? 'syncing' : state.syncStatus
        }
      }),

    updateOperation: (id: string, update: Partial<GitHubSyncOperation>) =>
      set((state) => {
        const updatedOperations = state.operations.map(op =>
          op.id === id ? { ...op, ...update } : op
        )
        
        const updatedCurrentOp = state.currentOperation?.id === id 
          ? { ...state.currentOperation, ...update }
          : state.currentOperation

        // Update sync status based on current operation
        let newSyncStatus = state.syncStatus
        if (updatedCurrentOp) {
          switch (updatedCurrentOp.status) {
            case 'in_progress':
              newSyncStatus = 'syncing'
              break
            case 'failed':
              newSyncStatus = 'error'
              break
            case 'completed':
            case 'cancelled':
              newSyncStatus = 'idle'
              break
          }
        }

        return {
          ...state,
          operations: updatedOperations,
          currentOperation: updatedCurrentOp,
          syncStatus: newSyncStatus,
          lastSyncAt: update.completed_at || state.lastSyncAt
        }
      }),

    setCurrentOperation: (operation: GitHubSyncOperation | null) =>
      set((state) => ({
        ...state,
        currentOperation: operation,
        syncStatus: operation?.status === 'in_progress' ? 'syncing' : state.syncStatus
      })),

    // Status management
    setSyncStatus: (status: 'idle' | 'syncing' | 'conflict' | 'error') =>
      set((state) => ({
        ...state,
        syncStatus: status
      })),

    setLastSyncAt: (timestamp: string | null) =>
      set((state) => ({
        ...state,
        lastSyncAt: timestamp
      })),

    setError: (error: GitHubSyncError | null) =>
      set((state) => ({
        ...state,
        error,
        syncStatus: error ? 'error' : state.syncStatus
      })),

    // UI state management
    setShowSyncDialog: (show: boolean) =>
      set((state) => ({
        ...state,
        showSyncDialog: show
      })),

    setShowRepositorySelector: (show: boolean) =>
      set((state) => ({
        ...state,
        showRepositorySelector: show
      })),

    resetState: () => set(initialState),

    // Computed getters
    getSelectedRepository: (): GitHubRepository | null => {
      const state = get()
      if (!state.projectConfig) return null
      
      return state.repositories.find(
        repo => repo.id === state.projectConfig!.repository_id
      ) || null
    },

    isConfigured: (): boolean => {
      const state = get()
      return !!(state.projectConfig?.installation_id && state.projectConfig?.repository_id)
    },

    hasActiveOperation: (): boolean => {
      const state = get()
      return !!(state.currentOperation?.status === 'in_progress' || 
               state.currentOperation?.status === 'pending')
    },

    getOperationsByProject: (projectId: string): GitHubSyncOperation[] => {
      const state = get()
      return state.operations.filter(op => op.project_id === projectId)
    }
  }))
)

// Store subscriptions for logging and side effects
useGitHubSyncStore.subscribe(
  (state) => state.error,
  (error, previousError) => {
    if (error && error !== previousError) {
      logger.error('GitHub Sync Error', {
        code: error.code,
        message: error.message,
        details: error.details
      })
    }
  }
)

useGitHubSyncStore.subscribe(
  (state) => state.currentOperation,
  (operation, previousOperation) => {
    if (operation && operation !== previousOperation) {
      logger.info('GitHub Sync Operation Update', {
        id: operation.id,
        type: operation.operation_type,
        status: operation.status,
        projectId: operation.project_id
      })
    }
  }
)

// Helper hooks for common operations
export const useGitHubInstallations = () => {
  const { installations, isConnected, setInstallations } = useGitHubSyncStore()
  return { installations, isConnected, setInstallations }
}

export const useGitHubRepositories = () => {
  const {
    repositories,
    repositoriesLoading,
    repositorySearchQuery,
    repositoryPagination,
    setRepositories,
    addRepositories,
    setRepositoriesLoading,
    setRepositorySearch,
    setRepositoryPagination
  } = useGitHubSyncStore()
  
  return {
    repositories,
    repositoriesLoading,
    repositorySearchQuery,
    repositoryPagination,
    setRepositories,
    addRepositories,
    setRepositoriesLoading,
    setRepositorySearch,
    setRepositoryPagination
  }
}

export const useGitHubProjectConfig = () => {
  const {
    projectConfig,
    setProjectConfig,
    isConfigured,
    getSelectedRepository
  } = useGitHubSyncStore()
  
  return {
    projectConfig,
    setProjectConfig,
    isConfigured: isConfigured(),
    selectedRepository: getSelectedRepository()
  }
}

export const useGitHubSyncOperations = () => {
  const {
    operations,
    currentOperation,
    syncStatus,
    lastSyncAt,
    addOperation,
    updateOperation,
    setCurrentOperation,
    setSyncStatus,
    hasActiveOperation,
    getOperationsByProject
  } = useGitHubSyncStore()
  
  return {
    operations,
    currentOperation,
    syncStatus,
    lastSyncAt,
    addOperation,
    updateOperation,
    setCurrentOperation,
    setSyncStatus,
    hasActiveOperation: hasActiveOperation(),
    getOperationsByProject
  }
}

export const useGitHubSyncUI = () => {
  const {
    showSyncDialog,
    showRepositorySelector,
    setShowSyncDialog,
    setShowRepositorySelector,
    error,
    setError
  } = useGitHubSyncStore()
  
  return {
    showSyncDialog,
    showRepositorySelector,
    setShowSyncDialog,
    setShowRepositorySelector,
    error,
    setError
  }
}