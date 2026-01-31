'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Icon from '@/components/ui/icon'
import { copyToClipboard } from '@/lib/utils/clipboard'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { getInhouseApiBaseUrl } from '@/utils/api-utils'
import { logger } from '@/utils/logger'

// Session storage key prefix
const SESSION_STORAGE_PREFIX = 'sa_inhouse_session_'

interface AuthUser {
  id: string
  email: string
  created_at?: string
}

interface AuthSession {
  token: string
  user: AuthUser
  expiresAt?: string
}

interface AuthKitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  publicKey: string
  translations: {
    title: string
    description: string
    tabs: {
      signUp: string
      signIn: string
      magicLink: string
    }
    actions: {
      copy: string
      copied: string
    }
    notes: {
      apiKey: string
      session: string
      magicLink: string
    }
    preview: {
      title: string
      description: string
      emailLabel: string
      passwordLabel: string
      submitSignUp: string
      submitSignIn: string
      submitMagicLink: string
      sessionTokenLabel: string
      submitSessionCheck: string
      responseLabel: string
      warning: string
      copyResponse: string
      clearResponse: string
      requestSucceeded?: string
      showDevDetails?: string
      hideDevDetails?: string
    }
    // New translations for session UI (optional, with defaults)
    session?: {
      loggedInAs?: string
      signOut?: string
      signingOut?: string
      notLoggedIn?: string
      sessionRestored?: string
      sessionExpired?: string
    }
  }
}

