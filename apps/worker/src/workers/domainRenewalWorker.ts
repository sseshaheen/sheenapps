/**
 * Domain Renewal Worker
 *
 * Handles domain renewal reminders and auto-renewal processing.
 *
 * Processing Pattern:
 * 1. Scheduled job runs daily
 * 2. Query domains expiring in 30/7/1 days - send reminders
 * 3. Query domains expiring tomorrow with auto_renew=true - process renewals
 * 4. Handle payment failures with retry logic
 *
 * Part of easy-mode-email-plan.md (Phase 3: Domain Registration)
 */

import { Worker, Job, Queue } from 'bullmq'
import { getPool } from '../services/databaseWrapper'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import {
  getDomainBillingService,
  isDomainBillingConfigured,
} from '../services/inhouse/DomainBillingService'
import {
  getOpenSrsService,
  isOpenSrsConfigured,
} from '../services/inhouse/OpenSrsService'
import { getInhouseEmailService } from '../services/inhouse/InhouseEmailService'
import { getBestEffortRedis } from '../services/redisBestEffort'

// =============================================================================
// Configuration
// =============================================================================

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
}

// Renewal reminder thresholds (days before expiry)
const REMINDER_THRESHOLDS = [30, 7, 1]

// Auto-renewal is processed 3 days before expiry to allow for payment retries
const AUTO_RENEWAL_DAYS_BEFORE = 3

// Maximum domains to process in one batch
const BATCH_SIZE = 50

// =============================================================================
// Types
// =============================================================================

export interface DomainRenewalJobData {
  type: 'batch_reminders' | 'batch_auto_renew' | 'single_renewal' | 'batch_pricing_sync'
  domainId?: string
}

// =============================================================================
// Queue
// =============================================================================

export const domainRenewalQueue = new Queue<DomainRenewalJobData>('domain-renewal', {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})

// =============================================================================
// Worker Class
// =============================================================================

export class DomainRenewalWorker {
  private worker: Worker<DomainRenewalJobData> | null = null

  constructor() {
    console.log('[DomainRenewalWorker] Initialized')
  }

  /**
   * Start the worker and schedule recurring jobs
   */
  public async start(): Promise<void> {
    const pool = getPool()
    if (!pool) {
      console.error('[DomainRenewalWorker] Database not available - cannot start worker')
      return
    }

    this.worker = new Worker<DomainRenewalJobData>(
      'domain-renewal',
      async (job: Job<DomainRenewalJobData>) => {
        return this.processJob(job)
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: 1, // Process one batch at a time
      }
    )

    // Event handlers
    this.worker.on('completed', (job) => {
      console.log(`[DomainRenewalWorker] Job ${job.id} completed`)
    })

    this.worker.on('failed', (job, error) => {
      console.error(`[DomainRenewalWorker] Job ${job?.id} failed:`, error.message)
    })

    this.worker.on('error', (error) => {
      console.error('[DomainRenewalWorker] Worker error:', error)
    })

    // Schedule recurring jobs
    await this.scheduleRecurringJobs()

    console.log('[DomainRenewalWorker] Started')
  }

