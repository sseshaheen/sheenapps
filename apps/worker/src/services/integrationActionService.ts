/**
 * Integration Action Service
 *
 * Handles integration actions with idempotency, rate limiting, and comprehensive
 * action tracking for audit and debugging purposes.
 */

import { pool as db } from './database';
import { Redis } from 'ioredis';
import { ServerLoggingService } from './serverLoggingService';
import { IntegrationEventService } from './integrationEventService';
import { AdapterContext, IntegrationStatus } from '../adapters/IntegrationStatusAdapter';

interface ActionRequest {
  projectId: string;
  userId: string;
  integrationKey: IntegrationStatus['key'];
  actionId: string;
  idempotencyKey: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  parameters?: Record<string, any> | undefined;
  userRole: AdapterContext['userRole'];
  locale?: string | undefined;
}

interface ActionResult {
  id: string;
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  message?: string | undefined;
  data?: any | undefined;
  retryAfter?: number | undefined;
  startedAt: Date;
  completedAt?: Date | undefined;
  duration?: number | undefined;
}

interface ActionRecord {
  id: string;
  project_id: string;
  provider: string;
  action: string;
  idempotency_key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result: Record<string, any>;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  error_message?: string | undefined;
  requested_by: string;
  started_at: Date;
  completed_at?: Date | undefined;
  created_at: Date;
}

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

export class IntegrationActionService {
  private static instance: IntegrationActionService;

  private redis: Redis;
  private loggingService = ServerLoggingService.getInstance();
  private eventService = IntegrationEventService.getInstance();

  // Rate limiting configuration (5 actions per minute per user+project)
  private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  private readonly RATE_LIMIT_COUNT = 5;
  private rateLimitCache = new Map<string, RateLimitWindow>();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  static getInstance(): IntegrationActionService {
    if (!IntegrationActionService.instance) {
      IntegrationActionService.instance = new IntegrationActionService();
    }
    return IntegrationActionService.instance;
  }

