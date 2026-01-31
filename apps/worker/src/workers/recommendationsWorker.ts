/**
 * Recommendations Worker
 *
 * Processes recommendation generation jobs asynchronously.
 * Runs in parallel with main build to provide faster recommendations.
 *
 * Key Features:
 * - Lower priority than main build (won't compete for resources)
 * - Fire-and-forget from build worker
 * - Emits SSE events on success/failure
 * - Conservative retry policy (recs are nice-to-have)
 *
 * Job Flow:
 * 1. Build worker queues recommendation job (fire-and-forget)
 * 2. This worker picks up the job with delay
 * 3. Generates recommendations using Claude
 * 4. Saves to database
 * 5. Emits SSE event (recommendations_ready or recommendations_failed)
 */

import { Job, Worker, Processor } from 'bullmq';
import IORedis from 'ioredis';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RecommendationsJobData } from '../queue/modularQueues';
import { CleanEventEmitter } from '../services/eventService';
import { getDatabase } from '../services/database';
import { saveProjectRecommendations } from '../services/databaseWrapper';
import { buildRecommendationsPrompt, validateRecommendationsSchema } from '../services/recommendationsPrompt';
import { ClaudeSession } from '../stream';
import { CLAUDE_TIMEOUTS } from '../config/timeouts.env';

// Redis connection (same pattern as other workers)
const redisUrl = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

/**
 * Query project's infrastructure mode to determine if Easy Mode SDK guidance applies.
 */
async function getProjectInfraMode(projectId: string): Promise<'easy' | 'pro' | null> {
  const db = getDatabase();
  const result = await db.query('SELECT infra_mode FROM projects WHERE id = $1', [projectId]);
  return result.rows[0]?.infra_mode ?? null;
}

/**
 * Result type for recommendations jobs.
 */
interface RecommendationsJobResult {
  success: boolean;
  recommendationCount: number;
  buildId: string;
  versionId: string;
  error?: string;
  durationMs?: number;
}

/**
 * Extract the first balanced JSON object from text.
 * String-aware: ignores braces inside JSON strings.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Clean Claude JSON output artifacts.
 * Sometimes Claude CLI adds extra characters at the end of JSON files.
 */
