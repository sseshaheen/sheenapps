# SheenApps Localization Implementation Plan

## Executive Summary

This comprehensive plan addresses the localization gap in SheenApps' Next.js frontend and Worker microservice. Currently, we have a solid next-intl foundation with 9 locales but missing translation files and zero localization in the Worker backend. This plan provides a structured approach to implement ICU-compliant, scalable internationalization across both systems.

## Current State Analysis

### ✅ **What We Have (Strong Foundation)**
- **next-intl Configuration**: Proper routing setup for 9 locales (`en`, `ar-eg`, `ar-sa`, `ar-ae`, `ar`, `fr`, `fr-ma`, `es`, `de`)
- **Locale Configuration**: Complete locale config with RTL support, currencies, and regional pricing
- **Navigation Utilities**: Centralized `useNavigationHelpers()` with proper next-intl routing
- **Font Support**: Modern Arabic fonts (Cairo, IBM Plex Arabic) with fallbacks
- **TypeScript Types**: Comprehensive message type definitions in `src/types/messages.ts`
- **Validation Script**: Translation validation script (currently pointing to non-existent files)

### ✅ **Translation Files Exist**
- **9 Complete Translation Files**: All locales have 580-627 lines of translations in `/src/messages/`
- **Arabic Translations**: Complete Arabic translations with RTL content
- **Regional Variants**: Separate files for ar-eg, ar-sa, ar-ae, fr-ma

### ❌ **What We're Missing (Critical Gaps)**
- **Worker Localization**: Zero internationalization in Fastify Worker backend
- **Error Localization**: API errors return English strings, not localized codes
- **ICU Support**: Limited ICU message formatting (basic placeholders only, no plurals/select)
- **Route-Level Splitting**: Currently loads all translations on every page (580+ lines)
- **Namespace Organization**: Single monolithic JSON file per locale, not split by feature

## Goals & Principles

### **Goals (What "Good" Looks Like)**
- ✅ Consistent UX across Next.js + Worker surfaces (UI, emails, API errors)
- ✅ Single source of truth for messages and error codes
- ✅ Zero secret strings in Worker (prefer codes+params, localize at UI edge)
- ✅ Fast performance (route-level split dictionaries, no 200KB blobs)
- ✅ Safe for RTL (Arabic family) and region variants

### **Core Principles**
- **ICU Everywhere**: One formatting model for plurals, select, date/number formatting
- **Codes Over Prose**: Server responses use `{ code, params }` → UI renders localized text
- **English Source of Truth**: Other locales fall back gracefully to English
- **No Localized Logs**: Logs stay English/structured for debugging

## Implementation Plan (Aligned with next-intl Best Practices)

### **next-intl Official Recommendations We're Following**
- ✅ **Server-First Approach**: Use `getTranslations()` in Server Components, minimize client-side translations
- ✅ **Component-Based Namespacing**: Use component names as primary namespace organization
- ✅ **ICU MessageFormat**: Full support for plurals, select, and rich text formatting
- ✅ **Message Splitting**: Support for loading messages from multiple files per locale
- ✅ **Pre-translated Props**: Pass translated strings from Server to Client Components
- ✅ **Selective Client Messages**: Use `pick()` to send only required namespaces to client

## Implementation Plan

### **Phase 0: Foundation & Architecture (Week 1 - Expert Feedback Applied)**

#### **Thin Shared i18n-core Package (Minimal Implementation)**
```bash
mkdir -p packages/i18n-core/src
```

**File Structure (Minimal):**
```
packages/i18n-core/
├── src/
│   ├── index.ts                 # Core utilities only
│   ├── error-codes.ts           # Stable error code definitions
│   ├── locale-utils.ts          # Locale resolution & detection
│   └── types.ts                 # Minimal TypeScript interfaces
```

**Core Functions (`packages/i18n-core/src/index.ts`):**
```typescript
// Minimal shared utilities (Expert Recommendation: Keep it thin)
export { ERROR_CODES } from './error-codes'
export { resolveLocale, isRTL, localeAliases } from './locale-utils'
export type { LocaleCode, ErrorCode } from './types'

// Strict locale negotiation order (Expert Feedback)
export function resolveLocale(
  urlLocale?: string,
  profileLocale?: string, 
  cookieLocale?: string,
  acceptLanguage?: string
): string {
  // Priority: URL/profile → cookie → Accept-Language → default
  return urlLocale || profileLocale || cookieLocale || 
         parseAcceptLanguage(acceptLanguage) || 'en'
}

export function isRTL(locale: string): boolean {
  return locale.startsWith('ar') || locale.startsWith('he') || locale.startsWith('fa')
}

// Arabic numerals policy (Expert Feedback)
export const localeAliases = {
  'ar': { numberingSystem: 'latn' },
  'ar-eg': { numberingSystem: 'latn' },
  'ar-sa': { numberingSystem: 'latn' },
  'ar-ae': { numberingSystem: 'latn' }
}
```

**Locale Utils (`packages/i18n-core/src/locale-utils.ts`):**
```typescript
export const SUPPORTED_LOCALES = ['en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de'] as const
export const DEFAULT_LOCALE = 'en'

// Region overlays architecture (Expert Feedback)
export function getLocaleChain(locale: string): string[] {
  if (locale.includes('-')) {
    const [base] = locale.split('-')
    return [locale, base, DEFAULT_LOCALE]
  }
  return [locale, DEFAULT_LOCALE]
}
```

#### **Error Code Taxonomy (`packages/i18n/src/error-codes.ts`):**
```typescript
export const ERROR_CODES = {
  // Authentication
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  
  // AI & Building
  AI_LIMIT_REACHED: 'AI_LIMIT_REACHED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  BUILD_TIMEOUT: 'BUILD_TIMEOUT',
  BUILD_FAILED: 'BUILD_FAILED',
  
  // Rate Limiting
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Network & System
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  
  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_FAILED: 'VALIDATION_FAILED'
} as const
```

### **Phase 1: Next.js Implementation (4-5 days)**

#### **Migration Steps**

**1. Refactor Existing Translation Files to Namespace Structure**
```bash
# Current: Single monolithic file per locale (580+ lines)
src/messages/en.json  # All translations in one file

# Target: Split into feature namespaces
src/messages/en/
  ├── common.json      # Extract common section
  ├── navigation.json  # Extract navigation section
  ├── auth.json       # Extract auth section
  ├── builder.json    # Extract builder section
  ├── dashboard.json  # Extract dashboard section
  ├── billing.json    # Extract billing/pricing sections
  ├── errors.json     # Add new error codes
  └── hero.json       # Extract hero/marketing sections

# Migration script to split existing files:
node scripts/split-translations.js
```

**2. Update next-intl Configuration**

