/**
 * 📊 Observability Configuration
 * Unified OTLP + Faro configuration with environment detection
 */

import { getAnalyticsEnvironment, type AnalyticsEnvironment } from './analytics-environment'

// Get environment detection results
export const observabilityEnvironment: AnalyticsEnvironment = getAnalyticsEnvironment()

// Server-side OTLP configuration (unified pipeline, aligned with worker backend)
export const otlpConfig = {
  enabled: observabilityEnvironment.shouldEnableAnalytics,
  
  // OTLP endpoint and auth (configured via environment variables)
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS,
  protocol: process.env.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf',
  
  // Service information (standardized with worker backend)
  serviceName: process.env.OTEL_SERVICE_NAME || 'sheenapps-web',
  serviceNamespace: 'sheenapps',
  serviceVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  
  // Environment and deployment info (aligned with worker)
  deploymentEnvironment: observabilityEnvironment.type,
  region: 'eu-west-2',
  
  // Sampling configuration
  traceSampler: process.env.OTEL_TRACES_SAMPLER || 'parentbased_traceidratio',
  traceSamplerArg: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '0.1'),
  
  // Debug settings
  debugMode: process.env.NODE_ENV === 'development'
} as const

// Frontend Faro configuration (simplified - now handled by faro.client.ts)
export const faroConfig = {
  enabled: !!process.env.NEXT_PUBLIC_FARO_URL,
  url: process.env.NEXT_PUBLIC_FARO_URL,
  app: {
    name: 'sheenapps',
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
    environment: process.env.NEXT_PUBLIC_ENV || 'development'
  }
} as const

// Grafana feature flags
export const grafanaFeatures = {
  enableGrafana: process.env.NEXT_PUBLIC_ENABLE_GRAFANA === 'true',
  enableFrontendObservability: process.env.NEXT_PUBLIC_ENABLE_FRONTEND_OBSERVABILITY === 'true',
  enableTracing: process.env.NEXT_PUBLIC_ENABLE_TRACING === 'true',
  
  // Override controls (following existing analytics pattern)
  forceEnable: process.env.NEXT_PUBLIC_FORCE_GRAFANA === 'true',
  forceDisable: process.env.NEXT_PUBLIC_DISABLE_GRAFANA === 'true'
} as const

// Environment-aware enablement
export const isObservabilityEnabled = () => {
  if (grafanaFeatures.forceDisable) return false
  if (grafanaFeatures.forceEnable) return true
  return observabilityEnvironment.shouldEnableAnalytics && grafanaFeatures.enableGrafana
}

// Validation helper
export function validateObservabilityConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!otlpConfig.endpoint) {
    errors.push('OTEL_EXPORTER_OTLP_ENDPOINT is required for server observability')
  }
  
  if (!otlpConfig.headers) {
    errors.push('OTEL_EXPORTER_OTLP_HEADERS is required for authentication')
  }
  
  // Faro URL is optional - handled gracefully by faro.client.ts
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Development helpers
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).observabilityConfig = {
    otlp: otlpConfig,
    faro: faroConfig,
    features: grafanaFeatures,
    environment: observabilityEnvironment,
    validation: validateObservabilityConfig()
  }
  
  console.group('📊 Grafana Observability Configuration')
  console.log('🌍 Environment:', {
    type: observabilityEnvironment.type,
    shouldEnable: observabilityEnvironment.shouldEnableAnalytics,
    reason: observabilityEnvironment.reason
  })
  console.log('🔧 OTLP Config:', {
    enabled: otlpConfig.enabled,
    endpoint: otlpConfig.endpoint ? '✅ Configured' : '❌ Missing',
    serviceName: otlpConfig.serviceName,
    deploymentEnvironment: otlpConfig.deploymentEnvironment
  })
  console.log('🌐 Faro Config:', {
    enabled: faroConfig.enabled,
    url: faroConfig.url ? '✅ Configured' : '❌ Missing (check faro.client.ts)',
    app: faroConfig.app
  })
  
  const validation = validateObservabilityConfig()
  if (!validation.isValid) {
    console.warn('⚠️ Observability Configuration Issues:')
    validation.errors.forEach(error => console.warn(`  - ${error}`))
  } else {
    console.log('✅ Configuration valid')
  }
  
  if (!observabilityEnvironment.shouldEnableAnalytics) {
    console.log('🛡️ DATA PROTECTION: Development observability disabled')
    console.log('💡 To test: Add NEXT_PUBLIC_FORCE_GRAFANA=true to .env.local')
  }
  
  console.groupEnd()
}