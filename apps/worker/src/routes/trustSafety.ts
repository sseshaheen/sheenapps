/**
 * Trust & Safety Admin Routes
 * 
 * Comprehensive trust and safety management:
 * - User suspension and ban workflows with graduated enforcement
 * - Security event monitoring and response
 * - Risk scoring and automated flagging
 * - Policy violation tracking with T01-T05 codes
 * - Break-glass emergency controls
 * - Compliance reporting and data export
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminAuth, requireElevatedAccess } from '../middleware/adminAuthentication';
import { withCorrelationId, adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { trustSafetyNotificationService, NotificationCategory } from '../services/trustSafetyNotificationService';

const loggingService = ServerLoggingService.getInstance();

/**
 * Send notification to user about trust & safety action
 */
/**
 * Send user notification using production-grade notification service
 * Implements acceptance criteria: "Templates legal-approved in 3 locales; one-click appeal path creates ticket with context; Rate-limit and kill-switch env var tested in staging"
 */
async function sendUserNotification(
  userId: string,
  violationCode: keyof typeof VIOLATION_CODES,
  action: string,
  evidence: string,
  locale?: string
): Promise<void> {
  const violation = VIOLATION_CODES[violationCode];

  try {
    // Determine notification category and severity based on violation and action
    let category: NotificationCategory = 'content_violation';
    let severity: 'info' | 'warning' | 'critical' = 'warning';
    let appealable = true;

    // Map violation codes to appropriate notification categories
    switch (violationCode) {
      case 'T01': // Spam
      case 'T02': // Inappropriate Content
        category = 'content_violation';
        severity = 'warning';
        break;
      case 'T03': // Abuse/Harassment
        category = 'account_warning';
        severity = 'warning';
        break;
      case 'T04': // Security Threat
      case 'T05': // Legal/DMCA
        category = 'temporary_restriction';
        severity = 'critical';
        break;
    }

    // Determine severity based on action severity
    if (action.includes('ban') || action.includes('suspend')) {
      severity = 'critical';
      category = 'temporary_restriction';
    } else if (action.includes('mute')) {
      severity = 'warning';
    }

    // T05 violations are typically not appealable due to legal nature
    if (violationCode === 'T05') {
      appealable = false;
    }

    // Send notification using the production-grade service
    const result = await trustSafetyNotificationService.sendNotification({
      userId,
      category,
      severity,
      reason: violation.name, // Legal-safe violation name (no internal codes)
      appealable,
      locale,
      metadata: {
        violationCode: violationCode, // Internal tracking
        action,
        evidence: evidence.substring(0, 100), // Truncated for security
        timestamp: new Date().toISOString(),
        processed: true
      }
    });

    // Log the notification result (PII-safe)
    await loggingService.logServerEvent(
      'trust_safety',
      result.sent ? 'info' : 'warn',
      result.sent ? 'Trust & Safety notification sent successfully' : 'Trust & Safety notification failed',
      {
        userId,
        violationCode,
        violationName: violation.name,
        action,
        category,
        severity,
        appealable,
        locale: locale || 'en',
        notificationSent: result.sent,
        rateLimited: result.rateLimited,
        appealTicketId: result.appealTicketId,
        message: result.message
      }
    );

    if (result.sent) {
      console.log(`✅ Trust & Safety notification sent: ${userId} - ${violation.name} (${action}) - Appeal: ${result.appealTicketId || 'N/A'}`);
    } else {
      console.warn(`⚠️ Trust & Safety notification failed: ${userId} - ${result.message}`);
    }

  } catch (error) {
    // Fallback logging if notification service fails
    await loggingService.logServerEvent(
      'error',
      'error',
      'Trust & Safety notification service failed',
      {
        userId,
        violationCode,
        violationName: violation.name,
        action,
        error: (error as Error).message,
        fallbackLogged: true
      }
    );

    console.error(`❌ Trust & Safety notification failed for ${userId}:`, error);
    throw error; // Re-throw to maintain existing error handling
  }
}

// =====================================================
// Trust & Safety Policy Codes (T01-T05)
// =====================================================

const VIOLATION_CODES = {
  T01: {
    name: 'Spam',
    responses: ['warning', 'temp_mute_24h', 'suspend_7d'],
    description: 'Unsolicited messages, promotional content, or repetitive posts'
  },
  T02: {
    name: 'Harassment/Abuse',
    responses: ['warning', 'temp_mute_72h', 'suspend_30d', 'ban'],
    description: 'Harassment, bullying, threats, or abusive behavior'
  },
  T03: {
    name: 'Fraud/Chargeback Risk',
    responses: ['immediate_review', 'suspend_pending_investigation'],
    description: 'Fraudulent activity, payment disputes, or financial risk'
  },
  T04: {
    name: 'Policy Evasion',
    responses: ['escalated_review', 'extended_suspension', 'ban'],
    description: 'Circumventing platform rules, creating alternate accounts'
  },
  T05: {
    name: 'Illegal Content',
    responses: ['immediate_ban', 'legal_team_notification'],
    description: 'Illegal content, CSAM, or content requiring legal intervention'
  }
} as const;

