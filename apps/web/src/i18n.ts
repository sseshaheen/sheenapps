import { getRequestConfig } from 'next-intl/server'
import { locales } from './i18n/config'
import { getAllMessagesForLocale } from './i18n/request'

export default getRequestConfig(async ({ requestLocale }) => {
  // Ensure that a valid locale is used
  const locale = await requestLocale
  
  if (!locale || !locales.includes(locale as any)) {
    const messages = await getAllMessagesForLocale('en')
    return {
      locale: 'en',
      messages
    }
  }

  const messages = await getAllMessagesForLocale(locale)
  return {
    locale,
    messages,
    timeZone: getTimeZone(locale),
    now: new Date()
  }
})

function getTimeZone(locale: string): string {
  const timeZones: Record<string, string> = {
    'en': 'America/New_York',
    'ar-eg': 'Africa/Cairo',
    'ar-sa': 'Asia/Riyadh',
    'ar-ae': 'Asia/Dubai',
    'ar': 'Asia/Dubai',
    'fr-ma': 'Africa/Casablanca',
    'fr': 'Europe/Paris',
    'es': 'Europe/Madrid',
    'de': 'Europe/Berlin',
  }
  
  return timeZones[locale] || 'UTC'
}