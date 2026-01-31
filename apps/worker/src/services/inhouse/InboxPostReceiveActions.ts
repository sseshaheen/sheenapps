/**
 * Inbox Post-Receive Actions
 *
 * Handles auto-reply and forwarding after an inbound message is stored.
 * All actions are fire-and-forget: they never throw and never block message storage.
 *
 * Part of easy-mode-email-plan.md (Phase 1.5: Post-Receive Pipeline)
 */

import { getBestEffortRedis } from '../redisBestEffort'
import { getInhouseEmailService } from './InhouseEmailService'
import { getInhouseMeteringService } from './InhouseMeteringService'
import { createLogger } from '../../observability/logger'
import type { InboxConfig } from './InhouseInboxService'

const log = createLogger('inbox-post-receive')

// =============================================================================
// TYPES
// =============================================================================

export interface PostReceiveContext {
  projectId: string
  messageId: string
  threadId: string
  fromEmail: string
  fromName?: string
  toEmail: string
  subject?: string
  textBody?: string
  emailMessageId?: string    // RFC 822 Message-ID header
  references?: string[]      // RFC 822 References header chain
  inboxConfig: InboxConfig
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Auto-reply dedup TTL: 24 hours per sender per inbox */
const AUTO_REPLY_DEDUP_TTL_SECONDS = 24 * 60 * 60

/** No-reply patterns - never send auto-replies to these */
const NO_REPLY_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^do-not-reply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounce/i,
  /^notifications?@/i,
]

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalize a Message-ID to RFC 5322 angle-bracket format.
 * Some providers return Message-IDs without brackets; email clients
 * expect them in In-Reply-To and References headers.
 */
