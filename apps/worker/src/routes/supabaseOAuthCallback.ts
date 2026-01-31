import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseManagementAPI } from '../services/supabaseManagementAPI';
import { SupabaseConnectionService } from '../services/supabaseConnectionService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { validateRedirectUrl } from '../utils/urlValidation';

/**
 * Supabase OAuth Callback Handler
 * Handles the OAuth callback from Supabase and securely redirects users
 * SECURITY: Implements URL validation to prevent open redirect attacks
 */

interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export async function supabaseOAuthCallbackRoutes(fastify: FastifyInstance) {
  const managementAPI = SupabaseManagementAPI.getInstance();
  const connectionService = SupabaseConnectionService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  /**
   * GET /connect/supabase/callback
   * OAuth callback handler with secure redirect validation
   */
  fastify.get<{ Querystring: OAuthCallbackQuery }>(
    '/connect/supabase/callback',
    async (request: FastifyRequest<{ Querystring: OAuthCallbackQuery }>, reply: FastifyReply) => {
      const { code, state, error, error_description } = request.query;
      
      // Handle OAuth errors from Supabase
      if (error) {
        await loggingService.logServerEvent(
          'error',
          'error',
          'OAuth callback error from Supabase',
          {
            error,
            error_description,
            userAgent: request.headers['user-agent'],
            ip: request.ip
          }
        );

        return reply.code(400).send({
          error: 'OAuth authorization failed',
          details: error_description || error,
          canRetry: error === 'access_denied' ? false : true
        });
      }

      // Validate required parameters
      if (!code || !state) {
        await loggingService.logCriticalError(
          'oauth_callback_missing_params',
          new Error('OAuth callback missing required parameters'),
          {
            hasCode: !!code,
            hasState: !!state,
            userAgent: request.headers['user-agent'],
            ip: request.ip
          }
        );

        return reply.code(400).send({
          error: 'Invalid callback parameters',
          details: 'Missing authorization code or state'
        });
      }

      try {
        // Validate and parse OAuth state
        const stateValidation = managementAPI.validateOAuthState(state);
        
        if (!stateValidation.valid || !stateValidation.data) {
          await loggingService.logCriticalError(
            'oauth_state_validation_failed',
            new Error(`OAuth state validation failed: ${stateValidation.error}`),
            {
              hasState: !!state,
              validationError: stateValidation.error,
              userAgent: request.headers['user-agent'],
              ip: request.ip
            }
          );

          return reply.code(403).send({
            error: 'Invalid or expired OAuth state',
            details: stateValidation.error,
            canRetry: true
          });
        }

        const { userId, projectId, nextUrl } = stateValidation.data;

        // Validate redirect URL for security (CRITICAL: Prevents open redirects)
        const urlValidation = await validateRedirectUrl(
          nextUrl,
          'oauth_callback',
          userId,
          projectId
        );

        if (!urlValidation.valid) {
          await loggingService.logCriticalError(
            'oauth_redirect_blocked',
            new Error(`Open redirect attempt blocked: ${nextUrl}`),
            {
              originalUrl: nextUrl,
              safeUrl: urlValidation.safeUrl,
              reason: urlValidation.reason,
              userId,
              projectId,
              userAgent: request.headers['user-agent'],
              ip: request.ip
            }
          );
        }

        // Use validated safe URL for redirect
        const redirectUrl = urlValidation.safeUrl;

        // Create success page with auto-redirect and security info
        const successPage = generateSuccessPage({
          redirectUrl,
          userId,
          projectId,
          originalUrl: nextUrl,
          wasBlocked: !urlValidation.valid,
          blockReason: urlValidation.reason
        });

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'OAuth callback processed successfully',
          {
            userId,
            projectId,
            redirectUrl,
            originalUrl: nextUrl,
            urlValidated: urlValidation.valid,
            userAgent: request.headers['user-agent'],
            ip: request.ip
          }
        );

        // Return success page with meta refresh (safer than direct redirect)
        reply
          .type('text/html')
          .code(200)
          .send(successPage);

      } catch (error) {
        await loggingService.logCriticalError(
          'oauth_callback_processing_error',
          error as Error,
          {
            hasCode: !!code,
            hasState: !!state,
            userAgent: request.headers['user-agent'],
            ip: request.ip
          }
        );

        const errorPage = generateErrorPage({
          error: 'OAuth callback processing failed',
          details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
          canRetry: true
        });

        reply
          .type('text/html')
          .code(500)
          .send(errorPage);
      }
    }
  );

  /**
   * Generate success page with secure auto-redirect
   */
  function generateSuccessPage(options: {
    redirectUrl: string;
    userId: string;
    projectId: string;
    originalUrl: string;
    wasBlocked: boolean;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    blockReason?: string | undefined;
  }): string {
    const { redirectUrl, wasBlocked, blockReason } = options;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Supabase Connection Successful</title>
  <meta http-equiv="refresh" content="3;url=${redirectUrl}">
  <style>
    body { 
      font-family: system-ui, sans-serif; 
      max-width: 600px; 
      margin: 100px auto; 
      padding: 20px; 
      text-align: center;
      background: #f9fafb;
    }
    .success { 
      color: #059669; 
      background: #ecfdf5; 
      padding: 20px; 
      border-radius: 8px; 
      border: 1px solid #a7f3d0;
      margin-bottom: 20px;
    }
    .warning {
      color: #d97706;
      background: #fffbeb;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid #fed7aa;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .redirect-info {
      color: #6b7280;
      font-size: 14px;
      margin-top: 15px;
    }
    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid #f3f4f6;
      border-radius: 50%;
      border-top-color: #059669;
      animation: spin 1s ease-in-out infinite;
      margin-right: 10px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="success">
    <h1>✅ Supabase Connected Successfully</h1>
    <p>Your Supabase account has been connected to your project.</p>
  </div>
  
  ${wasBlocked ? `
  <div class="warning">
    <h3>🛡️ Security Protection Active</h3>
    <p>For your security, we blocked a potentially unsafe redirect and are sending you to a safe location.</p>
    ${blockReason ? `<p><strong>Reason:</strong> ${blockReason}</p>` : ''}
  </div>
  ` : ''}
  
  <div class="redirect-info">
    <div class="spinner"></div>
    Redirecting you to your dashboard in 3 seconds...
    <br><br>
    <a href="${redirectUrl}">Click here if you're not redirected automatically</a>
  </div>
  
  <script>
    // Fallback redirect using JavaScript (in case meta refresh fails)
    setTimeout(() => {
      window.location.href = '${redirectUrl}';
    }, 3000);
  </script>
</body>
</html>`;
  }

  /**
   * Generate error page
   */
  function generateErrorPage(options: {
    error: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    details?: string | undefined;
    canRetry: boolean;
  }): string {
    const { error, details, canRetry } = options;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Supabase Connection Error</title>
  <style>
    body { 
      font-family: system-ui, sans-serif; 
      max-width: 600px; 
      margin: 100px auto; 
      padding: 20px; 
      text-align: center;
      background: #f9fafb;
    }
    .error { 
      color: #dc2626; 
      background: #fef2f2; 
      padding: 20px; 
      border-radius: 8px; 
      border: 1px solid #fecaca;
      margin-bottom: 20px;
    }
    .details {
      color: #6b7280;
      background: #f3f4f6;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 12px;
      text-align: left;
      margin-top: 15px;
    }
    .actions {
      margin-top: 20px;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 5px;
    }
  </style>
</head>
<body>
  <div class="error">
    <h1>❌ Connection Error</h1>
    <p>${error}</p>
    
    ${details ? `<div class="details">${details}</div>` : ''}
  </div>
  
  <div class="actions">
    <a href="/" class="btn">Return to Dashboard</a>
    ${canRetry ? '<a href="/projects" class="btn">Try Again</a>' : ''}
  </div>
</body>
</html>`;
  }
}