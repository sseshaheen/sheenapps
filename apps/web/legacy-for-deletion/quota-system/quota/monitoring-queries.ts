import { createServerSupabaseClientNew } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export interface UserQuotaStatus {
  metric: string
  planLimit: number
  currentUsage: number
  remaining: number
  usagePercent: number
  bonusAvailable: number
  lastReset: string
  nextReset: string
}

export interface QuotaDenial {
  userId: string
  metric: string
  attemptedAmount: number
  reason: string
  context: any
  createdAt: string
}

export interface ConcurrentAttempt {
  userId: string
  metric: string
  attempts: Array<{
    id: string
    createdAt: string
  }>
  timeWindow: number
}

export class QuotaMonitoring {
  /**
   * Get users approaching their quota limits
   */
  static async getUsersNearLimit(thresholdPercent = 80): Promise<{
    userId: string
    email: string
    metric: string
    usagePercent: number
    remaining: number
    planName: string
  }[]> {
    const supabase = await createServerSupabaseClientNew()
    
    const { data, error } = await supabase.rpc('get_users_near_quota_limit', {
      p_threshold_percentage: thresholdPercent
    })

    if (error) {
      logger.error('Failed to get users near limit', error)
      return []
    }

    return data || []
  }

  /**
   * Get recent quota denials
   */
  static async getRecentDenials(hours = 24): Promise<QuotaDenial[]> {
    const supabase = await createServerSupabaseClientNew()
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    
    const { data, error } = await supabase
      .from('quota_audit_log')
      .select('*')
      .eq('success', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      logger.error('Failed to get recent denials', error)
      return []
    }

    return (data || []).map(row => ({
      userId: row.user_id,
      metric: row.metric,
      attemptedAmount: row.attempted_amount,
      reason: row.reason,
      context: row.context,
      createdAt: row.created_at
    }))
  }

  /**
   * Detect concurrent usage attempts
   */
  static async detectConcurrentAttempts(
    userId: string, 
    timeWindowMs = 5000
  ): Promise<ConcurrentAttempt[]> {
    const supabase = await createServerSupabaseClientNew()
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString() // Last hour
    
    const { data, error } = await supabase
      .from('usage_events')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    if (error || !data) {
      logger.error('Failed to detect concurrent attempts', error)
      return []
    }

    // Group by metric and find concurrent attempts
    const concurrentByMetric = new Map<string, ConcurrentAttempt>()
    
    data.forEach((event, index) => {
      const eventTime = new Date(event.created_at).getTime()
      
      // Look for events within the time window
      const concurrent = data
        .slice(index + 1)
        .filter(other => {
          const otherTime = new Date(other.created_at).getTime()
          return other.metric === event.metric && 
                 Math.abs(eventTime - otherTime) < timeWindowMs
        })

      if (concurrent.length > 0) {
        const existing = concurrentByMetric.get(event.metric) || {
          userId,
          metric: event.metric,
          attempts: [],
          timeWindow: timeWindowMs
        }

        existing.attempts.push({
          id: event.id,
          createdAt: event.created_at
        })

        concurrent.forEach(c => {
          if (!existing.attempts.find(a => a.id === c.id)) {
            existing.attempts.push({
              id: c.id,
              createdAt: c.created_at
            })
          }
        })

        concurrentByMetric.set(event.metric, existing)
      }
    })

    return Array.from(concurrentByMetric.values())
  }

  /**
   * Get user's current quota status for all metrics
   */
  static async getUserQuotaStatus(userId: string): Promise<UserQuotaStatus[]> {
    const supabase = await createServerSupabaseClientNew()
    
    const { data, error } = await supabase.rpc('get_user_quota_status', {
      p_user_id: userId
    })

    if (error) {
      logger.error('Failed to get user quota status', error)
      return []
    }

    return (data || []).map(row => ({
      metric: row.metric,
      planLimit: row.plan_limit,
      currentUsage: row.current_usage,
      remaining: row.remaining,
      usagePercent: row.usage_percent,
      bonusAvailable: row.bonus_available,
      lastReset: row.last_reset,
      nextReset: row.next_reset
    }))
  }

