import { Metadata } from 'next'
import Link from 'next/link'
import { locales, type Locale } from '@/i18n/config'
import { notFound, redirect } from 'next/navigation'
import { StructuredData } from '@/components/seo/StructuredData'
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/structured-data'

interface PageProps {
  params: Promise<{ locale: string }>
}

// Only show this page for ar-ae locale, redirect others to generic no-code page
const ALLOWED_LOCALES = ['ar-ae']

// Page content in Modern Standard Arabic for UAE audience
const content = {
  title: 'ابنِ تطبيقك في الإمارات | شين آبس - منصة بناء تطبيقات بدون كود',
  description: 'ابنِ تطبيقات لمشروعك في الإمارات بدون كتابة كود. ادفع بـ Apple Pay أو Samsung Pay. أسعار بالدرهم الإماراتي. دعم فني 24/7 بالعربي.',
  heroTitle: 'ابنِ تطبيقك',
  heroHighlight: 'في الإمارات',
  heroSubtitle: 'منصة بناء تطبيقات بالذكاء الاصطناعي. بدون كود. أسعار بالدرهم. دعم بالعربي.',
  ctaPrimary: 'ابدأ البناء مجاناً',
  ctaSecondary: 'شاهد الأسعار',

  // UAE-specific features
  features: [
    {
      title: 'ادفع بالدرهم الإماراتي',
      description: 'أسعار بالدرهم. ادفع بـ Apple Pay أو Samsung Pay أو البطاقات.',
      icon: '💰',
    },
    {
      title: 'مركز الأعمال',
      description: 'دبي وأبوظبي مراكز الأعمال في المنطقة. تطبيقك يصل للعالم.',
      icon: '🇦🇪',
    },
    {
      title: 'سرعة فائقة',
      description: 'سيرفرات في المنطقة. تطبيقك سريع لجميع عملائك في الإمارات.',
      icon: '🚀',
    },
    {
      title: 'بدون كود',
      description: 'صف فكرتك بالعربي والذكاء الاصطناعي يبنيها لك.',
      icon: '✨',
    },
  ],

  // UAE pricing (includes VAT consideration)
  pricing: {
    currency: 'د.إ',
    currencyCode: 'AED',
    vatNote: 'الأسعار شاملة ضريبة القيمة المضافة',
    plans: [
      {
        name: 'مجاني',
        price: '0',
        features: ['تطبيق واحد', '1000 زيارة/شهر', 'دعم بالبريد'],
      },
      {
        name: 'احترافي',
        price: '107',
        features: ['تطبيقات بلا حدود', 'زيارات بلا حدود', 'دعم فوري 24/7', 'دومين مخصص'],
        popular: true,
      },
      {
        name: 'مؤسسات',
        price: '399',
        features: ['كل مميزات الاحترافي', 'دعم مخصص', 'SLA مضمون', 'تدريب الفريق'],
      },
    ],
  },

  // Payment methods available in UAE
  paymentMethods: [
    { name: 'Apple Pay', icon: '🍎' },
    { name: 'Samsung Pay', icon: '📱' },
    { name: 'فيزا/ماستركارد', icon: '💳' },
    { name: 'تحويل بنكي', icon: '🏦' },
  ],

  // UAE use cases
  useCases: [
    {
      title: 'متجر إلكتروني',
      description: 'ابنِ متجرك الإلكتروني وابدأ البيع لعملائك في الإمارات والخليج.',
      example: 'مثل متجر مجوهرات أو عطور',
    },
    {
      title: 'نظام حجوزات',
      description: 'نظام حجز للصالونات والعيادات والمطاعم.',
      example: 'مثل نظام حجز لسبا فاخر',
    },
    {
      title: 'تطبيق توصيل',
      description: 'نظام توصيل متكامل لمطعمك أو متجرك.',
      example: 'مثل تطبيق توصيل طلبات',
    },
    {
      title: 'منصة خدمات',
      description: 'صفحة تسويقية لخدماتك مع نظام حجز.',
      example: 'مثل منصة استشارات عقارية',
    },
  ],

  // Trust signals
  stats: [
    { value: '2,500+', label: 'شركة إماراتية' },
    { value: '25,000+', label: 'تطبيق تم بناؤه' },
    { value: '99.9%', label: 'وقت التشغيل' },
    { value: '24/7', label: 'دعم فني' },
  ],

  faq: [
    {
      question: 'كيف أدفع من الإمارات؟',
      answer: 'يمكنك الدفع بـ Apple Pay أو Samsung Pay أو الفيزا أو الماستركارد أو التحويل البنكي. جميع طرق الدفع في الإمارات مدعومة.',
    },
    {
      question: 'الأسعار بالدرهم الإماراتي؟',
      answer: 'نعم! جميع الأسعار معروضة بالدرهم الإماراتي وتدفع بالدرهم. الأسعار شاملة ضريبة القيمة المضافة.',
    },
    {
      question: 'هل يوجد دعم بالعربي؟',
      answer: 'بالتأكيد! فريق الدعم لدينا يتحدث العربي ومتاح 24/7. يمكنك التواصل معنا بالواتساب أو الشات أو البريد.',
    },
    {
      question: 'هل التطبيق سيكون سريعاً في الإمارات؟',
      answer: 'نعم! لدينا سيرفرات في منطقة الشرق الأوسط فتطبيقك سيكون سريعاً جداً لجميع عملائك في الإمارات.',
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
      'بناء تطبيق الإمارات',
      'منصة بناء تطبيقات الإمارات',
      'تطبيقات بدون كود الإمارات',
      'شركة تقنية إماراتية',
      'متجر إلكتروني الإمارات',
      'نظام حجوزات الإمارات',
      'شين آبس الإمارات',
      'تطبيقات دبي',
      'تطبيقات أبوظبي',
    ],
    alternates: {
      canonical: '/ar-ae/build-app-uae',
    },
    openGraph: {
      title: content.title,
      description: content.description,
      locale: 'ar_AE',
      type: 'website',
    },
  }
}

