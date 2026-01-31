/**
 * DEPRECATED: Webhook Retry Service Stub
 * 
 * This service has been replaced by worker-based payment processing.
 * Webhook retry should now be handled by the worker service.
 * 
 * This stub exists to prevent build errors during migration.
 * TODO: Update webhook retry logic to use worker APIs and remove this stub.
 */

import { logger } from '@/utils/logger'

interface WebhookRetryRecord {
  id: string
  gateway: string
  event_type: string
  payload: any
  error_message: string
  retry_count: number
  max_retries: number
  retry_history: Array<{
    timestamp: string
    error: string
    status_code?: number
  }>
  created_at: string
  last_retry_at: string | null
}

export class WebhookRetryService {
  constructor() {
    // Stub - no gateways needed in worker-based architecture
  }

  /**
   * Process all pending webhook retries
   */
  async processPendingRetries(): Promise<void> {
    // Stub - webhook retry processing moved to worker
    logger.info('Webhook retry processing moved to worker service')
    return
    
    /*
    const supabase = await createServerSupabaseClientNew()
    
    // Get webhooks that need retry
    const { data: webhooks, error } = await supabase
      .from('webhook_dead_letter')
      .select('*')
      .lt('retry_count', supabase.raw('max_retries'))
      .or('last_retry_at.is.null,last_retry_at.lt.now() - interval \'5 minutes\'')
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      console.error('Error fetching webhooks for retry:', error)
      return
    }

    if (!webhooks || webhooks.length === 0) {
      return
    }

    // Process each webhook
    const retryPromises = webhooks.map(webhook => 
      this.retryWebhook(webhook).catch(err => 
        console.error(`Failed to retry webhook ${webhook.id}:`, err)
      )
    )

    await Promise.allSettled(retryPromises)
    */
  }

  /**
   * Retry a single webhook with exponential backoff
   */
  async retryWebhook(webhook: WebhookRetryRecord): Promise<void> {
    // TODO: Implement when webhook_dead_letter table is available
    logger.info('Skipping webhook retry - table not yet available')
    return
    /*
    const supabase = await createServerSupabaseClientNew()
    
    // Check if we should retry based on backoff
    if (!this.shouldRetry(webhook)) {
      return
    }

    try {
      // Process the webhook based on gateway
      await this.processWebhookByGateway(webhook)

      // Success - remove from dead letter queue
      await supabase
        .from('webhook_dead_letter')
        .delete()
        .eq('id', webhook.id)

      console.log(`Successfully processed webhook ${webhook.id} on retry ${webhook.retry_count + 1}`)
      
    } catch (error: any) {
      // Update retry count and history
      const retryHistory = [...(webhook.retry_history || [])]
      retryHistory.push({
        timestamp: new Date().toISOString(),
        error: error.message || 'Unknown error',
        status_code: error.statusCode
      })

      const newRetryCount = webhook.retry_count + 1

      await supabase
        .from('webhook_dead_letter')
        .update({
          retry_count: newRetryCount,
          retry_history: retryHistory,
          last_retry_at: new Date().toISOString(),
          error_message: error.message || 'Unknown error'
        })
        .eq('id', webhook.id)

      // If max retries reached, alert admin
      if (newRetryCount >= webhook.max_retries) {
        await this.alertAdminOfFailure(webhook, error)
      }
    }
    */
  }

  /**
   * Calculate if webhook should be retried based on exponential backoff
   */
  private shouldRetry(webhook: WebhookRetryRecord): boolean {
    if (webhook.retry_count >= webhook.max_retries) {
      return false
    }

    if (!webhook.last_retry_at) {
      return true
    }

    // Calculate backoff: 2^n * 60 seconds + jitter
    const backoffSeconds = Math.pow(2, webhook.retry_count) * 60
    const jitterSeconds = Math.random() * 60 // 0-60 seconds jitter
    const totalBackoffMs = (backoffSeconds + jitterSeconds) * 1000

    const lastRetry = new Date(webhook.last_retry_at).getTime()
    const now = Date.now()

    return now - lastRetry >= totalBackoffMs
  }

  /**
   * Process webhook based on gateway type
   */
  private async processWebhookByGateway(webhook: WebhookRetryRecord): Promise<void> {
    // Stub - gateway processing moved to worker
    throw new Error('Webhook processing moved to worker service')

    // Gateway-specific processing
    switch (webhook.gateway) {
      case 'stripe':
        await this.processStripeWebhook(webhook)
        break
      case 'cashier':
        await this.processCashierWebhook(webhook)
        break
      default:
        throw new Error(`Unsupported gateway: ${webhook.gateway}`)
    }
  }

