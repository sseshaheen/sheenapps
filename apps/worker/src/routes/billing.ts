import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { aiTimeBillingService } from '../services/aiTimeBillingService';
import { enhancedAITimeBillingService, EnhancedUserBalance, InsufficientFundsError } from '../services/enhancedAITimeBillingService';
import { metricsService } from '../services/metricsService';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { pricingCatalogService, PricingCatalog } from '../services/pricingCatalogService';
import { CurrencyConversionService } from '../services/currencyConversionService';
import { beautifyMinor, displayToMinor, minorToDisplay } from '../services/pricingBeautification';
import { findOptimalYearlyPrice } from '../services/smartYearlyPricing';
import Stripe from 'stripe';
import crypto from 'crypto';
import { unifiedLogger } from '../services/unifiedLogger';
import { SUPPORTED_LOCALES } from '../i18n/localeUtils';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil'
});

// Use HMAC middleware for consistent signature validation

// Interfaces for API requests/responses
interface BalanceResponse {
  balance: {
    welcomeBonus: number;      // seconds remaining
    dailyGift: number;         // seconds available today
    paid: number;              // seconds from purchases/subs
    total: number;             // total seconds available
  };
  usage: {
    todayUsed: number;         // seconds used today
    lifetimeUsed: number;      // total seconds ever used
  };
  dailyResetAt: string;        // Next reset time in UTC
}

interface SufficientCheckRequest {
  userId: string;
  operationType: 'main_build' | 'metadata_generation' | 'update';
  projectSize?: 'small' | 'medium' | 'large';
  isUpdate?: boolean;
}

interface SufficientCheckResponse {
  sufficient: boolean;
  estimate: {
    estimatedSeconds: number;
    estimatedMinutes: number;
    confidence: 'high' | 'medium' | 'low';
    basedOnSamples: number;
  } | null;
  balance: BalanceResponse['balance'];
  recommendation?: {
    suggestedPackage?: string;
    costToComplete: number;
    purchaseUrl: string;
  };
}

// Batch operations interfaces
interface BatchOperationRequest {
  operation: 'build' | 'plan' | 'export' | 'metadata_generation';
  estimate_seconds: number;
}

interface BatchCheckRequest {
  userId: string;
  operations: BatchOperationRequest[];
}

interface BatchOperationResult {
  operation: string;
  ok: boolean;
  deficit_seconds: number;
  suggestions?: Array<{ type: 'package' | 'upgrade'; key?: string; plan?: string; minutes?: number; }>;
}

// Resume token store (in production, use Redis with TTL)
const resumeTokenStore = new Map<string, { userId: string; operation: string; timestamp: number }>();

// Route handlers
async function getBalance(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply
): Promise<BalanceResponse> {
  const { userId } = request.params;

  try {
    console.log(`[Billing] Getting balance for user ${userId}`);
    
    // Get user balance from billing service
    const balance = await aiTimeBillingService.getUserBalance(userId);
    
    if (!balance) {
      reply.code(404);
      throw new Error('User balance not found');
    }

    // Calculate next daily reset time (midnight UTC)
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    nextReset.setUTCHours(0, 0, 0, 0);

    const response: BalanceResponse = {
      balance: {
        welcomeBonus: balance.welcomeBonus || 0,
        dailyGift: Math.max(0, 900 - (balance.dailyGift || 0)), // 15 min - used
        paid: balance.paid || 0,
        total: balance.total || 0
      },
      usage: {
        todayUsed: (balance as any).todayUsed || 0,
        lifetimeUsed: (balance as any).lifetimeUsed || 0
      },
      dailyResetAt: nextReset.toISOString()
    };

    console.log(`[Billing] Balance retrieved for ${userId}: ${response.balance.total}s total`);
    
    // Add rate limit headers for intelligent client backoff
    reply.header('x-ratelimit-remaining', '90'); // Example: 90 requests remaining
    reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour
    
    return response;
    
  } catch (error) {
    console.error(`[Billing] Failed to get balance for ${userId}:`, error);
    reply.code(500);
    throw new Error('Failed to retrieve balance');
  }
}

