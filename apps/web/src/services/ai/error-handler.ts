import { AIResponse, StreamingAIResponse } from './types'
import { logger } from '@/utils/logger';

export enum AIErrorCode {
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PARSING_ERROR = 'PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface AIError {
  code: AIErrorCode
  message: string
  retryable: boolean
  retryAfter?: number // seconds
  fallbackRecommended: boolean
  context?: any
}

export class AIErrorHandler {
  private static retryAttempts = new Map<string, number>()
  private static maxRetries = 3
  private static backoffMultiplier = 2
  private static baseDelayMs = 1000

  static handleError(error: any, context?: any): AIError {
    // Detect error type and create structured error
    const aiError = this.classifyError(error, context)
    
    // Log error for monitoring
    this.logError(aiError, context)
    
    return aiError
  }

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    let lastError: any
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()
        
        // Clear retry count on success
        this.retryAttempts.delete(operationId)
        
        return result
      } catch (error) {
        lastError = error
        const aiError = this.handleError(error, { operationId, attempt })
        
        // Don't retry if error is not retryable or max attempts reached
        if (!aiError.retryable || attempt >= maxRetries) {
          break
        }
        
        // Calculate delay with exponential backoff
        const delay = this.calculateBackoffDelay(attempt, aiError.retryAfter)
        await this.delay(delay)
        
        logger.info(`Retrying operation ${operationId}, attempt ${attempt + 1}/${maxRetries}`);
      }
    }
    
    // All retries failed, throw the last error
    throw lastError
  }

  static async *executeStreamWithFallback<T>(
    primaryStream: () => AsyncGenerator<StreamingAIResponse>,
    fallbackStream: () => AsyncGenerator<StreamingAIResponse>,
    operationId: string
  ): AsyncGenerator<StreamingAIResponse> {
    try {
      const stream = primaryStream()
      let hasYielded = false
      
      for await (const chunk of stream) {
        hasYielded = true
        yield chunk
      }
      
      // If no chunks were yielded, try fallback
      if (!hasYielded) {
        yield* this.executeStreamWithFallback(fallbackStream, async function* () {
          yield { type: 'error', content: 'All services unavailable' }
        }, `${operationId}-fallback`)
      }
      
    } catch (error) {
      logger.warn(`Primary stream failed for ${operationId}, switching to fallback:`, error);
      
      // Emit error notification
      yield {
        type: 'error',
        content: 'Primary service unavailable, switching to backup...'
      }
      
      try {
        yield* fallbackStream()
      } catch (fallbackError) {
        logger.error(`Fallback stream also failed for ${operationId}:`, fallbackError);
        yield {
          type: 'error',
          content: 'Service temporarily unavailable. Please try again.'
        }
      }
    }
  }

  static createFallbackResponse<T>(
    error: AIError,
    fallbackData: T,
    operationId: string
  ): AIResponse<T> {
    return {
      success: false,
      data: fallbackData,
      metadata: {
        model: 'fallback',
        tokensUsed: 0,
        responseTime: 100,
        cost: 0
      },
      error: {
        code: error.code,
        message: `Using fallback data due to: ${error.message}`,
        retryable: false
      }
    }
  }

  static createGracefulDegradation<T>(
    partialData: Partial<T>,
    missingFields: string[],
    operationId: string
  ): AIResponse<T> {
    return {
      success: true,
      data: partialData as T,
      metadata: {
        model: 'degraded',
        tokensUsed: 0,
        responseTime: 100,
        cost: 0,
        confidence: 0.6
      },
      error: {
        code: AIErrorCode.INVALID_RESPONSE,
        message: `Partial response received. Missing: ${missingFields.join(', ')}`,
        retryable: true
      }
    }
  }

  private static classifyError(error: any, context?: any): AIError {
    // Check for specific error patterns
    if (error.message?.includes('rate limit') || error.status === 429) {
      return {
        code: AIErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded. Please wait before retrying.',
        retryable: true,
        retryAfter: this.extractRetryAfter(error),
        fallbackRecommended: true,
        context
      }
    }

    if (error.status >= 500 && error.status < 600) {
      return {
        code: AIErrorCode.SERVICE_UNAVAILABLE,
        message: 'AI service temporarily unavailable.',
        retryable: true,
        fallbackRecommended: true,
        context
      }
    }

    if (error.status === 401 || error.status === 403) {
      return {
        code: AIErrorCode.AUTHENTICATION_FAILED,
        message: 'Authentication failed. Please check API credentials.',
        retryable: false,
        fallbackRecommended: true,
        context
      }
    }

    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      return {
        code: AIErrorCode.TIMEOUT,
        message: 'Request timed out.',
        retryable: true,
        fallbackRecommended: false,
        context
      }
    }

    if (error.message?.includes('quota') || error.status === 402) {
      return {
        code: AIErrorCode.QUOTA_EXCEEDED,
        message: 'API quota exceeded.',
        retryable: false,
        fallbackRecommended: true,
        context
      }
    }

    if (error.message?.includes('JSON') || error.message?.includes('parse')) {
      return {
        code: AIErrorCode.PARSING_ERROR,
        message: 'Failed to parse AI response.',
        retryable: true,
        fallbackRecommended: false,
        context
      }
    }

    if (error.name === 'TypeError' || error.message?.includes('fetch')) {
      return {
        code: AIErrorCode.NETWORK_ERROR,
        message: 'Network connection failed.',
        retryable: true,
        fallbackRecommended: false,
        context
      }
    }

    // Default unknown error
    return {
      code: AIErrorCode.UNKNOWN_ERROR,
      message: error.message || 'An unexpected error occurred.',
      retryable: true,
      fallbackRecommended: true,
      context
    }
  }

  private static extractRetryAfter(error: any): number | undefined {
    // Try to extract Retry-After header value
    if (error.headers?.['retry-after']) {
      return parseInt(error.headers['retry-after'], 10)
    }
    
    // Look for rate limit reset time
    if (error.headers?.['x-ratelimit-reset']) {
      const resetTime = parseInt(error.headers['x-ratelimit-reset'], 10)
      const now = Math.floor(Date.now() / 1000)
      return Math.max(resetTime - now, 0)
    }
    
    return undefined
  }

  private static calculateBackoffDelay(attempt: number, retryAfter?: number): number {
    if (retryAfter) {
      return retryAfter * 1000 // Convert to milliseconds
    }
    
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelayMs * Math.pow(this.backoffMultiplier, attempt)
    const jitter = Math.random() * 0.1 * exponentialDelay // 10% jitter
    
    return Math.min(exponentialDelay + jitter, 30000) // Max 30 seconds
  }

  private static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private static logError(error: AIError, context?: any): void {
    const logData = {
      timestamp: new Date().toISOString(),
      error: error,
      context: context,
      retryAttempt: this.retryAttempts.get(context?.operationId || 'unknown') || 0
    }
    
    // In production, this would send to monitoring service
    logger.error('AI Service Error:', logData);
    
    // Track retry attempts
    if (context?.operationId && error.retryable) {
      const currentAttempts = this.retryAttempts.get(context.operationId) || 0
      this.retryAttempts.set(context.operationId, currentAttempts + 1)
    }
  }

  // Circuit breaker pattern for problematic services
  static createCircuitBreaker(
    serviceId: string,
    failureThreshold: number = 5,
    resetTimeoutMs: number = 60000
  ) {
    let failureCount = 0
    let lastFailureTime = 0
    let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

    return {
      async execute<T>(operation: () => Promise<T>): Promise<T> {
        // Check if circuit should be closed
        if (state === 'OPEN') {
          if (Date.now() - lastFailureTime > resetTimeoutMs) {
            state = 'HALF_OPEN'
          } else {
            throw new Error(`Circuit breaker OPEN for service ${serviceId}`)
          }
        }

        try {
          const result = await operation()
          
          // Success - reset circuit breaker
          if (state === 'HALF_OPEN') {
            state = 'CLOSED'
            failureCount = 0
          }
          
          return result
        } catch (error) {
          failureCount++
          lastFailureTime = Date.now()
          
          // Open circuit if threshold reached
          if (failureCount >= failureThreshold) {
            state = 'OPEN'
            logger.warn(`Circuit breaker OPEN for service ${serviceId} after ${failureCount} failures`);
          }
          
          throw error
        }
      },

      getState: () => ({ state, failureCount, lastFailureTime }),
      
      reset: () => {
        state = 'CLOSED'
        failureCount = 0
        lastFailureTime = 0
      }
    }
  }
}

