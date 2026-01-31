/**
 * OpenTelemetry Configuration Helper
 * Provides clean configuration for different environments
 */

export function getCleanOtelConfig() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Determine if we should use console exporters
  const useConsoleExporter = process.env.OTEL_EXPORTER_CONSOLE === 'true';
  
  // Check if OTLP endpoint is available and valid
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const hasOtlpEndpoint = !!otlpEndpoint && 
    otlpEndpoint !== 'http://127.0.0.1:4318' && 
    otlpEndpoint !== 'http://localhost:4318';
  
  return {
    // Disable verbose logs in development unless explicitly enabled
    suppressInstrumentationLogs: isDevelopment && process.env.OTEL_DEBUG !== 'true',
    
    // Use console exporter only if explicitly requested
    useConsoleExporter: useConsoleExporter && !hasOtlpEndpoint,
    
    // Only use OTLP if explicitly configured with a valid endpoint
    useOtlpExporter: hasOtlpEndpoint,
    
    // Fix sampler configuration
    sampler: process.env.OTEL_TRACES_SAMPLER === 'alwayson' 
      ? 'always_on' 
      : process.env.OTEL_TRACES_SAMPLER,
    
    // Reduce metric export frequency in development
    metricExportInterval: isDevelopment ? 300000 : 60000, // 5 min in dev, 1 min in prod
  };
}

/**
 * Suppress verbose instrumentation logs
 */
export function suppressInstrumentationLogs() {
  // Suppress auto-instrumentation loading messages
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  
  const suppressPatterns = [
    /Loading instrumentation for/,
    /Applying instrumentation patch/,
    /Instrumentation suppressed/,
    /wrap .* callback function/,
    /executing .* callback function/,
    /EnvDetector found resource/,
    /ProcessDetector found resource/,
    /HostDetector found resource/,
    /OTLPExportDelegate/,
    /OTEL_TRACES_SAMPLER value .* invalid/,
    /@opentelemetry\/instrumentation-/,  // Suppress all instrumentation messages
    /Patching .*\.prototype\./,  // Suppress patching messages
    /propwrapping aws-sdk/,  // AWS SDK wrapping messages
    /OTEL_LOGS_EXPORTER is empty/,  // Default exporter messages
    /The 'spanProcessor' option is deprecated/,  // Deprecation warnings
    /Registered a global for/,  // Global registration messages
    /ResourceImpl \{/,  // Resource detection details
    /_rawAttributes:/,  // Resource attribute details
  ];
  
  const shouldSuppress = (args: any[]) => {
    const message = args.join(' ');
    return suppressPatterns.some(pattern => pattern.test(message));
  };
  
  console.log = (...args) => {
    if (!shouldSuppress(args)) {
      originalConsoleLog(...args);
    }
  };
  
  console.info = (...args) => {
    if (!shouldSuppress(args)) {
      originalConsoleInfo(...args);
    }
  };
}

/**
 * Environment variable recommendations for clean logs
 */
export const RECOMMENDED_ENV_VARS = {
  development: {
    // Disable console exporter to reduce noise
    OTEL_EXPORTER_CONSOLE: 'false',
    
    // Use correct sampler name
    OTEL_TRACES_SAMPLER: 'always_on', // or 'parentbased_always_off' to disable
    
    // Don't export to OTLP if collector not running
    OTEL_SDK_DISABLED: 'false', // or 'true' to completely disable in dev
    
    // Reduce verbosity
    OTEL_LOG_LEVEL: 'error', // Only show errors, not info/debug
    
    // Disable auto-instrumentation verbosity
    OTEL_NODE_DISABLED_INSTRUMENTATIONS: 'dns,net', // Disable noisy instrumentations
  },
  production: {
    OTEL_TRACES_SAMPLER: 'parentbased_traceidratio',
    OTEL_TRACES_SAMPLER_ARG: '0.1',
    OTEL_LOG_LEVEL: 'warn',
    OTEL_EXPORTER_CONSOLE: 'false',
  }
};