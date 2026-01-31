/**
 * Admin System Health Routes
 *
 * Provides API endpoints for the System Health Dashboard:
 * - Overall platform status
 * - Service status grid
 * - SLO compliance
 * - "Why is it red?" degradation analysis
 * - Sparkline data for trends
 */

import { FastifyInstance } from 'fastify';
import { requireAdminAuth, requireReadOnlyAccess } from '../middleware/adminAuthentication';
import { withCorrelationId } from '../middleware/correlationIdMiddleware';
import { getAdminMetricsService } from '../services/admin/AdminMetricsService';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

export default async function adminSystemHealthRoutes(fastify: FastifyInstance) {
  const metricsService = getAdminMetricsService();

  /**
   * GET /v1/admin/system-health
   * Get overall system health status with all components
   */
  fastify.get('/v1/admin/system-health', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      // Fetch all data in parallel
      const [serviceStatuses, sloCompliance] = await Promise.all([
        metricsService.getServiceStatuses(),
        metricsService.getSLOCompliance(),
      ]);

      // Calculate overall status from SLO compliance
      const hasOutage = serviceStatuses.some(s => s.status === 'outage');
      const hasDegraded = serviceStatuses.some(s => s.status === 'degraded');
      const hasSLOBreach = sloCompliance.some(s => !s.compliant);

      let overallStatus: 'operational' | 'degraded' | 'outage';
      let overallMessage: string;

      if (hasOutage) {
        overallStatus = 'outage';
        const outageServices = serviceStatuses
          .filter(s => s.status === 'outage')
          .map(s => s.display_name)
          .join(', ');
        overallMessage = `Outage: ${outageServices}`;
      } else if (hasDegraded || hasSLOBreach) {
        overallStatus = 'degraded';
        const issues: string[] = [];
        if (hasDegraded) {
          const degradedServices = serviceStatuses
            .filter(s => s.status === 'degraded')
            .map(s => s.display_name)
            .join(', ');
          issues.push(degradedServices);
        }
        if (hasSLOBreach) {
          const breachedSLOs = sloCompliance
            .filter(s => !s.compliant)
            .map(s => s.name)
            .join(', ');
          issues.push(`SLO breach: ${breachedSLOs}`);
        }
        overallMessage = `Degraded: ${issues.join('; ')}`;
      } else {
        overallStatus = 'operational';
        overallMessage = 'All Systems Operational';
      }

      return reply.send(
        withCorrelationId({
          success: true,
          data: {
            overall: {
              status: overallStatus,
              message: overallMessage,
            },
            services: serviceStatuses,
            slos: sloCompliance,
          },
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_system_health_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch system health' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/system-health/services
   * Get detailed service status grid
   */
  fastify.get('/v1/admin/system-health/services', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const services = await metricsService.getServiceStatuses();

      return reply.send(
        withCorrelationId({
          success: true,
          data: services,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_service_status_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch service statuses' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/system-health/slos
   * Get SLO compliance data
   */
  fastify.get('/v1/admin/system-health/slos', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const slos = await metricsService.getSLOCompliance();

      return reply.send(
        withCorrelationId({
          success: true,
          data: slos,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_slo_compliance_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch SLO compliance' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/system-health/degradation/:serviceName
   * Get "Why is it red?" analysis for a specific service
   */
  fastify.get<{
    Params: { serviceName: string };
  }>('/v1/admin/system-health/degradation/:serviceName', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { serviceName } = request.params;
      const analysis = await metricsService.getServiceDegradationAnalysis(serviceName);

      return reply.send(
        withCorrelationId({
          success: true,
          data: {
            service: serviceName,
            ...analysis,
          },
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_degradation_analysis_error', error as Error, {
        correlation_id: request.correlationId,
        serviceName: request.params.serviceName
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch degradation analysis' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/system-health/sparkline/:metricName
   * Get sparkline data for a metric (24h by default)
   */
  fastify.get<{
    Params: { metricName: string };
    Querystring: { hours?: string };
  }>('/v1/admin/system-health/sparkline/:metricName', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { metricName } = request.params;
      const hours = parseInt(request.query.hours || '24', 10);

      const data = await metricsService.getSparklineData(metricName, hours);

      return reply.send(
        withCorrelationId({
          success: true,
          data: {
            metric: metricName,
            hours,
            points: data,
          },
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_sparkline_error', error as Error, {
        correlation_id: request.correlationId,
        metricName: request.params.metricName
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sparkline data' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/system-health/comprehensive
   * Aggregated endpoint: overall health + services + SLOs + sparklines in one call.
   * Replaces 4 separate client requests (1 health + 3 sparklines).
   */
  fastify.get<{
    Querystring: { hours?: string };
  }>('/v1/admin/system-health/comprehensive', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const hours = parseInt(request.query.hours || '24', 10);
      const sparklineMetrics = ['api_requests_total', 'builds_total', 'api_request_duration_ms'];

      // Run all queries in parallel with graceful degradation
      const [serviceStatusesResult, sloComplianceResult, ...sparklineResults] = await Promise.allSettled([
        metricsService.getServiceStatuses(),
        metricsService.getSLOCompliance(),
        ...sparklineMetrics.map(metric => metricsService.getSparklineData(metric, hours)),
      ]);

      const failures: string[] = [];
      if (serviceStatusesResult.status === 'rejected') failures.push('services');
      if (sloComplianceResult.status === 'rejected') failures.push('slos');

      const serviceStatuses = serviceStatusesResult.status === 'fulfilled' ? serviceStatusesResult.value : [];
      const sloCompliance = sloComplianceResult.status === 'fulfilled' ? sloComplianceResult.value : [];

      // Calculate overall status
      const hasOutage = serviceStatuses.some(s => s.status === 'outage');
      const hasDegraded = serviceStatuses.some(s => s.status === 'degraded');
      const hasSLOBreach = sloCompliance.some(s => !s.compliant);

      let overallStatus: 'operational' | 'degraded' | 'outage';
      let overallMessage: string;

      if (failures.length > 0) {
        overallStatus = 'degraded';
        overallMessage = `Unable to determine full status (${failures.join(', ')} unavailable)`;
      } else if (hasOutage) {
        overallStatus = 'outage';
        const outageServices = serviceStatuses
          .filter(s => s.status === 'outage')
          .map(s => s.display_name)
          .join(', ');
        overallMessage = `Outage: ${outageServices}`;
      } else if (hasDegraded || hasSLOBreach) {
        overallStatus = 'degraded';
        const issues: string[] = [];
        if (hasDegraded) {
          issues.push(serviceStatuses.filter(s => s.status === 'degraded').map(s => s.display_name).join(', '));
        }
        if (hasSLOBreach) {
          issues.push(`SLO breach: ${sloCompliance.filter(s => !s.compliant).map(s => s.name).join(', ')}`);
        }
        overallMessage = `Degraded: ${issues.join('; ')}`;
      } else {
        overallStatus = 'operational';
        overallMessage = 'All Systems Operational';
      }

      // Build sparklines map
      const sparklines: Record<string, any[]> = {};
      sparklineMetrics.forEach((metric, i) => {
        const result = sparklineResults[i] as PromiseSettledResult<any[]> | undefined;
        if (result?.status === 'fulfilled') {
          sparklines[metric] = result.value || [];
        } else {
          sparklines[metric] = [];
          failures.push(`sparkline:${metric}`);
        }
      });

      return reply.send(
        withCorrelationId({
          success: true,
          data: {
            overall: { status: overallStatus, message: overallMessage },
            services: serviceStatuses,
            slos: sloCompliance,
            sparklines,
          },
          meta: failures.length > 0 ? { partial: true, failures } : undefined,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_system_health_comprehensive_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch comprehensive system health' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/system-health/metrics
   * Get raw metrics data with optional filters
   */
  fastify.get<{
    Querystring: {
      metric?: string;
      hours?: string;
      route?: string;
      status_code?: string;
      provider?: string;
    };
  }>('/v1/admin/system-health/metrics', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { metric, hours = '24', route, status_code, provider } = request.query;

      if (!metric) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'metric query parameter is required' },
          correlation_id: request.correlationId
        });
      }

      const dimensions: Record<string, string> = {};
      if (route) dimensions.route = route;
      if (status_code) dimensions.status_code = status_code;
      if (provider) dimensions.provider = provider;

      const data = await metricsService.getMetrics(
        metric,
        parseInt(hours, 10),
        Object.keys(dimensions).length > 0 ? dimensions : undefined
      );

      return reply.send(
        withCorrelationId({
          success: true,
          data: {
            metric,
            hours: parseInt(hours, 10),
            dimensions,
            points: data,
          },
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_query_error', error as Error, {
        correlation_id: request.correlationId,
        metric: request.query.metric
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch metrics' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/system-health/services/:serviceName/status
   * Update service status (for manual intervention or external monitoring)
   */
  fastify.post<{
    Params: { serviceName: string };
    Body: {
      status: 'operational' | 'degraded' | 'outage' | 'unknown';
      error_message?: string;
      metrics?: Record<string, number>;
    };
  }>('/v1/admin/system-health/services/:serviceName/status', {
    preHandler: requireAdminAuth({ permissions: ['system_health.write'] })
  }, async (request, reply) => {
    try {
      const { serviceName } = request.params;
      const { status, error_message, metrics } = request.body;

      await metricsService.updateServiceStatus(
        serviceName,
        status,
        error_message,
        metrics
      );

      return reply.send(
        withCorrelationId({
          success: true,
          message: `Service ${serviceName} status updated to ${status}`,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_service_status_update_error', error as Error, {
        correlation_id: request.correlationId,
        serviceName: request.params.serviceName
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update service status' },
        correlation_id: request.correlationId
      });
    }
  });
}
