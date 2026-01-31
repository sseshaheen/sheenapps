'use client'

/**
 * Admin Authentication Hook
 * Manages admin auth state and operations on the client side
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminSession } from '@/types/admin-auth'
import { adminRefreshManager } from '@/lib/admin/admin-refresh-manager'

interface UseAdminAuthReturn {
  session: AdminSession | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  canCreateAdmins: boolean
  canRevokeAdmins: boolean
  canViewAdminList: boolean
  isAuthenticated: boolean
  isSuperAdmin: boolean
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Load session from API
  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/auth/session')
      if (response.ok) {
        const data = await response.json()
        setSession(data.session)
        
        // Schedule token refresh
        if (data.session) {
          scheduleTokenRefresh(data.session)
        }
      } else {
        setSession(null)
      }
    } catch (err) {
      console.error('Failed to load admin session:', err)
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Declare refreshSession using the singleton manager
  const refreshSession = useCallback(async () => {
    try {
      const result = await adminRefreshManager.refreshToken()
      
      if (result.success && result.session) {
        setSession(result.session)
        
        // Schedule next refresh
        const now = new Date()
        const expiresAt = new Date(result.session.expiresAt)
        const timeUntilExpiry = expiresAt.getTime() - now.getTime()
        
        // Refresh 5 minutes before expiry
        const refreshTime = Math.max(0, timeUntilExpiry - (5 * 60 * 1000))
        
        if (refreshTime > 0) {
          adminRefreshManager.scheduleRefresh(refreshTime, () => {
            refreshSession()
          })
        }
      } else if (!result.success) {
        // Only redirect if we get an auth failure
        const response = await fetch('/api/admin/auth/session')
        if (response.status === 401 || response.status === 403) {
          setSession(null)
          router.push('/admin-login')
        }
      }
    } catch (err) {
      console.error('[Admin Auth] Error during refresh:', err)
    }
  }, [router])

  // Schedule automatic token refresh
  const scheduleTokenRefresh = useCallback((session: AdminSession) => {
    const now = new Date()
    const expiresAt = new Date(session.expiresAt)
    const timeUntilExpiry = expiresAt.getTime() - now.getTime()
    
    // Refresh when 5 minutes before expiry
    const refreshTime = Math.max(0, timeUntilExpiry - (5 * 60 * 1000))
    
    if (refreshTime > 0) {
      // Use the singleton manager to schedule
      adminRefreshManager.scheduleRefresh(refreshTime, () => {
        refreshSession()
      })
    } else {
      setTimeout(() => refreshSession(), 1000)
    }
  }, [refreshSession])

  // Login
  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Login failed')
      }

      const data = await response.json()
      
      // Reload session after successful login
      await loadSession()
      
      // Redirect to admin dashboard
      router.push('/admin')
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [router, loadSession])

  // Logout
  const logout = useCallback(async () => {
    setLoading(true)
    
    try {
      const response = await fetch('/api/admin/auth/logout', {
        method: 'POST',
        redirect: 'manual' // Prevent automatic redirect handling
      })
      
      // Clear refresh manager state
      adminRefreshManager.reset()
      
      setSession(null)
      
      // Always redirect to login, whether logout succeeded or not
      router.push('/admin-login')
    } catch (err) {
      console.error('Logout failed:', err)
      // Still redirect to login on error
      router.push('/admin-login')
    } finally {
      setLoading(false)
    }
  }, [router])

  // Load session on mount
  useEffect(() => {
    loadSession()
    
    // Cleanup on unmount
    return () => {
      // Managed by singleton now
    }
  }, [loadSession])

  // Computed properties
  const isAuthenticated = !!session
  const isSuperAdmin = session?.user.role === 'super_admin'
  const canCreateAdmins = isSuperAdmin
  const canRevokeAdmins = isSuperAdmin
  const canViewAdminList = session ? ['admin', 'super_admin'].includes(session.user.role) : false

  return {
    session,
    loading,
    error,
    login,
    logout,
    refreshSession,
    canCreateAdmins,
    canRevokeAdmins,
    canViewAdminList,
    isAuthenticated,
    isSuperAdmin,
  }
}