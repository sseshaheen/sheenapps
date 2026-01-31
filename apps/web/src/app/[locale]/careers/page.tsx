import { notFound } from 'next/navigation'
import { CareersApiClient } from '@/lib/api/careers-api-client'
import { JobListingContent } from '@/components/careers/job-listing-content'
import type { Job } from '@/types/careers'
import { toOgLocale } from '@/lib/seo/locale'
import { loadNamespace } from '@/i18n/message-loader'

interface CareersPageProps {
  params: Promise<{
    locale: string
  }>
  searchParams: Promise<{
    search?: string
    department?: string
    location?: string
    employment_type?: string
    experience_level?: string
    is_remote?: string
    page?: string
  }>
}

const ITEMS_PER_PAGE = 20

export default async function CareersPage({
  params,
  searchParams,
}: CareersPageProps) {
  // Await params and searchParams (Next.js 15 requirement)
  const { locale } = await params
  const searchParamsData = await searchParams
  // Load translations
  const messages = await loadNamespace(locale, 'careers')
  if (Object.keys(messages).length === 0) {
    notFound()
  }

  // Pass the entire careers translations object
  const translations = {
    careers: messages,
  }

  // Calculate pagination
  const currentPage = parseInt(searchParamsData.page || '1', 10)
  const offset = (currentPage - 1) * ITEMS_PER_PAGE

  // Fetch all jobs - handle errors gracefully
  let jobsData;
  let fetchError = false;
  try {
    jobsData = await CareersApiClient.listJobs({}, locale)
  } catch (error) {
    console.error('Failed to fetch jobs:', error)
    fetchError = true
  }

  // JSX must be outside try/catch (React error boundaries handle rendering errors)
  return (
    <JobListingContent
      jobs={fetchError ? [] : (jobsData?.items || [])}
      locale={locale}
      translations={messages}
      error={fetchError}
    />
  )
}

// Generate metadata for SEO - Full Arabic support for MENA region
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Arabic SEO: Different titles/descriptions for each Arabic variant
  const titles: Record<string, string> = {
    'en': 'Careers at SheenApps | Join Our Tech Team',
    'ar': 'وظائف شين آبس | انضم لفريقنا التقني',
    'ar-eg': 'وظائف شين آبس | انضم لفريقنا التقني في مصر',
    'ar-sa': 'وظائف شين آبس | انضم لفريقنا التقني في السعودية',
    'ar-ae': 'وظائف شين آبس | انضم لفريقنا التقني في الإمارات',
    'fr': 'Carrières chez SheenApps | Rejoignez notre équipe tech',
    'es': 'Carreras en SheenApps | Únete a nuestro equipo tech',
    'de': 'Karriere bei SheenApps | Werde Teil unseres Tech-Teams',
  }

  const descriptions: Record<string, string> = {
    'en': 'Join the SheenApps team. Explore remote and on-site job opportunities in AI, engineering, and business. Build the future of no-code development.',
    'ar': 'انضم إلى فريق شين آبس. استكشف فرص العمل عن بعد وفي المكتب في الذكاء الاصطناعي والهندسة والأعمال.',
    'ar-eg': 'انضم لفريق شين آبس. اكتشف فرص الشغل في الذكاء الاصطناعي والبرمجة. شغل عن بعد أو من المكتب.',
    'ar-sa': 'انضم إلى فريق شين آبس. استكشف فرص العمل في الذكاء الاصطناعي والهندسة. عمل عن بعد أو من المكتب.',
    'ar-ae': 'انضم إلى فريق شين آبس. استكشف فرص العمل في الذكاء الاصطناعي والهندسة. عمل عن بعد أو من المكتب.',
    'fr': 'Rejoignez l\'équipe SheenApps. Découvrez les opportunités en IA, ingénierie et business. Télétravail disponible.',
    'es': 'Únete al equipo SheenApps. Explora oportunidades en IA, ingeniería y negocios. Trabajo remoto disponible.',
    'de': 'Werde Teil des SheenApps-Teams. Entdecke Jobs in KI, Engineering und Business. Remote möglich.',
  }

  // Arabic keywords for job search SEO
  const keywords: Record<string, string[]> = {
    'ar': ['وظائف تقنية', 'وظائف ذكاء اصطناعي', 'عمل عن بعد', 'وظائف برمجة', 'شين آبس'],
    'ar-eg': ['وظائف تقنية مصر', 'شغل ذكاء اصطناعي', 'شغل من البيت', 'وظائف برمجة مصر'],
    'ar-sa': ['وظائف تقنية السعودية', 'وظائف ذكاء اصطناعي الرياض', 'عمل عن بعد السعودية'],
    'ar-ae': ['وظائف تقنية الإمارات', 'وظائف ذكاء اصطناعي دبي', 'عمل عن بعد الإمارات'],
  }

  const title = titles[locale] || titles.en
  const description = descriptions[locale] || descriptions.en

  return {
    title,
    description,
    keywords: keywords[locale] || undefined,
    alternates: {
      canonical: locale === 'en' ? '/careers' : `/${locale}/careers`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: toOgLocale(locale),
    },
  }
}