/**
 * Unified Build Initiation Service
 * 
 * Ensures consistent lifecycle management for all build initiation paths:
 * - /v1/update-project
 * - /v1/chat-plan/convert-to-build
 * - /v1/create-preview
 * - /v1/build-preview
 * 
 * Handles all necessary state updates and queue operations in a single, consistent flow.
 */

import { ulid } from 'ulid';
import { updateProjectConfig } from './projectConfigService';
import { streamQueue } from '../queue/streamQueue';
import { buildQueue } from '../queue/buildQueue';
import { pool } from './databaseWrapper';
import type { Job } from 'bullmq';

export interface BuildInitiationOptions {
  userId: string;
  projectId: string;
  prompt: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  framework?: string | undefined;
  versionId?: string | undefined;
  buildId?: string | undefined;
  isInitialBuild?: boolean | undefined;
  baseVersionId?: string | undefined;
  previousSessionId?: string | undefined;
  serverGenerated?: boolean | undefined;
  metadata?: {
    source: 'update-project' | 'convert-plan' | 'create-preview' | 'build-preview' | 'chat-worker';
    convertedFromPlan?: boolean | undefined;
    planSessionId?: string | undefined;
    operationId?: string | undefined;  // CRITICAL: For idempotency
    chatMessageId?: string | undefined;
    assistantMessageId?: string | undefined;
    [key: string]: any;
  } | undefined;
}

export interface BuildInitiationResult {
  buildId: string;
  versionId: string;
  jobId: string;
  status: 'queued' | 'queue_failed';
  projectPath: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  error?: string | undefined;
}

/**
 * Initiates a build with consistent lifecycle management
 * This is the single entry point for all build initiations
 */
