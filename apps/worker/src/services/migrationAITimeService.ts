import { aiTimeBillingService, type TrackingSession, type ConsumptionRecord, InsufficientAITimeError } from './aiTimeBillingService';
import { unifiedLogger } from './unifiedLogger';
import { pool } from './database';

/**
 * Migration AI Time Service
 * Integrates website migration with the existing AI time billing system
 * Implements budget enforcement and consumption tracking for migration phases
 */

export interface MigrationBudget {
  softBudgetSeconds: number;  // Warning threshold
  hardBudgetSeconds: number;  // Hard limit
  perPhaseCapSeconds: number; // Per-phase limit
}

export interface MigrationPhaseEstimate {
  phase: 'ANALYZE' | 'PLAN' | 'TRANSFORM' | 'VERIFY' | 'DEPLOY';
  estimatedSeconds: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface BudgetCheckResult {
  canProceed: boolean;
  remainingBalance: number;
  estimatedCost: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  nextPhaseEstimate?: number | undefined;
  warningType?: 'PHASE_LIMIT' | 'BUDGET_NEAR_LIMIT' | 'INSUFFICIENT_BALANCE' | undefined;
  warningMessage?: string | undefined;
}

export class MigrationAITimeService {

  /**
   * Check user has sufficient AI time before starting migration phase
   */
  async validateAITimeBalance(
    userId: string,
    phase: string,
    estimatedSeconds: number,
    migrationId: string
  ): Promise<void> {
    const budget = await this.getMigrationBudget(migrationId);
    const consumed = await this.getConsumedTime(migrationId);

    // Check budget limits
    await this.checkBudgetAndEnforce(userId, migrationId, phase, estimatedSeconds, budget, consumed);

    // Check user balance
    const hasBalance = await aiTimeBillingService.checkSufficientBalance(userId, estimatedSeconds);
    if (!hasBalance) {
      const balance = await aiTimeBillingService.getUserBalance(userId);
      throw new InsufficientAITimeError(estimatedSeconds, balance.total, balance);
    }
  }

  /**
   * Start AI time tracking for migration phase
   */
  async startMigrationTracking(
    migrationId: string,
    phase: string,
    userId: string
  ): Promise<TrackingSession> {
    // Store tracking context to avoid parsing trackingId later
    const trackingContext = {
      migrationId,
      phase,
      userId,
      startedAt: new Date()
    };

    await this.storeTrackingContext(migrationId, phase, trackingContext);

    // Use existing AI time system with migration operation type
    return await aiTimeBillingService.startTracking(
      `migration-${migrationId}-${phase}`,
      'website_migration', // New operation type to be added to CLAUDE.md
      {
        projectId: migrationId,
        versionId: phase,
        userId,
        sessionId: `migration-${migrationId}-${phase}`
      }
    );
  }

  /**
   * End tracking and consume AI time
   */
  async endMigrationTracking(
    trackingId: string,
    success: boolean,
    userId: string
  ): Promise<ConsumptionRecord> {
    // Retrieve tracking context instead of parsing trackingId
    const context = await this.getTrackingContext(trackingId);
    if (!context) {
      throw new Error(`Tracking context not found for ${trackingId}`);
    }

    try {
      const consumption = await aiTimeBillingService.endTracking(trackingId, {
        userId,
        projectId: context.migrationId,
        versionId: context.phase,
        startedAt: context.startedAt,
        success,
        errorType: success ? undefined : 'migration_phase_failed'
      });

      // Update migration project with consumed time
      await this.updateMigrationConsumption(
        context.migrationId,
        consumption.billableSeconds,
        context.phase,
        success
      );

      // Clean up tracking context
      await this.cleanupTrackingContext(trackingId);

      unifiedLogger.system('ai_time_consumed', 'info', 'Migration AI time consumed', {
        migrationId: context.migrationId,
        phase: context.phase,
        billableSeconds: consumption.billableSeconds,
        success
      });

      return consumption;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to end migration tracking', {
        trackingId,
        migrationId: context.migrationId,
        phase: context.phase,
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Convert token usage to AI time seconds using model-specific rates
   */
  async convertTokensToSeconds(
    inputTokens: number,
    outputTokens: number,
    model: string = 'claude-3-5-sonnet-20241022'
  ): Promise<number> {
    // Model-specific conversion rates (tokens per second)
    const conversionRates: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 1000, output: 500 },
      'claude-3-opus-20240229': { input: 800, output: 400 },
      'claude-3-haiku-20240307': { input: 2000, output: 1000 }
    };

    // Fallback to default rates for noUncheckedIndexedAccess safety
    const defaultRates = { input: 1000, output: 500 };
    const rates = conversionRates[model] ?? defaultRates;

    const inputSeconds = Math.ceil(inputTokens / rates.input);
    const outputSeconds = Math.ceil(outputTokens / rates.output);

    return Math.max(1, inputSeconds + outputSeconds); // Minimum 1 second
  }