  /**
   * Execute an integration action with full idempotency and rate limiting
   */
  async executeAction(request: ActionRequest): Promise<ActionResult> {
    const { projectId, userId, integrationKey, actionId, idempotencyKey, parameters } = request;

    try {
      // 1. Check for existing idempotent request
      const existingResult = await this.checkIdempotency(idempotencyKey);
      if (existingResult) {
        await this.loggingService.logServerEvent(
          'capacity',
          'info',
          'Action request served from idempotency cache',
          { projectId, userId, integrationKey, actionId, idempotencyKey }
        );

        return existingResult;
      }

      // 2. Rate limiting check
      const rateLimitResult = this.checkRateLimit(userId, projectId);
      if (!rateLimitResult.allowed) {
        return {
          id: '',
          success: false,
          message: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          startedAt: new Date()
        };
      }

      // 3. Create action record
      const actionRecord = await this.createActionRecord(request);

      // 4. Execute the action
      const result = await this.performAction(actionRecord, request);

      // 5. Update action record with result
      await this.updateActionRecord(actionRecord.id, result);

      // 6. Cache result for idempotency (24 hour TTL)
      await this.cacheIdempotencyResult(idempotencyKey, result);

      // 7. Broadcast action completion event
      await this.eventService.broadcastActionResult(
        projectId,
        integrationKey,
        actionId,
        result.success,
        result.message
      );

      // 8. Log action completion
      await this.loggingService.logServerEvent(
        'capacity',
        result.success ? 'info' : 'warn',
        'Integration action completed',
        {
          projectId,
          userId,
          integrationKey,
          actionId,
          idempotencyKey,
          success: result.success,
          duration: result.duration,
          actionRecordId: actionRecord.id
        }
      );

      return result;

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'integration_action_execution_error',
        error,
        { projectId, userId, integrationKey, actionId, idempotencyKey }
      );

      const errorResult: ActionResult = {
        id: '',
        success: false,
        message: 'Action execution failed',
        startedAt: new Date()
      };

      // Cache error result for idempotency
      await this.cacheIdempotencyResult(idempotencyKey, errorResult);

      return errorResult;
    }
  }

  /**
   * Get action history for a project
   */
  async getActionHistory(
    projectId: string,
    integrationKey?: IntegrationStatus['key'],
    limit: number = 50
  ): Promise<ActionRecord[]> {
    if (!db) throw new Error('Database not configured');

    try {
      const query = integrationKey
        ? `SELECT * FROM integration_actions
           WHERE project_id = $1 AND provider = $2
           ORDER BY created_at DESC LIMIT $3`
        : `SELECT * FROM integration_actions
           WHERE project_id = $1
           ORDER BY created_at DESC LIMIT $2`;

      const params = integrationKey ? [projectId, integrationKey, limit] : [projectId, limit];
      const result = await db.query(query, params);

      return result.rows.map(this.mapActionRecord);

    } catch (error) {
      await this.loggingService.logCriticalError(
        'action_history_query_failed',
        error as Error,
        { projectId, integrationKey }
      );

      return [];
    }
  }

  /**
   * Get action statistics for monitoring
   */
  async getActionStatistics(
    projectId?: string,
    timeWindow: 'hour' | 'day' | 'week' = 'day'
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    byProvider: Record<string, { total: number; successful: number; failed: number }>;
    averageDuration: number;
  }> {
    if (!db) throw new Error('Database not configured');

    try {
      const timeClause = this.getTimeClause(timeWindow);
      const whereClause = projectId ? 'WHERE project_id = $1 AND' : 'WHERE';
      const params = projectId ? [projectId] : [];

      const query = `
        SELECT
          provider,
          status,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration
        FROM integration_actions
        ${whereClause} created_at >= ${timeClause}
        GROUP BY provider, status
        ORDER BY provider, status
      `;

      const result = await db.query(query, params);

      const stats = {
        total: 0,
        successful: 0,
        failed: 0,
        byProvider: {} as Record<string, { total: number; successful: number; failed: number }>,
        averageDuration: 0
      };

      let totalDuration = 0;
      let durationCount = 0;

      for (const row of result.rows) {
        const provider = row.provider;
        const status = row.status;
        const count = parseInt(row.count);
        const avgDuration = parseFloat(row.avg_duration || '0');

        if (!stats.byProvider[provider]) {
          stats.byProvider[provider] = { total: 0, successful: 0, failed: 0 };
        }

        stats.byProvider[provider].total += count;
        stats.total += count;

        if (status === 'completed') {
          stats.byProvider[provider].successful += count;
          stats.successful += count;
        } else if (status === 'failed') {
          stats.byProvider[provider].failed += count;
          stats.failed += count;
        }

        if (avgDuration > 0) {
          totalDuration += avgDuration * count;
          durationCount += count;
        }
      }

      stats.averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;

      return stats;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'action_statistics_query_failed',
        error as Error,
        { projectId, timeWindow }
      );

      return {
        total: 0,
        successful: 0,
        failed: 0,
        byProvider: {},
        averageDuration: 0
      };
    }
  }

  /**
   * Clean up old action records (called by maintenance job)
   */
  async cleanupOldActions(): Promise<number> {
    if (!db) return 0;

    try {
      const result = await db.query(`
        DELETE FROM integration_actions
        WHERE completed_at < NOW() - INTERVAL '7 days'
          AND status IN ('completed', 'failed')
      `);

      const deletedCount = result.rowCount || 0;

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Old integration actions cleaned up',
        { deletedCount }
      );

      return deletedCount;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'action_cleanup_failed',
        error as Error
      );

      return 0;
    }
  }

  // Private helper methods

  private async checkIdempotency(idempotencyKey: string): Promise<ActionResult | null> {
    try {
      // Check Redis cache first
      const cached = await this.redis.get(`action:idempotency:${idempotencyKey}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Check database for completed actions
      if (db) {
        const result = await db.query(`
          SELECT id, status, result, error_message, started_at, completed_at
          FROM integration_actions
          WHERE idempotency_key = $1
            AND status IN ('completed', 'failed')
          ORDER BY created_at DESC
          LIMIT 1
        `, [idempotencyKey]);

        if (result.rows.length > 0) {
          const row = result.rows[0];
          const actionResult: ActionResult = {
            id: row.id,
            success: row.status === 'completed',
            message: row.result?.message || row.error_message,
            data: row.result?.data,
            startedAt: new Date(row.started_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            duration: row.completed_at
              ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
              : undefined
          };

          // Cache in Redis for faster future lookups
          await this.cacheIdempotencyResult(idempotencyKey, actionResult);

          return actionResult;
        }
      }

      return null;

    } catch (error) {
      // Log error but don't fail the request
      console.warn('Idempotency check failed:', error);
      return null;
    }
  }

  private checkRateLimit(userId: string, projectId: string): { allowed: boolean; retryAfter?: number } {
    const key = `${userId}:${projectId}`;
    const now = Date.now();
    const window = this.rateLimitCache.get(key);

    if (window) {
      if (now - window.windowStart < this.RATE_LIMIT_WINDOW) {
        if (window.count >= this.RATE_LIMIT_COUNT) {
          const retryAfter = Math.ceil((this.RATE_LIMIT_WINDOW - (now - window.windowStart)) / 1000);
          return { allowed: false, retryAfter };
        }
        window.count++;
      } else {
        // Reset window
        window.windowStart = now;
        window.count = 1;
      }
    } else {
      this.rateLimitCache.set(key, { count: 1, windowStart: now });
    }

    return { allowed: true };
  }

  private async createActionRecord(request: ActionRequest): Promise<ActionRecord> {
    if (!db) throw new Error('Database not configured');

    const result = await db.query(`
      INSERT INTO integration_actions (
        project_id, provider, action, idempotency_key, status, requested_by
      ) VALUES ($1, $2, $3, $4, 'pending', $5)
      RETURNING *
    `, [
      request.projectId,
      request.integrationKey,
      request.actionId,
      request.idempotencyKey,
      request.userId
    ]);

    return this.mapActionRecord(result.rows[0]);
  }

  private async performAction(
    actionRecord: ActionRecord,
    request: ActionRequest
  ): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Update status to processing
      await this.updateActionStatus(actionRecord.id, 'processing');

      // Import and execute the action via the integration status service
      const { IntegrationStatusService } = await import('./integrationStatusService');
      const statusService = IntegrationStatusService.getInstance();

      const context: AdapterContext = {
        projectId: request.projectId,
        userId: request.userId,
        userRole: request.userRole,
        locale: request.locale
      };

      const result = await statusService.executeIntegrationAction(
        context,
        request.integrationKey,
        request.actionId,
        request.idempotencyKey,
        request.parameters
      );

      const duration = Date.now() - startTime;

      return {
        id: actionRecord.id,
        success: result.success,
        message: result.message,
        data: result.data,
        retryAfter: result.retryAfter,
        startedAt: actionRecord.started_at,
        completedAt: new Date(),
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      return {
        id: actionRecord.id,
        success: false,
        message: error.message || 'Action execution failed',
        startedAt: actionRecord.started_at,
        completedAt: new Date(),
        duration
      };
    }
  }

  private async updateActionRecord(actionId: string, result: ActionResult): Promise<void> {
    if (!db) return;

    const status = result.success ? 'completed' : 'failed';
    const resultData = {
      success: result.success,
      message: result.message,
      data: result.data,
      duration: result.duration
    };

    await db.query(`
      UPDATE integration_actions
      SET status = $1,
          result = $2,
          error_message = $3,
          completed_at = $4
      WHERE id = $5
    `, [
      status,
      JSON.stringify(resultData),
      result.success ? null : result.message,
      result.completedAt || new Date(),
      actionId
    ]);
  }

  private async updateActionStatus(actionId: string, status: string): Promise<void> {
    if (!db) return;

    await db.query(`
      UPDATE integration_actions
      SET status = $1
      WHERE id = $2
    `, [status, actionId]);
  }

  private async cacheIdempotencyResult(idempotencyKey: string, result: ActionResult): Promise<void> {
    try {
      const ttl = 24 * 60 * 60; // 24 hours
      await this.redis.setex(
        `action:idempotency:${idempotencyKey}`,
        ttl,
        JSON.stringify(result)
      );
    } catch (error) {
      // Log error but don't fail the request
      console.warn('Failed to cache idempotency result:', error);
    }
  }

  private mapActionRecord(row: any): ActionRecord {
    return {
      id: row.id,
      project_id: row.project_id,
      provider: row.provider,
      action: row.action,
      idempotency_key: row.idempotency_key,
      status: row.status,
      result: row.result || {},
      error_message: row.error_message,
      requested_by: row.requested_by,
      started_at: new Date(row.started_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
      created_at: new Date(row.created_at)
    };
  }

  private getTimeClause(timeWindow: 'hour' | 'day' | 'week'): string {
    switch (timeWindow) {
      case 'hour':
        return "NOW() - INTERVAL '1 hour'";
      case 'day':
        return "NOW() - INTERVAL '1 day'";
      case 'week':
        return "NOW() - INTERVAL '1 week'";
      default:
        return "NOW() - INTERVAL '1 day'";
    }
  }
}