import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { TaskPlan, Task, WebhookPayload } from '../types/modular';

// GitHub sync job data types
export interface GitHubSyncJobData {
  projectId: string;
  deliveryId?: string;
  payload?: any;
  operation?: 'push' | 'pull' | 'webhook' | 'conflict_resolution';
  versionId?: string;
  commitSha?: string;
}

// Advisor matching job data types
export interface AdvisorMatchingJobData {
  matchRequestId: string;
  projectId: string;
  operation: 'find_advisors' | 'send_notifications' | 'expire_matches' | 'process_notifications';
  context?: any;
}

export interface NotificationJobData {
  notificationId: string;
  matchRequestId: string;
  recipientId: string;
  notificationType: string;
  deliveryMethod: string;
  retryAttempt?: number;
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
// Recommendations generation job data types
export interface RecommendationsJobData {
  projectId: string;
  userId: string;
  buildId: string;
  versionId: string;
  buildSessionId?: string | undefined;
  projectPath: string;
  framework?: string | undefined;
  prompt: string;
  isInitialBuild?: boolean | undefined;
  /** Priority level: 'normal' for async after build, 'low' for background refresh */
  priority?: 'normal' | 'low' | undefined;
}

// Chat message processing job data types
export interface ChatMessageJobData {
  projectId: string;
  userId: string;
  messageId: string;       // DB message ID (for idempotency check)
  client_msg_id: string;   // Client's idempotency key
  mode: 'plan' | 'build' | 'unified';
  text: string;
  locale?: string | undefined;
  // Structured intent for deterministic build triggering
  intent?: 'apply_recommendation' | undefined;
  recommendation_id?: string | undefined;  // If applying a specific recommendation
  recommendation_payload?: any;             // Diff/spec for the recommendation
  sessionContext?: {
    previousMode?: 'plan' | 'build';
    sessionId?: string;
  } | undefined;
}

// Inbound email webhook job data types
export interface InboxWebhookJobData {
  projectId: string;
  providerId: string;      // Resend message ID for deduplication
  toEmail: string;         // Recipient address (inbox address)
  fromEmail: string;       // Sender address
  fromName?: string | undefined;
  replyTo?: string | undefined;
  subject?: string | undefined;
  textBody?: string | undefined;
  htmlBody?: string | undefined;
  messageId?: string | undefined;   // Email Message-ID header
  inReplyTo?: string | undefined;   // In-Reply-To header
  references?: string[] | undefined; // References header
  rawHeaders?: Record<string, string> | undefined;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    sizeBytes: number;
    contentId?: string;
    content?: string;      // Base64 encoded (we may drop large attachments)
  }> | undefined;
  receivedAt: string;      // ISO timestamp
}

// Domain verification job data types (scheduled periodic verification)
export interface DomainVerificationJobData {
  /** If provided, verify only this domain. Otherwise, verify all domains. */
  domainId?: string | undefined;
  /** If provided, only verify domains for this project. */
  projectId?: string | undefined;
  /** Job type: 'single' for one domain, 'batch' for scheduled batch */
  type: 'single' | 'batch';
}

// =============================================================================
// OpenClaw AI Assistant Job Types
// =============================================================================

/** OpenClaw event types from gateway webhooks */
export type OpenClawEventType =
  | 'message.received'
  | 'message.sent'
  | 'tool.called'
  | 'tool.completed'
  | 'session.started'
  | 'session.ended'
  | 'lead.created'
  | 'channel.connected'
  | 'channel.disconnected'
  | 'error.occurred';

/** OpenClaw channel types */
export type OpenClawChannel =
  | 'whatsapp'
  | 'telegram'
  | 'webchat'
  | 'discord'
  | 'slack'
  | 'signal'
  | 'imessage'
  | 'line'
  | 'teams'
  | 'matrix'
  | 'zalo';

