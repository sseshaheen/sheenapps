import { pool } from './database';
import { unifiedLogger } from './unifiedLogger';
import { randomUUID } from 'crypto';

/**
 * Migration Analytics Service
 * Tracks migration success metrics, generates detailed reports,
 * and provides performance monitoring for optimization
 *
 * Implements acceptance criteria:
 * - At least 5 key events emitted (start, step, retry, success, failure) with request_id/trace_id
 * - Roll-up endpoint/report shows last 7 days counts, P95 durations, success %
 * - Feature flag ANALYTICS_EMIT=on/off for dark-launch
 */

// Analytics Event Types
export type AnalyticsEventType = 'started' | 'step_completed' | 'retry' | 'completed' | 'failed';

export interface AnalyticsEvent {
  migrationProjectId: string;
  eventType: AnalyticsEventType;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  requestId?: string | undefined;
  traceId?: string | undefined;
  stepName?: string | undefined;
  duration?: number | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface TraceContext {
  requestId: string;
  traceId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  parentSpanId?: string | undefined;
}

export interface AnalyticsRollupReport {
  timeRange: { from: Date; to: Date };
  totalEvents: number;
  eventCounts: Record<AnalyticsEventType, number>;
  migrationMetrics: {
    totalMigrations: number;
    successfulMigrations: number;
    failedMigrations: number;
    successRate: number;
    durationP95Ms: number;
    averageDurationMs: number;
  };
  stepMetrics: Array<{
    stepName: string;
    totalExecutions: number;
    successRate: number;
    durationP95Ms: number;
  }>;
  retryAnalysis: {
    totalRetries: number;
    retryRate: number;
    retrySuccessRate: number;
  };
}

export interface MigrationMetrics {
  totalMigrations: number;
  successfulMigrations: number;
  failedMigrations: number;
  successRate: number;
  averageDuration: number; // in seconds
  averageAITimeConsumed: number; // in seconds
  totalAITimeConsumed: number;
  retryRate: number;
  mostCommonFailureReason: string;
}

export interface MigrationReport {
  migrationId: string;
  userId: string;
  sourceUrl: string;
  status: string;
  stage: string;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number; // in seconds
  aiTimeConsumed: number;
  retryCount: number;
  failureReason?: string;
  targetProjectId?: string;
  phases: Array<{
    name: string;
    status: string;
    duration?: number;
    aiTimeUsed?: number;
    toolsUsed: string[];
  }>;
  toolUsage: Array<{
    tool: string;
    agent: string;
    costTokens: number;
    executedAt: Date;
  }>;
  userBrief: any;
  verificationMethod?: string;
  builderCompatibilityScore?: number;
}

export interface PerformanceReport {
  timeRange: { from: Date; to: Date };
  totalMigrations: number;
  performanceMetrics: {
    averageDurationBySize: Record<'small' | 'medium' | 'large', number>;
    averageAITimeByPhase: Record<string, number>;
    toolPerformance: Array<{
      tool: string;
      avgDuration: number;
      successRate: number;
      usageCount: number;
    }>;
    phasePerformance: Array<{
      phase: string;
      avgDuration: number;
      successRate: number;
      avgAITime: number;
    }>;
  };
  costAnalysis: {
    totalCostUsd: number;
    averageCostPerMigration: number;
    costByPhase: Record<string, number>;
    costEfficiencyTrend: Array<{
      date: string;
      avgCostPerMigration: number;
      avgDuration: number;
    }>;
  };
  qualityMetrics: {
    builderCompatibilityScores: {
      average: number;
      distribution: Record<string, number>; // score ranges
    };
    retryAnalysis: {
      retryRate: number;
      retryReasons: Record<string, number>;
      retrySuccessRate: number;
    };
  };
}

export interface UserSatisfactionMetrics {
  satisfactionScore: number; // 1-5 scale
  completionRate: number;
  timeToFirstSuccess: number;
  userFeedback: Array<{
    migrationId: string;
    rating: number;
    feedback: string;
    createdAt: Date;
  }>;
}

export class MigrationAnalyticsService {

  /**
   * Track migration success metrics
   */
  async trackMigrationMetrics(
    migrationId: string,
    eventType: 'started' | 'completed' | 'failed' | 'retry' | 'cancelled',
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!pool) {
      return;
    }

