import { Queue, Job } from 'bullmq';
import { ulid } from 'ulid';
import type { BuildJobData, BuildJobResult } from '../types/build';
import { isDirectModeEnabled } from '../config/directMode';

// Redis connection config for local instance
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Required for BullMQ
};

// Build queue with deduplication - only create if not in direct mode
export const buildQueue = !isDirectModeEnabled() 
  ? new Queue<BuildJobData, BuildJobResult>('builds', {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100, // Keep last 100 failed jobs for debugging
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    })
  : null as any; // Mock queue for direct mode

// Helper to generate deduplication key
export function getBuildDedupKey(userId: string, projectId: string): string {
  return `${userId}:${projectId}`;
}

// Add a build job with deduplication
export async function addBuildJob(
  data: BuildJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<Job<BuildJobData, BuildJobResult>> {
  // Check if direct mode is enabled
  if (isDirectModeEnabled()) {
    throw new Error('Cannot add job to queue in direct mode. Use executeBuildDirect instead.');
  }
  
  const dedupKey = getBuildDedupKey(data.userId, data.projectId);
  
  // Check if a job for this project is already in progress
  const existingJobs = await buildQueue.getJobs(['active', 'waiting', 'delayed']);
  const duplicateJob = existingJobs.find(
    (job: Job<BuildJobData, BuildJobResult>) => job.data.userId === data.userId && job.data.projectId === data.projectId
  );
  
  if (duplicateJob) {
    console.log(`Build job already exists for ${dedupKey}, returning existing job`);
    return duplicateJob;
  }
  
  // Generate version ID if not provided
  if (!data.versionId) {
    data.versionId = ulid();
  }
  
  return buildQueue.add('build', data, {
    ...options,
    jobId: `build-${data.versionId}`,
  });
}

// Export queue events for monitoring
export const buildQueueEvents = buildQueue;