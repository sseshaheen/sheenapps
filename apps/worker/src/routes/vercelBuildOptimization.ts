import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { VercelBuildOptimizationService } from '../services/vercelBuildOptimizationService';

/**
 * Vercel Build Optimization Routes
 * Provides build performance analysis and optimization recommendations
 */

export async function vercelBuildOptimizationRoutes(fastify: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();
  const buildOptimizationService = new VercelBuildOptimizationService();

  /**
   * GET /v1/projects/:projectId/vercel/optimization/analysis
   * Get comprehensive build performance analysis
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { 
      userId: string;
      timeframe?: string; // days
    };
  }>('/v1/projects/:projectId/vercel/optimization/analysis', async (request, reply) => {
    const { projectId } = request.params;
    const { userId, timeframe = '30' } = request.query;

    if (!userId) {
      return reply.code(400).send({
        error: 'Missing required parameter: userId'
      });
    }

    const timeframeDays = parseInt(timeframe);
    if (isNaN(timeframeDays) || timeframeDays < 1 || timeframeDays > 365) {
      return reply.code(400).send({
        error: 'Invalid timeframe. Must be between 1 and 365 days',
        code: 'INVALID_TIMEFRAME'
      });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Project not found or access denied',
          code: 'PROJECT_NOT_FOUND'
        });
      }

      // Get build performance analysis
      const analysis = await buildOptimizationService.analyzeBuildPerformance(projectId, timeframeDays);

      reply.send(analysis);

    } catch (error) {
      await loggingService.logCriticalError(
        'build_optimization_analysis_error',
        error as Error,
        { projectId, userId, timeframeDays }
      );

      if ((error as Error).message.includes('No deployment data')) {
        return reply.code(404).send({
          error: 'No deployment data available for analysis',
          code: 'NO_DEPLOYMENT_DATA',
          suggestion: 'Deploy your project first to generate build metrics'
        });
      }

      reply.code(500).send({
        error: 'Failed to analyze build performance',
        code: 'ANALYSIS_ERROR'
      });
    }
  });

  /**
   * GET /v1/projects/:projectId/vercel/optimization/recommendations
   * Get cached optimization recommendations
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { userId: string };
  }>('/v1/projects/:projectId/vercel/optimization/recommendations', async (request, reply) => {
    const { projectId } = request.params;
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({
        error: 'Missing required parameter: userId'
      });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Project not found or access denied',
          code: 'PROJECT_NOT_FOUND'
        });
      }

      // Get optimization recommendations
      const recommendations = await buildOptimizationService.getOptimizationRecommendations(projectId);

      // Categorize recommendations by type and severity
      const categorized = {
        high: recommendations.filter(r => r.severity === 'high'),
        medium: recommendations.filter(r => r.severity === 'medium'),
        low: recommendations.filter(r => r.severity === 'low'),
        byType: {
          build_time: recommendations.filter(r => r.type === 'build_time'),
          bundle_size: recommendations.filter(r => r.type === 'bundle_size'),
          caching: recommendations.filter(r => r.type === 'caching'),
          framework: recommendations.filter(r => r.type === 'framework'),
          dependencies: recommendations.filter(r => r.type === 'dependencies'),
          configuration: recommendations.filter(r => r.type === 'configuration')
        }
      };

      reply.send({
        total: recommendations.length,
        recommendations,
        categorized,
        summary: {
          highPriority: categorized.high.length,
          mediumPriority: categorized.medium.length,
          lowPriority: categorized.low.length,
          potentialImpact: recommendations.reduce((sum, r) => sum + (r.metrics?.improvementPercentage || 0), 0)
        }
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'build_optimization_recommendations_error',
        error as Error,
        { projectId, userId }
      );

      reply.code(500).send({
        error: 'Failed to get optimization recommendations',
        code: 'RECOMMENDATIONS_ERROR'
      });
    }
  });

  /**
   * GET /v1/projects/:projectId/vercel/optimization/metrics
   * Get recent build metrics for the project
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { 
      userId: string;
      limit?: string;
      offset?: string;
    };
  }>('/v1/projects/:projectId/vercel/optimization/metrics', async (request, reply) => {
    const { projectId } = request.params;
    const { userId, limit = '50', offset = '0' } = request.query;

    if (!userId) {
      return reply.code(400).send({
        error: 'Missing required parameter: userId'
      });
    }

    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return reply.code(400).send({
        error: 'Invalid limit. Must be between 1 and 100',
        code: 'INVALID_LIMIT'
      });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Project not found or access denied',
          code: 'PROJECT_NOT_FOUND'
        });
      }

      // Get build metrics
      const metricsResult = await getPool().query(`
        SELECT 
          vbm.*,
          vd.deployment_state,
          vd.deployment_url,
          vd.created_at as deployment_created_at
        FROM vercel_build_metrics vbm
        JOIN vercel_deployments vd ON vbm.deployment_id = vd.deployment_id
        WHERE vbm.project_id = $1
        ORDER BY vbm.created_at DESC
        LIMIT $2 OFFSET $3
      `, [projectId, limitNum, offsetNum]);

      // Get total count
      const countResult = await getPool().query(
        'SELECT COUNT(*) as total FROM vercel_build_metrics WHERE project_id = $1',
        [projectId]
      );

      const metrics = metricsResult.rows.map(row => ({
        id: row.id,
        deploymentId: row.deployment_id,
        buildDuration: row.build_duration_ms,
        bundleSize: row.bundle_size_bytes,
        framework: row.framework,
        nodeVersion: row.node_version,
        region: row.region,
        cacheHitRate: row.cache_hit_rate,
        deploymentState: row.deployment_state,
        deploymentUrl: row.deployment_url,
        createdAt: row.created_at
      }));

      reply.send({
        metrics,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit: limitNum,
          offset: offsetNum,
          hasMore: (offsetNum + limitNum) < parseInt(countResult.rows[0].total)
        }
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'build_metrics_fetch_error',
        error as Error,
        { projectId, userId, limit: limitNum, offset: offsetNum }
      );

      reply.code(500).send({
        error: 'Failed to fetch build metrics',
        code: 'METRICS_FETCH_ERROR'
      });
    }
  });

  /**
   * POST /v1/projects/:projectId/vercel/optimization/metrics
   * Record build metrics for a deployment (internal use)
   */
  fastify.post<{
    Params: { projectId: string };
    Body: {
      deploymentId: string;
      buildDuration: number;
      bundleSize?: number;
      framework: string;
      nodeVersion?: string;
      region: string;
      cacheHitRate?: number;
    };
  }>('/v1/projects/:projectId/vercel/optimization/metrics', async (request, reply) => {
    const { projectId } = request.params;
    const metrics = request.body;

    if (!metrics.deploymentId || !metrics.buildDuration || !metrics.framework) {
      return reply.code(400).send({
        error: 'Missing required fields',
        required: ['deploymentId', 'buildDuration', 'framework']
      });
    }

    try {
      // Record build metrics
      await buildOptimizationService.recordBuildMetrics(metrics.deploymentId, {
        ...metrics,
        projectId
      });

      reply.code(201).send({
        message: 'Build metrics recorded successfully',
        deploymentId: metrics.deploymentId
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'build_metrics_recording_error',
        error as Error,
        { projectId, metrics }
      );

      reply.code(500).send({
        error: 'Failed to record build metrics',
        code: 'METRICS_RECORDING_ERROR'
      });
    }
  });

  /**
   * GET /v1/projects/:projectId/vercel/optimization/benchmarks
   * Get performance benchmarks for comparison
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { 
      userId: string;
      framework?: string;
    };
  }>('/v1/projects/:projectId/vercel/optimization/benchmarks', async (request, reply) => {
    const { projectId } = request.params;
    const { userId, framework } = request.query;

    if (!userId) {
      return reply.code(400).send({
        error: 'Missing required parameter: userId'
      });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(`
        SELECT p.id, vpm.framework
        FROM projects p
        LEFT JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
        WHERE p.id = $1 AND p.owner_id = $2
      `, [projectId, userId]);

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Project not found or access denied',
          code: 'PROJECT_NOT_FOUND'
        });
      }

      const projectFramework = framework || projectResult.rows[0].framework;

      // Get framework-specific benchmarks from database
      const benchmarkResult = await getPool().query(`
        SELECT 
          framework,
          AVG(build_duration_ms) as avg_build_time,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY build_duration_ms) as median_build_time,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY build_duration_ms) as p95_build_time,
          AVG(bundle_size_bytes) as avg_bundle_size,
          AVG(cache_hit_rate) as avg_cache_hit_rate,
          COUNT(*) as sample_size
        FROM vercel_build_metrics
        WHERE framework ILIKE $1
        AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY framework
      `, [`%${projectFramework}%`]);

      // Get your project's current metrics
      const projectMetricsResult = await getPool().query(`
        SELECT 
          AVG(build_duration_ms) as avg_build_time,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY build_duration_ms) as median_build_time,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY build_duration_ms) as p95_build_time,
          AVG(bundle_size_bytes) as avg_bundle_size,
          AVG(cache_hit_rate) as avg_cache_hit_rate,
          COUNT(*) as sample_size
        FROM vercel_build_metrics
        WHERE project_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `, [projectId]);

      const frameworkBenchmark = benchmarkResult.rows[0];
      const projectMetrics = projectMetricsResult.rows[0];

      // Industry benchmarks (hardcoded for now, could be from external API)
      const industryBenchmarks = {
        build_time: {
          excellent: 30000, // 30s
          good: 60000, // 1min
          average: 120000, // 2min
          poor: 300000 // 5min
        },
        bundle_size: {
          excellent: 500 * 1024, // 500KB
          good: 1024 * 1024, // 1MB
          average: 2 * 1024 * 1024, // 2MB
          poor: 5 * 1024 * 1024 // 5MB
        },
        cache_hit_rate: {
          excellent: 90,
          good: 80,
          average: 65,
          poor: 50
        }
      };

      reply.send({
        framework: projectFramework,
        benchmarks: {
          yourProject: {
            buildTime: projectMetrics ? Math.round(projectMetrics.avg_build_time) : null,
            bundleSize: projectMetrics ? Math.round(projectMetrics.avg_bundle_size) : null,
            cacheHitRate: projectMetrics ? Math.round(projectMetrics.avg_cache_hit_rate * 100) / 100 : null,
            sampleSize: projectMetrics ? parseInt(projectMetrics.sample_size) : 0
          },
          framework: frameworkBenchmark ? {
            buildTime: Math.round(frameworkBenchmark.avg_build_time),
            bundleSize: Math.round(frameworkBenchmark.avg_bundle_size),
            cacheHitRate: Math.round(frameworkBenchmark.avg_cache_hit_rate * 100) / 100,
            sampleSize: parseInt(frameworkBenchmark.sample_size)
          } : null,
          industry: industryBenchmarks
        },
        comparison: projectMetrics && frameworkBenchmark ? {
          buildTimeVsFramework: Math.round(((projectMetrics.avg_build_time - frameworkBenchmark.avg_build_time) / frameworkBenchmark.avg_build_time) * 100),
          bundleSizeVsFramework: Math.round(((projectMetrics.avg_bundle_size - frameworkBenchmark.avg_bundle_size) / frameworkBenchmark.avg_bundle_size) * 100),
          cacheHitRateVsFramework: Math.round((projectMetrics.avg_cache_hit_rate - frameworkBenchmark.avg_cache_hit_rate) * 100) / 100
        } : null
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'build_benchmarks_error',
        error as Error,
        { projectId, userId, framework }
      );

      reply.code(500).send({
        error: 'Failed to fetch build benchmarks',
        code: 'BENCHMARKS_ERROR'
      });
    }
  });

  /**
   * DELETE /v1/projects/:projectId/vercel/optimization/cache
   * Clear optimization recommendations cache
   */
  fastify.delete<{
    Params: { projectId: string };
    Querystring: { userId: string };
  }>('/v1/projects/:projectId/vercel/optimization/cache', async (request, reply) => {
    const { projectId } = request.params;
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({
        error: 'Missing required parameter: userId'
      });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Project not found or access denied',
          code: 'PROJECT_NOT_FOUND'
        });
      }

      // Clear optimization cache
      await getPool().query(
        'DELETE FROM vercel_build_optimization_cache WHERE project_id = $1',
        [projectId]
      );

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Build optimization cache cleared',
        { projectId, userId }
      );

      reply.send({
        message: 'Optimization cache cleared successfully',
        note: 'Fresh recommendations will be generated on next request'
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'clear_optimization_cache_error',
        error as Error,
        { projectId, userId }
      );

      reply.code(500).send({
        error: 'Failed to clear optimization cache',
        code: 'CACHE_CLEAR_ERROR'
      });
    }
  });
}