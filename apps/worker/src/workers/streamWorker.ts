import { Job, Worker, UnrecoverableError } from 'bullmq';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ulid } from 'ulid';
import { CLAUDE_TIMEOUTS, getTimeoutForAttempt as getTimeout } from '../config/timeouts.env';
import { SystemConfigurationError, UsageLimitError, isSystemConfigurationError, isUsageLimitError } from '../errors/systemErrors';
import { deployQueue, queueRecommendationsGeneration, requireQueue } from '../queue/modularQueues';
import { createVersionOnSuccess, getPool } from '../services/database';
import { getLatestVersionMetadata, /* linkVersionMetadata, */ saveProjectRecommendations, updateProjectVersionStatus } from '../services/databaseWrapper';
import { ErrorContextService } from '../services/errorContextService';
import { CleanEventEmitter } from '../services/eventService';
import { metricsService } from '../services/metricsService';
import { getProjectConfig, updateProjectConfig } from '../services/projectConfigService';
import { QueueManager } from '../services/queueManager';
import { buildRecommendationsPrompt, validateRecommendationsSchema } from '../services/recommendationsPrompt';
import { ChatBroadcastService } from '../services/chatBroadcastService';
import { completeSession, getExistingProjectFiles, getSessionCheckpoint, saveSessionCheckpoint } from '../services/sessionRecovery';
import { SystemValidationService } from '../services/systemValidationService';
import { UsageLimitService } from '../services/usageLimitService';
import { WorkingDirectoryService } from '../services/workingDirectoryService';
import { ClaudeSession } from '../stream';
import type { SessionResult } from '../stream/claudeSession';
import { calculateOverallProgress } from '../types/cleanEvents';
import { FileLocationValidator } from '../utils/fileLocationValidator';
import { detectPackageManager } from '../utils/packageManager';
import { ProjectPaths } from '../utils/projectPaths';
import { unifiedLogger } from '../services/unifiedLogger';


const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};


interface StreamJobData {
  buildId: string;
  userId: string;
  projectId: string;
  prompt: string;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte';
  projectPath: string;
  versionId?: string;
  isInitialBuild?: boolean;
  baseVersionId?: string;
  attemptNumber?: number;
  previousSessionId?: string;
  existingFiles?: string[];
  packageManager?: string;
  serverGenerated?: boolean;
  correlationId?: string;
  // Rollback-specific fields
  type?: 'build' | 'rollback';
  rollbackVersionId?: string;
  targetVersionId?: string;
  preRollbackState?: any;
  selectiveFiles?: string[];
  delayUntilRollbackComplete?: boolean;
  queuedDuringRollback?: boolean;
}

interface MetadataJobData {
  buildId: string;
  userId: string;
  projectId: string;
  projectPath: string;
  versionId: string;
  framework: string;
  originalPrompt: string;
  isInitialBuild?: boolean;
  sessionId?: string;
}

interface VersionClassificationJobData {
  buildId: string;
  userId: string;
  projectId: string;
  projectPath: string;
  versionId: string;
  fromRecommendationId?: number;
  buildDuration: number;
}

/**
 * Query project's infrastructure mode to determine if Easy Mode SDK guidance applies.
 */
async function getProjectInfraMode(projectId: string): Promise<'easy' | 'pro' | null> {
  const result = await getPool().query('SELECT infra_mode FROM projects WHERE id = $1', [projectId]);
  return result.rows[0]?.infra_mode ?? null;
}

/**
 * Get the estimated token budget for a project's template.
 * Used for soft enforcement/logging of token consumption.
 */
async function getProjectBudgetedTokens(projectId: string): Promise<number | undefined> {
  try {
    const result = await getPool().query(
      `SELECT config->'templateData'->'selection'->>'templateId' as template_id FROM projects WHERE id = $1`,
      [projectId]
    );
    const templateId = result.rows[0]?.template_id;
    if (!templateId) return undefined;

    // Dynamic import to avoid circular dependencies
    const { getTemplate } = await import('@sheenapps/templates');
    const template = getTemplate(templateId);
    return template?.budget?.estimatedTokens;
  } catch {
    return undefined;
  }
}

