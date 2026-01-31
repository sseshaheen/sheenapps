# ESLint Server/Client Import Restriction Errors - Diagnostic Report

**Date:** August 15, 2025  
**Status:** ESLint disabled for builds (`ignoreDuringBuilds: true`) - No deployment blocker  
**Priority:** P1 Architectural Debt - Clean up recommended but not urgent  
**Context:** Server/client architecture refactor resulted in import pattern violations  

---

## 🎯 **Executive Summary**

ESLint is flagging 26 import restriction violations where client-side code imports server-only services. This is architectural debt from a server/client refactor where services were moved to `/src/server/services/` but existing imports weren't fully updated. **These errors don't prevent deployment** since ESLint is disabled during builds, but they indicate potential runtime issues and should be addressed.

---

## 🔍 **Current Architecture State**

### **Service Migration Pattern**
```
OLD LOCATION                    NEW LOCATION
/src/services/worker-api-client.ts  →  /src/server/services/worker-api-client.ts
/src/services/version-management.ts →  /src/server/services/version-management.ts
/src/services/preview-deployment.ts →  /src/server/services/preview-deployment.ts
/src/services/project-export.ts     →  /src/server/services/project-export.ts
/src/services/ai-time-billing.ts    →  /src/server/services/ai-time-billing.ts
```

### **ESLint Configuration (eslint.config.mjs)**
```javascript
rules: {
  "no-restricted-imports": ["error", {
    patterns: [
      {
        group: ["@/server/*", "*/server/*"],
        message: "Server-only modules cannot be imported in client components. Use API routes or server actions instead."
      },
      {
        group: ["@/services/worker-api-client", "@/services/version-management", ...],
        message: "These services are server-only. Use API routes or the new @/server/services/* imports in server contexts."
      }
    ]
  }]
}
```

---

## 📊 **Error Analysis by Category**

### **Category A: API Routes (Server Context) - 16 errors**
**Issue:** API routes importing old service paths instead of new `/src/server/services/*` paths

**Files affected:**
- `src/app/api/chat-plan/convert-to-build/route.ts:8`
- `src/app/api/chat-plan/message/route.ts:8` 
- `src/app/api/exports/[exportId]/status/route.ts:7`
- `src/app/api/projects/[id]/export/route.ts:8,11`
- `src/app/api/projects/[id]/timeline/route.ts:8`
- `src/app/api/projects/route.ts:3`
- `src/app/api/worker/versions/[projectId]/route.ts:8`
- `src/app/api/worker/versions/publish/route.ts:7`
- `src/app/api/worker/versions/restore/route.ts:8`
- `src/app/api/worker/versions/rollback/route.ts:7`
- `src/app/api/worker/versions/unpublish/route.ts:7`

**Example:**
```typescript
// ❌ Current (triggering ESLint error)
import { getWorkerClient } from '@/server/services/worker-api-client'

// ✅ Should be (but path doesn't exist in old location)
import { getWorkerClient } from '@/services/worker-api-client'  // This file was moved!
```

**Root Cause:** These are legitimate server contexts that **should** import from `/src/server/services/*`, but ESLint is configured to block ALL imports from that path pattern.

### **Category B: Client Components (Invalid Context) - 3 errors**
**Issue:** Client-side code importing server-only services (legitimate violations)

**Files affected:**
- `src/components/ui/accessible-status-badge.tsx:13`
- `src/hooks/use-project-export.ts:8,9`

**Example:**
```typescript
// ❌ WRONG: Client component importing server service
import { VersionManagementService } from '@/services/version-management'
```

**Fix Required:** These need to use API routes or React Query hooks instead.

### **Category C: Configuration Files - 4 errors**
**Issue:** TypeScript configuration and i18n setup using `require()` statements

**Files affected:**
- `src/i18n/chunked-request.ts:38`
- `src/i18n/request.ts:50,56`
- `src/server/services/worker-api-client.ts:71`

**Example:**
```typescript
// ❌ ESLint error: A `require()` style import is forbidden
const messages = require(`../../messages/${locale}.json`);

// ✅ Should be
import messages from `../../messages/${locale}.json`;
```

---

## 🎯 **Root Cause Analysis**

### **1. ESLint Configuration Mismatch**
The ESLint rule blocks `/src/server/*` imports even in legitimate server contexts (API routes). The rule should distinguish between:
- **Client contexts** (components, hooks) - Block server imports ✅
- **Server contexts** (API routes, server actions) - Allow server imports ✅

