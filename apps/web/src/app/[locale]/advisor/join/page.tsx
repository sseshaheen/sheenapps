import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state';
import { AdvisorPublicLanding } from '@/components/advisor-network/advisor-public-landing';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorJoinPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Advisor Recruitment Page
 * Routes users based on their advisor application state - for people wanting to become advisors
 */
export default async function AdvisorJoinPage({ params }: AdvisorJoinPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Get current user and advisor state
  const userId = await getCurrentUserId();
  const advisorState = await getAdvisorState(userId, locale);
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, `/advisor/join`, locale);
  if (redirectUrl) {
    redirectWithLocale(redirectUrl, locale);
  }
  
  // For ANON and NO_APPLICATION states, show public landing page
  if (advisorState.state === 'ANON' || advisorState.state === 'NO_APPLICATION') {
    // Load translations for the landing page
    const messages = await getNamespacedMessages(locale, ['advisor', 'common']);
    
    // Debug logging
    console.log(`🔍 [DEBUG] Locale: ${locale}`);
    console.log(`🔍 [DEBUG] Messages keys:`, Object.keys(messages || {}));
    console.log(`🔍 [DEBUG] messages.advisor exists:`, !!messages.advisor);
    console.log(`🔍 [DEBUG] messages.advisor keys:`, Object.keys(messages.advisor || {}));
    console.log(`🔍 [DEBUG] messages.advisor?.landing exists:`, !!messages.advisor?.landing);
    console.log(`🔍 [DEBUG] Hero title:`, messages.advisor?.landing?.hero?.title);
    
    const translations = {
      advisor: {
        landing: {
          hero: {
            title: messages.advisor?.landing?.hero?.title || "Get unstuck in 15 minutes",
            subtitle: messages.advisor?.landing?.hero?.subtitle || "Earn by guiding builders with your expertise",
            cta: messages.advisor?.landing?.hero?.cta || "Become an Advisor",
            badge: messages.advisor?.landing?.hero?.badge || "Join our expert advisor network"
          },
          howItWorks: {
            title: messages.advisor?.landing?.howItWorks?.title || "How it Works",
            steps: messages.advisor?.landing?.howItWorks?.steps || [
              "Apply with your expertise",
              "Get approved by our team", 
              "Take paid consultations"
            ]
          },
          earnings: {
            title: messages.advisor?.landing?.earnings?.title || "Earn 70% of Each Session",
            rates: messages.advisor?.landing?.earnings?.rates || "$6.30 / $13.30 / $24.50",
            description: messages.advisor?.landing?.earnings?.description || "You earn 70% of each session",
            sessionTypes: {
              quick: messages.advisor?.landing?.earnings?.sessionTypes?.quick || "Quick questions",
              review: messages.advisor?.landing?.earnings?.sessionTypes?.review || "Code review",
              deep: messages.advisor?.landing?.earnings?.sessionTypes?.deep || "Deep consultation"
            }
          },
          trust: {
            payments: messages.advisor?.landing?.trust?.payments || "Secure Stripe payouts",
            paymentsDescription: messages.advisor?.landing?.trust?.paymentsDescription || "Secure payments processed through Stripe with weekly payouts",
            calendar: messages.advisor?.landing?.trust?.calendar || "Calendar integration",
            calendarDescription: messages.advisor?.landing?.trust?.calendarDescription || "Seamless booking through Cal.com integration",
            policy: messages.advisor?.landing?.trust?.policy || "All payments go through SheenApps; no direct payments",
            policyTitle: messages.advisor?.landing?.trust?.policyTitle || "Platform Policy"
          },
          cta: {
            title: messages.advisor?.landing?.cta?.title || "Ready to start earning?",
            description: messages.advisor?.landing?.cta?.description || "Join our network of expert advisors and help builders succeed while earning great money"
          },
          dashboard: {
            buttonText: messages.advisor?.landing?.dashboard?.buttonText || "Advisor Dashboard"
          },
          auth: {
            signInRequired: messages.advisor?.landing?.auth?.signInRequired || "You'll need to sign in or create an account to apply"
          }
        }
      },
      common: {
        loading: messages.common?.loading || 'Loading...',
        error: messages.common?.error || 'Something went wrong'
      }
    };

    return (
      <AdvisorPublicLanding 
        translations={translations}
        locale={locale}
        isAuthenticated={advisorState.state !== 'ANON'}
        userHasApplication={false}
      />
    );
  }
  
  // This should not happen due to redirect logic above, but just in case
  redirectWithLocale('/advisor/dashboard', locale);
}