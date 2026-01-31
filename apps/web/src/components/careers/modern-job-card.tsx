'use client'

import { Link } from '@/i18n/routing'
import { m } from '@/components/ui/motion-provider'
import type { Job } from '@/types/careers'

interface ModernJobCardProps {
  job: Job
  locale: string
  translations: any
  index: number
}

export function ModernJobCard({ job, locale, translations, index }: ModernJobCardProps) {
  const isRTL = ['ar', 'ar-sa', 'ar-eg', 'ar-ae'].includes(locale)
  
  // Format the posted date
  const postedDate = new Date(job.posted_at).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  // Get employment type translation
  const employmentType = translations.employment_types?.[job.employment_type] || job.employment_type

  // Define gradient backgrounds for variety
  const gradients = [
    'from-blue-500/10 to-cyan-500/10 border-blue-500/20 hover:border-blue-500/30',
    'from-purple-500/10 to-pink-500/10 border-purple-500/20 hover:border-purple-500/30',
    'from-green-500/10 to-emerald-500/10 border-green-500/20 hover:border-green-500/30',
    'from-orange-500/10 to-red-500/10 border-orange-500/20 hover:border-orange-500/30',
    'from-indigo-500/10 to-purple-500/10 border-indigo-500/20 hover:border-indigo-500/30',
    'from-teal-500/10 to-blue-500/10 border-teal-500/20 hover:border-teal-500/30',
  ]
  
  const cardGradient = gradients[index % gradients.length]

  return (
    <m.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Link
        href={`/careers/${job.slug}`}
        className={`block relative overflow-hidden rounded-2xl bg-gradient-to-br ${cardGradient} border backdrop-blur-sm p-6 h-full transition-all duration-300 hover:shadow-xl hover:shadow-primary/10`}
      >
        {/* Featured Badge */}
        {job.is_featured && (
          <div className="absolute top-4 end-4">
            <div className="px-2 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-semibold rounded-full shadow-md">
              ⭐ {translations.labels?.featured || 'Featured'}
            </div>
          </div>
        )}

        {/* Remote Badge */}
        {job.is_remote && (
          <div className="absolute top-4 start-4">
            <div className="px-2 py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-semibold rounded-full shadow-md">
              🌍 {translations.labels?.remote_available || 'Remote'}
            </div>
          </div>
        )}

        {/* Job Content */}
        <div className="pt-8 space-y-4">
          {/* Department & Type */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>{job.department}</span>
            </div>
            <span>•</span>
            <span>{employmentType}</span>
          </div>

          {/* Job Title */}
          <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {job.title}
          </h3>

          {/* Job Description Preview */}
          <div 
            className="text-sm text-muted-foreground line-clamp-3"
            dangerouslySetInnerHTML={{ 
              __html: job.description.replace(/<[^>]*>/g, '').substring(0, 150) + '...' 
            }}
          />

          {/* Job Location */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{job.location}</span>
          </div>

          {/* Salary Range (if available) */}
          {job.salary_range && (
            <div className="flex items-center gap-1 text-sm font-semibold text-primary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
              <span>{job.salary_range}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-border/50">
            <div className="text-xs text-muted-foreground">
              {translations.labels?.posted_on || 'Posted'} {postedDate}
            </div>
            
            {/* Apply Button */}
            <div className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:text-primary/80 transition-colors">
              <span>{translations.labels?.view_details || 'View Details'}</span>
              <svg 
                className={`w-4 h-4 transition-transform group-hover:${isRTL ? '-translate-x-1' : 'translate-x-1'}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d={isRTL ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} 
                />
              </svg>
            </div>
          </div>

          {/* Application Deadline Warning */}
          {job.application_deadline && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-orange-500/10 to-red-500/10 border-t border-orange-500/20 px-4 py-2 rounded-b-2xl">
              <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {translations.labels?.deadline || 'Deadline'}: {new Date(job.application_deadline).toLocaleDateString(locale)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Hover Effect Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
      </Link>
    </m.div>
  )
}