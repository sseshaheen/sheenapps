/**
 * Enhanced SSE Service
 * 
 * Provides improved SSE event formatting with sequence IDs, client message tracking,
 * and better event naming conventions following expert recommendations.
 */

import { FastifyReply } from 'fastify';

// =====================================================================
// Event Format Types
// =====================================================================

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface BaseSSEEvent {
  seq: number;                           // Sequence as event ID for resume
  event: string;                         // Dotted event naming (e.g., "message.created")
  timestamp: string;                     // ISO timestamp
  client_msg_id?: string | undefined;               // Echo when applicable
  in_reply_to_client_msg_id?: string | undefined;   // For assistant replies
  effective_build_mode?: 'build' | 'plan' | undefined; // On first related event
}

export interface MessageCreatedEvent extends BaseSSEEvent {
  event: 'message.created';
  data: {
    messageId: string;
    userId: string;
    projectId: string;
    message: string;
    messageType: 'user' | 'assistant' | 'system';
    mode: 'plan' | 'build' | 'unified';
  };
}

export interface MessageResponseEvent extends BaseSSEEvent {
  event: 'message.response';
  data: {
    messageId: string;
    responseType: 'plan' | 'build' | 'error';
    content: any;
  };
}

export interface BuildStatusEvent extends BaseSSEEvent {
  event: 'build.status';
  data: {
    buildId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    progress?: number | undefined;
    message?: string | undefined;
  };
}

export interface ConnectionEvent extends BaseSSEEvent {
  event: 'connection.takeover' | 'connection.established' | 'connection.error';
  data: {
    connectionId: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    reason?: string | undefined;
    evicted_connection_id?: string | undefined;
  };
}

export interface SystemEvent extends BaseSSEEvent {
  event: 'system.notification' | 'system.error';
  data: {
    code: string;
    message: string;
    level: 'info' | 'warning' | 'error';
  };
}

export type SSEEvent =
  | MessageCreatedEvent
  | MessageResponseEvent
  | BuildStatusEvent
  | ConnectionEvent
  | SystemEvent
  | import('./integrationEventService').IntegrationStatusEvent;

// =====================================================================
// Enhanced SSE Service
// =====================================================================

export class EnhancedSSEService {
  private static readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
  private static readonly KEEP_ALIVE_COMMENT = ': keep-alive\n\n';

  /**
   * Set up enhanced SSE headers with proper caching and buffering controls
   */
  static setupSSEHeaders(reply: FastifyReply, requestId?: string): void {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Nginx compatibility
    
    // Echo X-Request-Id header for correlation
    if (requestId) {
      reply.raw.setHeader('X-Request-Id', requestId);
    }
    
    reply.raw.flushHeaders?.();
  }

  /**
   * Send an enhanced SSE event with proper formatting
   */
  static sendEvent(reply: FastifyReply, event: SSEEvent): void {
    try {
      // Ensure every event has sequence ID for perfect resume
      const eventLines = [
        `id: ${event.seq}`,
        `event: ${event.event}`,
        `data: ${JSON.stringify({
          ...event,
          data: event.data
        })}`
      ];

      const formattedEvent = eventLines.join('\n') + '\n\n';
      reply.raw.write(formattedEvent);
      
      console.log(`[EnhancedSSE] Sent event: ${event.event} (seq: ${event.seq})`);
    } catch (error) {
      console.error('[EnhancedSSE] Error sending event:', error);
      // Send error event instead
      this.sendErrorEvent(reply, 'EVENT_SEND_ERROR', 'Failed to send event', event.seq || 0);
    }
  }

  /**
   * Send keep-alive comment to prevent proxy timeouts
   */
  static sendKeepAlive(reply: FastifyReply): void {
    try {
      reply.raw.write(this.KEEP_ALIVE_COMMENT);
    } catch (error) {
      console.error('[EnhancedSSE] Error sending keep-alive:', error);
    }
  }

  /**
   * Set up keep-alive interval for a connection
   */
  static setupKeepAlive(reply: FastifyReply): NodeJS.Timeout {
    return setInterval(() => {
      this.sendKeepAlive(reply);
    }, this.KEEP_ALIVE_INTERVAL);
  }

  /**
   * Send a standardized error event
   */
  static sendErrorEvent(
    reply: FastifyReply, 
    errorCode: string, 
    errorMessage: string, 
    seq: number,
    clientMsgId?: string
  ): void {
    const errorEvent: SystemEvent = {
      seq,
      event: 'system.error',
      timestamp: new Date().toISOString(),
      client_msg_id: clientMsgId,
      data: {
        code: errorCode,
        message: errorMessage,
        level: 'error'
      }
    };

    this.sendEvent(reply, errorEvent);
  }

  /**
   * Send connection takeover event with enhanced format
   */
  static sendConnectionTakeoverEvent(
    reply: FastifyReply,
    seq: number,
    connectionId: string,
    evictedConnectionId?: string
  ): void {
    const takeoverEvent: ConnectionEvent = {
      seq,
      event: 'connection.takeover',
      timestamp: new Date().toISOString(),
      data: {
        connectionId,
        reason: 'New connection established',
        evicted_connection_id: evictedConnectionId
      }
    };

    this.sendEvent(reply, takeoverEvent);
  }