  /**
   * Get aggregated quota metrics for monitoring
   */
  static async getQuotaMetrics(timeRange = '24 hours'): Promise<{
    totalRequests: number
    totalDenials: number
    denialRate: number
    topDeniedUsers: Array<{ userId: string; denialCount: number }>
    topMetrics: Array<{ metric: string; requestCount: number }>
    hourlyDistribution: Array<{ hour: number; requests: number; denials: number }>
  }> {
    const supabase = await createServerSupabaseClientNew()
    const since = new Date()
    
    // Parse time range
    const [amount, unit] = timeRange.split(' ')
    const hours = unit.includes('hour') ? parseInt(amount) : 
                  unit.includes('day') ? parseInt(amount) * 24 : 24
    since.setHours(since.getHours() - hours)

    // Get all quota events
    const { data: events, error } = await supabase
      .from('quota_audit_log')
      .select('*')
      .gte('created_at', since.toISOString())

    if (error || !events) {
      logger.error('Failed to get quota metrics', error)
      return {
        totalRequests: 0,
        totalDenials: 0,
        denialRate: 0,
        topDeniedUsers: [],
        topMetrics: [],
        hourlyDistribution: []
      }
    }

    // Calculate metrics
    const totalRequests = events.length
    const totalDenials = events.filter(e => !e.success).length
    const denialRate = totalRequests > 0 ? (totalDenials / totalRequests) * 100 : 0

    // Top denied users
    const denialsByUser = new Map<string, number>()
    events
      .filter(e => !e.success)
      .forEach(e => {
        denialsByUser.set(e.user_id, (denialsByUser.get(e.user_id) || 0) + 1)
      })
    
    const topDeniedUsers = Array.from(denialsByUser.entries())
      .map(([userId, denialCount]) => ({ userId, denialCount }))
      .sort((a, b) => b.denialCount - a.denialCount)
      .slice(0, 10)

    // Top metrics
    const requestsByMetric = new Map<string, number>()
    events.forEach(e => {
      requestsByMetric.set(e.metric, (requestsByMetric.get(e.metric) || 0) + 1)
    })
    
    const topMetrics = Array.from(requestsByMetric.entries())
      .map(([metric, requestCount]) => ({ metric, requestCount }))
      .sort((a, b) => b.requestCount - a.requestCount)

    // Hourly distribution
    const hourlyData = new Map<number, { requests: number; denials: number }>()
    events.forEach(e => {
      const hour = new Date(e.created_at).getHours()
      const existing = hourlyData.get(hour) || { requests: 0, denials: 0 }
      existing.requests++
      if (!e.success) existing.denials++
      hourlyData.set(hour, existing)
    })

    const hourlyDistribution = Array.from(hourlyData.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => a.hour - b.hour)

    return {
      totalRequests,
      totalDenials,
      denialRate,
      topDeniedUsers,
      topMetrics,
      hourlyDistribution
    }
  }

  /**
   * Check if user has suspicious activity patterns
   */
  static async checkUserSuspiciousActivity(userId: string): Promise<{
    isSuspicious: boolean
    reasons: string[]
    riskScore: number
    details: any
  }> {
    const reasons: string[] = []
    let riskScore = 0
    const details: any = {}

    // Check for high denial rate
    const denials = await this.getRecentDenials(24)
    const userDenials = denials.filter(d => d.userId === userId)
    if (userDenials.length > 10) {
      reasons.push(`High denial rate: ${userDenials.length} denials in 24h`)
      riskScore += 30
      details.denialCount = userDenials.length
    }

    // Check for concurrent attempts
    const concurrent = await this.detectConcurrentAttempts(userId, 1000)
    if (concurrent.length > 0) {
      reasons.push(`Concurrent attempts detected: ${concurrent.length} instances`)
      riskScore += 40
      details.concurrentAttempts = concurrent
    }

    // Check for bypass attempts
    const supabase = await createServerSupabaseClientNew()
    const { data: bypassAttempts } = await supabase
      .from('quota_audit_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('event_type', 'BYPASS_ATTEMPT')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (bypassAttempts && bypassAttempts.length > 0) {
      reasons.push(`Bypass attempts: ${bypassAttempts.length}`)
      riskScore += 50
      details.bypassAttempts = bypassAttempts.length
    }

    // Check for spike in usage
    const { data: spikes } = await supabase
      .from('quota_audit_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('event_type', 'SPIKE_DETECTED')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (spikes && spikes.length > 0) {
      reasons.push(`Usage spikes: ${spikes.length} in last 7 days`)
      riskScore += 20
      details.spikes = spikes.length
    }

    return {
      isSuspicious: riskScore >= 50,
      reasons,
      riskScore: Math.min(100, riskScore),
      details
    }
  }
}