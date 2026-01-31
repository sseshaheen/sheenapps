import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../services/database';
import { domainService } from '../services/domainService';
import { requireHmacSignature } from '../middleware/hmacValidation';

interface PublishVersionRequest {
  userId: string;
  comment?: string;
}

interface UnpublishRequest {
  userId: string;
}

interface AddDomainRequest {
  domainName: string;
  domainType: 'sheenapps' | 'custom';
  isPrimary?: boolean;
}

interface PublishVersionParams {
  projectId: string;
  versionId: string;
}

interface UnpublishParams {
  projectId: string;
}

interface DomainParams {
  projectId: string;
}

// Enhanced rollback validation for publication targets
export async function validatePublicationTarget(targetVersionId: string): Promise<void> {
  if (!pool) {
    throw new Error('Database not configured');
  }

  const targetVersion = await pool.query(`
    SELECT version_name, major_version, minor_version, patch_version
    FROM project_versions 
    WHERE version_id = $1
  `, [targetVersionId]);
  
  if (!targetVersion.rows[0]) {
    throw new Error('Target version not found');
  }
  
  // Note: soft_deleted_at was removed from consolidated table - versions are hard deleted if needed
  // If version exists in query result, it's valid for publication
}

// Check if deployment can reuse existing preview URL (instant publication)
async function checkDeploymentOptions(versionId: string) {
  if (!pool) {
    return { canReuseDeployment: false, hasValidArtifact: false };
  }

  const result = await pool.query(`
    SELECT pv.preview_url, pv.artifact_url, pv.status
    FROM project_versions pv
    WHERE pv.version_id = $1 AND pv.status = 'deployed'
  `, [versionId]);

  const version = result.rows[0];
  return {
    canReuseDeployment: version?.preview_url && version?.status === 'deployed',
    hasValidArtifact: !!version?.artifact_url
  };
}

// Check if idempotency key has been used before
async function checkIdempotencyKey(idempotencyKey: string): Promise<{ used: boolean; response?: any }> {
  if (!pool) return { used: false };

  try {
    const result = await pool.query(`
      SELECT response_data, created_at
      FROM publication_idempotency_keys
      WHERE idempotency_key = $1 AND created_at > NOW() - INTERVAL '24 hours'
    `, [idempotencyKey]);

    if (result.rows.length > 0) {
      return { 
        used: true, 
        response: result.rows[0].response_data 
      };
    }
    return { used: false };
  } catch (error) {
    console.error('Error checking idempotency key:', error);
    return { used: false };
  }
}

