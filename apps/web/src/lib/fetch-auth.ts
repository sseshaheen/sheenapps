/**
 * Auth-aware fetch utilities
 * Minimal implementation for handling authenticated API calls
 */

import { useAuthStore } from '@/store'
import { fetchApi } from './api-utils'

export class AuthError extends Error {
  constructor(public code: 'AUTH_REQUIRED' | 'AUTH_EXPIRED' | 'PERMISSION_DENIED', message?: string) {
    super(message || code)
    this.name = 'AuthError'
  }
}

/**
 * Fetch JSON with auth validation and error handling
 * Throws AuthError for auth issues, regular Error for other HTTP errors
 */
export async function fetchAuthJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetchApi(url, options)
  
  // Handle auth-specific status codes
  if (response.status === 401) {
    throw new AuthError('AUTH_REQUIRED', 'Authentication required')
  }
  if (response.status === 403) {
    throw new AuthError('PERMISSION_DENIED', 'Access denied')
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Hook for resilient API calls with auth refresh retry
 * One retry with auth refresh, then fail
 */
export function useAuthAPI<T>(url: string) {
  const { checkAuth: refreshAuth } = useAuthStore()

  const fetchWithRetry = async (retryCount = 0): Promise<T> => {
    try {
      return await fetchAuthJSON<T>(url)
    } catch (error) {
      if (error instanceof AuthError && error.code === 'AUTH_EXPIRED' && retryCount === 0) {
        // Try refreshing auth once
        await refreshAuth()
        return fetchWithRetry(1)
      }
      throw error
    }
  }

  return { fetch: fetchWithRetry }
}