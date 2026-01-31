'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { format } from 'date-fns'

interface FailedPayment {
  id: string
  date: Date
  amount: number
  currency: string
  gateway: string
  error?: string
  userId: string
  email?: string
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<FailedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    hasMore: false
  })

  const fetchFailedPayments = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/api/admin/metrics/failed-payments?limit=${pagination.limit}&offset=${pagination.offset}`
      )
      if (!res.ok) throw new Error('Failed to fetch payment data')
      const json = await res.json()
      
      setPayments(json.data)
      setPagination(prev => ({
        ...prev,
        hasMore: json.pagination.hasMore
      }))
    } catch (error) {
      console.error('Error fetching failed payments:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.limit, pagination.offset])

  useEffect(() => {
    fetchFailedPayments()
  }, [fetchFailedPayments])

  const handleNextPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }))
  }

  const handlePreviousPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit)
    }))
  }

  const getGatewayBadgeColor = (gateway: string) => {
    switch (gateway.toLowerCase()) {
      case 'stripe':
        return 'bg-purple-100 text-purple-800'
      case 'cashier':
        return 'bg-blue-100 text-blue-800'
      case 'paypal':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getCurrencySymbol = (currency: string) => {
    switch (currency.toUpperCase()) {
      case 'USD':
        return '$'
      case 'EUR':
        return '€'
      case 'GBP':
        return '£'
      case 'EGP':
        return 'E£'
      default:
        return currency
    }
  }

  if (loading && payments.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Failed Payments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor and investigate payment failures
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Failed</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {payments.length}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            In current view
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Value</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            ${payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Lost revenue
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Most Common Gateway</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {payments.length > 0 
              ? Object.entries(
                  payments.reduce((acc, p) => {
                    acc[p.gateway] = (acc[p.gateway] || 0) + 1
                    return acc
                  }, {} as Record<string, number>)
                ).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
              : 'N/A'
            }
          </p>
        </Card>
      </div>

      {/* Failed Payments Table */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Payment Failures</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gateway
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(payment.date), 'MMM d, yyyy h:mm a')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {payment.email || 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {payment.userId.slice(0, 8)}...
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {getCurrencySymbol(payment.currency)}{payment.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      getGatewayBadgeColor(payment.gateway)
                    }`}>
                      {payment.gateway}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="max-w-xs truncate" title={payment.error}>
                      {payment.error || 'Unknown error'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // In production, this would open a detailed view
                        console.log('View payment details:', payment.id)
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {pagination.offset + 1} to {pagination.offset + payments.length}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={pagination.offset === 0}
            >
              <Icon name="chevron-left" className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!pagination.hasMore}
            >
              Next
              <Icon name="chevron-right" className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Common Error Patterns */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Common Error Patterns</h3>
        <div className="space-y-3">
          {Object.entries(
            payments.reduce((acc, p) => {
              const error = p.error || 'Unknown error'
              acc[error] = (acc[error] || 0) + 1
              return acc
            }, {} as Record<string, number>)
          )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([error, count]) => (
              <div key={error} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{error}</span>
                <span className="text-sm font-medium text-gray-900">{count} occurrences</span>
              </div>
            ))
          }
        </div>
      </Card>
    </div>
  )
}