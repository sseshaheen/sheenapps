import * as Sentry from '@sentry/nextjs'

// Only initialize Sentry in production to avoid development noise
// To test in development, set ENABLE_SENTRY_DEV=true in .env.local
const isProduction = process.env.NODE_ENV === 'production'
const enableInDev = process.env.ENABLE_SENTRY_DEV === 'true'

if (isProduction || enableInDev) {
  Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  
  // Use environment variable for flexibility
  tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE 
    ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : 0.1,

  // Error sampling for quota control
  sampleRate: process.env.SENTRY_SAMPLE_RATE
    ? parseFloat(process.env.SENTRY_SAMPLE_RATE)
    : 1.0,

  // Global tags configuration
  initialScope: {
    tags: {
      env: process.env.NODE_ENV,
      region: process.env.REGION || 'default',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      runtime: 'edge',
    },
  },

  // Edge-specific configuration
  transportOptions: {
    headers: {
      'X-Sentry-Auth': `Sentry sentry_key=${process.env.SENTRY_DSN}`,
    },
  },
  })
}