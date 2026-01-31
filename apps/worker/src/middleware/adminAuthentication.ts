import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { ServerLoggingService } from '../services/serverLoggingService';

/**
 * Admin JWT Authentication Middleware
 * Validates admin JWT claims and permissions for secure admin operations
 * 
 * Security Features:
 * - JWT-based authentication with admin role validation
 * - Granular permission checking
 * - Mandatory reason headers for sensitive operations
 * - Comprehensive audit logging
 * - Fail-secure by default
 */

export interface AdminClaims {
  sub: string;           // User ID (standard JWT claim)
  userId: string;        // User ID (backward compatibility)
  email: string;         // User email
  role: string;          // User role (must be 'admin')
  is_admin: boolean;     // Admin flag (must be true)
  admin_permissions: string[];  // Array of admin permissions
  exp: number;           // Expiration timestamp
  iat: number;           // Issued at timestamp
  session_id?: string;   // Session identifier (for new JWTs)
}

export interface AdminRequest extends FastifyRequest {
  adminClaims: AdminClaims;
  headers: {
    'authorization'?: string;      // New: Authorization: Bearer <admin_jwt>
    'x-sheen-claims'?: string;     // Legacy: base64 encoded claims (grace period)
    'x-admin-reason'?: string;
    'x-correlation-id'?: string;
    'x-sheen-locale'?: string;
  };
}

export interface AdminMiddlewareOptions {
  permissions?: string[];    // Required permissions
  requireReason?: boolean;   // Whether admin reason is required
  logActions?: boolean;      // Whether to log admin actions
}

const loggingService = ServerLoggingService.getInstance();

/**
 * Main admin authentication middleware
 */
export function requireAdminAuth(options: AdminMiddlewareOptions = {}) {
  const {
    permissions = [],
    requireReason = false,
    logActions = true
  } = options;

  return async function adminAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Extract and validate JWT claims
      const claims = extractAdminClaimsFromRequest(request as AdminRequest);
      
      // Validate admin role and status
      if (!isValidAdmin(claims)) {
        if (logActions) {
          await loggingService.logServerEvent(
            'error',
            'warn',
            'Admin authentication failed - invalid admin status',
            {
              userId: claims.userId || claims.sub,
              email: claims.email,
              role: claims.role,
              is_admin: claims.is_admin,
              path: request.url,
              method: request.method,
              ip: request.ip
            }
          );
        }
        
        return reply.code(403).send({
          error: 'Access denied',
          code: 'INSUFFICIENT_PRIVILEGES',
          message: 'Admin access required',
          timestamp: new Date().toISOString()
        });
      }
      
      // Check required permissions
      if (permissions.length > 0 && !hasRequiredPermissions(claims, permissions)) {
        if (logActions) {
          await loggingService.logServerEvent(
            'error',
            'warn',
            'Admin permission denied',
            {
              userId: claims.userId || claims.sub,
              requiredPermissions: permissions,
              userPermissions: claims.admin_permissions,
              path: request.url,
              method: request.method
            }
          );
        }
        
        return reply.code(403).send({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required_permissions: permissions,
          user_permissions: claims.admin_permissions,
          timestamp: new Date().toISOString()
        });
      }
      
      // Check for required admin reason header
      if (requireReason && !request.headers['x-admin-reason']) {
        return reply.code(400).send({
          error: 'Admin reason required',
          code: 'MISSING_ADMIN_REASON',
          message: 'Sensitive operations require a reason in x-admin-reason header',
          timestamp: new Date().toISOString()
        });
      }
      
      // Log successful admin authentication
      if (logActions) {
        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Admin authentication successful',
          {
            userId: claims.userId || claims.sub,
            email: claims.email,
            permissions: claims.admin_permissions,
            path: request.url,
            method: request.method,
            reason: request.headers['x-admin-reason'],
            durationMs: Date.now() - startTime
          }
        );
      }
      
      // Attach claims to request for downstream use
      (request as AdminRequest).adminClaims = claims;
      
    } catch (error) {
      if (logActions) {
        await loggingService.logCriticalError(
          'admin_auth_middleware_error',
          error as Error,
          {
            path: request.url,
            method: request.method,
            hasClaimsHeader: !!request.headers['x-sheen-claims']
          }
        );
      }
      
      return reply.code(401).send({
        error: 'Authentication failed',
        code: 'AUTH_ERROR',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Extract and validate admin claims from request
 */
function extractAdminClaimsFromRequest(request: AdminRequest): AdminClaims {
  // Priority 1: New Authorization: Bearer <admin_jwt> (preferred)
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const adminJWT = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(adminJWT, process.env.ADMIN_JWT_SECRET!, {
        algorithms: ['HS256'],
        issuer: 'sheen-admin',
        audience: 'sheen-admin-panel'
      }) as AdminClaims;
      
      // Additional validation for admin JWT
      if (!decoded.userId && !decoded.sub) {
        throw new Error('Invalid JWT: missing user ID');
      }
      
      if (!decoded.email) {
        throw new Error('Invalid JWT: missing email');
      }
      
      if (decoded.is_admin !== true) {
        throw new Error('Invalid JWT: admin privileges required');
      }
      
      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(`Invalid admin JWT: ${error.message}`);
      }
      throw error;
    }
  }

  // Priority 2: Legacy x-sheen-claims (grace period - will be deprecated)
  const claimsHeader = request.headers['x-sheen-claims'];
  if (claimsHeader) {
    try {
      const claims = JSON.parse(Buffer.from(claimsHeader, 'base64').toString()) as AdminClaims;
      
      // Validate required fields
      if (!claims.userId && !claims.sub) {
        throw new Error('Invalid claims: missing user ID');
      }
      
      if (!claims.email) {
        throw new Error('Invalid claims: missing email');
      }
      
      // Check JWT expiration
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp && claims.exp < now) {
        throw new Error('JWT token has expired');
      }
      
      return claims;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid claims format: malformed JSON');
      }
      throw error;
    }
  }

  // No authentication method found
  throw new Error('Missing authentication: Authorization: Bearer header or x-sheen-claims required');
}

