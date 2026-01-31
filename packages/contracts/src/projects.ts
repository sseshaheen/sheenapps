import { z } from 'zod'

// =============================================================================
// CREATE PROJECT
// =============================================================================

export const CreateProjectRequestSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(120),
  framework: z.enum(['react', 'nextjs', 'vue', 'svelte']).optional(),
  subdomain: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Subdomain must be lowercase alphanumeric with hyphens, not starting/ending with a hyphen')
    .optional(),
  /** ISO 4217 currency code (e.g., USD, SAR, EGP). Defaults to USD if omitted. */
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
  template: z
    .object({
      id: z.string(),
      version: z.number().int().positive(),
      tier: z.string(),
      category: z.string(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
})

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>

export const CreateProjectResponseSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string(),
  subdomain: z.string(),
  schemaName: z.string(),
  previewUrl: z.string(),
  apiKey: z.object({
    publicKey: z.string(),
    keyPrefix: z.string(),
  }),
})

export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>

// =============================================================================
// INFRASTRUCTURE STATUS
// =============================================================================

export const DatabaseStatusSchema = z.object({
  status: z.enum(['provisioning', 'active', 'error']),
  schemaName: z.string(),
  tableCount: z.number().int().min(0),
  storageUsedMb: z.number().min(0),
  storageQuotaMb: z.number().min(0),
  errorMessage: z.string().optional(),
})

export type DatabaseStatus = z.infer<typeof DatabaseStatusSchema>

export const HostingStatusSchema = z.object({
  status: z.enum(['none', 'deploying', 'live', 'error']),
  url: z.string().nullable(),
  subdomain: z.string(),
  lastDeployedAt: z.string().nullable(),
  currentBuildId: z.string().nullable(),
  errorMessage: z.string().optional(),
})

export type HostingStatus = z.infer<typeof HostingStatusSchema>

export const QuotaStatusSchema = z.object({
  requestsUsedToday: z.number().int().min(0),
  requestsLimit: z.number().int().min(0),
  bandwidthUsedMb: z.number().min(0),
  bandwidthQuotaMb: z.number().min(0),
  resetsAt: z.string(),
})

export type QuotaStatus = z.infer<typeof QuotaStatusSchema>

export const ApiKeysInfoSchema = z.object({
  publicKey: z.string(),
  hasServerKey: z.boolean(),
})

export type ApiKeysInfo = z.infer<typeof ApiKeysInfoSchema>

export const InfrastructureStatusSchema = z.object({
  database: DatabaseStatusSchema,
  hosting: HostingStatusSchema,
  quotas: QuotaStatusSchema,
  apiKeys: ApiKeysInfoSchema,
  tier: z.enum(['free', 'starter', 'growth', 'scale']),
  updatedAt: z.string().optional(),
  hasDeployedOnce: z.boolean().optional(),
})

export type InfrastructureStatus = z.infer<typeof InfrastructureStatusSchema>

// =============================================================================
// LIST PROJECTS
// =============================================================================

export const ListProjectsQuerySchema = z.object({
  userId: z.string().uuid(),
})

export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>
