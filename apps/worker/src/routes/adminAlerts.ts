/**
 * Admin Alerts Management Routes
 *
 * API endpoints for alert rule management and alert lifecycle:
 * - CRUD for alert rules
 * - Active alerts and history
 * - Acknowledge and resolve alerts
 * - Create incident from alert
 */

import { FastifyInstance } from 'fastify';
import { requireAdminAuth, requireReadOnlyAccess, AdminRequest } from '../middleware/adminAuthentication';
import { withCorrelationId } from '../middleware/correlationIdMiddleware';
import {
  getAlertService,
  AlertCondition,
  AlertSeverity,
  AlertChannel,
  AlertStatus,
} from '../services/admin/AlertService';
import {
  getAlertEvaluatorStatus,
  forceEvaluation,
  resetAlertEvaluatorErrors,
} from '../workers/alertEvaluatorWorker';
import { getIncidentManagementService } from '../services/admin/IncidentManagementService';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

export default async function adminAlertRoutes(fastify: FastifyInstance) {
  const alertService = getAlertService();
  const incidentService = getIncidentManagementService();

  // ============================================================================
  // ALERT RULES
  // ============================================================================

  /**
   * POST /v1/admin/alerts/rules
   * Create a new alert rule
   */
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      metric_name: string;
      dimensions?: Record<string, string>;
      condition: AlertCondition;
      threshold: number;
      duration_minutes?: number;
      severity: AlertSeverity;
      channels: AlertChannel[];
    };
  }>('/v1/admin/alerts/rules', {
    preHandler: requireAdminAuth({ permissions: ['alerts.write'] })
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;

      const rule = await alertService.createAlertRule({
        ...request.body,
        created_by: adminRequest.adminClaims.sub,
      });

      return reply.code(201).send(
        withCorrelationId({
          success: true,
          data: rule,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_create_alert_rule_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create alert rule' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/alerts/rules
   * List all alert rules
   */
  fastify.get<{
    Querystring: { enabled_only?: string };
  }>('/v1/admin/alerts/rules', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const enabledOnly = request.query.enabled_only === 'true';
      const rules = await alertService.listAlertRules(enabledOnly);

      return reply.send(
        withCorrelationId({
          success: true,
          data: rules,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_list_alert_rules_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list alert rules' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/alerts/rules/:id
   * Get alert rule by ID
   */
  fastify.get<{
    Params: { id: string };
  }>('/v1/admin/alerts/rules/:id', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const rule = await alertService.getAlertRule(id);

      if (!rule) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Alert rule not found' },
          correlation_id: request.correlationId
        });
      }

      return reply.send(
        withCorrelationId({
          success: true,
          data: rule,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_get_alert_rule_error', error as Error, {
        correlation_id: request.correlationId,
        ruleId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get alert rule' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * PATCH /v1/admin/alerts/rules/:id
   * Update alert rule
   */
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      dimensions?: Record<string, string>;
      condition?: AlertCondition;
      threshold?: number;
      duration_minutes?: number;
      severity?: AlertSeverity;
      channels?: AlertChannel[];
      enabled?: boolean;
    };
  }>('/v1/admin/alerts/rules/:id', {
    preHandler: requireAdminAuth({ permissions: ['alerts.write'] })
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const rule = await alertService.updateAlertRule(id, request.body);

      return reply.send(
        withCorrelationId({
          success: true,
          data: rule,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_update_alert_rule_error', error as Error, {
        correlation_id: request.correlationId,
        ruleId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update alert rule' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * DELETE /v1/admin/alerts/rules/:id
   * Delete alert rule
   */
  fastify.delete<{
    Params: { id: string };
  }>('/v1/admin/alerts/rules/:id', {
    preHandler: requireAdminAuth({ permissions: ['alerts.write'] })
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      await alertService.deleteAlertRule(id);

      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Alert rule deleted',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_delete_alert_rule_error', error as Error, {
        correlation_id: request.correlationId,
        ruleId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete alert rule' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/alerts/rules/:id/toggle
   * Toggle alert rule enabled/disabled
   */
  fastify.post<{
    Params: { id: string };
    Body: { enabled: boolean };
  }>('/v1/admin/alerts/rules/:id/toggle', {
    preHandler: requireAdminAuth({ permissions: ['alerts.write'] })
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { enabled } = request.body;

      const rule = await alertService.toggleAlertRule(id, enabled);

      return reply.send(
        withCorrelationId({
          success: true,
          data: rule,
          message: `Alert rule ${enabled ? 'enabled' : 'disabled'}`,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_toggle_alert_rule_error', error as Error, {
        correlation_id: request.correlationId,
        ruleId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle alert rule' },
        correlation_id: request.correlationId
      });
    }
  });

  // ============================================================================
  // ACTIVE ALERTS
  // ============================================================================

  /**
   * GET /v1/admin/alerts/active
   * Get currently firing alerts
   */
  fastify.get('/v1/admin/alerts/active', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const alerts = await alertService.getActiveAlerts();

      return reply.send(
        withCorrelationId({
          success: true,
          data: alerts,
          count: alerts.length,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_get_active_alerts_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get active alerts' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/alerts/history
   * Get alert history
   */
  fastify.get<{
    Querystring: {
      rule_id?: string;
      status?: AlertStatus;
      limit?: string;
      offset?: string;
    };
  }>('/v1/admin/alerts/history', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { rule_id, status, limit, offset } = request.query;

      const { data, count } = await alertService.getAlertHistory({
        ruleId: rule_id,
        status,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      return reply.send(
        withCorrelationId({
          success: true,
          data,
          pagination: {
            total: count,
            limit: limit ? parseInt(limit, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0,
          },
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_get_alert_history_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get alert history' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/alerts/:id/acknowledge
   * Acknowledge an alert (stops repeat notifications for 1 hour)
   */
  fastify.post<{
    Params: { id: string };
  }>('/v1/admin/alerts/:id/acknowledge', {
    preHandler: requireAdminAuth({ permissions: ['alerts.acknowledge'] })
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;
      const { id } = request.params;

      const alert = await alertService.acknowledgeAlert(id, adminRequest.adminClaims.sub);

      return reply.send(
        withCorrelationId({
          success: true,
          data: alert,
          message: 'Alert acknowledged',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_acknowledge_alert_error', error as Error, {
        correlation_id: request.correlationId,
        alertId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to acknowledge alert' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/alerts/:id/resolve
   * Manually resolve an alert
   */
  fastify.post<{
    Params: { id: string };
  }>('/v1/admin/alerts/:id/resolve', {
    preHandler: requireAdminAuth({ permissions: ['alerts.write'] })
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const alert = await alertService.resolveAlert(id);

      return reply.send(
        withCorrelationId({
          success: true,
          data: alert,
          message: 'Alert resolved',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_resolve_alert_error', error as Error, {
        correlation_id: request.correlationId,
        alertId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve alert' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/alerts/:id/create-incident
   * Create incident from alert
   */
  fastify.post<{
    Params: { id: string };
  }>('/v1/admin/alerts/:id/create-incident', {
    preHandler: requireAdminAuth({ permissions: ['incidents.create'] })
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;
      const { id } = request.params;

      // Get the alert by ID (includes rule via join)
      const alert = await alertService.getAlertById(id);
      if (!alert) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Alert not found' },
          correlation_id: request.correlationId
        });
      }

      // Get the full rule details
      const rule = await alertService.getAlertRule(alert.rule_id);
      if (!rule) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Alert rule not found' },
          correlation_id: request.correlationId
        });
      }

      // Create incident
      const incident = await incidentService.createIncident({
        title: `Alert: ${rule.name}`,
        severity: rule.severity === 'critical' ? 2 : 3,
        description: `Created from alert. Metric: ${rule.metric_name}, Value: ${alert.metric_value}, Threshold: ${rule.threshold}`,
        created_by: adminRequest.adminClaims.sub,
      });

      // Link alert to incident
      await alertService.linkAlertToIncident(id, incident.id);

      return reply.code(201).send(
        withCorrelationId({
          success: true,
          data: {
            incident,
            alert_id: id,
          },
          message: 'Incident created from alert',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_create_incident_from_alert_error', error as Error, {
        correlation_id: request.correlationId,
        alertId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create incident from alert' },
        correlation_id: request.correlationId
      });
    }
  });

  // ============================================================================
  // EVALUATOR STATUS
  // ============================================================================

  /**
   * GET /v1/admin/alerts/evaluator/status
   * Get alert evaluator worker status
   */
  fastify.get('/v1/admin/alerts/evaluator/status', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const status = getAlertEvaluatorStatus();

      return reply.send(
        withCorrelationId({
          success: true,
          data: status,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_get_evaluator_status_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get evaluator status' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/alerts/evaluator/force-run
   * Force immediate alert evaluation
   */
  fastify.post('/v1/admin/alerts/evaluator/force-run', {
    preHandler: requireAdminAuth({ permissions: ['alerts.write'] })
  }, async (request, reply) => {
    try {
      await forceEvaluation();

      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Alert evaluation triggered',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_force_evaluation_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to trigger evaluation' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/alerts/evaluator/reset-errors
   * Reset evaluator error count
   */
  fastify.post('/v1/admin/alerts/evaluator/reset-errors', {
    preHandler: requireAdminAuth({ permissions: ['alerts.write'] })
  }, async (request, reply) => {
    try {
      resetAlertEvaluatorErrors();

      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Evaluator error count reset',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_reset_evaluator_errors_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to reset error count' },
        correlation_id: request.correlationId
      });
    }
  });
}
