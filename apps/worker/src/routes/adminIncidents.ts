/**
 * Admin Incident Management Routes
 *
 * API endpoints for incident lifecycle management:
 * - Create, update, resolve incidents
 * - Timeline entries
 * - Post-mortems
 * - MTTR statistics
 */

import { FastifyInstance } from 'fastify';
import { requireAdminAuth, requireReadOnlyAccess, AdminRequest } from '../middleware/adminAuthentication';
import { withCorrelationId } from '../middleware/correlationIdMiddleware';
import {
  getIncidentManagementService,
  IncidentStatus,
  IncidentSeverity,
  TimelineEntryType,
} from '../services/admin/IncidentManagementService';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

export default async function adminIncidentRoutes(fastify: FastifyInstance) {
  const incidentService = getIncidentManagementService();

  /**
   * POST /v1/admin/incidents
   * Create a new incident
   */
  fastify.post<{
    Body: {
      title: string;
      severity: IncidentSeverity;
      affected_systems?: string[];
      status_page_message?: string;
      description?: string;
    };
  }>('/v1/admin/incidents', {
    preHandler: requireAdminAuth({ permissions: ['incidents.create'] })
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;
      const { title, severity, affected_systems, status_page_message, description } = request.body;

      // SEV1 requires elevated permissions
      if (severity === 1 && !adminRequest.adminClaims.admin_permissions.includes('incidents.create_sev1')) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'SEV1 incidents require elevated permissions' },
          correlation_id: request.correlationId
        });
      }

      const incident = await incidentService.createIncident({
        title,
        severity,
        affected_systems,
        status_page_message,
        description,
        created_by: adminRequest.adminClaims.sub,
      });

      return reply.code(201).send(
        withCorrelationId({
          success: true,
          data: incident,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_create_incident_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create incident' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/incidents
   * List incidents with filters
   */
  fastify.get<{
    Querystring: {
      status?: string;
      severity?: string;
      affected_system?: string;
      from_date?: string;
      to_date?: string;
      limit?: string;
      offset?: string;
    };
  }>('/v1/admin/incidents', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { status, severity, affected_system, from_date, to_date, limit, offset } = request.query;

      const filters = {
        status: status ? status.split(',') as IncidentStatus[] : undefined,
        severity: severity ? severity.split(',').map(Number) as IncidentSeverity[] : undefined,
        affected_system,
        from_date: from_date ? new Date(from_date) : undefined,
        to_date: to_date ? new Date(to_date) : undefined,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      };

      const { data, count } = await incidentService.listIncidents(filters);

      return reply.send(
        withCorrelationId({
          success: true,
          data,
          pagination: {
            total: count,
            limit: filters.limit,
            offset: filters.offset,
          },
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_list_incidents_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list incidents' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/incidents/:id
   * Get incident with full details
   */
  fastify.get<{
    Params: { id: string };
  }>('/v1/admin/incidents/:id', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const result = await incidentService.getIncidentWithDetails(id);

      if (!result) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Incident not found' },
          correlation_id: request.correlationId
        });
      }

      return reply.send(
        withCorrelationId({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_get_incident_error', error as Error, {
        correlation_id: request.correlationId,
        incidentId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get incident' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * PATCH /v1/admin/incidents/:id
   * Update incident
   */
  fastify.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      severity?: IncidentSeverity;
      status?: IncidentStatus;
      affected_systems?: string[];
      status_page_message?: string;
      description?: string;
    };
  }>('/v1/admin/incidents/:id', {
    preHandler: requireAdminAuth({ permissions: ['incidents.create'] })
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;
      const { id } = request.params;

      const incident = await incidentService.updateIncident(id, {
        ...request.body,
        resolved_by: request.body.status === 'resolved' ? adminRequest.adminClaims.sub : undefined,
      });

      return reply.send(
        withCorrelationId({
          success: true,
          data: incident,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_update_incident_error', error as Error, {
        correlation_id: request.correlationId,
        incidentId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update incident' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/incidents/:id/resolve
   * Resolve incident (with post-mortem validation for SEV1-2)
   */
  fastify.post<{
    Params: { id: string };
    Body: { resolution_note?: string };
  }>('/v1/admin/incidents/:id/resolve', {
    preHandler: requireAdminAuth({ permissions: ['incidents.resolve'] })
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;
      const { id } = request.params;
      const { resolution_note } = request.body;

      const incident = await incidentService.resolveIncident(
        id,
        adminRequest.adminClaims.sub,
        resolution_note
      );

      return reply.send(
        withCorrelationId({
          success: true,
          data: incident,
          message: 'Incident resolved',
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle post-mortem requirement error
      if (errorMessage.includes('post-mortem')) {
        return reply.code(400).send({
          success: false,
          error: errorMessage,
          correlation_id: request.correlationId
        });
      }

      await loggingService.logCriticalError('admin_resolve_incident_error', error as Error, {
        correlation_id: request.correlationId,
        incidentId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve incident' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * POST /v1/admin/incidents/:id/timeline
   * Add timeline entry
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      message: string;
      entry_type?: TimelineEntryType;
    };
  }>('/v1/admin/incidents/:id/timeline', {
    preHandler: requireAdminAuth({ permissions: ['incidents.create'] })
  }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest;
      const { id } = request.params;
      const { message, entry_type = 'manual' } = request.body;

      const entry = await incidentService.addTimelineEntry(
        id,
        message,
        entry_type,
        adminRequest.adminClaims.sub
      );

      return reply.code(201).send(
        withCorrelationId({
          success: true,
          data: entry,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_add_timeline_error', error as Error, {
        correlation_id: request.correlationId,
        incidentId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to add timeline entry' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/incidents/:id/timeline
   * Get timeline for incident
   */
  fastify.get<{
    Params: { id: string };
  }>('/v1/admin/incidents/:id/timeline', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const timeline = await incidentService.getTimeline(id);

      return reply.send(
        withCorrelationId({
          success: true,
          data: timeline,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_get_timeline_error', error as Error, {
        correlation_id: request.correlationId,
        incidentId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get timeline' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * PUT /v1/admin/incidents/:id/postmortem
   * Create or update post-mortem
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      what_happened?: string;
      impact?: string;
      root_cause?: string;
      lessons_learned?: string;
      action_items?: Array<{
        title: string;
        owner?: string;
        due_date?: string;
        status: 'pending' | 'in_progress' | 'completed';
      }>;
    };
  }>('/v1/admin/incidents/:id/postmortem', {
    preHandler: requireAdminAuth({ permissions: ['incidents.edit_postmortem'] })
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const postMortem = await incidentService.upsertPostMortem(id, request.body);

      return reply.send(
        withCorrelationId({
          success: true,
          data: postMortem,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_upsert_postmortem_error', error as Error, {
        correlation_id: request.correlationId,
        incidentId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to save post-mortem' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/incidents/:id/postmortem
   * Get post-mortem for incident
   */
  fastify.get<{
    Params: { id: string };
  }>('/v1/admin/incidents/:id/postmortem', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const postMortem = await incidentService.getPostMortem(id);

      if (!postMortem) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Post-mortem not found' },
          correlation_id: request.correlationId
        });
      }

      return reply.send(
        withCorrelationId({
          success: true,
          data: postMortem,
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_get_postmortem_error', error as Error, {
        correlation_id: request.correlationId,
        incidentId: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get post-mortem' },
        correlation_id: request.correlationId
      });
    }
  });

  /**
   * GET /v1/admin/incidents/stats/mttr
   * Get MTTR statistics by severity
   */
  fastify.get<{
    Querystring: { days?: string };
  }>('/v1/admin/incidents/stats/mttr', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    try {
      const days = request.query.days ? parseInt(request.query.days, 10) : 30;
      const stats = await incidentService.getMTTRStats(days);

      return reply.send(
        withCorrelationId({
          success: true,
          data: {
            days,
            stats,
          },
          timestamp: new Date().toISOString()
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_mttr_stats_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get MTTR stats' },
        correlation_id: request.correlationId
      });
    }
  });
}
