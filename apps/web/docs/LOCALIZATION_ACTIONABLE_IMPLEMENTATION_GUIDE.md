# SheenApps Localization - Actionable Implementation Guide

## 🎯 Executive Overview

We have **9 complete translation files** (580-627 lines each) in `/src/messages/` but they're monolithic and lack proper ICU formatting. The Worker has **zero localization**. This guide provides clear, actionable steps to implement proper internationalization across both Next.js and Worker.

**Key Stats:**
- ✅ 9 locales ready: `en`, `ar`, `ar-eg`, `ar-sa`, `ar-ae`, `fr`, `fr-ma`, `es`, `de`
- ✅ RTL support and Arabic fonts configured
- ✅ **COMPLETED**: Monolithic files split into 18 namespaces per locale
- ✅ **COMPLETED**: All pages migrated to namespace-based loading
- ✅ **COMPLETED**: Monolithic files deleted (performance gain ~80%)
- ❌ No Worker localization
- ❌ API errors return English strings (need error codes)
- ⏳ Type generation script pending
- ⏳ ICU pluralization pending

## 🚀 Implementation Progress - August 8, 2025

### ✅ LATEST: Worker I18n Integration Complete!

**All Worker i18n integration tasks completed successfully:**
- ✅ x-sheen-locale header sending from frontend
- ✅ Locale cookie persistence for fallback  
- ✅ Structured error handling with all error codes
- ✅ **23 build event codes** with translations in all 9 locales
- ✅ formatBuildEvent helper integrated into all components
- ✅ Comprehensive test suite (15/15 tests passing)
- ✅ Dual format support for 2-week migration period

See `docs/WORKER_I18N_INTEGRATION_COMPLETE.md` for full implementation details.

### ✅ CRITICAL UPDATE: Monolithic Files Deleted - Migration Complete!

**Major Achievement**: Successfully migrated all pages from monolithic to namespace-based loading:
- **All pages migrated** to use `getNamespacedMessages` with selective namespace loading
- **Monolithic files deleted**: 9 files removed, saving ~200KB
- **Performance improvement**: ~80% reduction in translation payload per page
- **Error translations fixed**: All 7 non-English locales now have proper translations (were English before)

### ✅ Completed Tasks (Week 1) - ALL FOUNDATION TASKS COMPLETE ✅

1. **Created shared i18n-core package** (`packages/i18n-core/`)
   - ✅ Error codes defined (`ERROR_CODES`)
   - ✅ Locale utilities with Accept-Language q-weight parsing
   - ✅ BiDi utilities for RTL text isolation
   - ✅ Formatters for numbers, currency, dates (Latin numerals enforced)
   - ✅ Error schema with Zod validation
   - ✅ Progress codes for build events
   - ✅ TypeScript configuration

2. **Split monolithic translation files**
   - ✅ Created namespace structure: 18 namespaces per locale
   - ✅ All 9 locales split successfully
   - ✅ Namespaces: common, navigation, hero, techTeam, workflow, pricing, features, builder, auth, workspace, userMenu, errors, success, footer, dashboard, projects, toasts, buildErrors

3. **Updated Next.js i18n Configuration**
   - ✅ `src/i18n/request.ts` now loads namespace files with fallback to monolithic
   - ✅ Deep merge support for regional variants (ar-eg extends ar)
   - ✅ Development error handling with missing translation indicators
   - ✅ Message fallback configuration for development

4. **Added ESLint Configuration**
   - ✅ Added i18n guidance to `eslint.config.mjs`
   - ✅ Documented allowed hardcoded strings (aria-labels, data-testid, etc.)
   - ✅ Configured ignore patterns for test files and scripts

5. **Created Client Hooks**
   - ✅ `use-error-handler.ts` - Handles Worker error codes with proper translations
   - ✅ `use-formatters.ts` - Number, currency, date, and relative time formatting

6. **Added Pseudo-locale for Testing**
   - ✅ Generated `en-XA` locale with accented characters
   - ✅ Added brackets to test text expansion `[text]`
   - ✅ Configured routing to support pseudo-locale in development
   - ✅ Added locale configuration with 🎭 flag

### 📝 Next Steps (Week 2)

1. **Convert key pages to server components** with selective client messages
2. **Test the namespace loading** with a sample page
3. **Verify pseudo-locale** works in development
4. **Create documentation** for adding new translations

## 📬 Worker Team Coordination

### Important Discovery: Translation Files Already Split

The translation files have been successfully split into namespaces. Each locale now has 18 separate JSON files organized by namespace. This means:

1. **Namespace Structure Established**: All translations are now organized into logical namespaces
2. **Ready for Selective Loading**: Next.js can now load only required namespaces per page
3. **Worker Integration Simplified**: Worker can import only the namespaces it needs (errors, events)

### Worker Team Action Items (FINAL UPDATE - August 8, 2025)

#### ✅ What Worker Team Should Do

1. **Keep your existing error codes** - Your `errorCodes.ts` is more comprehensive (38 codes vs 11)
   - Continue using: `import { ERROR_CODES, validateErrorParams, INCLUDE_ERROR_MESSAGE } from '../types/errorCodes'`
   - Your Zod validation and kill switch logic are perfect as-is
   - Build/rollback event codes are Worker-specific and should stay that way

2. **Send base locale headers**: Include `x-sheen-locale: ar` (not `ar-eg`) in Worker requests

3. **Optional: Use shared utilities if needed**:
   ```typescript
   // Only if you need locale conversion
   import { toBaseLocale, validateLocale } from '@sheenapps/i18n-core'
   
   // Only if you need RTL text handling
   import { isolateBidiText } from '@sheenapps/i18n-core'
   ```

#### ❌ What Worker Team Should NOT Do

1. **Don't migrate error codes** - Your implementation is more complete
2. **Don't import ERROR_CODES from shared package** - Keep your own
3. **Don't change your validation logic** - Zod schemas are Worker-specific

#### 📦 Shared Package Access (Optional)

If you need locale utilities:
- Run `./scripts/export-i18n-core.sh` to generate package
- Package will be in `dist-exports/i18n-core-latest.tar.gz`
- See `docs/WORKER_SHARED_PACKAGE_COMPATIBILITY.md` for details

**Key Insight**: Error codes are domain-specific. Worker maintains build/deployment codes, Frontend maintains UI codes.

## 🔧 Critical Fixes Applied - August 8, 2025 (Post-Expert Reviews)

### Round 2: Critical Issues Fixed Based on Deep Analysis

After expert's detailed review, we fixed several **critical issues** that would have broken the Worker integration:

**Critical Fixes Applied:**
1. ✅ **Namespace Alignment** - Merged `buildErrors.json` into `errors.json` (Worker expects `errors`)
2. ✅ **Error Code Consistency** - Fixed `INTERNAL` → `INTERNAL_ERROR` across all files
3. ✅ **Arabic Translations** - Fixed Arabic error messages that were still in English
4. ✅ **Name Collision** - Renamed `getMessages` → `getAllMessagesForLocale` to avoid next-intl conflict
5. ✅ **Selective Loading** - Added `getNamespacedMessages(locale, namespaces)` for performance

**What We Intentionally Didn't Implement (and Why):**
1. ❌ **Custom ESLint Rule** - The guidance comments are sufficient for now. A full rule is overengineering at this stage.
2. ❌ **Full ICU Pluralization** - Will add incrementally as needed. Basic translations work first.
3. ❌ **Bundle Analysis** - Important but not critical for initial implementation.
4. ❌ **Events Namespace** - We're using `errors` for all error codes, not splitting into events/errors.

**Expert Feedback We Validated as Already Correct:**
- ✅ Regional fallback order (base → regional) was already correct
- ✅ Pseudo-locale guards with NODE_ENV were already in place
- ✅ Latin numerals enforcement was already implemented

## 🔧 Critical Fix Applied - August 8, 2025 (Post-Expert Review Round 1)

### Fixed i18n-core Package Configuration

Based on expert feedback, we fixed critical issues with the i18n-core package:

**Problems Fixed:**
1. ❌ Was pointing to source TypeScript files (breaking imports)
2. ❌ Had React dependency it didn't need
3. ❌ Missing proper build configuration
4. ❌ No private flag (could accidentally publish)

