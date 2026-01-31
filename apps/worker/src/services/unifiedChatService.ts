/**
 * Unified Chat Service
 *
 * Provides a seamless experience between Plan and Build modes
 * with a simple toggle to control immediate build behavior.
 */

import Redis from 'ioredis';
import { ulid } from 'ulid';
import { BuildInitiationResult, initiateBuild } from './buildInitiationService';
import { ChatBroadcastService, type ChatMessage as BroadcastChatMessage } from './chatBroadcastService';
import { ChatMode, ChatPlanResponse, ChatPlanService, SimplifiedChatPlanRequest } from './chatPlanService';
import { StreamEvent } from './chatStreamProcessor';
import { pool } from './database';
import { SessionManagementService } from './sessionManagementService';
import { WebhookService } from './webhookService';
import { SUPPORTED_LOCALES, resolveLocaleWithChain } from '../i18n/localeUtils';

// =====================================================================
// Throttled Broadcasting Utility
// =====================================================================

/**
 * ThrottledBroadcaster - Per-request throttling with "last write wins" coalescing
 * Based on expert feedback for plan mode streaming implementation
 */
class ThrottledBroadcaster {
  private lastEmit = 0;
  private readonly THROTTLE_MS = 1000; // 1/sec max
  private pendingEvent: any = null;
  
  constructor(
    private broadcast: ChatBroadcastService,
    private projectId: string,
    private clientMsgId: string  // Per-request throttling key
  ) {}
  
  async emitThrottled(event: any) {
    // "Last write wins" - always update to latest
    this.pendingEvent = event;

    const now = Date.now();
    if (now - this.lastEmit >= this.THROTTLE_MS) {
      // EXPERT FIX: Omit id for plan.* system events (prevents Last-Event-ID corruption)
      await this.broadcast.broadcastSystemEvent(this.projectId, {
        event: this.pendingEvent.event,
        data: this.pendingEvent.data
      });
      this.lastEmit = now;
      this.pendingEvent = null;
    }
  }

  async flushPending() {
    // Always flush final state for stable UI
    if (this.pendingEvent) {
      // EXPERT FIX: Omit id for plan.* system events (prevents Last-Event-ID corruption)
      await this.broadcast.broadcastSystemEvent(this.projectId, {
        event: this.pendingEvent.event,
        data: this.pendingEvent.data
      });
      this.pendingEvent = null;
    }
  }
}

// =====================================================================
// Type Definitions
// =====================================================================

export interface UnifiedChatRequest {
  userId: string;
  projectId: string;
  message: string;
  buildImmediately?: boolean;  // If not provided, use user's saved preference
  locale?: string;
  client_msg_id?: string;  // Optional UUID for idempotency
  sessionContext?: {
    previousMode?: 'plan' | 'build';
    sessionId?: string;
  };
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface UnifiedChatResponse {
  accepted: boolean;  // Indicates if the message was accepted
  success: boolean;   // Frontend expectation: true when message is accepted
  queued: boolean;    // Frontend expectation: true when message is queued for AI processing
  mode: 'plan' | 'build';
  sessionId: string;
  messageId: string;
  message_seq?: number | undefined;  // Sequence number for client reconciliation
  client_msg_id?: string | undefined; // Echo back the client's idempotency key
  isDuplicate?: boolean | undefined;  // EXPERT FIX: Explicit duplicate flag for idempotency
  timestamp: string;

  // Plan mode response
  analysis?: {
    intent: ChatMode;
    response: any;
    canBuild: boolean;
    buildPrompt?: string | undefined;
  } | undefined;

  // Build mode response
  build?: {
    buildId: string;
    versionId: string;
    status: 'queued' | 'processing' | 'failed';
    estimatedTime?: number | undefined;
    message?: string | undefined;
  } | undefined;

  // Available actions based on current state
  actions: Array<{
    type: 'build_now' | 'save_plan' | 'switch_mode' | 'cancel_build';
    label: string;
    enabled: boolean;
    payload?: any | undefined;
  }>;

  // User preferences
  preferences: {
    buildImmediately: boolean;
  };

  error?: {
    code: string;
    message: string;
  } | undefined;
}

export interface ChatPreferences {
  buildImmediately: boolean;
  // Future preferences can be added here
}

// =====================================================================
// Unified Chat Service
// =====================================================================

// Shared Redis client to prevent multiple connections per service instance
let sharedRedisClient: Redis | null = null;

function getSharedRedisClient(): Redis {
  if (!sharedRedisClient) {
    const redisConfig: {
      host: string;
      port: number;
      password?: string;
      db: number;
      retryDelayOnFailover: number;
      maxRetriesPerRequest: number;
    } = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    };
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    sharedRedisClient = new Redis(redisConfig);

    sharedRedisClient.on('error', (err) => {
      console.error('[UnifiedChat] Redis connection error:', err);
    });
  }
  return sharedRedisClient;
}

