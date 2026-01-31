import { notFound } from 'next/navigation';
import { AdvisorProfileEditor } from '@/components/advisor-network/advisor-profile-editor';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';

interface AdvisorProfilePageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorProfilePage({ params }: AdvisorProfilePageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Load translations using namespace approach
  const messages = await getNamespacedMessages(locale, ['advisor', 'common']);

  const translations = {
    advisor: {
      profile: {
        title: messages.advisor?.profile?.title || 'Edit Profile',
        subtitle: messages.advisor?.profile?.subtitle || 'Update your advisor profile and preferences',
        personalInfo: {
          title: messages.advisor?.profile?.personalInfo?.title || 'Personal Information',
          displayName: messages.advisor?.profile?.personalInfo?.displayName || 'Display Name',
          displayNamePlaceholder: messages.advisor?.profile?.personalInfo?.displayNamePlaceholder || 'Your professional name',
          bio: messages.advisor?.profile?.personalInfo?.bio || 'Professional Bio',
          bioPlaceholder: messages.advisor?.profile?.personalInfo?.bioPlaceholder || 'Tell clients about your experience and expertise...',
          avatar: messages.advisor?.profile?.personalInfo?.avatar || 'Profile Photo',
          location: messages.advisor?.profile?.personalInfo?.location || 'Location',
          languages: messages.advisor?.profile?.personalInfo?.languages || 'Languages'
        },
        expertise: {
          title: messages.advisor?.profile?.expertise?.title || 'Expertise & Skills',
          skills: messages.advisor?.profile?.expertise?.skills || 'Technical Skills',
          skillsPlaceholder: messages.advisor?.profile?.expertise?.skillsPlaceholder || 'Add your technical skills...',
          specialties: messages.advisor?.profile?.expertise?.specialties || 'Specialties',
          specialtiesPlaceholder: messages.advisor?.profile?.expertise?.specialtiesPlaceholder || 'What are your areas of expertise?',
          experience: messages.advisor?.profile?.expertise?.experience || 'Years of Experience',
          experienceHelp: messages.advisor?.profile?.expertise?.experienceHelp || 'Professional software development experience'
        },
        pricing: {
          title: messages.advisor?.profile?.pricing?.title || 'Pricing & Availability',
          hourlyRate: messages.advisor?.profile?.pricing?.hourlyRate || 'Hourly Rate',
          hourlyRateHelp: messages.advisor?.profile?.pricing?.hourlyRateHelp || 'Your consultation rate in USD',
          availability: messages.advisor?.profile?.pricing?.availability || 'Availability',
          availabilityHelp: messages.advisor?.profile?.pricing?.availabilityHelp || 'When are you typically available for consultations?',
          timezone: messages.advisor?.profile?.pricing?.timezone || 'Timezone'
        },
        integrations: {
          title: messages.advisor?.profile?.integrations?.title || 'Integrations',
          calcom: messages.advisor?.profile?.integrations?.calcom || 'Cal.com Integration',
          calcomUrl: messages.advisor?.profile?.integrations?.calcomUrl || 'Cal.com Event URL',
          calcomPlaceholder: messages.advisor?.profile?.integrations?.calcomPlaceholder || 'https://cal.com/your-username/consultation',
          calcomHelp: messages.advisor?.profile?.integrations?.calcomHelp || 'Clients will use this link to book consultations',
          stripe: messages.advisor?.profile?.integrations?.stripe || 'Stripe Account',
          stripeStatus: messages.advisor?.profile?.integrations?.stripeStatus || 'Payment Status',
          connectStripe: messages.advisor?.profile?.integrations?.connectStripe || 'Connect Stripe Account',
          stripeConnected: messages.advisor?.profile?.integrations?.stripeConnected || 'Connected'
        },
        actions: {
          save: messages.advisor?.profile?.actions?.save || 'Save Changes',
          saving: messages.advisor?.profile?.actions?.saving || 'Saving...',
          cancel: messages.advisor?.profile?.actions?.cancel || 'Cancel',
          preview: messages.advisor?.profile?.actions?.preview || 'Preview Public Profile'
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      success: messages.common?.success || 'Success',
      required: messages.common?.required || 'Required'
    }
  };

  return (
    <AdvisorProfileEditor 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdvisorProfilePageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Edit Profile - Advisor Portal - SheenApps',
      description: 'Update your advisor profile, skills, and consultation preferences.'
    };
  }

  const messages = await getNamespacedMessages(locale, ['advisor']);

  return {
    title: messages.advisor?.profile?.title || 'Edit Profile - Advisor Portal - SheenApps',
    description: 'Update your advisor profile, skills, and consultation preferences.'
  };
}