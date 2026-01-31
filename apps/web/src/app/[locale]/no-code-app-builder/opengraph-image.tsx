import { ImageResponse } from 'next/og'
import { locales, type Locale } from '@/i18n/config'
import { isRtlLocale } from '@/lib/seo/locale'
import { getOgArabicFont, getOgFontConfig } from '@/lib/seo/og-fonts'

// Route segment config
export const runtime = 'edge'
export const alt = 'No-Code App Builder - SheenApps'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Locale-specific content
const content: Record<string, { title: string; subtitle: string }> = {
  en: {
    title: 'Build Apps Without Code',
    subtitle: 'Create powerful business applications in minutes using AI',
  },
  ar: {
    title: 'ابنِ تطبيقات بدون كود',
    subtitle: 'أنشئ تطبيقات أعمال قوية في دقائق باستخدام الذكاء الاصطناعي',
  },
  'ar-eg': {
    title: 'ابني تطبيقات من غير كود',
    subtitle: 'اعمل تطبيقات شغل قوية في دقايق بالذكاء الاصطناعي',
  },
  'ar-sa': {
    title: 'ابنِ تطبيقات بدون كود',
    subtitle: 'أنشئ تطبيقات أعمال قوية في دقائق باستخدام الذكاء الاصطناعي',
  },
  'ar-ae': {
    title: 'ابنِ تطبيقات بدون كود',
    subtitle: 'أنشئ تطبيقات أعمال قوية في دقائق باستخدام الذكاء الاصطناعي',
  },
}

// Image generation
export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

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
          No-Code App Builder - SheenApps
        </div>
      ),
      { ...size }
    )
  }

  // Check if RTL locale
  const isRTL = isRtlLocale(locale)
  const localeContent = content[locale] || content.en

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
          direction: isRTL ? 'rtl' : 'ltr',
        }}
      >
        {/* Top bar with logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 'bold',
              color: 'white',
            }}
          >
            S
          </div>
          <span style={{ color: '#e5e7eb', fontSize: '28px', fontWeight: '600' }}>
            SheenApps
          </span>
        </div>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          <h1
            style={{
              fontSize: '64px',
              fontWeight: 'bold',
              background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {localeContent.title}
          </h1>
          <p
            style={{
              fontSize: '28px',
              color: '#9ca3af',
              marginTop: '24px',
              lineHeight: 1.4,
            }}
          >
            {localeContent.subtitle}
          </p>
        </div>

        {/* Bottom badges */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: '24px',
          }}
        >
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.2)',
              color: '#a5b4fc',
              padding: '10px 20px',
              borderRadius: '24px',
              fontSize: '18px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
          >
            {isRTL ? 'بدون كود' : 'No Code'}
          </div>
          <div
            style={{
              background: 'rgba(139, 92, 246, 0.2)',
              color: '#c4b5fd',
              padding: '10px 20px',
              borderRadius: '24px',
              fontSize: '18px',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}
          >
            {isRTL ? 'ذكاء اصطناعي' : 'AI-Powered'}
          </div>
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#86efac',
              padding: '10px 20px',
              borderRadius: '24px',
              fontSize: '18px',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            {isRTL ? '5 دقائق' : '5 Minutes'}
          </div>
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
