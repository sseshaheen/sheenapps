/**
 * Build SSE Bridge
 * 
 * Bridges build events from the eventService to SSE connections for real-time updates
 * during unified chat build operations.
 */

import { subscribeToEvents, getCleanEventsSince } from './eventService';
import { UserBuildEvent } from '../types/cleanEvents';
import { EnhancedSSEService } from './enhancedSSEService';
import { FastifyReply } from 'fastify';

// =====================================================================
// Build Event Bridge
// =====================================================================

export class BuildSSEBridge {
  private subscriptions = new Map<string, () => void>();

  /**
   * Subscribe to build events and stream them via SSE
   */
  subscribeToBuild(
    buildId: string,
    reply: FastifyReply,
    userId: string,
    clientMsgId?: string,
    startSeq: number = 1
  ): () => void {
    console.log(`[BuildSSEBridge] Subscribing to build: ${buildId}`);

    // Create bridge key for tracking
    const bridgeKey = `${buildId}-${Date.now()}`;
    let currentSeq = startSeq;

    // Subscribe to build events
    const unsubscribe = subscribeToEvents(buildId, (event) => {
      try {
        console.log(`[BuildSSEBridge] Received event for build ${buildId}:`, {
          type: event.event_type,
          phase: event.phase,
          title: event.title
        });

        // Convert to enhanced SSE format
        EnhancedSSEService.sendBuildStatusEvent(
          reply,
          currentSeq++,
          buildId,
          this.mapEventTypeToStatus(event.event_type, event.phase),
          event.title || event.description,
          event.overall_progress,
          clientMsgId
        );

        // If build is completed or failed, clean up
        if (event.finished || event.event_type === 'failed') {
          console.log(`[BuildSSEBridge] Build ${buildId} finished, cleaning up subscription`);
          this.unsubscribe(bridgeKey);
        }
      } catch (error) {
        console.error(`[BuildSSEBridge] Error processing event for build ${buildId}:`, error);
      }
    });

    // Store subscription for cleanup
    this.subscriptions.set(bridgeKey, unsubscribe);

    // Send any missed events
    this.sendMissedEvents(buildId, reply, userId, startSeq, clientMsgId);

    // Return cleanup function
    return () => this.unsubscribe(bridgeKey);
  }

  /**
   * Send any events that may have been missed
   */
  private async sendMissedEvents(
    buildId: string,
    reply: FastifyReply,
    userId: string,
    startSeq: number,
    clientMsgId?: string
  ): Promise<void> {
    try {
      // Get recent events (last 50 to be safe)
      const recentEvents = await getCleanEventsSince(buildId, 0, userId);
      
      if (recentEvents.length > 0) {
        console.log(`[BuildSSEBridge] Sending ${recentEvents.length} missed events for build ${buildId}`);
        
        let seq = startSeq;
        for (const event of recentEvents) {
          EnhancedSSEService.sendBuildStatusEvent(
            reply,
            seq++,
            buildId,
            this.mapEventTypeToStatus(event.event_type, event.phase),
            event.title || event.description,
            event.overall_progress,
            clientMsgId
          );
        }
      }
    } catch (error) {
      console.error(`[BuildSSEBridge] Error sending missed events for build ${buildId}:`, error);
    }
  }

  /**
   * Map internal event types to SSE status format
   */
  private mapEventTypeToStatus(
    eventType: string,
    phase?: string
  ): 'queued' | 'processing' | 'completed' | 'failed' {
    // Handle failure states
    if (eventType === 'failed' || eventType === 'error') {
      return 'failed';
    }

    // Handle completion states
    if (eventType === 'completed' && phase === 'deploy') {
      return 'completed';
    }

    // Handle queued/started states
    if (eventType === 'started' && phase === 'queue') {
      return 'queued';
    }

    // Default to processing for progress/started events
    if (eventType === 'progress' || eventType === 'started') {
      return 'processing';
    }

    // Default case
    return 'processing';
  }

  /**
   * Unsubscribe from build events
   */
  private unsubscribe(bridgeKey: string): void {
    const unsubscribeFn = this.subscriptions.get(bridgeKey);
    if (unsubscribeFn) {
      unsubscribeFn();
      this.subscriptions.delete(bridgeKey);
      console.log(`[BuildSSEBridge] Unsubscribed from ${bridgeKey}`);
    }
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    console.log(`[BuildSSEBridge] Cleaning up ${this.subscriptions.size} subscriptions`);
    for (const [bridgeKey, unsubscribeFn] of this.subscriptions.entries()) {
      unsubscribeFn();
    }
    this.subscriptions.clear();
  }

  /**
   * Get active subscription count (for monitoring)
   */
  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}