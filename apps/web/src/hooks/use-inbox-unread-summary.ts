'use client'

import { useQuery } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

/**
 * Fetches unread inbox counts across all projects owned by the user.
 * Returns a map of { [projectId]: unreadCount }.
 * Used for dashboard project card badges.
 */
async function fetchUnreadSummary() {
  const res = await fetch(
    `/api/inhouse/inbox/unread-summary?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch unread summary: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch unread summary')
  return data.data as Record<string, number>
}

export function useInboxUnreadSummary(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: emailKeys.unreadSummary(userId || ''),
    queryFn: fetchUnreadSummary,
    enabled: !!userId && enabled,
    staleTime: 60_000, // 1 minute — dashboard doesn't need instant updates
  })
}
