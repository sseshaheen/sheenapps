'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store'
import { useRouter } from '@/i18n/routing'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'

// Types for the form steps
interface PersonalInfoStep {
  display_name: string
  bio: string
  years_experience: number | null
  portfolio_url: string
}

interface ProfessionalStep {
  skills: string[]
  specialties: string[]
  languages: string[]
  linkedin_url: string
  github_url: string
}

interface ConsultationStep {
  availability_hours: number[]  // Hours of the day (0-23)
  availability_days: string[]   // Days of the week
  consultation_types: string[]  // Types of consultations offered
  time_zones: string[]         // Preferred time zones
  max_sessions_per_week: number | null
}

interface FormData {
  personal: PersonalInfoStep
  professional: ProfessionalStep
  consultation: ConsultationStep
}

interface AdvisorMultiStepFormProps {
  locale: string
  translations: {
    advisor: {
      application: {
        title: string
        subtitle: string
        steps: {
          personal: {
            title: string
            description: string
            fields: {
              displayName: { label: string; placeholder: string; help: string }
              bio: { label: string; placeholder: string; help: string }
              experience: { label: string; help: string }
              portfolio: { label: string; placeholder: string; help: string }
            }
          }
          professional: {
            title: string
            description: string
            fields: {
              skills: { label: string; help: string }
              specialties: { label: string; help: string }
              languages: { label: string; help: string; placeholder: string }
              linkedin: { label: string; placeholder: string; help: string }
              github: { label: string; placeholder: string; help: string }
            }
          }
          consultation: {
            title: string
            description: string
            fields: {
              availability: { label: string; help: string }
              consultationTypes: { label: string; help: string }
              timeZones: { label: string; help: string; placeholder: string }
              maxSessions: { label: string; help: string; placeholder: string }
            }
          }
        }
        navigation: {
          next: string
          previous: string
          submit: string
          saveDraft: string
          cancel: string
        }
        progress: {
          step: string
          of: string
          complete: string
        }
        draft: {
          saved: string
          saving: string
          autoSave: string
        }
        auth: {
          guestMessage: string
          authenticatedMessage: string
        }
      }
    }
    common: {
      loading: string
      error: string
      required: string
    }
  }
  existingDraft?: FormData
}

// Constants
const POPULAR_SKILLS = [
  'React', 'Node.js', 'Python', 'JavaScript', 'TypeScript', 'Vue.js', 'Angular',
  'Docker', 'AWS', 'PostgreSQL', 'MongoDB', 'GraphQL', 'REST APIs', 'Next.js',
  'Express.js', 'Django', 'Flask', 'Ruby on Rails', 'PHP', 'Java', 'C#', '.NET',
  'Go', 'Rust', 'Swift', 'Kotlin', 'Flutter', 'React Native', 'iOS', 'Android',
  'DevOps', 'CI/CD', 'Kubernetes', 'Terraform', 'Redis', 'Elasticsearch'
]

const POPULAR_SPECIALTIES = [
  'Frontend Development', 'Backend Development', 'Full Stack Development',
  'Mobile Development', 'DevOps & Infrastructure', 'Database Design',
  'API Development', 'System Architecture', 'Performance Optimization',
  'Security', 'Testing & QA', 'Code Review', 'Technical Leadership',
  'Microservices', 'Cloud Architecture', 'Data Engineering', 'Machine Learning',
  'Web3 & Blockchain', 'Game Development', 'E-commerce', 'Fintech', 'Healthcare'
]

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese',
  'Japanese', 'Korean', 'Russian', 'Arabic', 'Hindi', 'Dutch', 'Swedish'
]

const CONSULTATION_TYPES = [
  'Code Review', 'Architecture Discussion', 'Bug Fixing', 'Pair Programming',
  'Tech Stack Guidance', 'Performance Optimization', 'Database Design',
  'Security Review', 'Testing Strategy', 'DevOps Setup', 'Project Planning'
]

