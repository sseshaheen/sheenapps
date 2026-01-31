import { z } from 'zod'

// =============================================================================
// QUERY CONTRACT (Easy Mode Gateway)
// =============================================================================

export const FilterOperatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'in',
  'is',
])

export type FilterOperator = z.infer<typeof FilterOperatorSchema>

export const QueryFilterSchema = z.object({
  column: z.string().min(1),
  operator: FilterOperatorSchema,
  value: z.unknown(),
})

export type QueryFilter = z.infer<typeof QueryFilterSchema>

export const QueryContractSchema = z.object({
  table: z.string().min(1).max(64),
  select: z.string().optional().default('*'),
  filters: z.array(QueryFilterSchema).optional(),
  orderBy: z
    .object({
      column: z.string(),
      direction: z.enum(['asc', 'desc']).optional().default('asc'),
    })
    .optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
})

export type QueryContract = z.infer<typeof QueryContractSchema>
