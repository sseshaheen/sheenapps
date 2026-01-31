/**
 * Server-Side Build Events Publisher
 * Handles publishing build events from API routes using service role
 * Bypasses RLS policies - server has full access
 * 
 * ⚠️ SERVER-SIDE ONLY - Do not import in client code
 */

// Runtime guard: Prevent accidental client-side usage
if (typeof window !== 'undefined') {
  throw new Error('build-events-publisher is server-side only. Use BuildEventsRealtimeService for client-side subscriptions.')
}

import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'

export interface BuildEventData {
  status?: string;
  progress?: number;
  message?: string;
  error?: string;
  previewUrl?: string;
  completedAt?: string;
  queuePosition?: number;
  estimatedTime?: string;
  // Additional build metadata
  projectId?: string;
  userId?: string;
  workerInfo?: {
    workerId: string;
    region: string;
  };
  // Enhanced observability for server-generated IDs
  serverGenerated?: boolean;
  idGenerationSource?: 'client' | 'server';
  createdByService?: string;
}

export type BuildEventType = 
  | 'queued' 
  | 'started' 
  | 'progress' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

/**
 * Publish a build event from server-side code
 * Uses service role to bypass RLS policies
 */
export async function publishBuildEvent(
  buildId: string,
  eventType: BuildEventType,
  eventData: BuildEventData,
  userId: string,
  options?: {
    skipLogging?: boolean;
  }
): Promise<{ success: boolean; eventId?: number; error?: string }> {
  // Generate request ID for observability and debugging
  const requestId = crypto.randomUUID().slice(0, 8);
  
  try {
    if (!options?.skipLogging) {
      logger.info(`📤 [SERVER] Publishing build event:`, {
        requestId,
        buildId,
        eventType,
        userId: userId.slice(0, 8),
        hasEventData: !!eventData,
        projectId: eventData.projectId?.slice(0, 8) || 'none',
        // Enhanced observability attributes
        serverGenerated: eventData.serverGenerated,
        idGenerationSource: eventData.idGenerationSource,
        createdByService: eventData.createdByService || 'nextjs-api'
      });
    }

    // Use server Supabase client with service role
    const supabase = await createServerSupabaseClientNew();

    // TODO: Add proper types when project_build_events added to DB schema types
    // Technical debt: Using 'as any' because project_build_events table not in generated types
    const { data, error } = await (supabase as any)
      .from('project_build_events')
      .insert({
        build_id: buildId,
        event_type: eventType,
        event_data: eventData,
        user_id: userId,
      })
      .select('id')
      .single();

    if (error) {
      logger.error(`❌ [SERVER] Failed to publish build event:`, {
        requestId,
        buildId,
        eventType,
        error: error.message,
        code: error.code
      });
      return { success: false, error: error.message };
    }

    if (!options?.skipLogging) {
      logger.info(`✅ [SERVER] Build event published successfully:`, {
        requestId,
        buildId,
        eventType,
        eventId: data?.id,
        userId: userId.slice(0, 8)
      });
    }

    return { success: true, eventId: data?.id };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ [SERVER] Error publishing build event:`, {
      buildId,
      eventType,
      error: errorMessage
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Publish multiple build events in sequence
 * Useful for initial build setup (queued -> started)
 */
export async function publishBuildEvents(
  buildId: string,
  events: Array<{
    eventType: BuildEventType;
    eventData: BuildEventData;
  }>,
  userId: string
): Promise<{ success: boolean; publishedCount: number; errors: string[] }> {
  const results = [];
  const errors: string[] = [];

  logger.info(`📤 [SERVER] Publishing ${events.length} build events for: ${buildId}`);

  for (const event of events) {
    const result = await publishBuildEvent(
      buildId,
      event.eventType,
      event.eventData,
      userId,
      { skipLogging: true } // Avoid spam in logs
    );
    
    results.push(result);
    if (!result.success && result.error) {
      errors.push(`${event.eventType}: ${result.error}`);
    }
  }

  const publishedCount = results.filter(r => r.success).length;

  logger.info(`📊 [SERVER] Build events batch result:`, {
    buildId,
    total: events.length,
    published: publishedCount,
    failed: errors.length,
    userId: userId.slice(0, 8)
  });

  return {
    success: publishedCount > 0,
    publishedCount,
    errors
  };
}

/**
 * Health check for server-side build events publishing
 */
export async function testBuildEventsPublisher(): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClientNew();
    
    // Test basic connection with a simple query
    // TODO: Add proper types when project_build_events added to DB schema types
    // Technical debt: Using 'as any' because project_build_events table not in generated types
    const { error } = await (supabase as any)
      .from('project_build_events')
      .select('id')
      .limit(1);

    if (error) {
      logger.error('❌ [SERVER] Build events publisher health check failed:', error);
      return false;
    }

    logger.info('✅ [SERVER] Build events publisher health check passed');
    return true;

  } catch (error) {
    logger.error('❌ [SERVER] Build events publisher health check error:', error);
    return false;
  }
}