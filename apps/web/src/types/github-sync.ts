/**
 * GitHub 2-way Sync Types
 * Based on backend guide: docs/GITHUB_TWO_WAY_SYNC_FRONTEND_GUIDE.md
 */

// Core GitHub sync types from backend guide
export type GitHubSyncMode = 'protected_pr' | 'hybrid' | 'direct_commit'

export interface GitHubInstallation {
  id: number
  login: string
  type: 'user' | 'organization'
  avatar_url: string
  html_url: string
  created_at: string
  updated_at: string
  suspended_at?: string | null
  app_id: number
  app_slug: string
  target_id: number
  target_type: 'User' | 'Organization'
  permissions: Record<string, string>
  events: string[]
  repository_selection: 'all' | 'selected'
  single_file_name?: string | null
  has_multiple_single_files?: boolean
  single_file_paths?: string[]
  access_tokens_url: string
  repositories_url: string
  html_url_installation: string
}

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  owner: {
    login: string
    id: number
    avatar_url: string
    type: string
  }
  private: boolean
  html_url: string
  description: string | null
  fork: boolean
  created_at: string
  updated_at: string
  pushed_at: string
  clone_url: string
  ssh_url: string
  size: number
  stargazers_count: number
  watchers_count: number
  language: string | null
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  has_pages: boolean
  has_downloads: boolean
  archived: boolean
  disabled: boolean
  visibility: 'public' | 'private' | 'internal'
  default_branch: string
  permissions?: {
    admin: boolean
    maintain: boolean
    push: boolean
    triage: boolean
    pull: boolean
  }
  allow_rebase_merge: boolean
  allow_squash_merge: boolean
  allow_merge_commit: boolean
  allow_auto_merge: boolean
  delete_branch_on_merge: boolean
}

export interface GitHubBranch {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
  protection?: {
    enabled: boolean
    required_status_checks?: {
      enforcement_level: string
      contexts: string[]
    }
  }
}

export interface GitHubCommit {
  sha: string
  html_url: string
  commit: {
    author: {
      name: string
      email: string
      date: string
    }
    committer: {
      name: string
      email: string
      date: string
    }
    message: string
    tree: {
      sha: string
      url: string
    }
    url: string
    comment_count: number
  }
  author: {
    login: string
    id: number
    avatar_url: string
    html_url: string
  } | null
  committer: {
    login: string
    id: number
    avatar_url: string
    html_url: string
  } | null
  parents: Array<{
    sha: string
    url: string
    html_url: string
  }>
  stats?: {
    additions: number
    deletions: number
    total: number
  }
  files?: Array<{
    filename: string
    additions: number
    deletions: number
    changes: number
    status: 'added' | 'removed' | 'modified' | 'renamed'
    raw_url: string
    blob_url: string
    patch?: string
  }>
}

export interface GitHubPullRequest {
  id: number
  number: number
  state: 'open' | 'closed'
  locked: boolean
  title: string
  body: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  merged_at: string | null
  assignee: any | null
  assignees: any[]
  requested_reviewers: any[]
  requested_teams: any[]
  labels: Array<{
    id: number
    name: string
    color: string
    description: string | null
  }>
  milestone: any | null
  draft: boolean
  head: {
    label: string
    ref: string
    sha: string
    user: any
    repo: GitHubRepository
  }
  base: {
    label: string
    ref: string
    sha: string
    user: any
    repo: GitHubRepository
  }
  html_url: string
  diff_url: string
  patch_url: string
  mergeable: boolean | null
  mergeable_state: string
  merged_by: any | null
  comments: number
  review_comments: number
  maintainer_can_modify: boolean
  commits: number
  additions: number
  deletions: number
  changed_files: number
}

// Project-specific GitHub sync configuration
export interface ProjectGitHubConfig {
  installation_id: number
  repository_id: number
  repository_full_name: string
  sync_mode: GitHubSyncMode
  branch: string
  auto_sync: boolean
  sync_path?: string
  last_sync_at?: string
  last_sync_commit_sha?: string
}

