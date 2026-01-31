# Worker i18n Migration Guide

## 📍 Current State (Worker's Existing Code)

```typescript
// Worker's current import
import { ERROR_CODES, validateErrorParams, INCLUDE_ERROR_MESSAGE } from '../types/errorCodes'
```

This is **perfectly fine**! No immediate changes needed. Here's the migration strategy:

## 🎯 Migration Strategy

### Phase 1: Keep Current Code (Week 1) ✅

**No changes needed!** Continue using your local `errorCodes.ts` file. This ensures:
- Zero disruption to production
- Time to evaluate the shared package
- Gradual migration path

### Phase 2: Augment with Shared Package (Week 2)

Install the shared package alongside your existing code:

```typescript
// Keep your existing import for now
import { validateErrorParams, INCLUDE_ERROR_MESSAGE } from '../types/errorCodes'

// Add shared package for constants only
import { ERROR_CODES as SHARED_ERROR_CODES } from '@sheenapps/i18n-core'

// During transition, verify they match
if (process.env.NODE_ENV === 'development') {
  console.assert(
    JSON.stringify(ERROR_CODES) === JSON.stringify(SHARED_ERROR_CODES),
    'Error codes mismatch between local and shared!'
  )
}
```

### Phase 3: Gradual Migration (Week 3-4)

Migrate piece by piece:

```typescript
// Step 1: Use shared ERROR_CODES
import { ERROR_CODES } from '@sheenapps/i18n-core'
import { validateErrorParams, INCLUDE_ERROR_MESSAGE } from '../types/errorCodes'

// Step 2: Move validateErrorParams to your utils (it's Worker-specific)
import { ERROR_CODES } from '@sheenapps/i18n-core'
import { validateErrorParams } from '../utils/error-validation'
import { INCLUDE_ERROR_MESSAGE } from '../config/migration-flags'

// Step 3: Eventually remove INCLUDE_ERROR_MESSAGE (after Week 3)
import { ERROR_CODES } from '@sheenapps/i18n-core'
import { validateErrorParams } from '../utils/error-validation'
```

## 🔄 What to Keep vs What to Share

### ✅ Use from Shared Package
- `ERROR_CODES` - Constant definitions
- `toBaseLocale()` - Locale conversion
- `validateLocale()` - Locale validation
- `isolateBidiText()` - RTL text handling

### 🏠 Keep in Worker Repository
- `validateErrorParams()` - Your validation logic
- `INCLUDE_ERROR_MESSAGE` - Migration flag
- Error formatting functions - Worker-specific
- Message templates - Your implementation

## 📝 Comparison: Worker vs Shared

| Feature | Worker's Current | Shared Package | Action |
|---------|-----------------|----------------|--------|
| ERROR_CODES | ✅ Has own | ✅ Available | Optional migration |
| validateErrorParams | ✅ Has own | ❌ Not included | Keep in Worker |
| INCLUDE_ERROR_MESSAGE | ✅ Has own | ❌ Not included | Keep in Worker |
| Locale utils | ❓ Unknown | ✅ Available | Use if needed |
| BiDi utils | ❓ Unknown | ✅ Available | Use if needed |

## 🚀 Recommended Approach

### Week 1: Evaluation
1. **Continue using your existing code** - No changes
2. **Test the shared package** in development:
   ```bash
   # Extract package to a test directory
   mkdir test-i18n-core
   cd test-i18n-core
   tar -xzf ../i18n-core-latest.tar.gz
   node ../scripts/test-i18n-core-import.js
   ```
3. **Compare ERROR_CODES** to ensure compatibility

### Week 2: Parallel Usage
1. Install shared package in development branch
2. Run both systems in parallel
3. Log any discrepancies
4. Gradually switch non-critical code

### Week 3: Production Migration
1. Switch to shared ERROR_CODES
2. Keep your validation and formatting
3. Remove legacy message field
4. Update tests

## ⚠️ Important Notes

### Your Code is Fine!
- **No immediate changes required**
- Your current implementation works perfectly
- Migration is **optional** and can be gradual

### Benefits of Migration (When Ready)
- Consistent error codes with frontend
- Automatic updates when new codes added
- Shared locale utilities if needed
- TypeScript type safety

### What NOT to Change
- Your `validateErrorParams` logic - it's Worker-specific
- Your error formatting - it's your implementation
- Your `INCLUDE_ERROR_MESSAGE` flag - needed for migration

## 🎯 Decision Framework

**Should you migrate?**

### Yes, if:
- You want to ensure consistency with frontend
- You need the locale utilities
- You want automatic updates to error codes
- You're refactoring error handling anyway

### No, if:
- Your current system works perfectly
- You have custom error codes not in shared package
- You're in a critical release period
- The overhead isn't worth the benefit

## 📊 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking production | Low | High | Keep existing code, test thoroughly |
| Version mismatch | Medium | Low | Use version pinning |
| Missing error codes | Low | Medium | Add to shared package |
| Type conflicts | Low | Low | TypeScript will catch |

## 💡 Recommendation

**Keep your current code for now!** 

The shared package is available when you need it, but there's no urgency to migrate. Your existing implementation is working, tested, and production-ready. Consider migration only when:

1. You're already refactoring error handling
2. You need the additional utilities (locale, BiDi)
3. You want to reduce code duplication
4. You have time for thorough testing

## 📞 Support

If you decide to migrate and need help:
- Slack: #frontend channel
- Documentation: `/docs/I18N_CORE_PACKAGE_SHARING_PLAN.md`
- Test script: `scripts/test-i18n-core-import.js`

Remember: **Your current code is perfectly fine!** This shared package is an option, not a requirement.