  /**
   * Get migration phase estimates
   */
  async getPhaseEstimates(sourceUrl: string, projectSize: 'small' | 'medium' | 'large'): Promise<MigrationPhaseEstimate[]> {
    const basePhaseDurations = {
      small: {
        ANALYZE: 120,   // 2 minutes
        PLAN: 180,      // 3 minutes
        TRANSFORM: 600, // 10 minutes
        VERIFY: 60,     // 1 minute
        DEPLOY: 120     // 2 minutes
      },
      medium: {
        ANALYZE: 300,   // 5 minutes
        PLAN: 600,      // 10 minutes
        TRANSFORM: 1200, // 20 minutes
        VERIFY: 120,    // 2 minutes
        DEPLOY: 180     // 3 minutes
      },
      large: {
        ANALYZE: 600,   // 10 minutes
        PLAN: 900,      // 15 minutes
        TRANSFORM: 2400, // 40 minutes
        VERIFY: 300,    // 5 minutes
        DEPLOY: 300     // 5 minutes
      }
    };

    const durations = basePhaseDurations[projectSize];

    return Object.entries(durations).map(([phase, seconds]) => ({
      phase: phase as MigrationPhaseEstimate['phase'],
      estimatedSeconds: seconds,
      confidence: 'medium' as const // TODO: Improve with historical data
    }));
  }

