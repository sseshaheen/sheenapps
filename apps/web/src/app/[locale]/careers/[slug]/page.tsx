import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Script from 'next/script'
import { CareersApiClient } from '@/lib/api/careers-api-client'
import { JobDetailContent } from '@/components/careers/job-detail-content'
import { loadNamespace } from '@/i18n/message-loader'

interface JobDetailPageProps {
  params: Promise<{
    locale: string
    slug: string
  }>
}

export default async function JobDetailPage({
  params,
}: JobDetailPageProps) {
  // Await params (Next.js 15 requirement)
  const { locale, slug } = await params
  // Load translations
  const messages = await loadNamespace(locale, 'careers')
  if (Object.keys(messages).length === 0) {
    notFound()
  }

  // Fetch job details - errors handled via notFound()
  let jobData;
  try {
    jobData = await CareersApiClient.getJob(slug, locale)
  } catch (error) {
    console.error('Failed to fetch job details:', error)
    notFound()
  }

  if (!jobData.success || !jobData.job) {
    notFound()
  }

  // Build canonical URL (English at root, others with locale prefix)
  const baseUrl = 'https://www.sheenapps.com'
  const careersUrl = locale === 'en' ? `${baseUrl}/careers` : `${baseUrl}/${locale}/careers`

  // JSX must be outside try/catch (React error boundaries handle rendering errors)
  return (
    <>
      {/* JSON-LD structured data for SEO - JobPosting */}
      <Script
        id="job-posting-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobData.jsonLd),
        }}
      />

      {/* JSON-LD structured data for SEO - BreadcrumbList */}
      <Script
        id="breadcrumb-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": baseUrl
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": locale === 'ar' ? "الوظائف" : "Careers",
                "item": careersUrl
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": jobData.job.title
              }
            ]
          }),
        }}
      />

      <JobDetailContent
        job={jobData.job}
        locale={locale}
        translations={messages}
      />
    </>
  )
}

// Generate dynamic metadata for SEO
export async function generateMetadata({
  params,
}: JobDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params
  try {
    const jobData = await CareersApiClient.getJob(slug, locale)
    
    if (!jobData.success || !jobData.job) {
      return {
        title: locale === 'ar' ? 'وظيفة غير موجودة' : 'Job Not Found',
      }
    }

    const job = jobData.job
    
    // Strip HTML tags from description for meta
    const plainDescription = job.description
      .replace(/<[^>]*>/g, '')
      .substring(0, 160)

    return {
      title: `${job.title} | ${locale === 'ar' ? 'وظائف شين آبس' : 'SheenApps Careers'}`,
      description: plainDescription,
      openGraph: {
        title: job.title,
        description: plainDescription,
        type: 'article',
        publishedTime: job.posted_at,
        modifiedTime: job.updated_at || job.posted_at,
      },
      twitter: {
        card: 'summary_large_image',
        title: job.title,
        description: plainDescription,
      },
    }
  } catch (error) {
    return {
      title: locale === 'ar' ? 'وظيفة غير موجودة' : 'Job Not Found',
    }
  }
}