/** OpenClaw webhook job data */
export interface OpenClawWebhookJobData {
  /** Unique delivery ID for idempotency */
  deliveryId: string;
  /** Event type from OpenClaw gateway */
  event: OpenClawEventType;
  /** Project ID this gateway belongs to */
  projectId: string;
  /** Gateway instance ID */
  gatewayId: string;
  /** ISO timestamp of the event */
  timestamp: string;
  /** When the job was enqueued */
  enqueuedAt: string;
  /** Event-specific data */
  data: {
    channel?: OpenClawChannel | undefined;
    senderId?: string | undefined;
    senderName?: string | undefined;
    sessionId?: string | undefined;
    messageId?: string | undefined;
    content?: string | undefined;
    toolName?: string | undefined;
    toolParams?: Record<string, unknown> | undefined;
    toolResult?: unknown;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
    /** Token usage for billing */
    promptTokens?: number | undefined;
    completionTokens?: number | undefined;
    /** Lead data for lead.created events */
    lead?: {
      name?: string;
      phone?: string;
      email?: string;
      source?: string;
      notes?: string;
    } | undefined;
    [key: string]: unknown;
  };
}

// Redis connection config for local instance (same as buildQueue)
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Required for BullMQ
};

// Export connection for reuse in workers
export { connection as redisConnection };

// Create queues only if not in test mode or if Redis is expected to be available
const isTestMode = process.env.NODE_ENV === 'test';
const shouldCreateQueues = !isTestMode || process.env.USE_REDIS_IN_TEST === 'true';

// Define job data types for plan and task queues
// These extend the base required fields with additional optional properties
// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface PlanJobData {
  prompt: string;
  userId?: string | undefined;
  projectId?: string | undefined;
  framework?: string | undefined;
  versionId?: string | undefined;
  isInitialBuild?: boolean | undefined;
  baseVersionId?: string | null | undefined;
  previousSessionId?: string | null | undefined;
  context?: any;
  buildId?: string | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface TaskJobData {
  // Execute-plan jobs
  plan?: TaskPlan | undefined;
  projectPath?: string | undefined;
  framework?: string | undefined;
  userId?: string | undefined;
  projectId?: string | undefined;
  // Individual task jobs
  task?: Task | undefined;
  context?: any;
  planId?: string | undefined;
  buildId?: string | undefined;
  dependencies?: string[] | undefined;
  sessionId?: string | undefined;
}

// Plan queue for generating task plans
export const planQueue: Queue<PlanJobData> | null = shouldCreateQueues ? new Queue<PlanJobData>('plans', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
  }
}) : null;

// Task queue for executing individual AI tasks
export const taskQueue: Queue<TaskJobData> | null = shouldCreateQueues ? new Queue<TaskJobData>('ai-tasks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
}) : null;

// Webhook queue for reliable webhook delivery
export const webhookQueue: Queue<WebhookPayload> | null = shouldCreateQueues ? new Queue<WebhookPayload>('webhooks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false, // Keep failed webhooks for debugging
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  }
}) : null;

// Deploy queue for building and deploying projects
export const deployQueue: Queue | null = shouldCreateQueues ? new Queue('deployments', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false, // Keep failed deployments for debugging
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  }
}) : null;

// Stripe webhook queue for payment processing
export const stripeWebhookQueue: Queue | null = shouldCreateQueues ? new Queue('stripe-webhooks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 for monitoring
    removeOnFail: 50, // Keep failed ones for debugging
    attempts: 6, // More attempts for critical payment events
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  }
}) : null;

// Cal.com webhook queue for consultation booking events
export const calComWebhookQueue: Queue | null = shouldCreateQueues ? new Queue('calcom-webhooks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 for monitoring
    removeOnFail: 50, // Keep failed ones for debugging
    attempts: 5, // Multiple attempts for booking events
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
}) : null;

// GitHub sync queue for bidirectional synchronization
export const githubSyncQueue: Queue<GitHubSyncJobData> | null = shouldCreateQueues ? new Queue<GitHubSyncJobData>('github-sync', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 25, // Keep more for monitoring sync operations
    removeOnFail: 100, // Keep failed syncs for debugging
    attempts: 3, // Conservative retry for sync operations
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
}) : null;

// Advisor matching queue for intelligent advisor-client matching
export const advisorMatchingQueue: Queue<AdvisorMatchingJobData> | null = shouldCreateQueues ? new Queue<AdvisorMatchingJobData>('advisor-matching', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50, // Keep more for analytics
    removeOnFail: 100, // Keep failed matches for debugging
    attempts: 3, // Conservative retry for matching operations
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  }
}) : null;

