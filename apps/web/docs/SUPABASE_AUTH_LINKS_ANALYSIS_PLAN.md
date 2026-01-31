# Supabase Magic Link & Password Reset Analysis & Fix Plan

**Date**: August 2025  
**Issue**: Magic links and password reset links not working after changing Site URL from localhost:3000

## 🔍 **Current State Analysis**

### ✅ **What's Working Well**

1. **Callback Route Implementation** ✅
   - `/src/app/[locale]/auth/callback/route.ts` is properly implemented
   - Uses modern `exchangeCodeForSession()` approach
   - Handles errors gracefully with proper logging
   - Sets cookies correctly for both server and client auth modes

2. **Auth Actions Implementation** ✅
   - Magic link: `signInWithMagicLink()` function exists
   - Password reset: `resetPassword()` function exists
   - Both use proper `emailRedirectTo` parameter
   - Email confirmation: `resendConfirmationEmail()` function exists

3. **Confirm Email Route** ✅
   - `/src/app/[locale]/auth/confirm/route.ts` handles email confirmations
   - Uses `verifyOtp()` with proper error handling
   - Sets auth cookies after successful verification

4. **Update Password Page** ✅
   - `/src/app/[locale]/auth/update-password/page.tsx` exists
   - Handles password reset flow completion

### ❌ **Root Cause Issues Identified**

#### **1. Environment Variable Configuration Mismatch** 🚨 CRITICAL

**Problem**: Inconsistent environment variables causing incorrect redirect URLs

**Current State**:
```bash
# .env.local (development) - INCORRECT
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# .env.production (production) - CORRECT  
NEXT_PUBLIC_SITE_URL=https://sheenapps.com

# Missing everywhere
NEXT_PUBLIC_APP_URL=undefined
```

**Impact**: 
- Magic links and reset emails are using localhost URLs in production
- Signup confirmations fail due to missing `NEXT_PUBLIC_APP_URL`

#### **2. Inconsistent URL Usage Across Codebase** ⚠️ MEDIUM

**Found Usage Patterns**:
```typescript
// Pattern 1: NEXT_PUBLIC_SITE_URL (auth-utils.ts, callback routes)
process.env.NEXT_PUBLIC_SITE_URL || fallback

// Pattern 2: NEXT_PUBLIC_APP_URL (auth-actions.ts - signup/resend)  
process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
```

**Impact**: Different auth flows use different URL sources

#### **3. Supabase Dashboard Configuration** ⚠️ MEDIUM

**Need to Verify**:
- Site URL in Supabase Dashboard
- Additional Redirect URLs whitelist
- Whether callback URLs are properly configured

## 🎯 **Fix Plan & Implementation Steps**

### **Phase 1: Environment Variable Standardization** (Priority: CRITICAL)

#### **Step 1.1: Consolidate URL Environment Variables**

**Action**: Standardize on `NEXT_PUBLIC_SITE_URL` and remove `NEXT_PUBLIC_APP_URL` usage

**Files to Update**:
1. `/src/lib/actions/auth-actions.ts` (lines 300, 429)
   ```typescript
   // BEFORE
   emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/${locale}/auth/confirm`
   
   // AFTER  
   emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/${locale}/auth/confirm`
   ```

2. Add missing production environment variable:
   ```bash
   # Add to .env.production if not already there
   NEXT_PUBLIC_SITE_URL=https://sheenapps.com
   ```

#### **Step 1.2: Update Development Environment**

**Action**: Fix local development URL to match current domain

**Update `.env.local`**:
```bash
# BEFORE
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# AFTER (choose one based on your domain)
NEXT_PUBLIC_SITE_URL=https://sheenapps.com  # If using production domain for dev
# OR
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # Keep if using localhost for dev
```

### **Phase 2: Supabase Dashboard Configuration** (Priority: HIGH)

#### **Step 2.1: Verify Site URL Setting**

**Supabase Dashboard → Authentication → URL Configuration**:
```
Site URL: https://sheenapps.com
```

#### **Step 2.2: Whitelist All Callback URLs**

**Add to "Additional Redirect URLs"**:
```
https://sheenapps.com/en/auth/callback
https://sheenapps.com/ar/auth/callback  
https://sheenapps.com/ar-eg/auth/callback
https://sheenapps.com/ar-sa/auth/callback
https://sheenapps.com/ar-ae/auth/callback
https://sheenapps.com/fr/auth/callback
https://sheenapps.com/fr-ma/auth/callback
https://sheenapps.com/es/auth/callback
https://sheenapps.com/de/auth/callback
https://sheenapps.com/en/auth/confirm
https://sheenapps.com/en/auth/update-password
```

**Note**: Replace `sheenapps.com` with your actual domain

