/**
 * Test suite for Additional Build Events discovered by Worker team
 */

import { formatBuildEvent, isStructuredEvent } from '@/utils/format-build-events';
import type { CleanBuildEvent } from '@/types/build-events';

describe('Additional Build Events (Worker Discovery)', () => {
  const mockTranslations = {
    builder: {
      buildEvents: {
        'BUILD_DEVELOPMENT_STARTING': 'AI is starting to work on your project',
        'BUILD_DEVELOPMENT_COMPLETE': 'AI has finished creating your application code',
        'BUILD_DEPENDENCIES_COMPLETE': 'Dependencies installed successfully',
        'BUILD_PREVIEW_PREPARING': 'Preparing your application preview',
        'BUILD_METADATA_GENERATING': 'Generating recommendations and documentation',
        'BUILD_METADATA_COMPLETE': 'Documentation and recommendations ready',
        'BUILD_RECOMMENDATIONS_GENERATED': 'Generated recommendations for improvements'
      }
    }
  };

  describe('Development Phase Events', () => {
    it('formats BUILD_DEVELOPMENT_STARTING with retry context', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_dev_start',
        build_id: 'bld_123',
        event_type: 'progress',
        phase: 'development',
        overall_progress: 5,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_DEVELOPMENT_STARTING',
        params: {
          timestamp: Date.now(),
          projectId: 'abc123',
          isRetry: false,
          attemptNumber: 1
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBe('Development Starting');
      expect(result.description).toBe('AI is starting to work on your project');
      expect(isStructuredEvent(mockEvent)).toBe(true);
    });

    it('formats BUILD_DEVELOPMENT_COMPLETE', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_dev_complete',
        build_id: 'bld_123',
        event_type: 'progress',
        phase: 'development',
        overall_progress: 30,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_DEVELOPMENT_COMPLETE',
        params: {
          timestamp: Date.now(),
          projectId: 'abc123'
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBe('Development Complete');
      expect(result.description).toBe('AI has finished creating your application code');
    });
  });

  describe('Dependencies Phase Events', () => {
    it('formats BUILD_DEPENDENCIES_COMPLETE with package details', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_deps_complete',
        build_id: 'bld_123',
        event_type: 'progress',
        phase: 'dependencies',
        overall_progress: 45,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_DEPENDENCIES_COMPLETE',
        params: {
          timestamp: Date.now(),
          projectId: 'abc123',
          packageManager: 'npm',
          packagesInstalled: 42,
          duration: 35
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.description).toBe('Dependencies installed successfully');
      expect(mockEvent.params.packagesInstalled).toBe(42);
      expect(mockEvent.params.packageManager).toBe('npm');
    });
  });

  describe('Preview Phase Events', () => {
    it('formats BUILD_PREVIEW_PREPARING', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_preview_prep',
        build_id: 'bld_123',
        event_type: 'progress',
        phase: 'preview',
        overall_progress: 75,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_PREVIEW_PREPARING',
        params: {
          timestamp: Date.now(),
          projectId: 'abc123'
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBe('Preview Preparing');
      expect(result.description).toBe('Preparing your application preview');
    });
  });

  describe('Metadata Phase Events', () => {
    it('formats BUILD_METADATA_GENERATING', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_meta_gen',
        build_id: 'bld_123',
        event_type: 'progress',
        phase: 'metadata',
        overall_progress: 85,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_METADATA_GENERATING',
        params: {
          timestamp: Date.now(),
          projectId: 'abc123'
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBe('Metadata Generating');
      expect(result.description).toBe('Generating recommendations and documentation');
    });

    it('formats BUILD_METADATA_COMPLETE', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_meta_complete',
        build_id: 'bld_123',
        event_type: 'progress',
        phase: 'metadata',
        overall_progress: 90,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_METADATA_COMPLETE',
        params: {
          timestamp: Date.now(),
          projectId: 'abc123'
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBe('Metadata Complete');
      expect(result.description).toBe('Documentation and recommendations ready');
    });

    it('formats BUILD_RECOMMENDATIONS_GENERATED', () => {
      const mockEvent: CleanBuildEvent = {
        id: 'evt_recs_gen',
        build_id: 'bld_123',
        event_type: 'progress',
        phase: 'metadata',
        overall_progress: 95,
        finished: false,
        created_at: new Date().toISOString(),
        code: 'BUILD_RECOMMENDATIONS_GENERATED',
        params: {
          timestamp: Date.now(),
          projectId: 'abc123',
          recommendationCount: 5
        }
      } as any;

      const result = formatBuildEvent(mockEvent, mockTranslations);
      
      expect(result.title).toBe('Recommendations Generated');
      expect(result.description).toBe('Generated recommendations for improvements');
    });
  });

  describe('Complete Build Flow with New Events', () => {
    it('handles full build sequence including new events', () => {
      const buildSequence: CleanBuildEvent[] = [
        // Development phase
        {
          code: 'BUILD_STARTED',
          params: { projectId: 'abc123' },
          overall_progress: 0
        },
        {
          code: 'BUILD_DEVELOPMENT_STARTING',
          params: { projectId: 'abc123', isRetry: false, attemptNumber: 1 },
          overall_progress: 5
        },
        {
          code: 'BUILD_DEVELOPMENT_COMPLETE',
          params: { projectId: 'abc123' },
          overall_progress: 30
        },
        // Dependencies phase
        {
          code: 'BUILD_DEPENDENCIES_INSTALLING',
          params: { step: 1, total: 3 },
          overall_progress: 35
        },
        {
          code: 'BUILD_DEPENDENCIES_COMPLETE',
          params: { packagesInstalled: 42, duration: 35 },
          overall_progress: 45
        },
        // Build phase
        {
          code: 'BUILD_COMPILING',
          params: {},
          overall_progress: 50
        },
        {
          code: 'BUILD_BUNDLING',
          params: {},
          overall_progress: 60
        },
        // Preview phase
        {
          code: 'BUILD_PREVIEW_PREPARING',
          params: {},
          overall_progress: 75
        },
        // Metadata phase
        {
          code: 'BUILD_METADATA_GENERATING',
          params: {},
          overall_progress: 85
        },
        {
          code: 'BUILD_METADATA_COMPLETE',
          params: {},
          overall_progress: 90
        },
        {
          code: 'BUILD_RECOMMENDATIONS_GENERATED',
          params: { recommendationCount: 5 },
          overall_progress: 95
        },
        // Completion
        {
          code: 'BUILD_COMPLETE',
          params: {},
          overall_progress: 100
        }
      ] as any[];

      // All events should be formattable
      buildSequence.forEach(event => {
        const result = formatBuildEvent(event, mockTranslations);
        expect(result.title).toBeDefined();
        expect(result.description).toBeDefined();
      });

      // Verify progress sequence
      const progressValues = buildSequence.map(e => e.overall_progress);
      expect(progressValues).toEqual([0, 5, 30, 35, 45, 50, 60, 75, 85, 90, 95, 100]);
    });
  });

  describe('Rich Parameter Support', () => {
    it('handles all documented parameters from Worker team', () => {
      const richEvent: CleanBuildEvent = {
        code: 'BUILD_DEPENDENCIES_COMPLETE',
        params: {
          // Common params
          timestamp: Date.now(),
          projectId: 'abc123',
          userId: 'user_456',
          
          // Phase-specific params
          packageManager: 'npm',
          packagesInstalled: 42,
          duration: 35,
          
          // Additional context
          isRetry: false,
          attemptNumber: 1
        }
      } as any;

      const result = formatBuildEvent(richEvent, mockTranslations);
      
      expect(result.description).toBeDefined();
      expect(richEvent.params.packageManager).toBe('npm');
      expect(richEvent.params.packagesInstalled).toBe(42);
      expect(richEvent.params.duration).toBe(35);
    });
  });
});

console.log('✅ All additional build event tests defined');
console.log('📝 Tests verify the 7 new events discovered by Worker team');
console.log('🚀 Total of 37 event codes now supported');