function cleanClaudeJsonOutput(content: string): string {
  // Remove common artifacts
  let cleaned = content.trim();

  // Remove trailing non-JSON characters
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Recommendations processor function.
 */
const processor: Processor<RecommendationsJobData, RecommendationsJobResult> = async (job: Job<RecommendationsJobData>) => {
  const {
    projectId,
    userId,
    buildId,
    versionId,
    buildSessionId,
    projectPath,
    framework,
    prompt,
    isInitialBuild,
  } = job.data;

  const startTime = Date.now();
  const cleanEmitter = new CleanEventEmitter(buildId, userId);

  console.log(`[Recommendations Worker] Processing job ${job.id} for build ${buildId}`);
  console.log(`[Recommendations Worker] Project: ${projectId}, Version: ${versionId}`);

  try {
    // Query infrastructure mode to determine if SDK guidance applies
    const infraMode = await getProjectInfraMode(projectId);
    const isEasyMode = infraMode === 'easy';

    // Build the recommendations prompt with SDK-awareness for Easy Mode projects
    const recommendationsPrompt = buildRecommendationsPrompt({
      originalPrompt: prompt,
      projectType: isInitialBuild ? 'create' : 'update',
      framework: framework || 'react',
      isEasyMode,
    });

    // Create Claude session for recommendations
    const session = new ClaudeSession();

    // Run Claude to generate recommendations
    console.log('[Recommendations Worker] Running Claude session...');
    const result = await session.run(
      recommendationsPrompt,
      projectPath,
      buildId,
      CLAUDE_TIMEOUTS.recommendations || 60000, // 60s default for recommendations
      userId,
      projectId
    );

    if (!result.success) {
      throw new Error(result.error || 'Claude session failed');
    }

    // Read recommendations from file
    const recommendationsPath = path.join(projectPath, '.sheenapps/recommendations.json');
    let recommendationsContent: string;

    try {
      recommendationsContent = await fs.readFile(recommendationsPath, 'utf-8');
    } catch (fileError: any) {
      // Try to extract from Claude output
      if (fileError.code === 'ENOENT') {
        console.log('[Recommendations Worker] File not found, extracting from output...');
        const output = result.result || '';

        // Use balanced-bracket extractor instead of greedy regex
        // This prevents grabbing too much if Claude outputs multiple {} blocks
        const extracted = extractFirstJsonObject(output);
        if (extracted && extracted.includes('"recommendations"')) {
          recommendationsContent = extracted;
        } else {
          throw new Error('Could not find recommendations JSON in Claude output');
        }
      } else {
        throw fileError;
      }
    }

    // Clean and parse recommendations
    recommendationsContent = cleanClaudeJsonOutput(recommendationsContent);
    const recommendations = JSON.parse(recommendationsContent);

    // Validate schema
    if (!validateRecommendationsSchema(recommendations)) {
      throw new Error('Recommendations schema validation failed');
    }

    // Save to database
    await saveProjectRecommendations({
      projectId,
      versionId,
      buildId,
      userId,
      recommendations: recommendations.recommendations,
    });

    const durationMs = Date.now() - startTime;
    const recommendationCount = recommendations.recommendations?.length || 0;

    console.log(`[Recommendations Worker] Saved ${recommendationCount} recommendations in ${durationMs}ms`);

    // Emit success SSE event
    await cleanEmitter.recommendationsReady({
      projectId,
      versionId,
      ...(buildSessionId !== undefined ? { buildSessionId } : {}),
      recommendationCount,
      recommendations: recommendations.recommendations?.slice(0, 10).map((r: any) => ({
        id: r.id || String(Math.random()),
        title: r.title || r.recommendation || 'Untitled',
        type: r.type || 'improvement',
        priority: r.priority || 'medium',
      })),
    });

    return {
      success: true,
      recommendationCount,
      buildId,
      versionId,
      durationMs,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    console.error(`[Recommendations Worker] Failed after ${durationMs}ms:`, errorMessage);

    // Emit failure SSE event
    await cleanEmitter.recommendationsFailed({
      projectId,
      versionId,
      ...(buildSessionId !== undefined ? { buildSessionId } : {}),
      error: errorMessage,
      recoverable: job.attemptsMade < (job.opts.attempts || 2),
    });

    // Throw to let BullMQ handle retry
    throw error;
  }
};

// Create the recommendations worker
export const recommendationsWorker = new Worker<RecommendationsJobData, RecommendationsJobResult>(
  'recommendations',
  processor,
  {
    connection,
    concurrency: Number(process.env.RECOMMENDATIONS_WORKER_CONCURRENCY || 2),
  }
);

// Event handlers
recommendationsWorker.on('ready', () => console.log('[Recommendations Worker] Ready'));
recommendationsWorker.on('active', (job) => console.log('[Recommendations Worker] Active', { id: job.id }));
recommendationsWorker.on('completed', (job, result) => {
  console.log('[Recommendations Worker] Completed', {
    id: job?.id,
    count: result?.recommendationCount,
    durationMs: result?.durationMs,
  });
});
recommendationsWorker.on('failed', (job, err) => {
  console.error('[Recommendations Worker] Failed', {
    id: job?.id,
    attempt: job?.attemptsMade,
    error: err?.message,
  });
});
recommendationsWorker.on('error', (err) => console.error('[Recommendations Worker] Error', err));

// Crash guards
process.on('unhandledRejection', (e) => console.error('[Recommendations Worker] Unhandled rejection', e));
process.on('uncaughtException', (e) => {
  console.error('[Recommendations Worker] Uncaught exception', e);
});

/**
 * Start the recommendations worker.
 * Called by the main worker process.
 */
export async function startRecommendationsWorker(): Promise<void> {
  console.log('[Recommendations Worker] Starting...');
  // Worker is already running from instantiation
  // This function exists for consistency with other workers
}

/**
 * Stop the recommendations worker.
 * Gracefully closes connections.
 */
export async function stopRecommendationsWorker(): Promise<void> {
  console.log('[Recommendations Worker] Stopping...');
  await recommendationsWorker.close();
  await connection.quit();
  console.log('[Recommendations Worker] Stopped');
}
