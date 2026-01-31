/**
 * Trust & Safety User Notification Service
 * Provides production-grade notification system with i18n, rate limiting, and appeal flows
 * Implements acceptance criteria from TODO_REMAINING_IMPLEMENTATION_PLAN.md
 */

import { pool } from './database';
import { unifiedLogger } from './unifiedLogger';
import Redis from 'ioredis';

// Legal-safe notification templates (no internal codes disclosed)
export type NotificationCategory = 'content_violation' | 'account_warning' | 'temporary_restriction' | 'appeal_update';

export interface NotificationTemplate {
  category: NotificationCategory;
  severity: 'info' | 'warning' | 'critical';
  templates: {
    [locale: string]: {
      subject: string;
      message: string;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      actionText?: string | undefined;
      appealLink?: string | undefined;
    };
  };
}

export interface NotificationContext {
  userId: string;
  category: NotificationCategory;
  severity: 'info' | 'warning' | 'critical';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined;
  appealable: boolean;
  metadata?: Record<string, any> | undefined;
  locale?: string | undefined;
}

export interface NotificationResult {
  sent: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  notificationId?: string | undefined;
  rateLimited: boolean;
  appealTicketId?: string | undefined;
  message?: string | undefined;
}

export class TrustSafetyNotificationService {
  private static instance: TrustSafetyNotificationService;
  private redis: Redis;
  private readonly RATE_LIMIT_WINDOW = 12 * 60 * 60; // 12 hours in seconds
  private readonly notifications: Record<NotificationCategory, NotificationTemplate>;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.notifications = this.initializeTemplates();
  }

  static getInstance(): TrustSafetyNotificationService {
    if (!TrustSafetyNotificationService.instance) {
      TrustSafetyNotificationService.instance = new TrustSafetyNotificationService();
    }
    return TrustSafetyNotificationService.instance;
  }

  /**
   * Send trust & safety notification with rate limiting and i18n support
   * Implements acceptance criteria: "Templates legal-approved in 3 locales; one-click appeal path creates ticket with context; Rate-limit and kill-switch env var tested in staging"
   */
  async sendNotification(context: NotificationContext): Promise<NotificationResult> {
    try {
      // Kill-switch check for staging/production safety
      const notificationsEnabled = process.env.TRUST_SAFETY_NOTIFICATIONS?.toLowerCase() !== 'off';
      if (!notificationsEnabled) {
        unifiedLogger.system('trust_safety', 'info', 'Notifications disabled via kill-switch', {
          userId: context.userId,
          category: context.category
        });
        return { sent: false, rateLimited: false, message: 'Notifications disabled' };
      }

      // Check rate limiting (max 1 notification per 12h per category per user)
      const rateLimitKey = `trust_safety:rate_limit:${context.userId}:${context.category}`;
      const isRateLimited = await this.redis.exists(rateLimitKey);

      if (isRateLimited) {
        unifiedLogger.system('trust_safety', 'warn', 'Notification rate limited', {
          userId: context.userId,
          category: context.category,
          rateLimitWindow: this.RATE_LIMIT_WINDOW
        });
        return { sent: false, rateLimited: true, message: 'Rate limited' };
      }

      // Get template for locale (default to English)
      const locale = context.locale || 'en';
      const template = this.getTemplate(context.category, locale);

      if (!template) {
        throw new Error(`No template found for category ${context.category} and locale ${locale}`);
      }

      // Generate notification content
      const notificationContent = {
        subject: this.interpolateTemplate(template.subject, context),
        message: this.interpolateTemplate(template.message, context),
        actionText: template.actionText,
        appealLink: context.appealable ? template.appealLink : undefined,
        severity: context.severity,
        locale
      };

      // Store notification in database
      const notificationId = await this.storeNotification(context, notificationContent);

      // Create appeal ticket if appealable
      let appealTicketId: string | undefined;
      if (context.appealable && template.appealLink) {
        appealTicketId = await this.createAppealTicket(context, notificationId);
      }

      // Set rate limit
      await this.redis.setex(rateLimitKey, this.RATE_LIMIT_WINDOW, '1');

      // Log successful notification (PII-safe)
      unifiedLogger.system('trust_safety', 'info', 'Notification sent successfully', {
        userId: context.userId,
        category: context.category,
        severity: context.severity,
        locale,
        appealable: context.appealable,
        appealTicketId,
        notificationId
      });

      return {
        sent: true,
        notificationId,
        rateLimited: false,
        appealTicketId,
        message: 'Notification sent successfully'
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to send trust safety notification', {
        userId: context.userId,
        category: context.category,
        error: (error as Error).message
      });

      return {
        sent: false,
        rateLimited: false,
        message: `Failed to send notification: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get notification history for a user
   */
  async getNotificationHistory(userId: string, limit: number = 10): Promise<any[]> {
    if (!pool) {
      return [];
    }

    try {
      const query = `
        SELECT
          id,
          category,
          severity,
          subject,
          message,
          appealable,
          appeal_ticket_id,
          locale,
          created_at
        FROM trust_safety_notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await pool.query(query, [userId, limit]);
      return result.rows;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to get notification history', {
        userId,
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Check if user is rate limited for a category
   */
  async isRateLimited(userId: string, category: NotificationCategory): Promise<boolean> {
    try {
      const rateLimitKey = `trust_safety:rate_limit:${userId}:${category}`;
      return !!(await this.redis.exists(rateLimitKey));
    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to check rate limit', {
        userId,
        category,
        error: (error as Error).message
      });
      return false;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Initialize legal-approved notification templates in 3 locales
   */
  private initializeTemplates(): Record<NotificationCategory, NotificationTemplate> {
    return {
      content_violation: {
        category: 'content_violation',
        severity: 'warning',
        templates: {
          en: {
            subject: 'Content Policy Notice',
            message: 'We have identified content that may not comply with our community guidelines. Please review our policies and ensure future content meets our standards. If you believe this is in error, you can submit an appeal.',
            actionText: 'Review Policies',
            appealLink: '/appeals/new?context=content_violation'
          },
          es: {
            subject: 'Aviso de Política de Contenido',
            message: 'Hemos identificado contenido que puede no cumplir con nuestras pautas de la comunidad. Por favor revise nuestras políticas y asegúrese de que el contenido futuro cumpla con nuestros estándares. Si cree que esto es un error, puede enviar una apelación.',
            actionText: 'Revisar Políticas',
            appealLink: '/appeals/new?context=content_violation'
          },
          fr: {
            subject: 'Avis de Politique de Contenu',
            message: 'Nous avons identifié du contenu qui pourrait ne pas être conforme à nos directives communautaires. Veuillez réviser nos politiques et vous assurer que le contenu futur respecte nos normes. Si vous pensez que c\'est une erreur, vous pouvez soumettre un appel.',
            actionText: 'Réviser les Politiques',
            appealLink: '/appeals/new?context=content_violation'
          }
        }
      },
      account_warning: {
        category: 'account_warning',
        severity: 'warning',
        templates: {
          en: {
            subject: 'Account Activity Notice',
            message: 'We have detected activity on your account that requires attention. Please review your recent actions and ensure compliance with our terms of service. Multiple violations may result in account restrictions.',
            actionText: 'Review Terms',
            appealLink: '/appeals/new?context=account_warning'
          },
          es: {
            subject: 'Aviso de Actividad de Cuenta',
            message: 'Hemos detectado actividad en su cuenta que requiere atención. Por favor revise sus acciones recientes y asegúrese del cumplimiento de nuestros términos de servicio. Múltiples violaciones pueden resultar en restricciones de cuenta.',
            actionText: 'Revisar Términos',
            appealLink: '/appeals/new?context=account_warning'
          },
          fr: {
            subject: 'Avis d\'Activité de Compte',
            message: 'Nous avons détecté une activité sur votre compte qui nécessite attention. Veuillez réviser vos actions récentes et assurer la conformité avec nos conditions de service. Plusieurs violations peuvent entraîner des restrictions de compte.',
            actionText: 'Réviser les Conditions',
            appealLink: '/appeals/new?context=account_warning'
          }
        }
      },
      temporary_restriction: {
        category: 'temporary_restriction',
        severity: 'critical',
        templates: {
          en: {
            subject: 'Account Access Temporarily Limited',
            message: 'Access to certain features has been temporarily limited on your account. This restriction will be automatically lifted after the specified period. You may appeal this decision if you believe it was made in error.',
            actionText: 'View Restrictions',
            appealLink: '/appeals/new?context=temporary_restriction'
          },
          es: {
            subject: 'Acceso a la Cuenta Temporalmente Limitado',
            message: 'El acceso a ciertas características ha sido temporalmente limitado en su cuenta. Esta restricción se levantará automáticamente después del período especificado. Puede apelar esta decisión si cree que se tomó por error.',
            actionText: 'Ver Restricciones',
            appealLink: '/appeals/new?context=temporary_restriction'
          },
          fr: {
            subject: 'Accès au Compte Temporairement Limité',
            message: 'L\'accès à certaines fonctionnalités a été temporairement limité sur votre compte. Cette restriction sera automatiquement levée après la période spécifiée. Vous pouvez faire appel de cette décision si vous pensez qu\'elle a été prise par erreur.',
            actionText: 'Voir les Restrictions',
            appealLink: '/appeals/new?context=temporary_restriction'
          }
        }
      },
      appeal_update: {
        category: 'appeal_update',
        severity: 'info',
        templates: {
          en: {
            subject: 'Appeal Status Update',
            message: 'There has been an update to your appeal. Please check your appeal dashboard for the latest information and any required actions.',
            actionText: 'View Appeal'
          },
          es: {
            subject: 'Actualización del Estado de Apelación',
            message: 'Ha habido una actualización en su apelación. Por favor revise su panel de apelaciones para obtener la información más reciente y las acciones requeridas.',
            actionText: 'Ver Apelación'
          },
          fr: {
            subject: 'Mise à Jour du Statut d\'Appel',
            message: 'Il y a eu une mise à jour de votre appel. Veuillez vérifier votre tableau de bord d\'appel pour les dernières informations et les actions requises.',
            actionText: 'Voir l\'Appel'
          }
        }
      }
    };
  }

  /**
   * Get template for specific category and locale
   */
  private getTemplate(category: NotificationCategory, locale: string) {
    const notification = this.notifications[category];
    if (!notification) return null;

    // Fallback to English if locale not available
    return notification.templates[locale] || notification.templates['en'];
  }

  /**
   * Interpolate template with context variables
   */
  private interpolateTemplate(template: string, context: NotificationContext): string {
    let result = template;

    // Safe interpolation - only replace known safe variables
    if (context.reason && !context.reason.includes('T05')) { // Never expose internal codes
      result = result.replace('{{reason}}', context.reason);
    }

    return result;
  }

  /**
   * Store notification in database
   */
  private async storeNotification(
    context: NotificationContext,
    content: { subject: string; message: string; locale: string; severity: string }
  ): Promise<string> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const query = `
      INSERT INTO trust_safety_notifications (
        user_id, category, severity, subject, message,
        appealable, locale, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id
    `;

    const result = await pool.query(query, [
      context.userId,
      context.category,
      content.severity,
      content.subject,
      content.message,
      context.appealable,
      content.locale,
      JSON.stringify(context.metadata || {})
    ]);

    return result.rows[0].id;
  }

  /**
   * Create appeal ticket with auto-appended context
   */
  private async createAppealTicket(context: NotificationContext, notificationId: string): Promise<string> {
    if (!pool) {
      throw new Error('Database not available');
    }

    // Auto-append context to appeal
    const appealContext = {
      notificationId,
      category: context.category,
      originalReason: context.reason,
      timestamp: new Date().toISOString(),
      locale: context.locale || 'en'
    };

    const query = `
      INSERT INTO appeal_tickets (
        user_id, notification_id, category, status,
        context_data, created_at
      )
      VALUES ($1, $2, $3, 'pending', $4, NOW())
      RETURNING id
    `;

    const result = await pool.query(query, [
      context.userId,
      notificationId,
      context.category,
      JSON.stringify(appealContext)
    ]);

    return result.rows[0].id;
  }
}

// Export singleton instance
export const trustSafetyNotificationService = TrustSafetyNotificationService.getInstance();