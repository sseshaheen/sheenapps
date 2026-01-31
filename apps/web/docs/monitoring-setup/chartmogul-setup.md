# ChartMogul Setup Guide

## Overview
ChartMogul provides subscription analytics and revenue reporting for SheenApps. This guide covers setting up a custom data source to unify metrics across multiple payment gateways (Stripe, Cashier, etc.).




------------------------------------


ChartMogul Setup Guide — Phased Implementation for SheenApps

Phase 1: Account & SDK Setup

Overview

ChartMogul provides subscription analytics and revenue reporting. This guide outlines the phased implementation of ChartMogul for SheenApps.

Account Setup
	•	Create a ChartMogul account (chartmogul.com)
	•	Create a Custom Data Source called SheenApps Unified Payments
	•	Generate and store API credentials: Account Token and Secret Key

SDK Installation

npm install --save chartmogul-node p-queue

Phase 2: Core Service Integration

ChartMogul Service Class

Create chartmogul-service.ts with:
	•	upsertCustomer
	•	createSubscription
	•	upsertPlan
	•	createInvoice
	•	recordTransaction
	•	recordOneTimePurchase
	•	cancelSubscription
	•	updateSubscriptionPlan
	•	startTrial
	•	updateCustomerAttributes

Utilities
	•	calculatePeriodEnd(startDate) helper

Phase 3: Sync Worker

Worker Setup

Create chartmogul-sync-worker.ts with:
	•	Rate-limited sync using p-queue
	•	Core method: syncTransactions(limit)
	•	Helper methods:
	•	syncTransaction
	•	addMonths
	•	detectPlanInterval

Other Sync Methods
	•	syncCancellations
	•	syncPlanChanges
	•	syncTrials
	•	backupChartMogulData
	•	recoverFromBackup(backupId)

Phase 4: Cron Job Integration

Cron Route

Create chartmogul-sync/route.ts with:
	•	Sync transactions, cancellations, plan changes, trials
	•	Daily backup at 3 AM
	•	Logs for success/failure

Phase 5: Database Schema

Schema Changes
	•	Add ChartMogul-related columns to transactions, subscriptions, and users
	•	New tables:
	•	subscription_plan_changes
	•	trials
	•	chartmogul_backups
	•	failed_payments
	•	sync_schema_versions
	•	exchange_rates
	•	revenue_reconciliations
	•	plan_interval_mappings
	•	chartmogul_sync_operations

Phase 6: Dashboard Configuration

Segments & Metrics
	•	Segments: by gateway, country, referral, plan
	•	Metrics: Gateway MRR, Trial Conversion, Referral Revenue, LTV by Acquisition
	•	Reports: MRR Movement, Cohort Analysis, Geographic Performance

Phase 7: Testing & Validation

Manual Tests

const worker = new ChartMogulSyncWorker()
const results = await worker.syncTransactions(1)
console.log(results)

	•	Dashboard validation
	•	SQL checks for revenue comparison

Phase 8: Monitoring & Alerts

Observability
	•	Log sync metrics
	•	Use StatsD or Prometheus
	•	Sync failure alerts

Webhooks
	•	URL: /api/webhooks/chartmogul
	•	Events: churn, MRR, failed charges

Data QA SQL

SELECT COUNT(*) FROM transactions WHERE chartmogul_synced_at IS NULL;

Phase 9: Failed Payment Handling

Webhook Integration

Add handlers to Stripe/Cashier webhook to record failed payments with metadata

Phase 10: Multi-Currency Support

FX Conversion
	•	Sync USD equivalent
	•	Store exchange rate, base currency

Currency-Aware Plan Creation

Use planName_currency_interval pattern

Phase 11: Sync Resilience

Retry Logic
	•	Use exponential backoff
	•	Limit retries on non-recoverable errors

Circuit Breaker
	•	Open after repeated failures
	•	Backoff increases up to 32 minutes

Idempotency Tracking

Table: chartmogul_sync_operations

Phase 12: Best Practices

Do
	•	Use idempotent sync
	•	Log and alert failures
	•	Rate limit and retry
	•	Backup ChartMogul data
	•	Track LTV/CAC

Don’t
	•	Don’t sync test/incomplete data
	•	Don’t duplicate customers
	•	Don’t expose secrets

Phase 13: Troubleshooting

Issues & Fixes
	•	Duplicate customers → merge or search by external ID
	•	Revenue mismatch → validate plan & date
	•	Sync errors → check rate limits/logs

Phase 14: Implementation Checklist

Core
	•	Failed-payment events
	•	Discount support
	•	Gateway abstraction
	•	Plan pagination
	•	Circuit-breaker wiring
	•	Idempotency ledger
	•	FX rates implementation

Revenue Intelligence
	•	Negative MRR taxonomy
	•	Pricing experiment tracking
	•	Reconciliation layer

Ops & Compliance
	•	Metrics dashboard
	•	Team onboarding SOP

Prod Readiness
	•	Initial sync
	•	Historical data backfill
	•	Cron every 30m
	•	Dashboards
	•	Monitoring & alerts

Phase 15: Advanced Patterns

Gateway Abstraction

Adapters: StripeAdapter, CashierAdapter → produce NormalizedTransaction

Revenue Taxonomy

Track churn type, refund flags, LTV

Pricing Experiments

Add variants in plan.external_id, pricing_group on customer

Nightly job comparing DB, Stripe, ChartMogul MRR

Phase 16: Real-Time Enhancements (Optional)

Push From Webhooks
	•	Handle gateway event → push to ChartMogul immediately

Batch Attribute Update
	•	Collect and batch-send customer attributes

Monitoring Stack
	•	StatsD/Grafana metrics
	•	Alerts for <99.5% sync success

Changelog

v2.2 (28 June 2025)
	•	Phased implementation restructured
	•	Circuit breaker exponential cooldown added
	•	Retry limits and idempotency integrated
	•	Expanded interval detection
	•	Schema versioning added

⸻

Maintained by: SheenApps Engineering
Version: 2.2
Last Updated: 28 June 2025

------------------------------------

## Account Setup