// GitHub sync operations
export interface GitHubSyncOperation {
  id: string
  project_id: string
  operation_type: 'push' | 'pull' | 'sync' | 'webhook'
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  started_at: string
  completed_at?: string
  error_message?: string
  metadata?: {
    commit_sha?: string
    pr_number?: number
    files_changed?: number
    additions?: number
    deletions?: number
    progress_percentage?: number
    current_file?: string
    conflict_detected?: boolean
    conflict_files?: string[]
  }
}

// GitHub webhook payload types
export interface GitHubWebhookPayload {
  action: string
  installation?: {
    id: number
  }
  repository?: GitHubRepository
  sender: {
    login: string
    id: number
    avatar_url: string
  }
  // Specific payload data varies by event type
  [key: string]: any
}

// API response types
export interface GitHubInstallationsResponse {
  installations: GitHubInstallation[]
  total_count: number
}

export interface GitHubRepositoriesResponse {
  repositories: GitHubRepository[]
  total_count: number
  has_next: boolean
  next_cursor?: string
}

export interface GitHubBranchesResponse {
  branches: GitHubBranch[]
  default_branch: string
}

// Error types specific to GitHub sync
export interface GitHubSyncError {
  code: string
  message: string
  details?: {
    installation_id?: number
    repository_id?: number
    commit_sha?: string
    pr_number?: number
    rate_limit_remaining?: number
    rate_limit_reset_at?: string
  }
}

// UI state types for GitHub sync store
export interface GitHubSyncState {
  // Connection status
  isConnected: boolean
  installations: GitHubInstallation[]
  selectedInstallation: GitHubInstallation | null
  
  // Repository management
  repositories: GitHubRepository[]
  repositoriesLoading: boolean
  repositorySearchQuery: string
  repositoryPagination: {
    has_next: boolean
    cursor?: string
    loading: boolean
  }
  
  // Current project sync config
  projectConfig: ProjectGitHubConfig | null
  
  // Operations tracking
  operations: GitHubSyncOperation[]
  currentOperation: GitHubSyncOperation | null
  
  // Real-time sync status
  syncStatus: 'idle' | 'syncing' | 'conflict' | 'error'
  lastSyncAt: string | null
  
  // Errors
  error: GitHubSyncError | null
  
  // UI state
  showSyncDialog: boolean
  showRepositorySelector: boolean
}

// Action types for GitHub sync store
export type GitHubSyncAction = 
  | { type: 'SET_INSTALLATIONS'; payload: GitHubInstallation[] }
  | { type: 'SELECT_INSTALLATION'; payload: GitHubInstallation | null }
  | { type: 'SET_REPOSITORIES'; payload: GitHubRepository[] }
  | { type: 'ADD_REPOSITORIES'; payload: GitHubRepository[] }
  | { type: 'SET_REPOSITORIES_LOADING'; payload: boolean }
  | { type: 'SET_REPOSITORY_SEARCH'; payload: string }
  | { type: 'SET_REPOSITORY_PAGINATION'; payload: { has_next: boolean; cursor?: string; loading: boolean } }
  | { type: 'SET_PROJECT_CONFIG'; payload: ProjectGitHubConfig | null }
  | { type: 'ADD_OPERATION'; payload: GitHubSyncOperation }
  | { type: 'UPDATE_OPERATION'; payload: { id: string; update: Partial<GitHubSyncOperation> } }
  | { type: 'SET_CURRENT_OPERATION'; payload: GitHubSyncOperation | null }
  | { type: 'SET_SYNC_STATUS'; payload: 'idle' | 'syncing' | 'conflict' | 'error' }
  | { type: 'SET_LAST_SYNC_AT'; payload: string | null }
  | { type: 'SET_ERROR'; payload: GitHubSyncError | null }
  | { type: 'SET_SHOW_SYNC_DIALOG'; payload: boolean }
  | { type: 'SET_SHOW_REPOSITORY_SELECTOR'; payload: boolean }
  | { type: 'RESET_STATE' }