import { notFound } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';
import { AdvisorConsultationsConsole } from '@/components/advisor-network/advisor-consultations-console';

interface AdminConsultationsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminConsultationsPage({ params }: AdminConsultationsPageProps) {
  // Load translations for admin consultations console
  const { locale } = await params;
  
  const messages = await loadNamespace(locale, 'common');

  const translations = {
    admin: {
      consultations: {
        title: messages.admin?.consultations?.title || 'Consultation Management',
        subtitle: messages.admin?.consultations?.subtitle || 'Manage all advisor consultations and resolve issues',
        filters: {
          status: messages.admin?.consultations?.filters?.status || 'Status',
          advisor: messages.admin?.consultations?.filters?.advisor || 'Advisor',
          dateRange: messages.admin?.consultations?.filters?.dateRange || 'Date Range',
          search: messages.admin?.consultations?.filters?.search || 'Search consultations...'
        },
        table: {
          consultation: messages.admin?.consultations?.table?.consultation || 'Consultation',
          advisor: messages.admin?.consultations?.table?.advisor || 'Advisor',
          client: messages.admin?.consultations?.table?.client || 'Client',
          date: messages.admin?.consultations?.table?.date || 'Date & Time',
          duration: messages.admin?.consultations?.table?.duration || 'Duration',
          status: messages.admin?.consultations?.table?.status || 'Status',
          revenue: messages.admin?.consultations?.table?.revenue || 'Revenue',
          actions: messages.admin?.consultations?.table?.actions || 'Actions'
        },
        actions: {
          refund: messages.admin?.consultations?.actions?.refund || 'Issue Refund',
          markNoShow: messages.admin?.consultations?.actions?.markNoShow || 'Mark No-Show',
          viewDetails: messages.admin?.consultations?.actions?.viewDetails || 'View Details',
          contactClient: messages.admin?.consultations?.actions?.contactClient || 'Contact Client',
          contactAdvisor: messages.admin?.consultations?.actions?.contactAdvisor || 'Contact Advisor'
        },
        stats: {
          total: messages.admin?.consultations?.stats?.total || 'Total Consultations',
          completed: messages.admin?.consultations?.stats?.completed || 'Completed',
          cancelled: messages.admin?.consultations?.stats?.cancelled || 'Cancelled',
          revenue: messages.admin?.consultations?.stats?.revenue || 'Total Revenue',
          refunded: messages.admin?.consultations?.stats?.refunded || 'Refunded'
        },
        empty: {
          title: messages.admin?.consultations?.empty?.title || 'No Consultations Found',
          description: messages.admin?.consultations?.empty?.description || 'No consultations match the current filters.'
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
    <AdvisorConsultationsConsole 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdminConsultationsPageProps) {
  const { locale } = await params;
  const messages = await loadNamespace(locale, 'common');

  return {
    title: messages.admin?.consultations?.title || 'Consultation Management - Admin Console - SheenApps',
    description: 'Manage advisor consultations, handle refunds, and resolve consultation issues.'
  };
}