// Stream Worker - Replaces plan + task workers with direct Claude CLI stream
export const streamWorker = new Worker(
  'claude-stream',
  async (job: Job<StreamJobData | MetadataJobData | VersionClassificationJobData>) => {
    // Handle queue resume jobs
    if (job.name === 'queue-resume') {
      console.log(`[Stream Worker] Processing queue resume job`);
      const queueManager = QueueManager.getInstance();

      try {
        await queueManager.resumeQueues('automatic');
        
        // Log queue resume action
        unifiedLogger.system('queue_resumed', 'info', 'Queue resumed automatically by scheduled job', {
          resumeType: 'automatic',
          jobId: job.id
        });
        
        return { success: true, message: 'Queue resumed automatically' };
      } catch (error) {
        console.error(`[Stream Worker] Failed to resume queue:`, error);
        
        // Log queue resume failure
        unifiedLogger.system('queue_resume_failed', 'error', `Failed to resume queue: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          resumeType: 'automatic',
          jobId: job.id,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
        
        throw error;
      }
    }

    // Handle metadata generation jobs
    if (job.name === 'generate-metadata') {
      return handleMetadataGeneration(job as Job<MetadataJobData>);
    }

    // REMOVED: Handle version classification jobs (consolidated table eliminates need for this)
    if (job.name === 'classify-version') {
      console.log('[Stream Worker] classify-version job type deprecated - version metadata now populated immediately during metadata generation');
      return { success: true, message: 'Job type deprecated - using consolidated table approach' };
    }

    // Handle regular stream jobs
    const streamJob = job as Job<StreamJobData>;

    // Check if this is a rollback job
    if (streamJob.data.type === 'rollback') {
      return handleRollbackSync(streamJob);
    }

    // Handle queued builds during rollback
    if (streamJob.data.delayUntilRollbackComplete) {
      const queueResult = await handleQueuedBuildDuringRollback(streamJob);
      if (queueResult !== null) {
        return queueResult; // Return early if handled (canceled, retrying, etc.)
      }
      // If queueResult is null, continue with regular build processing
    }
    const {
      buildId,
      userId,
      projectId,
      prompt,
      framework,
      projectPath,
      isInitialBuild = true,
      attemptNumber = streamJob.attemptsMade + 1,  // BullMQ tracks attempts
      existingFiles = []
    } = streamJob.data;

    const correlationId = streamJob.data.correlationId || 'unknown';
    console.log(`[Stream Worker] Starting build ${buildId} for ${userId}/${projectId} (correlation: ${correlationId})`);
    
    // Log build start to unified logging system
    unifiedLogger.lifecycle('build_started', 'streamWorker', 'Build process initiated', {
      buildId,
      userId,
      projectId,
      correlationId,
      framework,
      isInitialBuild,
      attemptNumber,
      existingFilesCount: existingFiles.length,
      packageManager: streamJob.data.packageManager
    });

    // PHASE 1: Clear previous build state and set status to 'building' (without buildId to avoid FK violation)
    console.log(`[Stream Worker] 🔄 PHASE 1: Updating project status to 'building' for ${projectId}`);
    try {
      await updateProjectConfig(projectId, {
        status: 'building',
        framework: framework || undefined, // Convert empty string to undefined
        lastBuildStarted: new Date(),
        lastBuildCompleted: null // Clear previous completion to avoid timing constraint violation
      });
      console.log(`[Stream Worker] ✅ Project status updated to 'building' for ${projectId}`);

      // Verify the update
      try {
        const verifyResult = await getPool().query(
          'SELECT build_status FROM projects WHERE id = $1',
          [projectId]
        );
        if (verifyResult.rows.length > 0) {
          const actualStatus = verifyResult.rows[0].build_status;
          if (actualStatus === 'building') {
            console.log(`[Stream Worker] ✅ VERIFIED: Project ${projectId} status is correctly 'building'`);
          } else {
            console.error(`[Stream Worker] ❌ MISMATCH: Project ${projectId} status is '${actualStatus}' not 'building'`);
          }
        } else {
          console.error(`[Stream Worker] ❌ VERIFICATION FAILED: Project ${projectId} not found!`);
        }
      } catch (e) {
        // Ignore verification errors if DB not configured
      }
    } catch (error) {
      console.error('[Stream Worker] ❌ Failed to update project status at build start:', error);
      // Don't fail the build if config update fails
    }

    // Generate version ID
    const versionId = streamJob.data.versionId || ulid();

    // Track AI time recording state to prevent duplicates
    let aiTimeTrackingCompleted = false;

    // Define sessionTimeout at outer scope for error handling
    let sessionTimeout = CLAUDE_TIMEOUTS.initial;

    // Detect package manager for accurate metrics
    const packageManager = await detectPackageManager(projectPath);

    // For new server-generated projects, build metrics and version records already exist
    // For legacy external projectIds, we still need to create these records
    const isServerGenerated = streamJob.data.serverGenerated === true;

    if (!isServerGenerated && isInitialBuild) {
      // Legacy path: Record build start in metrics for external projectIds
      await metricsService.recordBuildStart({
        buildId,
        versionId,
        projectId,
        userId,
        isInitialBuild,
        isUpdate: !isInitialBuild || existingFiles.length > 0,
        isRetry: attemptNumber > 1,
        attemptNumber,
        parentBuildId: streamJob.data.baseVersionId,
        framework,
        nodeVersion: process.version,
        packageManager
      });
      console.log(`[Stream Worker] Recorded build metrics for ${versionId} (legacy path - no early version creation)`);
    } else {
      // For server-generated projects, ensure metrics record exists
      try {
        // Check if build metrics record exists, if not create it
        const existingMetrics = await getPool().query('SELECT build_id FROM project_build_metrics WHERE build_id = $1', [buildId]);
        if (!existingMetrics || existingMetrics.rows.length === 0) {
          console.log(`[Stream Worker] Build metrics record missing for ${buildId}, creating it now`);
          await metricsService.recordBuildStart({
            buildId,
            versionId,
            projectId,
            userId,
            isInitialBuild,
            isUpdate: !isInitialBuild || existingFiles.length > 0,
            isRetry: attemptNumber > 1,
            attemptNumber,
            parentBuildId: streamJob.data.baseVersionId,
            framework,
            nodeVersion: process.version,
            packageManager
          });
        }
      } catch (metricsError) {
        console.log(`[Stream Worker] Failed to verify/create build metrics for ${buildId}:`, metricsError);
        // Create metrics record anyway to ensure FK constraint is satisfied
        try {
          await metricsService.recordBuildStart({
            buildId,
            versionId,
            projectId,
            userId,
            isInitialBuild,
            isUpdate: !isInitialBuild || existingFiles.length > 0,
            isRetry: attemptNumber > 1,
            attemptNumber,
            parentBuildId: streamJob.data.baseVersionId,
            framework,
            nodeVersion: process.version,
            packageManager
          });
        } catch (fallbackError) {
          console.error(`[Stream Worker] Failed to create build metrics record for ${buildId}:`, fallbackError);
        }
      }

      // Server-generated projects: Version records will be created only on successful deployment
      console.log(`[Stream Worker] Server-generated project ${versionId} - version record will be created on successful deployment`);
    }

    // PHASE 2: Now that build metrics record exists, update project with buildId
    try {
      await updateProjectConfig(projectId, {
        buildId: buildId  // Now safe - metrics record confirmed to exist
      });
      console.log(`[Stream Worker] Project buildId updated for ${projectId} (buildId: ${buildId})`);
    } catch (error) {
      console.error('[Stream Worker] Failed to update project buildId after metrics creation:', error);
      // Don't fail the build if config update fails
    }

    try {

      // Emit clean build event with structured i18n code
      const cleanEmitter = new CleanEventEmitter(buildId, userId);
      await cleanEmitter.phaseStartedWithCode(
        'development',
        'BUILD_DEVELOPMENT_STARTING',
        {
          timestamp: Date.now(),
          projectId,
          isRetry: attemptNumber > 1,
          attemptNumber
        },
        calculateOverallProgress('development', 0.0)
      );

      // Ensure project directory and metadata structure exists
      // (For server-generated projects, directory already exists)
      await fs.mkdir(projectPath, { recursive: true });

      // Set up .sheenapps folder structure for metadata
      const hiddenDir = path.join(projectPath, '.sheenapps');
      await fs.mkdir(hiddenDir, { recursive: true });
      console.log(`[Stream Worker] Created .sheenapps directory at ${hiddenDir}`);

      // Ensure .gitignore exists and includes .sheenapps
      const gitignorePath = path.join(projectPath, '.gitignore');
      let gitignoreContent = '';
      try {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // File doesn't exist yet
      }

      if (!gitignoreContent.includes('.sheenapps')) {
        const newGitignoreContent = gitignoreContent +
          (gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : '') +
          '\n# SheenApps internal files\n.sheenapps/\n';
        await fs.writeFile(gitignorePath, newGitignoreContent);
        console.log('[Stream Worker] Updated .gitignore to exclude .sheenapps folder');
      }

      // Check for previous session on retry
      let currentExistingFiles = existingFiles;
      let previousSessionId: string | undefined;

      if (attemptNumber > 1) {
        // Try to recover from previous session
        const checkpoint = await getSessionCheckpoint(buildId);
        if (checkpoint) {
          console.log(`[Stream Worker] Found session checkpoint for build ${buildId}`);
          previousSessionId = checkpoint.sessionId;
          // Use existingFilesAtCheckpoint if available, fallback to legacy filesCreated field
          currentExistingFiles = checkpoint.existingFilesAtCheckpoint || checkpoint.filesCreated || [];
        } else {
          // No checkpoint, scan directory for existing files
          currentExistingFiles = await getExistingProjectFiles(projectPath);
        }

        console.log(`[Stream Worker] Retry ${attemptNumber} with ${currentExistingFiles.length} existing files`);
      }

      // Cache package manager on job for retries
      streamJob.data.packageManager = packageManager;

      // Get last error for retry context (if this is a retry)
      let lastError: string | undefined;
      if (attemptNumber > 1 && streamJob.failedReason) {
        lastError = streamJob.failedReason;
        console.log(`[Stream Worker] Found previous error for retry context: ${lastError.substring(0, 100)}...`);
      }

      // Construct Claude prompt with context
      const enhancedPrompt = constructPrompt(prompt, framework, isInitialBuild, attemptNumber, currentExistingFiles, packageManager, lastError);
      const claudeStartTime = new Date();

      // Enhanced prompt metadata now stored only when Claude session completes successfully
      // This avoids dependency on version records existing during builds
      console.log(`[Stream Worker] Enhanced prompt prepared (${enhancedPrompt.length} chars) - metadata will be stored on session completion`);

      // Queue async recommendations generation (fire-and-forget, runs in parallel with build)
      // This allows recommendations to be ready faster - they don't need to wait for the build
      if (process.env.ASYNC_RECOMMENDATIONS !== 'false') {
        queueRecommendationsGeneration({
          projectId,
          userId,
          buildId,
          versionId,
          buildSessionId: streamJob.data.correlationId, // Use correlationId as buildSessionId
          projectPath,
          framework: framework || undefined,
          prompt,
          isInitialBuild,
          priority: 'normal'
        }).catch(err => {
          console.warn(`[Stream Worker] Failed to queue async recommendations for ${buildId}:`, err);
          // Non-blocking - recommendations will still be generated in metadata phase as fallback
        });
        console.log(`[Stream Worker] Queued async recommendations generation for ${buildId}`);
      }

      // Get timeout based on attempt
      sessionTimeout = getTimeout(attemptNumber, currentExistingFiles.length > 0);

      // AI time tracking for server-generated projects already started in createPreview
      // For legacy external projectIds or retries, start AI time tracking here
      const operationType = isInitialBuild ? 'main_build' : 'update';
      let aiTimeTracking;

      if (!isServerGenerated || attemptNumber > 1) {
        try {
          aiTimeTracking = await metricsService.startAITimeTracking(buildId, operationType, {
            projectId,
            versionId,
            userId,
            sessionId: streamJob.data.previousSessionId
          });

          console.log(`[Stream Worker] AI time tracking started for ${buildId}. Estimated: ${aiTimeTracking.estimatedSeconds}s`);
          
          // Log AI time tracking start
          unifiedLogger.action(userId, 'ai_time_tracking_started', undefined, undefined, undefined, undefined, {
            buildId,
            projectId,
            operationType,
            estimatedSeconds: aiTimeTracking.estimatedSeconds,
            sessionId: streamJob.data.previousSessionId,
            message: `AI time tracking initiated: ${aiTimeTracking.estimatedSeconds}s estimated`
          });
        } catch (error) {
          // Handle insufficient balance error
          if (error instanceof Error && error.name === 'InsufficientAITimeError') {
            console.log(`[Stream Worker] Insufficient AI time balance for ${buildId}: ${error.message}`);
            
            // Log insufficient AI time balance
            unifiedLogger.system('insufficient_ai_time_balance', 'error', `Build failed due to insufficient AI time balance: ${buildId}`, {
              buildId,
              userId,
              projectId,
              errorMessage: error.message,
              operationType
            });
            
            await metricsService.recordBuildComplete(buildId, 'failed', 'insufficient_balance');
            throw error;
          }
          throw error;
        }
      } else {
        console.log(`[Stream Worker] AI time tracking already started for server-generated project ${buildId}`);
      }

      // Pre-flight system and usage limit validation
      console.log(`[Stream Worker] Running pre-request validation for ${buildId}`);

      try {
        // 1. System configuration validation
        const systemValidation = SystemValidationService.getInstance();
        const validationResult = await systemValidation.validateClaudeAccess(projectPath);

        if (!validationResult.isValid) {
          const error = validationResult.errors[0];
          if (!error) {
            throw new Error('Validation failed but no error details provided');
          }
          console.error(`[Stream Worker] System configuration error for ${buildId}:`, error);

          // Log system configuration error
          unifiedLogger.system('system_configuration_error', 'error', `System configuration validation failed for build ${buildId}: ${error.message}`, {
            buildId,
            userId,
            projectId,
            errorType: error.type,
            errorMessage: error.message,
            resolution: error.resolution
          });

          throw new SystemConfigurationError(error.message, error.type, error.resolution);
        }

        // 2. Usage limit validation
        const usageLimitService = UsageLimitService.getInstance();
        const isLimitActive = await usageLimitService.isLimitActive();

        if (isLimitActive) {
          const resetTime = await usageLimitService.getResetTime();
          const timeUntilReset = await usageLimitService.getTimeUntilReset();
          const errorMessage = await usageLimitService.getErrorMessage();

          console.error(`[Stream Worker] Usage limit active for ${buildId} until ${resetTime ? new Date(resetTime).toISOString() : 'unknown'}`);

          // Log usage limit exceeded
          unifiedLogger.system('usage_limit_exceeded', 'warn', `Build blocked due to active usage limit: ${buildId}`, {
            buildId,
            userId,
            projectId,
            resetTime,
            resetTimeISO: resetTime ? new Date(resetTime).toISOString() : 'unknown',
            timeUntilReset,
            errorMessage
          });

          throw new UsageLimitError(
            errorMessage || `Usage limit active until ${resetTime ? new Date(resetTime).toISOString() : 'unknown'}`,
            resetTime || 0,
            timeUntilReset || 0
          );
        }

        console.log(`[Stream Worker] Pre-request validation passed for ${buildId}`);

      } catch (validationError: any) {
        console.error(`[Stream Worker] Pre-request validation failed for ${buildId}:`, validationError);

        // Record the failure in metrics
        await metricsService.recordBuildComplete(buildId, 'failed',
          isSystemConfigurationError(validationError) ? 'system_config_error' :
          isUsageLimitError(validationError) ? 'usage_limit_exceeded' : 'validation_failed'
        );

        // Re-throw the error to be handled by the outer catch block
        throw validationError;
      }

      // Create Claude session
      const session = new ClaudeSession();
      let result: SessionResult;
      
      // Log AI session start  
      unifiedLogger.action(userId, 'ai_session_started', undefined, undefined, undefined, undefined, {
        buildId,
        projectId,
        message: 'AI session initiated for build processing',
        promptLength: enhancedPrompt.length,
        sessionTimeout,
        previousSessionId,
        attemptNumber
      });

      // Try to resume session if available and this is an update
      if (streamJob.data.previousSessionId && !isInitialBuild) {
        console.log(`[Stream Worker] Attempting to resume session ${streamJob.data.previousSessionId}`);

        const resumeResult = await session.resume(
          streamJob.data.previousSessionId,
          enhancedPrompt,
          projectPath,
          buildId,
          sessionTimeout,
          userId,
          projectId
        );

        // Check if we need to fallback to a new session
        if ((resumeResult as any).needsFallback) {
          console.log(`[Stream Worker] Session ${streamJob.data.previousSessionId} not found, creating new session`);
          result = await session.run(
            enhancedPrompt,
            projectPath,
            buildId,
            sessionTimeout,
            userId,
            projectId
          );
        } else {
          console.log(`[Stream Worker] Successfully resumed session ${streamJob.data.previousSessionId}`);
          result = resumeResult;
        }
      } else {
        // No previous session or initial build - create new session
        console.log(`[Stream Worker] Creating new session for build ${buildId}`);
        result = await session.run(
          enhancedPrompt,
          projectPath,
          buildId,
          sessionTimeout,
          userId,
          projectId
        );
      }

      const claudeEndTime = new Date();

      // End AI time tracking and record consumption
      let aiTimeConsumption;
      try {
        aiTimeConsumption = await metricsService.endAITimeTracking(buildId, {
          userId,
          projectId,
          versionId,
          sessionId: result.sessionId,
          success: result.success,
          errorType: result.success ? undefined : 'claude_session_failed'
        });
        aiTimeTrackingCompleted = true;

        if (aiTimeConsumption) {
          console.log(`[Stream Worker] AI time consumed for ${buildId}: ${aiTimeConsumption.billableSeconds}s (${Math.ceil(aiTimeConsumption.billableSeconds / 60)}m)`);

          // AI time consumed (internal billing only)
        }
      } catch (error) {
        console.error(`[Stream Worker] Failed to record AI time consumption for ${buildId}:`, error);
        // Don't fail the build for billing errors, just log them
      }

      if (!result.success) {
        throw new Error(result.error || 'Claude session failed');
      }

      // Log cost and usage
      if (result.totalCost !== undefined) {
        console.log(`[Stream Worker] Session cost: $${result.totalCost.toFixed(4)}`);
        
        // Log successful AI session completion
        unifiedLogger.action(userId, 'ai_session_completed', undefined, undefined, undefined, undefined, {
          buildId,
          projectId,
          message: `AI session completed successfully - Cost: $${result.totalCost.toFixed(4)}`,
          sessionId: result.sessionId,
          totalCost: result.totalCost,
          sessionDuration: Date.now() - claudeStartTime.getTime(),
          filesCreated: result.filesCreated,
          filesModified: result.filesModified,
          toolCallsTotal: result.toolCallsTotal,
          inputTokens: result.tokenUsage?.input,
          outputTokens: result.tokenUsage?.output
        });
      }

      // Update progress and save checkpoint during execution
      await streamJob.updateProgress({
        stage: 'completed',
        message: 'AI session completed successfully'
      });

      // Validate file locations and fix if needed
      console.log('[Stream Worker] Validating file locations...');
      // 🔒 SECURITY: Use enhanced file location validation with user context
      const validation = await FileLocationValidator.validateProjectStructure(projectPath, userId, projectId);

      if (!validation.valid) {
        if (validation.errors.length > 0) {
          console.error('[Stream Worker] Security violations detected:', validation.errors);
          // Log security violations but don't fail the build - just don't move files
        }

        if (validation.misplacedFiles.length > 0) {
          console.warn(`[Stream Worker] Found ${validation.misplacedFiles.length} project files in wrong location`);

          // 🔒 SECURITY: Use secure file move operations
          const moveResult = await FileLocationValidator.moveMisplacedFiles(
            validation.misplacedFiles,
            projectPath,
            userId,
            projectId
          );

          if (moveResult.moved > 0) {
            console.log(`[Stream Worker] Successfully moved ${moveResult.moved} files to project directory`);
            // Files relocated (internal file management only)
          }

          if (moveResult.errors.length > 0) {
            console.error('[Stream Worker] Errors moving files:', moveResult.errors);
          }
        }
      }

      // Save session checkpoint for potential recovery
      // Note: We save existing files at checkpoint time (not files created by this session)
      // This is used for resumption to know what files exist, not for billing/metrics
      if (result.sessionId) {
        await saveSessionCheckpoint(buildId, {
          sessionId: result.sessionId,
          buildId,
          projectPath,
          existingFilesAtCheckpoint: currentExistingFiles, // Files present at this checkpoint
          filesCreatedCount: result.filesCreated || 0, // Count from Claude result
          filesModifiedCount: result.filesModified || 0, // Count from Claude result
          tokenUsage: result.tokenUsage,
          cost: result.totalCost
        });
      }

      // Store Claude session and mark complete
      if (result.sessionId) {
        const { storeClaudeSession } = await import('../services/errorHandlers');
        storeClaudeSession(buildId, result.sessionId, projectPath, result);
        console.log(`[Stream Worker] Stored Claude session ${result.sessionId} for build ${buildId}`);

        // Update project with latest session ID for context continuity
        const { SessionManagementService } = await import('../services/sessionManagementService');
        await SessionManagementService.updateProjectSession(
          projectId,
          result.sessionId,
          'build',
          versionId  // Also update version table
        );
      }

      // Get budgeted tokens from template for soft enforcement logging
      const budgetedTokens = await getProjectBudgetedTokens(projectId);

      // Record Claude session metrics
      await metricsService.recordClaudeSession({
        buildId,
        sessionId: result.sessionId,
        promptType: 'build',
        originalPromptLength: prompt.length,
        enhancedPromptLength: enhancedPrompt.length,
        sessionStartTime: claudeStartTime,
        sessionEndTime: claudeEndTime,
        sessionDurationMs: claudeEndTime.getTime() - claudeStartTime.getTime(),
        inputTokens: result.tokenUsage?.input,
        outputTokens: result.tokenUsage?.output,
        totalCostUsd: result.totalCost,
        // Activity metrics from Claude session
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        toolCallsTotal: result.toolCallsTotal,
        errorsEncountered: result.errorsEncountered,
        errorsFixed: result.errorsFixed,
        success: result.success,
        sessionTimeoutMs: sessionTimeout,
        errorMessage: result.error,
        // AI Time Billing data
        aiTimeTrackingSession: aiTimeTracking,
        aiTimeConsumption: aiTimeConsumption || undefined,
        // Token budget tracking (soft enforcement - logging only)
        budgetedTokens,
        projectId,
      });

      // Update build status to ai_completed
      await metricsService.recordBuildComplete(buildId, 'ai_completed');
      
      // Log successful build completion
      unifiedLogger.lifecycle('build_completed', 'streamWorker', 'Build AI processing completed successfully - ready for deployment', {
        buildId,
        userId,
        projectId,
        versionId,
        sessionId: result.sessionId,
        buildDuration: Math.round((Date.now() - claudeStartTime.getTime()) / 1000),
        filesCreated: result?.filesCreated || 0,
        filesModified: result?.filesModified || 0
      });

      // CRITICAL: Create version record now that build succeeded (prevents ghost versions)
      try {
        await createVersionOnSuccess(
          projectId,
          versionId,
          userId,
          prompt,
          framework || 'react',
          result.sessionId || undefined
        );
        console.log(`[Stream Worker] Created version record ${versionId} with session ${result.sessionId || 'none'}`);
      } catch (error) {
        console.error('[Stream Worker] Failed to create version record:', error);
        // Continue - project exists, version creation failure shouldn't break deployment
      }

      // Mark session as complete
      await completeSession(buildId);

      // Broadcast build completion to chat system via SSE
      try {
        const broadcastService = ChatBroadcastService.getInstance();
        await broadcastService.broadcastMessage(projectId, {
          id: ulid(),
          seq: 0, // Will be updated when message is persisted
          user_id: userId,
          message_text: '',
          message_type: 'assistant',
          mode: 'build',
          actor_type: 'assistant',
          created_at: new Date().toISOString(),
          build_id: buildId,
          response_data: {
            type: 'build_completed',
            buildId,
            versionId,
            message: '🎉 Build completed successfully!',
            files_created: result?.filesCreated || 0,
            duration: Math.round((Date.now() - claudeStartTime.getTime()) / 1000)
          }
        });
        console.log(`[StreamWorker] Broadcasted build completion for ${buildId}`);
      } catch (error) {
        console.error(`[StreamWorker] Failed to broadcast build completion:`, error);
        // Don't fail the build if broadcasting fails
      }

      // Emit clean development completion event with structured i18n code
      await cleanEmitter.phaseCompletedWithCode(
        'development',
        'BUILD_DEVELOPMENT_COMPLETE',
        calculateOverallProgress('development', 1.0),
        {
          timestamp: Date.now(),
          projectId,
          filesCreated: result?.filesCreated || 0,
          duration: Math.round((Date.now() - claudeStartTime.getTime()) / 1000)
        },
        undefined  // Duration not available from session result
      );

      // Check for e2e mock session and bypass deployment if detected
      const isMockSession = result.sessionId && result.sessionId.includes('mock_session_');
      
      if (isMockSession) {
        console.log(`[Stream Worker] E2E mock session detected (${result.sessionId}) - bypassing deployment and using static URL`);

        // Use static e2e test URL instead of deploying
        const staticE2EUrl = 'https://0b582d0b.sheenapps-preview.pages.dev/';

        // Note: Version record already created above (line 739) - don't create again

        // Update project status to deployed with static URL
        await updateProjectConfig(projectId, {
          status: 'deployed',
          lastBuildCompleted: new Date(),
          previewUrl: staticE2EUrl,
          deployment_lane: 'e2e-mock',
          deployment_lane_detected_at: new Date(),
          deployment_lane_detection_origin: 'mock_session',
          deployment_lane_reasons: ['E2E test mock session - bypassed deployment'],
          deployment_lane_switched: false
        });
        
        console.log(`[Stream Worker] E2E mock build completed successfully: ${staticE2EUrl}`);
        console.log(`[Stream Worker] Bypassed deployment queue - e2e test completed in ~3 seconds`);
        
        return; // Skip deployment queue entirely
      }
      
      // Queue deployment job for non-e2e builds
      console.log(`[Stream Worker] Queueing deployment for ${buildId}`);
      
      // Log deployment queue action
      unifiedLogger.action(userId, 'deployment_queued', undefined, undefined, undefined, undefined, {
        buildId,
        projectId,
        message: 'Build queued for deployment processing',
        versionId,
        framework
      });
      
      const queue = requireQueue(deployQueue, 'deployments');
      const deployJob = await queue.add('deploy-build', {
        buildId,
        planId: `stream-${buildId}`, // Compatibility with deploy worker
        projectPath,
        userId,
        projectId,
        versionId,
        prompt,
        baseVersionId: streamJob.data.baseVersionId // Pass through for dependency detection
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        }
      });

      // Enhanced logging for deployment job (expert recommendation)
      console.log(`[Stream Worker] Enqueued deploy job id=${deployJob.id} on 'deployments' queue`);
      const backoffDelay = typeof deployJob.opts?.backoff === 'object' ? deployJob.opts.backoff.delay : deployJob.opts?.backoff;
      console.log(`[Stream Worker] Deploy job status: ${deployJob.opts?.attempts} attempts, delay: ${backoffDelay}ms`);

      // Generate metadata for all successful builds
      if (result.success) {
        const { streamQueue } = await import('../queue/streamQueue');

        if (isInitialBuild) {
          // Full metadata generation for initial builds
          console.log('[Stream Worker] Queueing full metadata generation for initial build');
          await streamQueue.add('generate-metadata', {
            buildId,
            userId,
            projectId,
            projectPath,
            versionId,
            framework,
            originalPrompt: prompt,
            isInitialBuild: true,
            sessionId: result.sessionId
          }, {
            delay: 0, // Start immediately - run in parallel with npm install!
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 10000,
            }
          });
        } else {
          // Only generate recommendations for updates (faster, cheaper)
          console.log('[Stream Worker] Queueing recommendations generation for update');
          await streamQueue.add('generate-metadata', {
            buildId,
            userId,
            projectId,
            projectPath,
            versionId,
            framework,
            originalPrompt: prompt,
            isInitialBuild: false,
            sessionId: result.sessionId
          }, {
            delay: 0, // Start immediately
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 10000,
            }
          });
        }
      }

      return {
        success: true,
        buildId,
        versionId,
        sessionId: result.sessionId,
        message: 'Build completed successfully'
      };

    } catch (error) {
      console.error(`[Stream Worker] Build ${buildId} failed:`, error);
      
      // Log build failure to unified logging system
      const buildSessionDuration = streamJob.processedOn ? Date.now() - streamJob.processedOn : 0;
      unifiedLogger.lifecycle('build_failed', 'streamWorker', `Build failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        buildId,
        userId,
        projectId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        sessionDuration: Math.round(buildSessionDuration / 1000),
        attemptNumber,
        isTimeout: error instanceof Error && error.message.includes('timeout'),
        correlationId
      });

      // Determine error type for proper handling
      let errorType = 'build_failed';
      let shouldRetry = true; // Default retry behavior
      const queueManager = QueueManager.getInstance();

      if (isSystemConfigurationError(error)) {
        errorType = 'system_config_error';
        shouldRetry = false; // Don't retry system configuration errors
        console.error(`[Stream Worker] System configuration error - no retry: ${error.message}`);

        // Pause queue indefinitely for system configuration errors
        try {
          await queueManager.pauseForSystemError(error.configurationType, error.resolution);
          
          // Log queue pause action
          unifiedLogger.system('queue_paused_system_error', 'error', `Queue paused due to system configuration error: ${error.configurationType}`, {
            buildId,
            errorType: error.configurationType,
            resolution: error.resolution,
            errorMessage: error.message
          });
        } catch (pauseError) {
          console.error(`[Stream Worker] Failed to pause queue for system error:`, pauseError);
        }

      } else if (isUsageLimitError(error)) {
        errorType = 'usage_limit_exceeded';
        shouldRetry = false; // Don't retry usage limit errors
        console.error(`[Stream Worker] Usage limit exceeded - no retry until ${new Date(error.resetTime).toISOString()}`);

        // Pause queue until usage limit resets
        try {
          await queueManager.pauseForUsageLimit(error.resetTime, error.message);
          
          // Log queue pause action
          unifiedLogger.system('queue_paused_usage_limit', 'warn', `Queue paused due to usage limit until ${new Date(error.resetTime).toISOString()}`, {
            buildId,
            resetTime: error.resetTime,
            resetTimeISO: new Date(error.resetTime).toISOString(),
            errorMessage: error.message
          });
        } catch (pauseError) {
          console.error(`[Stream Worker] Failed to pause queue for usage limit:`, pauseError);
        }

      } else if (error instanceof Error && error.name === 'InsufficientAITimeError') {
        errorType = 'insufficient_balance';
        shouldRetry = false; // Don't retry insufficient balance
      }

      // End AI time tracking for failed builds (if tracking was started and not already completed)
      try {
        // Only attempt to end tracking if it hasn't been completed yet
        if (!aiTimeTrackingCompleted) {
          const aiTimeConsumption = await metricsService.endAITimeTracking(buildId, {
            userId,
            projectId,
            versionId,
            success: false,
            errorType
          });

          if (aiTimeConsumption) {
            console.log(`[Stream Worker] AI time tracked for failed build ${buildId}: ${aiTimeConsumption.billableSeconds}s`);

            // AI time consumed for failed build (internal billing only)
          }
        } else {
          console.log(`[Stream Worker] AI time tracking already completed for ${buildId}, skipping duplicate recording`);
        }
      } catch (trackingError) {
        console.error(`[Stream Worker] Failed to end AI time tracking for failed build ${buildId}:`, trackingError);
        // Don't let tracking errors mask the original build error
      }

      // Calculate session duration
      const errorSessionDuration = streamJob.processedOn ? Date.now() - streamJob.processedOn : 0;

      // Display failure stats
      console.log('\n❌ Claude Session Failed:');
      console.log('================================');
      console.log(`🎯 Project: ${userId}/${projectId}`);
      console.log(`⏱️  Session Duration: ${(errorSessionDuration / 1000).toFixed(1)}s`);
      console.log(`❗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`🔄 Attempt: ${attemptNumber} of ${streamJob.opts.attempts || 3}`);

      // Check if it was a timeout
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      if (isTimeout) {
        console.log('\n⏰ Session Timeout Details:');
        console.log(`  - Timeout was: ${sessionTimeout}ms (${sessionTimeout/60000} minutes)`);
        console.log('  - Consider breaking down the request into smaller tasks');
        console.log('  - Or increase timeout with CLAUDE_INITIAL_TIMEOUT env var');
      }

      // Check if we'll retry
      if (attemptNumber < (streamJob.opts.attempts || 3)) {
        console.log('\n🔄 Will Retry:');
        console.log(`  - Next attempt will be #${attemptNumber + 1}`);
        console.log('  - Claude will resume from existing files');
      } else {
        console.log('\n❌ No More Retries:');
        console.log('  - Maximum attempts reached');
        console.log('  - Manual intervention may be required');
      }
      console.log('================================\n');

      // Emit clean failure event
      const errorEmitter = new CleanEventEmitter(buildId, userId);
      await errorEmitter.buildFailed(
        'development', // Most failures happen during development phase
        error instanceof Error ? error.message : 'Unknown error',
        {
          sessionDuration: errorSessionDuration,
          attemptNumber,
          isTimeout,
          errorType
        }
      );

      // Broadcast build failure to chat system via SSE
      try {
        const broadcastService = ChatBroadcastService.getInstance();
        await broadcastService.broadcastMessage(projectId, {
          id: ulid(),
          seq: 0, // Will be updated when message is persisted
          user_id: userId,
          message_text: '',
          message_type: 'assistant',
          mode: 'build',
          actor_type: 'assistant',
          created_at: new Date().toISOString(),
          build_id: buildId,
          response_data: {
            type: 'build_failed',
            buildId,
            versionId,
            message: '❌ Build failed. Please check the error details and try again.',
            error_type: errorType,
            error_message: error instanceof Error ? error.message : 'Unknown error',
            duration: Math.round(errorSessionDuration / 1000),
            attempt_number: attemptNumber,
            will_retry: attemptNumber < (streamJob.opts.attempts || 3)
          }
        });
        console.log(`[StreamWorker] Broadcasted build failure for ${buildId}`);
      } catch (broadcastError) {
        console.error(`[StreamWorker] Failed to broadcast build failure:`, broadcastError);
        // Don't fail the error handling if broadcasting fails
      }

      // No version record cleanup needed - we never create version records for failed builds
      console.log(`[Stream Worker] Build ${buildId} failed - no version record was created (following principle: only successful deployments get version records)`);

      // Update project config to show build failed
      try {
        await updateProjectConfig(projectId, {
          status: 'failed',
          buildId: buildId,
          lastBuildCompleted: new Date()
        });
      } catch (error) {
        console.error('[Stream Worker] Failed to update project config (failed):', error);
      }

      // Record failed build metrics with specific error type
      await metricsService.recordBuildComplete(buildId, 'failed', errorType);

      // For system configuration and usage limit errors, don't retry - fail immediately
      if (!shouldRetry) {
        console.log(`[Stream Worker] Build ${buildId} failed with non-retryable error: ${errorType}`);

        // Throw UnrecoverableError to prevent BullMQ from retrying
        // This is the recommended pattern in BullMQ 4.x+ (replaces deprecated job.discard())
        throw new UnrecoverableError(
          `NON_RETRYABLE_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: parseInt(process.env.STREAM_WORKER_CONCURRENCY || '3'),
    autorun: false, // Don't start automatically
    removeOnComplete: {
      age: 3600, // 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 86400, // 24 hours
      count: 500,
    }
  }
);

// Function moved to config/timeouts.env.ts

/**
 * Helper function to clean JSON content from Claude CLI artifacts
 * Claude sometimes adds shell-related output like "EOF < /devnull" at the end of JSON files
 */
function cleanClaudeJsonOutput(content: string): string {
  // Remove common Claude CLI artifacts that can appear at the end of JSON files
  let cleaned = content
    .replace(/EOF\s*<\s*\/devnull\s*$/g, '')  // Remove EOF < /devnull
    .replace(/\n\s*EOF\s*$/g, '')              // Remove standalone EOF
    .replace(/<<<\s*EOF\s*$/g, '')             // Remove <<< EOF
    .replace(/>>>\s*EOF\s*$/g, '')             // Remove >>> EOF
    .replace(/<<EOF\s*$/g, '')                 // Remove <<EOF
    .replace(/EOF\s*$/g, '')                   // Remove trailing EOF
    .trim();

  // Find the last valid JSON closing brace/bracket
  // This ensures we only parse valid JSON even if there's garbage after it
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
    // Check if there's non-whitespace content after the last }
    const afterBrace = cleaned.substring(lastBrace + 1).trim();
    if (afterBrace && !afterBrace.match(/^[\s\n]*$/)) {
      console.log(`[Stream Worker] Cleaning JSON - removed trailing content: "${afterBrace.substring(0, 50)}..."`);
      cleaned = cleaned.substring(0, lastBrace + 1);
    }
  }

  return cleaned;
}

function constructPrompt(userPrompt: string, framework: string | undefined, isInitialBuild: boolean, attemptNumber: number = 1, existingFiles: string[] = [], packageManager = 'pnpm', lastError?: string): string {
  const isRetry = attemptNumber > 1;
  const hasExistingFiles = existingFiles.length > 0;
  const isUpdate = !isInitialBuild || hasExistingFiles;

  // Handle retry scenarios with speed focus
  if (isRetry) {
    let basePrompt: string;

    if (hasExistingFiles) {
      basePrompt = constructResumePrompt(userPrompt, framework, existingFiles, attemptNumber, packageManager);
    } else if (attemptNumber === 2) {
      basePrompt = constructSpeedModePrompt(userPrompt, framework, packageManager);
    } else if (attemptNumber >= 3) {
      basePrompt = constructBareMinimumPrompt(userPrompt, framework, packageManager);
    } else {
      // Fallback case
      basePrompt = constructSpeedModePrompt(userPrompt, framework, packageManager);
    }

    // Add error context if available and not already added (guard against double-context)
    if (lastError && !basePrompt.includes('PREVIOUS ERROR CONTEXT')) {
      const errorContext = ErrorContextService.getEnhancedErrorContext(lastError);
      basePrompt = `${errorContext}\n\n${basePrompt}`;
    }

    return addEnvironmentContext(basePrompt, packageManager);
  }

  // Check if this is an update to an existing project
  if (isUpdate) {
    const basePrompt = `IMPORTANT: You are updating an existing project. Users are non-technical; infer needs from the request + current code. Make the SMALLEST safe change.

PRIORITY SOURCES (do not guess)
1) .sheenapps/deploy-intent.json — if present, treat "lane" as the source of truth and KEEP it unless the user’s new request CLEARLY requires a different lane. If you change it, update the file (see “IF CHANGING LANE”).
2) Code detection (current framework & beacons).
3) Fallback (static).

DISCOVER (before edits)
1) Read \`sheenapps-project-info.md\` (if present) to learn current framework + lane (pages-static | pages-edge | workers-node).
2) Inspect only files relevant to the request; understand current behavior.
3) Keep framework & lane unless the request CLEARLY requires a change.

FRAMEWORK DETECTION (be conservative)
- Vite/SPA: if a \`vite.config.*\` exists OR package.json has a Vite dependency, treat as SPA.
- Next.js (App Router only): if \`next.config.*\` exists OR package.json has \`next\`.
- Otherwise: plain static.

LANE DECISION (inferred; not user-chosen)
- Stay **Pages Static** if still client-only (no APIs/SSR, no server files).
- Use **Pages Edge** for lightweight server logic with Web/Fetch APIs ONLY (no Node built-ins, no runtime use of \`process.env\`).
- Use **Workers Node** if ANY Node-only need is present, e.g.:
  • runtime use of \`process.env\` or secrets
  • Node built-ins (\`node:fs\`/\`path\`/\`crypto\`/\`child_process\`), native/heavy libs, background jobs
  • Next.js ISR/revalidate, or server-side admin keys (e.g., Supabase service role)
Conflict rule: if you see edge beacons + Node built-ins, choose **Workers Node** and remove edge beacons.

LANE BEACONS TO ENFORCE (keep unambiguous)
Generic:
- Static: no server files; no Node built-ins; no runtime beacons; Vite/SPA outputs to \`dist/\` (or \`build/\`).
- Edge: a Pages Function (\`functions/**\`) or \`_worker.ts\` using ONLY Web APIs; **no** Node types in tsconfig; **no** Node built-ins.
- Workers Node: \`_worker.ts\` or server files may import Node built-ins; tsconfig includes \`"types": ["node"]\`; **no** edge beacons.

Next.js (App Router only, if this project uses Next):
- Static: \`next.config.*\` has \`{ output: "export" }\`; no \`app/api\` or server beacons.
- Edge: **every** server file includes \`export const runtime = "edge"\`; no Node built-ins; no ISR/revalidate; no Node types.
- Workers Node: add \`export const runtime = "nodejs"\` in server files; allow Node built-ins; add \`export const dynamic = "force-dynamic"\` or \`export const revalidate = 0\`; **no** \`runtime="edge"\` anywhere.

IF CHANGING LANE (do this precisely)
1) Remove conflicting beacons from other lanes (e.g., delete \`runtime="edge"\` when moving to Workers Node; remove \`app/api/**\` if moving to Static unless you also remove server usage).
2) Adjust tsconfig: remove Node types for Edge; add \`"types": ["node"]\` for Workers Node.
3) Ensure minimal server entry exists:
   - Edge: Pages Function or \`_worker.ts\` using Web APIs
   - Workers Node: server file/\`_worker.ts\` that imports a Node built-in (e.g., \`node:crypto\`)
4) Update **.sheenapps/deploy-intent.json** EXACTLY:
{
  "framework": "<vite-react|vite-vue|vite-svelte|nextjs|static>",
  "lane": "<pages-static|pages-edge|workers-node>",
  "reasons": ["<short bullets>"],
  "evidence": [{"file":"<path>","marker":"<what proves the choice>"}]
}
5) Update \`sheenapps-project-info.md\` (clear, non-technical; ~100–120 lines max).

NEXT.JS VERSION GUARD (Cloudflare OpenNext)
- If lane is **workers-node** and project uses Next.js, ensure Next ≥ 14.2.0.
- If package.json pins a lower 14.x (e.g., 14.0–14.1), bump EXACTLY to \`"next": "14.2.0"\` (no caret) and keep the existing package manager/lock. Do not add deployment tooling deps.

GENERAL IMPLEMENTATION RULES
- Don’t add deployment tooling deps (wrangler, next-on-pages, etc.).
- Only add deps you truly use; pin EXACT versions; don’t switch package manager/lock unintentionally.
- TypeScript hygiene: \`npx tsc --noEmit\` must pass; imports match exports; delete unused code/params/imports; no duplicate JSX attrs; use \`_param\` for intentionally unused params.

LANE POLICY (do NOT change lane unless the request clearly requires it)
- pages-static: client-only. No server files, no API routes, Next { output:"export" }.
- pages-edge: lightweight server logic using Web/Fetch APIs ONLY. No Node built-ins, no runtime use of process.env.
- workers-node: any Node-only need (runtime process.env, node:* modules, ISR/revalidate, heavy libs).
Conflict rule: if edge beacons + Node-only needs coexist, choose workers-node and remove ALL edge beacons.

CLOUDFLARE/OPENNEXT HARD RULES (must be satisfied after edits)
- Do NOT ship \`export const runtime = "edge"\` inside Next \`app/api/**/route.*\` when targeting Cloudflare with OpenNext.
  • For Edge APIs, put logic in \`functions/**\` (Pages Function with \`export const onRequest\`).
  • Optionally keep a minimal Next route that returns \`Response("OK")\` (or remove it), but not the real edge logic.
- If lane = workers-node:
  • Ensure all Next server files use \`export const runtime = "nodejs"\` (or no runtime beacon).
  • There must be **no** \`runtime: "edge"\` anywhere.
- If lane = pages-edge:
  • No imports from \`node:*\` and no \`process.env\` at runtime; remove Node types from tsconfig.

VALIDATION (no dev servers)
- Run \`npm run build\` (or existing build script) and/or \`npx tsc --noEmit\`.
- For Next.js Workers Node lane, fail fast if Next < 14.2.0 and apply the version guard above.
- Do **not** run \`dev\` servers; they hang CI.
- For Cloudflare/OpenNext, no Next edge runtime remains inside \`app/api/**/route.*\`.


USER’S UPDATE REQUEST:
${userPrompt}

Make the minimal edits to satisfy the request, keep the lane coherent end-to-end, and finish with a clean build.`;

    const finalPrompt = addEnvironmentContext(basePrompt, packageManager);
    console.log(`[Stream Worker] Constructed update prompt length: ${finalPrompt.length} chars (attempt ${attemptNumber})`);
    return finalPrompt;
  }

  // Normal first attempt prompt for new projects
  //we will delegate the framework selection to claude using the prompt below:
  // we removed this sentence from the technical requirements after developing the cloudflare three lane deployment system
  // - Make it production-ready for Cloudflare Pages deployment

