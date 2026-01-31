import { notFound } from 'next/navigation';
import { ConsultationsContent } from '@/components/advisor-network/consultations-content';
import { loadNamespace } from '@/i18n/message-loader';

interface ConsultationsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ConsultationsPage(props: ConsultationsPageProps) {
  const params = await props.params;
  
  // Load translations
  const messages = await loadNamespace(params.locale, 'advisor');
  if (Object.keys(messages).length === 0) {
    notFound();
  }

  const translations = {
    consultations: {
      title: messages.consultations?.title || 'Consultations',
      list: messages.consultations?.list || {
        upcoming: 'Upcoming',
        completed: 'Completed',
        cancelled: 'Cancelled',
        all: 'All Consultations',
        empty: {
          upcoming: 'No upcoming consultations',
          completed: 'No completed consultations',
          cancelled: 'No cancelled consultations'
        }
      },
      card: messages.consultations?.card || {
        duration: 'Duration',
        status: {
          scheduled: 'Scheduled',
          in_progress: 'In Progress',
          completed: 'Completed',
          cancelled: 'Cancelled',
          no_show: 'No Show'
        },
        actions: {
          join: 'Join Call',
          cancel: 'Cancel',
          reschedule: 'Reschedule',
          review: 'Leave Review',
          viewRecording: 'View Recording'
        }
      }
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header spacer - semantic approach */}
      <div className="header-spacer" aria-hidden="true" />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            {translations.consultations.title}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Manage your consultation bookings and history
          </p>
        </div>
        
        <div className="max-w-6xl mx-auto">
          <ConsultationsContent translations={translations} />
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata(props: ConsultationsPageProps) {
  const params = await props.params;

  return {
    title: 'My Consultations - SheenApps',
    description: 'View and manage your consultation bookings, upcoming sessions, and consultation history.'
  };
}