**`src/i18n/request.ts` (next-intl Best Practice Pattern):**
```typescript
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'
import deepmerge from 'deepmerge'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  // next-intl recommended: Split messages by feature/component
  // This pattern supports both monolithic and split message files
  const messages = await loadMessages(locale)
  
  return {
    locale,
    messages,
    timeZone: getTimeZone(locale),
    now: new Date(),
    // Enable strict mode in development for missing translations
    onError: process.env.NODE_ENV === 'development' 
      ? (error) => console.error('Missing translation:', error)
      : undefined,
    getMessageFallback: ({ namespace, key }) => `${namespace}.${key}`
  }
})

async function loadMessages(locale: string): Promise<any> {
  try {
    // Start with monolithic file (current state)
    const baseMessages = (await import(`../messages/${locale}.json`)).default
    
    // Future: Load split namespace files when they exist
    // This allows gradual migration from monolithic to split files
    const namespaceFiles = ['common', 'auth', 'builder', 'dashboard', 'billing', 'errors']
    const namespaceMessages: any = {}
    
    for (const namespace of namespaceFiles) {
      try {
        const msgs = (await import(`../messages/${locale}/${namespace}.json`)).default
        namespaceMessages[namespace] = msgs
      } catch {
        // Namespace file doesn't exist yet, will use base messages
      }
    }
    
    // Merge with deepmerge for regional variants (e.g., ar-eg extends ar)
    if (locale.includes('-')) {
      const baseLocale = locale.split('-')[0]
      try {
        const baseLocaleMessages = (await import(`../messages/${baseLocale}.json`)).default
        return deepmerge(baseLocaleMessages, { ...baseMessages, ...namespaceMessages })
      } catch {}
    }
    
    return { ...baseMessages, ...namespaceMessages }
  } catch (error) {
    console.error(`Failed to load messages for locale ${locale}:`, error)
    // Fallback to English
    return (await import('../messages/en.json')).default
  }
}
```

**3. ICU Message Format Implementation**

**Sample ICU Messages (`src/messages/en/errors.json`):**
```json
{
  "AI_LIMIT_REACHED": "Our AI is at capacity. {resetMinutes, plural, =0 {Try again now} one {Try again in 1 minute} other {Try again in # minutes}}.",
  "INSUFFICIENT_BALANCE": "Insufficient balance. You need {requiredBalance} credits but have {currentBalance}. {recommendation, select, upgrade {Upgrade your plan} purchase {Purchase credits} other {Add credits to continue}}.",
  "RATE_LIMITED": "Too many requests. Please wait {waitTime, number} {waitTime, plural, one {second} other {seconds}} before trying again.",
  "BUILD_TIMEOUT": "Build timed out after {duration, number, ::currency/USD} minutes. {suggestion}",
  "VALIDATION_FAILED": "{fieldCount, plural, one {1 field has} other {# fields have}} validation errors: {fields}"
}
```

**4. Component Migration Pattern (next-intl Best Practices)**

**Server Component (Preferred - Zero Bundle Impact):**
```typescript
import { getTranslations } from 'next-intl/server'

export default async function CreateButton() {
  const t = await getTranslations('Dashboard')
  return <button>{t('actions.createProject')}</button>
}
```

**Client Component (When Interactivity Required):**
```typescript
'use client'
import { useTranslations } from 'next-intl'

export default function CreateButton() {
  const t = useTranslations('Dashboard')
  return <button onClick={...}>{t('actions.createProject')}</button>
}
```

**Hybrid Pattern (Server Translates, Client Renders):**
```typescript
// Server Component
import { getTranslations } from 'next-intl/server'
import ClientButton from './ClientButton'

export default async function CreateButtonWrapper() {
  const t = await getTranslations('Dashboard')
  // Pass pre-translated text to minimize client bundle
  return <ClientButton label={t('actions.createProject')} />
}

// Client Component
'use client'
export default function ClientButton({ label }: { label: string }) {
  return <button onClick={...}>{label}</button>
}
```

**5. RTL Layout Updates**

**`src/app/[locale]/layout.tsx` (Enhanced):**
```typescript
export default async function RootLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode
  params: { locale: Locale }
}) {
  const direction = localeConfig[locale].direction
  
  return (
    <html lang={locale} dir={direction} className={getFontClasses(locale)}>
      <head>
        {direction === 'rtl' && <link rel="stylesheet" href="/css/rtl.css" />}
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

function getFontClasses(locale: Locale): string {
  const isArabic = locale.startsWith('ar')
  return [
    geistSans.variable,
    geistMono.variable,
    isArabic ? cairo.variable : '',
    isArabic ? ibmPlexArabic.variable : '',
    isArabic ? 'font-arabic' : 'font-latin'
  ].filter(Boolean).join(' ')
}
```

### **Phase 2: Worker Backend Integration (Week 2 - Expert Feedback Applied)**

#### **Worker Team Action Items**

**1. Environment Setup with Precompiled ICU (Expert Recommendation)**
```bash
# In Worker project
npm install @formatjs/cli intl-messageformat
npm install @sheenapps/i18n-core
```

**2. Precompiled ICU Build Process**
```json
// worker/package.json scripts
{
  "scripts": {
    "i18n:compile": "formatjs compile messages/en/*.json --out-file compiled/en.json",
    "i18n:compile-all": "for locale in en ar fr es de; do formatjs compile messages/$locale/*.json --out-file compiled/$locale.json; done",
    "build": "npm run i18n:compile-all && tsc"
  }
}
```

**3. Shared Package Integration with Performance Focus**
```typescript
// worker/src/i18n/index.ts
import { resolveLocale, ERROR_CODES, isRTL } from '@sheenapps/i18n-core'
import { IntlMessageFormat } from 'intl-messageformat'

export class LocalizationService {
  private static instance: LocalizationService
  private compiledCatalogs: Map<string, Record<string, IntlMessageFormat>> = new Map()
  
  // Load precompiled ICU messages (Expert Feedback)
  async loadCompiledCatalog(locale: string): Promise<void> {
    if (!this.compiledCatalogs.has(locale)) {
      try {
        const compiled = await import(`../compiled/${locale}.json`)
        const messages = new Map()
        
        for (const [key, compiledMessage] of Object.entries(compiled.default)) {
          messages.set(key, new IntlMessageFormat(compiledMessage as any, locale))
        }
        
        this.compiledCatalogs.set(locale, messages)
      } catch (error) {
        // Fallback to English if locale not available
        if (locale !== 'en') {
          await this.loadCompiledCatalog('en')
        }
      }
    }
  }
  
  formatMessage(locale: string, code: string, params: any = {}): string {
    const resolvedLocale = resolveLocale(locale)
    const catalog = this.compiledCatalogs.get(resolvedLocale)
    
    if (catalog?.has(code)) {
      return catalog.get(code)!.format(params)
    }
    
    // Fallback to error code if message not found
    return code
  }
}
```

