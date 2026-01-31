import { notFound } from 'next/navigation'
import { AboutContent } from './about-content'
import { locales, type Locale } from '@/i18n/config'
import { toOgLocale } from '@/lib/seo/locale'

export default async function AboutPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  return <AboutContent />
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Validate locale - return minimal metadata for invalid locales
  if (!locales.includes(locale as Locale)) {
    return { title: 'About - SheenApps' }
  }

  // Arabic SEO: Full metadata for all Arabic variants
  const titles: Record<string, string> = {
    'en': 'About Us - SheenApps',
    'ar': 'من نحن - شين آبس | فريقك التقني الدائم',
    'ar-eg': 'عن شين آبس | فريقك التقني اللي هيغير شغلك',
    'ar-sa': 'من نحن - شين آبس | فريقك التقني الدائم',
    'ar-ae': 'من نحن - شين آبس | فريقك التقني الدائم',
    'fr': 'À propos - SheenApps',
    'es': 'Sobre Nosotros - SheenApps',
    'de': 'Über Uns - SheenApps',
  }

  const descriptions: Record<string, string> = {
    'en': 'SheenApps: Your permanent tech team for the price of a gym membership. We democratize software development with AI and human expertise.',
    'ar': 'شين آبس: فريقك التقني الدائم بسعر اشتراك الجيم. نجعل تطوير البرمجيات في متناول الجميع بالذكاء الاصطناعي والخبرة البشرية.',
    'ar-eg': 'شين آبس: فريقك التقني بسعر اشتراك الجيم. بنخلي تطوير السوفتوير سهل للكل بالذكاء الاصطناعي وخبراء حقيقيين.',
    'ar-sa': 'شين آبس: فريقك التقني الدائم بسعر اشتراك النادي. نجعل تطوير البرمجيات في متناول الجميع بالذكاء الاصطناعي والخبرة البشرية.',
    'ar-ae': 'شين آبس: فريقك التقني الدائم بسعر اشتراك النادي. نجعل تطوير البرمجيات في متناول الجميع بالذكاء الاصطناعي والخبرة البشرية.',
    'fr': 'SheenApps : Votre équipe tech permanente au prix d\'un abonnement gym. Nous démocratisons le développement logiciel avec l\'IA et l\'expertise humaine.',
    'es': 'SheenApps: Tu equipo tech permanente al precio de un gimnasio. Democratizamos el desarrollo de software con IA y experiencia humana.',
    'de': 'SheenApps: Ihr permanentes Tech-Team zum Preis eines Fitness-Abos. Wir demokratisieren Softwareentwicklung mit KI und menschlicher Expertise.',
  }

  // Arabic keywords for MENA SEO
  const keywords: Record<string, string[]> = {
    'ar': ['شركة تقنية', 'تطوير تطبيقات', 'ذكاء اصطناعي', 'فريق تقني', 'شين آبس'],
    'ar-eg': ['شركة تقنية مصرية', 'تطوير تطبيقات', 'ذكاء اصطناعي', 'فريق تقني', 'شين آبس'],
    'ar-sa': ['شركة تقنية سعودية', 'تطوير تطبيقات', 'ذكاء اصطناعي', 'فريق تقني', 'شين آبس'],
    'ar-ae': ['شركة تقنية إماراتية', 'تطوير تطبيقات', 'ذكاء اصطناعي', 'فريق تقني', 'شين آبس'],
  }

  return {
    title: titles[locale] || titles.en,
    description: descriptions[locale] || descriptions.en,
    keywords: keywords[locale] || undefined,
    alternates: {
      canonical: locale === 'en' ? '/about' : `/${locale}/about`,
    },
    openGraph: {
      title: titles[locale] || titles.en,
      description: descriptions[locale] || descriptions.en,
      locale: toOgLocale(locale),
    },
  }
}