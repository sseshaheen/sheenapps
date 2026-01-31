/**
 * Advisor Matching Metrics Service
 * 
 * Production-ready metrics and monitoring for advisor matching system with:
 * - Real-time matching performance metrics
 * - Success rate tracking by advisor and technology stack
 * - SLA compliance monitoring (time-to-match, response times)
 * - Fairness distribution analysis
 * - Notification delivery success rates
 * - Dead letter queue monitoring
 * - Business impact metrics (conversion rates, satisfaction)
 */

import { pool } from './database';
import { ServerLoggingService } from './serverLoggingService';

export interface MatchingMetrics {
  timeToFirstMatch: {
    p50: number; // milliseconds
    p90: number; // milliseconds
    p99: number; // milliseconds
  };
  acceptanceRates: {
    byAdvisor: { advisorId: string; rate: number }[];
    byTechStack: { framework: string; rate: number }[];
    overall: number;
  };
  rematchCounts: {
    average: number;
    distribution: { rematchCount: number; projectCount: number }[];
  };
  slaCompliance: {
    timeToMatch: number; // percentage under 30 minutes
    advisorResponse: number; // percentage under 2 hours
    clientApproval: number; // percentage under 24 hours
  };
  fairnessMetrics: {
    advisorDistribution: { advisorId: string; matchCount: number; score: number }[];
    giniCoefficient: number; // 0 = perfect equality, 1 = perfect inequality
  };
  notificationMetrics: {
    deliverySuccessRate: number;
    averageDeliveryTime: number; // milliseconds
    deadLetterCount: number;
    retryDistribution: { attempts: number; count: number }[];
  };
  businessMetrics: {
    conversionRate: number; // matches that lead to successful collaboration
    revenueImpact: number; // additional revenue from advisor-assisted projects
    advisorRetention: number; // advisor engagement rate
  };
}

