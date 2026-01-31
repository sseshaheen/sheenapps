/**
 * Admin Build Log Routes (DEPRECATED)
 * 
 * ⚠️ DEPRECATED: These endpoints are deprecated in favor of the Unified Logs API.
 * Use /admin/unified-logs/* endpoints instead for new development.
 * These endpoints will be removed in a future release.
 * 
 * Migration Guide: docs/ADMIN_LOGS_FRONTEND_INTEGRATION.md
 * 
 * Provides admin-only access to build logs with:
 * - JWT-based admin authentication
 * - Server-side ownership validation
 * - HTTP Range support for tailing logs
 * - Audit logging for access tracking
 * - NDJSON streaming format
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { PassThrough } from 'stream';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { withCorrelationId, adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { findLogFile, getBuildInfo } from '../services/buildLogger';

const loggingService = ServerLoggingService.getInstance();

/**
 * Convert NDJSON log file to raw text format
 * Extracts readable messages from structured log entries
 */
function convertNdjsonToRaw(logPath: string, start: number, end: number): PassThrough {
  const outputStream = new PassThrough();
  
  const fileStream = createReadStream(logPath, { start, end });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    
    try {
      const logEntry = JSON.parse(line);
      const rawLine = formatLogEntryAsRaw(logEntry);
      if (rawLine) {
        outputStream.write(rawLine + '\n');
      }
    } catch (error) {
      // If JSON parsing fails, write the original line
      outputStream.write(line + '\n');
    }
  });

  rl.on('close', () => {
    outputStream.end();
  });

  rl.on('error', (error) => {
    outputStream.destroy(error);
  });

  return outputStream;
}

/**
 * Format a structured log entry as readable text
 */
function formatLogEntryAsRaw(entry: any): string | null {
  // Handle different log entry types based on the actual structure
  switch (entry.kind) {
    case 'line':
      // For line entries, the actual content is in the 'msg' field as JSON string
      if (entry.msg) {
        try {
          // Parse the JSON-encoded message
          const parsedMsg = JSON.parse(entry.msg);
          // Return the parsed content directly as the raw content
          return JSON.stringify(parsedMsg);
        } catch (error) {
          // If JSON parsing fails, return the msg as-is
          return entry.msg;
        }
      }
      return null;
      
    case 'meta':
      if (entry.buildId && entry.startedAt) {
        return `# Build Started: ${entry.buildId} at ${entry.startedAt}`;
      } else if (entry.buildId && entry.endedAt) {
        return `# Build Completed: ${entry.buildId} at ${entry.endedAt}`;
      } else {
        // Return metadata as JSON for other meta entries
        return JSON.stringify(entry);
      }
      
    case 'stdout':
    case 'stderr':
      return entry.content || entry.msg || '';
      
    case 'cmd':
      return `${entry.command || ''} ${(entry.args || []).join(' ')}`;
      
    case 'error':
      return `ERROR: ${entry.message || entry.error || JSON.stringify(entry)}`;
      
    case 'warning':
      return `WARNING: ${entry.message || JSON.stringify(entry)}`;
      
    case 'info':
      return `INFO: ${entry.message || JSON.stringify(entry)}`;
      
    case 'debug':
      return `DEBUG: ${entry.message || JSON.stringify(entry)}`;
      
    default:
      // For unknown types, return JSON representation
      return JSON.stringify(entry);
  }
}

interface BuildLogParams {
  buildId: string;
}

interface BuildLogQuery {
  bytes?: string;
  raw?: string; // "true" to get plain text format instead of NDJSON
}

interface BuildLogHeaders {
  range?: string;
}

