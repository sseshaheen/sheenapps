import { createHash } from 'crypto';
import { unifiedLogger } from './unifiedLogger';

/**
 * Log Alerting Service
 * 
 * Decoupled alerting system that processes log entries asynchronously without blocking log writes.
 * Uses BullMQ for reliable background processing and SHA1 fingerprinting for deduplication.
 * 
 * Key Features:
 * - Fire-and-forget publishing (never blocks log writes)
 * - SHA1 fingerprinting with deployment correlation prevents spam
 * - Multi-channel notifications with per-channel kill switches
 * - Expert-refined suppression prevents dynamic ID bypass
 */

export interface LogEntry {
  id: string;
  tier: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle';
  severity?: 'info' | 'warn' | 'error' | 'debug';
  event?: string;
  message?: string;
  metadata?: Record<string, any>;
  userId?: string;
  projectId?: string;
  timestamp: Date;
}

export interface AlertRule {
  key: string; // Unique identifier for fingerprinting
  name: string;
  description: string;
  pattern: ((entry: LogEntry) => boolean) | RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: ('slack' | 'discord' | 'email' | 'sms')[];
  suppressionMinutes: number;
  enabled: boolean;
}

interface AlertMetrics {
  increment: (metric: string, labels?: Record<string, string>) => void;
}

export class LogAlertingService {
  private static instance: LogAlertingService | null = null;
  private metrics: AlertMetrics;
  private isEnabled: boolean;
  private degradedServiceAlerts = new Set<string>();

  private constructor() {
    this.isEnabled = process.env.LOG_ALERTS_ENABLED !== 'false';
    this.metrics = this.initializeMetrics();
  }

  static getInstance(): LogAlertingService {
    if (!LogAlertingService.instance) {
      LogAlertingService.instance = new LogAlertingService();
    }
    return LogAlertingService.instance;
  }

  /**
   * Fire-and-forget publishing (never blocks writes)
   * Expert: Fast feature flag check to skip require when disabled
   */
  publishLogForAlerts(entry: LogEntry): void {
    if (!this.isEnabled) {
      return;
    }

    process.nextTick(() => {
      try {
        // Expert: Avoid self-require - split queue into alertQueue.ts to prevent circulars
        const { getAlertQueue } = require('./alertQueue');
        const alertQueue = getAlertQueue();
        const fingerprint = this.createAlertFingerprint(entry);
        
        // Expert: BullMQ idempotency - set jobId=fingerprint for automatic deduplication
        const jobOptions = this.getJobOptions(entry, fingerprint);
        alertQueue.add('process-log-entry', entry, jobOptions);

        // Expert: Telemetry you'll want day-1
        this.metrics.increment('logs_alerts_enqueued_total');
      } catch (error) {
        // Expert: If Redis/worker down, single suppressed system log
        this.logDegradedService('alert_queue_failed', error as Error);
      }
    });
  }

  /**
   * Background processing via BullMQ worker
   */
  async processLogEntry(entry: LogEntry): Promise<void> {
    try {
      const { ALERT_RULES } = await import('../config/alertRules');
      
      for (const rule of ALERT_RULES) {
        if (!rule.enabled) continue;
        
        if (this.matchesRule(entry, rule)) {
          if (await this.shouldSuppress(rule, entry)) {
            this.metrics.increment('logs_alerts_suppressed_total', { rule: rule.key });
            continue;
          }
          
          await this.sendAlert(rule, entry);
          this.metrics.increment('logs_alerts_triggered_total', { 
            rule: rule.key, 
            severity: rule.severity 
          });
        }
      }
    } catch (error) {
      console.error('Error processing log entry for alerts:', error);
      // Don't throw - we don't want to retry malformed entries
    }
  }

  /**
   * Check if log entry matches alert rule pattern
   */
  private matchesRule(entry: LogEntry, rule: AlertRule): boolean {
    try {
      if (typeof rule.pattern === 'function') {
        return rule.pattern(entry);
      } else if (rule.pattern instanceof RegExp) {
        const messageText = entry.message || JSON.stringify(entry.metadata || {});
        return rule.pattern.test(messageText);
      }
      return false;
    } catch (error) {
      console.warn(`Error matching rule ${rule.key}:`, error);
      return false;
    }
  }