const basePrompt = `Create a web application from the user's request.

User Request: ${userPrompt}

## 1) Choose ONE framework AND ONE runtime lane (keep the project consistent)
Framework: default to **Vite** (+ React/Vue/Svelte) unless the request clearly needs SSR/routing conventions that fit **Next.js**.

Runtime lanes:
- **Pages Static** (no server)
- **Pages Edge** (edge functions; Web APIs only)
- **Workers Node** (full Node.js via nodejs_compat)

### Lane selection heuristics
- Static content, no APIs/SSR → Pages Static
- API/SSR and NO Node-only features → Pages Edge
- Any Node-only need (process.env at request time, Node built-ins like node:crypto/fs, ISR/revalidate, heavy/native libs, server-side admin keys) → Workers Node

### Lane contract (must write)
Create **.sheenapps/deploy-intent.json**:
{
  "framework": "<vite-react|vite-vue|vite-svelte|nextjs>",
  "lane": "<pages-static|pages-edge|workers-node>",
  "reasons": ["<short bullets>"],
  "evidence": [{"file":"<path>","marker":"<what proves the choice>"}]
}

## 2) Lane beacons (authoritative markers)
**Generic (any framework)**
- Pages Static: no server code; no Node built-ins; no runtime beacons. For Vite: SPA files only, output to dist/.
- Pages Edge: provide a Pages Function (\`functions/**\`) or \`_worker.ts\` using only Web/Fetch APIs; **no** Node built-ins; **no** Node types in tsconfig.
- Workers Node: provide a Worker entry (\`_worker.ts\`) or Next server files that may import Node built-ins; tsconfig includes \`"types": ["node"]\`; **no** edge beacons.

**Next.js (App Router only, if you choose Next)**
- Pages Static: \`next.config.*\` includes \`{ output: "export" }\`; **no** \`app/api\` or \`pages/api\`; **no** \`runtime = "edge" | "nodejs"\`.
- Pages Edge: **every** server file has \`export const runtime = "edge"\`; **no** Node built-ins; **no** ISR/revalidate; **no** Node types in tsconfig.
- Workers Node: at least one server file has \`export const runtime = "nodejs"\`; Node built-ins allowed; add \`export const dynamic = "force-dynamic"\` or \`export const revalidate = 0\`; **no** \`runtime = "edge"\` anywhere.

> Never mix beacons. If any Node built-in or \`runtime="nodejs"\` exists → choose **Workers Node** and remove all edge flags.
> If any file uses \`runtime="edge"\` → do **not** import Node built-ins anywhere.

### Health routes (server lanes only)
- Pages Edge: add a tiny health route using **Web Crypto** (no Node): e.g. \`functions/api/edge-health.ts\` or \`app/api/edge-health/route.ts\`.
- Workers Node: add a tiny health route using a **Node built-in** (e.g. \`crypto.randomBytes\`).

## 3) Required files by lane (minimal)
**Pages Static (default; Vite recommended)**
- Vite + React/Vue/Svelte minimal SPA:
  - \`package.json\` (scripts: dev, build → \`vite build\`)
  - \`index.html\`, \`src/main.(ts|tsx|js)\`, \`src/App.(tsx|vue|svelte)\`, \`src/index.css\`
- **Do not** create \`functions/\`, \`_worker.ts\`, or any server routes.

**Pages Edge**
- Next option: App Router with \`app/api/<name>/route.ts\` and \`export const runtime="edge"\` in **every** server file.
- Non-Next option: Pages Functions (\`functions/**\`) or \`_worker.ts\` using **only** Web/Fetch APIs.

**Workers Node**
- Next option: server files with \`export const runtime="nodejs"\`; may use Node built-ins; use \`dynamic="force-dynamic"\` or \`revalidate=0\` for SSR.
- Non-Next option: \`_worker.ts\` Worker entry that imports a Node built-in; tsconfig includes \`"types":["node"]\`.

## 4) Tech requirements
- TypeScript \`"strict": true\`. Include \`package.json\`, \`tsconfig.json\`, and framework configs.
- Only add deps you actually use. **Pin exact versions** (no ranges). Do **not** add deployment tooling deps (wrangler, @cloudflare/next-on-pages, etc.).
- If you picked **Next for Pages Edge tests**: pin \`"next":"14.2.5"\`, \`"react":"18.2.0"\`, \`"react-dom":"18.2.0"\`, \`"typescript":"5.3.3"\`. Use \`next.config.mjs\` (convert from .ts if needed). Avoid Next 15 for Edge tests.

Suggested tsconfig (common):
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}

## 5) Quick self-checks
General:
- Imports match exports; no unused code; \`npx tsc --noEmit\` passes.

Static:
- (Next) \`output:"export"\`; **no** server files; **no** runtime beacons; **no** Node built-ins. Build emits \`/out\` (or framework default).

Edge:
- **Every** server file has \`runtime="edge"\` (Next) or functions exist under \`functions/\` / \`_worker.ts\`.
- **No** Node built-ins; **no** Node types; **no** ISR/revalidate.
- Health route (Web APIs) present.

Workers Node:
- At least one server file has \`runtime="nodejs"\` (Next) **or** a Worker entry uses a Node built-in.
- \`"types":["node"]\` in tsconfig; **no** \`runtime="edge"\`.
- Health route (Node built-in) present.

If a check fails, fix the code or switch lanes, then update **.sheenapps/deploy-intent.json**.

## 6) Minimal templates (copy verbatim when applicable)
**Vite + React (Pages Static)**
package.json (excerpt)
{
  "name": "app",
  "version": "1.0.0",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "18.2.0", "react-dom": "18.2.0" },
  "devDependencies": { "vite": "5.1.4", "typescript": "5.3.3" }
}
src/App.tsx
export function App() { return <main className="p-6">Hello World</main>; }

**Pages Functions (Pages Edge)**
functions/api/edge-health.ts
export const onRequest: PagesFunction = async () =>
  new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: { "content-type": "application/json" } });

**Next (Pages Edge) — example route**
app/api/hello/route.ts
export const runtime = 'edge';
export async function GET() { return Response.json({ ok: true, ts: Date.now() }); }

**Next (Workers Node) — example route**
app/api/hello/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import crypto from 'node:crypto';
export async function GET() { return Response.json({ ok: true, id: crypto.randomUUID(), ts: Date.now() }); }

**Worker entry (Workers Node, non-Next)**
_worker.ts
import crypto from 'node:crypto';
export default {
  async fetch(req, env, ctx) {
    return new Response(JSON.stringify({ ok: true, id: crypto.randomUUID(), ts: Date.now() }), { headers: { "content-type": "application/json" } });
  }
};

## 7) Files to produce
Start creating files immediately. Keep everything consistent with the single chosen lane and framework.`;


  const finalPrompt = addEnvironmentContext(basePrompt, packageManager);
  console.log(`[Stream Worker] Constructed prompt length: ${finalPrompt.length} chars (attempt ${attemptNumber})`);
  return finalPrompt;
}

