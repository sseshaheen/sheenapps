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
    : process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Error sampling for quota control
  sampleRate: process.env.SENTRY_SAMPLE_RATE
    ? parseFloat(process.env.SENTRY_SAMPLE_RATE)
    : 1.0,

  // Note: Replays are client-only, not meaningful server-side
  // replaysSessionSampleRate and replaysOnErrorSampleRate removed

  integrations: [
    // Additional integrations can be added here
  ],

  // Global tags configuration
  initialScope: {
    tags: {
      env: process.env.NODE_ENV,
      region: process.env.REGION || 'default',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    },
  },

  beforeSend(event, hint) {
    // Filter bot/crawler traffic
    const userAgent = (hint as any).request?.headers?.['user-agent'] || ''
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /crawling/i,
      /googlebot/i,
      /bingbot/i,
      /slurp/i,
      /duckduckbot/i,
      /baiduspider/i,
      /yandexbot/i,
      /facebookexternalhit/i,
      /twitterbot/i,
      /linkedinbot/i,
      /whatsapp/i,
      /slackbot/i,
      /telegram/i,
      /applebot/i,
      /pingdom/i,
      /uptimerobot/i,
      /lighthouse/i,
      /pagespeed/i,
    ]

    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      return null
    }

    // Sanitize server-side data
    if (event.extra?.stripe_webhook) {
      event.extra.stripe_webhook = '[Filtered]'
    }

    // Tag payment-related errors
    const error = hint.originalException
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message)
      if (errorMessage.includes('payment')) {
        event.tags = { ...event.tags, category: 'payment' }
      }
      
      // Tag Claude worker errors
      if (errorMessage.includes('claude-worker') || 
          errorMessage.includes('RATE_LIMITED') ||
          errorMessage.includes('USER_QUOTA_EXCEEDED')) {
        event.tags = { 
          ...event.tags, 
          service: 'claude-worker',
          category: 'ai-generation' 
        }
      }
    }

    return event
  },
  })
}