'use client'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface InboxMessage {
  id: string
  projectId: string
  from: string
  to: string
  subject: string
  textBody?: string
  htmlBody?: string
  snippet?: string
  isRead: boolean
  isArchived: boolean
  threadId?: string
  attachmentCount: number
  receivedAt: string
  createdAt: string
}

interface MessagesResponse {
  messages: InboxMessage[]
  total: number
}

export interface MessagesFilters {
  limit?: number
  offset?: number
  unreadOnly?: string
}

async function fetchMessages(projectId: string, filters: MessagesFilters = {}) {
  const params = new URLSearchParams({ _t: String(Date.now()) })
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.offset) params.set('offset', String(filters.offset))
  if (filters.unreadOnly) params.set('unreadOnly', filters.unreadOnly)

  const res = await fetch(
    `/api/inhouse/projects/${projectId}/inbox/messages?${params}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch messages')
  return data.data as MessagesResponse
}

export function useInboxMessages(projectId: string, filters: MessagesFilters = {}, enabled = true) {
  return useQuery({
    queryKey: emailKeys.inboxMessages(projectId, filters),
    queryFn: () => fetchMessages(projectId, filters),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useUpdateMessage(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, updates }: { messageId: string; updates: Record<string, any> }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/inbox/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error(`Failed to update message: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to update message')
      return data.data
    },
    onMutate: async ({ messageId, updates }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.inboxMessages(projectId) })
      const queries = queryClient.getQueriesData<MessagesResponse>({
        queryKey: emailKeys.inboxMessages(projectId),
      })
      const snapshots = queries.map(([key, data]) => [key, data] as const)
      for (const [key, data] of queries) {
        if (!data?.messages) continue
        queryClient.setQueryData(key, {
          ...data,
          messages: data.messages.map((m) =>
            m.id === messageId ? { ...m, ...updates } : m
          ),
        })
      }
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.inboxMessages(projectId) })
    },
  })
}

export function useDeleteMessage(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/inbox/messages/${messageId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to delete message: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to delete message')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.inboxMessages(projectId) })
    },
  })
}
