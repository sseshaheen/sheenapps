/**
 * Advisor Matching Worker
 * 
 * Production-ready BullMQ worker for processing advisor matching jobs with:
 * - Async matching workflow processing
 * - Notification queue management
 * - Match expiration handling
 * - Technology stack detection integration
 * - Comprehensive error handling and retry logic
 * - Monitoring and metrics integration
 */

import { Worker, Job } from 'bullmq';
import { ServerLoggingService } from '../services/serverLoggingService';
import { AdvisorMatchingService } from '../services/advisorMatchingService';
import { AdvisorNotificationService } from '../services/advisorNotificationService';
import {
  advisorMatchingQueue,
  notificationQueue,
  AdvisorMatchingJobData,
  NotificationJobData
} from '../queue/modularQueues';
import {
  NOTIFICATION_TYPES,
  DELIVERY_METHODS
} from '../types/advisorMatching';

const logger = ServerLoggingService.getInstance();

// Redis connection config
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// Service instances
const matchingService = new AdvisorMatchingService();
const notificationService = new AdvisorNotificationService();

// =====================================================
// Advisor Matching Worker
// =====================================================

export const advisorMatchingWorker = new Worker(
  'advisor-matching',
  async (job: Job<AdvisorMatchingJobData>) => {
    const { data } = job;
    
    await logger.logServerEvent('routing', 'info', 'Processing advisor matching job', {
      jobId: job.id,
      operation: data.operation,
      matchRequestId: data.matchRequestId,
      projectId: data.projectId
    });

    try {
      switch (data.operation) {
        case 'find_advisors':
          return await processFindAdvisors(job);
        
        case 'send_notifications':
          return await processSendNotifications(job);
        
        case 'expire_matches':
          return await processExpireMatches(job);
        
        case 'process_notifications':
          return await processNotificationBatch(job);
        
        default:
          throw new Error(`Unknown operation: ${data.operation}`);
      }
    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Advisor matching job failed', {
        jobId: job.id,
        operation: data.operation,
        error: error instanceof Error ? error.message : 'Unknown error',
        matchRequestId: data.matchRequestId,
        projectId: data.projectId
      });
      throw error;
    }
  },
  {
    connection,
    concurrency: 5, // Process up to 5 matching jobs concurrently
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 }
  }
);

// =====================================================
// Notification Processing Worker
// =====================================================

