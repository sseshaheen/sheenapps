import { pool } from './database';
import type { PoolClient } from 'pg';
import { pricingCatalogService } from './pricingCatalogService';
import { unifiedLogger } from './unifiedLogger';

// =====================================================
// ENHANCED TYPES AND INTERFACES (EXPERT-DEFINED)
// =====================================================

export interface SecondBucket {
  id: string;                              // unique bucket identifier
  source: 'daily' | 'subscription' | 'rollover' | 'package' | 'welcome' | 'gift';
  seconds: number;                         // total seconds in bucket
  consumed: number;                        // seconds already used
  expires_at: string | null;              // ISO timestamp, null = never expires
  created_at: string;                      // when bucket was created
}

export interface EnhancedUserBalance {
  version: string;
  plan_key: string;
  subscription_status: 'active' | 'inactive' | 'cancelled';
  totals: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
    next_expiry_at: string | null;
  };
  buckets: Array<{
    source: SecondBucket['source'];
    seconds: number;
    expires_at: string | null;
  }>;
  bonus: {
    daily_minutes: number;
    used_this_month_minutes: number;
    monthly_cap_minutes: number;
  };
}

export interface ConsumptionResult {
  consumed_seconds: number;
  consumption_breakdown: {
    daily_used: number;
    paid_used: number;
    bonus_used: number;
  };
  balance_before: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
  };
  balance_after: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
  };
}

export interface InsufficientFundsError {
  error: string;
  http_status: number;
  balance_seconds: number;
  breakdown_seconds: {
    bonus_daily: number;
    paid: number;
  };
  suggestions: Array<{
    type: 'package' | 'upgrade';
    key?: string;
    plan?: string;
    minutes?: number;
  }>;
  catalog_version: string;
}

// =====================================================
// ENHANCED AI TIME BILLING SERVICE
// =====================================================

export class EnhancedAITimeBillingService {
  
  // =====================================================
  // BALANCE MANAGEMENT WITH BUCKETS
  // =====================================================

