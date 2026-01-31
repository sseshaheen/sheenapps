import { client } from '@/lib/sanity.client'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { toOgLocale } from '@/lib/seo/locale'

// ISR: Regenerate pages every hour
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 0.2)
export const revalidate = 3600

// Types
interface MigrationSolution {
  kind: 'migration'
  migration_from: string
  title_ar: string
  subtitle_ar: string
  hero_title_ar: string
  meta_description_ar: string
  locale: string
  currency: string
  payment_gateways: string[]
  features_ar: string[]
  comparison_table?: Array<{
    feature: string
    competitor: string
    sheenapps: string
  }>
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
  cta_text_ar: string
  cta_secondary_ar?: string
  cta_whatsapp_ar?: string
  builder_preset?: string
  price_range?: {
    min: number
    max: number
  }
}

async function fetchMigrationPlatforms(): Promise<Array<{ migration_from: string }>> {
  try {
    return await client.fetch(`
      *[_type == "solution" && kind == "migration" && defined(migration_from)] [0...20] {
        migration_from
      }
    `)
  } catch (error) {
    console.warn('Failed to fetch migration platform slugs:', error)
    return []
  }
}

async function fetchMigrationMetadata(platform: string) {
  try {
    return await client.fetch<MigrationSolution>(
      `*[_type == "solution" && kind == "migration" && migration_from == $platform][0] {
        title_ar,
        meta_description_ar,
        hero_title_ar
      }`,
      { platform }
    )
  } catch (error) {
    console.warn('Failed to fetch migration metadata:', error)
    return null
  }
}

async function fetchMigrationData(platform: string) {
  try {
    return await client.fetch<MigrationSolution>(
      `*[_type == "solution" && kind == "migration" && migration_from == $platform][0] {
        kind,
        migration_from,
        title_ar,
        subtitle_ar,
        hero_title_ar,
        meta_description_ar,
        locale,
        currency,
        payment_gateways,
        features_ar,
        comparison_table,
        faq_ar,
        hero_image {
          asset-> {
            url
          },
          alt
        },
        cta_text_ar,
        cta_secondary_ar,
        cta_whatsapp_ar,
        builder_preset,
        price_range
      }`,
      { platform }
    )
  } catch (error) {
    console.warn('Failed to fetch migration solution data:', error)
    return null
  }
}

// Generate static params - LIMITED to avoid locale multiplication
// Other platforms will be rendered on-demand and cached via ISR
export async function generateStaticParams() {
  const solutions = await fetchMigrationPlatforms()

  return solutions.map(item => ({
    platform: item.migration_from
  }))
}

// Generate metadata for SEO
export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; platform: string }>
}): Promise<Metadata> {
  const { locale, platform } = await params
  
  const data = await fetchMigrationMetadata(platform)

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
      canonical: locale === 'en' ? `/solutions/migrate/${platform}` : `/${locale}/solutions/migrate/${platform}`
    }
  }
}

