/**
 * Promotion Provider Adapters
 * 
 * Adapter implementations for each payment provider:
 * - Stripe: Card payments with ephemeral coupons
 * - Fawry: Egyptian cash vouchers
 * - Paymob: Egyptian card payments
 * - STC Pay: Saudi redirect/deeplink payments
 * - PayTabs: Regional card payments
 */

import { Pool } from 'pg';
import { FastifyBaseLogger } from 'fastify';
import Stripe from 'stripe';
import crypto from 'crypto';
import { CheckoutType } from './promoCoreService';

export interface PromotionArtifactParams {
  reservationId: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  currency: string;
  totalAmount: number;
  region: string;
  packageKey: string;
  locale: string;
  expiresAt: Date;
  checkoutType: CheckoutType;
  idempotencyKey: string;
}

export interface ProviderArtifactResult {
  couponId?: string;
  promotionCodeId?: string;
  voucherCode?: string;
  deepLink?: string;
  metadata?: Record<string, any>;
}

export interface CleanupParams {
  couponId?: string;
  promotionCodeId?: string;
}

export abstract class ProviderAdapter {
  protected pool: Pool;
  protected logger: FastifyBaseLogger;

  constructor(pool: Pool, logger: FastifyBaseLogger) {
    this.pool = pool;
    this.logger = logger;
  }

  abstract createPromotionArtifact(params: PromotionArtifactParams): Promise<ProviderArtifactResult>;
  abstract cleanupArtifact?(params: CleanupParams): Promise<void>;
}

/**
 * Stripe Adapter - Card payments with ephemeral coupons
 */
export class StripePromotionAdapter extends ProviderAdapter {
  private stripe: Stripe;

  constructor(pool: Pool, logger: FastifyBaseLogger) {
    super(pool, logger);
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-08-27.basil'
    });
  }

  async createPromotionArtifact(params: PromotionArtifactParams): Promise<ProviderArtifactResult> {
    try {
      // Use idempotency key for Stripe API calls
      const idempotencyOptions = {
        idempotencyKey: params.idempotencyKey
      };

      // Create ephemeral coupon
      const couponParams: Stripe.CouponCreateParams = {
        duration: 'once',
        metadata: {
          reservation_id: params.reservationId,
          region: params.region,
          package_key: params.packageKey,
          checkout_type: params.checkoutType
        }
      };

      if (params.discountType === 'percentage') {
        couponParams.percent_off = params.discountValue;
      } else {
        couponParams.amount_off = params.discountValue;
        couponParams.currency = params.currency.toLowerCase();
      }

      const coupon = await this.stripe.coupons.create(couponParams, idempotencyOptions);

      // Create promotion code with expiry
      const promotionCode = await this.stripe.promotionCodes.create({
        coupon: coupon.id,
        code: `RSRV_${(params.reservationId.split('-')[0] ?? 'UNKNOWN').toUpperCase()}`,
        max_redemptions: 1,
        expires_at: Math.floor(params.expiresAt.getTime() / 1000),
        metadata: {
          reservation_id: params.reservationId
        }
      }, idempotencyOptions);

      // Store in our database for tracking
      await this.pool.query(`
        INSERT INTO promotion_artifacts (
          reservation_id, gateway, external_coupon_id, external_promotion_code_id,
          provider_metadata, expires_at, checkout_type
        ) VALUES ($1, 'stripe', $2, $3, $4, $5, $6)
        ON CONFLICT (gateway, external_coupon_id) DO UPDATE
        SET external_promotion_code_id = EXCLUDED.external_promotion_code_id
      `, [
        params.reservationId,
        coupon.id,
        promotionCode.id,
        JSON.stringify({ 
          idempotency_key: params.idempotencyKey,
          stripe_code: promotionCode.code
        }),
        params.expiresAt,
        params.checkoutType
      ]);

      return {
        couponId: coupon.id,
        promotionCodeId: promotionCode.id,
        metadata: {
          stripeCode: promotionCode.code
        }
      };
    } catch (error) {
      this.logger.error({ error, params }, 'Failed to create Stripe promotion artifact');
      throw error;
    }
  }

  async cleanupArtifact(params: CleanupParams): Promise<void> {
    try {
      if (params.promotionCodeId) {
        // Stripe doesn't allow deletion, but we can deactivate
        await this.stripe.promotionCodes.update(params.promotionCodeId, {
          active: false
        });
      }
      if (params.couponId) {
        await this.stripe.coupons.del(params.couponId);
      }
    } catch (error) {
      this.logger.warn({ error, params }, 'Failed to cleanup Stripe artifacts');
    }
  }
}

