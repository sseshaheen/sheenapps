import { ImageResponse } from 'next/og'
import { locales, type Locale } from '@/i18n/config'
import { isRtlLocale } from '@/lib/seo/locale'
import { getOgArabicFont, getOgFontConfig } from '@/lib/seo/og-fonts'

// Route segment config
export const runtime = 'edge'
export const alt = 'SheenApps Pricing'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Locale-specific content
const content: Record<string, { title: string; subtitle: string; cta: string }> = {
  en: {
    title: 'Simple, Transparent Pricing',
    subtitle: 'Start free. Scale as you grow.',
    cta: 'No hidden fees',
  },
  ar: {
    title: 'أسعار بسيطة وشفافة',
    subtitle: 'ابدأ مجاناً. توسع مع نمو مشروعك.',
    cta: 'بدون رسوم مخفية',
  },
  'ar-eg': {
    title: 'أسعار بسيطة وواضحة',
    subtitle: 'ابدأ ببلاش. كبر مع نمو شغلك.',
    cta: 'من غير مصاريف مخفية',
  },
  'ar-sa': {
    title: 'أسعار بسيطة وشفافة',
    subtitle: 'ابدأ مجاناً. توسع مع نمو أعمالك.',
    cta: 'بدون رسوم مخفية',
  },
  'ar-ae': {
    title: 'أسعار بسيطة وشفافة',
    subtitle: 'ابدأ مجاناً. توسع مع نمو أعمالك.',
    cta: 'بدون رسوم مخفية',
  },
  fr: {
    title: 'Tarification Simple et Transparente',
    subtitle: 'Commencez gratuitement. Évoluez avec votre croissance.',
    cta: 'Sans frais cachés',
  },
  es: {
    title: 'Precios Simples y Transparentes',
    subtitle: 'Comienza gratis. Escala mientras creces.',
    cta: 'Sin costos ocultos',
  },
  de: {
    title: 'Einfache, Transparente Preise',
    subtitle: 'Starten Sie kostenlos. Skalieren Sie mit Ihrem Wachstum.',
    cta: 'Keine versteckten Gebühren',
  },
}

// Currency symbols by locale
const currencies: Record<string, string> = {
  en: '$',
  ar: '$',
  'ar-eg': 'ج.م',
  'ar-sa': 'ر.س',
  'ar-ae': 'د.إ',
  fr: '€',
  es: '€',
  de: '€',
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
          SheenApps Pricing
        </div>
      ),
      { ...size }
    )
  }

  // Check if RTL locale
  const isRTL = isRtlLocale(locale)
  const localeContent = content[locale] || content.en
  const currency = currencies[locale] || '$'

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
              color: 'white',
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {localeContent.title}
          </h1>
          <p
            style={{
              fontSize: '32px',
              color: '#9ca3af',
              marginTop: '20px',
              lineHeight: 1.4,
            }}
          >
            {localeContent.subtitle}
          </p>
        </div>

        {/* Pricing cards preview */}
        <div
          style={{
            display: 'flex',
            gap: '20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: '24px',
          }}
        >
          {/* Free tier */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '20px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ color: '#9ca3af', fontSize: '16px' }}>
              {isRTL ? 'مجاني' : 'Free'}
            </span>
            <span style={{ color: 'white', fontSize: '28px', fontWeight: 'bold' }}>
              {currency}0
            </span>
          </div>
          {/* Pro tier */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '16px',
              padding: '20px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ color: '#a5b4fc', fontSize: '16px' }}>
              {isRTL ? 'احترافي' : 'Pro'}
            </span>
            <span style={{ color: 'white', fontSize: '28px', fontWeight: 'bold' }}>
              {currency}29
            </span>
          </div>
          {/* No hidden fees badge */}
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#86efac',
              padding: '20px 28px',
              borderRadius: '16px',
              fontSize: '20px',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {localeContent.cta}
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
