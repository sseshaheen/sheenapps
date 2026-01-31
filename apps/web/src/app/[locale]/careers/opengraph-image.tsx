import { ImageResponse } from 'next/og'
import { locales, type Locale } from '@/i18n/config'
import { isRtlLocale } from '@/lib/seo/locale'
import { getOgArabicFont, getOgFontConfig } from '@/lib/seo/og-fonts'

// Route segment config
export const runtime = 'edge'
export const alt = 'SheenApps Careers'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Locale-specific content
const content: Record<string, { title: string; subtitle: string; badges: string[] }> = {
  en: {
    title: 'Join Our Team',
    subtitle: 'Help us make software development accessible to everyone with AI.',
    badges: ['Remote First', 'Competitive Pay', 'Rapid Growth'],
  },
  ar: {
    title: 'انضم إلى فريقنا',
    subtitle: 'ساعدنا في جعل تطوير البرمجيات متاحاً للجميع بالذكاء الاصطناعي.',
    badges: ['عمل عن بُعد', 'راتب تنافسي', 'نمو سريع'],
  },
  'ar-eg': {
    title: 'انضم لفريقنا',
    subtitle: 'ساعدنا نخلي تطوير السوفتوير متاح للكل بالذكاء الاصطناعي.',
    badges: ['شغل من البيت', 'راتب تنافسي', 'نمو سريع'],
  },
  'ar-sa': {
    title: 'انضم إلى فريقنا',
    subtitle: 'ساعدنا في جعل تطوير البرمجيات متاحاً للجميع بالذكاء الاصطناعي.',
    badges: ['عمل عن بُعد', 'راتب تنافسي', 'نمو سريع'],
  },
  'ar-ae': {
    title: 'انضم إلى فريقنا',
    subtitle: 'ساعدنا في جعل تطوير البرمجيات متاحاً للجميع بالذكاء الاصطناعي.',
    badges: ['عمل عن بُعد', 'راتب تنافسي', 'نمو سريع'],
  },
  fr: {
    title: 'Rejoignez Notre Équipe',
    subtitle: 'Aidez-nous à rendre le développement logiciel accessible à tous avec l\'IA.',
    badges: ['Télétravail', 'Salaire Compétitif', 'Croissance Rapide'],
  },
  es: {
    title: 'Únete a Nuestro Equipo',
    subtitle: 'Ayúdanos a hacer el desarrollo de software accesible para todos con IA.',
    badges: ['Remoto', 'Pago Competitivo', 'Crecimiento Rápido'],
  },
  de: {
    title: 'Werde Teil Unseres Teams',
    subtitle: 'Helfen Sie uns, Softwareentwicklung mit KI für alle zugänglich zu machen.',
    badges: ['Remote First', 'Wettbewerbsfähig', 'Schnelles Wachstum'],
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
          SheenApps Careers
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
        {/* Top bar with logo and hiring badge */}
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
              gap: '16px',
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
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#86efac',
              padding: '10px 24px',
              borderRadius: '24px',
              fontSize: '20px',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                background: '#22c55e',
                borderRadius: '50%',
              }}
            />
            {isRTL ? 'نحن نوظف' : "We're Hiring"}
          </div>
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
              fontSize: '68px',
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
              fontSize: '28px',
              color: '#9ca3af',
              marginTop: '20px',
              lineHeight: 1.5,
              maxWidth: '900px',
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
          {localeContent.badges.map((badge, i) => (
            <div
              key={i}
              style={{
                background: i === 0
                  ? 'rgba(99, 102, 241, 0.2)'
                  : i === 1
                  ? 'rgba(139, 92, 246, 0.2)'
                  : 'rgba(168, 85, 247, 0.2)',
                color: i === 0 ? '#a5b4fc' : i === 1 ? '#c4b5fd' : '#d8b4fe',
                padding: '12px 24px',
                borderRadius: '24px',
                fontSize: '20px',
                border: `1px solid ${
                  i === 0
                    ? 'rgba(99, 102, 241, 0.3)'
                    : i === 1
                    ? 'rgba(139, 92, 246, 0.3)'
                    : 'rgba(168, 85, 247, 0.3)'
                }`,
              }}
            >
              {badge}
            </div>
          ))}
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
