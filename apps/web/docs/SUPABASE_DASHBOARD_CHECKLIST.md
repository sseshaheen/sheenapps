# Supabase Dashboard Configuration Checklist

**Date**: August 2025  
**Purpose**: Ensure Supabase is configured correctly for magic links and password reset

## 🎯 **Step 1: Authentication URL Configuration**

Go to **Supabase Dashboard → Authentication → URL Configuration**

### ✅ **Site URL** (should be)
```
https://sheenapps.com
```

### ✅ **Additional Redirect URLs** (add these if not present)

**Core Callback URLs**:
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
```

**Email Confirmation URLs**:
```
https://sheenapps.com/en/auth/confirm
https://sheenapps.com/ar/auth/confirm
https://sheenapps.com/ar-eg/auth/confirm
https://sheenapps.com/ar-sa/auth/confirm
https://sheenapps.com/ar-ae/auth/confirm
https://sheenapps.com/fr/auth/confirm
https://sheenapps.com/fr-ma/auth/confirm
https://sheenapps.com/es/auth/confirm
https://sheenapps.com/de/auth/confirm
```

**Password Update URLs**:
```
https://sheenapps.com/en/auth/update-password
https://sheenapps.com/ar/auth/update-password
https://sheenapps.com/ar-eg/auth/update-password
https://sheenapps.com/ar-sa/auth/update-password
https://sheenapps.com/ar-ae/auth/update-password
https://sheenapps.com/fr/auth/update-password
https://sheenapps.com/fr-ma/auth/update-password
https://sheenapps.com/es/auth/update-password
https://sheenapps.com/de/auth/update-password
```

**Development URLs (if needed)**:
```
http://localhost:3000/en/auth/callback
http://localhost:3000/en/auth/confirm
http://localhost:3000/en/auth/update-password
```

## 🎯 **Step 2: Email Templates**

Go to **Supabase Dashboard → Authentication → Email Templates**

### ✅ **Magic Link Template**
Should contain:
```html
{{ .SiteURL }}/auth/callback?code={{ .Code }}
```

### ✅ **Reset Password Template**
Should contain:
```html
{{ .SiteURL }}/auth/callback?code={{ .Code }}
```

### ✅ **Confirm Email Template**
Should contain:
```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

## 🎯 **Step 3: Rate Limiting**

Go to **Supabase Dashboard → Authentication → Settings**

### ✅ **Email Rate Limits** (recommended)
```
Email sending frequency: 60 seconds
Max emails per hour: 3
```

## 🎯 **Step 4: Security Settings**

Go to **Supabase Dashboard → Authentication → Settings**

### ✅ **Email Confirmation** 
```
☑ Enable email confirmations
☑ Enable email change confirmations
```

### ✅ **Password Requirements**
```
Minimum password length: 8 characters
☑ Require uppercase letters
☑ Require lowercase letters  
☑ Require numbers
☑ Require special characters
```

## 🔍 **Verification Steps After Configuration**

### **Step A: Check Email Template URLs**
1. Send yourself a magic link from your app
2. Check the email - the link should start with `https://sheenapps.com`
3. **NOT** `http://localhost:3000`

### **Step B: Test Magic Link Flow**
1. Request magic link from `/auth/login`
2. Check email - should arrive within 1 minute
3. Click link - should redirect to `https://sheenapps.com/.../auth/callback`
4. Should automatically log you in and redirect to dashboard

### **Step C: Test Password Reset Flow**  
1. Request password reset from `/auth/login`
2. Check email - should arrive within 1 minute
3. Click link - should redirect to `https://sheenapps.com/.../auth/callback`
4. Should then redirect to `/auth/update-password`
5. Update password - should succeed and log you in

### **Step D: Test Email Confirmation Flow**
1. Create new account (signup)
2. Check email - confirmation link should arrive
3. Click confirmation link
4. Should verify account and log you in

## 🚨 **Common Issues & Solutions**

### **Issue**: Magic link points to localhost
**Solution**: Check Site URL in Supabase dashboard

### **Issue**: "URL not whitelisted" error
**Solution**: Add the exact callback URL to Additional Redirect URLs

### **Issue**: Email doesn't arrive
**Solution**: 
- Check email rate limits
- Check spam folder
- Verify SMTP settings in Supabase

### **Issue**: Link opens but doesn't log user in  
**Solution**: 
- Check callback route is working (`/auth/callback/route.ts`)
- Verify `exchangeCodeForSession` is being called
- Check browser network tab for errors

### **Issue**: Works in development but not production
**Solution**:
- Verify production environment variables are set correctly
- Check Vercel environment variables match
- Ensure Supabase project is production project (not development)

## ⚡ **Quick Test Commands**

If you have access to your app logs, you can check:

```bash
# Check what URL is being generated for magic links
# Look in your server logs when sending magic link

# Check environment variables in production
console.log('NEXT_PUBLIC_SITE_URL:', process.env.NEXT_PUBLIC_SITE_URL)

# Check what callback URL is generated
console.log('Callback URL:', getClientOAuthCallbackUrl('en'))
```

## ✅ **Success Checklist**

- [ ] Site URL set to `https://sheenapps.com`
- [ ] All callback URLs added to Additional Redirect URLs  
- [ ] Email templates use `{{ .SiteURL }}` pattern
- [ ] Magic link email contains production domain
- [ ] Magic link successfully logs user in
- [ ] Password reset email contains production domain  
- [ ] Password reset flow works end-to-end
- [ ] Email confirmation works for new signups
- [ ] All locales work correctly (test at least 2-3)
- [ ] Return URL preservation works
- [ ] No console errors in browser network tab

## 📞 **What to Report Back**

Please test and let me know:
1. ✅/❌ Magic link email - what domain does the link show?
2. ✅/❌ Does clicking the magic link log you in?
3. ✅/❌ Password reset email - what domain does the link show?  
4. ✅/❌ Does the password reset flow work completely?
5. 🔍 Any error messages you see in browser console
6. 🔍 Any errors in your app logs/Vercel function logs

Once these are confirmed working, we'll know the configuration is correct! 🚀