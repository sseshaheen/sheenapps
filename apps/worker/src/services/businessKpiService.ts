/**
 * BusinessKpiService
 *
 * Read access to daily KPI rollups for Run Hub.
 */

import { Pool } from 'pg'
import { getPool } from './database'

export interface BusinessKpiDaily {
  projectId: string
  date: string
  currencyCode: string
  sessions: number
  leads: number
  signups: number
  payments: number
  refunds: number
  revenueCents: number
  refundsCents: number
}

/** Per-currency revenue breakdown */
export interface CurrencyBreakdown {
  code: string
  revenueCents: number
  refundsCents: number
  payments: number
  refunds: number
}

/** Multi-currency KPI result with all currencies + aggregated non-monetary fields */
export interface MultiCurrencyKpiResult {
  projectId: string
  date: string
  /** Primary currency from project settings */
  primaryCurrency: string
  /** Non-monetary KPIs (aggregated across all currencies) */
  sessions: number
  leads: number
  signups: number
  /** Per-currency monetary breakdown */
  currencies: CurrencyBreakdown[]
}

export class BusinessKpiService {
  private pool: Pool

  constructor() {
    this.pool = getPool()
  }

  async getDaily(projectId: string, date: string): Promise<BusinessKpiDaily | null> {
    const result = await this.pool.query(
      `
        SELECT
          k.project_id,
          k.date,
          k.currency_code,
          sessions,
          leads,
          signups,
          payments,
          refunds,
          revenue_cents,
          refunds_cents
        FROM business_kpi_daily k
        JOIN projects p ON p.id = k.project_id
        WHERE k.project_id = $1
          AND k.date = $2
          AND k.currency_code = p.currency_code
        LIMIT 1
      `,
      [projectId, date]
    )

    if (!result.rows.length) return null

    const row = result.rows[0]
    return {
      projectId: row.project_id,
      date: row.date,
      currencyCode: row.currency_code,
      sessions: row.sessions,
      leads: row.leads,
      signups: row.signups,
      payments: row.payments,
      refunds: row.refunds,
      revenueCents: row.revenue_cents,
      refundsCents: row.refunds_cents
    }
  }

  /**
   * Get daily KPIs for all currencies (multi-currency support)
   */
  async getDailyMultiCurrency(projectId: string, date: string): Promise<MultiCurrencyKpiResult | null> {
    const result = await this.pool.query(
      `
        SELECT
          k.project_id,
          k.date,
          k.currency_code,
          p.currency_code as primary_currency,
          sessions,
          leads,
          signups,
          payments,
          refunds,
          revenue_cents,
          refunds_cents
        FROM business_kpi_daily k
        JOIN projects p ON p.id = k.project_id
        WHERE k.project_id = $1
          AND k.date = $2
        ORDER BY k.currency_code
      `,
      [projectId, date]
    )

    if (!result.rows.length) return null

    const primaryCurrency = result.rows[0].primary_currency || 'USD'

    // Non-monetary fields (sessions, leads, signups) are only in the primary
    // currency row because those events don't carry a currency in payload.
    // Find that row and use its counts.
    const primaryRow = result.rows.find(r => r.currency_code === primaryCurrency) || result.rows[0]
    const sessions = primaryRow.sessions
    const leads = primaryRow.leads
    const signups = primaryRow.signups

    const currencies: CurrencyBreakdown[] = []
    for (const row of result.rows) {
      currencies.push({
        code: row.currency_code,
        revenueCents: Number(row.revenue_cents),
        refundsCents: Number(row.refunds_cents),
        payments: row.payments,
        refunds: row.refunds,
      })
    }

    return {
      projectId: result.rows[0].project_id,
      date: result.rows[0].date,
      primaryCurrency,
      sessions,
      leads,
      signups,
      currencies,
    }
  }

