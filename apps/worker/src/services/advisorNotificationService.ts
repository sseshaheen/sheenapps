/**
 * Advisor Notification Service
 * 
 * Production-ready notification service for advisor matching with:
 * - Outbox pattern for reliable delivery
 * - Dead letter queue for failed notifications
 * - Multi-channel delivery (email, SMS, push, in-app)
 * - Exponential backoff with jitter
 * - Idempotency and duplicate prevention
 * - Rich notification templates
 */

import { pool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import {
  NotificationOutbox,
  AdvisorMatchNotification,
  NotificationStatus,
  NOTIFICATION_TYPES,
  DELIVERY_METHODS,
  MAX_NOTIFICATION_ATTEMPTS
} from '../types/advisorMatching';

export interface NotificationTemplate {
  subject: string;
  body: string;
  actionUrl?: string;
  actionText?: string;
}

export interface NotificationContext {
  projectId: string;
  projectName: string;
  clientName: string;
  advisorName: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  matchScore?: number | undefined;
  techStack?: string[] | undefined;
  expiresAt?: string | undefined;
  matchId?: string | undefined;
}

export interface SendNotificationParams {
  matchRequestId: string;
  recipientId: string;
  notificationType: keyof typeof NOTIFICATION_TYPES;
  deliveryMethod: keyof typeof DELIVERY_METHODS;
  context: NotificationContext;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  maxAttempts?: number;
}

export interface ProcessOutboxResult {
  processed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
}

export interface NotificationProvider {
  sendEmail(to: string, subject: string, body: string, context: NotificationContext): Promise<any>;
  sendSMS(to: string, message: string, context: NotificationContext): Promise<any>;
  sendPush(to: string, title: string, body: string, context: NotificationContext): Promise<any>;
}

export class AdvisorNotificationService {
  private logger = ServerLoggingService.getInstance();
  private providers: Map<string, NotificationProvider> = new Map();

  constructor() {
    if (!pool) {
      throw new Error('Database connection not available');
    }
  }

  // =====================================================
  // Provider Registration
  // =====================================================

  registerProvider(method: string, provider: NotificationProvider): void {
    this.providers.set(method, provider);
  }

  // =====================================================
  // Notification Creation (Outbox Pattern)
  // =====================================================

  async queueNotification(params: SendNotificationParams): Promise<string> {
    const {
      matchRequestId,
      recipientId,
      notificationType,
      deliveryMethod,
      context,
      priority = 'normal',
      maxAttempts = MAX_NOTIFICATION_ATTEMPTS
    } = params;

    try {
      // Enrich context with additional data
      const enrichedContext = await this.enrichNotificationContext(context);

      // Generate notification content
      const template = this.generateNotificationTemplate(notificationType, deliveryMethod, enrichedContext);

      // Calculate next attempt time based on priority
      const nextAttemptAt = this.calculateNextAttemptTime(0, priority);

      const result = await pool!.query(`
        INSERT INTO notification_outbox (
          match_request_id,
          recipient_id,
          notification_type,
          delivery_method,
          payload,
          max_attempts,
          next_attempt_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (match_request_id, recipient_id, notification_type, delivery_method)
        WHERE status IN ('pending', 'queued')
        DO NOTHING
        RETURNING id
      `, [
        matchRequestId,
        recipientId,
        NOTIFICATION_TYPES[notificationType],
        DELIVERY_METHODS[deliveryMethod],
        JSON.stringify({
          template,
          context: enrichedContext,
          priority
        }),
        maxAttempts,
        nextAttemptAt
      ]);

      if (result.rows.length === 0) {
        // Notification already exists (idempotency)
        const existingResult = await pool!.query(`
          SELECT id FROM notification_outbox
          WHERE match_request_id = $1 
            AND recipient_id = $2 
            AND notification_type = $3 
            AND delivery_method = $4
        `, [matchRequestId, recipientId, NOTIFICATION_TYPES[notificationType], DELIVERY_METHODS[deliveryMethod]]);

        return existingResult.rows[0]?.id || '';
      }

      await this.logger.logServerEvent('routing', 'info', 'Notification queued', {
        notificationId: result.rows[0].id,
        matchRequestId,
        recipientId,
        notificationType,
        deliveryMethod
      });

      return result.rows[0].id;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error queueing notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        matchRequestId,
        recipientId,
        notificationType
      });
      throw error;
    }
  }

  // =====================================================
  // Outbox Processing
  // =====================================================

  async processOutbox(batchSize: number = 10): Promise<ProcessOutboxResult> {
    try {
      // Get pending notifications
      const pendingResult = await pool!.query(`
        SELECT * FROM notification_outbox
        WHERE status = 'pending'
          AND next_attempt_at <= now()
          AND dead_letter = false
        ORDER BY 
          CASE 
            WHEN payload->>'priority' = 'urgent' THEN 1
            WHEN payload->>'priority' = 'high' THEN 2
            WHEN payload->>'priority' = 'normal' THEN 3
            ELSE 4
          END,
          created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `, [batchSize]);

      const notifications = pendingResult.rows;
      let processed = 0;
      let delivered = 0;
      let failed = 0;
      let deadLettered = 0;

      for (const notification of notifications) {
        processed++;

        try {
          // Mark as queued
          await pool!.query(`
            UPDATE notification_outbox
            SET status = 'queued', attempts = attempts + 1
            WHERE id = $1
          `, [notification.id]);

          // Attempt delivery
          const deliveryResult = await this.attemptDelivery(notification);

          if (deliveryResult.success) {
            // Mark as delivered
            await this.markNotificationDelivered(notification.id, deliveryResult.response);
            delivered++;
          } else {
            // Handle failure
            const shouldDeadLetter = await this.handleDeliveryFailure(
              notification.id,
              notification.attempts + 1,
              notification.max_attempts,
              deliveryResult.error || 'Unknown delivery error'
            );

            if (shouldDeadLetter) {
              deadLettered++;
            } else {
              failed++;
            }
          }

        } catch (error) {
          // Handle processing error
          await this.handleDeliveryFailure(
            notification.id,
            notification.attempts + 1,
            notification.max_attempts,
            error instanceof Error ? error.message : 'Processing error'
          );
          failed++;
        }
      }

      await this.logger.logServerEvent('routing', 'info', 'Outbox processing completed', {
        processed,
        delivered,
        failed,
        deadLettered
      });

      return { processed, delivered, failed, deadLettered };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error processing outbox', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async attemptDelivery(notification: any): Promise<{ success: boolean; response?: any; error?: string }> {
    const payload = notification.payload;
    const template = payload.template;
    const context = payload.context;
    const provider = this.providers.get(notification.delivery_method);

    if (!provider) {
      return {
        success: false,
        error: `No provider registered for delivery method: ${notification.delivery_method}`
      };
    }

    try {
      // Get recipient details
      const recipientResult = await pool!.query(`
        SELECT email, phone, display_name
        FROM auth.users
        WHERE id = $1
      `, [notification.recipient_id]);

      if (recipientResult.rows.length === 0) {
        return {
          success: false,
          error: 'Recipient not found'
        };
      }

      const recipient = recipientResult.rows[0];
      let response: any;

      switch (notification.delivery_method) {
        case 'email':
          if (!recipient.email) {
            return { success: false, error: 'Recipient email not available' };
          }
          response = await provider.sendEmail(recipient.email, template.subject, template.body, context);
          break;

        case 'sms':
          if (!recipient.phone) {
            return { success: false, error: 'Recipient phone not available' };
          }
          response = await provider.sendSMS(recipient.phone, template.body, context);
          break;

        case 'push':
          response = await provider.sendPush(notification.recipient_id, template.subject, template.body, context);
          break;

        case 'in_app':
          // Handle in-app notifications (could integrate with existing chat system)
          response = { success: true, method: 'in_app' };
          break;

        default:
          return {
            success: false,
            error: `Unsupported delivery method: ${notification.delivery_method}`
          };
      }

      return { success: true, response };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delivery error'
      };
    }
  }

  private async markNotificationDelivered(notificationId: string, response: any): Promise<void> {
    await pool!.query(`
      UPDATE notification_outbox
      SET 
        status = 'delivered',
        delivered_at = now()
      WHERE id = $1
    `, [notificationId]);

    // Record successful delivery
    await pool!.query(`
      INSERT INTO advisor_match_notifications (
        outbox_id,
        match_request_id,
        recipient_id,
        notification_type,
        delivery_method,
        response_data
      )
      SELECT 
        id,
        match_request_id,
        recipient_id,
        notification_type,
        delivery_method,
        $2
      FROM notification_outbox
      WHERE id = $1
    `, [notificationId, JSON.stringify(response)]);
  }

  private async handleDeliveryFailure(
    notificationId: string,
    currentAttempts: number,
    maxAttempts: number,
    errorMessage: string
  ): Promise<boolean> {
    const shouldDeadLetter = currentAttempts >= maxAttempts;

    if (shouldDeadLetter) {
      // Move to dead letter queue
      await pool!.query(`
        UPDATE notification_outbox
        SET 
          status = 'failed',
          dead_letter = true
        WHERE id = $1
      `, [notificationId]);

      await this.logger.logServerEvent('error', 'warn', 'Notification moved to dead letter queue', {
        notificationId,
        attempts: currentAttempts,
        error: errorMessage
      });

      return true;
    } else {
      // Schedule retry with exponential backoff
      const nextAttemptAt = this.calculateNextAttemptTime(currentAttempts, 'normal');

      await pool!.query(`
        UPDATE notification_outbox
        SET 
          status = 'pending',
          next_attempt_at = $2
        WHERE id = $1
      `, [notificationId, nextAttemptAt]);

      return false;
    }
  }

  // =====================================================
  // Template Generation
  // =====================================================

  private generateNotificationTemplate(
    notificationType: keyof typeof NOTIFICATION_TYPES,
    deliveryMethod: keyof typeof DELIVERY_METHODS,
    context: NotificationContext
  ): NotificationTemplate {
    const templates = {
      advisor_matched: {
        email: {
          subject: `🚀 New project match: ${context.projectName}`,
          body: `Hi ${context.advisorName},

You've been matched with a new project: "${context.projectName}" by ${context.clientName}.

Project details:
- Technology stack: ${context.techStack?.join(', ') || 'Not specified'}
- Match score: ${context.matchScore || 'N/A'}/100

This is a great opportunity to showcase your expertise and help a client succeed!

Click below to review the project and accept or decline:`,
          actionText: 'Review Project Match',
          actionUrl: `/advisor/matches/${context.matchId}`
        },
        sms: {
          subject: 'New Project Match',
          body: `New project match: "${context.projectName}" (${context.matchScore || 'N/A'}/100). Review at: [URL]`
        }
      },
      client_approval: {
        email: {
          subject: `📋 Advisor matched for your project: ${context.projectName}`,
          body: `Hi ${context.clientName},

We've found a great advisor for your project: "${context.projectName}".

Advisor: ${context.advisorName}
Match score: ${context.matchScore || 'N/A'}/100
Technology expertise: ${context.techStack?.join(', ') || 'Multiple technologies'}

This advisor has been carefully selected based on their skills and availability. 

Please review their profile and approve the match to start collaboration:`,
          actionText: 'Review & Approve Advisor',
          actionUrl: `/client/matches/${context.matchId}`
        }
      },
      advisor_accepted: {
        email: {
          subject: `✅ Advisor accepted: Ready to start on ${context.projectName}`,
          body: `Great news! ${context.advisorName} has accepted your project match.

Your collaboration workspace is now ready. You can:
- Access your project workspace
- Start real-time collaboration
- Track progress together

Get started here:`,
          actionText: 'Open Workspace',
          actionUrl: `/projects/${context.projectId}/workspace`
        }
      },
      advisor_declined: {
        email: {
          subject: `🔄 Finding new advisor for ${context.projectName}`,
          body: `The previously matched advisor was unable to take on your project at this time.

Don't worry - we're automatically finding you another qualified advisor who's a great fit for your needs.

You'll receive a notification as soon as we find your next match.`,
          actionText: 'View Project Status',
          actionUrl: `/projects/${context.projectId}`
        }
      },
      match_expired: {
        email: {
          subject: `⏰ Match expired for ${context.projectName}`,
          body: `The advisor match for your project "${context.projectName}" has expired.

This can happen when an advisor doesn't respond within our standard timeframe.

We're automatically searching for new available advisors for your project.`,
          actionText: 'Request New Match',
          actionUrl: `/projects/${context.projectId}/match`
        }
      }
    };

    const templateGroup = templates[notificationType.toLowerCase() as keyof typeof templates];
    const template = templateGroup ? (templateGroup as any)[deliveryMethod] : null;
    
    if (!template) {
      return {
        subject: 'SheenApps Notification',
        body: `You have a new ${notificationType} notification regarding ${context.projectName}.`
      };
    }

    return template as NotificationTemplate;
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  private async enrichNotificationContext(context: NotificationContext): Promise<NotificationContext> {
    try {
      // Get additional project and user details
      const projectResult = await pool!.query(`
        SELECT 
          p.name as project_name,
          p.technology_stack,
          u.display_name as owner_name
        FROM projects p
        JOIN auth.users u ON p.owner_id = u.id
        WHERE p.id = $1
      `, [context.projectId]);

      if (projectResult.rows.length > 0) {
        const project = projectResult.rows[0];
        return {
          ...context,
          projectName: project.project_name || context.projectName,
          clientName: project.owner_name || context.clientName,
          techStack: project.technology_stack ? Object.keys(project.technology_stack) : context.techStack
        };
      }

      return context;

    } catch (error) {
      // Return original context if enrichment fails
      await this.logger.logServerEvent('error', 'warn', 'Failed to enrich notification context', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: context.projectId
      });
      return context;
    }
  }

  private calculateNextAttemptTime(attempt: number, priority: string): Date {
    // Exponential backoff with jitter
    const baseDelay = priority === 'urgent' ? 30 : priority === 'high' ? 60 : 120; // seconds
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1; // 10% jitter
    const delay = exponentialDelay * (1 + jitter);

    return new Date(Date.now() + delay * 1000);
  }

  // =====================================================
  // Dead Letter Queue Management
  // =====================================================

  async getDeadLetterNotifications(limit: number = 50): Promise<NotificationOutbox[]> {
    try {
      const result = await pool!.query(`
        SELECT * FROM notification_outbox
        WHERE dead_letter = true
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => this.mapRowToNotification(row));

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching dead letter notifications', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async retryDeadLetterNotification(notificationId: string): Promise<boolean> {
    try {
      const result = await pool!.query(`
        UPDATE notification_outbox
        SET 
          dead_letter = false,
          status = 'pending',
          attempts = 0,
          next_attempt_at = now()
        WHERE id = $1 AND dead_letter = true
        RETURNING id
      `, [notificationId]);

      if (result.rows.length === 0) {
        return false;
      }

      await this.logger.logServerEvent('routing', 'info', 'Dead letter notification requeued', {
        notificationId
      });

      return true;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error retrying dead letter notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        notificationId
      });
      throw error;
    }
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  private mapRowToNotification(row: any): NotificationOutbox {
    return {
      id: row.id,
      match_request_id: row.match_request_id,
      recipient_id: row.recipient_id,
      notification_type: row.notification_type,
      delivery_method: row.delivery_method,
      payload: row.payload || {},
      status: row.status,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      next_attempt_at: row.next_attempt_at,
      delivered_at: row.delivered_at,
      dead_letter: row.dead_letter,
      created_at: row.created_at
    };
  }
}