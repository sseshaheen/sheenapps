/**
 * User Management Interface Component
 * Comprehensive user search, filtering, and management actions
 */

'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format, formatDistanceToNow } from 'date-fns'
import debounce from 'lodash/debounce'
import {
  Activity,
  AlertTriangle,
  Ban,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Mail,
  MoreVertical,
  RefreshCw,
  Search,
  Settings,
  UserCheck,
  UserX
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AdminReasonModal } from './AdminReasonModal'

interface User {
  id: string
  email: string
  full_name: string | null
  status: 'active' | 'suspended' | 'banned'
  banned_until: string | null
  subscription_status: 'active' | 'inactive' | 'trialing' | 'past_due'
  created_at: string
  last_sign_in_at: string | null
  metadata: {
    total_projects?: number
    total_builds?: number
    last_activity?: string
  }
}

interface UserSearchParams {
  search?: string
  status?: string
  subscription_status?: string
  limit: number
  page: number
}

interface UserManagementInterfaceProps {
  adminId: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

export function UserManagementInterface({ adminId, adminRole, permissions }: UserManagementInterfaceProps) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [actionType, setActionType] = useState<'suspend' | 'ban' | 'activate' | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [processingUserId, setProcessingUserId] = useState<string | null>(null)

  const limit = 20
  const totalPages = Math.ceil(totalUsers / limit)

