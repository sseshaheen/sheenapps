import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enqueueBuild } from '../queue/enqueue';
import { getLatestProjectVersion } from '../services/databaseWrapper';
import { executeBuildDirect, isDirectModeEnabled } from '../services/directBuildService';
import { PathGuard } from '../services/pathGuard';
import { metricsService } from '../services/metricsService';
import { requireHmacSignature } from '../middleware/hmacValidation';

// Use HMAC middleware for consistent signature validation

interface UpdateProjectBody {
  userId: string;
  projectId: string;
  prompt: string;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte';
  webhookUrl?: string;
}

// Per-project update rate limiting
const projectUpdateLimits = new Map<string, { count: number; resetTime: number }>();
const PROJECT_UPDATE_LIMIT = 50; // 50 updates per hour per project
const PROJECT_UPDATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkProjectUpdateRateLimit(projectKey: string): boolean {
  const now = Date.now();
  const limit = projectUpdateLimits.get(projectKey);

  if (!limit || now > limit.resetTime) {
    projectUpdateLimits.set(projectKey, { count: 1, resetTime: now + PROJECT_UPDATE_WINDOW });
    return true;
  }

  if (limit.count >= PROJECT_UPDATE_LIMIT) {
    return false;
  }

  limit.count++;
  return true;
}

export async function updateProjectRoute(app: FastifyInstance) {
  // Apply HMAC validation middleware
  const hmacMiddleware = requireHmacSignature();
  
  app.post<{ Body: UpdateProjectBody }>('/v1/update-project', {
    preHandler: hmacMiddleware as any,
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'projectId', 'prompt'],
        properties: {
          userId: { type: 'string' },
          projectId: { type: 'string' },
          prompt: { type: 'string' },
          framework: { 
            type: 'string',
            enum: ['react', 'nextjs', 'vue', 'svelte']
          },
          webhookUrl: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: UpdateProjectBody }>, reply: FastifyReply) => {
    const { userId, projectId, prompt, framework, webhookUrl } = request.body;

    // Validate and sanitize user/project IDs
    const sanitizedUserId = PathGuard.sanitizePathComponent(userId);
    const sanitizedProjectId = PathGuard.sanitizePathComponent(projectId);

    if (sanitizedUserId !== userId || sanitizedProjectId !== projectId) {
      return reply.code(400).send({
        error: 'Invalid request',
        message: 'User ID or Project ID contains invalid characters'
      });
    }

    // Check rate limits
    const projectKey = `${userId}:${projectId}`;
    if (!checkProjectUpdateRateLimit(projectKey)) {
      return reply.code(429).send({
        error: 'Too many update requests',
        message: `Exceeded ${PROJECT_UPDATE_LIMIT} updates per hour for this project`
      });
    }

    // Pre-flight balance check for AI time billing
    console.log(`[Update Project] Checking AI time balance for user ${userId}`);
    const balanceCheck = await metricsService.checkSufficientAITimeBalance(
      userId, 
      undefined // Let it use default estimate for update operations
    );
    
    if (!balanceCheck.sufficient) {
      console.log(`[Update Project] Insufficient AI time balance for ${userId}:`, {
        available: balanceCheck.balance?.total || 0,
        required: 'estimated 3+ minutes'
      });
      
      return reply.code(402).send({
        error: 'insufficient_ai_time',
        message: 'Insufficient AI time balance to start update',
        balance: balanceCheck.balance,
        estimate: balanceCheck.estimate,
        required: 180 // Default 3 minutes in seconds
      });
    }
    
    console.log(`[Update Project] AI time balance check passed for ${userId}:`, {
      available: balanceCheck.balance?.total || 0
    });

    try {
      // Get latest version for the project
      console.log(`[Update Project] Fetching latest version for ${userId}/${projectId}`);
      const latestVersion = await getLatestProjectVersion(userId, projectId);
      
      if (!latestVersion) {
        return reply.code(404).send({
          error: 'Project not found',
          message: 'No existing project found with the given userId and projectId'
        });
      }

      // Use framework from latest version if not provided
      const targetFramework = (framework || latestVersion.framework || 'react') as 'react' | 'nextjs' | 'vue' | 'svelte';

      console.log(`[Update Project] Creating update for ${userId}/${projectId}`);
      console.log(`[Update Project] Base version: ${latestVersion.versionId}`);
      console.log(`[Update Project] Framework: ${targetFramework}`);

      // Check if direct mode is enabled
      if (isDirectModeEnabled()) {
        console.log('[Update Project] Using direct mode (bypass queue)');
        const result = await executeBuildDirect({
          userId,
          projectId,
          prompt,
          framework: targetFramework,
          isInitialBuild: false,
          baseVersionId: latestVersion.versionId
        });

        // Add rate limit headers for intelligent client backoff
        reply.header('x-ratelimit-remaining', '35'); // Moderate limit for updates
        reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour
        
        return reply.send({
          success: true,
          buildId: result.versionId, // Use versionId as buildId for consistency
          projectId,
          message: 'Update completed',
          previewUrl: result.previewUrl,
          versionId: result.versionId
        });
      }

      // Queue the update job - each version gets a new unique session ID
      const job = await enqueueBuild({
        userId,
        projectId,
        prompt,
        framework: targetFramework,
        isInitialBuild: false,
        baseVersionId: latestVersion.versionId
        // Remove previousSessionId to ensure each version gets unique session ID
      });

      // Add rate limit headers for intelligent client backoff
      reply.header('x-ratelimit-remaining', '35'); // Moderate limit for updates
      reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour
      
      return reply.send({
        success: true,
        buildId: job.data?.buildId || job.id,
        jobId: job.id,
        projectId,
        message: 'Update queued successfully',
        baseVersionId: latestVersion.versionId,
        estimatedTime: '30-45 seconds for small changes',
        // Note: sessionId will be available via webhook when job completes
        // The stream worker will automatically update projects.last_ai_session_id
      });

    } catch (error) {
      console.error('[Update Project] Error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to process update request'
      });
    }
  });
}