'use client'

import { useEffect, useState } from 'react'
import { useRouter, Link } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { DashboardLayout } from './dashboard-layout'
import { ProjectGrid } from './project-grid'
import { DashboardHeader } from './dashboard-header'
import { LoadingSpinner } from '@/components/ui/loading'
import { useProjectsQuery, useProjectMutations } from '@/hooks/use-projects-query'
import { useFilteredProjects } from '@/hooks/use-filtered-projects'
import { useDashboardState, DashboardStateProvider } from './dashboard-state-context'
import { CreateProjectDialog } from './create-project-dialog'
import { AuthDebug } from '@/components/debug/auth-debug'
import { ROUTES } from '@/i18n/routes'
import { useQueryClient } from '@tanstack/react-query'
import { silenceAuthToasts } from '@/lib/nav-silencer'
import { ReferralCTA } from '@/components/referral/referral-cta'
import { useReferralAttribution } from '@/hooks/use-referral-attribution'
import { useNPSOnLogin } from '@/hooks/useNPSTrigger'
import { NPSSurvey } from '@/components/feedback'

interface DashboardContentProps {
  translations: any
  locale: string
}

// Inner component that uses the dashboard state (will be inside the provider)
function DashboardInner({ translations, locale, user }: { translations: any; locale: string; user: any }) {
  // ✅ EXPERT FIX: ALL HOOKS FIRST - NO EARLY RETURNS BEFORE ALL HOOKS ARE CALLED
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuthStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // ✅ E2E READINESS: Monotonic + error-aware data-ready state
  // Expert pattern from PLAYWRIGHT_TEST_ANALYSIS.md
  const [readyState, setReadyState] = useState<'loading' | 'ready' | 'error'>('loading')

  // ✅ REFERRAL ATTRIBUTION: Track referral attribution for new users
  useReferralAttribution()

  // ✅ NPS TRIGGER: Check if user is eligible for NPS survey (30+ days active)
  // Per FEEDBACK-INTEGRATION-PLAN.md - triggered on login for returning users
  const { shouldShowNPS, dismiss: dismissNPS } = useNPSOnLogin({
    minDaysActive: 30,
    disabled: false,
  })

  // ✅ FIXED: Use same auth store as useProjectsQuery
  const { isAuthenticated: authIsAuthenticated, user: authUser, isLoading: authIsLoading } = useAuthStore()
  
  // ✅ EXPERT FIX: Call useDashboardState unconditionally
  const {
    searchQuery,
    filterBy,
    sortBy,
    viewMode,
    setSearchQuery,
    setFilterBy,
    setSortBy,
    setViewMode
  } = useDashboardState()

  // ✅ EXPERT FIX: Always call useProjectsQuery - it handles enabled internally
  const { 
    data: projects, 
    isLoading: projectsLoading, 
    error: projectsError 
  } = useProjectsQuery(authUser?.id, {
    enabled: Boolean(authUser?.id && authIsAuthenticated),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })

  // ✅ EXPERT FIX: Call useProjectMutations unconditionally
  const {
    createProject,
    updateProject,
    duplicateProject
  } = useProjectMutations(user?.id)
  
  // ✅ EXPERT FIX: Call useFilteredProjects unconditionally
  const filteredProjects = useFilteredProjects(projects)

  // ✅ EXPERT FIX: All other hooks before this point
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // ✅ E2E READINESS: Update data-ready state (monotonic + error-first)
  // Expert pattern: check error FIRST, then check ready
  // Once state is 'ready' or 'error', don't regress to 'loading'
  useEffect(() => {
    if (readyState !== 'loading') return // Monotonic: don't regress

    // Error takes priority - check first
    if (projectsError) {
      setReadyState('error')
      return
    }

    // Ready when: hydrated + not loading + has data (even if empty array)
    if (isHydrated && !projectsLoading && !authIsLoading && projects !== undefined) {
      setReadyState('ready')
    }
  }, [isHydrated, projectsLoading, projectsError, authIsLoading, projects, readyState])

  console.log('🔍 Dashboard auth state:', { 
    authIsAuthenticated, 
    authIsLoading,
    isAuthenticated, 
    hasUser: !!user,
    authUser: !!authUser
  })

  // ✅ NOW safe to have early returns - all hooks called above
  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-muted-foreground">{translations.dashboard?.loading || 'Loading...'}</p>
      </div>
    )
  }

  if (authIsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-muted-foreground">{translations.dashboard?.loading || 'Loading...'}</p>
      </div>
    )
  }
  

  // Handle project actions with optimistic updates
  const handleProjectAction = async (action: string, projectId: string, data?: any) => {
    try {
      console.log('📱 Dashboard: Project action', { action, projectId })
      
      switch (action) {
        case 'rename':
          if (!data?.name || !data.name.trim()) {
            return
          }
          await updateProject.mutateAsync({ id: projectId, name: data.name.trim() })
          break
        case 'duplicate':
          await duplicateProject.mutateAsync(projectId)
          break
        case 'archive':
          const project = projects?.find(p => p.id === projectId)
          if (!project) {
            console.error('Project not found:', projectId)
            return
          }
          
          const archiveDate = new Date().toISOString()
          console.log('📦 Archiving project:', {
            projectId: projectId.slice(0, 8),
            archiveDate,
            projectName: project.name
          })
          
          // Archive the project using the archived_at column
          const result = await updateProject.mutateAsync({ 
            id: projectId, 
            archived_at: archiveDate 
          })
          
          console.log('📦 Archive result:', {
            success: !!result,
            archivedAt: result?.archived_at,
            projectId: result?.id?.slice(0, 8)
          })
          break
        case 'restore':
          // Remove archive status by setting archived_at to null
          const restoreProject = projects?.find(p => p.id === projectId)
          if (!restoreProject) {
            console.error('Project not found for restore:', projectId)
            return
          }
          
          console.log('🔄 Restoring project:', {
            projectId: projectId.slice(0, 8),
            projectName: restoreProject.name
          })
          
          const restoreResult = await updateProject.mutateAsync({ 
            id: projectId, 
            archived_at: null 
          })
          
          console.log('🔄 Restore result:', {
            success: !!restoreResult,
            archivedAt: restoreResult?.archived_at,
            projectId: restoreResult?.id?.slice(0, 8)
          })
          break
        case 'open': {
          // ✅ EXPERT FIX: Prevent background 401s during transition
          silenceAuthToasts(2000);

          // ✅ EXPERT FIX: Pause any auth polling (if available)
          try { 
            const { pausePolling } = useAuthStore.getState() as any;
            pausePolling?.(2500); 
          } catch {}

          // ✅ EXPERT FIX: Cancel in-flight queries likely to refetch
          await Promise.all([
            queryClient.cancelQueries({ queryKey: ['projects'] }),
            queryClient.cancelQueries({ predicate: q => String(q.queryKey[0]).includes('auth') })
          ]);

          // ✅ EXPERT FIX: Navigate using locale-aware helper
          router.push(ROUTES.BUILDER_WORKSPACE(projectId));
          break;
        }
        case 'create':
          // Open create dialog
          setShowCreateDialog(true)
          break
        default:
          console.warn('Unknown project action', { action })
      }
    } catch (error) {
      console.error('Project action failed', error)
      // Error handling is now done in ProjectCard with toast notifications
      throw error // Re-throw to let ProjectCard handle the error
    }
  }

  return (
    <div
      className="space-y-6"
      data-testid="dashboard-root"
      data-ready={readyState === 'loading' ? undefined : readyState}
    >
      <DashboardHeader
        translations={translations}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        filterBy={filterBy}
        onFilterChange={setFilterBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreateProject={() => router.push(ROUTES.BUILDER_NEW)}
        projectCount={filteredProjects.length}
      />
      
      {/* ✅ REFERRAL CTA: Show SheenApps Friends program invitation */}
      {user && (
        <ReferralCTA className="mb-6" />
      )}
      
      <ProjectGrid
        translations={translations}
        locale={locale}
        projects={filteredProjects}
        isLoading={projectsLoading}
        error={(() => {
          // ✅ EXPERT FIX: Only show non-auth errors
          const isAuthError = (projectsError as any)?.code === 'NO_USER' || (projectsError as any)?.status === 401
          return isAuthError ? null : projectsError?.message || null
        })()}
        viewMode={viewMode}
        onProjectAction={handleProjectAction}
        searchQuery={searchQuery}
        filterBy={filterBy}
        onClearFilters={() => {
          setSearchQuery('')
          setFilterBy('all')
        }}
      />

      {/* Create Project Dialog */}
      <CreateProjectDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreateProject={(data) => createProject.mutateAsync({ ...data, config: (data as any).config || {} })}
        locale={locale}
        templateTranslations={translations.builder?.templates}
      />

      {/* NPS Survey - shown to users who have been active for 30+ days */}
      {shouldShowNPS && (
        <NPSSurvey
          onDismiss={dismissNPS}
          position="bottom"
        />
      )}
    </div>
  )
}

