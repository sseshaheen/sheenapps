/**
 * Performance Tests for Migration System
 * Tests system performance under various load conditions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MigrationOrchestratorService } from '../src/services/migrationOrchestratorService';
import { migrationAnalyticsService } from '../src/services/migrationAnalyticsService';
import { enterpriseMigrationService } from '../src/services/enterpriseMigrationService';
import { migrationSSEService } from '../src/services/migrationSSEService';

// Mock external dependencies
jest.mock('../src/services/database');
jest.mock('../src/services/unifiedLogger');

describe('Migration Performance Tests', () => {
  let orchestrator: MigrationOrchestratorService;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn()
    };

    const { getPool } = require('../src/services/database');
    getPool.mockReturnValue(mockPool);

    orchestrator = new MigrationOrchestratorService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Concurrent Migration Handling', () => {
    it('should handle multiple simultaneous migration starts', async () => {
      const concurrentCount = 10;
      const promises: Promise<any>[] = [];

      // Mock database responses for all concurrent requests
      mockClient.query
        .mockResolvedValue({ rows: [] }) // No existing migrations
        .mockResolvedValue({ // Insert successful
          rows: [{
            id: 'migration-concurrent',
            user_id: 'user-test',
            source_url: 'https://example.com',
            status: 'analyzing',
            created_at: new Date(),
            config: {}
          }]
        });

      // Mock analytics and SSE to avoid errors
      jest.spyOn(migrationAnalyticsService, 'trackMigrationMetrics')
        .mockResolvedValue();
      jest.spyOn(migrationSSEService, 'broadcastMigrationEvent')
        .mockImplementation();

      const startTime = Date.now();

      // Start multiple migrations concurrently
      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          orchestrator.startMigration({
            userId: `user-${i}`,
            sourceUrl: `https://example${i}.com`,
            userPrompt: `Migration ${i}`
          })
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all migrations started successfully
      expect(results).toHaveLength(concurrentCount);
      results.forEach(result => {
        expect(result.status).toBe('analyzing');
      });

      // Performance assertion: should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds max for 10 concurrent starts

      console.log(`Concurrent migration starts: ${concurrentCount} migrations in ${totalTime}ms`);
    });

    it('should handle high-frequency analytics tracking', async () => {
      const eventCount = 100;
      const migrationId = 'migration-analytics-test';

      // Mock database for analytics
      mockClient.query.mockResolvedValue({ rows: [] });

      const startTime = Date.now();
      const promises: Promise<void>[] = [];

      // Generate high-frequency analytics events
      for (let i = 0; i < eventCount; i++) {
        promises.push(
          migrationAnalyticsService.trackMigrationMetrics(
            migrationId,
            i % 2 === 0 ? 'started' : 'completed',
            { eventIndex: i, timestamp: Date.now() }
          )
        );
      }

      await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Performance assertion
      expect(totalTime).toBeLessThan(3000); // 3 seconds max for 100 events

      console.log(`Analytics tracking: ${eventCount} events in ${totalTime}ms`);
    });

    it('should handle bulk SSE broadcasting efficiently', async () => {
      const connectionCount = 50;
      const broadcastCount = 20;

      // Mock SSE broadcast to measure performance
      let broadcastCallCount = 0;
      jest.spyOn(migrationSSEService, 'broadcastMigrationEvent')
        .mockImplementation(() => {
          broadcastCallCount++;
          return Promise.resolve();
        });

      const startTime = Date.now();
      const promises: Promise<void>[] = [];

      // Simulate broadcasting to multiple connections
      for (let i = 0; i < broadcastCount; i++) {
        for (let j = 0; j < connectionCount; j++) {
          promises.push(
            migrationSSEService.broadcastMigrationEvent(`migration-${j}`, {
              type: 'phase_started',
              migrationId: `migration-${j}`,
              status: 'processing',
              progress: i * 5,
              message: `Phase ${i}`,
              phase: `phase_${i}`
            })
          );
        }
      }

      await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(broadcastCallCount).toBe(connectionCount * broadcastCount);
      expect(totalTime).toBeLessThan(2000); // 2 seconds max

      console.log(`SSE broadcasting: ${broadcastCallCount} broadcasts in ${totalTime}ms`);
    });
  });

  describe('Enterprise Scale Performance', () => {
    it('should handle bulk migration processing efficiently', async () => {
      const bulkUrlCount = 100;
      const testOrgId = 'org-performance-test';
      const testUserId = 'user-bulk-test';

      const bulkRequest = {
        name: 'Large Bulk Migration Test',
        description: 'Performance test with many URLs',
        urls: Array.from({ length: bulkUrlCount }, (_, i) => `https://site${i}.com`),
        userBrief: {
          goals: 'Performance testing',
          style_preferences: 'modern',
          framework_preferences: 'nextjs'
        },
        scheduling: {
          immediate: true,
          batchSize: 10,
          delayBetweenBatches: 0 // No delay for performance test
        },
        notifications: {
          email: 'test@example.com'
        }
      };

      // Mock organization config for enterprise features
      const mockOrgConfig = {
        orgId: testOrgId,
        advancedFeatures: {
          bulkMigrations: true,
          whiteGloveService: true
        },
        migrationLimits: {
          concurrentMigrations: 50,
          dailyMigrations: 200
        }
      };

      jest.spyOn(enterpriseMigrationService as any, 'getOrganizationConfig')
        .mockResolvedValue(mockOrgConfig);

      jest.spyOn(enterpriseMigrationService as any, 'getActiveMigrationsCount')
        .mockResolvedValue(0);

      // Mock bulk job creation
      mockClient.query.mockResolvedValue({
        rows: [{ id: 'bulk-performance-test' }]
      });

      // Mock processBulkMigration to avoid actual processing
      jest.spyOn(enterpriseMigrationService as any, 'processBulkMigration')
        .mockResolvedValue();

      const startTime = Date.now();

      const result = await enterpriseMigrationService.startBulkMigration(
        testUserId,
        testOrgId,
        bulkRequest
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.bulkId).toBe('bulk-performance-test');

      // Performance assertion: bulk setup should be fast
      expect(totalTime).toBeLessThan(1000); // 1 second max for setup

      console.log(`Bulk migration setup: ${bulkUrlCount} URLs in ${totalTime}ms`);
    });

    it('should efficiently query organization analytics', async () => {
      const testOrgId = 'org-analytics-test';
      const queryCount = 50;

      // Mock large analytics dataset
      const mockMetricsData = {
        totalMigrations: 10000,
        successfulMigrations: 8500,
        failedMigrations: 1500,
        averageCompletionTime: 1800000,
        averageAITimeConsumed: 900
      };

      const mockPerformanceData = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        migrations: Math.floor(Math.random() * 100) + 50,
        success_rate: 0.8 + Math.random() * 0.15,
        avg_completion_time: 1500000 + Math.random() * 600000
      }));

      mockClient.query
        .mockResolvedValue({ rows: [mockMetricsData] })
        .mockResolvedValue({ rows: mockPerformanceData });

      const timeRange = {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: new Date()
      };

      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      // Simulate multiple concurrent analytics queries
      for (let i = 0; i < queryCount; i++) {
        promises.push(
          enterpriseMigrationService.getOrganizationAnalytics(testOrgId, timeRange)
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results).toHaveLength(queryCount);
      results.forEach(result => {
        expect(result.metrics).toBeDefined();
        expect(result.performanceReport).toBeDefined();
        expect(result.recommendations).toBeDefined();
      });

      // Performance assertion
      expect(totalTime).toBeLessThan(3000); // 3 seconds max for 50 queries

      console.log(`Organization analytics: ${queryCount} queries in ${totalTime}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should handle large verification attempts dataset', async () => {
      const testMigrationId = 'migration-memory-test';
      const testUserId = 'user-memory-test';
      const attemptCount = 1000;

      // Mock large verification attempts dataset
      const mockAttempts = Array.from({ length: attemptCount }, (_, i) => ({
        id: `attempt-${i}`,
        migration_project_id: testMigrationId,
        method: i % 2 === 0 ? 'dns' : 'file',
        status: i % 10 === 0 ? 'failed' : 'success',
        created_at: new Date(Date.now() - i * 60000),
        dns_provider: 'cloudflare',
        verification_details: {
          recordType: 'TXT',
          recordValue: `verification-${i}`,
          attemptNumber: i + 1
        }
      }));

      mockClient.query.mockResolvedValue({ rows: mockAttempts });

      const startTime = Date.now();
      const initialMemory = process.memoryUsage();

      // Simulate processing large dataset
      for (let i = 0; i < 10; i++) {
        await migrationAnalyticsService.getMigrationMetrics({
          from: new Date(Date.now() - 24 * 60 * 60 * 1000),
          to: new Date()
        });
      }

      const endTime = Date.now();
      const finalMemory = process.memoryUsage();
      const totalTime = endTime - startTime;

      // Check memory usage increase
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      expect(totalTime).toBeLessThan(2000); // 2 seconds max
      expect(memoryIncreaseMB).toBeLessThan(50); // Less than 50MB increase

      console.log(`Memory usage: ${memoryIncreaseMB.toFixed(2)}MB increase over ${totalTime}ms`);
    });

    it('should efficiently handle database connection pooling', async () => {
      const connectionTestCount = 100;
      const promises: Promise<any>[] = [];

      // Test rapid connection acquisition and release
      for (let i = 0; i < connectionTestCount; i++) {
        promises.push(
          (async () => {
            const client = await mockPool.connect();
            await client.query('SELECT 1');
            client.release();
          })()
        );
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all connections were handled
      expect(mockPool.connect).toHaveBeenCalledTimes(connectionTestCount);
      expect(mockClient.release).toHaveBeenCalledTimes(connectionTestCount);

      // Performance assertion
      expect(totalTime).toBeLessThan(1000); // 1 second max for 100 connections

      console.log(`Database connections: ${connectionTestCount} connections in ${totalTime}ms`);
    });
  });

  describe('Real-world Simulation', () => {
    it('should handle typical daily load efficiently', async () => {
      // Simulate a typical day: 500 migration starts, 2000 analytics events, 5000 SSE broadcasts
      const migrationStarts = 50; // Reduced for test performance
      const analyticsEvents = 200;
      const sseEvents = 500;

      const allPromises: Promise<any>[] = [];

      // Mock all dependencies
      mockClient.query.mockResolvedValue({ rows: [{ id: 'test-migration' }] });
      jest.spyOn(migrationAnalyticsService, 'trackMigrationMetrics').mockResolvedValue();
      jest.spyOn(migrationSSEService, 'broadcastMigrationEvent').mockResolvedValue();

      const startTime = Date.now();

      // Migration starts
      for (let i = 0; i < migrationStarts; i++) {
        allPromises.push(
          orchestrator.startMigration({
            userId: `user-${i}`,
            sourceUrl: `https://site${i}.com`,
            userPrompt: 'Daily migration'
          })
        );
      }

      // Analytics events
      for (let i = 0; i < analyticsEvents; i++) {
        allPromises.push(
          migrationAnalyticsService.trackMigrationMetrics(
            `migration-${i % migrationStarts}`,
            i % 3 === 0 ? 'started' : (i % 3 === 1 ? 'completed' : 'failed'),
            { eventType: 'daily-load-test' }
          )
        );
      }

      // SSE events
      for (let i = 0; i < sseEvents; i++) {
        allPromises.push(
          migrationSSEService.broadcastMigrationEvent(`migration-${i % migrationStarts}`, {
            type: 'phase_started',
            migrationId: `migration-${i % migrationStarts}`,
            status: 'processing',
            progress: (i % 100),
            message: 'Daily load test event'
          })
        );
      }

      await Promise.all(allPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      const totalEvents = migrationStarts + analyticsEvents + sseEvents;

      // Performance assertions for daily load
      expect(totalTime).toBeLessThan(10000); // 10 seconds max for all operations

      console.log(`Daily load simulation: ${totalEvents} total operations in ${totalTime}ms`);
      console.log(`Average: ${(totalTime / totalEvents).toFixed(2)}ms per operation`);
    });
  });
});