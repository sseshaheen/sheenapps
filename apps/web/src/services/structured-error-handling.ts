/**
 * Structured Error Handling Service
 * 
 * Handles the transition from legacy error messages to structured error responses
 * from the worker team's new error handling system.
 */

import type { StructuredError, CleanBuildEvent } from '@/types/build-events'
import { 
  getLocalizedErrorMessage,
  getLocalizedErrorTitle,
  getLocalizedRetryButton,
  getLocalizedCountdown,
  getBestLocaleMatch,
  type SupportedLocale
} from './error-translation'

// Error type configuration for UI behavior
export interface ErrorDisplayConfig {
  type: 'capacity' | 'network' | 'rate_limit' | 'auth' | 'provider' | 'general'
  icon: string
  title: string
  defaultMessage: string
  retryable: boolean
  showCountdown: boolean
  retryButtonText: string
  severity: 'low' | 'medium' | 'high'
}

// Retryable error codes - users can retry these automatically
const RETRYABLE_ERROR_CODES = [
  'AI_LIMIT_REACHED',
  'NETWORK_TIMEOUT', 
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL'
] as const

// Default retry delays for different error types (in milliseconds)
const DEFAULT_RETRY_DELAYS: Record<string, number> = {
  'AI_LIMIT_REACHED': 15 * 60 * 1000,  // 15 minutes
  'NETWORK_TIMEOUT': 30 * 1000,        // 30 seconds
  'RATE_LIMITED': 60 * 1000,           // 1 minute
  'PROVIDER_UNAVAILABLE': 2 * 60 * 1000, // 2 minutes
  'INTERNAL': 60 * 1000,               // 1 minute
  'AUTH_FAILED': 0,                    // No retry - redirect needed
} as const

// Error display configurations
const ERROR_DISPLAY_CONFIGS: Record<string, ErrorDisplayConfig> = {
  'AI_LIMIT_REACHED': {
    type: 'capacity',
    icon: 'clock',
    title: 'AI Service at Capacity',
    defaultMessage: 'High demand right now. We\'ll retry automatically when available.',
    retryable: true,
    showCountdown: true,
    retryButtonText: 'Retry Now',
    severity: 'medium'
  },
  'NETWORK_TIMEOUT': {
    type: 'network',
    icon: 'wifi-off',
    title: 'Connection Issue',
    defaultMessage: 'Please check your internet connection and try again.',
    retryable: true,
    showCountdown: false,
    retryButtonText: 'Retry Now',
    severity: 'medium'
  },
  'RATE_LIMITED': {
    type: 'rate_limit',
    icon: 'timer',
    title: 'Please Wait',
    defaultMessage: 'Too many requests. Please wait a moment before trying again.',
    retryable: true,
    showCountdown: false,
    retryButtonText: 'Try Again',
    severity: 'low'
  },
  'AUTH_FAILED': {
    type: 'auth',
    icon: 'shield-alert',
    title: 'Authentication Required',
    defaultMessage: 'Please sign in to continue.',
    retryable: false,
    showCountdown: false,
    retryButtonText: 'Sign In',
    severity: 'high'
  },
  'PROVIDER_UNAVAILABLE': {
    type: 'provider',
    icon: 'server-off',
    title: 'Service Temporarily Unavailable',
    defaultMessage: 'Our AI service is temporarily unavailable. We\'re working to restore it.',
    retryable: true,
    showCountdown: false,
    retryButtonText: 'Try Again',
    severity: 'high'
  },
  'INSUFFICIENT_BALANCE': {
    type: 'auth',
    icon: 'credit-card',
    title: 'Insufficient Balance',
    defaultMessage: 'Your account balance is insufficient. Please top up to continue.',
    retryable: false,
    showCountdown: false,
    retryButtonText: 'Top Up',
    severity: 'high'
  },
  'INTERNAL': {
    type: 'general',
    icon: 'alert-circle',
    title: 'Something Went Wrong',
    defaultMessage: 'An unexpected error occurred. Please try again.',
    retryable: true,
    showCountdown: false,
    retryButtonText: 'Try Again',
    severity: 'medium'
  }
} as const

export class StructuredErrorService {
  /**
   * Main entry point for handling build event errors
   */
  static handleBuildError(
    event: CleanBuildEvent,
    onRetry?: () => void
  ): ErrorDisplayConfig & { 
    message: string
    canRetry: boolean
    retryDelay: number 
  } {
    if (event.error) {
      return this.handleStructuredError(event.error, onRetry)
    }
    
    // Fallback to legacy error handling
    return this.handleLegacyError(event.error_message, onRetry)
  }

  /**
   * Localized version for handling build event errors
   * Use this when you have locale information available
   */
  static async handleBuildErrorLocalized(
    event: CleanBuildEvent,
    locale: string,
    onRetry?: () => void
  ): Promise<ErrorDisplayConfig & { 
    message: string
    title: string
    retryButtonText: string
    canRetry: boolean
    retryDelay: number
    countdownText?: string
  }> {
    const supportedLocale = getBestLocaleMatch(locale)
    
    if (event.error) {
      return this.handleStructuredErrorLocalized(event.error, supportedLocale, onRetry)
    }
    
    // Fallback to legacy error handling (English only)
    const baseConfig = this.handleLegacyError(event.error_message, onRetry)
    return {
      ...baseConfig,
      title: baseConfig.title,
      retryButtonText: baseConfig.retryButtonText
    }
  }

