'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { AdvisorApplicationState, AdvisorStateInfo } from '@/utils/advisor-state'
import { AdvisorStatusTimeline } from './advisor-status-timeline'

interface AdvisorApplicationStatusProps {
  translations: {
    advisor: {
      status: {
        title: string
        states: {
          submitted: {
            title: string
            description: string
            timeline: string
          }
          under_review: {
            title: string
            description: string
            timeline: string
          }
          approved_pending_onboarding: {
            title: string
            description: string
            nextSteps: string[]
          }
          live: {
            title: string
            description: string
            cta: string
          }
          rejected_cooldown: {
            title: string
            description: string
            reapplyDate: string
          }
        }
        actions: {
          continueDraft: string
          viewOnboarding: string
          goToDashboard: string
          contactSupport: string
        }
        timeline: {
          title: string
          items: {
            applied: {
              title: string
              description: string
            }
            review: {
              title: string
              description: string
            }
            decision: {
              title: string
              description: string
            }
            onboarding: {
              title: string
              description: string
            }
            live: {
              title: string
              description: string
            }
          }
          status: {
            completed: string
            current: string
            pending: string
            rejected: string
          }
          estimatedTime: {
            review: string
            decision: string
            onboarding: string
          }
        }
      }
    }
    common: {
      loading: string
      error: string
    }
  }
  locale: string
  advisorState: AdvisorStateInfo
}

