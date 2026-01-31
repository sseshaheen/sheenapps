'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { format, subMonths, startOfMonth } from 'date-fns'
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

interface RevenueData {
  revenue: {
    mrr: number
    mrrGrowth: number
    mrrByPlan: Record<string, number>
    mrrByGateway: Record<string, number>
    arpu: number
    customerCount: number
    newCustomers: number
    churnedCustomers: number
    churnRate: number
  }
  ltv: number
  payments: {
    totalRevenue: number
    successfulPayments: number
    failedPayments: number
    failureRate: number
    averageTransactionValue: number
    revenueByCountry: Record<string, number>
    revenueByCurrency: Record<string, number>
  }
}

// Using design system chart colors instead of hardcoded values

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [historicalMRR, setHistoricalMRR] = useState<Array<{ month: string; mrr: number }>>([])

  const fetchRevenueData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/metrics/revenue?date=${selectedDate.toISOString()}`)
      if (!res.ok) throw new Error('Failed to fetch revenue data')
      const json = await res.json()
      setData(json.metrics)
    } catch (error) {
      console.error('Error fetching revenue data:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  const fetchHistoricalMRR = useCallback(async () => {
    // Fetch last 6 months of MRR data
    const promises = []
    for (let i = 5; i >= 0; i--) {
      const date = startOfMonth(subMonths(new Date(), i))
      promises.push(
        fetch(`/api/admin/metrics/revenue?date=${date.toISOString()}`)
          .then(res => res.json())
          .then(data => ({
            month: format(date, 'MMM'),
            mrr: data.metrics?.revenue?.mrr || 0
          }))
      )
    }

    try {
      const results = await Promise.all(promises)
      setHistoricalMRR(results)
    } catch (error) {
      console.error('Error fetching historical MRR:', error)
    }
  }, [])

  useEffect(() => {
    fetchRevenueData()
    fetchHistoricalMRR()
  }, [fetchRevenueData, fetchHistoricalMRR])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (!data) return null

  const planData = data.revenue?.mrrByPlan 
    ? Object.entries(data.revenue.mrrByPlan).map(([plan, mrr]) => ({
        name: plan.charAt(0).toUpperCase() + plan.slice(1),
        value: mrr
      }))
    : []

  const gatewayData = data.revenue?.mrrByGateway 
    ? Object.entries(data.revenue.mrrByGateway).map(([gateway, mrr]) => ({
        name: gateway.charAt(0).toUpperCase() + gateway.slice(1),
        value: mrr
      }))
    : []

  const countryData = data.payments?.revenueByCountry
    ? Object.entries(data.payments.revenueByCountry)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([country, revenue]) => ({
          name: country,
          value: revenue
        }))
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Revenue Metrics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Detailed revenue analysis and trends
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            onClick={() => setSelectedDate(subMonths(selectedDate, 1))}
            variant="outline"
            size="sm"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(selectedDate, 'MMMM yyyy')}
          </span>
          <Button
            onClick={() => setSelectedDate(subMonths(selectedDate, -1))}
            variant="outline"
            size="sm"
            disabled={selectedDate >= startOfMonth(new Date())}
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Monthly Recurring Revenue</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            ${(data.revenue?.mrr || 0).toLocaleString()}
          </p>
          <p className={`mt-2 text-sm ${(data.revenue?.mrrGrowth || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(data.revenue?.mrrGrowth || 0) > 0 ? '+' : ''}{data.revenue?.mrrGrowth || 0}% from last month
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Average Revenue Per User</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            ${(data.revenue?.arpu || 0).toFixed(2)}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {data.revenue?.customerCount || 0} active customers
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Customer Lifetime Value</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            ${(data?.ltv || 0).toFixed(2)}
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Churn Rate</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {data.revenue?.churnRate || 0}%
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {data.revenue.churnedCustomers} churned this month
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* MRR Trend */}
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">MRR Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={historicalMRR}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value: any) => value != null ? `$${value.toLocaleString()}` : '$0'} />
              <Line 
                type="monotone" 
                dataKey="mrr" 
                stroke={getChartColor('revenue')} 
                strokeWidth={2}
                dot={{ fill: getChartColor('revenue') }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* MRR by Plan */}
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">MRR by Plan</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={planData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill={getChartColor('revenue')}
                dataKey="value"
              >
                {planData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLOR_ARRAY[index % CHART_COLOR_ARRAY.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => value != null ? `$${value.toLocaleString()}` : '$0'} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue by Country */}
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Top Countries by Revenue</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={countryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: any) => value != null ? `$${value.toLocaleString()}` : '$0'} />
              <Bar dataKey="value" fill={getChartColor('revenue')} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Payment Metrics */}
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Metrics</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Total Revenue</span>
              <span className="text-sm font-medium">${(data?.payments?.totalRevenue || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Success Rate</span>
              <span className="text-sm font-medium">
                {(100 - (data?.payments?.failureRate || 0)).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Failed Payments</span>
              <span className="text-sm font-medium text-red-600">
                {data?.payments?.failedPayments || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Avg Transaction</span>
              <span className="text-sm font-medium">
                ${(data?.payments?.averageTransactionValue || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Customer Metrics */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Customer Movement</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-2xl font-semibold text-green-600">
              +{data.revenue.newCustomers}
            </p>
            <p className="text-sm text-gray-500">New Customers</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-gray-900">
              {data.revenue.customerCount}
            </p>
            <p className="text-sm text-gray-500">Total Active</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-red-600">
              -{data.revenue.churnedCustomers}
            </p>
            <p className="text-sm text-gray-500">Churned</p>
          </div>
        </div>
      </Card>
    </div>
  )
}