/**
 * In-House Metering Service
 *
 * Usage tracking and quota enforcement for Easy Mode projects.
 * Tracks storage bytes, job runs, email sends, and other metered primitives.
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { getPool } from '../databaseWrapper';

// =============================================================================
// TYPES
// =============================================================================

export type MetricName =
  | 'storage_bytes'
  | 'job_runs'
  | 'email_sends'
  | 'inbound_messages'
  | 'ai_operations'
  | 'exports'
  | 'mailboxes';

export interface UsageRecord {
  userId: string;
  metric: MetricName;
  value: number;
  periodStart: string;
  periodEnd: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  metric: MetricName;
}

export interface PlanLimits {
  maxStorageBytes: number;
  maxJobRunsMonthly: number;
  maxEmailSendsMonthly: number;
  maxInboundMessagesMonthly: number;
  maxAiOperationsMonthly: number;
  maxExportsMonthly: number;
  maxMailboxes: number;
}

// Default limits per plan (can be overridden from database)
const DEFAULT_PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxStorageBytes: 1_000_000_000, // 1GB
    maxJobRunsMonthly: 1_000,
    maxEmailSendsMonthly: 100,
    maxInboundMessagesMonthly: 500,
    maxAiOperationsMonthly: 100,
    maxExportsMonthly: 5,
    maxMailboxes: 1,
  },
  starter: {
    maxStorageBytes: 5_000_000_000, // 5GB
    maxJobRunsMonthly: 10_000,
    maxEmailSendsMonthly: 1_000,
    maxInboundMessagesMonthly: 5_000,
    maxAiOperationsMonthly: 500,
    maxExportsMonthly: 20,
    maxMailboxes: 5,
  },
  growth: {
    maxStorageBytes: 25_000_000_000, // 25GB
    maxJobRunsMonthly: 50_000,
    maxEmailSendsMonthly: 10_000,
    maxInboundMessagesMonthly: 50_000,
    maxAiOperationsMonthly: 2_000,
    maxExportsMonthly: 100,
    maxMailboxes: 25,
  },
  scale: {
    maxStorageBytes: -1, // Unlimited
    maxJobRunsMonthly: -1, // Unlimited
    maxEmailSendsMonthly: -1, // Unlimited
    maxInboundMessagesMonthly: -1, // Unlimited
    maxAiOperationsMonthly: -1, // Unlimited
    maxExportsMonthly: -1, // Unlimited
    maxMailboxes: -1, // Unlimited
  },
  // E2E tiny plan for deterministic quota testing
  // Tiny limits allow fast, predictable quota exceeded tests
  e2e_tiny: {
    maxStorageBytes: 1_048_576, // 1 MB (1024 * 1024)
    maxJobRunsMonthly: 5, // 5 jobs
    maxEmailSendsMonthly: 3, // 3 emails
    maxInboundMessagesMonthly: 10, // 10 inbound messages
    maxAiOperationsMonthly: 3, // 3 AI operations
    maxExportsMonthly: 2, // 2 exports
    maxMailboxes: 1,
  },
  // Pro plan - high limits for SDK E2E tests
  pro: {
    maxStorageBytes: 50_000_000_000, // 50GB
    maxJobRunsMonthly: 100_000,
    maxEmailSendsMonthly: 50_000,
    maxInboundMessagesMonthly: 200_000,
    maxAiOperationsMonthly: 10_000,
    maxExportsMonthly: 500,
    maxMailboxes: 100,
  },
};

// Metric name to plan limit field mapping
const METRIC_TO_LIMIT_FIELD: Record<MetricName, keyof PlanLimits> = {
  storage_bytes: 'maxStorageBytes',
  job_runs: 'maxJobRunsMonthly',
  email_sends: 'maxEmailSendsMonthly',
  inbound_messages: 'maxInboundMessagesMonthly',
  ai_operations: 'maxAiOperationsMonthly',
  exports: 'maxExportsMonthly',
  mailboxes: 'maxMailboxes',
};

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseMeteringService {
  /**
   * Get project owner's user ID from project ID
   */
  async getProjectOwnerId(projectId: string): Promise<string | null> {
    try {
      const { rows } = await getPool().query(
        `SELECT owner_id FROM projects WHERE id = $1 LIMIT 1`,
        [projectId]
      );
      return rows[0]?.owner_id || null;
    } catch (error) {
      console.error('[Metering] Error getting project owner:', error);
      return null;
    }
  }

  /**
   * Check quota for a project (resolves to owner's userId internally)
   */
  async checkProjectQuota(
    projectId: string,
    metric: MetricName,
    amount: number = 1
  ): Promise<QuotaCheckResult & { projectOwnerId?: string }> {
    const ownerId = await this.getProjectOwnerId(projectId);
    if (!ownerId) {
      // Fail closed - deny if we can't determine owner
      return {
        allowed: false,
        used: 0,
        limit: 0,
        remaining: 0,
        unlimited: false,
        metric,
      };
    }
    const result = await this.checkQuota(ownerId, metric, amount);
    return { ...result, projectOwnerId: ownerId };
  }

  /**
   * Track usage for a project (resolves to owner's userId internally)
   */
  async trackProjectUsage(
    projectId: string,
    metric: MetricName,
    amount: number = 1
  ): Promise<{ success: boolean; newTotal: number }> {
    const ownerId = await this.getProjectOwnerId(projectId);
    if (!ownerId) {
      console.error(`[Metering] Cannot track usage - no owner found for project ${projectId}`);
      return { success: false, newTotal: 0 };
    }
    return this.trackUsage(ownerId, metric, amount);
  }

  /**
   * Track storage change for a project (resolves to owner's userId internally)
   */
  async trackProjectStorageChange(
    projectId: string,
    bytesChange: number
  ): Promise<{ success: boolean; newTotal: number }> {
    const ownerId = await this.getProjectOwnerId(projectId);
    if (!ownerId) {
      console.error(`[Metering] Cannot track storage - no owner found for project ${projectId}`);
      return { success: false, newTotal: 0 };
    }
    return this.trackStorageChange(ownerId, bytesChange);
  }

  /**
   * Get current billing period bounds
   */
  private getCurrentPeriod(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }

  /**
   * Get user's plan name from their subscription
   */
  async getUserPlan(userId: string): Promise<string> {
    try {
      // First get customer ID
      const { rows: customerRows } = await getPool().query(
        `SELECT id FROM customers WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      if (customerRows.length === 0) {
        return 'free';
      }

      // Then get active subscription
      const { rows: subRows } = await getPool().query(
        `SELECT plan_name FROM subscriptions
         WHERE customer_id = $1
         AND status IN ('active', 'trialing')
         ORDER BY created_at DESC
         LIMIT 1`,
        [customerRows[0].id]
      );

      return subRows.length > 0 ? subRows[0].plan_name : 'free';
    } catch (error) {
      console.error('[Metering] Error getting user plan:', error);
      return 'free';
    }
  }

  /**
   * Get plan limits for a plan
   */
  getPlanLimits(planName: string): PlanLimits {
    return DEFAULT_PLAN_LIMITS[planName] ?? DEFAULT_PLAN_LIMITS['free']!;
  }

  /**
   * Get current usage for a metric
   */
  async getUsage(userId: string, metric: MetricName): Promise<number> {
    const { start, end } = this.getCurrentPeriod();

    try {
      const { rows } = await getPool().query(
        `SELECT COALESCE(SUM(metric_value), 0) as total
         FROM usage_tracking
         WHERE user_id = $1
         AND metric_name = $2
         AND period_start >= $3
         AND period_start < $4`,
        [userId, metric, start.toISOString(), end.toISOString()]
      );

      return parseInt(rows[0]?.total || '0', 10);
    } catch (error) {
      console.error('[Metering] Error getting usage:', error);
      return 0;
    }
  }

  /**
   * Check if an operation is allowed based on quota
   */
  async checkQuota(
    userId: string,
    metric: MetricName,
    amount: number = 1
  ): Promise<QuotaCheckResult> {
    const planName = await this.getUserPlan(userId);
    const limits = this.getPlanLimits(planName);
    const limitField = METRIC_TO_LIMIT_FIELD[metric];
    const limit = limits[limitField];
    const used = await this.getUsage(userId, metric);

    const unlimited = limit === -1;
    const remaining = unlimited ? Infinity : Math.max(0, limit - used);
    const allowed = unlimited || (used + amount) <= limit;

    return {
      allowed,
      used,
      limit,
      remaining: unlimited ? -1 : remaining,
      unlimited,
      metric,
    };
  }

  /**
   * Track usage for a metric (increment)
   */
  async trackUsage(
    userId: string,
    metric: MetricName,
    amount: number = 1
  ): Promise<{ success: boolean; newTotal: number }> {
    const { start, end } = this.getCurrentPeriod();

    try {
      // Upsert: insert or update existing record for this period
      const { rows } = await getPool().query(
        `INSERT INTO usage_tracking (user_id, metric_name, metric_value, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, metric_name, period_start)
         DO UPDATE SET
           metric_value = usage_tracking.metric_value + EXCLUDED.metric_value,
           updated_at = NOW()
         RETURNING metric_value`,
        [userId, metric, amount, start.toISOString(), end.toISOString()]
      );

      const newTotal = parseInt(rows[0]?.metric_value || '0', 10);
      console.log(`[Metering] Tracked ${amount} ${metric} for user ${userId}, new total: ${newTotal}`);

      return { success: true, newTotal };
    } catch (error) {
      console.error('[Metering] Error tracking usage:', error);
      return { success: false, newTotal: 0 };
    }
  }

  /**
   * Track storage usage (special case: can increase or decrease)
   */
  async trackStorageChange(
    userId: string,
    bytesChange: number
  ): Promise<{ success: boolean; newTotal: number }> {
    const { start, end } = this.getCurrentPeriod();

    try {
      // For storage, we track the current total, not incremental changes
      // First, get the current storage usage
      const { rows: currentRows } = await getPool().query(
        `SELECT metric_value FROM usage_tracking
         WHERE user_id = $1
         AND metric_name = 'storage_bytes'
         AND period_start = $2`,
        [userId, start.toISOString()]
      );

      const currentValue = parseInt(currentRows[0]?.metric_value || '0', 10);
      const newValue = Math.max(0, currentValue + bytesChange);

      // Upsert with the new value
      const { rows } = await getPool().query(
        `INSERT INTO usage_tracking (user_id, metric_name, metric_value, period_start, period_end)
         VALUES ($1, 'storage_bytes', $2, $3, $4)
         ON CONFLICT (user_id, metric_name, period_start)
         DO UPDATE SET
           metric_value = $2,
           updated_at = NOW()
         RETURNING metric_value`,
        [userId, newValue, start.toISOString(), end.toISOString()]
      );

      const newTotal = parseInt(rows[0]?.metric_value || '0', 10);
      console.log(`[Metering] Storage change ${bytesChange} bytes for user ${userId}, new total: ${newTotal}`);

      return { success: true, newTotal };
    } catch (error) {
      console.error('[Metering] Error tracking storage:', error);
      return { success: false, newTotal: 0 };
    }
  }

  /**
   * Get all usage metrics for a user
   */
  async getAllUsage(userId: string): Promise<Record<MetricName, number>> {
    const metrics: MetricName[] = ['storage_bytes', 'job_runs', 'email_sends', 'inbound_messages', 'ai_operations', 'exports', 'mailboxes'];
    const result: Record<MetricName, number> = {
      storage_bytes: 0,
      job_runs: 0,
      email_sends: 0,
      inbound_messages: 0,
      ai_operations: 0,
      exports: 0,
      mailboxes: 0,
    };

    for (const metric of metrics) {
      result[metric] = await this.getUsage(userId, metric);
    }

    return result;
  }

  /**
   * Reserve quota atomically for a project - increments usage BEFORE the operation.
   * This prevents race conditions where multiple concurrent requests pass the quota check.
   *
   * Pattern: reserve -> try operation -> release on failure (or keep on success)
   *
   * Returns the quota check result AFTER the reservation has been made.
   * If not allowed, the reservation is not made.
   */
  async reserveProjectQuota(
    projectId: string,
    metric: MetricName,
    amount: number = 1
  ): Promise<QuotaCheckResult & { projectOwnerId?: string; reserved: boolean }> {
    const ownerId = await this.getProjectOwnerId(projectId);
    if (!ownerId) {
      // Fail closed - deny if we can't determine owner
      return {
        allowed: false,
        used: 0,
        limit: 0,
        remaining: 0,
        unlimited: false,
        metric,
        reserved: false,
      };
    }

    const planName = await this.getUserPlan(ownerId);
    const limits = this.getPlanLimits(planName);
    const limitField = METRIC_TO_LIMIT_FIELD[metric];
    const limit = limits[limitField];
    const unlimited = limit === -1;

    const { start, end } = this.getCurrentPeriod();

    try {
      // Use a single atomic SQL operation to check AND increment
      // This uses FOR UPDATE SKIP LOCKED to handle concurrent requests
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');

        // Atomic upsert with quota check in a single transaction
        // First, ensure the row exists and lock it
        const { rows: upsertRows } = await client.query(
          `INSERT INTO usage_tracking (user_id, metric_name, metric_value, period_start, period_end)
           VALUES ($1, $2, 0, $3, $4)
           ON CONFLICT (user_id, metric_name, period_start) DO NOTHING
           RETURNING metric_value`,
          [ownerId, metric, start.toISOString(), end.toISOString()]
        );

        // Lock the row, capture old value, conditionally increment, and return
        // whether the reservation actually happened. Uses a CTE to avoid the bug
        // where RETURNING sees the post-update value and misjudges was_allowed.
        // INVARIANT: was_allowed MUST mean the increment occurred. The SET and
        // RETURNING CASE expressions must use the same condition (old_value + amount <= limit).
        // Do not change one without updating the other.
        const { rows } = await client.query(
          `WITH old AS (
             SELECT metric_value AS old_value
             FROM usage_tracking
             WHERE user_id = $1 AND metric_name = $2 AND period_start = $5
             FOR UPDATE
           )
           UPDATE usage_tracking ut
           SET metric_value = CASE
             WHEN $4 = -1 THEN ut.metric_value + $3
             WHEN (SELECT old_value FROM old) + $3 <= $4 THEN ut.metric_value + $3
             ELSE ut.metric_value
           END,
           updated_at = NOW()
           FROM old
           WHERE ut.user_id = $1
           AND ut.metric_name = $2
           AND ut.period_start = $5
           RETURNING ut.metric_value,
             CASE
               WHEN $4 = -1 THEN true
               WHEN old.old_value + $3 <= $4 THEN true
               ELSE false
             END as was_allowed`,
          [ownerId, metric, amount, limit, start.toISOString()]
        );

        await client.query('COMMIT');

        if (rows.length === 0) {
          // This shouldn't happen after the upsert, but handle it
          return {
            allowed: false,
            used: 0,
            limit,
            remaining: unlimited ? -1 : limit,
            unlimited,
            metric,
            projectOwnerId: ownerId,
            reserved: false,
          };
        }

        const newTotal = parseInt(rows[0].metric_value, 10);
        const wasAllowed = rows[0].was_allowed;

        if (wasAllowed) {
          console.log(`[Metering] Reserved ${amount} ${metric} for project ${projectId} (user ${ownerId}), new total: ${newTotal}`);
          return {
            allowed: true,
            used: newTotal,
            limit,
            remaining: unlimited ? -1 : Math.max(0, limit - newTotal),
            unlimited,
            metric,
            projectOwnerId: ownerId,
            reserved: true,
          };
        } else {
          // Quota exceeded - reservation was not made
          console.log(`[Metering] Quota exceeded for ${metric}, project ${projectId} (user ${ownerId}), current: ${newTotal}, limit: ${limit}`);
          return {
            allowed: false,
            used: newTotal,
            limit,
            remaining: 0,
            unlimited: false,
            metric,
            projectOwnerId: ownerId,
            reserved: false,
          };
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[Metering] Error reserving quota:', error);
      // Fail closed on errors
      return {
        allowed: false,
        used: 0,
        limit: 0,
        remaining: 0,
        unlimited: false,
        metric,
        projectOwnerId: ownerId,
        reserved: false,
      };
    }
  }

  /**
   * Release a previously reserved quota (call on operation failure).
   * This decrements the usage that was optimistically incremented by reserveProjectQuota.
   */
  async releaseProjectQuota(
    projectId: string,
    metric: MetricName,
    amount: number = 1
  ): Promise<{ success: boolean; newTotal: number }> {
    const ownerId = await this.getProjectOwnerId(projectId);
    if (!ownerId) {
      console.error(`[Metering] Cannot release quota - no owner found for project ${projectId}`);
      return { success: false, newTotal: 0 };
    }

    const { start, end } = this.getCurrentPeriod();

    try {
      // Decrement the usage (but don't go below 0)
      const { rows } = await getPool().query(
        `UPDATE usage_tracking
         SET metric_value = GREATEST(0, metric_value - $3),
             updated_at = NOW()
         WHERE user_id = $1
         AND metric_name = $2
         AND period_start = $4
         RETURNING metric_value`,
        [ownerId, metric, amount, start.toISOString()]
      );

      const newTotal = parseInt(rows[0]?.metric_value || '0', 10);
      console.log(`[Metering] Released ${amount} ${metric} for project ${projectId} (user ${ownerId}), new total: ${newTotal}`);

      return { success: true, newTotal };
    } catch (error) {
      console.error('[Metering] Error releasing quota:', error);
      return { success: false, newTotal: 0 };
    }
  }
  /**
   * Check mailbox quota by counting actual non-deleted mailboxes in the DB.
   * Unlike other metrics (monthly counters), mailboxes are a resource count
   * that must be derived from current state to stay accurate.
   */
  async checkMailboxQuota(projectId: string): Promise<QuotaCheckResult> {
    const ownerId = await this.getProjectOwnerId(projectId);
    if (!ownerId) {
      return { allowed: false, used: 0, limit: 0, remaining: 0, unlimited: false, metric: 'mailboxes' };
    }

    const planName = await this.getUserPlan(ownerId);
    const limits = this.getPlanLimits(planName);
    const limit = limits.maxMailboxes;
    const unlimited = limit === -1;

    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS used
       FROM inhouse_mailboxes
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );

    const used = rows[0]?.used ?? 0;
    const remaining = unlimited ? -1 : Math.max(0, limit - used);

    return {
      allowed: unlimited || used < limit,
      used,
      limit,
      remaining,
      unlimited,
      metric: 'mailboxes',
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let meteringServiceInstance: InhouseMeteringService | null = null;

export function getInhouseMeteringService(): InhouseMeteringService {
  if (!meteringServiceInstance) {
    meteringServiceInstance = new InhouseMeteringService();
  }
  return meteringServiceInstance;
}