  /**
   * Get user's enhanced balance with bucket breakdown
   */
  async getEnhancedUserBalance(userId: string): Promise<EnhancedUserBalance> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client: PoolClient = await pool.connect();
    try {
      // Get user balance with bucket data
      const query = `
        SELECT 
          ub.*,
          bs.status as subscription_status,
          pi.item_key as plan_key
        FROM user_ai_time_balance ub
        LEFT JOIN billing_customers bc ON bc.user_id = ub.user_id
        LEFT JOIN billing_subscriptions bs ON bs.customer_id = bc.id AND bs.status = 'active'
        LEFT JOIN pricing_items pi ON pi.id = bs.pricing_item_id
        WHERE ub.user_id = $1
      `;
      
      const result = await client.query(query, [userId]);
      
      if (result.rows.length === 0) {
        // Initialize new user with welcome bonus
        await this.initializeUserBalance(userId, client);
        return this.getEnhancedUserBalance(userId);
      }

      const row = result.rows[0];
      const buckets: SecondBucket[] = row.second_buckets || [];
      
      // Grant daily bonus if eligible
      const bonusGranted = await this.grantDailyBonusIfEligible(userId, client);
      if (bonusGranted) {
        unifiedLogger.system('daily_bonus_granted', 'info', `Daily bonus granted to user ${userId}`, {
          userId,
          bonusSeconds: 900,
          source: 'daily'
        });
      }
      
      // Get fresh data after potential daily bonus grant
      const updatedResult = await client.query(query, [userId]);
      const updatedRow = updatedResult.rows[0];
      const updatedBuckets: SecondBucket[] = updatedRow.second_buckets || [];
      
      return {
        version: updatedRow.pricing_catalog_version || '2025-09-01',
        plan_key: updatedRow.plan_key || 'free',
        subscription_status: updatedRow.subscription_status || 'inactive',
        totals: {
          total_seconds: (updatedRow.total_paid_seconds || 0) + (updatedRow.total_bonus_seconds || 0),
          paid_seconds: updatedRow.total_paid_seconds || 0,
          bonus_seconds: updatedRow.total_bonus_seconds || 0,
          next_expiry_at: updatedRow.next_expiry_at
        },
        buckets: updatedBuckets
          .filter(b => (b.seconds - b.consumed) > 0)
          .map(bucket => ({
            source: bucket.source,
            seconds: bucket.seconds - bucket.consumed,
            expires_at: bucket.expires_at
          })),
        bonus: {
          daily_minutes: 15,
          used_this_month_minutes: Math.floor((updatedRow.bonus_used_this_month || 0) / 60),
          monthly_cap_minutes: Math.floor((updatedRow.bonus_monthly_cap || 18000) / 60)
        }
      };

    } finally {
      client.release();
    }
  }

  /**
   * Initialize user balance with welcome bonus bucket
   */
  private async initializeUserBalance(userId: string, client?: PoolClient): Promise<void> {
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const useClient = client || await pool.connect();
    
    try {
      // Create welcome bonus bucket
      const welcomeBucket: SecondBucket = {
        id: `welcome-${userId}`,
        source: 'welcome',
        seconds: 3000, // 50 minutes
        consumed: 0,
        expires_at: null, // Never expires
        created_at: new Date().toISOString()
      };

      const query = `
        INSERT INTO user_ai_time_balance (
          user_id, 
          welcome_bonus_seconds, 
          second_buckets,
          bonus_month_year,
          bonus_monthly_cap,
          pricing_catalog_version
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO NOTHING
      `;

      await useClient.query(query, [
        userId,
        3000,
        JSON.stringify([welcomeBucket]),
        new Date().toISOString().slice(0, 7), // YYYY-MM
        18000, // 300 minutes in seconds
        '2025-09-01'
      ]);

    } finally {
      if (!client) {
        useClient.release();
      }
    }
  }

  /**
   * Grant daily bonus if eligible (with monthly cap protection)
   */
  private async grantDailyBonusIfEligible(userId: string, client: PoolClient): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    try {
      // Check if daily bonus already granted and monthly cap
      const checkQuery = `
        SELECT 
          second_buckets,
          bonus_used_this_month,
          bonus_monthly_cap,
          bonus_month_year
        FROM user_ai_time_balance 
        WHERE user_id = $1
        FOR UPDATE
      `;
      
      const result = await client.query(checkQuery, [userId]);
      if (result.rows.length === 0) return false;

      const row = result.rows[0];
      const buckets: SecondBucket[] = row.second_buckets || [];
      const monthlyUsed = row.bonus_used_this_month || 0;
      const monthlyCap = row.bonus_monthly_cap || 18000;
      const currentMonth = row.bonus_month_year || thisMonth;

      // Check if daily bonus already exists for today
      const hasToday = buckets.some(b => 
        b.source === 'daily' && 
        b.id.includes(today) &&
        (b.seconds - b.consumed) > 0
      );
      
      if (hasToday) return false;

      // Check monthly cap (only for free tier)
      if (monthlyUsed >= monthlyCap) return false;

      // Reset monthly counter if new month
      let updatedMonthlyUsed = monthlyUsed;
      if (currentMonth !== thisMonth) {
        updatedMonthlyUsed = 0;
      }

      // Create daily bonus bucket
      const dailyBucket: SecondBucket = {
        id: `daily-${today}`,
        source: 'daily',
        seconds: 900, // 15 minutes
        consumed: 0,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expires tomorrow
        created_at: new Date().toISOString()
      };

      // Add daily bucket to existing buckets
      const updatedBuckets = [...buckets.filter(b => b.source !== 'daily' || !b.id.includes(today)), dailyBucket];

      // Update user balance with new daily bucket
      const updateQuery = `
        UPDATE user_ai_time_balance 
        SET 
          second_buckets = $2,
          bonus_month_year = $3,
          bonus_used_this_month = $4,
          updated_at = NOW()
        WHERE user_id = $1
      `;

      await client.query(updateQuery, [
        userId,
        JSON.stringify(updatedBuckets),
        thisMonth,
        updatedMonthlyUsed
      ]);

      // Log daily bonus grant
      unifiedLogger.system('daily_bonus_granted', 'info', `Daily bonus granted: ${dailyBucket.seconds} seconds`, {
        userId,
        bucketId: dailyBucket.id,
        seconds: dailyBucket.seconds,
        expiresAt: dailyBucket.expires_at,
        monthlyUsed: updatedMonthlyUsed,
        monthlyCap
      });

      return true;

    } catch (error) {
      console.error(`Failed to grant daily bonus for ${userId}:`, error);
      return false;
    }
  }

  // =====================================================
  // CONSUMPTION WITH BUCKET PRIORITIZATION
  // =====================================================

  /**
   * Consume AI time with expert-defined bucket priority
   */
  async consumeAITime(
    userId: string, 
    operationSeconds: number,
    operationType: 'main_build' | 'metadata_generation' | 'update',
    metadata: {
      projectId?: string;
      buildId?: string;
      versionId?: string;
      sessionId?: string;
    }
  ): Promise<ConsumptionResult> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get user balance with row-level locking
      const balanceQuery = `
        SELECT * FROM user_ai_time_balance 
        WHERE user_id = $1 
        FOR UPDATE
      `;
      
      const balanceResult = await client.query(balanceQuery, [userId]);
      if (balanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('User balance not found');
      }

      const userBalance = balanceResult.rows[0];
      const buckets: SecondBucket[] = userBalance.second_buckets || [];

      // Calculate current totals for before snapshot
      const balanceBefore = {
        total_seconds: (userBalance.total_paid_seconds || 0) + (userBalance.total_bonus_seconds || 0),
        paid_seconds: userBalance.total_paid_seconds || 0,
        bonus_seconds: userBalance.total_bonus_seconds || 0
      };

      // Check if sufficient balance
      if (balanceBefore.total_seconds < operationSeconds) {
        await client.query('ROLLBACK');
        throw await this.createInsufficientFundsError(userId, operationSeconds, balanceBefore);
      }

      // Apply consumption with expert priority order
      const { updatedBuckets, consumptionBreakdown } = this.applyConsumptionToBuckets(
        buckets, 
        operationSeconds
      );

      // Update buckets in database
      const updateQuery = `
        UPDATE user_ai_time_balance 
        SET 
          second_buckets = $2,
          total_seconds_used_today = COALESCE(total_seconds_used_today, 0) + $3,
          total_seconds_used_lifetime = COALESCE(total_seconds_used_lifetime, 0) + $3,
          last_used_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
      `;

      await client.query(updateQuery, [
        userId,
        JSON.stringify(updatedBuckets),
        operationSeconds
      ]);

      // Record consumption in audit table
      await this.recordConsumption(client, userId, {
        operationType,
        operationSeconds,
        consumptionBreakdown,
        balanceBefore,
        metadata
      });

      // Calculate balance after
      const balanceAfter = {
        total_seconds: balanceBefore.total_seconds - operationSeconds,
        paid_seconds: balanceBefore.paid_seconds - consumptionBreakdown.paid_used,
        bonus_seconds: balanceBefore.bonus_seconds - consumptionBreakdown.daily_used
      };

      await client.query('COMMIT');

      // Log AI time consumption
      unifiedLogger.system('ai_time_consumed', 'info', `AI time consumed: ${operationSeconds}s for ${operationType}`, {
        userId,
        operationType,
        operationSeconds,
        consumptionBreakdown,
        balanceBefore,
        balanceAfter,
        projectId: metadata.projectId,
        buildId: metadata.buildId
      });

      return {
        consumed_seconds: operationSeconds,
        consumption_breakdown: consumptionBreakdown,
        balance_before: balanceBefore,
        balance_after: balanceAfter
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Apply consumption to buckets with expert priority
   */
  private applyConsumptionToBuckets(
    buckets: SecondBucket[], 
    operationSeconds: number
  ): { updatedBuckets: SecondBucket[], consumptionBreakdown: { daily_used: number, paid_used: number, bonus_used: number } } {
    
    let remainingToConsume = operationSeconds;
    const updatedBuckets = [...buckets];
    const consumptionBreakdown = {
      daily_used: 0,
      paid_used: 0,
      bonus_used: 0
    };

    // Sort buckets by expert-defined priority:
    // 1. Daily buckets first
    // 2. Among paid buckets: earliest expires_at first
    // 3. Tie-breaker: smallest remaining balance first
    const sortedBuckets = updatedBuckets
      .map((bucket, index) => ({ bucket, index }))
      .sort((a, b) => {
        // Daily buckets first
        if (a.bucket.source === 'daily' && b.bucket.source !== 'daily') return -1;
        if (b.bucket.source === 'daily' && a.bucket.source !== 'daily') return 1;

        // Among paid buckets, earliest expiry first
        if (a.bucket.source !== 'daily' && b.bucket.source !== 'daily') {
          if (a.bucket.expires_at && b.bucket.expires_at) {
            const diff = new Date(a.bucket.expires_at).getTime() - new Date(b.bucket.expires_at).getTime();
            if (diff !== 0) return diff;
          }
          
          // Tie-breaker: smallest remaining balance first
          const aRemaining = a.bucket.seconds - a.bucket.consumed;
          const bRemaining = b.bucket.seconds - b.bucket.consumed;
          return aRemaining - bRemaining;
        }

        return 0;
      });

    // Consume from buckets in priority order
    for (const { bucket, index } of sortedBuckets) {
      if (remainingToConsume <= 0) break;

      const available = bucket.seconds - bucket.consumed;
      if (available <= 0) continue;

      const toConsume = Math.min(available, remainingToConsume);
      
      // Update bucket consumption
      updatedBuckets[index] = {
        ...bucket,
        consumed: bucket.consumed + toConsume
      };

      // Track consumption breakdown
      if (bucket.source === 'daily') {
        consumptionBreakdown.daily_used += toConsume;
      } else if (['subscription', 'rollover', 'package'].includes(bucket.source)) {
        consumptionBreakdown.paid_used += toConsume;
      } else {
        consumptionBreakdown.bonus_used += toConsume;
      }

      remainingToConsume -= toConsume;
    }

    return { updatedBuckets, consumptionBreakdown };
  }

  /**
   * Record consumption in audit table
   */
  private async recordConsumption(
    client: PoolClient,
    userId: string,
    consumption: {
      operationType: string;
      operationSeconds: number;
      consumptionBreakdown: { daily_used: number, paid_used: number, bonus_used: number };
      balanceBefore: { total_seconds: number, paid_seconds: number, bonus_seconds: number };
      metadata: any;
    }
  ): Promise<void> {
    const insertQuery = `
      INSERT INTO user_ai_time_consumption (
        user_id,
        project_id,
        build_id,
        version_id,
        session_id,
        idempotency_key,
        operation_type,
        started_at,
        ended_at,
        duration_ms,
        duration_seconds,
        billable_seconds,
        daily_gift_used_seconds,
        paid_seconds_used,
        balance_before_seconds,
        balance_after_seconds,
        success,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `;

    const now = new Date();
    const balanceAfter = {
      total: consumption.balanceBefore.total_seconds - consumption.operationSeconds,
      paid: consumption.balanceBefore.paid_seconds - consumption.consumptionBreakdown.paid_used,
      bonus: consumption.balanceBefore.bonus_seconds - consumption.consumptionBreakdown.daily_used
    };

    await client.query(insertQuery, [
      userId,
      consumption.metadata.projectId || '',
      consumption.metadata.buildId || '',
      consumption.metadata.versionId || '',
      consumption.metadata.sessionId || '',
      `${consumption.metadata.buildId || 'manual'}_${consumption.operationType}`,
      consumption.operationType,
      now,
      now,
      consumption.operationSeconds * 1000, // Convert to milliseconds
      consumption.operationSeconds,
      consumption.operationSeconds, // Rounded up in real implementation
      consumption.consumptionBreakdown.daily_used,
      consumption.consumptionBreakdown.paid_used,
      JSON.stringify(consumption.balanceBefore),
      JSON.stringify(balanceAfter),
      true,
      now
    ]);
  }

  /**
   * Create standard 402 insufficient funds error
   */
  private async createInsufficientFundsError(
    userId: string,
    requiredSeconds: number,
    currentBalance: { total_seconds: number, paid_seconds: number, bonus_seconds: number }
  ): Promise<InsufficientFundsError> {
    
    // Get catalog for suggestions
    const catalog = await pricingCatalogService.getActiveCatalog();
    
    const shortfallSeconds = requiredSeconds - currentBalance.total_seconds;
    const shortfallMinutes = Math.ceil(shortfallSeconds / 60);
    
    // Suggest appropriate package based on shortfall
    const suggestions = [];
    
    // Find suitable package
    for (const pkg of catalog.packages) {
      if (pkg.minutes >= shortfallMinutes) {
        suggestions.push({
          type: 'package' as const,
          key: pkg.key,
          minutes: pkg.minutes
        });
        break;
      }
    }
    
    // Suggest upgrade if on free tier
    if (currentBalance.paid_seconds === 0) {
      suggestions.push({
        type: 'upgrade' as const,
        plan: 'starter'
      });
    }

    return {
      error: 'INSUFFICIENT_AI_TIME',
      http_status: 402,
      balance_seconds: currentBalance.total_seconds,
      breakdown_seconds: {
        bonus_daily: currentBalance.bonus_seconds,
        paid: currentBalance.paid_seconds
      },
      suggestions,
      catalog_version: catalog.version
    };
  }

  // =====================================================
  // BUCKET MANAGEMENT UTILITIES
  // =====================================================

  /**
   * Add minutes to user balance (for purchases/subscriptions)
   */
  async creditUserBalance(
    userId: string,
    seconds: number,
    source: 'subscription' | 'package' | 'rollover' | 'gift',
    expiresAt?: Date
  ): Promise<void> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current buckets
      const query = `
        SELECT second_buckets FROM user_ai_time_balance 
        WHERE user_id = $1 
        FOR UPDATE
      `;
      
      const result = await client.query(query, [userId]);
      if (result.rows.length === 0) {
        await this.initializeUserBalance(userId, client);
      }

      const currentBuckets: SecondBucket[] = result.rows[0]?.second_buckets || [];
      
      // Create new bucket
      const newBucket: SecondBucket = {
        id: `${source}-${Date.now()}`,
        source,
        seconds,
        consumed: 0,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        created_at: new Date().toISOString()
      };

      const updatedBuckets = [...currentBuckets, newBucket];

      // Update buckets
      const updateQuery = `
        UPDATE user_ai_time_balance 
        SET 
          second_buckets = $2,
          updated_at = NOW()
        WHERE user_id = $1
      `;

      await client.query(updateQuery, [userId, JSON.stringify(updatedBuckets)]);
      
      // Log balance credit
      unifiedLogger.system('ai_time_credited', 'info', `AI time credited: ${seconds}s from ${source}`, {
        userId,
        seconds,
        source,
        expiresAt: expiresAt?.toISOString(),
        bucketId: newBucket.id
      });
      
      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const enhancedAITimeBillingService = new EnhancedAITimeBillingService();