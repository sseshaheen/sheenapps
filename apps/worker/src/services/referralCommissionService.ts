// Referral Commission Service
// Handles commission calculations, payments tracking, and tier management

import { Commission, TIER_THRESHOLDS, REFERRAL_CONSTANTS } from '../types/referrals';

// Database connection
const { pool } = require('./database');

export interface CommissionCalculationParams {
  referral_id: string;
  payment_id: string;
  payment_amount_cents: number;
  currency: string;
  commission_period?: number;
}

export interface CommissionResult {
  commission_id: string;
  commission_amount_cents: number;
  commission_rate: number;
  is_activation_bonus: boolean;
}

export class ReferralCommissionService {
  
  /**
   * Set internal RLS bypass for administrative operations
   * Uses the app.rls_tag = 'internal' pattern from migration for triggers/jobs
   */
  private async setInternalRLSBypass(): Promise<void> {
    await pool.query("SELECT set_config('app.rls_tag', 'internal', true)");
  }
  
  /**
   * Calculate and create commission for a successful payment
   */
  async calculateCommission(params: CommissionCalculationParams): Promise<CommissionResult> {
    const { referral_id, payment_id, payment_amount_cents, currency, commission_period = 1 } = params;

    try {
      // Get referral and partner info
      const referralResult = await pool.query(`
        SELECT r.*, rp.tier, rp.successful_referrals
        FROM referrals r
        JOIN referral_partners rp ON r.partner_id = rp.id
        WHERE r.id = $1
      `, [referral_id]);

      if (referralResult.rows.length === 0) {
        throw new Error('Referral not found');
      }

      const referral = referralResult.rows[0];
      const tier = referral.tier as 'bronze' | 'silver' | 'gold';

      // Get commission rate based on tier
      const commissionRate = TIER_THRESHOLDS[tier.toUpperCase() as keyof typeof TIER_THRESHOLDS].commission_rate;
      const commissionAmountCents = Math.floor((payment_amount_cents * commissionRate) / 100);

      // Check if this qualifies for activation bonus
      const isActivationBonus = (
        referral.successful_referrals + 1 === REFERRAL_CONSTANTS.ACTIVATION_BONUS_THRESHOLD &&
        commission_period === 1
      );

      // Calculate total commission (base + activation bonus if applicable)
      const totalCommissionCents = commissionAmountCents + (
        isActivationBonus ? REFERRAL_CONSTANTS.ACTIVATION_BONUS_CENTS : 0
      );

      // Create commission record
      const commissionResult = await pool.query(`
        INSERT INTO referral_commissions (
          referral_id, payment_id, partner_id, base_amount_cents,
          commission_amount_cents, currency, commission_rate,
          commission_period, is_activation_bonus, due_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        referral_id,
        payment_id,
        referral.partner_id,
        payment_amount_cents,
        totalCommissionCents,
        currency,
        commissionRate,
        commission_period,
        isActivationBonus,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      ]);

      const commissionId = commissionResult.rows[0].id;

      // Update referral status to confirmed on first payment
      if (commission_period === 1) {
        await pool.query(`
          UPDATE referrals 
          SET status = 'confirmed', first_payment_date = NOW(), confirmed_at = NOW()
          WHERE id = $1
        `, [referral_id]);
      }

      console.log(`[CommissionService] Created commission ${commissionId} for referral ${referral_id}`);

      return {
        commission_id: commissionId,
        commission_amount_cents: totalCommissionCents,
        commission_rate: commissionRate,
        is_activation_bonus: isActivationBonus
      };

    } catch (error) {
      console.error('[CommissionService] Failed to calculate commission:', error);
      throw error;
    }
  }

  /**
   * Handle payment webhook - create commissions for all applicable referrals
   */
  async processPaymentForCommissions(paymentId: string, userId: string, amountCents: number, currency: string): Promise<CommissionResult[]> {
    try {
      console.log(`[CommissionService] Processing payment ${paymentId} for user ${userId}`);
      
      // Set internal RLS bypass for webhook/payment processing operations
      await this.setInternalRLSBypass();

      // Find all referrals for this user that haven't reached 12-month limit
      const referralsResult = await pool.query(`
        SELECT 
          r.*,
          COUNT(c.id) as existing_commissions
        FROM referrals r
        LEFT JOIN referral_commissions c ON r.id = c.referral_id
        WHERE r.referred_user_id = $1 
          AND r.status = 'confirmed'
        GROUP BY r.id
        HAVING COUNT(c.id) < $2
      `, [userId, REFERRAL_CONSTANTS.COMMISSION_DURATION_MONTHS]);

      const results: CommissionResult[] = [];

      for (const referral of referralsResult.rows) {
        const commissionPeriod = referral.existing_commissions + 1;
        
        try {
          const result = await this.calculateCommission({
            referral_id: referral.id,
            payment_id: paymentId,
            payment_amount_cents: amountCents,
            currency,
            commission_period: commissionPeriod
          });
          
          results.push(result);
        } catch (error) {
          console.error(`[CommissionService] Failed to process commission for referral ${referral.id}:`, error);
          // Continue with other referrals
        }
      }

      console.log(`[CommissionService] Created ${results.length} commissions for payment ${paymentId}`);
      return results;

    } catch (error) {
      console.error('[CommissionService] Failed to process payment for commissions:', error);
      throw error;
    }
  }

  /**
   * Reverse commission for refunds/chargebacks
   */
  async reverseCommission(paymentId: string, reason: string): Promise<void> {
    try {
      const result = await pool.query(`
        UPDATE referral_commissions 
        SET 
          status = 'reversed',
          reversal_reason = $2,
          reversed_at = NOW(),
          updated_at = NOW()
        WHERE payment_id = $1 AND status IN ('pending', 'approved')
        RETURNING id, commission_amount_cents, partner_id
      `, [paymentId, reason]);

      console.log(`[CommissionService] Reversed ${result.rows.length} commissions for payment ${paymentId} due to: ${reason}`);

    } catch (error) {
      console.error('[CommissionService] Failed to reverse commissions:', error);
      throw error;
    }
  }

  /**
   * Approve pending commissions (typically after validation period)
   */
  async approveCommissions(commissionIds: string[]): Promise<number> {
    try {
      const result = await pool.query(`
        UPDATE referral_commissions 
        SET status = 'approved', updated_at = NOW()
        WHERE id = ANY($1) AND status = 'pending'
        RETURNING id
      `, [commissionIds]);

      const approvedCount = result.rows.length;
      console.log(`[CommissionService] Approved ${approvedCount} commissions`);
      
      return approvedCount;

    } catch (error) {
      console.error('[CommissionService] Failed to approve commissions:', error);
      throw error;
    }
  }

  /**
   * Get pending commissions for payout
   */
  async getPendingPayouts(minAmountCents: number = REFERRAL_CONSTANTS.MINIMUM_PAYOUT_CENTS): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT 
          rp.id as partner_id,
          rp.partner_code,
          rp.payout_method,
          u.email as partner_email,
          SUM(c.commission_amount_cents) as total_commission_cents,
          COUNT(c.id) as commission_count,
          c.currency,
          ARRAY_AGG(c.id) as commission_ids
        FROM referral_commissions c
        JOIN referral_partners rp ON c.partner_id = rp.id
        JOIN auth.users u ON rp.user_id = u.id
        WHERE c.status = 'approved'
          AND c.due_date <= CURRENT_DATE
        GROUP BY rp.id, rp.partner_code, rp.payout_method, u.email, c.currency
        HAVING SUM(c.commission_amount_cents) >= $1
        ORDER BY SUM(c.commission_amount_cents) DESC
      `, [minAmountCents]);

      return result.rows;

    } catch (error) {
      console.error('[CommissionService] Failed to get pending payouts:', error);
      throw error;
    }
  }

