// Simple monitoring utility for tier usage tracking
// This provides basic metrics collection without complex infrastructure

interface TierUsageMetric {
  timestamp: Date
  tier: string
  provider: string
  requestType: string
  cost: number
  responseTime: number
  success: boolean
  endpoint?: string
}

class TierMonitor {
  private metrics: TierUsageMetric[] = []
  private readonly maxMetrics = 1000 // Keep last 1000 requests in memory

  recordUsage(metric: Omit<TierUsageMetric, 'timestamp'>) {
    const fullMetric: TierUsageMetric = {
      ...metric,
      timestamp: new Date()
    }

    this.metrics.push(fullMetric)

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }

    // Log important metrics
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Tier Usage:', {
        tier: metric.tier,
        provider: metric.provider,
        type: metric.requestType,
        cost: `$${metric.cost.toFixed(4)}`,
        time: `${metric.responseTime}ms`,
        success: metric.success
      })
    }
  }

  getMetrics(options: {
    hours?: number
    tier?: string
    provider?: string
    endpoint?: string
  } = {}): TierUsageMetric[] {
    let filtered = this.metrics

    // Filter by time
    if (options.hours) {
      const cutoff = new Date()
      cutoff.setHours(cutoff.getHours() - options.hours)
      filtered = filtered.filter(m => m.timestamp >= cutoff)
    }

    // Filter by tier
    if (options.tier) {
      filtered = filtered.filter(m => m.tier === options.tier)
    }

    // Filter by provider
    if (options.provider) {
      filtered = filtered.filter(m => m.provider === options.provider)
    }

    // Filter by endpoint
    if (options.endpoint) {
      filtered = filtered.filter(m => m.endpoint === options.endpoint)
    }

    return filtered
  }

  getAnalytics(hours: number = 24) {
    const metrics = this.getMetrics({ hours })
    
    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        totalCost: 0,
        averageResponseTime: 0,
        successRate: 0,
        tierDistribution: {},
        providerDistribution: {},
        costByTier: {}
      }
    }

    const totalRequests = metrics.length
    const totalCost = metrics.reduce((sum, m) => sum + m.cost, 0)
    const averageResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests
    const successfulRequests = metrics.filter(m => m.success).length
    const successRate = successfulRequests / totalRequests

    // Tier distribution
    const tierDistribution = metrics.reduce((acc, m) => {
      acc[m.tier] = (acc[m.tier] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Provider distribution
    const providerDistribution = metrics.reduce((acc, m) => {
      acc[m.provider] = (acc[m.provider] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Cost by tier
    const costByTier = metrics.reduce((acc, m) => {
      acc[m.tier] = (acc[m.tier] || 0) + m.cost
      return acc
    }, {} as Record<string, number>)

    return {
      totalRequests,
      totalCost,
      averageResponseTime,
      successRate,
      tierDistribution,
      providerDistribution,
      costByTier,
      period: `${hours} hours`,
      lastUpdated: new Date().toISOString()
    }
  }

  // Get cost savings compared to always using premium tier
  getCostSavings(hours: number = 24) {
    const metrics = this.getMetrics({ hours })
    const actualCost = metrics.reduce((sum, m) => sum + m.cost, 0)
    
    // Estimate what it would cost if everything used premium tier
    const premiumCost = metrics.length * 0.08 // Assume $0.08 per request for premium
    
    const savings = premiumCost - actualCost
    const savingsPercentage = premiumCost > 0 ? (savings / premiumCost) * 100 : 0

    return {
      actualCost,
      premiumCost,
      savings,
      savingsPercentage,
      period: `${hours} hours`
    }
  }

  // Clear all metrics (useful for testing)
  clear() {
    this.metrics = []
  }

  // Export metrics for external analysis
  exportMetrics(format: 'json' | 'csv' = 'json') {
    if (format === 'csv') {
      const headers = ['timestamp', 'tier', 'provider', 'requestType', 'cost', 'responseTime', 'success', 'endpoint']
      const rows = this.metrics.map(m => [
        m.timestamp.toISOString(),
        m.tier,
        m.provider,
        m.requestType,
        m.cost.toString(),
        m.responseTime.toString(),
        m.success.toString(),
        m.endpoint || ''
      ])
      
      return [headers, ...rows].map(row => row.join(',')).join('\n')
    }

    return JSON.stringify(this.metrics, null, 2)
  }
}

// Singleton instance
export const tierMonitor = new TierMonitor()

// Helper function to wrap API responses with monitoring
export function withTierMonitoring<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    tier?: string
    provider?: string
    requestType: string
    endpoint?: string
  }
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now()
    let success = false
    let cost = 0

    try {
      const result = await fn(...args)
      success = result?.success !== false
      cost = result?.metadata?.cost || 0
      
      return result
    } catch (error) {
      throw error
    } finally {
      const responseTime = Date.now() - startTime
      
      tierMonitor.recordUsage({
        tier: options.tier || 'unknown',
        provider: options.provider || 'unknown',
        requestType: options.requestType,
        cost,
        responseTime,
        success,
        endpoint: options.endpoint
      })
    }
  }) as T
}

export default tierMonitor