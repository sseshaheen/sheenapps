import { Metadata } from 'next'
import { QuotaMonitoringDashboard } from '@/components/admin/quota-monitoring-dashboard'

export const metadata: Metadata = {
  title: 'Quota Monitoring | Admin',
  description: 'Real-time quota monitoring and analytics dashboard'
}

export default function QuotaMonitoringPage() {
  return <QuotaMonitoringDashboard />
}