export default async function adminBuildLogRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /v1/admin/builds/:buildId/logs
   * Retrieve build logs for admin analysis
   * 
   * ⚠️ DEPRECATED: Use /admin/unified-logs/stream?tier=build instead
   * Migration: docs/ADMIN_LOGS_FRONTEND_INTEGRATION.md
   */
  fastify.get<{ 
    Params: BuildLogParams;
    Querystring: BuildLogQuery;
    Headers: BuildLogHeaders;
  }>('/v1/admin/builds/:buildId/logs', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: true
    })],
  }, async (request, reply) => {
    const { buildId } = request.params;
    const { bytes, raw } = request.query;
    const rangeHeader = request.headers.range;
    const isRawFormat = raw === 'true';
    
    try {
      // 1) Validate buildId format (prevent path traversal)
      const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
      if (!ULID_PATTERN.test(buildId)) {
        return reply.code(404).send(adminErrorResponse(request, 'Build log not found'));
      }
      
      // 2) Find log file first (primary validation)
      const logPath = await findLogFile(buildId);
      if (!logPath || !fs.existsSync(logPath)) {
        return reply.code(404).send(adminErrorResponse(request, 'Build log not found'));
      }
      
      // 3) Get build info for audit metadata (optional - don't fail if DB timeout)
      let build: any = null;
      try {
        build = await getBuildInfo(buildId, pool);
      } catch (error) {
        // Log the error but don't fail the request
        loggingService.logServerEvent('error', 'warn', 'Database timeout during log access', {
          buildId,
          error: error instanceof Error ? error.message : String(error),
          correlationId: request.headers['x-correlation-id']
        });
      }
      
      // 4) Set proper headers based on format
      if (isRawFormat) {
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="${buildId}.log"`);
      } else {
        reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
        reply.header('Content-Disposition', `inline; filename="${buildId}.ndjson"`);
      }
      reply.header('Cache-Control', 'no-store');
      reply.header('Accept-Ranges', 'bytes');
      
      // 5) Handle HTTP Range requests (standard + custom tail support)
      const stat = await fs.promises.stat(logPath);
      let start = 0;
      let end = stat.size - 1;
      
      if (rangeHeader) {
        // Standard HTTP Range: bytes=0-1023 or bytes=-1024
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          start = match[1] ? parseInt(match[1]) : Math.max(0, stat.size - parseInt(match[2] || '0'));
          end = match[2] ? parseInt(match[2]) : stat.size - 1;
          reply.code(206);
          reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        }
      } else if (bytes && bytes.startsWith('-')) {
        // Custom tail support: ?bytes=-1024  
        const tailBytes = Math.abs(parseInt(bytes));
        start = Math.max(0, stat.size - tailBytes);
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      }
      
      // 6) Audit log access
      loggingService.logServerEvent('routing', 'info', 'Admin accessed build log', {
        admin_id: (request as any).adminClaims?.userId,
        admin_email: (request as any).adminClaims?.email,
        buildId,
        projectId: build?.projectId || 'unknown',
        userId: build?.userId || 'unknown', 
        bytesServed: end - start + 1,
        range: rangeHeader || bytes,
        format: isRawFormat ? 'raw' : 'ndjson',
        correlationId: request.headers['x-correlation-id']
      });
      
      if (isRawFormat) {
        // Convert NDJSON to raw text format
        return convertNdjsonToRaw(logPath, start, end);
      } else {
        // Return NDJSON as-is
        return fs.createReadStream(logPath, { start, end });
      }
      
    } catch (error) {
      loggingService.logServerEvent('error', 'error', 'Admin build log access failed', {
        admin_id: (request as any).adminClaims?.userId,
        buildId,
        error: error instanceof Error ? error.message : String(error),
        correlationId: request.headers['x-correlation-id']
      });
      
      return reply.code(500).send(adminErrorResponse(request, 'Failed to retrieve build log'));
    }
  });

  /**
   * GET /v1/admin/builds/:buildId/info
   * Get build metadata for admin dashboard
   * 
   * ⚠️ DEPRECATED: Use database queries or existing admin APIs instead
   * Migration: docs/ADMIN_LOGS_FRONTEND_INTEGRATION.md
   */
  fastify.get<{ 
    Params: BuildLogParams;
  }>('/v1/admin/builds/:buildId/info', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: true
    })],
  }, async (request, reply) => {
    const { buildId } = request.params;
    
    try {
      // Validate buildId format
      const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
      if (!ULID_PATTERN.test(buildId)) {
        return reply.code(404).send(adminErrorResponse(request, 'Build not found'));
      }
      
      // Get build metrics and info
      const buildResult = await pool!.query(`
        SELECT 
          build_id,
          project_id,
          user_id,
          status,
          created_at,
          completed_at,
          total_duration_ms,
          failure_stage
        FROM project_build_metrics 
        WHERE build_id = $1
      `, [buildId]);
      
      if (buildResult.rows.length === 0) {
        return reply.code(404).send(adminErrorResponse(request, 'Build not found'));
      }
      
      const build = buildResult.rows[0];
      
      // Check if log file exists
      const logPath = await findLogFile(buildId);
      const logExists = logPath && fs.existsSync(logPath);
      const logSize = logExists ? (await fs.promises.stat(logPath)).size : 0;
      
      // Get user info
      const userResult = await pool!.query(
        'SELECT email FROM auth.users WHERE id = $1::uuid',
        [build.user_id]
      );
      
      return reply.send(withCorrelationId({
        buildId: build.build_id,
        projectId: build.project_id,
        userId: build.user_id,
        userEmail: userResult.rows[0]?.email,
        status: build.status,
        createdAt: build.created_at,
        completedAt: build.completed_at,
        totalDurationMs: build.total_duration_ms,
        failureStage: build.failure_stage,
        logExists,
        logSizeBytes: logSize
      }, request));
      
    } catch (error) {
      loggingService.logServerEvent('error', 'error', 'Admin build info query failed', {
        admin_id: (request as any).adminClaims?.userId,
        buildId,
        error: error instanceof Error ? error.message : String(error),
        correlationId: request.headers['x-correlation-id']
      });
      
      return reply.code(500).send(adminErrorResponse(request, 'Failed to retrieve build info'));
    }
  });

  /**
   * GET /v1/admin/builds
   * List recent builds for admin dashboard
   * 
   * ⚠️ DEPRECATED: Use existing project/build admin endpoints instead
   * Migration: docs/ADMIN_LOGS_FRONTEND_INTEGRATION.md
   */
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
      status?: string;
      userId?: string;
      projectId?: string;
      minDurationMs?: number;
      maxDurationMs?: number;
    };
  }>('/v1/admin/builds', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: false // Don't log list operations
    })],
  }, async (request, reply) => {
    const {
      limit = 50,
      offset = 0,
      status,
      userId,
      projectId,
      minDurationMs,
      maxDurationMs
    } = request.query;
    
    try {
      let whereClause = '';
      const params: any[] = [limit, offset];
      let paramIndex = 3;
      
      if (status) {
        whereClause += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
      
      if (userId) {
        whereClause += ` AND user_id = $${paramIndex}`;
        params.push(userId);
        paramIndex++;
      }
      
      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      if (minDurationMs !== undefined) {
        whereClause += ` AND total_duration_ms >= $${paramIndex}`;
        params.push(minDurationMs);
        paramIndex++;
      }

      if (maxDurationMs !== undefined) {
        whereClause += ` AND total_duration_ms <= $${paramIndex}`;
        params.push(maxDurationMs);
        paramIndex++;
      }

      const result = await pool!.query(`
        SELECT
          b.build_id,
          b.project_id,
          b.user_id,
          b.status,
          b.created_at,
          b.completed_at,
          b.total_duration_ms as build_duration_ms,
          b.failure_stage,
          u.email as user_email,
          COALESCE(pv.prompt, br.prompt) as user_prompt
        FROM project_build_metrics b
        LEFT JOIN auth.users u ON b.user_id::uuid = u.id
        LEFT JOIN project_versions pv ON TRIM(b.version_id) = pv.version_id
        LEFT JOIN project_build_records br ON b.build_id = br.build_id
        WHERE 1=1 ${whereClause}
        ORDER BY b.created_at DESC
        LIMIT $1 OFFSET $2
      `, params);
      
      // Check log existence for each build
      const builds = await Promise.all(result.rows.map(async (build) => {
        const logPath = await findLogFile(build.build_id);
        const logExists = logPath && fs.existsSync(logPath);
        
        return {
          ...build,
          logExists
        };
      }));
      
      return reply.send(withCorrelationId({
        builds,
        pagination: {
          limit,
          offset,
          total: result.rows.length
        }
      }, request));
      
    } catch (error) {
      loggingService.logServerEvent('error', 'error', 'Admin builds list query failed', {
        admin_id: (request as any).adminClaims?.userId,
        error: error instanceof Error ? error.message : String(error),
        correlationId: request.headers['x-correlation-id']
      });
      
      return reply.code(500).send(adminErrorResponse(request, 'Failed to list builds'));
    }
  });
}