import { redirect } from 'next/navigation'
import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state'
import { AdvisorApplicationStatus } from '@/components/advisor-network/advisor-application-status'
import { getNamespacedMessages } from '@/i18n/request'
import { locales, type Locale } from '@/i18n/config'
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorStatusPageProps {
  params: Promise<{ locale: string }>
}

/**
 * Advisor Application Status Page
 * Shows current application state and next steps based on advisor state
 */
export default async function AdvisorStatusPage({ params }: AdvisorStatusPageProps) {
  const { locale } = await params
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    redirectWithLocale('/advisor/application-status', locale);
  }

  // Get current user and advisor state
  const userId = await getCurrentUserId()
  const advisorState = await getAdvisorState(userId, locale)
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, `/advisor/application-status`, locale)
  if (redirectUrl) {
    redirectWithLocale(redirectUrl, locale);
  }
  
  // Only show status page for states that have applications
  const validStates = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED_PENDING_ONBOARDING', 'LIVE', 'REJECTED_COOLDOWN']
  
  if (!validStates.includes(advisorState.state)) {
    // Users without applications should apply first
    redirectWithLocale('/advisor/apply', locale);
  }

  // Load translations for the status page
  const messages = await getNamespacedMessages(locale, ['advisor', 'common'])
  
  const translations = {
    advisor: {
      status: {
        title: messages.advisor?.status?.title || "Application Status",
        states: {
          submitted: {
            title: messages.advisor?.status?.states?.submitted?.title || "Application Submitted",
            description: messages.advisor?.status?.states?.submitted?.description || "Your application has been submitted and is in our review queue.",
            timeline: messages.advisor?.status?.states?.submitted?.timeline || "We typically review applications within 3-5 business days."
          },
          under_review: {
            title: messages.advisor?.status?.states?.under_review?.title || "Under Review",
            description: messages.advisor?.status?.states?.under_review?.description || "Our team is currently reviewing your application.",
            timeline: messages.advisor?.status?.states?.under_review?.timeline || "We'll notify you of our decision within 1-2 business days."
          },
          approved_pending_onboarding: {
            title: messages.advisor?.status?.states?.approved_pending_onboarding?.title || "Congratulations! You're Approved",
            description: messages.advisor?.status?.states?.approved_pending_onboarding?.description || "Complete your onboarding to start taking consultations.",
            nextSteps: messages.advisor?.status?.states?.approved_pending_onboarding?.nextSteps || [
              "Connect your Stripe account for payments",
              "Setup your Cal.com calendar integration", 
              "Complete your advisor profile"
            ]
          },
          live: {
            title: messages.advisor?.status?.states?.live?.title || "You're Live!",
            description: messages.advisor?.status?.states?.live?.description || "Your advisor profile is active and you can now take consultations.",
            cta: messages.advisor?.status?.states?.live?.cta || "Go to Dashboard"
          },
          rejected_cooldown: {
            title: messages.advisor?.status?.states?.rejected_cooldown?.title || "Application Not Approved",
            description: messages.advisor?.status?.states?.rejected_cooldown?.description || "Your application was not approved at this time. You can reapply after the cooldown period.",
            reapplyDate: messages.advisor?.status?.states?.rejected_cooldown?.reapplyDate || "Reapply Date"
          }
        },
        actions: {
          continueDraft: messages.advisor?.status?.actions?.continueDraft || "Continue Application",
          viewOnboarding: messages.advisor?.status?.actions?.viewOnboarding || "Complete Onboarding",
          goToDashboard: messages.advisor?.status?.actions?.goToDashboard || "Go to Dashboard",
          contactSupport: messages.advisor?.status?.actions?.contactSupport || "Contact Support"
        },
        timeline: {
          title: messages.advisor?.status?.timeline?.title || "Application Progress",
          items: {
            applied: {
              title: messages.advisor?.status?.timeline?.items?.applied?.title || "Application Submitted",
              description: messages.advisor?.status?.timeline?.items?.applied?.description || "Your application has been submitted and is in our system"
            },
            review: {
              title: messages.advisor?.status?.timeline?.items?.review?.title || "Initial Review",
              description: messages.advisor?.status?.timeline?.items?.review?.description || "Our team is reviewing your application and qualifications"
            },
            decision: {
              title: messages.advisor?.status?.timeline?.items?.decision?.title || "Final Decision",
              description: messages.advisor?.status?.timeline?.items?.decision?.description || "We're making the final decision on your application"
            },
            onboarding: {
              title: messages.advisor?.status?.timeline?.items?.onboarding?.title || "Onboarding Setup",
              description: messages.advisor?.status?.timeline?.items?.onboarding?.description || "Complete your advisor profile and integrations"
            },
            live: {
              title: messages.advisor?.status?.timeline?.items?.live?.title || "Go Live",
              description: messages.advisor?.status?.timeline?.items?.live?.description || "Start taking consultations and earning revenue"
            }
          },
          status: {
            completed: messages.advisor?.status?.timeline?.status?.completed || "Completed",
            current: messages.advisor?.status?.timeline?.status?.current || "In Progress",
            pending: messages.advisor?.status?.timeline?.status?.pending || "Pending",
            rejected: messages.advisor?.status?.timeline?.status?.rejected || "Rejected"
          },
          estimatedTime: {
            review: messages.advisor?.status?.timeline?.estimatedTime?.review || "2-3 business days",
            decision: messages.advisor?.status?.timeline?.estimatedTime?.decision || "1-2 business days",
            onboarding: messages.advisor?.status?.timeline?.estimatedTime?.onboarding || "15-30 minutes"
          }
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong'
    }
  }

  return (
    <AdvisorApplicationStatus 
      translations={translations}
      locale={locale}
      advisorState={advisorState}
    />
  )
}