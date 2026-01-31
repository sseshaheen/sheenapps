/**
 * Billing Overview Route
 *
 * Aggregated billing endpoint that consolidates enhanced balance, usage analytics,
 * and pricing catalog into a single worker call.
 *
 * Previously, the frontend made 3 separate API calls for the billing page.
 * This reduces to 1 network round-trip from the proxy.
 *
 * Routes:
 * - GET /v1/billing/overview/:userId?currency=USD - Aggregated billing data
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { enhancedAITimeBillingService } from '../services/enhancedAITimeBillingService'
import { pricingCatalogService } from '../services/pricingCatalogService'
import { CurrencyConversionService } from '../services/currencyConversionService'
import { beautifyMinor, displayToMinor, minorToDisplay } from '../services/pricingBeautification'

import { findOptimalYearlyPrice } from '../services/smartYearlyPricing'
import { getPool } from '../services/database'
import { withStatementTimeout } from '../utils/dbTimeout'

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'] as const
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

export async function billingOverviewRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  fastify.get<{
    Params: { userId: string }
    Querystring: { currency?: string }
  }>('/v1/billing/overview/:userId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { userId } = request.params
    const requestedCurrency = (request.query.currency?.toUpperCase() || 'USD') as SupportedCurrency

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'MISSING_USER_ID', message: 'userId is required' },
      })
    }

    try {
      const pool = getPool()

      // Run all 3 data sources in parallel
      const [balanceResult, usageResult, catalogResult] = await Promise.allSettled([
        // 1. Enhanced balance
        enhancedAITimeBillingService.getEnhancedUserBalance(userId),

        // 2. Usage analytics (current month)
        withStatementTimeout(pool, '5s', async (client) => {
          return client.query(`
            SELECT
              SUM(billable_seconds) as total_seconds,
              jsonb_object_agg(operation_type, seconds_by_operation) as by_operation
            FROM (
              SELECT
                operation_type,
                SUM(billable_seconds) as seconds_by_operation
              FROM user_ai_time_consumption
              WHERE user_id = $1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
              GROUP BY operation_type
            ) grouped
          `, [userId])
        }),

        // 3. Pricing catalog
        pricingCatalogService.getActiveCatalog(),
      ])

      // Balance is required
      if (balanceResult.status === 'rejected') {
        request.log.error({ error: balanceResult.reason, userId }, 'Failed to fetch balance')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch balance' },
        })
      }

      const balance = balanceResult.value

      // Extract optional results
      const usageRow = usageResult.status === 'fulfilled'
        ? usageResult.value.rows[0] || {}
        : {}
      const usage = {
        total_seconds: parseInt(usageRow.total_seconds || '0'),
        by_operation: usageRow.by_operation || {},
      }

      // Process catalog with currency conversion (matches billing.ts pattern)
      let catalog = null
      let currencyFallbackFrom: string | null = null
      if (catalogResult.status === 'fulfilled') {
        const rawCatalog = catalogResult.value
        const isSupportedCurrency = SUPPORTED_CURRENCIES.includes(requestedCurrency)
        const effectiveCurrency = isSupportedCurrency ? requestedCurrency : 'USD'

        if (effectiveCurrency !== 'USD') {
          currencyFallbackFrom = null
          // Convert prices to requested currency using static async methods
          const subscriptions = await Promise.all(rawCatalog.subscriptions.map(async (sub: any) => {
            const convertedMonthly = await CurrencyConversionService.convertPrice(sub.monthlyPrice, 'USD', effectiveCurrency)
            if (convertedMonthly !== null) {
              const convertedMinor = displayToMinor(convertedMonthly, effectiveCurrency)
              const beautifiedMinor = beautifyMinor(convertedMinor, effectiveCurrency)
              const beautifiedMonthly = minorToDisplay(beautifiedMinor, effectiveCurrency)
              const smartPricing = findOptimalYearlyPrice(beautifiedMonthly, effectiveCurrency)
              return {
                ...sub,
                price: beautifiedMonthly,
                monthlyPrice: beautifiedMonthly,
                yearlyPrice: smartPricing.yearlyPriceDisplay ?? sub.yearlyPrice,
                currency: effectiveCurrency,
              }
            }
            return { ...sub, currency: effectiveCurrency }
          }))
          const packages = await Promise.all(rawCatalog.packages.map(async (pkg: any) => {
            const converted = await CurrencyConversionService.convertPrice(pkg.price, 'USD', effectiveCurrency)
            if (converted !== null) {
              const convertedMinor = displayToMinor(converted, effectiveCurrency)
              const beautifiedMinor = beautifyMinor(convertedMinor, effectiveCurrency)
              return {
                ...pkg,
                price: minorToDisplay(beautifiedMinor, effectiveCurrency),
                currency: effectiveCurrency,
              }
            }
            return { ...pkg, currency: effectiveCurrency }
          }))
          catalog = {
            subscriptions,
            packages,
            rollover_policy: rawCatalog.rollover_policy,
            version: rawCatalog.version,
            currency: effectiveCurrency,
          }
        } else {
          if (!isSupportedCurrency && requestedCurrency !== 'USD') {
            currencyFallbackFrom = requestedCurrency
          }
          catalog = {
            subscriptions: rawCatalog.subscriptions.map((sub: any) => ({
              ...sub,
              currency: 'USD',
            })),
            packages: rawCatalog.packages.map((pkg: any) => ({
              ...pkg,
              currency: 'USD',
            })),
            rollover_policy: rawCatalog.rollover_policy,
            version: rawCatalog.version,
            currency: 'USD',
          }
        }
      }

      // Add plan metadata
      const planKey = balance.buckets.filter((b: any) =>
        b.source === 'subscription' || b.source === 'package'
      ).length > 0 ? 'paid' : 'free'

      const subscriptionStatus = balance.buckets.filter((b: any) =>
        b.source === 'subscription'
      ).length > 0 ? 'active' : 'inactive'

      const failures: string[] = []
      if (usageResult.status === 'rejected') failures.push('usage')
      if (catalogResult.status === 'rejected') failures.push('catalog')

      return reply.code(200).send({
        ok: true,
        data: {
          balance: {
            ...balance,
            plan_key: planKey,
            subscription_status: subscriptionStatus,
          },
          usage,
          catalog,
          currency_fallback_from: currencyFallbackFrom,
        },
        meta: failures.length > 0 ? { partial: true, failures } : undefined,
      })
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to fetch billing overview')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch billing overview' },
      })
    }
  })
}
