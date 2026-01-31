# Workers Node.js Detection Test

## Test Case: Unambiguous Workers Node.js Triggers

Based on expert recommendations, create a Next.js page with explicit markers that should **force** workers-node deployment:

```tsx
// app/page.tsx (server component)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // or: export const revalidate = 0

import { headers, cookies } from 'next/headers'; // forces dynamic
import crypto from 'crypto'; // Node builtin

export default async function Page() {
  const h = headers().get('x-forwarded-proto'); // dynamic usage
  const msg = process.env.SERVER_MESSAGE ?? 'Hello Server World';
  const id = crypto.randomUUID();
  return <main>({msg}) id={id} proto={h}</main>;
}
```

## Detection Markers Implemented

✅ **runtime = 'nodejs'** - Explicit Node.js runtime specification
✅ **dynamic = 'force-dynamic'** - Forces dynamic SSR
✅ **headers()/cookies()** - Dynamic Next.js APIs  
✅ **Node built-ins** - `crypto` import forces Node.js environment
✅ **Hardened fallback guard** - Never fallback to pages-static if workers-node detected

## Expected Behavior

1. **Detection**: `workers-node` target with reasons: `['Node.js runtime specified', 'Force dynamic rendering', 'Dynamic headers usage']`
2. **Deployment**: Deploy to Cloudflare Workers (Node.js runtime)
3. **Fallback**: If deployment fails, **fail loudly** instead of fallback to pages-static
4. **Result**: Working server-side application with process.env access

## Test Prompt

> Create a Next.js page that says "Hello Server World" with these exact specifications:
> - Use export const runtime = 'nodejs'
> - Use export const dynamic = 'force-dynamic' 
> - Import and use headers() from 'next/headers'
> - Import and use crypto from 'crypto' 
> - Read process.env.SERVER_MESSAGE and display it
> - Generate a random UUID and display it

This test case is **unambiguously non-static** and should trigger workers-node detection.