import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MigrationOrchestratorService } from '../services/migrationOrchestratorService';
import { WebsiteAnalysisService } from '../services/websiteAnalysisService';
import { AIToolboxService } from '../services/aiToolboxService';
import { migrationProjectService } from '../services/migrationProjectService';
import { migrationAITimeService } from '../services/migrationAITimeService';
import { migrationSSEService } from '../services/migrationSSEService';
import { unifiedLogger } from '../services/unifiedLogger';
import { getPool } from '../services/database';
import { enqueueMigration } from '../queue/migrationQueue';

/**
 * Website Migration Tool API Routes
 * Implements the AI-forward migration workflow with ownership verification,
 * user brief system, and quality gates.
 */

interface StartMigrationBody {
  userId: string;
  sourceUrl: string;
  userBrief?: {
    goals: 'preserve' | 'modernize' | 'uplift';
    style_preferences?: {
      colors?: string[];
      typography?: 'minimal' | 'expressive' | 'classic';
      spacing?: 'tight' | 'normal' | 'spacious';
      motion?: 'none' | 'subtle' | 'dynamic';
    };
    framework_preferences?: {
      strict_url_preservation?: boolean;
      allow_route_consolidation?: boolean;
      prefer_ssg?: boolean;
    };
    content_tone?: 'neutral' | 'marketing' | 'formal';
    non_negotiables?: {
      brand_colors?: string[];
      legal_text?: string[];
      tracking_ids?: string[];
    };
    risk_appetite?: 'conservative' | 'balanced' | 'bold';
    custom_instructions?: string;
  };
}

interface VerifyOwnershipBody {
  userId: string;
  method: 'dns' | 'file';
  token?: string;
}

interface UpdateBriefBody {
  userId: string;
  userBrief: StartMigrationBody['userBrief'];
}

interface ProcessMigrationBody {
  userId: string;
}

