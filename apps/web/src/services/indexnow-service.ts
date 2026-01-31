/**
 * IndexNow Service - Centralized instant search engine indexing
 * Triggers IndexNow for different page types across all locales
 */

import { logger } from '@/utils/logger'

export class IndexNowService {
  private static readonly LOCALES = ['en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de']
  private static readonly BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sheenapps.com'

  /**
   * Generate URLs for all locales of a given page pattern
   */
  private static generateLocaleUrls(pattern: string, params?: Record<string, string>): string[] {
    return this.LOCALES.map(locale => {
      let url = `${this.BASE_URL}/${locale}${pattern}`

      // Replace parameters if provided
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url = url.replace(`[${key}]`, value)
        })
      }

      return url
    })
  }

  /**
   * Call the IndexNow API with retry logic
   */
  private static async callIndexNow(urls: string[], type: 'urlUpdated' | 'urlDeleted' = 'urlUpdated'): Promise<void> {
    try {
      const response = await fetch(`${this.BASE_URL}/api/indexnow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, type })
      })

      if (!response.ok) {
        throw new Error(`IndexNow API failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      logger.info(`✅ IndexNow: Successfully submitted ${urls.length} URLs`, {
        urls: urls.length > 3 ? [urls[0], '...', urls[urls.length - 1]] : urls,
        result: result.success
      })
    } catch (error) {
      logger.error('❌ IndexNow API Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        urls: urls.length > 3 ? [urls[0], '...', urls[urls.length - 1]] : urls
      })
      // Don't throw - IndexNow failures shouldn't break main functionality
    }
  }

  /**
   * Index homepage across all locales
   */
  static async indexHomepage(): Promise<void> {
    const urls = this.generateLocaleUrls('')
    await this.callIndexNow(urls, 'urlUpdated')
  }

  /**
   * Index advisors listing page across all locales
   */
  static async indexAdvisorsPage(): Promise<void> {
    const urls = this.generateLocaleUrls('/advisors')
    await this.callIndexNow(urls, 'urlUpdated')
  }

  /**
   * Index specific advisor profile across all locales
   */
  static async indexAdvisorProfile(advisorId: string): Promise<void> {
    const urls = this.generateLocaleUrls('/advisors/[advisorId]', { advisorId })
    await this.callIndexNow(urls, 'urlUpdated')
  }

  /**
   * Index careers page across all locales
   */
  static async indexCareersPage(): Promise<void> {
    const urls = this.generateLocaleUrls('/careers')
    await this.callIndexNow(urls, 'urlUpdated')
  }

  /**
   * Index specific career/job posting across all locales
   */
  static async indexCareerPost(slug: string): Promise<void> {
    const urls = this.generateLocaleUrls('/careers/[slug]', { slug })
    await this.callIndexNow(urls, 'urlUpdated')
  }

  /**
   * Index blog post across all locales
   */
  static async indexBlogPost(slug: string): Promise<void> {
    const urls = this.generateLocaleUrls('/blog/[slug]', { slug })
    await this.callIndexNow(urls, 'urlUpdated')
  }

  /**
   * Remove URLs from search index (for deleted content)
   */
  static async removeFromIndex(pattern: string, params?: Record<string, string>): Promise<void> {
    const urls = this.generateLocaleUrls(pattern, params)
    await this.callIndexNow(urls, 'urlDeleted')
  }

  /**
   * Manual trigger for any custom URLs
   */
  static async indexCustomUrls(urls: string[]): Promise<void> {
    await this.callIndexNow(urls, 'urlUpdated')
  }
}