### 1. Create ChartMogul Account
1. Go to [chartmogul.com](https://chartmogul.com)
2. Start free trial or choose plan
3. Complete onboarding

### 2. Create Custom Data Source
1. Navigate to **Data Sources**
2. Click **Add Data Source**
3. Select **Custom** (not Stripe)
4. Name: `SheenApps Unified Payments`
5. Copy the `data_source_uuid`

### 3. API Credentials
1. Go to **Profile** → **API Keys**
2. Create new API key: `Production Sync`
3. Copy Account Token and Secret Key

## Implementation Setup

### 1. ChartMogul SDK Installation
```bash
npm install --save chartmogul-node p-queue
```

### 2. Create ChartMogul Service

Create `src/services/analytics/chartmogul-service.ts`:
```typescript
import ChartMogul from 'chartmogul-node'
import { logger } from '@/utils/logger'

const config = new ChartMogul.Config(
  process.env.CHARTMOGUL_ACCOUNT_TOKEN!,
  process.env.CHARTMOGUL_SECRET_KEY!
)

export class ChartMogulService {
  private dataSourceUuid: string

  constructor() {
    this.dataSourceUuid = process.env.CHARTMOGUL_DATA_SOURCE_ID!
  }

  /**
   * Create or update customer in ChartMogul
   */
  async upsertCustomer(params: {
    externalId: string
    email: string
    name?: string
    country?: string
    currency?: string
    customAttributes?: Record<string, any>
  }) {
    try {
      // Search by external_id first to handle email changes
      let existingCustomer = null
      try {
        const customersByExternalId = await ChartMogul.Customer.all(config, {
          external_id: params.externalId,
          data_source_uuid: this.dataSourceUuid,
        })
        if (customersByExternalId.entries?.length > 0) {
          existingCustomer = customersByExternalId.entries[0]
        }
      } catch (error) {
        // External ID search not supported, fall back to email
      }

      // If not found by external_id, search by email
      if (!existingCustomer) {
        const existingCustomers = await ChartMogul.Customer.search(config, {
          email: params.email,
        })
        if (existingCustomers.entries?.length > 0) {
          existingCustomer = existingCustomers.entries[0]
        }
      }

      if (existingCustomer) {
        // Update existing customer
        return await ChartMogul.Customer.modify(config, existingCustomer.uuid, {
          name: params.name,
          country: params.country,
          currency: params.currency,
          attributes: {
            custom: params.customAttributes,
          },
        })
      }

      // Create new customer
      return await ChartMogul.Customer.create(config, {
        data_source_uuid: this.dataSourceUuid,
        external_id: params.externalId,
        email: params.email,
        name: params.name || params.email,
        country: params.country,
        currency: params.currency || 'USD',
        attributes: {
          custom: params.customAttributes,
        },
      })
    } catch (error) {
      logger.error('ChartMogul customer upsert failed:', error)
      throw error
    }
  }

  /**
   * Create subscription in ChartMogul
   */
  async createSubscription(params: {
    customerUuid: string
    externalId: string
    planUuid: string
    startDate: Date
    currency: string
    gateway: string
  }) {
    try {
      return await ChartMogul.Subscription.create(config, params.customerUuid, {
        data_source_uuid: this.dataSourceUuid,
        external_id: params.externalId,
        plan_uuid: params.planUuid,
        currency: params.currency,
        service_period_start: params.startDate.toISOString(),
        service_period_end: this.calculatePeriodEnd(params.startDate).toISOString(),
      })
    } catch (error) {
      logger.error('ChartMogul subscription creation failed:', error)
      throw error
    }
  }

  /**
   * Create or update plan in ChartMogul
   */
  async upsertPlan(params: {
    name: string
    interval: 'month' | 'year'
    intervalCount: number
    currency: string
  }) {
    // Include interval in external ID for unique identification
    // Note: ChartMogul doesn't use plan price - prices are set at invoice line item level
    const externalId = `${params.name.toLowerCase()}_${params.currency.toLowerCase()}_${params.interval}_${params.intervalCount}`

    try {
      // Search for existing plan with retry on duplicate
      const existingPlans = await ChartMogul.Plan.all(config, {
        data_source_uuid: this.dataSourceUuid,
      })

      const existingPlan = existingPlans.plans?.find(
        plan => plan.external_id === externalId
      )

      if (existingPlan) {
        return existingPlan
      }

      // Create new plan with duplicate handling
      try {
        return await ChartMogul.Plan.create(config, {
        data_source_uuid: this.dataSourceUuid,
        name: `${params.name} (${params.currency})`,
        interval_unit: params.interval,
        interval_count: params.intervalCount,
        external_id: externalId,
      })
      } catch (error: any) {
        // Handle duplicate plan creation race condition
        if (error.status === 409 || error.message?.includes('already exists')) {
          // Retry fetching the plan
          const retryPlans = await ChartMogul.Plan.all(config, {
            data_source_uuid: this.dataSourceUuid,
          })
          const plan = retryPlans.plans?.find(p => p.external_id === externalId)
          if (plan) return plan
        }
        throw error
      }
    } catch (error) {
      logger.error('ChartMogul plan upsert failed:', error)
      throw error
    }
  }

  /**
   * Record payment transaction
   */
  async recordTransaction(params: {
    customerUuid: string
    invoiceUuid: string
    amount: number
    currency: string
    date: Date
    gateway: string
    success: boolean
  }) {
    try {
      const transaction = {
        date: params.date.toISOString(),
        result: params.success ? 'successful' : 'failed',
        type: params.success ? 'payment' : 'refund',
        amount_in_cents: Math.round(params.amount * 100),
      }

      // Record both successful and failed transactions for visibility
      await ChartMogul.Transaction.create(config, params.invoiceUuid, transaction)

      return transaction
    } catch (error) {
      logger.error('ChartMogul transaction recording failed:', error)
      throw error
    }
  }

  /**
   * Create invoice for subscription payment
   */
  async createInvoice(params: {
    customerUuid: string
    subscriptionUuid: string
    currency: string
    amountInCents: number
    taxAmountInCents: number
    date: Date
    periodStart: Date
    periodEnd: Date
    externalId: string
  }) {
    try {
      return await ChartMogul.Invoice.create(config, params.customerUuid, {
        currency: params.currency,
        date: params.date.toISOString(),
        external_id: params.externalId,
        line_items: [
          {
            type: 'subscription',
            subscription_uuid: params.subscriptionUuid,
            service_period_start: params.periodStart.toISOString(),
            service_period_end: params.periodEnd.toISOString(),
            amount_in_cents: params.amountInCents,
            discount_amount_in_cents: 0,
            tax_amount_in_cents: params.taxAmountInCents || 0,
          },
        ],
      })
    } catch (error) {
      logger.error('ChartMogul invoice creation failed:', error)
      throw error
    }
  }

  /**
   * Cancel subscription in ChartMogul
   */
  async cancelSubscription(subscriptionUuid: string, cancelledAt: Date) {
    try {
      return await ChartMogul.Subscription.cancel(
        config,
        subscriptionUuid,
        { cancelled_at: cancelledAt.toISOString() }
      )
    } catch (error) {
      logger.error('ChartMogul subscription cancellation failed:', error)
      throw error
    }
  }

  /**
   * Record one-time purchase (non-subscription product)
   */
  async recordOneTimePurchase(params: {
    customerUuid: string
    amount: number
    currency: string
    date: Date
    description: string
    externalId: string
  }) {
    try {
      // Create a one-time invoice
      const invoice = await ChartMogul.Invoice.create(config, params.customerUuid, {
        currency: params.currency,
        date: params.date.toISOString(),
        external_id: params.externalId,
        line_items: [
          {
            type: 'one_time',
            description: params.description,
            amount_in_cents: Math.round(params.amount * 100),
            discount_amount_in_cents: 0,
            tax_amount_in_cents: 0,
          },
        ],
      })

      // Record payment transaction
      await ChartMogul.Transaction.create(config, invoice.uuid, {
        date: params.date.toISOString(),
        result: 'successful',
        type: 'payment',
      })

      return invoice
    } catch (error) {
      logger.error('ChartMogul one-time purchase recording failed:', error)
      throw error
    }
  }

  /**
   * Update subscription (for plan changes)
   */
  async updateSubscriptionPlan(params: {
    subscriptionUuid: string
    newPlanUuid: string
    effectiveDate: Date
  }) {
    try {
      return await ChartMogul.Subscription.modify(config, params.subscriptionUuid, {
        plan_uuid: params.newPlanUuid,
        service_period_start: params.effectiveDate.toISOString(),
      })
    } catch (error) {
      logger.error('ChartMogul subscription update failed:', error)
      throw error
    }
  }

  /**
   * Start trial period for customer
   */
  async startTrial(params: {
    customerUuid: string
    planUuid: string
    trialEndDate: Date
    externalId: string
  }) {
    try {
      // Create subscription with trial
      return await ChartMogul.Subscription.create(config, params.customerUuid, {
        data_source_uuid: this.dataSourceUuid,
        external_id: params.externalId,
        plan_uuid: params.planUuid,
        service_period_start: new Date().toISOString(),
        service_period_end: params.trialEndDate.toISOString(),
        trial_ends_at: params.trialEndDate.toISOString(),
      })
    } catch (error) {
      logger.error('ChartMogul trial creation failed:', error)
      throw error
    }
  }

  /**
   * Add custom attributes to customer
   */
  async updateCustomerAttributes(
    customerUuid: string,
    attributes: Record<string, any>
  ) {
    try {
      // Add LTV/CAC tracking attributes
      const enrichedAttributes = {
        ...attributes,
        acquisition_channel: attributes.utm_source || 'organic',
        acquisition_cost: attributes.acquisition_cost || 0,
        onboarding_completed: attributes.onboarding_completed || false,
        product_usage_score: attributes.product_usage_score || 0,
      }

      return await ChartMogul.Customer.attributes(config, customerUuid, {
        custom: enrichedAttributes,
      })
    } catch (error) {
      logger.error('ChartMogul attribute update failed:', error)
      throw error
    }
  }

  /**
   * Helper to calculate period end date
   */
  private calculatePeriodEnd(startDate: Date): Date {
    // Ensure UTC to avoid timezone drift
    const endDate = new Date(startDate.toISOString())
    endDate.setUTCMonth(endDate.getUTCMonth() + 1)
    return endDate
  }
}
```

### 3. Create Sync Worker

Create `src/services/analytics/chartmogul-sync-worker.ts`:
```typescript
import { createClient } from '@/utils/supabase/server'
import { ChartMogulService } from './chartmogul-service'
import { logger } from '@/utils/logger'
import PQueue from 'p-queue'

export class ChartMogulSyncWorker {
  private chartmogul: ChartMogulService
  private supabase: any
  private queue: PQueue

  constructor() {
    this.chartmogul = new ChartMogulService()
    this.supabase = createClient()
    // Rate limit to 90 requests per minute (under ChartMogul's 100/min limit)
    this.queue = new PQueue({
      concurrency: 3,
      interval: 60000,
      intervalCap: 90
    })
  }

  /**
   * Main sync process - run via cron job
   */
  async syncTransactions(limit = 100): Promise<{
    synced: number
    failed: number
    errors: any[]
  }> {
    const results = {
      synced: 0,
      failed: 0,
      errors: [] as any[],
    }

    try {
      // Get unsynced transactions
      const { data: transactions, error } = await this.supabase
        .from('transactions')
        .select(`
          *,
          users!inner(email, name),
          subscriptions(plan_name, stripe_subscription_id)
        `)
        .is('chartmogul_synced_at', null)
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .limit(limit)

      if (error) throw error

      if (!transactions || transactions.length === 0) {
        return results
      }

      // Process each transaction with rate limiting
      for (const transaction of transactions) {
        try {
          await this.queue.add(async () => {
            await this.syncTransaction(transaction)
          })
          results.synced++

          // Mark as synced
          await this.supabase
            .from('transactions')
            .update({
              chartmogul_synced_at: new Date().toISOString(),
              chartmogul_sync_error: null,
            })
            .eq('id', transaction.id)

        } catch (error: any) {
          results.failed++
          results.errors.push({
            transactionId: transaction.id,
            error: error.message,
          })

          // Log sync failure
          await this.supabase
            .from('transactions')
            .update({
              chartmogul_sync_error: error.message,
              chartmogul_sync_attempts: (transaction.chartmogul_sync_attempts || 0) + 1,
            })
            .eq('id', transaction.id)

          logger.error('ChartMogul sync failed for transaction:', {
            transactionId: transaction.id,
            error: error.message,
          })
        }
      }

      return results
    } catch (error) {
      logger.error('ChartMogul sync worker error:', error)
      throw error
    }
  }

  /**
   * Sync individual transaction
   */
  private async syncTransaction(transaction: any) {
    // 1. Upsert customer
    const customer = await this.chartmogul.upsertCustomer({
      externalId: transaction.user_id,
      email: transaction.users.email,
      name: transaction.users.name,
      country: transaction.country,
      currency: transaction.currency,
      customAttributes: {
        gateway: transaction.gateway,
        utm_source: transaction.utm_source,
        utm_medium: transaction.utm_medium,
        utm_campaign: transaction.utm_campaign,
        referrer_id: transaction.metadata?.referrer_user_id,
      },
    })

    // 2. Upsert plan (with proper interval detection)
    const planInterval = this.detectPlanInterval(transaction.plan_name)
    const plan = await this.chartmogul.upsertPlan({
      name: transaction.plan_name,
      interval: planInterval.interval,
      intervalCount: planInterval.intervalCount,
      currency: transaction.currency,
    })

    // 3. Handle different product types
    if (transaction.product_type === 'one_time') {
      // Handle one-time purchases
      await this.chartmogul.recordOneTimePurchase({
        customerUuid: customer.uuid,
        amount: transaction.amount_cents / 100,
        currency: transaction.currency,
        date: new Date(transaction.transaction_date),
        description: transaction.product_name || 'One-time purchase',
        externalId: `${transaction.gateway}_${transaction.id}`,
      })
    } else if (transaction.product_type === 'subscription' && transaction.subscriptions) {
      // Create or find subscription
      const subscription = await this.chartmogul.createSubscription({
        customerUuid: customer.uuid,
        externalId: transaction.gateway_transaction_id,
        planUuid: plan.uuid,
        startDate: new Date(transaction.transaction_date),
        currency: transaction.currency,
        gateway: transaction.gateway,
      })

      // Calculate tax amount from rate if not provided
      let taxAmountCents = transaction.metadata?.tax_amount_cents
      if (!taxAmountCents && transaction.metadata?.tax_rate) {
        const taxRate = parseFloat(transaction.metadata.tax_rate)
        taxAmountCents = Math.round(transaction.amount_cents * taxRate)
      }

      // Create invoice
      const invoice = await this.chartmogul.createInvoice({
        customerUuid: customer.uuid,
        subscriptionUuid: subscription.uuid,
        currency: transaction.currency,
        amountInCents: transaction.amount_cents,
        taxAmountInCents: taxAmountCents || 0,
        date: new Date(transaction.transaction_date),
        periodStart: new Date(transaction.transaction_date),
        periodEnd: this.addMonths(new Date(transaction.transaction_date), 1),
        externalId: `${transaction.gateway}_${transaction.id}`,
      })

      // Record payment
      await this.chartmogul.recordTransaction({
        customerUuid: customer.uuid,
        invoiceUuid: invoice.uuid,
        amount: transaction.amount_cents / 100,
        currency: transaction.currency,
        date: new Date(transaction.transaction_date),
        gateway: transaction.gateway,
        success: true,
      })
    }

    // Update customer UUID for future reference
    await this.supabase
      .from('transactions')
      .update({
        chartmogul_customer_uuid: customer.uuid,
      })
      .eq('id', transaction.id)
  }

  /**
   * Helper to add months to date
   */
  private addMonths(date: Date, months: number): Date {
    // Ensure UTC to avoid timezone drift
    const result = new Date(date.toISOString())
    result.setUTCMonth(result.getUTCMonth() + months)
    return result
  }

  /**
   * Detect plan interval from plan name
   */
  private detectPlanInterval(planName: string): {
    interval: 'month' | 'year'
    intervalCount: number
  } {
    const lowerName = planName.toLowerCase()

    // Check common patterns
    if (lowerName.includes('annual') || lowerName.includes('yearly') || lowerName.includes('1y')) {
      return { interval: 'year', intervalCount: 1 }
    } else if (lowerName.includes('quarterly') || lowerName.includes('3mo') || lowerName.includes('3m')) {
      return { interval: 'month', intervalCount: 3 }
    } else if (lowerName.includes('biannual') || lowerName.includes('semi-annual') ||
               lowerName.includes('6mo') || lowerName.includes('6m')) {
      return { interval: 'month', intervalCount: 6 }
    } else if (lowerName.includes('biennial') || lowerName.includes('2y')) {
      return { interval: 'year', intervalCount: 2 }
    }

    // Default to monthly
    return { interval: 'month', intervalCount: 1 }
  }

  /**
   * Sync subscription cancellations
   */
  async syncCancellations(): Promise<void> {
    const { data: cancellations } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'canceled')
      .is('chartmogul_cancelled_at', null)
      .not('chartmogul_subscription_uuid', 'is', null)

    for (const subscription of cancellations || []) {
      try {
        await this.chartmogul.cancelSubscription(
          subscription.chartmogul_subscription_uuid,
          new Date(subscription.updated_at)
        )

        await this.supabase
          .from('subscriptions')
          .update({
            chartmogul_cancelled_at: new Date().toISOString(),
          })
          .eq('id', subscription.id)
      } catch (error) {
        logger.error('Failed to sync cancellation:', error)
      }
    }
  }

  /**
   * Sync plan changes (upgrades/downgrades)
   */
  async syncPlanChanges(): Promise<void> {
    const { data: planChanges } = await this.supabase
      .from('subscription_plan_changes')
      .select(`
        *,
        subscriptions(chartmogul_subscription_uuid)
      `)
      .is('chartmogul_synced_at', null)
      .not('subscriptions.chartmogul_subscription_uuid', 'is', null)

    for (const change of planChanges || []) {
      try {
        // Get the new plan
        const planInterval = this.detectPlanInterval(change.new_plan_name)
        const newPlan = await this.chartmogul.upsertPlan({
          name: change.new_plan_name,
          interval: planInterval.interval,
          intervalCount: planInterval.intervalCount,
          currency: change.currency,
        })

        // Update the subscription
        await this.chartmogul.updateSubscriptionPlan({
          subscriptionUuid: change.subscriptions.chartmogul_subscription_uuid,
          newPlanUuid: newPlan.uuid,
          effectiveDate: new Date(change.effective_date),
        })

        // Mark as synced
        await this.supabase
          .from('subscription_plan_changes')
          .update({
            chartmogul_synced_at: new Date().toISOString(),
          })
          .eq('id', change.id)
      } catch (error) {
        logger.error('Failed to sync plan change:', error)
      }
    }
  }

  /**
   * Sync trial starts
   */
  async syncTrials(): Promise<void> {
    const { data: trials } = await this.supabase
      .from('trials')
      .select(`
        *,
        users(email, name)
      `)
      .is('chartmogul_synced_at', null)
      .eq('status', 'active')

    for (const trial of trials || []) {
      try {
        // Ensure customer exists
        const customer = await this.chartmogul.upsertCustomer({
          externalId: trial.user_id,
          email: trial.users.email,
          name: trial.users.name,
          customAttributes: {
            in_trial: true,
            trial_start_date: trial.started_at,
            trial_end_date: trial.ends_at,
          },
        })

        // Get trial plan
        const plan = await this.chartmogul.upsertPlan({
          name: trial.plan_name,
          interval: 'month',
          intervalCount: 1,
          currency: 'USD',
        })

        // Create trial subscription
        await this.chartmogul.startTrial({
          customerUuid: customer.uuid,
          planUuid: plan.uuid,
          trialEndDate: new Date(trial.ends_at),
          externalId: `trial_${trial.id}`,
        })

        // Mark as synced
        await this.supabase
          .from('trials')
          .update({
            chartmogul_synced_at: new Date().toISOString(),
          })
          .eq('id', trial.id)
      } catch (error) {
        logger.error('Failed to sync trial:', error)
      }
    }
  }

  /**
   * Backup ChartMogul data
   */
  async backupChartMogulData(): Promise<void> {
    try {
      const backup = {
        timestamp: new Date().toISOString(),
        customers: [],
        subscriptions: [],
        plans: [],
      }

      // Backup customers
      let hasMore = true
      let page = 1
      while (hasMore) {
        const customers = await ChartMogul.Customer.all(config, {
          page,
          per_page: 200,
        })
        backup.customers.push(...customers.entries)
        hasMore = customers.has_more
        page++
      }

      // Store backup
      await this.supabase
        .from('chartmogul_backups')
        .insert({
          backup_date: backup.timestamp,
          data: backup,
          record_count: backup.customers.length,
        })

      logger.info('ChartMogul backup completed', {
        customerCount: backup.customers.length,
      })
    } catch (error) {
      logger.error('ChartMogul backup failed:', error)
      throw error
    }
  }

  /**
   * Recover from sync failures using backup
   */
  async recoverFromBackup(backupId: string): Promise<void> {
    const { data: backup } = await this.supabase
      .from('chartmogul_backups')
      .select('*')
      .eq('id', backupId)
      .single()

    if (!backup) {
      throw new Error('Backup not found')
    }

    // Re-sync based on backup data
    for (const customer of backup.data.customers) {
      try {
        await this.syncCustomerFromBackup(customer)
      } catch (error) {
        logger.error('Failed to recover customer:', error)
      }
    }
  }
}
```

### 4. Create Cron Job

Create `src/app/api/cron/chartmogul-sync/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ChartMogulSyncWorker } from '@/services/analytics/chartmogul-sync-worker'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const worker = new ChartMogulSyncWorker()

    // Sync transactions
    const transactionResults = await worker.syncTransactions(100)

    // Sync cancellations
    await worker.syncCancellations()

    // Sync plan changes
    await worker.syncPlanChanges()

    // Sync trials
    await worker.syncTrials()

    // Daily backup (run at 3 AM)
    const hour = new Date().getUTCHours()
    if (hour === 3) {
      await worker.backupChartMogulData()
    }

    logger.info('ChartMogul sync completed:', transactionResults)

    return NextResponse.json({
      success: true,
      results: transactionResults,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    logger.error('ChartMogul sync cron error:', error)

    return NextResponse.json(
      {
        error: 'Sync failed',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
```

## Database Schema Updates

Add ChartMogul tracking columns:
```sql
-- Add to transactions table
ALTER TABLE transactions
  ADD COLUMN chartmogul_synced_at TIMESTAMP,
  ADD COLUMN chartmogul_customer_uuid VARCHAR(255),
  ADD COLUMN chartmogul_sync_error TEXT,
  ADD COLUMN chartmogul_sync_attempts INTEGER DEFAULT 0;

CREATE INDEX idx_transactions_chartmogul_sync
  ON transactions(chartmogul_synced_at)
  WHERE chartmogul_synced_at IS NULL;

-- Add to subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN chartmogul_subscription_uuid VARCHAR(255),
  ADD COLUMN chartmogul_cancelled_at TIMESTAMP;

-- Add plan changes tracking
CREATE TABLE subscription_plan_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  old_plan_name VARCHAR(255) NOT NULL,
  new_plan_name VARCHAR(255) NOT NULL,
  old_price_cents INTEGER NOT NULL,
  new_price_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  change_type VARCHAR(50) NOT NULL, -- 'upgrade', 'downgrade', 'lateral'
  effective_date TIMESTAMP NOT NULL,
  chartmogul_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_plan_changes_sync ON subscription_plan_changes(chartmogul_synced_at);

-- Add trials tracking
CREATE TABLE trials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  plan_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  converted_at TIMESTAMP,
  chartmogul_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trials_sync ON trials(chartmogul_synced_at);

-- Add backup table
CREATE TABLE chartmogul_backups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_date TIMESTAMP NOT NULL,
  data JSONB NOT NULL,
  record_count INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add multi-currency support
ALTER TABLE transactions
  ADD COLUMN exchange_rate DECIMAL(10,6),
  ADD COLUMN base_currency VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN base_amount_cents INTEGER;

-- Add unique constraint for plan external_id
ALTER TABLE chartmogul_plans
  ADD CONSTRAINT uk_chartmogul_plans_external_id UNIQUE (external_id);

-- Add interval mapping table
CREATE TABLE plan_interval_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_name_pattern VARCHAR(255) NOT NULL,
  interval VARCHAR(10) NOT NULL,
  interval_count INTEGER NOT NULL,
  priority INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert common patterns
INSERT INTO plan_interval_mappings (plan_name_pattern, interval, interval_count, priority) VALUES
  ('annual', 'year', 1, 90),
  ('yearly', 'year', 1, 90),
  ('quarterly', 'month', 3, 90),
  ('semi-annual', 'month', 6, 90),
  ('biannual', 'month', 6, 90),
  ('biennial', 'year', 2, 90),
  ('monthly', 'month', 1, 100);

-- Add failed payment tracking
CREATE TABLE failed_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id),
  failure_reason VARCHAR(500),
  gateway_error_code VARCHAR(100),
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP,
  chartmogul_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add schema versioning
CREATE TABLE sync_schema_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW()
);

-- Add FX rate cache
CREATE TABLE exchange_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(10,6) NOT NULL,
  rate_date DATE NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, rate_date)
);

-- Add revenue reconciliation tracking
CREATE TABLE revenue_reconciliations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reconciliation_date DATE NOT NULL,
  local_mrr DECIMAL(10,2),
  chartmogul_mrr DECIMAL(10,2),
  stripe_mrr DECIMAL(10,2),
  discrepancies JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  resolved_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add PII level to users
ALTER TABLE users
  ADD COLUMN pii_level VARCHAR(50) DEFAULT 'normal',
  ADD COLUMN chartmogul_deleted_at TIMESTAMP;

-- Add pricing experiment tracking
ALTER TABLE subscriptions
  ADD COLUMN pricing_variant VARCHAR(10),
  ADD COLUMN pricing_group VARCHAR(50);
```

## Dashboard Configuration

### 1. Segmentation Setup

In ChartMogul dashboard:
1. Go to **Data** → **Segments**
2. Create segments:
   - **By Gateway**: Custom attribute `gateway`
   - **By Country**: Built-in geo segmentation
   - **By Referral**: Custom attribute `referrer_id exists`
   - **By Plan**: Subscription plan filter

### 2. Custom Metrics

Create custom metrics:
1. **Gateway MRR**:
   - Metric: MRR
   - Segment: By Gateway

2. **Trial Conversion Rate**:
   - Metric: Customer Count
   - Filter: Trial → Paid transition
   - Track trial-to-paid conversion funnel

3. **Referral Revenue**:
   - Metric: MRR
   - Filter: Has referrer_id

4. **LTV by Acquisition Channel**:
   - Metric: LTV
   - Segment: By acquisition_channel attribute
   - Compare with CAC for ROI analysis

5. **Plan Movement Analysis**:
   - Track upgrades vs downgrades
   - Monitor expansion revenue
   - Identify churn risk patterns

### 3. Reports Configuration

Set up key reports:
1. **MRR Movement**:
   - New Business
   - Expansion
   - Contraction
   - Churn
   - Reactivation

2. **Cohort Analysis**:
   - Monthly cohorts
   - Retention curves
   - LTV by cohort

3. **Geographic Performance**:
   - MRR by country
   - ARPU by region
   - Churn by location

## Testing & Validation

### 1. Test Sync
```typescript
// Manual test sync
const worker = new ChartMogulSyncWorker()
const results = await worker.syncTransactions(1)
console.log('Sync results:', results)
```

### 2. Verify in Dashboard
1. Check ChartMogul dashboard
2. Verify customer creation
3. Check subscription data
4. Validate revenue numbers

### 3. Compare Metrics
```sql
-- Compare local MRR with ChartMogul
SELECT
  DATE_TRUNC('month', created_at) as month,
  SUM(amount_cents) / 100 as local_mrr
FROM transactions
WHERE status = 'completed'
  AND product_type = 'subscription'
GROUP BY month
ORDER BY month DESC;
```

## Monitoring & Alerts

### 1. Sync Monitoring
```typescript
// Add to sync worker
if (results.failed > 0) {
  await notifyAdminOfSyncFailures(results.errors)
}

// Track sync performance
await trackMetric('chartmogul.sync.success', results.synced)
await trackMetric('chartmogul.sync.failed', results.failed)
```

### 2. Set Up Webhooks
In ChartMogul:
1. Go to **Settings** → **Webhooks**
2. Add webhook URL: `https://app.sheenapps.com/api/webhooks/chartmogul`
3. Select events:
   - Customer churn
   - MRR movements
   - Failed charges

### 3. Data Quality Checks
```sql
-- Find unsynced old transactions
SELECT COUNT(*) as unsynced_count
FROM transactions
WHERE chartmogul_synced_at IS NULL
  AND created_at < NOW() - INTERVAL '7 days'
  AND status = 'completed';

-- Check sync failures
SELECT
  chartmogul_sync_error,
  COUNT(*) as error_count
FROM transactions
WHERE chartmogul_sync_error IS NOT NULL
GROUP BY chartmogul_sync_error
ORDER BY error_count DESC;
```

## Failed Payment Handling

To ensure failed payments are tracked in ChartMogul, update your gateway webhook handlers:

```typescript
// In your Stripe webhook handler
case 'invoice.payment_failed':
  const userId = await getUserIdFromStripeCustomer(invoice.customer)

  // Create failed transaction record
  await createTransaction({
    userId,
    gateway: 'stripe',
    gatewayTransactionId: invoice.id,
    status: 'failed',
    amount: invoice.amount_due / 100,
    currency: invoice.currency,
    planName: invoice.lines.data[0]?.description,
    productType: 'subscription',
    metadata: {
      failure_reason: invoice.last_finalization_error?.message,
      attempt_count: invoice.attempt_count,
    },
  })
  break

case 'payment_intent.payment_failed':
  const userId = await getUserIdFromStripeCustomer(paymentIntent.customer)

  // Create failed one-time payment record
  await createTransaction({
    userId,
    gateway: 'stripe',
    gatewayTransactionId: paymentIntent.id,
    status: 'failed',
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    productType: 'one_time',
    metadata: {
      failure_reason: paymentIntent.last_payment_error?.message,
      failure_code: paymentIntent.last_payment_error?.code,
    },
  })
  break
```

## Multi-Currency Support

### Exchange Rate Handling
```typescript
// Add to sync worker
async syncWithExchangeRate(transaction: any) {
  // Get exchange rate if not USD
  let exchangeRate = 1
  let baseAmountCents = transaction.amount_cents

  if (transaction.currency !== 'USD') {
    exchangeRate = await this.getExchangeRate(transaction.currency, 'USD', transaction.transaction_date)
    baseAmountCents = Math.round(transaction.amount_cents * exchangeRate)
  }

  // Store for reporting
  await this.supabase
    .from('transactions')
    .update({
      exchange_rate: exchangeRate,
      base_currency: 'USD',
      base_amount_cents: baseAmountCents,
    })
    .eq('id', transaction.id)
}
```

### Currency-Specific Plans
```typescript
// Ensure plans are created per currency
const planKey = `${planName}_${currency}`
const plan = await this.chartmogul.upsertPlan({
  name: planName,
  interval: 'month',
  intervalCount: 1,
  currency: currency,
})
```

## Sync Resilience

### Retry Mechanism
```typescript
export class ResilientChartMogulSync {
  private maxRetries = 3
  private retryDelay = 1000 // Start with 1 second

  async syncWithRetry(operation: () => Promise<any>, context: string) {
    let lastError: any

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error: any) {
        lastError = error

        // Don't retry on certain errors
        if (error.status === 422 || error.status === 400) {
          throw error
        }

        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1)
        logger.warn(`ChartMogul sync failed, retrying in ${delay}ms`, {
          context,
          attempt,
          error: error.message,
        })

        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }
}
```

### Circuit Breaker
```typescript
export class ChartMogulCircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private readonly threshold = 5
  private readonly baseTimeout = 60000 // 1 minute
  private consecutiveFailures = 0

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Exponential backoff for circuit breaker timeout
      const timeout = this.baseTimeout * Math.pow(2, Math.min(this.consecutiveFailures - 1, 5))
      if (Date.now() - this.lastFailureTime > timeout) {
        this.state = 'half-open'
      } else {
        throw new Error('Circuit breaker is open')
      }
    }

    try {
      const result = await operation()
      if (this.state === 'half-open') {
        this.state = 'closed'
        this.failures = 0
        this.consecutiveFailures = 0
      }
      return result
    } catch (error) {
      this.failures++
      this.lastFailureTime = Date.now()

      if (this.failures >= this.threshold) {
        this.state = 'open'
        this.consecutiveFailures++
        logger.error('ChartMogul circuit breaker opened', {
          failures: this.failures,
          backoffMinutes: Math.pow(2, Math.min(this.consecutiveFailures - 1, 5)),
        })
      }

      throw error
    }
  }
}
```

### Idempotency Tracking
```typescript
// Track sync operations to prevent duplicates
CREATE TABLE chartmogul_sync_operations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL,
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_sync_operations_key ON chartmogul_sync_operations(idempotency_key);
```

## Best Practices

### Do's
- Sync data in batches with rate limiting
- Handle API rate limits with exponential backoff
- Map plans consistently including interval
- Use idempotent operations with tracking
- Monitor sync health with metrics
- Keep local data as source of truth
- Implement circuit breakers for resilience
- Backup ChartMogul data regularly
- Track LTV/CAC by acquisition channel
- Handle multi-currency with exchange rates
- Sync trials and plan changes
- Record one-time purchases separately

### Don'ts
- Don't sync incomplete transactions
- Don't duplicate customers
- Don't ignore sync failures
- Don't sync test data to production
- Don't expose API keys
- Don't sync PII unnecessarily
- Don't assume sync operations are atomic
- Don't retry non-recoverable errors

## Troubleshooting

### Common Issues

1. **Duplicate Customers**
   - Use email as unique identifier
   - Check before creating
   - Merge duplicates in ChartMogul

2. **Missing Revenue**
   - Verify transaction status
   - Check date ranges
   - Ensure proper plan mapping

3. **Sync Failures**
   - Check API limits
   - Verify data completeness
   - Review error logs

## Implementation Checklist

### Core Updates (High Priority)
- [ ] **Failed-payment events** - Record with `type: 'payment'`, `result: 'failed'` (not refund)
- [ ] **Discount support** - Pass `discount_amount_in_cents` in createInvoice
- [ ] **Gateway abstraction** - Introduce `NormalizedTransaction` interface + adapters per gateway
- [ ] **Plan pagination** - Loop through all pages of `ChartMogul.Plan.all()` when searching
- [ ] **Circuit-breaker wiring** - Wrap every ChartMogul SDK call with `circuitBreaker.execute()`
- [ ] **Idempotency ledger** - Check `chartmogul_sync_operations` before upsert/create; write row after success
- [ ] **Interval detection** - Replace string heuristics with DB lookup against `plan_interval_mappings`
- [ ] **Exchange rate implementation** - Implement `getExchangeRate()` with real FX provider

### Revenue Intelligence
- [ ] **Negative-MRR taxonomy** - Tag churn type (voluntary/involuntary) and refund_flag in customer attributes
- [ ] **Pricing experiment tags** - Encode variant in plan.external_id (e.g. `_A`, `_B`) and add pricing_group to customers
- [ ] **Reconciliation layer** - Build nightly snapshot + UI comparing DB totals, gateway exports, and ChartMogul MRR

### Operations & Compliance
- [ ] **Metrics & dashboard** - Emit Prom/StatsD counters (sync_success, sync_failed, latency); create Grafana board & alerts

- [ ] **Stakeholder enablement** - Create saved ChartMogul views, SOP doc, schedule onboarding for Growth/Ops teams

### Production Readiness
- [ ] Custom data source created
- [ ] API credentials secured
- [ ] Database columns added (including new tables)
- [ ] Sync worker deployed with retry logic
- [ ] Circuit breaker implemented
- [ ] Cron job scheduled (every 30 minutes)
- [ ] Initial sync completed
- [ ] Historical data backfilled
- [ ] Dashboards configured
- [ ] LTV/CAC tracking enabled
- [ ] Multi-currency support tested
- [ ] Backup automation configured
- [ ] Sync monitoring alerts set up
- [ ] Recovery procedures documented
- [ ] Team trained on troubleshooting

---

*Last Updated: 28 June 2025*
*Version: 2.2*

## Advanced Implementation Patterns

### Gateway Abstraction Layer

```typescript
// Normalized transaction interface
interface NormalizedTransaction {
  id: string
  userId: string
  amount: number
  currency: string
  status: 'completed' | 'failed' | 'pending'
  type: 'subscription' | 'one_time'
  gateway: string
  gatewayTransactionId: string
  planName?: string
  interval?: 'month' | 'year'
  intervalCount?: number
  metadata: {
    taxRate?: number
    taxAmount?: number
    discountRate?: number
    discountAmount?: number
    failureReason?: string
    refundAmount?: number
    churnType?: 'voluntary' | 'involuntary'
  }
}

// Gateway adapters
class StripeAdapter {
  normalize(stripeEvent: Stripe.Event): NormalizedTransaction {
    // Convert Stripe-specific format to normalized
  }
}

class CashierAdapter {
  normalize(cashierWebhook: any): NormalizedTransaction {
    // Convert Cashier-specific format to normalized
  }
}
```

### Revenue Taxonomy & Churn Analysis

```typescript
// Enhanced customer attributes for churn analysis
async updateCustomerChurnData(customerId: string, churnData: {
  churnType: 'voluntary' | 'involuntary'
  churnReason?: string
  hadRefund: boolean
  lifetimeValue: number
  monthsActive: number
}) {
  await this.chartmogul.updateCustomerAttributes(customerId, {
    churn_type: churnData.churnType,
    churn_reason: churnData.churnReason,
    had_refund: churnData.hadRefund,
    ltv_at_churn: churnData.lifetimeValue,
    months_active: churnData.monthsActive,
    churn_date: new Date().toISOString(),
  })
}
```

### Pricing Experiments Support

```typescript
// Include variant in plan external_id
function createPlanExternalId(params: {
  name: string
  currency: string
  interval: string
  intervalCount: number
  variant?: string
}): string {
  const base = `${params.name}_${params.currency}_${params.interval}_${params.intervalCount}`.toLowerCase()
  return params.variant ? `${base}_${params.variant}` : base
}

// Tag customers with pricing group
await this.chartmogul.updateCustomerAttributes(customerId, {
  pricing_group: 'early_adopter',
  pricing_variant: 'A',
  grandfathered: true,
})
```

### Reconciliation System

```typescript
// Nightly reconciliation job
export async function runReconciliation() {
  const date = new Date()
  const results = {
    date: date.toISOString(),
    discrepancies: [],
    totals: {}
  }

  // Get local MRR
  const { data: localMRR } = await supabase
    .from('subscription_metrics')
    .select('mrr')
    .eq('date', date.toISOString().split('T')[0])
    .single()

  // Get ChartMogul MRR
  const chartMogulMRR = await ChartMogul.Metrics.mrr(config, {
    start_date: date.toISOString(),
    end_date: date.toISOString(),
  })

  // Get gateway MRR (example: Stripe)
  const stripeMRR = await calculateStripeMRR(date)

  // Compare
  if (Math.abs(localMRR.mrr - chartMogulMRR.mrr) > 0.01) {
    results.discrepancies.push({
      type: 'mrr_mismatch',
      local: localMRR.mrr,
      chartmogul: chartMogulMRR.mrr,
      difference: localMRR.mrr - chartMogulMRR.mrr,
    })
  }

  // Store reconciliation results
  await supabase
    .from('revenue_reconciliations')
    .insert(results)

  // Alert if discrepancies
  if (results.discrepancies.length > 0) {
    await notifyFinanceTeam(results)
  }
}
```

## Real-Time Updates (Nice-to-Have)

### Push from Gateway Webhooks
```typescript
// In your Stripe webhook handler
export async function handleStripeWebhook(event: Stripe.Event) {
  // Handle Stripe events first
  await processStripeEvent(event)

  // Push to ChartMogul in real-time
  if (shouldSyncToChartMogul(event.type)) {
    try {
      await pushToChartMogul(event)
    } catch (error) {
      // Queue for retry via cron job
      await queueForChartMogulSync(event)
    }
  }
}
```

### Batch Attribute Updates
```typescript
// Daily batch update of customer attributes
export async function batchUpdateCustomerAttributes() {
  const updates = await collectPendingAttributeUpdates()

  if (updates.length > 0) {
    await ChartMogul.CustomerAttributes.add(config, {
      attributes: updates.map(u => ({
        external_id: u.externalId,
        attributes: u.attributes,
      })),
    })
  }
}
```

### Monitoring Integration
```typescript
// Send metrics to monitoring stack
import { StatsD } from 'node-statsd'

const statsd = new StatsD({
  host: process.env.STATSD_HOST,
  prefix: 'chartmogul.sync.',
})

// Track sync metrics
statsd.increment('transactions.synced', results.synced)
statsd.increment('transactions.failed', results.failed)
statsd.gauge('sync.duration', Date.now() - startTime)

// Set up SLO alerts (≥99.5% success rate)
const successRate = results.synced / (results.synced + results.failed)
statsd.gauge('success_rate', successRate)
```

## Changelog

### Version 2.1 (June 28, 2025) - Quick-Fix Tweaks
- Removed priceInCents from upsertPlan (ChartMogul ignores plan prices)
- Added amount_in_cents to recordTransaction for accurate revenue
- Added duplicate plan creation guard with 409 retry
- Search customers by external_id first to handle email changes
- Added p-queue rate limiting (90 req/min, under ChartMogul's 100/min limit)
- Calculate tax_amount_in_cents from tax_rate if not provided
- Ensured all timestamps use UTC to prevent timezone drift
- Record failed payments as transactions for recovery visibility
- Expanded interval detection (semi-annual, 6mo, biennial, etc.)
- Made circuit breaker cooldown exponential (up to 32 minutes)
- Added schema versioning and FX rate cache tables
- Added real-time webhook push pattern (nice-to-have)
- Added batch attribute update pattern (nice-to-have)
- Added monitoring integration example (nice-to-have)

### Version 2.0 (June 28, 2025)
- Added plan interval mapping logic
- Added support for one-time purchases
- Added plan change tracking (upgrades/downgrades)
- Added trial period synchronization
- Added LTV/CAC tracking attributes
- Added backup and recovery system
- Added multi-currency support preparation
- Added sync resilience features (retry, circuit breaker)
- Added idempotency tracking
- Enhanced error handling and monitoring
