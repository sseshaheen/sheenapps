/**
 * Test suite for Rollback Event handling
 * Verifies that our frontend properly handles rollback event codes
 */

import { formatBuildEvent, isStructuredEvent, getEventProgress } from '@/utils/format-build-events';
import type { CleanBuildEvent } from '@/types/build-events';

describe('Rollback Event Handling', () => {
  const mockTranslations = {
    builder: {
      buildEvents: {
        'ROLLBACK_STARTED': 'Rollback process started',
        'ROLLBACK_VALIDATING': 'Validating target version',
        'ROLLBACK_ARTIFACT_DOWNLOADING': 'Downloading rollback artifacts',
        'ROLLBACK_WORKING_DIR_SYNCING': 'Syncing working directory',
        'ROLLBACK_PREVIEW_UPDATING': 'Updating preview URL',
        'ROLLBACK_COMPLETED': 'Rollback completed successfully',
        'ROLLBACK_FAILED': 'Rollback failed: {reason}'
      }
    }
  };

  describe('Rollback Event Formatting', () => {
    it('formats ROLLBACK_STARTED event', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_1',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 0,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_STARTED',
        params: {
          targetVersionId: 'v1.2.3',
          projectId: 'proj_123'
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBeDefined();
      expect(result.description).toBe('Rollback process started');
    });

    it('formats ROLLBACK_VALIDATING with version info', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_2',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 10,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_VALIDATING',
        params: {
          targetVersionId: 'v1.2.3',
          confidence: 0.95
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toContain('Validating');
      expect(result.description).toBe('Validating target version');
    });

    it('formats ROLLBACK_ARTIFACT_DOWNLOADING with progress', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_3',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 30,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_ARTIFACT_DOWNLOADING',
        params: {
          artifactSize: 1024000,
          progress: 0.3
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      const progress = getEventProgress(mockEvent);
      
      expect(result.description).toBe('Downloading rollback artifacts');
      expect(progress).toBe(30); // 0.3 * 100
    });

    it('formats ROLLBACK_WORKING_DIR_SYNCING', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_4',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 60,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_WORKING_DIR_SYNCING',
        params: {
          workingDirSynced: false
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toBe('Syncing working directory');
    });

    it('formats ROLLBACK_PREVIEW_UPDATING', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_5',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 80,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_PREVIEW_UPDATING',
        params: {
          url: 'https://preview.example.com',
          previewUrlUpdated: false
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toBe('Updating preview URL');
    });

    it('formats ROLLBACK_COMPLETED successfully', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_6',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 100,
        finished: true,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_COMPLETED',
        params: {
          targetVersionId: 'v1.2.3',
          rollbackVersionId: 'v1.2.4',
          duration: 45,
          preview_url: 'https://preview.example.com'
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toBe('Rollback completed successfully');
      expect(isStructuredEvent(mockEvent)).toBe(true);
    });

    it('formats ROLLBACK_FAILED with reason and recovery info', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_fail',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 60,
        finished: true,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_FAILED',
        params: {
          reason: 'Version artifacts not found',
          phase: 'downloading',
          recoverable: true,
          duration: 30
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toBe('Rollback failed: Version artifacts not found');
    });

    it('handles ROLLBACK_FAILED without reason param', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_rollback_fail2',
        build_id: 'bld_456',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 60,
        finished: true,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_FAILED',
        params: {
          phase: 'syncing',
          recoverable: false
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      // Should handle missing reason gracefully
      expect(result.description).toBe('Rollback failed: {reason}');
    });
  });

  describe('Rollback Event Title Generation', () => {
    it('generates proper titles from rollback event codes', () => {
      const testCases = [
        { code: 'ROLLBACK_STARTED', expected: 'Started' },
        { code: 'ROLLBACK_VALIDATING', expected: 'Validating' },
        { code: 'ROLLBACK_ARTIFACT_DOWNLOADING', expected: 'Artifact Downloading' },
        { code: 'ROLLBACK_WORKING_DIR_SYNCING', expected: 'Working Dir Syncing' },
        { code: 'ROLLBACK_PREVIEW_UPDATING', expected: 'Preview Updating' },
        { code: 'ROLLBACK_COMPLETED', expected: 'Completed' },
        { code: 'ROLLBACK_FAILED', expected: 'Failed' }
      ];

      testCases.forEach(({ code, expected }) => {
        const mockEvent: CleanBuildEvent = {
          code,
          params: {}
        } as any;

        const result = formatBuildEvent(mockEvent, mockTranslations);
        expect(result.title).toBe(expected);
      });
    });
  });

  describe('Complete Rollback Flow', () => {
    it('handles complete rollback sequence', () => {
      const rollbackSequence: CleanBuildEvent[] = [
        {
          id: '1',
          build_id: 'rollback_123',
          event_type: 'rollback',
          phase: 'rollback',
          overall_progress: 0,
          finished: false,
          created_at: new Date().toISOString(),
          code: 'ROLLBACK_STARTED',
          params: { targetVersionId: 'v1.2.3' }
        },
        {
          id: '2',
          build_id: 'rollback_123',
          event_type: 'rollback',
          phase: 'rollback',
          overall_progress: 20,
          finished: false,
          created_at: new Date().toISOString(),
          code: 'ROLLBACK_VALIDATING',
          params: { targetVersionId: 'v1.2.3' }
        },
        {
          id: '3',
          build_id: 'rollback_123',
          event_type: 'rollback',
          phase: 'rollback',
          overall_progress: 40,
          finished: false,
          created_at: new Date().toISOString(),
          code: 'ROLLBACK_ARTIFACT_DOWNLOADING',
          params: { artifactSize: 2048000, progress: 0.4 }
        },
        {
          id: '4',
          build_id: 'rollback_123',
          event_type: 'rollback',
          phase: 'rollback',
          overall_progress: 60,
          finished: false,
          created_at: new Date().toISOString(),
          code: 'ROLLBACK_WORKING_DIR_SYNCING',
          params: { workingDirSynced: false }
        },
        {
          id: '5',
          build_id: 'rollback_123',
          event_type: 'rollback',
          phase: 'rollback',
          overall_progress: 80,
          finished: false,
          created_at: new Date().toISOString(),
          code: 'ROLLBACK_PREVIEW_UPDATING',
          params: { previewUrlUpdated: false }
        },
        {
          id: '6',
          build_id: 'rollback_123',
          event_type: 'rollback',
          phase: 'rollback',
          overall_progress: 100,
          finished: true,
          created_at: new Date().toISOString(),
          code: 'ROLLBACK_COMPLETED',
          params: {
            targetVersionId: 'v1.2.3',
            rollbackVersionId: 'v1.2.4',
            duration: 45,
            preview_url: 'https://preview.example.com'
          }
        }
      ] as any[];

      // All events should be formattable
      rollbackSequence.forEach(event => {
        const result = formatBuildEvent(event, mockTranslations);
        expect(result.title).toBeDefined();
        expect(result.description).toBeDefined();
        expect(result.description).not.toContain('{'); // No uninterpolated params
      });

      // Check progress increases
      const progressValues = rollbackSequence.map(e => e.overall_progress);
      expect(progressValues).toEqual([0, 20, 40, 60, 80, 100]);
    });

    it('handles failed rollback sequence with recovery', () => {
      const failedRollback: CleanBuildEvent = {
        id: 'fail_1',
        build_id: 'rollback_fail',
        event_type: 'rollback',
        phase: 'rollback',
        overall_progress: 40,
        finished: true,
        created_at: new Date().toISOString(),
        code: 'ROLLBACK_FAILED',
        params: {
          reason: 'Network timeout during artifact download',
          phase: 'downloading',
          recoverable: true,
          targetVersionId: 'v1.2.3'
        },
        error: {
          code: 'ROLLBACK_FAILED',
          params: {
            reason: 'Network timeout during artifact download',
            recoverable: true
          }
        }
      } as any;

      const result = formatBuildEvent(failedRollback, mockTranslations);
      
      expect(result.description).toContain('Network timeout');
      expect(failedRollback.params.recoverable).toBe(true);
      expect(failedRollback.error).toBeDefined();
    });
  });

  describe('Rollback Event Parameters', () => {
    it('handles all documented rollback parameters', () => {
      const mockEvent: CleanBuildEvent = {
        code: 'ROLLBACK_FAILED',
        params: {
          reason: 'Test reason',
          duration: 120,
          phase: 'validating' as any,
          targetVersionId: 'v1.0.0',
          recoverable: true,
          // Additional common params
          projectId: 'proj_123',
          userId: 'user_456',
          timestamp: Date.now()
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toContain('Test reason');
      expect(mockEvent.params.phase).toBe('validating');
      expect(mockEvent.params.recoverable).toBe(true);
    });
  });
});

console.log('✅ All rollback event tests defined');
console.log('📝 These tests verify compatibility with rollback events');
console.log('🚀 Ready for rollback UI flows testing');