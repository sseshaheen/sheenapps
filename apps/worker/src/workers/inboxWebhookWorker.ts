/**
 * Inbox Webhook Worker
 *
 * Processes inbound email webhooks from Resend.
 *
 * Processing Pattern:
 * 1. Webhook received → Fast 200 OK response → Event queued
 * 2. Worker picks up event → Spam filter → Store in database
 * 3. After storage: fire-and-forget metering + post-receive actions (auto-reply, forwarding)
 *
 * Part of easy-mode-email-plan.md (Level 0: SheenApps Inbox)
 */

import { Worker, Job } from 'bullmq';
import { getPool } from '../services/databaseWrapper';
import { InboxWebhookJobData } from '../queue/modularQueues';
import { getInhouseInboxService } from '../services/inhouse/InhouseInboxService';
import { logActivity } from '../services/inhouse/InhouseActivityLogger';
import { checkSpam } from '../services/inhouse/InboxSpamFilter';
import { getInhouseMeteringService } from '../services/inhouse/InhouseMeteringService';
import { executePostReceiveActions } from '../services/inhouse/InboxPostReceiveActions';

// =============================================================================
// Configuration
// =============================================================================

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// Maximum attachment size to store (5MB)
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

// =============================================================================
// Worker Class
// =============================================================================

export class InboxWebhookWorker {
  private worker: Worker<InboxWebhookJobData> | null = null;

  constructor() {
    console.log('[InboxWebhookWorker] Initialized');
  }

  /**
   * Start the worker
   */
  public start(): void {
    const pool = getPool();
    if (!pool) {
      console.error('[InboxWebhookWorker] Database not available - cannot start worker');
      return;
    }

    this.worker = new Worker<InboxWebhookJobData>(
      'inbox-webhooks',
      async (job: Job<InboxWebhookJobData>) => {
        return this.processJob(job);
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: 5, // Process up to 5 emails simultaneously
      }
    );

    // Event handlers
    this.worker.on('completed', (job) => {
      console.log(`[InboxWebhookWorker] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[InboxWebhookWorker] Job ${job?.id} failed:`, error.message);
    });

    this.worker.on('error', (error) => {
      console.error('[InboxWebhookWorker] Worker error:', error);
    });

    console.log('[InboxWebhookWorker] Started');
  }