**Solutions Applied:**
1. ✅ Now points to built JavaScript files in `dist/`
2. ✅ Removed React dependency (replaced with HTML helper)
3. ✅ Proper ESM module configuration with exports
4. ✅ Added `private: true` to prevent npm publish
5. ✅ Added `sideEffects: false` for tree-shaking
6. ✅ Files whitelist to keep package small
7. ✅ Built and tested successfully

**Impact:**
- The package is now properly consumable by both Next.js and Worker
- TypeScript types resolve correctly
- No unnecessary dependencies
- Ready for production use

## 🎉 Implementation Summary

### What Was Accomplished Today

We successfully completed **ALL Week 1 foundation tasks** for the localization implementation:

1. **Shared i18n Package Created** - A complete TypeScript package with error codes, locale utilities, BiDi support, and formatters
2. **Translation Files Split** - 162 namespace files created (9 locales × 18 namespaces)
3. **Next.js Configuration Updated** - Dynamic namespace loading with regional variant support
4. **Developer Tools Added** - ESLint guidance, error handling hooks, formatter hooks
5. **Testing Infrastructure** - Pseudo-locale (en-XA) for layout validation in development

### Key Technical Achievements

- **Smart Namespace Loading**: The system now loads split namespace files with automatic fallback to monolithic files
- **Regional Variant Support**: ar-eg automatically extends ar with deep merging
- **Accept-Language Parsing**: Full q-weight support for proper locale negotiation
- **BiDi Text Isolation**: Proper handling of numbers, URLs, and IDs in RTL contexts
- **Latin Numerals Enforced**: All locales use Western digits (123) not Arabic (١٢٣)
- **Development Helpers**: Missing translations show as `⚠️ namespace.key` in development

### Files Created/Modified

**New Files:**
- `/packages/i18n-core/src/*.ts` - Complete i18n core package
- `/src/messages/[locale]/*.json` - 162 split namespace files
- `/src/hooks/use-error-handler.ts` - Error handling with translations
- `/src/hooks/use-formatters.ts` - Number/currency/date formatting
- `/scripts/split-translations.js` - Translation splitting script
- `/scripts/generate-pseudo-locale.js` - Pseudo-locale generator

**Modified Files:**
- `/src/i18n/request.ts` - Namespace loading with fallback
- `/src/i18n/config.ts` - Added pseudo-locale support
- `/eslint.config.mjs` - i18n guidance for developers
- `/tsconfig.json` - Path mapping for @sheenapps/i18n-core
- `/src/lib/currency.ts` - Added pseudo-locale mapping

### Ready for Next Phase

The foundation is now solid for:
1. Converting pages to server components with selective client translations
2. Worker team to implement their i18n layer
3. Testing with the pseudo-locale to identify layout issues
4. Gradual migration of hardcoded strings to translation keys

## Expert Feedback Integration - Round 4

### ✅ **High-Value Improvements to Implement**

1. **Accept-Language Parser Enhancement** - Add q-weight parsing for proper locale negotiation
2. **Base Locales Only in Worker** - Ship only `en`, `ar`, `fr`, `es`, `de` (not regional variants) 
3. **CLI-Based Compilation** - Use `formatjs compile-folder` directly instead of programmatic calls
4. **Environment-Based Legacy Cutoff** - Use `LEGACY_ERROR_UNTIL` env var with logging
5. **Dynamic Timezone Resolution** - Store user timezone in profile, fallback to browser/geo
6. **Consistent Error Namespace** - Standardize on `errors.*` everywhere
7. **BiDi Enhancement** - Wrap IDs/URLs in `<bdi>` tags, not just numbers
8. **Missing Key Metrics** - Emit telemetry for fallbacks and missing translations
9. **Security Namespace Validation** - Reject unknown namespaces to prevent path attacks
10. **Pseudo-locale for Testing** - Ship `en-XA` in development for layout validation

### ⚠️ **Implementation Considerations**

1. **LRU Cache for Server Components** - May add complexity, evaluate performance need first
2. **Profile Locale Priority** - Requires user auth integration
3. **Progress Code Standardization** - May need coordination with existing CLI output
4. **Dashboard Metrics** - Requires metrics infrastructure setup

### ❌ **Over-Engineering Concerns**

1. **Complex Metrics Setup** - Start simple with logging before full Grafana setup
2. **Extensive E2E Testing** - Focus on RTL visual tests initially
3. **Advanced ESLint Pragmas** - Standard ignore patterns sufficient for now

---

## 📋 Week 1: Foundation Setup

### Day 1-2: Create Shared i18n-core Package

**Location:** `packages/i18n-core/`

```bash
# Create package structure
mkdir -p packages/i18n-core/src
cd packages/i18n-core
npm init -y
npm install zod
```

**File 1: `packages/i18n-core/src/error-codes.ts`**
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

export type ErrorCode = keyof typeof ERROR_CODES
```

**File 2: `packages/i18n-core/src/locale-utils.ts`**
```typescript
// Production locales + development pseudo-locale for testing
export const SUPPORTED_LOCALES = [
  'en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de',
  ...(process.env.NODE_ENV === 'development' ? ['en-XA'] : []) // Pseudo-locale for dev
] as const
export const DEFAULT_LOCALE = 'en'

// BCP-47 canonicalization
export function canonicalize(locale: string): string {
  try { 
    return Intl.getCanonicalLocales(locale)[0] ?? 'en'
  } catch { 
    return 'en'
  }
}

// Strict locale resolution with fallback chain
export function resolveLocale(
  urlLocale?: string,
  cookieLocale?: string,
  acceptLanguage?: string
): string {
  // Priority: URL → cookie → Accept-Language → default
  const candidate = urlLocale || cookieLocale || parseAcceptLanguage(acceptLanguage) || DEFAULT_LOCALE
  const canonical = canonicalize(candidate)
  
  if (SUPPORTED_LOCALES.includes(canonical as any)) {
    return canonical
  }
  
  // Try base locale (ar-eg → ar)
  const base = canonical.split('-')[0]
  if (SUPPORTED_LOCALES.includes(base as any)) {
    return base
  }
  
  return DEFAULT_LOCALE
}

export function isRTL(locale: string): boolean {
  return locale.startsWith('ar')
}

export function getLocaleDirection(locale: string): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr'
}

function parseAcceptLanguage(header?: string): string | undefined {
  if (!header) return undefined
  
  // Parse Accept-Language with q-weights: fr-CA;q=0.9, fr;q=0.8, en;q=0.7
  const languages = header
    .split(',')
    .map(lang => {
      const [locale, qValue] = lang.trim().split(';q=')
      return {
        locale: locale.trim(),
        quality: qValue ? parseFloat(qValue) : 1.0
      }
    })
    .sort((a, b) => b.quality - a.quality) // Highest quality first
  
  // Return first supported locale
  for (const { locale } of languages) {
    const normalized = locale.toLowerCase()
    if (SUPPORTED_LOCALES.includes(normalized as any)) {
      return normalized
    }
    // Try base locale (en-US -> en)
    const base = normalized.split('-')[0]
    if (SUPPORTED_LOCALES.includes(base as any)) {
      return base
    }
  }
  
  return undefined
}
```

**File 3: `packages/i18n-core/src/bidi-utils.ts`**
```typescript
// BiDi isolation for RTL mixed content
export function bidiIsolate(text: string, isRTL: boolean): string {
  if (!isRTL) return text
  // Wrap with Unicode FSI...PDI for proper isolation
  return `\u2068${text}\u2069`
}

export function formatRTLParams(params: Record<string, any>, locale: string): Record<string, any> {
  if (!isRTL(locale)) return params
  
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      // Isolate numbers, IDs, currency codes, URLs in RTL text
      if (
        typeof value === 'number' || 
        /^[A-Z0-9_-]+$/i.test(value) ||     // IDs like "build-123"
        /^https?:\/\//.test(value) ||        // URLs
        /^[a-f0-9-]{36}$/i.test(value)       // UUIDs
      ) {
        return [key, bidiIsolate(String(value), true)]
      }
      return [key, value]
    })
  )
}

