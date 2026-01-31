import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

export const intlMiddleware = createMiddleware({
  ...routing,
  localePrefix: 'always', // Always include locale prefixes for consistent auth redirects
  defaultLocale: 'en'
})