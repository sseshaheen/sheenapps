/**
 * Pending Approvals Queue Component
 * Displays and manages all pending two-person approval requests
 */

'use client'

import { useState } from 'react'
import { useAdminApprovals, type PendingApproval } from '@/hooks/use-admin-approvals'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminReasonModal } from './AdminReasonModal'
import { 
  Clock, 
  AlertTriangle, 
  DollarSign, 
  User,
  CheckCircle,
  XCircle,
  RefreshCw,
  Info
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface PendingApprovalsQueueProps {
  adminId: string
  adminRole: 'admin' | 'super_admin'
}

export function PendingApprovalsQueue({ adminId, adminRole }: PendingApprovalsQueueProps) {
  // React Query handles all the fetching, retry logic, and auth integration
  const { 
    data: approvals = [], 
    isLoading: loading, 
    error,
    refetch 
  } = useAdminApprovals()

  // Modal and processing state
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null)
  const [modalAction, setModalAction] = useState<'approve' | 'reject' | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // No need for manual fetching - React Query handles everything!

  const handleApprove = (approval: PendingApproval) => {
    setSelectedApproval(approval)
    setModalAction('approve')
    setIsModalOpen(true)
  }

  const handleReject = (approval: PendingApproval) => {
    setSelectedApproval(approval)
    setModalAction('reject')
    setIsModalOpen(true)
  }

  const handleModalConfirm = async (reason: string) => {
    if (!selectedApproval || !modalAction) return

    setProcessingId(selectedApproval.id)
    setIsModalOpen(false)

    try {
      const response = await fetch(`/api/admin/approvals/${selectedApproval.id}/${modalAction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${modalAction} approval`)
      }

      toast.success(
        modalAction === 'approve' ? 'Approval granted' : 'Request rejected',
        {
          description: `${selectedApproval.action} has been ${modalAction}d successfully`
        }
      )

      // Refetch approvals to get updated list
      refetch()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Operation failed'
      toast.error(`Failed to ${modalAction} request`, {
        description: errorMessage
      })
    } finally {
      setProcessingId(null)
      setSelectedApproval(null)
      setModalAction(null)
    }
  }

  const getActionIcon = (action: string) => {
    if (action.includes('refund')) return <DollarSign className="h-4 w-4" />
    if (action.includes('user')) return <User className="h-4 w-4" />
    return <Info className="h-4 w-4" />
  }

  const getUrgencyBadge = (hours: number) => {
    if (hours > 24) return <Badge variant="destructive">Critical</Badge>
    if (hours > 6) return <Badge variant="destructive">Urgent</Badge>
    if (hours > 2) return <Badge variant="outline" className="border-orange-500 text-orange-700">High</Badge>
    return <Badge variant="secondary">Normal</Badge>
  }

  const getTimeUntilExpiry = (expiresAt: string) => {
    const expiryTime = new Date(expiresAt).getTime()
    const now = Date.now()
    const hoursLeft = Math.max(0, (expiryTime - now) / (1000 * 60 * 60))
    return Math.floor(hoursLeft)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading pending approvals...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isServiceUnavailable = errorMessage.includes('503') || 
                                errorMessage.includes('service is currently unavailable')
    
    return (
      <Card>
        <CardContent className="p-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {isServiceUnavailable ? (
                <div className="space-y-2">
                  <div className="font-medium">Admin Approvals Service Unavailable</div>
                  <div className="text-sm">
                    The approvals service is temporarily offline. This may be due to:
                  </div>
                  <ul className="text-sm list-disc list-inside ml-4 space-y-1">
                    <li>Worker service maintenance</li>
                    <li>Network connectivity issues</li>
                    <li>Service restart in progress</li>
                  </ul>
                  <div className="text-sm">
                    Please try again in a few minutes or contact support if this persists.
                  </div>
                </div>
              ) : (
                errorMessage
              )}
            </AlertDescription>
          </Alert>
          <div className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
            {isServiceUnavailable && (
              <Button 
                variant="ghost" 
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (approvals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            No Pending Approvals
          </CardTitle>
          <CardDescription>
            All high-value operations have been reviewed. Check back later for new requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pending Approval Requests</CardTitle>
              <CardDescription>
                {approvals.length} request{approvals.length !== 1 ? 's' : ''} requiring your review
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Expires In</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => {
                  const expiryHours = getTimeUntilExpiry(approval.expires_at)
                  const isProcessing = processingId === approval.id

                  return (
                    <TableRow key={approval.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getActionIcon(approval.action)}
                          <span>{approval.action.replace('.', ' ').replace('_', ' ')}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {approval.payload.amount && (
                            <div className="font-semibold">
                              ${approval.payload.amount.toLocaleString()}
                            </div>
                          )}
                          <div className="text-sm text-muted-foreground">
                            {approval.payload.reason}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ID: {approval.resource_id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{approval.requested_by}</div>
                          <div className="text-xs text-muted-foreground">
                            {approval.requested_by_email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={expiryHours < 6 ? 'text-red-600 font-medium' : ''}>
                          {expiryHours}h
                        </div>
                      </TableCell>
                      <TableCell>
                        {getUrgencyBadge(approval.age_hours)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApprove(approval)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(approval)}
                            disabled={isProcessing}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Admin Reason Modal */}
      {selectedApproval && modalAction && (
        <AdminReasonModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedApproval(null)
            setModalAction(null)
          }}
          onConfirm={handleModalConfirm}
          category="financial"
          title={modalAction === 'approve' ? 'Approve Request' : 'Reject Request'}
          description={`You are about to ${modalAction} a ${selectedApproval.action} request${
            selectedApproval.payload.amount 
              ? ` for $${selectedApproval.payload.amount.toLocaleString()}` 
              : ''
          }. Please provide a reason for this action.`}
          actionLabel={modalAction === 'approve' ? 'Approve' : 'Reject'}
          isProcessing={processingId === selectedApproval.id}
        />
      )}
    </>
  )
}