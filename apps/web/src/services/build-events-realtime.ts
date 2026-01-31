/**
 * Build Events Real-time Service
 * Manages Supabase real-time subscriptions for build progress updates
 * Phase 4 of Worker API Migration Plan
 */

import { createClient } from '@/lib/supabase-client'
import type { Database } from '@/types/supabase'
import { logger } from '@/utils/logger';
import type { RealtimeChannel } from '@supabase/realtime-js';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { 
  isRealtimeDisabled, 
  createAsyncNoopVoid, 
  showRealtimeDegradationNotice,
  logRealtimeStatus 
} from '@/lib/realtime-config';

export interface BuildEvent {
  id: number;
  build_id: string;
  event_type: 'queued' | 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  event_data: {
    status?: string;
    progress?: number;
    message?: string;
    error?: string;
    previewUrl?: string;
    completedAt?: string;
    queuePosition?: number;
    estimatedTime?: string;
    // Additional build metadata
    projectId?: string;
    userId?: string;
    workerInfo?: {
      workerId: string;
      region: string;
    };
  };
  created_at: string;
}

export interface BuildEventSubscription {
  buildId: string;
  callback: (event: BuildEvent) => void;
  channel: RealtimeChannel;
}

export class BuildEventsRealtimeService {
  private static instance: BuildEventsRealtimeService;
  private subscriptions = new Map<string, BuildEventSubscription>();
  private supabase = createClient();
  private currentUserId: string | null = null;

  private constructor() {
    // Private constructor for singleton
    if (typeof window === 'undefined') {
      throw new Error('BuildEventsRealtimeService is client-side only. Use server/build-events-publisher.ts for server-side publishing.');
    }
    
    // Check if real-time build events are supported in current auth mode
    if (isRealtimeDisabled) {
      logger.warn('🚫 [CLIENT] Real-time build events disabled in server auth mode. Consider polling fallback.');
      showRealtimeDegradationNotice();
      return;
    }
    
    logger.info('🔄 [CLIENT] BuildEventsRealtimeService initialized');
    logRealtimeStatus();
    this.initializeAuth();
  }

