import { FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { adminErrorResponse, withCorrelationId } from '../middleware/correlationIdMiddleware';
import { requireElevatedAccess } from '../middleware/adminAuthentication';
import { ServerLoggingService } from '../services/serverLoggingService';
import { pool } from '../services/database';

const loggingService = ServerLoggingService.getInstance();

interface CreateAdminRequest {
  email: string;
  password: string;
  role?: 'admin' | 'super_admin';
  permissions?: string[];
  display_name?: string;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  created_at: string;
  created_by?: string;
}

// Helper function to sleep
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function adminUsersRoutes(fastify: FastifyInstance) {
  
  /**
   * POST /v1/admin/management/users/create
   * Create a new admin user (super_admin only)
   * Implements the "golden path" from create-admin-complete.ts
   */
  fastify.post<{ Body: CreateAdminRequest }>('/v1/admin/management/users/create', {
    preHandler: requireElevatedAccess()
  }, async (request, reply) => {
    try {
      const { email, password, role = 'admin', permissions, display_name } = request.body;
      const adminUser = (request as any).adminClaims;
      
      // CRITICAL: Prevent privilege escalation
      // Only super_admin can create new admin users
      if (adminUser.role !== 'super_admin') {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Unauthorized admin creation attempt',
          {
            action: 'admin.users.create.denied',
            requesting_user_id: adminUser.userId,
            requesting_user_role: adminUser.role,
            requesting_user_email: adminUser.email,
            target_email: email,
            target_role: role,
            ip: request.ip,
            user_agent: request.headers['user-agent']
          }
        );
        
        return reply.code(403).send({
          ...adminErrorResponse(request, 'Only super admins can create admin users'),
          code: 'INSUFFICIENT_PRIVILEGES',
          required_role: 'super_admin',
          current_role: adminUser.role
        });
      }
      
      // Additional check: Regular admins cannot create super_admins
      if (role === 'super_admin' && adminUser.role === 'admin') {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Admin tried to create super_admin',
          {
            action: 'admin.users.create.escalation_attempt',
            requesting_user_id: adminUser.userId,
            requesting_user_email: adminUser.email,
            target_email: email,
            ip: request.ip
          }
        );
        
        return reply.code(403).send({
          ...adminErrorResponse(request, 'Cannot create user with higher privileges'),
          code: 'PRIVILEGE_ESCALATION_ATTEMPT'
        });
      }
      
      // Validate input
      if (!email || !email.includes('@')) {
        return reply.code(400).send(
          adminErrorResponse(request, 'Valid email is required')
        );
      }
      
      if (!password || password.length < 8) {
        return reply.code(400).send(
          adminErrorResponse(request, 'Password must be at least 8 characters')
        );
      }
      
      // Normalize email
      const normalizedEmail = email.toLowerCase().trim();
      
      // Initialize Supabase Admin client
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !serviceRoleKey) {
        return reply.code(500).send(
          adminErrorResponse(request, 'Supabase configuration missing')
        );
      }
      
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      
      // Implement the "golden path" for creating admin users
      let userId: string;
      
      // Step A: Create (or upsert) the user with password
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true, // Auto-confirm to avoid blocks
        app_metadata: {
          role,
          is_admin: true,
          admin_permissions: permissions || ['admin:*'],
          created_by: adminUser.email,
          created_at: new Date().toISOString()
        },
        user_metadata: {
          display_name: display_name || 'Admin User'
        }
      });
      
      if (createError && createError.message !== 'User already registered') {
        await loggingService.logServerEvent(
          'error',
          'error',
          'Failed to create admin user',
          {
            action: 'admin.users.create.failed',
            email: normalizedEmail,
            error: createError.message,
            created_by: adminUser.email
          }
        );
        
        return reply.code(400).send(
          adminErrorResponse(request, `Failed to create user: ${createError.message}`)
        );
      }
      
      // Get user ID (either from creation or existing user)
      if (created?.user?.id) {
        userId = created.user.id;
      } else {
        // User already exists, find their ID
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === normalizedEmail);
        
        if (!existingUser) {
          return reply.code(500).send(
            adminErrorResponse(request, 'Could not retrieve user ID')
          );
        }
        
        userId = existingUser.id;
        
        // If user already exists, check if they're already an admin
        if (existingUser.app_metadata?.is_admin) {
          return reply.code(409).send({
            ...adminErrorResponse(request, 'User is already an admin'),
            code: 'USER_ALREADY_ADMIN',
            user: {
              id: userId,
              email: normalizedEmail,
              role: existingUser.app_metadata.role || 'admin'
            }
          });
        }
      }
      
      // Step B: Force identity & password update (for older GoTrue)
      await sleep(1000);
      
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true
      });
      
      // Step C: Generate recovery link (optional, for audit trail)
      try {
        const { data: link } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail
        });
        
        if (link?.properties?.action_link) {
          // Log that a recovery link was generated (but don't expose it)
          await loggingService.logServerEvent(
            'routing',
            'info',
            'Recovery link generated for new admin',
            {
              action: 'admin.users.create.recovery_link',
              user_id: userId,
              email: normalizedEmail,
              created_by: adminUser.email
            }
          );
        }
      } catch (err) {
        // Link generation might not be supported, continue anyway
      }
      
      // Step D: Ensure admin metadata is set
      await sleep(1000);
      
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: {
          role,
          is_admin: true,
          admin_permissions: permissions || ['admin:*'],
          created_by: adminUser.email,
          created_at: new Date().toISOString()
        }
      });
      
      // Step E: Final password sync
      await sleep(2000);
      
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password
      });
      
      // Wait for propagation
      await sleep(3000);
      
      // Log successful admin creation in audit table
      try {
        await pool!.query(`
          INSERT INTO admin_audit_log (
            admin_id,
            action,
            resource_type,
            resource_id,
            details,
            ip_address,
            user_agent,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6::inet, $7, NOW())
        `, [
          adminUser.userId,
          'admin.user.created',
          'admin_user',
          userId,
          JSON.stringify({
            email: normalizedEmail,
            role,
            permissions: permissions || ['admin:*'],
            created_by: adminUser.email
          }),
          request.ip,
          request.headers['user-agent'] || 'unknown'
        ]);
      } catch (auditError) {
        // Log but don't fail the request
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Failed to log admin creation in audit table',
          {
            error: auditError,
            user_id: userId
          }
        );
      }
      
      // Log successful creation
      await loggingService.logServerEvent(
        'routing',
        'info',
        'Admin user created successfully',
        {
          action: 'admin.users.create.success',
          created_user_id: userId,
          created_user_email: normalizedEmail,
          created_user_role: role,
          created_by: adminUser.email,
          ip: request.ip
        }
      );
      
      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Admin user created successfully',
          user: {
            id: userId,
            email: normalizedEmail,
            role,
            permissions: permissions || ['admin:*'],
            temporary_password: password, // Only return on creation
            created_by: adminUser.email,
            created_at: new Date().toISOString()
          },
          instructions: 'User should change password on first login'
        }, request)
      );
      
    } catch (error) {
      await loggingService.logCriticalError('admin_user_creation_error', error as Error, {
        email: request.body.email,
        created_by: (request as any).admin?.email,
        ip: request.ip
      });
      
      return reply.code(500).send(
        adminErrorResponse(request, 'Internal server error during admin creation')
      );
    }
  });
  
  /**
   * GET /v1/admin/management/users
   * List all admin users (admin and super_admin can view)
   */
  fastify.get('/v1/admin/management/users', {
    preHandler: requireElevatedAccess()
  }, async (request, reply) => {
    try {
      const adminUser = (request as any).adminClaims;
      
      // Both admin and super_admin can view the list
      if (!['admin', 'super_admin'].includes(adminUser.role)) {
        return reply.code(403).send(
          adminErrorResponse(request, 'Insufficient privileges')
        );
      }
      
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !serviceRoleKey) {
        return reply.code(500).send(
          adminErrorResponse(request, 'Supabase configuration missing')
        );
      }
      
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      
      // Get all users and filter for admins
      const { data: allUsers, error } = await supabaseAdmin.auth.admin.listUsers();
      
      if (error) {
        return reply.code(500).send(
          adminErrorResponse(request, 'Failed to fetch users')
        );
      }
      
      const adminUsers: AdminUser[] = allUsers.users
        .filter(u => u.app_metadata?.is_admin === true)
        .map(u => ({
          id: u.id,
          email: u.email || '',
          role: u.app_metadata?.role || 'admin',
          permissions: u.app_metadata?.admin_permissions || [],
          created_at: u.created_at,
          created_by: u.app_metadata?.created_by
        }));
      
      return reply.send(
        withCorrelationId({
          success: true,
          admins: adminUsers,
          total: adminUsers.length
        }, request)
      );
      
    } catch (error) {
      await loggingService.logCriticalError('admin_user_list_error', error as Error, {
        requested_by: (request as any).admin?.email,
        ip: request.ip
      });
      
      return reply.code(500).send(
        adminErrorResponse(request, 'Internal server error')
      );
    }
  });
  
  /**
   * DELETE /v1/admin/management/users/:userId
   * Revoke admin privileges (super_admin only)
   */
  fastify.delete<{ Params: { userId: string } }>('/v1/admin/management/users/:userId', {
    preHandler: requireElevatedAccess()
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const adminUser = (request as any).adminClaims;
      
      // Only super_admin can revoke admin privileges
      if (adminUser.role !== 'super_admin') {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Unauthorized admin revocation attempt',
          {
            action: 'admin.users.revoke.denied',
            requesting_user_id: adminUser.userId,
            requesting_user_role: adminUser.role,
            target_user_id: userId,
            ip: request.ip
          }
        );
        
        return reply.code(403).send(
          adminErrorResponse(request, 'Only super admins can revoke admin privileges')
        );
      }
      
      // Prevent self-revocation
      if (userId === adminUser.userId) {
        return reply.code(400).send(
          adminErrorResponse(request, 'Cannot revoke your own admin privileges')
        );
      }
      
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !serviceRoleKey) {
        return reply.code(500).send(
          adminErrorResponse(request, 'Supabase configuration missing')
        );
      }
      
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      
      // Update user to remove admin privileges
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: {
          is_admin: false,
          role: 'user',
          admin_permissions: [],
          revoked_by: adminUser.email,
          revoked_at: new Date().toISOString()
        }
      });
      
      if (error) {
        return reply.code(400).send(
          adminErrorResponse(request, `Failed to revoke privileges: ${error.message}`)
        );
      }
      
      // Log in audit table
      try {
        await pool!.query(`
          INSERT INTO admin_audit_log (
            admin_id,
            action,
            resource_type,
            resource_id,
            details,
            ip_address,
            user_agent,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6::inet, $7, NOW())
        `, [
          adminUser.userId,
          'admin.user.revoked',
          'admin_user',
          userId,
          JSON.stringify({
            revoked_by: adminUser.email
          }),
          request.ip,
          request.headers['user-agent'] || 'unknown'
        ]);
      } catch (auditError) {
        // Log but don't fail
      }
      
      await loggingService.logServerEvent(
        'routing',
        'info',
        'Admin privileges revoked',
        {
          action: 'admin.users.revoke.success',
          target_user_id: userId,
          revoked_by: adminUser.email,
          ip: request.ip
        }
      );
      
      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Admin privileges revoked successfully'
        }, request)
      );
      
    } catch (error) {
      await loggingService.logCriticalError('admin_user_revoke_error', error as Error, {
        target_user_id: request.params.userId,
        revoked_by: (request as any).admin?.email,
        ip: request.ip
      });
      
      return reply.code(500).send(
        adminErrorResponse(request, 'Internal server error')
      );
    }
  });
}