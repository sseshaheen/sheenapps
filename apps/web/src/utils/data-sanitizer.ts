/**
 * Data Sanitization Utility for Production Logging
 * Prevents sensitive data exposure in logs and error reports
 */

interface SanitizeOptions {
  maxStringLength?: number
  maxObjectDepth?: number
  excludeFields?: string[]
  maskPatterns?: RegExp[]
}

const DEFAULT_EXCLUDE_FIELDS = [
  'password', 'token', 'key', 'secret', 'email', 'phone', 'address', 
  'creditCard', 'ssn', 'apiKey', 'accessToken', 'refreshToken',
  'userEmail', 'serviceKey', 'stripeKey', 'privateKey'
]

const DEFAULT_MASK_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN format
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card format
  /sk_live_[a-zA-Z0-9]+/g, // Stripe secret keys
  /pk_live_[a-zA-Z0-9]+/g, // Stripe publishable keys
  /whsec_[a-zA-Z0-9]+/g, // Stripe webhook secrets
]

/**
 * Sanitize data for safe logging in production
 */
export function sanitizeForLogs(data: any, options: SanitizeOptions = {}): any {
  const {
    maxStringLength = 500,
    maxObjectDepth = 3,
    excludeFields = DEFAULT_EXCLUDE_FIELDS,
    maskPatterns = DEFAULT_MASK_PATTERNS
  } = options

  return sanitizeRecursive(data, excludeFields, maskPatterns, maxStringLength, maxObjectDepth, 0)
}

function sanitizeRecursive(
  obj: any, 
  excludeFields: string[], 
  maskPatterns: RegExp[], 
  maxStringLength: number, 
  maxDepth: number, 
  currentDepth: number
): any {
  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    return '[MAX_DEPTH_REACHED]'
  }

  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // Apply masking patterns
      let masked = obj
      maskPatterns.forEach(pattern => {
        masked = masked.replace(pattern, '[MASKED]')
      })
      
      // Truncate long strings
      if (masked.length > maxStringLength) {
        masked = masked.slice(0, maxStringLength) + '...[TRUNCATED]'
      }
      
      return masked
    }
    return obj
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map(item => 
      sanitizeRecursive(item, excludeFields, maskPatterns, maxStringLength, maxDepth, currentDepth + 1)
    )
  }

  // Handle objects
  const sanitized: any = {}
  
  for (const [key, value] of Object.entries(obj)) {
    // Check if field should be excluded
    if (excludeFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    // Recursively sanitize
    sanitized[key] = sanitizeRecursive(value, excludeFields, maskPatterns, maxStringLength, maxDepth, currentDepth + 1)
  }

  return sanitized
}

/**
 * Anonymize user ID for logging (first 8 characters)
 */
export function anonymizeUserId(userId: string | undefined | null): string {
  if (!userId) return 'anonymous'
  return userId.slice(0, 8)
}

/**
 * Sanitize error for safe logging
 */
export function sanitizeError(error: any): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeForLogs(error.message),
      stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined
    }
  }
  
  return sanitizeForLogs(error)
}

/**
 * Create a production-safe logger that automatically sanitizes data
 */
export function createSecureLogger(logger: any) {
  return {
    info: (message: string, data?: any) => {
      logger.info(message, data ? sanitizeForLogs(data) : undefined)
    },
    warn: (message: string, data?: any) => {
      logger.warn(message, data ? sanitizeForLogs(data) : undefined)
    },
    error: (message: string, error?: any) => {
      logger.error(message, error ? sanitizeError(error) : undefined)
    },
    debug: (message: string, data?: any) => {
      logger.debug(message, data ? sanitizeForLogs(data) : undefined)
    }
  }
}

/**
 * Check if we're in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Enhanced logger with automatic sanitization in production
 */
export function secureLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
  if (isProduction()) {
    console[level](message, data ? sanitizeForLogs(data) : undefined)
  } else {
    console[level](message, data)
  }
}