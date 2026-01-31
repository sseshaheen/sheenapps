import { timingSafeEqual } from 'crypto';
import { verifyHMACv1, validateTimestamp } from '../utils/hmacHelpers';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Redis from 'ioredis';

// Redis connection for rate limiting (prevents memory leaks in long-lived workers)
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

// Rate limiting constants
const IP_RATE_LIMIT = parseInt(process.env.IP_RATE_LIMIT || '100', 10);
const IP_RATE_WINDOW = 60 * 60; // 1 hour in seconds
const USER_BUILD_LIMIT = 100; // 100 new builds per hour per user
const USER_BUILD_WINDOW = 60 * 60; // 1 hour in seconds

// Use correct HMAC v1 validation from hmacHelpers

async function checkIPRateLimit(ip: string): Promise<boolean> {
  const key = `ip-rate-limit:${ip}`;

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      // First request for this IP - set expiry
      await redis.expire(key, IP_RATE_WINDOW);
    }

    return current <= IP_RATE_LIMIT;
  } catch (error) {
    console.error('[Rate Limit] Redis error for IP check:', error);
    // Fail open - allow request if Redis is down
    return true;
  }
}

async function checkUserBuildLimit(userId: string): Promise<boolean> {
  const key = `user-build-limit:${userId}`;

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      // First request for this user - set expiry
      await redis.expire(key, USER_BUILD_WINDOW);
    }

    return current <= USER_BUILD_LIMIT;
  } catch (error) {
    console.error('[Rate Limit] Redis error for user check:', error);
    // Fail open - allow request if Redis is down
    return true;
  }
}