**4. API Response Standardization with Versioning Window (Expert Feedback)**
```typescript
// worker/src/types/responses.ts
export interface StandardAPIResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    params?: Record<string, any>
    message?: string  // Keep for 2-week compatibility window (Expert Feedback)
  }
}

// worker/src/utils/error-formatter.ts
export function formatError(
  code: string, 
  params?: any, 
  locale?: string,
  includeMessage = true  // Versioning flag
): StandardAPIResponse {
  const response: StandardAPIResponse = {
    success: false,
    error: {
      code,
      params
    }
  }
  
  // Worker Response Versioning Window (Expert Feedback)
  // Keep error_message for 2 weeks during frontend migration
  if (includeMessage && locale) {
    response.error!.message = LocalizationService.getInstance()
      .formatMessage(locale, code, params)
  }
  
  return response
}

// Migration helper - remove after frontend fully migrated
export function formatErrorLegacy(message: string, code?: string): StandardAPIResponse {
  return {
    success: false,
    error: {
      code: code || 'INTERNAL_ERROR',
      message  // Legacy format
    }
  }
}
```

**4. Build Events API Updates**
```typescript
// worker/src/routes/build-events.ts
app.post('/v1/projects/:id/build', async (request, reply) => {
  try {
    // ... build logic
    
    if (insufficientBalance) {
      return reply.status(402).send(formatError('INSUFFICIENT_BALANCE', {
        requiredBalance: 100,
        currentBalance: 25,
        recommendation: 'purchase'
      }))
    }
    
    // Success response
    return reply.send({
      success: true,
      data: { buildId, projectId }
    })
    
  } catch (error) {
    logger.error('Build failed:', error)
    return reply.status(500).send(formatError('INTERNAL_ERROR'))
  }
})
```

**5. Email Localization (If Worker sends emails)**
```typescript
// worker/src/services/email-service.ts
export class EmailService {
  private i18n = LocalizationService.getInstance()
  
  async sendBuildCompleteEmail(userId: string, locale: string, buildData: any) {
    await this.i18n.loadCatalog(locale, 'emails')
    
    const subject = this.i18n.formatMessage(locale, 'emails.buildComplete.subject', {
      projectName: buildData.name
    })
    
    const body = this.i18n.formatMessage(locale, 'emails.buildComplete.body', {
      projectName: buildData.name,
      previewUrl: buildData.previewUrl
    })
    
    // Send email logic
  }
}
```

### **Phase 3: Frontend Error Integration (2-3 days)**

#### **Client-Side Error Handling**

**1. Enhanced Error Types (`src/types/worker-api.ts`):**
```typescript
export interface LocalizedError {
  code: string
  params?: Record<string, any>
  message?: string
  localizedMessage?: string
}

export class LocalizedWorkerAPIError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly params: Record<string, any> = {},
    public readonly statusCode: number = 500
  ) {
    super(errorCode)
    this.name = 'LocalizedWorkerAPIError'
  }
  
  getLocalizedMessage(locale: string): string {
    // Use client-side i18n to format the error
    return t(locale, `errors.${this.errorCode}`, this.params)
  }
}
```

**2. API Error Handler (`src/utils/api-error-handler.ts`):**
```typescript
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'

export function useErrorHandler() {
  const t = useTranslations('errors')
  const locale = useLocale()
  
  const formatError = (error: any): string => {
    if (error?.code && error.code in ERROR_CODES) {
      return t(error.code, error.params || {})
    }
    
    // Fallback to generic error
    return t('INTERNAL_ERROR')
  }
  
  return { formatError }
}
```

**3. Build Progress Error Display:**
```typescript
// src/components/builder/clean-build-progress.tsx
function BuildErrorDisplay({ error }: { error: any }) {
  const { formatError } = useErrorHandler()
  const { navigateToBilling } = useNavigationHelpers()
  
  if (error?.code === 'INSUFFICIENT_BALANCE') {
    return (
      <div className="error-card">
        <p>{formatError(error)}</p>
        {error.recommendation === 'purchase' && (
          <button onClick={navigateToBilling}>
            {formatError({ code: 'PURCHASE_CREDITS' })}
          </button>
        )}
      </div>
    )
  }
  
  return <div className="error-card">{formatError(error)}</div>
}
```

### **Phase 4: Performance Optimization (2-3 days) - next-intl Best Practices**

#### **next-intl Recommended Performance Patterns**

**1. Server-Side Translation Loading (Preferred):**
```typescript
// app/[locale]/dashboard/page.tsx
import { getTranslations } from 'next-intl/server'
import { unstable_setRequestLocale } from 'next-intl/server'

export default async function DashboardPage({ params: { locale } }) {
  // Enable static rendering for this locale
  unstable_setRequestLocale(locale)
  
  // Load only needed namespaces
  const t = await getTranslations('Dashboard')
  
  return (
    <div>
      <h1>{t('title')}</h1>
      {/* Server Components with translations = zero client bundle impact */}
    </div>
  )
}
```

**2. Selective Client Message Passing:**
```typescript
// app/[locale]/builder/layout.tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import pick from 'lodash/pick'

export default async function BuilderLayout({ children, params: { locale } }) {
  const messages = await getMessages()
  
  // Only pass required namespaces to client components
  const clientMessages = pick(messages, ['Builder', 'Common.errors', 'Common.actions'])
  
  return (
    <NextIntlClientProvider messages={clientMessages}>
      {children}
    </NextIntlClientProvider>
  )
}
```

**3. Message Splitting Strategy (Gradual Migration):**
```typescript
// scripts/split-translations.js
const fs = require('fs')
const path = require('path')

const locales = ['en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de']

locales.forEach(locale => {
  const monolithicFile = path.join(__dirname, `../src/messages/${locale}.json`)
  const messages = JSON.parse(fs.readFileSync(monolithicFile, 'utf8'))
  
  // Split by top-level keys into separate namespace files
  Object.keys(messages).forEach(namespace => {
    const namespacePath = path.join(__dirname, `../src/messages/${locale}/${namespace}.json`)
    fs.mkdirSync(path.dirname(namespacePath), { recursive: true })
    fs.writeFileSync(namespacePath, JSON.stringify(messages[namespace], null, 2))
  })
})
```

**4. Development Translation Debugging:**
```typescript
// src/i18n/request.ts (Enhanced with missing key detection)
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  
  // Region overlays architecture (Expert Feedback)
  const messages = await loadMessagesWithOverlays(locale, getRouteFromRequest())
  
  return {
    locale,
    messages,
    // Missing key overlay dev flag (Expert Feedback)
    onError: process.env.NEXT_PUBLIC_I18N_DEBUG_MISSING_KEYS === 'true' 
      ? (error) => console.warn('Missing translation:', error)
      : undefined
  }
})

async function loadMessagesWithOverlays(locale: string, route: string): Promise<any> {
  const localeChain = getLocaleChain(locale) // ['ar-eg', 'ar', 'en']
  let mergedMessages = {}
  
  // Load messages in reverse order (base → regional overrides)
  for (const localeInChain of localeChain.reverse()) {
    try {
      const baseMessages = await import(`../messages/${localeInChain}/common.json`)
      mergedMessages = { ...mergedMessages, ...baseMessages.default }
      
      // Route-specific overlays
      if (route.startsWith('/auth')) {
        const routeMessages = await import(`../messages/${localeInChain}/auth.json`)
        mergedMessages = { ...mergedMessages, ...routeMessages.default }
      }
    } catch (error) {
      // Continue with next locale in chain
    }
  }
  
  return mergedMessages
}
```

