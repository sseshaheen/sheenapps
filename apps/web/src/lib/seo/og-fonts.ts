/**
 * OG Image Font Loader
 * Bundles Arabic font for reliable Edge OG image generation
 *
 * Why fetch from public/ instead of Google Fonts:
 * - Eliminates external dependency
 * - Stable + cacheable from own origin
 * - No tofu boxes from failed external fetches
 * - Works in restricted networks
 */

import { isRtlLocale } from './locale'

let cachedArabicFont: ArrayBuffer | null = null

/**
 * Get Arabic font for OG images
 * Returns undefined for non-RTL locales
 * Caches the font buffer after first load
 */
export async function getOgArabicFont(locale: string): Promise<ArrayBuffer | undefined> {
  if (!isRtlLocale(locale)) return undefined
  if (cachedArabicFont) return cachedArabicFont

  try {
    // Fetch from own origin - stable + cacheable
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.sheenapps.com'
    const fontUrl = new URL('/fonts/NotoSansArabic-Bold.ttf', siteUrl)

    const res = await fetch(fontUrl, {
      // Cache aggressively; OG images can be hit a lot by crawlers
      cache: 'force-cache',
    })

    if (!res.ok) return undefined

    cachedArabicFont = await res.arrayBuffer()
    return cachedArabicFont
  } catch {
    // Font loading failed, OG will use fallback
    return undefined
  }
}

/**
 * Get font config for ImageResponse
 * Returns the fonts array if Arabic font is available
 */
export function getOgFontConfig(fontData: ArrayBuffer | undefined) {
  if (!fontData) return undefined

  return [
    {
      name: 'Noto Sans Arabic',
      data: fontData,
      style: 'normal' as const,
      weight: 700 as const,
    },
  ]
}
