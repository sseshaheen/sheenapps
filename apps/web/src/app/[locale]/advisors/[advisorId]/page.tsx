import { notFound } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';
import { AdvisorProfileContent } from '@/components/advisor-network/advisor-profile-content';
import { getAdvisorProfileAction, getConsultationPricingAction } from '@/lib/actions/advisor-actions';

interface AdvisorProfilePageProps {
  params: Promise<{ locale: string; advisorId: string }>;
}

export default async function AdvisorProfilePage(props: AdvisorProfilePageProps) {
  const params = await props.params;
  const { locale, advisorId } = params;
  
  // Load translations for advisor profile
  const messages = await loadNamespace(locale, 'advisor');
  if (Object.keys(messages).length === 0) {
    notFound();
  }

  // Fetch advisor data on the server to prevent hydration issues
  const [advisorResult, pricingResult] = await Promise.all([
    getAdvisorProfileAction(advisorId, locale),
    getConsultationPricingAction(locale, advisorId)
  ]);

  // Handle advisor not found or error
  if (!advisorResult.success || !advisorResult.data) {
    notFound();
  }

  // Extract advisor data (handle both nested and direct response structures)
  const advisor = (advisorResult.data as any)?.advisor || advisorResult.data;
  const pricing = pricingResult.success ? pricingResult.data : null;

  const translations = {
    advisor: {
      profile: {
        title: messages.advisors?.cards?.viewProfile || 'Advisor Profile',
        about: messages.profile?.about || 'About',
        skills: messages.profile?.skills || 'Skills & Technologies',
        specialties: messages.profile?.specialties || 'Areas of Expertise',
        languages: messages.profile?.languages || 'Languages',
        experience: messages.profile?.experience || 'Experience',
        reviews: messages.profile?.reviews || 'Reviews & Ratings',
        portfolio: messages.profile?.portfolio || 'Portfolio',
        availability: messages.profile?.availability || 'Availability'
      }
    },
    consultations: {
      book: {
        title: messages.consultations?.book?.title || 'Book Consultation',
        pricing: {
          clientPays: messages.consultations?.book?.pricing?.clientPays || 'You pay',
          advisorEarns: messages.consultations?.book?.pricing?.advisorEarns || 'Advisor earns (70%)'
        }
      }
    },
    pricing: {
      title: messages.profile?.pricing?.title || 'Consultation Pricing'
    },
    navigation: {
      browseAllAdvisors: messages.client?.quickMatcher?.matches?.noMatches?.browseButton || 'Browse All Advisors',
      advisors: messages.advisors?.title || 'Advisors'
    },
    advisors: {
      cards: {
        rating: messages.advisors?.cards?.rating || 'rating',
        reviews: messages.advisors?.cards?.reviews || 'reviews',
        review: messages.advisors?.cards?.review || 'review',
        bookNow: messages.advisors?.cards?.bookNow || 'Book Consultation',
        viewProfile: messages.advisors?.cards?.viewProfile || 'View Profile',
        available: messages.advisors?.cards?.available || 'Available',
        busy: messages.advisors?.cards?.busy || 'Busy'
      }
    },
    placeholders: {
      noReviewsYet: messages.placeholders?.noReviewsYet || 'No reviews yet.',
      reviewSummary: messages.placeholders?.reviewSummary || 'This advisor has {count} review(s) with an average rating of {rating} stars.'
    },
    labels: {
      free: messages.labels?.free || 'Free',
      minutes: messages.labels?.minutes || 'minutes'
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      retry: messages.common?.retry || 'Try again'
    }
  };

  return (
    <AdvisorProfileContent 
      advisor={advisor}
      pricing={pricing}
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata(props: AdvisorProfilePageProps) {
  const params = await props.params;
  const { locale, advisorId } = params;
  const messages = await loadNamespace(locale, 'advisor');

  return {
    title: (messages.advisors?.cards?.viewProfile || 'Advisor Profile') + ' - SheenApps',
    description: 'View advisor profile, skills, and book consultations with expert software engineers.'
  };
}