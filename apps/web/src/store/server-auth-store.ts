/**
 * Server-Side Authentication Store (Production Implementation)
 * Uses API routes instead of direct Supabase client calls
 * Eliminates CORS errors and improves security
 *
 * ⚠️  IMPORTANT: DO NOT IMPORT THIS FILE DIRECTLY
 * ✅ USE: import { useAuthStore } from '@/store' instead
 *
 * This store is automatically selected when FEATURE_FLAGS.ENABLE_SERVER_AUTH=true
 * Direct imports bypass the feature flag system and can cause auth state mismatches.
 *
 * Correct usage:
 * import { useAuthStore } from '@/store' // ✅ Conditional selection
 *
 * Wrong usage:
 * import { useServerAuthStore } from '@/store/server-auth-store' // ❌ Direct import
 */

import { fetchApi } from '@/lib/api-utils'
import { BaseAuthState, getSessionLimits } from '@/types/auth'
import { logger } from '@/utils/logger'
import type { Session } from '@supabase/auth-js'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Client-safe debug helper (no server imports)
const clientAuthDebug = (phase: string, message: string, data?: any) => {
  // Debug logging disabled for production
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true') {
    console.log(`🔐 [CLIENT-AUTH] ${phase}: ${message}`, data || '')
  }
}

interface AuthState extends BaseAuthState {
  // Core state
  session: Session | null
  isLoading: boolean
  isInitializing: boolean
  isLoggingIn: boolean

  // Polling control
  _pollAbort?: AbortController | null
  _pollTimer?: ReturnType<typeof setTimeout> | null
  isPollingPausedUntil?: number

  // Actions
  initialize: () => () => void // Returns cleanup function
  checkAuth: () => Promise<void>
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
  pausePolling: (ms?: number) => void

  // Legacy compatibility methods
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  updateUsage: (updates: Partial<{ generationsUsed: number; chatMessagesUsed: number; projectsCreated: number }>) => void
}

// Helper to check for recent login indicators (no more cookie polling)
function hasRecentLoginIndicators(): boolean {
  // Only check session storage for recent login/sync flags
  // This eliminates problematic document.cookie access
  const sessionStorageAuth = sessionStorage.getItem('auth_pending_verification') === 'true' ||
                            sessionStorage.getItem('auth_pending_sync') === 'true'


  return sessionStorageAuth
}