// Service health monitor
export class ServiceHealthMonitor {
  private static healthStatus = new Map<string, {
    isHealthy: boolean
    lastCheck: number
    failureCount: number
    avgResponseTime: number
    lastError?: AIError
  }>()

  static async checkServiceHealth(serviceId: string, healthCheck: () => Promise<boolean>): Promise<boolean> {
    const startTime = Date.now()
    
    try {
      const isHealthy = await healthCheck()
      const responseTime = Date.now() - startTime
      
      this.updateHealthStatus(serviceId, {
        isHealthy,
        lastCheck: Date.now(),
        failureCount: isHealthy ? 0 : (this.getHealthStatus(serviceId)?.failureCount || 0) + 1,
        avgResponseTime: this.calculateAvgResponseTime(serviceId, responseTime),
        lastError: undefined
      })
      
      return isHealthy
    } catch (error) {
      const aiError = AIErrorHandler.handleError(error, { serviceId, healthCheck: true })
      
      this.updateHealthStatus(serviceId, {
        isHealthy: false,
        lastCheck: Date.now(),
        failureCount: (this.getHealthStatus(serviceId)?.failureCount || 0) + 1,
        avgResponseTime: this.getHealthStatus(serviceId)?.avgResponseTime || 0,
        lastError: aiError
      })
      
      return false
    }
  }

