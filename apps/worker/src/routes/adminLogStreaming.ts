/**
 * Admin Log Streaming - Real-time WebSocket Log Streaming
 * 
 * Provides real-time log streaming via WebSocket for admin dashboard.
 * Supports filtering by tier, project, user, and log level.
 * 
 * Features:
 * - Real-time log streaming with WebSocket
 * - Multi-tier filtering (system, build, deploy, action, lifecycle)
 * - Project/user filtering for focused debugging
 * - Rate limiting to prevent WebSocket flooding
 * - Automatic disconnect on inactivity
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { unifiedLogger } from '../services/unifiedLogger';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

// SSE Connection Limits (Expert-recommended)
const MAX_SSE_CONNECTIONS = parseInt(process.env.MAX_SSE_CONNECTIONS || '50');

// Track active WebSocket connections
const activeConnections = new Map<string, {
  socket: any;
  filters: LogStreamFilters;
  lastActivity: number;
  backpressureStrikes?: number; // Expert addition for slow client tracking
}>();

interface LogStreamFilters {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  tier?: string[] | undefined;
  projectId?: string | undefined;
  userId?: string | undefined;
  buildId?: string | undefined;
  level?: string[] | undefined;
  since?: number | undefined;
}

interface LogStreamMessage {
  type: 'log' | 'ping' | 'error' | 'connected';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  data?: any | undefined;
  error?: string | undefined;
  timestamp?: number | undefined;
}

// Cleanup inactive connections every 5 minutes
setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
  
  for (const [connectionId, connection] of activeConnections) {
    if (now - connection.lastActivity > inactiveThreshold) {
      try {
        // Use proper ServerResponse termination methods
        connection.socket.end();
        activeConnections.delete(connectionId);
        
        loggingService.logServerEvent('websocket', 'info', 'Closed inactive log stream connection', {
          connectionId,
          inactiveFor: now - connection.lastActivity
        });
      } catch (error) {
        // Connection already closed or failed to close gracefully
        try {
          connection.socket.destroy?.();
        } catch {
          // Ignore destroy errors
        }
        activeConnections.delete(connectionId);
      }
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if log entry matches the connection filters
 */
function matchesFilters(logEntry: any, filters: LogStreamFilters): boolean {
  // Tier filtering
  if (filters.tier && filters.tier.length > 0) {
    if (!filters.tier.includes(logEntry.tier)) {
      return false;
    }
  }
  
  // Project filtering
  if (filters.projectId && logEntry.projectId !== filters.projectId) {
    return false;
  }
  
  // User filtering
  if (filters.userId && logEntry.userId !== filters.userId) {
    return false;
  }
  
  // Build filtering
  if (filters.buildId && logEntry.buildId !== filters.buildId) {
    return false;
  }
  
  // Level filtering (for system logs)
  if (filters.level && filters.level.length > 0) {
    if (logEntry.severity && !filters.level.includes(logEntry.severity)) {
      return false;
    }
  }
  
  // Time filtering
  if (filters.since && logEntry.timestamp) {
    const logTime = new Date(logEntry.timestamp).getTime();
    if (logTime < filters.since) {
      return false;
    }
  }
  
  return true;
}

/**
 * Broadcast log entry to matching SSE connections
 */
