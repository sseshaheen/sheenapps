/**
 * SDK Context Injection for Easy Mode Projects
 *
 * Provides SDK documentation and patterns for AI code generation.
 * Only injected for Easy Mode (infra_mode === 'easy') projects.
 *
 * @see EASY_MODE_SDK_PLAN.md - AI SDK Awareness section
 */

// =============================================================================
// SDK API REFERENCE (Condensed for prompts)
// =============================================================================

export const SDK_API_REFERENCE = `
## Available @sheenapps SDKs

These SDKs are available for Easy Mode projects. All methods return \`{ data, error, status }\` - they never throw.

### @sheenapps/auth
\`\`\`typescript
import { createClient } from '@sheenapps/auth'
const auth = createClient({ apiKey: process.env.SHEEN_SK! })

// Server actions (use sheen_sk_*)
await auth.signUp({ email, password })
await auth.signIn({ email, password })
await auth.createMagicLink({ email, redirectUrl })
await auth.verifyMagicLink({ token })
await auth.getUser({ sessionToken })
await auth.signOut({ sessionToken })
await auth.refreshSession({ refreshToken })
\`\`\`

### @sheenapps/db
\`\`\`typescript
import { createClient } from '@sheenapps/db'
const db = createClient({ apiKey: process.env.SHEEN_SK! })

// Query builder (Supabase-like)
await db.from('users').select('*').eq('status', 'active')
await db.from('posts').select('id, title, author:users(name)').order('created_at', { ascending: false })
await db.from('posts').insert({ title, content, authorId })
await db.from('posts').update({ title }).eq('id', postId)
await db.from('posts').delete().eq('id', postId)
\`\`\`

### @sheenapps/storage
\`\`\`typescript
import { createClient } from '@sheenapps/storage'
const storage = createClient({ apiKey: process.env.SHEEN_SK! })

// Signed upload URL (return to browser for direct upload)
const { data } = await storage.createSignedUploadUrl({
  path: \`avatars/\${userId}.jpg\`,
  contentType: 'image/jpeg',
  maxSizeBytes: 5 * 1024 * 1024 // 5MB
})

// Public URL
const url = storage.getPublicUrl('avatars/user-123.jpg')

// Signed download URL (private files)
const { data: download } = await storage.createSignedDownloadUrl({
  path: 'documents/contract.pdf',
  expiresIn: '1h'
})

// List and delete
const { data: files } = await storage.list({ prefix: 'avatars/' })
await storage.delete('avatars/old-avatar.jpg')
\`\`\`

### @sheenapps/jobs
\`\`\`typescript
import { createClient } from '@sheenapps/jobs'
const jobs = createClient({ apiKey: process.env.SHEEN_SK! })

// Enqueue immediate job
await jobs.enqueue('process-upload', { fileId: '123' })

// Delayed job
await jobs.enqueue('send-reminder', { userId: '123' }, { delay: '30m' })

// Scheduled job (cron) - every Monday at 9am
await jobs.schedule('weekly-report', {
  cronExpression: '0 9 * * MON',
  payload: { teamId: 'abc' }
})

// Cancel and retry
await jobs.cancel('job-id-xxx')
await jobs.retry('job-id-xxx')
\`\`\`

### @sheenapps/secrets
\`\`\`typescript
import { createClient } from '@sheenapps/secrets'
const secrets = createClient({ apiKey: process.env.SHEEN_SK! })

// Get a secret (server-only)
const { data } = await secrets.get('STRIPE_SECRET_KEY')
console.log(data.value) // The decrypted value

// Set a secret
await secrets.set('STRIPE_SECRET_KEY', 'sk_live_...')

// List secrets (metadata only, no values)
const { data: list } = await secrets.list()
\`\`\`

### @sheenapps/email
\`\`\`typescript
import { createClient } from '@sheenapps/email'
const email = createClient({ apiKey: process.env.SHEEN_SK! })

// Send with built-in template
await email.send({
  to: 'user@example.com',
  template: 'welcome',  // welcome, magic-link, password-reset, email-verification, receipt, notification
  variables: { name: 'John', loginUrl: 'https://...' }
})

// Send custom HTML
await email.send({
  to: 'user@example.com',
  subject: 'Order Shipped',
  html: '<p>Your order #123 has shipped!</p>',
  text: 'Your order #123 has shipped!'
})

// Scheduled send (up to 7 days in future)
await email.send({
  to: 'user@example.com',
  template: 'reminder',
  variables: { ... },
  sendAt: '2024-01-15T09:00:00Z'
})

// List sent emails
const { data: emails } = await email.list({ status: 'delivered', limit: 50 })
\`\`\`

### @sheenapps/payments
\`\`\`typescript
import { createClient } from '@sheenapps/payments'
const payments = createClient({ apiKey: process.env.SHEEN_SK! })

// Create checkout session (Stripe integration - BYO keys via @sheenapps/secrets)
const { data } = await payments.createCheckoutSession({
  priceId: 'price_123',
  successUrl: \`\${origin}/billing/success\`,
  cancelUrl: \`\${origin}/billing/cancel\`,
  mode: 'subscription'  // 'subscription' | 'payment' | 'setup'
})
// Redirect user to data.url

// Customer portal (self-service billing)
const { data: portal } = await payments.createPortalSession({
  customerId: 'cus_xxx',
  returnUrl: \`\${origin}/settings\`
})

// Customer management
const { data: customer } = await payments.createCustomer({
  email: 'user@example.com',
  name: 'John Doe',
  metadata: { userId: 'user_123' }
})

// Subscription management
const { data: sub } = await payments.getSubscription('sub_xxx')
const { data: subs } = await payments.listSubscriptions('cus_xxx')
await payments.cancelSubscription('sub_xxx', { atPeriodEnd: true })

// Webhook verification (in API route)
const { data: event, error } = await payments.verifyWebhook(rawBody, signature)
\`\`\`

### @sheenapps/analytics
\`\`\`typescript
import { createClient } from '@sheenapps/analytics'

// Client-side (can use public key)
const analytics = createClient({ apiKey: process.env.NEXT_PUBLIC_SHEEN_PK! })

// Track custom event (fire-and-forget)
analytics.track('signup_completed', { plan: 'pro', source: 'landing_page' })

// Track page view
analytics.page('/pricing')

// Identify user (call once on login - links anonymous ID to user)
analytics.identify(user.id, { email: user.email, plan: 'pro' })

// Server-side querying (requires server key)
const serverAnalytics = createClient({ apiKey: process.env.SHEEN_SK! })
const { data: events } = await serverAnalytics.listEvents({
  eventType: 'track',
  eventName: 'signup_completed',
  startDate: '2024-01-01',
  limit: 100
})
const { data: counts } = await serverAnalytics.getCounts({ groupBy: 'event' })
const { data: user } = await serverAnalytics.getUser('user_123')
\`\`\`
`;

