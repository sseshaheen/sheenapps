/**
 * PromoCore Service - Canonical Promotion System
 *
 * Implements the core promotion logic with reserve-commit pattern,
 * validation, and integration with ephemeral gateway artifacts.
 *
 * Architecture:
 * - Canonical control plane (source of truth)
 * - Reserve-commit pattern for atomic operations
 * - Gateway-agnostic with adapter pattern
 * - Comprehensive validation and error handling
 */

import { createHash } from 'crypto';
import { pool } from '../database';

// =====================================================
// Types and Interfaces
// =====================================================

export type PromotionDiscountType = 'percentage' | 'fixed_amount';
export type PromotionStatus = 'active' | 'paused' | 'expired' | 'disabled';
export type ReservationStatus = 'reserved' | 'committed' | 'released' | 'expired';

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  discount_type: PromotionDiscountType;
  discount_value: number;
  max_total_uses?: number;
  max_uses_per_user: number;
  current_uses: number;
  valid_from: string;
  valid_until?: string;
  status: PromotionStatus;
  created_by: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PromotionCode {
  id: string;
  promotion_id: string;
  code: string;
  code_normalized: string;
  current_uses: number;
  max_uses?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromotionReservation {
  id: string;
  promotion_id: string;
  promotion_code_id: string;
  user_id: string;
  status: ReservationStatus;
  cart_hash: string;
  reserved_amount: number;
  expires_at: string;
  committed_at?: string;
  stripe_payment_intent_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ValidationRequest {
  code: string;
  userId: string;
  cartTotal: number; // in minor units
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  currency?: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  promotion?: Promotion;
  promotionCode?: PromotionCode;
  discountAmount?: number; // calculated discount in minor units
  error?: string;
  errorCode?: string;
}

export interface ReservationRequest {
  code: string;
  userId: string;
  cartTotal: number; // in minor units
  cartItems: any[]; // for hash generation
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  currency?: string | undefined;
  correlationId?: string | undefined;
}

export interface ReservationResult {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reservation?: PromotionReservation | undefined;
  discountAmount?: number | undefined;
  error?: string | undefined;
  errorCode?: string | undefined;
}

export interface CommitRequest {
  reservationId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  stripePaymentIntentId?: string | undefined;
  stripeSessionId?: string | undefined;
}

export interface CommitResult {
  success: boolean;
  redemptionId?: string;
  error?: string;
  errorCode?: string;
}

// =====================================================
// Error Classes
// =====================================================

export class PromoError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PromoError';
  }
}

// =====================================================
// PromoCore Service
// =====================================================

export class PromoCore {
  private static readonly RESERVATION_TTL_MINUTES = 30;
  private static readonly CLEANUP_BATCH_SIZE = 1000;

