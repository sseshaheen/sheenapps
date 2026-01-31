import { Metadata } from 'next'
import Link from 'next/link'
import { locales, type Locale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { StructuredData } from '@/components/seo/StructuredData'
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/structured-data'
import { toOgLocale } from '@/lib/seo/locale'

interface PageProps {
  params: Promise<{ locale: string }>
}

// Locale-specific content for the money page
const pageContent: Record<string, {
  title: string
  subtitle: string
  description: string
  heroTitle: string
  heroHighlight: string
  heroSubtitle: string
  ctaPrimary: string
  ctaSecondary: string
  features: Array<{ title: string; description: string }>
  faqs: Array<{ question: string; answer: string }>
  testimonialTitle: string
  pricingTitle: string
  pricingSubtitle: string
}> = {
  en: {
    title: 'No-Code App Builder | Build Apps Without Coding',
    subtitle: 'Create powerful business applications in minutes, not months',
    description: 'Build custom apps without writing code. SheenApps AI-powered no-code platform lets you create business applications 10x faster with human expert support.',
    heroTitle: 'Build Apps',
    heroHighlight: 'Without Code',
    heroSubtitle: 'Create powerful business applications in minutes using AI. No programming skills required.',
    ctaPrimary: 'Start Building Free',
    ctaSecondary: 'See How It Works',
    features: [
      { title: 'AI-Powered', description: 'Describe your app in plain language and watch it come to life' },
      { title: 'No Code Required', description: 'Build complex applications without writing a single line of code' },
      { title: 'Human Expert Support', description: 'Real developers available 24/7 to help you succeed' },
      { title: 'Launch in Minutes', description: 'Go from idea to live app in less than 5 minutes' },
    ],
    faqs: [
      { question: 'What is a no-code app builder?', answer: 'A no-code app builder is a platform that allows you to create software applications without writing code. You design your app visually and the platform generates the code automatically.' },
      { question: 'How does SheenApps work?', answer: 'Simply describe your app idea in plain language. Our AI analyzes your requirements and builds your application automatically. You can then customize it visually and launch immediately.' },
      { question: 'Do I need technical skills?', answer: 'No technical skills are required. If you can describe what you want, you can build an app with SheenApps. Plus, our human experts are available 24/7 to help.' },
      { question: 'How much does it cost?', answer: 'SheenApps offers a free tier to get started. Paid plans start at $29/month with no hidden fees and include human expert support.' },
    ],
    testimonialTitle: 'Trusted by Thousands',
    pricingTitle: 'Simple Pricing',
    pricingSubtitle: 'Start free, upgrade as you grow',
  },
  ar: {
    title: 'بناء تطبيق بدون كود | منصة تطوير تطبيقات بالذكاء الاصطناعي',
    subtitle: 'أنشئ تطبيقات أعمال قوية في دقائق، وليس أشهر',
    description: 'ابنِ تطبيقات مخصصة بدون كتابة كود. منصة شين آبس المدعومة بالذكاء الاصطناعي تتيح لك إنشاء تطبيقات أعمال أسرع 10 مرات مع دعم خبراء بشريين.',
    heroTitle: 'ابنِ تطبيقات',
    heroHighlight: 'بدون كود',
    heroSubtitle: 'أنشئ تطبيقات أعمال قوية في دقائق باستخدام الذكاء الاصطناعي. لا تحتاج مهارات برمجة.',
    ctaPrimary: 'ابدأ البناء مجاناً',
    ctaSecondary: 'شاهد كيف يعمل',
    features: [
      { title: 'مدعوم بالذكاء الاصطناعي', description: 'صف تطبيقك بلغة بسيطة وشاهده يتحول إلى واقع' },
      { title: 'بدون كود', description: 'ابنِ تطبيقات معقدة بدون كتابة سطر برمجي واحد' },
      { title: 'دعم خبراء بشريين', description: 'مطورون حقيقيون متاحون 24/7 لمساعدتك على النجاح' },
      { title: 'إطلاق في دقائق', description: 'من الفكرة إلى تطبيق حي في أقل من 5 دقائق' },
    ],
    faqs: [
      { question: 'ما هو منشئ التطبيقات بدون كود؟', answer: 'منشئ التطبيقات بدون كود هو منصة تتيح لك إنشاء تطبيقات برمجية دون كتابة كود. تصمم تطبيقك بصرياً والمنصة تولد الكود تلقائياً.' },
      { question: 'كيف يعمل شين آبس؟', answer: 'ببساطة صف فكرة تطبيقك بلغة بسيطة. يحلل الذكاء الاصطناعي متطلباتك ويبني تطبيقك تلقائياً. يمكنك بعد ذلك تخصيصه بصرياً وإطلاقه فوراً.' },
      { question: 'هل أحتاج مهارات تقنية؟', answer: 'لا تحتاج أي مهارات تقنية. إذا كنت تستطيع وصف ما تريد، يمكنك بناء تطبيق مع شين آبس. بالإضافة إلى ذلك، خبراؤنا البشريون متاحون 24/7 للمساعدة.' },
      { question: 'كم تبلغ التكلفة؟', answer: 'شين آبس يقدم باقة مجانية للبدء. الباقات المدفوعة تبدأ من $29/شهر بدون رسوم مخفية وتشمل دعم خبراء بشريين.' },
    ],
    testimonialTitle: 'موثوق من الآلاف',
    pricingTitle: 'أسعار بسيطة',
    pricingSubtitle: 'ابدأ مجاناً، ترقى مع نموك',
  },
  'ar-eg': {
    title: 'بناء تطبيق بدون كود | منصة تطوير تطبيقات بالذكاء الاصطناعي في مصر',
    subtitle: 'اعمل تطبيقات شغل قوية في دقايق، مش شهور',
    description: 'ابني تطبيقات مخصصة من غير ما تكتب كود. منصة شين آبس بالذكاء الاصطناعي بتخليك تعمل تطبيقات أسرع 10 مرات مع دعم خبراء حقيقيين.',
    heroTitle: 'ابني تطبيقات',
    heroHighlight: 'من غير كود',
    heroSubtitle: 'اعمل تطبيقات شغل قوية في دقايق باستخدام الذكاء الاصطناعي. مش محتاج مهارات برمجة.',
    ctaPrimary: 'ابدأ ببلاش',
    ctaSecondary: 'شوف إزاي بيشتغل',
    features: [
      { title: 'بالذكاء الاصطناعي', description: 'اوصف تطبيقك بكلام عادي وشوفه بيتحول لحقيقة' },
      { title: 'من غير كود', description: 'ابني تطبيقات معقدة من غير ما تكتب سطر كود واحد' },
      { title: 'دعم خبراء حقيقيين', description: 'مطورين حقيقيين موجودين 24/7 يساعدوك تنجح' },
      { title: 'إطلاق في دقايق', description: 'من الفكرة لتطبيق شغال في أقل من 5 دقايق' },
    ],
    faqs: [
      { question: 'إيه هو منشئ التطبيقات من غير كود؟', answer: 'منشئ التطبيقات من غير كود هو منصة بتخليك تعمل تطبيقات من غير ما تكتب كود. بتصمم تطبيقك بصرياً والمنصة بتولد الكود أوتوماتيك.' },
      { question: 'إزاي شين آبس بيشتغل؟', answer: 'ببساطة اوصف فكرة تطبيقك بكلام عادي. الذكاء الاصطناعي بيحلل متطلباتك ويبني تطبيقك أوتوماتيك. بعد كده تقدر تخصصه وتطلقه فوراً.' },
      { question: 'محتاج مهارات تقنية؟', answer: 'لأ مش محتاج أي مهارات تقنية. لو تقدر توصف اللي عايزه، تقدر تبني تطبيق مع شين آبس. وكمان خبراءنا موجودين 24/7 يساعدوك.' },
      { question: 'التكلفة قد إيه؟', answer: 'شين آبس عنده باقة ببلاش للبداية. الباقات المدفوعة بتبدأ من $29/شهر من غير مصاريف مخفية وفيها دعم خبراء حقيقيين.' },
    ],
    testimonialTitle: 'موثوق من الآلاف',
    pricingTitle: 'أسعار بسيطة',
    pricingSubtitle: 'ابدأ ببلاش، كبر مع نموك',
  },
  'ar-sa': {
    title: 'بناء تطبيق بدون كود | منصة تطوير تطبيقات بالذكاء الاصطناعي في السعودية',
    subtitle: 'أنشئ تطبيقات أعمال قوية في دقائق، وليس أشهر',
    description: 'ابنِ تطبيقات مخصصة بدون كتابة كود. منصة شين آبس المدعومة بالذكاء الاصطناعي تتيح لك إنشاء تطبيقات أعمال أسرع 10 مرات مع دعم خبراء بشريين.',
    heroTitle: 'ابنِ تطبيقات',
    heroHighlight: 'بدون كود',
    heroSubtitle: 'أنشئ تطبيقات أعمال قوية في دقائق باستخدام الذكاء الاصطناعي. لا تحتاج مهارات برمجة.',
    ctaPrimary: 'ابدأ البناء مجاناً',
    ctaSecondary: 'شاهد كيف يعمل',
    features: [
      { title: 'مدعوم بالذكاء الاصطناعي', description: 'صف تطبيقك بلغة بسيطة وشاهده يتحول إلى واقع' },
      { title: 'بدون كود', description: 'ابنِ تطبيقات معقدة بدون كتابة سطر برمجي واحد' },
      { title: 'دعم خبراء بشريين', description: 'مطورون حقيقيون متاحون 24/7 لمساعدتك على النجاح' },
      { title: 'إطلاق في دقائق', description: 'من الفكرة إلى تطبيق حي في أقل من 5 دقائق' },
    ],
    faqs: [
      { question: 'ما هو منشئ التطبيقات بدون كود؟', answer: 'منشئ التطبيقات بدون كود هو منصة تتيح لك إنشاء تطبيقات برمجية دون كتابة كود. تصمم تطبيقك بصرياً والمنصة تولد الكود تلقائياً.' },
      { question: 'كيف يعمل شين آبس؟', answer: 'ببساطة صف فكرة تطبيقك بلغة بسيطة. يحلل الذكاء الاصطناعي متطلباتك ويبني تطبيقك تلقائياً. يمكنك بعد ذلك تخصيصه بصرياً وإطلاقه فوراً.' },
      { question: 'هل أحتاج مهارات تقنية؟', answer: 'لا تحتاج أي مهارات تقنية. إذا كنت تستطيع وصف ما تريد، يمكنك بناء تطبيق مع شين آبس. بالإضافة إلى ذلك، خبراؤنا البشريون متاحون 24/7 للمساعدة.' },
      { question: 'كم تبلغ التكلفة؟', answer: 'شين آبس يقدم باقة مجانية للبدء. الباقات المدفوعة تبدأ من 109 ر.س/شهر بدون رسوم مخفية وتشمل دعم خبراء بشريين.' },
    ],
    testimonialTitle: 'موثوق من الآلاف',
    pricingTitle: 'أسعار بسيطة',
    pricingSubtitle: 'ابدأ مجاناً، ترقى مع نموك',
  },
  'ar-ae': {
    title: 'بناء تطبيق بدون كود | منصة تطوير تطبيقات بالذكاء الاصطناعي في الإمارات',
    subtitle: 'أنشئ تطبيقات أعمال قوية في دقائق، وليس أشهر',
    description: 'ابنِ تطبيقات مخصصة بدون كتابة كود. منصة شين آبس المدعومة بالذكاء الاصطناعي تتيح لك إنشاء تطبيقات أعمال أسرع 10 مرات مع دعم خبراء بشريين.',
    heroTitle: 'ابنِ تطبيقات',
    heroHighlight: 'بدون كود',
    heroSubtitle: 'أنشئ تطبيقات أعمال قوية في دقائق باستخدام الذكاء الاصطناعي. لا تحتاج مهارات برمجة.',
    ctaPrimary: 'ابدأ البناء مجاناً',
    ctaSecondary: 'شاهد كيف يعمل',
    features: [
      { title: 'مدعوم بالذكاء الاصطناعي', description: 'صف تطبيقك بلغة بسيطة وشاهده يتحول إلى واقع' },
      { title: 'بدون كود', description: 'ابنِ تطبيقات معقدة بدون كتابة سطر برمجي واحد' },
      { title: 'دعم خبراء بشريين', description: 'مطورون حقيقيون متاحون 24/7 لمساعدتك على النجاح' },
      { title: 'إطلاق في دقائق', description: 'من الفكرة إلى تطبيق حي في أقل من 5 دقائق' },
    ],
    faqs: [
      { question: 'ما هو منشئ التطبيقات بدون كود؟', answer: 'منشئ التطبيقات بدون كود هو منصة تتيح لك إنشاء تطبيقات برمجية دون كتابة كود. تصمم تطبيقك بصرياً والمنصة تولد الكود تلقائياً.' },
      { question: 'كيف يعمل شين آبس؟', answer: 'ببساطة صف فكرة تطبيقك بلغة بسيطة. يحلل الذكاء الاصطناعي متطلباتك ويبني تطبيقك تلقائياً. يمكنك بعد ذلك تخصيصه بصرياً وإطلاقه فوراً.' },
      { question: 'هل أحتاج مهارات تقنية؟', answer: 'لا تحتاج أي مهارات تقنية. إذا كنت تستطيع وصف ما تريد، يمكنك بناء تطبيق مع شين آبس. بالإضافة إلى ذلك، خبراؤنا البشريون متاحون 24/7 للمساعدة.' },
      { question: 'كم تبلغ التكلفة؟', answer: 'شين آبس يقدم باقة مجانية للبدء. الباقات المدفوعة تبدأ من 107 د.إ/شهر بدون رسوم مخفية وتشمل دعم خبراء بشريين.' },
    ],
    testimonialTitle: 'موثوق من الآلاف',
    pricingTitle: 'أسعار بسيطة',
    pricingSubtitle: 'ابدأ مجاناً، ترقى مع نموك',
  },
}

// SEO Metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  const content = pageContent[locale] || pageContent.en
  const isArabic = locale.startsWith('ar')

  // Target keywords for this money page
  const keywords: Record<string, string[]> = {
    en: ['no-code app builder', 'build app without coding', 'AI app builder', 'no-code platform', 'business app creator'],
    ar: ['بناء تطبيق بدون كود', 'منشئ تطبيقات بدون برمجة', 'تطبيقات ذكاء اصطناعي', 'منصة بدون كود', 'بناء تطبيقات أعمال'],
    'ar-eg': ['بناء تطبيق بدون كود مصر', 'منشئ تطبيقات بدون برمجة', 'تطبيقات ذكاء اصطناعي', 'منصة بدون كود'],
    'ar-sa': ['بناء تطبيق بدون كود السعودية', 'منشئ تطبيقات بدون برمجة', 'تطبيقات ذكاء اصطناعي', 'منصة بدون كود'],
    'ar-ae': ['بناء تطبيق بدون كود الإمارات', 'منشئ تطبيقات بدون برمجة', 'تطبيقات ذكاء اصطناعي', 'منصة بدون كود'],
  }

  return {
    title: content.title,
    description: content.description,
    keywords: keywords[locale] || keywords.en,
    alternates: {
      canonical: locale === 'en' ? '/no-code-app-builder' : `/${locale}/no-code-app-builder`,
    },
    openGraph: {
      title: content.title,
      description: content.description,
      type: 'website',
      locale: toOgLocale(locale),
    },
  }
}

