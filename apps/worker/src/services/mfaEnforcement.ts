/**
 * MFA (Multi-Factor Authentication) Enforcement Service
 * Handles MFA requirement enforcement and compliance checking
 *
 * Features:
 * - Grace period for MFA setup (24 hours default)
 * - Privileged action gating without blocking login
 * - Integration with Supabase Admin API
 * - Comprehensive audit logging
 * - User notification system integration
 */

import { pool } from './database';
import { ServerLoggingService } from './serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

export interface MFAEnforcementResult {
  success: boolean;
  userId: string;
  reason: string;
  graceExpiresAt?: Date;
  error?: string;
}

export interface MFAComplianceCheck {
  isCompliant: boolean;
  userId: string;
  mfaRequired: boolean;
  mfaEnabled: boolean;
  graceExpired: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  graceExpiresAt?: Date | undefined;
}

export class MFAEnforcementService {
  constructor() {
    this.assertDatabaseConnection();
  }

  /**
   * Check if database connection is available
   */
  private assertDatabaseConnection(): void {
    if (!pool) {
      throw new Error('Database connection not available');
    }
  }

  /**
   * Require MFA for a user with a grace period for setup
   */
  async requireMFA(userId: string, reason: string): Promise<MFAEnforcementResult> {
    this.assertDatabaseConnection();

    const result: MFAEnforcementResult = {
      success: false,
      userId,
      reason
    };

    try {
      // Set MFA requirement in user_admin_status table (upsert)
      const queryResult = await pool!.query(`
        INSERT INTO user_admin_status (user_id, mfa_required, mfa_grace_expires_at)
        VALUES ($1, true, NOW() + INTERVAL '24 hours')
        ON CONFLICT (user_id)
        DO UPDATE SET
          mfa_required = true,
          mfa_grace_expires_at = NOW() + INTERVAL '24 hours',
          updated_at = NOW()
        RETURNING mfa_grace_expires_at
      `, [userId]);

      if (queryResult.rows.length === 0) {
        throw new Error('User profile not found');
      }

      result.success = true;
      result.graceExpiresAt = queryResult.rows[0].mfa_grace_expires_at;

      // Send notification to user about MFA requirement
      if (result.graceExpiresAt) {
        await this.sendMFARequiredNotification(userId, reason, result.graceExpiresAt);
      }

      // Log enforcement action
      await this.logEnforcementAction(userId, 'mfa_required', reason, {
        graceExpiresAt: result.graceExpiresAt?.toISOString()
      });

    } catch (error: any) {
      result.error = error.message;
      result.success = false;

      await loggingService.logCriticalError('mfa_enforcement_failed', error, {
        userId,
        reason
      });
    }

    return result;
  }

  /**
   * Check MFA compliance for a user
   */
  async checkMFACompliance(userId: string): Promise<MFAComplianceCheck> {
    this.assertDatabaseConnection();

    const result = await pool!.query(`
      SELECT
        mfa_required,
        mfa_enabled,
        mfa_grace_expires_at
      FROM user_admin_status
      WHERE user_id = $1
    `, [userId]);

    const profile = result.rows[0];
    if (!profile) {
      // User profile doesn't exist - consider compliant by default
      return {
        isCompliant: true,
        userId,
        mfaRequired: false,
        mfaEnabled: false,
        graceExpired: false
      };
    }

    const mfaRequired = profile.mfa_required || false;
    const mfaEnabled = profile.mfa_enabled || false;
    const graceExpiresAt = profile.mfa_grace_expires_at;
    const graceExpired = graceExpiresAt ? new Date() > new Date(graceExpiresAt) : false;

    return {
      isCompliant: !mfaRequired || mfaEnabled || !graceExpired,
      userId,
      mfaRequired,
      mfaEnabled,
      graceExpired,
      graceExpiresAt: graceExpiresAt ? new Date(graceExpiresAt) : undefined
    };
  }

  /**
   * Remove MFA requirement (recovery mechanism)
   */
  async removeMFARequirement(userId: string, reason: string): Promise<MFAEnforcementResult> {
    this.assertDatabaseConnection();

    const result: MFAEnforcementResult = {
      success: false,
      userId,
      reason
    };

    try {
      await pool!.query(`
        INSERT INTO user_admin_status (user_id, mfa_required)
        VALUES ($1, false)
        ON CONFLICT (user_id)
        DO UPDATE SET
          mfa_required = false,
          mfa_grace_expires_at = NULL,
          updated_at = NOW()
      `, [userId]);

      result.success = true;

      // Log enforcement reversal
      await this.logEnforcementAction(userId, 'mfa_requirement_removed', reason);

    } catch (error: any) {
      result.error = error.message;
      result.success = false;

      await loggingService.logCriticalError('mfa_requirement_removal_failed', error, {
        userId,
        reason
      });
    }

    return result;
  }

  /**
   * Send MFA required notification to user
   */
  private async sendMFARequiredNotification(
    userId: string,
    reason: string,
    graceExpiresAt: Date
  ): Promise<void> {
    // For now, log the notification requirement
    // TODO: Integrate with notification service (email, in-app)
    await loggingService.logServerEvent(
      'capacity',
      'info',
      'MFA requirement notification required',
      {
        userId,
        reason,
        graceExpiresAt: graceExpiresAt.toISOString(),
        notificationType: 'mfa_required',
        timestamp: new Date().toISOString()
      }
    );

    console.log(`🔐 MFA notification required: ${userId} - grace expires ${graceExpiresAt.toISOString()}`);

    // Future implementation would send actual notifications:
    // - Email with MFA setup instructions
    // - In-app notification banner with countdown
    // - Push notification for mobile users
  }

  /**
   * Log MFA enforcement action for audit trail
   */
  private async logEnforcementAction(
    userId: string,
    action: string,
    reason: string,
    metadata: any = {}
  ): Promise<void> {
    await loggingService.logServerEvent(
      'capacity',
      'info',
      `MFA enforcement action: ${action}`,
      {
        userId,
        action,
        reason,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    );

    // Also store in enforcement action audit log
    try {
      await pool!.query(`
        INSERT INTO trust_safety_actions (
          user_id, action, reason, metadata, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [userId, action, reason, JSON.stringify(metadata)]);
    } catch (error) {
      // Non-fatal if audit table doesn't exist yet
      console.warn('Failed to log to trust_safety_actions table:', error);
    }
  }
}

// Export singleton instance
export const mfaEnforcementService = new MFAEnforcementService();