function formatTimeUntilReset(timeUntilReset: number): string {
  if (timeUntilReset <= 0) return 'now';

  const seconds = Math.floor(timeUntilReset / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

interface BuildPreviewBody {
  userId: string;
  projectId: string;
  prompt: string;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte';
}

export async function registerBuildPreviewRoutes(app: FastifyInstance) {
  // DEPRECATED: POST /build-preview-for-new-project
  // Use POST /v1/create-preview-for-new-project instead
  app.post<{ Body: BuildPreviewBody }>('/v1/build-preview', {
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
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: BuildPreviewBody }>, reply: FastifyReply) => {
    // DEPRECATION WARNING: Return 410 Gone with migration instructions
    return reply.code(410).headers({
      'Retry-After': '0',
      'X-Deprecated-Endpoint': 'true',
      'X-Replacement-Endpoint': 'POST /v1/create-preview-for-new-project',
      'X-Migration-Guide': '/docs/API_REFERENCE_FOR_NEXTJS.md'
    }).send({
      error: 'endpoint_deprecated',
      message: 'This endpoint has been deprecated and replaced',
      // replacement: {
        // endpoint: 'POST /v1/create-preview-for-new-project',
        // documentation: '/docs/API_REFERENCE_FOR_NEXTJS.md',
      // },
      deprecatedSince: '2025-08-03',
      removedSince: '2025-08-03'
    });

    /* ORIGINAL IMPLEMENTATION - PRESERVED FOR REFERENCE
    console.log('[Build Preview] Request received:', {
      body: request.body,
      headers: {
        'x-direct-mode': request.headers['x-direct-mode'],
        'x-sheen-signature': request.headers['x-sheen-signature'] ? 'present' : 'missing'
      }
    });

    // ORIGINAL IMPLEMENTATION COMMENTED OUT - USE /v1/create-preview-for-new-project INSTEAD
    /*
    // Verify signature - Environment variable should be validated at startup
    const SHARED_SECRET = process.env.SHARED_SECRET;
    if (!SHARED_SECRET) {
      console.error('FATAL: SHARED_SECRET environment variable is not set');
      return reply.code(500).send({ error: 'Server configuration error' });
    }

    const sig = (request.headers['x-sheen-signature'] as string) || '';
    const body = JSON.stringify(request.body);
    const signaturePath = '/build-preview-for-new-project';

    const timestamp = (request.headers['x-sheen-timestamp'] as string) || '';
    
    if (!sig || !timestamp || !validateTimestamp(timestamp) || !verifyHMACv1(body, timestamp, sig, SHARED_SECRET)) {
      console.log('[Build Preview] Signature verification failed');
      return reply.code(401).send({
        error: 'Invalid signature',
        serverTime: new Date().toISOString() // Expert feedback: Help debug clock skew
      });
    }

    // Check IP rate limit
    const ip = request.ip;
    const ipAllowed = await checkIPRateLimit(ip);
    if (!ipAllowed) {
      return reply.code(429).send({ error: 'IP rate limit exceeded' });
    }

    const { userId, projectId, prompt, framework } = request.body;

    // Validate and sanitize user/project IDs
    const sanitizedUserId = PathGuard.sanitizePathComponent(userId);
    const sanitizedProjectId = PathGuard.sanitizePathComponent(projectId);

    if (sanitizedUserId !== userId || sanitizedProjectId !== projectId) {
      return reply.code(400).send({
        error: 'Invalid request',
        message: 'User ID or Project ID contains invalid characters'
      });
    }

    // Check user build rate limit
    const userAllowed = await checkUserBuildLimit(userId);
    if (!userAllowed) {
      return reply.code(429).send({
        error: 'User build rate limit exceeded',
        limit: `${USER_BUILD_LIMIT} new builds per hour`
      });
    }

    // Pre-flight balance check for AI time billing
    console.log(`[Build Preview] Checking AI time balance for user ${userId}`);
    const balanceCheck = await metricsService.checkSufficientAITimeBalance(
      userId,
      undefined // Let it use default estimate for main_build
    );

    if (!balanceCheck.sufficient) {
      console.log(`[Build Preview] Insufficient AI time balance for ${userId}:`, {
        available: balanceCheck.balance?.total || 0,
        required: 'estimated 3+ minutes'
      });

      return reply.code(402).send({
        error: 'insufficient_ai_time',
        message: 'Insufficient AI time balance to start build',
        balance: balanceCheck.balance,
        estimate: balanceCheck.estimate,
        required: 180 // Default 3 minutes in seconds
      });
    }

    console.log(`[Build Preview] AI time balance check passed for ${userId}:`, {
      available: balanceCheck.balance?.total || 0
    });

    // Pre-flight system and usage limit validation
    try {
      console.log(`[Build Preview] Running pre-request validation checks`);

      // 1. Check system configuration first
      const baseProjectPath = process.platform === 'darwin'
        ? '/Users/sh/projects'
        : '/home/worker/projects';
      const projectPath = `${baseProjectPath}/${sanitizedUserId}/${sanitizedProjectId}`;

      const systemValidation = SystemValidationService.getInstance();
      const validationResult = await systemValidation.validateClaudeAccess(projectPath);

      if (!validationResult.isValid) {
        const error = validationResult.errors[0];
        console.log(`[Build Preview] System configuration error:`, error);

        return reply.code(503).send({
          error: 'system_configuration_error',
          message: error.message,
          configurationType: error.type,
          resolution: error.resolution,
          retryAfter: null
        });
      }

      // 2. Check usage limit status
      const usageLimitService = UsageLimitService.getInstance();
      const isLimitActive = await usageLimitService.isLimitActive();

      if (isLimitActive) {
        const resetTime = await usageLimitService.getResetTime();
        const timeUntilReset = await usageLimitService.getTimeUntilReset();
        const errorMessage = await usageLimitService.getErrorMessage();

        console.log(`[Build Preview] Usage limit active until ${resetTime ? new Date(resetTime).toISOString() : 'unknown'}`);

        const errorResponse = {
          error: 'usage_limit_exceeded',
          message: errorMessage || `Claude CLI usage limit active. Resets at ${resetTime ? new Date(resetTime).toISOString() : 'unknown time'}`,
          status: 429,
          resetTime: resetTime ? new Date(resetTime).toISOString() : null,
          retryAfter: Math.ceil((timeUntilReset || 0) / 1000),
          timeUntilReset: timeUntilReset || 0,
          timeUntilResetHuman: formatTimeUntilReset(timeUntilReset || 0)
        };

        reply.header('Retry-After', String(Math.ceil((timeUntilReset || 0) / 1000)));
        return reply.code(429).send(errorResponse);
      }

      console.log(`[Build Preview] Pre-request validation passed`);

    } catch (validationError: any) {
      console.error(`[Build Preview] Pre-request validation failed:`, validationError);
      return reply.code(503).send({
        error: 'system_validation_error',
        message: 'System validation failed'
      });
    }

    // Check if project is in rollback state
    try {
      const projectConfig = await getProjectConfig(sanitizedProjectId);

      if (projectConfig?.status === 'rollingBack') {
        console.log(`[Build Preview] Project ${sanitizedProjectId} is in rollback state - request will be queued`);

        // For rollback state, queue the build with special flag for post-rollback processing
        // This request will be delayed and retried until rollback completes
        const buildId = ulid();
        const versionId = ulid();

        const baseProjectPath = process.platform === 'darwin'
          ? '/Users/sh/projects'
          : '/home/worker/projects';

        const projectPath = `${baseProjectPath}/${sanitizedUserId}/${sanitizedProjectId}`;

        const job = await streamQueue.add('claude-build', {
          buildId,
          userId: sanitizedUserId,
          projectId: sanitizedProjectId,
          prompt,
          framework: framework || undefined,
          projectPath,
          versionId,
          isInitialBuild: true,
          delayUntilRollbackComplete: true,
          queuedDuringRollback: true
        }, {
          delay: 30000, // Check again in 30 seconds
          attempts: 10   // Keep retrying until rollback completes
        });

        return reply.send({
          success: true,
          queued: true,
          jobId: job.id,
          buildId: buildId,
          status: 'queued_rollback_pending',
          message: 'Request queued - rollback in progress. Build will start when rollback completes.'
        });
      }

      if (projectConfig?.status === 'rollbackFailed') {
        return reply.code(409).send({
          error: 'rollback_failed',
          message: 'Recent rollback failed. Please resolve issues before building.',
          status: projectConfig.status
        });
      }
    } catch (configError: any) {
      console.warn(`[Build Preview] Could not check project config for rollback status:`, configError);
      // Continue with normal build if we can't check status
    }

    try {
      // Queue mode - use stream queue
      console.log('[Build Preview] Using queue mode with stream queue');
      const buildId = ulid();
      const versionId = ulid();

      const baseProjectPath = process.platform === 'darwin'
        ? '/Users/sh/projects'
        : '/home/worker/projects';

      const projectPath = `${baseProjectPath}/${sanitizedUserId}/${sanitizedProjectId}`;

      console.log('[Build Preview] Adding job to stream queue:', {
        buildId,
        userId: sanitizedUserId,
        projectId: sanitizedProjectId,
        framework: framework || undefined
      });

      const job = await streamQueue.add('claude-build', {
        buildId,
        userId: sanitizedUserId,
        projectId: sanitizedProjectId,
        prompt,
        framework: framework || undefined,
        projectPath,
        versionId,
        isInitialBuild: true
      });

      // Add rate limit headers for intelligent client backoff
      reply.header('x-ratelimit-remaining', '25'); // Lower limit for resource-intensive builds
      reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour

      return reply.send({
        success: true,
        jobId: job.id,
        buildId: buildId,
        status: 'queued',
        message: 'Build preview job queued successfully'
      });

    } catch (error: any) {
      console.error('[Build Preview] Error:', error);
      return reply.code(500).send({
        error: 'Failed to create build preview',
        message: error instanceof Error ? error.message : 'Failed to process build request'
      });
    }
    */
  });
}