export const useServerAuthStore = create<AuthState>()(
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
      showCreditsModal: false,
      creditsContext: null,

      // Polling control
      _pollAbort: null,
      _pollTimer: null,
      isPollingPausedUntil: undefined,

      initialize: () => {
        const currentState = get()

        clientAuthDebug('INIT_START', 'Initializing server auth store', {
          location: typeof window !== 'undefined' ? window.location.pathname : 'server',
          currentAuthState: currentState.isAuthenticated,
          currentUser: currentState.user?.email || null,
          alreadyHasUser: !!currentState.user
        })

        // console.log('🔐 Initializing server auth store - current state:', {
        //   isAuthenticated: currentState.isAuthenticated,
        //   hasUser: !!currentState.user,
        //   userEmail: currentState.user?.email,
        //   isLoading: currentState.isLoading,
        //   isInitializing: currentState.isInitializing,
        //   isGuest: currentState.isGuest
        // })

        logger.info('🔐 Initializing server auth store')

        // Load initial session
        const loadInitialSession = async () => {
          try {
            const currentState = get()

            // Check auth_success URL parameter for fresh login
            const hasAuthSuccessParam = typeof window !== 'undefined' &&
              window.location.search.includes('auth_success=true')

            // ✅ CRITICAL FIX: Skip initialization if we already have an authenticated user from server seeding
            // Trust the server snapshot - don't force auth check just because auth_success=true is present
            if (currentState.isAuthenticated && currentState.user && !currentState.isLoading && !currentState.isInitializing) {
              // console.log('🚀 Skipping client auth initialization - already authenticated from server snapshot:', {
              //   userEmail: currentState.user.email,
              //   isAuthenticated: currentState.isAuthenticated,
              //   isLoading: currentState.isLoading,
              //   isInitializing: currentState.isInitializing,
              //   hasAuthSuccess: hasAuthSuccessParam
              // })
              clientAuthDebug('SKIP_INIT', 'Already authenticated from server snapshot', {
                userEmail: currentState.user.email,
                isAuthenticated: currentState.isAuthenticated,
                hasAuthSuccess: hasAuthSuccessParam
              })

              // Set up delayed polling to ensure auth state stays fresh
              if (hasAuthSuccessParam) {
                setTimeout(() => {
                  get().checkAuth()
                }, 2000)
              }

              // Ensure we're marked as fully loaded
              set({
                isLoading: false,
                isInitializing: false
              })
              return
            }


            // Check for recent login indicators and success flag
            const hasRecentLogin = hasRecentLoginIndicators()
            const hasAuthSuccessSession = typeof window !== 'undefined' &&
              (window.location.search.includes('auth_success=true') ||
               sessionStorage.getItem('recent_auth_success') === 'true')

            clientAuthDebug('INIT_CHECK', 'Checking for recent login indicators', {
              hasRecentLogin,
              hasAuthSuccess: hasAuthSuccessSession,
              location: typeof window !== 'undefined' ? window.location.pathname : 'server',
              urlParams: typeof window !== 'undefined' ? window.location.search : null,
              sessionStorageAuth: typeof window !== 'undefined' ? {
                authPendingVerification: sessionStorage.getItem('auth_pending_verification'),
                authPendingSync: sessionStorage.getItem('auth_pending_sync'),
                recentAuthSuccess: sessionStorage.getItem('recent_auth_success')
              } : null
            })

            if (hasRecentLogin || hasAuthSuccessSession) {
              clientAuthDebug('INIT_RECENT_LOGIN', 'Recent login detected, waiting for auth sync', {
                hasRecentLogin,
                hasAuthSuccess: hasAuthSuccessSession
              })

              // Wait longer for auth success cases to ensure cookie is set
              const delayMs = hasAuthSuccessSession ? 500 : 1000
              await new Promise(resolve => setTimeout(resolve, delayMs))

              sessionStorage.removeItem('auth_pending_sync')
              sessionStorage.removeItem('auth_pending_verification')

              // Set flag to indicate recent success and clear URL parameter
              if (hasAuthSuccessSession && typeof window !== 'undefined') {
                sessionStorage.setItem('recent_auth_success', 'true')
                sessionStorage.setItem('auth_success_timestamp', Date.now().toString()) // EXPERT: Add timestamp
                // Clear the auth_success parameter from URL
                const url = new URL(window.location.href)
                if (url.searchParams.has('auth_success')) {
                  url.searchParams.delete('auth_success')
                  window.history.replaceState({}, '', url.toString())
                }
              }
            }

            // Always check auth state with server (eliminates cookie dependency)
            clientAuthDebug('INIT_CHECK_AUTH', 'Starting auth check with server')

            // EXPERT FIX: Add proper delay to let browser apply Set-Cookie from redirects
            // For auth success cases, we already waited above, so just a small delay
            const finalDelay = hasAuthSuccessSession ? 50 : 100
            await new Promise(resolve => setTimeout(resolve, finalDelay))

            // Directly call checkAuth instead of duplicating logic
            await get().checkAuth()

            // Clear the recent auth success flag after 5 seconds
            if (hasAuthSuccessSession && typeof window !== 'undefined') {
              setTimeout(() => {
                sessionStorage.removeItem('recent_auth_success')
              }, 5000)
            }

          } catch (error) {
            logger.error('🔐 Failed to load initial session:', error)
            set({
              isLoading: false,
              isInitializing: false,
              isGuest: true,
              sessionLimits: getSessionLimits(null)
            })
          }
        }

        loadInitialSession()

        // Set up periodic auth check (every 10 minutes, no cookie dependency)
        const intervalId = setInterval(() => {
          const state = get()
          // ✅ EXPERT FIX: Early return while polling is paused
          if (state.isPollingPausedUntil && Date.now() < state.isPollingPausedUntil) {
            console.debug('🔄 Skipping auth check - polling paused')
            return
          }
          // Only check if we think we're authenticated to avoid unnecessary calls
          if (state.isAuthenticated) {
            get().checkAuth()
          }
        }, 10 * 60 * 1000)

        // Return cleanup function
        return () => {
          clearInterval(intervalId)
        }
      },

      // testHello: async () => {
      //   try {
      //     console.log('🎯 TESTING /api/hello...')
      //     const response = await fetchApi('/api/hello', {
      //       method: 'GET',
      //       credentials: 'include'
      //     })

      //     console.log('🎯 HELLO RESPONSE:', {
      //       ok: response.ok,
      //       status: response.status,
      //       statusText: response.statusText
      //     })

      //     const data = await response.json()
      //     console.log('🎯 HELLO DATA:', data)
      //   } catch (error) {
      //     console.error('🎯 HELLO ERROR:', error)
      //   }
      // },

      checkAuth: async (options?: { force?: boolean }) => {
        const currentState = get()

        // EXPERT FIX: Immediate mock auth for test stability
        // EXPERT FIX #2: Use NEXT_PUBLIC_* for client stores - process.env.TEST_E2E is undefined in browser
        if (process.env.NEXT_PUBLIC_TEST_E2E === '1' || process.env.NODE_ENV === 'test') {
          clientAuthDebug('TEST_MODE', 'TEST_E2E mode: Providing mock authenticated state')
          const testUser = {
            id: 'test-user-123',
            email: 'test@example.com',
            created_at: new Date().toISOString(),
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            confirmed_at: new Date().toISOString()
          }
          const authenticatedState = {
            session: {
              user: testUser,
              access_token: 'test-access-token',
              refresh_token: 'test-refresh-token',
              expires_in: 3600,
              token_type: 'bearer' as const
            },
            user: testUser,
            isAuthenticated: true,
            isGuest: false,
            sessionLimits: getSessionLimits(testUser),
            isLoading: false,
            isInitializing: false
          }
          set(authenticatedState)
          return
        }

        // Check for recent login from server snapshot (conservative mode indicator)
        const hasRecentAuthSuccess = typeof window !== 'undefined' && (
          window.location.search.includes('auth_success=true') ||
          sessionStorage.getItem('recent_auth_success') === 'true'
        )

        clientAuthDebug('CHECK_START', 'Starting auth check', {
          currentAuthState: currentState.isAuthenticated,
          currentUser: currentState.user?.id || null,
          currentGuest: currentState.isGuest,
          isLoading: currentState.isLoading,
          isInitializing: currentState.isInitializing,
          hasRecentAuthSuccess,
          location: typeof window !== 'undefined' ? window.location.pathname : 'server'
        })

        try {
          // No cookie dependency - always check with server
          clientAuthDebug('API_REQUEST', 'Calling /api/auth/me')

          // EXPERT FIX: Force no-cache fetch when force option is used
          const response = await fetchApi('/api/auth/me', {
            method: 'GET',
            credentials: 'include',
            ...(options?.force && {
              cache: 'no-store',
              headers: {
                'x-auth-revalidate': '1',
                'Cache-Control': 'no-cache'
              }
            })
          })

          clientAuthDebug('API_RESPONSE', '/api/auth/me response received', {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            url: response.url,
            hasAuthCookie: document.cookie.includes('sb-'),
            hasCanaryCookie: document.cookie.includes('app-has-auth'),
            timestamp: new Date().toISOString()
          })

          if (!response.ok) {
            clientAuthDebug('API_FAILURE', 'Response not OK, analyzing error type', {
              status: response.status,
              statusText: response.statusText,
              currentlyAuthenticated: currentState.isAuthenticated,
              hasRecentAuthSuccess
            })

            // ✅ CONSERVATIVE MODE: Don't overwrite authenticated server snapshots with failed API calls
            if (currentState.isAuthenticated && hasRecentAuthSuccess && (response.status === 401 || response.status === 403)) {
              clientAuthDebug('CONSERVATIVE_MODE', 'Protecting authenticated server snapshot from failed delayed check', {
                currentlyAuthenticated: currentState.isAuthenticated,
                hasRecentAuthSuccess,
                apiStatus: response.status,
                action: 'keeping_current_auth_state'
              })

              // Keep current authenticated state, just stop loading
              set({
                isLoading: false,
                isInitializing: false
              })
              return
            }

            // EXPERT FIX: Don't immediately logout on temporary failures
            // Only clear auth state for definitive auth failures (401, 403)
            // For other errors (500, network), keep current state and retry later
            if (response.status === 401 || response.status === 403) {
              clientAuthDebug('AUTH_INVALID', 'Definitive auth failure - clearing state')

              const unauthenticatedState = {
                session: null,
                user: null,
                isAuthenticated: false,
                isGuest: true,
                sessionLimits: getSessionLimits(null),
                isLoading: false,
                isInitializing: false
              }

              clientAuthDebug('STATE_UPDATE', 'Setting unauthenticated state', unauthenticatedState)
              set(unauthenticatedState)
            } else {
              clientAuthDebug('TEMP_FAILURE', 'Temporary error - keeping current auth state', {
                status: response.status,
                willRetry: true
              })

              // Just stop loading state for temporary failures
              set({
                isLoading: false,
                isInitializing: false
              })
            }
            return
          }

          const data = await response.json()

          clientAuthDebug('API_DATA', 'Parsed auth data from response', {
            hasUser: !!data.user,
            isAuthenticated: data.isAuthenticated,
            isGuest: data.isGuest,
            userId: data.user?.id || null,
            userEmail: data.user?.email || null,
            hasSessionLimits: !!data.sessionLimits
          })

          // ✅ EXPERT FIX: Narrow conservative mode to actual login window (10s)
          const authSuccessTimestamp = Number(sessionStorage.getItem('auth_success_timestamp') || 0)
          const withinLoginWindow = Date.now() - authSuccessTimestamp < 10_000 // 10 seconds
          const hasValidLoginSignal = typeof window !== 'undefined' && (
            window.location.search.includes('auth_success=true') ||
            (sessionStorage.getItem('recent_auth_success') === 'true' && withinLoginWindow)
          )

          if (currentState.isAuthenticated && hasValidLoginSignal && !data.isAuthenticated) {
            clientAuthDebug('CONSERVATIVE_MODE', 'Protecting authenticated state within 10s login window', {
              currentlyAuthenticated: currentState.isAuthenticated,
              withinLoginWindow,
              timeSinceLogin: Date.now() - authSuccessTimestamp,
              apiSaysAuthenticated: data.isAuthenticated,
              action: 'keeping_current_auth_state_temporarily'
            })

            // Keep current authenticated state, just stop loading
            set({
              isLoading: false,
              isInitializing: false
            })
            return
          }

          // EXPERT: If not within login window, trust the server response
          if (currentState.isAuthenticated && !hasValidLoginSignal && !data.isAuthenticated) {
            clientAuthDebug('CONSERVATIVE_MODE_EXPIRED', 'Login window expired, trusting server response', {
              timeSinceLogin: Date.now() - authSuccessTimestamp,
              withinWindow: withinLoginWindow,
              serverSaysAuthenticated: data.isAuthenticated
            })
          }

          const newState = {
            user: data.user,
            isAuthenticated: data.isAuthenticated,
            isGuest: data.isGuest,
            sessionLimits: data.sessionLimits || getSessionLimits(data.user),
            isLoading: false,
            isInitializing: false
          }

          // Track state changes
          const stateChanged = {
            authChanged: currentState.isAuthenticated !== newState.isAuthenticated,
            userChanged: (currentState.user?.id || null) !== (newState.user?.id || null),
            guestChanged: currentState.isGuest !== newState.isGuest
          }

          clientAuthDebug('STATE_COMPARISON', 'Comparing old vs new state', {
            oldState: {
              isAuthenticated: currentState.isAuthenticated,
              userId: currentState.user?.id || null,
              isGuest: currentState.isGuest
            },
            newState: {
              isAuthenticated: newState.isAuthenticated,
              userId: newState.user?.id || null,
              isGuest: newState.isGuest
            },
            changes: stateChanged
          })

          clientAuthDebug('STATE_UPDATE', 'Updating auth store state', newState)
          set(newState)

          const finalState = get()
          clientAuthDebug('STATE_FINAL', 'Final auth state after update', {
            isAuthenticated: finalState.isAuthenticated,
            userId: finalState.user?.id || null,
            isGuest: finalState.isGuest,
            isLoading: finalState.isLoading,
            isInitializing: finalState.isInitializing
          })

        } catch (error) {
          clientAuthDebug('CHECK_FAILED', 'Auth check failed with exception', {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            errorName: error instanceof Error ? error.name : typeof error
          })

          logger.error('🔐 Auth check failed:', error)
        }
      },

      refreshSession: async () => {
        try {
          // No cookie dependency - always attempt refresh if called

          const response = await fetchApi('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include'
          })

          if (!response.ok) {
            const { error } = await response.json()
            logger.error('🔐 Session refresh failed:', error)

            // Handle unauthorized - redirect to login
            if (response.status === 401) {
              set({
                session: null,
                user: null,
                isAuthenticated: false,
                isGuest: true,
                sessionLimits: getSessionLimits(null),
                showLoginModal: true,
                upgradeContext: {
                  action: 'continue',
                  message: 'Your session expired, please sign in again'
                }
              })
            }
            return
          }

          const data = await response.json()
          logger.info('🔐 Session refreshed successfully')

          set({
            user: data.user,
            isAuthenticated: data.isAuthenticated,
            isGuest: data.isGuest,
            sessionLimits: data.sessionLimits || getSessionLimits(data.user)
          })
        } catch (error) {
          logger.error('🔐 Session refresh error:', error)
        }
      },

      signOut: async () => {
        // Clear local state IMMEDIATELY to prevent UI flicker
        set({
          session: null,
          user: null,
          isAuthenticated: false,
          isGuest: true,
          sessionLimits: getSessionLimits(null),
          showLoginModal: false,
          showUpgradeModal: false,
          upgradeContext: null,
          showCreditsModal: false,
          creditsContext: null,
          isLoading: false,
          isInitializing: false
        })

        try {
          // EXPERT FIX: Call correct sign-out API endpoint
          const response = await fetchApi('/api/auth/sign-out', {
            method: 'POST',
            credentials: 'include'
          })

          if (!response.ok) {
            logger.error('🔐 Sign out failed:', response.statusText)
          }

          // EXPERT FIX: Only clear app-specific cookies on client side
          // Manual sb-*-auth-token management causes "refresh churn and random logouts"
          // Server-side logout API already called Supabase auth.signOut() which handles auth tokens
          const cookiesToClear = [
            'app-has-auth'
          ]

          cookiesToClear.forEach(cookieName => {
            // Clear cookie for all possible domains
            document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
            document.cookie = `${cookieName}=; path=/; domain=.${window.location.hostname}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
            document.cookie = `${cookieName}=; path=/; domain=${window.location.hostname}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
          })

          // EXPERT FIX: Don't manually clear Supabase auth cookies from client-side
          // The server-side /api/auth/logout already called supabase.auth.signOut()
          // which properly handles auth token cleanup

          // Clear session storage flags
          sessionStorage.removeItem('auth_pending_sync')
          sessionStorage.removeItem('auth_pending_verification')
          sessionStorage.removeItem('auth_email')

          // Clear local state
          set({
            session: null,
            user: null,
            isAuthenticated: false,
            isGuest: true,
            sessionLimits: getSessionLimits(null),
            showLoginModal: false,
            showUpgradeModal: false,
            upgradeContext: null,
            showCreditsModal: false,
            creditsContext: null
          })

          logger.info('🔐 User signed out successfully')

          // Double-check that we're actually logged out
          setTimeout(async () => {
            // Force one final auth check to ensure logout worked
            const finalCheck = await fetchApi('/api/auth/me', {
              method: 'GET',
              credentials: 'include'
            })

            if (finalCheck.ok) {
              const data = await finalCheck.json()
              if (data.isAuthenticated) {
                logger.warn('⚠️ User still appears authenticated after logout - forcing refresh')
              }
            }

            // Force a hard redirect to ensure complete state reset
            window.location.href = '/'
          }, 200) // Small delay to ensure cookie clearing completes
        } catch (error) {
          logger.error('🔐 Sign out error:', error)

          // Even on error, clear local state
          set({
            session: null,
            user: null,
            isAuthenticated: false,
            isGuest: true,
            sessionLimits: getSessionLimits(null),
            showLoginModal: false,
            showUpgradeModal: false,
            upgradeContext: null,
            showCreditsModal: false,
            creditsContext: null
          })

          // Force redirect even on error
          window.location.href = '/'
        }
      },

      // ✅ EXPERT FIX: Pause polling mechanism
      pausePolling: (ms = 2000) => {
        const { _pollAbort, _pollTimer } = get();
        try { _pollAbort?.abort(); } catch {}
        if (_pollTimer) clearTimeout(_pollTimer);
        const resumeAt = Date.now() + ms;
        set({ isPollingPausedUntil: resumeAt });
        console.debug('[Server Auth Store] Polling paused for', ms, 'ms');
      },

      // Legacy compatibility
      login: async (email: string, password: string) => {
        // Use server action for login
        const { signInWithPassword } = await import('@/lib/actions/auth-actions')
        const result = await signInWithPassword(email, password)

        if (result.success) {
          // Refresh auth state
          await get().checkAuth()
        }

        return result.success
      },

      logout: async () => {
        return get().signOut()
      },

      updateUsage: (updates) => {
        // Usage tracking would be handled server-side
        logger.info('📊 Usage update requested:', updates)
      },

      // Feature gates
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
          // Guest user - show login modal
          set({
            showLoginModal: true,
            upgradeContext: {
              action,
              message: `Sign in to ${action}`
            }
          })
        } else {
          // Authenticated user - show upgrade modal
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
    { name: 'server-auth-store' }
  )
)
