/**
 * Preview Deployment Service
 * 
 * SERVER-ONLY MODULE - Do not import in client components
 */

import 'server-only';
import type {
  CreatePreviewRequest,
  InsufficientBalanceError,
  PreviewDeploymentResponse as WorkerPreviewResponse
} from '@/types/worker-api';
import { getCurrentUserId } from '@/utils/auth';
import { logger } from '@/utils/logger';
import { AITimeBillingService } from './ai-time-billing';
import { getWorkerClient } from './worker-api-client';

// Direct import for server build events
import { publishBuildEvent } from '@/services/server/build-events-publisher';

export interface PreviewDeploymentResponse {
  success: boolean
  buildId?: string
  projectId?: string  // Worker-generated or client-provided projectId
  previewUrl?: string
  status?: 'queued' | 'building' | 'ready' | 'failed'
  message?: string
  error?: string
  details?: string
  lastBuilt?: string
  estimatedCompletionTime?: string
  queuePosition?: number
  balanceCheck?: {
    sufficient: boolean
    recommendation?: any
  }
}

export class PreviewDeploymentService {
  /**
   * Deploy a preview for a project using Worker API
   * @param projectId - Optional for new projects (worker generates server-side)
   * @param templateData - Template data for the project
   * @param isNewProject - Whether this is a new project creation
   */
  static async deployPreview(projectId: string | null, templateData: any, isNewProject: boolean = false): Promise<PreviewDeploymentResponse> {
    let userId: string;

    try {
      const projectInfo = projectId ? `project: ${projectId}` : 'new project (server will generate ID)';
      logger.info(`🚀 Deploying preview for ${projectInfo}`);

      // Get current user ID
      userId = await getCurrentUserId();

      // Pre-build balance validation
      logger.info(`🔍 Checking AI time balance for user: ${userId}`);
      const balanceValidation = await AITimeBillingService.validatePreBuild(templateData, userId);

      if (!balanceValidation.allowed) {
        logger.warn(`⚠️ Insufficient balance for ${projectInfo}`);
        return {
          success: false,
          error: 'Insufficient AI time balance',
          details: balanceValidation.recommendation?.suggestedPackage || 'You can add more AI time credits to continue.',
          balanceCheck: {
            sufficient: false,
            recommendation: balanceValidation.recommendation
          }
        };
      }

      // Prepare Worker API request - projectId is optional for new projects
      const request: CreatePreviewRequest = {
        userId,
        ...(projectId && { projectId }), // Only include projectId if provided
        prompt: templateData.prompt || 'Build project from template',
        templateFiles: templateData.files || {},
        metadata: {
          ...templateData.metadata,
          projectSize: AITimeBillingService.estimateProjectSize(templateData),
          clientSource: 'nextjs-dashboard',
          timestamp: new Date().toISOString(),
          idGenerationSource: projectId ? 'client' : 'server'
        }
      };

      logger.info(`📤 Sending build request to Worker API for ${projectInfo}`, {
        projectSize: request.metadata.projectSize,
        fileCount: Object.keys(request.templateFiles).length,
        idGenerationSource: request.metadata.idGenerationSource
      });

      // Call Worker API
      logger.info(`📡 Calling Worker API with request:`, {
        userId: request.userId,
        projectId: request.projectId || '<server-generated>',
        prompt: request.prompt?.slice(0, 50) + '...',
        hasTemplateFiles: Object.keys(request.templateFiles).length > 0,
        projectSize: request.metadata.projectSize,
        idGenerationSource: request.metadata.idGenerationSource
      });

        // Choose the correct endpoint based on whether this is a new project
        const endpoint = isNewProject ? '/v1/create-preview-for-new-project' : '/v1/update-project';

        logger.info(`📡 Using Worker API endpoint: ${endpoint} (isNewProject: ${isNewProject})`);

      const workerResponse = await getWorkerClient().post<WorkerPreviewResponse>(
        endpoint,
        request
      );

      // Extract projectId from worker response (critical for server-generated IDs)
      const finalProjectId = workerResponse.projectId || projectId;
      
      if (!finalProjectId) {
        throw new Error('No projectId received from worker API - this should not happen');
      }

      logger.info(`✅ Worker API response for project ${finalProjectId}:`, {
        buildId: workerResponse.buildId,
        projectId: finalProjectId,
        serverGenerated: !projectId,
        status: workerResponse.status,
        queuePosition: workerResponse.queuePosition,
        hasPreviewUrl: !!workerResponse.previewUrl,
        estimatedTime: workerResponse.estimatedCompletionTime
      });

      // Publish initial build event to real-time system
      if (workerResponse.buildId) {
        try {
          const result = await publishBuildEvent(
            workerResponse.buildId,
            workerResponse.status === 'queued' ? 'queued' : 'started',
            {
              status: workerResponse.status,
              queuePosition: workerResponse.queuePosition,
              estimatedTime: workerResponse.estimatedCompletionTime,
              projectId: finalProjectId, // Use final projectId (server-generated or client-provided)
              serverGenerated: !projectId,
              idGenerationSource: projectId ? 'client' : 'server',
              createdByService: 'worker-service',
              message: workerResponse.queuePosition
                ? `Build queued (position ${workerResponse.queuePosition})`
                : 'Build started successfully'
            },
            userId
          );

          if (result.success) {
            logger.info(`📡 Initial build event published for: ${workerResponse.buildId}`, {
              eventId: result.eventId
            });
          } else {
            logger.warn(`⚠️ Failed to publish initial build event: ${result.error}`);
          }
        } catch (error) {
          logger.warn(`⚠️ Failed to publish initial build event:`, error);
          // Don't fail the deployment if real-time publishing fails
        }
      }

      return {
        success: true,
        buildId: workerResponse.buildId,
        projectId: finalProjectId, // Include the final projectId in response
        status: workerResponse.status === 'completed' ? 'ready' : workerResponse.status,
        previewUrl: workerResponse.previewUrl,
        estimatedCompletionTime: workerResponse.estimatedCompletionTime,
        queuePosition: workerResponse.queuePosition,
        message: workerResponse.queuePosition
          ? `Build queued (position ${workerResponse.queuePosition})`
          : 'Build started successfully',
        balanceCheck: {
          sufficient: true
        }
      };

    } catch (error) {
      logger.error('Preview deployment error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        projectId,
        userId
      });

      // Handle specific Worker API errors
      if (error instanceof Error && error.name === 'InsufficientBalanceError') {
        const insufficientError = error as InsufficientBalanceError;
        logger.warn('❌ Insufficient AI time balance detected', {
          userId,
          recommendation: insufficientError.data?.recommendation
        });

        return {
          success: false,
          error: 'Insufficient AI time balance',
          details: insufficientError.data?.recommendation?.suggestedPackage || 'You can add more AI time credits to continue.',
          balanceCheck: {
            sufficient: false,
            recommendation: insufficientError.data?.recommendation
          }
        };
      }

      // Handle network/API errors
      if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
        logger.error('❌ Network error calling Worker API', {
          message: error.message,
          projectId,
          userId
        });

        return {
          success: false,
          error: 'We were not able to communicate with our servers. Please try again later.',
          details: 'Unable to connect to the Worker service. Please try again.'
        };
      }