export class UnifiedChatService {
  private chatPlanService: ChatPlanService;
  private webhookService: WebhookService;
  private sessionService: SessionManagementService;
  private redis: Redis;
  private readonly IDEMPOTENCY_TTL = 3600; // 1 hour TTL for idempotency keys

  constructor() {
    this.webhookService = new WebhookService();
    this.chatPlanService = new ChatPlanService(this.webhookService);
    this.sessionService = new SessionManagementService();
    this.redis = getSharedRedisClient();
  }

  /**
   * Resolve locale with proper fallback chain.
   * EXPERT FIX Round 16: Use shared resolveLocaleWithChain() for consistent normalization.
   * Priority: x-sheen-locale header → request body → default 'en'
   */
  private resolveLocale(headers: any, request: UnifiedChatRequest): string {
    // Priority 1: x-sheen-locale header
    const headerLocale = headers?.['x-sheen-locale'];
    if (headerLocale) {
      // resolveLocaleWithChain already ensures result is a SupportedLocale
      return resolveLocaleWithChain(headerLocale).base;
    }

    // Priority 2: locale field in request body
    if (request.locale) {
      // resolveLocaleWithChain already ensures result is a SupportedLocale
      return resolveLocaleWithChain(request.locale).base;
    }

    // Priority 3: User profile locale (would need to be implemented)
    // TODO: Could fetch user locale from database if needed

    // Priority 4: Default fallback
    return 'en';
  }