// React component helper for BiDi isolation
export function BdiWrap({ children, locale }: { children: React.ReactNode, locale: string }) {
  if (!isRTL(locale)) return <>{children}</>
  return <bdi>{children}</bdi>
}
```

**File 4: `packages/i18n-core/src/formatters.ts`**
```typescript
// Force Latin numerals across all locales (including Arabic)
export function createNumberFormatter(locale: string, options?: Intl.NumberFormatOptions) {
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

export function formatDate(date: Date, locale: string, options?: Intl.DateTimeFormatOptions) {
  const normalizedLocale = `${locale}-u-ca-gregory`
  return new Intl.DateTimeFormat(normalizedLocale, options).format(date)
}
```

**File 5: `packages/i18n-core/src/error-schema.ts`**
```typescript
import { z } from 'zod'
import { ERROR_CODES } from './error-codes'

export const ErrorResponseSchema = z.object({
  code: z.enum(Object.keys(ERROR_CODES) as [string, ...string[]]),
  params: z.record(z.any()).optional(),
  message: z.string().optional() // Deprecated, for 2-week compatibility only
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// Documentation generator
export function generateErrorDocs(): string {
  return `
| Code | Expected Params | Description |
|------|-----------------|-------------|
| INSUFFICIENT_BALANCE | requiredBalance, currentBalance, recommendation | User lacks credits |
| AI_LIMIT_REACHED | resetMinutes | AI capacity reached |
| BUILD_TIMEOUT | duration, suggestion | Build exceeded time limit |
| RATE_LIMITED | waitTime | Too many requests |
`
}
```

**File 6: `packages/i18n-core/src/index.ts`**
```typescript
// Main exports - keep it thin
export * from './error-codes'
export * from './locale-utils'
export * from './bidi-utils'
export * from './formatters'
export * from './error-schema'
```

### Day 3: Split Translation Files

**Script: `scripts/split-translations.js`**
```javascript
const fs = require('fs')
const path = require('path')

const locales = ['en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de']

locales.forEach(locale => {
  const monolithicFile = path.join(__dirname, `../src/messages/${locale}.json`)
  
  if (!fs.existsSync(monolithicFile)) {
    console.log(`⚠️  Skipping ${locale} - file not found`)
    return
  }
  
  const messages = JSON.parse(fs.readFileSync(monolithicFile, 'utf8'))
  const outputDir = path.join(__dirname, `../src/messages/${locale}`)
  
  // Create locale directory
  fs.mkdirSync(outputDir, { recursive: true })
  
  // Split by top-level keys
  Object.keys(messages).forEach(namespace => {
    const namespacePath = path.join(outputDir, `${namespace}.json`)
    fs.writeFileSync(
      namespacePath, 
      JSON.stringify(messages[namespace], null, 2)
    )
    console.log(`✅ Created ${locale}/${namespace}.json`)
  })
})

console.log('\n✅ Translation splitting complete!')
```

### Day 4: Update Next.js Configuration

**File: `src/i18n/request.ts`**
```typescript
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'
import deepmerge from 'deepmerge'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  const messages = await loadMessages(locale)
  
  return {
    locale,
    messages,
    timeZone: getTimeZone(locale),
    now: new Date(),
    // Development: Show missing translations
    onError: process.env.NODE_ENV === 'development' 
      ? (error) => console.error('❌ Missing translation:', error)
      : undefined,
    getMessageFallback: ({ namespace, key }) => 
      process.env.NODE_ENV === 'development' ? `⚠️ ${namespace}.${key}` : key
  }
})

async function loadMessages(locale: string): Promise<any> {
  try {
    // Try loading split namespace files first
    const namespaces = ['common', 'navigation', 'auth', 'builder', 'dashboard', 'billing', 'errors', 'hero']
    const messages: any = {}
    
    for (const ns of namespaces) {
      try {
        const nsMessages = (await import(`../messages/${locale}/${ns}.json`)).default
        messages[ns] = nsMessages
      } catch {
        // Namespace file doesn't exist, try monolithic file
      }
    }
    
    // Fallback to monolithic file if no namespaces found
    if (Object.keys(messages).length === 0) {
      return (await import(`../messages/${locale}.json`)).default
    }
    
    // Handle regional variants (ar-eg extends ar)
    if (locale.includes('-')) {
      const baseLocale = locale.split('-')[0]
      try {
        const baseMessages = await loadMessages(baseLocale)
        return deepmerge(baseMessages, messages)
      } catch {}
    }
    
    return messages
  } catch (error) {
    console.error(`Failed to load messages for ${locale}:`, error)
    // Fallback to English
    return (await import('../messages/en.json')).default
  }
}

async function getTimeZone(locale: string, userId?: string): Promise<string> {
  // Priority 1: User profile preference (if available)
  if (userId) {
    try {
      const supabase = createServerSupabaseClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .single()
      
      if (profile?.timezone) {
        return profile.timezone
      }
    } catch {
      // Fallback to locale-based detection
    }
  }

  // Priority 2: Browser detection via request headers (if available)
  // This would be handled in middleware or page-level code:
  // const browserTz = headers().get('x-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone

  // Priority 3: Locale-based fallback (previous hardcoded approach)
  const localeTimeZones: Record<string, string> = {
    'en': 'America/New_York',
    'ar-eg': 'Africa/Cairo',
    'ar-sa': 'Asia/Riyadh',
    'ar-ae': 'Asia/Dubai',
    'ar': 'Asia/Dubai',
    'fr-ma': 'Africa/Casablanca',
    'fr': 'Europe/Paris',
    'es': 'Europe/Madrid',
    'de': 'Europe/Berlin',
  }
  
  return localeTimeZones[locale] || 'UTC'
}
```

### Day 5: ESLint Rule Setup

**File: `.eslintrc.json` (add to rules)**
```json
{
  "rules": {
    "no-hardcoded-strings": ["warn", {
      "ignore": [
        "aria-label",
        "aria-describedby", 
        "data-testid",
        "className",
        "style",
        "href",
        "src",
        "alt"
      ],
      "ignoreFiles": [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.stories.tsx",
        "**/scripts/**",
        "**/*.config.ts"
      ]
    }]
  }
}
```

---

## 📋 Week 2: Next.js Implementation

> **🎉 UPDATE**: The structured error handling system has been **FULLY IMPLEMENTED** since this plan was created. Error codes, translations for all 9 locales, and error display components are already working in production. The sections below focus on remaining i18n work.

### Day 1: Convert Key Pages to Server Components

**Example 1: Dashboard Page**
```typescript
// app/[locale]/dashboard/page.tsx
import { getTranslations } from 'next-intl/server'
import { unstable_setRequestLocale } from 'next-intl/server'

export default async function DashboardPage({ 
  params: { locale } 
}: { 
  params: { locale: string } 
}) {
  // Enable static rendering
  unstable_setRequestLocale(locale)
  
  // Load only dashboard namespace
  const t = await getTranslations('dashboard')
  
  return (
    <div className="dashboard">
      <h1>{t('title')}</h1>
      <p>{t('welcome')}</p>
      {/* Zero client bundle impact! */}
    </div>
  )
}
```

**Example 2: Selective Client Messages**
```typescript
// app/[locale]/builder/layout.tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import pick from 'lodash/pick'

export default async function BuilderLayout({ 
  children,
  params: { locale } 
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const messages = await getMessages()
  
  // Only pass required namespaces to client
  const clientMessages = pick(messages, [
    'builder',
    'errors',
    'common.actions'
  ])
  
  return (
    <NextIntlClientProvider messages={clientMessages}>
      {children}
    </NextIntlClientProvider>
  )
}
```

### Day 2: ✅ Error Messages Already Implemented

> **✅ COMPLETED**: Error message localization is already fully implemented with structured error handling system.

**What's Already Working:**
- ✅ All error codes implemented (`AI_LIMIT_REACHED`, `RATE_LIMITED`, `NETWORK_TIMEOUT`, etc.)
- ✅ ICU formatting with parameter interpolation working
- ✅ All 9 locales supported with professional translations
- ✅ Error display components integrated in build progress UI
- ✅ Smart retry logic with countdown timers
- ✅ RTL support for Arabic locales

**Files Already Implemented:**
- `/src/services/error-translation.ts` - Complete error translation service
- `/src/services/structured-error-handling.ts` - Error processing service  
- `/src/hooks/use-smart-retry.ts` - Smart retry logic with countdown
- All locale JSON files have `buildErrors` section populated

### Day 3: Focus on Non-Error Message i18n
  
  const formatError = (error: any): string => {
    // Handle error codes from Worker
    if (error?.code && error.code in ERROR_CODES) {
      return t(error.code, error.params || {})
    }
    
    // Legacy error handling
    if (error?.message) {
      return error.message
    }
    
    // Fallback
    return t('INTERNAL_ERROR')
  }
  
  const handleError = (error: any) => {
    const message = formatError(error)
    
    // Special handling for balance errors
    if (error?.code === 'INSUFFICIENT_BALANCE') {
      return {
        message,
        action: () => navigateToBilling(),
        actionLabel: t('PURCHASE_CREDITS')
      }
    }
    
    return { message }
  }
  
  return { formatError, handleError }
}
```

### Day 4: Update Build Progress Component

**File: `src/components/builder/clean-build-progress.tsx`**
```typescript
import { useErrorHandler } from '@/hooks/use-error-handler'

function BuildErrorDisplay({ error }: { error: any }) {
  const { handleError } = useErrorHandler()
  const errorInfo = handleError(error)
  
  return (
    <div className="error-card">
      <p>{errorInfo.message}</p>
      {errorInfo.action && (
        <button onClick={errorInfo.action}>
          {errorInfo.actionLabel}
        </button>
      )}
    </div>
  )
}
```

### Day 5: Create Number/Currency Formatters

**File: `src/utils/formatters.ts`**
```typescript
import { createNumberFormatter, formatCurrency as formatCurrencyCore } from '@sheenapps/i18n-core'
import { useLocale } from 'next-intl'

export function useFormatters() {
  const locale = useLocale()
  
  const formatNumber = (value: number) => {
    return createNumberFormatter(locale).format(value)
  }
  
  const formatCurrency = (amount: number, currency = 'USD') => {
    return formatCurrencyCore(amount, locale, currency)
  }
  
  const formatPercentage = (value: number) => {
    return createNumberFormatter(locale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(value)
  }
  
  return { formatNumber, formatCurrency, formatPercentage }
}
```

---

## 🚀 Worker Team Implementation Guide

> **✅ COMPLETED - August 8, 2025**: Frontend fully integrated with Worker's structured format. All 23 build event codes and error codes implemented with translations in 9 locales.

> **🎉 MAJOR UPDATE**: The Worker team has **already implemented structured error handling** with error codes and English error messages. This significantly reduces the i18n implementation scope for the Worker.

### ✅ What Worker Team Has Already Implemented

**Structured Error Response System:**
- ✅ Error codes: `AI_LIMIT_REACHED`, `RATE_LIMITED`, `NETWORK_TIMEOUT`, `BUILD_TIMEOUT`, etc.
- ✅ Structured error objects with `code`, `message`, and `params`
- ✅ Parameter interpolation for dynamic values (resetTime, retryAfter, etc.)
- ✅ Database schema with structured error storage
- ✅ Frontend integration completed with full i18n translation system

**Current Worker Error Response Example:**
```json
{
  "error": {
    "code": "AI_LIMIT_REACHED",
    "message": "Our AI service is at capacity. Please try again in 5 minutes.",
    "params": {
      "resetTime": 1725123456789,
      "provider": "anthropic",
      "retryAfter": 300
    }
  }
}
```

### 🔄 Remaining Worker I18n Implementation (Significantly Reduced Scope)

The Worker's i18n implementation is now **much simpler** since structured error handling is complete. Focus areas:

### Critical Architecture Requirements

Your Worker has these unique characteristics that affect i18n:
1. **Multi-server deployment** - Can't rely on runtime state  
2. **Queue-based processing** - Locale must travel with jobs
3. **Streaming/SSE** - Multiple clients watch same build
4. **Error codes already implemented** - Just need non-error message i18n

## 📬 Worker Team Response & Strategic Deviations

> **✅ WORKER TEAM APPROVED**: The worker team has reviewed this plan and confirmed they're well-positioned for i18n implementation with their existing mature architecture.

### ✅ **Worker Team's Strategic Enhancements**

The Worker team is **improving upon our plan** with these smart strategic decisions:

#### 1. **Gradual Migration Strategy** (Smart Risk Management)
- **NextJS Plan**: Immediate full replacement of error system
- **Worker Approach**: Extend existing ErrorMessageRenderer with i18n fallback
- **✅ Benefit**: Zero risk of breaking existing functionality during rollout

#### 2. **Enhanced Fastify Integration** (Better Developer Experience) 
- **NextJS Plan**: Basic i18n plugin pattern
- **Worker Approach**: Full request decoration with error formatting helpers
- **✅ Benefit**: Simpler route-level usage, better DX for Worker developers

#### 3. **Multi-Level Security Hardening** (Production Ready)
- **NextJS Plan**: Basic namespace validation
- **Worker Approach**: Multi-layer validation (whitelist + canonicalization + fallback)
- **✅ Benefit**: Robust protection against path traversal attacks

#### 4. **Existing System Integration** (Compatibility First)
- **NextJS Plan**: Build entirely new message system
- **Worker Approach**: Extend existing systems as ultimate fallback
- **✅ Benefit**: Maintains compatibility with current error handling architecture

### 🔄 **Strategic Modifications from Original Plan**

#### **Message Storage & Fallback Strategy**
```typescript
// Worker's Enhanced Approach
class MessageRenderer {
  formatMessage(code: string, params: any, locale: string) {
    // 1. Try i18n compiled messages (new)
    const i18nMessage = this.getI18nMessage(code, locale)
    if (i18nMessage) return this.interpolate(i18nMessage, params)
    
    // 2. Fallback to existing ErrorMessageRenderer (safety net)
    return this.existingErrorRenderer.format(code, params)
  }
}
```
**✅ Benefit**: Reduces risk during initial rollout - existing error handling continues working

#### **Simplified Queue Integration**
- **NextJS Plan**: Full queue system overhaul for locale propagation  
- **Worker Plan**: Minimal enhancement to existing stable BullMQ setup
- **✅ Benefit**: Their queue system is mature and stable - don't fix what isn't broken

#### **Pragmatic Deployment Approach**
- **NextJS Plan**: Complex 10-step bare-metal deployment with versioned releases
- **Worker Plan**: Start with simple npm scripts, add complexity later
- **✅ Benefit**: Reduce deployment risk during i18n rollout phase

### 🎯 **Strategic Scope Reductions** (Smart Engineering)

#### **1. Base Locales Only** (Reduced Complexity)
- **NextJS Plan**: Support regional variants (ar-eg, fr-ma) in Worker
- **Worker Decision**: Base locales only (ar, fr) - regional variants handled by Next.js
- **✅ Benefit**: Simpler maintenance, clear separation of concerns

#### **2. Simple Parameter Interpolation** (Start Small)
- **NextJS Plan**: Full ICU MessageFormat features (pluralization, date formatting)
- **Worker Decision**: Start with simple `{parameter}` substitution
- **✅ Benefit**: Most Worker messages are simple error/status - avoid over-engineering

#### **3. Standard Build Process** (Keep It Simple)
- **NextJS Plan**: Complex compilation scripts with environment checks
- **Worker Decision**: Standard npm build process with message compilation
- **✅ Benefit**: Fits existing CI/CD pipeline perfectly

### Week 3: Worker Team's Validated Implementation Plan

#### Day 1: Simplified Dependencies & Setup (Worker Team Approach)

```bash
cd worker
# Minimal dependencies for simple parameter interpolation  
npm install fastify-plugin
npm install --save-dev @formatjs/cli  # For message compilation only
```

**Worker Team Decision**: Skip complex ICU dependencies initially, use simple string templating

#### Day 2: Create Fastify i18n Plugin

**File: `plugins/i18n.ts` (Worker Team's Enhanced Approach)**
```typescript
import fp from 'fastify-plugin'
import { ErrorMessageRenderer } from '../src/services/error-renderer' // Existing system

// Simplified locale support - base locales only
const SUPPORTED_LOCALES = ['en', 'ar', 'fr', 'es', 'de'] as const
type SupportedLocale = typeof SUPPORTED_LOCALES[number]

declare module 'fastify' {
  interface FastifyRequest {
    i18n: {
      locale: SupportedLocale
      formatMessage: (code: string, params?: any) => string
      isRTL: boolean
    }
  }
}

export default fp(async (app) => {
  const existingErrorRenderer = new ErrorMessageRenderer() // Fallback
  const messageTemplates = await loadCompiledMessages()    // New i18n
  
  app.decorateRequest('i18n', null)

  app.addHook('onRequest', async (req) => {
    // Multi-level validation (Worker team's security hardening)
    const rawLocale = req.headers['x-sheen-locale'] as string
    
    // 1. Whitelist validation
    const locale = SUPPORTED_LOCALES.includes(rawLocale as any) 
      ? rawLocale as SupportedLocale 
      : 'en'
      
    // 2. Enhanced message formatter with fallback (Worker team's approach)
    const formatMessage = (code: string, params: any = {}) => {
      try {
        // Try new i18n system first
        const template = messageTemplates[locale]?.[code]
        if (template) {
          return simpleInterpolate(template, params)
        }
        
        // Fallback to existing ErrorMessageRenderer (safety net)
        return existingErrorRenderer.format(code, params)
      } catch (error) {
        console.warn(`Message formatting failed for ${code}:`, error)
        return existingErrorRenderer.format(code, params)
      }
    }
    
    req.i18n = {
      locale,
      formatMessage,
      isRTL: locale === 'ar'
    }
  })
})

// Simple parameter interpolation (Worker team's decision)
function simpleInterpolate(template: string, params: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key]
    return value !== undefined ? String(value) : match
  })
}

// Load compiled messages at startup
async function loadCompiledMessages() {
  const messages: Record<string, Record<string, string>> = {}
  
  for (const locale of SUPPORTED_LOCALES) {
    try {
      // Only load base locales (Worker decision)
      messages[locale] = require(`../compiled/${locale}/messages.json`)
    } catch (error) {
      console.warn(`Failed to load messages for ${locale}`, error)
      messages[locale] = {}
    }
  }
  
  return messages
}
```

#### Day 3: Simplified Build Process (Worker Team Approach)

**File: `package.json`**
```json
{
  "scripts": {
    "i18n:compile": "formatjs compile-folder --input-dir messages --output-file compiled/messages.json --format simple",
    "build": "npm run i18n:compile && tsc",
    "dev": "npm run i18n:compile && npm run start:dev"
  }
}
```

**Worker Team Decision**: Keep it simple - single compiled file per locale, standard npm scripts
```

**File: `src/i18n/formatter.ts`**
```typescript
import { IntlMessageFormat } from 'intl-messageformat'
import { ERROR_CODES } from '@sheenapps/i18n-core'
import path from 'path'
import fs from 'fs'

// Precompiled messages loaded at startup  
const compiledMessages = new Map<string, Map<string, IntlMessageFormat>>()

// Security: Only allow known namespaces
const ALLOWED_NAMESPACES = ['errors', 'events'] as const

// Startup logging: Dump runtime versions and environment
console.log('🚀 Worker i18n formatter initializing')
console.log('📋 Runtime versions:', {
  node: process.version,
  openssl: process.versions.openssl,
  icu: process.versions.icu || 'not available'
})
console.log('📍 Worker root:', process.env.WORKER_ROOT || process.cwd())

// Load compiled messages (base locales only - no regional variants)
export function loadCompiledMessages(locale: string) {
  if (compiledMessages.has(locale)) return
  
  // Security: Reject regional variants in Worker - use base only
  const baseLocale = locale.split('-')[0]
  if (compiledMessages.has(baseLocale) && baseLocale !== locale) {
    compiledMessages.set(locale, compiledMessages.get(baseLocale)!)
    return
  }
  
  try {
    const localeMessages = new Map<string, IntlMessageFormat>()
    
    // Load only allowed namespaces for security
    for (const namespace of ALLOWED_NAMESPACES) {
      // Use absolute path rooted at WORKER_ROOT
      const filePath = path.join(process.env.WORKER_ROOT || process.cwd(), 'compiled', baseLocale, `${namespace}.json`)
      
      if (fs.existsSync(filePath)) {
        const messages = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        
        Object.entries(messages).forEach(([key, ast]) => {
          localeMessages.set(`${namespace}.${key}`, new IntlMessageFormat(ast, baseLocale))
        })
      }
    }
    
    compiledMessages.set(locale, localeMessages)
    if (baseLocale !== locale) {
      compiledMessages.set(baseLocale, localeMessages)
    }
    
  } catch (error) {
    console.error(`❌ Failed to load messages for ${locale}:`, error)
    // Fallback to English with warning
    if (locale !== 'en') {
      console.warn(`⚠️  Falling back to English for locale ${locale}`)
      loadCompiledMessages('en')
      compiledMessages.set(locale, compiledMessages.get('en')!)
    }
  }
}

// Initialize base locales only at startup (not regional variants)
const BASE_LOCALES = ['en', 'ar', 'fr', 'es', 'de']
console.log('🌍 Loading base locales:', BASE_LOCALES.join(', '))

BASE_LOCALES.forEach(locale => {
  loadCompiledMessages(locale)
  const messageCount = compiledMessages.get(locale)?.size || 0
  console.log(`✅ Loaded ${messageCount} messages for ${locale}`)
})

// Log loaded namespaces for diagnostics
const loadedNamespaces = Array.from(new Set(
  Array.from(compiledMessages.get('en')?.keys() || [])
    .map(key => key.split('.')[0])
))
console.log('📚 Available namespaces:', loadedNamespaces.join(', '))

// Verify English loaded successfully (critical for fallback)
if (!compiledMessages.has('en')) {
  console.error('🚨 CRITICAL: Failed to load English messages - Worker may not function correctly')
  process.exit(1)
}

// Legacy error cutoff check with logging
if (process.env.LEGACY_ERROR_UNTIL) {
  const cutoffDate = new Date(process.env.LEGACY_ERROR_UNTIL)
  const now = new Date()
  
  if (now > cutoffDate) {
    console.error(`🚨 LEGACY_ERROR_UNTIL cutoff (${process.env.LEGACY_ERROR_UNTIL}) has passed!`)
    console.error('🔧 Remove legacy error message support from codebase')
    // In production: process.exit(1) to fail startup
  } else {
    console.log(`⏰ Legacy error support active until ${process.env.LEGACY_ERROR_UNTIL}`)
  }
}

export function createFormatter(locale: string) {
  loadCompiledMessages(locale)
  const messages = compiledMessages.get(locale) || compiledMessages.get('en')!
  
  return (code: string, params?: any) => {
    const message = messages.get(code)
    if (!message) {
      // Emit metric for missing keys
      console.warn(`⚠️  Missing translation: ${code} for locale ${locale}`)
      // TODO: Emit i18n_missing_key_total{key_hash} metric
      return code
    }
    
    try {
      return message.format(params)
    } catch (error) {
      console.error(`❌ Format error for ${code}:`, error)
      return code
    }
  }
}
```

#### Day 3: Queue Locale Propagation

**CRITICAL: Locale must travel with jobs!**

**File: `src/services/queue-service.ts`**
```typescript
import { Queue } from 'bullmq'

export async function enqueueBuildJob(
  request: FastifyRequest,
  projectId: string,
  buildConfig: any
) {
  const queue = new Queue('builds')
  
  // CRITICAL: Include locale in job data
  const job = await queue.add('build', {
    projectId,
    buildConfig,
    locale: request.i18n.locale,  // Locale travels with job!
    userId: request.user.id,
    timestamp: Date.now()
  }, {
    jobId: `build-${projectId}-${Date.now()}`
  })
  
  return job
}
```

**File: `src/workers/build-worker.ts`**
```typescript
import { Worker } from 'bullmq'
import { createFormatter } from '../i18n/formatter'

const buildWorker = new Worker('builds', async (job) => {
  // CRITICAL: Use job's locale, NOT current request
  const { locale, projectId, buildConfig } = job.data
  const t = createFormatter(locale)
  
  try {
    // Emit events with codes only
    await emitBuildEvent(projectId, {
      code: 'BUILD_STARTED',
      params: { projectId },
      // Never include localized text!
    })
    
    // ... build logic ...
    
    await emitBuildEvent(projectId, {
      code: 'DEPENDENCY_INSTALL_PROGRESS',
      params: { 
        step: 1, 
        total: 5, 
        pct: 20 
      }
    })
    
  } catch (error) {
    await emitBuildEvent(projectId, {
      code: 'BUILD_FAILED',
      params: { 
        reason: error.message 
      },
      debug_data: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})
```

#### Day 4: Convert Events to Codes-Only Pattern

**CRITICAL: Never send localized text in streams!**

**File: `src/services/event-service.ts`**
```typescript
export async function emitBuildEvent(
  buildId: string,
  event: {
    code: string
    params?: Record<string, any>
    debug_data?: any
  }
) {
  // NEVER include localized text
  const eventData = {
    build_id: buildId,
    event_code: event.code,        // e.g., 'DEPENDENCY_INSTALL_PROGRESS'
    event_params: event.params,    // e.g., { step: 3, total: 10, pct: 30 }
    created_at: new Date().toISOString()
  }
  
  // Store in database (codes only)
  await db.insert('project_build_events', eventData)
  
  // Emit to SSE clients (codes only)
  sseClients.forEach(client => {
    client.send(JSON.stringify({
      type: 'build_event',
      data: eventData
    }))
  })
  
  // Debug data is internal only
  if (event.debug_data && process.env.NODE_ENV === 'development') {
    console.log('[DEBUG]', event.debug_data)
  }
}
```

#### Day 5: Error Responses with Compatibility Window

**File: `src/utils/error-response.ts`**
```typescript
import { ERROR_CODES, ErrorResponseSchema } from '@sheenapps/i18n-core'

// 2-week compatibility window
const LEGACY_MODE = process.env.LEGACY_ERROR_MESSAGES === 'true'
const LEGACY_UNTIL = new Date('2024-02-14')  // Set your cutoff date

export function formatErrorResponse(
  code: keyof typeof ERROR_CODES,
  params?: Record<string, any>,
  statusCode = 500
) {
  const response = {
    success: false,
    error: {
      code,
      params,
      // Temporary compatibility field
      message: LEGACY_MODE && Date.now() < LEGACY_UNTIL.getTime()
        ? getLegacyMessage(code, params)
        : undefined
    }
  }
  
  // Validate response schema
  ErrorResponseSchema.parse(response.error)
  
  return { response, statusCode }
}

function getLegacyMessage(code: string, params?: any): string {
  // Temporary legacy messages for compatibility
  const legacyMessages: Record<string, string> = {
    INSUFFICIENT_BALANCE: 'Insufficient balance to complete build',
    AI_LIMIT_REACHED: 'AI capacity reached, please try again later',
    BUILD_FAILED: 'Build failed',
    // ... other legacy messages
  }
  
  return legacyMessages[code] || 'An error occurred'
}
```

**Example Route Update:**
```typescript
app.post('/v1/projects/:id/build', async (request, reply) => {
  try {
    // Check balance
    const balance = await checkUserBalance(request.user.id)
    const requiredBalance = 100
    
    if (balance < requiredBalance) {
      const { response, statusCode } = formatErrorResponse(
        'INSUFFICIENT_BALANCE',
        {
          requiredBalance,
          currentBalance: balance,
          recommendation: 'purchase'
        },
        402
      )
      
      return reply.status(statusCode).send(response)
    }
    
    // ... rest of build logic
    
  } catch (error) {
    logger.error('Build failed:', error)
    
    const { response, statusCode } = formatErrorResponse(
      'INTERNAL_ERROR',
      undefined,
      500
    )
    
    return reply.status(statusCode).send(response)
  }
})
```

### Build & Deployment Setup

#### Compile Messages During Build

**File: `scripts/compile-messages.sh`**
```bash
#!/bin/bash
# CLI-based compilation for better reliability and Node.js version compatibility

set -e  # Exit on any error

echo "📦 Compiling ICU messages for Worker..."

# Ensure output directory exists
mkdir -p compiled/{en,ar,fr,es,de}

# Base locales only (no regional variants in Worker)
LOCALES=("en" "ar" "fr" "es" "de")
NAMESPACES=("errors" "events")

for locale in "${LOCALES[@]}"; do
  for namespace in "${NAMESPACES[@]}"; do
    input_dir="src/messages/${locale}"
    output_file="compiled/${locale}/${namespace}.json"
    
    # Only compile if source exists
    if [ -d "$input_dir" ]; then
      formatjs compile-folder \
        --input-dir "$input_dir" \
        --output-file "$output_file" \
        --format simple \
        --ast \
        --namespace "$namespace" || echo "⚠️  No ${namespace} messages for ${locale}"
      
      # Verify compilation succeeded
      if [ -f "$output_file" ]; then
        echo "✅ Compiled ${locale}/${namespace}.json"
      fi
    fi
  done
done

# Legacy cutoff environment check with logging
if [[ -n "$LEGACY_ERROR_UNTIL" ]]; then
  current_date=$(date +%s)
  cutoff_date=$(date -j -f "%Y-%m-%d" "$LEGACY_ERROR_UNTIL" +%s 2>/dev/null || echo "0")
  
  if [[ $current_date -gt $cutoff_date ]]; then
    echo "🚨 LEGACY_ERROR_UNTIL cutoff reached. Remove legacy error handling!"
    # In production: exit 1 to fail build
    # In development: just log warning
  else
    echo "⚠️  Legacy error support active until $LEGACY_ERROR_UNTIL"
  fi
fi

echo "✅ Message compilation complete!"
```

**File: `package.json` (scripts section)**
```json
{
  "scripts": {
    "i18n:compile": "./scripts/compile-messages.sh",
    "i18n:dev": "./scripts/compile-messages.sh && npm run dev",
    "build": "npm run i18n:compile && tsc",
    "docker:build": "npm run build && docker build -t worker ."
  }
}
```

## Container-Optional Deployment Strategy

**Expert Recommendation**: Start bare-metal, add Docker when needed later. This approach reduces operational complexity while the Worker architecture matures.

> **🔄 WORKER TEAM UPDATE**: The Worker team prefers their existing standard npm build process over the complex 10-step deployment originally planned. Their approach is more pragmatic for their current CI/CD pipeline.

### ✅ Worker Team's Simplified Deployment Approach

Instead of complex versioned releases and atomic symlinks, the Worker team will:

1. **Standard npm build process** with i18n compilation
2. **Existing CI/CD pipeline** - minimal changes to current deployment
3. **Simple message compilation** during build step
4. **Gradual rollout** with fallback to existing error renderer

**Worker Build Process:**
```bash
# Simple, integrated build
npm run i18n:compile  # Compiles messages for all locales
npm run build        # Standard TypeScript build  
npm run deploy       # Existing deployment process
```

**✅ Benefits of Worker Team's Approach:**
- Minimal risk - uses existing proven deployment pipeline
- No complex shell scripts to maintain
- Faster initial implementation
- Easy to enhance later if needed

### Bare-Metal Production Deployment (10 Requirements)

**1. Pin the Runtime Environment**
```bash
# Install Node 22.x on all servers
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify versions match CI exactly
node -p "process.versions"
```

**2. Atomic Build Artifacts**
```bash
# Build script with versioned releases
#!/bin/bash
# scripts/deploy-build.sh

RELEASE_DIR="/srv/worker/releases/$(date +%Y-%m-%d_%H%M%S)"
sudo mkdir -p "$RELEASE_DIR"

# Build application
npm run i18n:compile
npm run build
npm ci --omit=dev --prefix "$RELEASE_DIR"

# Copy built artifacts atomically
sudo cp -r dist/ compiled/ "$RELEASE_DIR/"
sudo cp -r node_modules/ "$RELEASE_DIR/"

# Atomic symlink swap (no half-copied files)
sudo ln -sfn "$RELEASE_DIR" /srv/worker/current

# Restart process manager
sudo systemctl reload worker
```

**3. Process Manager with systemd**
```ini
# /etc/systemd/system/worker.service
[Unit]
Description=Sheen Worker
After=network.target redis.service

[Service]
User=worker
Group=worker
EnvironmentFile=/etc/worker.env
WorkingDirectory=/srv/worker/current
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
CapabilityBoundingSet=
ReadWritePaths=/srv/worker
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

**4. Enhanced Health Checks**
```typescript
// Add to worker health endpoint
app.get('/health', async (req, res) => {
  try {
    // Test message formatting for critical locales
    const formatter = createFormatter('en')
    const enTest = formatter('errors.INTERNAL_ERROR', {})
    
    const arFormatter = createFormatter('ar') 
    const arTest = arFormatter('errors.INTERNAL_ERROR', {})
    
    if (!enTest || !arTest) {
      throw new Error('Message formatting failed')
    }
    
    res.json({ 
      status: 'healthy',
      locales: ['en', 'ar'],
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION
    })
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message 
    })
  }
})
```

**5. Security Hardening**
```bash
# Create non-root worker user
sudo useradd -r -s /bin/false -d /srv/worker worker
sudo chown -R worker:worker /srv/worker

# Lock down writable paths
sudo chmod 755 /srv/worker
sudo chmod -R 644 /srv/worker/current/compiled/
sudo chmod +x /srv/worker/current/dist/index.js

# For Claude CLI subprocess isolation (optional)
# sudo apt-get install firejail
# ExecStart=firejail --profile=claude-cli node dist/index.js
```

**6. Logging Configuration**
```bash
# journald configuration
# /etc/systemd/journald.conf
[Journal]
Storage=persistent
MaxRetentionSec=7day
SystemMaxFileSize=100M

# View logs
journalctl -u worker -f
```

**7. Environment Management**
```bash
# /etc/worker.env
NODE_ENV=production
WORKER_ROOT=/srv/worker/current
LEGACY_ERROR_UNTIL=2025-09-01
REDIS_URL=rediss://user:pass@redis.internal:6380/0
POSTGRES_URL=postgresql://user:pass@postgres.internal:5432/sheenapps

# Audit: No NEXT_PUBLIC_* secrets should exist here
```

**8. Database Connectivity**
```typescript
// Enhanced connection handling
const redis = new Redis(process.env.REDIS_URL, {
  connectTimeout: 5000,
  commandTimeout: 10000,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  tls: { rejectUnauthorized: true }
})

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 20
})
```

**9. ICU Catalog Boot Verification**
```typescript
// Add to worker startup
function verifyI18nCatalogs() {
  const requiredFiles = [
    'compiled/en/errors.json',
    'compiled/ar/errors.json',
    'compiled/en/events.json'
  ]
  
  for (const file of requiredFiles) {
    const fullPath = path.join(process.env.WORKER_ROOT || process.cwd(), file)
    if (!fs.existsSync(fullPath)) {
      console.error(`🚨 CRITICAL: Missing ${file} - deploy failed`)
      process.exit(1)
    }
  }
  
  console.log('✅ All ICU catalogs verified')
}

verifyI18nCatalogs()
```

**10. Zero-Downtime Deployment**
```bash
#!/bin/bash
# scripts/zero-downtime-deploy.sh

set -e

NEW_RELEASE="/srv/worker/releases/$(date +%Y-%m-%d_%H%M%S)"

# 1. Prepare new release
sudo mkdir -p "$NEW_RELEASE"
sudo rsync -av --exclude=node_modules /path/to/build/ "$NEW_RELEASE/"

# 2. Install dependencies
cd "$NEW_RELEASE" && sudo npm ci --omit=dev

# 3. Atomic symlink flip
sudo ln -sfn "$NEW_RELEASE" /srv/worker/current

# 4. Reload systemd (graceful restart)
sudo systemctl reload worker

# 5. Wait for health check
sleep 5
curl -f http://localhost:8081/health || exit 1

# 6. Cleanup old releases (keep last 5)
sudo find /srv/worker/releases -maxdepth 1 -type d | sort -r | tail -n +6 | sudo xargs rm -rf

echo "✅ Deployment successful"
```

### When to Switch to Docker Later

**Triggers indicating Docker is needed:**
- **Multi-region deployment** - Consistent environments across regions
- **Autoscaling workers** - Container orchestration becomes valuable
- **Diverse host environments** - Different AMIs/OSes causing "works here, fails there"
- **Runtime drift management** - More than 1 hour/week fighting environment issues
- **Resource isolation requirements** - Need strict memory/CPU limits per worker

### Hybrid Compromise Approach (Future Enhancement)

Keep Fastify API + BullMQ consumers on bare metal, but run risky operations in sandboxes:

```typescript
// Future: Sandboxed build executor
async function executeBuildInSandbox(buildId: string, locale: string) {
  const sandbox = spawn('bwrap', [
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/lib', '/lib', 
    '--tmpfs', '/tmp',
    '--chdir', '/workspace',
    'node', 'build-executor.js'
  ], {
    env: { BUILD_ID: buildId, LOCALE: locale }
  })
  
  // Isolated execution with cleanup
  return new Promise((resolve, reject) => {
    sandbox.on('exit', code => code === 0 ? resolve() : reject())
  })
}
```

### Database Schema Updates

```sql
-- Add error code columns
ALTER TABLE project_build_events 
ADD COLUMN event_code VARCHAR(50),
ADD COLUMN event_params JSONB,
ADD COLUMN debug_data JSONB;

-- Partial index for error analytics
CREATE INDEX idx_build_events_errors 
ON project_build_events (event_code, created_at) 
WHERE event_code IS NOT NULL;

-- Migration: Convert existing error_message to codes
UPDATE project_build_events 
SET event_code = CASE
  WHEN error_message LIKE '%balance%' THEN 'INSUFFICIENT_BALANCE'
  WHEN error_message LIKE '%timeout%' THEN 'BUILD_TIMEOUT'
  WHEN error_message LIKE '%failed%' THEN 'BUILD_FAILED'
  ELSE 'INTERNAL_ERROR'
END
WHERE error_message IS NOT NULL AND event_code IS NULL;
```

### Security Checklist

- [ ] **Never dynamic import based on user locale**
- [ ] **Whitelist all locales against SUPPORTED_LOCALES**
- [ ] **Keep system logs in English only**
- [ ] **No HTML generation in Worker**
- [ ] **Validate all error responses with Zod schema**

### Testing Your Implementation

```typescript
// tests/i18n.test.ts
describe('Worker i18n', () => {
  test('Fastify plugin sets locale correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-sheen-locale': 'ar-eg'
      }
    })
    
    expect(response.json().locale).toBe('ar-eg')
    expect(response.json().isRTL).toBe(true)
  })
  
  test('Events contain codes only, no text', async () => {
    const event = await getLatestBuildEvent()
    
    expect(event.event_code).toBeDefined()
    expect(event.event_params).toBeDefined()
    expect(event.message).toBeUndefined() // No localized text!
  })
  
  test('Error responses include code and params', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/projects/123/build',
      headers: { 'x-user-balance': '10' }
    })
    
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: 'INSUFFICIENT_BALANCE',
        params: {
          requiredBalance: expect.any(Number),
          currentBalance: expect.any(Number)
        }
      }
    })
  })
})
```

---

## 📊 Week 4: Testing & Optimization

### Translation Coverage Test

```typescript
// tests/i18n/coverage.test.ts
describe('Translation Coverage', () => {
  const baseLocale = 'en'
  const locales = ['ar', 'fr', 'es', 'de']
  
  locales.forEach(locale => {
    test(`${locale} has all error codes`, async () => {
      const enErrors = await import(`../../src/messages/${baseLocale}/errors.json`)
      const localeErrors = await import(`../../src/messages/${locale}/errors.json`)
      
      const missingKeys = Object.keys(enErrors).filter(
        key => !localeErrors[key]
      )
      
      expect(missingKeys).toEqual([])
    })
  })
})
```

### RTL Visual Test

```typescript
// tests/e2e/rtl.spec.ts
test('Arabic layout renders correctly', async ({ page }) => {
  await page.goto('/ar/builder')
  
  const html = page.locator('html')
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(html).toHaveClass(/font-arabic/)
  
  // Check text alignment
  const heading = page.locator('h1')
  await expect(heading).toHaveCSS('text-align', 'right')
  
  // Visual snapshot
  await expect(page).toHaveScreenshot('arabic-builder.png')
})
```

### Bundle Size Check

```bash
# Add to package.json scripts
"analyze": "ANALYZE=true next build"
```

Monitor that:
- Bundle size increase < 15% per route
- Translation files load on-demand
- Client receives only needed namespaces

---

## 📅 Week 5: Cleanup & Polish

### Remove Legacy Compatibility

After 2 weeks, remove:
1. `message` field from Worker responses
2. Legacy error message handling in frontend
3. `LEGACY_ERROR_MESSAGES` environment variable

### Add Missing Translations

Use the dev flag to identify gaps:
```bash
NEXT_PUBLIC_I18N_DEBUG_MISSING_KEYS=true npm run dev
```

### Documentation

Create `docs/i18n-guide.md` with:
- Supported locales and their configurations
- How to add new translations
- Error code reference
- Testing procedures

---

## ✅ Success Criteria

### ✅ Already Completed (Structured Error Handling Implementation)
- ✅ **All error codes implemented** - Worker provides structured errors
- ✅ **Error messages localized** - Complete translation system for all 9 locales  
- ✅ **Worker events use codes only** - Structured error objects implemented
- ✅ **RTL support implemented** - Arabic error messages with proper RTL handling
- ✅ **Smart retry logic** - Countdown timers and auto-retry functionality

### 🎯 Remaining Technical Metrics
- [ ] Bundle size impact < 15% (for remaining non-error i18n)
- [ ] Non-error message i18n implemented (navigation, dashboard, etc.)
- [ ] No hardcoded strings in new code
- [ ] Server component localization patterns established

### 🎯 Remaining User Experience Goals
- [ ] Arabic UI renders correctly RTL (beyond error messages)
- [ ] Numbers show as Latin (123) not Arabic (١٢٣) in all contexts
- [ ] Loading time < 50ms impact
- [ ] Complete dashboard/navigation localization

### 🎯 Remaining Developer Experience Goals
- [ ] ESLint catches hardcoded strings
- [ ] Missing translations visible in dev
- [ ] Clear documentation for non-error message patterns
- [ ] Easy to add new translations beyond error handling

---

## 🚨 Common Pitfalls to Avoid

1. **DON'T send localized text in Worker streams** - Use codes only
2. **DON'T trust user locale input** - Always whitelist
3. **DON'T load all messages on every page** - Use namespaces
4. **DON'T use client components for static text** - Prefer server components
5. **DON'T forget BiDi isolation** - Numbers in RTL need wrapping
6. **DON'T skip the compatibility window** - 2 weeks prevents breakage

---

## 📋 Rollout Sanity Checklist

Before deploying to production, verify these critical points:

### Security & Input Validation
- [ ] **Locale whitelist enforced everywhere** - No dynamic imports based on user input
- [ ] **Namespace validation active** - Worker only loads allowed namespaces (`errors`, `events`)
- [ ] **BCP-47 canonicalization working** - Malformed locales fallback to English
- [ ] **Regional variant fallback tested** - `ar-eg` extends `ar` properly

### Performance & Bundle Impact
- [ ] **Bundle analysis shows <15% increase** - Run `npm run analyze` to verify
- [ ] **Client messages selective** - Only required namespaces passed to client components
- [ ] **Precompiled messages loading correctly** - Worker startup logs show successful compilation
- [ ] **Base locales only in Worker** - No regional variants (ar-eg, fr-ma) in Worker compiled messages

### Functional Testing
- [ ] **Error codes work end-to-end** - Worker emits codes, frontend displays localized text
- [ ] **Stream events use codes only** - No localized text in SSE events
- [ ] **RTL layouts render correctly** - Arabic pages show proper right-to-left flow
- [ ] **BiDi isolation working** - Numbers and URLs display correctly in Arabic text
- [ ] **Pseudo-locale functional** - `en-XA` shows accented text in development

### Development Experience
- [ ] **Missing translation detection active** - Console shows warnings for missing keys in dev
- [ ] **ESLint catches hardcoded strings** - New code properly uses translation functions
- [ ] **Legacy cutoff environment functional** - `LEGACY_ERROR_UNTIL` properly enforced
- [ ] **Compilation scripts run without errors** - CLI-based approach works across Node versions

### Production Readiness
- [ ] **Environment variables set correctly** - Both regular and `NEXT_PUBLIC_` prefixed versions
- [ ] **Timezone resolution priority correct** - User profile > browser > locale fallback
- [ ] **Graceful fallback to English** - All error paths lead to working English fallback
- [ ] **Health checks include message availability** - Docker/deployment health checks verify compiled messages exist

---

## 📊 Well-Known Progress Codes

These event codes should be implemented consistently across the platform:

### Build Progress Events
```typescript
// File: packages/i18n-core/src/progress-codes.ts
export const PROGRESS_CODES = {
  // Build lifecycle
  BUILD_QUEUED: 'BUILD_QUEUED',
  BUILD_STARTED: 'BUILD_STARTED', 
  BUILD_DEPENDENCIES_INSTALLING: 'BUILD_DEPENDENCIES_INSTALLING',
  BUILD_COMPILING: 'BUILD_COMPILING',
  BUILD_DEPLOYING: 'BUILD_DEPLOYING',
  BUILD_COMPLETED: 'BUILD_COMPLETED',
  
  // Error states
  BUILD_FAILED: 'BUILD_FAILED',
  BUILD_TIMEOUT: 'BUILD_TIMEOUT',
  BUILD_CANCELLED: 'BUILD_CANCELLED',
  
  // AI events  
  AI_PROCESSING: 'AI_PROCESSING',
  AI_COMPLETED: 'AI_COMPLETED',
  AI_LIMIT_REACHED: 'AI_LIMIT_REACHED',
  
  // Billing events
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED'
} as const
```

### Consistent Parameter Patterns
```typescript
// Common parameter shapes for internationalized messages
interface ErrorParams {
  // Time-related
  duration?: number
  waitTime?: number  
  resetMinutes?: number
  
  // Quantities
  currentBalance?: number
  requiredBalance?: number
  fieldCount?: number
  
  // Contextual
  recommendation?: 'upgrade' | 'purchase' | 'retry'
  reason?: string
  details?: string
  fields?: string
}
```

---

## 🎯 Quick Start Commands

```bash
# Week 1: Setup
npm run create:i18n-core
npm run split:translations
npm run lint:fix

# Week 2: Next.js
npm run dev
npm run analyze

# Week 3: Worker (in worker directory)
npm run i18n:compile
npm run test:i18n
npm run docker:build

# Week 4: Testing
npm run test:coverage
npm run test:e2e:rtl

# Week 5: Production
npm run build
npm run start
```

---

## 📝 Expert Feedback Analysis: Container-Optional Deployment

### What We ✅ Appreciate About This Approach

**1. Pragmatic Deployment Strategy**
- **Container-optional path makes perfect sense** for our current architecture
- Start simple (bare-metal), add complexity (Docker) only when justified
- Reduces operational overhead during the i18n rollout phase
- Allows focus on i18n implementation rather than containerization complexity

**2. Production-Ready Bare-Metal Guidance**
- **Comprehensive 10-step production checklist** covers all critical aspects
- Atomic deployment with versioned releases prevents half-deployed states
- systemd configuration with proper security hardening (non-root user, capability restrictions)
- Enhanced health checks that actually test i18n functionality
- Zero-downtime deployment script with graceful rollbacks

**3. Clear Migration Triggers**
- **Specific, measurable criteria** for when Docker becomes necessary
- Multi-region deployment, autoscaling, and runtime drift thresholds
- Prevents premature optimization while providing clear upgrade path

**4. Security & Reliability Focus**
- Environment management with audit trail for secrets
- TLS-enabled database connections with proper timeouts
- ICU catalog boot verification prevents silent i18n failures
- Logging strategy with retention policies

**5. Smart Hybrid Compromise**
- **Sandbox risky operations** (build executor) while keeping core services simple
- bwrap/firejail isolation where it matters most
- Deferred but planned approach to subprocess isolation

### 🤔 Areas We Have Minor Concerns About

**1. Deployment Complexity Trade-offs**
- While bare-metal reduces container complexity, it increases deployment script complexity
- Multiple shell scripts (compile, deploy, health check) need maintenance
- Risk of environment drift across multiple bare-metal servers over time

**2. Missing Observability Specifics**
- Health checks are good, but limited metrics/monitoring guidance
- No mention of distributed tracing for i18n performance issues
- Log aggregation mentioned but not detailed

**3. Security Hardening Gaps**
- firejail suggestion is good but implementation details sparse
- No mention of network isolation or ingress filtering
- Environment variable audit process could be more specific

### 🎯 Our Implementation Decision

**We're adopting the expert's bare-metal approach** because:

1. **Aligns with our current DevOps maturity** - We have bare-metal experience
2. **Reduces variables during i18n rollout** - Focus on translation implementation, not containers
3. **Clear migration path provided** - When we hit the triggers, we have Docker guidance
4. **Production-ready from day 1** - The 10-step checklist is comprehensive

**Modifications we're making:**
- Adding structured logging with correlation IDs for debugging
- Including basic Prometheus metrics for i18n performance monitoring  
- Expanding security hardening with network policies
- Creating Ansible playbooks for the 10-step deployment process

This approach gives us a solid foundation for the i18n rollout while keeping operational complexity manageable.

---

This implementation guide provides concrete, actionable steps with real code examples. Follow it sequentially for a smooth rollout of internationalization across your entire platform.