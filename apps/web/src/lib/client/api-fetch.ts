/**
 * Centralized fetch utility for client-side API calls
 * Features: Automatic timeout, error handling, credentials, retry logic, and auto locale headers
 *
 * CLIENT-ONLY MODULE - Use in client components and hooks
 */

'use client';

import { logger } from '@/utils/logger';
import { toBaseLocale } from '@/lib/i18n/universal-locale';

export interface ApiFetchOptions extends Omit<RequestInit, 'signal'> {
  timeout?: number; // Timeout in milliseconds (default: 10000)
  retries?: number; // Number of retries (default: 2)
  retryDelay?: number; // Base delay between retries in ms (default: 1000)
  skipLocaleHeader?: boolean; // Skip automatic x-sheen-locale header (default: false)
}

export class ApiFetchError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiFetchError';
  }
}

/**
 * Get current locale from client context (DOM or cookies)
 * Priority: document.documentElement.lang > locale cookie > 'en'
 */
function getCurrentClientLocale(): string {
  if (typeof window === 'undefined') {
    return 'en'; // Fallback for SSR
  }

  // Primary: Next-intl sets the HTML lang attribute
  if (document.documentElement.lang) {
    return document.documentElement.lang;
  }

  // Fallback: Check locale cookie (set by middleware)
  const localeCookie = document.cookie.match(/locale=([^;]+)/);
  if (localeCookie) {
    return localeCookie[1];
  }

  // Final fallback
  return 'en';
}

/**
 * Centralized fetch utility with timeout and error handling
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options with additional timeout and retry configuration
 * @returns Parsed JSON response
 * @throws ApiFetchError on network errors or non-OK responses
 */
export async function apiFetch<T = any>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const {
    timeout = 10000,
    retries = 2,
    retryDelay = 1000,
    skipLocaleHeader = false,
    ...fetchOptions
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Prepare headers with automatic locale detection
        const baseHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Auto-include locale header unless explicitly skipped
        if (!skipLocaleHeader) {
          const currentLocale = getCurrentClientLocale();
          const baseLocale = toBaseLocale(currentLocale);
          baseHeaders['x-sheen-locale'] = baseLocale;
        }

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
          credentials: fetchOptions.credentials || 'include', // Include cookies by default
          headers: {
            ...baseHeaders,
            ...fetchOptions.headers, // Allow override of default headers
          },
        });

        clearTimeout(timeoutId);

        // Debug: Log locale mismatches for debugging
        if (!skipLocaleHeader) {
          const responseLocale = response.headers.get('Content-Language');
          const sentLocale = baseHeaders['x-sheen-locale'];
          if (responseLocale && responseLocale !== sentLocale && responseLocale !== getCurrentClientLocale()) {
            logger.debug('api-fetch', 'Locale mismatch detected', {
              sent: sentLocale,
              received: responseLocale,
              current: getCurrentClientLocale(),
              url: url.split('?')[0] // Log URL without query params
            });
          }
        }

        // Handle non-OK responses
        if (!response.ok) {
          let errorData: any;
          try {
            errorData = await response.json();
          } catch {
            errorData = await response.text();
          }

          // Special handling for auth errors
          if (response.status === 401) {
            throw new ApiFetchError('Unauthorized - please log in', 401, errorData);
          }

          // Special handling for insufficient balance
          if (response.status === 402) {
            throw new ApiFetchError(
              errorData.error || 'Insufficient balance',
              402,
              errorData
            );
          }

          throw new ApiFetchError(
            errorData.error || `HTTP ${response.status}`,
            response.status,
            errorData
          );
        }

        // Parse and return JSON response
        const data = await response.json();
        return data as T;

      } catch (error) {
        clearTimeout(timeoutId);
        
        // Handle abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ApiFetchError(`Request timeout after ${timeout}ms`);
        }
        
        throw error;
      }

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      if (error instanceof ApiFetchError) {
        // Don't retry these status codes
        if ([401, 402, 404, 409].includes(error.status || 0)) {
          throw error; // Don't retry auth/payment/not-found/conflict errors
        }
      }

      // If we have retries left, wait and try again
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        logger.warn(`API fetch failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`, {
          url,
          error: lastError.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  logger.error('API fetch failed after all retries', {
    url,
    error: lastError?.message
  });
  
  throw lastError || new ApiFetchError('Unknown error');
}

/**
 * Convenience method for GET requests
 */
export function apiGet<T = any>(url: string, options?: Omit<ApiFetchOptions, 'method' | 'body'>) {
  return apiFetch<T>(url, { ...options, method: 'GET' });
}

/**
 * Convenience method for POST requests
 */
export function apiPost<T = any>(url: string, body?: any, options?: Omit<ApiFetchOptions, 'method' | 'body'>) {
  return apiFetch<T>(url, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience method for PUT requests
 */
export function apiPut<T = any>(url: string, body?: any, options?: Omit<ApiFetchOptions, 'method' | 'body'>) {
  return apiFetch<T>(url, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience method for DELETE requests
 */
export function apiDelete<T = any>(url: string, options?: Omit<ApiFetchOptions, 'method'>) {
  return apiFetch<T>(url, { ...options, method: 'DELETE' });
}

/**
 * Hook helper to create a fetcher for React Query
 */
export function createQueryFetcher<T = any>(
  urlFn: (...args: any[]) => string,
  options?: ApiFetchOptions
) {
  return async (...args: any[]): Promise<T> => {
    const url = urlFn(...args);
    return apiFetch<T>(url, options);
  };
}