'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

interface InboxConfig {
  inboxAddress: string
  displayName?: string
  autoReplyEnabled: boolean
  autoReplyMessage?: string
  forwardTo?: string
  retentionDays?: number
  aliases: string[]
}

async function fetchInboxConfig(projectId: string) {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/inbox/config?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch inbox config: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch inbox config')
  return data.data as InboxConfig
}

export function useInboxConfig(projectId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.inboxConfig(projectId),
    queryFn: () => fetchInboxConfig(projectId),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}

export function useUpdateInboxConfig(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Partial<Omit<InboxConfig, 'inboxAddress' | 'aliases'>>) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/inbox/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error(`Failed to update inbox config: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to update inbox config')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.inboxConfig(projectId) })
    },
  })
}
