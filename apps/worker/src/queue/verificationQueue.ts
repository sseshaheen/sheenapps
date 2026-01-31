/**
 * Verification Queue - Phase 5 (Expert Priority #2)
 *
 * Separate queue for expensive verification operations (builds, accessibility audits, etc.)
 * with strict concurrency limits to prevent resource exhaustion.
 *
 * Expert Insight: "Don't mix verification with main queue - Tuesday build failures
 * taught us that expensive builds need isolated resource management."
 */

import { Queue, QueueEvents } from 'bullmq';
import { unifiedLogger } from '../services/unifiedLogger';

export interface VerificationJobData {
  projectId: string;
  userId: string;
  migrationId: string;
  gates: VerificationGate[];
  skipOptional?: boolean; // Skip advisory gates (a11y, SEO) for faster feedback
}

export type VerificationGate =
  | 'typescript'   // Fast, blocking (10-30s)
  | 'build'        // Expensive, blocking (60-180s)
  | 'accessibility' // Fast, advisory (15-30s)
  | 'seo';         // Fast, advisory (5-10s)

export interface VerificationResult {
  gate: VerificationGate;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  errors?: string[] | undefined;
  warnings?: string[] | undefined;
  metadata?: Record<string, any> | undefined;
}

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// Create verification queue only if not in test mode or if Redis is expected
const isTestMode = process.env.NODE_ENV === 'test';
const shouldCreateQueues = !isTestMode || process.env.USE_REDIS_IN_TEST === 'true';

/**
 * Verification Queue Configuration
 *
 * EXPERT FIX: Separate queue with constrained concurrency
 * - Higher priority than main migrations (priority 3 < 5, lower number = higher priority in BullMQ)
 * - Longer timeouts for build operations (10 minutes)
 * - Fewer retries (builds don't benefit from retries)
 */
export const verificationQueue = shouldCreateQueues
  ? new Queue<VerificationJobData>('verification', {
      connection,
      defaultJobOptions: {
        attempts: 1, // Don't retry failed verifications (waste of resources)
        removeOnComplete: 100, // Keep fewer completed jobs
        removeOnFail: 500, // Keep more failed jobs for debugging
      },
    })
  : null;

export const verificationQueueEvents: QueueEvents | null = shouldCreateQueues
  ? new QueueEvents('verification', { connection })
  : null;

/**
 * Enqueue verification with idempotency
 * @param data - Verification job data
 * @returns Job ID
 */
export async function enqueueVerification(data: VerificationJobData): Promise<string> {
  if (!verificationQueue) {
    throw new Error(
      'Verification queue is not available. This may happen in test mode without USE_REDIS_IN_TEST=true, or if Redis connection failed.'
    );
  }

  const job = await verificationQueue.add('verification.run', data, {
    // Idempotent per migration - prevents duplicate verification of same migration
    // while allowing different migrations for same project to verify independently
    jobId: `verification:${data.projectId}:${data.migrationId}`,
    priority: 3, // Higher priority than migrations (3 < 5 in BullMQ = runs first)
  });

  unifiedLogger.system('startup', 'info', 'Verification job enqueued', {
    projectId: data.projectId,
    migrationId: data.migrationId,
    gates: data.gates,
    jobId: job.id,
  });

  return job.id!;
}

/**
 * Gracefully close verification queue and events
 * Call this during server shutdown to prevent "why won't Node exit?" issues
 */
export async function closeVerificationQueue(): Promise<void> {
  await Promise.allSettled([
    verificationQueueEvents?.close(),
    verificationQueue?.close(),
  ]);
}
