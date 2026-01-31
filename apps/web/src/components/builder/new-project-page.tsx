'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ClientOnly } from '@/components/ui/client-only'
import Icon from '@/components/ui/icon'
import { IdeaCaptureInput } from '@/components/shared/idea-capture-input'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { UserMenu } from '@/components/ui/user-menu'
import { useRouter } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { fetchWithBalanceHandling, isBalanceError } from '@/utils/api-client'
import { getLocalizedPlanName } from '@/utils/plan-names'
import { useEffect, useRef, useState } from 'react'
import { BuildStepsDisplay } from './build-steps-display'
import { OnboardingWizard, type WizardData, type WizardTranslations } from './onboarding-wizard'
import { InfraModeSelector, type InfraMode } from './infrastructure/InfraModeSelector'
import { TemplateGallery, type TemplateGalleryTemplate } from './template-gallery'
import { getAllTemplates, type TemplateId, type TemplateTier } from '@sheenapps/templates'
// RTL detection utility - minimal usage for dir attributes only
const isRTLLocale = (locale: string) => locale.startsWith('ar')

// Local storage key for wizard preference
const WIZARD_PREFERENCE_KEY = 'sheenapps_use_wizard'

// Note: We now use crypto.randomUUID() for database compatibility
// The project name will be generated from the business idea in the workspace hook

interface NewProjectPageProps {
  translations: {
    navigation: {
      builder: string
    }
    auth: {
      signInButton: string
    }
    builder: {
      newProject: {
        title: string
        subtitle: string
        placeholder: string
        signInPlaceholder: string
        signInRequired: string
        signInMessage: string
        signInToStartBuilding: string
        examples: string[]
        startBuilding: string
        useVoice: string
        uploadFiles: string
        // Wizard toggle translations
        useWizard?: string
        usePrompt?: string
        wizardDescription?: string
        promptDescription?: string
      }
      templates: {
        title: string
        subtitle: string
        viewAll: string
        allCategories: string
        preview: string
        useTemplate: string
        proRequired: string
        features: string
        categories: {
          retail: string
          services: string
          technology: string
          platform: string
          food: string
          creative: string
          education: string
          corporate: string
          health: string
          publishing: string
          events: string
          'real-estate': string
        }
        items: {
          ecommerce: { name: string; description: string }
          booking: { name: string; description: string }
          restaurant: { name: string; description: string }
          portfolio: { name: string; description: string }
          'course-platform': { name: string; description: string }
          'business-landing': { name: string; description: string }
          'gym-fitness': { name: string; description: string }
          blog: { name: string; description: string }
          saas: { name: string; description: string }
          marketplace: { name: string; description: string }
          'real-estate': { name: string; description: string }
          'events-ticketing': { name: string; description: string }
        }
      }
      form: {
        businessIdea: string
        tryExamples: string
      }
      planStatus?: {
        plan: string
        unlimitedGenerations: string
        generationsRemaining: string
        upgrade: string
      }
      wizard?: WizardTranslations
    }
    pricing: {
      plans: {
        free: { name: string; description: string }
        starter: { name: string; description: string }
        growth: { name: string; description: string }
        scale: { name: string; description: string }
      }
    }
    infrastructure?: {
      modeSelection: {
        title: string
        subtitle: string
        easyMode: {
          title: string
          badge: string
          description: string
          features: string[]
          cta: string
        }
        proMode: {
          title: string
          description: string
          features: string[]
          cta: string
        }
      }
    }
    common: {
      loading: string
      error: string
      retry: string
    }
  }
  locale: string
}

// Templates are now imported from @sheenapps/templates package
// No need for hardcoded factory function

