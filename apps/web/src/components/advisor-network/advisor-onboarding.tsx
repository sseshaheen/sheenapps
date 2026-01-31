'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Progress } from '@/components/ui/progress'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { AdvisorAPIService, type AdvisorProfile } from '@/services/advisor-api'
import { useAuthStore } from '@/store'
import { AdvisorStateInfo } from '@/utils/advisor-state'
import { logger } from '@/utils/logger'
import { useEffect, useState } from 'react'

interface AdvisorOnboardingProps {
  translations: {
    advisor: {
      onboarding: {
        title: string
        subtitle: string
        progress: string
        gates: {
          stripe: {
            title: string
            description: string
            connected: string
            action: string
            policy: string
          }
          calcom: {
            title: string
            description: string
            connected: string
            action: string
            helpText: string
          }
          profile: {
            title: string
            description: string
            completed: string
            action: string
            requirements: string[]
          }
        }
        goLive: {
          title: string
          description: string
          action: string
          loading: string
          success: string
        }
        status: {
          complete: string
          pending: string
          inProgress: string
        }
        loading: {
          profile: string
        }
        errors: {
          profileNotFound: string
          profileNotFoundDescription: string
          completeApplication: string
        }
        help: {
          title: string
          description: string
          contactSupport: string
        }
        ui: {
          requirements: string
          redirecting: string
          percentComplete: string
          of: string
          complete: string
        }
      }
    }
    common: {
      loading: string
      error: string
      continue: string
      back: string
    }
  }
  locale: string
  advisorState: AdvisorStateInfo
}

interface OnboardingGate {
  id: 'stripe' | 'calcom' | 'profile'
  title: string
  description: string
  completed: boolean
  inProgress: boolean
  icon: 'credit-card' | 'calendar' | 'user'
  action: string
  href?: string
  requirements?: string[]
  helpText?: string
  policy?: string
}

