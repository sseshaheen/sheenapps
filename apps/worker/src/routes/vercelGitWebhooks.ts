import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { ServerLoggingService } from '../services/serverLoggingService';
import { VercelGitWebhookService } from '../services/vercelGitWebhookService';

/**
 * Git Webhook Routes for Auto-Deploy
 * Handles webhooks from GitHub, GitLab, and Bitbucket
 * Triggers auto-deployments based on project configuration
 */

interface GitWebhookRequest {
  Body: any;
  Headers: {
    'x-github-event'?: string;
    'x-github-delivery'?: string;
    'x-hub-signature-256'?: string;
    'x-gitlab-event'?: string;
    'x-gitlab-token'?: string;
    'x-event-key'?: string; // Bitbucket
    'user-agent'?: string;
  };
}

// Import the interface from the service to avoid duplication
import { GitWebhookPayload } from '../services/vercelGitWebhookService';

// Flexible webhook payload type for different providers
interface FlexibleWebhookPayload {
  repository?: {
    full_name?: string;
    name?: string;
    id?: string;
    uuid?: string;
    links?: any;
    mainbranch?: any;
  };
  project?: {
    id?: string | number;
    name?: string;
    path_with_namespace?: string;
    git_http_url?: string;
    default_branch?: string;
  };
  ref?: string;
  before?: string;
  after?: string;
  commits?: any[];
  head_commit?: any;
  pusher?: any;
  user?: any;
  push?: {
    changes?: any[];
  };
  actor?: {
    display_name?: string;
    username?: string;
  };
  [key: string]: any; // Allow additional properties
}

