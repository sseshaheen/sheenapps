/**
 * Mailbox Engine Adapter Interface
 *
 * Provider-agnostic interface for mailbox hosting backends.
 * Allows swapping OpenSRS for WorkMail or another provider.
 *
 * Part of easy-mode-email-plan.md (Phase 4: Real Mailbox)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MailboxProviderInfo {
  name: string
  imapHost: string
  imapPort: number
  popHost: string
  popPort: number
  smtpHost: string
  smtpPort: number
  smtpSubmissionPort: number
  webmailUrl: string
  mxTarget: string
  mxPriority: number
  spfInclude: string
}

export interface CreateMailboxInput {
  email: string
  localPart: string
  domain: string
  password: string
  displayName?: string
  quotaMb?: number
}

export interface CreateMailboxResult {
  email: string
  provisioned: boolean
}

export interface MailboxInfo {
  email: string
  localPart: string
  domain: string
  displayName?: string
  suspended: boolean
  quotaBytes?: number
  diskUsageBytes?: number
  imapEnabled: boolean
  popEnabled: boolean
  webmailEnabled: boolean
  smtpEnabled: boolean
  forwardTo?: string
  forwardKeepCopy: boolean
  autoresponderEnabled: boolean
  autoresponderSubject?: string
  autoresponderBody?: string
  lastLogin?: string
  messageCount?: number
}

export interface UpdateMailboxInput {
  email: string
  displayName?: string
  quotaMb?: number
  forwardTo?: string | null
  forwardKeepCopy?: boolean
  imapEnabled?: boolean
  popEnabled?: boolean
  webmailEnabled?: boolean
  smtpEnabled?: boolean
  autoresponderEnabled?: boolean
  autoresponderSubject?: string
  autoresponderBody?: string
}

export interface SsoTokenResult {
  token: string
  url: string
}

// =============================================================================
// ADAPTER INTERFACE
// =============================================================================

export interface MailboxEngineAdapter {
  readonly providerInfo: MailboxProviderInfo

  // Domain-level
  provisionDomain(domain: string, maxUsers?: number): Promise<void>
  deprovisionDomain(domain: string): Promise<void>

  // Mailbox CRUD
  createMailbox(input: CreateMailboxInput): Promise<CreateMailboxResult>
  getMailbox(email: string): Promise<MailboxInfo | null>
  updateMailbox(input: UpdateMailboxInput): Promise<void>
  deleteMailbox(email: string): Promise<void>
  restoreMailbox(email: string): Promise<void>
  setPassword(email: string, newPassword: string): Promise<void>
  listMailboxes(domain: string): Promise<string[]>

  // Auth & webmail
  generateWebmailSsoToken(email: string): Promise<SsoTokenResult>

  // Quota
  syncQuota(email: string): Promise<{ quotaMb: number; quotaUsedMb: number }>
}