function constructResumePrompt(userPrompt: string, framework: string | undefined, existingFiles: string[], attemptNumber: number, packageManager = 'pnpm'): string {
  const timeLimit = attemptNumber >= 3 ? '3 minutes' : '5 minutes';

  return `IMPORTANT: You have ${timeLimit} to complete this task. Some files already exist.

Quick summary: Building a ${framework} app: "${userPrompt}"

Files already created:
${existingFiles.map(f => `✓ ${f}`).join('\n')}

SPEED PRIORITY: Complete the remaining ESSENTIAL files only:
1. Any missing core components (combine if needed)
2. Minimal styles (just enough to work)
3. Ensure app can run with npm/yarn commands

Skip: Detailed styling, animations, extensive comments, perfect structure.
Focus: Make it functional quickly.

ENVIRONMENT CONTEXT:
- Package manager: ${packageManager}
- Use ${packageManager} commands for consistency

Start immediately with the most critical missing files.`;
}

function addEnvironmentContext(basePrompt: string, packageManager: string): string {
  return `${basePrompt}

ENVIRONMENT CONTEXT:
- Package manager: ${packageManager}
- Use ${packageManager} commands for consistency`;
}

function constructSpeedModePrompt(userPrompt: string, framework: string | undefined, packageManager = 'pnpm'): string {
  return `SPEED MODE: You have 5 minutes. Previous attempt timed out.

Build a MINIMAL app: "${userPrompt}"

Use ${framework} unless the user specified a different framework in their request.

CRITICAL RULES:
1. Create only ESSENTIAL files
2. Use minimal CSS (basic layout only)
3. Skip animations, transitions, complex features
4. Combine components into fewer files if needed
5. Focus on core functionality only

File priorities:
- package.json (minimal dependencies)
- tsconfig.json (basic config)
- index.html
- src/main.tsx
- src/App.tsx (can contain multiple components)
- src/index.css (minimal styles)

ENVIRONMENT CONTEXT:
- Package manager: ${packageManager}
- Use ${packageManager} commands for consistency

Remember: Working > Perfect. Ship it!`;
}

