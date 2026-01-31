import { notFound } from 'next/navigation';
import { AdvisorAvailabilityContent } from '@/components/advisor-network/advisor-availability-content';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';
import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state';
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorAvailabilityPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorAvailabilityPage({ params }: AdvisorAvailabilityPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Check user's advisor state and redirect if necessary
  const userId = await getCurrentUserId();
  const advisorState = await getAdvisorState(userId, locale);
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, '/advisor/dashboard/availability', locale);
  if (redirectUrl) {
    redirectWithLocale(redirectUrl, locale);
  }
  
  // Only LIVE advisors should reach this point
  if (advisorState.state !== 'LIVE') {
    redirectWithLocale('/advisor/apply', locale);
  }

  // Load translations using namespace approach
  const messages = await getNamespacedMessages(locale, ['advisor', 'common']);

  const translations = {
    advisor: {
      dashboard: {
        availability: {
          title: messages.advisor?.dashboard?.availability?.title || 'Availability',
          schedule: messages.advisor?.dashboard?.availability?.schedule || 'Weekly Schedule',
          timezone: messages.advisor?.dashboard?.availability?.timezone || 'Timezone',
          blackoutDates: messages.advisor?.dashboard?.availability?.blackoutDates || 'Blackout Dates',
          preferences: messages.advisor?.dashboard?.availability?.preferences || 'Booking Preferences',
          calendarSync: messages.advisor?.dashboard?.availability?.calendarSync || 'Calendar Sync',
          days: {
            monday: messages.advisor?.dashboard?.availability?.days?.monday || 'Monday',
            tuesday: messages.advisor?.dashboard?.availability?.days?.tuesday || 'Tuesday',
            wednesday: messages.advisor?.dashboard?.availability?.days?.wednesday || 'Wednesday',
            thursday: messages.advisor?.dashboard?.availability?.days?.thursday || 'Thursday',
            friday: messages.advisor?.dashboard?.availability?.days?.friday || 'Friday',
            saturday: messages.advisor?.dashboard?.availability?.days?.saturday || 'Saturday',
            sunday: messages.advisor?.dashboard?.availability?.days?.sunday || 'Sunday'
          },
          fields: {
            minNoticeHours: messages.advisor?.dashboard?.availability?.fields?.minNoticeHours || 'Minimum Notice (hours)',
            maxAdvanceDays: messages.advisor?.dashboard?.availability?.fields?.maxAdvanceDays || 'Maximum Advance Booking (days)',
            bufferMinutes: messages.advisor?.dashboard?.availability?.fields?.bufferMinutes || 'Buffer Between Consultations (minutes)',
            addTimeSlot: messages.advisor?.dashboard?.availability?.fields?.addTimeSlot || 'Add Time Slot',
            removeTimeSlot: messages.advisor?.dashboard?.availability?.fields?.removeTimeSlot || 'Remove',
            startTime: messages.advisor?.dashboard?.availability?.fields?.startTime || 'Start Time',
            endTime: messages.advisor?.dashboard?.availability?.fields?.endTime || 'End Time',
            addBlackoutDate: messages.advisor?.dashboard?.availability?.fields?.addBlackoutDate || 'Add Blackout Date',
            selectTimezone: messages.advisor?.dashboard?.availability?.fields?.selectTimezone || 'Select Timezone'
          },
          sync: {
            lastSynced: messages.advisor?.dashboard?.availability?.sync?.lastSynced || 'Last synced',
            status: messages.advisor?.dashboard?.availability?.sync?.status || 'Status',
            success: messages.advisor?.dashboard?.availability?.sync?.success || 'Success',
            failed: messages.advisor?.dashboard?.availability?.sync?.failed || 'Failed',
            pending: messages.advisor?.dashboard?.availability?.sync?.pending || 'Pending',
            syncNow: messages.advisor?.dashboard?.availability?.sync?.syncNow || 'Sync Now'
          },
          validation: {
            invalidTime: messages.advisor?.dashboard?.availability?.validation?.invalidTime || 'Invalid time format',
            overlappingSlots: messages.advisor?.dashboard?.availability?.validation?.overlappingSlots || 'Time slots cannot overlap',
            startAfterEnd: messages.advisor?.dashboard?.availability?.validation?.startAfterEnd || 'Start time must be before end time'
          }
        },
        navigation: {
          overview: messages.advisor?.dashboard?.navigation?.overview || 'Overview',
          consultations: messages.advisor?.dashboard?.navigation?.consultations || 'Consultations',
          analytics: messages.advisor?.dashboard?.navigation?.analytics || 'Analytics',
          availability: messages.advisor?.dashboard?.navigation?.availability || 'Availability',
          settings: messages.advisor?.dashboard?.navigation?.settings || 'Settings'
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      retry: messages.common?.retry || 'Try again',
      save: messages.common?.save || 'Save',
      cancel: messages.common?.cancel || 'Cancel',
      saving: messages.common?.saving || 'Saving...',
      saved: messages.common?.saved || 'Saved successfully'
    }
  };

  return (
    <AdvisorAvailabilityContent 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdvisorAvailabilityPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Advisor Availability - SheenApps',
      description: 'Manage your availability and calendar settings.'
    };
  }

  const messages = await getNamespacedMessages(locale, ['advisor']);

  return {
    title: messages.advisor?.dashboard?.availability?.title + ' - SheenApps' || 'Advisor Availability - SheenApps',
    description: 'Manage your availability and calendar settings.'
  };
}