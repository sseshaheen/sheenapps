import { FastifyReply } from 'fastify';
import { EnhancedSSEService, type BaseSSEEvent } from './enhancedSSEService';
import { pool } from './database';
import { unifiedLogger } from './unifiedLogger';

/**
 * Migration SSE Service
 * Extends the existing Enhanced SSE Service for migration-specific events
 * Implements real-time progress updates with backfill support
 */

// =====================================================================
// Migration Event Types
// =====================================================================

export interface MigrationSSEEvent extends BaseSSEEvent {
  event: 'migration.phase_update' | 'migration.metric' | 'migration.log' | 'migration.error' | 'migration.done';
  migrationId: string;
  phase: 'ANALYZE' | 'PLAN' | 'TRANSFORM' | 'VERIFY' | 'DEPLOY';
  progress: number; // 0-100
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  detail?: {
    currentTool?: string | undefined;
    notes?: string | undefined;
    aiTimeConsumed?: number | undefined;
    estimatedTimeRemaining?: number | undefined;
  } | undefined;
}

export interface MigrationPhaseUpdateEvent extends MigrationSSEEvent {
  event: 'migration.phase_update';
  data: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    previousPhase?: string | undefined;
    phaseStartedAt: string;
    tools: string[];
    estimatedDuration: number;
  };
}

export interface MigrationMetricEvent extends MigrationSSEEvent {
  event: 'migration.metric';
  data: {
    metricType: 'ai_time' | 'tool_usage' | 'progress' | 'file_count';
    value: number;
    unit: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    breakdown?: Record<string, any> | undefined;
  };
}

export interface MigrationLogEvent extends MigrationSSEEvent {
  event: 'migration.log';
  data: {
    level: 'info' | 'warning' | 'error';
    message: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    context?: Record<string, any> | undefined;
  };
}

export interface MigrationErrorEvent extends MigrationSSEEvent {
  event: 'migration.error';
  data: {
    errorCode: string;
    errorMessage: string;
    phase: string;
    retryable: boolean;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    errorContext?: Record<string, any> | undefined;
  };
}

export interface MigrationDoneEvent extends MigrationSSEEvent {
  event: 'migration.done';
  data: {
    success: boolean;
    totalDuration: number;
    aiTimeConsumed: number;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    projectId?: string | undefined;
    previewUrl?: string | undefined;
    summary: Record<string, any>;
  };
}

export type MigrationEvent =
  | MigrationPhaseUpdateEvent
  | MigrationMetricEvent
  | MigrationLogEvent
  | MigrationErrorEvent
  | MigrationDoneEvent;

// =====================================================================
// Migration SSE Service
// =====================================================================

export class MigrationSSEService {
  // Removed sequenceCounters - using database ID as sequence to avoid race conditions per expert feedback

  /**
   * Handle SSE connections for migration progress
   */
  static async handleMigrationSSE(
    reply: FastifyReply,
    migrationId: string,
    userId: string,
    lastEventId?: string
  ): Promise<void> {
    // Set up SSE headers
    EnhancedSSEService.setupSSEHeaders(reply, `migration-${migrationId}`);

    // Set up keep-alive
    const keepAliveInterval = EnhancedSSEService.setupKeepAlive(reply);

    try {
      // Verify migration ownership
      const ownershipValid = await this.verifyMigrationOwnership(migrationId, userId);
      if (!ownershipValid) {
        EnhancedSSEService.sendErrorEvent(
          reply,
          'MIGRATION_NOT_FOUND',
          'Migration not found or access denied',
          1
        );
        return;
      }

      // Send connection established event (using temporary seq, will be replaced with database ID)
      const connectionEvent = {
        seq: 0, // Temporary - will be replaced with database-generated ID
        event: 'connection.established',
        timestamp: new Date().toISOString(),
        data: {
          connectionId: `migration-${migrationId}`,
          migrationId
        }
      };
      EnhancedSSEService.sendEvent(reply, connectionEvent as any);

      // Backfill recent events if lastEventId provided
      if (lastEventId) {
        await this.backfillMigrationEvents(reply, migrationId, parseInt(lastEventId) || 0);
      }

      // Handle connection close
      reply.raw.on('close', () => {
        clearInterval(keepAliveInterval);
        unifiedLogger.system('startup', 'info', 'Migration SSE connection closed', {
          migrationId,
          userId
        });
      });

      reply.raw.on('error', (error) => {
        clearInterval(keepAliveInterval);
        unifiedLogger.system('error', 'error', 'Migration SSE connection error', {
          migrationId,
          userId,
          error: error.message
        });
      });

    } catch (error) {
      clearInterval(keepAliveInterval);
      unifiedLogger.system('error', 'error', 'Failed to setup migration SSE', {
        migrationId,
        userId,
        error: (error as Error).message
      });

      EnhancedSSEService.sendErrorEvent(
        reply,
        'SSE_SETUP_ERROR',
        'Failed to setup SSE connection',
        1
      );
    }
  }

