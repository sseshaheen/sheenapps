/**
 * Centralized query keys for React Query
 * Following array-form pattern for type safety and consistency
 */

// Projects query keys
export const projectsKeys = {
  all: ['projects'] as const,
  lists: () => [...projectsKeys.all, 'list'] as const,
  list: (userId: string) => [...projectsKeys.lists(), userId] as const,
  byUser: (userId: string) => [...projectsKeys.lists(), userId] as const, // Alias for consistency
  details: () => [...projectsKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectsKeys.details(), id] as const,
} as const

// Billing query keys
export const billingKeys = {
  all: ['billing'] as const,
  info: (userId: string) => [...billingKeys.all, 'info', userId] as const,
  subscription: (userId: string) => [...billingKeys.all, 'subscription', userId] as const,
  usage: (userId: string) => [...billingKeys.all, 'usage', userId] as const,
  limits: (planName: string) => [...billingKeys.all, 'limits', planName] as const,
} as const

// Advisor query keys
export const advisorKeys = {
  all: ['advisor'] as const,
  overview: (userId: string, locale: string) => 
    ['advisor', 'overview', userId, locale] as const,
  consultations: (userId: string, locale: string, filters?: Record<string, any>) => 
    ['advisor', 'consultations', userId, locale, JSON.stringify(filters || {})] as const,
  analytics: (userId: string, locale: string, period?: string) => 
    ['advisor', 'analytics', userId, locale, period || '30d'] as const,
  availability: (userId: string, locale: string) => 
    ['advisor', 'availability', userId, locale] as const,
  settings: (userId: string, locale: string) => 
    ['advisor', 'settings', userId, locale] as const,
} as const

// Collaborator query keys (project-scoped)
export const collaboratorKeys = {
  all: ['collaborators'] as const,
  list: (projectId: string) => [...collaboratorKeys.all, 'list', projectId] as const,
  detail: (projectId: string, collaboratorId: string) =>
    [...collaboratorKeys.all, 'detail', projectId, collaboratorId] as const,
} as const

// Email query keys (project-scoped)
export const emailKeys = {
  all: ['email'] as const,

  // Inbox
  inboxConfig: (projectId: string) => [...emailKeys.all, 'inbox-config', projectId] as const,
  inboxMessages: (projectId: string, filters?: Record<string, any>) =>
    [...emailKeys.all, 'inbox-messages', projectId, JSON.stringify(filters || {})] as const,
  inboxThreads: (projectId: string, filters?: Record<string, any>) =>
    [...emailKeys.all, 'inbox-threads', projectId, JSON.stringify(filters || {})] as const,
  inboxThread: (projectId: string, threadId: string) =>
    [...emailKeys.all, 'inbox-thread', projectId, threadId] as const,

  // Domains
  emailDomains: (projectId: string) => [...emailKeys.all, 'email-domains', projectId] as const,
  emailDomain: (projectId: string, domainId: string) =>
    [...emailKeys.all, 'email-domain', projectId, domainId] as const,
  emailDomainStatus: (projectId: string, domainId: string) =>
    [...emailKeys.all, 'email-domain-status', projectId, domainId] as const,

  // Registered domains
  registeredDomains: (projectId: string) => [...emailKeys.all, 'registered-domains', projectId] as const,
  registeredDomain: (projectId: string, domainId: string) =>
    [...emailKeys.all, 'registered-domain', projectId, domainId] as const,

  // Mailboxes
  domainMailboxes: (projectId: string, domainId: string) =>
    [...emailKeys.all, 'domain-mailboxes', projectId, domainId] as const,
  mailbox: (projectId: string, mailboxId: string) =>
    [...emailKeys.all, 'mailbox', projectId, mailboxId] as const,

  // Overview
  emailOverview: (projectId: string) => [...emailKeys.all, 'email-overview', projectId] as const,

  // Outbound / history
  emailHistory: (projectId: string, filters?: Record<string, any>) =>
    [...emailKeys.all, 'email-history', projectId, JSON.stringify(filters || {})] as const,

  // Cross-project
  unreadSummary: (userId: string) => [...emailKeys.all, 'unread-summary', userId] as const,
  domainPricing: () => [...emailKeys.all, 'domain-pricing'] as const,
} as const

// Export all keys
export const queryKeys = {
  projects: projectsKeys,
  billing: billingKeys,
  advisor: advisorKeys,
  collaborators: collaboratorKeys,
  email: emailKeys,
} as const