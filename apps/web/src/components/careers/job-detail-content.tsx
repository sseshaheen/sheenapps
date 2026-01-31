'use client'

import { useState } from 'react'
import { Link } from '@/i18n/routing'
import { m } from '@/components/ui/motion-provider'
import { ApplicationForm } from './application-form'
import type { Job } from '@/types/careers'

interface JobDetailContentProps {
  job: Job
  locale: string
  translations: any
}

export function JobDetailContent({
  job,
  locale,
  translations,
}: JobDetailContentProps) {
  const [showApplicationForm, setShowApplicationForm] = useState(false)
  const isRTL = ['ar', 'ar-sa', 'ar-eg', 'ar-ae'].includes(locale)

  // Format dates
  const postedDate = new Date(job.posted_at).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const deadlineDate = job.application_deadline
    ? new Date(job.application_deadline).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  // Get translations for employment type and experience level
  const employmentType = translations.employment_types[job.employment_type] || job.employment_type
  const experienceLevel = translations.experience_levels[job.experience_level] || job.experience_level

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Modern Header with Floating Elements */}
      <section className="relative overflow-hidden">
        {/* Floating Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-60 -left-40 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        
        <div className="relative container mx-auto px-4 pt-12 pb-20">
          {/* Breadcrumb */}
          <m.nav 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-muted-foreground mb-8"
          >
            <Link href="/careers" className="hover:text-primary transition-colors">
              {translations.title}
            </Link>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isRTL ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
            </svg>
            <span className="text-foreground">{job.title}</span>
          </m.nav>

          <div className="max-w-4xl mx-auto">
            {/* Badges */}
            <m.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-wrap gap-3 mb-6"
            >
              {job.is_featured && (
                <div className="px-3 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-sm font-semibold rounded-full shadow-lg">
                  ⭐ {translations.labels?.featured || 'Featured'}
                </div>
              )}
              {job.is_remote && (
                <div className="px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-semibold rounded-full shadow-lg">
                  🌍 {translations.labels?.remote_available || 'Remote'}
                </div>
              )}
            </m.div>

            {/* Job Title */}
            <m.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-4xl md:text-5xl font-bold mb-6"
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">
                {job.title}
              </span>
            </m.h1>

            {/* Job Meta Information */}
            <m.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            >
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="text-sm font-medium text-foreground">{job.department}</span>
              </div>
              
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium text-foreground">{job.location}</span>
              </div>
              
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-foreground">{employmentType}</span>
              </div>
              
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium text-foreground">{experienceLevel}</span>
              </div>
            </m.div>

            {/* Salary and Meta Info */}
            <m.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-4 mb-8"
            >
              {job.salary_range && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                  <span className="text-lg font-semibold text-primary">
                    {job.salary_range}
                  </span>
                </div>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 9l6 0M3 9a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  {translations.labels?.posted_on || 'Posted on'} {postedDate}
                </span>
                {deadlineDate && (
                  <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {translations.labels?.deadline || 'Deadline'}: {deadlineDate}
                  </span>
                )}
              </div>
            </m.div>

            {/* Apply Button */}
            <m.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <button
                onClick={() => setShowApplicationForm(true)}
                className="group relative overflow-hidden px-8 py-4 bg-gradient-to-r from-primary to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {translations.labels?.apply_now || 'Apply Now'}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
              </button>
              
              <button
                onClick={() => {
                  const emailBody = `I'm interested in the ${job.title} position at SheenApps. Please find my application details below.`
                  window.open(`mailto:careers@sheenapps.com?subject=${encodeURIComponent(`Application: ${job.title}`)}&body=${encodeURIComponent(emailBody)}`, '_blank')
                }}
                className="px-8 py-4 border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all duration-300 rounded-xl font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {translations.labels?.email_us || 'Email Us'}
              </button>
            </m.div>
          </div>
        </div>
      </section>

      {/* Job Content */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid gap-12">
            {/* Job Description */}
            <m.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="absolute -top-4 -start-4 w-12 h-12 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-full blur-lg" />
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                <div className="w-2 h-8 bg-gradient-to-b from-primary to-purple-500 rounded-full" />
                {translations.job_detail?.description || 'Job Description'}
              </h2>
              <div className="relative p-8 rounded-2xl bg-gradient-to-r from-card via-card to-muted/20 border border-border shadow-sm">
                <div 
                  className="prose prose-lg prose-gray dark:prose-invert max-w-none [&>ul]:space-y-2 [&>ol]:space-y-2 [&>*]:leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: job.description }}
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
              </div>
            </m.div>

            {/* Requirements */}
            <m.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -top-4 -start-4 w-12 h-12 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-full blur-lg" />
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                <div className="w-2 h-8 bg-gradient-to-b from-green-500 to-emerald-500 rounded-full" />
                {translations.job_detail?.requirements || 'Requirements'}
              </h2>
              <div className="relative p-8 rounded-2xl bg-gradient-to-r from-card via-card to-muted/20 border border-border shadow-sm">
                <div 
                  className="prose prose-lg prose-gray dark:prose-invert max-w-none [&>ul]:space-y-2 [&>ol]:space-y-2 [&>*]:leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: job.requirements }}
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
              </div>
            </m.div>

            {/* Benefits */}
            {job.benefits && (
              <m.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="relative"
              >
                <div className="absolute -top-4 -start-4 w-12 h-12 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-full blur-lg" />
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                  <div className="w-2 h-8 bg-gradient-to-b from-orange-500 to-red-500 rounded-full" />
                  {translations.job_detail?.benefits || 'Benefits'}
                </h2>
                <div className="relative p-8 rounded-2xl bg-gradient-to-r from-card via-card to-muted/20 border border-border shadow-sm">
                  <div 
                    className="prose prose-lg prose-gray dark:prose-invert max-w-none [&>ul]:space-y-2 [&>ol]:space-y-2 [&>*]:leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: job.benefits }}
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>
              </m.div>
            )}

            {/* Ready to Apply Section */}
            <m.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-2xl" />
              <div className="relative p-8 border border-primary/20 rounded-2xl text-center">
                <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-primary to-purple-500 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                
                <h2 className="text-2xl font-bold mb-4">
                  {translations.job_detail?.how_to_apply || 'Ready to Apply?'}
                </h2>
                <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                  {locale === 'ar'
                    ? 'هل أنت مهتم بهذه الفرصة؟ قدم طلبك أدناه وسنكون على اتصال قريباً.'
                    : 'Excited about this opportunity? We\'d love to hear from you. Submit your application and let\'s start the conversation!'}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => setShowApplicationForm(true)}
                    className="group relative overflow-hidden px-8 py-4 bg-gradient-to-r from-primary to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {translations.labels?.apply_now || 'Apply Now'}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                  </button>
                  
                  <Link
                    href="/careers"
                    className="px-8 py-4 border-2 border-border bg-background hover:bg-muted transition-colors rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isRTL ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
                    </svg>
                    {translations.labels?.view_all_positions || 'View All Positions'}
                  </Link>
                </div>
                
                {/* Contact Info */}
                <div className="mt-8 pt-8 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">
                    {translations.labels?.questions || 'Questions?'} {' '}
                    <Link
                      href="mailto:careers@sheenapps.com"
                      className="text-primary hover:underline font-medium"
                    >
                      careers@sheenapps.com
                    </Link>
                  </p>
                </div>
              </div>
            </m.div>
          </div>
        </div>
      </section>

      {/* Application Form Modal */}
      {showApplicationForm && (
        <ApplicationForm
          jobId={job.id}
          jobTitle={job.title}
          locale={locale}
          translations={translations}
          onClose={() => setShowApplicationForm(false)}
          onSuccess={() => {
            setShowApplicationForm(false)
            // Show success message or redirect
            alert(translations.application.success)
          }}
        />
      )}
    </div>
  )
}