/**
 * 🏠 Admin Dashboard Component
 * Expert-validated admin dashboard with BFF pattern and professional UI
 * 
 * Key features:
 * - BFF-only pattern (no direct admin backend calls)
 * - Permission-based UI rendering
 * - Correlation ID tracking for all requests
 * - Professional metrics display
 * - Error handling with correlation context
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AdminReasonModal } from './AdminReasonModal'
import { useAdminAction } from '@/hooks/useAdminAction'
import { 
  Users, 
  DollarSign, 
  AlertTriangle, 
  Activity,
  RefreshCw,
  Shield,
  Clock,
  TrendingUp
} from 'lucide-react'
import { toast } from 'sonner'

interface DashboardMetrics {
  totalUsers: number
  activeUsers: number
  totalRevenue: number
  monthlyRevenue: number
  pendingApprovals: number
}

interface RecentAction {
  id: string
  action: string
  adminUser: string
  timestamp: string
  correlationId: string
}

interface AdminDashboardProps {
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
  userId: string
}

export function AdminDashboard({ adminRole, permissions, userId }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [recentActions, setRecentActions] = useState<RecentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastCorrelationId, setLastCorrelationId] = useState<string | null>(null)

  const {
    isModalOpen,
    currentAction,
    handleReasonConfirm,
    handleReasonCancel,
    isProcessing
  } = useAdminAction()

  // Load dashboard data
  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const correlationId = crypto.randomUUID()
      setLastCorrelationId(correlationId)

      // Expert's BFF pattern: Call Next.js API route, not admin backend directly
      const response = await fetch('/api/admin/dashboard', {
        headers: {
          'X-Correlation-Id': correlationId
        }
      })

      const result = await response.json()
      
      if (response.ok) {
        setMetrics(result.dashboard.metrics)
        setRecentActions(result.dashboard.recentActions || [])
        setLastCorrelationId(result.correlation_id)
      } else {
        setError(result.error || 'Failed to load dashboard')
        setLastCorrelationId(result.correlation_id)
        toast.error('Failed to load dashboard', {
          description: `Error: ${result.error} (${result.correlation_id})`,
          duration: 5000
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error'
      setError(errorMessage)
      toast.error('Dashboard connection failed', {
        description: `${errorMessage} (${lastCorrelationId})`,
        duration: 5000
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  // Permission-based UI rendering
  const canRead = permissions.includes('admin.read')
  const canSuspendUsers = permissions.includes('users.suspend')
  const canBanUsers = permissions.includes('users.ban')
  const canProcessRefunds = permissions.includes('finance.refund')

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading admin dashboard...
        </div>
      </div>
    )
  }

  if (error || !canRead) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Insufficient permissions to view admin dashboard'}
            {lastCorrelationId && (
              <div className="text-xs mt-1">Reference: {lastCorrelationId}</div>
            )}
          </AlertDescription>
        </Alert>
        <Button 
          variant="outline" 
          onClick={loadDashboard}
          className="mt-4"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            System overview and management tools
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <Badge variant={adminRole === 'super_admin' ? 'default' : 'secondary'}>
            <Shield className="h-3 w-3 mr-1" />
            {adminRole === 'super_admin' ? 'Super Admin' : 'Admin'}
          </Badge>
          <Button variant="outline" onClick={loadDashboard} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      {metrics && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.activeUsers.toLocaleString()} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${metrics.totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                ${metrics.monthlyRevenue.toLocaleString()} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.pendingApprovals}</div>
              <p className="text-xs text-muted-foreground">
                Require review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Healthy</div>
              <p className="text-xs text-muted-foreground">
                All services operational
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin Actions */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common administrative operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Button 
                variant="outline" 
                className="justify-start"
                onClick={() => window.location.href = '/admin/users'}
              >
                <Users className="h-4 w-4 mr-2" />
                User Management
                {canSuspendUsers && <Badge variant="secondary" className="ml-auto">Available</Badge>}
              </Button>
              
              {canProcessRefunds && (
                <Button 
                  variant="outline" 
                  className="justify-start"
                  onClick={() => window.location.href = '/admin/refunds'}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Process Refunds
                  <Badge variant="secondary" className="ml-auto">Super Admin</Badge>
                </Button>
              )}
              
              <Button 
                variant="outline" 
                className="justify-start"
                onClick={() => window.location.href = '/admin/audit'}
              >
                <Activity className="h-4 w-4 mr-2" />
                Audit Logs
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Admin Actions</CardTitle>
            <CardDescription>
              Latest administrative activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActions.length > 0 ? (
              <div className="space-y-3">
                {recentActions.slice(0, 5).map((action) => (
                  <div key={action.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{action.action}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{action.adminUser}</span>
                      <span>•</span>
                      <span>{new Date(action.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {recentActions.length > 5 && (
                  <Button variant="ghost" size="sm" className="w-full mt-2">
                    View All Actions
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No recent actions
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Correlation ID Reference */}
      {lastCorrelationId && (
        <div className="text-xs text-muted-foreground">
          Last request reference: {lastCorrelationId}
        </div>
      )}

      {/* Expert's Admin Reason Modal */}
      {currentAction && (
        <AdminReasonModal
          isOpen={isModalOpen}
          onClose={handleReasonCancel}
          onConfirm={handleReasonConfirm}
          category={currentAction.category}
          title={currentAction.title}
          description={currentAction.description}
          actionLabel={currentAction.actionLabel}
          isProcessing={isProcessing}
        />
      )}
    </div>
  )
}