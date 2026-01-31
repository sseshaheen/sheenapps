# GitHub 2-Way Sync Frontend Integration Guide

## Overview

This guide provides the NextJS frontend team with everything needed to integrate the GitHub 2-way sync feature into the SheenApps platform. The backend implementation is complete and production-ready, supporting real-time bidirectional synchronization between SheenApps projects and GitHub repositories.

## Key Features

### 🔄 **Bidirectional Sync**
- **GitHub → SheenApps**: Real-time webhook-driven updates when code changes on GitHub
- **SheenApps → GitHub**: Push local changes to GitHub with configurable sync modes
- **Conflict Resolution**: Smart handling of simultaneous changes with multiple strategies

### ⚙️ **Configurable Sync Modes**
- **Protected PR** (Default): All changes create pull requests for review
- **Hybrid**: Smart mode - direct commits when safe, PRs when conflicts detected
- **Direct Commit**: Lovable-style real-time sync directly to main branch

### 🔐 **Enterprise Security**
- GitHub App authentication with fine-grained permissions
- HMAC webhook signature validation
- Token management with 1-hour expiry and auto-refresh
- Branch protection awareness

## Environment Configuration

### Required Environment Variables

```bash
# Worker Connection (Required for Frontend)
WORKER_BASE_URL="https://your-worker.com"     # Direct worker API URL (no proxy)
WORKER_HMAC_KEY="your-hmac-secret-key"        # HMAC key for worker authentication

# GitHub App Configuration (Backend)
GITHUB_APP_ID="123456"                        # GitHub App ID from app settings
GITHUB_APP_PRIVATE_KEY="-----BEGIN..."        # GitHub App private key (PEM format)
GITHUB_WEBHOOK_SECRET="your-secret-here"      # Webhook secret for signature validation

# Frontend Configuration
NEXT_PUBLIC_GITHUB_APP_SLUG="your-app-slug"   # GitHub App slug for installation links
NEXT_PUBLIC_BASE_URL="https://your-app.com"   # Your application base URL

# Optional Feature Flags
FF_GH_SYNC_UI="on"                            # Enable GitHub sync UI (default: off)
FF_GH_SYNC_POLLING="on"                       # Enable status polling (default: on)
FF_GH_SYNC_DIRECT_MODE="off"                  # Allow direct commit mode (default: off)

# Database & Cache (Backend)
REDIS_HOST="127.0.0.1"                        # Redis host for token caching
REDIS_PORT="6379"                             # Redis port

# Optional Analytics & Monitoring
POSTHOG_KEY="your-posthog-key"                # PostHog analytics (optional)
SENTRY_DSN="your-sentry-dsn"                  # Sentry error tracking (optional)
```

### GitHub App Setup

1. **Create GitHub App** in your organization:
   - App name: "SheenApps Sync"
   - Homepage URL: Your platform URL
   - Webhook URL: `https://your-api.com/v1/webhooks/github/:projectId`
   - Permissions needed:
     - Repository: `Contents` (Read & Write)
     - Repository: `Pull requests` (Write)
     - Repository: `Metadata` (Read)
     - Repository: `Checks` (Read)

2. **Generate Private Key** and download
3. **Create Webhook Secret** for signature validation
4. **Install App** on target repositories/organizations

## Database Migration

Run the GitHub integration migration:

```sql
-- Run migration 069_github_integration_foundation.sql
-- This adds GitHub columns to projects table and creates sync operations tracking
```

The migration adds these fields to the `projects` table:
- `github_repo_owner` - Repository owner (organization or user)  
- `github_repo_name` - Repository name
- `github_branch` - Default branch (auto-detected from GitHub)
- `github_installation_id` - GitHub App installation ID
- `github_sync_enabled` - Enable/disable sync per project
- `github_sync_mode` - Sync mode: 'protected_pr', 'hybrid', 'direct_commit'
- Enhanced SHA tracking fields for conflict detection

## API Integration

### Repository Discovery Endpoints

#### 1. List GitHub App Installations

```typescript
GET /v1/github/installations

// Response (Current Implementation - Returns guidance for manual setup)
{
  error: "Installation discovery requires user OAuth integration",
  error_code: "INSUFFICIENT_PERMISSIONS", 
  recovery_url: "https://github.com/apps/your-app/installations/select_target",
  details: {
    message: "Users must install the GitHub App and provide the installation ID",
    documentation: "Use the GitHub App installation URL to guide users"
  }
}
```

**Status**: `501 Not Implemented` - Future OAuth integration planned

**Frontend Usage**: Direct users to the GitHub App installation URL from the recovery_url.

#### 2. List Repositories for Installation

```typescript
GET /v1/github/installations/:installationId/repos?query=&page=1&per_page=30

// Query parameters
interface RepoDiscoveryQuery {
  query?: string;     // Optional search term
  page?: number;      // Page number (default: 1)  
  per_page?: number;  // Items per page (default: 30, max: 100)
}

// Response
{
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    private: boolean;
    default_branch: string;
    archived: boolean;
    disabled: boolean;
    language: string | null;
    updated_at: string;
    html_url: string;
  }>,
  total_count: number;
  page: number;
  per_page: number;
}
```

