/**
 * Customer 360 Dashboard Component
 * Comprehensive single-page view of all customer context
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  AlertCircle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  FileText,
  Hammer,
  Headphones,
  Mail,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Video,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

// Types
type HealthStatus = 'healthy' | 'monitor' | 'at_risk' | 'critical' | 'onboarding'

interface Customer360Data {
  profile: {
    userId: string
    email: string
    name?: string
    avatarUrl?: string
    createdAt: string
    lastSignInAt?: string
    region?: string
  }
  health: {
    score: number
    status: HealthStatus
    usageRecencyScore: number
    activationScore: number
    buildHealthScore: number
    billingRiskScore: number
    supportLoadScore: number
    recentSuccessBonus: number
    reasons: string[]
    trend: 'up' | 'down' | 'stable'
    score7dAgo: number | null
    score30dAgo: number | null
    accountAgeDays: number
  } | null
  billing: {
    subscription: {
      subscriptionId?: string
      planKey?: string
      status?: string
      amountCents?: number
      currency?: string
      billingInterval?: string
      currentPeriodEnd?: string
      daysUntilRenewal?: number
      cancelAtPeriodEnd?: boolean
    }
    mrrCents: number
    ltvCents: number
    totalPayments: number
    failedPayments: number
    lastPaymentAt?: string
    lastPaymentStatus?: string
    stripeCustomerId?: string
  }
  usage: {
    totalProjects: number
    activeProjects: number
    buildsThisMonth: number
    lastBuildAt?: string
    lastBuildStatus?: string
    buildSuccessRate?: number
  }
  support: {
    openTickets: number
    totalTickets: number
    avgResponseTimeHours?: number
    lastTicketAt?: string
  }
  recentErrors: Array<{
    buildId: string
    projectId: string
    projectName?: string
    errorMessage: string
    failureStage?: string
    occurredAt: string
  }>
  activityTimeline: Array<{
    id: string
    type: 'build' | 'billing' | 'support' | 'auth' | 'project' | 'admin'
    title: string
    description?: string
    status?: string
    occurredAt: string
    metadata?: Record<string, any>
  }>
  notes: Array<{
    id: string
    note: string
    createdBy: string
    createdByEmail?: string
    createdAt: string
  }>
  contactLog: Array<{
    id: string
    contactType: string
    summary: string
    createdBy: string
    createdByEmail?: string
    createdAt: string
  }>
  tags: string[]
  quickActions: {
    canRefund: boolean
    canExtendTrial: boolean
    canSuspend: boolean
    isSuspended: boolean
  }
}

interface Customer360DashboardProps {
  userId: string
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

// Status configuration
const statusConfig: Record<HealthStatus, { label: string; color: string; bgColor: string; textClass: string }> = {
  healthy: { label: 'Healthy', color: 'bg-green-500', bgColor: 'bg-green-100', textClass: 'text-green-700' },
  monitor: { label: 'Monitor', color: 'bg-yellow-500', bgColor: 'bg-yellow-100', textClass: 'text-yellow-700' },
  at_risk: { label: 'At Risk', color: 'bg-orange-500', bgColor: 'bg-orange-100', textClass: 'text-orange-700' },
  critical: { label: 'Critical', color: 'bg-red-500', bgColor: 'bg-red-100', textClass: 'text-red-700' },
  onboarding: { label: 'Onboarding', color: 'bg-blue-500', bgColor: 'bg-blue-100', textClass: 'text-blue-700' },
}

// Activity type icons
const activityTypeIcons: Record<string, any> = {
  build: Hammer,
  billing: CreditCard,
  support: Headphones,
  auth: User,
  project: Building2,
  admin: MessageSquare,
}

export function Customer360Dashboard({
  userId,
  adminId,
  adminEmail,
  adminRole,
  permissions,
}: Customer360DashboardProps) {
  const [customer, setCustomer] = useState<Customer360Data | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false)
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false)
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [contactSummary, setContactSummary] = useState('')
  const [contactType, setContactType] = useState<'email' | 'call' | 'meeting' | 'chat' | 'other'>('email')
  const [newTag, setNewTag] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canWrite = permissions.includes('customer_360.write') || adminRole === 'super_admin'

  // Fetch customer data
  const fetchCustomer = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch(`/api/admin/customer-360/${userId}`, {
        cache: 'no-store',
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 404) {
          setError('Customer not found')
        } else {
          setError('Failed to load customer data')
        }
        return
      }

      const result = await response.json()
      if (result.success) {
        setCustomer(result.data)
      } else {
        setError(result.error || 'Failed to load customer data')
      }
    } catch (err) {
      console.error('Error fetching customer:', err)
      setError('Failed to load customer data')
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchCustomer()
  }, [fetchCustomer])

  // Add note
  const handleAddNote = async () => {
    if (!noteText.trim()) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/admin/customer-360/${userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: noteText, adminId }),
      })

      if (response.ok) {
        toast.success('Note added')
        setNoteText('')
        setIsNoteDialogOpen(false)
        fetchCustomer()
      } else {
        toast.error('Failed to add note')
      }
    } catch {
      toast.error('Failed to add note')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Log contact
  const handleLogContact = async () => {
    if (!contactSummary.trim()) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/admin/customer-360/${userId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contactType, summary: contactSummary, adminId }),
      })

      if (response.ok) {
        toast.success('Contact logged')
        setContactSummary('')
        setIsContactDialogOpen(false)
        fetchCustomer()
      } else {
        toast.error('Failed to log contact')
      }
    } catch {
      toast.error('Failed to log contact')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Add tag
  const handleAddTag = async () => {
    if (!newTag.trim()) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/admin/customer-360/${userId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tag: newTag.trim(), adminId }),
      })

      if (response.ok) {
        toast.success('Tag added')
        setNewTag('')
        setIsTagDialogOpen(false)
        fetchCustomer()
      } else {
        toast.error('Failed to add tag')
      }
    } catch {
      toast.error('Failed to add tag')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Remove tag
  const handleRemoveTag = async (tag: string) => {
    try {
      const response = await fetch(`/api/admin/customer-360/${userId}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        toast.success('Tag removed')
        fetchCustomer()
      } else {
        toast.error('Failed to remove tag')
      }
    } catch {
      toast.error('Failed to remove tag')
    }
  }

  // Format currency
  const formatCurrency = (cents: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error || !customer) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">{error || 'Customer not found'}</h2>
        <p className="text-muted-foreground mb-4">Unable to load customer data</p>
        <Link href="/admin/customer-health">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customer Health
          </Button>
        </Link>
      </Card>
    )
  }

  const healthConfig = customer.health?.status ? statusConfig[customer.health.status] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/customer-health" className="hover:underline">
          Customer Health
        </Link>
        <span>/</span>
        <span className="text-foreground">{customer.profile.email}</span>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            {/* Left: Avatar, Name, Email */}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                {customer.profile.avatarUrl ? (
                  <img
                    src={customer.profile.avatarUrl}
                    alt={customer.profile.email}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <User className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{customer.profile.name || customer.profile.email}</h1>
                <p className="text-muted-foreground">{customer.profile.email}</p>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Customer since {format(new Date(customer.profile.createdAt), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            {/* Right: Health Score, Subscription, Actions */}
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {/* Health Score */}
              {customer.health && healthConfig && (
                <div className={`px-4 py-2 rounded-lg ${healthConfig.bgColor}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${healthConfig.textClass}`}>
                      {customer.health.score}
                    </span>
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${healthConfig.textClass}`}>
                        {healthConfig.label}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center">
                        {customer.health.trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500 mr-1" />}
                        {customer.health.trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500 mr-1" />}
                        {customer.health.trend === 'stable' && <Minus className="h-3 w-3 text-gray-500 mr-1" />}
                        {customer.health.score7dAgo !== null
                          ? `was ${customer.health.score7dAgo} last week`
                          : 'No history'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Subscription */}
              {customer.billing.subscription.planKey && (
                <Badge variant="outline" className="text-sm py-1 px-3">
                  {customer.billing.subscription.planKey}
                  {customer.billing.subscription.amountCents ? (
                    <span className="ml-1 text-muted-foreground">
                      ({formatCurrency(customer.billing.subscription.amountCents, customer.billing.subscription.currency)}/
                      {customer.billing.subscription.billingInterval || 'mo'})
                    </span>
                  ) : null}
                  {customer.billing.subscription.daysUntilRenewal !== undefined && (
                    <span className="ml-2 text-muted-foreground">
                      Renews in {customer.billing.subscription.daysUntilRenewal} days
                    </span>
                  )}
                </Badge>
              )}

              {/* Quick Actions */}
              {canWrite && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled>
                    Refund
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    Extend Trial
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {customer.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                {canWrite && (
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
            {canWrite && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTagDialogOpen(true)}
                className="h-6 px-2"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Tag
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Notes & Contact Log */}
        <div className="space-y-6">
          {/* Internal Notes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Internal Notes</CardTitle>
              {canWrite && (
                <Button variant="ghost" size="sm" onClick={() => setIsNoteDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {customer.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet</p>
              ) : (
                <ScrollArea className="h-48">
                  <div className="space-y-3">
                    {customer.notes.map((note) => (
                      <div key={note.id} className="p-2 bg-muted rounded-lg text-sm">
                        <p>{note.note}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Contact Log */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Contact Log</CardTitle>
              {canWrite && (
                <Button variant="ghost" size="sm" onClick={() => setIsContactDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {customer.contactLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts logged</p>
              ) : (
                <ScrollArea className="h-48">
                  <div className="space-y-3">
                    {customer.contactLog.map((contact) => (
                      <div key={contact.id} className="flex items-start gap-2 text-sm">
                        <div className="mt-0.5">
                          {contact.contactType === 'email' && <Mail className="h-4 w-4 text-muted-foreground" />}
                          {contact.contactType === 'call' && <Phone className="h-4 w-4 text-muted-foreground" />}
                          {contact.contactType === 'meeting' && <Video className="h-4 w-4 text-muted-foreground" />}
                          {contact.contactType === 'chat' && <MessageSquare className="h-4 w-4 text-muted-foreground" />}
                          {contact.contactType === 'other' && <FileText className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1">
                          <p>{contact.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle Column: Overview Cards */}
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Account */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Account</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customer.health?.accountAgeDays || 0} days</div>
                <p className="text-xs text-muted-foreground">
                  Last login:{' '}
                  {customer.profile.lastSignInAt
                    ? formatDistanceToNow(new Date(customer.profile.lastSignInAt), { addSuffix: true })
                    : 'Never'}
                </p>
              </CardContent>
            </Card>

            {/* Billing */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">LTV</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(customer.billing.ltvCents)}</div>
                <p className="text-xs text-muted-foreground">
                  {customer.billing.failedPayments > 0 ? (
                    <span className="text-red-500">{customer.billing.failedPayments} failed payment(s)</span>
                  ) : (
                    `${customer.billing.totalPayments} total payments`
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Usage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customer.usage.activeProjects}</div>
                <p className="text-xs text-muted-foreground">
                  {customer.usage.buildsThisMonth} builds this month
                </p>
              </CardContent>
            </Card>

            {/* Support */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Support</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {customer.support.openTickets > 0 ? (
                    <span className="text-orange-500">{customer.support.openTickets} open</span>
                  ) : (
                    <span className="text-green-500">None open</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {customer.support.totalTickets} total tickets
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Health Score Breakdown */}
          {customer.health && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Health Score Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Usage Recency</span>
                    <span className="font-medium">{customer.health.usageRecencyScore}/30</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Activation</span>
                    <span className="font-medium">{customer.health.activationScore}/20</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Build Health</span>
                    <span className="font-medium">{customer.health.buildHealthScore}/20</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Billing Risk</span>
                    <span className="font-medium">{customer.health.billingRiskScore}/20</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Support Load</span>
                    <span className="font-medium">{customer.health.supportLoadScore}/10</span>
                  </div>
                  {customer.health.recentSuccessBonus > 0 && (
                    <div className="flex justify-between items-center text-green-600">
                      <span className="text-sm">Recent Success Bonus</span>
                      <span className="font-medium">+{customer.health.recentSuccessBonus}</span>
                    </div>
                  )}
                  <Separator />
                  {customer.health.reasons.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground mb-2">Key factors:</p>
                      <ul className="text-xs space-y-1">
                        {customer.health.reasons.slice(0, 3).map((reason, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Recent Errors & Timeline */}
        <div className="space-y-6">
          {/* Recent Errors */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Recent Errors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customer.recentErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent errors</p>
              ) : (
                <div className="space-y-3">
                  {customer.recentErrors.map((error) => (
                    <div key={error.buildId} className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg text-sm">
                      <p className="font-medium text-red-700 dark:text-red-400 truncate">
                        {error.errorMessage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {error.projectName || error.projectId.slice(0, 8)} -{' '}
                        {formatDistanceToNow(new Date(error.occurredAt), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72">
                <div className="space-y-4">
                  {customer.activityTimeline.map((activity) => {
                    const Icon = activityTypeIcons[activity.type] || Clock
                    return (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 rounded-full bg-muted">
                          <Icon className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{activity.title}</p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(activity.occurredAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Internal Note</DialogTitle>
            <DialogDescription>
              Add a note about this customer. Only visible to admins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Enter your note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={isSubmitting || !noteText.trim()}>
              {isSubmitting ? 'Adding...' : 'Add Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Contact Dialog */}
      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Contact</DialogTitle>
            <DialogDescription>
              Record a contact with this customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Contact Type</Label>
              <Select value={contactType} onValueChange={(v: any) => setContactType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Summary</Label>
              <Textarea
                placeholder="What was discussed..."
                value={contactSummary}
                onChange={(e) => setContactSummary(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogContact} disabled={isSubmitting || !contactSummary.trim()}>
              {isSubmitting ? 'Logging...' : 'Log Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Tag Dialog */}
      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tag</DialogTitle>
            <DialogDescription>
              Add a tag to categorize this customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="e.g., VIP, Enterprise, High-touch"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTag} disabled={isSubmitting || !newTag.trim()}>
              {isSubmitting ? 'Adding...' : 'Add Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
