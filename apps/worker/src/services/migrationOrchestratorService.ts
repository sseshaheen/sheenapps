/**
 * Migration Orchestrator Service (AI-Forward Architecture)
 *
 * Orchestrates the AI-forward website migration process:
 * 1. Initialize migration with user brief
 * 2. Verify site ownership with security measures
 * 3. Execute 4-agent AI pipeline with audit trails
 * 4. Apply quality gates and budget controls
 * 5. Deliver production-ready Next.js project
 */

import { getPool } from './database';
import { unifiedLogger } from './unifiedLogger';
import { AIMigrationService, UserBrief } from './aiMigrationService';
import { migrationVerificationService } from './migrationVerificationService';
import { migrationAnalyticsService } from './migrationAnalyticsService';
import { enterpriseMigrationService } from './enterpriseMigrationService';
import { migrationSSEService } from './migrationSSEService';
import { WebsiteCrawlerService, ShallowAnalysisResult, CrawlResult } from './websiteCrawlerService';
import { MigrationPlanningService, MigrationPlan } from './migrationPlanningService';
import { CodeGenerationService, GeneratedProject } from './codeGenerationService';
import { EnhancedCodeGenerationService } from './enhancedCodeGenerationService';
import { AssetPipelineService, AssetUrl } from './assetPipelineService';
// import { AIToolboxService } from './aiToolboxService'; // TODO: Implement
// import { QualityGatesService } from './qualityGatesService'; // TODO: Implement
import { ulid } from 'ulid';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SecurePathValidator } from '../utils/securePathValidator';

export interface MigrationProject {
  id: string;
  userId: string;
  sourceUrl: string;
  normalizedSourceUrl?: string;
  userPrompt?: string;
  status: MigrationStatus;
  verificationMethod?: 'dns' | 'file' | 'manual';
  verificationTokenHash?: string;
  verificationExpiresAt?: Date;
  verificationVerifiedAt?: Date;
  runSeed?: number;
  toolContractVersion?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  targetProjectId?: string;
  config: Record<string, any>;
  errorMessage?: string;
}

export type MigrationStatus = 'analyzing' | 'questionnaire' | 'processing' | 'completed' | 'failed';

export interface StartMigrationParams {
  userId: string;
  sourceUrl: string;
  userPrompt?: string;
}

export interface VerifyOwnershipParams {
  migrationId: string;
  method: 'dns' | 'file';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  token?: string | undefined;
}

export interface MigrationBudget {
  max_tokens: number;
  max_tool_calls: number;
  max_wall_minutes: number;
  token_cost_cap: number;
}

export class MigrationOrchestratorService {
  private pool = getPool();
  private aiService = new AIMigrationService();
  // private toolboxService = new AIToolboxService(); // TODO: Implement
  // private qualityService = new QualityGatesService(); // TODO: Implement

  // Default budgets by risk appetite
  private readonly DEFAULT_BUDGETS: Record<string, MigrationBudget> = {
    conservative: {
      max_tokens: 2000000,
      max_tool_calls: 400,
      max_wall_minutes: 30,
      token_cost_cap: 25
    },
    balanced: {
      max_tokens: 3000000,
      max_tool_calls: 600,
      max_wall_minutes: 45,
      token_cost_cap: 40
    },
    bold: {
      max_tokens: 5000000,
      max_tool_calls: 800,
      max_wall_minutes: 60,
      token_cost_cap: 60
    }
  };

  /**
   * Start a new AI-forward migration project
   */
  async startMigration(params: StartMigrationParams): Promise<MigrationProject> {
    const { userId, sourceUrl, userPrompt } = params;

    try {
      // Validate and normalize URL
      const url = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }

      const normalizedUrl = this.normalizeUrl(sourceUrl);

      // Generate verification token and seed
      const verificationToken = ulid();
      const verificationTokenHash = this.hashToken(verificationToken);
      const runSeed = Math.floor(Math.random() * 1000000);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const client = await this.pool.connect();
      try {
        // Check for existing active migration
        const existingResult = await client.query(`
          SELECT id FROM migration_projects
          WHERE user_id = $1 AND normalized_source_url = $2
          AND status IN ('analyzing', 'processing', 'questionnaire')
        `, [userId, normalizedUrl]);

        if (existingResult.rows.length > 0) {
          throw new Error('Active migration already exists for this URL');
        }

        const result = await client.query(`
          INSERT INTO migration_projects (
            user_id, source_url, normalized_source_url, user_prompt,
            verification_token_hash, verification_expires_at,
            run_seed, tool_contract_version, config
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          userId, sourceUrl, normalizedUrl, userPrompt,
          verificationTokenHash, expiresAt,
          runSeed, '1.0.0', {}
        ]);

        const migration = this.mapMigrationProject(result.rows[0]);

        // Return verification token to user (not stored in DB)
        (migration as any).verificationToken = verificationToken;

        // Track migration start in analytics
        await migrationAnalyticsService.trackMigrationMetrics(
          migration.id,
          'started',
          {
            sourceUrl: normalizedUrl,
            hasUserPrompt: !!userPrompt,
            userAgent: 'migration-orchestrator'
          }
        );

        // Send real-time update
        const phaseUpdateEvent = migrationSSEService.createPhaseUpdateEvent(
          migration.id,
          'ANALYZE',
          0,
          undefined, // previousPhase
          [], // tools
          300 // estimatedDuration
        );

        await migrationSSEService.broadcastMigrationUpdate(migration.id, phaseUpdateEvent);

        unifiedLogger.system('startup', 'info', 'Migration project started', {
          migrationId: migration.id,
          userId,
          sourceUrl: normalizedUrl
        });

        return migration;
      } finally {
        client.release();
      }
    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to start migration', {
        error: (error as Error).message,
        userId,
        sourceUrl
      });
      throw new Error(`Failed to start migration: ${(error as Error).message}`);
    }
  }

  /**
   * Verify site ownership with enhanced security
   */
  async verifyOwnership(params: VerifyOwnershipParams): Promise<{ verified: boolean; message: string }> {
    const { migrationId, method, token } = params;

    const client = await this.pool.connect();
    try {
      // Get migration project
      const migrationResult = await client.query(`
        SELECT * FROM migration_projects
        WHERE id = $1 AND verification_expires_at > NOW()
      `, [migrationId]);

      if (migrationResult.rows.length === 0) {
        return { verified: false, message: 'Migration not found or verification expired' };
      }

      const migration = migrationResult.rows[0];

      // Verify token if provided
      if (token && !this.verifyToken(token, migration.verification_token_hash)) {
        return { verified: false, message: 'Invalid verification token' };
      }

      // Check verification status using verification service
      let verified = false;
      let message = 'Verification failed';

      if (method === 'dns') {
        // Use DNS verification
        const recordName = `_sheenverify.${new URL(migration.source_url).hostname}`;
        try {
          const { promises: dns } = await import('dns');
          const txtRecords = await dns.resolveTxt(recordName);

          for (const record of txtRecords) {
            const recordValue = Array.isArray(record) ? record.join('') : record;
            if (recordValue.trim() === token?.trim()) {
              verified = true;
              message = 'DNS verification successful';
              break;
            }
          }

          if (!verified) {
            message = 'DNS TXT record not found or incorrect';
          }
        } catch (error) {
          message = `DNS verification failed: ${(error as Error).message}`;
        }
      } else if (method === 'file') {
        // Use file verification
        try {
          const domain = new URL(migration.source_url).hostname;
          const fileName = `sheenverify-${token?.substring(0, 8)}.txt`;
          const fileUrl = `https://${domain}/.well-known/${fileName}`;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          try {
            const response = await fetch(fileUrl, {
              method: 'GET',
              signal: controller.signal,
              headers: { 'User-Agent': 'SheenApps Migration Verification Bot/1.0' },
              redirect: 'follow',
              credentials: 'omit'
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              const content = await response.text();
              if (content.trim() === token?.trim()) {
                verified = true;
                message = 'File verification successful';
              } else {
                message = 'File content does not match verification token';
              }
            } else {
              message = `File not accessible: ${response.status} ${response.statusText}`;
            }
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              message = 'File verification timed out';
            } else {
              message = `File verification failed: ${(fetchError as Error).message}`;
            }
          }
        } catch (error) {
          message = `File verification error: ${(error as Error).message}`;
        }
      }