  static getServiceStatus(serviceId: string) {
    return this.healthStatus.get(serviceId)
  }

  static getAllServicesStatus() {
    return Object.fromEntries(this.healthStatus.entries())
  }

  static isServiceHealthy(serviceId: string): boolean {
    const status = this.healthStatus.get(serviceId)
    if (!status) return true // Assume healthy if never checked
    
    // Consider unhealthy if:
    // - Last check failed
    // - Haven't checked in 5 minutes
    // - Failure count > 3 in recent period
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    
    return status.isHealthy && 
           status.lastCheck > fiveMinutesAgo && 
           status.failureCount < 3
  }

  private static updateHealthStatus(serviceId: string, status: any) {
    this.healthStatus.set(serviceId, status)
  }

  private static getHealthStatus(serviceId: string) {
    return this.healthStatus.get(serviceId)
  }

  private static calculateAvgResponseTime(serviceId: string, newTime: number): number {
    const current = this.getHealthStatus(serviceId)
    if (!current) return newTime
    
    // Simple moving average
    return (current.avgResponseTime + newTime) / 2
  }
}

// User-friendly error messages
export class UserErrorMessageGenerator {
  static getErrorMessage(error: AIError, context?: any): string {
    const messages: Record<AIErrorCode, string> = {
      [AIErrorCode.RATE_LIMIT_EXCEEDED]: "We're receiving a lot of requests right now. Please wait a moment and try again.",
      [AIErrorCode.SERVICE_UNAVAILABLE]: "Our AI service is temporarily unavailable. We're using our backup system to help you.",
      [AIErrorCode.AUTHENTICATION_FAILED]: "There's an issue with our AI service authentication. Don't worry, we can still help you build your business!",
      [AIErrorCode.QUOTA_EXCEEDED]: "We've reached our AI usage limit for today. We're switching to our backup content generation.",
      [AIErrorCode.TIMEOUT]: "The AI service is taking longer than expected. Let's try a different approach.",
      [AIErrorCode.NETWORK_ERROR]: "Connection issue detected. Retrying with our backup service...",
      [AIErrorCode.PARSING_ERROR]: "We received an unexpected response. Don't worry, we'll handle this gracefully.",
      [AIErrorCode.INVALID_RESPONSE]: "We got a partial response from our AI service. We'll fill in the gaps for you.",
      [AIErrorCode.VALIDATION_ERROR]: "There was an issue with the generated content. We're refining it for you.",
      [AIErrorCode.UNKNOWN_ERROR]: "Something unexpected happened, but we'll keep working on your business!"
    }

    return messages[error.code] || "We encountered a small hiccup, but we're handling it smoothly."
  }

  static getSolutionMessage(error: AIError): string {
    const solutions: Record<AIErrorCode, string> = {
      [AIErrorCode.RATE_LIMIT_EXCEEDED]: "We'll retry automatically in a few moments.",
      [AIErrorCode.SERVICE_UNAVAILABLE]: "Using our backup AI service to continue building your business.",
      [AIErrorCode.AUTHENTICATION_FAILED]: "Switching to our offline content generation system.",
      [AIErrorCode.QUOTA_EXCEEDED]: "Using our curated templates and smart defaults instead.",
      [AIErrorCode.TIMEOUT]: "Trying a faster AI service for better performance.",
      [AIErrorCode.NETWORK_ERROR]: "Attempting to reconnect...",
      [AIErrorCode.PARSING_ERROR]: "Our smart processing will handle this automatically.",
      [AIErrorCode.INVALID_RESPONSE]: "We'll enhance the content with our built-in intelligence.",
      [AIErrorCode.VALIDATION_ERROR]: "Our quality system will ensure great results.",
      [AIErrorCode.UNKNOWN_ERROR]: "Our resilient system will find another way forward."
    }

    return solutions[error.code] || "Our system will adapt and continue."
  }

  static getProgressMessage(error: AIError, attempt: number): string {
    if (attempt === 0) {
      return "Starting your business generation..."
    }
    
    if (error.retryable && attempt < 3) {
      return `Optimizing approach (attempt ${attempt + 1})...`
    }
    
    if (error.fallbackRecommended) {
      return "Switching to our reliable backup system..."
    }
    
    return "Ensuring the best possible results for you..."
  }
}