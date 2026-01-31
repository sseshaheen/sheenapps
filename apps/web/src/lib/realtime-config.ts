/**
 * Central Real-time Configuration
 * Stage 2 of Real-time Build Events Restoration Plan
 *
 * Provides centralized control over real-time features with proper fallback handling
 *
 * Feature Flag Reference:
 * - ENABLE_SUPABASE: Master toggle for all Supabase functionality (database, auth, real-time)
 * - ENABLE_SERVER_AUTH: Toggles server-side auth mode (prevents anon key exposure in browser)
 * - FEATURE_CLIENT_SUPABASE: Override to force real-time on even in server-auth mode
 */

import { logger } from '@/utils/logger';
import { FEATURE_FLAGS } from './feature-flags';

// Branded type for strategy safety
export type RealtimeStrategy = 'realtime' | 'polling' | 'disabled';

/**
 * Determines if real-time functionality should be disabled
 * Logic: Disabled when server auth is enabled unless explicitly overridden by FEATURE_CLIENT_SUPABASE
 */
export const isRealtimeDisabled =
  !!FEATURE_FLAGS.ENABLE_SERVER_AUTH && !process.env.FEATURE_CLIENT_SUPABASE;

/**
 * Configuration object for real-time services
 */
const realtimeConfig = {
  // Core flags
  isDisabled: isRealtimeDisabled,
  isEnabled: !isRealtimeDisabled,

  // Fallback settings
  polling: {
    enabled: isRealtimeDisabled,
    initialInterval: 2000, // 2 seconds
    maxInterval: 15000,    // 15 seconds max backoff
    minInterval: 1500,     // 1.5 seconds min
    backoffMultiplier: 1.5,
    maxRetries: 3,
    timeoutMs: 30000       // 30 second timeout
  },

  // Real-time settings (for when it's restored)
  realtime: {
    enabled: !isRealtimeDisabled,
    channelPrefix: 'build-events',
    reconnectDelay: 2000,
    maxReconnectAttempts: 5,
    heartbeatInterval: 30000
  },

  // Performance settings
  performance: {
    maxEventsPerQuery: 50,
    maxAccumulatedEvents: 50,
    highLatencyThresholdMs: 10000,
    cacheTimeMs: 5 * 60 * 1000, // 5 minutes
    dedupingEnabled: true
  }
} as const;

// Freeze the configuration object for runtime immutability
Object.freeze(realtimeConfig);
Object.freeze(realtimeConfig.polling);
Object.freeze(realtimeConfig.realtime);
Object.freeze(realtimeConfig.performance);

/**
 * Helper function to get appropriate subscription strategy
 */
export function getSubscriptionStrategy(): RealtimeStrategy {
  const strategy = !FEATURE_FLAGS.ENABLE_SUPABASE ? 'disabled' : 
                  realtimeConfig.isDisabled ? 'polling' : 'realtime';
  
  // IMMEDIATE DEBUG - Always log strategy selection
  console.log('🚨 STRATEGY SELECTION', {
    ENABLE_SUPABASE: FEATURE_FLAGS.ENABLE_SUPABASE,
    ENABLE_SERVER_AUTH: FEATURE_FLAGS.ENABLE_SERVER_AUTH,
    isRealtimeDisabled,
    strategy,
    timestamp: new Date().toISOString()
  });
  
  return strategy;
}

/**
 * Helper to check if polling should be used
 */
export function shouldUsePolling(): boolean {
  return getSubscriptionStrategy() === 'polling';
}

/**
 * Helper to check if real-time should be used
 */
export function shouldUseRealtime(): boolean {
  return getSubscriptionStrategy() === 'realtime';
}

/**
 * Development mode notification about real-time status
 */
export function logRealtimeStatus(): void {
  if (process.env.NODE_ENV === 'development') {
    const strategy = getSubscriptionStrategy();

    logger.info('🔧 Real-time configuration status', {
      strategy,
      isRealtimeDisabled,
      ENABLE_SUPABASE: FEATURE_FLAGS.ENABLE_SUPABASE,
      ENABLE_SERVER_AUTH: FEATURE_FLAGS.ENABLE_SERVER_AUTH,
      FEATURE_CLIENT_SUPABASE: !!process.env.FEATURE_CLIENT_SUPABASE
    });

    switch (strategy) {
      case 'disabled':
        logger.info('🚫 Real-time completely disabled (Supabase disabled)');
        break;
      case 'polling':
        logger.info('📊 Real-time disabled - using polling fallback', {
          reason: 'Server auth mode enabled',
          interval: `${realtimeConfig.polling.initialInterval}ms`,
          backoff: `up to ${realtimeConfig.polling.maxInterval}ms`
        });
        break;
      case 'realtime':
        logger.info('🔄 Real-time enabled and active');
        break;
    }
  }
}

/**
 * Create async no-op function for disabled real-time services
 * Prevents await issues when real-time is disabled
 *
 * Returns Promise<never> to force explicit handling of disabled case
 * For cases where a value is expected, caller must handle the disabled scenario
 */
export function createAsyncNoop(): () => Promise<never> {
  return async () => {
    logger.debug('realtime', '📭 Real-time function called but disabled - returning no-op');
    throw new Error('Real-time functionality is disabled - operation cannot complete');
  };
}

/**
 * Create async no-op that returns void (for cleanup functions)
 */
export function createAsyncNoopVoid(): () => Promise<void> {
  return async () => {
    logger.debug('realtime', '📭 Real-time cleanup function called but disabled - no-op');
  };
}

/**
 * Show development toast when real-time is degraded
 */
export function showRealtimeDegradationNotice(): void {
  if (process.env.NODE_ENV === 'development' && isRealtimeDisabled) {
    // This would integrate with your toast system
    // For now, just log the notice
    logger.warn('⚠️ Real-time disabled in server auth mode - using polling fallback');

    // If you have a toast system, uncomment and adapt:
    // import { toast } from '@/components/ui/toast';
    // toast.warn('⚠️ Real-time disabled in server auth mode - using polling fallback');
  }
}

// Use aliased exports to prevent object divergence
export { realtimeConfig };