  /**
   * Send build status event
   */
  static sendBuildStatusEvent(
    reply: FastifyReply,
    seq: number,
    buildId: string,
    status: 'queued' | 'processing' | 'completed' | 'failed',
    message?: string,
    progress?: number,
    clientMsgId?: string
  ): void {
    const buildEvent: BuildStatusEvent = {
      seq,
      event: 'build.status',
      timestamp: new Date().toISOString(),
      client_msg_id: clientMsgId,
      data: {
        buildId,
        status,
        progress,
        message
      }
    };

    this.sendEvent(reply, buildEvent);
  }

  /**
   * Send message created event with client tracking
   */
  static sendMessageCreatedEvent(
    reply: FastifyReply,
    seq: number,
    messageData: {
      messageId: string;
      userId: string;
      projectId: string;
      message: string;
      messageType: 'user' | 'assistant' | 'system';
      mode: 'plan' | 'build' | 'unified';
    },
    clientMsgId?: string,
    effectiveBuildMode?: 'build' | 'plan'
  ): void {
    const messageEvent: MessageCreatedEvent = {
      seq,
      event: 'message.created',
      timestamp: new Date().toISOString(),
      client_msg_id: clientMsgId,
      effective_build_mode: effectiveBuildMode,
      data: messageData
    };

    this.sendEvent(reply, messageEvent);
  }

  /**
   * Send message response event (for assistant replies)
   */
  static sendMessageResponseEvent(
    reply: FastifyReply,
    seq: number,
    responseData: {
      messageId: string;
      responseType: 'plan' | 'build' | 'error';
      content: any;
    },
    inReplyToClientMsgId?: string
  ): void {
    const responseEvent: MessageResponseEvent = {
      seq,
      event: 'message.response',
      timestamp: new Date().toISOString(),
      in_reply_to_client_msg_id: inReplyToClientMsgId,
      data: responseData
    };

    this.sendEvent(reply, responseEvent);
  }

  /**
   * Validate that an event has proper SSE resilience features
   */
  static validateEventResilience(event: SSEEvent): boolean {
    // Ensure every event has sequence ID for resume capability
    if (!event.seq || typeof event.seq !== 'number') {
      console.warn('[EnhancedSSE] Event missing sequence ID:', event);
      return false;
    }
    
    // Ensure proper event naming (dotted convention)
    if (!event.event || !event.event.includes('.')) {
      console.warn('[EnhancedSSE] Event not using dotted naming convention:', event.event);
      return false;
    }
    
    // Ensure timestamp is present
    if (!event.timestamp) {
      console.warn('[EnhancedSSE] Event missing timestamp:', event);
      return false;
    }
    
    return true;
  }
  
  /**
   * Send event with resilience validation
   */
  static sendResilientEvent(reply: FastifyReply, event: SSEEvent): void {
    if (!this.validateEventResilience(event)) {
      console.error('[EnhancedSSE] Event failed resilience validation, not sending');
      return;
    }
    
    this.sendEvent(reply, event);
  }
  
  /**
   * Set up a complete resilient SSE connection with all expert recommendations
   */
  static setupResilientSSE(
    reply: FastifyReply,
    options: {
      requestId?: string;
      onConnection?: () => void;
      onClose?: () => void;
      onError?: (error: Error) => void;
    } = {}
  ): {
    keepAliveInterval: NodeJS.Timeout;
    cleanup: () => void;
  } {
    // Set up headers
    this.setupSSEHeaders(reply, options.requestId);
    
    // Set up keep-alive
    const keepAliveInterval = this.setupKeepAlive(reply);
    
    // Set up connection event handlers
    if (options.onConnection) {
      process.nextTick(options.onConnection);
    }
    
    reply.raw.on('close', () => {
      console.log('[EnhancedSSE] Connection closed');
      clearInterval(keepAliveInterval);
      if (options.onClose) {
        options.onClose();
      }
    });
    
    reply.raw.on('error', (error) => {
      console.error('[EnhancedSSE] Connection error:', error);
      clearInterval(keepAliveInterval);
      if (options.onError) {
        options.onError(error);
      }
    });
    
    // Return cleanup function
    const cleanup = () => {
      clearInterval(keepAliveInterval);
      try {
        reply.raw.end();
      } catch (error) {
        console.error('[EnhancedSSE] Error during cleanup:', error);
      }
    };
    
    return { keepAliveInterval, cleanup };
  }

  /**
   * Close SSE connection gracefully
   */
  static closeConnection(reply: FastifyReply, keepAliveInterval?: NodeJS.Timeout): void {
    try {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      
      // Send final event
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
      
      console.log('[EnhancedSSE] Connection closed gracefully');
    } catch (error) {
      console.error('[EnhancedSSE] Error closing connection:', error);
    }
  }
}