// Notification processing queue for reliable delivery
export const notificationQueue: Queue<NotificationJobData> | null = shouldCreateQueues ? new Queue<NotificationJobData>('notifications', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 25, // Keep recent successful deliveries
    removeOnFail: 100, // Keep failed notifications for debugging
    attempts: 5, // More attempts for critical notifications
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
}) : null;

// Recommendations generation queue (async, parallel to main build)
// This queue processes recommendation generation jobs with lower priority than builds
export const recommendationsQueue: Queue<RecommendationsJobData> | null = shouldCreateQueues ? new Queue<RecommendationsJobData>('recommendations', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50, // Keep for analytics (track tt_recs)
    removeOnFail: 100, // Keep failed for debugging and retry analysis
    attempts: 2, // Conservative retry - recs are nice-to-have
    backoff: {
      type: 'exponential',
      delay: 3000, // Longer delay to not compete with builds
    },
  }
}) : null;

// Chat queue for processing user messages with Claude
export const chatQueue: Queue<ChatMessageJobData> | null = shouldCreateQueues ? new Queue<ChatMessageJobData>('chat-messages', {
  connection,
  defaultJobOptions: {
    attempts: 3,  // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 2000  // Start with 2s, then 4s, then 8s
    },
    removeOnComplete: 100,  // Keep last 100 completed jobs for debugging
    removeOnFail: false,     // Keep failed jobs for investigation
  }
}) : null;

// Inbox webhook queue for processing inbound emails
export const inboxWebhookQueue: Queue<InboxWebhookJobData> | null = shouldCreateQueues ? new Queue<InboxWebhookJobData>('inbox-webhooks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,    // Keep for monitoring
    removeOnFail: 100,       // Keep failed for debugging
    attempts: 3,             // Retry on transient failures
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
}) : null;

// Inbox retention queue for periodic message cleanup
export const inboxRetentionQueue: Queue | null = shouldCreateQueues ? new Queue('inbox-retention', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,    // Keep recent runs
    removeOnFail: 50,        // Keep failed for debugging
    attempts: 2,             // Retry once on failure
    backoff: {
      type: 'fixed',
      delay: 60000,          // 1 minute delay between retries
    },
  }
}) : null;

// Domain verification queue for periodic DNS verification
export const domainVerificationQueue: Queue<DomainVerificationJobData> | null = shouldCreateQueues ? new Queue<DomainVerificationJobData>('domain-verification', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 20,    // Keep recent verifications
    removeOnFail: 50,        // Keep failed for debugging
    attempts: 2,             // DNS can be flaky, but don't retry too much
    backoff: {
      type: 'fixed',
      delay: 30000,          // 30 second delay between retries
    },
  }
}) : null;

// OpenClaw AI Assistant webhook queue for processing gateway events
export const openclawWebhookQueue: Queue<OpenClawWebhookJobData> | null = shouldCreateQueues ? new Queue<OpenClawWebhookJobData>('openclaw-webhooks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,    // Keep recent events for monitoring
    removeOnFail: 100,       // Keep failed events for debugging
    attempts: 3,             // Retry on transient failures
    backoff: {
      type: 'exponential',
      delay: 2000,           // Start with 2s delay
    },
  }
}) : null;

// Queue events for monitoring
export const planQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('plans', { connection }) : null;
export const taskQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('ai-tasks', { connection }) : null;
export const webhookQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('webhooks', { connection }) : null;
export const deployQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('deployments', { connection }) : null;
export const stripeWebhookQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('stripe-webhooks', { connection }) : null;
export const calComWebhookQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('calcom-webhooks', { connection }) : null;
export const githubSyncQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('github-sync', { connection }) : null;
export const advisorMatchingQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('advisor-matching', { connection }) : null;
export const notificationQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('notifications', { connection }) : null;
export const recommendationsQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('recommendations', { connection }) : null;
export const chatQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('chat-messages', { connection }) : null;
export const inboxWebhookQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('inbox-webhooks', { connection }) : null;
export const inboxRetentionQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('inbox-retention', { connection }) : null;
export const domainVerificationQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('domain-verification', { connection }) : null;
export const openclawWebhookQueueEvents: QueueEvents | null = shouldCreateQueues ? new QueueEvents('openclaw-webhooks', { connection }) : null;

