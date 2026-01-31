/**
 * Error Translation Service for Structured Error Handling
 * 
 * Provides localized error messages for all supported locales
 * Integrates with our existing next-intl message system
 */

import type { StructuredError } from '@/types/build-events'
import { loadNamespace } from '@/i18n/message-loader'

// Supported locales
export const SUPPORTED_LOCALES = [
  'en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'fr-ma', 'es', 'de'
] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

interface ErrorTranslations {
  [errorCode: string]: string
}

interface ErrorTitles {
  [errorCode: string]: string  
}

interface ErrorButtons {
  [errorCode: string]: string
}

interface CountdownTranslations {
  availableIn: string
  availableNow: string
  minute: string
  minutes: string
  second: string
  seconds: string
}

export interface LocalizedErrorMessages {
  errors: ErrorTranslations
  titles: ErrorTitles  
  buttons: ErrorButtons
  countdown: CountdownTranslations
}

/**
 * Load error messages for a specific locale
 * This integrates with our namespace-based messages system
 */
export async function loadErrorMessages(locale: SupportedLocale): Promise<LocalizedErrorMessages> {
  const defaultCountdown: CountdownTranslations = {
    availableIn: "Available in {time}",
    availableNow: "Available now",
    minute: "minute",
    minutes: "minutes",
    second: "second",
    seconds: "seconds"
  }

  const errorsData = await loadNamespace(locale, 'errors')

  if (Object.keys(errorsData).length > 0) {
    return {
      errors: errorsData,
      titles: errorsData.titles || {},
      buttons: errorsData.retryButtons || {},
      countdown: errorsData.countdown || defaultCountdown
    }
  }

  // Fallback to English
  if (locale !== 'en') {
    return loadErrorMessages('en')
  }

  return {
    errors: {},
    titles: {},
    buttons: {},
    countdown: defaultCountdown
  }
}

/**
 * Get localized error message for a structured error
 */
export async function getLocalizedErrorMessage(
  error: StructuredError,
  locale: SupportedLocale = 'en'
): Promise<string> {
  const messages = await loadErrorMessages(locale)
  
  // Use worker-provided message if available
  if (error.message) {
    return error.message
  }
  
  // Otherwise use our localized messages
  const localizedMessage = messages.errors[error.code]
  if (localizedMessage) {
    return interpolateParams(localizedMessage, error.params || {})
  }
  
  // Fallback to a generic error message
  return messages.errors['INTERNAL_ERROR'] || 'An unexpected error occurred. Please try again.'
}

/**
 * Get localized error title for a structured error
 */
export async function getLocalizedErrorTitle(
  error: StructuredError,
  locale: SupportedLocale = 'en'
): Promise<string> {
  const messages = await loadErrorMessages(locale)
  return messages.titles[error.code] || messages.titles['INTERNAL'] || 'Error'
}

/**
 * Get localized retry button text for a structured error
 */
export async function getLocalizedRetryButton(
  error: StructuredError,
  locale: SupportedLocale = 'en'
): Promise<string> {
  const messages = await loadErrorMessages(locale)
  return messages.buttons[error.code] || messages.buttons['INTERNAL'] || 'Try Again'
}

/**
 * Get localized countdown text
 */
export async function getLocalizedCountdown(
  retryDelay: number,
  locale: SupportedLocale = 'en'
): Promise<string> {
  const messages = await loadErrorMessages(locale)
  
  if (retryDelay <= 0) {
    return messages.countdown.availableNow
  }
  
  const minutes = Math.ceil(retryDelay / 60000)
  const seconds = Math.ceil((retryDelay % 60000) / 1000)
  
  let timeText: string
  
  if (minutes > 0) {
    const minuteWord = minutes === 1 ? messages.countdown.minute : messages.countdown.minutes
    timeText = `${minutes} ${minuteWord}`
  } else {
    const secondWord = seconds === 1 ? messages.countdown.second : messages.countdown.seconds  
    timeText = `${seconds} ${secondWord}`
  }
  
  return interpolateParams(messages.countdown.availableIn, { time: timeText })
}

/**
 * Simple parameter interpolation for error messages
 * Supports {param} syntax like {minutes}, {resetTime}, etc.
 */
function interpolateParams(
  template: string, 
  params: Record<string, any>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (key in params) {
      // Special handling for time-based parameters
      if (key === 'minutes' && typeof params[key] === 'number') {
        return Math.ceil(params[key]).toString()
      }
      if (key === 'resetTime' && typeof params[key] === 'number') {
        const minutes = Math.ceil((params[key] - Date.now()) / 60000)
        return minutes.toString()
      }
      return String(params[key])
    }
    return match // Keep original placeholder if param not found
  })
}

/**
 * Check if a locale is RTL (right-to-left)
 */
export function isRTLLocale(locale: SupportedLocale): boolean {
  return locale.startsWith('ar')
}

/**
 * Get the best error translation key based on locale
 * For example, ar-sa might fall back to ar if specific translation doesn't exist
 */
export function getBestLocaleMatch(preferredLocale: string): SupportedLocale {
  // Exact match
  if (SUPPORTED_LOCALES.includes(preferredLocale as SupportedLocale)) {
    return preferredLocale as SupportedLocale
  }
  
  // Try base language (ar-sa -> ar)
  const baseLanguage = preferredLocale.split('-')[0]
  if (SUPPORTED_LOCALES.includes(baseLanguage as SupportedLocale)) {
    return baseLanguage as SupportedLocale
  }
  
  // Fall back to English
  return 'en'
}