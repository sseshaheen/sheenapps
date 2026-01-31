import { createServerSupabaseClientNew } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface AlertRule {
  name: string
  condition: string
  threshold: number
  duration: number // minutes
  severity: 'low' | 'medium' | 'high' | 'critical'
  enabled: boolean
  lastTriggered?: Date
  suppressUntil?: Date
}

interface PerformanceMetric {
  operation: string
  duration: number
  timestamp: Date
  metadata?: any
}

export class QuotaMonitoringAlerts {
  private supabase: any
  private performanceBuffer: PerformanceMetric[] = []
  private alertRules: AlertRule[] = [
    {
      name: 'HighQuotaCheckLatency',
      condition: 'p95_quota_check_duration > threshold',
      threshold: 150, // ms
      duration: 5, // minutes
      severity: 'high',
      enabled: true
    },
    {
      name: 'ExcessiveIdempotencyCollisions',
      condition: 'collision_rate > threshold',
      threshold: 5, // % of requests
      duration: 10,
      severity: 'medium',
      enabled: true
    },
    {
      name: 'HighDenialRate',
      condition: 'denial_rate > threshold',
      threshold: 20, // % of requests
      duration: 5,
      severity: 'high',
      enabled: true
    },
    {
      name: 'RateLimitViolations',
      condition: 'rate_limit_hits > threshold',
      threshold: 100, // hits per minute
      duration: 1,
      severity: 'critical',
      enabled: true
    },
    {
      name: 'DatabaseConnectionIssues',
      condition: 'db_errors > threshold',
      threshold: 10, // errors per minute
      duration: 2,
      severity: 'critical',
      enabled: true
    }
  ]

  constructor() {
    this.supabase = createServerSupabaseClientNew()
    
    // Start monitoring loop
    this.startMonitoring()
    
    // Clean up old performance data every 5 minutes
    setInterval(() => this.cleanupPerformanceBuffer(), 5 * 60 * 1000)
  }

  /**
   * Record quota operation performance (addresses "Automate Grafana alert" feedback)
   */
  recordPerformance(operation: string, startTime: number, metadata?: any) {
    const duration = Date.now() - startTime
    
    this.performanceBuffer.push({
      operation,
      duration,
      timestamp: new Date(),
      metadata
    })

    // Trigger immediate check if duration is very high
    if (duration > 300) { // 300ms threshold for immediate alert
      this.checkHighLatencyAlert(operation, duration)
    }
  }

  /**
   * Record idempotency collision (addresses "Log X-Idempotency-Key collisions" feedback)
   */
  async recordIdempotencyCollision(data: {
    userId: string
    idempotencyKey: string
    originalEventId: string
    collisionDetails: string
    clientIP?: string
    userAgent?: string
  }) {
    try {
      // Log to database
      await this.supabase
        .from('quota_audit_log')
        .insert({
          user_id: data.userId,
          metric: 'idempotency_collision',
          attempted_amount: 0,
          success: false,
          reason: 'collision_detected',
          context: {
            idempotency_key: data.idempotencyKey,
            original_event_id: data.originalEventId,
            collision_details: data.collisionDetails,
            client_ip: data.clientIP,
            user_agent: data.userAgent,
            timestamp: new Date().toISOString()
          }
        })

      // Log to application logs for immediate visibility
      logger.warn('Idempotency key collision detected', {
        userId: data.userId,
        key: data.idempotencyKey.slice(0, 16) + '...', // Truncate for logs
        details: data.collisionDetails,
        clientIP: data.clientIP
      })

      // Check if this indicates a broader problem
      await this.checkCollisionRate(data.userId)

    } catch (error) {
      logger.error('Failed to record idempotency collision', { error, data })
    }
  }

  /**
   * Start monitoring loop to check alert rules
   */
  private startMonitoring() {
    // Check alert rules every minute
    setInterval(async () => {
      for (const rule of this.alertRules) {
        if (rule.enabled && !this.isAlertSuppressed(rule)) {
          await this.checkAlertRule(rule)
        }
      }
    }, 60 * 1000) // Every minute

    logger.info('Quota monitoring alerts started')
  }

  /**
   * Check specific alert rule
   */
  private async checkAlertRule(rule: AlertRule) {
    try {
      let shouldAlert = false
      const alertData: any = {}

      switch (rule.name) {
        case 'HighQuotaCheckLatency':
          shouldAlert = await this.checkQuotaLatency(rule)
          break
          
        case 'ExcessiveIdempotencyCollisions':
          shouldAlert = await this.checkCollisionRateAlert(rule)
          break
          
        case 'HighDenialRate':
          shouldAlert = await this.checkDenialRateAlert(rule)
          break
          
        case 'RateLimitViolations':
          shouldAlert = await this.checkRateLimitAlert(rule)
          break
          
        case 'DatabaseConnectionIssues':
          shouldAlert = await this.checkDatabaseErrorsAlert(rule)
          break
      }

      if (shouldAlert) {
        await this.triggerAlert(rule, alertData)
      }

    } catch (error) {
      logger.error('Failed to check alert rule', { rule: rule.name, error })
    }
  }

