/**
 * Worker API Client v2.1
 * Handles communication with Worker service endpoints
 * Features: HMAC authentication, rate limiting, error handling, exponential backoff
 * 
 * SERVER-ONLY MODULE - Do not import in client components
 */

import 'server-only';
import { 
  WorkerAPIError, 
  InsufficientBalanceError, 
  PayloadTooLargeError, 
  RateLimitError,
  type WorkerRequestOptions 
} from '@/types/worker-api';
import { 
  generateWorkerSignature as generateWorkerSignatureV1,
  generateWorkerSignatureV2,
  parseRateLimitHeaders,
  validateWorkerAuthEnvironment 
} from '@/utils/worker-auth';
import crypto from 'crypto';
import { logger } from '@/utils/logger';
import { ROUTES } from '@/i18n/routes';
import { cookies, headers } from 'next/headers';

export class WorkerAPIClient {
  private readonly baseUrl: string;
  private static instance: WorkerAPIClient;

  constructor() {
    // SECURITY FIX: Only use server-side environment variables
    // Client-side code should use server actions instead
    if (typeof window !== 'undefined') {
      throw new Error('WorkerAPIClient cannot be instantiated in browser context. Use server actions instead.');
    }
    
    this.baseUrl = process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';
  }

  /**
   * Validate environment variables at runtime
   */
  private validateEnvironment(): void {
    const validation = validateWorkerAuthEnvironment();
    if (!validation.valid) {
      logger.error('❌ Worker API environment validation failed:', validation.errors);
      throw new Error(`Worker API configuration invalid: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WorkerAPIClient {
    if (!WorkerAPIClient.instance) {
      WorkerAPIClient.instance = new WorkerAPIClient();
    }
    return WorkerAPIClient.instance;
  }

  /**
   * Get current locale from request context
   * Returns base locale for worker compatibility (e.g., 'ar' instead of 'ar-eg')
   */
  private async getCurrentLocale(): Promise<string> {
    // In server context, try to get locale from various sources
    if (typeof window === 'undefined') {
      try {
        // Get locale from Next.js headers/cookies
        
        // Check cookie first (user preference) - await cookies() in Next.js 15
        const cookieStore = await cookies();
        const localeCookie = cookieStore.get('locale')?.value;
        if (localeCookie) {
          // Convert regional to base locale for worker
          return this.toBaseLocale(localeCookie);
        }
        
        // Check Accept-Language header - await headers() in Next.js 15
        const headerStore = await headers();
        const acceptLanguage = headerStore.get('accept-language');
        if (acceptLanguage) {
          // Parse and get first supported locale
          const locale = this.parseAcceptLanguage(acceptLanguage);
          if (locale) {
            return this.toBaseLocale(locale);
          }
        }
      } catch (error) {
        // Headers/cookies not available in this context
        logger.debug('api', 'Could not access headers/cookies for locale detection');
      }
    }
    
    // Default to English
    return 'en';
  }

  /**
   * Convert regional locale to base locale for worker
   * e.g., 'ar-eg' -> 'ar', 'fr-ma' -> 'fr'
   */
  private toBaseLocale(locale: string): string {
    const baseLocale = locale.split('-')[0].toLowerCase();
    // Worker supports: en, ar, fr, es, de
    const supportedBaseLocales = ['en', 'ar', 'fr', 'es', 'de'];
    return supportedBaseLocales.includes(baseLocale) ? baseLocale : 'en';
  }

  /**
   * Parse Accept-Language header to get first supported locale
   */
  private parseAcceptLanguage(header: string): string | null {
    const locales = header.split(',').map(lang => {
      const [locale] = lang.trim().split(';');
      return locale.toLowerCase();
    });
    
    for (const locale of locales) {
      const base = this.toBaseLocale(locale);
      if (base !== 'en' || locale.startsWith('en')) {
        return locale;
      }
    }
    
    return null;
  }

  /**
   * Make authenticated request to Worker API
   * @param pathWithQuery Full path including query parameters
   * @param options Request options (method, body, headers, etc.)
   */
  async request<T>(pathWithQuery: string, options: WorkerRequestOptions = {}): Promise<T> {
    // Validate environment on first use
    this.validateEnvironment();

    const body = options.body || '';
    const retryAttempt = options.__retryAttempt || 0;
    const method = options.method || 'GET';
    
    // Generate timestamp and nonce for authentication
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Generate BOTH v1 and v2 signatures during rollout phase
    // v1 format: timestamp + body (NO path!)
    const signatureV1 = generateWorkerSignatureV1(body.toString(), timestamp);
    
    // v2 format: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
    const signatureV2 = generateWorkerSignatureV2(
      method,
      pathWithQuery,
      timestamp,
      nonce,
      body.toString()
    );
    
    // Get current locale for worker
    const locale = await this.getCurrentLocale();

    const response = await fetch(`${this.baseUrl}${pathWithQuery}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-signature': signatureV1,
        'x-sheen-sig-v2': signatureV2,  // Plain hex string, not formatted
        'x-sheen-timestamp': timestamp.toString(),
        'x-sheen-nonce': nonce,
        'x-sheen-locale': locale, // Send locale to worker
        ...options.headers,
      },
    });