export function broadcastLogEntry(logEntry: any) {
  if (activeConnections.size === 0) {
    return; // No active connections
  }
  
  for (const [connectionId, connection] of activeConnections) {
    try {
      if (matchesFilters(logEntry, connection.filters)) {
        const message: LogStreamMessage = {
          type: 'log',
          data: logEntry,
          timestamp: Date.now()
        };
        
        // Expert-recommended backpressure handling - capture write() return value:
        const ok = connection.socket.write(`data: ${JSON.stringify(message)}\n\n`);
        if (!ok) {
          connection.backpressureStrikes = (connection.backpressureStrikes || 0) + 1;
          if (connection.backpressureStrikes >= 3) { // Drop chronic laggards after 3 strikes
            try { connection.socket.end(); } catch {}
            activeConnections.delete(connectionId);
            loggingService.logServerEvent('websocket','warn','Dropped slow SSE client',{ connectionId });
          }
        } else {
          connection.backpressureStrikes = 0; // Reset on successful write
        }
        connection.lastActivity = Date.now();
      }
    } catch (error) {
      // Connection error, remove it
      activeConnections.delete(connectionId);
      loggingService.logServerEvent('websocket', 'warn', 'Removed failed log stream connection', {
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default async function adminLogStreamingRoutes(fastify: FastifyInstance) {
  
  /**
   * Server-Sent Events endpoint for real-time log streaming
   * GET /admin/logs/stream-sse
   */
  fastify.get<{
    Querystring: {
      token?: string;
      tier?: string;
      projectId?: string;
      userId?: string;
      buildId?: string;
      level?: string;
      since?: string;
    };
  }>('/admin/logs/stream-sse', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: false
    })],
  }, async (request, reply) => {
    // Check connection limits (Expert-recommended)
    if (activeConnections.size >= MAX_SSE_CONNECTIONS) {
      return reply.code(429).send({
        error: 'Too many SSE connections',
        maxConnections: MAX_SSE_CONNECTIONS,
        activeConnections: activeConnections.size
      });
    }

    // Set up Server-Sent Events with enhanced headers
    const origin = process.env.ADMIN_ORIGIN || 'http://localhost:3000';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Cache-Control',
      'Vary': 'Origin'
    });

    const connectionId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Parse filters from query parameters
    const query = request.query;
    const filters: LogStreamFilters = {
      tier: query.tier ? query.tier.split(',') : undefined,
      projectId: query.projectId || undefined,
      userId: query.userId || undefined,
      buildId: query.buildId || undefined,
      level: query.level ? query.level.split(',') : undefined,
      since: query.since ? parseInt(query.since) : Date.now() - (5 * 60 * 1000) // Default: last 5 minutes
    };
    
    // Register connection (using raw response object for SSE)
    activeConnections.set(connectionId, {
      socket: reply.raw, // Use raw response for SSE
      filters,
      lastActivity: Date.now()
    });
    
    // Send connection confirmation
    const welcomeMessage: LogStreamMessage = {
      type: 'connected',
      data: {
        connectionId,
        filters,
        message: 'Real-time log streaming connected via SSE'
      },
      timestamp: Date.now()
    };
    reply.raw.write(`data: ${JSON.stringify(welcomeMessage)}\n\n`);
    
    loggingService.logServerEvent('websocket', 'info', 'Admin log SSE connection established', {
      connectionId,
      filters,
      remoteAddress: request.ip
    });
    
    // Keep connection alive with periodic pings
    const keepAlive = setInterval(() => {
      try {
        reply.raw.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
        
        // Update last activity
        const conn = activeConnections.get(connectionId);
        if (conn) {
          conn.lastActivity = Date.now();
        }
      } catch (error) {
        // Connection closed
        clearInterval(keepAlive);
        activeConnections.delete(connectionId);
      }
    }, 30000); // Ping every 30 seconds
    
    // Handle connection close
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      activeConnections.delete(connectionId);
      loggingService.logServerEvent('websocket', 'info', 'Admin log SSE connection closed', {
        connectionId
      });
    });
    
    // Handle connection errors
    request.raw.on('error', (error: Error) => {
      clearInterval(keepAlive);
      activeConnections.delete(connectionId);
      loggingService.logServerEvent('websocket', 'warn', 'Admin log SSE connection error', {
        connectionId,
        error: error.message
      });
    });
    
    // Don't return anything - keep the connection open
    return;
  });
  
  /**
   * GET /admin/logs/connections
   * Get active log streaming connections (for monitoring)
   */
  fastify.get<{}>('/admin/logs/connections', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: false
    })],
  }, async (request, reply) => {
    const connections = Array.from(activeConnections.entries()).map(([id, conn]) => ({
      connectionId: id,
      filters: conn.filters,
      lastActivity: conn.lastActivity,
      activeDuration: Date.now() - conn.lastActivity
    }));
    
    return reply.send({
      success: true,
      connections,
      totalConnections: connections.length
    });
  });
}