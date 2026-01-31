/**
 * Advisor Service
 * 
 * Production-ready advisor application management service with:
 * - Draft application system with auto-save capability
 * - Event timeline tracking for admin review workflow  
 * - Expert-validated UPSERT patterns with proper conflict resolution
 * - Comprehensive error handling and type safety
 * - RLS-based security following existing patterns
 * - i18n-ready event system integration
 */

import { pool } from '../database';
import { ServerLoggingService } from '../serverLoggingService';
import {
  AdvisorService as IAdvisorService,
  AdvisorApplicationDraft,
  CreateDraftParams,
  UpdateDraftParams,
  DraftResult,
  Advisor,
  UpdateAdvisorParams,
  CreateEventParams,
  AdvisorEvent,
  AdvisorApplicationStatus,
  AdvisorClaims,
  AdvisorError,
  ProfessionalData,
  ADVISOR_VALIDATION,
  SupportedLanguage,
  SpecialtyTranslation,
  SpecialtyTranslationFull,
  AdvisorSearchRequest,
  AdvisorSearchResponse,
  TranslationMetric,
  MultilingualContent
} from './types';

export class AdvisorService implements IAdvisorService {
  private logger = ServerLoggingService.getInstance();

  constructor() {
    if (!pool) {
      throw new Error('Database connection not available');
    }
  }

  // =====================================================
  // Draft Management
  // =====================================================

  async createOrUpdateDraft(params: CreateDraftParams): Promise<DraftResult> {
    const { userId, professionalData, status = 'draft' } = params;
    
    try {
      // Validate professional data
      const validationErrors = this.validateProfessionalData(professionalData);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: `Validation failed: ${validationErrors.join(', ')}`
        };
      }

      // Use expert-recommended UPSERT function
      const result = await pool!.query(
        'SELECT upsert_advisor_draft($1, $2, $3) as draft_id',
        [userId, JSON.stringify(professionalData), status]
      );

      const draftId = result.rows[0].draft_id;

      // Add event to timeline
      await this.addEvent({
        userId,
        eventType: 'draft_updated',
        eventData: { 
          status,
          sectionsCompleted: professionalData.completedSections || []
        },
        eventCode: 'advisor.draft.updated'
      });

      // Fetch complete draft data
      const draft = await this.getDraftByUserId(userId);
      
      return {
        success: true,
        draftId,
        data: draft || undefined
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error creating/updating advisor draft', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  async getDraft(userId: string): Promise<DraftResult> {
    try {
      const draft = await this.getDraftByUserId(userId);
      
      if (!draft) {
        return {
          success: false,
          error: 'Draft not found'
        };
      }

      return {
        success: true,
        data: draft
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching advisor draft', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });

      return {
        success: false,
        error: 'Database error'
      };
    }
  }

  async submitApplication(userId: string): Promise<DraftResult> {
    try {
      // Get current draft
      const draft = await this.getDraftByUserId(userId);
      if (!draft) {
        return {
          success: false,
          error: 'No draft found to submit'
        };
      }

      if (draft.status !== 'draft') {
        return {
          success: false,
          error: 'Application has already been submitted'
        };
      }

      // Validate completeness
      const validationErrors = this.validateApplicationCompleteness(draft.professional_data);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: `Application incomplete: ${validationErrors.join(', ')}`
        };
      }

      // Update status to submitted with timestamp
      const result = await pool!.query(`
        UPDATE advisor_application_drafts 
        SET status = 'submitted', submitted_at = now(), updated_at = now()
        WHERE user_id = $1 AND is_active = true
        RETURNING id
      `, [userId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Draft not found or already submitted'
        };
      }

      // Add event to timeline
      await this.addEvent({
        userId,
        eventType: 'application_submitted',
        eventData: { 
          submittedAt: new Date().toISOString(),
          completedSections: draft.professional_data.completedSections || []
        },
        eventCode: 'advisor.application.submitted'
      });

      // Return updated draft
      const updatedDraft = await this.getDraftByUserId(userId);
      
      return {
        success: true,
        draftId: result.rows[0].id,
        data: updatedDraft || undefined
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error submitting advisor application', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });

      return {
        success: false,
        error: 'Database error'
      };
    }
  }

