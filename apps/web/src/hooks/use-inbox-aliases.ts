'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export function useAddInboxAlias(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alias: string) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/inbox/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias }),
      })
      if (!res.ok) throw new Error(`Failed to add alias: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to add alias')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.inboxConfig(projectId) })
    },
  })
}

export function useRemoveInboxAlias(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alias: string) => {
      const res = await fetch(
        `/api/inhouse/projects/${projectId}/inbox/aliases/${encodeURIComponent(alias)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error(`Failed to remove alias: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to remove alias')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.inboxConfig(projectId) })
    },
  })
}