export async function initiateBuild(options: BuildInitiationOptions): Promise<BuildInitiationResult> {
  const {
    userId,
    projectId,
    prompt,
    framework,
    isInitialBuild = false,
    baseVersionId,
    previousSessionId,
    serverGenerated = false,
    metadata = { source: 'update-project' }
  } = options;

  // Generate IDs if not provided
  const buildId = options.buildId || ulid();
  const versionId = options.versionId || ulid();

  // Determine architecture mode
  const archMode = process.env.ARCH_MODE || 'monolith';

  // Determine project path
  const baseProjectPath = process.platform === 'darwin'
    ? '/Users/sh/projects'
    : '/home/worker/projects';
  const projectPath = `${baseProjectPath}/${userId}/${projectId}`;

  console.log('[BuildInitiation] 🎯 Starting build initiation:', {
    buildId,
    versionId,
    userId,
    projectId,
    archMode,
    source: metadata.source,
    isInitialBuild,
    serverGenerated
  });
  
  // 🚨 EXPERT FIX (Round 9): Verify project access (owner OR collaborator), not just ownership
  // This aligns with assertProjectAccess pattern used in routes
  if (pool) {
    const projectCheck = await pool.query(
      `SELECT p.id, p.build_status, p.owner_id,
              EXISTS (
                SELECT 1 FROM project_collaborators pc
                WHERE pc.project_id = p.id AND pc.user_id = $2
              ) as is_collaborator
       FROM projects p
       WHERE p.id = $1`,
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      console.error(`[BuildInitiation] ❌ Project ${projectId} NOT FOUND in database!`);
      throw new Error(`Project ${projectId} not found`);
    }

    const project = projectCheck.rows[0];
    const hasAccess = project.owner_id === userId || project.is_collaborator;

    if (!hasAccess) {
      console.error(`[BuildInitiation] ❌ User ${userId} does not have access to project ${projectId}`);
      throw new Error(`Access denied: you do not have access to this project`);
    }

    console.log(`[BuildInitiation] ✓ Project verified, access confirmed (owner: ${project.owner_id === userId}, collaborator: ${project.is_collaborator}), current status: ${project.build_status}`);
  }

  // 🚨 EXPERT FIX (Round 9): Declare outside try so catch block can access it
  let resolvedBuildId = buildId; // Start with candidate (ulid or provided)

  try {
    // 🚨 CRITICAL FIX (Expert Round 8): Resolve buildId BEFORE mutating project state
    // If operationId exists, we must determine the deterministic buildId FIRST
    // Otherwise duplicate calls will update project with wrong buildId before discovering it's a duplicate

    let isExistingOperation = false;

    // STEP 0: Idempotency resolution (if operationId provided)
    if (metadata.operationId && pool) {
      try {
        console.log('[BuildInitiation] 🔍 STEP 0: Resolving deterministic buildId for operationId:', metadata.operationId);

        // 🚨 EXPERT FIX (Round 10): Store version_id upfront so duplicate ops return complete data
        // Try to insert new operation with buildId AND versionId
        const opResult = await pool.query(
          `INSERT INTO project_build_operations (project_id, operation_id, build_id, version_id, status)
           VALUES ($1, $2, $3, $4, 'initiated')
           ON CONFLICT (project_id, operation_id) DO NOTHING
           RETURNING build_id, version_id`,
          [projectId, metadata.operationId, buildId, versionId]
        );

        if (opResult.rows.length === 0) {
          // Conflict - operation already exists
          // 🚨 EXPERT FIX (Round 10): Fetch existing buildId, versionId, AND jobId (if set)
          const existingResult = await pool.query(
            `SELECT build_id, version_id, job_id FROM project_build_operations
             WHERE project_id = $1 AND operation_id = $2`,
            [projectId, metadata.operationId]
          );

          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            resolvedBuildId = existing.build_id;
            isExistingOperation = true;
            console.log('[BuildInitiation] ✅ STEP 0 Complete: Operation already exists, returning existing data:', {
              operationId: metadata.operationId,
              existingBuildId: resolvedBuildId,
              existingVersionId: existing.version_id,
              existingJobId: existing.job_id || '(not yet queued)'
            });

            // 🚨 EXPERT FIX (Round 10): Return complete data instead of empty strings
            // This prevents UX/telemetry confusion and allows frontend to "resume" consistently
            return {
              buildId: resolvedBuildId,
              versionId: existing.version_id || versionId, // Use stored or fall back to generated
              jobId: existing.job_id || '', // May be empty if job not yet queued
              status: 'queued', // Existing job is already queued
              projectPath
            };
          }
        } else {
          console.log('[BuildInitiation] ✅ STEP 0 Complete: New operation tracked:', {
            operationId: metadata.operationId,
            buildId: resolvedBuildId,
            versionId
          });
        }
      } catch (error) {
        // CRITICAL: If operationId is present, tracking is NOT optional
        // Failing to track means we lose determinism (same operationId → different buildIds)
        console.error('[BuildInitiation] Failed to track operation:', error);

        // If we have an operationId, FAIL the call (don't proceed with random buildId)
        throw new Error(
          `Build operation tracking failed for operationId ${metadata.operationId}. ` +
          `Cannot proceed without deterministic buildId mapping. ` +
          `Error: ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
    }

    // At this point, resolvedBuildId is deterministic and won't change

    // STEP 1: Update project status to 'queued' (STRICT - fail build if this fails)
    // This ensures the UI immediately shows build progress
    // 🚨 CRITICAL: We now use resolvedBuildId (not the random candidate buildId)
    console.log('[BuildInitiation] 🔄 STEP 1: Updating project status to queued...');
    await updateProjectStatus(projectId, {
      status: 'queued',
      buildId: resolvedBuildId,  // ✅ Use the deterministic buildId
      framework: framework as 'react' | 'nextjs' | 'vue' | 'svelte' | undefined,
      lastBuildStarted: new Date(),
      lastBuildCompleted: null // Clear to avoid timing constraint
    }, true); // strict=true - abort if we can't mark as queued
    console.log('[BuildInitiation] ✅ STEP 1 Complete: Status is now queued with buildId:', resolvedBuildId);

    // STEP 2: Track build initiation in database if converting from plan
    if (metadata.convertedFromPlan && metadata.planSessionId) {
      await trackPlanConversion(metadata.planSessionId, resolvedBuildId, userId, projectId);
    }

    // STEP 3: Queue the build job
    let job: Job<any, any>;

    // CRITICAL: Use operationId for idempotency (if provided)
    // Otherwise fall back to resolvedBuildId (for backwards compat with calls that don't pass operationId)
    const opId = metadata.operationId || resolvedBuildId;

    // Common job options for duplicate prevention and resilience
    const jobOptions = {
      jobId: `build:${projectId}:${opId}`, // ✅ Deterministic from (projectId, operationId)
      removeOnComplete: 1000, // Keep last 1000 completed jobs for debugging
      removeOnFail: 2000, // Keep last 2000 failed jobs for debugging
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000 },
    };

    if (archMode === 'stream') {
      // Stream architecture mode
      job = await streamQueue.add('claude-build', {
        buildId: resolvedBuildId,
        userId,
        projectId,
        prompt,
        framework,
        projectPath,
        versionId,
        isInitialBuild,
        baseVersionId,
        previousSessionId,
        serverGenerated,
        metadata
      }, jobOptions);

      console.log('[BuildInitiation] Stream job queued:', job.id);
    } else if (archMode === 'modular') {
      // Modular architecture mode
      const { planQueue, requireQueue } = await import('../queue/modularQueues');

      job = await requireQueue(planQueue, 'plans').add('generate-plan', {
        userId,
        projectId,
        prompt,
        framework,
        versionId,
        isInitialBuild,
        baseVersionId,
        previousSessionId,
        metadata: {
          ...metadata,
          buildId: resolvedBuildId
        }
      }, jobOptions);

      console.log('[BuildInitiation] Modular job queued:', job.id);
    } else {
      // Monolith architecture mode
      job = await buildQueue.add('build', {
        userId,
        projectId,
        prompt,
        framework,
        versionId,
        isInitialBuild,
        baseVersionId,
        previousSessionId,
        type: 'build',
        metadata: {
          ...metadata,
          buildId: resolvedBuildId
        }
      }, jobOptions);

      console.log('[BuildInitiation] Monolith job queued:', job.id);
    }

    // 🚨 EXPERT FIX (Round 10): Update job_id in operations table after queueing
    // This allows duplicate operations to return the real BullMQ jobId
    if (metadata.operationId && pool) {
      try {
        await pool.query(
          `UPDATE project_build_operations
           SET job_id = $1, status = 'queued', updated_at = NOW()
           WHERE project_id = $2 AND operation_id = $3`,
          [job.id, projectId, metadata.operationId]
        );
        console.log('[BuildInitiation] ✅ Updated operation with jobId:', job.id);
      } catch (error) {
        // Non-critical - log but don't fail the build
        console.error('[BuildInitiation] Failed to update operation with jobId:', error);
      }
    }

    // NOTE: We intentionally keep status as 'queued' here.
    // The worker will set status to 'building' when it actually starts processing.
    // This avoids the semantic blur of showing 'building' while the job is still in queue.

    return {
      buildId: resolvedBuildId,
      versionId,
      jobId: job.id as string,
      status: 'queued',
      projectPath
    };

  } catch (error) {
    console.error('[BuildInitiation] Failed to initiate build:', error);

    // Try to update project status to reflect failure
    try {
      await updateProjectStatus(projectId, {
        status: 'failed',
        lastBuildCompleted: new Date()
      });
    } catch (updateError) {
      console.error('[BuildInitiation] Failed to update project status after error:', updateError);
    }

    return {
      buildId: resolvedBuildId,
      versionId,
      jobId: '',
      status: 'queue_failed',
      projectPath,
      error: error instanceof Error ? error.message : 'Failed to initiate build'
    };
  }
}

/**
 * Update project status in a consistent way
 * @param strict - If true, throws on failure (use for critical updates like STEP 1)
 */
async function updateProjectStatus(
  projectId: string,
  updates: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    status?: 'queued' | 'building' | 'deployed' | 'failed' | undefined;
    buildId?: string | undefined;
    framework?: 'react' | 'nextjs' | 'vue' | 'svelte' | undefined;
    lastBuildStarted?: Date | undefined;
    lastBuildCompleted?: Date | null | undefined;
  },
  strict = false
): Promise<void> {
  console.log(`[BuildInitiation] 🔄 Calling updateProjectConfig for project ${projectId} with:`, updates);
  try {
    // Cast needed due to exactOptionalPropertyTypes: inline type has `| undefined` on optional props
    await updateProjectConfig(projectId, updates as Parameters<typeof updateProjectConfig>[1]);
    console.log('[BuildInitiation] ✅ Project status updated successfully:', {
      projectId,
      ...updates
    });

    // Immediately verify the update
    if (pool && updates.status) {
      const verifyResult = await pool.query(
        'SELECT build_status FROM projects WHERE id = $1',
        [projectId]
      );
      if (verifyResult.rows.length > 0) {
        const actualStatus = verifyResult.rows[0].build_status;
        if (actualStatus === updates.status) {
          console.log(`[BuildInitiation] ✅ VERIFIED: Status is correctly set to '${actualStatus}'`);
        } else {
          const msg = `Status mismatch: expected '${updates.status}' but got '${actualStatus}'`;
          console.error(`[BuildInitiation] ❌ MISMATCH: ${msg}`);
          if (strict) {
            throw new Error(msg);
          }
        }
      } else {
        const msg = `Project ${projectId} not found during verification`;
        console.error(`[BuildInitiation] ❌ VERIFICATION FAILED: ${msg}`);
        if (strict) {
          throw new Error(msg);
        }
      }
    }
  } catch (error) {
    console.error('[BuildInitiation] ❌ Failed to update project status:', error);
    if (strict) {
      throw error;
    }
  }
}

/**
 * Track plan-to-build conversion in database
 */
async function trackPlanConversion(
  sessionId: string,
  buildId: string,
  userId: string,
  projectId: string
): Promise<void> {
  if (!pool) {
    console.warn('[BuildInitiation] Database not available for tracking plan conversion');
    return;
  }

  try {
    // Check if session exists
    const sessionResult = await pool.query(
      `SELECT id FROM project_chat_plan_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length > 0) {
      // Update existing session
      await pool.query(
        `UPDATE project_chat_plan_sessions
         SET status = 'converted', 
             converted_to_build_id = $1,
             last_active = CURRENT_TIMESTAMP
         WHERE session_id = $2`,
        [buildId, sessionId]
      );
      console.log('[BuildInitiation] Updated plan session as converted:', sessionId);
    } else {
      // Create new session record for tracking
      await pool.query(
        `INSERT INTO project_chat_plan_sessions 
         (user_id, project_id, session_id, status, converted_to_build_id, created_at, last_active)
         VALUES ($1, $2, $3, 'converted', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, projectId, sessionId, buildId]
      );
      console.log('[BuildInitiation] Created conversion tracking record:', sessionId);
    }
  } catch (error) {
    console.error('[BuildInitiation] Failed to track plan conversion:', error);
    // Non-critical, don't throw
  }
}

/**
 * Get build status from project
 */
export async function getBuildStatus(projectId: string): Promise<string | null> {
  if (!pool) {
    return null;
  }

  try {
    // Use correct column name (build_status) and primary key (id)
    const result = await pool.query(
      `SELECT build_status FROM projects WHERE id = $1`,
      [projectId]
    );

    return result.rows[0]?.build_status ?? null;
  } catch (error) {
    console.error('[BuildInitiation] Failed to get build status:', error);
    return null;
  }
}