  /**
   * Validate a promotion code for a given user and cart
   * Does not create reservations - read-only validation
   */
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    try {
      // Find promotion code (case-insensitive)
      const codeResult = await pool.query(`
        SELECT
          pc.id, pc.promotion_id, pc.code, pc.current_uses, pc.max_uses, pc.is_active,
          p.name, p.description, p.discount_type, p.discount_value,
          p.max_total_uses, p.max_uses_per_user, p.current_uses as promotion_uses,
          p.valid_from, p.valid_until, p.status
        FROM promotion_codes pc
        JOIN promotions p ON pc.promotion_id = p.id
        WHERE pc.code_normalized = UPPER(TRIM($1))
        AND pc.is_active = true
      `, [request.code]);

      if (codeResult.rows.length === 0) {
        return {
          valid: false,
          error: 'Promotion code not found',
          errorCode: 'CODE_NOT_FOUND'
        };
      }

      const row = codeResult.rows[0];
      const promotion: Promotion = {
        id: row.promotion_id,
        name: row.name,
        description: row.description,
        discount_type: row.discount_type,
        discount_value: row.discount_value,
        max_total_uses: row.max_total_uses,
        max_uses_per_user: row.max_uses_per_user,
        current_uses: row.promotion_uses,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        status: row.status,
        created_by: '', // Not needed for validation
        created_at: '',
        updated_at: ''
      };

      const promotionCode: PromotionCode = {
        id: row.id,
        promotion_id: row.promotion_id,
        code: row.code,
        code_normalized: request.code.toUpperCase().trim(),
        current_uses: row.current_uses,
        max_uses: row.max_uses,
        is_active: row.is_active,
        created_at: '',
        updated_at: ''
      };

      // Validate promotion status
      if (promotion.status !== 'active') {
        return {
          valid: false,
          promotion,
          promotionCode,
          error: `Promotion is ${promotion.status}`,
          errorCode: 'PROMOTION_NOT_ACTIVE'
        };
      }

      // Validate time window
      const now = new Date();
      const validFrom = new Date(promotion.valid_from);
      const validUntil = promotion.valid_until ? new Date(promotion.valid_until) : null;

      if (now < validFrom) {
        return {
          valid: false,
          promotion,
          promotionCode,
          error: 'Promotion not yet active',
          errorCode: 'PROMOTION_NOT_STARTED'
        };
      }

      if (validUntil && now > validUntil) {
        return {
          valid: false,
          promotion,
          promotionCode,
          error: 'Promotion has expired',
          errorCode: 'PROMOTION_EXPIRED'
        };
      }

      // Check total usage limits
      if (promotion.max_total_uses && promotion.current_uses >= promotion.max_total_uses) {
        return {
          valid: false,
          promotion,
          promotionCode,
          error: 'Promotion usage limit reached',
          errorCode: 'USAGE_LIMIT_REACHED'
        };
      }

      // Check code-specific usage limits
      const codeMaxUses = promotionCode.max_uses || promotion.max_uses_per_user;
      if (codeMaxUses && promotionCode.current_uses >= codeMaxUses) {
        return {
          valid: false,
          promotion,
          promotionCode,
          error: 'Code usage limit reached',
          errorCode: 'CODE_USAGE_LIMIT_REACHED'
        };
      }

      // Check per-user usage limits
      if (promotion.max_uses_per_user) {
        const userUsage = await pool.query(`
          SELECT COUNT(*)::int as usage_count
          FROM promotion_redemptions
          WHERE promotion_id = $1
          AND user_id = $2
        `, [promotion.id, request.userId]);

        if (userUsage.rows[0].usage_count >= promotion.max_uses_per_user) {
          return {
            valid: false,
            promotion,
            promotionCode,
            error: 'User usage limit reached',
            errorCode: 'USER_USAGE_LIMIT_REACHED'
          };
        }
      }

      // Calculate discount amount
      let discountAmount: number;
      if (promotion.discount_type === 'percentage') {
        discountAmount = Math.floor((request.cartTotal * promotion.discount_value) / 100);
      } else {
        discountAmount = Math.min(promotion.discount_value, request.cartTotal);
      }

      return {
        valid: true,
        promotion,
        promotionCode,
        discountAmount
      };

    } catch (error) {
      console.error('PromoCore validation error:', error);
      return {
        valid: false,
        error: 'Internal validation error',
        errorCode: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Reserve a promotion for checkout (reserve-commit pattern)
   * Creates atomic reservation with TTL
   */
  async reserve(request: ReservationRequest): Promise<ReservationResult> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    try {
      // Generate cart hash for idempotency
      const cartHash = this.generateCartHash(request.cartItems, request.cartTotal);

      // Check for existing reservation (idempotency)
      const existing = await pool.query(`
        SELECT * FROM promotion_reservations
        WHERE user_id = $1
        AND cart_hash = $2
        AND status = 'reserved'
        AND expires_at > now()
      `, [request.userId, cartHash]);

      if (existing.rows.length > 0) {
        return {
          success: true,
          reservation: existing.rows[0],
          discountAmount: existing.rows[0].reserved_amount
        };
      }

      // Validate the promotion code first
      const validation = await this.validate({
        code: request.code,
        userId: request.userId,
        cartTotal: request.cartTotal,
        currency: request.currency
      });

      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          errorCode: validation.errorCode
        };
      }

      // Create reservation with TTL
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + PromoCore.RESERVATION_TTL_MINUTES);

      const reservation = await pool.query(`
        INSERT INTO promotion_reservations (
          promotion_id, promotion_code_id, user_id, cart_hash,
          reserved_amount, expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
        RETURNING *
      `, [
        validation.promotion!.id,
        validation.promotionCode!.id,
        request.userId,
        cartHash,
        validation.discountAmount!,
        expiresAt.toISOString()
      ]);