      const verificationResult = { success: verified, message };

      const isVerified = verificationResult.success;
      const resultMessage = verificationResult.message;

      if (verified) {
        // Update migration project
        await client.query(`
          UPDATE migration_projects
          SET verification_method = $2, verification_verified_at = NOW(),
              status = 'processing', updated_at = NOW()
          WHERE id = $1
        `, [migrationId, method]);

        // Track verification success
        await migrationAnalyticsService.trackMigrationMetrics(
          migrationId,
          'started', // Continue tracking as started until processing begins
          {
            verificationMethod: method,
            verificationTime: Date.now()
          }
        );

        // Send real-time update
        const verificationEvent = migrationSSEService.createLogEvent(
          migrationId,
          'PLAN',
          10,
          'info',
          `Domain verification successful via ${method}`,
          { verificationMethod: method }
        );

        await migrationSSEService.broadcastMigrationUpdate(migrationId, verificationEvent);

        // Start AI processing pipeline
        this.executeAIPipeline(migrationId).catch(error => {
          unifiedLogger.system('error', 'error', 'AI pipeline failed', {
            migrationId,
            error: (error as Error).message
          });

          // Track pipeline failure
          migrationAnalyticsService.trackMigrationMetrics(
            migrationId,
            'failed',
            { error: (error as Error).message, stage: 'ai_pipeline' }
          ).catch(() => {}); // Don't fail on analytics errors
        });
      } else {
        // Send real-time update for failed verification
        const failedVerificationEvent = migrationSSEService.createLogEvent(
          migrationId,
          'ANALYZE',
          0,
          'error',
          `Verification failed: ${resultMessage}`,
          { verificationMethod: method }
        );

        await migrationSSEService.broadcastMigrationUpdate(migrationId, failedVerificationEvent);
      }

      unifiedLogger.system('startup', 'info', 'Ownership verification attempt', {
        migrationId,
        method,
        isVerified,
        resultMessage
      });

