/**
 * Alert Service
 *
 * Manages alert rules, evaluates metrics against thresholds,
 * and handles alert lifecycle (firing, acknowledgment, resolution).
 */

import { createHash } from 'crypto';
import { makeAdminCtx } from '../../lib/supabase';
import { getAdminMetricsService, MetricDimensions } from './AdminMetricsService';
import { getIncidentManagementService } from './IncidentManagementService';
import { ServerLoggingService } from '../serverLoggingService';

// Types
export type AlertCondition = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
export type AlertSeverity = 'warning' | 'critical';
export type AlertStatus = 'firing' | 'acknowledged' | 'resolved';

export interface AlertChannel {
  type: 'slack' | 'email' | 'webhook';
  webhook?: string;
  to?: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metric_name: string;
  dimensions: MetricDimensions;
  condition: AlertCondition;
  threshold: number;
  duration_minutes: number;
  severity: AlertSeverity;
  channels: AlertChannel[];
  enabled: boolean;
  last_evaluated_at?: string;
  last_fired_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AlertFired {
  id: string;
  rule_id: string;
  fingerprint: string;
  firing_dimensions: MetricDimensions;
  status: AlertStatus;
  fired_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  acknowledged_by?: string;
  metric_value: number;
  incident_id?: string;
  notifications_sent: Array<{ channel: string; sent_at: string; status: string }>;
}

export interface CreateAlertRuleInput {
  name: string;
  description?: string;
  metric_name: string;
  dimensions?: MetricDimensions;
  condition: AlertCondition;
  threshold: number;
  duration_minutes?: number;
  severity: AlertSeverity;
  channels: AlertChannel[];
  created_by?: string;
}

export interface UpdateAlertRuleInput {
  name?: string;
  description?: string;
  dimensions?: MetricDimensions;
  condition?: AlertCondition;
  threshold?: number;
  duration_minutes?: number;
  severity?: AlertSeverity;
  channels?: AlertChannel[];
  enabled?: boolean;
}

// Hysteresis buffer to prevent flapping (10% of threshold)
const HYSTERESIS_FACTOR = 0.1;

/**
 * Generate fingerprint for per-dimension alert uniqueness
 */
function getAlertFingerprint(ruleId: string, dimensions: MetricDimensions): string {
  const sorted = Object.keys(dimensions)
    .sort()
    .map((k) => `${k}=${dimensions[k as keyof MetricDimensions]}`)
    .join('|');
  return createHash('sha256')
    .update(`${ruleId}:${sorted}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * AlertService - Manages alert rules and evaluations
 */
export class AlertService {
  private logger: ServerLoggingService;
  private metricsService = getAdminMetricsService();
  private incidentService = getIncidentManagementService();

  constructor() {
    this.logger = ServerLoggingService.getInstance();
  }

  /**
   * Create a new alert rule
   */
  async createAlertRule(input: CreateAlertRuleInput): Promise<AlertRule> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('alert_rules')
      .insert({
        name: input.name,
        description: input.description,
        metric_name: input.metric_name,
        dimensions: input.dimensions || {},
        condition: input.condition,
        threshold: input.threshold,
        duration_minutes: input.duration_minutes || 5,
        severity: input.severity,
        channels: input.channels,
        created_by: input.created_by,
        enabled: true,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create alert rule', { error, input });
      throw new Error(`Failed to create alert rule: ${error.message}`);
    }

    this.logger.info('Alert rule created', {
      ruleId: data.id,
      name: data.name,
      metric: data.metric_name,
    });

    return data;
  }

  /**
   * Get alert rule by ID
   */
  async getAlertRule(id: string): Promise<AlertRule | null> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get alert rule: ${error.message}`);
    }