**2. ESLint Rule for Raw Strings (Expert Feedback)**
```json
// .eslintrc.json (Enhanced with i18n rule)
{
  "rules": {
    "@sheenapps/no-raw-strings": "error"
  }
}
```

```typescript
// eslint-rules/no-raw-strings.js
module.exports = {
  create(context) {
    return {
      JSXText(node) {
        const text = node.value.trim()
        if (text && !isAllowedRawString(text)) {
          context.report({
            node,
            message: `Raw string "${text}" should use translation. Use t('key') or useTranslations()`
          })
        }
      },
      TemplateElement(node) {
        const text = node.value.raw.trim()
        if (text && !isAllowedRawString(text) && isUserFacingString(text)) {
          context.report({
            node,
            message: `Raw template string "${text}" should use translation`
          })
        }
      }
    }
  }
}

function isAllowedRawString(text) {
  // Allow imports, console logs, technical strings
  return (
    text.length < 3 ||
    /^[A-Z_]+$/.test(text) ||  // Constants like ERROR_CODES
    /^\w+$/.test(text) ||      // Single words like 'id', 'src'
    text.includes('/') ||       // Paths
    text.includes('@') ||       // Emails, imports
    text.match(/^[\d\s\-\+\(\)]+$/) // Numbers, phone formats
  )
}
```

#### **Route-Level Message Loading**

**3. Dynamic Imports by Route:**
```typescript
// src/hooks/use-route-translations.ts
export function useRouteTranslations(namespace: string) {
  const [messages, setMessages] = useState<any>({})
  const locale = useLocale()
  
  useEffect(() => {
    import(`../messages/${locale}/${namespace}.json`)
      .then(module => setMessages(module.default))
      .catch(() => setMessages({}))
  }, [locale, namespace])
  
  return messages
}
```

**4. Bundle Splitting (Expert Feedback: Evaluate Next.js 15 Defaults First)**
```typescript
// next.config.ts (Conservative approach - test defaults first)
const nextConfig = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Expert Feedback: Don't over-customize splitChunks - Next 15 handles this well
    // Only add custom splitting if bundle analysis shows specific issues
    
    if (process.env.ANALYZE_BUNDLE === 'true') {
      // Add translation-specific splitting only if needed
      config.optimization.splitChunks.cacheGroups.translations = {
        test: /[\\/]messages[\\/]/,
        name: 'translations',
        chunks: 'all',
        enforce: true
      }
    }
    
    return config
  }
}
```

### **Phase 5: Testing & Validation (2-3 days)**

#### **Translation Coverage Testing**
```typescript
// tests/i18n/translation-coverage.test.ts
describe('Translation Coverage', () => {
  const baseLocale = 'en'
  const testLocales = ['ar', 'fr', 'es', 'de']
  
  testLocales.forEach(locale => {
    test(`${locale} has all keys from ${baseLocale}`, async () => {
      const baseMessages = await import(`../../src/messages/${baseLocale}/common.json`)
      const localeMessages = await import(`../../src/messages/${locale}/common.json`)
      
      const baseKeys = flattenKeys(baseMessages.default)
      const localeKeys = flattenKeys(localeMessages.default)
      
      const missingKeys = baseKeys.filter(key => !localeKeys.includes(key))
      
      expect(missingKeys).toEqual([])
    })
  })
})
```

#### **RTL Visual Testing**
```typescript
// tests/e2e/rtl-layout.spec.ts
test('Arabic layout renders correctly', async ({ page }) => {
  await page.goto('/ar/builder')
  
  // Check RTL direction
  const html = page.locator('html')
  await expect(html).toHaveAttribute('dir', 'rtl')
  
  // Check Arabic font loading
  await expect(html).toHaveClass(/font-arabic/)
  
  // Visual regression test
  await expect(page).toHaveScreenshot('arabic-builder.png')
})
```

#### **Error Code Integration Testing**
```typescript
// tests/api/error-localization.test.ts
describe('API Error Localization', () => {
  test('Worker returns proper error codes', async () => {
    const response = await fetch('/api/worker/build', {
      method: 'POST',
      body: JSON.stringify({ insufficientBalance: true })
    })
    
    const data = await response.json()
    
    expect(data).toMatchObject({
      success: false,
      error: {
        code: 'INSUFFICIENT_BALANCE',
        params: expect.any(Object)
      }
    })
  })
  
  test('Frontend formats error correctly', async () => {
    const error = { code: 'INSUFFICIENT_BALANCE', params: { requiredBalance: 100 } }
    const { formatError } = renderHook(() => useErrorHandler())
    
    const message = formatError.result.current.formatError(error)
    expect(message).toContain('100 credits')
  })
})
```

## Translation Content Strategy

### **Phase 6: Content Enhancement & Gap Filling (1-2 weeks ongoing)**

Since translation files already exist with 580+ lines per locale, focus on:

#### **Priority Order (Building on Existing Translations)**
1. **Add Error Codes** (Week 1): Structured error messages with ICU formatting
2. **ICU Enhancement** (Week 1): Upgrade existing translations to use plurals/select
3. **Builder States** (Week 2): Build progress, recommendations, error states
4. **Missing Keys** (Week 2): Gap analysis and completion
5. **Regional Refinement** (Ongoing): Locale-specific adjustments for ar-eg, ar-sa, fr-ma

#### **Translation Workflow**
1. **Baseline Creation**: Start with comprehensive English messages
2. **Key Extraction**: Automated script to extract hardcoded strings
3. **Professional Translation**: Use translation service for core languages (Arabic, French, Spanish, German)
4. **Community Translation**: For regional variants (ar-eg, ar-sa, fr-ma)
5. **Review & QA**: Native speakers review translations
6. **Continuous Updates**: New features include translations from day 1

## Worker Team Specific Requirements (Enhanced for Multi-Server Architecture)

### **Critical Architecture Insights from Worker Overview**
Based on the Worker's multi-mode, multi-server, queue-based architecture:
- **Locale must travel with jobs** across queues and servers, not rely on current request
- **Stream/SSE events must use codes only** since multiple clients with different locales watch the same build
- **Stateless design required** for multi-server deployment with bundled precompiled catalogs

### **Immediate Actions (Week 1)**

1. **Environment Setup**
   ```bash
   npm install @formatjs/icu-messageformat-parser intl-messageformat fastify-plugin
   ```

2. **Fastify i18n Plugin Implementation**
   ```typescript
   // plugins/i18n.ts
   import fp from 'fastify-plugin'
   import { resolveLocale, canonicalize, SUPPORTED_LOCALES } from '@sheenapps/i18n-core'
   import { createFormatter } from '../i18n/formatter'

   export default fp(async (app) => {
     app.decorateRequest('i18n', null)

     app.addHook('onRequest', async (req) => {
       // Strict locale negotiation chain (never trust dynamic user input)
       const locale = resolveLocale(
         req.headers['x-sheen-locale'] as string,  // 1. Explicit header
         req.cookies?.locale,                       // 2. Cookie
         undefined,                                  // 3. (profile claim in auth)
         req.headers['accept-language'] as string   // 4. Accept-Language
       )
       
       // Whitelist validation - critical for security
       const safe = SUPPORTED_LOCALES.includes(locale as any) ? locale : 'en'
       
       req.i18n = {
         locale: safe,
         t: createFormatter(safe),
         isRTL: safe.startsWith('ar')
       }
     })
   })
   ```