export function AdvisorOnboarding({
  translations,
  locale,
  advisorState
}: AdvisorOnboardingProps) {
  const router = useRouter()
  const { user } = useAuthStore()

  const [isActivating, setIsActivating] = useState(false)
  const [activationSuccess, setActivationSuccess] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)
  const [advisorProfile, setAdvisorProfile] = useState<AdvisorProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load advisor profile on mount
  useEffect(() => {
    if (!user?.id) return

    const loadProfile = async () => {
      try {
        setIsLoading(true)

        // Use Next.js API proxy route instead of direct Worker API call
        const response = await fetch('/api/advisor/profile', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          if (response.status === 404) {
            // Profile doesn't exist, user might need to apply first
            router.push('/advisor/apply')
            return
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        if (result.success && result.data) {
          setAdvisorProfile(result.data)
          logger.info('✅ Loaded advisor profile:', { approvalStatus: result.data.approval_status })
        } else {
          throw new Error(result.error || 'Failed to load advisor profile')
        }
      } catch (error) {
        logger.error('❌ Failed to load advisor profile:', error)
        // If profile doesn't exist, user might need to apply first
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('HTTP 404'))) {
          router.push('/advisor/apply')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [user?.id, locale, router])

  // Get onboarding progress from advisor profile
  const onboardingProgress = advisorProfile?.onboarding_steps || {
    profile_completed: false,
    skills_added: false,
    availability_set: false,
    stripe_connected: false,
    cal_connected: false,
    admin_approved: false
  }

  // Define the 3 gates for onboarding
  const gates: OnboardingGate[] = [
    {
      id: 'stripe',
      title: translations.advisor.onboarding.gates.stripe.title,
      description: translations.advisor.onboarding.gates.stripe.description,
      completed: onboardingProgress.stripe_connected,
      inProgress: false,
      icon: 'credit-card',
      action: translations.advisor.onboarding.gates.stripe.action,
      href: `/${locale}/advisor/dashboard/settings/payments`,
      policy: translations.advisor.onboarding.gates.stripe.policy
    },
    {
      id: 'calcom',
      title: translations.advisor.onboarding.gates.calcom.title,
      description: translations.advisor.onboarding.gates.calcom.description,
      completed: onboardingProgress.cal_connected,
      inProgress: false,
      icon: 'calendar',
      action: translations.advisor.onboarding.gates.calcom.action,
      href: `/${locale}/advisor/dashboard/settings/calendar`,
      helpText: translations.advisor.onboarding.gates.calcom.helpText
    },
    {
      id: 'profile',
      title: translations.advisor.onboarding.gates.profile.title,
      description: translations.advisor.onboarding.gates.profile.description,
      completed: onboardingProgress.profile_completed && onboardingProgress.skills_added,
      inProgress: false,
      icon: 'user',
      action: translations.advisor.onboarding.gates.profile.action,
      href: `/${locale}/advisor/dashboard/profile`,
      requirements: translations.advisor.onboarding.gates.profile.requirements
    }
  ]

  // Calculate completion progress
  const completedGates = gates.filter(gate => gate.completed).length
  const progressPercentage = (completedGates / gates.length) * 100
  const allGatesComplete = completedGates === gates.length

  // Handle activation (Go Live)
  const handleActivation = async () => {
    if (!allGatesComplete || !user?.id || !advisorProfile) return

    setIsActivating(true)
    setActivationError(null)

    try {
      logger.info('🚀 Activating advisor profile', { userId: user.id.slice(0, 8) })

      // Update profile to enable bookings
      await AdvisorAPIService.updateProfile(
        advisorProfile.id,
        { is_accepting_bookings: true },
        user.id
      )

      // Update local state
      setAdvisorProfile(prev => prev ? { ...prev, is_accepting_bookings: true } : null)
      setActivationSuccess(true)

      logger.info('✅ Advisor profile activated successfully')

      // Redirect to dashboard after success
      setTimeout(() => {
        router.push('/advisor/dashboard')
      }, 2000)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to activate profile'
      setActivationError(errorMessage)
      logger.error('❌ Failed to activate advisor profile:', error)
    } finally {
      setIsActivating(false)
    }
  }

  // Handle gate action
  const handleGateAction = (gate: OnboardingGate) => {
    if (gate.href) {
      router.push(gate.href)
    } else {
      logger.warn('No href defined for gate:', gate.id)
    }
  }

  const getGateStatusIcon = (gate: OnboardingGate): 'check-circle' | 'loader-2' | 'credit-card' | 'calendar' | 'user' => {
    if (gate.completed) return 'check-circle'
    if (gate.inProgress) return 'loader-2'
    return gate.icon
  }

  const getGateStatusColor = (gate: OnboardingGate) => {
    if (gate.completed) return 'text-green-600 bg-green-100 dark:bg-green-900/30'
    if (gate.inProgress) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30'
    return 'text-gray-600 bg-gray-100 dark:bg-gray-800'
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Icon name="loader-2" className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{translations.advisor.onboarding.loading.profile}</p>
        </div>
      </div>
    )
  }

  // Ensure we have profile data
  if (!advisorProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <Icon name="alert-circle" className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-xl font-semibold mb-2 text-foreground">{translations.advisor.onboarding.errors.profileNotFound}</h2>
          <p className="text-muted-foreground mb-4">
            {translations.advisor.onboarding.errors.profileNotFoundDescription}
          </p>
          <Button onClick={() => router.push('/advisor/apply')}>
            {translations.advisor.onboarding.errors.completeApplication}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-16 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Icon name="rocket" className="w-10 h-10 text-primary" />
              </div>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
              {translations.advisor.onboarding.title}
            </h1>

            <p className="text-xl text-muted-foreground mb-8">
              {translations.advisor.onboarding.subtitle}
            </p>

            {/* Progress Overview */}
            <div className="max-w-md mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  {translations.advisor.onboarding.progress}
                </span>
                <span className="text-sm text-muted-foreground">
                  {completedGates} {translations.advisor.onboarding.ui.of} {gates.length} {translations.advisor.onboarding.ui.complete}
                </span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
              <div className="text-center mt-2">
                <Badge variant={allGatesComplete ? "default" : "secondary"}>
                  {Math.round(progressPercentage)}{translations.advisor.onboarding.ui.percentComplete}
                </Badge>
              </div>
            </div>
          </div>

          {/* Onboarding Gates */}
          <div className="space-y-6 mb-12">
            {gates.map((gate, index) => (
              <Card
                key={gate.id}
                className={cn(
                  "transition-all duration-200",
                  gate.completed && "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20",
                  gate.inProgress && "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20"
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
                        getGateStatusColor(gate)
                      )}>
                        <Icon
                          name={getGateStatusIcon(gate)}
                          className={cn(
                            "w-6 h-6",
                            gate.inProgress && "animate-spin"
                          )}
                        />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-lg text-start">{gate.title}</CardTitle>
                          <Badge variant={gate.completed ? "default" : "secondary"}>
                            {gate.completed
                              ? translations.advisor.onboarding.status.complete
                              : translations.advisor.onboarding.status.pending
                            }
                          </Badge>
                        </div>
                        <CardDescription className="text-base text-start">
                          {gate.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* Requirements for profile gate */}
                  {gate.requirements && !gate.completed && (
                    <div className="mb-4 text-start">
                      <h4 className="text-sm font-medium mb-2 text-start">{translations.advisor.onboarding.ui.requirements}</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-none ps-0">
                        {gate.requirements.map((req, i) => (
                          <li key={i} className="flex items-start gap-2 text-start rtl:flex-row-reverse">
                            <Icon name="check-circle" className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-start flex-1">{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Help text */}
                  {gate.helpText && (
                    <Alert className="mb-4">
                      <Icon name="info" className="h-4 w-4" />
                      <AlertDescription>{gate.helpText}</AlertDescription>
                    </Alert>
                  )}

                  {/* Policy information for Stripe */}
                  {gate.policy && (
                    <Alert className="mb-4">
                      <Icon name="shield-check" className="h-4 w-4" />
                      <AlertDescription>{gate.policy}</AlertDescription>
                    </Alert>
                  )}

                  {/* Action Button */}
                  <div className="flex">
                    {gate.completed ? (
                      <Button variant="ghost" disabled className="text-green-600">
                        <Icon name="check-circle" className="w-4 h-4 me-2" />
                        {gate.id === 'stripe' && translations.advisor.onboarding.gates.stripe.connected}
                        {gate.id === 'calcom' && translations.advisor.onboarding.gates.calcom.connected}
                        {gate.id === 'profile' && translations.advisor.onboarding.gates.profile.completed}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleGateAction(gate)}
                        disabled={gate.inProgress}
                        variant="outline"
                      >
                        {gate.inProgress ? (
                          <Icon name="loader-2" className="w-4 h-4 me-2 animate-spin" />
                        ) : (
                          <Icon name={gate.icon} className="w-4 h-4 me-2" />
                        )}
                        {gate.action}
                      </Button>
                    )}
                  </div>
                </CardContent>

                {/* Progress connector */}
                {index < gates.length - 1 && (
                  <div className="flex justify-center pb-2">
                    <div className={cn(
                      "w-0.5 h-8",
                      gate.completed ? "bg-green-300 dark:bg-green-700" : "bg-gray-200 dark:bg-gray-700"
                    )} />
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Go Live Section */}
          <Card className={cn(
            "border-2 transition-all duration-200",
            allGatesComplete
              ? "border-primary bg-primary/5"
              : "border-gray-200 dark:border-gray-700 opacity-75"
          )}>
            <CardHeader className="text-center">
              <div className="mb-4">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mx-auto",
                  allGatesComplete
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                )}>
                  <Icon name="star" className="w-8 h-8" />
                </div>
              </div>

              <CardTitle className="text-2xl mb-2">
                {translations.advisor.onboarding.goLive.title}
              </CardTitle>

              <CardDescription className="text-lg">
                {translations.advisor.onboarding.goLive.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="text-center">
              {activationSuccess ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                    <Icon name="check-circle" className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-green-600 font-semibold">
                    {translations.advisor.onboarding.goLive.success}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {translations.advisor.onboarding.ui.redirecting}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button
                    onClick={handleActivation}
                    disabled={!allGatesComplete || isActivating}
                    size="lg"
                    className="px-8"
                  >
                    {isActivating ? (
                      <>
                        <Icon name="loader-2" className="w-5 h-5 me-2 animate-spin" />
                        {translations.advisor.onboarding.goLive.loading}
                      </>
                    ) : (
                      <>
                        <Icon name="rocket" className="w-5 h-5 me-2" />
                        {translations.advisor.onboarding.goLive.action}
                      </>
                    )}
                  </Button>

                  {!allGatesComplete && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {translations.advisor.onboarding.goLive.description}
                    </p>
                  )}

                  {activationError && (
                    <Alert variant="destructive">
                      <Icon name="alert-circle" className="h-4 w-4" />
                      <AlertDescription>{activationError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Help Section */}
          <Card className="mt-8">
            <CardContent className="p-6 text-center">
              <Icon name="help-circle" className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">{translations.advisor.onboarding.help.title}</h3>
              <p className="text-muted-foreground mb-4">
                {translations.advisor.onboarding.help.description}
              </p>
              <Button
                variant="outline"
                onClick={() => router.push('/support')}
              >
                <Icon name="mail" className="w-4 h-4 me-2" />
                {translations.advisor.onboarding.help.contactSupport}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
