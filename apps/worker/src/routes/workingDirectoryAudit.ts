import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getWorkingDirectoryAuditor } from '../services/workingDirectoryAudit';
import { requireHmacSignature } from '../middleware/hmacValidation';

interface AuditQueryParams {
  projectId?: string;
  userId?: string;
  filename?: string;
  fromDate?: string;
  toDate?: string;
  limit?: string;
  offset?: string;
}

export async function registerWorkingDirectoryAuditRoutes(app: FastifyInstance) {
  // Apply HMAC validation to all admin endpoints
  const hmacMiddleware = requireHmacSignature();

  const auditor = getWorkingDirectoryAuditor();
  await auditor.initialize();

  // GET /audit/working-directory/changes - "who changed main.css at 3 AM?"
  // Expert recommendation: Harden with pagination and date-range limits
  app.get<{ Querystring: AuditQueryParams }>('/v1/admin/audit/working-directory/changes', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Querystring: AuditQueryParams }>,
    reply: FastifyReply
  ) => {
    try {
      const { 
        projectId, 
        userId, 
        filename, 
        fromDate, 
        toDate, 
        limit = '50',
        offset = '0'
      } = request.query;
      
      // Expert feedback: Enforce pagination and date range limits
      const parsedLimit = Math.min(parseInt(limit) || 50, 100); // MAX 100 entries per request
      const parsedOffset = Math.max(parseInt(offset) || 0, 0);
      
      // Expert feedback: Require date range for security (prevent full table scans)
      const now = new Date();
      const defaultFromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const maxDateRange = 30 * 24 * 60 * 60 * 1000; // 30 days max range
      
      const queryFromDate = fromDate ? new Date(fromDate) : defaultFromDate;
      const queryToDate = toDate ? new Date(toDate) : now;
      
      // Validate date range
      if (queryToDate.getTime() - queryFromDate.getTime() > maxDateRange) {
        return reply.code(400).send({
          error: 'Date range too large',
          message: 'Maximum date range is 30 days. Please narrow your search.',
          maxRangeDays: 30
        });
      }
      
      const changes = await auditor.findFileChanges({
        projectId,
        userId,
        filename,
        fromDate: queryFromDate,
        toDate: queryToDate
      });

      // Apply pagination
      const paginatedChanges = changes.slice(parsedOffset, parsedOffset + parsedLimit);
      const hasMore = parsedOffset + parsedLimit < changes.length;

      return reply.send({
        success: true,
        changes: paginatedChanges,
        pagination: {
          total: changes.length,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore
        },
        query: {
          projectId,
          userId, 
          filename,
          fromDate: queryFromDate.toISOString(),
          toDate: queryToDate.toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error querying working directory changes:', error);
      return reply.code(500).send({
        error: 'Failed to query audit logs',
        details: error.message
      });
    }
  });

  // GET /audit/working-directory/suspicious - security monitoring
  // Expert recommendation: Harden with date-range limits
  app.get<{ Querystring: Pick<AuditQueryParams, 'projectId' | 'fromDate' | 'toDate'> }>('/v1/admin/audit/working-directory/suspicious', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Querystring: Pick<AuditQueryParams, 'projectId' | 'fromDate' | 'toDate'> }>,
    reply: FastifyReply
  ) => {
    try {
      const { projectId, fromDate, toDate } = request.query;
      
      // Expert feedback: Enforce date range limits for security queries
      const now = new Date();
      const defaultFromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      const maxDateRange = 7 * 24 * 60 * 60 * 1000; // 7 days max for security queries
      
      const queryFromDate = fromDate ? new Date(fromDate) : defaultFromDate;
      const queryToDate = toDate ? new Date(toDate) : now;
      
      // Validate date range (stricter for security queries)
      if (queryToDate.getTime() - queryFromDate.getTime() > maxDateRange) {
        return reply.code(400).send({
          error: 'Date range too large for security queries',
          message: 'Maximum date range for security monitoring is 7 days. Please narrow your search.',
          maxRangeDays: 7
        });
      }
      
      const suspicious = await auditor.findSuspiciousActivity({
        projectId,
        fromDate: queryFromDate,
        toDate: queryToDate
      });

      return reply.send({
        success: true,
        suspicious,
        count: suspicious.length,
        query: {
          projectId,
          fromDate: queryFromDate.toISOString(),
          toDate: queryToDate.toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error querying suspicious activity:', error);
      return reply.code(500).send({
        error: 'Failed to query security logs',
        details: error.message
      });
    }
  });

  // GET /audit/working-directory/performance - operational monitoring
  // Expert recommendation: Harden with date-range limits
  app.get<{ Querystring: Pick<AuditQueryParams, 'projectId' | 'fromDate' | 'toDate'> }>('/v1/admin/audit/working-directory/performance', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Querystring: Pick<AuditQueryParams, 'projectId' | 'fromDate' | 'toDate'> }>,
    reply: FastifyReply
  ) => {
    try {
      const { projectId, fromDate, toDate } = request.query;
      
      // Expert feedback: Enforce date range limits for performance queries
      const now = new Date();
      const defaultFromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      const maxDateRange = 14 * 24 * 60 * 60 * 1000; // 14 days max for performance queries
      
      const queryFromDate = fromDate ? new Date(fromDate) : defaultFromDate;
      const queryToDate = toDate ? new Date(toDate) : now;
      
      // Validate date range
      if (queryToDate.getTime() - queryFromDate.getTime() > maxDateRange) {
        return reply.code(400).send({
          error: 'Date range too large for performance queries',
          message: 'Maximum date range for performance monitoring is 14 days. Please narrow your search.',
          maxRangeDays: 14
        });
      }
      
      const stats = await auditor.getSyncPerformanceStats({
        projectId,
        fromDate: queryFromDate,
        toDate: queryToDate
      });

      return reply.send({
        success: true,
        performance: stats,
        query: {
          projectId,
          fromDate: queryFromDate.toISOString(),
          toDate: queryToDate.toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error querying performance stats:', error);
      return reply.code(500).send({
        error: 'Failed to query performance logs',
        details: error.message
      });
    }
  });
}