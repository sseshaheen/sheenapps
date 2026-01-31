import { client } from '@/lib/sanity.client'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { toOgLocale } from '@/lib/seo/locale'

// ISR: Regenerate pages every hour, pre-build only top slugs
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 0.2)
export const revalidate = 3600

// Types
interface SolutionLandingData {
  industry_ar: string
  city_ar: string
  locale: string
  currency: string
  payment_gateways: string[]
  features_ar: string[]
  faq_ar: Array<{
    question: string
    answer: string
  }>
  hero_title_ar: string
  hero_subtitle_ar: string
  meta_description_ar: string
  hero_image?: {
    asset: {
      url: string
    }
    alt: string
  }
  cta_text_ar: string
  price_range?: {
    min: number
    max: number
  }
}

async function fetchSolutionSlugs(): Promise<Array<{ slug: string }>> {
  try {
    return await client.fetch(`
      *[_type == "solutionLanding" && defined(slug.current)] [0...20] {
        "slug": slug.current
      }
    `)
  } catch (error) {
    console.warn('Failed to fetch solution landing slugs:', error)
    return []
  }
}

async function fetchSolutionMetadata(slug: string) {
  try {
    return await client.fetch<Pick<SolutionLandingData, 'industry_ar' | 'city_ar' | 'meta_description_ar' | 'hero_title_ar' | 'features_ar'>>(
      `*[_type == "solutionLanding" && slug.current == $slug][0] {
        industry_ar,
        city_ar,
        meta_description_ar,
        hero_title_ar,
        features_ar
      }`,
      { slug }
    )
  } catch (error) {
    console.warn('Failed to fetch solution landing metadata:', error)
    return null
  }
}

async function fetchSolutionLanding(slug: string) {
  try {
    return await client.fetch<SolutionLandingData>(
      `*[_type == "solutionLanding" && slug.current == $slug][0] {
        industry_ar,
        city_ar,
        locale,
        currency,
        payment_gateways,
        features_ar,
        faq_ar,
        hero_title_ar,
        hero_subtitle_ar,
        meta_description_ar,
        hero_image {
          asset-> {
            url
          },
          alt
        },
        cta_text_ar,
        price_range
      }`,
      { slug }
    )
  } catch (error) {
    console.warn('Failed to fetch solution landing data:', error)
    return null
  }
}

// Generate static params - LIMITED to avoid 500+ × 9 locales = 4500+ SSG pages
// Other slugs will be rendered on-demand and cached via ISR
export async function generateStaticParams() {
  const slugs = await fetchSolutionSlugs()

  // Return only the slug parameter for this route segment
  return slugs.map(item => ({
    slug: item.slug
  }))
}

