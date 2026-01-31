import { Metadata } from 'next'
import Link from 'next/link'
import { locales, type Locale } from '@/i18n/config'
import { notFound, redirect } from 'next/navigation'
import { StructuredData } from '@/components/seo/StructuredData'
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/structured-data'

interface PageProps {
  params: Promise<{ locale: string }>
}

// Only show this page for ar-eg locale, redirect others to generic no-code page
const ALLOWED_LOCALES = ['ar-eg']

// Page content in Egyptian Arabic (Masri)
const content = {
  title: 'ابني تطبيقك في مصر | شين آبس - منصة بناء تطبيقات بدون كود',
  description: 'ابني تطبيق لشركتك في مصر من غير ما تكتب كود. ادفع بفوري أو إنستاباي أو فودافون كاش. أسعار بالجنيه المصري. دعم فني 24/7 بالعربي.',
  heroTitle: 'ابني تطبيقك',
  heroHighlight: 'في مصر',
  heroSubtitle: 'منصة بناء تطبيقات بالذكاء الاصطناعي. من غير كود. أسعار بالجنيه. دعم بالعربي.',
  ctaPrimary: 'ابدأ ببلاش',
  ctaSecondary: 'شوف الأسعار',

  // Egyptian-specific features
  features: [
    {
      title: 'ادفع بالجنيه المصري',
      description: 'أسعار بالجنيه. ادفع بفوري، إنستاباي، أو فودافون كاش.',
      icon: '💰',
    },
    {
      title: 'دعم فني بالعربي',
      description: 'فريق دعم مصري موجود 24/7 يساعدك في أي وقت.',
      icon: '🇪🇬',
    },
    {
      title: 'سريع زي الصاروخ',
      description: 'سيرفرات قريبة من مصر. تطبيقك هيكون سريع لكل العملاء.',
      icon: '🚀',
    },
    {
      title: 'بدون كود',
      description: 'اوصف فكرتك بالعربي والذكاء الاصطناعي يبنيها ليك.',
      icon: '✨',
    },
  ],

  // Egyptian pricing (using regional multiplier from config)
  pricing: {
    currency: 'ج.م',
    currencyCode: 'EGP',
    plans: [
      {
        name: 'مجاني',
        price: '0',
        features: ['تطبيق واحد', '1000 زيارة/شهر', 'دعم بالإيميل'],
      },
      {
        name: 'احترافي',
        price: '449',
        originalPrice: '899',
        discount: '50%',
        features: ['تطبيقات بلا حدود', 'زيارات بلا حدود', 'دعم فوري 24/7', 'دومين مخصص'],
        popular: true,
      },
      {
        name: 'شركات',
        price: '1,499',
        features: ['كل مميزات الاحترافي', 'دعم مخصص', 'SLA مضمون', 'تدريب الفريق'],
      },
    ],
  },

  // Payment methods available in Egypt
  paymentMethods: [
    { name: 'فوري', icon: '💳' },
    { name: 'إنستاباي', icon: '📱' },
    { name: 'فودافون كاش', icon: '📲' },
    { name: 'فيزا/ماستركارد', icon: '💳' },
  ],

  // Egyptian use cases
  useCases: [
    {
      title: 'متجر إلكتروني',
      description: 'ابني متجرك الأونلاين وابدأ بيع منتجاتك للعملاء في كل مصر.',
      example: 'زي متجر ملابس أو إلكترونيات',
    },
    {
      title: 'نظام حجوزات',
      description: 'نظام حجز للصالونات والعيادات والمطاعم.',
      example: 'زي نظام حجز لصالون تجميل',
    },
    {
      title: 'تطبيق توصيل',
      description: 'نظام توصيل متكامل لمطعمك أو محلك.',
      example: 'زي تطبيق توصيل أكل',
    },
    {
      title: 'موقع خدمات',
      description: 'صفحة تسويقية لخدماتك مع نظام حجز.',
      example: 'زي موقع لمكتب محاماة',
    },
  ],

  // Trust signals
  stats: [
    { value: '5,000+', label: 'شركة مصرية' },
    { value: '50,000+', label: 'تطبيق اتبنى' },
    { value: '99.9%', label: 'وقت تشغيل' },
    { value: '24/7', label: 'دعم فني' },
  ],

  faq: [
    {
      question: 'إزاي أدفع من مصر؟',
      answer: 'تقدر تدفع بفوري من أي محل فوري، أو بإنستاباي من البنك، أو بفودافون كاش، أو بالفيزا أو الماستركارد.',
    },
    {
      question: 'الأسعار بالجنيه المصري؟',
      answer: 'أيوه! كل الأسعار معروضة بالجنيه المصري وبتدفع بالجنيه. مفيش رسوم تحويل عملة.',
    },
    {
      question: 'فيه دعم بالعربي؟',
      answer: 'طبعاً! فريق الدعم بتاعنا مصري وبيرد عليك بالعربي 24/7. تقدر تكلمنا بالواتساب أو الشات أو الإيميل.',
    },
    {
      question: 'التطبيق هيكون سريع في مصر؟',
      answer: 'أيوه! عندنا سيرفرات في الشرق الأوسط فالتطبيق بتاعك هيكون سريع جداً للعملاء في مصر.',
    },
  ],
}