**Frontend Usage**: 
- Repository selection dropdowns with search
- Pagination for organizations with many repos
- Filter out archived/disabled repositories in UI

### Core Integration Endpoints

All endpoints require HMAC signature validation using existing middleware patterns.

#### 3. Link Project to GitHub Repository

```typescript
POST /v1/projects/:projectId/github/link

// Request body
interface GitHubLinkRequest {
  repoOwner: string;        // GitHub username or organization
  repoName: string;         // Repository name
  installationId: string;   // GitHub App installation ID
  branch?: string;          // Branch to sync (auto-detected if omitted)
  syncMode?: 'protected_pr' | 'hybrid' | 'direct_commit';
  webhookSecret?: string;   // Optional override for webhook secret
}

// Response
{
  success: true,
  message: "GitHub repository linked successfully",
  repository: {
    owner: "myorg",
    name: "myrepo", 
    branch: "main",
    protected: false
  },
  syncMode: "protected_pr",
  webhookUrl: "https://api.sheenapps.com/v1/webhooks/github/project123"
}
```

#### 2. Get GitHub Sync Status

```typescript
GET /v1/projects/:projectId/github/status

// Response
interface GitHubSyncStatusResponse {
  enabled: boolean;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  syncMode?: 'protected_pr' | 'hybrid' | 'direct_commit';
  lastSync?: string;           // ISO timestamp
  lastRemoteSha?: string;      // Latest GitHub commit SHA
  lastLocalSha?: string;       // Latest synced local SHA
  pendingOperations?: number;  // Count of queued operations
  recentOperations?: Array<{
    id: string;
    type: string;              // 'push_to_github', 'pull_from_github', etc.
    status: string;            // 'pending', 'processing', 'success', 'failed'
    createdAt: string;
    completedAt?: string;
    error?: string;
  }>;
}
```

#### 3. Trigger Manual Sync

```typescript
POST /v1/projects/:projectId/github/sync/trigger

// Request body
interface GitHubSyncTriggerRequest {
  direction: 'to_github' | 'from_github' | 'both';
  versionId?: string;  // Required for 'to_github' direction
  force?: boolean;     // Force sync even if conflicts detected
}

// Response
{
  success: true,
  message: "GitHub sync operations queued",
  operations: [
    {
      direction: "to_github",
      jobId: "github-push-project123-version456",
      type: "push",
      versionId: "version456"
    }
  ],
  repository: "myorg/myrepo"
}
```

#### 4. Resolve Sync Conflicts

```typescript
POST /v1/projects/:projectId/github/sync/resolve-conflict

// Request body
interface GitHubConflictResolveRequest {
  strategy: 'github_wins' | 'local_wins' | 'manual_review' | 'auto_merge';
  localCommitSha: string;   // Local commit SHA
  remoteCommitSha: string;  // GitHub commit SHA
}

// Response
{
  success: true,
  strategy: "github_wins",
  message: "Conflict resolved successfully",
  result: {
    commitSha: "abc123...",
    prUrl?: "https://github.com/owner/repo/pull/123",
    filesResolved: 5,
    manualReviewRequired: false
  },
  warnings: ["Local changes were overwritten with GitHub version"]
}
```

#### 5. Unlink GitHub Repository

```typescript
DELETE /v1/projects/:projectId/github/unlink

// Response
{
  success: true,
  message: "GitHub repository unlinked successfully",
  projectId: "project123"
}
```

## Frontend UI Components

### 1. Repository Discovery & Selection

```typescript
// Repository Selector Component
interface RepositorySelectorProps {
  installationId: string;
  onSelect: (repository: GitHubRepository) => void;
  selectedRepo?: string;
}

const RepositorySelector: React.FC<RepositorySelectorProps> = ({
  installationId,
  onSelect,
  selectedRepo
}) => {
  const {
    query: repositoriesQuery,
    setQuery,
    setPage,
    query: searchQuery,
    page
  } = useGitHubRepositories(installationId);

  const { data: repositories, isLoading, error } = repositoriesQuery;

  // Filter out archived/disabled repos for better UX
  const availableRepos = repositories?.repositories?.filter(repo => 
    !repo.archived && !repo.disabled
  ) || [];

  const handleSearch = useDebounce((value: string) => {
    setQuery(value);
    setPage(1); // Reset to first page when searching
  }, 300);

  if (error) {
    return <GitHubErrorDisplay error={error} />;
  }

  return (
    <div className="repository-selector">
      <div className="search-input">
        <input
          type="text"
          placeholder="Search repositories..."
          onChange={(e) => handleSearch(e.target.value)}
          className="repo-search"
        />
      </div>

      {isLoading ? (
        <div className="loading">Loading repositories...</div>
      ) : (
        <div className="repository-list">
          {availableRepos.map(repo => (
            <div 
              key={repo.id}
              className={`repo-item ${selectedRepo === repo.full_name ? 'selected' : ''}`}
              onClick={() => onSelect(repo)}
            >
              <div className="repo-header">
                <span className="repo-name">{repo.name}</span>
                {repo.private && <Badge variant="secondary">Private</Badge>}
                <span className="repo-language">{repo.language}</span>
              </div>
              <div className="repo-details">
                <span className="repo-description">{repo.description}</span>
                <div className="repo-meta">
                  <span>Branch: {repo.default_branch}</span>
                  <span>Updated: {formatDate(repo.updated_at)}</span>
                </div>
              </div>
            </div>
          ))}

          {repositories && repositories.total_count > repositories.repositories.length && (
            <button 
              onClick={() => setPage(page + 1)}
              className="load-more-btn"
            >
              Load More ({repositories.total_count - repositories.repositories.length} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
};
```