    return data;
  }

  /**
   * List alert rules
   */
  async listAlertRules(enabledOnly: boolean = false): Promise<AlertRule[]> {
    const supabase = makeAdminCtx();

    let query = supabase
      .from('alert_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (enabledOnly) {
      query = query.eq('enabled', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list alert rules: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Update alert rule
   */
  async updateAlertRule(id: string, input: UpdateAlertRuleInput): Promise<AlertRule> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('alert_rules')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update alert rule: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete alert rule
   */
  async deleteAlertRule(id: string): Promise<void> {
    const supabase = makeAdminCtx();

    const { error } = await supabase.from('alert_rules').delete().eq('id', id);

    if (error) {
      throw new Error(`Failed to delete alert rule: ${error.message}`);
    }
  }

  /**
   * Toggle alert rule enabled status
   */
  async toggleAlertRule(id: string, enabled: boolean): Promise<AlertRule> {
    return this.updateAlertRule(id, { enabled });
  }

  /**
   * Get active alerts (firing)
   */
  async getActiveAlerts(): Promise<AlertFired[]> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('alerts_fired')
      .select('*, alert_rules!inner(name, severity)')
      .eq('status', 'firing')
      .order('fired_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get active alerts: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a fired alert by ID
   */
  async getAlertById(id: string): Promise<AlertFired | null> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('alerts_fired')
      .select('*, alert_rules!inner(name, severity)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get alert: ${error.message}`);
    }

    return data;
  }

  /**
   * Get alert history
   */
  async getAlertHistory(
    options: {
      ruleId?: string | undefined;
      status?: AlertStatus | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    } = {}
  ): Promise<{ data: AlertFired[]; count: number }> {
    const supabase = makeAdminCtx();

    let query = supabase
      .from('alerts_fired')
      .select('*, alert_rules!inner(name, severity)', { count: 'exact' });

    if (options.ruleId) {
      query = query.eq('rule_id', options.ruleId);
    }

    if (options.status) {
      query = query.eq('status', options.status);
    }

    query = query
      .order('fired_at', { ascending: false })
      .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get alert history: ${error.message}`);
    }

    return { data: data || [], count: count || 0 };
  }

  /**
   * Acknowledge an alert
   * Sets status to 'acknowledged' and records who acknowledged it.
   * Acknowledged alerts will still auto-resolve when condition clears.
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<AlertFired> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('alerts_fired')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: acknowledgedBy,
      })
      .eq('id', alertId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to acknowledge alert: ${error.message}`);
    }

    this.logger.info('Alert acknowledged', { alertId, acknowledgedBy });

    return data;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<AlertFired> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('alerts_fired')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to resolve alert: ${error.message}`);
    }

    return data;
  }

  /**
   * Link alert to incident
   */
  async linkAlertToIncident(alertId: string, incidentId: string): Promise<void> {
    const supabase = makeAdminCtx();

    const { error } = await supabase
      .from('alerts_fired')
      .update({ incident_id: incidentId })
      .eq('id', alertId);

    if (error) {
      throw new Error(`Failed to link alert to incident: ${error.message}`);
    }
  }

  /**
   * Evaluate all enabled alert rules (called by worker)
   */
  async evaluateAlerts(): Promise<{
    rulesEvaluated: number;
    alertsFired: number;
    alertsResolved: number;
  }> {
    const rules = await this.listAlertRules(true);
    let alertsFired = 0;
    let alertsResolved = 0;

    for (const rule of rules) {
      try {
        const result = await this.evaluateRule(rule);
        alertsFired += result.fired;
        alertsResolved += result.resolved;
      } catch (error) {
        this.logger.error('Failed to evaluate rule', {
          ruleId: rule.id,
          ruleName: rule.name,
          error,
        });
      }

      // Update last_evaluated_at
      await this.updateRuleEvaluationTime(rule.id);
    }

    return {
      rulesEvaluated: rules.length,
      alertsFired,
      alertsResolved,
    };
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(
    rule: AlertRule
  ): Promise<{ fired: number; resolved: number }> {
    const supabase = makeAdminCtx();

    // Get metric values for the rule's duration window
    const metricData = await this.metricsService.getMetrics(
      rule.metric_name,
      Math.ceil(rule.duration_minutes / 60) || 1, // Convert to hours, minimum 1
      Object.keys(rule.dimensions).length > 0 ? rule.dimensions : undefined
    );

    if (metricData.length === 0) {
      return { fired: 0, resolved: 0 };
    }

    // Calculate current value (average over duration)
    const currentValue =
      metricData.reduce((sum, d) => sum + d.value, 0) / metricData.length;

    // Check if condition is breached
    const isBreaching = this.evaluateCondition(currentValue, rule.condition, rule.threshold);

    // Get fingerprint for this rule+dimensions combination
    const fingerprint = getAlertFingerprint(rule.id, rule.dimensions);

    // Check for existing active alert (firing OR acknowledged)
    // Acknowledged alerts should also be auto-resolved when condition clears
    const { data: existingAlert } = await supabase
      .from('alerts_fired')
      .select('*')
      .eq('rule_id', rule.id)
      .eq('fingerprint', fingerprint)
      .in('status', ['firing', 'acknowledged'])
      .single();

    let fired = 0;
    let resolved = 0;

    if (isBreaching && !existingAlert) {
      // Fire new alert
      await this.fireAlert(rule, currentValue, fingerprint, rule.dimensions);
      fired = 1;
    } else if (!isBreaching && existingAlert) {
      // Check hysteresis before resolving
      const resolveThreshold =
        rule.condition === 'gt' || rule.condition === 'gte'
          ? rule.threshold * (1 - HYSTERESIS_FACTOR)
          : rule.threshold * (1 + HYSTERESIS_FACTOR);

      const shouldResolve = this.evaluateCondition(
        currentValue,
        rule.condition === 'gt' || rule.condition === 'gte' ? 'lt' : 'gt',
        resolveThreshold
      );

      if (shouldResolve) {
        await this.resolveAlert(existingAlert.id);
        await this.sendResolutionNotification(rule, rule.dimensions);
        resolved = 1;
      }
    }

    return { fired, resolved };
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(
    value: number,
    condition: AlertCondition,
    threshold: number
  ): boolean {
    switch (condition) {
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Fire a new alert
   */
  private async fireAlert(
    rule: AlertRule,
    metricValue: number,
    fingerprint: string,
    dimensions: MetricDimensions
  ): Promise<void> {
    const supabase = makeAdminCtx();

    const { data: alert, error } = await supabase
      .from('alerts_fired')
      .insert({
        rule_id: rule.id,
        fingerprint,
        firing_dimensions: dimensions,
        status: 'firing',
        metric_value: metricValue,
        notifications_sent: [],
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to fire alert: ${error.message}`);
    }

    this.logger.warn('Alert fired', {
      alertId: alert.id,
      ruleId: rule.id,
      ruleName: rule.name,
      metricValue,
      threshold: rule.threshold,
    });

    // Update rule's last_fired_at
    await supabase
      .from('alert_rules')
      .update({ last_fired_at: new Date().toISOString() })
      .eq('id', rule.id);

    // Send notifications
    await this.sendNotifications(rule, metricValue, dimensions, alert.id);

    // Create incident for critical alerts
    if (rule.severity === 'critical') {
      const incident = await this.incidentService.createIncidentFromAlert(
        rule.id,
        rule.name,
        metricValue,
        rule.threshold,
        rule.severity
      );
      await this.linkAlertToIncident(alert.id, incident.id);
    }
  }

  /**
   * Send notifications for alert
   */
  private async sendNotifications(
    rule: AlertRule,
    metricValue: number,
    dimensions: MetricDimensions,
    alertId: string
  ): Promise<void> {
    const supabase = makeAdminCtx();

    const notifications: Array<{ channel: string; sent_at: string; status: string }> = [];

    for (const channel of rule.channels) {
      try {
        if (channel.type === 'slack' && channel.webhook) {
          await this.sendSlackNotification(channel.webhook, rule, metricValue, dimensions);
          notifications.push({
            channel: 'slack',
            sent_at: new Date().toISOString(),
            status: 'sent',
          });
        } else if (channel.type === 'email' && channel.to && channel.to.length > 0) {
          // Email notification would be implemented here
          this.logger.info('Email notification skipped (not implemented)', {
            to: channel.to,
          });
          notifications.push({
            channel: 'email',
            sent_at: new Date().toISOString(),
            status: 'skipped',
          });
        } else if (channel.type === 'webhook' && channel.webhook) {
          await this.sendWebhookNotification(channel.webhook, rule, metricValue, dimensions);
          notifications.push({
            channel: 'webhook',
            sent_at: new Date().toISOString(),
            status: 'sent',
          });
        }
      } catch (error) {
        this.logger.error('Failed to send notification', {
          channel: channel.type,
          error,
        });
        notifications.push({
          channel: channel.type,
          sent_at: new Date().toISOString(),
          status: 'failed',
        });
      }
    }

    // Update alert with notification status
    await supabase
      .from('alerts_fired')
      .update({ notifications_sent: notifications })
      .eq('id', alertId);
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    webhook: string,
    rule: AlertRule,
    metricValue: number,
    dimensions: MetricDimensions
  ): Promise<void> {
    const color = rule.severity === 'critical' ? '#FF0000' : '#FFA500';
    const emoji = rule.severity === 'critical' ? ':rotating_light:' : ':warning:';

    const dimensionsText = Object.keys(dimensions).length > 0
      ? Object.entries(dimensions)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : 'none';

    const payload = {
      attachments: [
        {
          color,
          title: `${emoji} Alert: ${rule.name}`,
          text: rule.description || 'Alert triggered',
          fields: [
            {
              title: 'Metric',
              value: rule.metric_name,
              short: true,
            },
            {
              title: 'Current Value',
              value: metricValue.toFixed(2),
              short: true,
            },
            {
              title: 'Threshold',
              value: `${rule.condition} ${rule.threshold}`,
              short: true,
            },
            {
              title: 'Severity',
              value: rule.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Dimensions',
              value: dimensionsText,
              short: false,
            },
          ],
          footer: 'SheenApps Admin Alert System',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    webhook: string,
    rule: AlertRule,
    metricValue: number,
    dimensions: MetricDimensions
  ): Promise<void> {
    const payload = {
      alert_name: rule.name,
      metric_name: rule.metric_name,
      metric_value: metricValue,
      threshold: rule.threshold,
      condition: rule.condition,
      severity: rule.severity,
      dimensions,
      fired_at: new Date().toISOString(),
    };

    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send resolution notification
   */
  private async sendResolutionNotification(
    rule: AlertRule,
    dimensions: MetricDimensions
  ): Promise<void> {
    for (const channel of rule.channels) {
      try {
        if (channel.type === 'slack' && channel.webhook) {
          const dimensionsText = Object.keys(dimensions).length > 0
            ? Object.entries(dimensions)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')
            : 'none';

          const payload = {
            attachments: [
              {
                color: '#00FF00',
                title: `:white_check_mark: Resolved: ${rule.name}`,
                text: `Alert has been automatically resolved. Dimensions: ${dimensionsText}`,
                footer: 'SheenApps Admin Alert System',
                ts: Math.floor(Date.now() / 1000),
              },
            ],
          };

          await fetch(channel.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      } catch (error) {
        this.logger.error('Failed to send resolution notification', {
          channel: channel.type,
          error,
        });
      }
    }
  }

  /**
   * Update rule's last_evaluated_at timestamp
   */
  private async updateRuleEvaluationTime(ruleId: string): Promise<void> {
    const supabase = makeAdminCtx();

    await supabase
      .from('alert_rules')
      .update({ last_evaluated_at: new Date().toISOString() })
      .eq('id', ruleId);
  }
}

// Singleton instance
let alertServiceInstance: AlertService | null = null;

export function getAlertService(): AlertService {
  if (!alertServiceInstance) {
    alertServiceInstance = new AlertService();
  }
  return alertServiceInstance;
}
