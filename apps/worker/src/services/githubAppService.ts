import { Octokit } from '@octokit/core';
import { createAppAuth } from '@octokit/auth-app';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import { Redis } from 'ioredis';
import { ServerLoggingService } from './serverLoggingService';

// Create enhanced Octokit with plugins for production use
const ProductionOctokit = Octokit.plugin(throttling, retry) as typeof Octokit;

export enum SyncMode {
  DIRECT_COMMIT = 'direct_commit',    // Lovable-style real-time to main
  PROTECTED_PR = 'protected_pr',      // Safer PR-based workflow
  HYBRID = 'hybrid'                   // Auto-merge PRs when safe, manual otherwise
}

export interface GitHubRepo {
  owner: string;
  repo: string;
  branch: string; // default branch only
  installationId: string; // GitHub App installation
  syncMode: SyncMode;
  branchProtection: boolean;
}

export interface FileChange {
  path: string;
  content: string | null; // null for deletions
  mode: '100644' | '100755' | '040000' | '160000' | '120000'; // Git file modes
}

export interface SyncResult {
  success: boolean;
  commitSha?: string;
  prUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  warnings?: string[];
}

export interface GitHubWebhookPayload {
  action?: string;
  repository?: {
    full_name: string;
    default_branch: string;
  };
  commits?: Array<{
    id: string;
    message: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  head_commit?: {
    id: string;
    message: string;
  };
  ref?: string;
  before?: string;
  after?: string;
}

export class GitHubAppService {
  private octokit: InstanceType<typeof ProductionOctokit>;
  private redis: Redis;
  private loggingService: ServerLoggingService;
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor() {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    
    if (!appId || !privateKey) {
      throw new Error('GitHub App credentials not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY');
    }

    this.octokit = new ProductionOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId: parseInt(appId),
        privateKey: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
        clientId: process.env.GITHUB_APP_CLIENT_ID,
        clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
      },
      throttle: {
        onRateLimit: (retryAfter: number, options: any, octokit: any) => {
          octokit.log.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );
          if (options.request.retryCount === 0) {
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
          return false;
        },
        onSecondaryRateLimit: (retryAfter: number, options: any, octokit: any) => {
          octokit.log.warn(
            `Secondary rate limit hit for request ${options.method} ${options.url}`
          );
          return false;
        },
      },
      retry: {
        doNotRetry: ['429'], // Let throttling plugin handle rate limits
      },
    });

    // Initialize Redis connection for token caching and webhook deduplication
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });

    this.loggingService = ServerLoggingService.getInstance();
  }

  /**
   * Get fresh installation token with caching and automatic refresh
   * Tokens expire in 1 hour, we cache for 55 minutes to provide buffer
   */
  async getInstallationToken(installationId: string): Promise<string> {
    const cacheKey = `github-token:${installationId}`;
    const cached = this.tokenCache.get(cacheKey);
    
    // Check cache first (55-minute TTL for 60-minute tokens)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    // Check Redis cache as backup
    const redisCached = await this.redis.get(cacheKey);
    if (redisCached) {
      const { token, expiresAt } = JSON.parse(redisCached);
      if (expiresAt > Date.now()) {
        this.tokenCache.set(cacheKey, { token, expiresAt });
        return token;
      }
    }

    try {
      // Get fresh installation token
      const { data } = await this.octokit.request('POST /app/installations/{installation_id}/access_tokens', {
        installation_id: parseInt(installationId),
      });

      const token = data.token;
      const expiresAt = Date.now() + (55 * 60 * 1000); // 55 minutes for safety buffer

      // Cache in memory and Redis
      this.tokenCache.set(cacheKey, { token, expiresAt });
      await this.redis.setex(cacheKey, 3300, JSON.stringify({ token, expiresAt })); // 55 minutes

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub installation token refreshed',
        { installationId, expiresAt: new Date(expiresAt).toISOString() }
      );

      return token;
    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_token_refresh_failed',
        error,
        { installationId }
      );
      throw new Error(`Failed to get installation token: ${error.message}`);
    }
  }

  /**
   * Get Octokit instance authenticated for specific installation
   */
  async getInstallationOctokit(installationId: string): Promise<InstanceType<typeof ProductionOctokit>> {
    const token = await this.getInstallationToken(installationId);
    
    return new ProductionOctokit({
      auth: token,
      throttle: {
        onRateLimit: () => true,
        onSecondaryRateLimit: () => false,
      },
      retry: {
        doNotRetry: ['429'],
      },
    });
  }

  /**
   * Get repository information including default branch
   */
  async getRepositoryInfo(repo: GitHubRepo): Promise<{
    defaultBranch: string;
    protected: boolean;
  }> {
    const octokit = await this.getInstallationOctokit(repo.installationId);
    
    try {
      const [repoResponse, protectionResponse] = await Promise.allSettled([
        octokit.request('GET /repos/{owner}/{repo}', {
          owner: repo.owner,
          repo: repo.repo,
        }),
        octokit.request('GET /repos/{owner}/{repo}/branches/{branch}/protection', {
          owner: repo.owner,
          repo: repo.repo,
          branch: repo.branch,
        }).catch(() => ({ status: 404 })), // Protection check can fail if branch not protected
      ]);

      const defaultBranch = repoResponse.status === 'fulfilled' 
        ? repoResponse.value.data.default_branch 
        : repo.branch;

      const isProtected = protectionResponse.status === 'fulfilled' 
        ? protectionResponse.value.status !== 404
        : false;

      return { defaultBranch, protected: isProtected };
    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_repo_info_failed',
        error,
        { owner: repo.owner, repo: repo.repo }
      );
      throw error;
    }
  }

  /**
   * Create atomic commit using Git Data API for batch operations
   * 3x faster than Contents API, handles up to 100,000 files
   */
  async createTreeCommit(
    repo: GitHubRepo,
    files: FileChange[],
    baseCommitSha: string,
    message: string
  ): Promise<{ commitSha: string; treeSha: string }> {
    const octokit = await this.getInstallationOctokit(repo.installationId);
    
    try {
      // Step 1: Create blobs for file contents
      const blobPromises = files
        .filter(f => f.content !== null) // Skip deletions
        .map(async (file) => ({
          path: file.path,
          sha: await this.createBlob(octokit, repo, file.content!),
          mode: file.mode,
        }));

      const blobs = await Promise.all(blobPromises);

      // Step 2: Create tree with all changes
      const tree = files.map(file => {
        if (file.content === null) {
          // Deletion: set sha to null
          return {
            path: file.path,
            mode: file.mode,
            type: 'blob' as const,
            sha: null,
          };
        } else {
          // Addition/modification: use blob SHA
          const blob = blobs.find(b => b.path === file.path);
          return {
            path: file.path,
            mode: file.mode,
            type: 'blob' as const,
            sha: blob!.sha,
          };
        }
      });

      const { data: treeData } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
        owner: repo.owner,
        repo: repo.repo,
        base_tree: baseCommitSha,
        tree,
      });

      // Step 3: Create commit
      const { data: commitData } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
        owner: repo.owner,
        repo: repo.repo,
        message,
        tree: treeData.sha,
        parents: [baseCommitSha],
      });

      return {
        commitSha: commitData.sha,
        treeSha: treeData.sha,
      };
    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_tree_commit_failed',
        error,
        { 
          owner: repo.owner, 
          repo: repo.repo, 
          baseCommitSha,
          filesCount: files.length 
        }
      );
      throw error;
    }
  }

  /**
   * Create blob for file content
   */
  private async createBlob(
    octokit: InstanceType<typeof ProductionOctokit>, 
    repo: GitHubRepo, 
    content: string
  ): Promise<string> {
    const { data } = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
      owner: repo.owner,
      repo: repo.repo,
      content: Buffer.from(content, 'utf8').toString('base64'),
      encoding: 'base64',
    });

    return data.sha;
  }

  /**
   * Update repository reference (push commit)
   */
  async updateRef(
    repo: GitHubRepo, 
    commitSha: string, 
    force: boolean = false
  ): Promise<void> {
    const octokit = await this.getInstallationOctokit(repo.installationId);
    
    try {
      await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
        owner: repo.owner,
        repo: repo.repo,
        ref: `heads/${repo.branch}`,
        sha: commitSha,
        force,
      });
    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_ref_update_failed',
        error,
        { 
          owner: repo.owner, 
          repo: repo.repo, 
          branch: repo.branch,
          commitSha,
          force 
        }
      );
      throw error;
    }
  }

  /**
   * Create pull request
   */
  async createPullRequest(
    repo: GitHubRepo,
    title: string,
    body: string,
    headBranch: string,
    baseBranch?: string
  ): Promise<{ url: string; number: number }> {
    const octokit = await this.getInstallationOctokit(repo.installationId);
    
    try {
      const { data } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner: repo.owner,
        repo: repo.repo,
        title,
        body,
        head: headBranch,
        base: baseBranch || repo.branch,
      });

      return {
        url: data.html_url,
        number: data.number,
      };
    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_pr_create_failed',
        error,
        { 
          owner: repo.owner, 
          repo: repo.repo, 
          headBranch,
          baseBranch: baseBranch || repo.branch 
        }
      );
      throw error;
    }
  }

  /**
   * Get current HEAD SHA for repository
   */
  async getHeadSha(repo: GitHubRepo): Promise<string> {
    const octokit = await this.getInstallationOctokit(repo.installationId);
    
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/git/refs/{ref}', {
        owner: repo.owner,
        repo: repo.repo,
        ref: `heads/${repo.branch}`,
      });

      return data.object.sha;
    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_head_sha_failed',
        error,
        { owner: repo.owner, repo: repo.repo, branch: repo.branch }
      );
      throw error;
    }
  }

  /**
   * Check if webhook delivery has been processed (deduplication)
   */
  async isDeliveryProcessed(deliveryId: string): Promise<boolean> {
    const key = `github:delivery:${deliveryId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Mark webhook delivery as processed
   */
  async markDeliveryProcessed(deliveryId: string): Promise<void> {
    const key = `github:delivery:${deliveryId}`;
    const ttl = 7 * 24 * 60 * 60; // 7 days in seconds
    await this.redis.setex(key, ttl, Date.now().toString());
  }

  /**
   * Verify GitHub webhook signature
   */
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');
    
    const providedSignature = signature.replace('sha256=', '');
    
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance for convenient usage
let githubAppServiceInstance: GitHubAppService | null = null;

export function getGitHubAppService(): GitHubAppService {
  if (!githubAppServiceInstance) {
    githubAppServiceInstance = new GitHubAppService();
  }
  return githubAppServiceInstance;
}