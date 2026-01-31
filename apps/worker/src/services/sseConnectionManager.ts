/**
 * SSE Connection Manager v2
 *
 * Production-ready after 5 rounds of expert review.
 * Implementation of SSE_ARCHITECTURE_ANALYSIS.md Phase 2.
 *
 * Key improvements:
 * - Atomic Lua script for connection management
 * - ZSET for O(log n) "find LRU" operation (least recently active)
 * - Reverse mapping (conn2inst) for clean eviction
 * - Hash tags for Redis Cluster compatibility
 * - Graceful server_close events instead of 429s
 */

import { randomUUID } from 'crypto';
import Redis from 'ioredis';

// =====================================================================
// Configuration
// =====================================================================

// SEMANTIC FIX: This is total connections per user+project, NOT per instance
// Leader-tab pattern means 1 connection per browser instance, but we allow
// up to 3 total across all instances (e.g., desktop + mobile + laptop)
const MAX_SSE_CONNECTIONS_PER_USER_PROJECT = 3;
// EXPERT FIX Round 12: Renamed for clarity - legacy system also uses per-user-per-project limit
// The name "PER_USER" was misleading since keys are ssev2:conns:${userId}:${projectId}
const MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY = 10; // Fallback limit (legacy tabs without client_instance_id)
const CONNECTION_TTL_SECONDS = 60; // 60 seconds
const CONNECTION_TTL_MS = CONNECTION_TTL_SECONDS * 1000;
const HEARTBEAT_REFRESH_MS = 25_000; // Refresh TTL every 25 seconds

// =====================================================================
// Lua Scripts for Atomic Operations
// =====================================================================

/**
 * Atomic connection registration with:
 * - ZSET for O(log n) "find LRU" (least recently active)
 * - Reverse mapping (conn2inst) for clean eviction
 * - Hash tags for Redis Cluster compatibility (ALL keys including meta)
 *
 * CRITICAL: Pass routing key via KEYS[1] for cluster mode
 * Returns JSON: { connectionId: string, evicted: string[] }
 */
const REGISTER_CONNECTION_SCRIPT = `
-- KEYS[1] = routing key (hash tag) for cluster routing
local userId = ARGV[1]
local projectId = ARGV[2]
local clientInstanceId = ARGV[3]
local newConnectionId = ARGV[4]
local metadata = ARGV[5]
local ttl = tonumber(ARGV[6])
local maxInstances = tonumber(ARGV[7])
local connectedAt = tonumber(ARGV[8])

-- Hash tag ensures all keys for same user+project are in same slot
local hashTag = '{' .. userId .. ':' .. projectId .. '}'
local connectionsKey = 'zconn:' .. hashTag
local instanceKey = 'instance:' .. hashTag .. ':' .. clientInstanceId
local conn2instKey = 'conn2inst:' .. hashTag .. ':'
local metaKeyPrefix = 'meta:' .. hashTag .. ':'  -- CLUSTER FIX: Add hash tag to meta keys
local evictedConnections = {}

-- Check for existing connection from same browser instance
local existingConnectionId = redis.call('GET', instanceKey)
if existingConnectionId then
  redis.call('ZREM', connectionsKey, existingConnectionId)
  redis.call('DEL', metaKeyPrefix .. existingConnectionId)
  redis.call('DEL', conn2instKey .. existingConnectionId)
  table.insert(evictedConnections, existingConnectionId)
end

-- Check connection limit using ZCARD (O(1))
local currentCount = redis.call('ZCARD', connectionsKey)
if currentCount >= maxInstances then
  -- EXPERT FIX Round 15: Get least recently active connection (LRU eviction)
  -- Score is last heartbeat timestamp, so ZRANGE 0 0 gets the stalest connection
  local leastRecent = redis.call('ZRANGE', connectionsKey, 0, 0)
  if #leastRecent > 0 then
    local lruId = leastRecent[1]

    -- Use reverse mapping to find and delete instance key
    local oldClientInstanceId = redis.call('GET', conn2instKey .. lruId)
    if oldClientInstanceId then
      redis.call('DEL', 'instance:' .. hashTag .. ':' .. oldClientInstanceId)
    end

    redis.call('ZREM', connectionsKey, lruId)
    redis.call('DEL', metaKeyPrefix .. lruId)
    redis.call('DEL', conn2instKey .. lruId)
    table.insert(evictedConnections, lruId)
  end
end

-- EXPERT FIX Round 15: Register new connection with current timestamp for LRU consistency
-- Use connectedAt (which is Date.now()) as initial score, will be updated on heartbeats
redis.call('ZADD', connectionsKey, connectedAt, newConnectionId)
redis.call('SET', metaKeyPrefix .. newConnectionId, metadata, 'EX', ttl)
redis.call('SET', instanceKey, newConnectionId, 'EX', ttl)
redis.call('SET', conn2instKey .. newConnectionId, clientInstanceId, 'EX', ttl)

-- Set TTL on ZSET
redis.call('EXPIRE', connectionsKey, ttl)

return cjson.encode({
  connectionId = newConnectionId,
  evicted = evictedConnections
})
`;