async function checkSufficient(
  request: FastifyRequest<{ Body: SufficientCheckRequest }>,
  reply: FastifyReply
): Promise<SufficientCheckResponse> {
  const { userId, operationType, projectSize, isUpdate } = request.body;

  try {
    console.log(`[Billing] Checking sufficient balance for ${userId}, operation: ${operationType}`);
    
    // Get time estimate for the operation
    const estimate = await metricsService.estimateAITime(operationType, {
      projectSize,
      isUpdate
    });
    
    // Get current balance
    const balance = await aiTimeBillingService.getUserBalance(userId);
    
    if (!balance) {
      reply.code(404);
      throw new Error('User balance not found');
    }

    const totalAvailableSeconds = balance.total || 0;

    const estimatedSeconds = estimate?.estimatedSeconds || 180; // Default 3 minutes
    const sufficient = totalAvailableSeconds >= estimatedSeconds;

    const response: SufficientCheckResponse = {
      sufficient,
      estimate: estimate ? {
        estimatedSeconds: estimate.estimatedSeconds,
        estimatedMinutes: Math.ceil(estimate.estimatedSeconds / 60),
        confidence: estimate.confidence || 'medium',
        basedOnSamples: estimate.basedOnSamples || 0
      } : null,
      balance: {
        welcomeBonus: balance.welcomeBonus || 0,
        dailyGift: balance.dailyGift || 0,
        paid: balance.paid || 0,
        total: totalAvailableSeconds
      }
    };

    // Return standard 402 error if insufficient
    if (!sufficient) {
      const catalog = await pricingCatalogService.getActiveCatalog();
      const shortfall = estimatedSeconds - totalAvailableSeconds;
      const shortfallMinutes = Math.ceil(shortfall / 60);
      
      // Generate resume token for retry after purchase
      const resumeToken = crypto.randomBytes(16).toString('hex');
      resumeTokenStore.set(resumeToken, {
        userId,
        operation: `${operationType}:${JSON.stringify({ projectSize, isUpdate })}`,
        timestamp: Date.now()
      });
      
      // Clean up expired tokens (older than 1 hour)
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const [token, data] of resumeTokenStore.entries()) {
        if (data.timestamp < oneHourAgo) {
          resumeTokenStore.delete(token);
        }
      }
      
      // Create suggestions based on catalog
      const suggestions: Array<{ type: 'package' | 'upgrade'; key?: string; plan?: string; minutes?: number; }> = [];
      for (const pkg of catalog.packages) {
        if (pkg.minutes >= shortfallMinutes) {
          suggestions.push({
            type: 'package',
            key: pkg.key,
            minutes: pkg.minutes
          });
          break;
        }
      }
      
      if (balance.paid === 0) {
        suggestions.push({
          type: 'upgrade',
          plan: 'starter'
        });
      }

      const errorResponse: InsufficientFundsError & { resume_token?: string } = {
        error: 'INSUFFICIENT_AI_TIME',
        http_status: 402,
        balance_seconds: totalAvailableSeconds,
        breakdown_seconds: {
          bonus_daily: balance.dailyGift || 0,
          paid: balance.paid || 0
        },
        suggestions,
        catalog_version: catalog.version,
        resume_token: resumeToken
      };

      reply.code(402);
      return errorResponse as any;
    }

    console.log(`[Billing] Balance check for ${userId}: ${sufficient ? 'sufficient' : 'insufficient'} (${totalAvailableSeconds}s available, ${estimatedSeconds}s needed)`);
    
    // Add rate limit headers for intelligent client backoff
    reply.header('x-ratelimit-remaining', '45'); // Example: 45 requests remaining
    reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour
    
    return response;
    
  } catch (error) {
    console.error(`[Billing] Failed to check sufficient balance for ${userId}:`, error);
    reply.code(500);
    throw new Error('Failed to check balance');
  }
}