export const notificationWorker = new Worker(
  'notifications',
  async (job: Job<NotificationJobData>) => {
    const { data } = job;
    
    await logger.logServerEvent('routing', 'info', 'Processing notification job', {
      jobId: job.id,
      notificationId: data.notificationId,
      notificationType: data.notificationType,
      deliveryMethod: data.deliveryMethod,
      recipientId: data.recipientId
    });

    try {
      if (data.notificationType === 'bulk_processing') {
        // Process outbox batch
        const result = await notificationService.processOutbox(10);
        
        await logger.logServerEvent('routing', 'info', 'Bulk notification processing completed', {
          jobId: job.id,
          processed: result.processed,
          delivered: result.delivered,
          failed: result.failed,
          deadLettered: result.deadLettered
        });

        return result;
      } else {
        // Process individual notification
        return await processIndividualNotification(job);
      }
    } catch (error) {
      await logger.logServerEvent('error', 'error', 'Notification job failed', {
        jobId: job.id,
        notificationId: data.notificationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  },
  {
    connection,
    concurrency: 10, // Process up to 10 notifications concurrently
    removeOnComplete: { count: 25 },
    removeOnFail: { count: 100 }
  }
);

// =====================================================
// Job Processing Functions
// =====================================================

async function processFindAdvisors(job: Job<AdvisorMatchingJobData>) {
  const { matchRequestId, projectId, context } = job.data;

  // Get the match request
  const matchRequest = await matchingService.getMatchRequest(matchRequestId);
  if (!matchRequest) {
    throw new Error(`Match request ${matchRequestId} not found`);
  }

  // If already matched, skip
  if (matchRequest.status !== 'pending') {
    await logger.logServerEvent('routing', 'info', 'Match request already processed', {
      matchRequestId,
      currentStatus: matchRequest.status
    });
    return { status: 'skipped', reason: 'Already processed' };
  }

  // Create new match with race-safe assignment
  const result = await matchingService.ensureOpenMatch({
    projectId,
    requestedBy: matchRequest.requested_by,
    matchCriteria: matchRequest.match_criteria,
    expiresInHours: 2
  });

  if (!result.success) {
    throw new Error(`Failed to find advisors: ${result.error}`);
  }

  await logger.logServerEvent('routing', 'info', 'Advisor matching completed', {
    matchRequestId,
    matched: !!result.candidateAdvisor,
    advisorId: result.candidateAdvisor?.advisor_id,
    score: result.candidateAdvisor?.score
  });

  return {
    status: 'completed',
    matched: !!result.candidateAdvisor,
    advisorId: result.candidateAdvisor?.advisor_id,
    score: result.candidateAdvisor?.score
  };
}

async function processSendNotifications(job: Job<AdvisorMatchingJobData>) {
  const { matchRequestId, context } = job.data;

  // Get the match request
  const matchRequest = await matchingService.getMatchRequest(matchRequestId);
  if (!matchRequest) {
    throw new Error(`Match request ${matchRequestId} not found`);
  }

  const notifications = [];

  // Send advisor notification if matched
  if (matchRequest.matched_advisor_id && matchRequest.status === 'matched') {
    const advisorNotificationId = await notificationService.queueNotification({
      matchRequestId,
      recipientId: matchRequest.matched_advisor_id,
      notificationType: 'ADVISOR_MATCHED',
      deliveryMethod: 'EMAIL',
      context: {
        projectId: matchRequest.project_id,
        projectName: context?.projectName || 'New Project',
        clientName: context?.clientName || 'Client',
        advisorName: context?.advisorName || 'Advisor',
        matchScore: matchRequest.match_score,
        techStack: context?.techStack || [],
        matchId: matchRequestId
      }
    });
    notifications.push({ type: 'advisor', notificationId: advisorNotificationId });
  }

  // Send client notification
  const clientNotificationId = await notificationService.queueNotification({
    matchRequestId,
    recipientId: matchRequest.requested_by,
    notificationType: 'CLIENT_APPROVAL',
    deliveryMethod: 'EMAIL',
    context: {
      projectId: matchRequest.project_id,
      projectName: context?.projectName || 'Your Project',
      clientName: context?.clientName || 'Client',
      advisorName: context?.advisorName || 'Advisor',
      matchScore: matchRequest.match_score,
      techStack: context?.techStack || [],
      matchId: matchRequestId
    }
  });
  notifications.push({ type: 'client', notificationId: clientNotificationId });

  await logger.logServerEvent('routing', 'info', 'Match notifications queued', {
    matchRequestId,
    notificationCount: notifications.length,
    notifications
  });

  return {
    status: 'completed',
    notificationCount: notifications.length,
    notifications
  };
}

async function processExpireMatches(job: Job<AdvisorMatchingJobData>) {
  // Run general match expiration
  const expiredCount = await matchingService.expireStaleMatches();

  await logger.logServerEvent('routing', 'info', 'Match expiration completed', {
    expiredCount
  });

  return {
    status: 'completed',
    expiredCount
  };
}

async function processNotificationBatch(job: Job<AdvisorMatchingJobData>) {
  // Process a batch of pending notifications
  const result = await notificationService.processOutbox(10);

  await logger.logServerEvent('routing', 'info', 'Notification batch processing completed', {
    processed: result.processed,
    delivered: result.delivered,
    failed: result.failed,
    deadLettered: result.deadLettered
  });

  return result;
}

async function processIndividualNotification(job: Job<NotificationJobData>) {
  const { notificationId, retryAttempt = 0 } = job.data;

  // Process single notification from outbox
  const result = await notificationService.processOutbox(1);

  await logger.logServerEvent('routing', 'info', 'Individual notification processed', {
    notificationId,
    retryAttempt,
    result
  });

  return result;
}

// =====================================================
// Worker Event Handlers
// =====================================================

advisorMatchingWorker.on('completed', async (job: Job, result: any) => {
  await logger.logServerEvent('routing', 'info', 'Advisor matching job completed', {
    jobId: job.id,
    operation: job.data.operation,
    result: result?.status || 'completed',
    duration: Date.now() - job.timestamp
  });
});

advisorMatchingWorker.on('failed', async (job: Job | undefined, err: Error) => {
  await logger.logServerEvent('error', 'error', 'Advisor matching job failed', {
    jobId: job?.id,
    operation: job?.data?.operation,
    error: err.message,
    attempts: job?.attemptsMade || 0
  });
});

notificationWorker.on('completed', async (job: Job, result: any) => {
  await logger.logServerEvent('routing', 'info', 'Notification job completed', {
    jobId: job.id,
    notificationId: job.data.notificationId,
    delivered: result?.delivered || 0,
    duration: Date.now() - job.timestamp
  });
});

notificationWorker.on('failed', async (job: Job | undefined, err: Error) => {
  await logger.logServerEvent('error', 'error', 'Notification job failed', {
    jobId: job?.id,
    notificationId: job?.data?.notificationId,
    error: err.message,
    attempts: job?.attemptsMade || 0
  });
});

// =====================================================
// Worker Lifecycle Management
// =====================================================

export async function startAdvisorMatchingWorkers() {
  console.log('[AdvisorMatching] Starting advisor matching workers...');
  
  try {
    // Workers start automatically when created, but we can add initialization logic here
    await logger.logServerEvent('routing', 'info', 'Advisor matching workers started', {
      advisorMatchingConcurrency: 5,
      notificationConcurrency: 10
    });
    
    console.log('[AdvisorMatching] Workers started successfully');
  } catch (error) {
    console.error('[AdvisorMatching] Failed to start workers:', error);
    throw error;
  }
}

export async function shutdownAdvisorMatchingWorkers() {
  console.log('[AdvisorMatching] Shutting down advisor matching workers...');
  
  try {
    await Promise.all([
      advisorMatchingWorker.close(),
      notificationWorker.close()
    ]);
    
    await logger.logServerEvent('routing', 'info', 'Advisor matching workers stopped');
    console.log('[AdvisorMatching] Workers stopped successfully');
  } catch (error) {
    console.error('[AdvisorMatching] Error stopping workers:', error);
    throw error;
  }
}

// =====================================================
// Scheduled Jobs Integration
// =====================================================

// This would be called from the scheduled jobs to process periodic tasks
export async function schedulePeriodicAdvisorMatchingJobs() {
  try {
    // Schedule match expiration check
    await advisorMatchingQueue?.add('expire-matches', {
      matchRequestId: 'periodic',
      projectId: 'periodic',
      operation: 'expire_matches'
    } as AdvisorMatchingJobData, {
      repeat: { pattern: '*/15 * * * *' }, // Every 15 minutes
      jobId: 'periodic-match-expiration'
    });

    // Schedule notification processing
    await notificationQueue?.add('process-outbox-batch', {
      notificationId: 'periodic',
      matchRequestId: 'periodic',
      recipientId: 'system',
      notificationType: 'bulk_processing',
      deliveryMethod: 'system'
    } as NotificationJobData, {
      repeat: { pattern: '*/5 * * * *' }, // Every 5 minutes
      jobId: 'periodic-notification-processing'
    });

    console.log('[AdvisorMatching] Periodic jobs scheduled');
  } catch (error) {
    console.error('[AdvisorMatching] Failed to schedule periodic jobs:', error);
  }
}