### **2. Incomplete Migration**
Services were moved to `/src/server/services/` but:
- Old service files still exist in `/src/services/`
- Import paths weren't systematically updated
- Some client code still tries to import server services directly

### **3. Mixed Import Patterns**
```typescript
// Current inconsistent state:
/src/services/version-management.ts        // Old location (still exists)
/src/server/services/version-management.ts // New location (duplicate?)
```

---

## 🛠️ **Safe Fix Strategy**

### **Phase 1: Update ESLint Configuration (Safe)**
```javascript
// Fix: Allow server imports in server contexts
{
  files: ["src/app/api/**/*.ts", "src/lib/actions/**/*.ts"], // Server contexts
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        // Allow @/server/* imports in server contexts
        // Block old service paths to force migration
        {
          group: ["@/services/worker-api-client", "@/services/version-management", ...],
          message: "Use @/server/services/* instead. These services have been moved."
        }
      ]
    }]
  }
},
{
  files: ["src/components/**/*.tsx", "src/hooks/**/*.ts"], // Client contexts  
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["@/server/*", "@/services/worker-api-client", ...],
          message: "Client components cannot import server services. Use API routes instead."
        }
      ]
    }]
  }
}
```

### **Phase 2: Update API Route Imports (Safe)**
**Risk:** Low - These are server-side files
```typescript
// In API routes, update imports:
// FROM: import { getWorkerClient } from '@/services/worker-api-client'  
// TO:   import { getWorkerClient } from '@/server/services/worker-api-client'
```

### **Phase 3: Fix Client Component Violations (Moderate Risk)**
**Risk:** Medium - Requires testing to ensure functionality preserved
- Replace direct service imports with API route calls
- Use existing React Query hooks where available
- Test user flows to ensure no regression

### **Phase 4: Clean Up Duplicate Services (Higher Risk)**
**Risk:** High - Could break existing functionality
- Remove old service files from `/src/services/`
- Ensure all imports updated
- Comprehensive testing required

---

## 📋 **Detailed Fix Plan**

### **Immediate (Low Risk):**
1. **Update ESLint config** to allow server imports in server contexts
2. **Update API route imports** to use `/src/server/services/*` paths
3. **Fix `require()` statements** to use ES6 imports

### **Short Term (Medium Risk):**
1. **Update client components** to use API routes instead of direct service imports
2. **Add missing React Query hooks** for client-side data fetching
3. **Test affected user flows**

### **Long Term (Validation Required):**
1. **Remove duplicate service files** after confirming all imports updated
2. **Re-enable ESLint** for builds once errors resolved
3. **Add automated tests** to prevent future violations

---

## 🚨 **Risk Assessment**

### **No Fix (Current State):**
- ✅ **Deployment works** (ESLint disabled)
- ❌ **Technical debt accumulates**
- ❌ **Potential runtime errors** if client code actually executes server imports
- ❌ **Developer confusion** about which services to use

### **Incremental Fix:**
- ✅ **Low risk** if done phase by phase
- ✅ **Improved architecture clarity**
- ✅ **Better separation of concerns**
- ⚠️ **Testing required** for client component changes

### **All-at-once Fix:**
- ❌ **High risk** of breaking existing functionality
- ❌ **Difficult to isolate failures**
- ❌ **Not recommended** without comprehensive test suite

---

## 🎯 **Expert Consultation Questions**

1. **ESLint Configuration:** Is the proposed context-specific import restriction pattern correct for Next.js 15 App Router?

2. **Service Architecture:** Should we maintain duplicate services during migration, or force immediate migration with redirects?

3. **Client Component Strategy:** For components currently importing server services, what's the preferred pattern:
   - Convert to server components?
   - Use API routes with React Query?
   - Move logic to server actions?

4. **Migration Timeline:** Given that deployments work with ESLint disabled, what's the optimal timeline for this cleanup?

5. **Testing Strategy:** What level of testing is recommended before removing duplicate service files?

---

## 📊 **Current Status**

- **Deployment Status:** ✅ **Unblocked** (ESLint disabled)
- **Developer Experience:** ⚠️ **Confusing** (mixed import patterns)
- **Architecture Quality:** ❌ **Degraded** (violates server/client separation)
- **Technical Debt:** 📈 **High** (26 violations across core features)

**Recommendation:** Start with **Phase 1 ESLint fixes** (low risk) to improve developer experience, then gradually address client component violations with proper testing.

---

**Report Status:** Ready for expert architecture consultation  
**Priority:** P1 (Important but not urgent - no deployment blocker)  
**Confidence Level:** High - Clear understanding of issues and safe fix approach