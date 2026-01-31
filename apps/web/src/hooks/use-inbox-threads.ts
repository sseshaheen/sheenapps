'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface InboxThread {
  id: string
  projectId: string
  subject: string
  participants: string[]
  messageCount: number
  unreadCount: number
  lastActivityAt: string
  createdAt: string
}

interface ThreadsResponse {
  threads: InboxThread[]
  total: number
}

export interface ThreadsFilters {
  limit?: number
  offset?: number
  unreadOnly?: string
}

interface ThreadDetail {
  thread: InboxThread
  messages: Array<{
    id: string
    from: string
    to: string
    subject: string
    textBody?: string
    htmlBody?: string
    receivedAt: string
    isRead: boolean
    attachmentCount: number
  }>
}

async function fetchThreads(projectId: string, filters: ThreadsFilters = {}) {
  const params = new URLSearchParams({ _t: String(Date.now()) })
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.offset) params.set('offset', String(filters.offset))
  if (filters.unreadOnly) params.set('unreadOnly', filters.unreadOnly)

  const res = await fetch(
    `/api/inhouse/projects/${projectId}/inbox/threads?${params}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch threads')
  return data.data as ThreadsResponse
}

async function fetchThread(projectId: string, threadId: string) {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/inbox/threads/${threadId}?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch thread')
  return data.data as ThreadDetail
}

export function useInboxThreads(projectId: string, filters: ThreadsFilters = {}, enabled = true) {
  return useQuery({
    queryKey: emailKeys.inboxThreads(projectId, filters),
    queryFn: () => fetchThreads(projectId, filters),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useInboxThread(projectId: string, threadId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.inboxThread(projectId, threadId),
    queryFn: () => fetchThread(projectId, threadId),
    enabled: !!projectId && !!threadId && enabled,
    staleTime: 30_000,
  })
}