  /**
   * Check quota operation latency (p95 > 150ms for 5 minutes)
   */
  private async checkQuotaLatency(rule: AlertRule): Promise<boolean> {
    const cutoff = new Date(Date.now() - rule.duration * 60 * 1000)
    const quotaOperations = this.performanceBuffer.filter(
      m => m.operation.includes('quota') && m.timestamp >= cutoff
    )

    if (quotaOperations.length < 10) return false // Need enough samples

    // Calculate p95
    const durations = quotaOperations.map(op => op.duration).sort((a, b) => a - b)
    const p95Index = Math.floor(durations.length * 0.95)
    const p95Duration = durations[p95Index]

    return p95Duration > rule.threshold
  }

  /**
   * Check immediate high latency (for operations > 300ms)
   */
  private async checkHighLatencyAlert(operation: string, duration: number) {
    await this.triggerAlert({
      name: 'ImmediateHighLatency',
      severity: 'high',
      threshold: 300,
      duration: 0,
      condition: 'immediate',
      enabled: true
    }, {
      operation,
      duration,
      message: `Quota operation took ${duration}ms`
    })
  }

  /**
   * Check collision rate alert
   */
  private async checkCollisionRateAlert(rule: AlertRule): Promise<boolean> {
    try {
      const cutoff = new Date(Date.now() - rule.duration * 60 * 1000)
      
      // Get collision count
      const { data: collisions, error: collisionError } = await this.supabase
        .from('quota_audit_log')
        .select('id')
        .eq('reason', 'collision_detected')
        .gte('created_at', cutoff.toISOString())

      if (collisionError) throw collisionError

      // Get total quota attempts
      const { data: totalAttempts, error: totalError } = await this.supabase
        .from('quota_audit_log')
        .select('id')
        .in('reason', ['success', 'quota_exceeded', 'collision_detected'])
        .gte('created_at', cutoff.toISOString())

      if (totalError) throw totalError

      const collisionRate = totalAttempts.length > 0 
        ? (collisions.length / totalAttempts.length) * 100 
        : 0

      return collisionRate > rule.threshold

    } catch (error) {
      logger.error('Failed to check collision rate', { error })
      return false
    }
  }

  /**
   * Check denial rate alert
   */
  private async checkDenialRateAlert(rule: AlertRule): Promise<boolean> {
    try {
      const cutoff = new Date(Date.now() - rule.duration * 60 * 1000)
      
      const { data: denials, error: denialError } = await this.supabase
        .from('quota_audit_log')
        .select('id')
        .eq('reason', 'quota_exceeded')
        .gte('created_at', cutoff.toISOString())

      const { data: total, error: totalError } = await this.supabase
        .from('quota_audit_log')
        .select('id')
        .in('reason', ['success', 'quota_exceeded'])
        .gte('created_at', cutoff.toISOString())

      if (denialError || totalError) throw new Error('Database query failed')

      const denialRate = total.length > 0 ? (denials.length / total.length) * 100 : 0
      return denialRate > rule.threshold

    } catch (error) {
      logger.error('Failed to check denial rate', { error })
      return false
    }
  }

  /**
   * Check rate limit violations
   */
  private async checkRateLimitAlert(rule: AlertRule): Promise<boolean> {
    try {
      const cutoff = new Date(Date.now() - rule.duration * 60 * 1000)
      
      const { data: rateLimitHits, error } = await this.supabase
        .from('quota_audit_log')
        .select('id')
        .eq('reason', 'rate_limited')
        .gte('created_at', cutoff.toISOString())

      if (error) throw error

      return rateLimitHits.length > rule.threshold

    } catch (error) {
      logger.error('Failed to check rate limit violations', { error })
      return false
    }
  }

  /**
   * Check database connection issues
   */
  private async checkDatabaseErrorsAlert(rule: AlertRule): Promise<boolean> {
    try {
      const cutoff = new Date(Date.now() - rule.duration * 60 * 1000)
      
      const { data: dbErrors, error } = await this.supabase
        .from('quota_audit_log')
        .select('id')
        .eq('reason', 'system_error')
        .gte('created_at', cutoff.toISOString())

      if (error) throw error

      return dbErrors.length > rule.threshold

    } catch (error) {
      logger.error('Failed to check database errors', { error })
      return false
    }
  }