### 2. GitHub Repository Linking Interface

```typescript
// Project Settings - GitHub Integration Section
interface GitHubLinkingProps {
  projectId: string;
  currentStatus?: GitHubSyncStatusResponse;
  onLink: (linkData: GitHubLinkRequest) => Promise<void>;
  onUnlink: () => Promise<void>;
}

const GitHubIntegrationPanel: React.FC<GitHubLinkingProps> = ({
  projectId,
  currentStatus,
  onLink,
  onUnlink
}) => {
  const [installationId, setInstallationId] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('protected_pr');
  const [isLinking, setIsLinking] = useState(false);

  const handleLink = async () => {
    if (!selectedRepo || !installationId) return;
    
    setIsLinking(true);
    try {
      await onLink({
        repoOwner: selectedRepo.full_name.split('/')[0],
        repoName: selectedRepo.name,
        installationId,
        syncMode,
        branch: selectedRepo.default_branch
      });
    } finally {
      setIsLinking(false);
    }
  };

  if (currentStatus?.enabled) {
    return <GitHubSyncStatus status={currentStatus} onUnlink={onUnlink} />;
  }

  return (
    <div className="github-integration-setup">
      <h3>Connect to GitHub</h3>
      
      {/* Step 1: Installation ID */}
      <div className="setup-step">
        <label>GitHub App Installation ID</label>
        <input
          type="text"
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
          placeholder="Enter installation ID from GitHub App"
        />
        <small>
          Need help? <a href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG}/installations/select_target`} target="_blank">
            Install GitHub App
          </a>
        </small>
      </div>

      {/* Step 2: Repository Selection */}
      {installationId && (
        <div className="setup-step">
          <label>Select Repository</label>
          <RepositorySelector
            installationId={installationId}
            onSelect={setSelectedRepo}
            selectedRepo={selectedRepo?.full_name}
          />
        </div>
      )}

      {/* Step 3: Sync Mode Selection */}
      {selectedRepo && (
        <div className="setup-step">
          <label>Sync Mode</label>
          <div className="sync-mode-options">
            <div className={`mode-option ${syncMode === 'protected_pr' ? 'selected' : ''}`} 
                 onClick={() => setSyncMode('protected_pr')}>
              <h4>Protected PR (Recommended)</h4>
              <p>Safest - all changes create pull requests for review</p>
            </div>
            <div className={`mode-option ${syncMode === 'hybrid' ? 'selected' : ''}`} 
                 onClick={() => setSyncMode('hybrid')}>
              <h4>Hybrid Mode</h4>
              <p>Smart mode - direct commits when safe, PRs for conflicts</p>
            </div>
            <div className={`mode-option ${syncMode === 'direct_commit' ? 'selected' : ''}`} 
                 onClick={() => setSyncMode('direct_commit')}>
              <h4>Direct Commit</h4>
              <p>Real-time sync like Lovable (advanced users only)</p>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Connect Button */}
      {selectedRepo && (
        <button 
          onClick={handleLink} 
          disabled={isLinking}
          className="connect-button"
        >
          {isLinking ? 'Connecting...' : 'Connect Repository'}
        </button>
      )}
    </div>
  );
};
```

### 2. Sync Status Dashboard

```typescript
interface SyncStatusProps {
  projectId: string;
  status: GitHubSyncStatusResponse;
  onRefresh: () => void;
  onTriggerSync: (direction: 'to_github' | 'from_github') => void;
}

const GitHubSyncStatus: React.FC<SyncStatusProps> = ({
  status,
  onRefresh,
  onTriggerSync
}) => {
  return (
    <div className="github-sync-panel">
      {/* Connection Status */}
      <div className="sync-overview">
        <div className="repository-info">
          <span>📁 {status.repoOwner}/{status.repoName}</span>
          <span>🌿 {status.branch}</span>
          <Badge>{status.syncMode}</Badge>
        </div>
        
        <div className="sync-metrics">
          <span>Last sync: {formatRelativeTime(status.lastSync)}</span>
          <span>Pending: {status.pendingOperations || 0}</span>
        </div>
      </div>

      {/* Manual Sync Controls */}
      <div className="sync-actions">
        <Button onClick={() => onTriggerSync('from_github')}>
          ⬇️ Pull from GitHub
        </Button>
        <Button onClick={() => onTriggerSync('to_github')}>
          ⬆️ Push to GitHub
        </Button>
        <Button variant="ghost" onClick={onRefresh}>
          🔄 Refresh
        </Button>
      </div>

      {/* Recent Operations */}
      <div className="recent-operations">
        <h4>Recent Sync Operations</h4>
        {status.recentOperations?.map(op => (
          <SyncOperationItem key={op.id} operation={op} />
        ))}
      </div>
    </div>
  );
};
```

### 3. Conflict Resolution Interface

```typescript
interface ConflictResolutionProps {
  projectId: string;
  conflict: {
    localCommitSha: string;
    remoteCommitSha: string;
    conflictingFiles?: string[];
    description: string;
  };
  onResolve: (strategy: ConflictResolutionStrategy) => Promise<void>;
  onDismiss: () => void;
}