export default async function BuildAppUAEPage({ params }: PageProps) {
  const { locale } = await params

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  // Redirect non-UAE Arabic locales to the generic no-code page
  if (!ALLOWED_LOCALES.includes(locale)) {
    redirect(`/${locale}/no-code-app-builder`)
  }

  // Structured data
  const baseUrl = 'https://www.sheenapps.com'
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'الرئيسية', url: `${baseUrl}/ar-ae` },
    { name: 'ابنِ تطبيقك في الإمارات' },
  ])

  // FAQ Schema for rich snippets
  const faqSchema = generateFAQSchema(content.faq, 'ar-ae')

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 rtl">
      <StructuredData data={breadcrumbSchema} />
      <StructuredData data={faqSchema} />

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          {/* UAE flag badge */}
          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-full text-sm mb-6">
            <span>🇦🇪</span>
            <span>مصمم خصيصاً للإمارات</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            {content.heroTitle}{' '}
            <span className="bg-gradient-to-r from-red-500 to-green-500 bg-clip-text text-transparent">
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
              href="/ar-ae/builder"
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-red-600 to-green-600 rounded-xl hover:from-red-500 hover:to-green-500 transition-all shadow-lg shadow-red-500/25"
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
            لماذا شين آبس في الإمارات؟
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {content.features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 hover:border-red-500/50 transition-all"
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
            ماذا يمكنك بناؤه؟
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            شين آبس يتيح لك بناء أي نوع من التطبيقات لمشروعك في الإمارات
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {content.useCases.map((useCase, index) => (
              <div
                key={index}
                className="bg-gray-800/30 border border-gray-700/50 rounded-2xl p-6"
              >
                <h3 className="text-xl font-semibold text-white mb-2">{useCase.title}</h3>
                <p className="text-gray-400 mb-3">{useCase.description}</p>
                <span className="text-sm text-red-400">{useCase.example}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            أسعار بالدرهم الإماراتي
          </h2>
          <p className="text-gray-400 text-center mb-2">
            ادفع بـ Apple Pay أو Samsung Pay أو البطاقات
          </p>
          <p className="text-gray-500 text-center text-sm mb-12">
            {content.pricing.vatNote}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {content.pricing.plans.map((plan, index) => (
              <div
                key={index}
                className={`relative bg-gray-800/50 border rounded-2xl p-6 ${
                  plan.popular
                    ? 'border-red-500 ring-2 ring-red-500/20'
                    : 'border-gray-700/50'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-sm px-4 py-1 rounded-full">
                    الأكثر شعبية
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-gray-400">{content.pricing.currency}/شهر</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300">
                      <span className="text-red-400">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/ar-ae/builder"
                  className={`block text-center py-3 rounded-xl font-medium transition-all ${
                    plan.popular
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  ابدأ الآن
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
            الأسئلة الشائعة
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
            مستعد لبناء تطبيقك في الإمارات؟
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            انضم لآلاف الشركات الإماراتية التي تبني تطبيقات مع شين آبس
          </p>
          <Link
            href="/ar-ae/builder"
            className="inline-flex items-center justify-center px-10 py-5 text-xl font-medium text-white bg-gradient-to-r from-red-600 to-green-600 rounded-xl hover:from-red-500 hover:to-green-500 transition-all shadow-lg shadow-red-500/25"
          >
            {content.ctaPrimary} 🇦🇪
          </Link>
        </div>
      </section>
    </div>
  )
}