      return { verified: isVerified, message: resultMessage };

    } finally {
      client.release();
    }
  }

  /**
   * Get migration project with status (requires userId for authorization)
   */
  async getMigrationProject(migrationId: string, userId: string): Promise<MigrationProject | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM migration_projects
        WHERE id = $1 AND user_id = $2
      `, [migrationId, userId]);

      return result.rows[0] ? this.mapMigrationProject(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  /**
   * Get migration project by ID only (internal use - no auth check)
   * Use this for internal service calls where userId is not available
   */
  private async getMigrationProjectById(migrationId: string): Promise<MigrationProject | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM migration_projects
        WHERE id = $1
      `, [migrationId]);

      return result.rows[0] ? this.mapMigrationProject(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  /**
   * Update or create user brief
   */
  async updateUserBrief(migrationId: string, userId: string, brief: UserBrief): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Verify ownership
      const migrationResult = await client.query(`
        SELECT id FROM migration_projects
        WHERE id = $1 AND user_id = $2
      `, [migrationId, userId]);

      if (migrationResult.rows.length === 0) {
        throw new Error('Migration project not found');
      }

      // Upsert user brief
      await client.query(`
        INSERT INTO migration_user_brief (
          migration_project_id, goals, style_preferences, framework_preferences,
          content_tone, non_negotiables, risk_appetite, custom_instructions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (migration_project_id)
        DO UPDATE SET
          goals = $2,
          style_preferences = $3,
          framework_preferences = $4,
          content_tone = $5,
          non_negotiables = $6,
          risk_appetite = $7,
          custom_instructions = $8,
          updated_at = NOW()
      `, [
        migrationId,
        brief.goals,
        brief.style_preferences,
        brief.framework_preferences,
        brief.content_tone,
        brief.non_negotiables,
        brief.risk_appetite,
        brief.custom_instructions
      ]);

      unifiedLogger.system('startup', 'info', 'User brief updated', {
        migrationId,
        userId,
        goals: brief.goals,
        risk_appetite: brief.risk_appetite
      });

    } finally {
      client.release();
    }
  }

  /**
   * Get user brief for migration
   */
  async getUserBrief(migrationId: string, userId: string): Promise<UserBrief | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT mb.* FROM migration_user_brief mb
        JOIN migration_projects mp ON mp.id = mb.migration_project_id
        WHERE mb.migration_project_id = $1 AND mp.user_id = $2
      `, [migrationId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        goals: row.goals,
        style_preferences: row.style_preferences,
        framework_preferences: row.framework_preferences,
        content_tone: row.content_tone,
        non_negotiables: row.non_negotiables,
        risk_appetite: row.risk_appetite,
        custom_instructions: row.custom_instructions
      };
    } finally {
      client.release();
    }
  }

  /**
   * Add user nudge during migration
   */
  async addUserNudge(migrationId: string, userId: string, nudge: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Update custom instructions with nudge
      await client.query(`
        UPDATE migration_user_brief mb
        SET custom_instructions = COALESCE(mb.custom_instructions, '') || $3,
            updated_at = NOW()
        FROM migration_projects mp
        WHERE mb.migration_project_id = mp.id
        AND mp.id = $1 AND mp.user_id = $2
      `, [migrationId, userId, `\n\nUser nudge: ${nudge}`]);

      unifiedLogger.system('startup', 'info', 'User nudge added', {
        migrationId,
        userId,
        nudge: nudge.substring(0, 100) + '...'
      });

    } finally {
      client.release();
    }
  }

  /**
   * Cancel running migration
   */
  async cancelMigration(migrationId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE migration_projects
        SET status = 'failed', error_message = 'Cancelled by user', updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status IN ('analyzing', 'processing')
      `, [migrationId, userId]);

      // Cancel running phases
      await client.query(`
        UPDATE migration_phases
        SET status = 'skipped', completed_at = NOW()
        WHERE migration_project_id = $1 AND status IN ('pending', 'running')
      `, [migrationId]);

      // Track cancellation in analytics
      await migrationAnalyticsService.trackMigrationMetrics(
        migrationId,
        'cancelled',
        {
          cancelledBy: 'user',
          cancelledAt: Date.now()
        }
      );

      // Send real-time update
      const cancellationEvent = migrationSSEService.createLogEvent(
        migrationId,
        'ANALYZE',
        0,
        'info',
        'Migration cancelled by user',
        { cancelledBy: 'user' }
      );

      await migrationSSEService.broadcastMigrationUpdate(migrationId, cancellationEvent);

      unifiedLogger.system('startup', 'info', 'Migration cancelled', {
        migrationId,
        userId
      });

    } finally {
      client.release();
    }
  }

  /**
   * Get migration phases with progress
   */
  async getMigrationPhases(migrationId: string, userId: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT mp.* FROM migration_phases mp
        JOIN migration_projects mproj ON mproj.id = mp.migration_project_id
        WHERE mp.migration_project_id = $1 AND mproj.user_id = $2
        ORDER BY mp.phase_order
      `, [migrationId, userId]);

      return result.rows.map(row => ({
        id: row.id,
        migrationProjectId: row.migration_project_id,
        phaseName: row.phase_name,
        phaseOrder: row.phase_order,
        status: row.status,
        claudeSessionId: row.claude_session_id,
        promptHash: row.prompt_hash,
        model: row.model,
        toolContractVersion: row.tool_contract_version,
        inputData: row.input_data,
        outputData: row.output_data,
        errorMessage: row.error_message,
        startedAt: row.started_at,
        completedAt: row.completed_at
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Execute AI pipeline with website analysis and security checks
   * Week 2 Implementation: Real website crawling with SSRF protection
   */
  private async executeAIPipeline(migrationId: string): Promise<void> {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // 0. Get migration project to check verification status
      const migration = await this.getMigrationProjectById(migrationId);
      if (!migration) {
        throw new Error('Migration not found');
      }

      // 🔥 SECURITY: Check ownership verification status
      if (!migration.verificationVerifiedAt) {
        // Only shallow analysis allowed without verification
        await this.broadcastProgress(migrationId, 'ANALYZE', 0, 'Starting preliminary analysis...');

        const shallowResult = await this.runShallowAnalysis(migrationId);

        await this.broadcastProgress(
          migrationId,
          'ANALYZE',
          10,
          `Preview complete: "${shallowResult.title}". Verify ownership to continue.`
        );

        // STOP HERE - don't proceed without verification
        unifiedLogger.system('startup', 'info', 'Migration paused - awaiting ownership verification', {
          migrationId,
          sourceUrl: migration.sourceUrl,
        });
        return;
      }

      // Phase 1: Deep Analysis (ONLY if verified)
      await this.broadcastProgress(migrationId, 'ANALYZE', 0, 'Starting deep website analysis...');

      const analysisResult = await this.runDeepAnalysisPhase(migrationId);

      await this.broadcastProgress(
        migrationId,
        'ANALYZE',
        25,
        `Analyzed ${analysisResult.pages.length} pages, ${analysisResult.assets.length} assets`
      );

      // Phase 2: Planning (AI-powered component analysis)
      await this.broadcastProgress(migrationId, 'PLAN', 30, 'Starting AI-powered planning...');

      const plan = await this.runPlanningPhase(migrationId, migration.userId);

      await this.broadcastProgress(
        migrationId,
        'PLAN',
        50,
        `Planning complete: ${plan.pages.length} pages, ${plan.componentLibrary.length} component types identified`
      );

      // Phase 3: Transformation (AI-powered code generation)
      await this.broadcastProgress(migrationId, 'TRANSFORM', 55, 'Starting code generation...');

      const projectId = await this.runTransformationPhase(migrationId, migration.userId, plan);

      await this.broadcastProgress(
        migrationId,
        'TRANSFORM',
        80,
        `Code generation complete: ${projectId}`
      );

      // Phase 4: Deployment (Project created and files written)
      await this.broadcastComplete(migrationId, projectId);

      // Mark migration as completed in DB
      const client = await this.pool.connect();
      try {
        await client.query(`
          UPDATE migration_projects
          SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [migrationId]);
      } finally {
        client.release();
      }

      unifiedLogger.system('startup', 'info', 'Migration pipeline completed successfully', {
        migrationId,
        pagesCrawled: analysisResult.pages.length,
      });

    } catch (error) {
      await this.broadcastFailed(migrationId, (error as Error).message);
      throw error;
    }
  }

  private async broadcastProgress(
    migrationId: string,
    phase: 'ANALYZE' | 'PLAN' | 'TRANSFORM' | 'VERIFY' | 'DEPLOY',
    progress: number,
    message: string
  ): Promise<void> {
    // 1. PERSIST TO DB FIRST
    await this.storeEvent(migrationId, {
      type: 'migration_progress',
      phase,
      progress,
      message,
      timestamp: Date.now(),
    });

    // 2. Broadcast (best-effort)
    const event = migrationSSEService.createPhaseUpdateEvent(
      migrationId,
      phase,
      progress,
      undefined,
      [],
      0
    );
    await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
  }

  private async broadcastComplete(migrationId: string, projectId: string): Promise<void> {
    // 1. PERSIST TO DB FIRST
    await this.storeEvent(migrationId, {
      type: 'migration_completed',
      projectId,
      timestamp: Date.now(),
    });

    // 2. Broadcast (best-effort)
    const event = migrationSSEService.createDoneEvent(
      migrationId,
      true,
      0,
      0,
      projectId,
      '',
      { message: 'Migration completed successfully!' }
    );
    await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
  }

  private async broadcastFailed(migrationId: string, message: string): Promise<void> {
    // 1. PERSIST TO DB FIRST
    await this.storeEvent(migrationId, {
      type: 'migration_failed',
      error: message,
      timestamp: Date.now(),
    });

    // 2. Broadcast (best-effort)
    const event = migrationSSEService.createErrorEvent(
      migrationId,
      'TRANSFORM',
      0,
      'MIGRATION_FAILED',
      message,
      false,
      {}
    );
    await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
  }

  /**
   * Public wrapper for executing migration pipeline (called by worker)
   */
  async executeMigrationPipeline(migrationId: string, userId: string): Promise<void> {
    return this.executeAIPipeline(migrationId);
  }

  /**
   * Claim exclusive lease on migration (prevents concurrent execution)
   * Returns true if lease acquired, false if already claimed
   */
  async claimMigrationLease(migrationId: string): Promise<boolean> {
    const workerId = `worker:${process.pid}:${Date.now()}`;
    const leaseMinutes = 30; // Max execution time

    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        UPDATE migration_projects
        SET
          locked_at = NOW(),
          locked_by = $2,
          lease_expires_at = NOW() + INTERVAL '${leaseMinutes} minutes'
        WHERE id = $1
          AND (
            locked_at IS NULL
            OR lease_expires_at < NOW() -- Claim if expired
          )
        RETURNING id
      `, [migrationId, workerId]);

      const claimed = result.rowCount! > 0;

      if (claimed) {
        unifiedLogger.system('startup', 'info', 'Migration lease claimed', {
          migrationId,
          workerId,
          expiresInMinutes: leaseMinutes,
        });
      }

      return claimed;

    } finally {
      client.release();
    }
  }

  /**
   * Release migration lease (call in finally block)
   */
  async releaseMigrationLease(migrationId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE migration_projects
        SET
          locked_at = NULL,
          locked_by = NULL,
          lease_expires_at = NULL
        WHERE id = $1
      `, [migrationId]);

      unifiedLogger.system('startup', 'info', 'Migration lease released', {
        migrationId,
      });

    } finally {
      client.release();
    }
  }

  /**
   * Mark migration as failed (called on error)
   */
  async markMigrationFailed(migrationId: string, error: Error): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE migration_projects
        SET status = 'failed', error_message = $2, updated_at = NOW()
        WHERE id = $1
      `, [migrationId, error.message]);

      unifiedLogger.system('error', 'error', 'Migration marked as failed', {
        migrationId,
        error: error.message,
      });

    } catch (dbError) {
      // Log but don't throw - we don't want to mask the original error
      unifiedLogger.system('error', 'error', 'Failed to mark migration as failed', {
        migrationId,
        originalError: error.message,
        dbError: (dbError as Error).message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Run shallow analysis (safe preview - NO verification needed)
   * Fetches only homepage for preview before ownership verification
   */
  async runShallowAnalysis(migrationId: string): Promise<ShallowAnalysisResult> {
    unifiedLogger.system('startup', 'info', 'Starting shallow analysis', { migrationId });

    // Check if shallow analysis already exists (idempotency)
    const existing = await this.getExistingAnalysis(migrationId, 'preliminary');
    if (existing) {
      unifiedLogger.system('startup', 'info', 'Reusing existing shallow analysis', { migrationId });
      return existing;
    }

    const migration = await this.getMigrationProjectById(migrationId);
    if (!migration) {
      throw new Error('Migration not found');
    }

    const crawler = new WebsiteCrawlerService();
    const result = await crawler.crawlShallow(migration.sourceUrl);

    // Store in DB
    await this.storeAnalysis(migrationId, 'preliminary', result);

    unifiedLogger.system('startup', 'info', 'Shallow analysis complete', {
      migrationId,
      title: result.title,
      statusCode: result.statusCode,
    });

    return result;
  }

  /**
   * Run deep analysis phase (ONLY after ownership verification)
   * Full website crawl with link following
   */
  async runDeepAnalysisPhase(migrationId: string): Promise<CrawlResult> {
    unifiedLogger.system('startup', 'info', 'Starting deep analysis', { migrationId });

    // Check if deep analysis already exists (idempotency)
    const existing = await this.getExistingAnalysis(migrationId, 'detailed');
    if (existing) {
      unifiedLogger.system('startup', 'info', 'Reusing existing deep analysis', { migrationId });
      return existing;
    }

    const migration = await this.getMigrationProjectById(migrationId);
    if (!migration) {
      throw new Error('Migration not found');
    }

    // SECURITY: Check ownership verification
    if (!migration.verificationVerifiedAt) {
      throw new Error('Ownership verification required for deep analysis');
    }

    const crawler = new WebsiteCrawlerService();
    const result = await crawler.crawlWebsite(migration.sourceUrl, 50);

    // Store in DB
    await this.storeAnalysis(migrationId, 'detailed', result);

    unifiedLogger.system('startup', 'info', 'Deep analysis complete', {
      migrationId,
      pagesCrawled: result.pages.length,
      assetsFound: result.assets.length,
    });

    return result;
  }

  /**
   * Get existing analysis from DB (idempotency check)
   */
  private async getExistingAnalysis(
    migrationId: string,
    analysisType: string
  ): Promise<any | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT data
        FROM migration_analysis
        WHERE migration_project_id = $1 AND analysis_type = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [migrationId, analysisType]);

      return result.rows[0]?.data || null;

    } finally {
      client.release();
    }
  }

  /**
   * Store analysis result in DB
   */
  private async storeAnalysis(
    migrationId: string,
    analysisType: string,
    data: any
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO migration_analysis (migration_project_id, analysis_type, data)
        VALUES ($1, $2, $3)
      `, [migrationId, analysisType, data]);

      unifiedLogger.system('startup', 'info', 'Analysis stored in DB', {
        migrationId,
        analysisType,
      });

    } finally {
      client.release();
    }
  }

  /**
   * Store event in migration_events table (persist before broadcasting)
   */
  private async storeEvent(migrationId: string, eventData: any): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO migration_events (migration_project_id, type, payload)
        VALUES ($1, $2, $3)
      `, [migrationId, eventData.type, eventData]);

    } catch (error) {
      // Log but don't throw - events are best-effort
      unifiedLogger.system('error', 'warn', 'Failed to store event', {
        migrationId,
        error: (error as Error).message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Run planning phase (AI-powered component analysis)
   * Idempotent: checks DB first, runs AI if needed
   */
  async runPlanningPhase(migrationId: string, userId: string): Promise<MigrationPlan> {
    unifiedLogger.system('startup', 'info', 'Starting planning phase', { migrationId });

    // 1. Check if plan already exists (idempotency)
    const existingPlan = await this.getExistingAnalysis(migrationId, 'planning');
    if (existingPlan) {
      unifiedLogger.system('startup', 'info', 'Reusing existing migration plan', { migrationId });
      return existingPlan;
    }

    // 2. Get deep analysis results
    const deepAnalysis = await this.getExistingAnalysis(migrationId, 'detailed');
    if (!deepAnalysis) {
      throw new Error('Deep analysis not found - run analysis phase first');
    }

    // 3. Get user brief (or use defaults)
    let userBrief = await this.getUserBrief(migrationId, userId);
    if (!userBrief) {
      // Default user brief if not provided
      userBrief = {
        goals: 'modernize',
        style_preferences: {
          typography: 'minimal',
          spacing: 'normal',
          motion: 'subtle',
        },
        framework_preferences: {
          strict_url_preservation: false,
          allow_route_consolidation: true,
          prefer_ssg: true,
        },
        risk_appetite: 'balanced',
      };
    }

    // 4. Run AI planning
    const planningService = new MigrationPlanningService();
    const plan = await planningService.generatePlan(deepAnalysis, userBrief);

    // 5. Store plan in DB
    await this.storeAnalysis(migrationId, 'planning', plan);

    // 6. Store URL mappings in migration_map table
    await this.storeUrlMappings(migrationId, plan.urlMappings);

    unifiedLogger.system('startup', 'info', 'Planning phase complete', {
      migrationId,
      pagesPlanned: plan.pages.length,
      componentsIdentified: plan.componentLibrary.length,
      urlMappings: plan.urlMappings.length,
    });

    return plan;
  }

  /**
   * Store URL mappings in migration_map table
   */
  private async storeUrlMappings(
    migrationId: string,
    mappings: Array<{ sourceUrl: string; targetRoute: string; redirectCode: number; reason: string }>
  ): Promise<void> {
    if (mappings.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      // Use batch insert for efficiency
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      mappings.forEach(mapping => {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
        params.push(
          migrationId,
          mapping.sourceUrl,
          mapping.targetRoute,
          mapping.redirectCode,
          JSON.stringify({ reason: mapping.reason })
        );
        paramIndex += 5;
      });

      const query = `
        INSERT INTO migration_map (
          migration_project_id,
          src_url,
          target_route,
          redirect_code,
          meta_data
        )
        VALUES ${values.join(', ')}
        ON CONFLICT (migration_project_id, src_url)
        DO UPDATE SET
          target_route = EXCLUDED.target_route,
          redirect_code = EXCLUDED.redirect_code,
          meta_data = EXCLUDED.meta_data
      `;

      await client.query(query, params);

      unifiedLogger.system('startup', 'info', 'URL mappings stored', {
        migrationId,
        count: mappings.length,
      });

    } finally {
      client.release();
    }
  }

  /**
   * Run transformation phase (AI-powered code generation)
   * Generates Next.js 15 project from migration plan
   * Idempotent: checks DB first, generates code if needed
   */
  async runTransformationPhase(
    migrationId: string,
    userId: string,
    plan: MigrationPlan
  ): Promise<string> {
    unifiedLogger.system('startup', 'info', 'Starting transformation phase', { migrationId });

    // 1. Check if project already generated (idempotency)
    const migration = await this.getMigrationProject(migrationId, userId);
    if (!migration) {
      throw new Error('Migration project not found');
    }
    if (migration.targetProjectId) {
      unifiedLogger.system('startup', 'info', 'Project already generated, reusing', {
        migrationId,
        projectId: migration.targetProjectId,
      });
      return migration.targetProjectId;
    }

    // 2. Generate code with AI (Phase 5: Hierarchical generation with compile-repair)
    const codeGenService = new CodeGenerationService();
    const enhancedService = new EnhancedCodeGenerationService();
    const projectName = this.generateProjectName(plan);

    // Step 2a: Generate infrastructure and design system (template-based)
    await this.broadcastProgress(migrationId, 'TRANSFORM', 50, 'Generating project infrastructure...');
    const baseProject = await codeGenService.generateProject(plan, projectName);

    // Step 2b: Create temporary project directory for compile-repair loop
    const projectPath = await this.createTempProjectDir(userId, projectName);

    // Write infrastructure files first (needed for TypeScript compilation)
    const infraFiles = baseProject.files.filter(f => f.type === 'config' || f.type === 'style');
    for (const file of infraFiles) {
      const filePath = path.join(projectPath, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf8');
    }

    // Step 2c: Generate components with AI (hierarchical + compile-repair)
    await this.broadcastProgress(migrationId, 'TRANSFORM', 60, 'Generating components with AI (Pass 1: Shared foundation)...');
    const componentResults = await enhancedService.generateProjectEnhanced(plan, projectPath);

    await this.broadcastProgress(migrationId, 'TRANSFORM', 65, 'Component generation complete, assembling project...');

    // Step 2d: Process assets (Phase 5: Selective downloading with optimization)
    await this.broadcastProgress(migrationId, 'TRANSFORM', 67, 'Processing assets (downloading and optimizing)...');
    const assetPipeline = new AssetPipelineService();
    // Get source URL from first page's original URL (all pages share same origin)
    const sourceUrl = plan.pages[0]?.originalUrl || '';
    const assetUrls = this.extractAssetUrls(plan);
    const assetResult = await assetPipeline.processAssets(
      assetUrls,
      sourceUrl,
      projectPath
    );

    unifiedLogger.system('startup', 'info', 'Asset pipeline complete', {
      migrationId,
      downloaded: assetResult.stats.downloaded,
      optimized: assetResult.stats.optimized,
      skipped: assetResult.stats.skipped,
      savedBytes: assetResult.stats.savedBytes,
    });

    // Combine infrastructure + AI-generated components + processed assets
    const generatedProject = await this.combineGeneratedCode(
      baseProject,
      componentResults,
      projectPath,
      assetResult.processed
    );

    await this.broadcastProgress(migrationId, 'TRANSFORM', 70, 'Creating project...');

    // 3. Create project in database
    const project = await this.createProject(userId, generatedProject);

    // 4. Write files to filesystem
    await this.broadcastProgress(migrationId, 'TRANSFORM', 75, 'Writing project files...');
    await this.writeProjectFiles(userId, project.id, generatedProject);

    // 5. Update migration with target_project_id
    await this.updateMigrationProject(migrationId, { targetProjectId: project.id });

    // 6. Store generated code in DB (for resume/audit)
    await this.storeAnalysis(migrationId, 'transformation', {
      projectId: project.id,
      filesGenerated: generatedProject.files.length,
      assetsProcessed: generatedProject.assets.length,
      metadata: generatedProject.metadata,
    });

    unifiedLogger.system('startup', 'info', 'Transformation phase complete', {
      migrationId,
      projectId: project.id,
      filesGenerated: generatedProject.files.length,
    });

    return project.id;
  }

  /**
   * Create project in database
   */
  private async createProject(
    userId: string,
    generatedProject: GeneratedProject
  ): Promise<{ id: string; name: string }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO projects (
          owner_id,
          name,
          framework,
          build_status,
          config
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name
      `, [
        userId,
        generatedProject.name,
        generatedProject.framework,
        'queued',
        JSON.stringify({
          migratedFrom: 'website-migration-tool',
          generatedAt: generatedProject.metadata.generatedAt,
          componentsCount: generatedProject.metadata.componentsCount,
          pagesCount: generatedProject.metadata.pagesCount,
        }),
      ]);

      const project = result.rows[0];

      unifiedLogger.system('startup', 'info', 'Project created in database', {
        projectId: project.id,
        projectName: project.name,
      });

      return project;

    } finally {
      client.release();
    }
  }

  /**
   * Write project files to filesystem
   */
  private async writeProjectFiles(
    userId: string,
    projectId: string,
    generatedProject: GeneratedProject
  ): Promise<void> {
    const projectRoot = SecurePathValidator.getProjectRoot(userId, projectId);

    unifiedLogger.system('startup', 'info', 'Writing project files', {
      projectId,
      projectRoot,
      filesCount: generatedProject.files.length,
      assetsCount: generatedProject.assets.length,
    });

    // Create project directory if it doesn't exist
    await fs.mkdir(projectRoot, { recursive: true });

    // Write all code files
    for (const file of generatedProject.files) {
      const filePath = path.join(projectRoot, file.path);
      const fileDir = path.dirname(filePath);

      // Create directory if needed
      await fs.mkdir(fileDir, { recursive: true });

      // Write file content
      await fs.writeFile(filePath, file.content, 'utf8');

      unifiedLogger.system('startup', 'info', 'File written', {
        projectId,
        filePath: file.path,
        size: Buffer.byteLength(file.content, 'utf8'),
      });
    }

    // Write all assets
    for (const asset of generatedProject.assets) {
      const assetPath = path.join(projectRoot, asset.localPath);
      const assetDir = path.dirname(assetPath);

      // Create directory if needed
      await fs.mkdir(assetDir, { recursive: true });

      // Write asset content (binary)
      await fs.writeFile(assetPath, asset.content);

      unifiedLogger.system('startup', 'info', 'Asset written', {
        projectId,
        assetPath: asset.localPath,
        size: asset.size,
      });
    }

    unifiedLogger.system('startup', 'info', 'All project files written', {
      projectId,
      totalFiles: generatedProject.files.length + generatedProject.assets.length,
    });
  }

  /**
   * Update migration project fields
   */
  private async updateMigrationProject(
    migrationId: string,
    updates: { targetProjectId?: string }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE migration_projects
        SET
          target_project_id = COALESCE($2, target_project_id),
          updated_at = NOW()
        WHERE id = $1
      `, [migrationId, updates.targetProjectId]);

      unifiedLogger.system('startup', 'info', 'Migration project updated', {
        migrationId,
        updates,
      });

    } finally {
      client.release();
    }
  }

  /**
   * Generate project name from plan
   */
  private generateProjectName(plan: MigrationPlan): string {
    // Use plan metadata or generate one
    const timestamp = new Date().toISOString().split('T')[0];
    return `migrated-site-${timestamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  /**
   * Create temporary project directory for compile-repair loop
   */
  private async createTempProjectDir(userId: string, projectName: string): Promise<string> {
    const tempDir = path.join('/tmp', 'migration-projects', userId, projectName);
    await fs.mkdir(tempDir, { recursive: true });
    unifiedLogger.system('startup', 'info', 'Created temporary project directory', { tempDir });
    return tempDir;
  }

  /**
   * Combine infrastructure files with AI-generated components and processed assets
   */
  private async combineGeneratedCode(
    baseProject: GeneratedProject,
    componentResults: any[],
    projectPath: string,
    processedAssets: any[] = []
  ): Promise<GeneratedProject> {
    // Filter out page and component files from base project (replaced by AI)
    const infraFiles = baseProject.files.filter(
      f => f.type === 'config' || f.type === 'style' || f.type === 'type' || f.type === 'util'
    );

    // Read AI-generated component files from disk
    const componentFiles: any[] = [];
    for (const result of componentResults) {
      if (result.success) {
        const component = result.component;
        // Determine subdirectory based on component type
        const subdir = component.type === 'page' ? 'app' : 'components';
        const filePath = path.join(projectPath, subdir, component.filename);

        try {
          const content = await fs.readFile(filePath, 'utf8');
          componentFiles.push({
            path: `${subdir}/${component.filename}`,
            content,
            type: component.type === 'page' ? 'page' : 'component',
          });
        } catch (error) {
          unifiedLogger.system('startup', 'warn', 'Failed to read generated component', {
            filename: component.filename,
            error: (error as Error).message,
          });
        }
      }
    }

    const allFiles = [...infraFiles, ...componentFiles];
    const totalSize = allFiles.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf8'), 0);

    const successCount = componentResults.filter(r => r.success).length;
    const aiGeneratedCount = componentResults.filter(r => r.success && !r.usedTemplate).length;
    const repairCount = componentResults.filter(r => r.attempts > 1).length;

    unifiedLogger.system('startup', 'info', 'Component generation statistics', {
      total: componentResults.length,
      successful: successCount,
      aiGenerated: aiGeneratedCount,
      templateFallbacks: successCount - aiGeneratedCount,
      withRepairs: repairCount,
    });

    // Convert processed assets to GeneratedAsset format
    const assets = processedAssets.map(asset => ({
      originalUrl: asset.originalUrl,
      localPath: asset.localPath,
      content: asset.content,
      mimeType: asset.mimeType,
      size: asset.size,
      optimized: asset.optimized,
    }));

    return {
      name: baseProject.name,
      framework: 'nextjs',
      files: allFiles,
      assets,
      metadata: {
        totalFiles: allFiles.length,
        totalSize,
        generatedAt: new Date(),
        componentsCount: componentFiles.length,
        pagesCount: componentFiles.filter(f => f.type === 'page').length,
      },
    };
  }

  /**
   * Extract asset URLs from migration plan
   * Currently extracts fonts from design system.
   * Note: Image extraction requires updating PagePlan/ComponentIdentification types
   * to include asset URLs from the crawl phase.
   */
  private extractAssetUrls(plan: MigrationPlan): AssetUrl[] {
    const assetUrls: AssetUrl[] = [];

    // Extract fonts from design system
    if (plan.designSystem.typography?.headingFont) {
      assetUrls.push({
        url: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(plan.designSystem.typography.headingFont)}&display=swap`,
        type: 'font',
        context: 'css',
      });
    }

    if (plan.designSystem.typography?.bodyFont &&
        plan.designSystem.typography.bodyFont !== plan.designSystem.typography.headingFont) {
      assetUrls.push({
        url: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(plan.designSystem.typography.bodyFont)}&display=swap`,
        type: 'font',
        context: 'css',
      });
    }

    // TODO: Add image URLs when PagePlan/ComponentIdentification types are extended
    // to include asset information from the crawl phase

    unifiedLogger.system('startup', 'info', 'Extracted asset URLs from plan', {
      total: assetUrls.length,
      images: assetUrls.filter(a => a.type === 'image').length,
      fonts: assetUrls.filter(a => a.type === 'font').length,
    });

    return assetUrls;
  }

  /**
   * Check budget constraints
   */
  private async checkBudget(migrationId: string): Promise<{ canProceed: boolean; reason?: string }> {
    const client = await this.pool.connect();
    try {
      // Get migration project and user brief
      const result = await client.query(`
        SELECT mp.*, mb.risk_appetite FROM migration_projects mp
        LEFT JOIN migration_user_brief mb ON mb.migration_project_id = mp.id
        WHERE mp.id = $1
      `, [migrationId]);

      if (result.rows.length === 0) {
        return { canProceed: false, reason: 'Migration not found' };
      }

      const migration = result.rows[0];
      const riskAppetite = migration.risk_appetite || 'balanced';
      // Fallback to 'balanced' defaults if riskAppetite key not found (noUncheckedIndexedAccess safety)
      let budget = this.DEFAULT_BUDGETS[riskAppetite] ?? {
        max_tokens: 3000000,
        max_tool_calls: 600,
        max_wall_minutes: 45,
        token_cost_cap: 30
      };

      // Check for enterprise custom budgets
      const orgId = migration.org_id;
      if (orgId) {
        try {
          const customBudgetResult = await client.query(`
            SELECT custom_budgets FROM organization_migration_config
            WHERE org_id = $1
          `, [orgId]);

          if (customBudgetResult.rows.length > 0 && customBudgetResult.rows[0].custom_budgets) {
            const customBudgets = JSON.parse(customBudgetResult.rows[0].custom_budgets);
            if (customBudgets.softBudgetSeconds) {
              // Convert enterprise seconds budget to token budget (rough conversion)
              budget = {
                max_tokens: customBudgets.softBudgetSeconds * 100, // Rough conversion
                max_tool_calls: budget.max_tool_calls,
                max_wall_minutes: Math.round(customBudgets.softBudgetSeconds / 60),
                token_cost_cap: budget.token_cost_cap
              };
            }
          }
        } catch (error) {
          // Continue with default budget if enterprise budget fetch fails
          unifiedLogger.system('warning', 'warn', 'Failed to get enterprise budget', {
            migrationId,
            orgId,
            error: (error as Error).message
          });
        }
      }

      // Get total token usage
      const tokenResult = await client.query(`
        SELECT COALESCE(SUM(cost_tokens), 0) as total_tokens
        FROM migration_tool_calls
        WHERE migration_project_id = $1
      `, [migrationId]);

      const totalTokens = parseInt(tokenResult.rows[0].total_tokens);

      if (totalTokens >= budget.max_tokens) {
        return { canProceed: false, reason: `Token budget exceeded: ${totalTokens}/${budget.max_tokens}` };
      }

      // Check wall time
      const startTime = new Date(migration.created_at).getTime();
      const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);

      if (elapsedMinutes >= budget.max_wall_minutes) {
        return { canProceed: false, reason: `Time budget exceeded: ${Math.round(elapsedMinutes)}/${budget.max_wall_minutes} minutes` };
      }

      return { canProceed: true };

    } finally {
      client.release();
    }
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    // Remove trailing slash, lowercase hostname, remove default ports
    let normalized = `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;

    if (parsed.port &&
        !((parsed.protocol === 'http:' && parsed.port === '80') ||
          (parsed.protocol === 'https:' && parsed.port === '443'))) {
      normalized += `:${parsed.port}`;
    }

    normalized += parsed.pathname.replace(/\/$/, '') || '/';

    if (parsed.search) {
      normalized += parsed.search;
    }

    return normalized;
  }

  /**
   * Hash verification token for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Verify token against stored hash
   */
  private verifyToken(token: string, hash: string): boolean {
    return this.hashToken(token) === hash;
  }

  /**
   * Verify DNS TXT record
   */
  private async verifyDNSRecord(url: string, token: string): Promise<boolean> {
    try {
      const { promises: dns } = await import('dns');
      const { URL } = await import('url');

      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;

      // Look for TXT record: _sheenapps-verify.<domain>
      const verificationDomain = `_sheenapps-verify.${domain}`;

      try {
        const txtRecords = await dns.resolveTxt(verificationDomain);

        // Check if any TXT record contains our token
        for (const record of txtRecords) {
          const recordValue = Array.isArray(record) ? record.join('') : record;

          if (recordValue === token || recordValue === `sheenapps-verify=${token}`) {
            unifiedLogger.system('startup', 'info', 'DNS verification successful', {
              domain: verificationDomain,
              token: token.substring(0, 8) + '...'
            });
            return true;
          }
        }

        unifiedLogger.system('startup', 'info', 'DNS verification failed - token not found', {
          domain: verificationDomain,
          foundRecords: txtRecords.length,
          token: token.substring(0, 8) + '...'
        });

      } catch (dnsError) {
        unifiedLogger.system('startup', 'info', 'DNS verification failed - record not found', {
          domain: verificationDomain,
          error: (dnsError as Error).message
        });
      }

      return false;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'DNS verification error', {
        url,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Verify file upload
   */
  private async verifyFileUpload(url: string, token: string): Promise<boolean> {
    try {
      const { URL } = await import('url');

      const parsedUrl = new URL(url);
      const verificationUrl = `${parsedUrl.protocol}//${parsedUrl.host}/.well-known/sheenapps-verify.txt`;

      // Fetch the verification file with timeout and security checks
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(verificationUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'SheenApps Migration Verification Bot/1.0'
          },
          redirect: 'follow', // Allow up to 5 redirects by default
          // Security: Don't send credentials
          credentials: 'omit'
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const content = await response.text();
          const trimmedContent = content.trim();

          // Check if the file contains exactly our token
          if (trimmedContent === token || trimmedContent === `sheenapps-verify=${token}`) {
            unifiedLogger.system('startup', 'info', 'File verification successful', {
              url: verificationUrl,
              token: token.substring(0, 8) + '...'
            });
            return true;
          } else {
            unifiedLogger.system('startup', 'info', 'File verification failed - token mismatch', {
              url: verificationUrl,
              expectedToken: token.substring(0, 8) + '...',
              foundContent: trimmedContent.substring(0, 50) + '...'
            });
          }
        } else {
          unifiedLogger.system('startup', 'info', 'File verification failed - file not accessible', {
            url: verificationUrl,
            status: response.status,
            statusText: response.statusText
          });
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          unifiedLogger.system('startup', 'info', 'File verification failed - timeout', {
            url: verificationUrl
          });
        } else {
          unifiedLogger.system('startup', 'info', 'File verification failed - fetch error', {
            url: verificationUrl,
            error: (fetchError as Error).message
          });
        }
      }

      return false;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'File verification error', {
        url,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Get organization ID for a migration project
   */
  private async getOrganizationId(migrationId: string): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT org_id FROM migration_projects
        WHERE id = $1
      `, [migrationId]);

      return result.rows[0]?.org_id || null;
    } finally {
      client.release();
    }
  }

  /**
   * Check enterprise limits for organization
   */
  private async checkEnterpriseLimits(orgId: string): Promise<{ canProceed: boolean; reason?: string }> {
    try {
      // Check concurrent migration limits
      const client = await this.pool.connect();
      try {
        const result = await client.query(`
          SELECT COUNT(*) as active_count
          FROM migration_projects mp
          WHERE mp.org_id = $1 AND mp.status IN ('analyzing', 'processing')
        `, [orgId]);

        const activeCount = parseInt(result.rows[0].active_count) || 0;

        // Get organization limits (default to 5 concurrent migrations)
        const limitsResult = await client.query(`
          SELECT migration_limits FROM organization_migration_config
          WHERE org_id = $1
        `, [orgId]);

        const limits = limitsResult.rows[0]?.migration_limits ?
          JSON.parse(limitsResult.rows[0].migration_limits) :
          { concurrentMigrations: 5 };

        if (activeCount >= limits.concurrentMigrations) {
          return {
            canProceed: false,
            reason: `Concurrent migration limit exceeded: ${activeCount}/${limits.concurrentMigrations}`
          };
        }

        return { canProceed: true };

      } finally {
        client.release();
      }
    } catch (error) {
      // Default to allowing if we can't check limits
      unifiedLogger.system('warning', 'warn', 'Failed to check enterprise limits', {
        orgId,
        error: (error as Error).message
      });
      return { canProceed: true };
    }
  }

  /**
   * Map database row to MigrationProject interface
   */
  private mapMigrationProject(row: any): MigrationProject {
    return {
      id: row.id,
      userId: row.user_id,
      sourceUrl: row.source_url,
      normalizedSourceUrl: row.normalized_source_url,
      userPrompt: row.user_prompt,
      status: row.status,
      verificationMethod: row.verification_method,
      verificationTokenHash: row.verification_token_hash,
      verificationExpiresAt: row.verification_expires_at,
      verificationVerifiedAt: row.verification_verified_at,
      runSeed: row.run_seed,
      toolContractVersion: row.tool_contract_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      targetProjectId: row.target_project_id,
      config: row.config,
      errorMessage: row.error_message
    };
  }
}