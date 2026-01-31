import { Worker, Job } from 'bullmq';
import { ChatMessageJobData, redisConnection } from '../queue/modularQueues';
import { ChatPlanService } from '../services/chatPlanService';
import { EnhancedChatService } from '../services/enhancedChatService';
import { ChatBroadcastService } from '../services/chatBroadcastService';
import { WebhookService } from '../services/webhookService';
import { pool } from '../services/database';
import { initiateBuild } from '../services/buildInitiationService';
import crypto from 'crypto';

/**
 * ChatMessageProcessor - Processes user messages with Claude
 *
 * CRITICAL: Single instance shared across all jobs to avoid resource waste
 */
class ChatMessageProcessor {
  private chatPlanService: ChatPlanService;
  private chatService: EnhancedChatService;
  private broadcastService: ChatBroadcastService;

  constructor() {
    const webhookService = new WebhookService();
    this.chatPlanService = new ChatPlanService(webhookService);
    this.chatService = new EnhancedChatService();
    this.broadcastService = ChatBroadcastService.getInstance();
  }

  async processMessage(job: Job<ChatMessageJobData>): Promise<void> {
    const { projectId, userId, messageId, client_msg_id, mode, text, locale, intent, sessionContext } = job.data;

    console.log('[ChatWorker] Processing message:', {
      projectId,
      userId,
      messageId,
      client_msg_id,
      mode,
      intent
    });

    // CRITICAL: Only process client messages (guard against accidental enqueue of assistant/system messages)
    // This check should never trigger if enqueue logic is correct, but defensive programming
    if (!pool) {
      throw new Error('Database not available');
    }

    const messageCheck = await pool.query(
      'SELECT actor_type FROM project_chat_log_minimal WHERE id = $1',
      [messageId]
    );

    if (messageCheck.rows.length === 0) {
      throw new Error(`Message ${messageId} not found`);
    }

    if (messageCheck.rows[0].actor_type !== 'client') {
      console.warn('[ChatWorker] Skipping non-client message:', messageCheck.rows[0].actor_type);
      return; // Don't process assistant/system messages
    }

    // Step 1: Check if this message was already processed (idempotency)
    // Use messageId (not client_msg_id) as it's guaranteed unique
    const existingResponse = await this.checkForExistingResponse(projectId, messageId);
    if (existingResponse) {
      console.log('[ChatWorker] Message already processed, skipping:', messageId);
      return;
    }

    // Step 2: Call Claude to generate response
    let response;
    try {
      response = await this.chatPlanService.processChatPlan({
        userId,
        projectId,
        message: text,
        ...(locale && { locale }),
        ...(sessionContext?.sessionId && { buildSessionId: sessionContext.sessionId })
      });

      console.log('[ChatWorker] Claude response received:', {
        type: response.type,
        mode: response.mode
      });
    } catch (error) {
      console.error('[ChatWorker] Claude API error:', error);

      // Save error message so user knows something went wrong
      await this.saveAssistantMessage({
        projectId,
        userId,
        mode,
        text: `Sorry, I encountered an error processing your message. Please try again.`,
        response_data: { error: error instanceof Error ? error.message : 'Unknown error' },
        parent_message_id: messageId,
        ...(locale && { locale })
      });

      throw error; // Re-throw so BullMQ can retry
    }

    // Step 3: Save assistant response to DB (using direct INSERT for consistency)
    const responseText = this.extractResponseText(response);
    const assistantMessage = await this.saveAssistantMessage({
      projectId,
      userId,
      mode,
      text: responseText,
      response_data: response,
      parent_message_id: messageId,
      ...(locale && { locale })
    });

    console.log('[ChatWorker] Assistant message saved:', {
      assistantMessageId: assistantMessage.id,
      seq: assistantMessage.seq
    });

    // CRITICAL: Explicitly broadcast assistant message (don't assume sendMessage does it in worker context)
    await this.broadcastAssistantMessage(projectId, assistantMessage, responseText, response);

    // Step 4: Check if build should start
    // Use structured intent field for deterministic behavior
    const shouldBuild = this.shouldStartBuild(response, mode, intent);

    if (shouldBuild) {
      console.log('[ChatWorker] Starting build based on response');

      // Check if ChatPlanService already triggered a build
      const buildAlreadyTriggered = response.metadata?.projectContext?.buildId;

      if (!buildAlreadyTriggered) {
        // Trigger build with idempotent operationId
        // CRITICAL: initiateBuild() must enforce idempotency server-side (INSERT ... ON CONFLICT)
        await initiateBuild({
          projectId,
          userId,
          prompt: text,
          metadata: {
            source: 'chat-worker',
            convertedFromPlan: mode === 'plan',
            chatMessageId: messageId,
            assistantMessageId: assistantMessage.id,
            operationId: `chat-${messageId}` // Server must enforce uniqueness
          }
        });
      } else {
        console.log('[ChatWorker] Build already triggered by ChatPlanService:', buildAlreadyTriggered);
      }
    }

    console.log('[ChatWorker] Message processed successfully');
  }

