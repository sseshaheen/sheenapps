import { FastifyInstance } from 'fastify';
import { revenueMetricsService } from '../services/revenueMetricsService';
import { requireAdminAuth, requireReadOnlyAccess } from '../middleware/adminAuthentication';
import { withCorrelationId } from '../middleware/correlationIdMiddleware';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

export default async function adminMetricsRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/admin/metrics/revenue
   * Get comprehensive revenue metrics (MRR, ARR, LTV, ARPU)
   */
  fastify.get('/v1/admin/metrics/revenue', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const metrics = await revenueMetricsService.getAllMetrics();
      
      return reply.send(
        withCorrelationId({
          success: true,
          data: metrics,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_revenue_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch revenue metrics' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/metrics/mrr
   * Get MRR breakdown with growth components
   */
  fastify.get('/v1/admin/metrics/mrr', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const mrr = await revenueMetricsService.getMRR();
      
      return reply.send(
        withCorrelationId({
          success: true,
          data: mrr,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_mrr_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch MRR metrics' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/metrics/ltv
   * Get customer lifetime value metrics
   */
  fastify.get('/v1/admin/metrics/ltv', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const ltv = await revenueMetricsService.getLTV();
      
      return reply.send(
        withCorrelationId({
          success: true,
          data: ltv,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_ltv_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch LTV metrics' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/metrics/arpu
   * Get average revenue per user metrics
   */
  fastify.get('/v1/admin/metrics/arpu', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const arpu = await revenueMetricsService.getARPU();
      
      return reply.send(
        withCorrelationId({
          success: true,
          data: arpu,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_arpu_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch ARPU metrics' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/metrics/growth
   * Get revenue growth metrics (MoM, QoQ, YoY)
   */
  fastify.get('/v1/admin/metrics/growth', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const growth = await revenueMetricsService.getGrowth();
      
      return reply.send(
        withCorrelationId({
          success: true,
          data: growth,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_growth_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch growth metrics' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/metrics/refresh
   * Refresh materialized views (admin only)
   */
  fastify.post('/v1/admin/metrics/refresh', {
    preHandler: requireAdminAuth({ 
      permissions: ['admin.elevated'],
      requireReason: true,
      logActions: true
    })
  }, async (request, reply) => {
    try {
      await revenueMetricsService.refreshViews();
      
      // Log admin action
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Admin refreshed revenue metrics views',
        {
          admin_id: (request as any).adminClaims?.userId,
          reason: request.headers['x-admin-reason'],
          correlation_id: request.correlationId
        }
      );
      
      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Revenue metrics views refreshed successfully',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_refresh_error', error as Error, {
        admin_id: (request as any).adminClaims?.userId,
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to refresh metrics views' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/metrics/dashboard
   * Get dashboard-ready metrics summary
   */
  fastify.get('/v1/admin/metrics/dashboard', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const metrics = await revenueMetricsService.getAllMetrics();
      
      // Format for dashboard consumption
      const dashboardData = {
        revenue: {
          mrr: metrics.mrr.total,
          arr: metrics.arr,
          growth: {
            percentage: metrics.growth.monthOverMonth,
            absolute: metrics.growth.currentMonth - metrics.growth.previousMonth
          }
        },
        customers: {
          total: metrics.arpu.totalCustomers,
          arpu: metrics.arpu.overall,
          ltv: metrics.ltv.overall
        },
        breakdown: {
          byPlan: metrics.mrr.byPlan,
          byGateway: metrics.mrr.byGateway,
          byCountry: metrics.mrr.byCountry
        },
        movements: {
          newBusiness: metrics.mrr.newBusiness,
          expansion: metrics.mrr.expansion,
          contraction: metrics.mrr.contraction,
          churn: metrics.mrr.churn
        }
      };
      
      return reply.send(
        withCorrelationId({
          success: true,
          data: dashboardData,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_metrics_dashboard_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard metrics' },
        correlation_id: request.correlationId
      });
    }
  });
}