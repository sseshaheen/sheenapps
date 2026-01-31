/**
 * Support Ticket Management Routes
 * 
 * Complete support ticket system with internal/public messaging:
 * - Ticket creation and management
 * - Internal vs public message separation
 * - SLA tracking and escalation
 * - Attachment handling
 * - Auto-ticket creation from system events
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminAuth, requireSupportAccess } from '../middleware/adminAuthentication';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import * as crypto from 'crypto';
import { SUPPORTED_LOCALES } from '../i18n/localeUtils';

const loggingService = ServerLoggingService.getInstance();

// =====================================================
// Types
// =====================================================

interface CreateTicketRequest {
  user_id?: string;
  channel: 'web' | 'email' | 'chat' | 'calcom' | 'stripe' | 'system' | 'other';
  category: string; // billing, technical, dispute, feature_request
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subject: string;
  description: string;
  tags?: string[];
  metadata?: any;
  locale?: string; // Customer's preferred locale for communication
}

interface CreateMessageRequest {
  body: string;
  is_internal?: boolean;
  attachments?: any[];
}

// =====================================================
// Support Ticket Routes
// =====================================================

export async function registerSupportTicketRoutes(fastify: FastifyInstance) {
  if (!pool) {
    console.warn('⚠️  Database connection not available - support ticket routes disabled');
    return;
  }

  // =====================================================
  // Ticket Management
  // =====================================================

  /**
   * POST /v1/admin/support/tickets
   * Create new support ticket
   */
  fastify.post<{
    Headers: { 'x-sheen-locale'?: string; [key: string]: any };
    Body: CreateTicketRequest;
  }>('/v1/admin/support/tickets', {
    preHandler: requireSupportAccess(),
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-sheen-locale': {
            type: 'string',
            enum: SUPPORTED_LOCALES as any,
            description: 'Customer preferred locale for support communication'
          }
        }
      },
      body: {
        type: 'object',
        required: ['channel', 'category', 'priority', 'subject', 'description'],
        properties: {
          user_id: { type: 'string' },
          channel: {
            type: 'string',
            enum: ['web', 'email', 'chat', 'calcom', 'stripe', 'system', 'other']
          },
          category: { type: 'string' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent']
          },
          subject: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', minLength: 1, maxLength: 5000 },
          tags: {
            type: 'array',
            items: { type: 'string' }
          },
          metadata: { type: 'object' },
          locale: {
            type: 'string',
            enum: SUPPORTED_LOCALES as any,
            description: 'DEPRECATED: Use x-sheen-locale header instead'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        user_id,
        channel,
        category,
        priority,
        subject,
        description,
        tags = [],
        metadata = {},
        locale: bodyLocale
      } = request.body;

      // Use middleware-resolved locale or body locale (for backward compatibility)
      const customerLocale = request.locale || bodyLocale || 'en';

      const adminClaims = (request as any).adminClaims;

      // Generate ticket number
      const ticketNumberResult = await pool!.query('SELECT generate_ticket_number() as ticket_number');
      const ticket_number = ticketNumberResult.rows[0].ticket_number;

      // Calculate SLA due time
      const slaResult = await pool!.query('SELECT calculate_sla_due_time($1::ticket_priority) as sla_due_at', [priority]);
      const sla_due_at = slaResult.rows[0].sla_due_at;

      // Create ticket with locale stored in metadata
      const enhancedMetadata = {
        ...metadata,
        customerLocale: customerLocale, // Store locale for customer communication preference
        _i18n: {
          createdWithLocale: customerLocale,
          supportedLocales: SUPPORTED_LOCALES
        }
      };

      const result = await pool!.query(`
        INSERT INTO support_tickets (
          ticket_number, user_id, channel, category, tags, priority,
          subject, description, sla_due_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        ticket_number, user_id, channel, category, tags, priority,
        subject, description, sla_due_at, JSON.stringify(enhancedMetadata)
      ]);

      const ticket = result.rows[0];

      // Create initial system message
      await pool!.query(`
        INSERT INTO support_ticket_messages (
          ticket_id, sender_id, body, is_internal, message_type
        )
        VALUES ($1, $2, $3, $4, $5)
      `, [
        ticket.id,
        adminClaims.userId,
        `Ticket created by admin. Priority: ${priority}, Category: ${category}`,
        true,
        'system_event'
      ]);

      return reply.code(201).send({
        success: true,
        ticket,
        message: 'Support ticket created successfully',
        _i18n: {
          locale: customerLocale,
          localeTag: request.localeTag,
          available: SUPPORTED_LOCALES
        }
      });

    } catch (error) {
      await loggingService.logCriticalError('support_ticket_creation_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to create support ticket'
      });
    }
  });

  /**
   * GET /v1/admin/support/tickets/:id
   * Get ticket details with messages
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { include_internal?: boolean }
  }>('/v1/admin/support/tickets/:id', {
    preHandler: requireSupportAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { include_internal = true } = request.query;

      // Get ticket details
      const ticketResult = await pool!.query(`
        SELECT 
          t.*,
          u.email as user_email,
          a.email as assigned_to_email,
          CASE 
            WHEN t.sla_due_at IS NOT NULL AND t.sla_due_at < NOW() THEN true
            ELSE false
          END as sla_breached,
          EXTRACT(EPOCH FROM t.sla_due_at - NOW()) / 3600 as hours_until_due
        FROM support_tickets t
        LEFT JOIN auth.users u ON u.id = t.user_id
        LEFT JOIN auth.users a ON a.id = t.assigned_to
        WHERE t.id = $1
      `, [id]);

      if (ticketResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Ticket not found'
        });
      }

      const ticket = ticketResult.rows[0];

      // Get messages (filter internal messages based on permission)
      const messageCondition = include_internal ? '1=1' : 'is_internal = false';
      const messagesResult = await pool!.query(`
        SELECT 
          m.*,
          u.email as sender_email,
          u.raw_user_meta_data->>'full_name' as sender_name
        FROM support_ticket_messages m
        LEFT JOIN auth.users u ON u.id = m.sender_id
        WHERE m.ticket_id = $1 AND ${messageCondition}
        ORDER BY m.created_at ASC
      `, [id]);

      return reply.send({
        success: true,
        ticket,
        messages: messagesResult.rows
      });

    } catch (error) {
      await loggingService.logCriticalError('support_ticket_details_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        ticket_id: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch ticket details'
      });
    }
  });

  /**
   * POST /v1/admin/support/tickets/:id/messages
   * Add message to ticket
   */
  fastify.post<{
    Params: { id: string };
    Body: CreateMessageRequest;
  }>('/v1/admin/support/tickets/:id/messages', {
    preHandler: requireSupportAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { body, is_internal = false, attachments = [] } = request.body;
      const adminClaims = (request as any).adminClaims;

      // Verify ticket exists
      const ticketResult = await pool!.query('SELECT id FROM support_tickets WHERE id = $1', [id]);
      if (ticketResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Ticket not found'
        });
      }

      // Add message
      const messageResult = await pool!.query(`
        INSERT INTO support_ticket_messages (
          ticket_id, sender_id, body, is_internal, attachments
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [id, adminClaims.userId, body, is_internal, JSON.stringify(attachments)]);

      // Update ticket timestamp
      await pool!.query(`
        UPDATE support_tickets 
        SET updated_at = NOW()
        WHERE id = $1
      `, [id]);

      return reply.code(201).send({
        success: true,
        message: messageResult.rows[0],
        created: 'Message added successfully'
      });

    } catch (error) {
      await loggingService.logCriticalError('support_ticket_message_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        ticket_id: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to add message to ticket'
      });
    }
  });

  /**
   * PUT /v1/admin/support/tickets/:id/status
   * Update ticket status
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      status: 'open' | 'in_progress' | 'waiting_user' | 'waiting_third_party' | 'resolved' | 'closed';
      reason?: string;
    }
  }>('/v1/admin/support/tickets/:id/status', {
    preHandler: requireSupportAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { status, reason } = request.body;
      const adminClaims = (request as any).adminClaims;

      const result = await pool!.query(`
        UPDATE support_tickets 
        SET 
          status = $1,
          resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
          closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE closed_at END,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [status, id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Ticket not found'
        });
      }

      // Add system message about status change
      await pool!.query(`
        INSERT INTO support_ticket_messages (
          ticket_id, sender_id, body, is_internal, message_type
        )
        VALUES ($1, $2, $3, $4, $5)
      `, [
        id,
        adminClaims.userId,
        `Ticket status changed to: ${status}${reason ? `. Reason: ${reason}` : ''}`,
        true,
        'status_change'
      ]);

      return reply.send({
        success: true,
        ticket: result.rows[0],
        message: 'Ticket status updated successfully'
      });

    } catch (error) {
      await loggingService.logCriticalError('support_ticket_status_update_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        ticket_id: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to update ticket status'
      });
    }
  });

  /**
   * PUT /v1/admin/support/tickets/:id/assign
   * Assign ticket to staff member
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      assigned_to: string;
      reason?: string;
    }
  }>('/v1/admin/support/tickets/:id/assign', {
    preHandler: requireSupportAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { assigned_to, reason } = request.body;
      const adminClaims = (request as any).adminClaims;

      // Verify assignee is admin/staff
      const userResult = await pool!.query(`
        SELECT id, email, raw_user_meta_data->>'role' as role
        FROM auth.users 
        WHERE id = $1 AND raw_user_meta_data->>'role' IN ('admin', 'support', 'staff')
      `, [assigned_to]);

      if (userResult.rows.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid assignee - user must be admin or staff member'
        });
      }

      const assignee = userResult.rows[0];

      const result = await pool!.query(`
        UPDATE support_tickets 
        SET 
          assigned_to = $1,
          status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [assigned_to, id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Ticket not found'
        });
      }

      // Add system message about assignment
      await pool!.query(`
        INSERT INTO support_ticket_messages (
          ticket_id, sender_id, body, is_internal, message_type
        )
        VALUES ($1, $2, $3, $4, $5)
      `, [
        id,
        adminClaims.userId,
        `Ticket assigned to ${assignee.email}${reason ? `. Reason: ${reason}` : ''}`,
        true,
        'assignment_change'
      ]);

      return reply.send({
        success: true,
        ticket: result.rows[0],
        assignee: assignee,
        message: 'Ticket assigned successfully'
      });

    } catch (error) {
      await loggingService.logCriticalError('support_ticket_assignment_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        ticket_id: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to assign ticket'
      });
    }
  });

  // =====================================================
  // Auto-Ticket Creation from System Events
  // =====================================================

  /**
   * POST /v1/internal/support/auto-ticket
   * Create tickets automatically from system events (internal only)
   */
  fastify.post('/v1/internal/support/auto-ticket', async (request: FastifyRequest<{
    Body: {
      source: 'system' | 'monitoring' | 'ci/cd' | 'security';
      event_type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      title: string;
      description: string;
      metadata?: any;
    }
  }>, reply: FastifyReply) => {
    try {
      const { source, event_type, severity, title, description, metadata = {} } = request.body;

      // Map severity to priority
      const priorityMap = {
        low: 'low',
        medium: 'medium', 
        high: 'high',
        critical: 'urgent'
      } as const;

      // Generate ticket number
      const ticketNumberResult = await pool!.query('SELECT generate_ticket_number() as ticket_number');
      const ticket_number = ticketNumberResult.rows[0].ticket_number;

      // Calculate SLA
      const priority = priorityMap[severity];
      const slaResult = await pool!.query('SELECT calculate_sla_due_time($1::ticket_priority) as sla_due_at', [priority]);
      const sla_due_at = slaResult.rows[0].sla_due_at;

      // Create auto-ticket
      const result = await pool!.query(`
        INSERT INTO support_tickets (
          ticket_number, channel, category, tags, priority,
          subject, description, sla_due_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        ticket_number,
        'system',
        'technical',
        [source, event_type],
        priority,
        title,
        description,
        sla_due_at,
        JSON.stringify({ ...metadata, auto_created: true, source, event_type })
      ]);

      return reply.code(201).send({
        success: true,
        ticket: result.rows[0],
        message: 'Auto-ticket created successfully'
      });

    } catch (error) {
      await loggingService.logCriticalError('auto_ticket_creation_error', error as Error, {
        source: (request as any).body?.source,
        event_type: (request as any).body?.event_type
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to create auto-ticket'
      });
    }
  });

  // =====================================================
  // SLA Monitoring
  // =====================================================

  /**
   * GET /v1/admin/support/sla-status
   * Get SLA status overview
   */
  fastify.get('/v1/admin/support/sla-status', {
    preHandler: requireSupportAccess()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await pool!.query(`
        SELECT 
          priority,
          COUNT(*) as total_tickets,
          COUNT(*) FILTER (WHERE sla_due_at < NOW() AND status IN ('open', 'in_progress')) as breached,
          COUNT(*) FILTER (WHERE sla_due_at < NOW() + INTERVAL '2 hours' AND status IN ('open', 'in_progress')) as due_soon,
          AVG(EXTRACT(EPOCH FROM sla_due_at - NOW()) / 3600) FILTER (WHERE status IN ('open', 'in_progress')) as avg_hours_remaining
        FROM support_tickets
        WHERE status IN ('open', 'in_progress', 'waiting_user', 'waiting_third_party')
        GROUP BY priority
        ORDER BY 
          CASE priority 
            WHEN 'urgent' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            WHEN 'low' THEN 4 
          END
      `);

      return reply.send({
        success: true,
        sla_status: result.rows,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError('sla_status_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch SLA status'
      });
    }
  });
}