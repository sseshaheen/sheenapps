import { AlertRule, LogEntry } from '../services/logAlertingService';

/**
 * Production Alert Rules
 * 
 * Code-based MVP alert configuration with expert-tuned suppression intervals.
 * Rules are organized by severity and impact to minimize noise while catching critical issues.
 * 
 * Key Patterns:
 * - Explicit keys for consistent fingerprinting
 * - Severity-appropriate suppression intervals
 * - Multi-channel routing based on impact
 * - Pattern functions for complex logic, RegExp for simple text matching
 */

export const ALERT_RULES: AlertRule[] = [
  // ========================================
  // CRITICAL ALERTS (Immediate Response)
  // ========================================
  
  {
    key: 'system_critical_error',
    name: 'System Critical Error',
    description: 'Critical system-level errors that require immediate attention',
    pattern: (entry: LogEntry) => 
      entry.tier === 'system' && entry.severity === 'error',
    severity: 'critical',
    channels: ['slack', 'discord', 'email', 'sms'],
    suppressionMinutes: 5, // Short suppression for critical issues
    enabled: true
  },

  {
    key: 'security_hmac_failed',
    name: 'HMAC Validation Failure',
    description: 'Security breach - HMAC signature validation failed',
    pattern: /HMAC.*validation.*failed/i,
    severity: 'critical',
    channels: ['slack', 'discord', 'email', 'sms'],
    suppressionMinutes: 5,
    enabled: true
  },

  {
    key: 'security_token_breach',
    name: 'Token Security Breach',
    description: 'Potential token compromise or unauthorized access',
    pattern: (entry: LogEntry) => {
      const message = entry.message || '';
      return /unauthorized.*token|token.*compromised|invalid.*authentication/i.test(message) ||
             (entry.event === 'authentication_failed' && entry.tier === 'system');
    },
    severity: 'critical',
    channels: ['slack', 'discord', 'email', 'sms'],
    suppressionMinutes: 5,
    enabled: true
  },

  {
    key: 'database_connection_lost',
    name: 'Database Connection Lost',
    description: 'Database connectivity issues affecting core functionality',
    pattern: /database.*connection.*lost|connection.*refused.*postgres|pool.*exhausted/i,
    severity: 'critical',
    channels: ['slack', 'discord', 'email'],
    suppressionMinutes: 10,
    enabled: true
  },

  // ========================================
  // HIGH SEVERITY ALERTS (Fast Response)
  // ========================================
  
  {
    key: 'deploy_failed',
    name: 'Deployment Failed',
    description: 'Deployment failures across all providers',
    pattern: (entry: LogEntry) => 
      entry.tier === 'deploy' && entry.event === 'failed',
    severity: 'high',
    channels: ['slack', 'discord', 'email'],
    suppressionMinutes: 10,
    enabled: true
  },

  {
    key: 'build_failed_multiple',
    name: 'Multiple Build Failures',
    description: 'Build failures that could indicate systemic issues',
    pattern: (entry: LogEntry) => 
      entry.tier === 'build' && entry.event === 'failed',
    severity: 'high',
    channels: ['slack', 'discord'],
    suppressionMinutes: 15,
    enabled: true
  },

  {
    key: 'vercel_api_errors',
    name: 'Vercel API Errors',
    description: 'Vercel API integration failures',
    pattern: (entry: LogEntry) => {
      const message = entry.message || '';
      const metadata = entry.metadata || {};
      return /vercel.*api.*error|vercel.*authentication.*failed/i.test(message) ||
             (metadata.provider === 'vercel' && entry.severity === 'error');
    },
    severity: 'high',
    channels: ['slack', 'discord'],
    suppressionMinutes: 15,
    enabled: true
  },

  {
    key: 'circuit_breaker_opened',
    name: 'Circuit Breaker Opened',
    description: 'Service circuit breaker opened due to failures',
    pattern: /circuit.*breaker.*opened|service.*degraded.*circuit/i,
    severity: 'high',
    channels: ['slack', 'discord'],
    suppressionMinutes: 15,
    enabled: true
  },

  {
    key: 'redis_connection_issues',
    name: 'Redis Connection Issues',
    description: 'Redis connectivity problems affecting caching and queues',
    pattern: /redis.*connection.*error|redis.*timeout|redis.*refused/i,
    severity: 'high',
    channels: ['slack', 'discord'],
    suppressionMinutes: 15,
    enabled: true
  },

  // ========================================
  // MEDIUM SEVERITY ALERTS (Standard Response)  
  // ========================================

  {
    key: 'build_timeout',
    name: 'Build Timeout',
    description: 'Build processes exceeding time limits',
    pattern: (entry: LogEntry) => 
      entry.tier === 'build' && 
      (entry.event === 'timeout' || /timeout.*build|build.*exceeded.*time/i.test(entry.message || '')),
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 20,
    enabled: true
  },

  {
    key: 'deployment_timeout',
    name: 'Deployment Timeout',  
    description: 'Deployment processes exceeding time limits',
    pattern: (entry: LogEntry) => 
      entry.tier === 'deploy' && 
      (entry.event === 'timeout' || /timeout.*deploy|deploy.*exceeded.*time/i.test(entry.message || '')),
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 20,
    enabled: true
  },

  {
    key: 'high_error_rate',
    name: 'High Error Rate Detected',
    description: 'Elevated error rates indicating potential issues',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata || {};
      return metadata.errorRate && parseFloat(metadata.errorRate as string) > 0.1; // 10% error rate
    },
    severity: 'medium', 
    channels: ['slack'],
    suppressionMinutes: 30,
    enabled: true
  },

  {
    key: 'queue_depth_high',
    name: 'Queue Depth High',
    description: 'Background queue depth indicating processing delays',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata || {};
      const queueDepth = metadata.queueDepth || metadata.queue_depth;
      return queueDepth && parseInt(queueDepth as string) > 1000;
    },
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 30,
    enabled: true
  },

  {
    key: 'memory_usage_high', 
    name: 'High Memory Usage',
    description: 'Memory usage approaching limits',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata || {};
      const memoryUsage = metadata.memoryUsage || metadata.memory_usage;
      return memoryUsage && parseFloat(memoryUsage as string) > 0.8; // 80% memory usage
    },
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 30,
    enabled: true
  },

  // ========================================
  // LOW SEVERITY ALERTS (Informational)
  // ========================================

  {
    key: 'webhook_retry_exhausted',
    name: 'Webhook Retry Exhausted',
    description: 'Webhook delivery failed after all retry attempts',
    pattern: /webhook.*retry.*exhausted|webhook.*failed.*final.*attempt/i,
    severity: 'low',
    channels: ['slack'],
    suppressionMinutes: 60,
    enabled: true
  },

  {
    key: 'cleanup_job_failed',
    name: 'Cleanup Job Failed',
    description: 'Background cleanup jobs failing',
    pattern: (entry: LogEntry) =>
      entry.tier === 'system' && /cleanup.*failed|cleanup.*error/i.test(entry.message || ''),
    severity: 'low',
    channels: ['slack'],
    suppressionMinutes: 60,
    enabled: true
  },

  {
    key: 'rate_limit_exceeded',
    name: 'Rate Limit Exceeded',
    description: 'API rate limits exceeded for external services',
    pattern: /rate.*limit.*exceeded|too.*many.*requests|429.*error/i,
    severity: 'low',
    channels: ['slack'],
    suppressionMinutes: 60,
    enabled: true
  },

  {
    key: 'disk_space_warning',
    name: 'Disk Space Warning',
    description: 'Disk space usage approaching limits',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata || {};
      const diskUsage = metadata.diskUsage || metadata.disk_usage;
      return diskUsage && parseFloat(diskUsage as string) > 0.7; // 70% disk usage
    },
    severity: 'low',
    channels: ['slack'],
    suppressionMinutes: 120, // 2 hours
    enabled: true
  },

  // ========================================
  // ENVIRONMENT-SPECIFIC RULES
  // ========================================

  {
    key: 'production_deployment_success',
    name: 'Production Deployment Success',
    description: 'Successful production deployments (informational)',
    pattern: (entry: LogEntry) => 
      entry.tier === 'deploy' && 
      entry.event === 'completed' && 
      (entry.metadata as any)?.targetEnvironment === 'production',
    severity: 'low',
    channels: ['slack'],
    suppressionMinutes: 0, // No suppression for success notifications
    enabled: process.env.NODE_ENV === 'production' // Only in production
  },

  // ========================================
  // BUSINESS LOGIC ALERTS
  // ========================================

  {
    key: 'user_quota_exceeded',
    name: 'User Quota Exceeded',
    description: 'User exceeding usage quotas',
    pattern: (entry: LogEntry) =>
      /quota.*exceeded|usage.*limit.*reached/i.test(entry.message || '') ||
      (entry.event === 'quota_exceeded'),
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 30,
    enabled: true
  },

  {
    key: 'payment_processing_failed',
    name: 'Payment Processing Failed', 
    description: 'Payment processing errors',
    pattern: (entry: LogEntry) =>
      entry.tier === 'action' && /payment.*failed|billing.*error|stripe.*error/i.test(entry.message || ''),
    severity: 'high',
    channels: ['slack', 'discord', 'email'],
    suppressionMinutes: 10,
    enabled: true
  },

  // ========================================
  // ADVANCED PRODUCTION ALERTS
  // ========================================

  {
    key: 'deployment_rollback_triggered',
    name: 'Deployment Rollback Triggered',
    description: 'Automatic or manual rollback initiated',
    pattern: (entry: LogEntry) =>
      entry.tier === 'deploy' && 
      (entry.event === 'rollback' || /rollback.*initiated|reverting.*deployment/i.test(entry.message || '')),
    severity: 'high',
    channels: ['slack', 'discord', 'email'],
    suppressionMinutes: 5,
    enabled: true
  },

  {
    key: 'oauth_integration_failed',
    name: 'OAuth Integration Failed',
    description: 'OAuth authentication failures with external services',
    pattern: (entry: LogEntry) =>
      /oauth.*failed|token.*refresh.*failed|authorization.*expired/i.test(entry.message || '') ||
      (entry.metadata as any)?.errorType === 'oauth_error',
    severity: 'high',
    channels: ['slack', 'discord'],
    suppressionMinutes: 15,
    enabled: true
  },

  {
    key: 'webhook_delivery_failed_cascade',
    name: 'Webhook Delivery Failed (Cascade)',
    description: 'Multiple webhook delivery failures indicating potential system issue',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata as any;
      return entry.tier === 'action' && 
             entry.event === 'webhook_failed' &&
             metadata?.consecutiveFailures && 
             parseInt(metadata.consecutiveFailures) >= 3;
    },
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 20,
    enabled: true
  },

  {
    key: 'log_ingestion_backlog',
    name: 'Log Ingestion Backlog',
    description: 'Log processing falling behind, potential data loss risk',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata as any;
      return entry.tier === 'system' &&
             metadata?.logBacklogSize &&
             parseInt(metadata.logBacklogSize) > 10000;
    },
    severity: 'high',
    channels: ['slack', 'discord'],
    suppressionMinutes: 10,
    enabled: true
  },

  {
    key: 'api_key_rotation_needed',
    name: 'API Key Rotation Needed',
    description: 'API keys approaching expiration',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata as any;
      return entry.tier === 'system' &&
             /api.*key.*expir|credential.*expir/i.test(entry.message || '') &&
             metadata?.daysUntilExpiry &&
             parseInt(metadata.daysUntilExpiry) <= 7;
    },
    severity: 'medium',
    channels: ['slack', 'email'],
    suppressionMinutes: 1440, // 24 hours - don't spam daily
    enabled: true
  },

  {
    key: 'concurrent_deployment_limit',
    name: 'Concurrent Deployment Limit Reached',
    description: 'Too many simultaneous deployments, may indicate resource constraints',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata as any;
      return entry.tier === 'deploy' &&
             /concurrent.*limit|deployment.*queue.*full/i.test(entry.message || '') &&
             metadata?.activeDeployments &&
             parseInt(metadata.activeDeployments) >= 10;
    },
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 15,
    enabled: true
  },

  {
    key: 'cost_anomaly_detected',
    name: 'Cost Anomaly Detected',
    description: 'Unusual spending patterns detected',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata as any;
      return entry.tier === 'system' &&
             /cost.*anomaly|spending.*spike|billing.*alert/i.test(entry.message || '') &&
             metadata?.costIncrease &&
             parseFloat(metadata.costIncrease) > 1.5; // 50% increase
    },
    severity: 'high',
    channels: ['slack', 'email'],
    suppressionMinutes: 60,
    enabled: true
  },

  {
    key: 'user_session_anomaly',
    name: 'User Session Anomaly',
    description: 'Suspicious user activity patterns',
    pattern: (entry: LogEntry) => {
      const metadata = entry.metadata as any;
      return entry.tier === 'action' &&
             /suspicious.*activity|unusual.*login|rate.*limit.*user/i.test(entry.message || '') &&
             metadata?.riskScore &&
             parseFloat(metadata.riskScore) > 0.8;
    },
    severity: 'medium',
    channels: ['slack'],
    suppressionMinutes: 30,
    enabled: process.env.NODE_ENV === 'production' // Only in production
  }
];

