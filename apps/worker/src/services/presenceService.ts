/**
 * Redis-based Presence Service
 *
 * Manages real-time user presence and typing indicators using Redis
 * with TTL-based cleanup for scalable presence tracking.
 */

import Redis from 'ioredis';

// =====================================================================
// Type Definitions
// =====================================================================

export interface UserPresence {
  userId: string;
  userType: 'client' | 'assistant' | 'advisor';
  isTyping: boolean;
  lastSeen: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  userAgent?: string | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface ActiveUser {
  userId: string;
  userType: 'client' | 'assistant' | 'advisor';
  isTyping: boolean;
  lastSeen: number;
  isOnline: boolean;
}

export interface PresenceUpdate {
  projectId: string;
  user: ActiveUser;
  event: 'user_joined' | 'user_left' | 'typing_start' | 'typing_stop' | 'heartbeat';
  timestamp: string;
}

export interface TypingIndicator {
  projectId: string;
  userId: string;
  userType: 'client' | 'assistant' | 'advisor';
  isTyping: boolean;
  timestamp: string;
}

// I18n-ready system event data
export interface PresenceSystemEvent {
  code: string;
  params: Record<string, any>;
  timestamp: string;
}

// =====================================================================
// Redis-based Presence Service
// =====================================================================

export class PresenceService {
  private redis: Redis;
  private publishRedis: Redis; // Separate connection for publishing
  private readonly PRESENCE_TTL = 30; // 30 seconds TTL for presence
  private readonly TYPING_TTL = 5;    // 5 seconds TTL for typing indicators
  private readonly HEARTBEAT_INTERVAL = 15; // Recommended heartbeat interval

  constructor(redisUrl?: string) {
    const connectionConfig = redisUrl ? { url: redisUrl } : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    this.redis = new Redis(connectionConfig as any);
    this.publishRedis = new Redis(connectionConfig as any);

    this.redis.on('error', (err) => {
      console.error('[PresenceService] Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('[PresenceService] Connected to Redis');
    });
  }

  // =====================================================================
  // Presence Management
  // =====================================================================

  /**
   * Update user presence with heartbeat
   */
  async updatePresence(
    projectId: string,
    userId: string,
    userType: 'client' | 'assistant' | 'advisor',
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const presenceKey = `presence:${projectId}`;
      const userKey = `user:${userId}`;

      const presenceData: UserPresence = {
        userId,
        userType,
        isTyping: false, // Typing is handled separately
        lastSeen: Date.now(),
        userAgent: metadata.userAgent,
        metadata: metadata.other || {}
      };

      // Set user presence with TTL
      await this.redis.hset(presenceKey, userKey, JSON.stringify(presenceData));
      await this.redis.expire(presenceKey, this.PRESENCE_TTL);

      // Broadcast presence update
      const update: PresenceUpdate = {
        projectId,
        user: {
          userId,
          userType,
          isTyping: false,
          lastSeen: presenceData.lastSeen,
          isOnline: true
        },
        event: 'heartbeat',
        timestamp: new Date().toISOString()
      };

      await this.broadcastPresence(projectId, update);

      // console.log('[PresenceService] Updated presence:', {
      //   projectId,
      //   userId,
      //   userType
      // });

    } catch (error) {
      console.error('[PresenceService] Error updating presence:', error);
      throw new Error('Failed to update presence');
    }
  }

  /**
   * Remove user presence (user disconnected)
   */
  async removePresence(projectId: string, userId: string): Promise<void> {
    try {
      const presenceKey = `presence:${projectId}`;
      const userKey = `user:${userId}`;

      // Get user info before removal for broadcast
      const userData = await this.redis.hget(presenceKey, userKey);
      let userInfo: UserPresence | null = null;

      if (userData) {
        userInfo = JSON.parse(userData);
      }

      // Remove from presence hash
      await this.redis.hdel(presenceKey, userKey);

      // Remove typing indicator if exists
      const typingKey = `typing:${projectId}:${userId}`;
      await this.redis.del(typingKey);

      // Broadcast user left event
      if (userInfo) {
        const update: PresenceUpdate = {
          projectId,
          user: {
            userId,
            userType: userInfo.userType,
            isTyping: false,
            lastSeen: userInfo.lastSeen,
            isOnline: false
          },
          event: 'user_left',
          timestamp: new Date().toISOString()
        };

        await this.broadcastPresence(projectId, update);
      }

      console.log('[PresenceService] Removed presence:', {
        projectId,
        userId
      });

    } catch (error) {
      console.error('[PresenceService] Error removing presence:', error);
      throw new Error('Failed to remove presence');
    }
  }