export function AdvisorApplicationStatus({
  translations,
  locale,
  advisorState
}: AdvisorApplicationStatusProps) {
  const router = useRouter()
  const [isNavigating, setIsNavigating] = useState(false)

  const handleNavigation = async (path: string) => {
    setIsNavigating(true)
    try {
      router.push(path)
    } catch (error) {
      console.error('Navigation error:', error)
      setIsNavigating(false)
    }
  }

  // Get status info based on current state
  const getStatusInfo = () => {
    switch (advisorState.state) {
      case 'DRAFT':
        return {
          title: 'Application Draft',
          description: 'Your application is saved as a draft. Complete and submit it to begin the review process.',
          badge: { text: 'Draft', variant: 'secondary' as const },
          icon: 'edit-3' as const,
          color: 'blue',
          actions: [
            { 
              label: translations.advisor.status.actions.continueDraft,
              path: `/${locale}/advisor/apply`,
              variant: 'default' as const,
              icon: 'edit-3' as const
            }
          ]
        }

      case 'SUBMITTED':
        return {
          title: translations.advisor.status.states.submitted.title,
          description: translations.advisor.status.states.submitted.description,
          badge: { text: 'Submitted', variant: 'default' as const },
          icon: 'clock' as const,
          color: 'orange',
          timeline: translations.advisor.status.states.submitted.timeline,
          submittedAt: advisorState.metadata?.applicationSubmittedAt,
          actions: [
            {
              label: translations.advisor.status.actions.contactSupport,
              path: `/${locale}/support`,
              variant: 'outline' as const,
              icon: 'help-circle' as const
            }
          ]
        }

      case 'UNDER_REVIEW':
        return {
          title: translations.advisor.status.states.under_review.title,
          description: translations.advisor.status.states.under_review.description,
          badge: { text: 'Under Review', variant: 'default' as const },
          icon: 'search' as const,
          color: 'purple',
          timeline: translations.advisor.status.states.under_review.timeline,
          actions: [
            {
              label: translations.advisor.status.actions.contactSupport,
              path: `/${locale}/support`,
              variant: 'outline' as const,
              icon: 'help-circle' as const
            }
          ]
        }

      case 'APPROVED_PENDING_ONBOARDING':
        const onboardingProgress = advisorState.metadata?.onboardingProgress
        return {
          title: translations.advisor.status.states.approved_pending_onboarding.title,
          description: translations.advisor.status.states.approved_pending_onboarding.description,
          badge: { text: 'Approved', variant: 'default' as const },
          icon: 'check-circle' as const,
          color: 'green',
          onboardingSteps: [
            { 
              label: 'Connect Stripe Account',
              completed: onboardingProgress?.stripeConnected || false,
              icon: 'credit-card' as const
            },
            {
              label: 'Setup Calendar Integration', 
              completed: onboardingProgress?.calcomConnected || false,
              icon: 'calendar' as const
            },
            {
              label: 'Complete Profile',
              completed: onboardingProgress?.profileComplete || false,
              icon: 'user' as const
            }
          ],
          actions: [
            {
              label: translations.advisor.status.actions.viewOnboarding,
              path: `/${locale}/advisor/dashboard/onboarding`,
              variant: 'default' as const,
              icon: 'arrow-right' as const
            }
          ]
        }

      case 'LIVE':
        return {
          title: translations.advisor.status.states.live.title,
          description: translations.advisor.status.states.live.description,
          badge: { text: 'Active', variant: 'default' as const },
          icon: 'check-circle' as const,
          color: 'green',
          actions: [
            {
              label: translations.advisor.status.actions.goToDashboard,
              path: `/${locale}/advisor/dashboard`,
              variant: 'default' as const,
              icon: 'layout-grid' as const
            }
          ]
        }

      case 'REJECTED_COOLDOWN':
        return {
          title: translations.advisor.status.states.rejected_cooldown.title,
          description: translations.advisor.status.states.rejected_cooldown.description,
          badge: { text: 'Rejected', variant: 'destructive' as const },
          icon: 'x-circle' as const,
          color: 'red',
          rejectionReason: advisorState.metadata?.rejectionReason,
          reapplyDate: advisorState.metadata?.reapplicationAllowedAt,
          actions: [
            {
              label: translations.advisor.status.actions.contactSupport,
              path: `/${locale}/support`,
              variant: 'outline' as const,
              icon: 'help-circle' as const
            }
          ]
        }

      default:
        return null
    }
  }

  const statusInfo = getStatusInfo()

  if (!statusInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Icon name="alert-circle" className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Unknown application state</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-16 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <Badge variant={statusInfo.badge.variant} className="px-4 py-2 text-sm font-medium">
                <Icon name={statusInfo.icon} className="w-4 h-4 me-2" />
                {statusInfo.badge.text}
              </Badge>
            </div>
            
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
              {translations.advisor.status.title}
            </h1>
            
            <div className="flex justify-center mb-8">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center",
                statusInfo.color === 'blue' && "bg-blue-100 dark:bg-blue-900/30",
                statusInfo.color === 'orange' && "bg-orange-100 dark:bg-orange-900/30",
                statusInfo.color === 'purple' && "bg-purple-100 dark:bg-purple-900/30",
                statusInfo.color === 'green' && "bg-green-100 dark:bg-green-900/30",
                statusInfo.color === 'red' && "bg-red-100 dark:bg-red-900/30"
              )}>
                <Icon 
                  name={statusInfo.icon} 
                  className={cn(
                    "w-8 h-8",
                    statusInfo.color === 'blue' && "text-blue-600 dark:text-blue-400",
                    statusInfo.color === 'orange' && "text-orange-600 dark:text-orange-400",
                    statusInfo.color === 'purple' && "text-purple-600 dark:text-purple-400",
                    statusInfo.color === 'green' && "text-green-600 dark:text-green-400",
                    statusInfo.color === 'red' && "text-red-600 dark:text-red-400"
                  )}
                />
              </div>
            </div>
          </div>

          {/* Status Card */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-2xl text-center">{statusInfo.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-lg text-center text-muted-foreground">
                {statusInfo.description}
              </p>

              {/* Timeline info for submitted/under review */}
              {statusInfo.timeline && (
                <div className="text-center p-4 bg-muted rounded-lg">
                  <Icon name="clock" className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{statusInfo.timeline}</p>
                  {statusInfo.submittedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted: {new Date(statusInfo.submittedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Onboarding steps for approved users */}
              {statusInfo.onboardingSteps && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-center mb-4">Complete Your Onboarding:</h3>
                  {statusInfo.onboardingSteps.map((step, index) => (
                    <div 
                      key={index}
                      className={cn(
                        "flex items-center p-3 rounded-lg border",
                        step.completed 
                          ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800" 
                          : "bg-muted border-border"
                      )}
                    >
                      <Icon 
                        name={step.completed ? 'check-circle' : step.icon}
                        className={cn(
                          "w-5 h-5 me-3",
                          step.completed ? "text-green-600 dark:text-green-400" : "text-gray-400"
                        )}
                      />
                      <span className={cn(
                        step.completed ? "text-green-800 dark:text-green-200" : "text-gray-700 dark:text-gray-300"
                      )}>
                        {step.label}
                      </span>
                      {step.completed && (
                        <Badge variant="secondary" className="ml-auto">Complete</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Rejection info */}
              {statusInfo.rejectionReason && (
                <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">Reason for Rejection:</h4>
                  <p className="text-red-700 dark:text-red-300">{statusInfo.rejectionReason}</p>
                  {statusInfo.reapplyDate && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                      You can reapply after: {new Date(statusInfo.reapplyDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-center gap-4 pt-4">
                {statusInfo.actions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.variant}
                    size="lg"
                    onClick={() => handleNavigation(action.path)}
                    disabled={isNavigating}
                  >
                    {isNavigating ? (
                      <Icon name="loader-2" className="w-5 h-5 me-2 animate-spin" />
                    ) : (
                      <Icon name={action.icon} className="w-5 h-5 me-2" />
                    )}
                    {action.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <AdvisorStatusTimeline 
            advisorState={advisorState}
            translations={{
              timeline: translations.advisor.status.timeline
            }}
          />

          {/* Help Section */}
          <Card>
            <CardContent className="p-6 text-center">
              <Icon name="help-circle" className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Need Help?</h3>
              <p className="text-muted-foreground mb-4">
                Have questions about your application or the advisor program?
              </p>
              <Button 
                variant="outline" 
                onClick={() => handleNavigation(`/${locale}/support`)}
                disabled={isNavigating}
              >
                <Icon name="mail" className="w-4 h-4 me-2" />
                Contact Support
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}