// Generate metadata for SEO
export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const data = await fetchSolutionMetadata(slug)

  if (!data) {
    return {
      title: 'الصفحة غير موجودة'
    }
  }

  const title = data.hero_title_ar || `${data.industry_ar} في ${data.city_ar} - بناء موقع عربي في ٥ دقائق`
  const description = data.meta_description_ar || `موقع عربي لـ${data.industry_ar} في ${data.city_ar} خلال ٥ دقائق. RTL، ${data.features_ar?.slice(0, 3).join('، ')}، دفع محلي.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale: toOgLocale(locale),
      type: 'website'
    },
    alternates: {
      // Use rawSlug (already URI-encoded) for canonical to handle Arabic characters correctly
      // English canonical at root, others with locale prefix
      canonical: locale === 'en' ? `/solutions/${rawSlug}` : `/${locale}/solutions/${rawSlug}`
    }
  }
}

// Main page component
export default async function SolutionLandingPage({
  params
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug: rawSlug } = await params

  // Decode the URL-encoded slug to get the actual Arabic characters
  const slug = decodeURIComponent(rawSlug)

  const data = await fetchSolutionLanding(slug)

  if (!data) {
    notFound()
  }

  const title = data.hero_title_ar || `${data.industry_ar} في ${data.city_ar} — بناء موقع عربي في ٥ دقائق`
  const subtitle = data.hero_subtitle_ar || `موقع عربي احترافي لـ${data.industry_ar} في ${data.city_ar} خلال ٥ دقائق. واجهة RTL كاملة، ${data.features_ar?.slice(0, 3).join('، ')}، ودفع بالعملة المحلية ${data.currency}.`

  // Currency symbol mapping
  const currencySymbols: Record<string, string> = {
    EGP: 'ج.م',
    SAR: 'ر.س',
    AED: 'د.إ'
  }

  const currencySymbol = currencySymbols[data.currency] || data.currency

  // Build canonical URL (English at root, others with locale prefix)
  const baseUrl = 'https://www.sheenapps.com'
  const solutionsUrl = locale === 'en' ? `${baseUrl}/solutions` : `${baseUrl}/${locale}/solutions`

  // BreadcrumbList structured data
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": baseUrl
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": locale.startsWith('ar') ? "الحلول" : "Solutions",
        "item": solutionsUrl
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": data.industry_ar || slug
      }
    ]
  }

  return (
    <main dir="rtl" className="min-h-screen bg-background">
      {/* JSON-LD Structured Data - BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbData, null, 2)
        }}
      />
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 to-background py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              {title}
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              {subtitle}
            </p>
            <Link
              href={`/${locale}/builder/new`}
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:bg-primary/90 transition-colors"
            >
              {data.cta_text_ar || 'ابدأ في ٥ دقائق'}
              <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            المميزات الأساسية
          </h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {data.features_ar?.map((feature, index) => (
              <div key={index} className="bg-background rounded-lg p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-primary mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-foreground">{feature}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Gateways */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            بوابات الدفع المدعومة
          </h2>
          <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
            {data.payment_gateways?.map((gateway, index) => (
              <span
                key={index}
                className="px-6 py-3 bg-card rounded-full text-foreground font-medium"
              >
                {gateway}
              </span>
            ))}
          </div>
          {data.price_range && (
            <div className="text-center mt-8">
              <p className="text-lg text-muted-foreground">
                الأسعار تبدأ من{' '}
                <span className="font-bold text-foreground">
                  {data.price_range.min} {currencySymbol}
                </span>
                {' '}إلى{' '}
                <span className="font-bold text-foreground">
                  {data.price_range.max} {currencySymbol}
                </span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            الأسئلة الشائعة
          </h2>
          <div className="max-w-3xl mx-auto space-y-6">
            {data.faq_ar?.map((item, index) => (
              <details key={index} className="bg-background rounded-lg p-6 group">
                <summary className="font-semibold text-lg cursor-pointer list-none flex justify-between items-center text-foreground">
                  {item.question}
                  <svg 
                    className="w-5 h-5 transition-transform group-open:rotate-180"
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-4 text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-t from-primary/10 to-background">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            ابدأ مشروعك الآن
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            انضم إلى آلاف الأعمال في {data.city_ar} التي تستخدم SheenApps لبناء مواقعها بالذكاء الاصطناعي
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/${locale}/builder/new`}
              className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:bg-primary/90 transition-colors"
            >
              جرّب المنشئ مجاناً
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="px-8 py-4 bg-card text-foreground rounded-lg font-semibold text-lg hover:bg-card/80 transition-colors"
            >
              تحدث مع مستشار
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: data.faq_ar?.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer
              }
            }))
          })
        }}
      />
      
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'SheenApps',
            description: `منصة لبناء مواقع ${data.industry_ar} في ${data.city_ar} خلال دقائق.`,
            inLanguage: 'ar',
            areaServed: [locale.toUpperCase()],
            offers: {
              '@type': 'Offer',
              priceCurrency: data.currency,
              price: data.price_range?.min || '999'
            }
          })
        }}
      />
    </main>
  )
}
