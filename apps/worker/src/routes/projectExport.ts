import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyHMACv1, validateTimestamp } from '../utils/hmacHelpers';
import { exportJobsService } from '../services/exportJobsService';
import { r2ExportUpload } from '../services/r2ExportUpload';
import { exportWorker } from '../workers/exportWorker';
import { zipExportService } from '../services/zipExportService';
import type {
  CreateExportRequest,
  CreateExportResponse,
  GetExportStatusRequest,
  GetExportStatusResponse,
  ListExportsRequest,
  ListExportsResponse,
  DownloadExportRequest
} from '../types/projectExport';

// HMAC shared secret for authentication
const SHARED_SECRET = process.env.HMAC_SECRET || process.env.SHARED_SECRET || '';

if (!SHARED_SECRET) {
  console.error('WARNING: HMAC_SECRET not configured for export routes');
}

/**
 * HMAC verification helper for export routes
 */
async function verifyHmacSignature(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!SHARED_SECRET) {
    console.error('[Export] HMAC verification skipped - no secret configured');
    return true; // Allow in development
  }

  const sig = request.headers['x-sheen-signature'] as string;
  const timestamp = request.headers['x-sheen-timestamp'] as string;
  const body = JSON.stringify(request.body);

  if (!sig || !timestamp || !validateTimestamp(timestamp) || !verifyHMACv1(body, timestamp, sig, SHARED_SECRET)) {
    console.log('[Export] HMAC signature verification failed');
    await reply.code(401).send({
      error: 'Invalid signature',
      serverTime: new Date().toISOString()
    });
    return false;
  }

  return true;
}

/**
 * Project Export API Routes
 * Handles project source code export/download functionality
 */
