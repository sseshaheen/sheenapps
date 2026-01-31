import { z } from 'zod'

// =============================================================================
// CMS FIELD & TYPE SCHEMAS
// =============================================================================

const CmsFieldTypeSchema = z.enum([
  'text',
  'number',
  'email',
  'url',
  'date',
  'select',
  'image',
  'boolean',
  'richtext',
  'json',
])

export type CmsFieldType = z.infer<typeof CmsFieldTypeSchema>

export const CmsFieldSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_]*$/,
        'Field name must start with a letter and contain only letters, numbers, and underscores'
      ),
    type: CmsFieldTypeSchema,
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
    description: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    // Type-specific constraint rules
    if (field.type === 'select') {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "'select' fields require at least one option",
          path: ['options'],
        })
      }
    }

    if (field.type === 'number') {
      if (field.maxLength !== undefined || field.pattern !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "'number' fields cannot have maxLength or pattern constraints",
          path: ['type'],
        })
      }
    }

    if (['text', 'email', 'url'].includes(field.type)) {
      if (field.min !== undefined || field.max !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `'${field.type}' fields cannot have min/max constraints (use maxLength)`,
          path: ['type'],
        })
      }
    }

    if (['image', 'boolean', 'date'].includes(field.type)) {
      if (
        field.min !== undefined ||
        field.max !== undefined ||
        field.maxLength !== undefined ||
        field.pattern !== undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `'${field.type}' fields do not support numeric or string constraints`,
          path: ['type'],
        })
      }
    }
  })

export type CmsField = z.infer<typeof CmsFieldSchema>

export const CreateCmsTypeRequestSchema = z
  .object({
    fields: z.array(CmsFieldSchema).min(1).max(50),
  })
  .strict()
  .refine(
    (data) => new Set(data.fields.map((f) => f.name)).size === data.fields.length,
    { message: 'Field names must be unique' }
  )

export type CreateCmsTypeRequest = z.infer<typeof CreateCmsTypeRequestSchema>

// =============================================================================
// CMS TABLE CREATION (worker side)
// =============================================================================

export const CreateTableRequestSchema = z.object({
  tableName: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  columns: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        nullable: z.boolean().optional(),
        primaryKey: z.boolean().optional(),
        unique: z.boolean().optional(),
        default: z.string().optional(),
      })
    )
    .min(1),
  userId: z.string().uuid().optional(),
})

export type CreateTableRequest = z.infer<typeof CreateTableRequestSchema>
