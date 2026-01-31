/**
 * GitHub API Client
 * Handles communication with Worker GitHub service endpoints
 * Features: HMAC authentication, error handling, rate limiting
 * 
 * SERVER-ONLY MODULE - Do not import in client components
 */

import 'server-only';
import {
  GitHubInstallation,
  GitHubRepository,
  GitHubBranch,
  GitHubCommit,
  GitHubPullRequest,
  ProjectGitHubConfig,
  GitHubSyncOperation,
  GitHubInstallationsResponse,
  GitHubRepositoriesResponse,
  GitHubBranchesResponse,
  GitHubSyncError,
  GitHubSyncMode
} from '@/types/github-sync';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { logger } from '@/utils/logger';

export class GitHubAPIClient {
  private readonly baseUrl: string;
  private static instance: GitHubAPIClient;

  constructor() {
    if (typeof window !== 'undefined') {
      throw new Error('GitHubAPIClient cannot be instantiated in browser context. Use server actions instead.');
    }
    
    this.baseUrl = process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): GitHubAPIClient {
    if (!GitHubAPIClient.instance) {
      GitHubAPIClient.instance = new GitHubAPIClient();
    }
    return GitHubAPIClient.instance;
  }

  /**
   * Make authenticated request to GitHub API endpoints
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    options: {
      body?: any;
      userId?: string;
      query?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { body, userId, query } = options;

    // Build query string
    let queryString = '';
    if (query && Object.keys(query).length > 0) {
      queryString = '?' + new URLSearchParams(query).toString();
    }

    const pathWithQuery = `${path}${queryString}`;
    const requestBody = body ? JSON.stringify(body) : '';
    
    // Generate HMAC auth headers
    const authHeaders = createWorkerAuthHeaders(method, pathWithQuery, requestBody);
    
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeaders,
    };

    // Add user context if provided
    if (userId) {
      const claims = {
        userId,
        roles: ['user'],
        issued: Date.now(),
        expires: Date.now() + (5 * 60 * 1000) // 5 minutes
      };
      requestHeaders['x-sheen-claims'] = Buffer.from(JSON.stringify(claims)).toString('base64');
    }

    const url = `${this.baseUrl}${pathWithQuery}`;
    
    logger.info('GitHub API Request', {
      method,
      path: pathWithQuery,
      userId: userId || 'anonymous'
    });

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody || undefined,
      });

      const responseText = await response.text();
      let data: any;

      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = { message: responseText };
      }

      if (!response.ok) {
        logger.error('GitHub API Error', {
          status: response.status,
          statusText: response.statusText,
          path: pathWithQuery,
          error: data
        });

        const error: GitHubSyncError = {
          code: data?.code || `HTTP_${response.status}`,
          message: data?.message || response.statusText,
          details: data?.details
        };

        throw error;
      }

      logger.info('GitHub API Success', {
        path: pathWithQuery,
        status: response.status
      });

      return data;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        // Already a GitHubSyncError
        throw error;
      }

      logger.error('GitHub API Network Error', {
        path: pathWithQuery,
        error: error instanceof Error ? error.message : String(error)
      });

      throw {
        code: 'NETWORK_ERROR',
        message: `Failed to connect to GitHub service: ${error instanceof Error ? error.message : String(error)}`
      } as GitHubSyncError;
    }
  }

  // Installation management
  async getInstallations(userId: string): Promise<GitHubInstallationsResponse> {
    return this.makeRequest<GitHubInstallationsResponse>('GET', '/v1/github/installations', { userId });
  }

  // Repository management
  async getRepositories(
    installationId: number,
    options: {
      userId: string;
      search?: string;
      cursor?: string;
      limit?: number;
    }
  ): Promise<GitHubRepositoriesResponse> {
    const query: Record<string, string> = {};
    if (options.search) query.search = options.search;
    if (options.cursor) query.cursor = options.cursor;
    if (options.limit) query.limit = options.limit.toString();

    return this.makeRequest<GitHubRepositoriesResponse>(
      'GET',
      `/v1/github/installations/${installationId}/repos`,
      { userId: options.userId, query }
    );
  }

  async getRepository(
    installationId: number,
    repositoryId: number,
    userId: string
  ): Promise<GitHubRepository> {
    return this.makeRequest<GitHubRepository>(
      'GET',
      `/v1/github/installations/${installationId}/repos/${repositoryId}`,
      { userId }
    );
  }

  // Branch management
  async getBranches(
    installationId: number,
    repositoryId: number,
    userId: string
  ): Promise<GitHubBranchesResponse> {
    return this.makeRequest<GitHubBranchesResponse>(
      'GET',
      `/v1/github/installations/${installationId}/repos/${repositoryId}/branches`,
      { userId }
    );
  }

  async createBranch(
    installationId: number,
    repositoryId: number,
    branchName: string,
    fromBranch: string,
    userId: string
  ): Promise<GitHubBranch> {
    return this.makeRequest<GitHubBranch>(
      'POST',
      `/v1/github/installations/${installationId}/repos/${repositoryId}/branches`,
      {
        userId,
        body: {
          name: branchName,
          from: fromBranch
        }
      }
    );
  }

  // Project sync configuration
  async getProjectConfig(projectId: string, userId: string): Promise<ProjectGitHubConfig | null> {
    return this.makeRequest<ProjectGitHubConfig | null>(
      'GET',
      `/v1/github/projects/${projectId}/config`,
      { userId }
    );
  }

  async updateProjectConfig(
    projectId: string,
    config: Partial<ProjectGitHubConfig>,
    userId: string
  ): Promise<ProjectGitHubConfig> {
    return this.makeRequest<ProjectGitHubConfig>(
      'PUT',
      `/v1/github/projects/${projectId}/config`,
      { userId, body: config }
    );
  }

  async deleteProjectConfig(projectId: string, userId: string): Promise<void> {
    await this.makeRequest<void>(
      'DELETE',
      `/v1/github/projects/${projectId}/config`,
      { userId }
    );
  }

  // Sync operations
  async pushToGitHub(
    projectId: string,
    options: {
      commitMessage?: string;
      branch?: string;
      createPR?: boolean;
      prTitle?: string;
      prBody?: string;
    },
    userId: string
  ): Promise<GitHubSyncOperation> {
    return this.makeRequest<GitHubSyncOperation>(
      'POST',
      `/v1/github/projects/${projectId}/push`,
      { userId, body: options }
    );
  }

  async pullFromGitHub(
    projectId: string,
    options: {
      branch?: string;
      commitSha?: string;
    },
    userId: string
  ): Promise<GitHubSyncOperation> {
    return this.makeRequest<GitHubSyncOperation>(
      'POST',
      `/v1/github/projects/${projectId}/pull`,
      { userId, body: options }
    );
  }

  async syncProject(
    projectId: string,
    options: {
      direction: 'push' | 'pull' | 'bidirectional';
      resolveConflicts?: 'ours' | 'theirs' | 'manual';
    },
    userId: string
  ): Promise<GitHubSyncOperation> {
    return this.makeRequest<GitHubSyncOperation>(
      'POST',
      `/v1/github/projects/${projectId}/sync`,
      { userId, body: options }
    );
  }

  async getSyncOperation(operationId: string, userId: string): Promise<GitHubSyncOperation> {
    return this.makeRequest<GitHubSyncOperation>(
      'GET',
      `/v1/github/operations/${operationId}`,
      { userId }
    );
  }

  async cancelSyncOperation(operationId: string, userId: string): Promise<void> {
    await this.makeRequest<void>(
      'POST',
      `/v1/github/operations/${operationId}/cancel`,
      { userId }
    );
  }

  // Repository content operations
  async getCommits(
    installationId: number,
    repositoryId: number,
    options: {
      branch?: string;
      since?: string;
      until?: string;
      limit?: number;
    },
    userId: string
  ): Promise<GitHubCommit[]> {
    const query: Record<string, string> = {};
    if (options.branch) query.branch = options.branch;
    if (options.since) query.since = options.since;
    if (options.until) query.until = options.until;
    if (options.limit) query.limit = options.limit.toString();

    return this.makeRequest<GitHubCommit[]>(
      'GET',
      `/v1/github/installations/${installationId}/repos/${repositoryId}/commits`,
      { userId, query }
    );
  }

  async getCommit(
    installationId: number,
    repositoryId: number,
    commitSha: string,
    userId: string
  ): Promise<GitHubCommit> {
    return this.makeRequest<GitHubCommit>(
      'GET',
      `/v1/github/installations/${installationId}/repos/${repositoryId}/commits/${commitSha}`,
      { userId }
    );
  }

  // Pull request operations
  async getPullRequests(
    installationId: number,
    repositoryId: number,
    options: {
      state?: 'open' | 'closed' | 'all';
      base?: string;
      head?: string;
      sort?: 'created' | 'updated' | 'popularity';
      direction?: 'asc' | 'desc';
    },
    userId: string
  ): Promise<GitHubPullRequest[]> {
    const query: Record<string, string> = {};
    if (options.state) query.state = options.state;
    if (options.base) query.base = options.base;
    if (options.head) query.head = options.head;
    if (options.sort) query.sort = options.sort;
    if (options.direction) query.direction = options.direction;

    return this.makeRequest<GitHubPullRequest[]>(
      'GET',
      `/v1/github/installations/${installationId}/repos/${repositoryId}/pulls`,
      { userId, query }
    );
  }

  async createPullRequest(
    installationId: number,
    repositoryId: number,
    options: {
      title: string;
      body?: string;
      head: string;
      base: string;
      draft?: boolean;
    },
    userId: string
  ): Promise<GitHubPullRequest> {
    return this.makeRequest<GitHubPullRequest>(
      'POST',
      `/v1/github/installations/${installationId}/repos/${repositoryId}/pulls`,
      { userId, body: options }
    );
  }

  async mergePullRequest(
    installationId: number,
    repositoryId: number,
    pullNumber: number,
    options: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    },
    userId: string
  ): Promise<void> {
    await this.makeRequest<void>(
      'PUT',
      `/v1/github/installations/${installationId}/repos/${repositoryId}/pulls/${pullNumber}/merge`,
      { userId, body: options }
    );
  }
}

// Singleton instance
export const githubAPIClient = GitHubAPIClient.getInstance();

// Convenience functions for common operations
export async function getGitHubInstallations(userId: string): Promise<GitHubInstallationsResponse> {
  return githubAPIClient.getInstallations(userId);
}

export async function getGitHubRepositories(
  installationId: number,
  userId: string,
  options: { search?: string; cursor?: string; limit?: number } = {}
): Promise<GitHubRepositoriesResponse> {
  return githubAPIClient.getRepositories(installationId, { ...options, userId });
}

export async function getProjectGitHubConfig(projectId: string, userId: string): Promise<ProjectGitHubConfig | null> {
  return githubAPIClient.getProjectConfig(projectId, userId);
}

export async function pushProjectToGitHub(
  projectId: string,
  userId: string,
  options: {
    commitMessage?: string;
    branch?: string;
    createPR?: boolean;
    prTitle?: string;
    prBody?: string;
  } = {}
): Promise<GitHubSyncOperation> {
  return githubAPIClient.pushToGitHub(projectId, options, userId);
}

export async function pullProjectFromGitHub(
  projectId: string,
  userId: string,
  options: { branch?: string; commitSha?: string } = {}
): Promise<GitHubSyncOperation> {
  return githubAPIClient.pullFromGitHub(projectId, options, userId);
}

export async function syncProjectWithGitHub(
  projectId: string,
  userId: string,
  options: {
    direction: 'push' | 'pull' | 'bidirectional';
    resolveConflicts?: 'ours' | 'theirs' | 'manual';
  }
): Promise<GitHubSyncOperation> {
  return githubAPIClient.syncProject(projectId, options, userId);
}