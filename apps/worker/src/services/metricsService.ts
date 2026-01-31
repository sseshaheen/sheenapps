import { INTERVALS } from '../config/timeouts.env';
import { pool } from './database';
import { aiTimeBillingService, type TrackingSession, type ConsumptionRecord } from './aiTimeBillingService';

export interface BuildMetrics {
  buildId: string;
  versionId: string;
  projectId: string;
  userId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  isInitialBuild?: boolean | undefined;
  isUpdate?: boolean | undefined;
  isRetry?: boolean | undefined;
  attemptNumber?: number | undefined;
  parentBuildId?: string | undefined;
  status: 'started' | 'ai_completed' | 'deployed' | 'failed';
  failureStage?: string | undefined;
  startedAt: Date;
  completedAt?: Date | undefined;
  totalDurationMs?: number | undefined;
  framework?: string | undefined;
  detectedFramework?: string | undefined;
  nodeVersion?: string | undefined;
  packageManager?: string | undefined;
}

export interface ClaudeSessionMetrics {
  buildId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  sessionId?: string | undefined;
  promptType: 'build' | 'metadata' | 'version_classification' | 'recommendations';
  originalPromptLength?: number | undefined;
  enhancedPromptLength?: number | undefined;
  sessionStartTime: Date;
  sessionEndTime?: Date | undefined;
  sessionDurationMs?: number | undefined;
  timeToFirstOutputMs?: number | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  // Budget enforcement (soft - logging only)
  budgetedTokens?: number | undefined;
  projectId?: string | undefined;
  cacheCreationTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  totalCostUsd?: number | undefined;
  filesCreated?: number | undefined;
  filesModified?: number | undefined;
  filesRead?: number | undefined;
  filesDeleted?: number | undefined;
  toolCallsTotal?: number | undefined;
  toolCallsByType?: Record<string, number> | undefined;
  bashCommandsRun?: number | undefined;
  errorsEncountered?: number | undefined;
  errorsFixed?: number | undefined;
  errorTypes?: Record<string, number> | undefined;
  success: boolean;
  timeoutOccurred?: boolean | undefined;
  sessionTimeoutMs?: number | undefined;
  errorMessage?: string | undefined;
  metadata?: Record<string, any> | undefined;
  // AI Time Billing fields
  aiTimeTrackingSession?: TrackingSession | undefined;
  aiTimeConsumption?: ConsumptionRecord | undefined;
}

export interface DeploymentMetrics {
  buildId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  deploymentId?: string | undefined;
  installStartedAt?: Date | undefined;
  installCompletedAt?: Date | undefined;
  installDurationMs?: number | undefined;
  installStrategy?: string | undefined;
  installCacheHit?: boolean | undefined;
  dependenciesCount?: number | undefined;
  devDependenciesCount?: number | undefined;
  buildStartedAt?: Date | undefined;
  buildCompletedAt?: Date | undefined;
  buildDurationMs?: number | undefined;
  buildCacheHit?: boolean | undefined;
  buildCommand?: string | undefined;
  buildOutputSizeBytes?: number | undefined;
  deployStartedAt?: Date | undefined;
  deployCompletedAt?: Date | undefined;
  deployDurationMs?: number | undefined;
  deploymentSizeBytes?: number | undefined;
  filesUploaded?: number | undefined;
  previewUrl?: string | undefined;
  success: boolean;
  errorMessage?: string | undefined;
}

export interface ErrorMetric {
  buildId: string;
  errorId: string;
  errorType: 'typescript' | 'dependency' | 'build' | 'syntax' | 'file_not_found' | 'other';
  errorSource: 'claude' | 'install' | 'build' | 'deploy';
  errorMessage: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  errorFile?: string | undefined;
  errorLine?: number | undefined;
  recoveryAttempted?: boolean | undefined;
  recoveryStrategy?: string | undefined;
  recoverySuccess?: boolean | undefined;
  recoveryDurationMs?: number | undefined;
  occurredAt: Date;
  resolvedAt?: Date | undefined;
}

class MetricsService {
  private metricsQueue: Map<string, any[]> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private activeAITimeTracking: Map<string, TrackingSession> = new Map();