// =====================================================
// Graceful Shutdown
// =====================================================

/**
 * Closes all queue and queue events connections.
 * Call this on server shutdown to prevent leaked Redis connections.
 */
export async function closeAllQueues(): Promise<void> {
  const queues = [
    planQueue,
    taskQueue,
    webhookQueue,
    deployQueue,
    stripeWebhookQueue,
    calComWebhookQueue,
    githubSyncQueue,
    advisorMatchingQueue,
    notificationQueue,
    recommendationsQueue,
    chatQueue,
    inboxWebhookQueue,
    inboxRetentionQueue,
    domainVerificationQueue,
    openclawWebhookQueue,
  ];

  const queueEvents = [
    planQueueEvents,
    taskQueueEvents,
    webhookQueueEvents,
    deployQueueEvents,
    stripeWebhookQueueEvents,
    calComWebhookQueueEvents,
    githubSyncQueueEvents,
    advisorMatchingQueueEvents,
    notificationQueueEvents,
    recommendationsQueueEvents,
    chatQueueEvents,
    inboxWebhookQueueEvents,
    inboxRetentionQueueEvents,
    domainVerificationQueueEvents,
    openclawWebhookQueueEvents,
  ];

  // Close all queues and queue events in parallel
  await Promise.allSettled([
    ...queues.filter(Boolean).map(q => q!.close()),
    ...queueEvents.filter(Boolean).map(qe => qe!.close()),
  ]);

  console.log('[ModularQueues] All queues closed');
}

// =====================================================
// Queue Safety Helpers
// =====================================================

/**
 * Safely get a queue, throwing a descriptive error if unavailable.
 * Use this instead of accessing queues directly to get clear error messages
 * in test mode or when Redis is unavailable.
 */
export function requireQueue<T>(queue: Queue<T> | null, queueName: string): Queue<T> {
  if (!queue) {
    throw new Error(
      `Queue "${queueName}" is not available. ` +
      `This may happen in test mode (NODE_ENV=test) without USE_REDIS_IN_TEST=true, ` +
      `or if Redis connection failed.`
    );
  }
  return queue;
}

/**
 * Safely get queue events, throwing a descriptive error if unavailable.
 * Use this for operations that need QueueEvents (like waitUntilFinished).
 */
export function requireQueueEvents(queueEvents: QueueEvents | null, queueName: string): QueueEvents {
  if (!queueEvents) {
    throw new Error(
      `QueueEvents for "${queueName}" is not available. ` +
      `This may happen in test mode (NODE_ENV=test) without USE_REDIS_IN_TEST=true, ` +
      `or if Redis connection failed.`
    );
  }
  return queueEvents;
}

// Helper functions for adding jobs to queues
export async function addPlanJob(data: {
  prompt: string;
  context: any;
  buildId: string;
}): Promise<Job> {
  return requireQueue(planQueue, 'plans').add('generate-plan', data);
}

export async function addTaskJob(data: {
  task: Task;
  context: any;
  planId: string;
  buildId: string;
  dependencies?: string[];
}): Promise<Job> {
  return requireQueue(taskQueue, 'ai-tasks').add(
    `execute-${data.task.type}`,
    data,
    {
      // 🚨 EXPERT FIX (Round 9): Include buildId for global uniqueness
      // task.id alone can collide across builds (e.g., "validate-config" in multiple builds)
      jobId: `task-${data.buildId}-${data.task.id}`,
      delay: data.dependencies && data.dependencies.length > 0 ? 1000 : 0,
    }
  );
}

export async function addWebhookJob(payload: WebhookPayload): Promise<Job> {
  return requireQueue(webhookQueue, 'webhooks').add('deliver-webhook', payload);
}

