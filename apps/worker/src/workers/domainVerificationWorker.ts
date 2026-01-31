/**
 * Domain Verification Worker
 *
 * Periodically verifies DNS records for custom email domains.
 *
 * Processing Pattern:
 * 1. Scheduled job runs every 6 hours (batch mode)
 * 2. Query all domains that need verification
 * 3. Run DNS verification for each domain
 * 4. Update domain status based on results
 * 5. Mark domains as 'error' if DNS records are removed
 *
 * Part of easy-mode-email-plan.md (Phase 2A: Custom Domain - Manual DNS)
 */

import { Worker, Job } from 'bullmq';
import { getPool } from '../services/databaseWrapper';
import {
  DomainVerificationJobData,
  domainVerificationQueue
} from '../queue/modularQueues';
import {
  getInhouseDomainsService,
  InhouseDomainsService
} from '../services/inhouse/InhouseDomainsService';
import { logActivity } from '../services/inhouse/InhouseActivityLogger';

// =============================================================================
// Configuration
// =============================================================================

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// How often to run batch verification (in milliseconds)
const VERIFICATION_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Only verify domains that haven't been checked in this time
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

// Maximum domains to process in one batch
const BATCH_SIZE = 50;

// =============================================================================
// Worker Class
// =============================================================================

export class DomainVerificationWorker {
  private worker: Worker<DomainVerificationJobData> | null = null;

  constructor() {
    console.log('[DomainVerificationWorker] Initialized');
  }

  /**
   * Start the worker and schedule recurring verification
   */
  public async start(): Promise<void> {
    const pool = getPool();
    if (!pool) {
      console.error('[DomainVerificationWorker] Database not available - cannot start worker');
      return;
    }

    this.worker = new Worker<DomainVerificationJobData>(
      'domain-verification',
      async (job: Job<DomainVerificationJobData>) => {
        return this.processJob(job);
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: 1, // Process one batch at a time
      }
    );

    // Event handlers
    this.worker.on('completed', (job) => {
      console.log(`[DomainVerificationWorker] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[DomainVerificationWorker] Job ${job?.id} failed:`, error.message);
    });

    this.worker.on('error', (error) => {
      console.error('[DomainVerificationWorker] Worker error:', error);
    });

    // Schedule recurring batch verification
    await this.scheduleRecurringVerification();

    console.log('[DomainVerificationWorker] Started');
  }

