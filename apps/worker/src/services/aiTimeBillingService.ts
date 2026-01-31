import { pool } from './database';
import { ulid } from 'ulid';

// =====================================================
// TYPES AND INTERFACES
// =====================================================

export interface UserBalance {
  welcomeBonus: number; // seconds
  dailyGift: number; // seconds available today
  paid: number; // seconds from purchases/subscriptions
  total: number; // total seconds available
}

export interface ConsumptionBreakdown {
  welcomeUsed: number;
  dailyUsed: number;
  paidUsed: number;
  totalConsumed: number;
}

export interface TrackingSession {
  trackingId: string;
  operationId: string; // Stable ID for idempotency - reuse on retry to prevent double-charging
  startedAt: Date;
  estimatedSeconds: number;
}

export interface ConsumptionRecord {
  id: string;
  userId: string;
  buildId: string;
  operationType: string;
  durationSeconds: number;
  billableSeconds: number;
  consumption: ConsumptionBreakdown;
  balanceBefore: UserBalance;
  balanceAfter: UserBalance;
  success: boolean;
}

export interface EstimateResult {
  estimatedSeconds: number;
  estimatedMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  basedOnSamples: number;
}

export interface BalanceSnapshot {
  welcome: number;
  daily: number;
  paid: number;
}

export interface UsageStats {
  totalSecondsUsed: number;
  totalCostUsd: number;
  operationBreakdown: Record<string, number>;
  dailyUsage: Array<{ date: string; seconds: number }>;
}

export interface AutoTopUpSettings {
  enabled: boolean;
  thresholdSeconds: number;
  packageName: string;
  consentAt?: Date;
}

// =====================================================
// ERRORS
// =====================================================

export class InsufficientAITimeError extends Error {
  constructor(
    public required: number,
    public available: number,
    public breakdown: UserBalance,
    public estimate?: EstimateResult
  ) {
    super(`Insufficient AI time: ${required} seconds required, ${available} available`);
    this.name = 'InsufficientAITimeError';
  }
}

export class AITimeBillingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AITimeBillingError';
  }
}

// =====================================================
// CONSTANTS
// =====================================================

/**
 * Valid operation types for AI time billing.
 * Single source of truth for both runtime validation and TypeScript type.
 */
export const OPERATION_TYPES = [
  'main_build',
  'metadata_generation',
  'update',
  'plan_consultation',
  'plan_question',
  'plan_feature',
  'plan_fix',
  'plan_analysis',
  'website_migration',
] as const;

export type OperationType = typeof OPERATION_TYPES[number];

// =====================================================
// HELPERS
// =====================================================

/**
 * Safely coerce JSON column value to object.
 * node-postgres returns jsonb as object, but json as string - handle both.
 */
function coerceJson(val: unknown): Record<string, unknown> {
  if (!val) return {};
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return {};
    }
  }
  if (typeof val === 'object') return val as Record<string, unknown>;
  return {};
}

/**
 * Convert BalanceSnapshot shape to UserBalance shape.
 * BalanceSnapshot: { welcome, daily, paid }
 * UserBalance: { welcomeBonus, dailyGift, paid, total }
 */
function snapshotToUserBalance(snapshot: unknown): UserBalance {
  const s = coerceJson(snapshot);
  const welcome = Number(s.welcome ?? 0);
  const daily = Number(s.daily ?? 0);
  const paid = Number(s.paid ?? 0);
  return {
    welcomeBonus: welcome,
    dailyGift: daily,
    paid,
    total: welcome + daily + paid
  };
}

// =====================================================
// BILLING SERVICE
// =====================================================

export class AITimeBillingService {
  
  // =====================================================
  // BALANCE MANAGEMENT
  // =====================================================