export async function vercelGitWebhookRoutes(fastify: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();
  const gitWebhookService = new VercelGitWebhookService();

  // Custom content type parser for raw webhook payloads
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    try {
      const jsonString = body.toString('utf8');
      const json = JSON.parse(jsonString);
      // Store raw body for signature validation
      (request as any).rawBody = body;
      done(null, json);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  /**
   * GitHub webhook handler
   * POST /v1/webhooks/git/github
   */
  fastify.post<GitWebhookRequest>(
    '/v1/webhooks/git/github',
    async (request: FastifyRequest<GitWebhookRequest>, reply: FastifyReply) => {
      const signature = request.headers['x-hub-signature-256'];
      const event = request.headers['x-github-event'];
      const delivery = request.headers['x-github-delivery'];
      const rawBody = (request as any).rawBody as Buffer;
      const payload = request.body;

      try {
        // Validate GitHub webhook signature
        if (!validateGitHubSignature(rawBody, signature)) {
          await loggingService.logServerEvent(
            'error',
            'error',
            'Invalid GitHub webhook signature',
            { 
              hasSignature: !!signature,
              payloadSize: rawBody?.length,
              event,
              delivery
            }
          );
          return reply.code(401).send({ error: 'Invalid signature' });
        }

        // Only process push events
        if (event !== 'push') {
          await loggingService.logServerEvent(
            'capacity',
            'debug',
            'GitHub webhook ignored - not a push event',
            { event, delivery, repository: (payload as GitWebhookPayload).repository?.full_name }
          );
          return reply.code(200).send({ message: 'Event ignored - not a push event' });
        }

        // Process the git push
        const results = await gitWebhookService.processGitPush(payload as GitWebhookPayload, 'github');

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'GitHub webhook processed',
          {
            event,
            delivery,
            repository: (payload as GitWebhookPayload).repository?.full_name,
            branch: (payload as GitWebhookPayload).ref?.replace('refs/heads/', ''),
            results: results.map(r => ({
              triggered: r.triggered,
              reason: r.reason,
              targetEnvironment: r.targetEnvironment,
              deploymentId: r.deploymentId
            }))
          }
        );

        reply.send({ 
          message: 'Webhook processed successfully',
          results
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'github_webhook_processing_error',
          error as Error,
          {
            event,
            delivery,
            repository: (payload as GitWebhookPayload)?.repository?.full_name,
            payloadSize: rawBody?.length
          }
        );

        reply.code(500).send({ 
          error: 'Webhook processing failed',
          delivery
        });
      }
    }
  );

  /**
   * GitLab webhook handler
   * POST /v1/webhooks/git/gitlab
   */
  fastify.post<GitWebhookRequest>(
    '/v1/webhooks/git/gitlab',
    async (request: FastifyRequest<GitWebhookRequest>, reply: FastifyReply) => {
      const event = request.headers['x-gitlab-event'];
      const token = request.headers['x-gitlab-token'];
      const payload = request.body;

      try {
        // Validate GitLab webhook token
        if (!validateGitLabToken(token)) {
          await loggingService.logServerEvent(
            'error',
            'error',
            'Invalid GitLab webhook token',
            { 
              hasToken: !!token,
              event,
              projectId: (payload as FlexibleWebhookPayload).project?.id
            }
          );
          return reply.code(401).send({ error: 'Invalid token' });
        }

        // Only process push events
        if (event !== 'Push Hook') {
          await loggingService.logServerEvent(
            'capacity',
            'debug',
            'GitLab webhook ignored - not a push event',
            { event, projectId: (payload as FlexibleWebhookPayload).project?.id }
          );
          return reply.code(200).send({ message: 'Event ignored - not a push event' });
        }

        // Transform GitLab payload to common format
        const transformedPayload = transformGitLabPayload(payload);
        const results = await gitWebhookService.processGitPush(transformedPayload, 'gitlab');

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'GitLab webhook processed',
          {
            event,
            projectId: (payload as FlexibleWebhookPayload).project?.id,
            repository: (payload as FlexibleWebhookPayload).project?.path_with_namespace,
            branch: (payload as FlexibleWebhookPayload).ref?.replace('refs/heads/', ''),
            results: results.map(r => ({
              triggered: r.triggered,
              reason: r.reason,
              targetEnvironment: r.targetEnvironment,
              deploymentId: r.deploymentId
            }))
          }
        );

        reply.send({ 
          message: 'Webhook processed successfully',
          results
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'gitlab_webhook_processing_error',
          error as Error,
          {
            event,
            projectId: (payload as FlexibleWebhookPayload)?.project?.id
          }
        );

        reply.code(500).send({ 
          error: 'Webhook processing failed'
        });
      }
    }
  );

  /**
   * Bitbucket webhook handler
   * POST /v1/webhooks/git/bitbucket
   */
  fastify.post<GitWebhookRequest>(
    '/v1/webhooks/git/bitbucket',
    async (request: FastifyRequest<GitWebhookRequest>, reply: FastifyReply) => {
      const event = request.headers['x-event-key'];
      const userAgent = request.headers['user-agent'];
      const payload = request.body;

      try {
        // Basic validation for Bitbucket
        if (!userAgent?.includes('Bitbucket')) {
          await loggingService.logServerEvent(
            'error',
            'warn',
            'Suspicious Bitbucket webhook - invalid user agent',
            { userAgent, event }
          );
          return reply.code(401).send({ error: 'Invalid request' });
        }

        // Only process push events
        if (event !== 'repo:push') {
          await loggingService.logServerEvent(
            'capacity',
            'debug',
            'Bitbucket webhook ignored - not a push event',
            { event, repository: (payload as FlexibleWebhookPayload).repository?.full_name }
          );
          return reply.code(200).send({ message: 'Event ignored - not a push event' });
        }

        // Transform Bitbucket payload to common format
        const transformedPayload = transformBitbucketPayload(payload);
        const results = await gitWebhookService.processGitPush(transformedPayload, 'bitbucket');

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Bitbucket webhook processed',
          {
            event,
            repository: (payload as FlexibleWebhookPayload).repository?.full_name,
            results: results.map(r => ({
              triggered: r.triggered,
              reason: r.reason,
              targetEnvironment: r.targetEnvironment,
              deploymentId: r.deploymentId
            }))
          }
        );

        reply.send({ 
          message: 'Webhook processed successfully',
          results
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'bitbucket_webhook_processing_error',
          error as Error,
          {
            event,
            repository: (payload as FlexibleWebhookPayload)?.repository?.full_name
          }
        );

        reply.code(500).send({ 
          error: 'Webhook processing failed'
        });
      }
    }
  );

  /**
   * GET /v1/webhooks/git/health
   * Health check for git webhook processing
   */
  fastify.get('/v1/webhooks/git/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if webhook secrets are configured
      const githubSecretConfigured = !!process.env.GITHUB_WEBHOOK_SECRET;
      const gitlabSecretConfigured = !!process.env.GITLAB_WEBHOOK_TOKEN;

      reply.send({
        healthy: true,
        providers: {
          github: {
            enabled: githubSecretConfigured,
            webhook_url: '/v1/webhooks/git/github'
          },
          gitlab: {
            enabled: gitlabSecretConfigured,
            webhook_url: '/v1/webhooks/git/gitlab'
          },
          bitbucket: {
            enabled: true, // No secret required for basic validation
            webhook_url: '/v1/webhooks/git/bitbucket'
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      reply.code(500).send({
        healthy: false,
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Validate GitHub webhook signature
 */
function validateGitHubSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  
  if (!webhookSecret || !signatureHeader) {
    return false;
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signatureHeader)
  );
}

/**
 * Validate GitLab webhook token
 */
function validateGitLabToken(token: string | undefined): boolean {
  const webhookToken = process.env.GITLAB_WEBHOOK_TOKEN;
  
  if (!webhookToken || !token) {
    return false;
  }

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(webhookToken),
    Buffer.from(token)
  );
}

/**
 * Transform GitLab payload to common format
 */
function transformGitLabPayload(payload: any): any {
  return {
    repository: {
      id: payload.project.id.toString(),
      name: payload.project.name,
      full_name: payload.project.path_with_namespace,
      clone_url: payload.project.git_http_url,
      default_branch: payload.project.default_branch
    },
    ref: (payload as FlexibleWebhookPayload).ref,
    before: payload.before,
    after: payload.after,
    commits: payload.commits.map((commit: any) => ({
      id: commit.id,
      message: commit.message,
      author: {
        name: commit.author.name,
        email: commit.author.email
      },
      timestamp: commit.timestamp,
      url: commit.url
    })),
    head_commit: payload.commits[payload.commits.length - 1] ? {
      id: payload.commits[payload.commits.length - 1].id,
      message: payload.commits[payload.commits.length - 1].message,
      author: {
        name: payload.commits[payload.commits.length - 1].author.name,
        email: payload.commits[payload.commits.length - 1].author.email
      },
      timestamp: payload.commits[payload.commits.length - 1].timestamp,
      url: payload.commits[payload.commits.length - 1].url
    } : null,
    pusher: {
      name: payload.user_name,
      email: payload.user_email
    },
    user: {
      username: payload.user_username
    }
  };
}

/**
 * Transform Bitbucket payload to common format
 */
function transformBitbucketPayload(payload: any): any {
  const latestChange = payload.push?.changes?.[0];
  const commits = latestChange?.commits || [];
  const latestCommit = commits[0];

  return {
    repository: {
      id: payload.repository.uuid,
      name: payload.repository.name,
      full_name: payload.repository.full_name,
      clone_url: payload.repository.links?.clone?.find((link: any) => link.name === 'https')?.href,
      default_branch: payload.repository.mainbranch?.name
    },
    ref: 'refs/heads/' + latestChange?.new?.name,
    before: latestChange?.old?.target?.hash,
    after: latestChange?.new?.target?.hash,
    commits: commits.map((commit: any) => ({
      id: commit.hash,
      message: commit.message,
      author: {
        name: commit.author?.user?.display_name || commit.author?.raw,
        email: commit.author?.user?.email_address || ''
      },
      timestamp: commit.date,
      url: commit.links?.html?.href
    })),
    head_commit: latestCommit ? {
      id: latestCommit.hash,
      message: latestCommit.message,
      author: {
        name: latestCommit.author?.user?.display_name || latestCommit.author?.raw,
        email: latestCommit.author?.user?.email_address || ''
      },
      timestamp: latestCommit.date,
      url: latestCommit.links?.html?.href
    } : null,
    pusher: {
      name: payload.actor?.display_name || payload.actor?.username,
      email: ''
    },
    actor: {
      username: payload.actor?.username
    }
  };
}