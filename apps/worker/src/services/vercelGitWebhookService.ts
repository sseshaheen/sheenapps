import { getPool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import { VercelSyncService } from './vercelSyncService';
import { unifiedLogger } from './unifiedLogger';
import { randomUUID } from 'crypto';

/**
 * Vercel Git Webhook Service
 * Processes git push events and triggers auto-deployments based on configuration
 * Supports GitHub, GitLab, and Bitbucket webhooks
 */

export interface GitWebhookPayload {
  repository: {
    id: string;
    name: string;
    full_name: string;
    clone_url: string;
    default_branch: string;
  };
  ref: string; // refs/heads/main
  before: string; // previous commit SHA
  after: string; // new commit SHA
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    timestamp: string;
    url: string;
  }>;
  head_commit: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    timestamp: string;
    url: string;
  };
  pusher: {
    name: string;
    email: string;
  };
  pull_request?: {
    number: number;
    title: string;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
  };
  // Provider-specific fields
  sender?: { login: string }; // GitHub
  user?: { username: string }; // GitLab
  actor?: { username: string }; // Bitbucket
}

interface BranchDeploymentRule {
  pattern: string;
  target: 'production' | 'preview';
  requiresApproval: boolean;
  runChecks: boolean;
}

interface AutoDeployResult {
  triggered: boolean;
  reason: string;
  deploymentId?: string;
  branch: string;
  targetEnvironment: 'production' | 'preview';
  requiresApproval?: boolean;
  pendingApprovalId?: string;
}

