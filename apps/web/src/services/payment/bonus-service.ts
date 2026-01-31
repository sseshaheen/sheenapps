/**
 * DEPRECATED: Bonus Service Stub
 * 
 * This service has been replaced by worker-based payment processing.
 * Bonus management should now be handled via worker APIs.
 * 
 * This stub exists to prevent build errors during migration.
 * TODO: Update bonus routes to use worker APIs and remove this stub.
 */

export class BonusService {
  async checkQuota(userId: string) {
    // Return basic quota info - this functionality moved to worker
    return {
      hasQuota: true,
      remaining: 0,
      total: 0
    }
  }

  async trackUsage(userId: string, amount: number) {
    // Return success - this functionality moved to worker
    return {
      success: true,
      remaining: 0
    }
  }

  async sendBonusNotifications() {
    // Return empty results - this functionality moved to worker
    return {
      sent: 0,
      failed: 0
    }
  }

  async getRemainingUsage(userId: string, metric: string) {
    // Return empty bonus - this functionality moved to worker
    return {
      bonus: 0,
      total: 0,
      remaining: 0
    }
  }

  async consumeBonus(userId: string, metric: string, amount: number) {
    // Return success - this functionality moved to worker
    return {
      success: true,
      consumed: amount,
      remaining: 0
    }
  }

  async getExpiringBonuses(daysUntilExpiry: number) {
    // Return empty array - this functionality moved to worker
    return []
  }

  async markBonusesAsNotified(userId: string, metric: string) {
    // Return success - this functionality moved to worker
    return {
      success: true,
      marked: 0
    }
  }

  async archiveExpiredBonuses() {
    // Return success - this functionality moved to worker
    return {
      success: true,
      archived: 0
    }
  }

  async grantBonusUsage(params: { userId: string; metric: string; amount: number; reason?: string; expiresAt?: Date; expiresInDays?: number }) {
    // Return success - this functionality moved to worker
    return {
      success: true,
      bonusId: 'stub-bonus-id',
      granted: params.amount
    }
  }
}