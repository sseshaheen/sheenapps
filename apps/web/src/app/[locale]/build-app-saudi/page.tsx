import { Metadata } from 'next'
import Link from 'next/link'
import { locales, type Locale } from '@/i18n/config'
import { notFound, redirect } from 'next/navigation'
import { StructuredData } from '@/components/seo/StructuredData'
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/structured-data'

interface PageProps {
  params: Promise<{ locale: string }>
}

// Only show this page for ar-sa locale, redirect others to generic no-code page
const ALLOWED_LOCALES = ['ar-sa']

// Page content in Modern Standard Arabic for Saudi audience
const content = {
  title: 'ابنِ تطبيقك في السعودية | شين آبس - منصة بناء تطبيقات بدون كود',
  description: 'ابنِ تطبيقات لمشروعك في السعودية بدون كتابة كود. ادفع بمدى أو Apple Pay. أسعار بالريال السعودي. دعم فني 24/7 بالعربي. متوافق مع رؤية 2030.',
  heroTitle: 'ابنِ تطبيقك',
  heroHighlight: 'في السعودية',
  heroSubtitle: 'منصة بناء تطبيقات بالذكاء الاصطناعي. بدون كود. أسعار بالريال. دعم بالعربي.',
  ctaPrimary: 'ابدأ البناء مجاناً',
  ctaSecondary: 'شاهد الأسعار',

  // Saudi-specific features
  features: [
    {
      title: 'ادفع بالريال السعودي',
      description: 'أسعار بالريال. ادفع بمدى أو Apple Pay أو STC Pay.',
      icon: '💰',
    },
    {
      title: 'متوافق مع رؤية 2030',
      description: 'ادعم التحول الرقمي في المملكة. تطبيقات حديثة لمستقبل رقمي.',
      icon: '🇸🇦',
    },
    {
      title: 'سرعة فائقة',
      description: 'سيرفرات في المنطقة. تطبيقك سريع لجميع عملائك في المملكة.',
      icon: '🚀',
    },
    {
      title: 'بدون كود',
      description: 'صف فكرتك بالعربي والذكاء الاصطناعي يبنيها لك.',
      icon: '✨',
    },
  ],

  // Saudi pricing
  pricing: {
    currency: 'ر.س',
    currencyCode: 'SAR',
    plans: [
      {
        name: 'مجاني',
        price: '0',
        features: ['تطبيق واحد', '1000 زيارة/شهر', 'دعم بالبريد'],
      },
      {
        name: 'احترافي',
        price: '109',
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

  // Payment methods available in Saudi Arabia
  paymentMethods: [
    { name: 'مدى', icon: '💳' },
    { name: 'Apple Pay', icon: '🍎' },
    { name: 'STC Pay', icon: '📱' },
    { name: 'فيزا/ماستركارد', icon: '💳' },
  ],

  // Saudi use cases
  useCases: [
    {
      title: 'متجر إلكتروني',
      description: 'ابنِ متجرك الإلكتروني وابدأ البيع لعملائك في جميع أنحاء المملكة.',
      example: 'مثل متجر عطور أو ملابس',
    },
    {
      title: 'نظام حجوزات',
      description: 'نظام حجز للصالونات والعيادات والمطاعم.',
      example: 'مثل نظام حجز لصالون نسائي',
    },
    {
      title: 'تطبيق توصيل',
      description: 'نظام توصيل متكامل لمطعمك أو متجرك.',
      example: 'مثل تطبيق توصيل طلبات',
    },
    {
      title: 'منصة خدمات',
      description: 'صفحة تسويقية لخدماتك مع نظام حجز.',
      example: 'مثل منصة استشارات قانونية',
    },
  ],

  // Trust signals
  stats: [
    { value: '3,000+', label: 'شركة سعودية' },
    { value: '30,000+', label: 'تطبيق تم بناؤه' },
    { value: '99.9%', label: 'وقت التشغيل' },
    { value: '24/7', label: 'دعم فني' },
  ],

  faq: [
    {
      question: 'كيف أدفع من السعودية؟',
      answer: 'يمكنك الدفع ببطاقة مدى أو Apple Pay أو STC Pay أو الفيزا أو الماستركارد. جميع طرق الدفع السعودية مدعومة.',
    },
    {
      question: 'الأسعار بالريال السعودي؟',
      answer: 'نعم! جميع الأسعار معروضة بالريال السعودي وتدفع بالريال. لا توجد رسوم تحويل عملة.',
    },
    {
      question: 'هل يوجد دعم بالعربي؟',
      answer: 'بالتأكيد! فريق الدعم لدينا يتحدث العربي ومتاح 24/7. يمكنك التواصل معنا بالواتساب أو الشات أو البريد.',
    },
    {
      question: 'هل التطبيق سيكون سريعاً في السعودية؟',
      answer: 'نعم! لدينا سيرفرات في منطقة الشرق الأوسط فتطبيقك سيكون سريعاً جداً لجميع عملائك في المملكة.',
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
      'بناء تطبيق السعودية',
      'منصة بناء تطبيقات السعودية',
      'تطبيقات بدون كود السعودية',
      'شركة تقنية سعودية',
      'متجر إلكتروني السعودية',
      'نظام حجوزات السعودية',
      'شين آبس السعودية',
      'رؤية 2030 تطبيقات',
    ],
    alternates: {
      canonical: '/ar-sa/build-app-saudi',
    },
    openGraph: {
      title: content.title,
      description: content.description,
      locale: 'ar_SA',
      type: 'website',
    },
  }
}

export default async function BuildAppSaudiPage({ params }: PageProps) {
  const { locale } = await params

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  // Redirect non-Saudi Arabic locales to the generic no-code page
  if (!ALLOWED_LOCALES.includes(locale)) {
    redirect(`/${locale}/no-code-app-builder`)
  }

  // Structured data
  const baseUrl = 'https://www.sheenapps.com'
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'الرئيسية', url: `${baseUrl}/ar-sa` },
    { name: 'ابنِ تطبيقك في السعودية' },
  ])

  // FAQ Schema for rich snippets
  const faqSchema = generateFAQSchema(content.faq, 'ar-sa')

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 rtl">
      <StructuredData data={breadcrumbSchema} />
      <StructuredData data={faqSchema} />

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          {/* Saudi flag badge */}
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-2 rounded-full text-sm mb-6">
            <span>🇸🇦</span>
            <span>مصمم خصيصاً للسعودية</span>
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
              href="/ar-sa/builder"
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
            لماذا شين آبس في السعودية؟
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
            ماذا يمكنك بناؤه؟
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            شين آبس يتيح لك بناء أي نوع من التطبيقات لمشروعك في السعودية
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
            أسعار بالريال السعودي
          </h2>
          <p className="text-gray-400 text-center mb-12">
            ادفع بمدى أو Apple Pay أو STC Pay
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
                  href="/ar-sa/builder"
                  className={`block text-center py-3 rounded-xl font-medium transition-all ${
                    plan.popular
                      ? 'bg-green-600 text-white hover:bg-green-500'
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
            مستعد لبناء تطبيقك في السعودية؟
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            انضم لآلاف الشركات السعودية التي تبني تطبيقات مع شين آبس
          </p>
          <Link
            href="/ar-sa/builder"
            className="inline-flex items-center justify-center px-10 py-5 text-xl font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/25"
          >
            {content.ctaPrimary} 🇸🇦
          </Link>
        </div>
      </section>
    </div>
  )
}