    try {
      // Insert analytics event
      const insertQuery = `
        INSERT INTO migration_analytics_events (
          migration_project_id, event_type, metadata, created_at
        )
        SELECT mp.id, $2, $3, NOW()
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1
      `;

      await pool.query(insertQuery, [migrationId, eventType, JSON.stringify(metadata || {})]);

      // Update aggregate metrics based on event type
      await this.updateAggregateMetrics(migrationId, eventType, metadata);

      unifiedLogger.system('startup', 'info', 'Migration analytics event tracked', {
        migrationId,
        eventType,
        metadata
      });

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to track migration metrics', {
        migrationId,
        eventType,
        error: (error as Error).message
      });
    }
  }

  /**
   * Enhanced analytics event tracking with trace integration
   * Implements acceptance criteria: "At least 5 key events emitted (start, step, retry, success, failure) with request_id/trace_id"
   */
  async trackAnalyticsEvent(event: AnalyticsEvent, traceContext?: TraceContext): Promise<void> {
    // Feature flag check for dark-launch capability
    const analyticsEnabled = process.env.ANALYTICS_EMIT?.toLowerCase() === 'on' ||
                             process.env.ANALYTICS_EMIT !== 'off'; // Default enabled

    if (!analyticsEnabled) {
      return;
    }

    if (!pool) {
      return;
    }

    try {
      const startTime = Date.now();

      // Enhanced metadata with trace information
      const enrichedMetadata = {
        ...event.metadata,
        requestId: event.requestId || traceContext?.requestId || randomUUID(),
        traceId: event.traceId || traceContext?.traceId || randomUUID(),
        parentSpanId: traceContext?.parentSpanId,
        stepName: event.stepName,
        duration: event.duration,
        timestamp: new Date().toISOString(),
        service: 'migration-analytics',
        environment: process.env.NODE_ENV || 'development',
        region: process.env.AWS_REGION || 'us-east-1'
      };

      // Insert enhanced analytics event
      const insertQuery = `
        INSERT INTO migration_analytics_events (
          migration_project_id, event_type, metadata, created_at
        )
        VALUES ($1, $2, $3, NOW())
      `;

      await pool.query(insertQuery, [
        event.migrationProjectId,
        event.eventType,
        JSON.stringify(enrichedMetadata)
      ]);

      const trackingDuration = Date.now() - startTime;

      // Log with structured trace information (PII-safe)
      unifiedLogger.system('analytics', 'info', 'Enhanced analytics event tracked', {
        migrationProjectId: event.migrationProjectId,
        eventType: event.eventType,
        requestId: enrichedMetadata.requestId,
        traceId: enrichedMetadata.traceId,
        stepName: event.stepName,
        duration: event.duration,
        trackingDurationMs: trackingDuration,
        metadataKeys: Object.keys(event.metadata || {})
      });

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to track enhanced analytics event', {
        migrationProjectId: event.migrationProjectId,
        eventType: event.eventType,
        error: (error as Error).message,
        requestId: event.requestId,
        traceId: event.traceId
      });
    }
  }

  /**
   * Generate analytics rollup report for last 7 days
   * Implements acceptance criteria: "Roll-up endpoint/report shows last 7 days counts, P95 durations, success %"
   */
  async generateAnalyticsRollup(timeRange?: { from: Date; to: Date }): Promise<AnalyticsRollupReport> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const to = timeRange?.to || new Date();
    const from = timeRange?.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    try {
      const startTime = performance.now();

      // Get comprehensive analytics in parallel for performance
      const [
        eventCounts,
        migrationMetrics,
        stepMetrics,
        retryAnalysis
      ] = await Promise.all([
        this.getEventCounts(from, to),
        this.getMigrationDurationMetrics(from, to),
        this.getStepPerformanceMetrics(from, to),
        this.getRetryAnalysisMetrics(from, to)
      ]);

      const duration = performance.now() - startTime;

      const report: AnalyticsRollupReport = {
        timeRange: { from, to },
        totalEvents: Object.values(eventCounts).reduce((sum, count) => sum + count, 0),
        eventCounts,
        migrationMetrics,
        stepMetrics,
        retryAnalysis
      };

      unifiedLogger.system('analytics', 'info', 'Analytics rollup generated', {
        timeRange: { from: from.toISOString(), to: to.toISOString() },
        totalEvents: report.totalEvents,
        totalMigrations: report.migrationMetrics.totalMigrations,
        successRate: report.migrationMetrics.successRate,
        durationP95Ms: report.migrationMetrics.durationP95Ms,
        generationDurationMs: Math.round(duration)
      });

      return report;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to generate analytics rollup', {
        timeRange: { from: from.toISOString(), to: to.toISOString() },
        error: (error as Error).message
      });

      // Return safe fallback
      return {
        timeRange: { from, to },
        totalEvents: 0,
        eventCounts: {
          'started': 0,
          'step_completed': 0,
          'retry': 0,
          'completed': 0,
          'failed': 0
        },
        migrationMetrics: {
          totalMigrations: 0,
          successfulMigrations: 0,
          failedMigrations: 0,
          successRate: 0,
          durationP95Ms: 0,
          averageDurationMs: 0
        },
        stepMetrics: [],
        retryAnalysis: {
          totalRetries: 0,
          retryRate: 0,
          retrySuccessRate: 0
        }
      };
    }
  }

  /**
   * Generate detailed migration report
   */
  async generateMigrationReport(migrationId: string): Promise<MigrationReport | null> {
    if (!pool) {
      return null;
    }

    try {
      // Get main migration data
      const migrationQuery = `
        SELECT
          mj.id,
          mp.user_id,
          mp.source_url,
          mj.status,
          mj.stage,
          mj.progress,
          mj.created_at,
          mj.started_at,
          mj.completed_at,
          mp.ai_time_consumed_seconds,
          mj.retry_count,
          mj.error_message,
          mp.target_project_id,
          mp.verification_method
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1
      `;

      const migrationResult = await pool.query(migrationQuery, [migrationId]);

      if (migrationResult.rows.length === 0) {
        return null;
      }

      const migration = migrationResult.rows[0];

      // Calculate duration
      const duration = migration.completed_at && migration.started_at ?
        Math.round((new Date(migration.completed_at).getTime() - new Date(migration.started_at).getTime()) / 1000) :
        undefined;

      // Get phases data
      const phasesQuery = `
        SELECT
          phase_name,
          status,
          started_at,
          completed_at,
          output,
          model,
          tool_contract_version
        FROM migration_phases
        WHERE migration_project_id = $1
        ORDER BY created_at
      `;

      const phasesResult = await pool.query(phasesQuery, [migration.migration_project_id]);

      const phases = await Promise.all(phasesResult.rows.map(async (phase: { phase_name: string; status: string; started_at: string | null; completed_at: string | null }) => {
        const phaseData: { name: string; status: string; duration?: number; aiTimeUsed?: number; toolsUsed: string[] } = {
          name: phase.phase_name,
          status: phase.status,
          toolsUsed: [] // TODO: Extract from phase output or tool calls
        };
        if (phase.completed_at && phase.started_at) {
          phaseData.duration = Math.round((new Date(phase.completed_at).getTime() - new Date(phase.started_at).getTime()) / 1000);
        }
        const aiTime = await this.calculatePhaseAITime(migration.migration_project_id, phase.phase_name);
        if (aiTime > 0) {
          phaseData.aiTimeUsed = aiTime;
        }
        return phaseData;
      }));

      // Get tool usage data
      const toolsQuery = `
        SELECT
          tool,
          agent,
          cost_tokens,
          created_at
        FROM migration_tool_calls
        WHERE migration_project_id = $1
        ORDER BY created_at
      `;

      const toolsResult = await pool.query(toolsQuery, [migration.migration_project_id]);

      const toolUsage = toolsResult.rows.map(tool => ({
        tool: tool.tool,
        agent: tool.agent,
        costTokens: tool.cost_tokens || 0,
        executedAt: new Date(tool.created_at)
      }));

      // Get user brief
      const briefQuery = `
        SELECT
          goals,
          style_preferences,
          framework_preferences,
          content_tone,
          non_negotiables,
          risk_appetite,
          custom_instructions
        FROM migration_user_brief
        WHERE migration_project_id = $1
      `;

      const briefResult = await pool.query(briefQuery, [migration.migration_project_id]);
      const userBrief = briefResult.rows.length > 0 ? briefResult.rows[0] : {};

      // TODO: Get builder compatibility score from validation results

      const report: MigrationReport = {
        migrationId: migration.id,
        userId: migration.user_id,
        sourceUrl: migration.source_url,
        status: migration.status,
        stage: migration.stage,
        progress: migration.progress || 0,
        createdAt: new Date(migration.created_at),
        aiTimeConsumed: migration.ai_time_consumed_seconds || 0,
        retryCount: migration.retry_count || 0,
        phases,
        toolUsage,
        userBrief,
      };
      if (migration.started_at) {
        report.startedAt = new Date(migration.started_at);
      }
      if (migration.completed_at) {
        report.completedAt = new Date(migration.completed_at);
      }
      if (duration !== undefined) {
        report.duration = duration;
      }
      if (migration.error_message) {
        report.failureReason = migration.error_message;
      }
      if (migration.target_project_id) {
        report.targetProjectId = migration.target_project_id;
      }
      if (migration.verification_method) {
        report.verificationMethod = migration.verification_method;
      }

      return report;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to generate migration report', {
        migrationId,
        error: (error as Error).message
      });

      return null;
    }
  }

  /**
   * Monitor migration performance and costs
   */
  async analyzeMigrationPerformance(
    from: Date,
    to: Date,
    filters?: {
      userId?: string;
      status?: string;
      stage?: string;
    }
  ): Promise<PerformanceReport> {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      const whereClause = this.buildWhereClause(filters);
      const params: any[] = [from, to];
      let paramIndex = 3;

      if (filters?.userId) params.push(filters.userId);
      if (filters?.status) params.push(filters.status);
      if (filters?.stage) params.push(filters.stage);

      // Get overall metrics
      const overallQuery = `
        SELECT
          COUNT(*) as total_migrations,
          AVG(EXTRACT(EPOCH FROM (mj.completed_at - mj.started_at))) as avg_duration,
          AVG(mp.ai_time_consumed_seconds) as avg_ai_time,
          SUM(mp.ai_time_consumed_seconds) as total_ai_time
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.created_at BETWEEN $1 AND $2 ${whereClause}
      `;

      const overallResult = await pool.query(overallQuery, params);
      const overall = overallResult.rows[0];

      // Get performance by phase
      const phaseQuery = `
        SELECT
          mp_phase.phase_name,
          AVG(EXTRACT(EPOCH FROM (mp_phase.completed_at - mp_phase.started_at))) as avg_duration,
          COUNT(*) FILTER (WHERE mp_phase.status = 'completed') as success_count,
          COUNT(*) as total_count
        FROM migration_phases mp_phase
        JOIN migration_projects mp ON mp.id = mp_phase.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.created_at BETWEEN $1 AND $2 ${whereClause}
        GROUP BY mp_phase.phase_name
      `;

      const phaseResult = await pool.query(phaseQuery, params);

      const phasePerformance = await Promise.all(phaseResult.rows.map(async (row) => ({
        phase: row.phase_name,
        avgDuration: Math.round(parseFloat(row.avg_duration) || 0),
        successRate: row.total_count > 0 ?
          Math.round((parseInt(row.success_count) / parseInt(row.total_count)) * 100) : 0,
        avgAITime: await this.calculateAvgPhaseAITime(row.phase_name, from, to, filters)
      })));

      // Get tool performance
      const toolQuery = `
        SELECT
          mtc.tool,
          AVG(EXTRACT(EPOCH FROM (mtc.created_at - lag(mtc.created_at) OVER (ORDER BY mtc.created_at)))) as avg_duration,
          COUNT(*) as usage_count,
          COUNT(*) FILTER (WHERE mtc.result_meta->>'success' = 'true') as success_count
        FROM migration_tool_calls mtc
        JOIN migration_projects mp ON mp.id = mtc.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.created_at BETWEEN $1 AND $2 ${whereClause}
        GROUP BY mtc.tool
        HAVING COUNT(*) > 5
        ORDER BY usage_count DESC
      `;

      const toolResult = await pool.query(toolQuery, params);

      const toolPerformance = toolResult.rows.map(row => ({
        tool: row.tool,
        avgDuration: Math.round(parseFloat(row.avg_duration) || 0),
        successRate: row.usage_count > 0 ?
          Math.round((parseInt(row.success_count) / parseInt(row.usage_count)) * 100) : 0,
        usageCount: parseInt(row.usage_count)
      }));

      const report: PerformanceReport = {
        timeRange: { from, to },
        totalMigrations: parseInt(overall.total_migrations) || 0,
        performanceMetrics: {
          averageDurationBySize: {
            small: 0, // TODO: Implement size detection and tracking
            medium: 0,
            large: 0
          },
          averageAITimeByPhase: {},
          toolPerformance,
          phasePerformance
        },
        costAnalysis: {
          totalCostUsd: await this.calculateTotalAITimeCost(from, to, filters),
          averageCostPerMigration: 0,
          costByPhase: {},
          costEfficiencyTrend: []
        },
        qualityMetrics: {
          builderCompatibilityScores: {
            average: 0, // TODO: Implement builder compatibility score tracking
            distribution: {}
          },
          retryAnalysis: {
            retryRate: 0, // TODO: Calculate retry rate
            retryReasons: {},
            retrySuccessRate: 0
          }
        }
      };

      return report;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to analyze migration performance', {
        timeRange: { from, to },
        filters,
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Get aggregate migration metrics
   */
  async getMigrationMetrics(
    timeRange?: { from: Date; to: Date },
    userId?: string
  ): Promise<MigrationMetrics> {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      let whereClause = '';
      const params: any[] = [];

      if (timeRange) {
        whereClause += ' WHERE mj.created_at BETWEEN $1 AND $2';
        params.push(timeRange.from, timeRange.to);
      }

      if (userId) {
        whereClause += timeRange ? ' AND' : ' WHERE';
        whereClause += ` mp.user_id = $${params.length + 1}`;
        params.push(userId);
      }

      const metricsQuery = `
        SELECT
          COUNT(*) as total_migrations,
          COUNT(*) FILTER (WHERE mj.status = 'completed') as successful_migrations,
          COUNT(*) FILTER (WHERE mj.status = 'failed') as failed_migrations,
          AVG(EXTRACT(EPOCH FROM (mj.completed_at - mj.started_at))) as avg_duration,
          AVG(mp.ai_time_consumed_seconds) as avg_ai_time,
          SUM(mp.ai_time_consumed_seconds) as total_ai_time,
          AVG(CASE WHEN mj.retry_count > 0 THEN 1 ELSE 0 END) as retry_rate
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        ${whereClause}
      `;

      const result = await pool.query(metricsQuery, params);
      const row = result.rows[0];

      const totalMigrations = parseInt(row.total_migrations) || 0;
      const successfulMigrations = parseInt(row.successful_migrations) || 0;
      const failedMigrations = parseInt(row.failed_migrations) || 0;

      // Get most common failure reason
      const failureQuery = `
        SELECT
          mj.error_message,
          COUNT(*) as count
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.status = 'failed' AND mj.error_message IS NOT NULL
        ${timeRange ? 'AND mj.created_at BETWEEN $1 AND $2' : ''}
        ${userId ? `AND mp.user_id = $${timeRange ? '3' : '1'}` : ''}
        GROUP BY mj.error_message
        ORDER BY count DESC
        LIMIT 1
      `;

      const failureResult = await pool.query(failureQuery, params);
      const mostCommonFailureReason = failureResult.rows.length > 0 ?
        failureResult.rows[0].error_message : 'No failures';

      const metrics: MigrationMetrics = {
        totalMigrations,
        successfulMigrations,
        failedMigrations,
        successRate: totalMigrations > 0 ?
          Math.round((successfulMigrations / totalMigrations) * 100) : 0,
        averageDuration: Math.round(parseFloat(row.avg_duration) || 0),
        averageAITimeConsumed: Math.round(parseFloat(row.avg_ai_time) || 0),
        totalAITimeConsumed: parseInt(row.total_ai_time) || 0,
        retryRate: Math.round((parseFloat(row.retry_rate) || 0) * 100),
        mostCommonFailureReason
      };

      return metrics;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to get migration metrics', {
        timeRange,
        userId,
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Track user satisfaction metrics
   */
  async trackUserSatisfaction(
    migrationId: string,
    rating: number,
    feedback?: string
  ): Promise<void> {
    if (!pool) {
      return;
    }

    try {
      const insertQuery = `
        INSERT INTO migration_user_feedback (
          migration_project_id, rating, feedback, created_at
        )
        SELECT mp.id, $2, $3, NOW()
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1
        ON CONFLICT (migration_project_id)
        DO UPDATE SET
          rating = $2,
          feedback = $3,
          updated_at = NOW()
      `;

      await pool.query(insertQuery, [migrationId, rating, feedback]);

      unifiedLogger.system('startup', 'info', 'User satisfaction tracked', {
        migrationId,
        rating,
        hasFeedback: !!feedback
      });

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to track user satisfaction', {
        migrationId,
        rating,
        error: (error as Error).message
      });
    }
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private async updateAggregateMetrics(
    migrationId: string,
    eventType: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Update daily/weekly/monthly aggregate tables
    // This would be implemented based on specific analytics requirements
    try {
      const insertQuery = `
        INSERT INTO migration_metrics_daily (
          date, total_migrations, successful_migrations, failed_migrations, total_ai_time
        ) VALUES (CURRENT_DATE, 0, 0, 0, 0)
        ON CONFLICT (date) DO UPDATE SET
          total_migrations = migration_metrics_daily.total_migrations +
            CASE WHEN $1 = 'started' THEN 1 ELSE 0 END,
          successful_migrations = migration_metrics_daily.successful_migrations +
            CASE WHEN $1 = 'completed' THEN 1 ELSE 0 END,
          failed_migrations = migration_metrics_daily.failed_migrations +
            CASE WHEN $1 = 'failed' THEN 1 ELSE 0 END,
          total_ai_time = migration_metrics_daily.total_ai_time +
            COALESCE(($2::jsonb->>'aiTimeConsumed')::integer, 0)
      `;

      if (pool) {
        await pool.query(insertQuery, [eventType, JSON.stringify(metadata || {})]);
      }

    } catch (error) {
      // Log but don't fail - aggregate metrics are not critical
      unifiedLogger.system('warning', 'warn', 'Failed to update aggregate metrics', {
        migrationId,
        eventType,
        error: (error as Error).message
      });
    }
  }

  private buildWhereClause(filters?: {
    userId?: string;
    status?: string;
    stage?: string;
  }): string {
    const conditions: string[] = [];

    if (filters?.userId) {
      conditions.push('mp.user_id = $3');
    }

    if (filters?.status) {
      const paramIndex = filters.userId ? 4 : 3;
      conditions.push(`mj.status = $${paramIndex}`);
    }

    if (filters?.stage) {
      const paramIndex = (filters.userId ? 1 : 0) + (filters.status ? 1 : 0) + 3;
      conditions.push(`mj.stage = $${paramIndex}`);
    }

    return conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
  }

  // ============================================================================
  // ANALYTICS ROLLUP HELPER METHODS
  // ============================================================================

  /**
   * Get event counts by type for analytics rollup
   */
  private async getEventCounts(from: Date, to: Date): Promise<Record<AnalyticsEventType, number>> {
    const query = `
      SELECT
        event_type,
        COUNT(*) as count
      FROM migration_analytics_events
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY event_type
    `;

    if (!pool) {
      throw new Error('Database pool not available');
    }
    const result = await pool.query(query, [from, to]);

    const eventCounts: Record<AnalyticsEventType, number> = {
      'started': 0,
      'step_completed': 0,
      'retry': 0,
      'completed': 0,
      'failed': 0
    };

    result.rows.forEach(row => {
      if (row.event_type in eventCounts) {
        eventCounts[row.event_type as AnalyticsEventType] = parseInt(row.count, 10);
      }
    });

    return eventCounts;
  }

  /**
   * Get migration duration metrics with P95 calculations
   */
  private async getMigrationDurationMetrics(from: Date, to: Date): Promise<{
    totalMigrations: number;
    successfulMigrations: number;
    failedMigrations: number;
    successRate: number;
    durationP95Ms: number;
    averageDurationMs: number;
  }> {
    const query = `
      WITH migration_durations AS (
        SELECT
          mp.id as migration_project_id,
          started.created_at as started_at,
          COALESCE(completed.created_at, failed.created_at) as ended_at,
          CASE
            WHEN completed.created_at IS NOT NULL THEN 'completed'
            WHEN failed.created_at IS NOT NULL THEN 'failed'
            ELSE 'in_progress'
          END as final_status,
          CASE
            WHEN COALESCE(completed.created_at, failed.created_at) IS NOT NULL THEN
              EXTRACT(EPOCH FROM (COALESCE(completed.created_at, failed.created_at) - started.created_at)) * 1000
            ELSE NULL
          END as duration_ms
        FROM migration_projects mp
        LEFT JOIN migration_analytics_events started ON mp.id = started.migration_project_id AND started.event_type = 'started'
        LEFT JOIN migration_analytics_events completed ON mp.id = completed.migration_project_id AND completed.event_type = 'completed'
        LEFT JOIN migration_analytics_events failed ON mp.id = failed.migration_project_id AND failed.event_type = 'failed'
        WHERE started.created_at BETWEEN $1 AND $2
      )
      SELECT
        COUNT(*) as total_migrations,
        COUNT(*) FILTER (WHERE final_status = 'completed') as successful_migrations,
        COUNT(*) FILTER (WHERE final_status = 'failed') as failed_migrations,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as duration_p95_ms,
        AVG(duration_ms) as avg_duration_ms
      FROM migration_durations
      WHERE duration_ms IS NOT NULL
    `;

    if (!pool) {
      throw new Error('Database pool not available');
    }
    const result = await pool.query(query, [from, to]);
    const row = result.rows[0];

    if (!row || !row.total_migrations) {
      return {
        totalMigrations: 0,
        successfulMigrations: 0,
        failedMigrations: 0,
        successRate: 0,
        durationP95Ms: 0,
        averageDurationMs: 0
      };
    }

    const totalMigrations = parseInt(row.total_migrations, 10);
    const successfulMigrations = parseInt(row.successful_migrations || '0', 10);
    const failedMigrations = parseInt(row.failed_migrations || '0', 10);

    return {
      totalMigrations,
      successfulMigrations,
      failedMigrations,
      successRate: totalMigrations > 0 ? Math.round((successfulMigrations / totalMigrations) * 100) : 0,
      durationP95Ms: Math.round(parseFloat(row.duration_p95_ms || '0')),
      averageDurationMs: Math.round(parseFloat(row.avg_duration_ms || '0'))
    };
  }

  /**
   * Get step performance metrics for analytics rollup
   */
  private async getStepPerformanceMetrics(from: Date, to: Date): Promise<Array<{
    stepName: string;
    totalExecutions: number;
    successRate: number;
    durationP95Ms: number;
  }>> {
    const query = `
      SELECT
        metadata->>'stepName' as step_name,
        COUNT(*) as total_executions,
        COUNT(*) FILTER (WHERE event_type = 'step_completed') as successful_executions,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY CAST(metadata->>'duration' AS INTEGER)) as duration_p95_ms
      FROM migration_analytics_events
      WHERE created_at BETWEEN $1 AND $2
        AND event_type IN ('step_completed', 'failed')
        AND metadata->>'stepName' IS NOT NULL
      GROUP BY metadata->>'stepName'
      HAVING COUNT(*) >= 5
      ORDER BY total_executions DESC
    `;

    if (!pool) {
      throw new Error('Database pool not available');
    }
    const result = await pool.query(query, [from, to]);

    return result.rows.map(row => ({
      stepName: row.step_name,
      totalExecutions: parseInt(row.total_executions, 10),
      successRate: row.total_executions > 0 ?
        Math.round((parseInt(row.successful_executions || '0', 10) / parseInt(row.total_executions, 10)) * 100) : 0,
      durationP95Ms: Math.round(parseFloat(row.duration_p95_ms || '0'))
    }));
  }

  /**
   * Get retry analysis metrics for analytics rollup
   */
  private async getRetryAnalysisMetrics(from: Date, to: Date): Promise<{
    totalRetries: number;
    retryRate: number;
    retrySuccessRate: number;
  }> {
    const query = `
      WITH retry_analysis AS (
        SELECT
          migration_project_id,
          COUNT(*) FILTER (WHERE event_type = 'retry') as retry_count,
          COUNT(*) FILTER (WHERE event_type = 'started') as start_count,
          MAX(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) as eventually_succeeded
        FROM migration_analytics_events
        WHERE created_at BETWEEN $1 AND $2
          AND event_type IN ('started', 'retry', 'completed')
        GROUP BY migration_project_id
      )
      SELECT
        SUM(retry_count) as total_retries,
        COUNT(*) as total_migrations_with_activity,
        SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) as migrations_with_retries,
        SUM(CASE WHEN retry_count > 0 AND eventually_succeeded = 1 THEN 1 ELSE 0 END) as successful_after_retry
      FROM retry_analysis
    `;

    if (!pool) {
      throw new Error('Database pool not available');
    }
    const result = await pool.query(query, [from, to]);
    const row = result.rows[0];

    if (!row) {
      return {
        totalRetries: 0,
        retryRate: 0,
        retrySuccessRate: 0
      };
    }

    const totalRetries = parseInt(row.total_retries || '0', 10);
    const totalMigrations = parseInt(row.total_migrations_with_activity || '0', 10);
    const migrationsWithRetries = parseInt(row.migrations_with_retries || '0', 10);
    const successfulAfterRetry = parseInt(row.successful_after_retry || '0', 10);

    return {
      totalRetries,
      retryRate: totalMigrations > 0 ? Math.round((migrationsWithRetries / totalMigrations) * 100) : 0,
      retrySuccessRate: migrationsWithRetries > 0 ? Math.round((successfulAfterRetry / migrationsWithRetries) * 100) : 0
    };
  }

  // ============================================================================
  // AI TIME CALCULATION HELPER METHODS
  // ============================================================================

  /**
   * Calculate AI time used for a specific migration phase
   */
  private async calculatePhaseAITime(migrationProjectId: string, phaseName: string): Promise<number> {
    if (!pool) {
      return 0;
    }

    try {
      // Query AI time consumption records for this migration and phase
      const query = `
        SELECT SUM(ai_time_consumed) as total_ai_time
        FROM ai_time_records
        WHERE migration_project_id = $1
          AND phase = $2
          AND ai_time_consumed > 0
      `;

      const result = await pool.query(query, [migrationProjectId, phaseName]);
      const totalAITime = parseFloat(result.rows[0]?.total_ai_time || '0');

      return Math.round(totalAITime);

    } catch (error) {
      console.error(`[Migration Analytics] Failed to calculate AI time for phase ${phaseName}:`, error);
      return 0;
    }
  }

  /**
   * Calculate average AI time per phase across migrations
   */
  private async calculateAvgPhaseAITime(
    phaseName: string,
    from: Date,
    to: Date,
    filters?: { userId?: string; status?: string; stage?: string }
  ): Promise<number> {
    if (!pool) {
      return 0;
    }

    try {
      // Build WHERE clause for filters
      let whereClause = 'WHERE mj.created_at BETWEEN $1 AND $2 AND atr.phase = $3';
      const params: any[] = [from, to, phaseName];

      if (filters?.userId) {
        params.push(filters.userId);
        whereClause += ` AND mp.user_id = $${params.length}`;
      }

      const query = `
        SELECT AVG(atr.ai_time_consumed) as avg_ai_time
        FROM ai_time_records atr
        JOIN migration_projects mp ON mp.id = atr.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        ${whereClause}
          AND atr.ai_time_consumed > 0
      `;

      const result = await pool.query(query, params);
      const avgAITime = parseFloat(result.rows[0]?.avg_ai_time || '0');

      return Math.round(avgAITime);

    } catch (error) {
      console.error(`[Migration Analytics] Failed to calculate average AI time for phase ${phaseName}:`, error);
      return 0;
    }
  }

  /**
   * Calculate total AI time cost in USD
   */
  private async calculateTotalAITimeCost(
    from: Date,
    to: Date,
    filters?: { userId?: string; status?: string; stage?: string }
  ): Promise<number> {
    if (!pool) {
      return 0;
    }

    try {
      // Build WHERE clause for filters
      let whereClause = 'WHERE mj.created_at BETWEEN $1 AND $2';
      const params: any[] = [from, to];

      if (filters?.userId) {
        params.push(filters.userId);
        whereClause += ` AND mp.user_id = $${params.length}`;
      }

      // Calculate cost based on AI time consumption
      // Assuming a cost model (this should be configured based on actual AI service costs)
      const costPerSecond = 0.0001; // $0.0001 per second (adjust based on actual costs)

      const query = `
        SELECT SUM(atr.ai_time_consumed * ${costPerSecond}) as total_cost_usd
        FROM ai_time_records atr
        JOIN migration_projects mp ON mp.id = atr.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        ${whereClause}
          AND atr.ai_time_consumed > 0
      `;

      const result = await pool.query(query, params);
      const totalCost = parseFloat(result.rows[0]?.total_cost_usd || '0');

      return Math.round(totalCost * 100) / 100; // Round to 2 decimal places

    } catch (error) {
      console.error('[Migration Analytics] Failed to calculate total AI time cost:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const migrationAnalyticsService = new MigrationAnalyticsService();