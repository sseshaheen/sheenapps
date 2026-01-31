'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface RegisteredDomain {
  id: string
  projectId: string
  domain: string
  status: string
  expiresAt: string
  autoRenew: boolean
  whoisPrivacy: boolean
  nameservers: string[]
  createdAt: string
  updatedAt: string
}

async function fetchRegisteredDomains(projectId: string) {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/registered-domains?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch registered domains: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch registered domains')
  return data.data as { domains: RegisteredDomain[] }
}

async function fetchRegisteredDomain(projectId: string, domainId: string) {
  const res = await fetch(
    `/api/inhouse/projects/${projectId}/registered-domains/${domainId}?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch registered domain: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch registered domain')
  return data.data as RegisteredDomain
}

export function useRegisteredDomains(projectId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.registeredDomains(projectId),
    queryFn: () => fetchRegisteredDomains(projectId),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}

export function useRegisteredDomain(projectId: string, domainId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.registeredDomain(projectId, domainId),
    queryFn: () => fetchRegisteredDomain(projectId, domainId),
    enabled: !!projectId && !!domainId && enabled,
    staleTime: 30_000,
  })
}

export function useRenewDomain(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domainId, period }: { domainId: string; period: number }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/registered-domains/${domainId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      })
      if (!res.ok) throw new Error(`Failed to renew domain: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to renew domain')
      return data.data
    },
    onSuccess: (_data, { domainId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.registeredDomain(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.registeredDomains(projectId) })
    },
  })
}

export function useUpdateDomainSettings(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domainId, settings }: { domainId: string; settings: { autoRenew?: boolean; whoisPrivacy?: boolean } }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/registered-domains/${domainId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error(`Failed to update domain settings: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to update domain settings')
      return data.data
    },
    onSuccess: (_data, { domainId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.registeredDomain(projectId, domainId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.registeredDomains(projectId) })
    },
  })
}

export function useDomainSearch(projectId: string) {
  return useMutation({
    mutationFn: async (body: { query: string; tlds?: string[] }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/domain-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Failed to search domains: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to search domains')
      return data.data
    },
  })
}

export interface DomainContact {
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  city: string
  state: string
  postalCode: string
  country: string
  orgName?: string
  address2?: string
}

export interface DomainRegisterResponse {
  domain?: RegisteredDomain
  orderId?: string
  // Payment fields - present when payment action is required
  requiresPaymentAction?: boolean
  paymentIntentClientSecret?: string
  paymentIntentId?: string
}

export function useDomainRegister(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: {
      domain: string
      period: number
      autoRenew: boolean
      whoisPrivacy: boolean
      contacts: {
        owner: DomainContact
        admin?: DomainContact
        billing?: DomainContact
        tech?: DomainContact
      }
      paymentMethodId?: string
    }): Promise<DomainRegisterResponse> => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/domain-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Failed to register domain: ${res.status}`)
      const data = await res.json()
      // Handle payment required case - not an error, just requires client action
      if (data.error?.code === 'REGISTRATION_FAILED' && data.data?.requiresPaymentAction) {
        return data.data as DomainRegisterResponse
      }
      if (!data.ok) throw new Error(data.error?.message || 'Failed to register domain')
      return data.data as DomainRegisterResponse
    },
    onSuccess: (data) => {
      // Only invalidate if domain was actually registered (not just payment required)
      if (data.domain) {
        queryClient.invalidateQueries({ queryKey: emailKeys.registeredDomains(projectId) })
      }
    },
  })
}
