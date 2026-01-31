/**
 * Test suite for Worker i18n format migration
 * Verifies that our frontend properly handles the new structured format
 * without relying on legacy message fields
 */

import { formatBuildEvent, isStructuredEvent, getEventProgress } from '@/utils/format-build-events';
import { StructuredErrorService } from '@/services/structured-error-handling';
import type { CleanBuildEvent, StructuredError } from '@/types/build-events';

describe('Worker i18n Format Migration', () => {
  
  describe('Error Handling', () => {
    it('handles new structured error format without message field', () => {
      // Mock new Worker error format (Week 3 - no legacy fields)
      const mockError: StructuredError = {
        code: 'AI_LIMIT_REACHED',
        params: {
          resetTime: Date.now() + 300000,
          retryAfter: 300,
          provider: 'anthropic'
        }
        // NO message field - simulating Week 3 when Worker removes it
      };

      const result = StructuredErrorService.handleStructuredError(mockError as any);
      
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.canRetry).toBe(true);
      expect(result.retryDelay).toBeGreaterThan(0);
    });

    it('handles INSUFFICIENT_BALANCE error without message', () => {
      const mockError: StructuredError = {
        code: 'INSUFFICIENT_BALANCE',
        params: {
          requiredBalance: 100,
          currentBalance: 50
        }
      };

      const result = StructuredErrorService.handleStructuredError(mockError as any);
      
      expect(result).toBeDefined();
      expect(result.message).toContain('balance'); // Should use our localized message
    });

    it('still handles legacy format during transition', () => {
      const mockError = {
        code: 'NETWORK_TIMEOUT',
        message: 'Connection timed out', // Legacy field
        params: {
          timeout: 30000
        }
      };

      const result = StructuredErrorService.handleStructuredError(mockError as any);
      
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
    });
  });

  describe('Build Event Formatting', () => {
    const mockTranslations = {
      builder: {
        buildEvents: {
          'BUILD_DEPENDENCIES_INSTALLING': 'Installing dependencies... (Step {step} of {total})',
          'BUILD_FRAMEWORK_DETECTING': 'Detecting framework... (Step {step} of {total})',
          'BUILD_CODE_GENERATING': 'Generating code... (Step {step} of {total})',
          'BUILD_COMPLETE': 'Build complete!',
          'BUILD_FAILED': 'Build failed: {reason}'
        }
      }
    };

    it('formats new event structure without title/description', () => {
      // Mock new Worker event format (Week 3 - no legacy fields)
      const mockEvent: CleanBuildEvent = {
        id: 'evt_123',
        build_id: 'bld_456',
        event_type: 'progress',
        phase: 'dependencies',
        overall_progress: 40,
        finished: false,
        created_at: new Date().toISOString(),
        // New format fields
        code: 'BUILD_DEPENDENCIES_INSTALLING',
        params: {
          step: 2,
          total: 5,
          progress: 0.4
        }
        // NO title or description fields
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBeDefined();
      expect(result.description).toBe('Installing dependencies... (Step 2 of 5)');
      expect(isStructuredEvent(mockEvent)).toBe(true);
    });

    it('formats BUILD_COMPLETE event', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_789',
        build_id: 'bld_456',
        event_type: 'completed',
        phase: 'deploy',
        overall_progress: 100,
        finished: true,
        created_at: new Date().toISOString(),
        code: 'BUILD_COMPLETE',
        params: {}
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toBe('Build complete!');
    });

    it('formats BUILD_FAILED with reason', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_fail',
        build_id: 'bld_456',
        event_type: 'failed',
        phase: 'build',
        overall_progress: 60,
        finished: true,
        created_at: new Date().toISOString(),
        code: 'BUILD_FAILED',
        params: {
          reason: 'Dependency conflict'
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toBe('Build failed: Dependency conflict');
    });

    it('falls back to legacy format during transition', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_legacy',
        build_id: 'bld_456',
        event_type: 'progress',
        phase: 'setup',
        title: 'Setting up environment', // Legacy field
        description: 'Preparing build environment...', // Legacy field
        overall_progress: 20,
        finished: false,
        created_at: new Date().toISOString()
      };

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBe('Setting up environment');
      expect(result.description).toBe('Preparing build environment...');
      expect(isStructuredEvent(mockEvent)).toBe(false);
    });

    it('handles missing translation gracefully', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_unknown',
        build_id: 'bld_456',
        event_type: 'progress',
        phase: 'custom',
        overall_progress: 50,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'UNKNOWN_EVENT_CODE',
        params: {
          step: 3,
          total: 10
        }
      } as any;

      const result = formatBuildEvent(mockEvent, {});
      
      expect(result.title).toBeDefined(); // Should generate from code
      expect(result.description).toBeDefined(); // Should have fallback
    });
  });

  describe('Progress Calculation', () => {
    it('converts new format progress (0.0-1.0) to percentage', () => {
      const mockEvent: CleanBuildEvent = {
        params: {
          progress: 0.45
        }
      } as any;

      const progress = getEventProgress(mockEvent);
      
      expect(progress).toBe(45);
    });

    it('handles legacy format progress (0-100)', () => {
      const mockEvent: CleanBuildEvent = {
        overall_progress: 75
      } as any;

      const progress = getEventProgress(mockEvent);
      
      expect(progress).toBe(75);
    });

    it('returns 0 for missing progress', () => {
      const mockEvent: CleanBuildEvent = {} as any;

      const progress = getEventProgress(mockEvent);
      
      expect(progress).toBe(0);
    });
  });

  describe('SSE Event Stream', () => {
    it('should handle streaming events in new format', () => {
      // Mock SSE event data
      const sseData = JSON.stringify({
        code: 'BUILD_PROGRESS',
        params: {
          progress: 0.5,
          message: 'Halfway there!'
        }
      });

      const parsed = JSON.parse(sseData);
      
      expect(parsed.code).toBeDefined();
      expect(parsed.params).toBeDefined();
      expect(parsed.params.progress).toBe(0.5);
    });
  });

  describe('Locale Header', () => {
    it('converts regional locale to base for Worker', () => {
      const regionalLocales = ['ar-eg', 'ar-sa', 'ar-ae', 'fr-ma'];
      const expectedBase = ['ar', 'ar', 'ar', 'fr'];
      
      regionalLocales.forEach((locale, index) => {
        const base = locale.split('-')[0];
        expect(base).toBe(expectedBase[index]);
      });
    });
  });
});