  /**
   * Get user's current AI time balance across all sources
   */
  async getUserBalance(userId: string): Promise<UserBalance> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      SELECT 
        welcome_bonus_seconds,
        daily_gift_used_today,
        paid_seconds_remaining,
        subscription_seconds_remaining
      FROM user_ai_time_balance 
      WHERE user_id = $1
    `;

    try {
      const result = await pool.query(query, [userId]);
      
      if (result.rows.length === 0) {
        // Create new user balance with welcome bonus
        await this.initializeUserBalance(userId);
        return this.getUserBalance(userId);
      }

      const row = result.rows[0];
      
      // Calculate available daily gift (15 minutes = 900 seconds)
      const dailyGiftAvailable = Math.max(0, 900 - (row.daily_gift_used_today || 0));
      
      const balance: UserBalance = {
        welcomeBonus: row.welcome_bonus_seconds || 0,
        dailyGift: dailyGiftAvailable,
        paid: (row.paid_seconds_remaining || 0) + (row.subscription_seconds_remaining || 0),
        total: 0
      };
      
      balance.total = balance.welcomeBonus + balance.dailyGift + balance.paid;
      
      return balance;
    } catch (error) {
      throw new AITimeBillingError(`Failed to get user balance: ${error}`, 'BALANCE_FETCH_ERROR');
    }
  }

  /**
   * Check if user has sufficient balance for estimated operation
   */
  async checkSufficientBalance(userId: string, estimatedSeconds: number): Promise<boolean> {
    const balance = await this.getUserBalance(userId);
    return balance.total >= estimatedSeconds;
  }

  /**
   * Initialize balance for new user with welcome bonus
   */
  private async initializeUserBalance(userId: string): Promise<void> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      INSERT INTO user_ai_time_balance (user_id, welcome_bonus_seconds)
      VALUES ($1, 3000)
      ON CONFLICT (user_id) DO NOTHING
    `;

