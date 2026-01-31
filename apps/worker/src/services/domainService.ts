import { pool } from './database';

interface DomainRecord {
  project_id: string;
  domain_name: string;
  domain_type: 'sheenapps' | 'custom';
  is_primary: boolean;
  ssl_status: 'pending' | 'active' | 'failed';
}

interface CNAMEUpdateResult {
  success: boolean;
  domain: string;
  target: string;
  message?: string;
  error?: string;
}

/**
 * Domain service for managing CNAME records and SSL certificates
 */
export class DomainService {
  
  /**
   * Update CNAME record to point domain to preview URL
   */
  async updateCNAME(domain: string, previewUrl: string): Promise<CNAMEUpdateResult> {
    // Extract hostname from preview URL
    const target = this.extractHostname(previewUrl);
    
    if (!target) {
      return {
        success: false,
        domain,
        target: '',
        error: 'Invalid preview URL format'
      };
    }

    // For sheenapps.com subdomains, we would integrate with Cloudflare API
    // For now, this is a placeholder implementation
    if (domain.endsWith('.sheenapps.com')) {
      return await this.updateSheenappsSubdomain(domain, target);
    } else {
      return await this.updateCustomDomain(domain, target);
    }
  }

  /**
   * Update sheenapps.com subdomain CNAME record
   */
  private async updateSheenappsSubdomain(domain: string, target: string): Promise<CNAMEUpdateResult> {
    // Integrate with Cloudflare API via enhanced domain service
    try {
      const { cloudflareEnhancedDomainService } = await import('./cloudflareEnhancedDomainService');
      return await cloudflareEnhancedDomainService.updateSheenappsSubdomain(domain, target);
    } catch (error: any) {
      console.error(`[Domain Service] Cloudflare integration failed: ${error.message}`);

      // Fallback to placeholder behavior for development/testing
      return {
        success: false,
        domain,
        target,
        error: `Cloudflare integration unavailable: ${error.message}`
      };
    }
  }

  /**
   * Handle custom domain CNAME setup
   */
  private async updateCustomDomain(domain: string, target: string): Promise<CNAMEUpdateResult> {
    // For custom domains, user needs to manually set CNAME record
    // We can provide instructions and verify the setup
    
    return {
      success: true,
      domain,
      target,
      message: `To complete setup, add this CNAME record to your DNS: ${domain} -> ${target}`
    };
  }