// =============================================================================
// SDK RULES (For CLAUDE.md / system prompts)
// =============================================================================

export const SDK_RULES = `
## Easy Mode SDK Rules

### Authentication (@sheenapps/auth)
- ALWAYS use @sheenapps/auth for auth operations, NEVER roll custom
- Use sheen_sk_* keys in server actions/API routes only
- Store session token in httpOnly cookie (use next/headers)
- Pattern: auth.signIn() → set cookie → redirect to dashboard

### Database (@sheenapps/db)
- ALWAYS use @sheenapps/db for data operations
- Use server components or server actions for DB calls
- Never expose sheen_sk_* to client components
- Pattern: 'use server' → db.from().select() → return data

### Storage (@sheenapps/storage)
- ALWAYS use @sheenapps/storage for file uploads
- Server generates signed URL, client uploads directly to storage
- Never pass sheen_sk_* to browser
- Pattern: server action → createSignedUploadUrl → return URL → client fetch PUT

### Jobs (@sheenapps/jobs)
- Use for background tasks, email sending, scheduled operations
- Jobs are at-least-once delivery - handlers must be idempotent
- Reserved prefix: sys:* is for system jobs only

### Secrets (@sheenapps/secrets)
- Use for third-party API keys (Stripe, OpenAI, etc.)
- Server-only - never call from client components
- Always check error before using value

### Email (@sheenapps/email)
- Use for transactional emails (magic links, welcome, receipts, notifications)
- Built-in templates: welcome, magic-link, password-reset, email-verification, receipt, notification
- Server-only - never call from client components
- Pattern: email.send({ to, template, variables }) → check error
- Supports scheduled sending with sendAt parameter

### Payments (@sheenapps/payments)
- Use for Stripe integration (checkout, subscriptions, billing portal)
- Requires Stripe keys stored in secrets: stripe_secret_key, stripe_webhook_secret
- Server-only - never call from client components
- Pattern: payments.createCheckoutSession() → redirect to session.url
- Webhook handling: payments.verifyWebhook({ rawBody, signature }) in API route
- Customer management: createCustomer, getCustomer for user-Stripe linking

### Analytics (@sheenapps/analytics)
- Use for event tracking, page views, and user identification
- CAN use public key (NEXT_PUBLIC_SHEEN_PK) for client-side tracking
- Tracking methods: track(), page(), identify() - work in browser
- Query methods: listEvents(), getCounts(), getUser() - require server key
- Pattern: analytics.track('event_name', { properties }) - fire-and-forget
- Always call identify() when user logs in to link anonymous → user ID
- REQUIRED: initialize analytics client and call page() on route changes (usePathname hook in Next.js App Router)

### Key Management
- \`sheen_pk_*\` (public key) - Safe for browser/client code
- \`sheen_sk_*\` (server key) - Server-side only, never expose
- Environment variables: SHEEN_PK, SHEEN_SK

### Error Handling
- All SDK methods return \`{ data, error, status }\` - they never throw
- Always check \`error\` before using \`data\`
- Error codes: UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, QUOTA_EXCEEDED, VALIDATION_ERROR
`;

