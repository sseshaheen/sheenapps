/**
 * API Utilities - Helper functions for making API calls without locale prefix issues
 */

/**
 * Creates an absolute API URL to avoid locale prefix issues in internationalized apps
 * @param endpoint - The API endpoint (e.g., '/api/questions/first')
 * @returns Absolute URL string
 */
export function createApiUrl(endpoint: string): string {
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // EXPERT RECOMMENDATION: Always use absolute URLs to rule out routing issues
  if (typeof window !== 'undefined') {
    // CRITICAL FIX: Force HTTPS for API calls when cookies have Secure flag
    let origin = window.location.origin;

    // In development, ensure we use HTTPS to match cookie Secure flag
    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://')) {
      origin = origin.replace('http://', 'https://');
      console.log('🔒 Forcing HTTPS for API call to match Secure cookies');
    }

    const absoluteUrl = `${origin}${cleanEndpoint}`;
    console.log('🌍 Creating absolute API URL:', absoluteUrl);
    return absoluteUrl;
  }

  // Server-side fallback - return relative URL
  // The middleware will handle locale stripping for server-side requests
  return cleanEndpoint;
}

/**
 * EXPERT RECOMMENDATION: Simplified fetch wrapper using relative URLs
 * This avoids HTTP vs HTTPS confusion and lets the browser handle same-origin cookies
 * @param endpoint - The API endpoint
 * @param options - Fetch options
 * @returns Promise<Response>
 */
export async function fetchApi(endpoint: string, options?: RequestInit): Promise<Response> {
  // EXPERT APPROACH: Use relative URLs to avoid protocol mismatch
  const url = endpoint.startsWith('http')
    ? endpoint
    : endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  // console.log('🧪 fetchApi calling:', url);

  // Add timeout support
  const timeout = 30000; // 30 seconds default
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      credentials: 'include', // This alone sends cookies for same-origin
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      ...options
    });

    // console.log('🧪 fetchApi response:', {
    //   status: response.status,
    //   statusText: response.statusText,
    //   url: response.url
    // });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout / 1000} seconds`);
    }
    throw error;
  }
}

/**
 * Checks if a URL has a locale prefix
 * @param url - The URL to check
 * @returns boolean
 */
export function hasLocalePrefix(url: string): boolean {
  const localePattern = /^\/([a-z]{2}(-[a-z]{2})?)\//;
  return localePattern.test(url);
}

/**
 * Strips locale prefix from a URL if present
 * @param url - The URL to clean
 * @returns URL without locale prefix
 */
export function stripLocalePrefix(url: string): string {
  const localePattern = /^\/([a-z]{2}(-[a-z]{2})?)(\/.*)?$/;
  const match = url.match(localePattern);
  if (match) {
    return match[3] || '/';
  }
  return url;
}