const TIME_ZONES = [
  'UTC-12', 'UTC-11', 'UTC-10', 'UTC-9', 'UTC-8', 'UTC-7', 'UTC-6', 'UTC-5',
  'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1', 'UTC+0', 'UTC+1', 'UTC+2', 'UTC+3',
  'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12'
]

const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
]

export function AdvisorMultiStepForm({ translations, locale, existingDraft }: AdvisorMultiStepFormProps) {
  const { user, isAuthenticated } = useAuthStore()
  const router = useRouter()

  // Form state
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<FormData>(() => ({
    personal: {
      display_name: existingDraft?.personal?.display_name || '',
      bio: existingDraft?.personal?.bio || '',
      years_experience: existingDraft?.personal?.years_experience || null,
      portfolio_url: existingDraft?.personal?.portfolio_url || ''
    },
    professional: {
      skills: existingDraft?.professional?.skills || [],
      specialties: existingDraft?.professional?.specialties || [],
      languages: existingDraft?.professional?.languages || [],
      linkedin_url: existingDraft?.professional?.linkedin_url || '',
      github_url: existingDraft?.professional?.github_url || ''
    },
    consultation: {
      availability_hours: existingDraft?.consultation?.availability_hours || [],
      availability_days: existingDraft?.consultation?.availability_days || [],
      consultation_types: existingDraft?.consultation?.consultation_types || [],
      time_zones: existingDraft?.consultation?.time_zones || [],
      max_sessions_per_week: existingDraft?.consultation?.max_sessions_per_week || null
    }
  }))

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-save draft every 30 seconds (only if authenticated)
  const saveDraft = useCallback(async () => {
    if (!user || !isAuthenticated) return

    setIsDraftSaving(true)
    try {
      logger.info('💾 Auto-saving advisor application draft', { userId: user.id.slice(0, 8), step: currentStep })
      
      // TODO: Call API to save draft
      // await saveDraftAction({ step: currentStep, data: formData })
      
      // Simulate API call for now
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 3000) // Hide "saved" indicator after 3s
      
    } catch (error) {
      logger.error('❌ Failed to save draft:', error)
    } finally {
      setIsDraftSaving(false)
    }
  }, [formData, currentStep, user])

  // Auto-save effect
  useEffect(() => {
    const timer = setInterval(() => {
      if (user && (formData.personal.display_name || formData.personal.bio)) {
        saveDraft()
      }
    }, 30000) // Auto-save every 30 seconds

    return () => clearInterval(timer)
  }, [saveDraft, user, formData])

  // Load form data from localStorage if user returns from authentication
  useEffect(() => {
    const savedDraft = localStorage.getItem('advisor-application-draft')
    if (savedDraft && isAuthenticated) {
      try {
        const parsedDraft = JSON.parse(savedDraft)
        setFormData(parsedDraft)
        localStorage.removeItem('advisor-application-draft')
        logger.info('📝 Restored application draft from localStorage')
      } catch (error) {
        logger.error('Failed to restore draft from localStorage:', error)
      }
    }
  }, [isAuthenticated])

  // Note: Allow users to fill form without authentication
  // Authentication will be required only when submitting the application

  // Step validation
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.personal.display_name.trim() && formData.personal.bio.trim())
      case 2:
        return formData.professional.skills.length > 0 && formData.professional.specialties.length > 0
      case 3:
        return formData.consultation.availability_days.length > 0 && formData.consultation.consultation_types.length > 0
      default:
        return false
    }
  }

  // Navigation handlers
  const handleNext = () => {
    if (validateStep(currentStep) && currentStep < 3) {
      setCurrentStep(prev => prev + 1)
      saveDraft() // Save when navigating
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  // Form submission
  const handleSubmit = async () => {
    if (!validateStep(3)) return

    // Check authentication before submission
    if (!isAuthenticated || !user) {
      logger.info('🔐 User needs to authenticate before submitting application')
      // Store form data in localStorage before redirecting
      localStorage.setItem('advisor-application-draft', JSON.stringify(formData))
      router.push(`/auth/login?returnTo=/advisor/apply&reason=submit_application`)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      logger.info('📝 Submitting multi-step advisor application', { userId: user.id.slice(0, 8) })
      
      // TODO: Submit complete application
      // const result = await submitAdvisorApplicationAction(formData)
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Redirect to status page on success
      router.push('/advisor/application-status')
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to submit application')
      logger.error('❌ Failed to submit application:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Tag handlers
  const handleAddTag = (category: 'skills' | 'specialties' | 'consultation_types' | 'languages' | 'time_zones' | 'availability_days', value: string) => {
    setFormData(prev => {
      if (category === 'skills' || category === 'specialties' || category === 'languages') {
        return {
          ...prev,
          professional: {
            ...prev.professional,
            [category]: [...prev.professional[category], value]
          }
        }
      } else {
        return {
          ...prev,
          consultation: {
            ...prev.consultation,
            [category]: [...prev.consultation[category], value]
          }
        }
      }
    })
  }

  const handleRemoveTag = (category: 'skills' | 'specialties' | 'consultation_types' | 'languages' | 'time_zones' | 'availability_days', index: number) => {
    setFormData(prev => {
      if (category === 'skills' || category === 'specialties' || category === 'languages') {
        return {
          ...prev,
          professional: {
            ...prev.professional,
            [category]: prev.professional[category].filter((_, i) => i !== index)
          }
        }
      } else {
        return {
          ...prev,
          consultation: {
            ...prev.consultation,
            [category]: prev.consultation[category].filter((_, i) => i !== index)
          }
        }
      }
    })
  }

  // Note: Removed user requirement check - form can now be filled without authentication
  // Authentication is only required when submitting the application

  const progress = (currentStep / 3) * 100
  const isStepValid = validateStep(currentStep)

  return (
    <div className="dark min-h-screen bg-background dark:bg-gray-900" style={{ backgroundColor: '#111827' }}>
      <div className="container mx-auto px-4 pt-16 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-4 text-foreground dark:text-white">
              {translations.advisor.application.title}
            </h1>
            <p className="text-lg text-muted-foreground dark:text-gray-400 dark:text-gray-300 max-w-2xl mx-auto">
              {translations.advisor.application.subtitle}
            </p>
            
            {/* Authentication Status - Very subtle */}
            <div className="mt-4">
              {!isAuthenticated && (
                <p className="text-xs text-muted-foreground dark:text-gray-500 opacity-50 text-center">
                  {translations.advisor.application.auth.guestMessage}
                </p>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <Card className="mb-8">
            <CardContent className="py-6">
              <div className={cn(
                "flex items-center justify-between mb-4",
                locale.startsWith('ar') ? "flex-row-reverse" : ""
              )}>
                <span className="text-sm font-medium">
                  <bdi
                    dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
                    className="inline-block [unicode-bidi:isolate]"
                  >
                    {locale.startsWith('ar') ? (
                      <>
                        {translations.advisor.application.progress.step}{' '}
                        <span dir="ltr">{currentStep}</span>{' '}
                        {translations.advisor.application.progress.of}{' '}
                        <span dir="ltr">{3}</span>
                      </>
                    ) : (
                      <>
                        {translations.advisor.application.progress.step} {currentStep}{' '}
                        {translations.advisor.application.progress.of} {3}
                      </>
                    )}
                  </bdi>
                </span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
                  {isDraftSaving && (
                    <>
                      <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                      {translations.advisor.application.draft.saving}
                    </>
                  )}
                  {draftSaved && (
                    <>
                      <Icon name="check" className="h-4 w-4 text-green-600" />
                      {translations.advisor.application.draft.saved}
                    </>
                  )}
                </div>
              </div>
              <Progress 
                value={progress} 
                dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
                className="w-full" 
              />
              <div className="flex justify-between mt-2">
                {[1, 2, 3].map((step) => (
                  <div key={step} className={cn(
                    "text-xs text-center flex-1",
                    step <= currentStep ? "text-primary font-medium" : "text-muted-foreground dark:text-gray-400"
                  )}>
                    {step === 1 && translations.advisor.application.steps.personal.title}
                    {step === 2 && translations.advisor.application.steps.professional.title}
                    {step === 3 && translations.advisor.application.steps.consultation.title}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Error Alert */}
          {error && (
            <Card className="border-destructive mb-8">
              <CardContent className="flex items-center gap-3 py-4">
                <Icon name="alert-circle" className="h-5 w-5 text-destructive" />
                <p className="text-destructive font-medium">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Step Content */}
          {currentStep === 1 && (
            <PersonalInfoStep
              data={formData.personal}
              onChange={(data) => setFormData(prev => ({ ...prev, personal: data }))}
              translations={translations.advisor.application.steps.personal}
              locale={locale}
            />
          )}

          {currentStep === 2 && (
            <ProfessionalStep
              data={formData.professional}
              onChange={(data) => setFormData(prev => ({ ...prev, professional: data }))}
              translations={translations.advisor.application.steps.professional}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              locale={locale}
            />
          )}

          {currentStep === 3 && (
            <ConsultationStep
              data={formData.consultation}
              onChange={(data) => setFormData(prev => ({ ...prev, consultation: data }))}
              translations={translations.advisor.application.steps.consultation}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              locale={locale}
            />
          )}

          {/* Navigation */}
          <Card className="mt-8">
            <CardContent className="flex items-center justify-between py-6">
              <div>
                {currentStep > 1 && (
                  <Button variant="outline" onClick={handlePrevious}>
                    <Icon name="arrow-left" className="h-4 w-4 me-2" />
                    {translations.advisor.application.navigation.previous}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={saveDraft} disabled={isDraftSaving}>
                  <Icon name="save" className="h-4 w-4 me-2" />
                  {translations.advisor.application.navigation.saveDraft}
                </Button>

                {currentStep < 3 ? (
                  <Button onClick={handleNext} disabled={!isStepValid}>
                    {translations.advisor.application.navigation.next}
                    <Icon name="arrow-right" className="h-4 w-4 ms-2" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={!isStepValid || isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Icon name="loader-2" className="h-4 w-4 me-2 animate-spin" />
                        {translations.common.loading}
                      </>
                    ) : (
                      translations.advisor.application.navigation.submit
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Step Components
function PersonalInfoStep({ 
  data, 
  onChange, 
  translations,
  locale 
}: {
  data: PersonalInfoStep
  locale: string
  onChange: (data: PersonalInfoStep) => void
  translations: any
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="!text-white" style={{ color: 'white' }}>{translations.title}</CardTitle>
        <CardDescription className="dark:text-gray-300">{translations.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="display_name" className="!text-white" style={{ color: 'white' }}>
            {translations.fields.displayName.label}
            <span className="text-destructive ml-1">*</span>
          </Label>
          <Input
            id="display_name"
            dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
            className={cn(
              "rtl:text-right rtl:placeholder:text-right !bg-gray-800 !border-gray-600 !text-white",
              locale.startsWith('ar') ? "[direction:rtl] [unicode-bidi:plaintext]" : ""
            )}
            style={{
              backgroundColor: '#1f2937',
              borderColor: '#4b5563',
              color: 'white',
              ...(locale.startsWith('ar') ? { direction: 'rtl', unicodeBidi: 'plaintext' } : {})
            }}
            value={data.display_name}
            onChange={(e) => onChange({ ...data, display_name: e.target.value })}
            placeholder={translations.fields.displayName.placeholder}
            required
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 dark:text-gray-400 mt-1">
            {translations.fields.displayName.help}
          </p>
        </div>

        <div>
          <Label htmlFor="bio" className="!text-white" style={{ color: 'white' }}>
            {translations.fields.bio.label}
            <span className="text-destructive ml-1">*</span>
          </Label>
          <Textarea
            id="bio"
            dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
            className={cn(
              "rtl:text-right rtl:placeholder:text-right !bg-gray-800 !border-gray-600 !text-white",
              locale.startsWith('ar') ? "[direction:rtl] [unicode-bidi:plaintext]" : ""
            )}
            style={{
              backgroundColor: '#1f2937',
              borderColor: '#4b5563',
              color: 'white',
              ...(locale.startsWith('ar') ? { direction: 'rtl', unicodeBidi: 'plaintext' } : {})
            }}
            value={data.bio}
            onChange={(e) => onChange({ ...data, bio: e.target.value })}
            placeholder={translations.fields.bio.placeholder}
            rows={4}
            required
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            {translations.fields.bio.help}
          </p>
        </div>

        <div>
          <Label htmlFor="years_experience" className="!text-white" style={{ color: 'white' }}>
            {translations.fields.experience.label}
          </Label>
          <Input
            id="years_experience"
            type="number"
            min="0"
            max="50"
            value={data.years_experience || ''}
            onChange={(e) => onChange({ 
              ...data, 
              years_experience: e.target.value ? Number(e.target.value) : null 
            })}
            className="max-w-32 !bg-gray-800 !border-gray-600 !text-white"
            style={{
              backgroundColor: '#1f2937',
              borderColor: '#4b5563',
              color: 'white'
            }}
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            {translations.fields.experience.help}
          </p>
        </div>

        <div>
          <Label htmlFor="portfolio_url" className="!text-white" style={{ color: 'white' }}>
            {translations.fields.portfolio.label}
          </Label>
          <Input
            id="portfolio_url"
            type="url"
            dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
            className={cn(
              "rtl:text-right rtl:placeholder:text-right !bg-gray-800 !border-gray-600 !text-white",
              locale.startsWith('ar') ? "[direction:rtl] [unicode-bidi:plaintext]" : ""
            )}
            style={{
              backgroundColor: '#1f2937',
              borderColor: '#4b5563',
              color: 'white',
              ...(locale.startsWith('ar') ? { direction: 'rtl', unicodeBidi: 'plaintext' } : {})
            }}
            value={data.portfolio_url}
            onChange={(e) => onChange({ ...data, portfolio_url: e.target.value })}
            placeholder={translations.fields.portfolio.placeholder}
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            {translations.fields.portfolio.help}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ProfessionalStep({ 
  data, 
  onChange, 
  translations, 
  onAddTag, 
  onRemoveTag,
  locale 
}: {
  data: ProfessionalStep
  locale: string
  onChange: (data: ProfessionalStep) => void
  translations: any
  onAddTag: (category: any, value: string) => void
  onRemoveTag: (category: any, index: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="!text-white" style={{ color: 'white' }}>{translations.title}</CardTitle>
        <CardDescription className="dark:text-gray-300">{translations.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Skills */}
        <div>
          <Label className="!text-white" style={{ color: 'white' }}>
            {translations.fields.skills.label}
            <span className="text-destructive ml-1">*</span>
          </Label>
          <div className="flex flex-wrap gap-2 mt-2 mb-3">
            {data.skills.map((skill, index) => (
              <Badge key={index} variant="secondary" className="gap-2">
                {skill}
                <button
                  type="button"
                  onClick={() => onRemoveTag('skills', index)}
                  className="hover:text-destructive"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {POPULAR_SKILLS.filter(skill => !data.skills.includes(skill)).slice(0, 12).map((skill) => (
              <Button
                key={skill}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddTag('skills', skill)}
                className="h-8 text-xs"
              >
                + {skill}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            {translations.fields.skills.help}
          </p>
        </div>

        {/* Specialties */}
        <div>
          <Label className="!text-white" style={{ color: 'white' }}>
            {translations.fields.specialties.label}
            <span className="text-destructive ml-1">*</span>
          </Label>
          <div className="flex flex-wrap gap-2 mt-2 mb-3">
            {data.specialties.map((specialty, index) => (
              <Badge key={index} variant="secondary" className="gap-2">
                {specialty}
                <button
                  type="button"
                  onClick={() => onRemoveTag('specialties', index)}
                  className="hover:text-destructive"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {POPULAR_SPECIALTIES.filter(specialty => !data.specialties.includes(specialty)).slice(0, 12).map((specialty) => (
              <Button
                key={specialty}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddTag('specialties', specialty)}
                className="h-8 text-xs justify-start"
              >
                + {specialty}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            {translations.fields.specialties.help}
          </p>
        </div>

        {/* Languages */}
        <div>
          <Label className="!text-white" style={{ color: 'white' }}>{translations.fields.languages.label}</Label>
          <div className="flex flex-wrap gap-2 mt-2 mb-3">
            {data.languages.map((language, index) => (
              <Badge key={index} variant="secondary" className="gap-2">
                {language}
                <button
                  type="button"
                  onClick={() => onRemoveTag('languages', index)}
                  className="hover:text-destructive"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <Select
            onValueChange={(value) => {
              if (value && !data.languages.includes(value)) {
                onAddTag('languages', value)
              }
            }}
          >
            <SelectTrigger className="w-48 !bg-gray-800 !border-gray-600 !text-white" style={{ backgroundColor: '#1f2937', borderColor: '#4b5563', color: 'white' }}>
              <SelectValue placeholder={translations.fields.languages.placeholder} />
            </SelectTrigger>
            <SelectContent className="!bg-gray-800 !border-gray-600" style={{ backgroundColor: '#1f2937', borderColor: '#4b5563' }}>
              {LANGUAGES.filter(lang => !data.languages.includes(lang)).map((language) => (
                <SelectItem key={language} value={language} className="!text-white hover:!bg-gray-700" style={{ color: 'white' }}>{language}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            {translations.fields.languages.help}
          </p>
        </div>

        {/* LinkedIn */}
        <div>
          <Label htmlFor="linkedin_url" className="!text-white" style={{ color: 'white' }}>
            {translations.fields.linkedin.label}
          </Label>
          <Input
            id="linkedin_url"
            type="url"
            dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
            className={cn(
              "rtl:text-right rtl:placeholder:text-right !bg-gray-800 !border-gray-600 !text-white",
              locale.startsWith('ar') ? "[direction:rtl] [unicode-bidi:plaintext]" : ""
            )}
            style={{
              backgroundColor: '#1f2937',
              borderColor: '#4b5563',
              color: 'white',
              ...(locale.startsWith('ar') ? { direction: 'rtl', unicodeBidi: 'plaintext' } : {})
            }}
            value={data.linkedin_url}
            onChange={(e) => onChange({ ...data, linkedin_url: e.target.value })}
            placeholder={translations.fields.linkedin.placeholder}
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            {translations.fields.linkedin.help}
          </p>
        </div>

        {/* GitHub */}
        <div>
          <Label htmlFor="github_url" className="!text-white" style={{ color: 'white' }}>
            {translations.fields.github.label}
          </Label>
          <Input
            id="github_url"
            type="url"
            dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
            className={cn(
              "rtl:text-right rtl:placeholder:text-right !bg-gray-800 !border-gray-600 !text-white",
              locale.startsWith('ar') ? "[direction:rtl] [unicode-bidi:plaintext]" : ""
            )}
            style={{
              backgroundColor: '#1f2937',
              borderColor: '#4b5563',
              color: 'white',
              ...(locale.startsWith('ar') ? { direction: 'rtl', unicodeBidi: 'plaintext' } : {})
            }}
            value={data.github_url}
            onChange={(e) => onChange({ ...data, github_url: e.target.value })}
            placeholder={translations.fields.github.placeholder}
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            {translations.fields.github.help}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ConsultationStep({ 
  data, 
  onChange, 
  translations, 
  onAddTag, 
  onRemoveTag,
  locale 
}: {
  data: ConsultationStep
  locale: string
  onChange: (data: ConsultationStep) => void
  translations: any
  onAddTag: (category: any, value: string) => void
  onRemoveTag: (category: any, index: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="!text-white" style={{ color: 'white' }}>{translations.title}</CardTitle>
        <CardDescription className="dark:text-gray-300">{translations.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Consultation Types */}
        <div>
          <Label className="!text-white" style={{ color: 'white' }}>
            {translations.fields.consultationTypes.label}
            <span className="text-destructive ml-1">*</span>
          </Label>
          <div className="flex flex-wrap gap-2 mt-2 mb-3">
            {data.consultation_types.map((type, index) => (
              <Badge key={index} variant="secondary" className="gap-2">
                {type}
                <button
                  type="button"
                  onClick={() => onRemoveTag('consultation_types', index)}
                  className="hover:text-destructive"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CONSULTATION_TYPES.filter(type => !data.consultation_types.includes(type)).map((type) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddTag('consultation_types', type)}
                className="h-8 text-xs justify-start"
              >
                + {type}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            {translations.fields.consultationTypes.help}
          </p>
        </div>

        {/* Availability Days */}
        <div>
          <Label className="!text-white" style={{ color: 'white' }}>
            {translations.fields.availability.label}
            <span className="text-destructive ml-1">*</span>
          </Label>
          <div className="flex flex-wrap gap-2 mt-2 mb-3">
            {data.availability_days.map((day, index) => (
              <Badge key={index} variant="secondary" className="gap-2">
                {day}
                <button
                  type="button"
                  onClick={() => onRemoveTag('availability_days', index)}
                  className="hover:text-destructive"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {DAYS_OF_WEEK.filter(day => !data.availability_days.includes(day)).map((day) => (
              <Button
                key={day}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddTag('availability_days', day)}
                className="h-8 text-xs"
              >
                + {day}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            {translations.fields.availability.help}
          </p>
        </div>

        {/* Time Zones */}
        <div>
          <Label className="!text-white" style={{ color: 'white' }}>{translations.fields.timeZones.label}</Label>
          <div className="flex flex-wrap gap-2 mt-2 mb-3">
            {data.time_zones.map((tz, index) => (
              <Badge key={index} variant="secondary" className="gap-2">
                {tz}
                <button
                  type="button"
                  onClick={() => onRemoveTag('time_zones', index)}
                  className="hover:text-destructive"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <Select
            onValueChange={(value) => {
              if (value && !data.time_zones.includes(value)) {
                onAddTag('time_zones', value)
              }
            }}
          >
            <SelectTrigger className="w-48 !bg-gray-800 !border-gray-600 !text-white" style={{ backgroundColor: '#1f2937', borderColor: '#4b5563', color: 'white' }}>
              <SelectValue placeholder={translations.fields.timeZones.placeholder} />
            </SelectTrigger>
            <SelectContent className="!bg-gray-800 !border-gray-600" style={{ backgroundColor: '#1f2937', borderColor: '#4b5563' }}>
              {TIME_ZONES.filter(tz => !data.time_zones.includes(tz)).map((tz) => (
                <SelectItem key={tz} value={tz} className="!text-white hover:!bg-gray-700" style={{ color: 'white' }}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
            {translations.fields.timeZones.help}
          </p>
        </div>

        {/* Max Sessions Per Week */}
        <div>
          <Label htmlFor="max_sessions" className="!text-white" style={{ color: 'white' }}>
            {translations.fields.maxSessions.label}
          </Label>
          <Input
            id="max_sessions"
            type="number"
            min="1"
            max="40"
            value={data.max_sessions_per_week || ''}
            onChange={(e) => onChange({ 
              ...data, 
              max_sessions_per_week: e.target.value ? Number(e.target.value) : null 
            })}
            dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}
            className={cn(
              "max-w-32 rtl:text-right rtl:placeholder:text-right !bg-gray-800 !border-gray-600 !text-white",
              locale.startsWith('ar') ? "[direction:rtl] [unicode-bidi:plaintext]" : ""
            )}
            style={{
              backgroundColor: '#1f2937',
              borderColor: '#4b5563',
              color: 'white',
              ...(locale.startsWith('ar') ? { direction: 'rtl', unicodeBidi: 'plaintext' } : {})
            }}
            placeholder={translations.fields.maxSessions.placeholder}
          />
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            {translations.fields.maxSessions.help}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}