  /**
   * Expert-enhanced suppression with fingerprinting to avoid dynamic ID bypass
   */
  private async shouldSuppress(rule: AlertRule, entry: LogEntry): Promise<boolean> {
    try {
      // Expert pattern: Normalized fingerprint prevents dynamic IDs from defeating suppression
      const fingerprint = this.createAlertFingerprint(entry, rule);
      const key = `alert_suppress:${fingerprint}`;
      
      // Use Redis if available, otherwise use in-memory suppression
      const redis = await this.getRedisClient();
      
      if (redis) {
        const exists = await redis.exists(key);
        if (!exists) {
          await redis.setex(key, rule.suppressionMinutes * 60, '1');
          return false; // Don't suppress - first occurrence
        }
        return true; // Suppress - already alerted recently
      } else {
        // Fallback to in-memory suppression (less reliable across restarts)
        const inMemoryKey = `${rule.key}:${fingerprint}`;
        const now = Date.now();
        const lastAlert = this.inMemorySuppression.get(inMemoryKey);
        
        if (!lastAlert || (now - lastAlert) > (rule.suppressionMinutes * 60 * 1000)) {
          this.inMemorySuppression.set(inMemoryKey, now);
          return false; // Don't suppress
        }
        return true; // Suppress
      }
    } catch (error) {
      console.warn('Error checking alert suppression:', error);
      return false; // If we can't check suppression, allow the alert
    }
  }

  private inMemorySuppression = new Map<string, number>();

  /**
   * Expert-refined: More stable fingerprint with SHA1 and deployment correlation + safety
   */
  private createAlertFingerprint(entry: LogEntry, rule?: AlertRule): string {
    try {
      // Expert: Alert fingerprint safety - handle undefined message fields
      const messageText = entry.message ??
                         JSON.stringify({
                           event: entry.event,
                           metadata: entry.metadata ?? {}
                         }).slice(0, 300);

      const normalizedMessage = this.normalizeMessageForSuppression(messageText);
      const deploymentId = (entry.metadata as any)?.deploymentId || '';
      const ruleKey = rule?.key || 'unknown';

      // Expert pattern: Use SHA1 for better distribution, include deploymentId for correlation
      const components = `${ruleKey}|${entry.tier}|${entry.event || ''}|${deploymentId}|${normalizedMessage}`;
      return createHash('sha1').update(components).digest('hex');
    } catch (error) {
      console.warn('Error creating alert fingerprint:', error);
      return `fallback-${Date.now()}-${Math.random()}`;
    }
  }

  /**
   * Normalize message text for consistent suppression
   */
  private normalizeMessageForSuppression(message: string): string {
    try {
      return message
        .replace(/\b[0-9a-f]{8,}\b/gi, '[ID]') // Replace hex IDs (word boundaries)
        .replace(/\b\d{4,}\b/g, '[NUM]') // Replace large numbers (ports, timestamps) 
        .replace(/https?:\/\/[^\s]+/gi, '[URL]') // Replace URLs
        .replace(/Bearer\s+[^\s]+/gi, '[TOKEN]') // Replace tokens
        .substring(0, 100); // Consistent truncation
    } catch (error) {
      console.warn('Error normalizing message for suppression:', error);
      return message.substring(0, 100);
    }
  }

  /**
   * Send alert to configured channels
   */
  private async sendAlert(rule: AlertRule, entry: LogEntry): Promise<void> {
    const alertPayload = this.buildAlertPayload(rule, entry);
    
    for (const channel of rule.channels) {
      try {
        await this.sendToChannel(channel, alertPayload);
        this.metrics.increment('logs_alerts_sent_total', { 
          channel, 
          rule: rule.key 
        });
      } catch (error) {
        console.error(`Failed to send alert to ${channel}:`, error);
        this.metrics.increment('logs_alerts_failed_total', { 
          channel, 
          rule: rule.key 
        });
      }
    }
  }