  /**
   * Stop the worker
   */
  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[DomainVerificationWorker] Stopped');
    }
  }

  /**
   * Schedule recurring batch verification job
   */
  private async scheduleRecurringVerification(): Promise<void> {
    if (!domainVerificationQueue) {
      console.warn('[DomainVerificationWorker] Queue not available - cannot schedule recurring job');
      return;
    }

    try {
      // Remove existing repeatable job if present
      const repeatableJobs = await domainVerificationQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === 'batch-verification') {
          await domainVerificationQueue.removeRepeatableByKey(job.key);
        }
      }

      // Add new repeatable job (every 6 hours)
      await domainVerificationQueue.add(
        'batch-verification',
        { type: 'batch' },
        {
          repeat: {
            every: VERIFICATION_INTERVAL_MS,
          },
          jobId: 'domain-verification-batch',
        }
      );

      console.log(`[DomainVerificationWorker] Scheduled recurring verification every ${VERIFICATION_INTERVAL_MS / 3600000} hours`);
    } catch (error) {
      console.error('[DomainVerificationWorker] Failed to schedule recurring job:', error);
    }
  }

  /**
   * Process a single domain verification job
   */
  private async processJob(job: Job<DomainVerificationJobData>): Promise<{ verified: number; failed: number; skipped: number }> {
    const data = job.data;
    const startTime = Date.now();

    if (data.type === 'single' && data.domainId) {
      // Single domain verification
      return this.verifySingleDomain(data.domainId, data.projectId);
    } else {
      // Batch verification
      return this.verifyBatch();
    }
  }

  /**
   * Verify a single domain
   */
  private async verifySingleDomain(
    domainId: string,
    projectId?: string
  ): Promise<{ verified: number; failed: number; skipped: number }> {
    const pool = getPool();

    try {
      // Get domain info
      const result = await pool.query(
        `SELECT project_id, domain FROM inhouse_email_domains WHERE id = $1`,
        [domainId]
      );

      if (result.rows.length === 0) {
        console.log(`[DomainVerificationWorker] Domain ${domainId} not found`);
        return { verified: 0, failed: 0, skipped: 1 };
      }

      const actualProjectId = result.rows[0].project_id;
      const domainName = result.rows[0].domain;

      // Verify with project authorization
      if (projectId && projectId !== actualProjectId) {
        console.warn(`[DomainVerificationWorker] Project mismatch for domain ${domainId}`);
        return { verified: 0, failed: 0, skipped: 1 };
      }

      const domainsService = getInhouseDomainsService(actualProjectId);
      const verifyResult = await domainsService.verifyDomain(domainId);

      if (verifyResult.readyForSending) {
        console.log(`[DomainVerificationWorker] Domain ${domainName} verified successfully`);
        return { verified: 1, failed: 0, skipped: 0 };
      } else {
        console.log(`[DomainVerificationWorker] Domain ${domainName} not ready: missing DNS records`);
        return { verified: 0, failed: 1, skipped: 0 };
      }
    } catch (error) {
      console.error(`[DomainVerificationWorker] Failed to verify domain ${domainId}:`, error);
      return { verified: 0, failed: 1, skipped: 0 };
    }
  }

  /**
   * Batch verify all stale domains
   */
  private async verifyBatch(): Promise<{ verified: number; failed: number; skipped: number }> {
    const pool = getPool();
    const startTime = Date.now();
    const stats = { verified: 0, failed: 0, skipped: 0 };

    console.log('[DomainVerificationWorker] Starting batch verification');

    try {
      // Find domains that need verification:
      // 1. Status is 'pending' or 'verifying' (not yet fully verified)
      // 2. Status is 'verified' but hasn't been checked recently (detect DNS drift)
      // 3. Haven't been checked within the stale threshold
      const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

      const result = await pool.query(
        `SELECT id, project_id, domain, status
         FROM inhouse_email_domains
         WHERE (
           status IN ('pending', 'verifying')
           OR (status = 'verified' AND (last_checked_at IS NULL OR last_checked_at < $1))
         )
         ORDER BY
           CASE status
             WHEN 'verifying' THEN 1  -- Prioritize domains actively being verified
             WHEN 'pending' THEN 2    -- Then pending domains
             ELSE 3                   -- Finally, verified domains for drift check
           END,
           last_checked_at ASC NULLS FIRST
         LIMIT $2`,
        [staleTime, BATCH_SIZE]
      );

      const domains = result.rows;
      console.log(`[DomainVerificationWorker] Found ${domains.length} domains to verify`);

      // Process each domain
      for (const domain of domains) {
        try {
          const domainsService = getInhouseDomainsService(domain.project_id);
          const verifyResult = await domainsService.verifyDomain(domain.id);

          if (verifyResult.readyForSending) {
            stats.verified++;

            // Log status change if it was pending/verifying before
            if (domain.status !== 'verified') {
              logActivity({
                projectId: domain.project_id,
                service: 'domains',
                action: 'domain_verified',
                actorType: 'system',
                resourceType: 'email_domain',
                resourceId: domain.id,
                metadata: { domain: domain.domain },
              });
            }
          } else {
            stats.failed++;

            // If domain was verified but now fails, it's DNS drift
            if (domain.status === 'verified') {
              logActivity({
                projectId: domain.project_id,
                service: 'domains',
                action: 'dns_drift_detected',
                status: 'warning',
                actorType: 'system',
                resourceType: 'email_domain',
                resourceId: domain.id,
                metadata: {
                  domain: domain.domain,
                  previousStatus: 'verified',
                  newStatus: verifyResult.domain.status,
                },
              });
              console.warn(`[DomainVerificationWorker] DNS drift detected for ${domain.domain}`);
            }
          }

          // Small delay between verifications to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          stats.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[DomainVerificationWorker] Failed to verify ${domain.domain}:`, errorMessage);

          // Log error
          logActivity({
            projectId: domain.project_id,
            service: 'domains',
            action: 'verify_domain',
            status: 'error',
            actorType: 'system',
            resourceType: 'email_domain',
            resourceId: domain.id,
            errorCode: 'VERIFICATION_FAILED',
            metadata: {
              domain: domain.domain,
              error: errorMessage,
            },
          });
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[DomainVerificationWorker] Batch complete: ${stats.verified} verified, ${stats.failed} failed, ${stats.skipped} skipped (${duration}ms)`
      );

      return stats;
    } catch (error) {
      console.error('[DomainVerificationWorker] Batch verification failed:', error);
      throw error;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let workerInstance: DomainVerificationWorker | null = null;

/**
 * Initialize and start the domain verification worker
 */
export async function initializeDomainVerificationWorker(): Promise<DomainVerificationWorker> {
  if (!workerInstance) {
    workerInstance = new DomainVerificationWorker();
    await workerInstance.start();
  }
  return workerInstance;
}

/**
 * Shutdown the domain verification worker
 */
export async function shutdownDomainVerificationWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop();
    workerInstance = null;
  }
}

/**
 * Queue a single domain for verification
 */
export async function queueDomainVerification(domainId: string, projectId?: string): Promise<void> {
  if (!domainVerificationQueue) {
    console.warn('[DomainVerificationWorker] Queue not available');
    return;
  }

  await domainVerificationQueue.add(
    'single-verification',
    {
      type: 'single',
      domainId,
      projectId,
    },
    {
      jobId: `verify-${domainId}-${Date.now()}`,
    }
  );
}
