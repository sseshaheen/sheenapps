/**
 * Chat Broadcasting Service
 *
 * Central service for broadcasting chat messages and events via Redis pub/sub
 * to SSE clients and other real-time subscribers.
 *
 * CRITICAL INVARIANT (Expert Round 12): SSE id = seq semantics
 * - Durable timeline events (message.new, message.replay): id = seq.toString()
 * - Ephemeral events (typing, presence, plan.*, advisor.*): omit id
 * This ensures Last-Event-ID always reflects message timeline position for replay
 */

import Redis from 'ioredis';

// =====================================================================
// Type Definitions
// =====================================================================

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
// EXPERT FIX Round 17: Use string for event type to support control events (connection.established, server_close, etc.)
// "id = seq" invariant for durable events, omit id for ephemeral events - enforced by convention/tests
export interface SSEChatEvent {
  id?: string | undefined;          // Use seq for messages, omit for ephemeral events
  event: string; // Durable: message.new/replay; Ephemeral: typing.*, presence.*, plan.*, advisor.*; Control: connection.established, server_close, etc.
  data: {
    seq?: number | undefined;       // Database sequence for messages (omit for ephemeral)
    messageId?: string | undefined; // Database message ID (omit for ephemeral)
    client_msg_id?: string | undefined; // For optimistic update matching
    projectId: string;
    userId: string;
    content: any;       // Message content or event data
    timestamp: string;
    metadata?: any;     // Additional context

    // For build.status events, data contains status field
    status?: 'queued' | 'in_progress' | 'completed' | 'failed' | undefined; // For build events

    // For advisor events
    matchId?: string | undefined;
    advisorId?: string | undefined;
    advisor?: {
      id: string;
      name: string;
      avatar?: string | undefined;
      skills?: string[] | undefined;
      rating?: number | undefined;
    } | undefined;
    matchScore?: number | undefined;
    workspaceStatus?: 'ready' | 'provisioning' | 'failed' | undefined;
  };
  retry?: number | undefined;       // SSE retry directive
}

export interface ChatMessage {
  id: string;
  seq: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  client_msg_id?: string | undefined;
  user_id: string;
  message_text: string;
  message_type: 'user' | 'assistant' | 'system';
  mode?: string | undefined;
  actor_type: 'client' | 'assistant' | 'system';
  created_at: string;
  build_id?: string | undefined;
  response_data?: any;
}

// EXPERT FIX Round 14: id is optional (ephemeral events omit it per SSE id semantics)
export interface SystemEvent {
  id?: string | undefined;
  event: string;
  data: any;
}

// =====================================================================
// Chat Broadcasting Service
// =====================================================================

export class ChatBroadcastService {
  private publishRedis: Redis;
  private static instance: ChatBroadcastService;
  private static subscriberPool: Map<string, Redis> = new Map();

  private constructor(redisUrl?: string) {
    const connectionConfig = redisUrl ? { url: redisUrl } : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    this.publishRedis = new Redis(connectionConfig as any);

    this.publishRedis.on('error', (err) => {
      console.error('[ChatBroadcastService] Publish Redis connection error:', err);
    });

    this.publishRedis.on('connect', () => {
      console.log('[ChatBroadcastService] Connected to Publish Redis');
    });
  }

  /**
   * Singleton pattern to reuse Redis connection
   */
  static getInstance(redisUrl?: string): ChatBroadcastService {
    if (!ChatBroadcastService.instance) {
      ChatBroadcastService.instance = new ChatBroadcastService(redisUrl);
    }
    return ChatBroadcastService.instance;
  }

  /**
   * Singleton factory for subscribers
   * Each SSE connection gets its own subscriber (Redis requirement)
   */
  static getSubscriber(connectionId: string, redisUrl?: string): Redis {
    if (!ChatBroadcastService.subscriberPool.has(connectionId)) {
      const connectionConfig = redisUrl ? { url: redisUrl } : {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      };

      const subscriber = new Redis(connectionConfig as any);
      
      subscriber.on('error', (err) => {
        console.error(`[ChatBroadcastService] Subscriber ${connectionId} error:`, err);
      });

      subscriber.on('connect', () => {
        console.log(`[ChatBroadcastService] Subscriber ${connectionId} connected`);
      });

      ChatBroadcastService.subscriberPool.set(connectionId, subscriber);
    }
    
    return ChatBroadcastService.subscriberPool.get(connectionId)!;
  }

  /**
   * Clean up subscriber connection
   */
  static async removeSubscriber(connectionId: string): Promise<void> {
    const subscriber = ChatBroadcastService.subscriberPool.get(connectionId);
    if (subscriber) {
      try {
        await subscriber.quit();
      } catch (error) {
        console.error(`[ChatBroadcastService] Error cleaning up subscriber ${connectionId}:`, error);
      }
      ChatBroadcastService.subscriberPool.delete(connectionId);
    }
  }

