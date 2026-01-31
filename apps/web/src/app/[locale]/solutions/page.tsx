'use client'

import { useEffect, useState, use } from 'react';
import Link from 'next/link'

interface IndustryCitySolution {
  kind: 'industryCity'
  slug: string
  industry_ar: string
  city_ar: string
  locale: string
  currency: string
  features_ar: string[]
  hero_image?: {
    asset: {
      url: string
    }
    alt: string
  }
}

interface TypeSolution {
  kind: 'type'
  website_type: string
  title_ar: string
  subtitle_ar: string
  locale: string
  features_ar: string[]
  hero_image?: {
    asset: {
      url: string
    }
    alt: string
  }
}

interface MigrationSolution {
  kind: 'migration'
  migration_from: string
  title_ar: string
  subtitle_ar: string
  locale: string
  features_ar: string[]
  hero_image?: {
    asset: {
      url: string
    }
    alt: string
  }
}

type Solution = IndustryCitySolution | TypeSolution | MigrationSolution

export default function SolutionsPage(
  props: {
    params: Promise<{ locale: string }>
  }
) {
  const params = use(props.params); // ✅ Next.js 15: unwrap Promise with use()
  const [locale, setLocale] = useState<string>(params.locale) // Use unwrapped value directly
  const [activeTab, setActiveTab] = useState<'type' | 'industry' | 'migration'>('type')
  const [industryCitySolutions, setIndustryCitySolutions] = useState<IndustryCitySolution[]>([])
  const [typeSolutions, setTypeSolutions] = useState<TypeSolution[]>([])
  const [migrationSolutions, setMigrationSolutions] = useState<MigrationSolution[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSolutions() {
      setLoading(true)
      try {
        // Fetch from our API route instead of directly from Sanity
        const response = await fetch('/api/solutions')
        if (!response.ok) {
          throw new Error('Failed to fetch solutions')
        }
        
        const data = await response.json()
        const { oldSolutions, newSolutions } = data

        // Combine and categorize solutions
        const allIndustryCity = [
          ...oldSolutions,
          ...newSolutions.filter((s: Solution) => s.kind === 'industryCity') as IndustryCitySolution[]
        ]
        const allType = newSolutions.filter((s: Solution) => s.kind === 'type') as TypeSolution[]
        const allMigration = newSolutions.filter((s: Solution) => s.kind === 'migration') as MigrationSolution[]

        setIndustryCitySolutions(allIndustryCity)
        setTypeSolutions(allType)
        setMigrationSolutions(allMigration)
      } catch (error) {
        console.error('Error fetching solutions:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSolutions()
  }, [])

  // Group industry-city solutions by city
  const solutionsByCity = industryCitySolutions.reduce((acc, solution) => {
    const city = solution.city_ar
    if (!acc[city]) {
      acc[city] = []
    }
    acc[city].push(solution)
    return acc
  }, {} as Record<string, IndustryCitySolution[]>)

  // Currency symbol mapping
  const currencySymbols: Record<string, string> = {
    EGP: 'ج.م',
    SAR: 'ر.س',
    AED: 'د.إ',
    USD: '$'
  }

  // Website type display names
  const websiteTypeNames: Record<string, string> = {
    'portfolio': 'موقع شخصي',
    'company-website': 'موقع شركة',
    'online-store': 'متجر إلكتروني',
    'blog-website': 'مدونة',
    'landing-page': 'صفحة هبوط',
    'news-portal': 'بوابة أخبار',
    'marketplace': 'منصة تجارية',
    'community': 'منصة مجتمع',
    'educational': 'منصة تعليمية',
    'consultant-website': 'موقع استشاري',
    'agency-website': 'موقع وكالة',
    'personal-brand': 'علامة شخصية'
  }

  // Platform display names
  const platformNames: Record<string, string> = {
    wordpress: 'WordPress',
    wix: 'Wix',
    squarespace: 'Squarespace',
    shopify: 'Shopify',
    webflow: 'Webflow'
  }

  if (loading) {
    return (
      <main dir="rtl" className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="text-center">
            <p className="text-xl text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary/10 to-background py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              حلول مخصصة لكل الأعمال
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              اختر نوع موقعك، أو انتقل من منصة أخرى، أو ابحث حسب المجال والمدينة
            </p>
          </div>
        </div>
      </section>

      {/* Tab Navigation */}
      <section className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-center">
            <div className="inline-flex gap-2">
              <button
                onClick={() => setActiveTab('type')}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'type'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-primary/10'
                }`}
              >
                حسب النوع
              </button>
              <button
                onClick={() => setActiveTab('industry')}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'industry'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-primary/10'
                }`}
              >
                حسب المجال
              </button>
              <button
                onClick={() => setActiveTab('migration')}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'migration'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-primary/10'
                }`}
              >
                الانتقال من منصة أخرى
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Content based on active tab */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          {/* Website Types */}
          {activeTab === 'type' && (
            <>
              <h2 className="text-3xl font-bold mb-8 text-foreground text-center">
                اختر نوع الموقع الذي تريد إنشاءه
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {typeSolutions.length > 0 ? (
                  typeSolutions.map((solution) => (
                    <Link
                      key={solution.website_type}
                      href={`/${solution.locale || locale}/solutions/type/${solution.website_type}`}
                      className="group bg-card rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                    >
                      {solution.hero_image?.asset?.url && (
                        <div className="aspect-video bg-muted relative overflow-hidden">
                          <img
                            src={solution.hero_image.asset.url}
                            alt={solution.hero_image.alt || solution.title_ar}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      )}
                      <div className="p-6">
                        <h3 className="text-xl font-semibold mb-2 text-foreground group-hover:text-primary transition-colors">
                          {websiteTypeNames[solution.website_type] || solution.title_ar}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          {solution.subtitle_ar}
                        </p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {solution.features_ar?.slice(0, 3).map((feature, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                        <span className="text-primary font-medium group-hover:gap-2 transition-all flex items-center gap-1">
                          عرض التفاصيل
                          <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-xl text-muted-foreground">
                      قريباً... حلول لكل أنواع المواقع
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Industry x City */}
          {activeTab === 'industry' && (
            <>
              {Object.entries(solutionsByCity).map(([city, citySolutions]) => (
                <div key={city} className="mb-16">
                  <h2 className="text-3xl font-bold mb-8 text-foreground">
                    حلول الأعمال في {city}
                  </h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {citySolutions.map((solution) => (
                      <Link
                        key={solution.slug}
                        href={`/${solution.locale || locale}/solutions/${solution.slug}`}
                        className="group bg-card rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                      >
                        {solution.hero_image?.asset?.url && (
                          <div className="aspect-video bg-muted relative overflow-hidden">
                            <img
                              src={solution.hero_image.asset.url}
                              alt={solution.hero_image.alt || `${solution.industry_ar} في ${solution.city_ar}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}
                        <div className="p-6">
                          <h3 className="text-xl font-semibold mb-2 text-foreground group-hover:text-primary transition-colors">
                            {solution.industry_ar}
                          </h3>
                          <p className="text-muted-foreground mb-4">
                            موقع مخصص في {solution.city_ar}
                          </p>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {solution.features_ar?.slice(0, 3).map((feature, index) => (
                              <span
                                key={index}
                                className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              الدفع بـ{currencySymbols[solution.currency] || solution.currency}
                            </span>
                            <span className="text-primary font-medium group-hover:gap-2 transition-all flex items-center gap-1">
                              عرض التفاصيل
                              <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {industryCitySolutions.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-xl text-muted-foreground mb-6">
                    لا توجد حلول متاحة حالياً
                  </p>
                </div>
              )}
            </>
          )}

          {/* Migrations */}
          {activeTab === 'migration' && (
            <>
              <h2 className="text-3xl font-bold mb-8 text-foreground text-center">
                انتقل من منصتك الحالية إلى SheenApps
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {migrationSolutions.length > 0 ? (
                  migrationSolutions.map((solution) => (
                    <Link
                      key={solution.migration_from}
                      href={`/${solution.locale || locale}/solutions/migrate/${solution.migration_from}`}
                      className="group bg-card rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                    >
                      {solution.hero_image?.asset?.url && (
                        <div className="aspect-video bg-muted relative overflow-hidden">
                          <img
                            src={solution.hero_image.asset.url}
                            alt={solution.hero_image.alt || solution.title_ar}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      )}
                      <div className="p-6">
                        <h3 className="text-xl font-semibold mb-2 text-foreground group-hover:text-primary transition-colors">
                          الانتقال من {platformNames[solution.migration_from]}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          {solution.subtitle_ar || 'انقل موقعك بدون توقف مع مميزات أفضل'}
                        </p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {solution.features_ar?.slice(0, 3).map((feature, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                        <span className="text-primary font-medium group-hover:gap-2 transition-all flex items-center gap-1">
                          تعرف على طريقة الانتقال
                          <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-xl text-muted-foreground">
                      قريباً... خدمات الانتقال من جميع المنصات الرئيسية
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-t from-primary/10 to-background">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            لم تجد ما تبحث عنه؟
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            المنشئ العام يدعم جميع أنواع الأعمال. صف مشروعك واحصل على موقع مخصص في دقائق.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/${locale}/builder/new`}
              className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:bg-primary/90 transition-colors"
            >
              جرّب المنشئ العام
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="px-8 py-4 bg-card text-foreground rounded-lg font-semibold text-lg hover:bg-card/80 transition-colors"
            >
              اطلب حل مخصص
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}