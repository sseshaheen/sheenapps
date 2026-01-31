'use client'

import Link from 'next/link'

interface InternalLink {
  href: string
  label: string
  description?: string
}

interface ArabicInternalLinksProps {
  locale: string
  /** Link to relevant solution page */
  solutionLink?: InternalLink
  /** Link to regional landing page (Egypt, Saudi, UAE) */
  regionalLink?: InternalLink
  /** Link to conversion page (pricing or builder) */
  conversionLink?: InternalLink
  /** Custom title for the section */
  title?: string
}

/**
 * Internal Linking Component for Arabic SEO
 *
 * Every Arabic blog post should include this component with:
 * - 1 solution page link
 * - 1 regional landing page link
 * - 1 conversion page link (pricing/builder)
 *
 * This follows the internal linking rules in ARABIC_SEO_PLAN.md
 */
export function ArabicInternalLinks({
  locale,
  solutionLink,
  regionalLink,
  conversionLink,
  title,
}: ArabicInternalLinksProps) {
  const isRTL = ['ar', 'ar-eg', 'ar-sa', 'ar-ae'].includes(locale)

  // Default labels based on locale
  const defaultLabels = {
    title: isRTL ? 'روابط ذات صلة' : 'Related Links',
    solutions: isRTL ? 'حلول' : 'Solutions',
    regional: isRTL ? 'في منطقتك' : 'In Your Region',
    getStarted: isRTL ? 'ابدأ الآن' : 'Get Started',
  }

  // Get default regional link based on locale
  const getDefaultRegionalLink = (): InternalLink | undefined => {
    switch (locale) {
      case 'ar-eg':
        return {
          href: '/ar-eg/build-app-egypt',
          label: 'ابني تطبيقك في مصر',
          description: 'أسعار بالجنيه ودفع بفوري',
        }
      case 'ar-sa':
        return {
          href: '/ar-sa/build-app-saudi',
          label: 'ابني تطبيقك في السعودية',
          description: 'أسعار بالريال ودفع بمدى',
        }
      case 'ar-ae':
        return {
          href: '/ar-ae/build-app-uae',
          label: 'ابني تطبيقك في الإمارات',
          description: 'أسعار بالدرهم ودفع بـ Apple Pay',
        }
      case 'ar':
        return {
          href: '/ar/no-code-app-builder',
          label: 'ابني تطبيقك بدون كود',
          description: 'منصة بناء تطبيقات بالذكاء الاصطناعي',
        }
      default:
        return undefined
    }
  }

  // Default conversion link
  const defaultConversionLink: InternalLink = {
    href: `/${locale === 'en' ? '' : locale + '/'}pricing`,
    label: isRTL ? 'شاهد الأسعار' : 'View Pricing',
    description: isRTL ? 'ابدأ مجاناً اليوم' : 'Start free today',
  }

  const links = [
    solutionLink,
    regionalLink || getDefaultRegionalLink(),
    conversionLink || defaultConversionLink,
  ].filter(Boolean) as InternalLink[]

  if (links.length === 0) return null

  return (
    <div
      className={`my-8 p-6 bg-gray-800/30 border border-gray-700/50 rounded-2xl ${isRTL ? 'rtl' : 'ltr'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <h3 className="text-lg font-semibold text-white mb-4">
        {title || defaultLabels.title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map((link, index) => (
          <Link
            key={index}
            href={link.href}
            className="group block p-4 bg-gray-800/50 border border-gray-700/50 rounded-xl hover:border-indigo-500/50 transition-all"
          >
            <span className="block text-white font-medium group-hover:text-indigo-400 transition-colors">
              {link.label}
            </span>
            {link.description && (
              <span className="block text-sm text-gray-400 mt-1">
                {link.description}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

/**
 * Preset internal link configurations for common Arabic content topics
 */
export const arabicInternalLinkPresets = {
  ecommerce: {
    solutionLink: {
      href: '/ar/solutions',
      label: 'حلول المتاجر الإلكترونية',
      description: 'ابني متجرك الإلكتروني',
    },
  },
  booking: {
    solutionLink: {
      href: '/ar/solutions',
      label: 'أنظمة الحجز',
      description: 'نظام حجز لمشروعك',
    },
  },
  delivery: {
    solutionLink: {
      href: '/ar/solutions',
      label: 'تطبيقات التوصيل',
      description: 'نظام توصيل متكامل',
    },
  },
  noCode: {
    solutionLink: {
      href: '/ar/no-code-app-builder',
      label: 'بناء تطبيق بدون كود',
      description: 'الذكاء الاصطناعي يبني تطبيقك',
    },
  },
}
