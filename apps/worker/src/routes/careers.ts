/**
 * Public Career Portal API Routes
 * 
 * REST API for job listings and applications with:
 * - Multilingual support (ar/en) with Arabic as primary
 * - Trigram search for fast text searching
 * - CAPTCHA verification for spam prevention
 * - Rate limiting for application submissions
 * - File upload to R2 for resumes
 * - SEO-friendly structured data
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { uploadToR2 } from '../services/cloudflareR2';
import { verifyCaptcha } from '../plugins/recaptcha';
import { sanitizeHtmlStrict, sanitizeMultilingualHtml } from '../utils/sanitizeHtml';
import { normalizeCareerLocale, transformCareerResponseForLocale } from '../utils/careerLocale';
import { 
  JobListingQuerySchema, 
  JobApplicationSchema,
  type JobListingQuery,
  type JobApplication 
} from '../schemas/careers';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';

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

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'] as string;
  return forwarded ? (forwarded.split(',')[0]?.trim() ?? request.ip) : request.ip;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// =====================================================
// Type Definitions
// =====================================================

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface PublicJobListing {
  id: string;
  slug: string;
  title: string;
  description: string;
  requirements: string;
  benefits: string;
  location: string;
  department: string;
  employment_type: string;
  experience_level: string;
  salary_range?: string;
  posted_at: string;
  application_deadline?: string;
  is_remote: boolean;
  is_featured: boolean;
}

interface ApplicationResponse {
  success: boolean;
  application_id?: string;
  message?: string;
}

// =====================================================
// Public Routes
// =====================================================

export default async function careersRoutes(fastify: FastifyInstance) {
  // GET /api/careers/jobs - List active job postings
  fastify.get<{
    Querystring: JobListingQuery;
  }>('/api/careers/jobs', async (request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string || crypto.randomUUID();
    const locale = normalizeCareerLocale(request.headers['x-sheen-locale'] as string);
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      // Validate query parameters
      const validation = JobListingQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.issues
        });
      }
      
      const { 
        search, 
        department, 
        location, 
        employment_type,
        experience_level,
        is_remote,
        limit = 20,
        offset = 0
      } = validation.data;
      
      // Build the query
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
          view_count,
          application_count
        FROM career_jobs
        WHERE is_active = true
          AND posted_at <= NOW()
          AND (application_deadline IS NULL OR application_deadline > NOW())
      `;
      
      const params: any[] = [];
      let paramIndex = 1;
      
      // Add search condition using trigram similarity
      if (search && search.trim()) {
        query += ` AND search_text % $${paramIndex}`;
        params.push(search.trim());
        paramIndex++;
      }
      
      // Add filters
      if (department) {
        query += ` AND department = $${paramIndex}`;
        params.push(department);
        paramIndex++;
      }
      
      if (location) {
        query += ` AND (
          multilingual_location->>'ar' ILIKE $${paramIndex} OR 
          multilingual_location->>'en' ILIKE $${paramIndex}
        )`;
        params.push(`%${location}%`);
        paramIndex++;
      }
      
      if (employment_type) {
        query += ` AND employment_type = $${paramIndex}`;
        params.push(employment_type);
        paramIndex++;
      }
      
      if (experience_level) {
        query += ` AND experience_level = $${paramIndex}`;
        params.push(experience_level);
        paramIndex++;
      }
      
      if (is_remote !== undefined) {
        query += ` AND is_remote = $${paramIndex}`;
        params.push(is_remote);
        paramIndex++;
      }
      
      // Order by relevance for search, featured first, then newest
      if (search && search.trim()) {
        query += ` ORDER BY 
          similarity(search_text, $1) DESC,
          is_featured DESC,
          posted_at DESC`;
      } else {
        query += ` ORDER BY is_featured DESC, posted_at DESC`;
      }
      
      // Add pagination
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      // Execute main query
      const jobsResult = await pool!.query(query, params);
      
      // Get total count for pagination
      const countQuery = query.replace(
        /SELECT[\s\S]*?FROM/,
        'SELECT COUNT(*) as total FROM'
      ).replace(/ORDER BY[\s\S]*$/, '').replace(/LIMIT[\s\S]*$/, '');
      
      const countParams = params.slice(0, -2); // Remove limit and offset
      const countResult = await pool!.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0');
      
      // Transform results based on locale
      const jobs = jobsResult.rows.map(row =>
        transformCareerResponseForLocale(row, locale) as PublicJobListing
      );

      // Note: View counts are incremented on detail page only, not on listing.
      // List impressions could be tracked separately if needed for analytics.

      const response: PaginatedResponse<PublicJobListing> = {
        items: jobs,
        total,
        limit,
        offset
      };
      
      reply.send(response);
      
    } catch (error) {
      await loggingService.logCriticalError('career_list_error', error as Error, {
        correlationId,
        locale
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve job listings'
      });
    }
  });
  
  // GET /api/careers/jobs/:slug - Get single job by slug
  fastify.get<{
    Params: { slug: string };
  }>('/api/careers/jobs/:slug', async (request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string || crypto.randomUUID();
    const locale = normalizeCareerLocale(request.headers['x-sheen-locale'] as string);
    const { slug } = request.params;
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const result = await pool!.query(`
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
          view_count,
          application_count,
          multilingual_meta_description,
          multilingual_meta_keywords
        FROM career_jobs
        WHERE slug = $1
          AND is_active = true
          AND posted_at <= NOW()
          AND (application_deadline IS NULL OR application_deadline > NOW())
      `, [slug]);
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Job not found'
        });
      }
      
      const job = transformCareerResponseForLocale(result.rows[0], locale);
      
      // Increment view count asynchronously
      pool!.query(
        'UPDATE career_jobs SET view_count = view_count + 1 WHERE id = $1',
        [result.rows[0].id]
      ).catch(err => {
        loggingService.logCriticalError('career_view_increment_error', err, { correlationId });
      });
      
      // Generate JSON-LD structured data for SEO
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": job.title,
        "description": job.description,
        "datePosted": job.posted_at,
        "validThrough": job.application_deadline,
        "employmentType": job.employment_type.toUpperCase(),
        "hiringOrganization": {
          "@type": "Organization",
          "name": "SheenApps"
        },
        "jobLocation": {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": job.location
          }
        }
      };
      
      reply.send({
        success: true,
        job,
        jsonLd
      });
      
    } catch (error) {
      await loggingService.logCriticalError('career_get_error', error as Error, {
        correlationId,
        slug
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve job details'
      });
    }
  });
  
  // POST /api/careers/jobs/:id/apply - Submit job application
  fastify.post<{
    Params: { id: string };
    Body: JobApplication;
  }>('/api/careers/jobs/:id/apply', async (request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string || crypto.randomUUID();
    const clientIp = getClientIp(request);
    const { id: jobId } = request.params;
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      // Validate request body
      const validation = JobApplicationSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid application data',
          details: validation.error.issues
        });
      }
      
      const {
        full_name,
        email,
        phone,
        cover_letter,
        linkedin_url,
        portfolio_url,
        years_of_experience,
        resume_file,
        captcha_token
      } = validation.data;
      
      // Verify CAPTCHA
      const captchaResult = await verifyCaptcha(captcha_token, clientIp);
      if (!captchaResult.success) {
        await loggingService.logServerEvent('capacity', 'warn', 'career_captcha_failed', {
          correlationId,
          clientIp,
          errorCodes: captchaResult.errorCodes
        });
        
        return reply.code(422).send({
          success: false,
          error: 'CAPTCHA verification failed',
          errorCodes: captchaResult.errorCodes
        });
      }
      
      // Check rate limit: 5 applications per hour per IP per job
      const rateLimitResult = await pool!.query(`
        SELECT COUNT(*) as count
        FROM career_applications
        WHERE job_id = $1
          AND ip_address = $2
          AND created_at > NOW() - INTERVAL '1 hour'
      `, [jobId, clientIp]);
      
      if (parseInt(rateLimitResult.rows[0].count) >= 5) {
        await loggingService.logServerEvent('capacity', 'warn', 'career_rate_limit_exceeded', {
          correlationId,
          clientIp,
          jobId
        });
        
        return reply.code(429).send({
          success: false,
          error: 'Too many applications. Please try again later.'
        });
      }
      
      // Check if job exists and is accepting applications
      const jobCheck = await pool!.query(`
        SELECT id, multilingual_title, slug
        FROM career_jobs
        WHERE id = $1
          AND is_active = true
          AND posted_at <= NOW()
          AND (application_deadline IS NULL OR application_deadline > NOW())
      `, [jobId]);
      
      if (jobCheck.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Job not found or no longer accepting applications'
        });
      }
      
      // Check for duplicate application
      const duplicateCheck = await pool!.query(`
        SELECT id
        FROM career_applications
        WHERE job_id = $1
          AND email = $2
          AND status != 'withdrawn'
      `, [jobId, email.toLowerCase()]);
      
      if (duplicateCheck.rows.length > 0) {
        return reply.code(409).send({
          success: false,
          error: 'You have already applied for this position'
        });
      }
      
      let resumeUrl: string | null = null;
      
      // Handle resume upload if provided (base64 encoded)
      if (resume_file) {
        try {
          // Parse base64 data URL
          const matches = resume_file.match(/^data:(.+);base64,(.+)$/);
          if (!matches) {
            return reply.code(400).send({
              success: false,
              error: 'Invalid resume file format'
            });
          }
          
          const mimeType = matches[1]!;
          const base64Data = matches[2]!;
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Validate file size (max 5MB)
          if (buffer.length > 5 * 1024 * 1024) {
            return reply.code(400).send({
              success: false,
              error: 'Resume file too large (max 5MB)'
            });
          }
          
          // Validate file type
          const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ];
          
          if (!allowedTypes.includes(mimeType)) {
            return reply.code(400).send({
              success: false,
              error: 'Invalid file type. Only PDF, DOC, and DOCX are allowed.'
            });
          }
          
          // Generate file path
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const fileId = crypto.randomUUID();
          const extension = mimeType === 'application/pdf' ? 'pdf' : 
                           mimeType === 'application/msword' ? 'doc' : 'docx';
          const fileName = `${fileId}-${slugify(full_name)}.${extension}`;
          const r2Key = `career/resumes/${year}/${month}/${fileName}`;
          
          // Save to temporary file for upload
          const tempPath = `/tmp/${fileName}`;
          await fs.writeFile(tempPath, buffer);
          
          // Upload to R2
          const uploadResult = await uploadToR2(tempPath, r2Key, {
            contentType: mimeType,
            retention: 'standard'
          });
          
          resumeUrl = uploadResult.url;
          
          // Clean up temp file
          await fs.unlink(tempPath).catch(() => {}); // Ignore cleanup errors
          
        } catch (uploadError) {
          await loggingService.logCriticalError('career_resume_upload_error', uploadError as Error, {
            correlationId,
            jobId,
            email
          });
          
          return reply.code(500).send({
            success: false,
            error: 'Failed to upload resume. Please try again.'
          });
        }
      }
      
      // Create application
      const applicationId = crypto.randomUUID();
      
      await pool!.query(`
        INSERT INTO career_applications (
          id,
          job_id,
          full_name,
          email,
          phone,
          cover_letter,
          resume_url,
          linkedin_url,
          portfolio_url,
          years_of_experience,
          status,
          ip_address,
          user_agent,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', $11, $12, NOW())
      `, [
        applicationId,
        jobId,
        full_name,
        email.toLowerCase(),
        phone,
        sanitizeHtmlStrict(cover_letter),
        resumeUrl,
        linkedin_url,
        portfolio_url,
        years_of_experience,
        clientIp,
        request.headers['user-agent'] || null
      ]);
      
      // Update application count on job
      await pool!.query(
        'UPDATE career_jobs SET application_count = application_count + 1 WHERE id = $1',
        [jobId]
      );
      
      // Log successful application
      await loggingService.logServerEvent('capacity', 'info', 'career_application_submitted', {
        correlationId,
        applicationId,
        jobId,
        email: email.toLowerCase()
      });
      
      const response: ApplicationResponse = {
        success: true,
        application_id: applicationId,
        message: 'Application submitted successfully'
      };
      
      reply.code(201).send(response);
      
    } catch (error) {
      await loggingService.logCriticalError('career_application_error', error as Error, {
        correlationId,
        jobId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to submit application'
      });
    }
  });
  
  // GET /api/careers/departments - List all departments with job counts
  fastify.get('/api/careers/departments', async (request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string || crypto.randomUUID();
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const result = await pool!.query(`
        SELECT 
          department,
          COUNT(*) as job_count
        FROM career_jobs
        WHERE is_active = true
          AND posted_at <= NOW()
          AND (application_deadline IS NULL OR application_deadline > NOW())
        GROUP BY department
        ORDER BY job_count DESC, department ASC
      `);
      
      reply.send({
        success: true,
        departments: result.rows
      });
      
    } catch (error) {
      await loggingService.logCriticalError('career_departments_error', error as Error, {
        correlationId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve departments'
      });
    }
  });
  
  // GET /api/careers/sitemap - Generate sitemap for SEO
  fastify.get('/api/careers/sitemap', async (request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string || crypto.randomUUID();
    
    try {
      if (!checkDatabaseConnection(reply)) return;
      
      const result = await pool!.query(`
        SELECT 
          slug,
          updated_at
        FROM career_jobs
        WHERE is_active = true
          AND posted_at <= NOW()
        ORDER BY posted_at DESC
      `);
      
      const baseUrl = process.env.FRONTEND_URL || 'https://sheenapps.com';
      
      const urls = result.rows.map(job => ({
        loc: `${baseUrl}/careers/${job.slug}`,
        lastmod: job.updated_at.toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: 0.8
      }));
      
      // Add main careers page
      urls.unshift({
        loc: `${baseUrl}/careers`,
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'daily',
        priority: 1.0
      });
      
      reply.send({
        success: true,
        urls
      });
      
    } catch (error) {
      await loggingService.logCriticalError('career_sitemap_error', error as Error, {
        correlationId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to generate sitemap'
      });
    }
  });
}