export async function addStripeWebhookJob(data: {
  eventId: string;
  eventType: string;
  correlationId: string;
  userId?: string;
  customerId?: string;
  subscriptionId?: string;
}): Promise<Job> {
  return requireQueue(stripeWebhookQueue, 'stripe-webhooks').add('process-stripe-event', data, {
    attempts: 6,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    // Use event ID as job ID to prevent duplicates
    jobId: `stripe-${data.eventId}`
  });
}

export async function addCalComWebhookJob(data: {
  eventId: string;
  eventType: string;
  correlationId: string;
  rawPayload: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  signature?: string | undefined;
}): Promise<Job> {
  return requireQueue(calComWebhookQueue, 'calcom-webhooks').add('process-calcom-event', data, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    // Use event ID as job ID to prevent duplicates
    jobId: `calcom-${data.eventId}`
  });
}

// GitHub sync job helper functions
export async function addGitHubSyncJob(data: GitHubSyncJobData): Promise<Job> {
  // 🚨 EXPERT FIX (Round 10 & 11): Use deterministic jobId to prevent duplicates on retry
  // Old: used Date.now() as fallback → retries create duplicate jobs
  // Round 10: removed Date.now() but was TOO COARSE (only projectId)
  // Round 11: include operation + version/commit to avoid deduping legitimate separate syncs
  const jobId = data.deliveryId
    ? `github-${data.deliveryId}`
    : `github-sync-${data.projectId}-${data.operation || 'unknown'}-${data.versionId || data.commitSha || 'na'}`;

  return requireQueue(githubSyncQueue, 'github-sync').add('process-github-sync', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    jobId
  });
}

export async function addGitHubWebhookJob(data: {
  projectId: string;
  deliveryId: string;
  payload: any;
}): Promise<Job> {
  return requireQueue(githubSyncQueue, 'github-sync').add('sync-from-github', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    jobId: `github-webhook-${data.deliveryId}`
  });
}

export async function addGitHubPushJob(data: {
  projectId: string;
  versionId: string;
}): Promise<Job> {
  return requireQueue(githubSyncQueue, 'github-sync').add('sync-to-github', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    jobId: `github-push-${data.projectId}-${data.versionId}`
  });
}

// Advisor matching job helper functions
export async function addAdvisorMatchingJob(data: AdvisorMatchingJobData): Promise<Job> {
  // 🚨 EXPERT FIX (Round 10): Use deterministic jobId to prevent duplicates on retry
  // Old: always appended Date.now() → retries create duplicate jobs
  // New: use semantic identity (matchRequestId or operation+projectId)
  const jobId = `advisor-matching-${data.operation}-${data.matchRequestId || data.projectId}`;

  return requireQueue(advisorMatchingQueue, 'advisor-matching').add(`advisor-${data.operation}`, data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    jobId
  });
}

export async function addNotificationJob(data: NotificationJobData): Promise<Job> {
  const jobId = `notification-${data.notificationId}-${data.retryAttempt || 0}`;

  return requireQueue(notificationQueue, 'notifications').add('process-notification', data, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    jobId
  });
}

export async function addMatchExpirationJob(data: {
  matchRequestId: string;
  projectId: string;
}): Promise<Job> {
  return requireQueue(advisorMatchingQueue, 'advisor-matching').add('expire-matches', {
    matchRequestId: data.matchRequestId,
    projectId: data.projectId,
    operation: 'expire_matches'
  } as AdvisorMatchingJobData, {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    jobId: `expire-match-${data.matchRequestId}`
  });
}

export async function addBulkNotificationProcessingJob(): Promise<Job> {
  return requireQueue(notificationQueue, 'notifications').add('process-outbox-batch', {
    notificationId: 'bulk',
    matchRequestId: 'bulk',
    recipientId: 'system',
    notificationType: 'bulk_processing',
    deliveryMethod: 'system'
  } as NotificationJobData, {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    // 🚨 DESIGN NOTE (Round 12): Intentionally uses Date.now() to avoid dedupe
    // Unlike other queue functions, bulk processing should NOT be deduped
    // We want multiple bulk processors to run concurrently if triggered
    // If you want "only one bulk processor at a time", change to: jobId: 'bulk-notifications'
    jobId: `bulk-notifications-${Date.now()}`
  });
}

