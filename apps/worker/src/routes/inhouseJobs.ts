/**
 * In-House Jobs Routes
 *
 * HTTP endpoints for Easy Mode project background jobs.
 * Uses Pattern 1: projectId from x-project-id header (not URL path).
 *
 * Routes:
 * - POST   /v1/inhouse/jobs - Enqueue a job
 * - GET    /v1/inhouse/jobs - List jobs
 * - GET    /v1/inhouse/jobs/:jobId - Get job details
 * - POST   /v1/inhouse/jobs/:jobId/cancel - Cancel a job
 * - POST   /v1/inhouse/jobs/:jobId/retry - Retry a job
 * - POST   /v1/inhouse/jobs/schedules - Create schedule
 * - GET    /v1/inhouse/jobs/schedules - List schedules
 * - PATCH  /v1/inhouse/jobs/schedules/:scheduleId - Update schedule
 * - DELETE /v1/inhouse/jobs/schedules/:scheduleId - Delete schedule
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { FastifyInstance } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { assertProjectAccess } from '../utils/projectAuth';
import { getInhouseJobsService } from '../services/inhouse/InhouseJobsService';
import { getInhouseMeteringService } from '../services/inhouse/InhouseMeteringService';
import { logActivity } from '../services/inhouse/InhouseActivityLogger';

// =============================================================================
// LIMITS (DoS Protection)
// =============================================================================

/**
 * Maximum payload size (256KB)
 */
const MAX_PAYLOAD_SIZE = 256 * 1024;

/**
 * Maximum job name length
 */
const MAX_JOB_NAME_LENGTH = 100;

/**
 * Maximum delay (7 days)
 */
const MAX_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Maximum jobs per list request
 */
const MAX_LIST_LIMIT = 100;

// =============================================================================
// VALIDATION
// =============================================================================

function validateJobName(name: string): { valid: boolean; error?: string } {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Job name must be a string' };
  }
  if (name.length === 0) {
    return { valid: false, error: 'Job name cannot be empty' };
  }
  if (name.length > MAX_JOB_NAME_LENGTH) {
    return { valid: false, error: `Job name exceeds maximum length (${MAX_JOB_NAME_LENGTH} chars)` };
  }
  if (name.startsWith('sys:')) {
    return { valid: false, error: 'Job name cannot start with "sys:" (reserved for system jobs)' };
  }
  // Only allow alphanumeric, hyphens, underscores, and dots
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { valid: false, error: 'Job name can only contain alphanumeric characters, hyphens, underscores, and dots' };
  }
  return { valid: true };
}