  // Check permissions
  const canSuspendUsers = permissions.includes('users.write') || adminRole === 'super_admin'
  const canBanUsers = permissions.includes('users.ban') || adminRole === 'super_admin'
  const canActivateUsers = permissions.includes('users.write') || adminRole === 'super_admin'

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce((term: string) => {
      setCurrentPage(1)
      fetchUsers({ search: term })
    }, 500),
    []
  )

  // Fetch users function
  const fetchUsers = async (overrides?: Partial<UserSearchParams>) => {
    setLoading(true)
    setError(null)

    const params: UserSearchParams = {
      search: searchTerm,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      subscription_status: subscriptionFilter !== 'all' ? subscriptionFilter : undefined,
      limit,
      page: currentPage,
      ...overrides
    }

    try {
      const queryParams = new URLSearchParams()
      if (params.search) queryParams.append('search', params.search)
      if (params.status) queryParams.append('status', params.status)
      if (params.subscription_status) queryParams.append('subscription_status', params.subscription_status)
      queryParams.append('limit', params.limit.toString())
      queryParams.append('page', params.page.toString())
      queryParams.append('exclude_admin_users', 'true')
      queryParams.append('exclude_advisor_users', 'true')

      const response = await fetch(`/api/admin/users?${queryParams}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch users')
      }

      setUsers(data.users || [])
      setTotalUsers(data.pagination?.total || data.total || 0)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error'
      setError(errorMessage)
      toast.error('Failed to load users', {
        description: errorMessage
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [statusFilter, subscriptionFilter, currentPage])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value
    setSearchTerm(term)
    debouncedSearch(term)
  }

  const handleUserAction = (user: User, action: 'suspend' | 'ban' | 'activate') => {
    setSelectedUser(user)
    setActionType(action)
    setIsModalOpen(true)
  }

  const handleActionConfirm = async (reason: string) => {
    if (!selectedUser || !actionType) return

    setProcessingUserId(selectedUser.id)
    setIsModalOpen(false)

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': reason
        },
        body: JSON.stringify({
          action: actionType,
          duration: actionType === 'suspend' ? 'P30D' : undefined, // 30 days for suspension
          reason
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${actionType} user`)
      }

      toast.success(
        actionType === 'activate' ? 'User activated' : `User ${actionType}ed`,
        {
          description: `${selectedUser.email} has been ${actionType}d successfully`
        }
      )

      // Refresh the user list
      await fetchUsers()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Operation failed'
      toast.error(`Failed to ${actionType} user`, {
        description: errorMessage
      })
    } finally {
      setProcessingUserId(null)
      setSelectedUser(null)
      setActionType(null)
    }
  }

  const getUserStatusBadge = (user: User) => {
    if (user.status === 'active') {
      return <Badge variant="default" className="bg-green-500">Active</Badge>
    }
    if (user.status === 'suspended') {
      return (
        <Badge variant="outline" className="border-orange-500 text-orange-700">
          Suspended
          {user.banned_until && (
            <span className="ml-1 text-xs">
              until {format(new Date(user.banned_until), 'MMM d')}
            </span>
          )}
        </Badge>
      )
    }
    if (user.status === 'banned') {
      return <Badge variant="destructive">Banned</Badge>
    }
    return null
  }

  const getSubscriptionBadge = (status: string | null | undefined) => {
    if (!status) {
      return (
        <Badge variant="outline">
          No subscription
        </Badge>
      )
    }
    const variants: Record<string, string> = {
      active: 'default',
      trialing: 'secondary',
      past_due: 'destructive',
      inactive: 'outline'
    }
    return (
      <Badge variant={variants[status] as any || 'outline'}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  if (loading && users.length === 0) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading users...
          </div>
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
              <CardTitle>User Accounts</CardTitle>
              <CardDescription>
                {totalUsers} total user{totalUsers !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUsers()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="md:col-span-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Search by email or name..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="subscription">Subscription</Label>
              <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
                <SelectTrigger id="subscription">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subscriptions</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isProcessing = processingUserId === user.id

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{user.full_name || 'No name'}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getUserStatusBadge(user)}
                      </TableCell>
                      <TableCell>
                        {getSubscriptionBadge(user.subscription_status)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            {user.metadata?.total_projects || 0} projects
                          </div>
                          {user.last_sign_in_at && (
                            <div className="text-xs text-muted-foreground">
                              Last seen {formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : 'Unknown'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.status === 'active' && (canSuspendUsers || canBanUsers) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={isProcessing}
                                  className="h-8 w-8 p-0"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">User actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  className="text-muted-foreground"
                                  disabled
                                >
                                  <Settings className="h-3 w-3 mr-2" />
                                  Account Actions
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {canSuspendUsers && (
                                  <DropdownMenuItem
                                    onClick={() => handleUserAction(user, 'suspend')}
                                    className="text-amber-600 focus:text-amber-700 focus:bg-amber-50"
                                  >
                                    <UserX className="h-3 w-3 mr-2" />
                                    Suspend Account
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      Temporary
                                    </span>
                                  </DropdownMenuItem>
                                )}
                                {canBanUsers && (
                                  <DropdownMenuItem
                                    onClick={() => handleUserAction(user, 'ban')}
                                    className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                  >
                                    <Ban className="h-3 w-3 mr-2" />
                                    Ban Account
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      Permanent
                                    </span>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {(user.status === 'suspended' || user.status === 'banned') && canActivateUsers && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUserAction(user, 'activate')}
                              disabled={isProcessing}
                              className="text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50"
                            >
                              <UserCheck className="h-3 w-3 mr-1" />
                              Reactivate
                            </Button>
                          )}
                          {isProcessing && (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {users.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              No users found matching your criteria
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * limit) + 1}-{Math.min(currentPage * limit, totalUsers)} of {totalUsers} users
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page
                    if (totalPages <= 5) {
                      page = i + 1
                    } else if (currentPage <= 3) {
                      page = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i
                    } else {
                      page = currentPage - 2 + i
                    }

                    return (
                      <Button
                        key={page}
                        variant={page === currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="w-9"
                      >
                        {page}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Reason Modal */}
      {selectedUser && actionType && (
        <AdminReasonModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedUser(null)
            setActionType(null)
          }}
          onConfirm={handleActionConfirm}
          category="trust_safety"
          title={`${actionType.charAt(0).toUpperCase() + actionType.slice(1)} User`}
          description={`You are about to ${actionType} the user account for ${selectedUser.email}. Please provide a reason for this action.`}
          actionLabel={actionType.charAt(0).toUpperCase() + actionType.slice(1)}
          isProcessing={processingUserId === selectedUser.id}
        />
      )}
    </>
  )
}