// Expert: Kill switches for different environments
export const ALERT_CONFIG = {
  enabled: process.env.LOG_ALERTS_ENABLED !== 'false',
  channels: {
    slack: process.env.SLACK_ALERTS_ENABLED !== 'false',
    discord: process.env.DISCORD_ALERTS_ENABLED !== 'false', 
    email: process.env.EMAIL_ALERTS_ENABLED !== 'false',
    sms: process.env.SMS_ALERTS_ENABLED === 'true' // Expert: opt-in for SMS
  },
  // Environment-specific overrides
  suppressionMultiplier: process.env.NODE_ENV === 'production' ? 1 : 2, // Longer suppression in dev
  enabledSeverities: (process.env.LOG_ALERT_SEVERITIES || 'critical,high,medium,low').split(',')
};

// Filter rules based on environment configuration
export const getActiveAlertRules = (): AlertRule[] => {
  if (!ALERT_CONFIG.enabled) return [];
  
  return ALERT_RULES.filter(rule => 
    rule.enabled && 
    ALERT_CONFIG.enabledSeverities.includes(rule.severity)
  ).map(rule => ({
    ...rule,
    // Apply environment-specific suppression multiplier
    suppressionMinutes: rule.suppressionMinutes * ALERT_CONFIG.suppressionMultiplier
  }));
};

// Config already exported above