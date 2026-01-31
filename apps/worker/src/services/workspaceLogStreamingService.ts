import { EventEmitter } from 'events';
import type { FastifyReply } from 'fastify';
import type { LogTier } from './unifiedLogger';

export interface LogStreamEvent {
  id: string;
  timestamp: string;
  tier: LogTier;
  message: string;
  projectId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  sequence?: number | undefined;
}

export interface StreamClient {
  id: string;
  advisorId: string;
  projectId: string;
  reply: FastifyReply;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  lastEventId?: string | undefined;
  connected: boolean;
  filters: {
    tiers?: LogTier[] | undefined;
    since?: Date | undefined;
  };
}

/**
 * WorkspaceLogStreamingService - Real-time log streaming with SSE
 * Implements Last-Event-ID resume capability and proper connection management
 */
export class WorkspaceLogStreamingService extends EventEmitter {
  private clients = new Map<string, StreamClient>();
  private heartbeatInterval!: NodeJS.Timeout;
  private readonly HEARTBEAT_INTERVAL = 15000; // 15 seconds (consistent with plan)
  private eventSequence = 0;

  constructor() {
    super();
    this.setupHeartbeat();
  }

  /**
   * Start SSE stream for advisor workspace
   */
  async startLogStream(
    clientId: string,
    advisorId: string,
    projectId: string,
    reply: FastifyReply,
    options: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      lastEventId?: string | undefined;
      tiers?: LogTier[] | undefined;
      since?: Date | undefined;
    } = {}
  ): Promise<void> {
    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no', // Nginx: disable buffering
      'Content-Encoding': 'identity' // Disable compression for SSE
    });

    const client: StreamClient = {
      id: clientId,
      advisorId,
      projectId,
      reply,
      lastEventId: options.lastEventId,
      connected: true,
      filters: {
        tiers: options.tiers,
        since: options.since
      }
    };

    this.clients.set(clientId, client);

    // Handle client disconnect
    reply.raw.on('close', () => {
      this.disconnectClient(clientId);
    });

    reply.raw.on('error', (error) => {
      console.error(`SSE client ${clientId} error:`, error);
      this.disconnectClient(clientId);
    });

    // Send initial connection confirmation
    this.sendEvent(clientId, {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      tier: 'system',
      message: 'Log stream connected',
      projectId
    });

    // If resuming from lastEventId, send missed events
    if (options.lastEventId) {
      await this.sendMissedEvents(clientId, options.lastEventId);
    }

    console.log(`Started log stream for advisor ${advisorId} on project ${projectId} (client: ${clientId})`);
  }

  /**
   * Broadcast log event to all connected clients for a project
   */
  broadcastLogEvent(projectId: string, logEvent: Omit<LogStreamEvent, 'id'>): void {
    const event: LogStreamEvent = {
      ...logEvent,
      id: this.generateEventId(),
      projectId
    };

    for (const [clientId, client] of this.clients) {
      if (client.projectId === projectId && client.connected) {
        // Apply client filters
        if (this.shouldSendEvent(client, event)) {
          this.sendEvent(clientId, event);
        }
      }
    }
  }

  /**
   * Send individual event to specific client
   */
  private sendEvent(clientId: string, event: LogStreamEvent): void {
    const client = this.clients.get(clientId);
    if (!client || !client.connected) {
      return;
    }

    try {
      const eventData = {
        id: event.id,
        timestamp: event.timestamp,
        tier: event.tier,
        message: event.message,
        projectId: event.projectId,
        sequence: event.sequence
      };

      // Format as SSE
      const sseData = `id: ${event.id}\ndata: ${JSON.stringify(eventData)}\n\n`;
      
      client.reply.raw.write(sseData);
    } catch (error) {
      console.error(`Failed to send event to client ${clientId}:`, error);
      this.disconnectClient(clientId);
    }
  }

  /**
   * Send heartbeat to all connected clients
   */
  private sendHeartbeat(): void {
    const heartbeatEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      tier: 'system' as LogTier,
      message: 'heartbeat',
      projectId: ''
    };

    for (const [clientId, client] of this.clients) {
      if (client.connected) {
        try {
          const sseData = `id: ${heartbeatEvent.id}\nevent: heartbeat\ndata: ${JSON.stringify({ timestamp: heartbeatEvent.timestamp })}\n\n`;
          client.reply.raw.write(sseData);
        } catch (error) {
          console.error(`Heartbeat failed for client ${clientId}:`, error);
          this.disconnectClient(clientId);
        }
      }
    }
  }

  /**
   * Setup heartbeat interval
   */
  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Disconnect and cleanup client
   */
  disconnectClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.connected = false;
      try {
        if (!client.reply.raw.destroyed) {
          client.reply.raw.end();
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.clients.delete(clientId);
      console.log(`Disconnected log stream client: ${clientId}`);
    }
  }

  /**
   * Check if event should be sent to client based on filters
   */
  private shouldSendEvent(client: StreamClient, event: LogStreamEvent): boolean {
    // Tier filter
    if (client.filters.tiers && !client.filters.tiers.includes(event.tier)) {
      return false;
    }

    // Time filter
    if (client.filters.since) {
      const eventTime = new Date(event.timestamp);
      if (eventTime < client.filters.since) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send missed events when client reconnects with Last-Event-ID
   * In production, this would query the database for historical events
   */
  private async sendMissedEvents(clientId: string, lastEventId: string): Promise<void> {
    // For Phase 1, we'll implement basic missed event handling
    // In production, this would query log_archival_status table for historical logs
    console.log(`Client ${clientId} requesting events since ${lastEventId} - not implemented in Phase 1`);
    
    const client = this.clients.get(clientId);
    if (client && client.connected) {
      // Send a system message indicating missed events
      this.sendEvent(clientId, {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        tier: 'system',
        message: `Reconnected from event ${lastEventId} - historical events not available in Phase 1`,
        projectId: client.projectId
      });
    }
  }

  /**
   * Generate unique event ID with sequence number
   */
  private generateEventId(): string {
    this.eventSequence++;
    return `${Date.now()}-${this.eventSequence}`;
  }

  /**
   * Get connected clients count for monitoring
   */
  getConnectedClientsCount(): number {
    return Array.from(this.clients.values()).filter(client => client.connected).length;
  }

  /**
   * Get clients for specific project
   */
  getProjectClients(projectId: string): StreamClient[] {
    return Array.from(this.clients.values()).filter(
      client => client.projectId === projectId && client.connected
    );
  }

  /**
   * Cleanup on service shutdown
   */
  shutdown(): void {
    clearInterval(this.heartbeatInterval);
    
    // Disconnect all clients
    for (const clientId of this.clients.keys()) {
      this.disconnectClient(clientId);
    }
    
    this.clients.clear();
  }

  /**
   * Force disconnect clients for a specific advisor (e.g., on session timeout)
   */
  disconnectAdvisorClients(advisorId: string): void {
    for (const [clientId, client] of this.clients) {
      if (client.advisorId === advisorId) {
        this.disconnectClient(clientId);
      }
    }
  }

  /**
   * Force disconnect clients for a specific project
   */
  disconnectProjectClients(projectId: string): void {
    for (const [clientId, client] of this.clients) {
      if (client.projectId === projectId) {
        this.disconnectClient(clientId);
      }
    }
  }
}

// Export singleton instance
export const workspaceLogStreamingService = new WorkspaceLogStreamingService();

// Cleanup on process exit
process.on('SIGTERM', () => {
  workspaceLogStreamingService.shutdown();
});

process.on('SIGINT', () => {
  workspaceLogStreamingService.shutdown();
});