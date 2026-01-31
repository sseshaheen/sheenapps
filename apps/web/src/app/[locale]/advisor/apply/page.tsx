import { notFound } from 'next/navigation';
import { AdvisorMultiStepForm } from '@/components/advisor-network/advisor-multi-step-form';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';

interface AdvisorApplicationPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorApplicationPage({ params }: AdvisorApplicationPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Load translations using namespace approach
  const messages = await getNamespacedMessages(locale, ['advisor', 'common']);

  // Debug logging
  console.log(`🔍 [APPLY DEBUG] Locale: ${locale}`);
  console.log(`🔍 [APPLY DEBUG] Messages keys:`, Object.keys(messages || {}));
  console.log(`🔍 [APPLY DEBUG] messages.advisor exists:`, !!messages.advisor);
  console.log(`🔍 [APPLY DEBUG] Application title:`, messages.advisor?.application?.title);

  const translations = {
    advisor: {
      application: {
        title: messages.advisor?.application?.title || 'Apply to Become an Advisor',
        subtitle: messages.advisor?.application?.subtitle || 'Share your expertise and help others build amazing projects',
        steps: {
          personal: {
            title: messages.advisor?.application?.steps?.personal?.title || 'Personal Information',
            description: messages.advisor?.application?.steps?.personal?.description || 'Tell us about yourself and your professional background',
            fields: {
              displayName: {
                label: messages.advisor?.application?.steps?.personal?.fields?.displayName?.label || 'Display Name',
                placeholder: messages.advisor?.application?.steps?.personal?.fields?.displayName?.placeholder || 'How you\'d like to be shown to clients',
                help: messages.advisor?.application?.steps?.personal?.fields?.displayName?.help || 'This is how clients will see your name'
              },
              bio: {
                label: messages.advisor?.application?.steps?.personal?.fields?.bio?.label || 'Professional Bio',
                placeholder: messages.advisor?.application?.steps?.personal?.fields?.bio?.placeholder || 'Tell clients about your background and expertise...',
                help: messages.advisor?.application?.steps?.personal?.fields?.bio?.help || 'Describe your experience, specialties, and what makes you a great advisor'
              },
              experience: {
                label: messages.advisor?.application?.steps?.personal?.fields?.experience?.label || 'Years of Experience',
                help: messages.advisor?.application?.steps?.personal?.fields?.experience?.help || 'How many years of professional software development experience do you have?'
              },
              portfolio: {
                label: messages.advisor?.application?.steps?.personal?.fields?.portfolio?.label || 'Portfolio URL (Optional)',
                placeholder: messages.advisor?.application?.steps?.personal?.fields?.portfolio?.placeholder || 'https://yourportfolio.com',
                help: messages.advisor?.application?.steps?.personal?.fields?.portfolio?.help || 'Link to your work, GitHub, or professional website'
              }
            }
          },
          professional: {
            title: messages.advisor?.application?.steps?.professional?.title || 'Skills & Expertise',
            description: messages.advisor?.application?.steps?.professional?.description || 'Help clients find you by showcasing your technical skills and areas of expertise',
            fields: {
              skills: {
                label: messages.advisor?.application?.steps?.professional?.fields?.skills?.label || 'Technical Skills',
                help: messages.advisor?.application?.steps?.professional?.fields?.skills?.help || 'List the technologies and frameworks you\'re proficient in'
              },
              specialties: {
                label: messages.advisor?.application?.steps?.professional?.fields?.specialties?.label || 'Areas of Expertise',
                help: messages.advisor?.application?.steps?.professional?.fields?.specialties?.help || 'What types of projects do you specialize in?'
              },
              languages: {
                label: messages.advisor?.application?.steps?.professional?.fields?.languages?.label || 'Communication Languages',
                help: messages.advisor?.application?.steps?.professional?.fields?.languages?.help || 'Which languages can you communicate with clients in?',
                placeholder: messages.advisor?.application?.steps?.professional?.fields?.languages?.placeholder || 'Add language...'
              },
              linkedin: {
                label: messages.advisor?.application?.steps?.professional?.fields?.linkedin?.label || 'LinkedIn URL (Optional)',
                placeholder: messages.advisor?.application?.steps?.professional?.fields?.linkedin?.placeholder || 'https://linkedin.com/in/yourprofile',
                help: messages.advisor?.application?.steps?.professional?.fields?.linkedin?.help || 'Your LinkedIn profile for professional verification'
              },
              github: {
                label: messages.advisor?.application?.steps?.professional?.fields?.github?.label || 'GitHub URL (Optional)',
                placeholder: messages.advisor?.application?.steps?.professional?.fields?.github?.placeholder || 'https://github.com/yourusername',
                help: messages.advisor?.application?.steps?.professional?.fields?.github?.help || 'Your GitHub profile to showcase your code'
              }
            }
          },
          consultation: {
            title: messages.advisor?.application?.steps?.consultation?.title || 'Consultation Preferences',
            description: messages.advisor?.application?.steps?.consultation?.description || 'Set your availability and consultation preferences to help clients book sessions',
            fields: {
              availability: {
                label: messages.advisor?.application?.steps?.consultation?.fields?.availability?.label || 'Available Days',
                help: messages.advisor?.application?.steps?.consultation?.fields?.availability?.help || 'Which days of the week are you available for consultations?'
              },
              consultationTypes: {
                label: messages.advisor?.application?.steps?.consultation?.fields?.consultationTypes?.label || 'Consultation Types',
                help: messages.advisor?.application?.steps?.consultation?.fields?.consultationTypes?.help || 'What types of consultation services do you offer?'
              },
              timeZones: {
                label: messages.advisor?.application?.steps?.consultation?.fields?.timeZones?.label || 'Preferred Time Zones',
                help: messages.advisor?.application?.steps?.consultation?.fields?.timeZones?.help || 'Which time zones work best for you?',
                placeholder: messages.advisor?.application?.steps?.consultation?.fields?.timeZones?.placeholder || 'Add time zone...'
              },
              maxSessions: {
                label: messages.advisor?.application?.steps?.consultation?.fields?.maxSessions?.label || 'Max Sessions per Week',
                help: messages.advisor?.application?.steps?.consultation?.fields?.maxSessions?.help || 'How many consultation sessions can you handle per week?',
                placeholder: messages.advisor?.application?.steps?.consultation?.fields?.maxSessions?.placeholder || '10'
              }
            }
          }
        },
        navigation: {
          next: messages.advisor?.application?.navigation?.next || 'Next Step',
          previous: messages.advisor?.application?.navigation?.previous || 'Previous',
          submit: messages.advisor?.application?.navigation?.submit || 'Submit Application',
          saveDraft: messages.advisor?.application?.navigation?.saveDraft || 'Save Draft',
          cancel: messages.advisor?.application?.navigation?.cancel || 'Cancel'
        },
        progress: {
          step: messages.advisor?.application?.progress?.step || 'Step',
          of: messages.advisor?.application?.progress?.of || 'of',
          complete: messages.advisor?.application?.progress?.complete || 'Complete'
        },
        draft: {
          saved: messages.advisor?.application?.draft?.saved || 'Draft saved',
          saving: messages.advisor?.application?.draft?.saving || 'Saving...',
          autoSave: messages.advisor?.application?.draft?.autoSave || 'Auto-save enabled'
        },
        auth: {
          guestMessage: messages.advisor?.application?.auth?.guestMessage || 'You can start filling out the form - authentication required only when submitting',
          authenticatedMessage: messages.advisor?.application?.auth?.authenticatedMessage || 'Authenticated - you can submit your application'
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      required: messages.common?.required || 'Required'
    }
  };

  return (
    <AdvisorMultiStepForm 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdvisorApplicationPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Apply to Become an Advisor - SheenApps',
      description: 'Join our network of expert software engineers and help clients build amazing projects with AI assistance.'
    };
  }

  const messages = await getNamespacedMessages(locale, ['advisor']);

  return {
    title: messages.advisor?.application?.title || 'Apply to Become an Advisor - SheenApps',
    description: 'Join our network of expert software engineers and help clients build amazing projects with AI assistance.'
  };
}