3. **Queue Locale Propagation (Critical for BullMQ)**
   ```typescript
   // When enqueuing jobs - locale MUST travel with the job
   queue.add('build', {
     ...payload,
     locale: request.i18n.locale  // Persist locale in job data
   }, { jobId })

   // In job processor - use job's locale, NOT current request
   async function processBuildJob(job: Job) {
     const { locale } = job.data
     const t = createFormatter(locale)
     // ... processing logic uses job's locale
   }
   ```

4. **Stream/SSE Events - Codes Only Pattern**
   ```typescript
   // CRITICAL: Emit codes + params, never localized text
   emitEvent(buildId, {
     code: 'DEPENDENCY_INSTALL_PROGRESS',
     params: { step: 3, total: 10, pct: 30 },
     debug_data: process.env.NODE_ENV === 'development' ? rawCliOutput : undefined
   })

   // ❌ NEVER: message: "Installing dependencies (30%)"
   // ✅ ALWAYS: code + params, let frontend localize
   ```

5. **Error Response with 2-Week Compatibility Window**
   ```typescript
   return reply.status(402).send({
     success: false,
     error: {
       code: 'INSUFFICIENT_BALANCE',
       params: {
         requiredBalance: estimatedCost,
         currentBalance: userBalance,
         recommendation: 'purchase'
       },
       // Temporary field - remove after 2 weeks
       message: process.env.LEGACY_ERROR_MESSAGES === 'true' 
         ? 'Insufficient balance to complete build' 
         : undefined
     }
   })
   ```

### **API Changes Required (Stream-Safe)**

**Database Events Table:**
```sql
-- Worker writes codes only
INSERT INTO project_build_events (
  build_id, 
  event_code,      -- 'DEPENDENCY_INSTALL_PROGRESS'
  event_params,    -- {"step": 3, "total": 10, "pct": 30}
  debug_data       -- Raw CLI output (internal only)
) VALUES (?, ?, ?, ?)

-- Never write localized text to DB
-- Frontend localizes when reading
```

**Security Hardening:**
- **No dynamic imports** based on user locale
- **Whitelist all locales** against SUPPORTED_LOCALES constant
- **English-only logs** - never localize system logs
- **No HTML in Worker** - only codes and params

### **Build Events Schema Updates with Error Analytics (Expert Feedback)**

```sql
-- Add error_code and error_params columns
ALTER TABLE project_build_events 
ADD COLUMN error_code VARCHAR(50),
ADD COLUMN error_params JSONB;

-- Partial index for error analytics (Expert Feedback)
CREATE INDEX idx_build_events_errors 
ON project_build_events (error_code, created_at) 
WHERE error_code IS NOT NULL;

-- Additional analytics indexes for error monitoring
CREATE INDEX idx_build_events_error_trends 
ON project_build_events (error_code, DATE(created_at)) 
WHERE error_code IS NOT NULL;

-- Update existing error_message data
UPDATE project_build_events 
SET error_code = 'BUILD_FAILED' 
WHERE error_message IS NOT NULL AND error_code IS NULL;

-- Keep error_message for legacy compatibility during migration (2 weeks)
-- TODO: Remove error_message column after frontend migration complete
```

### **Email Service Integration (If Applicable)**

If Worker sends emails directly:
- Load shared i18n catalogs for email templates
- Format emails using user's locale preference
- Implement fallback to English for unsupported locales

## Risk Analysis & Mitigation

### **High-Risk Areas**

**1. Bundle Size Impact**
- **Risk**: Translation files could significantly increase bundle size
- **Mitigation**: Route-level splitting, lazy loading, compression
- **Monitoring**: Bundle analyzer integration in CI

**2. RTL Layout Regressions**
- **Risk**: Arabic layouts might break existing components
- **Mitigation**: CSS logical properties, comprehensive visual testing
- **Monitoring**: Playwright visual regression tests

**3. Worker API Breaking Changes**
- **Risk**: Changing error responses might break frontend
- **Mitigation**: Gradual migration, backward compatibility period
- **Monitoring**: API integration tests

**4. Translation Quality & Consistency**
- **Risk**: Poor translations impact user experience
- **Mitigation**: Professional translation service, native speaker review
- **Monitoring**: User feedback, support ticket analysis

### **Medium-Risk Areas**

**1. Performance Impact**
- **Risk**: ICU formatting might slow down rendering
- **Mitigation**: Pre-compiled message catalogs, caching
- **Monitoring**: Core Web Vitals tracking

**2. Development Workflow Disruption**
- **Risk**: New i18n requirements slow down feature development
- **Mitigation**: ESLint rules, developer tooling, clear documentation
- **Monitoring**: Development velocity metrics

## next-intl Specific Anti-Patterns to Avoid

Based on official documentation, avoid these common mistakes:

### **❌ DON'T: Load All Messages on Every Page**
```typescript
// Bad: Loading entire 580+ line file for every route
messages: (await import(`../messages/${locale}.json`)).default
```

### **❌ DON'T: Use Client Components for Static Translations**
```typescript
// Bad: Unnecessary client bundle impact
'use client'
export function StaticHeader() {
  const t = useTranslations('Header')
  return <h1>{t('title')}</h1> // No interactivity = should be server component
}
```

### **❌ DON'T: Pass All Messages to Client Components**
```typescript
// Bad: Sends entire message catalog to client
<NextIntlClientProvider messages={messages}>
```

### **✅ DO: Use Server Components and Selective Client Messages**
```typescript
// Good: Server component for static content
export async function StaticHeader() {
  const t = await getTranslations('Header')
  return <h1>{t('title')}</h1>
}

// Good: Pass only required messages to client
<NextIntlClientProvider messages={pick(messages, ['Interactive', 'Errors'])}>
```

## Success Metrics

### **Technical Metrics**
- ✅ Bundle size impact < 15% on core routes
- ✅ Translation coverage > 95% for critical paths
- ✅ Error localization coverage = 100%
- ✅ RTL visual regression tests pass = 100%
- ✅ Performance impact < 50ms on initial load

### **User Experience Metrics**
- ✅ User language preference adoption rate
- ✅ Support ticket reduction in non-English languages
- ✅ Conversion rate improvement in localized markets
- ✅ User satisfaction scores by locale

### **Development Metrics**
- ✅ Translation update velocity (strings/week)
- ✅ Development task impact (translation overhead)
- ✅ Error code consistency across services

## Expert Feedback Integration

### **Implemented Recommendations (High Priority)**

#### **1. Thin Shared i18n-core Package**
- **Change**: Create minimal shared package immediately with core utilities
- **Components**: `ERROR_CODES`, `resolveLocale()`, `isRTL()`, `localeAliases`
- **Benefit**: Prevents duplication, ensures consistency across Frontend + Worker
- **Implementation**: Week 1 focus, before broader translation work

