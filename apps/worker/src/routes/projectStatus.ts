/**
 * Project status endpoint 
 * Provides project status and related information with HMAC authentication
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { pool } from '../services/database';

export function registerProjectStatusRoutes(app: FastifyInstance) {
  /**
   * GET /api/debug/project-status/:projectId
   * Returns current project status and related information
   */
  app.get<{
    Params: { projectId: string }
  }>('/api/debug/project-status/:projectId', {
    preHandler: requireHmacSignature()
  }, async (request, reply) => {
    const { projectId } = request.params;
    
    console.log(`[Debug] Checking status for project: ${projectId}`);
    
    if (!pool) {
      return reply.code(500).send({ error: 'Database not available' });
    }
    
    try {
      // Get project details
      const projectResult = await pool.query(
        `SELECT 
          id,
          build_status,
          current_build_id,
          current_version_id,
          framework,
          last_build_started,
          last_build_completed,
          updated_at,
          created_at
        FROM projects 
        WHERE id = $1`,
        [projectId]
      );
      
      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'Project not found',
          projectId,
          timestamp: new Date().toISOString()
        });
      }
      
      const project = projectResult.rows[0];
      
      // Check for any recent build events
      const eventsResult = await pool.query(
        `SELECT 
          event_type,
          status,
          message,
          created_at
        FROM project_build_events
        WHERE project_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
        [projectId]
      );
      
      // Check for any recent chat plan conversions
      const conversionsResult = await pool.query(
        `SELECT 
          session_id,
          status,
          converted_to_build_id,
          created_at,
          last_active
        FROM project_chat_plan_sessions
        WHERE project_id = $1 
          AND converted_to_build_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 3`,
        [projectId]
      );
      
      const response = {
        project: {
          id: project.id,
          buildStatus: project.build_status,
          currentBuildId: project.current_build_id,
          currentVersionId: project.current_version_id,
          framework: project.framework,
          lastBuildStarted: project.last_build_started,
          lastBuildCompleted: project.last_build_completed,
          updatedAt: project.updated_at,
          createdAt: project.created_at,
          timingConstraintOk: !project.last_build_completed || 
                              !project.last_build_started || 
                              project.last_build_completed >= project.last_build_started
        },
        recentEvents: eventsResult.rows,
        recentConversions: conversionsResult.rows,
        debugInfo: {
          checkedAt: new Date().toISOString(),
          databaseTime: new Date().toISOString()
        }
      };
      
      console.log(`[Debug] Project status for ${projectId}:`, response.project.buildStatus);
      
      reply.send(response);
    } catch (error) {
      console.error('[Debug] Error checking project status:', error);
      reply.code(500).send({ 
        error: 'Failed to check project status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/debug/project-status/:projectId/force-update
   * Force update project status (for debugging only)
   */
  app.post('/api/debug/project-status/:projectId/force-update', async (request: FastifyRequest<{
    Params: { projectId: string },
    Body: { status: string }
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const { status } = request.body;
    
    if (!status) {
      return reply.code(400).send({ error: 'Status is required' });
    }
    
    if (!pool) {
      return reply.code(500).send({ error: 'Database not available' });
    }
    
    console.log(`[Debug] Force updating project ${projectId} status to: ${status}`);
    
    try {
      const result = await pool.query(
        `UPDATE projects 
         SET build_status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, build_status`,
        [status, projectId]
      );
      
      if (result.rowCount === 0) {
        return reply.code(404).send({ 
          error: 'Project not found',
          projectId
        });
      }
      
      console.log(`[Debug] Successfully force updated project ${projectId} to status: ${result.rows[0].build_status}`);
      
      reply.send({
        success: true,
        project: result.rows[0],
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Debug] Error force updating project status:', error);
      reply.code(500).send({ 
        error: 'Failed to update project status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}