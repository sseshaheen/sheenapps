# Sentry Production Setup Guide

## Your Sentry Instance Details

- **Region**: Germany (de.sentry.io)
- **Organization ID**: o4509565983850496
- **Project ID**: 4509566024509566024417360

## Required Environment Variables for Production

Copy these to your production environment (Vercel, Railway, etc.):

```bash
# Core Sentry Configuration
SENTRY_DSN=https://988b0d5c81bd4977ad54f499df0a8c6d@o4509565983850496.ingest.de.sentry.io/4509566024417360
NEXT_PUBLIC_SENTRY_DSN=https://988b0d5c81bd4977ad54f499df0a8c6d@o4509565983850496.ingest.de.sentry.io/4509566024417360
SENTRY_ORG=o4509565983850496
SENTRY_PROJECT=4509566024417360
SENTRY_AUTH_TOKEN=3435b7465***********************

# Performance Monitoring (adjust rates as needed)
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1

# Application Version
NEXT_PUBLIC_APP_VERSION=1.0.0
```

## Setting Up in Vercel

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable above for the "Production" environment
4. Redeploy your application

## Setting Up in Other Platforms

### Railway
```bash
railway variables set SENTRY_DSN="https://988b0d5c*****************************************.ingest.de.sentry.io/450956602*******"
# Add other variables similarly
```

### Heroku
```bash
heroku config:set SENTRY_DSN="https://988b0d5c*****************************************.ingest.de.sentry.io/450956602*******"
# Add other variables similarly
```

## Additional Tokens (For Advanced Use)

These are available but not required for basic error tracking:

- **Deploy Token**: c30b0f7a5***********************
  - Used for automated deployments and release tracking

- **Webhook URL**: https://de.sentry.io/api/hooks/release/builtin/450956602*******/6665658f5*******************************************************/
  - Used for release notifications from CI/CD

- **Security Header Endpoint**: https://o450956598*******.ingest.de.sentry.io/api/450956602*******/security/?sentry_key=988b0d5c*********************************
  - Used for Content Security Policy reporting

## Testing Production Sentry

After deployment:

1. Visit your production site
2. Open browser console and run:
   ```javascript
   throw new Error('Production Sentry Test')
   ```

3. Check your Sentry dashboard at https://de.sentry.io to see the error

## Important Notes

- **DO NOT** commit these values to your repository
- **DO NOT** use these production values in local development
- These credentials are for production use only
- Consider creating a separate Sentry project for development if needed

## Security

Keep these values secure:
- `SENTRY_AUTH_TOKEN`: Has write access to your Sentry project
- `Secret key` (8821e757d***********************): Not needed for Next.js but keep secure
- `Deploy token`: Used for release management automation