function constructBareMinimumPrompt(userPrompt: string, framework: string | undefined, packageManager = 'pnpm'): string {
  return `URGENT: Final attempt - 3 minutes max!

Create ONLY these files for an app (use ${framework} unless user specified otherwise):
- package.json (minimal deps for chosen framework + vite + typescript)
- tsconfig.json (basic config)
- index.html (basic template)
- src/main.tsx or src/main.ts (entry point)
- src/App.tsx or src/App.vue (ALL components in ONE file, max 200 lines)
- src/index.css (max 50 lines of CSS)

User wanted: "${userPrompt}"

ENVIRONMENT CONTEXT:
- Package manager: ${packageManager}
- Use ${packageManager} commands for consistency

Just make it run with '${packageManager} install && ${packageManager} run dev'. Nothing fancy. Inline all components.`;
}

// Worker lifecycle handlers
streamWorker.on('completed', (job) => {
  console.log(`[Stream Worker] Job ${job.id} completed successfully`);
});

streamWorker.on('failed', (job, err) => {
  console.error(`[Stream Worker] Job ${job?.id} failed:`, err);
});

streamWorker.on('active', (job) => {
  console.log(`[Stream Worker] Job ${(job as any).id} started processing`);
});

streamWorker.on('stalled', (jobId) => {
  console.log(`[Stream Worker] Job ${jobId} stalled`);
});

// Export functions for managing the worker
let isRunning = false;
export async function startStreamWorker() {
  if (isRunning) {
    console.log('[Stream Worker] Already running, skipping start');
    return;
  }
  console.log('[Stream Worker] Starting...');
  console.log('[Stream Worker] Connection:', connection);
  console.log('[Stream Worker] Autorun:', streamWorker.opts.autorun);

  // REMOVED: deployment event listener (consolidated table eliminates need for complex event system)
  // const { startDeploymentEventListener } = await import('./deploymentEventListener');
  // await startDeploymentEventListener();

  isRunning = true;
  try {
    await streamWorker.run();
    console.log('[Stream Worker] Run completed');
  } catch (error) {
    console.error('[Stream Worker] Run failed:', error);
    isRunning = false;
    throw error;
  }
}

