import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getProjectRecommendationsByBuildId } from '../services/databaseWrapper';
import { PathGuard } from '../services/pathGuard';
import { RecommendationsResponse } from '../types/recommendations';

interface BuildRecommendationsParams {
  buildId: string;
}

interface BuildRecommendationsQuery {
  userId: string; // Now required for security
}

export async function buildRecommendationsRoute(app: FastifyInstance) {
  // Get recommendations for a specific build
  app.get<{
    Params: BuildRecommendationsParams;
    Querystring: BuildRecommendationsQuery;
  }>('/api/builds/:buildId/recommendations', {
    config: {
      security: { 
        scheme: 'hmac', 
        scope: ['build:recommendations:read'] 
      }
    },
    preHandler: requireHmacSignature(),
    schema: {
      params: {
        type: 'object',
        required: ['buildId'],
        properties: {
          buildId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: BuildRecommendationsParams;
    Querystring: BuildRecommendationsQuery;
  }>, reply: FastifyReply) => {
    const { buildId } = request.params;
    const { userId } = request.query;

    // Validate buildId
    const sanitizedBuildId = PathGuard.sanitizePathComponent(buildId);
    if (sanitizedBuildId !== buildId) {
      return reply.code(400).send({
        error: 'Invalid request',
        message: 'Build ID contains invalid characters'
      });
    }

    // Validate userId (now required)
    if (!userId) {
      return reply.code(400).send({
        error: 'Missing parameter',
        message: 'userId parameter is required'
      });
    }

    const sanitizedUserId = PathGuard.sanitizePathComponent(userId);
    if (sanitizedUserId !== userId) {
      return reply.code(400).send({
        error: 'Invalid request',
        message: 'User ID contains invalid characters'
      });
    }

    try {
      // Direct lookup by buildId - much simpler!
      const recommendations = await getProjectRecommendationsByBuildId(buildId, userId);

      if (!recommendations) {
        return reply.code(200).send({
          success: true,
          buildId,
          recommendations: [],
          message: 'No recommendations available yet - they may still be generating'
        });
      }

      const response: RecommendationsResponse = {
        success: true,
        buildId,
        projectId: recommendations.projectId,
        versionId: recommendations.versionId,
        recommendations: recommendations.recommendations
      };

      return reply.send(response);

    } catch (error) {
      console.error('[Build Recommendations] Error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to retrieve recommendations'
      });
    }
  });
}