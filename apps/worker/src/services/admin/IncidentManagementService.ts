/**
 * Incident Management Service
 *
 * Handles incident lifecycle: create, update, resolve, timeline, post-mortems.
 * Integrates with alerting system for automatic incident creation.
 */

import { makeAdminCtx } from '../../lib/supabase';
import { ServerLoggingService } from '../serverLoggingService';

// Types
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentSeverity = 1 | 2 | 3 | 4;
export type TimelineEntryType = 'manual' | 'status_change' | 'alert_trigger' | 'system' | 'correction';

export interface Incident {
  id: string;
  incident_key?: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affected_systems: string[];
  status_page_message?: string;
  description?: string;
  created_at: string;
  resolved_at?: string;
  updated_at: string;
  created_by?: string;
  resolved_by?: string;
  duration_minutes: number;
}

export interface TimelineEntry {
  id: string;
  incident_id: string;
  message: string;
  entry_type: TimelineEntryType;
  created_at: string;
  created_by?: string;
}

export interface PostMortem {
  id: string;
  incident_id: string;
  what_happened?: string;
  impact?: string;
  root_cause?: string;
  lessons_learned?: string;
  action_items: ActionItem[];
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  title: string;
  owner?: string;
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface CreateIncidentInput {
  title: string;
  severity: IncidentSeverity;
  affected_systems?: string[] | undefined;
  status_page_message?: string | undefined;
  description?: string | undefined;
  incident_key?: string | undefined;
  created_by?: string | undefined;
}

export interface UpdateIncidentInput {
  title?: string | undefined;
  severity?: IncidentSeverity | undefined;
  status?: IncidentStatus | undefined;
  affected_systems?: string[] | undefined;
  status_page_message?: string | undefined;
  description?: string | undefined;
  resolved_by?: string | undefined;
}

export interface IncidentFilters {
  status?: IncidentStatus | IncidentStatus[] | undefined;
  severity?: IncidentSeverity | IncidentSeverity[] | undefined;
  affected_system?: string | undefined;
  from_date?: Date | undefined;
  to_date?: Date | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface MTTRStats {
  severity: number;
  incident_count: number;
  avg_duration_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
}

/**
 * IncidentManagementService - Handles all incident operations
 */
export class IncidentManagementService {
  private logger: ServerLoggingService;

  constructor() {
    this.logger = ServerLoggingService.getInstance();
  }

  /**
   * Create a new incident
   */
  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('incidents')
      .insert({
        title: input.title,
        severity: input.severity,
        affected_systems: input.affected_systems || [],
        status_page_message: input.status_page_message,
        description: input.description,
        incident_key: input.incident_key,
        created_by: input.created_by,
        status: 'investigating',
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create incident', { error, input });
      throw new Error(`Failed to create incident: ${error.message}`);
    }

    // Add initial timeline entry
    await this.addTimelineEntry(data.id, 'Incident created', 'system', input.created_by);

    this.logger.info('Incident created', {
      incidentId: data.id,
      severity: data.severity,
      title: data.title,
    });

    return data;
  }

  /**
   * Get incident by ID
   */
  async getIncident(id: string): Promise<Incident | null> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      this.logger.error('Failed to get incident', { error, id });
      throw new Error(`Failed to get incident: ${error.message}`);
    }

    return data;
  }

  /**
   * Get incident by incident_key (for deduplication)
   */
  async getIncidentByKey(incidentKey: string): Promise<Incident | null> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('incident_key', incidentKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      this.logger.error('Failed to get incident by key', { error, incidentKey });
      throw new Error(`Failed to get incident by key: ${error.message}`);
    }