export async function projectExportRoutes(fastify: FastifyInstance) {

  // ============================================================================
  // EXPORT CREATION
  // ============================================================================

  /**
   * Create new project export job
   * POST /api/projects/:projectId/export
   */
  fastify.post<{
    Params: { projectId: string };
    Body: CreateExportRequest;
  }>('/api/projects/:projectId/export', async (request, reply) => {
    // Verify HMAC signature
    const isAuthenticated = await verifyHmacSignature(request, reply);
    if (!isAuthenticated) return;

    try {
      const { projectId } = request.params;
      const { userId, versionId, exportType, clientRequestId } = request.body;

      // Validate required parameters
      if (!userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required parameters: userId and projectId required'
        });
      }

      // Create export job
      const exportJob = await exportJobsService.createExportJob({
        projectId,
        userId,
        versionId,
        exportType: exportType || 'zip',
        clientRequestId
      });

      // Add to processing queue
      const queueJobId = await exportWorker.addExportJob({
        jobId: exportJob.id,
        projectId,
        userId,
        versionId,
        exportType: exportType || 'zip',
        options: zipExportService.getDefaultFilterOptions()
      });

      // Estimate completion time (rough calculation based on queue status)
      const queueStatus = await exportWorker.getQueueStatus();
      const estimatedMinutes = Math.max(1, Math.ceil((queueStatus.waiting + queueStatus.active) / 2));
      const estimatedCompletionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);

      const response: CreateExportResponse = {
        jobId: exportJob.id,
        status: exportJob.status,
        message: 'Export job created and queued for processing',
        estimatedCompletionTime: estimatedCompletionTime.toISOString()
      };

      return reply.code(201).send(response);

    } catch (error: any) {
      console.error('Export creation failed:', error);

      if (error.code === 'EXPORT_ALREADY_EXISTS') {
        return reply.code(409).send({
          error: error.message,
          code: 'EXPORT_ALREADY_EXISTS'
        });
      }

      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        return reply.code(429).send({
          error: error.message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: error.retryAfter
        });
      }

      if (error.code === 'PROJECT_NOT_FOUND') {
        return reply.code(404).send({
          error: error.message,
          code: 'PROJECT_NOT_FOUND'
        });
      }

      return reply.code(500).send({
        error: 'Failed to create export job',
        message: error.message
      });
    }
  });

  // ============================================================================
  // EXPORT STATUS
  // ============================================================================

  /**
   * Get export job status
   * GET /api/projects/:projectId/export/:jobId
   */
  fastify.get<{
    Params: { projectId: string; jobId: string };
    Querystring: GetExportStatusRequest;
  }>('/api/projects/:projectId/export/:jobId', async (request, reply) => {
    // For GET requests, we need to verify HMAC with empty body
    const tempBody = request.body;
    request.body = {}; // GET requests have empty body for HMAC
    const isAuthenticated = await verifyHmacSignature(request, reply);
    request.body = tempBody; // Restore original body
    if (!isAuthenticated) return;

    try {
      const { projectId, jobId } = request.params;
      const { userId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      // Get export job
      const exportJob = await exportJobsService.getExportJob(jobId, userId);
      
      if (!exportJob) {
        return reply.code(404).send({
          error: 'Export job not found',
          code: 'EXPORT_NOT_FOUND'
        });
      }

      if (exportJob.project_id !== projectId) {
        return reply.code(404).send({
          error: 'Export job not found for this project',
          code: 'EXPORT_NOT_FOUND'
        });
      }

      // Check if expired
      if (exportJob.status === 'completed' && exportJob.expires_at && exportJob.expires_at < new Date()) {
        await exportJobsService.updateExportJob(jobId, { status: 'expired' });
        exportJob.status = 'expired';
      }

      // Generate download URL for completed exports
      let downloadUrl: string | undefined;
      if (exportJob.status === 'completed' && exportJob.r2_key) {
        try {
          const fileName = zipExportService.createSafeFilename(
            projectId, 
            exportJob.version_id, 
            exportJob.created_at
          );
          downloadUrl = await r2ExportUpload.generateSignedDownloadUrl(
            exportJob.r2_key,
            3600, // 1 hour expiration
            fileName
          );
        } catch (error) {
          console.error('Failed to generate download URL:', error);
          // Don't fail the request, just omit the download URL
        }
      }

      const response: GetExportStatusResponse = {
        jobId: exportJob.id,
        status: exportJob.status,
        progress: exportJob.progress,
        zipSize: exportJob.zip_size_bytes,
        fileCount: exportJob.file_count,
        compressionRatio: exportJob.compression_ratio,
        createdAt: exportJob.created_at.toISOString(),
        completedAt: exportJob.completed_at?.toISOString(),
        expiresAt: exportJob.expires_at?.toISOString(),
        downloadUrl,
        errorMessage: exportJob.error_message
      };

      return reply.send(response);

    } catch (error: any) {
      console.error('Failed to get export status:', error);
      return reply.code(500).send({
        error: 'Failed to get export status',
        message: error.message
      });
    }
  });

  // ============================================================================
  // EXPORT LISTING
  // ============================================================================

  /**
   * List user's export jobs
   * GET /api/exports
   */
  fastify.get<{
    Querystring: ListExportsRequest;
  }>('/api/exports', async (request, reply) => {
    // Verify HMAC for GET request
    const tempBody = request.body;
    request.body = {};
    const isAuthenticated = await verifyHmacSignature(request, reply);
    request.body = tempBody;
    if (!isAuthenticated) return;

    try {
      const { userId, projectId, limit = 25, offset = 0 } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      const { jobs, totalCount } = await exportJobsService.listExportJobs(
        userId,
        projectId,
        Math.min(limit, 100), // Cap at 100
        Math.max(offset, 0)
      );

      const response: ListExportsResponse = {
        exports: jobs.map(job => ({
          jobId: job.id,
          projectId: job.project_id,
          versionId: job.version_id,
          status: job.status,
          zipSize: job.zip_size_bytes,
          fileCount: job.file_count,
          createdAt: job.created_at.toISOString(),
          expiresAt: job.expires_at?.toISOString()
        })),
        totalCount,
        hasMore: offset + jobs.length < totalCount
      };

      return reply.send(response);

    } catch (error: any) {
      console.error('Failed to list exports:', error);
      return reply.code(500).send({
        error: 'Failed to list exports',
        message: error.message
      });
    }
  });

  // ============================================================================
  // DOWNLOAD TRACKING
  // ============================================================================

  /**
   * Download export file (redirects to signed URL)
   * GET /api/projects/:projectId/export/:jobId/download
   */
  fastify.get<{
    Params: { projectId: string; jobId: string };
    Querystring: DownloadExportRequest;
  }>('/api/projects/:projectId/export/:jobId/download', async (request, reply) => {
    // Verify HMAC for GET request
    const tempBody = request.body;
    request.body = {};
    const isAuthenticated = await verifyHmacSignature(request, reply);
    request.body = tempBody;
    if (!isAuthenticated) return;

    const startTime = Date.now();

    try {
      const { projectId, jobId } = request.params;
      const { userId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      // Get export job
      const exportJob = await exportJobsService.getExportJob(jobId, userId);
      
      if (!exportJob) {
        return reply.code(404).send({
          error: 'Export job not found',
          code: 'EXPORT_NOT_FOUND'
        });
      }

      if (exportJob.project_id !== projectId) {
        return reply.code(404).send({
          error: 'Export job not found for this project'
        });
      }

      if (exportJob.status !== 'completed') {
        return reply.code(400).send({
          error: `Export is not ready for download. Status: ${exportJob.status}`,
          code: 'EXPORT_NOT_READY'
        });
      }

      if (!exportJob.r2_key) {
        return reply.code(500).send({
          error: 'Export file not available',
          code: 'FILE_NOT_AVAILABLE'
        });
      }

      // Check expiration
      if (exportJob.expires_at && exportJob.expires_at < new Date()) {
        await exportJobsService.updateExportJob(jobId, { status: 'expired' });
        return reply.code(410).send({
          error: 'Export has expired',
          code: 'EXPORT_EXPIRED'
        });
      }

      // Verify file exists in R2
      const fileExists = await r2ExportUpload.fileExists(exportJob.r2_key);
      if (!fileExists) {
        return reply.code(404).send({
          error: 'Export file not found in storage',
          code: 'FILE_NOT_FOUND'
        });
      }

      // Generate signed download URL
      const fileName = zipExportService.createSafeFilename(
        projectId, 
        exportJob.version_id, 
        exportJob.created_at
      );
      
      const downloadUrl = await r2ExportUpload.generateSignedDownloadUrl(
        exportJob.r2_key,
        3600, // 1 hour expiration
        fileName
      );

      // Record download analytics
      const downloadDuration = Date.now() - startTime;
      await exportJobsService.recordDownload({
        exportJobId: jobId,
        userId,
        projectId,
        downloadIp: request.ip,
        userAgent: request.headers['user-agent'],
        referrer: request.headers['referer'],
        zipSizeBytes: exportJob.zip_size_bytes,
        downloadDurationMs: downloadDuration,
        success: true,
        sessionId: request.query.sessionId
      });

      // Set appropriate headers for the redirect
      reply.header('Cache-Control', 'private, no-cache');
      reply.header('X-Export-Job-Id', jobId);
      reply.header('X-Zip-Size', exportJob.zip_size_bytes?.toString() || '0');
      reply.header('X-File-Count', exportJob.file_count.toString());

      // Redirect to signed download URL
      return reply.code(302).redirect(downloadUrl);

    } catch (error: any) {
      console.error('Download failed:', error);

      // Record failed download attempt
      try {
        const { projectId, jobId } = request.params;
        const downloadDuration = Date.now() - startTime;
        await exportJobsService.recordDownload({
          exportJobId: jobId,
          userId: request.query.userId,
          projectId,
          downloadIp: request.ip,
          userAgent: request.headers['user-agent'],
          downloadDurationMs: downloadDuration,
          success: false
        });
      } catch (recordError) {
        console.error('Failed to record download failure:', recordError);
      }

      return reply.code(500).send({
        error: 'Download failed',
        message: error.message
      });
    }
  });

  // ============================================================================
  // ADMIN/MONITORING ENDPOINTS
  // ============================================================================

  /**
   * Get export queue status (admin)
   * GET /api/admin/exports/queue
   */
  fastify.get('/api/admin/exports/queue', async (request, reply) => {
    try {
      // TODO: Add admin authentication
      
      const [queueStatus, queueMetrics] = await Promise.all([
        exportWorker.getQueueStatus(),
        exportJobsService.getQueueMetrics()
      ]);

      const workerHealth = exportWorker.getWorkerHealth();

      return reply.send({
        queue: queueStatus,
        metrics: queueMetrics,
        worker: workerHealth,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Failed to get queue status:', error);
      return reply.code(500).send({
        error: 'Failed to get queue status',
        message: error.message
      });
    }
  });

  /**
   * Get export analytics (admin)
   * GET /api/admin/exports/analytics
   */
  fastify.get<{
    Querystring: { days?: number; userId?: string; projectId?: string };
  }>('/api/admin/exports/analytics', async (request, reply) => {
    try {
      // TODO: Add admin authentication
      
      const { days = 30, userId, projectId } = request.query;

      const analytics = await exportJobsService.getDownloadAnalytics(
        userId || 'all', // Use 'all' for system-wide analytics
        projectId,
        days
      );

      return reply.send({
        period_days: days,
        analytics,
        filters: { userId, projectId },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Failed to get export analytics:', error);
      return reply.code(500).send({
        error: 'Failed to get export analytics',
        message: error.message
      });
    }
  });

  /**
   * Cleanup expired exports (admin)
   * POST /api/admin/exports/cleanup
   */
  fastify.post('/api/admin/exports/cleanup', async (request, reply) => {
    try {
      // TODO: Add admin authentication

      const [expiredJobs, deletedJobs, cleanedFiles] = await Promise.all([
        exportJobsService.cleanupExpiredExports(),
        exportJobsService.deleteOldExports(),
        r2ExportUpload.cleanupExpiredExports()
      ]);

      // Clean up queue jobs
      await exportWorker.cleanJobs();

      return reply.send({
        expired_jobs: expiredJobs,
        deleted_old_jobs: deletedJobs,
        cleaned_files: cleanedFiles,
        message: 'Cleanup completed successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Failed to cleanup exports:', error);
      return reply.code(500).send({
        error: 'Failed to cleanup exports',
        message: error.message
      });
    }
  });

  /**
   * Cancel export job (user)
   * DELETE /api/projects/:projectId/export/:jobId
   */
  fastify.delete<{
    Params: { projectId: string; jobId: string };
    Body: { userId: string };
  }>('/api/projects/:projectId/export/:jobId', async (request, reply) => {
    // Verify HMAC signature for DELETE
    const isAuthenticated = await verifyHmacSignature(request, reply);
    if (!isAuthenticated) return;

    try {
      const { projectId, jobId } = request.params;
      const { userId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      // Get export job to verify ownership
      const exportJob = await exportJobsService.getExportJob(jobId, userId);
      
      if (!exportJob) {
        return reply.code(404).send({
          error: 'Export job not found',
          code: 'EXPORT_NOT_FOUND'
        });
      }

      if (exportJob.project_id !== projectId) {
        return reply.code(404).send({
          error: 'Export job not found for this project'
        });
      }

      // Only allow cancellation of queued or processing jobs
      if (!['queued', 'processing'].includes(exportJob.status)) {
        return reply.code(400).send({
          error: `Cannot cancel export with status: ${exportJob.status}`,
          code: 'CANNOT_CANCEL'
        });
      }

      // Cancel the queue job
      await exportWorker.removeJob(jobId);

      // Update database status
      await exportJobsService.updateExportJob(jobId, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Cancelled by user'
      });

      return reply.send({
        message: 'Export job cancelled successfully',
        jobId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Failed to cancel export:', error);
      return reply.code(500).send({
        error: 'Failed to cancel export',
        message: error.message
      });
    }
  });
}