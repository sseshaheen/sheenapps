import type { BuildJobData } from '../types/build';

/**
 * Single entry point for enqueuing builds.
 * Uses the unified build initiation service for consistent lifecycle management.
 * 
 * @deprecated Use initiateBuild from buildInitiationService directly for new code
 */
export async function enqueueBuild(jobData: BuildJobData) {
  const { initiateBuild } = await import('../services/buildInitiationService');
  
  // Convert to the new interface
  const result = await initiateBuild({
    userId: jobData.userId,
    projectId: jobData.projectId,
    prompt: jobData.prompt,
    framework: jobData.framework,
    versionId: jobData.versionId,
    isInitialBuild: jobData.isInitialBuild,
    baseVersionId: jobData.baseVersionId,
    previousSessionId: jobData.previousSessionId,
    metadata: {
      source: 'update-project'  // Default source for legacy calls
    }
  });
  
  // Convert back to the expected return format
  return {
    id: result.jobId,
    name: 'build',
    data: {
      ...jobData,
      buildId: result.buildId,
      versionId: result.versionId
    },
    opts: {},
    timestamp: Date.now(),
    attemptsMade: 0,
    processedOn: undefined,
    finishedOn: undefined
  };
}