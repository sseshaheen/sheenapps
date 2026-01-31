import { getPool } from './database';
import type {
  ProjectExportJob,
  ProjectExportDownload,
  ExportJobCreateParams,
  ExportJobUpdateParams,
  ExportProgress,
  ExportJobStatus,
  RateLimitInfo
} from '../types/projectExport';
import {
  ExportError,
  ExportNotFoundError,
  ProjectNotFoundError,
  ExportExpiredError,
  RateLimitExceededError
} from '../types/projectExport';
import Redis from 'ioredis';
import crypto from 'crypto';

/**
 * Service for managing project export jobs and downloads
 * Handles database operations, Redis rate limiting, and job lifecycle
 */
export class ExportJobsService {
  private redis: Redis;

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
  }

  /**
   * Check rate limits for user export requests
   */
  async checkRateLimit(userId: string, bucket: string = 'default'): Promise<RateLimitInfo> {
    const hourlyKey = `export:rate:${bucket}:${userId}:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const dailyKey = `export:rate:${bucket}:${userId}:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
    const globalKey = `export:rate:global:${Math.floor(Date.now() / 1000)}`;

    const maxHourly = parseInt(process.env.EXPORT_RATE_LIMIT_HOURLY || '10');
    const maxDaily = parseInt(process.env.EXPORT_RATE_LIMIT_DAILY || '50');
    const maxGlobalPerSecond = parseInt(process.env.EXPORT_RATE_LIMIT_GLOBAL || '50');

    try {
      const pipeline = this.redis.pipeline();
      
      // Get current counts
      pipeline.get(hourlyKey);
      pipeline.get(dailyKey);
      pipeline.get(globalKey);
      
      const results = await pipeline.exec();
      if (!results) {
        throw new Error('Redis pipeline execution failed');
      }
      const [hourlyResult, dailyResult, globalResult] = results;
      
      const hourlyCount = parseInt((hourlyResult?.[1] as string) || '0');
      const dailyCount = parseInt((dailyResult?.[1] as string) || '0');
      const globalCount = parseInt((globalResult?.[1] as string) || '0');

      // Check limits
      if (hourlyCount >= maxHourly) {
        const resetTime = new Date(Math.ceil(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000));
        return {
          allowed: false,
          remaining: 0,
          resetTime,
          retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000),
          bucket: `${bucket}:hourly`
        };
      }

      if (dailyCount >= maxDaily) {
        const resetTime = new Date(Math.ceil(Date.now() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000));
        return {
          allowed: false,
          remaining: 0,
          resetTime,
          retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000),
          bucket: `${bucket}:daily`
        };
      }

      if (globalCount >= maxGlobalPerSecond) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date(Date.now() + 1000),
          retryAfter: 1,
          bucket: 'global'
        };
      }

      return {
        allowed: true,
        remaining: Math.min(maxHourly - hourlyCount, maxDaily - dailyCount),
        bucket
      };

    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open for Redis errors
      return { allowed: true, bucket };
    }
  }

  /**
   * Increment rate limit counters
   */
  async incrementRateLimit(userId: string, bucket: string = 'default'): Promise<void> {
    const hourlyKey = `export:rate:${bucket}:${userId}:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const dailyKey = `export:rate:${bucket}:${userId}:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
    const globalKey = `export:rate:global:${Math.floor(Date.now() / 1000)}`;

    try {
      const pipeline = this.redis.pipeline();
      
      // Increment counters with expiration
      pipeline.incr(hourlyKey);
      pipeline.expire(hourlyKey, 3600); // 1 hour
      
      pipeline.incr(dailyKey);
      pipeline.expire(dailyKey, 86400); // 24 hours
      
      pipeline.incr(globalKey);
      pipeline.expire(globalKey, 1); // 1 second
      
      await pipeline.exec();
    } catch (error) {
      console.error('Failed to increment rate limit:', error);
      // Continue even if Redis fails
    }
  }

  /**
   * Create a new export job
   */
  async createExportJob(params: ExportJobCreateParams): Promise<ProjectExportJob> {
    const pool = getPool();
    
    // Check if user has access to project
    const projectQuery = `
      SELECT id FROM projects 
      WHERE id = $1 AND owner_id = $2
    `;
    const projectResult = await pool.query(projectQuery, [params.projectId, params.userId]);
    
    if (projectResult.rows.length === 0) {
      throw new ProjectNotFoundError(params.projectId);
    }

    // Validate version if provided
    if (params.versionId) {
      const versionQuery = `
        SELECT version_id FROM project_versions 
        WHERE version_id = $1 AND user_id = $2 AND project_id = $3
      `;
      const versionResult = await pool.query(versionQuery, [params.versionId, params.userId, params.projectId]);
      
      if (versionResult.rows.length === 0) {
        throw new ExportError('Version not found or access denied', 'VERSION_NOT_FOUND', 404);
      }
    }

    // Check rate limits
    const rateLimitInfo = await this.checkRateLimit(params.userId, params.rateLimitBucket);
    if (!rateLimitInfo.allowed) {
      throw new RateLimitExceededError(
        `Rate limit exceeded for ${rateLimitInfo.bucket}`,
        rateLimitInfo.retryAfter || 3600
      );
    }

    // Generate client request ID if not provided
    const clientRequestId = params.clientRequestId || crypto.randomUUID();
    
    const query = `
      INSERT INTO project_export_jobs (
        project_id, user_id, version_id, export_type, 
        client_request_id, rate_limit_bucket
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        params.projectId,
        params.userId,
        params.versionId || null,
        params.exportType || 'zip',
        clientRequestId,
        params.rateLimitBucket || 'default'
      ]);

      // Increment rate limit counters after successful creation
      await this.incrementRateLimit(params.userId, params.rateLimitBucket);

      const row = result.rows[0];
      return this.mapRowToExportJob(row);

    } catch (error: any) {
      // Handle unique constraint violations (idempotency)
      if (error.code === '23505') {
        if (error.constraint?.includes('uniq_active_export')) {
          throw new ExportError(
            'An active export for this project and version already exists',
            'EXPORT_ALREADY_EXISTS',
            409
          );
        }
        if (error.constraint?.includes('uniq_client_request_active')) {
          // Return existing job for same client request
          const existingQuery = `
            SELECT * FROM project_export_jobs 
            WHERE client_request_id = $1 AND user_id = $2
            AND created_at > (now() - interval '24 hours')
            ORDER BY created_at DESC LIMIT 1
          `;
          const existingResult = await pool.query(existingQuery, [clientRequestId, params.userId]);
          if (existingResult.rows.length > 0) {
            return this.mapRowToExportJob(existingResult.rows[0]);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Update an export job
   */
  async updateExportJob(jobId: string, updates: ExportJobUpdateParams): Promise<ProjectExportJob | null> {
    const pool = getPool();
    
    const setClause: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic SET clause
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField = this.camelToSnakeCase(key);
        setClause.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (setClause.length === 0) {
      return null;
    }

    values.push(jobId);
    const query = `
      UPDATE project_export_jobs
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToExportJob(result.rows[0]);
  }

  /**
   * Get export job by ID with user access check
   */
  async getExportJob(jobId: string, userId: string): Promise<ProjectExportJob | null> {
    const pool = getPool();
    
    const query = `
      SELECT * FROM project_export_jobs
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [jobId, userId]);
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToExportJob(result.rows[0]);
  }

  /**
   * Get export job by ID (admin/system access)
   */
  async getExportJobById(jobId: string): Promise<ProjectExportJob | null> {
    const pool = getPool();
    
    const query = `SELECT * FROM project_export_jobs WHERE id = $1`;
    const result = await pool.query(query, [jobId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToExportJob(result.rows[0]);
  }

  /**
   * List export jobs for user
   */
  async listExportJobs(
    userId: string,
    projectId?: string,
    limit: number = 25,
    offset: number = 0
  ): Promise<{ jobs: ProjectExportJob[], totalCount: number }> {
    const pool = getPool();
    
    let whereClause = 'WHERE user_id = $1';
    const values: any[] = [userId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND project_id = $${paramIndex}`;
      values.push(projectId);
      paramIndex++;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM project_export_jobs ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get jobs with pagination
    const jobsQuery = `
      SELECT * FROM project_export_jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const jobsResult = await pool.query(jobsQuery, values);
    const jobs = jobsResult.rows.map(row => this.mapRowToExportJob(row));

    return { jobs, totalCount };
  }

  /**
   * Record download event
   */
  async recordDownload(params: {
    exportJobId: string;
    userId: string;
    projectId: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    downloadIp?: string | undefined;
    userAgent?: string | undefined;
    referrer?: string | undefined;
    zipSizeBytes?: number | undefined; // Size of downloaded ZIP file
    downloadDurationMs?: number | undefined;
    success?: boolean | undefined;
    sessionId?: string | undefined;
    countryCode?: string | undefined;
  }): Promise<ProjectExportDownload> {
    const pool = getPool();

    const query = `
      INSERT INTO project_export_downloads (
        export_job_id, user_id, project_id, download_ip,
        user_agent, referrer, zip_size_bytes, download_duration_ms,
        success, session_id, country_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await pool.query(query, [
      params.exportJobId,
      params.userId,
      params.projectId,
      params.downloadIp || null,
      params.userAgent || null,
      params.referrer || null,
      params.zipSizeBytes || null,
      params.downloadDurationMs || null,
      params.success !== false, // Default to true
      params.sessionId || null,
      params.countryCode || null
    ]);

    return this.mapRowToDownload(result.rows[0]);
  }

  /**
   * Get download analytics for user
   */
  async getDownloadAnalytics(
    userId: string,
    projectId?: string,
    days: number = 30
  ): Promise<any[]> {
    const pool = getPool();

    let whereClause = 'WHERE d.user_id = $1 AND d.downloaded_at >= $2';
    const values: any[] = [userId, new Date(Date.now() - days * 24 * 60 * 60 * 1000)];
    let paramIndex = 3;

    if (projectId) {
      whereClause += ` AND d.project_id = $${paramIndex}`;
      values.push(projectId);
      paramIndex++;
    }

    const query = `
      SELECT 
        date_trunc('day', d.downloaded_at) as download_date,
        COUNT(*) as total_downloads,
        SUM(d.zip_size_bytes) as total_bytes,
        AVG(d.download_duration_ms) as avg_duration_ms,
        COUNT(*) FILTER (WHERE d.success = true) as successful_downloads
      FROM project_export_downloads d
      ${whereClause}
      GROUP BY date_trunc('day', d.downloaded_at)
      ORDER BY download_date DESC
    `;

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Clean up expired exports
   */
  async cleanupExpiredExports(): Promise<number> {
    const pool = getPool();
    
    const query = `
      UPDATE project_export_jobs 
      SET status = 'expired'
      WHERE status = 'completed' AND expires_at <= NOW()
      RETURNING id
    `;

    const result = await pool.query(query);
    const expiredCount = result.rowCount || 0;

    if (expiredCount > 0) {
      console.log(`Marked ${expiredCount} export jobs as expired`);
    }

    return expiredCount;
  }

  /**
   * Delete old export records (30+ days old)
   */
  async deleteOldExports(): Promise<number> {
    const pool = getPool();
    
    const query = `
      DELETE FROM project_export_jobs
      WHERE status IN ('failed', 'expired')
        AND created_at < (NOW() - INTERVAL '30 days')
      RETURNING id
    `;

    const result = await pool.query(query);
    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      console.log(`Deleted ${deletedCount} old export job records`);
    }

    return deletedCount;
  }

  /**
   * Get queue status and metrics
   */
  async getQueueMetrics(): Promise<{
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    avgProcessingTime: number;
  }> {
    const pool = getPool();

    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at))) as avg_duration
      FROM project_export_jobs
      WHERE created_at > (NOW() - INTERVAL '24 hours')
      GROUP BY status
    `;

    const result = await pool.query(query);
    const metrics = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      avgProcessingTime: 0
    };

    result.rows.forEach(row => {
      const status = row.status as ExportJobStatus;
      const count = parseInt(row.count);
      
      if (status in metrics) {
        (metrics as any)[status] = count;
      }
      
      if (status === 'completed' && row.avg_duration) {
        metrics.avgProcessingTime = parseFloat(row.avg_duration);
      }
    });

    return metrics;
  }

  /**
   * Helper: Convert camelCase to snake_case
   */
  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Helper: Map database row to ExportJob type
   */
  private mapRowToExportJob(row: any): ProjectExportJob {
    return {
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      version_id: row.version_id,
      version_id_norm: row.version_id_norm,
      export_type: row.export_type,
      status: row.status,
      progress: row.progress || { phase: 'queued', filesScanned: 0, bytesWritten: 0 },
      r2_key: row.r2_key,
      uncompressed_size_bytes: row.uncompressed_size_bytes,
      file_count: row.file_count,
      zip_size_bytes: row.zip_size_bytes,
      compression_ratio: row.compression_ratio,
      export_hash: row.export_hash,
      client_request_id: row.client_request_id,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      expires_at: row.expires_at,
      error_message: row.error_message,
      retry_count: row.retry_count,
      rate_limit_bucket: row.rate_limit_bucket
    };
  }

  /**
   * Helper: Map database row to Download type
   */
  private mapRowToDownload(row: any): ProjectExportDownload {
    return {
      id: row.id,
      export_job_id: row.export_job_id,
      user_id: row.user_id,
      project_id: row.project_id,
      downloaded_at: row.downloaded_at,
      download_ip: row.download_ip,
      user_agent: row.user_agent,
      referrer: row.referrer,
      zip_size_bytes: row.zip_size_bytes,
      download_duration_ms: row.download_duration_ms,
      success: row.success,
      session_id: row.session_id,
      country_code: row.country_code
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Export singleton instance
export const exportJobsService = new ExportJobsService();