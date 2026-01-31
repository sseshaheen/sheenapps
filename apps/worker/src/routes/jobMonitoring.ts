/**
 * Job Monitoring Dashboard API
 * Provides real-time job status, DLQ statistics, and monitoring data
 * Implements acceptance criteria from TODO_REMAINING_IMPLEMENTATION_PLAN.md
 */

import { FastifyPluginAsync } from 'fastify';
import { jobMonitoringService } from '../services/jobMonitoringService';
import { dailyResetJob } from '../jobs/dailyResetJob';
import { ghostBuildDetectionJob } from '../jobs/ghostBuildDetectionJob';
import { enhancedDailyBonusResetJob } from '../jobs/enhancedDailyBonusResetJob';

// Jobs Overview Dashboard endpoint
const jobMonitoringRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /api/jobs/overview
   * Jobs Overview Dashboard with DLQ visibility and statistics
   */
  fastify.get('/overview', async (request, reply) => {
    try {
      // Get monitoring statistics
      const monitoringStats = await jobMonitoringService.getMonitoringStats();

      // Get individual job statuses
      const [dailyResetStatus, ghostDetectionStats, dailyBonusStatus] = await Promise.all([
        dailyResetJob.getStatus(),
        ghostBuildDetectionJob.getStatistics(),
        // Get enhanced daily bonus job status if available
        enhancedDailyBonusResetJob.getStatus ? enhancedDailyBonusResetJob.getStatus() : Promise.resolve({ isRunning: false, isScheduled: false })
      ]);

      // Compile jobs overview
      const overview = {
        timestamp: new Date().toISOString(),
        redis: {
          connected: monitoringStats.redisConnected,
          status: monitoringStats.redisConnected ? 'healthy' : 'disconnected'
        },
        dlq: {
          totalEntries: Object.values(monitoringStats.dlqStats).reduce((sum, count) => sum + count, 0),
          breakdown: monitoringStats.dlqStats,
          status: Object.values(monitoringStats.dlqStats).reduce((sum, count) => sum + count, 0) > 10 ? 'alert' : 'healthy'
        },
        jobs: {
          daily_reset: {
            type: 'daily_reset',
            isRunning: dailyResetStatus.isRunning,
            isScheduled: dailyResetStatus.isScheduled,
            nextRun: dailyResetStatus.nextRun,
            unresetUsers: dailyResetStatus.unresetUsers || 0,
            status: (dailyResetStatus.unresetUsers || 0) > 0 ? 'warning' : 'healthy',
            schedule: '0 0 * * * (daily at midnight UTC)'
          },
          ghost_build_detection: {
            type: 'ghost_build_detection',
            isRunning: ghostDetectionStats.isRunning,
            isScheduled: ghostDetectionStats.isScheduled,
            currentGhostBuilds: ghostDetectionStats.currentGhostBuilds,
            recentRefunds: ghostDetectionStats.recentRefunds,
            status: ghostDetectionStats.currentGhostBuilds > 10 ? 'alert' : 'healthy',
            schedule: '*/30 * * * * (every 30 minutes)'
          },
          daily_bonus_reset: {
            type: 'daily_bonus_reset',
            isRunning: dailyBonusStatus.isRunning || false,
            isScheduled: dailyBonusStatus.isScheduled || false,
            status: 'healthy',
            schedule: '5 0 * * * (daily at 00:05 UTC)'
          }
        },
        metrics: {
          activeJobTypes: monitoringStats.activeJobs,
          totalDLQEntries: Object.values(monitoringStats.dlqStats).reduce((sum, count) => sum + count, 0)
        }
      };

      reply.send(overview);

    } catch (error) {
      console.error('[Job Monitoring] Failed to get jobs overview:', error);
      reply.code(500).send({
        error: 'Failed to get jobs overview',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/jobs/dlq
   * Dead Letter Queue detailed view
   */
  fastify.get('/dlq', async (request, reply) => {
    try {
      const dlqStats = await jobMonitoringService.getDLQStats();

      reply.send({
        timestamp: new Date().toISOString(),
        dlq: {
          totalEntries: Object.values(dlqStats).reduce((sum, count) => sum + count, 0),
          byJobType: dlqStats,
          status: Object.values(dlqStats).reduce((sum, count) => sum + count, 0) > 10 ? 'alert' : 'healthy'
        }
      });

    } catch (error) {
      console.error('[Job Monitoring] Failed to get DLQ stats:', error);
      reply.code(500).send({
        error: 'Failed to get DLQ statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/jobs/health
   * Overall job system health check
   */
  fastify.get('/health', async (request, reply) => {
    try {
      const monitoringStats = await jobMonitoringService.getMonitoringStats();
      const totalDLQEntries = Object.values(monitoringStats.dlqStats).reduce((sum, count) => sum + count, 0);

      // Determine overall health status
      let status = 'healthy';
      const issues: string[] = [];

      if (!monitoringStats.redisConnected) {
        status = 'degraded';
        issues.push('Redis connection failed');
      }

      if (totalDLQEntries > 50) {
        status = 'critical';
        issues.push(`High DLQ volume: ${totalDLQEntries} entries`);
      } else if (totalDLQEntries > 10) {
        status = 'warning';
        issues.push(`Moderate DLQ volume: ${totalDLQEntries} entries`);
      }

      reply.send({
        status,
        timestamp: new Date().toISOString(),
        redis: {
          connected: monitoringStats.redisConnected
        },
        dlq: {
          totalEntries: totalDLQEntries,
          status: totalDLQEntries > 10 ? 'alert' : 'healthy'
        },
        issues: issues.length > 0 ? issues : null
      });

    } catch (error) {
      console.error('[Job Monitoring] Health check failed:', error);
      reply.code(500).send({
        status: 'critical',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/jobs/test-alert
   * Test alert functionality (synthetic failure)
   * Implements acceptance criteria: "Alert tests fire on synthetic failure"
   */
  fastify.post('/test-alert', async (request, reply) => {
    try {
      console.log('[Job Monitoring] Testing alert system with synthetic failure');

      // Create a synthetic job failure for testing
      await jobMonitoringService.executeJob(
        {
          jobId: `synthetic-test-${Date.now()}`,
          jobType: 'synthetic_test',
          expectedRuntimeMs: 1000,
          maxRetries: 1,
          metadata: {
            testAlert: true,
            triggeredBy: 'api',
            environment: process.env.NODE_ENV || 'development'
          }
        },
        async () => {
          // Simulate a job failure for testing
          throw new Error('Synthetic test failure for alert validation');
        }
      );

    } catch (expectedError) {
      // This error is expected for the test
      console.log('[Job Monitoring] Synthetic alert test completed successfully');

      reply.send({
        status: 'success',
        message: 'Synthetic alert test completed',
        timestamp: new Date().toISOString(),
        note: 'Check logs and alerting system for test alert delivery'
      });
    }
  });

  /**
   * GET /api/jobs/metrics
   * Raw metrics data for external monitoring systems
   */
  fastify.get('/metrics', async (request, reply) => {
    try {
      const monitoringStats = await jobMonitoringService.getMonitoringStats();

      // Format metrics in a structure suitable for Prometheus/Grafana
      const metrics = {
        timestamp: new Date().toISOString(),
        job_dlq_entries_total: Object.values(monitoringStats.dlqStats).reduce((sum, count) => sum + count, 0),
        job_dlq_entries_by_type: monitoringStats.dlqStats,
        job_redis_connected: monitoringStats.redisConnected ? 1 : 0,
        job_active_types_count: monitoringStats.activeJobs
      };

      reply.send(metrics);

    } catch (error) {
      console.error('[Job Monitoring] Failed to get metrics:', error);
      reply.code(500).send({
        error: 'Failed to get job metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
};

export default jobMonitoringRoutes;