import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getVersionByDeploymentId, updateProjectVersion } from '../services/database';
import { setLatestVersion } from '../services/cloudflareKV';
import { updateProjectConfig } from '../services/projectConfigService';
import { webhookHmacValidation } from '../middleware/hmacValidation';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getGitHubAppService, GitHubWebhookPayload } from '../services/githubAppService';
import { addGitHubWebhookJob } from '../queue/modularQueues';
import { ServerLoggingService } from '../services/serverLoggingService';
import { registerImprovedWebhookRoutes } from './webhook-improved';
import { registerOpenClawWebhookRoutes } from './openclawWebhook';

const CF_WEBHOOK_SECRET = process.env.CF_WEBHOOK_SECRET || '';


interface CloudflareWebhookBody {
  deployment: {
    id: string;
    environment: string;
    url: string;
    aliases: string[];
    created_on: string;
    latest_stage: {
      name: string;
      status: string;
      ended_on?: string;
    };
  };
  project: {
    id: string;
    name: string;
  };
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  // Apply HMAC validation to all endpoints
  const hmacMiddleware = webhookHmacValidation();

  // POST /cf-pages-callback
  app.post('/v1/webhooks/cloudflare-callback', async (
    request: FastifyRequest<{ Body: CloudflareWebhookBody }>,
    reply: FastifyReply
  ) => {
    // Verify webhook auth header
    const authHeader = request.headers['cf-webhook-auth'] as string;
    if (!authHeader || authHeader !== CF_WEBHOOK_SECRET) {
      console.warn('Invalid webhook auth header');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { deployment, project } = request.body;
    
    if (!deployment || !deployment.id) {
      return reply.code(400).send({ error: 'Invalid webhook payload' });
    }

    console.log(`Received webhook for deployment: ${deployment.id}`);

    try {
      // Find the version by deployment ID
      const version = await getVersionByDeploymentId(deployment.id);
      if (!version) {
        console.warn(`No version found for deployment ID: ${deployment.id}`);
        return reply.code(404).send({ error: 'Version not found for deployment' });
      }

      // Check deployment status
      const isSuccess = deployment.latest_stage?.status === 'success';
      const isFailed = deployment.latest_stage?.status === 'failure';

      if (isSuccess) {
        // Update version as deployed
        await updateProjectVersion(version.versionId, {
          status: 'deployed',
          previewUrl: deployment.url,
        });

        // CRITICAL: Update project's current_version_id and current_version_name to point to this successfully deployed version
        try {
          await updateProjectConfig(version.projectId, { 
            versionId: version.versionId,
            versionName: version.versionName, // Now available from enhanced getVersionByDeploymentId()
            status: 'deployed',
            previewUrl: deployment.url
          });
          console.log(`Webhook: Updated project ${version.projectId} current_version_id to ${version.versionId}${version.versionName ? ` (${version.versionName})` : ''}`);
        } catch (error) {
          console.error('Webhook: Failed to update project current_version_id:', error);
          // Don't fail the webhook for this, but log it
        }

        // Update KV
        await setLatestVersion(version.userId, version.projectId, {
          latestVersionId: version.versionId,
          previewUrl: deployment.url,
          timestamp: Date.now(),
        });

        console.log(`Deployment ${deployment.id} marked as successful`);
      } else if (isFailed) {
        // Update version as failed
        await updateProjectVersion(version.versionId, {
          status: 'failed',
          claudeJson: { 
            ...version.claudeJson,
            deploymentError: `Deployment failed at stage: ${deployment.latest_stage?.name}` 
          },
        });

        console.log(`Deployment ${deployment.id} marked as failed`);
      }

      return reply.send({ 
        success: true,
        message: 'Webhook processed successfully',
        deploymentId: deployment.id,
        status: deployment.latest_stage?.status,
      });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      return reply.code(500).send({ 
        error: 'Failed to process webhook',
        details: error.message 
      });
    }
  });

  // Health check endpoint for webhook
  app.get('/v1/webhooks/cloudflare-callback/health', {
    preHandler: requireHmacSignature() as any
  }, async (_, reply) => {
    return reply.send({
      status: 'healthy',
      webhookEnabled: !!CF_WEBHOOK_SECRET,
      timestamp: new Date().toISOString(),
    });
  });

  // GitHub webhook handler for 2-way sync
  app.post('/v1/webhooks/github/:projectId', async (
    request: FastifyRequest<{ 
      Params: { projectId: string };
      Body: GitHubWebhookPayload;
    }>,
    reply: FastifyReply
  ) => {
    const startTime = Date.now();
    const loggingService = ServerLoggingService.getInstance();
    const githubService = getGitHubAppService();
    
    const { projectId } = request.params;
    const deliveryId = request.headers['x-github-delivery'] as string;
    const signature = request.headers['x-hub-signature-256'] as string;
    const event = request.headers['x-github-event'] as string;
    
    // Validate required headers
    if (!deliveryId || !signature || !event) {
      await loggingService.logServerEvent(
        'error',
        'warn',
        'GitHub webhook missing required headers',
        { projectId, deliveryId, hasSignature: !!signature, event }
      );
      return reply.code(400).send({
        error: 'Missing required headers',
        required: ['x-github-delivery', 'x-hub-signature-256', 'x-github-event']
      });
    }

    try {
      // Get project's GitHub webhook secret from database
      // For now, we'll use environment variable - later this should come from project config
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!webhookSecret) {
        await loggingService.logServerEvent(
          'error',
          'error',
          'GitHub webhook secret not configured',
          { projectId, deliveryId }
        );
        return reply.code(500).send({
          error: 'Webhook secret not configured',
          code: 'WEBHOOK_SECRET_MISSING'
        });
      }

      // Verify GitHub webhook signature using raw body
      const rawBody = (request as any).rawBody as string;
      if (!rawBody) {
        await loggingService.logServerEvent(
          'error',
          'error',
          'GitHub webhook raw body not available',
          { projectId, deliveryId }
        );
        return reply.code(400).send({
          error: 'Raw body not available for signature verification',
          code: 'RAW_BODY_MISSING'
        });
      }

      // Verify signature
      if (!githubService.verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        await loggingService.logServerEvent(
          'error',
          'error',
          'GitHub webhook signature verification failed',
          { projectId, deliveryId, event }
        );
        return reply.code(401).send({
          error: 'Invalid webhook signature',
          code: 'INVALID_SIGNATURE'
        });
      }

      // Check for duplicate delivery (deduplication)
      if (await githubService.isDeliveryProcessed(deliveryId)) {
        await loggingService.logServerEvent(
          'capacity',
          'info',
          'GitHub webhook already processed (duplicate)',
          { projectId, deliveryId, event }
        );
        return reply.code(200).send({
          message: 'Webhook already processed',
          deliveryId,
          status: 'duplicate'
        });
      }

      // Mark delivery as processed
      await githubService.markDeliveryProcessed(deliveryId);

      // Handle ping event (GitHub webhook test)
      if (event === 'ping') {
        await loggingService.logServerEvent(
          'capacity',
          'info',
          'GitHub webhook ping received',
          { projectId, deliveryId }
        );
        return reply.code(200).send({
          message: 'GitHub webhook ping received',
          projectId,
          deliveryId,
          status: 'pong'
        });
      }

      // Process webhook asynchronously using BullMQ
      // Reply immediately within 10s as GitHub won't wait longer
      await addGitHubWebhookJob({
        projectId,
        deliveryId,
        payload: {
          event,
          data: request.body,
          headers: {
            'x-github-event': event,
            'x-github-delivery': deliveryId,
          }
        }
      });

      const processingTime = Date.now() - startTime;
      
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub webhook queued for processing',
        {
          projectId,
          deliveryId,
          event,
          processingTimeMs: processingTime,
          status: 'queued'
        }
      );

      // Return 202 within 10s - GitHub requirement
      return reply.code(202).send({
        message: 'GitHub webhook queued for processing',
        projectId,
        deliveryId,
        event,
        status: 'accepted',
        processingTimeMs: processingTime
      });

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      await loggingService.logCriticalError(
        'github_webhook_error',
        error,
        {
          projectId,
          deliveryId,
          event,
          processingTimeMs: processingTime
        }
      );

      return reply.code(500).send({
        error: 'Failed to process GitHub webhook',
        code: 'WEBHOOK_PROCESSING_ERROR',
        deliveryId,
        processingTimeMs: processingTime
      });
    }
  });

  // GitHub webhook health check endpoint
  app.get('/v1/webhooks/github/health', async (_, reply) => {
    const githubService = getGitHubAppService();
    
    return reply.send({
      status: 'healthy',
      webhookEnabled: !!process.env.GITHUB_WEBHOOK_SECRET,
      githubAppConfigured: !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // DEPRECATED: Old GitHub webhook handler - replaced with improved version
  // See webhook-improved.ts for the production-ready implementation
  /*
  // NEW: Unified GitHub webhook endpoint for GitHub App (resolves project internally)
  app.post('/v1/webhooks/github', async (
    request: FastifyRequest<{ 
      Body: GitHubWebhookPayload;
    }>,
    reply: FastifyReply
  ) => {
    const startTime = Date.now();
    const loggingService = ServerLoggingService.getInstance();
    
    const deliveryId = request.headers['x-github-delivery'] as string;
    const signature = request.headers['x-hub-signature-256'] as string;
    const event = request.headers['x-github-event'] as string;
    
    // Validate required headers
    if (!deliveryId || !signature || !event) {
      await loggingService.logServerEvent(
        'error',
        'warn',
        'GitHub webhook missing required headers',
        { deliveryId, hasSignature: !!signature, event }
      );
      return reply.code(400).send({
        error: 'Missing required headers',
        required: ['x-github-delivery', 'x-hub-signature-256', 'x-github-event']
      });
    }

    try {
      // Verify webhook signature first (before any database operations)
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!webhookSecret) {
        await loggingService.logServerEvent(
          'error',
          'error',
          'GitHub webhook secret not configured',
          { deliveryId }
        );
        return reply.code(500).send({
          error: 'Webhook secret not configured',
          code: 'WEBHOOK_SECRET_MISSING'
        });
      }

      // Verify GitHub webhook signature using raw body
      const rawBody = (request as any).rawBody as string;
      if (!rawBody) {
        await loggingService.logServerEvent(
          'error',
          'error',
          'GitHub webhook raw body not available',
          { deliveryId }
        );
        return reply.code(400).send({
          error: 'Raw body not available for signature verification',
          code: 'RAW_BODY_MISSING'
        });
      }

      // Try to get GitHub service for signature verification
      let githubService: any;
      try {
        githubService = getGitHubAppService();
      } catch (error) {
        // GitHub App not configured yet - use basic signature verification
        const crypto = await import('crypto');
        const expectedSignature = 'sha256=' + crypto.createHmac('sha256', webhookSecret)
          .update(rawBody)
          .digest('hex');
        
        if (signature !== expectedSignature) {
          await loggingService.logServerEvent(
            'error',
            'error',
            'GitHub webhook signature verification failed',
            { deliveryId, event }
          );
          return reply.code(401).send({
            error: 'Invalid webhook signature',
            code: 'INVALID_SIGNATURE'
          });
        }
      }

      // If GitHub service is available, use it for verification and deduplication
      if (githubService) {
        // Verify signature using GitHub service
        if (!githubService.verifyWebhookSignature(rawBody, signature, webhookSecret)) {
          await loggingService.logServerEvent(
            'error',
            'error',
            'GitHub webhook signature verification failed',
            { deliveryId, event }
          );
          return reply.code(401).send({
            error: 'Invalid webhook signature',
            code: 'INVALID_SIGNATURE'
          });
        }

        // Check for duplicate delivery (deduplication)
        if (await githubService.isDeliveryProcessed(deliveryId)) {
          await loggingService.logServerEvent(
            'capacity',
            'info',
            'GitHub webhook already processed (duplicate)',
            { deliveryId, event }
          );
          return reply.code(200).send({
            message: 'Webhook already processed',
            deliveryId,
            status: 'duplicate'
          });
        }

        // Mark delivery as processed
        await githubService.markDeliveryProcessed(deliveryId);
      }

      // Extract installation ID and repository from payload
      const payload = request.body as any;
      const installationId = payload.installation?.id;
      const repoFullName = payload.repository?.full_name;

      // Handle installation events (app installed/uninstalled)
      if (event === 'installation' || event === 'installation_repositories') {
        await loggingService.logServerEvent(
          'capacity',
          'info',
          'GitHub installation event received',
          { 
            deliveryId, 
            event, 
            action: payload.action,
            installationId,
            repositories: payload.repositories?.map((r: any) => r.full_name)
          }
        );
        
        // For now, just acknowledge - could store installation info later
        return reply.code(200).send({
          message: 'Installation event acknowledged',
          deliveryId,
          event,
          action: payload.action,
          status: 'acknowledged'
        });
      }

      // Handle ping event (GitHub webhook test)
      if (event === 'ping') {
        await loggingService.logServerEvent(
          'capacity',
          'info',
          'GitHub webhook ping received',
          { deliveryId, installationId, repository: repoFullName }
        );
        return reply.code(200).send({
          message: 'GitHub webhook ping received',
          deliveryId,
          repository: repoFullName,
          status: 'pong'
        });
      }

      // For repository events (push, pull_request), resolve project
      if (!installationId || !repoFullName) {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'GitHub webhook missing installation or repository',
          { deliveryId, event, hasInstallation: !!installationId, hasRepo: !!repoFullName }
        );
        return reply.code(400).send({
          error: 'Missing installation ID or repository',
          code: 'MISSING_CONTEXT'
        });
      }

      // Parse owner and name from full repository name
      const [repoOwner, repoName] = repoFullName.split('/');
      if (!repoOwner || !repoName) {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Invalid repository full name format',
          { deliveryId, event, repoFullName }
        );
        return reply.code(400).send({
          error: 'Invalid repository name format',
          code: 'INVALID_REPO_NAME'
        });
      }

      // Resolve project from database using installation ID and repository
      const { pool } = await import('../services/database');
      if (!pool) {
        console.error('Database pool not available for webhook processing');
        return reply.code(503).send({
          status: 'error',
          error: 'Database connection unavailable',
          code: 'DB_UNAVAILABLE'
        });
      }
      const client = await pool.connect();
      let projectId: string;

      try {
        const result = await client.query(
          `SELECT id FROM projects 
           WHERE github_installation_id = $1 
           AND LOWER(github_repo_owner) = LOWER($2) 
           AND LOWER(github_repo_name) = LOWER($3)
           AND github_sync_enabled = true`,
          [installationId.toString(), repoOwner, repoName]
        );

        if (result.rows.length === 0) {
          await loggingService.logServerEvent(
            'capacity',
            'info',
            'GitHub webhook for unlinked repository',
            { deliveryId, event, installationId, repository: repoFullName }
          );
          
          // Return 200 to prevent GitHub from retrying
          return reply.code(200).send({
            message: 'Repository not linked to any project',
            repository: repoFullName,
            status: 'ignored'
          });
        }

        projectId = result.rows[0].id;
      } finally {
        client.release();
      }

      // Process webhook asynchronously using BullMQ
      await addGitHubWebhookJob({
        projectId,
        deliveryId,
        payload: {
          event,
          data: request.body,
          headers: {
            'x-github-event': event,
            'x-github-delivery': deliveryId,
          }
        }
      });

      const processingTime = Date.now() - startTime;
      
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub webhook queued for processing',
        {
          projectId,
          deliveryId,
          event,
          repository: repoFullName,
          processingTimeMs: processingTime,
          status: 'queued'
        }
      );

      // Return 202 within 10s - GitHub requirement
      return reply.code(202).send({
        message: 'GitHub webhook queued for processing',
        projectId,
        deliveryId,
        event,
        repository: repoFullName,
        status: 'accepted',
        processingTimeMs: processingTime
      });

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      await loggingService.logCriticalError(
        'github_webhook_error',
        error,
        {
          deliveryId,
          event,
          processingTimeMs: processingTime
        }
      );

      return reply.code(500).send({
        error: 'Failed to process GitHub webhook',
        code: 'WEBHOOK_PROCESSING_ERROR',
        deliveryId,
        processingTimeMs: processingTime
      });
    }
  });
  */
  
  // Register the improved GitHub webhook handler
  registerImprovedWebhookRoutes(app);

  // Register OpenClaw webhook handler
  registerOpenClawWebhookRoutes(app);
}