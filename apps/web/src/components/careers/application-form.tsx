'use client'

import { useState, useEffect } from 'react'
import Script from 'next/script'
import { CareersApiClient } from '@/lib/api/careers-api-client'

interface ApplicationFormProps {
  jobId: string
  jobTitle: string
  locale: string
  translations: any
  onClose: () => void
  onSuccess: () => void
}

// Declare reCAPTCHA global
declare global {
  interface Window {
    grecaptcha: any
  }
}

export function ApplicationForm({
  jobId,
  jobTitle,
  locale,
  translations,
  onClose,
  onSuccess,
}: ApplicationFormProps) {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    cover_letter: '',
    linkedin_url: '',
    portfolio_url: '',
    years_of_experience: '',
  })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')

  const isRTL = ['ar', 'ar-sa', 'ar-eg', 'ar-ae'].includes(locale)

  // reCAPTCHA v3 - no global callback needed, we'll call it programmatically

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const validation = CareersApiClient.validateResumeFile(file)
      
      if (!validation.valid) {
        setErrors({ ...errors, resume_file: validation.error! })
        setResumeFile(null)
        return
      }

      setResumeFile(file)
      setErrors({ ...errors, resume_file: '' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    const newErrors: Record<string, string> = {}
    
    if (!formData.full_name.trim()) {
      newErrors.full_name = locale === 'ar' ? 'الاسم مطلوب' : 'Name is required'
    }
    if (!formData.email.trim()) {
      newErrors.email = locale === 'ar' ? 'البريد الإلكتروني مطلوب' : 'Email is required'
    }
    if (!formData.phone.trim()) {
      newErrors.phone = locale === 'ar' ? 'رقم الهاتف مطلوب' : 'Phone is required'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)
    setErrors({})

    // Execute reCAPTCHA v3 before form submission
    try {
      if (!window.grecaptcha) {
        throw new Error('reCAPTCHA not loaded')
      }

      const token = await new Promise<string>((resolve, reject) => {
        window.grecaptcha.ready(() => {
          // eslint-disable-next-line no-restricted-globals
          window.grecaptcha.execute(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY, { action: 'submit' })
            .then(resolve)
            .catch(reject)
        })
      })

      setCaptchaToken(token)

      if (!token) {
        setErrors({ captcha: translations.application.errors.captcha })
        setSubmitting(false)
        return
      }
    } catch (error) {
      console.error('reCAPTCHA error:', error)
      setErrors({ captcha: translations.application.errors.captcha })
      setSubmitting(false)
      return
    }

    try {
      // Convert file to base64 if present
      let resume_file_base64 = ''
      if (resumeFile) {
        resume_file_base64 = await CareersApiClient.fileToBase64(resumeFile)
      }

      // Submit application
      const result = await CareersApiClient.submitApplication(
        jobId,
        {
          ...formData,
          years_of_experience: formData.years_of_experience 
            ? parseInt(formData.years_of_experience) 
            : undefined,
          resume_file: resume_file_base64,
          captcha_token: captchaToken,
        },
        locale
      )

      if (result.success) {
        onSuccess()
      }
    } catch (error: any) {
      // Handle specific error types
      if (error.code === 'DUPLICATE_APPLICATION') {
        setErrors({ submit: translations.application.errors.duplicate })
      } else if (error.code === 'RATE_LIMIT') {
        setErrors({ submit: translations.application.errors.rate_limit })
      } else if (error.code === 'CAPTCHA_FAILED') {
        setErrors({ captcha: translations.application.errors.captcha })
        // reCAPTCHA v3 doesn't need reset - just clear token
        setCaptchaToken('')
      } else {
        setErrors({ submit: error.message || translations.application.errors.general })
      }
    } finally {
      setSubmitting(false)
    }
  }

  // eslint-disable-next-line no-restricted-globals
  const recaptchaSrc = `https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}&hl=${locale}`

  return (
    <>
      {/* reCAPTCHA v3 Script */}
      <Script
        src={recaptchaSrc}
        strategy="lazyOnload"
      />

      {/* Modal Overlay */}
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-background rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="border-b p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {translations.application.title.replace('{jobTitle}', jobTitle)}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
            {/* Error Alert */}
            {errors.submit && (
              <div className="p-4 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
                {errors.submit}
              </div>
            )}

            {/* Personal Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{translations.application.personal_info}</h3>
              
              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {translations.application.full_name} *
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                {errors.full_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.full_name}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {translations.application.email} *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {translations.application.phone} *
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
                )}
              </div>

              {/* Years of Experience */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {translations.application.experience_years}
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={formData.years_of_experience}
                  onChange={(e) => setFormData({ ...formData, years_of_experience: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Cover Letter */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {translations.application.cover_letter}
              </label>
              <textarea
                value={formData.cover_letter}
                onChange={(e) => setFormData({ ...formData, cover_letter: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                rows={4}
              />
            </div>

            {/* Resume Upload */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {translations.application.resume}
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {translations.application.resume_help}
              </p>
              {errors.resume_file && (
                <p className="text-red-500 text-sm mt-1">{errors.resume_file}</p>
              )}
            </div>

            {/* LinkedIn URL */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {translations.application.linkedin_url}
              </label>
              <input
                type="url"
                value={formData.linkedin_url}
                onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="https://linkedin.com/in/..."
              />
            </div>

            {/* Portfolio URL */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {translations.application.portfolio_url}
              </label>
              <input
                type="url"
                value={formData.portfolio_url}
                onChange={(e) => setFormData({ ...formData, portfolio_url: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="https://..."
              />
            </div>

            {/* reCAPTCHA v3 - invisible, no UI needed */}
            {errors.captcha && (
              <div className="text-red-500 text-sm">{errors.captcha}</div>
            )}

            {/* Required Fields Note */}
            <p className="text-sm text-muted-foreground">
              {translations.application.required_fields}
            </p>

            {/* Submit Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {submitting ? translations.application.submitting : translations.application.submit}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 border rounded-lg hover:bg-muted transition-colors"
              >
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
