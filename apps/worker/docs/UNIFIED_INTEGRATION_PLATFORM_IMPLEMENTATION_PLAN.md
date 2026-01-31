# Unified Integration Platform Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to evolve the existing integration infrastructure into a unified, scalable integration platform that supports multiple third-party services while maintaining security, reliability, and developer experience.

**Our Competitive Advantage - MENA-Native Platform:**

Unlike Western-focused competitors (Lovable, v0, Replit), we're built for the Middle East and Arabic-speaking markets from day one.

**Key Differentiators:**
- **Local Payment Rails**: Paymob (Egypt), Tap Payments (GCC), mada, KNET, mobile wallets, BNPL (Tabby/Tamara)
- **WhatsApp-First Communication**: Unifonic, Infobip with Arabic templates
- **Arabic-First Development**: RTL by default, Arabic search, localized components
- **Regional Infrastructure**: AWS/Azure Middle East regions, data residency
- **Local Services**: Aramex/SMSA shipping, ZATCA/ETA compliance (Phase 2)

**Technical Improvements:**
- **Multiple Connections Per Provider**: Support for multiple workspaces/accounts
- **Environment Separation**: Dev/staging/prod connections with proper secret scoping
- **Integration Manifest System**: Single source of truth per provider
- **Enhanced Security**: Envelope encryption, idempotency, centralized rate limiting

