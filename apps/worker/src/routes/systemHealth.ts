import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SystemValidationService } from '../services/systemValidationService';
import { UsageLimitService } from '../services/usageLimitService';
import { QueueManager } from '../services/queueManager';
import { requireHmacSignature } from '../middleware/hmacValidation';

// System health and monitoring endpoints
export async function registerSystemHealthRoutes(app: FastifyInstance) {
  // Apply HMAC validation to all admin endpoints
  const hmacMiddleware = requireHmacSignature();
  
  // GET /v1/admin/system-health - Comprehensive system health check
  app.get('/v1/admin/system-health', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      console.log('[System Health] Running comprehensive health check');
      
      const [
        systemValidation,
        usageLimitStats,
        queueStats
      ] = await Promise.all([
        // System validation check
        SystemValidationService.getInstance().validateClaudeAccess(process.cwd()),
        
        // Usage limit status
        UsageLimitService.getInstance().getUsageLimitStats(),
        
        // Queue management status
        QueueManager.getInstance().getQueueStats()
      ]);
      
      // Determine overall health status
      const isHealthy = systemValidation.isValid && !usageLimitStats.isActive && !queueStats.pauseState.isPaused;
      const status = isHealthy ? 'healthy' : 'degraded';
      
      const healthReport = {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        
        // System configuration health
        systemConfiguration: {
          status: systemValidation.isValid ? 'ok' : 'error',
          errors: systemValidation.errors,
          warnings: systemValidation.warnings,
          lastChecked: new Date().toISOString()
        },
        
        // Usage limit status
        usageLimits: {
          status: usageLimitStats.isActive ? 'limited' : 'ok',
          isActive: usageLimitStats.isActive,
          resetTime: usageLimitStats.resetTime ? new Date(usageLimitStats.resetTime).toISOString() : null,
          timeUntilReset: usageLimitStats.timeUntilReset,
          errorMessage: usageLimitStats.errorMessage,
          redisKeyTTL: usageLimitStats.redisKeyTTL
        },
        
        // Queue health
        queues: {
          status: queueStats.pauseState.isPaused ? 'paused' : 'running',
          streamQueue: queueStats.streamQueue,
          pauseState: queueStats.pauseState
        },
        
        // System metrics
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
          },
          cpuUsage: process.cpuUsage()
        }
      };
      
      const httpStatus = isHealthy ? 200 : 503;
      return reply.code(httpStatus).send(healthReport);
      
    } catch (error: any) {
      console.error('[System Health] Health check failed:', error);
      
      return reply.code(500).send({
        status: 'error',
        message: 'Health check failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /v1/admin/claude-access - Quick Claude CLI accessibility check
  app.get<{ Querystring: { path?: string } }>('/v1/admin/claude-access', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Querystring: { path?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const testPath = request.query.path || process.cwd();
      console.log(`[System Health] Testing Claude CLI access from ${testPath}`);
      
      const systemValidation = SystemValidationService.getInstance();
      const result = await systemValidation.validateClaudeAccess(testPath);
      
      const response = {
        isValid: result.isValid,
        testPath,
        errors: result.errors,
        warnings: result.warnings,
        timestamp: new Date().toISOString()
      };
      
      const status = result.isValid ? 200 : 503;
      return reply.code(status).send(response);
      
    } catch (error: any) {
      console.error('[System Health] Claude access check failed:', error);
      
      return reply.code(500).send({
        error: 'claude_access_check_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /v1/admin/usage-limits - Usage limit status
  app.get('/v1/admin/usage-limits', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const usageLimitService = UsageLimitService.getInstance();
      const stats = await usageLimitService.getUsageLimitStats();
      
      const response = {
        isActive: stats.isActive,
        resetTime: stats.resetTime ? new Date(stats.resetTime).toISOString() : null,
        timeUntilReset: stats.timeUntilReset,
        timeUntilResetHuman: formatTimeUntilReset(stats.timeUntilReset),
        errorMessage: stats.errorMessage,
        redisStatus: {
          keyExists: stats.redisKeyExists,
          ttl: stats.redisKeyTTL
        },
        timestamp: new Date().toISOString()
      };
      
      return reply.send(response);
      
    } catch (error: any) {
      console.error('[System Health] Usage limit check failed:', error);
      
      return reply.code(500).send({
        error: 'usage_limit_check_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /v1/admin/queue-status - Queue management status
  app.get('/v1/admin/queue-status', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const queueManager = QueueManager.getInstance();
      const stats = await queueManager.getQueueStats();
      
      return reply.send({
        ...stats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('[System Health] Queue status check failed:', error);
      
      return reply.code(500).send({
        error: 'queue_status_check_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // POST /v1/admin/clear-usage-limit - Manual usage limit override
  app.post('/v1/admin/clear-usage-limit', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      console.log('[System Health] Manual usage limit clear requested');
      
      const usageLimitService = UsageLimitService.getInstance();
      const queueManager = QueueManager.getInstance();
      
      // Force clear the usage limit
      await usageLimitService.forceClearLimit();
      
      // Resume queues if they were paused
      const pauseState = await queueManager.getPauseState();
      if (pauseState.isPaused && pauseState.reason === 'usage_limit') {
        await queueManager.resumeQueues('manual');
      }
      
      return reply.send({
        success: true,
        message: 'Usage limit cleared and queues resumed',
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('[System Health] Failed to clear usage limit:', error);
      
      return reply.code(500).send({
        error: 'clear_usage_limit_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // POST /v1/admin/resume-queues - Manual queue resume
  app.post('/v1/admin/resume-queues', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      console.log('[System Health] Manual queue resume requested');
      
      const queueManager = QueueManager.getInstance();
      await queueManager.forceResumeQueues();
      
      return reply.send({
        success: true,
        message: 'Queues resumed manually',
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('[System Health] Failed to resume queues:', error);
      
      return reply.code(500).send({
        error: 'resume_queues_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /v1/admin/validation-cache - System validation cache status
  app.get('/v1/admin/validation-cache', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const systemValidation = SystemValidationService.getInstance();
      const stats = await systemValidation.getValidationStats();
      
      return reply.send({
        ...stats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('[System Health] Validation cache check failed:', error);
      
      return reply.code(500).send({
        error: 'validation_cache_check_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // DELETE /v1/admin/validation-cache - Clear validation cache
  app.delete('/v1/admin/validation-cache', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      console.log('[System Health] Clearing validation cache');
      
      const systemValidation = SystemValidationService.getInstance();
      await systemValidation.clearValidationCache();
      
      return reply.send({
        success: true,
        message: 'Validation cache cleared',
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('[System Health] Failed to clear validation cache:', error);
      
      return reply.code(500).send({
        error: 'clear_validation_cache_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Helper function
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