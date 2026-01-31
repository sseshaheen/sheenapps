import type { MetadataRoute } from 'next'
import { client } from '@/lib/sanity.client'
import { locales, defaultLocale } from '@/i18n/config'
import { toBCP47, getBuildTime, getAvailableLocales } from '@/utils/i18n-seo'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.sheenapps.com' // Match GSC property and canonical URLs
  const buildTime = getBuildTime() // Stable timestamp (expert recommendation)

  // Use production locales (excludes en and fr-ma which have canonical redirects)
  const productionLocales = getAvailableLocales().filter(locale => 
    locale !== 'en' // Remove /en (canonical is root /)
  )

  // Static pages - Root is canonical English, others use locale prefix
  const staticPages: MetadataRoute.Sitemap = [
    // Canonical English pages (no /en prefix, stable timestamps)
    {
      url: `${baseUrl}/`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/advisors`,
      lastModified: new Date(), // Keep dynamic for frequently changing content
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/careers`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: buildTime,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: buildTime,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: buildTime,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: buildTime,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    // Arabic SEO: No-code app builder money page (English)
    {
      url: `${baseUrl}/no-code-app-builder`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },

    // Other locale pages (with locale prefix)
    ...productionLocales.flatMap(locale => [
    {
      url: `${baseUrl}/${locale}`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/${locale}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/${locale}/advisors`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/${locale}/careers`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/${locale}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/${locale}/help`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/${locale}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/${locale}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/${locale}/pricing`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    // Arabic SEO: No-code app builder money page
    {
      url: `${baseUrl}/${locale}/no-code-app-builder`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    ]),

    // Arabic SEO: Regional landing pages (high priority for local search)
    {
      url: `${baseUrl}/ar-eg/build-app-egypt`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.95,
    },
    {
      url: `${baseUrl}/ar-sa/build-app-saudi`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.95,
    },
    {
      url: `${baseUrl}/ar-ae/build-app-uae`,
      lastModified: buildTime,
      changeFrequency: 'weekly' as const,
      priority: 0.95,
    },
  ]

  // Dynamic blog posts
  let blogPages: MetadataRoute.Sitemap = []
  
  // Dynamic career posts
  let careerPages: MetadataRoute.Sitemap = []
  
  // Dynamic advisor profiles (placeholder - would need actual advisor data)
  const advisorPages: MetadataRoute.Sitemap = []

  // Helper function for x-default hreflang alternates with BCP-47 format
  const addAlternates = (language: string, basePath: string, translations: any[]) => {
    const alternates: Record<string, string> = {}
    
    // Handle canonical English (no /en prefix)
    if (language === 'en') {
      alternates[toBCP47(language)] = `${baseUrl}/${basePath}`
    } else {
      alternates[toBCP47(language)] = `${baseUrl}/${language}/${basePath}`
    }
    
    // Translations (map fr-ma to fr, use proper BCP-47)
    translations?.forEach((t: any) => {
      if (t.language && t.slug) {
        const translatedPath = basePath.replace(/[^/]+$/, t.slug)
        const canonicalLang = t.language === 'fr-ma' ? 'fr' : t.language
        
        if (canonicalLang === 'en') {
          alternates[toBCP47(canonicalLang)] = `${baseUrl}/${translatedPath}`
        } else {
          alternates[toBCP47(canonicalLang)] = `${baseUrl}/${canonicalLang}/${translatedPath}`
        }
      }
    })
    
    // x-default fallback points to canonical root (expert recommendation)
    alternates['x-default'] = `${baseUrl}/${basePath}`
    
    return { languages: alternates }
  }

  try {
    // Fetch blog posts (FIXED: proper parentheses for precedence)
    const posts = await client.fetch(`
      *[
        (_type == "post" || _type == "blogPost") &&
        status == "published" &&
        defined(slug.current) &&
        !(_id in path("drafts.**"))
      ] {
        "slug": slug.current,
        language,
        publishedAt,
        _updatedAt,
        "translations": coalesce(
          translations[]-> {
            language,
            "slug": slug.current
          },
          []
        )
      }
    `)
    
    // Fetch career posts (FIXED: proper parentheses for precedence)
    const careers = await client.fetch(`
      *[
        (_type == "career" || _type == "job") &&
        status == "published" &&
        defined(slug.current) &&
        !(_id in path("drafts.**"))
      ] {
        "slug": slug.current,
        language,
        publishedAt,
        _updatedAt,
        "translations": coalesce(
          translations[]-> {
            language,
            "slug": slug.current
          },
          []
        )
      }
    `)

    blogPages = posts.map((post: any) => {
      // Handle canonical English URLs (no /en prefix)
      const canonicalUrl = post.language === 'en' 
        ? `${baseUrl}/blog/${post.slug}`
        : `${baseUrl}/${post.language}/blog/${post.slug}`
        
      return {
        url: canonicalUrl,
        lastModified: new Date(post._updatedAt || post.publishedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
        alternates: addAlternates(post.language, `blog/${post.slug}`, post.translations)
      }
    })
    
    careerPages = careers.map((career: any) => {
      // Handle canonical English URLs (no /en prefix)
      const canonicalUrl = career.language === 'en' 
        ? `${baseUrl}/careers/${career.slug}`
        : `${baseUrl}/${career.language}/careers/${career.slug}`
        
      return {
        url: canonicalUrl,
        lastModified: new Date(career._updatedAt || career.publishedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
        alternates: addAlternates(career.language, `careers/${career.slug}`, career.translations)
      }
    })
    
  } catch (error) {
    console.warn('Failed to fetch content for sitemap:', error)
  }

  return [...staticPages, ...blogPages, ...careerPages, ...advisorPages]
}