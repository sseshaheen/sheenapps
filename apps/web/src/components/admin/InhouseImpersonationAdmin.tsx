/**
 * In-House Impersonation Admin
 *
 * Allows admins to view a project as the owner would see it (READ-ONLY).
 *
 * Security Model:
 * 1. Two-step friction with typed confirmation
 * 2. Route allowlist (only specific GET endpoints)
 * 3. Hard 30-minute TTL, no extensions
 * 4. Full audit trail
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  User,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Lock,
  Loader2,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface ActiveSession {
  active: boolean
  projectId?: string
  projectName?: string
  expiresAt?: string
  remainingSeconds?: number
  allowedRoutes?: string[]
}

interface StartImpersonationResult {
  confirmationToken: string
  expiresIn: number
  projectName: string
  projectSlug: string
  ownerEmail: string
}

interface ConfirmImpersonationResult {
  sessionToken: string
  expiresAt: string
  allowedRoutes: string[]
  projectId: string
  projectName: string
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseImpersonationAdmin() {
  // State
  const [projectId, setProjectId] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)

  // Active session state
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  // Confirmation dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<StartImpersonationResult | null>(null)
  const [typedConfirmation, setTypedConfirmation] = useState('')
  const [confirmationToken, setConfirmationToken] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Allowed routes state
  const [allowedRoutes, setAllowedRoutes] = useState<string[]>([])
  const [showAllowedRoutes, setShowAllowedRoutes] = useState(false)

  // Fetch active session on mount
  const fetchSession = useCallback(async () => {
    setSessionLoading(true)
    try {
      const response = await fetch('/api/admin/inhouse/support/impersonate/session')
      if (response.ok) {
        const data = await response.json()
        setActiveSession(data)
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSession()

    // Fetch allowed routes
    const fetchAllowedRoutes = async () => {
      try {
        const response = await fetch('/api/admin/inhouse/support/impersonate/allowed-routes')
        if (response.ok) {
          const data = await response.json()
          setAllowedRoutes(data.routes || [])
        }
      } catch (error) {
        console.error('Failed to fetch allowed routes:', error)
      }
    }
    fetchAllowedRoutes()
  }, [fetchSession])

  // Refresh session periodically when active
  useEffect(() => {
    if (activeSession?.active) {
      const interval = setInterval(fetchSession, 10000) // Every 10 seconds
      return () => clearInterval(interval)
    }
  }, [activeSession?.active, fetchSession])

  // Start impersonation
  const handleStartImpersonation = async () => {
    if (!projectId.trim()) {
      toast.error('Project ID is required')
      return
    }
    if (!reason.trim() || reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/inhouse/support/impersonate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId.trim(), reason: reason.trim() }),
      })

      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to start impersonation')
        return
      }

      // Show confirmation dialog
      setPendingConfirmation(data)
      setConfirmationToken(data.confirmationToken)
      setConfirmDialogOpen(true)
      setTypedConfirmation('')
    } catch (error) {
      toast.error('Failed to start impersonation')
    } finally {
      setLoading(false)
    }
  }

  // Confirm impersonation
  const handleConfirmImpersonation = async () => {
    if (!typedConfirmation.trim()) {
      toast.error('Please type the confirmation phrase')
      return
    }

    setConfirmLoading(true)
    try {
      const response = await fetch('/api/admin/inhouse/support/impersonate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationToken,
          typedConfirmation: typedConfirmation.trim(),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to confirm impersonation')
        return
      }

      // Store session token
      setSessionToken(data.sessionToken)
      setConfirmDialogOpen(false)
      setPendingConfirmation(null)
      setProjectId('')
      setReason('')

      // Refresh session
      await fetchSession()

      toast.success(`Impersonation session started for ${data.projectName}`)
    } catch (error) {
      toast.error('Failed to confirm impersonation')
    } finally {
      setConfirmLoading(false)
    }
  }

  // End impersonation
  const handleEndSession = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/inhouse/support/impersonate/end', {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Failed to end session')
        return
      }

      setSessionToken(null)
      setActiveSession({ active: false })
      toast.success('Impersonation session ended')
    } catch (error) {
      toast.error('Failed to end session')
    } finally {
      setLoading(false)
    }
  }

  // Copy session token
  const copySessionToken = () => {
    if (sessionToken) {
      navigator.clipboard.writeText(sessionToken)
      toast.success('Session token copied to clipboard')
    }
  }

  // Format remaining time
  const formatRemainingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  // Expected confirmation phrase
  const expectedPhrase = pendingConfirmation
    ? `IMPERSONATE ${pendingConfirmation.projectSlug}`
    : ''

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Project Impersonation</h2>
            <p className="text-muted-foreground">
              View a project as the owner would see it (read-only)
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAllowedRoutes(!showAllowedRoutes)}
          >
            {showAllowedRoutes ? 'Hide' : 'Show'} Allowed Routes
          </Button>
        </div>

        {/* Security Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Read-Only Access</AlertTitle>
          <AlertDescription>
            Impersonation provides read-only access to specific routes only. All actions are
            fully audited. Sessions automatically expire after 30 minutes.
          </AlertDescription>
        </Alert>

        {/* Allowed Routes */}
        {showAllowedRoutes && allowedRoutes.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Allowed Routes During Impersonation</CardTitle>
              <CardDescription>
                Only these GET endpoints can be accessed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-mono">
                {allowedRoutes.map((route, index) => (
                  <div key={index} className="p-2 bg-muted rounded">
                    {route}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Session Loading */}
        {sessionLoading ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking for active session...
              </div>
            </CardContent>
          </Card>
        ) : activeSession?.active ? (
          /* Active Session Card */
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-yellow-500" />
                  <CardTitle>Active Impersonation Session</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                  <Clock className="h-3 w-3 mr-1" />
                  {activeSession.remainingSeconds !== undefined
                    ? formatRemainingTime(activeSession.remainingSeconds)
                    : 'Active'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Project</div>
                  <div className="font-medium">{activeSession.projectName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Project ID</div>
                  <div className="font-mono text-sm">{activeSession.projectId}</div>
                </div>
              </div>

              {sessionToken && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Session Token</div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      value={sessionToken}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" onClick={copySessionToken}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy token for API requests</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use this token in the X-Impersonation-Token header for proxy requests
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleEndSession}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                  End Session
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Start Impersonation Card */
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5" />
                <CardTitle>Start Impersonation</CardTitle>
              </div>
              <CardDescription>
                Enter the project ID and a reason for impersonation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Project ID</label>
                <Input
                  placeholder="Enter project UUID"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Reason for Access</label>
                <Textarea
                  placeholder="Describe why you need to access this project (minimum 10 characters)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This reason will be recorded in the audit log
                </p>
              </div>

              <Button
                onClick={handleStartImpersonation}
                disabled={loading || !projectId.trim() || reason.trim().length < 10}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                Start Impersonation
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Confirm Impersonation
              </DialogTitle>
              <DialogDescription>
                You are about to impersonate a user&apos;s project. This action is logged and audited.
              </DialogDescription>
            </DialogHeader>

            {pendingConfirmation && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Project</span>
                    <span className="font-medium">{pendingConfirmation.projectName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Owner</span>
                    <span className="font-medium">{pendingConfirmation.ownerEmail}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expires In</span>
                    <span className="font-medium">{pendingConfirmation.expiresIn} seconds</span>
                  </div>
                </div>

                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Type exactly: <span className="font-mono font-bold">{expectedPhrase}</span>
                  </AlertDescription>
                </Alert>

                <Input
                  placeholder="Type confirmation phrase..."
                  value={typedConfirmation}
                  onChange={(e) => setTypedConfirmation(e.target.value)}
                  className="font-mono"
                  autoComplete="off"
                />

                {typedConfirmation.toUpperCase().trim() === expectedPhrase.toUpperCase() && (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    Confirmation phrase matches
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmDialogOpen(false)
                  setPendingConfirmation(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImpersonation}
                disabled={
                  confirmLoading ||
                  typedConfirmation.toUpperCase().trim() !== expectedPhrase.toUpperCase()
                }
              >
                {confirmLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Confirm & Start
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