  /**
   * Check if assistant reply exists for this message
   * Uses messageId (not client_msg_id) for robustness
   */
  private async checkForExistingResponse(projectId: string, messageId: string): Promise<boolean> {
    if (!pool) return false;

    const { rows } = await pool.query(`
      SELECT 1
      FROM project_chat_log_minimal
      WHERE project_id = $1
        AND actor_type = 'assistant'
        AND parent_message_id = $2
      LIMIT 1
    `, [projectId, messageId]);

    return rows.length > 0;
  }

  /**
   * Save assistant message with response_data in a single INSERT
   *
   * CRITICAL: Don't use EnhancedChatService.sendMessage() because it doesn't
   * support response_data, and wrapping it in a transaction is fake (it uses
   * pool.query() internally, not the transaction client).
   *
   * Instead, do a direct INSERT that includes response_data, matching the exact
   * column set that sendMessage() uses (to preserve all invariants).
   *
   * 🚨 EXPERT VALIDATION (Round 12): Handles migration 105 constraint gracefully
   * Migration 105 enforces: one assistant reply per (project_id, parent_message_id)
   * Under concurrency, both workers might INSERT → one gets 23505 unique violation
   * We catch 23505, verify constraint name, re-select existing reply, return it
   * This prevents "fixing duplicates by throwing 500s" under load ✅
   */
  private async saveAssistantMessage(data: {
    projectId: string;
    userId: string;
    mode: string;
    text: string;
    response_data: any;
    parent_message_id: string;
    locale?: string;
  }): Promise<any> {
    if (!pool) {
      throw new Error('Database not available');
    }

    // Generate client_msg_id for assistant (for SSE broadcast)
    const client_msg_id = crypto.randomUUID();

    try {
      // CRITICAL: Literally copy the exact INSERT from EnhancedChatService.sendMessage()
      // Plus response_data (which sendMessage() doesn't support)
      //
      // VERIFIED against actual schema and sendMessage() implementation:
      // - All other columns are NULLABLE or have defaults
      // - seq is auto-generated by trigger (confirmed by RETURNING pattern)
      // - message_type = 'assistant' when actor_type = 'assistant'
      //
      // Columns used by sendMessage():
      // project_id, user_id, client_msg_id, message_text, message_type,
      // actor_type, mode, parent_message_id, created_at
      const insertQuery = `
        INSERT INTO project_chat_log_minimal
        (project_id, user_id, client_msg_id, message_text, message_type,
         actor_type, mode, parent_message_id, response_data, created_at)
        VALUES ($1, $2, $3, $4, 'assistant', 'assistant', $5, $6, $7::jsonb, NOW())
        RETURNING id, seq, created_at
      `;

      const insertResult = await pool.query(insertQuery, [
        data.projectId,
        data.userId,
        client_msg_id,
        data.text,
        data.mode,
        data.parent_message_id,
        data.response_data  // Pass object directly, cast by ::jsonb
      ]);

      const newMessage = insertResult.rows[0];

      return {
        id: newMessage.id,
        seq: newMessage.seq,
        client_msg_id,
        timestamp: newMessage.created_at
      };
    } catch (error) {
      // CRITICAL: Handle unique constraint violation gracefully (concurrency race)
      // Two workers can both check "no reply exists" and both try to INSERT
      // One succeeds, one gets 23505 (unique_violation on parent_message_id)
      if ((error as any).code === '23505') {
        const constraint = (error as any).constraint;

        // 🚨 EXPERT FIX (Round 9): Only treat uq_assistant_parent_reply as idempotent
        // Other constraints (uniq_client_msg, future constraints) are real errors
        if (constraint === 'uq_assistant_parent_reply') {
          // Unique constraint violated - assistant reply already exists
          // This is IDEMPOTENT SUCCESS, not an error!
          console.log('[ChatWorker] Assistant message already exists (concurrent insert):', {
            projectId: data.projectId,
            parent_message_id: data.parent_message_id,
            constraint
          });

          // Fetch the existing assistant message and return it
          const existingResult = await pool.query(
            `SELECT id, seq, client_msg_id, created_at
             FROM project_chat_log_minimal
             WHERE project_id = $1
               AND actor_type = 'assistant'
               AND parent_message_id = $2
             LIMIT 1`,
            [data.projectId, data.parent_message_id]
          );

          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            console.log('[ChatWorker] Returning existing assistant message:', existing.id);
            return {
              id: existing.id,
              seq: existing.seq,
              client_msg_id: existing.client_msg_id,
              timestamp: existing.created_at
            };
          }

          // If we can't find it (race condition?), re-throw
          throw new Error('Assistant message constraint violated but not found - race condition');
        } else {
          // Different constraint violation (e.g., client_msg_id, future constraints)
          console.error('[ChatWorker] Unexpected constraint violation:', {
            constraint,
            projectId: data.projectId,
            error: error instanceof Error ? error.message : 'Unknown'
          });
          throw error; // This is a real error, not idempotent
        }
      }

      // Other errors: re-throw
      console.error('[ChatWorker] Error saving assistant message:', error);
      throw error;
    }
  }

  /**
   * Explicitly broadcast assistant message to SSE subscribers
   * CRITICAL: Map DB row to exact broadcast contract (don't send response_data - too large!)
   * CRITICAL: Don't let broadcast failures crash the worker - broadcast is best-effort
   */
  private async broadcastAssistantMessage(
    projectId: string,
    assistantMessage: any,
    text: string,
    response_data: any
  ): Promise<void> {
    try {
      // Fetch the full DB row to get all fields (including seq, created_at)
      if (!pool) {
        console.warn('[ChatWorker] Cannot broadcast - database not available');
        return;
      }

      const { rows } = await pool.query(
        'SELECT * FROM project_chat_log_minimal WHERE id = $1',
        [assistantMessage.id]
      );

      if (rows.length === 0) {
        console.error('[ChatWorker] Assistant message not found for broadcast:', assistantMessage.id);
        return;
      }

      const dbRow = rows[0];

      // 🚨 EXPERT FIX (Round 9): Extract minimal metadata from response_data, don't send full blob
      // Full response_data can be 50KB+ (bloats Redis pub/sub + SSE frames)
      const responseMetadata = dbRow.response_data ? {
        type: dbRow.response_data.type,
        mode: dbRow.response_data.mode,
        buildId: dbRow.response_data.buildId || dbRow.response_data.metadata?.buildId,
        hasRecommendations: Array.isArray(dbRow.response_data.recommendations) && dbRow.response_data.recommendations.length > 0
      } : undefined;

      // CRITICAL: Map DB columns to broadcast contract shape
      // ChatBroadcastService.broadcastMessage() expects minimal fields for SSE
      //
      // IMPORTANT: Type conversions required:
      // - created_at (Date from pg) → created_at (ISO string)
      await this.broadcastService.broadcastMessage(projectId, {
        id: dbRow.id,
        seq: dbRow.seq,
        client_msg_id: dbRow.client_msg_id,
        user_id: dbRow.user_id,
        message_text: dbRow.message_text,
        message_type: dbRow.message_type,
        mode: dbRow.mode,
        actor_type: dbRow.actor_type,
        created_at: dbRow.created_at instanceof Date
          ? dbRow.created_at.toISOString()
          : dbRow.created_at,
        build_id: dbRow.build_id,
        response_data: responseMetadata // Only minimal metadata, not full blob
      });

      console.log('[ChatWorker] Assistant message broadcasted:', {
        id: assistantMessage.id,
        seq: assistantMessage.seq
      });
    } catch (error) {
      // CRITICAL: Broadcast is BEST-EFFORT - don't fail the whole job if it fails
      // The message is already saved to DB (source of truth)
      // Client will see it on next poll/reconnect
      console.error('[ChatWorker] Broadcast failed (non-fatal):', {
        messageId: assistantMessage.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // In production: emit metric for monitoring broadcast health
      // e.g., metrics.increment('chat.broadcast.failed')
    }
  }

  /**
   * Extract human-readable text from Claude response
   */
  private extractResponseText(response: any): string {
    // Try different response structures
    if (response.data?.answer) return response.data.answer;
    if (response.data?.summary) return response.data.summary;
    if (response.data?.analysis) return response.data.analysis;
    if (response.data?.response) return response.data.response;

    // Fallback
    return 'Response generated successfully.';
  }

  /**
   * Determine if build should start based on:
   * 1. Structured intent field (deterministic, preferred)
   * 2. Mode is 'build'
   * 3. Response has convert_to_build action
   * 4. Fallback: "Apply recommendation" string match (temporary, until frontend sends intent)
   */
  private shouldStartBuild(response: any, mode: string, intent?: string): boolean {
    // Always build if mode is 'build'
    if (mode === 'build') return true;

    // PREFERRED: Check structured intent field
    if (intent === 'apply_recommendation') {
      return true;
    }

    // Check if response has convert_to_build action
    const hasConvertAction = response.availableActions?.some(
      (action: any) => action.type === 'convert_to_build'
    );

    if (hasConvertAction) {
      return true;
    }

    // FALLBACK: String matching (brittle, should be replaced with intent field)
    // Only check exact prefix to avoid false positives like "I don't want to apply recommendation"
    // This can be removed once frontend always sends intent field
    // if (text.startsWith('Apply recommendation:')) {
    //   return true;
    // }

    return false;
  }
}

// CRITICAL: Create single processor instance (not per-job!)
const processor = new ChatMessageProcessor();

// Create worker with shared Redis connection
export const chatWorker = new Worker<ChatMessageJobData>(
  'chat-messages',
  (job) => processor.processMessage(job),
  {
    connection: redisConnection, // Reuse shared connection
    concurrency: 5,  // Process up to 5 messages concurrently
    limiter: {
      max: 10,       // Max 10 jobs per duration
      duration: 1000 // Per 1 second (rate limiting)
    }
  }
);

chatWorker.on('completed', (job) => {
  console.log(`[ChatWorker] Job ${job.id} completed`);
});

chatWorker.on('failed', (job, err) => {
  console.error(`[ChatWorker] Job ${job?.id} failed:`, err);
  // Failed jobs are kept (removeOnFail: false) for investigation
});

chatWorker.on('error', (err) => {
  console.error('[ChatWorker] Worker error:', err);
});

console.log('[ChatWorker] Worker started and listening for jobs');
