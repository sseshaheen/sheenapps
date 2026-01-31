import { QuotaMonitoring } from './monitoring-queries'
import { QuotaLogger } from './quota-logger'
import { BypassDetector } from './bypass-detector'
import { logger } from '@/utils/logger'

export interface AlertRule {
  name: string
  description: string
  checkInterval: number // in milliseconds
  enabled: boolean
  check: () => Promise<boolean>
  action: (details: any) => Promise<void>
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export class QuotaAlertRules {
  private rules = new Map<string, AlertRule>()
  private intervals = new Map<string, NodeJS.Timeout>()
  
  constructor() {
    this.initializeDefaultRules()
  }
  
  private initializeDefaultRules() {
    // High denial rate rule
    this.addRule({
      name: 'HighDenialRate',
      description: 'Triggers when denial rate exceeds threshold',
      checkInterval: 60000, // Check every minute
      enabled: true,
      severity: 'high',
      check: async () => {
        const denials = await QuotaMonitoring.getRecentDenials(1)
        return denials.length > 100 // More than 100 denials per hour
      },
      action: async (details) => {
        await this.notifyOpsTeam('High denial rate detected', details)
      }
    })
    
    // Suspicious user activity
    this.addRule({
      name: 'SuspiciousUserActivity',
      description: 'Detects users with suspicious patterns',
      checkInterval: 300000, // Check every 5 minutes
      enabled: true,
      severity: 'critical',
      check: async () => {
        const frequentBypassers = await BypassDetector.getFrequentBypassers(3)
        return frequentBypassers.length > 0
      },
      action: async (details) => {
        const bypassers = await BypassDetector.getFrequentBypassers(3)
        for (const user of bypassers) {
          await this.flagUserForReview(user.userId, 'Frequent bypass attempts', user)
        }
      }
    })
    
    // Usage spike detection
    this.addRule({
      name: 'GlobalUsageSpike',
      description: 'Detects system-wide usage spikes',
      checkInterval: 300000, // Check every 5 minutes
      enabled: true,
      severity: 'medium',
      check: async () => {
        const metrics = await QuotaMonitoring.getQuotaMetrics('1 hour')
        const previousMetrics = await QuotaMonitoring.getQuotaMetrics('2 hours')
        
        // Compare request rates
        const currentRate = metrics.totalRequests
        const previousRate = previousMetrics.totalRequests - metrics.totalRequests
        
        return currentRate > previousRate * 2 // 2x spike
      },
      action: async (details) => {
        const metrics = await QuotaMonitoring.getQuotaMetrics('1 hour')
        await this.notifyOpsTeam('Global usage spike detected', {
          currentRequests: metrics.totalRequests,
          denialRate: metrics.denialRate,
          topMetrics: metrics.topMetrics
        })
      }
    })
    
    // Quota bypass attempts
    this.addRule({
      name: 'QuotaBypassAttempts',
      description: 'Monitors for quota bypass attempts',
      checkInterval: 120000, // Check every 2 minutes
      enabled: true,
      severity: 'critical',
      check: async () => {
        const patterns = await BypassDetector.analyzeBypassPatterns()
        return patterns.totalBypassAttempts > 10 // More than 10 attempts
      },
      action: async (details) => {
        const patterns = await BypassDetector.analyzeBypassPatterns()
        await this.immediateAlert('Quota bypass attempts detected', {
          totalAttempts: patterns.totalBypassAttempts,
          uniqueUsers: patterns.bypasserUserIds.length,
          commonEndpoints: patterns.commonEndpoints
        })
      }
    })
    
    // Near limit users
    this.addRule({
      name: 'UsersNearLimit',
      description: 'Alerts when many users approach limits',
      checkInterval: 600000, // Check every 10 minutes
      enabled: true,
      severity: 'low',
      check: async () => {
        const nearLimitUsers = await QuotaMonitoring.getUsersNearLimit(90)
        return nearLimitUsers.length > 50 // More than 50 users at 90%
      },
      action: async (details) => {
        const users = await QuotaMonitoring.getUsersNearLimit(90)
        await this.notifyOpsTeam('Many users approaching quota limits', {
          userCount: users.length,
          metrics: this.summarizeMetrics(users)
        })
      }
    })
    
    // Concurrent attempt patterns
    this.addRule({
      name: 'ConcurrentAttemptPattern',
      description: 'Detects patterns of concurrent attempts',
      checkInterval: 180000, // Check every 3 minutes
      enabled: true,
      severity: 'high',
      check: async () => {
        // This would need to aggregate concurrent attempts across users
        // For now, simplified check
        const metrics = await QuotaMonitoring.getQuotaMetrics('1 hour')
        return metrics.totalRequests > 10000 && metrics.denialRate > 20
      },
      action: async (details) => {
        await this.immediateAlert('Concurrent attempt pattern detected', details)
      }
    })
  }
  
  private addRule(rule: AlertRule) {
    this.rules.set(rule.name, rule)
  }
  
  startMonitoring() {
    this.rules.forEach((rule, name) => {
      if (rule.enabled) {
        this.startRule(name)
      }
    })
    logger.info('Alert rules monitoring started', {
      activeRules: Array.from(this.rules.entries())
        .filter(([_, rule]) => rule.enabled)
        .map(([name]) => name)
    })
  }
  
  stopMonitoring() {
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals.clear()
    logger.info('Alert rules monitoring stopped')
  }
  
  private startRule(ruleName: string) {
    const rule = this.rules.get(ruleName)
    if (!rule) return
    
    // Run immediately
    this.checkRule(ruleName)
    
    // Then run on interval
    const interval = setInterval(() => {
      this.checkRule(ruleName)
    }, rule.checkInterval)
    
    this.intervals.set(ruleName, interval)
  }
  
  private async checkRule(ruleName: string) {
    const rule = this.rules.get(ruleName)
    if (!rule || !rule.enabled) return
    
    try {
      const triggered = await rule.check()
      
      if (triggered) {
        logger.warn(`Alert rule triggered: ${ruleName}`)
        await rule.action({ ruleName, timestamp: new Date().toISOString() })
        
        // Log to audit
        await QuotaLogger.logAlert('ALERT_TRIGGERED', 'system', ruleName, {
          severity: rule.severity,
          description: rule.description
        })
      }
    } catch (error) {
      logger.error(`Error checking alert rule ${ruleName}`, error)
    }
  }
  
  // Alert action implementations
  private async notifyOpsTeam(message: string, details: any) {
    logger.warn(`OPS ALERT: ${message}`, details)
    // Would integrate with PagerDuty, OpsGenie, etc.
  }
  
  private async immediateAlert(message: string, details: any) {
    logger.error(`IMMEDIATE ALERT: ${message}`, details)
    // Would trigger immediate notifications
  }
  
  private async flagUserForReview(userId: string, reason: string, details: any) {
    logger.warn(`User flagged for review: ${userId}`, { reason, details })
    // Would update user status or create review task
  }
  
  private summarizeMetrics(users: any[]): Record<string, number> {
    const summary: Record<string, number> = {}
    users.forEach(user => {
      summary[user.metric] = (summary[user.metric] || 0) + 1
    })
    return summary
  }
  
  // Public methods for rule management
  enableRule(ruleName: string) {
    const rule = this.rules.get(ruleName)
    if (rule) {
      rule.enabled = true
      this.startRule(ruleName)
    }
  }
  
  disableRule(ruleName: string) {
    const rule = this.rules.get(ruleName)
    if (rule) {
      rule.enabled = false
      const interval = this.intervals.get(ruleName)
      if (interval) {
        clearInterval(interval)
        this.intervals.delete(ruleName)
      }
    }
  }
  
  getRuleStatus(): Array<{
    name: string
    enabled: boolean
    description: string
    severity: string
    checkInterval: number
  }> {
    return Array.from(this.rules.entries()).map(([name, rule]) => ({
      name,
      enabled: rule.enabled,
      description: rule.description,
      severity: rule.severity,
      checkInterval: rule.checkInterval
    }))
  }
  
  updateRuleInterval(ruleName: string, newInterval: number) {
    const rule = this.rules.get(ruleName)
    if (rule) {
      rule.checkInterval = newInterval
      
      // Restart if running
      if (this.intervals.has(ruleName)) {
        this.disableRule(ruleName)
        this.enableRule(ruleName)
      }
    }
  }
}

// Singleton instance
let alertRulesEngine: QuotaAlertRules | null = null

export function getAlertRulesEngine(): QuotaAlertRules {
  if (!alertRulesEngine) {
    alertRulesEngine = new QuotaAlertRules()
  }
  return alertRulesEngine
}

export function startAlertRules() {
  const engine = getAlertRulesEngine()
  engine.startMonitoring()
  return engine
}

export function stopAlertRules() {
  if (alertRulesEngine) {
    alertRulesEngine.stopMonitoring()
  }
}