  /**
   * Mark commissions as paid
   */
  async markCommissionsPaid(commissionIds: string[], payoutBatchId: string): Promise<void> {
    try {
      await pool.query(`
        UPDATE referral_commissions 
        SET 
          status = 'paid',
          paid_at = NOW(),
          payout_batch_id = $2,
          updated_at = NOW()
        WHERE id = ANY($1) AND status = 'approved'
      `, [commissionIds, payoutBatchId]);

      console.log(`[CommissionService] Marked ${commissionIds.length} commissions as paid in batch ${payoutBatchId}`);

    } catch (error) {
      console.error('[CommissionService] Failed to mark commissions as paid:', error);
      throw error;
    }
  }

  /**
   * Get commission analytics for a partner
   */
  async getPartnerCommissionAnalytics(partnerId: string, days: number = 30): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT 
          DATE(c.created_at) as date,
          COUNT(c.id) as commission_count,
          SUM(c.commission_amount_cents) as daily_commission_cents,
          SUM(CASE WHEN c.is_activation_bonus THEN c.commission_amount_cents ELSE 0 END) as bonus_commission_cents
        FROM referral_commissions c
        WHERE c.partner_id = $1 
          AND c.created_at >= CURRENT_DATE - INTERVAL '$2 days'
          AND c.status != 'reversed'
        GROUP BY DATE(c.created_at)
        ORDER BY date DESC
      `, [partnerId, days]);

      const totalResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT c.referral_id) as total_paying_referrals,
          SUM(CASE WHEN c.status IN ('approved', 'paid') THEN c.commission_amount_cents ELSE 0 END) as total_earned_cents,
          SUM(CASE WHEN c.status = 'pending' THEN c.commission_amount_cents ELSE 0 END) as pending_cents,
          AVG(c.commission_amount_cents) as avg_commission_cents
        FROM referral_commissions c
        WHERE c.partner_id = $1 AND c.status != 'reversed'
      `, [partnerId]);

      return {
        daily_breakdown: result.rows,
        totals: totalResult.rows[0] || {
          total_paying_referrals: 0,
          total_earned_cents: 0,
          pending_cents: 0,
          avg_commission_cents: 0
        }
      };

    } catch (error) {
      console.error('[CommissionService] Failed to get partner analytics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const referralCommissionService = new ReferralCommissionService();