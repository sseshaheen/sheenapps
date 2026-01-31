import { notFound } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';
import { AdvisorApplicationsConsole } from '@/components/advisor-network/advisor-applications-console';

interface AdminAdvisorsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminAdvisorsPage({ params }: AdminAdvisorsPageProps) {
  const { locale } = await params;
  // Load translations for admin advisor console
  const messages = await loadNamespace(locale, 'common');

  const translations = {
    admin: {
      advisors: {
        title: messages.admin?.advisors?.title || 'Advisor Applications',
        subtitle: messages.admin?.advisors?.subtitle || 'Review and manage advisor applications',
        tabs: {
          pending: messages.admin?.advisors?.tabs?.pending || 'Pending Review',
          approved: messages.admin?.advisors?.tabs?.approved || 'Approved',
          rejected: messages.admin?.advisors?.tabs?.rejected || 'Rejected',
          all: messages.admin?.advisors?.tabs?.all || 'All Applications'
        },
        table: {
          applicant: messages.admin?.advisors?.table?.applicant || 'Applicant',
          appliedDate: messages.admin?.advisors?.table?.appliedDate || 'Applied',
          experience: messages.admin?.advisors?.table?.experience || 'Experience',
          skills: messages.admin?.advisors?.table?.skills || 'Skills',
          status: messages.admin?.advisors?.table?.status || 'Status',
          actions: messages.admin?.advisors?.table?.actions || 'Actions'
        },
        actions: {
          approve: messages.admin?.advisors?.actions?.approve || 'Approve',
          reject: messages.admin?.advisors?.actions?.reject || 'Reject',
          viewProfile: messages.admin?.advisors?.actions?.viewProfile || 'View Profile',
          addNotes: messages.admin?.advisors?.actions?.addNotes || 'Add Notes'
        },
        stats: {
          total: messages.admin?.advisors?.stats?.total || 'Total Applications',
          pending: messages.admin?.advisors?.stats?.pending || 'Pending Review',
          approved: messages.admin?.advisors?.stats?.approved || 'Approved',
          rejected: messages.admin?.advisors?.stats?.rejected || 'Rejected'
        },
        review: {
          title: messages.admin?.advisors?.review?.title || 'Review Application',
          approveConfirm: messages.admin?.advisors?.review?.approveConfirm || 'Approve this advisor application?',
          rejectConfirm: messages.admin?.advisors?.review?.rejectConfirm || 'Reject this advisor application?',
          adminNotes: messages.admin?.advisors?.review?.adminNotes || 'Admin Notes',
          adminNotesPlaceholder: messages.admin?.advisors?.review?.adminNotesPlaceholder || 'Add notes about this application...'
        },
        empty: {
          title: messages.admin?.advisors?.empty?.title || 'No Applications Found',
          description: messages.admin?.advisors?.empty?.description || 'No advisor applications match the current filter.'
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      success: messages.common?.success || 'Success',
      confirm: messages.common?.confirm || 'Confirm',
      cancel: messages.common?.cancel || 'Cancel'
    }
  };

  return (
    <AdvisorApplicationsConsole 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdminAdvisorsPageProps) {
  const { locale } = await params;
  const messages = await loadNamespace(locale, 'common');

  return {
    title: messages.admin?.advisors?.title || 'Advisor Applications - Admin Console - SheenApps',
    description: 'Review and manage advisor applications for the SheenApps advisor network.'
  };
}