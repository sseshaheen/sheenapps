import { PoolClient } from 'pg';
import { pool } from '../services/database';
import { pricingCatalogService } from './pricingCatalogService';

// Expert-enhanced event typology
export type BillingEventType = 
  | 'subscription_credit' 
  | 'package_credit'
  | 'daily_bonus'
  | 'consumption'
  | 'rollover_created'
  | 'rollover_discard'
  | 'rollover_discard_pending'  // warn before downgrade
  | 'auto_topup_triggered'      // future
  | 'adjustment';               // support ops

// Standardized event structure  
export interface BillingEvent {
  type: BillingEventType;
  seconds: number;              // positive = credit, negative = debit
  reason: string;               // human readable
  timestamp: string;            // ISO UTC
  metadata?: Record<string, any>;
}

export interface PlanChangeResult {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  rollover_will_be_discarded?: number | undefined; // seconds that will be lost
  effective_at: string; // when change takes effect
  warnings: string[];
  events_created: BillingEvent[];
}

export interface SubscriptionStatus {
  plan_key: string;
  status: 'active' | 'inactive' | 'cancelled' | 'unpaid';
  current_period_end?: string;
  rollover_seconds_available?: number;
  downgrade_warning?: {
    new_rollover_cap: number;
    excess_seconds: number;
    will_be_discarded: boolean;
  };
}

class PlanLifecycleService {
  
  /**
   * Handle subscription plan change with rollover warnings
   */
  async handlePlanChange(
    userId: string,
    newPlanKey: string,
    reason: string,
    adminUserId?: string
  ): Promise<PlanChangeResult> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current plan and rollover status
      const currentStatusQuery = `
        SELECT 
          ub.second_buckets,
          pi.item_key as current_plan,
          pi.rollover_cap_seconds as current_rollover_cap,
          bs.status as subscription_status
        FROM user_ai_time_balance ub
        LEFT JOIN billing_subscriptions bs ON bs.user_id = ub.user_id AND bs.status = 'active'
        LEFT JOIN pricing_items pi ON pi.id = bs.pricing_item_id
        WHERE ub.user_id = $1
        FOR UPDATE
      `;
      
