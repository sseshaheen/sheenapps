# Locale-Aware Email Templates Setup

This guide explains how to configure Supabase email templates to respect user locales.

## The Challenge

When users sign up from different locales (e.g., `/ar-sa/auth/signup`), the confirmation emails should redirect them back to their original locale, not always to `/en/`.

## Solutions

### Solution 1: Store Locale in User Metadata (Implemented)

We store the user's locale during signup in their metadata:

```typescript
// During signup
await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      locale: 'ar-sa' // User's current locale
    },
    emailRedirectTo: `${siteUrl}/${locale}/auth/confirm`
  }
})
```

### Solution 2: Dynamic Email Templates (Recommended for Production)

For a more robust solution, you can use Supabase's email template variables:

#### Email Template Configuration

In your Supabase dashboard, update the **Confirm signup** template:

```handlebars
<h2>Confirm your email</h2>

<p>Follow this link to confirm your email:</p>

{{#if .Data.locale}}
  <p><a href="{{ .SiteURL }}/{{ .Data.locale }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a></p>
{{else}}
  <p><a href="{{ .SiteURL }}/en/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a></p>
{{/if}}
```

This template:
1. Checks if locale exists in user metadata
2. Uses the stored locale if available
3. Falls back to 'en' if not

### Solution 3: Multiple Site URLs (Enterprise)

For enterprise deployments with domain-based locales:

1. Configure multiple Site URLs in Supabase:
   - `https://app.example.com` (English)
   - `https://ar.app.example.com` (Arabic)
   - `https://fr.app.example.com` (French)

2. Use different Supabase projects per locale
3. Each project has its own email templates

## Current Implementation

We currently use Solution 1:
- Locale is stored in user metadata during signup
- Email links use the stored locale
- Resend confirmation respects the current page locale

## Testing Locale-Aware Emails

1. **Sign up from Arabic locale**:
   ```
   Visit: /ar-sa/auth/signup
   Sign up → Email link → /ar-sa/auth/confirm
   ```

2. **Sign up from French locale**:
   ```
   Visit: /fr/auth/signup
   Sign up → Email link → /fr/auth/confirm
   ```

3. **Resend from different locale**:
   ```
   Visit: /es/auth/resend-confirmation
   Resend → Email link → /es/auth/confirm
   ```

## API Implementation

### Signup with Locale
```typescript
await signUp(email, password, {
  name: 'User Name',
  plan: 'free',
  locale: 'ar-sa' // Stored in metadata
})
```

### Resend with Locale
```typescript
await resendConfirmationEmail(email, 'fr-ma')
```

## Edge Cases Handled

1. **Missing Locale**: Falls back to 'en'
2. **Invalid Locale**: Validates against supported locales
3. **URL Parsing**: Extracts locale from pathname
4. **Legacy Users**: Users without locale metadata get 'en'

## Future Enhancements

1. **Locale Detection**: Auto-detect from Accept-Language header
2. **Email Localization**: Send emails in user's language
3. **Timezone Support**: Include timezone with locale
4. **A/B Testing**: Test different email templates per locale

## Security Considerations

1. **Locale Validation**: Always validate locale against whitelist
2. **URL Sanitization**: Prevent locale-based redirects
3. **Metadata Limits**: Supabase limits metadata size
4. **Privacy**: Don't expose locale in public APIs

## Migration Guide

For existing users without locale metadata:

```sql
-- Add default locale to existing users
UPDATE auth.users
SET raw_user_meta_data = 
  jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{locale}',
    '"en"'
  )
WHERE raw_user_meta_data->>'locale' IS NULL;
```

## Troubleshooting

### Email goes to wrong locale
1. Check user metadata in Supabase dashboard
2. Verify locale was passed during signup
3. Check email template configuration

### Locale not detected from URL
1. Verify route structure: `/[locale]/auth/confirm`
2. Check pathname parsing logic
3. Ensure locale is valid

### Resend uses wrong locale
1. Pass explicit locale to resend function
2. Check current page locale detection
3. Verify locale parameter is passed