import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ServerRegistryService } from '../services/serverRegistryService';
import { RequestRoutingService } from '../services/requestRoutingService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication';

/**
 * Cluster Management API Endpoints
 * Provides multi-server coordination and monitoring capabilities
 */

export async function clusterRoutes(fastify: FastifyInstance) {
  const registryService = ServerRegistryService.getInstance();
  const routingService = RequestRoutingService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // ============================================================================
  // CLUSTER STATUS AND MONITORING
  // ============================================================================

  /**
   * Get comprehensive cluster overview
   */
  fastify.get('/cluster/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [clusterStats, allServers] = await Promise.all([
        registryService.getClusterStats(),
        registryService.getAllRegisteredServers()
      ]);
      
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      return reply.send({
        cluster_overview: {
          total_servers: clusterStats.totalServers,
          healthy_servers: clusterStats.healthyServers,
          degraded_servers: clusterStats.degradedServers,
          unhealthy_servers: clusterStats.unhealthyServers,
          maintenance_servers: clusterStats.maintenanceServers,
          servers_with_ai_capacity: clusterStats.serversWithAICapacity
        },
        capacity_summary: {
          total_capacity: clusterStats.totalCapacity,
          current_load: clusterStats.totalLoad,
          utilization_percent: clusterStats.totalCapacity > 0 ? 
            Math.round((clusterStats.totalLoad / clusterStats.totalCapacity) * 100) : 0,
          available_capacity: Math.max(0, clusterStats.totalCapacity - clusterStats.totalLoad)
        },
        distribution: {
          by_region: clusterStats.regionDistribution,
          by_ai_provider: clusterStats.providerDistribution
        },
        servers: allServers.map(server => ({
          id: server.id,
          url: server.url,
          region: server.region,
          status: server.health.status,
          ai_capacity_available: server.health.aiCapacity.available,
          ai_limit_type: server.health.aiCapacity.limitType,
          current_load: server.currentLoad,
          max_capacity: server.maxConcurrentBuilds,
          priority: server.priority,
          maintenance_mode: server.isMaintenanceMode,
          last_heartbeat: new Date(server.lastHeartbeat).toISOString(),
          heartbeat_age_seconds: Math.floor((now - server.lastHeartbeat) / 1000),
          is_stale: (server.lastHeartbeat < fiveMinutesAgo),
          capabilities: server.capabilities,
          metadata: {
            version: server.metadata.version,
            environment: server.metadata.environment,
            uptime_hours: Math.round(server.health.systemMetrics.uptime / 3600)
          }
        })),
        cluster_health: {
          overall_status: clusterStats.healthyServers > 0 ? 
            (clusterStats.unhealthyServers === 0 ? 'healthy' : 'degraded') : 
            'critical',
          can_accept_requests: clusterStats.serversWithAICapacity > 0,
          redundancy_level: clusterStats.healthyServers > 1 ? 'high' : 
                           clusterStats.healthyServers === 1 ? 'medium' : 'none'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get cluster status',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get detailed information about a specific server
   */
  fastify.get('/cluster/servers/:serverId', async (request: FastifyRequest<{
    Params: { serverId: string }
  }>, reply: FastifyReply) => {
    try {
      const { serverId } = request.params;
      const serverInfo = await registryService.getServerInfo(serverId);
      
      if (!serverInfo) {
        return reply.code(404).send({
          error: 'Server not found',
          server_id: serverId,
          timestamp: new Date().toISOString()
        });
      }
      
      const now = Date.now();
      
      return reply.send({
        server: {
          id: serverInfo.id,
          url: serverInfo.url,
          region: serverInfo.region,
          priority: serverInfo.priority,
          maintenance_mode: serverInfo.isMaintenanceMode,
          last_heartbeat: new Date(serverInfo.lastHeartbeat).toISOString(),
          heartbeat_age_seconds: Math.floor((now - serverInfo.lastHeartbeat) / 1000),
          is_stale: serverInfo.lastHeartbeat < (now - 5 * 60 * 1000)
        },
        capacity: {
          max_concurrent_builds: serverInfo.maxConcurrentBuilds,
          current_load: serverInfo.currentLoad,
          utilization_percent: Math.round((serverInfo.currentLoad / serverInfo.maxConcurrentBuilds) * 100),
          available_slots: Math.max(0, serverInfo.maxConcurrentBuilds - serverInfo.currentLoad)
        },
        health: {
          status: serverInfo.health.status,
          last_check: new Date(serverInfo.health.lastHealthCheck).toISOString(),
          ai_capacity: serverInfo.health.aiCapacity,
          system_metrics: {
            memory_rss_mb: Math.round(serverInfo.health.systemMetrics.memoryRSS / (1024 * 1024)),
            memory_heap_mb: Math.round(serverInfo.health.systemMetrics.memoryHeapUsed / (1024 * 1024)),
            uptime_hours: Math.round(serverInfo.health.systemMetrics.uptime / 3600),
            node_version: serverInfo.health.systemMetrics.nodeVersion
          },
          redis: serverInfo.health.redis,
          workload: serverInfo.health.workload
        },
        capabilities: serverInfo.capabilities,
        metadata: serverInfo.metadata,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get server information',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get routing statistics across the cluster
   */
  fastify.get('/cluster/routing', async (request: FastifyRequest<{
    Querystring: { hours?: number }
  }>, reply: FastifyReply) => {
    try {
      const { hours = 24 } = request.query;
      const routingStats = await routingService.getRoutingStats(hours);
      
      return reply.send({
        period_hours: hours,
        routing_summary: {
          total_requests: routingStats.totalRequests,
          local_handled: routingStats.localRequests,
          proxied_requests: routingStats.proxiedRequests,
          failed_requests: routingStats.failedRequests,
          success_rate: routingStats.totalRequests > 0 ? 
            Math.round(((routingStats.totalRequests - routingStats.failedRequests) / routingStats.totalRequests) * 100) : 0,
          proxy_rate: routingStats.totalRequests > 0 ? 
            Math.round((routingStats.proxiedRequests / routingStats.totalRequests) * 100) : 0
        },
        routing_reasons: routingStats.routingReasons,
        target_server_distribution: routingStats.targetServers,
        performance: {
          average_latency_ms: routingStats.averageLatency
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get routing statistics',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // SERVER MANAGEMENT OPERATIONS
  // ============================================================================

  /**
   * Get available servers for a specific request type
   */
  fastify.get('/cluster/available-servers', async (request: FastifyRequest<{
    Querystring: { 
      ai_provider?: string;
      region?: string;
      feature?: string;
      request_type?: 'interactive' | 'background';
      min_health?: 'healthy' | 'degraded';
    }
  }>, reply: FastifyReply) => {
    try {
      const { ai_provider, region, feature, request_type, min_health } = request.query;
      
      const availableServers = await registryService.getAvailableServers({
        aiProvider: ai_provider,
        region,
        feature,
        excludeMaintenanceMode: true,
        minHealthStatus: min_health
      });
      
      return reply.send({
        filters: { ai_provider, region, feature, request_type, min_health },
        total_available: availableServers.length,
        servers: availableServers.map(server => ({
          id: server.id,
          url: server.url,
          region: server.region,
          priority: server.priority,
          current_load: server.currentLoad,
          max_capacity: server.maxConcurrentBuilds,
          utilization_percent: Math.round((server.currentLoad / server.maxConcurrentBuilds) * 100),
          health_status: server.health.status,
          ai_capacity_available: server.health.aiCapacity.available,
          capabilities: server.capabilities
        })),
        optimal_server: availableServers[0]?.id ?? null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get available servers',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Test server selection for a hypothetical request
   */
  fastify.post('/cluster/test-routing', async (request: FastifyRequest<{
    Body: {
      ai_provider?: string;
      region?: string;
      request_type?: 'interactive' | 'background';
      prefer_local?: boolean;
    }
  }>, reply: FastifyReply) => {
    try {
      const { ai_provider = 'anthropic', region = 'us-east', request_type = 'interactive', prefer_local = true } = request.body;
      
      const optimalServer = await registryService.selectOptimalServer({
        aiProvider: ai_provider,
        region,
        requestType: request_type,
        preferLocal: prefer_local
      });
      
      const shouldRoute = await routingService.shouldRoute({
        aiProvider: ai_provider,
        requestType: request_type
      });
      
      return reply.send({
        test_criteria: {
          ai_provider,
          region,
          request_type,
          prefer_local
        },
        routing_decision: {
          should_route: shouldRoute.shouldRoute,
          reason: shouldRoute.reason,
          selected_server: optimalServer?.id || null,
          local_server: process.env.SERVER_ID || 'default'
        },
        selected_server_details: optimalServer ? {
          id: optimalServer.id,
          url: optimalServer.url,
          region: optimalServer.region,
          current_load: optimalServer.currentLoad,
          health_status: optimalServer.health.status,
          ai_capacity_available: optimalServer.health.aiCapacity.available
        } : null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to test routing',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // ADMIN OPERATIONS (Authenticated)
  // ============================================================================

  const adminAuth = requireAdminAuth({ permissions: ['cluster:write'] });

  /**
   * Put server in maintenance mode
   */
  fastify.put<{
    Params: { serverId: string };
    Body: { maintenance_mode: boolean; reason?: string | undefined; }
  }>('/cluster/servers/:serverId/maintenance', {
    preHandler: [adminAuth as any]
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;
      const { serverId } = request.params;
      const { maintenance_mode, reason } = request.body;
      
      const serverInfo = await registryService.getServerInfo(serverId);
      
      if (!serverInfo) {
        return reply.code(404).send({
          error: 'Server not found',
          server_id: serverId,
          timestamp: new Date().toISOString()
        });
      }
      
      // For the current server, we can update the environment variable
      if (serverId === (process.env.SERVER_ID || 'default')) {
        process.env.MAINTENANCE_MODE = maintenance_mode.toString();
        
        await loggingService.logServerEvent(
          'health',
          'info',
          `Server maintenance mode ${maintenance_mode ? 'enabled' : 'disabled'}`,
          {
            serverId,
            maintenanceMode: maintenance_mode,
            reason: reason || 'Manual admin action',
            changedBy: adminRequest.adminClaims?.email || adminRequest.adminClaims?.sub || 'admin'
          }
        );
      }
      
      return reply.send({
        message: `Server ${serverId} maintenance mode ${maintenance_mode ? 'enabled' : 'disabled'}`,
        server_id: serverId,
        maintenance_mode,
        reason: reason || 'No reason provided',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to update server maintenance mode',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Remove stale servers from registry
   */
  fastify.delete<{
    Querystring: { max_age_minutes?: number | undefined }
  }>('/cluster/stale-servers', {
    preHandler: [adminAuth as any]
  }, async (request, reply) => {
    try {
      const { max_age_minutes = 10 } = request.query;
      const cutoffTime = Date.now() - (max_age_minutes * 60 * 1000);
      
      const allServers = await registryService.getAllRegisteredServers();
      const staleServers = allServers.filter(server => server.lastHeartbeat < cutoffTime);
      
      for (const staleServer of staleServers) {
        await registryService.deregisterServer(staleServer.id);
      }
      
      await loggingService.logServerEvent(
        'health',
        'info',
        `Removed ${staleServers.length} stale servers from registry`,
        {
          removedServers: staleServers.map(s => s.id),
          maxAgeMinutes: max_age_minutes,
          cutoffTime: new Date(cutoffTime).toISOString()
        }
      );
      
      return reply.send({
        message: `Removed ${staleServers.length} stale servers`,
        removed_servers: staleServers.map(s => ({
          id: s.id,
          last_heartbeat: new Date(s.lastHeartbeat).toISOString(),
          age_minutes: Math.round((Date.now() - s.lastHeartbeat) / (60 * 1000))
        })),
        cutoff_age_minutes: max_age_minutes,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to clean up stale servers',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  const adminAuthRead = requireAdminAuth({ permissions: ['cluster:read'] });

  /**
   * Get cluster event logs
   */
  fastify.get<{
    Querystring: {
      count?: number | undefined;
      type?: 'health' | 'routing' | 'capacity' | undefined;
      level?: 'info' | 'warn' | 'error' | undefined;
      server?: string | undefined;
    }
  }>('/cluster/logs', {
    preHandler: [adminAuthRead as any]
  }, async (request, reply) => {
    try {
      const { count = 100, type, level, server } = request.query;
      
      let logs;
      if (server) {
        logs = await loggingService.getLogsByServer(server, count);
      } else {
        logs = await loggingService.getRecentLogs(count, type as any, level as any);
      }
      
      // Filter for cluster-relevant logs
      const clusterLogs = logs.filter(log => 
        log.logType === 'health' || 
        log.logType === 'routing' || 
        log.logType === 'capacity'
      );
      
      return reply.send({
        filters: { count, type, level, server },
        total_logs: clusterLogs.length,
        logs: clusterLogs.map(log => ({
          timestamp: new Date(log.timestamp).toISOString(),
          server_id: log.serverId,
          type: log.logType,
          level: log.level,
          message: log.message,
          metadata: log.metadata
        })),
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get cluster logs',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });
}