import { NextRequest } from 'next/server'
import { QuotaLogger } from './quota-logger'
import { createServerSupabaseClientNew } from '@/lib/supabase'
import { logger } from '@/utils/logger'

/**
 * Service to detect quota bypass attempts
 * Monitors for direct API calls that should go through quota middleware
 */
export class QuotaBypassDetector {
  // Endpoints that require quota checking
  private static readonly QUOTA_PROTECTED_ENDPOINTS = [
    '/api/ai/chat',
    '/api/ai/generate',
    '/api/ai/content',
    '/api/ai/analyze',
    '/api/ai/modify-section',
    '/api/ai/components',
    '/api/projects',
    '/api/export'
  ]

  // Patterns that indicate AI usage
  private static readonly AI_USAGE_PATTERNS = [
    'generate',
    'analyze',
    'content',
    'ai',
    'gpt',
    'openai',
    'completion'
  ]

  /**
   * Check if request might be bypassing quota checks
   */
  static async checkForBypass(
    request: NextRequest,
    endpoint: string,
    hasQuotaContext: boolean = false
  ): Promise<boolean> {
    // If quota context exists, it went through proper channels
    if (hasQuotaContext) {
      return false
    }

    // Check if this is a protected endpoint
    const isProtected = this.QUOTA_PROTECTED_ENDPOINTS.some(
      protectedPath => endpoint.includes(protectedPath)
    )

    if (!isProtected) {
      return false
    }

    // Additional checks for AI endpoints
    const method = request.method
    if (method !== 'POST') {
      return false // Only POST requests consume quota
    }

    try {
      // Get user from auth
      const supabase = await createServerSupabaseClientNew()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return false // No user, no bypass
      }

      // Check request body for AI-related patterns
      const contentType = request.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        // Log potential bypass attempt
        await QuotaLogger.logBypassAttempt(
          user.id,
          endpoint,
          method,
          {
            headers: {
              'user-agent': request.headers.get('user-agent'),
              'referer': request.headers.get('referer'),
              'x-forwarded-for': request.headers.get('x-forwarded-for')
            },
            timestamp: new Date().toISOString()
          }
        )

        logger.warn('Potential quota bypass detected', {
          userId: user.id.slice(0, 8),
          endpoint,
          method
        })

        return true
      }
    } catch (error) {
      logger.error('Error in bypass detection', error)
    }

    return false
  }

  /**
   * Analyze historical data for bypass patterns
   */
  static async analyzeBypassPatterns(userId?: string): Promise<{
    totalBypassAttempts: number
    bypasserUserIds: string[]
    commonEndpoints: Record<string, number>
    timeDistribution: Record<string, number>
  }> {
    const supabase = await createServerSupabaseClientNew()
    
    // Query bypass attempts from audit logs
    let query = supabase
      .from('quota_audit_logs')
      .select('user_id, metadata, created_at')
      .eq('event_type', 'BYPASS_ATTEMPT')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: bypassLogs, error } = await query

    if (error || !bypassLogs) {
      logger.error('Failed to fetch bypass logs', error)
      return {
        totalBypassAttempts: 0,
        bypasserUserIds: [],
        commonEndpoints: {},
        timeDistribution: {}
      }
    }

    // Analyze patterns
    const bypasserUserIds = [...new Set(bypassLogs.map(log => log.user_id))]
    const commonEndpoints: Record<string, number> = {}
    const timeDistribution: Record<string, number> = {}

    bypassLogs.forEach(log => {
      // Count endpoints
      const metadata = log.metadata as any
      const endpoint = metadata?.endpoint
      if (endpoint) {
        commonEndpoints[endpoint] = (commonEndpoints[endpoint] || 0) + 1
      }

      // Time distribution (by hour)
      const hour = new Date(log.created_at).getHours()
      const hourKey = `${hour}:00`
      timeDistribution[hourKey] = (timeDistribution[hourKey] || 0) + 1
    })

    return {
      totalBypassAttempts: bypassLogs.length,
      bypasserUserIds,
      commonEndpoints,
      timeDistribution
    }
  }

  /**
   * Get users who frequently attempt to bypass quotas
   */
  static async getFrequentBypassers(threshold: number = 5): Promise<{
    userId: string
    attemptCount: number
    lastAttempt: string
    endpoints: string[]
  }[]> {
    const supabase = await createServerSupabaseClientNew()
    
    const { data: bypassers, error } = await supabase
      .from('quota_audit_logs')
      .select('user_id, metadata, created_at')
      .eq('event_type', 'BYPASS_ATTEMPT')
      .order('created_at', { ascending: false })

    if (error || !bypassers) {
      logger.error('Failed to fetch bypass data', error)
      return []
    }

    // Group by user
    const userAttempts = new Map<string, {
      count: number
      lastAttempt: string
      endpoints: Set<string>
    }>()

    bypassers.forEach(log => {
      const existing = userAttempts.get(log.user_id) || {
        count: 0,
        lastAttempt: log.created_at,
        endpoints: new Set()
      }

      existing.count++
      const metadata = log.metadata as any
      if (metadata?.endpoint) {
        existing.endpoints.add(metadata.endpoint)
      }

      userAttempts.set(log.user_id, existing)
    })

    // Filter by threshold and format
    return Array.from(userAttempts.entries())
      .filter(([_, data]) => data.count >= threshold)
      .map(([userId, data]) => ({
        userId,
        attemptCount: data.count,
        lastAttempt: data.lastAttempt,
        endpoints: Array.from(data.endpoints)
      }))
      .sort((a, b) => b.attemptCount - a.attemptCount)
  }
}

// Default export alias
export default QuotaBypassDetector
export { QuotaBypassDetector as BypassDetector }