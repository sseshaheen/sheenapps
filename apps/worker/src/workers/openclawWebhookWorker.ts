/**
 * OpenClaw Webhook Worker
 *
 * Processes OpenClaw gateway webhook events for the AI Assistant feature.
 *
 * Processing Pattern:
 * 1. Webhook received → Fast 202 response → Event queued
 * 2. Worker picks up event → Process by event type
 * 3. Track metrics, create leads, update channel status
 *
 * Part of SHEENAPPS_OPENCLAW_ANALYSIS.md Phase: Processing Pipeline
 */

import { Worker, Job } from 'bullmq';
import { getPool } from '../services/databaseWrapper';
import { OpenClawWebhookJobData, OpenClawEventType } from '../queue/modularQueues';
import { ServerLoggingService } from '../services/serverLoggingService';

// =============================================================================
// Configuration
// =============================================================================

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

/** Worker concurrency - number of events processed simultaneously */
const WORKER_CONCURRENCY = 10;

// =============================================================================
// Types
// =============================================================================

interface ProcessingResult {
  success: boolean;
  action: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Worker Class
// =============================================================================

export class OpenClawWebhookWorker {
  private worker: Worker<OpenClawWebhookJobData> | null = null;
  private logger: ServerLoggingService;

  constructor() {
    this.logger = ServerLoggingService.getInstance();
    this.logger.logServerEvent('capacity', 'info', 'OpenClawWebhookWorker initialized', {})
      .catch(() => { /* non-critical */ });
  }

  /**
   * Start the worker
   */
  public start(): void {
    const pool = getPool();
    if (!pool) {
      this.logger.logServerEvent('error', 'error', 'OpenClawWebhookWorker cannot start - database not available', {})
        .catch(() => { /* non-critical */ });
      return;
    }

    this.worker = new Worker<OpenClawWebhookJobData>(
      'openclaw-webhooks',
      async (job: Job<OpenClawWebhookJobData>) => {
        return this.processJob(job);
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: WORKER_CONCURRENCY,
      }
    );

    // Event handlers
    this.worker.on('completed', (job, result: ProcessingResult) => {
      this.logger.logServerEvent('capacity', 'info', 'OpenClaw job completed', {
        jobId: job.id,
        action: result.action,
        projectId: job.data.projectId,
        event: job.data.event
      }).catch(() => { /* non-critical */ });
    });

    this.worker.on('failed', (job, error) => {
      this.logger.logServerEvent('error', 'error', 'OpenClaw job failed', {
        jobId: job?.id,
        projectId: job?.data?.projectId,
        event: job?.data?.event,
        error: error.message
      }).catch(() => { /* non-critical */ });
    });

    this.worker.on('error', (error) => {
      this.logger.logServerEvent('error', 'error', 'OpenClawWebhookWorker error', {
        error: error.message
      }).catch(() => { /* non-critical */ });
    });

    this.logger.logServerEvent('capacity', 'info', 'OpenClawWebhookWorker started', {
      concurrency: WORKER_CONCURRENCY
    }).catch(() => { /* non-critical */ });
  }