// Batch operations checker 
async function checkBatchSufficient(
  request: FastifyRequest<{ Body: BatchCheckRequest }>,
  reply: FastifyReply
): Promise<BatchOperationResult[]> {
  const { userId, operations } = request.body;

  try {
    console.log(`[Billing] Checking batch operations for user ${userId}:`, operations);
    
    // Get current balance
    const balance = await enhancedAITimeBillingService.getEnhancedUserBalance(userId);
    const totalAvailableSeconds = balance.totals.total_seconds;
    
    // Get catalog for suggestions
    const catalog = await pricingCatalogService.getActiveCatalog();
    
    const results: BatchOperationResult[] = [];
    let cumulativeUsage = 0;
    
    for (const operation of operations) {
      cumulativeUsage += operation.estimate_seconds;
      const remainingBalance = totalAvailableSeconds - cumulativeUsage;
      
      if (remainingBalance >= 0) {
        results.push({
          operation: operation.operation,
          ok: true,
          deficit_seconds: 0
        });
      } else {
        const deficit = Math.abs(remainingBalance);
        const deficitMinutes = Math.ceil(deficit / 60);
        
        // Create suggestions for this deficit
        const suggestions: Array<{ type: 'package' | 'upgrade'; key?: string; plan?: string; minutes?: number; }> = [];
        for (const pkg of catalog.packages) {
          if (pkg.minutes >= deficitMinutes) {
            suggestions.push({
              type: 'package',
              key: pkg.key,
              minutes: pkg.minutes
            });
            break;
          }
        }
        
        const paidBuckets = balance.buckets.filter(b => b.source === 'subscription' || b.source === 'package');
        if (paidBuckets.length === 0) {
          suggestions.push({
            type: 'upgrade',
            plan: 'starter'
          });
        }
        
        results.push({
          operation: operation.operation,
          ok: false,
          deficit_seconds: deficit,
          suggestions
        });
      }
    }
    
    console.log(`[Billing] Batch check for ${userId} completed:`, results);
    return results;
    
  } catch (error) {
    console.error(`[Billing] Failed batch check for ${userId}:`, error);
    reply.code(500);
    throw new Error('Failed to check batch operations');
  }
}

// Enhanced balance route handlers
async function getEnhancedBalance(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply
): Promise<EnhancedUserBalance & { plan_key?: string; subscription_status?: string; catalog_version?: string }> {
  const { userId } = request.params;
  const startTime = Date.now();

  try {
    console.log(`[Billing] Getting enhanced balance for user ${userId}`);
    
    // Log action start
    unifiedLogger.action(userId, 'billing_balance_check', 'GET', `/v1/billing/balance/${userId}`, undefined, undefined, undefined, request.headers['x-correlation-id'] as string);
    
    const balance = await enhancedAITimeBillingService.getEnhancedUserBalance(userId);
    const catalog = await pricingCatalogService.getActiveCatalog();
    
    // Add plan metadata for frontend gating
    const response = {
      ...balance,
      plan_key: balance.buckets.filter(b => b.source === 'subscription' || b.source === 'package').length > 0 ? 'paid' : 'free',
      subscription_status: balance.buckets.filter(b => b.source === 'subscription').length > 0 ? 'active' as const : 'inactive' as const,
      catalog_version: catalog.version
    };
    
    console.log(`[Billing] Enhanced balance retrieved for ${userId}: ${balance.totals.total_seconds}s total`);
    
    // Add rate limit headers
    reply.header('x-ratelimit-remaining', '90');
    reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600);
    
    // Log successful action
    const duration = Date.now() - startTime;
    unifiedLogger.action(userId, 'billing_balance_success', 'GET', `/v1/billing/balance/${userId}`, 200, duration, {
      totalSeconds: balance.totals.total_seconds,
      paidSeconds: balance.totals.paid_seconds,
      bonusSeconds: balance.totals.bonus_seconds,
      planKey: response.plan_key,
      subscriptionStatus: response.subscription_status
    }, request.headers['x-correlation-id'] as string);
    
    return response;
    
  } catch (error) {
    console.error(`[Billing] Failed to get enhanced balance for ${userId}:`, error);
    
    // Log error action
    const duration = Date.now() - startTime;
    unifiedLogger.action(userId, 'billing_balance_error', 'GET', `/v1/billing/balance/${userId}`, 500, duration, {
      errorMessage: error instanceof Error ? error.message : String(error)
    }, request.headers['x-correlation-id'] as string);
    
    reply.code(500);
    throw new Error('Failed to retrieve balance');
  }
}