  /**
   * Extract hostname from URL
   */
  private extractHostname(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      console.error('Failed to extract hostname from URL:', url, error);
      return null;
    }
  }

  /**
   * Validate domain ownership (for custom domains)
   */
  async validateDomainOwnership(domain: string): Promise<{ valid: boolean; method: string; value?: string }> {
    // Generate a unique validation token
    const validationToken = `sheenapps-verification-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // For custom domains, user needs to add TXT record for verification
    return {
      valid: false, // Will be checked after user adds TXT record
      method: 'TXT',
      value: validationToken
    };
  }

  /**
   * Check if domain CNAME is correctly configured with observability tracking
   */
  async verifyDomainSetup(domain: string, expectedTarget: string): Promise<{ configured: boolean; actualTarget?: string; error?: string }> {
    // Update DNS check timestamp
    if (pool) {
      try {
        await pool.query(`
          UPDATE project_published_domains
          SET last_dns_checked_at = NOW(), dns_error_message = NULL
          WHERE domain_name = $1
        `, [domain]);
      } catch (error) {
        console.error('Failed to update DNS check timestamp:', error);
      }
    }

    try {
      // Use enhanced Cloudflare service for actual DNS lookup verification
      const { cloudflareEnhancedDomainService } = await import('./cloudflareEnhancedDomainService');
      const verificationResult = await cloudflareEnhancedDomainService.verifyCNAMERecord(domain, expectedTarget);

      console.log(`[Domain Service] DNS verification result: ${domain} -> ${verificationResult.isConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);

      if (!verificationResult.isConfigured && pool) {
        // Store error message for user visibility
        const errorMsg = verificationResult.error || 'CNAME record not found or incorrect';
        await pool.query(`
          UPDATE project_published_domains
          SET dns_error_message = $1
          WHERE domain_name = $2
        `, [errorMsg, domain]);
      }

      return {
        configured: verificationResult.isConfigured,
        actualTarget: verificationResult.actualTarget || expectedTarget
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'DNS verification failed';
      
      // Store error for user visibility
      if (pool) {
        try {
          await pool.query(`
            UPDATE project_published_domains
            SET dns_error_message = $1
            WHERE domain_name = $2
          `, [errorMessage, domain]);
        } catch (updateError) {
          console.error('Failed to store DNS error:', updateError);
        }
      }

      return {
        configured: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get published version's preview URL for domain resolution
   */
  async getPublishedVersionPreviewUrl(projectId: string): Promise<string | null> {
    if (!pool) {
      return null;
    }

    try {
      const result = await pool.query(`
        SELECT preview_url
        FROM project_versions
        WHERE project_id = $1 
          AND is_published = true 
          AND status = 'deployed'
      `, [projectId]);

      return result.rows[0]?.preview_url || null;
    } catch (error) {
      console.error('Error getting published version preview URL:', error);
      return null;
    }
  }

  /**
   * Update domain resolution for a project after publication
   */
  async updateProjectDomainResolution(projectId: string): Promise<{ success: boolean; updated: string[]; errors: string[] }> {
    if (!pool) {
      return { success: false, updated: [], errors: ['Database not configured'] };
    }

    try {
      // Get published version's preview URL
      const previewUrl = await this.getPublishedVersionPreviewUrl(projectId);
      
      if (!previewUrl) {
        return { 
          success: false, 
          updated: [], 
          errors: ['No published version found or no preview URL available'] 
        };
      }

      // Get all domains for this project
      const domainsResult = await pool.query(`
        SELECT domain_name, domain_type, is_primary
        FROM project_published_domains
        WHERE project_id = $1
      `, [projectId]);

      const domains = domainsResult.rows;
      const updated: string[] = [];
      const errors: string[] = [];

      // Update CNAME for each domain
      for (const domain of domains) {
        const result = await this.updateCNAME(domain.domain_name, previewUrl);
        
        if (result.success) {
          updated.push(domain.domain_name);
          console.log(`[Domain Service] Updated ${domain.domain_name} -> ${previewUrl}`);
        } else {
          errors.push(`${domain.domain_name}: ${result.error}`);
          console.error(`[Domain Service] Failed to update ${domain.domain_name}:`, result.error);
        }
      }

      return {
        success: errors.length === 0,
        updated,
        errors
      };
    } catch (error) {
      console.error('Error updating project domain resolution:', error);
      return {
        success: false,
        updated: [],
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Provision SSL certificate for domain with observability tracking
   */
  async provisionSSLCertificate(domain: string): Promise<{ success: boolean; message: string; error?: string }> {
    // Update SSL check timestamp
    if (pool) {
      try {
        await pool.query(`
          UPDATE project_published_domains
          SET last_ssl_checked_at = NOW(), ssl_error_message = NULL
          WHERE domain_name = $1
        `, [domain]);
      } catch (error) {
        console.error('Failed to update SSL check timestamp:', error);
      }
    }

    try {
      // Use enhanced Cloudflare service for SSL provisioning
      const { cloudflareEnhancedDomainService } = await import('./cloudflareEnhancedDomainService');
      const sslResult = await cloudflareEnhancedDomainService.provisionSSLCertificate(domain);

      console.log(`[Domain Service] SSL provisioning result: ${domain} -> ${sslResult.success ? 'SUCCESS' : 'FAILED'}`);

      // Update SSL status in database
      if (pool) {
        const newStatus = sslResult.success ? 'active' : 'failed';
        await pool.query(`
          UPDATE project_published_domains
          SET ssl_status = $1, updated_at = NOW()
          WHERE domain_name = $2
        `, [newStatus, domain]);

        // Store error message if SSL failed
        if (!sslResult.success && sslResult.error) {
          await pool.query(`
            UPDATE project_published_domains
            SET ssl_error_message = $1
            WHERE domain_name = $2
          `, [sslResult.error, domain]);
        }
      }

      return {
        success: sslResult.success,
        message: sslResult.success
          ? `SSL certificate provisioned for ${domain}`
          : `SSL certificate provisioning failed for ${domain}: ${sslResult.error || 'Unknown error'}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'SSL provisioning failed';
      
      // Store error for user visibility
      if (pool) {
        try {
          await pool.query(`
            UPDATE project_published_domains
            SET ssl_status = 'failed', ssl_error_message = $1
            WHERE domain_name = $2
          `, [errorMessage, domain]);
        } catch (updateError) {
          console.error('Failed to store SSL error:', updateError);
        }
      }

      return {
        success: false,
        message: `SSL certificate provisioning failed for ${domain}`,
        error: errorMessage
      };
    }
  }
}

// Export singleton instance
export const domainService = new DomainService();