// =============================================================================
// CAPABILITY-AWARE PATTERN INJECTION
// =============================================================================

/**
 * SDK patterns mapped to feature types.
 * Only inject patterns for features being generated.
 */
export const SDK_PATTERNS: Record<string, string[]> = {
  login_form: ['auth.signIn', 'auth.signUp', 'cookie_session'],
  signup_form: ['auth.signUp', 'auth.signIn', 'cookie_session'],
  file_upload: ['storage.createSignedUploadUrl', 'client_upload'],
  image_gallery: ['storage.list', 'storage.getPublicUrl'],
  data_table: ['db.select', 'pagination', 'server_component'],
  data_form: ['db.insert', 'db.update', 'server_action'],
  protected_route: ['auth.getUser', 'middleware_redirect'],
  user_profile: ['auth.getUser', 'db.select', 'db.update'],
  background_task: ['jobs.enqueue', 'idempotency'],
  scheduled_task: ['jobs.schedule', 'cron_expression'],
  api_integration: ['secrets.get', 'server_only'],
  // Email patterns
  email_notification: ['email.send', 'email_template'],
  welcome_email: ['email.send', 'email_template'],
  password_reset: ['email.send', 'auth.createMagicLink', 'email_template'],
  magic_link: ['email.send', 'auth.createMagicLink', 'email_template'],
  // Payment patterns
  checkout: ['payments.createCheckoutSession', 'checkout_redirect'],
  subscription: ['payments.createCheckoutSession', 'payments.getSubscription', 'subscription_management'],
  billing_portal: ['payments.createPortalSession', 'checkout_redirect'],
  payment_webhook: ['payments.verifyWebhook', 'webhook_handler'],
  // Analytics patterns
  event_tracking: ['analytics.track', 'analytics_client'],
  page_tracking: ['analytics.page', 'analytics_client'],
  user_identification: ['analytics.identify', 'analytics_client'],
  analytics_dashboard: ['analytics.listEvents', 'analytics.getCounts', 'server_component'],
};

/**
 * Pattern-specific code snippets for common features.
 */
