'use client'

import { Link } from '@/i18n/routing'
import type { Job } from '@/types/careers'

interface JobCardProps {
  job: Job
  locale: string
  translations: any
}

export function JobCard({ job, locale, translations }: JobCardProps) {
  const isRTL = ['ar', 'ar-sa', 'ar-eg', 'ar-ae'].includes(locale)
  
  // Format the posted date
  const postedDate = new Date(job.posted_at).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Get employment type translation
  const employmentType = translations.employment_types[job.employment_type] || job.employment_type

  return (
    <Link
      href={`/careers/${job.slug}`}
      className="block border rounded-lg p-6 hover:shadow-lg transition-shadow bg-card"
    >
      {/* Featured badge */}
      {job.is_featured && (
        <span className="inline-block px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 text-xs rounded mb-3">
          {translations.labels.featured}
        </span>
      )}

      {/* Job title */}
      <h2 className="text-xl font-semibold mb-2 text-foreground">
        {job.title}
      </h2>

      {/* Department and location */}
      <div className="flex flex-wrap gap-2 mb-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          {job.department}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {job.location}
        </span>
      </div>

      {/* Employment type and remote badge */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="inline-block px-2 py-1 bg-muted text-muted-foreground text-xs rounded">
          {employmentType}
        </span>
        {job.is_remote && (
          <span className="inline-block px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 text-xs rounded">
            {translations.labels.remote_available}
          </span>
        )}
      </div>

      {/* Posted date */}
      <p className="text-sm text-muted-foreground">
        {translations.labels.posted_on} {postedDate}
      </p>

      {/* Application deadline if exists */}
      {job.application_deadline && (
        <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
          {translations.labels.deadline}: {new Date(job.application_deadline).toLocaleDateString(locale)}
        </p>
      )}
    </Link>
  )
}