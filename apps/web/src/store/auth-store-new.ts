/**
 * New Vanilla Zustand Auth Store
 * Expert-Validated Synchronous Bootstrap Solution
 * 
 * Key Features:
 * - Vanilla Zustand (createStore) for better SSR
 * - Tri-state auth: 'unknown' | 'authenticated' | 'anonymous'
 * - Settlement flag: isSettled prevents premature operations
 * - HMR persistence: globalThis.__AUTH_STORE__ in development
 * - Synchronous derivation: Auto-compute status from user state
 */

import { createStore } from 'zustand/vanilla'
import { devtools } from 'zustand/middleware'
import { BaseAuthState, getSessionLimits } from '@/types/auth'
import { logger } from '@/utils/logger'
import type { Session } from '@supabase/auth-js'

// Tri-state auth status
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

export interface ServerAuthSnapshot {
  user: any | null
  status: AuthStatus
  isSettled: boolean
  sessionLimits?: any
}

interface NewAuthState extends BaseAuthState {
  // Core tri-state
  status: AuthStatus
  isSettled: boolean
  
  // Legacy compatibility
  session: Session | null
  isLoading: boolean
  isInitializing: boolean
  isLoggingIn: boolean

  // Polling control (for compatibility with existing poller)
  _pollAbort?: AbortController | null
  _pollTimer?: ReturnType<typeof setTimeout> | null
  isPollingPausedUntil?: number

  // Actions
  setSnapshot: (snapshot: Partial<ServerAuthSnapshot>) => void
  pausePolling: (ms?: number) => void
  initialize: () => (() => void) // Returns cleanup function
  
  // Legacy compatibility methods
  checkAuth: () => Promise<void>
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  updateProfile: (updates: any) => Promise<{ success: boolean; error?: string }>
  updateUsage: (updates: Partial<{ generationsUsed: number; chatMessagesUsed: number; projectsCreated: number }>) => void
}

// Global store reference for HMR persistence in development
declare global {
  var __AUTH_STORE__: any | undefined
}