/**
 * Fawry Adapter - Egyptian cash vouchers
 */
export class FawryPromotionAdapter extends ProviderAdapter {
  async createPromotionArtifact(params: PromotionArtifactParams): Promise<ProviderArtifactResult> {
    try {
      const discountRef = `FAWRY_${params.reservationId.split('-')[0]}`;
      const voucherCode = this.generateVoucherCode();

      // Store in our system for voucher generation
      await this.pool.query(`
        INSERT INTO promotion_artifacts (
          reservation_id, gateway, external_coupon_id, 
          provider_metadata, expires_at, checkout_type
        ) VALUES ($1, 'fawry', $2, $3, $4, 'voucher')
        ON CONFLICT (gateway, external_coupon_id) DO UPDATE
        SET provider_metadata = EXCLUDED.provider_metadata
      `, [
        params.reservationId,
        discountRef,
        JSON.stringify({
          voucher_code: voucherCode,
          discount_type: params.discountType,
          discount_value: params.discountValue,
          package_key: params.packageKey,
          locale: params.locale,
          idempotency_key: params.idempotencyKey,
          generated_at: new Date().toISOString()
        }),
        params.expiresAt
      ]);

      // In production, integrate with Fawry API
      // For now, return mock voucher details
      return {
        voucherCode,
        metadata: {
          fawryReference: discountRef,
          displayMessage: params.locale === 'ar' 
            ? `كود الخصم: ${voucherCode}` 
            : `Discount Code: ${voucherCode}`,
          expiresAt: params.expiresAt.toISOString()
        }
      };
    } catch (error) {
      this.logger.error({ error, params }, 'Failed to create Fawry promotion artifact');
      throw error;
    }
  }

  private generateVoucherCode(): string {
    // Generate 14-digit voucher code for Fawry
    return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  }

  async cleanupArtifact(params: CleanupParams): Promise<void> {
    // Fawry vouchers cannot be cancelled once generated
    this.logger.debug({ params }, 'Fawry cleanup not applicable for vouchers');
  }
}

/**
 * Paymob Adapter - Egyptian card payments
 */
export class PaymobPromotionAdapter extends ProviderAdapter {
  async createPromotionArtifact(params: PromotionArtifactParams): Promise<ProviderArtifactResult> {
    try {
      const promoRef = `PAYMOB_${params.reservationId.split('-')[0]}`;

      // Store promotion details
      await this.pool.query(`
        INSERT INTO promotion_artifacts (
          reservation_id, gateway, external_coupon_id,
          provider_metadata, expires_at, checkout_type
        ) VALUES ($1, 'paymob', $2, $3, $4, $5)
        ON CONFLICT (gateway, external_coupon_id) DO UPDATE
        SET provider_metadata = EXCLUDED.provider_metadata
      `, [
        params.reservationId,
        promoRef,
        JSON.stringify({
          discount_type: params.discountType,
          discount_value: params.discountValue,
          original_amount: params.totalAmount,
          currency: 'EGP',
          idempotency_key: params.idempotencyKey
        }),
        params.expiresAt,
        params.checkoutType
      ]);

      // In production, integrate with Paymob API to create discount
      // For now, return reference that will be applied at checkout
      return {
        couponId: promoRef,
        metadata: {
          paymobReference: promoRef,
          applyAtCheckout: true
        }
      };
    } catch (error) {
      this.logger.error({ error, params }, 'Failed to create Paymob promotion artifact');
      throw error;
    }
  }

  async cleanupArtifact(params: CleanupParams): Promise<void> {
    // Paymob discounts are applied at checkout, no external cleanup needed
    this.logger.debug({ params }, 'Paymob cleanup not required');
  }
}

