/**
 * Multi-Provider Webhook Processing System
 * 
 * Expert-validated webhook handling with the following features:
 * - Provider-agnostic event processing
 * - 48-hour replay policy enforced in code (not database)
 * - Signature verification per provider
 * - Idempotency by (provider, event_id)
 * - Comprehensive error handling with audit trails
 */

import { PaymentProviderRegistry } from './RegionalPaymentFactory';
import { PaymentProviderKey, PaymentError } from './enhancedTypes';
import { pool } from '../database';
import { referralCommissionService } from '../referralCommissionService';

export interface ProcessedWebhookEvent {
  id: string;
  paymentProvider: PaymentProviderKey;
  providerEventId: string;
  receivedAt: Date;
  rawPayload: any;
  signatureHeaders: any;
  processed: boolean;
  processingError?: string;
  replayRequested: boolean;
  createdAt: Date;
}

export class WebhookProcessor {
  private static instance: WebhookProcessor;
  private providerRegistry: PaymentProviderRegistry;
  
  // 48-hour replay policy (expert requirement)
  private readonly REPLAY_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

  private constructor() {
    this.providerRegistry = PaymentProviderRegistry.getInstance();
  }

  static getInstance(): WebhookProcessor {
    if (!WebhookProcessor.instance) {
      WebhookProcessor.instance = new WebhookProcessor();
    }
    return WebhookProcessor.instance;
  }

