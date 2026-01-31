/**
 * Enhanced I18n Plugin with Central Locale Middleware
 *
 * Expert recommendations implemented:
 * - Type-safe request decoration
 * - Central locale resolution (resolve once, never re-parse)
 * - Content-Language headers for CDN/caching
 * - Structured locale data (base/tag/region)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveLocale, SUPPORTED_LOCALES, isRTL } from '../i18n/localeUtils'
import { createFormatter } from '../i18n/messageFormatter'
import '../types/fastify-i18n' // Import type declarations

// Enhanced plugin implementation with proper request decoration
export default async function i18nPlugin(app: FastifyInstance) {
  console.log('🌍 Initializing enhanced i18n plugin with central middleware...')

  // Decorate request with locale properties
  app.decorateRequest('locale', '')
  app.decorateRequest('localeTag', undefined)
  app.decorateRequest('region', undefined)

  // Central locale resolution middleware (expert recommendation)
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Multi-source locale negotiation with structured response
    const resolved = resolveLocale(
      req.headers['x-sheen-locale'] as string,     // Precedence 1: Explicit header
      (req.headers.cookie || '').includes('locale=') ?
        (req.headers.cookie || '').split('locale=')[1]?.split(';')[0] : undefined, // Precedence 2: Cookie
      req.headers['accept-language'] as string      // Precedence 3: Browser preference
    )

    // Type-safe request decoration (expert recommendation: resolve once, type it)
    req.locale = resolved.base        // 'ar' (for content lookup)
    req.localeTag = resolved.tag      // 'ar-EG' or 'ar' (for formatting/analytics)
    req.region = resolved.region      // 'EG' | null

    // CDN-friendly headers (expert recommendation: return full tag, not just base)
    reply.header('Content-Language', resolved.tag)  // 'ar-EG' for downstream analytics/formatting
    reply.header('Vary', 'x-sheen-locale, Accept-Language')

    // Add locale to logging context for observability
    if ((req as any).log) {
      (req as any).log = (req as any).log.child({
        locale: resolved.base,
        localeTag: resolved.tag,
        region: resolved.region
      })
    }

    // Debug logging for locale resolution (can be disabled in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🌐 Request ${req.id}: locale resolved to '${resolved.base}' (tag: '${resolved.tag}') from:`, {
        'x-sheen-locale': req.headers['x-sheen-locale'],
        'accept-language': req.headers['accept-language'],
        cookie_locale: (req.headers.cookie || '').includes('locale=') ?
          (req.headers.cookie || '').split('locale=')[1]?.split(';')[0] : undefined,
        resolved: resolved
      })
    }
  })

  console.log('✅ Enhanced i18n plugin initialized with central middleware')
  console.log(`✅ Supported locales: ${SUPPORTED_LOCALES.join(', ')}`)
}

// Export for server registration
export { i18nPlugin }