  /**
   * Process Stripe webhook retry
   */
  private async processStripeWebhook(webhook: WebhookRetryRecord): Promise<void> {
    const { TransactionService } = await import('./transaction-service')
    const transactionService = new TransactionService()

    // Re-process the Stripe event
    const event = webhook.payload
    
    switch (event.type) {
      case 'checkout.session.completed':
        // TODO: Implement createFromStripeCheckout method
        // await transactionService.createFromStripeCheckout(event.data.object)
        logger.info('Skipping transaction creation for checkout.session.completed')
        break
      
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.updateSubscriptionStatus(event.data.object)
        break
      
      case 'invoice.payment_succeeded':
        // TODO: Implement createFromStripeInvoice method
        // await transactionService.createFromStripeInvoice(event.data.object)
        logger.info('Skipping transaction creation for invoice.payment_succeeded')
        break
      
      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object)
        break
      
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }
  }

  /**
   * Process Cashier webhook retry
   */
  private async processCashierWebhook(webhook: WebhookRetryRecord): Promise<void> {
    // Implement Cashier-specific webhook processing
    const event = webhook.payload
    
    // Process based on Cashier event types
    console.log('Processing Cashier webhook:', event)
    
    // TODO: Implement actual Cashier webhook processing
    throw new Error('Cashier webhook processing not yet implemented')
  }

  /**
   * Update subscription status in database
   */
  private async updateSubscriptionStatus(subscription: any): Promise<void> {
    // TODO: Add subscriptions table to database and types
    logger.info('Skipping subscription update - table not yet available')
    return
    /*
    const supabase = await createServerSupabaseClientNew()
    
    await supabase
      .from('subscriptions')
      .update({
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscription.id)
    */
  }

  /**
   * Handle payment failure
   */
  private async handlePaymentFailure(invoice: any): Promise<void> {
    // TODO: Add failed_payments table to database and types
    logger.info('Skipping payment failure handling - table not yet available')
    return
    /*
    const supabase = await createServerSupabaseClientNew()
    
    // Log failed payment
    await supabase
      .from('failed_payments')
      .insert({
        invoice_id: invoice.id,
        customer_id: invoice.customer,
        amount: invoice.amount_due,
        currency: invoice.currency,
        failure_reason: invoice.last_payment_error?.message || 'Unknown',
        attempted_at: new Date().toISOString()
      })

    // Update subscription status if needed
    if (invoice.subscription) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'past_due',
          updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', invoice.subscription)
    }
    */
  }

  /**
   * Alert admin when webhook reaches max retries
   */
  private async alertAdminOfFailure(webhook: WebhookRetryRecord, error: Error): Promise<void> {
    console.error(`Webhook ${webhook.id} failed after ${webhook.max_retries} retries:`, {
      gateway: webhook.gateway,
      event_type: webhook.event_type,
      error: error.message,
      retry_history: webhook.retry_history
    })

    // In production, send email to admin
    if (process.env.NODE_ENV === 'production') {
      const { NotificationService } = await import('./notification-service')
      const notificationService = new NotificationService()
      
      await notificationService.sendWebhookFailureAlert({
        webhookId: webhook.id,
        gateway: webhook.gateway,
        eventType: webhook.event_type,
        errorMessage: error.message,
        retryCount: webhook.retry_count,
        createdAt: webhook.created_at
      })
    }
  }

  /**
   * Manually retry a specific webhook (for admin use)
   */
  async manualRetry(webhookId: string): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement when webhook_dead_letter table is available
    return { success: false, error: 'Webhook retry not yet available' }
    /*
    const supabase = await createServerSupabaseClientNew()
    
    const { data: webhook, error } = await supabase
      .from('webhook_dead_letter')
      .select('*')
      .eq('id', webhookId)
      .single()

    if (error || !webhook) {
      return { success: false, error: 'Webhook not found' }
    }

    try {
      await this.retryWebhook(webhook)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
    */
  }

  /**
   * Get retry statistics
   */
  async getRetryStats(): Promise<{
    pending: number
    maxRetriesReached: number
    recentFailures: number
  }> {
    // TODO: Implement when webhook_dead_letter table is available
    return {
      pending: 0,
      maxRetriesReached: 0,
      recentFailures: 0
    }
    /*
    const supabase = await createServerSupabaseClientNew()
    
    const [pending, maxRetries, recent] = await Promise.all([
      supabase
        .from('webhook_dead_letter')
        .select('id', { count: 'exact' })
        .lt('retry_count', supabase.raw('max_retries')),
      
      supabase
        .from('webhook_dead_letter')
        .select('id', { count: 'exact' })
        .gte('retry_count', supabase.raw('max_retries')),
      
      supabase
        .from('webhook_dead_letter')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ])

    return {
      pending: pending.count || 0,
      maxRetriesReached: maxRetries.count || 0,
      recentFailures: recent.count || 0
    }
    */
  }
}