  /**
   * Check collision rate for specific user
   */
  private async checkCollisionRate(userId: string) {
    try {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
      
      const { data: userCollisions, error } = await this.supabase
        .from('quota_audit_log')
        .select('id')
        .eq('user_id', userId)
        .eq('reason', 'collision_detected')
        .gte('created_at', last24h.toISOString())

      if (error) throw error

      // If user has > 10 collisions in 24h, flag as potentially buggy client
      if (userCollisions.length > 10) {
        await this.triggerAlert({
          name: 'BuggyClientDetected',
          severity: 'medium',
          threshold: 10,
          duration: 1440, // 24 hours
          condition: 'user_collision_rate',
          enabled: true
        }, {
          userId,
          collisionCount: userCollisions.length,
          message: 'User has excessive idempotency collisions (potentially buggy client)'
        })
      }

    } catch (error) {
      logger.error('Failed to check user collision rate', { userId, error })
    }
  }

  /**
   * Trigger alert and notify relevant channels
   */
  private async triggerAlert(rule: AlertRule, data: any = {}) {
    try {
      const alertPayload = {
        rule_name: rule.name,
        severity: rule.severity,
        message: this.formatAlertMessage(rule, data),
        metadata: {
          rule,
          data,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        }
      }

      // Log to database
      await this.supabase
        .from('admin_alerts')
        .insert({
          type: rule.name,
          severity: rule.severity,
          metadata: alertPayload.metadata
        })

      // Log to application logs
      logger.warn('Quota monitoring alert triggered', alertPayload)

      // Send to external monitoring (Slack, Discord, etc.)
      await this.sendExternalAlert(alertPayload)

      // Update rule's last triggered time
      rule.lastTriggered = new Date()
      
      // Suppress similar alerts for next 5 minutes to avoid spam
      rule.suppressUntil = new Date(Date.now() + 5 * 60 * 1000)

    } catch (error) {
      logger.error('Failed to trigger alert', { rule: rule.name, error })
    }
  }

  /**
   * Format alert message for humans
   */
  private formatAlertMessage(rule: AlertRule, data: any): string {
    switch (rule.name) {
      case 'HighQuotaCheckLatency':
        return `Quota check latency exceeded ${rule.threshold}ms for ${rule.duration} minutes`
      
      case 'ImmediateHighLatency':
        return `Quota operation took ${data.duration}ms (${data.operation})`
      
      case 'ExcessiveIdempotencyCollisions':
        return `Idempotency collision rate exceeded ${rule.threshold}% over ${rule.duration} minutes`
      
      case 'BuggyClientDetected':
        return `User ${data.userId} has ${data.collisionCount} collisions in 24h (potentially buggy client)`
      
      case 'HighDenialRate':
        return `Quota denial rate exceeded ${rule.threshold}% over ${rule.duration} minutes`
      
      case 'RateLimitViolations':
        return `Rate limit violations exceeded ${rule.threshold} hits per minute`
      
      case 'DatabaseConnectionIssues':
        return `Database errors exceeded ${rule.threshold} per minute for ${rule.duration} minutes`
      
      default:
        return `Alert triggered: ${rule.name}`
    }
  }

  /**
   * Send alert to external monitoring systems
   */
  private async sendExternalAlert(alert: any) {
    // Send to Slack
    if (process.env.SLACK_ALERTS_WEBHOOK) {
      try {
        await fetch(process.env.SLACK_ALERTS_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 Quota Alert: ${alert.message}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Severity:* ${alert.severity}\n*Rule:* ${alert.rule_name}\n*Message:* ${alert.message}`
                }
              }
            ]
          })
        })
      } catch (error) {
        logger.error('Failed to send Slack alert', { error })
      }
    }

    // Could also integrate with:
    // - PagerDuty for critical alerts
    // - Grafana for metric correlation
    // - Email for persistent notifications
  }

  /**
   * Check if alert is currently suppressed
   */
  private isAlertSuppressed(rule: AlertRule): boolean {
    return rule.suppressUntil ? new Date() < rule.suppressUntil : false
  }

  /**
   * Clean up old performance data to prevent memory leaks
   */
  private cleanupPerformanceBuffer() {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000) // Keep 30 minutes
    this.performanceBuffer = this.performanceBuffer.filter(
      metric => metric.timestamp >= cutoff
    )
  }

  /**
   * Get current alert status for dashboard
   */
  async getAlertStatus() {
    const activeAlerts = this.alertRules.filter(rule => 
      rule.lastTriggered && 
      new Date(Date.now() - 60 * 60 * 1000) < rule.lastTriggered // Last hour
    )

    return {
      totalRules: this.alertRules.length,
      enabledRules: this.alertRules.filter(r => r.enabled).length,
      recentAlerts: activeAlerts.length,
      performanceBufferSize: this.performanceBuffer.length
    }
  }
}

// Export singleton instance
export const quotaMonitoringAlerts = new QuotaMonitoringAlerts()