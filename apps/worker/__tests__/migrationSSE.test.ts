/**
 * SSE (Server-Sent Events) Tests for Migration System
 * Tests real-time communication and event broadcasting
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { migrationSSEService } from '../src/services/migrationSSEService';

// Mock Fastify reply object
const createMockReply = () => ({
  raw: {
    writeHead: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn()
  },
  hijack: jest.fn(),
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
});

describe('Migration SSE Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any existing connections
    (migrationSSEService as any).connections?.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('SSE Connection Management', () => {
    it('should establish SSE connection properly', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-sse-test';
      const userId = 'user-123';

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, userId);

      // Verify SSE headers were set
      expect(mockReply.raw.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Verify connection was registered
      const connections = (migrationSSEService as any).connections;
      expect(connections.has(migrationId)).toBe(true);
    });

    it('should handle connection cleanup on client disconnect', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-cleanup-test';
      const userId = 'user-123';

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, userId);

      // Verify disconnect handler was registered
      expect(mockReply.raw.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockReply.raw.on).toHaveBeenCalledWith('error', expect.any(Function));

      // Simulate disconnect
      const closeHandler = mockReply.raw.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler();
      }

      // Verify connection was cleaned up
      const connections = (migrationSSEService as any).connections;
      expect(connections.has(migrationId)).toBe(false);
    });

    it('should support multiple concurrent connections for same migration', async () => {
      const migrationId = 'migration-multi-test';
      const connectionCount = 5;
      const mockReplies = Array.from({ length: connectionCount }, () => createMockReply());

      // Establish multiple connections
      for (let i = 0; i < connectionCount; i++) {
        await migrationSSEService.handleMigrationSSE(mockReplies[i], migrationId, `user-${i}`);
      }

      // Verify all connections are tracked
      const connections = (migrationSSEService as any).connections;
      expect(connections.has(migrationId)).toBe(true);

      const migrationConnections = connections.get(migrationId);
      expect(migrationConnections.size).toBe(connectionCount);
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast events to all connected clients', async () => {
      const migrationId = 'migration-broadcast-test';
      const connectionCount = 3;
      const mockReplies = Array.from({ length: connectionCount }, () => createMockReply());

      // Establish connections
      for (let i = 0; i < connectionCount; i++) {
        await migrationSSEService.handleMigrationSSE(mockReplies[i], migrationId, `user-${i}`);
      }

      const testEvent = {
        type: 'phase_started',
        migrationId,
        status: 'processing',
        progress: 25,
        message: 'Starting content extraction',
        phase: 'content_extraction'
      };

      // Broadcast event
      await migrationSSEService.broadcastMigrationEvent(migrationId, testEvent);

      // Verify all connections received the event
      mockReplies.forEach(reply => {
        expect(reply.raw.write).toHaveBeenCalledWith(
          expect.stringContaining(`data: ${JSON.stringify(testEvent)}`)
        );
      });
    });

    it('should handle event serialization correctly', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-serialize-test';

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, 'user-123');

      const complexEvent = {
        type: 'verification_completed',
        migrationId,
        status: 'processing',
        progress: 15,
        message: 'Domain verification successful',
        metadata: {
          verificationMethod: 'dns',
          provider: 'cloudflare',
          timestamp: new Date().toISOString(),
          details: {
            recordType: 'TXT',
            recordValue: 'sheenapps-verify=token123'
          }
        }
      };

      await migrationSSEService.broadcastMigrationEvent(migrationId, complexEvent);

      // Verify proper SSE formatting
      expect(mockReply.raw.write).toHaveBeenCalledWith(
        expect.stringMatching(/^data: .*\n\n$/)
      );

      const writeCall = mockReply.raw.write.mock.calls[0][0];
      const eventData = writeCall.replace('data: ', '').replace('\n\n', '');
      const parsedEvent = JSON.parse(eventData);

      expect(parsedEvent).toEqual(complexEvent);
    });

    it('should handle broadcasting to non-existent migration gracefully', async () => {
      const nonExistentMigrationId = 'migration-nonexistent';
      const testEvent = {
        type: 'phase_started',
        migrationId: nonExistentMigrationId,
        status: 'processing',
        progress: 0,
        message: 'Test event'
      };

      // Should not throw error
      await expect(
        migrationSSEService.broadcastMigrationEvent(nonExistentMigrationId, testEvent)
      ).resolves.toBeUndefined();
    });
  });

  describe('Backfill and Recovery', () => {
    it('should handle lastEventId for event backfill', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-backfill-test';
      const userId = 'user-123';
      const lastEventId = '1704067200000'; // Timestamp

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, userId, lastEventId);

      // Verify SSE connection was established
      expect(mockReply.raw.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      // Verify backfill was attempted (would query database in real implementation)
      expect(mockReply.hijack).toHaveBeenCalled();
    });

    it('should send heartbeat to keep connection alive', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-heartbeat-test';

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, 'user-123');

      // Wait a bit to allow heartbeat
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify heartbeat was sent (comment format)
      expect(mockReply.raw.write).toHaveBeenCalledWith(': heartbeat\n\n');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed events gracefully', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-error-test';

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, 'user-123');

      // Create an event with circular reference (should cause JSON.stringify to fail)
      const circularEvent: any = {
        type: 'test_event',
        migrationId,
        status: 'processing'
      };
      circularEvent.circular = circularEvent;

      // Should handle the error gracefully
      await expect(
        migrationSSEService.broadcastMigrationEvent(migrationId, circularEvent)
      ).resolves.toBeUndefined();

      // Connection should still be alive
      const connections = (migrationSSEService as any).connections;
      expect(connections.has(migrationId)).toBe(true);
    });

    it('should handle connection write errors', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-write-error-test';

      // Make write throw an error
      mockReply.raw.write.mockImplementation(() => {
        throw new Error('Connection broken');
      });

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, 'user-123');

      const testEvent = {
        type: 'test_event',
        migrationId,
        status: 'processing',
        progress: 0,
        message: 'Test'
      };

      // Should handle write error gracefully
      await expect(
        migrationSSEService.broadcastMigrationEvent(migrationId, testEvent)
      ).resolves.toBeUndefined();
    });

    it('should clean up failed connections automatically', async () => {
      const mockReply = createMockReply();
      const migrationId = 'migration-cleanup-error-test';

      // Make write fail consistently
      mockReply.raw.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      await migrationSSEService.handleMigrationSSE(mockReply, migrationId, 'user-123');

      const testEvent = {
        type: 'test_event',
        migrationId,
        status: 'processing',
        progress: 0,
        message: 'Test'
      };

      // Broadcast should trigger cleanup of failed connection
      await migrationSSEService.broadcastMigrationEvent(migrationId, testEvent);

      // Verify connection was cleaned up
      const connections = (migrationSSEService as any).connections;
      expect(connections.has(migrationId)).toBe(false);
    });
  });

  describe('Performance under Load', () => {
    it('should handle rapid event broadcasting efficiently', async () => {
      const migrationId = 'migration-performance-test';
      const connectionCount = 10;
      const eventCount = 100;

      const mockReplies = Array.from({ length: connectionCount }, () => createMockReply());

      // Establish connections
      for (let i = 0; i < connectionCount; i++) {
        await migrationSSEService.handleMigrationSSE(mockReplies[i], migrationId, `user-${i}`);
      }

      const startTime = Date.now();

      // Broadcast many events rapidly
      const promises = [];
      for (let i = 0; i < eventCount; i++) {
        promises.push(
          migrationSSEService.broadcastMigrationEvent(migrationId, {
            type: 'progress_update',
            migrationId,
            status: 'processing',
            progress: i,
            message: `Progress ${i}%`
          })
        );
      }

      await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all events were sent to all connections
      mockReplies.forEach(reply => {
        expect(reply.raw.write).toHaveBeenCalledTimes(eventCount + 1); // +1 for heartbeat
      });

      // Performance assertion
      expect(totalTime).toBeLessThan(1000); // 1 second max for 100 events to 10 connections

      console.log(`SSE Performance: ${eventCount} events to ${connectionCount} connections in ${totalTime}ms`);
    });

    it('should handle connection scaling efficiently', async () => {
      const migrationIds = Array.from({ length: 50 }, (_, i) => `migration-scale-${i}`);
      const connectionsPerMigration = 5;

      const startTime = Date.now();

      // Create many connections across multiple migrations
      for (const migrationId of migrationIds) {
        for (let i = 0; i < connectionsPerMigration; i++) {
          const mockReply = createMockReply();
          await migrationSSEService.handleMigrationSSE(mockReply, migrationId, `user-${i}`);
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const totalConnections = migrationIds.length * connectionsPerMigration;

      // Verify all connections were established
      const connections = (migrationSSEService as any).connections;
      expect(connections.size).toBe(migrationIds.length);

      // Performance assertion
      expect(totalTime).toBeLessThan(2000); // 2 seconds max for 250 connections

      console.log(`SSE Scaling: ${totalConnections} connections in ${totalTime}ms`);
    });
  });
});