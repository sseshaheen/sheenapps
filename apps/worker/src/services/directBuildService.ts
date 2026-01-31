/**
 * Direct Build Service - Bypasses Redis/BullMQ for local testing
 * This service executes builds synchronously without queuing
 */

import { BuildJobData, BuildJobResult } from '../types/build';
import { processBuildJob } from '../workers/buildWorker';
import { Job } from 'bullmq';
import { ulid } from 'ulid';

/**
 * Mock Job object that mimics BullMQ Job interface
 */
class MockJob implements Partial<Job> {
  id: string;
  data: BuildJobData;
  attemptsMade: number = 0;

  constructor(data: BuildJobData) {
    this.id = `direct-${Date.now()}`;
    this.data = data;
  }

  async updateProgress(progress: number | object): Promise<void> {
    console.log('Job progress:', progress);
  }

  async log(row: string): Promise<number> {
    console.log('Job log:', row);
    return 0;
  }
}

/**
 * Execute a build job directly without Redis/Queue
 */
export async function executeBuildDirect(data: BuildJobData): Promise<BuildJobResult> {
  console.log('🎯 Executing build directly (no queue)...');
  
  // Generate version ID if not provided
  if (!data.versionId) {
    data.versionId = ulid();
  }
  
  // Create a mock job that satisfies the worker's interface
  const mockJob = new MockJob(data) as Job<BuildJobData, BuildJobResult>;
  
  try {
    // Call the build worker function directly
    const result = await processBuildJob(mockJob);
    
    console.log('✅ Direct build completed:', {
      versionId: result.versionId,
      previewUrl: result.previewUrl,
      success: result.success
    });
    
    return result;
  } catch (error) {
    console.error('❌ Direct build failed:', error);
    throw error;
  }
}

// Re-export from config to maintain backward compatibility
export { isDirectModeEnabled } from '../config/directMode';