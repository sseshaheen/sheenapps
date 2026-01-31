/**
 * DEPRECATED: Payment Metrics Service Stub
 * 
 * This service has been replaced by worker-based payment processing.
 * Metrics should now be retrieved from the worker service via appropriate API calls.
 * 
 * This stub exists to prevent build errors during migration.
 * TODO: Update admin routes to use worker APIs and remove this stub.
 */

export class MetricsService {
  async getFailedPayments(limit: number = 50, offset: number = 0) {
    // Return empty array - this functionality moved to worker
    return []
  }

  async getRevenueMetrics(period: string = 'month') {
    // Return default metrics - this functionality moved to worker
    return {
      total: 0,
      period,
      breakdown: []
    }
  }

  async getUsageMetrics(limit: number = 50, offset: number = 0) {
    // Return empty metrics - this functionality moved to worker
    return []
  }

  async getWebhookEvents(limit: number = 50, offset: number = 0) {
    // Return empty array - this functionality moved to worker
    return []
  }

  async calculateMRR(date: Date) {
    // Return zero MRR - this functionality moved to worker
    return {
      current: 0,
      previous: 0,
      growth: 0,
      breakdown: []
    }
  }

  async calculateLTV() {
    // Return zero LTV - this functionality moved to worker
    return {
      average: 0,
      median: 0,
      breakdown: []
    }
  }

  async calculatePaymentMetrics(startDate: Date, endDate: Date) {
    // Return empty payment metrics - this functionality moved to worker
    return {
      total: 0,
      successful: 0,
      failed: 0,
      volume: 0,
      breakdown: []
    }
  }

  async calculateUsageMetrics(startDate: Date, endDate: Date) {
    // Return empty usage metrics - this functionality moved to worker
    return {
      totalUsers: 0,
      activeUsers: 0,
      projectsCreated: 0,
      aiGenerations: 0,
      breakdown: []
    }
  }
}