function normalizeMessageId(id: string): string {
  const trimmed = id.trim()
  if (!trimmed) return trimmed
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`
}

/**
 * Build a reply subject, avoiding "Re: Re: Re:" stacking.
 */
function buildReplySubject(subject?: string): string {
  if (!subject) return 'Auto-Reply'
  return /^re:\s*/i.test(subject) ? subject : `Re: ${subject}`
}

/**
 * Build proper threading headers from the original message's Message-ID and References.
 * Preserves the full References chain for correct thread display in email clients.
 */
function buildThreadingHeaders(
  emailMessageId?: string,
  references?: string[]
): Record<string, string> {
  const headers: Record<string, string> = {}

  if (emailMessageId) {
    headers['In-Reply-To'] = normalizeMessageId(emailMessageId)
  }

  // Build References chain: original References + the Message-ID we're replying to
  const mergedRefs = [
    ...(references ?? []).map(normalizeMessageId),
    ...(emailMessageId ? [normalizeMessageId(emailMessageId)] : []),
  ].filter(Boolean)

  if (mergedRefs.length > 0) {
    headers['References'] = mergedRefs.join(' ')
  }

  return headers
}

// =============================================================================
// AUTO-REPLY
// =============================================================================

/**
 * Send an auto-reply if enabled and not already sent to this sender recently.
 *
 * Policy: if Redis is unavailable, skip auto-reply entirely to avoid
 * sending duplicate replies during Redis blips. Outbound automation
 * should fail closed when dedup is unavailable.
 */
async function handleAutoReply(ctx: PostReceiveContext): Promise<void> {
  const { inboxConfig, fromEmail, projectId, emailMessageId, references, subject } = ctx

  if (!inboxConfig.autoReplyEnabled || !inboxConfig.autoReplyMessage) {
    return
  }

  // Skip no-reply addresses
  if (NO_REPLY_PATTERNS.some((pattern) => pattern.test(fromEmail))) {
    log.info({ fromEmail, projectId }, 'Skipping auto-reply to no-reply address')
    return
  }

  // 24-hour sender dedup via Redis (fail closed: skip if Redis unavailable)
  const redis = getBestEffortRedis()
  if (!redis) {
    log.warn({ projectId, fromEmail, mode: 'degraded' }, 'Redis unavailable; skipping auto-reply to avoid duplicates')
    return
  }

  const dedupKey = `auto-reply:${inboxConfig.inboxId}:${fromEmail.trim().toLowerCase()}`
  let alreadySent: string | null = null
  try {
    alreadySent = await redis.set(dedupKey, '1', 'EX', AUTO_REPLY_DEDUP_TTL_SECONDS, 'NX')
  } catch (err) {
    log.warn({ err, projectId, fromEmail, mode: 'degraded' }, 'Redis dedupe error; skipping auto-reply to avoid duplicates')
    return
  }
  if (!alreadySent) {
    log.info({ fromEmail, projectId, inboxId: inboxConfig.inboxId }, 'Auto-reply already sent within 24h, skipping')
    return
  }

  // Check metering quota before sending (soft limit — fire-and-forget context,
  // so occasional overage during races is acceptable; the real atomic guard
  // is reserveProjectQuota inside emailService.send)
  const metering = getInhouseMeteringService()
  const quota = await metering.checkProjectQuota(projectId, 'email_sends')
  if (!quota.allowed) {
    log.warn({ projectId, metric: 'email_sends' }, 'Email quota exceeded, skipping auto-reply')
    return
  }

  // Build threading headers for proper reply threading
  const headers = buildThreadingHeaders(emailMessageId, references)

  // Send auto-reply via email service
  const emailService = getInhouseEmailService(projectId)

  await emailService.send({
    to: fromEmail,
    subject: buildReplySubject(subject),
    text: inboxConfig.autoReplyMessage,
    from: ctx.toEmail, // Reply from the inbox address
    headers,
  })

  log.info({ fromEmail, projectId }, 'Auto-reply sent')
}

// =============================================================================
// FORWARDING
// =============================================================================

/**
 * Forward the message to the configured forwarding address.
 */
async function handleForwarding(ctx: PostReceiveContext): Promise<void> {
  const { inboxConfig, fromEmail, projectId, subject, textBody, emailMessageId } = ctx

  if (!inboxConfig.forwardToEmail) {
    return
  }

  // Circular forwarding prevention: don't forward if sender is the forward target
  if (fromEmail.toLowerCase() === inboxConfig.forwardToEmail.toLowerCase()) {
    log.warn({ projectId, fromEmail, forwardTo: inboxConfig.forwardToEmail }, 'Circular forwarding prevented')
    return
  }

  // Check metering quota before sending (soft limit — see auto-reply comment)
  const metering = getInhouseMeteringService()
  const quota = await metering.checkProjectQuota(projectId, 'email_sends')
  if (!quota.allowed) {
    log.warn({ projectId, metric: 'email_sends' }, 'Email quota exceeded, skipping forward')
    return
  }

  // Build headers for forwarding context
  const headers: Record<string, string> = {}
  if (emailMessageId) {
    headers['References'] = normalizeMessageId(emailMessageId)
  }
  headers['X-Original-From'] = fromEmail

  const emailService = getInhouseEmailService(projectId)
  const fwdSubject = subject ? `Fwd: ${subject}` : 'Forwarded Message'
  const fwdBody = [
    `---------- Forwarded message ----------`,
    `From: ${ctx.fromName ? `${ctx.fromName} <${fromEmail}>` : fromEmail}`,
    `Subject: ${subject || '(no subject)'}`,
    ``,
    textBody || '(no text content)',
  ].join('\n')

  await emailService.send({
    to: inboxConfig.forwardToEmail,
    subject: fwdSubject,
    text: fwdBody,
    from: ctx.toEmail, // Forward from the inbox address
    headers,
  })

  log.info({ projectId, forwardTo: inboxConfig.forwardToEmail }, 'Message forwarded')
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Execute all post-receive actions (auto-reply, forwarding).
 * Fire-and-forget: never throws, logs all errors internally.
 */
export async function executePostReceiveActions(ctx: PostReceiveContext): Promise<void> {
  // Run auto-reply and forwarding in parallel, both fire-and-forget
  const actions = [
    handleAutoReply(ctx).catch((error) => {
      log.error({ err: error, messageId: ctx.messageId, projectId: ctx.projectId }, 'Auto-reply failed')
    }),
    handleForwarding(ctx).catch((error) => {
      log.error({ err: error, messageId: ctx.messageId, projectId: ctx.projectId }, 'Forwarding failed')
    }),
  ]

  await Promise.allSettled(actions)
}