export async function migrationRoutes(fastify: FastifyInstance) {
  const pool = getPool();
  const orchestrator = new MigrationOrchestratorService();
  const analysisService = new WebsiteAnalysisService();
  const toolboxService = new AIToolboxService();

  // ============================================================================
  // CORE MIGRATION WORKFLOW
  // ============================================================================

  /**
   * Initialize migration with URL and optional user brief
   * POST /api/migration/start
   */
  fastify.post<{
    Body: StartMigrationBody;
    Headers: { 'idempotency-key'?: string };
  }>('/migration/start', async (request, reply) => {
    try {
      const { userId, sourceUrl, userBrief = {} } = request.body;
      const idempotencyKey = request.headers['idempotency-key'];

      // Check for existing migration with same idempotency key
      if (idempotencyKey) {
        const existingQuery = `
          SELECT id, status, created_at
          FROM migration_jobs
          WHERE idempotency_key = $1 AND stage = 'ANALYZE'
        `;
        const existing = await pool.query(existingQuery, [idempotencyKey]);

        if (existing.rows.length > 0) {
          const migration = existing.rows[0];
          return reply.code(200).send({
            migrationId: migration.id,
            status: migration.status,
            message: 'Migration already started (idempotency)',
            createdAt: migration.created_at
          });
        }
      }

      // Start new migration
      const migrationProject = await orchestrator.startMigration({
        sourceUrl,
        userId,
        userPrompt: typeof userBrief === 'string' ? userBrief : JSON.stringify(userBrief)
      });

      // Enqueue migration job for background processing
      const userPromptValue = typeof userBrief === 'string' ? userBrief : JSON.stringify(userBrief);
      await enqueueMigration({
        migrationId: migrationProject.id,
        userId,
        sourceUrl,
        userPrompt: userPromptValue,
      });

      unifiedLogger.system('startup', 'info', 'Migration queued', {
        migrationId: migrationProject.id,
        userId,
        sourceUrl,
        hasUserBrief: Object.keys(userBrief).length > 0
      });

      return reply.code(202).send({
        migrationId: migrationProject.id,
        status: 'queued',
        message: 'Migration queued successfully',
        nextSteps: ['verify_ownership', 'preliminary_analysis'],
        correlationId: migrationProject.id,
      });

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to start migration', {
        error: (error as Error).message,
        body: request.body
      });

      return reply.code(400).send({
        error: 'Failed to start migration',
        details: (error as Error).message
      });
    }
  });

  /**
   * Get migration status and progress
   * GET /api/migration/:id/status
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/status', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      const statusQuery = `
        SELECT
          mj.*,
          mp.source_url,
          mp.verification_verified_at,
          mp.target_project_id,
          mp.config
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const result = await pool.query(statusQuery, [id, userId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const migration = result.rows[0];

      return reply.send({
        migrationId: migration.id,
        status: migration.status,
        stage: migration.stage,
        progress: migration.progress,
        sourceUrl: migration.source_url,
        isVerified: !!migration.verification_verified_at,
        targetProjectId: migration.target_project_id,
        createdAt: migration.created_at,
        startedAt: migration.started_at,
        completedAt: migration.completed_at,
        errorMessage: migration.error_message
      });

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to get migration status', {
        migrationId: request.params.id,
        error: (error as Error).message
      });

      return reply.code(500).send({
        error: 'Failed to get migration status'
      });
    }
  });

  // ============================================================================
  // USER BRIEF MANAGEMENT
  // ============================================================================

  /**
   * Get current user brief
   * GET /api/migration/:id/brief
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/brief', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      const briefQuery = `
        SELECT mub.*
        FROM migration_user_brief mub
        JOIN migration_projects mp ON mp.id = mub.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const result = await pool.query(briefQuery, [id, userId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration or user brief not found'
        });
      }

      const brief = result.rows[0];

      return reply.send({
        goals: brief.goals,
        stylePreferences: brief.style_preferences,
        frameworkPreferences: brief.framework_preferences,
        contentTone: brief.content_tone,
        nonNegotiables: brief.non_negotiables,
        riskAppetite: brief.risk_appetite,
        customInstructions: brief.custom_instructions,
        updatedAt: brief.updated_at
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get user brief'
      });
    }
  });

  /**
   * Update user brief
   * PUT /api/migration/:id/brief
   */
  fastify.put<{
    Params: { id: string };
    Body: UpdateBriefBody;
  }>('/migration/:id/brief', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId, userBrief } = request.body;

      // Get migration project ID
      const migrationQuery = `
        SELECT mp.id as project_id
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const migrationResult = await pool.query(migrationQuery, [id, userId]);

      if (migrationResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const projectId = migrationResult.rows[0].project_id;

      // Update user brief
      const updateQuery = `
        UPDATE migration_user_brief
        SET
          goals = $2,
          style_preferences = $3,
          framework_preferences = $4,
          content_tone = $5,
          non_negotiables = $6,
          risk_appetite = $7,
          custom_instructions = $8,
          updated_at = NOW()
        WHERE migration_project_id = $1
      `;

      await pool.query(updateQuery, [
        projectId,
        userBrief?.goals || 'preserve',
        JSON.stringify(userBrief?.style_preferences || {}),
        JSON.stringify(userBrief?.framework_preferences || {}),
        userBrief?.content_tone,
        JSON.stringify(userBrief?.non_negotiables || {}),
        userBrief?.risk_appetite || 'balanced',
        userBrief?.custom_instructions
      ]);

      unifiedLogger.system('startup', 'info', 'User brief updated', {
        migrationId: id,
        userId,
        goals: userBrief?.goals
      });

      return reply.send({
        message: 'User brief updated successfully',
        updatedAt: new Date().toISOString()
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to update user brief'
      });
    }
  });

  // ============================================================================
  // OWNERSHIP VERIFICATION
  // ============================================================================

  /**
   * Start ownership verification
   * POST /api/migration/:id/verify
   */
  fastify.post<{
    Params: { id: string };
    Body: VerifyOwnershipBody;
  }>('/migration/:id/verify', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId, method, token } = request.body;

      const result = await orchestrator.verifyOwnership({
        migrationId: id,
        method,
        token
      });

      if (result.verified) {
        return reply.send({
          verified: true,
          message: 'Ownership verified successfully',
          verifiedAt: new Date().toISOString()
        });
      } else {
        return reply.send({
          verified: false,
          message: result.message
        });
      }

    } catch (error) {
      return reply.code(400).send({
        error: 'Failed to verify ownership',
        details: (error as Error).message
      });
    }
  });

  /**
   * Get verification status
   * GET /api/migration/:id/verify
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/verify', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      const verifyQuery = `
        SELECT
          mp.verification_method,
          mp.verification_verified_at,
          mp.verification_token_hash
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const result = await pool.query(verifyQuery, [id, userId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const verification = result.rows[0];

      return reply.send({
        verified: !!verification.verification_verified_at,
        method: verification.verification_method,
        verifiedAt: verification.verification_verified_at,
        hasToken: !!verification.verification_token_hash
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get verification status'
      });
    }
  });

  // ============================================================================
  // ANALYSIS ENDPOINTS
  // ============================================================================

  /**
   * Get site analysis results
   * GET /api/migration/:id/analysis
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string; type?: 'preliminary' | 'detailed' };
  }>('/migration/:id/analysis', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId, type = 'preliminary' } = request.query;

      const analysisQuery = `
        SELECT ma.data
        FROM migration_analysis ma
        JOIN migration_projects mp ON mp.id = ma.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2 AND ma.analysis_type = $3
        ORDER BY ma.created_at DESC
        LIMIT 1
      `;

      const result = await pool.query(analysisQuery, [id, userId, type]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: `${type} analysis not found`
        });
      }

      return reply.send({
        analysisType: type,
        data: result.rows[0].data
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get analysis'
      });
    }
  });

  /**
   * Get URL mapping for SEO preservation
   * GET /api/migration/:id/map
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/map', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      const mapQuery = `
        SELECT
          mm.src_url,
          mm.target_route,
          mm.redirect_code,
          mm.status,
          mm.canonical_src,
          mm.canonical_url,
          mm.meta_data
        FROM migration_map mm
        JOIN migration_projects mp ON mp.id = mm.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
        ORDER BY mm.src_url
      `;

      const result = await pool.query(mapQuery, [id, userId]);

      return reply.send({
        urlMappings: result.rows,
        totalMappings: result.rows.length
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get URL mappings'
      });
    }
  });

  // ============================================================================
  // JOB CONTROL
  // ============================================================================

  /**
   * Start transformation process
   * POST /api/migration/:id/process
   */
  fastify.post<{
    Params: { id: string };
    Body: ProcessMigrationBody;
    Headers: { 'idempotency-key'?: string };
  }>('/migration/:id/process', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.body;
      const idempotencyKey = request.headers['idempotency-key'];

      // Check migration exists and is owned by user
      const migrationQuery = `
        SELECT mj.*, mp.verification_verified_at
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const migrationResult = await pool.query(migrationQuery, [id, userId]);

      if (migrationResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const migration = migrationResult.rows[0];

      if (!migration.verification_verified_at) {
        return reply.code(400).send({
          error: 'Ownership verification required before processing'
        });
      }

      if (migration.status === 'running') {
        return reply.code(409).send({
          error: 'Migration is already processing'
        });
      }

      // TODO: Implement processMigration method in orchestrator
      // await orchestrator.processMigration(id);

      unifiedLogger.system('startup', 'info', 'Migration processing started', {
        migrationId: id,
        userId
      });

      return reply.send({
        message: 'Migration processing started',
        status: 'running'
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to start processing',
        details: (error as Error).message
      });
    }
  });


  /**
   * Get migration phases with progress
   * GET /api/migration/:id/phases
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/phases', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      const phasesQuery = `
        SELECT
          mp.phase_name,
          mp.status,
          mp.output,
          mp.started_at,
          mp.completed_at,
          mp.model,
          mp.tool_contract_version
        FROM migration_phases mp
        JOIN migration_projects mpj ON mpj.id = mp.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mpj.id
        WHERE mj.id = $1 AND mpj.user_id = $2
        ORDER BY mp.created_at
      `;

      const result = await pool.query(phasesQuery, [id, userId]);

      return reply.send({
        phases: result.rows.map(phase => ({
          name: phase.phase_name,
          status: phase.status,
          output: phase.output,
          startedAt: phase.started_at,
          completedAt: phase.completed_at,
          model: phase.model,
          toolVersion: phase.tool_contract_version
        }))
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get phases'
      });
    }
  });

  /**
   * Get tool usage audit trail
   * GET /api/migration/:id/tools
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/tools', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      const toolsQuery = `
        SELECT
          mtc.tool,
          mtc.agent,
          mtc.args_json,
          mtc.result_meta,
          mtc.cost_tokens,
          mtc.created_at
        FROM migration_tool_calls mtc
        JOIN migration_projects mp ON mp.id = mtc.migration_project_id
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
        ORDER BY mtc.created_at DESC
      `;

      const result = await pool.query(toolsQuery, [id, userId]);

      const totalCost = result.rows.reduce((sum, call) => sum + (call.cost_tokens || 0), 0);

      return reply.send({
        toolCalls: result.rows.map(call => ({
          tool: call.tool,
          agent: call.agent,
          args: call.args_json,
          result: call.result_meta,
          costTokens: call.cost_tokens,
          executedAt: call.created_at
        })),
        totalCalls: result.rows.length,
        totalCostTokens: totalCost
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get tool usage'
      });
    }
  });

  // ============================================================================
  // ENHANCED MIGRATION MANAGEMENT (Phase 1 Integration)
  // ============================================================================

  /**
   * Retry failed migration with options
   * POST /api/migration/:id/retry
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      userId: string;
      retryReason?: 'tool_timeout' | 'ownership_failed' | 'budget_exceeded' | 'builder_incompatibility' | 'deployment_error';
      newUserBrief?: any;
      increasedBudget?: { softBudgetSeconds: number; hardBudgetSeconds: number };
      reuseSeeds?: boolean;
    };
    Headers: { 'idempotency-key'?: string };
  }>('/migration/:id/retry', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId, retryReason = 'tool_timeout', newUserBrief, increasedBudget, reuseSeeds = true } = request.body;
      const idempotencyKey = request.headers['idempotency-key'];

      // Check for idempotency
      if (idempotencyKey) {
        const existingQuery = `
          SELECT response_payload, status
          FROM migration_idempotency
          WHERE idempotency_key = $1
        `;
        const existing = await pool.query(existingQuery, [idempotencyKey]);

        if (existing.rows.length > 0) {
          const record = existing.rows[0];
          return reply.code(record.status).send(JSON.parse(record.response_payload));
        }
      }

      // Validate migration exists and belongs to user
      const migrationQuery = `
        SELECT mj.*, mp.id as project_id
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const migrationResult = await pool.query(migrationQuery, [id, userId]);

      if (migrationResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const migration = migrationResult.rows[0];

      // Validate retry is allowed
      if (migration.status === 'running') {
        return reply.code(409).send({
          error: 'Cannot retry running migration'
        });
      }

      // Check retry limits
      const retryCount = migration.retry_count || 0;
      if (retryCount >= 3) {
        return reply.code(429).send({
          error: 'Maximum retry limit (3) exceeded'
        });
      }

      // Record retry attempt
      const retryQuery = `
        INSERT INTO migration_retries (
          migration_project_id, retry_reason, previous_phase,
          new_settings, initiated_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;

      const retryResult = await pool.query(retryQuery, [
        migration.project_id,
        retryReason,
        migration.stage,
        JSON.stringify({ newUserBrief, increasedBudget, reuseSeeds }),
        userId
      ]);

      // Apply budget increase if provided
      if (increasedBudget) {
        const updateBudgetQuery = `
          UPDATE migration_projects
          SET soft_budget_seconds = $2,
              hard_budget_seconds = $3,
              updated_at = NOW()
          WHERE id = $1
        `;
        await pool.query(updateBudgetQuery, [
          migration.project_id,
          increasedBudget.softBudgetSeconds,
          increasedBudget.hardBudgetSeconds
        ]);
      }

      // Reset migration job for retry
      const resetQuery = `
        UPDATE migration_jobs
        SET status = 'pending',
            retry_count = COALESCE(retry_count, 0) + 1,
            last_retry_at = NOW(),
            error_message = NULL,
            updated_at = NOW()
        WHERE id = $1
      `;

      await pool.query(resetQuery, [id]);

      const response = {
        message: 'Migration retry initiated',
        retryId: retryResult.rows[0].id,
        retryCount: retryCount + 1,
        retryReason,
        reuseSeeds
      };

      // Store idempotency record
      if (idempotencyKey) {
        const storeIdempotencyQuery = `
          INSERT INTO migration_idempotency (idempotency_key, request_fingerprint, response_payload, status)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (idempotency_key) DO NOTHING
        `;
        await pool.query(storeIdempotencyQuery, [
          idempotencyKey,
          JSON.stringify(request.body),
          JSON.stringify(response),
          200
        ]);
      }

      unifiedLogger.system('startup', 'info', 'Migration retry initiated', {
        migrationId: id,
        userId,
        retryReason,
        retryCount: retryCount + 1
      });

      return reply.send(response);

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Failed to retry migration', {
        migrationId: request.params.id,
        error: (error as Error).message
      });

      return reply.code(500).send({
        error: 'Failed to retry migration',
        details: (error as Error).message
      });
    }
  });

  /**
   * Cancel running migration
   * POST /api/migration/:id/cancel
   */
  fastify.post<{
    Params: { id: string };
    Body: { userId: string };
  }>('/migration/:id/cancel', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.body;

      // Get migration with ownership check
      const migrationQuery = `
        SELECT mj.*, mp.id as project_id
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const migrationResult = await pool.query(migrationQuery, [id, userId]);

      if (migrationResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const migration = migrationResult.rows[0];

      if (migration.status !== 'running') {
        return reply.code(409).send({
          error: 'Migration is not running'
        });
      }

      // Cancel the migration
      const cancelQuery = `
        UPDATE migration_jobs
        SET status = 'cancelled',
            error_message = 'Cancelled by user',
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `;

      await pool.query(cancelQuery, [id]);

      // TODO: Integrate with AI time service to close any open tracking sessions
      // This would require getting the current phase and calling migrationAITimeService.endMigrationTracking

      unifiedLogger.system('startup', 'info', 'Migration cancelled', {
        migrationId: id,
        userId
      });

      return reply.send({
        message: 'Migration cancelled successfully',
        status: 'cancelled'
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to cancel migration',
        details: (error as Error).message
      });
    }
  });

  /**
   * Get migration report with signed URLs for artifacts
   * GET /api/migration/:id/report
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/report', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      // Get migration with detailed information
      const reportQuery = `
        SELECT
          mj.*,
          mp.source_url,
          mp.config,
          mp.ai_time_consumed_seconds,
          mp.target_project_id,
          COUNT(mtc.id) as total_tool_calls,
          SUM(mtc.cost_tokens) as total_cost_tokens
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        LEFT JOIN migration_tool_calls mtc ON mtc.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
        GROUP BY mj.id, mp.source_url, mp.config, mp.ai_time_consumed_seconds, mp.target_project_id
      `;

      const result = await pool.query(reportQuery, [id, userId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const migration = result.rows[0];

      // Generate signed URLs for artifacts (placeholder)
      const artifacts = {
        analysisReport: null, // TODO: Generate signed URL for analysis JSON
        transformedFiles: null, // TODO: Generate signed URL for project files ZIP
        urlMappings: null, // TODO: Generate signed URL for URL mappings CSV
        auditLog: null // TODO: Generate signed URL for tool usage audit
      };

      const report = {
        migrationId: id,
        status: migration.status,
        stage: migration.stage,
        progress: migration.progress,
        sourceUrl: migration.source_url,
        targetProjectId: migration.target_project_id,
        aiTimeConsumed: migration.ai_time_consumed_seconds || 0,
        totalToolCalls: parseInt(migration.total_tool_calls) || 0,
        totalCostTokens: parseInt(migration.total_cost_tokens) || 0,
        createdAt: migration.created_at,
        startedAt: migration.started_at,
        completedAt: migration.completed_at,
        errorMessage: migration.error_message,
        artifacts,
        summary: {
          successful: migration.status === 'completed',
          duration: migration.completed_at ?
            Math.round((new Date(migration.completed_at).getTime() - new Date(migration.started_at || migration.created_at).getTime()) / 1000) : null,
          configuration: migration.config
        }
      };

      return reply.send(report);

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to generate migration report'
      });
    }
  });

  /**
   * Regenerate migration with new settings
   * POST /api/migration/:id/regenerate
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      userId: string;
      overrides?: {
        userBrief?: any;
        budget?: { softBudgetSeconds: number; hardBudgetSeconds: number };
        targetFramework?: string;
      };
    };
  }>('/migration/:id/regenerate', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId, overrides = {} } = request.body;

      // Get original migration
      const originalQuery = `
        SELECT mj.*, mp.source_url, mp.config
        FROM migration_jobs mj
        JOIN migration_projects mp ON mp.id = mj.migration_project_id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const originalResult = await pool.query(originalQuery, [id, userId]);

      if (originalResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Original migration not found'
        });
      }

      const original = originalResult.rows[0];

      // Create new migration job
      const newJobQuery = `
        INSERT INTO migration_jobs (
          migration_project_id, stage, status,
          idempotency_key, result_meta
        ) VALUES (
          $1, 'ANALYZE', 'pending',
          gen_random_uuid()::text,
          jsonb_build_object('previous_job_id', $2, 'regenerated_at', NOW(), 'overrides', $3)
        )
        RETURNING id
      `;

      const newJobResult = await pool.query(newJobQuery, [
        original.migration_project_id,
        id,
        JSON.stringify(overrides)
      ]);

      const newJobId = newJobResult.rows[0].id;

      // Apply overrides to migration project if provided
      if (overrides.budget) {
        const updateBudgetQuery = `
          UPDATE migration_projects
          SET soft_budget_seconds = $2,
              hard_budget_seconds = $3,
              updated_at = NOW()
          WHERE id = $1
        `;
        await pool.query(updateBudgetQuery, [
          original.migration_project_id,
          overrides.budget.softBudgetSeconds,
          overrides.budget.hardBudgetSeconds
        ]);
      }

      unifiedLogger.system('startup', 'info', 'Migration regenerated', {
        originalMigrationId: id,
        newMigrationId: newJobId,
        userId,
        hasOverrides: Object.keys(overrides).length > 0
      });

      return reply.code(201).send({
        newMigrationId: newJobId,
        originalMigrationId: id,
        status: 'pending',
        message: 'Migration regenerated with new settings',
        overrides
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to regenerate migration',
        details: (error as Error).message
      });
    }
  });

  /**
   * Get migration AI time breakdown by phase
   * GET /api/migration/:id/billing
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string };
  }>('/migration/:id/billing', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;

      // Get migration project ID
      const migrationQuery = `
        SELECT mp.id as project_id, mp.ai_time_consumed_seconds
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const migrationResult = await pool.query(migrationQuery, [id, userId]);

      if (migrationResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const projectId = migrationResult.rows[0].project_id;
      const totalConsumed = migrationResult.rows[0].ai_time_consumed_seconds || 0;

      // Get phase breakdown from AI time consumption logs
      const phaseBreakdownQuery = `
        SELECT
          uc.version_id as phase,
          SUM(uc.billable_seconds) as seconds_consumed,
          COUNT(*) as tracking_sessions,
          AVG(uc.billable_seconds) as avg_session_duration,
          bool_and(uc.success) as all_successful
        FROM user_ai_time_consumption uc
        WHERE uc.project_id = $1
          AND uc.operation_type = 'website_migration'
          AND uc.user_id = $2
        GROUP BY uc.version_id
        ORDER BY
          CASE uc.version_id
            WHEN 'ANALYZE' THEN 1
            WHEN 'PLAN' THEN 2
            WHEN 'TRANSFORM' THEN 3
            WHEN 'VERIFY' THEN 4
            WHEN 'DEPLOY' THEN 5
            ELSE 6
          END
      `;

      const phaseResult = await pool.query(phaseBreakdownQuery, [projectId, userId]);

      const phaseBreakdown = phaseResult.rows.map(row => ({
        phase: row.phase,
        secondsConsumed: parseInt(row.seconds_consumed) || 0,
        trackingSessions: parseInt(row.tracking_sessions) || 0,
        avgSessionDuration: Math.round(parseFloat(row.avg_session_duration) || 0),
        allSuccessful: row.all_successful === true
      }));

      const billing = {
        migrationId: id,
        totalConsumedSeconds: totalConsumed,
        totalConsumedMinutes: Math.round(totalConsumed / 60 * 100) / 100,
        phaseBreakdown,
        summary: {
          totalPhases: phaseBreakdown.length,
          totalSessions: phaseBreakdown.reduce((sum, phase) => sum + phase.trackingSessions, 0),
          overallSuccess: phaseBreakdown.every(phase => phase.allSuccessful)
        }
      };

      return reply.send(billing);

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get billing information'
      });
    }
  });

  /**
   * Get migration events for SSE backfill
   * GET /api/migration/:id/events
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string; since_id?: string; limit?: string };
  }>('/migration/:id/events', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId, since_id, limit = '50' } = request.query;

      const sinceId = since_id ? parseInt(since_id) : 0;
      const limitNum = Math.min(parseInt(limit), 100); // Cap at 100 events

      // Get migration project ID
      const migrationQuery = `
        SELECT mp.id as project_id
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const migrationResult = await pool.query(migrationQuery, [id, userId]);

      if (migrationResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      const projectId = migrationResult.rows[0].project_id;

      // Get events with cursor-based pagination
      const eventsQuery = `
        SELECT id, seq, ts, type, payload
        FROM migration_events
        WHERE migration_project_id = $1
          AND id > $2
        ORDER BY id ASC
        LIMIT $3
      `;

      const eventsResult = await pool.query(eventsQuery, [projectId, sinceId, limitNum]);

      const events = eventsResult.rows.map(row => ({
        id: row.id,
        seq: row.seq,
        ts: new Date(row.ts).getTime(),
        type: row.type,
        migrationId: id,
        ...row.payload
      }));

      return reply.send({
        events,
        hasMore: events.length === limitNum,
        nextCursor: events.length > 0 ? events[events.length - 1].id : sinceId
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get migration events'
      });
    }
  });

  // ============================================================================
  // REAL-TIME PROGRESS UPDATES (Phase 2 Enhanced UX)
  // ============================================================================

  /**
   * SSE endpoint for real-time migration progress
   * GET /api/migration/:id/stream
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { userId: string; };
    Headers: { 'last-event-id'?: string };
  }>('/migration/:id/stream', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.query;
      const lastEventId = request.headers['last-event-id'];

      unifiedLogger.system('startup', 'info', 'Migration SSE connection initiated', {
        migrationId: id,
        userId,
        lastEventId
      });

      // Handle SSE connection with backfill
      await migrationSSEService.handleMigrationSSE(reply, id, userId, lastEventId);

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Migration SSE connection failed', {
        migrationId: request.params.id,
        userId: request.query.userId,
        error: (error as Error).message
      });

      if (!reply.sent) {
        return reply.code(500).send({
          error: 'Failed to establish SSE connection',
          details: (error as Error).message
        });
      }
    }
  });

  /**
   * Manual trigger for migration progress broadcast (development/testing)
   * POST /api/migration/:id/broadcast
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      userId: string;
      eventType: 'phase_update' | 'metric' | 'log' | 'error' | 'done';
      phase: 'ANALYZE' | 'PLAN' | 'TRANSFORM' | 'VERIFY' | 'DEPLOY';
      progress: number;
      data: any;
    };
  }>('/migration/:id/broadcast', async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId, eventType, phase, progress, data } = request.body;

      // Verify migration ownership
      const migrationQuery = `
        SELECT mp.id as project_id
        FROM migration_projects mp
        JOIN migration_jobs mj ON mj.migration_project_id = mp.id
        WHERE mj.id = $1 AND mp.user_id = $2
      `;

      const migrationResult = await pool.query(migrationQuery, [id, userId]);

      if (migrationResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Migration not found'
        });
      }

      // Create appropriate event based on type
      let event;
      switch (eventType) {
        case 'phase_update':
          event = migrationSSEService.createPhaseUpdateEvent(
            id, phase, progress, data.previousPhase, data.tools || [], data.estimatedDuration || 0
          );
          break;
        case 'metric':
          event = migrationSSEService.createMetricEvent(
            id, phase, progress, data.metricType, data.value, data.unit, data.breakdown
          );
          break;
        case 'log':
          event = migrationSSEService.createLogEvent(
            id, phase, progress, data.level, data.message, data.context
          );
          break;
        case 'error':
          event = migrationSSEService.createErrorEvent(
            id, phase, progress, data.errorCode, data.errorMessage, data.retryable, data.errorContext
          );
          break;
        case 'done':
          event = migrationSSEService.createDoneEvent(
            id, data.success, data.totalDuration, data.aiTimeConsumed, data.projectId, data.previewUrl, data.summary
          );
          break;
        default:
          return reply.code(400).send({ error: 'Invalid event type' });
      }

      // Broadcast the event
      await migrationSSEService.broadcastMigrationUpdate(id, event);

      return reply.send({
        message: 'Event broadcasted successfully',
        eventType,
        sequence: event.seq
      });

    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to broadcast event',
        details: (error as Error).message
      });
    }
  });
}