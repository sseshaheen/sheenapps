# Vercel Integration Frontend Guide

## Overview

This guide provides comprehensive documentation for integrating the Vercel backend APIs into the SheenApps Next.js frontend. The backend provides a complete Vercel integration with 25+ API endpoints covering OAuth, project management, deployments, auto-deploy configuration, domain management, and build optimization.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Authentication & Setup](#authentication--setup)
- [Core Integration Workflows](#core-integration-workflows)
- [API Reference](#api-reference)
- [Component Patterns](#component-patterns)
- [Error Handling](#error-handling)
- [Real-time Updates](#real-time-updates)
- [Performance Best Practices](#performance-best-practices)

---

## Architecture Overview

### Backend Services Available

The Vercel integration provides these core capabilities:

1. **OAuth Connection Management** - Connect/disconnect Vercel accounts (personal/team)
2. **Project Management** - Link projects, sync configurations, manage settings  
3. **Deployment Operations** - Deploy, monitor status, promote to production
4. **Auto-Deploy System** - Configure git-based deployments with branch rules
5. **Domain Management** - Add custom domains, verify DNS, manage SSL
6. **Environment Variables** - Bidirectional sync with production guardrails
7. **Build Optimization** - Performance analysis and recommendations
8. **Production Safety** - Guardrails, override tokens, approval workflows

### Data Flow

```
Frontend → Backend API → Vercel API → Database
    ↓
Real-time Updates ← Webhooks ← Vercel
```

### Core Endpoints Structure

```
/v1/internal/vercel/oauth/*     - OAuth flow management
/v1/projects/:id/vercel/*       - Project-specific operations
/v1/webhooks/vercel            - Vercel webhook processing
/v1/webhooks/git/*             - Git push webhook processing
```

---

## Authentication & Setup

### 1. OAuth Connection Flow

**Step 1: Initiate OAuth**
```typescript
// Start OAuth flow
const response = await fetch('/v1/internal/vercel/oauth/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify({
    userId: currentUser.id,
    teamId: selectedTeam?.id, // Optional for team accounts
    redirectUri: `${window.location.origin}/integrations/vercel/callback`
  })
});

const { authorizationUrl } = await response.json();
window.location.href = authorizationUrl; // Redirect to Vercel
```

**Step 2: Handle OAuth Callback**
```typescript
// In your callback page (/integrations/vercel/callback)
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

if (code && state) {
  // Backend handles the OAuth completion automatically
  // Check connection status
  const statusResponse = await fetch(`/v1/internal/vercel/oauth/status?userId=${userId}`);
  const { connected } = await statusResponse.json();
  
  if (connected) {
    // Redirect to success page or refresh parent window
    window.opener?.postMessage({ type: 'VERCEL_CONNECTED' }, window.location.origin);
    window.close();
  }
}
```

**Step 3: Check Connection Status**
```typescript
const checkVercelConnection = async (userId: string) => {
  const response = await fetch(`/v1/internal/vercel/oauth/status?userId=${userId}`);
  const data = await response.json();
  
  return {
    connected: data.connected,
    teamName: data.connection?.teamName,
    accountType: data.connection?.accountType,
    scopes: data.connection?.scopes,
    status: data.connection?.status
  };
};
```

### 2. Connection Management

**Disconnect Vercel**
```typescript
const disconnectVercel = async (userId: string) => {
  const response = await fetch('/v1/internal/vercel/oauth/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  
  if (response.ok) {
    // Update UI to show disconnected state
    setVercelConnected(false);
  }
};
```

---

## Core Integration Workflows

### 1. Project Linking Workflow

**Step 1: List Available Vercel Projects**
```typescript
const listVercelProjects = async (projectId: string, userId: string) => {
  const response = await fetch(
    `/v1/projects/${projectId}/vercel/projects?userId=${userId}&limit=20`,
    { method: 'GET' }
  );
  
  const { projects, pagination } = await response.json();
  return { projects, hasMore: !!pagination.next };
};
```

**Step 2: Link Project**
```typescript
const linkVercelProject = async (projectId: string, vercelProjectId: string, userId: string) => {
  const response = await fetch(`/v1/projects/${projectId}/vercel/projects/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      vercelProjectId,
      framework: 'nextjs', // Auto-detected or user selected
      autoDeployEnabled: true,
      deploymentBranchPatterns: ['main', 'develop'],
      environmentTargets: ['production', 'preview']
    })
  });
  
  const { linked, mappingId, webhookUrl } = await response.json();
  return { linked, mappingId, webhookUrl };
};
```

### 2. Deployment Workflow

**Manual Deployment**
```typescript
const deployProject = async (projectId: string, userId: string, options: {
  type: 'production' | 'preview';
  gitSource?: {
    branch: string;
    commitSha?: string;
  };
}) => {
  const response = await fetch(`/v1/projects/${projectId}/vercel/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      deploymentType: options.type,
      ...(options.gitSource && { gitSource: options.gitSource })
    })
  });
  
  const { deployment, deploymentUrl } = await response.json();
  return { deployment, deploymentUrl };
};
```

**Monitor Deployment Status**
```typescript
const monitorDeployment = async (projectId: string, deploymentId: string, userId: string) => {
  const response = await fetch(
    `/v1/projects/${projectId}/vercel/deployments/${deploymentId}?userId=${userId}`
  );
  
  const { deployment } = await response.json();
  return deployment; // { state, url, error, buildLogs, etc. }
};
```

**Promote to Production**
```typescript
const promoteToProduction = async (projectId: string, deploymentId: string, userId: string) => {
  const response = await fetch(
    `/v1/projects/${projectId}/vercel/deployments/${deploymentId}/promote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    }
  );
  
  const { promoted, productionUrl } = await response.json();
  return { promoted, productionUrl };
};
```

### 3. Auto-Deploy Configuration

**Configure Auto-Deploy Rules**
```typescript
const configureAutoDeploy = async (projectId: string, userId: string, config: {
  enabled: boolean;
  branchPatterns: string[];
  targetEnvironment: 'production' | 'preview' | 'auto';
  requiresApproval: boolean;
}) => {
  const response = await fetch(
    `/v1/projects/${projectId}/vercel/auto-deploy/config`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...config })
    }
  );
  
  return await response.json();
};
```

**Test Auto-Deploy Configuration**
```typescript
const testAutoDeploy = async (projectId: string, userId: string, branch: string) => {
  const response = await fetch(
    `/v1/projects/${projectId}/vercel/auto-deploy/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        branch,
        dryRun: true
      })
    }
  );
  
  const result = await response.json();
  return result; // { wouldDeploy, reason, targetEnvironment, matchedPattern }
};
```

### 4. Domain Management

**Add Custom Domain**
```typescript
const addCustomDomain = async (projectId: string, domain: string, userId: string) => {
  const response = await fetch(`/v1/projects/${projectId}/vercel/domains`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      domain,
      httpsRedirect: true,
      autoConfigureDNS: false
    })
  });
  
  const { domain: domainInfo, verificationRecords } = await response.json();
  return { domainInfo, verificationRecords };
};
```

**Verify Domain**
```typescript
const verifyDomain = async (projectId: string, domain: string, userId: string) => {
  const response = await fetch(
    `/v1/projects/${projectId}/vercel/domains/${domain}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    }
  );
  
  const { verified, status, records } = await response.json();
  return { verified, status, records };
};
```

### 5. Environment Variable Sync

**Sync Environment Variables**
```typescript
const syncEnvironmentVariables = async (projectId: string, userId: string, options: {
  direction: 'to_vercel' | 'from_vercel' | 'bidirectional';
  target: 'production' | 'preview' | 'development';
  dryRun?: boolean;
}) => {
  const response = await fetch(`/v1/projects/${projectId}/vercel/env/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...options })
  });
  
  const { changes, requiresConfirmation } = await response.json();
  return { changes, requiresConfirmation };
};
```

---

## API Reference

### OAuth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/internal/vercel/oauth/initiate` | Start OAuth flow |
| GET | `/v1/internal/vercel/oauth/callback` | Handle OAuth callback |
| GET | `/v1/internal/vercel/oauth/status` | Check connection status |
| POST | `/v1/internal/vercel/oauth/test-connection` | Test connection health |
| POST | `/v1/internal/vercel/oauth/disconnect` | Disconnect account |

### Project Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/projects/:id/vercel/projects` | List Vercel projects |
| POST | `/v1/projects/:id/vercel/projects/link` | Link Vercel project |
| POST | `/v1/projects/:id/vercel/projects/unlink` | Unlink Vercel project |
| GET | `/v1/projects/:id/vercel/projects/:vercelId` | Get project details |

### Deployment Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/projects/:id/vercel/deploy` | Create deployment |
| GET | `/v1/projects/:id/vercel/deployments` | List deployments |
| GET | `/v1/projects/:id/vercel/deployments/:deploymentId` | Get deployment details |
| POST | `/v1/projects/:id/vercel/deployments/:deploymentId/promote` | Promote to production |
| DELETE | `/v1/projects/:id/vercel/deployments/:deploymentId` | Cancel deployment |

### Auto-Deploy Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/projects/:id/vercel/auto-deploy/config` | Get auto-deploy config |
| PUT | `/v1/projects/:id/vercel/auto-deploy/config` | Update auto-deploy config |
| GET | `/v1/projects/:id/vercel/auto-deploy/rules` | List deployment rules |
| POST | `/v1/projects/:id/vercel/auto-deploy/rules` | Add deployment rule |
| DELETE | `/v1/projects/:id/vercel/auto-deploy/rules/:pattern` | Remove deployment rule |
| POST | `/v1/projects/:id/vercel/auto-deploy/test` | Test auto-deploy config |

### Domain Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/projects/:id/vercel/domains` | List project domains |
| POST | `/v1/projects/:id/vercel/domains` | Add custom domain |
| GET | `/v1/projects/:id/vercel/domains/:domain/verification` | Get DNS verification records |
| POST | `/v1/projects/:id/vercel/domains/:domain/verify` | Trigger domain verification |
| DELETE | `/v1/projects/:id/vercel/domains/:domain` | Remove domain |

### Environment Variables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/projects/:id/vercel/env` | List environment variables |
| POST | `/v1/projects/:id/vercel/env/sync` | Sync environment variables |
| PUT | `/v1/projects/:id/vercel/env/:key` | Update environment variable |
| DELETE | `/v1/projects/:id/vercel/env/:key` | Delete environment variable |

### Build Optimization

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/projects/:id/vercel/optimization/analysis` | Get build performance analysis |
| GET | `/v1/projects/:id/vercel/optimization/recommendations` | Get optimization recommendations |
| GET | `/v1/projects/:id/vercel/optimization/history` | Get optimization history |
| GET | `/v1/projects/:id/vercel/optimization/benchmarks` | Get performance benchmarks |
| GET | `/v1/projects/:id/vercel/optimization/trends` | Get performance trends |

---

## Component Patterns

### 1. Connection Status Component

```tsx
import { useState, useEffect } from 'react';

interface VercelConnectionProps {
  userId: string;
  onConnectionChange: (connected: boolean) => void;
}

export function VercelConnection({ userId, onConnectionChange }: VercelConnectionProps) {
  const [connection, setConnection] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkConnection();
  }, [userId]);

  const checkConnection = async () => {
    const response = await fetch(`/v1/internal/vercel/oauth/status?userId=${userId}`);
    const data = await response.json();
    setConnection(data.connection);
    onConnectionChange(data.connected);
  };

  const handleConnect = async () => {
    setConnecting(true);
    const response = await fetch('/v1/internal/vercel/oauth/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const { authorizationUrl } = await response.json();
    
    // Open popup window
    const popup = window.open(authorizationUrl, 'vercel-auth', 'width=600,height=700');
    
    // Listen for completion
    window.addEventListener('message', (event) => {
      if (event.data.type === 'VERCEL_CONNECTED') {
        popup?.close();
        setConnecting(false);
        checkConnection();
      }
    });
  };

  if (!connection) {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <h3 className="font-medium">Connect to Vercel</h3>
          <p className="text-sm text-gray-600">
            Connect your Vercel account to deploy and manage projects
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="px-4 py-2 bg-black text-white rounded-md disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : 'Connect Vercel'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <div>
          <h3 className="font-medium">Vercel Connected</h3>
          <p className="text-sm text-gray-600">
            {connection.teamName || 'Personal Account'} • {connection.scopes?.length} scopes
          </p>
        </div>
      </div>
      <button
        onClick={() => disconnectVercel(userId)}
        className="text-sm text-red-600 hover:text-red-800"
      >
        Disconnect
      </button>
    </div>
  );
}
```

### 2. Project Linking Component

```tsx
interface ProjectLinkingProps {
  projectId: string;
  userId: string;
  onLinked: (mappingId: string) => void;
}

export function ProjectLinking({ projectId, userId, onLinked }: ProjectLinkingProps) {
  const [vercelProjects, setVercelProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    loadVercelProjects();
  }, []);

  const loadVercelProjects = async () => {
    const response = await fetch(
      `/v1/projects/${projectId}/vercel/projects?userId=${userId}`
    );
    const { projects } = await response.json();
    setVercelProjects(projects);
  };

  const handleLink = async () => {
    if (!selectedProject) return;
    
    setLinking(true);
    try {
      const response = await fetch(`/v1/projects/${projectId}/vercel/projects/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          vercelProjectId: selectedProject.id,
          autoDeployEnabled: true
        })
      });

      const { linked, mappingId } = await response.json();
      if (linked) {
        onLinked(mappingId);
      }
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">
          Select Vercel Project
        </label>
        <select
          value={selectedProject?.id || ''}
          onChange={(e) => setSelectedProject(
            vercelProjects.find(p => p.id === e.target.value)
          )}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Choose a project...</option>
          {vercelProjects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.framework})
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleLink}
        disabled={!selectedProject || linking}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md disabled:opacity-50"
      >
        {linking ? 'Linking...' : 'Link Project'}
      </button>
    </div>
  );
}
```

### 3. Deployment Dashboard Component

```tsx
interface DeploymentDashboardProps {
  projectId: string;
  userId: string;
}

export function DeploymentDashboard({ projectId, userId }: DeploymentDashboardProps) {
  const [deployments, setDeployments] = useState([]);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    loadDeployments();
    const interval = setInterval(loadDeployments, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  const loadDeployments = async () => {
    const response = await fetch(
      `/v1/projects/${projectId}/vercel/deployments?userId=${userId}&limit=10`
    );
    const { deployments } = await response.json();
    setDeployments(deployments);
  };

  const handleDeploy = async (type: 'production' | 'preview') => {
    setDeploying(true);
    try {
      const response = await fetch(`/v1/projects/${projectId}/vercel/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          deploymentType: type
        })
      });

      const { deployment } = await response.json();
      setDeployments(prev => [deployment, ...prev]);
    } finally {
      setDeploying(false);
    }
  };

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'READY': return 'text-green-600 bg-green-100';
      case 'BUILDING': return 'text-yellow-600 bg-yellow-100';
      case 'ERROR': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <button
          onClick={() => handleDeploy('preview')}
          disabled={deploying}
          className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
        >
          Deploy Preview
        </button>
        <button
          onClick={() => handleDeploy('production')}
          disabled={deploying}
          className="px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-50"
        >
          Deploy Production
        </button>
      </div>

      <div className="space-y-3">
        {deployments.map(deployment => (
          <div key={deployment.id} className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(deployment.state)}`}>
                  {deployment.state}
                </span>
                <span className="font-medium">
                  {deployment.gitSource?.branch || 'Manual Deploy'}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {new Date(deployment.created_at).toLocaleString()}
              </div>
            </div>
            
            {deployment.deployment_url && (
              <a 
                href={deployment.deployment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View Deployment →
              </a>
            )}

            {deployment.state === 'READY' && deployment.deployment_type === 'PREVIEW' && (
              <button
                onClick={() => promoteToProduction(projectId, deployment.deployment_id, userId)}
                className="mt-2 px-3 py-1 text-sm bg-green-600 text-white rounded-md"
              >
                Promote to Production
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4. Auto-Deploy Configuration Component

```tsx
interface AutoDeployConfigProps {
  projectId: string;
  userId: string;
}

export function AutoDeployConfig({ projectId, userId }: AutoDeployConfigProps) {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const response = await fetch(
      `/v1/projects/${projectId}/vercel/auto-deploy/config?userId=${userId}`
    );
    const { config } = await response.json();
    setConfig(config);
  };

  const handleSave = async (updates: Partial<typeof config>) => {
    setSaving(true);
    try {
      await fetch(`/v1/projects/${projectId}/vercel/auto-deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...updates })
      });
      setConfig(prev => ({ ...prev, ...updates }));
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Auto-Deploy Configuration</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleSave({ enabled: e.target.checked })}
          />
          <span>Enable Auto-Deploy</span>
        </label>
      </div>

      {config.enabled && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Branch Patterns
            </label>
            <input
              type="text"
              value={config.branchPatterns?.join(', ') || ''}
              onChange={(e) => handleSave({ 
                branchPatterns: e.target.value.split(',').map(s => s.trim()) 
              })}
              placeholder="main, develop, feature/*"
              className="w-full p-2 border rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated list of branch patterns. Use * for wildcards.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Target Environment
            </label>
            <select
              value={config.targetEnvironment}
              onChange={(e) => handleSave({ targetEnvironment: e.target.value })}
              className="w-full p-2 border rounded-md"
            >
              <option value="auto">Auto (main → production, others → preview)</option>
              <option value="production">Always Production</option>
              <option value="preview">Always Preview</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.requiresApproval}
              onChange={(e) => handleSave({ requiresApproval: e.target.checked })}
            />
            <label className="text-sm">Require approval for deployments</label>
          </div>

          <button
            onClick={() => handleSave(config)}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Error Handling

### Common Error Patterns

**1. Connection Errors**
```typescript
const handleApiCall = async (apiCall: () => Promise<Response>) => {
  try {
    const response = await apiCall();
    
    if (response.status === 401) {
      // Token expired or invalid
      return { error: 'Please reconnect your Vercel account', code: 'AUTH_REQUIRED' };
    }
    
    if (response.status === 403) {
      // Insufficient permissions
      const { code } = await response.json();
      if (code === 'INSUFFICIENT_SCOPE') {
        return { error: 'Additional permissions required', code, action: 'RECONNECT' };
      }
    }
    
    if (response.status === 429) {
      // Rate limited
      const { retryAfter } = await response.json();
      return { error: `Rate limited. Try again in ${retryAfter}s`, code: 'RATE_LIMITED' };
    }
    
    if (response.status >= 500) {
      // Server error
      return { error: 'Service temporarily unavailable', code: 'SERVER_ERROR' };
    }
    
    return await response.json();
    
  } catch (error) {
    return { error: 'Network error', code: 'NETWORK_ERROR' };
  }
};
```

**2. Deployment Errors**
```typescript
const handleDeploymentError = (deployment: any) => {
  switch (deployment.error_code) {
    case 'BUILD_FAILED':
      return {
        title: 'Build Failed',
        message: 'Your build encountered errors. Check the build logs for details.',
        action: 'View Build Logs',
        actionUrl: deployment.build_logs_url
      };
      
    case 'DEPLOYMENT_TIMEOUT':
      return {
        title: 'Deployment Timeout',
        message: 'Deployment took too long and was canceled.',
        action: 'Retry Deployment'
      };
      
    default:
      return {
        title: 'Deployment Error',
        message: deployment.error_message || 'An unknown error occurred',
        action: 'Contact Support'
      };
  }
};
```

**3. Domain Verification Errors**
```typescript
const handleDomainError = (domain: any) => {
  switch (domain.verification_status) {
    case 'PENDING':
      return {
        status: 'pending',
        message: 'Add the DNS records and click verify',
        records: domain.verification_records
      };
      
    case 'FAILED':
      return {
        status: 'failed',
        message: 'DNS verification failed. Check your DNS settings.',
        troubleshoot: 'Ensure DNS records are correctly configured'
      };
      
    case 'VERIFIED':
      return {
        status: 'verified',
        message: 'Domain verified successfully'
      };
  }
};
```

### Error UI Components

```tsx
interface ErrorBoundaryProps {
  error: string;
  code?: string;
  action?: string;
  onAction?: () => void;
  onRetry?: () => void;
}

export function ErrorBoundary({ error, code, action, onAction, onRetry }: ErrorBoundaryProps) {
  return (
    <div className="p-4 border border-red-200 rounded-lg bg-red-50">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="font-medium text-red-800">Error</p>
          <p className="text-red-700 text-sm">{error}</p>
          {code && (
            <p className="text-red-600 text-xs font-mono mt-1">Code: {code}</p>
          )}
        </div>
      </div>
      
      {(action || onRetry) && (
        <div className="mt-3 flex gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded-md"
            >
              Retry
            </button>
          )}
          {action && onAction && (
            <button
              onClick={onAction}
              className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded-md"
            >
              {action}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Real-time Updates

### Webhook Event Processing

The backend processes webhooks from Vercel and git providers. Frontend should poll for updates during deployments:

```typescript
const useDeploymentUpdates = (projectId: string, userId: string) => {
  const [deployments, setDeployments] = useState([]);
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const pollUpdates = async () => {
      const response = await fetch(
        `/v1/projects/${projectId}/vercel/deployments?userId=${userId}&limit=5`
      );
      const { deployments } = await response.json();
      setDeployments(deployments);
      
      // Stop polling if no active deployments
      const hasActive = deployments.some(d => 
        ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(d.state)
      );
      
      if (!hasActive && interval) {
        clearInterval(interval);
      }
    };
    
    // Poll every 5 seconds during active deployments
    const activeDeployments = deployments.filter(d => 
      ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(d.state)
    );
    
    if (activeDeployments.length > 0) {
      interval = setInterval(pollUpdates, 5000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [deployments, projectId, userId]);
  
  return deployments;
};
```

### Server-Sent Events (Future Enhancement)

For real-time updates, consider implementing SSE:

```typescript
const useRealTimeDeployments = (projectId: string, userId: string) => {
  const [deployments, setDeployments] = useState([]);
  
  useEffect(() => {
    const eventSource = new EventSource(
      `/v1/projects/${projectId}/vercel/deployments/stream?userId=${userId}`
    );
    
    eventSource.addEventListener('deployment-update', (event) => {
      const deployment = JSON.parse(event.data);
      setDeployments(prev => 
        prev.map(d => d.id === deployment.id ? deployment : d)
      );
    });
    
    return () => eventSource.close();
  }, [projectId, userId]);
  
  return deployments;
};
```

---

## Performance Best Practices

### 1. Caching Strategy

**Cache Connection Status**
```typescript
const useVercelConnection = (userId: string) => {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Check cache first
    const cached = localStorage.getItem(`vercel-connection-${userId}`);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Cache for 5 minutes
      if (Date.now() - timestamp < 5 * 60 * 1000) {
        setConnection(data);
        setLoading(false);
        return;
      }
    }
    
    // Fetch fresh data
    checkConnection();
  }, [userId]);
  
  const checkConnection = async () => {
    const response = await fetch(`/v1/internal/vercel/oauth/status?userId=${userId}`);
    const data = await response.json();
    
    // Cache the result
    localStorage.setItem(`vercel-connection-${userId}`, JSON.stringify({
      data: data.connection,
      timestamp: Date.now()
    }));
    
    setConnection(data.connection);
    setLoading(false);
  };
  
  return { connection, loading, refresh: checkConnection };
};
```

**Paginated Data Loading**
```typescript
const useVercelProjects = (projectId: string, userId: string) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const loadMore = async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    const params = new URLSearchParams({
      userId,
      limit: '20',
      ...(cursor && { cursor })
    });
    
    const response = await fetch(
      `/v1/projects/${projectId}/vercel/projects?${params}`
    );
    const { projects: newProjects, pagination } = await response.json();
    
    setProjects(prev => cursor ? [...prev, ...newProjects] : newProjects);
    setCursor(pagination.next);
    setHasMore(!!pagination.next);
    setLoading(false);
  };
  
  return { projects, loading, hasMore, loadMore };
};
```

### 2. Optimistic Updates

```typescript
const useOptimisticDeployment = () => {
  const [deployments, setDeployments] = useState([]);
  
  const createDeployment = async (projectId: string, options: any) => {
    // Optimistic update
    const optimisticDeployment = {
      id: `temp-${Date.now()}`,
      state: 'QUEUED',
      deployment_type: options.deploymentType,
      created_at: new Date().toISOString(),
      optimistic: true
    };
    
    setDeployments(prev => [optimisticDeployment, ...prev]);
    
    try {
      const response = await fetch(`/v1/projects/${projectId}/vercel/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      
      const { deployment } = await response.json();
      
      // Replace optimistic with real deployment
      setDeployments(prev => 
        prev.map(d => d.id === optimisticDeployment.id ? deployment : d)
      );
    } catch (error) {
      // Remove optimistic update on error
      setDeployments(prev => 
        prev.filter(d => d.id !== optimisticDeployment.id)
      );
      throw error;
    }
  };
  
  return { deployments, createDeployment };
};
```

### 3. Bundle Size Optimization

**Lazy Load Vercel Components**
```typescript
import { lazy, Suspense } from 'react';

const VercelIntegration = lazy(() => import('./components/VercelIntegration'));

export function ProjectSettings() {
  return (
    <div>
      <Suspense fallback={<div>Loading Vercel integration...</div>}>
        <VercelIntegration />
      </Suspense>
    </div>
  );
}
```

**Code Splitting by Feature**
```typescript
// utils/vercel.ts - Keep API calls separate
export const vercelApi = {
  getConnection: (userId: string) => fetch(`/v1/internal/vercel/oauth/status?userId=${userId}`),
  // ... other API calls
};

// components/VercelConnection.tsx - UI components only
export { VercelConnection };

// hooks/useVercel.ts - React hooks
export { useVercelConnection, useDeployments };
```

---

## Security Considerations

### 1. Token Management

- All OAuth tokens are encrypted on the backend
- Frontend never handles raw OAuth tokens
- Use secure HTTP-only cookies for authentication
- Implement proper CSRF protection

### 2. Production Deployment Safety

```typescript
const deployToProduction = async (projectId: string, deploymentId: string) => {
  // Always require explicit confirmation for production
  const confirmed = await confirmProductionDeployment({
    environment: 'production',
    branch: deployment.gitSource?.branch,
    hasTests: deployment.metadata?.testsRan
  });
  
  if (!confirmed) return;
  
  return await promoteToProduction(projectId, deploymentId, userId);
};

const confirmProductionDeployment = ({ environment, branch, hasTests }: any) => {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    // Render confirmation modal
    const confirmed = confirm(
      `Deploy to ${environment}?\n\n` +
      `Branch: ${branch}\n` +
      `Tests: ${hasTests ? 'Passed' : 'Not run'}\n\n` +
      `This will update your live website.`
    );
    resolve(confirmed);
  });
};
```

### 3. Environment Variable Handling

```typescript
const syncEnvironmentVariables = async (options: {
  target: 'production' | 'preview' | 'development';
  showDiff: boolean;
}) => {
  // Always preview changes first
  const response = await fetch('/v1/projects/:id/vercel/env/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      ...options, 
      dryRun: true // Always dry run first
    })
  });
  
  const { changes } = await response.json();
  
  if (options.target === 'production' && changes.length > 0) {
    const confirmed = await showEnvSyncDiff(changes);
    if (!confirmed) return;
  }
  
  // Execute actual sync
  return fetch('/v1/projects/:id/vercel/env/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...options, dryRun: false })
  });
};
```

---

## Testing Recommendations

### 1. Mock API Responses

```typescript
// __mocks__/vercel-api.ts
export const mockVercelApi = {
  '/v1/internal/vercel/oauth/status': {
    connected: true,
    connection: {
      teamName: 'Test Team',
      accountType: 'team',
      scopes: ['project:read', 'deployment:write'],
      status: 'connected'
    }
  },
  
  '/v1/projects/:id/vercel/projects': {
    projects: [
      {
        id: 'prj_123',
        name: 'my-next-app',
        framework: 'nextjs',
        nodeVersion: '18.x'
      }
    ],
    pagination: { next: null }
  }
};
```

### 2. Component Testing

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VercelConnection } from './VercelConnection';

describe('VercelConnection', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('shows connect button when not connected', async () => {
    fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ connected: false })
    });

    render(<VercelConnection userId="user-123" onConnectionChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Connect Vercel')).toBeInTheDocument();
    });
  });

  it('starts OAuth flow when connect clicked', async () => {
    fetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ connected: false })
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ 
          authorizationUrl: 'https://vercel.com/oauth/authorize?...'
        })
      });

    render(<VercelConnection userId="user-123" onConnectionChange={jest.fn()} />);

    await waitFor(() => screen.getByText('Connect Vercel'));
    
    fireEvent.click(screen.getByText('Connect Vercel'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/v1/internal/vercel/oauth/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-123' })
      });
    });
  });
});
```