## Table of Contents
1. [Current State Analysis](#current-state-analysis)
2. [Proposed Architecture](#proposed-architecture)
3. [Core Components](#core-components)
4. [Integration Categories](#integration-categories)
5. [Implementation Phases](#implementation-phases)
6. [Platform-Specific Integrations](#platform-specific-integrations)
7. [Security & Compliance](#security--compliance)
8. [Developer Experience](#developer-experience)
9. [Migration Strategy](#migration-strategy)
10. [Success Metrics](#success-metrics)

## Current State Analysis

### Existing Integrations

#### 1. GitHub Integration
- **Implementation**: OAuth App + GitHub App model
- **Features**: Two-way sync, webhook handling, conflict resolution
- **Storage**: Direct project table columns + sync operations table
- **Authentication**: Installation ID + webhook secrets
- **Location**: `/src/routes/github.ts`, `/src/services/githubAppService.ts`

#### 2. Supabase Integration
- **Implementation**: OAuth 2.0 with PKCE flow
- **Features**: Token management, project discovery, credential retrieval
- **Storage**: Encrypted tokens in `supabase_oauth_connections` table
- **Authentication**: OAuth tokens with refresh capability
- **Location**: `/src/routes/supabaseOAuth.ts`, `/src/services/supabaseConnectionService.ts`

#### 3. Integration Registry
- **Implementation**: `project_integrations` table
- **Features**: Status tracking, metadata storage
- **Current Types**: supabase, sanity, stripe (planned)
- **Location**: `/src/services/projectIntegrationService.ts`

### Current Limitations
1. Each integration has different implementation patterns
2. No unified webhook handling infrastructure
3. Limited abstraction for common patterns (OAuth, webhooks, API calls)
4. Inconsistent error handling and retry mechanisms
5. No centralized configuration management
6. Limited monitoring and observability across integrations
7. **Single connection per provider limitation** - Cannot connect multiple Slack workspaces or Stripe accounts
8. **No environment separation** - Missing dev/staging/prod connection scoping
9. **No centralized rate limiting** - Risk of hitting provider limits

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Applications                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Unified Integration API                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   Auth   │  │ Registry │  │  Events  │  │ Config   │  │
│  │  Manager │  │  Service │  │  Router  │  │ Manager  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┬─────────────┐
    ▼             ▼             ▼             ▼             ▼
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│Provider│  │Provider│  │Provider│  │Provider│  │Provider│
│Adapter │  │Adapter │  │Adapter │  │Adapter │  │Adapter │
│(GitHub)│  │(Stripe)│  │(Twilio)│  │(Slack) │  │(GA4)   │
└────────┘  └────────┘  └────────┘  └────────┘  └────────┘
```

### Design Principles
1. **Provider Abstraction**: Each integration implements a common interface
2. **Event-Driven**: Webhooks and events flow through a unified pipeline
3. **Security First**: Encrypted storage, signature validation, OAuth 2.0
4. **Resilient**: Retry mechanisms, circuit breakers, graceful degradation
5. **Observable**: Comprehensive logging, metrics, and tracing
6. **Developer Friendly**: Simple APIs, clear documentation, SDK support

## Core Components

### 1. Integration Registry Service
```typescript
interface IntegrationProvider {
  type: string;
  category: 'communication' | 'analytics' | 'payment' | 'development' | 'database' | 'deploy' | 'auth';
  authMethod: 'oauth2' | 'api_key' | 'webhook_secret' | 'jwt';
  capabilities: string[];
  webhookSupport: boolean;
  realTimeSupport: boolean;
  manifest: IntegrationManifest; // Standardized provider definition
}

// Integration Manifest - single source of truth per provider
interface IntegrationManifest {
  requiredScopes: string[];
  configSchema: ZodSchema; // Runtime validation
  webhookEvents: WebhookEventDefinition[];
  environments: ('dev' | 'staging' | 'prod')[];
  rateLimits: RateLimitConfig;
  uiFormHints: FormFieldDefinition[];

  // MENA-specific metadata for automatic filtering
  markets: string[]; // ['SA', 'EG', 'AE', 'KW', 'BH', 'QA', 'OM']
  currencies: string[]; // ['SAR', 'EGP', 'AED', 'KWD', 'BHD', 'QAR', 'OMR']
  dataResidency: string[]; // ['me-south-1', 'me-central-1', 'uae-north']
  capabilities: string[]; // ['payment.capture', 'bnpl.authorize', 'whatsapp.send']

  // Secrets handling
  secretFields: {
    field: string;
    redactInLogs: boolean;
    showTemporarily: boolean; // 1-second reveal on copy
  }[];
}
```

### 2. Authentication Manager
```typescript
interface AuthenticationManager {
  // OAuth 2.0 flow handling with PKCE support
  initiateOAuth(provider: string, userId: string, projectId: string, environment: string): OAuthInitiation;
  exchangeCode(code: string, verifier: string): Promise<TokenSet>;
  refreshToken(connectionId: string): Promise<TokenSet>;

  // Automatic token refresh before expiry
  scheduleTokenRefresh(connectionId: string): void;

  // API Key management with envelope encryption
  storeApiKey(provider: string, key: string, metadata: any): Promise<void>;

  // Webhook signature validation with multiple methods
  validateWebhookSignature(provider: string, rawBody: Buffer, headers: any): boolean;

  // Scope validation
  validateRequiredScopes(connectionId: string, operation: string): Promise<boolean>;
}
```

### 3. Event Router with Enhanced Pipeline
```typescript
interface EventRouter {
  // Incoming webhook handling with idempotency
  handleWebhook(provider: string, rawBody: Buffer, headers: any): Promise<void>;

  // Deduplication via provider_event_id
  checkDuplicate(provider: string, eventId: string): Promise<boolean>;

  // Outgoing event dispatch with outbox pattern
  dispatchEvent(event: IntegrationEvent): Promise<void>;

  // Event subscription management
  subscribe(pattern: string, handler: EventHandler): void;
  unsubscribe(subscriptionId: string): void;

  // Dead letter queue management
  moveToDeadLetter(event: IntegrationEvent, reason: string): Promise<void>;
  replayFromDeadLetter(eventId: string): Promise<void>;
}

// Webhook pipeline specifics:
// - Raw body retention for signature validation (7-day TTL)
// - Timestamp skew checks (±5 minutes)
// - Idempotency keys with 24-hour deduplication window
// - Exponential backoff with provider-specific retry policies
```

### 4. Enhanced Provider Adapter Interface
```typescript
interface ProviderAdapter {
  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  getManifest(): IntegrationManifest; // Provider metadata
  healthCheck(): Promise<HealthStatus>;

  // Authentication with explicit lifecycle
  beginOAuth(ctx: AuthContext): Promise<{ authUrl: string }>;
  exchangeOAuth(ctx: AuthContext, code: string): Promise<AuthResult>;
  refresh(ctx: AuthContext): Promise<AuthResult>;
  revoke(ctx: AuthContext): Promise<void>;

  // Capability-based operations
  getCapabilities(): ProviderCapabilities;
  supports(capability: PaymentCapability | CommCapability): boolean;
  requiredScopes(operation: string): string[];

  // Unified payment operations
  execute(operation: string, params: any, opts?: ExecOptions): Promise<any>;

  // Webhooks with raw body
  validateWebhook(rawBody: Buffer, headers: any): { ok: boolean; reason?: string };
  normalizeEvent(raw: any): IntegrationEventEnvelope; // Standardize shape
}

// Payment capability abstraction
enum PaymentCapability {
  CreateCheckout = 'checkout.create',
  CapturePayment = 'payment.capture',
  RefundPayment = 'payment.refund',
  CreatePayout = 'payout.create',
  BNPLAuthorize = 'bnpl.authorize',
  Tokenization = 'token.create',
  RecurringPayment = 'subscription.create'
}

// This allows AI/recipes to select providers by capability:
// "I need a provider that supports 'checkout.create' and 'bnpl.authorize' in Saudi Arabia"
// → System picks Tap or Tabby based on capabilities

// Execution options for rate limiting and retries
interface ExecOptions {
  timeout?: number;
  retries?: number;
  rateLimitKey?: string;
}
```

## Integration Categories

### 1. Deploy & Infrastructure (Regional-First)
- **AWS Middle East**: me-south-1 (Bahrain), me-central-1 (UAE) - Primary regions
- **Azure Middle East**: UAE North/Central, Qatar Central - Enterprise option
- **Cloudflare**: Global CDN with ME PoPs, R2 storage *(existing)*
- **Vercel**: Edge deployment with regional functions
- **GCP**: Doha, Tel Aviv regions *(Phase 2)*

### 2. Authentication & Identity
- **Clerk**: Complete auth with orgs/roles, pre-wired routes
- **Auth0**: Enterprise SSO, MFA
- **NextAuth**: Self-hosted auth solution
- **Supabase Auth**: Integrated with Supabase *(existing)*

### 3. Payment Processing (MENA-First)
- **Tap Payments**: GCC cards, mada (KSA), KNET (Kuwait), Benefit (Bahrain), OmanNet, NAPS (Qatar)
- **Paymob**: Egyptian cards, Meeza, mobile wallets (Vodafone Cash, Etisalat, Orange), payouts
- **Tabby**: BNPL popular in UAE/KSA *(Phase 1)*
- **Tamara**: BNPL for Saudi market *(Phase 1)*
- **Stripe**: International fallback, subscriptions *(existing)*
- **PayTabs**: Alternative GCC processor *(Phase 2)*
- **Moyasar**: Saudi-focused payments *(Phase 2)*

### 4. Communication Services (WhatsApp-First)
- **Unifonic**: Saudi CPaaS - SMS, OTP, WhatsApp Business (primary for KSA)
- **Infobip**: Regional BSP - WhatsApp, SMS, Voice (broader MENA coverage)
- **WhatsApp Business API**: Pre-built bot templates, Arabic support
- **Resend**: Transactional email (keep for simplicity)
- **Twilio**: International SMS/Voice fallback
- **360dialog**: WhatsApp API-only option *(Phase 2)*

### 5. Analytics & Monitoring
- **PostHog**: Product analytics + feature flags (easier than GA4)
- **Sentry**: Error tracking and performance monitoring
- **Datadog**: APM and infrastructure monitoring
- **Google Analytics 4**: Web analytics *(Phase 2)*
- **Mixpanel**: Advanced product analytics *(Phase 2)*

### 6. Database & Storage
- **Supabase**: PostgreSQL, Auth, Storage, Realtime *(existing)*
- **Cloudflare R2**: S3-compatible object storage *(existing)*
- **Cloudinary**: Image/video optimization and delivery
- **MongoDB Atlas**: NoSQL for specific use cases
- **PlanetScale**: MySQL with branching *(Phase 2)*

### 7. Development Tools
- **GitHub**: Source control, CI/CD *(existing)*
- **Linear**: Modern issue tracking
- **GitLab**: Alternative DevOps platform

### 8. AI & Vectors
- **Pinecone**: Vector database for AI applications
- **pgvector**: Vector search in Supabase *(existing capability)*
- **OpenAI**: GPT integration *(likely existing)*

### 9. Queues & Background Jobs
- **BullMQ**: Queue management *(existing)*
- **Inngest**: Event-driven background jobs
- **Trigger.dev**: Long-running jobs with observability

### 10. Logistics & Shipping (NEW - MENA Critical)
- **Aramex**: Pan-MENA shipping, labels, tracking, rates API
- **SMSA Express**: Saudi-focused courier service
- **J&T Express ME**: Alternative carrier *(Phase 2)*
- **Fetchr**: UAE last-mile delivery *(Phase 2)*

### 11. Government & Compliance *(Phase 2 - Enterprise)*
- **ZATCA (FATOORA)**: Saudi e-invoicing compliance
- **Egypt ETA**: E-invoicing and e-receipts
- **UAE PASS**: National identity SSO
- **Nafath**: Saudi national SSO

### 12. Marketing & CRM *(Phase 2 - Let users vote)*
- **HubSpot**: CRM with Arabic templates
- **Intercom**: Customer messaging with Arabic flows
- **Mailchimp**: Email marketing
- **Customer.io**: Behavioral messaging

## Implementation Phases

### Phase 1: MENA-Native SaaS Kit - Ship These First (Weeks 1-6)

**Goal**: Enable Arabic-speaking users to build a complete localized SaaS with regional payments, WhatsApp, and Arabic-first UX.

1. **Core Infrastructure** (Week 1-2)
   - [ ] Create unified integration database schema with multi-connection support
   - [ ] Build provider adapter interface with locale/region context
   - [ ] Implement authentication manager with envelope encryption
   - [ ] Set up event router with Arabic normalization support
   - [ ] Create centralized rate limiter (token bucket per provider)
   - [ ] Add environment separation (dev/staging/prod)
   - [ ] **Add RTL/i18n infrastructure for Arabic-first development**

2. **MENA Payment Rails** (Week 3)
   - [ ] **Tap Payments**: GCC payment methods (mada, KNET, Benefit)
   - [ ] **Paymob**: Egyptian payments (cards, Meeza, wallets)
   - [ ] **Tabby**: BNPL integration for UAE/KSA
   - [ ] **Stripe**: Keep for international payments
   - [ ] Unified checkout with locale detection
   - [ ] Arabic payment forms and error messages

3. **WhatsApp & Regional Comms** (Week 4)
   - [ ] **Unifonic**: SMS/OTP for Saudi Arabia
   - [ ] **Infobip**: WhatsApp Business API integration
   - [ ] WhatsApp bot starter templates (Arabic)
   - [ ] **Resend**: Keep for email
   - [ ] Arabic message templates library

4. **Arabic-First Features** (Week 5)
   - [ ] RTL layout system (Next.js + Tailwind RTL)
   - [ ] Arabic search with Elasticsearch analyzers
   - [ ] Bilingual component library (AR/EN)
   - [ ] Arabic font optimization (Cairo, Tajawal)
   - [ ] Mixed LTR/RTL text handling
   - [ ] Regional cloud deployment presets (AWS ME, Azure UAE)

5. **Essential Services & Logistics** (Week 5)
   - [ ] **Aramex**: Shipping integration with Arabic labels
   - [ ] **Clerk**: Auth with Arabic UI support
   - [ ] **PostHog**: Analytics with Arabic event names
   - [ ] **Sentry**: Error tracking
   - [ ] **Cloudinary**: Media with Arabic text overlays

6. **MENA Starter Recipes with Activation Checklist** (Week 6)
   - [ ] "Arabic E-commerce": Tap/Paymob + WhatsApp + Aramex
   - [ ] "Service Business": WhatsApp bookings + local payments
   - [ ] "SaaS for MENA": Multi-tenant with Arabic + regional billing
   - [ ] Automatic locale detection and currency selection
   - [ ] Pre-configured for regional deployment

   **Activation Checklist (All Green = Deploy)**:
   - [ ] Domain verified with SSL certificate
   - [ ] Payment gateway test checkout successful
   - [ ] WhatsApp template approved by BSP
   - [ ] Arabic font rendering verified
   - [ ] Shipping label generated (if applicable)
   - [ ] Regional deployment target selected
   - [ ] Environment variables configured

### Phase 2: Coming Soon - Let Users Vote (Weeks 7-10)

**Display these as "coming soon" with voting mechanism**

1. **More Payment Options**
   - [ ] Tamara - Saudi-focused BNPL
   - [ ] PayTabs - Alternative GCC processor
   - [ ] Moyasar - Saudi payment aggregator
   - [ ] PayFort (Amazon) - Regional gateway
   - [ ] STC Pay - Saudi digital wallet
   - [ ] Apple Pay / Google Pay - Mobile payments

2. **Government & Compliance (Enterprise)**
   - [ ] ZATCA (FATOORA) - Saudi e-invoicing
   - [ ] Egypt ETA - E-invoicing compliance
   - [ ] UAE PASS - National identity SSO
   - [ ] Nafath - Saudi national SSO
   - [ ] Absher - Saudi government services

3. **Additional Logistics**
   - [ ] SMSA Express - Saudi courier
   - [ ] J&T Express ME - Regional carrier
   - [ ] Fetchr - UAE last-mile
   - [ ] Naqel - Saudi logistics
   - [ ] what3words Arabic - Address system

4. **Advanced Arabic Features**
   - [ ] Arabic OCR - Document processing
   - [ ] Arabic voice (STT/TTS) - Voice interfaces
   - [ ] Arabic sentiment analysis
   - [ ] Dialect detection (Egyptian, Gulf, Levantine)
   - [ ] Arabic chatbot framework

5. **International Expansion**
   - [ ] Stripe - For global payments
   - [ ] PayPal - International alternative
   - [ ] Wise - Multi-currency accounts
   - [ ] Google Analytics 4 - When needed
   - [ ] HubSpot - CRM with Arabic support

### Phase 3: Platform Excellence (Weeks 11-12)

1. **Developer Experience**
   - [ ] Integration health dashboard (per-connection monitoring)
   - [ ] Recipe cards UI (quick templates)
   - [ ] Preflight checks (DNS, webhooks, scopes)
   - [ ] Cost preview calculator
   - [ ] Mock servers for testing (Stripe, Slack, Twilio)
   - [ ] Webhook replay tool
   - [ ] Contract tests (Pact)

2. **Production Hardening**
   - [ ] Dead letter queue UI with replay
   - [ ] Automatic token refresh scheduling
   - [ ] Provider-specific retry policies
   - [ ] Webhook raw body retention (7-day TTL)
   - [ ] Correlation IDs across all operations
   - [ ] Per-connection health metrics

### Phase 4: Scale & Enterprise (Future)

1. **Enterprise Features**
   - [ ] RBAC for integration management
   - [ ] Data residency controls (EU/US)
   - [ ] Audit logging with compliance exports
   - [ ] SSO for admin panel
   - [ ] White-label options

2. **Advanced Capabilities**
   - [ ] GraphQL API for integrations
   - [ ] Terraform provider
   - [ ] CLI tool for integration management
   - [ ] Self-hosted option
   - [ ] Integration marketplace for custom adapters

## Platform-Specific Integrations

### Multiple Connections Support

Each integration now supports multiple connections per project with environment scoping:

```typescript
interface ConnectionConfig {
  projectId: string;
  provider: string;
  environment: 'dev' | 'staging' | 'prod';
  alias?: string; // "Marketing Slack" or "EU Stripe Account"
  externalAccountId?: string; // Stripe account ID, Slack workspace ID
}
```

Example use cases:
- Multiple Stripe accounts (test/live, regional entities)
- Multiple Slack workspaces (internal, customer-facing)
- Multiple email providers (transactional, marketing)

### Tap Payments Integration (GCC Primary)
```typescript
interface TapConfig {
  secretKey: string;
  publicKey: string;
  merchantId: string;
  environment: 'sandbox' | 'production';
  supportedMethods: ['mada', 'knet', 'benefit', 'omannet', 'naps', 'visa', 'mastercard'];
  webhookSecret: string;
}

// Key Features
- All GCC local payment methods
- Arabic checkout UI by default
- Multi-currency support (SAR, AED, KWD, BHD, OMR, QAR)
- Tokenization for recurring payments
- 3D Secure handling
- Refunds and partial refunds
```

### Paymob Integration (Egypt Primary)
```typescript
interface PaymobConfig {
  apiKey: string;
  integrationId: string;
  iframeId: string;
  hmacSecret: string;
  supportedMethods: ['card', 'meeza', 'vodafonecash', 'etisalat', 'orange'];
}

// Key Features
- Egyptian card processing
- Meeza card support
- Mobile wallets (Vodafone Cash, Etisalat, Orange)
- Cash collection (Fawry, Aman, Masary)
- Payouts to wallets
- Installments support
```

### Tabby BNPL Integration
```typescript
interface TabbyConfig {
  publicKey: string;
  secretKey: string;
  merchantCode: string;
  webhookSecret: string;
  environment: 'sandbox' | 'production';
}

// Key Features
- Pay in 4 interest-free installments
- Pay later (up to 30 days)
- Instant approval
- Arabic & English checkout
- Popular in UAE & KSA
```

### Unifonic Integration (Saudi CPaaS)
```typescript
interface UnifonicConfig {
  appSid: string;
  senderId: string; // Pre-approved for KSA
  apiKey: string;
  webhookUrl: string;
  environment: 'sandbox' | 'production';
}

// Arabic PDF Generation for Shipping Labels
class ArabicPDFGenerator {
  async generateShippingLabel(shipment: Shipment): Promise<Buffer> {
    // Use Puppeteer with headless Chrome for proper Arabic rendering
    const browser = await puppeteer.launch({
      args: ['--font-render-hinting=none'] // Better Arabic rendering
    });

    const page = await browser.newPage();

    // HTML template with embedded Arabic fonts
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <style>
          @font-face {
            font-family: 'Cairo';
            src: url('data:font/woff2;base64,${CAIRO_FONT_BASE64}');
          }
          body {
            font-family: 'Cairo', sans-serif;
            direction: rtl;
          }
        </style>
      </head>
      <body>
        <div class="label">
          <h2>${shipment.recipientName}</h2>
          <p>${shipment.address.district}, ${shipment.address.city}</p>
          <p>${shipment.address.landmark || ''}</p>
          <div class="barcode">${shipment.trackingNumber}</div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A6',
      printBackground: true
    });

    await browser.close();
    return pdf;
  }
}

// Key Features
- Saudi-optimized SMS delivery
- Pre-approved sender IDs
- OTP with templates
- WhatsApp Business messaging
- Arabic message templates
- Number lookup & validation
- Detailed delivery reports
```

### Infobip Integration (WhatsApp BSP)
```typescript
interface InfobipConfig {
  apiKey: string;
  baseUrl: string; // Regional endpoint
  whatsappSenderId: string;
  templates: Map<string, ArabicTemplate>;
}

// Key Features
- WhatsApp Business API
- Pre-approved Arabic templates
- Media messages (images, documents)
- Interactive buttons/lists
- Session management
- Webhook delivery reports
- Multi-channel fallback (WhatsApp → SMS)
```

### Google Analytics 4 Integration
```typescript
// Configuration
interface GA4Config {
  propertyId: string;
  credentials: ServiceAccountCredentials | OAuth2Credentials;
  dataStreamId: string;
}

// Key Features
- Real-time reporting
- Custom events tracking
- Audience management
- Data export to BigQuery
- Measurement Protocol API
```

### Slack Integration
```typescript
// Configuration
interface SlackConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  appToken?: string; // For socket mode
}

// Key Features
- OAuth 2.0 with granular scopes
- Slash commands
- Interactive components
- Event subscriptions
- Incoming webhooks
```

### SendGrid Integration
```typescript
// Configuration
interface SendGridConfig {
  apiKey: string;
  webhookVerificationKey: string;
  fromEmail: string;
  templates: Record<string, string>;
}

// Key Features
- Transactional email
- Email templates
- Event webhooks (open, click, bounce)
- Batch sending
- Email validation
```

## Security & Compliance

### Enhanced Webhook Pipeline

1. **Secure Raw Body Storage**
   ```typescript
   // Store raw webhook bodies in R2/S3, not database
   interface WebhookStorage {
     async storeRawBody(eventId: string, body: Buffer): Promise<string> {
       // Compress and encrypt
       const compressed = await gzip(body);
       const encrypted = await encrypt(compressed, getWebhookEncryptionKey());

       // Store in R2 with 72-hour TTL
       const key = `webhooks/${eventId}/raw-body`;
       await r2.put(key, encrypted, {
         customMetadata: { ttl: '72h' },
         httpMetadata: { contentEncoding: 'gzip' }
       });

       // Return signed URL (admin-only access)
       return await r2.createSignedUrl(key, { expiresIn: 3600 });
     }

     // Store only hash + signature in database
     async storeWebhookMetadata(event: WebhookEvent): Promise<void> {
       await db.query(`
         INSERT INTO integration_events
         (id, provider, event_hash, signature, payload, storage_url)
         VALUES ($1, $2, $3, $4, $5, $6)
       `, [
         event.id,
         event.provider,
         sha256(event.rawBody),
         event.signature,
         event.payload, // Parsed JSON only
         event.storageUrl // Pointer to R2
       ]);
     }
   }
   ```

2. **Idempotency & Deduplication**
   - Store provider_event_id with UNIQUE constraint
   - Timestamp skew validation (±5 minutes)
   - 24-hour deduplication window
   - Return 200 OK for duplicate events

3. **Retry Policies**
   - Stripe: Exponential backoff up to 24 hours
   - Slack: 3 retries over 1 hour
   - Twilio: 5 retries over 6 hours
   - Dead letter queue after max retries

4. **Rate Limiting & Circuit Breaking**
   ```typescript
   class RateLimiter {
     // Per-connection rate limiting for granular control
     async acquire(connectionId: string, tokens = 1): Promise<boolean> {
       const key = `rate:${connectionId}`;
       const bucket = await this.getBucket(key);

       if (bucket.tokens >= tokens) {
         bucket.tokens -= tokens;
         await this.saveBucket(key, bucket);
         return true;
       }

       return false;
     }

     // Honor provider Retry-After headers
     async handleRateLimitResponse(connectionId: string, retryAfter: number): Promise<void> {
       await this.pauseConnection(connectionId, retryAfter * 1000);
     }
   }

   class CircuitBreaker {
     private failures = new Map<string, number>();
     private states = new Map<string, 'closed' | 'open' | 'half-open'>();

     async execute<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
       const state = this.states.get(connectionId) || 'closed';

       if (state === 'open') {
         throw new Error(`Circuit breaker open for connection ${connectionId}`);
       }

       try {
         const result = await fn();
         this.onSuccess(connectionId);
         return result;
       } catch (error) {
         this.onFailure(connectionId, error);
         throw error;
       }
     }

     private onFailure(connectionId: string, error: any): void {
       const failures = (this.failures.get(connectionId) || 0) + 1;
       this.failures.set(connectionId, failures);

       // Open circuit after 5 consecutive 5xx errors
       if (error.status >= 500 && failures >= 5) {
         this.states.set(connectionId, 'open');
         // Auto-reset to half-open after 60 seconds
         setTimeout(() => this.states.set(connectionId, 'half-open'), 60000);
       }
     }
   }
   ```

### Authentication Security
1. **OAuth 2.0 Best Practices**
   - Use PKCE for public clients
   - Implement state parameter validation
   - Short-lived access tokens (1 hour)
   - Secure refresh token rotation
   - Encrypted token storage

2. **API Key Management**
   - Encrypt keys at rest using AES-256
   - Regular key rotation reminders
   - Audit trail for key usage
   - Immediate revocation capability
   - Environment-specific keys

### Webhook Security
1. **Signature Validation**
   ```typescript
   // Example implementation
   function validateWebhookSignature(
     provider: string,
     payload: string,
     signature: string,
     secret: string
   ): boolean {
     switch(provider) {
       case 'stripe':
         return stripe.webhooks.constructEvent(payload, signature, secret);
       case 'twilio':
         return validateTwilioSignature(url, params, signature, authToken);
       case 'github':
         return validateGitHubSignature(payload, signature, secret);
       default:
         return validateHMAC(payload, signature, secret);
     }
   }
   ```

2. **Additional Security Measures**
   - HTTPS-only endpoints
   - IP allowlisting where supported
   - Request replay protection
   - Rate limiting per integration
   - Webhook URL rotation capability

### Data Protection
1. **Encryption**
   - TLS 1.3 for all API communications
   - Database encryption at rest
   - Field-level encryption for sensitive data
   - Key management using AWS KMS or similar

2. **Compliance**
   - GDPR compliance for EU users
   - Data residency options
   - Right to deletion implementation
   - Audit logging for all operations

## Developer Experience

### Integration Manifest System

Each provider has a standardized manifest that serves as the single source of truth:

```yaml
# integrations/stripe/manifest.yaml
name: Stripe
category: payment
icon: https://cdn.stripe.com/icon.svg
docs: https://stripe.com/docs

auth:
  methods: [api_key]
  required_config:
    - field: publishable_key
      type: string
      label: Publishable Key
      placeholder: pk_test_...
    - field: secret_key
      type: string
      label: Secret Key
      placeholder: sk_test_...
      secret: true

scopes:
  payments_read: Read payment data
  payments_write: Create and manage payments
  customers_read: Read customer data
  subscriptions_manage: Manage subscriptions

webhooks:
  events:
    - payment_intent.succeeded
    - payment_intent.failed
    - customer.subscription.created
    - customer.subscription.deleted
  signature_header: stripe-signature
  signature_method: hmac-sha256

rate_limits:
  requests_per_second: 100
  burst_limit: 500

environments:
  test:
    base_url: https://api.stripe.com
    key_prefix: sk_test_
  live:
    base_url: https://api.stripe.com
    key_prefix: sk_live_

operations:
  createCustomer:
    scopes: [customers_write]
    method: POST
    endpoint: /v1/customers
  createPaymentIntent:
    scopes: [payments_write]
    method: POST
    endpoint: /v1/payment_intents
```

This manifest drives:
- UI form generation
- Validation schemas
- Documentation
- SDK type generation
- Test mock generation

### Provider Simulators & Testing

```typescript
// Mock servers for local development
class ProviderSimulator {
  constructor(private provider: string, private port: number) {}

  async start() {
    // Responds to provider API calls with test data
    // Simulates webhook delivery
    // Provides deterministic responses
  }

  // Golden corpus of test payloads
  getTestWebhook(event: string): any {
    return goldenPayloads[this.provider][event];
  }

  // Synthetic webhook generation for testing
  async sendSyntheticWebhook(
    connectionId: string,
    eventType: string,
    customData?: any
  ): Promise<void> {
    const event = this.generateEvent(eventType, customData);
    const signature = this.signWebhook(event);

    await fetch(`${process.env.API_URL}/v1/webhooks/${this.provider}/${connectionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [`x-${this.provider}-signature`]: signature
      },
      body: JSON.stringify(event)
    });
  }
}

// One-click webhook testing from UI
class WebhookTestButton extends React.Component {
  async sendTestWebhook() {
    await fetch('/api/integrations/test-webhook', {
      method: 'POST',
      body: JSON.stringify({
        connectionId: this.props.connectionId,
        eventType: 'payment_intent.succeeded'
      })
    });
  }

  render() {
    return (
      <button onClick={this.sendTestWebhook}>
        Send Test Webhook
      </button>
    );
  }
}

// Contract testing with Pact
const stripePact = new Pact({
  consumer: 'integration-platform',
  provider: 'stripe',
  spec: 2
});

// Webhook replay tool
class WebhookReplayTool {
  async captureWebhook(connectionId: string): Promise<void> {
    // Store raw webhook for replay
  }

  async replay(webhookId: string, targetUrl?: string): Promise<void> {
    // Replay with original headers and signature
  }
}
```

### Integration SDK
```typescript
// Simple integration API
import { IntegrationClient } from '@sheenapps/integrations';

const client = new IntegrationClient({
  apiKey: process.env.SHEENAPPS_API_KEY
});

// Connect an integration
const connection = await client.connect('stripe', {
  userId: 'user_123',
  projectId: 'project_456',
  config: {
    publishableKey: 'pk_test_...',
    secretKey: 'sk_test_...'
  }
});

// Use the integration
const result = await client.execute('stripe', 'createCustomer', {
  email: 'user@example.com',
  name: 'John Doe'
});

// Handle webhooks
client.on('stripe.payment_intent.succeeded', async (event) => {
  console.log('Payment successful:', event.data);
});
```

### Configuration UI
```typescript
// Integration configuration component
interface IntegrationConfigProps {
  provider: string;
  onConnect: (config: any) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

// Features
- Step-by-step setup wizard
- Credential validation
- Test mode toggle
- Webhook URL display
- Health status indicator
- Usage analytics
```

### Documentation
1. **Per-Integration Guides**
   - Quick start guide
   - Authentication setup
   - Common use cases
   - Webhook event reference
   - API method documentation
   - Troubleshooting guide

2. **Code Examples**
   - Language-specific examples
   - Common scenarios
   - Error handling patterns
   - Testing strategies

## Migration Strategy

### Database Migration with Multi-Connection Support
```sql
-- Enhanced schema with multi-connection and environment support
CREATE TABLE integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  provider TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'prod', -- dev|staging|prod
  alias TEXT, -- "Marketing Slack", "EU Stripe Account"
  status TEXT NOT NULL DEFAULT 'connected',
  auth_type TEXT NOT NULL,
  external_account_id TEXT, -- Stripe account ID, Slack workspace ID
  credentials JSONB NOT NULL, -- Envelope-encrypted
  metadata JSONB NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX ON integration_connections(project_id, provider, environment);
CREATE INDEX ON integration_connections(external_account_id) WHERE external_account_id IS NOT NULL;

-- Application-level uniqueness check to prevent duplicate display names
-- Enforce: unique(project_id, provider, environment, COALESCE(alias, external_account_id))

CREATE TABLE integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES integration_connections(id),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_event_id TEXT, -- For deduplication
  occurred_at TIMESTAMPTZ,
  payload JSONB NOT NULL, -- Parsed JSON only
  event_hash TEXT, -- SHA256 of raw body
  signature TEXT, -- Provider signature
  storage_url TEXT, -- Signed URL to R2/S3 for raw body (admin-only)
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, provider_event_id) -- Prevent duplicates
);

CREATE INDEX ON integration_events(status, next_retry_at)
  WHERE status IN ('pending', 'retrying');

-- Audit log for raw body access
CREATE TABLE webhook_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES integration_events(id),
  accessed_by UUID REFERENCES users(id),
  access_reason TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### API Migration
```typescript
// Backward compatibility wrapper
class LegacyAPIWrapper {
  // Map old endpoints to new integration platform
  async handleGitHubWebhook(payload: any) {
    return this.integrationPlatform.handleWebhook('github', payload);
  }

  async handleSupabaseOAuth(code: string) {
    return this.integrationPlatform.oauth.exchange('supabase', code);
  }
}
```

### Rollout Strategy
1. **Alpha Phase** (Internal Testing)
   - Deploy to staging environment
   - Internal team testing
   - Performance benchmarking
   - Security audit

2. **Beta Phase** (Limited Release)
   - 10% of traffic through new system
   - Monitor error rates and performance
   - Gather feedback from beta users
   - Fix critical issues

3. **General Availability**
   - Gradual rollout to 100% of users
   - Deprecation notices for old APIs
   - Migration tools for existing integrations
   - Support period for legacy endpoints

## Success Metrics

### MENA Success Metrics (Primary)
- **Time-to-first-Arabic-payment**: < 15 minutes with local payment method
- **Local payment method usage**: > 60% using mada/Meeza/wallets vs cards
- **WhatsApp engagement**: > 40% projects enable WhatsApp support
- **Regional deployment**: > 70% choose ME regions vs global
- **Arabic UI adoption**: > 50% projects use RTL templates
- **Time-to-first-deploy**: < 5 minutes for MENA recipe
- **Integration Health Score**: % connections with no errors in last 24h

### Technical Metrics
- **Webhook Success**: > 99.8% successful processing
- **Token Refresh Failures**: < 0.2% daily failure rate
- **P95 Adapter Operations**: < 250ms response time
- **Deduplication Effectiveness**: < 0.01% duplicate events processed

### Adoption Metrics
- **Multi-Connection Usage**: % projects using 2+ connections for same provider
- **Environment Usage**: % projects with dev/staging/prod separation
- **Recipe Adoption**: % new projects using SaaS Starter recipe
- **Phase 1 Coverage**: % projects needing only Phase 1 integrations

### Operational Metrics
- **Dead Letter Rate**: < 0.1% events requiring manual intervention
- **Rate Limit Hits**: < 1% requests hitting provider limits
- **Automatic Recovery**: > 95% errors self-heal via retry
- **Support Deflection**: < 2% users need integration support

## Risk Mitigation

### Technical Risks
1. **Provider API Changes**
   - Mitigation: Version locking, deprecation monitoring
   - Contract tests to detect breaking changes
   - Maintain provider changelog tracking

2. **Webhook Delivery Failures**
   - Mitigation: Retry mechanism with exponential backoff
   - Dead letter queue with manual replay UI
   - Webhook health monitoring dashboard

3. **Token Expiration**
   - Mitigation: Proactive refresh 15 minutes before expiry
   - Alert on repeated refresh failures
   - Fallback to re-authentication flow

4. **Rate Limiting**
   - Mitigation: Token bucket per (provider, project)
   - Honor Retry-After headers
   - Adaptive backoff on 429 responses
   - Queue overflow to background jobs

### Business Risks
1. **Provider Bans**
   - Mitigation: Strict rate limiting below provider thresholds
   - Monitoring for unusual activity patterns
   - Provider relationship management

2. **Data Privacy Concerns**
   - Mitigation: Envelope encryption for credentials
   - Data residency controls (EU/US)
   - Audit trails with 90-day retention
   - GDPR compliance tooling

3. **Integration Complexity**
   - Mitigation: Integration Manifest abstraction
   - Recipe templates for common use cases
   - Provider simulators for testing
   - Comprehensive error messages with fixes

## Implementation Timeline

### Sprint 1-2 (Weeks 1-2): Foundation
- Database schema with multi-connection support
- Integration Manifest system
- Provider adapter base class
- Rate limiter and retry logic
- Environment separation (dev/staging/prod)

### Sprint 3-4 (Weeks 3-4): Phase 1 Integrations
- Clerk authentication adapter
- Stripe payment adapter with metered billing
- Resend email adapter
- PostHog analytics adapter
- Enhance existing Sentry integration

### Sprint 5-6 (Weeks 5-6): SaaS Starter Recipe
- Recipe template system
- One-click SaaS starter setup
- Environment variable propagation
- Health check dashboard
- Integration wizard UI

### Sprint 7-8 (Weeks 7-8): Production Hardening
- Mock servers for Stripe, Clerk, Resend
- Contract tests with Pact
- Dead letter queue UI
- Webhook replay tool
- Monitoring and alerting

### Sprint 9-10 (Weeks 9-10): Beta Release
- Limited beta with selected users
- "Coming Soon" voting mechanism
- Documentation and examples
- Performance optimization
- Security audit

### Sprint 11-12 (Weeks 11-12): GA Launch
- Full production release
- Marketing launch
- Support documentation
- Video tutorials
- Community feedback loop

## Next Steps

1. **Sprint 0 - Immediate Actions** (This Week)
   - [ ] Review and approve this revised plan
   - [ ] Form integration platform team (2-3 engineers)
   - [ ] Set up project board with sprint planning
   - [ ] Create Integration Manifest schema v1
   - [ ] Design multi-connection database migration

2. **Technical Kickoff**
   - [ ] Set up integration testing environment
   - [ ] Create provider simulator framework
   - [ ] Implement envelope encryption for credentials
   - [ ] Build rate limiter prototype
   - [ ] Design webhook deduplication system

3. **Partner Outreach**
   - [ ] Contact Tap Payments for partnership and rate limits
   - [ ] Set up Paymob sandbox for Egypt testing
   - [ ] Register with Unifonic for Saudi SMS/WhatsApp
   - [ ] Apply for Infobip WhatsApp BSP access
   - [ ] Get Tabby BNPL merchant account
   - [ ] Contact Aramex for API credentials
   - [ ] Document BSP approval timelines

4. **Compliance & Testing**
   - [ ] Create ZATCA/ETA test harness (Phase 2 prep)
   - [ ] Set up Arabic PDF rendering with HarfBuzz/Puppeteer
   - [ ] Implement synthetic webhook generator
   - [ ] Build provider capability matrix
   - [ ] Create activation checklist system

5. **User Research & Prioritization**
   - [ ] Survey users on integration priorities
   - [ ] Create "Coming Soon" voting widget with country + business type
   - [ ] Weight votes by ICP (paying customers, active projects)
   - [ ] Identify beta testers for MENA recipes
   - [ ] Gather feedback on Arabic UX
   - [ ] Track voting patterns by region (EG vs SA vs UAE)

## Conclusion

This unified integration platform will provide a scalable, secure, and developer-friendly way to connect with third-party services. By abstracting common patterns and providing a consistent interface, we can accelerate integration development while maintaining high standards for security and reliability.

The phased approach ensures we can deliver value incrementally while maintaining system stability. With proper execution, this platform will become a key differentiator and value driver for the business.

## Appendices

### A. Technology Stack
- **Language**: TypeScript/Node.js
- **Framework**: Fastify
- **Database**: PostgreSQL
- **Cache**: Redis
- **Queue**: BullMQ
- **Monitoring**: OpenTelemetry
- **Security**: OAuth 2.0, JWT, HMAC-SHA256

### B. Reference Documentation
- [OAuth 2.0 RFC](https://datatracker.ietf.org/doc/html/rfc6749)
- [Webhook Security Best Practices](https://webhooks.dev/docs/security/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [AsyncAPI Specification](https://www.asyncapi.com/docs/reference/specification/latest)

### C. Integration Priority Matrix (Revised)

#### Phase 1: MENA-First Integrations (Ship These)
| Integration | Priority | Complexity | Business Value | Sprint |
|------------|----------|------------|----------------|--------|
| Tap Payments | Critical | Medium | Critical | 3 |
| Paymob | Critical | Medium | Critical | 3 |
| Tabby BNPL | Critical | Low | High | 3 |
| Unifonic | Critical | Low | Critical | 4 |
| Infobip WhatsApp | Critical | Medium | Critical | 4 |
| Aramex | High | Medium | High | 5 |
| Arabic Search | Critical | Low | Critical | 5 |
| RTL System | Critical | Low | Critical | 2 |
| Clerk | High | Low | High | 4 |
| PostHog | Medium | Medium | Medium | 5 |
| AWS ME Regions | High | Low | High | 2 |

#### Phase 2: Coming Soon (User Voting)
| Integration | Interest | Complexity | Business Value | Status |
|------------|----------|------------|----------------|--------|
| Twilio | High | Medium | High | Vote |
| Slack | High | Medium | High | Vote |
| Google Analytics | Medium | High | Medium | Vote |
| HubSpot | Medium | High | Medium | Vote |
| Discord | Medium | Low | Medium | Vote |
| Linear | Medium | Medium | Medium | Vote |
| Intercom | Low | High | Medium | Vote |

### D. Recipe Templates

#### "Arabic E-commerce" Recipe (MENA Primary)
- **Stack**: Next.js + TypeScript + RTL
- **Database**: Supabase with Arabic collation
- **Authentication**: Clerk with Arabic UI
- **Payments**: Tap (GCC) + Paymob (Egypt) + Tabby (BNPL)
- **Communication**: WhatsApp (Infobip) + SMS (Unifonic)
- **Shipping**: Aramex integration
- **Analytics**: PostHog with Arabic events
- **Deploy**: AWS me-south-1 or Azure UAE
- **Search**: Elasticsearch with Arabic analyzer

#### "Service Business MENA" Recipe
- **Stack**: Next.js + Arabic-first UI
- **Bookings**: Cal.com with Arabic support
- **Payments**: Local payment methods
- **WhatsApp**: Automated booking confirmations
- **SMS**: OTP via Unifonic
- **Maps**: Google Maps RTL + what3words Arabic

#### "Global SaaS" Recipe (International)
- **Stack**: Next.js + TypeScript
- **Database**: Supabase (PostgreSQL + Auth)
- **Authentication**: Clerk (with orgs/roles)
- **Payments**: Stripe (subscriptions + metered AI usage)
- **Email**: Resend (transactional)
- **Analytics**: PostHog (product + feature flags)
- **Monitoring**: Sentry (errors + performance)
- **Deploy**: Vercel/Cloudflare Pages
- **Storage**: Cloudflare R2 + Cloudinary

#### "Enterprise B2B" Recipe
- Everything in SaaS Starter plus:
- **SSO**: Auth0 Enterprise
- **CRM**: HubSpot or Salesforce
- **Support**: Intercom
- **Compliance**: Datadog + audit logs

#### "AI Application" Recipe
- Everything in SaaS Starter plus:
- **Vectors**: Pinecone or pgvector
- **LLM**: OpenAI or Anthropic
- **Jobs**: Inngest for long-running
- **Usage**: Stripe metered billing
