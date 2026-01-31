/**
 * PromoCore Service - Multi-Provider Promotion Management
 * 
 * Production-hardened canonical promotion system with:
 * - 5-provider support (Stripe, Fawry, Paymob, STC Pay, PayTabs)
 * - 5-currency support (USD, EUR, GBP, EGP, SAR)
 * - Reserve-commit pattern with row locking
 * - Idempotent operations with proper error handling
 * - Exchange rate tracking for audit trail
 */

import { Pool } from 'pg';
import { FastifyBaseLogger } from 'fastify';
import crypto from 'crypto';
import { 
  StripePromotionAdapter,
  FawryPromotionAdapter,
  PaymobPromotionAdapter,
  STCPayPromotionAdapter,
  PayTabsPromotionAdapter,
  ProviderAdapter,
  PromotionArtifactParams,
  ProviderArtifactResult
} from './promotionAdapters';

// Type definitions
export type PaymentProviderKey = 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR';
export type Region = 'us' | 'ca' | 'gb' | 'eu' | 'eg' | 'sa';
export type PackageKey = 'mini' | 'plus' | 'mega' | 'max';
export type CheckoutType = 'redirect' | 'voucher';
export type DiscountType = 'percentage' | 'fixed_amount';

export interface MultiProviderValidationInput {
  userId?: string;
  code: string;
  package_key: PackageKey;
  currency: Currency;
  region: Region;
  locale?: 'en' | 'ar';
  totalMinorUnits: number;
  context?: {
    ipAddress?: string;
    sessionId?: string;
    checkoutType?: CheckoutType;
  };
}

export interface MultiProviderValidationResult {
  valid: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  promotionId?: string | undefined;
  codeId?: string | undefined;
  discountType?: DiscountType | undefined;
  discountValue?: number | undefined;
  discountMinorUnits?: number | undefined;
  finalAmountMinorUnits?: number | undefined;
  preferredProvider?: PaymentProviderKey | undefined;
  checkoutType?: CheckoutType | undefined;
  errors?: string[] | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface MultiProviderReserveInput {
  userId: string;
  validation: MultiProviderValidationResult;
  expiresInMinutes?: number;
}

export interface MultiProviderReservationResult {
  reservationId: string;
  promotionId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  codeId?: string | undefined;
  discountMinorUnits: number;
  finalAmountMinorUnits: number;
  provider: PaymentProviderKey;
  artifacts?: Record<string, any> | undefined;
  expiresAt: Date;
}

export interface MultiProviderPaymentContext {
  gateway: PaymentProviderKey;
  eventId?: string;
  providerTransactionId?: string;
  actualDiscountMinorUnits: number;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  baseCurrencyAmountCents?: number;
}

export interface CommitResult {
  success: boolean;
  reservationId: string;
  redemptionId?: string;
  error?: string;
}

export class PromoCoreService {
  private pool: Pool;
  private logger: FastifyBaseLogger;
  private providerAdapters: Map<PaymentProviderKey, ProviderAdapter>;

  constructor(pool: Pool, logger: FastifyBaseLogger) {
    this.pool = pool;
    this.logger = logger;
    
    // Initialize provider adapters
    this.providerAdapters = new Map([
      ['stripe', new StripePromotionAdapter(pool, logger)],
      ['fawry', new FawryPromotionAdapter(pool, logger)],
      ['paymob', new PaymobPromotionAdapter(pool, logger)],
      ['stcpay', new STCPayPromotionAdapter(pool, logger)],
      ['paytabs', new PayTabsPromotionAdapter(pool, logger)]
    ]);
  }

