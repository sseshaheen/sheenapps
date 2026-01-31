import { createServerSupabaseClientNew } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export enum QuotaEventType {
  DENIAL = 'QUOTA_DENIAL',
  CONSUMED = 'QUOTA_CONSUMED',
  BONUS_USED = 'BONUS_USED',
  SPIKE_DETECTED = 'SPIKE_DETECTED',
  CONCURRENT_ATTEMPT = 'CONCURRENT_ATTEMPT',
  RACE_CONDITION = 'RACE_CONDITION',
  BYPASS_ATTEMPT = 'BYPASS_ATTEMPT'
}

export interface QuotaLogMetadata {
  timestamp?: string
  environment?: string
  endpoint?: string
  requestId?: string
  [key: string]: any
}

export class QuotaLogger {
  private static async log(
    eventType: QuotaEventType,
    userId: string,
    metric: string,
    metadata: QuotaLogMetadata
  ) {
    try {
      const supabase = await createServerSupabaseClientNew()
      
      // Log to audit table
      const { error } = await supabase
        .from('quota_audit_logs')
        .insert({
          event_type: eventType,
          user_id: userId,
          metric,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV
          }
        })

      if (error) {
        logger.error('Failed to log quota event', {
          error,
          eventType,
          userId,
          metric
        })
      }
      
      // Critical events also go to external monitoring
      if (eventType === QuotaEventType.SPIKE_DETECTED || 
          eventType === QuotaEventType.BYPASS_ATTEMPT ||
          eventType === QuotaEventType.RACE_CONDITION) {
        await this.alertMonitoring(userId, metric, metadata, eventType)
      }
    } catch (error) {
      logger.error('QuotaLogger error', error)
    }
  }
  
  static async logDenial(
    userId: string,
    metric: string,
    requested: number,
    available: number,
    endpoint?: string
  ) {
    await this.log(QuotaEventType.DENIAL, userId, metric, {
      requested,
      available,
      shortage: requested - available,
      endpoint
    })
  }
  
  static async logConsumption(
    userId: string,
    metric: string,
    amount: number,
    remaining: number,
    bonusUsed: number = 0,
    endpoint?: string
  ) {
    await this.log(
      bonusUsed > 0 ? QuotaEventType.BONUS_USED : QuotaEventType.CONSUMED, 
      userId, 
      metric, 
      {
        amount,
        remaining,
        bonusUsed,
        endpoint
      }
    )
  }
  
  static async logSpike(
    userId: string,
    metric: string,
    recentUsage: number,
    normalUsage: number,
    timeWindow: string
  ) {
    await this.log(QuotaEventType.SPIKE_DETECTED, userId, metric, {
      recentUsage,
      normalUsage,
      spikeRatio: normalUsage > 0 ? recentUsage / normalUsage : recentUsage,
      timeWindow,
      alertLevel: 'high'
    })
  }
  
  static async logConcurrentAttempt(
    userId: string,
    metric: string,
    attemptCount: number,
    timeWindowMs: number
  ) {
    await this.log(QuotaEventType.CONCURRENT_ATTEMPT, userId, metric, {
      attemptCount,
      timeWindowMs,
      possibleAbuse: attemptCount > 5
    })
  }

  static async logRaceCondition(
    userId: string,
    metric: string,
    details: any
  ) {
    await this.log(QuotaEventType.RACE_CONDITION, userId, metric, {
      ...details,
      severity: 'critical'
    })
  }

  static async logBypassAttempt(
    userId: string,
    endpoint: string,
    method: string,
    details: any
  ) {
    await this.log(QuotaEventType.BYPASS_ATTEMPT, userId, 'unknown', {
      endpoint,
      method,
      ...details,
      severity: 'critical',
      securityAlert: true
    })
  }

  static async logAlert(
    eventType: string,
    userId: string,
    metric: string,
    metadata: QuotaLogMetadata
  ) {
    // Convert string eventType to QuotaEventType if it exists, otherwise use a generic alert type
    const quotaEventType = Object.values(QuotaEventType).includes(eventType as QuotaEventType) 
      ? eventType as QuotaEventType 
      : QuotaEventType.SPIKE_DETECTED // Default to spike detected for generic alerts
    
    await this.log(quotaEventType, userId, metric, metadata)
  }
  
  private static async alertMonitoring(
    userId: string,
    metric: string,
    metadata: any,
    eventType: QuotaEventType
  ) {
    // Log to console for now - will be replaced with proper alerting
    logger.error(`QUOTA_ALERT: ${eventType}`, {
      userId,
      metric,
      ...metadata,
      alert: true,
      timestamp: new Date().toISOString()
    })

    // If Slack webhook is configured, send alert
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await this.sendSlackAlert(eventType, userId, metric, metadata)
      } catch (error) {
        logger.error('Failed to send Slack alert', error)
      }
    }

    // Track in Sentry if available
    if (typeof window === 'undefined' && process.env.SENTRY_DSN) {
      // Server-side Sentry tracking
      const Sentry = await import('@sentry/nextjs')
      Sentry.captureMessage(`Quota Alert: ${eventType}`, {
        level: 'warning',
        tags: {
          quota_event: eventType,
          user_id: userId,
          metric
        },
        extra: metadata
      })
    }
  }

  private static async sendSlackAlert(
    eventType: QuotaEventType,
    userId: string,
    metric: string,
    metadata: any
  ) {
    const emoji = {
      [QuotaEventType.SPIKE_DETECTED]: '📈',
      [QuotaEventType.BYPASS_ATTEMPT]: '🚨',
      [QuotaEventType.RACE_CONDITION]: '⚠️',
      [QuotaEventType.CONCURRENT_ATTEMPT]: '🔄'
    }[eventType] || '📊'

    const color = {
      [QuotaEventType.SPIKE_DETECTED]: 'warning',
      [QuotaEventType.BYPASS_ATTEMPT]: 'danger',
      [QuotaEventType.RACE_CONDITION]: 'danger',
      [QuotaEventType.CONCURRENT_ATTEMPT]: 'warning'
    }[eventType] || 'warning'

    const payload = {
      text: `${emoji} Quota Alert: ${eventType}`,
      attachments: [{
        color,
        fields: [
          {
            title: 'Event Type',
            value: eventType,
            short: true
          },
          {
            title: 'User ID',
            value: userId.slice(0, 8) + '...',
            short: true
          },
          {
            title: 'Metric',
            value: metric,
            short: true
          },
          {
            title: 'Environment',
            value: process.env.NODE_ENV || 'unknown',
            short: true
          },
          {
            title: 'Details',
            value: `\`\`\`${JSON.stringify(metadata, null, 2)}\`\`\``,
            short: false
          }
        ],
        timestamp: new Date().toISOString()
      }]
    }

    const response = await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`)
    }
  }

  // Utility method to analyze usage patterns
  static async analyzeUsagePattern(userId: string, metric: string): Promise<{
    isSpike: boolean
    isConcurrent: boolean
    usage24h: number
    averageDaily: number
  }> {
    const supabase = await createServerSupabaseClientNew()
    
    // Get usage in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentUsage } = await supabase
      .from('usage_events')
      .select('amount, created_at')
      .eq('user_id', userId)
      .eq('metric', metric)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })

    const usage24h = recentUsage?.reduce((sum, event) => sum + event.amount, 0) || 0

    // Get average daily usage over last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: weekUsage } = await supabase
      .from('usage_events')
      .select('amount')
      .eq('user_id', userId)
      .eq('metric', metric)
      .gte('created_at', sevenDaysAgo)
      .lt('created_at', twentyFourHoursAgo)

    const weekTotal = weekUsage?.reduce((sum, event) => sum + event.amount, 0) || 0
    const averageDaily = weekTotal / 6 // Exclude today

    // Check for concurrent attempts (multiple requests within 1 second)
    let isConcurrent = false
    if (recentUsage && recentUsage.length > 1) {
      for (let i = 1; i < Math.min(recentUsage.length, 10); i++) {
        const timeDiff = new Date(recentUsage[i-1].created_at).getTime() - 
                        new Date(recentUsage[i].created_at).getTime()
        if (timeDiff < 1000) { // Less than 1 second
          isConcurrent = true
          break
        }
      }
    }

    // Spike detection: 3x average or more than 50 in 24h
    const isSpike = averageDaily > 0 
      ? usage24h > averageDaily * 3 
      : usage24h > 50

    // Log if spike detected
    if (isSpike) {
      await this.logSpike(userId, metric, usage24h, averageDaily, '24h')
    }

    // Log if concurrent attempts detected
    if (isConcurrent) {
      await this.logConcurrentAttempt(
        userId, 
        metric, 
        recentUsage.filter((_, i) => i < 10).length,
        1000
      )
    }

    return {
      isSpike,
      isConcurrent,
      usage24h,
      averageDaily
    }
  }
}