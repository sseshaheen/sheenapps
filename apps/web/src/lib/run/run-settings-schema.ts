/**
 * Run Settings Validation Schema
 *
 * Single source of truth for run_settings PATCH validation.
 * Eliminates manual key checking and prevents drift between UI and API.
 */

import { z } from 'zod'
import { isIndustryTag } from '@/lib/run/industry-tags'

// Email field: trim whitespace and allow empty string (= unset)
const EmailOrEmpty = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z.string().email().or(z.literal(''))
)

export const RunSettingsPatchSchema = z.object({
  industry_tag: z.string().optional().refine(
    (v) => !v || isIndustryTag(v),
    { message: 'Invalid industry tag' }
  ),
  notifications: z.object({
    enabled: z.boolean(),
    email_on_lead: z.boolean(),
    email_on_payment: z.boolean(),
    email_on_payment_failed: z.boolean(),
    email_on_abandoned_checkout: z.boolean(),
    email_recipient: EmailOrEmpty,
    daily_digest_enabled: z.boolean(),
    daily_digest_hour: z.number().int().min(0).max(23),
  }).partial().strict().optional(),
}).strict().superRefine((data, ctx) => {
  // Conditional validation: if enabling digest, hour must be provided
  const n = data.notifications
  if (!n) return

  if (n.daily_digest_enabled === true && n.daily_digest_hour === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['notifications', 'daily_digest_hour'],
      message: 'daily_digest_hour is required when daily_digest_enabled is true',
    })
  }
})

export type RunSettingsPatch = z.infer<typeof RunSettingsPatchSchema>
