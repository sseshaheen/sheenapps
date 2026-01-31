'use client'

import { useQuery } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface SentEmail {
  id: string
  projectId: string
  to: string
  subject: string
  status: string
  sentAt: string
  deliveredAt?: string
  bouncedAt?: string
}

interface EmailHistoryResponse {
  emails: SentEmail[]
  total: number
}

export interface EmailHistoryFilters {
  limit?: number
  offset?: number
}

async function fetchEmailHistory(projectId: string, filters: EmailHistoryFilters = {}) {
  const params = new URLSearchParams({ _t: String(Date.now()) })
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.offset) params.set('offset', String(filters.offset))

  const res = await fetch(
    `/api/inhouse/projects/${projectId}/email?${params}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch email history: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch email history')
  return data.data as EmailHistoryResponse
}

export function useEmailHistory(projectId: string, filters: EmailHistoryFilters = {}, enabled = true) {
  return useQuery({
    queryKey: emailKeys.emailHistory(projectId, filters),
    queryFn: () => fetchEmailHistory(projectId, filters),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}