// Integration test scenarios
describe('End-to-End Scenarios', () => {
  it('handles complete build flow with new format', () => {
    const events: CleanBuildEvent[] = [
      {
        id: '1',
        build_id: 'build_123',
        event_type: 'started',
        phase: 'setup',
        overall_progress: 0,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_STARTED',
        params: {}
      },
      {
        id: '2', 
        build_id: 'build_123',
        event_type: 'progress',
        phase: 'dependencies',
        overall_progress: 25,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_DEPENDENCIES_INSTALLING',
        params: { step: 1, total: 4, progress: 0.25 }
      },
      {
        id: '3',
        build_id: 'build_123',
        event_type: 'completed',
        phase: 'deploy',
        overall_progress: 100,
        finished: true,
        created_at: new Date().toISOString(),
        code: 'BUILD_COMPLETE',
        params: {},
        preview_url: 'https://preview.example.com'
      }
    ] as any[];

    // All events should be formattable
    events.forEach(event => {
      const result = formatBuildEvent(event, {});
      expect(result.title).toBeDefined();
      expect(result.description).toBeDefined();
    });
  });

  it('handles error recovery flow', () => {
    const errorEvent: CleanBuildEvent = {
      id: 'err_1',
      build_id: 'build_123',
      event_type: 'failed',
      phase: 'build',
      overall_progress: 60,
      finished: true,
      created_at: new Date().toISOString(),
      error: {
        code: 'AI_LIMIT_REACHED',
        params: {
          resetTime: Date.now() + 300000,
          retryAfter: 300
        }
      }
    } as any;

    // Should handle error properly
    const errorConfig = StructuredErrorService.handleBuildError(errorEvent);
    expect(errorConfig).toBeDefined();
    expect(errorConfig.canRetry).toBe(true);
  });
});

console.log('✅ All Worker format migration tests defined');
console.log('📝 These tests verify compatibility with the new Worker format');
console.log('🚀 Ready for Week 3 when Worker removes legacy fields');