    return data;
  }

  /**
   * List incidents with filters
   */
  async listIncidents(filters: IncidentFilters = {}): Promise<{ data: Incident[]; count: number }> {
    const supabase = makeAdminCtx();

    let query = supabase
      .from('incidents')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      query = query.in('status', statuses);
    }

    if (filters.severity) {
      const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
      query = query.in('severity', severities);
    }

    if (filters.affected_system) {
      query = query.contains('affected_systems', [filters.affected_system]);
    }

    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date.toISOString());
    }

    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date.toISOString());
    }

    // Pagination
    query = query
      .order('created_at', { ascending: false })
      .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('Failed to list incidents', { error, filters });
      throw new Error(`Failed to list incidents: ${error.message}`);
    }

    return { data: data || [], count: count || 0 };
  }

  /**
   * Update incident
   */
  async updateIncident(id: string, input: UpdateIncidentInput): Promise<Incident> {
    const supabase = makeAdminCtx();

    const updateData: Record<string, unknown> = {};

    if (input.title !== undefined) updateData.title = input.title;
    if (input.severity !== undefined) updateData.severity = input.severity;
    if (input.affected_systems !== undefined) updateData.affected_systems = input.affected_systems;
    if (input.status_page_message !== undefined) updateData.status_page_message = input.status_page_message;
    if (input.description !== undefined) updateData.description = input.description;

    // Handle status change
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = input.resolved_by;
      }
    }

    const { data, error } = await supabase
      .from('incidents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to update incident', { error, id, input });
      throw new Error(`Failed to update incident: ${error.message}`);
    }

    return data;
  }

  /**
   * Resolve incident
   */
  async resolveIncident(
    id: string,
    resolvedBy: string,
    resolution_note?: string
  ): Promise<Incident> {
    // Check if post-mortem is required
    const incident = await this.getIncident(id);
    if (!incident) {
      throw new Error('Incident not found');
    }

    // SEV1-2 require post-mortems before resolution
    if (incident.severity <= 2) {
      const postMortem = await this.getPostMortem(id);
      if (!postMortem) {
        throw new Error(`SEV${incident.severity} incidents require a post-mortem before resolution`);
      }
    }

    const updated = await this.updateIncident(id, {
      status: 'resolved',
      resolved_by: resolvedBy,
    });

    if (resolution_note) {
      await this.addTimelineEntry(id, resolution_note, 'manual', resolvedBy);
    }

    return updated;
  }

  /**
   * Add timeline entry
   */
  async addTimelineEntry(
    incidentId: string,
    message: string,
    entryType: TimelineEntryType = 'manual',
    createdBy?: string
  ): Promise<TimelineEntry> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('incident_timeline')
      .insert({
        incident_id: incidentId,
        message,
        entry_type: entryType,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to add timeline entry', { error, incidentId });
      throw new Error(`Failed to add timeline entry: ${error.message}`);
    }

    return data;
  }

  /**
   * Get timeline for incident
   */
  async getTimeline(incidentId: string): Promise<TimelineEntry[]> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('incident_timeline')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to get timeline', { error, incidentId });
      throw new Error(`Failed to get timeline: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create or update post-mortem
   */
  async upsertPostMortem(
    incidentId: string,
    input: Partial<Omit<PostMortem, 'id' | 'incident_id' | 'created_at' | 'updated_at'>>
  ): Promise<PostMortem> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('incident_postmortems')
      .upsert(
        {
          incident_id: incidentId,
          what_happened: input.what_happened,
          impact: input.impact,
          root_cause: input.root_cause,
          lessons_learned: input.lessons_learned,
          action_items: input.action_items || [],
        },
        { onConflict: 'incident_id' }
      )
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to upsert post-mortem', { error, incidentId });
      throw new Error(`Failed to upsert post-mortem: ${error.message}`);
    }

    return data;
  }

  /**
   * Get post-mortem for incident
   */
  async getPostMortem(incidentId: string): Promise<PostMortem | null> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('incident_postmortems')
      .select('*')
      .eq('incident_id', incidentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      this.logger.error('Failed to get post-mortem', { error, incidentId });
      throw new Error(`Failed to get post-mortem: ${error.message}`);
    }

    return data;
  }

  /**
   * Get MTTR stats by severity
   */
  async getMTTRStats(days: number = 30): Promise<MTTRStats[]> {
    const supabase = makeAdminCtx();

    const stats: MTTRStats[] = [];

    for (let severity = 1; severity <= 4; severity++) {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data } = await supabase
        .from('incidents')
        .select('duration_minutes')
        .eq('status', 'resolved')
        .eq('severity', severity)
        .gte('created_at', since.toISOString());

      if (data && data.length > 0) {
        const durations = data.map((d: { duration_minutes: number }) => d.duration_minutes);
        stats.push({
          severity,
          incident_count: data.length,
          avg_duration_minutes: durations.reduce((a: number, b: number) => a + b, 0) / data.length,
          min_duration_minutes: Math.min(...durations),
          max_duration_minutes: Math.max(...durations),
        });
      }
    }

    return stats;
  }

  /**
   * Get incident with full details (timeline + post-mortem)
   */
  async getIncidentWithDetails(id: string): Promise<{
    incident: Incident;
    timeline: TimelineEntry[];
    postMortem: PostMortem | null;
  } | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    const [timeline, postMortem] = await Promise.all([
      this.getTimeline(id),
      this.getPostMortem(id),
    ]);

    return { incident, timeline, postMortem };
  }

  /**
   * Create incident from alert (called by alert evaluator)
   */
  async createIncidentFromAlert(
    alertRuleId: string,
    alertRuleName: string,
    metricValue: number,
    threshold: number,
    severity: 'warning' | 'critical'
  ): Promise<Incident> {
    const incidentKey = `alert_${alertRuleId}_${new Date().toISOString().split('T')[0]}`;

    // Check for existing incident with same key
    const existing = await this.getIncidentByKey(incidentKey);
    if (existing) {
      // Add timeline entry instead of creating duplicate
      await this.addTimelineEntry(
        existing.id,
        `Alert triggered again: ${alertRuleName} (value: ${metricValue}, threshold: ${threshold})`,
        'alert_trigger'
      );
      return existing;
    }

    // Map alert severity to incident severity
    const incidentSeverity: IncidentSeverity = severity === 'critical' ? 2 : 3;

    const incident = await this.createIncident({
      title: `Alert: ${alertRuleName}`,
      severity: incidentSeverity,
      description: `Triggered by alert rule. Current value: ${metricValue}, threshold: ${threshold}`,
      incident_key: incidentKey,
      affected_systems: [], // Could be derived from alert rule dimensions
    });

    await this.addTimelineEntry(
      incident.id,
      `Created from alert rule "${alertRuleName}"`,
      'alert_trigger'
    );

    return incident;
  }
}

// Singleton instance
let incidentManagementServiceInstance: IncidentManagementService | null = null;

export function getIncidentManagementService(): IncidentManagementService {
  if (!incidentManagementServiceInstance) {
    incidentManagementServiceInstance = new IncidentManagementService();
  }
  return incidentManagementServiceInstance;
}