  /**
   * Broadcast migration update to connected clients
   */
  static async broadcastMigrationUpdate(
    migrationId: string,
    event: MigrationEvent
  ): Promise<void> {
    try {
      // Store event in database for backfill and get generated ID
      const generatedId = await this.storeMigrationEvent(migrationId, event);

      // Update event with actual database-generated sequence ID
      if (generatedId) {
        event.seq = generatedId;
      }

      // In a real implementation, this would broadcast to all connected clients
      // For now, we'll log the event
      unifiedLogger.system('startup', 'info', 'Migration SSE event broadcasted', {
        migrationId,
        eventType: event.event,
        phase: event.phase,
        progress: event.progress,
        sequenceId: generatedId
      });

      // TODO: Integrate with actual SSE connection manager
      // This would require a connection registry to track active SSE connections

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to broadcast migration update', {
        migrationId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Alias method for backward compatibility with migrationOrchestratorService
   */
  static async broadcastMigrationEvent(
    migrationId: string,
    event: MigrationEvent
  ): Promise<void> {
    return this.broadcastMigrationUpdate(migrationId, event);
  }

  /**
   * Get recent migration events for backfill (cursor-based pagination)
   */
  static async getRecentMigrationEvents(
    migrationId: string,
    sinceId: number = 0,
    limit: number = 50
  ): Promise<MigrationEvent[]> {
    if (!pool) {
      return [];
    }

    try {
      // Get migration project ID
      const projectQuery = `
        SELECT mp.id as project_id
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1
      `;

      const projectResult = await pool.query(projectQuery, [migrationId]);

      if (projectResult.rows.length === 0) {
        return [];
      }

      const projectId = projectResult.rows[0].project_id;

      // Get events with cursor-based pagination
      const eventsQuery = `
        SELECT id, seq, ts, type, payload
        FROM migration_events
        WHERE migration_project_id = $1
          AND id > $2
        ORDER BY id ASC
        LIMIT $3
      `;

      const eventsResult = await pool.query(eventsQuery, [projectId, sinceId, limit]);

      return eventsResult.rows.map(row => ({
        seq: row.seq,
        event: row.type,
        timestamp: new Date(row.ts).toISOString(),
        migrationId,
        ...row.payload
      })) as MigrationEvent[];

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to get recent migration events', {
        migrationId,
        sinceId,
        error: (error as Error).message
      });

      return [];
    }
  }

  /**
   * Create phase update event
   */
  static createPhaseUpdateEvent(
    migrationId: string,
    phase: MigrationSSEEvent['phase'],
    progress: number,
    previousPhase?: string,
    tools: string[] = [],
    estimatedDuration: number = 0
  ): MigrationPhaseUpdateEvent {
    return {
      seq: 0, // Temporary - will be replaced with database-generated ID
      event: 'migration.phase_update',
      timestamp: new Date().toISOString(),
      migrationId,
      phase,
      progress,
      data: {
        previousPhase,
        phaseStartedAt: new Date().toISOString(),
        tools,
        estimatedDuration
      }
    };
  }

  /**
   * Create metric event
   */
  static createMetricEvent(
    migrationId: string,
    phase: MigrationSSEEvent['phase'],
    progress: number,
    metricType: 'ai_time' | 'tool_usage' | 'progress' | 'file_count',
    value: number,
    unit: string,
    breakdown?: Record<string, any>
  ): MigrationMetricEvent {
    return {
      seq: 0, // Temporary - will be replaced with database-generated ID
      event: 'migration.metric',
      timestamp: new Date().toISOString(),
      migrationId,
      phase,
      progress,
      data: {
        metricType,
        value,
        unit,
        breakdown
      }
    };
  }

