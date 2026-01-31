import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { ServerLoggingService } from '../services/serverLoggingService';
import { VercelPRCommentService } from '../services/vercelPRCommentService';
import { getPool } from '../services/database';

/**
 * Vercel Webhook Handlers
 * Processes webhooks from Vercel for deployment events, project updates, etc.
 * Implements secure signature validation and idempotent processing
 */

interface VercelWebhookPayload {
  id: string;
  type: 'deployment.created' | 'deployment.ready' | 'deployment.error' | 'deployment.canceled' | 
        'project.created' | 'project.removed';
  createdAt: number;
  data: {
    deployment?: {
      id: string;
      url: string;
      name: string;
      state: 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
      type: 'LAMBDAS';
      created: number;
      ready?: number;
      target?: 'production' | 'staging';
      projectId: string;
      meta?: {
        githubCommitSha?: string;
        githubCommitMessage?: string;
        githubCommitAuthorName?: string;
        githubCommitRef?: string;
        githubPrId?: string;
      };
      regions: string[];
      functions?: Record<string, any>;
      aliasError?: {
        code: string;
        message: string;
      };
    };
    project?: {
      id: string;
      name: string;
      accountId: string;
      createdAt: number;
      framework?: string;
    };
  };
  teamId?: string;
  userId?: string;
}

