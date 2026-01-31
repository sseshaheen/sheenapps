// Enhanced message formatter with IntlMessageFormat integration and OpenTelemetry metrics
import { IntlMessageFormat } from 'intl-messageformat'

import { validateLocalePath, I18N_DIR } from './localeUtils'
import { metrics as otelMetrics } from '@opentelemetry/api'
import fs from 'fs'

// Create OpenTelemetry meter for i18n metrics
const meter = otelMetrics.getMeter('sheenapps-i18n', '1.0.0')

// OpenTelemetry metrics for i18n monitoring
const i18nMissingKeysTotal = meter.createCounter('i18n_missing_keys_total', {
  description: 'Total number of missing i18n translation keys',
})

const i18nFormattingErrorsTotal = meter.createCounter('i18n_formatting_errors_total', {
  description: 'Total number of i18n formatting errors',
})

const i18nMessagesLoadedTotal = meter.createCounter('i18n_messages_loaded_total', {
  description: 'Total number of i18n messages loaded per locale',
})

// Compiled IntlMessageFormat instances cache (loaded at startup)
const compiledMessages = new Map<string, Map<string, IntlMessageFormat | string>>()

// Security: Only allow known namespaces
const ALLOWED_NAMESPACES = ['errors', 'events'] as const

// **EXPERT ENHANCEMENT**: i18n Observability metrics
let messageLoadStats = {
  localesLoaded: 0,
  totalMessages: 0,
  memoryEstimate: 0,
  lastReloadTime: Date.now()
}

// **EXPERT ENHANCEMENT**: Track missing keys for monitoring
const missingKeyTracker = new Map<string, number>()

export function trackMissingKey(locale: string, code: string) {
  const key = `${locale}:${code}`
  const count = (missingKeyTracker.get(key) || 0) + 1
  missingKeyTracker.set(key, count)

  // Emit OpenTelemetry metric for missing keys
  i18nMissingKeysTotal.add(1, {
    locale,
    code,
    namespace: code.split('.')[0] || 'unknown'
  })

  console.warn(`⚠️  Missing i18n key: ${code} for locale ${locale} (count: ${count})`)
}

// **EXPERT ENHANCEMENT**: Log stats periodically
setInterval(() => {
  if (messageLoadStats.localesLoaded > 0) {
    console.log('📊 i18n Stats:', messageLoadStats)
  }
}, 10 * 60 * 1000) // Every 10 minutes

// Enhanced formatter with IntlMessageFormat integration
function createEnhancedFormatter(locale: string) {
  const localeMessages = compiledMessages.get(locale)

  return (code: string, params?: any) => {
    try {
      // Try to get compiled IntlMessageFormat instance
      const messageFormat = localeMessages?.get(code)

      if (messageFormat instanceof IntlMessageFormat) {
        // Use IntlMessageFormat for proper ICU message formatting
        return messageFormat.format(params || {})
      } else if (typeof messageFormat === 'string') {
        // Simple template string - basic parameter substitution
        if (params && typeof messageFormat === 'string') {
          return Object.keys(params).reduce((msg, key) => {
            return msg.replace(new RegExp(`{${key}}`, 'g'), params[key]?.toString() || '')
          }, messageFormat)
        }
        return messageFormat
      }

      // Track missing key
      trackMissingKey(locale, code)

      // Legacy error handling for backward compatibility
      if (code.startsWith('errors.')) {
        if (code === 'errors.AI_LIMIT_REACHED' && params?.resetTime && params?.retryAfter) {
          return `AI_LIMIT_REACHED|${params.resetTime}|${params.retryAfter}|${params.provider || 'unknown'}`
        }

        if (code === 'errors.INSUFFICIENT_BALANCE' && params?.requiredBalance && params?.currentBalance) {
          return `INSUFFICIENT_BALANCE|${params.requiredBalance}|${params.currentBalance}|${params.recommendation || 'purchase'}`
        }

        // Fallback to existing error renderer
        try {
          const { ErrorMessageRenderer } = require('../services/errorMessageRenderer')
          const errorCode = code.replace('errors.', '') as any
          return ErrorMessageRenderer.renderErrorForUser(errorCode, params, locale)
        } catch (error) {
          console.error(`[i18n] Error renderer fallback failed for ${code}:`, error)
        }
      }

      return code // Return key as ultimate fallback

    } catch (error) {
      // Track formatting errors
      i18nFormattingErrorsTotal.add(1, {
        locale,
        code,
        error_type: error instanceof Error ? error.constructor.name : 'unknown'
      })

      console.error(`[i18n] Formatting error for ${code} (${locale}):`, error)
      return code // Return key on formatting error
    }
  }
}

