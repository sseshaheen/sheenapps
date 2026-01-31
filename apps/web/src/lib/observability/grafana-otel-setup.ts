/**
 * 📊 Grafana OpenTelemetry Setup
 * Server-side observability initialization with environment detection
 */

import 'server-only'

export async function initializeGrafanaObservability() {
  try {
    // Dynamic imports to avoid issues during build
    const { otlpConfig, isObservabilityEnabled } = await import('@/config/observability-config')
    
    // Only enable observability in appropriate environments
    if (!isObservabilityEnabled() || !otlpConfig.enabled) {
      if (otlpConfig.debugMode) {
        console.log('📊 Grafana observability disabled', {
          observabilityEnabled: isObservabilityEnabled(),
          otlpEnabled: otlpConfig.enabled,
          deploymentEnvironment: otlpConfig.deploymentEnvironment
        })
      }
      return
    }
    
    // ADDITIONAL PROTECTION: Block development/localhost environments
    const forceEnable = process.env.NEXT_PUBLIC_FORCE_GRAFANA === 'true'
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development'
    
    if (isDevelopment && !forceEnable) {
      console.log('🛡️ Grafana OTLP: Blocked development telemetry', {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
        deploymentEnvironment: otlpConfig.deploymentEnvironment,
        forceEnable
      })
      return
    }
    
    // Validate required configuration
    if (!otlpConfig.endpoint || !otlpConfig.headers) {
      console.warn('📊 Grafana observability: Missing OTLP configuration')
      return
    }
    
    // Initialize @vercel/otel with standardized configuration (aligned with worker backend)
    const { registerOTel } = await import('@vercel/otel')
    
    registerOTel({
      serviceName: otlpConfig.serviceName,
      
      // Let @vercel/otel handle instrumentation automatically
      // Environment variables (OTEL_RESOURCE_ATTRIBUTES, OTEL_TRACES_SAMPLER, etc.) 
      // are automatically picked up by @vercel/otel
      instrumentationConfig: {
        // Use default instrumentations for Next.js
      }
    })
    
    if (otlpConfig.debugMode) {
      console.log('📊 Grafana OpenTelemetry initialized successfully', {
        service: otlpConfig.serviceName,
        version: otlpConfig.serviceVersion,
        deploymentEnvironment: otlpConfig.deploymentEnvironment,
        endpoint: otlpConfig.endpoint ? 'configured' : 'missing'
      })
    }
    
    // Initialize custom business metrics
    await initializeBusinessMetrics()
    
  } catch (error) {
    console.error('Failed to initialize Grafana observability:', error)
  }
}

async function initializeBusinessMetrics() {
  try {
    const { metrics } = await import('@opentelemetry/api')
    const { otlpConfig } = await import('@/config/observability-config')
    
    // Create meter for SheenApps business metrics
    const meter = metrics.getMeter('sheenapps-business', otlpConfig.serviceVersion)
    
    // Define business metrics (exported for use in application)
    const businessMetrics = {
      // User engagement metrics
      projectsCreated: meter.createCounter('projects_created_total', {
        description: 'Total number of projects created',
        unit: '1'
      }),
      
      // Performance metrics
      builderLoadTime: meter.createHistogram('builder_load_duration', {
        description: 'Builder component load time',
        unit: 's'
      }),
      
      // API performance metrics
      apiRequestDuration: meter.createHistogram('api_request_duration', {
        description: 'API request duration',
        unit: 's'
      }),
      
      // Error tracking
      applicationErrors: meter.createCounter('application_errors_total', {
        description: 'Application errors by type',
        unit: '1'
      }),
      
      // User journey metrics
      userLogins: meter.createCounter('user_logins_total', {
        description: 'User login events',
        unit: '1'
      }),
      
      // Plan upgrade metrics
      planUpgrades: meter.createCounter('plan_upgrades_total', {
        description: 'Plan upgrade events',
        unit: '1'
      })
    }
    
    // Make metrics available globally for application use
    if (typeof globalThis !== 'undefined') {
      ;(globalThis as any).sheenAppsMetrics = businessMetrics
    }
    
    if (otlpConfig.debugMode) {
      console.log('📊 Business metrics initialized:', Object.keys(businessMetrics))
    }
    
  } catch (error) {
    console.error('Failed to initialize business metrics:', error)
  }
}

// Helper function to get business metrics in application code
export function getBusinessMetrics() {
  return (globalThis as any).sheenAppsMetrics || null
}