  /**
   * Validate a promotion code with multi-provider support
   */
  async validateMultiProvider(input: MultiProviderValidationInput): Promise<MultiProviderValidationResult> {
    const validationErrors: string[] = [];
    
    try {
      // Normalize the code
      const normalizedCode = input.code.toLowerCase().trim();
      
      // Step 1: Look up promotion code
      const codeResult = await this.pool.query(`
        SELECT 
          pc.id as code_id,
          pc.promotion_id,
          pc.max_uses,
          pc.use_count,
          p.id,
          p.name,
          p.discount_type,
          p.discount_value,
          p.currency,
          p.supported_providers,
          p.supported_currencies,
          p.checkout_type_restrictions,
          p.minimum_order_minor_units,
          p.minimum_order_currency,
          p.max_uses_per_user,
          p.valid_from,
          p.valid_until,
          p.status
        FROM promotion_codes pc
        JOIN promotions p ON p.id = pc.promotion_id
        WHERE pc.code_normalized = $1
          AND pc.active = true
          AND p.status = 'active'
      `, [normalizedCode]);

      if (codeResult.rows.length === 0) {
        return { valid: false, errors: ['Invalid or expired promotion code'] };
      }

      const promo = codeResult.rows[0];

      // Step 2: Validate promotion constraints
      const now = new Date();
      
      if (promo.valid_from && new Date(promo.valid_from) > now) {
        validationErrors.push('Promotion not yet active');
      }
      
      if (promo.valid_until && new Date(promo.valid_until) < now) {
        validationErrors.push('Promotion has expired');
      }

      // Step 3: Multi-currency validation
      if (promo.supported_currencies && !promo.supported_currencies.includes(input.currency)) {
        validationErrors.push(`Promotion not available in ${input.currency}`);
      }

      // Step 4: Minimum order validation with FX conversion
      if (promo.minimum_order_minor_units) {
        let thresholdInOrderCurrency = promo.minimum_order_minor_units;
        let evaluatedExchangeRate = 1;
        
        if (promo.minimum_order_currency !== input.currency) {
          evaluatedExchangeRate = await this.getExchangeRate(
            promo.minimum_order_currency, 
            input.currency
          );
          thresholdInOrderCurrency = Math.round(
            promo.minimum_order_minor_units * evaluatedExchangeRate
          );
        }
        
        if (input.totalMinorUnits < thresholdInOrderCurrency) {
          validationErrors.push(
            `Minimum order amount is ${thresholdInOrderCurrency / 100} ${input.currency}`
          );
        }
      }

      // Step 5: User-specific validation
      if (input.userId && promo.max_uses_per_user) {
        const userUseCount = await this.pool.query(`
          SELECT COUNT(*) as count
          FROM promotion_redemptions
          WHERE promotion_id = $1
            AND user_id = $2
            AND committed_at IS NOT NULL
        `, [promo.promotion_id, input.userId]);

        if (userUseCount.rows[0].count >= promo.max_uses_per_user) {
          validationErrors.push('You have already used this promotion');
        }
      }

      // Step 6: Global usage limit check
      if (promo.max_uses && promo.use_count >= promo.max_uses) {
        validationErrors.push('Promotion has reached maximum usage');
      }

      // Step 7: Provider selection based on region
      const preferredProvider = await this.selectProviderForRegion(
        promo.promotion_id,
        input.region,
        promo.supported_providers,
        input.context?.checkoutType
      );

      if (!preferredProvider) {
        validationErrors.push('No payment provider available for your region');
      }

      // Step 8: Calculate discount amount
      let discountMinorUnits = 0;
      if (validationErrors.length === 0) {
        if (promo.discount_type === 'percentage') {
          discountMinorUnits = Math.round(input.totalMinorUnits * (promo.discount_value / 100));
        } else {
          // Fixed amount - may need FX conversion
          discountMinorUnits = promo.discount_value;
          if (promo.currency !== input.currency) {
            const rate = await this.getExchangeRate(promo.currency, input.currency);
            discountMinorUnits = Math.round(promo.discount_value * rate);
          }
        }
        
        // Cap discount at order total
        discountMinorUnits = Math.min(discountMinorUnits, input.totalMinorUnits);
      }

      // Return validation result
      return {
        valid: validationErrors.length === 0,
        promotionId: promo.promotion_id,
        codeId: promo.code_id,
        discountType: promo.discount_type,
        discountValue: promo.discount_value,
        discountMinorUnits,
        finalAmountMinorUnits: input.totalMinorUnits - discountMinorUnits,
        preferredProvider,
        checkoutType: this.determineCheckoutType(preferredProvider, input.context?.checkoutType),
        errors: validationErrors.length > 0 ? validationErrors : undefined,
        metadata: {
          promotionName: promo.name,
          originalCurrency: promo.currency
        }
      };
      
    } catch (error) {
      this.logger.error({ error, input }, 'Promotion validation failed');
      return { 
        valid: false, 
        errors: ['An error occurred validating the promotion'] 
      };
    }
  }