/**
 * STC Pay Adapter - Saudi redirect/deeplink payments
 */
export class STCPayPromotionAdapter extends ProviderAdapter {
  async createPromotionArtifact(params: PromotionArtifactParams): Promise<ProviderArtifactResult> {
    try {
      const promoRef = `STCPAY_${params.reservationId.split('-')[0]}`;
      
      // Generate deeplink for mobile app
      const deepLink = this.generateDeepLink(params);

      await this.pool.query(`
        INSERT INTO promotion_artifacts (
          reservation_id, gateway, external_coupon_id,
          provider_metadata, expires_at, checkout_type
        ) VALUES ($1, 'stcpay', $2, $3, $4, 'redirect')
        ON CONFLICT (gateway, external_coupon_id) DO UPDATE
        SET provider_metadata = EXCLUDED.provider_metadata
      `, [
        params.reservationId,
        promoRef,
        JSON.stringify({
          deep_link: deepLink,
          discount_type: params.discountType,
          discount_value: params.discountValue,
          currency: 'SAR',
          idempotency_key: params.idempotencyKey,
          locale: params.locale
        }),
        params.expiresAt
      ]);

      return {
        deepLink,
        metadata: {
          stcPayReference: promoRef,
          redirectUrl: deepLink,
          mobileAppScheme: 'stcpay://'
        }
      };
    } catch (error) {
      this.logger.error({ error, params }, 'Failed to create STC Pay promotion artifact');
      throw error;
    }
  }

  private generateDeepLink(params: PromotionArtifactParams): string {
    // In production, generate actual STC Pay deeplink
    // For now, return mock deeplink
    const baseUrl = process.env.STCPAY_DEEPLINK_BASE || 'stcpay://pay';
    const queryParams = new URLSearchParams({
      reservation: params.reservationId,
      discount: params.discountValue.toString(),
      type: params.discountType,
      expires: params.expiresAt.getTime().toString()
    });
    
    return `${baseUrl}?${queryParams.toString()}`;
  }

  async cleanupArtifact(params: CleanupParams): Promise<void> {
    // STC Pay deeplinks expire automatically, no cleanup needed
    this.logger.debug({ params }, 'STC Pay cleanup not required');
  }
}

/**
 * PayTabs Adapter - Regional card payments
 */
export class PayTabsPromotionAdapter extends ProviderAdapter {
  async createPromotionArtifact(params: PromotionArtifactParams): Promise<ProviderArtifactResult> {
    try {
      const promoRef = `PAYTABS_${params.reservationId.split('-')[0]}`;

      await this.pool.query(`
        INSERT INTO promotion_artifacts (
          reservation_id, gateway, external_coupon_id,
          provider_metadata, expires_at, checkout_type
        ) VALUES ($1, 'paytabs', $2, $3, $4, $5)
        ON CONFLICT (gateway, external_coupon_id) DO UPDATE
        SET provider_metadata = EXCLUDED.provider_metadata
      `, [
        params.reservationId,
        promoRef,
        JSON.stringify({
          discount_type: params.discountType,
          discount_value: params.discountValue,
          currency: params.currency,
          region: params.region,
          idempotency_key: params.idempotencyKey,
          created_at: new Date().toISOString()
        }),
        params.expiresAt,
        params.checkoutType
      ]);

      // In production, integrate with PayTabs API
      // For now, return reference for checkout application
      return {
        couponId: promoRef,
        metadata: {
          payTabsReference: promoRef,
          supportedCards: ['visa', 'mastercard', 'mada'],
          region: params.region
        }
      };
    } catch (error) {
      this.logger.error({ error, params }, 'Failed to create PayTabs promotion artifact');
      throw error;
    }
  }

  async cleanupArtifact(params: CleanupParams): Promise<void> {
    // PayTabs promotions are reference-based, no external cleanup needed
    this.logger.debug({ params }, 'PayTabs cleanup not required');
  }
}

export default {
  StripePromotionAdapter,
  FawryPromotionAdapter,
  PaymobPromotionAdapter,
  STCPayPromotionAdapter,
  PayTabsPromotionAdapter
};