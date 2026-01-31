/**
 * Trust & Safety Enforcement Service
 * Handles payment freezing, account restrictions, and enforcement actions
 *
 * Features:
 * - App-layer payment blocking with Stripe subscription management
 * - Idempotent operations with comprehensive error handling
 * - Audit logging for compliance and investigation
 * - Recovery mechanisms for false positives
 */

import Stripe from 'stripe';
import { pool } from './database';
import { ServerLoggingService } from './serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

export interface PaymentFreezeResult {
  success: boolean;
  userId: string;
  reason: string;
  actionsPerformed: string[];
  error?: string;
  subscriptionsPaused: number;
  paymentIntentsCanceled: number;
}

export interface PaymentUnfreezeResult {
  success: boolean;
  userId: string;
  actionsPerformed: string[];
  error?: string;
  subscriptionsResumed: number;
}

export interface LegalEscalationResult {
  success: boolean;
  ticketId: string;
  userId: string;
  violationCode: string;
  error?: string;
}

export class TrustSafetyEnforcer {
  private stripe: Stripe;

  constructor() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil'
    });
  }

  /**
   * Check if database connection is available
   */
  private assertDatabaseConnection(): void {
    if (!pool) {
      throw new Error('Database connection not available');
    }
  }

  /**
   * Freeze payments for a user at the application layer
   * Blocks new payments and pauses active subscriptions
   */
  async freezePayments(userId: string, reason: string): Promise<PaymentFreezeResult> {
    this.assertDatabaseConnection();

    const result: PaymentFreezeResult = {
      success: false,
      userId,
      reason,
      actionsPerformed: [],
      subscriptionsPaused: 0,
      paymentIntentsCanceled: 0
    };

    try {
      // Use database transaction to ensure consistency
      await pool!.query('BEGIN');

      try {
        // App-layer blocking - upsert to user_admin_status table
        await pool!.query(`
          INSERT INTO user_admin_status (user_id, payments_blocked, payments_blocked_reason, payments_blocked_at)
          VALUES ($1, true, $2, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET
            payments_blocked = true,
            payments_blocked_reason = $2,
            payments_blocked_at = NOW(),
            updated_at = NOW()
        `, [userId, reason]);

        result.actionsPerformed.push('Application layer payment blocking enabled');

        // Get user's active subscriptions
        const subResult = await pool!.query(`
          SELECT stripe_subscription_id, subscription_id
          FROM billing_subscriptions
          WHERE user_id = $1 AND status = 'active'
        `, [userId]);

        // Pause active subscriptions with Stripe
        for (const sub of subResult.rows) {
          try {
            await this.stripe.subscriptions.update(
              sub.stripe_subscription_id,
              {
                pause_collection: {
                  behavior: 'mark_uncollectible',
                  resumes_at: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
                }
              },
              { idempotencyKey: `freeze-${sub.stripe_subscription_id}-${Date.now()}` }
            );

            // Update local subscription status
            await pool!.query(`
              UPDATE billing_subscriptions
              SET
                status = 'paused',
                pause_reason = 'trust_safety_freeze',
                paused_at = NOW()
              WHERE subscription_id = $1
            `, [sub.subscription_id]);

            result.subscriptionsPaused++;
            result.actionsPerformed.push(`Paused subscription ${sub.stripe_subscription_id}`);

          } catch (stripeError: any) {
            // Log individual subscription errors but continue
            await loggingService.logServerEvent(
              'error',
              'warn',
              'Failed to pause subscription during payment freeze',
              {
                userId,
                subscriptionId: sub.stripe_subscription_id,
                error: stripeError.message
              }
            );
            result.actionsPerformed.push(`Failed to pause subscription ${sub.stripe_subscription_id}: ${stripeError.message}`);
          }
        }

        // Cancel pending payment intents that require capture
        const piResult = await pool!.query(`
          SELECT stripe_payment_intent_id, payment_intent_id
          FROM payment_intents
          WHERE user_id = $1 AND status = 'requires_capture'
        `, [userId]);

        for (const pi of piResult.rows) {
          try {
            await this.stripe.paymentIntents.cancel(
              pi.stripe_payment_intent_id,
              { idempotencyKey: `cancel-freeze-${pi.stripe_payment_intent_id}-${Date.now()}` }
            );

            // Update local payment intent status
            await pool!.query(`
              UPDATE payment_intents
              SET
                status = 'canceled',
                cancel_reason = 'trust_safety_freeze',
                canceled_at = NOW()
              WHERE payment_intent_id = $1
            `, [pi.payment_intent_id]);

            result.paymentIntentsCanceled++;
            result.actionsPerformed.push(`Canceled payment intent ${pi.stripe_payment_intent_id}`);

          } catch (stripeError: any) {
            // Payment intents may already be canceled - this is idempotent
            if (stripeError.code !== 'payment_intent_already_canceled') {
              await loggingService.logServerEvent(
                'error',
                'warn',
                'Failed to cancel payment intent during freeze',
                {
                  userId,
                  paymentIntentId: pi.stripe_payment_intent_id,
                  error: stripeError.message
                }
              );
            }
            result.actionsPerformed.push(`Attempted to cancel payment intent ${pi.stripe_payment_intent_id}`);
          }
        }

        await pool!.query('COMMIT');
        result.success = true;

        // Log successful enforcement action
        await this.logEnforcementAction(userId, 'payment_freeze', reason, {
          subscriptionsPaused: result.subscriptionsPaused,
          paymentIntentsCanceled: result.paymentIntentsCanceled
        });

      } catch (dbError) {
        await pool!.query('ROLLBACK');
        throw dbError;
      }

    } catch (error: any) {
      result.error = error.message;
      result.success = false;

      await loggingService.logCriticalError('payment_freeze_failed', error, {
        userId,
        reason,
        actionsPerformed: result.actionsPerformed
      });
    }

    return result;
  }

  /**
   * Unfreeze payments for a user (recovery mechanism)
   */
  async unfreezePayments(userId: string, reason: string): Promise<PaymentUnfreezeResult> {
    this.assertDatabaseConnection();

    const result: PaymentUnfreezeResult = {
      success: false,
      userId,
      actionsPerformed: [],
      subscriptionsResumed: 0
    };

    try {
      await pool!.query('BEGIN');

      try {
        // Remove application layer blocking - upsert to user_admin_status table
        await pool!.query(`
          INSERT INTO user_admin_status (user_id, payments_blocked)
          VALUES ($1, false)
          ON CONFLICT (user_id)
          DO UPDATE SET
            payments_blocked = false,
            payments_blocked_reason = NULL,
            payments_blocked_at = NULL,
            updated_at = NOW()
        `, [userId]);

        result.actionsPerformed.push('Application layer payment blocking removed');

        // Get paused subscriptions due to trust & safety
        const subResult = await pool!.query(`
          SELECT stripe_subscription_id, subscription_id
          FROM billing_subscriptions
          WHERE user_id = $1
            AND status = 'paused'
            AND pause_reason = 'trust_safety_freeze'
        `, [userId]);

        // Resume paused subscriptions
        for (const sub of subResult.rows) {
          try {
            // Remove pause collection from Stripe
            await this.stripe.subscriptions.update(
              sub.stripe_subscription_id,
              { pause_collection: null },
              { idempotencyKey: `unfreeze-${sub.stripe_subscription_id}-${Date.now()}` }
            );

            // Update local subscription status
            await pool!.query(`
              UPDATE billing_subscriptions
              SET
                status = 'active',
                pause_reason = NULL,
                paused_at = NULL
              WHERE subscription_id = $1
            `, [sub.subscription_id]);

            result.subscriptionsResumed++;
            result.actionsPerformed.push(`Resumed subscription ${sub.stripe_subscription_id}`);

          } catch (stripeError: any) {
            await loggingService.logServerEvent(
              'error',
              'warn',
              'Failed to resume subscription during payment unfreeze',
              {
                userId,
                subscriptionId: sub.stripe_subscription_id,
                error: stripeError.message
              }
            );
          }
        }

        await pool!.query('COMMIT');
        result.success = true;

        // Log enforcement reversal
        await this.logEnforcementAction(userId, 'payment_unfreeze', reason, {
          subscriptionsResumed: result.subscriptionsResumed
        });

      } catch (dbError) {
        await pool!.query('ROLLBACK');
        throw dbError;
      }

    } catch (error: any) {
      result.error = error.message;

      await loggingService.logCriticalError('payment_unfreeze_failed', error, {
        userId,
        reason,
        actionsPerformed: result.actionsPerformed
      });
    }

    return result;
  }

  /**
   * Check if payments are allowed for a user
   * This should be called before any payment operation
   */
  async assertPaymentsAllowed(userId: string): Promise<boolean> {
    this.assertDatabaseConnection();

    const result = await pool!.query(`
      SELECT payments_blocked, payments_blocked_reason
      FROM user_admin_status
      WHERE user_id = $1
    `, [userId]);

    const userStatus = result.rows[0];
    if (userStatus?.payments_blocked) {
      throw new Error(`Payments blocked: ${userStatus.payments_blocked_reason || 'Trust and safety restriction'}`);
    }

    return true;
  }

  /**
   * Create legal escalation ticket for serious violations
   */
  async createLegalEscalationTicket(
    userId: string,
    violationCode: string,
    evidence: any[]
  ): Promise<LegalEscalationResult> {
    this.assertDatabaseConnection();

    const ticketId = `legal-${userId}-${Date.now()}`;
    const result: LegalEscalationResult = {
      success: false,
      ticketId,
      userId,
      violationCode
    };

    try {
      const ticket = {
        ticketId,
        userId,
        violationCode,
        evidence,
        priority: violationCode === 'T05' ? 'critical' : 'high',
        assignee: 'legal-team@sheenapps.com',
        createdAt: new Date().toISOString()
      };

      // For now, implement Slack webhook + email notification
      // Future: integrate with external ticketing system (Zendesk/Jira)

      if (process.env.SLACK_WEBHOOK_LEGAL) {
        await this.sendSlackNotification(ticket);
        result.success = true;
      }

      if (process.env.LEGAL_EMAIL_ENDPOINT) {
        await this.sendEmailNotification(ticket);
        result.success = true;
      }

      // Store in database for tracking
      await pool!.query(`
        INSERT INTO legal_escalation_tickets (
          ticket_id, user_id, violation_code, evidence,
          priority, assignee, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        ticketId, userId, violationCode, JSON.stringify(evidence),
        ticket.priority, ticket.assignee, ticket.createdAt
      ]);

      // Log legal escalation
      await this.logEnforcementAction(userId, 'legal_escalation', `Violation ${violationCode}`, {
        ticketId,
        violationCode,
        evidenceCount: evidence.length
      });

    } catch (error: any) {
      result.error = error.message;
      await loggingService.logCriticalError('legal_escalation_failed', error, {
        userId,
        violationCode,
        ticketId
      });
    }

    return result;
  }

  /**
   * Send Slack notification for legal escalation
   */
  private async sendSlackNotification(ticket: any): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_LEGAL;
    if (!webhookUrl) return;

    const slackMessage = {
      text: `🚨 Legal Escalation Required - ${ticket.violationCode}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 Legal Escalation - ${ticket.violationCode}`
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Ticket ID:* ${ticket.ticketId}` },
            { type: 'mrkdwn', text: `*User ID:* ${ticket.userId}` },
            { type: 'mrkdwn', text: `*Priority:* ${ticket.priority.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Evidence Items:* ${ticket.evidence.length}` }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Review Case' },
              url: `${process.env.ADMIN_DASHBOARD_URL}/legal/cases/${ticket.ticketId}`
            }
          ]
        }
      ]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  /**
   * Send email notification for legal escalation
   */
  private async sendEmailNotification(ticket: any): Promise<void> {
    // Implementation would depend on email service used
    // For now, just log the requirement
    await loggingService.logServerEvent(
      'capacity',
      'info',
      'Legal escalation email notification required',
      {
        ticketId: ticket.ticketId,
        recipient: ticket.assignee,
        violationCode: ticket.violationCode
      }
    );
  }

  /**
   * Log enforcement action for audit trail
   */
  private async logEnforcementAction(
    userId: string,
    action: string,
    reason: string,
    metadata: any = {}
  ): Promise<void> {
    await loggingService.logServerEvent(
      'capacity',
      'info',
      `Trust & Safety enforcement action: ${action}`,
      {
        userId,
        action,
        reason,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    );

    // Also store in dedicated enforcement log
    try {
      await pool!.query(`
        INSERT INTO trust_safety_actions (
          user_id, action, reason, metadata, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [userId, action, reason, JSON.stringify(metadata)]);
    } catch (error) {
      // Non-fatal if audit table doesn't exist yet
      console.warn('Failed to log to trust_safety_actions table:', error);
    }
  }
}

// Export singleton instance
export const trustSafetyEnforcer = new TrustSafetyEnforcer();