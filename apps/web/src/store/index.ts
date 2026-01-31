/**
 * Store Conditional Exports
 * Selects the appropriate store implementation based on feature flags
 */

import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { useAuthStore as useMockAuthStore } from './auth-store'
import { useAuthStore as useSupabaseAuthStore } from './supabase-auth-store'
import { useServerAuthStore } from './server-auth-store'

// Conditional auth store export (kept separate from unified store)
// Priority: Server Auth (if enabled) > Supabase > Mock
export const useAuthStore = FEATURE_FLAGS.ENABLE_SERVER_AUTH
  ? useServerAuthStore
  : FEATURE_FLAGS.ENABLE_SUPABASE 
    ? useSupabaseAuthStore 
    : useMockAuthStore

// Re-export from unified store compatibility layer
export { 
  useBuilderStore,
  useQuestionFlowStore,
  usePreviewGenerationStore,
  useEditingGuidanceStore,
  // Individual selectors for better performance
  useBusinessIdea,
  useBusinessConfig,
  useBuildProgress,
  useCurrentQuestion,
  useQuestionHistory,
  useEngagementScore,
  useFlowProgress,
  useIsGenerating,
  useIsGenerated,
  useEditingGuidance
} from './compat'

// Note: To rollback to original stores, change imports in './compat/index.ts'
// Original stores are still available at:
// - './builder-store'
// - './question-flow-store'
// - './preview-generation-store'
// - './editing-guidance-store'