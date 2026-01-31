/**
 * 🚨 DEPRECATED: Supabase Authentication Store
 * 
 * ❌ DO NOT IMPORT THIS FILE DIRECTLY  
 * ✅ USE: import { useAuthStore } from '@/store' instead
 * 
 * This file is deprecated as of August 2025. Direct imports cause authentication
 * state mismatches where some components see authenticated state while others don't.
 * 
 * MIGRATION HISTORY:
 * - Phase 1.2: Migrated to server-only architecture (security fix)
 * - August 2025: Deprecated direct imports (consistency fix)
 * 
 * The correct pattern is to import from '@/store' which uses feature flags to 
 * select the appropriate auth implementation:
 * - Server auth (production)  
 * - Supabase auth (legacy - this file)
 * - Mock auth (development only)
 * 
 * This file is kept for:
 * 1. Legacy compatibility when ENABLE_SUPABASE=true
 * 2. Reference implementation for Supabase auth patterns  
 * 3. Fallback during server auth issues
 * 
 * Migration: Replace all imports from this file with '@/store'
 */

'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Session } from '@supabase/auth-js'
import { BaseAuthState, createAppUser, getSessionLimits } from '@/types/auth'
import { logger } from '@/utils/logger'
import { 
  signInWithPassword, 
  signUp as serverSignUp, 
  signOut as serverSignOut,
  checkSession
} from '@/lib/actions/auth-actions'

interface AuthState extends BaseAuthState {
  // Core auth state
  session: Session | null
  isLoading: boolean
  isInitializing: boolean
  isLoggingIn: boolean
  
  // Actions using server actions
  initialize: () => () => void // Returns cleanup function
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  
  // Legacy compatibility methods
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => void
  updateUsage: (updates: Partial<{ generationsUsed: number; chatMessagesUsed: number; projectsCreated: number }>) => void
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      // Initial state
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: true,
      isInitializing: true,
      isLoggingIn: false,
      isGuest: true,
      sessionLimits: getSessionLimits(null),
      showLoginModal: false,
      showUpgradeModal: false,
      upgradeContext: null,

      initialize: () => {
        logger.info('🔐 Initializing auth store with server actions')
        
        // Get initial session from server
        const loadInitialSession = async () => {
          try {
            set({ isLoading: true, isInitializing: true })
            
            const result = await checkSession()
            
            if (process.env.NODE_ENV === 'development') {
              console.log('🔐 Server session check:', result.success ? 'authenticated' : 'not authenticated')
            }
            
            if (result.success && result.data?.user) {
              const appUser = createAppUser(result.data.user)
              
              if (process.env.NODE_ENV === 'development') {
                console.log('🔐 Setting authenticated user state:', { hasUser: !!appUser, userId: appUser?.id?.slice(0, 8) })
              }
              
              set({
                session: result.data.session || null,
                user: appUser,
                isAuthenticated: true,
                isGuest: false,
                sessionLimits: getSessionLimits(appUser),
                isLoading: false,
                isInitializing: false
              })
            } else {
              // No valid session
              if (process.env.NODE_ENV === 'development') {
                console.log('🔐 No valid session found')
              }
              
              set({
                session: null,
                user: null,
                isAuthenticated: false,
                isGuest: true,
                sessionLimits: getSessionLimits(null),
                isLoading: false,
                isInitializing: false
              })
            }
          } catch (error) {
            logger.error('Failed to load initial session from server:', error)
            set({ 
              isLoading: false, 
              isInitializing: false,
              session: null,
              user: null,
              isAuthenticated: false,
              isGuest: true,
              sessionLimits: getSessionLimits(null)
            })
          }
        }
        
        loadInitialSession()

        // No subscription cleanup needed since we use server actions
        // Server actions handle all authentication state management
        return () => {
          // No cleanup needed for server action approach
        }
      },

      signIn: async (email: string, password: string) => {
        set({ isLoggingIn: true })
        
        try {
          logger.info('🔐 Signing in with server action')
          const result = await signInWithPassword(email, password)
          
          if (result.success && result.data?.user) {
            const appUser = createAppUser(result.data.user)
            
            set({
              session: result.data.session || null,
              user: appUser,
              isAuthenticated: true,
              isGuest: false,
              sessionLimits: getSessionLimits(appUser),
              isLoggingIn: false
            })
            
            logger.info('✅ Sign in successful')
            return true
          } else {
            logger.error('❌ Sign in failed:', result.error)
            set({ isLoggingIn: false })
            return false
          }
        } catch (error) {
          logger.error('Sign in server action failed:', error)
          set({ isLoggingIn: false })
          return false
        }
      },

      signUp: async (email: string, password: string) => {
        set({ isLoggingIn: true })
        
        try {
          logger.info('🔐 Signing up with server action')
          const result = await serverSignUp(email, password)
          
          if (result.success) {
            // For signup, user might exist without session (email confirmation required)
            const appUser = result.data?.user ? createAppUser(result.data.user) : null
            
            set({
              session: result.data?.session || null,
              user: appUser,
              isAuthenticated: !!result.data?.session,
              isGuest: !result.data?.session,
              sessionLimits: getSessionLimits(appUser),
              isLoggingIn: false
            })
            
            logger.info('✅ Sign up successful')
            return true
          } else {
            logger.error('❌ Sign up failed:', result.error)
            set({ isLoggingIn: false })
            return false
          }
        } catch (error) {
          logger.error('Sign up server action failed:', error)
          set({ isLoggingIn: false })
          return false
        }
      },

      signOut: async () => {
        try {
          logger.info('🔐 Signing out with server action')
          await serverSignOut()
          
          set({
            session: null,
            user: null,
            isAuthenticated: false,
            isGuest: true,
            sessionLimits: getSessionLimits(null),
            isLoggingIn: false
          })
          
          logger.info('✅ Sign out successful')
        } catch (error) {
          logger.error('Sign out server action failed:', error)
          
          // Still clear local state even if server action fails
          set({
            session: null,
            user: null,
            isAuthenticated: false,
            isGuest: true,
            sessionLimits: getSessionLimits(null),
            isLoggingIn: false
          })
        }
      },

      refreshSession: async () => {
        try {
          logger.info('🔐 Refreshing session with server action')
          const result = await checkSession()
          
          if (result.success && result.data?.user) {
            const appUser = createAppUser(result.data.user)
            
            set({
              session: result.data.session || null,
              user: appUser,
              isAuthenticated: true,
              isGuest: false,
              sessionLimits: getSessionLimits(appUser)
            })
            
            logger.info('✅ Session refresh successful')
          } else {
            // Session is no longer valid
            set({
              session: null,
              user: null,
              isAuthenticated: false,
              isGuest: true,
              sessionLimits: getSessionLimits(null)
            })
            
            logger.info('ℹ️ Session refresh: no valid session')
          }
        } catch (error) {
          logger.error('Session refresh server action failed:', error)
        }
      },

      // Legacy compatibility methods
      login: async (email: string, password: string) => {
        return get().signIn(email, password)
      },

      logout: async () => {
        return get().signOut()
      },

      checkAuth: () => {
        // Trigger session refresh if not currently initializing
        if (!get().isInitializing && !get().isLoading) {
          get().refreshSession()
        }
      },

      updateUsage: (updates) => {
        const currentUser = get().user
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              ...updates
            }
          })
        }
      }
    }),
    {
      name: 'auth-store'
    }
  )
)

// Export helper for external usage
export const getAuthState = () => useAuthStore.getState()
export const isAuthenticated = () => useAuthStore.getState().isAuthenticated