const ConflictResolutionModal: React.FC<ConflictResolutionProps> = ({
  conflict,
  onResolve,
  onDismiss
}) => {
  const strategies = [
    {
      key: 'github_wins',
      title: 'Accept GitHub Version',
      description: 'Overwrite local changes with GitHub version',
      icon: '⬇️',
      risk: 'high'
    },
    {
      key: 'local_wins', 
      title: 'Keep Local Version',
      description: 'Push local changes to GitHub (may overwrite GitHub history)',
      icon: '⬆️',
      risk: 'high'
    },
    {
      key: 'manual_review',
      title: 'Create Pull Request',
      description: 'Create PR for manual review and resolution',
      icon: '🔄',
      risk: 'low'
    },
    {
      key: 'auto_merge',
      title: 'Attempt Auto-Merge',
      description: 'Try to automatically merge if possible',
      icon: '🤖',
      risk: 'medium'
    }
  ];

  return (
    <Modal title="Sync Conflict Detected" onClose={onDismiss}>
      <div className="conflict-details">
        <p>{conflict.description}</p>
        {conflict.conflictingFiles && (
          <div className="conflicting-files">
            <strong>Conflicting files:</strong>
            <ul>
              {conflict.conflictingFiles.map(file => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="resolution-strategies">
        {strategies.map(strategy => (
          <ResolutionOption 
            key={strategy.key}
            strategy={strategy}
            onSelect={() => onResolve(strategy.key as ConflictResolutionStrategy)}
          />
        ))}
      </div>
    </Modal>
  );
};
```

## Real-time Updates

### WebSocket Integration

The GitHub sync system can integrate with your existing WebSocket/SSE infrastructure to provide real-time updates:

```typescript
// Subscribe to GitHub sync events for a project
const useGitHubSyncEvents = (projectId: string) => {
  useEffect(() => {
    const eventSource = new EventSource(`/v1/projects/${projectId}/events`);
    
    eventSource.addEventListener('github_sync_started', (event) => {
      const data = JSON.parse(event.data);
      // Update UI to show sync in progress
      showSyncProgress(data.operation, data.direction);
    });

    eventSource.addEventListener('github_sync_completed', (event) => {
      const data = JSON.parse(event.data);
      // Refresh project status, show success notification
      refreshProjectStatus();
      showNotification('Sync completed successfully', 'success');
    });

    eventSource.addEventListener('github_sync_failed', (event) => {
      const data = JSON.parse(event.data);
      // Show error notification, possibly trigger conflict resolution
      showNotification(`Sync failed: ${data.error}`, 'error');
      if (data.requiresConflictResolution) {
        showConflictResolutionModal(data.conflict);
      }
    });

    return () => eventSource.close();
  }, [projectId]);
};
```

## User Experience Flows

### 1. First-Time Setup Flow

```typescript
const GitHubSetupWizard = () => {
  const steps = [
    {
      title: "Install GitHub App",
      content: (
        <div>
          <p>Install the SheenApps GitHub App in your organization:</p>
          <Button href={`https://github.com/apps/sheenapps-sync/installations/new`}>
            Install GitHub App
          </Button>
        </div>
      )
    },
    {
      title: "Link Repository", 
      content: <RepositorySelector onSelect={handleRepoSelect} />
    },
    {
      title: "Choose Sync Mode",
      content: <SyncModeSelector onSelect={handleModeSelect} />
    },
    {
      title: "Test Connection",
      content: <ConnectionTest projectId={projectId} />
    }
  ];

  return <StepperWizard steps={steps} onComplete={handleSetupComplete} />;
};
```

### 2. Ongoing Sync Management

```typescript
const ProjectGitHubTab = ({ projectId }: { projectId: string }) => {
  const { data: syncStatus, refetch } = useGitHubSyncStatus(projectId);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  // Auto-refresh status every 30 seconds
  useInterval(refetch, 30000);

  // Handle sync conflicts
  const handleConflictDetected = (conflict: ConflictData) => {
    setConflictModalOpen(true);
    // Could also show toast notification
  };

  if (!syncStatus?.enabled) {
    return <GitHubSetupWizard projectId={projectId} />;
  }

  return (
    <div className="project-github-integration">
      <GitHubSyncStatus
        status={syncStatus}
        onRefresh={refetch}
        onTriggerSync={handleTriggerSync}
      />
      
      {conflictModalOpen && (
        <ConflictResolutionModal
          projectId={projectId}
          onResolve={handleConflictResolution}
          onDismiss={() => setConflictModalOpen(false)}
        />
      )}
    </div>
  );
};
```

## Error Handling

### Standardized Error Response Format

All GitHub endpoints return consistent error responses with machine-readable error codes:

```typescript
interface StandardGitHubError {
  error: string;           // Human-readable error message
  error_code: string;      // Machine-readable error code for programmatic handling
  recovery_url?: string;   // Optional recovery action URL  
  details?: any;           // Additional error context
}
```

### Error Code Reference

```typescript
const GITHUB_ERROR_CODES = {
  // Installation & Access
  APP_NOT_INSTALLED: 'APP_NOT_INSTALLED',           // GitHub App not installed on repository
  APP_UNINSTALLED: 'APP_UNINSTALLED',               // GitHub App was uninstalled after linking
  INVALID_INSTALLATION: 'INVALID_INSTALLATION',     // Installation ID not found or inaccessible
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS', // App lacks required permissions
  
  // Repository Issues  
  REPO_ARCHIVED: 'REPO_ARCHIVED',                   // Repository is archived and read-only
  BRANCH_PROTECTED: 'BRANCH_PROTECTED',             // Cannot push to protected branch
  NOT_FAST_FORWARD: 'NOT_FAST_FORWARD',             // Remote has changes, needs pull first
  
  // File & Content Issues
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',                 // File exceeds GitHub's 100MiB limit
  
  // System Issues
  RATE_LIMIT: 'RATE_LIMIT'                          // GitHub API rate limit exceeded
} as const;
```

### Error Handling Implementation

```typescript
const handleGitHubError = (error: StandardGitHubError) => {
  switch (error.error_code) {
    case 'APP_NOT_INSTALLED':
      return {
        title: 'GitHub App Not Installed',
        message: 'Please install the SheenApps GitHub App to connect this repository.',
        action: 'Install App',
        actionUrl: error.recovery_url || 'https://github.com/apps/sheenapps-sync',
        severity: 'error'
      };

    case 'APP_UNINSTALLED':
      return {
        title: 'GitHub App Uninstalled',
        message: 'The GitHub App was uninstalled. Please reinstall to continue syncing.',
        action: 'Reinstall App',
        actionUrl: error.recovery_url,
        severity: 'error'
      };

    case 'INVALID_INSTALLATION':
      return {
        title: 'Invalid Installation',
        message: 'Cannot access this GitHub installation. Please check permissions.',
        action: 'Update Installation',
        actionUrl: error.recovery_url,
        severity: 'error'
      };

    case 'INSUFFICIENT_PERMISSIONS':
      return {
        title: 'Insufficient Permissions',
        message: 'The GitHub App needs additional permissions to access this repository.',
        action: 'Grant Permissions',
        severity: 'warning'
      };

    case 'REPO_ARCHIVED':
      return {
        title: 'Repository Archived',
        message: 'Cannot sync with archived repositories. Please unarchive or select a different repository.',
        severity: 'warning'
      };

    case 'BRANCH_PROTECTED':
      return {
        title: 'Branch Protected',
        message: 'Cannot push directly to protected branch. A pull request will be created instead.',
        details: error.details?.created_pr_url ? `PR created: ${error.details.created_pr_url}` : undefined,
        severity: 'info'
      };

    case 'NOT_FAST_FORWARD':
      return {
        title: 'Sync Conflict',
        message: 'Remote repository has changes that conflict with local changes.',
        action: 'Resolve Conflicts',
        actionHandler: () => showConflictResolution(),
        severity: 'warning'
      };

    case 'FILE_TOO_LARGE':
      return {
        title: 'File Too Large',
        message: 'Some files exceed GitHub\'s 100MiB limit and cannot be synced.',
        details: 'Consider using Git LFS for large files or exclude them from sync.',
        severity: 'warning'
      };

    case 'RATE_LIMIT':
      const retryAfter = error.details?.retry_after || 60;
      return {
        title: 'Rate Limited',
        message: `GitHub API rate limit exceeded. Retrying automatically in ${retryAfter} seconds.`,
        severity: 'info',
        autoRetry: true
      };

    default:
      return {
        title: 'GitHub Sync Error',
        message: error.error || 'An unexpected error occurred during GitHub sync.',
        details: error.details?.originalError,
        severity: 'error'
      };
  }
};

// Usage in components
const GitHubErrorDisplay = ({ error }: { error: StandardGitHubError }) => {
  const errorInfo = handleGitHubError(error);
  
  return (
    <div className={`error-display error-${errorInfo.severity}`}>
      <h4>{errorInfo.title}</h4>
      <p>{errorInfo.message}</p>
      {errorInfo.details && <small>{errorInfo.details}</small>}
      {errorInfo.actionUrl && (
        <a href={errorInfo.actionUrl} target="_blank" rel="noopener noreferrer">
          {errorInfo.action}
        </a>
      )}
      {errorInfo.actionHandler && (
        <button onClick={errorInfo.actionHandler}>
          {errorInfo.action}
        </button>
      )}
    </div>
  );
};
```

## React Hooks

### Custom Hooks for GitHub Integration

```typescript
// Hook for repository discovery
export const useGitHubRepositories = (installationId: string, enabled: boolean = true) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  
  return {
    query: useQuery({
      queryKey: ['github-repos', installationId, query, page],
      queryFn: async () => {
        const params = new URLSearchParams({
          query,
          page: page.toString(),
          per_page: '30'
        });
        const response = await fetch(`/v1/github/installations/${installationId}/repos?${params}`);
        
        if (!response.ok) {
          throw await response.json();
        }
        
        return response.json();
      },
      enabled: enabled && !!installationId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    }),
    setQuery,
    setPage,
    query: query,
    page
  };
};

// Hook for managing GitHub sync status
export const useGitHubSyncStatus = (projectId: string) => {
  return useQuery({
    queryKey: ['github-sync-status', projectId],
    queryFn: () => fetch(`/v1/projects/${projectId}/github/status`).then(r => r.json()),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 10000
  });
};

// Hook for triggering sync operations
export const useGitHubSync = (projectId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: GitHubSyncTriggerRequest) => {
      const response = await fetch(`/v1/projects/${projectId}/github/sync/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate status to show updated sync state
      queryClient.invalidateQueries(['github-sync-status', projectId]);
      // Show success notification
      toast.success('Sync operation started');
    },
    onError: (error: GitHubSyncError) => {
      const errorInfo = handleGitHubSyncError(error);
      toast.error(errorInfo.message);
    }
  });
};

// Hook for repository linking
export const useGitHubLink = (projectId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (linkData: GitHubLinkRequest) => {
      const response = await fetch(`/v1/projects/${projectId}/github/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkData)
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['github-sync-status', projectId]);
      toast.success('Repository linked successfully');
      
      // Show webhook URL for user to configure in GitHub
      showWebhookConfigurationModal(data.webhookUrl);
    }
  });
};
```

## Testing Integration

### Mock Data for Development

```typescript
// Mock GitHub sync status for development
export const mockGitHubSyncStatus: GitHubSyncStatusResponse = {
  enabled: true,
  repoOwner: 'myorg',
  repoName: 'test-repo', 
  branch: 'main',
  syncMode: 'hybrid',
  lastSync: '2025-01-26T10:30:00Z',
  lastRemoteSha: 'abc123...',
  lastLocalSha: 'def456...',
  pendingOperations: 0,
  recentOperations: [
    {
      id: 'sync-123',
      type: 'push_to_github',
      status: 'success',
      createdAt: '2025-01-26T10:30:00Z',
      completedAt: '2025-01-26T10:30:15Z'
    },
    {
      id: 'sync-124',
      type: 'pull_from_github',
      status: 'failed',
      createdAt: '2025-01-26T09:15:00Z',
      error: 'Rate limit exceeded'
    }
  ]
};

