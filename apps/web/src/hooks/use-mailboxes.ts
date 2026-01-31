'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface Mailbox {
  id: string
  projectId: string
  domainId: string
  localPart: string
  email: string
  domain: string
  status: string
  quotaUsed?: number
  quotaLimit?: number
  createdAt: string
  updatedAt: string
}

async function fetchDomainMailboxes(projectId: string, domainId: string) {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/email-domains/${domainId}/mailboxes?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch mailboxes: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch mailboxes')
  return data.data as { mailboxes: Mailbox[] }
}

export function useDomainMailboxes(projectId: string, domainId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.domainMailboxes(projectId, domainId),
    queryFn: () => fetchDomainMailboxes(projectId, domainId),
    enabled: !!projectId && !!domainId && enabled,
    staleTime: 30_000,
  })
}

export function useMailbox(projectId: string, mailboxId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.mailbox(projectId, mailboxId),
    queryFn: async () => {
      const res = await fetch(
        `/api/inhouse/projects/${projectId}/mailboxes/${mailboxId}?_t=${Date.now()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error(`Failed to fetch mailbox: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch mailbox')
      return data.data as Mailbox
    },
    enabled: !!projectId && !!mailboxId && enabled,
    staleTime: 30_000,
  })
}

export function useCreateMailbox(projectId: string, domainId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { localPart: string; password: string }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/email-domains/${domainId}/mailboxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Failed to create mailbox: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to create mailbox')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.domainMailboxes(projectId, domainId) })
    },
  })
}

export function useDeleteMailbox(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mailboxId }: { mailboxId: string; domainId: string }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/mailboxes/${mailboxId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to delete mailbox: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to delete mailbox')
      return data.data
    },
    onSuccess: (_data, { domainId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.domainMailboxes(projectId, domainId) })
    },
  })
}

export interface MailboxClientConfig {
  imap?: { host: string; port: number; security: string }
  smtp?: { host: string; port: number; security: string }
  pop?: { host: string; port: number; security: string }
  webmailUrl?: string
}

export function useMailboxClientConfig(projectId: string, mailboxId: string, enabled = false) {
  return useQuery({
    queryKey: [...emailKeys.mailbox(projectId, mailboxId), 'client-config'],
    queryFn: async () => {
      const res = await fetch(
        `/api/inhouse/projects/${projectId}/mailboxes/${mailboxId}/client-config?_t=${Date.now()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error(`Failed to fetch client config: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch client config')
      return data.data as MailboxClientConfig
    },
    enabled: !!projectId && !!mailboxId && enabled,
    staleTime: 60_000,
  })
}

export function useMailboxAction(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mailboxId, action, body }: {
      mailboxId: string
      domainId: string
      action: 'suspend' | 'unsuspend' | 'restore' | 'reset-password' | 'webmail-sso' | 'sync-quota'
      body?: Record<string, any>
    }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/mailboxes/${mailboxId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      if (!res.ok) throw new Error(`Failed to ${action} mailbox: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || `Failed to ${action} mailbox`)
      return data.data
    },
    onSuccess: (_data, { mailboxId, domainId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.mailbox(projectId, mailboxId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.domainMailboxes(projectId, domainId) })
    },
  })
}