export const PATTERN_SNIPPETS: Record<string, string> = {
  cookie_session: `
// Session cookie handling (Next.js 15)
import { cookies } from 'next/headers'

// Set session after login
const cookieStore = await cookies()
cookieStore.set('session', sessionToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7 // 7 days
})

// Get session in server component/action
const cookieStore = await cookies()
const sessionToken = cookieStore.get('session')?.value
`,

  client_upload: `
// Client-side upload using signed URL
async function uploadFile(file: File, signedUrl: string) {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
  })
  return response.ok
}
`,

  server_action: `
// Server action pattern (Next.js 15)
'use server'

import { createClient } from '@sheenapps/db'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const db = createClient({ apiKey: process.env.SHEEN_SK! })

  const { data, error } = await db.from('posts').insert({
    title: formData.get('title') as string,
    content: formData.get('content') as string,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/posts')
  return { success: true, data }
}
`,

  middleware_redirect: `
// Middleware for protected routes (middleware.ts)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*']
}
`,

  idempotency: `
// Idempotent job handler pattern
// Jobs may run more than once - use idempotency keys

async function processJob(payload: { id: string; action: string }) {
  // Check if already processed
  const existing = await db.from('job_results').select('*').eq('job_id', payload.id).single()
  if (existing.data) {
    return { alreadyProcessed: true }
  }

  // Process and record completion
  const result = await doWork(payload)
  await db.from('job_results').insert({ job_id: payload.id, result })
  return result
}
`,

  email_template: `
// Email sending with built-in template (server action)
'use server'

import { createClient } from '@sheenapps/email'

const email = createClient({ apiKey: process.env.SHEEN_SK! })

export async function sendWelcomeEmail(userEmail: string, userName: string) {
  const { error } = await email.send({
    to: userEmail,
    template: 'welcome',
    variables: {
      name: userName,
      loginUrl: \`\${process.env.NEXT_PUBLIC_APP_URL}/login\`
    }
  })

  if (error) {
    console.error('Failed to send welcome email:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}
`,

  checkout_redirect: `
// Checkout session creation and redirect (server action)
'use server'

import { createClient } from '@sheenapps/payments'
import { redirect } from 'next/navigation'

const payments = createClient({ apiKey: process.env.SHEEN_SK! })

export async function createCheckout(priceId: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL

  const { data, error } = await payments.createCheckoutSession({
    priceId,
    successUrl: \`\${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}\`,
    cancelUrl: \`\${origin}/billing/cancel\`,
    mode: 'subscription'
  })

  if (error) {
    return { success: false, error: error.message }
  }

  // Redirect to Stripe Checkout
  redirect(data.url)
}
`,

  subscription_management: `
// Subscription status check (server component)
import { createClient } from '@sheenapps/payments'

const payments = createClient({ apiKey: process.env.SHEEN_SK! })

export async function SubscriptionStatus({ customerId }: { customerId: string }) {
  const { data: subs } = await payments.listSubscriptions(customerId)

  const activeSub = subs?.subscriptions?.find(
    s => s.status === 'active' || s.status === 'trialing'
  )

  if (!activeSub) {
    return <div>No active subscription</div>
  }

  return (
    <div>
      <p>Plan: {activeSub.plan}</p>
      <p>Status: {activeSub.status}</p>
      <p>Renews: {new Date(activeSub.currentPeriodEnd).toLocaleDateString()}</p>
    </div>
  )
}
`,

  webhook_handler: `
// Stripe webhook handler (API route)
// app/api/webhooks/stripe/route.ts

import { createClient } from '@sheenapps/payments'
import { NextRequest } from 'next/server'

const payments = createClient({ apiKey: process.env.SHEEN_SK! })

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')!

  const { data: event, error } = await payments.verifyWebhook(rawBody, signature)

  if (error) {
    console.error('Webhook verification failed:', error.message)
    return Response.json({ error: error.message }, { status: 400 })
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      // Provision access to the product
      break
    case 'customer.subscription.updated':
      // Update subscription status in your database
      break
    case 'customer.subscription.deleted':
      // Revoke access
      break
  }

  return Response.json({ received: true })
}
`,

  analytics_client: `
// Analytics tracking (client component)
'use client'

import { createClient } from '@sheenapps/analytics'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Create client once (module level)
const analytics = createClient({
  apiKey: process.env.NEXT_PUBLIC_SHEEN_PK!
})

// Page tracking hook
export function usePageTracking() {
  const pathname = usePathname()

  useEffect(() => {
    analytics.page(pathname)
  }, [pathname])
}

// Track custom event
export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  analytics.track(eventName, properties)
}

// Identify user on login
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  analytics.identify(userId, traits)
}
`,
};

// =============================================================================
// FRAMEWORK VERSION CONTEXT
// =============================================================================

/**
 * Current framework versions for dependency compatibility.
 * Keep in sync with actual project templates.
 */
export const FRAMEWORK_VERSIONS = `
## Framework Compatibility (Easy Mode Stack)

| Framework | Version | Notes |
|-----------|---------|-------|
| Next.js | 15.x | App Router, Server Components by default |
| React | 19.x | New hooks, use() for promises |
| TypeScript | 5.x | Strict mode enabled |
| Tailwind CSS | 3.4+ | With @tailwindcss/forms, @tailwindcss/typography |

### Next.js 15 Patterns
- Use \`async\` Server Components (not getServerSideProps)
- \`params\` is a Promise in page/layout - use \`await params\`
- \`cookies()\` and \`headers()\` return Promises - use \`await\`
- Use \`'use server'\` for server actions
- Use \`'use client'\` only when needed (interactivity, hooks)

### React 19 Patterns
- \`use()\` hook for reading promises in components
- \`useOptimistic()\` for optimistic UI updates
- \`useFormStatus()\` for form submission state
- \`<form action={serverAction}>\` for server action forms
`;

