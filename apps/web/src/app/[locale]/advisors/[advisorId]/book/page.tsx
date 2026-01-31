import { notFound } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';
import { BookConsultationContent } from '@/components/advisor-network/book-consultation-content';
import { getAdvisorProfileAction, getConsultationPricingAction } from '@/lib/actions/advisor-actions';

interface BookConsultationPageProps {
  params: Promise<{ locale: string; advisorId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BookConsultationPage(props: BookConsultationPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { locale, advisorId } = params;
  
  // Load translations for booking flow
  const messages = await loadNamespace(locale, 'advisor');
  if (Object.keys(messages).length === 0) {
    notFound();
  }

  // Extract optional project ID from search params
  const projectId = typeof searchParams.project === 'string' ? searchParams.project : undefined;

  // Fetch advisor and pricing data on the server to prevent hydration issues
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

  // Check if advisor is accepting bookings
  if (!advisor.is_accepting_bookings) {
    // Could redirect to advisor profile with a message, but for now use notFound
    notFound();
  }

  const translations = {
    consultations: {
      book: {
        title: messages.consultations?.book?.title || 'Book Consultation',
        selectDuration: messages.consultations?.book?.selectDuration || 'Select Duration',
        selectTime: messages.consultations?.book?.selectTime || 'Select Time',
        pricing: {
          '15min': messages.consultations?.book?.pricing?.['15min'] || '15-minute consultation',
          '30min': messages.consultations?.book?.pricing?.['30min'] || '30-minute consultation',
          '60min': messages.consultations?.book?.pricing?.['60min'] || '60-minute consultation',
          clientPays: messages.consultations?.book?.pricing?.clientPays || 'You pay',
          advisorEarns: messages.consultations?.book?.pricing?.advisorEarns || 'Advisor earns (70%)',
          descriptions: {
            '15min': messages.consultations?.book?.pricing?.descriptions?.['15min'] || 'Perfect for quick questions',
            '30min': messages.consultations?.book?.pricing?.descriptions?.['30min'] || 'Perfect for focused discussions',
            '60min': messages.consultations?.book?.pricing?.descriptions?.['60min'] || 'Perfect for in-depth guidance'
          }
        },
        policies: {
          title: messages.consultations?.book?.policies?.title || 'Booking Policies',
          cancellation: messages.consultations?.book?.policies?.cancellation || 'Free cancellation up to 24 hours before consultation',
          ownership: messages.consultations?.book?.policies?.ownership || 'You own all code and assets produced during consultation',
          refund: messages.consultations?.book?.policies?.refund || 'Refunds are automatic for cancellations more than 24 hours in advance'
        },
        form: {
          notes: {
            label: messages.consultations?.book?.form?.notes?.label || 'Consultation Notes (Optional)',
            placeholder: messages.consultations?.book?.form?.notes?.placeholder || 'What would you like to discuss or get help with?',
            help: messages.consultations?.book?.form?.notes?.help || 'Help your advisor prepare by sharing details about your project or questions'
          },
          project: {
            label: messages.consultations?.book?.form?.project?.label || 'Related Project (Optional)',
            help: messages.consultations?.book?.form?.project?.help || 'Link this consultation to one of your SheenApps projects'
          }
        },
        payment: {
          title: messages.consultations?.book?.payment?.title || 'Payment Details',
          secure: messages.consultations?.book?.payment?.secure || 'Secure payment powered by Stripe',
          processing: messages.consultations?.book?.payment?.processing || 'Processing payment...',
          success: messages.consultations?.book?.payment?.success || 'Payment successful!'
        },
        confirmation: {
          title: messages.consultations?.book?.confirmation?.title || 'Consultation Booked!',
          details: messages.consultations?.book?.confirmation?.details || 'Consultation Details',
          advisor: messages.consultations?.book?.confirmation?.advisor || 'Advisor',
          duration: messages.consultations?.book?.confirmation?.duration || 'Duration',
          dateTime: messages.consultations?.book?.confirmation?.dateTime || 'Date & Time',
          price: messages.consultations?.book?.confirmation?.price || 'Price',
          videoLink: messages.consultations?.book?.confirmation?.videoLink || 'Video Link',
          calendar: messages.consultations?.book?.confirmation?.calendar || 'Add to Calendar',
          email: messages.consultations?.book?.confirmation?.email || "You'll receive a confirmation email with all the details"
        }
      }
    },
    labels: {
      free: messages.labels?.free || 'Free',
      minutes: messages.labels?.minutes || 'minutes'
    },
    durations: {
      '15': messages.consultations?.book?.pricing?.['15min'] || '15-minute consultation',
      '30': messages.consultations?.book?.pricing?.['30min'] || '30-minute consultation', 
      '60': messages.consultations?.book?.pricing?.['60min'] || '60-minute consultation'
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      retry: messages.common?.retry || 'Try again',
      cancel: messages.common?.cancel || 'Cancel',
      continue: messages.common?.continue || 'Continue',
      back: messages.common?.back || 'Back'
    },
    navigation: {
      advisors: messages.advisors?.navTitle || messages.advisors?.title || 'Advisors'
    }
  };

  return (
    <BookConsultationContent 
      advisor={advisor}
      pricing={pricing}
      projectId={projectId}
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata(props: BookConsultationPageProps) {
  const params = await props.params;
  const { locale } = params;
  const messages = await loadNamespace(locale, 'advisor');

  return {
    title: messages.consultations?.book?.title || 'Book Consultation - SheenApps',
    description: 'Book a consultation with an expert advisor to get personalized guidance for your project.'
  };
}