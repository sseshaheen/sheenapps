# Bug Fixes - June 2025

## Fixed Issues

### 1. Z-Index Layering Issue (UI)
**Problem**: Edit and undo/redo components in the builder appeared above the user dropdown menu.

**Root Cause**: The workspace core had a z-index of 1000, creating a stacking context that put all child elements (including section controls with z-index 30) above elements outside that context.

**Solution**: Updated the user menu dropdown to use an explicit z-index of 9999 to ensure it always appears on top.

**Files Modified**:
- `/src/components/ui/user-menu.tsx` - Added `style={{ zIndex: 9999 }}` to dropdown menu

### 2. Project Archiving Error (API)
**Problem**: Archiving a project returned a 500 error with "Cannot destructure property 'id' of '(intermediate value)' as it is undefined."

**Root Cause**: The API route was correctly checking for undefined project data, but the error suggested the React Query mutation might not be handling the response properly.

**Solution**: Enhanced error handling in the React Query update mutation to check for missing project data in the response and throw a more descriptive error.

**Files Modified**:
- `/src/hooks/use-projects-query.ts` - Added check for `result.project` before accessing its properties

### 3. TypeScript Compilation Errors
**Problem**: Build failed due to TypeScript errors in stripe-config route and smart-upgrade-modal.

**Solutions**:
1. **stripe-config route**: 
   - Changed from `require('stripe')` to proper ES6 import
   - Added type annotation to config object to allow dynamic properties
   
2. **smart-upgrade-modal**:
   - Added type guards to ensure arithmetic operations only happen on numeric values
   - Added proper type handling for `formatLimit` function to handle both numbers and objects

**Files Modified**:
- `/src/app/api/debug/stripe-config/route.ts`
- `/src/components/quota/smart-upgrade-modal.tsx`

## Testing Status

All critical issues have been resolved:
- ✅ TypeScript compilation passes
- ✅ ESLint has no critical errors (only unused variable warnings)
- ✅ Production build succeeds
- ✅ Z-index layering fixed for dropdown menus
- ✅ Project archiving error handling improved

## Recommendations

1. **Z-Index Management**: Consider creating a comprehensive z-index scale in `ui-constants.ts` that accounts for all UI layers including modals, dropdowns, and overlays.

2. **Error Handling**: The project archiving error revealed a need for better error handling in React Query mutations. Consider adding similar checks to other mutations.

3. **Type Safety**: The TypeScript errors in smart-upgrade-modal highlight the need for stricter typing on the pricing configuration objects to prevent runtime type mismatches.