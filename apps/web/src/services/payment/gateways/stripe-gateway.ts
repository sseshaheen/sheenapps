/**
 * DEPRECATED: Stripe Gateway Stub
 * 
 * This service has been replaced by worker-based payment processing.
 * Stripe integration should now be handled via worker APIs.
 * 
 * This stub exists to prevent build errors during migration.
 * TODO: Update stripe-related code to use worker APIs and remove this stub.
 */

export class StripeGateway {
  async processWebhook(event: any) {
    // Return success - this functionality moved to worker
    return {
      success: true,
      processed: false,
      reason: 'Service migrated to worker'
    }
  }

  async retryWebhook(webhookId: string) {
    // Return failure - this functionality moved to worker
    return {
      success: false,
      error: 'Service migrated to worker'
    }
  }
}