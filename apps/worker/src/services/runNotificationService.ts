/**
 * RunNotificationService
 *
 * Sends notifications to project owners when business events occur.
 * Integrates with InhouseEmailService for email delivery.
 *
 * Part of Run Hub Phase 2.5
 */

import { getPool } from './database'
import { getInhouseEmailService } from './inhouse/InhouseEmailService'

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationPreferences {
  email_on_lead?: boolean
  email_on_payment?: boolean
  email_on_payment_failed?: boolean
  email_on_abandoned_checkout?: boolean
  email_recipient?: string // defaults to owner email
  enabled?: boolean // master switch
}

export interface ProjectInfo {
  id: string
  name: string
  ownerEmail: string
  ownerName?: string
  notificationPrefs: NotificationPreferences
}

// Event types that can trigger notifications
const NOTIFIABLE_EVENTS = [
  'lead_created',
  'signup',
  'payment_succeeded',
  'payment_failed',
  'abandoned_checkout',
  'subscription_started',
  'subscription_canceled'
] as const

type NotifiableEventType = typeof NOTIFIABLE_EVENTS[number]

// =============================================================================
// SERVICE
// =============================================================================

export class RunNotificationService {
  /**
   * Check if notification should be sent and send it.
   * Called after a business event is inserted.
   * Runs asynchronously - does not block event insertion.
   */
  async checkAndNotify(
    projectId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Only process notifiable events
      if (!NOTIFIABLE_EVENTS.includes(eventType as NotifiableEventType)) {
        return
      }

      // Get project info and notification preferences
      const projectInfo = await this.getProjectInfo(projectId)
      if (!projectInfo) {
        console.log(`[RunNotification] Project ${projectId} not found`)
        return
      }

      // Check if notifications are enabled
      const prefs = projectInfo.notificationPrefs
      if (prefs.enabled === false) {
        return
      }

      // Determine if this event should trigger a notification
      const shouldNotify = this.shouldNotifyForEvent(eventType as NotifiableEventType, prefs)
      if (!shouldNotify) {
        return
      }

      // Get recipient email
      const recipientEmail = prefs.email_recipient || projectInfo.ownerEmail
      if (!recipientEmail) {
        console.log(`[RunNotification] No email recipient for project ${projectId}`)
        return
      }

      // Send notification
      await this.sendNotification(
        projectId,
        projectInfo.name,
        recipientEmail,
        projectInfo.ownerName,
        eventType as NotifiableEventType,
        payload
      )
    } catch (error) {
      // Log but don't throw - notifications are fire-and-forget
      console.error(`[RunNotification] Error sending notification:`, error)
    }
  }

  /**
   * Get project info including owner email and notification preferences
   */
  private async getProjectInfo(projectId: string): Promise<ProjectInfo | null> {
    const pool = getPool()

    const result = await pool.query(
      `SELECT
        p.id,
        p.name,
        p.config,
        u.email as owner_email,
        u.raw_user_meta_data->>'name' as owner_name
      FROM projects p
      JOIN auth.users u ON p.owner_id = u.id
      WHERE p.id = $1`,
      [projectId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    const runSettings = row.config?.run_settings || {}
    const notificationPrefs = runSettings.notifications || {}

    return {
      id: row.id,
      name: row.name || 'Your Project',
      ownerEmail: row.owner_email,
      ownerName: row.owner_name,
      notificationPrefs
    }
  }

  /**
   * Check if event type should trigger notification based on preferences
   */
  private shouldNotifyForEvent(
    eventType: NotifiableEventType,
    prefs: NotificationPreferences
  ): boolean {
    switch (eventType) {
      case 'lead_created':
      case 'signup':
        return prefs.email_on_lead === true

      case 'payment_succeeded':
      case 'subscription_started':
        return prefs.email_on_payment === true

      case 'payment_failed':
      case 'subscription_canceled':
        return prefs.email_on_payment_failed === true

      case 'abandoned_checkout':
        return prefs.email_on_abandoned_checkout === true

      default:
        return false
    }
  }

  /**
   * Send notification email using InhouseEmailService
   */
  private async sendNotification(
    projectId: string,
    projectName: string,
    recipientEmail: string,
    recipientName: string | undefined,
    eventType: NotifiableEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const emailService = getInhouseEmailService(projectId)

    // Build notification content based on event type
    const { title, message, subject } = this.buildNotificationContent(
      eventType,
      projectName,
      payload
    )

    const runUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.sheenapps.com'}/project/${projectId}/run`

    await emailService.send({
      to: recipientEmail,
      template: 'notification',
      variables: {
        title,
        message,
        subject,
        actionUrl: runUrl,
        actionText: 'View in Run Hub',
        appName: projectName
      },
      idempotencyKey: `run-notification:${projectId}:${eventType}:${Date.now()}`
    })

    console.log(`[RunNotification] Sent ${eventType} notification to ${recipientEmail} for project ${projectId}`)
  }

  /**
   * Build notification content based on event type
   */
  private buildNotificationContent(
    eventType: NotifiableEventType,
    projectName: string,
    payload: Record<string, unknown>
  ): { title: string; message: string; subject: string } {
    switch (eventType) {
      case 'lead_created':
        return {
          title: 'New Lead',
          message: `You have a new lead on ${projectName}. ${payload.email ? `Email: ${payload.email}` : 'Check your Run Hub for details.'}`,
          subject: `New lead on ${projectName}`
        }

      case 'signup':
        return {
          title: 'New Signup',
          message: `Someone just signed up on ${projectName}! ${payload.email ? `Email: ${payload.email}` : ''}`,
          subject: `New signup on ${projectName}`
        }

      case 'payment_succeeded':
        const amount = payload.amount_cents
          ? `${((payload.amount_cents as number) / 100).toFixed(2)} ${(payload.currency as string || 'USD').toUpperCase()}`
          : ''
        return {
          title: 'Payment Received',
          message: `Great news! You received a payment${amount ? ` of ${amount}` : ''} on ${projectName}.`,
          subject: `Payment received on ${projectName}${amount ? ` - ${amount}` : ''}`
        }

      case 'payment_failed':
        return {
          title: 'Payment Failed',
          message: `A payment failed on ${projectName}. You may want to follow up with the customer.`,
          subject: `Payment failed on ${projectName}`
        }

      case 'subscription_started':
        return {
          title: 'New Subscriber',
          message: `You have a new subscriber on ${projectName}!`,
          subject: `New subscription on ${projectName}`
        }

      case 'subscription_canceled':
        return {
          title: 'Subscription Canceled',
          message: `A subscription was canceled on ${projectName}.`,
          subject: `Subscription canceled on ${projectName}`
        }

      case 'abandoned_checkout':
        return {
          title: 'Abandoned Checkout',
          message: `Someone started checkout but didn't complete it on ${projectName}. Consider following up.`,
          subject: `Abandoned checkout on ${projectName}`
        }

      default:
        return {
          title: 'Business Event',
          message: `New activity on ${projectName}.`,
          subject: `Activity on ${projectName}`
        }
    }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let instance: RunNotificationService | null = null

export function getRunNotificationService(): RunNotificationService {
  if (!instance) {
    instance = new RunNotificationService()
  }
  return instance
}

/** Reset singleton for testing */
export function resetRunNotificationServiceInstance(): void {
  instance = null
}
