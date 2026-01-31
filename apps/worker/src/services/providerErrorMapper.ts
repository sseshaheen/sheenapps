import { UsageLimitService } from './usageLimitService';

/**
 * Structured internal error representation for internationalization
 * These codes are stable and should not change without versioning
 */
export type InternalError = {
  code: 'AI_LIMIT_REACHED' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED' | 'AUTH_FAILED' | 'NETWORK_TIMEOUT' | 'INTERNAL';
  params?: Record<string, any>;
};

/**
 * Provider-agnostic error mapper
 * Maps various AI provider errors to our internal taxonomy
 * 
 * @param error - Error from AI provider (string or Error object)
 * @returns Structured internal error with code and parameters
 */
export function mapProviderError(error: unknown): InternalError {
  const message = typeof error === 'string' ? error : (error as any)?.message ?? '';
  
  // Anthropic/Claude AI specific patterns
  if (UsageLimitService.isUsageLimitError(message)) {
    const resetTime = UsageLimitService.extractResetTime(message);
    return { 
      code: 'AI_LIMIT_REACHED', 
      params: resetTime ? { resetTime, provider: 'anthropic' } : { provider: 'anthropic' }
    };
  }
  
  // Generic patterns that work across providers
  if (/rate.*limit/i.test(message)) {
    return { code: 'RATE_LIMITED' };
  }
  
  if (/auth/i.test(message)) {
    return { code: 'AUTH_FAILED' };
  }
  
  if (/timeout|network/i.test(message)) {
    return { code: 'NETWORK_TIMEOUT' };
  }
  
  if (/unavailable|capacity/i.test(message)) {
    return { code: 'PROVIDER_UNAVAILABLE' };
  }
  
  // Default fallback for unknown errors
  return { code: 'INTERNAL' };
}

/**
 * Check if an error is recoverable (user can retry)
 * 
 * @param errorCode - Internal error code
 * @returns true if user should be encouraged to retry
 */
export function isRecoverableError(errorCode: InternalError['code']): boolean {
  return ['AI_LIMIT_REACHED', 'RATE_LIMITED', 'NETWORK_TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(errorCode);
}

/**
 * Get suggested retry delay in seconds for recoverable errors
 * 
 * @param errorCode - Internal error code  
 * @param params - Error parameters
 * @returns Suggested retry delay in seconds
 */
export function getSuggestedRetryDelay(errorCode: InternalError['code'], params?: Record<string, any>): number {
  switch (errorCode) {
    case 'AI_LIMIT_REACHED':
      if (params?.resetTime) {
        return Math.max(60, Math.ceil((params.resetTime - Date.now()) / 1000));
      }
      return 300; // 5 minutes default
    
    case 'RATE_LIMITED':
      return 60; // 1 minute
    
    case 'NETWORK_TIMEOUT':
      return 30; // 30 seconds
    
    case 'PROVIDER_UNAVAILABLE':
      return 120; // 2 minutes
    
    default:
      return 0; // Not retryable
  }
}