  /**
   * Stop the worker
   */
  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close()
      this.worker = null
      console.log('[DomainRenewalWorker] Stopped')
    }
  }

  /**
   * Schedule recurring renewal jobs
   */
  private async scheduleRecurringJobs(): Promise<void> {
    // Remove existing repeatable jobs
    const repeatableJobs = await domainRenewalQueue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      await domainRenewalQueue.removeRepeatableByKey(job.key)
    }

    // Schedule daily reminder job at 9 AM UTC
    await domainRenewalQueue.add(
      'batch-reminders',
      { type: 'batch_reminders' },
      {
        repeat: {
          pattern: '0 9 * * *', // Daily at 9 AM UTC
        },
        jobId: 'domain-renewal-reminders-daily',
      }
    )

    // Schedule daily auto-renewal job at 10 AM UTC
    await domainRenewalQueue.add(
      'batch-auto-renew',
      { type: 'batch_auto_renew' },
      {
        repeat: {
          pattern: '0 10 * * *', // Daily at 10 AM UTC
        },
        jobId: 'domain-renewal-auto-renew-daily',
      }
    )

    // Schedule daily TLD pricing sync at noon UTC (separate from renewals)
    await domainRenewalQueue.add(
      'batch-pricing-sync',
      { type: 'batch_pricing_sync' },
      {
        repeat: {
          pattern: '0 12 * * *', // Daily at noon UTC
        },
        jobId: 'pricing-sync-daily',
      }
    )

    console.log('[DomainRenewalWorker] Scheduled recurring jobs')
  }

  /**
   * Process a job
   */
  private async processJob(job: Job<DomainRenewalJobData>): Promise<any> {
    const { type, domainId } = job.data

    switch (type) {
      case 'batch_reminders':
        return this.processBatchReminders()
      case 'batch_auto_renew':
        return this.processBatchAutoRenew()
      case 'single_renewal':
        if (domainId) {
          return this.processSingleRenewal(domainId)
        }
        throw new Error('domainId required for single_renewal')
      case 'batch_pricing_sync':
        return this.processPricingSync()
      default:
        throw new Error(`Unknown job type: ${type}`)
    }
  }

  /**
   * Process batch renewal reminders
   */
  private async processBatchReminders(): Promise<{ sent: number }> {
    const pool = getPool()
    let totalSent = 0

    for (const daysBeforeExpiry of REMINDER_THRESHOLDS) {
      // Find domains expiring in exactly N days
      const targetDate = new Date()
      targetDate.setDate(targetDate.getDate() + daysBeforeExpiry)
      const targetDateStr = targetDate.toISOString().split('T')[0]

      const { rows: domains } = await pool.query(
        `SELECT d.id, d.domain, d.user_id, d.project_id, d.expires_at, d.auto_renew,
                d.next_renewal_price_cents, u.email as user_email
         FROM inhouse_registered_domains d
         JOIN auth.users u ON d.user_id = u.id
         WHERE d.status = 'active'
           AND DATE(d.expires_at) = $1::date
         LIMIT $2`,
        [targetDateStr, BATCH_SIZE]
      )

      for (const domain of domains) {
        try {
          await this.sendRenewalReminder(domain, daysBeforeExpiry)
          totalSent++
        } catch (error) {
          console.error(`[DomainRenewalWorker] Failed to send reminder for ${domain.domain}:`, error)
        }
      }

      console.log(`[DomainRenewalWorker] Sent ${domains.length} reminders for ${daysBeforeExpiry}-day expiry`)
    }

    return { sent: totalSent }
  }

  /**
   * Process batch auto-renewals
   *
   * This method enqueues individual per-domain jobs so that:
   * 1. Failed domains can be retried independently
   * 2. BullMQ retry logic works correctly per-domain
   * 3. We don't block the entire batch on one slow domain
   */
  private async processBatchAutoRenew(): Promise<{ enqueued: number }> {
    if (!isOpenSrsConfigured() || !isDomainBillingConfigured()) {
      console.warn('[DomainRenewalWorker] OpenSRS or billing not configured - skipping auto-renewals')
      return { enqueued: 0 }
    }

    const pool = getPool()

    // Find domains expiring in AUTO_RENEWAL_DAYS_BEFORE days with auto_renew=true
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + AUTO_RENEWAL_DAYS_BEFORE)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    const { rows: domains } = await pool.query(
      `SELECT d.id, d.domain, d.user_id, d.project_id, d.expires_at,
              d.next_renewal_price_cents, u.email as user_email
       FROM inhouse_registered_domains d
       JOIN auth.users u ON d.user_id = u.id
       WHERE d.status = 'active'
         AND d.auto_renew = TRUE
         AND DATE(d.expires_at) = $1::date
       LIMIT $2`,
      [targetDateStr, BATCH_SIZE]
    )

    // Enqueue individual per-domain jobs (so retries work correctly)
    for (const domain of domains) {
      await domainRenewalQueue.add(
        'single-renewal',
        { type: 'single_renewal', domainId: domain.id },
        {
          // Idempotency key prevents duplicate jobs for same domain on same day
          jobId: `renew:${domain.id}:${targetDateStr}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )
    }

    console.log(`[DomainRenewalWorker] Enqueued ${domains.length} per-domain renewal jobs`)
    return { enqueued: domains.length }
  }

  /**
   * Process single domain renewal (used for both auto-renewal and manual triggers)
   *
   * This method contains the full renewal logic so that BullMQ can properly
   * retry individual domains that fail.
   */
  private async processSingleRenewal(domainId: string): Promise<{ success: boolean }> {
    const pool = getPool()
    const billing = getDomainBillingService()
    const openSrs = getOpenSrsService()

    // Get domain details with user info
    const { rows: domainRows } = await pool.query(
      `SELECT d.id, d.domain, d.user_id, d.project_id, d.expires_at,
              d.next_renewal_price_cents, u.email as user_email
       FROM inhouse_registered_domains d
       JOIN auth.users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [domainId]
    )

    if (domainRows.length === 0) {
      console.error(`[DomainRenewalWorker] Domain not found: ${domainId}`)
      throw new Error(`Domain not found: ${domainId}`)
    }

    const domain = domainRows[0]

    // Get user's default payment method
    const paymentMethods = await billing.listPaymentMethods(domain.user_id)
    const defaultMethod = paymentMethods.find(pm => pm.isDefault) || paymentMethods[0]

    if (!defaultMethod) {
      console.warn(`[DomainRenewalWorker] No payment method for user ${domain.user_id}, skipping ${domain.domain}`)
      await this.recordRenewalFailure(domain, 'No payment method on file')
      // Don't throw - this is not a retriable error
      return { success: false }
    }

    // Process auto-renewal payment
    const paymentResult = await billing.processAutoRenewal({
      userId: domain.user_id,
      userEmail: domain.user_email,
      domainId: domain.id,
      domain: domain.domain,
      amountCents: domain.next_renewal_price_cents || 1599,
      paymentMethodId: defaultMethod.id,
    })

    if (!paymentResult.success) {
      console.error(`[DomainRenewalWorker] Payment failed for ${domain.domain}: ${paymentResult.error}`)
      await this.recordRenewalFailure(domain, paymentResult.error || 'Payment failed')
      // Throw to trigger BullMQ retry for payment failures
      throw new Error(`Payment failed for ${domain.domain}: ${paymentResult.error}`)
    }

    // Renew domain via OpenSRS
    const renewResult = await openSrs.renewDomain(domain.domain, 1)

    if (!renewResult.success) {
      console.error(`[DomainRenewalWorker] OpenSRS renewal failed for ${domain.domain}: ${renewResult.error}`)
      // Refund the payment
      if (paymentResult.paymentIntentId) {
        await billing.refundPayment(paymentResult.paymentIntentId, 'OpenSRS renewal failed')
      }
      await this.recordRenewalFailure(domain, renewResult.error || 'Registrar renewal failed')
      // Throw to trigger BullMQ retry
      throw new Error(`OpenSRS renewal failed for ${domain.domain}: ${renewResult.error}`)
    }

    // Update domain record
    await pool.query(
      `UPDATE inhouse_registered_domains
       SET expires_at = $1, last_renewed_at = NOW(), last_payment_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [renewResult.newExpirationDate, paymentResult.paymentIntentId, domain.id]
    )

    // Record event
    await pool.query(
      `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type)
       VALUES ($1, $2, 'renewed', $3, 'system')`,
      [
        domain.id,
        domain.project_id,
        JSON.stringify({
          type: 'auto_renewal',
          orderId: renewResult.orderId,
          newExpiresAt: renewResult.newExpirationDate,
          paymentId: paymentResult.paymentIntentId,
        }),
      ]
    )

    // Log activity
    logActivity({
      projectId: domain.project_id,
      service: 'domain-registration',
      action: 'auto_renew_domain',
      actorType: 'system',
      resourceType: 'registered_domain',
      resourceId: domain.id,
      status: 'success',
      metadata: { domain: domain.domain, newExpiresAt: renewResult.newExpirationDate },
    })

    console.log(`[DomainRenewalWorker] Auto-renewed ${domain.domain}`)
    return { success: true }
  }

  /**
   * Sync TLD pricing from OpenSRS into inhouse_domain_pricing table.
   * Preserves admin-managed fields (markup_percent, available, premium_only).
   */
  private async processPricingSync(): Promise<{ synced: number }> {
    if (!isOpenSrsConfigured()) {
      console.warn('[DomainRenewalWorker] OpenSRS not configured - skipping pricing sync')
      return { synced: 0 }
    }

    const pool = getPool()
    const openSrs = getOpenSrsService()

    const pricing = await openSrs.getTldPricing()

    let synced = 0
    for (const tld of pricing) {
      // OpenSRS returns prices in dollars; convert to cents
      const registrationCents = Math.round(tld.registration * 100)
      const renewalCents = Math.round(tld.renewal * 100)
      const transferCents = Math.round(tld.transfer * 100)

      await pool.query(
        `INSERT INTO inhouse_domain_pricing (tld, registration_price_cents, renewal_price_cents, transfer_price_cents, last_synced_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (tld) DO UPDATE
         SET registration_price_cents = EXCLUDED.registration_price_cents,
             renewal_price_cents = EXCLUDED.renewal_price_cents,
             transfer_price_cents = EXCLUDED.transfer_price_cents,
             last_synced_at = NOW()`,
        [tld.tld, registrationCents, renewalCents, transferCents]
      )
      synced++
    }

    // Invalidate Redis cache so next request gets fresh data
    const redis = getBestEffortRedis()
    if (redis) {
      try {
        await redis.del('tld-pricing-cache')
        console.log('[DomainRenewalWorker] Invalidated tld-pricing-cache in Redis')
      } catch (error) {
        console.warn('[DomainRenewalWorker] Failed to invalidate Redis cache:', error)
      }
    }

    logActivity({
      projectId: 'system',
      service: 'domain-registration',
      action: 'tld_pricing_sync',
      actorType: 'system',
      resourceType: 'domain_pricing',
      status: 'success',
      metadata: { synced, tlds: pricing.map(p => p.tld) },
    })

    console.log(`[DomainRenewalWorker] Synced pricing for ${synced} TLDs`)
    return { synced }
  }

  /**
   * Send renewal reminder notification
   */
  private async sendRenewalReminder(
    domain: {
      id: string
      domain: string
      user_id: string
      project_id: string
      expires_at: Date
      auto_renew: boolean
      next_renewal_price_cents: number
      user_email: string
    },
    daysBeforeExpiry: number
  ): Promise<void> {
    const pool = getPool()

    // Record event
    await pool.query(
      `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type)
       VALUES ($1, $2, 'expiry_warning', $3, 'system')`,
      [
        domain.id,
        domain.project_id,
        JSON.stringify({
          daysUntilExpiry: daysBeforeExpiry,
          expiresAt: domain.expires_at,
          autoRenew: domain.auto_renew,
        }),
      ]
    )

    // Log activity
    logActivity({
      projectId: domain.project_id,
      service: 'domain-registration',
      action: 'send_renewal_reminder',
      actorType: 'system',
      resourceType: 'registered_domain',
      resourceId: domain.id,
      metadata: {
        domain: domain.domain,
        daysUntilExpiry: daysBeforeExpiry,
        autoRenew: domain.auto_renew,
      },
    })

    // Send email notification via InhouseEmailService
    try {
      const emailService = getInhouseEmailService(domain.project_id)
      await emailService.send({
        to: domain.user_email,
        template: 'notification',
        variables: {
          subject: `Your domain ${domain.domain} expires in ${daysBeforeExpiry} days`,
          title: 'Domain Renewal Reminder',
          message: domain.auto_renew
            ? `Your domain ${domain.domain} will auto-renew before ${new Date(domain.expires_at).toLocaleDateString()}. Renewal price: $${(domain.next_renewal_price_cents / 100).toFixed(2)}.`
            : `Your domain ${domain.domain} expires on ${new Date(domain.expires_at).toLocaleDateString()}. Enable auto-renewal or renew manually to keep your domain.`,
          actionUrl: 'https://app.sheenapps.com/dashboard/domains',
          actionText: domain.auto_renew ? 'View Domain' : 'Renew Now',
        },
        idempotencyKey: `renewal-reminder:${domain.id}:${daysBeforeExpiry}d:${new Date().toISOString().split('T')[0]}`,
        tags: { notification_type: 'domain_renewal_reminder', domain_id: domain.id },
      })
    } catch (err) {
      console.error(`[DomainRenewalWorker] Failed to send reminder email for ${domain.domain}:`, err)
      // Don't throw — event is already recorded, email failure is non-critical
    }

    console.log(`[DomainRenewalWorker] Sent ${daysBeforeExpiry}-day reminder for ${domain.domain}`)
  }

  /**
   * Record renewal failure
   */
  private async recordRenewalFailure(
    domain: { id: string; domain: string; project_id: string; user_email: string },
    reason: string
  ): Promise<void> {
    const pool = getPool()

    // Record event
    await pool.query(
      `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type)
       VALUES ($1, $2, 'payment_failed', $3, 'system')`,
      [
        domain.id,
        domain.project_id,
        JSON.stringify({ reason, timestamp: new Date().toISOString() }),
      ]
    )

    // Log activity
    logActivity({
      projectId: domain.project_id,
      service: 'domain-registration',
      action: 'renewal_payment_failed',
      actorType: 'system',
      resourceType: 'registered_domain',
      resourceId: domain.id,
      status: 'error',
      metadata: { domain: domain.domain, reason },
    })

    // Send payment failure notification via InhouseEmailService
    try {
      const emailService = getInhouseEmailService(domain.project_id)
      await emailService.send({
        to: domain.user_email,
        template: 'notification',
        variables: {
          subject: `Renewal payment failed for ${domain.domain}`,
          title: 'Domain Renewal Payment Failed',
          message: `We couldn't process the renewal payment for ${domain.domain}. Please update your payment method to avoid losing your domain.`,
          actionUrl: 'https://app.sheenapps.com/dashboard/domains',
          actionText: 'Update Payment Method',
        },
        idempotencyKey: `renewal-failed:${domain.id}:${new Date().toISOString().split('T')[0]}`,
        tags: { notification_type: 'domain_renewal_failed', domain_id: domain.id },
      })
    } catch (err) {
      console.error(`[DomainRenewalWorker] Failed to send payment failure email for ${domain.domain}:`, err)
    }
  }
}

// =============================================================================
// Singleton & Initialization
// =============================================================================

let workerInstance: DomainRenewalWorker | null = null

export function getDomainRenewalWorker(): DomainRenewalWorker {
  if (!workerInstance) {
    workerInstance = new DomainRenewalWorker()
  }
  return workerInstance
}

export async function initializeDomainRenewalWorker(): Promise<DomainRenewalWorker> {
  if (workerInstance) {
    console.log('[DomainRenewalWorker] Already initialized')
    return workerInstance
  }

  workerInstance = new DomainRenewalWorker()
  await workerInstance.start()
  return workerInstance
}

export async function shutdownDomainRenewalWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop()
    workerInstance = null
    console.log('[DomainRenewalWorker] Shutdown complete')
  }
}