export default async function NoCodeAppBuilderPage({ params }: PageProps) {
  const { locale } = await params

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  const content = pageContent[locale] || pageContent.en
  const isRTL = ['ar', 'ar-eg', 'ar-sa', 'ar-ae'].includes(locale)

  // Structured data for this page
  const baseUrl = 'https://www.sheenapps.com'
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: isRTL ? 'الرئيسية' : 'Home', url: `${baseUrl}/${locale === 'en' ? '' : locale}` },
    { name: isRTL ? 'بناء تطبيق بدون كود' : 'No-Code App Builder' },
  ])

  const faqSchema = generateFAQSchema(content.faqs, locale)

  return (
    <div className={`min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 ${isRTL ? 'rtl' : 'ltr'}`}>
      <StructuredData data={breadcrumbSchema} />
      <StructuredData data={faqSchema} />

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            {content.heroTitle}{' '}
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              {content.heroHighlight}
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-400 max-w-3xl mx-auto mb-10">
            {content.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/${locale === 'en' ? '' : locale + '/'}builder`}
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/25"
            >
              {content.ctaPrimary}
            </Link>
            <Link
              href={`/${locale === 'en' ? '' : locale + '/'}#how-it-works`}
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-gray-300 bg-gray-800/50 border border-gray-700 rounded-xl hover:bg-gray-800 transition-all"
            >
              {content.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {content.features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 hover:border-indigo-500/50 transition-all"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            {isRTL ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
          </h2>
          <div className="space-y-6">
            {content.faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6"
              >
                <h3 className="text-lg font-semibold text-white mb-3">{faq.question}</h3>
                <p className="text-gray-400">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            {isRTL ? 'مستعد لبناء تطبيقك؟' : 'Ready to Build Your App?'}
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            {isRTL
              ? 'انضم لآلاف الشركات التي تبني تطبيقات بدون كود مع شين آبس'
              : 'Join thousands of businesses building apps without code with SheenApps'}
          </p>
          <Link
            href={`/${locale === 'en' ? '' : locale + '/'}builder`}
            className="inline-flex items-center justify-center px-10 py-5 text-xl font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/25"
          >
            {content.ctaPrimary}
          </Link>
        </div>
      </section>
    </div>
  )
}