  /**
   * Get all active users in a project
   */
  async getActiveUsers(projectId: string): Promise<ActiveUser[]> {
    try {
      const presenceKey = `presence:${projectId}`;
      const usersData = await this.redis.hgetall(presenceKey);

      const activeUsers: ActiveUser[] = [];
      const now = Date.now();
      const staleThreshold = now - (this.PRESENCE_TTL * 1000);

      // First pass: parse all users and collect typing keys to check
      const parsedUsers: { userKey: string; presence: UserPresence }[] = [];
      const typingKeysToCheck: string[] = [];

      for (const [userKey, userData] of Object.entries(usersData)) {
        try {
          const presence: UserPresence = JSON.parse(userData);

          // Skip stale presence data
          if (presence.lastSeen < staleThreshold) {
            // Clean up stale data
            await this.redis.hdel(presenceKey, userKey);
            continue;
          }

          parsedUsers.push({ userKey, presence });
          typingKeysToCheck.push(`typing:${projectId}:${presence.userId}`);

        } catch (parseError) {
          console.error('[PresenceService] Error parsing user data:', parseError);
          // Clean up corrupted data
          await this.redis.hdel(presenceKey, userKey);
        }
      }

      // Batch check all typing keys with pipeline (fixes N+1 Redis calls)
      let typingResults: (number | null)[] = [];
      if (typingKeysToCheck.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of typingKeysToCheck) {
          pipeline.exists(key);
        }
        const results = await pipeline.exec();
        typingResults = results?.map(([, result]) => result as number | null) || [];
      }

      // Build active users list with typing status
      for (let i = 0; i < parsedUsers.length; i++) {
        const { presence } = parsedUsers[i]!;
        const isTyping = (typingResults[i] ?? 0) === 1;

        activeUsers.push({
          userId: presence.userId,
          userType: presence.userType,
          isTyping,
          lastSeen: presence.lastSeen,
          isOnline: true
        });
      }

      return activeUsers.sort((a, b) => b.lastSeen - a.lastSeen);

    } catch (error) {
      console.error('[PresenceService] Error getting active users:', error);
      throw new Error('Failed to get active users');
    }
  }

  // =====================================================================
  // Typing Indicators
  // =====================================================================

  /**
   * Set typing indicator
   */
  async setTyping(
    projectId: string,
    userId: string,
    userType: 'client' | 'assistant' | 'advisor',
    isTyping: boolean
  ): Promise<void> {
    try {
      const typingKey = `typing:${projectId}:${userId}`;

      if (isTyping) {
        // Set typing indicator with TTL
        await this.redis.setex(typingKey, this.TYPING_TTL, '1');

        // Also update their presence to refresh TTL
        await this.updatePresence(projectId, userId, userType);
      } else {
        // Remove typing indicator
        await this.redis.del(typingKey);
      }

      // Broadcast typing indicator
      const indicator: TypingIndicator = {
        projectId,
        userId,
        userType,
        isTyping,
        timestamp: new Date().toISOString()
      };

      await this.broadcastTyping(projectId, indicator);

      // console.log('[PresenceService] Set typing indicator:', {
      //   projectId,
      //   userId,
      //   isTyping
      // });

    } catch (error) {
      console.error('[PresenceService] Error setting typing indicator:', error);
      throw new Error('Failed to set typing indicator');
    }
  }