      return {
        success: true,
        reservation: reservation.rows[0],
        discountAmount: validation.discountAmount
      };

    } catch (error) {
      console.error('PromoCore reservation error:', error);

      // Handle duplicate key errors (race condition)
      if (error instanceof Error && error.message.includes('duplicate key')) {
        // Try to find the existing reservation
        const cartHash = this.generateCartHash(request.cartItems, request.cartTotal);
        const existing = await pool.query(`
          SELECT * FROM promotion_reservations
          WHERE user_id = $1
          AND cart_hash = $2
          AND status = 'reserved'
          AND expires_at > now()
        `, [request.userId, cartHash]);

        if (existing.rows.length > 0) {
          return {
            success: true,
            reservation: existing.rows[0],
            discountAmount: existing.rows[0].reserved_amount
          };
        }
      }

      return {
        success: false,
        error: 'Failed to create reservation',
        errorCode: 'RESERVATION_ERROR'
      };
    }
  }

  /**
   * Commit a reservation after successful payment
   * Creates redemption record and updates counters
   */
  async commit(request: CommitRequest): Promise<CommitResult> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get reservation details
      const reservation = await client.query(`
        SELECT r.*, p.discount_type, pc.code
        FROM promotion_reservations r
        JOIN promotions p ON r.promotion_id = p.id
        JOIN promotion_codes pc ON r.promotion_code_id = pc.id
        WHERE r.id = $1
        AND r.status = 'reserved'
        AND r.expires_at > now()
      `, [request.reservationId]);

      if (reservation.rows.length === 0) {
        throw new PromoError('RESERVATION_NOT_FOUND', 'Valid reservation not found');
      }

      const res = reservation.rows[0];

      // Update reservation status to committed
      await client.query(`
        UPDATE promotion_reservations
        SET status = 'committed',
            committed_at = now(),
            stripe_payment_intent_id = $1
        WHERE id = $2
      `, [request.stripePaymentIntentId, request.reservationId]);

      // Create redemption record
      const redemption = await client.query(`
        INSERT INTO promotion_redemptions (
          promotion_id, promotion_code_id, reservation_id, user_id,
          discount_applied_amount, original_amount, final_amount,
          stripe_payment_intent_id, stripe_session_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        RETURNING id
      `, [
        res.promotion_id,
        res.promotion_code_id,
        res.id,
        res.user_id,
        res.reserved_amount,
        res.reserved_amount, // We'll calculate this properly in real implementation
        0, // We'll calculate this properly in real implementation
        request.stripePaymentIntentId,
        request.stripeSessionId
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        redemptionId: redemption.rows[0].id
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('PromoCore commit error:', error);

      if (error instanceof PromoError) {
        return {
          success: false,
          error: error.message,
          errorCode: error.code
        };
      }

      return {
        success: false,
        error: 'Failed to commit reservation',
        errorCode: 'COMMIT_ERROR'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Release a reservation (cancel checkout)
   * Marks reservation as released
   */
  async release(reservationId: string): Promise<{ success: boolean; error?: string }> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    try {
      const result = await pool.query(`
        UPDATE promotion_reservations
        SET status = 'released', updated_at = now()
        WHERE id = $1
        AND status = 'reserved'
        AND expires_at > now()
      `, [reservationId]);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Reservation not found or already processed'
        };
      }

      return { success: true };

    } catch (error) {
      console.error('PromoCore release error:', error);
      return {
        success: false,
        error: 'Failed to release reservation'
      };
    }
  }

  /**
   * Get promotion by code (for admin/debugging)
   */
  async getPromotionByCode(code: string): Promise<{ promotion?: Promotion; promotionCode?: PromotionCode; error?: string }> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    try {
      const result = await pool.query(`
        SELECT
          p.*, pc.id as code_id, pc.code, pc.current_uses as code_uses,
          pc.max_uses as code_max_uses, pc.is_active as code_active
        FROM promotion_codes pc
        JOIN promotions p ON pc.promotion_id = p.id
        WHERE pc.code_normalized = UPPER(TRIM($1))
      `, [code]);

      if (result.rows.length === 0) {
        return { error: 'Promotion code not found' };
      }

      const row = result.rows[0];
      return {
        promotion: {
          id: row.id,
          name: row.name,
          description: row.description,
          discount_type: row.discount_type,
          discount_value: row.discount_value,
          max_total_uses: row.max_total_uses,
          max_uses_per_user: row.max_uses_per_user,
          current_uses: row.current_uses,
          valid_from: row.valid_from,
          valid_until: row.valid_until,
          status: row.status,
          created_by: row.created_by,
          notes: row.notes,
          created_at: row.created_at,
          updated_at: row.updated_at
        },
        promotionCode: {
          id: row.code_id,
          promotion_id: row.id,
          code: row.code,
          code_normalized: code.toUpperCase().trim(),
          current_uses: row.code_uses,
          max_uses: row.code_max_uses,
          is_active: row.code_active,
          created_at: '',
          updated_at: ''
        }
      };

    } catch (error) {
      console.error('PromoCore getPromotionByCode error:', error);
      return { error: 'Failed to fetch promotion' };
    }
  }

  /**
   * Cleanup expired reservations (background job)
   */
  async cleanupExpiredReservations(): Promise<{ cleaned: number; error?: string }> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    try {
      const result = await pool.query(`
        UPDATE promotion_reservations
        SET status = 'expired', updated_at = now()
        WHERE status = 'reserved'
        AND expires_at <= now()
      `);

      return { cleaned: result.rowCount || 0 };

    } catch (error) {
      console.error('PromoCore cleanup error:', error);
      return {
        cleaned: 0,
        error: 'Failed to cleanup expired reservations'
      };
    }
  }

  /**
   * Generate deterministic cart hash for idempotency
   */
  private generateCartHash(cartItems: any[], cartTotal: number): string {
    const cartData = {
      items: cartItems.map(item => ({
        id: item.id || item.product_id,
        quantity: item.quantity || 1,
        price: item.price
      })),
      total: cartTotal
    };

    return createHash('sha256')
      .update(JSON.stringify(cartData))
      .digest('hex')
      .substring(0, 32); // First 32 chars for db storage
  }
}

// =====================================================
// Singleton Instance
// =====================================================

export const promoCore = new PromoCore();