---

## Implementation Roadmap

### Phase 1: Core Connection (Week 1)
- [ ] Implement OAuth connection flow
- [ ] Add connection status indicator
- [ ] Handle team vs personal account selection
- [ ] Add disconnect functionality

### Phase 2: Project Management (Week 1-2)
- [ ] Project linking UI with Vercel project selection
- [ ] Project configuration sync
- [ ] Framework detection and settings
- [ ] Environment target configuration

### Phase 3: Deployment Operations (Week 2-3)
- [ ] Manual deployment triggers
- [ ] Deployment status dashboard with real-time updates
- [ ] Production promotion workflow
- [ ] Build log viewing
- [ ] Deployment cancellation

### Phase 4: Auto-Deploy Configuration (Week 3)
- [ ] Branch pattern configuration UI
- [ ] Deployment rule management
- [ ] Auto-deploy testing interface
- [ ] Approval workflow setup

### Phase 5: Domain Management (Week 3-4)
- [ ] Custom domain addition
- [ ] DNS verification wizard
- [ ] SSL certificate status
- [ ] Domain health monitoring

### Phase 6: Environment Variables (Week 4)
- [ ] Environment variable listing
- [ ] Bidirectional sync interface with diff preview
- [ ] Production confirmation dialogs
- [ ] Sensitive variable masking

### Phase 7: Build Optimization (Week 4-5)
- [ ] Performance analysis dashboard
- [ ] Optimization recommendations display
- [ ] Benchmark comparisons
- [ ] Trend analysis charts

### Phase 8: Polish & Testing (Week 5-6)
- [ ] Error handling improvements
- [ ] Loading states and skeletons
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Accessibility improvements

---

## Conclusion

This guide provides a comprehensive foundation for implementing the Vercel integration frontend. The backend provides production-ready APIs with enterprise-grade security, error handling, and performance optimization.

**Key Success Factors:**
1. **Progressive Enhancement** - Start with core connection and build up features
2. **Error Resilience** - Handle all error states gracefully with clear user guidance
3. **Performance** - Use caching, pagination, and optimistic updates appropriately
4. **Security** - Never compromise on production safety and user data protection
5. **User Experience** - Provide clear feedback, loading states, and intuitive workflows

The backend is ready for production use with comprehensive logging, monitoring, and safety features. Follow this guide to build a seamless, professional Vercel integration experience for your users.