  /**
   * Get aggregated KPIs for a date range (Run Hub Phase 2)
   * Used for weekly/monthly views
   */
  async getRange(projectId: string, startDate: string, endDate: string): Promise<BusinessKpiDaily | null> {
    const result = await this.pool.query(
      `
        SELECT
          k.project_id,
          $2::date as date,
          k.currency_code,
          COALESCE(SUM(sessions), 0)::int as sessions,
          COALESCE(SUM(leads), 0)::int as leads,
          COALESCE(SUM(signups), 0)::int as signups,
          COALESCE(SUM(payments), 0)::int as payments,
          COALESCE(SUM(refunds), 0)::int as refunds,
          COALESCE(SUM(revenue_cents), 0)::bigint as revenue_cents,
          COALESCE(SUM(refunds_cents), 0)::bigint as refunds_cents
        FROM business_kpi_daily k
        JOIN projects p ON p.id = k.project_id
        WHERE k.project_id = $1
          AND k.date >= $2
          AND k.date <= $3
          AND k.currency_code = p.currency_code
        GROUP BY k.project_id, k.currency_code
      `,
      [projectId, startDate, endDate]
    )

    if (!result.rows.length) return null

    const row = result.rows[0]
    return {
      projectId: row.project_id,
      date: row.date,
      currencyCode: row.currency_code,
      sessions: row.sessions,
      leads: row.leads,
      signups: row.signups,
      payments: row.payments,
      refunds: row.refunds,
      revenueCents: Number(row.revenue_cents),
      refundsCents: Number(row.refunds_cents)
    }
  }

  /**
   * Get aggregated KPIs for a date range, all currencies
   */
  async getRangeMultiCurrency(projectId: string, startDate: string, endDate: string): Promise<MultiCurrencyKpiResult | null> {
    const result = await this.pool.query(
      `
        SELECT
          k.project_id,
          $2::date as date,
          k.currency_code,
          p.currency_code as primary_currency,
          COALESCE(SUM(sessions), 0)::int as sessions,
          COALESCE(SUM(leads), 0)::int as leads,
          COALESCE(SUM(signups), 0)::int as signups,
          COALESCE(SUM(payments), 0)::int as payments,
          COALESCE(SUM(refunds), 0)::int as refunds,
          COALESCE(SUM(revenue_cents), 0)::bigint as revenue_cents,
          COALESCE(SUM(refunds_cents), 0)::bigint as refunds_cents
        FROM business_kpi_daily k
        JOIN projects p ON p.id = k.project_id
        WHERE k.project_id = $1
          AND k.date >= $2
          AND k.date <= $3
        GROUP BY k.project_id, k.currency_code, p.currency_code
        ORDER BY k.currency_code
      `,
      [projectId, startDate, endDate]
    )

    if (!result.rows.length) return null

    const primaryCurrency = result.rows[0].primary_currency || 'USD'
    const primaryRow = result.rows.find(r => r.currency_code === primaryCurrency) || result.rows[0]

    const currencies: CurrencyBreakdown[] = result.rows.map(row => ({
      code: row.currency_code,
      revenueCents: Number(row.revenue_cents),
      refundsCents: Number(row.refunds_cents),
      payments: row.payments,
      refunds: row.refunds,
    }))

    return {
      projectId: result.rows[0].project_id,
      date: result.rows[0].date,
      primaryCurrency,
      sessions: primaryRow.sessions,
      leads: primaryRow.leads,
      signups: primaryRow.signups,
      currencies,
    }
  }

  /**
   * Get daily KPIs for the last N days (Run Hub Phase 3 - Sparklines)
   * Returns array ordered by date ascending for chart display
   */
  async getTrend(projectId: string, days: number = 7): Promise<BusinessKpiDaily[]> {
    const result = await this.pool.query(
      `
        SELECT
          k.project_id,
          k.date,
          k.currency_code,
          sessions,
          leads,
          signups,
          payments,
          refunds,
          revenue_cents,
          refunds_cents
        FROM business_kpi_daily k
        JOIN projects p ON p.id = k.project_id
        WHERE k.project_id = $1
          AND k.date >= CURRENT_DATE - ($2::int - 1)
          AND k.date <= CURRENT_DATE
          AND k.currency_code = p.currency_code
        ORDER BY k.date ASC
      `,
      [projectId, days]
    )

    return result.rows.map(row => ({
      projectId: row.project_id,
      date: row.date,
      currencyCode: row.currency_code,
      sessions: row.sessions,
      leads: row.leads,
      signups: row.signups,
      payments: row.payments,
      refunds: row.refunds,
      revenueCents: row.revenue_cents,
      refundsCents: row.refunds_cents
    }))
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let instance: BusinessKpiService | null = null

export function getBusinessKpiService(): BusinessKpiService {
  if (!instance) {
    instance = new BusinessKpiService()
  }
  return instance
}

/** Reset singleton for testing */
export function resetBusinessKpiServiceInstance(): void {
  instance = null
}