  /**
   * Stop the worker
   */
  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[InboxWebhookWorker] Stopped');
    }
  }

  /**
   * Process a single inbox webhook job
   */
  private async processJob(job: Job<InboxWebhookJobData>): Promise<void> {
    const data = job.data;
    const startTime = Date.now();

    console.log(`[InboxWebhookWorker] Processing email ${data.providerId} for project ${data.projectId}`);

    try {
      const inboxService = getInhouseInboxService(data.projectId);

      // --- Phase 1: Pre-storage spam filter ---
      // Get inbox config for spam filter configuration (auto-create if missing)
      let inboxConfig = await inboxService.getConfig();
      if (!inboxConfig) {
        try {
          inboxConfig = await inboxService.createConfig();
          console.log(`[InboxWebhookWorker] Auto-created inbox config for project ${data.projectId}`);
        } catch (err: any) {
          // Race condition: another email already triggered creation
          if (err?.code === '23505') {
            inboxConfig = await inboxService.getConfig();
          } else {
            console.error(`[InboxWebhookWorker] Failed to auto-create inbox config:`, err);
          }
        }
      }
      const metadata: Record<string, unknown> = {};

      const spamResult = await checkSpam(
        inboxConfig?.inboxId ?? data.projectId,
        data.fromEmail,
        // Pass per-project config if available (blockedDomains from inbox config)
      );

      if (spamResult.isSpam) {
        metadata.spam = true;
        metadata.spamReason = spamResult.reason;
        console.log(`[InboxWebhookWorker] Spam detected for ${data.providerId}: ${spamResult.reason}`);
      }

      // --- Phase 2: Process attachments and store message ---
      const attachments = data.attachments?.map(att => {
        const storageKey = att.sizeBytes <= MAX_ATTACHMENT_SIZE && att.content
          ? null // TODO: Upload to S3 and get storage key
          : null;

        return {
          filename: att.filename,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          contentId: att.contentId,
          storageKey,
        };
      }) || [];

      // Generate snippet from text body
      const snippet = data.textBody
        ? data.textBody.slice(0, 200).trim() + (data.textBody.length > 200 ? '...' : '')
        : undefined;

      // Call the service to receive the message (with metadata)
      const result = await inboxService.receiveMessage({
        providerId: data.providerId,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        toEmail: data.toEmail,
        replyTo: data.replyTo,
        subject: data.subject,
        textBody: data.textBody,
        htmlBody: data.htmlBody,
        snippet,
        messageId: data.messageId,
        inReplyTo: data.inReplyTo,
        references: data.references,
        rawHeaders: data.rawHeaders,
        attachments,
        metadata,
        isSpam: spamResult.isSpam,
      });

      const duration = Date.now() - startTime;

      if (result.status === 'duplicate') {
        console.log(`[InboxWebhookWorker] Duplicate email ${data.providerId} (${duration}ms)`);
        return;
      }

      // --- Phase 3: Fire-and-forget post-storage actions ---

      // Metering: track inbound message usage (fire-and-forget)
      try {
        const meteringService = getInhouseMeteringService();
        await meteringService.trackProjectUsage(data.projectId, 'inbound_messages', 1);
      } catch (error) {
        console.error(`[InboxWebhookWorker] Metering failed for ${data.providerId}:`, error);
        // Don't fail the job - metering is fire-and-forget
      }

      // Post-receive actions: auto-reply + forwarding (fire-and-forget, skip for spam)
      if (!spamResult.isSpam && inboxConfig) {
        executePostReceiveActions({
          projectId: data.projectId,
          messageId: result.messageId,
          threadId: result.threadId,
          fromEmail: data.fromEmail,
          fromName: data.fromName,
          toEmail: data.toEmail,
          subject: data.subject,
          textBody: data.textBody,
          emailMessageId: data.messageId,
          references: data.references,
          inboxConfig,
        }).catch((error) => {
          console.error(`[InboxWebhookWorker] Post-receive actions failed for ${data.providerId}:`, error);
        });
      }

      // Log activity (fire-and-forget)
      logActivity({
        projectId: data.projectId,
        service: 'inbox',
        action: 'receive_message',
        actorType: 'system',
        resourceType: 'inbox_message',
        resourceId: result.messageId,
        metadata: {
          fromEmail: data.fromEmail,
          subject: data.subject,
          threadId: result.threadId,
          attachmentCount: attachments.length,
          processingTimeMs: duration,
          isSpam: spamResult.isSpam,
        },
      });

      console.log(`[InboxWebhookWorker] Processed email ${data.providerId} → message ${result.messageId}${spamResult.isSpam ? ' [SPAM]' : ''} (${duration}ms)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[InboxWebhookWorker] Failed to process email ${data.providerId}:`, errorMessage);

      // Log error activity
      logActivity({
        projectId: data.projectId,
        service: 'inbox',
        action: 'receive_message',
        status: 'error',
        actorType: 'system',
        resourceType: 'inbox_message',
        errorCode: 'PROCESSING_FAILED',
        metadata: {
          providerId: data.providerId,
          fromEmail: data.fromEmail,
          error: errorMessage,
        },
      });

      // Re-throw to trigger retry
      throw error;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let workerInstance: InboxWebhookWorker | null = null;

/**
 * Initialize and start the inbox webhook worker
 */
export function initializeInboxWebhookWorker(): InboxWebhookWorker {
  if (!workerInstance) {
    workerInstance = new InboxWebhookWorker();
    workerInstance.start();
  }
  return workerInstance;
}

/**
 * Shutdown the inbox webhook worker
 */
export async function shutdownInboxWebhookWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop();
    workerInstance = null;
  }
}