export function AuthKitDialog({
  open,
  onOpenChange,
  publicKey,
  translations
}: AuthKitDialogProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [previewEmail, setPreviewEmail] = useState('')
  const [previewPassword, setPreviewPassword] = useState('')
  const [previewSessionToken, setPreviewSessionToken] = useState('')
  const [previewResponse, setPreviewResponse] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [responseCopied, setResponseCopied] = useState(false)
  const [showDevDetails, setShowDevDetails] = useState(false)

  // Session management state
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)

  const responseRef = useRef<HTMLDivElement | null>(null)
  const { success, error } = useToast()
  const apiKey = publicKey || 'YOUR_PUBLIC_KEY'
  const authBaseUrl = getInhouseApiBaseUrl()

  // Session translation defaults
  const sessionTranslations = useMemo(() => ({
    loggedInAs: translations.session?.loggedInAs ?? 'Logged in as',
    signOut: translations.session?.signOut ?? 'Sign out',
    signingOut: translations.session?.signingOut ?? 'Signing out...',
    notLoggedIn: translations.session?.notLoggedIn ?? 'Not logged in',
    sessionRestored: translations.session?.sessionRestored ?? 'Session restored',
    sessionExpired: translations.session?.sessionExpired ?? 'Session expired',
  }), [translations.session])

  // Get storage key for this project
  const getStorageKey = useCallback(() => {
    return `${SESSION_STORAGE_PREFIX}${publicKey.slice(0, 16)}`
  }, [publicKey])

  // Save session to localStorage
  const saveSession = useCallback((session: AuthSession) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(session))
    } catch (error) {
      logger.warn('Failed to save session to localStorage', { error })
    }
  }, [getStorageKey])

  // Load session from localStorage
  const loadSession = useCallback((): AuthSession | null => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(getStorageKey())
      if (!stored) return null
      return JSON.parse(stored) as AuthSession
    } catch (error) {
      logger.warn('Failed to load session from localStorage', { error })
      return null
    }
  }, [getStorageKey])

  // Clear session from localStorage
  const clearSession = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(getStorageKey())
    } catch (error) {
      logger.warn('Failed to clear session from localStorage', { error })
    }
  }, [getStorageKey])

  // Verify session with backend
  const verifySession = useCallback(async (token: string): Promise<AuthUser | null> => {
    try {
      const response = await fetch(`${authBaseUrl}/v1/inhouse/auth/user`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await response.json()
      if (!result.ok || !result.data?.user) {
        return null
      }
      return result.data.user as AuthUser
    } catch (error) {
      logger.warn('Failed to verify session', { error })
      return null
    }
  }, [authBaseUrl, apiKey])

  // Sign out
  const handleSignOut = useCallback(async () => {
    if (!currentSession?.token) return

    setSessionLoading(true)
    try {
      await fetch(`${authBaseUrl}/v1/inhouse/auth/sign-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Authorization': `Bearer ${currentSession.token}`
        }
      })

      clearSession()
      setCurrentSession(null)
      setPreviewSessionToken('')
      success('Signed out successfully')
    } catch (err) {
      logger.warn('Failed to sign out', { error: err })
      error('Failed to sign out')
    } finally {
      setSessionLoading(false)
    }
  }, [currentSession, authBaseUrl, apiKey, clearSession, success, error])

  // Restore session on mount / when dialog opens
  useEffect(() => {
    if (!open || sessionChecked) return

    const restoreSession = async () => {
      const stored = loadSession()
      if (!stored?.token) {
        setSessionChecked(true)
        return
      }

      setSessionLoading(true)
      const user = await verifySession(stored.token)

      if (user) {
        setCurrentSession({ ...stored, user })
        setPreviewSessionToken(stored.token)
        success(sessionTranslations.sessionRestored)
      } else {
        // Session expired, clear it
        clearSession()
        error(sessionTranslations.sessionExpired)
      }

      setSessionLoading(false)
      setSessionChecked(true)
    }

    restoreSession()
  }, [open, sessionChecked, loadSession, verifySession, clearSession, success, error, sessionTranslations])

  // Reset sessionChecked when publicKey changes (different project)
  useEffect(() => {
    setSessionChecked(false)
    setCurrentSession(null)
    setPreviewSessionToken('')
  }, [publicKey])

  useEffect(() => {
    if (!responseRef.current) return
    responseRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [previewResponse, previewError])

  const signUpSnippet = `import { useState } from 'react'

export function SignUpForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const response = await fetch('${authBaseUrl}/v1/inhouse/auth/sign-up', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '${apiKey}'
      },
      body: JSON.stringify({ email, password })
    })

    const result = await response.json()
    if (!result.ok) throw new Error(result.error?.message || 'Sign up failed')
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
      <button type="submit">Create account</button>
    </form>
  )
}`

  const signInSnippet = `import { useState } from 'react'

export function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const response = await fetch('${authBaseUrl}/v1/inhouse/auth/sign-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '${apiKey}'
      },
      body: JSON.stringify({ email, password })
    })

    const result = await response.json()
    if (!result.ok) throw new Error(result.error?.message || 'Sign in failed')

    // Store session token
    localStorage.setItem('sa_session', result.data.session.token)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
      <button type="submit">Sign in</button>
    </form>
  )
}`

  const magicLinkSnippet = `import { useState } from 'react'