  /**
   * Check migration budget with comprehensive enforcement
   */
  async checkBudgetAndEnforce(
    userId: string,
    migrationId: string,
    phase: string,
    estimatedSeconds: number,
    budget?: MigrationBudget,
    consumed?: number
  ): Promise<BudgetCheckResult> {
    const migrationBudget = budget || await this.getMigrationBudget(migrationId);
    const consumedTime = consumed !== undefined ? consumed : await this.getConsumedTime(migrationId);
    const balance = await aiTimeBillingService.getUserBalance(userId);
    const remaining = balance.total - estimatedSeconds;
    const nextPhaseEstimate = await this.getNextPhaseEstimate(migrationId, phase);

    // Check per-phase cap
    if (estimatedSeconds > migrationBudget.perPhaseCapSeconds) {
      return {
        canProceed: false,
        remainingBalance: balance.total,
        estimatedCost: estimatedSeconds,
        warningType: 'PHASE_LIMIT',
        warningMessage: `Phase would exceed budget limit: ${migrationBudget.perPhaseCapSeconds}s`
      };
    }

    // Check total migration cap
    if (consumedTime + estimatedSeconds > migrationBudget.hardBudgetSeconds) {
      return {
        canProceed: false,
        remainingBalance: balance.total,
        estimatedCost: estimatedSeconds,
        warningType: 'BUDGET_NEAR_LIMIT',
        warningMessage: `Migration would exceed total budget: ${migrationBudget.hardBudgetSeconds}s`
      };
    }

    // Check user balance
    if (balance.total < estimatedSeconds) {
      return {
        canProceed: false,
        remainingBalance: balance.total,
        estimatedCost: estimatedSeconds,
        warningType: 'INSUFFICIENT_BALANCE',
        warningMessage: `Insufficient AI time: ${estimatedSeconds}s required, ${balance.total}s available`
      };
    }

    // Check if approaching limits
    let warningType: BudgetCheckResult['warningType'];
    let warningMessage: string | undefined;

    if (remaining < nextPhaseEstimate) {
      warningType = 'BUDGET_NEAR_LIMIT';
      warningMessage = `Low balance: ${remaining}s remaining, next phase needs ~${nextPhaseEstimate}s`;

      // Emit domain event for monitoring
      await this.emitBudgetWarning(migrationId, remaining, nextPhaseEstimate);
    }

    return {
      canProceed: true,
      remainingBalance: balance.total,
      estimatedCost: estimatedSeconds,
      nextPhaseEstimate,
      warningType,
      warningMessage
    };
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private async getMigrationBudget(migrationId: string): Promise<MigrationBudget> {
    if (!pool) {
      // Default budget limits
      return {
        softBudgetSeconds: 1800, // 30 minutes
        hardBudgetSeconds: 3600, // 60 minutes
        perPhaseCapSeconds: 1200  // 20 minutes per phase
      };
    }

    const query = `
      SELECT
        soft_budget_seconds,
        hard_budget_seconds,
        COALESCE(soft_budget_seconds::float / 5, 1200) as per_phase_cap_seconds
      FROM migration_projects
      WHERE id = $1
    `;

    const result = await pool.query(query, [migrationId]);

    if (result.rows.length === 0) {
      throw new Error(`Migration project not found: ${migrationId}`);
    }

    const row = result.rows[0];

    return {
      softBudgetSeconds: row.soft_budget_seconds || 1800,
      hardBudgetSeconds: row.hard_budget_seconds || 3600,
      perPhaseCapSeconds: Math.floor(row.per_phase_cap_seconds) || 1200
    };
  }

  private async getConsumedTime(migrationId: string): Promise<number> {
    if (!pool) {
      return 0;
    }

    const query = `
      SELECT COALESCE(ai_time_consumed_seconds, 0) as consumed
      FROM migration_projects
      WHERE id = $1
    `;

    const result = await pool.query(query, [migrationId]);
    return result.rows.length > 0 ? (result.rows[0].consumed || 0) : 0;
  }

  private async getNextPhaseEstimate(migrationId: string, currentPhase: string): Promise<number> {
    const phaseOrder = ['ANALYZE', 'PLAN', 'TRANSFORM', 'VERIFY', 'DEPLOY'];
    const currentIndex = phaseOrder.indexOf(currentPhase);

    if (currentIndex === -1 || currentIndex >= phaseOrder.length - 1) {
      return 0; // No next phase
    }

    // Return estimate for next phase (simplified)
    const estimates: Record<string, number> = {
      ANALYZE: 300,
      PLAN: 600,
      TRANSFORM: 1200,
      VERIFY: 120,
      DEPLOY: 180
    };

    const nextPhase = phaseOrder[currentIndex + 1];
    return (nextPhase && estimates[nextPhase]) || 300;
  }

  private async storeTrackingContext(
    migrationId: string,
    phase: string,
    context: any
  ): Promise<void> {
    if (!pool) return;

    const trackingId = `migration-${migrationId}-${phase}`;

    const query = `
      INSERT INTO migration_tracking_context (tracking_id, migration_id, phase, context_data, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (tracking_id) DO UPDATE SET
        context_data = $4,
        updated_at = NOW()
    `;

    await pool.query(query, [trackingId, migrationId, phase, JSON.stringify(context)]);
  }

  private async getTrackingContext(trackingId: string): Promise<any | null> {
    if (!pool) return null;

    const query = `
      SELECT context_data
      FROM migration_tracking_context
      WHERE tracking_id = $1
    `;

    const result = await pool.query(query, [trackingId]);

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].context_data);
  }

  private async cleanupTrackingContext(trackingId: string): Promise<void> {
    if (!pool) return;

    const query = `
      DELETE FROM migration_tracking_context
      WHERE tracking_id = $1
    `;

    await pool.query(query, [trackingId]);
  }

  private async updateMigrationConsumption(
    migrationId: string,
    billableSeconds: number,
    phase: string,
    success: boolean
  ): Promise<void> {
    if (!pool) return;

    const query = `
      UPDATE migration_projects
      SET
        ai_time_consumed_seconds = COALESCE(ai_time_consumed_seconds, 0) + $2,
        updated_at = NOW()
      WHERE id = $1
    `;

    await pool.query(query, [migrationId, billableSeconds]);

    // Log phase completion
    unifiedLogger.system('ai_time_consumed', 'info', 'Migration phase AI time updated', {
      migrationId,
      phase,
      billableSeconds,
      success
    });
  }

  private async emitBudgetWarning(
    migrationId: string,
    remaining: number,
    nextPhaseEstimate: number
  ): Promise<void> {
    // This would integrate with domain event system for monitoring/alerting
    unifiedLogger.system('warning', 'warn', 'Migration budget warning', {
      migrationId,
      remaining,
      nextPhaseEstimate,
      event: 'BUDGET_NEAR_LIMIT'
    });
  }
}

// Export singleton instance
export const migrationAITimeService = new MigrationAITimeService();