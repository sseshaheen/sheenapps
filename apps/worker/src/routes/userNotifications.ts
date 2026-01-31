/**
 * User Notifications API Routes
 * Provides user-facing endpoints for viewing notifications and managing appeals
 * Implements CLAUDE.md compliance: explicit userId parameter pattern and x-sheen-locale header
 */

import { FastifyPluginAsync } from 'fastify';
import { trustSafetyNotificationService } from '../services/trustSafetyNotificationService';
import { pool } from '../services/database';

interface NotificationQuerystring {
  userId: string;
  limit?: string;
}

interface AppealBody {
  userId: string;
  notificationId: string;
  statement: string;
}

interface MarkReadBody {
  userId: string;
  notificationId: string;
}

const userNotificationsRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /api/user-notifications
   * Get user's trust & safety notifications with i18n support
   */
  fastify.get<{
    Querystring: NotificationQuerystring;
  }>('/api/user-notifications', async (request, reply) => {
    try {
      const { userId, limit: limitStr } = request.query;
      const limit = limitStr ? parseInt(limitStr, 10) : 10;

      if (!userId) {
        reply.code(400).send({
          error: 'Missing required parameter',
          message: 'userId is required'
        });
        return;
      }

      // Validate limit
      if (isNaN(limit) || limit < 1 || limit > 100) {
        reply.code(400).send({
          error: 'Invalid limit',
          message: 'limit must be between 1 and 100'
        });
        return;
      }

      // Get notification history
      const notifications = await trustSafetyNotificationService.getNotificationHistory(userId, limit);

      // Get unread count
      const unreadCount = await getUnreadNotificationCount(userId);

      reply.send({
        notifications,
        unreadCount,
        total: notifications.length,
        limit,
        locale: request.headers['x-sheen-locale'] || 'en'
      });

    } catch (error) {
      console.error('[User Notifications] Failed to get notifications:', error);
      reply.code(500).send({
        error: 'Failed to get notifications',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/user-notifications/mark-read
   * Mark notification as read
   */
  fastify.post<{
    Body: MarkReadBody;
  }>('/api/user-notifications/mark-read', async (request, reply) => {
    try {
      const { userId, notificationId } = request.body;

      if (!userId || !notificationId) {
        reply.code(400).send({
          error: 'Missing required fields',
          message: 'userId and notificationId are required'
        });
        return;
      }

      await markNotificationAsRead(userId, notificationId);

      reply.send({
        success: true,
        message: 'Notification marked as read'
      });

    } catch (error) {
      console.error('[User Notifications] Failed to mark notification as read:', error);
      reply.code(500).send({
        error: 'Failed to mark notification as read',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/user-notifications/appeal
   * Create appeal for notification with one-click appeal path
   * Implements acceptance criteria: "one-click appeal path creates ticket with context"
   */
  fastify.post<{
    Body: AppealBody;
  }>('/api/user-notifications/appeal', async (request, reply) => {
    try {
      const { userId, notificationId, statement } = request.body;

      if (!userId || !notificationId) {
        reply.code(400).send({
          error: 'Missing required fields',
          message: 'userId and notificationId are required'
        });
        return;
      }

      if (!statement || statement.trim().length < 10) {
        reply.code(400).send({
          error: 'Invalid statement',
          message: 'Appeal statement must be at least 10 characters'
        });
        return;
      }

      // Verify notification exists and is appealable
      const notification = await getNotificationDetails(userId, notificationId);
      if (!notification) {
        reply.code(404).send({
          error: 'Notification not found',
          message: 'The specified notification does not exist or does not belong to this user'
        });
        return;
      }

      if (!notification.appealable) {
        reply.code(400).send({
          error: 'Not appealable',
          message: 'This notification cannot be appealed'
        });
        return;
      }

      // Check if appeal already exists
      const existingAppeal = await getExistingAppeal(notificationId);
      if (existingAppeal) {
        reply.code(409).send({
          error: 'Appeal already exists',
          message: 'An appeal for this notification already exists',
          appealId: existingAppeal.id,
          status: existingAppeal.status
        });
        return;
      }

      // Create appeal with auto-appended context
      const appealId = await createAppealWithContext(userId, notificationId, statement, notification);

      // Update notification with appeal reference
      await updateNotificationAppealId(notificationId, appealId);

      reply.send({
        success: true,
        appealId,
        message: 'Appeal submitted successfully',
        status: 'pending',
        estimatedReviewTime: '3-5 business days'
      });

    } catch (error) {
      console.error('[User Notifications] Failed to create appeal:', error);
      reply.code(500).send({
        error: 'Failed to create appeal',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/user-notifications/appeals
   * Get user's appeal history
   */
  fastify.get<{
    Querystring: { userId: string; };
  }>('/api/user-notifications/appeals', async (request, reply) => {
    try {
      const { userId } = request.query;

      if (!userId) {
        reply.code(400).send({
          error: 'Missing required parameter',
          message: 'userId is required'
        });
        return;
      }

      const appeals = await getUserAppeals(userId);

      reply.send({
        appeals,
        total: appeals.length
      });

    } catch (error) {
      console.error('[User Notifications] Failed to get appeals:', error);
      reply.code(500).send({
        error: 'Failed to get appeals',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/user-notifications/health
   * Health check for notification system
   */
  fastify.get('/api/user-notifications/health', async (request, reply) => {
    try {
      const rateLimitTest = await trustSafetyNotificationService.isRateLimited('test-user', 'content_violation');

      reply.send({
        status: 'healthy',
        features: {
          notifications_enabled: process.env.TRUST_SAFETY_NOTIFICATIONS !== 'off',
          rate_limiting: !rateLimitTest, // Should be false for test user
          database_connection: !!pool,
          i18n_locales: ['en', 'es', 'fr']
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[User Notifications] Health check failed:', error);
      reply.code(500).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUnreadNotificationCount(userId: string): Promise<number> {
  if (!pool) return 0;

  try {
    const query = `
      SELECT COUNT(*) as count
      FROM trust_safety_notifications
      WHERE user_id = $1 AND read_at IS NULL
    `;

    const result = await pool.query(query, [userId]);
    return parseInt(result.rows[0]?.count || '0', 10);

  } catch (error) {
    console.error('Failed to get unread notification count:', error);
    return 0;
  }
}

async function markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
  if (!pool) return;

  const query = `
    UPDATE trust_safety_notifications
    SET read_at = NOW()
    WHERE id = $1 AND user_id = $2 AND read_at IS NULL
  `;

  await pool.query(query, [notificationId, userId]);
}

async function getNotificationDetails(userId: string, notificationId: string): Promise<any> {
  if (!pool) return null;

  try {
    const query = `
      SELECT id, category, appealable, metadata
      FROM trust_safety_notifications
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [notificationId, userId]);
    return result.rows[0] || null;

  } catch (error) {
    console.error('Failed to get notification details:', error);
    return null;
  }
}

async function getExistingAppeal(notificationId: string): Promise<any> {
  if (!pool) return null;

  try {
    const query = `
      SELECT id, status
      FROM appeal_tickets
      WHERE notification_id = $1
    `;

    const result = await pool.query(query, [notificationId]);
    return result.rows[0] || null;

  } catch (error) {
    console.error('Failed to check existing appeal:', error);
    return null;
  }
}

async function createAppealWithContext(
  userId: string,
  notificationId: string,
  statement: string,
  notification: any
): Promise<string> {
  if (!pool) throw new Error('Database not available');

  // Auto-append context as specified in acceptance criteria
  const contextData = {
    notificationId,
    category: notification.category,
    originalMetadata: notification.metadata,
    timestamp: new Date().toISOString(),
    userAgent: 'web-interface',
    appealType: 'user_initiated'
  };

  const query = `
    INSERT INTO appeal_tickets (
      user_id, notification_id, category, status,
      user_statement, context_data, created_at
    )
    VALUES ($1, $2, $3, 'pending', $4, $5, NOW())
    RETURNING id
  `;

  const result = await pool.query(query, [
    userId,
    notificationId,
    notification.category,
    statement,
    JSON.stringify(contextData)
  ]);

  return result.rows[0].id;
}

async function updateNotificationAppealId(notificationId: string, appealId: string): Promise<void> {
  if (!pool) return;

  const query = `
    UPDATE trust_safety_notifications
    SET appeal_ticket_id = $1
    WHERE id = $2
  `;

  await pool.query(query, [appealId, notificationId]);
}

async function getUserAppeals(userId: string): Promise<any[]> {
  if (!pool) return [];

  try {
    const query = `
      SELECT
        id,
        notification_id,
        category,
        status,
        user_statement,
        admin_response,
        resolved_at,
        created_at,
        updated_at
      FROM appeal_tickets
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;

  } catch (error) {
    console.error('Failed to get user appeals:', error);
    return [];
  }
}

export default userNotificationsRoutes;