  // =====================================================
  // Profile Management
  // =====================================================

  async getAdvisorProfile(userId: string, lang?: SupportedLanguage): Promise<Advisor | null> {
    try {
      const language = lang || 'en';
      
      const result = await pool!.query(`
        SELECT 
          a.*,
          get_advisor_bio_localized(a.user_id, $2) as localized_bio,
          get_advisor_available_languages(a.user_id) as available_languages
        FROM advisors a
        WHERE a.user_id = $1
      `, [userId, language]);

      if (result.rows.length === 0) {
        return null;
      }

      const advisor = this.mapRowToAdvisor(result.rows[0]);
      advisor.localized_bio = result.rows[0].localized_bio;
      advisor.available_languages = result.rows[0].available_languages;

      // Get localized specialties
      if (advisor.specialties.length > 0) {
        const specialtyTranslations = await this.getSpecialtyTranslations(language);
        advisor.localized_specialties = advisor.specialties.map(spec => {
          const translation = specialtyTranslations.find(t => t.specialty_key === spec);
          return translation || { specialty_key: spec, language_code: language, display_name: spec };
        });
      }

      // Log profile view metric
      await this.logTranslationMetric({
        advisor_user_id: userId,
        language_code: language,
        action_type: 'profile_view',
        metadata: { 
          has_localized_bio: !!result.rows[0].localized_bio 
        }
      });

      return advisor;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching advisor profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      throw new AdvisorError('DATABASE_ERROR', 'Failed to fetch advisor profile');
    }
  }

