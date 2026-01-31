import type { MetadataRoute } from 'next'

/**
 * Robots.txt configuration
 *
 * This is the single source of truth for robots.txt.
 * The public/robots.txt file has been removed to avoid conflicts.
 *
 * Strategy:
 * - Allow AI/LLM crawlers (strategic for Arabic content discovery)
 * - Block aggressive SEO crawlers to preserve server resources
 * - Standard disallows for private/internal routes
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.sheenapps.com'

  return {
    rules: [
      // AI/LLM Crawlers - Allow (strategic for Arabic content discovery)
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'Amazonbot', allow: '/' },

      // Aggressive SEO crawlers - Block to preserve server resources
      { userAgent: 'AhrefsBot', disallow: '/' },
      { userAgent: 'MJ12bot', disallow: '/' },
      { userAgent: 'SemrushBot', disallow: '/' },
      { userAgent: 'BLEXBot', disallow: '/' },
      { userAgent: 'DotBot', disallow: '/' },

      // General rules for all other crawlers
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/_next/',
          '/admin/',
          '/studio/',
          '/drafts/',
          '/dashboard/',
          '/builder/',
          '/workspace/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
