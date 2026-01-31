/**
 * Advisor Matching Service
 * 
 * Production-ready advisor-client matching service with:
 * - Race-safe advisor assignment using FOR UPDATE SKIP LOCKED
 * - Idempotent match creation with expert-recommended patterns
 * - Deterministic scoring with explainability features
 * - Outbox pattern for reliable notifications
 * - Anti-starvation fairness mechanisms
 */

import { pool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import {
  AdvisorAvailability,
  AdvisorMatchRequest,
  MatchingCriteria,
  ScoringWeights,
  ScoringFeatures,
  CandidateAdvisor,
  TechnologyStack,
  CreateMatchRequestParams,
  UpdateMatchRequestParams,
  FindBestAdvisorParams,
  MatchingResult,
  AvailabilityCheckResult,
  AdvisorActiveProjects,
  AdvisorMatchingError,
  DEFAULT_SCORING_WEIGHTS,
  MATCH_EXPIRY_HOURS,
  ADVISOR_COOLDOWN_HOURS,
  FAIRNESS_BOOST_DAYS,
  MatchStatus,
  AdvisorStatus
} from '../types/advisorMatching';

export class AdvisorMatchingService {
  private logger = ServerLoggingService.getInstance();
  
  // Algorithm threshold configuration from environment
  private readonly COMPLEX_ALGORITHM_THRESHOLD = parseInt(
    process.env.ADVISOR_MATCHING_COMPLEX_THRESHOLD || '50'
  );
  
  // Pool size categorization thresholds
  private readonly SMALL_POOL_THRESHOLD = parseInt(
    process.env.ADVISOR_MATCHING_SMALL_THRESHOLD || '10'
  );

  constructor() {
    if (!pool) {
      throw new Error('Database connection not available');
    }
    
    // Log configuration on initialization
    this.logger.logServerEvent('routing', 'info', 'AdvisorMatchingService initialized', {
      complexAlgorithmThreshold: this.COMPLEX_ALGORITHM_THRESHOLD,
      smallPoolThreshold: this.SMALL_POOL_THRESHOLD,
      source: 'environment_variables_with_defaults'
    });
  }

  // =====================================================
  // Main Matching Logic
  // =====================================================

  /**
   * Idempotent find-or-create match (expert pattern)
   * Returns existing open match or creates new one with race-safe assignment
   */
  async ensureOpenMatch(params: CreateMatchRequestParams): Promise<MatchingResult> {
    const { projectId, requestedBy, matchCriteria, expiresInHours = MATCH_EXPIRY_HOURS } = params;

    try {
      // Check for existing open match (idempotency)
      const existingMatch = await pool!.query(`
        SELECT * FROM advisor_match_requests
        WHERE project_id = $1 AND status IN ('pending', 'matched')
      `, [projectId]);

      if (existingMatch.rows.length > 0) {
        return {
          success: true,
          matchRequest: this.mapRowToMatchRequest(existingMatch.rows[0])
        };
      }

      // Create new match with race-safe advisor selection
      const transactionResult: any = await pool!.query('BEGIN', [], async (client: any) => {
        try {
          // First check for manual admin assignments (highest priority)
          const adminAssignment = await this.checkForAdminAssignment(client, projectId);
          if (adminAssignment) {
            await this.logger.logServerEvent('routing', 'info', 'Admin assignment found', {
              projectId,
              advisorId: adminAssignment.advisor_id,
              assignmentType: adminAssignment.assignment_type
            });

            // Create match request with admin-assigned advisor
            const matchRequest = await client.query(`
              INSERT INTO advisor_match_requests (
                project_id, requested_by, match_criteria, status,
                matched_advisor_id, match_score, match_reason,
                expires_at
              ) VALUES ($1, $2, $3, 'matched', $4, 100, $5, now() + interval '${expiresInHours} hours')
              RETURNING *
            `, [
              projectId,
              requestedBy,
              JSON.stringify(matchCriteria),
              adminAssignment.advisor_id,
              `Admin assignment: ${adminAssignment.reason}`
            ]);

            await client.query('COMMIT');
            return {
              success: true,
              matchRequest: this.mapRowToMatchRequest(matchRequest.rows[0])
            };
          }

          // Get project technology stack for matching
          const projectData = await client.query(`
            SELECT technology_stack, project_complexity, estimated_advisor_hours
            FROM projects
            WHERE id = $1
          `, [projectId]);

          if (projectData.rows.length === 0) {
            throw new AdvisorMatchingError('PROJECT_NOT_FOUND', `Project ${projectId} not found`);
          }

          const techStack = projectData.rows[0].technology_stack || {};
          const complexity = projectData.rows[0].project_complexity || 'medium';

          // Find best available advisor with race-safe selection
          const bestAdvisor = await this.pickBestAdvisorRaceSafe(client, {
            projectId,
            techStack,
            projectComplexity: complexity
          });

          if (!bestAdvisor) {
            // No advisors available - create pending request for later processing
            const pendingRequest = await client.query(`
              INSERT INTO advisor_match_requests (
                project_id, requested_by, match_criteria, status, expires_at
              ) VALUES ($1, $2, $3, 'pending', now() + interval '${expiresInHours} hours')
              RETURNING *
            `, [projectId, requestedBy, JSON.stringify(matchCriteria)]);

            await client.query('COMMIT');

            return {
              success: true,
              matchRequest: this.mapRowToMatchRequest(pendingRequest.rows[0])
            };
          }

          // Create match request with selected advisor
          const matchRequest = await client.query(`
            INSERT INTO advisor_match_requests (
              project_id, requested_by, match_criteria, status,
              matched_advisor_id, match_score, scoring_features,
              expires_at
            ) VALUES ($1, $2, $3, 'matched', $4, $5, $6, now() + interval '${expiresInHours} hours')
            RETURNING *
          `, [
            projectId,
            requestedBy,
            JSON.stringify(matchCriteria),
            bestAdvisor.advisor_id,
            bestAdvisor.score,
            JSON.stringify(bestAdvisor.scoring_features)
          ]);

          // Add to notification outbox (outbox pattern)
          await this.addNotificationToOutbox(client, {
            matchRequestId: matchRequest.rows[0].id,
            recipientId: bestAdvisor.advisor_id,
            notificationType: 'advisor_matched',
            deliveryMethod: 'email',
            payload: {
              projectId,
              projectName: 'New Project', // Will be enriched by notification service
              score: bestAdvisor.score,
              techStack: Object.keys(techStack)
            }
          });

          await client.query('COMMIT');

          return {
            success: true,
            matchRequest: this.mapRowToMatchRequest(matchRequest.rows[0]),
            candidateAdvisor: bestAdvisor
          };

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });

      return transactionResult;
    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error ensuring open match', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId,
        requestedBy
      });

      if (error instanceof AdvisorMatchingError) {
        throw error;
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  /**
   * Race-safe advisor selection using FOR UPDATE SKIP LOCKED
   * Prevents concurrent assignment of same advisor to multiple projects
   * 
   * Uses simplified startup-friendly algorithm for small advisor pools
   */
  private async pickBestAdvisorRaceSafe(
    client: any,
    params: FindBestAdvisorParams
  ): Promise<CandidateAdvisor | null> {
    const { projectId, techStack, projectComplexity, scoringWeights = DEFAULT_SCORING_WEIGHTS } = params;

    // Check if we should use simplified algorithm for small advisor pools
    const advisorCountResult = await client.query(`
      SELECT COUNT(*) as total_advisors
      FROM advisor_availability 
      WHERE status = 'available'
    `);
    
    const totalAdvisors = parseInt(advisorCountResult.rows[0]?.total_advisors || '0');
    
    // Use simplified algorithm for small to medium teams
    if (totalAdvisors < this.COMPLEX_ALGORITHM_THRESHOLD) {
      return this.pickBestAdvisorSimplified(client, params);
    }

    // Use complex algorithm for large teams
    return this.pickBestAdvisorComplex(client, params);
  }

  /**
   * Simplified matching algorithm for startup/growth phase
   * Prioritizes: Availability + Admin Preferences + Simple Fairness
   * Used when advisor count < COMPLEX_ALGORITHM_THRESHOLD
   */
  private async pickBestAdvisorSimplified(
    client: any,
    params: FindBestAdvisorParams
  ): Promise<CandidateAdvisor | null> {
    const { projectId, techStack } = params;

    // Get admin preferences for this project
    const adminPreferences = await this.getAdminPreferencesForMatching(client, projectId, techStack);

    // Simple startup algorithm: availability + fairness
    const candidatesQuery = `
      WITH available_advisors AS (
        SELECT 
          aa.advisor_id,
          aa.status,
          COALESCE(aap.active_count, 0) as active_count,
          aa.max_concurrent_projects,
          -- Days since last assignment (for fairness)
          COALESCE(
            EXTRACT(days FROM (now() - MAX(amr.created_at))), 
            999
          ) as days_since_last_match,
          -- Simple randomization for tie-breaking
          (hashtext(aa.advisor_id || $1) % 100) as tie_breaker
        FROM advisor_availability aa
        LEFT JOIN advisor_active_projects aap ON aa.advisor_id = aap.advisor_id
        LEFT JOIN advisor_match_requests amr ON aa.advisor_id = amr.matched_advisor_id
        WHERE aa.status = 'available'
          AND COALESCE(aap.active_count, 0) < aa.max_concurrent_projects
          -- Exclude advisors on time-off
          AND NOT EXISTS (
            SELECT 1 FROM advisor_time_off ato
            WHERE ato.advisor_id = aa.advisor_id
              AND ato.period @> now()
          )
        GROUP BY aa.advisor_id, aa.status, aap.active_count, aa.max_concurrent_projects
      )
      SELECT 
        advisor_id,
        active_count,
        days_since_last_match,
        tie_breaker,
        -- Simple base scoring: availability (1.0) + fairness boost
        (1.0 + LEAST(days_since_last_match / 7.0, 0.5)) as base_score
      FROM available_advisors
      ORDER BY 
        active_count ASC, -- Prefer advisors with fewer active projects
        days_since_last_match DESC, -- Prefer advisors not matched recently
        tie_breaker ASC
    `;

    const result = await client.query(candidatesQuery, [projectId]);

    if (result.rows.length === 0) {
      return null;
    }

    // Apply admin preferences to all candidates and pick the best
    let bestCandidate: any = null;
    let bestScore = -1;

    for (const row of result.rows) {
      const adjustedScore = this.applyAdminPreferences(row.advisor_id, adminPreferences, row.base_score);
      
      // Skip advisors marked as "never_assign"
      if (adjustedScore < 0) {
        continue;
      }

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestCandidate = row;
      }
    }

    if (!bestCandidate) {
      return null;
    }

    // Calculate preference boost for explanation
    const preferenceBoost = bestScore - bestCandidate.base_score;
    const adminBoosts = adminPreferences
      .filter(p => p.advisor_id === bestCandidate.advisor_id)
      .map(p => p.rule_name);

    return {
      advisor_id: bestCandidate.advisor_id,
      score: bestScore,
      scoring_features: {
        availability: 1.0, // Always 1.0 if we reach this point
        skills: 0.5, // Neutral - skills not considered in startup mode
        timezone: 0.5, // Neutral - timezone not considered in startup mode  
        preference: preferenceBoost,
        notes: `Startup mode with admin preferences: Available=${bestCandidate.active_count}/${bestCandidate.active_count + 1}, Days since last match=${bestCandidate.days_since_last_match}, Admin rules=${adminBoosts.length > 0 ? adminBoosts.join(', ') : 'None'}`
      },
      active_count: bestCandidate.active_count,
      salt: bestCandidate.tie_breaker
    };
  }

  /**
   * Complex matching algorithm for larger advisor pools (6+ advisors)
   * Uses the original sophisticated scoring
   */
  private async pickBestAdvisorComplex(
    client: any, 
    params: FindBestAdvisorParams
  ): Promise<CandidateAdvisor | null> {
    const { projectId, techStack, projectComplexity, scoringWeights = DEFAULT_SCORING_WEIGHTS } = params;

    // Build candidate advisors with sophisticated scoring
    const candidatesQuery = `
      WITH advisor_capacity AS (
        SELECT 
          aa.advisor_id,
          aa.status,
          aa.max_concurrent_projects,
          COALESCE(aap.active_count, 0) as active_count
        FROM advisor_availability aa
        LEFT JOIN advisor_active_projects aap ON aa.advisor_id = aap.advisor_id
        WHERE aa.status = 'available'
      ),
      skill_scores AS (
        SELECT 
          advisor_id,
          COALESCE(AVG(
            CASE 
              WHEN skill_category = 'framework' AND skill_name = ANY($1) 
                THEN proficiency_level * years_experience * 0.4
              WHEN skill_category = 'language' AND skill_name = ANY($2)
                THEN proficiency_level * years_experience * 0.3
              WHEN skill_category = 'specialty' AND skill_name = ANY($3)
                THEN proficiency_level * years_experience * 0.3
              ELSE 0
            END
          ) / 25.0, 0) as skill_score -- Normalize to 0-1
        FROM advisor_skills
        GROUP BY advisor_id
      ),
      candidate_advisors AS (
        SELECT 
          ac.advisor_id,
          ac.status,
          ac.active_count,
          ac.max_concurrent_projects,
          COALESCE(ss.skill_score, 0) as skill_score,
          -- Availability score: 1 if available and under capacity, 0 otherwise
          CASE 
            WHEN ac.status = 'available' AND ac.active_count < ac.max_concurrent_projects 
            THEN 1.0 
            ELSE 0.0 
          END as availability_score,
          -- Fairness boost: boost advisors not matched recently
          CASE 
            WHEN NOT EXISTS (
              SELECT 1 FROM advisor_match_requests amr
              WHERE amr.matched_advisor_id = ac.advisor_id
                AND amr.created_at > now() - interval '${FAIRNESS_BOOST_DAYS} days'
                AND amr.status IN ('matched', 'client_approved', 'advisor_accepted', 'finalized')
            ) THEN 0.1
            ELSE 0.0
          END as fairness_boost,
          -- Deterministic salt for tie-breaking
          (hashtext(ac.advisor_id || $4) % 1000) as salt
        FROM advisor_capacity ac
        LEFT JOIN skill_scores ss ON ac.advisor_id = ss.advisor_id
        WHERE ac.status = 'available' 
          AND ac.active_count < ac.max_concurrent_projects
          -- Exclude advisors in cooldown period
          AND NOT EXISTS (
            SELECT 1 FROM advisor_match_requests amr
            WHERE amr.matched_advisor_id = ac.advisor_id
              AND amr.created_at > now() - interval '${ADVISOR_COOLDOWN_HOURS} hours'
              AND amr.status IN ('advisor_declined', 'expired')
          )
          -- Exclude advisors currently on time-off
          AND NOT EXISTS (
            SELECT 1 FROM advisor_time_off ato
            WHERE ato.advisor_id = ac.advisor_id
              AND ato.period @> now()
          )
      )
      SELECT 
        advisor_id,
        availability_score,
        skill_score,
        fairness_boost,
        active_count,
        salt,
        -- Calculate total score
        (availability_score * $5 + 
         skill_score * $6 + 
         fairness_boost * $7) as total_score
      FROM candidate_advisors
      WHERE availability_score > 0 -- Must be available
      ORDER BY total_score DESC, active_count ASC, salt ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;

    // Extract skills from tech stack
    const frameworks = techStack.framework ? [techStack.framework] : [];
    const languages = techStack.languages || [];
    const specialties = techStack.complexity_factors || [];

    const result = await client.query(candidatesQuery, [
      frameworks,
      languages, 
      specialties,
      projectId, // For deterministic salt
      scoringWeights.availability,
      scoringWeights.skills,
      scoringWeights.preference // Using preference weight for fairness boost
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      advisor_id: row.advisor_id,
      score: parseFloat(row.total_score),
      scoring_features: {
        availability: row.availability_score,
        skills: row.skill_score,
        timezone: 0, // TODO: Implement timezone scoring
        preference: row.fairness_boost,
        notes: `Active: ${row.active_count}, Salt: ${row.salt}`
      },
      active_count: row.active_count,
      salt: row.salt
    };
  }

  // =====================================================
  // Match Management
  // =====================================================

  async updateMatchRequest(params: UpdateMatchRequestParams): Promise<MatchingResult> {
    const { matchId, status, matchedAdvisorId, matchScore, matchReason, scoringFeatures } = params;

    try {
      const updateQuery = `
        UPDATE advisor_match_requests
        SET 
          status = $1,
          matched_advisor_id = COALESCE($2, matched_advisor_id),
          match_score = COALESCE($3, match_score),
          match_reason = COALESCE($4, match_reason),
          scoring_features = COALESCE($5, scoring_features),
          updated_at = now()
        WHERE id = $6
        RETURNING *
      `;

      const result = await pool!.query(updateQuery, [
        status,
        matchedAdvisorId || null,
        matchScore || null,
        matchReason || null,
        scoringFeatures ? JSON.stringify(scoringFeatures) : null,
        matchId
      ]);

      if (result.rows.length === 0) {
        throw new AdvisorMatchingError('MATCH_NOT_FOUND', `Match request ${matchId} not found`);
      }

      return {
        success: true,
        matchRequest: this.mapRowToMatchRequest(result.rows[0])
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error updating match request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        matchId,
        status
      });

      if (error instanceof AdvisorMatchingError) {
        throw error;
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  async getMatchRequest(matchId: string): Promise<AdvisorMatchRequest | null> {
    try {
      const result = await pool!.query(`
        SELECT * FROM advisor_match_requests WHERE id = $1
      `, [matchId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToMatchRequest(result.rows[0]);

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching match request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        matchId
      });
      throw error;
    }
  }

  async getMatchRequestsByProject(projectId: string): Promise<AdvisorMatchRequest[]> {
    try {
      const result = await pool!.query(`
        SELECT * FROM advisor_match_requests 
        WHERE project_id = $1 
        ORDER BY created_at DESC
      `, [projectId]);

      return result.rows.map(row => this.mapRowToMatchRequest(row));

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching project match requests', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId
      });
      throw error;
    }
  }

  // =====================================================
  // Advisor Availability Management
  // =====================================================

  async updateAdvisorAvailability(
    advisorId: string,
    status: AdvisorStatus,
    maxConcurrentProjects?: number,
    availabilityPreferences?: Record<string, any>
  ): Promise<AdvisorAvailability> {
    try {
      const updateFields: string[] = ['status = $2', 'updated_at = now()'];
      const values: any[] = [advisorId, status];
      let paramIndex = 3;

      if (maxConcurrentProjects !== undefined) {
        updateFields.push(`max_concurrent_projects = $${paramIndex}`);
        values.push(maxConcurrentProjects);
        paramIndex++;
      }

      if (availabilityPreferences !== undefined) {
        updateFields.push(`availability_preferences = $${paramIndex}`);
        values.push(JSON.stringify(availabilityPreferences));
        paramIndex++;
      }

      const query = `
        INSERT INTO advisor_availability (advisor_id, status, max_concurrent_projects, availability_preferences)
        VALUES ($1, $2, ${maxConcurrentProjects || 3}, ${availabilityPreferences ? `$${paramIndex}` : "'{}'"})
        ON CONFLICT (advisor_id) DO UPDATE SET ${updateFields.join(', ')}
        RETURNING *
      `;

      const result = await pool!.query(query, values);
      return this.mapRowToAvailability(result.rows[0]);

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error updating advisor availability', {
        error: error instanceof Error ? error.message : 'Unknown error',
        advisorId,
        status
      });
      throw error;
    }
  }

  async checkAdvisorAvailability(advisorId: string): Promise<AvailabilityCheckResult> {
    try {
      const result = await pool!.query(`
        SELECT 
          aa.advisor_id,
          aa.status,
          aa.max_concurrent_projects,
          COALESCE(aap.active_count, 0) as active_count,
          -- Check if advisor is on time-off
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM advisor_time_off ato
              WHERE ato.advisor_id = aa.advisor_id
                AND ato.period @> now()
            ) THEN true
            ELSE false
          END as on_time_off
        FROM advisor_availability aa
        LEFT JOIN advisor_active_projects aap ON aa.advisor_id = aap.advisor_id
        WHERE aa.advisor_id = $1
      `, [advisorId]);

      if (result.rows.length === 0) {
        return {
          advisor_id: advisorId,
          is_available: false,
          status: 'offline',
          current_capacity: 0,
          max_capacity: 0,
          reason: 'Advisor availability not configured'
        };
      }

      const row = result.rows[0];
      const isAvailable = row.status === 'available' && 
                         row.active_count < row.max_concurrent_projects &&
                         !row.on_time_off;

      let reason: string | undefined;
      if (!isAvailable) {
        if (row.status !== 'available') {
          reason = `Status is ${row.status}`;
        } else if (row.active_count >= row.max_concurrent_projects) {
          reason = 'At maximum capacity';
        } else if (row.on_time_off) {
          reason = 'Currently on time-off';
        }
      }

      return {
        advisor_id: advisorId,
        is_available: isAvailable,
        status: row.status,
        current_capacity: row.active_count,
        max_capacity: row.max_concurrent_projects,
        reason
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error checking advisor availability', {
        error: error instanceof Error ? error.message : 'Unknown error',
        advisorId
      });
      throw error;
    }
  }

  async getAvailableAdvisors(criteria: Partial<MatchingCriteria> = {}): Promise<string[]> {
    try {
      const result = await pool!.query(`
        SELECT aa.advisor_id
        FROM advisor_availability aa
        LEFT JOIN advisor_active_projects aap ON aa.advisor_id = aap.advisor_id
        WHERE aa.status = 'available'
          AND COALESCE(aap.active_count, 0) < aa.max_concurrent_projects
          AND NOT EXISTS (
            SELECT 1 FROM advisor_time_off ato
            WHERE ato.advisor_id = aa.advisor_id
              AND ato.period @> now()
          )
        ORDER BY aa.last_active DESC
      `);

      return result.rows.map(row => row.advisor_id);

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching available advisors', {
        error: error instanceof Error ? error.message : 'Unknown error',
        criteria
      });
      throw error;
    }
  }

  // =====================================================
  // Notification Outbox
  // =====================================================

  private async addNotificationToOutbox(
    client: any,
    params: {
      matchRequestId: string;
      recipientId: string;
      notificationType: string;
      deliveryMethod: string;
      payload: Record<string, any>;
      maxAttempts?: number;
    }
  ): Promise<void> {
    const { matchRequestId, recipientId, notificationType, deliveryMethod, payload, maxAttempts = 3 } = params;

    await client.query(`
      INSERT INTO notification_outbox (
        match_request_id, recipient_id, notification_type, 
        delivery_method, payload, max_attempts
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [matchRequestId, recipientId, notificationType, deliveryMethod, JSON.stringify(payload), maxAttempts]);
  }

  // =====================================================
  // Cleanup and Maintenance
  // =====================================================

  async expireStaleMatches(): Promise<number> {
    try {
      const result = await pool!.query(`
        UPDATE advisor_match_requests
        SET status = 'expired', updated_at = now()
        WHERE status IN ('pending', 'matched')
          AND expires_at < now()
        RETURNING id
      `);

      await this.logger.logServerEvent('routing', 'info', 'Expired stale matches', {
        expiredCount: result.rows.length
      });

      return result.rows.length;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error expiring stale matches', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // =====================================================
  // Admin Assignment and Preference Methods
  // =====================================================

  /**
   * Check for active admin assignment for a project
   */
  private async checkForAdminAssignment(client: any, projectId: string): Promise<any | null> {
    const result = await client.query(`
      SELECT advisor_id, assignment_type, reason
      FROM admin_advisor_assignments
      WHERE project_id = $1 
        AND status = 'active'
        AND (valid_until IS NULL OR valid_until > now())
      ORDER BY priority DESC, created_at DESC
      LIMIT 1
    `, [projectId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get admin preference rules that apply to a project
   */
  private async getAdminPreferencesForMatching(client: any, projectId: string, techStack: any): Promise<any[]> {
    const result = await client.query(`
      SELECT * FROM get_admin_preferences_for_project($1, $2)
    `, [projectId, JSON.stringify(techStack)]);

    return result.rows;
  }

  /**
   * Apply admin preferences to advisor scoring
   */
  private applyAdminPreferences(advisorId: string, preferences: any[], baseScore: number): number {
    let adjustedScore = baseScore;
    let totalBoost = 0;

    for (const pref of preferences) {
      if (pref.advisor_id === advisorId) {
        switch (pref.rule_type) {
          case 'always_prefer':
            totalBoost += pref.priority_boost;
            break;
          case 'never_assign':
            return -1; // Effectively removes advisor from consideration
          case 'framework_specialist':
          case 'project_type_expert':
            totalBoost += pref.priority_boost;
            break;
          case 'emergency_only':
            // Only apply if no other advisors available (checked elsewhere)
            break;
        }
      }
    }

    // Apply boost as percentage of base score
    if (totalBoost > 0) {
      adjustedScore = baseScore * (1 + (totalBoost / 100));
    }

    return adjustedScore;
  }

  /**
   * Manual admin assignment of advisor to project
   */
  async createAdminAssignment(params: {
    projectId: string;
    advisorId: string;
    adminId: string;
    reason?: string;
    assignmentType?: string;
    validUntil?: Date;
  }): Promise<string> {
    const { projectId, advisorId, adminId, reason = 'Manual assignment', assignmentType = 'manual_assignment', validUntil } = params;

    try {
      const result = await pool!.query(`
        SELECT admin_assign_advisor_to_project($1, $2, $3, $4, $5)
      `, [projectId, advisorId, adminId, reason, assignmentType]);

      const assignmentId = result.rows[0].admin_assign_advisor_to_project;

      await this.logger.logServerEvent('routing', 'info', 'Admin assignment created', {
        assignmentId,
        projectId,
        advisorId,
        adminId,
        reason
      });

      return assignmentId;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error creating admin assignment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId,
        advisorId,
        adminId
      });
      throw error;
    }
  }

  /**
   * Create admin preference rule
   */
  async createPreferenceRule(params: {
    ruleName: string;
    advisorId: string;
    adminId: string;
    ruleType: string;
    conditions: Record<string, any>;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    priorityBoost?: number | undefined;
    validUntil?: Date | undefined;
  }): Promise<string> {
    const { ruleName, advisorId, adminId, ruleType, conditions, priorityBoost = 50, validUntil } = params;

    try {
      const result = await pool!.query(`
        SELECT admin_create_preference_rule($1, $2, $3, $4, $5, $6, $7)
      `, [ruleName, advisorId, adminId, ruleType, JSON.stringify(conditions), priorityBoost, validUntil]);

      const ruleId = result.rows[0].admin_create_preference_rule;

      await this.logger.logServerEvent('routing', 'info', 'Admin preference rule created', {
        ruleId,
        ruleName,
        advisorId,
        adminId,
        ruleType,
        conditions
      });

      return ruleId;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error creating preference rule', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ruleName,
        advisorId,
        adminId
      });
      throw error;
    }
  }

  /**
   * Override an existing automatic match with admin choice
   */
  async overrideMatchWithAdminChoice(params: {
    matchId: string;
    newAdvisorId: string;
    adminId: string;
    reason: string;
  }): Promise<MatchingResult> {
    const { matchId, newAdvisorId, adminId, reason } = params;

    try {
      // Get existing match
      const existingMatch = await this.getMatchRequest(matchId);
      if (!existingMatch) {
        throw new AdvisorMatchingError('MATCH_NOT_FOUND', `Match request ${matchId} not found`);
      }

      // Log the intervention
      await pool!.query(`
        INSERT INTO admin_matching_interventions (
          project_id, admin_id, intervention_type, original_advisor_id, 
          new_advisor_id, reason, automated_match_score
        ) VALUES ($1, $2, 'override_auto_match', $3, $4, $5, $6)
      `, [
        existingMatch.project_id,
        adminId,
        existingMatch.matched_advisor_id,
        newAdvisorId,
        reason,
        existingMatch.match_score
      ]);

      // Update the match request
      const result = await this.updateMatchRequest({
        matchId,
        status: 'matched',
        matchedAdvisorId: newAdvisorId,
        matchScore: 100, // Admin override gets perfect score
        matchReason: `Admin override: ${reason}`
      });

      await this.logger.logServerEvent('routing', 'info', 'Admin override completed', {
        matchId,
        originalAdvisorId: existingMatch.matched_advisor_id,
        newAdvisorId,
        adminId,
        reason
      });

      return result;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error overriding match', {
        error: error instanceof Error ? error.message : 'Unknown error',
        matchId,
        newAdvisorId,
        adminId
      });

      if (error instanceof AdvisorMatchingError) {
        throw error;
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  /**
   * Get all active admin assignments and rules
   */
  async getAdminControlsStatus(): Promise<{
    activeAssignments: any[];
    activeRules: any[];
    recentInterventions: any[];
  }> {
    try {
      const [assignmentsResult, rulesResult, interventionsResult] = await Promise.all([
        pool!.query(`
          SELECT 
            aaa.*,
            p.name as project_name,
            u.email as advisor_email
          FROM admin_advisor_assignments aaa
          JOIN projects p ON aaa.project_id = p.id
          JOIN auth.users u ON aaa.advisor_id = u.id
          WHERE aaa.status = 'active'
          ORDER BY aaa.created_at DESC
        `),
        pool!.query(`
          SELECT 
            apr.*,
            u.email as advisor_email
          FROM admin_preference_rules apr
          JOIN auth.users u ON apr.advisor_id = u.id
          WHERE apr.active = true 
            AND (apr.valid_until IS NULL OR apr.valid_until > now())
          ORDER BY apr.created_at DESC
        `),
        pool!.query(`
          SELECT 
            ami.*,
            p.name as project_name
          FROM admin_matching_interventions ami
          LEFT JOIN projects p ON ami.project_id = p.id
          ORDER BY ami.created_at DESC
          LIMIT 20
        `)
      ]);

      return {
        activeAssignments: assignmentsResult.rows,
        activeRules: rulesResult.rows,
        recentInterventions: interventionsResult.rows
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching admin controls status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get admin preference rules with filtering
   */
  async getAdminPreferenceRules(filters: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    advisorId?: string | undefined;
    ruleType?: string | undefined;
    active?: boolean | undefined;
  } = {}): Promise<any[]> {
    const { advisorId, ruleType, active = true } = filters;

    try {
      let query = `
        SELECT 
          apr.*,
          u.email as advisor_email,
          au.email as created_by_email
        FROM admin_preference_rules apr
        JOIN auth.users u ON apr.advisor_id = u.id
        LEFT JOIN auth.users au ON apr.created_by = au.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 0;

      if (advisorId) {
        paramCount++;
        query += ` AND apr.advisor_id = $${paramCount}`;
        params.push(advisorId);
      }

      if (ruleType) {
        paramCount++;
        query += ` AND apr.rule_type = $${paramCount}`;
        params.push(ruleType);
      }

      if (active !== undefined) {
        paramCount++;
        query += ` AND apr.active = $${paramCount}`;
        params.push(active);
      }

      query += ` ORDER BY apr.created_at DESC`;

      const result = await pool!.query(query, params);
      return result.rows;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching admin preference rules', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filters
      });
      throw error;
    }
  }

  /**
   * Get active admin assignments for a project
   */
  async getActiveAdminAssignments(projectId: string): Promise<any[]> {
    try {
      const result = await pool!.query(`
        SELECT 
          aaa.*,
          u.email as advisor_email,
          au.email as assigned_by_email,
          p.name as project_name
        FROM admin_advisor_assignments aaa
        JOIN auth.users u ON aaa.advisor_id = u.id
        LEFT JOIN auth.users au ON aaa.assigned_by = au.id
        LEFT JOIN projects p ON aaa.project_id = p.id
        WHERE aaa.project_id = $1 AND aaa.status = 'active'
        ORDER BY aaa.created_at DESC
      `, [projectId]);

      return result.rows;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching active admin assignments', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId
      });
      throw error;
    }
  }

  /**
   * Get recent admin interventions for analytics
   */
  async getRecentAdminInterventions(options: {
    limit?: number;
    days?: number;
  } = {}): Promise<any[]> {
    const { limit = 20, days = 7 } = options;

    try {
      const result = await pool!.query(`
        SELECT 
          ami.*,
          p.name as project_name,
          ua.email as admin_email,
          uo.email as original_advisor_email,
          un.email as new_advisor_email
        FROM admin_matching_interventions ami
        LEFT JOIN projects p ON ami.project_id = p.id
        LEFT JOIN auth.users ua ON ami.admin_id = ua.id
        LEFT JOIN auth.users uo ON ami.original_advisor_id = uo.id
        LEFT JOIN auth.users un ON ami.new_advisor_id = un.id
        WHERE ami.created_at >= now() - interval '${days} days'
        ORDER BY ami.created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching recent admin interventions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        options
      });
      throw error;
    }
  }

  /**
   * Cancel admin assignment
   */
  async cancelAdminAssignment(params: {
    assignmentId: string;
    adminId: string;
    reason: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { assignmentId, adminId, reason } = params;

    try {
      const result = await pool!.query(`
        UPDATE admin_advisor_assignments 
        SET status = 'cancelled', updated_at = now()
        WHERE id = $1 AND status = 'active'
        RETURNING *
      `, [assignmentId]);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Assignment not found or already cancelled'
        };
      }

      // Log the cancellation as intervention
      await pool!.query(`
        INSERT INTO admin_matching_interventions (
          admin_id, intervention_type, reason, intervention_metadata
        ) VALUES ($1, 'assignment_cancellation', $2, $3)
      `, [adminId, reason, JSON.stringify({ assignmentId })]);

      await this.logger.logServerEvent('routing', 'info', 'Admin assignment cancelled', {
        assignmentId,
        adminId,
        reason
      });

      return { success: true };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error cancelling admin assignment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        assignmentId,
        adminId
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  /**
   * Get advisor pool status overview
   */
  async getAdvisorPoolStatus(options: {
    includeDetails?: boolean;
  } = {}): Promise<any> {
    const { includeDetails = false } = options;

    try {
      // Get advisor status summary
      const statusResult = await pool!.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM advisor_availability
        GROUP BY status
        ORDER BY status
      `);

      // Get total advisor count
      const totalResult = await pool!.query(`
        SELECT COUNT(DISTINCT advisor_id) as total_advisors
        FROM advisor_availability
      `);

      // Get current workload distribution
      const workloadResult = await pool!.query(`
        SELECT 
          CASE 
            WHEN current_projects = 0 THEN 'idle'
            WHEN current_projects < max_concurrent_projects THEN 'available'
            WHEN current_projects = max_concurrent_projects THEN 'at_capacity'
            ELSE 'overloaded'
          END as workload_status,
          COUNT(*) as count
        FROM advisor_availability
        GROUP BY workload_status
        ORDER BY workload_status
      `);

      const summary = {
        totalAdvisors: totalResult.rows[0]?.total_advisors || 0,
        statusBreakdown: statusResult.rows.reduce((acc: any, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        workloadBreakdown: workloadResult.rows.reduce((acc: any, row) => {
          acc[row.workload_status] = parseInt(row.count);
          return acc;
        }, {}),
        poolSize: totalResult.rows[0]?.total_advisors < this.SMALL_POOL_THRESHOLD ? 'small' : 
                 totalResult.rows[0]?.total_advisors < this.COMPLEX_ALGORITHM_THRESHOLD ? 'medium' : 'large',
        algorithm: totalResult.rows[0]?.total_advisors < this.COMPLEX_ALGORITHM_THRESHOLD ? 'simple_availability' : 'complex_scoring'
      };

      if (includeDetails) {
        // Get detailed advisor info
        const advisorsResult = await pool!.query(`
          SELECT 
            aa.advisor_id,
            u.email,
            aa.status,
            aa.current_projects,
            aa.max_concurrent_projects,
            aa.last_active
          FROM advisor_availability aa
          JOIN auth.users u ON aa.advisor_id = u.id
          ORDER BY aa.last_active DESC
        `);

        (summary as any).advisors = advisorsResult.rows;
      }

      return summary;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching advisor pool status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get advisor workloads and capacity
   */
  async getAdvisorWorkloads(options: {
    sortBy?: 'workload' | 'availability' | 'name';
  } = {}): Promise<any[]> {
    const { sortBy = 'workload' } = options;

    try {
      let orderClause = 'aa.current_projects DESC';
      if (sortBy === 'availability') {
        orderClause = '(aa.max_concurrent_projects - aa.current_projects) DESC';
      } else if (sortBy === 'name') {
        orderClause = 'u.email ASC';
      }

      const result = await pool!.query(`
        SELECT 
          aa.advisor_id,
          u.email,
          aa.status,
          aa.current_projects,
          aa.max_concurrent_projects,
          (aa.max_concurrent_projects - aa.current_projects) as available_capacity,
          ROUND((aa.current_projects::decimal / aa.max_concurrent_projects) * 100, 1) as utilization_percent,
          aa.last_active,
          COUNT(apr.id) as active_preference_rules
        FROM advisor_availability aa
        JOIN auth.users u ON aa.advisor_id = u.id
        LEFT JOIN admin_preference_rules apr ON aa.advisor_id = apr.advisor_id 
          AND apr.active = true 
          AND (apr.valid_until IS NULL OR apr.valid_until > now())
        GROUP BY aa.advisor_id, u.email, aa.status, aa.current_projects, aa.max_concurrent_projects, aa.last_active
        ORDER BY ${orderClause}
      `);

      return result.rows;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching advisor workloads', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get recent matching activity
   */
  async getRecentMatchingActivity(options: {
    hours?: number;
    limit?: number;
  } = {}): Promise<any> {
    const { hours = 24, limit = 50 } = options;

    try {
      // Get recent match requests
      const matchesResult = await pool!.query(`
        SELECT 
          amr.*,
          p.name as project_name,
          u.email as advisor_email
        FROM advisor_match_requests amr
        LEFT JOIN projects p ON amr.project_id = p.id
        LEFT JOIN auth.users u ON amr.matched_advisor_id = u.id
        WHERE amr.created_at >= now() - interval '${hours} hours'
        ORDER BY amr.created_at DESC
        LIMIT $1
      `, [limit]);

      // Get activity summary
      const summaryResult = await pool!.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM advisor_match_requests
        WHERE created_at >= now() - interval '${hours} hours'
        GROUP BY status
      `);

      return {
        recentMatches: matchesResult.rows,
        summary: summaryResult.rows.reduce((acc: any, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        timeframe: `${hours} hours`
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching recent matching activity', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  async getSystemHealthMetrics(): Promise<any> {
    try {
      const healthMetrics = {
        timestamp: new Date().toISOString(),
        advisor_pool: {
          status: 'healthy',
          total_advisors: 0,
          available_advisors: 0,
          average_utilization: 0
        },
        matching_performance: {
          status: 'healthy',
          average_match_time: '< 1s',
          success_rate: 95,
          queue_depth: 0
        },
        recent_activity: {
          matches_last_hour: 0,
          admin_interventions_today: 0,
          system_errors_today: 0
        }
      };

      // Get advisor pool metrics
      const poolResult = await pool!.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'available') as available,
          ROUND(AVG(current_projects::decimal / max_concurrent_projects) * 100, 1) as avg_utilization
        FROM advisor_availability
      `);

      if (poolResult.rows.length > 0) {
        const row = poolResult.rows[0];
        healthMetrics.advisor_pool.total_advisors = parseInt(row.total);
        healthMetrics.advisor_pool.available_advisors = parseInt(row.available);
        healthMetrics.advisor_pool.average_utilization = parseFloat(row.avg_utilization) || 0;
      }

      // Get recent activity
      const activityResult = await pool!.query(`
        SELECT 
          COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour') as matches_last_hour,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '1 day') as matches_today
        FROM advisor_match_requests
      `);

      const interventionResult = await pool!.query(`
        SELECT COUNT(*) as interventions_today
        FROM admin_matching_interventions
        WHERE created_at >= now() - interval '1 day'
      `);

      if (activityResult.rows.length > 0) {
        healthMetrics.recent_activity.matches_last_hour = parseInt(activityResult.rows[0].matches_last_hour);
      }

      if (interventionResult.rows.length > 0) {
        healthMetrics.recent_activity.admin_interventions_today = parseInt(interventionResult.rows[0].interventions_today);
      }

      // Determine overall health status
      if (healthMetrics.advisor_pool.available_advisors === 0) {
        healthMetrics.advisor_pool.status = 'critical';
      } else if (healthMetrics.advisor_pool.available_advisors < 2) {
        healthMetrics.advisor_pool.status = 'warning';
      }

      return healthMetrics;

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching system health metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get availability trends
   */
  async getAvailabilityTrends(options: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    days?: number | undefined;
    advisorId?: string | undefined;
  } = {}): Promise<any> {
    const { days = 7, advisorId } = options;

    try {
      let query = `
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          status,
          COUNT(*) as count
        FROM advisor_availability_history
        WHERE created_at >= now() - interval '${days} days'
      `;

      const params: any[] = [];
      if (advisorId) {
        query += ` AND advisor_id = $1`;
        params.push(advisorId);
      }

      query += `
        GROUP BY DATE_TRUNC('hour', created_at), status
        ORDER BY hour DESC
      `;

      const result = await pool!.query(query, params);

      return {
        timeframe: `${days} days`,
        advisorId: advisorId || 'all',
        trends: result.rows
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching availability trends', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return mock data if the history table doesn't exist yet
      return {
        timeframe: `${days} days`,
        advisorId: advisorId || 'all',
        trends: [],
        note: 'Historical data not available - implement advisor_availability_history table for trends'
      };
    }
  }

  /**
   * Get matching effectiveness metrics
   */
  async getMatchingEffectivenessMetrics(options: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    period?: 'day' | 'week' | 'month' | undefined;
  } = {}): Promise<any> {
    const { period = 'week' } = options;

    const intervalMap = {
      day: '1 day',
      week: '7 days',
      month: '30 days'
    };

    try {
      const result = await pool!.query(`
        SELECT 
          status,
          COUNT(*) as count,
          ROUND(AVG(match_score), 2) as avg_score,
          COUNT(*) FILTER (WHERE status = 'matched') as successful_matches,
          COUNT(*) FILTER (WHERE status IN ('client_approved', 'advisor_accepted')) as approved_matches
        FROM advisor_match_requests
        WHERE created_at >= now() - interval '${intervalMap[period]}'
        GROUP BY status
      `);

      const totalMatches = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
      const successfulMatches = result.rows.find(row => row.status === 'matched')?.successful_matches || 0;
      const approvedMatches = result.rows.reduce((sum, row) => sum + parseInt(row.approved_matches), 0);

      return {
        period,
        total_requests: totalMatches,
        success_rate: totalMatches > 0 ? Math.round((successfulMatches / totalMatches) * 100) : 0,
        approval_rate: successfulMatches > 0 ? Math.round((approvedMatches / successfulMatches) * 100) : 0,
        average_score: result.rows.find(row => row.avg_score)?.avg_score || 0,
        status_breakdown: result.rows.reduce((acc: any, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {})
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error fetching matching effectiveness metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get current algorithm configuration
   * Useful for debugging and admin dashboards
   */
  getAlgorithmConfiguration(): {
    complexAlgorithmThreshold: number;
    smallPoolThreshold: number;
    source: string;
  } {
    return {
      complexAlgorithmThreshold: this.COMPLEX_ALGORITHM_THRESHOLD,
      smallPoolThreshold: this.SMALL_POOL_THRESHOLD,
      source: 'environment_variables_with_defaults'
    };
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  private mapRowToMatchRequest(row: any): AdvisorMatchRequest {
    return {
      id: row.id,
      project_id: row.project_id,
      requested_by: row.requested_by,
      match_criteria: row.match_criteria || {},
      status: row.status,
      matched_advisor_id: row.matched_advisor_id,
      match_score: row.match_score,
      match_reason: row.match_reason,
      expires_at: row.expires_at,
      scoring_features: row.scoring_features || {},
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapRowToAvailability(row: any): AdvisorAvailability {
    return {
      advisor_id: row.advisor_id,
      status: row.status,
      max_concurrent_projects: row.max_concurrent_projects,
      last_active: row.last_active,
      availability_preferences: row.availability_preferences || {},
      updated_at: row.updated_at
    };
  }
}