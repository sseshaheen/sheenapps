/**
 * AI Time Billing Service
 * Manages AI time balance checking, consumption tracking, and pre-build validation
 *
 * SERVER-ONLY MODULE - Do not import in client components
 */

import type {
  BalanceResponse,
  OperationType,
  ProjectSize,
  SufficientCheckRequest,
  SufficientCheckResponse
} from '@/types/worker-api';
import { getCurrentUserId } from '@/utils/auth';
import { logger } from '@/utils/logger';
import 'server-only';
import { getWorkerClient } from './worker-api-client';

export class AITimeBillingService {
  /**
   * Get current AI time balance for a user
   */
  static async getBalance(userId?: string): Promise<BalanceResponse> {
    const effectiveUserId = userId || await getCurrentUserId();

    // Check if Worker API is enabled in development
    // if (process.env.NEXT_PUBLIC_WORKER_API_ENABLED === 'false') {
    //   logger.info(`🔧 Worker API disabled in development - returning mock balance`);
    //   return {
    //     version: "2025-09-01",
    //     plan_key: "free",
    //     subscription_status: "inactive",
    //     totals: {
    //       total_seconds: 3600, // 1 hour in development
    //       paid_seconds: 0,
    //       bonus_seconds: 3600,
    //       next_expiry_at: null
    //     },
    //     buckets: {
    //       daily: [{ seconds: 3600, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }],
    //       paid: []
    //     },
    //     bonus: {
    //       daily_minutes: 60,
    //       used_this_month_minutes: 0,
    //       monthly_cap_minutes: 300
    //     },
    //     catalog_version: "2025-09-01"
    //   };
    // }

    logger.info(`📊 Fetching AI time balance for user: ${effectiveUserId}`);

    try {
      const response = await getWorkerClient().get<BalanceResponse>(
        `/v1/billing/balance/${effectiveUserId}`
      );

      logger.info(`✅ Balance retrieved for user ${effectiveUserId}:`, {
        totalSeconds: response.totals.total_seconds,
        paidSeconds: response.totals.paid_seconds,
        bonusSeconds: response.totals.bonus_seconds,
        planKey: response.plan_key,
        subscriptionStatus: response.subscription_status
      });

      return response;
    } catch (error) {
      logger.error(`❌ Failed to fetch balance for user ${effectiveUserId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has sufficient AI time for an operation
   */
  static async checkSufficient(
    operationType: OperationType,
    projectSize?: ProjectSize,
    userId?: string
  ): Promise<SufficientCheckResponse> {
    // Check if Worker API is enabled in development
    // if (process.env.NEXT_PUBLIC_WORKER_API_ENABLED === 'false') {
    //   logger.info(`🔧 Worker API disabled in development - returning mock sufficient balance`);
    //   return {
    //     sufficient: true,
    //     estimate: {
    //       estimatedSeconds: 30,
    //       estimatedMinutes: 1,
    //       confidence: 'high' as const,
    //       basedOnSamples: 100
    //     },
    //     balance: {
    //       total_seconds: 3600, // 1 hour in development
    //       paid_seconds: 0,
    //       bonus_seconds: 3600
    //     }
    //   };
    // }

    const effectiveUserId = userId || await getCurrentUserId();

    const request: SufficientCheckRequest = {
      userId: effectiveUserId,
      operationType,
      projectSize
    };

    logger.info(`🔍 Checking sufficient balance for user ${effectiveUserId}:`, {
      operationType,
      projectSize
    });

    try {
      const response = await getWorkerClient().post<SufficientCheckResponse>(
        '/v1/billing/check-sufficient',
        request
      );

      logger.info(`✅ Sufficient check result for user ${effectiveUserId}:`, {
        sufficient: response.sufficient,
        estimatedMinutes: response.estimate?.estimatedMinutes,
        recommendation: response.recommendation?.suggestedPackage
      });

      return response;
    } catch (error) {
      logger.error(`❌ Failed to check sufficient balance for user ${effectiveUserId}:`, error);
      throw error;
    }
  }

  /**
   * Get balance with cached result for UI display (5-minute cache)
   */
  private static balanceCache = new Map<string, { data: BalanceResponse; expiresAt: number }>();

  static async getCachedBalance(userId?: string): Promise<BalanceResponse> {
    const effectiveUserId = userId || await getCurrentUserId();
    const cacheKey = `balance-${effectiveUserId}`;
    const now = Date.now();

    // Check cache first
    const cached = this.balanceCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.debug('ai-billing', `🎯 Using cached balance for user ${effectiveUserId}`);
      return cached.data;
    }

    // Fetch fresh data
    const balance = await this.getBalance(effectiveUserId);

    // Cache for 5 minutes
    this.balanceCache.set(cacheKey, {
      data: balance,
      expiresAt: now + 5 * 60 * 1000
    });

    return balance;
  }

  /**
   * Invalidate balance cache for a user (call after payment or consumption)
   */
  static invalidateBalanceCache(userId?: string): void {
    if (userId) {
      this.balanceCache.delete(`balance-${userId}`);
    } else {
      // Clear all cache if no specific user
      this.balanceCache.clear();
    }
    logger.debug('ai-billing', `🧹 Balance cache invalidated for user: ${userId || 'all'}`);
  }

  /**
   * Estimate project size based on template data
   */
  static estimateProjectSize(templateData: any): ProjectSize {
    if (!templateData) return 'small';

    const files = templateData.files || {};
    const fileCount = Array.isArray(files) ? files.length : Object.keys(files).length;
    const totalSize = Object.values(files).reduce((sum: number, file: any) => {
      return sum + (typeof file?.content === 'string' ? file.content.length : 0);
    }, 0);

    // Estimate based on file count and total content size
    const numFileCount = Number(fileCount) || 0;
    const numTotalSize = Number(totalSize) || 0;

    if (numFileCount < 5 && numTotalSize < 50000) return 'small';
    if (numFileCount < 20 && numTotalSize < 200000) return 'medium';
    return 'large';
  }

  /**
   * Pre-build validation hook - checks balance before starting a build
   */
  static async validatePreBuild(
    templateData: any,
    userId?: string
  ): Promise<{
    allowed: boolean;
    balance: BalanceResponse;
    estimate?: SufficientCheckResponse['estimate'];
    recommendation?: SufficientCheckResponse['recommendation'];
  }> {
    const effectiveUserId = userId || await getCurrentUserId();
    const projectSize = this.estimateProjectSize(templateData);

    logger.info(`🎯 Pre-build validation for user ${effectiveUserId}:`, {
      projectSize,
      fileCount: templateData?.files ? Object.keys(templateData.files).length : 0
    });

    try {
      // Run balance check and sufficient check in parallel with individual error handling
      let balance: BalanceResponse | null = null;
      let sufficientCheck: any = null;

      try {
        [balance, sufficientCheck] = await Promise.all([
          this.getBalance(effectiveUserId),
          this.checkSufficient('main_build', projectSize, effectiveUserId)
        ]);
      } catch (error) {
        // Handle the case where one or both calls failed
        logger.error(`❌ Failed to fetch balance or check sufficient for user ${effectiveUserId}:`, error);

        // Try to get balance individually
        try {
          balance = await this.getBalance(effectiveUserId);
        } catch (balanceError) {
          logger.error(`❌ Failed to fetch balance for user ${effectiveUserId}:`, balanceError);
        }

        // Try to get sufficient check individually
        try {
          sufficientCheck = await this.checkSufficient('main_build', projectSize, effectiveUserId);
        } catch (sufficientError) {
          logger.error(`❌ Failed to check sufficient for user ${effectiveUserId}:`, sufficientError);
        }
      }

      if (sufficientCheck && !sufficientCheck.sufficient) {
        logger.warn(`⚠️ Insufficient balance for user ${effectiveUserId}:`, {
          requested: sufficientCheck.estimate?.estimatedMinutes,
          available: balance?.totals?.total_seconds || 'unknown',
          recommendation: sufficientCheck.recommendation?.suggestedPackage
        });
      }

      return {
        allowed: sufficientCheck?.sufficient ?? false,
        balance,
        estimate: sufficientCheck?.estimate,
        recommendation: sufficientCheck?.recommendation
      };
    } catch (error) {
      logger.error(`❌ Pre-build validation failed for user ${effectiveUserId}:`, error);
      throw error;
    }
  }

  /**
   * Format balance for display in UI (Enhanced v2025-09-01 format)
   */
  static formatBalance(balance: BalanceResponse): {
    totalMinutes: number;
    remainingMinutes: number;
    usedToday: number;
    breakdown: {
      paid: number;
      bonus: number;
      dailyGift: number;
    };
    resetTime: string;
    planKey: string;
    subscriptionStatus: string;
    nextExpiryAt: string | null;
    monthlyBonusUsed: number;
    monthlyBonusCap: number;
  } {
    const totalMinutes = Math.floor(balance.totals.total_seconds / 60);
    const paidMinutes = Math.floor(balance.totals.paid_seconds / 60);
    const bonusMinutes = Math.floor(balance.totals.bonus_seconds / 60);

    // Calculate used today from bonus usage (approximate)
    const usedTodayMinutes = balance.bonus.used_this_month_minutes;
    const remainingMinutes = Math.max(0, totalMinutes - usedTodayMinutes);

    return {
      totalMinutes,
      remainingMinutes,
      usedToday: usedTodayMinutes,
      breakdown: {
        paid: paidMinutes,
        bonus: bonusMinutes,
        dailyGift: balance.bonus.daily_minutes
      },
      resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow (placeholder)
      planKey: balance.plan_key,
      subscriptionStatus: balance.subscription_status,
      nextExpiryAt: balance.totals.next_expiry_at,
      monthlyBonusUsed: balance.bonus.used_this_month_minutes,
      monthlyBonusCap: balance.bonus.monthly_cap_minutes
    };
  }

  /**
   * Get usage statistics for analytics (Enhanced v2025-09-01 format)
   */
  static async getUsageStats(userId?: string): Promise<{
    todayUsed: number;
    lifetimeUsed: number;
    averagePerDay: number;
    remainingToday: number;
    monthlyBonusUsed: number;
    monthlyBonusCap: number;
  }> {
    const balance = await this.getBalance(userId);

    // Use monthly bonus usage as proxy for recent usage
    const monthlyUsedMinutes = balance.bonus.used_this_month_minutes;
    const averagePerDay = monthlyUsedMinutes / Math.max(1, 30); // Rough 30-day average from monthly

    return {
      todayUsed: monthlyUsedMinutes, // Approximate - using monthly as proxy
      lifetimeUsed: monthlyUsedMinutes, // Approximate - no lifetime data in new format
      averagePerDay: Math.floor(averagePerDay),
      remainingToday: Math.max(0, Math.floor(balance.totals.total_seconds / 60)),
      monthlyBonusUsed: balance.bonus.used_this_month_minutes,
      monthlyBonusCap: balance.bonus.monthly_cap_minutes
    };
  }

  /**
   * Health check for billing service
   */
  static async healthCheck(): Promise<boolean> {
    try {
      // Try to get balance for a test or current user
      await this.getBalance();
      return true;
    } catch (error) {
      logger.error('❌ AI Time Billing service health check failed:', error);
      return false;
    }
  }
}