function validateCronExpression(cron: string): { valid: boolean; error?: string } {
  if (typeof cron !== 'string') {
    return { valid: false, error: 'Cron expression must be a string' };
  }
  const parts = cron.split(' ');
  if (parts.length < 5 || parts.length > 6) {
    return { valid: false, error: 'Cron expression must have 5 or 6 parts' };
  }

  // Validate each part has valid characters (digits, commas, hyphens, asterisks, slashes)
  const validChars = /^[\d,\-\*\/]+$/;
  for (const part of parts) {
    if (!validChars.test(part)) {
      return { valid: false, error: `Invalid characters in cron expression: "${part}"` };
    }
  }

  // Basic range validation for standard cron fields
  const ranges = [
    { min: 0, max: 59, name: 'minute' },      // minute
    { min: 0, max: 23, name: 'hour' },        // hour
    { min: 1, max: 31, name: 'day of month' }, // day of month
    { min: 1, max: 12, name: 'month' },       // month
    { min: 0, max: 7, name: 'day of week' },  // day of week (0 and 7 both = Sunday)
  ];

  for (let i = 0; i < Math.min(parts.length, 5); i++) {
    const part = parts[i];
    const range = ranges[i];
    if (!part || !range || part === '*') continue;

    // Check for simple numbers
    const num = parseInt(part, 10);
    if (!isNaN(num)) {
      if (num < range.min || num > range.max) {
        return { valid: false, error: `${range.name} value ${num} out of range (${range.min}-${range.max})` };
      }
    }
  }

  return { valid: true };
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface EnqueueJobBody {
  name: string;
  payload: Record<string, unknown>;
  delay?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  concurrencyKey?: string;
  idempotencyKey?: string;
  userId?: string;
}

interface ListJobsQuery {
  name?: string;
  status?: 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | 'all';
  limit?: string;
  offset?: string;
  orderBy?: 'createdAt' | 'processedAt';
  orderDir?: 'asc' | 'desc';
  userId?: string;
}

interface CreateScheduleBody {
  name: string;
  cronExpression: string;
  payload: Record<string, unknown>;
  timezone?: string;
  active?: boolean;
  description?: string;
  userId?: string;
}

interface UpdateScheduleBody {
  cronExpression?: string;
  payload?: Record<string, unknown>;
  timezone?: string;
  active?: boolean;
  description?: string;
  userId?: string;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseJobsRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  // ===========================================================================
  // POST /v1/inhouse/jobs - Enqueue a job
  // ===========================================================================
  fastify.post<{
    Body: EnqueueJobBody;
  }>('/v1/inhouse/jobs', {
    preHandler: hmacMiddleware as any,
    bodyLimit: MAX_PAYLOAD_SIZE,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { name, payload, delay, timeoutMs, maxAttempts, concurrencyKey, idempotencyKey, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate required fields
    if (!name) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name is required',
        },
      });
    }

    // Validate job name
    const nameValidation = validateJobName(name);
    if (!nameValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_JOB_NAME',
          message: nameValidation.error,
        },
      });
    }

    // Validate payload
    if (payload !== undefined && (typeof payload !== 'object' || payload === null)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'payload must be an object',
        },
      });
    }

    // Validate delay format and range
    if (delay) {
      const match = delay.match(/^(\d+)(s|m|h|d)$/);
      if (!match) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_DELAY',
            message: 'delay must be in format like "30m", "1h", "1d"',
          },
        });
      }
      // Calculate delay in ms and check max
      // match[1] and match[2] are guaranteed to exist after the regex match check above
      const value = parseInt(match[1]!, 10);
      const unit = match[2]!;
      let delayMs = 0;
      switch (unit) {
        case 's': delayMs = value * 1000; break;
        case 'm': delayMs = value * 60 * 1000; break;
        case 'h': delayMs = value * 3600 * 1000; break;
        case 'd': delayMs = value * 86400 * 1000; break;
      }
      if (delayMs > MAX_DELAY_MS) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'DELAY_TOO_LONG',
            message: 'Maximum delay is 7 days',
          },
        });
      }
    }

    try {
      // Check job runs quota
      const meteringService = getInhouseMeteringService();
      const quotaCheck = await meteringService.checkProjectQuota(
        projectId,
        'job_runs',
        1
      );

      if (!quotaCheck.allowed) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Job runs quota exceeded for this billing period',
            details: {
              used: quotaCheck.used,
              limit: quotaCheck.limit,
              remaining: quotaCheck.remaining,
            },
          },
        });
      }

      const jobsService = getInhouseJobsService(projectId);
      const job = await jobsService.enqueue({
        name,
        payload: payload || {},
        delay,
        timeoutMs,
        maxAttempts,
        concurrencyKey,
        idempotencyKey,
      });

      // Track job run usage (await but don't fail the response if tracking fails)
      const trackingResult = await meteringService.trackProjectUsage(projectId, 'job_runs', 1);
      if (!trackingResult.success) {
        console.error(`[Jobs] Warning: Failed to track job usage for project ${projectId}`);
      }

      // Log activity (fire-and-forget)
      logActivity({
        projectId,
        service: 'jobs',
        action: 'enqueue',
        actorType: 'user',
        actorId: userId,
        resourceType: 'job',
        resourceId: job.id,
        metadata: { name, delay, hasIdempotencyKey: !!idempotencyKey },
      });

      return reply.code(201).send({
        ok: true,
        data: { job },
        quota: {
          used: quotaCheck.used + 1, // Include this job
          limit: quotaCheck.limit,
          remaining: quotaCheck.remaining - 1,
          unlimited: quotaCheck.unlimited,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log error activity
      logActivity({
        projectId,
        service: 'jobs',
        action: 'enqueue',
        status: 'error',
        actorType: 'user',
        actorId: userId,
        resourceType: 'job',
        errorCode: 'INTERNAL_ERROR',
        metadata: { name, error: errorMessage },
      });

      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/jobs - List jobs
  // ===========================================================================
  fastify.get<{
    Querystring: ListJobsQuery;
  }>('/v1/inhouse/jobs', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { name, status, limit: limitStr, offset: offsetStr, orderBy, orderDir, userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Parse and validate limit
    let limit = 20;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_LIMIT',
            message: `limit must be an integer between 1 and ${MAX_LIST_LIMIT}`,
          },
        });
      }
      limit = parsed;
    }

    // Parse offset
    let offset = 0;
    if (offsetStr) {
      const parsed = parseInt(offsetStr, 10);
      if (isNaN(parsed) || parsed < 0) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_OFFSET',
            message: 'offset must be a non-negative integer',
          },
        });
      }
      offset = parsed;
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const result = await jobsService.list({
        name,
        status,
        limit,
        offset,
        orderBy,
        orderDir,
      });

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/jobs/:jobId - Get job details
  // ===========================================================================
  fastify.get<{
    Params: { jobId: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/jobs/:jobId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { jobId } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const job = await jobsService.get(jobId);

      if (!job) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Job not found: ${jobId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: { job },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // POST /v1/inhouse/jobs/:jobId/cancel - Cancel a job
  // ===========================================================================
  fastify.post<{
    Params: { jobId: string };
    Body: { userId?: string };
  }>('/v1/inhouse/jobs/:jobId/cancel', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { jobId } = request.params;
    const { userId } = request.body || {};

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const result = await jobsService.cancel(jobId);

      if (!result.success) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Job not found: ${jobId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: { success: true },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isStateError = errorMessage.includes('Cannot cancel job in state');
      return reply.code(isStateError ? 400 : 500).send({
        ok: false,
        error: {
          code: isStateError ? 'INVALID_STATE' : 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // POST /v1/inhouse/jobs/:jobId/retry - Retry a job
  // ===========================================================================
  fastify.post<{
    Params: { jobId: string };
    Body: { userId?: string };
  }>('/v1/inhouse/jobs/:jobId/retry', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { jobId } = request.params;
    const { userId } = request.body || {};

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const result = await jobsService.retry(jobId);

      if (!result.success) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Job not found: ${jobId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isStateError = errorMessage.includes('Cannot retry job in state');
      return reply.code(isStateError ? 400 : 500).send({
        ok: false,
        error: {
          code: isStateError ? 'INVALID_STATE' : 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // POST /v1/inhouse/jobs/schedules - Create schedule
  // ===========================================================================
  fastify.post<{
    Body: CreateScheduleBody;
  }>('/v1/inhouse/jobs/schedules', {
    preHandler: hmacMiddleware as any,
    bodyLimit: MAX_PAYLOAD_SIZE,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { name, cronExpression, payload, timezone, active, description, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate required fields
    if (!name || !cronExpression) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name and cronExpression are required',
        },
      });
    }

    // Validate job name
    const nameValidation = validateJobName(name);
    if (!nameValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_JOB_NAME',
          message: nameValidation.error,
        },
      });
    }

    // Validate cron expression
    const cronValidation = validateCronExpression(cronExpression);
    if (!cronValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_CRON',
          message: cronValidation.error,
        },
      });
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const schedule = await jobsService.createSchedule({
        name,
        cronExpression,
        payload: payload || {},
        timezone,
        active,
        description,
      });

      return reply.code(201).send({
        ok: true,
        data: { schedule },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/jobs/schedules - List schedules
  // ===========================================================================
  fastify.get<{
    Querystring: { userId?: string };
  }>('/v1/inhouse/jobs/schedules', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const result = await jobsService.listSchedules();

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // PATCH /v1/inhouse/jobs/schedules/:scheduleId
  // ===========================================================================
  fastify.patch<{
    Params: { scheduleId: string };
    Body: UpdateScheduleBody;
  }>('/v1/inhouse/jobs/schedules/:scheduleId', {
    preHandler: hmacMiddleware as any,
    bodyLimit: MAX_PAYLOAD_SIZE,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { scheduleId } = request.params;
    const { cronExpression, payload, timezone, active, description, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate cron expression if provided
    if (cronExpression) {
      const cronValidation = validateCronExpression(cronExpression);
      if (!cronValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_CRON',
            message: cronValidation.error,
          },
        });
      }
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const schedule = await jobsService.updateSchedule(scheduleId, {
        cronExpression,
        payload,
        timezone,
        active,
        description,
      });

      if (!schedule) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Schedule not found: ${scheduleId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: { schedule },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // DELETE /v1/inhouse/jobs/schedules/:scheduleId
  // ===========================================================================
  fastify.delete<{
    Params: { scheduleId: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/jobs/schedules/:scheduleId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { scheduleId } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const jobsService = getInhouseJobsService(projectId);
      const deleted = await jobsService.deleteSchedule(scheduleId);

      if (!deleted) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Schedule not found: ${scheduleId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: { success: true },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });
}