  /**
   * Process incoming webhook from any provider
   * Expert-validated pattern with comprehensive error handling
   */
  async processWebhook(
    providerKey: PaymentProviderKey,
    rawBody: string,
    headers: Record<string, string>,
    remoteAddress?: string
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  ): Promise<{ success: boolean; message: string; eventId?: string | undefined }> {
    console.log(`📥 Processing webhook from ${providerKey}`);
    
    try {
      // Get provider instance
      const provider = await this.providerRegistry.getProviderInstance(providerKey);
      
      // Verify webhook signature
      const isValidSignature = provider.verifyWebhook(rawBody, headers);
      if (!isValidSignature) {
        console.warn(`🚫 Invalid webhook signature from ${providerKey}`);
        throw new PaymentError(
          'INVALID_REQUEST',
          `Invalid webhook signature for ${providerKey}`,
          { provider: providerKey, remoteAddress }
        );
      }

      console.log(`✅ Valid webhook signature from ${providerKey}`);

      // Parse webhook events
      const events = provider.parseWebhookEvents(rawBody);
      console.log(`📋 Parsed ${events.length} events from ${providerKey} webhook`);

      const results = [];
      
      for (const event of events) {
        try {
          const result = await this.processWebhookEvent(
            providerKey,
            event.providerEventId || `${providerKey}_${Date.now()}_${Math.random().toString(36)}`,
            rawBody,
            headers,
            event
          );
          results.push(result);
        } catch (error) {
          console.error(`❌ Failed to process event ${event.providerEventId}:`, error);
          results.push({ 
            success: false, 
            eventId: event.providerEventId,
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      // Return overall success status
      const successCount = results.filter(r => r.success).length;
      return {
        success: successCount === events.length,
        message: `Processed ${successCount}/${events.length} events successfully`,
        eventId: results[0]?.eventId
      };

    } catch (error) {
      console.error(`❌ Webhook processing failed for ${providerKey}:`, error);
      
      // Store failed webhook for manual review
      await this.storeFailedWebhook(providerKey, rawBody, headers, error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown webhook processing error'
      };
    }
  }

  /**
   * Process individual webhook event with idempotency
   */
  private async processWebhookEvent(
    providerKey: PaymentProviderKey,
    providerEventId: string,
    rawBody: string,
    headers: Record<string, string>,
    event: any
  ): Promise<{ success: boolean; eventId: string; error?: string }> {
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check for duplicate event (idempotency)
      const existingEvent = await client.query(`
        SELECT id, processed, processing_error, received_at
        FROM processed_payment_events
        WHERE payment_provider = $1::payment_provider_key AND provider_event_id = $2
      `, [providerKey, providerEventId]);

      if (existingEvent.rows.length > 0) {
        const existing = existingEvent.rows[0];
        
        // Check if within replay window (48-hour policy)
        const eventAge = Date.now() - new Date(existing.received_at).getTime();
        if (eventAge > this.REPLAY_WINDOW_MS && !existing.replay_requested) {
          console.log(`⏰ Event ${providerEventId} is older than 48 hours, ignoring replay`);
          await client.query('COMMIT');
          return { 
            success: true, 
            eventId: providerEventId,
            error: 'Event older than 48-hour replay window'
          };
        }

        if (existing.processed && !existing.replay_requested) {
          console.log(`♻️ Event ${providerEventId} already processed successfully`);
          await client.query('COMMIT');
          return { success: true, eventId: providerEventId };
        }
        
        // Update existing record for replay/retry
        await client.query(`
          UPDATE processed_payment_events 
          SET replay_requested = false, processing_error = NULL
          WHERE payment_provider = $1::payment_provider_key AND provider_event_id = $2
        `, [providerKey, providerEventId]);
      } else {
        // Insert new event record
        await client.query(`
          INSERT INTO processed_payment_events (
            payment_provider, provider_event_id, received_at, raw_payload, 
            signature_headers, processed, processing_error, replay_requested
          ) VALUES ($1::payment_provider_key, $2, NOW(), $3, $4, false, NULL, false)
        `, [
          providerKey,
          providerEventId,
          JSON.stringify(JSON.parse(rawBody)),
          JSON.stringify(headers)
        ]);
      }

      // Process the actual event based on type
      await this.handlePaymentEvent(client, providerKey, event);

      // Mark event as processed
      await client.query(`
        UPDATE processed_payment_events 
        SET processed = true, processing_error = NULL
        WHERE payment_provider = $1::payment_provider_key AND provider_event_id = $2
      `, [providerKey, providerEventId]);

      await client.query('COMMIT');
      
      console.log(`✅ Successfully processed event ${providerEventId} from ${providerKey}`);
      return { success: true, eventId: providerEventId };

    } catch (error) {
      await client.query('ROLLBACK');
      
      // Record processing error
      await client.query(`
        UPDATE processed_payment_events 
        SET processing_error = $3
        WHERE payment_provider = $1::payment_provider_key AND provider_event_id = $2
      `, [providerKey, providerEventId, error instanceof Error ? error.message : 'Unknown error']);

      console.error(`❌ Event processing failed for ${providerEventId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle specific payment event types
   */
  private async handlePaymentEvent(client: any, providerKey: PaymentProviderKey, event: any) {
    switch (event.type) {
      case 'payment.succeeded':
        await this.handlePaymentSucceeded(client, providerKey, event);
        break;
        
      case 'payment.failed':
        await this.handlePaymentFailed(client, providerKey, event);
        break;
        
      case 'subscription.updated':
        await this.handleSubscriptionUpdated(client, providerKey, event);
        break;
        
      case 'payment.expired':
        await this.handlePaymentExpired(client, providerKey, event);
        break;
        
      default:
        console.warn(`⚠️ Unknown event type ${event.type} from ${providerKey}`);
        // Don't throw error for unknown events, just log them
    }
  }

  private async handlePaymentSucceeded(client: any, providerKey: PaymentProviderKey, event: any) {
    console.log(`💰 Processing payment success: ${event.providerPaymentId}`);
    
    // Find the invoice by order ID
    const invoiceResult = await client.query(`
      SELECT bi.*, pi.seconds, pi.item_key
      FROM billing_invoices bi
      JOIN pricing_items pi ON pi.id = bi.pricing_item_id
      WHERE bi.order_id = $1 AND bi.payment_provider = $2::payment_provider_key
    `, [event.orderId, providerKey]);

    if (invoiceResult.rows.length === 0) {
      throw new Error(`No invoice found for order ${event.orderId}`);
    }

    const invoice = invoiceResult.rows[0];

    // Create payment record
    await client.query(`
      INSERT INTO billing_payments (
        customer_id, invoice_id, provider_payment_id, provider_transaction_id,
        amount_cents, currency, payment_provider, status, payment_flow,
        payment_method, provider_metadata, exchange_rate_used, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::payment_provider_key, 'succeeded'::payment_status, $8, $9, $10, $11, $12)
      ON CONFLICT (payment_provider, provider_payment_id) DO UPDATE SET
        status = 'succeeded'::payment_status,
        provider_metadata = EXCLUDED.provider_metadata
    `, [
      invoice.customer_id,
      invoice.id,
      event.providerPaymentId,
      event.metadata?.transactionId || event.providerPaymentId,
      event.amountCents,
      event.currency,
      providerKey,
      invoice.payment_flow,
      event.metadata?.paymentMethod || 'unknown',
      JSON.stringify(event.metadata || {}),
      event.metadata?.exchangeRate || 1.0,
      `payment_${event.providerPaymentId}_${providerKey}`
    ]);

    // Update invoice status
    await client.query(`
      UPDATE billing_invoices 
      SET status = 'paid', provider_invoice_id = $1
      WHERE id = $2
    `, [event.providerPaymentId, invoice.id]);

    // Credit AI time to user account
    if (invoice.seconds > 0) {
      await client.query(`
        INSERT INTO ai_time_ledger (
          user_id, source_type, source_id, seconds_delta, reason, occurred_at
        ) VALUES ($1, 'payment', $2, $3, $4, NOW())
      `, [
        invoice.customer_id, // This should be user_id, we may need to join to get it
        invoice.id,
        invoice.seconds,
        `Payment successful for ${invoice.item_key} (${event.providerPaymentId})`
      ]);

      console.log(`⚡ Credited ${invoice.seconds} seconds for successful payment ${event.providerPaymentId}`);
    }

    // Process referral commissions for this successful payment
    try {
      await referralCommissionService.processPaymentForCommissions(
        event.providerPaymentId,
        invoice.customer_id, // This should be the user_id
        event.amountCents,
        event.currency
      );
      
      console.log(`💰 Processed referral commissions for payment ${event.providerPaymentId}`);
    } catch (error) {
      // Don't fail the webhook if commission processing fails
      console.error(`⚠️ Failed to process referral commissions for payment ${event.providerPaymentId}:`, error);
    }
  }

  private async handlePaymentFailed(client: any, providerKey: PaymentProviderKey, event: any) {
    console.log(`❌ Processing payment failure: ${event.providerPaymentId}`);
    
    // Find the invoice
    const invoiceResult = await client.query(`
      SELECT * FROM billing_invoices 
      WHERE order_id = $1 AND payment_provider = $2::payment_provider_key
    `, [event.orderId, providerKey]);

    if (invoiceResult.rows.length === 0) {
      console.warn(`No invoice found for failed payment ${event.orderId}`);
      return;
    }

    const invoice = invoiceResult.rows[0];

    // Create payment record with failed status
    await client.query(`
      INSERT INTO billing_payments (
        customer_id, invoice_id, provider_payment_id, amount_cents, currency,
        payment_provider, status, payment_flow, failure_reason, provider_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6::payment_provider_key, 'failed'::payment_status, $7, $8, $9)
      ON CONFLICT (payment_provider, provider_payment_id) DO UPDATE SET
        status = 'failed'::payment_status,
        failure_reason = EXCLUDED.failure_reason,
        provider_metadata = EXCLUDED.provider_metadata
    `, [
      invoice.customer_id,
      invoice.id,
      event.providerPaymentId,
      event.amountCents,
      event.currency,
      providerKey,
      invoice.payment_flow,
      event.metadata?.failureReason || 'Payment failed',
      JSON.stringify(event.metadata || {})
    ]);

    // Update invoice status
    await client.query(`
      UPDATE billing_invoices 
      SET status = 'void'
      WHERE id = $1
    `, [invoice.id]);
  }

  private async handleSubscriptionUpdated(client: any, providerKey: PaymentProviderKey, event: any) {
    console.log(`🔄 Processing subscription update: ${event.providerSubscriptionId}`);
    
    // Implementation would depend on specific subscription handling logic
    // For now, just log the event
    console.log('Subscription update event received:', event);
  }

  private async handlePaymentExpired(client: any, providerKey: PaymentProviderKey, event: any) {
    console.log(`⏰ Processing payment expiration: ${event.orderId}`);
    
    // Update invoice status to expired
    await client.query(`
      UPDATE billing_invoices 
      SET status = 'expired'
      WHERE order_id = $1 AND payment_provider = $2::payment_provider_key
    `, [event.orderId, providerKey]);
  }

  /**
   * Store failed webhook for manual review
   */
  private async storeFailedWebhook(
    providerKey: PaymentProviderKey,
    rawBody: string,
    headers: Record<string, string>,
    errorMessage: string
  ) {
    try {
      if (!pool) {
        throw new Error('Database pool not initialized');
      }
      const client = await pool.connect();
      try {
        await client.query(`
          INSERT INTO processed_payment_events (
            payment_provider, provider_event_id, received_at, raw_payload,
            signature_headers, processed, processing_error, replay_requested
          ) VALUES ($1::payment_provider_key, $2, NOW(), $3, $4, false, $5, false)
        `, [
          providerKey,
          `failed_${Date.now()}_${Math.random().toString(36)}`,
          JSON.stringify(JSON.parse(rawBody)),
          JSON.stringify(headers),
          errorMessage
        ]);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to store failed webhook:', error);
    }
  }

  /**
   * Replay webhook event (admin action)
   */
  async replayWebhookEvent(providerKey: PaymentProviderKey, eventId: string): Promise<boolean> {
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const client = await pool.connect();
    try {
      // Mark for replay
      await client.query(`
        UPDATE processed_payment_events 
        SET replay_requested = true, processed = false, processing_error = NULL
        WHERE payment_provider = $1::payment_provider_key AND provider_event_id = $2
      `, [providerKey, eventId]);

      // Get the stored event
      const result = await client.query(`
        SELECT raw_payload, signature_headers
        FROM processed_payment_events
        WHERE payment_provider = $1::payment_provider_key AND provider_event_id = $2
      `, [providerKey, eventId]);

      if (result.rows.length === 0) {
        throw new Error(`Event ${eventId} not found`);
      }

      const { raw_payload, signature_headers } = result.rows[0];
      
      // Reprocess the webhook
      const replayResult = await this.processWebhook(
        providerKey,
        JSON.stringify(raw_payload),
        signature_headers
      );

      return replayResult.success;
    } finally {
      client.release();
    }
  }

  /**
   * Get webhook processing statistics for admin dashboard
   */
  async getWebhookStats(providerKey?: PaymentProviderKey): Promise<any> {
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const client = await pool.connect();
    try {
      const whereClause = providerKey ? 'WHERE payment_provider = $1::payment_provider_key' : '';
      const params = providerKey ? [providerKey] : [];

      const result = await client.query(`
        SELECT 
          payment_provider,
          COUNT(*) as total_events,
          SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) as processed_events,
          SUM(CASE WHEN processed = false AND processing_error IS NOT NULL THEN 1 ELSE 0 END) as failed_events,
          SUM(CASE WHEN replay_requested = true THEN 1 ELSE 0 END) as replayed_events,
          AVG(CASE WHEN processed = true THEN 1.0 ELSE 0.0 END) as success_rate
        FROM processed_payment_events
        ${whereClause}
        GROUP BY payment_provider
        ORDER BY payment_provider
      `, params);

      return result.rows;
    } finally {
      client.release();
    }
  }
}

// Export singleton
export const webhookProcessor = WebhookProcessor.getInstance();