/**
 * Support Ticket System Component
 * Comprehensive ticket management with SLA tracking
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { 
  Headphones,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MessageSquare,
  User,
  Mail,
  Calendar,
  RefreshCw,
  Send,
  Filter,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Timer,
  FileText
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow, addHours, differenceInHours } from 'date-fns'

interface SupportTicket {
  id: string
  ticket_number: string
  subject: string
  category: 'billing' | 'technical' | 'account' | 'feature_request' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed'
  user_email: string
  user_name?: string
  assigned_to?: string
  sla_deadline: string
  created_at: string
  updated_at: string
  message_count: number
  last_message_at?: string
  is_internal_note?: boolean
}

interface TicketMessage {
  id: string
  ticket_id: string
  sender_email: string
  sender_name?: string
  body: string
  is_internal: boolean
  created_at: string
  attachments?: string[]
}

interface SLAMetrics {
  total_tickets: number
  within_sla: number
  breached_sla: number
  at_risk: number
  avg_resolution_time: number
  sla_compliance_rate: number
}

interface SupportTicketSystemProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
  canManageTickets: boolean
}

const SLA_HOURS = {
  urgent: 2,
  high: 6,
  medium: 24,
  low: 48
}

const PRIORITY_COLORS = {
  urgent: 'text-red-600 bg-red-50',
  high: 'text-orange-600 bg-orange-50',
  medium: 'text-yellow-600 bg-yellow-50',
  low: 'text-green-600 bg-green-50'
}

export function SupportTicketSystem({ 
  adminId, 
  adminEmail,
  adminRole, 
  permissions, 
  canManageTickets 
}: SupportTicketSystemProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [slaMetrics, setSlaMetrics] = useState<SLAMetrics | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [replyMessage, setReplyMessage] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [showTicketDialog, setShowTicketDialog] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)

  // Fetch support tickets from API
  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch('/api/admin/support/tickets')
        if (!response.ok) {
          throw new Error(`Failed to fetch support tickets: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (data.success && data.tickets) {
          setTickets(data.tickets)
          
          // Use SLA metrics from API if available
          if (data.sla_metrics) {
            // Parse the metrics from backend format
            const metrics: SLAMetrics = {
              total_tickets: data.sla_metrics.total_tickets || data.tickets.length || 0,
              within_sla: data.sla_metrics.within_sla || data.sla_metrics.tickets_resolved_on_time || 0,
              breached_sla: data.sla_metrics.breached_sla || data.sla_metrics.breached_tickets || data.sla_metrics.overdue_tickets || 0,
              at_risk: data.sla_metrics.at_risk || 0,
              avg_resolution_time: parseFloat(data.sla_metrics.avg_resolution_time?.replace(' hours', '').replace('h', '') || '0'),
              sla_compliance_rate: parseFloat(data.sla_metrics.sla_compliance_rate?.replace('%', '') || '100')
            }
            setSlaMetrics(metrics)
          } else {
            // Fallback: Calculate from tickets if metrics not provided
            const overdueTickets = data.tickets.filter((t: SupportTicket) => 
              t.sla_deadline && new Date(t.sla_deadline) < new Date()
            )
            
            const metrics: SLAMetrics = {
              total_tickets: data.tickets.length || 0,
              within_sla: data.tickets.length - overdueTickets.length,
              breached_sla: overdueTickets.length,
              at_risk: data.tickets.filter((t: SupportTicket) => t.priority === 'urgent' || t.priority === 'high').length,
              avg_resolution_time: 0, // No data available
              sla_compliance_rate: data.tickets.length > 0 
                ? Math.round(((data.tickets.length - overdueTickets.length) / data.tickets.length) * 100)
                : 100
            }
            setSlaMetrics(metrics)
          }
        } else {
          setError(data.error || 'Failed to load support tickets')
          setTickets([])
        }
      } catch (error) {
        console.error('Error fetching support tickets:', error)
        setError(error instanceof Error ? error.message : 'Failed to connect to admin service')
        setTickets([])
      } finally {
        setLoading(false)
      }
    }

    fetchTickets()
  }, [])

  const getSLAStatus = (ticket: SupportTicket) => {
    const deadline = new Date(ticket.sla_deadline)
    const now = new Date()
    const hoursRemaining = differenceInHours(deadline, now)

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return { status: 'completed', label: 'Completed', color: 'text-green-600' }
    }
    if (hoursRemaining < 0) {
      return { status: 'breached', label: 'SLA Breached', color: 'text-red-600' }
    }
    if (hoursRemaining < 2) {
      return { status: 'at_risk', label: `${hoursRemaining}h remaining`, color: 'text-orange-600' }
    }
    return { status: 'on_track', label: `${hoursRemaining}h remaining`, color: 'text-green-600' }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <ArrowUp className="h-4 w-4" />
      case 'high': return <ArrowUp className="h-4 w-4" />
      case 'medium': return <ArrowRight className="h-4 w-4" />
      case 'low': return <ArrowDown className="h-4 w-4" />
      default: return <ArrowRight className="h-4 w-4" />
    }
  }

  const handleViewTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket)
    setShowTicketDialog(true)
    
    // Mock messages
    const mockMessages: TicketMessage[] = [
      {
        id: 'msg_1',
        ticket_id: ticket.id,
        sender_email: ticket.user_email,
        sender_name: ticket.user_name,
        body: 'I cannot process payments on my account. Getting an error message.',
        is_internal: false,
        created_at: ticket.created_at
      },
      {
        id: 'msg_2',
        ticket_id: ticket.id,
        sender_email: adminEmail,
        sender_name: 'Support Team',
        body: 'Thank you for contacting us. We are investigating the issue.',
        is_internal: false,
        created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
      },
      {
        id: 'msg_3',
        ticket_id: ticket.id,
        sender_email: adminEmail,
        sender_name: 'Support Team',
        body: 'Internal note: Check Stripe webhook configuration',
        is_internal: true,
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
      }
    ]
    
    setTicketMessages(mockMessages)
  }

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return

    setSendingReply(true)
    
    try {
      const response = await fetch(`/api/admin/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: replyMessage.trim(),
          is_internal: isInternalNote,
          attachments: []
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }
      
      // Add the new message to the local state
      const newMessage: TicketMessage = {
        id: data.message?.id || `msg_${Date.now()}`,
        ticket_id: selectedTicket.id,
        sender_email: data.message?.sender_email || adminEmail,
        sender_name: data.message?.sender_name || 'Support Team',
        body: replyMessage.trim(),
        is_internal: isInternalNote,
        created_at: data.message?.created_at || new Date().toISOString()
      }
      
      setTicketMessages(prev => [...prev, newMessage])
      setReplyMessage('')
      setIsInternalNote(false)
      
      toast.success(
        isInternalNote ? 'Internal note added successfully' : 'Reply sent successfully',
        {
          description: isInternalNote 
            ? 'Note has been added to the ticket' 
            : 'Customer will be notified via email'
        }
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send reply'
      toast.error('Failed to send message', {
        description: errorMessage
      })
    } finally {
      setSendingReply(false)
    }
  }

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': `[S01] Status updated to ${newStatus}`
        },
        body: JSON.stringify({
          status: newStatus,
          reason: `Status changed to ${newStatus} by admin`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update ticket status')
      }
      
      // Update local state to reflect the change
      setTickets(prev => prev.map(t => 
        t.id === ticketId ? { ...t, status: newStatus as any, updated_at: new Date().toISOString() } : t
      ))
      
      toast.success('Ticket status updated successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update status'
      toast.error('Failed to update status', {
        description: errorMessage
      })
    }
  }

  const filteredTickets = tickets.filter(ticket => {
    if (statusFilter !== 'all' && ticket.status !== statusFilter) return false
    if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false
    
    if (activeTab === 'urgent') return ticket.priority === 'urgent'
    if (activeTab === 'at_risk') {
      const sla = getSLAStatus(ticket)
      return sla.status === 'at_risk' || sla.status === 'breached'
    }
    if (activeTab === 'my_tickets') return ticket.assigned_to === adminEmail
    
    return true
  })

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading support tickets...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Unable to load support tickets</h3>
              <p className="text-muted-foreground mt-1">{error}</p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
              className="mt-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* SLA Metrics Overview */}
      {slaMetrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
              <Headphones className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{slaMetrics.total_tickets}</div>
              <p className="text-xs text-muted-foreground">
                {tickets.filter(t => t.status === 'open').length} open
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Within SLA</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{slaMetrics.within_sla}</div>
              <p className="text-xs text-muted-foreground">
                On track
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">At Risk</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{slaMetrics.at_risk}</div>
              <p className="text-xs text-muted-foreground">
                Need attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Breached</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{slaMetrics.breached_sla}</div>
              <p className="text-xs text-muted-foreground">
                Overdue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SLA Rate</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{slaMetrics.sla_compliance_rate}%</div>
              <p className="text-xs text-muted-foreground">
                Avg {slaMetrics.avg_resolution_time}h
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ticket Management Interface */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Support Tickets</CardTitle>
              <CardDescription>
                Manage customer support requests and track SLA compliance
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="waiting_customer">Waiting</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All Tickets</TabsTrigger>
              <TabsTrigger value="urgent">
                Urgent
                {tickets.filter(t => t.priority === 'urgent').length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {tickets.filter(t => t.priority === 'urgent').length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="at_risk">
                At Risk
                {tickets.filter(t => {
                  const sla = getSLAStatus(t)
                  return sla.status === 'at_risk' || sla.status === 'breached'
                }).length > 0 && (
                  <Badge variant="outline" className="ml-2 border-orange-500 text-orange-700">
                    {tickets.filter(t => {
                      const sla = getSLAStatus(t)
                      return sla.status === 'at_risk' || sla.status === 'breached'
                    }).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="my_tickets">My Tickets</TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => {
                      const sla = getSLAStatus(ticket)
                      
                      return (
                        <TableRow key={ticket.id}>
                          <TableCell>
                            <div>
                              <div className="font-mono text-sm">{ticket.ticket_number}</div>
                              <div className="text-sm font-medium mt-1">{ticket.subject}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <MessageSquare className="h-3 w-3" />
                                {ticket.message_count} messages
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{ticket.user_name}</div>
                              <div className="text-sm text-muted-foreground">{ticket.user_email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                              {getPriorityIcon(ticket.priority)}
                              {ticket.priority}
                            </div>
                          </TableCell>
                          <TableCell>
                            {canManageTickets ? (
                              <Select 
                                value={ticket.status} 
                                onValueChange={(value) => handleStatusChange(ticket.id, value)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Open</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="waiting_customer">Waiting</SelectItem>
                                  <SelectItem value="resolved">Resolved</SelectItem>
                                  <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{ticket.status.replace('_', ' ')}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className={`text-sm font-medium ${sla.color}`}>
                              {sla.label}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewTicket(ticket)}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={showTicketDialog} onOpenChange={setShowTicketDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTicket?.ticket_number} - {selectedTicket?.subject}
            </DialogTitle>
            <DialogDescription>
              Created {selectedTicket && formatDistanceToNow(new Date(selectedTicket.created_at), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              {/* Ticket Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer</Label>
                  <div className="mt-1">
                    <div className="font-medium">{selectedTicket.user_name}</div>
                    <div className="text-sm text-muted-foreground">{selectedTicket.user_email}</div>
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <div className="mt-1">
                    <Badge variant="outline">{selectedTicket.category.replace('_', ' ')}</Badge>
                  </div>
                </div>
                <div>
                  <Label>Priority</Label>
                  <div className="mt-1">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${PRIORITY_COLORS[selectedTicket.priority]}`}>
                      {getPriorityIcon(selectedTicket.priority)}
                      {selectedTicket.priority}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>SLA Status</Label>
                  <div className="mt-1">
                    <div className={`text-sm font-medium ${getSLAStatus(selectedTicket).color}`}>
                      {getSLAStatus(selectedTicket).label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div>
                <Label>Conversation</Label>
                <div className="mt-2 space-y-3">
                  {ticketMessages.map((message) => (
                    <div 
                      key={message.id} 
                      className={`p-3 rounded-lg ${
                        message.is_internal 
                          ? 'bg-yellow-50 border border-yellow-200' 
                          : message.sender_email === selectedTicket.user_email
                          ? 'bg-gray-50'
                          : 'bg-blue-50'
                      }`}
                    >
                      {message.is_internal && (
                        <Badge variant="outline" className="mb-2 border-yellow-500 text-yellow-700">
                          Internal Note
                        </Badge>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-sm">
                          {message.sender_name || message.sender_email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="text-sm">{message.body}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reply Form */}
              {canManageTickets && (
                <div className="border-t pt-4">
                  <Label>Reply</Label>
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply..."
                    className="mt-2"
                    rows={4}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="internal-note"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="internal-note" className="text-sm">
                        Internal note (not visible to customer)
                      </Label>
                    </div>
                    <Button
                      onClick={handleSendReply}
                      disabled={!replyMessage.trim() || sendingReply}
                    >
                      {sendingReply ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      {isInternalNote ? 'Add Note' : 'Send Reply'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}