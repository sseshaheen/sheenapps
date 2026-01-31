/**
 * TypeScript types for Vercel Integration API
 * Based on backend API documentation
 */

export interface VercelConnection {
  id: string;
  team_name: string;
  account_type: 'team' | 'personal';
  status: 'connected' | 'disconnected' | 'error';
  granted_scopes: string;
  last_sync_at: string;
  created_at: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string;
  node_version: string;
  git_repository?: {
    type: string;
    url: string;
    production_branch: string;
  };
  domains: VercelDomain[];
  environment_targets: ('production' | 'preview' | 'development')[];
  created_at: string;
  updated_at: string;
}

export interface VercelProjectMapping {
  id: string;
  sheen_project_id: string;
  vercel_project_id: string;
  auto_deploy_enabled: boolean;
  deployment_branch_patterns: string[];
  environment_targets: ('production' | 'preview' | 'development')[];
  webhook_url?: string;
  created_at: string;
  updated_at: string;
}

export interface VercelDeployment {
  id: string;
  deployment_id: string;
  deployment_url: string;
  deployment_type: 'production' | 'preview';
  state: 'QUEUED' | 'INITIALIZING' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  git_source?: {
    branch: string;
    commit_sha: string;
    commit_message: string;
  };
  build_logs_url?: string;
  error_message?: string;
  error_code?: string;
  created_at: string;
  ready_at?: string;
}

export interface VercelDomain {
  id: string;
  domain: string;
  https_redirect: boolean;
  verification_status: 'PENDING' | 'VERIFIED' | 'FAILED';
  verification_records?: Array<{
    type: string;
    name: string;
    value: string;
    ttl?: number;
  }>;
  ssl_status: 'pending' | 'active' | 'error';
  created_at: string;
  verified_at?: string;
}

export interface VercelEnvironmentVariable {
  id: string;
  key: string;
  value: string;
  targets: ('production' | 'preview' | 'development')[];
  type: 'encrypted' | 'plain' | 'system';
  created_at: string;
  updated_at: string;
}

export interface VercelAutoDeploy {
  enabled: boolean;
  branch_patterns: string[];
  target_environment: 'auto' | 'production' | 'preview';
  requires_approval: boolean;
  approval_workflow?: {
    required_reviewers: number;
    auto_merge_enabled: boolean;
  };
}

export interface VercelBuildOptimization {
  analysis: {
    build_time_ms: number;
    bundle_size_bytes: number;
    cache_hit_rate: number;
    performance_score: number;
  };
  recommendations: Array<{
    type: 'performance' | 'security' | 'best-practice';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    implementation_url?: string;
  }>;
  benchmarks: {
    p50_build_time: number;
    p95_build_time: number;
    average_bundle_size: number;
  };
}

// API Response types
export interface VercelOAuthInitiateResponse {
  authorization_url: string;
  state: string;
}

export interface VercelConnectionStatusResponse {
  connected: boolean;
  connections: VercelConnection[];
}

export interface VercelProjectListResponse {
  projects: VercelProject[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface VercelProjectLinkResponse {
  success: boolean;
  mapping: VercelProjectMapping;
  webhook_url?: string;
}

export interface VercelDeploymentResponse {
  success: boolean;
  deployment: VercelDeployment;
}

export interface VercelDeploymentListResponse {
  deployments: VercelDeployment[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// Error types
export interface VercelAPIError {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, any>;
}

// Hook types
export interface UseVercelConnectionOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export interface UseVercelProjectsOptions {
  enabled?: boolean;
  limit?: number;
}

export interface UseVercelDeploymentsOptions {
  enabled?: boolean;
  limit?: number;
  refetchInterval?: number;
}