export function NewProjectPage({ translations, locale }: NewProjectPageProps) {
  const router = useRouter()
  const { user, isAuthenticated, sessionLimits, canPerformAction, requestUpgrade, logout, openCreditsModal } = useAuthStore()

  // Get all templates from shared package
  const allTemplates = getAllTemplates()

  // RTL detection for this locale - minimal usage for dir attributes
  const isRTL = isRTLLocale(locale)

  // Hydration-safe auth state
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Wizard mode state - check localStorage for preference (default to wizard for Arabic)
  const [showWizard, setShowWizard] = useState(false)
  const hasWizardTranslations = !!translations.builder.wizard

  // Load wizard preference from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && hasWizardTranslations) {
      const savedPref = localStorage.getItem(WIZARD_PREFERENCE_KEY)
      // Default to wizard for Arabic locales (better for non-technical users)
      const defaultToWizard = isRTL
      setShowWizard(savedPref !== null ? savedPref === 'true' : defaultToWizard)
    }
  }, [hasWizardTranslations, isRTL])

  // Toggle wizard mode and save preference
  const toggleWizardMode = (useWizard: boolean) => {
    setShowWizard(useWizard)
    if (typeof window !== 'undefined') {
      localStorage.setItem(WIZARD_PREFERENCE_KEY, String(useWizard))
    }
  }

  // Transform wizard data to natural language prompt
  const wizardDataToPrompt = (data: WizardData): string => {
    const parts: string[] = []

    // Site type mapping to natural language (locale-aware)
    const siteTypeMap: Record<string, { en: string; ar: string }> = {
      portfolio: { en: 'portfolio website', ar: 'موقع معرض أعمال' },
      business: { en: 'business website', ar: 'موقع شركة' },
      store: { en: 'online store', ar: 'متجر أونلاين' },
      blog: { en: 'blog', ar: 'مدونة' },
      other: { en: 'website', ar: 'موقع' }
    }

    // Style mapping
    const styleMap: Record<string, { en: string; ar: string }> = {
      modern: { en: 'modern and clean', ar: 'عصري ونضيف' },
      classic: { en: 'classic and elegant', ar: 'كلاسيكي وراقي' },
      bold: { en: 'bold and vibrant', ar: 'جريء ولافت' },
      minimal: { en: 'minimal and focused', ar: 'بسيط ومركز' }
    }

    const lang = isRTL ? 'ar' : 'en'

    // Build the prompt
    if (isRTL) {
      // Arabic prompt structure
      if (data.siteType) {
        parts.push(`عايز أعمل ${siteTypeMap[data.siteType]?.[lang] || data.siteType}`)
      }
      if (data.businessName) {
        parts.push(`اسمه "${data.businessName}"`)
      }
      if (data.industry) {
        parts.push(`في مجال ${data.industry}`)
      }
      if (data.style) {
        parts.push(`بستايل ${styleMap[data.style]?.[lang] || data.style}`)
      }
    } else {
      // English prompt structure
      if (data.style) {
        parts.push(`I want a ${styleMap[data.style]?.[lang] || data.style}`)
      }
      if (data.siteType) {
        parts.push(siteTypeMap[data.siteType]?.[lang] || data.siteType)
      }
      if (data.businessName) {
        parts.push(`for "${data.businessName}"`)
      }
      if (data.industry) {
        parts.push(`in the ${data.industry} industry`)
      }
    }

    return parts.join(' ').trim() || (isRTL ? 'عايز أعمل موقع' : 'I want to build a website')
  }

  // Handle wizard completion
  const handleWizardComplete = (data: WizardData) => {
    const generatedPrompt = wizardDataToPrompt(data)
    setBusinessIdea(generatedPrompt)
    // Auto-start building after wizard
    setTimeout(() => {
      // Set the business idea and trigger build
      handleStartBuildingWithIdea(generatedPrompt)
    }, 100)
  }

  // Handle wizard skip
  const handleWizardSkip = () => {
    toggleWizardMode(false)
  }

  const [businessIdea, setBusinessIdea] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBuildSteps, setShowBuildSteps] = useState(false)
  const [balanceError, setBalanceError] = useState<{
    message: string
    recommendation?: {
      suggestedPackage: string
      costToComplete: number
      purchaseUrl: string
    }
  } | null>(null)

  // Infrastructure mode selection (Easy Mode vs Pro Mode)
  const [infraMode, setInfraMode] = useState<InfraMode>('easy') // Default to Easy Mode

  // Enhanced double-submission prevention with session tracking
  const isProcessingRef = useRef(false)
  const sessionTrackingRef = useRef(new Set<string>())

  // WORKER TEAM DEBUGGING: Component lifecycle tracking
  // Component lifecycle tracking (debug logs removed for production)

  // Core building function that accepts a prompt directly
  const handleStartBuildingWithIdea = async (idea: string) => {
    if (!idea.trim()) return

    // Enhanced multi-layer double-submission prevention
    const ideaHash = idea.trim().slice(0, 100) // Use idea preview as unique key
    const sessionKey = `${user?.id || 'anon'}-${ideaHash}`

    // Check session-level tracking to prevent duplicate requests
    if (sessionTrackingRef.current.has(sessionKey)) {
      console.log('🚫 [NextJS] Project creation blocked - duplicate session key:', {
        sessionKey: sessionKey.slice(0, 20) + '...',
        businessIdea: idea.slice(0, 50) + '...',
        trackingSetSize: sessionTrackingRef.current.size
      });
      return
    }

    // Standard double-submission prevention
    if (isLoading || isProcessingRef.current) {
      console.log('🚫 [NextJS] Project creation blocked - already in progress:', {
        isLoading,
        isProcessingRef: isProcessingRef.current,
        businessIdea: idea.slice(0, 50) + '...'
      });
      return
    }

    // Set all prevention mechanisms
    isProcessingRef.current = true
    sessionTrackingRef.current.add(sessionKey)
    setIsLoading(true)
    setError(null)
    setBalanceError(null)
    setShowBuildSteps(true)
    // Close wizard if open
    if (showWizard) {
      setShowWizard(false)
    }

    console.log('[NextJS] Starting project creation:', {
      timestamp: new Date().toISOString(),
      businessIdea: idea.slice(0, 100) + '...',
      source: showWizard ? 'wizard' : 'direct-input'
    });

    try {
      const response = await fetchWithBalanceHandling('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessIdea: idea.trim(),
          infraMode // Include infrastructure mode selection
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Failed to create project:', errorData)
        setIsLoading(false)
        setShowBuildSteps(false)

        if (errorData.code === 'QUOTA_EXCEEDED') {
          requestUpgrade('create more projects')
        } else {
          setError(errorData.message || errorData.error || 'Failed to create project. Please try again.')
        }
        return
      }

      const { data } = await response.json()
      const { project } = data

      console.log('[NextJS] Project creation successful:', {
        timestamp: new Date().toISOString(),
        projectId: project.id,
        projectName: project.name
      });

      router.push(`/builder/workspace/${project.id}`)
    } catch (error) {
      if (isBalanceError(error)) {
        setBalanceError({
          message: error.message,
          recommendation: error.data.recommendation
        })
      } else {
        console.error('[NextJS] Error creating project:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setError(`Failed to create project: ${errorMessage}. Please check your connection and try again.`)
      }
    } finally {
      setIsLoading(false)
      setShowBuildSteps(false)
      isProcessingRef.current = false

      setTimeout(() => {
        sessionTrackingRef.current.delete(sessionKey)
      }, 5000)
    }
  }

  // Wrapper that uses the current businessIdea state
  const handleStartBuilding = async () => {
    if (!businessIdea.trim()) return
    await handleStartBuildingWithIdea(businessIdea)
  }

  const handleTemplateSelect = async (templateId: TemplateId) => {
    // Get template from package to check tier
    const template = allTemplates.find(t => t.id === templateId)
    if (!template) return

    // Check if PRO template and user is free tier
    if (template.tier === 'pro' && (!user || user.plan === 'free')) {
      requestUpgrade('access PRO templates')
      return
    }

    // Enhanced multi-layer double-submission prevention for templates
    const sessionKey = `${user?.id || 'anon'}-template-${templateId}`

    // Check session-level tracking to prevent duplicate requests
    if (sessionTrackingRef.current.has(sessionKey)) {
      console.log('🚫 [NextJS] Template project creation blocked - duplicate session key:', {
        sessionKey,
        templateId,
        trackingSetSize: sessionTrackingRef.current.size
      });
      return
    }

    // Standard double-submission prevention
    if (isLoading || isProcessingRef.current) {
      console.log('🚫 [NextJS] Template project creation blocked - already in progress:', {
        isLoading,
        isProcessingRef: isProcessingRef.current,
        templateId
      });
      return
    }

    // Set all prevention mechanisms
    isProcessingRef.current = true
    sessionTrackingRef.current.add(sessionKey)
    setIsLoading(true)
    setError(null) // Clear any previous errors
    setBalanceError(null) // Clear any previous balance errors

    // Log template project creation attempt for worker team debugging
    console.log('[NextJS] Starting project creation from template:', {
      timestamp: new Date().toISOString(),
      templateId,
      tier: template.tier,
      userId: user?.id?.slice(0, 8),
      source: 'new-project-page-template',
      preventionLayer: 'multi-layer-guards-active'
    });

    try {
      // Create project via API first (with automatic balance error handling)
      const response = await fetchWithBalanceHandling('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: templateId,
          name: translations.builder.templates.items[templateId as keyof typeof translations.builder.templates.items]?.name || 'New Project',
          infraMode // Include infrastructure mode for consistency
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('Failed to create project:', error)
        setIsLoading(false)

        // Handle quota exceeded error
        if (error.code === 'QUOTA_EXCEEDED') {
          // Show upgrade modal with context
          requestUpgrade('create more projects')
        } else {
          // TODO: Show error toast for other errors
        }
        return
      }

      const { data } = await response.json()
      const { project } = data

      // Log successful template project creation for worker team debugging
      console.log('[NextJS] Template project creation successful, redirecting:', {
        timestamp: new Date().toISOString(),
        projectId: project.id,
        projectName: project.name,
        templateId,
        source: 'new-project-page-template'
      });

      // Redirect to workspace without query params
      router.push(`/builder/workspace/${project.id}`)
    } catch (error) {
      console.error('[NextJS] Error creating project from template:', error)

      // Handle balance errors with friendly UI
      if (isBalanceError(error)) {
        setBalanceError({
          message: error.message,
          recommendation: error.data.recommendation
        })
      } else {
        // TODO: Show error toast for other errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setError(`Failed to create project from template: ${errorMessage}. Please try again.`)
      }
    } finally {
      // Always cleanup state in finally block
      setIsLoading(false)
      isProcessingRef.current = false

      // Clean up session tracking after delay
      setTimeout(() => {
        sessionTrackingRef.current.delete(sessionKey)
        console.log('🧹 [NextJS] Template session key cleaned up:', {
          sessionKey,
          remainingKeys: sessionTrackingRef.current.size
        });
      }, 5000) // 5 second cooldown
    }
  }

  const fillExample = (example: string) => {
    setBusinessIdea(example)
  }

  return (
    <>
      {/* Build Steps Display */}
      {showBuildSteps && (
        <BuildStepsDisplay
          businessIdea={businessIdea}
          onComplete={() => {
            // The redirect will happen from the API response
            // This is just in case the animation completes before the API
          }}
        />
      )}

      <div className="min-h-screen bg-background">
        {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 logo-container">
            <img
              src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
              alt="SheenApps"
              className="h-8"
            />
            <span className="text-lg font-semibold text-foreground">{translations.navigation.builder}</span>
          </div>

          <div className="flex items-center gap-4 user-menu-container">
            <ThemeToggle />
            <ClientOnly fallback={
              <Button
                variant="outline"
                size="sm"
                onClick={() => useAuthStore.getState().openLoginModal()}
              >
                <Icon name="user" className="w-4 h-4 me-2" />
                {translations.auth.signInButton}
              </Button>
            }>
              {isAuthenticated && user ? (
                <UserMenu
                  user={user}
                  onLogout={logout}
                  variant="header"
                  showPlan={true}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => useAuthStore.getState().openLoginModal()}
                >
                  <Icon name="user" className="w-4 h-4 me-2" />
                  {translations.auth.signInButton}
                </Button>
              )}
            </ClientOnly>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              {translations.builder.newProject.title}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {translations.builder.newProject.subtitle}
            </p>

            {/* Wizard/Prompt Toggle - Only show when wizard translations exist and user is authenticated */}
            <ClientOnly>
              {hasWizardTranslations && isAuthenticated && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <div className="inline-flex rounded-lg bg-muted p-1">
                    <button
                      onClick={() => toggleWizardMode(true)}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                        showWizard
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon name="sparkles" className="w-4 h-4 inline-block me-2" />
                      {translations.builder.newProject.useWizard || (isRTL ? 'معالج خطوة بخطوة' : 'Step-by-Step')}
                    </button>
                    <button
                      onClick={() => toggleWizardMode(false)}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                        !showWizard
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon name="edit" className="w-4 h-4 inline-block me-2" />
                      {translations.builder.newProject.usePrompt || (isRTL ? 'اكتب فكرتك' : 'Describe Your Idea')}
                    </button>
                  </div>
                </div>
              )}
            </ClientOnly>
          </div>

          {/* Authentication Status Notice */}
          <ClientOnly>
            {!isAuthenticated && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 mb-8">
                <div className="flex items-center gap-3">
                  <Icon name="lock" className="w-5 h-5 text-warning me-3" />
                  <div>
                    <div className="font-medium text-foreground">{translations.builder.newProject.signInRequired}</div>
                    <div className="text-sm text-muted-foreground">
                      {translations.builder.newProject.signInMessage}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isAuthenticated && user && (
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 mb-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-accent rounded-full"></div>
                  <div>
                    <div className="font-medium text-foreground capitalize">
                      {isRTL
                        ? `${translations.builder.planStatus?.plan || 'Plan'} ${getLocalizedPlanName(user.plan, translations.pricing)}`
                        : `${getLocalizedPlanName(user.plan, translations.pricing)} ${translations.builder.planStatus?.plan || 'Plan'}`
                      }
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sessionLimits.maxGenerations === -1
                        ? (translations.builder.planStatus?.unlimitedGenerations || 'Unlimited generations')
                        : (translations.builder.planStatus?.generationsRemaining || '{count} generations remaining').replace('{count}', String(sessionLimits.maxGenerations))
                      }
                    </div>
                  </div>
                </div>
                {user.plan === 'free' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => requestUpgrade('unlimited generations')}
                  >
                    {translations.builder.planStatus?.upgrade || 'Upgrade'}
                  </Button>
                )}
              </div>
            </div>
            )}
          </ClientOnly>

          {/* Infrastructure Mode Selection */}
          {translations.infrastructure?.modeSelection && (
            <div className="mb-8">
              <InfraModeSelector
                value={infraMode}
                onChange={setInfraMode}
                disabled={isLoading || (isHydrated && !isAuthenticated)}
                translations={translations.infrastructure.modeSelection}
              />
            </div>
          )}

          {/* Onboarding Wizard OR Direct Input */}
          {showWizard && hasWizardTranslations && translations.builder.wizard ? (
            /* Wizard Mode */
            <div className="mb-8">
              <OnboardingWizard
                translations={translations.builder.wizard}
                locale={locale}
                onComplete={handleWizardComplete}
                onSkip={handleWizardSkip}
              />
            </div>
          ) : (
            /* Direct Input Mode */
            <Card className="mb-8 bg-card border-border">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-3">
                      {translations.builder.form.businessIdea}
                    </label>
                    <IdeaCaptureInput
                      variant="page"
                      value={businessIdea}
                      onChange={setBusinessIdea}
                      onSubmit={handleStartBuilding}
                      isSubmitting={isLoading}
                      submitText={translations.builder.newProject.startBuilding}
                      voiceText={translations.builder.newProject.useVoice}
                      placeholder={isHydrated && isAuthenticated ? translations.builder.newProject.placeholder : translations.builder.newProject.signInPlaceholder}
                      disabled={isLoading || (isHydrated && !isAuthenticated)}
                      data-testid="idea-input"
                    />
                  </div>

                {/* Error Alert */}
                {error && (
                  <Alert variant="destructive" className="bg-error/10 border-error/20">
                    <Icon name="alert-circle" className="h-4 w-4" />
                    <AlertTitle>Unable to process your idea</AlertTitle>
                    <AlertDescription className="mt-2">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Balance Error Banner */}
                {balanceError && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <Icon name="credit-card" className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                          Insufficient AI Time Balance
                        </h3>
                        <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                          {(() => {
                            const parts = []

                            if (balanceError.recommendation?.costToComplete) {
                              parts.push(`You need ${balanceError.recommendation.costToComplete} more AI time minutes to create this project.`)
                            } else if (balanceError.message) {
                              parts.push(balanceError.message)
                            } else {
                              parts.push('You need more AI time to continue building.')
                            }

                            if (balanceError.recommendation?.suggestedPackage) {
                              parts.push(`The ${balanceError.recommendation.suggestedPackage} package would cover this.`)
                            }

                            return parts.join(' ')
                          })()}
                        </p>
                        <button
                          onClick={() => {
                            openCreditsModal({
                              message: balanceError.recommendation?.suggestedPackage || 'Add more AI time credits to continue building your project',
                              costToComplete: balanceError.recommendation?.costToComplete,
                              suggestedPackage: balanceError.recommendation?.suggestedPackage
                            })
                          }}
                          className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center"
                        >
                          <Icon name="plus" className="w-4 h-4 me-2" />
                          Add AI Time Credits
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Example Ideas - Only show for authenticated users */}
                <ClientOnly>
                  {isAuthenticated && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-3">{translations.builder.form.tryExamples}</p>
                      <div className="flex flex-wrap gap-2 example-buttons">
                        {translations.builder.newProject.examples.map((example, index) => (
                          <button
                            key={index}
                            onClick={() => fillExample(example)}
                            className="text-sm px-3 py-1 bg-secondary hover:bg-card text-foreground hover:text-accent rounded-full transition-colors"
                            disabled={isLoading}
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </ClientOnly>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Template Gallery - Only show for authenticated users */}
          {isAuthenticated && (
            <TemplateGallery
              templates={allTemplates.map((template) => {
                const templateTranslations = translations.builder.templates.items[template.id as keyof typeof translations.builder.templates.items]
                return {
                  id: template.id,
                  name: templateTranslations?.name || template.id,
                  description: templateTranslations?.description || '',
                  emoji: template.emoji,
                  tier: template.tier,
                  category: template.category,
                  categoryKey: template.categoryKey,
                } as TemplateGalleryTemplate
              })}
              translations={{
                title: translations.builder.templates.title,
                subtitle: translations.builder.templates.subtitle,
                viewAll: translations.builder.templates.viewAll,
                allCategories: translations.builder.templates.allCategories,
                preview: translations.builder.templates.preview,
                useTemplate: translations.builder.templates.useTemplate,
                proRequired: translations.builder.templates.proRequired,
                features: translations.builder.templates.features,
                categories: translations.builder.templates.categories,
              }}
              onSelectTemplate={handleTemplateSelect}
              canAccessPro={user?.plan !== 'free'}
            />
          )}
        </div>
      </main>
    </div>
    </>
  )
}
