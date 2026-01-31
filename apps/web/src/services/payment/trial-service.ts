/**
 * DEPRECATED: Trial Service Stub
 * 
 * This service has been replaced by worker-based payment processing.
 * Trial management should now be handled via worker APIs.
 * 
 * This stub exists to prevent build errors during migration.
 * TODO: Update trial routes to use worker APIs and remove this stub.
 */

export class TrialService {
  async checkEligibility(userId: string) {
    // Return not eligible - this functionality moved to worker
    return {
      eligible: false,
      reason: 'Service migrated to worker'
    }
  }

  async checkTrialEligibility(userId: string) {
    // Return not eligible with extended structure - this functionality moved to worker
    return {
      eligible: false,
      isEligible: false,
      hasUsedTrial: true,
      currentTrialEnd: null,
      daysRemaining: 0,
      reason: 'Service migrated to worker'
    }
  }

  async startTrial(userId: string, planName?: string, customerId?: string) {
    // Return failure - this functionality moved to worker
    return {
      success: false,
      error: 'Service migrated to worker',
      trialEnd: null,
      subscriptionId: null
    }
  }

  async extendTrial(userId: string, days: number, reason?: string) {
    // Return failure - this functionality moved to worker
    return {
      success: false,
      error: 'Service migrated to worker'
    }
  }

  async getTrialAnalytics(startDate?: Date, endDate?: Date) {
    // Return empty analytics - this functionality moved to worker
    return {
      totalTrials: 0,
      activeTrials: 0,
      conversionRate: 0,
      breakdown: []
    }
  }

  async getTrialsEndingSoon(days: number) {
    // Return empty array - this functionality moved to worker
    return []
  }

  async cancelExpiredTrials() {
    // Return zero cancellations - this functionality moved to worker
    return 0
  }
}