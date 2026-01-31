/**
 * Unified Authentication Types
 * Provides compatibility between mock auth and Supabase auth
 */

import type { User as SupabaseUser } from '@supabase/auth-js'
import { PLAN_LIMITS } from '@/config/pricing-plans'

// OAuth provider types
export type OAuthProvider = 'github' | 'google' | 'discord' | 'twitter'

// Base user interface that extends Supabase User with app-specific fields
export interface User extends SupabaseUser {
  // App-specific fields for backward compatibility
  name?: string
  avatar?: string
  plan?: 'free' | 'pro' | 'enterprise' | 'starter' | 'growth' | 'scale'
  
  // Usage tracking
  usage?: {
    generationsUsed: number
    chatMessagesUsed: number
    projectsCreated: number
  }
  
  // Project relationships (can be array of IDs for backward compatibility)
  projects?: Array<{
    id: string
    name: string
    subdomain?: string
  }> | string[]
}

// Session limits interface
export interface SessionLimits {
  maxGenerations: number
  maxChatMessages: number
  maxProjects: number
  canExport: boolean
  canShare: boolean
  canSaveProjects: boolean
}

// Upgrade context for modals
export interface UpgradeContext {
  action: string
  message: string
}

// Credits context for credits modal
export interface CreditsContext {
  message?: string
  costToComplete?: number
  suggestedPackage?: string
}

// Common auth state interface
export interface BaseAuthState {
  // User state
  user: User | null
  isAuthenticated: boolean
  isGuest: boolean
  isInitializing?: boolean
  
  // Session limits
  sessionLimits: SessionLimits
  
  // UI state
  showLoginModal: boolean
  showUpgradeModal: boolean
  upgradeContext: UpgradeContext | null
  showCreditsModal: boolean
  creditsContext: CreditsContext | null
  
  // Feature gates
  canPerformAction: (action: 'generate' | 'chat' | 'export' | 'share') => boolean
  requestUpgrade: (action: string) => void
  
  // Modal controls
  openLoginModal: () => void
  closeLoginModal: () => void
  openUpgradeModal: (action: string) => void
  closeUpgradeModal: () => void
  openCreditsModal: (context?: CreditsContext) => void
  closeCreditsModal: () => void
}

// Helper function to convert Supabase User to our extended User type
export function createAppUser(supabaseUser: SupabaseUser | null): User | null {
  if (!supabaseUser) return null
  
  return {
    ...supabaseUser,
    name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
    avatar: supabaseUser.user_metadata?.avatar_url || undefined,
    plan: 'free', // Default plan, can be upgraded based on subscription
    usage: {
      generationsUsed: 0,
      chatMessagesUsed: 0,
      projectsCreated: 0
    },
    projects: []
  }
}

// Helper function to get session limits based on user
export function getSessionLimits(user: User | null): SessionLimits {
  if (!user) {
    // Guest limits
    return {
      maxGenerations: 3,
      maxChatMessages: 10,
      maxProjects: 1,
      canExport: false,
      canShare: false,
      canSaveProjects: false
    }
  }
  
  // Get limits from centralized pricing config
  const planLimits = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free
  
  // Plan-based limits
  switch (user.plan) {
    case 'starter':
      return {
        maxGenerations: planLimits.max_ai_operations_per_month,
        maxChatMessages: 1000,
        maxProjects: planLimits.max_projects,
        canExport: true,
        canShare: true,
        canSaveProjects: true
      }
    case 'growth':
      return {
        maxGenerations: planLimits.max_ai_operations_per_month,
        maxChatMessages: 5000,
        maxProjects: planLimits.max_projects,
        canExport: true,
        canShare: true,
        canSaveProjects: true
      }
    case 'scale':
    case 'enterprise':
      return {
        maxGenerations: planLimits.max_ai_operations_per_month === -1 ? Infinity : planLimits.max_ai_operations_per_month,
        maxChatMessages: Infinity,
        maxProjects: planLimits.max_projects === -1 ? Infinity : planLimits.max_projects,
        canExport: true,
        canShare: true,
        canSaveProjects: true
      }
    case 'pro':
      return {
        maxGenerations: planLimits.max_ai_operations_per_month,
        maxChatMessages: 5000,
        maxProjects: planLimits.max_projects,
        canExport: true,
        canShare: true,
        canSaveProjects: true
      }
    default: // 'free'
      return {
        maxGenerations: planLimits.max_ai_operations_per_month,
        maxChatMessages: 1000,
        maxProjects: planLimits.max_projects,
        canExport: !planLimits.features.watermark, // can export without watermark = paid plan
        canShare: true,
        canSaveProjects: true
      }
  }
}