export async function vercelWebhookRoutes(fastify: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();
  const prCommentService = new VercelPRCommentService();

  // Custom content type parser for raw webhook payload
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
   * Validate Vercel webhook signature
   */
  function validateWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    const webhookSecret = process.env.VERCEL_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      throw new Error('VERCEL_WEBHOOK_SECRET environment variable not configured');
    }

    if (!signature) {
      return false;
    }

    // Vercel uses SHA1 HMAC with 'sha1=' prefix
    const expectedSignature = 'sha1=' + crypto
      .createHmac('sha1', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }

  /**
   * Check for duplicate webhook processing
   */
  async function checkWebhookDeduplication(
    eventId: string, 
    deploymentId: string | undefined,
    payloadHash: string
  ): Promise<boolean> {
    const result = await getPool().query(
      `SELECT id FROM vercel_webhook_dedup 
       WHERE event_id = $1 OR (deployment_id = $2 AND payload_hash = $3)`,
      [eventId, deploymentId, payloadHash]
    );

    return result.rows.length > 0;
  }

  /**
   * Record webhook for deduplication
   */
  async function recordWebhook(
    eventId: string,
    deploymentId: string | undefined,
    payloadHash: string
  ): Promise<void> {
    await getPool().query(
      `INSERT INTO vercel_webhook_dedup (event_id, deployment_id, payload_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       ON CONFLICT (deployment_id, payload_hash) DO NOTHING`,
      [eventId, deploymentId, payloadHash]
    );
  }

  /**
   * Process deployment webhook events
   */
  async function processDeploymentWebhook(payload: VercelWebhookPayload): Promise<void> {
    const { data, type } = payload;
    const deployment = data.deployment;

    if (!deployment) {
      throw new Error('Missing deployment data in webhook payload');
    }

    // Find the corresponding project mapping
    const mappingResult = await getPool().query(
      `SELECT vpm.*, p.id as local_project_id, p.owner_id
       FROM vercel_project_mappings vpm
       JOIN projects p ON vpm.project_id = p.id
       WHERE vpm.vercel_project_id = $1`,
      [deployment.projectId]
    );

    if (mappingResult.rows.length === 0) {
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Webhook received for unmapped project',
        { 
          webhookType: type,
          vercelProjectId: deployment.projectId,
          deploymentId: deployment.id 
        }
      );
      return;
    }

    const mapping = mappingResult.rows[0];

    // Validate state transition if deployment exists
    const existingResult = await getPool().query(
      'SELECT deployment_state FROM vercel_deployments WHERE deployment_id = $1',
      [deployment.id]
    );

    let validTransition = true;
    if (existingResult.rows.length > 0) {
      const currentState = existingResult.rows[0].deployment_state;
      const newState = deployment.state;
      
      // Use the validation function from our migration
      const transitionResult = await getPool().query(
        'SELECT validate_vercel_deployment_state_transition($1::vercel_deploy_state, $2::vercel_deploy_state)',
        [currentState, newState]
      );
      
      validTransition = transitionResult.rows[0].validate_vercel_deployment_state_transition;
      
      if (!validTransition) {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Invalid deployment state transition detected',
          { 
            deploymentId: deployment.id,
            fromState: currentState,
            toState: newState,
            webhookType: type
          }
        );
      }
    }

    // Update or insert deployment record
    const deploymentData = {
      deployment_id: deployment.id,
      project_id: mapping.local_project_id,
      vercel_project_mapping_id: mapping.id,
      deployment_url: deployment.url,
      deployment_state: deployment.state,
      deployment_type: deployment.target === 'production' ? 'PRODUCTION' : 'PREVIEW',
      git_source: JSON.stringify(deployment.meta || {}),
      build_duration_ms: deployment.ready && deployment.created 
        ? (deployment.ready - deployment.created) * 1000 
        : null,
      ready_at: deployment.ready ? new Date(deployment.ready * 1000) : null,
      completed_at: ['READY', 'ERROR', 'CANCELED'].includes(deployment.state)
        ? new Date()
        : null,
      error_message: deployment.aliasError?.message || null,
      error_code: deployment.aliasError?.code || null,
      metadata: JSON.stringify({
        regions: deployment.regions,
        functions: deployment.functions ? Object.keys(deployment.functions) : [],
        webhookProcessedAt: new Date().toISOString(),
        originalWebhookType: type
      })
    };

    if (existingResult.rows.length > 0) {
      // Update existing deployment
      await getPool().query(
        `UPDATE vercel_deployments 
         SET deployment_url = $1, deployment_state = $2, deployment_type = $3,
             build_duration_ms = $4, ready_at = $5, completed_at = $6,
             error_message = $7, error_code = $8, metadata = $9, updated_at = NOW()
         WHERE deployment_id = $10`,
        [
          deploymentData.deployment_url,
          deploymentData.deployment_state,
          deploymentData.deployment_type,
          deploymentData.build_duration_ms,
          deploymentData.ready_at,
          deploymentData.completed_at,
          deploymentData.error_message,
          deploymentData.error_code,
          deploymentData.metadata,
          deployment.id
        ]
      );
    } else {
      // Insert new deployment record
      await getPool().query(
        `INSERT INTO vercel_deployments (
           deployment_id, project_id, vercel_project_mapping_id, deployment_url,
           deployment_state, deployment_type, git_source, build_duration_ms,
           ready_at, completed_at, error_message, error_code, metadata,
           created_at, environment, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
           $14, $15, $16
         )`,
        [
          deploymentData.deployment_id,
          deploymentData.project_id,
          deploymentData.vercel_project_mapping_id,
          deploymentData.deployment_url,
          deploymentData.deployment_state,
          deploymentData.deployment_type,
          deploymentData.git_source,
          deploymentData.build_duration_ms,
          deploymentData.ready_at,
          deploymentData.completed_at,
          deploymentData.error_message,
          deploymentData.error_code,
          deploymentData.metadata,
          new Date(deployment.created * 1000),
          deployment.target || 'preview',
          payload.userId || 'webhook'
        ]
      );
    }

    // Update PR comments if this deployment is associated with a PR
    if (deployment.meta?.githubPrId || deployment.target !== 'production') {
      const prNumber = deployment.meta?.githubPrId ? parseInt(deployment.meta.githubPrId) : null;
      const branch = deployment.meta?.githubCommitRef || 'unknown';
      const commitSha = deployment.meta?.githubCommitSha || 'unknown';

      // Determine PR comment status based on deployment state
      let prStatus: 'pending' | 'building' | 'ready' | 'error' | 'canceled';
      switch (deployment.state) {
        case 'BUILDING':
          prStatus = 'building';
          break;
        case 'READY':
          prStatus = 'ready';
          break;
        case 'ERROR':
          prStatus = 'error';
          break;
        case 'CANCELED':
          prStatus = 'canceled';
          break;
        default:
          prStatus = 'pending';
      }

      // Update PR comment if PR number is available
      if (prNumber) {
        try {
          await prCommentService.updateDeploymentComment(
            mapping.local_project_id,
            deployment.id,
            prNumber,
            prStatus,
            {
              branch: branch.replace('refs/heads/', ''),
              commitSha: commitSha,
              deploymentUrl: `https://vercel.com/${deployment.projectId}/${deployment.id}`,
              previewUrl: deployment.url,
              buildLogsUrl: `https://vercel.com/${deployment.projectId}/${deployment.id}/functions`,
              errorMessage: deployment.aliasError?.message,
              buildDuration: deployment.ready && deployment.created ? (deployment.ready - deployment.created) * 1000 : undefined,
              startTime: new Date(deployment.created * 1000),
              completedTime: deployment.ready ? new Date(deployment.ready * 1000) : undefined
            }
          );
        } catch (prError) {
          await loggingService.logServerEvent(
            'error',
            'warn',
            'Failed to update PR comment',
            {
              deploymentId: deployment.id,
              prNumber,
              error: (prError as Error).message
            }
          );
        }
      }
    }

    await loggingService.logServerEvent(
      'capacity',
      'info',
      'Deployment webhook processed successfully',
      {
        webhookType: type,
        deploymentId: deployment.id,
        projectId: mapping.local_project_id,
        state: deployment.state,
        validTransition,
        userId: mapping.user_id
      }
    );
  }

  /**
   * Process project webhook events
   */
  async function processProjectWebhook(payload: VercelWebhookPayload): Promise<void> {
    const { data, type } = payload;
    const project = data.project;

    if (!project) {
      throw new Error('Missing project data in webhook payload');
    }

    if (type === 'project.removed') {
      // Handle project deletion
      const mappingResult = await getPool().query(
        'SELECT id, project_id FROM vercel_project_mappings WHERE vercel_project_id = $1',
        [project.id]
      );

      for (const mapping of mappingResult.rows) {
        await getPool().query(
          'UPDATE vercel_project_mappings SET metadata = COALESCE(metadata, $1::jsonb) WHERE id = $2',
          [
            JSON.stringify({
              deletedFromVercel: true,
              deletedAt: new Date().toISOString(),
              lastKnownName: project.name
            }),
            mapping.id
          ]
        );

        await loggingService.logServerEvent(
          'capacity',
          'warn',
          'Vercel project was deleted remotely',
          {
            vercelProjectId: project.id,
            localProjectId: mapping.project_id,
            projectName: project.name
          }
        );
      }
    } else if (type === 'project.created') {
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'New Vercel project created',
        {
          vercelProjectId: project.id,
          projectName: project.name,
          framework: project.framework
        }
      );
    }
  }

  /**
   * Main webhook endpoint
   * POST /v1/webhooks/vercel
   */
  fastify.post<{ Body: VercelWebhookPayload }>(
    '/v1/webhooks/vercel',
    async (request: FastifyRequest<{ Body: VercelWebhookPayload }>, reply: FastifyReply) => {
      const signature = request.headers['x-vercel-signature'] as string;
      const rawBody = (request as any).rawBody as Buffer;
      const payload = request.body;

      try {
        // Validate webhook signature
        if (!validateWebhookSignature(rawBody, signature)) {
          await loggingService.logServerEvent(
            'error',
            'error',
            'Invalid Vercel webhook signature',
            { 
              hasSignature: !!signature,
              payloadSize: rawBody.length,
              eventType: payload.type
            }
          );
          return reply.code(401).send({ error: 'Invalid signature' });
        }

        // Check for webhook deduplication
        const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
        const deploymentId = payload.data.deployment?.id;
        
        const isDuplicate = await checkWebhookDeduplication(
          payload.id, 
          deploymentId,
          payloadHash
        );

        if (isDuplicate) {
          await loggingService.logServerEvent(
            'capacity',
            'info',
            'Duplicate webhook ignored',
            { eventId: payload.id, eventType: payload.type }
          );
          return reply.code(200).send({ message: 'Webhook already processed' });
        }

        // Record webhook for deduplication
        await recordWebhook(payload.id, deploymentId, payloadHash);

        // Process webhook based on type
        if (payload.type.startsWith('deployment.')) {
          await processDeploymentWebhook(payload);
        } else if (payload.type.startsWith('project.')) {
          await processProjectWebhook(payload);
        } else {
          await loggingService.logServerEvent(
            'capacity',
            'info',
            'Unhandled webhook type received',
            { eventType: payload.type, eventId: payload.id }
          );
        }

        // Store webhook event for audit trail
        await getPool().query(
          `INSERT INTO vercel_webhook_events (
             event_id, event_type, vercel_project_id, deployment_id,
             team_id, user_id, payload, processed, processed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            payload.id,
            payload.type,
            payload.data.deployment?.projectId || payload.data.project?.id || null,
            deploymentId || null,
            payload.teamId || null,
            payload.userId || null,
            JSON.stringify(payload),
            true,
            new Date()
          ]
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel webhook processed successfully',
          {
            eventId: payload.id,
            eventType: payload.type,
            deploymentId,
            projectId: payload.data.deployment?.projectId || payload.data.project?.id,
            processingTimeMs: Date.now() - payload.createdAt
          }
        );

        reply.code(200).send({ message: 'Webhook processed successfully' });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_webhook_processing_error',
          error as Error,
          {
            eventId: payload?.id,
            eventType: payload?.type,
            payloadSize: rawBody?.length,
            hasValidSignature: !!signature
          }
        );

        // Mark webhook as failed for potential retry
        try {
          await getPool().query(
            `INSERT INTO vercel_webhook_events (
               event_id, event_type, payload, processed, processing_error, retry_count
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (event_id) DO UPDATE SET
               processing_error = EXCLUDED.processing_error,
               retry_count = COALESCE(vercel_webhook_events.retry_count, 0) + 1`,
            [
              payload?.id || 'unknown',
              payload?.type || 'unknown',
              JSON.stringify(payload || {}),
              false,
              (error as Error).message,
              1
            ]
          );
        } catch (logError) {
          // Ignore logging errors to prevent webhook failure loops
        }

        reply.code(500).send({ 
          error: 'Webhook processing failed',
          eventId: payload?.id
        });
      }
    }
  );

  /**
   * GET /v1/webhooks/vercel/health
   * Health check for webhook processing
   */
  fastify.get('/v1/webhooks/vercel/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check recent webhook processing stats
      const statsResult = await getPool().query(`
        SELECT 
          COUNT(*) as total_webhooks,
          COUNT(*) FILTER (WHERE processed = true) as processed_successfully,
          COUNT(*) FILTER (WHERE processed = false) as failed_webhooks,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as recent_webhooks
        FROM vercel_webhook_events
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = statsResult.rows[0];
      const successRate = stats.total_webhooks > 0 
        ? (parseFloat(stats.processed_successfully) / parseFloat(stats.total_webhooks)) * 100
        : 100;

      // Check deduplication table size
      const dedupResult = await getPool().query(
        'SELECT COUNT(*) as dedup_records FROM vercel_webhook_dedup'
      );

      const isHealthy = successRate >= 95 && parseInt(stats.failed_webhooks) < 10;

      reply.send({
        healthy: isHealthy,
        stats: {
          total24h: parseInt(stats.total_webhooks),
          successful24h: parseInt(stats.processed_successfully),
          failed24h: parseInt(stats.failed_webhooks),
          recent1h: parseInt(stats.recent_webhooks),
          successRate: Math.round(successRate * 100) / 100
        },
        deduplicationRecords: parseInt(dedupResult.rows[0].dedup_records),
        webhookSecret: !!process.env.VERCEL_WEBHOOK_SECRET,
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