  /**
   * Process a unified chat request that can either trigger a build or return a plan
   */
  async processUnifiedChat(request: UnifiedChatRequest, headers?: any): Promise<UnifiedChatResponse> {
    const startTime = Date.now();
    const messageId = ulid();

    try {
      // 1. Check for idempotency if client_msg_id is provided
      if (request.client_msg_id) {
        const existingResponse = await this.checkIdempotency(request.projectId, request.userId, request.client_msg_id);
        if (existingResponse) {
          console.log('[UnifiedChat] Duplicate request detected, returning cached response');
          // EXPERT FIX: Mark as duplicate explicitly
          return { ...existingResponse, isDuplicate: true };
        }
      }

      // 2. Resolve locale with precedence rule: header → body → user profile → default 'en'
      const resolvedLocale = this.resolveLocale(headers, request);

      // 3. Get user's chat preferences
      const preferences = await this.getUserChatPreferences(request.projectId);
      const buildImmediately = request.buildImmediately ?? preferences.buildImmediately;

      console.log('[UnifiedChat] Processing request:', {
        projectId: request.projectId,
        buildImmediately,
        userPreference: preferences.buildImmediately,
        requestOverride: request.buildImmediately,
        hasClientMsgId: !!request.client_msg_id,
        resolvedLocale
      });

      // 4. Track session and mode transitions
      const sessionId = await this.getOrCreateUnifiedSession(
        request.projectId,
        request.userId,
        request.sessionContext?.sessionId
      );

      await this.trackModeUsage(sessionId, buildImmediately ? 'build' : 'plan');

      // 5. Save the message to chat log and get DB id + sequence number
      // EXPERT FIX: Use DB row id as authoritative messageId (fixes parent_message_id linkage)
      const { id: dbMessageId, seq: messageSeq } = await this.saveUserMessage(request, messageId, buildImmediately);

      // 6. Route to appropriate handler based on mode
      // EXPERT FIX: Pass DB id instead of ULID for proper parent_message_id linkage
      let response: UnifiedChatResponse;
      if (buildImmediately) {
        response = await this.handleBuildMode(request, sessionId, dbMessageId, preferences, resolvedLocale);
      } else {
        response = await this.handlePlanMode(request, sessionId, dbMessageId, preferences, resolvedLocale);
      }

      // 7. Add message sequence number to response
      response.message_seq = messageSeq;
      // EXPERT FIX: Use DB id in response for consistent threading
      response.messageId = dbMessageId;

      // 8. Cache response for idempotency if client_msg_id is provided
      if (request.client_msg_id && response.accepted) {
        await this.storeIdempotencyResponse(request.projectId, request.userId, request.client_msg_id, response);
      }

      return response;

    } catch (error) {
      console.error('[UnifiedChat] Error processing request:', error);

      return {
        accepted: false,
        success: false,
        queued: false, // ✅ Error responses are not queued
        mode: 'plan',
        sessionId: '',
        messageId,
        client_msg_id: request.client_msg_id, // ✅ Echo back even on error
        timestamp: new Date().toISOString(),
        actions: [],
        preferences: { buildImmediately: true },
        error: {
          code: 'UNIFIED_CHAT_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
      };
    }
  }

  /**
   * Handle build mode - immediately trigger a build
   */
  private async handleBuildMode(
    request: UnifiedChatRequest,
    sessionId: string,
    messageId: string,
    preferences: ChatPreferences,
    resolvedLocale: string
  ): Promise<UnifiedChatResponse> {
    console.log('[UnifiedChat] Handling BUILD mode');

    try {
      // Check if fast response mode is enabled (skip AI processing for speed)
      const fastResponseMode = process.env.UNIFIED_CHAT_FAST_RESPONSE !== 'false';

      if (fastResponseMode) {
        console.log('[UnifiedChat] Fast response mode enabled - starting build asynchronously');
        
        // Get project context
        const projectContext = await this.getProjectContext(request.projectId);
        
        // Actually initiate the build (async) but don't wait for completion
        const buildResult = await initiateBuild({
          userId: request.userId,
          projectId: request.projectId,
          prompt: request.message,
          framework: projectContext.framework,
          isInitialBuild: !projectContext.hasExistingBuilds,
          baseVersionId: projectContext.currentVersionId,
          previousSessionId: projectContext.lastAiSessionId,
          metadata: {
            source: 'unified-chat' as any,
            unifiedMode: true,
            sessionId,
            messageId,
            fastResponse: true
          }
        });
        
        // Track in unified session
        await this.trackBuildInitiated(sessionId, buildResult.buildId);
        
        // Save assistant response immediately (the build status will be updated via SSE)
        await this.saveAssistantMessage(
          request.projectId,
          request.userId,
          'build',
          {
            type: 'build_initiated',
            buildId: buildResult.buildId,
            versionId: buildResult.versionId,
            message: 'I\'ll start building that for you right away! 🚀'
          },
          messageId,
          buildResult.buildId
        );
        
        // Return fast response with real IDs
        return {
          accepted: true,
          success: true,
          queued: true,
          mode: 'build',
          sessionId,
          messageId,
          client_msg_id: request.client_msg_id,
          timestamp: new Date().toISOString(),
          build: {
            buildId: buildResult.buildId,
            versionId: buildResult.versionId,
            status: buildResult.status === 'queued' ? 'queued' : 'failed',
            estimatedTime: 120, // seconds
            message: buildResult.status === 'queued' 
              ? 'Build has been queued and will start shortly'
              : 'Build failed to queue'
          },
          actions: [
            {
              type: 'cancel_build',
              label: 'Cancel Build',
              enabled: buildResult.status === 'queued'
            }
          ],
          preferences
        };
      }

      // Original synchronous build processing (slow but complete)
      const projectContext = await this.getProjectContext(request.projectId);

      // Initiate the build
      const buildResult = await initiateBuild({
        userId: request.userId,
        projectId: request.projectId,
        prompt: request.message,
        framework: projectContext.framework,
        isInitialBuild: !projectContext.hasExistingBuilds,
        baseVersionId: projectContext.currentVersionId,
        previousSessionId: projectContext.lastAiSessionId,
        metadata: {
          source: 'unified-chat' as any,
          unifiedMode: true,
          sessionId,
          messageId
        }
      });

      // Track in unified session
      await this.trackBuildInitiated(sessionId, buildResult.buildId);

      // Save assistant response
      await this.saveAssistantMessage(
        request.projectId,
        request.userId,
        'build',
        {
          type: 'build_initiated',
          buildId: buildResult.buildId,
          versionId: buildResult.versionId,
          message: 'I\'ll start building that for you right away! 🚀'
        },
        messageId,
        buildResult.buildId
      );

      return {
        accepted: true,
        success: true,
        queued: true, // ✅ Frontend expectation: message queued for AI processing
        mode: 'build',
        sessionId,
        messageId,
        client_msg_id: request.client_msg_id, // ✅ Echo back idempotency key
        timestamp: new Date().toISOString(),
        build: {
          buildId: buildResult.buildId,
          versionId: buildResult.versionId,
          status: buildResult.status === 'queued' ? 'queued' : 'failed',
          estimatedTime: 120, // seconds
          message: 'Build has been queued and will start shortly'
        },
        actions: [
          {
            type: 'cancel_build',
            label: 'Cancel Build',
            enabled: true,
            payload: { buildId: buildResult.buildId }
          },
          {
            type: 'switch_mode',
            label: 'Switch to Plan Mode',
            enabled: false // Disabled while build is running
          }
        ],
        preferences
      };

    } catch (error) {
      console.error('[UnifiedChat] Build mode error:', error);

      // Fall back to plan mode on error
      return await this.handlePlanMode(request, sessionId, messageId, preferences, resolvedLocale);
    }
  }

  /**
   * Determine if a plan request requires complex analysis
   * Simple heuristics - can be improved with ML later
   */
  private isComplexAnalysis(message: string): boolean {
    const complexTriggers = [
      /analyz[e|ing]/i,
      /review.*architecture/i, 
      /audit/i,
      /explain.*how.*works/i,
      /what.*wrong.*with/i,
      /improve.*performance/i,
      /refactor/i,
      /optimize/i,
      /security.*issue/i,
      /best.*practice/i,
      /code.*quality/i,
      /technical.*debt/i
    ];
    
    return complexTriggers.some(pattern => pattern.test(message)) ||
           message.length > 150; // Long messages likely complex
  }

  /**
   * Map internal StreamEvent types to SSE event names
   * Based on expert feedback for plan mode streaming
   */
  private mapStreamEvent(streamEvent: StreamEvent): string | null {
    switch (streamEvent.event) {
      case 'progress_update': return 'plan.progress';
      case 'tool_use': return 'plan.progress';        
      case 'assistant_text': return 'plan.partial';   
      case 'complete': return null; // Handle via saveAssistantMessage
      case 'error': return 'plan.error';
      case 'intent_detected': return 'plan.progress';
      case 'references': return 'plan.progress';
      case 'tool_result': return 'plan.progress';
      case 'metrics': return null; // Internal use only
      default: return 'plan.progress';
    }
  }

  /**
   * Handle plan mode - analyze and return a plan without building
   * Implements smart routing: simple questions sync, complex analysis streaming
   */
  private async handlePlanMode(
    request: UnifiedChatRequest,
    sessionId: string,
    messageId: string,
    preferences: ChatPreferences,
    resolvedLocale: string
  ): Promise<UnifiedChatResponse> {
    console.log('[UnifiedChat] Handling PLAN mode');

    const isComplex = this.isComplexAnalysis(request.message);
    console.log('[UnifiedChat] Plan complexity analysis:', { isComplex, messageLength: request.message.length });

    try {
      if (!isComplex) {
        // Simple questions: synchronous processing (1-3 seconds)
        console.log('[UnifiedChat] Simple plan - processing synchronously');
        
        const planRequest: SimplifiedChatPlanRequest = {
          userId: request.userId,
          projectId: request.projectId,
          message: request.message,
          locale: resolvedLocale,
          context: {
            includeVersionHistory: true,
            includeProjectStructure: true
          }
        };

        const planResponse = await this.chatPlanService.processChatPlan(planRequest);

        // Save assistant message for simple plans
        await this.saveAssistantMessage(
          request.projectId,
          request.userId,
          'plan',
          planResponse.data,
          messageId
        );

        // Determine if this plan can be built
        const canBuild = this.canConvertToBuild(planResponse);
        const buildPrompt = this.extractBuildPrompt(planResponse);

        // Track in unified session
        await this.trackPlanGenerated(sessionId, planResponse.mode);

        return {
          accepted: true,
          success: true,
          queued: true,
          mode: 'plan',
          sessionId,
          messageId,
          client_msg_id: request.client_msg_id,
          timestamp: planResponse.timestamp,
          analysis: {
            intent: planResponse.mode,
            response: planResponse.data,
            canBuild,
            buildPrompt
          },
          actions: [
            {
              type: 'build_now',
              label: 'Build This Now',
              enabled: canBuild,
              payload: {
                prompt: buildPrompt,
                planSessionId: planResponse.sessionId
              }
            },
            {
              type: 'save_plan',
              label: 'Save Plan',
              enabled: true,
              payload: { planData: planResponse.data }
            },
            {
              type: 'switch_mode',
              label: 'Enable Auto-Build',
              enabled: true
            }
          ],
          preferences
        };
      }

      // Complex analysis: fast HTTP response + fire-and-forget background streaming
      console.log('[UnifiedChat] Complex plan - using streaming with fire-and-forget processing');
      
      const response: UnifiedChatResponse = {
        accepted: true, 
        success: true, 
        queued: true,
        mode: 'plan', 
        sessionId, 
        messageId, 
        client_msg_id: request.client_msg_id,
        timestamp: new Date().toISOString(),
        actions: [
          {
            type: 'switch_mode',
            label: 'Enable Auto-Build',
            enabled: true
          }
        ],
        preferences
      };

      // Start streaming analysis after HTTP response (no await - fire-and-forget)
      setImmediate(() => this.streamPlanInProcess(request, messageId, sessionId, resolvedLocale));

      return response;

    } catch (error) {
      console.error('[UnifiedChat] Plan mode error:', error);
      throw error;
    }
  }

  /**
   * Stream plan analysis in background process with SSE progress updates
   * Implements expert-recommended fire-and-forget pattern with single-pass processing
   */
  private async streamPlanInProcess(
    request: UnifiedChatRequest,
    messageId: string,
    sessionId: string,
    resolvedLocale: string
  ): Promise<void> {
    const broadcast = ChatBroadcastService.getInstance();
    const throttler = new ThrottledBroadcaster(
      broadcast, 
      request.projectId, 
      request.client_msg_id || messageId  // Per-request throttling key
    );
    
    let finalResult: any = null;
    
    try {
      console.log('[UnifiedChat] Starting background plan streaming for messageId:', messageId);
      
      // Single processChatPlanStream call, capture final result from stream
      await this.chatPlanService.processChatPlanStream({
        userId: request.userId,
        projectId: request.projectId,
        message: request.message,
        locale: resolvedLocale,
        context: { includeVersionHistory: true, includeProjectStructure: true }
      }, async (streamEvent: StreamEvent) => {
        
        // Map our StreamEventType to SSE event names
        const sseEventType = this.mapStreamEvent(streamEvent);
        
        if (sseEventType === 'plan.progress') {
          await throttler.emitThrottled({
            event: 'plan.progress',
            data: {
              userId: request.userId,
              client_msg_id: request.client_msg_id,
              phase: streamEvent.data.phase || streamEvent.data.tool || 'analyzing',
              message: streamEvent.data.message || streamEvent.data.text || 'Processing...',
              timestamp: streamEvent.timestamp
            }
          });
        } else if (sseEventType === 'plan.partial') {
          await throttler.emitThrottled({
            event: 'plan.partial',
            data: {
              userId: request.userId,
              client_msg_id: request.client_msg_id,
              chunk: streamEvent.data.chunk || streamEvent.data.text || streamEvent.data,
              timestamp: streamEvent.timestamp
            }
          });
        } else if (sseEventType === 'plan.error') {
          await throttler.emitThrottled({
            event: 'plan.error',
            data: {
              userId: request.userId,
              client_msg_id: request.client_msg_id,
              error: {
                code: 'STREAM_ERROR',
                message: streamEvent.data.message || 'Processing error occurred'
              },
              timestamp: streamEvent.timestamp
            }
          });
        } else if (streamEvent.event === 'complete') {
          // Capture final result from stream (no double compute)
          finalResult = streamEvent.data.fullResponse || streamEvent.data;
          console.log('[UnifiedChat] Captured final result from stream');
        }
      });
      
      // Flush any pending throttled events
      await throttler.flushPending();
      
      // Save final result (broadcasts durable message.new automatically)
      if (finalResult) {
        console.log('[UnifiedChat] Saving final assistant message for streamed plan');
        await this.saveAssistantMessage(
          request.projectId,
          request.userId,
          'plan',
          finalResult,
          messageId
        );
        
        // Track plan completion
        await this.trackPlanGenerated(sessionId, finalResult.mode || 'analysis');
      } else {
        console.warn('[UnifiedChat] No final result captured from stream - this should not happen');
      }
      
    } catch (error) {
      console.error('[UnifiedChat] Background plan processing failed:', error);
      
      // Broadcast error event (don't throw - this is fire-and-forget)
      try {
        // EXPERT FIX Round 16: Removed id field - broadcastSystemEvent intentionally omits SSE id for ephemeral events
        await broadcast.broadcastSystemEvent(request.projectId, {
          event: 'plan.error',
          data: {
            userId: request.userId,
            client_msg_id: request.client_msg_id,
            error: {
              code: 'PLAN_PROCESSING_FAILED',
              message: error instanceof Error ? error.message : 'Analysis failed'
            },
            timestamp: new Date().toISOString()
          }
        });
      } catch (broadcastError) {
        console.error('[UnifiedChat] Error broadcasting plan failure:', broadcastError);
      }
    }
  }

  /**
   * Get user's chat preferences from the database
   */
  private async getUserChatPreferences(projectId: string): Promise<ChatPreferences> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const query = `
      SELECT chat_preferences
      FROM projects
      WHERE id = $1
    `;

    const result = await pool.query(query, [projectId]);

    if (result.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Default to buildImmediately: true if not set
    const preferences = result.rows[0].chat_preferences || { buildImmediately: true };

    return {
      buildImmediately: preferences.buildImmediately ?? true
    };
  }

  /**
   * Update user's chat preferences
   */
  async updateUserChatPreferences(
    projectId: string,
    preferences: Partial<ChatPreferences>
  ): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const query = `
      UPDATE projects
      SET
        chat_preferences = chat_preferences || $2::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `;

    await pool.query(query, [projectId, JSON.stringify(preferences)]);

    console.log('[UnifiedChat] Updated preferences for project:', projectId, preferences);
  }