// =====================================================================
// Types
// =====================================================================

export interface SSEConnectionInfo {
  connectionId: string;
  userId: string;
  projectId: string;
  clientInstanceId?: string;  // Browser instance ID for leader-tab pattern (optional for legacy)
  connectedAt: number;
  lastHeartbeat: number;
  lastActivity: number;
  isTypingSnapshot: boolean;
  userAgent?: string | undefined;
  tabId?: string | undefined;
}

export interface ConnectionLimitResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  connectionId?: string;
  retryAfterMs?: number;
  reason?: 'all_typing' | 'eviction_failed' | 'eviction_success' | 'eviction_in_progress' | 'replaced';
  evicted?: string[];       // Connection IDs that were evicted (now array)
  suggestions?: string[];
}

export interface LuaScriptResult {
  connectionId: string;
  evicted: string[];
}

// =====================================================================
// SSE Connection Manager
// =====================================================================

export class SSEConnectionManager {
  private redis: Redis;
  private publishRedis: Redis; // Separate connection for publishing
  private registerScriptSha: string | null = null;
  private initialized = false;

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
      console.error('[SSEConnectionManager] Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('[SSEConnectionManager] Connected to Redis');
      // Load Lua script on connect
      this.loadScripts().catch(err => {
        console.error('[SSEConnectionManager] Failed to load Lua scripts:', err);
      });
    });
  }

  /**
   * Load Lua scripts into Redis
   */
  private async loadScripts(): Promise<void> {
    if (this.initialized) return;

    try {
      this.registerScriptSha = await this.redis.script('LOAD', REGISTER_CONNECTION_SCRIPT) as string;
      this.initialized = true;
      console.log('[SSEConnectionManager] Lua scripts loaded successfully');
    } catch (error) {
      console.error('[SSEConnectionManager] Failed to load Lua scripts:', error);
      throw error;
    }
  }

  /**
   * Ensure scripts are loaded before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.loadScripts();
    }
  }

  // =====================================================================
  // NEW: Atomic Connection Registration with Lua Script
  // =====================================================================

  /**
   * Register a new connection using atomic Lua script
   * Handles eviction of old connections gracefully
   */
  async registerConnectionAtomic(
    userId: string,
    projectId: string,
    clientInstanceId: string,
    options?: {
      userAgent?: string | undefined;
      tabId?: string | undefined;
      isTyping?: boolean | undefined;
    }
  ): Promise<{ connectionId: string; evicted: string[] }> {
    await this.ensureInitialized();

    const newConnectionId = randomUUID();
    const connectedAt = Date.now();
    const metadata = JSON.stringify({
      userId,
      projectId,
      clientInstanceId,
      connectedAt,
      lastHeartbeat: connectedAt,
      lastActivity: connectedAt,
      isTypingSnapshot: options?.isTyping || false,
      userAgent: options?.userAgent,
      tabId: options?.tabId
    });

    try {
      // CLUSTER FIX: Pass routing key via KEYS[1] for proper cluster routing
      const hashTag = `{${userId}:${projectId}}`;
      const routingKey = `zconn:${hashTag}`; // Use any key from the script for routing

      const result = await this.redis.evalsha(
        this.registerScriptSha!,
        1, // CLUSTER FIX: numkeys=1 for routing
        routingKey, // KEYS[1] for cluster routing
        userId,
        projectId,
        clientInstanceId,
        newConnectionId,
        metadata,
        CONNECTION_TTL_SECONDS.toString(),
        MAX_SSE_CONNECTIONS_PER_USER_PROJECT.toString(), // EXPERT FIX Round 14: Use atomic limit (3), not legacy (10)
        connectedAt.toString()
      );

      const parsed: LuaScriptResult = JSON.parse(result as string);

      // ✅ CRITICAL FIX: Lua cjson encodes empty tables as {} not []
      // Ensure evicted is always an array to prevent "evicted is not iterable" error
      const evicted = Array.isArray(parsed.evicted) ? parsed.evicted : [];

      console.log('[SSEConnectionManager] Connection registered:', {
        connectionId: newConnectionId.substring(0, 8),
        clientInstanceId: clientInstanceId.substring(0, 8),
        evictedCount: evicted.length,
        userId: userId.substring(0, 8),
        projectId: projectId.substring(0, 8)
      });

      return {
        connectionId: parsed.connectionId,
        evicted
      };
    } catch (error: any) {
      // Handle NOSCRIPT error (script not cached)
      if (error.message?.includes('NOSCRIPT')) {
        console.warn('[SSEConnectionManager] Script not cached, reloading...');
        this.initialized = false;
        await this.loadScripts();
        return this.registerConnectionAtomic(userId, projectId, clientInstanceId, options);
      }
      throw error;
    }
  }

  /**
   * Send graceful close notification to evicted connections
   */
  async sendGracefulClose(connectionId: string, reason: string): Promise<void> {
    try {
      await this.publishRedis.publish(`sse:${connectionId}`, JSON.stringify({
        event: 'server_close',
        data: { reason, timestamp: Date.now() }
      }));

      console.log('[SSEConnectionManager] Graceful close sent:', {
        connectionId: connectionId.substring(0, 8),
        reason
      });
    } catch (error) {
      console.error('[SSEConnectionManager] Failed to send graceful close:', error);
    }
  }

  /**
   * Refresh ALL related TTLs for a connection
   * CLUSTER FIX: Use hashed meta keys
   */
  async refreshConnectionAtomic(
    connectionId: string,
    userId: string,
    projectId: string,
    clientInstanceId: string
  ): Promise<void> {
    const hashTag = `{${userId}:${projectId}}`;
    const metaKey = `meta:${hashTag}:${connectionId}`; // CLUSTER FIX: Add hash tag
    const instanceKey = `instance:${hashTag}:${clientInstanceId}`;
    const conn2instKey = `conn2inst:${hashTag}:${connectionId}`;
    const connectionsKey = `zconn:${hashTag}`;

    try {
      const pipeline = this.redis.pipeline();

      // Update metadata with new heartbeat timestamp
      const existing = await this.redis.get(metaKey);
      if (existing) {
        const meta = JSON.parse(existing);
        meta.lastHeartbeat = Date.now();
        pipeline.set(metaKey, JSON.stringify(meta), 'EX', CONNECTION_TTL_SECONDS);
      }

      // Refresh all TTLs
      pipeline.expire(instanceKey, CONNECTION_TTL_SECONDS);
      pipeline.expire(conn2instKey, CONNECTION_TTL_SECONDS);
      pipeline.expire(connectionsKey, CONNECTION_TTL_SECONDS);

      // Update ZSET score to current time
      pipeline.zadd(connectionsKey, Date.now(), connectionId);

      await pipeline.exec();
    } catch (error) {
      console.error('[SSEConnectionManager] Error refreshing connection:', error);
    }
  }

  /**
   * Remove connection and all related keys
   * CLUSTER FIX: Use hashed meta keys
   */
  async removeConnectionAtomic(
    connectionId: string,
    userId: string,
    projectId: string,
    clientInstanceId: string
  ): Promise<void> {
    const hashTag = `{${userId}:${projectId}}`;
    const pipeline = this.redis.pipeline();

    pipeline.zrem(`zconn:${hashTag}`, connectionId);
    pipeline.del(`meta:${hashTag}:${connectionId}`); // CLUSTER FIX: Add hash tag
    pipeline.del(`conn2inst:${hashTag}:${connectionId}`);

    // Only delete instance key if it still points to this connection
    const currentMapping = await this.redis.get(`instance:${hashTag}:${clientInstanceId}`);
    if (currentMapping === connectionId) {
      pipeline.del(`instance:${hashTag}:${clientInstanceId}`);
    }

    await pipeline.exec();

    console.log('[SSEConnectionManager] Connection removed:', {
      connectionId: connectionId.substring(0, 8),
      clientInstanceId: clientInstanceId.substring(0, 8)
    });
  }

  /**
   * EXPERT FIX: Start heartbeat for atomic connections
   * Refreshes zconn, instance, conn2inst, and meta keys
   */
  startHeartbeatAtomic(
    connectionId: string,
    userId: string,
    projectId: string,
    clientInstanceId: string
  ): () => void {
    const interval = setInterval(() => {
      this.refreshConnectionAtomic(connectionId, userId, projectId, clientInstanceId);
    }, HEARTBEAT_REFRESH_MS);

    return () => clearInterval(interval);
  }

  // =====================================================================
  // Connection Limit Management
  // =====================================================================

  /**
   * Check if user can create new SSE connection
   * Returns connection ID if allowed, or denial info if limit exceeded
   */
  async checkConnectionLimit(
    userId: string,
    projectId: string,
    options?: {
      userAgent?: string;
      tabId?: string;
      isTyping?: boolean;
    }
  ): Promise<ConnectionLimitResult> {
    try {
      const key = this.getConnectionKey(userId, projectId);
      const connectionId = randomUUID();

      // Atomic operation to check and potentially add connection
      const pipeline = this.redis.pipeline();

      // Add connection to set (won't add if already exists)
      pipeline.sadd(key, connectionId);
      pipeline.scard(key); // Get count after potential add
      pipeline.pexpire(key, CONNECTION_TTL_MS); // Refresh TTL

      const results = await pipeline.exec();

      if (!results || results.some(([err]) => err)) {
        throw new Error('Redis pipeline failed');
      }

      const countResult = results[1];
      const connectionCount = (countResult?.[1] ?? 0) as number;

      if (connectionCount > MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY) {
        // Remove the connection we just added
        await this.redis.srem(key, connectionId);

        return {
          allowed: false,
          currentCount: connectionCount - 1,
          maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY,
          retryAfterMs: 10_000 // Tell client to retry in 10 seconds
        };
      }

      // Track connection metadata
      const now = Date.now();
      const connectionInfo: SSEConnectionInfo = {
        connectionId,
        userId,
        projectId,
        connectedAt: now,
        lastHeartbeat: now,
        lastActivity: now,
        isTypingSnapshot: options?.isTyping || false,
        userAgent: options?.userAgent,
        tabId: options?.tabId
      };

      const metadataKey = this.getConnectionMetadataKey(connectionId);
      await this.redis.setex(
        metadataKey,
        Math.ceil(CONNECTION_TTL_MS / 1000),
        JSON.stringify(connectionInfo)
      );

      console.log('[SSEConnectionManager] Connection allowed:', {
        userId,
        projectId,
        connectionId: connectionId.substring(0, 8),
        currentCount: connectionCount,
        maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY
      });

      return {
        allowed: true,
        currentCount: connectionCount,
        maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY,
        connectionId
      };

    } catch (error) {
      console.error('[SSEConnectionManager] Error checking connection limit:', error);

      // On Redis errors, allow connection (fail open)
      return {
        allowed: true,
        currentCount: 0,
        maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY,
        connectionId: randomUUID()
      };
    }
  }

  /**
   * Start heartbeat to keep connection alive in Redis
   * Returns cleanup function
   */
  startHeartbeat(connectionId: string, userId: string, projectId: string): () => void {
    const heartbeatInterval = setInterval(async () => {
      try {
        const key = this.getConnectionKey(userId, projectId);
        const metadataKey = this.getConnectionMetadataKey(connectionId);

        // Check if connection still exists
        const exists = await this.redis.sismember(key, connectionId);
        if (!exists) {
          console.warn('[SSEConnectionManager] Connection no longer tracked, stopping heartbeat:', {
            connectionId: connectionId.substring(0, 8)
          });
          clearInterval(heartbeatInterval);
          return;
        }

        // Refresh TTL for both connection set and metadata
        const pipeline = this.redis.pipeline();
        pipeline.pexpire(key, CONNECTION_TTL_MS);
        pipeline.pexpire(metadataKey, CONNECTION_TTL_MS); // ✅ Fixed: pexpire expects ms

        // Update metadata heartbeat timestamp
        const metadataStr = await this.redis.get(metadataKey);
        if (metadataStr) {
          const metadata: SSEConnectionInfo = JSON.parse(metadataStr);
          metadata.lastHeartbeat = Date.now();
          pipeline.setex(metadataKey, Math.ceil(CONNECTION_TTL_MS / 1000), JSON.stringify(metadata));
        }

        await pipeline.exec();

      } catch (error) {
        console.error('[SSEConnectionManager] Heartbeat error:', error);
      }
    }, HEARTBEAT_REFRESH_MS);

    // Return cleanup function
    return () => {
      clearInterval(heartbeatInterval);
    };
  }

  /**
   * Remove connection when client disconnects
   */
  async removeConnection(connectionId: string, userId: string, projectId: string): Promise<void> {
    try {
      const key = this.getConnectionKey(userId, projectId);
      const metadataKey = this.getConnectionMetadataKey(connectionId);

      const pipeline = this.redis.pipeline();

      // Remove connection from set
      pipeline.srem(key, connectionId);

      // Clean up metadata
      pipeline.del(metadataKey);

      // Get remaining count
      pipeline.scard(key);

      const results = await pipeline.exec();
      const countResult = results?.[2];
      const remainingCount = (countResult?.[1] ?? 0) as number;

      // If no connections left, clean up the key
      if (remainingCount === 0) {
        await this.redis.del(key);
      }

      console.log('[SSEConnectionManager] Connection removed:', {
        userId,
        projectId,
        connectionId: connectionId.substring(0, 8),
        remainingCount
      });

    } catch (error) {
      console.error('[SSEConnectionManager] Error removing connection:', error);
    }
  }

  // =====================================================================
  // Monitoring and Cleanup
  // =====================================================================

  /**
   * Get current connection count for user/project (legacy SET system)
   */
  async getConnectionCount(userId: string, projectId: string): Promise<number> {
    try {
      const key = this.getConnectionKey(userId, projectId);
      return await this.redis.scard(key);
    } catch (error) {
      console.error('[SSEConnectionManager] Error getting connection count:', error);
      return 0;
    }
  }

  /**
   * EXPERT FIX: Get atomic ZSET connection count
   */
  async getConnectionCountAtomic(userId: string, projectId: string): Promise<number> {
    try {
      const hashTag = `{${userId}:${projectId}}`;
      const connectionsKey = `zconn:${hashTag}`;
      return await this.redis.zcard(connectionsKey);
    } catch (error) {
      console.error('[SSEConnectionManager] Error getting atomic connection count:', error);
      return 0;
    }
  }

  /**
   * Get all active connections for a user/project with metadata (legacy SET system)
   */
  async getActiveConnections(userId: string, projectId: string): Promise<SSEConnectionInfo[]> {
    try {
      const key = this.getConnectionKey(userId, projectId);
      const connectionIds = await this.redis.smembers(key);

      if (connectionIds.length === 0) return [];

      // Get metadata for all connections
      const metadataKeys = connectionIds.map(id => this.getConnectionMetadataKey(id));
      const metadataResults = await this.redis.mget(...metadataKeys);

      const connections: SSEConnectionInfo[] = [];

      for (let i = 0; i < connectionIds.length; i++) {
        const metadataStr = metadataResults[i];
        if (metadataStr) {
          try {
            connections.push(JSON.parse(metadataStr));
          } catch (parseError) {
            console.warn('[SSEConnectionManager] Failed to parse connection metadata:', parseError);
          }
        }
      }

      return connections;

    } catch (error) {
      console.error('[SSEConnectionManager] Error getting active connections:', error);
      return [];
    }
  }

  /**
   * EXPERT FIX: Get active connections from atomic ZSET system
   */
  async getActiveConnectionsAtomic(userId: string, projectId: string): Promise<SSEConnectionInfo[]> {
    try {
      const hashTag = `{${userId}:${projectId}}`;
      const connectionsKey = `zconn:${hashTag}`;

      // Get all connection IDs from ZSET
      const connectionIds = await this.redis.zrange(connectionsKey, 0, -1);

      if (connectionIds.length === 0) return [];

      // Get metadata for all connections (with hash tag)
      const metadataKeys = connectionIds.map(id => `meta:${hashTag}:${id}`);
      const metadataResults = await this.redis.mget(...metadataKeys);

      const connections: SSEConnectionInfo[] = [];

      for (let i = 0; i < connectionIds.length; i++) {
        const metadataStr = metadataResults[i];
        if (metadataStr) {
          try {
            connections.push(JSON.parse(metadataStr));
          } catch (parseError) {
            console.warn('[SSEConnectionManager] Failed to parse atomic connection metadata:', parseError);
          }
        }
      }

      return connections;

    } catch (error) {
      console.error('[SSEConnectionManager] Error getting atomic active connections:', error);
      return [];
    }
  }

  /**
   * Clean up zombie connections (no recent heartbeats)
   * This prevents counting dead connections toward the limit
   * FIXED: Use SET operations consistently (was causing WRONGTYPE errors)
   */
  private async cleanupZombieConnections(userId: string, projectId: string): Promise<number> {
    try {
      const key = this.getConnectionKey(userId, projectId);
      
      // Use SET operations consistently (matches sadd/srem pattern)
      const connectionIds = await this.redis.smembers(key);
      
      let cleaned = 0;
      const now = Date.now();
      const staleThreshold = now - CONNECTION_TTL_MS; // 45 seconds

      for (const connectionId of connectionIds) {
        const metadataKey = this.getConnectionMetadataKey(connectionId);
        const metadataStr = await this.redis.get(metadataKey);
        
        if (!metadataStr) {
          // No metadata = zombie connection
          await this.redis.srem(key, connectionId);
          cleaned++;
          console.log('[SSEConnectionManager] Cleaned zombie connection (no metadata):', {
            connectionId: connectionId.substring(0, 8)
          });
          continue;
        }

        try {
          const conn: SSEConnectionInfo = JSON.parse(metadataStr);
          if (conn.lastHeartbeat < staleThreshold) {
            await this.redis.srem(key, connectionId);
            await this.redis.del(metadataKey);
            cleaned++;
            
            console.log('[SSEConnectionManager] Cleaned zombie connection (stale heartbeat):', {
              connectionId: connectionId.substring(0, 8),
              lastHeartbeat: new Date(conn.lastHeartbeat).toISOString(),
              ageMs: now - conn.lastHeartbeat
            });
          }
        } catch (parseError) {
          // Corrupted metadata = zombie connection
          await this.redis.srem(key, connectionId);
          await this.redis.del(metadataKey);
          cleaned++;
          console.log('[SSEConnectionManager] Cleaned zombie connection (corrupted metadata):', {
            connectionId: connectionId.substring(0, 8),
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
          });
        }
      }

      return cleaned;
    } catch (error) {
      console.error('[SSEConnectionManager] Error cleaning zombie connections:', error);
      return 0;
    }
  }

  /**
   * Get active connections with current typing status from PresenceService
   */
  async getActiveConnectionsWithTyping(userId: string, projectId: string): Promise<SSEConnectionInfo[]> {
    const connections = await this.getActiveConnections(userId, projectId);

    // ✅ Use singleton to avoid Redis connection spam
    const { getPresenceService } = await import('./presenceService');
    const presenceService = getPresenceService();

    try {
      // Get current typing status
      const activeUsers = await presenceService.getActiveUsers(projectId);
      const typingUser = activeUsers.find(u => u.userId === userId && u.isTyping);
      const isCurrentlyTyping = !!typingUser;

      // Update connections with current typing status if they don't have it
      return connections.map(conn => ({
        ...conn,
        isTypingSnapshot: conn.isTypingSnapshot || isCurrentlyTyping
      }));
    } catch (error) {
      console.warn('[SSEConnectionManager] Could not fetch typing status:', error);
      return connections;
    }
  }

  /**
   * Select victim for eviction using expert's priority tuple
   */
  private selectEvictionVictim(connections: SSEConnectionInfo[]): SSEConnectionInfo | null {
    // Expert's priority: (isTyping, lastActivity, connectedAt)
    const candidates = connections
      .filter(c => !c.isTypingSnapshot) // Don't evict typing users
      .sort((a, b) => {
        // Sort by lastActivity first (least recent activity first = LRU)
        if (a.lastActivity !== b.lastActivity) return a.lastActivity - b.lastActivity;
        // Then by connectedAt (least recent connection first as tiebreaker)
        return a.connectedAt - b.connectedAt;
      });

    return candidates[0] || null;
  }

  /**
   * New method with eviction logic (replaces checkConnectionLimit)
   */
  async checkConnectionLimitWithEviction(
    userId: string,
    projectId: string,
    options?: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      userAgent?: string | undefined;
      tabId?: string | undefined;
      isTyping?: boolean | undefined;
    }
  ): Promise<ConnectionLimitResult> {
    try {
      // 1. Clean up zombie connections first (expert's advice)
      const cleaned = await this.cleanupZombieConnections(userId, projectId);
      if (cleaned > 0) {
        console.log('[SSEConnectionManager] Cleaned up zombie connections:', {
          userId: userId.substring(0, 8),
          projectId: projectId.substring(0, 8),
          zombiesRemoved: cleaned
        });
      }

      // 2. Get current live connections with typing status
      const connections = await this.getActiveConnectionsWithTyping(userId, projectId);

      if (connections.length < MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY) {
        // Under limit - allow connection
        const connectionId = randomUUID();

        // Store new connection metadata
        await this.storeConnectionMetadata(connectionId, userId, projectId, options);

        return {
          allowed: true,
          connectionId,
          currentCount: connections.length + 1,
          maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY
        };
      }

      // 2. Find eviction victim
      const victim = this.selectEvictionVictim(connections);

      if (!victim) {
        // All connections are actively typing - fallback to 429
        console.warn('[SSEConnectionManager] All connections are typing, cannot evict:', {
          userId, projectId, connectionCount: connections.length
        });

        return {
          allowed: false,
          reason: 'all_typing',
          currentCount: connections.length,
          maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY,
          retryAfterMs: 5000,
          suggestions: [
            'Finish typing in other tabs',
            'Wait for typing to complete',
            'Close other chat tabs manually'
          ]
        };
      }

      // 3. Attempt atomic eviction
      const success = await this.attemptEviction(victim, userId, projectId);

      if (success) {
        // Store new connection metadata
        const newConnectionId = randomUUID();
        await this.storeConnectionMetadata(newConnectionId, userId, projectId, options);

        console.log('[SSEConnectionManager] Successfully evicted connection:', {
          userId, projectId,
          evicted: victim.connectionId.substring(0, 8),
          new: newConnectionId.substring(0, 8),
          reason: 'connection.takeover'
        });

        return {
          allowed: true,
          connectionId: newConnectionId,
          currentCount: connections.length, // Same count after replacement
          maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY,
          reason: 'eviction_success',
          evicted: [victim.connectionId] // Wrapped in array for type consistency
        };
      } else {
        // Expert's advice: Use 202 (eviction in progress) instead of 429
        return {
          allowed: false,
          reason: 'eviction_in_progress',
          currentCount: connections.length,
          maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY,
          retryAfterMs: 2000, // Shorter retry for in-progress eviction
          suggestions: [
            'Eviction in progress - please retry in 2 seconds',
            'Another tab is being disconnected',
            'Connection will be available shortly'
          ]
        };
      }

    } catch (error) {
      console.error('[SSEConnectionManager] Error in checkConnectionLimitWithEviction:', error);

      // On errors, fall back to allowing connection (fail open)
      return {
        allowed: true,
        connectionId: randomUUID(),
        currentCount: 0,
        maxAllowed: MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY
      };
    }
  }

  /**
   * Store connection metadata in Redis
   * ENHANCED: Enforces SET type at write-time to prevent WRONGTYPE errors
   */
  private async storeConnectionMetadata(
    connectionId: string,
    userId: string,
    projectId: string,
    options?: {
      userAgent?: string | undefined;
      tabId?: string | undefined;
      isTyping?: boolean | undefined;
    }
  ): Promise<void> {
    const now = Date.now();
    const connectionInfo: SSEConnectionInfo = {
      connectionId,
      userId,
      projectId,
      connectedAt: now,
      lastHeartbeat: now,
      lastActivity: now,
      isTypingSnapshot: options?.isTyping || false,
      userAgent: options?.userAgent,
      tabId: options?.tabId
    };

    const key = this.getConnectionKey(userId, projectId);
    
    // Enforce SET type before writing (expert recommendation)
    const keyType = await this.redis.type(key);
    if (keyType !== 'none' && keyType !== 'set') {
      console.warn('[SSEConnectionManager] Wrong key type detected, self-healing:', { 
        key, 
        type: keyType,
        userId: userId.substring(0, 8),
        projectId: projectId.substring(0, 8)
      });
      await this.redis.del(key);
    }
    
    // Add to connection set
    await this.redis.sadd(key, connectionId);
    await this.redis.expire(key, Math.ceil(CONNECTION_TTL_MS / 1000));

    // Store metadata
    const metadataKey = this.getConnectionMetadataKey(connectionId);
    await this.redis.setex(
      metadataKey,
      Math.ceil(CONNECTION_TTL_MS / 1000),
      JSON.stringify(connectionInfo)
    );
  }

  /**
   * Attempt to evict a victim connection with graceful disconnection
   */
  private async attemptEviction(
    victim: SSEConnectionInfo,
    userId: string,
    projectId: string
  ): Promise<boolean> {
    try {
      // 1. Send graceful notice via Redis pub/sub (best effort)
      await this.sendEvictionNotice(victim.connectionId, {
        type: 'connection.takeover',
        message: 'Chat opened in another tab - this connection will close in 3 seconds',
        countdown: 3000,
        canReconnect: true,
        timestamp: new Date().toISOString()
      });

      // 2. Schedule force disconnection (expert's "always force-close" advice)
      setTimeout(async () => {
        await this.forceDisconnectConnection(victim.connectionId, userId, projectId);
      }, 3000);

      // 3. Mark as evicted in Redis (atomic operation)
      const success = await this.markConnectionEvicted(victim.connectionId);

      if (success) {
        console.log('[SSEConnectionManager] Eviction initiated for:', {
          connectionId: victim.connectionId.substring(0, 8),
          userId,
          projectId,
          connectedAt: new Date(victim.connectedAt).toISOString(),
          gracePeriod: '3000ms'
        });
      }

      return success;

    } catch (error) {
      console.error('[SSEConnectionManager] Error attempting eviction:', error);
      return false;
    }
  }

  /**
   * Send eviction notice via Redis pub/sub
   */
  private async sendEvictionNotice(
    connectionId: string,
    notice: {
      type: 'connection.takeover';
      message: string;
      countdown: number;
      canReconnect: boolean;
      timestamp: string;
    }
  ): Promise<void> {
    try {
      const channel = `sse:${connectionId}`;
      const message = JSON.stringify({
        event: 'eviction_notice',
        data: notice
      });

      await this.publishRedis.publish(channel, message);
      console.log('[SSEConnectionManager] Eviction notice sent:', {
        connectionId: connectionId.substring(0, 8),
        channel
      });
    } catch (error) {
      console.warn('[SSEConnectionManager] Failed to send eviction notice:', error);
      // Non-fatal - we'll still force disconnect after grace period
    }
  }

  /**
   * Mark connection as evicted (atomic Redis operation)
   */
  private async markConnectionEvicted(connectionId: string): Promise<boolean> {
    try {
      // Use Redis SETNX for atomic "evicting" flag
      const evictKey = `ssev2:evicting:${connectionId}`;
      const deadline = Date.now() + 3000; // 3 second grace period

      // Atomic set with expiration
      const result = await this.redis.set(evictKey, deadline, 'PX', 5000, 'NX');
      return result === 'OK';
    } catch (error) {
      console.error('[SSEConnectionManager] Error marking connection evicted:', error);
      return false;
    }
  }

  /**
   * Force disconnect a connection after grace period
   */
  private async forceDisconnectConnection(
    connectionId: string,
    userId: string,
    projectId: string
  ): Promise<void> {
    try {
      // Check if connection is still marked for eviction
      const evictKey = `ssev2:evicting:${connectionId}`;
      const evictData = await this.redis.get(evictKey);

      if (!evictData) {
        // Eviction was cancelled or expired
        return;
      }

      // Force remove connection from Redis
      await this.removeConnection(connectionId, userId, projectId);

      // Send final disconnection notice
      await this.publishRedis.publish(`sse:${connectionId}`, JSON.stringify({
        event: 'force_disconnect',
        data: {
          reason: 'evicted',
          message: 'Connection forcefully closed due to new tab',
          timestamp: new Date().toISOString()
        }
      }));

      console.log('[SSEConnectionManager] Force disconnected evicted connection:', {
        connectionId: connectionId.substring(0, 8),
        userId,
        projectId
      });

    } catch (error) {
      console.error('[SSEConnectionManager] Error force disconnecting:', error);
    }
  }

  /**
   * Clean up stale connections (should be automatic via TTL, but good to have)
   */
  async cleanupStaleConnections(userId: string, projectId: string): Promise<number> {
    try {
      const connections = await this.getActiveConnections(userId, projectId);
      const now = Date.now();
      const staleThreshold = CONNECTION_TTL_MS * 2; // 2x TTL for safety

      let cleaned = 0;

      for (const connection of connections) {
        if (now - connection.lastHeartbeat > staleThreshold) {
          await this.removeConnection(connection.connectionId, userId, projectId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[SSEConnectionManager] Cleaned ${cleaned} stale connections for user ${userId} project ${projectId}`);
      }

      return cleaned;

    } catch (error) {
      console.error('[SSEConnectionManager] Error cleaning stale connections:', error);
      return 0;
    }
  }

  // =====================================================================
  // Public Configuration Access
  // =====================================================================
  
  /**
   * Get maximum allowed connections per user (for debug endpoints - legacy)
   */
  getMaxConnections(): number {
    return MAX_SSE_CONNECTIONS_PER_USER_PROJECT_LEGACY;
  }

  /**
   * Get maximum allowed connections per user+project (for debug endpoints - atomic)
   */
  getMaxConnectionsAtomic(): number {
    return MAX_SSE_CONNECTIONS_PER_USER_PROJECT; // EXPERT FIX Round 14: Use atomic limit (3), not legacy (10)
  }

  // =====================================================================
  // Utilities
  // =====================================================================

  /**
   * Self-healing wrapper for HGETALL operations
   * Automatically deletes corrupted keys that have wrong data type
   */
  private async safeHGetAll(key: string): Promise<Record<string, string>> {
    try {
      return await this.redis.hgetall(key);
    } catch (err: any) {
      if (String(err?.message || '').includes('WRONGTYPE')) {
        console.warn('[SSEConnectionManager] Self-healing WRONGTYPE key:', key);
        await this.redis.del(key);
        return {};
      }
      throw err;
    }
  }

  private getConnectionKey(userId: string, projectId: string): string {
    return `ssev2:conns:${userId}:${projectId}`;
  }

  private getConnectionMetadataKey(connectionId: string): string {
    return `ssev2:meta:${connectionId}`;
  }

  /**
   * Health check for Redis connectivity
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message?: string }> {
    try {
      const testKey = 'sse_health_check_test';
      await this.redis.set(testKey, 'ok', 'EX', 1);
      const result = await this.redis.get(testKey);

      if (result === 'ok') {
        return { status: 'healthy' };
      } else {
        return { status: 'unhealthy', message: 'Test key mismatch' };
      }
    } catch (error) {
      console.error('[SSEConnectionManager] Health check failed:', error);
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Close Redis connections
   */
  async close(): Promise<void> {
    await this.redis.quit();
    await this.publishRedis.quit();
    console.log('[SSEConnectionManager] Redis connections closed');
  }
}

// =====================================================================
// Singleton Instance
// =====================================================================

let connectionManager: SSEConnectionManager | null = null;

export function getSSEConnectionManager(): SSEConnectionManager {
  if (!connectionManager) {
    connectionManager = new SSEConnectionManager();
  }
  return connectionManager;
}
