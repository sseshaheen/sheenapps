/**
 * API Client with 402 Balance Error and 401 Auth Error Handling
 * Single wrapper for all fetch calls that need balance and auth error handling
 */

import { InsufficientBalanceError } from '@/types/worker-api'
import { logger } from '@/utils/logger'

// Custom error for auth failures that should never be retried
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * Fetch wrapper that automatically handles 401, 403, and 402 errors
 * Converts them to specific error types for consistent handling
 */
export async function fetchWithErrorHandling(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const response = await fetch(url, options)
    
    // Handle auth errors - never retry these
    if (response.status === 401 || response.status === 403) {
      const message = response.status === 401 
        ? 'Authentication expired. Please log in again.'
        : 'Access denied. You do not have permission to perform this action.'
      
      throw new AuthenticationError(message)
    }
    
    // Handle 402 Payment Required specifically
    if (response.status === 402) {
      const payload = await response.json().catch(() => ({}))
      
      // 402 is expected business logic, not an error - no logging needed
      throw new InsufficientBalanceError({
        sufficient: false,
        estimate: null,
        balance: payload.balance || { welcomeBonus: 0, dailyGift: 0, paid: 0, total: 0 },
        recommendation: payload.recommendation
      })
    }
    
    return response
  } catch (error) {
    // Re-throw AuthenticationError as-is
    if (error instanceof AuthenticationError) {
      throw error
    }
    
    // Re-throw InsufficientBalanceError as-is
    if (error instanceof InsufficientBalanceError) {
      throw error
    }
    
    // Log other fetch errors
    logger.error('🌐 Fetch error', {
      url,
      method: options.method || 'GET',
      error: error instanceof Error ? error.message : String(error)
    })
    
    throw error
  }
}

/**
 * @deprecated Use fetchWithErrorHandling instead
 * Fetch wrapper that automatically handles 402 Payment Required errors
 * and converts them to InsufficientBalanceError for consistent handling
 */
export async function fetchWithBalanceHandling(url: string, options: RequestInit = {}): Promise<Response> {
  return fetchWithErrorHandling(url, options)
}

/**
 * Convenience wrapper for JSON APIs with error handling
 */
export async function fetchJSONWithErrorHandling<T = any>(
  url: string, 
  options: RequestInit = {}
): Promise<T> {
  const response = await fetchWithErrorHandling(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }
  
  return response.json()
}

/**
 * @deprecated Use fetchJSONWithErrorHandling instead
 * Convenience wrapper for JSON APIs with balance handling
 */
export async function fetchJSONWithBalanceHandling<T = any>(
  url: string, 
  options: RequestInit = {}
): Promise<T> {
  return fetchJSONWithErrorHandling<T>(url, options)
}

/**
 * Helper for POST requests with error handling
 */
export async function postWithErrorHandling<T = any>(
  url: string,
  data: any,
  options: RequestInit = {}
): Promise<T> {
  return fetchJSONWithErrorHandling<T>(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * @deprecated Use postWithErrorHandling instead
 * Helper for POST requests with balance handling
 */
export async function postWithBalanceHandling<T = any>(
  url: string,
  data: any,
  options: RequestInit = {}
): Promise<T> {
  return postWithErrorHandling<T>(url, data, options)
}

/**
 * Check if an error is an authentication error that should never be retried
 */
export function isAuthError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError
}

/**
 * Check if an error is a balance-related error
 */
export function isBalanceError(error: unknown): error is InsufficientBalanceError {
  return error instanceof InsufficientBalanceError
}