  constructor() {
    // Flush metrics periodically
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => console.error('[Metrics] Flush error:', err));
    }, INTERVALS.metricsFlush);
  }

  async recordBuildStart(metrics: Omit<BuildMetrics, 'status' | 'startedAt'>): Promise<void> {
    if (!pool) {
      console.warn('[Metrics] Database pool not available, skipping recordBuildStart');
      return;
    }

    try {
      console.log(`[Metrics] Recording build start for ${metrics.buildId}`);
      await pool.query(
        `INSERT INTO project_build_metrics (
          build_id, version_id, project_id, user_id,
          is_initial_build, is_update, is_retry, attempt_number, parent_build_id,
          status, started_at, framework, node_version, package_manager
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          metrics.buildId,
          metrics.versionId,
          metrics.projectId,
          metrics.userId,
          metrics.isInitialBuild ?? true,
          metrics.isUpdate ?? false,
          metrics.isRetry ?? false,
          metrics.attemptNumber ?? 1,
          metrics.parentBuildId,
          'started',
          new Date(),
          metrics.framework,
          metrics.nodeVersion,
          metrics.packageManager
        ]
      );
    } catch (error) {
      console.error('[Metrics] Failed to record build start:', error);
      // Don't throw - metrics shouldn't break builds
    }
  }

  async recordBuildComplete(
    buildId: string,
    status: 'ai_completed' | 'deployed' | 'failed',
    failureStage?: string
  ): Promise<void> {
    if (!pool) {
      console.warn('[Metrics] Database pool not available, skipping recordBuildComplete');
      return;
    }

    try {
      console.log(`[Metrics] Recording build complete for ${buildId} with status ${status}`);
      const completedAt = new Date();
      await pool?.query(
        `UPDATE project_build_metrics
         SET status = $1, failure_stage = $2, completed_at = $3,
             total_duration_ms = EXTRACT(EPOCH FROM ($3 - started_at)) * 1000
         WHERE build_id = $4`,
        [status, failureStage, completedAt, buildId]
      );
    } catch (error) {
      console.error('[Metrics] Failed to record build complete:', error);
    }
  }

  async recordClaudeSession(metrics: ClaudeSessionMetrics): Promise<void> {
    if (!pool) {
      console.warn('[Metrics] Database pool not available, skipping recordClaudeSession');
      return;
    }

    try {
      console.log(`[Metrics] Recording Claude session for build ${metrics.buildId}`);

      // Token budget logging (soft enforcement)
      const actualTokens = (metrics.inputTokens || 0) + (metrics.outputTokens || 0);
      if (metrics.budgetedTokens && actualTokens > 0) {
        const overageThreshold = 1.2; // 20% overage threshold
        const overageRatio = actualTokens / metrics.budgetedTokens;

        console.log(`[Budget] Token usage for ${metrics.buildId}: ${actualTokens} actual vs ${metrics.budgetedTokens} budgeted (${Math.round(overageRatio * 100)}%)`);

        if (overageRatio > overageThreshold) {
          const overagePercent = Math.round((overageRatio - 1) * 100);
          console.warn(`[Budget] TOKEN_BUDGET_EXCEEDED: Build ${metrics.buildId} exceeded token budget by ${overagePercent}% (${actualTokens}/${metrics.budgetedTokens} tokens)`, {
            buildId: metrics.buildId,
            projectId: metrics.projectId,
            budgetedTokens: metrics.budgetedTokens,
            actualTokens,
            inputTokens: metrics.inputTokens,
            outputTokens: metrics.outputTokens,
            overagePercent,
          });
        }
      }
      await pool?.query(
        `INSERT INTO project_ai_session_metrics (
          build_id, session_id, prompt_type, original_prompt_length, enhanced_prompt_length,
          session_start_time, session_end_time, session_duration_ms, time_to_first_output_ms,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_cost_usd,
          files_created, files_modified, files_read, files_deleted,
          tool_calls_total, tool_calls_by_type, bash_commands_run,
          errors_encountered, errors_fixed, error_types,
          success, timeout_occurred, session_timeout_ms, error_message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`,
        [
          metrics.buildId,
          metrics.sessionId,
          metrics.promptType,
          metrics.originalPromptLength,
          metrics.enhancedPromptLength,
          metrics.sessionStartTime,
          metrics.sessionEndTime,
          metrics.sessionDurationMs,
          metrics.timeToFirstOutputMs,
          metrics.inputTokens,
          metrics.outputTokens,
          metrics.cacheCreationTokens,
          metrics.cacheReadTokens,
          metrics.totalCostUsd,
          metrics.filesCreated ?? 0,
          metrics.filesModified ?? 0,
          metrics.filesRead ?? 0,
          metrics.filesDeleted ?? 0,
          metrics.toolCallsTotal ?? 0,
          JSON.stringify(metrics.toolCallsByType || {}),
          metrics.bashCommandsRun ?? 0,
          metrics.errorsEncountered ?? 0,
          metrics.errorsFixed ?? 0,
          JSON.stringify(metrics.errorTypes || {}),
          metrics.success,
          metrics.timeoutOccurred ?? false,
          metrics.sessionTimeoutMs,
          metrics.errorMessage,
          JSON.stringify(metrics.metadata || {})
        ]
      );
    } catch (error) {
      console.error('[Metrics] Failed to record Claude session:', error);
    }
  }

  // =====================================================
  // AI TIME BILLING INTEGRATION
  // =====================================================

  /**
   * Start AI time tracking for an operation with pre-flight balance check
   */
  async startAITimeTracking(
    buildId: string,
    operationType: 'main_build' | 'metadata_generation' | 'update',
    context: {
      projectId: string;
      versionId: string;
      userId: string;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      sessionId?: string | undefined;
    }
  ): Promise<TrackingSession> {
    try {
      console.log(`[Metrics] Starting AI time tracking for ${buildId} (${operationType})`);
      
      const trackingSession = await aiTimeBillingService.startTracking(
        buildId,
        operationType,
        context
      );
      
      // Store active tracking session
      this.activeAITimeTracking.set(buildId, trackingSession);
      
      console.log(`[Metrics] AI time tracking started for ${buildId}. Estimated: ${trackingSession.estimatedSeconds}s`);
      return trackingSession;
      
    } catch (error) {
      console.error(`[Metrics] Failed to start AI time tracking for ${buildId}:`, error);
      throw error; // Re-throw to prevent operation from continuing
    }
  }

  /**
   * End AI time tracking and record consumption
   */
  async endAITimeTracking(
    buildId: string,
    context: {
      userId: string;
      projectId: string;
      versionId: string;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      sessionId?: string | undefined;
      success: boolean;
      errorType?: string | undefined;
    }
  ): Promise<ConsumptionRecord | null> {
    try {
      const trackingSession = this.activeAITimeTracking.get(buildId);
      if (!trackingSession) {
        console.warn(`[Metrics] No active AI time tracking found for ${buildId}`);
        return null;
      }

      console.log(`[Metrics] Ending AI time tracking for ${buildId}`);
      
      const consumptionRecord = await aiTimeBillingService.endTracking(
        trackingSession.trackingId,
        {
          ...context,
          startedAt: trackingSession.startedAt
        }
      );
      
      // Remove from active tracking
      this.activeAITimeTracking.delete(buildId);
      
      console.log(`[Metrics] AI time consumption recorded for ${buildId}:`, {
        billableSeconds: consumptionRecord.billableSeconds,
        totalConsumed: consumptionRecord.consumption.totalConsumed,
        breakdown: consumptionRecord.consumption
      });
      
      return consumptionRecord;
      
    } catch (error) {
      console.error(`[Metrics] Failed to end AI time tracking for ${buildId}:`, error);
      // Don't throw - we don't want billing errors to break the build process
      return null;
    }
  }

  /**
   * Check if user has sufficient balance before starting operation
   */
  async checkSufficientAITimeBalance(userId: string, estimatedSeconds?: number): Promise<{
    sufficient: boolean;
    balance: any;
    estimate?: any;
  }> {
    try {
      let secondsToCheck: number;
      let estimate: any;
      
      if (estimatedSeconds) {
        // Use provided estimate
        secondsToCheck = estimatedSeconds;
        estimate = { estimatedSeconds };
      } else {
        // Get real historical estimate for main_build operation
        const historicalEstimate = await aiTimeBillingService.estimateDuration('main_build', {});
        secondsToCheck = historicalEstimate.estimatedSeconds;
        estimate = historicalEstimate;
      }
      
      const sufficient = await aiTimeBillingService.checkSufficientBalance(userId, secondsToCheck);
      const balance = await aiTimeBillingService.getUserBalance(userId);
      
      return {
        sufficient,
        balance,
        estimate
      };
      
    } catch (error) {
      console.error('[Metrics] Failed to check AI time balance:', error);
      // Return false for safety
      return {
        sufficient: false,
        balance: null
      };
    }
  }

  /**
   * Get user's current AI time balance
   */
  async getUserAITimeBalance(userId: string) {
    try {
      return await aiTimeBillingService.getUserBalance(userId);
    } catch (error) {
      console.error('[Metrics] Failed to get user AI time balance:', error);
      return null;
    }
  }

  /**
   * Estimate AI time required for an operation
   */
  async estimateAITime(
    operationType: 'main_build' | 'metadata_generation' | 'update',
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    context: { projectId?: string | undefined; isUpdate?: boolean | undefined; projectSize?: 'small' | 'medium' | 'large' | undefined }
  ) {
    try {
      return await aiTimeBillingService.estimateDuration(operationType, context);
    } catch (error) {
      console.error('[Metrics] Failed to estimate AI time:', error);
      return null;
    }
  }

  async recordDeployment(metrics: DeploymentMetrics): Promise<void> {
    if (!pool) {
      console.warn('[Metrics] Database pool not available, skipping recordDeployment');
      return;
    }

    try {
      console.log(`[Metrics] Recording deployment for build ${metrics.buildId}`);

      // First, check if a deployment record already exists for this build
      const existing = await pool.query(
        'SELECT id FROM project_deployment_metrics WHERE build_id = $1',
        [metrics.buildId]
      );

      if (existing.rows.length > 0) {
        // Update the existing record instead of inserting a new one
        console.log(`[Metrics] Updating existing deployment record for build ${metrics.buildId}`);
        await pool.query(
          `UPDATE project_deployment_metrics SET
            deployment_id = $2,
            install_started_at = $3, install_completed_at = $4, install_duration_ms = $5,
            install_strategy = $6, install_cache_hit = $7,
            dependencies_count = $8, dev_dependencies_count = $9,
            build_started_at = $10, build_completed_at = $11, build_duration_ms = $12,
            build_cache_hit = $13, build_command = $14, build_output_size_bytes = $15,
            deploy_started_at = $16, deploy_completed_at = $17, deploy_duration_ms = $18,
            deployment_size_bytes = $19, files_uploaded = $20,
            preview_url = $21, success = $22, error_message = $23
          WHERE build_id = $1`,
          [
            metrics.buildId,
            metrics.deploymentId,
            metrics.installStartedAt,
            metrics.installCompletedAt,
            metrics.installDurationMs,
            metrics.installStrategy,
            metrics.installCacheHit ?? false,
            metrics.dependenciesCount,
            metrics.devDependenciesCount,
            metrics.buildStartedAt,
            metrics.buildCompletedAt,
            metrics.buildDurationMs,
            metrics.buildCacheHit ?? false,
            metrics.buildCommand,
            metrics.buildOutputSizeBytes,
            metrics.deployStartedAt,
            metrics.deployCompletedAt,
            metrics.deployDurationMs,
            metrics.deploymentSizeBytes,
            metrics.filesUploaded,
            metrics.previewUrl,
            metrics.success,
            metrics.errorMessage
          ]
        );
      } else {
        // Insert new record
        await pool.query(
          `INSERT INTO project_deployment_metrics (
            build_id, deployment_id,
            install_started_at, install_completed_at, install_duration_ms, install_strategy, install_cache_hit,
            dependencies_count, dev_dependencies_count,
            build_started_at, build_completed_at, build_duration_ms, build_cache_hit, build_command, build_output_size_bytes,
            deploy_started_at, deploy_completed_at, deploy_duration_ms, deployment_size_bytes, files_uploaded,
            preview_url, success, error_message
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
          [
            metrics.buildId,
            metrics.deploymentId,
            metrics.installStartedAt,
            metrics.installCompletedAt,
            metrics.installDurationMs,
            metrics.installStrategy,
            metrics.installCacheHit ?? false,
            metrics.dependenciesCount,
            metrics.devDependenciesCount,
            metrics.buildStartedAt,
            metrics.buildCompletedAt,
            metrics.buildDurationMs,
            metrics.buildCacheHit ?? false,
            metrics.buildCommand,
            metrics.buildOutputSizeBytes,
            metrics.deployStartedAt,
            metrics.deployCompletedAt,
            metrics.deployDurationMs,
            metrics.deploymentSizeBytes,
            metrics.filesUploaded,
            metrics.previewUrl,
            metrics.success,
            metrics.errorMessage
          ]
        );
      }
    } catch (error) {
      console.error('[Metrics] Failed to record deployment:', error);
      // If it's a duplicate key error, try to update instead
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        console.log('[Metrics] Retrying as update due to duplicate key');
        try {
          await pool.query(
            `UPDATE project_deployment_metrics SET
              deployment_id = $2,
              install_started_at = $3, install_completed_at = $4, install_duration_ms = $5,
              install_strategy = $6, install_cache_hit = $7,
              dependencies_count = $8, dev_dependencies_count = $9,
              build_started_at = $10, build_completed_at = $11, build_duration_ms = $12,
              build_cache_hit = $13, build_command = $14, build_output_size_bytes = $15,
              deploy_started_at = $16, deploy_completed_at = $17, deploy_duration_ms = $18,
              deployment_size_bytes = $19, files_uploaded = $20,
              preview_url = $21, success = $22, error_message = $23
            WHERE build_id = $1`,
            [
              metrics.buildId,
              metrics.deploymentId,
              metrics.installStartedAt,
              metrics.installCompletedAt,
              metrics.installDurationMs,
              metrics.installStrategy,
              metrics.installCacheHit ?? false,
              metrics.dependenciesCount,
              metrics.devDependenciesCount,
              metrics.buildStartedAt,
              metrics.buildCompletedAt,
              metrics.buildDurationMs,
              metrics.buildCacheHit ?? false,
              metrics.buildCommand,
              metrics.buildOutputSizeBytes,
              metrics.deployStartedAt,
              metrics.deployCompletedAt,
              metrics.deployDurationMs,
              metrics.deploymentSizeBytes,
              metrics.filesUploaded,
              metrics.previewUrl,
              metrics.success,
              metrics.errorMessage
            ]
          );
          console.log('[Metrics] Successfully updated deployment metrics on retry');
        } catch (retryError) {
          console.error('[Metrics] Failed to update deployment metrics on retry:', retryError);
        }
      }
    }
  }

  async recordError(error: ErrorMetric): Promise<void> {
    // Queue errors for batch insertion
    const errors = this.metricsQueue.get('errors') || [];
    errors.push(error);
    this.metricsQueue.set('errors', errors);

    // Flush if queue is getting large
    if (errors.length >= 10) {
      await this.flushErrors();
    }
  }

  private async flushErrors(): Promise<void> {
    const errors = this.metricsQueue.get('errors');
    if (!errors || errors.length === 0) return;

    try {
      // Batch insert errors
      const values = errors.map((e: ErrorMetric) => [
        e.buildId,
        e.errorId,
        e.errorType,
        e.errorSource,
        e.errorMessage,
        e.errorFile,
        e.errorLine,
        e.recoveryAttempted ?? false,
        e.recoveryStrategy,
        e.recoverySuccess,
        e.recoveryDurationMs,
        e.occurredAt,
        e.resolvedAt
      ]);

      const placeholders = values.map((_, i) =>
        `($${i * 13 + 1}, $${i * 13 + 2}, $${i * 13 + 3}, $${i * 13 + 4}, $${i * 13 + 5}, $${i * 13 + 6}, $${i * 13 + 7}, $${i * 13 + 8}, $${i * 13 + 9}, $${i * 13 + 10}, $${i * 13 + 11}, $${i * 13 + 12}, $${i * 13 + 13})`
      ).join(',');

      await pool?.query(
        `INSERT INTO project_error_metrics (
          build_id, error_id, error_type, error_source, error_message,
          error_file, error_line, recovery_attempted, recovery_strategy,
          recovery_success, recovery_duration_ms, occurred_at, resolved_at
        ) VALUES ${placeholders}`,
        values.flat()
      );

      // Clear the queue
      this.metricsQueue.set('errors', []);
    } catch (error) {
      console.error('[Metrics] Failed to flush errors:', error);
    }
  }

  async updateProjectSummary(buildId: string): Promise<void> {
    if (!pool) {
      console.warn('[Metrics] Database pool not available, skipping updateProjectSummary');
      return;
    }

    try {
      console.log(`[Metrics] Updating project summary for build ${buildId}`);
      
      // First check if the build exists in project_build_metrics
      const buildCheck = await pool.query(
        'SELECT project_id, user_id, started_at FROM project_build_metrics WHERE build_id = $1',
        [buildId]
      );
      
      if (buildCheck.rows.length === 0) {
        console.warn(`[Metrics] Build ${buildId} not found in project_build_metrics, skipping summary update`);
        return;
      }
      
      const build = buildCheck.rows[0];
      console.log(`[Metrics] Found build: project=${build.project_id}, user=${build.user_id}, started=${build.started_at}`);
      
      const result = await pool.query('SELECT update_project_metrics_summary($1)', [buildId]);
      console.log(`[Metrics] Project summary updated successfully for ${buildId}`);
    } catch (error) {
      console.error('[Metrics] Failed to update project summary:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('[Metrics] Error details:', error.message);
        
        // Log specific details for constraint violations
        if (error.message.includes('not-null constraint')) {
          console.error('[Metrics] This appears to be a missing column issue. Make sure migration 022 has been applied.');
        }
        
        console.error('[Metrics] Error stack:', error.stack);
      }
    }
  }

  async flush(): Promise<void> {
    await this.flushErrors();
    // Add other batch operations here as needed
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    this.flush().catch(err => console.error('[Metrics] Final flush error:', err));
  }
}

// Singleton instance
export const metricsService = new MetricsService();

// Ensure cleanup on shutdown
process.on('beforeExit', () => {
  metricsService.destroy();
});
