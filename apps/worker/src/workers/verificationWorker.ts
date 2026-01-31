/**
 * Verification Worker - Phase 5 (Expert Priority #2)
 *
 * Processes verification jobs from the verification queue with strict concurrency limits.
 * Runs sequential fail-fast quality gates (TypeScript → Build → A11y → SEO).
 *
 * Expert Insight: "Constrained concurrency (1-2 max) prevents resource exhaustion.
 * Tuesday build failures taught us that expensive builds need isolated management."
 */

import { Worker, Job } from 'bullmq';
import { VerificationJobData } from '../queue/verificationQueue';
import { MigrationQualityGatesService } from '../services/migrationQualityGatesService';
import { unifiedLogger } from '../services/unifiedLogger';
import { getPool } from '../services/database';
import { SecurePathValidator } from '../utils/securePathValidator';

const qualityGatesService = new MigrationQualityGatesService();
const pool = getPool();

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

/**
 * Process verification job
 */
async function processVerificationJob(job: Job<VerificationJobData>): Promise<any> {
  const { projectId, userId, migrationId, gates, skipOptional } = job.data;

  unifiedLogger.system('startup', 'info', 'Verification job processing started', {
    projectId,
    migrationId,
    jobId: job.id,
    gates,
    skipOptional,
  });

  try {
    // Get project path from database
    const projectPath = await getProjectPath(projectId, userId);

    // Run quality gates sequentially with fail-fast
    const startTime = Date.now();
    const { success, results, failedGate } = await qualityGatesService.runGates(
      projectPath,
      gates,
      skipOptional
    );
    const totalDuration = Date.now() - startTime;

    // Store results in database
    await storeVerificationResults(migrationId, projectId, {
      success,
      results,
      failedGate: failedGate ? (failedGate as string) : undefined,
      totalDuration,
    });

    unifiedLogger.system('startup', 'info', 'Verification job completed', {
      projectId,
      migrationId,
      success,
      failedGate,
      totalDuration,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
    });

    return {
      status: success ? 'passed' : 'failed',
      projectId,
      migrationId,
      results,
      failedGate,
      totalDuration,
    };
  } catch (error) {
    unifiedLogger.system('error', 'error', 'Verification job failed', {
      projectId,
      migrationId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    // Store error in database
    await storeVerificationError(migrationId, projectId, error as Error);

    throw error; // Let BullMQ handle retry logic (though we disabled retries in queue config)
  }
}

/**
 * Get project path from database
 */
async function getProjectPath(projectId: string, userId: string): Promise<string> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT name FROM projects WHERE id = $1 AND owner_id = $2`,
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const projectName = result.rows[0].name;
    const projectPath = SecurePathValidator.getProjectRoot(userId, projectId);

    unifiedLogger.system('startup', 'info', 'Project path resolved', {
      projectId,
      projectName,
      projectPath,
    });

    return projectPath;
  } finally {
    client.release();
  }
}

/**
 * Store verification results in database
 */
async function storeVerificationResults(
  migrationId: string,
  projectId: string,
  results: {
    success: boolean;
    results: any[];
    failedGate?: string | undefined;
    totalDuration: number;
  }
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO migration_verification_results (
        migration_id,
        project_id,
        success,
        failed_gate,
        total_duration_ms,
        gate_results,
        verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (migration_id, project_id) DO UPDATE SET
        success = EXCLUDED.success,
        failed_gate = EXCLUDED.failed_gate,
        total_duration_ms = EXCLUDED.total_duration_ms,
        gate_results = EXCLUDED.gate_results,
        verified_at = NOW()`,
      [
        migrationId,
        projectId,
        results.success,
        results.failedGate || null,
        results.totalDuration,
        JSON.stringify(results.results),
      ]
    );

    unifiedLogger.system('startup', 'info', 'Verification results stored', {
      migrationId,
      projectId,
    });
  } catch (error) {
    unifiedLogger.system('error', 'warn', 'Failed to store verification results', {
      migrationId,
      projectId,
      error: (error as Error).message,
    });
    // Don't throw - verification succeeded even if we couldn't store results
  } finally {
    client.release();
  }
}

/**
 * Store verification error in database
 */
async function storeVerificationError(
  migrationId: string,
  projectId: string,
  error: Error
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO migration_verification_results (
        migration_id,
        project_id,
        success,
        error_message,
        verified_at
      ) VALUES ($1, $2, false, $3, NOW())
      ON CONFLICT (migration_id, project_id) DO UPDATE SET
        success = false,
        error_message = EXCLUDED.error_message,
        verified_at = NOW()`,
      [migrationId, projectId, error.message]
    );
  } catch (dbError) {
    unifiedLogger.system('error', 'warn', 'Failed to store verification error', {
      migrationId,
      projectId,
      error: (dbError as Error).message,
    });
  } finally {
    client.release();
  }
}

/**
 * Verification Worker Configuration
 *
 * EXPERT FIX: Strict concurrency limit (1) prevents resource exhaustion
 * - Builds are expensive (CPU + memory intensive)
 * - Limiting to 1 ensures predictable resource usage
 * - Can be increased to 2 if server resources allow
 */
export const verificationWorker = new Worker<VerificationJobData>(
  'verification',
  processVerificationJob,
  {
    connection,
    concurrency: 1, // EXPERT RECOMMENDATION: Max 1-2 workers to prevent resource exhaustion
    limiter: {
      max: 5,
      duration: 60000, // Max 5 verification jobs per minute
    },
  }
);

// Event handlers
verificationWorker.on('completed', (job) => {
  const duration = Date.now() - (job.processedOn || Date.now());
  unifiedLogger.system('startup', 'info', 'Verification job completed', {
    projectId: job.data.projectId,
    migrationId: job.data.migrationId,
    jobId: job.id,
    duration,
  });
});

verificationWorker.on('failed', (job, error) => {
  unifiedLogger.system('error', 'error', 'Verification job failed permanently', {
    projectId: job?.data.projectId,
    migrationId: job?.data.migrationId,
    jobId: job?.id,
    error: error.message,
  });
});

verificationWorker.on('stalled', (jobId) => {
  unifiedLogger.system('error', 'warn', 'Verification job stalled', { jobId });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  unifiedLogger.system('startup', 'info', 'SIGTERM received, closing verification worker');
  await verificationWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  unifiedLogger.system('startup', 'info', 'SIGINT received, closing verification worker');
  await verificationWorker.close();
  process.exit(0);
});
