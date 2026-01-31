import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ServerHealthService } from '../services/serverHealthService';
import { CapacityManager } from '../services/capacityManager';
import { ServerLoggingService } from '../services/serverLoggingService';
import { GlobalLimitService } from '../services/globalLimitService';

/**
 * Health Monitoring API Endpoints
 * Provides various levels of health information for monitoring and debugging
 */

export async function healthRoutes(fastify: FastifyInstance) {
  const healthService = ServerHealthService.getInstance();
  const capacityManager = CapacityManager.getInstance();
  const loggingService = ServerLoggingService.getInstance();
  const globalLimitService = GlobalLimitService.getInstance();

  // ============================================================================
  // PUBLIC HEALTH ENDPOINTS (no auth required)
  // ============================================================================

  /**
   * Basic health check endpoint
   * Returns simple OK/ERROR status for load balancers
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await healthService.collectHealthMetrics();
      
      if (health.status === 'unhealthy') {
        return reply.code(503).send({
          status: 'ERROR',
          message: 'Server is unhealthy',
          timestamp: new Date().toISOString()
        });
      }
      
      return reply.send({
        status: 'OK',
        server_id: health.id,
        uptime: health.systemMetrics.uptime,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(503).send({
        status: 'ERROR',
        message: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Detailed health status for monitoring dashboards
   * Includes capacity, system metrics, and AI status
   */
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await healthService.collectHealthMetrics();
      
      return reply.send({
        server: {
          id: health.id,
          status: health.status,
          lastCheck: new Date(health.lastHealthCheck).toISOString()
        },
        ai_capacity: {
          available: health.aiCapacity.available,
          limit_type: health.aiCapacity.limitType,
          reset_time: health.aiCapacity.resetTime ? 
            new Date(health.aiCapacity.resetTime).toISOString() : null,
          retry_after_seconds: health.aiCapacity.retryAfterSeconds,
          providers: health.aiCapacity.providers
        },
        system: {
          memory_rss_mb: Math.round(health.systemMetrics.memoryRSS / (1024 * 1024)),
          memory_heap_mb: Math.round(health.systemMetrics.memoryHeapUsed / (1024 * 1024)),
          uptime_hours: Math.round(health.systemMetrics.uptime / 3600),
          node_version: health.systemMetrics.nodeVersion
        },
        workload: health.workload,
        redis: health.redis,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to collect health metrics',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * AI Capacity status endpoint
   * Focused on AI provider availability and limits
   */
  fastify.get('/health/capacity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const capacityStatus = await capacityManager.getCapacityStatus();
      
      return reply.send({
        summary: capacityStatus.summary,
        providers: {
          anthropic: capacityStatus.anthropic,
          // Future: add other providers
        },
        local_limits: capacityStatus.local,
        recommendations: {
          can_accept_requests: capacityStatus.summary.anyAvailable,
          suggested_retry_after: capacityStatus.summary.nextResetTime ? 
            Math.max(5, Math.ceil((capacityStatus.summary.nextResetTime - Date.now()) / 1000)) : null
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get capacity status',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // CLUSTER-WIDE HEALTH ENDPOINTS
  // ============================================================================

  /**
   * Multi-server cluster health summary
   */
  fastify.get('/health/cluster', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [clusterSummary, allServerHealth] = await Promise.all([
        healthService.getClusterHealthSummary(),
        healthService.getAllServerHealth()
      ]);
      
      return reply.send({
        cluster_summary: clusterSummary,
        servers: allServerHealth.map(server => ({
          id: server.id,
          status: server.status,
          ai_available: server.aiCapacity.available,
          memory_mb: Math.round(server.systemMetrics.memoryRSS / (1024 * 1024)),
          uptime_hours: Math.round(server.systemMetrics.uptime / 3600),
          last_check: new Date(server.lastHealthCheck).toISOString()
        })),
        critical_issues: clusterSummary.criticalIssues,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get cluster health',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // ADMIN/DEBUG ENDPOINTS (Future: add authentication)
  // ============================================================================

  /**
   * Recent server logs for debugging
   * TODO: Add admin authentication
   */
  fastify.get('/health/logs', async (request: FastifyRequest<{
    Querystring: { 
      count?: number; 
      type?: string; 
      level?: string; 
      server?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { count = 100, type, level, server } = request.query;
      
      let logs;
      if (server) {
        logs = await loggingService.getLogsByServer(server, count);
      } else {
        logs = await loggingService.getRecentLogs(
          count,
          type as any,
          level as any
        );
      }
      
      return reply.send({
        logs: logs.map(log => ({
          timestamp: new Date(log.timestamp).toISOString(),
          server_id: log.serverId,
          type: log.logType,
          level: log.level,
          message: log.message,
          metadata: log.metadata
        })),
        filters: { count, type, level, server },
        total_returned: logs.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to retrieve logs',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Error summary for monitoring alerts
   */
  fastify.get('/health/errors', async (request: FastifyRequest<{
    Querystring: { hours?: number }
  }>, reply: FastifyReply) => {
    try {
      const { hours = 24 } = request.query;
      const errorSummary = await loggingService.getErrorSummary(hours);
      
      return reply.send({
        period_hours: hours,
        ...errorSummary,
        recent_critical: errorSummary.recentCritical.map(log => ({
          timestamp: new Date(log.timestamp).toISOString(),
          server_id: log.serverId,
          message: log.message,
          metadata: log.metadata
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get error summary',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Global AI limits across all providers and regions
   */
  fastify.get('/health/ai-limits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const limitedProviders = await globalLimitService.getAllLimitedProviders();
      
      return reply.send({
        total_limited_providers: limitedProviders.length,
        any_provider_limited: limitedProviders.length > 0,
        limited_providers: limitedProviders.map(provider => ({
          provider: provider.provider,
          region: provider.region,
          reset_time: new Date(provider.resetAt).toISOString(),
          time_remaining_seconds: Math.max(0, Math.ceil(provider.timeRemaining / 1000)),
          set_by_server: provider.setBy,
          set_at: new Date(provider.setAt).toISOString()
        })),
        next_reset: limitedProviders.length > 0 ? 
          new Date(Math.min(...limitedProviders.map(p => p.resetAt))).toISOString() : null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get AI limits',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // ADMIN OPERATIONS (Future: add authentication)
  // ============================================================================

  /**
   * Clear Redis log buffer (admin operation)
   */
  fastify.delete('/health/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // TODO: Add admin authentication
      await loggingService.clearLogBuffer();
      
      return reply.send({
        message: 'Log buffer cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to clear log buffer',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Manually clear AI provider limit (admin override)
   */
  fastify.delete('/health/ai-limits/:provider/:region', async (
    request: FastifyRequest<{
      Params: { provider: string; region: string }
    }>, 
    reply: FastifyReply
  ) => {
    try {
      // TODO: Add admin authentication
      const { provider, region } = request.params;
      
      await globalLimitService.clearProviderLimit(provider, region);
      
      await loggingService.logCapacityEvent('manual_limit_clear', {
        provider,
        region,
        clearedBy: 'admin', // TODO: get actual admin user
        timestamp: Date.now()
      });
      
      return reply.send({
        message: `AI limit cleared for ${provider}:${region}`,
        provider,
        region,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to clear AI limit',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get Redis buffer status
   */
  fastify.get('/health/logs/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const bufferStatus = await loggingService.getBufferStatus();
      
      return reply.send({
        redis_logging: bufferStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get buffer status',
        timestamp: new Date().toISOString()
      });
    }
  });
}