export function MagicLinkForm() {
  const [email, setEmail] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const response = await fetch('${authBaseUrl}/v1/inhouse/auth/magic-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '${apiKey}'
      },
      body: JSON.stringify({ email })
    })

    const result = await response.json()
    if (!result.ok) throw new Error(result.error?.message || 'Magic link failed')

    // Send the token to your email provider
    console.log('Magic link token:', result.data.token)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <button type="submit">Send magic link</button>
    </form>
  )
}`

  const snippets: Record<string, string> = {
    signUp: signUpSnippet,
    signIn: signInSnippet,
    magicLink: magicLinkSnippet
  }

  const handleCopy = async (key: keyof typeof snippets) => {
    try {
      await copyToClipboard(snippets[key])
      setCopied(key)
      success(translations.actions.copied)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      error('Copy failed')
    }
  }

  const runPreview = async (action: 'signUp' | 'signIn' | 'magicLink' | 'session') => {
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewResponse(null)

    try {
      const endpoint = action === 'signUp'
        ? '/v1/inhouse/auth/sign-up'
        : action === 'signIn'
          ? '/v1/inhouse/auth/sign-in'
          : action === 'magicLink'
            ? '/v1/inhouse/auth/magic-link'
            : '/v1/inhouse/auth/user'

      const body = action === 'magicLink'
        ? { email: previewEmail }
        : action === 'session'
          ? null
          : { email: previewEmail, password: previewPassword }

      const response = await fetch(`${authBaseUrl}${endpoint}`, {
        method: action === 'session' ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          ...(action === 'session' && previewSessionToken
            ? { 'Authorization': `Bearer ${previewSessionToken}` }
            : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })

      const result = await response.json()
      if (!result.ok) {
        throw new Error(result.error?.message || 'Request failed')
      }

      // Handle successful sign-in: save session
      if (action === 'signIn' && result.data?.session?.token && result.data?.user) {
        const session: AuthSession = {
          token: result.data.session.token,
          user: result.data.user,
          expiresAt: result.data.session.expires_at
        }
        saveSession(session)
        setCurrentSession(session)
        setPreviewSessionToken(result.data.session.token)
      }

      // Handle successful sign-up: auto sign-in if session returned
      if (action === 'signUp' && result.data?.user) {
        // Sign-up doesn't return session, but let's pre-fill email for sign-in
        success('Account created! You can now sign in.')
      }

      setPreviewResponse(JSON.stringify(result.data, null, 2))
      if (action !== 'signUp') {
        success('Preview request succeeded')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      setPreviewError(message)
      error(message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleCopyResponse = async () => {
    if (!previewResponse) return
    try {
      await copyToClipboard(previewResponse)
      setResponseCopied(true)
      success(translations.actions.copied)
      setTimeout(() => setResponseCopied(false), 2000)
    } catch {
      error('Copy failed')
    }
  }

  const handleClearResponse = () => {
    setPreviewResponse(null)
    setPreviewError(null)
  }

  const renderPreviewResponse = () => {
    if (!previewResponse && !previewError) return null
    return (
      <div className="space-y-2" ref={responseRef}>
        {/* Success/Error indicator */}
        {previewError ? (
          <div className="text-xs text-destructive">{previewError}</div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <Icon name="check-circle" className="w-3 h-3" />
            <span>{translations.preview.requestSucceeded ?? 'Request succeeded'}</span>
          </div>
        )}

        {/* Developer details toggle - hides JSON response for non-tech users */}
        {previewResponse && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowDevDetails(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name={showDevDetails ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" />
              {showDevDetails
                ? (translations.preview.hideDevDetails ?? 'Hide developer details')
                : (translations.preview.showDevDetails ?? 'Show developer details')}
            </button>

            {showDevDetails && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{translations.preview.responseLabel}</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={handleClearResponse}>
                      {translations.preview.clearResponse}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCopyResponse} disabled={!previewResponse}>
                      <Icon name={responseCopied ? 'check' : 'copy'} className="w-3 h-3 me-1" />
                      {translations.preview.copyResponse}
                    </Button>
                  </div>
                </div>
                <pre className="text-[11px] bg-background/80 border rounded-md p-2 overflow-x-auto">
                  <code>{previewResponse}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderSnippet = (key: keyof typeof snippets, note: string) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{note}</div>
        <Button size="sm" variant="outline" onClick={() => handleCopy(key)}>
          <Icon name={copied === key ? 'check' : 'copy'} className={cn('w-3 h-3 me-1', copied === key && 'text-success')} />
          <span className="text-xs">{copied === key ? translations.actions.copied : translations.actions.copy}</span>
        </Button>
      </div>
      <pre className="text-xs bg-muted/40 border rounded-md p-3 overflow-x-auto">
        <code>{snippets[key]}</code>
      </pre>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{translations.title}</DialogTitle>
          <DialogDescription>{translations.description}</DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertDescription>{translations.notes.apiKey}</AlertDescription>
        </Alert>

        {/* Current Session Status Bar */}
        <div className={cn(
          "flex items-center justify-between rounded-md border p-3 mt-4",
          currentSession ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" : "bg-muted/30"
        )}>
          {sessionLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="loader-2" className="w-4 h-4 animate-spin" />
              <span>Loading session...</span>
            </div>
          ) : currentSession ? (
            <>
              <div className="flex items-center gap-2">
                <Icon name="user-check" className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm">
                  <span className="text-muted-foreground">{sessionTranslations.loggedInAs}</span>{' '}
                  <span className="font-medium">{currentSession.user.email}</span>
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSignOut}
                disabled={sessionLoading}
                className="text-xs"
              >
                <Icon name="log-out" className="w-3 h-3 me-1" />
                {sessionLoading ? sessionTranslations.signingOut : sessionTranslations.signOut}
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="user-x" className="w-4 h-4" />
              <span>{sessionTranslations.notLoggedIn}</span>
            </div>
          )}
        </div>

        <Tabs defaultValue="signUp" className="mt-4">
          <TabsList>
            <TabsTrigger value="signUp">{translations.tabs.signUp}</TabsTrigger>
            <TabsTrigger value="signIn">{translations.tabs.signIn}</TabsTrigger>
            <TabsTrigger value="magicLink">{translations.tabs.magicLink}</TabsTrigger>
          </TabsList>

          <TabsContent value="signUp" className="mt-4 space-y-4">
            {renderSnippet('signUp', translations.notes.session)}
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
              <div className="text-xs font-semibold text-foreground">{translations.preview.title}</div>
              <p className="text-xs text-muted-foreground">{translations.preview.description}</p>
              <Alert>
                <AlertDescription>{translations.preview.warning}</AlertDescription>
              </Alert>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{translations.preview.emailLabel}</label>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={previewEmail}
                    onChange={(e) => setPreviewEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{translations.preview.passwordLabel}</label>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    type="password"
                    value={previewPassword}
                    onChange={(e) => setPreviewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <Button size="sm" onClick={() => runPreview('signUp')} disabled={previewLoading}>
                {translations.preview.submitSignUp}
              </Button>
              {renderPreviewResponse()}
            </div>
          </TabsContent>
          <TabsContent value="signIn" className="mt-4 space-y-4">
            {renderSnippet('signIn', translations.notes.session)}
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
              <div className="text-xs font-semibold text-foreground">{translations.preview.title}</div>
              <p className="text-xs text-muted-foreground">{translations.preview.description}</p>
              <Alert>
                <AlertDescription>{translations.preview.warning}</AlertDescription>
              </Alert>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{translations.preview.emailLabel}</label>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={previewEmail}
                    onChange={(e) => setPreviewEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{translations.preview.passwordLabel}</label>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    type="password"
                    value={previewPassword}
                    onChange={(e) => setPreviewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <Button size="sm" onClick={() => runPreview('signIn')} disabled={previewLoading}>
                {translations.preview.submitSignIn}
              </Button>
              {renderPreviewResponse()}
            </div>
          </TabsContent>
          <TabsContent value="magicLink" className="mt-4 space-y-4">
            {renderSnippet('magicLink', translations.notes.magicLink)}
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
              <div className="text-xs font-semibold text-foreground">{translations.preview.title}</div>
              <p className="text-xs text-muted-foreground">{translations.preview.description}</p>
              <Alert>
                <AlertDescription>{translations.preview.warning}</AlertDescription>
              </Alert>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{translations.preview.emailLabel}</label>
                <input
                  className="w-full border rounded-md px-2 py-1 text-sm"
                  value={previewEmail}
                  onChange={(e) => setPreviewEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button size="sm" onClick={() => runPreview('magicLink')} disabled={previewLoading}>
                {translations.preview.submitMagicLink}
              </Button>
              {renderPreviewResponse()}
            </div>
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-3">
              <div className="text-xs font-semibold text-foreground">{translations.preview.sessionTokenLabel}</div>
              <input
                className="w-full border rounded-md px-2 py-1 text-sm"
                value={previewSessionToken}
                onChange={(e) => setPreviewSessionToken(e.target.value)}
                placeholder="session token"
              />
              <Button size="sm" onClick={() => runPreview('session')} disabled={previewLoading || !previewSessionToken}>
                {translations.preview.submitSessionCheck}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
