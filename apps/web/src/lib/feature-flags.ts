//src/lib/feature-flags.ts
import { logger } from '@/utils/logger';

// Environment validation with fail-fast invariant checks
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    const error = new Error(`Environment Configuration Error: ${message}`);
    logger.error('🚨 Critical environment validation failed:', message);
    throw error;
  }
}

// Validate required environment variables on startup
if (process.env.NEXT_PUBLIC_ENABLE_SUPABASE === 'true') {
  // SERVER-ONLY ARCHITECTURE: Supabase validation moved to server-side clients
  // The server-side clients (src/lib/server/supabase-clients.ts) handle validation
  // of SUPABASE_URL and SUPABASE_ANON_KEY environment variables
  logger.info('✅ Supabase enabled - validation handled by server-side clients');
}

// Feature flags for gradual rollout and cost control
export const FEATURE_FLAGS = {
  // Master flag for Supabase integration
  ENABLE_SUPABASE: process.env.NEXT_PUBLIC_ENABLE_SUPABASE === 'true',

  // Server-side auth flag (fixes CORS issues)
  ENABLE_SERVER_AUTH: process.env.NEXT_PUBLIC_ENABLE_SERVER_AUTH === 'true',

  // Synchronous auth bootstrap (expert solution for hydration race condition)
  ENABLE_SYNCHRONOUS_AUTH_BOOTSTRAP: process.env.NEXT_PUBLIC_ENABLE_SYNCHRONOUS_AUTH_BOOTSTRAP === 'true',

  REALTIME_COLLABORATION: process.env.ENABLE_REALTIME === 'true',
  EDGE_ROUTER: process.env.ENABLE_EDGE_ROUTER === 'true', // $10/mo per env
  CUSTOM_DOMAINS: process.env.ENABLE_DOMAINS === 'true',
  AUTO_SAVE: process.env.ENABLE_AUTOSAVE === 'true',
  VERSION_HISTORY: process.env.ENABLE_HISTORY === 'true',

  // Performance & UI Optimizations (Phase 1)
  HERO_SIMPLIFICATION: process.env.ENABLE_HERO_SIMPLIFICATION === 'true',

  // Voice UX Enhancements (VOICE_UX_ENHANCEMENTS_PLAN_V2.md)
  VOICE_REALTIME_TRANSCRIPTION: process.env.NEXT_PUBLIC_VOICE_REALTIME_TRANSCRIPTION === 'true',
  VOICE_AUTO_SUBMIT: process.env.NEXT_PUBLIC_VOICE_AUTO_SUBMIT === 'true',

  // Voice Provider System (OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md)
  // Enables universal transcription with OpenAI as default (no Safari prompts)
  // Web Speech API is opt-in via NEXT_PUBLIC_PREFER_WEB_SPEECH=true
  // Default: true (enabled by default for universal browser support)
  VOICE_PROVIDER_SYSTEM: process.env.NEXT_PUBLIC_VOICE_PROVIDER_SYSTEM !== 'false',

  // Usage limits
  MAX_REALTIME_CONNECTIONS: parseInt(process.env.MAX_REALTIME_CONN || '100'),
  MAX_STORAGE_GB: parseInt(process.env.MAX_STORAGE_GB || '10'),
  MAX_BANDWIDTH_GB: parseInt(process.env.MAX_BANDWIDTH_GB || '100')
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

// Helper to check if a feature is enabled
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] as boolean
}

// Log feature flags on startup (development only)
if (process.env.NODE_ENV === 'development') {
  logger.info('🚩 Feature Flags:', FEATURE_FLAGS);
}

// Usage monitoring with real telemetry
export const UsageMonitor = {
  async checkRealtimeConnections() {
    // Use actual socket count from Supabase telemetry instead of estimation
    const { RealtimeService } = await import('../services/collaboration/realtime')
    const current = await RealtimeService.getActualSocketCount()
    const limit = FEATURE_FLAGS.MAX_REALTIME_CONNECTIONS

    if (current > limit * 0.8) {
      logger.warn(`⚠️ Realtime connections: ${current}/${limit} (80% threshold);`)
      // Send alert to admin
    }

    // Alert at 500-connection Supabase Pro limit
    if (current > 400) {
      logger.error(`🚨 Approaching Supabase connection limit: ${current}/500`);
    }
  },

  async checkStorageUsage() {
    // Query total storage size and warn at 80% of limit
  }
}
