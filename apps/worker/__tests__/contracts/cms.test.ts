import {
  CmsFieldSchema,
  CreateCmsTypeRequestSchema,
  CreateTableRequestSchema,
} from '@sheenapps/api-contracts'

describe('CMS Contract Schemas', () => {
  describe('CmsFieldSchema', () => {
    it('accepts valid text field', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'title',
        type: 'text',
        required: true,
        maxLength: 200,
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid number field', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'price',
        type: 'number',
        min: 0,
        max: 99999,
      })
      expect(result.success).toBe(true)
    })

    it('accepts select field with options', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'category',
        type: 'select',
        options: ['electronics', 'clothing', 'food'],
      })
      expect(result.success).toBe(true)
    })

    it('rejects select field without options', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'category',
        type: 'select',
      })
      expect(result.success).toBe(false)
    })

    it('rejects select field with empty options', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'category',
        type: 'select',
        options: [],
      })
      expect(result.success).toBe(false)
    })

    it('rejects number field with maxLength', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'price',
        type: 'number',
        maxLength: 10,
      })
      expect(result.success).toBe(false)
    })

    it('rejects text field with min/max (numeric constraints)', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'title',
        type: 'text',
        min: 0,
        max: 100,
      })
      expect(result.success).toBe(false)
    })

    it('rejects boolean field with any constraints', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'active',
        type: 'boolean',
        min: 0,
      })
      expect(result.success).toBe(false)
    })

    it('rejects field name starting with number', () => {
      const result = CmsFieldSchema.safeParse({
        name: '123field',
        type: 'text',
      })
      expect(result.success).toBe(false)
    })

    it('rejects unknown field type', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'data',
        type: 'binary',
      })
      expect(result.success).toBe(false)
    })

    it('rejects unknown keys (strict mode)', () => {
      const result = CmsFieldSchema.safeParse({
        name: 'title',
        type: 'text',
        customProp: 'should fail',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CreateCmsTypeRequestSchema', () => {
    it('accepts valid type with multiple fields', () => {
      const result = CreateCmsTypeRequestSchema.safeParse({
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'price', type: 'number', min: 0 },
          { name: 'image', type: 'image' },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty fields array', () => {
      const result = CreateCmsTypeRequestSchema.safeParse({
        fields: [],
      })
      expect(result.success).toBe(false)
    })

    it('rejects duplicate field names', () => {
      const result = CreateCmsTypeRequestSchema.safeParse({
        fields: [
          { name: 'title', type: 'text' },
          { name: 'title', type: 'number' },
        ],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CreateTableRequestSchema', () => {
    it('accepts valid table creation request', () => {
      const result = CreateTableRequestSchema.safeParse({
        tableName: 'products',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'text' },
          { name: 'price', type: 'decimal', nullable: true },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty columns', () => {
      const result = CreateTableRequestSchema.safeParse({
        tableName: 'products',
        columns: [],
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid table name (starts with number)', () => {
      const result = CreateTableRequestSchema.safeParse({
        tableName: '123_table',
        columns: [{ name: 'id', type: 'uuid' }],
      })
      expect(result.success).toBe(false)
    })
  })
})
