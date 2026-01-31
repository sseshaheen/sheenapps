import { pool } from './database';
import { migrationAITimeService } from './migrationAITimeService';
import { migrationAnalyticsService } from './migrationAnalyticsService';
import { unifiedLogger } from './unifiedLogger';

/**
 * Enterprise Migration Service
 * Advanced features for enterprise customers including custom budgets,
 * bulk operations, dedicated support channels, and advanced customization
 */

export interface OrganizationMigrationConfig {
  orgId: string;
  customBudgets: {
    softBudgetSeconds: number;
    hardBudgetSeconds: number;
    perPhaseCapSeconds: number;
    monthlyAllowanceSeconds: number;
  };
  priorityLevel: 'standard' | 'premium' | 'enterprise';
  dedicatedSupport: {
    enabled: boolean;
    supportChannelId?: string;
    escalationPolicy?: string;
  };
  advancedFeatures: {
    bulkMigrations: boolean;
    whiteGloveService: boolean;
    customIntegrations: boolean;
    advancedAnalytics: boolean;
  };
  migrationLimits: {
    concurrentMigrations: number;
    dailyMigrations: number;
    monthlyMigrations: number;
  };
}

export interface BulkMigrationRequest {
  name: string;
  description?: string;
  urls: string[];
  userBrief: any;
  scheduling: {
    immediate: boolean;
    scheduledFor?: Date;
    batchSize?: number;
    delayBetweenBatches?: number; // in seconds
  };
  notifications: {
    email?: string;
    webhook?: string;
    slackChannel?: string;
  };
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface BulkMigrationStatus {
  bulkId: string;
  name: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  totalUrls: number;
  completedMigrations: number;
  failedMigrations: number;
  currentBatch: number;
  totalBatches: number;
  estimatedCompletionTime?: Date | undefined;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  errorMessage?: string | undefined;
  migrations: Array<{
    migrationId: string;
    url: string;
    status: string;
    progress: number;
    aiTimeConsumed: number;
  }>;
}

export interface AdvancedCustomization {
  customPrompts: {
    analysisPrompt?: string;
    planningPrompt?: string;
    transformationPrompt?: string;
    verificationPrompt?: string;
  };
  integrationHooks: {
    preAnalysis?: string; // webhook URL
    postAnalysis?: string;
    preDeployment?: string;
    postDeployment?: string;
  };
  qualityGates: {
    minimumCompatibilityScore: number;
    requiredValidations: string[];
    customValidators: Array<{
      name: string;
      endpoint: string;
      timeout: number;
    }>;
  };
}

export class EnterpriseMigrationService {

  /**
   * Set custom migration budgets per organization
   */
  async setOrganizationBudgets(
    orgId: string,
    budgets: OrganizationMigrationConfig['customBudgets']
  ): Promise<{ success: boolean; message: string }> {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      const upsertQuery = `
        INSERT INTO organization_migration_config (
          org_id, custom_budgets, updated_at
        ) VALUES ($1, $2, NOW())
        ON CONFLICT (org_id)
        DO UPDATE SET
          custom_budgets = $2,
          updated_at = NOW()
      `;

      await pool.query(upsertQuery, [orgId, JSON.stringify(budgets)]);

      unifiedLogger.system('startup', 'info', 'Organization budgets updated', {
        orgId,
        budgets
      });

      return {
        success: true,
        message: 'Organization budgets updated successfully'
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to set organization budgets', {
        orgId,
        budgets,
        error: (error as Error).message
      });

