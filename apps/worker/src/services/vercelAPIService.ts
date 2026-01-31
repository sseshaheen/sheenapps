import { VercelOAuthService } from './vercelOAuthService';
import { ServerLoggingService } from './serverLoggingService';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

// Shared Redis client to prevent connection storms
let sharedRedisClient: Redis | null = null;

function getSharedRedisClient(): Redis {
  if (!sharedRedisClient) {
    sharedRedisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
    sharedRedisClient.on('error', (err) => {
      console.error('[VercelAPI] Redis connection error:', err.message);
    });
  }
  return sharedRedisClient;
}

/**
 * Vercel API Service
 * Handles all interactions with the Vercel REST API
 * Includes project management, deployments, environment variables, and domains
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  framework?: string;
  nodeVersion?: string;
  createdAt: string;
  updatedAt: string;
  link?: {
    type: 'github' | 'gitlab' | 'bitbucket';
    repo: string;
    org: string;
    repoId: string;
  };
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
  devCommand?: string;
  rootDirectory?: string;
  publicSource?: boolean;
}

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  created: string;
  source: 'import' | 'git' | 'clone';
  state: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  type: 'LAMBDAS';
  target?: 'production' | 'staging';
  aliasAssigned?: boolean;
  aliasError?: {
    code: string;
    message: string;
  };
  meta?: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitAuthorName?: string;
    githubCommitRef?: string;
    githubPrId?: string;
    buildEnv?: string[];
  };
  plan: 'hobby' | 'pro' | 'enterprise';
  regions: string[];
  functions?: Record<string, any>;
  ready?: number;
  buildingAt?: number;
  createdAt: string;
}

export interface VercelEnvVariable {
  id: string;
  key: string;
  value?: string; // Only returned in certain contexts
  target: ('production' | 'preview' | 'development')[];
  configurationId?: string;
  updatedAt: string;
  createdAt: string;
  type: 'secret' | 'system' | 'plain';
}

export interface VercelDomain {
  name: string;
  serviceType: string;
  nsVerifiedAt?: string;
  txtVerifiedAt?: string;
  cdnEnabled: boolean;
  createdAt: string;
  verification?: {
    type: string;
    domain: string;
    value: string;
    reason: string;
  }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    count: number;
    next?: string;
    prev?: string;
  };
}

export interface ProjectConfig {
  name: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
  devCommand?: string;
  rootDirectory?: string;
  environmentVariables?: {
    key: string;
    value: string;
    target: ('production' | 'preview' | 'development')[];
    type?: 'secret' | 'plain';
  }[];
  gitRepository?: {
    type: 'github' | 'gitlab' | 'bitbucket';
    repo: string;
  };
}

export interface DeploymentFiles {
  [path: string]: {
    file: string; // base64 encoded content
    encoding?: 'base64' | 'utf-8';
  };
}

export interface DeployOptions {
  name: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  files?: DeploymentFiles | undefined;
  gitSource?: {
    type: 'github' | 'gitlab' | 'bitbucket';
    repo: string;
    ref: string;
    sha?: string | undefined;
  } | undefined;
  projectSettings?: {
    framework?: string | undefined;
    buildCommand?: string | undefined;
    outputDirectory?: string | undefined;
  } | undefined;
  target?: 'production' | 'preview' | undefined;
  regions?: string[] | undefined;
}

export interface VercelEvent {
  id?: string;
  type: 'stdout' | 'stderr' | 'build-start' | 'build-end' | 'ready' | 'error';
  timestamp?: number;
  payload?: any;
  serial?: number;
  text?: string;
}

export interface StreamOptions {
  since?: string;
  follow?: boolean;
  timeout?: number;
}

export interface ResumeState {
  lastEventId?: string;
  lastTimestamp?: number;
}

export interface EnvSyncDiff {
  added: { key: string; targets: string[]; encrypted: boolean }[];
  modified: { key: string; targets: string[]; encrypted: boolean }[];
  removed: { key: string; targets: string[] }[];
  conflicts: { key: string; localValue: string; remoteValue: string }[];
}

export interface DryRunResult {
  wouldApply: boolean;
  changes: EnvSyncDiff;
  warnings: string[];
  requiresConfirmation: boolean;
}

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

export class VercelAPIService {
  private static instance: VercelAPIService;
  private readonly oauthService: VercelOAuthService;
  private readonly loggingService: ServerLoggingService;
  private readonly baseUrl = 'https://api.vercel.com';
  private readonly circuitBreakerThreshold = 5;
  private readonly retryDelays = [1000, 2000, 4000]; // Progressive backoff
  private readonly lastProcessedEvents = new Map<string, { lastEventId: string; timestamp: number }>();
  private readonly correlationIds = new Map<string, string>(); // connectionId -> correlationId
  private readonly circuitBreakerStates = new Map<string, { failures: number; lastFailure: number; isOpen: boolean }>();

  // Throttle state for persistResumeState - only write every 500ms or on significant events
  private readonly resumeStateThrottle = new Map<string, { lastWrite: number; pending: ResumeState | null }>();
  private readonly RESUME_STATE_THROTTLE_MS = 500;

  // TTL for in-memory maps (1 hour)
  private readonly MAP_TTL_MS = 60 * 60 * 1000;
  private lastCleanupTime = Date.now();

  constructor() {
    this.oauthService = VercelOAuthService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();

    // Periodic cleanup of stale map entries
    this.scheduleMapCleanup();
  }

  /**
   * Schedule periodic cleanup of in-memory maps to prevent memory leaks
   */
  private scheduleMapCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.MAP_TTL_MS;

      // Clean lastProcessedEvents
      for (const [key, value] of this.lastProcessedEvents) {
        if (value.timestamp < cutoff) {
          this.lastProcessedEvents.delete(key);
        }
      }

      // Clean correlationIds (no timestamp, so clean entries older than TTL based on size)
      if (this.correlationIds.size > 1000) {
        // Keep only most recent 500 entries by clearing all
        this.correlationIds.clear();
      }

      // Clean circuitBreakerStates
      for (const [key, value] of this.circuitBreakerStates) {
        if (value.lastFailure > 0 && value.lastFailure < cutoff) {
          this.circuitBreakerStates.delete(key);
        }
      }

      // Clean resumeStateThrottle
      for (const [key, value] of this.resumeStateThrottle) {
        if (value.lastWrite < cutoff) {
          this.resumeStateThrottle.delete(key);
        }
      }

      this.lastCleanupTime = now;
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  static getInstance(): VercelAPIService {
    if (!VercelAPIService.instance) {
      VercelAPIService.instance = new VercelAPIService();
    }
    return VercelAPIService.instance;
  }

  // =============================================================================
  // HTTP HELPERS WITH CIRCUIT BREAKER
  // =============================================================================

  private async makeAuthenticatedRequest(
    connectionId: string,
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    // Check circuit breaker
    await this.checkCircuitBreaker(connectionId);

    // Get valid tokens (handles refresh automatically)
    const tokens = await this.oauthService.getValidTokens(connectionId);

    const url = `${this.baseUrl}${path}`;
    const startTime = Date.now();

    // Respect caller's signal if provided, otherwise use timeout
    // If caller provides signal, they're responsible for timeout
    const signal = options.signal || AbortSignal.timeout(30000);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Correlation-ID': this.getOrCreateCorrelationId(connectionId),
          ...options.headers
        },
        signal
      });

      const latency = Date.now() - startTime;

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
        
        await this.loggingService.logServerEvent(
          'capacity', 
          'warn',
          'Vercel API rate limited',
          { connectionId, path, retryAfter, latency }
        );

        throw new VercelAPIError(`Rate limited. Retry after ${delay/1000}s`, 'RATE_LIMITED', delay);
      }

      // Record successful call
      await this.recordApiCall(connectionId, true);

      return response;

    } catch (error) {
      // Record failed call
      await this.recordApiCall(connectionId, false);

      if (error instanceof VercelAPIError) {
        throw error;
      }

      throw new VercelAPIError(
        `API request failed: ${(error as Error).message}`,
        'REQUEST_FAILED'
      );
    }
  }

  private async checkCircuitBreaker(connectionId: string): Promise<void> {
    const state = this.circuitBreakerStates.get(connectionId);
    if (!state) {
      this.circuitBreakerStates.set(connectionId, { failures: 0, lastFailure: 0, isOpen: false });
      return;
    }

    // Circuit breaker logic
    if (state.isOpen) {
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      const cooldownPeriod = 60000; // 1 minute cooldown
      
      if (timeSinceLastFailure < cooldownPeriod) {
        throw new VercelAPIError(
          'Circuit breaker open - too many consecutive failures',
          'CIRCUIT_BREAKER_OPEN'
        );
      } else {
        // Half-open: allow one request
        state.isOpen = false;
      }
    }
  }

  private async recordApiCall(connectionId: string, success: boolean): Promise<void> {
    const state = this.circuitBreakerStates.get(connectionId) || 
      { failures: 0, lastFailure: 0, isOpen: false };

    if (success) {
      // Reset on success
      state.failures = 0;
      state.isOpen = false;
    } else {
      state.failures++;
      state.lastFailure = Date.now();
      
      // Open circuit breaker if threshold exceeded
      if (state.failures >= this.circuitBreakerThreshold) {
        state.isOpen = true;
        await this.loggingService.logServerEvent(
          'capacity',
          'warn',
          'Vercel API circuit breaker opened',
          { connectionId, failures: state.failures, threshold: this.circuitBreakerThreshold }
        );
      }
    }

    this.circuitBreakerStates.set(connectionId, state);
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) break;
        if (error instanceof VercelAPIError && error.code === 'RATE_LIMITED') {
          // Don't retry rate limit errors immediately
          throw error;
        }

        const delay = this.retryDelays[attempt] || 8000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  // =============================================================================
  // PROJECT MANAGEMENT
  // =============================================================================

  /**
   * List user's Vercel projects with pagination
   */
  async listProjects(
    connectionId: string,
    options: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      teamId?: string | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    } = {}
  ): Promise<PaginatedResponse<VercelProject>> {
    await this.oauthService.requireScope(connectionId, 'project:read');

    const params = new URLSearchParams();
    if (options.teamId) params.append('teamId', options.teamId);
    if (options.cursor) params.append('since', options.cursor);
    if (options.limit) params.append('limit', options.limit.toString());

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects?${params.toString()}`
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to list projects: ${response.statusText}`,
        'LIST_PROJECTS_FAILED'
      );
    }

    const data = await response.json();
    
    return {
      data: data.projects || [],
      pagination: {
        count: data.projects?.length || 0,
        next: data.pagination?.next,
        prev: data.pagination?.prev
      }
    };
  }

  /**
   * Get specific project details
   */
  async getProject(connectionId: string, projectId: string): Promise<VercelProject> {
    await this.oauthService.requireScope(connectionId, 'project:read');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new VercelAPIError('Project not found', 'PROJECT_NOT_FOUND');
      }
      throw new VercelAPIError(
        `Failed to get project: ${response.statusText}`,
        'GET_PROJECT_FAILED'
      );
    }

    return await response.json();
  }

  /**
   * Create new Vercel project
   */
  async createProject(connectionId: string, config: ProjectConfig): Promise<VercelProject> {
    await this.oauthService.requireScope(connectionId, 'project:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      '/v10/projects',
      {
        method: 'POST',
        body: JSON.stringify(config)
      }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to create project: ${response.statusText}`,
        'CREATE_PROJECT_FAILED'
      );
    }

    const project = await response.json();
    
    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Vercel project created successfully',
      { connectionId, projectId: project.id, projectName: project.name }
    );

    return project;
  }

  /**
   * Update project settings
   */
  async updateProject(
    connectionId: string, 
    projectId: string, 
    updates: Partial<ProjectConfig>
  ): Promise<VercelProject> {
    await this.oauthService.requireScope(connectionId, 'project:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to update project: ${response.statusText}`,
        'UPDATE_PROJECT_FAILED'
      );
    }

    return await response.json();
  }

  // =============================================================================
  // DEPLOYMENT MANAGEMENT
  // =============================================================================

  /**
   * List project deployments with pagination
   */
  async listDeployments(
    connectionId: string,
    projectId: string,
    options: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      cursor?: string | undefined;
      limit?: number | undefined;
      target?: 'production' | 'preview' | undefined;
    } = {}
  ): Promise<PaginatedResponse<VercelDeployment>> {
    await this.oauthService.requireScope(connectionId, 'deployment:read');

    const params = new URLSearchParams({ projectId });
    if (options.cursor) params.append('until', options.cursor);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.target) params.append('target', options.target);

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v6/deployments?${params.toString()}`
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to list deployments: ${response.statusText}`,
        'LIST_DEPLOYMENTS_FAILED'
      );
    }

    const data = await response.json();
    
    return {
      data: data.deployments || [],
      pagination: {
        count: data.deployments?.length || 0,
        next: data.pagination?.next,
        prev: data.pagination?.prev
      }
    };
  }

  /**
   * Create new deployment
   */
  async createDeployment(
    connectionId: string, 
    options: DeployOptions
  ): Promise<VercelDeployment> {
    await this.oauthService.requireScope(connectionId, 'deployment:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      '/v13/deployments',
      {
        method: 'POST',
        body: JSON.stringify(options)
      }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to create deployment: ${response.statusText}`,
        'CREATE_DEPLOYMENT_FAILED'
      );
    }

    const deployment = await response.json();
    
    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Vercel deployment created',
      { connectionId, deploymentId: deployment.uid, projectName: deployment.name }
    );

    return deployment;
  }

  /**
   * Get deployment details
   */
  async getDeployment(connectionId: string, deploymentId: string): Promise<VercelDeployment> {
    await this.oauthService.requireScope(connectionId, 'deployment:read');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v13/deployments/${deploymentId}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new VercelAPIError('Deployment not found', 'DEPLOYMENT_NOT_FOUND');
      }
      throw new VercelAPIError(
        `Failed to get deployment: ${response.statusText}`,
        'GET_DEPLOYMENT_FAILED'
      );
    }

    return await response.json();
  }

  /**
   * Cancel deployment
   */
  async cancelDeployment(connectionId: string, deploymentId: string): Promise<void> {
    await this.oauthService.requireScope(connectionId, 'deployment:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v12/deployments/${deploymentId}/cancel`,
      { method: 'PATCH' }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to cancel deployment: ${response.statusText}`,
        'CANCEL_DEPLOYMENT_FAILED'
      );
    }

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Vercel deployment canceled',
      { connectionId, deploymentId }
    );
  }

  // =============================================================================
  // ENVIRONMENT VARIABLES
  // =============================================================================

  /**
   * List project environment variables (values never returned for security)
   */
  async listEnvVars(
    connectionId: string,
    projectId: string
  ): Promise<VercelEnvVariable[]> {
    await this.oauthService.requireScope(connectionId, 'env:read');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}/env`
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to list environment variables: ${response.statusText}`,
        'LIST_ENV_VARS_FAILED'
      );
    }

    const data = await response.json();
    return data.envs || [];
  }

  /**
   * Create environment variable
   */
  async createEnvVar(
    connectionId: string,
    projectId: string,
    env: {
      key: string;
      value: string;
      target: ('production' | 'preview' | 'development')[];
      type?: 'secret' | 'plain';
    }
  ): Promise<VercelEnvVariable> {
    await this.oauthService.requireScope(connectionId, 'env:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v10/projects/${projectId}/env`,
      {
        method: 'POST',
        body: JSON.stringify(env)
      }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to create environment variable: ${response.statusText}`,
        'CREATE_ENV_VAR_FAILED'
      );
    }

    return await response.json();
  }

  /**
   * Update environment variable
   */
  async updateEnvVar(
    connectionId: string,
    projectId: string,
    envId: string,
    updates: {
      key?: string;
      value?: string;
      target?: ('production' | 'preview' | 'development')[];
    }
  ): Promise<VercelEnvVariable> {
    await this.oauthService.requireScope(connectionId, 'env:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}/env/${envId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to update environment variable: ${response.statusText}`,
        'UPDATE_ENV_VAR_FAILED'
      );
    }

    return await response.json();
  }

  /**
   * Delete environment variable
   */
  async deleteEnvVar(connectionId: string, projectId: string, envId: string): Promise<void> {
    await this.oauthService.requireScope(connectionId, 'env:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}/env/${envId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to delete environment variable: ${response.statusText}`,
        'DELETE_ENV_VAR_FAILED'
      );
    }
  }

  // =============================================================================
  // HEALTH & UTILITIES
  // =============================================================================

  /**
   * Check Vercel API health
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async healthCheck(): Promise<{ available: boolean; latency?: number | undefined; error?: string | undefined }> {
    try {
      const startTime = Date.now();
      
      // Simple GET request to a public endpoint
      const response = await fetch(`${this.baseUrl}/v2/user`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout for health check
      });

      const latency = Date.now() - startTime;

      // We expect 401 for unauthorized, which means API is working
      const available = response.status === 401 || response.status < 500;

      return {
        available,
        latency,
        error: available ? undefined : `HTTP ${response.status}`
      };

    } catch (error) {
      return {
        available: false,
        error: (error as Error).message
      };
    }
  }

  // =============================================================================
  // DOMAIN MANAGEMENT METHODS
  // =============================================================================

  /**
   * List domains for a project
   */
  async listDomains(
    connectionId: string,
    projectId: string,
    options?: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      cursor?: string | undefined;
      limit?: number | undefined;
    }
  ): Promise<any> {
    // Note: Vercel doesn't have a specific domain scope - uses project:read
    await this.oauthService.requireScope(connectionId, 'project:read');

    const params = new URLSearchParams();
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', options.limit.toString());

    const queryString = params.toString();
    const path = `/v9/projects/${projectId}/domains${queryString ? '?' + queryString : ''}`;

    const response = await this.makeAuthenticatedRequest(connectionId, path);

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to list domains: ${response.statusText}`,
        'LIST_DOMAINS_FAILED'
      );
    }

    return await response.json();
  }

  /**
   * Add a domain to a project
   */
  async addDomain(connectionId: string, projectId: string, domain: string, gitBranch?: string): Promise<any> {
    await this.oauthService.requireScope(connectionId, 'project:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}/domains`,
      {
        method: 'POST',
        body: JSON.stringify({ name: domain, gitBranch })
      }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to add domain: ${response.statusText}`,
        'ADD_DOMAIN_FAILED'
      );
    }

    return await response.json();
  }

  /**
   * Verify domain configuration
   */
  async verifyDomain(connectionId: string, projectId: string, domain: string): Promise<any> {
    await this.oauthService.requireScope(connectionId, 'project:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}/domains/${domain}/verify`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to verify domain: ${response.statusText}`,
        'VERIFY_DOMAIN_FAILED'
      );
    }

    return await response.json();
  }

  /**
   * Remove a domain from a project
   */
  async removeDomain(connectionId: string, projectId: string, domain: string): Promise<any> {
    await this.oauthService.requireScope(connectionId, 'project:write');

    const response = await this.makeAuthenticatedRequest(
      connectionId,
      `/v9/projects/${projectId}/domains/${domain}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new VercelAPIError(
        `Failed to remove domain: ${response.statusText}`,
        'REMOVE_DOMAIN_FAILED'
      );
    }

    return response.status === 204 ? {} : await response.json();
  }

  // =============================================================================
  // STREAMING EVENTS API (Phase 3 Implementation)
  // =============================================================================

  /**
   * Stream deployment events with recovery and deduplication
   * Expert-refined implementation with memory safety and resume capability
   */
  async *streamDeploymentEvents(
    connectionId: string,
    deploymentId: string,
    options: StreamOptions = {}
  ): AsyncGenerator<VercelEvent> {
    const MAX_RETRIES = 3;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      let abortController: AbortController | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      
      try {
        abortController = new AbortController();
        
        // Resume from last processed event
        const resumeParams = await this.getResumeState(deploymentId);
        const url = `${this.baseUrl}/v3/deployments/${deploymentId}/events`;
        const params = new URLSearchParams();
        params.set('follow', options.follow ? '1' : '0');
        if (resumeParams?.lastTimestamp) {
          params.set('since', resumeParams.lastTimestamp.toString());
        }
        if (options.since) {
          params.set('since', options.since);
        }
        if (options.timeout) {
          params.set('timeout', options.timeout.toString());
        }

        const tokens = await this.oauthService.getValidTokens(connectionId);
        const response = await fetch(`${url}?${params}`, {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Accept': 'application/x-ndjson',
            'X-Correlation-ID': this.getOrCreateCorrelationId(connectionId)
          },
          signal: abortController.signal
        });

        if (!response.ok) {
          if (response.status >= 500 || response.status === 429) {
            const delay = Math.min(1000 * Math.pow(2, retries), 30000) + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
            continue;
          }
          throw new VercelAPIError(`Vercel API error: ${response.status}`, 'STREAM_ERROR');
        }

        if (!response.body) {
          throw new VercelAPIError('No response body for events stream', 'STREAM_ERROR');
        }

        reader = response.body.getReader();
        
        // Setup cleanup handlers
        const cleanup = () => {
          try {
            if (abortController && !abortController.signal.aborted) {
              abortController.abort();
            }
            if (reader) {
              reader.cancel().catch(() => {}); // Ignore cleanup errors
            }
          } catch (error) {
            // Ignore cleanup errors
          }
        };

        process.once('SIGTERM', cleanup);
        process.once('SIGINT', cleanup);

        try {
          const textDecoder = new TextDecoder();
          let buffer = '';
          let lastEventId = resumeParams?.lastEventId || '';
          let lastTimestamp = resumeParams?.lastTimestamp || 0;

          for (;;) {
            if (abortController.signal.aborted) {
              break;
            }

            const { value, done } = await reader.read();
            if (done) break;

            buffer += textDecoder.decode(value, { stream: true });
            let newlineIndex;
            
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);

              // Memory protection: skip lines >1MB
              if (line.length > 1024 * 1024) {
                console.warn('[Vercel] Skipping oversized event line:', line.substring(0, 100) + '...');
                continue;
              }

              if (line) {
                try {
                  const event = JSON.parse(line) as VercelEvent;
                  
                  // Deduplication
                  if (event.id && event.id === lastEventId) continue;
                  
                  lastEventId = event.id || Date.now().toString();
                  lastTimestamp = event.timestamp || Date.now();

                  // Apply output redaction
                  if (event.payload) {
                    event.payload = this.redactVercelOutput(event.payload);
                  }

                  // Persist resume state
                  await this.persistResumeState(deploymentId, { lastEventId, lastTimestamp });
                  this.lastProcessedEvents.set(deploymentId, { lastEventId, timestamp: Date.now() });

                  yield event;
                } catch (parseError) {
                  console.warn('[Vercel] Failed to parse event line:', line.substring(0, 100));
                }
              }
            }
          }

          // Final buffer flush
          buffer += textDecoder.decode(new Uint8Array(), { stream: false });
          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer) as VercelEvent;
              if (event.payload) event.payload = this.redactVercelOutput(event.payload);
              yield event;
            } catch (parseError) {
              console.warn('[Vercel] Failed to parse final buffer:', buffer.substring(0, 100));
            }
          }
        } finally {
          // Flush any pending resume state before cleanup
          await this.flushResumeState(deploymentId);
          cleanup();
          process.off('SIGTERM', cleanup);
          process.off('SIGINT', cleanup);
        }

        break; // Success, exit retry loop
        
      } catch (error) {
        retries++;
        if (retries >= MAX_RETRIES) {
          await this.loggingService.logServerEvent(
            'capacity',
            'error', 
            'Vercel events stream failed after retries',
            { deploymentId, retries, error: (error as Error).message }
          );
          throw error;
        }
        
        // Backoff before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * retries));
      }
    }
  }

  /**
   * Create or get stable deployment ID for correlation across retries
   */
  async getOrCreateDeploymentId(buildId: string): Promise<string> {
    try {
      const redis = getSharedRedisClient();
      const key = `vercel:deployment_id:${buildId}`;
      const existing = await redis.get(key);
      if (existing) {
        return existing;
      }

      // Generate stable deploymentId: vercel-${buildId}-${shortULID}
      const shortULID = randomUUID().substring(0, 8);
      const deploymentId = `vercel-${buildId}-${shortULID}`;
      await redis.setex(key, 24 * 60 * 60, deploymentId); // 24h TTL
      return deploymentId;
    } catch (error) {
      console.warn('[Vercel] Failed to persist deploymentId:', error);
      const shortULID = randomUUID().substring(0, 8);
      return `vercel-${buildId}-${shortULID}`; // Fallback
    }
  }

  /**
   * Persist resume state for cross-restart recovery
   * Throttled to prevent Redis connection storms during streaming
   */
  private async persistResumeState(
    deploymentId: string,
    state: ResumeState,
    force = false
  ): Promise<void> {
    const now = Date.now();
    const throttleState = this.resumeStateThrottle.get(deploymentId) || { lastWrite: 0, pending: null };

    // Always update pending state
    throttleState.pending = state;

    // Check if we should write now
    const timeSinceLastWrite = now - throttleState.lastWrite;
    if (!force && timeSinceLastWrite < this.RESUME_STATE_THROTTLE_MS) {
      // Too soon, just store pending state
      this.resumeStateThrottle.set(deploymentId, throttleState);
      return;
    }

    // Write to Redis
    try {
      const redis = getSharedRedisClient();
      const key = `vercel:resume:${deploymentId}`;
      await redis.setex(key, 24 * 60 * 60, JSON.stringify(state)); // 24h TTL
      throttleState.lastWrite = now;
      throttleState.pending = null;
      this.resumeStateThrottle.set(deploymentId, throttleState);
    } catch (error) {
      console.warn('[Vercel] Failed to persist resume state:', error);
    }
  }

  /**
   * Flush any pending resume state (call on stream end)
   */
  private async flushResumeState(deploymentId: string): Promise<void> {
    const throttleState = this.resumeStateThrottle.get(deploymentId);
    if (throttleState?.pending) {
      await this.persistResumeState(deploymentId, throttleState.pending, true);
    }
  }

  /**
   * Get resume state for recovery
   */
  private async getResumeState(deploymentId: string): Promise<ResumeState | null> {
    try {
      const redis = getSharedRedisClient();
      const key = `vercel:resume:${deploymentId}`;
      const state = await redis.get(key);
      return state ? JSON.parse(state) : null;
    } catch (error) {
      console.warn('[Vercel] Failed to get resume state:', error);
      return null;
    }
  }

  /**
   * Redact sensitive information from Vercel output
   */
  private redactVercelOutput(payload: any): any {
    if (typeof payload === 'string') {
      return payload
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
        .replace(/token[=:]\s*[A-Za-z0-9._-]+/gi, 'token=[REDACTED]')
        .replace(/key[=:]\s*[A-Za-z0-9._-]+/gi, 'key=[REDACTED]')
        .replace(/secret[=:]\s*[A-Za-z0-9._-]+/gi, 'secret=[REDACTED]');
    }
    
    if (typeof payload === 'object' && payload !== null) {
      const redacted = { ...payload };
      const sensitiveKeys = ['authorization', 'token', 'key', 'secret', 'password', 'cookie'];
      
      for (const key of Object.keys(redacted)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          redacted[key] = '[REDACTED]';
        } else if (typeof redacted[key] === 'object') {
          redacted[key] = this.redactVercelOutput(redacted[key]);
        }
      }
      return redacted;
    }
    
    return payload;
  }

  /**
   * Get or create correlation ID for request tracking
   */
  private getOrCreateCorrelationId(connectionId: string): string {
    let correlationId = this.correlationIds.get(connectionId);
    if (!correlationId) {
      correlationId = `vcl-${randomUUID().substring(0, 8)}`;
      this.correlationIds.set(connectionId, correlationId);
    }
    return correlationId;
  }
}

// =============================================================================
// CUSTOM ERROR CLASS
// =============================================================================

export class VercelAPIError extends Error {
  constructor(
    message: string, 
    public code?: string, 
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'VercelAPIError';
  }
}