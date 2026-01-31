'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { format } from 'date-fns'

interface DashboardMetrics {
  revenue: {
    mrr: number
    mrrGrowth: number
    customerCount: number
    churnRate: number
  }
  ltv: number
  trials: {
    activeTrials: number
    conversionRate: number
  }
  usage: {
    totalGenerations: number
    averageGenerationsPerUser: number
  }
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    try {
      // Fetch revenue and usage metrics in parallel
      const [revenueRes, usageRes] = await Promise.all([
        fetch('/api/admin/metrics/revenue'),
        fetch('/api/admin/metrics/usage'),
      ])
      if (!revenueRes.ok) throw new Error('Failed to fetch revenue metrics')
      if (!usageRes.ok) throw new Error('Failed to fetch usage metrics')
      const [revenueData, usageData] = await Promise.all([
        revenueRes.json(),
        usageRes.json(),
      ])

      setMetrics({
        revenue: revenueData.metrics?.revenue || {
          mrr: 0,
          mrrGrowth: 0,
          customerCount: 0,
          churnRate: 0
        },
        ltv: typeof revenueData.metrics?.ltv === 'object' 
          ? (revenueData.metrics.ltv.average || revenueData.metrics.ltv.overall || 0)
          : (revenueData.metrics?.ltv || 0),
        trials: usageData.metrics?.trials || {
          activeTrials: 0,
          conversionRate: 0
        },
        usage: usageData.metrics?.usage || {
          totalGenerations: 0,
          averageGenerationsPerUser: 0
        }
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        Error loading metrics: {error}
      </div>
    )
  }

  if (!metrics) return null

  const metricCards = [
    {
      title: 'Monthly Recurring Revenue',
      value: `$${(metrics?.revenue?.mrr || 0).toLocaleString()}`,
      change: metrics?.revenue?.mrrGrowth ? `${metrics.revenue.mrrGrowth > 0 ? '+' : ''}${metrics.revenue.mrrGrowth}%` : undefined,
      changeType: (metrics?.revenue?.mrrGrowth || 0) > 0 ? 'positive' : 'negative',
      icon: 'trending-up'
    },
    {
      title: 'Active Customers',
      value: (metrics?.revenue?.customerCount || 0).toLocaleString(),
      subtitle: metrics?.revenue?.churnRate !== undefined ? `${metrics.revenue.churnRate}% churn rate` : undefined,
      icon: 'users'
    },
    {
      title: 'Customer LTV',
      value: `$${(metrics?.ltv || 0).toLocaleString()}`,
      icon: 'dollar-sign'
    },
    {
      title: 'Active Trials',
      value: (metrics?.trials?.activeTrials || 0).toLocaleString(),
      subtitle: metrics?.trials?.conversionRate !== undefined ? `${metrics.trials.conversionRate}% conversion` : undefined,
      icon: 'clock'
    },
    {
      title: 'Total AI Generations',
      value: (metrics?.usage?.totalGenerations || 0).toLocaleString(),
      subtitle: metrics?.usage?.averageGenerationsPerUser ? `${Math.round(metrics.usage.averageGenerationsPerUser)} avg/user` : undefined,
      icon: 'cpu'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Last updated: {format(new Date(), 'MMM d, yyyy h:mm a')}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {metricCards.map((metric, index) => (
          <Card key={index} className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Icon name={metric.icon as any} className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {metric.title}
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      {metric.value}
                    </div>
                    {metric.change && (
                      <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                        metric.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {metric.change}
                      </div>
                    )}
                  </dd>
                  {metric.subtitle && (
                    <dd className="text-sm text-gray-500">{metric.subtitle}</dd>
                  )}
                </dl>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
          <Link href="/admin/revenue" className="block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Revenue Details</p>
                <p className="text-sm text-gray-500">View detailed revenue metrics</p>
              </div>
              <Icon name="arrow-right" className="w-5 h-5 text-gray-400" />
            </div>
          </Link>
        </Card>

        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
          <Link href="/admin/usage" className="block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Usage Analytics</p>
                <p className="text-sm text-gray-500">Feature adoption & power users</p>
              </div>
              <Icon name="arrow-right" className="w-5 h-5 text-gray-400" />
            </div>
          </Link>
        </Card>

        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
          <Link href="/admin/payments" className="block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Failed Payments</p>
                <p className="text-sm text-gray-500">Review payment failures</p>
              </div>
              <Icon name="arrow-right" className="w-5 h-5 text-gray-400" />
            </div>
          </Link>
        </Card>

        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
          <Link href="/admin/webhooks" className="block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Webhook Events</p>
                <p className="text-sm text-gray-500">Monitor webhook status</p>
              </div>
              <Icon name="arrow-right" className="w-5 h-5 text-gray-400" />
            </div>
          </Link>
        </Card>
      </div>
    </div>
  )
}