#### **2. Precompiled ICU Messages for Worker**
- **Change**: Use FormatJS CLI to precompile ICU messages for performance
- **Command**: `formatjs compile messages/en/*.json --out-file compiled/en.json`
- **Benefit**: Eliminates runtime ICU parsing overhead in Worker
- **Implementation**: Part of build process, Worker-specific optimization

#### **3. Strict Locale Negotiation Order**
- **Change**: Lock down precedence: URL/profile → cookie → Accept-Language → default
- **Implementation**: Update `resolveLocale()` function with explicit fallback chain
- **Benefit**: Predictable behavior, eliminates edge cases
- **Code**: Enhanced logic in shared i18n-core package

#### **4. Arabic Numerals Policy**
- **Change**: Force `numberingSystem: 'latn'` for consistency across Arabic locales
- **Rationale**: Avoid mixed Western/Arabic numerals that confuse users
- **Implementation**: ICU number formatting configuration
- **Example**: All amounts show "123.45" instead of "١٢٣.٤٥"

#### **5. Worker Response Versioning Window**
- **Change**: Keep legacy `error_message` field temporarily for compatibility
- **Migration**: 2-week window where both `code`+`params` AND `message` exist
- **Benefit**: Prevents breaking changes during deployment
- **Cleanup**: Remove `error_message` after frontend fully migrated

#### **6. Database Partial Index for Error Analytics**
- **Addition**: `CREATE INDEX idx_build_events_errors ON project_build_events (error_code, created_at) WHERE error_code IS NOT NULL`
- **Benefit**: Fast error analytics queries without full table scans
- **Use case**: Error rate monitoring, trending analysis

#### **7. Region Overlays Architecture**
- **Pattern**: Base `ar/` messages with `ar-eg/` overrides merged at runtime
- **Structure**: `ar/common.json` + `ar-eg/common.json` → merged result
- **Benefit**: Reduces duplication, easier maintenance for regional variants
- **Implementation**: Enhanced message loading logic

#### **8. Missing Key Overlay Dev Flag**
- **Feature**: `NEXT_PUBLIC_I18N_DEBUG_MISSING_KEYS=true` shows missing translations
- **Display**: Highlights untranslated strings in development
- **Benefit**: Immediate feedback for developers, catches gaps early
- **Implementation**: next-intl configuration enhancement

#### **9. ESLint Rule for Raw Strings**
- **Rule**: Forbid raw strings in `.tsx` files (except imports, constants)
- **Configuration**: Custom ESLint rule to enforce translation usage
- **Exceptions**: Allow hardcoded strings in specific contexts
- **Benefit**: Prevents accidental hardcoded text, enforces i18n compliance

#### **10. Adjusted Timeline Focus**
- **Week 1**: Shared core package, locale negotiation, Arabic numerals
- **Week 2**: Worker integration, precompiled ICU, response versioning
- **Benefit**: More realistic timeline, front-loads critical architecture decisions

### **Implementation Considerations (Evaluating)**

#### **1. Webpack splitChunks Customization**
- **Expert Note**: "Don't over-customize webpack splitChunks - Next 15 handles this well"
- **Evaluation**: Test default Next.js 15 bundle splitting vs custom translation splitting
- **Decision**: Start with defaults, customize only if bundle analysis shows issues
- **Monitoring**: Bundle analyzer to validate approach

#### **2. CI Error Rules Namespace**
- **Expert Note**: "Starting with errors namespace only might want stricter from start"
- **Evaluation**: Begin with strict rules for all namespaces vs gradual enforcement
- **Options**: 
  - Conservative: Errors only → gradual expansion
  - Aggressive: All namespaces from day 1
- **Decision**: Balance development velocity with translation quality

#### **3. Email Localization Service Ownership**
- **Expert Note**: "Emails in Worker vs Web depends on architecture decisions"
- **Current State**: Emails mostly in Next.js, some Worker notifications
- **Evaluation**: Centralize email service vs distribute across services
- **Factors**: Template complexity, personalization needs, delivery reliability

## Timeline Summary (Revised Based on Expert Feedback)

| Phase | Duration | Key Deliverables | Dependencies |
|-------|----------|-----------------|--------------|
| **Phase 0** | **Week 1** | **Shared i18n-core package, locale negotiation, Arabic numerals** | Next.js team + Worker team |
| **Phase 1** | 4-5 days | Next.js route-level translations, ICU support | Shared package complete |
| **Phase 2** | **Week 2** | **Worker precompiled ICU, response versioning, error analytics** | **Worker team** |
| **Phase 3** | 2-3 days | Frontend error integration | Phase 1 + 2 complete |
| **Phase 4** | 2-3 days | Performance optimization (evaluate vs Next.js defaults) | Phase 1-3 complete |
| **Phase 5** | 2-3 days | Testing & validation, ESLint rules | All phases |
| **Phase 6** | 2-3 weeks | Content migration & translation | Ongoing |

**Total Timeline**: ~3-4 weeks for technical implementation + 2-3 weeks for content

## Concerns & Recommendations

### **Concerns About the Original Proposal**

#### **1. Shared Package Complexity**
- **Concern**: Creating a separate `packages/i18n` might be over-engineering for current needs
- **Recommendation**: Start with monolith approach, extract to package later when Worker team has bandwidth
- **Alternative**: Use existing `src/i18n/` as shared reference, sync manually initially

#### **2. Timeline Optimism**
- **Concern**: Original timeline (1-2 days per phase) seems aggressive
- **Reality Check**: Translation workflow, testing, and QA take longer than expected
- **Recommendation**: Plan for 3-4 weeks technical + 2-3 weeks content

#### **3. Worker Team Bandwidth**
- **Concern**: Worker team might not have immediate capacity for i18n integration
- **Recommendation**: Phase Worker changes to be additive, maintain backward compatibility
- **Fallback**: Frontend-only localization initially, Worker integration later

### **Additional Recommendations**

#### **1. Start Small, Scale Up**
- Begin with critical error messages and core UI
- Gradually expand to full localization
- Measure impact at each step

#### **2. Leverage Existing Tools**
- Use next-intl's built-in features more extensively
- Consider Crowdin or Lokalise for translation management
- Implement automatic missing translation detection

#### **3. Focus on Arabic RTL First**
- Arabic markets might have higher conversion potential
- RTL implementation is the most complex part
- Success here validates the architecture for other locales

## Expert Feedback Integration - Round 3 (Worker Architecture)

### **Critical Implementations (Must Have for Worker)**

#### **1. Fastify i18n Plugin + Job Trait Pattern**
- **Why Critical**: Worker's queue-based architecture means locale must travel with jobs, not HTTP requests
- **Implementation**: Fastify plugin decorates requests, BullMQ jobs carry locale in data
- **Impact**: Ensures consistent localization across async job processing

#### **2. Stream Mode = Codes Only**
- **Why Critical**: Multiple clients with different locales can watch the same build stream
- **Implementation**: SSE/events emit `{code, params}`, frontend localizes in real-time
- **Never**: Write localized text to DB or streams

