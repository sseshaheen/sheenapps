/**
 * 🚨 DEPRECATED: Mock Authentication Store  
 * 
 * ❌ DO NOT IMPORT THIS FILE DIRECTLY
 * ✅ USE: import { useAuthStore } from '@/store' instead
 * 
 * This file is deprecated as of August 2025. Direct imports cause authentication
 * state mismatches where some components see authenticated state while others don't.
 * 
 * The correct pattern is to import from '@/store' which uses feature flags to 
 * select the appropriate auth implementation:
 * - Server auth (production)  
 * - Supabase auth (legacy)
 * - Mock auth (development only)
 * 
 * This file is kept for:
 * 1. Development/testing when ENABLE_SERVER_AUTH=false 
 * 2. Backward compatibility during migration
 * 3. Reference implementation for mock auth patterns
 * 
 * Migration: Replace all imports from this file with '@/store'
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { MockAuth, getSessionLimits } from '@/lib/mock-auth'
import type { User, SessionLimits, BaseAuthState } from '@/types/auth'

interface AuthState extends BaseAuthState {
  // Loading state
  isLoading: boolean
  isInitializing: boolean
  isLoggingIn: boolean
  
  // Actions specific to mock auth
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  signOut: () => void
  checkAuth: () => void
  updateUsage: (updates: Partial<{ generationsUsed: number; chatMessagesUsed: number; projectsCreated: number }>) => void
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitializing: true,
      isLoggingIn: false,
      isGuest: true,
      sessionLimits: {
        maxGenerations: 3,
        maxChatMessages: 10,
        maxProjects: 1,
        canExport: false,
        canShare: false,
        canSaveProjects: false
      },
      showLoginModal: false,
      showUpgradeModal: false,
      upgradeContext: null,

      // Authentication actions
      login: async (email: string, password: string) => {
        const user = await MockAuth.login(email, password)
        
        if (user) {
          set({
            user,
            isAuthenticated: true,
            isGuest: false,
            sessionLimits: getSessionLimits(user),
            showLoginModal: false,
            isInitializing: false,
            isLoggingIn: false
          })
          return true
        }
        
        return false
      },

      logout: () => {
        MockAuth.logout()
        set({
          user: null,
          isAuthenticated: false,
          isGuest: true,
          sessionLimits: getSessionLimits(null),
          showLoginModal: false,
          showUpgradeModal: false,
          upgradeContext: null,
          isInitializing: false,
          isLoggingIn: false
        })
      },

      signOut: () => {
        // Alias for logout to match expected interface
        get().logout()
      },

      checkAuth: () => {
        const user = MockAuth.getCurrentUser()
        if (user) {
          set({
            user,
            isAuthenticated: true,
            isGuest: false,
            sessionLimits: getSessionLimits(user),
            isInitializing: false,
            isLoggingIn: false
          })
        } else {
          set({ isInitializing: false })
        }
      },

      updateUsage: (updates: Partial<User['usage']>) => {
        const { user } = get()
        if (user) {
          const updatedUser = MockAuth.updateUserUsage(user, updates)
          set({
            user: updatedUser,
            sessionLimits: getSessionLimits(updatedUser)
          })
        }
      },

      // Feature gates
      canPerformAction: (action: 'generate' | 'chat' | 'export' | 'share') => {
        const { user } = get()
        return MockAuth.canPerformAction(user, action)
      },

      requestUpgrade: (action: string) => {
        const { user } = get()
        const message = MockAuth.getUpgradeMessage(user, action)
        
        if (!user) {
          // Guest user - show login modal
          set({
            showLoginModal: true,
            upgradeContext: { action, message }
          })
        } else {
          // Authenticated user - show upgrade modal
          set({
            showUpgradeModal: true,
            upgradeContext: { action, message }
          })
        }
      },

      // Modal controls
      openLoginModal: () => set({ showLoginModal: true }),
      closeLoginModal: () => set({ 
        showLoginModal: false,
        upgradeContext: null 
      }),
      
      openUpgradeModal: (action: string) => {
        const { user } = get()
        const message = MockAuth.getUpgradeMessage(user, action)
        set({
          showUpgradeModal: true,
          upgradeContext: { action, message }
        })
      },
      
      closeUpgradeModal: () => set({ 
        showUpgradeModal: false,
        upgradeContext: null 
      })
    }),
    { name: 'auth-store' }
  )
)