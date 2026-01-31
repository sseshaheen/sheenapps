'use client'

import { useQuery } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface EmailOverviewData {
  inbox: {
    address: string | null
    total: number
    unread: number
  }
  domains: {
    total: number
    verified: number
  }
  mailboxes: {
    total: number
  }
  outbound: {
    sentThisMonth: number
  }
}

async function fetchEmailOverview(projectId: string): Promise<EmailOverviewData> {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/email/overview?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch email overview: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch email overview')
  return data.data as EmailOverviewData
}

export function useEmailOverview(projectId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.emailOverview(projectId),
    queryFn: () => fetchEmailOverview(projectId),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}
