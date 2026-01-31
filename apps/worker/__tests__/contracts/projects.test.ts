import {
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  InfrastructureStatusSchema,
  ListProjectsQuerySchema,
} from '@sheenapps/api-contracts'

describe('Project Contract Schemas', () => {
  describe('CreateProjectRequestSchema', () => {
    it('accepts valid request', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Store',
      })
      expect(result.success).toBe(true)
    })

    it('accepts request with all optional fields', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Store',
        framework: 'nextjs',
        subdomain: 'my-store',
        template: {
          id: 'ecommerce-basic',
          version: 1,
          tier: 'free',
          category: 'ecommerce',
          tags: ['arabic', 'rtl'],
        },
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing name', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty name', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        name: '',
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-UUID userId', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: 'not-a-uuid',
        name: 'Test',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid subdomain (uppercase)', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
        subdomain: 'MyStore',
      })
      expect(result.success).toBe(false)
    })

    it('rejects subdomain starting with hyphen', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
        subdomain: '-my-store',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid framework', () => {
      const result = CreateProjectRequestSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
        framework: 'angular',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CreateProjectResponseSchema', () => {
    it('validates worker response shape', () => {
      const result = CreateProjectResponseSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Store',
        subdomain: 'my-store',
        schemaName: 'sh_my_store_abc123',
        previewUrl: 'https://my-store.sheenapps.com',
        apiKey: {
          publicKey: 'sheen_pk_live_abc123xyz',
          keyPrefix: 'sheen_pk_live_',
        },
      })
      expect(result.success).toBe(true)
    })

    it('rejects flat publicApiKey (old shape - Bug #2)', () => {
      const result = CreateProjectResponseSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Store',
        subdomain: 'my-store',
        schemaName: 'sh_my_store_abc123',
        previewUrl: 'https://my-store.sheenapps.com',
        publicApiKey: 'sheen_pk_live_abc123xyz', // Old flat shape
      })
      expect(result.success).toBe(false)
    })
  })

  describe('InfrastructureStatusSchema', () => {
    const validStatus = {
      database: {
        status: 'active' as const,
        schemaName: 'sh_store_abc123',
        tableCount: 3,
        storageUsedMb: 1.5,
        storageQuotaMb: 500,
      },
      hosting: {
        status: 'live' as const,
        url: 'https://my-store.sheenapps.com',
        subdomain: 'my-store',
        lastDeployedAt: '2026-01-30T12:00:00Z',
        currentBuildId: '550e8400-e29b-41d4-a716-446655440000',
      },
      quotas: {
        requestsUsedToday: 150,
        requestsLimit: 10000,
        bandwidthUsedMb: 25.5,
        bandwidthQuotaMb: 1000,
        resetsAt: '2026-01-31T00:00:00Z',
      },
      apiKeys: {
        publicKey: 'sheen_pk_live_',
        hasServerKey: false,
      },
      tier: 'free' as const,
    }

    it('validates complete status response', () => {
      const result = InfrastructureStatusSchema.safeParse(validStatus)
      expect(result.success).toBe(true)
    })

    it('validates status with optional fields', () => {
      const result = InfrastructureStatusSchema.safeParse({
        ...validStatus,
        updatedAt: '2026-01-30T12:00:00Z',
        hasDeployedOnce: true,
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid tier', () => {
      const result = InfrastructureStatusSchema.safeParse({
        ...validStatus,
        tier: 'premium',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid hosting status', () => {
      const result = InfrastructureStatusSchema.safeParse({
        ...validStatus,
        hosting: { ...validStatus.hosting, status: 'building' },
      })
      expect(result.success).toBe(false)
    })
  })

  describe('ListProjectsQuerySchema', () => {
    it('accepts valid UUID', () => {
      const result = ListProjectsQuerySchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.success).toBe(true)
    })

    it('rejects non-UUID', () => {
      const result = ListProjectsQuerySchema.safeParse({
        userId: 'abc123',
      })
      expect(result.success).toBe(false)
    })
  })
})
