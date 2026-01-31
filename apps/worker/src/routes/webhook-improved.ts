import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { ServerLoggingService } from '../services/serverLoggingService';
import { webhookQueue, requireQueue } from '../queue/modularQueues';
import { pool } from '../services/database';
import { getGitHubAppService } from '../services/githubAppService';

interface GitHubWebhookPayload {
  installation?: {
    id: number;
  };
  repository?: {
    id: number;
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
  repositories_added?: Array<{
    id: number;
    full_name: string;
    name: string;
  }>;
  repositories_removed?: Array<{
    id: number;
    full_name: string;
    name: string;
  }>;
  action?: string;
  [key: string]: any;
}

// Helper to verify GitHub webhook signature
function verifyGitHubSignature(rawBody: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  
  // Use timingSafeEqual to prevent timing attacks
  const sourceBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  
  if (sourceBuffer.length !== expectedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(sourceBuffer, expectedBuffer);
}

// Helper to find project by installation and repo
async function findProjectBy(
  installationId: number,
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  repo: { repoId?: number | undefined; owner?: string | undefined; name?: string | undefined }
): Promise<string | null> {
  if (!pool) return null;
  
  const client = await pool.connect();
  try {
    // Primary: Use repo ID if available (stable across renames)
    if (repo.repoId) {
      const result = await client.query(
        `SELECT id FROM projects 
         WHERE github_installation_id = $1 
         AND github_repo_id = $2
         AND github_sync_enabled = true
         LIMIT 1`,
        [installationId.toString(), repo.repoId]
      );
      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    }
    
    // Fallback: Use owner/name (for legacy or during rename window)
    if (repo.owner && repo.name) {
      const result = await client.query(
        `SELECT id FROM projects 
         WHERE github_installation_id = $1 
         AND LOWER(github_repo_owner) = LOWER($2) 
         AND LOWER(github_repo_name) = LOWER($3)
         AND github_sync_enabled = true
         LIMIT 1`,
        [installationId.toString(), repo.owner, repo.name]
      );
      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    }
    
    return null;
  } finally {
    client.release();
  }
}

// Helper to check if delivery was already processed
async function isDeliveryProcessed(deliveryId: string): Promise<boolean> {
  try {
    const githubService = getGitHubAppService();
    return await githubService.isDeliveryProcessed(deliveryId);
  } catch {
    // If GitHub service not available, check in database
    if (!pool) return false;
    
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 1 FROM github_sync_operations 
         WHERE metadata->>'delivery_id' = $1
         LIMIT 1`,
        [deliveryId]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }
}

// Helper to mark delivery as processed
async function markDeliveryProcessed(deliveryId: string): Promise<void> {
  try {
    const githubService = getGitHubAppService();
    await githubService.markDeliveryProcessed(deliveryId);
  } catch {
    // If GitHub service not available, mark in database
    if (!pool) return;
    
    const client = await pool.connect();
    try {
      // Insert a record to track this delivery
      await client.query(
        `INSERT INTO github_sync_operations 
         (project_id, operation_type, status, metadata, created_at, updated_at)
         VALUES (NULL, 'webhook_received', 'completed', $1, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [JSON.stringify({ delivery_id: deliveryId, processed_at: new Date().toISOString() })]
      );
    } finally {
      client.release();
    }
  }
}

// Helper to enqueue webhook for processing
async function enqueueWebhook(
  projectId: string | null,
  event: string,
  deliveryId: string,
  payload: any
): Promise<void> {
  const loggingService = ServerLoggingService.getInstance();
  
  const jobData = {
    type: 'github_webhook',
    projectId,
    event,
    deliveryId,
    payload,
    timestamp: new Date().toISOString(),
    // Mark as unmapped if no project found
    status: projectId ? 'mapped' : 'unmapped'
  };
  
  await requireQueue(webhookQueue, 'webhooks').add(
    `github-${event}`,
    jobData as any, // GitHub webhook data doesn't match WebhookPayload type
    {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    }
  );
  
  await loggingService.logServerEvent(
    'capacity',
    'info',
    projectId ? 'GitHub webhook enqueued' : 'Unmapped GitHub webhook enqueued',
    { 
      deliveryId, 
      event, 
      projectId,
      queueName: 'webhookQueue'
    }
  );
}

export function registerImprovedWebhookRoutes(app: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();
  
  // Production-ready GitHub webhook endpoint
  app.post('/v1/webhooks/github', async (
    request: FastifyRequest<{ Body: GitHubWebhookPayload }>,
    reply: FastifyReply
  ) => {
    const rawBody = (request as any).rawBody as string;
    const signature = request.headers['x-hub-signature-256'] as string;
    const deliveryId = request.headers['x-github-delivery'] as string;
    const event = request.headers['x-github-event'] as string;
    
    // Step 1: Verify signature FIRST (before anything else)
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret || !rawBody || !signature) {
      // Log but don't fail - return 202 to prevent retries
      await loggingService.logServerEvent(
        'error',
        'error',
        'GitHub webhook configuration issue',
        { hasSecret: !!webhookSecret, hasRawBody: !!rawBody, hasSignature: !!signature }
      );
      return reply.code(202).send({ status: 'ignored' });
    }
    
    if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'GitHub webhook signature verification failed',
        { deliveryId, event }
      );
      // Return 401 for invalid signatures (this is the one case we want GitHub to know about)
      return reply.code(401).send({ status: 'unauthorized' });
    }
    
