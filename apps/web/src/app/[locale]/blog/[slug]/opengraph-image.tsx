import { ImageResponse } from 'next/og'
import { getBlogPost } from '@/lib/sanity.client'
import { locales, type Locale } from '@/i18n/config'
import { isRtlLocale } from '@/lib/seo/locale'
import { getOgArabicFont, getOgFontConfig } from '@/lib/seo/og-fonts'

// Route segment config
export const runtime = 'edge'
export const alt = 'SheenApps Blog Post'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Image generation
export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 48,
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
            color: 'white',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          SheenApps Blog
        </div>
      ),
      { ...size }
    )
  }

  // Get post data
  const post = await getBlogPost(slug, locale as Locale)

  if (!post) {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 48,
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
            color: 'white',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          SheenApps Blog
        </div>
      ),
      { ...size }
    )
  }

  // Check if RTL locale
  const isRTL = isRtlLocale(locale)

  // Load bundled Arabic font for RTL locales (no runtime fetch)
  const fontData = await getOgArabicFont(locale)

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 32,
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0f172a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px',
          position: 'relative',
        }}
      >
        {/* Top bar with logo and category */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 'bold',
                color: 'white',
              }}
            >
              S
            </div>
            <span style={{ color: '#e5e7eb', fontSize: '24px', fontWeight: '600' }}>
              SheenApps Blog
            </span>
          </div>
          {post.categories?.[0]?.title && (
            <div
              style={{
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#a5b4fc',
                padding: '8px 20px',
                borderRadius: '20px',
                fontSize: '18px',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              {post.categories[0].title}
            </div>
          )}
        </div>

        {/* Main title */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            direction: isRTL ? 'rtl' : 'ltr',
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          <h1
            style={{
              fontSize: post.title.length > 60 ? '42px' : '52px',
              fontWeight: 'bold',
              color: 'white',
              lineHeight: 1.2,
              margin: 0,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {post.title}
          </h1>
        </div>

        {/* Bottom bar with author and reading time */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: '24px',
            marginTop: '24px',
          }}
        >
          {post.author?.name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                {post.author.name.charAt(0).toUpperCase()}
              </div>
              <span style={{ color: '#9ca3af', fontSize: '20px' }}>
                {post.author.name}
              </span>
            </div>
          )}
          {post.readingTime && (
            <span style={{ color: '#6b7280', fontSize: '18px' }}>
              {post.readingTime} min read
            </span>
          )}
        </div>

        {/* Gradient overlay at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: getOgFontConfig(fontData),
    }
  )
}
