/**
 * Admin Career Portal API Routes
 * 
 * Protected admin endpoints for managing career portal with:
 * - Full CRUD operations for job postings
 * - Application management and status updates
 * - Audit logging with correlation IDs
 * - Reason headers for compliance
 * - Admin authentication via HMAC
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { sanitizeMultilingualHtml } from '../utils/sanitizeHtml';
import { 
  JobCreationSchema,
  JobUpdateSchema,
  ApplicationStatusUpdateSchema,
  type JobCreation,
  type JobUpdate,
  type ApplicationStatusUpdate
} from '../schemas/careers';
import * as crypto from 'crypto';

const loggingService = ServerLoggingService.getInstance();

// =====================================================
// Helper Functions
// =====================================================

function checkDatabaseConnection(reply: FastifyReply): boolean {
  if (!pool) {
    reply.code(500).send({ 
      success: false, 
      error: 'Database connection not available' 
    });
    return false;
  }
  return true;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function generateUniqueSlug(baseSlug: string): Promise<string> {
  if (!pool) {
    throw new Error('Database connection not available');
  }
  
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const result = await pool!.query(
      'SELECT id FROM career_jobs WHERE slug = $1',
      [slug]
    );
    
    if (result.rows.length === 0) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

// =====================================================
// Type Definitions
// =====================================================

interface AdminAuthenticatedRequest extends FastifyRequest {
  headers: {
    'x-admin-user-id': string;
    'x-admin-reason'?: string;
    'x-correlation-id'?: string;
  };
}

interface AdminJobListing {
  id: string;
  slug: string;
  multilingual_title: Record<string, string>;
  multilingual_description: Record<string, string>;
  multilingual_requirements: Record<string, string>;
  multilingual_benefits: Record<string, string>;
  multilingual_location: Record<string, string>;
  department: string;
  employment_type: string;
  experience_level: string;
  salary?: Record<string, any>;
  posted_at: string;
  application_deadline?: string;
  is_remote: boolean;
  is_featured: boolean;
  is_active: boolean;
  view_count: number;
  application_count: number;
  created_at: string;
  updated_at: string;
}

interface AdminApplication {
  id: string;
  job_id: string;
  job_title: Record<string, string>;
  full_name: string;
  email: string;
  phone: string;
  cover_letter?: string;
  resume_url?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  years_of_experience?: number;
  status: string;
  reviewer_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  ip_address: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

// =====================================================
// Admin Routes
// =====================================================

export default async function careerAdminRoutes(fastify: FastifyInstance) {
  // Apply admin authentication to all routes
  fastify.addHook('preHandler', requireAdminAuth());
  
  // GET /api/admin/careers/jobs - List all jobs with admin details
  fastify.get<{
    Querystring: {
      is_active?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    };
  }>('/api/admin/careers/jobs', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const { is_active, search, limit = 50, offset = 0 } = request.query;
      
      let query = `
        SELECT 
          id,
          slug,
          multilingual_title,
          multilingual_description,
          multilingual_requirements,
          multilingual_benefits,
          multilingual_location,
          department,
          employment_type,
          experience_level,
          salary,
          posted_at,
          application_deadline,
          is_remote,
          is_featured,
          is_active,
          view_count,
          application_count,
          created_at,
          updated_at
        FROM career_jobs
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramIndex = 1;
      
      if (is_active !== undefined) {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active);
        paramIndex++;
      }
      
      if (search && search.trim()) {
        query += ` AND search_text % $${paramIndex}`;
        params.push(search.trim());
        paramIndex++;
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      const result = await pool!.query(query, params);
      
      // Get total count
      const countQuery = query.replace(
        /SELECT[\s\S]*?FROM/,
        'SELECT COUNT(*) as total FROM'
      ).replace(/ORDER BY[\s\S]*$/, '').replace(/LIMIT[\s\S]*$/, '');
      
      const countParams = params.slice(0, -2);
      const countResult = await pool!.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0');
      
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_list_viewed', {
        correlationId,
        adminUserId,
        filters: { is_active, search }
      });
      
      reply.send({
        success: true,
        items: result.rows as AdminJobListing[],
        total,
        limit,
        offset
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_list_error', error as Error, {
        correlationId,
        adminUserId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve job listings'
      });
    }
  });
  
  // GET /api/admin/careers/jobs/:id - Get single job with full details
  fastify.get<{
    Params: { id: string };
  }>('/api/admin/careers/jobs/:id', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    const { id } = request.params;
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const result = await pool!.query(`
        SELECT 
          *,
          (SELECT COUNT(*) FROM career_applications WHERE job_id = $1) as total_applications,
          (SELECT COUNT(*) FROM career_applications WHERE job_id = $1 AND status = 'new') as new_applications
        FROM career_jobs
        WHERE id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Job not found'
        });
      }
      
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_job_viewed', {
        correlationId,
        adminUserId,
        jobId: id
      });
      
      reply.send({
        success: true,
        job: result.rows[0]
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_get_error', error as Error, {
        correlationId,
        adminUserId,
        jobId: id
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve job details'
      });
    }
  });
  
  // POST /api/admin/careers/jobs - Create new job posting
  fastify.post<{
    Body: JobCreation;
  }>('/api/admin/careers/jobs', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    const reason = adminRequest.headers['x-admin-reason'] || 'Job creation';
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      // Validate request body
      const validation = JobCreationSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid job data',
          details: validation.error.issues
        });
      }
      
      const data = validation.data;
      
      // Sanitize HTML fields
      const sanitizedData = {
        ...data,
        multilingual_description: sanitizeMultilingualHtml(data.multilingual_description),
        multilingual_requirements: sanitizeMultilingualHtml(data.multilingual_requirements),
        multilingual_benefits: sanitizeMultilingualHtml(data.multilingual_benefits)
      };
      
      // Generate unique slug
      const baseSlug = slugify(data.multilingual_title.ar || data.multilingual_title.en || '');
      const slug = await generateUniqueSlug(baseSlug);
      
      const jobId = crypto.randomUUID();
      
      // Create the job
      await pool!.query(`
        INSERT INTO career_jobs (
          id,
          slug,
          multilingual_title,
          multilingual_description,
          multilingual_requirements,
          multilingual_benefits,
          multilingual_location,
          department,
          employment_type,
          experience_level,
          salary,
          posted_at,
          application_deadline,
          is_remote,
          is_featured,
          is_active,
          multilingual_meta_description,
          multilingual_meta_keywords,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
        )
      `, [
        jobId,
        slug,
        sanitizedData.multilingual_title,
        sanitizedData.multilingual_description,
        sanitizedData.multilingual_requirements,
        sanitizedData.multilingual_benefits,
        sanitizedData.multilingual_location,
        sanitizedData.department,
        sanitizedData.employment_type,
        sanitizedData.experience_level,
        sanitizedData.salary || null,
        sanitizedData.posted_at || new Date(),
        sanitizedData.application_deadline || null,
        sanitizedData.is_remote || false,
        sanitizedData.is_featured || false,
        sanitizedData.is_active !== false, // Default to true
        sanitizedData.multilingual_meta_description || null,
        sanitizedData.multilingual_meta_keywords || null
      ]);
      
      // Log the action with audit trail
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_job_created', {
        correlationId,
        adminUserId,
        reason,
        jobId,
        slug,
        title: sanitizedData.multilingual_title
      });
      
      // Also create admin audit log entry
      await pool!.query(`
        INSERT INTO admin_audit_logs (
          id,
          admin_user_id,
          action,
          resource_type,
          resource_id,
          changes,
          reason,
          ip_address,
          user_agent,
          correlation_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        crypto.randomUUID(),
        adminUserId,
        'create',
        'career_job',
        jobId,
        JSON.stringify({ created: sanitizedData }),
        reason,
        request.ip,
        request.headers['user-agent'] || null,
        correlationId
      ]);
      
      reply.code(201).send({
        success: true,
        job_id: jobId,
        slug
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_create_error', error as Error, {
        correlationId,
        adminUserId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to create job posting'
      });
    }
  });
  
  // PUT /api/admin/careers/jobs/:id - Update job posting
  fastify.put<{
    Params: { id: string };
    Body: JobUpdate;
  }>('/api/admin/careers/jobs/:id', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    const reason = adminRequest.headers['x-admin-reason'] || 'Job update';
    const { id } = request.params;
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      // Validate request body
      const validation = JobUpdateSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid job data',
          details: validation.error.issues
        });
      }
      
      const data = validation.data;
      
      // Get existing job for audit trail
      const existingResult = await pool!.query(
        'SELECT * FROM career_jobs WHERE id = $1',
        [id]
      );
      
      if (existingResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Job not found'
        });
      }
      
      const existing = existingResult.rows[0];
      
      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;
      
      // Sanitize and add HTML fields if provided
      if (data.multilingual_description) {
        updates.push(`multilingual_description = $${paramIndex}`);
        params.push(sanitizeMultilingualHtml(data.multilingual_description));
        paramIndex++;
      }
      
      if (data.multilingual_requirements) {
        updates.push(`multilingual_requirements = $${paramIndex}`);
        params.push(sanitizeMultilingualHtml(data.multilingual_requirements));
        paramIndex++;
      }
      
      if (data.multilingual_benefits) {
        updates.push(`multilingual_benefits = $${paramIndex}`);
        params.push(sanitizeMultilingualHtml(data.multilingual_benefits));
        paramIndex++;
      }
      
      // Add other fields
      const simpleFields = [
        'multilingual_title',
        'multilingual_location',
        'department',
        'employment_type',
        'experience_level',
        'salary',
        'posted_at',
        'application_deadline',
        'is_remote',
        'is_featured',
        'is_active',
        'multilingual_meta_description',
        'multilingual_meta_keywords'
      ];
      
      for (const field of simpleFields) {
        if (field in data) {
          updates.push(`${field} = $${paramIndex}`);
          params.push((data as any)[field]);
          paramIndex++;
        }
      }
      
      if (updates.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'No fields to update'
        });
      }
      
      // Always update the updated_at timestamp
      updates.push(`updated_at = NOW()`);
      
      // Execute update
      params.push(id);
      await pool!.query(
        `UPDATE career_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );
      
      // Log the action with audit trail
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_job_updated', {
        correlationId,
        adminUserId,
        reason,
        jobId: id,
        changes: data
      });
      
      // Create admin audit log entry
      await pool!.query(`
        INSERT INTO admin_audit_logs (
          id,
          admin_user_id,
          action,
          resource_type,
          resource_id,
          changes,
          reason,
          ip_address,
          user_agent,
          correlation_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        crypto.randomUUID(),
        adminUserId,
        'update',
        'career_job',
        id,
        JSON.stringify({ 
          before: existing,
          after: data 
        }),
        reason,
        request.ip,
        request.headers['user-agent'] || null,
        correlationId
      ]);
      
      reply.send({
        success: true,
        message: 'Job updated successfully'
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_update_error', error as Error, {
        correlationId,
        adminUserId,
        jobId: id
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to update job posting'
      });
    }
  });
  
  // DELETE /api/admin/careers/jobs/:id - Soft delete job
  fastify.delete<{
    Params: { id: string };
  }>('/api/admin/careers/jobs/:id', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    const reason = adminRequest.headers['x-admin-reason'] || 'Job deletion';
    const { id } = request.params;
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      // Check if job exists
      const existingResult = await pool!.query(
        'SELECT id, multilingual_title FROM career_jobs WHERE id = $1',
        [id]
      );
      
      if (existingResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Job not found'
        });
      }
      
      // Soft delete by setting is_active to false
      await pool!.query(
        'UPDATE career_jobs SET is_active = false, updated_at = NOW() WHERE id = $1',
        [id]
      );
      
      // Log the action
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_job_deleted', {
        correlationId,
        adminUserId,
        reason,
        jobId: id,
        title: existingResult.rows[0].multilingual_title
      });
      
      // Create admin audit log entry
      await pool!.query(`
        INSERT INTO admin_audit_logs (
          id,
          admin_user_id,
          action,
          resource_type,
          resource_id,
          changes,
          reason,
          ip_address,
          user_agent,
          correlation_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        crypto.randomUUID(),
        adminUserId,
        'delete',
        'career_job',
        id,
        JSON.stringify({ soft_deleted: true }),
        reason,
        request.ip,
        request.headers['user-agent'] || null,
        correlationId
      ]);
      
      reply.send({
        success: true,
        message: 'Job deleted successfully'
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_delete_error', error as Error, {
        correlationId,
        adminUserId,
        jobId: id
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to delete job posting'
      });
    }
  });
  
  // GET /api/admin/careers/applications - List applications with filters
  fastify.get<{
    Querystring: {
      job_id?: string;
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    };
  }>('/api/admin/careers/applications', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const { job_id, status, search, limit = 50, offset = 0 } = request.query;
      
      let query = `
        SELECT 
          a.*,
          j.multilingual_title as job_title
        FROM career_applications a
        JOIN career_jobs j ON a.job_id = j.id
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramIndex = 1;
      
      if (job_id) {
        query += ` AND a.job_id = $${paramIndex}`;
        params.push(job_id);
        paramIndex++;
      }
      
      if (status) {
        query += ` AND a.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
      
      if (search && search.trim()) {
        query += ` AND (
          a.full_name ILIKE $${paramIndex} OR 
          a.email ILIKE $${paramIndex}
        )`;
        params.push(`%${search.trim()}%`);
        paramIndex++;
      }
      
      query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      const result = await pool!.query(query, params);
      
      // Get total count
      const countQuery = query.replace(
        /SELECT[\s\S]*?FROM/,
        'SELECT COUNT(*) as total FROM'
      ).replace(/ORDER BY[\s\S]*$/, '').replace(/LIMIT[\s\S]*$/, '');
      
      const countParams = params.slice(0, -2);
      const countResult = await pool!.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0');
      
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_applications_viewed', {
        correlationId,
        adminUserId,
        filters: { job_id, status, search }
      });
      
      reply.send({
        success: true,
        items: result.rows as AdminApplication[],
        total,
        limit,
        offset
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_applications_error', error as Error, {
        correlationId,
        adminUserId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve applications'
      });
    }
  });
  
  // GET /api/admin/careers/applications/:id - Get single application
  fastify.get<{
    Params: { id: string };
  }>('/api/admin/careers/applications/:id', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    const { id } = request.params;
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const result = await pool!.query(`
        SELECT 
          a.*,
          j.multilingual_title as job_title,
          j.slug as job_slug
        FROM career_applications a
        JOIN career_jobs j ON a.job_id = j.id
        WHERE a.id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Application not found'
        });
      }
      
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_application_viewed', {
        correlationId,
        adminUserId,
        applicationId: id
      });
      
      reply.send({
        success: true,
        application: result.rows[0]
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_application_get_error', error as Error, {
        correlationId,
        adminUserId,
        applicationId: id
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve application'
      });
    }
  });
  
  // PUT /api/admin/careers/applications/:id/status - Update application status
  fastify.put<{
    Params: { id: string };
    Body: ApplicationStatusUpdate;
  }>('/api/admin/careers/applications/:id/status', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    const reason = adminRequest.headers['x-admin-reason'] || 'Status update';
    const { id } = request.params;
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      // Validate request body
      const validation = ApplicationStatusUpdateSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid status update data',
          details: validation.error.issues
        });
      }
      
      const { status, reviewer_notes } = validation.data;
      
      // Get existing application
      const existingResult = await pool!.query(
        'SELECT * FROM career_applications WHERE id = $1',
        [id]
      );
      
      if (existingResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Application not found'
        });
      }
      
      const existing = existingResult.rows[0];
      
      // Update application status
      await pool!.query(`
        UPDATE career_applications 
        SET 
          status = $1,
          reviewer_notes = $2,
          reviewed_by = $3,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = $4
      `, [status, reviewer_notes || existing.reviewer_notes, adminUserId, id]);
      
      // Log the action
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_application_status_updated', {
        correlationId,
        adminUserId,
        reason,
        applicationId: id,
        oldStatus: existing.status,
        newStatus: status
      });
      
      // Create admin audit log entry
      await pool!.query(`
        INSERT INTO admin_audit_logs (
          id,
          admin_user_id,
          action,
          resource_type,
          resource_id,
          changes,
          reason,
          ip_address,
          user_agent,
          correlation_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        crypto.randomUUID(),
        adminUserId,
        'update_status',
        'career_application',
        id,
        JSON.stringify({ 
          old_status: existing.status,
          new_status: status,
          reviewer_notes
        }),
        reason,
        request.ip,
        request.headers['user-agent'] || null,
        correlationId
      ]);
      
      reply.send({
        success: true,
        message: 'Application status updated successfully'
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_status_update_error', error as Error, {
        correlationId,
        adminUserId,
        applicationId: id
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to update application status'
      });
    }
  });
  
  // GET /api/admin/careers/stats - Get career portal statistics
  fastify.get('/api/admin/careers/stats', async (request, reply) => {
    const adminRequest = request as AdminAuthenticatedRequest;
    const correlationId = adminRequest.headers['x-correlation-id'] || crypto.randomUUID();
    const adminUserId = adminRequest.headers['x-admin-user-id'];
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const statsResult = await pool!.query(`
        SELECT 
          (SELECT COUNT(*) FROM career_jobs WHERE is_active = true) as active_jobs,
          (SELECT COUNT(*) FROM career_jobs WHERE is_active = false) as inactive_jobs,
          (SELECT COUNT(*) FROM career_applications) as total_applications,
          (SELECT COUNT(*) FROM career_applications WHERE status = 'new') as new_applications,
          (SELECT COUNT(*) FROM career_applications WHERE status = 'reviewing') as reviewing_applications,
          (SELECT COUNT(*) FROM career_applications WHERE status = 'shortlisted') as shortlisted_applications,
          (SELECT COUNT(*) FROM career_applications WHERE created_at > NOW() - INTERVAL '7 days') as applications_last_week,
          (SELECT SUM(view_count) FROM career_jobs) as total_views
      `);
      
      // Get top viewed jobs
      const topJobsResult = await pool!.query(`
        SELECT 
          id,
          slug,
          multilingual_title,
          view_count,
          application_count
        FROM career_jobs
        WHERE is_active = true
        ORDER BY view_count DESC
        LIMIT 5
      `);
      
      // Get recent applications
      const recentApplicationsResult = await pool!.query(`
        SELECT 
          a.id,
          a.full_name,
          a.email,
          a.status,
          a.created_at,
          j.multilingual_title as job_title
        FROM career_applications a
        JOIN career_jobs j ON a.job_id = j.id
        ORDER BY a.created_at DESC
        LIMIT 10
      `);
      
      await loggingService.logServerEvent('capacity', 'info', 'admin_career_stats_viewed', {
        correlationId,
        adminUserId
      });
      
      reply.send({
        success: true,
        stats: statsResult.rows[0],
        topJobs: topJobsResult.rows,
        recentApplications: recentApplicationsResult.rows
      });
      
    } catch (error) {
      await loggingService.logCriticalError('admin_career_stats_error', error as Error, {
        correlationId,
        adminUserId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve statistics'
      });
    }
  });
}