      return {
        success: false,
        error: 'Deployment failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check the status of a preview deployment by build ID with race-condition handling
   */
  static async checkPreviewStatus(buildId: string, retries = 3): Promise<PreviewDeploymentResponse> {
    try {
      logger.info(`🔍 Checking build status for: ${buildId}`, { retries });

      // Note: In the real-time approach, build status will come from Supabase subscriptions
      // This method is mainly for fallback/polling scenarios
      const response = await fetch(`/api/projects/build-status/${buildId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle race condition - worker may not have updated records yet
        if ((response.status === 404 || result.error?.includes('not found')) && retries > 0) {
          logger.info(`⏳ Build status not ready yet, retrying... (${retries} attempts left)`, {
            buildId: buildId.slice(0, 8),
            status: response.status
          });
          
          // Wait with exponential backoff
          const delay = Math.min(1000 * (4 - retries), 3000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          return this.checkPreviewStatus(buildId, retries - 1);
        }

        logger.error('Preview status check failed:', result);
        return {
          success: false,
          error: result.error || 'Status check failed',
          details: result.details
        };
      }

      return {
        success: true,
        buildId,
        status: result.status,
        previewUrl: result.previewUrl,
        message: result.message,
        lastBuilt: result.completedAt
      };

    } catch (error) {
      // Handle network errors with retry logic
      if (retries > 0 && (error instanceof Error && 
          (error.message.includes('fetch') || error.message.includes('network')))) {
        logger.info(`🔄 Network error, retrying... (${retries} attempts left)`, {
          buildId: buildId.slice(0, 8),
          error: error.message
        });
        
        const delay = Math.min(1000 * (4 - retries), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.checkPreviewStatus(buildId, retries - 1);
      }

      logger.error('Preview status check error:', error);
      return {
        success: false,
        error: 'Network error during status check',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update an existing project (incremental build)
   */
  static async updateProject(
    projectId: string,
    changes: any,
    prompt?: string,
    userId?: string
  ): Promise<PreviewDeploymentResponse> {
    let effectiveUserId: string;

    try {
      logger.info(`🔄 Updating project: ${projectId}`);

      // Use provided userId or fall back to getCurrentUserId() for server-side calls
      if (userId) {
        effectiveUserId = userId;
      } else {
        effectiveUserId = await getCurrentUserId();
      }

      // Skip pre-check - rely on Worker API's authoritative balance check
      // The Worker API will return a proper insufficient balance response if needed
      logger.debug('api', `Calling Worker API for project update: ${projectId}`);

      // Call Worker API for project update
      const request = {
        userId: effectiveUserId,
        projectId,
        changes,
        prompt: prompt || 'Update project'
      };

      const workerResponse = await getWorkerClient().post<WorkerPreviewResponse>(
        '/v1/update-project',
        request
      );

      logger.info(`✅ Project update initiated: ${projectId}`);

      return {
        success: true,
        buildId: workerResponse.buildId,
        status: workerResponse.status === 'completed' ? 'ready' : workerResponse.status,
        previewUrl: workerResponse.previewUrl,
        message: 'Project update started',
        balanceCheck: {
          sufficient: true
        }
      };

    } catch (error) {
      logger.error('Project update error:', error);

      if (error instanceof Error && error.name === 'InsufficientBalanceError') {
        const insufficientError = error as InsufficientBalanceError;
        return {
          success: false,
          error: 'Insufficient AI time balance',
          details: insufficientError.data?.recommendation?.suggestedPackage || 'You can add more AI time credits to continue.',
          balanceCheck: {
            sufficient: false,
            recommendation: insufficientError.data?.recommendation
          }
        };
      }

      return {
        success: false,
        error: 'Project update failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get the expected preview URL for a project
   * In Worker API, this will be provided in the response
   */
  static getPreviewUrl(projectId: string): string {
    return `https://preview--${projectId}.sheenapps.com`;
  }

  /**
   * Legacy method for backward compatibility
   * Now uses the buildId for status checking
   */
  static async checkLegacyPreviewStatus(projectId: string): Promise<PreviewDeploymentResponse> {
    try {
      // Try to find the latest build for this project
      const response = await fetch(`/api/projects/${projectId}/latest-build`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'No build found for project',
          details: `Could not find build information for project ${projectId}`
        };
      }

      const { buildId } = await response.json();
      return this.checkPreviewStatus(buildId);

    } catch (error) {
      logger.error('Legacy status check error:', error);
      return {
        success: false,
        error: 'Status check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
