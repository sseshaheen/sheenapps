import { streamQueue } from '../queue/streamQueue';
import { subscribeToEvents } from '../services/eventService';
import { CACHE_EXPIRY, INTERVALS } from '../config/timeouts.env';

// Track build start times for duration calculation
const buildStartTimes = new Map<string, number>();

export async function startDeploymentEventListener() {
  console.log('Starting deployment event listener...');
  
  // Listen to all events and filter for the ones we care about
  subscribeToEvents('all', async (event) => {
    // Track build starts
    if (event.type === 'build_started') {
      buildStartTimes.set(event.buildId, Date.now());
      return;
    }
    
    // Handle deployment completion events
    if (event.type === 'deploy_completed') {
      const { buildId, projectPath, versionId, projectId, userId } = event.data;
    
      if (!projectPath || !versionId || !projectId || !userId) {
        console.warn('[Deployment Listener] Missing required data for version classification:', event.data);
        return;
      }
      
      // Calculate build duration
      const startTime = buildStartTimes.get(buildId);
      const buildDuration = startTime ? Date.now() - startTime : 0;
      buildStartTimes.delete(buildId); // Clean up
      
      console.log(`[Deployment Listener] Deployment completed for ${buildId}, queueing version classification`);
      
      try {
        // Queue version classification job
        await streamQueue.add('classify-version', {
          buildId,
          userId,
          projectId,
          projectPath,
          versionId,
          buildDuration
        }, {
          delay: 1000, // Small delay to ensure git commits are ready
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        });
        
        console.log(`[Deployment Listener] Version classification queued for ${buildId}`);
      } catch (error) {
        console.error('[Deployment Listener] Failed to queue version classification:', error);
      }
    }
  });
  
  // Clean up old build start times periodically
  setInterval(() => {
    const oneHourAgo = Date.now() - CACHE_EXPIRY.buildStartTime;
    for (const [buildId, startTime] of buildStartTimes.entries()) {
      if (startTime < oneHourAgo) {
        buildStartTimes.delete(buildId);
      }
    }
  }, INTERVALS.buildCleanup);
  
  console.log('✅ Deployment event listener started');
}