      return {
        success: false,
        message: `Failed to update budgets: ${(error as Error).message}`
      };
    }
  }

  /**
   * Start bulk migration operation
   */
  async startBulkMigration(
    userId: string,
    orgId: string,
    bulkRequest: BulkMigrationRequest
  ): Promise<{ success: boolean; bulkId?: string; message: string }> {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      // Check organization limits
      const config = await this.getOrganizationConfig(orgId);
      if (!config?.advancedFeatures.bulkMigrations) {
        return {
          success: false,
          message: 'Bulk migrations not enabled for this organization'
        };
      }

      // Check concurrent migration limits
      const activeMigrations = await this.getActiveMigrationsCount(orgId);
      if (activeMigrations >= config.migrationLimits.concurrentMigrations) {
        return {
          success: false,
          message: `Concurrent migration limit (${config.migrationLimits.concurrentMigrations}) exceeded`
        };
      }

      // Create bulk migration record
      const insertQuery = `
        INSERT INTO bulk_migration_jobs (
          org_id, created_by, name, description, urls,
          user_brief, scheduling, notifications, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        RETURNING id
      `;

      const result = await pool.query(insertQuery, [
        orgId,
        userId,
        bulkRequest.name,
        bulkRequest.description,
        JSON.stringify(bulkRequest.urls),
        JSON.stringify(bulkRequest.userBrief),
        JSON.stringify(bulkRequest.scheduling),
        JSON.stringify(bulkRequest.notifications)
      ]);

      const bulkId = result.rows[0].id;

      // Schedule or start immediately
      if (bulkRequest.scheduling.immediate) {
        await this.processBulkMigration(bulkId);
      } else if (bulkRequest.scheduling.scheduledFor) {
        // In a real implementation, this would use a job scheduler
        setTimeout(() => this.processBulkMigration(bulkId),
          bulkRequest.scheduling.scheduledFor.getTime() - Date.now());
      }

      unifiedLogger.system('startup', 'info', 'Bulk migration started', {
        bulkId,
        orgId,
        userId,
        totalUrls: bulkRequest.urls.length
      });

      return {
        success: true,
        bulkId,
        message: 'Bulk migration started successfully'
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to start bulk migration', {
        orgId,
        userId,
        error: (error as Error).message
      });

      return {
        success: false,
        message: `Failed to start bulk migration: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get bulk migration status
   */
  async getBulkMigrationStatus(bulkId: string, orgId: string): Promise<BulkMigrationStatus | null> {
    if (!pool) {
      return null;
    }

    try {
      const bulkQuery = `
        SELECT
          id, name, status, urls, created_at, started_at, completed_at, error_message
        FROM bulk_migration_jobs
        WHERE id = $1 AND org_id = $2
      `;

      const bulkResult = await pool.query(bulkQuery, [bulkId, orgId]);

      if (bulkResult.rows.length === 0) {
        return null;
      }

      const bulk = bulkResult.rows[0];
      const urls = JSON.parse(bulk.urls);

      // Get individual migration statuses
      const migrationsQuery = `
        SELECT
          mj.id,
          mp.source_url,
          mj.status,
          mj.progress,
          mp.ai_time_consumed_seconds
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mp.bulk_migration_id = $1
        ORDER BY mj.created_at
      `;

      const migrationsResult = await pool.query(migrationsQuery, [bulkId]);

      const migrations = migrationsResult.rows.map(row => ({
        migrationId: row.id,
        url: row.source_url,
        status: row.status,
        progress: row.progress || 0,
        aiTimeConsumed: row.ai_time_consumed_seconds || 0
      }));

      const completedMigrations = migrations.filter(m => m.status === 'completed').length;
      const failedMigrations = migrations.filter(m => m.status === 'failed').length;

      const status: BulkMigrationStatus = {
        bulkId: bulk.id,
        name: bulk.name,
        status: bulk.status,
        totalUrls: urls.length,
        completedMigrations,
        failedMigrations,
        currentBatch: Math.ceil((completedMigrations + failedMigrations) / 10), // Assuming batch size of 10
        totalBatches: Math.ceil(urls.length / 10),
        startedAt: bulk.started_at ? new Date(bulk.started_at) : undefined,
        completedAt: bulk.completed_at ? new Date(bulk.completed_at) : undefined,
        errorMessage: bulk.error_message,
        migrations
      };

      return status;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to get bulk migration status', {
        bulkId,
        orgId,
        error: (error as Error).message
      });

      return null;
    }
  }

  /**
   * Set up dedicated migration support channel
   */
  async setupDedicatedSupport(
    orgId: string,
    supportConfig: {
      channelType: 'slack' | 'teams' | 'webhook';
      channelId: string;
      escalationPolicy?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      const updateQuery = `
        UPDATE organization_migration_config
        SET dedicated_support = $2,
            updated_at = NOW()
        WHERE org_id = $1
      `;

      await pool.query(updateQuery, [orgId, JSON.stringify({
        enabled: true,
        supportChannelId: supportConfig.channelId,
        escalationPolicy: supportConfig.escalationPolicy
      })]);

      unifiedLogger.system('startup', 'info', 'Dedicated support configured', {
        orgId,
        channelType: supportConfig.channelType,
        channelId: supportConfig.channelId
      });

      return {
        success: true,
        message: 'Dedicated support channel configured successfully'
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to setup dedicated support', {
        orgId,
        supportConfig,
        error: (error as Error).message
      });

      return {
        success: false,
        message: `Failed to configure support channel: ${(error as Error).message}`
      };
    }
  }

  /**
   * Configure advanced migration customization
   */
  async setAdvancedCustomization(
    orgId: string,
    customization: AdvancedCustomization
  ): Promise<{ success: boolean; message: string }> {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      const upsertQuery = `
        INSERT INTO organization_migration_customization (
          org_id, custom_prompts, integration_hooks, quality_gates, updated_at
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (org_id)
        DO UPDATE SET
          custom_prompts = $2,
          integration_hooks = $3,
          quality_gates = $4,
          updated_at = NOW()
      `;

      await pool.query(upsertQuery, [
        orgId,
        JSON.stringify(customization.customPrompts),
        JSON.stringify(customization.integrationHooks),
        JSON.stringify(customization.qualityGates)
      ]);

      unifiedLogger.system('startup', 'info', 'Advanced customization configured', {
        orgId,
        hasCustomPrompts: Object.keys(customization.customPrompts || {}).length > 0,
        hasIntegrationHooks: Object.keys(customization.integrationHooks || {}).length > 0,
        minimumCompatibilityScore: customization.qualityGates?.minimumCompatibilityScore
      });

      return {
        success: true,
        message: 'Advanced customization configured successfully'
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to set advanced customization', {
        orgId,
        error: (error as Error).message
      });

      return {
        success: false,
        message: `Failed to configure customization: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get organization migration analytics
   */
  async getOrganizationAnalytics(
    orgId: string,
    timeRange: { from: Date; to: Date }
  ): Promise<{
    metrics: any;
    performanceReport: any;
    recommendations: string[];
  }> {
    try {
      // Get organization-specific metrics
      const metrics = await migrationAnalyticsService.getMigrationMetrics(timeRange);

      // Get performance report
      const performanceReport = await migrationAnalyticsService.analyzeMigrationPerformance(
        timeRange.from,
        timeRange.to,
        { /* org filter would be added here */ }
      );

      // Generate recommendations based on organization data
      const recommendations = await this.generateOrganizationRecommendations(orgId, metrics);

      return {
        metrics,
        performanceReport,
        recommendations
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to get organization analytics', {
        orgId,
        timeRange,
        error: (error as Error).message
      });

      throw error;
    }
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private async getOrganizationConfig(orgId: string): Promise<OrganizationMigrationConfig | null> {
    if (!pool) {
      return null;
    }

    try {
      const query = `
        SELECT
          custom_budgets,
          priority_level,
          dedicated_support,
          advanced_features,
          migration_limits
        FROM organization_migration_config
        WHERE org_id = $1
      `;

      const result = await pool.query(query, [orgId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        orgId,
        customBudgets: JSON.parse(row.custom_budgets || '{}'),
        priorityLevel: row.priority_level || 'standard',
        dedicatedSupport: JSON.parse(row.dedicated_support || '{"enabled": false}'),
        advancedFeatures: JSON.parse(row.advanced_features || '{}'),
        migrationLimits: JSON.parse(row.migration_limits || '{}')
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to get organization config', {
        orgId,
        error: (error as Error).message
      });

      return null;
    }
  }

  private async getActiveMigrationsCount(orgId: string): Promise<number> {
    if (!pool) {
      return 0;
    }

    try {
      const query = `
        SELECT COUNT(*) as active_count
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mp.org_id = $1 AND mj.status IN ('analyzing', 'processing', 'running')
      `;

      const result = await pool.query(query, [orgId]);
      return parseInt(result.rows[0].active_count) || 0;

    } catch (error) {
      return 0;
    }
  }

  private async processBulkMigration(bulkId: string): Promise<void> {
    // This would implement the actual bulk migration processing logic
    // Including batching, scheduling, and progress tracking
    try {
      unifiedLogger.system('startup', 'info', 'Processing bulk migration', { bulkId });

      // Update status to running
      if (pool) {
        await pool.query(`
          UPDATE bulk_migration_jobs
          SET status = 'running', started_at = NOW()
          WHERE id = $1
        `, [bulkId]);
      }

      // TODO: Implement actual bulk processing logic
      // This would involve:
      // 1. Getting the URLs from the bulk job
      // 2. Creating individual migration jobs in batches
      // 3. Monitoring progress and updating status
      // 4. Sending notifications on completion

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Bulk migration processing failed', {
        bulkId,
        error: (error as Error).message
      });

      if (pool) {
        await pool.query(`
          UPDATE bulk_migration_jobs
          SET status = 'failed', error_message = $2, completed_at = NOW()
          WHERE id = $1
        `, [bulkId, (error as Error).message]);
      }
    }
  }

  private async generateOrganizationRecommendations(
    orgId: string,
    metrics: any
  ): Promise<string[]> {
    const recommendations: string[] = [];

    try {
      // Analyze success rate
      if (metrics.successRate < 80) {
        recommendations.push('Consider implementing additional pre-migration validation');
        recommendations.push('Review common failure patterns and update migration templates');
      }

      // Analyze AI time consumption
      if (metrics.averageAITimeConsumed > 1800) { // 30 minutes
        recommendations.push('Consider optimizing migration prompts for efficiency');
        recommendations.push('Review complex migrations for potential automation opportunities');
      }

      // Analyze retry rate
      if (metrics.retryRate > 20) {
        recommendations.push('Implement additional quality gates to reduce retry frequency');
        recommendations.push('Consider white-glove service for complex migrations');
      }

      return recommendations;

    } catch (error) {
      unifiedLogger.system('warning', 'warn', 'Failed to generate recommendations', {
        orgId,
        error: (error as Error).message
      });

      return ['Unable to generate recommendations at this time'];
    }
  }
}

// Export singleton instance
export const enterpriseMigrationService = new EnterpriseMigrationService();