    // Step 2: Check for duplicate delivery (idempotency)
    if (!deliveryId) {
      // No delivery ID - can't dedupe, but process anyway
      await loggingService.logServerEvent(
        'error',
        'warn',
        'GitHub webhook missing delivery ID',
        { event }
      );
    } else if (await isDeliveryProcessed(deliveryId)) {
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub webhook already processed (duplicate)',
        { deliveryId, event }
      );
      return reply.code(200).send({ status: 'duplicate' });
    }
    
    // Step 3: Parse payload
    const payload = request.body as GitHubWebhookPayload;
    const installationId = payload.installation?.id;
    const repository = payload.repository;
    
    // Step 4: Handle different event types
    
    // Special case: ping event (just acknowledge)
    if (event === 'ping') {
      if (deliveryId) await markDeliveryProcessed(deliveryId);
      return reply.code(200).send({ status: 'pong' });
    }
    
    // Special case: installation_repositories event (batch processing)
    if (event === 'installation_repositories' && installationId) {
      const repos = [
        ...(payload.repositories_added || []),
        ...(payload.repositories_removed || [])
      ];
      
      for (const repo of repos) {
        const projectId = await findProjectBy(installationId, {
          repoId: repo.id,
          owner: repo.full_name?.split('/')[0],
          name: repo.name
        });
        
        if (projectId) {
          await enqueueWebhook(projectId, event, deliveryId || 'unknown', payload);
        }
      }
      
      if (deliveryId) await markDeliveryProcessed(deliveryId);
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub installation_repositories event processed',
        { 
          deliveryId, 
          installationId,
          added: payload.repositories_added?.length || 0,
          removed: payload.repositories_removed?.length || 0
        }
      );
      return reply.code(202).send({ status: 'accepted' });
    }
    
    // Standard repository events (push, pull_request, etc.)
    let projectId: string | null = null;
    
    if (installationId && repository) {
      // Try to find project by repo ID (preferred) or owner/name (fallback)
      projectId = await findProjectBy(installationId, {
        repoId: repository.id,
        owner: repository.owner?.login,
        name: repository.name
      });
    }
    
    // Step 5: Mark as processed and enqueue
    if (deliveryId) await markDeliveryProcessed(deliveryId);
    
    // Always enqueue - even unmapped webhooks for operational visibility
    await enqueueWebhook(
      projectId,
      event || 'unknown',
      deliveryId || 'unknown',
      payload
    );
    
    // Step 6: Always return 202 Accepted
    return reply.code(202).send({
      status: 'accepted',
      mapped: !!projectId
    });
  });
  
  console.log('✅ Improved GitHub webhook endpoint registered: POST /v1/webhooks/github');
}