// Mock conflict scenario
export const mockConflict = {
  localCommitSha: 'local123...',
  remoteCommitSha: 'remote456...',
  conflictingFiles: ['src/components/Header.tsx', 'package.json'],
  description: 'Changes detected on both GitHub and SheenApps since last sync.'
};
```

## Security Considerations

### HMAC Signature Validation

All API requests must include HMAC signatures using the existing middleware:

```typescript
// Frontend HMAC signing (use existing utility)
const signRequest = (body: string, secret: string) => {
  // Use existing HMAC signing utility from Stripe integration
  return createHmacSignature(body, secret);
};

// Include in request headers
const headers = {
  'Content-Type': 'application/json',
  'x-sheen-signature': signRequest(JSON.stringify(requestBody), secret),
  'x-sheen-timestamp': Date.now().toString(),
  'x-sheen-nonce': generateNonce()
};
```

### Sensitive Data Handling

- Never expose GitHub App private keys in frontend code
- Store installation IDs securely (they're not secret but should be validated)
- Webhook secrets are server-side only
- GitHub tokens are managed entirely by the backend

## Deployment Checklist

### Before Enabling GitHub Sync

1. **Backend Configuration**:
   - [ ] Environment variables configured
   - [ ] Database migration run
   - [ ] GitHub App created and installed

2. **Frontend Integration**:
   - [ ] GitHub integration components implemented
   - [ ] Error handling tested
   - [ ] Real-time updates working
   - [ ] HMAC signature validation integrated

3. **Testing**:
   - [ ] Repository linking flow tested
   - [ ] Sync operations in both directions verified
   - [ ] Conflict resolution tested
   - [ ] Error scenarios handled gracefully

4. **User Experience**:
   - [ ] Setup wizard guides users through configuration
   - [ ] Sync status clearly displayed
   - [ ] Manual sync controls available
   - [ ] Notifications for sync events working

## Support and Troubleshooting

### Common User Issues

1. **"Repository not found"**: User hasn't installed GitHub App or lacks permissions
2. **"Sync failed"**: Check GitHub API rate limits or repository permissions
3. **"Webhook not receiving events"**: Verify webhook URL configuration in GitHub App
4. **"Conflicts keep occurring"**: User may need training on sync modes and workflows

### Admin Monitoring

Use the admin endpoints for monitoring across all projects:

```typescript
// Admin dashboard for GitHub sync overview
GET /v1/admin/github/sync-status
GET /v1/admin/github/sync-operations?limit=100&status=failed
```

---

## Real-time SSE Events Integration

### GitHub-Specific SSE Events

The backend now emits GitHub-specific SSE events that the frontend team requested for real-time sync status updates:

```typescript
// GitHub SSE Event Types
type GitHubSyncEventType = 
  | 'github_sync_started'
  | 'github_sync_progress' 
  | 'github_sync_conflict'
  | 'github_sync_completed'
  | 'github_sync_failed';
