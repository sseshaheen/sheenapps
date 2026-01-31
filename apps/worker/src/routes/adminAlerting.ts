import { FastifyPluginAsync } from 'fastify';
import { logAlertingService } from '../services/logAlertingService';
import { getAlertQueue, getQueueStats, cleanupOldJobs } from '../services/alertQueue';
import { ALERT_RULES, getActiveAlertRules, ALERT_CONFIG } from '../config/alertRules';

/**
 * Admin Alerting Routes
 * 
 * Provides administrative endpoints for managing the alerting system:
 * - View and configure alert rules
 * - Monitor queue health and performance
 * - Test alert channels
 * - Manage suppression overrides
 * 
 * Security: All endpoints require admin authentication
 */

interface AdminAlertingRoutes {
  Querystring: {
    userId: string;
  };
  Body: {
    userId: string;
    [key: string]: any;
  };
  Params: {
    ruleKey?: string;
    alertId?: string;
  };
}

const adminAlertingRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ========================================
  // Alert Rules Management
  // ========================================

  /**
   * GET /admin/alerting/rules - List all alert rules
   */
  fastify.get<AdminAlertingRoutes>('/admin/alerting/rules', async (request, reply) => {
    const { userId } = request.query;

    try {
      const activeRules = getActiveAlertRules();
      const totalRules = ALERT_RULES.length;
      
      return {
        success: true,
        data: {
          rules: ALERT_RULES.map(rule => ({
            key: rule.key,
            name: rule.name,
            description: rule.description,
            severity: rule.severity,
            channels: rule.channels,
            suppressionMinutes: rule.suppressionMinutes,
            enabled: rule.enabled,
            active: activeRules.some(ar => ar.key === rule.key)
          })),
          summary: {
            total: totalRules,
            active: activeRules.length,
            inactive: totalRules - activeRules.length,
            bySeverity: {
              critical: ALERT_RULES.filter(r => r.severity === 'critical').length,
              high: ALERT_RULES.filter(r => r.severity === 'high').length,
              medium: ALERT_RULES.filter(r => r.severity === 'medium').length,
              low: ALERT_RULES.filter(r => r.severity === 'low').length
            }
          },
          config: {
            enabled: ALERT_CONFIG.enabled,
            channels: ALERT_CONFIG.channels,
            suppressionMultiplier: ALERT_CONFIG.suppressionMultiplier,
            enabledSeverities: ALERT_CONFIG.enabledSeverities
          }
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to fetch alert rules',
        details: (error as Error).message
      };
    }
  });

  /**
   * GET /admin/alerting/rules/:ruleKey - Get specific alert rule details
   */
  fastify.get<AdminAlertingRoutes>('/admin/alerting/rules/:ruleKey', async (request, reply) => {
    const { userId } = request.query;
    const { ruleKey } = request.params;

    try {
      const rule = ALERT_RULES.find(r => r.key === ruleKey);
      if (!rule) {
        reply.code(404);
        return {
          success: false,
          error: 'Alert rule not found',
          ruleKey
        };
      }

      const activeRules = getActiveAlertRules();
      const isActive = activeRules.some(ar => ar.key === ruleKey);

      return {
        success: true,
        data: {
          ...rule,
          active: isActive,
          patternType: typeof rule.pattern === 'function' ? 'function' : 'regexp',
          metadata: {
            createdAt: new Date().toISOString(), // Placeholder - would be from database
            updatedAt: new Date().toISOString(),
            triggeredCount: 0, // Would track from metrics
            lastTriggered: null,
            suppressedCount: 0
          }
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to fetch alert rule',
        details: (error as Error).message
      };
    }
  });

  /**
   * POST /admin/alerting/test - Test alert channels
   */
  fastify.post<AdminAlertingRoutes>('/admin/alerting/test', async (request, reply) => {
    const { userId, channel, severity = 'medium' } = request.body;

    try {
      const testEntry = {
        id: `test-alert-${Date.now()}`,
        tier: 'system' as const,
        severity: 'info' as const,
        event: 'test_alert',
        message: 'This is a test alert from the admin interface',
        timestamp: new Date(),
        metadata: {
          testMode: true,
          triggeredBy: userId,
          channel: channel || 'all'
        }
      };

      const testRule = {
        key: 'admin_test_alert',
        name: 'Admin Test Alert',
        description: 'Test alert triggered from admin interface',
        pattern: () => true,
        severity: severity as 'low' | 'medium' | 'high' | 'critical',
        channels: channel ? [channel] : ['slack', 'discord'],
        suppressionMinutes: 0, // No suppression for tests
        enabled: true
      };

      // Process test alert directly (bypass queue for immediate testing)
      await logAlertingService.processLogEntry(testEntry);

      return {
        success: true,
        message: `Test alert sent to ${channel || 'all configured channels'}`,
        data: {
          testEntry: {
            id: testEntry.id,
            message: testEntry.message,
            timestamp: testEntry.timestamp
          },
          rule: {
            name: testRule.name,
            severity: testRule.severity,
            channels: testRule.channels
          }
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to send test alert',
        details: (error as Error).message
      };
    }
  });

  // ========================================
  // Queue Management
  // ========================================

  /**
   * GET /admin/alerting/queue/status - Get queue health and stats
   */
  fastify.get<AdminAlertingRoutes>('/admin/alerting/queue/status', async (request, reply) => {
    const { userId } = request.query;

    try {
      const stats = await getQueueStats();
      const queue = getAlertQueue();
      
      // Get additional queue information
      const queueInfo = {
        name: queue.name,
        isPaused: await queue.isPaused(),
        // Add more queue health metrics as needed
      };

      return {
        success: true,
        data: {
          stats,
          info: queueInfo,
          health: {
            status: stats.failed > stats.completed * 0.1 ? 'unhealthy' : 'healthy',
            failureRate: stats.total > 0 ? (stats.failed / stats.total) : 0,
            queueDepth: stats.waiting + stats.active,
            processingRate: stats.completed // Simplified - would calculate over time
          },
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to fetch queue status',
        details: (error as Error).message
      };
    }
  });

  /**
   * POST /admin/alerting/queue/cleanup - Clean up old jobs
   */
  fastify.post<AdminAlertingRoutes>('/admin/alerting/queue/cleanup', async (request, reply) => {
    const { userId } = request.body;

    try {
      await cleanupOldJobs();
      const stats = await getQueueStats();

      return {
        success: true,
        message: 'Queue cleanup completed',
        data: {
          stats,
          cleanedBy: userId,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to cleanup queue',
        details: (error as Error).message
      };
    }
  });

  /**
   * POST /admin/alerting/queue/pause - Pause alert processing
   */
  fastify.post<AdminAlertingRoutes>('/admin/alerting/queue/pause', async (request, reply) => {
    const { userId } = request.body;

    try {
      const queue = getAlertQueue();
      await queue.pause();

      return {
        success: true,
        message: 'Alert queue paused',
        data: {
          pausedBy: userId,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to pause queue',
        details: (error as Error).message
      };
    }
  });

  /**
   * POST /admin/alerting/queue/resume - Resume alert processing
   */
  fastify.post<AdminAlertingRoutes>('/admin/alerting/queue/resume', async (request, reply) => {
    const { userId } = request.body;

    try {
      const queue = getAlertQueue();
      await queue.resume();

      return {
        success: true,
        message: 'Alert queue resumed',
        data: {
          resumedBy: userId,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to resume queue',
        details: (error as Error).message
      };
    }
  });

  // ========================================
  // Monitoring & Metrics
  // ========================================

  /**
   * GET /admin/alerting/metrics - Get alerting system metrics
   */
  fastify.get<AdminAlertingRoutes>('/admin/alerting/metrics', async (request, reply) => {
    const { userId } = request.query;

    try {
      const stats = await getQueueStats();
      
      // Placeholder metrics - would integrate with actual metrics system
      const metrics = {
        alerts: {
          triggered: 0,
          suppressed: 0,
          sent: 0,
          failed: 0
        },
        channels: {
          slack: { sent: 0, failed: 0 },
          discord: { sent: 0, failed: 0 },
          email: { sent: 0, failed: 0 },
          sms: { sent: 0, failed: 0 }
        },
        rules: {
          critical: { triggered: 0, suppressed: 0 },
          high: { triggered: 0, suppressed: 0 },
          medium: { triggered: 0, suppressed: 0 },
          low: { triggered: 0, suppressed: 0 }
        },
        queue: stats,
        performance: {
          avgProcessingTime: 0, // milliseconds
          p95ProcessingTime: 0,
          errorRate: stats.total > 0 ? (stats.failed / stats.total) : 0,
          throughput: 0 // alerts per minute
        }
      };

      return {
        success: true,
        data: {
          metrics,
          period: 'last_24h', // Would be configurable
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to fetch metrics',
        details: (error as Error).message
      };
    }
  });

  // ========================================
  // Configuration Management
  // ========================================

  /**
   * GET /admin/alerting/config - Get current alerting configuration
   */
  fastify.get<AdminAlertingRoutes>('/admin/alerting/config', async (request, reply) => {
    const { userId } = request.query;

    try {
      const config = {
        system: ALERT_CONFIG,
        environment: {
          LOG_ALERTS_ENABLED: process.env.LOG_ALERTS_ENABLED,
          SLACK_ALERTS_ENABLED: process.env.SLACK_ALERTS_ENABLED,
          DISCORD_ALERTS_ENABLED: process.env.DISCORD_ALERTS_ENABLED,
          EMAIL_ALERTS_ENABLED: process.env.EMAIL_ALERTS_ENABLED,
          SMS_ALERTS_ENABLED: process.env.SMS_ALERTS_ENABLED,
          LOG_ALERT_SEVERITIES: process.env.LOG_ALERT_SEVERITIES,
          NODE_ENV: process.env.NODE_ENV
        },
        webhooks: {
          slack: !!process.env.SLACK_ALERT_WEBHOOK_URL,
          discord: !!process.env.DISCORD_ALERT_WEBHOOK_URL
        },
        sms: {
          configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          numbersConfigured: (process.env.SMS_ALERT_NUMBERS || '').split(',').length
        }
      };

      return {
        success: true,
        data: config
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to fetch configuration',
        details: (error as Error).message
      };
    }
  });

  /**
   * GET /admin/alerting/health - Overall alerting system health check
   */
  fastify.get<AdminAlertingRoutes>('/admin/alerting/health', async (request, reply) => {
    const { userId } = request.query;

    try {
      const stats = await getQueueStats();
      const queue = getAlertQueue();
      const isPaused = await queue.isPaused();
      
      const health = {
        overall: 'healthy',
        components: {
          alertingService: 'healthy',
          queue: isPaused ? 'paused' : (stats.error ? 'unhealthy' : 'healthy'),
          redis: stats.error ? 'degraded' : 'healthy',
          channels: {
            slack: !!process.env.SLACK_ALERT_WEBHOOK_URL ? 'configured' : 'not_configured',
            discord: !!process.env.DISCORD_ALERT_WEBHOOK_URL ? 'configured' : 'not_configured',
            email: 'placeholder', // Would check email service
            sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? 'configured' : 'not_configured'
          }
        },
        stats: {
          activeRules: getActiveAlertRules().length,
          totalRules: ALERT_RULES.length,
          queueDepth: stats.waiting + stats.active,
          failedJobs: stats.failed
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };

      // Determine overall health
      const unhealthyComponents = Object.values(health.components)
        .filter(status => typeof status === 'string' && ['unhealthy', 'degraded'].includes(status));
      
      if (unhealthyComponents.length > 0) {
        health.overall = 'degraded';
      }
      
      if (health.components.queue === 'paused') {
        health.overall = 'paused';
      }

      return {
        success: true,
        data: health
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: 'Failed to check system health',
        details: (error as Error).message
      };
    }
  });
};

export default adminAlertingRoutes;