// Main component that handles auth
export function DashboardContent({ translations, locale }: DashboardContentProps) {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuthStore()
  
  // Auth state tracking (removed console log for production)

  // AGGRESSIVE AUTH REDIRECT (middleware broken, server redirects not working)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log('🚪 AGGRESSIVE REDIRECT: User not authenticated, redirecting immediately')
      // Use locale-aware navigation instead of hardcoded paths
      router.push(`${ROUTES.AUTH_LOGIN}?redirect=${encodeURIComponent('/dashboard')}&reason=auth_required`)
      return
    }
  }, [authLoading, isAuthenticated, router])

  // Original redirect logic (kept as fallback)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      // Check if we're coming from login/signup to prevent redirect loop
      const referrer = document.referrer
      const isFromAuth = referrer.includes('/auth/login') || referrer.includes('/auth/signup')
      const currentPath = window.location.pathname
      
      console.log('🔐 Dashboard Auth Check:', {
        authLoading,
        isAuthenticated,
        isFromAuth,
        referrer,
        currentPath,
        hasUser: !!user
      })
      
      // Prevent redirect if already on auth pages
      if (currentPath.includes('/auth/')) {
        console.log('🚫 Already on auth page, skipping redirect')
        return
      }
      
      // Check for unverified email scenario
      const isUnverified = sessionStorage.getItem('auth_pending_verification') === 'true'
      if (isUnverified) {
        console.log('📧 User has pending email verification')
        // Clear the flag after checking
        sessionStorage.removeItem('auth_pending_verification')
        // Redirect to a verification reminder page instead of login
        router.push(`/auth/verify-email?email=${encodeURIComponent(sessionStorage.getItem('auth_email') || '')}`)
        return
      }
      
      // Give auth state a moment to sync if coming from auth pages
      if (isFromAuth) {
        console.log('⏳ Coming from auth page, waiting for auth sync...')
        setTimeout(() => {
          // Re-check auth state after delay
          const { isAuthenticated: isAuthNow } = useAuthStore.getState()
          console.log('🔄 Re-checking auth after delay:', { isAuthNow })
          
          if (!isAuthNow) {
            console.log('🚪 Still not authenticated, redirecting to login')
            router.push(`/auth/login?redirect=${encodeURIComponent('/dashboard')}`)
          }
        }, 1000)
      } else {
        // Not from login, redirect immediately using router as backup
        console.log('🚪 Not authenticated, redirecting to login (router fallback)')
        router.push(`/auth/login?redirect=${encodeURIComponent('/dashboard')}`)
      }
    }
  }, [authLoading, isAuthenticated, locale, router])

  // Render based on auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-muted-foreground">{translations.dashboard?.loading || 'Loading...'}</p>
      </div>
    )
  }

  if (isAuthenticated && user) {
    return (
      <DashboardLayout translations={translations} locale={locale}>
        <DashboardStateProvider>
          <DashboardInner translations={translations} locale={locale} user={user} />
        </DashboardStateProvider>
      </DashboardLayout>
    )
  }

  // Not authenticated - show redirecting message with debug info
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-gray-600">Redirecting to login...</p>
        {/* Debug info - remove in production */}
        <div className="mt-4 text-xs text-gray-400">
          <p>Auth Loading: {String(authLoading)}</p>
          <p>Is Authenticated: {String(isAuthenticated)}</p>
          <p>Has User: {String(!!user)}</p>
        </div>
        {/* Emergency escape hatch */}
        <div className="mt-6">
          <Link 
            href="/" 
            className="text-sm text-blue-600 hover:underline"
          >
            Go to Home Page
          </Link>
        </div>
      </div>
      {/* Add debug component in development */}
      {/* eslint-disable-next-line no-restricted-globals */}
      {process.env.NODE_ENV === 'development' && (
        <>
        {typeof window !== 'undefined' && (
          <AuthDebug />
        )}</>
      )}
    </div>
  )
}
