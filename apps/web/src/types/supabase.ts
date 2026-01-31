export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assets: {
        Row: {
          hash: string
          mime_type: string | null
          project_id: string | null
          size: number | null
          uploaded_at: string | null
          uploader_id: string | null
        }
        Insert: {
          hash: string
          mime_type?: string | null
          project_id?: string | null
          size?: number | null
          uploaded_at?: string | null
          uploader_id?: string | null
        }
        Update: {
          hash?: string
          mime_type?: string | null
          project_id?: string | null
          size?: number | null
          uploaded_at?: string | null
          uploader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string | null
          head_id: string | null
          id: string
          is_published: boolean | null
          name: string
          project_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          head_id?: string | null
          id?: string
          is_published?: boolean | null
          name?: string
          project_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          head_id?: string | null
          id?: string
          is_published?: boolean | null
          name?: string
          project_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "commits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      commits: {
        Row: {
          author_id: string | null
          created_at: string | null
          id: string
          message: string | null
          parent_ids: string[]
          payload_size: number | null
          project_id: string | null
          tree_hash: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          parent_ids?: string[]
          payload_size?: number | null
          project_id?: string | null
          tree_hash: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          parent_ids?: string[]
          payload_size?: number | null
          project_id?: string | null
          tree_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      export_logs: {
        Row: {
          id: string
          project_id: string | null
          user_id: string | null
          format: string
          exported_at: string
          created_at: string | null
        }
        Insert: {
          id?: string
          project_id?: string | null
          user_id?: string | null
          format: string
          exported_at: string
          created_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string | null
          user_id?: string | null
          format?: string
          exported_at?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      quota_concurrent_attempts: {
        Row: {
          id: string
          user_id: string | null
          attempted_at: string
          current_count: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          attempted_at?: string
          current_count?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          attempted_at?: string
          current_count?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      quota_audit_logs: {
        Row: {
          id: string
          event_type: string
          user_id: string
          metric: string
          metadata: Json
          created_at: string | null
        }
        Insert: {
          id?: string
          event_type: string
          user_id: string
          metric: string
          metadata?: Json
          created_at?: string | null
        }
        Update: {
          id?: string
          event_type?: string
          user_id?: string
          metric?: string
          metadata?: Json
          created_at?: string | null
        }
        Relationships: []
      }
      quota_audit_log: {
        Row: {
          id: string
          user_id: string
          metric: string
          attempted_amount: number
          success: boolean
          reason: string
          context: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          metric: string
          attempted_amount: number
          success: boolean
          reason: string
          context?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          metric?: string
          attempted_amount?: number
          success?: boolean
          reason?: string
          context?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          id: string
          user_id: string
          metric: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          metric: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          metric?: string
          amount?: number
          created_at?: string
        }
        Relationships: []
      }
      admin_alerts: {
        Row: {
          id: string
          type: string
          severity: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          type: string
          severity: string
          metadata: Json
          created_at?: string
        }
        Update: {
          id?: string
          type?: string
          severity?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          owner_id: string | null
          name: string
          subdomain: string | null
          config: Json | null
          created_at: string | null
          updated_at: string | null
          archived_at: string | null
          last_accessed_at: string | null
          thumbnail_url: string | null
          build_status: 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded'
          current_build_id: string | null
          current_version_id: string | null
          framework: string
          preview_url: string | null
          last_build_started: string | null
          last_build_completed: string | null
          published_version_id: string | null
          current_version_name: string | null
          created_by_service: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          name: string
          subdomain?: string | null
          config?: Json | null
          created_at?: string | null
          updated_at?: string | null
          archived_at?: string | null
          last_accessed_at?: string | null
          thumbnail_url?: string | null
          build_status?: 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded'
          current_build_id?: string | null
          current_version_id?: string | null
          framework?: string
          preview_url?: string | null
          last_build_started?: string | null
          last_build_completed?: string | null
          published_version_id?: string | null
          current_version_name?: string | null
          created_by_service?: string
        }
        Update: {
          id?: string
          owner_id?: string | null
          name?: string
          subdomain?: string | null
          config?: Json | null
          created_at?: string | null
          updated_at?: string | null
          archived_at?: string | null
          last_accessed_at?: string | null
          thumbnail_url?: string | null
          build_status?: 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded'
          current_build_id?: string | null
          current_version_id?: string | null
          framework?: string
          preview_url?: string | null
          last_build_started?: string | null
          last_build_completed?: string | null
          published_version_id?: string | null
          current_version_name?: string | null
          created_by_service?: string
        }
        Relationships: []
      }
      pricing_tests: {
        Row: {
          id: string
          name: string
          description: string | null
          test_type: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
          status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
          source_catalog_id: string
          test_catalog_id: string
          scheduled_start_at: string | null
          actual_start_at: string | null
          scheduled_end_at: string | null
          actual_end_at: string | null
          success_criteria: Json
          auto_promote_on_success: boolean | null
          test_config: Json
          current_metrics: Json | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          test_type: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
          status?: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
          source_catalog_id: string
          test_catalog_id: string
          scheduled_start_at?: string | null
          actual_start_at?: string | null
          scheduled_end_at?: string | null
          actual_end_at?: string | null
          success_criteria?: Json
          auto_promote_on_success?: boolean | null
          test_config?: Json
          current_metrics?: Json | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          test_type?: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
          status?: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
          source_catalog_id?: string
          test_catalog_id?: string
          scheduled_start_at?: string | null
          actual_start_at?: string | null
          scheduled_end_at?: string | null
          actual_end_at?: string | null
          success_criteria?: Json
          auto_promote_on_success?: boolean | null
          test_config?: Json
          current_metrics?: Json | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_test_configurations: {
        Row: {
          id: string
          test_id: string
          config_type: string
          config_data: Json
          execution_order: number | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          test_id: string
          config_type: string
          config_data: Json
          execution_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          config_type?: string
          config_data?: Json
          execution_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_test_configurations_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "pricing_tests"
            referencedColumns: ["id"]
          }
        ]
      }
      pricing_test_results: {
        Row: {
          id: string
          test_id: string
          measured_at: string
          measurement_window: string | null
          test_group: string
          metrics: Json
          sample_size: number | null
          confidence_level: number | null
          p_value: number | null
          is_statistically_significant: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          measured_at?: string
          measurement_window?: string | null
          test_group: string
          metrics: Json
          sample_size?: number | null
          confidence_level?: number | null
          p_value?: number | null
          is_statistically_significant?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          measured_at?: string
          measurement_window?: string | null
          test_group?: string
          metrics?: Json
          sample_size?: number | null
          confidence_level?: number | null
          p_value?: number | null
          is_statistically_significant?: boolean | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_test_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "pricing_tests"
            referencedColumns: ["id"]
          }
        ]
      }
      pricing_test_rollout_progress: {
        Row: {
          id: string
          test_id: string
          stage_name: string
          target_percentage: number | null
          actual_percentage: number | null
          status: 'pending' | 'active' | 'completed' | 'failed' | 'rolled_back'
          started_at: string | null
          completed_at: string | null
          duration_minutes: number | null
          stage_success_criteria: Json | null
          criteria_met: boolean | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          test_id: string
          stage_name: string
          target_percentage?: number | null
          actual_percentage?: number | null
          status?: 'pending' | 'active' | 'completed' | 'failed' | 'rolled_back'
          started_at?: string | null
          completed_at?: string | null
          duration_minutes?: number | null
          stage_success_criteria?: Json | null
          criteria_met?: boolean | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          stage_name?: string
          target_percentage?: number | null
          actual_percentage?: number | null
          status?: 'pending' | 'active' | 'completed' | 'failed' | 'rolled_back'
          started_at?: string | null
          completed_at?: string | null
          duration_minutes?: number | null
          stage_success_criteria?: Json | null
          criteria_met?: boolean | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_test_rollout_progress_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "pricing_tests"
            referencedColumns: ["id"]
          }
        ]
      }
      pricing_test_audit_logs: {
        Row: {
          id: string
          test_id: string
          action: string
          actor_id: string
          actor_email: string | null
          reason: string | null
          correlation_id: string | null
          before_state: Json | null
          after_state: Json | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          action: string
          actor_id: string
          actor_email?: string | null
          reason?: string | null
          correlation_id?: string | null
          before_state?: Json | null
          after_state?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          action?: string
          actor_id?: string
          actor_email?: string | null
          reason?: string | null
          correlation_id?: string | null
          before_state?: Json | null
          after_state?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_test_audit_logs_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "pricing_tests"
            referencedColumns: ["id"]
          }
        ]
      }
      pricing_test_allocations: {
        Row: {
          id: string
          test_id: string
          user_id: string | null
          session_id: string
          test_group: string
          allocated_catalog_id: string
          allocated_at: string
          ip_address: unknown | null
          user_agent: string | null
          allocation_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          user_id?: string | null
          session_id: string
          test_group: string
          allocated_catalog_id: string
          allocated_at?: string
          ip_address?: unknown | null
          user_agent?: string | null
          allocation_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          user_id?: string | null
          session_id?: string
          test_group?: string
          allocated_catalog_id?: string
          allocated_at?: string
          ip_address?: unknown | null
          user_agent?: string | null
          allocation_reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_test_allocations_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "pricing_tests"
            referencedColumns: ["id"]
          }
        ]
      }
      project_versions: {
        Row: {
          id: string
          user_id: string
          project_id: string
          version_id: string
          prompt: string
          parent_version_id: string | null
          preview_url: string | null
          artifact_url: string | null
          framework: string | null
          build_duration_ms: number | null
          install_duration_ms: number | null
          deploy_duration_ms: number | null
          output_size_bytes: number | null
          ai_json: Json | null
          status: 'building' | 'deployed' | 'failed'
          needs_rebuild: boolean | null
          base_snapshot_id: string | null
          cf_deployment_id: string | null
          node_version: string | null
          pnpm_version: string | null
          created_at: string | null
          updated_at: string | null
          version_metadata_id: string | null
          enhanced_prompt: string | null
          prompt_metadata: Json | null
          ai_session_id: string | null
          ai_session_created_at: string | null
          ai_session_last_used_at: string | null
          artifact_size: number | null
          artifact_checksum: string | null
          is_published: boolean | null
          published_at: string | null
          published_by_user_id: string | null
          user_comment: string | null
          version_name: string | null
          version_description: string | null
          change_type: string | null
          major_version: number | null
          minor_version: number | null
          patch_version: number | null
          breaking_risk: string | null
          auto_classified: boolean | null
          classification_confidence: number | null
          classification_reasoning: string | null
          display_version_number: number | null
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          version_id: string
          prompt: string
          parent_version_id?: string | null
          preview_url?: string | null
          artifact_url?: string | null
          framework?: string | null
          build_duration_ms?: number | null
          install_duration_ms?: number | null
          deploy_duration_ms?: number | null
          output_size_bytes?: number | null
          ai_json?: Json | null
          status: 'building' | 'deployed' | 'failed'
          needs_rebuild?: boolean | null
          base_snapshot_id?: string | null
          cf_deployment_id?: string | null
          node_version?: string | null
          pnpm_version?: string | null
          created_at?: string | null
          updated_at?: string | null
          version_metadata_id?: string | null
          enhanced_prompt?: string | null
          prompt_metadata?: Json | null
          ai_session_id?: string | null
          ai_session_created_at?: string | null
          ai_session_last_used_at?: string | null
          artifact_size?: number | null
          artifact_checksum?: string | null
          is_published?: boolean | null
          published_at?: string | null
          published_by_user_id?: string | null
          user_comment?: string | null
          version_name?: string | null
          version_description?: string | null
          change_type?: string | null
          major_version?: number | null
          minor_version?: number | null
          patch_version?: number | null
          breaking_risk?: string | null
          auto_classified?: boolean | null
          classification_confidence?: number | null
          classification_reasoning?: string | null
          display_version_number?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string
          version_id?: string
          prompt?: string
          parent_version_id?: string | null
          preview_url?: string | null
          artifact_url?: string | null
          framework?: string | null
          build_duration_ms?: number | null
          install_duration_ms?: number | null
          deploy_duration_ms?: number | null
          output_size_bytes?: number | null
          ai_json?: Json | null
          status?: 'building' | 'deployed' | 'failed'
          needs_rebuild?: boolean | null
          base_snapshot_id?: string | null
          cf_deployment_id?: string | null
          node_version?: string | null
          pnpm_version?: string | null
          created_at?: string | null
          updated_at?: string | null
          version_metadata_id?: string | null
          enhanced_prompt?: string | null
          prompt_metadata?: Json | null
          ai_session_id?: string | null
          ai_session_created_at?: string | null
          ai_session_last_used_at?: string | null
          artifact_size?: number | null
          artifact_checksum?: string | null
          is_published?: boolean | null
          published_at?: string | null
          published_by_user_id?: string | null
          user_comment?: string | null
          version_name?: string | null
          version_description?: string | null
          change_type?: string | null
          major_version?: number | null
          minor_version?: number | null
          patch_version?: number | null
          breaking_risk?: string | null
          auto_classified?: boolean | null
          classification_confidence?: number | null
          classification_reasoning?: string | null
          display_version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string | null
          user_id: string | null
          role: string | null
          invited_by: string | null
          invited_at: string | null
          joined_at: string | null
        }
        Insert: {
          id?: string
          organization_id?: string | null
          user_id?: string | null
          role?: string | null
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string | null
          user_id?: string | null
          role?: string | null
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string | null
          owner_id: string
          settings: Json | null
          created_at: string | null
          updated_at: string | null
          subscription_tier: string | null
          subscription_status: string | null
        }
        Insert: {
          id?: string
          name: string
          slug?: string | null
          owner_id: string
          settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          subscription_tier?: string | null
          subscription_status?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string | null
          owner_id?: string
          settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          subscription_tier?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
      project_recommendations: {
        Row: {
          id: string
          project_id: string
          version_id: string
          recommendations: Json
          created_at: string | null
          build_id: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          project_id: string
          version_id: string
          recommendations: Json
          created_at?: string | null
          build_id?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          version_id?: string
          recommendations?: Json
          created_at?: string | null
          build_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_recommendations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      debug_auth_context: {
        Args: Record<PropertyKey, never>
        Returns: Array<{
          user_id: string | null
          role: string | null
          aal: string | null
          jwt_claims: Json
        }>
      }
      check_and_consume_quota: {
        Args: {
          p_user_id: string
          p_metric: string
          p_amount: number
          p_idempotency_key?: string
        }
        Returns: Array<{
          allowed: boolean
          remaining: number
          limit_amount: number
          bonus_used: number
          already_processed: boolean
        }>
      }
      create_commit_and_update_branch: {
        Args: {
          p_project_id: string
          p_author_id: string
          p_tree_hash: string
          p_message: string
          p_payload_size: number
          p_branch_name?: string
        }
        Returns: string
      }
      get_users_near_quota_limit: {
        Args: {
          p_threshold_percentage: number
        }
        Returns: Array<{
          userId: string
          email: string
          metric: string
          usagePercent: number
          remaining: number
          planName: string
        }>
      }
      get_user_quota_status: {
        Args: {
          p_user_id: string
        }
        Returns: Array<{
          metric: string
          plan_limit: number
          current_usage: number
          remaining: number
          usage_percent: number
          bonus_available: number
          last_reset: string
          next_reset: string
        }>
      }
      refund_project_quota: {
        Args: {
          p_user_id: string
          p_project_id: string
        }
        Returns: Array<{
          success: boolean
          previous_usage: number
          new_usage: number
          message: string
        }>
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