#### **3. Stateless Multi-Server Design**
- **Why Critical**: Worker runs on multiple servers, can't rely on runtime state
- **Implementation**: Bundle precompiled catalogs with Docker image
- **LRU Cache**: Small (50 entries) for namespace loading, not critical state

#### **4. Security Hardening**
- **Whitelist locales**: Never dynamic import based on user input
- **English-only logs**: System logs stay structured and English
- **No HTML generation**: Worker emits codes/params only

#### **5. CLI Output Mapping**
- **Why Critical**: Claude CLI output is internal/technical
- **Implementation**: Map to high-level event codes (e.g., `DEPENDENCY_INSTALL_PROGRESS`)
- **Debug data**: Store raw output separately for support

### **Deferred Considerations (Evaluate Later)**

#### **1. Observability Metrics Cardinality**
- **Suggestion**: Hash keys to limit cardinality in metrics
- **Our Approach**: Start with simple logging, add if scale requires
- **Revisit**: When daily active builds > 10,000

#### **2. Health Check Catalog Verification**
- **Suggestion**: Verify catalog availability on startup
- **Our Approach**: Trust bundled files in Docker image
- **Revisit**: If deployment issues arise

#### **3. User Error Message Views**
- **Suggestion**: Compute localized messages via DB views
- **Our Approach**: Frontend handles all localization
- **Revisit**: If performance requires server-side caching

### **Not Implementing (Over-Engineering)**

#### **1. R2 Runtime Catalog Fetching**
- **Why Not**: Adds network dependency and latency
- **Better**: Bundle catalogs in Docker image

#### **2. Complex TTL Caching**
- **Why Not**: Worker restarts frequently, cache rarely helps
- **Better**: Load common namespaces at startup

#### **3. Per-Request Locale Signing**
- **Why Not**: Locale doesn't affect security/semantics
- **Better**: Standard HMAC without locale consideration

## Expert Feedback Integration - Round 2

### **Implemented Improvements (High Value)**

#### **1. Single Source for Locale Resolution**
```typescript
// packages/i18n-core/src/locale-utils.ts
export function canonicalize(locale: string): string {
  // Normalize to BCP-47 canonical form
  try { 
    return Intl.getCanonicalLocales(locale)[0] ?? 'en'
  } catch { 
    return 'en'
  }
}

export function resolveLocale(localeHint?: string): string {
  if (!localeHint) return 'en'
  const canonical = canonicalize(localeHint)
  // Map regional to base if not supported
  if (!supportedLocales.includes(canonical)) {
    const base = canonical.split('-')[0]
    return supportedLocales.includes(base) ? base : 'en'
  }
  return canonical
}

// packages/i18n-core/src/index.ts
export { canonicalize, resolveLocale } from './locale-utils'
```

#### **2. BiDi Isolation for RTL**
```typescript
// packages/i18n-core/src/bidi-utils.ts
export function bidiIsolate(text: string, isRTL: boolean): string {
  if (!isRTL) return text
  // Wrap with Unicode FSI...PDI for proper isolation
  return `\u2068${text}\u2069`
}

export function formatRTLParams(params: Record<string, any>, locale: string): Record<string, any> {
  if (!isRTL(locale)) return params
  
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      // Isolate numbers, IDs, currency codes
      if (typeof value === 'number' || /^[A-Z0-9_-]+$/i.test(value)) {
        return [key, bidiIsolate(String(value), true)]
      }
      return [key, value]
    })
  )
}
```

#### **3. Locked Number & Currency Policy**
```typescript
// packages/i18n-core/src/formatters.ts
export function createNumberFormatter(locale: string, options?: Intl.NumberFormatOptions) {
  // Force Latin numerals and Gregorian calendar
  const normalizedLocale = `${locale}-u-nu-latn-ca-gregory`
  return new Intl.NumberFormat(normalizedLocale, options)
}

export function formatCurrency(amount: number, locale: string, currency: string): string {
  return createNumberFormatter(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount)
}
```

#### **4. Error Code Contract Validation**
```typescript
// packages/i18n-core/src/error-schema.ts
import { z } from 'zod'

export const ErrorResponseSchema = z.object({
  code: z.enum([
    'AUTH_FAILED',
    'INSUFFICIENT_BALANCE',
    'AI_LIMIT_REACHED',
    'BUILD_TIMEOUT',
    'RATE_LIMITED',
    // ... all error codes
  ]),
  params: z.record(z.any()).optional(),
  message: z.string().optional() // Deprecated, for compatibility only
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// Generate documentation
export function generateErrorDocs(): string {
  return `
| Code | Expected Params | Description |
|------|-----------------|-------------|
| INSUFFICIENT_BALANCE | requiredBalance, currentBalance, recommendation | User lacks credits |
| AI_LIMIT_REACHED | resetMinutes | AI capacity reached |
...
  `
}
```

#### **5. Namespace-Split Compilation for Worker**
```json
// worker/package.json
{
  "scripts": {
    "i18n:compile": "node scripts/compile-namespaces.js",
    "build": "npm run i18n:compile && tsc"
  }
}
```

```javascript
// worker/scripts/compile-namespaces.js
const { compile } = require('@formatjs/cli')
const fs = require('fs')
const path = require('path')

const locales = ['en', 'ar', 'fr', 'es', 'de']
const namespaces = ['errors', 'emails', 'admin']

locales.forEach(locale => {
  namespaces.forEach(namespace => {
    const src = `messages/${locale}/${namespace}.json`
    const dest = `compiled/${locale}/${namespace}.json`
    
    if (fs.existsSync(src)) {
      compile([src], {
        ast: true,
        out: dest
      })
    }
  })
})
```

#### **6. ESLint Rule Refinements**
```json
{
  "rules": {
    "no-hardcoded-strings": ["error", {
      "ignore": [
        "aria-label",
        "aria-describedby",
        "data-testid",
        "className",
        "style"
      ],
      "ignoreFiles": [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.stories.tsx",
        "**/scripts/**"
      ]
    }]
  }
}
```

#### **7. Frozen Messages in Production**
```typescript
async function loadMessages(locale: string): Promise<any> {
  const merged = await loadAndMergeMessages(locale)
  
  // Prevent accidental runtime mutations in production
  return process.env.NODE_ENV === 'production' 
    ? Object.freeze(merged) 
    : merged
}
```

### **Implementation Considerations (Evaluate Carefully)**

#### **1. Pseudo-Locale Testing**
- **Consideration**: Adds complexity to CI/CD pipeline
- **Alternative**: Manual testing with Arabic locale covers most layout issues
- **Decision**: Implement only if layout bugs become frequent

#### **2. Observability Metrics**
- **Consideration**: Requires metrics infrastructure (Prometheus/Grafana)
- **Current State**: Using console.warn for missing translations might be sufficient
- **Decision**: Start simple, add metrics if translation gaps persist