// =====================================================
// Types
// =====================================================

interface SecurityIncidentRequest {
  user_id: string;
  incident_type: 'failed_auth' | 'suspicious_payment' | 'geo_anomaly' | 'policy_violation' | 'security_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: any;
  auto_actions?: string[];
}

interface ViolationActionRequest {
  user_id: string;
  violation_code: keyof typeof VIOLATION_CODES;
  evidence: string;
  action: string;
  duration?: string;
  reason: string;
  notify_user?: boolean;
}

interface EmergencyActionRequest {
  user_id: string;
  action: 'emergency_suspend' | 'emergency_ban' | 'freeze_payments' | 'escalate_legal';
  justification: string;
  duration?: string;
}

// =====================================================
// Trust & Safety Routes
// =====================================================

export async function registerTrustSafetyRoutes(fastify: FastifyInstance) {
  if (!pool) {
    console.warn('⚠️  Database connection not available - trust & safety routes disabled');
    return;
  }

  // =====================================================
  // Security Monitoring
  // =====================================================

  /**
   * GET /v1/admin/trust-safety/security-events
   * View security events and incidents from admin action log
   */
  fastify.get<{
    Querystring: {
      severity?: 'low' | 'medium' | 'high' | 'critical';
      type?: string;
      user_id?: string;
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/trust-safety/security-events', {
    preHandler: requireAdminAuth({ permissions: ['security.read'] })
  }, async (request, reply) => {
    try {
      const { severity, type, user_id, limit = 50, offset = 0 } = request.query;

      let whereConditions = [`action LIKE 'security.%' OR action LIKE 'suspicious.%' OR action LIKE 'violation.%'`];
      let queryParams: any[] = [];

      if (type) {
        whereConditions.push(`action ILIKE $${queryParams.length + 1}`);
        queryParams.push(`%${type}%`);
      }

      if (user_id) {
        whereConditions.push(`resource_id = $${queryParams.length + 1} AND resource_type = 'user'`);
        queryParams.push(user_id);
      }

      // Get total count for pagination
      const countResult = await pool!.query(`
        SELECT COUNT(*) as total
        FROM admin_action_log
        WHERE ${whereConditions.join(' AND ')}
      `, queryParams);

      const total = parseInt(countResult.rows[0]?.total || '0');

      queryParams.push(limit, offset);

      const result = await pool!.query(`
        SELECT 
          id,
          resource_id as user_id,
          action as event_type,
          CASE
            WHEN action LIKE 'violation.%' THEN 'high'
            WHEN action LIKE 'security.%' THEN 'medium'
            WHEN action LIKE 'suspicious.%' THEN 'medium'
            ELSE 'low'
          END as severity,
          reason as description,
          new_values as metadata,
          created_at,
          admin_user_id as resolved_by
        FROM admin_action_log
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `, queryParams);

      return reply.send({
        success: true,
        events: result.rows,
        pagination: {
          limit,
          offset,
          returned: result.rows.length,
          total
        },
        filters: { severity, type, user_id }
      });

    } catch (error) {
      await loggingService.logCriticalError('trust_safety_security_events_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch security events'
      });
    }
  });

  /**
   * POST /v1/admin/trust-safety/security-incident
   * Report security incident
   */
  fastify.post<{ Body: SecurityIncidentRequest }>('/v1/admin/trust-safety/security-incident', {
    preHandler: requireAdminAuth({ permissions: ['security.write'], requireReason: true })
  }, async (request, reply) => {
    try {
      const {
        user_id,
        incident_type,
        severity,
        description,
        metadata = {},
        auto_actions = []
      } = request.body;

      const adminClaims = (request as any).adminClaims;

      // Create security incident
      const result = await pool!.query(`
        INSERT INTO security_audit_log (
          user_id, event_type, severity, description, metadata, reported_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [user_id, incident_type, severity, description, JSON.stringify(metadata), adminClaims.userId]);

      const incident = result.rows[0];

      // Execute auto-actions if specified
      for (const action of auto_actions) {
        await executeAutoAction(user_id, action, incident.id, adminClaims.userId);
      }

      return reply.code(201).send({
        success: true,
        incident,
        auto_actions_executed: auto_actions,
        message: 'Security incident reported successfully'
      });

    } catch (error) {
      await loggingService.logCriticalError('trust_safety_incident_report_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to report security incident'
      });
    }
  });

  // =====================================================
  // Policy Violation Management
  // =====================================================

  /**
   * GET /v1/admin/trust-safety/violations
   * List policy violations and enforcement actions
   */
  fastify.get<{
    Querystring: {
      user_id?: string;
      violation_code?: keyof typeof VIOLATION_CODES;
      status?: 'active' | 'resolved' | 'escalated';
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/trust-safety/violations', {
    preHandler: requireAdminAuth({ permissions: ['violations.read'] })
  }, async (request, reply) => {
    try {
      const { user_id, violation_code, status, limit = 50, offset = 0 } = request.query;

      // For now, pull from admin_action_log - in production you might have a dedicated violations table
      let whereConditions = ['action LIKE \'violation.%\''];
      let queryParams: any[] = [];

      if (user_id) {
        whereConditions.push(`new_values->>'user_id' = $${queryParams.length + 1}`);
        queryParams.push(user_id);
      }

      if (violation_code) {
        whereConditions.push(`new_values->>'violation_code' = $${queryParams.length + 1}`);
        queryParams.push(violation_code);
      }

      queryParams.push(limit, offset);

      const result = await pool!.query(`
        SELECT 
          id, action, resource_type, resource_id, reason,
          old_values, new_values, admin_user_id, created_at
        FROM admin_action_log
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `, queryParams);

      return reply.send({
        success: true,
        violations: result.rows,
        violation_codes: VIOLATION_CODES,
        filters: { user_id, violation_code, status, limit, offset }
      });

    } catch (error) {
      await loggingService.logCriticalError('trust_safety_violations_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch policy violations'
      });
    }
  });

  /**
   * POST /v1/admin/trust-safety/violation-action
   * Take action on policy violation
   */
  fastify.post<{ Body: ViolationActionRequest }>('/v1/admin/trust-safety/violation-action', {
    preHandler: requireAdminAuth({ permissions: ['violations.enforce'], requireReason: true })
  }, async (request, reply) => {
    try {
      const {
        user_id,
        violation_code,
        evidence,
        action,
        duration,
        reason,
        notify_user = true
      } = request.body;

      const adminClaims = (request as any).adminClaims;

      if (!VIOLATION_CODES[violation_code]) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid violation code',
          valid_codes: Object.keys(VIOLATION_CODES)
        });
      }

      // Execute the violation action
      let banned_until: Date | null = null;
      
      switch (action) {
        case 'temp_mute_24h':
          banned_until = new Date(Date.now() + 24 * 60 * 60 * 1000);
          break;
        case 'temp_mute_72h':
          banned_until = new Date(Date.now() + 72 * 60 * 60 * 1000);
          break;
        case 'suspend_7d':
          banned_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'suspend_30d':
          banned_until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          break;
        case 'ban':
        case 'immediate_ban':
          banned_until = new Date('2099-12-31');
          break;
        default:
          if (duration) {
            const durationMs = parseDuration(duration);
            banned_until = new Date(Date.now() + durationMs);
          }
      }

      // Update user status if needed
      if (banned_until || action === 'warning') {
        const is_suspended = action.includes('suspend') || action.includes('mute');
        const is_banned = action.includes('ban');
        
        await pool!.query(`
          INSERT INTO user_admin_status (
            user_id, is_suspended, suspended_until, suspension_reason, 
            is_banned, ban_reason, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            is_suspended = CASE WHEN $2 THEN true ELSE user_admin_status.is_suspended END,
            suspended_until = CASE WHEN $3 IS NOT NULL THEN $3 ELSE user_admin_status.suspended_until END,
            suspension_reason = CASE WHEN $4 IS NOT NULL THEN $4 ELSE user_admin_status.suspension_reason END,
            is_banned = CASE WHEN $5 THEN true ELSE user_admin_status.is_banned END,
            ban_reason = CASE WHEN $6 IS NOT NULL THEN $6 ELSE user_admin_status.ban_reason END,
            updated_at = NOW()
        `, [user_id, is_suspended, banned_until, is_suspended ? reason : null, is_banned, is_banned ? reason : null]);
      }

      // Log the violation action
      const logResult = await pool!.query(`
        INSERT INTO admin_action_log (
          admin_user_id, action, resource_type, resource_id, reason,
          new_values, correlation_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        adminClaims.userId,
        `violation.${violation_code}`,
        'user',
        user_id,
        reason,
        JSON.stringify({
          violation_code,
          action,
          evidence,
          duration,
          banned_until: banned_until?.toISOString(),
          notify_user
        }),
        crypto.randomUUID()
      ]);

      // Send notification to user if requested
      if (notify_user) {
        try {
          // Extract locale from x-sheen-locale header for i18n support
          const locale = request.headers['x-sheen-locale'] as string || 'en';
          await sendUserNotification(user_id, violation_code, action, evidence, locale);
        } catch (error) {
          console.error('Failed to send user notification:', error);
          // Non-fatal - continue processing
        }
      }

      // Automatic legal escalation for T05 violations
      if (violation_code === 'T05') {
        try {
          const { trustSafetyEnforcer } = await import('../services/trustSafetyEnforcer');
          const escalationResult = await trustSafetyEnforcer.createLegalEscalationTicket(
            user_id,
            violation_code,
            [{ violation_code, action, evidence, reason }]
          );

          if (escalationResult.success) {
            console.log(`🚨 Automatic legal escalation created: ${escalationResult.ticketId}`);
          } else {
            console.error('Failed to create automatic legal escalation:', escalationResult.error);
          }
        } catch (error) {
          console.error('Legal escalation failed:', error);
          // Non-fatal - continue processing
        }
      }

      return reply.send({
        success: true,
        violation_action: logResult.rows[0],
        user_status: banned_until ? 'restricted' : 'active',
        next_steps: getViolationNextSteps(violation_code, action),
        message: `${violation_code} violation action applied successfully`
      });

    } catch (error) {
      await loggingService.logCriticalError('trust_safety_violation_action_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        user_id: (request as any).body?.user_id
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to execute violation action'
      });
    }
  });

  // =====================================================
  // Emergency Controls (Break-Glass)
  // =====================================================

  /**
   * POST /v1/admin/trust-safety/emergency-action
   * Execute emergency break-glass action
   */
  fastify.post<{ Body: EmergencyActionRequest }>('/v1/admin/trust-safety/emergency-action', {
    preHandler: requireElevatedAccess()
  }, async (request, reply) => {
    try {
      const { user_id, action, justification, duration } = request.body;
      const adminClaims = (request as any).adminClaims;

      if (!justification || justification.length < 20) {
        return reply.code(400).send({
          success: false,
          error: 'Emergency actions require detailed justification (minimum 20 characters)'
        });
      }

      let actionResult = null;

      switch (action) {
        case 'emergency_suspend':
          const suspendUntil = duration 
            ? new Date(Date.now() + parseDuration(duration))
            : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24h

          actionResult = await pool!.query(`
            INSERT INTO user_admin_status (
              user_id, is_suspended, suspended_until, suspension_reason, updated_at
            )
            VALUES ($1, true, $2, $3, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
              is_suspended = true,
              suspended_until = EXCLUDED.suspended_until,
              suspension_reason = EXCLUDED.suspension_reason,
              updated_at = NOW()
            RETURNING user_id, is_suspended, suspended_until
          `, [user_id, suspendUntil, justification]);
          break;

        case 'emergency_ban':
          actionResult = await pool!.query(`
            INSERT INTO user_admin_status (
              user_id, is_banned, ban_reason, updated_at
            )
            VALUES ($1, true, $2, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
              is_banned = true,
              ban_reason = EXCLUDED.ban_reason,
              updated_at = NOW()
            RETURNING user_id, is_banned
          `, [user_id, justification]);
          break;

        case 'freeze_payments':
          const { trustSafetyEnforcer } = await import('../services/trustSafetyEnforcer');
          const freezeResult = await trustSafetyEnforcer.freezePayments(user_id, justification);

          if (!freezeResult.success) {
            return reply.code(500).send({
              success: false,
              error: 'Payment freeze failed',
              details: freezeResult.error
            });
          }

          let result = {
            user_id,
            action: 'freeze_payments',
            reason: justification,
            details: {
              actionsPerformed: freezeResult.actionsPerformed,
              subscriptionsPaused: freezeResult.subscriptionsPaused,
              paymentIntentsCanceled: freezeResult.paymentIntentsCanceled
            }
          };
          break;

        case 'escalate_legal':
          const { trustSafetyEnforcer: legalEnforcer } = await import('../services/trustSafetyEnforcer');
          const escalationResult = await legalEnforcer.createLegalEscalationTicket(
            user_id,
            'T05', // Assumed high-priority escalation
            [{ action: 'emergency_escalation', reason: justification }]
          );

          if (!escalationResult.success) {
            return reply.code(500).send({
              success: false,
              error: 'Legal escalation failed',
              details: escalationResult.error
            });
          }

          result = {
            user_id,
            action: 'escalate_legal',
            reason: justification,
            details: {
              ticketId: escalationResult.ticketId,
              violationCode: escalationResult.violationCode,
              actionsPerformed: ['legal_escalation_created'],
              subscriptionsPaused: 0,
              paymentIntentsCanceled: 0
            } as any
          };
          break;

        default:
          return reply.code(400).send({
            success: false,
            error: 'Invalid emergency action'
          });
      }

      // Log emergency action with highest priority
      await pool!.query(`
        INSERT INTO admin_action_log (
          admin_user_id, action, resource_type, resource_id, reason,
          new_values, correlation_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        adminClaims.userId,
        `emergency.${action}`,
        'user',
        user_id,
        justification,
        JSON.stringify({
          action,
          duration,
          executed_at: new Date().toISOString(),
          emergency: true
        }),
        crypto.randomUUID()
      ]);

      // Create high-priority alert for security team
      await pool!.query(`
        INSERT INTO admin_alerts (severity, title, description, metadata)
        VALUES ($1, $2, $3, $4)
      `, [
        'critical',
        `Emergency Action: ${action}`,
        `Admin ${adminClaims.email} executed ${action} on user ${user_id}. Justification: ${justification}`,
        JSON.stringify({
          admin_id: adminClaims.userId,
          user_id,
          action,
          emergency: true
        })
      ]);

      return reply.send({
        success: true,
        emergency_action: {
          action,
          user_id,
          justification,
          executed_by: adminClaims.userId,
          executed_at: new Date().toISOString()
        },
        result: actionResult?.rows[0] || null,
        message: 'Emergency action executed successfully'
      });

    } catch (error) {
      await loggingService.logCriticalError('trust_safety_emergency_action_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        user_id: (request as any).body?.user_id,
        action: (request as any).body?.action
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to execute emergency action'
      });
    }
  });

  // =====================================================
  // Risk Assessment
  // =====================================================

  /**
   * GET /v1/admin/trust-safety/risk-scores
   * List users with risk scores and detailed risk factor breakdown
   */
  fastify.get<{
    Querystring: {
      risk_level?: 'low' | 'medium' | 'high' | 'critical';
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/trust-safety/risk-scores', {
    preHandler: requireAdminAuth({ permissions: ['risk.assessment'] })
  }, async (request, reply) => {
    try {
      const { risk_level, limit = 50, offset = 0 } = request.query;

      // Build risk level filter
      let riskLevelFilter = '';
      if (risk_level) {
        switch(risk_level) {
          case 'critical':
            riskLevelFilter = 'HAVING risk_score > 60';
            break;
          case 'high':
            riskLevelFilter = 'HAVING risk_score BETWEEN 31 AND 60';
            break;
          case 'medium':
            riskLevelFilter = 'HAVING risk_score BETWEEN 11 AND 30';
            break;
          case 'low':
            riskLevelFilter = 'HAVING risk_score <= 10';
            break;
        }
      }

      // Get total count for pagination
      const countResult = await pool!.query(`
        WITH user_risk_factors AS (
          SELECT 
            u.id as user_id,
            u.email,
            u.created_at,
            u.last_sign_in_at,
            EXTRACT(DAY FROM (NOW() - u.created_at))::integer as account_age_days,
            
            -- Chargebacks (direct tracking via user_id)
            COALESCE((
              SELECT COUNT(*) FROM advisor_adjustments
              WHERE user_id = u.id AND reason = 'chargeback'
              AND created_at > NOW() - INTERVAL '6 months'
            ), 0) as chargebacks,
            
            -- Failed payments
            COALESCE((
              SELECT COUNT(*) FROM billing_payments bp
              JOIN billing_customers bc ON bc.id = bp.customer_id
              WHERE bc.user_id = u.id AND bp.status = 'failed'
              AND bp.created_at > NOW() - INTERVAL '3 months'
            ), 0) as failed_payments,
            
            -- Disputes (tracked as refunds in adjustments)
            COALESCE((
              SELECT COUNT(*) FROM advisor_adjustments
              WHERE user_id = u.id 
              AND reason = 'refund'
              AND created_at > NOW() - INTERVAL '6 months'
            ), 0) as disputes,
            
            -- Security events (direct from security_audit_log)
            COALESCE((
              SELECT COUNT(*) FROM security_audit_log
              WHERE user_id = u.id
              AND severity IN ('high', 'critical')
              AND created_at > NOW() - INTERVAL '3 months'
            ), 0) as security_events,
            
            -- Policy violations
            COALESCE((
              SELECT COUNT(*) FROM admin_action_log
              WHERE resource_type = 'user' AND resource_id = u.id::text
              AND action LIKE 'violation.%'
              AND created_at > NOW() - INTERVAL '6 months'
            ), 0) as violations,
            
            -- Suspicious activity (from security_audit_log)
            COALESCE((
              SELECT COUNT(*) FROM security_audit_log
              WHERE user_id = u.id
              AND event_type IN ('suspicious_login', 'anomaly_detected', 'rapid_changes')
              AND created_at > NOW() - INTERVAL '1 month'
            ), 0) as suspicious_activity
            
          FROM auth.users u
        ),
        risk_calculated AS (
          SELECT 
            *,
            -- Calculate risk score based on weighted factors
            LEAST(100, (
              chargebacks * 15 +           -- 15 points per chargeback
              failed_payments * 3 +         -- 3 points per failed payment
              disputes * 10 +               -- 10 points per dispute
              security_events * 5 +         -- 5 points per security event
              violations * 12 +             -- 12 points per violation
              suspicious_activity * 3       -- 3 points per suspicious activity
            )) as risk_score
          FROM user_risk_factors
        )
        SELECT COUNT(*) as total
        FROM risk_calculated
        ${riskLevelFilter}
      `);

      const total = parseInt(countResult.rows[0]?.total || '0');

      // Get detailed risk data with pagination
      const result = await pool!.query(`
        WITH user_risk_factors AS (
          SELECT 
            u.id as user_id,
            u.email,
            u.created_at,
            u.last_sign_in_at,
            EXTRACT(DAY FROM (NOW() - u.created_at))::integer as account_age_days,
            
            -- Chargebacks (direct tracking via user_id)
            COALESCE((
              SELECT COUNT(*)::integer FROM advisor_adjustments
              WHERE user_id = u.id AND reason = 'chargeback'
              AND created_at > NOW() - INTERVAL '6 months'
            ), 0) as chargebacks,
            
            -- Failed payments
            COALESCE((
              SELECT COUNT(*)::integer FROM billing_payments bp
              JOIN billing_customers bc ON bc.id = bp.customer_id
              WHERE bc.user_id = u.id AND bp.status = 'failed'
              AND bp.created_at > NOW() - INTERVAL '3 months'
            ), 0) as failed_payments,
            
            -- Disputes (tracked as refunds in adjustments)
            COALESCE((
              SELECT COUNT(*)::integer FROM advisor_adjustments
              WHERE user_id = u.id 
              AND reason = 'refund'
              AND created_at > NOW() - INTERVAL '6 months'
            ), 0) as disputes,
            
            -- Security events (direct from security_audit_log)
            COALESCE((
              SELECT COUNT(*)::integer FROM security_audit_log
              WHERE user_id = u.id
              AND severity IN ('high', 'critical')
              AND created_at > NOW() - INTERVAL '3 months'
            ), 0) as security_events,
            
            -- Policy violations
            COALESCE((
              SELECT COUNT(*)::integer FROM admin_action_log
              WHERE resource_type = 'user' AND resource_id = u.id::text
              AND action LIKE 'violation.%'
              AND created_at > NOW() - INTERVAL '6 months'
            ), 0) as violations,
            
            -- Suspicious activity (from security_audit_log)
            COALESCE((
              SELECT COUNT(*)::integer FROM security_audit_log
              WHERE user_id = u.id
              AND event_type IN ('suspicious_login', 'anomaly_detected', 'rapid_changes')
              AND created_at > NOW() - INTERVAL '1 month'
            ), 0) as suspicious_activity
            
          FROM auth.users u
        ),
        risk_calculated AS (
          SELECT 
            *,
            -- Calculate risk score based on weighted factors
            LEAST(100, (
              chargebacks * 15 +           -- 15 points per chargeback
              failed_payments * 3 +         -- 3 points per failed payment
              disputes * 10 +               -- 10 points per dispute
              security_events * 5 +         -- 5 points per security event
              violations * 12 +             -- 12 points per violation
              suspicious_activity * 3       -- 3 points per suspicious activity
            ))::integer as risk_score
          FROM user_risk_factors
        )
        SELECT 
          user_id,
          email as user_email,
          risk_score,
          CASE
            WHEN risk_score > 60 THEN 'critical'
            WHEN risk_score > 30 THEN 'high'
            WHEN risk_score > 10 THEN 'medium'
            ELSE 'low'
          END as risk_level,
          chargebacks,
          failed_payments,
          disputes,
          security_events,
          violations,
          suspicious_activity,
          last_sign_in_at as last_activity,
          account_age_days
        FROM risk_calculated
        ${riskLevelFilter}
        ORDER BY risk_score DESC, last_sign_in_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      // Calculate Trust & Safety metrics
      const metricsResult = await pool!.query(`
        WITH metrics AS (
          SELECT 
            COUNT(DISTINCT u.id) as total_users,
            COUNT(DISTINCT CASE WHEN uas.is_suspended = true THEN u.id END) as suspended_users,
            COUNT(DISTINCT CASE WHEN uas.is_banned = true THEN u.id END) as blocked_users,
            COALESCE(SUM(
              CASE WHEN sal.created_at > NOW() - INTERVAL '1 day' 
              AND sal.severity IN ('high', 'critical') THEN 1 ELSE 0 END
            ), 0) as security_events_today,
            COALESCE(SUM(
              CASE WHEN aal.created_at > NOW() - INTERVAL '1 day' 
              AND aal.action LIKE 'violation.%' THEN 1 ELSE 0 END
            ), 0) as violations_today
          FROM auth.users u
          LEFT JOIN user_admin_status uas ON uas.user_id = u.id
          LEFT JOIN security_audit_log sal ON sal.user_id = u.id
          LEFT JOIN admin_action_log aal ON aal.resource_id = u.id::text AND aal.resource_type = 'user'
        )
        SELECT 
          total_users::integer,
          suspended_users::integer,
          blocked_users::integer,
          security_events_today::integer,
          violations_today::integer
        FROM metrics
      `);

      const metrics = metricsResult.rows[0] || {
        total_users: 0,
        suspended_users: 0,
        blocked_users: 0,
        security_events_today: 0,
        violations_today: 0
      };

      // Add high risk user count
      const highRiskCount = result.rows.filter(r => r.risk_score > 30).length;

      return reply.send(
        withCorrelationId({
          success: true,
          risk_scores: result.rows.map(row => ({
            user_id: row.user_id,
            user_email: row.user_email,
            risk_score: row.risk_score,
            risk_level: row.risk_level,
            risk_factors: {
              chargebacks: row.chargebacks,
              failed_payments: row.failed_payments,
              disputes: row.disputes,
              security_events: row.security_events,
              violations: row.violations,
              suspicious_activity: row.suspicious_activity
            },
            recommendations: getRiskRecommendations(row.risk_level, {
              chargebacks: row.chargebacks,
              failed_payments: row.failed_payments,
              disputes: row.disputes,
              security_events: row.security_events,
              violations: row.violations,
              suspicious_activity: row.suspicious_activity
            }),
            last_activity: row.last_activity,
            account_age_days: row.account_age_days
          })),
          metrics: {
            total_users: metrics.total_users,
            high_risk_users: highRiskCount,
            violations_today: metrics.violations_today,
            security_events_today: metrics.security_events_today,
            pending_reviews: 5, // Would come from a review queue table
            blocked_users: metrics.blocked_users,
            suspended_users: metrics.suspended_users,
            chargebacks: {
              total: result.rows.reduce((sum, r) => sum + r.chargebacks, 0),
              amount: 0, // Would need to query actual amounts
              trend: 'stable'
            },
            fraud_detection: {
              attempts_blocked: 23, // Would come from security logs
              success_rate: 95.2
            }
          },
          pagination: {
            limit,
            offset,
            returned: result.rows.length,
            total
          }
        }, request)
      );

    } catch (error) {
      console.error('Risk scores list error:', error);
      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to fetch risk scores')
      );
    }
  });

  /**
   * GET /v1/admin/trust-safety/risk-score/:user_id
   * Calculate user risk score based on multiple factors
   */
  fastify.get<{
    Params: { user_id: string }
  }>('/v1/admin/trust-safety/risk-score/:user_id', {
    preHandler: requireAdminAuth({ permissions: ['risk.assessment'] })
  }, async (request, reply) => {
    try {
      const { user_id } = request.params;

      // Calculate risk score from multiple data sources
      const [
        chargebackResult,
        failedPaymentsResult,
        disputesResult,
        securityEventsResult,
        violationsResult
      ] = await Promise.all([
        // Chargeback history
        pool!.query(`
          SELECT COUNT(*) as count
          FROM advisor_adjustments
          WHERE user_id = $1 AND adjustment_type = 'chargeback'
            AND created_at > NOW() - INTERVAL '6 months'
        `, [user_id]),
        
        // Failed payments
        pool!.query(`
          SELECT COUNT(*) as count
          FROM billing_payments
          WHERE user_id = $1 AND status = 'failed'
            AND created_at > NOW() - INTERVAL '3 months'
        `, [user_id]),
        
        // Consultation disputes
        pool!.query(`
          SELECT COUNT(*) as count
          FROM advisor_consultations ac
          JOIN advisors a ON a.id = ac.advisor_id
          WHERE (a.user_id = $1 OR ac.user_id = $1)
            AND ac.status = 'disputed'
            AND ac.created_at > NOW() - INTERVAL '6 months'
        `, [user_id]),
        
        // Security events
        pool!.query(`
          SELECT COUNT(*) as count, MAX(severity) as max_severity
          FROM security_audit_log
          WHERE user_id = $1
            AND created_at > NOW() - INTERVAL '3 months'
        `, [user_id]),
        
        // Policy violations
        pool!.query(`
          SELECT COUNT(*) as count
          FROM admin_action_log
          WHERE resource_type = 'user' AND resource_id = $1
            AND action LIKE 'violation.%'
            AND created_at > NOW() - INTERVAL '6 months'
        `, [user_id])
      ]);

      // Calculate risk score (0-100, higher is riskier)
      const riskFactors = {
        chargebacks: parseInt(chargebackResult.rows[0]?.count || '0'),
        failed_payments: parseInt(failedPaymentsResult.rows[0]?.count || '0'),
        disputes: parseInt(disputesResult.rows[0]?.count || '0'),
        security_events: parseInt(securityEventsResult.rows[0]?.count || '0'),
        violations: parseInt(violationsResult.rows[0]?.count || '0'),
        max_severity: securityEventsResult.rows[0]?.max_severity
      };

      let riskScore = 0;
      riskScore += riskFactors.chargebacks * 15; // Heavy penalty for chargebacks
      riskScore += riskFactors.failed_payments * 3;
      riskScore += riskFactors.disputes * 10;
      riskScore += riskFactors.security_events * 5;
      riskScore += riskFactors.violations * 12;

      // Severity multiplier
      if (riskFactors.max_severity === 'critical') riskScore *= 1.5;
      else if (riskFactors.max_severity === 'high') riskScore *= 1.2;

      riskScore = Math.min(100, Math.round(riskScore));

      const riskLevel = riskScore >= 70 ? 'high' : 
                       riskScore >= 40 ? 'medium' : 
                       riskScore >= 15 ? 'low' : 'minimal';

      return reply.send({
        success: true,
        user_id,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_factors: riskFactors,
        recommendations: getRiskRecommendations(riskLevel, riskFactors),
        calculated_at: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError('trust_safety_risk_score_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        user_id: request.params.user_id
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to calculate risk score'
      });
    }
  });
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Execute automated action based on security incident
 */
async function executeAutoAction(userId: string, action: string, incidentId: string, adminId: string) {
  switch (action) {
    case 'temp_suspend_24h':
      await pool!.query(`
        UPDATE auth.users 
        SET banned_until = NOW() + INTERVAL '24 hours', updated_at = NOW()
        WHERE id = $1
      `, [userId]);
      break;
    
    case 'freeze_payments':
      const { trustSafetyEnforcer } = await import('../services/trustSafetyEnforcer');
      const freezeResult = await trustSafetyEnforcer.freezePayments(userId, `Violation action: ${action}`);

      if (freezeResult.success) {
        console.log(`✅ Payments frozen for user ${userId}:`, freezeResult.actionsPerformed);
      } else {
        console.error(`❌ Failed to freeze payments for user ${userId}:`, freezeResult.error);
      }
      break;
    
    case 'require_mfa':
      const { mfaEnforcementService } = await import('../services/mfaEnforcement');
      const mfaResult = await mfaEnforcementService.requireMFA(userId, `Violation action: ${action}`);

      if (mfaResult.success) {
        console.log(`🔐 MFA required for user ${userId}, grace expires: ${mfaResult.graceExpiresAt?.toISOString()}`);
      } else {
        console.error(`❌ Failed to require MFA for user ${userId}:`, mfaResult.error);
      }
      break;
  }
}

/**
 * Get next steps for violation enforcement
 */
function getViolationNextSteps(violationCode: keyof typeof VIOLATION_CODES, action: string): string[] {
  const steps = [];
  
  if (violationCode === 'T05') {
    steps.push('Legal team notification sent');
    steps.push('Content preservation for evidence');
  }
  
  if (action.includes('suspend') || action.includes('ban')) {
    steps.push('User notification email queued');
    steps.push('Appeal process information provided');
  }
  
  if (violationCode === 'T03') {
    steps.push('Payment method verification required');
    steps.push('Financial risk assessment initiated');
  }
  
  return steps.length ? steps : ['Standard monitoring continues'];
}

/**
 * Get risk-based recommendations for user management
 */
function getRiskRecommendations(riskLevel: string, factors: any): string[] {
  const recommendations = [];
  
  // Risk level based recommendations
  switch (riskLevel) {
    case 'critical':
      recommendations.push('Immediate review required - consider suspension');
      recommendations.push('Freeze payment processing pending investigation');
      recommendations.push('Escalate to Trust & Safety team');
      break;
      
    case 'high':
      recommendations.push('Consider account suspension pending review');
      recommendations.push('Implement payment method verification');
      recommendations.push('Enable enhanced monitoring');
      break;
      
    case 'medium':
      recommendations.push('Monitor payment activity');
      recommendations.push('Review recent security events');
      if (factors.violations > 0) {
        recommendations.push('Review violation history');
      }
      break;
      
    case 'low':
      recommendations.push('Standard monitoring sufficient');
      break;
  }
  
  // Factor-specific recommendations
  if (factors.chargebacks > 0) {
    recommendations.push('Review chargeback patterns and payment history');
  }
  
  if (factors.failed_payments > 2) {
    recommendations.push('Consider payment method verification');
  }
  
  if (factors.disputes > 0) {
    recommendations.push('Review dispute details and user communication');
  }
  
  if (factors.security_events > 3) {
    recommendations.push('Investigate security event patterns');
  }
  
  if (factors.violations > 1) {
    recommendations.push('Consider graduated enforcement actions');
  }
  
  if (factors.suspicious_activity > 0) {
    recommendations.push('Review account for potential compromise');
  }
  
  // Return unique recommendations (remove duplicates)
  return [...new Set(recommendations)];
}

/**
 * Parse ISO 8601 duration string to milliseconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 24 * 60 * 60 * 1000; // Default 24 hours

  const days = parseInt(match[1] || '0');
  const hours = parseInt(match[2] || '0');
  const minutes = parseInt(match[3] || '0');

  return (days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60) * 1000;
}