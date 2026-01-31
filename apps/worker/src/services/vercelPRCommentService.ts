import { getPool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import { VercelAPIService } from './vercelAPIService';
import { randomUUID } from 'crypto';

/**
 * Vercel PR Comment Service
 * Posts deployment status comments on pull requests
 * Supports GitHub, GitLab, and Bitbucket APIs
 */

interface PRComment {
  id: string;
  deploymentId: string;
  pullRequestNumber: number;
  provider: 'github' | 'gitlab' | 'bitbucket';
  repositoryId: string;
  commentId?: string;
  status: 'pending' | 'building' | 'ready' | 'error' | 'canceled';
  deploymentUrl?: string;
  previewUrl?: string;
  buildLogsUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DeploymentCommentTemplate {
  pending: string;
  building: string;
  ready: string;
  error: string;
  canceled: string;
}

export class VercelPRCommentService {
  private loggingService: ServerLoggingService;
  private vercelAPI: VercelAPIService;

  // Comment templates for different deployment states
  private commentTemplates: DeploymentCommentTemplate = {
    pending: `## ⏳ Deployment Pending

Your changes are being prepared for deployment on Vercel.

**Branch:** \`{{branch}}\`
**Commit:** \`{{commitSha}}\`
**Environment:** Preview

[View deployment logs]({{buildLogsUrl}}) • [Vercel Dashboard]({{dashboardUrl}})`,

    building: `## 🔨 Building Deployment

Your changes are currently being built and deployed on Vercel.

**Branch:** \`{{branch}}\`
**Commit:** \`{{commitSha}}\`
**Environment:** Preview
**Started:** {{startTime}}

[View build logs]({{buildLogsUrl}}) • [Vercel Dashboard]({{dashboardUrl}})

---
*This comment will be updated when the deployment is complete.*`,

    ready: `## ✅ Deployment Successful

Your changes have been successfully deployed to Vercel!

**Branch:** \`{{branch}}\`
**Commit:** \`{{commitSha}}\`
**Environment:** Preview
**Build Time:** {{buildDuration}}

🔗 **Preview URL:** {{previewUrl}}

[View deployment logs]({{buildLogsUrl}}) • [Vercel Dashboard]({{dashboardUrl}})

---
*Deployed at {{completedTime}}*`,

    error: `## ❌ Deployment Failed

There was an error deploying your changes to Vercel.

**Branch:** \`{{branch}}\`
**Commit:** \`{{commitSha}}\`
**Environment:** Preview
**Error:** {{errorMessage}}

[View build logs]({{buildLogsUrl}}) • [Vercel Dashboard]({{dashboardUrl}})

---
*Please check the build logs for more details. You can retry the deployment from the Vercel dashboard.*`,

    canceled: `## 🚫 Deployment Canceled

The deployment has been canceled.

**Branch:** \`{{branch}}\`
**Commit:** \`{{commitSha}}\`
**Environment:** Preview

[Vercel Dashboard]({{dashboardUrl}})

---
*You can trigger a new deployment by pushing changes to this branch.*`
  };

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
    this.vercelAPI = new VercelAPIService();
  }

  /**
   * Create or update PR comment for deployment
   */
  async updateDeploymentComment(
    projectId: string,
    deploymentId: string,
    pullRequestNumber: number,
    status: PRComment['status'],
    deploymentInfo: {
      branch: string;
      commitSha: string;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      deploymentUrl?: string | undefined;
      previewUrl?: string | undefined;
      buildLogsUrl?: string | undefined;
      errorMessage?: string | undefined;
      buildDuration?: number | undefined;
      startTime?: Date | undefined;
      completedTime?: Date | undefined;
    }
  ): Promise<void> {
    try {
      // Get project git information
      const projectResult = await getPool().query(`
        SELECT 
          p.git_provider,
          p.git_repository_url,
          p.git_repository_id,
          vpm.vercel_project_id
        FROM projects p
        JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
        WHERE p.id = $1
      `, [projectId]);

      if (projectResult.rows.length === 0) {
        throw new Error('Project not found or not linked to Vercel');
      }

      const project = projectResult.rows[0];
      const provider = project.git_provider as 'github' | 'gitlab' | 'bitbucket';

      if (!provider || !project.git_repository_id) {
        await this.loggingService.logServerEvent(
          'capacity',
          'warn',
          'Cannot post PR comment - missing git provider information',
          { projectId, deploymentId, pullRequestNumber }
        );
        return;
      }

      // Check if PR comments are enabled for this project
      const mappingResult = await getPool().query(
        'SELECT metadata FROM vercel_project_mappings WHERE project_id = $1',
        [projectId]
      );

      const metadata = mappingResult.rows[0]?.metadata || {};
      if (metadata.disablePRComments === true) {
        await this.loggingService.logServerEvent(
          'capacity',
          'debug',
          'PR comments disabled for project',
          { projectId, deploymentId }
        );
        return;
      }

      // Generate comment content
      const commentContent = this.generateCommentContent(status, deploymentInfo, project.vercel_project_id);

      // Find existing PR comment
      const existingCommentResult = await getPool().query(
        `SELECT id, comment_id FROM vercel_pr_comments 
         WHERE project_id = $1 AND pull_request_number = $2 AND provider = $3`,
        [projectId, pullRequestNumber, provider]
      );

      let commentId: string | null = null;
      let prCommentId: string | null = null;

      if (existingCommentResult.rows.length > 0) {
        // Update existing comment
        const existingComment = existingCommentResult.rows[0];
        prCommentId = existingComment.id;
        commentId = existingComment.comment_id;

        if (commentId) {
          await this.updatePRComment(provider, project.git_repository_id, commentId, commentContent);
        }
      } else {
        // Create new comment
        commentId = await this.createPRComment(
          provider,
          project.git_repository_id,
          pullRequestNumber,
          commentContent
        );
        prCommentId = randomUUID();
      }

      // Store/update comment record
      await getPool().query(`
        INSERT INTO vercel_pr_comments (
          id, project_id, deployment_id, pull_request_number, provider, 
          repository_id, comment_id, status, deployment_url, preview_url, 
          build_logs_url, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        ON CONFLICT (project_id, pull_request_number, provider) 
        DO UPDATE SET
          deployment_id = EXCLUDED.deployment_id,
          comment_id = EXCLUDED.comment_id,
          status = EXCLUDED.status,
          deployment_url = EXCLUDED.deployment_url,
          preview_url = EXCLUDED.preview_url,
          build_logs_url = EXCLUDED.build_logs_url,
          updated_at = NOW()
      `, [
        prCommentId,
        projectId,
        deploymentId,
        pullRequestNumber,
        provider,
        project.git_repository_id,
        commentId,
        status,
        deploymentInfo.deploymentUrl || null,
        deploymentInfo.previewUrl || null,
        deploymentInfo.buildLogsUrl || null
      ]);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'PR comment updated for deployment',
        {
          projectId,
          deploymentId,
          pullRequestNumber,
          provider,
          status,
          commentId
        }
      );

    } catch (error) {
      await this.loggingService.logCriticalError(
        'pr_comment_update_error',
        error as Error,
        {
          projectId,
          deploymentId,
          pullRequestNumber,
          status
        }
      );
    }
  }

  /**
   * Generate comment content based on status and deployment info
   */
  private generateCommentContent(
    status: PRComment['status'],
    deploymentInfo: any,
    vercelProjectId: string
  ): string {
    const template = this.commentTemplates[status];
    const dashboardUrl = `https://vercel.com/${vercelProjectId}`;

    let content = template
      .replace(/\{\{branch\}\}/g, deploymentInfo.branch)
      .replace(/\{\{commitSha\}\}/g, deploymentInfo.commitSha.substring(0, 7))
      .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl);

    // Replace optional placeholders
    if (deploymentInfo.previewUrl) {
      content = content.replace(/\{\{previewUrl\}\}/g, deploymentInfo.previewUrl);
    }

    if (deploymentInfo.buildLogsUrl) {
      content = content.replace(/\{\{buildLogsUrl\}\}/g, deploymentInfo.buildLogsUrl);
    }

    if (deploymentInfo.errorMessage) {
      content = content.replace(/\{\{errorMessage\}\}/g, deploymentInfo.errorMessage);
    }

    if (deploymentInfo.buildDuration) {
      const duration = Math.round(deploymentInfo.buildDuration / 1000);
      content = content.replace(/\{\{buildDuration\}\}/g, `${duration}s`);
    }

    if (deploymentInfo.startTime) {
      content = content.replace(/\{\{startTime\}\}/g, deploymentInfo.startTime.toLocaleString());
    }

    if (deploymentInfo.completedTime) {
      content = content.replace(/\{\{completedTime\}\}/g, deploymentInfo.completedTime.toLocaleString());
    }

    return content;
  }

  /**
   * Create PR comment on git provider
   */
  private async createPRComment(
    provider: 'github' | 'gitlab' | 'bitbucket',
    repositoryId: string,
    pullRequestNumber: number,
    content: string
  ): Promise<string | null> {
    try {
      switch (provider) {
        case 'github':
          return await this.createGitHubComment(repositoryId, pullRequestNumber, content);
        case 'gitlab':
          return await this.createGitLabComment(repositoryId, pullRequestNumber, content);
        case 'bitbucket':
          return await this.createBitbucketComment(repositoryId, pullRequestNumber, content);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      await this.loggingService.logCriticalError(
        'create_pr_comment_error',
        error as Error,
        { provider, repositoryId, pullRequestNumber }
      );
      return null;
    }
  }

  /**
   * Update existing PR comment
   */
  private async updatePRComment(
    provider: 'github' | 'gitlab' | 'bitbucket',
    repositoryId: string,
    commentId: string,
    content: string
  ): Promise<void> {
    try {
      switch (provider) {
        case 'github':
          await this.updateGitHubComment(repositoryId, commentId, content);
          break;
        case 'gitlab':
          await this.updateGitLabComment(repositoryId, commentId, content);
          break;
        case 'bitbucket':
          await this.updateBitbucketComment(repositoryId, commentId, content);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      await this.loggingService.logCriticalError(
        'update_pr_comment_error',
        error as Error,
        { provider, repositoryId, commentId }
      );
    }
  }

  /**
   * GitHub API methods
   */
  private async createGitHubComment(repositoryId: string, pullRequestNumber: number, content: string): Promise<string> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const response = await fetch(`https://api.github.com/repos/${repositoryId}/issues/${pullRequestNumber}/comments`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({ body: content })
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.id.toString();
  }

  private async updateGitHubComment(repositoryId: string, commentId: string, content: string): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub token not configured');

    const response = await fetch(`https://api.github.com/repos/${repositoryId}/issues/comments/${commentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({ body: content })
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * GitLab API methods
   */
  private async createGitLabComment(repositoryId: string, pullRequestNumber: number, content: string): Promise<string> {
    const token = process.env.GITLAB_TOKEN;
    if (!token) throw new Error('GitLab token not configured');

    const response = await fetch(`https://gitlab.com/api/v4/projects/${repositoryId}/merge_requests/${pullRequestNumber}/notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body: content })
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.id.toString();
  }

  private async updateGitLabComment(repositoryId: string, commentId: string, content: string): Promise<void> {
    const token = process.env.GITLAB_TOKEN;
    if (!token) throw new Error('GitLab token not configured');

    const response = await fetch(`https://gitlab.com/api/v4/projects/${repositoryId}/merge_requests/notes/${commentId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body: content })
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Bitbucket API methods
   */
  private async createBitbucketComment(repositoryId: string, pullRequestNumber: number, content: string): Promise<string> {
    const username = process.env.BITBUCKET_USERNAME;
    const appPassword = process.env.BITBUCKET_APP_PASSWORD;
    
    if (!username || !appPassword) {
      throw new Error('Bitbucket credentials not configured');
    }

    const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');

    const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${repositoryId}/pullrequests/${pullRequestNumber}/comments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: {
          raw: content
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Bitbucket API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.id.toString();
  }

  private async updateBitbucketComment(repositoryId: string, commentId: string, content: string): Promise<void> {
    const username = process.env.BITBUCKET_USERNAME;
    const appPassword = process.env.BITBUCKET_APP_PASSWORD;
    
    if (!username || !appPassword) {
      throw new Error('Bitbucket credentials not configured');
    }

    const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');

    const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${repositoryId}/pullrequests/comments/${commentId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: {
          raw: content
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Bitbucket API error: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Clean up old PR comments (called by maintenance job)
   */
  async cleanupOldComments(daysToKeep: number = 30): Promise<number> {
    const result = await getPool().query(
      `DELETE FROM vercel_pr_comments 
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
    );

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Cleaned up old PR comments',
      { deletedCount: result.rowCount, daysToKeep }
    );

    return result.rowCount || 0;
  }
}

// Database schema addition
export const PR_COMMENTS_TABLE_SQL = `
-- PR comments tracking table
CREATE TABLE IF NOT EXISTS vercel_pr_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deployment_id VARCHAR(255) NOT NULL,
  pull_request_number INTEGER NOT NULL,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket')),
  repository_id VARCHAR(255) NOT NULL,
  comment_id VARCHAR(255),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'building', 'ready', 'error', 'canceled')),
  deployment_url TEXT,
  preview_url TEXT,
  build_logs_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, pull_request_number, provider)
);

-- Indexes for PR comments
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_project_pr 
  ON vercel_pr_comments(project_id, pull_request_number);
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_deployment 
  ON vercel_pr_comments(deployment_id);
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_status 
  ON vercel_pr_comments(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_cleanup 
  ON vercel_pr_comments(created_at) 
  WHERE created_at < NOW() - INTERVAL '30 days';
`;