'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { CHART_COLOR_ARRAY, getChartColor } from '@/utils/chart-colors'

interface UsageData {
  usage: {
    totalGenerations: number
    averageGenerationsPerUser: number
    powerUsers: Array<{
      userId: string
      email: string
      generations: number
      plan: string
    }>
    featureAdoption: Record<string, number>
    limitHitFrequency: number
  }
  trials: {
    totalTrials: number
    activeTrials: number
    convertedTrials: number
    conversionRate: number
    averageTrialDuration: number
  }
}

// Using design system chart colors instead of hardcoded values

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  })

  const fetchUsageData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/metrics/usage?startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`
      )
      if (!res.ok) throw new Error('Failed to fetch usage data')
      const json = await res.json()
      setData(json.metrics)
    } catch (error) {
      console.error('Error fetching usage data:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchUsageData()
  }, [fetchUsageData])

  const handlePreviousMonth = () => {
    setDateRange({
      start: startOfMonth(subMonths(dateRange.start, 1)),
      end: endOfMonth(subMonths(dateRange.start, 1))
    })
  }

  const handleNextMonth = () => {
    setDateRange({
      start: startOfMonth(subMonths(dateRange.start, -1)),
      end: endOfMonth(subMonths(dateRange.start, -1))
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (!data) return null

  const featureData = data?.usage?.featureAdoption 
    ? Object.entries(data.usage.featureAdoption).map(([feature, count]) => ({
        name: feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        users: count
      }))
    : []

  const planDistribution = data?.usage?.powerUsers?.reduce((acc, user) => {
    acc[user.plan] = (acc[user.plan] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  const planData = Object.entries(planDistribution).map(([plan, count]) => ({
    name: plan.charAt(0).toUpperCase() + plan.slice(1),
    value: count
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Usage Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Feature adoption and user behavior insights
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            onClick={handlePreviousMonth}
            variant="outline"
            size="sm"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(dateRange.start, 'MMM yyyy')}
          </span>
          <Button
            onClick={handleNextMonth}
            variant="outline"
            size="sm"
            disabled={dateRange.end >= endOfMonth(new Date())}
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Total AI Generations</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {(data?.usage?.totalGenerations || 0).toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {data?.usage?.averageGenerationsPerUser || 0} avg per user
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Active Trials</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {data?.trials?.activeTrials || 0}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {data?.trials?.conversionRate || 0}% conversion rate
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Limit Hit Rate</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {data?.usage?.limitHitFrequency || 0}%
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Users near/at quota limit
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Trial Duration</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {data?.trials?.averageTrialDuration || 0} days
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Average trial length
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Feature Adoption */}
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Feature Adoption</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={featureData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip />
              <Bar dataKey="users" fill={getChartColor('usage')} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Trial Funnel */}
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Trial Funnel</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Total Trials Started</span>
                <span className="text-sm font-medium">{data?.trials?.totalTrials || 0}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Currently Active</span>
                <span className="text-sm font-medium">{data?.trials?.activeTrials || 0}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${((data?.trials?.activeTrials || 0) / (data?.trials?.totalTrials || 1)) * 100}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Converted to Paid</span>
                <span className="text-sm font-medium">{data?.trials?.convertedTrials || 0}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: `${data?.trials?.conversionRate || 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Power Users Table */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Power Users (Top 10%)</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  AI Generations
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(data?.usage?.powerUsers || []).slice(0, 10).map((user, index) => (
                <tr key={user.userId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.plan === 'scale' ? 'bg-purple-100 text-purple-800' :
                      user.plan === 'growth' ? 'bg-blue-100 text-blue-800' :
                      user.plan === 'starter' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {user.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {user.generations.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {((user.generations / data.usage.totalGenerations) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Plan Distribution for Power Users */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Power User Plan Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={planData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill={getChartColor('usage')}
                dataKey="value"
              >
                {planData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLOR_ARRAY[index % CHART_COLOR_ARRAY.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Usage Insights</h3>
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="flex">
                <Icon name="alert-circle" className="w-5 h-5 text-yellow-400" />
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-yellow-800">
                    High Limit Hit Rate
                  </h4>
                  <p className="mt-1 text-sm text-yellow-700">
                    {data.usage.limitHitFrequency}% of users are hitting their quota limits. 
                    Consider upgrade prompts or bonus programs.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex">
                <Icon name="trending-up" className="w-5 h-5 text-green-400" />
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-green-800">
                    Strong Engagement
                  </h4>
                  <p className="mt-1 text-sm text-green-700">
                    Average of {data.usage.averageGenerationsPerUser} generations per user shows 
                    healthy product engagement.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}