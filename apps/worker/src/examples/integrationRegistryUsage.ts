/**
 * Integration Registry Usage Examples
 * 
 * This file demonstrates how to use the new project integration registry
 * for common dashboard and API scenarios. These are the exact patterns
 * recommended by the consultant.
 */

import { ProjectIntegrationService } from '../services/projectIntegrationService';

// Example usage in dashboard components
export class IntegrationDashboardHelpers {
  private integrationService = ProjectIntegrationService.getInstance();

  /**
   * Dashboard: Get all projects with their integration status
   * Perfect for project list views showing integration badges
   */
  async getDashboardProjects(userId: string) {
    const projects = await this.integrationService.getProjectsWithIntegrations(userId);
    
    // Example response structure:
    // [
    //   {
    //     id: "proj_123",
    //     name: "My App",
    //     active_integrations: ["supabase", "stripe"],
    //     has_supabase: true,
    //     has_sanity: false,
    //     has_stripe: true
    //   }
    // ]
    
    return projects.map(project => ({
      ...project,
      integrationCount: project.active_integrations.length,
      isFullyIntegrated: project.active_integrations.length >= 2 // Example business logic
    }));
  }

  /**
   * Analytics: Get integration adoption rates
   * Perfect for admin dashboards and growth metrics
   */
  async getIntegrationAnalytics() {
    const counts = await this.integrationService.getIntegrationCounts();
    const health = await this.integrationService.getIntegrationHealthSummary();
    
    return {
      adoptionRates: counts.map(count => ({
        integration: count.type,
        connected: count.total_connected,
        errorRate: count.total_error > 0 ? 
          (count.total_error / (count.total_connected + count.total_error) * 100).toFixed(1) + '%' : 
          '0%'
      })),
      overallHealth: {
        percentage: health.health_percentage,
        status: health.health_percentage >= 95 ? 'excellent' : 
                health.health_percentage >= 85 ? 'good' : 'needs_attention',
        totalIntegrations: health.total_integrations,
        errorsNeedingAttention: health.error_integrations
      }
    };
  }

  /**
   * Project Settings: Get detailed integration status for a project
   * Perfect for project settings pages showing integration details
   */
  async getProjectIntegrationDetails(projectId: string) {
    const integrations = await this.integrationService.getProjectIntegrations(projectId);
    
    return {
      summary: {
        totalIntegrations: integrations.length,
        activeIntegrations: integrations.filter(i => i.status === 'connected').length,
        hasErrors: integrations.some(i => i.status === 'error')
      },
      integrations: integrations.map(integration => ({
        type: integration.type,
        status: integration.status,
        connectedSince: integration.connected_at,
        lastError: integration.error_reason,
        metadata: integration.metadata, // Supabase project ref, etc.
        canReconnect: ['error', 'disconnected'].includes(integration.status)
      }))
    };
  }

  /**
   * Deployment Pipeline: Quick integration checks
   * Perfect for build-time integration detection
   */
  async checkDeploymentIntegrations(projectId: string) {
    const [hasSupabase, hasSanity, hasStripe] = await Promise.all([
      this.integrationService.hasIntegration(projectId, 'supabase'),
      this.integrationService.hasIntegration(projectId, 'sanity'),
      this.integrationService.hasIntegration(projectId, 'stripe')
    ]);

    return {
      requiresSupabaseCredentials: hasSupabase,
      requiresSanityCredentials: hasSanity,
      requiresStripeCredentials: hasStripe,
      needsEnvironmentVariables: hasSupabase || hasSanity || hasStripe,
      deploymentComplexity: [hasSupabase, hasSanity, hasStripe].filter(Boolean).length
    };
  }

  /**
   * Error Handling: Update integration status when something fails
   * Perfect for OAuth refresh failures or API errors
   */
  async handleIntegrationError(projectId: string, integrationType: 'supabase' | 'sanity' | 'stripe', errorMessage: string) {
    const updated = await this.integrationService.updateIntegrationStatus(
      projectId,
      integrationType,
      'error',
      errorMessage
    );

    if (updated) {
      // Could trigger alerts, notifications, etc.
      console.log(`⚠️ Integration ${integrationType} for project ${projectId} marked as error: ${errorMessage}`);
    }

    return updated;
  }
}

// Example API response handlers for common scenarios
export const integrationAPIExamples = {
  
  /**
   * Dashboard API: Projects with integration badges
   * GET /v1/internal/integrations/projects?userId=user_123
   */
  dashboardProjectsResponse: {
    projects: [
      {
        id: "proj_123",
        name: "E-commerce App",
        active_integrations: ["supabase", "stripe"],
        has_supabase: true,
        has_sanity: false,
        has_stripe: true
      },
      {
        id: "proj_456", 
        name: "Blog Site",
        active_integrations: ["sanity"],
        has_supabase: false,
        has_sanity: true,
        has_stripe: false
      }
    ],
    total: 2
  },

  /**
   * Analytics API: Integration adoption metrics
   * GET /v1/internal/integrations/counts
   */
  analyticsResponse: {
    integrationCounts: [
      {
        type: "supabase",
        total_connected: 145,
        total_pending: 3,
        total_error: 2
      },
      {
        type: "sanity", 
        total_connected: 89,
        total_pending: 1,
        total_error: 0
      },
      {
        type: "stripe",
        total_connected: 67,
        total_pending: 0,
        total_error: 1
      }
    ],
    timestamp: "2025-01-17T10:30:00Z"
  },

  /**
   * Health Check API: Integration system health
   * GET /v1/internal/integrations/health
   */
  healthResponse: {
    total_integrations: 301,
    healthy_integrations: 298,
    error_integrations: 3,
    health_percentage: 99,
    status: "healthy",
    timestamp: "2025-01-17T10:30:00Z"
  }
};

// SQL queries used under the hood (for reference)
export const consultantRecommendedQueries = {
  
  /**
   * Dashboard Projects Query (optimized with indexes)
   * Uses the consultant's exact recommendation
   */
  dashboardQuery: `
    SELECT p.id,
           p.name,
           COALESCE(json_agg(pi.type) FILTER (WHERE pi.status='connected'), '[]') AS active_integrations
    FROM projects p
    LEFT JOIN project_integrations pi ON pi.project_id = p.id
    WHERE p.owner_id = $1
    GROUP BY p.id;
  `,

  /**
   * Quick Boolean Check (uses partial index on status='connected')
   * Extremely fast for deployment pipeline checks
   */
  hasIntegrationQuery: `
    SELECT EXISTS (
      SELECT 1 FROM project_integrations 
      WHERE project_id = $1 AND type = $2 AND status = 'connected'
    ) as has_integration;
  `,

  /**
   * Analytics Aggregation (efficient grouping)
   * Perfect for admin dashboards
   */
  countsQuery: `
    SELECT type, COUNT(*) 
    FROM project_integrations
    WHERE status = 'connected'
    GROUP BY type;
  `
};