export async function shutdownStreamWorker() {
  console.log('[Stream Worker] Shutting down...');
  isRunning = false;
  await streamWorker.close();
}

// Handler for metadata generation jobs
async function handleMetadataGeneration(job: Job<MetadataJobData>) {
  const { buildId, userId, projectId, projectPath, versionId, framework, originalPrompt, isInitialBuild = true, sessionId } = job.data;

  // Declare docResult at function scope for accessibility throughout
  let docResult: SessionResult | null = null;

  console.log(`[Stream Worker] Generating ${isInitialBuild ? 'full metadata' : 'version name, recommendations and only updating some of the metadata'} for ${userId}/${projectId}`);
  if (sessionId) {
    console.log(`[Stream Worker] Will resume session ${sessionId} for metadata generation`);
  }

  // Initialize clean event emitter for metadata generation
  const cleanEmitter = new CleanEventEmitter(buildId, userId);

  try {
    // Metadata generation started with structured i18n code
    await cleanEmitter.phaseStartedWithCode(
      'metadata',
      'BUILD_METADATA_GENERATING',
      {
        timestamp: Date.now(),
        projectId,
        versionId,
        isInitialBuild
      }
    );

    // Phase 1: Generate recommendations quickly (10-15 seconds)
    // Check if recommendations were already generated by async worker
    const { getProjectRecommendationsByBuildId } = await import('../services/databaseWrapper');
    const existingRecommendations = await getProjectRecommendationsByBuildId(buildId, userId);

    if (existingRecommendations && existingRecommendations.recommendations?.length > 0) {
      console.log(`[Stream Worker] Recommendations already exist for ${buildId} (generated by async worker) - skipping regeneration`);

      // Still emit the progress event for consistency
      await cleanEmitter.phaseProgressWithCode(
        'metadata',
        'BUILD_RECOMMENDATIONS_GENERATED',
        60,
        {
          timestamp: Date.now(),
          projectId,
          versionId,
          recommendationCount: existingRecommendations.recommendations.length,
          source: 'async_worker'
        }
      );

      // Skip to documentation phase (Phase 2) - handled below
    } else {
      console.log(`[Stream Worker] No existing recommendations found for ${buildId} - generating synchronously`);
    }

    // Only run recommendations generation if not already done by async worker
    const shouldGenerateRecommendations = !existingRecommendations || existingRecommendations.recommendations?.length === 0;

    // Get previous version for semver context
    const previousVersion = await getLatestVersionMetadata(projectId);
    const currentSemver = previousVersion
      ? `${previousVersion.major_version}.${previousVersion.minor_version}.${previousVersion.patch_version}`
      : undefined;

    // Query infrastructure mode for SDK-aware recommendations
    const infraMode = await getProjectInfraMode(projectId);
    const isEasyMode = infraMode === 'easy';

    // Build clean, maintainable prompt (needed for fallback and documentation context)
    const recommendationsPrompt = buildRecommendationsPrompt({
      projectType: isInitialBuild ? 'create' : 'update',
      framework,
      originalPrompt,
      currentVersion: currentSemver,
      isEasyMode,
    });

    // Start AI time tracking for metadata generation (only if generating recommendations)
    let aiTimeTracking;
    let aiTimeTrackingEnded = false;
    let recResult: SessionResult | null = null;

    // Create Claude session for metadata generation (needed for both recommendations and documentation)
    const session = new ClaudeSession();

    if (shouldGenerateRecommendations) {
      try {
        aiTimeTracking = await metricsService.startAITimeTracking(buildId, 'metadata_generation', {
          projectId,
          versionId,
          userId,
          sessionId
        });

        console.log(`[Stream Worker] AI time tracking started for metadata generation ${buildId}. Estimated: ${aiTimeTracking.estimatedSeconds}s`);
      } catch (error) {
        // Handle insufficient balance error
        if (error instanceof Error && error.name === 'InsufficientAITimeError') {
          console.log(`[Stream Worker] Insufficient AI time balance for metadata generation ${buildId}: ${error.message}`);

          // Metadata generation insufficient balance (internal only)

          throw error;
        }

        // Re-throw other errors
        throw error;
      }

    // Resume existing session if available, otherwise create new session
    if (sessionId) {
      // Try to resume existing session
      const resumeResult = await session.resume(
        sessionId,
        recommendationsPrompt,
        projectPath,
        `${buildId}-recommendations`,
        CLAUDE_TIMEOUTS.recommendations,
        userId
      );

      // Check if we need to fallback to a new session
      if ((resumeResult as any).needsFallback) {
        console.log(`[Stream Worker] Session ${sessionId} not found, creating new session for recommendations`);
        recResult = await session.run(
          recommendationsPrompt,
          projectPath,
          `${buildId}-recommendations`,
          CLAUDE_TIMEOUTS.recommendations,
          userId,
          projectId
        );
      } else {
        recResult = resumeResult;
      }
    } else {
      // No session ID, create new session
      recResult = await session.run(
        recommendationsPrompt,
        projectPath,
        `${buildId}-recommendations`,
        CLAUDE_TIMEOUTS.recommendations,
        userId,
        projectId
      );
    }

    // End AI time tracking for metadata generation
    let aiTimeConsumption;
    try {
      aiTimeConsumption = await metricsService.endAITimeTracking(buildId, {
        userId,
        projectId,
        versionId,
        sessionId: recResult.sessionId,
        success: recResult.success,
        errorType: recResult.success ? undefined : 'metadata_generation_failed'
      });
      aiTimeTrackingEnded = true;

      if (aiTimeConsumption) {
        console.log(`[Stream Worker] AI time consumed for metadata generation ${buildId}: ${aiTimeConsumption.billableSeconds}s (${Math.ceil(aiTimeConsumption.billableSeconds / 60)}m)`);
      }
    } catch (error) {
      console.error(`[Stream Worker] Failed to record AI time consumption for metadata generation ${buildId}:`, error);
      // Don't fail the metadata generation for billing errors, just log them
    }

    if (recResult.success) {
      console.log('[Stream Worker] Recommendations generated successfully');

      // Read and parse recommendations file (with defensive error handling)
      const recommendationsPath = path.join(projectPath, '.sheenapps/recommendations.json');

      try {
        let recommendationsContent = await fs.readFile(recommendationsPath, 'utf-8');

        // Clean up common Claude CLI artifacts that can appear at the end of JSON files
        recommendationsContent = cleanClaudeJsonOutput(recommendationsContent);

        const recommendations = JSON.parse(recommendationsContent);

      // Validate schema BEFORE entering try-catch - fail-fast on invalid schema
      if (!validateRecommendationsSchema(recommendations)) {
        console.error('[Stream Worker] Recommendations schema validation failed - prompt-drift detected');
        throw new Error('Invalid recommendations schema - AI output does not match expected format');
      }

      // Save recommendations to database
      try {

        // Extract version information from project_info if available
        const versionInfo = recommendations.project_info;

        // Handle suggested project name for initial builds
        if (isInitialBuild && versionInfo?.suggestedProjectName) {
          try {
            // Update the project name from "Untitled Project" to the suggested name
            console.log(`[Stream Worker] Updating project name to suggested: "${versionInfo.suggestedProjectName}"`);

            // Update project name in database
            const updateResult = await getPool().query(
              `UPDATE projects
               SET name = $1, updated_at = NOW()
               WHERE id = $2::uuid
               AND name = 'Untitled Project'  -- Only update if still using default name
               RETURNING name`,
              [versionInfo.suggestedProjectName, projectId]
            );

            if (updateResult.rowCount === 1) {
              console.log(`[Stream Worker] ✅ Project renamed to: "${versionInfo.suggestedProjectName}"`);
            } else {
              console.log(`[Stream Worker] Project name not updated (may have been renamed already)`);
            }
          } catch (error) {
            console.error('[Stream Worker] Failed to update project name:', error);
            // Don't fail the build for this, it's a nice-to-have feature
          }
        }

        if (versionInfo?.version) {
          try {
            // Check if we already have a display version set
            const currentConfig = await getProjectConfig(projectId);
            if (currentConfig?.versionName?.startsWith('v') && /^v\d+$/.test(currentConfig.versionName)) {
              // We have a display version (v1, v2, etc), don't overwrite it
              // Instead, we could append semantic version info if needed
              console.log(`[Stream Worker] Keeping display version "${currentConfig.versionName}", semantic version is "${versionInfo.version}"`);
            } else {
              // No display version yet, use the semantic version
              await updateProjectConfig(projectId, {
                versionName: versionInfo.version
              });
              console.log(`[Stream Worker] Updated current_version_name to "${versionInfo.version}"`);
            }
          } catch (error) {
            console.error('[Stream Worker] Failed to update project current_version_name:', error);
          }
        }

        // Extract version metadata from AI response for immediate consolidation
        // IMPORTANT: Don't include versionName here as it would overwrite the display version (v1, v2, v3)
        const versionMetadata = {
          // versionName removed - we keep the display version that was set during deployment
          versionDescription: versionInfo.version_description || undefined,
          changeType: versionInfo.change_type || (isInitialBuild ? 'major' : 'patch'),

          // Parse semantic version components (use ?? for noUncheckedIndexedAccess safety)
          majorVersion: versionInfo.version ? parseInt(versionInfo.version.split('.')[0] ?? '1') : 1,
          minorVersion: versionInfo.version ? parseInt(versionInfo.version.split('.')[1] ?? '0') : 0,
          patchVersion: versionInfo.version ? parseInt(versionInfo.version.split('.')[2] ?? '0') : 0,
          prerelease: undefined,  // Can be enhanced later for pre-release versions

          // AI classification fields (will be populated by future AI classification)
          breakingRisk: undefined,
          autoClassified: undefined,
          classificationConfidence: undefined,
          classificationReasoning: undefined
        };

        // Update consolidated table immediately with version metadata
        try {
          // Log what we're actually updating to ensure version_name is NOT included
          console.log(`[Stream Worker] Updating version metadata (fields: ${Object.keys(versionMetadata).join(', ')})`);
          await updateProjectVersionStatus(versionId, null, versionMetadata); // null = don't change status (deploy worker handles that)
          console.log(`[Stream Worker] Updated version metadata for ${versionId}: semantic version components (${versionInfo.version})`);
        } catch (error) {
          console.error('[Stream Worker] Failed to update version metadata:', error);
          // Don't fail the entire metadata generation for this
        }

        // Save to database
        await saveProjectRecommendations({
          projectId,
          versionId,
          buildId,
          userId,
          recommendations: recommendations.recommendations
        });

        // Recommendations ready with structured i18n code
        await cleanEmitter.phaseProgressWithCode(
          'metadata',
          'BUILD_RECOMMENDATIONS_GENERATED',
          60, // 60% complete after recommendations
          {
            timestamp: Date.now(),
            projectId,
            versionId,
            recommendationCount: recommendations.recommendations?.length || 0
          }
        );

        // Emit recommendations_ready SSE event for frontend
        await cleanEmitter.recommendationsReady({
          projectId,
          versionId,
          recommendationCount: recommendations.recommendations?.length || 0,
          recommendations: recommendations.recommendations?.slice(0, 10).map((r: any) => ({
            id: r.id || String(Math.random()),
            title: r.title || r.recommendation || 'Untitled',
            type: r.type || 'improvement',
            priority: r.priority || 'medium'
          }))
        });

        console.log('[Stream Worker] Recommendations saved to database and webhook sent');
      } catch (error) {
        console.error('[Stream Worker] Failed to process recommendations:', error);
        // Emit recommendations_failed SSE event for frontend
        await cleanEmitter.recommendationsFailed({
          projectId,
          versionId,
          error: error instanceof Error ? error.message : 'Unknown error processing recommendations',
          recoverable: true
        });
      }

      } catch (fileError: any) {
        console.error('[Stream Worker] File read failed, attempting to parse output directly:', fileError);

        // Handle the specific case where Claude didn't create the recommendations file
        if (fileError.code === 'ENOENT' && fileError.path?.includes('recommendations.json')) {
          console.log('[Stream Worker] Attempting to extract recommendations from Claude output directly');

          try {
            // Try to parse recommendations from Claude's direct output
            const output = recResult.result || '';
            let recommendationsJson = null;

            // Look for JSON in the output (try different patterns)
            const jsonPatterns = [
              /```json\s*(\{[\s\S]*?\})\s*```/,
              /(\{[\s\S]*?"recommendations"[\s\S]*?\})/,
              /^(\{[\s\S]*\})$/m
            ];

            for (const pattern of jsonPatterns) {
              const match = output.match(pattern);
              if (match && match[1]) {
                try {
                  // Clean up the matched JSON content before parsing
                  const jsonContent = cleanClaudeJsonOutput(match[1]);
                  recommendationsJson = JSON.parse(jsonContent);
                  if (validateRecommendationsSchema(recommendationsJson)) {
                    console.log('[Stream Worker] Successfully parsed recommendations from output');
                    break;
                  }
                } catch (parseError) {
                  continue; // Try next pattern
                }
              }
            }

            if (recommendationsJson) {
              // Save the file ourselves
              const recommendationsPath = path.join(projectPath, '.sheenapps/recommendations.json');
              await fs.mkdir(path.dirname(recommendationsPath), { recursive: true });
              await fs.writeFile(recommendationsPath, JSON.stringify(recommendationsJson, null, 2));
              console.log('[Stream Worker] Saved recommendations file manually');

              // Process the recommendations (same logic as above)
              const versionInfo = recommendationsJson.project_info;

              // Handle suggested project name for initial builds (same as above)
              if (isInitialBuild && versionInfo?.suggestedProjectName) {
                try {
                  console.log(`[Stream Worker] Updating project name to suggested: "${versionInfo.suggestedProjectName}"`);

                  const updateResult = await getPool().query(
                    `UPDATE projects
                     SET name = $1, updated_at = NOW()
                     WHERE id = $2::uuid
                     AND name = 'Untitled Project'
                     RETURNING name`,
                    [versionInfo.suggestedProjectName, projectId]
                  );

                  if (updateResult.rowCount === 1) {
                    console.log(`[Stream Worker] ✅ Project renamed to: "${versionInfo.suggestedProjectName}"`);
                  } else {
                    console.log(`[Stream Worker] Project name not updated (may have been renamed already)`);
                  }
                } catch (error) {
                  console.error('[Stream Worker] Failed to update project name:', error);
                }
              }

              if (versionInfo?.version) {
                // IMPORTANT: Don't include versionName here as it would overwrite the display version (v1, v2, v3)
                const versionMetadata = {
                  // versionName removed - we keep the display version that was set during deployment
                  versionDescription: versionInfo.version_description || undefined,
                  changeType: versionInfo.change_type || (isInitialBuild ? 'major' : 'patch'),
                  majorVersion: versionInfo.version ? parseInt(versionInfo.version.split('.')[0]) : 1,
                  minorVersion: versionInfo.version ? parseInt(versionInfo.version.split('.')[1]) : 0,
                  patchVersion: versionInfo.version ? parseInt(versionInfo.version.split('.')[2]) : 0,
                  prerelease: undefined,
                  breakingRisk: undefined,
                  autoClassified: undefined,
                  classificationConfidence: undefined,
                  classificationReasoning: undefined
                };

                try {
                  console.log(`[Stream Worker] Updating version metadata (fields: ${Object.keys(versionMetadata).join(', ')})`);
                  await updateProjectVersionStatus(versionId, null, versionMetadata); // null = don't change status (deploy worker handles that)
                  console.log(`[Stream Worker] Updated version metadata for ${versionId}: semantic version components (${versionInfo.version})`);
                } catch (error) {
                  console.error('[Stream Worker] Failed to update version metadata:', error);
                }
              }

              // Save to database
              await saveProjectRecommendations({
                projectId,
                versionId,
                buildId,
                userId,
                recommendations: recommendationsJson.recommendations
              });

              await cleanEmitter.phaseProgressWithCode(
                'metadata',
                'BUILD_RECOMMENDATIONS_GENERATED',
                60,
                {
                  timestamp: Date.now(),
                  projectId,
                  versionId,
                  recommendationCount: recommendationsJson.recommendations?.length || 0,
                  recoveredFromOutput: true
                }
              );

              // Emit recommendations_ready SSE event for frontend (recovered path)
              await cleanEmitter.recommendationsReady({
                projectId,
                versionId,
                recommendationCount: recommendationsJson.recommendations?.length || 0,
                recommendations: recommendationsJson.recommendations?.slice(0, 10).map((r: any) => ({
                  id: r.id || String(Math.random()),
                  title: r.title || r.recommendation || 'Untitled',
                  type: r.type || 'improvement',
                  priority: r.priority || 'medium'
                }))
              });

              console.log('[Stream Worker] Successfully recovered and saved recommendations from output');
            } else {
              console.error('[Stream Worker] Could not extract valid recommendations from output');
              // Emit recommendations_failed for extraction failure
              await cleanEmitter.recommendationsFailed({
                projectId,
                versionId,
                error: 'Could not extract valid recommendations from Claude output',
                recoverable: false
              });
              throw fileError; // Re-throw original error
            }

          } catch (recoveryError) {
            console.error('[Stream Worker] Failed to recover recommendations from output:', recoveryError);
            // Emit recommendations_failed for recovery failure
            await cleanEmitter.recommendationsFailed({
              projectId,
              versionId,
              error: recoveryError instanceof Error ? recoveryError.message : 'Failed to recover recommendations from output',
              recoverable: false
            });
            throw fileError; // Re-throw original error
          }
        } else {
          // Emit recommendations_failed for non-file-related errors
          await cleanEmitter.recommendationsFailed({
            projectId,
            versionId,
            error: fileError.message || 'Unknown file error during recommendations generation',
            recoverable: false
          });
          throw fileError; // Re-throw non-file-related errors
        }
      }
    } // End of shouldGenerateRecommendations conditional

      // Phase 2: Generate documentation (only for initial builds)
    if (isInitialBuild) {
        const documentationPrompt = `Now, based on your current knowledge and what was implemented in this ${framework ? framework + ' ' : ''}project, create comprehensive documentation:

Create sheenapps-project-info.md with user-friendly documentation:
   - Write in a friendly, non-technical tone
   - Explain what the project does and its main features
   - List key files and their purposes in simple terms
   - Include helpful tips for customization
   - Make it engaging for non-developers
   - If applicable, mention non-obvious information and decisions (that will be good for a future developer)
`;

      // Continue with same session (either resumed or new) for documentation
      // If recommendations were skipped (async worker), recResult will be null

      if (sessionId && recResult && !(recResult as any).needsFallback) {
        // Try to resume if we still have a valid session
        const resumeDocResult = await session.resume(
          sessionId,
          documentationPrompt,
          projectPath,
          `${buildId}-documentation`,
          CLAUDE_TIMEOUTS.documentation,
          userId
        );

        // Check if we need to fallback
        if ((resumeDocResult as any).needsFallback) {
          console.log(`[Stream Worker] Session ${sessionId} not found for documentation, creating new session`);
          docResult = await session.run(
            documentationPrompt,
            projectPath,
            `${buildId}-documentation`,
            CLAUDE_TIMEOUTS.documentation,
            userId,
            projectId
          );
        } else {
          docResult = resumeDocResult;
        }
      } else {
        // No session or previous resume failed, create new session
        docResult = await session.run(
          documentationPrompt,
          projectPath,
          `${buildId}-documentation`,
          CLAUDE_TIMEOUTS.documentation,
          userId,
          projectId
        );
      }

      if (docResult && docResult.success) {
        console.log('[Stream Worker] Documentation generated successfully');

        // Metadata generation completed (internal only)
      } else if (docResult) {
        console.error('[Stream Worker] Documentation generation failed:', docResult.error);
      }
      } else {
        // For updates, we only generate recommendations, so we're done
        console.log('[Stream Worker] Update recommendations completed (skipping full documentation)');
        //TODO skip full documentation generation for updates, but maybe the current documentation needs to be updated?
        // Update recommendations completed (internal only)
      }
    } else if (recResult && !(recResult as any).success) {
      console.error('[Stream Worker] Recommendations generation failed:', (recResult as any).error);
    }

    // Get the latest session ID (from recommendations or documentation)
    let latestSessionId = sessionId;
    console.log(`[Stream Worker] DEBUG: Initial sessionId=${sessionId}, recResult.sessionId=${recResult?.sessionId}`);

    if (recResult?.sessionId) {
      latestSessionId = recResult.sessionId;
      console.log(`[Stream Worker] DEBUG: Updating project session from ${sessionId} to ${recResult.sessionId} for project ${projectId}, version ${versionId}`);

      // Update project with latest session ID for context continuity
      const { SessionManagementService } = await import('../services/sessionManagementService');
      try {
        await SessionManagementService.updateProjectSession(
          projectId,
          recResult.sessionId,
          'metadata_generation',
          versionId  // Also update version table
        );
        console.log(`[Stream Worker] DEBUG: Successfully updated project session to ${recResult.sessionId}`);
      } catch (error) {
        console.error(`[Stream Worker] DEBUG: Failed to update project session:`, error);
      }
    } else {
      console.log(`[Stream Worker] DEBUG: No new sessionId from recommendations, keeping original sessionId=${sessionId}`);
    }
    if (isInitialBuild && docResult?.sessionId) {
      latestSessionId = docResult.sessionId;

      // Update project with latest session ID from documentation generation
      const { SessionManagementService } = await import('../services/sessionManagementService');
      await SessionManagementService.updateProjectSession(
        projectId,
        docResult.sessionId,
        'metadata_generation',
        versionId
      );
    }

      // Compact session context after all operations are complete (if enabled)
      if (latestSessionId && recResult?.success) {
        try {
          // Check if session compacting is enabled via environment variable
          const sessionCompactingEnabled = process.env.ENABLE_CLAUDE_SESSION_COMPACTING === 'true';

          let finalSessionId = latestSessionId;

          if (sessionCompactingEnabled) {
            console.log(`[Stream Worker] Session compacting enabled - compacting session ${latestSessionId} after metadata generation`);
            const newSessionId = await session.compact(latestSessionId, buildId, projectPath, userId, projectId);

            // Use the new session ID from compact if available
            finalSessionId = newSessionId || latestSessionId;
          } else {
            console.log(`[Stream Worker] Session compacting disabled (ENABLE_CLAUDE_SESSION_COMPACTING != 'true') - keeping session ${latestSessionId} as-is`);
          }

          // Update BOTH projects and project_versions tables with the final compacted session ID
          console.log(`[Stream Worker] DEBUG: About to save final session ID ${finalSessionId} (from latestSessionId=${latestSessionId})`);

          const { SessionManagementService } = await import('../services/sessionManagementService');
          try {
            await SessionManagementService.updateProjectSession(
              projectId,
              finalSessionId,
              'compact',
              versionId  // Also update version table
            );
            console.log(`[Stream Worker] DEBUG: Successfully updated session via SessionManagementService to ${finalSessionId}`);
          } catch (error) {
            console.error(`[Stream Worker] DEBUG: Failed to update session via SessionManagementService:`, error);
          }

          // Also update via the existing method for backward compatibility
          try {
            await updateProjectVersionStatus(versionId, null, { // null = don't change status
              aiSessionId: finalSessionId,
              aiSessionLastUsedAt: new Date()
            });
            console.log(`[Stream Worker] DEBUG: Successfully updated session via updateProjectVersionStatus to ${finalSessionId}`);
          } catch (error) {
            console.error(`[Stream Worker] DEBUG: Failed to update session via updateProjectVersionStatus:`, error);
          }
          console.log(`[Stream Worker] Final compacted session ID ${finalSessionId} stored in both projects and versions tables`);
        } catch (error) {
          // Log but don't fail - compaction is an optimization
          console.error('[Stream Worker] Session compaction failed:', error);
        }
      }

    // Metadata generation completed successfully with structured i18n code
    await cleanEmitter.phaseCompletedWithCode(
      'metadata',
      'BUILD_METADATA_COMPLETE',
      100, // 100% complete
      {
        timestamp: Date.now(),
        projectId,
        versionId,
        recommendationsGenerated: true,
        documentationGenerated: true
      }
    );

    return {
      success: true,
      buildId,
      message: 'Metadata generation completed'
    };

  } catch (error) {
    console.error('[Stream Worker] Metadata generation failed:', error);

    // Metadata generation failed (internal only)
    await cleanEmitter.buildFailed(
      'metadata',
      error instanceof Error ? error.message : 'Unknown metadata generation error'
    );

    // Don't throw - this is a non-critical enhancement
    return {
      success: false,
      buildId,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// DEPRECATED: Handle version classification after deployment (consolidated table eliminates need)
// This function is kept for reference but no longer called
/*
async function handleVersionClassification(job: Job<VersionClassificationJobData>) {
  const {
    buildId,
    userId,
    projectId,
    projectPath,
    versionId,
    fromRecommendationId,
    buildDuration
  } = job.data;

  console.log(`[Stream Worker] Starting version classification for ${buildId}`);

  try {
    // Get previous version metadata
    const previousVersion = await getLatestVersionMetadata(projectId);

    // Classify the version using Claude
    const classification = await classifyVersion(
      buildId,
      projectPath,
      previousVersion,
      `${buildId}-version`,
      userId
    );

    // Create version service instance
    const versionService = new VersionService(projectPath);

    // Collect git statistics
    const stats = await versionService.collectBuildStats(projectPath);

    // Create version metadata
    // IMPORTANT: Don't pass versionName as it would overwrite the display version (v1, v2, v3)
    const version = await versionService.createVersion({
      versionId,
      projectId,
      userId,
      changeType: classification.versionBump,
      // versionName removed - preserve the display version that was set during deployment
      versionDescription: classification.versionDescription,
      breakingRisk: classification.breakingRisk,
      autoClassified: !fromRecommendationId,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      fromRecommendationId,
      commitSha: stats.commitSha,
      stats: {
        filesChanged: stats.filesChanged,
        linesAdded: stats.linesAdded,
        linesRemoved: stats.linesRemoved,
        buildDuration
      }
    });

    // DEPRECATED: No longer needed with consolidated table
    // await linkVersionMetadata(versionId, version.version_id);

    // Update project config with version name now that we have it
    try {
      // Check if we already have a display version set
      const currentConfig = await getProjectConfig(projectId);
      if (currentConfig?.versionName?.startsWith('v') && /^v\d+$/.test(currentConfig.versionName)) {
        // We have a display version (v1, v2, etc), keep it as primary
        // The semantic version is stored in the version record itself
        console.log(`[Stream Worker] Keeping display version "${currentConfig.versionName}" for project, semantic version "${version.version_name}" stored in version record`);
      } else {
        // No display version yet, use the semantic version
        await updateProjectConfig(projectId, {
          versionName: version.version_name
        });
        console.log(`[Stream Worker] Updated project ${projectId} current_version_name to "${version.version_name}"`);
      }
    } catch (error) {
      console.error('[Stream Worker] Failed to update project current_version_name:', error);
      // Don't fail the version creation if this update fails, but log it
    }

    // Version created (internal only)

    console.log(`[Stream Worker] Version ${version.git_tag} created for build ${buildId}`);

    // Display version summary
    console.log('\n🏷️  Version Created:');
    console.log('  📌 Version: ' + `${version.major_version}.${version.minor_version}.${version.patch_version}`);
    console.log('  🏷️  Tag: ' + version.git_tag);
    console.log('  📝 Type: ' + version.change_type);
    console.log('  📛 Name: ' + version.version_name);
    if (version.breaking_risk && version.breaking_risk !== 'none') {
      console.log('  ⚠️  Risk: ' + version.breaking_risk);
    }

    return {
      success: true,
      versionId: version.version_id,
      semver: `${version.major_version || 1}.${version.minor_version || 0}.${version.patch_version || 0}`,
      gitTag: version.git_tag
    };

  } catch (error) {
    console.error('[Stream Worker] Version classification failed:', error);

    // Version classification failed (internal only)

    // Don't throw - versioning is not critical to the build
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
*/

// Handler for rollback background sync jobs
async function handleRollbackSync(job: Job<StreamJobData>) {
  const { userId, projectId, rollbackVersionId, targetVersionId, preRollbackState } = job.data;

  console.log(`[Stream Worker] Processing rollback sync for ${userId}/${projectId}`);

  // Set up lock lease renewal for long rollbacks
  const lockKey = `rollback-lock:${projectId}`;
  const MAX_ROLLBACK_DURATION = parseInt(process.env.MAX_ROLLBACK_DURATION_SECONDS || '300');
  const lockTTL = MAX_ROLLBACK_DURATION + 60; // Add 1-minute buffer

  // Create single Redis connection for lock management (reused for renewals)
  const Redis = (await import('ioredis')).default;
  const lockRedis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
  });

  // Lease renewal interval - renew at half TTL (reuses connection)
  const renewalInterval = setInterval(async () => {
    try {
      await lockRedis.expire(lockKey, lockTTL);
      console.log(`[Stream Worker] Renewed rollback lock for ${projectId} (TTL: ${lockTTL}s)`);
    } catch (error) {
      console.error(`[Stream Worker] Failed to renew rollback lock for ${projectId}:`, error);
    }
  }, (lockTTL * 1000) / 2); // Renew at half TTL

  try {
    // Progress tracking for UI
    await job.updateProgress(10); // Started

    // Execute working directory sync with progress updates
    const projectDir = ProjectPaths.getProjectPath(userId, projectId);
    const workingDirService = new WorkingDirectoryService(projectDir);

    await job.updateProgress(20);
    console.log(`[Stream Worker] Starting working directory sync for rollback ${rollbackVersionId}`);

    const syncResult = await workingDirService.extractArtifactToWorkingDirectory(
      userId, projectId, rollbackVersionId!, 'rollback'
    );

    await job.updateProgress(90); // Almost complete

    if (!syncResult.success) {
      throw new Error(`Working directory sync failed: ${syncResult.error}`);
    }

    // Update project status to completed
    await updateProjectConfig(projectId, { status: 'deployed' });

    // Process queued builds on success
    await processQueuedBuilds(projectId);

    await job.updateProgress(100); // Complete

    console.log(`[Stream Worker] Rollback sync completed successfully for ${projectId}`);

    return {
      success: true,
      rollbackVersionId,
      targetVersionId,
      message: 'Rollback sync completed successfully',
      workingDirectory: {
        synced: true,
        extractedFiles: syncResult.extractedFiles || 0,
        gitCommit: syncResult.gitCommit
      }
    };

  } catch (error) {
    console.error(`[Stream Worker] Rollback sync failed for ${projectId}:`, error);

    // Complete failure recovery - revert to pre-rollback state
    if (preRollbackState) {
      try {
        // Expert feedback: Add fallback for preview URL if preRollbackState.previewUrl is null
        const fallbackPreviewUrl = preRollbackState.previewUrl ||
                                   targetVersionId ||
                                   '/error'; // Placeholder for UI

        await updateProjectConfig(projectId, {
          status: 'rollbackFailed',
          previewUrl: fallbackPreviewUrl // Revert with fallback
        });

        // No rollback version record cleanup needed - rollback failures don't create version records
        if (rollbackVersionId) {
          console.log(`[Stream Worker] Rollback ${rollbackVersionId} failed - but no version record cleanup needed (principle: only successful deployments get records)`);
        }

        // Purge queued builds to avoid inconsistent state
        await purgeQueuedBuildsForProject(projectId);

        console.log(`[Stream Worker] Rollback state reverted for ${projectId}`);
      } catch (revertError) {
        console.error(`[Stream Worker] Failed to revert rollback state for ${projectId}:`, revertError);
      }
    }

    throw error;
  } finally {
    // Clear the renewal interval
    clearInterval(renewalInterval);

    // Explicitly release the lock (don't wait for TTL expiry)
    try {
      await lockRedis.del(lockKey);
      console.log(`[Stream Worker] Released rollback lock for ${projectId}`);
    } catch (error) {
      console.error(`[Stream Worker] Failed to release rollback lock for ${projectId}:`, error);
    }

    // Disconnect the Redis client
    try {
      await lockRedis.disconnect();
    } catch (error) {
      console.error(`[Stream Worker] Failed to disconnect lock Redis client:`, error);
    }

    console.log(`[Stream Worker] Cleared lock renewal interval for ${projectId}`);
  }
}

// Handler for builds queued during rollback
async function handleQueuedBuildDuringRollback(job: Job<StreamJobData>) {
  const { projectId } = job.data;

  console.log(`[Stream Worker] Checking rollback status for queued build ${job.id}`);

  try {
    const projectConfig = await getProjectConfig(projectId);

    if (projectConfig?.status === 'rollingBack') {
      // Rollback still in progress - delay and retry
      console.log(`[Stream Worker] Rollback still in progress for ${projectId} - delaying build`);
      throw new Error('RETRY_LATER: Rollback still in progress');
    }

    if (projectConfig?.status === 'rollbackFailed') {
      // Rollback failed - cancel this build
      console.log(`[Stream Worker] Rollback failed for ${projectId} - canceling queued build`);
      throw new Error('BUILD_CANCELED: Rollback failed');
    }

    // Rollback completed - remove delay flags and process normally
    console.log(`[Stream Worker] Rollback completed for ${projectId} - processing queued build`);
    job.data.delayUntilRollbackComplete = false;
    job.data.queuedDuringRollback = false;
    await job.updateData(job.data); // Persist changes in case of crash/restart (BullMQ 5.x API)

    // Process the build normally by continuing with regular build logic
    // Since we're in the same worker, we can just continue processing
    return null; // Signal to continue with regular build processing

  } catch (error) {
    if (error instanceof Error && error.message.startsWith('RETRY_LATER:')) {
      // Delay and retry - BullMQ will handle this automatically
      throw error;
    }

    if (error instanceof Error && error.message.startsWith('BUILD_CANCELED:')) {
      // Mark job as failed and don't retry
      console.log(`[Stream Worker] Build canceled due to rollback failure: ${job.id}`);
      return {
        success: false,
        canceled: true,
        message: 'Build canceled due to rollback failure'
      };
    }

    throw error;
  }
}

// Helper function to process queued builds on rollback success
async function processQueuedBuilds(projectId: string) {
  try {
    const { buildQueue } = await import('../queue/buildQueue');
    const queuedJobs = await buildQueue.getJobs(['delayed']);
    const relevantJobs = queuedJobs.filter((job: any) =>
      job.data.queuedDuringRollback && job.data.projectId === projectId
    );

    for (const job of relevantJobs) {
      // Expert feedback: Clear delay flags after promoting to prevent re-queuing
      job.data.delayUntilRollbackComplete = false;
      job.data.queuedDuringRollback = false;

      await job.updateData(job.data); // Update job data (BullMQ 5.x API)
      await job.promote(); // Remove delay, process immediately
      console.log(`[Stream Worker] Promoted queued build job ${job.id} for ${projectId}`);
    }

    console.log(`[Stream Worker] Promoted ${relevantJobs.length} queued builds for ${projectId}`);
  } catch (error) {
    console.error(`[Stream Worker] Failed to process queued builds for ${projectId}:`, error);
    // Don't fail rollback for this - just log the error
  }
}

// Helper function to purge builds on rollback failure
async function purgeQueuedBuildsForProject(projectId: string) {
  try {
    const { buildQueue } = await import('../queue/buildQueue');
    const queuedJobs = await buildQueue.getJobs(['delayed']);
    const relevantJobs = queuedJobs.filter((job: any) =>
      job.data.queuedDuringRollback && job.data.projectId === projectId
    );

    for (const job of relevantJobs) {
      await job.remove(); // Remove from queue entirely
      console.log(`[Stream Worker] Removed queued build job ${job.id} for failed rollback ${projectId}`);
    }

    console.log(`[Stream Worker] Purged ${relevantJobs.length} queued builds for failed rollback ${projectId}`);
  } catch (error) {
    console.error(`[Stream Worker] Failed to purge queued builds for ${projectId}:`, error);
    // Don't fail rollback for this - just log the error
  }
}
