import { notFound } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';
import { AdvisorFinanceConsole } from '@/components/advisor-network/advisor-finance-console';

interface AdminFinancePageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminFinancePage({ params }: AdminFinancePageProps) {
  const { locale } = await params;
  // Load translations for finance console
  const messages = await loadNamespace(locale, 'common');

  const translations = {
    admin: {
      finance: {
        title: messages.admin?.finance?.title || 'Finance Dashboard',
        subtitle: messages.admin?.finance?.subtitle || 'Platform revenue, advisor payouts, and financial analytics',
        revenue: {
          title: messages.admin?.finance?.revenue?.title || 'Platform Revenue',
          thisMonth: messages.admin?.finance?.revenue?.thisMonth || 'This Month',
          lastMonth: messages.admin?.finance?.revenue?.lastMonth || 'Last Month',
          growth: messages.admin?.finance?.revenue?.growth || 'Growth',
          total: messages.admin?.finance?.revenue?.total || 'Total Revenue'
        },
        payouts: {
          title: messages.admin?.finance?.payouts?.title || 'Advisor Payouts',
          pending: messages.admin?.finance?.payouts?.pending || 'Pending Payouts',
          processed: messages.admin?.finance?.payouts?.processed || 'Processed This Month',
          export: messages.admin?.finance?.payouts?.export || 'Export Payout CSV',
          process: messages.admin?.finance?.payouts?.process || 'Process Payouts',
          table: {
            advisor: messages.admin?.finance?.payouts?.table?.advisor || 'Advisor',
            amount: messages.admin?.finance?.payouts?.table?.amount || 'Amount',
            period: messages.admin?.finance?.payouts?.table?.period || 'Period',
            consultations: messages.admin?.finance?.payouts?.table?.consultations || 'Consultations',
            status: messages.admin?.finance?.payouts?.table?.status || 'Status',
            actions: messages.admin?.finance?.payouts?.table?.actions || 'Actions'
          }
        },
        metrics: {
          avgConsultationValue: messages.admin?.finance?.metrics?.avgConsultationValue || 'Avg Consultation Value',
          platformFeeRate: messages.admin?.finance?.metrics?.platformFeeRate || 'Platform Fee Rate',
          totalAdvisors: messages.admin?.finance?.metrics?.totalAdvisors || 'Total Earning Advisors',
          conversionRate: messages.admin?.finance?.metrics?.conversionRate || 'Booking Conversion Rate'
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
    <AdvisorFinanceConsole 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdminFinancePageProps) {
  const { locale } = await params;
  const messages = await loadNamespace(locale, 'common');

  return {
    title: messages.admin?.finance?.title || 'Finance Dashboard - Admin Console - SheenApps',
    description: 'Platform revenue analytics, advisor payout management, and financial metrics.'
  };
}