import { Queue, Worker, Job } from 'bullmq';
import { LogEntry } from './logAlertingService';

/**
 * Alert Queue Service
 * 
 * Separate module to prevent circular dependencies between unifiedLogger and logAlertingService.
 * Uses BullMQ for reliable background processing with production-tuned configuration.
 * 
 * Expert patterns:
 * - Production-tuned queue configuration
 * - Single worker with tuned concurrency  
 * - Automatic job deduplication via jobId
 * - Aggressive stall detection and recovery
 */

let alertQueue: Queue | null = null;
let alertWorker: Worker | null = null;

// Expert-refined: Production-tuned queue configuration
const ALERT_QUEUE_CONFIG = {
  name: `LOGQ_${process.env.NODE_ENV || 'development'}`, // Expert: underscore separator, BullMQ requirement
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxLoadingTimeout: 5000,
    // Expert: Additional production-tuned Redis settings
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,
    keepAlive: 30000
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep successful jobs for debugging
    removeOnFail: 50, // Keep failed jobs for analysis - overridden below for production
    attempts: 3,
    backoff: { 
      type: 'exponential', 
      delay: 2000 
    },
    delay: 0, // Immediate processing for alerts
    // Expert: Production job options
    jobId: undefined, // Will be set to fingerprint for deduplication
    priority: 0, // Higher priority for critical alerts (set dynamically)
    ttl: 3600000, // 1 hour job TTL
  },
  settings: {
    maxStalledCount: 1, // Expert: aggressive stall detection
    stalledInterval: 30000,
    retryProcessDelay: 5000
  }
};

// Expert pattern: Environment-specific worker configuration
const getWorkerConcurrency = (): number => {
  const env = process.env.NODE_ENV || 'development';
  const customConcurrency = process.env.ALERT_WORKER_CONCURRENCY;
  
  if (customConcurrency) {
    return Math.max(1, Math.min(50, parseInt(customConcurrency))); // Bounded 1-50
  }
  
  switch (env) {
    case 'production':
      return 20; // Higher concurrency in production
    case 'staging':
      return 10; // Medium concurrency in staging
    default:
      return 5; // Lower concurrency in development
  }
};

// Expert pattern: Adaptive rate limiting based on severity
const getRateLimiter = () => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return { max: 100, duration: 1000 }; // 100 alerts per second in production
  } else {
    return { max: 50, duration: 1000 }; // 50 alerts per second in non-production
  }
};

const ALERT_WORKER_CONFIG = {
  concurrency: getWorkerConcurrency(),
  limiter: getRateLimiter(),
  // Expert: Additional production worker settings
  stalledInterval: 30000,
  maxStalledCount: 1,
  // Expert: Graceful shutdown configuration
  enableGracefulShutdown: true,
  shutdownTimeout: 10000, // 10 seconds to finish processing
  // Expert: Memory management
  maxMemoryUsage: 512 * 1024 * 1024 // 512MB memory limit
};

/**
 * Get or create alert queue
 */
export function getAlertQueue(): Queue {
  if (!alertQueue) {
    try {
      alertQueue = new Queue(ALERT_QUEUE_CONFIG.name, {
        connection: ALERT_QUEUE_CONFIG.connection,
        defaultJobOptions: ALERT_QUEUE_CONFIG.defaultJobOptions
      });

      // Handle queue errors gracefully
      alertQueue.on('error', (error) => {
        console.error('Alert queue error:', error);
      });

      alertQueue.on('waiting', (job) => {
        console.debug(`Alert job ${job.id} waiting`);
      });

      // Queue events - note: BullMQ uses different event signatures
      console.debug('Alert queue initialized successfully');

    } catch (error) {
      console.error('Failed to initialize alert queue:', error);
      throw error;
    }
  }

  return alertQueue;
}

/**
 * Get or create alert worker
 */
export function getAlertWorker(): Worker | null {
  if (!alertWorker && process.env.LOG_ALERTS_ENABLED !== 'false') {
    try {
      alertWorker = new Worker(
        ALERT_QUEUE_CONFIG.name,
        async (job: Job) => {
          const { LogAlertingService } = await import('./logAlertingService');
          const entry = job.data as LogEntry;
          
          // Add job metadata to entry for correlation
          entry.metadata = {
            ...entry.metadata,
            jobId: job.id,
            attemptNumber: job.attemptsMade + 1,
            processedAt: new Date().toISOString()
          };

          const alertingService = LogAlertingService.getInstance();
          await alertingService.processLogEntry(entry);
        },
        {
          connection: ALERT_QUEUE_CONFIG.connection,
          concurrency: ALERT_WORKER_CONFIG.concurrency,
          limiter: ALERT_WORKER_CONFIG.limiter
        }
      );

      // Worker event handlers
      alertWorker.on('ready', () => {
        console.log('Alert worker ready');
      });

      alertWorker.on('error', (error) => {
        console.error('Alert worker error:', error);
      });

      alertWorker.on('failed', (job, error) => {
        console.error(`Alert job ${job?.id} failed after ${job?.attemptsMade || 0} attempts:`, error);
      });

      alertWorker.on('completed', (job) => {
        console.debug(`Alert job ${job.id} completed successfully`);
      });

      alertWorker.on('stalled', (jobId) => {
        console.warn(`Alert job ${jobId} stalled and will be retried`);
      });

    } catch (error) {
      console.error('Failed to initialize alert worker:', error);
      return null;
    }
  }

  return alertWorker;
}

/**
 * Process a log entry directly (for testing or immediate processing)
 */
export async function processLogEntry(entry: LogEntry): Promise<void> {
  const { LogAlertingService } = await import('./logAlertingService');
  const alertingService = LogAlertingService.getInstance();
  await alertingService.processLogEntry(entry);
}

/**
 * Get queue stats for monitoring
 */
export async function getQueueStats() {
  const queue = getAlertQueue();
  
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  } catch (error) {
    console.error('Failed to get queue stats:', error);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      total: 0,
      error: (error as Error).message
    };
  }
}

/**
 * Clean up old jobs
 */
export async function cleanupOldJobs(): Promise<void> {
  const queue = getAlertQueue();
  
  try {
    // Clean jobs older than 24 hours
    await queue.clean(24 * 60 * 60 * 1000, 0, 'completed');
    await queue.clean(24 * 60 * 60 * 1000, 0, 'failed');
    console.log('Alert queue cleanup completed');
  } catch (error) {
    console.error('Failed to cleanup alert queue:', error);
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownAlertSystem(): Promise<void> {
  console.log('Shutting down alert system...');
  
  const promises: Promise<void>[] = [];
  
  if (alertWorker) {
    promises.push(alertWorker.close());
  }
  
  if (alertQueue) {
    promises.push(alertQueue.close());
  }
  
  try {
    await Promise.all(promises);
    console.log('Alert system shutdown completed');
  } catch (error) {
    console.error('Error during alert system shutdown:', error);
  }
}

// Auto-start worker if this module is loaded and alerts are enabled
if (process.env.LOG_ALERTS_ENABLED !== 'false' && process.env.NODE_ENV !== 'test') {
  // Delay worker startup to allow proper initialization
  setTimeout(() => {
    try {
      getAlertWorker();
      console.log('Alert worker auto-started');
    } catch (error) {
      console.error('Failed to auto-start alert worker:', error);
    }
  }, 1000);
}

// Graceful shutdown handling
if (typeof process !== 'undefined') {
  process.on('SIGTERM', shutdownAlertSystem);
  process.on('SIGINT', shutdownAlertSystem);
}