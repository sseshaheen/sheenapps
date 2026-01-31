/**
 * In-House Payments Admin Dashboard
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface PaymentEventRow {
  id: string
  project_id: string
  stripe_event_id: string
  event_type: string
  customer_id: string | null
  subscription_id: string | null
  status: string
  processed_at: string | null
  created_at: string
}

interface PaymentCustomerRow {
  id: string
  project_id: string
  stripe_customer_id: string
  email: string
  name: string | null
  created_at: string
}

export function InhousePaymentsAdmin() {
  const [projectId, setProjectId] = useState('')
  const [eventType, setEventType] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [events, setEvents] = useState<PaymentEventRow[]>([])
  const [customers, setCustomers] = useState<PaymentCustomerRow[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [customersLoading, setCustomersLoading] = useState(true)

  const eventsAbortRef = useRef<AbortController | null>(null)
  const customersAbortRef = useRef<AbortController | null>(null)

  const fetchEvents = useCallback(async () => {
    eventsAbortRef.current?.abort()
    const controller = new AbortController()
    eventsAbortRef.current = controller

    setEventsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)
      if (eventType) params.set('eventType', eventType)
      if (status) params.set('status', status)

      const response = await fetch(`/api/admin/inhouse/payments/events?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch events')

      const data = await response.json()
      setEvents(data.data?.events || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch events:', error)
        toast.error('Failed to load events')
      }
    } finally {
      setEventsLoading(false)
    }
  }, [projectId, eventType, status])

  const fetchCustomers = useCallback(async () => {
    customersAbortRef.current?.abort()
    const controller = new AbortController()
    customersAbortRef.current = controller

    setCustomersLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)
      if (search) params.set('search', search)

      const response = await fetch(`/api/admin/inhouse/payments/customers?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch customers')

      const data = await response.json()
      setCustomers(data.data?.customers || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch customers:', error)
        toast.error('Failed to load customers')
      }
    } finally {
      setCustomersLoading(false)
    }
  }, [projectId, search])

  useEffect(() => {
    fetchEvents()
    fetchCustomers()
    return () => {
      eventsAbortRef.current?.abort()
      customersAbortRef.current?.abort()
    }
  }, [fetchEvents, fetchCustomers])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payments Filters
          </CardTitle>
          <CardDescription>Filter events and customers</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (optional)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Input
            placeholder="Event type (optional)"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-[220px]"
          />
          <Input
            placeholder="Status (pending/processed/failed)"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-[220px]"
          />
          <Input
            placeholder="Customer search (email or stripe id)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[280px]"
          />
          <Button variant="outline" onClick={() => { fetchEvents(); fetchCustomers() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Events</CardTitle>
          <CardDescription>Recent webhook events across projects</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No events found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="font-medium">{event.project_id}</div>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{event.event_type}</TableCell>
                    <TableCell><Badge variant="outline">{event.status}</Badge></TableCell>
                    <TableCell>{format(new Date(event.created_at), 'PPp')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>Stored customer records</CardDescription>
        </CardHeader>
        <CardContent>
          {customersLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : customers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No customers found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Stripe Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>{customer.project_id}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{customer.stripe_customer_id}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{customer.email}</TableCell>
                    <TableCell>{format(new Date(customer.created_at), 'PPp')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