```

### SSE Event Consumption Pattern

```typescript
// Frontend SSE integration for GitHub events
class GitHubSyncSSE {
  private eventSource: EventSource | null = null;
  private callbacks: Map<string, (data: any) => void> = new Map();
  
  connect(projectId: string) {
    // Connect to SSE stream for project
    this.eventSource = new EventSource(`/api/projects/${projectId}/stream`);
    
    // GitHub sync started
    this.eventSource.addEventListener('github_sync_started', (event) => {
      const data = JSON.parse(event.data).data;
      this.callbacks.get('started')?.(data);
      
      // Example data:
      // {
      //   operationId: "job-123",
      //   projectId: "proj-456",
      //   direction: "to_github" | "from_github",
      //   syncMode: "protected_pr" | "direct_commit",
      //   timestamp: "2025-01-26T10:30:00Z"
      // }
    });
    
    // GitHub sync progress (throttled: +5% deltas or max 1/sec)
    this.eventSource.addEventListener('github_sync_progress', (event) => {
      const data = JSON.parse(event.data).data;
      this.callbacks.get('progress')?.(data);
      
      // Example data:
      // {
      //   operationId: "job-123",
      //   projectId: "proj-456", 
      //   message: "Creating GitHub tree...",
      //   percent: 45,
      //   timestamp: "2025-01-26T10:30:00Z"
      // }
    });
    
    // GitHub sync conflict
    this.eventSource.addEventListener('github_sync_conflict', (event) => {
      const data = JSON.parse(event.data).data;
      this.callbacks.get('conflict')?.(data);
      
      // Example data:
      // {
      //   operationId: "job-123",
      //   projectId: "proj-456",
      //   conflicts: ["src/App.tsx", "package.json"],
      //   strategy: "manual_review",
      //   resolutionRequired: true,
      //   timestamp: "2025-01-26T10:30:00Z"
      // }
    });
    
    // GitHub sync completed
    this.eventSource.addEventListener('github_sync_completed', (event) => {
      const data = JSON.parse(event.data).data;
      this.callbacks.get('completed')?.(data);
      
      // Example data:
      // {
      //   operationId: "job-123",
      //   projectId: "proj-456",
      //   status: "success",
      //   filesChanged: 5,
      //   commitSha: "abc123...",
      //   prUrl: "https://github.com/org/repo/pull/42",
      //   duration: 15000,
      //   timestamp: "2025-01-26T10:30:00Z"
      // }
    });
    
    // GitHub sync failed
    this.eventSource.addEventListener('github_sync_failed', (event) => {
      const data = JSON.parse(event.data).data;
      this.callbacks.get('failed')?.(data);
      
      // Example data:
      // {
      //   operationId: "job-123", 
      //   projectId: "proj-456",
      //   status: "failed",
      //   error_code: "BRANCH_PROTECTED" | "RATE_LIMIT" | "APP_NOT_INSTALLED",
      //   message: "Branch protection requires pull request",
      //   retryable: false,
      //   recovery_url: "https://github.com/settings/installations",
      //   timestamp: "2025-01-26T10:30:00Z"
      // }
    });
  }
  
