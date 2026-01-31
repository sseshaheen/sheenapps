import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HmacSignatureService } from '../services/hmacSignatureService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';

/**
 * HMAC Signature Monitoring API Endpoints
 * Provides visibility into signature validation, rollout progress, and security metrics
 */

export async function hmacMonitoringRoutes(fastify: FastifyInstance) {
  const hmacService = HmacSignatureService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // ============================================================================
  // ROLLOUT STATUS AND MONITORING
  // ============================================================================

  /**
   * Get HMAC signature rollout status
   */
  fastify.get('/v1/admin/hmac/rollout-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rolloutStatus = hmacService.getRolloutStatus();
      
      return reply.send({
        rollout: {
          phase: rolloutStatus.phase,
          dual_signature_enabled: rolloutStatus.dualSignatureEnabled,
          end_time: new Date(rolloutStatus.rolloutEndTime).toISOString(),
          time_remaining_hours: Math.max(0, Math.ceil(rolloutStatus.timeRemaining / (60 * 60 * 1000)))
        },
        signature_support: {
          accepts_v1: rolloutStatus.acceptsV1,
          accepts_v2: rolloutStatus.acceptsV2,
          v1_deprecation_date: rolloutStatus.acceptsV1 ? 
            new Date(rolloutStatus.rolloutEndTime).toISOString() : 'Already deprecated',
          recommended_version: rolloutStatus.acceptsV2 ? 'v2' : 'v1'
        },
        migration_guidance: {
          current_phase: rolloutStatus.phase,
          action_required: rolloutStatus.phase === 'rollout' ? 
            'Ensure v2 signatures are working before rollout ends' : 
            rolloutStatus.phase === 'v2-only' ? 
            'Remove v1 signature generation from clients' : 
            'Rollout is disabled',
          testing_endpoints: [
            '/hmac/test-signature',
            '/hmac/validation-stats'
          ]
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get rollout status',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get signature validation statistics
   */
  fastify.get('/v1/admin/hmac/validation-stats', async (request: FastifyRequest<{
    Querystring: { hours?: number }
  }>, reply: FastifyReply) => {
    try {
      const { hours = 24 } = request.query;
      const stats = await hmacService.getValidationStats(hours);
      
      const successRate = stats.totalValidations > 0 ? 
        Math.round((stats.successfulValidations / stats.totalValidations) * 100) : 0;
      
      return reply.send({
        period_hours: hours,
        summary: {
          total_validations: stats.totalValidations,
          successful_validations: stats.successfulValidations,
          failed_validations: stats.failedValidations,
          success_rate_percent: successRate
        },
        performance: {
          average_latency_ms: Math.round(stats.averageLatency * 100) / 100
        },
        signature_versions: {
          distribution: stats.versionDistribution,
          v1_usage_percent: stats.versionDistribution.v1 ? 
            Math.round((stats.versionDistribution.v1 / stats.totalValidations) * 100) : 0,
          v2_usage_percent: stats.versionDistribution.v2 ? 
            Math.round((stats.versionDistribution.v2 / stats.totalValidations) * 100) : 0,
          both_versions_percent: stats.versionDistribution.both ? 
            Math.round((stats.versionDistribution.both / stats.totalValidations) * 100) : 0
        },
        recent_failures: stats.recentFailures,
        health_indicators: {
          validation_working: stats.totalValidations > 0,
          high_success_rate: successRate >= 95,
          low_latency: stats.averageLatency < 50,
          no_recent_failures: stats.recentFailures.length === 0
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get validation statistics',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get recent signature validation events
   */
  fastify.get('/v1/admin/hmac/recent-validations', async (request: FastifyRequest<{
    Querystring: { 
      count?: number;
      status?: 'success' | 'failure' | 'all';
      version?: 'v1' | 'v2' | 'both' | 'all';
    }
  }>, reply: FastifyReply) => {
    try {
      const { count = 50, status = 'all', version = 'all' } = request.query;
      
      // Get recent HMAC-related logs
      const logs = await loggingService.getRecentLogs(count * 2, 'capacity');
      
      // Filter for signature validation logs
      const validationLogs = logs
        .filter(log => log.message.includes('HMAC signature validation'))
        .filter(log => {
          if (status === 'success') return log.message.includes('SUCCESS');
          if (status === 'failure') return log.message.includes('FAILURE');
          return true; // 'all'
        })
        .filter(log => {
          if (version === 'all') return true;
          return log.metadata.signatureVersion === version;
        })
        .slice(0, count);
      
      return reply.send({
        filters: { count, status, version },
        total_events: validationLogs.length,
        events: validationLogs.map(log => ({
          timestamp: new Date(log.timestamp).toISOString(),
          server_id: log.serverId,
          status: log.message.includes('SUCCESS') ? 'success' : 'failure',
          signature_version: log.metadata.signatureVersion,
          method: log.metadata.method,
          path: log.metadata.path,
          timestamp_skew: log.metadata.timestampSkew,
          nonce_valid: log.metadata.nonceValid,
          duration_ms: log.metadata.durationMs,
          warnings: log.metadata.warnings,
          ip: log.metadata.ip
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get recent validations',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // SIGNATURE TESTING AND DEBUGGING
  // ============================================================================

  /**
   * Test signature generation for debugging
   */
  fastify.post('/v1/admin/hmac/test-signature', async (request: FastifyRequest<{
    Body: {
      payload: string;
      method: string;
      path: string;
      nonce?: string;
      version: 'v1' | 'v2' | 'both';
    }
  }>, reply: FastifyReply) => {
    try {
      const { payload, method, path, nonce, version } = request.body;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      const result: any = {
        test_parameters: {
          payload_length: payload.length,
          method: method.toUpperCase(),
          path,
          timestamp,
          nonce: nonce || null,
          version
        },
        generated_signatures: {},
        verification: {},
        rollout_status: hmacService.getRolloutStatus()
      };
      
      // Generate v1 signature
      if (version === 'v1' || version === 'both') {
        const v1Signature = hmacService.generateV1Signature(payload, timestamp);
        result.generated_signatures.v1 = {
          signature: v1Signature,
          header_format: {
            'x-sheen-signature': v1Signature,
            'x-sheen-timestamp': timestamp
          }
        };
      }
      
      // Generate v2 signature
      if (version === 'v2' || version === 'both') {
        const { signature: v2Signature, canonicalPayload } = hmacService.generateV2Signature(
          payload, timestamp, method, path, nonce
        );
        
        result.generated_signatures.v2 = {
          signature: v2Signature,
          canonical_payload: canonicalPayload,
          header_format: {
            'x-sheen-sig-v2': v2Signature,
            'x-sheen-timestamp': timestamp,
            ...(nonce && { 'x-sheen-nonce': nonce })
          }
        };
      }
      
      // Verify the generated signatures
      const headers = {
        'x-sheen-signature': result.generated_signatures.v1?.signature,
        'x-sheen-sig-v2': result.generated_signatures.v2?.signature,
        'x-sheen-timestamp': timestamp,
        'x-sheen-nonce': nonce
      };
      
      const verification = await hmacService.validateSignature(payload, headers, method, path);
      result.verification = {
        valid: verification.valid,
        version: verification.version,
        v1_result: verification.v1Result,
        v2_result: verification.v2Result,
        timestamp_result: verification.timestamp,
        nonce_result: verification.nonce,
        warnings: verification.warnings
      };
      
      return reply.send({
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to test signature',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Validate provided signature headers
   */
  fastify.post('/v1/admin/hmac/validate-signature', async (request: FastifyRequest<{
    Body: {
      payload: string;
      method: string;
      path: string;
      headers: {
        'x-sheen-signature'?: string;
        'x-sheen-sig-v2'?: string;
        'x-sheen-timestamp': string;
        'x-sheen-nonce'?: string;
      };
    }
  }>, reply: FastifyReply) => {
    try {
      const { payload, method, path, headers } = request.body;
      
      const validation = await hmacService.validateSignature(payload, headers, method, path);
      
      return reply.send({
        validation_result: {
          valid: validation.valid,
          version: validation.version,
          timestamp: {
            valid: validation.timestamp.valid,
            value: validation.timestamp.value,
            skew_seconds: validation.timestamp.skew,
            error: validation.timestamp.error
          },
          nonce: {
            valid: validation.nonce.valid,
            cached: validation.nonce.cached,
            error: validation.nonce.error
          },
          signature_details: {
            v1_result: validation.v1Result,
            v2_result: validation.v2Result
          },
          warnings: validation.warnings
        },
        rollout_info: hmacService.getRolloutStatus(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to validate signature',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // SECURITY MONITORING
  // ============================================================================

  /**
   * Get security alerts and anomalies
   */
  fastify.get('/v1/admin/hmac/security-alerts', async (request: FastifyRequest<{
    Querystring: { hours?: number }
  }>, reply: FastifyReply) => {
    try {
      const { hours = 24 } = request.query;
      
      // Get recent logs that might indicate security issues
      const logs = await loggingService.getRecentLogs(500, 'capacity');
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      
      const securityLogs = logs.filter(log => 
        log.timestamp >= cutoffTime &&
        (
          log.message.includes('signature_version_mismatch') ||
          log.message.includes('REPLAY_ATTACK_DETECTED') ||
          log.message.includes('HMAC validation FAILURE') ||
          log.metadata.warnings?.some((w: string) => w.includes('CRITICAL'))
        )
      );
      
      const alerts = {
        replay_attacks: securityLogs.filter(log => 
          log.message.includes('REPLAY_ATTACK') || 
          log.metadata.warnings?.some((w: string) => w.includes('replay'))
        ).length,
        
        signature_mismatches: securityLogs.filter(log => 
          log.message.includes('signature_version_mismatch')
        ).length,
        
        timestamp_violations: securityLogs.filter(log => 
          log.metadata.timestampSkew > 120 // Beyond tolerance
        ).length,
        
        validation_failures: securityLogs.filter(log => 
          log.message.includes('HMAC validation FAILURE')
        ).length
      };
      
      const totalAlerts = Object.values(alerts).reduce((sum, count) => sum + count, 0);
      
      return reply.send({
        period_hours: hours,
        alert_summary: {
          total_security_alerts: totalAlerts,
          severity: totalAlerts > 10 ? 'high' : totalAlerts > 3 ? 'medium' : 'low',
          ...alerts
        },
        recent_security_events: securityLogs.slice(0, 20).map(log => ({
          timestamp: new Date(log.timestamp).toISOString(),
          server_id: log.serverId,
          type: log.message.includes('REPLAY_ATTACK') ? 'replay_attack' :
                log.message.includes('signature_version_mismatch') ? 'signature_mismatch' :
                log.message.includes('FAILURE') ? 'validation_failure' : 'other',
          message: log.message,
          metadata: {
            method: log.metadata.method,
            path: log.metadata.path,
            ip: log.metadata.ip,
            timestamp_skew: log.metadata.timestampSkew,
            warnings: log.metadata.warnings
          }
        })),
        recommendations: totalAlerts > 10 ? [
          'High number of security alerts detected',
          'Review client signature implementation',
          'Check for potential replay attacks',
          'Verify timestamp synchronization'
        ] : totalAlerts > 3 ? [
          'Moderate security activity detected',
          'Monitor signature validation trends',
          'Consider reviewing client implementations'
        ] : [
          'Security metrics within normal range',
          'Continue monitoring'
        ],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get security alerts',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get nonce cache status (anti-replay protection health)
   */
  fastify.get('/v1/admin/hmac/nonce-cache-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // This would require exposing cache status from the HMAC service
      // For now, return basic information
      
      const rolloutStatus = hmacService.getRolloutStatus();
      
      return reply.send({
        cache_type: process.env.REDIS_URL ? 'redis_primary' : 'memory_only',
        redis_available: !!process.env.REDIS_URL,
        anti_replay_protection: {
          enabled: true,
          ttl_seconds: 600, // 10 minutes
          window_seconds: 120 // ±2 minutes timestamp tolerance
        },
        rollout_status: rolloutStatus,
        recommendations: !process.env.REDIS_URL ? [
          'Consider using Redis for nonce storage in multi-pod deployments',
          'Current in-memory cache only protects against single-pod replays'
        ] : [
          'Redis-based nonce cache provides multi-pod anti-replay protection',
          'System is properly configured for production use'
        ],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get nonce cache status',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });
}