#### **Step 2.3: Verify Email Template URLs**

**Supabase Dashboard → Authentication → Email Templates**:
- Check that magic link template uses: `{{ .SiteURL }}/auth/callback?code={{ .Code }}`
- Check that reset password template uses: `{{ .SiteURL }}/auth/callback?code={{ .Code }}`

### **Phase 3: Code Review & Testing** (Priority: MEDIUM)

#### **Step 3.1: Review Current Auth Flow**

**Verify this flow works**:
1. User requests magic link → `signInWithMagicLink()`
2. Email sent with URL: `https://sheenapps.com/{locale}/auth/callback?code=xxx`
3. User clicks link → `/auth/callback/route.ts`
4. Callback calls `exchangeCodeForSession(code)`
5. User redirected to dashboard with valid session

#### **Step 3.2: Review Reset Password Flow**

**Verify this flow works**:
1. User requests reset → `resetPassword()`
2. Email sent with URL: `https://sheenapps.com/{locale}/auth/callback?code=xxx&returnTo=/auth/update-password`
3. User clicks link → `/auth/callback/route.ts`
4. Callback exchanges code → redirects to `/auth/update-password`
5. User updates password via `updatePassword()`

#### **Step 3.3: Test All Scenarios**

**Test Cases**:
- [ ] Magic link login (new session)
- [ ] Password reset email
- [ ] Email confirmation (signup)
- [ ] Resend confirmation email
- [ ] Different locales (en, ar, fr, es, de)
- [ ] Return URL preservation

## 🔧 **Implementation Details**

### **Friend's Advice Applied** ✅

Your friend's checklist is excellent and our codebase already implements most best practices:

1. **✅ Callback URL Generation**: Using `getClientOAuthCallbackUrl()` 
2. **✅ Magic Link Configuration**: Using `emailRedirectTo` parameter
3. **✅ Code Exchange**: Using `exchangeCodeForSession()` in callback route
4. **✅ Error Handling**: Comprehensive error handling and logging

### **What We Need to Fix**

The main issues are **configuration**, not **implementation**:

1. **Environment Variables**: Fix the URL mismatch
2. **Supabase Whitelist**: Ensure all callback URLs are whitelisted
3. **Consistency**: Use same URL env var everywhere

## 📋 **Testing Checklist**

### **After Implementing Fixes**:

1. **Environment Variables**:
   - [ ] `NEXT_PUBLIC_SITE_URL` correctly set in production
   - [ ] All `NEXT_PUBLIC_APP_URL` references updated
   - [ ] Development environment uses correct URLs

2. **Supabase Configuration**:
   - [ ] Site URL matches your domain
   - [ ] All callback URLs whitelisted
   - [ ] Email templates use correct patterns

3. **Functional Testing**:
   - [ ] Magic link arrives with correct domain
   - [ ] Magic link logs user in successfully  
   - [ ] Password reset email arrives with correct domain
   - [ ] Reset link redirects to update password page
   - [ ] Password update works
   - [ ] Email confirmation works for new signups
   - [ ] All locales work (en, ar, fr, es, de)

4. **Edge Cases**:
   - [ ] Return URL preservation across auth flows
   - [ ] Mobile email app compatibility
   - [ ] Expired link handling
   - [ ] Invalid link handling

## 🚨 **Common Gotchas to Watch For**

1. **Cache Issues**: Clear browser cache and restart dev server after env changes
2. **Mobile Email Apps**: Test "Open in browser" if in-app browser fails
3. **URL Encoding**: Ensure returnTo parameters are properly encoded
4. **Locale Handling**: Test all 9 supported locales
5. **Production vs Development**: Ensure prod env vars are correctly deployed

## ⚡ **Quick Win Implementation Order**

**If you want to fix this quickly**:

1. **Fix Environment Variables** (5 minutes)
   - Update `NEXT_PUBLIC_APP_URL` references to `NEXT_PUBLIC_SITE_URL`
   - Verify production environment has correct domain

2. **Update Supabase Dashboard** (5 minutes)
   - Set Site URL to your domain
   - Add all callback URLs to whitelist

3. **Test One Flow** (5 minutes)
   - Send yourself a magic link
   - Verify it uses correct domain and logs you in

4. **Full Testing** (15 minutes)
   - Test password reset
   - Test email confirmation
   - Test different locales

**Total Time**: ~30 minutes for complete fix

## 🎯 **Success Criteria**

✅ **Fix Complete When**:
- Magic links arrive with production domain (not localhost)
- Clicking magic link logs user in successfully
- Password reset emails work end-to-end
- Email confirmation works for new signups
- All auth flows preserve return URLs
- All 9 locales work correctly

The good news is your auth implementation is solid - it's just a configuration issue! 🚀