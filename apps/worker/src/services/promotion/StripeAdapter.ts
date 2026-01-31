/**
 * StripeAdapter - Ephemeral Gateway Artifacts Manager
 * 
 * Manages temporary Stripe promotion objects for the canonical control plane.
 * Creates, retrieves, and cleans up ephemeral coupons and promotion codes.
 * 
 * Architecture:
 * - Ephemeral artifacts with TTL cleanup
 * - Metadata linking to canonical promotion system
 * - Idempotent operations with conflict resolution
 * - Production-safe error handling
 */

import Stripe from 'stripe';
import { pool } from '../database';
import { getStripeConfig } from '../../config/stripeEnvironmentValidation';

// =====================================================
// Types and Interfaces
// =====================================================

export interface CreateEphemeralArtifactRequest {
  promotionId: string;
  promotionCodeId: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  currency?: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
}

export interface CreateEphemeralArtifactResult {
  success: boolean;
  stripePromotionCodeId?: string;
  stripeCouponId?: string;
  error?: string;
  errorCode?: string;
}

export interface CleanupArtifactsResult {
  cleaned: number;
  errors: string[];
}

// =====================================================
// StripeAdapter Implementation
// =====================================================

export class StripeAdapter {
  private stripe: Stripe;
  private static readonly ARTIFACT_TTL_HOURS = 2; // TTL for ephemeral artifacts

