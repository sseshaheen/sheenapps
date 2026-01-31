import { client } from '@/lib/sanity.client'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { toOgLocale } from '@/lib/seo/locale'

// ISR: Regenerate pages every hour
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 0.2)
export const revalidate = 3600

// Types
interface WebsiteTypeSolution {
  kind: 'type'
  website_type: string
  title_ar: string
  subtitle_ar: string
  hero_title_ar: string
  meta_description_ar: string
  locale: string
  currency: string
  payment_gateways: string[]
  features_ar: string[]
  use_cases?: string[]
  faq_ar: Array<{
    question: string
    answer: string
  }>
  hero_image?: {
    asset: {
      url: string
    }
    alt: string
  }
  examples_gallery?: Array<{
    asset: {
      url: string
    }
    alt: string
    caption?: string
  }>
  cta_text_ar: string
  cta_secondary_ar?: string
  cta_whatsapp_ar?: string
  builder_preset?: string
  price_range?: {
    min: number
    max: number
  }
}

async function fetchSolutionTypes(): Promise<Array<{ website_type: string }>> {
  try {
    return await client.fetch(`
      *[_type == "solution" && kind == "type" && defined(website_type)] [0...20] {
        website_type
      }
    `)
  } catch (error) {
    console.warn('Failed to fetch solution types:', error)
    return []
  }
}

async function fetchSolutionMetadata(type: string) {
  try {
    return await client.fetch<WebsiteTypeSolution>(
      `*[_type == "solution" && kind == "type" && website_type == $type][0] {
        title_ar,
        meta_description_ar,
        hero_title_ar
      }`,
      { type }
    )
  } catch (error) {
    console.warn('Failed to fetch solution type metadata:', error)
    return null
  }
}

async function fetchSolutionData(type: string) {
  try {
    return await client.fetch<WebsiteTypeSolution>(
      `*[_type == "solution" && kind == "type" && website_type == $type][0] {
        kind,
        website_type,
        title_ar,
        subtitle_ar,
        hero_title_ar,
        meta_description_ar,
        locale,
        currency,
        payment_gateways,
        features_ar,
        use_cases,
        faq_ar,
        hero_image {
          asset-> {
            url
          },
          alt
        },
        examples_gallery[] {
          asset-> {
            url
          },
          alt,
          caption
        },
        cta_text_ar,
        cta_secondary_ar,
        cta_whatsapp_ar,
        builder_preset,
        price_range
      }`,
      { type }
    )
  } catch (error) {
    console.warn('Failed to fetch solution type data:', error)
    return null
  }
}

// Generate static params - LIMITED to avoid locale multiplication
// Other types will be rendered on-demand and cached via ISR
export async function generateStaticParams() {
  const solutions = await fetchSolutionTypes()

  return solutions.map(item => ({
    type: item.website_type
  }))
}

// Generate metadata for SEO
export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; type: string }>
}): Promise<Metadata> {
  const { locale, type } = await params
  
  const data = await fetchSolutionMetadata(type)

  if (!data) {
    return {
      title: 'الصفحة غير موجودة'
    }
  }

  const title = data.hero_title_ar || data.title_ar
  const description = data.meta_description_ar

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
      // English canonical at root, others with locale prefix
      canonical: locale === 'en' ? `/solutions/type/${type}` : `/${locale}/solutions/type/${type}`
    }
  }
}

// Main page component
export default async function WebsiteTypeSolutionPage({
  params
}: {
  params: Promise<{ locale: string; type: string }>
}) {
  const { locale, type } = await params
  
  const data = await fetchSolutionData(type)

  if (!data) {
    notFound()
  }

  // Currency symbol mapping
  const currencySymbols: Record<string, string> = {
    EGP: 'ج.م',
    SAR: 'ر.س',
    AED: 'د.إ',
    USD: '$'
  }

  const currencySymbol = currencySymbols[data.currency] || data.currency

  // Builder URL with preset (uses dynamic locale)
  const builderUrl = `/${locale}/builder/new${data.builder_preset ? `?preset=${data.builder_preset}` : ''}`

  return (
    <main dir="rtl" className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 to-background py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              {data.hero_title_ar || data.title_ar}
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              {data.subtitle_ar}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={builderUrl}
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:bg-primary/90 transition-colors"
              >
                {data.cta_text_ar}
                <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              {data.cta_secondary_ar && (
                <Link
                  href={builderUrl}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-card text-foreground rounded-lg font-semibold text-lg hover:bg-card/80 transition-colors"
                >
                  {data.cta_secondary_ar}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            المميزات الأساسية
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
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

      {/* Examples Gallery */}
      {data.examples_gallery && data.examples_gallery.length > 0 && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
              أمثلة حية
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {data.examples_gallery.map((example, index) => (
                <div key={index} className="bg-card rounded-lg overflow-hidden shadow-sm">
                  {example.asset?.url && (
                    <div className="aspect-video bg-muted">
                      <img
                        src={example.asset.url}
                        alt={example.alt}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  {example.caption && (
                    <div className="p-4">
                      <p className="text-sm text-muted-foreground">{example.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Use Cases */}
      {data.use_cases && data.use_cases.length > 0 && (
        <section className="py-16 bg-card">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
              من يستخدم هذا النوع من المواقع؟
            </h2>
            <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
              {data.use_cases.map((useCase, index) => (
                <span
                  key={index}
                  className="px-6 py-3 bg-background rounded-full text-foreground font-medium"
                >
                  {useCase}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Payment & Pricing */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            الدفع والأسعار
          </h2>
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap justify-center gap-4 mb-8">
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
              <div className="text-center">
                <p className="text-lg text-muted-foreground">
                  الأسعار تبدأ من{' '}
                  <span className="font-bold text-foreground">
                    {data.price_range.min} {currencySymbol}
                  </span>
                  {data.price_range.max && (
                    <>
                      {' '}إلى{' '}
                      <span className="font-bold text-foreground">
                        {data.price_range.max} {currencySymbol}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
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
            ابدأ موقعك الآن
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            منصة عربية ١٠٠٪ بالذكاء الاصطناعي. RTL كامل، دفع محلي، دعم عبر واتساب.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={builderUrl}
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
    </main>
  )
}
