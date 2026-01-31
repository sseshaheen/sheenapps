# Server-Only Services

⚠️ **SERVER-SIDE ONLY CODE** - Never import these files into browser bundles

## Purpose

This directory contains services that must run exclusively in server-side contexts:
- API routes
- Server actions  
- Webhooks
- Background jobs

## Authentication

All code in this directory uses **service role authentication** which:
- Bypasses Row Level Security (RLS) policies
- Has full database access
- Should never be exposed to client-side code

## Usage Pattern

```typescript
// ✅ Correct - in API route
import { publishBuildEvent } from '@/services/server/build-events-publisher'

// ❌ Wrong - in React component  
import { publishBuildEvent } from '@/services/server/build-events-publisher' // Will throw runtime error
```

## Runtime Guards

Each file includes runtime guards that throw errors if accidentally imported client-side:

```typescript
if (typeof window !== 'undefined') {
  throw new Error('server-only code imported in browser context')
}
```

## Client-Side Alternatives

For client-side functionality, use:
- `src/services/build-events-realtime.ts` - Real-time subscriptions
- `src/hooks/use-build-events.ts` - React hooks for build events
- Standard authenticated Supabase clients

## Security Note

Service role clients have unrestricted database access. Always validate inputs and implement proper authorization logic in your application code.