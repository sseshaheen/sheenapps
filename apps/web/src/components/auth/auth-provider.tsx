'use client'

import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { useAuthStore } from '@/store'; // Legacy store for compatibility
import { AuthStoreContext, createAuthStore, type ServerAuthSnapshot } from '@/store/auth-store-new';
import { isPublicAdvisorPath } from '@/utils/advisor-routes';
import { logger } from '@/utils/logger';
import React, { useEffect, useRef, useState } from 'react';
import { LoginModal } from './login-modal';
import { UpgradeModal } from './upgrade-modal';

interface AuthProviderProps {
  children: React.ReactNode
  initialSession?: any // Legacy prop for compatibility
  initialAuthSnapshot?: ServerAuthSnapshot // New synchronous bootstrap prop
}

export function AuthProvider({ children, initialSession, initialAuthSnapshot }: AuthProviderProps) {
  const store = useAuthStore() // Legacy store for compatibility
  const [isClientMounted, setIsClientMounted] = useState(false)
  const didInit = useRef(false)
  const newStoreRef = useRef<ReturnType<typeof createAuthStore> | null>(null)
  const seeded = useRef(false)

  // Debug auth provider initialization
  // eslint-disable-next-line no-restricted-globals
  if (process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true') {
    console.log('🏗️ AuthProvider mounted with:', {
      hasInitialAuthSnapshot: !!initialAuthSnapshot,
      authSnapshotStatus: initialAuthSnapshot?.status,
      authSnapshotHasUser: !!initialAuthSnapshot?.user,
      authSnapshotIsSettled: initialAuthSnapshot?.isSettled
    })
  }

  // EXPERT FIX: Only seed positive auth assertions (when we have a user)
  // If server snapshot says "missing", leave store initializing and let client decide
  if (!seeded.current && initialAuthSnapshot?.isSettled && initialAuthSnapshot.user) {
    // console.log('🌱 Seeding auth store with POSITIVE server snapshot (has user):', {
    //   status: initialAuthSnapshot.status,
    //   userEmail: initialAuthSnapshot.user.email
    // })

    // Create properly formatted user for client store
    const clientUser = {
      id: initialAuthSnapshot.user.id,
      email: initialAuthSnapshot.user.email,
      name: initialAuthSnapshot.user.user_metadata?.name || initialAuthSnapshot.user.email?.split('@')[0] || 'User',
      avatar: initialAuthSnapshot.user.user_metadata?.avatar_url || null,
      plan: initialAuthSnapshot.user.user_metadata?.plan || 'free'
    }

    const newState = {
      user: clientUser,
      isAuthenticated: true,
      isGuest: false,
      isLoading: false,
      isInitializing: false,
      sessionLimits: initialAuthSnapshot.sessionLimits
    }

    // console.log('🌱 Setting AUTHENTICATED auth store state:', newState)
    useAuthStore.setState(newState as any)
    seeded.current = true
  } else if (initialAuthSnapshot?.isSettled && !initialAuthSnapshot.user) {
    // DON'T seed negative state - let client auth initialization handle it
  } else if (!initialAuthSnapshot?.isSettled) {
    // DON'T seed unsettled state - let client auth initialization handle it
  }

  // EXPERT SYNCHRONOUS BOOTSTRAP SOLUTION: Create new auth store with server snapshot
  if (FEATURE_FLAGS.ENABLE_SYNCHRONOUS_AUTH_BOOTSTRAP && !newStoreRef.current && initialAuthSnapshot) {
    logger.info('🚀 Creating synchronous auth store with server snapshot', {
      status: initialAuthSnapshot.status,
      hasUser: !!initialAuthSnapshot.user,
      isSettled: initialAuthSnapshot.isSettled
    })
    newStoreRef.current = createAuthStore(initialAuthSnapshot)
  } else if (FEATURE_FLAGS.ENABLE_SYNCHRONOUS_AUTH_BOOTSTRAP && !newStoreRef.current) {
    logger.warn('⚠️ Synchronous auth bootstrap enabled but no initialAuthSnapshot provided')
  } else if (!FEATURE_FLAGS.ENABLE_SYNCHRONOUS_AUTH_BOOTSTRAP) {
    // console.log('ℹ️ Synchronous auth bootstrap disabled via feature flag')
  }

  // EXPERT SYNCHRONOUS BOOTSTRAP: Set up auto-settlement safety net
  useEffect(() => {
    if (initialAuthSnapshot) {
      // No async initialization needed - store is already created synchronously
      logger.info('🚀 Synchronous auth bootstrap complete', {
        status: initialAuthSnapshot.status,
        isSettled: initialAuthSnapshot.isSettled
      })

      // Safety net: timeout unknown → anonymous if needed
      const timer = setTimeout(() => {
        if (newStoreRef.current) {
          const currentState = newStoreRef.current.getState()
          if (currentState.status === 'unknown') {
            logger.warn('⚠️ Auto-settling unknown auth status to anonymous')
            newStoreRef.current.getState().setSnapshot({
              status: 'anonymous',
              isSettled: true,
              user: null
            })
          }
        }
      }, 2000)

      return () => clearTimeout(timer)
    }

    // Legacy compatibility: Handle old initialSession prop
    if (FEATURE_FLAGS.ENABLE_SERVER_AUTH && initialSession?.user && !didInit.current) {
      logger.info('🔧 Legacy server auth initialization from initialSession')
      const appUser = {
        ...initialSession.user,
        name: initialSession.user.user_metadata?.name || initialSession.user.email?.split('@')[0] || 'User',
        avatar: initialSession.user.user_metadata?.avatar_url || null,
        plan: initialSession.user.user_metadata?.plan || 'free'
      }

      useAuthStore.setState({
        isAuthenticated: true,
        user: appUser,
        session: initialSession,
        isInitializing: false,
        isLoggingIn: false,
        isLoading: false,
        isGuest: false,
        sessionLimits: {
          maxGenerations: -1,
          maxChatMessages: -1,
          canExport: true,
          canShare: true,
          maxProjects: -1,
          canSaveProjects: true
        }
      } as any)
      didInit.current = true
    } else if (FEATURE_FLAGS.ENABLE_SERVER_AUTH && !initialSession && !didInit.current) {
      logger.info('🔧 Legacy server auth initialization - no session')
      useAuthStore.setState({
        isAuthenticated: false,
        user: null,
        session: null,
        isInitializing: false,
        isLoggingIn: false,
        isLoading: false,
        isGuest: true
      } as any)
      didInit.current = true
    }
  }, [initialSession, initialAuthSnapshot])

  // Ensure client-side only rendering for modals
  useEffect(() => {
    setIsClientMounted(true)
  }, [])

  // Expert's clean auth initialization pattern
  useEffect(() => {
    if (!FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
      // Legacy path for other auth methods
      if (FEATURE_FLAGS.ENABLE_SUPABASE && 'initialize' in store) {
        logger.info('🔧 Using legacy Supabase auth initialization')
        const cleanup = (store as any).initialize()
        return () => { try { cleanup?.() } catch {} }
      } else if ('checkAuth' in store) {
        logger.info('🔧 Using mock auth')
        ;(store as any).checkAuth()
      }
      return
    }

    // EXPERT FIX: Force server check on mount and clear stale flags
    // Clear stale sessionStorage flags unless this is an actual login redirect
    const qp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const isLoginRedirect = qp.get('auth_success') === 'true'

    if (typeof window !== 'undefined' && !isLoginRedirect) {
      sessionStorage.removeItem('recent_auth_success')
      sessionStorage.removeItem('auth_success_timestamp')
      sessionStorage.removeItem('auth_pending_verification')
      sessionStorage.removeItem('auth_pending_sync')
    }

    // Check if we're on a public advisor route - skip auth initialization
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
    if (isPublicAdvisorPath(currentPath)) {
      logger.info('🎯 Skipping auth initialization on public advisor route', { path: currentPath })
      return
    }

    // Server auth: initialize() sets up first /api/auth/me and polling
    // EXPERT: Force auth check with no caching
    logger.info('🔧 Server auth enabled — running store.initialize() with forced check')
    // console.log('🔧 About to call store.initialize() - current auth state:', {
    //   isAuthenticated: useAuthStore.getState().isAuthenticated,
    //   hasUser: !!useAuthStore.getState().user,
    //   userEmail: useAuthStore.getState().user?.email,
    //   isLoading: useAuthStore.getState().isLoading,
    //   isInitializing: useAuthStore.getState().isInitializing,
    //   clearedFlags: !isLoginRedirect
    // })

    const cleanup = (useAuthStore.getState() as any).initialize()

    // EXPERT: Force immediate auth check regardless of current state
    if (typeof window !== 'undefined') {
      // console.log('🔄 Forcing immediate auth verification')
      setTimeout(() => {
        (useAuthStore.getState() as any).checkAuth({ force: true })
      }, 100)
    }

    // Clean up polling on unmount
    return () => {
      try { cleanup?.() } catch {}
    }
  }, [])

  // ✅ EXPERT FIX: Always mount the AuthStoreContext.Provider
  // Don't provide value if no store - let context use its default fallback store
  if (newStoreRef.current) {
    return (
      <AuthStoreContext.Provider value={newStoreRef.current}>
        {children}
        {isClientMounted && (
          <>
            <LoginModal />
            <UpgradeModal />
          </>
        )}
      </AuthStoreContext.Provider>
    )
  }

  // No new store - use default context (fallback store)
  return (
    <>
      {children}
      {isClientMounted && (
        <>
          <LoginModal />
          <UpgradeModal />
        </>
      )}
    </>
  )
}
