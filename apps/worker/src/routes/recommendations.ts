import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getProjectRecommendations } from '../services/databaseWrapper';
import { PathGuard } from '../services/pathGuard';
import { RecommendationsResponse } from '../types/recommendations';
import { SUPPORTED_LOCALES } from '../i18n/localeUtils';
import { assertProjectAccess } from '../utils/projectAccess';

interface RecommendationsParams {
  projectId: string;
}

interface RecommendationsQuery {
  userId: string;
  versionId?: string;
}

export async function recommendationsRoute(app: FastifyInstance) {
  app.get<{
    Headers: { 'x-sheen-locale'?: string; [key: string]: any };
    Params: RecommendationsParams;
    Querystring: RecommendationsQuery;
  }>('/projects/:projectId/recommendations', {
    preHandler: requireHmacSignature(),
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-sheen-locale': {
            type: 'string',
            enum: SUPPORTED_LOCALES as any,
            description: 'Preferred locale for AI-generated recommendations'
          }
        }
      },
      params: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' },
          versionId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Headers: { 'x-sheen-locale'?: string; [key: string]: any };
    Params: RecommendationsParams;
    Querystring: RecommendationsQuery;
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const { userId, versionId } = request.query;
    const locale = request.locale; // Use middleware-resolved locale

    // Validate projectId
    const sanitizedProjectId = PathGuard.sanitizePathComponent(projectId);
    if (sanitizedProjectId !== projectId) {
      return reply.code(400).send({
        error: 'Invalid request',
        message: 'Project ID contains invalid characters'
      });
    }

    // Validate userId - required for authorization
    if (!userId) {
      return reply.code(400).send({
        error: 'Invalid request',
        message: 'User ID is required',
        code: 'MISSING_USER_ID'
      });
    }

    const sanitizedUserId = PathGuard.sanitizePathComponent(userId);
    if (sanitizedUserId !== userId) {
      return reply.code(400).send({
        error: 'Invalid request',
        message: 'User ID contains invalid characters'
      });
    }

    // Verify user has access to this project
    try {
      await assertProjectAccess(projectId, userId);
    } catch (error: any) {
      if (error.statusCode === 403) {
        return reply.code(403).send({
          error: 'Unauthorized',
          message: 'You do not have access to this project',
          code: error.code || 'UNAUTHORIZED_PROJECT_ACCESS'
        });
      }
      throw error;
    }

    try {
      // Get recommendations from database
      const recommendations = await getProjectRecommendations(
        userId,
        projectId,
        versionId
      );

      if (!recommendations) {
        return reply.code(404).send({
          success: false,
          projectId,
          versionId,
          recommendations: [],
          message: versionId 
            ? `No recommendations found for version ${versionId}`
            : 'No recommendations found for this project'
        });
      }

      const response: RecommendationsResponse = {
        success: true,
        projectId,
        versionId: recommendations.versionId || versionId,
        recommendations: recommendations.recommendations || recommendations,
        _i18n: {
          locale,
          localeTag: request.localeTag,
          available: [...SUPPORTED_LOCALES]  // Convert readonly array to mutable
        }
      };

      return reply.send(response);

    } catch (error) {
      console.error('[Recommendations] Error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to retrieve recommendations'
      });
    }
  });
}