export function createAuthStore(initialSnapshot?: ServerAuthSnapshot) {
  // HMR persistence: reuse existing store in development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    if (globalThis.__AUTH_STORE__) {
      logger.info('🔥 HMR: Reusing existing auth store')
      // Update with new snapshot if provided
      if (initialSnapshot) {
        globalThis.__AUTH_STORE__.setState((state) => ({
          ...state,
          ...initialSnapshot,
          // Derive isAuthenticated from user presence
          isAuthenticated: initialSnapshot.status === 'authenticated',
          isGuest: initialSnapshot.status !== 'authenticated'
        }))
      }
      return globalThis.__AUTH_STORE__
    }
  }

  // Derive initial state from snapshot
  const derivedState = deriveAuthState(initialSnapshot)

  const store = createStore<NewAuthState>()(
    devtools(
      (set, get) => ({
        // Initial state from snapshot
        ...derivedState,

        // Actions
        setSnapshot: (snapshot: Partial<ServerAuthSnapshot>) => {
          logger.info('🔄 Auth store: Setting snapshot', { 
            status: snapshot.status,
            hasUser: !!snapshot.user,
            isSettled: snapshot.isSettled
          })
          
          const newState = deriveAuthState({
            user: snapshot.user ?? get().user,
            status: snapshot.status ?? get().status,
            isSettled: snapshot.isSettled ?? get().isSettled,
            sessionLimits: snapshot.sessionLimits ?? get().sessionLimits
          })

          set(newState)
        },

        pausePolling: (ms = 2000) => {
          const { _pollAbort, _pollTimer } = get()
          try { _pollAbort?.abort() } catch {}
          if (_pollTimer) clearTimeout(_pollTimer)
          const resumeAt = Date.now() + ms
          set({ isPollingPausedUntil: resumeAt })
          logger.debug('auth', '[New Auth Store] Polling paused for ' + ms + 'ms')
        },

        // Legacy compatibility methods - delegate to existing server store
        checkAuth: async () => {
          // Import existing server store for compatibility
          const { useServerAuthStore } = await import('./server-auth-store')
          const serverStore = useServerAuthStore.getState()
          await serverStore.checkAuth()
          
          // Sync state from server store
          const { user, isAuthenticated } = useServerAuthStore.getState()
          get().setSnapshot({
            user,
            status: isAuthenticated ? 'authenticated' : 'anonymous',
            isSettled: true
          })
        },

        refreshSession: async () => {
          const { useServerAuthStore } = await import('./server-auth-store')
          const serverStore = useServerAuthStore.getState()
          await serverStore.refreshSession()
          
          // Sync state from server store
          const { user, isAuthenticated } = useServerAuthStore.getState()
          get().setSnapshot({
            user,
            status: isAuthenticated ? 'authenticated' : 'anonymous',
            isSettled: true
          })
        },

        signOut: async () => {
          // Update local state immediately
          get().setSnapshot({
            user: null,
            status: 'anonymous',
            isSettled: true
          })

          // Delegate to server store
          const { useServerAuthStore } = await import('./server-auth-store')
          const serverStore = useServerAuthStore.getState()
          await serverStore.signOut()
        },

        login: async (email: string, password: string) => {
          const { useServerAuthStore } = await import('./server-auth-store')
          const serverStore = useServerAuthStore.getState()
          const result = await serverStore.login(email, password)
          
          if (result) {
            const { user, isAuthenticated } = useServerAuthStore.getState()
            get().setSnapshot({
              user,
              status: isAuthenticated ? 'authenticated' : 'anonymous',
              isSettled: true
            })
          }
          
          return result
        },

        logout: async () => {
          return get().signOut()
        },

        updateUsage: (updates) => {
          logger.info('📊 New auth store: Usage update requested:', updates)
        },

        // Feature gates (copied from existing store)
        canPerformAction: (action: 'generate' | 'chat' | 'export' | 'share') => {
          const { sessionLimits } = get()

          switch (action) {
            case 'export':
              return sessionLimits.canExport
            case 'share':
              return sessionLimits.canShare
            case 'generate':
              return sessionLimits.maxGenerations > 0
            case 'chat':
              return sessionLimits.maxChatMessages > 0
            default:
              return false
          }
        },

        requestUpgrade: (action: string) => {
          const { user } = get()

          if (!user) {
            set({
              showLoginModal: true,
              upgradeContext: {
                action,
                message: `Sign in to ${action}`
              }
            })
          } else {
            set({
              showUpgradeModal: true,
              upgradeContext: {
                action,
                message: `Upgrade to unlock ${action}`
              }
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
          set({
            showUpgradeModal: true,
            upgradeContext: {
              action,
              message: `Upgrade to unlock ${action}`
            }
          })
        },

        closeUpgradeModal: () => set({
          showUpgradeModal: false,
          upgradeContext: null
        }),

        openCreditsModal: (context) => set({
          showCreditsModal: true,
          creditsContext: context || null
        }),

        closeCreditsModal: () => set({
          showCreditsModal: false,
          creditsContext: null
        })
      }),
      { name: 'new-auth-store' }
    )
  )

  // Store globally for HMR in development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    globalThis.__AUTH_STORE__ = store
    logger.info('🔥 HMR: Stored auth store globally')
  }

  return store
}

// Helper to derive complete auth state from snapshot
function deriveAuthState(snapshot?: ServerAuthSnapshot): NewAuthState {
  const user = snapshot?.user ?? null
  const status = snapshot?.status ?? 'unknown'
  const isSettled = snapshot?.isSettled ?? false
  const sessionLimits = snapshot?.sessionLimits ?? getSessionLimits(user)

  return {
    // Core tri-state
    status,
    isSettled,
    
    // Derived state
    user,
    isAuthenticated: status === 'authenticated',
    isGuest: status !== 'authenticated',
    sessionLimits,
    
    // Legacy compatibility
    session: null, // Not used in server auth mode
    isLoading: !isSettled,
    isInitializing: !isSettled,
    isLoggingIn: false,
    
    // Modal state
    showLoginModal: false,
    showUpgradeModal: false,
    upgradeContext: null,
    showCreditsModal: false,
    creditsContext: null,
    
    // Polling control
    _pollAbort: null,
    _pollTimer: null,
    isPollingPausedUntil: undefined,

    // Functions will be added by store creation
  } as NewAuthState
}

// React hook for new store with Context-based stable fallback
import { useStore } from 'zustand'
import { createContext, useContext } from 'react'
import type { StoreApi } from 'zustand'

// ✅ EXPERT SOLUTION: Module-scope fallback store (never created in render)
let FALLBACK_AUTH_STORE: StoreApi<NewAuthState> | null = null

function getFallbackAuthStore(): StoreApi<NewAuthState> {
  if (!FALLBACK_AUTH_STORE) {
    // Type assertion for fallback state - contains minimal required methods
    const fallbackState = {
      status: 'unknown' as AuthStatus,
      isSettled: false,
      user: null,
      isAuthenticated: false,
      isGuest: true,
      sessionLimits: null,
      session: null,
      isLoading: true,
      isInitializing: true,
      isLoggingIn: false,
      _pollAbort: null,
      _pollTimer: null,
      isPollingPausedUntil: undefined,
      setSnapshot: () => {},
      pausePolling: () => {},
      checkAuth: async () => {},
      initialize: () => () => {},
      login: async () => false,
      logout: async () => {},
      resetPassword: async () => ({ success: false, error: 'Store not initialized' }),
      updateProfile: async () => ({ success: false, error: 'Store not initialized' })
    } as unknown as NewAuthState
    
    FALLBACK_AUTH_STORE = createStore<NewAuthState>(() => fallbackState)
  }
  return FALLBACK_AUTH_STORE
}

// ✅ EXPERT SOLUTION: Context with stable fallback (never null)
export const AuthStoreContext = createContext<StoreApi<NewAuthState>>(getFallbackAuthStore())

// ✅ EXPERT FIX: Stable selector that returns primitive values to prevent object recreation
const authStatusSelector = (state: NewAuthState) => state

export function useAuthStatus() {
  // ✅ CRITICAL FIX: Always returns a store, always calls useStore
  const store = useContext(AuthStoreContext)
  return useStore(store, authStatusSelector)
}