  /**
   * Get or create a unified chat session
   */
  private async getOrCreateUnifiedSession(
    projectId: string,
    userId: string,
    existingSessionId?: string
  ): Promise<string> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    if (existingSessionId) {
      // Check if session exists and is still valid
      const checkQuery = `
        SELECT id, session_id
        FROM unified_chat_sessions
        WHERE session_id = $1
          AND project_id = $2
          AND last_active > NOW() - INTERVAL '30 minutes'
      `;

      const result = await pool.query(checkQuery, [existingSessionId, projectId]);

      if (result.rows.length > 0) {
        // Update last_active
        await pool.query(
          'UPDATE unified_chat_sessions SET last_active = NOW() WHERE session_id = $1',
          [existingSessionId]
        );
        return existingSessionId;
      }
    }

    // Create new session
    const newSessionId = ulid();

    const insertQuery = `
      INSERT INTO unified_chat_sessions (
        project_id, user_id, session_id, created_at, last_active
      ) VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING session_id
    `;

    await pool.query(insertQuery, [projectId, userId, newSessionId]);

    console.log('[UnifiedChat] Created new session:', newSessionId);
    return newSessionId;
  }

  /**
   * Track mode usage in the session
   */
  private async trackModeUsage(sessionId: string, mode: 'plan' | 'build'): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const column = mode === 'plan' ? 'messages_in_plan_mode' : 'messages_in_build_mode';

    const query = `
      UPDATE unified_chat_sessions
      SET ${column} = ${column} + 1
      WHERE session_id = $1
    `;

    await pool.query(query, [sessionId]);
  }

  /**
   * Track when a build is initiated
   */
  private async trackBuildInitiated(sessionId: string, buildId: string): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const query = `
      UPDATE unified_chat_sessions
      SET
        metadata = metadata || $2::jsonb,
        last_active = NOW()
      WHERE session_id = $1
    `;

    const metadata = {
      lastBuildId: buildId,
      lastBuildAt: new Date().toISOString()
    };

    await pool.query(query, [sessionId, JSON.stringify(metadata)]);
  }

  /**
   * Track when a plan is generated
   */
  private async trackPlanGenerated(sessionId: string, intent: ChatMode): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const query = `
      UPDATE unified_chat_sessions
      SET
        metadata = metadata || $2::jsonb
      WHERE session_id = $1
    `;

    const metadata = {
      lastPlanIntent: intent,
      lastPlanAt: new Date().toISOString()
    };

    await pool.query(query, [sessionId, JSON.stringify(metadata)]);
  }

  /**
   * Get project context for builds
   */
  private async getProjectContext(projectId: string): Promise<any> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const query = `
      SELECT
        p.id,
        p.framework,
        p.current_version_id,
        p.current_build_id,
        p.last_ai_session_id,
        p.config,
        COUNT(pv.id) > 0 as has_existing_builds
      FROM projects p
      LEFT JOIN project_versions pv ON pv.project_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `;

    const result = await pool.query(query, [projectId]);

    if (result.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    return {
      framework: result.rows[0].framework,
      currentVersionId: result.rows[0].current_version_id,
      currentBuildId: result.rows[0].current_build_id,
      lastAiSessionId: result.rows[0].last_ai_session_id,
      config: result.rows[0].config,
      hasExistingBuilds: result.rows[0].has_existing_builds
    };
  }

  /**
   * Save user message to chat log
   */
  private async saveUserMessage(
    request: UnifiedChatRequest,
    messageId: string,
    buildImmediately: boolean
  ): Promise<{ id: string; seq: number }> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const mode = buildImmediately ? 'build' : 'plan';

    const query = `
      INSERT INTO project_chat_log_minimal (
        project_id,
        user_id,
        message_text,
        message_type,
        mode,
        build_immediately,
        mode_at_creation,
        timeline_seq,
        created_at
      ) VALUES (
        $1, $2, $3, 'user', $4, $5, $6,
        nextval('project_timeline_seq'),
        NOW()
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      request.projectId,
      request.userId,
      request.message,
      mode,  // Dynamic mode: 'build' or 'plan'
      buildImmediately,
      mode   // mode_at_creation: same as mode
    ]);

    const finalRow = result.rows[0]; // Post-commit data with seq, id, timestamp

    // EXPERT FIX: Use DB row id as authoritative messageId (fixes parent_message_id linkage)
    // Broadcast with authoritative data after DB commit
    try {
      const broadcastService = ChatBroadcastService.getInstance();
      const chatMessage: BroadcastChatMessage = {
        id: finalRow.id, // EXPERT FIX: Use DB row id, not the provided ULID
        seq: finalRow.timeline_seq,
        client_msg_id: request.client_msg_id,
        user_id: finalRow.user_id,
        message_text: finalRow.message_text,
        message_type: finalRow.message_type,
        mode: finalRow.mode,
        actor_type: 'client',
        created_at: finalRow.created_at,
        build_id: finalRow.build_id,
        response_data: finalRow.response_data
      };

      await broadcastService.broadcastMessage(request.projectId, chatMessage);
    } catch (error) {
      console.error('[UnifiedChatService] Broadcasting user message failed:', error);
      // Non-fatal: don't break message saving
    }

    // EXPERT FIX: Return both DB id and seq for proper parent linkage
    return { id: finalRow.id, seq: finalRow.timeline_seq };
  }

  /**
   * Save assistant message to chat log
   */
  private async saveAssistantMessage(
    projectId: string,
    userId: string,
    mode: 'plan' | 'build',
    responseData: any,
    parentMessageId: string,
    buildId?: string
  ): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const query = `
      INSERT INTO project_chat_log_minimal (
        project_id,
        user_id,
        message_text,
        message_type,
        mode,
        response_data,
        build_id,
        parent_message_id,
        timeline_seq,
        created_at
      ) VALUES (
        $1, $2, '', 'assistant', $6, $3, $4, $5,
        nextval('project_timeline_seq'),
        NOW()
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      projectId,
      userId,
      JSON.stringify(responseData),
      buildId,
      parentMessageId,
      mode  // Use the actual mode parameter instead of hardcoded 'unified'
    ]);

    const finalRow = result.rows[0]; // Post-commit data with seq, id, timestamp

    // Broadcast with authoritative data after DB commit
    try {
      const broadcastService = ChatBroadcastService.getInstance();
      const chatMessage: BroadcastChatMessage = {
        id: finalRow.id || ulid(), // Generate ID if not provided by DB
        seq: finalRow.timeline_seq,
        client_msg_id: undefined, // Assistant messages don't have client_msg_id
        user_id: finalRow.user_id,
        message_text: finalRow.message_text || '',
        message_type: finalRow.message_type,
        mode: finalRow.mode,
        actor_type: 'assistant',
        created_at: finalRow.created_at,
        build_id: finalRow.build_id,
        response_data: finalRow.response_data
      };

      await broadcastService.broadcastMessage(projectId, chatMessage);
    } catch (error) {
      console.error('[UnifiedChatService] Broadcasting assistant message failed:', error);
      // Non-fatal: don't break message saving
    }
  }

  /**
   * Determine if a plan response can be converted to a build
   */
  private canConvertToBuild(planResponse: ChatPlanResponse): boolean {
    // Features and fixes can typically be built
    if (planResponse.mode === 'feature' || planResponse.mode === 'fix') {
      return true;
    }

    // Check if the response has a buildPrompt
    const responseData = planResponse.data as any;
    if (responseData.buildPrompt) {
      return true;
    }

    // Questions and analysis typically can't be built
    return false;
  }

  /**
   * Extract build prompt from plan response
   */
  private extractBuildPrompt(planResponse: ChatPlanResponse): string | undefined {
    const responseData = planResponse.data as any;

    // Direct buildPrompt field
    if (responseData.buildPrompt) {
      return responseData.buildPrompt;
    }

    // For feature plans, generate a prompt from the plan
    if (planResponse.mode === 'feature' && responseData.plan) {
      return `Implement the following feature: ${responseData.summary}\n\nPlan:\n${responseData.plan.overview}`;
    }

    // For fixes, generate a prompt from the solution
    if (planResponse.mode === 'fix' && responseData.solution) {
      return `Fix the following issue: ${responseData.issue.description}\n\nSolution:\n${responseData.solution.approach}`;
    }

    return undefined;
  }

  /**
   * Check if a request is a duplicate using client_msg_id
   */
  private async checkIdempotency(
    projectId: string,
    userId: string,
    clientMsgId: string
  ): Promise<UnifiedChatResponse | null> {
    try {
      const idempotencyKey = `idempotency:unified_chat:${projectId}:${userId}:${clientMsgId}`;
      const cachedResponse = await this.redis.get(idempotencyKey);

      if (cachedResponse) {
        const response = JSON.parse(cachedResponse) as UnifiedChatResponse;
        // Return 200 status for duplicate (vs 201 for new)
        return {
          ...response,
          accepted: true
        };
      }

      return null;
    } catch (error) {
      console.error('[UnifiedChat] Error checking idempotency:', error);
      // On Redis error, proceed with normal processing
      return null;
    }
  }

  /**
   * Store response for idempotency checking
   */
  private async storeIdempotencyResponse(
    projectId: string,
    userId: string,
    clientMsgId: string,
    response: UnifiedChatResponse
  ): Promise<void> {
    try {
      const idempotencyKey = `idempotency:unified_chat:${projectId}:${userId}:${clientMsgId}`;

      // Store the response with TTL
      await this.redis.setex(
        idempotencyKey,
        this.IDEMPOTENCY_TTL,
        JSON.stringify(response)
      );

      console.log('[UnifiedChat] Stored idempotency response for client_msg_id:', clientMsgId);
    } catch (error) {
      console.error('[UnifiedChat] Error storing idempotency response:', error);
      // Non-fatal error - don't throw
    }
  }

  /**
   * Convert a plan to a build
   */
  async convertPlanToBuild(
    projectId: string,
    userId: string,
    planSessionId: string,
    buildPrompt: string
  ): Promise<BuildInitiationResult> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    // Track conversion
    const updateQuery = `
      UPDATE unified_chat_sessions
      SET
        plans_converted_to_builds = plans_converted_to_builds + 1,
        metadata = metadata || $2::jsonb
      WHERE session_id = $1
    `;

    await pool.query(updateQuery, [
      planSessionId,
      JSON.stringify({ lastConversionAt: new Date().toISOString() })
    ]);

    // Initiate the build
    return await initiateBuild({
      userId,
      projectId,
      prompt: buildPrompt,
      metadata: {
        source: 'unified-chat' as any,
        convertedFromPlan: true,
        planSessionId
      }
    });
  }

  /**
   * Clean up Redis connection.
   * Note: Uses shared client, so only closes if explicitly called and resets the shared instance.
   */
  async close(): Promise<void> {
    if (sharedRedisClient) {
      await sharedRedisClient.quit();
      sharedRedisClient = null;
      console.log('[UnifiedChat] Redis connection closed');
    }
  }
}