  async updateAdvisorProfile(params: UpdateAdvisorParams): Promise<Advisor> {
    const { advisorId, updates, authenticatedClaims } = params;

    try {
      // Build dynamic SET clause for allowed fields
      const allowedFields = [
        'display_name', 'bio', 'avatar_url', 'skills', 'specialties', 
        'languages', 'cal_com_event_type_url', 'is_accepting_bookings', 'country_code'
      ];

      const setClause: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key) && value !== undefined) {
          setClause.push(`${key} = $${paramIndex}`);
          values.push(Array.isArray(value) ? value : value);
          paramIndex++;
        }
      });

      if (setClause.length === 0) {
        throw new AdvisorError('VALIDATION_ERROR', 'No valid fields to update');
      }

      setClause.push(`updated_at = now()`);

      const query = `
        UPDATE advisors 
        SET ${setClause.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `;

      values.push(advisorId, authenticatedClaims.userId);

      const result = await pool!.query(query, values);

      if (result.rows.length === 0) {
        throw new AdvisorError('ADVISOR_NOT_FOUND', 'Advisor not found or access denied');
      }

      // Add event to timeline
      await this.addEvent({
        userId: authenticatedClaims.userId,
        advisorId,
        eventType: 'profile_updated',
        eventData: { updatedFields: Object.keys(updates) },
        createdBy: authenticatedClaims.userId,
        actorType: 'user',
        eventCode: 'advisor.profile.updated'
      });

      return this.mapRowToAdvisor(result.rows[0]);

    } catch (error) {
      if (error instanceof AdvisorError) {
        throw error;
      }

      await this.logger.logServerEvent('error', 'error', 'Error updating advisor profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        advisorId,
        userId: authenticatedClaims.userId 
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to update advisor profile');
    }
  }

  // =====================================================
  // Multilingual Bio Management
  // =====================================================

  async updateAdvisorBio(userId: string, language: SupportedLanguage, bioContent: string): Promise<boolean> {
    try {
      // Validate language
      const validLanguages: SupportedLanguage[] = ['en', 'ar', 'fr', 'es', 'de'];
      if (!validLanguages.includes(language)) {
        throw new AdvisorError('INVALID_LANGUAGE_CODE', `Invalid language code: ${language}`);
      }

      // Security validation - plain text only
      if (this.containsHtmlContent(bioContent)) {
        throw new AdvisorError('BIO_CONTENT_INVALID', 'HTML content not allowed in bio');
      }

      if (bioContent.length > 2000) {
        throw new AdvisorError('BIO_CONTENT_INVALID', 'Bio content too long (max 2000 characters)');
      }

      // Use the atomic update function from migration
      const result = await pool!.query(
        'SELECT update_advisor_bio_atomic($1, $2, $3) as success',
        [userId, language, bioContent]
      );

      const success = result.rows[0]?.success || false;

      if (success) {
        // Add event to timeline
        await this.addEvent({
          userId,
          eventType: 'profile_updated',
          eventData: { 
            field: 'multilingual_bio',
            language,
            content_length: bioContent.length
          },
          eventCode: 'advisor.bio.updated'
        });
      }

      return success;

    } catch (error) {
      if (error instanceof AdvisorError) {
        throw error;
      }

      await this.logger.logServerEvent('error', 'error', 'Error updating advisor bio', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        language
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to update advisor bio');
    }
  }

  async getAdvisorBioLocalized(userId: string, language: SupportedLanguage): Promise<string | null> {
    try {
      const result = await pool!.query(
        'SELECT get_advisor_bio_localized($1, $2) as localized_bio',
        [userId, language]
      );

      return result.rows[0]?.localized_bio || null;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching localized bio', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        language
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to fetch localized bio');
    }
  }

  async getAdvisorAvailableLanguages(userId: string): Promise<SupportedLanguage[]> {
    try {
      const result = await pool!.query(
        'SELECT get_advisor_available_languages($1) as available_languages',
        [userId]
      );

      return result.rows[0]?.available_languages || [];

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching available languages', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to fetch available languages');
    }
  }

  // =====================================================
  // Specialty Translation Management
  // =====================================================

  async getSpecialtyTranslations(language: SupportedLanguage): Promise<SpecialtyTranslation[]> {
    try {
      const result = await pool!.query(`
        SELECT specialty_key, language_code, display_name, description
        FROM advisor_specialty_translations
        WHERE language_code = $1
        ORDER BY specialty_key
      `, [language]);

      return result.rows.map(row => ({
        specialty_key: row.specialty_key,
        language_code: row.language_code,
        display_name: row.display_name,
        description: row.description
      }));

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching specialty translations', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        language
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to fetch specialty translations');
    }
  }

  async createSpecialtyTranslation(translation: Omit<SpecialtyTranslationFull, 'id' | 'created_at' | 'updated_at'>): Promise<SpecialtyTranslationFull> {
    try {
      const result = await pool!.query(`
        INSERT INTO advisor_specialty_translations (specialty_key, language_code, display_name, description, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, specialty_key, language_code, display_name, description, created_at, updated_at, created_by
      `, [translation.specialty_key, translation.language_code, translation.display_name, translation.description, translation.created_by]);

      if (result.rows.length === 0) {
        throw new AdvisorError('DATABASE_ERROR', 'Failed to create specialty translation');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        specialty_key: row.specialty_key,
        language_code: row.language_code,
        display_name: row.display_name,
        description: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error creating specialty translation', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        translation
      });

      throw new AdvisorError('SPECIALTY_TRANSLATION_ERROR', 'Failed to create specialty translation');
    }
  }

  async updateSpecialtyTranslation(id: string, updates: Partial<SpecialtyTranslation>): Promise<SpecialtyTranslationFull> {
    try {
      // Build dynamic SET clause
      const setClause: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (['display_name', 'description'].includes(key) && value !== undefined) {
          setClause.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (setClause.length === 0) {
        throw new AdvisorError('VALIDATION_ERROR', 'No valid fields to update');
      }

      setClause.push(`updated_at = now()`);
      values.push(id); // ID parameter

      const result = await pool!.query(`
        UPDATE advisor_specialty_translations 
        SET ${setClause.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, specialty_key, language_code, display_name, description, created_at, updated_at, created_by
      `, values);

      if (result.rows.length === 0) {
        throw new AdvisorError('TRANSLATION_NOT_FOUND', 'Specialty translation not found');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        specialty_key: row.specialty_key,
        language_code: row.language_code,
        display_name: row.display_name,
        description: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by
      };

    } catch (error) {
      if (error instanceof AdvisorError) {
        throw error;
      }

      await this.logger.logServerEvent('error', 'error', 'Error updating specialty translation', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
        updates
      });

      throw new AdvisorError('SPECIALTY_TRANSLATION_ERROR', 'Failed to update specialty translation');
    }
  }

  // =====================================================
  // Search with Language Support
  // =====================================================

  async searchAdvisors(request: AdvisorSearchRequest): Promise<AdvisorSearchResponse> {
    try {
      const {
        query = '',
        specialties = [],
        languages = [],
        country_code,
        min_rating = 0,
        lang = 'en',
        page = 1,
        limit = 20
      } = request;

      const offset = (page - 1) * limit;

      // Build WHERE conditions
      const conditions: string[] = ['a.approval_status = $1', 'a.is_accepting_bookings = $2'];
      const values: any[] = ['approved', true];
      let paramIndex = 3;

      if (query.trim()) {
        conditions.push(`(a.display_name ILIKE $${paramIndex} OR get_advisor_bio_localized(a.user_id, $${paramIndex + 1}) ILIKE $${paramIndex})`);
        values.push(`%${query.trim()}%`, lang);
        paramIndex += 2;
      }

      if (specialties.length > 0) {
        conditions.push(`a.specialties && $${paramIndex}`);
        values.push(specialties);
        paramIndex++;
      }

      if (languages.length > 0) {
        conditions.push(`a.languages && $${paramIndex}`);
        values.push(languages);
        paramIndex++;
      }

      if (country_code) {
        conditions.push(`a.country_code = $${paramIndex}`);
        values.push(country_code);
        paramIndex++;
      }

      if (min_rating > 0) {
        conditions.push(`a.rating >= $${paramIndex}`);
        values.push(min_rating);
        paramIndex++;
      }

      // Main query
      const advisorQuery = `
        SELECT 
          a.*,
          get_advisor_bio_localized(a.user_id, $${paramIndex}) as localized_bio,
          get_advisor_available_languages(a.user_id) as available_languages
        FROM advisors a
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.rating DESC, a.review_count DESC
        LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
      `;

      values.push(lang, limit, offset);
      const advisorResult = await pool!.query(advisorQuery, values);

      // Count query for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM advisors a
        WHERE ${conditions.join(' AND ')}
      `;
      const countValues = values.slice(0, values.length - 3); // Remove lang, limit, offset
      const countResult = await pool!.query(countQuery, countValues);

      // Get specialty translations for filters
      const specialtyTranslations = await this.getSpecialtyTranslations(lang);

      // Map results
      const advisors = await Promise.all(advisorResult.rows.map(async (row) => {
        const advisor = this.mapRowToAdvisor(row);
        advisor.localized_bio = row.localized_bio;
        advisor.available_languages = row.available_languages;
        
        // Add localized specialties
        advisor.localized_specialties = advisor.specialties.map(spec => {
          const translation = specialtyTranslations.find(t => t.specialty_key === spec);
          return translation || { specialty_key: spec, language_code: lang, display_name: spec };
        });

        // Log search metric
        await this.logTranslationMetric({
          advisor_user_id: advisor.user_id,
          language_code: lang,
          action_type: 'search_result',
          metadata: { query, page }
        });

        return advisor;
      }));

      return {
        advisors,
        total: parseInt(countResult.rows[0].total),
        page,
        limit,
        available_filters: {
          specialties: specialtyTranslations,
          languages: ['en', 'ar', 'fr', 'es', 'de'] as SupportedLanguage[],
          countries: [] // Could be populated from a query if needed
        }
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error searching advisors', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        request
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to search advisors');
    }
  }

  // =====================================================
  // Translation Metrics
  // =====================================================

  async logTranslationMetric(metric: Omit<TranslationMetric, 'id' | 'created_at'>): Promise<string> {
    try {
      const result = await pool!.query(`
        INSERT INTO advisor_translation_metrics (advisor_user_id, language_code, action_type, content_length, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [metric.advisor_user_id, metric.language_code, metric.action_type, metric.content_length, JSON.stringify(metric.metadata)]);

      return result.rows[0].id;

    } catch (error) {
      // Don't throw on metrics logging failure - just log it
      await this.logger.logServerEvent('error', 'warn', 'Error logging translation metric', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        metric
      });

      return '';
    }
  }

  // =====================================================
  // Event Timeline
  // =====================================================

  async addEvent(params: CreateEventParams): Promise<string> {
    const { 
      userId, 
      advisorId, 
      eventType, 
      eventData = {}, 
      createdBy, 
      actorType = 'system',
      eventCode 
    } = params;

    try {
      const result = await pool!.query(
        'SELECT add_advisor_event($1, $2, $3, $4, $5, $6, $7) as event_id',
        [userId, advisorId, eventType, JSON.stringify(eventData), createdBy, actorType, eventCode]
      );

      return result.rows[0].event_id;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error adding advisor event', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        eventType 
      });
      
      throw new AdvisorError('DATABASE_ERROR', 'Failed to add advisor event');
    }
  }

  async getEventTimeline(userId: string, limit: number = 50): Promise<AdvisorEvent[]> {
    try {
      const result = await pool!.query(`
        SELECT * FROM advisor_event_timeline 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [userId, limit]);

      return result.rows.map(row => this.mapRowToEvent(row));

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching event timeline', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to fetch event timeline');
    }
  }

  // =====================================================
  // Admin Functions
  // =====================================================

  async getApplicationsForReview(status?: AdvisorApplicationStatus): Promise<AdvisorApplicationDraft[]> {
    try {
      let query = `
        SELECT d.*, u.email as user_email
        FROM advisor_application_drafts d
        JOIN auth.users u ON d.user_id = u.id
        WHERE d.is_active = true
      `;
      const params: any[] = [];

      if (status) {
        query += ' AND d.status = $1';
        params.push(status);
      }

      query += ' ORDER BY d.updated_at ASC';

      const result = await pool!.query(query, params);

      return result.rows.map(row => this.mapRowToDraft(row));

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching applications for review', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        status 
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to fetch applications');
    }
  }

  async startReview(userId: string, adminUserId: string): Promise<void> {
    try {
      const result = await pool!.query(`
        UPDATE advisors 
        SET review_started_at = now(), updated_at = now()
        WHERE user_id = $1 AND review_started_at IS NULL
        RETURNING id
      `, [userId]);

      if (result.rows.length === 0) {
        throw new AdvisorError('ADVISOR_NOT_FOUND', 'Advisor not found or review already started');
      }

      // Add event to timeline
      await this.addEvent({
        userId,
        advisorId: result.rows[0].id,
        eventType: 'review_started',
        eventData: { adminUserId },
        createdBy: adminUserId,
        actorType: 'admin',
        eventCode: 'advisor.review.started'
      });

    } catch (error) {
      if (error instanceof AdvisorError) {
        throw error;
      }

      await this.logger.logServerEvent('error', 'error', 'Error starting advisor review', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        adminUserId 
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to start review');
    }
  }

  async completeReview(userId: string, adminUserId: string, approved: boolean, notes?: string): Promise<void> {
    try {
      const approvalStatus = approved ? 'approved' : 'rejected';

      const result = await pool!.query(`
        UPDATE advisors 
        SET 
          approval_status = $1,
          review_completed_at = now(),
          approved_by = $2,
          approved_at = CASE WHEN $3 THEN now() ELSE NULL END,
          updated_at = now()
        WHERE user_id = $4 AND review_started_at IS NOT NULL AND review_completed_at IS NULL
        RETURNING id
      `, [approvalStatus, adminUserId, approved, userId]);

      if (result.rows.length === 0) {
        throw new AdvisorError('ADVISOR_NOT_FOUND', 'Advisor not found or review not in progress');
      }

      // Add event to timeline
      await this.addEvent({
        userId,
        advisorId: result.rows[0].id,
        eventType: 'review_completed',
        eventData: { 
          approved, 
          adminUserId, 
          notes: notes || null 
        },
        createdBy: adminUserId,
        actorType: 'admin',
        eventCode: approved ? 'advisor.review.approved' : 'advisor.review.rejected'
      });

    } catch (error) {
      if (error instanceof AdvisorError) {
        throw error;
      }

      await this.logger.logServerEvent('error', 'error', 'Error completing advisor review', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        adminUserId,
        approved 
      });

      throw new AdvisorError('DATABASE_ERROR', 'Failed to complete review');
    }
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  private async getDraftByUserId(userId: string): Promise<AdvisorApplicationDraft | null> {
    const result = await pool!.query(`
      SELECT * FROM advisor_application_drafts 
      WHERE user_id = $1 AND is_active = true
    `, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDraft(result.rows[0]);
  }

  private mapRowToDraft(row: any): AdvisorApplicationDraft {
    return {
      id: row.id,
      user_id: row.user_id,
      status: row.status,
      submitted_at: row.submitted_at,
      professional_data: row.professional_data,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_active: row.is_active
    };
  }

  private mapRowToAdvisor(row: any): Advisor {
    return {
      id: row.id,
      user_id: row.user_id,
      display_name: row.display_name,
      bio: row.bio,
      avatar_url: row.avatar_url,
      skills: row.skills || [],
      specialties: row.specialties || [],
      languages: row.languages || [],
      rating: parseFloat(row.rating) || 0,
      review_count: row.review_count || 0,
      approval_status: row.approval_status,
      stripe_connect_account_id: row.stripe_connect_account_id,
      cal_com_event_type_url: row.cal_com_event_type_url,
      is_accepting_bookings: row.is_accepting_bookings,
      country_code: row.country_code,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      onboarding_steps: row.onboarding_steps || {},
      review_started_at: row.review_started_at,
      review_completed_at: row.review_completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapRowToEvent(row: any): AdvisorEvent {
    return {
      id: row.id,
      user_id: row.user_id,
      advisor_id: row.advisor_id,
      event_type: row.event_type,
      event_data: row.event_data || {},
      created_by: row.created_by,
      actor_type: row.actor_type,
      event_code: row.event_code,
      created_at: row.created_at
    };
  }

  private validateProfessionalData(data: Partial<ProfessionalData>): string[] {
    const errors: string[] = [];
    const validation = ADVISOR_VALIDATION.professionalData;

    // Check required fields only if data is being marked complete
    if (data.isComplete) {
      validation.required.forEach(field => {
        if (!data[field]) {
          errors.push(`${field} is required`);
        }
      });

      // Validate skills count
      if (data.skills && data.skills.length < validation.minSkills) {
        errors.push(`At least ${validation.minSkills} skills are required`);
      }

      // Validate specialties count
      if (data.specialties && data.specialties.length < validation.minSpecialties) {
        errors.push(`At least ${validation.minSpecialties} specialty is required`);
      }

      // Validate years experience
      if (data.yearsExperience !== undefined) {
        if (data.yearsExperience < validation.minYearsExperience || 
            data.yearsExperience > validation.maxYearsExperience) {
          errors.push(`Years of experience must be between ${validation.minYearsExperience} and ${validation.maxYearsExperience}`);
        }
      }
    }

    return errors;
  }

  private validateApplicationCompleteness(data: ProfessionalData): string[] {
    const errors: string[] = [];
    const validation = ADVISOR_VALIDATION.professionalData;

    validation.required.forEach(field => {
      if (!data[field]) {
        errors.push(`${field} is required`);
      }
    });

    if (data.skills.length < validation.minSkills) {
      errors.push(`At least ${validation.minSkills} skills are required`);
    }

    if (data.specialties.length < validation.minSpecialties) {
      errors.push(`At least ${validation.minSpecialties} specialty is required`);
    }

    if (data.yearsExperience < validation.minYearsExperience || 
        data.yearsExperience > validation.maxYearsExperience) {
      errors.push(`Years of experience must be between ${validation.minYearsExperience} and ${validation.maxYearsExperience}`);
    }

    return errors;
  }

  // Security validation helper for bio content
  private containsHtmlContent(content: string): boolean {
    // Check for HTML tags
    if (content.match(/<[^>]*>/)) {
      return true;
    }
    
    // Check for script-like content
    if (content.match(/(javascript:|data:|vbscript:|onload|onerror)/i)) {
      return true;
    }
    
    return false;
  }
}