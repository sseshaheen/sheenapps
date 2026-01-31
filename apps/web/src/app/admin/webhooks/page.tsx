'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { format } from 'date-fns'

interface WebhookEvent {
  id: string
  gateway: string
  eventType: string
  status: 'success' | 'failed' | 'retrying'
  createdAt: Date
  retryCount: number
  error?: string
}

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGateway, setSelectedGateway] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    hasMore: false
  })

  const fetchWebhookEvents = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString()
      })
      if (selectedGateway) {
        params.append('gateway', selectedGateway)
      }

      const res = await fetch(`/api/admin/metrics/webhook-events?${params}`)
      if (!res.ok) throw new Error('Failed to fetch webhook events')
      const json = await res.json()
      
      setEvents(json.data)
      setPagination(prev => ({
        ...prev,
        hasMore: json.pagination.hasMore
      }))
    } catch (error) {
      console.error('Error fetching webhook events:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.limit, pagination.offset, selectedGateway])

  useEffect(() => {
    fetchWebhookEvents()
  }, [fetchWebhookEvents])

  const handleRetry = async (eventId: string) => {
    try {
      const res = await fetch('/api/admin/webhooks/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookId: eventId })
      })

      if (!res.ok) {
        throw new Error('Failed to retry webhook')
      }

      const result = await res.json()
      
      if (result.success) {
        // Refresh the events list
        fetchWebhookEvents()
        // Show success message (you could add a toast here)
        console.log('Webhook retry initiated successfully')
      } else {
        throw new Error(result.error || 'Failed to retry webhook')
      }
    } catch (error) {
      console.error('Error retrying webhook:', error)
      // Show error message (you could add a toast here)
    }
  }

  const getStatusBadge = (status: WebhookEvent['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'retrying':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getEventTypeIcon = (eventType: string) => {
    if (eventType.includes('subscription')) return 'credit-card'
    if (eventType.includes('payment')) return 'dollar-sign'
    if (eventType.includes('customer')) return 'user'
    return 'zap'
  }

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  const eventStats = events.reduce((acc, event) => {
    acc.total++
    acc[event.status] = (acc[event.status] || 0) + 1
    return acc
  }, { total: 0, success: 0, failed: 0, retrying: 0 } as any)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Webhook Events</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor webhook processing and retry failed events
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Events</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {eventStats.total}
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
          <p className="mt-2 text-3xl font-semibold text-green-600">
            {eventStats.total > 0 
              ? `${Math.round((eventStats.success / eventStats.total) * 100)}%`
              : '0%'
            }
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Failed</h3>
          <p className="mt-2 text-3xl font-semibold text-red-600">
            {eventStats.failed || 0}
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Retrying</h3>
          <p className="mt-2 text-3xl font-semibold text-yellow-600">
            {eventStats.retrying || 0}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Filter by gateway:</span>
            <div className="flex space-x-2">
              <Button
                variant={selectedGateway === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedGateway(null)}
              >
                All
              </Button>
              <Button
                variant={selectedGateway === 'stripe' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedGateway('stripe')}
              >
                Stripe
              </Button>
              <Button
                variant={selectedGateway === 'cashier' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedGateway('cashier')}
              >
                Cashier
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Events Table */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Events</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Event Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gateway
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Retries
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
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(event.createdAt), 'MMM d, h:mm:ss a')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center">
                      <Icon 
                        name={getEventTypeIcon(event.eventType) as any} 
                        className="w-4 h-4 text-gray-400 mr-2" 
                      />
                      {event.eventType}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.gateway}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      getStatusBadge(event.status)
                    }`}>
                      {event.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.retryCount}/3
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="max-w-xs truncate" title={event.error}>
                      {event.error || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {event.status === 'failed' && event.retryCount < 3 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetry(event.id)}
                      >
                        Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {pagination.offset + 1} to {pagination.offset + events.length}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
              disabled={pagination.offset === 0}
            >
              <Icon name="chevron-left" className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
              disabled={!pagination.hasMore}
            >
              Next
              <Icon name="chevron-right" className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Event Type Breakdown */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Event Type Breakdown</h3>
        <div className="space-y-3">
          {Object.entries(
            events.reduce((acc, event) => {
              acc[event.eventType] = (acc[event.eventType] || 0) + 1
              return acc
            }, {} as Record<string, number>)
          )
            .sort((a, b) => b[1] - a[1])
            .map(([eventType, count]) => (
              <div key={eventType} className="flex justify-between items-center">
                <div className="flex items-center">
                  <Icon 
                    name={getEventTypeIcon(eventType) as any} 
                    className="w-4 h-4 text-gray-400 mr-2" 
                  />
                  <span className="text-sm text-gray-600">{eventType}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))
          }
        </div>
      </Card>
    </div>
  )
}