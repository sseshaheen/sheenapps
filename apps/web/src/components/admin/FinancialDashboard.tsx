/**
 * Financial Dashboard Component
 * Comprehensive financial operations with smart refund processing
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { AdminReasonModal } from './AdminReasonModal'
import { 
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Clock,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Users
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

interface FinancialMetrics {
  totalRevenue: number
  monthlyRevenue: number
  dailyRevenue: number
  pendingRefunds: number
  processedRefunds: number
  refundRate: number
  averageTransactionValue: number
  customerCount: number
  paymentMethods?: {
    provider: string
    percentage: number
    count?: number
  }[]
  revenueTrend?: {
    date: string
    revenue: number
  }[]
  monthlyGrowth?: number
  dailyGrowth?: number
}

interface Transaction {
  id: string
  invoice_id: string
  customer_email: string
  amount: number
  currency: string
  status: 'paid' | 'pending' | 'failed' | 'refunded' | 'partial_refund'
  created_at: string
  description: string
  refundable_amount?: number
  metadata?: {
    customer_name?: string
    subscription_id?: string
  }
}

interface RefundRequest {
  invoice_id: string
  amount: number
  reason: string
  notify_user: boolean
}

interface FinancialDashboardProps {
  adminId: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
  canProcessRefunds: boolean
}

const REFUND_THRESHOLD = 500 // Requires two-person approval above this amount

export function FinancialDashboard({ 
  adminId, 
  adminRole, 
  permissions, 
  canProcessRefunds 
}: FinancialDashboardProps) {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [notifyUser, setNotifyUser] = useState(true)
  const [processingRefund, setProcessingRefund] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch financial data from API
  useEffect(() => {
    const fetchFinancialData = async () => {
      try {
        const response = await fetch('/api/admin/finance/overview')
        if (!response.ok) {
          throw new Error(`Failed to fetch financial data: ${response.status}`)
        }
        
        const data = await response.json()
        
        // Map the API response to our component's data structure
        if (data.success) {
          // If we have real data from the API
          const mappedMetrics: FinancialMetrics = {
            totalRevenue: data.revenue?.total || 0,
            monthlyRevenue: data.revenue?.monthly || 0,
            dailyRevenue: data.revenue?.daily || 0,
            pendingRefunds: data.refunds?.pending || 0,
            processedRefunds: data.refunds?.total || 0,
            refundRate: data.churn?.rate || 0,
            averageTransactionValue: data.revenue?.total && data.transactions?.total 
              ? data.revenue.total / data.transactions.total 
              : 0,
            customerCount: data.transactions?.total || 0,
            paymentMethods: data.payment_methods, // Will be undefined if not provided by API
            revenueTrend: data.revenue_trend,
            monthlyGrowth: data.revenue?.monthly_growth,
            dailyGrowth: data.revenue?.daily_growth
          }
          
          setMetrics(mappedMetrics)
          
          // If API provides transaction data, use it; otherwise leave empty
          if (data.transactions?.recent) {
            setTransactions(data.transactions.recent)
          } else {
            setTransactions([])
          }
        } else {
          // API returned an error
          console.error('Failed to load financial data:', data.error)
          setTransactions([])
        }
      } catch (error) {
        console.error('Error fetching financial overview:', error)
        // Don't set mock data - show error state instead
        setTransactions([])
      } finally {
        setLoading(false)
      }
    }

    fetchFinancialData()
  }, [])

  const handleRefundClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setRefundAmount(transaction.refundable_amount?.toString() || '0')
    setRefundReason('')
    setNotifyUser(true)
    setIsModalOpen(true)
  }

  const handleRefundConfirm = async (reasonWithCode: string) => {
    if (!selectedTransaction) return

    setProcessingRefund(true)
    setIsModalOpen(false)

    const amount = parseFloat(refundAmount)
    const requiresApproval = amount > REFUND_THRESHOLD

    try {
      const response = await fetch('/api/admin/finance/refunds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': reasonWithCode,
          'x-correlation-id': crypto.randomUUID(),
          'idempotency-key': crypto.randomUUID()
        },
        body: JSON.stringify({
          invoice_id: selectedTransaction.invoice_id,
          amount,
          reason: refundReason || reasonWithCode,
          notify_user: notifyUser
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process refund')
      }

      if (requiresApproval && data.status === 'pending_approval') {
        toast.warning('Refund requires approval', {
          description: `This refund of $${amount.toFixed(2)} requires approval from another admin due to the high value (>${REFUND_THRESHOLD}). It has been added to the approval queue.`,
          duration: 8000
        })
      } else {
        toast.success('Refund processed', {
          description: `Successfully refunded $${amount.toFixed(2)} to ${selectedTransaction.customer_email}`,
          duration: 5000
        })

        // Update transaction status locally
        setTransactions(prev => prev.map(t => 
          t.id === selectedTransaction.id 
            ? { ...t, status: 'refunded' as const, refundable_amount: 0 }
            : t
        ))
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Operation failed'
      toast.error('Failed to process refund', {
        description: errorMessage
      })
    } finally {
      setProcessingRefund(false)
      setSelectedTransaction(null)
      setRefundAmount('')
      setRefundReason('')
    }
  }

  const getStatusBadge = (status: Transaction['status']) => {
    const variants: Record<Transaction['status'], { variant: any; label: string }> = {
      paid: { variant: 'default', label: 'Paid' },
      pending: { variant: 'secondary', label: 'Pending' },
      failed: { variant: 'destructive', label: 'Failed' },
      refunded: { variant: 'outline', label: 'Refunded' },
      partial_refund: { variant: 'outline', label: 'Partial Refund' }
    }
    const config = variants[status] || { variant: 'outline', label: status }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading financial data...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${metrics?.totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics?.monthlyGrowth !== undefined 
                    ? `${metrics.monthlyGrowth > 0 ? '+' : ''}${metrics.monthlyGrowth.toFixed(1)}% from last month`
                    : 'Growth data pending'
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${metrics?.monthlyRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  ${metrics?.dailyRevenue.toLocaleString()} today
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Refund Rate</CardTitle>
                <TrendingDown className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics?.refundRate}%</div>
                <p className="text-xs text-muted-foreground">
                  {metrics?.processedRefunds} refunds this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics?.customerCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Avg. ${metrics?.averageTransactionValue.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Refund Threshold Alert */}
          {canProcessRefunds && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Two-Person Approval Required</AlertTitle>
              <AlertDescription>
                Refunds over ${REFUND_THRESHOLD} require approval from another admin. 
                Smaller refunds are processed immediately.
              </AlertDescription>
            </Alert>
          )}

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Financial Activity</CardTitle>
              <CardDescription>
                Latest transactions and refund requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length > 0 ? (
                <div className="space-y-4">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          transaction.status === 'paid' ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          <Receipt className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">{transaction.customer_email}</div>
                          <div className="text-sm text-muted-foreground">
                            {transaction.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${transaction.amount.toFixed(2)}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(transaction.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No recent transactions to display
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                All payment transactions and their current status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length > 0 ? (
                      transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-mono text-sm">
                            {transaction.invoice_id}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {transaction.metadata?.customer_name || 'Unknown'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {transaction.customer_email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              ${transaction.amount.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {transaction.currency}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(transaction.status)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(transaction.created_at), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(transaction.created_at), 'h:mm a')}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {canProcessRefunds && 
                             transaction.status === 'paid' && 
                             (transaction.refundable_amount ?? 0) > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRefundClick(transaction)}
                                disabled={processingRefund}
                              >
                                Process Refund
                              </Button>
                            )}
                            {transaction.status === 'refunded' && (
                              <span className="text-sm text-muted-foreground">
                                Refunded
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No transaction data available yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Refund Management</CardTitle>
              <CardDescription>
                Process and track refund requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics && (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Pending Refunds</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{metrics.pendingRefunds}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Processed This Month</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{metrics.processedRefunds}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Refund Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{metrics.refundRate}%</div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Refund Policy</AlertTitle>
                <AlertDescription>
                  • Refunds under ${REFUND_THRESHOLD} are processed immediately<br />
                  • Refunds over ${REFUND_THRESHOLD} require two-person approval<br />
                  • All refunds require a detailed reason for audit compliance<br />
                  • Customers are automatically notified unless specified otherwise
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics?.revenueTrend && metrics.revenueTrend.length > 0 ? (
                  <div className="space-y-2">
                    {/* Simple bar chart representation */}
                    <div className="space-y-1">
                      {metrics.revenueTrend.slice(-7).map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="w-16 text-xs text-muted-foreground">
                            {format(new Date(item.date), 'MMM dd')}
                          </div>
                          <div className="flex-1 bg-muted rounded-sm overflow-hidden">
                            <div 
                              className="h-6 bg-primary transition-all"
                              style={{
                                width: `${(item.revenue / Math.max(...metrics.revenueTrend.map(t => t.revenue))) * 100}%`
                              }}
                            />
                          </div>
                          <div className="w-20 text-right text-sm font-medium">
                            ${item.revenue.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Revenue trend data not yet available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Distribution by provider</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics?.paymentMethods && metrics.paymentMethods.length > 0 ? (
                  <div className="space-y-4">
                    {metrics.paymentMethods.map((method, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          <span>{method.provider}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{method.percentage.toFixed(1)}%</div>
                          {method.count && (
                            <span className="text-xs text-muted-foreground">
                              ({method.count.toLocaleString()})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Payment method analytics not available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Refund Reason Modal */}
      {selectedTransaction && (
        <AdminReasonModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedTransaction(null)
          }}
          onConfirm={handleRefundConfirm}
          category="financial"
          title="Process Refund"
          description={`You are about to refund $${refundAmount} to ${selectedTransaction.customer_email}. ${
            parseFloat(refundAmount) > REFUND_THRESHOLD 
              ? 'This amount requires two-person approval.' 
              : 'This refund will be processed immediately.'
          }`}
          actionLabel="Process Refund"
          isProcessing={processingRefund}
        />
      )}
    </>
  )
}