export class VercelGitWebhookService {
  private loggingService: ServerLoggingService;
  private syncService: VercelSyncService;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
    this.syncService = new VercelSyncService();
  }

  /**
   * Process git push webhook and trigger auto-deployment if configured
   */
  async processGitPush(payload: GitWebhookPayload, provider: 'github' | 'gitlab' | 'bitbucket'): Promise<AutoDeployResult[]> {
    try {
      // Extract branch name from ref
      const branch = this.extractBranchName(payload.ref);
      if (!branch) {
        await this.loggingService.logServerEvent(
          'capacity',
          'debug',
          'Git webhook ignored - not a branch push',
          { ref: payload.ref, repository: payload.repository.full_name }
        );
        return [];
      }

      // Skip if this is a branch deletion
      if (payload.after === '0000000000000000000000000000000000000000') {
        await this.loggingService.logServerEvent(
          'capacity',
          'debug',
          'Git webhook ignored - branch deletion',
          { branch, repository: payload.repository.full_name }
        );
        return [];
      }

      // Find projects linked to this repository
      const linkedProjects = await this.findLinkedProjects(payload.repository, provider);
      if (linkedProjects.length === 0) {
        await this.loggingService.logServerEvent(
          'capacity',
          'debug',
          'Git webhook ignored - no linked projects',
          { repository: payload.repository.full_name, provider }
        );
        return [];
      }

      const results: AutoDeployResult[] = [];

      // Process auto-deploy for each linked project
      for (const project of linkedProjects) {
        try {
          const result = await this.processProjectAutoDeploy(project, payload, branch);
          results.push(result);
        } catch (error) {
          await this.loggingService.logCriticalError(
            'git_webhook_project_processing_error',
            error as Error,
            {
              projectId: project.project_id,
              repository: payload.repository.full_name,
              branch
            }
          );

          results.push({
            triggered: false,
            reason: `Error processing project: ${(error as Error).message}`,
            branch,
            targetEnvironment: 'preview'
          });
        }
      }

      return results;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'git_webhook_processing_error',
        error as Error,
        { repository: payload.repository?.full_name, provider }
      );
      throw error;
    }
  }

  /**
   * Process auto-deployment for a specific project
   */
  private async processProjectAutoDeploy(
    project: any,
    payload: GitWebhookPayload,
    branch: string
  ): Promise<AutoDeployResult> {
    const { project_id, vercel_project_id, auto_deploy, deployment_hooks_enabled, deployment_branch_patterns, metadata } = project;

    // Check if auto-deploy is enabled
    if (!auto_deploy || !deployment_hooks_enabled) {
      return {
        triggered: false,
        reason: 'Auto-deploy not enabled for this project',
        branch,
        targetEnvironment: 'preview'
      };
    }

    // Check branch patterns
    const branchPatterns = deployment_branch_patterns || ['main'];
    const matchesPattern = this.matchesBranchPattern(branch, branchPatterns);
    
    if (!matchesPattern) {
      return {
        triggered: false,
        reason: `Branch '${branch}' does not match deployment patterns: ${branchPatterns.join(', ')}`,
        branch,
        targetEnvironment: 'preview'
      };
    }

    // Get deployment rules and determine target environment
    const deploymentRules = metadata?.deploymentRules || [];
    const matchingRule = this.findMatchingRule(branch, deploymentRules);
    
    const targetEnvironment = this.determineTargetEnvironment(branch, matchingRule, metadata);
    const requiresApproval = matchingRule?.requiresApproval || metadata?.requiresApproval || false;

    // Check if approval is required
    if (requiresApproval) {
      const approvalId = await this.createDeploymentApprovalRequest(
        project_id,
        vercel_project_id,
        {
          branch,
          commitSha: payload.head_commit.id,
          commitMessage: payload.head_commit.message,
          targetEnvironment,
          pusher: this.extractPusherInfo(payload),
          pullRequest: payload.pull_request
        }
      );

      return {
        triggered: false,
        reason: 'Deployment requires approval',
        branch,
        targetEnvironment,
        requiresApproval: true,
        pendingApprovalId: approvalId
      };
    }

    // Generate deployment ID for correlation
    const buildId = `git-${payload.head_commit.id.substring(0, 8)}-${Date.now()}`;
    
    // Use advisory lock to prevent race conditions on rapid commits
    const lockKey = `vercel_webhook_${project_id}_${payload.head_commit.id}`;
    const pool = getPool();
    const lockResult = await pool.query(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
      [lockKey]
    );

    if (!lockResult.rows[0].acquired) {
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Webhook processing skipped due to concurrent processing',
        {
          projectId: project_id,
          commitSha: payload.head_commit.id,
          lockKey
        }
      );
      
      return {
        triggered: false,
        reason: 'Another deployment is already being processed for this commit',
        branch,
        targetEnvironment
      };
    }
    
    // Log auto-deployment initiation
    unifiedLogger.deploy(
      buildId,
      project.owner_id || 'system', // user_id from project or system for git hooks
      project_id,
      'started',
      `Auto-deployment triggered from git push to ${branch}`,
      undefined, // deploymentId will be set after creation
      {
        trigger: 'git_webhook',
        provider: 'vercel',
        branch,
        commitSha: payload.head_commit.id,
        commitMessage: payload.head_commit.message,
        pusher: payload.pusher?.name || payload.head_commit.author.name,
        targetEnvironment,
        repository: payload.repository.full_name,
        pullRequestNumber: payload.pull_request?.number
      }
    );

    // Trigger deployment
    try {
      const deployment = await this.syncService.deployFromGit(project_id, {
        branch,
        commitSha: payload.head_commit.id,
        prNumber: payload.pull_request?.number,
        target: targetEnvironment === 'production' ? 'production' : 'preview'
      });

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Auto-deployment triggered from git push',
        {
          projectId: project_id,
          vercelProjectId: vercel_project_id,
          branch,
          commitSha: payload.head_commit.id,
          targetEnvironment,
          deploymentId: deployment.uid
        }
      );

      // Log successful deployment trigger to unified logger
      unifiedLogger.deploy(
        buildId,
        project.owner_id || 'system',
        project_id,
        'completed',
        `Auto-deployment successfully initiated: ${deployment.uid}`,
        deployment.uid,
        {
          trigger: 'git_webhook',
          vercelDeploymentId: deployment.uid,
          deploymentUrl: deployment.url || `https://${vercel_project_id}.vercel.app`,
          targetEnvironment,
          status: 'initiated'
        }
      );

      return {
        triggered: true,
        reason: 'Deployment triggered successfully',
        branch,
        targetEnvironment,
        deploymentId: deployment.uid
      };

    } catch (deployError) {
      await this.loggingService.logCriticalError(
        'auto_deployment_trigger_error',
        deployError as Error,
        {
          projectId: project_id,
          branch,
          commitSha: payload.head_commit.id
        }
      );

      // Log failed deployment to unified logger
      unifiedLogger.deploy(
        buildId,
        project.owner_id || 'system',
        project_id,
        'failed',
        `Auto-deployment failed: ${(deployError as Error).message}`,
        undefined,
        {
          trigger: 'git_webhook',
          errorType: 'deployment_trigger_error',
          errorMessage: (deployError as Error).message,
          targetEnvironment,
          branch,
          commitSha: payload.head_commit.id
        }
      );

      return {
        triggered: false,
        reason: `Deployment failed: ${(deployError as Error).message}`,
        branch,
        targetEnvironment
      };
    }
  }

  /**
   * Find projects linked to the git repository
   */
  private async findLinkedProjects(repository: any, provider: string): Promise<any[]> {
    // Look for projects with git source matching this repository
    const result = await getPool().query(`
      SELECT DISTINCT
        p.id as project_id,
        p.owner_id,
        vpm.id as mapping_id,
        vpm.vercel_project_id,
        vpm.auto_deploy,
        vpm.deployment_hooks_enabled,
        vpm.deployment_branch_patterns,
        vpm.metadata,
        p.git_repository_url,
        p.git_provider
      FROM projects p
      JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
      WHERE 
        p.git_provider = $1 
        AND (
          p.git_repository_url ILIKE '%' || $2 || '%'
          OR p.git_repository_url ILIKE '%' || $3 || '%'
        )
        AND vpm.auto_deploy = true
        AND vpm.deployment_hooks_enabled = true
    `, [
      provider,
      repository.full_name,
      repository.name
    ]);

    return result.rows;
  }

  /**
   * Extract branch name from git ref
   */
  private extractBranchName(ref: string): string | null {
    if (ref.startsWith('refs/heads/')) {
      return ref.replace('refs/heads/', '');
    }
    return null;
  }

  /**
   * Check if branch matches any of the patterns
   */
  private matchesBranchPattern(branch: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(branch);
      }
      return pattern === branch;
    });
  }

  /**
   * Find matching deployment rule for branch
   */
  private findMatchingRule(branch: string, rules: BranchDeploymentRule[]): BranchDeploymentRule | null {
    return rules.find(rule => {
      if (rule.pattern.includes('*')) {
        const regex = new RegExp('^' + rule.pattern.replace(/\*/g, '.*') + '$');
        return regex.test(branch);
      }
      return rule.pattern === branch;
    }) || null;
  }

  /**
   * Determine target environment based on branch and rules
   */
  private determineTargetEnvironment(
    branch: string,
    matchingRule: BranchDeploymentRule | null,
    metadata: any
  ): 'production' | 'preview' {
    if (matchingRule) {
      return matchingRule.target;
    }

    const targetEnvironment = metadata?.targetEnvironment || 'auto';
    if (targetEnvironment === 'auto') {
      return (branch === 'main' || branch === 'master') ? 'production' : 'preview';
    }

    return targetEnvironment === 'production' ? 'production' : 'preview';
  }

  /**
   * Extract pusher information from different git providers
   */
  private extractPusherInfo(payload: GitWebhookPayload): any {
    return {
      name: payload.pusher?.name || payload.head_commit?.author?.name || 'Unknown',
      email: payload.pusher?.email || payload.head_commit?.author?.email || '',
      username: payload.sender?.login || payload.user?.username || payload.actor?.username || 'Unknown'
    };
  }

  /**
   * Create deployment approval request
   */
  private async createDeploymentApprovalRequest(
    projectId: string,
    vercelProjectId: string,
    deploymentInfo: any
  ): Promise<string> {
    const approvalId = randomUUID();
    
    await getPool().query(`
      INSERT INTO vercel_deployment_approvals (
        id, project_id, vercel_project_id, branch, commit_sha, commit_message,
        target_environment, requested_by, pull_request_number, status,
        metadata, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      approvalId,
      projectId,
      vercelProjectId,
      deploymentInfo.branch,
      deploymentInfo.commitSha,
      deploymentInfo.commitMessage,
      deploymentInfo.targetEnvironment,
      deploymentInfo.pusher.email,
      deploymentInfo.pullRequest?.number || null,
      'pending',
      JSON.stringify({
        pusher: deploymentInfo.pusher,
        pullRequest: deploymentInfo.pullRequest,
        triggeredAt: new Date().toISOString()
      }),
      new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hour expiry
      new Date()
    ]);

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Deployment approval request created',
      {
        approvalId,
        projectId,
        branch: deploymentInfo.branch,
        targetEnvironment: deploymentInfo.targetEnvironment
      }
    );

    return approvalId;
  }
}

// Add to migration for deployment approvals table
export const DEPLOYMENT_APPROVALS_TABLE_SQL = `
-- Deployment approval requests table
CREATE TABLE IF NOT EXISTS vercel_deployment_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vercel_project_id VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(255) NOT NULL,
  commit_message TEXT,
  target_environment VARCHAR(20) NOT NULL CHECK (target_environment IN ('production', 'preview')),
  requested_by VARCHAR(255) NOT NULL,
  approved_by VARCHAR(255),
  pull_request_number INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'deployed')),
  approval_reason TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  deployment_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for deployment approvals
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_approvals_project 
  ON vercel_deployment_approvals(project_id, status);
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_approvals_status_expires 
  ON vercel_deployment_approvals(status, expires_at) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_approvals_branch 
  ON vercel_deployment_approvals(project_id, branch, status);
`;