#### **3. Email Internationalization**
- **Consideration**: Email client compatibility is complex
- **Current State**: Worker email sending scope unclear
- **Decision**: Defer until Worker email requirements are defined

### **Rejected/Deferred Suggestions**

#### **1. Compile-Folder Approach**
- **Why Deferred**: Our current 580-line files are manageable
- **When to Revisit**: If message files exceed 2000 lines

#### **2. 15-minute TTL Cache**
- **Why Rejected**: Worker is stateless, restarts frequently
- **Better Approach**: Load all translations at startup for Worker

#### **3. Hashed Key Cardinality**
- **Why Rejected**: Over-optimization for current scale
- **Better Approach**: Simple key-based logging is sufficient

## Expert Feedback Summary (Both Rounds)

### **Round 1 - What We Implemented**
1. ✅ Thin shared i18n-core package
2. ✅ Precompiled ICU messages for Worker
3. ✅ Strict locale negotiation order
4. ✅ Arabic numerals policy
5. ✅ Worker response versioning window
6. ✅ Database partial indexes
7. ✅ Region overlays architecture
8. ✅ Missing key overlay dev flag
9. ✅ ESLint raw string rules

### **Round 2 - What We're Adding**
1. ✅ Single source locale resolution with BCP-47 canonicalization
2. ✅ BiDi isolation helpers for RTL
3. ✅ Locked number/currency formatting policy
4. ✅ Zod schema for error code validation
5. ✅ Namespace-split compilation for Worker
6. ✅ ESLint rule carve-outs
7. ✅ Frozen messages in production
8. ⚠️ Pseudo-locale (evaluate need)
9. ⚠️ Observability metrics (start simple)
10. ⏸️ Email internationalization (defer)
6. **Database Optimization**: Partial indexes for error analytics without full table scans
7. **Regional Architecture**: Base locale + regional overrides (ar/ + ar-eg/) to reduce duplication
8. **Conservative Bundling**: Test Next.js 15 defaults before custom webpack optimization

### **Expert Recommendations Validated**

- ✅ **Thin shared package approach** prevents over-engineering while ensuring consistency
- ✅ **Precompiled ICU** addresses Worker performance concerns proactively  
- ✅ **Strict locale negotiation** eliminates edge cases in locale detection
- ✅ **Response versioning** prevents breaking changes during gradual migration
- ✅ **Error analytics indexes** enable monitoring without performance impact
- ✅ **Development tooling** catches i18n violations early in development cycle

### **Items Under Evaluation**

- 🔍 **Bundle splitting customization**: Start with Next.js defaults, customize only if needed
- 🔍 **CI rule scope**: Begin conservative (errors only) vs comprehensive (all namespaces)
- 🔍 **Email service ownership**: Centralized vs distributed based on architecture needs

## Implementation Checklist

### **Week 1: Foundation (Must Complete)**
- [ ] Create thin `packages/i18n-core` with:
  - [ ] ERROR_CODES constant
  - [ ] canonicalize() and resolveLocale() functions
  - [ ] isRTL() and getLocaleDirection() utilities
  - [ ] BiDi isolation helpers
  - [ ] Zod error schema
- [ ] Update `src/i18n/request.ts` to support both monolithic and split files
- [ ] Create `scripts/split-translations.js` for gradual migration
- [ ] Set up ESLint rule for no hardcoded strings (with carve-outs)

### **Week 2: Next.js Implementation**
- [ ] Migrate 3 key pages to Server Components with `getTranslations()`
- [ ] Implement selective client message passing with `pick()`
- [ ] Add ICU formatting to error messages
- [ ] Set up missing translation detection in development
- [ ] Create number/currency formatters with Latin numerals

### **Week 3: Worker Integration (Multi-Server Architecture)**
- [ ] Worker team: Install `@formatjs/cli`, `intl-messageformat`, `fastify-plugin`
- [ ] Worker team: Implement Fastify i18n plugin with request decoration
- [ ] Worker team: Add locale to BullMQ job data (critical for queue propagation)
- [ ] Worker team: Convert all events to codes-only pattern (no localized text in streams)
- [ ] Worker team: Implement error code responses with 2-week `message` compatibility
- [ ] Worker team: Bundle precompiled catalogs in Docker image
- [ ] Worker team: Map CLI output to high-level event codes
- [ ] Worker team: Ensure English-only system logs

### **Week 4: Testing & Optimization**
- [ ] Add Playwright tests for Arabic RTL layout
- [ ] Implement frozen messages in production
- [ ] Add partial database index for error analytics
- [ ] Test bundle sizes with split namespaces
- [ ] Document error codes and parameters

### **Week 5: Gap Filling**
- [ ] Complete ICU formatting for all plurals/selects
- [ ] Fill missing translations identified by dev flag
- [ ] Refine regional variants (ar-eg, ar-sa, fr-ma)
- [ ] Add fallback telemetry (simple logging)
- [ ] Remove deprecated `message` field from Worker

### **Decision Points (Checkboxes)**
- [x] Use BCP-47 canonicalization for locale keys
- [x] Implement BiDi isolation for RTL parameters
- [x] Lock Latin numerals across all locales
- [x] Create Zod schema for error validation
- [ ] Implement pseudo-locale testing (defer until bugs appear)
- [ ] Add full observability metrics (start with logging)
- [ ] Email internationalization (defer until requirements clear)

## Worker Architecture Key Decisions

Based on the Worker's multi-server, queue-based, streaming architecture:

### **Must Have (Architecture-Driven)**
1. **Locale propagation via job data** - Critical for BullMQ async processing
2. **Codes-only in streams/events** - Multiple locales watch same build
3. **Bundled catalogs in Docker** - Stateless multi-server deployment
4. **Fastify plugin pattern** - Clean request decoration and locale resolution
5. **Whitelist validation** - Security against dynamic locale imports

### **Nice to Have (Can Add Later)**
1. **LRU cache for catalogs** - Small optimization, not critical
2. **Health check verification** - Trust bundled files initially
3. **Metrics cardinality limits** - Add when scale demands

### **Don't Need (Over-Engineering)**
1. **Runtime catalog fetching** - Bundled is simpler and faster
2. **Complex caching strategies** - Worker restarts make this pointless
3. **DB-computed error messages** - Frontend localization is cleaner

## Final Recommendations

### **Do First (High Impact, Low Effort)**
1. Create minimal i18n-core package (prevents drift)
2. Split existing translation files by namespace
3. Convert key components to Server Components
4. Implement error codes in Worker responses
5. Add Fastify i18n plugin for Worker

### **Do Later (Nice to Have)**
1. Pseudo-locale testing
2. Advanced observability metrics
3. Email template internationalization
4. Custom webpack optimizations

### **Don't Do (Over-Engineering)**
1. Complex caching strategies (Worker restarts frequently)
2. Hashed key cardinality limits (premature optimization)
3. Full compile-folder approach (files aren't that large yet)
4. Custom translation management system (use existing tools)

This plan provides a pragmatic path from your current state (complete translations, monolithic files) to a performant, maintainable internationalization architecture that serves both Next.js and Worker effectively while incorporating all valuable expert feedback.