  /**
   * Handle new structured errors from worker team with localization
   */
  private static async handleStructuredErrorLocalized(
    error: StructuredError,
    locale: SupportedLocale,
    onRetry?: () => void
  ): Promise<ErrorDisplayConfig & { 
    message: string
    title: string
    retryButtonText: string
    canRetry: boolean
    retryDelay: number
    countdownText?: string
  }> {
    const config = ERROR_DISPLAY_CONFIGS[error.code] || ERROR_DISPLAY_CONFIGS['INTERNAL']
    const retryDelay = this.getRetryDelay(error)
    
    // Get localized strings
    const [message, title, retryButtonText, countdownText] = await Promise.all([
      getLocalizedErrorMessage(error, locale),
      getLocalizedErrorTitle(error, locale),
      getLocalizedRetryButton(error, locale),
      retryDelay > 0 ? getLocalizedCountdown(retryDelay, locale) : Promise.resolve(undefined)
    ])
    
    return {
      ...config,
      message,
      title,
      retryButtonText,
      canRetry: this.isRetryableError(error.code),
      retryDelay,
      countdownText
    }
  }

  /**
   * Handle new structured errors from worker team
   * Worker sends: { code: "AI_LIMIT_REACHED", params: { resetTime, retryAfter } }
   * Legacy field 'message' will be removed after transition period
   */
  private static handleStructuredError(
    error: StructuredError,
    onRetry?: () => void
  ): ErrorDisplayConfig & { 
    message: string
    canRetry: boolean
    retryDelay: number 
  } {
    const config = ERROR_DISPLAY_CONFIGS[error.code] || ERROR_DISPLAY_CONFIGS['INTERNAL']
    const retryDelay = this.getRetryDelay(error)
    
    // Use our error display config message, not the worker's
    // This ensures proper localization (worker only sends codes and params)
    return {
      ...config,
      message: config.defaultMessage, // Always use our localized message
      canRetry: this.isRetryableError(error.code),
      retryDelay
    }
  }

  /**
   * Handle legacy error messages during transition period
   */
  private static handleLegacyError(
    errorMessage?: string,
    onRetry?: () => void
  ): ErrorDisplayConfig & { 
    message: string
    canRetry: boolean
    retryDelay: number 
  } {
    const config = ERROR_DISPLAY_CONFIGS['INTERNAL']
    
    return {
      ...config,
      message: errorMessage || config.defaultMessage,
      canRetry: false, // Conservative approach for legacy errors
      retryDelay: 0
    }
  }

  /**
   * Check if an error can be retried automatically
   */
  static isRetryableError(event: CleanBuildEvent): boolean
  static isRetryableError(errorCode: string): boolean
  static isRetryableError(eventOrCode: CleanBuildEvent | string): boolean {
    if (typeof eventOrCode === 'string') {
      return RETRYABLE_ERROR_CODES.includes(eventOrCode as any)
    }
    
    const event = eventOrCode
    if (event.error?.code) {
      return RETRYABLE_ERROR_CODES.includes(event.error.code as any)
    }
    
    return false // Conservative for legacy errors
  }

  /**
   * Calculate retry delay based on error type and parameters
   */
  static getRetryDelay(event: CleanBuildEvent): number
  static getRetryDelay(error: StructuredError): number
  static getRetryDelay(eventOrError: CleanBuildEvent | StructuredError): number {
    let error: StructuredError | undefined

    // Better type checking - CleanBuildEvent has 'id' and 'build_id', StructuredError has 'code'
    if ('id' in eventOrError && 'build_id' in eventOrError) {
      // It's a CleanBuildEvent
      error = eventOrError.error
    } else if ('code' in eventOrError) {
      // It's a StructuredError
      error = eventOrError
    } else {
      // Fallback
      error = undefined
    }

    if (!error?.code) {
      return 60000 // 1 minute default
    }

    // Special handling for AI_LIMIT_REACHED with resetTime parameter
    if (error.code === 'AI_LIMIT_REACHED' && error.params?.resetTime) {
      const resetTime = typeof error.params.resetTime === 'number' 
        ? error.params.resetTime 
        : parseInt(error.params.resetTime)
      
      return Math.max(0, resetTime - Date.now())
    }

    return DEFAULT_RETRY_DELAYS[error.code] || 60000
  }

  /**
   * Get display configuration for an error
   */
  static getDisplayConfig(error: StructuredError): ErrorDisplayConfig {
    return ERROR_DISPLAY_CONFIGS[error.code] || ERROR_DISPLAY_CONFIGS['INTERNAL']
  }

  /**
   * Get a user-friendly error message
   */
  static getErrorMessage(event: CleanBuildEvent): string {
    // Prefer structured error message
    if (event.error?.message) {
      return event.error.message
    }
    
    // Fallback to legacy field
    return event.error_message || 'An error occurred'
  }

  /**
   * Extract error context for analytics/logging
   */
  static getErrorContext(event: CleanBuildEvent): {
    errorType: 'structured' | 'legacy'
    errorCode?: string
    retryable: boolean
    severity: 'low' | 'medium' | 'high'
  } {
    if (event.error) {
      const config = this.getDisplayConfig(event.error)
      return {
        errorType: 'structured',
        errorCode: event.error.code,
        retryable: this.isRetryableError(event.error.code),
        severity: config.severity
      }
    }

    return {
      errorType: 'legacy',
      retryable: false,
      severity: 'medium'
    }
  }

  /**
   * Format countdown timer text for capacity errors
   */
  static formatCountdownText(retryDelay: number): string {
    const minutes = Math.ceil(retryDelay / 60000)
    const seconds = Math.ceil((retryDelay % 60000) / 1000)

    if (minutes > 0) {
      return `Available in ${minutes} minute${minutes !== 1 ? 's' : ''}`
    } else if (seconds > 0) {
      return `Available in ${seconds} second${seconds !== 1 ? 's' : ''}`
    } else {
      return 'Available now'
    }
  }
}