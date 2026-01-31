/**
 * API utility functions for consistent endpoint configuration
 */

/**
 * Get worker base URL from environment variables
 */
export function getWorkerBaseUrl(): string {
  // Check both server and client environment variables
  const workerUrl = 
    process.env.WORKER_BASE_URL || 
    process.env.NEXT_PUBLIC_WORKER_BASE_URL || 
    'http://localhost:8081'
  
  return workerUrl
}

/**
 * Get API base URL for the current environment
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use current origin
    return window.location.origin
  }
  
  // Server-side: use configured URL
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sheenapps.com'
}

/**
 * Get in-house API base URL (client-safe)
 */
export function getInhouseApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_INHOUSE_API_URL || 'https://api.sheenapps.com'
}

/**
 * Create fetch headers with common configuration
 */
export function createApiHeaders(additionalHeaders: Record<string, string> = {}): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...additionalHeaders
  }
}