export function loadCompiledMessages(locale: string) {
  if (compiledMessages.has(locale)) return
  
  try {
    const localeMessages = new Map<string, any>()
    
    // Load only allowed namespaces with enhanced security
    for (const namespace of ALLOWED_NAMESPACES) {
      // **EXPERT ENHANCEMENT**: Use security-validated path
      const filePath = validateLocalePath(locale, namespace)
      if (!filePath) {
        continue // Skip if path validation failed
      }
      
      if (fs.existsSync(filePath)) {
        const messages = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        
        Object.entries(messages).forEach(([key, template]) => {
          const messageKey = `${namespace}.${key}`

          try {
            // Create IntlMessageFormat instance for ICU message syntax support
            if (typeof template === 'string' && (template.includes('{') || template.includes('}'))) {
              // ICU message format - create IntlMessageFormat instance
              const messageFormat = new IntlMessageFormat(template, locale)
              localeMessages.set(messageKey, messageFormat)
            } else {
              // Simple string template - store as string for basic substitution
              localeMessages.set(messageKey, template as string)
            }
          } catch (formatError) {
            // If IntlMessageFormat creation fails, store as string
            console.warn(`[i18n] Failed to compile message ${messageKey} for ${locale}:`, formatError)
            localeMessages.set(messageKey, template as string)

            // Track compilation errors
            i18nFormattingErrorsTotal.add(1, {
              locale,
              code: messageKey,
              error_type: 'compilation_error'
            })
          }
        })
      }
    }
    
    compiledMessages.set(locale, localeMessages)
    
    // **EXPERT ENHANCEMENT**: Update observability stats
    messageLoadStats.localesLoaded++
    messageLoadStats.totalMessages += localeMessages.size
    messageLoadStats.lastReloadTime = Date.now()

    // Emit OpenTelemetry metric for loaded messages
    i18nMessagesLoadedTotal.add(localeMessages.size, {
      locale,
      mode: 'enhanced'
    })

    console.log(`✅ Loaded ${localeMessages.size} messages for ${locale} (enhanced mode with IntlMessageFormat)`)
    
  } catch (error) {
    console.error(`❌ Failed to load messages for ${locale}:`, error)
    
    // Fallback to English
    if (locale !== 'en') {
      console.warn(`⚠️  Falling back to English for locale ${locale}`)
      loadCompiledMessages('en')
      compiledMessages.set(locale, compiledMessages.get('en')!)
    } else {
      // Ultimate fallback: basic message map
      console.warn('⚠️  Using basic message templates as final fallback')
      const fallbackMessages = new Map<string, any>()
      
      fallbackMessages.set('errors.AI_LIMIT_REACHED', 'AI_LIMIT_REACHED')
      fallbackMessages.set('errors.INTERNAL_ERROR', 'INTERNAL_ERROR')
      fallbackMessages.set('errors.INSUFFICIENT_BALANCE', 'INSUFFICIENT_BALANCE')
      
      compiledMessages.set('en', fallbackMessages)
    }
  }
}

export function createFormatter(locale: string) {
  loadCompiledMessages(locale)

  // Return enhanced formatter with IntlMessageFormat support
  return createEnhancedFormatter(locale)
}

// Initialize base locales at startup
const BASE_LOCALES = ['en', 'ar', 'fr', 'es', 'de']
BASE_LOCALES.forEach(loadCompiledMessages)

// **EXPERT ENHANCEMENT**: Export stats for health endpoint
export function getI18nStats() {
  return {
    ...messageLoadStats,
    loadedLocales: Array.from(compiledMessages.keys()),
    namespaces: ALLOWED_NAMESPACES,
    missingKeys: Array.from(missingKeyTracker.entries()),
    mode: 'enhanced' // IntlMessageFormat integration active
  }
}

console.log('📝 i18n MessageFormatter initialized in enhanced mode with IntlMessageFormat support and OpenTelemetry metrics')