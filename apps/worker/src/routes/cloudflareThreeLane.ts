import { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { CloudflareThreeLaneDeployment } from '../services/cloudflareThreeLaneDeployment';
import { ServerLoggingService } from '../services/serverLoggingService';

/**
 * Routes for Cloudflare Three-Lane Deployment System
 */

interface DetectTargetRequest {
  Body: {
    projectPath: string;
    userId?: string;
    sheenProjectId?: string;
    projectId?: string; // UUID for database updates
    versionId?: string; // Version ID for database updates
  };
}

interface DeployProjectRequest {
  Body: {
    projectPath: string;
    userId?: string;
    sheenProjectId?: string;
    projectId?: string; // UUID for database updates
    versionId?: string; // Version ID for database updates
  };
}

interface ValidateDeploymentRequest {
  Body: {
    deployedUrl: string;
  };
}

export async function cloudflareThreeLaneRoutes(fastify: FastifyInstance) {
  const deployment = CloudflareThreeLaneDeployment.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  /**
   * POST /v1/cloudflare/detect-target
   * Detect optimal deployment target for a project
   */
  fastify.post<DetectTargetRequest>('/v1/cloudflare/detect-target', {
    config: {
      security: { scheme: 'hmac', scope: ['deploy:cloudflare'] }
    },
    preHandler: requireHmacSignature(),
    schema: {
      body: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to the project directory'
          },
          userId: {
            type: 'string',
            description: 'User ID for Supabase OAuth integration (optional)'
          },
          sheenProjectId: {
            type: 'string',
            description: 'Sheen project ID for Supabase OAuth integration (optional)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            detection: {
              type: 'object',
              properties: {
                target: {
                  type: 'string',
                  enum: ['pages-static', 'pages-edge', 'workers-node']
                },
                reasons: {
                  type: 'array',
                  items: { type: 'string' }
                },
                notes: {
                  type: 'array',
                  items: { type: 'string' }
                },
                origin: {
                  type: 'string',
                  enum: ['manual', 'detection']
                },
                supabaseIntegration: {
                  type: 'object',
                  properties: {
                    hasSupabase: { type: 'boolean' },
                    connectionType: {
                      type: 'string',
                      enum: ['oauth', 'manual', null]
                    },
                    needsServiceRole: { type: 'boolean' }
                  }
                }
              }
            },
            manifestSaved: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { projectPath, userId, sheenProjectId, projectId, versionId } = request.body;

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Starting Cloudflare target detection',
        { projectPath, hasUserId: !!userId, hasSheenProjectId: !!sheenProjectId, hasProjectId: !!projectId, hasVersionId: !!versionId }
      );

      // Validate project path
      if (!projectPath || typeof projectPath !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid or missing projectPath',
          code: 'INVALID_PROJECT_PATH'
        });
      }

      // Detect target
      const detection = await deployment.detectTarget(projectPath, userId, sheenProjectId);

      // Save manifest for deployment
      await deployment.saveManifest(projectPath, detection);

      // Update database if projectId provided
      if (projectId) {
        await deployment.updateProjectDeploymentLane(projectId, detection);
      }

      // Update database if versionId provided
      if (versionId) {
        await deployment.updateProjectVersionDeploymentLane(versionId, detection);
      }

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Cloudflare target detection completed',
        {
          projectPath,
          target: detection.target,
          reasons: detection.reasons,
          origin: detection.origin,
          hasSupabaseIntegration: !!detection.supabaseIntegration?.hasSupabase,
          detectionTimestamp: new Date().toISOString(),
          // Add searchable fields for monitoring
          deploymentLane: detection.target,
          isManualOverride: detection.origin === 'manual',
          hasNext15: detection.reasons.some(r => r.includes('Next 15')),
          hasISR: detection.reasons.some(r => r.includes('ISR')),
          hasNodeImports: detection.reasons.some(r => r.includes('Node built-ins')),
          hasSupabaseServiceRole: !!detection.supabaseIntegration?.needsServiceRole
        }
      );

      return reply.send({
        success: true,
        detection,
        manifestSaved: true
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'cloudflare_detection_api_failed',
        error as Error,
        { projectPath: request.body.projectPath }
      );

      return reply.status(500).send({
        success: false,
        error: (error as Error).message,
        code: 'DETECTION_FAILED'
      });
    }
  });

  /**
   * POST /v1/cloudflare/deploy
   * Deploy project using three-lane strategy
   */
  fastify.post<DeployProjectRequest>('/v1/cloudflare/deploy', {
    schema: {
      body: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to the project directory'
          },
          userId: {
            type: 'string',
            description: 'User ID for Supabase OAuth integration (optional)'
          },
          sheenProjectId: {
            type: 'string',
            description: 'Sheen project ID for Supabase OAuth integration (optional)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            deployment: {
              type: 'object',
              properties: {
                deployedUrl: { type: 'string' },
                target: {
                  type: 'string',
                  enum: ['pages-static', 'pages-edge', 'workers-node']
                },
                switched: { type: 'boolean' },
                switchReason: { type: 'string' }
              }
            },
            validationPassed: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { projectPath, userId, sheenProjectId, projectId, versionId } = request.body;

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Starting Cloudflare three-lane deployment',
        { projectPath, hasUserId: !!userId, hasSheenProjectId: !!sheenProjectId, hasProjectId: !!projectId, hasVersionId: !!versionId }
      );

      // Validate project path
      if (!projectPath || typeof projectPath !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid or missing projectPath',
          code: 'INVALID_PROJECT_PATH'
        });
      }

      // Generate buildId for deployment tracking
      const buildId = ulid();
      
      // Deploy project
      const deploymentResult = await deployment.deploy(projectPath, buildId, userId, sheenProjectId);

      // Run post-deploy validation
      let validationPassed = false;
      try {
        await deployment.validateDeployment(deploymentResult.deployedUrl);
        validationPassed = true;
      } catch (validationError) {
        await loggingService.logServerEvent(
          'capacity',
          'warn',
          'Deployment validation failed',
          { 
            projectPath,
            deployedUrl: deploymentResult.deployedUrl,
            error: (validationError as Error).message
          }
        );
        // Don't fail the deployment if validation fails
      }

      // Update database with final deployment result
      if (versionId) {
        // Get the original detection from manifest if available
        try {
          const manifestPath = require('path').join(projectPath, '.sheenapps/deploy-target.json');
          const manifestContent = await require('fs').promises.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          
          await deployment.updateProjectVersionDeploymentLane(versionId, manifest, deploymentResult);
        } catch (manifestError) {
          console.log('⚠️ Could not read deployment manifest for database update');
        }
      }

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Cloudflare three-lane deployment completed',
        {
          projectPath,
          deployedUrl: deploymentResult.deployedUrl,
          target: deploymentResult.target,
          switched: deploymentResult.switched,
          switchReason: deploymentResult.switchReason,
          validationPassed,
          deploymentTimestamp: new Date().toISOString(),
          // Add deployment outcome tracking
          finalDeploymentLane: deploymentResult.target,
          deploymentSwitched: !!deploymentResult.switched,
          deploymentSuccess: true
        }
      );

      return reply.send({
        success: true,
        deployment: deploymentResult,
        validationPassed
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'cloudflare_deployment_api_failed',
        error as Error,
        { projectPath: request.body.projectPath }
      );

      return reply.status(500).send({
        success: false,
        error: (error as Error).message,
        code: 'DEPLOYMENT_FAILED'
      });
    }
  });

  /**
   * POST /v1/cloudflare/validate-deployment
   * Validate a deployed application
   */
  fastify.post<ValidateDeploymentRequest>('/v1/cloudflare/validate-deployment', {
    schema: {
      body: {
        type: 'object',
        required: ['deployedUrl'],
        properties: {
          deployedUrl: {
            type: 'string',
            description: 'URL of the deployed application'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            validationPassed: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { deployedUrl } = request.body;

      // Validate URL
      if (!deployedUrl || typeof deployedUrl !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid or missing deployedUrl',
          code: 'INVALID_URL'
        });
      }

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Starting deployment validation',
        { deployedUrl }
      );

      // Run validation
      await deployment.validateDeployment(deployedUrl);

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Deployment validation completed successfully',
        { deployedUrl }
      );

      return reply.send({
        success: true,
        validationPassed: true,
        message: 'Deployment validation passed'
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'capacity',
        'warn',
        'Deployment validation failed',
        { 
          deployedUrl: request.body.deployedUrl,
          error: (error as Error).message
        }
      );

      return reply.status(400).send({
        success: false,
        validationPassed: false,
        error: (error as Error).message,
        code: 'VALIDATION_FAILED'
      });
    }
  });

  /**
   * GET /v1/cloudflare/deployment-history
   * Get deployment lane selection history and analytics
   */
  fastify.get('/v1/cloudflare/deployment-history', {
    schema: {
      description: 'Get deployment lane selection history and analytics',
      tags: ['Cloudflare', 'Analytics'],
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Number of recent deployments to return'
          },
          target: {
            type: 'string',
            enum: ['pages-static', 'pages-edge', 'workers-node'],
            description: 'Filter by deployment target'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            deployments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  target: { type: 'string' },
                  reasons: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  origin: { type: 'string' },
                  switched: { type: 'boolean' },
                  projectPath: { type: 'string' }
                }
              }
            },
            analytics: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                targetDistribution: {
                  type: 'object',
                  properties: {
                    'pages-static': { type: 'integer' },
                    'pages-edge': { type: 'integer' },
                    'workers-node': { type: 'integer' }
                  }
                },
                switchRate: { type: 'number' },
                manualOverrideRate: { type: 'number' }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Get real analytics from database
      const analytics = await deployment.getDeploymentLaneAnalytics();

      return reply.send({
        success: true,
        deployments: analytics.recentDeployments.map(d => ({
          timestamp: d.detectedAt,
          target: d.target,
          reasons: d.reasons,
          origin: 'detection', // We can enhance this with actual origin data
          switched: d.switched,
          projectPath: d.versionId // Using versionId as identifier for now
        })),
        analytics: {
          total: analytics.totalDeployments,
          targetDistribution: analytics.targetDistribution,
          switchRate: analytics.switchRate,
          manualOverrideRate: analytics.manualOverrideRate
        }
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'deployment_history_api_failed',
        error as Error,
        {}
      );

      return reply.status(500).send({
        success: false,
        error: (error as Error).message,
        code: 'HISTORY_QUERY_FAILED'
      });
    }
  });

  /**
   * GET /v1/cloudflare/deployment-guidance
   * Get deployment guidance for different scenarios
   */
  fastify.get('/v1/cloudflare/deployment-guidance', {
    schema: {
      description: 'Get deployment guidance for Cloudflare three-lane strategy',
      tags: ['Cloudflare', 'Documentation'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            guidance: {
              type: 'object',
              properties: {
                lanes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      target: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      useCases: {
                        type: 'array',
                        items: { type: 'string' }
                      },
                      limitations: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  }
                },
                detectionCriteria: {
                  type: 'object',
                  properties: {
                    patterns: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          pattern: { type: 'string' },
                          target: { type: 'string' },
                          reason: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const guidance = {
      lanes: [
        {
          target: 'pages-static',
          name: 'Pages Static',
          description: 'Static site generation with no server-side functionality',
          useCases: [
            'Static websites and blogs',
            'JAMstack applications',
            'Client-side only applications',
            'Documentation sites'
          ],
          limitations: [
            'No server-side rendering',
            'No API routes',
            'No database connections',
            'Limited to public environment variables'
          ]
        },
        {
          target: 'pages-edge',
          name: 'Pages Edge',
          description: 'Server-side rendering with Edge Runtime compatibility',
          useCases: [
            'SSR applications with Edge-compatible code',
            'Applications using Web APIs only',
            'Fast global deployment needs',
            'Lightweight server-side logic'
          ],
          limitations: [
            'No Node.js built-ins',
            'No filesystem access',
            'Limited runtime APIs',
            'Cannot use service-role keys securely'
          ]
        },
        {
          target: 'workers-node',
          name: 'Workers with Node.js',
          description: 'Full server-side functionality with Node.js compatibility',
          useCases: [
            'Applications using Node.js built-ins',
            'Database connections requiring service keys',
            'Complex server-side logic',
            'ISR and revalidation features'
          ],
          limitations: [
            'Slightly higher cold start times',
            'Single-region deployment',
            'More complex debugging'
          ]
        }
      ],
      detectionCriteria: {
        patterns: [
          {
            pattern: 'export const revalidate',
            target: 'workers-node',
            reason: 'ISR requires Node.js runtime for background revalidation'
          },
          {
            pattern: 'node:fs, node:crypto',
            target: 'workers-node',
            reason: 'Node.js built-ins not available in Edge Runtime'
          },
          {
            pattern: 'SUPABASE_SERVICE_ROLE_KEY',
            target: 'workers-node',
            reason: 'Service keys require secure server environment'
          },
          {
            pattern: 'output: "export"',
            target: 'pages-static',
            reason: 'Static export configured in Next.js'
          },
          {
            pattern: 'export const runtime = "edge"',
            target: 'pages-edge',
            reason: 'Explicitly configured for Edge Runtime'
          }
        ]
      }
    };

    return reply.send({
      success: true,
      guidance
    });
  });
}