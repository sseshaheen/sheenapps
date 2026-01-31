import { ABTestingDashboard } from '@/components/analytics/ab-testing-dashboard'

export const dynamic = 'force-dynamic'

export default function ABTestingPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">A/B Testing Dashboard</h1>
        <p className="text-gray-600">
          Monitor and analyze A/B test performance for component mappings and other experiments.
        </p>
      </div>

      <ABTestingDashboard />
    </div>
  )
}

export const metadata = {
  title: 'A/B Testing Dashboard',
  description: 'Monitor and analyze A/B test performance',
}