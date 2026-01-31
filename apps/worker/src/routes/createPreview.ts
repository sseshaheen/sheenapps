import { QueueEvents } from 'bullmq';
import { timingSafeEqual } from 'crypto';
import { verifyHMACv1, validateTimestamp } from '../utils/hmacHelpers';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as fs from 'fs/promises';
import Redis from 'ioredis';
import * as path from 'path';
import { ulid } from 'ulid';
import { isDirectModeEnabled } from '../config/directMode';
import { streamQueue } from '../queue/streamQueue';
import { PathGuard } from '../services/pathGuard';
import { WebhookService } from '../services/webhookService';
import { metricsService } from '../services/metricsService';
import { InsufficientAITimeError } from '../services/aiTimeBillingService';
import { SystemValidationService } from '../services/systemValidationService';
import { UsageLimitService } from '../services/usageLimitService';
import { getProjectConfig } from '../services/projectConfigService';
import { systemErrorToAPIResponse, getSystemErrorStatus, getRetryAfterHeader } from '../errors/systemErrors';
import { createCompleteProject } from '../services/database';
import { unifiedLogger } from '../services/unifiedLogger';

// Environment variable validation with explicit error handling
const SHARED_SECRET = process.env.SHARED_SECRET;
if (!SHARED_SECRET) {
  console.error('FATAL: SHARED_SECRET environment variable is not set');
  process.exit(1);
}
// TypeScript assertion - we know SHARED_SECRET is defined after the check above
const VALIDATED_SHARED_SECRET: string = SHARED_SECRET;

// Rate limiting constants (actual rate limiting uses Redis, not in-memory maps)
const IP_RATE_LIMIT = parseInt(process.env.IP_RATE_LIMIT || '100', 10);
const IP_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

const USER_BUILD_LIMIT = 100; // 100 new builds per hour per user
const USER_BUILD_WINDOW = 60 * 60 * 1000; // 1 hour

// Redis connection for rate limiting (prevents memory leaks in long-lived workers)
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

// Interfaces
interface CreatePreviewBody {
  userId: string;
  projectId?: string; // Now optional - server generates if not provided
  prompt: string;
  framework?: string;
}


// Helper functions
// Use correct HMAC v1 validation from hmacHelpers

async function checkIPRateLimit(ip: string): Promise<boolean> {
  const key = `ip-rate-limit:${ip}`;
  
  try {
    const current = await redis.incr(key);
    
    if (current === 1) {
      // First request for this IP - set expiry
      await redis.expire(key, IP_RATE_WINDOW / 1000);
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
      await redis.expire(key, USER_BUILD_WINDOW / 1000);
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

async function executeCreatePreviewDirect(
  data: CreatePreviewBody,
  webhookService: WebhookService,
  headers?: Record<string, any>
): Promise<any> {
  const startTime = Date.now();
  const buildId = ulid();
  const versionId = ulid();

  try {
    // Use an allowed project path based on environment
    const baseProjectPath = process.platform === 'darwin'
      ? '/Users/sh/projects'  // macOS
      : '/home/worker/projects';  // Linux/production

    const projectPath = `${baseProjectPath}/${data.userId}/${data.projectId}`;

    console.log(`[Create Preview] Using stream system for prompt: ${data.prompt.substring(0, 100)}...`);
    console.log(`[Create Preview] Project path: ${projectPath}`);

    // Add job to stream queue
    const job = await streamQueue.add('claude-build', {
      buildId,
      userId: data.userId,
      projectId: data.projectId,
      prompt: data.prompt,
      framework: data.framework || 'react',
      projectPath,
      versionId,
      isInitialBuild: true
    });

    // For direct mode, wait for completion
    const connection = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    };
    const queueEvents = new QueueEvents('claude-stream', { connection });

    console.log(`[Create Preview] Waiting for stream job ${job.id} to complete...`);
    let result;
    try {
      result = await job.waitUntilFinished(queueEvents);
    } finally {
      // Close QueueEvents to prevent connection leak
      await queueEvents.close();
    }

    console.log(`[Create Preview] Stream job completed:`, result);

    // List generated files (stream doesn't return file list)
    let files: { path: string; size: number }[] = [];
    try {
      const projectFiles = await listProjectFiles(projectPath);
      files = projectFiles.map(f => ({
        path: f.path,
        size: f.size
      }));
    } catch (fileError) {
      console.warn('[Create Preview] Could not list project files:', fileError);
    }

    // Map stream worker response to expected format
    return {
      success: result.success,
      planId: result.buildId,  // Use buildId as planId for compatibility
      sessionId: result.sessionId,
      taskCount: 1,  // Stream is one big task
      executedTasks: 1,
      files,
      duration: Date.now() - startTime,
      tokenUsage: result.tokenUsage,
      deploymentUrl: `https://preview.example.com/${data.projectId}/${result.versionId || versionId}`
    };

  } catch (error: any) {
    console.error('[Create Preview] Stream execution failed:', error);
    throw error;
  }
}

// Helper function to list files in project directory
async function listProjectFiles(projectPath: string): Promise<{path: string, size: number}[]> {
  const files: {path: string, size: number}[] = [];

  async function scanDir(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(projectPath, fullPath);

      if (entry.isDirectory()) {
        // Skip node_modules and .git
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          await scanDir(fullPath);
        }
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        files.push({ path: relativePath, size: stats.size });
      }
    }
  }

  await scanDir(projectPath);
  return files;
}