/**
 * Add a recommendations generation job to the queue.
 * Jobs are processed asynchronously and in parallel with the main build.
 *
 * Priority levels:
 * - 'normal': Standard async generation after build starts
 * - 'low': Background refresh (e.g., after project update)
 *
 * @param data - Recommendations job data
 * @returns The created job
 */
export async function addRecommendationsJob(data: RecommendationsJobData): Promise<Job> {
  // Use buildId for deduplication within same build
  const jobId = `recs-${data.buildId}-${data.versionId}`;

  // Priority mapping: lower number = higher priority in BullMQ
  const priority = data.priority === 'low' ? 10 : 5;

  return requireQueue(recommendationsQueue, 'recommendations').add('generate-recommendations', data, {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 3000
    },
    priority,
    jobId,
    // Delay slightly to let the main build get ahead
    delay: data.priority === 'low' ? 5000 : 1000,
  });
}

/**
 * Queue recommendations generation as a fire-and-forget operation.
 * Logs errors but doesn't throw - recommendations are nice-to-have.
 *
 * Usage in build worker:
 * ```typescript
 * // Fire and forget - don't await
 * queueRecommendationsGeneration({
 *   projectId,
 *   userId,
 *   buildId,
 *   versionId,
 *   buildSessionId,
 *   projectPath,
 *   framework,
 *   prompt,
 *   isInitialBuild,
 * }).catch(err => console.warn('Failed to queue recommendations', err))
 * ```
 */
export async function queueRecommendationsGeneration(data: RecommendationsJobData): Promise<void> {
  try {
    const job = await addRecommendationsJob(data);
    console.log(`[RecommendationsQueue] Queued job ${job.id} for build ${data.buildId}`);
  } catch (error) {
    // 🚨 EXPERT NOTE (Round 10): BullMQ duplicate jobId detection is best-effort
    // BullMQ doesn't expose a reliable error code/type for "job already exists"
    // We string-match the error message, which can vary by BullMQ version
    // This is acceptable because recommendations are non-critical (fire-and-forget)
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDuplicateJob = errorMessage.includes('already exists') ||
                           errorMessage.includes('Job with id') ||
                           errorMessage.includes('duplicate');

    if (isDuplicateJob) {
      // This is expected behavior - a job for this build/version already exists
      // Log at debug level, not error (this is not a failure)
      console.log(`[RecommendationsQueue] Job already exists for build ${data.buildId} - skipping (dedupe working as expected)`);
      return;
    }

    // Log other errors but don't throw - recommendations are non-critical
    console.error('[RecommendationsQueue] Failed to queue recommendations job:', error);
  }
}

// =============================================================================
// OpenClaw AI Assistant Queue Helpers
// =============================================================================

/**
 * Add an OpenClaw webhook job to the queue.
 * Uses deliveryId for idempotent job creation.
 *
 * @param data - OpenClaw webhook job data
 * @returns The created job
 */
export async function addOpenClawWebhookJob(data: OpenClawWebhookJobData): Promise<Job> {
  // Use deliveryId for deduplication
  const jobId = `openclaw-${data.event}-${data.deliveryId}`;

  return requireQueue(openclawWebhookQueue, 'openclaw-webhooks').add('process-openclaw-event', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    jobId
  });
}

/**
 * Queue OpenClaw webhook for processing.
 * Fire-and-forget pattern - logs errors but doesn't throw.
 *
 * @param data - OpenClaw webhook job data
 */
export async function queueOpenClawWebhook(data: OpenClawWebhookJobData): Promise<void> {
  try {
    const job = await addOpenClawWebhookJob(data);
    console.log(`[OpenClawQueue] Queued job ${job.id} for event ${data.event}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDuplicateJob = errorMessage.includes('already exists') ||
                           errorMessage.includes('Job with id') ||
                           errorMessage.includes('duplicate');

    if (isDuplicateJob) {
      // Expected behavior - event already being processed
      console.log(`[OpenClawQueue] Job already exists for delivery ${data.deliveryId} - skipping`);
      return;
    }

    // Log but don't throw - webhook processing should be resilient
    console.error('[OpenClawQueue] Failed to queue OpenClaw webhook:', error);
  }
}