// =============================================================================
// MAIN INJECTION FUNCTION
// =============================================================================

export interface SDKContextOptions {
  /** Which primitives are enabled for this project */
  enabledPrimitives?: string[];
  /** Feature type being generated (for pattern injection) */
  featureType?: string;
  /** Include full API reference (for initial generation) */
  includeFullReference?: boolean;
  /** Include framework version info */
  includeFrameworkVersions?: boolean;
}

/**
 * Build SDK context string for injection into prompts.
 *
 * @param options - Configuration for what to include
 * @returns Formatted SDK context string for prompt injection
 */
export function buildSDKContext(options: SDKContextOptions = {}): string {
  const {
    enabledPrimitives = ['auth', 'db', 'storage', 'jobs', 'secrets', 'email', 'payments', 'analytics'],
    featureType,
    includeFullReference = true,
    includeFrameworkVersions = true,
  } = options;

  const sections: string[] = [];

  // Framework versions (always useful context)
  if (includeFrameworkVersions) {
    sections.push(FRAMEWORK_VERSIONS);
  }

  // Full SDK API reference (for initial generation or when comprehensive context needed)
  if (includeFullReference) {
    // Filter to only enabled primitives
    let filteredReference = SDK_API_REFERENCE;

    // Add note about what's enabled
    const enabledNote = `\n**Enabled primitives for this project:** ${enabledPrimitives.join(', ')}\n`;
    sections.push(enabledNote);
    sections.push(filteredReference);
  }

  // SDK rules (always include)
  sections.push(SDK_RULES);

  // Feature-specific patterns
  if (featureType && SDK_PATTERNS[featureType]) {
    const patterns = SDK_PATTERNS[featureType];
    const snippets = patterns
      .map((p) => PATTERN_SNIPPETS[p])
      .filter(Boolean)
      .join('\n');

    if (snippets) {
      sections.push(`\n## Pattern Examples for ${featureType}\n${snippets}`);
    }
  }

  return sections.join('\n\n');
}

/**
 * Get a minimal SDK context for incremental updates.
 * Smaller token footprint for follow-up prompts.
 */
export function getMinimalSDKContext(): string {
  return SDK_RULES;
}

/**
 * Detect feature type from user prompt for pattern injection.
 */
export function detectFeatureType(prompt: string): string | undefined {
  const lowered = prompt.toLowerCase();

  const featureKeywords: Record<string, string[]> = {
    login_form: ['login', 'sign in', 'signin', 'log in'],
    signup_form: ['signup', 'sign up', 'register', 'registration'],
    file_upload: ['upload', 'file upload', 'image upload'],
    image_gallery: ['gallery', 'images', 'photos'],
    data_table: ['table', 'list', 'data grid', 'datagrid'],
    data_form: ['form', 'create', 'edit', 'add new'],
    protected_route: ['protected', 'private', 'authenticated', 'dashboard'],
    user_profile: ['profile', 'account', 'settings'],
    background_task: ['background', 'async', 'queue'],
    scheduled_task: ['scheduled', 'cron', 'recurring'],
    api_integration: ['api', 'integration', 'third-party', 'external'],
    // Email features
    email_notification: ['email', 'send email', 'notification', 'notify'],
    welcome_email: ['welcome email', 'onboarding email'],
    password_reset: ['password reset', 'forgot password', 'reset password'],
    magic_link: ['magic link', 'passwordless', 'email login'],
    // Payment features
    checkout: ['checkout', 'buy', 'purchase', 'payment'],
    subscription: ['subscription', 'subscribe', 'recurring payment', 'plan', 'pricing'],
    billing_portal: ['billing', 'manage subscription', 'billing portal'],
    payment_webhook: ['webhook', 'stripe webhook', 'payment webhook'],
    // Analytics features
    event_tracking: ['track event', 'event tracking', 'analytics event', 'custom event'],
    page_tracking: ['page view', 'page tracking', 'track page'],
    user_identification: ['identify user', 'user tracking'],
    analytics_dashboard: ['analytics dashboard', 'analytics report', 'metrics'],
  };

  for (const [featureType, keywords] of Object.entries(featureKeywords)) {
    if (keywords.some((kw) => lowered.includes(kw))) {
      return featureType;
    }
  }

  return undefined;
}
