'use client'

import { m } from '@/components/ui/motion-provider'
import { Link } from '@/i18n/routing'
import type { Job } from '@/types/careers'
import { useState } from 'react'
import { ApplicationForm } from './application-form'
import { ModernJobCard } from './modern-job-card'
import { WhySheenApps } from './why-sheenapps'

interface JobListingContentProps {
  jobs: Job[]
  locale: string
  translations: any
  error?: boolean
}

export function JobListingContent({
  jobs,
  locale,
  translations,
  error = false,
}: JobListingContentProps) {
  const isRTL = ['ar', 'ar-sa', 'ar-eg', 'ar-ae'].includes(locale)
  const [showGeneralApplicationForm, setShowGeneralApplicationForm] = useState(false)

  const stats = [
    { value: '10K+', label: translations.stats?.active_users || 'Active Users' },
    { value: '50K+', label: translations.stats?.apps_built || 'Apps Built' },
    { value: '99.9%', label: translations.stats?.uptime || 'Uptime' },
    { value: '100%', label: translations.stats?.remote || 'Remote' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Modern Hero Section */}
      <section className="relative overflow-hidden">
        {/* Floating Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-60 -left-40 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="relative container mx-auto px-4 pt-24 pb-20">
          <m.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto text-center"
          >
            {!error && jobs.length > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 border border-primary/30 mb-8">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-primary">{translations.hiring_badge || "We're Hiring"}</span>
              </div>
            )}

            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              <span className="text-foreground">{locale === 'ar' ? 'انضم إلى ' : 'Join the '}</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">
                {locale === 'ar' ? 'مستقبل' : 'Future of'}
              </span>
              <br />
              <span className="text-foreground">{locale === 'ar' ? 'تطوير التطبيقات' : 'App Development'}</span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-8">
              {translations.hero_subtitle ||
                "Help us democratize software development with AI. Build tools that empower millions of creators worldwide."}
            </p>

            {/* Company Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
              {stats.map((stat, index) => (
                <m.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="text-2xl md:text-3xl font-bold text-primary mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                </m.div>
              ))}
            </div>
          </m.div>
        </div>
      </section>

      {/* Join Advisor Network Section */}
      <section className="bg-gradient-to-r from-muted/30 to-background">
        <div className="container mx-auto px-4 py-16">
          <m.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto"
          >
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Content */}
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/30 mb-6">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {translations.advisor_badge || "Alternative Path"}
                  </span>
                </div>
                
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-green-600">
                    {translations.advisor_title || "Join Our Advisor Network"}
                  </span>
                </h2>
                
                <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                  {translations.advisor_subtitle || 
                    "Prefer flexible work? Join our network of expert advisors and work with startups on your own terms."}
                </p>
                
                {/* Benefits */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-sm font-medium">{translations.advisor_benefits?.flexible || "Flexible Schedule"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-sm font-medium">{translations.advisor_benefits?.choose_projects || "Choose Projects"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-sm font-medium">{translations.advisor_benefits?.set_rates || "Set Your Rates"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-sm font-medium">{translations.advisor_benefits?.remote_work || "Work Remotely"}</span>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    href="/advisor/join"
                    className="group relative overflow-hidden inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      {translations.advisor_cta || "Join Network"}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                  </Link>
                  
                  <Link
                    href="/advisor/browse"
                    className="inline-flex items-center justify-center px-6 py-3 border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all duration-300 rounded-xl font-semibold"
                  >
                    {translations.advisor_browse || "Browse Advisors"}
                  </Link>
                </div>
              </div>
              
              {/* Visual */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-2xl blur-3xl"></div>
                <div className="relative bg-gradient-to-br from-card to-muted/50 rounded-2xl p-8 border border-emerald-500/20">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium">{translations.advisor_stats?.active || "1,200+ Active Advisors"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium">{translations.advisor_stats?.earnings || "$50-200/hour Average"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium">{translations.advisor_stats?.projects || "5,000+ Projects Completed"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </m.div>
        </div>
      </section>

      {/* Open Positions Section */}
      <section id="positions" className="container mx-auto px-4 pb-20">
        {error ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-muted-foreground">
              {translations.results?.error || "Failed to load positions. Please try again."}
            </p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            {/* <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6" />
              </svg>
            </div> */}
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {translations.no_positions || "No Open Positions"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {translations.no_positions_subtitle || "We're not actively hiring right now, but we're always open to exceptional talent."}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setShowGeneralApplicationForm(true)}
                className="inline-flex items-center px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
              >
                <svg className="w-5 h-5 me-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {translations.send_resume || "Send Us Your Resume"}
              </button>

              <Link
                href="mailto:careers@sheenapps.com"
                className="inline-flex items-center px-6 py-3 rounded-lg border border-border bg-background hover:bg-muted transition-colors font-medium"
              >
                <svg className="w-5 h-5 me-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {translations.email_us || "Email Us"}
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Only show heading when there are actual jobs */}
            <m.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {translations.open_positions || "Open Positions"}
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {translations.positions_subtitle ||
                  "We're looking for talented individuals who share our vision of making app development accessible to everyone."}
              </p>
            </m.div>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job, index) => (
                <ModernJobCard
                  key={job.id}
                  job={job}
                  locale={locale}
                  translations={translations}
                  index={index}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Why SheenApps Section */}
      <WhySheenApps locale={locale} translations={translations} />

      {/* General Application Form Modal */}
      {showGeneralApplicationForm && (
        <ApplicationForm
          jobId="general"
          jobTitle={translations.general_application || "General Application"}
          locale={locale}
          translations={translations}
          onClose={() => setShowGeneralApplicationForm(false)}
          onSuccess={() => {
            setShowGeneralApplicationForm(false)
            alert(translations.application?.success || "Application submitted successfully!")
          }}
        />
      )}
    </div>
  )
}