  /**
   * Get typing users in a project
   * Uses SCAN instead of KEYS to avoid blocking Redis in production
   */
  async getTypingUsers(projectId: string): Promise<string[]> {
    try {
      const pattern = `typing:${projectId}:*`;
      const typingUsers: string[] = [];
      let cursor = '0';

      // Use SCAN instead of KEYS to avoid blocking Redis
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        for (const key of keys) {
          // Extract userId from key: typing:projectId:userId
          const userId = key.split(':').pop();
          if (userId) {
            typingUsers.push(userId);
          }
        }
      } while (cursor !== '0');

      return typingUsers;

    } catch (error) {
      console.error('[PresenceService] Error getting typing users:', error);
      return [];
    }
  }

  // =====================================================================
  // Broadcasting
  // =====================================================================

  /**
   * Broadcast presence update to subscribers
   */
  private async broadcastPresence(projectId: string, update: PresenceUpdate): Promise<void> {
    try {
      const channel = `presence:${projectId}`;
      await this.publishRedis.publish(channel, JSON.stringify(update));

      // Also publish to general chat channel for SSE clients
      const chatChannel = `chat:${projectId}`;
      const chatEvent = {
        event: 'presence.updated',
        data: update,
        timestamp: update.timestamp
      };

      await this.publishRedis.publish(chatChannel, JSON.stringify(chatEvent));

    } catch (error) {
      console.error('[PresenceService] Error broadcasting presence:', error);
    }
  }

  /**
   * Broadcast typing indicator to subscribers
   */
  private async broadcastTyping(projectId: string, indicator: TypingIndicator): Promise<void> {
    try {
      const channel = `typing:${projectId}`;
      await this.publishRedis.publish(channel, JSON.stringify(indicator));

      // Also publish to general chat channel for SSE clients
      const chatChannel = `chat:${projectId}`;
      const chatEvent = {
        event: 'typing',
        data: indicator,
        timestamp: indicator.timestamp
      };

      await this.publishRedis.publish(chatChannel, JSON.stringify(chatEvent));

    } catch (error) {
      console.error('[PresenceService] Error broadcasting typing:', error);
    }
  }

  // =====================================================================
  // Cleanup and Utilities
  // =====================================================================

  /**
   * Clean up stale presence data for a project
   */
  async cleanupStalePresence(projectId: string): Promise<number> {
    try {
      const presenceKey = `presence:${projectId}`;
      const usersData = await this.redis.hgetall(presenceKey);

      let cleaned = 0;
      const now = Date.now();
      const staleThreshold = now - (this.PRESENCE_TTL * 2000); // 2x TTL for safety

      for (const [userKey, userData] of Object.entries(usersData)) {
        try {
          const presence: UserPresence = JSON.parse(userData);

          if (presence.lastSeen < staleThreshold) {
            await this.redis.hdel(presenceKey, userKey);
            cleaned++;
          }

        } catch (parseError) {
          // Clean up corrupted data
          await this.redis.hdel(presenceKey, userKey);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[PresenceService] Cleaned ${cleaned} stale presence records for project ${projectId}`);
      }

      return cleaned;

    } catch (error) {
      console.error('[PresenceService] Error cleaning stale presence:', error);
      return 0;
    }
  }

  /**
   * Subscribe to presence updates for a project
   */
  async subscribeToPresence(
    projectId: string,
    callback: (update: PresenceUpdate) => void
  ): Promise<() => void> {
    const subscriber = this.redis.duplicate();
    const channel = `presence:${projectId}`;

    await subscriber.subscribe(channel);

    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const update: PresenceUpdate = JSON.parse(message);
          callback(update);
        } catch (error) {
          console.error('[PresenceService] Error parsing presence update:', error);
        }
      }
    });

    // Return unsubscribe function
    return () => {
      subscriber.unsubscribe(channel);
      subscriber.disconnect();
    };
  }

  /**
   * Subscribe to typing indicators for a project
   */
  async subscribeToTyping(
    projectId: string,
    callback: (indicator: TypingIndicator) => void
  ): Promise<() => void> {
    const subscriber = this.redis.duplicate();
    const channel = `typing:${projectId}`;

    await subscriber.subscribe(channel);

    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const indicator: TypingIndicator = JSON.parse(message);
          callback(indicator);
        } catch (error) {
          console.error('[PresenceService] Error parsing typing indicator:', error);
        }
      }
    });

    // Return unsubscribe function
    return () => {
      subscriber.unsubscribe(channel);
      subscriber.disconnect();
    };
  }

  /**
   * Get recommended heartbeat interval for clients
   */
  getHeartbeatInterval(): number {
    return this.HEARTBEAT_INTERVAL * 1000; // Return in milliseconds
  }

  /**
   * Close Redis connections
   */
  async close(): Promise<void> {
    await this.redis.quit();
    await this.publishRedis.quit();
    console.log('[PresenceService] Redis connections closed');
  }

  // =====================================================================
  // I18n System Events
  // =====================================================================

  /**
   * Generate i18n-ready system event data for presence changes
   * Frontend can localize using the code + params
   */
  generatePresenceSystemEvent(
    event: 'user_joined' | 'user_left' | 'typing_start' | 'typing_stop',
    userId: string,
    userType: 'client' | 'assistant' | 'advisor',
    userName?: string
  ): PresenceSystemEvent {
    const timestamp = new Date().toISOString();

    const eventMap = {
      'user_joined': {
        code: 'presence.user_joined',
        params: { userId, userType, userName: userName || userId }
      },
      'user_left': {
        code: 'presence.user_left',
        params: { userId, userType, userName: userName || userId }
      },
      'typing_start': {
        code: 'presence.typing_start',
        params: { userId, userType, userName: userName || userId }
      },
      'typing_stop': {
        code: 'presence.typing_stop',
        params: { userId, userType, userName: userName || userId }
      }
    };

    return {
      ...eventMap[event],
      timestamp
    };
  }

  /**
   * Optional: Callback for integrating with EnhancedChatService
   * Set this callback to automatically create system messages
   */
  private onSystemEventCallback?: (
    projectId: string,
    systemEvent: PresenceSystemEvent
  ) => Promise<void>;

  setSystemEventCallback(
    callback: (projectId: string, systemEvent: PresenceSystemEvent) => Promise<void>
  ): void {
    this.onSystemEventCallback = callback;
  }

  // =====================================================================
  // Health Check
  // =====================================================================

  /**
   * Check if Redis is healthy
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message?: string }> {
    try {
      const testKey = 'health_check_test';
      await this.redis.set(testKey, 'ok', 'EX', 1);
      const result = await this.redis.get(testKey);

      if (result === 'ok') {
        return { status: 'healthy' };
      } else {
        return { status: 'unhealthy', message: 'Test key mismatch' };
      }

    } catch (error) {
      console.error('[PresenceService] Health check failed:', error);
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// =====================================================================
// Singleton Instance
// =====================================================================

let presenceServiceInstance: PresenceService | null = null;

export function getPresenceService(): PresenceService {
  if (!presenceServiceInstance) {
    presenceServiceInstance = new PresenceService();
  }
  return presenceServiceInstance;
}
