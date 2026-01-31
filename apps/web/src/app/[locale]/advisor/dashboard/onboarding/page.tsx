import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state'
import { AdvisorOnboarding } from '@/components/advisor-network/advisor-onboarding'
import { getNamespacedMessages } from '@/i18n/request'
import { locales, type Locale } from '@/i18n/config'
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorOnboardingPageProps {
  params: Promise<{ locale: string }>
}

/**
 * Advisor Onboarding Page
 * 3-Gate setup process: Stripe + Cal.com + Profile completion
 */
export default async function AdvisorOnboardingPage({ params }: AdvisorOnboardingPageProps) {
  const { locale } = await params
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    redirectWithLocale('/advisor/dashboard/onboarding', 'en')
  }

  // Get current user and advisor state
  const userId = await getCurrentUserId()
  const advisorState = await getAdvisorState(userId, locale)
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, `/advisor/dashboard/onboarding`, locale)
  if (redirectUrl) {
    redirectWithLocale(redirectUrl, locale);
  }
  
  // Only show onboarding for approved users pending onboarding
  if (advisorState.state !== 'APPROVED_PENDING_ONBOARDING') {
    // Users not in onboarding state should be redirected by the guard above
    redirectWithLocale('/advisor/apply', locale);
  }

  // Load translations for the onboarding page
  const messages = await getNamespacedMessages(locale, ['advisor', 'common'])
  
  const translations = {
    advisor: {
      onboarding: {
        title: messages.advisor?.onboarding?.title || "Complete Your Advisor Setup",
        subtitle: messages.advisor?.onboarding?.subtitle || "Just a few more steps to start earning",
        progress: messages.advisor?.onboarding?.progress || "Progress",
        gates: {
          stripe: {
            title: messages.advisor?.onboarding?.gates?.stripe?.title || "Connect Stripe Account",
            description: messages.advisor?.onboarding?.gates?.stripe?.description || "Set up payments to receive your consultation earnings",
            connected: messages.advisor?.onboarding?.gates?.stripe?.connected || "Stripe Connected",
            action: messages.advisor?.onboarding?.gates?.stripe?.action || "Connect Stripe",
            policy: messages.advisor?.onboarding?.gates?.stripe?.policy || "All payments are processed securely through SheenApps"
          },
          calcom: {
            title: messages.advisor?.onboarding?.gates?.calcom?.title || "Setup Calendar Integration",
            description: messages.advisor?.onboarding?.gates?.calcom?.description || "Connect Cal.com to manage your consultation scheduling",
            connected: messages.advisor?.onboarding?.gates?.calcom?.connected || "Calendar Connected",
            action: messages.advisor?.onboarding?.gates?.calcom?.action || "Setup Calendar",
            helpText: messages.advisor?.onboarding?.gates?.calcom?.helpText || "You can edit your availability directly in Cal.com"
          },
          profile: {
            title: messages.advisor?.onboarding?.gates?.profile?.title || "Complete Your Profile",
            description: messages.advisor?.onboarding?.gates?.profile?.description || "Add your bio, skills, and profile photo to attract clients",
            completed: messages.advisor?.onboarding?.gates?.profile?.completed || "Profile Complete",
            action: messages.advisor?.onboarding?.gates?.profile?.action || "Edit Profile",
            requirements: messages.advisor?.onboarding?.gates?.profile?.requirements || [
              "Professional bio (at least 100 characters)",
              "Profile photo",
              "Skills and specialties",
              "Years of experience"
            ]
          }
        },
        goLive: {
          title: messages.advisor?.onboarding?.goLive?.title || "Ready to Go Live!",
          description: messages.advisor?.onboarding?.goLive?.description || "All setup complete. Start accepting consultations now.",
          action: messages.advisor?.onboarding?.goLive?.action || "Activate Advisor Profile",
          loading: messages.advisor?.onboarding?.goLive?.loading || "Activating...",
          success: messages.advisor?.onboarding?.goLive?.success || "Congratulations! Your advisor profile is now live."
        },
        status: {
          complete: messages.advisor?.onboarding?.status?.complete || "Complete",
          pending: messages.advisor?.onboarding?.status?.pending || "Setup Required",
          inProgress: messages.advisor?.onboarding?.status?.inProgress || "In Progress"
        },
        loading: {
          profile: messages.advisor?.onboarding?.loading?.profile || "Loading advisor profile..."
        },
        errors: {
          profileNotFound: messages.advisor?.onboarding?.errors?.profileNotFound || "Profile Not Found",
          profileNotFoundDescription: messages.advisor?.onboarding?.errors?.profileNotFoundDescription || "We couldn't find your advisor profile. Please complete your application first.",
          completeApplication: messages.advisor?.onboarding?.errors?.completeApplication || "Complete Application"
        },
        help: {
          title: messages.advisor?.onboarding?.help?.title || "Need Help with Setup?",
          description: messages.advisor?.onboarding?.help?.description || "Having trouble with any of the setup steps? Our support team is here to help.",
          contactSupport: messages.advisor?.onboarding?.help?.contactSupport || "Contact Support"
        },
        ui: {
          requirements: messages.advisor?.onboarding?.ui?.requirements || "Requirements:",
          redirecting: messages.advisor?.onboarding?.ui?.redirecting || "Redirecting to your dashboard...",
          percentComplete: messages.advisor?.onboarding?.ui?.percentComplete || "% Complete",
          of: messages.advisor?.onboarding?.ui?.of || "of",
          complete: messages.advisor?.onboarding?.ui?.complete || "complete"
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      continue: messages.common?.continue || 'Continue',
      back: messages.common?.back || 'Back'
    }
  }

  return (
    <AdvisorOnboarding 
      translations={translations}
      locale={locale}
      advisorState={advisorState}
    />
  )
}

export async function generateMetadata({ params }: AdvisorOnboardingPageProps) {
  const { locale } = await params
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Advisor Onboarding - SheenApps',
      description: 'Complete your advisor setup to start earning from consultations.'
    }
  }

  const messages = await getNamespacedMessages(locale, ['advisor'])

  return {
    title: messages.advisor?.onboarding?.title || 'Advisor Onboarding - SheenApps',
    description: 'Complete your advisor setup to start earning from consultations.'
  }
}