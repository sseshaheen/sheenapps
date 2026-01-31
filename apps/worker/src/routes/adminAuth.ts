import { createClient } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { adminErrorResponse, correlationIdMiddleware, withCorrelationId } from '../middleware/correlationIdMiddleware';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

interface TokenExchangeRequest {
  supabase_access_token: string;
}

interface AdminClaims {
  sub: string;              // User ID (standard JWT claim)
  userId: string;           // User ID (backward compatibility)
  email: string;            // User email
  role: string;             // Must be 'admin' or 'super_admin'
  is_admin: boolean;        // Must be true
  admin_permissions: string[]; // Array of permissions
  exp: number;              // Expiration timestamp (10-15 minutes)
  iat: number;              // Issued at timestamp
  session_id: string;       // Session identifier for audit trails
}

interface LoginRequest {
  email: string;
  password: string;
}

export default async function adminAuthRoutes(fastify: FastifyInstance) {

  // Add correlation ID middleware to all admin auth routes
  fastify.addHook('preHandler', correlationIdMiddleware);

  /**
   * POST /v1/admin/auth/exchange
   * Exchange Supabase access token for Admin JWT
   */
  fastify.post<{ Body: TokenExchangeRequest }>('/v1/admin/auth/exchange', {
    // No preHandler - this IS the auth endpoint
  }, async (request, reply) => {
    try {
      const { supabase_access_token } = request.body;

      if (!supabase_access_token) {
        return reply.code(400).send(
          adminErrorResponse(request, 'supabase_access_token is required')
        );
      }

      // Initialize Supabase configuration
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        return reply.code(500).send(
          adminErrorResponse(request, 'Supabase configuration missing')
        );
      }

      // Step 1: Verify Supabase access token
      let user: { id: string; email: string };

      try {

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        // Verify the Supabase access token and get user info
        const { data: userData, error: userError } = await supabase.auth.getUser(supabase_access_token);

        if (userError || !userData.user) {
          return reply.code(401).send(
            adminErrorResponse(request, 'Invalid Supabase access token', userError?.message)
          );
        }

        // Check if user has MFA enabled (if required)
        // Note: This depends on your Supabase MFA setup
        const { data: mfaData } = await supabase.auth.mfa.listFactors();
        if (process.env.REQUIRE_MFA === 'true' && (!mfaData?.all || mfaData.all.length === 0)) {
          return reply.code(403).send({
            ...adminErrorResponse(request, 'MFA enrollment required for admin access'),
            code: 'MFA_REQUIRED'
          });
        }

        user = {
          id: userData.user.id,
          email: userData.user.email || ''
        };

      } catch (supabaseError) {
        await loggingService.logCriticalError('supabase_token_verification_failed', supabaseError as Error, {
          ip: request.ip,
          user_agent: request.headers['user-agent']
        });

        return reply.code(401).send(
          adminErrorResponse(request, 'Token verification failed')
        );
      }

      // Step 3: Get full user data to check admin privileges
      let adminData;

      // Create admin client with service role key to get full user data
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceRoleKey) {
        // Fallback if service role key not available
        adminData = {
          email: user.email,
          is_admin: true,
          admin_permissions: ['admin:*'],
          admin_role: 'admin'
        };
      } else {
        const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

        // Get the full user data with app_metadata
        const { data: fullUserData, error: userFetchError } = await adminSupabase.auth.admin.getUserById(user.id);

        if (userFetchError || !fullUserData.user) {
          await loggingService.logServerEvent(
            'error',
            'warn',
            'Failed to fetch user metadata',
            {
              user_id: user.id,
              email: user.email,
              error: userFetchError?.message
            }
          );

          // Fallback to basic admin data
          adminData = {
            email: user.email,
            is_admin: true,
            admin_permissions: ['admin:*'],
            admin_role: 'admin'
          };
        } else {
          // Check if user has admin privileges in their metadata
          const isAdmin = fullUserData.user.app_metadata?.is_admin === true ||
                         fullUserData.user.app_metadata?.role === 'admin' ||
                         fullUserData.user.app_metadata?.role === 'super_admin';

          if (!isAdmin) {
            await loggingService.logServerEvent(
              'error',
              'warn',
              'Non-admin user attempted admin token exchange',
              {
                user_id: user.id,
                email: user.email,
                ip: request.ip,
                user_agent: request.headers['user-agent'],
                app_metadata: fullUserData.user.app_metadata
              }
            );

            return reply.code(403).send({
              ...adminErrorResponse(request, 'Admin privileges required'),
              code: 'INSUFFICIENT_PRIVILEGES'
            });
          }

          // Extract admin info from Supabase user metadata
          adminData = {
            email: user.email,
            is_admin: true,
            admin_permissions: fullUserData.user.app_metadata?.admin_permissions || ['admin:*'],
            admin_role: fullUserData.user.app_metadata?.role || 'admin'
          };
        }
      }

      // Step 4: Generate session ID and mint Admin JWT
      const sessionId = `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = Math.floor(Date.now() / 1000);
      const expiration = now + (12 * 60); // 12 minutes (shorter than typical 15m to allow refresh buffer)

      const adminJWT: AdminClaims = {
        sub: user.id,
        userId: user.id, // Backward compatibility
        email: user.email,
        role: adminData.admin_role || 'admin',
        is_admin: true,
        admin_permissions: adminData.admin_permissions || [],
        exp: expiration,
        iat: now,
        session_id: sessionId
      };

      const token = jwt.sign(adminJWT, process.env.ADMIN_JWT_SECRET!, {
        algorithm: 'HS256',
        issuer: 'sheen-admin',
        audience: 'sheen-admin-panel'
      });

      // Step 5: Log successful admin authentication
      await loggingService.logServerEvent(
        'routing',
        'info',
        'Admin JWT exchange successful',
        {
          action: 'admin.auth.exchange',
          user_id: user.id,
          email: user.email,
          session_id: sessionId,
          permissions: adminData.admin_permissions,
          ip: request.ip,
          user_agent: request.headers['user-agent'],
          expires_at: new Date(expiration * 1000).toISOString()
        }
      );

      // Step 6: Store session metadata in database for audit/revocation
      try {
        await pool!.query(`
          INSERT INTO admin_sessions (
            session_id,
            user_id,
            ip_address,
            user_agent,
            permissions,
            expires_at,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (session_id) DO UPDATE SET
            last_used_at = NOW()
        `, [
          sessionId,
          user.id,
          request.ip,
          request.headers['user-agent'] || 'unknown',
          JSON.stringify(adminData.admin_permissions),
          new Date(expiration * 1000)
        ]);
      } catch (sessionError) {
        // Log but don't fail the request - session tracking is for audit only
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Failed to store admin session metadata',
          {
            session_id: sessionId,
            user_id: user.id,
            error: sessionError
          }
        );
      }

      return reply.send(
        withCorrelationId({
          success: true,
          admin_jwt: token,
          expires_at: new Date(expiration * 1000).toISOString(),
          expires_in: 12 * 60, // seconds
          session_id: sessionId,
          permissions: adminData.admin_permissions,
          user: {
            id: user.id,
            email: user.email,
            role: adminData.admin_role || 'admin'
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_token_exchange_error', error as Error, {
        ip: request.ip,
        user_agent: request.headers['user-agent']
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Internal server error during token exchange')
      );
    }
  });

  /**
   * POST /v1/admin/auth/login
   * Direct login with email and password for admin users
   */
  fastify.post<{ Body: LoginRequest }>('/v1/admin/auth/login', async (request, reply) => {
    try {
      const { email, password } = request.body;

      // Debug: Log received credentials
      // console.log('Login attempt received:', {
      //   email,
      //   passwordLength: password?.length,
      //   passwordFirstChar: password?.[0],
      //   passwordLastChar: password?.[password.length - 1],
      //   fullPassword: password // Remove this in production!
      // });

      if (!email || !password) {
        return reply.code(400).send(
          adminErrorResponse(request, 'Email and password are required')
        );
      }

      // Initialize Supabase client - MATCH EXACTLY what works in test script
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        return reply.code(500).send(
          adminErrorResponse(request, 'Supabase configuration missing')
        );
      }

      // Create client with EXACT same options as test script
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      // Normalize email like test script does
      const normalizedEmail = email.trim().toLowerCase();

      // Debug: Log what we're sending to Supabase
      // console.log('Sending to Supabase:', {
      //   url: supabaseUrl,
      //   anonKeyPrefix: supabaseAnonKey?.substring(0, 20) + '...',
      //   email: normalizedEmail,
      //   originalEmail: email,
      //   passwordSending: password
      // });

      // Attempt to sign in with normalized email
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      // Debug: Log auth response
      if (authError) {
        console.log('Supabase auth error details:', {
          message: authError.message,
          status: authError.status,
          code: authError.code,
          name: authError.name,
          fullError: JSON.stringify(authError, null, 2)
        });
      } else {
        // console.log('Supabase auth success - User data:', {
        //   id: authData.user?.id,
        //   email: authData.user?.email,
        //   app_metadata: authData.user?.app_metadata,
        //   role: authData.user?.role,
        //   aud: authData.user?.aud
        // });
      }

      if (authError || !authData.user) {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Failed admin login attempt',
          {
            email,
            ip: request.ip,
            user_agent: request.headers['user-agent'],
            error: authError?.message
          }
        );

        return reply.code(401).send(
          adminErrorResponse(request, 'Invalid credentials')
        );
      }

      const user = authData.user;

      // Verify admin privileges - app_metadata is NOT returned by signInWithPassword
      // We need to fetch it using service role key
      let adminData;
      let isAdmin = false;

      // Get full user data with app_metadata using service role key
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey) {
        const adminSupabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: fullUserData, error: userFetchError } = await adminSupabase.auth.admin.getUserById(user.id);

        if (!userFetchError && fullUserData.user) {
          // console.log('Fetched full user data with app_metadata:', {
          //   id: fullUserData.user.id,
          //   email: fullUserData.user.email,
          //   app_metadata: fullUserData.user.app_metadata
          // });

          // Check admin privileges from app_metadata
          isAdmin = fullUserData.user.app_metadata?.is_admin === true ||
                   fullUserData.user.app_metadata?.role === 'admin' ||
                   fullUserData.user.app_metadata?.role === 'super_admin';

          if (isAdmin) {
            adminData = {
              email: user.email,
              is_admin: true,
              admin_permissions: fullUserData.user.app_metadata?.admin_permissions || ['admin:*'],
              admin_role: fullUserData.user.app_metadata?.role || 'admin'
            };
          }
        }
      }

      if (!isAdmin) {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Non-admin user attempted admin login',
          {
            user_id: user.id,
            email: user.email,
            ip: request.ip,
            user_agent: request.headers['user-agent'],
            app_metadata: 'Not available from signInWithPassword - fetching separately...'
          }
        );

        return reply.code(403).send({
          ...adminErrorResponse(request, 'Admin privileges required'),
          code: 'INSUFFICIENT_PRIVILEGES'
        });
      }

      // If we couldn't verify admin status, set default
      if (!adminData) {
        adminData = {
          email: user.email,
          is_admin: false,
          admin_permissions: [],
          admin_role: 'user'
        };
      }

      // Generate session ID and mint Admin JWT
      const sessionId = `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = Math.floor(Date.now() / 1000);
      const expiration = now + (12 * 60); // 12 minutes

      const adminJWT: AdminClaims = {
        sub: user.id,
        userId: user.id,
        email: user.email || '',
        role: adminData.admin_role || 'admin',
        is_admin: true,
        admin_permissions: adminData.admin_permissions || [],
        exp: expiration,
        iat: now,
        session_id: sessionId
      };

      // Sign the JWT with admin secret
      const adminJwtSecret = process.env.ADMIN_JWT_SECRET;
      if (!adminJwtSecret) {
        return reply.code(500).send(
          adminErrorResponse(request, 'Admin JWT secret not configured')
        );
      }

      const token = jwt.sign(adminJWT, adminJwtSecret, {
        algorithm: 'HS256',
        issuer: 'sheen-admin',
        audience: 'sheen-admin-panel'
      });

      // Admin login successful - no need to log as it's not an error

      // Store session metadata
      try {
        await pool!.query(`
          INSERT INTO admin_sessions (
            session_id, user_id, ip_address, user_agent, permissions, expires_at
          ) VALUES ($1, $2, $3::inet, $4, $5::jsonb, $6)
          ON CONFLICT (session_id) DO UPDATE SET
            last_used_at = NOW()
        `, [
          sessionId,
          user.id,
          request.ip,
          request.headers['user-agent'] || 'unknown',
          JSON.stringify(adminData.admin_permissions),
          new Date(expiration * 1000)
        ]);
      } catch (sessionError) {
        // Log but don't fail the request
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Failed to store admin session metadata',
          {
            session_id: sessionId,
            user_id: user.id,
            error: sessionError
          }
        );
      }

      return reply.send(
        withCorrelationId({
          success: true,
          admin_jwt: token,
          expires_at: new Date(expiration * 1000).toISOString(),
          expires_in: 12 * 60, // seconds
          session_id: sessionId,
          permissions: adminData.admin_permissions,
          user: {
            id: user.id,
            email: user.email || '',
            role: adminData.admin_role || 'admin'
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_login_error', error as Error, {
        email: request.body.email,
        ip: request.ip,
        user_agent: request.headers['user-agent']
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Internal server error during login')
      );
    }
  });

  /**
   * POST /v1/admin/auth/refresh
   * Refresh an expiring admin JWT token
   * 
   * Best practices implemented:
   * - Only refreshes tokens that are still valid but expiring soon
   * - Updates session last_used_at for tracking
   * - Maintains same permissions and session_id
   */
  fastify.post('/v1/admin/auth/refresh', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send(
          adminErrorResponse(request, 'Bearer token required')
        );
      }

      const token = authHeader.substring(7);
      const jwtSecret = process.env.ADMIN_JWT_SECRET;
      
      if (!jwtSecret) {
        return reply.code(500).send(
          adminErrorResponse(request, 'JWT secret not configured')
        );
      }

      let decoded: AdminClaims;
      
      try {
        // Verify current token is still valid
        decoded = jwt.verify(token, jwtSecret, {
          algorithms: ['HS256'],
          issuer: 'sheen-admin',
          audience: 'sheen-admin-panel'
        }) as AdminClaims;
      } catch (jwtError: any) {
        // Special handling for expired tokens within grace period (2 minutes)
        if (jwtError.name === 'TokenExpiredError') {
          try {
            // Decode without verification to check if within grace period
            const unverified = jwt.decode(token) as AdminClaims;
            const expiredAt = unverified.exp * 1000;
            const now = Date.now();
            const gracePeriodMs = 2 * 60 * 1000; // 2 minutes
            
            if (now - expiredAt > gracePeriodMs) {
              return reply.code(401).send({
                ...adminErrorResponse(request, 'Token expired beyond grace period'),
                code: 'TOKEN_EXPIRED'
              });
            }
            
            // Within grace period, allow refresh
            decoded = unverified;
          } catch {
            return reply.code(401).send(
              adminErrorResponse(request, 'Invalid token')
            );
          }
        } else {
          return reply.code(401).send(
            adminErrorResponse(request, 'Invalid or expired token')
          );
        }
      }

      // Check if session is still valid in database
      const sessionResult = await pool?.query(`
        SELECT 
          session_id, 
          expires_at,
          is_revoked
        FROM admin_sessions 
        WHERE session_id = $1
      `, [decoded.session_id]);

      if (!sessionResult || sessionResult.rows.length === 0) {
        return reply.code(401).send({
          ...adminErrorResponse(request, 'Session not found'),
          code: 'SESSION_NOT_FOUND'
        });
      }

      const session = sessionResult.rows[0];
      
      if (session.is_revoked) {
        return reply.code(401).send({
          ...adminErrorResponse(request, 'Session has been revoked'),
          code: 'SESSION_REVOKED'
        });
      }

      // Generate new token with refreshed expiration
      const now = Math.floor(Date.now() / 1000);
      const newExpiration = now + (12 * 60); // 12 minutes

      const refreshedJWT: AdminClaims = {
        ...decoded, // Keep all existing claims
        exp: newExpiration,
        iat: now
      };

      const newToken = jwt.sign(refreshedJWT, jwtSecret, {
        algorithm: 'HS256'
        // issuer and audience are already in the payload as 'iss' and 'aud', don't duplicate
      });

      // Update session tracking
      await pool?.query(`
        UPDATE admin_sessions 
        SET 
          last_used_at = NOW(),
          expires_at = $2
        WHERE session_id = $1
      `, [decoded.session_id, new Date(newExpiration * 1000)]);

      await loggingService.logServerEvent(
        'routing',
        'info',
        'Admin JWT refreshed successfully',
        {
          action: 'admin.auth.refresh',
          session_id: decoded.session_id,
          user_id: decoded.userId,
          old_expiry: new Date(decoded.exp * 1000).toISOString(),
          new_expiry: new Date(newExpiration * 1000).toISOString()
        }
      );

      return reply.send(
        withCorrelationId({
          success: true,
          admin_jwt: newToken,
          expires_at: new Date(newExpiration * 1000).toISOString(),
          expires_in: 12 * 60, // seconds
          session_id: decoded.session_id
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_token_refresh_error', error as Error, {
        ip: request.ip,
        user_agent: request.headers['user-agent']
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Internal server error during token refresh')
      );
    }
  });
}
