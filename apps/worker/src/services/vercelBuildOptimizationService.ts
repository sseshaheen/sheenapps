import { getPool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import { VercelAPIService } from './vercelAPIService';
import { randomUUID } from 'crypto';

/**
 * Vercel Build Optimization Service
 * Analyzes deployment metrics and provides optimization recommendations
 * Tracks build performance trends and identifies bottlenecks
 */

export interface BuildMetric {
  deploymentId: string;
  projectId: string;
  buildDuration: number; // in milliseconds
  bundleSize?: number; // in bytes
  framework: string;
  nodeVersion?: string;
  region: string;
  cacheHitRate?: number; // percentage
  createdAt: Date;
}

export interface OptimizationRecommendation {
  id: string;
  type: 'build_time' | 'bundle_size' | 'caching' | 'framework' | 'dependencies' | 'configuration';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  impact: string;
  implementation: {
    difficulty: 'easy' | 'medium' | 'hard';
    timeEstimate: string;
    steps: string[];
    codeChanges?: string[];
  };
  metrics: {
    currentValue: number;
    targetValue: number;
    unit: string;
    improvementPercentage: number;
  };
  references: string[];
}

export interface ProjectBuildAnalysis {
  projectId: string;
  timeframe: string;
  summary: {
    totalDeployments: number;
    averageBuildTime: number;
    medianBuildTime: number;
    buildTimeP95: number;
    averageBundleSize: number;
    cacheHitRate: number;
    successRate: number;
  };
  trends: {
    buildTimeChange: number; // percentage change over timeframe
    bundleSizeChange: number;
    successRateChange: number;
  };
  recommendations: OptimizationRecommendation[];
  benchmarks: {
    frameworkAverage: number;
    industryAverage: number;
    topPerformerAverage: number;
  };
}

export class VercelBuildOptimizationService {
  private loggingService: ServerLoggingService;
  private vercelAPI: VercelAPIService;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
    this.vercelAPI = new VercelAPIService();
  }

  /**
   * Analyze project build performance and generate recommendations
   */
  async analyzeBuildPerformance(projectId: string, timeframeDays: number = 30): Promise<ProjectBuildAnalysis> {
    try {
      // Get deployment metrics from database
      const metricsResult = await getPool().query(`
        SELECT 
          vd.deployment_id,
          vd.build_duration_ms,
          vd.deployment_state,
          vd.created_at,
          vd.metadata,
          vpm.framework,
          vpm.node_version
        FROM vercel_deployments vd
        JOIN vercel_project_mappings vpm ON vd.vercel_project_mapping_id = vpm.id
        WHERE vd.project_id = $1 
        AND vd.created_at >= NOW() - INTERVAL '${timeframeDays} days'
        ORDER BY vd.created_at DESC
      `, [projectId]);

      const deployments = metricsResult.rows;

      if (deployments.length === 0) {
        throw new Error('No deployment data available for analysis');
      }

      // Calculate summary metrics
      const summary = this.calculateSummaryMetrics(deployments);

      // Calculate trends
      const trends = this.calculateTrends(deployments, timeframeDays);

      // Get framework and industry benchmarks
      const benchmarks = await this.getBenchmarks(deployments[0].framework);

      // Generate optimization recommendations
      const recommendations = await this.generateRecommendations(projectId, deployments, summary, benchmarks);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Build performance analysis completed',
        {
          projectId,
          timeframeDays,
          deploymentCount: deployments.length,
          recommendationCount: recommendations.length
        }
      );

      return {
        projectId,
        timeframe: `${timeframeDays} days`,
        summary,
        trends,
        recommendations,
        benchmarks
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'build_optimization_analysis_error',
        error as Error,
        { projectId, timeframeDays }
      );
      throw error;
    }
  }

  /**
   * Record build metrics from deployment
   */
  async recordBuildMetrics(deploymentId: string, metrics: Partial<BuildMetric>): Promise<void> {
    try {
      await getPool().query(`
        INSERT INTO vercel_build_metrics (
          id, deployment_id, project_id, build_duration_ms, bundle_size_bytes,
          framework, node_version, region, cache_hit_rate, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (deployment_id) DO UPDATE SET
          build_duration_ms = EXCLUDED.build_duration_ms,
          bundle_size_bytes = EXCLUDED.bundle_size_bytes,
          cache_hit_rate = EXCLUDED.cache_hit_rate,
          updated_at = NOW()
      `, [
        randomUUID(),
        deploymentId,
        metrics.projectId,
        metrics.buildDuration,
        metrics.bundleSize,
        metrics.framework,
        metrics.nodeVersion,
        metrics.region,
        metrics.cacheHitRate
      ]);

    } catch (error) {
      await this.loggingService.logCriticalError(
        'build_metrics_recording_error',
        error as Error,
        { deploymentId, metrics }
      );
    }
  }

  /**
   * Get build optimization recommendations for a project
   */
  async getOptimizationRecommendations(projectId: string): Promise<OptimizationRecommendation[]> {
    try {
      // Get cached recommendations if they exist and are recent
      const cachedResult = await getPool().query(`
        SELECT recommendations, generated_at
        FROM vercel_build_optimization_cache
        WHERE project_id = $1 AND generated_at > NOW() - INTERVAL '24 hours'
        ORDER BY generated_at DESC
        LIMIT 1
      `, [projectId]);

      if (cachedResult.rows.length > 0) {
        return cachedResult.rows[0].recommendations;
      }

      // Generate fresh analysis
      const analysis = await this.analyzeBuildPerformance(projectId);

      // Cache the recommendations
      await getPool().query(`
        INSERT INTO vercel_build_optimization_cache (
          id, project_id, recommendations, generated_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (project_id) DO UPDATE SET
          recommendations = EXCLUDED.recommendations,
          generated_at = EXCLUDED.generated_at
      `, [
        randomUUID(),
        projectId,
        JSON.stringify(analysis.recommendations)
      ]);

      return analysis.recommendations;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'get_optimization_recommendations_error',
        error as Error,
        { projectId }
      );
      return [];
    }
  }

  /**
   * Calculate summary metrics from deployments
   */
  private calculateSummaryMetrics(deployments: any[]): ProjectBuildAnalysis['summary'] {
    const successfulDeployments = deployments.filter(d => d.deployment_state === 'READY');
    const buildTimes = successfulDeployments
      .filter(d => d.build_duration_ms)
      .map(d => d.build_duration_ms);

    const bundleSizes = deployments
      .filter(d => d.metadata?.bundleSize)
      .map(d => d.metadata.bundleSize);

    const cacheHits = deployments
      .filter(d => d.metadata?.cacheHitRate)
      .map(d => d.metadata.cacheHitRate);

    return {
      totalDeployments: deployments.length,
      averageBuildTime: buildTimes.length > 0 ? buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length : 0,
      medianBuildTime: this.calculatePercentile(buildTimes, 50),
      buildTimeP95: this.calculatePercentile(buildTimes, 95),
      averageBundleSize: bundleSizes.length > 0 ? bundleSizes.reduce((a, b) => a + b, 0) / bundleSizes.length : 0,
      cacheHitRate: cacheHits.length > 0 ? cacheHits.reduce((a, b) => a + b, 0) / cacheHits.length : 0,
      successRate: (successfulDeployments.length / deployments.length) * 100
    };
  }

  /**
   * Calculate build performance trends
   */
  private calculateTrends(deployments: any[], timeframeDays: number): ProjectBuildAnalysis['trends'] {
    const halfwayPoint = new Date(Date.now() - (timeframeDays / 2) * 24 * 60 * 60 * 1000);
    
    const recentDeployments = deployments.filter(d => new Date(d.created_at) > halfwayPoint);
    const olderDeployments = deployments.filter(d => new Date(d.created_at) <= halfwayPoint);

    const recentBuildTime = this.calculateAverageBuildTime(recentDeployments);
    const olderBuildTime = this.calculateAverageBuildTime(olderDeployments);
    
    const recentBundleSize = this.calculateAverageBundleSize(recentDeployments);
    const olderBundleSize = this.calculateAverageBundleSize(olderDeployments);

    const recentSuccessRate = this.calculateSuccessRate(recentDeployments);
    const olderSuccessRate = this.calculateSuccessRate(olderDeployments);

    return {
      buildTimeChange: olderBuildTime ? ((recentBuildTime - olderBuildTime) / olderBuildTime) * 100 : 0,
      bundleSizeChange: olderBundleSize ? ((recentBundleSize - olderBundleSize) / olderBundleSize) * 100 : 0,
      successRateChange: olderSuccessRate ? recentSuccessRate - olderSuccessRate : 0
    };
  }

  /**
   * Generate optimization recommendations based on metrics
   */
  private async generateRecommendations(
    projectId: string,
    deployments: any[],
    summary: ProjectBuildAnalysis['summary'],
    benchmarks: ProjectBuildAnalysis['benchmarks']
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];

    // Check build time performance
    if (summary.averageBuildTime > benchmarks.frameworkAverage * 1.5) {
      recommendations.push({
        id: randomUUID(),
        type: 'build_time',
        severity: summary.averageBuildTime > benchmarks.frameworkAverage * 2 ? 'high' : 'medium',
        title: 'Optimize Build Time',
        description: 'Your build time is significantly higher than the framework average. Consider optimizing your build process.',
        impact: `Reduce build time by up to ${Math.round((summary.averageBuildTime - benchmarks.frameworkAverage) / 1000)}s per deployment`,
        implementation: {
          difficulty: 'medium',
          timeEstimate: '2-4 hours',
          steps: [
            'Enable Vercel build cache by ensuring cache-friendly build commands',
            'Optimize package.json dependencies - remove unused packages',
            'Use incremental builds if supported by your framework',
            'Consider parallelizing build steps where possible'
          ],
          codeChanges: [
            'Update build scripts to use caching',
            'Configure framework-specific optimizations'
          ]
        },
        metrics: {
          currentValue: Math.round(summary.averageBuildTime / 1000),
          targetValue: Math.round(benchmarks.frameworkAverage / 1000),
          unit: 'seconds',
          improvementPercentage: Math.round(((summary.averageBuildTime - benchmarks.frameworkAverage) / summary.averageBuildTime) * 100)
        },
        references: [
          'https://vercel.com/docs/concepts/builds',
          'https://vercel.com/docs/concepts/builds/build-caching'
        ]
      });
    }

    // Check bundle size optimization
    if (summary.averageBundleSize > 1024 * 1024) { // > 1MB
      recommendations.push({
        id: randomUUID(),
        type: 'bundle_size',
        severity: summary.averageBundleSize > 5 * 1024 * 1024 ? 'high' : 'medium', // > 5MB
        title: 'Reduce Bundle Size',
        description: 'Your bundle size is larger than recommended. Optimize to improve loading performance.',
        impact: `Reduce initial bundle size and improve page load speed`,
        implementation: {
          difficulty: 'medium',
          timeEstimate: '4-6 hours',
          steps: [
            'Analyze bundle with webpack-bundle-analyzer or similar tools',
            'Implement code splitting and lazy loading',
            'Remove unused dependencies and dead code',
            'Optimize images and static assets',
            'Use dynamic imports for non-critical modules'
          ],
          codeChanges: [
            'Add dynamic imports for route-level code splitting',
            'Configure webpack optimizations',
            'Implement lazy loading for images and components'
          ]
        },
        metrics: {
          currentValue: Math.round(summary.averageBundleSize / 1024),
          targetValue: 500, // Target 500KB
          unit: 'KB',
          improvementPercentage: Math.round(((summary.averageBundleSize - 500 * 1024) / summary.averageBundleSize) * 100)
        },
        references: [
          'https://web.dev/reduce-javascript-payloads-with-code-splitting/',
          'https://vercel.com/docs/concepts/builds/build-optimization'
        ]
      });
    }

    // Check cache hit rate
    if (summary.cacheHitRate < 80) {
      recommendations.push({
        id: randomUUID(),
        type: 'caching',
        severity: summary.cacheHitRate < 50 ? 'high' : 'medium',
        title: 'Improve Build Caching',
        description: 'Your cache hit rate is low, causing unnecessary rebuilds and longer deployment times.',
        impact: `Increase cache hit rate to reduce build times by 40-60%`,
        implementation: {
          difficulty: 'easy',
          timeEstimate: '1-2 hours',
          steps: [
            'Ensure package-lock.json or yarn.lock is committed',
            'Use stable dependency versions to improve cache hits',
            'Configure build outputs to be cache-friendly',
            'Review .vercelignore to exclude cache-busting files'
          ],
          codeChanges: [
            'Update package.json with exact versions',
            'Configure .vercelignore appropriately'
          ]
        },
        metrics: {
          currentValue: Math.round(summary.cacheHitRate),
          targetValue: 85,
          unit: '%',
          improvementPercentage: Math.round(((85 - summary.cacheHitRate) / 85) * 100)
        },
        references: [
          'https://vercel.com/docs/concepts/builds/build-caching'
        ]
      });
    }

    // Check for framework-specific recommendations
    const framework = deployments[0]?.framework;
    if (framework) {
      const frameworkRecommendations = this.getFrameworkSpecificRecommendations(framework, summary);
      recommendations.push(...frameworkRecommendations);
    }

    return recommendations;
  }

  /**
   * Get framework-specific optimization recommendations
   */
  private getFrameworkSpecificRecommendations(
    framework: string,
    summary: ProjectBuildAnalysis['summary']
  ): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    switch (framework?.toLowerCase()) {
      case 'nextjs':
        recommendations.push({
          id: randomUUID(),
          type: 'framework',
          severity: 'low',
          title: 'Next.js Build Optimizations',
          description: 'Enable Next.js specific optimizations for better performance.',
          impact: 'Improve build time and runtime performance',
          implementation: {
            difficulty: 'easy',
            timeEstimate: '1 hour',
            steps: [
              'Enable experimental SWC compiler in next.config.js',
              'Use Next.js Image optimization',
              'Configure bundle analyzer',
              'Enable gzip compression'
            ],
            codeChanges: [
              'Update next.config.js with optimization settings'
            ]
          },
          metrics: {
            currentValue: Math.round(summary.averageBuildTime / 1000),
            targetValue: Math.round(summary.averageBuildTime * 0.8 / 1000),
            unit: 'seconds',
            improvementPercentage: 20
          },
          references: [
            'https://nextjs.org/docs/advanced-features/compiler',
            'https://nextjs.org/docs/basic-features/image-optimization'
          ]
        });
        break;

      case 'react':
        recommendations.push({
          id: randomUUID(),
          type: 'framework',
          severity: 'low',
          title: 'React Build Optimizations',
          description: 'Optimize your React build configuration for better performance.',
          impact: 'Reduce bundle size and improve build efficiency',
          implementation: {
            difficulty: 'medium',
            timeEstimate: '2-3 hours',
            steps: [
              'Configure webpack for production builds',
              'Implement React.lazy() for code splitting',
              'Use React.memo() for expensive components',
              'Enable React DevTools production exclusion'
            ]
          },
          metrics: {
            currentValue: Math.round(summary.averageBundleSize / 1024),
            targetValue: Math.round(summary.averageBundleSize * 0.7 / 1024),
            unit: 'KB',
            improvementPercentage: 30
          },
          references: [
            'https://react.dev/reference/react/lazy',
            'https://react.dev/reference/react/memo'
          ]
        });
        break;
    }

    return recommendations;
  }

  /**
   * Get industry and framework benchmarks
   */
  private async getBenchmarks(framework: string): Promise<ProjectBuildAnalysis['benchmarks']> {
    // In a real implementation, these would come from a benchmark database
    // For now, using reasonable defaults based on industry standards
    
    const frameworkBenchmarks: Record<string, number> = {
      'nextjs': 45000, // 45 seconds
      'react': 60000,  // 60 seconds  
      'vue': 35000,    // 35 seconds
      'angular': 90000, // 90 seconds
      'svelte': 25000, // 25 seconds
    };

    return {
      frameworkAverage: frameworkBenchmarks[framework?.toLowerCase()] || 60000,
      industryAverage: 65000, // 65 seconds industry average
      topPerformerAverage: 30000 // 30 seconds for optimized projects
    };
  }

  /**
   * Helper methods for calculations
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private calculateAverageBuildTime(deployments: any[]): number {
    const buildTimes = deployments
      .filter(d => d.build_duration_ms)
      .map(d => d.build_duration_ms);
    
    return buildTimes.length > 0 ? buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length : 0;
  }

  private calculateAverageBundleSize(deployments: any[]): number {
    const bundleSizes = deployments
      .filter(d => d.metadata?.bundleSize)
      .map(d => d.metadata.bundleSize);
    
    return bundleSizes.length > 0 ? bundleSizes.reduce((a, b) => a + b, 0) / bundleSizes.length : 0;
  }

  private calculateSuccessRate(deployments: any[]): number {
    if (deployments.length === 0) return 0;
    
    const successful = deployments.filter(d => d.deployment_state === 'READY').length;
    return (successful / deployments.length) * 100;
  }

  /**
   * Clean up old build metrics (called by maintenance job)
   */
  async cleanupOldMetrics(daysToKeep: number = 90): Promise<number> {
    const result = await getPool().query(
      `DELETE FROM vercel_build_metrics 
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
    );

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Cleaned up old build metrics',
      { deletedCount: result.rowCount, daysToKeep }
    );

    return result.rowCount || 0;
  }
}

// Database schema for build optimization
export const BUILD_OPTIMIZATION_SCHEMA_SQL = `
-- Build metrics tracking
CREATE TABLE IF NOT EXISTS vercel_build_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id VARCHAR(255) UNIQUE NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  build_duration_ms INTEGER,
  bundle_size_bytes BIGINT,
  framework VARCHAR(100),
  node_version VARCHAR(50),
  region VARCHAR(50),
  cache_hit_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimization recommendations cache
CREATE TABLE IF NOT EXISTS vercel_build_optimization_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recommendations JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for build optimization
CREATE INDEX IF NOT EXISTS idx_vercel_build_metrics_project_created 
  ON vercel_build_metrics(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_build_metrics_deployment 
  ON vercel_build_metrics(deployment_id);
CREATE INDEX IF NOT EXISTS idx_vercel_build_metrics_framework 
  ON vercel_build_metrics(framework, build_duration_ms);
CREATE INDEX IF NOT EXISTS idx_vercel_build_optimization_cache_generated 
  ON vercel_build_optimization_cache(generated_at) 
  WHERE generated_at > NOW() - INTERVAL '24 hours';
`;