  /**
   * Stop the worker
   */
  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      await this.logger.logServerEvent('capacity', 'info', 'OpenClawWebhookWorker stopped', {})
        .catch(() => { /* non-critical */ });
    }
  }

  /**
   * Process a single OpenClaw webhook job
   */
  private async processJob(job: Job<OpenClawWebhookJobData>): Promise<ProcessingResult> {
    const data = job.data;
    const startTime = Date.now();

    try {
      // Route to appropriate handler based on event type
      let result: ProcessingResult;

      switch (data.event) {
        case 'message.received':
        case 'message.sent':
          result = await this.handleMessageEvent(data);
          break;

        case 'tool.called':
        case 'tool.completed':
          result = await this.handleToolEvent(data);
          break;

        case 'lead.created':
          result = await this.handleLeadCreated(data);
          break;

        case 'channel.connected':
        case 'channel.disconnected':
          result = await this.handleChannelStatusChange(data);
          break;

        case 'session.started':
        case 'session.ended':
          result = await this.handleSessionEvent(data);
          break;

        case 'error.occurred':
          result = await this.handleError(data);
          break;

        default:
          result = {
            success: true,
            action: 'ignored',
            details: { reason: 'Unknown event type' }
          };
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Log to server logging
      await this.logger.logServerEvent(
        'error',
        'error',
        `OpenClaw webhook processing failed: ${data.event}`,
        {
          projectId: data.projectId,
          gatewayId: data.gatewayId,
          event: data.event,
          deliveryId: data.deliveryId,
          error: (error as Error).message,
          durationMs
        }
      );

      throw error;
    }
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  /**
   * Handle message events - track usage for billing
   */
  private async handleMessageEvent(data: OpenClawWebhookJobData): Promise<ProcessingResult> {
    const pool = getPool();
    if (!pool) return { success: false, action: 'skipped_no_db' };

    const isReceived = data.event === 'message.received';
    const promptTokens = data.data.promptTokens || 0;
    const completionTokens = data.data.completionTokens || 0;

    const client = await pool.connect();
    try {
      // Upsert usage record for current billing period
      // Use SQL date_trunc for UTC-safe billing period boundaries
      await client.query(`
        INSERT INTO openclaw_usage (
          project_id,
          billing_period_start,
          billing_period_end,
          messages_received,
          messages_sent,
          prompt_tokens,
          completion_tokens,
          channel_usage
        ) VALUES (
          $1,
          date_trunc('month', now() AT TIME ZONE 'UTC')::date,
          (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month - 1 day')::date,
          $2, $3,
          $4, $5,
          jsonb_build_object($6, jsonb_build_object('messages', 1, 'tokens', $4 + $5))
        )
        ON CONFLICT (project_id, billing_period_start)
        DO UPDATE SET
          messages_received = openclaw_usage.messages_received + $2,
          messages_sent = openclaw_usage.messages_sent + $3,
          prompt_tokens = openclaw_usage.prompt_tokens + $4,
          completion_tokens = openclaw_usage.completion_tokens + $5,
          channel_usage = openclaw_usage.channel_usage ||
            jsonb_build_object($6::text,
              COALESCE(openclaw_usage.channel_usage -> ($6::text), '{}'::jsonb) ||
              jsonb_build_object(
                'messages', COALESCE((openclaw_usage.channel_usage -> ($6::text) ->>'messages')::int, 0) + 1,
                'tokens', COALESCE((openclaw_usage.channel_usage -> ($6::text) ->>'tokens')::int, 0) + $4 + $5
              )
            ),
          updated_at = NOW()
      `, [
        data.projectId,
        isReceived ? 1 : 0,
        isReceived ? 0 : 1,
        promptTokens,
        completionTokens,
        data.data.channel || 'unknown'
      ]);

      // Also track in daily metrics for dashboard
      await this.trackDailyMetric(data.projectId, data.event, {
        channel: data.data.channel,
        sessionId: data.data.sessionId,
        promptTokens,
        completionTokens
      });

      // Log event for audit trail
      await this.logEvent(data);

      return {
        success: true,
        action: 'usage_tracked',
        details: {
          isReceived,
          channel: data.data.channel,
          promptTokens,
          completionTokens
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Handle tool call events - track for metrics and billing
   */
  private async handleToolEvent(data: OpenClawWebhookJobData): Promise<ProcessingResult> {
    const pool = getPool();
    if (!pool) return { success: false, action: 'skipped_no_db' };

    const isCompleted = data.event === 'tool.completed';
    const toolName = data.data.toolName || 'unknown';

    // Track in daily metrics
    await this.trackDailyMetric(data.projectId, data.event, {
      toolName,
      success: isCompleted,
      channel: data.data.channel,
      sessionId: data.data.sessionId
    });

    // Log event
    await this.logEvent(data);

    return {
      success: true,
      action: 'tool_tracked',
      details: {
        toolName,
        isCompleted
      }
    };
  }

  /**
   * Handle lead creation - create lead in project's lead table
   */
  private async handleLeadCreated(data: OpenClawWebhookJobData): Promise<ProcessingResult> {
    const pool = getPool();
    if (!pool) return { success: false, action: 'skipped_no_db' };

    const lead = data.data.lead;
    if (!lead) {
      return { success: false, action: 'no_lead_data' };
    }

    const client = await pool.connect();
    try {
      // Insert lead into project's leads table (Easy Mode projects have this)
      // Note: This uses the generic leads table pattern from Easy Mode
      const result = await client.query(`
        INSERT INTO leads (
          project_id,
          name,
          phone,
          email,
          source,
          notes,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (project_id, phone) WHERE phone IS NOT NULL
        DO UPDATE SET
          name = COALESCE(EXCLUDED.name, leads.name),
          email = COALESCE(EXCLUDED.email, leads.email),
          notes = COALESCE(leads.notes, '') || E'\\n' || COALESCE(EXCLUDED.notes, ''),
          updated_at = NOW()
        RETURNING id
      `, [
        data.projectId,
        lead.name || null,
        lead.phone || null,
        lead.email || null,
        lead.source || `openclaw:${data.data.channel || 'unknown'}`,
        lead.notes || null,
        JSON.stringify({
          capturedBy: 'openclaw',
          gatewayId: data.gatewayId,
          channel: data.data.channel,
          sessionId: data.data.sessionId,
          timestamp: data.timestamp
        })
      ]);

      const leadId = result.rows[0]?.id;

      // Track metric
      await this.trackDailyMetric(data.projectId, 'lead.created', {
        channel: data.data.channel,
        leadId
      });

      // Log event
      await this.logEvent(data);

      return {
        success: true,
        action: 'lead_created',
        details: {
          leadId,
          phone: lead.phone,
          channel: data.data.channel
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Handle channel status changes - update project's channel status
   */
  private async handleChannelStatusChange(data: OpenClawWebhookJobData): Promise<ProcessingResult> {
    const pool = getPool();
    if (!pool) return { success: false, action: 'skipped_no_db' };

    const isConnected = data.event === 'channel.connected';
    const channel = data.data.channel;

    if (!channel) {
      return { success: false, action: 'no_channel_specified' };
    }

    const client = await pool.connect();
    try {
      // Upsert channel status
      await client.query(`
        INSERT INTO openclaw_channel_status (
          project_id,
          channel,
          status,
          gateway_id,
          connected_at,
          last_activity_at,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5, NOW(), $6
        )
        ON CONFLICT (project_id, channel)
        DO UPDATE SET
          status = $3,
          gateway_id = $4,
          connected_at = CASE WHEN $3 = 'connected' THEN $5 ELSE openclaw_channel_status.connected_at END,
          disconnected_at = CASE WHEN $3 = 'disconnected' THEN NOW() ELSE NULL END,
          last_activity_at = NOW(),
          metadata = $6,
          updated_at = NOW()
      `, [
        data.projectId,
        channel,
        isConnected ? 'connected' : 'disconnected',
        data.gatewayId,
        isConnected ? new Date() : null,
        JSON.stringify({
          event: data.event,
          timestamp: data.timestamp,
          errorCode: data.data.errorCode,
          errorMessage: data.data.errorMessage
        })
      ]);

      // Track metric
      await this.trackDailyMetric(data.projectId, data.event, {
        channel,
        isConnected
      });

      // Log event
      await this.logEvent(data);

      // If disconnected, log a warning for alerting
      if (!isConnected) {
        await this.logger.logServerEvent(
          'error',
          'warn',
          `OpenClaw channel disconnected: ${channel}`,
          {
            projectId: data.projectId,
            gatewayId: data.gatewayId,
            channel,
            errorCode: data.data.errorCode,
            errorMessage: data.data.errorMessage
          }
        );
      }

      return {
        success: true,
        action: 'channel_status_updated',
        details: {
          channel,
          status: isConnected ? 'connected' : 'disconnected'
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Handle session events - track for analytics
   */
  private async handleSessionEvent(data: OpenClawWebhookJobData): Promise<ProcessingResult> {
    // Track metric
    await this.trackDailyMetric(data.projectId, data.event, {
      channel: data.data.channel,
      sessionId: data.data.sessionId,
      senderId: data.data.senderId
    });

    // Log event
    await this.logEvent(data);

    return {
      success: true,
      action: 'session_tracked',
      details: {
        sessionId: data.data.sessionId,
        isStarted: data.event === 'session.started'
      }
    };
  }

  /**
   * Handle error events - log for monitoring and alerting
   */
  private async handleError(data: OpenClawWebhookJobData): Promise<ProcessingResult> {
    // Track metric
    await this.trackDailyMetric(data.projectId, 'error.occurred', {
      errorCode: data.data.errorCode,
      channel: data.data.channel,
      sessionId: data.data.sessionId
    });

    // Log to server logging for alerting
    await this.logger.logServerEvent(
      'error',
      'error',
      `OpenClaw error: ${data.data.errorCode || 'unknown'}`,
      {
        projectId: data.projectId,
        gatewayId: data.gatewayId,
        errorCode: data.data.errorCode,
        errorMessage: data.data.errorMessage,
        channel: data.data.channel,
        sessionId: data.data.sessionId
      }
    );

    // Log event
    await this.logEvent(data);

    return {
      success: true,
      action: 'error_logged',
      details: {
        errorCode: data.data.errorCode,
        errorMessage: data.data.errorMessage
      }
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Scrub sensitive data from event payload before storing
   * Removes message content and other PII fields
   */
  private scrubEventData(data: Record<string, unknown>): Record<string, unknown> {
    const scrubbed = { ...data };

    // Remove message content (PII/sensitive)
    if ('content' in scrubbed) {
      scrubbed.content = '[scrubbed]';
    }

    // Remove sender name (PII)
    if ('senderName' in scrubbed) {
      scrubbed.senderName = '[scrubbed]';
    }

    // Keep: channel, sessionId, senderId (anonymized identifiers), toolName, tokens
    // These are needed for analytics but aren't sensitive content

    return scrubbed;
  }

  /**
   * Track daily metric for dashboard
   */
  private async trackDailyMetric(
    projectId: string,
    event: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const pool = getPool();
    if (!pool) return;

    try {
      await pool.query(`
        INSERT INTO openclaw_daily_metrics (
          project_id,
          metric_date,
          event_type,
          count,
          metadata
        ) VALUES (
          $1, CURRENT_DATE, $2, 1, $3::jsonb
        )
        ON CONFLICT (project_id, metric_date, event_type)
        DO UPDATE SET
          count = openclaw_daily_metrics.count + 1,
          updated_at = NOW()
      `, [projectId, event, JSON.stringify(metadata)]);
    } catch (error) {
      // Non-critical - log but don't throw
      this.logger.logServerEvent('error', 'warn', 'Failed to track OpenClaw metric', {
        projectId,
        event,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });
    }
  }

  /**
   * Log event to audit trail
   * Uses ON CONFLICT DO NOTHING for idempotency (retries won't duplicate)
   */
  private async logEvent(data: OpenClawWebhookJobData): Promise<void> {
    const pool = getPool();
    if (!pool) return;

    // Scrub sensitive data from event_data before storing
    const scrubbedData = this.scrubEventData(data.data);

    try {
      await pool.query(`
        INSERT INTO openclaw_event_log (
          project_id,
          gateway_id,
          delivery_id,
          event_type,
          channel,
          session_id,
          sender_id,
          event_data,
          event_timestamp
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (delivery_id) DO NOTHING
      `, [
        data.projectId,
        data.gatewayId,
        data.deliveryId,
        data.event,
        data.data.channel || null,
        data.data.sessionId || null,
        data.data.senderId || null,
        JSON.stringify(scrubbedData),
        new Date(data.timestamp)
      ]);
    } catch (error) {
      // Non-critical - log but don't throw
      this.logger.logServerEvent('error', 'warn', 'Failed to log OpenClaw event', {
        projectId: data.projectId,
        event: data.event,
        deliveryId: data.deliveryId,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let workerInstance: OpenClawWebhookWorker | null = null;

/**
 * Get or create the OpenClaw webhook worker instance
 */
export function getOpenClawWebhookWorker(): OpenClawWebhookWorker {
  if (!workerInstance) {
    workerInstance = new OpenClawWebhookWorker();
  }
  return workerInstance;
}

/**
 * Start the OpenClaw webhook worker
 */
export function startOpenClawWebhookWorker(): void {
  const worker = getOpenClawWebhookWorker();
  worker.start();
}

/**
 * Stop the OpenClaw webhook worker
 */
export async function stopOpenClawWebhookWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop();
    workerInstance = null;
  }
}