  /**
   * Create log event
   */
  static createLogEvent(
    migrationId: string,
    phase: MigrationSSEEvent['phase'],
    progress: number,
    level: 'info' | 'warning' | 'error',
    message: string,
    context?: Record<string, any>
  ): MigrationLogEvent {
    return {
      seq: 0, // Temporary - will be replaced with database-generated ID
      event: 'migration.log',
      timestamp: new Date().toISOString(),
      migrationId,
      phase,
      progress,
      data: {
        level,
        message,
        context
      }
    };
  }

  /**
   * Create error event
   */
  static createErrorEvent(
    migrationId: string,
    phase: MigrationSSEEvent['phase'],
    progress: number,
    errorCode: string,
    errorMessage: string,
    retryable: boolean = false,
    errorContext?: Record<string, any>
  ): MigrationErrorEvent {
    return {
      seq: 0, // Temporary - will be replaced with database-generated ID
      event: 'migration.error',
      timestamp: new Date().toISOString(),
      migrationId,
      phase,
      progress,
      data: {
        errorCode,
        errorMessage,
        phase,
        retryable,
        errorContext
      }
    };
  }

  /**
   * Create completion event
   */
  static createDoneEvent(
    migrationId: string,
    success: boolean,
    totalDuration: number,
    aiTimeConsumed: number,
    projectId?: string,
    previewUrl?: string,
    summary: Record<string, any> = {}
  ): MigrationDoneEvent {
    return {
      seq: 0, // Temporary - will be replaced with database-generated ID
      event: 'migration.done',
      timestamp: new Date().toISOString(),
      migrationId,
      phase: 'DEPLOY', // Final phase
      progress: 100,
      data: {
        success,
        totalDuration,
        aiTimeConsumed,
        projectId,
        previewUrl,
        summary
      }
    };
  }

  // =====================================================================
  // PRIVATE HELPER METHODS
  // =====================================================================

  // Removed getNextSequence() - now using database-generated IDs to eliminate race conditions

  private static async verifyMigrationOwnership(
    migrationId: string,
    userId: string
  ): Promise<boolean> {
    if (!pool) {
      return false;
    }

    const query = `
      SELECT 1
      FROM migration_projects mp
      JOIN migration_jobs mj ON mj.migration_project_id = mp.id
      WHERE mj.id = $1 AND mp.user_id = $2
    `;

    const result = await pool.query(query, [migrationId, userId]);
    return result.rows.length > 0;
  }

  private static async storeMigrationEvent(
    migrationId: string,
    event: MigrationEvent
  ): Promise<number | null> {
    if (!pool) {
      return null;
    }

    try {
      // Get migration project ID
      const projectQuery = `
        SELECT mp.id as project_id
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1
      `;

      const projectResult = await pool.query(projectQuery, [migrationId]);

      if (projectResult.rows.length === 0) {
        return null;
      }

      const projectId = projectResult.rows[0].project_id;

      // Store event using database-generated ID as sequence (race-condition safe)
      const insertQuery = `
        INSERT INTO migration_events (migration_project_id, ts, type, payload)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;

      const result = await pool.query(insertQuery, [
        projectId,
        new Date(event.timestamp),
        event.event,
        JSON.stringify({
          phase: event.phase,
          progress: event.progress,
          detail: event.detail,
          data: event.data
        })
      ]);

      const generatedId = result.rows[0]?.id;
      return generatedId; // Return the database-generated ID

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to store migration event', {
        migrationId,
        eventType: event.event,
        error: (error as Error).message
      });
      return null;
    }
  }

  private static async backfillMigrationEvents(
    reply: FastifyReply,
    migrationId: string,
    sinceId: number
  ): Promise<void> {
    try {
      const events = await this.getRecentMigrationEvents(migrationId, sinceId, 50);

      for (const event of events) {
        EnhancedSSEService.sendEvent(reply, event as any);
      }

      if (events.length > 0) {
        unifiedLogger.system('startup', 'info', 'Migration SSE backfill sent', {
          migrationId,
          eventCount: events.length,
          sinceId
        });
      }

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to backfill migration events', {
        migrationId,
        sinceId,
        error: (error as Error).message
      });
    }
  }
}

// Export singleton instance
export const migrationSSEService = MigrationSSEService;