  // Subscribe to specific event types
  on(event: 'started' | 'progress' | 'conflict' | 'completed' | 'failed', callback: (data: any) => void) {
    this.callbacks.set(event, callback);
  }
  
  disconnect() {
    this.eventSource?.close();
    this.callbacks.clear();
  }
}
```

### React Hook for GitHub SSE

```typescript
// Custom hook for GitHub sync SSE events
export const useGitHubSyncSSE = (projectId: string, operationId?: string) => {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<GitHubSyncError | null>(null);
  const [result, setResult] = useState<any>(null);
  
  useEffect(() => {
    if (!projectId) return;
    
    const sse = new GitHubSyncSSE();
    sse.connect(projectId);
    
    sse.on('started', (data) => {
      // Only handle events for our operation if operationId specified
      if (operationId && data.operationId !== operationId) return;
      
      setSyncStatus('syncing');
      setProgress(0);
      setMessage('Starting sync operation...');
      setError(null);
    });
    
    sse.on('progress', (data) => {
      if (operationId && data.operationId !== operationId) return;
      
      setProgress(data.percent || 0);
      setMessage(data.message || 'Syncing...');
    });
    
    sse.on('conflict', (data) => {
      if (operationId && data.operationId !== operationId) return;
      
      // Handle conflict UI - show conflict resolution modal
      setMessage(`Conflicts detected in ${data.conflicts?.length || 0} files`);
    });
    
    sse.on('completed', (data) => {
      if (operationId && data.operationId !== operationId) return;
      
      setSyncStatus('completed');
      setProgress(100);
      setMessage('Sync completed successfully');
      setResult(data);
    });
    
    sse.on('failed', (data) => {
      if (operationId && data.operationId !== operationId) return;
      
      setSyncStatus('failed');
      setError({
        message: data.message,
        error_code: data.error_code,
        recovery_url: data.recovery_url,
        retryable: data.retryable
      });
      setMessage(`Sync failed: ${data.message}`);
    });
    
    return () => sse.disconnect();
  }, [projectId, operationId]);
  
  return {
    syncStatus,
    progress,
    message,
    error,
    result
  };
};
```

### UI Component Example

```tsx
// GitHub sync progress component with SSE
export const GitHubSyncProgress: React.FC<{ projectId: string; operationId: string }> = ({ 
  projectId, 
  operationId 
}) => {
  const { syncStatus, progress, message, error, result } = useGitHubSyncSSE(projectId, operationId);
  
  if (syncStatus === 'idle') {
    return null;
  }
  
  return (
    <div className="github-sync-progress">
      <div className="sync-header">
        <h3>GitHub Sync in Progress</h3>
        <Badge variant={syncStatus === 'completed' ? 'success' : syncStatus === 'failed' ? 'error' : 'info'}>
          {syncStatus}
        </Badge>
      </div>
      
      {syncStatus === 'syncing' && (
        <div className="progress-section">
          <ProgressBar value={progress} max={100} />
          <p className="progress-message">{message}</p>
        </div>
      )}
      
      {syncStatus === 'completed' && result && (
        <div className="success-section">
          <CheckCircle className="success-icon" />
          <p>Sync completed successfully!</p>
          <div className="result-details">
            <p>Files changed: {result.filesChanged}</p>
            {result.prUrl && (
              <a href={result.prUrl} target="_blank" rel="noopener noreferrer">
                View Pull Request →
              </a>
            )}
          </div>
        </div>
      )}
      
      {syncStatus === 'failed' && error && (
        <div className="error-section">
          <AlertCircle className="error-icon" />
          <p>Sync failed: {error.message}</p>
          {error.recovery_url && (
            <Button 
              variant="outline" 
              onClick={() => window.open(error.recovery_url, '_blank')}
            >
              Fix Issue →
            </Button>
          )}
          {error.retryable && (
            <Button 
              variant="primary"
              onClick={() => {
                // Trigger retry logic
                triggerGitHubSync(projectId, { direction: 'both' });
              }}
            >
              Retry Sync
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
```

### Key SSE Features

**📊 Progress Throttling**: Progress events are throttled to +5% deltas or max 1/sec to prevent SSE spam

**🔒 Terminal Event Guarantee**: Always emits either `github_sync_completed` or `github_sync_failed`

**🎯 Operation Tracking**: Use `operationId` from sync trigger response to track specific operations

**⚡ Real-time Updates**: Sub-second event delivery for immediate UI feedback

**🛡️ Error Recovery**: Standardized error codes with recovery URLs for user action

---

## Summary

### ✅ Latest Updates (Implementation Complete)

**🔍 Repository Discovery Endpoints**
- `GET /v1/github/installations` - Lists GitHub App installations (guidance for manual setup)
- `GET /v1/github/installations/:id/repos` - Repository discovery with search & pagination
- Complete TypeScript interfaces and React hooks provided

**🎯 Standardized Error Handling**
- Machine-readable error codes: `APP_NOT_INSTALLED`, `BRANCH_PROTECTED`, `RATE_LIMIT`, etc.
- Consistent error response format with recovery URLs
- Production-ready error handling components and utilities

**⚡ Real-time SSE Events (NEW)**
- GitHub-specific SSE events: `github_sync_started`, `github_sync_progress`, `github_sync_completed`, etc.
- Progress throttling (+5% deltas or max 1/sec) to prevent frontend overload
- Terminal event guarantee - always emits completion or failure
- Complete React hooks and UI components for real-time sync feedback
- Operation tracking with `operationId` for multi-operation scenarios

**⚙️ Enhanced Configuration**
- Updated environment variables with feature flags
- Complete webhook routing architecture (direct to worker)
- Ready-to-use Postman collection with new endpoints

**🎨 Updated UI Components**
- Repository selector with search and pagination
- Enhanced error display components with recovery actions
- Real-time sync progress components with SSE integration
- Complete setup wizard with step-by-step flow

### 🚀 Production-Ready Features

The GitHub 2-way sync integration is fully implemented with:

- **Repository Discovery**: Search and select from available repositories
- **Standardized Errors**: Machine-readable error codes for robust frontend handling
- **Complete Backend**: Enterprise security with GitHub App authentication
- **Flexible API**: Supporting all sync scenarios and conflict resolution
- **Real-time SSE Events**: GitHub-specific events with progress throttling and terminal guarantees
- **Instant UI Feedback**: Sub-second sync status updates with operationId tracking
- **Error Recovery**: Actionable recovery URLs and retry mechanisms
- **Production Monitoring**: Comprehensive logging and error tracking

### 🎯 Next Steps for Frontend Team

1. **Environment Setup**: Configure required environment variables
2. **Repository Integration**: Implement repository discovery and selection UI
3. **SSE Integration**: Implement real-time GitHub sync events using provided React hooks
4. **Error Handling**: Integrate standardized error handling components with recovery actions
5. **Testing**: Use updated Postman collection for integration testing
6. **Progress UI**: Build sync progress components with real-time updates
7. **Production Deployment**: Follow deployment checklist for go-live

The frontend team can now build a best-in-class GitHub integration experience that exceeds Lovable's capabilities while maintaining enterprise security and reliability standards.