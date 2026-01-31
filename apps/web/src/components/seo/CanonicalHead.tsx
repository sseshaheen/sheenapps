/**
 * Canonical HEAD component for SEO
 * Implements expert recommendations for Google Search Console "Duplicate without user-selected canonical"
 */

import { Metadata } from 'next'
import { toBCP47 } from '@/utils/i18n-seo'

interface CanonicalHeadProps {
  title: string
  description: string
  url: string // Canonical URL
  alternates?: Array<{
    hreflang: string
    href: string
  }>
  ogImage?: string
}

export function generateCanonicalMetadata({
  title,
  description,
  url,
  alternates = [],
  ogImage
}: CanonicalHeadProps): Metadata {
  const baseUrl = 'https://www.sheenapps.com'
  const fullOgImage = ogImage || `${baseUrl}/og-default.jpg`

  return {
    title,
    description,
    
    // Canonical URL (critical for duplicate content)
    alternates: {
      canonical: url,
      languages: alternates.reduce((acc, alt) => {
        // Use proper BCP-47 format (expert recommendation)
        acc[toBCP47(alt.hreflang)] = alt.href
        return acc
      }, {} as Record<string, string>)
    },

    // OpenGraph
    openGraph: {
      title,
      description,
      url,
      siteName: 'SheenApps',
      images: [
        {
          url: fullOgImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: 'en_US',
      type: 'website',
    },

    // Twitter
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [fullOgImage],
    },

    // Additional SEO
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  }
}

// Import the utility functions
export { generateMultilingualAlternates, getCanonicalUrl, getAvailableLocales } from '@/utils/i18n-seo'

/**
 * Example usage:
 * 
 * // In a page component
 * export function generateMetadata(): Metadata {
 *   return generateCanonicalMetadata({
 *     title: 'SheenApps — Build with AI',
 *     description: 'Build websites and apps with AI in Arabic and English.',
 *     url: 'https://www.sheenapps.com/', // Canonical root
 *     alternates: generateMultilingualAlternates('/'),
 *   })
 * }
 */