// Usage analytics route handler
async function getUsageAnalytics(
  request: FastifyRequest<{ 
    Params: { userId: string };
    Querystring: { period?: 'day' | 'month' };
  }>,
  reply: FastifyReply
) {
  const { userId } = request.params;
  const { period = 'month' } = request.query;

  try {
    console.log(`[Billing] Getting usage analytics for user ${userId}, period: ${period}`);
    
    let dateFilter = '';
    switch (period) {
      case 'day':
        dateFilter = "DATE(created_at) = CURRENT_DATE";
        break;
      case 'month':
        dateFilter = "DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
        break;
    }

    const { pool } = require('../services/database');
    const [usageResult, trendResult] = await Promise.all([
      // Total usage and operation breakdown
      pool.query(`
        SELECT 
          SUM(billable_seconds) as total_seconds,
          jsonb_object_agg(operation_type, seconds_by_operation) as by_operation
        FROM (
          SELECT 
            operation_type, 
            SUM(billable_seconds) as seconds_by_operation
          FROM user_ai_time_consumption 
          WHERE user_id = $1 AND ${dateFilter}
          GROUP BY operation_type
        ) grouped
      `, [userId]),
      
      // Daily trend
      pool.query(`
        SELECT 
          DATE(created_at) as date,
          SUM(billable_seconds) as seconds
        FROM user_ai_time_consumption 
        WHERE user_id = $1 AND ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [userId])
    ]);

    const usage = usageResult.rows[0] || {};
    const response = {
      total_seconds: parseInt(usage.total_seconds || '0'),
      by_operation: usage.by_operation || {},
      daily_trend: trendResult.rows.map((row: any) => ({
        date: row.date,
        seconds: parseInt(row.seconds)
      }))
    };

    console.log(`[Billing] Usage analytics retrieved for ${userId}`);
    return reply.send(response);
    
  } catch (error) {
    console.error(`[Billing] Failed to get usage analytics for ${userId}:`, error);
    reply.code(500);
    throw new Error('Failed to retrieve usage analytics');
  }
}

// Billing events route handler
async function getBillingEvents(
  request: FastifyRequest<{ 
    Params: { userId: string };
    Querystring: { limit?: number };
  }>,
  reply: FastifyReply
) {
  const { userId } = request.params;
  const { limit = 50 } = request.query;

  try {
    console.log(`[Billing] Getting billing events for user ${userId}`);
    
    const { pool } = require('../services/database');
    const result = await pool.query(`
      SELECT 
        CASE 
          WHEN paid_seconds_used > 0 THEN 'consumption'
          WHEN daily_gift_used_seconds > 0 THEN 'daily_bonus'
          ELSE 'consumption'
        END as type,
        -(billable_seconds) as seconds,
        CASE 
          WHEN operation_type = 'main_build' THEN 'Build operation'
          WHEN operation_type = 'metadata_generation' THEN 'Metadata generation'
          WHEN operation_type = 'update' THEN 'Update operation'
          ELSE operation_type
        END as reason,
        created_at::text as timestamp
      FROM user_ai_time_consumption 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    const response = {
      events: result.rows
    };

    return reply.send(response);
    
  } catch (error) {
    console.error(`[Billing] Failed to get billing events for ${userId}:`, error);
    reply.code(500);
    throw new Error('Failed to retrieve billing events');
  }
}

// Pricing catalog route handlers with currency filtering
async function getCatalogWithCurrency(
  request: FastifyRequest<{ Querystring: { currency?: string } }>,
  reply: FastifyReply
): Promise<PricingCatalog & { currency_fallback_from?: string }> {
  try {
    const requestedCurrency = request.query.currency || 'USD';
    console.log(`[Billing] Getting pricing catalog for currency: ${requestedCurrency}`);
    
    // Get ETag per currency to avoid cache collisions  
    const etag = await pricingCatalogService.getCatalogETag(requestedCurrency);
    
    const clientETag = request.headers['if-none-match'];
    if (clientETag === etag) {
      reply.code(304);
      return {} as PricingCatalog;
    }
    
    // Try to get catalog in requested currency
    let catalog = null;
    let currencyFallback = null;
    
    try {
      catalog = await pricingCatalogService.getActiveCatalog(requestedCurrency);
    } catch (error) {
      // Expected for currencies without pricing items
      console.log(`[Billing] No catalog found for ${requestedCurrency}: ${(error as Error).message}`);
    }
    
    // Fallback to USD if requested currency not found or has no items
    if (!catalog || catalog.subscriptions.length === 0) {
      console.log(`[Billing] Falling back to USD catalog`);
      catalog = await pricingCatalogService.getActiveCatalog('USD');
      currencyFallback = requestedCurrency;
    }
    
    // Convert prices if we fell back to USD catalog for different currency
    if (currencyFallback && currencyFallback !== 'USD') {
      console.log(`[Billing] Converting USD prices to ${currencyFallback}`);
      
      // Convert subscription prices with smart yearly pricing
      for (const subscription of catalog.subscriptions) {
        // Convert monthly price (backwards compatibility)  
        const convertedPrice = await CurrencyConversionService.convertPrice(
          subscription.price,
          'USD',
          currencyFallback
        );
        if (convertedPrice !== null) {
          const convertedMinor = displayToMinor(convertedPrice, currencyFallback);
          const beautifiedMinor = beautifyMinor(convertedMinor, currencyFallback);
          subscription.price = minorToDisplay(beautifiedMinor, currencyFallback);
        }
        
        // Convert new monthlyPrice field
        if (subscription.monthlyPrice) {
          const convertedMonthlyPrice = await CurrencyConversionService.convertPrice(
            subscription.monthlyPrice,
            'USD',
            currencyFallback
          );
          if (convertedMonthlyPrice !== null) {
            const convertedMinor = displayToMinor(convertedMonthlyPrice, currencyFallback);
            const beautifiedMinor = beautifyMinor(convertedMinor, currencyFallback);
            const beautifiedMonthlyPrice = minorToDisplay(beautifiedMinor, currencyFallback);
            subscription.monthlyPrice = beautifiedMonthlyPrice;
            
            // Apply smart yearly pricing to get clean monthly equivalents
            if (subscription.yearlyDiscount && subscription.yearlyDiscount > 0) {
              const smartPricing = findOptimalYearlyPrice(beautifiedMonthlyPrice, currencyFallback, subscription.yearlyDiscount);
              subscription.yearlyPrice = smartPricing.yearlyPriceDisplay;
              
              // Update displayed discount based on smart pricing
              if (subscription.displayedDiscount !== undefined) {
                subscription.displayedDiscount = smartPricing.actualDiscountPercent;
              }
            } else if (subscription.yearlyPrice) {
              // No discount case - just convert and beautify yearly price
              const convertedYearlyPrice = await CurrencyConversionService.convertPrice(
                subscription.yearlyPrice,
                'USD', 
                currencyFallback
              );
              if (convertedYearlyPrice !== null) {
                const convertedMinor = displayToMinor(convertedYearlyPrice, currencyFallback);
                const beautifiedMinor = beautifyMinor(convertedMinor, currencyFallback);
                subscription.yearlyPrice = minorToDisplay(beautifiedMinor, currencyFallback);
              }
            }
          }
        }
        
        // Note: displayedDiscount is a percentage, so it doesn't need currency conversion
      }
      
      // Convert package prices
      for (const package_ of catalog.packages) {
        const convertedPrice = await CurrencyConversionService.convertPrice(
          package_.price,
          'USD',
          currencyFallback
        );
        if (convertedPrice !== null) {
          // Apply beautification to converted price for professional multi-currency pricing
          const convertedMinor = displayToMinor(convertedPrice, currencyFallback);
          const beautifiedMinor = beautifyMinor(convertedMinor, currencyFallback);
          package_.price = minorToDisplay(beautifiedMinor, currencyFallback);
        }
      }
    }
    
    // Set currency-aware ETag
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, max-age=300');
    
    console.log(`[Billing] Catalog retrieved: version ${catalog.version}, currency: ${requestedCurrency}${currencyFallback ? ` (fallback from ${currencyFallback})` : ''}`);
    
    const response = {
      ...catalog,
      currency: currencyFallback || 'USD', // Always indicate the actual currency of prices
      ...(currencyFallback && { currency_fallback_from: currencyFallback })
    };
    
    return response;
    
  } catch (error) {
    console.error('[Billing] Failed to get pricing catalog:', error);
    reply.code(500);
    throw new Error('Failed to retrieve pricing catalog');
  }
}

// Legacy catalog function for backward compatibility
async function getCatalog(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<PricingCatalog> {
  try {
    console.log('[Billing] Getting pricing catalog (legacy)');
    
    // Get ETag for cache validation
    const etag = await pricingCatalogService.getCatalogETag();
    
    // Check if client has current version
    const clientETag = request.headers['if-none-match'];
    if (clientETag === etag) {
      reply.code(304);
      return {} as PricingCatalog; // Empty response for 304
    }
    
    // Get catalog data
    const catalog = await pricingCatalogService.getActiveCatalog();
    
    // Set ETag header for client caching
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, max-age=300'); // 5 minute cache
    
    console.log(`[Billing] Catalog retrieved: version ${catalog.version}`);
    return catalog;
    
  } catch (error) {
    console.error('[Billing] Failed to get pricing catalog:', error);
    reply.code(500);
    throw new Error('Failed to retrieve pricing catalog');
  }
}

// Multi-provider purchase handler
async function purchasePackage(
  request: FastifyRequest<{
    Headers: { 'x-sheen-locale'?: string; [key: string]: any };
    Body: {
      userId: string;
      package_key: string;
      currency?: string;
      region?: string;
      locale?: 'en' | 'ar'; // Deprecated: Use x-sheen-locale header instead
    }
  }>,
  reply: FastifyReply
): Promise<any> {
  try {
    const {
      userId,
      package_key,
      currency: requestedCurrency = 'USD',
      region: requestedRegion,
      locale: bodyLocale
    } = request.body;

    // Expert recommendation: Deprecation with user tracking (2-week timeline)
    let locale = request.locale; // Use middleware-resolved locale
    if (bodyLocale && !request.headers['x-sheen-locale']) {
      console.warn(`[DEPRECATED] Route ${request.url} using body.locale - User: ${userId} - migrate to x-sheen-locale header`);
      unifiedLogger.system('warning', 'warn', `deprecated_body_locale_usage: ${request.url}`, {
        route: request.url,
        userId,
        bodyLocale,
        userAgent: request.headers['user-agent'],
        timestamp: new Date().toISOString()
      });
      locale = bodyLocale; // Temporary compatibility
    }

    // userId is now extracted from request.body above (following API authentication pattern)
    if (!userId) {
      console.log(`[Billing] Missing userId in request body:`, JSON.stringify(request.body, null, 2));
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'User authentication required' });
    }
    
    console.log(`[Billing] Multi-provider purchase: ${package_key}, currency: ${requestedCurrency}, region: ${requestedRegion}, locale: ${locale}`);
    
    // Import provider registry
    const { paymentProviderRegistry } = await import('../services/payment/RegionalPaymentFactory');
    
    // Find pricing item for requested currency
    let pricingItem = await pricingCatalogService.getPricingItem(package_key, requestedCurrency);
    let currencyFallback = null;
    
    // Fallback to USD if not found in requested currency
    if (!pricingItem) {
      console.log(`[Billing] No pricing found for ${package_key} in ${requestedCurrency}, falling back to USD`);
      pricingItem = await pricingCatalogService.getPricingItem(package_key, 'USD');
      currencyFallback = requestedCurrency;
    }
    
    if (!pricingItem) {
      return reply.code(400).send({ 
        error: 'PRICE_NOT_CONFIGURED',
        message: `Package ${package_key} not available in any supported currency`
      });
    }
    
    // Get optimal provider for user's region/currency/product type
    const provider = await paymentProviderRegistry.getProvider(
      userId, 
      requestedRegion, 
      pricingItem.currency,
      'package' // packages are one-time purchases
    );
    
    console.log(`[Billing] Selected provider: ${provider.key} for ${pricingItem.currency} package`);
    
    // Resolve price reference for this provider
    const { externalId, priceSnapshot } = await provider.resolvePriceReference(
      pricingItem.id, 
      pricingItem.currency, 
      'package'
    );
    
    // Generate order ID and idempotency key
    const orderId = `pkg_${package_key}_${userId}_${Date.now()}`;
    const idempotencyKey = `idem_${orderId}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create checkout session with provider
    const checkoutResult = await provider.createCheckoutSession({
      userId,
      pricingItemId: pricingItem.id,
      currency: pricingItem.currency,
      productType: 'package',
      orderId,
      locale,
      idempotencyKey,
      priceSnapshot
    });
    
    console.log(`[Billing] Checkout session created with ${provider.key}: ${checkoutResult.type === 'redirect' ? checkoutResult.sessionId : checkoutResult.reference}`);
    
    // Return provider-agnostic checkout result
    return reply.send({
      // Standard fields
      checkout_url: checkoutResult.type === 'redirect' ? checkoutResult.url : undefined,
      currency: pricingItem.currency,
      unit_amount_cents: pricingItem.unit_amount_cents,
      display_price: pricingItem.unit_amount_cents / 100,
      package_minutes: Math.floor(pricingItem.seconds / 60),
      currency_fallback_from: currencyFallback,
      session_id: checkoutResult.type === 'redirect' ? checkoutResult.sessionId : undefined,
      order_id: orderId,
      
      // Multi-provider fields
      payment_provider: provider.key,
      checkout_type: checkoutResult.type,
      
      // Voucher-specific fields (for cash payments like Fawry)
      ...(checkoutResult.type === 'voucher' && {
        voucher_reference: checkoutResult.reference,
        voucher_expires_at: checkoutResult.expiresAt,
        voucher_instructions: checkoutResult.instructions,
        voucher_barcode_url: checkoutResult.barcodeUrl
      }),
      
      // Redirect-specific fields  
      ...(checkoutResult.type === 'redirect' && {
        redirect_expires_at: checkoutResult.expiresAt
      })
    });
    
  } catch (error) {
    console.error('[Billing] Purchase failed:', error);
    reply.code(500);
    throw new Error('Failed to create purchase session');
  }
}

// Register routes with the Fastify app
export function registerBillingRoutes(app: FastifyInstance) {
  console.log('[Billing] Registering billing API routes');

  // Add request logging middleware for billing routes
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/v1/billing/')) {
      console.log(`[Billing] ${request.method} ${request.url}`);
    }
  });

  // Use consistent HMAC validation middleware for all billing routes
  const hmacMiddleware = requireHmacSignature({
    skipMethods: ['OPTIONS'],
    logFailures: true
  });
  
  // NOTE: Do NOT use app.addHook as it affects ALL routes globally!
  // Instead, add preHandler to each individual route

  // GET /v1/billing/balance/:userId - Get user's current balance (enhanced format)
  app.get<{ Params: { userId: string } }>(
    '/v1/billing/balance/:userId',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' }
          },
          required: ['userId']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              plan_key: { type: 'string' },
              subscription_status: { type: 'string' },
              totals: {
                type: 'object',
                properties: {
                  total_seconds: { type: 'number' },
                  paid_seconds: { type: 'number' },
                  bonus_seconds: { type: 'number' },
                  next_expiry_at: { type: ['string', 'null'] }
                }
              },
              buckets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    seconds: { type: 'number' },
                    expires_at: { type: ['string', 'null'] }
                  }
                }
              },
              bonus: {
                type: 'object',
                properties: {
                  daily_minutes: { type: 'number' },
                  used_this_month_minutes: { type: 'number' },
                  monthly_cap_minutes: { type: 'number' }
                }
              },
              catalog_version: { type: 'string' }
            }
          }
        }
      }
    },
    getEnhancedBalance  // Uses enhanced balance format
  );

  // POST /v1/billing/check-sufficient - Check if user has sufficient balance
  app.post<{ Body: SufficientCheckRequest }>(
    '/v1/billing/check-sufficient',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            operationType: { 
              type: 'string', 
              enum: ['main_build', 'metadata_generation', 'update'] 
            },
            projectSize: { 
              type: 'string', 
              enum: ['small', 'medium', 'large'] 
            },
            isUpdate: { type: 'boolean' }
          },
          required: ['userId', 'operationType']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              sufficient: { type: 'boolean' },
              estimate: {
                type: 'object',
                nullable: true,
                properties: {
                  estimatedSeconds: { type: 'number' },
                  estimatedMinutes: { type: 'number' },
                  confidence: { type: 'string' },
                  basedOnSamples: { type: 'number' }
                }
              },
              balance: {
                type: 'object',
                properties: {
                  welcomeBonus: { type: 'number' },
                  dailyGift: { type: 'number' },
                  paid: { type: 'number' },
                  total: { type: 'number' }
                }
              },
              recommendation: {
                type: 'object',
                nullable: true,
                properties: {
                  suggestedPackage: { type: 'string' },
                  costToComplete: { type: 'number' },
                  purchaseUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    checkSufficient
  );

  // GET /v1/billing/catalog - Get pricing catalog with ETag support and currency filtering
  app.get<{ Querystring: { currency?: string } }>(
    '/v1/billing/catalog',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            currency: {
              type: 'string',
              enum: ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED', 'CAD', 'AUD'],
              description: 'Currency filter for pricing items'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              currency: { 
                type: 'string',
                description: 'The actual currency of the prices in this response'
              },
              currency_fallback_from: { 
                type: 'string',
                description: 'Original requested currency when fallback occurred'
              },
              rollover_policy: {
                type: 'object',
                properties: {
                  days: { type: 'number' }
                }
              },
              subscriptions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    name: { type: 'string' },
                    minutes: { type: 'number' },
                    price: { type: 'number' },                    // Backwards compatibility
                    monthlyPrice: { type: 'number' },            // NEW: Explicit monthly price
                    yearlyPrice: { type: 'number' },             // NEW: Auto-calculated yearly price
                    displayedDiscount: { type: 'number' },       // NEW: Marketing-safe discount percentage
                    yearlyDiscount: { type: 'number' },          // NEW: Database discount percentage
                    bonusDaily: { type: 'number' },
                    monthlyBonusCap: { type: 'number' },
                    rolloverCap: { type: 'number' },
                    taxInclusive: { type: 'boolean' },           // NEW: Tax inclusive flag
                    advisor: {
                      type: 'object',
                      properties: {
                        eligible: { type: 'boolean' },
                        payoutUSD: { type: 'number' },
                        sessions: {
                          oneOf: [
                            { type: 'number' },
                            { type: 'string', enum: ['community', 'daily'] }
                          ],
                          description: 'Monthly advisor sessions: number (2, 4, 6, 10), "community", or "daily"'
                        }
                      }
                    }
                  }
                }
              },
              packages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    name: { type: 'string' },
                    minutes: { type: 'number' },
                    price: { type: 'number' },
                    taxInclusive: { type: 'boolean' }    // NEW: Tax inclusive flag
                  }
                }
              }
            }
          },
          304: {
            description: 'Not Modified - client has current version'
          }
        }
      }
    },
    getCatalogWithCurrency
  );

  // GET /v1/billing/legacy-balance/:userId - Legacy balance format (for backward compatibility)
  app.get<{ Params: { userId: string } }>(
    '/v1/billing/legacy-balance/:userId',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' }
          },
          required: ['userId']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              balance: {
                type: 'object',
                properties: {
                  welcomeBonus: { type: 'number' },
                  dailyGift: { type: 'number' },
                  paid: { type: 'number' },
                  total: { type: 'number' }
                }
              },
              usage: {
                type: 'object',
                properties: {
                  todayUsed: { type: 'number' },
                  lifetimeUsed: { type: 'number' }
                }
              },
              dailyResetAt: { type: 'string' }
            }
          }
        }
      }
    },
    getBalance  // Uses the old balance handler for backward compatibility
  );

  // GET /v1/billing/usage/:userId - Usage analytics 
  app.get<{ 
    Params: { userId: string };
    Querystring: { period?: 'day' | 'month' };
  }>(
    '/v1/billing/usage/:userId',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' }
          },
          required: ['userId']
        },
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['day', 'month'] }
          }
        }
      }
    },
    getUsageAnalytics
  );

  // GET /v1/billing/events/:userId - Billing event history
  app.get<{ 
    Params: { userId: string };
    Querystring: { limit?: number };
  }>(
    '/v1/billing/events/:userId',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' }
          },
          required: ['userId']
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100 }
          }
        }
      }
    },
    getBillingEvents
  );

  // POST /v1/billing/packages/purchase - Currency-aware package purchase
  app.post<{
    Headers: { 'x-sheen-locale'?: string; [key: string]: any };
    Body: {
      userId: string;
      package_key: string;
      currency?: string;
      region?: string;
      locale?: 'en' | 'ar'; // Deprecated: Use x-sheen-locale header instead
    }
  }>(
    '/v1/billing/packages/purchase',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        headers: {
          type: 'object',
          properties: {
            'x-sheen-locale': {
              type: 'string',
              enum: SUPPORTED_LOCALES as any,
              description: 'Preferred locale for payment processing'
            }
          }
        },
        body: {
          type: 'object',
          required: ['userId', 'package_key'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            package_key: { type: 'string' },
            currency: {
              type: 'string',
              enum: ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED', 'CAD', 'AUD'],
              description: 'Preferred currency for purchase'
            },
            locale: {
              type: 'string',
              enum: ['en', 'ar'],
              description: 'DEPRECATED: Use x-sheen-locale header instead'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              checkout_url: { type: 'string' },
              currency: { type: 'string' },
              unit_amount_cents: { type: 'number' },
              display_price: { type: 'number' },
              package_minutes: { type: 'number' },
              currency_fallback_from: { 
                type: 'string',
                description: 'Original requested currency when fallback occurred'
              },
              session_id: { type: 'string' }
            }
          }
        }
      }
    },
    purchasePackage
  );

  // POST /v1/billing/check-sufficient-batch - Batch operations preflight check
  app.post<{ Body: BatchCheckRequest }>(
    '/v1/billing/check-sufficient-batch',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  operation: { 
                    type: 'string', 
                    enum: ['build', 'plan', 'export', 'metadata_generation'] 
                  },
                  estimate_seconds: { type: 'number', minimum: 1 }
                },
                required: ['operation', 'estimate_seconds']
              },
              minItems: 1,
              maxItems: 10
            }
          },
          required: ['userId', 'operations']
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                operation: { type: 'string' },
                ok: { type: 'boolean' },
                deficit_seconds: { type: 'number' },
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['package', 'upgrade'] },
                      key: { type: 'string' },
                      plan: { type: 'string' },
                      minutes: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    checkBatchSufficient
  );

  console.log('[Billing] Billing API routes registered successfully');
}