// Store idempotency key with response
async function storeIdempotencyKey(idempotencyKey: string, response: any): Promise<void> {
  if (!pool) return;

  try {
    await pool.query(`
      INSERT INTO publication_idempotency_keys (idempotency_key, response_data, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [idempotencyKey, JSON.stringify(response)]);
  } catch (error) {
    console.error('Error storing idempotency key:', error);
    // Don't fail the operation for idempotency storage failures
  }
}

// Record publication metrics
async function recordPublicationMetrics(projectId: string, versionId: string, userId: string, timeMs?: number) {
  if (!pool) return;

  try {
    // Record publication event
    await pool.query(`
      INSERT INTO versioning_metrics (
        project_id,
        metric_type,
        metric_value,
        metadata
      ) VALUES ($1, 'publication', 1, $2)
    `, [projectId, { versionId, userId, timestamp: Date.now() }]);

    // Record creation-to-publication time if provided
    if (timeMs) {
      await pool.query(`
        INSERT INTO versioning_metrics (
          project_id,
          metric_type,
          metric_value
        ) VALUES ($1, 'creation_to_publication_ms', $2)
      `, [projectId, timeMs]);
    }
  } catch (error) {
    console.error('Failed to record publication metrics:', error);
    // Don't fail the operation for metrics failures
  }
}

export async function registerPublicationRoutes(app: FastifyInstance) {
  // Apply HMAC validation to all endpoints
  const hmacMiddleware = requireHmacSignature();

  // POST /projects/:projectId/publish/:versionId
  // Publish a specific version
  app.post('/v1/projects/:projectId/publish/:versionId', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ 
      Params: PublishVersionParams;
      Body: PublishVersionRequest;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId, versionId } = request.params;
    const { userId, comment } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    // Expert feedback: Add idempotency key support to prevent double-publishing
    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (idempotencyKey) {
      const idempotencyCheck = await checkIdempotencyKey(idempotencyKey);
      if (idempotencyCheck.used) {
        console.log(`[Publication] Returning cached response for idempotency key: ${idempotencyKey}`);
        return reply.send(idempotencyCheck.response);
      }
    }

    if (!pool) {
      return reply.code(500).send({ error: 'Database not configured' });
    }

    try {
      // Validate publication target
      await validatePublicationTarget(versionId);

      // Verify version exists and belongs to project
      const versionCheck = await pool.query(`
        SELECT version_id, version_name, major_version, minor_version, patch_version, created_at,
               preview_url, status, project_id, user_id
        FROM project_versions
        WHERE version_id = $1 AND project_id = $2 AND user_id = $3
      `, [versionId, projectId, userId]);

      if (versionCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Version not found or access denied' });
      }

      const version = versionCheck.rows[0];
      const versionName = version.version_name || `${version.major_version || 1}.${version.minor_version || 0}.${version.patch_version || 0}`;

      // Check if version is deployable
      if (version.status !== 'deployed') {
        return reply.code(400).send({ 
          error: 'Version not deployable',
          message: `Version ${versionName} has status '${version.status}' and cannot be published`
        });
      }

      // Check deployment options for instant vs async publication
      const { canReuseDeployment } = await checkDeploymentOptions(versionId);

      // Begin transaction for publication
      await pool.query('BEGIN');

      try {
        // Get current published version (if any)
        const currentPublished = await pool.query(`
          SELECT version_id, version_name, major_version, minor_version, patch_version
          FROM project_versions
          WHERE project_id = $1 AND is_published = true
        `, [projectId]);

        let previouslyPublished = null;
        if (currentPublished.rows.length > 0) {
          const prev = currentPublished.rows[0];
          previouslyPublished = {
            id: prev.version_id,
            semver: `${prev.major_version || 1}.${prev.minor_version || 0}.${prev.patch_version || 0}`,
            name: prev.version_name || `v${prev.major_version || 1}.${prev.minor_version || 0}.${prev.patch_version || 0}`
          };

          // Unpublish current version  
          await pool.query(`
            UPDATE project_versions
            SET is_published = false
            WHERE project_id = $1 AND is_published = true
          `, [projectId]);
        }

        // Publish new version
        await pool.query(`
          UPDATE project_versions
          SET is_published = true, published_at = NOW(), published_by_user_id = $1, user_comment = $2
          WHERE version_id = $3
        `, [userId, comment || null, versionId]);

        // Update denormalized column on projects table
        await pool.query(`
          UPDATE projects
          SET published_version_id = $1
          WHERE id = $2::uuid
        `, [versionId, projectId]);

        // Get domains for this project
        const domains = await pool.query(`
          SELECT domain_name, domain_type, is_primary
          FROM project_published_domains
          WHERE project_id = $1
          ORDER BY is_primary DESC, created_at ASC
        `, [projectId]);

        await pool.query('COMMIT');

        // Record metrics
        const createdAt = new Date(version.created_at);
        const publishedAt = new Date();
        const creationToPublicationTime = publishedAt.getTime() - createdAt.getTime();
        await recordPublicationMetrics(projectId, versionId, userId, creationToPublicationTime);

        // Update domain resolution (async - don't wait for completion)
        domainService.updateProjectDomainResolution(projectId)
          .then(result => {
            if (result.success) {
              console.log(`[Publication] Domain resolution updated for project ${projectId}:`, result.updated);
            } else {
              console.error(`[Publication] Domain resolution failed for project ${projectId}:`, result.errors);
            }
          })
          .catch(error => {
            console.error(`[Publication] Domain resolution error for project ${projectId}:`, error);
          });

        // Prepare response
        const response = {
          success: true,
          deployment: canReuseDeployment ? 'instant' : 'reused',
          publishedVersion: {
            id: versionId,
            semver: `${version.major_version || 1}.${version.minor_version || 0}.${version.patch_version || 0}`,
            name: versionName,
            publishedAt: publishedAt.toISOString(),
            publishedBy: userId
          },
          previouslyPublished,
          domains: domains.rows.map(d => ({
            domain: d.domain_name,
            type: d.domain_type,
            isPrimary: d.is_primary,
            url: `https://${d.domain_name}`
          }))
        };

        // Store idempotency key if provided
        if (idempotencyKey) {
          await storeIdempotencyKey(idempotencyKey, response);
        }

        if (canReuseDeployment) {
          return reply.status(200).send(response);
        } else {
          // For this initial implementation, we'll treat all as instant since we're reusing existing deployments
          return reply.status(200).send(response);
        }
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error: any) {
      console.error('Error publishing version:', error);
      return reply.code(500).send({ 
        error: 'Publication failed',
        details: error.message 
      });
    }
  });

  // POST /projects/:projectId/unpublish
  // Unpublish the currently published version
  app.post('/v1/projects/:projectId/unpublish', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ 
      Params: UnpublishParams;
      Body: UnpublishRequest;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { userId } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    // Expert feedback: Add idempotency key support to prevent double-unpublishing
    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (idempotencyKey) {
      const idempotencyCheck = await checkIdempotencyKey(idempotencyKey);
      if (idempotencyCheck.used) {
        console.log(`[Publication] Returning cached unpublish response for idempotency key: ${idempotencyKey}`);
        return reply.send(idempotencyCheck.response);
      }
    }

    if (!pool) {
      return reply.code(500).send({ error: 'Database not configured' });
    }

    try {
      await pool.query('BEGIN');

      // Get currently published version
      const published = await pool.query(`
        SELECT version_id, version_name, major_version, minor_version, patch_version
        FROM project_versions
        WHERE project_id = $1 AND is_published = true
      `, [projectId]);

      if (published.rows.length === 0) {
        await pool.query('ROLLBACK');
        return reply.code(404).send({ error: 'No published version found' });
      }

      const publishedVersion = published.rows[0];
      
      // Unpublish version
      await pool.query(`
        UPDATE project_versions
        SET is_published = false, published_at = NULL, published_by_user_id = NULL
        WHERE version_id = $1
      `, [publishedVersion.version_id]);

      // Clear denormalized column
      await pool.query(`
        UPDATE projects
        SET published_version_id = NULL
        WHERE id = $1::uuid
      `, [projectId]);

      await pool.query('COMMIT');

      const versionName = publishedVersion.version_name || 
        `${publishedVersion.major_version || 1}.${publishedVersion.minor_version || 0}.${publishedVersion.patch_version || 0}`;

      const response = {
        success: true,
        message: `Version ${versionName} unpublished successfully`,
        unpublishedVersion: {
          id: publishedVersion.version_id,
          semver: `${publishedVersion.major_version || 1}.${publishedVersion.minor_version || 0}.${publishedVersion.patch_version || 0}`,
          name: versionName
        }
      };

      // Store idempotency key if provided
      if (idempotencyKey) {
        await storeIdempotencyKey(idempotencyKey, response);
      }

      return reply.send(response);
    } catch (error: any) {
      await pool.query('ROLLBACK');
      console.error('Error unpublishing version:', error);
      return reply.code(500).send({ 
        error: 'Unpublish failed',
        details: error.message 
      });
    }
  });

  // POST /projects/:projectId/domains
  // Add a domain to a project
  app.post<{ Params: DomainParams; Body: AddDomainRequest }>('/v1/projects/:projectId/domains', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ 
      Params: DomainParams;
      Body: AddDomainRequest;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { domainName, domainType = 'sheenapps', isPrimary = false } = request.body;

    if (!domainName) {
      return reply.code(400).send({ error: 'domainName is required' });
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainRegex.test(domainName)) {
      return reply.code(400).send({ 
        error: 'Invalid domain format',
        message: 'Domain name must be a valid hostname'
      });
    }

    // Validate sheenapps.com subdomain format
    if (domainType === 'sheenapps' && !domainName.endsWith('.sheenapps.com')) {
      return reply.code(400).send({ 
        error: 'Invalid sheenapps domain',
        message: 'Sheenapps domains must end with .sheenapps.com'
      });
    }

    if (!pool) {
      return reply.code(500).send({ error: 'Database not configured' });
    }

    try {
      await pool.query('BEGIN');

      // If setting as primary, unset other primary domains
      if (isPrimary) {
        await pool.query(`
          UPDATE project_published_domains
          SET is_primary = false
          WHERE project_id = $1
        `, [projectId]);
      }

      // Insert new domain
      await pool.query(`
        INSERT INTO project_published_domains (project_id, domain_name, domain_type, is_primary)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id, domain_name) 
        DO UPDATE SET 
          domain_type = EXCLUDED.domain_type,
          is_primary = EXCLUDED.is_primary,
          updated_at = NOW()
      `, [projectId, domainName, domainType, isPrimary]);

      await pool.query('COMMIT');

      return reply.send({
        success: true,
        domain: {
          name: domainName,
          type: domainType,
          isPrimary,
          sslStatus: 'pending'
        },
        message: `Domain ${domainName} added successfully`
      });
    } catch (error: any) {
      await pool.query('ROLLBACK');
      
      if (error.code === '23505') { // Unique violation
        return reply.code(409).send({ 
          error: 'Domain already exists',
          message: `Domain ${domainName} is already registered to a project`
        });
      }

      console.error('Error adding domain:', error);
      return reply.code(500).send({ 
        error: 'Failed to add domain',
        details: error.message 
      });
    }
  });

  // GET /projects/:projectId/domains
  // List domains for a project
  app.get('/v1/projects/:projectId/domains', async (
    request: FastifyRequest<{ Params: DomainParams }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    if (!pool) {
      return reply.code(500).send({ error: 'Database not configured' });
    }

    try {
      const domains = await pool.query(`
        SELECT domain_name, domain_type, is_primary, ssl_status, created_at, updated_at
        FROM project_published_domains
        WHERE project_id = $1
        ORDER BY is_primary DESC, created_at ASC
      `, [projectId]);

      return reply.send({
        success: true,
        domains: domains.rows.map(d => ({
          name: d.domain_name,
          type: d.domain_type,
          isPrimary: d.is_primary,
          sslStatus: d.ssl_status,
          url: `https://${d.domain_name}`,
          createdAt: d.created_at,
          updatedAt: d.updated_at
        }))
      });
    } catch (error: any) {
      console.error('Error listing domains:', error);
      return reply.code(500).send({ 
        error: 'Failed to list domains',
        details: error.message 
      });
    }
  });

  // DELETE /projects/:projectId/domains/:domainName
  // Remove a domain from a project
  app.delete<{ Params: DomainParams & { domainName: string } }>('/v1/projects/:projectId/domains/:domainName', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: DomainParams & { domainName: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId, domainName } = request.params;

    if (!pool) {
      return reply.code(500).send({ error: 'Database not configured' });
    }

    try {
      const result = await pool.query(`
        DELETE FROM project_published_domains
        WHERE project_id = $1 AND domain_name = $2
        RETURNING domain_name, domain_type, is_primary
      `, [projectId, domainName]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Domain not found' });
      }

      const deletedDomain = result.rows[0];

      return reply.send({
        success: true,
        message: `Domain ${domainName} removed successfully`,
        removedDomain: {
          name: deletedDomain.domain_name,
          type: deletedDomain.domain_type,
          wasPrimary: deletedDomain.is_primary
        }
      });
    } catch (error: any) {
      console.error('Error removing domain:', error);
      return reply.code(500).send({ 
        error: 'Failed to remove domain',
        details: error.message 
      });
    }
  });

  // POST /projects/:projectId/domains/:domainName/verify
  // Verify domain ownership (for custom domains)
  app.post<{ Params: DomainParams & { domainName: string } }>('/v1/projects/:projectId/domains/:domainName/verify', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: DomainParams & { domainName: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId, domainName } = request.params;

    if (!pool) {
      return reply.code(500).send({ error: 'Database not configured' });
    }

    try {
      // Check if domain exists for this project
      const domainCheck = await pool.query(`
        SELECT domain_name, domain_type, ssl_status
        FROM project_published_domains
        WHERE project_id = $1 AND domain_name = $2
      `, [projectId, domainName]);

      if (domainCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Domain not found for this project' });
      }

      const domain = domainCheck.rows[0];

      // Get published version preview URL for verification
      const previewUrl = await domainService.getPublishedVersionPreviewUrl(projectId);
      
      if (!previewUrl) {
        return reply.code(400).send({ 
          error: 'No published version found',
          message: 'Domain verification requires a published version with preview URL'
        });
      }

      // Verify domain setup
      const verification = await domainService.verifyDomainSetup(domainName, previewUrl);
      
      if (verification.configured) {
        // Update SSL status and mark as verified
        await pool.query(`
          UPDATE project_published_domains
          SET ssl_status = 'active', updated_at = NOW()
          WHERE project_id = $1 AND domain_name = $2
        `, [projectId, domainName]);

        return reply.send({
          success: true,
          domain: domainName,
          configured: true,
          target: verification.actualTarget,
          message: `Domain ${domainName} is correctly configured and accessible`
        });
      } else {
        return reply.send({
          success: false,
          domain: domainName,
          configured: false,
          expectedTarget: previewUrl,
          actualTarget: verification.actualTarget,
          message: `Domain ${domainName} CNAME record needs to point to ${previewUrl}`
        });
      }
    } catch (error: any) {
      console.error('Error verifying domain:', error);
      return reply.code(500).send({ 
        error: 'Failed to verify domain',
        details: error.message 
      });
    }
  });

  // GET /projects/:projectId/publication-status
  // Get overall publication status for a project
  app.get<{ Params: DomainParams }>('/v1/projects/:projectId/publication-status', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: DomainParams }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    if (!pool) {
      return reply.code(500).send({ error: 'Database not configured' });
    }

    try {
      // Get published version info
      const publishedVersion = await pool.query(`
        SELECT 
          version_id, 
          version_name, 
          major_version, 
          minor_version, 
          patch_version,
          published_at,
          published_by_user_id,
          preview_url,
          status
        FROM project_versions
        WHERE project_id = $1 
          AND is_published = true
      `, [projectId]);

      // Get domains
      const domains = await pool.query(`
        SELECT domain_name, domain_type, is_primary, ssl_status
        FROM project_published_domains
        WHERE project_id = $1
        ORDER BY is_primary DESC, created_at ASC
      `, [projectId]);

      const hasPublishedVersion = publishedVersion.rows.length > 0;
      const publishedVersionData = hasPublishedVersion ? publishedVersion.rows[0] : null;

      return reply.send({
        success: true,
        projectId,
        hasPublishedVersion,
        publishedVersion: publishedVersionData ? {
          id: publishedVersionData.version_id,
          semver: `${publishedVersionData.major_version || 1}.${publishedVersionData.minor_version || 0}.${publishedVersionData.patch_version || 0}`,
          name: publishedVersionData.version_name,
          publishedAt: publishedVersionData.published_at,
          publishedBy: publishedVersionData.published_by_user_id,
          previewUrl: publishedVersionData.preview_url,
          status: publishedVersionData.status
        } : null,
        domains: domains.rows.map(d => ({
          name: d.domain_name,
          type: d.domain_type,
          isPrimary: d.is_primary,
          sslStatus: d.ssl_status,
          url: `https://${d.domain_name}`
        })),
        domainCount: domains.rows.length,
        activeDomains: domains.rows.filter(d => d.ssl_status === 'active').length
      });
    } catch (error: any) {
      console.error('Error getting publication status:', error);
      return reply.code(500).send({ 
        error: 'Failed to get publication status',
        details: error.message 
      });
    }
  });
}