// Main page component
export default async function MigrationSolutionPage({
  params
}: {
  params: Promise<{ locale: string; platform: string }>
}) {
  const { locale, platform } = await params
  
  const data = await fetchMigrationData(platform)

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

  // Builder URL with migration preset (uses dynamic locale)
  const builderUrl = `/${locale}/builder/new${data.builder_preset ? `?preset=${data.builder_preset}` : `?preset=migrate&from=${platform}`}`

  // Platform display names
  const platformNames: Record<string, string> = {
    wordpress: 'WordPress',
    wix: 'Wix',
    squarespace: 'Squarespace',
    shopify: 'Shopify',
    webflow: 'Webflow'
  }

  const platformName = platformNames[platform] || platform

  return (
    <main dir="rtl" className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 to-background py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              {data.hero_title_ar || `الانتقال من ${platformName} إلى SheenApps خلال يوم واحد`}
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              {data.subtitle_ar || `انقل موقعك من ${platformName} بدون توقف. RTL كامل، دفع محلي، مميزات أفضل وتكلفة أقل.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={builderUrl}
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:bg-primary/90 transition-colors"
              >
                {data.cta_text_ar || 'اطلب الهجرة اليوم'}
                <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              {data.cta_secondary_ar && (
                <Link
                  href={`/${locale}/contact`}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-card text-foreground rounded-lg font-semibold text-lg hover:bg-card/80 transition-colors"
                >
                  {data.cta_secondary_ar}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      {data.comparison_table && data.comparison_table.length > 0 && (
        <section className="py-16 bg-card">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
              مقارنة {platformName} مع SheenApps
            </h2>
            <div className="max-w-4xl mx-auto overflow-x-auto">
              <table className="w-full bg-background rounded-lg overflow-hidden">
                <thead className="bg-primary/10">
                  <tr>
                    <th className="px-6 py-4 text-right font-semibold text-foreground">الميزة</th>
                    <th className="px-6 py-4 text-center font-semibold text-foreground">{platformName}</th>
                    <th className="px-6 py-4 text-center font-semibold text-foreground">SheenApps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.comparison_table.map((row, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 font-medium text-foreground">{row.feature}</td>
                      <td className="px-6 py-4 text-center text-muted-foreground">{row.competitor}</td>
                      <td className="px-6 py-4 text-center text-primary font-medium">{row.sheenapps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Migration Process */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            كيف تتم عملية الانتقال؟
          </h2>
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
                <h3 className="font-semibold mb-2 text-foreground">التحليل</h3>
                <p className="text-sm text-muted-foreground">نحلل موقعك الحالي ونحدد المحتوى والوظائف</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold mb-2 text-foreground">البناء</h3>
                <p className="text-sm text-muted-foreground">نبني موقعك الجديد بالذكاء الاصطناعي</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">3</span>
                </div>
                <h3 className="font-semibold mb-2 text-foreground">النقل</h3>
                <p className="text-sm text-muted-foreground">ننقل المحتوى والصور وقاعدة البيانات</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">4</span>
                </div>
                <h3 className="font-semibold mb-2 text-foreground">الإطلاق</h3>
                <p className="text-sm text-muted-foreground">نطلق موقعك الجديد بدون توقف</p>
              </div>
            </div>
            <div className="mt-12 bg-primary/5 rounded-lg p-6 text-center">
              <p className="text-lg font-semibold text-foreground mb-2">
                المدة الزمنية: 0-24 ساعة
              </p>
              <p className="text-muted-foreground">
                حسب حجم الموقع وعدد الصفحات
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What We Migrate */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            ماذا ننقل من موقعك؟
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              'جميع الصفحات والمحتوى',
              'الصور والملفات',
              'قاعدة البيانات كاملة',
              'المدونة والمقالات',
              'المنتجات (للمتاجر)',
              'نماذج الاتصال',
              'روابط إعادة التوجيه 301',
              'تحسينات SEO',
              'بيانات العملاء'
            ].map((item, index) => (
              <div key={index} className="bg-background rounded-lg p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-primary mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-foreground">{item}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features/Benefits */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            لماذا الانتقال إلى SheenApps؟
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {data.features_ar?.map((feature, index) => (
              <div key={index} className="bg-card rounded-lg p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-primary mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-foreground">{feature}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            التكلفة والدفع
          </h2>
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              {data.payment_gateways?.map((gateway, index) => (
                <span
                  key={index}
                  className="px-6 py-3 bg-background rounded-full text-foreground font-medium"
                >
                  {gateway}
                </span>
              ))}
            </div>
            {data.price_range && (
              <div className="text-center">
                <p className="text-lg text-muted-foreground mb-4">
                  تكلفة الانتقال:{' '}
                  <span className="font-bold text-foreground">
                    {data.price_range.min} {currencySymbol}
                  </span>
                  {data.price_range.max && (
                    <>
                      {' '}- {' '}
                      <span className="font-bold text-foreground">
                        {data.price_range.max} {currencySymbol}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  حسب حجم الموقع وعدد الصفحات والوظائف المطلوبة
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            الأسئلة الشائعة حول الانتقال
          </h2>
          <div className="max-w-3xl mx-auto space-y-6">
            {data.faq_ar?.map((item, index) => (
              <details key={index} className="bg-card rounded-lg p-6 group">
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
            ابدأ الانتقال اليوم
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            انضم إلى آلاف المواقع التي انتقلت من {platformName} إلى SheenApps للحصول على مميزات أفضل وتكلفة أقل
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={builderUrl}
              className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:bg-primary/90 transition-colors"
            >
              اطلب الهجرة المجانية
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="px-8 py-4 bg-card text-foreground rounded-lg font-semibold text-lg hover:bg-card/80 transition-colors"
            >
              تحدث مع مستشار الهجرة
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
            '@type': 'HowTo',
            name: `كيفية الانتقال من ${platformName} إلى SheenApps`,
            description: data.meta_description_ar,
            step: [
              {
                '@type': 'HowToStep',
                name: 'التحليل',
                text: 'تحليل الموقع الحالي وتحديد المحتوى والوظائف'
              },
              {
                '@type': 'HowToStep',
                name: 'البناء',
                text: 'بناء الموقع الجديد بالذكاء الاصطناعي'
              },
              {
                '@type': 'HowToStep',
                name: 'النقل',
                text: 'نقل المحتوى والصور وقاعدة البيانات'
              },
              {
                '@type': 'HowToStep',
                name: 'الإطلاق',
                text: 'إطلاق الموقع الجديد بدون توقف'
              }
            ]
          })
        }}
      />
      
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
