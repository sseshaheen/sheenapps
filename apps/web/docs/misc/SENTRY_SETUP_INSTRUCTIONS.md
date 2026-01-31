# Sentry Setup Instructions

## Important: Production-Only by Default

Sentry is configured to **only run in production** by default to avoid mixing development and production errors. This prevents local development from polluting your production error tracking.

## Quick Setup Guide

### 1. Production Setup

Add these variables to your production environment (Vercel, etc.):

```bash
# Required Sentry Configuration
SENTRY_DSN=your-production-dsn
NEXT_PUBLIC_SENTRY_DSN=your-production-dsn
SENTRY_ORG=your-org-name
SENTRY_PROJECT=your-production-project
SENTRY_AUTH_TOKEN=your-auth-token

# Optional Performance Configuration
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1

# Application Version
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 2. Testing in Development (Optional)

To test Sentry in local development:

1. Add these to your `.env.local`:
```bash
# Use your development project DSN (not production!)
SENTRY_DSN=your-dev-dsn
NEXT_PUBLIC_SENTRY_DSN=your-dev-dsn

# Enable Sentry in development
ENABLE_SENTRY_DEV=true
NEXT_PUBLIC_ENABLE_SENTRY_DEV=true
```

2. Remove or set to `false` when done testing to disable Sentry locally

### 2. Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Visit the test page:
   ```
   http://localhost:3000/test-sentry
   ```

3. Click the test buttons to send different types of events to Sentry

4. Check your Sentry dashboard to verify the events are being received

### 3. Verify Production Build

Run a production build to ensure Sentry is properly configured:

```bash
npm run build
```

The build should complete without errors and include Sentry in the bundle.

### 4. Production Deployment

When deploying to production, ensure these environment variables are set in your hosting platform:

- Vercel: Add via the dashboard under Settings > Environment Variables
- Other platforms: Follow their specific documentation for environment variables

### 5. Monitor Your Application

Once deployed, you can:

1. View errors in real-time at sentry.io
2. Set up alerts for critical errors
3. Monitor performance metrics
4. Review session replays for debugging

## Troubleshooting

### Events Not Appearing

1. Check that your DSN is correctly set in `.env.local`
2. Verify the DSN format: `https://[key]@[org].ingest.sentry.io/[project-id]`
3. Check browser console for any Sentry-related errors
4. Ensure your Sentry project is active and not rate-limited

### Build Errors

If you encounter build errors:

1. Ensure `@sentry/nextjs` is installed: `npm list @sentry/nextjs`
2. Clear Next.js cache: `rm -rf .next`
3. Reinstall dependencies: `rm -rf node_modules && npm install`

### Performance Issues

If Sentry impacts performance:

1. Reduce `tracesSampleRate` (e.g., from 1.0 to 0.1)
2. Adjust `replaysSessionSampleRate` to capture fewer sessions
3. Use `ignoreErrors` to filter out non-critical errors

## Security Notes

- Never commit `.env.local` to version control
- Keep `SENTRY_AUTH_TOKEN` secure - it has write access to your Sentry project
- Use different DSNs for development and production environments
- Regularly rotate your auth tokens

## Next Steps

1. Configure alert rules in Sentry dashboard
2. Set up integrations (Slack, email, etc.)
3. Create custom dashboards for payment metrics
4. Implement release tracking with CI/CD