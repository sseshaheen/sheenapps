import { notFound } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';
import { AdvisorManagementConsole } from '@/components/advisor-network/advisor-management-console';

interface AdminAdvisorListPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminAdvisorListPage({ params }: AdminAdvisorListPageProps) {
  const { locale } = await params;
  // Load translations for advisor management console
  const messages = await loadNamespace(locale, 'common');

  const translations = {
    admin: {
      advisors: {
        title: messages.admin?.advisors?.management?.title || 'Advisor Management',
        subtitle: messages.admin?.advisors?.management?.subtitle || 'Manage active advisors and their performance metrics',
        filters: {
          status: messages.admin?.advisors?.management?.filters?.status || 'Status',
          search: messages.admin?.advisors?.management?.filters?.search || 'Search advisors...'
        },
        table: {
          advisor: messages.admin?.advisors?.management?.table?.advisor || 'Advisor',
          joinDate: messages.admin?.advisors?.management?.table?.joinDate || 'Join Date',
          consultations: messages.admin?.advisors?.management?.table?.consultations || 'Consultations',
          rating: messages.admin?.advisors?.management?.table?.rating || 'Rating',
          earnings: messages.admin?.advisors?.management?.table?.earnings || 'Earnings',
          status: messages.admin?.advisors?.management?.table?.status || 'Status',
          actions: messages.admin?.advisors?.management?.table?.actions || 'Actions'
        },
        actions: {
          suspend: messages.admin?.advisors?.management?.actions?.suspend || 'Suspend',
          reactivate: messages.admin?.advisors?.management?.actions?.reactivate || 'Reactivate',
          viewProfile: messages.admin?.advisors?.management?.actions?.viewProfile || 'View Profile',
          editProfile: messages.admin?.advisors?.management?.actions?.editProfile || 'Edit Profile',
          viewEarnings: messages.admin?.advisors?.management?.actions?.viewEarnings || 'View Earnings'
        },
        stats: {
          total: messages.admin?.advisors?.management?.stats?.total || 'Total Advisors',
          active: messages.admin?.advisors?.management?.stats?.active || 'Active',
          suspended: messages.admin?.advisors?.management?.stats?.suspended || 'Suspended',
          avgRating: messages.admin?.advisors?.management?.stats?.avgRating || 'Avg Rating'
        },
        empty: {
          title: messages.admin?.advisors?.management?.empty?.title || 'No Advisors Found',
          description: messages.admin?.advisors?.management?.empty?.description || 'No advisors match the current filters.'
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
    <AdvisorManagementConsole 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdminAdvisorListPageProps) {
  const { locale } = await params;
  const messages = await loadNamespace(locale, 'common');

  return {
    title: messages.admin?.advisors?.management?.title || 'Advisor Management - Admin Console - SheenApps',
    description: 'Manage active advisors, view performance metrics, and handle advisor accounts.'
  };
}