export async function registerCreatePreviewRoutes(app: FastifyInstance) {
  const webhookService = new WebhookService();

  // POST /v1/create-preview-for-new-project
  app.post<{ Body: CreatePreviewBody }>('/v1/create-preview-for-new-project', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'prompt'], // projectId now optional
        properties: {
          userId: { type: 'string' },
          projectId: { type: 'string' }, // Optional - server generates if not provided
          prompt: { type: 'string' },
          framework: { 
            type: 'string',
            enum: ['react', 'nextjs', 'vue', 'svelte']
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreatePreviewBody }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { userId, projectId, prompt, framework } = request.body;
    
    console.log('[Create Preview] Request received:', {
      body: request.body,
      headers: {
        'x-direct-mode': request.headers['x-direct-mode'],
        'x-sheen-signature': request.headers['x-sheen-signature'] ? 'present' : 'missing'
      }
    });

    // Log action start to unified system
    unifiedLogger.action(userId, 'create_preview_start', 'POST', '/v1/create-preview-for-new-project', undefined, undefined, {
      projectId,
      framework,
      promptLength: prompt.length,
      hasDirectMode: !!request.headers['x-direct-mode']
    }, request.headers['x-correlation-id'] as string);

    // Verify signature using correct v1 format
    const sig = (request.headers['x-sheen-signature'] as string) || '';
    const timestamp = (request.headers['x-sheen-timestamp'] as string) || '';
    const body = JSON.stringify(request.body);
    
    if (!sig || !timestamp || !validateTimestamp(timestamp) || !verifyHMACv1(body, timestamp, sig, VALIDATED_SHARED_SECRET)) {
      const authErrorResponse = { 
        success: false,
        error: 'Invalid signature',
        serverTime: new Date().toISOString() // Expert feedback: Help debug clock skew
      };
      console.log('[Create Preview] AUTH ERROR RESPONSE:', JSON.stringify(authErrorResponse, null, 2));
      return reply.code(401).send(authErrorResponse);
    }

    // Check IP rate limit
    const ip = request.ip;
    const ipAllowed = await checkIPRateLimit(ip);
    if (!ipAllowed) {
      const rateLimitResponse = { 
        success: false,
        error: 'IP rate limit exceeded'
      };
      console.log('[Create Preview] IP RATE LIMIT ERROR RESPONSE:', JSON.stringify(rateLimitResponse, null, 2));
      return reply.code(429).send(rateLimitResponse);
    }

    // Generate correlation ID for request tracking
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const clientCorrelationId = request.headers['x-correlation-id'] as string;
    
    // Validate request body (variables already destructured above)
    if (!userId || !prompt) {
      const validationErrorResponse = { 
        success: false,
        error: 'userId and prompt are required' 
      };
      console.log(`[Create Preview] VALIDATION ERROR RESPONSE (${correlationId}):`, JSON.stringify(validationErrorResponse, null, 2));
      return reply.code(400).send(validationErrorResponse);
    }


    // Log request details with correlation tracking
    console.log(`[Create Preview] Request received (correlation: ${correlationId}):`, {
      correlationId,
      clientCorrelationId,
      userId,
      projectId: projectId || 'SERVER_GENERATED',
      promptPreview: prompt?.substring(0, 100) + '...',
      framework,
      metadata: (request.body as any).metadata,
      headers: {
        'x-direct-mode': request.headers['x-direct-mode'],
        'x-sheen-signature': request.headers['x-sheen-signature'] ? 'present' : 'missing',
        'x-correlation-id': clientCorrelationId || 'missing',
        'user-agent': request.headers['user-agent']
      },
      timestamp: new Date().toISOString(),
      requestId: request.id
    });

    // Validate and sanitize user ID
    const safeUserId = PathGuard.sanitizePathComponent(userId);
    
    // If projectId is provided (backward compatibility), validate it
    let safeProjectId: string | undefined;
    if (projectId) {
      safeProjectId = PathGuard.sanitizePathComponent(projectId);
      if (safeProjectId !== projectId) {
        const pathValidationErrorResponse = {
          success: false,
          error: 'Invalid request',
          message: 'Project ID contains invalid characters'
        };
        console.log('[Create Preview] PATH VALIDATION ERROR RESPONSE:', JSON.stringify(pathValidationErrorResponse, null, 2));
        return reply.code(400).send(pathValidationErrorResponse);
      }
    }
    
    if (safeUserId !== userId) {
      const pathValidationErrorResponse = {
        success: false,
        error: 'Invalid request',
        message: 'User ID contains invalid characters'
      };
      console.log('[Create Preview] PATH VALIDATION ERROR RESPONSE:', JSON.stringify(pathValidationErrorResponse, null, 2));
      return reply.code(400).send(pathValidationErrorResponse);
    }

    // Check user rate limit
    const userAllowed = await checkUserBuildLimit(userId);
    if (!userAllowed) {
      const userRateLimitResponse = {
        success: false,
        error: 'Too many build requests',
        message: `Exceeded ${USER_BUILD_LIMIT} new builds per hour for this user`
      };
      console.log('[Create Preview] USER RATE LIMIT ERROR RESPONSE:', JSON.stringify(userRateLimitResponse, null, 2));
      return reply.code(429).send(userRateLimitResponse);
    }

    // Pre-flight balance check for AI time billing
    console.log(`[Create Preview] Checking AI time balance for user ${userId}`);
    const balanceCheck = await metricsService.checkSufficientAITimeBalance(
      userId, 
      undefined // Let it use default estimate for main_build
    );
    
    if (!balanceCheck.sufficient) {
      console.log(`[Create Preview] Insufficient AI time balance for ${userId}:`, {
        available: balanceCheck.balance?.total || 0,
        required: 'estimated 3+ minutes'
      });
      
      const insufficientBalanceResponse = {
        success: false,
        error: 'insufficient_ai_time',
        message: 'Insufficient AI time balance to start build',
        balance: balanceCheck.balance,
        estimate: balanceCheck.estimate,
        required: 180 // Default 3 minutes in seconds
      };
      console.log('[Create Preview] INSUFFICIENT BALANCE ERROR RESPONSE:', JSON.stringify(insufficientBalanceResponse, null, 2));
      return reply.code(402).send(insufficientBalanceResponse);
    }
    
    console.log(`[Create Preview] AI time balance check passed for ${userId}:`, {
      available: balanceCheck.balance?.total || 0
    });

    // Pre-flight system and usage limit validation
    try {
      console.log(`[Create Preview] Running pre-request validation checks`);
      
      // 1. Check system configuration first
      const baseProjectPath = process.platform === 'darwin' 
        ? '/Users/sh/projects'
        : '/home/worker/projects';
      // Use a temp validation path for Claude CLI validation (not project-specific)
      const validationPath = `${baseProjectPath}/${safeUserId}/.claude-validation-temp`;
      
      const systemValidation = SystemValidationService.getInstance();
      const validationResult = await systemValidation.validateClaudeAccess(validationPath);
      
      if (!validationResult.isValid) {
        const error = validationResult.errors[0];
        if (!error) {
          throw new Error('Validation failed but no error details provided');
        }
        console.log(`[Create Preview] System configuration error:`, error);

        const errorResponse = {
          success: false,
          error: 'system_configuration_error',
          message: error.message,
          configurationType: error.type,
          resolution: error.resolution,
          retryAfter: null
        };
        
        console.log('[Create Preview] SYSTEM CONFIG ERROR RESPONSE:', JSON.stringify(errorResponse, null, 2));
        return reply.code(503).send(errorResponse);
      }
      
      // 2. Check usage limit status
      const usageLimitService = UsageLimitService.getInstance();
      const isLimitActive = await usageLimitService.isLimitActive();
      
      if (isLimitActive) {
        const resetTime = await usageLimitService.getResetTime();
        const timeUntilReset = await usageLimitService.getTimeUntilReset();
        const errorMessage = await usageLimitService.getErrorMessage();
        
        console.log(`[Create Preview] Usage limit active until ${resetTime ? new Date(resetTime).toISOString() : 'unknown'}`);
        
        const errorResponse = {
          success: false,
          error: 'usage_limit_exceeded',
          message: errorMessage || `Claude CLI usage limit active. Resets at ${resetTime ? new Date(resetTime).toISOString() : 'unknown time'}`,
          status: 429,
          resetTime: resetTime ? new Date(resetTime).toISOString() : null,
          retryAfter: Math.ceil((timeUntilReset || 0) / 1000),
          timeUntilReset: timeUntilReset || 0,
          timeUntilResetHuman: formatTimeUntilReset(timeUntilReset || 0)
        };
        
        console.log('[Create Preview] USAGE LIMIT ERROR RESPONSE:', JSON.stringify(errorResponse, null, 2));
        reply.header('Retry-After', String(Math.ceil((timeUntilReset || 0) / 1000)));
        return reply.code(429).send(errorResponse);
      }
      
      console.log(`[Create Preview] Pre-request validation passed`);
      
    } catch (validationError: any) {
      console.error(`[Create Preview] Pre-request validation failed:`, validationError);
      
      // Handle validation service errors gracefully
      const baseErrorResponse = systemErrorToAPIResponse(validationError);
      const errorResponse = {
        ...baseErrorResponse,
        success: false
      };
      const statusCode = getSystemErrorStatus(validationError);
      const retryAfter = getRetryAfterHeader(validationError);
      
      console.log('[Create Preview] SYSTEM ERROR RESPONSE:', JSON.stringify(errorResponse, null, 2));
      
      if (retryAfter) {
        reply.header('Retry-After', String(retryAfter));
      }
      
      return reply.code(statusCode).send(errorResponse);
    }

    try {
      // Server-side project creation with complete initialization
      let actualProjectId: string;
      let actualVersionId: string; 
      let actualBuildId: string;
      let buildMetricsId: number;

      if (safeProjectId) {
        // Legacy mode: Use provided projectId (temporary backward compatibility)
        console.log(`[Create Preview] Using provided projectId: ${safeProjectId}`);
        actualProjectId = safeProjectId;
        actualVersionId = ulid();
        actualBuildId = ulid();
        
        // TODO: This path will be removed once NextJS is updated
        // For now, we still need to handle external projectIds
        buildMetricsId = 0; // Placeholder - legacy path
      } else {
        // New mode: Server generates all IDs atomically
        console.log(`[Create Preview] Creating project with server-generated IDs (${correlationId})`);
        
        try {
          const projectResult = await createCompleteProject({
            userId: safeUserId,
            framework: framework as 'react' | 'nextjs' | 'vue' | 'svelte' || 'react',
            prompt,
            name: 'Untitled Project'
          });
          
          actualProjectId = projectResult.projectId;
          actualVersionId = projectResult.versionId;
          actualBuildId = projectResult.buildId;
          buildMetricsId = projectResult.buildMetricsId;
          
          console.log(`[Create Preview] Created project atomically (${correlationId}):`, {
            correlationId,
            projectId: actualProjectId,
            versionId: actualVersionId,
            buildId: actualBuildId,
            buildMetricsId,
            userId: safeUserId
          });
        } catch (error: any) {
          // If project creation fails due to duplicate key, this might be a race condition or retry
          console.error(`[Create Preview] Project creation failed (${correlationId}):`, {
            correlationId,
            code: error.code,
            constraint: error.constraint,
            message: error.message,
            detail: error.detail,
            userId: safeUserId,
            timestamp: new Date().toISOString()
          });
          
          // For now, throw the error to let the client handle it
          // In the future, we could implement retry logic or return existing project
          throw error;
        }
      }

      // Initialize project directory structure
      const baseProjectPath = process.platform === 'darwin'
        ? '/Users/sh/projects'
        : '/home/worker/projects';
      const projectPath = `${baseProjectPath}/${safeUserId}/${actualProjectId}`;
      
      // Ensure project directories exist
      await fs.mkdir(projectPath, { recursive: true });
      console.log(`[Create Preview] Created project directory: ${projectPath}`);

      // Start AI time tracking for the project
      let aiTimeTracking;
      try {
        aiTimeTracking = await metricsService.startAITimeTracking(
            actualBuildId,
            'main_build',
            {
              projectId: actualProjectId,
              versionId: actualVersionId,
              userId: safeUserId
            }
          );
          console.log(`[Create Preview] AI time tracking started for ${actualBuildId}`);
        } catch (error) {
          console.error(`[Create Preview] Failed to start AI time tracking:`, error);
          
          // If this is an insufficient AI time error, return proper error to frontend
          if (error instanceof InsufficientAITimeError) {
            console.log('[Create Preview] INSUFFICIENT AI TIME ERROR RESPONSE:', JSON.stringify({
              available: error.available,
              required: error.required,
              breakdown: error.breakdown,
              estimate: error.estimate
            }, null, 2));
            
            const insufficientAITimeResponse = {
              success: false,
              error: 'insufficient_ai_time',
              message: 'Insufficient AI time balance to start build',
              available: error.available,
              required: error.required,
              breakdown: error.breakdown,
              estimate: error.estimate,
              correlationId
            };
            
            return reply.code(402).send(insufficientAITimeResponse); // 402 Payment Required
          }
          
          // For other tracking errors, don't fail project creation - it's supplementary
        }

      // Log complete context for observability
      console.log('[Create Preview] Complete project context:', {
        projectId: actualProjectId,
        versionId: actualVersionId,
        buildId: actualBuildId,
        userId: safeUserId,
        createdBy: 'worker-service',
        buildMetricsId: buildMetricsId,
        serverGenerated: !safeProjectId
      });

      // Check if direct mode is enabled via header or environment
      const forceDirectMode = request.headers['x-direct-mode'] === 'true';
      if (forceDirectMode || isDirectModeEnabled()) {
        console.log('🎯 Direct mode enabled - executing synchronously');

        const result = await executeCreatePreviewDirect(
          {
            userId: safeUserId,
            projectId: actualProjectId,
            prompt,
            framework: framework || 'react'
          },
          webhookService,
          request.headers as Record<string, any>
        );

        // Update project with session ID for context continuity
        if (result.sessionId) {
          const { SessionManagementService } = await import('../services/sessionManagementService');
          await SessionManagementService.updateProjectSession(
            actualProjectId,
            result.sessionId,
            'create_preview'
          );
        }

        // Log direct mode success to unified system before returning
        const directDuration = Date.now() - startTime;
        unifiedLogger.action(userId, 'create_preview_direct_success', 'POST', '/v1/create-preview-for-new-project', 200, directDuration, {
          projectId: actualProjectId,
          deploymentUrl: result.deploymentUrl,
          taskCount: result.taskCount,
          executedTasks: result.executedTasks,
          streamDuration: result.duration
        }, correlationId);

        return reply.send({
          success: result.success,
          projectId: actualProjectId, // Return server-generated ID
          jobId: `direct-${Date.now()}`,
          planId: result.planId,
          sessionId: result.sessionId,
          status: 'completed',
          deploymentUrl: result.deploymentUrl,
          taskCount: result.taskCount,
          executedTasks: result.executedTasks,
          files: result.files,
          duration: result.duration,
          message: 'Preview created successfully with stream system'
        });
      }

      // Queue mode - use stream queue  
      console.log(`[Create Preview] Using queue mode with stream queue (${correlationId})`);

      console.log(`[Create Preview] Adding job to stream queue (${correlationId}):`, {
        correlationId,
        buildId: actualBuildId,
        userId: safeUserId,
        projectId: actualProjectId,
        framework: framework || 'react',
        serverGenerated: true
      });

      const job = await streamQueue.add('claude-build', {
        buildId: actualBuildId,
        userId: safeUserId,
        projectId: actualProjectId,
        prompt,
        framework: framework || 'react',
        projectPath,
        versionId: actualVersionId,
        isInitialBuild: true,
        serverGenerated: true,
        correlationId  // Add correlation ID to job data for tracking
      });

      // Add rate limit headers for intelligent client backoff
      reply.header('x-ratelimit-remaining', '25'); // Lower limit for resource-intensive builds
      reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour
      
      const successResponse = {
        success: true,
        jobId: job.id,
        buildId: actualBuildId,
        planId: actualBuildId,
        projectId: actualProjectId, // Return server-generated ID
        status: 'queued',
        message: 'Preview creation job queued successfully (stream mode)',
        estimatedTime: '60-90 seconds for new projects',
        correlationId // Include correlation ID in response
      };
      
      console.log(`[Create Preview] SUCCESS RESPONSE (${correlationId}):`, JSON.stringify(successResponse, null, 2));
      
      // Log successful action completion to unified system
      const duration = Date.now() - startTime;
      const directModeStatus = forceDirectMode || isDirectModeEnabled();
      unifiedLogger.action(userId, 'create_preview_success', 'POST', '/v1/create-preview-for-new-project', 200, duration, {
        projectId: actualProjectId,
        buildId: actualBuildId,
        framework,
        isDirectMode: directModeStatus,
        queuedForPreview: directModeStatus
      }, correlationId);
      
      return reply.send(successResponse);

    } catch (error: any) {
      console.error('[Create Preview] Error:', error);
      
      // Handle specific project creation errors
      let statusCode = 500;
      let errorMessage = 'Internal server error';
      
      if (error.message && error.message.includes('already in progress')) {
        statusCode = 409;
        errorMessage = 'project_creation_in_progress';
      }
      
      const errorResponse = {
        success: false,
        error: errorMessage,
        message: error instanceof Error ? error.message : 'Failed to process create preview request'
      };
      
      console.log('[Create Preview] INTERNAL ERROR RESPONSE:', JSON.stringify(errorResponse, null, 2));
      
      // Log error action to unified system
      const duration = Date.now() - startTime;
      unifiedLogger.action(userId, 'create_preview_error', 'POST', '/v1/create-preview-for-new-project', statusCode, duration, {
        errorType: errorMessage,
        errorDetails: error instanceof Error ? error.message : String(error)
      }, request.headers['x-correlation-id'] as string);
      
      return reply.code(statusCode).send(errorResponse);
    }
  });

  // Stream worker is managed in server.ts, no need to initialize here
}