    await pool.query(query, [userId]);
  }

  // =====================================================
  // TIME TRACKING AND CONSUMPTION
  // =====================================================

  /**
   * Start tracking AI time for an operation
   *
   * IMPORTANT: The returned operationId is stable and should be reused on retries
   * to prevent double-charging. Pass it to endTracking() to ensure idempotency.
   */
  async startTracking(
    buildId: string,
    operationType: OperationType,
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    context: { projectId: string; versionId: string; userId: string; sessionId?: string | undefined },
    // Allow caller to pass existing operationId for retries (idempotency)
    existingOperationId?: string | undefined
  ): Promise<TrackingSession> {

    // Get historical estimate
    const estimate = await this.estimateDuration(operationType, {
      projectId: context.projectId,
      isUpdate: operationType === 'update'
    });

    // Check if user has sufficient balance
    const hasBalance = await this.checkSufficientBalance(context.userId, estimate.estimatedSeconds);
    if (!hasBalance) {
      const balance = await this.getUserBalance(context.userId);
      throw new InsufficientAITimeError(estimate.estimatedSeconds, balance.total, balance, estimate);
    }

    const startedAt = new Date();
    // Use stable operationId for idempotency - reuse on retries to prevent double-charging
    // If caller passes existingOperationId (retry scenario), reuse it
    const operationId = existingOperationId || ulid();

    // Use :: delimiter (won't appear in ULIDs or operation types)
    // trackingId format: buildId::operationType::operationId
    return {
      trackingId: `${buildId}::${operationType}::${operationId}`,
      operationId,
      startedAt,
      estimatedSeconds: estimate.estimatedSeconds
    };
  }

  /**
   * End tracking and record consumption
   */
  async endTracking(
    trackingId: string,
    context: {
      userId: string;
      projectId: string;
      versionId: string;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      sessionId?: string | undefined;
      startedAt: Date;
      success: boolean;
      errorType?: string | undefined;
    }
  ): Promise<ConsumptionRecord> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - context.startedAt.getTime();
    const durationSeconds = Math.ceil(durationMs / 1000);

    // Round up to nearest 10-second increment for billing
    const billableSeconds = Math.ceil(durationSeconds / 10) * 10;

    // Parse trackingId with :: delimiter (buildId::operationType::operationId)
    // Parse from end since operationType and operationId never contain ::
    // This safely handles buildId containing :: (defensive, even though ULIDs don't)
    const parts = trackingId.split('::');
    if (parts.length < 3) {
      throw new AITimeBillingError(
        `Invalid trackingId format: ${trackingId}. Expected: buildId::operationType::operationId`,
        'INVALID_TRACKING_ID'
      );
    }
    const operationId = parts.pop()!; // ULID, never contains ::
    const operationType = parts.pop()!; // Known set, never contains ::
    const buildId = parts.join('::'); // Rejoin remaining parts (handles :: in buildId)

    console.log(`[AI Time Billing] Recording consumption:`, {
      trackingId,
      buildId,
      operationType,
      durationSeconds,
      billableSeconds
    });

    // Validate operation type using shared const
    if (!OPERATION_TYPES.includes(operationType as OperationType)) {
      throw new AITimeBillingError(
        `Invalid operation type: ${operationType}. Allowed: ${OPERATION_TYPES.join(', ')}`,
        'INVALID_OPERATION_TYPE'
      );
    }
    
    return await this.recordConsumption({
      userId: context.userId,
      projectId: context.projectId,
      buildId,
      versionId: context.versionId,
      sessionId: context.sessionId,
      operationId, // Stable ID for idempotency - prevents double-charging on retry
      operationType: operationType as OperationType,
      startedAt: context.startedAt,
      endedAt,
      durationMs,
      durationSeconds,
      billableSeconds,
      success: context.success,
      errorType: context.errorType
    });
  }

  /**
   * Record AI time consumption with atomic balance update
   *
   * Uses INSERT-FIRST pattern for exactly-once billing semantics:
   * 1. Claim idempotency by inserting consumption record first (with placeholder values)
   * 2. If duplicate → return existing record (no debit)
   * 3. If insert succeeded → lock balance, compute consumption, debit, update record
   */
  async recordConsumption(params: {
    userId: string;
    projectId: string;
    buildId: string;
    versionId: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    sessionId?: string | undefined;
    operationId: string; // Required for idempotency - prevents double-charging on retry
    operationType: OperationType;
    startedAt: Date;
    endedAt: Date;
    durationMs: number;
    durationSeconds: number;
    billableSeconds: number;
    success: boolean;
    errorType?: string | undefined;
  }): Promise<ConsumptionRecord> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    // Build idempotency key from stable operationId
    const idempotencyKey = `${params.buildId}::${params.operationType}::${params.operationId}`;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // STEP 1: Claim idempotency by attempting INSERT first
      // Uses ON CONFLICT DO NOTHING - if duplicate, no rows returned
      const claimQuery = `
        INSERT INTO user_ai_time_consumption (
          user_id, project_id, build_id, version_id, session_id,
          idempotency_key, operation_type, started_at, ended_at,
          duration_ms, duration_seconds, billable_seconds,
          welcome_bonus_used_seconds, daily_gift_used_seconds, paid_seconds_used,
          balance_before_seconds, balance_after_seconds,
          success, error_type
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          0, 0, 0, '{}', '{}', $13, $14
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `;

      const claimResult = await client.query(claimQuery, [
        params.userId,
        params.projectId,
        params.buildId,
        params.versionId,
        params.sessionId,
        idempotencyKey,
        params.operationType,
        params.startedAt,
        params.endedAt,
        params.durationMs,
        params.durationSeconds,
        params.billableSeconds,
        params.success,
        params.errorType
      ]);

      // STEP 2: If no rows returned, this is a duplicate - fetch existing and return
      if (claimResult.rows.length === 0) {
        await client.query('COMMIT'); // Nothing to rollback

        console.log(`[AI Time Billing] Duplicate detected for ${idempotencyKey}, fetching existing record`);

        const existingQuery = `
          SELECT * FROM user_ai_time_consumption
          WHERE idempotency_key = $1
        `;
        const existingResult = await client.query(existingQuery, [idempotencyKey]);

        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0];
          return {
            id: existing.id,
            userId: existing.user_id,
            buildId: existing.build_id,
            operationType: existing.operation_type,
            durationSeconds: existing.duration_seconds,
            billableSeconds: existing.billable_seconds,
            consumption: {
              welcomeUsed: existing.welcome_bonus_used_seconds || 0,
              dailyUsed: existing.daily_gift_used_seconds || 0,
              paidUsed: existing.paid_seconds_used || 0,
              totalConsumed: existing.billable_seconds
            },
            // Use helpers to handle jsonb (object) vs json (string) and normalize shape
            balanceBefore: snapshotToUserBalance(existing.balance_before_seconds),
            balanceAfter: snapshotToUserBalance(existing.balance_after_seconds),
            success: existing.success
          };
        }

        // Shouldn't happen - conflict means record exists
        throw new AITimeBillingError('Duplicate detected but record not found', 'IDEMPOTENCY_ERROR');
      }

      const consumptionRecordId = claimResult.rows[0].id;

      // STEP 3: We won the insert - now lock balance and compute consumption
      const balanceQuery = `
        SELECT
          welcome_bonus_seconds,
          daily_gift_used_today,
          paid_seconds_remaining,
          subscription_seconds_remaining
        FROM user_ai_time_balance
        WHERE user_id = $1
        FOR UPDATE
      `;

      const balanceResult = await client.query(balanceQuery, [params.userId]);
      if (balanceResult.rows.length === 0) {
        throw new AITimeBillingError('User balance not found', 'USER_BALANCE_NOT_FOUND');
      }

      const balance = balanceResult.rows[0];
      const dailyGiftAvailable = Math.max(0, 900 - (balance.daily_gift_used_today || 0));

      const balanceBefore: BalanceSnapshot = {
        welcome: balance.welcome_bonus_seconds || 0,
        daily: dailyGiftAvailable,
        paid: (balance.paid_seconds_remaining || 0) + (balance.subscription_seconds_remaining || 0)
      };

      // Calculate consumption breakdown (Welcome → Daily → Paid)
      let remaining = params.billableSeconds;
      const consumption: ConsumptionBreakdown = {
        welcomeUsed: 0,
        dailyUsed: 0,
        paidUsed: 0,
        totalConsumed: params.billableSeconds
      };

      // Use welcome bonus first
      if (balanceBefore.welcome > 0 && remaining > 0) {
        consumption.welcomeUsed = Math.min(remaining, balanceBefore.welcome);
        remaining -= consumption.welcomeUsed;
      }

      // Then daily gift
      if (balanceBefore.daily > 0 && remaining > 0) {
        consumption.dailyUsed = Math.min(remaining, balanceBefore.daily);
        remaining -= consumption.dailyUsed;
      }

      // Finally paid
      if (remaining > 0) {
        if (balanceBefore.paid >= remaining) {
          consumption.paidUsed = remaining;
          remaining = 0;
        } else {
          // Insufficient balance - outer catch will ROLLBACK (which deletes our claimed record)
          throw new InsufficientAITimeError(params.billableSeconds, balanceBefore.welcome + balanceBefore.daily + balanceBefore.paid, {
            welcomeBonus: balanceBefore.welcome,
            dailyGift: balanceBefore.daily,
            paid: balanceBefore.paid,
            total: balanceBefore.welcome + balanceBefore.daily + balanceBefore.paid
          });
        }
      }

      // Calculate balance after consumption
      const balanceAfter: BalanceSnapshot = {
        welcome: balanceBefore.welcome - consumption.welcomeUsed,
        daily: balanceBefore.daily - consumption.dailyUsed,
        paid: balanceBefore.paid - consumption.paidUsed
      };

      // Calculate separate debits for paid and subscription buckets
      const paidRemaining = balance.paid_seconds_remaining || 0;
      const paidDebit = Math.min(consumption.paidUsed, paidRemaining);
      const subscriptionDebit = consumption.paidUsed - paidDebit;

      // STEP 4: Debit user balance
      const updateBalanceQuery = `
        UPDATE user_ai_time_balance
        SET
          welcome_bonus_seconds = GREATEST(0, COALESCE(welcome_bonus_seconds, 0) - $2),
          daily_gift_used_today = COALESCE(daily_gift_used_today, 0) + $3,
          paid_seconds_remaining = GREATEST(0, COALESCE(paid_seconds_remaining, 0) - $4),
          subscription_seconds_remaining = GREATEST(0, COALESCE(subscription_seconds_remaining, 0) - $5),
          total_seconds_used_today = COALESCE(total_seconds_used_today, 0) + $6,
          total_seconds_used_lifetime = COALESCE(total_seconds_used_lifetime, 0) + $6,
          last_used_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
      `;

      await client.query(updateBalanceQuery, [
        params.userId,
        consumption.welcomeUsed,
        consumption.dailyUsed,
        paidDebit,
        subscriptionDebit,
        params.billableSeconds
      ]);

      // STEP 5: Update consumption record with actual consumption data
      const updateConsumptionQuery = `
        UPDATE user_ai_time_consumption
        SET
          welcome_bonus_used_seconds = $2,
          daily_gift_used_seconds = $3,
          paid_seconds_used = $4,
          balance_before_seconds = $5,
          balance_after_seconds = $6
        WHERE id = $1
      `;

      await client.query(updateConsumptionQuery, [
        consumptionRecordId,
        consumption.welcomeUsed,
        consumption.dailyUsed,
        consumption.paidUsed,
        JSON.stringify(balanceBefore),
        JSON.stringify(balanceAfter)
      ]);

      await client.query('COMMIT');

      return {
        id: consumptionRecordId,
        userId: params.userId,
        buildId: params.buildId,
        operationType: params.operationType,
        durationSeconds: params.durationSeconds,
        billableSeconds: params.billableSeconds,
        consumption,
        balanceBefore: {
          welcomeBonus: balanceBefore.welcome,
          dailyGift: balanceBefore.daily,
          paid: balanceBefore.paid,
          total: balanceBefore.welcome + balanceBefore.daily + balanceBefore.paid
        },
        balanceAfter: {
          welcomeBonus: balanceAfter.welcome,
          dailyGift: balanceAfter.daily,
          paid: balanceAfter.paid,
          total: balanceAfter.welcome + balanceAfter.daily + balanceAfter.paid
        },
        success: params.success
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // ESTIMATION AND ANALYTICS
  // =====================================================

  /**
   * Estimate operation duration based on historical data
   */
  async estimateDuration(
    operationType: OperationType,
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    context: { projectId?: string | undefined; isUpdate?: boolean | undefined; projectSize?: 'small' | 'medium' | 'large' | undefined }
  ): Promise<EstimateResult> {
    if (!pool) {
      // Return default estimates if no database
      const defaults = {
        main_build: 180, // 3 minutes
        metadata_generation: 30, // 30 seconds
        update: 120, // 2 minutes
        plan_consultation: 60, // 1 minute
        plan_question: 30, // 30 seconds
        plan_feature: 120, // 2 minutes
        plan_fix: 90, // 1.5 minutes
        plan_analysis: 180, // 3 minutes
        website_migration: 1200 // 20 minutes (average migration)
      };
      
      return {
        estimatedSeconds: defaults[operationType],
        estimatedMinutes: Math.ceil(defaults[operationType] / 60),
        confidence: 'low',
        basedOnSamples: 0
      };
    }

    try {
      // Get p95 duration from historical data (last 30 days)
      const query = `
        SELECT 
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY billable_seconds) as p95_seconds,
          COUNT(*) as sample_count
        FROM user_ai_time_consumption
        WHERE operation_type = $1
          AND success = true
          AND created_at > NOW() - INTERVAL '30 days'
      `;
      
      const result = await pool.query(query, [operationType]);
      const row = result.rows[0];

      // Explicitly convert to number (PERCENTILE_CONT may return string from node-postgres)
      let baseEstimate = Number(row.p95_seconds) || this.getDefaultEstimate(operationType);
      
      // Adjust for context
      if (context.isUpdate) {
        baseEstimate *= 0.7; // Updates typically 30% faster
      }
      
      if (context.projectSize === 'large') {
        baseEstimate *= 1.3;
      } else if (context.projectSize === 'small') {
        baseEstimate *= 0.8;
      }
      
      // Round up to nearest 10 seconds
      const estimatedSeconds = Math.ceil(baseEstimate / 10) * 10;
      
      return {
        estimatedSeconds,
        estimatedMinutes: Math.ceil(estimatedSeconds / 60),
        confidence: row.sample_count > 10 ? 'high' : (row.sample_count > 3 ? 'medium' : 'low'),
        basedOnSamples: parseInt(row.sample_count) || 0
      };
      
    } catch (error) {
      // Fallback to defaults
      return {
        estimatedSeconds: this.getDefaultEstimate(operationType),
        estimatedMinutes: Math.ceil(this.getDefaultEstimate(operationType) / 60),
        confidence: 'low',
        basedOnSamples: 0
      };
    }
  }

  private getDefaultEstimate(operationType: string): number {
    const defaults: Record<string, number> = {
      main_build: 180, // 3 minutes
      metadata_generation: 30, // 30 seconds
      update: 120, // 2 minutes
      plan_consultation: 60, // 1 minute
      plan_question: 30, // 30 seconds
      plan_feature: 120, // 2 minutes
      plan_fix: 90, // 1.5 minutes
      plan_analysis: 180, // 3 minutes
      website_migration: 1200 // 20 minutes (average migration)
    };
    return defaults[operationType] || 120;
  }

  // =====================================================
  // PURCHASES AND SUBSCRIPTIONS
  // =====================================================

  /**
   * Add purchased minutes to user balance
   */
  async addPurchasedMinutes(userId: string, minutes: number, source: 'package' | 'subscription' = 'package'): Promise<void> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const seconds = Math.floor(minutes * 60);
    const column = source === 'subscription' ? 'subscription_seconds_remaining' : 'paid_seconds_remaining';
    
    const query = `
      UPDATE user_ai_time_balance
      SET ${column} = ${column} + $2,
          updated_at = NOW()
      WHERE user_id = $1
    `;
    
    await pool.query(query, [userId, seconds]);
  }

  // =====================================================
  // DAILY RESET AND MAINTENANCE
  // =====================================================

  /**
   * Reset daily gift allocation for all users (called by cron job)
   */
  async resetDailyAllocation(): Promise<{ usersReset: number }> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      UPDATE user_ai_time_balance
      SET daily_gift_used_today = 0,
          total_seconds_used_today = 0,
          updated_at = NOW()
      WHERE daily_gift_used_today > 0 OR total_seconds_used_today > 0
    `;
    
    const result = await pool.query(query);
    return { usersReset: result.rowCount || 0 };
  }

  // =====================================================
  // USER ANALYTICS
  // =====================================================

  /**
   * Get user usage statistics for a time period
   */
  async getUserUsageStats(userId: string, period: 'day' | 'week' | 'month'): Promise<UsageStats> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const intervalMap = {
      day: '1 day',
      week: '7 days',
      month: '30 days'
    };

    // Note: total_cost_usd is not populated in recordConsumption yet
    // Once cost calculation is implemented, add it back to this query
    const query = `
      SELECT
        SUM(billable_seconds) as total_seconds,
        operation_type,
        COUNT(*) as operation_count
      FROM user_ai_time_consumption
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '${intervalMap[period]}'
      GROUP BY operation_type
    `;

    const result = await pool.query(query, [userId]);

    const operationBreakdown: Record<string, number> = {};
    let totalSecondsUsed = 0;

    result.rows.forEach(row => {
      operationBreakdown[row.operation_type] = parseInt(row.total_seconds) || 0;
      totalSecondsUsed += parseInt(row.total_seconds) || 0;
    });

    return {
      totalSecondsUsed,
      totalCostUsd: 0, // TODO: Implement cost calculation in recordConsumption
      operationBreakdown,
      dailyUsage: [] // TODO: Implement daily breakdown
    };
  }

  /**
   * Get auto top-up settings for user
   */
  async getAutoTopUpSettings(userId: string): Promise<AutoTopUpSettings> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      SELECT 
        auto_topup_enabled,
        auto_topup_threshold_seconds,
        auto_topup_package,
        auto_topup_consent_at
      FROM user_ai_time_balance
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return {
        enabled: false,
        thresholdSeconds: 600,
        packageName: 'mini'
      };
    }

    const row = result.rows[0];
    
    return {
      enabled: row.auto_topup_enabled || false,
      thresholdSeconds: row.auto_topup_threshold_seconds || 600,
      packageName: row.auto_topup_package || 'mini',
      consentAt: row.auto_topup_consent_at
    };
  }
}

// Export singleton instance
export const aiTimeBillingService = new AITimeBillingService();