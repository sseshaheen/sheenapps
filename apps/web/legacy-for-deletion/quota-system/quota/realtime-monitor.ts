import { createClient } from '@/lib/supabase'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { QuotaLogger } from './quota-logger'
import { logger } from '@/utils/logger'

interface QuotaEvent {
  id: string
  user_id: string
  metric: string
  attempted_amount: number
  success: boolean
  reason: string
  context: any
  created_at: string
}

interface AlertThresholds {
  denialThreshold: number      // Denials per minute to trigger alert
  concurrentThreshold: number  // Concurrent attempts to trigger alert
  spikeMultiplier: number      // Usage multiplier for spike detection
}

export class QuotaRealtimeMonitor {
  private channel: RealtimeChannel | null = null
  private denialWindow = new Map<string, number[]>()
  private alertCallbacks = new Map<string, ((event: any) => void)[]>()
  private isConnected = false
  private cleanupInterval: NodeJS.Timeout | null = null
  
  private thresholds: AlertThresholds = {
    denialThreshold: 5,
    concurrentThreshold: 3,
    spikeMultiplier: 3
  }

  constructor(thresholds?: Partial<AlertThresholds>) {
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds }
    }
    
    // Set up periodic cleanup to prevent memory leak
    this.cleanupInterval = setInterval(() => {
      this.cleanupDenialWindow()
    }, 5 * 60 * 1000) // Every 5 minutes
  }
  
  private cleanupDenialWindow() {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000 // 1 hour
    
    // Clean up old denial records
    for (const [userId, denials] of this.denialWindow.entries()) {
      const recentDenials = denials.filter(time => time > oneHourAgo)
      
      if (recentDenials.length === 0) {
        // Remove user entry if no recent denials
        this.denialWindow.delete(userId)
      } else if (recentDenials.length < denials.length) {
        // Update with only recent denials
        this.denialWindow.set(userId, recentDenials)
      }
    }
    
    logger.debug('general', `Cleaned up denial window. Active users: ${this.denialWindow.size}`)
  }
  
  async startMonitoring() {
    try {
      const supabase = createClient()
      
      // Subscribe to quota audit log changes
      this.channel = supabase
        .channel('quota-monitor')
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'quota_audit_log'
          },
          (payload) => this.handleQuotaEvent(payload as RealtimePostgresChangesPayload<QuotaEvent>)
        )
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'quota_audit_logs'
          },
          (payload) => this.handleAuditLogEvent(payload as any)
        )
        .subscribe((status) => {
          this.isConnected = status === 'SUBSCRIBED'
          logger.info(`Quota realtime monitoring ${status}`)
          this.emit('connection-status', { connected: this.isConnected })
        })
      
      logger.info('Quota realtime monitoring started')
    } catch (error) {
      logger.error('Failed to start quota monitoring', error)
      throw error
    }
  }
  
  private async handleQuotaEvent(payload: RealtimePostgresChangesPayload<QuotaEvent>) {
    const event = payload.new as QuotaEvent
    
    if (!event) return
    
    // Emit raw event for dashboards
    this.emit('quota-event', event)
    
    // Track denials per user
    if (!event.success && event.reason === 'quota_exceeded') {
      this.trackDenial(event.user_id)
      
      // Check for abuse patterns
      if (this.isAbusivePattern(event.user_id)) {
        await this.handleAbusivePattern(event)
      }
    }
    
    // Alert on race conditions
    if (event.reason === 'race_condition') {
      await this.handleRaceCondition(event)
    }
    
    // Log all failures for analytics
    if (!event.success) {
      logger.info('Quota failure detected:', {
        userId: event.user_id.slice(0, 8),
        metric: event.metric,
        reason: event.reason,
        attempted: event.attempted_amount
      })
    }
  }

  private async handleAuditLogEvent(payload: RealtimePostgresChangesPayload<any>) {
    const event = payload.new
    
    if (!event) return
    
    // Emit audit event for dashboards
    this.emit('audit-event', event)
    
    // Handle specific event types
    switch (event.event_type) {
      case 'SPIKE_DETECTED':
        await this.handleSpikeEvent(event)
        break
      case 'BYPASS_ATTEMPT':
        await this.handleBypassAttempt(event)
        break
      case 'CONCURRENT_ATTEMPT':
        await this.handleConcurrentAttempt(event)
        break
    }
  }
  
  private trackDenial(userId: string) {
    const now = Date.now()
    const userDenials = this.denialWindow.get(userId) || []
    
    // Add current denial
    userDenials.push(now)
    
    // Remove denials older than 1 minute
    const oneMinuteAgo = now - 60000
    const recentDenials = userDenials.filter(time => time > oneMinuteAgo)
    
    this.denialWindow.set(userId, recentDenials)
    
    // Emit denial rate update
    this.emit('denial-rate', {
      userId,
      denialCount: recentDenials.length,
      timeWindow: '1m'
    })
  }
  
  private isAbusivePattern(userId: string): boolean {
    const denials = this.denialWindow.get(userId) || []
    return denials.length >= this.thresholds.denialThreshold
  }
  
  private getDenialCount(userId: string): number {
    return (this.denialWindow.get(userId) || []).length
  }
  
  private async handleAbusivePattern(event: QuotaEvent) {
    const alert = {
      type: 'QUOTA_ABUSE_DETECTED',
      severity: 'high',
      userId: event.user_id,
      metric: event.metric,
      denialCount: this.getDenialCount(event.user_id),
      context: event.context,
      timestamp: new Date().toISOString()
    }
    
    await this.sendAlert(alert)
    this.emit('abuse-detected', alert)
  }

  private async handleRaceCondition(event: QuotaEvent) {
    const alert = {
      type: 'RACE_CONDITION_DETECTED',
      severity: 'critical',
      userId: event.user_id,
      metric: event.metric,
      context: event.context,
      timestamp: new Date().toISOString()
    }
    
    await this.sendAlert(alert)
    this.emit('race-condition', alert)
  }

  private async handleSpikeEvent(event: any) {
    const alert = {
      type: 'USAGE_SPIKE',
      severity: 'medium',
      userId: event.user_id,
      metric: event.metric,
      metadata: event.metadata,
      timestamp: new Date().toISOString()
    }
    
    await this.sendAlert(alert)
    this.emit('spike-detected', alert)
  }

  private async handleBypassAttempt(event: any) {
    const alert = {
      type: 'BYPASS_ATTEMPT',
      severity: 'critical',
      userId: event.user_id,
      metadata: event.metadata,
      timestamp: new Date().toISOString()
    }
    
    await this.sendAlert(alert)
    this.emit('bypass-attempt', alert)
  }

  private async handleConcurrentAttempt(event: any) {
    const alert = {
      type: 'CONCURRENT_ATTEMPTS',
      severity: 'high',
      userId: event.user_id,
      metric: event.metric,
      metadata: event.metadata,
      timestamp: new Date().toISOString()
    }
    
    await this.sendAlert(alert)
    this.emit('concurrent-attempts', alert)
  }
  
  private async sendAlert(alert: any) {
    // Log to multiple channels
    await Promise.all([
      this.logToConsole(alert),
      this.saveAlertToDb(alert),
      this.sendToWebhooks(alert)
    ]).catch(error => {
      logger.error('Failed to send alerts', error)
    })
  }
  
  private async logToConsole(alert: any) {
    const severityEmoji = {
      low: '📊',
      medium: '⚠️',
      high: '🚨',
      critical: '🔴'
    }[alert.severity] || '📊'
    
    logger.warn(`${severityEmoji} QUOTA ALERT: ${alert.type}`, alert)
  }
  
  private async saveAlertToDb(alert: any) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('admin_alerts')
        .insert({
          type: alert.type,
          severity: alert.severity,
          metadata: alert
        })
      
      if (error) {
        logger.error('Failed to save alert to database', error)
      }
    } catch (error) {
      logger.error('Error saving alert', error)
    }
  }
  
  private async sendToWebhooks(alert: any) {
    // Send to Slack if configured
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await this.sendSlackAlert(alert)
      } catch (error) {
        logger.error('Failed to send Slack alert', error)
      }
    }
    
    // Send to Discord if configured
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        await this.sendDiscordAlert(alert)
      } catch (error) {
        logger.error('Failed to send Discord alert', error)
      }
    }
  }
  
  private async sendSlackAlert(alert: any) {
    const color = {
      low: '#36a64f',
      medium: '#ff9900',
      high: '#ff0000',
      critical: '#990000'
    }[alert.severity] || '#36a64f'
    
    const payload = {
      text: `🚨 Quota Alert: ${alert.type}`,
      attachments: [{
        color,
        fields: [
          {
            title: 'Alert Type',
            value: alert.type,
            short: true
          },
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'User ID',
            value: alert.userId ? alert.userId.slice(0, 8) + '...' : 'N/A',
            short: true
          },
          {
            title: 'Timestamp',
            value: alert.timestamp,
            short: true
          },
          {
            title: 'Details',
            value: `\`\`\`${JSON.stringify(alert.metadata || alert.context || {}, null, 2)}\`\`\``,
            short: false
          }
        ],
        footer: 'SheenApps Quota Monitor',
        ts: Math.floor(Date.now() / 1000)
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
  
  private async sendDiscordAlert(alert: any) {
    const color = {
      low: 3066993,    // Green
      medium: 15844367, // Orange
      high: 15158332,   // Red
      critical: 10038562 // Dark Red
    }[alert.severity] || 3066993
    
    const payload = {
      embeds: [{
        title: `🚨 Quota Alert: ${alert.type}`,
        color,
        fields: [
          {
            name: 'Alert Type',
            value: alert.type,
            inline: true
          },
          {
            name: 'Severity',
            value: alert.severity.toUpperCase(),
            inline: true
          },
          {
            name: 'User ID',
            value: alert.userId ? alert.userId.slice(0, 8) + '...' : 'N/A',
            inline: true
          },
          {
            name: 'Details',
            value: `\`\`\`json\n${JSON.stringify(alert.metadata || alert.context || {}, null, 2)}\`\`\``
          }
        ],
        timestamp: alert.timestamp,
        footer: {
          text: 'SheenApps Quota Monitor'
        }
      }]
    }
    
    const response = await fetch(process.env.DISCORD_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status}`)
    }
  }
  
  // Event emitter functionality
  on(event: string, callback: (data: any) => void) {
    const callbacks: ((data: any) => void)[] = this.alertCallbacks.get(event) || []
    callbacks.push(callback)
    this.alertCallbacks.set(event, callbacks)
  }
  
  off(event: string, callback: (data: any) => void) {
    const callbacks: ((data: any) => void)[] = this.alertCallbacks.get(event) || []
    const filtered = callbacks.filter(cb => cb !== callback)
    this.alertCallbacks.set(event, filtered)
  }
  
  private emit(event: string, data: any) {
    const callbacks = this.alertCallbacks.get(event) || []
    callbacks.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        logger.error(`Error in event callback for ${event}`, error)
      }
    })
  }
  
  async stopMonitoring() {
    // Clean up channel subscription
    if (this.channel) {
      await this.channel.unsubscribe()
      this.channel = null
      this.isConnected = false
    }
    
    // Clean up cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    
    this.denialWindow.clear()
    this.alertCallbacks.clear()
    logger.info('Quota realtime monitoring stopped')
  }
  
  getConnectionStatus(): boolean {
    return this.isConnected
  }
  
  getDenialStats(): Map<string, number> {
    const stats = new Map<string, number>()
    this.denialWindow.forEach((denials, userId) => {
      stats.set(userId, denials.length)
    })
    return stats
  }
  
  updateThresholds(newThresholds: Partial<AlertThresholds>) {
    this.thresholds = { ...this.thresholds, ...newThresholds }
    logger.info('Updated monitoring thresholds', this.thresholds)
  }
}

// Singleton instance for global monitoring
let globalMonitor: QuotaRealtimeMonitor | null = null

export function getGlobalMonitor(): QuotaRealtimeMonitor {
  if (!globalMonitor) {
    globalMonitor = new QuotaRealtimeMonitor()
  }
  return globalMonitor
}

export async function startGlobalMonitoring() {
  const monitor = getGlobalMonitor()
  await monitor.startMonitoring()
  return monitor
}

export async function stopGlobalMonitoring() {
  if (globalMonitor) {
    await globalMonitor.stopMonitoring()
    globalMonitor = null
  }
}