export interface PerformanceAlert {
  type: 'sla_breach' | 'low_acceptance_rate' | 'high_retry_rate' | 'fairness_issue';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface MetricsTimeframe {
  start: Date;
  end: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export class AdvisorMatchingMetricsService {
  private logger = ServerLoggingService.getInstance();

  constructor() {
    if (!pool) {
      throw new Error('Database connection not available');
    }
  }

  // =====================================================
  // Core Metrics Collection
  // =====================================================

  async getMatchingMetrics(timeframe: MetricsTimeframe): Promise<MatchingMetrics> {
    try {
      const [
        timeToMatchData,
        acceptanceData,
        rematchData,
        slaData,
        fairnessData,
        notificationData,
        businessData
      ] = await Promise.all([
        this.getTimeToMatchMetrics(timeframe),
        this.getAcceptanceRateMetrics(timeframe),
        this.getRematchMetrics(timeframe),
        this.getSLAComplianceMetrics(timeframe),
        this.getFairnessMetrics(timeframe),
        this.getNotificationMetrics(timeframe),
        this.getBusinessMetrics(timeframe)
      ]);

      return {
        timeToFirstMatch: timeToMatchData,
        acceptanceRates: acceptanceData,
        rematchCounts: rematchData,
        slaCompliance: slaData,
        fairnessMetrics: fairnessData,
        notificationMetrics: notificationData,
        businessMetrics: businessData
      };

    } catch (error) {
      await this.logger.logServerEvent('error', 'error', 'Error collecting matching metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timeframe
      });
      throw error;
    }
  }

  private async getTimeToMatchMetrics(timeframe: MetricsTimeframe) {
    const result = await pool!.query(`
      WITH match_times AS (
        SELECT 
          EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000 as time_to_match_ms
        FROM advisor_match_requests
        WHERE created_at BETWEEN $1 AND $2
          AND status IN ('matched', 'client_approved', 'advisor_accepted', 'finalized')
          AND matched_advisor_id IS NOT NULL
      )
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_to_match_ms) as p50,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY time_to_match_ms) as p90,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY time_to_match_ms) as p99
      FROM match_times
    `, [timeframe.start, timeframe.end]);

    const row = result.rows[0];
    return {
      p50: Math.round(row.p50 || 0),
      p90: Math.round(row.p90 || 0),
      p99: Math.round(row.p99 || 0)
    };
  }

  private async getAcceptanceRateMetrics(timeframe: MetricsTimeframe) {
    // Acceptance rate by advisor
    const advisorAcceptanceResult = await pool!.query(`
      SELECT 
        matched_advisor_id as advisor_id,
        COUNT(*) as total_matches,
        COUNT(CASE WHEN status IN ('advisor_accepted', 'finalized') THEN 1 END) as accepted_matches,
        ROUND(
          COUNT(CASE WHEN status IN ('advisor_accepted', 'finalized') THEN 1 END)::numeric / 
          COUNT(*)::numeric * 100, 2
        ) as acceptance_rate
      FROM advisor_match_requests
      WHERE created_at BETWEEN $1 AND $2
        AND matched_advisor_id IS NOT NULL
      GROUP BY matched_advisor_id
      HAVING COUNT(*) >= 3 -- Only advisors with at least 3 matches
      ORDER BY acceptance_rate DESC
    `, [timeframe.start, timeframe.end]);

    // Acceptance rate by technology stack
    const techStackResult = await pool!.query(`
      SELECT 
        p.technology_stack->>'framework' as framework,
        COUNT(*) as total_matches,
        COUNT(CASE WHEN amr.status IN ('advisor_accepted', 'finalized') THEN 1 END) as accepted_matches,
        ROUND(
          COUNT(CASE WHEN amr.status IN ('advisor_accepted', 'finalized') THEN 1 END)::numeric / 
          COUNT(*)::numeric * 100, 2
        ) as acceptance_rate
      FROM advisor_match_requests amr
      JOIN projects p ON amr.project_id = p.id
      WHERE amr.created_at BETWEEN $1 AND $2
        AND amr.matched_advisor_id IS NOT NULL
        AND p.technology_stack->>'framework' IS NOT NULL
      GROUP BY p.technology_stack->>'framework'
      HAVING COUNT(*) >= 5 -- Only frameworks with at least 5 matches
      ORDER BY acceptance_rate DESC
    `, [timeframe.start, timeframe.end]);

    // Overall acceptance rate
    const overallResult = await pool!.query(`
      SELECT 
        ROUND(
          COUNT(CASE WHEN status IN ('advisor_accepted', 'finalized') THEN 1 END)::numeric / 
          COUNT(*)::numeric * 100, 2
        ) as overall_rate
      FROM advisor_match_requests
      WHERE created_at BETWEEN $1 AND $2
        AND matched_advisor_id IS NOT NULL
    `, [timeframe.start, timeframe.end]);

    return {
      byAdvisor: advisorAcceptanceResult.rows.map(row => ({
        advisorId: row.advisor_id,
        rate: parseFloat(row.acceptance_rate)
      })),
      byTechStack: techStackResult.rows.map(row => ({
        framework: row.framework,
        rate: parseFloat(row.acceptance_rate)
      })),
      overall: parseFloat(overallResult.rows[0]?.overall_rate || '0')
    };
  }

  private async getRematchMetrics(timeframe: MetricsTimeframe) {
    const result = await pool!.query(`
      WITH project_match_counts AS (
        SELECT 
          project_id,
          COUNT(*) as match_count
        FROM advisor_match_requests
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY project_id
      ),
      rematch_distribution AS (
        SELECT 
          match_count,
          COUNT(*) as project_count
        FROM project_match_counts
        GROUP BY match_count
        ORDER BY match_count
      )
      SELECT 
        AVG(match_count) as average_rematches,
        json_agg(
          json_build_object(
            'rematchCount', match_count,
            'projectCount', project_count
          ) ORDER BY match_count
        ) as distribution
      FROM project_match_counts
    `, [timeframe.start, timeframe.end]);

    const row = result.rows[0];
    return {
      average: parseFloat(row.average_rematches || '0'),
      distribution: row.distribution || []
    };
  }

  private async getSLAComplianceMetrics(timeframe: MetricsTimeframe) {
    const result = await pool!.query(`
      WITH sla_metrics AS (
        SELECT 
          -- Time to match (under 30 minutes = 1800 seconds)
          CASE 
            WHEN status IN ('matched', 'client_approved', 'advisor_accepted', 'finalized')
              AND EXTRACT(EPOCH FROM (updated_at - created_at)) <= 1800 
            THEN 1 
            ELSE 0 
          END as time_to_match_sla,
          
          -- Advisor response (under 2 hours = 7200 seconds for advisor decision)
          CASE 
            WHEN status IN ('advisor_accepted', 'advisor_declined', 'finalized')
              AND EXISTS (
                SELECT 1 FROM advisor_match_approvals ama
                WHERE ama.match_request_id = advisor_match_requests.id
                  AND ama.approver_type = 'advisor'
                  AND EXTRACT(EPOCH FROM (ama.decided_at - advisor_match_requests.updated_at)) <= 7200
              )
            THEN 1 
            ELSE 0 
          END as advisor_response_sla,
          
          -- Client approval (under 24 hours = 86400 seconds for client decision)
          CASE 
            WHEN status IN ('client_approved', 'client_declined', 'finalized')
              AND EXISTS (
                SELECT 1 FROM advisor_match_approvals ama
                WHERE ama.match_request_id = advisor_match_requests.id
                  AND ama.approver_type = 'client'
                  AND EXTRACT(EPOCH FROM (ama.decided_at - advisor_match_requests.created_at)) <= 86400
              )
            THEN 1 
            ELSE 0 
          END as client_approval_sla
        FROM advisor_match_requests
        WHERE created_at BETWEEN $1 AND $2
      )
      SELECT 
        ROUND(AVG(time_to_match_sla) * 100, 2) as time_to_match_compliance,
        ROUND(AVG(advisor_response_sla) * 100, 2) as advisor_response_compliance,
        ROUND(AVG(client_approval_sla) * 100, 2) as client_approval_compliance
      FROM sla_metrics
    `, [timeframe.start, timeframe.end]);

    const row = result.rows[0];
    return {
      timeToMatch: parseFloat(row.time_to_match_compliance || '0'),
      advisorResponse: parseFloat(row.advisor_response_compliance || '0'),
      clientApproval: parseFloat(row.client_approval_compliance || '0')
    };
  }

  private async getFairnessMetrics(timeframe: MetricsTimeframe) {
    const distributionResult = await pool!.query(`
      SELECT 
        matched_advisor_id as advisor_id,
        COUNT(*) as match_count,
        AVG(match_score) as avg_score
      FROM advisor_match_requests
      WHERE created_at BETWEEN $1 AND $2
        AND matched_advisor_id IS NOT NULL
      GROUP BY matched_advisor_id
      ORDER BY match_count DESC
    `, [timeframe.start, timeframe.end]);

    const distribution = distributionResult.rows.map(row => ({
      advisorId: row.advisor_id,
      matchCount: parseInt(row.match_count),
      score: parseFloat(row.avg_score || '0')
    }));

    // Calculate Gini coefficient for match distribution
    const giniCoefficient = this.calculateGiniCoefficient(
      distribution.map(d => d.matchCount)
    );

    return {
      advisorDistribution: distribution,
      giniCoefficient
    };
  }

  private async getNotificationMetrics(timeframe: MetricsTimeframe) {
    // Query 1: Get delivery stats (success rate, avg time, dead letters)
    const statsResult = await pool!.query(`
      SELECT
        ROUND(
          COUNT(CASE WHEN status = 'delivered' THEN 1 END)::numeric /
          NULLIF(COUNT(*)::numeric, 0) * 100, 2
        ) as delivery_success_rate,
        AVG(
          CASE
            WHEN delivered_at IS NOT NULL AND created_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (delivered_at - created_at)) * 1000
          END
        ) as avg_delivery_time,
        COUNT(CASE WHEN dead_letter = true THEN 1 END) as dead_letter_count
      FROM notification_outbox
      WHERE created_at BETWEEN $1 AND $2
    `, [timeframe.start, timeframe.end]);

    // Query 2: Get retry distribution separately (no cartesian join)
    const retryResult = await pool!.query(`
      SELECT
        attempts,
        COUNT(*) as count
      FROM notification_outbox
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY attempts
      ORDER BY attempts
    `, [timeframe.start, timeframe.end]);

    const statsRow = statsResult.rows[0];
    return {
      deliverySuccessRate: parseFloat(statsRow?.delivery_success_rate || '0'),
      averageDeliveryTime: Math.round(statsRow?.avg_delivery_time || 0),
      deadLetterCount: parseInt(statsRow?.dead_letter_count || '0'),
      retryDistribution: retryResult.rows.map(row => ({
        attempts: parseInt(row.attempts),
        count: parseInt(row.count)
      }))
    };
  }

  private async getBusinessMetrics(timeframe: MetricsTimeframe) {
    // Simplified business metrics - would need more complex queries in production
    const result = await pool!.query(`
      WITH match_outcomes AS (
        SELECT 
          amr.id,
          amr.status,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM project_advisors pa
              WHERE pa.project_id = amr.project_id
                AND pa.advisor_id = amr.matched_advisor_id
                AND pa.status = 'active'
            ) THEN 1 
            ELSE 0 
          END as successful_collaboration
        FROM advisor_match_requests amr
        WHERE amr.created_at BETWEEN $1 AND $2
          AND amr.matched_advisor_id IS NOT NULL
      )
      SELECT 
        ROUND(AVG(successful_collaboration) * 100, 2) as conversion_rate,
        COUNT(*) as total_matches,
        SUM(successful_collaboration) as successful_collaborations
      FROM match_outcomes
    `, [timeframe.start, timeframe.end]);

    const row = result.rows[0];
    return {
      conversionRate: parseFloat(row.conversion_rate || '0'),
      revenueImpact: 0, // Would need billing integration
      advisorRetention: 0 // Would need advisor activity tracking
    };
  }

  // =====================================================
  // Alert Detection
  // =====================================================

  async detectPerformanceAlerts(timeframe: MetricsTimeframe): Promise<PerformanceAlert[]> {
    const metrics = await this.getMatchingMetrics(timeframe);
    const alerts: PerformanceAlert[] = [];

    // SLA breach alerts
    if (metrics.slaCompliance.timeToMatch < 80) {
      alerts.push({
        type: 'sla_breach',
        severity: metrics.slaCompliance.timeToMatch < 60 ? 'critical' : 'warning',
        message: `Time-to-match SLA compliance is ${metrics.slaCompliance.timeToMatch}%`,
        value: metrics.slaCompliance.timeToMatch,
        threshold: 80,
        metadata: { slaType: 'time_to_match' },
        timestamp: new Date().toISOString()
      });
    }

    // Low acceptance rate alerts
    if (metrics.acceptanceRates.overall < 70) {
      alerts.push({
        type: 'low_acceptance_rate',
        severity: metrics.acceptanceRates.overall < 50 ? 'critical' : 'warning',
        message: `Overall advisor acceptance rate is ${metrics.acceptanceRates.overall}%`,
        value: metrics.acceptanceRates.overall,
        threshold: 70,
        metadata: { acceptanceType: 'overall' },
        timestamp: new Date().toISOString()
      });
    }

    // High notification retry rate (guard against division by zero)
    const totalNotifications = metrics.notificationMetrics.retryDistribution
      .reduce((sum, item) => sum + item.count, 0);
    const avgRetries = totalNotifications > 0
      ? metrics.notificationMetrics.retryDistribution
          .reduce((sum, item) => sum + (item.attempts * item.count), 0) / totalNotifications
      : 0;

    if (avgRetries > 2) {
      alerts.push({
        type: 'high_retry_rate',
        severity: avgRetries > 3 ? 'critical' : 'warning',
        message: `Average notification retry rate is ${avgRetries.toFixed(2)}`,
        value: avgRetries,
        threshold: 2,
        metadata: { retryType: 'notifications' },
        timestamp: new Date().toISOString()
      });
    }

    // Fairness issues (Gini coefficient > 0.5 indicates high inequality)
    if (metrics.fairnessMetrics.giniCoefficient > 0.5) {
      alerts.push({
        type: 'fairness_issue',
        severity: metrics.fairnessMetrics.giniCoefficient > 0.7 ? 'critical' : 'warning',
        message: `Match distribution inequality is high (Gini: ${metrics.fairnessMetrics.giniCoefficient.toFixed(3)})`,
        value: metrics.fairnessMetrics.giniCoefficient,
        threshold: 0.5,
        metadata: { fairnessType: 'distribution' },
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  private calculateGiniCoefficient(values: number[]): number {
    if (values.length === 0) return 0;
    
    // Sort values in ascending order
    const sortedValues = [...values].sort((a, b) => a - b);
    const n = sortedValues.length;
    const sum = sortedValues.reduce((a, b) => a + b, 0);
    
    if (sum === 0) return 0;
    
    let index = 0;
    for (let i = 0; i < n; i++) {
      const value = sortedValues[i] ?? 0;
      index += (i + 1) * value;
    }
    
    return (2 * index / (n * sum)) - (n + 1) / n;
  }

  // =====================================================
  // Real-time Monitoring
  // =====================================================

  async recordMatchingEvent(event: {
    type: 'match_created' | 'match_accepted' | 'match_declined' | 'match_expired';
    matchRequestId: string;
    advisorId?: string;
    projectId: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.logger.logServerEvent('performance', 'info', 'Matching event recorded', {
        eventType: event.type,
        matchRequestId: event.matchRequestId,
        advisorId: event.advisorId,
        projectId: event.projectId,
        metadata: event.metadata
      });

      // Could also store in a separate metrics table for faster aggregation
      // await pool!.query(`
      //   INSERT INTO advisor_matching_events (event_type, match_request_id, advisor_id, project_id, metadata)
      //   VALUES ($1, $2, $3, $4, $5)
      // `, [event.type, event.matchRequestId, event.advisorId, event.projectId, JSON.stringify(event.metadata)]);

    } catch (error) {
      // Don't throw on metrics recording failure
      await this.logger.logServerEvent('error', 'warn', 'Failed to record matching event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event
      });
    }
  }
}