/**
 * Comprehensive Integration Tests for Migration System
 * Tests the full migration flow including verification, analytics, enterprise features, and SSE
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MigrationOrchestratorService } from '../src/services/migrationOrchestratorService';
import { migrationVerificationService } from '../src/services/migrationVerificationService';
import { migrationAnalyticsService } from '../src/services/migrationAnalyticsService';
import { enterpriseMigrationService } from '../src/services/enterpriseMigrationService';
import { migrationSSEService } from '../src/services/migrationSSEService';

// Mock external dependencies
jest.mock('../src/services/database');
jest.mock('../src/services/unifiedLogger');
jest.mock('dns', () => ({
  promises: {
    resolveTxt: jest.fn(),
    resolveNs: jest.fn()
  }
}));

describe('Migration Integration Tests', () => {
  let orchestrator: MigrationOrchestratorService;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock database client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn()
    };

    // Mock getPool to return our mock
    const { getPool } = require('../src/services/database');
    getPool.mockReturnValue(mockPool);

    orchestrator = new MigrationOrchestratorService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Full Migration Flow', () => {
    const testUserId = 'user-123';
    const testOrgId = 'org-456';
    const testUrl = 'https://example.com';
    const testMigrationId = 'migration-789';

    it('should complete full migration flow with analytics tracking', async () => {
      // Mock migration start
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check for existing migration
        .mockResolvedValueOnce({ // Insert new migration
          rows: [{
            id: testMigrationId,
            user_id: testUserId,
            source_url: testUrl,
            normalized_source_url: testUrl,
            status: 'analyzing',
            created_at: new Date(),
            updated_at: new Date(),
            config: {}
          }]
        });

      // Start migration
      const migration = await orchestrator.startMigration({
        userId: testUserId,
        sourceUrl: testUrl,
        userPrompt: 'Migrate my site'
      });

      expect(migration.id).toBe(testMigrationId);
      expect(migration.status).toBe('analyzing');
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should handle verification with enhanced UX', async () => {
      const testToken = 'verification-token-123';

      // Mock migration lookup
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: testMigrationId,
          user_id: testUserId,
          source_url: testUrl,
          verification_token_hash: 'hashed-token',
          verification_expires_at: new Date(Date.now() + 3600000)
        }]
      });

      // Mock verification service
      const mockVerifyResult = {
        success: true,
        message: 'DNS verification successful',
        method: 'dns' as const,
        verifiedAt: new Date(),
        provider: 'cloudflare'
      };

      jest.spyOn(migrationVerificationService, 'verifyDomainOwnership')
        .mockResolvedValue(mockVerifyResult);

      // Mock update migration status
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await orchestrator.verifyOwnership({
        migrationId: testMigrationId,
        method: 'dns',
        token: testToken
      });

      expect(result.verified).toBe(true);
      expect(result.message).toBe('DNS verification successful');
      expect(migrationVerificationService.verifyDomainOwnership).toHaveBeenCalledWith(
        testMigrationId,
        testUserId,
        'dns',
        testToken
      );
    });

    it('should track analytics throughout migration lifecycle', async () => {
      const analyticsTrackSpy = jest.spyOn(migrationAnalyticsService, 'trackMigrationMetrics')
        .mockResolvedValue();

      // Mock SSE service
      const broadcastSpy = jest.spyOn(migrationSSEService, 'broadcastMigrationEvent')
        .mockImplementation();

      // Mock migration start
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: testMigrationId,
            user_id: testUserId,
            source_url: testUrl,
            status: 'analyzing',
            created_at: new Date(),
            config: {}
          }]
        });

      await orchestrator.startMigration({
        userId: testUserId,
        sourceUrl: testUrl
      });

      // Verify analytics tracking was called
      expect(analyticsTrackSpy).toHaveBeenCalledWith(
        testMigrationId,
        'started',
        expect.objectContaining({
          sourceUrl: testUrl,
          hasUserPrompt: false,
          userAgent: 'migration-orchestrator'
        })
      );

      // Verify SSE broadcast was called
      expect(broadcastSpy).toHaveBeenCalledWith(
        testMigrationId,
        expect.objectContaining({
          type: 'migration_started',
          migrationId: testMigrationId,
          status: 'analyzing',
          progress: 0
        })
      );
    });

    it('should enforce enterprise limits and budgets', async () => {
      // Mock organization lookup
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ org_id: testOrgId }] }) // getOrganizationId
        .mockResolvedValueOnce({ rows: [{ active_count: '3' }] }) // active migrations count
        .mockResolvedValueOnce({ // organization config
          rows: [{
            migration_limits: JSON.stringify({
              concurrentMigrations: 5,
              dailyMigrations: 20
            })
          }]
        });

      // Test should pass enterprise limits check
      const orchestratorInstance = orchestrator as any;
      const orgId = await orchestratorInstance.getOrganizationId(testMigrationId);
      const enterpriseCheck = await orchestratorInstance.checkEnterpriseLimits(orgId);

      expect(orgId).toBe(testOrgId);
      expect(enterpriseCheck.canProceed).toBe(true);
    });

    it('should handle enterprise bulk migration setup', async () => {
      const bulkRequest = {
        name: 'Test Bulk Migration',
        description: 'Migrate multiple sites',
        urls: ['https://site1.com', 'https://site2.com', 'https://site3.com'],
        userBrief: {
          goals: 'Migrate all sites to Next.js',
          style_preferences: 'modern',
          framework_preferences: 'nextjs'
        },
        scheduling: {
          immediate: true,
          batchSize: 2,
          delayBetweenBatches: 60
        },
        notifications: {
          email: 'test@example.com'
        }
      };

      // Mock organization config check
      const mockOrgConfig = {
        orgId: testOrgId,
        customBudgets: {
          softBudgetSeconds: 1800,
          hardBudgetSeconds: 3600
        },
        advancedFeatures: {
          bulkMigrations: true,
          whiteGloveService: true
        },
        migrationLimits: {
          concurrentMigrations: 10,
          dailyMigrations: 50
        }
      };

      jest.spyOn(enterpriseMigrationService as any, 'getOrganizationConfig')
        .mockResolvedValue(mockOrgConfig);

      jest.spyOn(enterpriseMigrationService as any, 'getActiveMigrationsCount')
        .mockResolvedValue(2);

      // Mock bulk job creation
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'bulk-123' }]
      });

      // Mock processBulkMigration
      jest.spyOn(enterpriseMigrationService as any, 'processBulkMigration')
        .mockResolvedValue();

      const result = await enterpriseMigrationService.startBulkMigration(
        testUserId,
        testOrgId,
        bulkRequest
      );

      expect(result.success).toBe(true);
      expect(result.bulkId).toBe('bulk-123');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle verification failures gracefully', async () => {
      const testMigrationId = 'migration-fail-123';

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: testMigrationId,
          user_id: 'user-123',
          source_url: 'https://example.com',
          verification_token_hash: 'hash',
          verification_expires_at: new Date(Date.now() + 3600000)
        }]
      });

      // Mock verification failure
      jest.spyOn(migrationVerificationService, 'verifyDomainOwnership')
        .mockResolvedValue({
          success: false,
          message: 'DNS record not found',
          method: 'dns' as const
        });

      const broadcastSpy = jest.spyOn(migrationSSEService, 'broadcastMigrationEvent')
        .mockImplementation();

      const result = await orchestrator.verifyOwnership({
        migrationId: testMigrationId,
        method: 'dns',
        token: 'invalid-token'
      });

      expect(result.verified).toBe(false);
      expect(result.message).toBe('DNS record not found');

      // Should broadcast failure event
      expect(broadcastSpy).toHaveBeenCalledWith(
        testMigrationId,
        expect.objectContaining({
          type: 'verification_failed',
          status: 'analyzing',
          progress: 0
        })
      );
    });

    it('should track migration cancellation', async () => {
      const testMigrationId = 'migration-cancel-123';
      const testUserId = 'user-123';

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Update migration status
        .mockResolvedValueOnce({ rows: [] }); // Update phases

      const analyticsTrackSpy = jest.spyOn(migrationAnalyticsService, 'trackMigrationMetrics')
        .mockResolvedValue();

      const broadcastSpy = jest.spyOn(migrationSSEService, 'broadcastMigrationEvent')
        .mockImplementation();

      await orchestrator.cancelMigration(testMigrationId, testUserId);

      expect(analyticsTrackSpy).toHaveBeenCalledWith(
        testMigrationId,
        'cancelled',
        expect.objectContaining({
          cancelledBy: 'user',
          cancelledAt: expect.any(Number)
        })
      );

      expect(broadcastSpy).toHaveBeenCalledWith(
        testMigrationId,
        expect.objectContaining({
          type: 'migration_cancelled',
          status: 'failed',
          message: 'Migration cancelled by user'
        })
      );
    });

    it('should handle enterprise limit violations', async () => {
      const testOrgId = 'org-limit-test';

      // Mock hitting concurrent migration limit
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ active_count: '5' }] })
        .mockResolvedValueOnce({
          rows: [{
            migration_limits: JSON.stringify({
              concurrentMigrations: 5
            })
          }]
        });

      const orchestratorInstance = orchestrator as any;
      const enterpriseCheck = await orchestratorInstance.checkEnterpriseLimits(testOrgId);

      expect(enterpriseCheck.canProceed).toBe(false);
      expect(enterpriseCheck.reason).toContain('Concurrent migration limit exceeded');
    });
  });

  describe('Real-time Updates', () => {
    it('should broadcast phase progress during AI pipeline', async () => {
      const testMigrationId = 'migration-sse-123';

      const broadcastSpy = jest.spyOn(migrationSSEService, 'broadcastMigrationEvent')
        .mockImplementation();

      const analyticsTrackSpy = jest.spyOn(migrationAnalyticsService, 'trackMigrationMetrics')
        .mockResolvedValue();

      // Mock AI service phase execution
      const mockAIService = {
        executePhase: jest.fn().mockResolvedValue()
      };
      (orchestrator as any).aiService = mockAIService;

      // Mock budget and enterprise checks
      jest.spyOn(orchestrator as any, 'checkBudget')
        .mockResolvedValue({ canProceed: true });

      jest.spyOn(orchestrator as any, 'getOrganizationId')
        .mockResolvedValue(null);

      // Mock database operations
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Update to completed
        .mockResolvedValueOnce({ rows: [] }) // Any other queries

      // Execute the AI pipeline
      await (orchestrator as any).executeAIPipeline(testMigrationId);

      // Verify phase start/completion events were broadcast
      expect(broadcastSpy).toHaveBeenCalledWith(
        testMigrationId,
        expect.objectContaining({
          type: 'phase_started',
          status: 'processing',
          phase: expect.any(String)
        })
      );

      expect(broadcastSpy).toHaveBeenCalledWith(
        testMigrationId,
        expect.objectContaining({
          type: 'phase_completed',
          status: 'processing',
          phase: expect.any(String)
        })
      );

      // Verify completion event
      expect(broadcastSpy).toHaveBeenCalledWith(
        testMigrationId,
        expect.objectContaining({
          type: 'migration_completed',
          status: 'completed',
          progress: 100
        })
      );

      // Verify analytics tracking
      expect(analyticsTrackSpy).toHaveBeenCalledWith(
        testMigrationId,
        'completed',
        expect.objectContaining({
          totalPhases: expect.any(Number),
          completionTime: expect.any(Number)
        })
      );
    });
  });

  describe('Service Integration Points', () => {
    it('should integrate verification service with provider detection', async () => {
      const testDomain = 'example.com';
      const testMigrationId = 'migration-provider-123';
      const testUserId = 'user-123';

      // Mock DNS provider detection
      const dns = require('dns');
      dns.promises.resolveNs.mockResolvedValue(['ns1.cloudflare.com', 'ns2.cloudflare.com']);

      const providerInfo = await migrationVerificationService.detectDNSProvider(testDomain);

      expect(providerInfo.provider).toBe('cloudflare');
      expect(providerInfo.instructions).toContain('Cloudflare');
    });

    it('should integrate analytics service with performance reporting', async () => {
      const timeRange = {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        to: new Date()
      };

      // Mock analytics data
      mockClient.query
        .mockResolvedValueOnce({ // Migration metrics
          rows: [{
            total_migrations: 50,
            successful_migrations: 42,
            failed_migrations: 8,
            avg_completion_time: 1800000
          }]
        })
        .mockResolvedValueOnce({ // Performance data
          rows: [
            { date: '2025-01-01', migrations: 10, avg_time: 1500000 },
            { date: '2025-01-02', migrations: 12, avg_time: 1700000 }
          ]
        });

      const metrics = await migrationAnalyticsService.getMigrationMetrics(timeRange);

      expect(metrics.totalMigrations).toBe(50);
      expect(metrics.successRate).toBeCloseTo(84); // 42/50 * 100
    });
  });
});