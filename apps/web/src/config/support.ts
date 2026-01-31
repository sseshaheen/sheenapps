/**
 * Locale-specific support configuration
 *
 * WhatsApp support is region-specific because:
 * - Showing +966 to Egyptians = "this isn't for me" distrust
 * - Each region has different support hours (timezone-aware)
 * - Pre-filled messages should match the dialect
 */

export interface SupportConfig {
  whatsappNumber: string
  prefillMessage: string
  hours: string
  timezone: string
  displayNumber: string
}

export const supportConfig: Record<string, SupportConfig> = {
  'ar-eg': {
    whatsappNumber: '+201273357980', // TODO: Replace with actual Egyptian number
    prefillMessage: 'محتاج مساعدة في شين ابس',
    hours: 'متاحين من ٩ص - ٩م بتوقيت القاهرة',
    timezone: 'Africa/Cairo',
    displayNumber: '+2 012 733 579 80'
  },
  'ar-sa': {
    whatsappNumber: '+201273357980', // TODO: Replace with actual Saudi number
    prefillMessage: 'أحتاج مساعدة في شين ابس',
    hours: 'متاحين من ٩ص - ٩م بتوقيت السعودية',
    timezone: 'Asia/Riyadh',
    displayNumber: '+2 012 733 579 80'
  },
  'ar-ae': {
    whatsappNumber: '+201273357980', // TODO: Replace with actual UAE number
    prefillMessage: 'أحتاج مساعدة في شين ابس',
    hours: 'متاحين من ٩ص - ٩م بتوقيت الإمارات',
    timezone: 'Asia/Dubai',
    displayNumber: '+2 012 733 579 80'
  },
  'ar': {
    // Default Arabic - uses Saudi as fallback
    whatsappNumber: '+201273357980', // TODO: Replace with actual number
    prefillMessage: 'أحتاج مساعدة',
    hours: 'متاحين من ٩ص - ٩م',
    timezone: 'Asia/Riyadh',
    displayNumber: '+2 012 733 579 80'
  }
}

/**
 * Get support config for a locale
 * Falls back to 'ar' for unknown Arabic locales
 */
export function getSupportConfig(locale: string): SupportConfig | null {
  // Only show WhatsApp for Arabic locales
  if (!locale.startsWith('ar')) {
    return null
  }

  return supportConfig[locale] || supportConfig['ar']
}

/**
 * Build WhatsApp link with optional source tracking
 *
 * Note: wa.me ignores URL params like &source=, so we embed tracking
 * in the message body where it actually survives.
 *
 * @param locale - The user's locale
 * @param source - Where in the app the user clicked (for tracking support request origins)
 */
export function buildWhatsAppLink(locale: string, source?: string): string | null {
  const config = getSupportConfig(locale)
  if (!config) return null

  const number = config.whatsappNumber.replace('+', '')

  // Embed source in message body since wa.me ignores URL params
  const messageWithSource = source
    ? `${config.prefillMessage}\n\n[ref:${source}]`
    : config.prefillMessage

  const message = encodeURIComponent(messageWithSource)

  return `https://wa.me/${number}?text=${message}`
}

/**
 * Common source identifiers for WhatsApp support tracking
 */
export const SUPPORT_SOURCES = {
  BUILDER_ERROR: 'builder_error',
  BUILD_TIMEOUT: 'build_timeout',
  BUILD_FAILED: 'build_failed',
  PRICING_QUESTION: 'pricing_question',
  ONBOARDING_STUCK: 'onboarding_stuck',
  GENERAL_HELP: 'general_help',
  FLOATING_BUTTON: 'floating_button'
} as const

export type SupportSource = typeof SUPPORT_SOURCES[keyof typeof SUPPORT_SOURCES]
