import { logger } from '@/utils/logger'

export interface EmailNotification {
  to: string
  subject: string
  template: string
  data: Record<string, any>
}

export class NotificationService {
  /**
   * Send trial ending reminder
   */
  async sendTrialEndingReminder(params: {
    email: string
    name?: string
    trialEnd: Date
    daysRemaining: number
    planName: string
  }): Promise<void> {
    try {
      const notification: EmailNotification = {
        to: params.email,
        subject: `Your ${params.planName} trial ends in ${params.daysRemaining} days`,
        template: 'trial-ending',
        data: {
          name: params.name || 'there',
          planName: params.planName,
          daysRemaining: params.daysRemaining,
          trialEndDate: params.trialEnd.toLocaleDateString(),
          ctaUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
          ctaText: 'Upgrade Now'
        }
      }

      await this.sendEmail(notification)

      logger.info('Trial ending reminder sent', {
        email: params.email,
        daysRemaining: params.daysRemaining
      })
    } catch (error) {
      logger.error('Failed to send trial ending reminder', error)
      throw error
    }
  }

  /**
   * Send trial expired notification
   */
  async sendTrialExpiredNotification(params: {
    email: string
    name?: string
    planName: string
  }): Promise<void> {
    try {
      const notification: EmailNotification = {
        to: params.email,
        subject: `Your ${params.planName} trial has ended`,
        template: 'trial-expired',
        data: {
          name: params.name || 'there',
          planName: params.planName,
          ctaUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
          ctaText: 'Choose a Plan'
        }
      }

      await this.sendEmail(notification)

      logger.info('Trial expired notification sent', {
        email: params.email
      })
    } catch (error) {
      logger.error('Failed to send trial expired notification', error)
      throw error
    }
  }

  /**
   * Send bonus expiring reminder
   */
  async sendBonusExpiringReminder(params: {
    email: string
    name?: string
    amount: number
    expiryDate: Date
  }): Promise<void> {
    try {
      const notification: EmailNotification = {
        to: params.email,
        subject: `You have ${params.amount} bonus credits expiring soon`,
        template: 'bonus-expiring',
        data: {
          name: params.name || 'there',
          amount: params.amount,
          expiryDate: params.expiryDate.toLocaleDateString(),
          ctaUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
          ctaText: 'Use Credits Now'
        }
      }

      await this.sendEmail(notification)

      logger.info('Bonus expiring reminder sent', {
        email: params.email,
        amount: params.amount
      })
    } catch (error) {
      logger.error('Failed to send bonus expiring reminder', error)
      throw error
    }
  }

  /**
   * Send referral reward notification
   */
  async sendReferralRewardNotification(params: {
    email: string
    name?: string
    referredUserName?: string
    bonusAmount: number
  }): Promise<void> {
    try {
      const notification: EmailNotification = {
        to: params.email,
        subject: `You earned ${params.bonusAmount} bonus credits!`,
        template: 'referral-reward',
        data: {
          name: params.name || 'there',
          referredUserName: params.referredUserName || 'A friend',
          bonusAmount: params.bonusAmount,
          ctaUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
          ctaText: 'Start Building'
        }
      }

      await this.sendEmail(notification)

      logger.info('Referral reward notification sent', {
        email: params.email,
        bonusAmount: params.bonusAmount
      })
    } catch (error) {
      logger.error('Failed to send referral reward notification', error)
      throw error
    }
  }

  /**
   * Send webhook failure alert to admins
   */
  async sendWebhookFailureAlert(params: {
    webhookId: string
    gateway: string
    eventType: string
    errorMessage: string
    retryCount: number
    createdAt: string
  }): Promise<void> {
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || []
    
    if (adminEmails.length === 0) {
      logger.error('No admin emails configured for webhook failure alerts')
      return
    }

    const subject = `[URGENT] Webhook Failed After ${params.retryCount} Retries`
    
    const data = {
      webhookId: params.webhookId,
      gateway: params.gateway,
      eventType: params.eventType,
      errorMessage: params.errorMessage,
      retryCount: params.retryCount,
      createdAt: new Date(params.createdAt).toLocaleString(),
      adminUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/webhooks`
    }

    // Send to all admin emails
    await Promise.all(
      adminEmails.map(email => 
        this.sendEmail({
          to: email.trim(),
          subject,
          template: 'webhook-failure',
          data
        })
      )
    )

    logger.info('Webhook failure alerts sent', {
      webhookId: params.webhookId,
      adminCount: adminEmails.length
    })
  }

  /**
   * Send email using the configured email service
   * In production, this would integrate with SendGrid, AWS SES, or similar
   */
  private async sendEmail(notification: EmailNotification): Promise<void> {
    // TODO: Implement actual email sending
    // For now, just log the email
    logger.info('Email would be sent', {
      to: notification.to,
      subject: notification.subject,
      template: notification.template
    })

    // In production, you would:
    // 1. Use a service like SendGrid, AWS SES, Resend, etc.
    // 2. Load HTML templates
    // 3. Replace template variables with data
    // 4. Send the email
    
    // Example with SendGrid:
    // const msg = {
    //   to: notification.to,
    //   from: process.env.FROM_EMAIL,
    //   subject: notification.subject,
    //   html: await this.renderTemplate(notification.template, notification.data)
    // }
    // await sgMail.send(msg)
  }
}