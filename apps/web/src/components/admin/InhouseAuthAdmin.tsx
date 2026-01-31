/**
 * In-House Auth Admin Dashboard
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
import { RefreshCw, ShieldOff, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface AuthUserRow {
  id: string
  project_id: string
  email: string
  email_verified: boolean
  provider: string
  last_sign_in: string | null
  created_at: string
}

interface AuthSessionRow {
  id: string
  project_id: string
  user_id: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
  ip_address: string | null
  user_agent: string | null
}

export function InhouseAuthAdmin() {
  const [projectIdFilter, setProjectIdFilter] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [users, setUsers] = useState<AuthUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(true)

  const [sessionsProjectId, setSessionsProjectId] = useState('')
  const [sessionsUserId, setSessionsUserId] = useState('')
  const [sessions, setSessions] = useState<AuthSessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  const usersAbortRef = useRef<AbortController | null>(null)
  const sessionsAbortRef = useRef<AbortController | null>(null)

  const fetchUsers = useCallback(async () => {
    usersAbortRef.current?.abort()
    const controller = new AbortController()
    usersAbortRef.current = controller

    setUsersLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectIdFilter) params.set('projectId', projectIdFilter)
      if (userSearch) params.set('search', userSearch)

      const response = await fetch(`/api/admin/inhouse/auth/users?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch users')

      const data = await response.json()
      setUsers(data.data?.users || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch users:', error)
        toast.error('Failed to load auth users')
      }
    } finally {
      setUsersLoading(false)
    }
  }, [projectIdFilter, userSearch])

  const fetchSessions = useCallback(async () => {
    sessionsAbortRef.current?.abort()
    const controller = new AbortController()
    sessionsAbortRef.current = controller

    setSessionsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (sessionsProjectId) params.set('projectId', sessionsProjectId)
      if (sessionsUserId) params.set('userId', sessionsUserId)

      const response = await fetch(`/api/admin/inhouse/auth/sessions?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch sessions')

      const data = await response.json()
      setSessions(data.data?.sessions || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch sessions:', error)
        toast.error('Failed to load auth sessions')
      }
    } finally {
      setSessionsLoading(false)
    }
  }, [sessionsProjectId, sessionsUserId])

  useEffect(() => {
    fetchUsers()
    return () => usersAbortRef.current?.abort()
  }, [fetchUsers])

  useEffect(() => {
    fetchSessions()
    return () => sessionsAbortRef.current?.abort()
  }, [fetchSessions])

  const handleForceLogout = async (userId: string, projectId: string) => {
    const reason = window.prompt('Reason for forced logout (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/auth/users/${userId}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, reason }),
      })
      if (!response.ok) throw new Error('Failed to force logout')
      toast.success('User sessions revoked')
      fetchSessions()
    } catch (error) {
      console.error('Failed to force logout:', error)
      toast.error('Failed to force logout')
    }
  }

  const handleForceReset = async (userId: string, projectId: string) => {
    const reason = window.prompt('Reason for forcing password reset (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/auth/users/${userId}/force-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, reason }),
      })
      if (!response.ok) throw new Error('Failed to force reset')
      toast.success('Password reset enforced')
      fetchUsers()
    } catch (error) {
      console.error('Failed to force reset:', error)
      toast.error('Failed to force reset')
    }
  }

  const renderDate = (value: string | null) => {
    if (!value) return '—'
    return format(new Date(value), 'PPp')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Auth Users</CardTitle>
          <CardDescription>Search and manage users in In‑House Auth</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (optional)"
            value={projectIdFilter}
            onChange={(e) => setProjectIdFilter(e.target.value)}
            className="w-[260px]"
          />
          <Input
            placeholder="Search email or user ID"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-[260px]"
          />
          <Button variant="outline" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
        <CardContent>
          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-sm text-muted-foreground">No users found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.email}</div>
                      <div className="text-xs text-muted-foreground">{user.id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">{user.project_id}</div>
                    </TableCell>
                    <TableCell>{user.provider}</TableCell>
                    <TableCell>
                      <Badge variant={user.email_verified ? 'default' : 'secondary'}>
                        {user.email_verified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </TableCell>
                    <TableCell>{renderDate(user.last_sign_in)}</TableCell>
                    <TableCell>{renderDate(user.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleForceLogout(user.id, user.project_id)}
                        >
                          <ShieldOff className="h-4 w-4 mr-2" />
                          Force logout
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleForceReset(user.id, user.project_id)}
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          Force reset
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auth Sessions</CardTitle>
          <CardDescription>Active and historical sessions with filters</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (optional)"
            value={sessionsProjectId}
            onChange={(e) => setSessionsProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Input
            placeholder="User ID (optional)"
            value={sessionsUserId}
            onChange={(e) => setSessionsUserId(e.target.value)}
            className="w-[260px]"
          />
          <Button variant="outline" onClick={fetchSessions}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sessions found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="font-medium">{session.id}</div>
                      <div className="text-xs text-muted-foreground">{session.ip_address || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{session.user_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">{session.project_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={session.revoked_at ? 'secondary' : 'default'}>
                        {session.revoked_at ? 'Revoked' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell>{renderDate(session.last_used_at)}</TableCell>
                    <TableCell>{renderDate(session.expires_at)}</TableCell>
                    <TableCell>{renderDate(session.created_at)}</TableCell>
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
