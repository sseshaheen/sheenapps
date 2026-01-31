'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collaboratorKeys } from '@/lib/query-keys'

export type CollaboratorRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface Collaborator {
  id: string
  project_id: string
  user_id: string | null
  email: string
  role: CollaboratorRole
  status: 'pending' | 'accepted' | 'declined'
  invited_at: string
  accepted_at: string | null
  invited_by: string
  // User info when accepted
  user_name?: string | null
  user_avatar?: string | null
}

interface CollaboratorsResponse {
  ok: boolean
  data: {
    collaborators: Collaborator[]
  }
}

interface InviteResponse {
  ok: boolean
  data: Collaborator
}

interface UpdateResponse {
  ok: boolean
  data: Collaborator
}

async function fetchCollaborators(projectId: string): Promise<Collaborator[]> {
  const res = await fetch(
    `/api/projects/${projectId}/collaborators?_t=${Date.now()}`,
    { cache: 'no-store', credentials: 'include' }
  )
  if (!res.ok) throw new Error(`Failed to fetch collaborators: ${res.status}`)
  const data: CollaboratorsResponse = await res.json()
  if (!data.ok) throw new Error('Failed to fetch collaborators')
  return data.data.collaborators
}

/**
 * Hook to fetch and manage project collaborators
 */
export function useCollaborators(projectId: string, enabled = true) {
  return useQuery({
    queryKey: collaboratorKeys.list(projectId),
    queryFn: () => fetchCollaborators(projectId),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}

/**
 * Hook to invite a new collaborator
 */
export function useInviteCollaborator(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { email: string; role: 'admin' | 'editor' | 'viewer' }) => {
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      })
      const data: InviteResponse = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error((data as any).error || 'Failed to invite collaborator')
      }
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collaboratorKeys.list(projectId) })
    },
  })
}

/**
 * Hook to update a collaborator's role
 */
export function useUpdateCollaboratorRole(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { collaboratorId: string; role: 'admin' | 'editor' | 'viewer' }) => {
      const res = await fetch(
        `/api/projects/${projectId}/collaborators/${params.collaboratorId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ role: params.role }),
        }
      )
      const data: UpdateResponse = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error((data as any).error || 'Failed to update collaborator')
      }
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collaboratorKeys.list(projectId) })
    },
  })
}

/**
 * Hook to remove a collaborator
 */
export function useRemoveCollaborator(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collaboratorId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/collaborators/${collaboratorId}`,
        { method: 'DELETE', credentials: 'include' }
      )
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove collaborator')
      }
      return { ok: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collaboratorKeys.list(projectId) })
    },
  })
}