  /**
   * Broadcast user/assistant messages to SSE clients
   */
  async broadcastMessage(projectId: string, message: ChatMessage): Promise<void> {
    try {
      const chatEvent: SSEChatEvent = {
        id: message.seq.toString(), // Numeric ID for Last-Event-ID parsing
        event: 'message.new',
        data: {
          seq: message.seq,
          messageId: message.id,
          client_msg_id: message.client_msg_id,
          projectId,
          userId: message.user_id,
          content: {
            text: message.message_text,
            type: message.message_type,
            mode: message.mode,
            actor_type: message.actor_type
          },
          timestamp: message.created_at,
          metadata: {
            build_id: message.build_id,
            response_data: message.response_data
          }
        }
      };

      const channel = `chat:${projectId}`;
      const publishStartTime = Date.now();
      
      await this.publishRedis.publish(channel, JSON.stringify(chatEvent));
      
      const publishLatency = Date.now() - publishStartTime;
      console.log('[ChatBroadcastService] Message broadcasted:', {
        projectId,
        messageId: message.id,
        seq: message.seq,
        client_msg_id: message.client_msg_id,
        publishLatency: `${publishLatency}ms`,
        channel
      });

    } catch (error) {
      console.error('[ChatBroadcastService] Error broadcasting message:', error);
      // Non-fatal: don't break message saving
    }
  }

  /**
   * Broadcast message with custom event type (e.g., for replay)
   */
  async broadcastMessageWithEvent(projectId: string, message: ChatMessage, eventType: string): Promise<void> {
    try {
      const chatEvent: SSEChatEvent = {
        id: message.seq.toString(),
        event: eventType as any,
        data: {
          seq: message.seq,
          messageId: message.id,
          client_msg_id: message.client_msg_id,
          projectId,
          userId: message.user_id,
          content: {
            text: message.message_text,
            type: message.message_type,
            mode: message.mode,
            actor_type: message.actor_type
          },
          timestamp: message.created_at,
          metadata: {
            build_id: message.build_id,
            response_data: message.response_data
          }
        }
      };

      const channel = `chat:${projectId}`;
      await this.publishRedis.publish(channel, JSON.stringify(chatEvent));

    } catch (error) {
      console.error('[ChatBroadcastService] Error broadcasting message with event:', error);
    }
  }

  /**
   * Broadcast system events (typing, presence, build status, etc.)
   */
  async broadcastSystemEvent(projectId: string, event: SystemEvent): Promise<void> {
    try {
      const chatEvent: SSEChatEvent = {
        // No ID for ephemeral events (don't update Last-Event-ID)
        event: event.event as any,
        // EXPERT FIX Round 14: Spread event.data first, then enforce canonical fields
        // Prevents accidental overwrites of projectId, userId, timestamp, content
        data: {
          ...event.data,
          projectId,
          userId: event.data.userId || 'system',
          timestamp: event.data.timestamp || new Date().toISOString(),
          content: event.data
        }
      };

      const channel = `chat:${projectId}`;
      await this.publishRedis.publish(channel, JSON.stringify(chatEvent));

      console.log('[ChatBroadcastService] System event broadcasted:', {
        projectId,
        event: event.event,
        channel
      });

    } catch (error) {
      console.error('[ChatBroadcastService] Error broadcasting system event:', error);
    }
  }

  /**
   * Broadcast advisor events (ephemeral, no SSE id)
   *
   * EXPERT FIX Round 12: Advisor events are ephemeral (not part of message timeline)
   * so they omit SSE id to avoid confusing Last-Event-ID semantics
   */
  async publishAdvisorEvent(
    projectId: string,
    event: {
      event: 'advisor.matched' | 'advisor.finalized' | 'advisor.workspace_ready' | 'advisor.left';
      data: {
        matchId: string;
        advisorId: string;
        projectId: string;
        timestamp: string;
        advisor?: {
          id: string;
          name: string;
          avatar?: string;
          skills?: string[];
          rating?: number;
        };
        matchScore?: number;
        workspaceStatus?: 'ready' | 'provisioning' | 'failed';
      };
    }
  ): Promise<void> {
    try {
      const sseEvent: SSEChatEvent = {
        // EXPERT FIX Round 12: Omit id for ephemeral events (not part of durable timeline)
        event: event.event,
        data: {
          ...event.data,
          userId: 'system',
          content: event.data,
          timestamp: event.data.timestamp
        }
      };

      const channel = `chat:${projectId}`;
      await this.publishRedis.publish(channel, JSON.stringify(sseEvent));

      console.log('[ChatBroadcastService] Advisor event published:', {
        projectId,
        event: event.event,
        matchId: event.data.matchId
      });

    } catch (error) {
      console.error('[ChatBroadcastService] Error publishing advisor event:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy' }> {
    try {
      await this.publishRedis.ping();
      return { status: 'healthy' };
    } catch (error) {
      console.error('[ChatBroadcastService] Health check failed:', error);
      return { status: 'unhealthy' };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.publishRedis.quit();
      
      // Clean up all subscriber connections
      for (const [connectionId, subscriber] of ChatBroadcastService.subscriberPool) {
        try {
          await subscriber.quit();
        } catch (error) {
          console.error(`[ChatBroadcastService] Error cleaning up subscriber ${connectionId}:`, error);
        }
      }
      ChatBroadcastService.subscriberPool.clear();
      
    } catch (error) {
      console.error('[ChatBroadcastService] Error during cleanup:', error);
    }
  }
}