  private async initializeAuth() {
    try {
      // Get current authenticated user
      const { data: { user } } = await this.supabase.auth.getUser();
      this.currentUserId = user?.id || null;
      
      logger.info('🔐 [CLIENT] Auth initialized for build events', {
        hasUser: !!user,
        userId: user?.id?.slice(0, 8) || 'none'
      });

      // Listen for auth changes
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.currentUserId = session?.user?.id || null;
        logger.info('🔄 [CLIENT] Auth state changed for build events', {
          event,
          hasUser: !!session?.user,
          userId: session?.user?.id?.slice(0, 8) || 'none'
        });
      });
    } catch (error) {
      logger.error('❌ Failed to initialize auth for build events:', error);
    }
  }

  static getInstance(): BuildEventsRealtimeService {
    if (!this.instance) {
      this.instance = new BuildEventsRealtimeService();
    }
    return this.instance;
  }

  static resetInstance(): void {
    this.instance = null as any;
    logger.info('🔄 BuildEventsRealtimeService instance reset');
  }

  /**
   * Subscribe to build events for a specific build ID
   */
  async subscribeToBuild(
    buildId: string, 
    callback: (event: BuildEvent) => void,
    options?: {
      includeHistory?: boolean; // Whether to fetch recent events first
      userId?: string; // For additional filtering
    }
  ): Promise<() => void> {
    const { includeHistory = true, userId } = options || {};

    // Check if real-time is disabled due to server auth
    if (isRealtimeDisabled) {
      logger.warn(`🚫 [CLIENT] Build events subscription skipped (server auth mode): ${buildId}`);
      return createAsyncNoopVoid(); // Return async no-op unsubscribe function
    }

    logger.info(`🔔 [CLIENT] Subscribing to build events for: ${buildId}`, {
      includeHistory,
      userId,
      currentUserId: this.currentUserId?.slice(0, 8) || 'none',
      hasExistingSubscription: this.subscriptions.has(buildId)
    });

    try {
      // Check authentication
      if (!this.currentUserId) {
        throw new Error('Authentication required for build events');
      }

      // If already subscribed, return existing unsubscribe function
      if (this.subscriptions.has(buildId)) {
        logger.info(`🔄 Reusing existing subscription for: ${buildId}`);
        return () => this.unsubscribeFromBuild(buildId);
      }

      // Fetch recent events if requested
      if (includeHistory) {
        await this.fetchRecentEvents(buildId, callback);
      }

      // Create real-time subscription with unique channel name
      const channelName = `build-events-${buildId}-${Date.now()}`;
      const channel = this.supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'project_build_events',
            filter: `build_id=eq.${buildId} AND user_id=eq.${this.currentUserId}`
          },
          (payload) => {
            logger.info(`📬 Real-time build event received for ${buildId}:`, {
              eventType: payload.new.event_type,
              timestamp: payload.new.created_at,
              userId: payload.new.user_id?.slice(0, 8) || 'none'
            });

            const buildEvent = payload.new as BuildEvent;
            callback(buildEvent);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            logger.info(`✅ [CLIENT] Successfully subscribed to build events for: ${buildId}`);
          } else if (status === 'CHANNEL_ERROR') {
            logger.error(`❌ [CLIENT] Failed to subscribe to build events for: ${buildId}`);
          }
        });

      // Store subscription
      this.subscriptions.set(buildId, {
        buildId,
        callback,
        channel
      });

      // Return unsubscribe function
      return () => this.unsubscribeFromBuild(buildId);

    } catch (error) {
      logger.error(`❌ Failed to subscribe to build events for ${buildId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from build events for a specific build ID
   */
  async unsubscribeFromBuild(buildId: string): Promise<void> {
    const subscription = this.subscriptions.get(buildId);
    
    if (subscription) {
      logger.info(`🔕 [CLIENT] Unsubscribing from build events for: ${buildId}`);
      
      try {
        // Proper cleanup: unsubscribe and remove channel
        await subscription.channel.unsubscribe();
        this.supabase.removeChannel(subscription.channel);
        this.subscriptions.delete(buildId);
        
        logger.info(`✅ [CLIENT] Successfully unsubscribed from build events for: ${buildId}`);
      } catch (error) {
        logger.error(`❌ [CLIENT] Error during unsubscribe for ${buildId}:`, error);
        // Still remove from our tracking even if cleanup failed
        this.subscriptions.delete(buildId);
      }
    }
  }

  /**
   * Fetch recent build events (for initial state and history)
   */
  private async fetchRecentEvents(
    buildId: string, 
    callback: (event: BuildEvent) => void,
    limit: number = 10
  ): Promise<void> {
    try {
      logger.info(`📚 Fetching recent events for build: ${buildId}`, {
        userId: this.currentUserId?.slice(0, 8) || 'none'
      });

      if (!this.currentUserId) {
        logger.error('Cannot fetch events without authentication');
        return;
      }

      const { data: events, error } = await this.supabase
        .from('project_build_events')
        .select('*')
        .eq('build_id', buildId)
        .eq('user_id', this.currentUserId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        logger.error(`❌ Failed to fetch recent events for ${buildId}:`, error);
        return;
      }

      if (events && events.length > 0) {
        logger.info(`📋 Found ${events.length} recent events for build: ${buildId}`);
        
        // Replay events in chronological order
        events.forEach(event => {
          callback(event as BuildEvent);
        });
      } else {
        logger.info(`📭 No recent events found for build: ${buildId}`, {
          message: 'This could mean: 1) No events exist yet, 2) Events belong to different user, 3) BuildID mismatch'
        });
      }

    } catch (error) {
      logger.error(`❌ Error fetching recent events for ${buildId}:`, error);
    }
  }

  /**
   * Subscribe to all build events for a user (dashboard view)
   */
  async subscribeToUserBuilds(
    userId: string,
    callback: (event: BuildEvent) => void
  ): Promise<() => void> {
    const subscriptionKey = `user-${userId}`;
    
    logger.info(`🔔 Subscribing to all build events for user: ${userId}`);

    try {
      // Unsubscribe if already exists
      if (this.subscriptions.has(subscriptionKey)) {
        await this.unsubscribeFromBuild(subscriptionKey);
      }

      // Note: This would require the user_id column in project_build_events table
      // For now, we'll comment this out until the migration is applied
      /*
      const channel = this.supabase
        .channel(`user-builds-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'project_build_events',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            logger.info(`📬 Real-time user build event received:`, {
              userId,
              buildId: payload.new.build_id,
              eventType: payload.new.event_type
            });

            const buildEvent = payload.new as BuildEvent;
            callback(buildEvent);
          }
        )
        .subscribe();

      this.subscriptions.set(subscriptionKey, {
        buildId: subscriptionKey,
        callback,
        channel
      });
      */

      logger.warn(`⚠️ User-level subscriptions require user_id column in project_build_events table`);
      
      // Return a no-op unsubscribe function for now
      return () => Promise.resolve();

    } catch (error) {
      logger.error(`❌ Failed to subscribe to user builds for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get current build status from latest event
   */
  async getCurrentBuildStatus(buildId: string): Promise<BuildEvent | null> {
    // Check if disabled due to server auth
    if (isRealtimeDisabled) {
      logger.warn(`🚫 [CLIENT] Build status check skipped (server auth mode): ${buildId}`);
      return null;
    }

    try {
      logger.info(`🔍 Getting current status for build: ${buildId}`, {
        userId: this.currentUserId?.slice(0, 8) || 'none'
      });

      if (!this.currentUserId) {
        logger.error('Cannot get build status without authentication');
        return null;
      }

      const { data: event, error } = await this.supabase
        .from('project_build_events')
        .select('*')
        .eq('build_id', buildId)
        .eq('user_id', this.currentUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        logger.error(`❌ Failed to get current status for ${buildId}:`, error);
        throw error;
      }

      if (event) {
        logger.info(`✅ Current status for ${buildId}:`, {
          eventType: event.event_type,
          timestamp: event.created_at,
          userId: event.user_id?.slice(0, 8) || 'none'
        });
        return event as BuildEvent;
      }

      logger.info(`📭 No events found for build: ${buildId}`);
      return null;

    } catch (error) {
      logger.error(`❌ Error getting current build status for ${buildId}:`, error);
      throw error;
    }
  }

  // NOTE: publishBuildEvent has been moved to server/build-events-publisher.ts
  // This service is now client-side only for subscriptions

  /**
   * Clean up all subscriptions (called on app shutdown)
   */
  async cleanup(): Promise<void> {
    logger.info(`🧹 [CLIENT] Cleaning up ${this.subscriptions.size} build event subscriptions`);

    const unsubscribePromises = Array.from(this.subscriptions.keys())
      .map(buildId => this.unsubscribeFromBuild(buildId));

    await Promise.all(unsubscribePromises);
    
    logger.info(`✅ [CLIENT] All build event subscriptions cleaned up`);
  }

  /**
   * Health check for real-time connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic Supabase connection
      const { error } = await this.supabase
        .from('project_build_events')
        .select('id')
        .limit(1);

      if (error) {
        logger.error('❌ Build events realtime health check failed:', error);
        return false;
      }

      logger.info('✅ Build events realtime health check passed');
      return true;

    } catch (error) {
      logger.error('❌ Build events realtime health check error:', error);
      return false;
    }
  }

  /**
   * Get subscription stats for monitoring
   */
  getSubscriptionStats(): {
    activeSubscriptions: number;
    subscriptionIds: string[];
  } {
    return {
      activeSubscriptions: this.subscriptions.size,
      subscriptionIds: Array.from(this.subscriptions.keys())
    };
  }
}

// Export singleton instance getter (lazy initialization)
export const getBuildEventsRealtime = () => BuildEventsRealtimeService.getInstance();