/**
 * Validate admin status from claims
 */
function isValidAdmin(claims: AdminClaims): boolean {
  // Check explicit admin flag
  if (claims.is_admin !== true) {
    return false;
  }
  
  // Check role-based admin access (backward compatibility)
  if (claims.role !== 'admin' && claims.role !== 'super_admin') {
    return false;
  }
  
  return true;
}

/**
 * Check if user has required permissions
 */
function hasRequiredPermissions(claims: AdminClaims, requiredPermissions: string[]): boolean {
  if (!claims.admin_permissions || !Array.isArray(claims.admin_permissions)) {
    return false;
  }
  
  // Super admin has all permissions
  if (claims.role === 'super_admin') {
    return true;
  }
  
  // Check if user has all required permissions
  return requiredPermissions.every(permission => {
    // Check for exact match
    if (claims.admin_permissions.includes(permission)) {
      return true;
    }
    
    // Check for wildcard permissions
    // e.g., "admin:*" matches "admin.elevated", "admin.users", etc.
    // and "admin.*" also matches "admin.elevated", "admin.users", etc.
    return claims.admin_permissions.some(userPerm => {
      // Handle both "admin:*" and "admin.*" wildcard formats
      if (userPerm.endsWith(':*') || userPerm.endsWith('.*')) {
        const prefix = userPerm.slice(0, -2);
        // Check if required permission starts with the prefix
        // Convert both to same separator for comparison
        const normalizedPermission = permission.replace(/[:.]/g, '.');
        const normalizedPrefix = prefix.replace(/[:.]/g, '.');
        return normalizedPermission.startsWith(normalizedPrefix + '.');
      }
      return false;
    });
  });
}

/**
 * Convenience functions for specific admin operations
 */

export function requireUserManagement() {
  return requireAdminAuth({
    permissions: ['users.read', 'users.write'],
    requireReason: false,
    logActions: true
  });
}

export function requireAdvisorManagement() {
  return requireAdminAuth({
    permissions: ['advisors.read', 'advisors.approve'],
    requireReason: false,
    logActions: true
  });
}

export function requireFinancialAccess() {
  return requireAdminAuth({
    permissions: ['finance.read', 'finance.refund'],
    requireReason: false,
    logActions: true
  });
}

export function requireSupportAccess() {
  return requireAdminAuth({
    permissions: ['support.read', 'support.write'],
    requireReason: false,
    logActions: true
  });
}

export function requireReadOnlyAccess() {
  return requireAdminAuth({
    permissions: ['admin.read'],
    requireReason: false,
    logActions: false
  });
}

/**
 * High-security operations requiring elevated permissions
 */
export function requireElevatedAccess() {
  return requireAdminAuth({
    permissions: ['admin.elevated'],
    requireReason: true,
    logActions: true
  });
}