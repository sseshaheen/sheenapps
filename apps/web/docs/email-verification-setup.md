# Email Verification Setup Guide

This guide covers the robust email verification implementation in SheenApps.

## Overview

Our email verification system supports automatic login after email confirmation, handles various error cases, and works seamlessly with both server-side auth and traditional Supabase auth.

## Key Features

1. **Automatic Login**: Users are automatically logged in after clicking the verification link
2. **Error Handling**: Comprehensive error messages for expired links, invalid tokens, etc.
3. **Locale Support**: Stores and respects user's locale from signup
4. **Security**: Prevents open redirect vulnerabilities
5. **Server Auth Compatible**: Works with our server-side auth implementation
6. **Multi-locale Support**: Email links use the locale from user's signup

## Implementation Details

### 1. Email Confirmation Route

Located at `/src/app/[locale]/auth/confirm/route.ts`, this route handles:
- Token validation
- OTP verification
- Session creation
- Cookie management
- Error handling
- Locale detection from URL path

### 2. Helper Functions

The `/src/lib/email-confirmation-helper.ts` provides utilities for:
- URL generation
- Parameter validation
- Error handling
- Redirect URL sanitization

### 3. Login Form Integration

The login form displays error messages from failed verifications:
- `verification_failed`: Token validation failed
- `confirmation_error`: Unexpected error during confirmation
- `invalid_confirmation_link`: Missing or invalid parameters

## Setup Instructions

### 1. Update Supabase Email Templates

In your Supabase dashboard, update the following email templates:

#### Confirm Signup Template
Replace:
```
{{ .ConfirmationURL }}
```

With:
```
{{ .SiteURL }}/[locale]/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

**Note**: Replace `[locale]` with your default locale (e.g., `en`). The system will automatically use the user's signup locale when available.

#### Invite User Template
Replace:
```
{{ .ConfirmationURL }}
```

With:
```
{{ .SiteURL }}/en/auth/confirm?token_hash={{ .TokenHash }}&type=invite
```

#### Magic Link Template
Replace:
```
{{ .ConfirmationURL }}
```

With:
```
{{ .SiteURL }}/en/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
```

#### Change Email Address Template
Replace:
```
{{ .ConfirmationURL }}
```

With:
```
{{ .SiteURL }}/en/auth/confirm?token_hash={{ .TokenHash }}&type=email_change
```

#### Reset Password Template
Replace:
```
{{ .ConfirmationURL }}
```

With:
```
{{ .SiteURL }}/en/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password
```

### 2. Configure Site URL

Ensure your Site URL is correctly set in:
1. Supabase Dashboard → Authentication → URL Configuration
2. `.env.local`: `NEXT_PUBLIC_SITE_URL=https://yourdomain.com`

### 3. Set Redirect URLs

Add the following to your allowed Redirect URLs in Supabase:
- `http://localhost:3000/**`
- `https://yourdomain.com/**`

## Testing

### Local Testing

1. Use Supabase CLI's Inbucket to capture emails:
   ```bash
   supabase status # Get Inbucket URL
   ```

2. Test signup flow:
   - Sign up with a new email
   - Check Inbucket for the confirmation email
   - Click the link
   - Verify automatic login and redirect

### Error Case Testing

Test these scenarios:
1. **Expired Link**: Wait for token to expire (default 1 hour)
2. **Invalid Token**: Modify the token_hash parameter
3. **Missing Parameters**: Remove token_hash or type from URL
4. **Already Confirmed**: Click the same link twice

## Troubleshooting

### Common Issues

1. **"Invalid confirmation link" error**
   - Check email template configuration
   - Verify Site URL matches your domain
   - Ensure all parameters are present in URL

2. **Not automatically logged in**
   - Check if server auth is enabled
   - Verify cookie settings in browser
   - Check for CORS issues

3. **Redirect to wrong page**
   - Verify locale detection
   - Check redirect URL sanitization
   - Ensure dashboard route exists

### Debug Mode

Enable debug logging by setting:
```typescript
logger.info('Email verification details:', {
  token_hash: token_hash?.substring(0, 10) + '...',
  type,
  locale,
  next
})
```

## Security Considerations

1. **Token Validation**: Always validate tokens server-side
2. **Redirect Sanitization**: Only allow relative redirects
3. **Error Messages**: Don't reveal whether email exists
4. **HTTPS Only**: Use secure cookies in production
5. **Rate Limiting**: Consider adding rate limits for confirmation attempts

## Best Practices

1. **User Experience**
   - Show clear success/error messages
   - Provide "Resend confirmation" option
   - Handle edge cases gracefully

2. **Monitoring**
   - Track confirmation success rates
   - Monitor for repeated failures
   - Alert on unusual patterns

3. **Maintenance**
   - Regularly test email flows
   - Keep error messages updated
   - Document any customizations

## Code References

- Email Confirmation Route: `/src/app/[locale]/auth/confirm/route.ts`
- Helper Functions: `/src/lib/email-confirmation-helper.ts`
- Login Form: `/src/components/auth/login-form.tsx`
- Auth Actions: `/src/lib/actions/auth-actions.ts`

## Future Enhancements

1. **Email Preview**: Add email template preview in development
2. **Custom Templates**: Support for custom email templates
3. **Analytics**: Track email open and click rates
4. **A/B Testing**: Test different email formats
5. **Multi-language**: Localized email templates