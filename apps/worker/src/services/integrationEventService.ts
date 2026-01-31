/**
 * Integration Event Service
 *
 * Manages real-time event broadcasting for integration status changes
 * with SSE support, BroadcastChannel sharing, and event persistence.
 */

import { EnhancedSSEService, SSEEvent, BaseSSEEvent } from './enhancedSSEService';
import { StatusEnvelope, IntegrationStatus } from '../adapters/IntegrationStatusAdapter';
import { FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { ServerLoggingService } from './serverLoggingService';

export interface IntegrationStatusEvent extends BaseSSEEvent {
  event: 'integration.status.updated' | 'integration.action.completed' | 'integration.connection.changed';
  data: {
    projectId: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    integrationKey?: IntegrationStatus['key'] | undefined;
    status?: StatusEnvelope | undefined;
    actionResult?: {
      integrationKey: IntegrationStatus['key'];
      actionId: string;
      success: boolean;
      message?: string | undefined;
    } | undefined;
    connectionChange?: {
      integrationKey: IntegrationStatus['key'];
      oldStatus: IntegrationStatus['status'];
      newStatus: IntegrationStatus['status'];
      reason?: string | undefined;
    } | undefined;
  };
}

interface ConnectionManager {
  projectId: string;
  userId: string;
  connectionId: string;
  reply: FastifyReply;
  lastEventId: number;
  subscriptionTime: Date;
}

export class IntegrationEventService {
  private static instance: IntegrationEventService;

  private redis: Redis;
  private loggingService = ServerLoggingService.getInstance();
  private connections = new Map<string, ConnectionManager>();
  private sequenceCounters = new Map<string, number>();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });

    // Set up Redis pub/sub for cross-instance event broadcasting
    this.setupRedisSubscriptions();
  }

  static getInstance(): IntegrationEventService {
    if (!IntegrationEventService.instance) {
      IntegrationEventService.instance = new IntegrationEventService();
    }
    return IntegrationEventService.instance;
  }

  /**
   * Register a new SSE connection for integration events
   */
  registerConnection(
    projectId: string,
    userId: string,
    connectionId: string,
    reply: FastifyReply,
    lastEventId?: string
  ): void {
    const connection: ConnectionManager = {
      projectId,
      userId,
      connectionId,
      reply,
      lastEventId: lastEventId ? parseInt(lastEventId) : 0,
      subscriptionTime: new Date()
    };

    this.connections.set(connectionId, connection);

    // Clean up on connection close
    reply.raw.on('close', () => {
      this.unregisterConnection(connectionId);
    });

    this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Integration SSE connection registered',
      { projectId, userId, connectionId, resumeFromEventId: lastEventId }
    );
  }

  /**
   * Unregister an SSE connection
   */
  unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);

      this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Integration SSE connection unregistered',
        {
          projectId: connection.projectId,
          userId: connection.userId,
          connectionId,
          durationMs: Date.now() - connection.subscriptionTime.getTime()
        }
      );
    }
  }

  /**
   * Broadcast integration status update to all relevant connections
   */
  async broadcastStatusUpdate(
    projectId: string,
    status: StatusEnvelope,
    changedIntegration?: IntegrationStatus['key']
  ): Promise<void> {
    const event: IntegrationStatusEvent = {
      seq: this.getNextSequence(projectId),
      event: 'integration.status.updated',
      timestamp: new Date().toISOString(),
      data: {
        projectId,
        integrationKey: changedIntegration,
        status
      }
    };

    await this.broadcastEvent(projectId, event);
  }

  /**
   * Broadcast action completion event
   */
  async broadcastActionResult(
    projectId: string,
    integrationKey: IntegrationStatus['key'],
    actionId: string,
    success: boolean,
    message?: string,
    clientMsgId?: string
  ): Promise<void> {
    const event: IntegrationStatusEvent = {
      seq: this.getNextSequence(projectId),
      event: 'integration.action.completed',
      timestamp: new Date().toISOString(),
      client_msg_id: clientMsgId,
      data: {
        projectId,
        actionResult: {
          integrationKey,
          actionId,
          success,
          message
        }
      }
    };

    await this.broadcastEvent(projectId, event);
  }

  /**
   * Broadcast connection state change
   */
  async broadcastConnectionChange(
    projectId: string,
    integrationKey: IntegrationStatus['key'],
    oldStatus: IntegrationStatus['status'],
    newStatus: IntegrationStatus['status'],
    reason?: string
  ): Promise<void> {
    const event: IntegrationStatusEvent = {
      seq: this.getNextSequence(projectId),
      event: 'integration.connection.changed',
      timestamp: new Date().toISOString(),
      data: {
        projectId,
        connectionChange: {
          integrationKey,
          oldStatus,
          newStatus,
          reason
        }
      }
    };

    await this.broadcastEvent(projectId, event);
  }

  /**
   * Send heartbeat to all connections
   */
  async sendHeartbeats(): Promise<void> {
    const heartbeatPromises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        EnhancedSSEService.sendKeepAlive(connection.reply);
      } catch (error) {
        // Connection likely closed, will be cleaned up by close handler
        console.warn(`Heartbeat failed for connection ${connection.connectionId}:`, error);
      }
    });

    await Promise.allSettled(heartbeatPromises);
  }

  /**
   * Get connection statistics for monitoring
   */
  getConnectionStats(): {
    totalConnections: number;
    connectionsByProject: Record<string, number>;
    averageConnectionAge: number;
  } {
    const connectionsByProject: Record<string, number> = {};
    let totalAgeMs = 0;

    for (const connection of this.connections.values()) {
      connectionsByProject[connection.projectId] = (connectionsByProject[connection.projectId] || 0) + 1;
      totalAgeMs += Date.now() - connection.subscriptionTime.getTime();
    }

    return {
      totalConnections: this.connections.size,
      connectionsByProject,
      averageConnectionAge: this.connections.size > 0 ? totalAgeMs / this.connections.size : 0
    };
  }

  /**
   * Replay missed events for reconnecting clients
   */
  async replayMissedEvents(
    projectId: string,
    connectionId: string,
    fromEventId: number
  ): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      // Get missed events from Redis (events are stored for 24 hours)
      const eventKey = `integration_events:${projectId}`;
      const events = await this.redis.zrangebyscore(
        eventKey,
        fromEventId + 1,
        '+inf',
        'WITHSCORES'
      );

      for (let i = 0; i < events.length; i += 2) {
        const eventJson = events[i];
        const seqStr = events[i + 1];
        if (!eventJson || !seqStr) continue;
        const eventData = JSON.parse(eventJson);
        const eventSeq = parseInt(seqStr);

        EnhancedSSEService.sendEvent(connection.reply, {
          ...eventData,
          seq: eventSeq
        });
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Replayed missed integration events',
        { projectId, connectionId, fromEventId, eventsReplayed: events.length / 2 }
      );

    } catch (error) {
      await this.loggingService.logCriticalError(
        'integration_event_replay_failed',
        error as Error,
        { projectId, connectionId, fromEventId }
      );
    }
  }

  // Private helper methods

  /**
   * Broadcast event to local connections
   * @param projectId - Project identifier
   * @param event - Event to broadcast
   * @param fromRemote - If true, event came from Redis pub/sub (don't re-publish)
   */
  private async broadcastEvent(projectId: string, event: IntegrationStatusEvent, fromRemote: boolean = false): Promise<void> {
    try {
      // Store event in Redis for replay capability (24 hour TTL)
      const eventKey = `integration_events:${projectId}`;
      await this.redis.zadd(eventKey, event.seq, JSON.stringify(event));
      await this.redis.expire(eventKey, 24 * 60 * 60);

      // Broadcast to local connections
      const projectConnections = Array.from(this.connections.values())
        .filter(conn => conn.projectId === projectId);

      const broadcastPromises = projectConnections.map(async (connection) => {
        try {
          // Skip if client hasn't caught up to this event
          if (event.seq <= connection.lastEventId) {
            return;
          }

          EnhancedSSEService.sendResilientEvent(connection.reply, event);
          connection.lastEventId = event.seq;

        } catch (error) {
          console.warn(`Failed to send event to connection ${connection.connectionId}:`, error);
        }
      });

      await Promise.allSettled(broadcastPromises);

      // Only publish to Redis if this is a local event (not received from Redis)
      // This prevents infinite pub/sub loop: local -> Redis -> local -> Redis...
      if (!fromRemote) {
        await this.redis.publish('integration_events', JSON.stringify({
          projectId,
          event
        }));
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Integration event broadcasted',
        {
          projectId,
          eventType: event.event,
          sequence: event.seq,
          localConnections: projectConnections.length,
          fromRemote
        }
      );

    } catch (error) {
      await this.loggingService.logCriticalError(
        'integration_event_broadcast_failed',
        error as Error,
        { projectId, event: event.event, sequence: event.seq }
      );
    }
  }

  private getNextSequence(projectId: string): number {
    const current = this.sequenceCounters.get(projectId) || Date.now();
    const next = Math.max(current + 1, Date.now());
    this.sequenceCounters.set(projectId, next);
    return next;
  }

  private setupRedisSubscriptions(): void {
    const subscriber = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });

    subscriber.subscribe('integration_events', (error) => {
      if (error) {
        console.error('Failed to subscribe to integration events:', error);
      } else {
        console.log('Subscribed to integration events channel');
      }
    });

    subscriber.on('message', async (channel, message) => {
      if (channel === 'integration_events') {
        try {
          const { projectId, event } = JSON.parse(message);

          // Only handle events for projects with local connections
          const hasLocalConnections = Array.from(this.connections.values())
            .some(conn => conn.projectId === projectId);

          if (hasLocalConnections) {
            // Pass fromRemote=true to prevent re-publishing to Redis
            await this.broadcastEvent(projectId, event, true);
          }

        } catch (error) {
          console.error('Error processing cross-instance integration event:', error);
        }
      }
    });
  }
}

// Set up periodic heartbeat sender (every 30 seconds)
setInterval(async () => {
  try {
    const eventService = IntegrationEventService.getInstance();
    await eventService.sendHeartbeats();
  } catch (error) {
    console.error('Heartbeat sender error:', error);
  }
}, 30000);