      const currentResult = await client.query(currentStatusQuery, [userId]);
      if (currentResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentUser = currentResult.rows[0];
      const buckets = currentUser.second_buckets || [];
      
      // Get new plan details
      const newPlan = await pricingCatalogService.getPricingItem(newPlanKey);
      if (!newPlan) {
        throw new Error(`Plan ${newPlanKey} not found in active catalog`);
      }

      // Calculate rollover seconds that would be affected
      const rolloverBuckets = buckets.filter((b: any) => b.source === 'rollover');
      const totalRolloverSeconds = rolloverBuckets.reduce((sum: number, bucket: any) => 
        sum + (bucket.seconds - bucket.consumed), 0
      );

      const warnings: string[] = [];
      const events: BillingEvent[] = [];
      let rolloverWillBeDiscarded = 0;
      
      // Check if this is a downgrade that would affect rollover
      if (newPlan.rollover_cap_seconds && totalRolloverSeconds > newPlan.rollover_cap_seconds) {
        rolloverWillBeDiscarded = totalRolloverSeconds - newPlan.rollover_cap_seconds;
        warnings.push(
          `Downgrade will discard ${Math.floor(rolloverWillBeDiscarded / 60)} minutes of rollover time due to new plan cap`
        );
        
        // Create pending discard event
        events.push({
          type: 'rollover_discard_pending',
          seconds: -rolloverWillBeDiscarded,
          reason: `Plan change to ${newPlanKey} will exceed rollover cap`,
          timestamp: new Date().toISOString(),
          metadata: {
            old_plan: currentUser.current_plan,
            new_plan: newPlanKey,
            old_rollover_cap: currentUser.current_rollover_cap,
            new_rollover_cap: newPlan.rollover_cap_seconds
          }
        });
      }

      // Log the plan change event
      await this.logBillingEvent(client, userId, {
        type: 'adjustment',
        seconds: 0, // No immediate balance change
        reason: `Plan change: ${currentUser.current_plan || 'unknown'} → ${newPlanKey} (${reason})`,
        timestamp: new Date().toISOString(),
        metadata: {
          old_plan: currentUser.current_plan,
          new_plan: newPlanKey,
          admin_user: adminUserId,
          rollover_warning: rolloverWillBeDiscarded > 0
        }
      });

      await client.query('COMMIT');

      return {
        success: true,
        rollover_will_be_discarded: rolloverWillBeDiscarded > 0 ? rolloverWillBeDiscarded : undefined,
        effective_at: new Date().toISOString(),
        warnings,
        events_created: events
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle subscription cancellation (keep granted minutes)
   */
  async handleSubscriptionCancellation(
    userId: string, 
    reason: string,
    effectiveAt?: Date
  ): Promise<PlanChangeResult> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current subscription status
      const subscriptionQuery = `
        SELECT 
          bs.id as subscription_id,
          bs.status,
          pi.item_key as plan_key,
          ub.second_buckets
        FROM billing_subscriptions bs
        JOIN pricing_items pi ON pi.id = bs.pricing_item_id
        JOIN user_ai_time_balance ub ON ub.user_id = bs.user_id
        WHERE bs.user_id = $1 AND bs.status = 'active'
      `;
      
      const subResult = await client.query(subscriptionQuery, [userId]);
      if (subResult.rows.length === 0) {
        throw new Error('No active subscription found');
      }

      const subscription = subResult.rows[0];
      const buckets = subscription.second_buckets || [];
      
      // Count remaining minutes in subscription buckets
      const subscriptionMinutes = buckets
        .filter((b: any) => b.source === 'subscription')
        .reduce((sum: number, bucket: any) => sum + (bucket.seconds - bucket.consumed), 0);

      // Mark subscription as cancelled (don't claw back existing buckets)
      await client.query(`
        UPDATE billing_subscriptions 
        SET 
          status = 'cancelled',
          cancelled_at = $2,
          updated_at = NOW()
        WHERE id = $1
      `, [subscription.subscription_id, effectiveAt || new Date()]);

      // Log cancellation event
      await this.logBillingEvent(client, userId, {
        type: 'adjustment',
        seconds: 0, // No clawback
        reason: `Subscription cancelled: ${reason}`,
        timestamp: new Date().toISOString(),
        metadata: {
          plan_key: subscription.plan_key,
          remaining_subscription_seconds: subscriptionMinutes,
          no_clawback: true
        }
      });

      await client.query('COMMIT');

      return {
        success: true,
        effective_at: (effectiveAt || new Date()).toISOString(),
        warnings: [`Subscription cancelled but existing ${Math.floor(subscriptionMinutes / 60)} minutes retained`],
        events_created: []
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get comprehensive subscription status for user
   */
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client: PoolClient = await pool.connect();
    try {
      const query = `
        SELECT 
          COALESCE(pi.item_key, 'free') as plan_key,
          COALESCE(bs.status, 'inactive') as status,
          bs.current_period_end,
          ub.second_buckets,
          pi.rollover_cap_seconds
        FROM user_ai_time_balance ub
        LEFT JOIN billing_subscriptions bs ON bs.user_id = ub.user_id 
          AND bs.status IN ('active', 'past_due', 'cancelled')
        LEFT JOIN pricing_items pi ON pi.id = bs.pricing_item_id
        WHERE ub.user_id = $1
      `;
      
      const result = await client.query(query, [userId]);
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];
      const buckets = user.second_buckets || [];
      
      // Calculate rollover seconds
      const rolloverSeconds = buckets
        .filter((b: any) => b.source === 'rollover')
        .reduce((sum: number, bucket: any) => sum + (bucket.seconds - bucket.consumed), 0);

      const status: SubscriptionStatus = {
        plan_key: user.plan_key,
        status: user.status || 'inactive',
        rollover_seconds_available: rolloverSeconds
      };

      // Add current period end if active subscription
      if (user.current_period_end) {
        status.current_period_end = new Date(user.current_period_end * 1000).toISOString();
      }

      // Check if rollover would be affected by any plan changes
      if (user.rollover_cap_seconds && rolloverSeconds > user.rollover_cap_seconds) {
        status.downgrade_warning = {
          new_rollover_cap: user.rollover_cap_seconds,
          excess_seconds: rolloverSeconds - user.rollover_cap_seconds,
          will_be_discarded: true
        };
      }

      return status;

    } finally {
      client.release();
    }
  }

  /**
   * Log billing event with standardized format
   */
  private async logBillingEvent(
    client: PoolClient,
    userId: string,
    event: BillingEvent
  ): Promise<void> {
    // Log to billing events table (if it exists) or consumption table
    try {
      await client.query(`
        INSERT INTO user_ai_time_consumption (
          user_id,
          project_id,
          build_id,
          version_id,
          idempotency_key,
          operation_type,
          started_at,
          ended_at,
          duration_ms,
          duration_seconds,
          billable_seconds,
          success,
          error_type,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        userId,
        'lifecycle',
        event.type,
        'plan_change',
        `lifecycle_${Date.now()}_${userId}`,
        event.type,
        new Date(event.timestamp),
        new Date(event.timestamp),
        0, // No actual processing time
        Math.abs(event.seconds),
        event.seconds, // Can be negative for debits
        true,
        event.reason,
        new Date(event.timestamp)
      ]);
    } catch (error) {
      // If logging fails, don't fail the main operation
      console.error('Failed to log billing event:', error);
    }
  }

  /**
   * Perform integrity check on computed fields
   */
  async validateComputedFieldIntegrity(userId?: string): Promise<{
    valid: boolean;
    errors: string[];
    corrected: number;
  }> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client: PoolClient = await pool.connect();
    try {
      const whereClause = userId ? 'WHERE user_id = $1' : '';
      const params = userId ? [userId] : [];
      
      // Check for computed field inconsistencies
      const integrityQuery = `
        SELECT 
          user_id,
          second_buckets,
          total_paid_seconds,
          total_bonus_seconds,
          next_expiry_at,
          (
            SELECT COALESCE(SUM(
              CASE WHEN bucket->>'source' IN ('subscription', 'rollover', 'package')
              THEN (bucket->>'seconds')::INTEGER - (bucket->>'consumed')::INTEGER
              ELSE 0 END
            ), 0)
            FROM jsonb_array_elements(second_buckets) bucket
            WHERE (bucket->>'seconds')::INTEGER > (bucket->>'consumed')::INTEGER
          ) as computed_paid_seconds,
          (
            SELECT COALESCE(SUM(
              CASE WHEN bucket->>'source' IN ('daily', 'welcome', 'gift')
              THEN (bucket->>'seconds')::INTEGER - (bucket->>'consumed')::INTEGER
              ELSE 0 END
            ), 0)
            FROM jsonb_array_elements(second_buckets) bucket
            WHERE (bucket->>'seconds')::INTEGER > (bucket->>'consumed')::INTEGER
          ) as computed_bonus_seconds,
          (
            SELECT MIN((bucket->>'expires_at')::TIMESTAMPTZ)
            FROM jsonb_array_elements(second_buckets) bucket
            WHERE bucket->>'expires_at' IS NOT NULL 
              AND (bucket->>'expires_at')::TIMESTAMPTZ > NOW()
              AND (bucket->>'seconds')::INTEGER > (bucket->>'consumed')::INTEGER
          ) as computed_next_expiry
        FROM user_ai_time_balance
        ${whereClause}
      `;
      
      const result = await client.query(integrityQuery, params);
      const errors: string[] = [];
      let corrected = 0;
      
      for (const row of result.rows) {
        const issues = [];
        
        if (row.total_paid_seconds !== row.computed_paid_seconds) {
          issues.push(`paid: ${row.total_paid_seconds} → ${row.computed_paid_seconds}`);
        }
        
        if (row.total_bonus_seconds !== row.computed_bonus_seconds) {
          issues.push(`bonus: ${row.total_bonus_seconds} → ${row.computed_bonus_seconds}`);
        }
        
        const nextExpiryMismatch = (
          (row.next_expiry_at && !row.computed_next_expiry) ||
          (!row.next_expiry_at && row.computed_next_expiry) ||
          (row.next_expiry_at && row.computed_next_expiry && 
           new Date(row.next_expiry_at).getTime() !== new Date(row.computed_next_expiry).getTime())
        );
        
        if (nextExpiryMismatch) {
          issues.push(`expiry: ${row.next_expiry_at} → ${row.computed_next_expiry}`);
        }
        
        if (issues.length > 0) {
          errors.push(`User ${row.user_id}: ${issues.join(', ')}`);
          
          // Fix the computed fields
          await client.query(`
            UPDATE user_ai_time_balance 
            SET 
              total_paid_seconds = $2,
              total_bonus_seconds = $3,
              next_expiry_at = $4,
              updated_at = NOW()
            WHERE user_id = $1
          `, [
            row.user_id, 
            row.computed_paid_seconds, 
            row.computed_bonus_seconds, 
            row.computed_next_expiry
          ]);
          
          corrected++;
        }
      }
      
      return {
        valid: errors.length === 0,
        errors,
        corrected
      };
      
    } finally {
      client.release();
    }
  }
}

export const planLifecycleService = new PlanLifecycleService();