'use client'

import { LoadingSpinner } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/routing'
import { ROUTES } from '@/i18n/routes'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store'
import { useProjectsQuery } from '@/hooks/use-projects-query'

interface MinimalDashboardProps {
  translations: any
  locale: string
}

export function MinimalDashboardContent({ translations, locale }: MinimalDashboardProps) {
  // TEST: Add back useAuthStore to see if it causes infinite loop
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const userId = user?.id

  // TEST: Now that we fixed authStatusSelector, try useProjectsQuery again
  const { data: projects, isLoading: projectsLoading, error: projectsError } = useProjectsQuery(userId, {
    enabled: Boolean(userId),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })

  // Show auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading auth...</p>
        </div>
      </div>
    )
  }
  
  // Show login prompt if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
          <p className="text-gray-600 mb-4">Please sign in to continue</p>
          <Link href="/auth/login">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }
  
  const filteredProjects = projects?.filter(project => 
    !searchQuery || project.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Ultra-minimal header - NO DROPDOWNS */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Dashboard Test - FIXED useProjectsQuery
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                Welcome {user?.email} • {projectsLoading ? 'Loading...' : `${filteredProjects.length} projects`}
              </p>
            </div>
            
            <Link href={ROUTES.BUILDER_NEW}>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0" size="sm">
                Create Project
              </Button>
            </Link>
          </div>

          {/* Simple search only - no dropdowns */}
          <div className="relative w-full max-w-md">
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>

        {/* Projects List - REAL DATA FROM useProjectsQuery */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Real Projects from useProjectsQuery</h2>
          
          {projectsLoading && (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="lg" />
              <span className="ml-2">Loading projects...</span>
            </div>
          )}

          {projectsError && (
            <div className="text-red-600 py-4">
              Error loading projects: {projectsError}
            </div>
          )}
          
          {!projectsLoading && filteredProjects.length > 0 ? (
            <div className="space-y-4">
              {filteredProjects.map((project) => (
                <div key={project.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{project.name}</h3>
                      <p className="text-sm text-gray-500">
                        Updated: {new Date(project.updated_at).toLocaleDateString()}
                        {project.archived_at && (
                          <span className="text-orange-600 ml-2">(Archived)</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 text-sm border rounded hover:bg-gray-100">
                        Open Project
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : !projectsLoading && (
            <div className="text-center py-8 text-gray-500">
              <p>No projects found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
