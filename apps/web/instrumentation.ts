export async function register() {
  // Initialize Sentry (existing configuration)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
  
  // Initialize Grafana OpenTelemetry (Node.js runtime only)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeGrafanaObservability } = await import('./src/lib/observability/grafana-otel-setup')
    await initializeGrafanaObservability()
  }
}

export async function onRequestError(err: unknown, request: any, context: any) {
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(err, request, context)
}