    // Handle rate limiting with exponential backoff
    if (response.status === 429) {
      const rateLimitInfo = parseRateLimitHeaders(response.headers);
      const retryAfter = rateLimitInfo.retryAfter || 
                        rateLimitInfo.resetAt ? 
                          Math.ceil((rateLimitInfo.resetAt.getTime() - Date.now()) / 1000) : 
                          60; // Default 60 seconds

      // Exponential backoff with jitter
      await this.exponentialBackoff(retryAfter, retryAttempt);
      
      // Retry with incremented attempt counter
      return this.request(pathWithQuery, { 
        ...options, 
        __retryAttempt: retryAttempt + 1 
      });
    }

    // Handle non-success responses
    if (!response.ok) {
      await this.handleError(response, pathWithQuery);
    }

    // Parse and return response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    
    // For non-JSON responses (like binary downloads)
    return response as unknown as T;
  }

  /**
   * Exponential backoff with jitter for rate limiting
   * @param baseSeconds Base delay in seconds
   * @param attempt Current attempt number (0-based)
   */
  private async exponentialBackoff(baseSeconds: number, attempt: number = 0): Promise<void> {
    const maxDelay = 300000; // 5 minutes maximum
    const jitter = Math.random() * 0.1; // 10% jitter
    
    const delay = Math.min(
      Math.pow(2, attempt) * baseSeconds * 1000 * (1 + jitter), 
      maxDelay
    );
    
    logger.info(`⏳ Rate limited. Retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Handle API errors with specific error types
   */
  private async handleError(response: Response, pathWithQuery: string): Promise<never> {
    const status = response.status;
    
    // Clone response so we can read it twice if needed for debugging
    const responseClone = response.clone();
    
    try {
      // Try to parse error response
      const errorData = await response.json();
      
      switch (status) {
        case 402: // Payment Required
          throw new InsufficientBalanceError(errorData);
          
        case 413: // Payload Too Large
          throw new PayloadTooLargeError(
            errorData.message || 'Project too large for processing (>2GB)'
          );
          
        case 429: // Rate Limited (shouldn't reach here due to retry logic)
          const rateLimitInfo = parseRateLimitHeaders(response.headers);
          throw new RateLimitError(
            rateLimitInfo.retryAfter || 60,
            errorData.message || 'Rate limit exceeded'
          );
          
        default:
          throw new WorkerAPIError(
            status,
            errorData.code,
            errorData.message || `HTTP ${status}`,
            errorData
          );
      }
    } catch (parseError) {
      // Handle cases where response body is empty or invalid JSON
      // This often happens with CDN-stripped 402 responses
      if (status === 402) {
        throw new InsufficientBalanceError({
          sufficient: false,
          estimate: null,
          balance: { total_seconds: 0, paid_seconds: 0, bonus_seconds: 0 },
          recommendation: {
            suggestedPackage: 'You can add more AI time credits from the billing page to continue building your project.',
            costToComplete: 0,
            purchaseUrl: ROUTES.BILLING // Server-safe: direct route constant
          }
        });
      }
      
      // For other errors, log the raw response and throw generic WorkerAPIError
      const responseText = await responseClone.text().catch(() => 'Could not read response text');
      logger.error(`Worker API error response parsing failed for ${pathWithQuery}:`, {
        status,
        parseError: parseError instanceof Error ? parseError.message : 'Unknown',
        responseText,
        path: pathWithQuery
      });
      
      throw new WorkerAPIError(
        status,
        undefined,
        `HTTP ${status}`,
        { path: pathWithQuery, parseError: parseError instanceof Error ? parseError.message : 'Unknown', responseText }
      );
    }
  }

  /**
   * GET request helper
   */
  async get<T>(pathWithQuery: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(pathWithQuery, {
      method: 'GET',
      headers
    });
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `nextjs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * POST request helper with automatic correlation ID
   */
  async post<T>(pathWithQuery: string, data?: any, headers?: Record<string, string>): Promise<T> {
    // Generate correlation ID for worker team debugging
    const correlationId = this.generateCorrelationId();
    
    // Enhanced logging for worker team correlation tracking
    logger.info(`[NextJS] Creating project (correlation: ${correlationId}):`, {
      correlationId,
      userId: data?.userId,
      timestamp: new Date().toISOString(),
      endpoint: pathWithQuery,
      hasProjectId: !!data?.projectId,
      projectId: data?.projectId || 'SERVER_GENERATED'
    });
    
    // Log request payload for worker team debugging
    logger.info(`[NextJS] Request payload (correlation: ${correlationId}):`, {
      correlationId,
      hasProjectId: !!data?.projectId,
      projectId: data?.projectId || 'SERVER_GENERATED',
      metadata: data?.metadata,
      promptLength: data?.prompt?.length || 0,
      hasTemplateFiles: !!(data?.templateFiles && Object.keys(data.templateFiles).length > 0)
    });

    // Add correlation ID to headers
    const enhancedHeaders = {
      ...headers,
      'x-correlation-id': correlationId
    };
    
    try {
      const result = await this.request<T>(pathWithQuery, {
        method: 'POST',
        body: data ? JSON.stringify(data) : '',
        headers: enhancedHeaders
      });
      
      // Log successful response for worker team correlation tracking
      logger.info(`[NextJS] Project creation response (correlation: ${correlationId}):`, {
        correlationId,
        success: !!(result as any)?.success,
        projectId: (result as any)?.projectId,
        buildId: (result as any)?.buildId,
        status: (result as any)?.status
      });
      
      return result;
    } catch (error) {
      // Log error response for worker team correlation tracking
      logger.error(`[NextJS] Project creation error (correlation: ${correlationId}):`, {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      });
      
      throw error;
    }
  }

  /**
   * POST request helper without correlation tracking (for non-project endpoints)
   */
  async postWithoutCorrelation<T>(pathWithQuery: string, data?: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(pathWithQuery, {
      method: 'POST',
      body: data ? JSON.stringify(data) : '',
      headers
    });
  }

  /**
   * PATCH request helper
   */
  async patch<T>(pathWithQuery: string, data?: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(pathWithQuery, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : '',
      headers
    });
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.get('/health');
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(): Promise<{
    limit?: number;
    remaining?: number;
    resetAt?: Date;
  }> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomBytes(16).toString('hex');
      const pathWithQuery = '/v1/rate-limit-status';
      const body = '';
      const method = 'HEAD';
      
      // Generate BOTH v1 and v2 signatures
      const signatureV1 = generateWorkerSignatureV1(body, timestamp);
      const signatureV2 = generateWorkerSignatureV2(method, pathWithQuery, timestamp, nonce, body);
      
      const response = await fetch(`${this.baseUrl}${pathWithQuery}`, {
        method: method,
        headers: {
          'x-sheen-signature': signatureV1,
          'x-sheen-sig-v2': signatureV2,  // Plain hex string
          'x-sheen-timestamp': timestamp.toString(),
          'x-sheen-nonce': nonce
        }
      });
      
      return parseRateLimitHeaders(response.headers);
    } catch (error) {
      logger.warn('Failed to get rate limit status:', error);
      return {};
    }
  }

  // ==========================================
  // Supabase OAuth Integration Methods
  // ==========================================

  /**
   * Exchange OAuth code for Supabase connection
   * Called from OAuth callback after successful authorization
   */
  async exchangeOAuthCode(data: {
    code: string;
    codeVerifier: string;
    userId: string;
    projectId: string;
    idempotencyKey?: string;
  }): Promise<{
    connectionId: string;
    needsProjectCreation: boolean;
    availableProjects: any[];
    readyProjects: any[];
  }> {
    logger.info('🔗 Exchanging OAuth code for Supabase connection', {
      userId: data.userId,
      projectId: data.projectId,
      hasCodeVerifier: !!data.codeVerifier,
      idempotencyKey: data.idempotencyKey
    });

    return this.postWithoutCorrelation('/v1/internal/supabase/oauth/exchange', data);
  }

  /**
   * Get Supabase connection status for a project
   */
  async getSupabaseConnectionStatus(userId: string, projectId: string): Promise<{
    connected: boolean;
    status: string;
    connectionId?: string;
    expiresAt?: string;
    isExpired: boolean;
  }> {
    const pathWithQuery = `/v1/internal/supabase/status?userId=${encodeURIComponent(userId)}&projectId=${encodeURIComponent(projectId)}`;
    return this.get(pathWithQuery);
  }

  /**
   * Discover available Supabase projects for a connection
   */
  async discoverSupabaseProjects(connectionId: string): Promise<{
    projects: Array<{
      id: string;
      ref: string;
      name: string;
      organization: string;
      status: string;
      canConnect: boolean;
      url: string;
    }>;
    needsProjectCreation: boolean;
    canCreateProjects: boolean;
    readyProjects: number;
  }> {
    const pathWithQuery = `/v1/internal/supabase/discovery?connectionId=${encodeURIComponent(connectionId)}`;
    return this.get(pathWithQuery);
  }

  /**
   * Get Supabase credentials for UI display (never includes service keys)
   */
  async getSupabaseCredentials(ref: string, userId: string, projectId: string): Promise<{
    url: string;
    publishableKey: string;
  }> {
    const pathWithQuery = `/v1/internal/supabase/credentials?ref=${encodeURIComponent(ref)}&userId=${encodeURIComponent(userId)}&projectId=${encodeURIComponent(projectId)}`;
    return this.get(pathWithQuery);
  }

  /**
   * Disconnect Supabase integration from a project
   */
  async disconnectSupabase(userId: string, projectId: string): Promise<{
    disconnected: boolean;
    message: string;
  }> {
    logger.info('🔌 Disconnecting Supabase integration', {
      userId,
      projectId
    });

    return this.request('/v1/internal/supabase/connection', {
      method: 'DELETE',
      body: JSON.stringify({ userId, projectId })
    });
  }
}

// Export function to get singleton instance (safe for browser)
export const getWorkerClient = (): WorkerAPIClient => {
  if (typeof window !== 'undefined') {
    throw new Error('WorkerAPIClient cannot be used in browser context. Use server actions instead.');
  }
  return WorkerAPIClient.getInstance();
};

// Legacy export for backwards compatibility (will throw in browser)
export const workerClient = typeof window === 'undefined' ? WorkerAPIClient.getInstance() : null as any;