  /**
   * Build alert payload with context
   */
  private buildAlertPayload(rule: AlertRule, entry: LogEntry) {
    return {
      rule: {
        key: rule.key,
        name: rule.name,
        severity: rule.severity
      },
      entry: {
        id: entry.id,
        tier: entry.tier,
        severity: entry.severity,
        event: entry.event,
        message: entry.message,
        timestamp: entry.timestamp,
        projectId: entry.projectId,
        userId: entry.userId
      },
      metadata: {
        deploymentId: (entry.metadata as any)?.deploymentId,
        correlationId: (entry.metadata as any)?.correlationId,
        environment: process.env.NODE_ENV || 'unknown'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(channel: string, payload: any): Promise<void> {
    const channelConfig = {
      slack: process.env.SLACK_ALERTS_ENABLED !== 'false',
      discord: process.env.DISCORD_ALERTS_ENABLED !== 'false',
      email: process.env.EMAIL_ALERTS_ENABLED !== 'false',
      sms: process.env.SMS_ALERTS_ENABLED === 'true' // Expert: opt-in for SMS
    };

    if (!channelConfig[channel as keyof typeof channelConfig]) {
      return; // Channel disabled
    }

    switch (channel) {
      case 'slack':
        await this.sendSlackAlert(payload);
        break;
      case 'discord':
        await this.sendDiscordAlert(payload);
        break;
      case 'email':
        await this.sendEmailAlert(payload);
        break;
      case 'sms':
        await this.sendSmsAlert(payload);
        break;
      default:
        console.warn(`Unknown alert channel: ${channel}`);
    }
  }

  private async sendSlackAlert(payload: any): Promise<void> {
    const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    const slackMessage = {
      text: `🚨 ${payload.rule.severity.toUpperCase()}: ${payload.rule.name}`,
      attachments: [{
        color: this.getSeverityColor(payload.rule.severity),
        fields: [
          { title: 'Tier', value: payload.entry.tier, short: true },
          { title: 'Event', value: payload.entry.event || 'N/A', short: true },
          { title: 'Project ID', value: payload.entry.projectId || 'N/A', short: true },
          { title: 'Deployment ID', value: payload.metadata.deploymentId || 'N/A', short: true },
          { title: 'Message', value: payload.entry.message?.substring(0, 500) || 'No message', short: false }
        ],
        footer: `SheenApps Logging | ${payload.metadata.environment}`,
        ts: Math.floor(new Date(payload.entry.timestamp).getTime() / 1000)
      }]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }
  }

  private async sendDiscordAlert(payload: any): Promise<void> {
    const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    const discordMessage = {
      content: `🚨 **${payload.rule.severity.toUpperCase()}**: ${payload.rule.name}`,
      embeds: [{
        title: payload.entry.event || 'System Alert',
        description: payload.entry.message?.substring(0, 500) || 'No message',
        color: this.getSeverityColorInt(payload.rule.severity),
        fields: [
          { name: 'Tier', value: payload.entry.tier, inline: true },
          { name: 'Project ID', value: payload.entry.projectId || 'N/A', inline: true },
          { name: 'Deployment ID', value: payload.metadata.deploymentId || 'N/A', inline: true }
        ],
        footer: {
          text: `SheenApps Logging | ${payload.metadata.environment}`
        },
        timestamp: payload.entry.timestamp
      }]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordMessage)
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status}`);
    }
  }

  private async sendEmailAlert(payload: any): Promise<void> {
    // TODO: Integrate with existing email service when available
    console.log('Email alert:', {
      subject: `🚨 ${payload.rule.severity.toUpperCase()}: ${payload.rule.name}`,
      rule: payload.rule.name,
      entry: `${payload.entry.tier}/${payload.entry.event}`,
      message: payload.entry.message?.substring(0, 100)
    });
  }

  private async sendSmsAlert(payload: any): Promise<void> {
    // SMS alerts only for critical issues
    if (payload.rule.severity !== 'critical') return;

    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_FROM_NUMBER;
      const toNumbers = (process.env.SMS_ALERT_NUMBERS || '').split(',').filter(n => n.trim());

      if (!twilioSid || !twilioToken || !fromNumber || toNumbers.length === 0) {
        return;
      }

      const message = `🚨 CRITICAL: ${payload.rule.name} - ${payload.entry.tier}/${payload.entry.event} in project ${payload.entry.projectId || 'unknown'}`;

      // Simple SMS via Twilio API
      for (const toNumber of toNumbers) {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            From: fromNumber,
            To: toNumber.trim(),
            Body: message.substring(0, 160) // SMS character limit
          })
        });

        if (!response.ok) {
          throw new Error(`Twilio SMS failed: ${response.status}`);
        }
      }
    } catch (error) {
      console.error('SMS alert failed:', error);
    }
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return '#ff9500';
      case 'low': return 'good';
      default: return '#36a64f';
    }
  }

  private getSeverityColorInt(severity: string): number {
    switch (severity) {
      case 'critical': return 0xff0000; // Red
      case 'high': return 0xff9500; // Orange
      case 'medium': return 0xffff00; // Yellow
      case 'low': return 0x00ff00; // Green
      default: return 0x36a64f; // Default green
    }
  }

  /**
   * Get Redis client if available
   */
  private async getRedisClient() {
    try {
      const Redis = require('ioredis');
      return new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    } catch (error) {
      return null; // Redis not available
    }
  }

  /**
   * Expert pattern: Single "degraded" alert, then suppress
   */
  private logDegradedService(service: string, error: Error): void {
    const key = `degraded_${service}`;
    if (this.degradedServiceAlerts.has(key)) {
      return; // Already logged
    }

    this.degradedServiceAlerts.add(key);
    
    // Log degraded service warning  
    unifiedLogger.system('error', 'warn', `Alert service degraded: ${service}`, {
      service,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'), // Truncated stack
      suppressedAt: new Date().toISOString()
    });

    // Remove from set after 5 minutes to allow periodic alerts
    setTimeout(() => {
      this.degradedServiceAlerts.delete(key);
    }, 5 * 60 * 1000);
  }

  /**
   * Get job options with priority-based scheduling
   */
  private getJobOptions(entry: LogEntry, fingerprint: string) {
    // Expert: Priority-based job scheduling
    const priority = this.getSeverityPriority(entry.severity);
    
    return {
      jobId: fingerprint, // Automatic deduplication
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      priority, // Higher priority for critical alerts
      // Expert: TTL based on severity
      ttl: this.getTTLForSeverity(entry.severity),
      // Expert: Retry delay based on severity - check alert rule severity instead
      delay: 0, // Process all alerts immediately
    };
  }

  /**
   * Get priority value for job scheduling (higher number = higher priority)
   */
  private getSeverityPriority(severity?: string): number {
    switch (severity) {
      case 'critical': return 100;
      case 'high': return 75;
      case 'medium': return 50;
      case 'low': return 25;
      default: return 10;
    }
  }

  /**
   * Get TTL (time to live) for job based on severity
   */
  private getTTLForSeverity(severity?: string): number {
    switch (severity) {
      case 'critical': return 600000; // 10 minutes for critical
      case 'high': return 1800000; // 30 minutes for high
      case 'medium': return 3600000; // 1 hour for medium
      case 'low': return 7200000; // 2 hours for low
      default: return 3600000; // 1 hour default
    }
  }

  /**
   * Initialize metrics (placeholder for actual metrics system)
   */
  private initializeMetrics(): AlertMetrics {
    return {
      increment: (metric: string, labels?: Record<string, string>) => {
        // Placeholder - integrate with your metrics system (Prometheus, DataDog, etc.)
        console.debug(`[METRICS] ${metric}`, labels);
      }
    };
  }
}

// Export singleton instance
export const logAlertingService = LogAlertingService.getInstance();