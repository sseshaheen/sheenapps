/**
 * OpenTelemetry SDK Configuration for Sheenapps Worker
 * Initializes tracing, metrics, and logging with OTLP exporters
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { 
  BatchSpanProcessor, 
  ConsoleSpanExporter,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  AlwaysOffSampler
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getCleanOtelConfig, suppressInstrumentationLogs } from './otel-config';

// Get clean configuration
const config = getCleanOtelConfig();

// Suppress verbose instrumentation logs IMMEDIATELY before any imports
// This must happen before getNodeAutoInstrumentations is loaded
if (config.suppressInstrumentationLogs) {
  suppressInstrumentationLogs();
  
  // Also silence the OpenTelemetry SDK's default logging
  process.env.OTEL_LOG_LEVEL = process.env.OTEL_LOG_LEVEL || 'error';
}

// Enable diagnostics for debugging (disable in production)
if (process.env.OTEL_DEBUG === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

// Determine environment
const ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = ENV === 'production';
const IS_DEVELOPMENT = ENV === 'development';

// Configure sampling based on environment
// Use OTEL standard env vars for configuration
const getSampler = () => {
  // Use cleaned sampler configuration from config
  const samplerName = config.sampler || 'parentbased_traceidratio';
  const samplerArg = parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '0.1');
  
  // Handle different sampler types
  switch (samplerName) {
    case 'always_on':
    case 'alwayson': // Handle legacy incorrect value
      return new AlwaysOnSampler();
    
    case 'always_off':
    case 'alwaysoff': // Handle legacy incorrect value
      return new AlwaysOffSampler();
    
    case 'parentbased_always_on':
      return new ParentBasedSampler({
        root: new AlwaysOnSampler(),
      });
    
    case 'parentbased_always_off':
      return new ParentBasedSampler({
        root: new AlwaysOffSampler(),
      });
    
    case 'parentbased_traceidratio':
      return new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(samplerArg),
      });
    
    case 'traceidratio':
      return new TraceIdRatioBasedSampler(samplerArg);
    
    default:
      // Default to parent-based 10% sampling for production
      if (IS_PRODUCTION) {
        return new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(0.1),
        });
      }
      // Default to always on for development
      return new AlwaysOnSampler();
  }
};

// Build resource attributes - use the resources option in SDK config
const resourceAttributes = {
    'service.name': process.env.OTEL_SERVICE_NAME || 'sheenapps-worker',
    'service.namespace': 'sheenapps',
    'service.version': process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
    'service.instance.id': process.env.INSTANCE_ID || require('os').hostname(),
    'deployment.environment': ENV,
    'host.name': process.env.HOSTNAME || require('os').hostname(),
    'process.pid': process.pid,
    'process.runtime.name': 'node',
    'process.runtime.version': process.versions.node,
    // Custom attributes
    'team': 'platform',
    'region': process.env.AWS_REGION || 'eu-west-2',
    'worker.version': '1.0.0',
};

// Configure trace exporter based on clean config
const getTraceExporter = () => {
  // Use console exporter only if explicitly requested and no OTLP endpoint
  if (config.useConsoleExporter) {
    return new ConsoleSpanExporter();
  }
  
  // Skip OTLP if no valid endpoint configured
  if (!config.useOtlpExporter) {
    // Return a no-op exporter (console with suppressed output)
    const noOpExporter = new ConsoleSpanExporter();
    // Override export to do nothing - prevents ECONNREFUSED errors
    noOpExporter.export = (spans, resultCallback) => {
      resultCallback({ code: 0 });
    };
    return noOpExporter;
  }
  
  // OTLP exporter with connection error handling
  const otlpExporter = new OTLPTraceExporter({
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? 
      JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : undefined,
    timeoutMillis: 10000,
  });
  
  // Wrap the export method to suppress connection errors
  const originalExport = otlpExporter.export.bind(otlpExporter);
  otlpExporter.export = (spans, resultCallback) => {
    originalExport(spans, (result) => {
      // Silently ignore connection errors
      if (result.error && (result.error as any).code === 'ECONNREFUSED') {
        if (process.env.OTEL_DEBUG === 'true') {
          console.log('[OTEL] Collector not available at', process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'default endpoint');
        }
        resultCallback({ code: 0 }); // Success to prevent retries
      } else {
        resultCallback(result);
      }
    });
  };
  
  return otlpExporter;
};

// Configure metrics exporter based on clean config
const getMetricExporter = () => {
  // Use console exporter only if explicitly requested and no OTLP endpoint
  if (config.useConsoleExporter) {
    return new ConsoleMetricExporter();
  }
  
  // Skip OTLP if no valid endpoint configured
  if (!config.useOtlpExporter) {
    // Return a no-op exporter (console with suppressed output)
    const noOpExporter = new ConsoleMetricExporter();
    // Override export to do nothing - prevents ECONNREFUSED errors
    noOpExporter.export = (metrics, resultCallback) => {
      resultCallback({ code: 0 });
    };
    return noOpExporter;
  }
  
  // OTLP metrics exporter with connection error handling
  const otlpExporter = new OTLPMetricExporter({
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ?
      JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : undefined,
    timeoutMillis: 10000,
  });
  
  // Wrap the export method to suppress connection errors
  const originalExport = otlpExporter.export.bind(otlpExporter);
  otlpExporter.export = (metrics, resultCallback) => {
    originalExport(metrics, (result) => {
      // Silently ignore connection errors
      if (result.error && (result.error as any).code === 'ECONNREFUSED') {
        if (process.env.OTEL_DEBUG === 'true') {
          console.log('[OTEL] Metrics collector not available');
        }
        resultCallback({ code: 0 }); // Success to prevent retries
      } else {
        resultCallback(result);
      }
    });
  };
  
  return otlpExporter;
};

// Configure instrumentations
const instrumentations = getNodeAutoInstrumentations({
  // Disable noisy fs instrumentation
  '@opentelemetry/instrumentation-fs': {
    enabled: false,
  },
  // Configure HTTP instrumentation
  '@opentelemetry/instrumentation-http': {
    requestHook: (span, request: any) => {
      // Add custom attributes to HTTP spans
      if (request.headers) {
        span.setAttribute('http.request.body.size', request.headers['content-length'] || 0);
      }
    },
    responseHook: (span, response: any) => {
      // Add custom response attributes
      if (response.headers) {
        span.setAttribute('http.response.body.size', response.headers['content-length'] || 0);
      }
    },
    ignoreIncomingRequestHook: (request: any) => {
      const url = request.url || '';
      return url.includes('/health') || url.includes('/metrics') || url.includes('/healthz');
    },
    ignoreOutgoingRequestHook: (options: any) => {
      const url = options.href || options.hostname || '';
      return url.includes('127.0.0.1:4318');
    },
  },
  // Configure database instrumentation
  '@opentelemetry/instrumentation-pg': {
    enhancedDatabaseReporting: true,
  },
  // Redis and AWS SDK instrumentation will be auto-configured by auto-instrumentations-node
});

// SDK singleton management to prevent double initialization
let sdk: NodeSDK | null = null;
let isInitializing = false;
let isInitialized = false;

// Export initialization function with idempotent guard
export const initializeTelemetry = () => {
  // Prevent double initialization
  if (isInitialized || isInitializing) {
    if (process.env.OTEL_DEBUG === 'true') {
      console.log('[OTEL] Already initialized or initializing, skipping...');
    }
    return sdk;
  }
  
  isInitializing = true;
  try {
    // Only show clean startup message unless debugging
    if (process.env.OTEL_DEBUG === 'true') {
      console.log('🔍 [OTEL Debug] Initializing OpenTelemetry SDK...');
      console.log(`  Environment: ${ENV}`);
      console.log(`  Service: ${resourceAttributes['service.name']}`);
      console.log(`  Version: ${resourceAttributes['service.version']}`);
      console.log(`  OTLP: ${config.useOtlpExporter ? process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4318' : 'disabled'}`);
      console.log(`  Sampling: ${config.sampler || 'parentbased_traceidratio'}`);
      console.log(`  Console Export: ${config.useConsoleExporter ? 'enabled' : 'disabled'}`);
    } else if (!config.suppressInstrumentationLogs) {
      // Single clean startup message in non-debug mode
      console.log(`🔭 OpenTelemetry: ${resourceAttributes['service.name']} (${ENV})`);
    }
    
    // Create SDK with fresh readers/exporters (don't reuse)
    sdk = new NodeSDK({
      instrumentations,
      sampler: getSampler(),
      spanProcessor: new BatchSpanProcessor(getTraceExporter(), {
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: IS_PRODUCTION ? 5000 : 1000,
        exportTimeoutMillis: 30000,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: getMetricExporter(),
        exportIntervalMillis: config.metricExportInterval,
        exportTimeoutMillis: 30000,
      }),
    });
    
    sdk.start();
    
    isInitialized = true;
    isInitializing = false;
    
    if (process.env.OTEL_DEBUG === 'true') {
      console.log('✅ [OTEL Debug] OpenTelemetry SDK initialized successfully');
    }
    
    return sdk;
  } catch (error) {
    isInitializing = false;
    console.error('Failed to initialize OpenTelemetry:', error);
    throw error;
  }
};

// Graceful shutdown handler
export const shutdownTelemetry = async () => {
  if (!sdk || !isInitialized) {
    return;
  }
  
  console.log('Shutting down OpenTelemetry SDK...');
  try {
    await sdk.shutdown();
    sdk = null;
    isInitialized = false;
    console.log('OpenTelemetry SDK shut down successfully');
  } catch (error) {
    console.error('Error shutting down OpenTelemetry SDK', error);
  }
};

// Register shutdown handlers
process.once('SIGTERM', shutdownTelemetry);
process.once('SIGINT', shutdownTelemetry);

// Export SDK getter for backward compatibility
export { sdk };

// Auto-initialize if this is the main module
if (require.main === module) {
  initializeTelemetry();
}