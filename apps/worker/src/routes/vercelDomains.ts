import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getPool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { VercelAPIService } from '../services/vercelAPIService';
import { VercelSyncService } from '../services/vercelSyncService';
import { randomUUID } from 'crypto';

/**
 * Vercel Domain Management Routes
 * Handles custom domains, SSL certificates, and DNS verification
 * Provides domain configuration and monitoring capabilities
 */

interface DomainConfig {
  id: string;
  name: string;
  projectId: string;
  verified: boolean;
  gitBranch?: string;
  redirect?: string;
  httpsRedirect: boolean;
  sslCert?: {
    issuer: string;
    expiresAt: Date;
    autoRenew: boolean;
  };
  configuredBy: string;
  createdAt: Date;
}

interface DNSRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  ttl?: number;
}

export async function vercelDomainRoutes(fastify: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();
  const vercelAPI = new VercelAPIService();

  /**
   * GET /v1/projects/:projectId/vercel/domains
   * List domains for a Vercel project
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { userId: string; cursor?: string; limit?: string };
  }>('/v1/projects/:projectId/vercel/domains', {
    config: {
      security: { scheme: 'hmac', scope: ['domains:read'] }
    },
    preHandler: requireHmacSignature()
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { userId, cursor, limit = '20' } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required parameter: userId' });
    }

    try {
      // Verify project ownership and get Vercel connection
      const projectResult = await getPool().query(`
        SELECT 
          p.id,
          vpm.vercel_project_id,
          vc.id as connection_id
        FROM projects p
        JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
        JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
        WHERE p.id = $1 AND p.owner_id = $2
      `, [projectId, userId]);

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'Project not found or not linked to Vercel',
          code: 'PROJECT_NOT_FOUND'
        });
      }

      const project = projectResult.rows[0];

      // Get domains from Vercel API
      const domains = await vercelAPI.listDomains(project.connection_id, project.vercel_project_id, {
        cursor,
        limit: parseInt(limit)
      });

      // Get local domain configurations
      const localDomainsResult = await getPool().query(
        `SELECT * FROM vercel_domains WHERE vercel_project_id = $1 ORDER BY created_at DESC`,
        [project.vercel_project_id]
      );

      const localDomains = new Map(
        localDomainsResult.rows.map(d => [d.domain_name, d])
      );

      // Merge Vercel domains with local configurations
      const enhancedDomains = domains.domains.map((domain: any) => ({
        ...domain,
        localConfig: localDomains.get(domain.name),
        managedLocally: localDomains.has(domain.name)
      }));

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Domains listed for project',
        {
          projectId,
          vercelProjectId: project.vercel_project_id,
          domainCount: enhancedDomains.length
        }
      );

      reply.send({
        domains: enhancedDomains,
        pagination: domains.pagination
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'domain_list_error',
        error as Error,
        { projectId, userId }
      );

      reply.code(500).send({
        error: 'Failed to list domains',
        code: 'DOMAIN_LIST_ERROR'
      });
    }
  });

  /**
   * POST /v1/projects/:projectId/vercel/domains
   * Add a custom domain to Vercel project
   */
  fastify.post<{
    Params: { projectId: string };
    Body: {
      userId: string;
      domain: string;
      gitBranch?: string;
      redirect?: string;
      httpsRedirect?: boolean;
      autoConfigureDNS?: boolean;
    };
  }>('/v1/projects/:projectId/vercel/domains', async (request, reply) => {
    const { projectId } = request.params;
    const { 
      userId,
      domain, 
      gitBranch, 
      redirect, 
      httpsRedirect = true, 
      autoConfigureDNS = false 
    } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required field: userId' });
    }

    if (!domain || !isValidDomain(domain)) {
      return reply.code(400).send({
        error: 'Valid domain name is required',
        code: 'INVALID_DOMAIN'
      });
    }

    try {
      // Verify project ownership and get Vercel connection
      const projectResult = await getPool().query(`
        SELECT 
          p.id,
          vpm.vercel_project_id,
          vc.id as connection_id
        FROM projects p
        JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
        JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
        WHERE p.id = $1 AND p.owner_id = $2
      `, [projectId, userId]);

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'Project not found or not linked to Vercel',
          code: 'PROJECT_NOT_FOUND'
        });
      }

      const project = projectResult.rows[0];

      // Check if domain already exists
      const existingDomain = await getPool().query(
        'SELECT id FROM vercel_domains WHERE domain_name = $1 AND vercel_project_id = $2',
        [domain, project.vercel_project_id]
      );

      if (existingDomain.rows.length > 0) {
        return reply.code(409).send({
          error: 'Domain already configured for this project',
          code: 'DOMAIN_EXISTS'
        });
      }

      // Add domain to Vercel
      const vercelDomain = await vercelAPI.addDomain(project.connection_id, project.vercel_project_id, domain);

      // Store domain configuration locally
      const domainId = randomUUID();
      await getPool().query(`
        INSERT INTO vercel_domains (
          id, project_id, vercel_project_id, domain_name, git_branch,
          redirect_target, https_redirect, configured_by, verification_status,
          metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        domainId,
        projectId,
        project.vercel_project_id,
        domain,
        gitBranch,
        redirect,
        httpsRedirect,
        userId,
        'pending',
        JSON.stringify({
          autoConfigureDNS,
          vercelConfig: vercelDomain
        })
      ]);

      // Get DNS verification records
      const verificationRecords = await getDNSVerificationRecords(domain, vercelDomain);

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Domain added to Vercel project',
        {
          projectId,
          domain,
          vercelProjectId: project.vercel_project_id,
          domainId
        }
      );

      reply.code(201).send({
        message: 'Domain added successfully',
        domain: {
          id: domainId,
          name: domain,
          verified: false,
          verificationRecords,
          httpsRedirect,
          gitBranch,
          redirect
        }
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'domain_add_error',
        error as Error,
        { projectId, domain, userId }
      );

      reply.code(500).send({
        error: 'Failed to add domain',
        code: 'DOMAIN_ADD_ERROR',
        details: (error as Error).message
      });
    }
  });

  /**
   * GET /v1/projects/:projectId/vercel/domains/:domain/verification
   * Get DNS verification records for domain
   */
  fastify.get<{
    Params: { projectId: string; domain: string };
    Querystring: { userId: string };
  }>('/v1/projects/:projectId/vercel/domains/:domain/verification', async (request, reply) => {
    const { projectId, domain } = request.params;
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required parameter: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(`
        SELECT 
          vd.id,
          vd.verification_status,
          vd.metadata,
          vpm.vercel_project_id
        FROM vercel_domains vd
        JOIN projects p ON vd.project_id = p.id
        JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
        WHERE p.id = $1 AND p.owner_id = $2 AND vd.domain_name = $3
      `, [projectId, userId, decodeURIComponent(domain)]);

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'Domain not found or access denied',
          code: 'DOMAIN_NOT_FOUND'
        });
      }

      const domainConfig = projectResult.rows[0];

      // Get latest domain status from Vercel
      const vercelDomain = await vercelAPI.verifyDomain(
        projectResult.rows[0].connection_id,
        projectResult.rows[0].vercel_project_id,
        decodeURIComponent(domain)
      );
      
      // Get DNS records needed for verification
      const dnsRecords = await getDNSVerificationRecords(
        decodeURIComponent(domain), 
        vercelDomain
      );

      // Update local verification status if changed
      if (vercelDomain.verified !== (domainConfig.verification_status === 'verified')) {
        await getPool().query(
          'UPDATE vercel_domains SET verification_status = $1, updated_at = NOW() WHERE id = $2',
          [vercelDomain.verified ? 'verified' : 'pending', domainConfig.id]
        );
      }

      reply.send({
        domain: decodeURIComponent(domain),
        verified: vercelDomain.verified,
        verificationStatus: domainConfig.verification_status,
        dnsRecords,
        verificationInstructions: getVerificationInstructions(dnsRecords),
        lastChecked: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'domain_verification_check_error',
        error as Error,
        { projectId, domain, userId }
      );

      reply.code(500).send({
        error: 'Failed to check domain verification',
        code: 'VERIFICATION_CHECK_ERROR'
      });
    }
  });

  /**
   * POST /v1/projects/:projectId/vercel/domains/:domain/verify
   * Trigger domain verification check
   */
  fastify.post<{
    Params: { projectId: string; domain: string };
    Body: { userId: string };
  }>('/v1/projects/:projectId/vercel/domains/:domain/verify', async (request, reply) => {
    const { projectId, domain } = request.params;
    const { userId } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required field: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(`
        SELECT 
          vd.id,
          vpm.vercel_project_id
        FROM vercel_domains vd
        JOIN projects p ON vd.project_id = p.id
        JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
        WHERE p.id = $1 AND p.owner_id = $2 AND vd.domain_name = $3
      `, [projectId, userId, decodeURIComponent(domain)]);

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'Domain not found or access denied',
          code: 'DOMAIN_NOT_FOUND'
        });
      }

      const domainConfig = projectResult.rows[0];

      // Trigger verification check on Vercel
      const verificationResult = await vercelAPI.verifyDomain(
        projectResult.rows[0].connection_id,
        projectResult.rows[0].vercel_project_id,
        decodeURIComponent(domain)
      );

      // Update local verification status
      const newStatus = verificationResult.verified ? 'verified' : 'pending';
      await getPool().query(`
        UPDATE vercel_domains 
        SET 
          verification_status = $1,
          ssl_certificate_info = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [
        newStatus,
        verificationResult.ssl ? JSON.stringify(verificationResult.ssl) : null,
        domainConfig.id
      ]);

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Domain verification checked',
        {
          projectId,
          domain: decodeURIComponent(domain),
          verified: verificationResult.verified,
          previousStatus: domainConfig.verification_status
        }
      );

      reply.send({
        domain: decodeURIComponent(domain),
        verified: verificationResult.verified,
        ssl: verificationResult.ssl,
        message: verificationResult.verified 
          ? 'Domain successfully verified!'
          : 'Domain verification pending - please check DNS records'
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'domain_verification_trigger_error',
        error as Error,
        { projectId, domain, userId }
      );

      reply.code(500).send({
        error: 'Failed to verify domain',
        code: 'DOMAIN_VERIFICATION_ERROR',
        details: (error as Error).message
      });
    }
  });

  /**
   * DELETE /v1/projects/:projectId/vercel/domains/:domain
   * Remove domain from Vercel project
   */
  fastify.delete<{
    Params: { projectId: string; domain: string };
    Querystring: { userId: string };
  }>('/v1/projects/:projectId/vercel/domains/:domain', async (request, reply) => {
    const { projectId, domain } = request.params;
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required parameter: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(`
        SELECT 
          vd.id,
          vpm.vercel_project_id
        FROM vercel_domains vd
        JOIN projects p ON vd.project_id = p.id
        JOIN vercel_project_mappings vpm ON p.id = vpm.project_id
        WHERE p.id = $1 AND p.owner_id = $2 AND vd.domain_name = $3
      `, [projectId, userId, decodeURIComponent(domain)]);

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'Domain not found or access denied',
          code: 'DOMAIN_NOT_FOUND'
        });
      }

      const domainConfig = projectResult.rows[0];

      // Remove domain from Vercel
      await vercelAPI.removeDomain(
        projectResult.rows[0].connection_id,
        projectResult.rows[0].vercel_project_id,
        decodeURIComponent(domain)
      );

      // Remove from local database
      await getPool().query(
        'DELETE FROM vercel_domains WHERE id = $1',
        [domainConfig.id]
      );

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Domain removed from Vercel project',
        {
          projectId,
          domain: decodeURIComponent(domain),
          vercelProjectId: domainConfig.vercel_project_id
        }
      );

      reply.send({
        message: 'Domain removed successfully',
        domain: decodeURIComponent(domain)
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'domain_remove_error',
        error as Error,
        { projectId, domain, userId }
      );

      reply.code(500).send({
        error: 'Failed to remove domain',
        code: 'DOMAIN_REMOVE_ERROR'
      });
    }
  });

  /**
   * Helper methods
   */
  
  // Validate domain name format
  function isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  // Get DNS verification records
  async function getDNSVerificationRecords(domain: string, vercelDomain: any): Promise<DNSRecord[]> {
    const records: DNSRecord[] = [];

    // Add CNAME record for domain verification
    if (vercelDomain.verification) {
      records.push({
        type: 'CNAME',
        name: domain,
        value: 'cname.vercel-dns.com',
        ttl: 300
      });
    }

    // Add TXT record for ownership verification
    if (vercelDomain.verification && vercelDomain.verification.domain) {
      records.push({
        type: 'TXT',
        name: `_vercel.${domain}`,
        value: vercelDomain.verification.domain,
        ttl: 300
      });
    }

    return records;
  }

  // Get verification instructions
  function getVerificationInstructions(dnsRecords: DNSRecord[]): string {
    const instructions: string[] = [
      'To verify your domain, please add the following DNS records:',
      ''
    ];

    dnsRecords.forEach((record, index) => {
      instructions.push(`${index + 1}. Add ${record.type} record:`);
      instructions.push(`   Name: ${record.name}`);
      instructions.push(`   Value: ${record.value}`);
      if (record.ttl) {
        instructions.push(`   TTL: ${record.ttl} seconds`);
      }
      instructions.push('');
    });

    instructions.push('DNS changes may take up to 24 hours to propagate.');
    instructions.push('Once configured, click "Verify Domain" to check the status.');

    return instructions.join('\n');
  }
}

// Database schema for domain management
export const DOMAINS_TABLE_SQL = `
-- Vercel domains table
CREATE TABLE IF NOT EXISTS vercel_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vercel_project_id VARCHAR(255) NOT NULL,
  domain_name VARCHAR(253) NOT NULL,
  git_branch VARCHAR(255),
  redirect_target VARCHAR(500),
  https_redirect BOOLEAN DEFAULT true,
  configured_by VARCHAR(255) NOT NULL,
  verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'error')),
  ssl_certificate_info JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vercel_project_id, domain_name)
);

-- Indexes for domain management
CREATE INDEX IF NOT EXISTS idx_vercel_domains_project 
  ON vercel_domains(project_id);
CREATE INDEX IF NOT EXISTS idx_vercel_domains_vercel_project 
  ON vercel_domains(vercel_project_id);
CREATE INDEX IF NOT EXISTS idx_vercel_domains_status 
  ON vercel_domains(verification_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_vercel_domains_domain_name 
  ON vercel_domains(domain_name);
`;