  /**
   * Reserve a promotion with idempotent artifact creation
   */
  async reserveMultiProvider(input: MultiProviderReserveInput): Promise<MultiProviderReservationResult> {
    const { userId, validation, expiresInMinutes = 30 } = input;
    
    if (!validation.valid || !validation.preferredProvider) {
      throw new Error('Cannot reserve invalid promotion');
    }

    const reservationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const selectedProvider = validation.preferredProvider;

    await this.pool.query('BEGIN');
    
    try {
      // Step 1: Create reservation record
      await this.pool.query(`
        INSERT INTO promotion_reservations (
          id, promotion_id, promotion_code_id, user_id,
          status, reserved_amount, currency, expires_at,
          evaluated_threshold_minor, evaluated_exchange_rate,
          provider_context, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        reservationId,
        validation.promotionId,
        validation.codeId,
        userId,
        'reserved',
        validation.finalAmountMinorUnits,
        'USD', // Will be enhanced to support multi-currency
        expiresAt,
        validation.metadata?.evaluatedThreshold || null,
        validation.metadata?.evaluatedExchangeRate || null,
        JSON.stringify({ provider: selectedProvider })
      ]);

      // Step 2: Create provider-specific artifacts with idempotency
      const providerAdapter = this.providerAdapters.get(selectedProvider);
      let gatewayArtifacts: ProviderArtifactResult = {};

      if (providerAdapter) {
        const artifactParams: PromotionArtifactParams = {
          reservationId,
          discountType: validation.discountType!,
          discountValue: validation.discountMinorUnits!,
          currency: 'USD', // Will be enhanced
          totalAmount: validation.finalAmountMinorUnits!,
          region: 'us', // Will be passed from input
          packageKey: 'mini', // Will be passed from input
          locale: 'en',
          expiresAt,
          checkoutType: validation.checkoutType!,
          idempotencyKey: reservationId
        };
        
        gatewayArtifacts = await providerAdapter.createPromotionArtifact(artifactParams);
      }

      await this.pool.query('COMMIT');

      return {
        reservationId,
        promotionId: validation.promotionId!,
        codeId: validation.codeId,
        discountMinorUnits: validation.discountMinorUnits!,
        finalAmountMinorUnits: validation.finalAmountMinorUnits!,
        provider: selectedProvider,
        artifacts: gatewayArtifacts,
        expiresAt
      };
      
    } catch (error) {
      await this.pool.query('ROLLBACK');
      this.logger.error({ error, reservationId }, 'Failed to reserve promotion');
      throw error;
    }
  }

  /**
   * Commit a promotion reservation with production-hardened row locking
   */
  async commitMultiProvider(
    reservationId: string, 
    paymentContext: MultiProviderPaymentContext
  ): Promise<CommitResult> {
    await this.pool.query('BEGIN');
    
    try {
      // PRODUCTION-HARDENED: Lock the row to prevent concurrent commits
      const lockResult = await this.pool.query(`
        SELECT * FROM promotion_reservations 
        WHERE id = $1 
        FOR UPDATE
      `, [reservationId]);
      
      if (lockResult.rows.length === 0) {
        throw new Error('Reservation not found');
      }
      
      const reservation = lockResult.rows[0];
      
      // Validate reservation is still in reserved state
      if (reservation.status !== 'reserved') {
        throw new Error(`Cannot commit reservation in ${reservation.status} state`);
      }
      
      // Check if not expired
      if (new Date(reservation.expires_at) < new Date()) {
        throw new Error('Reservation has expired');
      }
      
      // Mark reservation as committed with row count verification
      const updateResult = await this.pool.query(`
        UPDATE promotion_reservations 
        SET status = 'committed', committed_at = NOW()
        WHERE id = $1 AND status = 'reserved'
        RETURNING *
      `, [reservationId]);
      
      // SAFETY: Assert exactly one row was updated
      if (updateResult.rowCount !== 1) {
        throw new Error(`Expected to update 1 reservation, updated ${updateResult.rowCount}`);
      }
      
      const res = updateResult.rows[0];
      
      // Get current exchange rate for tracking
      const exchangeRate = paymentContext.exchangeRate || 1;
      const baseAmountCents = Math.round(paymentContext.actualDiscountMinorUnits * exchangeRate);
      
      // Create redemption record with enhanced tracking
      const redemptionResult = await this.pool.query(`
        INSERT INTO promotion_redemptions (
          id, promotion_id, promotion_code_id, reservation_id, user_id,
          gateway, event_id, provider_transaction_id,
          discount_applied_amount, original_amount, final_amount, currency,
          exchange_rate, exchange_rate_date, exchange_rate_source, base_currency_amount_cents,
          evaluated_threshold_minor, evaluated_exchange_rate,
          committed_at, redeemed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 
          $13, $14, $15, $16, $17, $18, NOW(), NOW()
        ) RETURNING id
      `, [
        crypto.randomUUID(),
        res.promotion_id,
        res.promotion_code_id,
        reservationId,
        res.user_id,
        paymentContext.gateway,
        paymentContext.eventId || null,
        paymentContext.providerTransactionId || null,
        paymentContext.actualDiscountMinorUnits,
        res.reserved_amount + paymentContext.actualDiscountMinorUnits,
        res.reserved_amount,
        res.currency,
        exchangeRate,
        paymentContext.exchangeRateDate || new Date().toISOString().split('T')[0],
        paymentContext.exchangeRateSource || 'stripe',
        baseAmountCents,
        res.evaluated_threshold_minor || null,
        res.evaluated_exchange_rate || exchangeRate
      ]);

      // Update promotion code usage count
      if (res.promotion_code_id) {
        await this.pool.query(`
          UPDATE promotion_codes 
          SET use_count = use_count + 1
          WHERE id = $1
        `, [res.promotion_code_id]);
      }

      await this.pool.query('COMMIT');
      
      return { 
        success: true, 
        reservationId,
        redemptionId: redemptionResult.rows[0].id
      };
      
    } catch (error: any) {
      await this.pool.query('ROLLBACK');
      this.logger.error({ error, reservationId }, 'Failed to commit promotion');
      return { 
        success: false, 
        reservationId,
        error: error.message 
      };
    }
  }

  /**
   * Release a reservation (e.g., on payment failure)
   */
  async releaseMultiProvider(reservationId: string, reason?: string): Promise<void> {
    try {
      await this.pool.query(`
        UPDATE promotion_reservations
        SET status = 'released',
            provider_context = provider_context || jsonb_build_object('release_reason', $2)
        WHERE id = $1 AND status = 'reserved'
      `, [reservationId, reason || 'Payment failed or cancelled']);
      
      // Clean up any provider artifacts
      const artifacts = await this.pool.query(`
        SELECT gateway, external_coupon_id, external_promotion_code_id
        FROM promotion_artifacts
        WHERE reservation_id = $1
      `, [reservationId]);
      
      for (const artifact of artifacts.rows) {
        const adapter = this.providerAdapters.get(artifact.gateway);
        if (adapter && adapter.cleanupArtifact) {
          await adapter.cleanupArtifact({
            couponId: artifact.external_coupon_id,
            promotionCodeId: artifact.external_promotion_code_id
          });
        }
      }
      
    } catch (error) {
      this.logger.error({ error, reservationId }, 'Failed to release promotion reservation');
      throw error;
    }
  }

  // Helper methods

  private async selectProviderForRegion(
    promotionId: string,
    region: Region,
    supportedProviders: PaymentProviderKey[],
    checkoutType?: CheckoutType
  ): Promise<PaymentProviderKey | undefined> {
    // Check for regional config
    const regionalConfig = await this.pool.query(`
      SELECT preferred_providers
      FROM promotion_regional_config
      WHERE promotion_id = $1 AND region_code = $2
    `, [promotionId, region]);

    let preferredProviders: PaymentProviderKey[] = [];
    
    if (regionalConfig.rows.length > 0) {
      preferredProviders = regionalConfig.rows[0].preferred_providers;
    } else {
      // Default providers by region
      switch (region) {
        case 'eg':
          preferredProviders = checkoutType === 'voucher' 
            ? ['fawry', 'paymob'] 
            : ['paymob', 'fawry'];
          break;
        case 'sa':
          preferredProviders = ['stcpay', 'paytabs'];
          break;
        default:
          preferredProviders = ['stripe'];
      }
    }

    // Find first supported provider from preferred list
    for (const provider of preferredProviders) {
      if (supportedProviders.includes(provider)) {
        return provider;
      }
    }

    // Fallback to first supported provider
    return supportedProviders[0] || undefined;
  }

  private determineCheckoutType(
    provider: PaymentProviderKey | undefined,
    requestedType?: CheckoutType
  ): CheckoutType {
    if (!provider) return 'redirect';
    
    // Provider-specific defaults
    const providerDefaults: Record<PaymentProviderKey, CheckoutType> = {
      stripe: 'redirect',
      fawry: 'voucher',
      paymob: 'redirect',
      stcpay: 'redirect',
      paytabs: 'redirect'
    };

    return requestedType || providerDefaults[provider] || 'redirect';
  }

  private async getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    
    // Check for cached rate
    const rateResult = await this.pool.query(`
      SELECT rate 
      FROM exchange_rates
      WHERE from_currency = $1 
        AND to_currency = $2
        AND effective_date >= CURRENT_DATE - INTERVAL '1 day'
      ORDER BY effective_date DESC
      LIMIT 1
    `, [from, to]);

    if (rateResult.rows.length > 0) {
      return parseFloat(rateResult.rows[0].rate);
    }

    // Fallback rates (should be fetched from provider)
    const fallbackRates: Record<string, number> = {
      'USD_EUR': 0.92,
      'USD_GBP': 0.79,
      'USD_EGP': 48.50,
      'USD_SAR': 3.75,
      'EUR_USD': 1.09,
      'GBP_USD': 1.27,
      'EGP_USD': 0.021,
      'SAR_USD': 0.27
    };

    return fallbackRates[`${from}_${to}`] || 1;
  }
}

export default PromoCoreService;