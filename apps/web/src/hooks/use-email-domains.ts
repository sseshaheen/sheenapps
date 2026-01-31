'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface EmailDomain {
  id: string
  projectId: string
  domain: string
  authorityLevel: string
  status: string
  dnsStatus?: Record<string, { status: string; value?: string }>
  sendingReady: boolean
  cloudflareZoneId?: string
  mailboxMode?: string
  createdAt: string
  updatedAt: string
}

async function fetchEmailDomains(projectId: string) {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/email-domains?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch email domains: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch email domains')
  return data.data as { domains: EmailDomain[] }
}

async function fetchEmailDomain(projectId: string, domainId: string) {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/email-domains/${domainId}?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch email domain: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch email domain')
  return data.data as EmailDomain
}

export function useEmailDomains(projectId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.emailDomains(projectId),
    queryFn: () => fetchEmailDomains(projectId),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}

export function useEmailDomain(projectId: string, domainId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.emailDomain(projectId, domainId),
    queryFn: () => fetchEmailDomain(projectId, domainId),
    enabled: !!projectId && !!domainId && enabled,
    staleTime: 30_000,
  })
}

export function useEmailDomainStatus(projectId: string, domainId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.emailDomainStatus(projectId, domainId),
    queryFn: async () => {
      const res = await fetch(
        `/api/inhouse/projects/${projectId}/email-domains/${domainId}/status?_t=${Date.now()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error(`Failed to fetch domain status: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch domain status')
      return data.data
    },
    enabled: !!projectId && !!domainId && enabled,
    staleTime: 10_000, // Shorter stale time for status polling
  })
}

export function useAddEmailDomain(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { domain: string; authorityLevel: string }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/email-domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Failed to add email domain: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to add email domain')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomains(projectId) })
    },
  })
}

export function useDeleteEmailDomain(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (domainId: string) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/email-domains/${domainId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to delete email domain: ${res.status}`)
      if (res.status === 204) return { ok: true }
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to delete email domain')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomains(projectId) })
    },
  })
}

export function useChangeAuthorityLevel(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domainId, newAuthorityLevel }: { domainId: string; newAuthorityLevel: string }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/email-domains/${domainId}/authority-level`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newAuthorityLevel }),
      })
      if (!res.ok) throw new Error(`Failed to change authority level: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to change authority level')
      return data.data
    },
    onSuccess: (_data, { domainId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomain(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomainStatus(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomains(projectId) })
    },
  })
}

export function useSetCloudflareToken(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domainId, token }: { domainId: string; token: string }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/email-domains/${domainId}/cloudflare-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: token }),
      })
      if (!res.ok) throw new Error(`Failed to set Cloudflare token: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to set Cloudflare token')
      return data.data
    },
    onSuccess: (_data, { domainId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomain(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomainStatus(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomains(projectId) })
    },
  })
}

export function useVerifyEmailDomain(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (domainId: string) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/email-domains/${domainId}/verify`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Failed to verify domain: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to verify domain')
      return data.data
    },
    onSuccess: (_data, domainId) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomain(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomainStatus(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomains(projectId) })
    },
  })
}

export function useToggleDomainMailboxes(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domainId, enable }: { domainId: string; enable: boolean }) => {
      const action = enable ? 'enable' : 'disable'
      const res = await fetch(
        `/api/inhouse/projects/${projectId}/email-domains/${domainId}/mailboxes/${action}`,
        { method: 'POST' }
      )
      if (!res.ok) throw new Error(`Failed to ${action} mailboxes: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || `Failed to ${action} mailboxes`)
      return data.data
    },
    onSuccess: (_data, { domainId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomains(projectId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.emailDomain(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.domainMailboxes(projectId, domainId) })
    },
  })
}