// SEO Metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params

  if (!ALLOWED_LOCALES.includes(locale)) {
    return {}
  }

  return {
    title: content.title,
    description: content.description,
    keywords: [
      'بناء تطبيق مصر',
      'منصة بناء تطبيقات مصر',
      'تطبيقات بدون كود مصر',
      'شركة تقنية مصرية',
      'متجر إلكتروني مصر',
      'نظام حجوزات مصر',
      'شين آبس مصر',
    ],
    alternates: {
      canonical: '/ar-eg/build-app-egypt',
    },
    openGraph: {
      title: content.title,
      description: content.description,
      locale: 'ar_EG',
      type: 'website',
    },
  }
}

export default async function BuildAppEgyptPage({ params }: PageProps) {
  const { locale } = await params

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  // Redirect non-Egyptian Arabic locales to the generic no-code page
  if (!ALLOWED_LOCALES.includes(locale)) {
    redirect(`/${locale}/no-code-app-builder`)
  }

  // Structured data
  const baseUrl = 'https://www.sheenapps.com'
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'الرئيسية', url: `${baseUrl}/ar-eg` },
    { name: 'ابني تطبيقك في مصر' },
  ])

  // FAQ Schema for rich snippets
  const faqSchema = generateFAQSchema(content.faq, 'ar-eg')

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 rtl">
      <StructuredData data={breadcrumbSchema} />
      <StructuredData data={faqSchema} />

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          {/* Egyptian flag badge */}
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-2 rounded-full text-sm mb-6">
            <span>🇪🇬</span>
            <span>مصمم خصيصاً لمصر</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            {content.heroTitle}{' '}
            <span className="bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text text-transparent">
              {content.heroHighlight}
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-400 max-w-3xl mx-auto mb-10">
            {content.heroSubtitle}
          </p>

          {/* Payment methods */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {content.paymentMethods.map((method, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 px-4 py-2 rounded-full text-gray-300 text-sm"
              >
                <span>{method.icon}</span>
                <span>{method.name}</span>
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/ar-eg/builder"
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/25"
            >
              {content.ctaPrimary}
            </Link>
            <Link
              href="#pricing"
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-gray-300 bg-gray-800/50 border border-gray-700 rounded-xl hover:bg-gray-800 transition-all"
            >
              {content.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-y border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {content.stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            ليه تختار شين آبس في مصر؟
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {content.features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 hover:border-green-500/50 transition-all"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            إيه اللي تقدر تبنيه؟
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            شين آبس بيخليك تبني أي نوع تطبيق لشغلك في مصر
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {content.useCases.map((useCase, index) => (
              <div
                key={index}
                className="bg-gray-800/30 border border-gray-700/50 rounded-2xl p-6"
              >
                <h3 className="text-xl font-semibold text-white mb-2">{useCase.title}</h3>
                <p className="text-gray-400 mb-3">{useCase.description}</p>
                <span className="text-sm text-green-400">{useCase.example}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            أسعار بالجنيه المصري
          </h2>
          <p className="text-gray-400 text-center mb-12">
            ادفع بفوري أو إنستاباي أو فودافون كاش
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {content.pricing.plans.map((plan, index) => (
              <div
                key={index}
                className={`relative bg-gray-800/50 border rounded-2xl p-6 ${
                  plan.popular
                    ? 'border-green-500 ring-2 ring-green-500/20'
                    : 'border-gray-700/50'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-sm px-4 py-1 rounded-full">
                    الأكثر شعبية
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-gray-400">{content.pricing.currency}/شهر</span>
                  </div>
                  {plan.discount && (
                    <div className="mt-2">
                      <span className="text-gray-500 line-through text-sm">
                        {plan.originalPrice} {content.pricing.currency}
                      </span>
                      <span className="mr-2 text-green-400 text-sm">خصم {plan.discount}</span>
                    </div>
                  )}
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300">
                      <span className="text-green-400">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/ar-eg/builder"
                  className={`block text-center py-3 rounded-xl font-medium transition-all ${
                    plan.popular
                      ? 'bg-green-600 text-white hover:bg-green-500'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  ابدأ دلوقتي
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            أسئلة شائعة
          </h2>
          <div className="space-y-6">
            {content.faq.map((item, index) => (
              <div
                key={index}
                className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6"
              >
                <h3 className="text-lg font-semibold text-white mb-3">{item.question}</h3>
                <p className="text-gray-400">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            مستعد تبني تطبيقك في مصر؟
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            انضم لآلاف الشركات المصرية اللي بتبني تطبيقات مع شين آبس
          </p>
          <Link
            href="/ar-eg/builder"
            className="inline-flex items-center justify-center px-10 py-5 text-xl font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/25"
          >
            {content.ctaPrimary} 🇪🇬
          </Link>
        </div>
      </section>
    </div>
  )
}