  constructor() {
    const config = getStripeConfig();
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-08-27.basil', // Latest API version
      typescript: true,
    });
  }

  /**
   * Create ephemeral Stripe artifacts for a promotion code
   * Creates both coupon and promotion_code objects
   */
  async createEphemeralArtifact(request: CreateEphemeralArtifactRequest): Promise<CreateEphemeralArtifactResult> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    try {
      // Check if artifacts already exist for this promotion code
      const existing = await pool.query(`
        SELECT external_coupon_id, external_promotion_code_id 
        FROM promotion_artifacts
        WHERE promotion_code_id = $1
        AND gateway = 'stripe'
        AND expires_at > now()
      `, [request.promotionCodeId]);

      if (existing.rows.length > 0) {
        return {
          success: true,
          stripePromotionCodeId: existing.rows[0].external_promotion_code_id,
          stripeCouponId: existing.rows[0].external_coupon_id
        };
      }

      // Create Stripe coupon (discount definition)
      const couponId = `temp_promo_${request.promotionId}_${Date.now()}`;
      let couponParams: Stripe.CouponCreateParams;

      if (request.discountType === 'percentage') {
        couponParams = {
          id: couponId,
          percent_off: request.discountValue, // Direct percentage value
          duration: 'once',
          metadata: {
            promotion_id: request.promotionId,
            promotion_code_id: request.promotionCodeId,
            ephemeral: 'true',
            created_for: request.userId || 'unknown',
            correlation_id: request.correlationId || '',
            expires_at: new Date(Date.now() + StripeAdapter.ARTIFACT_TTL_HOURS * 60 * 60 * 1000).toISOString()
          }
        };
      } else {
        // Fixed amount discount
        couponParams = {
          id: couponId,
          amount_off: request.discountValue, // Amount in minor units
          currency: request.currency || 'usd',
          duration: 'once',
          metadata: {
            promotion_id: request.promotionId,
            promotion_code_id: request.promotionCodeId,
            ephemeral: 'true',
            created_for: request.userId || 'unknown',
            correlation_id: request.correlationId || '',
            expires_at: new Date(Date.now() + StripeAdapter.ARTIFACT_TTL_HOURS * 60 * 60 * 1000).toISOString()
          }
        };
      }

      const stripeCoupon = await this.stripe.coupons.create(couponParams);

      // Create Stripe promotion code (user-facing code)
      // Set expires_at and max_redemptions for safety
      const promotionCodeExpiresAt = new Date();
      promotionCodeExpiresAt.setHours(promotionCodeExpiresAt.getHours() + StripeAdapter.ARTIFACT_TTL_HOURS);

      const stripePromotionCode = await this.stripe.promotionCodes.create({
        coupon: stripeCoupon.id,
        code: request.code.toUpperCase(), // Stripe handles normalization
        max_redemptions: 1, // Single use for safety
        expires_at: Math.floor(promotionCodeExpiresAt.getTime() / 1000), // Unix timestamp
        metadata: {
          promotion_id: request.promotionId,
          promotion_code_id: request.promotionCodeId,
          ephemeral: 'true',
          created_for: request.userId || 'unknown',
          correlation_id: request.correlationId || '',
          reservation_id: '' // Will be updated during checkout
        }
      });

      // Store artifact references in database
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + StripeAdapter.ARTIFACT_TTL_HOURS);

      await pool.query(`
        INSERT INTO promotion_artifacts (
          promotion_id, promotion_code_id, gateway,
          external_coupon_id, external_promotion_code_id,
          expires_at, created_for_user, created_for_session
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (promotion_code_id, gateway) 
        DO UPDATE SET
          external_coupon_id = EXCLUDED.external_coupon_id,
          external_promotion_code_id = EXCLUDED.external_promotion_code_id,
          expires_at = EXCLUDED.expires_at,
          created_for_session = EXCLUDED.created_for_session
      `, [
        request.promotionId,
        request.promotionCodeId,
        'stripe',
        stripeCoupon.id,
        stripePromotionCode.id,
        expiresAt.toISOString(),
        request.userId,
        request.sessionId
      ]);

      return {
        success: true,
        stripePromotionCodeId: stripePromotionCode.id,
        stripeCouponId: stripeCoupon.id
      };

    } catch (error) {
      console.error('StripeAdapter createEphemeralArtifact error:', error);

      // Handle Stripe-specific errors
      if (error instanceof Stripe.errors.StripeError) {
        return {
          success: false,
          error: `Stripe error: ${error.message}`,
          errorCode: 'STRIPE_ERROR'
        };
      }

      // Handle duplicate coupon ID (race condition)
      if (error instanceof Error && error.message.includes('already exists')) {
        // Retry with new ID
        const retryRequest = { ...request };
        return this.createEphemeralArtifact(retryRequest);
      }

      return {
        success: false,
        error: 'Failed to create ephemeral artifacts',
        errorCode: 'ARTIFACT_CREATION_ERROR'
      };
    }
  }

  /**
   * Update promotion code metadata with reservation ID
   * Called during checkout to link reservation to Stripe objects
   */
  async updatePromotionCodeMetadata(stripePromotionCodeId: string, reservationId: string): Promise<boolean> {
    try {
      await this.stripe.promotionCodes.update(stripePromotionCodeId, {
        metadata: {
          reservation_id: reservationId
        }
      });
      return true;
    } catch (error) {
      console.error('StripeAdapter updatePromotionCodeMetadata error:', error);
      return false;
    }
  }

  /**
   * Get Stripe promotion code by canonical code
   * Used during checkout validation
   */
  async getStripePromotionCodeByCanonicalCode(code: string): Promise<string | null> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    try {
      const result = await pool.query(`
        SELECT pa.external_promotion_code_id
        FROM promotion_artifacts pa
        JOIN promotion_codes pc ON pa.promotion_code_id = pc.id
        WHERE pc.code_normalized = UPPER(TRIM($1))
        AND pa.gateway = 'stripe'
        AND pa.expires_at > now()
      `, [code]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].external_promotion_code_id;
    } catch (error) {
      console.error('StripeAdapter getStripePromotionCodeByCanonicalCode error:', error);
      return null;
    }
  }

  /**
   * Clean up expired ephemeral artifacts
   * Background job to remove old Stripe objects and database records
   */
  async cleanupExpiredArtifacts(): Promise<CleanupArtifactsResult> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    const errors: string[] = [];
    let cleaned = 0;

    try {
      // Get expired artifacts
      const expiredResult = await pool.query(`
        SELECT id, external_coupon_id, external_promotion_code_id
        FROM promotion_artifacts
        WHERE gateway = 'stripe'
        AND expires_at <= now()
        ORDER BY expires_at ASC
        LIMIT 100
      `);

      for (const artifact of expiredResult.rows) {
        try {
          // Delete Stripe promotion code first (depends on coupon)
          if (artifact.external_promotion_code_id) {
            try {
              await this.stripe.promotionCodes.update(artifact.external_promotion_code_id, {
                active: false
              });
            } catch (stripeError) {
              // Ignore if already deleted or doesn't exist
              if (stripeError instanceof Stripe.errors.StripeInvalidRequestError) {
                console.log(`Stripe promotion code ${artifact.external_promotion_code_id} already deleted or not found`);
              } else {
                throw stripeError;
              }
            }
          }

          // Delete Stripe coupon
          if (artifact.external_coupon_id) {
            try {
              await this.stripe.coupons.del(artifact.external_coupon_id);
            } catch (stripeError) {
              // Ignore if already deleted or doesn't exist
              if (stripeError instanceof Stripe.errors.StripeInvalidRequestError) {
                console.log(`Stripe coupon ${artifact.external_coupon_id} already deleted or not found`);
              } else {
                throw stripeError;
              }
            }
          }

          // Remove database record
          await pool.query(`
            DELETE FROM promotion_artifacts 
            WHERE id = $1
          `, [artifact.id]);

          cleaned++;

        } catch (error) {
          console.error(`Failed to cleanup artifact ${artifact.id}:`, error);
          errors.push(`Artifact ${artifact.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { cleaned, errors };

    } catch (error) {
      console.error('StripeAdapter cleanupExpiredArtifacts error:', error);
      return { 
        cleaned, 
        errors: [...errors, `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Extract reservation ID from Stripe promotion code metadata
   * Used by webhook handlers to link payments to reservations
   */
  async getReservationIdFromStripePromotionCode(stripePromotionCodeId: string): Promise<string | null> {
    try {
      const promotionCode = await this.stripe.promotionCodes.retrieve(stripePromotionCodeId);
      return promotionCode.metadata?.reservation_id || null;
    } catch (error) {
      console.error('StripeAdapter getReservationIdFromStripePromotionCode error:', error);
      return null;
    }
  }

  /**
   * Validate that a Stripe promotion code belongs to our system
   * Security check to prevent external promotion codes from being processed
   */
  async validateStripePromotionCode(stripePromotionCodeId: string): Promise<boolean> {
    try {
      const promotionCode = await this.stripe.promotionCodes.retrieve(stripePromotionCodeId);
      
      // Check if it has our ephemeral metadata
      return !!(promotionCode.metadata?.ephemeral === 'true' &&
                promotionCode.metadata?.promotion_id &&
                promotionCode.metadata?.promotion_code_id);
    } catch (error) {
      console.error('StripeAdapter validateStripePromotionCode error:', error);
      return false;
    }
  }

  /**
   * Get canonical promotion IDs from Stripe promotion code
   * Used by webhook handlers to identify which promotion was used
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async getCanonicalIdsFromStripePromotionCode(stripePromotionCodeId: string): Promise<{
    promotionId?: string | undefined;
    promotionCodeId?: string | undefined;
    reservationId?: string | undefined;
  }> {
    try {
      const promotionCode = await this.stripe.promotionCodes.retrieve(stripePromotionCodeId);
      
      return {
        promotionId: promotionCode.metadata?.promotion_id,
        promotionCodeId: promotionCode.metadata?.promotion_code_id,
        reservationId: promotionCode.metadata?.reservation_id
      };
    } catch (error) {
      console.error('StripeAdapter getCanonicalIdsFromStripePromotionCode error:', error);
      return {};
    }
  }
}

// =====================================================
// Singleton Instance
// =====================================================

export const stripeAdapter = new StripeAdapter();