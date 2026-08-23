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
      activity_logs: {
        Row: {
          action: string | null
          context: Json | null
          id: string
          target_id: string | null
          target_table: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          context?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          context?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_actions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          last_error_at: string | null
          max_attempts: number
          payload: Json
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          request_id: string
          requires_approval: boolean
          result: Json | null
          risk: Database["public"]["Enums"]["agent_action_risk"]
          run_after: string
          status: Database["public"]["Enums"]["agent_action_status"]
          summary: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number
          payload?: Json
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          request_id: string
          requires_approval?: boolean
          result?: Json | null
          risk?: Database["public"]["Enums"]["agent_action_risk"]
          run_after?: string
          status?: Database["public"]["Enums"]["agent_action_status"]
          summary: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number
          payload?: Json
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          request_id?: string
          requires_approval?: boolean
          result?: Json | null
          risk?: Database["public"]["Enums"]["agent_action_risk"]
          run_after?: string
          status?: Database["public"]["Enums"]["agent_action_status"]
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_attachments: {
        Row: {
          agent_request_id: string
          caption: string | null
          created_at: string
          created_by: string
          id: string
          kind: string
          public_url: string
          storage_path: string
        }
        Insert: {
          agent_request_id: string
          caption?: string | null
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          public_url: string
          storage_path: string
        }
        Update: {
          agent_request_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          public_url?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_attachments_agent_request_id_fkey"
            columns: ["agent_request_id"]
            isOneToOne: false
            referencedRelation: "agent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_events: {
        Row: {
          content: Json
          created_at: string
          id: string
          kind: string
          run_id: string
          step: number
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          kind: string
          run_id: string
          step: number
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          kind?: string
          run_id?: string
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_human_approval_intents: {
        Row: {
          approval_kind: string
          approver_user_id: string
          consumed_at: string | null
          created_at: string
          engineering_case_id: string
          expires_at: string
          id: string
          metadata: Json
          mission_id: string | null
          request_id: string
          token_sha256: string
        }
        Insert: {
          approval_kind: string
          approver_user_id: string
          consumed_at?: string | null
          created_at?: string
          engineering_case_id: string
          expires_at: string
          id?: string
          metadata?: Json
          mission_id?: string | null
          request_id: string
          token_sha256: string
        }
        Update: {
          approval_kind?: string
          approver_user_id?: string
          consumed_at?: string | null
          created_at?: string
          engineering_case_id?: string
          expires_at?: string
          id?: string
          metadata?: Json
          mission_id?: string | null
          request_id?: string
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_human_approval_intents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "agent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_jobs: {
        Row: {
          attempts: number
          created_at: string
          heartbeat_at: string | null
          id: string
          kind: Database["public"]["Enums"]["agent_job_kind"]
          last_error: string | null
          last_error_at: string | null
          locked_at: string | null
          locked_by: string | null
          logs_url: string | null
          max_attempts: number
          payload: Json
          priority: number
          request_id: string | null
          result: Json | null
          run_after: string
          status: Database["public"]["Enums"]["agent_job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          heartbeat_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["agent_job_kind"]
          last_error?: string | null
          last_error_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          logs_url?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          request_id?: string | null
          result?: Json | null
          run_after?: string
          status?: Database["public"]["Enums"]["agent_job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          heartbeat_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["agent_job_kind"]
          last_error?: string | null
          last_error_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          logs_url?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          request_id?: string | null
          result?: Json | null
          run_after?: string
          status?: Database["public"]["Enums"]["agent_job_status"]
          updated_at?: string
        }
        Relationships: []
      }
      agent_requests: {
        Row: {
          created_at: string
          description: string
          github_branch: string | null
          github_commit_sha: string | null
          github_issue_number: number | null
          github_issue_url: string | null
          github_pr_number: number | null
          github_pr_url: string | null
          id: string
          intent: Database["public"]["Enums"]["agent_request_intent"] | null
          llm_confidence: number | null
          llm_model: string | null
          llm_notes: string | null
          normalized_json: Json | null
          reporter_id: string | null
          reporter_role: string | null
          run_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["agent_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          github_branch?: string | null
          github_commit_sha?: string | null
          github_issue_number?: number | null
          github_issue_url?: string | null
          github_pr_number?: number | null
          github_pr_url?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["agent_request_intent"] | null
          llm_confidence?: number | null
          llm_model?: string | null
          llm_notes?: string | null
          normalized_json?: Json | null
          reporter_id?: string | null
          reporter_role?: string | null
          run_id?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["agent_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          github_branch?: string | null
          github_commit_sha?: string | null
          github_issue_number?: number | null
          github_issue_url?: string | null
          github_pr_number?: number | null
          github_pr_url?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["agent_request_intent"] | null
          llm_confidence?: number | null
          llm_model?: string | null
          llm_notes?: string | null
          normalized_json?: Json | null
          reporter_id?: string | null
          reporter_role?: string | null
          run_id?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["agent_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_requests_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_requests_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          created_at: string
          goal: string
          id: string
          idempotency_key: string | null
          shop_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal: string
          id?: string
          idempotency_key?: string | null
          shop_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          idempotency_key?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_action_approvals: {
        Row: {
          action_preview_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string | null
          id: string
          metadata: Json
          owner_pin_required: boolean
          owner_pin_verification_ref: string | null
          owner_pin_verified: boolean
          requested_at: string
          requested_by: string | null
          shop_id: string
          status: string
        }
        Insert: {
          action_preview_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          owner_pin_required?: boolean
          owner_pin_verification_ref?: string | null
          owner_pin_verified?: boolean
          requested_at?: string
          requested_by?: string | null
          shop_id: string
          status?: string
        }
        Update: {
          action_preview_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          owner_pin_required?: boolean
          owner_pin_verification_ref?: string | null
          owner_pin_verified?: boolean
          requested_at?: string
          requested_by?: string | null
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_approvals_action_preview_id_fkey"
            columns: ["action_preview_id"]
            isOneToOne: false
            referencedRelation: "ai_action_previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_approvals_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_approvals_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_events: {
        Row: {
          action_preview_id: string | null
          actor_id: string | null
          actor_role: string | null
          approval_id: string | null
          created_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          metadata: Json
          payload: Json
          recommendation_id: string | null
          shop_id: string
          source: string
        }
        Insert: {
          action_preview_id?: string | null
          actor_id?: string | null
          actor_role?: string | null
          approval_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          payload?: Json
          recommendation_id?: string | null
          shop_id: string
          source?: string
        }
        Update: {
          action_preview_id?: string | null
          actor_id?: string | null
          actor_role?: string | null
          approval_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          payload?: Json
          recommendation_id?: string | null
          shop_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_events_action_preview_id_fkey"
            columns: ["action_preview_id"]
            isOneToOne: false
            referencedRelation: "ai_action_previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_events_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "ai_action_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_events_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ai_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_previews: {
        Row: {
          action_type: string
          affected_records: Json
          compensation_plan: Json
          created_at: string
          created_by: string | null
          domain: string
          evidence_snapshot_id: string | null
          expires_at: string | null
          id: string
          idempotency_key: string | null
          intended_mutations: Json
          metadata: Json
          preview_payload: Json
          recommendation_id: string | null
          requires_approval: boolean
          requires_owner_pin: boolean
          risk_tier: string
          shop_id: string
          side_effects: Json
          status: string
          subject_id: string | null
          subject_type: string
          updated_at: string
        }
        Insert: {
          action_type: string
          affected_records?: Json
          compensation_plan?: Json
          created_at?: string
          created_by?: string | null
          domain: string
          evidence_snapshot_id?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          intended_mutations?: Json
          metadata?: Json
          preview_payload?: Json
          recommendation_id?: string | null
          requires_approval?: boolean
          requires_owner_pin?: boolean
          risk_tier?: string
          shop_id: string
          side_effects?: Json
          status?: string
          subject_id?: string | null
          subject_type: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          affected_records?: Json
          compensation_plan?: Json
          created_at?: string
          created_by?: string | null
          domain?: string
          evidence_snapshot_id?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          intended_mutations?: Json
          metadata?: Json
          preview_payload?: Json
          recommendation_id?: string | null
          requires_approval?: boolean
          requires_owner_pin?: boolean
          risk_tier?: string
          shop_id?: string
          side_effects?: Json
          status?: string
          subject_id?: string | null
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_previews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_previews_evidence_snapshot_id_fkey"
            columns: ["evidence_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ai_evidence_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_previews_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ai_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_previews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_previews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_automation_capability_settings: {
        Row: {
          capability: string
          created_at: string
          enabled: boolean
          id: string
          shop_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capability: string
          created_at?: string
          enabled?: boolean
          id?: string
          shop_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capability?: string
          created_at?: string
          enabled?: boolean
          id?: string
          shop_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_automation_capability_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_automation_capability_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_automation_capability_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_automation_evidence: {
        Row: {
          capability: string
          created_at: string
          evidence_key: string
          id: string
          metadata: Json
          occurred_at: string
          outcome: string
          recorded_by: string | null
          shop_id: string
          source: string
          source_entity_id: string | null
          source_entity_type: string | null
          updated_at: string
        }
        Insert: {
          capability: string
          created_at?: string
          evidence_key: string
          id?: string
          metadata?: Json
          occurred_at?: string
          outcome?: string
          recorded_by?: string | null
          shop_id: string
          source: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          updated_at?: string
        }
        Update: {
          capability?: string
          created_at?: string
          evidence_key?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          outcome?: string
          recorded_by?: string | null
          shop_id?: string
          source?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_automation_evidence_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_automation_evidence_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_automation_evidence_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_automation_shop_controls: {
        Row: {
          automation_paused: boolean
          created_at: string
          pause_reason: string | null
          paused_at: string | null
          shop_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          automation_paused?: boolean
          created_at?: string
          pause_reason?: string | null
          paused_at?: string | null
          shop_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          automation_paused?: boolean
          created_at?: string
          pause_reason?: string | null
          paused_at?: string | null
          shop_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_automation_shop_controls_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_automation_shop_controls_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_automation_shop_controls_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_table: string | null
          event_type: string
          id: string
          payload: Json
          shop_id: string | null
          source_id: string | null
          training_source:
            | Database["public"]["Enums"]["ai_training_source"]
            | null
          user_id: string | null
          vehicle_ymm: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          event_type: string
          id?: string
          payload: Json
          shop_id?: string | null
          source_id?: string | null
          training_source?:
            | Database["public"]["Enums"]["ai_training_source"]
            | null
          user_id?: string | null
          vehicle_ymm?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          event_type?: string
          id?: string
          payload?: Json
          shop_id?: string | null
          source_id?: string | null
          training_source?:
            | Database["public"]["Enums"]["ai_training_source"]
            | null
          user_id?: string | null
          vehicle_ymm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_evidence_snapshots: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          domain: string
          evidence_kind: string
          freshness_at: string | null
          id: string
          metadata: Json
          missing_data: Json
          shop_id: string
          snapshot: Json
          source_refs: Json
          subject_id: string | null
          subject_type: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          domain: string
          evidence_kind: string
          freshness_at?: string | null
          id?: string
          metadata?: Json
          missing_data?: Json
          shop_id: string
          snapshot?: Json
          source_refs?: Json
          subject_id?: string | null
          subject_type: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          domain?: string
          evidence_kind?: string
          freshness_at?: string | null
          id?: string
          metadata?: Json
          missing_data?: Json
          shop_id?: string
          snapshot?: Json
          source_refs?: Json
          subject_id?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_evidence_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_evidence_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_evidence_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recommendations: {
        Row: {
          assigned_to: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          domain: string
          evidence_snapshot_id: string | null
          evidence_snapshot_ids: string[]
          expires_at: string | null
          id: string
          metadata: Json
          missing_data: Json
          priority: string
          recommendation_type: string
          recommended_action: Json
          requires_approval: boolean
          requires_owner_pin: boolean
          resolved_at: string | null
          resolved_by: string | null
          risk_tier: string
          shop_id: string
          side_effects: Json
          source: string
          source_run_id: string | null
          status: string
          subject_id: string | null
          subject_type: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          domain: string
          evidence_snapshot_id?: string | null
          evidence_snapshot_ids?: string[]
          expires_at?: string | null
          id?: string
          metadata?: Json
          missing_data?: Json
          priority?: string
          recommendation_type: string
          recommended_action?: Json
          requires_approval?: boolean
          requires_owner_pin?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          risk_tier?: string
          shop_id: string
          side_effects?: Json
          source?: string
          source_run_id?: string | null
          status?: string
          subject_id?: string | null
          subject_type: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          domain?: string
          evidence_snapshot_id?: string | null
          evidence_snapshot_ids?: string[]
          expires_at?: string | null
          id?: string
          metadata?: Json
          missing_data?: Json
          priority?: string
          recommendation_type?: string
          recommended_action?: Json
          requires_approval?: boolean
          requires_owner_pin?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          risk_tier?: string
          shop_id?: string
          side_effects?: Json
          source?: string
          source_run_id?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_evidence_snapshot_id_fkey"
            columns: ["evidence_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ai_evidence_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          created_at: string | null
          id: string
          prompt: string | null
          response: string | null
          tool_used: string | null
          user_id: string | null
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          prompt?: string | null
          response?: string | null
          tool_used?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          prompt?: string | null
          response?: string | null
          tool_used?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestion_feedback: {
        Row: {
          accepted: boolean
          created_at: string
          created_by: string | null
          id: string
          labor_hours: number | null
          parts: Json
          shop_id: string
          suggestion_id: string | null
          title: string
          work_order_id: string
          work_order_line_id: string | null
        }
        Insert: {
          accepted: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          labor_hours?: number | null
          parts?: Json
          shop_id: string
          suggestion_id?: string | null
          title: string
          work_order_id: string
          work_order_line_id?: string | null
        }
        Update: {
          accepted?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          labor_hours?: number | null
          parts?: Json
          shop_id?: string
          suggestion_id?: string | null
          title?: string
          work_order_id?: string
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestion_feedback_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_data: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          shop_id: string | null
          source_event_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          shop_id?: string | null
          source_event_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          shop_id?: string | null
          source_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_training_data_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_data_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_data_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "ai_events"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          api_key: string | null
          created_at: string | null
          id: string
          label: string | null
          user_id: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          user_id?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      apps: {
        Row: {
          default_route: string
          icon_url: string | null
          id: string
          is_enabled: boolean
          name: string
          slug: string
        }
        Insert: {
          default_route: string
          icon_url?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          slug: string
        }
        Update: {
          default_route?: string
          icon_url?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          asset_type: string
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          meta: Json
          mime_type: string | null
          public_url: string | null
          shop_id: string
          size_bytes: number | null
          source: string
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          asset_type?: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          meta?: Json
          mime_type?: string | null
          public_url?: string | null
          shop_id: string
          size_bytes?: number | null
          source?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          meta?: Json
          mime_type?: string | null
          public_url?: string | null
          shop_id?: string
          size_bytes?: number | null
          source?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_daily_summaries: {
        Row: {
          action_items: Json
          created_at: string
          id: string
          links: Json
          notifications: Json
          role: string
          shop_id: string
          source_snapshot: Json
          summary_date: string
          summary_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: Json
          created_at?: string
          id?: string
          links?: Json
          notifications?: Json
          role: string
          shop_id: string
          source_snapshot?: Json
          summary_date?: string
          summary_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: Json
          created_at?: string
          id?: string
          links?: Json
          notifications?: Json
          role?: string
          shop_id?: string
          source_snapshot?: Json
          summary_date?: string
          summary_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_daily_summaries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_daily_summaries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_daily_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_discount_grants: {
        Row: {
          approved_by: string | null
          created_at: string
          discount_class: string
          duration: string
          duration_in_months: number | null
          id: string
          metadata: Json
          percent_off: number | null
          revoked_at: string | null
          shop_id: string | null
          status: string
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
          terms_version: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          discount_class: string
          duration: string
          duration_in_months?: number | null
          id?: string
          metadata?: Json
          percent_off?: number | null
          revoked_at?: string | null
          shop_id?: string | null
          status?: string
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          terms_version?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          discount_class?: string
          duration?: string
          duration_in_months?: number | null
          id?: string
          metadata?: Json
          percent_off?: number | null
          revoked_at?: string | null
          shop_id?: string | null
          status?: string
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          terms_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_discount_grants_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_discount_grants_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          dispatch_locked_ends_at: string | null
          dispatch_locked_starts_at: string | null
          dispatch_locked_status: string | null
          dispatch_owner_visit_id: string | null
          ends_at: string
          id: string
          lifecycle_metadata: Json
          notes: string | null
          shop_id: string
          starts_at: string
          status: string
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dispatch_locked_ends_at?: string | null
          dispatch_locked_starts_at?: string | null
          dispatch_locked_status?: string | null
          dispatch_owner_visit_id?: string | null
          ends_at: string
          id?: string
          lifecycle_metadata?: Json
          notes?: string | null
          shop_id: string
          starts_at: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dispatch_locked_ends_at?: string | null
          dispatch_locked_starts_at?: string | null
          dispatch_locked_status?: string | null
          dispatch_owner_visit_id?: string | null
          ends_at?: string
          id?: string
          lifecycle_metadata?: Json
          notes?: string | null
          shop_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "bookings_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "bookings_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "bookings_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "bookings_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          chat_id: string
          id: string
          joined_at: string | null
          profile_id: string
          role: string | null
        }
        Insert: {
          chat_id: string
          id?: string
          joined_at?: string | null
          profile_id: string
          role?: string | null
        }
        Update: {
          chat_id?: string
          id?: string
          joined_at?: string | null
          profile_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          context_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          title: string | null
          type: string
        }
        Insert: {
          context_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string | null
          type: string
        }
        Update: {
          context_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string | null
          type?: string
        }
        Relationships: []
      }
      content_assets: {
        Row: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["content_asset_type"]
          content_event_id: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          file_name: string | null
          file_size_bytes: number | null
          height: number | null
          id: string
          is_primary: boolean
          metadata: Json
          mime_type: string | null
          public_url: string | null
          shop_id: string
          sort_order: number
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["content_asset_type"]
          content_event_id: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          file_name?: string | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          mime_type?: string | null
          public_url?: string | null
          shop_id: string
          sort_order?: number
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          asset_id?: string
          asset_type?: Database["public"]["Enums"]["content_asset_type"]
          content_event_id?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          file_name?: string | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          mime_type?: string | null
          public_url?: string | null
          shop_id?: string
          sort_order?: number
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_content_event_id_fkey"
            columns: ["content_event_id"]
            isOneToOne: false
            referencedRelation: "content_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      content_events: {
        Row: {
          ai_event_id: string | null
          ai_prompt_version: string | null
          approved_at: string | null
          approved_by: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          inspection_id: string | null
          metadata: Json
          needs_review: boolean
          shop_id: string
          source_id: string | null
          source_type: Database["public"]["Enums"]["content_source_type"]
          status: Database["public"]["Enums"]["content_status"]
          summary: string | null
          title: string | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          ai_event_id?: string | null
          ai_prompt_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          inspection_id?: string | null
          metadata?: Json
          needs_review?: boolean
          shop_id: string
          source_id?: string | null
          source_type: Database["public"]["Enums"]["content_source_type"]
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          ai_event_id?: string | null
          ai_prompt_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          inspection_id?: string | null
          metadata?: Json
          needs_review?: boolean
          shop_id?: string
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["content_source_type"]
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "content_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "content_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "content_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "content_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pieces: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_json: Json | null
          body_markdown: string | null
          body_text: string | null
          content_event_id: string
          created_at: string
          created_by: string | null
          excerpt: string | null
          generated_by_ai: boolean
          id: string
          is_current: boolean
          language_code: string | null
          metadata: Json
          model_name: string | null
          piece_type: Database["public"]["Enums"]["content_piece_type"]
          platform: Database["public"]["Enums"]["publish_platform"] | null
          prompt_version: string | null
          seo_description: string | null
          seo_title: string | null
          shop_id: string
          slug: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string | null
          tone: string | null
          updated_at: string
          version_no: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_json?: Json | null
          body_markdown?: string | null
          body_text?: string | null
          content_event_id: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          generated_by_ai?: boolean
          id?: string
          is_current?: boolean
          language_code?: string | null
          metadata?: Json
          model_name?: string | null
          piece_type: Database["public"]["Enums"]["content_piece_type"]
          platform?: Database["public"]["Enums"]["publish_platform"] | null
          prompt_version?: string | null
          seo_description?: string | null
          seo_title?: string | null
          shop_id: string
          slug?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          tone?: string | null
          updated_at?: string
          version_no?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_json?: Json | null
          body_markdown?: string | null
          body_text?: string | null
          content_event_id?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          generated_by_ai?: boolean
          id?: string
          is_current?: boolean
          language_code?: string | null
          metadata?: Json
          model_name?: string | null
          piece_type?: Database["public"]["Enums"]["content_piece_type"]
          platform?: Database["public"]["Enums"]["publish_platform"] | null
          prompt_version?: string | null
          seo_description?: string | null
          seo_title?: string | null
          shop_id?: string
          slug?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          tone?: string | null
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pieces_content_event_id_fkey"
            columns: ["content_event_id"]
            isOneToOne: false
            referencedRelation: "content_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      content_platform_accounts: {
        Row: {
          access_token_encrypted: string | null
          account_label: string | null
          connection_active: boolean
          created_at: string
          created_by: string | null
          id: string
          last_connected_at: string | null
          last_sync_at: string | null
          metadata: Json
          platform: Database["public"]["Enums"]["publish_platform"]
          platform_account_id: string | null
          platform_username: string | null
          refresh_token_encrypted: string | null
          scopes: string[]
          shop_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          account_label?: string | null
          connection_active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_connected_at?: string | null
          last_sync_at?: string | null
          metadata?: Json
          platform: Database["public"]["Enums"]["publish_platform"]
          platform_account_id?: string | null
          platform_username?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          shop_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          account_label?: string | null
          connection_active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_connected_at?: string | null
          last_sync_at?: string | null
          metadata?: Json
          platform?: Database["public"]["Enums"]["publish_platform"]
          platform_account_id?: string | null
          platform_username?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          shop_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_platform_accounts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_platform_accounts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      content_publications: {
        Row: {
          caption: string | null
          content_asset_id: string | null
          content_event_id: string
          content_piece_id: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          id: string
          metadata: Json
          platform: Database["public"]["Enums"]["publish_platform"]
          platform_account_id: string | null
          platform_post_id: string | null
          platform_post_url: string | null
          published_at: string | null
          scheduled_for: string | null
          shop_id: string
          status: Database["public"]["Enums"]["publication_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          content_asset_id?: string | null
          content_event_id: string
          content_piece_id?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          platform: Database["public"]["Enums"]["publish_platform"]
          platform_account_id?: string | null
          platform_post_id?: string | null
          platform_post_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["publication_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          content_asset_id?: string | null
          content_event_id?: string
          content_piece_id?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          platform?: Database["public"]["Enums"]["publish_platform"]
          platform_account_id?: string | null
          platform_post_id?: string | null
          platform_post_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["publication_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_publications_content_asset_id_fkey"
            columns: ["content_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_publications_content_event_id_fkey"
            columns: ["content_event_id"]
            isOneToOne: false
            referencedRelation: "content_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_publications_content_piece_id_fkey"
            columns: ["content_piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_publications_platform_account_id_fkey"
            columns: ["platform_account_id"]
            isOneToOne: false
            referencedRelation: "content_platform_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_publications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_publications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_cta: string | null
          default_hook: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          name: string
          script_guidance: string | null
          shop_id: string
          updated_at: string
          visual_guidance: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_cta?: string | null
          default_hook?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          name: string
          script_guidance?: string | null
          shop_id: string
          updated_at?: string
          visual_guidance?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_cta?: string | null
          default_hook?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          name?: string
          script_guidance?: string | null
          shop_id?: string
          updated_at?: string
          visual_guidance?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          added_at: string | null
          conversation_id: string
          customer_id: string | null
          id: string
          participant_kind: string
          profile_id: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          added_at?: string | null
          conversation_id: string
          customer_id?: string | null
          id?: string
          participant_kind?: string
          profile_id?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          added_at?: string | null
          conversation_id?: string
          customer_id?: string | null
          id?: string
          participant_kind?: string
          profile_id?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          booking_id: string | null
          channel: string
          context_id: string | null
          context_type: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          is_group: boolean | null
          last_message_at: string | null
          shop_id: string | null
          title: string | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          archived_at?: string | null
          booking_id?: string | null
          channel?: string
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_group?: boolean | null
          last_message_at?: string | null
          shop_id?: string | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          archived_at?: string | null
          booking_id?: string | null
          channel?: string
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_group?: boolean | null
          last_message_at?: string | null
          shop_id?: string | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "conversations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "conversations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "conversations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "conversations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_account_merges: {
        Row: {
          created_at: string
          id: string
          merged_by: string
          moved_record_counts: Json
          operation_key: string
          reason: string
          shop_id: string
          source_customer_id: string
          source_snapshot: Json
          target_customer_id: string
          target_snapshot: Json
        }
        Insert: {
          created_at?: string
          id?: string
          merged_by: string
          moved_record_counts?: Json
          operation_key: string
          reason: string
          shop_id: string
          source_customer_id: string
          source_snapshot?: Json
          target_customer_id: string
          target_snapshot?: Json
        }
        Update: {
          created_at?: string
          id?: string
          merged_by?: string
          moved_record_counts?: Json
          operation_key?: string
          reason?: string
          shop_id?: string
          source_customer_id?: string
          source_snapshot?: Json
          target_customer_id?: string
          target_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "customer_account_merges_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_account_merges_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_account_merges_source_customer_id_fkey"
            columns: ["source_customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_account_merges_target_customer_id_fkey"
            columns: ["target_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_bookings: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          labor_hours_estimated: number | null
          preferred_date: string | null
          preferred_time: string | null
          selected_services: Json | null
          shop_id: string | null
          status: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: string | null
          vin: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          labor_hours_estimated?: number | null
          preferred_date?: string | null
          preferred_time?: string | null
          selected_services?: Json | null
          shop_id?: string | null
          status?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: string | null
          vin?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          labor_hours_estimated?: number | null
          preferred_date?: string | null
          preferred_time?: string | null
          selected_services?: Json | null
          shop_id?: string | null
          status?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: string | null
          vin?: string | null
        }
        Relationships: []
      }
      customer_contacts: {
        Row: {
          active: boolean
          can_approve: boolean
          can_view_billing: boolean
          created_at: string
          created_by: string | null
          customer_id: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          is_primary: boolean
          last_name: string | null
          phone: string | null
          portal_user_id: string | null
          role: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          can_approve?: boolean
          can_view_billing?: boolean
          created_at?: string
          created_by?: string | null
          customer_id: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          phone?: string | null
          portal_user_id?: string | null
          role?: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          can_approve?: boolean
          can_view_billing?: boolean
          created_at?: string
          created_by?: string | null
          customer_id?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          phone?: string | null
          portal_user_id?: string | null
          role?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_locations: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          is_primary: boolean
          location_type: string
          name: string
          postal_code: string | null
          province: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          is_primary?: boolean
          location_type?: string
          name: string
          postal_code?: string | null
          province?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          is_primary?: boolean
          location_type?: string
          name?: string
          postal_code?: string | null
          province?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_locations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_locations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_invites: {
        Row: {
          acceptance_metadata: Json
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string
          email: string
          enrollment_campaign_id: string | null
          expires_at: string | null
          id: string
          revoked_at: string | null
          shop_id: string | null
          source: string
          token: string
          work_order_id: string | null
        }
        Insert: {
          acceptance_metadata?: Json
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          email: string
          enrollment_campaign_id?: string | null
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          shop_id?: string | null
          source?: string
          token: string
          work_order_id?: string | null
        }
        Update: {
          acceptance_metadata?: Json
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          email?: string
          enrollment_campaign_id?: string | null
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          shop_id?: string | null
          source?: string
          token?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_invites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_invites_enrollment_campaign_id_fkey"
            columns: ["enrollment_campaign_id"]
            isOneToOne: false
            referencedRelation: "portal_enrollment_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_invites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_invites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_invites_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "customer_portal_invites_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "customer_portal_invites_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "customer_portal_invites_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "customer_portal_invites_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_pricing_agreements: {
        Row: {
          approval_reason: string
          approved_by: string
          created_at: string
          created_by: string
          currency: string
          customer_fee_cap: number | null
          customer_fee_type: string
          customer_fee_value: number
          customer_id: string
          effective_from: string
          effective_until: string | null
          expiry_warning_days: number
          id: string
          labor_discount_percent: number
          labor_rate: number | null
          minimum_parts_margin_percent: number
          name: string
          notes: string | null
          operation_key: string
          parts_discount_percent: number
          parts_markup_matrix: Json
          retired_at: string | null
          retired_by: string | null
          retired_reason: string | null
          shop_id: string
          source_type: string
          status: string
          supersedes_agreement_id: string | null
          updated_at: string
        }
        Insert: {
          approval_reason: string
          approved_by: string
          created_at?: string
          created_by: string
          currency?: string
          customer_fee_cap?: number | null
          customer_fee_type?: string
          customer_fee_value?: number
          customer_id: string
          effective_from?: string
          effective_until?: string | null
          expiry_warning_days?: number
          id?: string
          labor_discount_percent?: number
          labor_rate?: number | null
          minimum_parts_margin_percent?: number
          name: string
          notes?: string | null
          operation_key: string
          parts_discount_percent?: number
          parts_markup_matrix?: Json
          retired_at?: string | null
          retired_by?: string | null
          retired_reason?: string | null
          shop_id: string
          source_type: string
          status?: string
          supersedes_agreement_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_reason?: string
          approved_by?: string
          created_at?: string
          created_by?: string
          currency?: string
          customer_fee_cap?: number | null
          customer_fee_type?: string
          customer_fee_value?: number
          customer_id?: string
          effective_from?: string
          effective_until?: string | null
          expiry_warning_days?: number
          id?: string
          labor_discount_percent?: number
          labor_rate?: number | null
          minimum_parts_margin_percent?: number
          name?: string
          notes?: string | null
          operation_key?: string
          parts_discount_percent?: number
          parts_markup_matrix?: Json
          retired_at?: string | null
          retired_by?: string | null
          retired_reason?: string | null
          shop_id?: string
          source_type?: string
          status?: string
          supersedes_agreement_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_pricing_agreements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_pricing_agreements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_pricing_agreements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_pricing_agreements_supersedes_agreement_id_fkey"
            columns: ["supersedes_agreement_id"]
            isOneToOne: false
            referencedRelation: "customer_pricing_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_quotes: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          estimated_total: number | null
          id: string
          preferred_date: string | null
          selected_services: Json | null
          shop_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
        }
        Insert: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          estimated_total?: number | null
          id?: string
          preferred_date?: string | null
          selected_services?: Json | null
          shop_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          estimated_total?: number | null
          id?: string
          preferred_date?: string | null
          selected_services?: Json | null
          shop_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Relationships: []
      }
      customer_settings: {
        Row: {
          account_hold_reason: string | null
          account_status: string
          billing_notes: string | null
          comm_email_enabled: boolean
          comm_sms_enabled: boolean
          customer_id: string
          customer_reference: string | null
          language: string | null
          marketing_opt_in: boolean
          payment_terms: string
          payment_terms_days: number
          po_required: boolean
          preferred_contact: string | null
          primary_approval_contact_id: string | null
          primary_billing_contact_id: string | null
          shop_id: string | null
          tax_exempt: boolean
          tax_exemption_reference: string | null
          timezone: string | null
          units: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_hold_reason?: string | null
          account_status?: string
          billing_notes?: string | null
          comm_email_enabled?: boolean
          comm_sms_enabled?: boolean
          customer_id: string
          customer_reference?: string | null
          language?: string | null
          marketing_opt_in?: boolean
          payment_terms?: string
          payment_terms_days?: number
          po_required?: boolean
          preferred_contact?: string | null
          primary_approval_contact_id?: string | null
          primary_billing_contact_id?: string | null
          shop_id?: string | null
          tax_exempt?: boolean
          tax_exemption_reference?: string | null
          timezone?: string | null
          units?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_hold_reason?: string | null
          account_status?: string
          billing_notes?: string | null
          comm_email_enabled?: boolean
          comm_sms_enabled?: boolean
          customer_id?: string
          customer_reference?: string | null
          language?: string | null
          marketing_opt_in?: boolean
          payment_terms?: string
          payment_terms_days?: number
          po_required?: boolean
          preferred_contact?: string | null
          primary_approval_contact_id?: string | null
          primary_billing_contact_id?: string | null
          shop_id?: string | null
          tax_exempt?: boolean
          tax_exemption_reference?: string | null
          timezone?: string | null
          units?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_settings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_settings_primary_approval_contact_id_fkey"
            columns: ["primary_approval_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_settings_primary_billing_contact_id_fkey"
            columns: ["primary_billing_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_type: string
          active: boolean
          address: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          business_name: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          customer_since: string | null
          default_bill_to_customer_id: string | null
          email: string | null
          external_id: string | null
          first_name: string | null
          id: string
          identity_email: string | null
          identity_name: string | null
          identity_phone: string | null
          import_confidence: number | null
          import_notes: string | null
          is_fleet: boolean
          last_name: string | null
          merge_reason: string | null
          merged_at: string | null
          merged_by: string | null
          merged_into_customer_id: string | null
          name: string | null
          notes: string | null
          parent_customer_id: string | null
          phone: string | null
          phone_number: string | null
          postal_code: string | null
          province: string | null
          shop_id: string | null
          source_intake_id: string | null
          source_row_id: string | null
          street: string | null
          updated_at: string
          user_id: string | null
          vehicle: string | null
        }
        Insert: {
          account_type?: string
          active?: boolean
          address?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_since?: string | null
          default_bill_to_customer_id?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          identity_email?: string | null
          identity_name?: string | null
          identity_phone?: string | null
          import_confidence?: number | null
          import_notes?: string | null
          is_fleet?: boolean
          last_name?: string | null
          merge_reason?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_customer_id?: string | null
          name?: string | null
          notes?: string | null
          parent_customer_id?: string | null
          phone?: string | null
          phone_number?: string | null
          postal_code?: string | null
          province?: string | null
          shop_id?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
        }
        Update: {
          account_type?: string
          active?: boolean
          address?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_since?: string | null
          default_bill_to_customer_id?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          identity_email?: string | null
          identity_name?: string | null
          identity_phone?: string | null
          import_confidence?: number | null
          import_notes?: string | null
          is_fleet?: boolean
          last_name?: string | null
          merge_reason?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_customer_id?: string | null
          name?: string | null
          notes?: string | null
          parent_customer_id?: string | null
          phone?: string | null
          phone_number?: string | null
          postal_code?: string | null
          province?: string | null
          shop_id?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_default_bill_to_customer_id_fkey"
            columns: ["default_bill_to_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_merged_into_customer_id_fkey"
            columns: ["merged_into_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_parent_customer_id_fkey"
            columns: ["parent_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_layouts: {
        Row: {
          created_at: string
          id: string
          layout: Json
          shop_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          layout?: Json
          shop_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          layout?: Json
          shop_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_layouts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_user_layouts: {
        Row: {
          created_at: string
          id: string
          layout: Json
          scope: string
          shop_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          layout?: Json
          scope?: string
          shop_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          layout?: Json
          scope?: string
          shop_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_user_layouts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_user_layouts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      decoded_vins: {
        Row: {
          created_at: string | null
          decoded: Json | null
          id: string
          user_id: string | null
          vin: string
        }
        Insert: {
          created_at?: string | null
          decoded?: Json | null
          id?: string
          user_id?: string | null
          vin: string
        }
        Update: {
          created_at?: string | null
          decoded?: Json | null
          id?: string
          user_id?: string | null
          vin?: string
        }
        Relationships: []
      }
      defective_parts: {
        Row: {
          id: string
          part_id: string | null
          quantity: number
          reason: string | null
          reported_at: string | null
          reported_by: string | null
          shop_id: string | null
        }
        Insert: {
          id?: string
          part_id?: string | null
          quantity?: number
          reason?: string | null
          reported_at?: string | null
          reported_by?: string | null
          shop_id?: string | null
        }
        Update: {
          id?: string
          part_id?: string | null
          quantity?: number
          reason?: string | null
          reported_at?: string | null
          reported_by?: string | null
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defective_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "defective_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_shop_boost_leads: {
        Row: {
          created_at: string
          demo_id: string
          email: string
          emails_sent: number
          engagement_score: number | null
          id: string
          last_viewed_at: string | null
          lead_kind: string
          share_count: number
          summary: string | null
        }
        Insert: {
          created_at?: string
          demo_id: string
          email: string
          emails_sent?: number
          engagement_score?: number | null
          id?: string
          last_viewed_at?: string | null
          lead_kind?: string
          share_count?: number
          summary?: string | null
        }
        Update: {
          created_at?: string
          demo_id?: string
          email?: string
          emails_sent?: number
          engagement_score?: number | null
          id?: string
          last_viewed_at?: string | null
          lead_kind?: string
          share_count?: number
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_shop_boost_leads_demo_id_fkey"
            columns: ["demo_id"]
            isOneToOne: false
            referencedRelation: "demo_shop_boosts"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_shop_boosts: {
        Row: {
          country: string
          created_at: string
          has_unlocked: boolean
          id: string
          intake_id: string | null
          shop_id: string | null
          shop_name: string
          snapshot: Json
        }
        Insert: {
          country?: string
          created_at?: string
          has_unlocked?: boolean
          id?: string
          intake_id?: string | null
          shop_id?: string | null
          shop_name: string
          snapshot?: Json
        }
        Update: {
          country?: string
          created_at?: string
          has_unlocked?: boolean
          id?: string
          intake_id?: string | null
          shop_id?: string | null
          shop_name?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "demo_shop_boosts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_shop_boosts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      dtc_logs: {
        Row: {
          created_at: string | null
          description: string | null
          dtc_code: string | null
          id: string
          severity: string | null
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          dtc_code?: string | null
          id?: string
          severity?: string | null
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          dtc_code?: string | null
          id?: string
          severity?: string | null
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dtc_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          created_at: string
          email_log_id: string | null
          event_at: string
          event_type: string
          id: string
          payload: Json
          provider: string
          provider_event_id: string
          provider_message_id: string | null
        }
        Insert: {
          created_at?: string
          email_log_id?: string | null
          event_at: string
          event_type: string
          id?: string
          payload?: Json
          provider?: string
          provider_event_id: string
          provider_message_id?: string | null
        }
        Update: {
          created_at?: string
          email_log_id?: string | null
          event_at?: string
          event_type?: string
          id?: string
          payload?: Json
          provider?: string
          provider_event_id?: string
          provider_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_events_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: false
            referencedRelation: "email_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string
          created_by: string | null
          delivered_at: string | null
          error_text: string | null
          id: string
          last_event_at: string | null
          last_event_type: string | null
          metadata: Json
          provider: string
          provider_message_id: string | null
          sent_at: string | null
          shop_id: string
          status: string
          subject: string | null
          template_id: string | null
          template_key: string
          to_email: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          error_text?: string | null
          id?: string
          last_event_at?: string | null
          last_event_type?: string | null
          metadata?: Json
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          shop_id: string
          status?: string
          subject?: string | null
          template_id?: string | null
          template_key: string
          to_email: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          error_text?: string | null
          id?: string
          last_event_at?: string | null
          last_event_type?: string | null
          metadata?: Json
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          shop_id?: string
          status?: string
          subject?: string | null
          template_id?: string | null
          template_key?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          email: string
          reason: string | null
          suppressed: boolean | null
          updated_at: string | null
        }
        Insert: {
          email: string
          reason?: string | null
          suppressed?: boolean | null
          updated_at?: string | null
        }
        Update: {
          email?: string
          reason?: string | null
          suppressed?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          bucket_id: string
          content_type: string | null
          doc_type: string
          expires_at: string | null
          file_path: string
          file_size_bytes: number | null
          id: string
          original_filename: string | null
          shop_id: string
          status: string
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          bucket_id?: string
          content_type?: string | null
          doc_type: string
          expires_at?: string | null
          file_path: string
          file_size_bytes?: number | null
          id?: string
          original_filename?: string | null
          shop_id: string
          status?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          bucket_id?: string
          content_type?: string | null
          doc_type?: string
          expires_at?: string | null
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          original_filename?: string | null
          shop_id?: string
          status?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_events: {
        Row: {
          actor_profile_id: string | null
          changed_quote_line_ids: string[]
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          note: string | null
          reason_code: string | null
          result: Json
          revision: number
          shop_id: string
          snapshot: Json
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          changed_quote_line_ids?: string[]
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          note?: string | null
          reason_code?: string | null
          result?: Json
          revision: number
          shop_id: string
          snapshot?: Json
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          changed_quote_line_ids?: string[]
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          note?: string | null
          reason_code?: string | null
          result?: Json
          revision?: number
          shop_id?: string
          snapshot?: Json
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_internal_details: {
        Row: {
          created_at: string
          line_notes: Json
          notes: string | null
          shop_id: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          line_notes?: Json
          notes?: string | null
          shop_id: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          line_notes?: Json
          notes?: string | null
          shop_id?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_internal_details_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_internal_details_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_internal_details_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_internal_details_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_internal_details_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_internal_details_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "estimate_internal_details_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          invoice_ref: string | null
          metadata: Json
          shop_id: string
          tax_amount: number
          updated_at: string
          vendor_name: string | null
          work_order_id: string | null
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          invoice_ref?: string | null
          metadata?: Json
          shop_id: string
          tax_amount?: number
          updated_at?: string
          vendor_name?: string | null
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          invoice_ref?: string | null
          metadata?: Json
          shop_id?: string
          tax_amount?: number
          updated_at?: string
          vendor_name?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "expenses_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "expenses_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "expenses_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "expenses_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_reads: {
        Row: {
          feature_slug: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          feature_slug: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          feature_slug?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      field_service_vehicle_assignments: {
        Row: {
          assigned_by_profile_id: string | null
          created_at: string
          profile_id: string
          service_vehicle_id: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          assigned_by_profile_id?: string | null
          created_at?: string
          profile_id: string
          service_vehicle_id: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          assigned_by_profile_id?: string | null
          created_at?: string
          profile_id?: string
          service_vehicle_id?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_service_vehicle_assignments_assigned_by_profile_id_fkey"
            columns: ["assigned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_service_vehicle_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_service_vehicle_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_service_vehicle_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_service_vehicle_assignments_vehicle_shop_fk"
            columns: ["shop_id", "service_vehicle_id"]
            isOneToOne: true
            referencedRelation: "service_vehicles"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      field_truck_records: {
        Row: {
          amount: number | null
          content_type: string | null
          created_at: string
          created_by_profile_id: string | null
          currency: string | null
          due_odometer: number | null
          due_on: string | null
          ends_at: string | null
          file_bucket: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          notes: string | null
          occurred_on: string | null
          odometer: number | null
          odometer_unit: string | null
          operation_key: string
          original_filename: string | null
          record_type: string
          service_vehicle_id: string
          shop_id: string
          starts_at: string | null
          status: string
          title: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number | null
          content_type?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          currency?: string | null
          due_odometer?: number | null
          due_on?: string | null
          ends_at?: string | null
          file_bucket?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          occurred_on?: string | null
          odometer?: number | null
          odometer_unit?: string | null
          operation_key: string
          original_filename?: string | null
          record_type: string
          service_vehicle_id: string
          shop_id: string
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number | null
          content_type?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          currency?: string | null
          due_odometer?: number | null
          due_on?: string | null
          ends_at?: string | null
          file_bucket?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          occurred_on?: string | null
          odometer?: number | null
          odometer_unit?: string | null
          operation_key?: string
          original_filename?: string | null
          record_type?: string
          service_vehicle_id?: string
          shop_id?: string
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_truck_records_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_truck_records_service_vehicle_id_fkey"
            columns: ["service_vehicle_id"]
            isOneToOne: false
            referencedRelation: "service_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_truck_records_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_truck_records_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_truck_records_vehicle_shop_fk"
            columns: ["shop_id", "service_vehicle_id"]
            isOneToOne: false
            referencedRelation: "service_vehicles"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      financial_domain_outbox: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          dedupe_key: string
          delivered_at: string | null
          event_type: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          occurred_at: string
          payload: Json
          processing_at: string | null
          shop_id: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          dedupe_key: string
          delivered_at?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          occurred_at?: string
          payload?: Json
          processing_at?: string | null
          shop_id: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          dedupe_key?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          occurred_at?: string
          payload?: Json
          processing_at?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_domain_outbox_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_domain_outbox_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_defect_clarifications: {
        Row: {
          closed_at: string | null
          created_at: string
          defect_id: string
          fleet_id: string
          id: string
          prompt: string
          requested_at: string
          requested_by: string
          responded_at: string | null
          responded_by: string | null
          response_text: string | null
          response_type: string
          shop_id: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          defect_id: string
          fleet_id: string
          id?: string
          prompt: string
          requested_at?: string
          requested_by: string
          responded_at?: string | null
          responded_by?: string | null
          response_text?: string | null
          response_type: string
          shop_id: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          defect_id?: string
          fleet_id?: string
          id?: string
          prompt?: string
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          responded_by?: string | null
          response_text?: string | null
          response_type?: string
          shop_id?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_defect_clarifications_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "fleet_unit_defects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_defect_clarifications_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_defect_clarifications_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_defect_clarifications_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_defect_clarifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_defect_clarifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_defect_clarifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_dispatch_assignments: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          created_at: string
          driver_name: string | null
          driver_profile_id: string
          fleet_id: string
          id: string
          next_pretrip_due: string | null
          pretrip_due_local_time: string
          pretrip_required: boolean
          route_label: string | null
          shop_id: string
          state: string
          unit_label: string | null
          updated_at: string
          vehicle_id: string
          vehicle_identifier: string | null
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          driver_name?: string | null
          driver_profile_id: string
          fleet_id: string
          id?: string
          next_pretrip_due?: string | null
          pretrip_due_local_time?: string
          pretrip_required?: boolean
          route_label?: string | null
          shop_id: string
          state?: string
          unit_label?: string | null
          updated_at?: string
          vehicle_id: string
          vehicle_identifier?: string | null
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          driver_name?: string | null
          driver_profile_id?: string
          fleet_id?: string
          id?: string
          next_pretrip_due?: string | null
          pretrip_due_local_time?: string
          pretrip_required?: boolean
          route_label?: string | null
          shop_id?: string
          state?: string
          unit_label?: string | null
          updated_at?: string
          vehicle_id?: string
          vehicle_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_dispatch_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_fleet_fk"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_dispatch_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_driver_evidence: {
        Row: {
          clarification_id: string | null
          created_at: string
          defect_id: string | null
          fleet_id: string
          id: string
          item_id: string | null
          media_type: string
          mime_type: string
          pretrip_report_id: string
          shop_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
          vehicle_id: string
        }
        Insert: {
          clarification_id?: string | null
          created_at?: string
          defect_id?: string | null
          fleet_id: string
          id?: string
          item_id?: string | null
          media_type: string
          mime_type: string
          pretrip_report_id: string
          shop_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
          vehicle_id: string
        }
        Update: {
          clarification_id?: string | null
          created_at?: string
          defect_id?: string | null
          fleet_id?: string
          id?: string
          item_id?: string | null
          media_type?: string
          mime_type?: string
          pretrip_report_id?: string
          shop_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_driver_evidence_clarification_id_fkey"
            columns: ["clarification_id"]
            isOneToOne: false
            referencedRelation: "fleet_defect_clarifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_evidence_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "fleet_unit_defects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_evidence_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_evidence_pretrip_report_id_fkey"
            columns: ["pretrip_report_id"]
            isOneToOne: false
            referencedRelation: "fleet_pretrip_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_evidence_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_evidence_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_evidence_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_inspection_schedules: {
        Row: {
          created_at: string
          fleet_id: string
          id: string
          interval_days: number
          last_inspection_date: string | null
          next_inspection_date: string | null
          notes: string | null
          shop_id: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          fleet_id: string
          id?: string
          interval_days?: number
          last_inspection_date?: string | null
          next_inspection_date?: string | null
          notes?: string | null
          shop_id: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          fleet_id?: string
          id?: string
          interval_days?: number
          last_inspection_date?: string | null
          next_inspection_date?: string | null
          notes?: string | null
          shop_id?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_inspection_schedules_fleet_fk"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_inspection_schedules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_inspection_schedules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_inspection_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_members: {
        Row: {
          created_at: string
          created_by: string | null
          fleet_id: string
          role: string
          shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fleet_id: string
          role?: string
          shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fleet_id?: string
          role?: string
          shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_members_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_members_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_pm_due_events: {
        Row: {
          completed_at: string | null
          created_at: string
          deferred_until: string | null
          due_reasons: string[]
          due_snapshot: Json
          evidence_snapshot_id: string | null
          first_due_at: string
          fleet_id: string
          id: string
          last_evaluated_at: string
          policy_id: string
          program_id: string
          service_request_id: string | null
          shop_id: string
          status: string
          triggering_reading_id: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deferred_until?: string | null
          due_reasons?: string[]
          due_snapshot?: Json
          evidence_snapshot_id?: string | null
          first_due_at?: string
          fleet_id: string
          id?: string
          last_evaluated_at?: string
          policy_id: string
          program_id: string
          service_request_id?: string | null
          shop_id: string
          status?: string
          triggering_reading_id?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deferred_until?: string | null
          due_reasons?: string[]
          due_snapshot?: Json
          evidence_snapshot_id?: string | null
          first_due_at?: string
          fleet_id?: string
          id?: string
          last_evaluated_at?: string
          policy_id?: string
          program_id?: string
          service_request_id?: string | null
          shop_id?: string
          status?: string
          triggering_reading_id?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_pm_due_events_evidence_snapshot_id_fkey"
            columns: ["evidence_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ai_evidence_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "fleet_pm_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fleet_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_triggering_reading_id_fkey"
            columns: ["triggering_reading_id"]
            isOneToOne: false
            referencedRelation: "fleet_unit_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_due_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_pm_policies: {
        Row: {
          active: boolean
          anchor_date: string
          anchor_engine_hours: number | null
          anchor_odometer_km: number | null
          created_at: string
          created_by: string
          fleet_id: string
          id: string
          interval_days: number | null
          interval_hours: number | null
          interval_km: number | null
          last_completed_at: string | null
          last_completed_work_order_id: string | null
          name: string
          program_id: string
          requires_fleet_approval: boolean
          shop_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          anchor_date?: string
          anchor_engine_hours?: number | null
          anchor_odometer_km?: number | null
          created_at?: string
          created_by?: string
          fleet_id: string
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          last_completed_at?: string | null
          last_completed_work_order_id?: string | null
          name: string
          program_id: string
          requires_fleet_approval?: boolean
          shop_id: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          anchor_date?: string
          anchor_engine_hours?: number | null
          anchor_odometer_km?: number | null
          created_at?: string
          created_by?: string
          fleet_id?: string
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          last_completed_at?: string | null
          last_completed_work_order_id?: string | null
          name?: string
          program_id?: string
          requires_fleet_approval?: boolean
          shop_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_pm_policies_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_last_completed_work_order_id_fkey"
            columns: ["last_completed_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_last_completed_work_order_id_fkey"
            columns: ["last_completed_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_last_completed_work_order_id_fkey"
            columns: ["last_completed_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_last_completed_work_order_id_fkey"
            columns: ["last_completed_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_last_completed_work_order_id_fkey"
            columns: ["last_completed_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fleet_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pm_policies_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_portal_invites: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          fleet_id: string
          id: string
          revoked_at: string | null
          role: string
          shop_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          fleet_id: string
          id?: string
          revoked_at?: string | null
          role?: string
          shop_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          fleet_id?: string
          id?: string
          revoked_at?: string | null
          role?: string
          shop_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_portal_invites_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_portal_invites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_portal_invites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_pretrip_compliance: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          driver_profile_id: string
          due_at: string
          excuse_reason: string | null
          excused_at: string | null
          excused_by: string | null
          fleet_id: string
          id: string
          notification_fingerprint: string | null
          pretrip_report_id: string | null
          service_date: string
          shop_id: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          driver_profile_id: string
          due_at: string
          excuse_reason?: string | null
          excused_at?: string | null
          excused_by?: string | null
          fleet_id: string
          id?: string
          notification_fingerprint?: string | null
          pretrip_report_id?: string | null
          service_date: string
          shop_id: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          driver_profile_id?: string
          due_at?: string
          excuse_reason?: string | null
          excused_at?: string | null
          excused_by?: string | null
          fleet_id?: string
          id?: string
          notification_fingerprint?: string | null
          pretrip_report_id?: string | null
          service_date?: string
          shop_id?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_pretrip_compliance_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "fleet_dispatch_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_compliance_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_compliance_excused_by_fkey"
            columns: ["excused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_compliance_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_compliance_pretrip_report_id_fkey"
            columns: ["pretrip_report_id"]
            isOneToOne: false
            referencedRelation: "fleet_pretrip_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_compliance_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_compliance_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_compliance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_pretrip_reports: {
        Row: {
          checklist: Json
          created_at: string
          driver_name: string
          driver_profile_id: string | null
          fleet_id: string
          has_defects: boolean
          id: string
          inspection_date: string
          notes: string | null
          odometer_km: number | null
          shop_id: string
          source: string
          status: string
          template_assignment_id: string | null
          template_snapshot: Json | null
          template_version: number | null
          trailer_vehicle_id: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          checklist: Json
          created_at?: string
          driver_name: string
          driver_profile_id?: string | null
          fleet_id: string
          has_defects?: boolean
          id?: string
          inspection_date?: string
          notes?: string | null
          odometer_km?: number | null
          shop_id: string
          source?: string
          status?: string
          template_assignment_id?: string | null
          template_snapshot?: Json | null
          template_version?: number | null
          trailer_vehicle_id?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          driver_name?: string
          driver_profile_id?: string | null
          fleet_id?: string
          has_defects?: boolean
          id?: string
          inspection_date?: string
          notes?: string | null
          odometer_km?: number | null
          shop_id?: string
          source?: string
          status?: string
          template_assignment_id?: string | null
          template_snapshot?: Json | null
          template_version?: number | null
          trailer_vehicle_id?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_pretrip_reports_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_reports_fleet_fk"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_reports_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_reports_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_reports_template_assignment_id_fkey"
            columns: ["template_assignment_id"]
            isOneToOne: false
            referencedRelation: "fleet_pretrip_template_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_reports_trailer_vehicle_id_fkey"
            columns: ["trailer_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_reports_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_pretrip_template_assignments: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          failure_config: Json
          fleet_id: string
          id: string
          inspection_template_id: string
          operation_key: string
          retired_at: string | null
          shop_id: string
          vehicle_type: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string
          failure_config?: Json
          fleet_id: string
          id?: string
          inspection_template_id: string
          operation_key: string
          retired_at?: string | null
          shop_id: string
          vehicle_type: string
          version: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          failure_config?: Json
          fleet_id?: string
          id?: string
          inspection_template_id?: string
          operation_key?: string
          retired_at?: string | null
          shop_id?: string
          vehicle_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fleet_pretrip_template_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_template_assignments_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_template_assignments_inspection_template_id_fkey"
            columns: ["inspection_template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_template_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_pretrip_template_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_program_assignments: {
        Row: {
          created_at: string
          created_by: string
          fleet_id: string
          id: string
          program_id: string
          shop_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          fleet_id: string
          id?: string
          program_id: string
          shop_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          fleet_id?: string
          id?: string
          program_id?: string
          shop_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_program_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_program_assignments_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fleet_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_program_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_program_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_program_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_program_tasks: {
        Row: {
          created_at: string
          default_labor_hours: number | null
          description: string
          display_order: number
          id: string
          job_type: string
          program_id: string
          section_key: string | null
        }
        Insert: {
          created_at?: string
          default_labor_hours?: number | null
          description: string
          display_order?: number
          id?: string
          job_type?: string
          program_id: string
          section_key?: string | null
        }
        Update: {
          created_at?: string
          default_labor_hours?: number | null
          description?: string
          display_order?: number
          id?: string
          job_type?: string
          program_id?: string
          section_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_program_tasks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fleet_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_programs: {
        Row: {
          active: boolean
          assignment_mode: string
          base_template_slug: string | null
          cadence: Database["public"]["Enums"]["fleet_program_cadence"]
          created_at: string
          fleet_id: string
          id: string
          include_custom_inspection: boolean
          interval_days: number | null
          interval_hours: number | null
          interval_km: number | null
          name: string
          notes: string | null
          operation_key: string | null
          requires_fleet_approval: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          assignment_mode?: string
          base_template_slug?: string | null
          cadence: Database["public"]["Enums"]["fleet_program_cadence"]
          created_at?: string
          fleet_id: string
          id?: string
          include_custom_inspection?: boolean
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          name: string
          notes?: string | null
          operation_key?: string | null
          requires_fleet_approval?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          assignment_mode?: string
          base_template_slug?: string | null
          cadence?: Database["public"]["Enums"]["fleet_program_cadence"]
          created_at?: string
          fleet_id?: string
          id?: string
          include_custom_inspection?: boolean
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          name?: string
          notes?: string | null
          operation_key?: string | null
          requires_fleet_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_programs_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_request_lines: {
        Row: {
          created_at: string
          created_by: string
          description: string
          fleet_id: string
          id: string
          line_kind: string
          notes: string | null
          price_status: string
          quantity: number
          requested_labor_hours: number | null
          service_request_id: string
          shop_id: string
          source_fleet_program_id: string | null
          source_inspection_template_id: string | null
          source_menu_item_id: string | null
          source_snapshot: Json
          unit_price_snapshot: number | null
          updated_at: string
          vehicle_id: string
          work_order_line_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          description: string
          fleet_id: string
          id?: string
          line_kind: string
          notes?: string | null
          price_status?: string
          quantity?: number
          requested_labor_hours?: number | null
          service_request_id: string
          shop_id: string
          source_fleet_program_id?: string | null
          source_inspection_template_id?: string | null
          source_menu_item_id?: string | null
          source_snapshot?: Json
          unit_price_snapshot?: number | null
          updated_at?: string
          vehicle_id: string
          work_order_line_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          fleet_id?: string
          id?: string
          line_kind?: string
          notes?: string | null
          price_status?: string
          quantity?: number
          requested_labor_hours?: number | null
          service_request_id?: string
          shop_id?: string
          source_fleet_program_id?: string | null
          source_inspection_template_id?: string | null
          source_menu_item_id?: string | null
          source_snapshot?: Json
          unit_price_snapshot?: number | null
          updated_at?: string
          vehicle_id?: string
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_request_lines_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_source_fleet_program_id_fkey"
            columns: ["source_fleet_program_id"]
            isOneToOne: false
            referencedRelation: "fleet_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_source_inspection_template_id_fkey"
            columns: ["source_inspection_template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_source_menu_item_id_fkey"
            columns: ["source_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_request_lines_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_requests: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          fleet_id: string
          id: string
          operation_key: string | null
          request_fingerprint: string | null
          requested_for_date: string | null
          scheduled_for_date: string | null
          severity: string
          shop_id: string
          source_pm_due_event_id: string | null
          source_pretrip_id: string | null
          status: string
          submitted_at: string | null
          summary: string
          title: string
          updated_at: string
          vehicle_id: string
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          fleet_id: string
          id?: string
          operation_key?: string | null
          request_fingerprint?: string | null
          requested_for_date?: string | null
          scheduled_for_date?: string | null
          severity: string
          shop_id: string
          source_pm_due_event_id?: string | null
          source_pretrip_id?: string | null
          status?: string
          submitted_at?: string | null
          summary: string
          title: string
          updated_at?: string
          vehicle_id: string
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          fleet_id?: string
          id?: string
          operation_key?: string | null
          request_fingerprint?: string | null
          requested_for_date?: string | null
          scheduled_for_date?: string | null
          severity?: string
          shop_id?: string
          source_pm_due_event_id?: string | null
          source_pretrip_id?: string | null
          status?: string
          submitted_at?: string | null
          summary?: string
          title?: string
          updated_at?: string
          vehicle_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_requests_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_fleet_fk"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_source_pm_due_event_id_fkey"
            columns: ["source_pm_due_event_id"]
            isOneToOne: false
            referencedRelation: "fleet_pm_due_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_source_pretrip_id_fkey"
            columns: ["source_pretrip_id"]
            isOneToOne: false
            referencedRelation: "fleet_pretrip_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_vehicle_fk"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_service_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_service_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_service_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_service_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_service_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_unit_defects: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          defect_key: string
          deferred_reason: string | null
          deferred_until: string | null
          description: string | null
          fleet_id: string
          id: string
          intake_required: boolean
          label: string
          marks_vehicle_attention: boolean
          notify_dispatcher: boolean
          reported_at: string
          reported_by: string | null
          resolution_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          service_request_id: string | null
          severity: string
          shop_id: string
          source_pretrip_id: string
          state: string
          updated_at: string
          vehicle_id: string
          work_order_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          defect_key: string
          deferred_reason?: string | null
          deferred_until?: string | null
          description?: string | null
          fleet_id: string
          id?: string
          intake_required?: boolean
          label: string
          marks_vehicle_attention?: boolean
          notify_dispatcher?: boolean
          reported_at?: string
          reported_by?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          service_request_id?: string | null
          severity: string
          shop_id: string
          source_pretrip_id: string
          state?: string
          updated_at?: string
          vehicle_id: string
          work_order_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          defect_key?: string
          deferred_reason?: string | null
          deferred_until?: string | null
          description?: string | null
          fleet_id?: string
          id?: string
          intake_required?: boolean
          label?: string
          marks_vehicle_attention?: boolean
          notify_dispatcher?: boolean
          reported_at?: string
          reported_by?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          service_request_id?: string | null
          severity?: string
          shop_id?: string
          source_pretrip_id?: string
          state?: string
          updated_at?: string
          vehicle_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_unit_defects_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_source_pretrip_id_fkey"
            columns: ["source_pretrip_id"]
            isOneToOne: false
            referencedRelation: "fleet_pretrip_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "fleet_unit_defects_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_unit_readings: {
        Row: {
          confidence: number
          created_at: string
          engine_hours: number | null
          fleet_id: string
          id: string
          metadata: Json
          odometer_km: number | null
          operation_key: string | null
          recorded_at: string
          recorded_by: string | null
          shop_id: string
          source_id: string | null
          source_type: string
          vehicle_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          engine_hours?: number | null
          fleet_id: string
          id?: string
          metadata?: Json
          odometer_km?: number | null
          operation_key?: string | null
          recorded_at?: string
          recorded_by?: string | null
          shop_id: string
          source_id?: string | null
          source_type: string
          vehicle_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          engine_hours?: number | null
          fleet_id?: string
          id?: string
          metadata?: Json
          odometer_km?: number | null
          operation_key?: string | null
          recorded_at?: string
          recorded_by?: string | null
          shop_id?: string
          source_id?: string | null
          source_type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_unit_readings_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_readings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_readings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_unit_readings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          active: boolean
          created_at: string
          custom_interval_days: number | null
          custom_interval_hours: number | null
          custom_interval_km: number | null
          fleet_id: string
          nickname: string | null
          shop_id: string | null
          vehicle_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          custom_interval_days?: number | null
          custom_interval_hours?: number | null
          custom_interval_km?: number | null
          fleet_id: string
          nickname?: string | null
          shop_id?: string | null
          vehicle_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          custom_interval_days?: number | null
          custom_interval_hours?: number | null
          custom_interval_km?: number | null
          fleet_id?: string
          nickname?: string | null
          shop_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleets: {
        Row: {
          active: boolean
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          name: string
          notes: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          name: string
          notes?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          name?: string
          notes?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          created_at: string | null
          customer_id: string | null
          feature: string | null
          id: string
          send_at: string | null
          sent: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          feature?: string | null
          id?: string
          send_at?: string | null
          sent?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          feature?: string | null
          id?: string
          send_at?: string | null
          sent?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      guided_onboarding_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          session_id: string
          shop_id: string
          step_key: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          session_id: string
          shop_id: string
          step_key?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          session_id?: string
          shop_id?: string
          step_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guided_onboarding_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "guided_onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guided_onboarding_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guided_onboarding_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      guided_onboarding_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_step_key: string | null
          id: string
          shop_id: string
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step_key?: string | null
          id?: string
          shop_id: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step_key?: string | null
          id?: string
          shop_id?: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guided_onboarding_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guided_onboarding_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      guided_onboarding_steps: {
        Row: {
          answer: Json
          completed_at: string | null
          created_at: string
          cta_label: string | null
          description: string | null
          destination_path: string
          error: string | null
          highlight_key: string
          id: string
          question: string
          retry_count: number
          session_id: string
          shop_id: string
          skip_label: string | null
          skipped_at: string | null
          skipped_reason: string | null
          sort_order: number | null
          started_at: string | null
          status: string
          step_key: string
          summary: Json
          title: string
          updated_at: string
        }
        Insert: {
          answer?: Json
          completed_at?: string | null
          created_at?: string
          cta_label?: string | null
          description?: string | null
          destination_path: string
          error?: string | null
          highlight_key: string
          id?: string
          question: string
          retry_count?: number
          session_id: string
          shop_id: string
          skip_label?: string | null
          skipped_at?: string | null
          skipped_reason?: string | null
          sort_order?: number | null
          started_at?: string | null
          status?: string
          step_key: string
          summary?: Json
          title: string
          updated_at?: string
        }
        Update: {
          answer?: Json
          completed_at?: string | null
          created_at?: string
          cta_label?: string | null
          description?: string | null
          destination_path?: string
          error?: string | null
          highlight_key?: string
          id?: string
          question?: string
          retry_count?: number
          session_id?: string
          shop_id?: string
          skip_label?: string | null
          skipped_at?: string | null
          skipped_reason?: string | null
          sort_order?: number | null
          started_at?: string | null
          status?: string
          step_key?: string
          summary?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guided_onboarding_steps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "guided_onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guided_onboarding_steps_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guided_onboarding_steps_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      history: {
        Row: {
          advisor_name: string | null
          approval_state: string | null
          assigned_tech_name: string | null
          cause: string | null
          closed_at: string | null
          correction: string | null
          created_at: string | null
          customer_id: string
          description: string | null
          discount: number | null
          historical_status: string | null
          id: string
          imported_from_session_id: string | null
          invoice_number: string | null
          labor_hours: number | null
          labor_sale: number | null
          notes: string | null
          odometer: number | null
          opened_at: string | null
          parts_sale: number | null
          payment_state: string | null
          priority: string | null
          service_date: string
          shop_supplies: number | null
          source_external_id: string | null
          source_payload: Json
          source_row_id: string | null
          source_system: string | null
          sublet_sale: number | null
          symptom: string | null
          tags: string[] | null
          tax: number | null
          total: number | null
          vehicle_id: string | null
          work_order_id: string | null
          work_order_number: string | null
        }
        Insert: {
          advisor_name?: string | null
          approval_state?: string | null
          assigned_tech_name?: string | null
          cause?: string | null
          closed_at?: string | null
          correction?: string | null
          created_at?: string | null
          customer_id: string
          description?: string | null
          discount?: number | null
          historical_status?: string | null
          id?: string
          imported_from_session_id?: string | null
          invoice_number?: string | null
          labor_hours?: number | null
          labor_sale?: number | null
          notes?: string | null
          odometer?: number | null
          opened_at?: string | null
          parts_sale?: number | null
          payment_state?: string | null
          priority?: string | null
          service_date?: string
          shop_supplies?: number | null
          source_external_id?: string | null
          source_payload?: Json
          source_row_id?: string | null
          source_system?: string | null
          sublet_sale?: number | null
          symptom?: string | null
          tags?: string[] | null
          tax?: number | null
          total?: number | null
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_number?: string | null
        }
        Update: {
          advisor_name?: string | null
          approval_state?: string | null
          assigned_tech_name?: string | null
          cause?: string | null
          closed_at?: string | null
          correction?: string | null
          created_at?: string | null
          customer_id?: string
          description?: string | null
          discount?: number | null
          historical_status?: string | null
          id?: string
          imported_from_session_id?: string | null
          invoice_number?: string | null
          labor_hours?: number | null
          labor_sale?: number | null
          notes?: string | null
          odometer?: number | null
          opened_at?: string | null
          parts_sale?: number | null
          payment_state?: string | null
          priority?: string | null
          service_date?: string
          shop_supplies?: number | null
          source_external_id?: string | null
          source_payload?: Json
          source_row_id?: string | null
          source_system?: string | null
          sublet_sale?: number | null
          symptom?: string | null
          tags?: string[] | null
          tax?: number | null
          total?: number | null
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job_rows: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          raw_row: Json
          row_number: number
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          raw_row: Json
          row_number: number
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          raw_row?: Json
          row_number?: number
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          approved_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_count: number
          id: string
          import_type: string
          imported_count: number
          processed_rows: number
          result_record_id: string | null
          shop_id: string
          skipped_count: number
          source_storage_path: string | null
          status: string
          summary: Json
          total_rows: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          id?: string
          import_type: string
          imported_count?: number
          processed_rows?: number
          result_record_id?: string | null
          shop_id: string
          skipped_count?: number
          source_storage_path?: string | null
          status?: string
          summary?: Json
          total_rows?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          id?: string
          import_type?: string
          imported_count?: number
          processed_rows?: number
          result_record_id?: string | null
          shop_id?: string
          skipped_count?: number
          source_storage_path?: string | null
          status?: string
          summary?: Json
          total_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_result_inspection_template_fkey"
            columns: ["result_record_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          created_at: string | null
          id: string
          inspection_id: string | null
          label: string | null
          notes: string | null
          section: string | null
          status: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inspection_id?: string | null
          label?: string | null
          notes?: string | null
          section?: string | null
          status?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inspection_id?: string | null
          label?: string | null
          notes?: string | null
          section?: string | null
          status?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_photos: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          inspection_id: string | null
          item_name: string | null
          notes: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          inspection_id?: string | null
          item_name?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          inspection_id?: string | null
          item_name?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      inspection_result_items: {
        Row: {
          created_at: string
          item_label: string | null
          notes: string | null
          photo_urls: Json | null
          result_id: string
          section_title: string | null
          status: Database["public"]["Enums"]["inspection_item_status"] | null
          unit: string | null
          value: string | null
        }
        Insert: {
          created_at?: string
          item_label?: string | null
          notes?: string | null
          photo_urls?: Json | null
          result_id: string
          section_title?: string | null
          status?: Database["public"]["Enums"]["inspection_item_status"] | null
          unit?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string
          item_label?: string | null
          notes?: string | null
          photo_urls?: Json | null
          result_id?: string
          section_title?: string | null
          status?: Database["public"]["Enums"]["inspection_item_status"] | null
          unit?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_result_items_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "inspection_results"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_results: {
        Row: {
          created_at: string
          customer: Json | null
          finished_at: string
          id: string
          quote: Json | null
          sections: Json
          session_id: string
          template_name: string | null
          vehicle: Json | null
          work_order_line_id: string
        }
        Insert: {
          created_at?: string
          customer?: Json | null
          finished_at?: string
          id?: string
          quote?: Json | null
          sections: Json
          session_id: string
          template_name?: string | null
          vehicle?: Json | null
          work_order_line_id: string
        }
        Update: {
          created_at?: string
          customer?: Json | null
          finished_at?: string
          id?: string
          quote?: Json | null
          sections?: Json
          session_id?: string
          template_name?: string | null
          vehicle?: Json | null
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inspection_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_sessions: {
        Row: {
          completed_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          state: Json | null
          status: string
          template: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_id: string | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          state?: Json | null
          status?: string
          template?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          state?: Json | null
          status?: string
          template?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_sessions_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_signatures: {
        Row: {
          id: string
          inspection_id: string
          ip_address: string | null
          role: string
          signature_hash: string | null
          signature_image_path: string | null
          signed_at: string
          signed_by: string | null
          signed_name: string | null
          signed_summary: Json | null
          signed_summary_hash: string | null
          signed_sync_revision: number | null
          signing_cycle: number
          user_agent: string | null
        }
        Insert: {
          id?: string
          inspection_id: string
          ip_address?: string | null
          role: string
          signature_hash?: string | null
          signature_image_path?: string | null
          signed_at?: string
          signed_by?: string | null
          signed_name?: string | null
          signed_summary?: Json | null
          signed_summary_hash?: string | null
          signed_sync_revision?: number | null
          signing_cycle?: number
          user_agent?: string | null
        }
        Update: {
          id?: string
          inspection_id?: string
          ip_address?: string | null
          role?: string
          signature_hash?: string | null
          signature_image_path?: string | null
          signed_at?: string
          signed_by?: string | null
          signed_name?: string | null
          signed_summary?: Json | null
          signed_summary_hash?: string | null
          signed_sync_revision?: number | null
          signing_cycle?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_signatures_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_smart_match_feedback: {
        Row: {
          action: string
          created_at: string
          drivetrain: string | null
          engine: string | null
          id: string
          item_label: string | null
          menu_repair_item_id: string | null
          note: string | null
          shop_id: string
          suggested_label: string | null
          suggested_match_id: string | null
          transmission: string | null
          user_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
        }
        Insert: {
          action: string
          created_at?: string
          drivetrain?: string | null
          engine?: string | null
          id?: string
          item_label?: string | null
          menu_repair_item_id?: string | null
          note?: string | null
          shop_id: string
          suggested_label?: string | null
          suggested_match_id?: string | null
          transmission?: string | null
          user_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Update: {
          action?: string
          created_at?: string
          drivetrain?: string | null
          engine?: string | null
          id?: string
          item_label?: string | null
          menu_repair_item_id?: string | null
          note?: string | null
          shop_id?: string
          suggested_label?: string | null
          suggested_match_id?: string | null
          transmission?: string | null
          user_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_smart_match_feedback_menu_repair_item_id_fkey"
            columns: ["menu_repair_item_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_smart_match_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_smart_match_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_smart_match_history: {
        Row: {
          confidence: number | null
          correction: string | null
          created_at: string | null
          created_work_order_line_id: string | null
          drivetrain: string | null
          engine: string | null
          id: string
          inspection_id: string | null
          item_label: string | null
          labor_hours: number | null
          matched_label: string | null
          menu_repair_item_id: string | null
          note: string | null
          parts: Json | null
          section_title: string | null
          shop_id: string
          transmission: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
          work_order_id: string | null
        }
        Insert: {
          confidence?: number | null
          correction?: string | null
          created_at?: string | null
          created_work_order_line_id?: string | null
          drivetrain?: string | null
          engine?: string | null
          id?: string
          inspection_id?: string | null
          item_label?: string | null
          labor_hours?: number | null
          matched_label?: string | null
          menu_repair_item_id?: string | null
          note?: string | null
          parts?: Json | null
          section_title?: string | null
          shop_id: string
          transmission?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          work_order_id?: string | null
        }
        Update: {
          confidence?: number | null
          correction?: string | null
          created_at?: string | null
          created_work_order_line_id?: string | null
          drivetrain?: string | null
          engine?: string | null
          id?: string
          inspection_id?: string | null
          item_label?: string | null
          labor_hours?: number | null
          matched_label?: string | null
          menu_repair_item_id?: string | null
          note?: string | null
          parts?: Json | null
          section_title?: string | null
          shop_id?: string
          transmission?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          work_order_id?: string | null
        }
        Relationships: []
      }
      inspection_template_suggestions: {
        Row: {
          applies_to: string
          confidence: number
          created_at: string
          id: string
          intake_id: string | null
          items: Json
          name: string
          shop_id: string
          template_key: string | null
        }
        Insert: {
          applies_to?: string
          confidence?: number
          created_at?: string
          id?: string
          intake_id?: string | null
          items?: Json
          name: string
          shop_id: string
          template_key?: string | null
        }
        Update: {
          applies_to?: string
          confidence?: number
          created_at?: string
          id?: string
          intake_id?: string | null
          items?: Json
          name?: string
          shop_id?: string
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_template_suggestions_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_template_suggestions_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "inspection_template_suggestions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_template_suggestions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          labor_hours: number | null
          sections: Json
          shop_id: string | null
          tags: string[] | null
          template_name: string
          updated_at: string | null
          user_id: string | null
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          labor_hours?: number | null
          sections: Json
          shop_id?: string | null
          tags?: string[] | null
          template_name: string
          updated_at?: string | null
          user_id?: string | null
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          labor_hours?: number | null
          sections?: Json
          shop_id?: string | null
          tags?: string[] | null
          template_name?: string
          updated_at?: string | null
          user_id?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          ai_summary: string | null
          completed: boolean | null
          created_at: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          inspection_type: string | null
          is_canonical: boolean
          is_draft: boolean | null
          location: string | null
          locked: boolean
          notes: string | null
          pdf_sha256: string | null
          pdf_storage_path: string | null
          pdf_url: string | null
          photo_urls: string[] | null
          quote_id: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          shop_id: string
          signing_cycle: number
          started_at: string | null
          status: string
          summary: Json | null
          sync_revision: number
          template_id: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_id: string | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          completed?: boolean | null
          created_at?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inspection_type?: string | null
          is_canonical?: boolean
          is_draft?: boolean | null
          location?: string | null
          locked?: boolean
          notes?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          photo_urls?: string[] | null
          quote_id?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          shop_id: string
          signing_cycle?: number
          started_at?: string | null
          status?: string
          summary?: Json | null
          sync_revision?: number
          template_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          completed?: boolean | null
          created_at?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inspection_type?: string | null
          is_canonical?: boolean
          is_draft?: boolean | null
          location?: string | null
          locked?: boolean
          notes?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          photo_urls?: string[] | null
          quote_id?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          shop_id?: string
          signing_cycle?: number
          started_at?: string | null
          status?: string
          summary?: Json | null
          sync_revision?: number
          template_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_vehicle_fk"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          capabilities: string[]
          config: Json
          created_at: string
          created_by: string | null
          display_name: string | null
          id: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          provider: string
          secret_reference: string | null
          shop_id: string
          status: string
          sync_cursor: Json
          updated_at: string
        }
        Insert: {
          capabilities?: string[]
          config?: Json
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          provider: string
          secret_reference?: string | null
          shop_id: string
          status?: string
          sync_cursor?: Json
          updated_at?: string
        }
        Update: {
          capabilities?: string[]
          config?: Json
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          provider?: string
          secret_reference?: string | null
          shop_id?: string
          status?: string
          sync_cursor?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_connections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_external_objects: {
        Row: {
          canonical_id: string
          canonical_table: string
          connection_id: string | null
          created_at: string
          external_id: string
          external_version: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          object_type: string
          provider: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          canonical_id: string
          canonical_table: string
          connection_id?: string | null
          created_at?: string
          external_id: string
          external_version?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          object_type: string
          provider: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          canonical_id?: string
          canonical_table?: string
          connection_id?: string | null
          created_at?: string
          external_id?: string
          external_version?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          object_type?: string
          provider?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_external_objects_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_external_objects_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_external_objects_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_events: {
        Row: {
          attempt_count: number
          canonical_id: string | null
          canonical_table: string | null
          completed_at: string | null
          connection_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          error_message: string | null
          external_id: string | null
          id: string
          object_type: string | null
          operation: string
          operation_key: string
          payload_hash: string | null
          provider: string
          request_metadata: Json
          response_metadata: Json
          shop_id: string
          started_at: string
          status: string
        }
        Insert: {
          attempt_count?: number
          canonical_id?: string | null
          canonical_table?: string | null
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          object_type?: string | null
          operation: string
          operation_key: string
          payload_hash?: string | null
          provider: string
          request_metadata?: Json
          response_metadata?: Json
          shop_id: string
          started_at?: string
          status?: string
        }
        Update: {
          attempt_count?: number
          canonical_id?: string | null
          canonical_table?: string | null
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          object_type?: string | null
          operation?: string
          operation_key?: string
          payload_hash?: string | null
          provider?: string
          request_metadata?: Json
          response_metadata?: Json
          shop_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          provider: string
          shop_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          provider: string
          shop_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          provider?: string
          shop_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_story_signals: {
        Row: {
          created_at: string
          id: string
          payload: Json
          processed_at: string | null
          shop_id: string
          signal_type: string
          work_order_id: string
          work_order_line_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          shop_id: string
          signal_type: string
          work_order_id: string
          work_order_line_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          shop_id?: string
          signal_type?: string
          work_order_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_story_signals_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_story_signals_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reconciliation_exceptions: {
        Row: {
          created_at: string
          details: Json
          id: string
          missing_quantity: number
          part_id: string | null
          purchase_order_id: string | null
          reason: string
          resolved_at: string | null
          shop_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          missing_quantity: number
          part_id?: string | null
          purchase_order_id?: string | null
          reason: string
          resolved_at?: string | null
          shop_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          missing_quantity?: number
          part_id?: string | null
          purchase_order_id?: string | null
          reason?: string
          resolved_at?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reconciliation_exceptions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_documents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          kind: string
          mime_type: string
          shop_id: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          kind: string
          mime_type?: string
          shop_id: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          mime_type?: string
          shop_id?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_documents_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_documents_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_pricing_overrides: {
        Row: {
          created_at: string
          line_labor_totals: Json
          part_unit_prices: Json
          shop_id: string
          shop_supplies_amount: number | null
          updated_at: string
          updated_by: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string
          line_labor_totals?: Json
          part_unit_prices?: Json
          shop_id: string
          shop_supplies_amount?: number | null
          updated_at?: string
          updated_by?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string
          line_labor_totals?: Json
          part_unit_prices?: Json
          shop_id?: string
          shop_supplies_amount?: number | null
          updated_at?: string
          updated_by?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_pricing_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_pricing_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_pricing_overrides_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_pricing_overrides_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_pricing_overrides_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_pricing_overrides_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_pricing_overrides_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_versions: {
        Row: {
          created_at: string
          currency: string
          discount_total: number
          id: string
          invoice_id: string | null
          issued_at: string | null
          issued_by: string | null
          lifecycle_status: string
          outstanding_total: number | null
          paid_total: number
          refunded_total: number
          shop_id: string
          snapshot: Json
          snapshot_hash: string
          subtotal: number
          superseded_by_invoice_version_id: string | null
          supersedes_invoice_version_id: string | null
          tax_total: number
          total: number
          updated_at: string
          version_number: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          discount_total?: number
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          issued_by?: string | null
          lifecycle_status?: string
          outstanding_total?: number | null
          paid_total?: number
          refunded_total?: number
          shop_id: string
          snapshot: Json
          snapshot_hash: string
          subtotal?: number
          superseded_by_invoice_version_id?: string | null
          supersedes_invoice_version_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
          version_number: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          discount_total?: number
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          issued_by?: string | null
          lifecycle_status?: string
          outstanding_total?: number | null
          paid_total?: number
          refunded_total?: number
          shop_id?: string
          snapshot?: Json
          snapshot_hash?: string
          subtotal?: number
          superseded_by_invoice_version_id?: string | null
          supersedes_invoice_version_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
          version_number?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_versions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_superseded_by_invoice_version_id_fkey"
            columns: ["superseded_by_invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_supersedes_invoice_version_id_fkey"
            columns: ["supersedes_invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_versions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_versions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_versions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoice_versions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          active_invoice_version_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_total: number
          due_date: string | null
          id: string
          invoice_number: string | null
          issued_at: string | null
          labor_cost: number
          metadata: Json
          notes: string | null
          outstanding_total: number
          paid_at: string | null
          paid_total: number
          parts_cost: number
          refunded_total: number
          shop_id: string
          shop_supplies_total: number
          status: string
          subtotal: number
          tax_total: number
          tech_id: string | null
          total: number
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          active_invoice_version_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          labor_cost?: number
          metadata?: Json
          notes?: string | null
          outstanding_total?: number
          paid_at?: string | null
          paid_total?: number
          parts_cost?: number
          refunded_total?: number
          shop_id: string
          shop_supplies_total?: number
          status?: string
          subtotal?: number
          tax_total?: number
          tech_id?: string | null
          total?: number
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          active_invoice_version_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          labor_cost?: number
          metadata?: Json
          notes?: string | null
          outstanding_total?: number
          paid_at?: string | null
          paid_total?: number
          parts_cost?: number
          refunded_total?: number
          shop_id?: string
          shop_supplies_total?: number
          status?: string
          subtotal?: number
          tax_total?: number
          tech_id?: string | null
          total?: number
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_active_invoice_version_id_fkey"
            columns: ["active_invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      learned_job_templates: {
        Row: {
          accept_count: number
          confidence_score: number | null
          created_at: string
          default_labor_hours: number | null
          default_parts: Json
          embedding: string | null
          id: string
          job_category: string | null
          label: string
          last_seen_at: string
          last_used_at: string | null
          normalized_text: string | null
          reject_count: number
          shop_id: string
          source_work_order_id: string | null
          source_work_order_line_id: string | null
          tags: string[]
          template_key: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          accept_count?: number
          confidence_score?: number | null
          created_at?: string
          default_labor_hours?: number | null
          default_parts?: Json
          embedding?: string | null
          id?: string
          job_category?: string | null
          label: string
          last_seen_at?: string
          last_used_at?: string | null
          normalized_text?: string | null
          reject_count?: number
          shop_id: string
          source_work_order_id?: string | null
          source_work_order_line_id?: string | null
          tags?: string[]
          template_key: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          accept_count?: number
          confidence_score?: number | null
          created_at?: string
          default_labor_hours?: number | null
          default_parts?: Json
          embedding?: string | null
          id?: string
          job_category?: string | null
          label?: string
          last_seen_at?: string
          last_used_at?: string | null
          normalized_text?: string | null
          reject_count?: number
          shop_id?: string
          source_work_order_id?: string | null
          source_work_order_line_id?: string | null
          tags?: string[]
          template_key?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "learned_job_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learned_job_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learned_job_templates_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "learned_job_templates_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "learned_job_templates_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "learned_job_templates_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "learned_job_templates_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learned_job_templates_source_work_order_line_id_fkey"
            columns: ["source_work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learned_job_templates_source_work_order_line_id_fkey"
            columns: ["source_work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_rules: {
        Row: {
          distance_km_normal: number | null
          distance_km_severe: number | null
          engine_family: string | null
          first_due_km: number | null
          first_due_months: number | null
          id: string
          is_critical: boolean
          make: string | null
          model: string | null
          service_code: string
          time_months_normal: number | null
          time_months_severe: number | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          distance_km_normal?: number | null
          distance_km_severe?: number | null
          engine_family?: string | null
          first_due_km?: number | null
          first_due_months?: number | null
          id?: string
          is_critical?: boolean
          make?: string | null
          model?: string | null
          service_code: string
          time_months_normal?: number | null
          time_months_severe?: number | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          distance_km_normal?: number | null
          distance_km_severe?: number | null
          engine_family?: string | null
          first_due_km?: number | null
          first_due_months?: number | null
          id?: string
          is_critical?: boolean
          make?: string | null
          model?: string | null
          service_code?: string
          time_months_normal?: number | null
          time_months_severe?: number | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_rules_service_code_fkey"
            columns: ["service_code"]
            isOneToOne: false
            referencedRelation: "maintenance_services"
            referencedColumns: ["code"]
          },
        ]
      }
      maintenance_services: {
        Row: {
          code: string
          default_job_type: string
          default_labor_hours: number | null
          default_notes: string | null
          interval_km: number | null
          interval_months: number | null
          label: string
        }
        Insert: {
          code: string
          default_job_type?: string
          default_labor_hours?: number | null
          default_notes?: string | null
          interval_km?: number | null
          interval_months?: number | null
          label: string
        }
        Update: {
          code?: string
          default_job_type?: string
          default_labor_hours?: number | null
          default_notes?: string | null
          interval_km?: number | null
          interval_months?: number | null
          label?: string
        }
        Relationships: []
      }
      maintenance_suggestions: {
        Row: {
          created_at: string
          error_message: string | null
          mileage_km: number | null
          status: string
          suggestions: Json | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          mileage_km?: number | null
          status?: string
          suggestions?: Json | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          mileage_km?: number | null
          status?: string
          suggestions?: Json | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_suggestions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_suggestions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "maintenance_suggestions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "maintenance_suggestions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "maintenance_suggestions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "maintenance_suggestions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_uploads: {
        Row: {
          analysis_summary: string | null
          audio_url: string | null
          created_at: string | null
          file_type: string | null
          file_url: string | null
          id: string
          inspection_id: string | null
          user_id: string | null
          work_order_id: string | null
        }
        Insert: {
          analysis_summary?: string | null
          audio_url?: string | null
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          inspection_id?: string | null
          user_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          analysis_summary?: string | null
          audio_url?: string | null
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          inspection_id?: string | null
          user_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_uploads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "media_uploads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "media_uploads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "media_uploads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "media_uploads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_parts: {
        Row: {
          created_at: string | null
          id: string
          menu_item_id: string
          name: string
          part_id: string | null
          quantity: number
          shop_id: string | null
          unit_cost: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_item_id: string
          name: string
          part_id?: string | null
          quantity?: number
          shop_id?: string | null
          unit_cost?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_item_id?: string
          name?: string
          part_id?: string | null
          quantity?: number
          shop_id?: string | null
          unit_cost?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_parts_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "menu_item_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_parts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_parts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_suggestions: {
        Row: {
          category: string | null
          confidence: number
          created_at: string
          id: string
          inspection_template_suggestion_id: string | null
          intake_id: string | null
          labor_hours_suggestion: number | null
          price_suggestion: number | null
          reason: string | null
          shop_id: string
          title: string
        }
        Insert: {
          category?: string | null
          confidence?: number
          created_at?: string
          id?: string
          inspection_template_suggestion_id?: string | null
          intake_id?: string | null
          labor_hours_suggestion?: number | null
          price_suggestion?: number | null
          reason?: string | null
          shop_id: string
          title: string
        }
        Update: {
          category?: string | null
          confidence?: number
          created_at?: string
          id?: string
          inspection_template_suggestion_id?: string | null
          intake_id?: string | null
          labor_hours_suggestion?: number | null
          price_suggestion?: number | null
          reason?: string | null
          shop_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_suggestions_inspection_template_suggestion_id_fkey"
            columns: ["inspection_template_suggestion_id"]
            isOneToOne: false
            referencedRelation: "inspection_template_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_suggestions_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_suggestions_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "menu_item_suggestions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_suggestions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          base_labor_hours: number | null
          base_part_cost: number | null
          base_price: number | null
          category: string | null
          cause: string | null
          complaint: string | null
          correction: string | null
          created_at: string | null
          creation_request_id: string | null
          description: string | null
          drivetrain: string | null
          engine_code: string | null
          engine_type: string | null
          id: string
          inspection_template_id: string | null
          is_active: boolean | null
          labor_hours: number | null
          labor_time: number | null
          name: string | null
          part_cost: number | null
          service_key: string | null
          shop_id: string | null
          source: string | null
          submodel: string | null
          tools: string | null
          total_price: number | null
          transmission_code: string | null
          transmission_type: string | null
          user_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
          work_order_line_id: string | null
        }
        Insert: {
          base_labor_hours?: number | null
          base_part_cost?: number | null
          base_price?: number | null
          category?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string | null
          creation_request_id?: string | null
          description?: string | null
          drivetrain?: string | null
          engine_code?: string | null
          engine_type?: string | null
          id?: string
          inspection_template_id?: string | null
          is_active?: boolean | null
          labor_hours?: number | null
          labor_time?: number | null
          name?: string | null
          part_cost?: number | null
          service_key?: string | null
          shop_id?: string | null
          source?: string | null
          submodel?: string | null
          tools?: string | null
          total_price?: number | null
          transmission_code?: string | null
          transmission_type?: string | null
          user_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          work_order_line_id?: string | null
        }
        Update: {
          base_labor_hours?: number | null
          base_part_cost?: number | null
          base_price?: number | null
          category?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string | null
          creation_request_id?: string | null
          description?: string | null
          drivetrain?: string | null
          engine_code?: string | null
          engine_type?: string | null
          id?: string
          inspection_template_id?: string | null
          is_active?: boolean | null
          labor_hours?: number | null
          labor_time?: number | null
          name?: string | null
          part_cost?: number | null
          service_key?: string | null
          shop_id?: string | null
          source?: string | null
          submodel?: string | null
          tools?: string | null
          total_price?: number | null
          transmission_code?: string | null
          transmission_type?: string | null
          user_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_pricing: {
        Row: {
          created_at: string | null
          description: string | null
          estimated_labor_minutes: number | null
          id: string
          labor_rate: number | null
          part_cost: number | null
          service_name: string | null
          user_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          estimated_labor_minutes?: number | null
          id?: string
          labor_rate?: number | null
          part_cost?: number | null
          service_name?: string | null
          user_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          estimated_labor_minutes?: number | null
          id?: string
          labor_rate?: number | null
          part_cost?: number | null
          service_name?: string | null
          user_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Relationships: []
      }
      menu_repair_item_parts: {
        Row: {
          created_at: string
          fitment_notes: string | null
          id: string
          is_required: boolean
          last_seen_supplier: string | null
          menu_repair_item_id: string
          part_name: string
          part_number: string | null
          part_role: string | null
          qty: number
          shop_id: string
          sort_order: number
          supplier_part_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fitment_notes?: string | null
          id?: string
          is_required?: boolean
          last_seen_supplier?: string | null
          menu_repair_item_id: string
          part_name: string
          part_number?: string | null
          part_role?: string | null
          qty?: number
          shop_id: string
          sort_order?: number
          supplier_part_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fitment_notes?: string | null
          id?: string
          is_required?: boolean
          last_seen_supplier?: string | null
          menu_repair_item_id?: string
          part_name?: string
          part_number?: string | null
          part_role?: string | null
          qty?: number
          shop_id?: string
          sort_order?: number
          supplier_part_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_repair_item_parts_menu_repair_item_id_fkey"
            columns: ["menu_repair_item_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_item_parts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_item_parts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_repair_item_pricing_parts: {
        Row: {
          availability: string | null
          core_charge: number | null
          created_at: string
          freight: number | null
          id: string
          lead_time: string | null
          match_confidence: number | null
          menu_repair_item_part_id: string | null
          notes: string | null
          part_name: string
          pricing_snapshot_id: string
          qty: number
          quoted_part_number: string | null
          supplier_part_number: string | null
          unit_cost: number | null
          unit_sell: number | null
        }
        Insert: {
          availability?: string | null
          core_charge?: number | null
          created_at?: string
          freight?: number | null
          id?: string
          lead_time?: string | null
          match_confidence?: number | null
          menu_repair_item_part_id?: string | null
          notes?: string | null
          part_name: string
          pricing_snapshot_id: string
          qty?: number
          quoted_part_number?: string | null
          supplier_part_number?: string | null
          unit_cost?: number | null
          unit_sell?: number | null
        }
        Update: {
          availability?: string | null
          core_charge?: number | null
          created_at?: string
          freight?: number | null
          id?: string
          lead_time?: string | null
          match_confidence?: number | null
          menu_repair_item_part_id?: string | null
          notes?: string | null
          part_name?: string
          pricing_snapshot_id?: string
          qty?: number
          quoted_part_number?: string | null
          supplier_part_number?: string | null
          unit_cost?: number | null
          unit_sell?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_repair_item_pricing_parts_menu_repair_item_part_id_fkey"
            columns: ["menu_repair_item_part_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_item_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_item_pricing_parts_pricing_snapshot_id_fkey"
            columns: ["pricing_snapshot_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_item_pricing_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_repair_item_pricing_snapshots: {
        Row: {
          created_at: string
          currency: string
          id: string
          import_batch_id: string | null
          menu_repair_item_id: string
          pricing_valid_days: number
          quote_reference: string | null
          quote_source: string
          quoted_at: string
          shop_id: string
          source_quote_line_id: string | null
          source_work_order_line_id: string | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
          total_cost: number | null
          total_sell: number | null
          updated_at: string
          uploaded_by: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          import_batch_id?: string | null
          menu_repair_item_id: string
          pricing_valid_days?: number
          quote_reference?: string | null
          quote_source?: string
          quoted_at?: string
          shop_id: string
          source_quote_line_id?: string | null
          source_work_order_line_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          total_sell?: number | null
          updated_at?: string
          uploaded_by?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          import_batch_id?: string | null
          menu_repair_item_id?: string
          pricing_valid_days?: number
          quote_reference?: string | null
          quote_source?: string
          quoted_at?: string
          shop_id?: string
          source_quote_line_id?: string | null
          source_work_order_line_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          total_sell?: number | null
          updated_at?: string
          uploaded_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_repair_item_pricing_snapshots_menu_repair_item_id_fkey"
            columns: ["menu_repair_item_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_item_pricing_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_item_pricing_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_item_pricing_snapshots_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_repair_items: {
        Row: {
          active_pricing_snapshot_id: string | null
          cause: string | null
          complaint: string | null
          correction: string | null
          created_at: string
          drivetrain: string | null
          engine: string | null
          fuel_type: string | null
          id: string
          is_active: boolean
          labor_hours: number | null
          labor_rate: number | null
          last_pricing_refresh_at: string | null
          last_pricing_source: string | null
          name: string
          notes: string | null
          parts: Json
          price_estimate: number | null
          pricing_status: string | null
          pricing_valid_days: number | null
          shop_id: string
          source_quote_line_id: string | null
          source_work_order_id: string | null
          source_work_order_line_id: string | null
          tags: string[]
          template_key: string
          transmission: string | null
          updated_at: string
          usage_count: number
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
        }
        Insert: {
          active_pricing_snapshot_id?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string
          drivetrain?: string | null
          engine?: string | null
          fuel_type?: string | null
          id?: string
          is_active?: boolean
          labor_hours?: number | null
          labor_rate?: number | null
          last_pricing_refresh_at?: string | null
          last_pricing_source?: string | null
          name: string
          notes?: string | null
          parts?: Json
          price_estimate?: number | null
          pricing_status?: string | null
          pricing_valid_days?: number | null
          shop_id: string
          source_quote_line_id?: string | null
          source_work_order_id?: string | null
          source_work_order_line_id?: string | null
          tags?: string[]
          template_key: string
          transmission?: string | null
          updated_at?: string
          usage_count?: number
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Update: {
          active_pricing_snapshot_id?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string
          drivetrain?: string | null
          engine?: string | null
          fuel_type?: string | null
          id?: string
          is_active?: boolean
          labor_hours?: number | null
          labor_rate?: number | null
          last_pricing_refresh_at?: string | null
          last_pricing_source?: string | null
          name?: string
          notes?: string | null
          parts?: Json
          price_estimate?: number | null
          pricing_status?: string | null
          pricing_valid_days?: number | null
          shop_id?: string
          source_quote_line_id?: string | null
          source_work_order_id?: string | null
          source_work_order_line_id?: string | null
          tags?: string[]
          template_key?: string
          transmission?: string | null
          updated_at?: string
          usage_count?: number
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_repair_items_active_pricing_snapshot_id_fkey"
            columns: ["active_pricing_snapshot_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_item_pricing_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_items_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "menu_repair_items_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "menu_repair_items_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "menu_repair_items_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "menu_repair_items_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_items_source_work_order_line_id_fkey"
            columns: ["source_work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_repair_items_source_work_order_line_id_fkey"
            columns: ["source_work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      message_deliveries: {
        Row: {
          conversation_id: string
          created_at: string
          delivered_at: string
          id: string
          message_id: string
          notified_at: string | null
          read_at: string | null
          recipient_participant_id: string
          recipient_user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          delivered_at?: string
          id?: string
          message_id: string
          notified_at?: string | null
          read_at?: string | null
          recipient_participant_id: string
          recipient_user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          delivered_at?: string
          id?: string
          message_id?: string
          notified_at?: string | null
          read_at?: string | null
          recipient_participant_id?: string
          recipient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_deliveries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deliveries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deliveries_recipient_conversation_fkey"
            columns: ["recipient_participant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_participants"
            referencedColumns: ["id", "conversation_id"]
          },
        ]
      }
      message_reads: {
        Row: {
          conversation_id: string
          id: string
          last_read_at: string
          participant_id: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_read_at?: string
          participant_id?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_read_at?: string
          participant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_participant_conversation_fkey"
            columns: ["participant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_participants"
            referencedColumns: ["id", "conversation_id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          client_message_id: string | null
          content: string
          conversation_id: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          metadata: Json
          recipients: string[]
          reply_to: string | null
          sender_id: string | null
          sender_kind: string | null
          sender_participant_id: string | null
          sent_at: string | null
        }
        Insert: {
          attachments?: Json
          client_message_id?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          metadata?: Json
          recipients?: string[]
          reply_to?: string | null
          sender_id?: string | null
          sender_kind?: string | null
          sender_participant_id?: string | null
          sent_at?: string | null
        }
        Update: {
          attachments?: Json
          client_message_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          metadata?: Json
          recipients?: string[]
          reply_to?: string | null
          sender_id?: string | null
          sender_kind?: string | null
          sender_participant_id?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_participant_conversation_fkey"
            columns: ["sender_participant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_participants"
            referencedColumns: ["id", "conversation_id"]
          },
        ]
      }
      mobile_field_operators: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          profile_id: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          profile_id: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          profile_id?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_field_operators_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_field_operators_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_field_operators_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_field_operators_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_operation_keys: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          operation_key: string
          operation_name: string
          result: Json
          shop_id: string
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key: string
          operation_name: string
          result?: Json
          shop_id: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key?: string
          operation_name?: string
          result?: Json
          shop_id?: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobile_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_operation_keys_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_service_followups: {
        Row: {
          converted_work_order_id: string | null
          created_at: string
          customer_id: string | null
          dismissed_at: string | null
          disposition: string
          estimated_amount: number | null
          follow_up_at: string | null
          id: string
          notes: string | null
          quoted_at: string | null
          recommendation: string
          recommended_at: string
          recommended_by: string | null
          service_visit_id: string | null
          shop_id: string
          status: string
          updated_at: string
          vehicle_id: string | null
          work_order_id: string
        }
        Insert: {
          converted_work_order_id?: string | null
          created_at?: string
          customer_id?: string | null
          dismissed_at?: string | null
          disposition?: string
          estimated_amount?: number | null
          follow_up_at?: string | null
          id?: string
          notes?: string | null
          quoted_at?: string | null
          recommendation: string
          recommended_at?: string
          recommended_by?: string | null
          service_visit_id?: string | null
          shop_id: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          work_order_id: string
        }
        Update: {
          converted_work_order_id?: string | null
          created_at?: string
          customer_id?: string | null
          dismissed_at?: string | null
          disposition?: string
          estimated_amount?: number | null
          follow_up_at?: string | null
          id?: string
          notes?: string | null
          quoted_at?: string | null
          recommendation?: string
          recommended_at?: string
          recommended_by?: string | null
          service_visit_id?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_service_followups_converted_work_order_id_fkey"
            columns: ["converted_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_converted_work_order_id_fkey"
            columns: ["converted_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_converted_work_order_id_fkey"
            columns: ["converted_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_converted_work_order_id_fkey"
            columns: ["converted_work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_converted_work_order_id_fkey"
            columns: ["converted_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_followups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_followups_recommended_by_fkey"
            columns: ["recommended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_followups_service_visit_id_fkey"
            columns: ["service_visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_followups_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_followups_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_followups_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_followups_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "mobile_service_followups_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_service_settings: {
        Row: {
          configured_by: string | null
          created_at: string
          default_visit_minutes: number
          dispatch_enabled: boolean
          field_operator_count_target: number
          onboarding_completed_at: string | null
          service_model: string
          service_vehicles_enabled: boolean
          shop_id: string
          solo_mode: boolean
          truck_inventory_enabled: boolean
          updated_at: string
        }
        Insert: {
          configured_by?: string | null
          created_at?: string
          default_visit_minutes?: number
          dispatch_enabled?: boolean
          field_operator_count_target?: number
          onboarding_completed_at?: string | null
          service_model?: string
          service_vehicles_enabled?: boolean
          shop_id: string
          solo_mode?: boolean
          truck_inventory_enabled?: boolean
          updated_at?: string
        }
        Update: {
          configured_by?: string | null
          created_at?: string
          default_visit_minutes?: number
          dispatch_enabled?: boolean
          field_operator_count_target?: number
          onboarding_completed_at?: string | null
          service_model?: string
          service_vehicles_enabled?: boolean
          shop_id?: string
          solo_mode?: boolean
          truck_inventory_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_service_settings_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_service_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          kind: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          kind: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          kind?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      offline_mutation_receipts: {
        Row: {
          action_type: string
          actor_user_id: string
          completed_at: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          operation_key: string
          payload_hash: string
          result: Json
          shop_id: string
        }
        Insert: {
          action_type: string
          actor_user_id: string
          completed_at?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          operation_key: string
          payload_hash: string
          result?: Json
          shop_id: string
        }
        Update: {
          action_type?: string
          actor_user_id?: string
          completed_at?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          operation_key?: string
          payload_hash?: string
          result?: Json
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_mutation_receipts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_mutation_receipts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_event_failures: {
        Row: {
          attempt_count: number
          context: Json
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error_message: string
          event_type: string | null
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          resolved_at: string | null
          shop_id: string | null
          source_table: string | null
          sqlstate: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          context?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message: string
          event_type?: string | null
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          resolved_at?: string | null
          shop_id?: string | null
          source_table?: string | null
          sqlstate?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          context?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string
          event_type?: string | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          resolved_at?: string | null
          shop_id?: string | null
          source_table?: string | null
          sqlstate?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_event_failures_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_event_failures_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          causation_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          idempotency_key: string | null
          metadata: Json
          occurred_at: string
          parent_entity_id: string | null
          parent_entity_type: string | null
          schema_version: number
          severity: string
          shop_id: string
          source: string
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          causation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          parent_entity_id?: string | null
          parent_entity_type?: string | null
          schema_version?: number
          severity?: string
          shop_id: string
          source?: string
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          causation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          parent_entity_id?: string | null
          parent_entity_type?: string | null
          schema_version?: number
          severity?: string
          shop_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_events_causation_id_fkey"
            columns: ["causation_id"]
            isOneToOne: false
            referencedRelation: "operational_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_events_causation_id_fkey"
            columns: ["causation_id"]
            isOneToOne: false
            referencedRelation: "unified_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_actions: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          opportunity_id: string
          payload: Json
          shop_id: string
          type: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id: string
          payload?: Json
          shop_id: string
          type: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string
          payload?: Json
          shop_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_actions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_actions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          billing_status: string | null
          created_at: string
          created_by: string | null
          default_currency: string | null
          id: string
          metadata: Json | null
          name: string
          owner_profile_id: string | null
          slug: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          billing_email?: string | null
          billing_status?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string | null
          id?: string
          metadata?: Json | null
          name: string
          owner_profile_id?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          billing_email?: string | null
          billing_status?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          owner_profile_id?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_profile_fk"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_report_summaries: {
        Row: {
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          metric_version: string
          model: string | null
          period_end: string
          period_kind: string
          period_start: string
          shop_id: string
          snapshot_hash: string
          summary_source: string
          summary_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          metric_version?: string
          model?: string | null
          period_end: string
          period_kind: string
          period_start: string
          shop_id: string
          snapshot_hash: string
          summary_source: string
          summary_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          metric_version?: string
          model?: string | null
          period_end?: string
          period_kind?: string
          period_start?: string
          shop_id?: string
          snapshot_hash?: string
          summary_source?: string
          summary_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_report_summaries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_report_summaries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      part_barcodes: {
        Row: {
          barcode: string
          id: string
          kind: string | null
          part_id: string
        }
        Insert: {
          barcode: string
          id?: string
          kind?: string | null
          part_id: string
        }
        Update: {
          barcode?: string
          id?: string
          kind?: string | null
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_barcodes_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_barcodes_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_compatibility: {
        Row: {
          created_at: string | null
          id: string
          make: string
          model: string
          part_id: string | null
          shop_id: string | null
          year_range: unknown
        }
        Insert: {
          created_at?: string | null
          id?: string
          make: string
          model: string
          part_id?: string | null
          shop_id?: string | null
          year_range?: unknown
        }
        Update: {
          created_at?: string | null
          id?: string
          make?: string
          model?: string
          part_id?: string | null
          shop_id?: string | null
          year_range?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "part_compatibility_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_compatibility_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_external_identities: {
        Row: {
          active: boolean
          barcode: string | null
          connection_id: string | null
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          manufacturer: string | null
          metadata: Json
          package_quantity: number
          part_id: string
          part_number: string | null
          provider: string
          shop_id: string
          supplier_id: string | null
          supplier_sku: string | null
          unit_of_measure: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          manufacturer?: string | null
          metadata?: Json
          package_quantity?: number
          part_id: string
          part_number?: string | null
          provider?: string
          shop_id: string
          supplier_id?: string | null
          supplier_sku?: string | null
          unit_of_measure?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          manufacturer?: string | null
          metadata?: Json
          package_quantity?: number
          part_id?: string
          part_number?: string | null
          provider?: string
          shop_id?: string
          supplier_id?: string | null
          supplier_sku?: string | null
          unit_of_measure?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_external_identities_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_external_identities_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_external_identities_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_external_identities_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_external_identities_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_external_identities_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      part_purchases: {
        Row: {
          id: string
          part_id: string | null
          purchase_price: number | null
          purchased_at: string | null
          quantity: number
          shop_id: string | null
          supplier_id: string | null
        }
        Insert: {
          id?: string
          part_id?: string | null
          purchase_price?: number | null
          purchased_at?: string | null
          quantity: number
          shop_id?: string | null
          supplier_id?: string | null
        }
        Update: {
          id?: string
          part_id?: string | null
          purchase_price?: number | null
          purchased_at?: string | null
          quantity?: number
          shop_id?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_purchases_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_purchases_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "part_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      part_request_items: {
        Row: {
          approved: boolean
          created_at: string
          description: string
          id: string
          latest_supplier_quote_request_id: string | null
          location_id: string | null
          markup_pct: number | null
          menu_item_id: string | null
          part_id: string | null
          po_id: string | null
          qty: number
          qty_approved: number
          qty_assigned: number
          qty_consumed: number
          qty_ordered: number
          qty_picked: number
          qty_received: number
          qty_requested: number
          qty_reserved: number
          qty_returned: number
          quote_line_id: string | null
          quoted_price: number | null
          request_id: string
          requested_manufacturer: string | null
          requested_part_number: string | null
          shop_id: string | null
          source_menu_item_part_id: string | null
          source_row_id: string | null
          source_work_order_part_id: string | null
          status: Database["public"]["Enums"]["part_request_item_status"]
          supplier_quote_received_at: string | null
          supplier_quote_requested_at: string | null
          supplier_quote_status: string
          unit_cost: number | null
          unit_price: number | null
          updated_at: string
          vendor: string | null
          vendor_id: string | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string
          description: string
          id?: string
          latest_supplier_quote_request_id?: string | null
          location_id?: string | null
          markup_pct?: number | null
          menu_item_id?: string | null
          part_id?: string | null
          po_id?: string | null
          qty?: number
          qty_approved?: number
          qty_assigned?: number
          qty_consumed?: number
          qty_ordered?: number
          qty_picked?: number
          qty_received?: number
          qty_requested?: number
          qty_reserved?: number
          qty_returned?: number
          quote_line_id?: string | null
          quoted_price?: number | null
          request_id: string
          requested_manufacturer?: string | null
          requested_part_number?: string | null
          shop_id?: string | null
          source_menu_item_part_id?: string | null
          source_row_id?: string | null
          source_work_order_part_id?: string | null
          status?: Database["public"]["Enums"]["part_request_item_status"]
          supplier_quote_received_at?: string | null
          supplier_quote_requested_at?: string | null
          supplier_quote_status?: string
          unit_cost?: number | null
          unit_price?: number | null
          updated_at?: string
          vendor?: string | null
          vendor_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string
          description?: string
          id?: string
          latest_supplier_quote_request_id?: string | null
          location_id?: string | null
          markup_pct?: number | null
          menu_item_id?: string | null
          part_id?: string | null
          po_id?: string | null
          qty?: number
          qty_approved?: number
          qty_assigned?: number
          qty_consumed?: number
          qty_ordered?: number
          qty_picked?: number
          qty_received?: number
          qty_requested?: number
          qty_reserved?: number
          qty_returned?: number
          quote_line_id?: string | null
          quoted_price?: number | null
          request_id?: string
          requested_manufacturer?: string | null
          requested_part_number?: string | null
          shop_id?: string | null
          source_menu_item_part_id?: string | null
          source_row_id?: string | null
          source_work_order_part_id?: string | null
          status?: Database["public"]["Enums"]["part_request_item_status"]
          supplier_quote_received_at?: string | null
          supplier_quote_requested_at?: string | null
          supplier_quote_status?: string
          unit_cost?: number | null
          unit_price?: number | null
          updated_at?: string
          vendor?: string | null
          vendor_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_request_items_latest_supplier_quote_request_id_fkey"
            columns: ["latest_supplier_quote_request_id"]
            isOneToOne: false
            referencedRelation: "parts_supplier_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_menu_item_shop_fkey"
            columns: ["shop_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "part_request_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_request_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "part_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_source_menu_part_fkey"
            columns: ["source_menu_item_part_id"]
            isOneToOne: false
            referencedRelation: "menu_item_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_source_work_order_part_id_fkey"
            columns: ["source_work_order_part_id"]
            isOneToOne: false
            referencedRelation: "invoice_net_issued_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_source_work_order_part_id_fkey"
            columns: ["source_work_order_part_id"]
            isOneToOne: false
            referencedRelation: "work_order_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_request_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_request_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_request_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_request_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_items_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      part_request_lines: {
        Row: {
          created_at: string
          id: string
          request_id: string
          work_order_line_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          work_order_line_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_request_lines_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "part_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_lines_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_request_lines_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      part_requests: {
        Row: {
          assigned_to: string | null
          created_at: string
          handoff_completed_at: string | null
          handoff_completed_by: string | null
          id: string
          job_id: string | null
          notes: string | null
          pick_request_source: string | null
          pick_requested_at: string | null
          pick_requested_by: string | null
          quote_line_id: string | null
          requested_by: string | null
          shop_id: string
          source_context: string | null
          source_menu_item_id: string | null
          source_revision: number | null
          status: Database["public"]["Enums"]["part_request_status"]
          work_order_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          handoff_completed_at?: string | null
          handoff_completed_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          pick_request_source?: string | null
          pick_requested_at?: string | null
          pick_requested_by?: string | null
          quote_line_id?: string | null
          requested_by?: string | null
          shop_id: string
          source_context?: string | null
          source_menu_item_id?: string | null
          source_revision?: number | null
          status?: Database["public"]["Enums"]["part_request_status"]
          work_order_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          handoff_completed_at?: string | null
          handoff_completed_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          pick_request_source?: string | null
          pick_requested_at?: string | null
          pick_requested_by?: string | null
          quote_line_id?: string | null
          requested_by?: string | null
          shop_id?: string
          source_context?: string | null
          source_menu_item_id?: string | null
          source_revision?: number | null
          status?: Database["public"]["Enums"]["part_request_status"]
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_requests_source_menu_item_shop_fkey"
            columns: ["shop_id", "source_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "part_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      part_returns: {
        Row: {
          id: string
          part_id: string | null
          quantity: number
          reason: string | null
          returned_at: string | null
          returned_by: string | null
          shop_id: string | null
        }
        Insert: {
          id?: string
          part_id?: string | null
          quantity?: number
          reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
          shop_id?: string | null
        }
        Update: {
          id?: string
          part_id?: string | null
          quantity?: number
          reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_returns_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_returns_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_stock: {
        Row: {
          id: string
          location_id: string
          part_id: string
          qty_on_hand: number
          qty_reserved: number
          reorder_point: number | null
          reorder_qty: number | null
        }
        Insert: {
          id?: string
          location_id: string
          part_id: string
          qty_on_hand?: number
          qty_reserved?: number
          reorder_point?: number | null
          reorder_qty?: number | null
        }
        Update: {
          id?: string
          location_id?: string
          part_id?: string
          qty_on_hand?: number
          qty_reserved?: number
          reorder_point?: number | null
          reorder_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "part_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_stock_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_stock_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_suppliers: {
        Row: {
          contact_info: string | null
          created_at: string | null
          id: string
          name: string
          shop_id: string | null
        }
        Insert: {
          contact_info?: string | null
          created_at?: string | null
          id?: string
          name: string
          shop_id?: string | null
        }
        Update: {
          contact_info?: string | null
          created_at?: string | null
          id?: string
          name?: string
          shop_id?: string | null
        }
        Relationships: []
      }
      part_warranties: {
        Row: {
          coverage_details: string | null
          created_at: string | null
          id: string
          part_id: string | null
          shop_id: string | null
          warranty_period_months: number | null
          warranty_provider: string | null
        }
        Insert: {
          coverage_details?: string | null
          created_at?: string | null
          id?: string
          part_id?: string | null
          shop_id?: string | null
          warranty_period_months?: number | null
          warranty_provider?: string | null
        }
        Update: {
          coverage_details?: string | null
          created_at?: string | null
          id?: string
          part_id?: string | null
          shop_id?: string | null
          warranty_period_months?: number | null
          warranty_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_warranties_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_warranties_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          category: string | null
          cost: number | null
          created_at: string | null
          default_cost: number | null
          default_price: number | null
          description: string | null
          external_id: string | null
          id: string
          import_notes: string | null
          low_stock_threshold: number | null
          manufacturer: string | null
          name: string
          normalized_part_key: string | null
          part_number: string | null
          price: number | null
          shop_id: string | null
          sku: string | null
          source_intake_id: string | null
          subcategory: string | null
          supplier: string | null
          taxable: boolean | null
          unit: string | null
          warranty_months: number | null
        }
        Insert: {
          category?: string | null
          cost?: number | null
          created_at?: string | null
          default_cost?: number | null
          default_price?: number | null
          description?: string | null
          external_id?: string | null
          id?: string
          import_notes?: string | null
          low_stock_threshold?: number | null
          manufacturer?: string | null
          name: string
          normalized_part_key?: string | null
          part_number?: string | null
          price?: number | null
          shop_id?: string | null
          sku?: string | null
          source_intake_id?: string | null
          subcategory?: string | null
          supplier?: string | null
          taxable?: boolean | null
          unit?: string | null
          warranty_months?: number | null
        }
        Update: {
          category?: string | null
          cost?: number | null
          created_at?: string | null
          default_cost?: number | null
          default_price?: number | null
          description?: string | null
          external_id?: string | null
          id?: string
          import_notes?: string | null
          low_stock_threshold?: number | null
          manufacturer?: string | null
          name?: string
          normalized_part_key?: string | null
          part_number?: string | null
          price?: number | null
          shop_id?: string | null
          sku?: string | null
          source_intake_id?: string | null
          subcategory?: string | null
          supplier?: string | null
          taxable?: boolean | null
          unit?: string | null
          warranty_months?: number | null
        }
        Relationships: []
      }
      parts_barcodes: {
        Row: {
          barcode: string
          code: string | null
          created_at: string
          id: string
          part_id: string
          shop_id: string
          supplier_id: string | null
        }
        Insert: {
          barcode: string
          code?: string | null
          created_at?: string
          id?: string
          part_id: string
          shop_id: string
          supplier_id?: string | null
        }
        Update: {
          barcode?: string
          code?: string | null
          created_at?: string
          id?: string
          part_id?: string
          shop_id?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_barcodes_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "parts_barcodes_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_barcodes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_disposition_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          disposition_kind: string
          id: string
          metadata: Json
          operation_key: string
          part_request_item_id: string | null
          quantity: number
          reason: string
          shop_id: string
          work_order_id: string
          work_order_line_id: string
          work_order_part_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          disposition_kind: string
          id?: string
          metadata?: Json
          operation_key: string
          part_request_item_id?: string | null
          quantity?: number
          reason: string
          shop_id: string
          work_order_id: string
          work_order_line_id: string
          work_order_part_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          disposition_kind?: string
          id?: string
          metadata?: Json
          operation_key?: string
          part_request_item_id?: string | null
          quantity?: number
          reason?: string
          shop_id?: string
          work_order_id?: string
          work_order_line_id?: string
          work_order_part_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_disposition_events_part_request_item_id_fkey"
            columns: ["part_request_item_id"]
            isOneToOne: false
            referencedRelation: "part_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_disposition_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_disposition_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "invoice_net_issued_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_disposition_events_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "work_order_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_lifecycle_operations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          operation_type: string
          part_request_item_id: string | null
          result: Json
          shop_id: string
          work_order_part_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          operation_type: string
          part_request_item_id?: string | null
          result?: Json
          shop_id: string
          work_order_part_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          operation_type?: string
          part_request_item_id?: string | null
          result?: Json
          shop_id?: string
          work_order_part_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_lifecycle_operations_part_request_item_id_fkey"
            columns: ["part_request_item_id"]
            isOneToOne: false
            referencedRelation: "part_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_lifecycle_operations_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "invoice_net_issued_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_lifecycle_operations_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "work_order_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          recipient_role: string | null
          request_id: string | null
          sender_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          recipient_role?: string | null
          request_id?: string | null
          sender_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          recipient_role?: string | null
          request_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "parts_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_operation_keys: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          operation_key: string
          operation_type: string
          result: Json | null
          shop_id: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          operation_key: string
          operation_type: string
          result?: Json | null
          shop_id: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          operation_key?: string
          operation_type?: string
          result?: Json | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_quotes: {
        Row: {
          created_at: string | null
          id: string
          part_name: string | null
          part_number: string | null
          price: number | null
          quantity: number | null
          source: string | null
          work_order_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          part_name?: string | null
          part_number?: string | null
          price?: number | null
          quantity?: number | null
          source?: string | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          part_name?: string | null
          part_number?: string | null
          price?: number | null
          quantity?: number | null
          source?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_quotes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quotes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quotes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quotes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quotes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_request_handoff_keys: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          operation_key: string
          request_id: string
          result: Json
          shop_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key: string
          request_id: string
          result?: Json
          shop_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key?: string
          request_id?: string
          result?: Json
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_request_handoff_keys_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "part_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_request_handoff_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_request_handoff_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_request_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          request_id: string | null
          sender_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          request_id?: string | null
          sender_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          request_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_request_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "parts_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_requests: {
        Row: {
          archived: boolean | null
          created_at: string | null
          fulfilled_at: string | null
          id: string
          job_id: string | null
          notes: string | null
          part_name: string
          photo_url: string | null
          photo_urls: string[] | null
          quantity: number
          requested_by: string | null
          sent_at: string | null
          urgency: string | null
          viewed: boolean | null
          viewed_at: string | null
          work_order_id: string | null
        }
        Insert: {
          archived?: boolean | null
          created_at?: string | null
          fulfilled_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          part_name: string
          photo_url?: string | null
          photo_urls?: string[] | null
          quantity?: number
          requested_by?: string | null
          sent_at?: string | null
          urgency?: string | null
          viewed?: boolean | null
          viewed_at?: string | null
          work_order_id?: string | null
        }
        Update: {
          archived?: boolean | null
          created_at?: string | null
          fulfilled_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          part_name?: string
          photo_url?: string | null
          photo_urls?: string[] | null
          quantity?: number
          requested_by?: string | null
          sent_at?: string | null
          urgency?: string | null
          viewed?: boolean | null
          viewed_at?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_supplier_quote_request_items: {
        Row: {
          availability: string | null
          created_at: string
          description_snapshot: string
          expected_at: string | null
          id: string
          part_request_item_id: string
          qty_requested: number
          quote_request_id: string
          quoted_sell_price: number | null
          quoted_unit_cost: number | null
          requested_manufacturer_snapshot: string | null
          requested_part_number_snapshot: string | null
          status: string
          supplier_part_number: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          created_at?: string
          description_snapshot: string
          expected_at?: string | null
          id?: string
          part_request_item_id: string
          qty_requested: number
          quote_request_id: string
          quoted_sell_price?: number | null
          quoted_unit_cost?: number | null
          requested_manufacturer_snapshot?: string | null
          requested_part_number_snapshot?: string | null
          status?: string
          supplier_part_number?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          created_at?: string
          description_snapshot?: string
          expected_at?: string | null
          id?: string
          part_request_item_id?: string
          qty_requested?: number
          quote_request_id?: string
          quoted_sell_price?: number | null
          quoted_unit_cost?: number | null
          requested_manufacturer_snapshot?: string | null
          requested_part_number_snapshot?: string | null
          status?: string
          supplier_part_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_supplier_quote_request_items_part_request_item_id_fkey"
            columns: ["part_request_item_id"]
            isOneToOne: false
            referencedRelation: "part_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_request_items_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "parts_supplier_quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_supplier_quote_requests: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          draft_po_id: string | null
          id: string
          idempotency_key: string
          message: string | null
          parts_request_id: string
          po_contact_channel: string | null
          po_contacted_at: string | null
          po_contacted_by: string | null
          po_generation_error: string | null
          po_ready_at: string | null
          requested_at: string
          responded_at: string | null
          responded_by: string | null
          response_idempotency_key: string | null
          response_notes: string | null
          shop_id: string
          status: string
          subject: string | null
          supplier_id: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          draft_po_id?: string | null
          id?: string
          idempotency_key: string
          message?: string | null
          parts_request_id: string
          po_contact_channel?: string | null
          po_contacted_at?: string | null
          po_contacted_by?: string | null
          po_generation_error?: string | null
          po_ready_at?: string | null
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          response_idempotency_key?: string | null
          response_notes?: string | null
          shop_id: string
          status?: string
          subject?: string | null
          supplier_id: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          draft_po_id?: string | null
          id?: string
          idempotency_key?: string
          message?: string | null
          parts_request_id?: string
          po_contact_channel?: string | null
          po_contacted_at?: string | null
          po_contacted_by?: string | null
          po_generation_error?: string | null
          po_ready_at?: string | null
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          response_idempotency_key?: string | null
          response_notes?: string | null
          shop_id?: string
          status?: string
          subject?: string | null
          supplier_id?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_supplier_quote_requests_draft_po_id_fkey"
            columns: ["draft_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_parts_request_id_fkey"
            columns: ["parts_request_id"]
            isOneToOne: false
            referencedRelation: "part_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_supplier_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_suppliers: {
        Row: {
          api_base_url: string | null
          api_key: string | null
          created_at: string | null
          id: string
          shop_id: string | null
          supplier_name: string
        }
        Insert: {
          api_base_url?: string | null
          api_key?: string | null
          created_at?: string | null
          id?: string
          shop_id?: string | null
          supplier_name: string
        }
        Update: {
          api_base_url?: string | null
          api_key?: string | null
          created_at?: string | null
          id?: string
          shop_id?: string | null
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_suppliers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_suppliers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          actor_user_id: string | null
          amount: number
          created_at: string
          currency: string
          event_kind: string
          id: string
          invoice_version_id: string | null
          metadata: Json
          occurred_at: string
          operation_key: string
          payment_method: string | null
          processor: string
          processor_event_id: string | null
          processor_payment_id: string | null
          shop_id: string
          work_order_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          amount: number
          created_at?: string
          currency: string
          event_kind: string
          id?: string
          invoice_version_id?: string | null
          metadata?: Json
          occurred_at?: string
          operation_key: string
          payment_method?: string | null
          processor?: string
          processor_event_id?: string | null
          processor_payment_id?: string | null
          shop_id: string
          work_order_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          event_kind?: string
          id?: string
          invoice_version_id?: string | null
          metadata?: Json
          occurred_at?: string
          operation_key?: string
          payment_method?: string | null
          processor?: string
          processor_event_id?: string | null
          processor_payment_id?: string | null
          shop_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_invoice_version_id_fkey"
            columns: ["invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_version_id: string
          payment_event_id: string
          payment_method: string | null
          processor_reference: string | null
          receipt_number: string
          received_at: string
          remaining_balance: number
          shop_id: string
          work_order_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id?: string
          invoice_version_id: string
          payment_event_id: string
          payment_method?: string | null
          processor_reference?: string | null
          receipt_number: string
          received_at: string
          remaining_balance: number
          shop_id: string
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_version_id?: string
          payment_event_id?: string
          payment_method?: string | null
          processor_reference?: string | null
          receipt_number?: string
          received_at?: string
          remaining_balance?: number
          shop_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_invoice_version_id_fkey"
            columns: ["invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: true
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_receipts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_receipts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_receipts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payment_receipts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          description: string | null
          id: string
          invoice_version_id: string | null
          metadata: Json
          paid_at: string | null
          payment_event_id: string | null
          platform_fee_cents: number
          shop_id: string
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_connected_account_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          updated_at: string
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          amount?: number
          amount_cents: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          invoice_version_id?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_event_id?: string | null
          platform_fee_cents?: number
          shop_id: string
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          updated_at?: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          amount?: number
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          invoice_version_id?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_event_id?: string | null
          platform_fee_cents?: number
          shop_id?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          updated_at?: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_version_id_fkey"
            columns: ["invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "payments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_employee_mappings: {
        Row: {
          created_at: string
          external_employee_id: string | null
          id: string
          is_active: boolean
          pay_group: string | null
          provider_type: string
          shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_employee_id?: string | null
          id?: string
          is_active?: boolean
          pay_group?: string | null
          provider_type?: string
          shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_employee_id?: string | null
          id?: string
          is_active?: boolean
          pay_group?: string | null
          provider_type?: string
          shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employee_mappings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employee_mappings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employee_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_export_batches: {
        Row: {
          created_at: string
          download_count: number
          exported_at: string | null
          exported_by: string | null
          file_sha256: string | null
          file_size_bytes: number | null
          handoff_status: string
          id: string
          last_downloaded_at: string | null
          last_downloaded_by: string | null
          payload: Json
          period_id: string
          provider_template_version: string | null
          provider_type: string
          row_count: number
          shop_id: string
          status: string
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          download_count?: number
          exported_at?: string | null
          exported_by?: string | null
          file_sha256?: string | null
          file_size_bytes?: number | null
          handoff_status?: string
          id?: string
          last_downloaded_at?: string | null
          last_downloaded_by?: string | null
          payload?: Json
          period_id: string
          provider_template_version?: string | null
          provider_type?: string
          row_count?: number
          shop_id: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          download_count?: number
          exported_at?: string | null
          exported_by?: string | null
          file_sha256?: string | null
          file_size_bytes?: number | null
          handoff_status?: string
          id?: string
          last_downloaded_at?: string | null
          last_downloaded_by?: string | null
          payload?: Json
          period_id?: string
          provider_template_version?: string | null
          provider_type?: string
          row_count?: number
          shop_id?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_export_batches_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_batches_last_downloaded_by_fkey"
            columns: ["last_downloaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_batches_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_batches_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_batches_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_export_rows: {
        Row: {
          batch_id: string
          created_at: string
          employee_external_id: string | null
          id: string
          overtime_hours: number
          period_id: string
          regular_hours: number
          row_payload: Json
          shop_id: string
          total_hours: number
          unpaid_break_hours: number
          user_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          employee_external_id?: string | null
          id?: string
          overtime_hours?: number
          period_id: string
          regular_hours?: number
          row_payload?: Json
          shop_id: string
          total_hours?: number
          unpaid_break_hours?: number
          user_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          employee_external_id?: string | null
          id?: string
          overtime_hours?: number
          period_id?: string
          regular_hours?: number
          row_payload?: Json
          shop_id?: string
          total_hours?: number
          unpaid_break_hours?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_export_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payroll_export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_rows_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_rows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_pay_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          end_date: string
          exported_at: string | null
          exported_by: string | null
          id: string
          locked_at: string | null
          notes: string | null
          period_end: string
          period_start: string
          processed: boolean | null
          shop_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          period_end: string
          period_start: string
          processed?: boolean | null
          shop_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date?: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          period_end?: string
          period_start?: string
          processed?: boolean | null
          shop_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_pay_periods_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_pay_periods_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_pay_periods_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_pay_periods_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_time_entries: {
        Row: {
          adjustment_minutes: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          attendance_minutes: number
          blocking_exception_count: number
          created_at: string
          flagged_minutes: number
          has_exceptions: boolean
          id: string
          job_minutes: number
          overtime_minutes: number
          paid_break_minutes: number
          period_id: string
          regular_minutes: number
          shop_id: string
          source_snapshot: Json
          unpaid_break_minutes: number
          updated_at: string
          user_id: string
          warning_exception_count: number
          work_date: string
          worked_minutes: number
        }
        Insert: {
          adjustment_minutes?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          attendance_minutes?: number
          blocking_exception_count?: number
          created_at?: string
          flagged_minutes?: number
          has_exceptions?: boolean
          id?: string
          job_minutes?: number
          overtime_minutes?: number
          paid_break_minutes?: number
          period_id: string
          regular_minutes?: number
          shop_id: string
          source_snapshot?: Json
          unpaid_break_minutes?: number
          updated_at?: string
          user_id: string
          warning_exception_count?: number
          work_date: string
          worked_minutes?: number
        }
        Update: {
          adjustment_minutes?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          attendance_minutes?: number
          blocking_exception_count?: number
          created_at?: string
          flagged_minutes?: number
          has_exceptions?: boolean
          id?: string
          job_minutes?: number
          overtime_minutes?: number
          paid_break_minutes?: number
          period_id?: string
          regular_minutes?: number
          shop_id?: string
          source_snapshot?: Json
          unpaid_break_minutes?: number
          updated_at?: string
          user_id?: string
          warning_exception_count?: number
          work_date?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_time_exceptions: {
        Row: {
          code: string
          created_at: string
          id: string
          message: string
          period_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          shop_id: string
          source_ref: Json
          source_type: string
          user_id: string
          work_date: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          message: string
          period_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          shop_id: string
          source_ref?: Json
          source_type?: string
          user_id: string
          work_date?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          message?: string
          period_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          shop_id?: string
          source_ref?: Json
          source_type?: string
          user_id?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_time_exceptions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_exceptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_exceptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_time_exceptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_timecards: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string | null
          hours_worked: number | null
          id: string
          shop_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          created_at?: string | null
          hours_worked?: number | null
          id?: string
          shop_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          hours_worked?: number | null
          id?: string
          shop_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_timecards_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_timecards_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_timecards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      people_workforce_profiles: {
        Row: {
          created_at: string
          employment_status: string
          id: string
          notes: string | null
          payroll_ready: boolean
          shop_id: string
          start_date: string | null
          updated_at: string
          user_id: string
          workforce_category: string | null
          workforce_role: string | null
        }
        Insert: {
          created_at?: string
          employment_status?: string
          id?: string
          notes?: string | null
          payroll_ready?: boolean
          shop_id: string
          start_date?: string | null
          updated_at?: string
          user_id: string
          workforce_category?: string | null
          workforce_role?: string | null
        }
        Update: {
          created_at?: string
          employment_status?: string
          id?: string
          notes?: string | null
          payroll_ready?: boolean
          shop_id?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string
          workforce_category?: string | null
          workforce_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_workforce_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_workforce_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_workforce_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_events: {
        Row: {
          content: Json
          created_at: string
          id: string
          kind: string
          run_id: string
          step: number
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          kind: string
          run_id: string
          step: number
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          kind?: string
          run_id?: string
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "planner_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_runs: {
        Row: {
          context: Json
          created_at: string
          goal: string
          id: string
          idempotency_key: string | null
          planner_kind: string
          shop_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          goal: string
          id?: string
          idempotency_key?: string | null
          planner_kind: string
          shop_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          goal?: string
          id?: string
          idempotency_key?: string | null
          planner_kind?: string
          shop_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portal_enrollment_campaigns: {
        Row: {
          active: boolean
          allow_booking: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          print_settings: Json
          rotated_at: string | null
          scan_count: number
          shop_id: string
          slug: string
          updated_at: string
          verified_count: number
        }
        Insert: {
          active?: boolean
          allow_booking?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          print_settings?: Json
          rotated_at?: string | null
          scan_count?: number
          shop_id: string
          slug: string
          updated_at?: string
          verified_count?: number
        }
        Update: {
          active?: boolean
          allow_booking?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          print_settings?: Json
          rotated_at?: string | null
          scan_count?: number
          shop_id?: string
          slug?: string
          updated_at?: string
          verified_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_enrollment_campaigns_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_enrollment_campaigns_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_lifecycle_operation_keys: {
        Row: {
          actor_user_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          operation_key: string
          operation_name: string
          result: Json
          shop_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          operation_key: string
          operation_name: string
          result?: Json
          shop_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          operation_key?: string
          operation_name?: string
          result?: Json
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_lifecycle_operation_keys_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_lifecycle_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_lifecycle_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notifications: {
        Row: {
          body: string | null
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          event_key: string | null
          id: string
          kind: string
          message_id: string | null
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
          work_order_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_key?: string | null
          id?: string
          kind?: string
          message_id?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
          work_order_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_key?: string | null
          id?: string
          kind?: string
          message_id?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_notifications_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "portal_notifications_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "portal_notifications_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "portal_notifications_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "portal_notifications_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_resolution_snapshots: {
        Row: {
          agreement_id: string | null
          base_labor_rate: number
          base_labor_total: number
          base_parts_total: number
          created_at: string
          currency: string
          customer_id: string
          id: string
          input_snapshot: Json
          labor_discount_percent: number
          part_prices: Json
          parts_discount_percent: number
          precedence_rank: number
          quote_line_id: string
          resolution_hash: string
          resolved_at: string
          resolved_by: string
          resolved_labor_rate: number
          resolved_labor_total: number
          resolved_parts_total: number
          result_snapshot: Json
          shop_id: string
          source_type: string
          supersedes_snapshot_id: string | null
          work_order_id: string
        }
        Insert: {
          agreement_id?: string | null
          base_labor_rate: number
          base_labor_total: number
          base_parts_total: number
          created_at?: string
          currency: string
          customer_id: string
          id?: string
          input_snapshot?: Json
          labor_discount_percent: number
          part_prices?: Json
          parts_discount_percent: number
          precedence_rank: number
          quote_line_id: string
          resolution_hash: string
          resolved_at?: string
          resolved_by: string
          resolved_labor_rate: number
          resolved_labor_total: number
          resolved_parts_total: number
          result_snapshot?: Json
          shop_id: string
          source_type: string
          supersedes_snapshot_id?: string | null
          work_order_id: string
        }
        Update: {
          agreement_id?: string | null
          base_labor_rate?: number
          base_labor_total?: number
          base_parts_total?: number
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          input_snapshot?: Json
          labor_discount_percent?: number
          part_prices?: Json
          parts_discount_percent?: number
          precedence_rank?: number
          quote_line_id?: string
          resolution_hash?: string
          resolved_at?: string
          resolved_by?: string
          resolved_labor_rate?: number
          resolved_labor_total?: number
          resolved_parts_total?: number
          result_snapshot?: Json
          shop_id?: string
          source_type?: string
          supersedes_snapshot_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_resolution_snapshots_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "customer_pricing_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_quote_line_id_fkey"
            columns: ["quote_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_quote_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_supersedes_snapshot_id_fkey"
            columns: ["supersedes_snapshot_id"]
            isOneToOne: false
            referencedRelation: "pricing_resolution_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "pricing_resolution_snapshots_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agent_role: string | null
          avatar_url: string | null
          business_name: string | null
          city: string | null
          completed_onboarding: boolean
          created_at: string | null
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          must_change_password: boolean
          organization_id: string | null
          phone: string | null
          plan: Database["public"]["Enums"]["plan_t"] | null
          postal_code: string | null
          province: string | null
          role: string | null
          shop_id: string | null
          shop_name: string | null
          street: string | null
          stripe_checkout_complete: boolean
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tech_signature_hash: string | null
          tech_signature_path: string | null
          tech_signature_updated_at: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          agent_role?: string | null
          avatar_url?: string | null
          business_name?: string | null
          city?: string | null
          completed_onboarding?: boolean
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_active_at?: string | null
          must_change_password?: boolean
          organization_id?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_t"] | null
          postal_code?: string | null
          province?: string | null
          role?: string | null
          shop_id?: string | null
          shop_name?: string | null
          street?: string | null
          stripe_checkout_complete?: boolean
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tech_signature_hash?: string | null
          tech_signature_path?: string | null
          tech_signature_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          agent_role?: string | null
          avatar_url?: string | null
          business_name?: string | null
          city?: string | null
          completed_onboarding?: boolean
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          must_change_password?: boolean
          organization_id?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_t"] | null
          postal_code?: string | null
          province?: string | null
          role?: string | null
          shop_id?: string | null
          shop_name?: string | null
          street?: string | null
          stripe_checkout_complete?: boolean
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tech_signature_hash?: string | null
          tech_signature_path?: string | null
          tech_signature_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profixiq_schema_baselines: {
        Row: {
          applied_at: string
          mode: string
          source_sha256: string
          version: string
        }
        Insert: {
          applied_at?: string
          mode: string
          source_sha256: string
          version: string
        }
        Update: {
          applied_at?: string
          mode?: string
          source_sha256?: string
          version?: string
        }
        Relationships: []
      }
      property_assets: {
        Row: {
          asset_type: string | null
          created_at: string
          id: string
          install_date: string | null
          location_note: string | null
          manufacturer: string | null
          metadata: Json
          model: string | null
          name: string
          next_service_date: string | null
          property_id: string
          serial_number: string | null
          shop_id: string
          status: string
          unit_id: string | null
          updated_at: string
          warranty_expires_on: string | null
        }
        Insert: {
          asset_type?: string | null
          created_at?: string
          id?: string
          install_date?: string | null
          location_note?: string | null
          manufacturer?: string | null
          metadata?: Json
          model?: string | null
          name: string
          next_service_date?: string | null
          property_id: string
          serial_number?: string | null
          shop_id: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          warranty_expires_on?: string | null
        }
        Update: {
          asset_type?: string | null
          created_at?: string
          id?: string
          install_date?: string | null
          location_note?: string | null
          manufacturer?: string | null
          metadata?: Json
          model?: string | null
          name?: string
          next_service_date?: string | null
          property_id?: string
          serial_number?: string | null
          shop_id?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          warranty_expires_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_assets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_assets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
        ]
      }
      property_inspection_signatures: {
        Row: {
          created_at: string
          id: string
          inspection_id: string
          ip_address: unknown
          metadata: Json
          shop_id: string
          signature_image_path: string | null
          signature_text: string | null
          signature_type: string
          signed_at: string
          signer_email: string | null
          signer_name: string
          signer_profile_id: string | null
          signer_role: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inspection_id: string
          ip_address?: unknown
          metadata?: Json
          shop_id: string
          signature_image_path?: string | null
          signature_text?: string | null
          signature_type?: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          signer_profile_id?: string | null
          signer_role: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inspection_id?: string
          ip_address?: unknown
          metadata?: Json
          shop_id?: string
          signature_image_path?: string | null
          signature_text?: string | null
          signature_type?: string
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          signer_profile_id?: string | null
          signer_role?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_inspection_signatures_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "property_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspection_signatures_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspection_signatures_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspection_signatures_signer_profile_id_fkey"
            columns: ["signer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_inspections: {
        Row: {
          completed_at: string | null
          created_at: string
          findings: Json
          id: string
          inspection_type: string
          performed_by_profile_id: string | null
          property_id: string
          shop_id: string
          status: string
          summary: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          findings?: Json
          id?: string
          inspection_type?: string
          performed_by_profile_id?: string | null
          property_id: string
          shop_id: string
          status?: string
          summary?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          findings?: Json
          id?: string
          inspection_type?: string
          performed_by_profile_id?: string | null
          property_id?: string
          shop_id?: string
          status?: string
          summary?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_inspections_performed_by_profile_id_fkey"
            columns: ["performed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
        ]
      }
      property_maintenance_requests: {
        Row: {
          access_notes: string | null
          ai_triage: Json
          asset_id: string | null
          category: string | null
          created_at: string
          id: string
          photos: Json
          preferred_window: string | null
          property_id: string
          requester_profile_id: string | null
          severity: string
          shop_id: string
          source: string
          status: string
          summary: string
          title: string
          unit_id: string | null
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          access_notes?: string | null
          ai_triage?: Json
          asset_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          photos?: Json
          preferred_window?: string | null
          property_id: string
          requester_profile_id?: string | null
          severity?: string
          shop_id: string
          source?: string
          status?: string
          summary: string
          title: string
          unit_id?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          access_notes?: string | null
          ai_triage?: Json
          asset_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          photos?: Json
          preferred_window?: string | null
          property_id?: string
          requester_profile_id?: string | null
          severity?: string
          shop_id?: string
          source?: string
          status?: string
          summary?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_maintenance_requests_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "property_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_requester_profile_id_fkey"
            columns: ["requester_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_maintenance_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      property_members: {
        Row: {
          created_at: string
          id: string
          portfolio_id: string | null
          property_id: string | null
          role: string
          shop_id: string
          unit_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          portfolio_id?: string | null
          property_id?: string | null
          role: string
          shop_id: string
          unit_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          portfolio_id?: string | null
          property_id?: string | null
          role?: string
          shop_id?: string
          unit_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_members_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_members_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_portal_invites: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          created_at: string
          created_by_profile_id: string | null
          expires_at: string
          id: string
          invited_email: string
          invited_name: string | null
          portfolio_id: string | null
          property_id: string | null
          role: string
          shop_id: string
          status: string
          token_hash: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          expires_at: string
          id?: string
          invited_email: string
          invited_name?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          role?: string
          shop_id: string
          status?: string
          token_hash: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          expires_at?: string
          id?: string
          invited_email?: string
          invited_name?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          role?: string
          shop_id?: string
          status?: string
          token_hash?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_portal_invites_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portal_invites_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portal_invites_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portal_invites_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portal_invites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portal_invites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portal_invites_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
        ]
      }
      property_portfolios: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_portfolios_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portfolios_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      property_properties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          portfolio_id: string | null
          postal_code: string | null
          property_type: string | null
          region: string | null
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          portfolio_id?: string | null
          postal_code?: string | null
          property_type?: string | null
          region?: string | null
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          portfolio_id?: string | null
          postal_code?: string | null
          property_type?: string | null
          region?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_properties_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_properties_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_properties_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      property_request_attachments: {
        Row: {
          caption: string | null
          content_type: string | null
          created_at: string
          event_id: string | null
          file_kind: string
          id: string
          metadata: Json
          original_filename: string | null
          request_id: string
          shop_id: string
          size_bytes: number | null
          storage_bucket: string | null
          storage_path: string | null
          uploaded_by_profile_id: string | null
        }
        Insert: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          event_id?: string | null
          file_kind?: string
          id?: string
          metadata?: Json
          original_filename?: string | null
          request_id: string
          shop_id: string
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          uploaded_by_profile_id?: string | null
        }
        Update: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          event_id?: string | null
          file_kind?: string
          id?: string
          metadata?: Json
          original_filename?: string | null
          request_id?: string
          shop_id?: string
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          uploaded_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_request_attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "property_request_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "property_maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_attachments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_attachments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_attachments_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_request_events: {
        Row: {
          actor_profile_id: string | null
          actor_type: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          request_id: string
          shop_id: string
          visibility: string
        }
        Insert: {
          actor_profile_id?: string | null
          actor_type?: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          request_id: string
          shop_id: string
          visibility?: string
        }
        Update: {
          actor_profile_id?: string | null
          actor_type?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          request_id?: string
          shop_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_request_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "property_maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      property_units: {
        Row: {
          access_notes: string | null
          created_at: string
          id: string
          occupancy_status: string | null
          property_id: string
          shop_id: string
          status: string
          unit_label: string
          unit_type: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          created_at?: string
          id?: string
          occupancy_status?: string | null
          property_id: string
          shop_id: string
          status?: string
          unit_label: string
          unit_type?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          created_at?: string
          id?: string
          occupancy_status?: string | null
          property_id?: string
          shop_id?: string
          status?: string
          unit_label?: string
          unit_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_units_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_units_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      property_vendor_assignments: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          request_id: string | null
          scheduled_for: string | null
          shop_id: string
          status: string
          updated_at: string
          vendor_id: string
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          request_id?: string | null
          scheduled_for?: string | null
          shop_id: string
          status?: string
          updated_at?: string
          vendor_id: string
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          request_id?: string | null
          scheduled_for?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
          vendor_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_vendor_assignments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "property_maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "property_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "property_vendor_assignments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      property_vendors: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          metadata: Json
          name: string
          phone: string | null
          shop_id: string
          status: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name: string
          phone?: string | null
          shop_id: string
          status?: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name?: string
          phone?: string | null
          shop_id?: string
          status?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_vendors_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_vendors_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_corrections: {
        Row: {
          actor_profile_id: string
          corrected_timestamp: string
          created_at: string
          event_type: string
          id: string
          original_timestamp: string
          punch_id: string
          reason: string
          shift_id: string
          shop_id: string
          target_user_id: string
        }
        Insert: {
          actor_profile_id: string
          corrected_timestamp: string
          created_at?: string
          event_type: string
          id?: string
          original_timestamp: string
          punch_id: string
          reason: string
          shift_id: string
          shop_id: string
          target_user_id: string
        }
        Update: {
          actor_profile_id?: string
          corrected_timestamp?: string
          created_at?: string
          event_type?: string
          id?: string
          original_timestamp?: string
          punch_id?: string
          reason?: string
          shift_id?: string
          shop_id?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_corrections_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_corrections_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punch_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_corrections_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_corrections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_corrections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_corrections_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          note: string | null
          profile_id: string | null
          shift_id: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          note?: string | null
          profile_id?: string | null
          shift_id?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          note?: string | null
          profile_id?: string | null
          shift_id?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          description: string | null
          id: string
          location_id: string | null
          part_id: string
          po_id: string
          qty_ordered: number
          qty_received: number
          unit_cost: number
        }
        Insert: {
          description?: string | null
          id?: string
          location_id?: string | null
          part_id: string
          po_id: string
          qty_ordered: number
          qty_received?: number
          unit_cost?: number
        }
        Update: {
          description?: string | null
          id?: string
          location_id?: string | null
          part_id?: string
          po_id?: string
          qty_ordered?: number
          qty_received?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "purchase_order_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          cancelled_qty: number
          created_at: string
          description: string | null
          id: string
          idempotency_key: string | null
          location_id: string | null
          part_id: string | null
          part_request_item_id: string | null
          po_id: string
          qty: number
          received_qty: number
          sku: string | null
          unit_cost: number | null
          work_order_part_id: string | null
        }
        Insert: {
          cancelled_qty?: number
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          location_id?: string | null
          part_id?: string | null
          part_request_item_id?: string | null
          po_id: string
          qty: number
          received_qty?: number
          sku?: string | null
          unit_cost?: number | null
          work_order_part_id?: string | null
        }
        Update: {
          cancelled_qty?: number
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          location_id?: string | null
          part_id?: string | null
          part_request_item_id?: string | null
          po_id?: string
          qty?: number
          received_qty?: number
          sku?: string | null
          unit_cost?: number | null
          work_order_part_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_part_request_item_id_fkey"
            columns: ["part_request_item_id"]
            isOneToOne: false
            referencedRelation: "part_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "invoice_net_issued_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "work_order_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_at: string | null
          id: string
          notes: string | null
          ordered_at: string | null
          po_number: string | null
          received_at: string | null
          shipping_total: number | null
          shop_id: string
          status: string
          subtotal: number | null
          supplier_contact_channel: string | null
          supplier_contact_idempotency_key: string | null
          supplier_contacted_at: string | null
          supplier_contacted_by: string | null
          supplier_id: string
          supplier_quote_request_id: string | null
          tax_total: number | null
          total: number | null
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          po_number?: string | null
          received_at?: string | null
          shipping_total?: number | null
          shop_id: string
          status?: string
          subtotal?: number | null
          supplier_contact_channel?: string | null
          supplier_contact_idempotency_key?: string | null
          supplier_contacted_at?: string | null
          supplier_contacted_by?: string | null
          supplier_id: string
          supplier_quote_request_id?: string | null
          tax_total?: number | null
          total?: number | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          po_number?: string | null
          received_at?: string | null
          shipping_total?: number | null
          shop_id?: string
          status?: string
          subtotal?: number | null
          supplier_contact_channel?: string | null
          supplier_contact_idempotency_key?: string | null
          supplier_contacted_at?: string | null
          supplier_contacted_by?: string | null
          supplier_id?: string
          supplier_quote_request_id?: string | null
          tax_total?: number | null
          total?: number | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_quote_request_id_fkey"
            columns: ["supplier_quote_request_id"]
            isOneToOne: false
            referencedRelation: "parts_supplier_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "purchase_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "purchase_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "purchase_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "purchase_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_connections: {
        Row: {
          access_token: string
          access_token_expires_at: string
          connected_at: string
          created_at: string
          created_by: string | null
          environment: string
          id: string
          is_active: boolean
          last_error: string | null
          last_sync_at: string | null
          metadata: Json
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string | null
          shop_id: string
          token_scope: string[]
          token_type: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          connected_at?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          metadata?: Json
          realm_id: string
          refresh_token: string
          refresh_token_expires_at?: string | null
          shop_id: string
          token_scope?: string[]
          token_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          connected_at?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          metadata?: Json
          realm_id?: string
          refresh_token?: string
          refresh_token_expires_at?: string | null
          shop_id?: string
          token_scope?: string[]
          token_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_connections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_connections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_customer_links: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          metadata: Json
          qb_customer_id: string
          qb_sync_token: string | null
          shop_id: string
          sync_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          qb_customer_id: string
          qb_sync_token?: string | null
          shop_id: string
          sync_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          qb_customer_id?: string
          qb_sync_token?: string | null
          shop_id?: string
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_customer_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_customer_links_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_customer_links_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_invoice_links: {
        Row: {
          created_at: string
          external_request_id: string | null
          id: string
          invoice_id: string
          invoice_version_id: string | null
          last_error: string | null
          last_synced_at: string | null
          metadata: Json
          operation_key: string | null
          qb_doc_number: string | null
          qb_invoice_id: string
          qb_sync_token: string | null
          shop_id: string
          sync_status: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          external_request_id?: string | null
          id?: string
          invoice_id: string
          invoice_version_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          operation_key?: string | null
          qb_doc_number?: string | null
          qb_invoice_id: string
          qb_sync_token?: string | null
          shop_id: string
          sync_status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          external_request_id?: string | null
          id?: string
          invoice_id?: string
          invoice_version_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          operation_key?: string | null
          qb_doc_number?: string | null
          qb_invoice_id?: string
          qb_sync_token?: string | null
          shop_id?: string
          sync_status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_invoice_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_invoice_version_id_fkey"
            columns: ["invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quickbooks_invoice_links_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_sync_events: {
        Row: {
          action: string
          connection_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          error_message: string | null
          id: string
          request_payload: Json | null
          response_payload: Json | null
          shop_id: string
          status: string
        }
        Insert: {
          action: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          shop_id: string
          status: string
        }
        Update: {
          action?: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_sync_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "quickbooks_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_sync_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_sync_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_sync_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lifecycle_operation_keys: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          operation_key: string
          operation_name: string
          result: Json
          shop_id: string
          work_order_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key: string
          operation_name: string
          result?: Json
          shop_id: string
          work_order_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key?: string
          operation_name?: string
          result?: Json
          shop_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_lifecycle_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lifecycle_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          item: string | null
          labor_rate: number | null
          labor_time: number | null
          name: string | null
          notes: string | null
          part: Json | null
          part_name: string | null
          part_price: number | null
          parts_cost: number | null
          photo_urls: string[] | null
          price: number | null
          quantity: number | null
          status: string
          title: string
          total: number | null
          updated_at: string | null
          user_id: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          item?: string | null
          labor_rate?: number | null
          labor_time?: number | null
          name?: string | null
          notes?: string | null
          part?: Json | null
          part_name?: string | null
          part_price?: number | null
          parts_cost?: number | null
          photo_urls?: string[] | null
          price?: number | null
          quantity?: number | null
          status: string
          title: string
          total?: number | null
          updated_at?: string | null
          user_id?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          item?: string | null
          labor_rate?: number | null
          labor_time?: number | null
          name?: string | null
          notes?: string | null
          part?: Json | null
          part_name?: string | null
          part_price?: number | null
          parts_cost?: number | null
          photo_urls?: string[] | null
          price?: number | null
          quantity?: number | null
          status?: string
          title?: string
          total?: number | null
          updated_at?: string | null
          user_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_operation_keys: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          operation_key: string
          operation_name: string
          result: Json
          shop_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key: string
          operation_name: string
          result: Json
          shop_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key?: string
          operation_name?: string
          result?: Json
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduler_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduler_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_events: {
        Row: {
          booking_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          metadata: Json
          mode: string
          service_visit_id: string | null
          shop_id: string
          source_id: string | null
          source_kind: string
          starts_at: string
          status: string
          title: string | null
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          metadata?: Json
          mode?: string
          service_visit_id?: string | null
          shop_id: string
          source_id?: string | null
          source_kind?: string
          starts_at: string
          status?: string
          title?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          metadata?: Json
          mode?: string
          service_visit_id?: string | null
          shop_id?: string
          source_id?: string | null
          source_kind?: string
          starts_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_events_service_visit_id_fkey"
            columns: ["service_visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "scheduling_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "scheduling_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "scheduling_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "scheduling_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_reservations: {
        Row: {
          created_at: string
          ends_at: string
          event_id: string
          id: string
          reservation_role: string
          resource_id: string
          shop_id: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          event_id: string
          id?: string
          reservation_role?: string
          resource_id: string
          shop_id: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          event_id?: string
          id?: string
          reservation_role?: string
          resource_id?: string
          shop_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "scheduling_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_reservations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "scheduling_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_reservations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_reservations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_resources: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          is_fallback: boolean
          metadata: Json
          mode: string
          name: string
          profile_id: string | null
          public_bookable: boolean
          resource_type: string
          service_vehicle_id: string | null
          shop_id: string
          sort_order: number
          stock_location_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          is_fallback?: boolean
          metadata?: Json
          mode?: string
          name: string
          profile_id?: string | null
          public_bookable?: boolean
          resource_type: string
          service_vehicle_id?: string | null
          shop_id: string
          sort_order?: number
          stock_location_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          is_fallback?: boolean
          metadata?: Json
          mode?: string
          name?: string
          profile_id?: string | null
          public_bookable?: boolean
          resource_type?: string
          service_vehicle_id?: string | null
          shop_id?: string
          sort_order?: number
          stock_location_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_resources_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_resources_service_vehicle_id_fkey"
            columns: ["service_vehicle_id"]
            isOneToOne: false
            referencedRelation: "service_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_resources_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_resources_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_resources_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_addresses: {
        Row: {
          access_notes: string | null
          address_line1: string
          address_line2: string | null
          city: string | null
          country_code: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          label: string | null
          latitude: number | null
          longitude: number | null
          postal_code: string | null
          province_state: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          address_line1: string
          address_line2?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          province_state?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          address_line1?: string
          address_line2?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          province_state?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_addresses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_addresses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      service_vehicles: {
        Row: {
          active: boolean
          capabilities: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          primary_user_id: string | null
          shop_id: string
          stock_location_id: string | null
          unit_number: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          primary_user_id?: string | null
          shop_id: string
          stock_location_id?: string | null
          unit_number?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          primary_user_id?: string | null
          shop_id?: string
          stock_location_id?: string | null
          unit_number?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_vehicles_primary_user_id_fkey"
            columns: ["primary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vehicles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vehicles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vehicles_stock_location_id_fkey"
            columns: ["stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visit_events: {
        Row: {
          actor_user_id: string | null
          assigned_user_id: string | null
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          occurred_at: string
          service_vehicle_id: string | null
          service_visit_id: string
          shop_id: string
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          assigned_user_id?: string | null
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          service_vehicle_id?: string | null
          service_visit_id: string
          shop_id: string
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          assigned_user_id?: string | null
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          service_vehicle_id?: string | null
          service_visit_id?: string
          shop_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_visit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_events_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_events_service_vehicle_id_fkey"
            columns: ["service_vehicle_id"]
            isOneToOne: false
            referencedRelation: "service_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_events_service_visit_id_fkey"
            columns: ["service_visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visits: {
        Row: {
          actual_distance_km: number | null
          actual_travel_minutes: number | null
          arrived_at: string | null
          assigned_user_id: string | null
          booking_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          dispatch_notes: string | null
          dispatched_at: string | null
          estimated_distance_km: number | null
          estimated_travel_minutes: number | null
          id: string
          last_status_at: string | null
          last_status_by: string | null
          lifecycle_metadata: Json
          mode: string
          paused_at: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_address_id: string | null
          service_vehicle_id: string | null
          shop_id: string
          status: string
          travel_started_at: string | null
          updated_at: string
          version: number
          work_order_id: string | null
          work_started_at: string | null
        }
        Insert: {
          actual_distance_km?: number | null
          actual_travel_minutes?: number | null
          arrived_at?: string | null
          assigned_user_id?: string | null
          booking_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_notes?: string | null
          dispatched_at?: string | null
          estimated_distance_km?: number | null
          estimated_travel_minutes?: number | null
          id?: string
          last_status_at?: string | null
          last_status_by?: string | null
          lifecycle_metadata?: Json
          mode?: string
          paused_at?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_address_id?: string | null
          service_vehicle_id?: string | null
          shop_id: string
          status?: string
          travel_started_at?: string | null
          updated_at?: string
          version?: number
          work_order_id?: string | null
          work_started_at?: string | null
        }
        Update: {
          actual_distance_km?: number | null
          actual_travel_minutes?: number | null
          arrived_at?: string | null
          assigned_user_id?: string | null
          booking_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_notes?: string | null
          dispatched_at?: string | null
          estimated_distance_km?: number | null
          estimated_travel_minutes?: number | null
          id?: string
          last_status_at?: string | null
          last_status_by?: string | null
          lifecycle_metadata?: Json
          mode?: string
          paused_at?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_address_id?: string | null
          service_vehicle_id?: string | null
          shop_id?: string
          status?: string
          travel_started_at?: string | null
          updated_at?: string
          version?: number
          work_order_id?: string | null
          work_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_visits_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_last_status_by_fkey"
            columns: ["last_status_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_service_address_id_fkey"
            columns: ["service_address_id"]
            isOneToOne: false
            referencedRelation: "service_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_service_vehicle_id_fkey"
            columns: ["service_vehicle_id"]
            isOneToOne: false
            referencedRelation: "service_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "service_visits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "service_visits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "service_visits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "service_visits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_corrections: {
        Row: {
          actor_profile_id: string
          applied_at: string
          corrected_data: Json
          correction_type: string
          created_at: string
          id: string
          original_data: Json
          payroll_rebuild_status: string
          reason: string
          shift_id: string | null
          shop_id: string
          status: string
          target_user_id: string
        }
        Insert: {
          actor_profile_id: string
          applied_at?: string
          corrected_data?: Json
          correction_type: string
          created_at?: string
          id?: string
          original_data?: Json
          payroll_rebuild_status?: string
          reason: string
          shift_id?: string | null
          shop_id: string
          status?: string
          target_user_id: string
        }
        Update: {
          actor_profile_id?: string
          applied_at?: string
          corrected_data?: Json
          correction_type?: string
          created_at?: string
          id?: string
          original_data?: Json
          payroll_rebuild_status?: string
          reason?: string
          shift_id?: string | null
          shop_id?: string
          status?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_corrections_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_corrections_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_corrections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_corrections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_corrections_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_ai_profiles: {
        Row: {
          last_refreshed_at: string
          shop_id: string
          summary: Json
        }
        Insert: {
          last_refreshed_at?: string
          shop_id: string
          summary: Json
        }
        Update: {
          last_refreshed_at?: string
          shop_id?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shop_ai_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_ai_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_assistant_actions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          domain: string
          error: Json | null
          execution_finished_at: string | null
          execution_started_at: string | null
          expires_at: string
          id: string
          idempotency_key: string
          input: Json
          preview: Json
          requested_by: string
          result: Json | null
          risk: string
          shop_id: string
          status: string
          target_versions: Json
          thread_id: string
          tool_name: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          domain: string
          error?: Json | null
          execution_finished_at?: string | null
          execution_started_at?: string | null
          expires_at: string
          id?: string
          idempotency_key: string
          input?: Json
          preview?: Json
          requested_by: string
          result?: Json | null
          risk: string
          shop_id: string
          status?: string
          target_versions?: Json
          thread_id: string
          tool_name: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          domain?: string
          error?: Json | null
          execution_finished_at?: string | null
          execution_started_at?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string
          input?: Json
          preview?: Json
          requested_by?: string
          result?: Json | null
          risk?: string
          shop_id?: string
          status?: string
          target_versions?: Json
          thread_id?: string
          tool_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_assistant_actions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "shop_assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_assistant_messages: {
        Row: {
          client_message_id: string | null
          content: string
          created_at: string
          id: string
          kind: string
          payload: Json
          role: string
          shop_id: string
          thread_id: string
          user_id: string | null
        }
        Insert: {
          client_message_id?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          role: string
          shop_id: string
          thread_id: string
          user_id?: string | null
        }
        Update: {
          client_message_id?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          role?: string
          shop_id?: string
          thread_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "shop_assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_assistant_threads: {
        Row: {
          archived_at: string | null
          context: Json
          created_at: string
          id: string
          last_message_at: string
          shop_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          context?: Json
          created_at?: string
          id?: string
          last_message_at?: string
          shop_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          context?: Json
          created_at?: string
          id?: string
          last_message_at?: string
          shop_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shop_boost_import_provenance: {
        Row: {
          created_at: string
          domain: string
          id: string
          intake_id: string
          record_id: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          intake_id: string
          record_id: string
          shop_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          intake_id?: string
          record_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_import_provenance_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_import_provenance_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_boost_import_provenance_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_import_provenance_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_boost_import_reset_audit_events: {
        Row: {
          actor_user_id: string
          confirmation_text: string
          created_at: string
          deleted_counts: Json
          id: string
          intake_id: string | null
          mode: string
          preview_counts: Json
          scope: string
          shop_id: string
        }
        Insert: {
          actor_user_id: string
          confirmation_text: string
          created_at?: string
          deleted_counts?: Json
          id?: string
          intake_id?: string | null
          mode: string
          preview_counts?: Json
          scope: string
          shop_id: string
        }
        Update: {
          actor_user_id?: string
          confirmation_text?: string
          created_at?: string
          deleted_counts?: Json
          id?: string
          intake_id?: string | null
          mode?: string
          preview_counts?: Json
          scope?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_import_reset_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_import_reset_audit_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_import_reset_audit_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_boost_import_reset_audit_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_import_reset_audit_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_boost_intakes: {
        Row: {
          created_at: string
          created_by: string | null
          customers_file_path: string | null
          history_file_path: string | null
          id: string
          import_counts: Json | null
          intake_basics: Json | null
          parse_summary: Json | null
          parts_file_path: string | null
          processed_at: string | null
          questionnaire: Json
          shop_id: string
          source: string | null
          source_system_guess: string | null
          staff_file_path: string | null
          status: string
          upload_status: string | null
          vehicles_file_path: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customers_file_path?: string | null
          history_file_path?: string | null
          id?: string
          import_counts?: Json | null
          intake_basics?: Json | null
          parse_summary?: Json | null
          parts_file_path?: string | null
          processed_at?: string | null
          questionnaire: Json
          shop_id: string
          source?: string | null
          source_system_guess?: string | null
          staff_file_path?: string | null
          status?: string
          upload_status?: string | null
          vehicles_file_path?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customers_file_path?: string | null
          history_file_path?: string | null
          id?: string
          import_counts?: Json | null
          intake_basics?: Json | null
          parse_summary?: Json | null
          parts_file_path?: string | null
          processed_at?: string | null
          questionnaire?: Json
          shop_id?: string
          source?: string | null
          source_system_guess?: string | null
          staff_file_path?: string | null
          status?: string
          upload_status?: string | null
          vehicles_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_intakes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_intakes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_boost_integrity_reports: {
        Row: {
          blocking_issues_count: number
          checks: Json
          created_at: string
          graph_ready: boolean
          id: string
          intake_id: string
          shop_id: string
          status: string
          warnings_count: number
        }
        Insert: {
          blocking_issues_count?: number
          checks?: Json
          created_at?: string
          graph_ready?: boolean
          id?: string
          intake_id: string
          shop_id: string
          status: string
          warnings_count?: number
        }
        Update: {
          blocking_issues_count?: number
          checks?: Json
          created_at?: string
          graph_ready?: boolean
          id?: string
          intake_id?: string
          shop_id?: string
          status?: string
          warnings_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_integrity_reports_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_integrity_reports_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_boost_integrity_reports_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_integrity_reports_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_boost_review_audit_events: {
        Row: {
          action_taken: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          followed_recommendation: boolean | null
          id: string
          intake_id: string
          materialization_status: string | null
          metadata: Json
          recommendation: Json
          review_item_id: string
          shop_id: string
        }
        Insert: {
          action_taken?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          followed_recommendation?: boolean | null
          id?: string
          intake_id: string
          materialization_status?: string | null
          metadata?: Json
          recommendation?: Json
          review_item_id: string
          shop_id: string
        }
        Update: {
          action_taken?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          followed_recommendation?: boolean | null
          id?: string
          intake_id?: string
          materialization_status?: string | null
          metadata?: Json
          recommendation?: Json
          review_item_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_review_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_review_audit_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_review_audit_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_boost_review_audit_events_review_item_id_fkey"
            columns: ["review_item_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_review_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_review_audit_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_review_audit_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_boost_review_items: {
        Row: {
          blocking_reason: string | null
          candidate_targets: Json
          cluster_confidence: number | null
          cluster_key: string | null
          created_at: string
          dependency_refs: Json
          domain: string
          downstream_impact_count: number
          id: string
          ignore_note: string | null
          ignore_reason_code: string | null
          ignored_at: string | null
          intake_id: string
          issue_type: string
          materialization_error: string | null
          materialized_at: string | null
          materialized_record: Json
          normalized_payload: Json
          raw_payload: Json
          recommendation_confidence: number | null
          recommendation_followed: boolean | null
          recommendation_generated_at: string | null
          recommendation_reason: string | null
          recommendation_seen_at: string | null
          recommended_action: string | null
          resolution_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          shop_id: string
          status: string
          suggested_matches: Json
          summary: string
          target_domain: string | null
          updated_at: string
        }
        Insert: {
          blocking_reason?: string | null
          candidate_targets?: Json
          cluster_confidence?: number | null
          cluster_key?: string | null
          created_at?: string
          dependency_refs?: Json
          domain: string
          downstream_impact_count?: number
          id?: string
          ignore_note?: string | null
          ignore_reason_code?: string | null
          ignored_at?: string | null
          intake_id: string
          issue_type: string
          materialization_error?: string | null
          materialized_at?: string | null
          materialized_record?: Json
          normalized_payload?: Json
          raw_payload?: Json
          recommendation_confidence?: number | null
          recommendation_followed?: boolean | null
          recommendation_generated_at?: string | null
          recommendation_reason?: string | null
          recommendation_seen_at?: string | null
          recommended_action?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shop_id: string
          status?: string
          suggested_matches?: Json
          summary: string
          target_domain?: string | null
          updated_at?: string
        }
        Update: {
          blocking_reason?: string | null
          candidate_targets?: Json
          cluster_confidence?: number | null
          cluster_key?: string | null
          created_at?: string
          dependency_refs?: Json
          domain?: string
          downstream_impact_count?: number
          id?: string
          ignore_note?: string | null
          ignore_reason_code?: string | null
          ignored_at?: string | null
          intake_id?: string
          issue_type?: string
          materialization_error?: string | null
          materialized_at?: string | null
          materialized_record?: Json
          normalized_payload?: Json
          raw_payload?: Json
          recommendation_confidence?: number | null
          recommendation_followed?: boolean | null
          recommendation_generated_at?: string | null
          recommendation_reason?: string | null
          recommendation_seen_at?: string | null
          recommended_action?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shop_id?: string
          status?: string
          suggested_matches?: Json
          summary?: string
          target_domain?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_review_items_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_review_items_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_boost_review_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_review_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_review_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_boost_row_results: {
        Row: {
          cluster_confidence: number | null
          cluster_key: string | null
          created_at: string
          error_reason: string | null
          id: string
          intake_id: string
          match_confidence: number
          match_details: Json
          match_status: string
          normalized_payload: Json
          raw_payload: Json
          review_required: boolean
          shop_id: string
          source_file: string
          source_row_index: number
          target_domain: string
          updated_at: string
        }
        Insert: {
          cluster_confidence?: number | null
          cluster_key?: string | null
          created_at?: string
          error_reason?: string | null
          id?: string
          intake_id: string
          match_confidence?: number
          match_details?: Json
          match_status: string
          normalized_payload?: Json
          raw_payload?: Json
          review_required?: boolean
          shop_id: string
          source_file: string
          source_row_index: number
          target_domain: string
          updated_at?: string
        }
        Update: {
          cluster_confidence?: number | null
          cluster_key?: string | null
          created_at?: string
          error_reason?: string | null
          id?: string
          intake_id?: string
          match_confidence?: number
          match_details?: Json
          match_status?: string
          normalized_payload?: Json
          raw_payload?: Json
          review_required?: boolean
          shop_id?: string
          source_file?: string
          source_row_index?: number
          target_domain?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_row_results_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_row_results_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_boost_row_results_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_row_results_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_brand_assets: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_url: string | null
          generation_prompt: string | null
          generation_provider: string | null
          height: number | null
          id: string
          is_active: boolean
          is_favorite: boolean
          kind: Database["public"]["Enums"]["brand_asset_kind"]
          metadata: Json
          mime_type: string | null
          shop_id: string
          source_app: Database["public"]["Enums"]["brand_source_app"]
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          generation_prompt?: string | null
          generation_provider?: string | null
          height?: number | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          kind: Database["public"]["Enums"]["brand_asset_kind"]
          metadata?: Json
          mime_type?: string | null
          shop_id: string
          source_app?: Database["public"]["Enums"]["brand_source_app"]
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          generation_prompt?: string | null
          generation_provider?: string | null
          height?: number | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          kind?: Database["public"]["Enums"]["brand_asset_kind"]
          metadata?: Json
          mime_type?: string | null
          shop_id?: string
          source_app?: Database["public"]["Enums"]["brand_source_app"]
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_brand_assets_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_brand_profiles: {
        Row: {
          accent_color: string | null
          app_background: string | null
          app_background_secondary: string | null
          button_primary_bg: string | null
          button_primary_text: string | null
          button_secondary_bg: string | null
          button_secondary_text: string | null
          card_background: string | null
          card_border: string | null
          card_border_color: string | null
          created_at: string
          header_background: string | null
          header_text: string | null
          icon_asset_id: string | null
          input_background: string | null
          input_border: string | null
          input_text: string | null
          logo_asset_id: string | null
          metadata: Json
          page_background: string | null
          primary_color: string | null
          radius_scale: string | null
          secondary_color: string | null
          shadow_style: string | null
          shop_id: string
          sidebar_active_background: string | null
          sidebar_active_text: string | null
          sidebar_background: string | null
          sidebar_color: string | null
          sidebar_text: string | null
          style_preset: string | null
          surface_2_background: string | null
          surface_color: string | null
          surface_color_2: string | null
          text_muted: string | null
          text_primary: string | null
          text_secondary: string | null
          theme_mode: string | null
          topbar_color: string | null
          updated_at: string
          updated_by: string | null
          watermark_asset_id: string | null
          wordmark_asset_id: string | null
        }
        Insert: {
          accent_color?: string | null
          app_background?: string | null
          app_background_secondary?: string | null
          button_primary_bg?: string | null
          button_primary_text?: string | null
          button_secondary_bg?: string | null
          button_secondary_text?: string | null
          card_background?: string | null
          card_border?: string | null
          card_border_color?: string | null
          created_at?: string
          header_background?: string | null
          header_text?: string | null
          icon_asset_id?: string | null
          input_background?: string | null
          input_border?: string | null
          input_text?: string | null
          logo_asset_id?: string | null
          metadata?: Json
          page_background?: string | null
          primary_color?: string | null
          radius_scale?: string | null
          secondary_color?: string | null
          shadow_style?: string | null
          shop_id: string
          sidebar_active_background?: string | null
          sidebar_active_text?: string | null
          sidebar_background?: string | null
          sidebar_color?: string | null
          sidebar_text?: string | null
          style_preset?: string | null
          surface_2_background?: string | null
          surface_color?: string | null
          surface_color_2?: string | null
          text_muted?: string | null
          text_primary?: string | null
          text_secondary?: string | null
          theme_mode?: string | null
          topbar_color?: string | null
          updated_at?: string
          updated_by?: string | null
          watermark_asset_id?: string | null
          wordmark_asset_id?: string | null
        }
        Update: {
          accent_color?: string | null
          app_background?: string | null
          app_background_secondary?: string | null
          button_primary_bg?: string | null
          button_primary_text?: string | null
          button_secondary_bg?: string | null
          button_secondary_text?: string | null
          card_background?: string | null
          card_border?: string | null
          card_border_color?: string | null
          created_at?: string
          header_background?: string | null
          header_text?: string | null
          icon_asset_id?: string | null
          input_background?: string | null
          input_border?: string | null
          input_text?: string | null
          logo_asset_id?: string | null
          metadata?: Json
          page_background?: string | null
          primary_color?: string | null
          radius_scale?: string | null
          secondary_color?: string | null
          shadow_style?: string | null
          shop_id?: string
          sidebar_active_background?: string | null
          sidebar_active_text?: string | null
          sidebar_background?: string | null
          sidebar_color?: string | null
          sidebar_text?: string | null
          style_preset?: string | null
          surface_2_background?: string | null
          surface_color?: string | null
          surface_color_2?: string | null
          text_muted?: string | null
          text_primary?: string | null
          text_secondary?: string | null
          theme_mode?: string | null
          topbar_color?: string | null
          updated_at?: string
          updated_by?: string | null
          watermark_asset_id?: string | null
          wordmark_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_brand_profiles_icon_asset_id_fkey"
            columns: ["icon_asset_id"]
            isOneToOne: false
            referencedRelation: "shop_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_profiles_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "shop_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_profiles_watermark_asset_id_fkey"
            columns: ["watermark_asset_id"]
            isOneToOne: false
            referencedRelation: "shop_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_brand_profiles_wordmark_asset_id_fkey"
            columns: ["wordmark_asset_id"]
            isOneToOne: false
            referencedRelation: "shop_brand_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_health_snapshots: {
        Row: {
          created_at: string
          id: string
          intake_id: string | null
          metrics: Json
          narrative_summary: string | null
          period_end: string | null
          period_start: string | null
          scores: Json
          shop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intake_id?: string | null
          metrics?: Json
          narrative_summary?: string | null
          period_end?: string | null
          period_start?: string | null
          scores?: Json
          shop_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intake_id?: string | null
          metrics?: Json
          narrative_summary?: string | null
          period_end?: string | null
          period_start?: string | null
          scores?: Json
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_health_snapshots_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_health_snapshots_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_health_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_health_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_hours: {
        Row: {
          close_time: string
          id: string
          open_time: string
          shop_id: string | null
          weekday: number
        }
        Insert: {
          close_time: string
          id?: string
          open_time: string
          shop_id?: string | null
          weekday: number
        }
        Update: {
          close_time?: string
          id?: string
          open_time?: string
          shop_id?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_hours_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_hours_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_import_files: {
        Row: {
          created_at: string
          id: string
          intake_id: string
          kind: string
          original_filename: string | null
          parsed_row_count: number | null
          sha256: string | null
          status: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          intake_id: string
          kind: string
          original_filename?: string | null
          parsed_row_count?: number | null
          sha256?: string | null
          status?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          intake_id?: string
          kind?: string
          original_filename?: string | null
          parsed_row_count?: number | null
          sha256?: string | null
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_import_files_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_import_files_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
        ]
      }
      shop_import_rows: {
        Row: {
          created_at: string
          entity_type: string | null
          errors: string[]
          file_id: string | null
          id: string
          intake_id: string
          normalized: Json
          original_headers: Json | null
          parse_status: string | null
          parse_warnings: Json | null
          raw: Json
          raw_payload: Json | null
          row_number: number | null
          shop_id: string | null
        }
        Insert: {
          created_at?: string
          entity_type?: string | null
          errors?: string[]
          file_id?: string | null
          id?: string
          intake_id: string
          normalized?: Json
          original_headers?: Json | null
          parse_status?: string | null
          parse_warnings?: Json | null
          raw?: Json
          raw_payload?: Json | null
          row_number?: number | null
          shop_id?: string | null
        }
        Update: {
          created_at?: string
          entity_type?: string | null
          errors?: string[]
          file_id?: string | null
          id?: string
          intake_id?: string
          normalized?: Json
          original_headers?: Json | null
          parse_status?: string | null
          parse_warnings?: Json | null
          raw?: Json
          raw_payload?: Json | null
          row_number?: number | null
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_import_rows_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "shop_import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_import_rows_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_import_rows_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_import_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_import_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_maintenance_service_map: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          is_active: boolean
          label_override: string | null
          match_source: string
          menu_item_id: string | null
          menu_repair_item_id: string | null
          service_code: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          label_override?: string | null
          match_source?: string
          menu_item_id?: string | null
          menu_repair_item_id?: string | null
          service_code: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          label_override?: string | null
          match_source?: string
          menu_item_id?: string | null
          menu_repair_item_id?: string | null
          service_code?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_maintenance_service_map_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_maintenance_service_map_menu_repair_item_id_fkey"
            columns: ["menu_repair_item_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_maintenance_service_map_service_code_fkey"
            columns: ["service_code"]
            isOneToOne: false
            referencedRelation: "maintenance_services"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "shop_maintenance_service_map_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_maintenance_service_map_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_members: {
        Row: {
          created_at: string
          created_by: string | null
          role: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_onboarding_activation_rules: {
        Row: {
          auto_activate: boolean
          created_at: string
          enabled: boolean
          id: string
          max_failed_ratio: number
          max_pending_review_ratio: number
          min_customer_rows: number
          min_vehicle_rows: number
          require_canonical_status_ok: boolean
          require_zero_integrity_errors: boolean
          shop_id: string
          updated_at: string
        }
        Insert: {
          auto_activate?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          max_failed_ratio?: number
          max_pending_review_ratio?: number
          min_customer_rows?: number
          min_vehicle_rows?: number
          require_canonical_status_ok?: boolean
          require_zero_integrity_errors?: boolean
          shop_id: string
          updated_at?: string
        }
        Update: {
          auto_activate?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          max_failed_ratio?: number
          max_pending_review_ratio?: number
          min_customer_rows?: number
          min_vehicle_rows?: number
          require_canonical_status_ok?: boolean
          require_zero_integrity_errors?: boolean
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_onboarding_activation_rules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_activation_rules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_onboarding_attempts: {
        Row: {
          completed_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          job_id: string
          logs: Json
          metrics: Json
          run_id: string
          started_at: string
          status: string
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          logs?: Json
          metrics?: Json
          run_id: string
          started_at?: string
          status?: string
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          logs?: Json
          metrics?: Json
          run_id?: string
          started_at?: string
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_onboarding_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "shop_onboarding_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "shop_onboarding_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_onboarding_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          depends_on_job_id: string | null
          domain: string | null
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          intake_id: string
          job_type: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          result: Json
          retry_after: string | null
          run_id: string
          shop_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          depends_on_job_id?: string | null
          domain?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          intake_id: string
          job_type: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json
          retry_after?: string | null
          run_id: string
          shop_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          depends_on_job_id?: string | null
          domain?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          intake_id?: string
          job_type?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json
          retry_after?: string | null
          run_id?: string
          shop_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_onboarding_jobs_depends_on_job_id_fkey"
            columns: ["depends_on_job_id"]
            isOneToOne: false
            referencedRelation: "shop_onboarding_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_jobs_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_jobs_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_onboarding_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "shop_onboarding_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_onboarding_runs: {
        Row: {
          activation_blockers: Json
          activation_snapshot: Json
          activation_status: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          intake_id: string
          lock_token: string | null
          locked_at: string | null
          max_attempts: number
          metrics: Json
          orchestrator_version: string
          retry_after: string | null
          shop_id: string
          started_at: string | null
          state: string
          trigger_source: string
          updated_at: string
        }
        Insert: {
          activation_blockers?: Json
          activation_snapshot?: Json
          activation_status?: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          intake_id: string
          lock_token?: string | null
          locked_at?: string | null
          max_attempts?: number
          metrics?: Json
          orchestrator_version?: string
          retry_after?: string | null
          shop_id: string
          started_at?: string | null
          state?: string
          trigger_source?: string
          updated_at?: string
        }
        Update: {
          activation_blockers?: Json
          activation_snapshot?: Json
          activation_status?: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          intake_id?: string
          lock_token?: string | null
          locked_at?: string | null
          max_attempts?: number
          metrics?: Json
          orchestrator_version?: string
          retry_after?: string | null
          shop_id?: string
          started_at?: string | null
          state?: string
          trigger_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_onboarding_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_runs_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_runs_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_onboarding_runs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_runs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_parts: {
        Row: {
          created_at: string | null
          id: string
          location: string | null
          part_id: string | null
          quantity: number
          restock_threshold: number | null
          shop_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          location?: string | null
          part_id?: string | null
          quantity?: number
          restock_threshold?: number | null
          shop_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          location?: string | null
          part_id?: string | null
          quantity?: number
          restock_threshold?: number | null
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "shop_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_parts_import_match_candidates: {
        Row: {
          candidate_part_id: string | null
          confidence: number
          created_at: string
          id: string
          metadata: Json
          rank: number
          reason: string | null
          shop_id: string
          staging_row_id: string
        }
        Insert: {
          candidate_part_id?: string | null
          confidence: number
          created_at?: string
          id?: string
          metadata?: Json
          rank?: number
          reason?: string | null
          shop_id: string
          staging_row_id: string
        }
        Update: {
          candidate_part_id?: string | null
          confidence?: number
          created_at?: string
          id?: string
          metadata?: Json
          rank?: number
          reason?: string | null
          shop_id?: string
          staging_row_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_parts_import_match_candidates_candidate_part_id_fkey"
            columns: ["candidate_part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "shop_parts_import_match_candidates_candidate_part_id_fkey"
            columns: ["candidate_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_import_match_candidates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_import_match_candidates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_import_match_candidates_staging_row_id_fkey"
            columns: ["staging_row_id"]
            isOneToOne: false
            referencedRelation: "shop_parts_import_staging"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_parts_import_staging: {
        Row: {
          auto_promote: boolean
          cost: number | null
          created_at: string
          id: string
          intake_id: string
          mapped_category: string | null
          match_reason: string | null
          matched_part_id: string | null
          normalized_brand: string | null
          normalized_name: string | null
          normalized_name_key: string | null
          normalized_part_number: string | null
          normalized_sku: string | null
          normalized_vendor: string | null
          pack_info: string | null
          price: number | null
          promoted_at: string | null
          quantity_on_hand: number | null
          raw_echo: Json
          raw_row_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shop_id: string
          source_confidence: number | null
          source_system: string | null
          status: string
          suggested_action: string | null
          unit_of_measure: string | null
          updated_at: string
          warnings: Json
        }
        Insert: {
          auto_promote?: boolean
          cost?: number | null
          created_at?: string
          id?: string
          intake_id: string
          mapped_category?: string | null
          match_reason?: string | null
          matched_part_id?: string | null
          normalized_brand?: string | null
          normalized_name?: string | null
          normalized_name_key?: string | null
          normalized_part_number?: string | null
          normalized_sku?: string | null
          normalized_vendor?: string | null
          pack_info?: string | null
          price?: number | null
          promoted_at?: string | null
          quantity_on_hand?: number | null
          raw_echo?: Json
          raw_row_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_id: string
          source_confidence?: number | null
          source_system?: string | null
          status?: string
          suggested_action?: string | null
          unit_of_measure?: string | null
          updated_at?: string
          warnings?: Json
        }
        Update: {
          auto_promote?: boolean
          cost?: number | null
          created_at?: string
          id?: string
          intake_id?: string
          mapped_category?: string | null
          match_reason?: string | null
          matched_part_id?: string | null
          normalized_brand?: string | null
          normalized_name?: string | null
          normalized_name_key?: string | null
          normalized_part_number?: string | null
          normalized_sku?: string | null
          normalized_vendor?: string | null
          pack_info?: string | null
          price?: number | null
          promoted_at?: string | null
          quantity_on_hand?: number | null
          raw_echo?: Json
          raw_row_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_id?: string
          source_confidence?: number | null
          source_system?: string | null
          status?: string
          suggested_action?: string | null
          unit_of_measure?: string | null
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shop_parts_import_staging_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_import_staging_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_parts_import_staging_matched_part_id_fkey"
            columns: ["matched_part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "shop_parts_import_staging_matched_part_id_fkey"
            columns: ["matched_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_import_staging_raw_row_id_fkey"
            columns: ["raw_row_id"]
            isOneToOne: false
            referencedRelation: "shop_import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_import_staging_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_import_staging_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_parts_source_aliases: {
        Row: {
          alias_type: string
          created_at: string
          id: string
          intake_id: string | null
          legacy_label: string | null
          legacy_part_number: string | null
          legacy_sku: string | null
          metadata: Json
          part_id: string
          raw_row_id: string | null
          shop_id: string
          source_hash: string | null
          source_system: string | null
          staging_row_id: string | null
          updated_at: string
          vendor_alias: string | null
        }
        Insert: {
          alias_type?: string
          created_at?: string
          id?: string
          intake_id?: string | null
          legacy_label?: string | null
          legacy_part_number?: string | null
          legacy_sku?: string | null
          metadata?: Json
          part_id: string
          raw_row_id?: string | null
          shop_id: string
          source_hash?: string | null
          source_system?: string | null
          staging_row_id?: string | null
          updated_at?: string
          vendor_alias?: string | null
        }
        Update: {
          alias_type?: string
          created_at?: string
          id?: string
          intake_id?: string | null
          legacy_label?: string | null
          legacy_part_number?: string | null
          legacy_sku?: string | null
          metadata?: Json
          part_id?: string
          raw_row_id?: string | null
          shop_id?: string
          source_hash?: string | null
          source_system?: string | null
          staging_row_id?: string | null
          updated_at?: string
          vendor_alias?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_parts_source_aliases_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_source_aliases_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_parts_source_aliases_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "shop_parts_source_aliases_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_source_aliases_raw_row_id_fkey"
            columns: ["raw_row_id"]
            isOneToOne: false
            referencedRelation: "shop_import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_source_aliases_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_source_aliases_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_parts_source_aliases_staging_row_id_fkey"
            columns: ["staging_row_id"]
            isOneToOne: false
            referencedRelation: "shop_parts_import_staging"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_payment_settings: {
        Row: {
          allow_partial_payments: boolean
          created_at: string
          default_currency: string
          default_deposit_percent: number
          minimum_payment_cents: number
          platform_fee_bps: number
          portal_payments_enabled: boolean
          receipt_email_enabled: boolean
          require_payment_before_release: boolean
          shop_id: string
          updated_at: string
        }
        Insert: {
          allow_partial_payments?: boolean
          created_at?: string
          default_currency?: string
          default_deposit_percent?: number
          minimum_payment_cents?: number
          platform_fee_bps?: number
          portal_payments_enabled?: boolean
          receipt_email_enabled?: boolean
          require_payment_before_release?: boolean
          shop_id: string
          updated_at?: string
        }
        Update: {
          allow_partial_payments?: boolean
          created_at?: string
          default_currency?: string
          default_deposit_percent?: number
          minimum_payment_cents?: number
          platform_fee_bps?: number
          portal_payments_enabled?: boolean
          receipt_email_enabled?: boolean
          require_payment_before_release?: boolean
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_payment_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_payment_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_payroll_settings: {
        Row: {
          breaks_are_paid: boolean
          cadence: string
          created_at: string
          daily_overtime_after_minutes: number
          default_lunch_duration_minutes: number
          enabled: boolean
          id: string
          lunch_is_paid: boolean
          lunch_required_after_minutes: number
          paid_break_duration_minutes: number
          paid_breaks_per_day: number
          period_anchor_date: string | null
          shop_id: string
          suspicious_shift_minutes: number
          updated_at: string
          week_starts_on: number
          weekly_overtime_after_minutes: number
        }
        Insert: {
          breaks_are_paid?: boolean
          cadence?: string
          created_at?: string
          daily_overtime_after_minutes?: number
          default_lunch_duration_minutes?: number
          enabled?: boolean
          id?: string
          lunch_is_paid?: boolean
          lunch_required_after_minutes?: number
          paid_break_duration_minutes?: number
          paid_breaks_per_day?: number
          period_anchor_date?: string | null
          shop_id: string
          suspicious_shift_minutes?: number
          updated_at?: string
          week_starts_on?: number
          weekly_overtime_after_minutes?: number
        }
        Update: {
          breaks_are_paid?: boolean
          cadence?: string
          created_at?: string
          daily_overtime_after_minutes?: number
          default_lunch_duration_minutes?: number
          enabled?: boolean
          id?: string
          lunch_is_paid?: boolean
          lunch_required_after_minutes?: number
          paid_break_duration_minutes?: number
          paid_breaks_per_day?: number
          period_anchor_date?: string | null
          shop_id?: string
          suspicious_shift_minutes?: number
          updated_at?: string
          week_starts_on?: number
          weekly_overtime_after_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_payroll_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_payroll_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          email: string | null
          hours: Json | null
          images: string[] | null
          latitude: number | null
          longitude: number | null
          phone: string | null
          postal_code: string | null
          province: string | null
          shop_id: string
          tagline: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          hours?: Json | null
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          shop_id: string
          tagline?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          hours?: Json | null
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          shop_id?: string
          tagline?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_ratings: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          score: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          score: number
          shop_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          score?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_ratings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_ratings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_ratings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_public: boolean
          public_name: string | null
          rating: number
          replied_at: string | null
          reviewer_user_id: string
          shop_id: string
          shop_owner_reply: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_public?: boolean
          public_name?: string | null
          rating: number
          replied_at?: string | null
          reviewer_user_id: string
          shop_id: string
          shop_owner_reply?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_public?: boolean
          public_name?: string | null
          rating?: number
          replied_at?: string | null
          reviewer_user_id?: string
          shop_id?: string
          shop_owner_reply?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_role_capability_policies: {
        Row: {
          capability_key: string
          changed_by_profile_id: string | null
          created_at: string
          effect: string
          id: string
          role_key: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          capability_key: string
          changed_by_profile_id?: string | null
          created_at?: string
          effect: string
          id?: string
          role_key: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          capability_key?: string
          changed_by_profile_id?: string | null
          created_at?: string
          effect?: string
          id?: string
          role_key?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_role_capability_policies_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "workspace_capabilities"
            referencedColumns: ["capability_key"]
          },
          {
            foreignKeyName: "shop_role_capability_policies_changed_by_profile_id_fkey"
            columns: ["changed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_role_capability_policies_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_role_capability_policies_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_schedules: {
        Row: {
          booked_by: string | null
          created_at: string | null
          date: string
          id: string
          is_booked: boolean | null
          shop_id: string | null
          time_slot: string
        }
        Insert: {
          booked_by?: string | null
          created_at?: string | null
          date: string
          id?: string
          is_booked?: boolean | null
          shop_id?: string | null
          time_slot: string
        }
        Update: {
          booked_by?: string | null
          created_at?: string | null
          date?: string
          id?: string
          is_booked?: boolean | null
          shop_id?: string | null
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_schedules_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "customer_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          allow_customer_quotes: boolean | null
          allow_self_booking: boolean | null
          created_at: string | null
          id: string
          pricing_refresh_days: number | null
          province: string | null
          timezone: string | null
          user_id: string | null
        }
        Insert: {
          allow_customer_quotes?: boolean | null
          allow_self_booking?: boolean | null
          created_at?: string | null
          id?: string
          pricing_refresh_days?: number | null
          province?: string | null
          timezone?: string | null
          user_id?: string | null
        }
        Update: {
          allow_customer_quotes?: boolean | null
          allow_self_booking?: boolean | null
          created_at?: string | null
          id?: string
          pricing_refresh_days?: number | null
          province?: string | null
          timezone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shop_time_off: {
        Row: {
          ends_at: string
          id: string
          reason: string | null
          shop_id: string | null
          starts_at: string
        }
        Insert: {
          ends_at: string
          id?: string
          reason?: string | null
          shop_id?: string | null
          starts_at: string
        }
        Update: {
          ends_at?: string
          id?: string
          reason?: string | null
          shop_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_time_off_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_time_off_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_time_slots: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          is_booked: boolean | null
          shop_id: string | null
          start_time: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          is_booked?: boolean | null
          shop_id?: string | null
          start_time: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          is_booked?: boolean | null
          shop_id?: string | null
          start_time?: string
        }
        Relationships: []
      }
      shop_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: string
          shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_users_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_users_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_vehicle_menu_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          shop_id: string
          vehicle_menu_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          shop_id: string
          vehicle_menu_id: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          shop_id?: string
          vehicle_menu_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_vehicle_menu_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_vehicle_menu_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_vehicle_menu_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_vehicle_menu_items_vehicle_menu_id_fkey"
            columns: ["vehicle_menu_id"]
            isOneToOne: false
            referencedRelation: "vehicle_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_drafts: {
        Row: {
          angle: string | null
          created_at: string
          created_by: string | null
          id: string
          opportunity_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          script: string | null
          shop_id: string
          status: Database["public"]["Enums"]["shopreel_draft_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          angle?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          script?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["shopreel_draft_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          angle?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          script?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["shopreel_draft_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_drafts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "shopreel_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_drafts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_drafts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_drafts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_event_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_key: string
          event_type: string
          http_status: number | null
          id: string
          integration_id: string | null
          payload: Json
          request_url: string
          response_body: string | null
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_key: string
          event_type: string
          http_status?: number | null
          id?: string
          integration_id?: string | null
          payload?: Json
          request_url: string
          response_body?: string | null
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_key?: string
          event_type?: string
          http_status?: number | null
          id?: string
          integration_id?: string | null
          payload?: Json
          request_url?: string
          response_body?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_event_deliveries_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "shopreel_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_event_deliveries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_event_deliveries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_integrations: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          enabled_event_types: string[]
          id: string
          last_error_at: string | null
          last_error_message: string | null
          last_success_at: string | null
          last_tested_at: string | null
          remote_shop_id: string | null
          shop_id: string
          shopreel_base_url: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          enabled_event_types?: string[]
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_tested_at?: string | null
          remote_shop_id?: string | null
          shop_id: string
          shopreel_base_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          enabled_event_types?: string[]
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_tested_at?: string | null
          remote_shop_id?: string | null
          shop_id?: string
          shopreel_base_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_integrations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_integrations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_integrations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_manual_assets: {
        Row: {
          asset_type: string
          content_goal: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          metadata_json: Json
          note: string | null
          platform_targets: string[]
          primary_file_url: string | null
          shop_id: string
          source_type: string
          status: string
          tags: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          asset_type: string
          content_goal?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata_json?: Json
          note?: string | null
          platform_targets?: string[]
          primary_file_url?: string | null
          shop_id: string
          source_type?: string
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          content_goal?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata_json?: Json
          note?: string | null
          platform_targets?: string[]
          primary_file_url?: string | null
          shop_id?: string
          source_type?: string
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_manual_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_manual_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_opportunities: {
        Row: {
          accepted_at: string | null
          acted_by: string | null
          angle: string | null
          created_at: string
          dismissed_at: string | null
          event_type: string
          first_generated_at: string | null
          generated_at: string | null
          id: string
          shop_id: string
          source_occurred_at: string
          status: Database["public"]["Enums"]["shopreel_opportunity_status"]
          story_source_id: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          acted_by?: string | null
          angle?: string | null
          created_at?: string
          dismissed_at?: string | null
          event_type: string
          first_generated_at?: string | null
          generated_at?: string | null
          id?: string
          shop_id: string
          source_occurred_at: string
          status?: Database["public"]["Enums"]["shopreel_opportunity_status"]
          story_source_id: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          acted_by?: string | null
          angle?: string | null
          created_at?: string
          dismissed_at?: string | null
          event_type?: string
          first_generated_at?: string | null
          generated_at?: string | null
          id?: string
          shop_id?: string
          source_occurred_at?: string
          status?: Database["public"]["Enums"]["shopreel_opportunity_status"]
          story_source_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_opportunities_acted_by_fkey"
            columns: ["acted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_opportunities_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_opportunities_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_opportunities_story_source_id_fkey"
            columns: ["story_source_id"]
            isOneToOne: true
            referencedRelation: "shopreel_story_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_opportunity_status_history: {
        Row: {
          action:
            | Database["public"]["Enums"]["shopreel_opportunity_action"]
            | null
          changed_at: string
          changed_by: string | null
          id: string
          next_status: Database["public"]["Enums"]["shopreel_opportunity_status"]
          note: string | null
          opportunity_id: string
          previous_status:
            | Database["public"]["Enums"]["shopreel_opportunity_status"]
            | null
          shop_id: string
        }
        Insert: {
          action?:
            | Database["public"]["Enums"]["shopreel_opportunity_action"]
            | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          next_status: Database["public"]["Enums"]["shopreel_opportunity_status"]
          note?: string | null
          opportunity_id: string
          previous_status?:
            | Database["public"]["Enums"]["shopreel_opportunity_status"]
            | null
          shop_id: string
        }
        Update: {
          action?:
            | Database["public"]["Enums"]["shopreel_opportunity_action"]
            | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          next_status?: Database["public"]["Enums"]["shopreel_opportunity_status"]
          note?: string | null
          opportunity_id?: string
          previous_status?:
            | Database["public"]["Enums"]["shopreel_opportunity_status"]
            | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_opportunity_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_opportunity_status_history_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "shopreel_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_opportunity_status_history_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_opportunity_status_history_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_publications: {
        Row: {
          attempt_count: number
          caption_override: string | null
          connection_id: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          external_post_id: string | null
          external_url: string | null
          id: string
          platform: string
          publish_payload_json: Json
          published_at: string | null
          response_json: Json
          scheduled_for: string | null
          shop_id: string
          status: string
          title_override: string | null
          updated_at: string
          video_id: string | null
        }
        Insert: {
          attempt_count?: number
          caption_override?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          platform: string
          publish_payload_json?: Json
          published_at?: string | null
          response_json?: Json
          scheduled_for?: string | null
          shop_id: string
          status?: string
          title_override?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          attempt_count?: number
          caption_override?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          platform?: string
          publish_payload_json?: Json
          published_at?: string | null
          response_json?: Json
          scheduled_for?: string | null
          shop_id?: string
          status?: string
          title_override?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_publications_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "shopreel_social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_publications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_publications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_publications_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_publish_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          publication_id: string
          run_after: string
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          publication_id: string
          run_after?: string
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          publication_id?: string
          run_after?: string
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_publish_jobs_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "content_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_publish_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_publish_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shopreel_social_connections: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          connection_active: boolean | null
          created_at: string | null
          id: string
          meta_instagram_business_id: string | null
          meta_page_id: string | null
          meta_page_name: string | null
          metadata_json: Json
          platform: string
          refresh_token: string | null
          scopes: string[]
          shop_id: string
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          connection_active?: boolean | null
          created_at?: string | null
          id?: string
          meta_instagram_business_id?: string | null
          meta_page_id?: string | null
          meta_page_name?: string | null
          metadata_json?: Json
          platform: string
          refresh_token?: string | null
          scopes?: string[]
          shop_id: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          connection_active?: boolean | null
          created_at?: string | null
          id?: string
          meta_instagram_business_id?: string | null
          meta_page_id?: string | null
          meta_page_name?: string | null
          metadata_json?: Json
          platform?: string
          refresh_token?: string | null
          scopes?: string[]
          shop_id?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      shopreel_story_sources: {
        Row: {
          created_at: string
          event_key: string
          event_type: string
          id: string
          ingest_status: string
          ingested_at: string
          occurred_at: string
          payload: Json
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_key: string
          event_type: string
          id?: string
          ingest_status?: string
          ingested_at?: string
          occurred_at: string
          payload?: Json
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          ingest_status?: string
          ingested_at?: string
          occurred_at?: string
          payload?: Json
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_story_sources_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_story_sources_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          accepts_online_booking: boolean | null
          active_user_count: number | null
          address: string | null
          auto_generate_pdf: boolean | null
          auto_send_quote_email: boolean | null
          billable_user_count: number
          billing_entitlement_override: string | null
          billing_entitlement_updated_at: string
          billing_grace_until: string | null
          business_name: string | null
          city: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          default_stock_location_id: string | null
          diagnostic_fee: number | null
          email: string | null
          email_on_complete: boolean | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          images: string[] | null
          invoice_footer: string | null
          invoice_terms: string | null
          labor_rate: number | null
          location_type: string
          logo_url: string | null
          max_lead_days: number | null
          max_users: number | null
          menu_repair_pricing_valid_days: number
          min_notice_minutes: number | null
          name: string | null
          organization_id: string | null
          owner_id: string
          owner_pin: string | null
          owner_pin_hash: string | null
          phone_number: string | null
          pin: string | null
          plan: string | null
          postal_code: string | null
          province: string | null
          rating: number | null
          require_authorization: boolean | null
          require_cause_correction: boolean | null
          shop_name: string | null
          shop_supplies_cap_amount: number | null
          shop_supplies_enabled: boolean | null
          shop_supplies_flat_amount: number | null
          shop_supplies_percent: number | null
          shop_supplies_type: string | null
          slug: string | null
          street: string | null
          stripe_account_id: string | null
          stripe_billing_sync_error: string | null
          stripe_billing_sync_required: boolean
          stripe_billing_synced_at: string | null
          stripe_charges_enabled: boolean
          stripe_checkout_session_id: string | null
          stripe_connect_charge_model: string | null
          stripe_connect_dashboard_type: string | null
          stripe_connect_fees_collector: string | null
          stripe_connect_losses_collector: string | null
          stripe_current_period_end: string | null
          stripe_customer_id: string | null
          stripe_default_currency: string
          stripe_details_submitted: boolean
          stripe_onboarding_completed: boolean
          stripe_payouts_enabled: boolean
          stripe_platform_fee_bps: number
          stripe_pricing_model: string
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          stripe_trial_end: string | null
          subscription_package: string | null
          supplies_percent: number | null
          tax_rate: number | null
          timezone: string | null
          updated_at: string | null
          use_ai: boolean | null
          user_limit: number | null
        }
        Insert: {
          accepts_online_booking?: boolean | null
          active_user_count?: number | null
          address?: string | null
          auto_generate_pdf?: boolean | null
          auto_send_quote_email?: boolean | null
          billable_user_count?: number
          billing_entitlement_override?: string | null
          billing_entitlement_updated_at?: string
          billing_grace_until?: string | null
          business_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          default_stock_location_id?: string | null
          diagnostic_fee?: number | null
          email?: string | null
          email_on_complete?: boolean | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          images?: string[] | null
          invoice_footer?: string | null
          invoice_terms?: string | null
          labor_rate?: number | null
          location_type?: string
          logo_url?: string | null
          max_lead_days?: number | null
          max_users?: number | null
          menu_repair_pricing_valid_days?: number
          min_notice_minutes?: number | null
          name?: string | null
          organization_id?: string | null
          owner_id: string
          owner_pin?: string | null
          owner_pin_hash?: string | null
          phone_number?: string | null
          pin?: string | null
          plan?: string | null
          postal_code?: string | null
          province?: string | null
          rating?: number | null
          require_authorization?: boolean | null
          require_cause_correction?: boolean | null
          shop_name?: string | null
          shop_supplies_cap_amount?: number | null
          shop_supplies_enabled?: boolean | null
          shop_supplies_flat_amount?: number | null
          shop_supplies_percent?: number | null
          shop_supplies_type?: string | null
          slug?: string | null
          street?: string | null
          stripe_account_id?: string | null
          stripe_billing_sync_error?: string | null
          stripe_billing_sync_required?: boolean
          stripe_billing_synced_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_checkout_session_id?: string | null
          stripe_connect_charge_model?: string | null
          stripe_connect_dashboard_type?: string | null
          stripe_connect_fees_collector?: string | null
          stripe_connect_losses_collector?: string | null
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_default_currency?: string
          stripe_details_submitted?: boolean
          stripe_onboarding_completed?: boolean
          stripe_payouts_enabled?: boolean
          stripe_platform_fee_bps?: number
          stripe_pricing_model?: string
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          stripe_trial_end?: string | null
          subscription_package?: string | null
          supplies_percent?: number | null
          tax_rate?: number | null
          timezone?: string | null
          updated_at?: string | null
          use_ai?: boolean | null
          user_limit?: number | null
        }
        Update: {
          accepts_online_booking?: boolean | null
          active_user_count?: number | null
          address?: string | null
          auto_generate_pdf?: boolean | null
          auto_send_quote_email?: boolean | null
          billable_user_count?: number
          billing_entitlement_override?: string | null
          billing_entitlement_updated_at?: string
          billing_grace_until?: string | null
          business_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          default_stock_location_id?: string | null
          diagnostic_fee?: number | null
          email?: string | null
          email_on_complete?: boolean | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          images?: string[] | null
          invoice_footer?: string | null
          invoice_terms?: string | null
          labor_rate?: number | null
          location_type?: string
          logo_url?: string | null
          max_lead_days?: number | null
          max_users?: number | null
          menu_repair_pricing_valid_days?: number
          min_notice_minutes?: number | null
          name?: string | null
          organization_id?: string | null
          owner_id?: string
          owner_pin?: string | null
          owner_pin_hash?: string | null
          phone_number?: string | null
          pin?: string | null
          plan?: string | null
          postal_code?: string | null
          province?: string | null
          rating?: number | null
          require_authorization?: boolean | null
          require_cause_correction?: boolean | null
          shop_name?: string | null
          shop_supplies_cap_amount?: number | null
          shop_supplies_enabled?: boolean | null
          shop_supplies_flat_amount?: number | null
          shop_supplies_percent?: number | null
          shop_supplies_type?: string | null
          slug?: string | null
          street?: string | null
          stripe_account_id?: string | null
          stripe_billing_sync_error?: string | null
          stripe_billing_sync_required?: boolean
          stripe_billing_synced_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_checkout_session_id?: string | null
          stripe_connect_charge_model?: string | null
          stripe_connect_dashboard_type?: string | null
          stripe_connect_fees_collector?: string | null
          stripe_connect_losses_collector?: string | null
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_default_currency?: string
          stripe_details_submitted?: boolean
          stripe_onboarding_completed?: boolean
          stripe_payouts_enabled?: boolean
          stripe_platform_fee_bps?: number
          stripe_pricing_model?: string
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          stripe_trial_end?: string | null
          subscription_package?: string | null
          supplies_percent?: number | null
          tax_rate?: number | null
          timezone?: string | null
          updated_at?: string | null
          use_ai?: boolean | null
          user_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shops_owner_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_availability_blocks: {
        Row: {
          block_type: string
          created_at: string
          ends_at: string
          id: string
          label: string | null
          shop_id: string
          source_id: string | null
          source_type: string
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          block_type: string
          created_at?: string
          ends_at: string
          id?: string
          label?: string | null
          shop_id: string
          source_id?: string | null
          source_type: string
          starts_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          block_type?: string
          created_at?: string
          ends_at?: string
          id?: string
          label?: string | null
          shop_id?: string
          source_id?: string | null
          source_type?: string
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_blocks_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_blocks_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_capability_overrides: {
        Row: {
          capability_key: string
          changed_by_profile_id: string | null
          created_at: string
          effect: string
          id: string
          profile_id: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          capability_key: string
          changed_by_profile_id?: string | null
          created_at?: string
          effect: string
          id?: string
          profile_id: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          capability_key?: string
          changed_by_profile_id?: string | null
          created_at?: string
          effect?: string
          id?: string
          profile_id?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_capability_overrides_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "workspace_capabilities"
            referencedColumns: ["capability_key"]
          },
          {
            foreignKeyName: "staff_capability_overrides_changed_by_profile_id_fkey"
            columns: ["changed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_capability_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_capability_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_capability_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_certifications: {
        Row: {
          cert_name: string
          cert_number: string | null
          cert_type: string
          created_at: string
          expiry_date: string | null
          id: string
          issue_date: string | null
          issuing_body: string | null
          notes: string | null
          shop_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cert_name: string
          cert_number?: string | null
          cert_type?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_body?: string | null
          notes?: string | null
          shop_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cert_name?: string
          cert_number?: string | null
          cert_type?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_body?: string | null
          notes?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_certifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_certifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_certifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invite_candidates: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          created_profile_id: string | null
          created_user_id: string | null
          email: string | null
          email_lc: string | null
          error: string | null
          full_name: string | null
          id: string
          intake_id: string | null
          notes: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role_enum"] | null
          shop_id: string
          source: string
          status: string
          updated_at: string
          username: string | null
          username_lc: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          created_profile_id?: string | null
          created_user_id?: string | null
          email?: string | null
          email_lc?: string | null
          error?: string | null
          full_name?: string | null
          id?: string
          intake_id?: string | null
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role_enum"] | null
          shop_id: string
          source?: string
          status?: string
          updated_at?: string
          username?: string | null
          username_lc?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          created_profile_id?: string | null
          created_user_id?: string | null
          email?: string | null
          email_lc?: string | null
          error?: string | null
          full_name?: string | null
          id?: string
          intake_id?: string | null
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role_enum"] | null
          shop_id?: string
          source?: string
          status?: string
          updated_at?: string
          username?: string | null
          username_lc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invite_candidates_created_profile_id_fkey"
            columns: ["created_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invite_candidates_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invite_candidates_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "staff_invite_candidates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invite_candidates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invite_suggestions: {
        Row: {
          count_suggested: number
          created_at: string
          email: string | null
          external_id: string | null
          full_name: string | null
          id: string
          intake_id: string | null
          notes: string | null
          role: string
          shop_id: string
        }
        Insert: {
          count_suggested?: number
          created_at?: string
          email?: string | null
          external_id?: string | null
          full_name?: string | null
          id?: string
          intake_id?: string | null
          notes?: string | null
          role: string
          shop_id: string
        }
        Update: {
          count_suggested?: number
          created_at?: string
          email?: string | null
          external_id?: string | null
          full_name?: string | null
          id?: string
          intake_id?: string | null
          notes?: string | null
          role?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invite_suggestions_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invite_suggestions_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "staff_invite_suggestions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invite_suggestions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedule_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          notes: string | null
          schedule_date: string
          shop_id: string
          source_type: string
          start_time: string | null
          status: string
          unpaid_break_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          schedule_date: string
          shop_id: string
          source_type?: string
          start_time?: string | null
          status?: string
          unpaid_break_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          schedule_date?: string
          shop_id?: string
          source_type?: string
          start_time?: string | null
          status?: string
          unpaid_break_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedule_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedule_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedule_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedule_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedule_templates: {
        Row: {
          created_at: string
          day_of_week: number
          effective_from: string | null
          effective_to: string | null
          end_time: string | null
          id: string
          is_working_day: boolean
          shop_id: string
          start_time: string | null
          unpaid_break_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string | null
          id?: string
          is_working_day?: boolean
          shop_id: string
          start_time?: string | null
          unpaid_break_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string | null
          id?: string
          is_working_day?: boolean
          shop_id?: string
          start_time?: string | null
          unpaid_break_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedule_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedule_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedule_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off_requests: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_partial_day: boolean
          reason: string | null
          request_type: string
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shop_id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_partial_day?: boolean
          reason?: string | null
          request_type: string
          requested_at?: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_id: string
          starts_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_partial_day?: boolean
          reason?: string | null
          request_type?: string
          requested_at?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          code: string
          id: string
          name: string
          shop_id: string
        }
        Insert: {
          code: string
          id?: string
          name: string
          shop_id: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
          shop_id?: string
        }
        Relationships: []
      }
      stock_moves: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          lifecycle_quantity: number
          location_id: string
          metadata: Json
          part_id: string
          part_request_item_id: string | null
          purchase_order_line_id: string | null
          qty_change: number
          reason: Database["public"]["Enums"]["stock_move_reason"]
          reference_id: string | null
          reference_kind: string | null
          shop_id: string
          work_order_part_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          lifecycle_quantity?: number
          location_id: string
          metadata?: Json
          part_id: string
          part_request_item_id?: string | null
          purchase_order_line_id?: string | null
          qty_change: number
          reason: Database["public"]["Enums"]["stock_move_reason"]
          reference_id?: string | null
          reference_kind?: string | null
          shop_id: string
          work_order_part_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          lifecycle_quantity?: number
          location_id?: string
          metadata?: Json
          part_id?: string
          part_request_item_id?: string | null
          purchase_order_line_id?: string | null
          qty_change?: number
          reason?: Database["public"]["Enums"]["stock_move_reason"]
          reference_id?: string | null
          reference_kind?: string | null
          shop_id?: string
          work_order_part_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_moves_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "stock_moves_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_part_request_item_id_fkey"
            columns: ["part_request_item_id"]
            isOneToOne: false
            referencedRelation: "part_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_shop_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_shop_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "invoice_net_issued_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_work_order_part_id_fkey"
            columns: ["work_order_part_id"]
            isOneToOne: false
            referencedRelation: "work_order_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_catalog_items: {
        Row: {
          brand: string | null
          compatibility: Json | null
          cost: number | null
          description: string | null
          external_sku: string
          id: string
          price: number | null
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          compatibility?: Json | null
          cost?: number | null
          description?: string | null
          external_sku: string
          id?: string
          price?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          compatibility?: Json | null
          cost?: number | null
          description?: string | null
          external_sku?: string
          id?: string
          price?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_catalog_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parts_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quote_batch_rows: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          mapped_confidence: number | null
          mapped_menu_repair_item_id: string | null
          mapped_menu_repair_item_part_id: string | null
          raw_description: string | null
          raw_notes: string | null
          raw_part_number: string | null
          raw_qty: number | null
          raw_sell: number | null
          raw_unit_cost: number | null
          review_status: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          mapped_confidence?: number | null
          mapped_menu_repair_item_id?: string | null
          mapped_menu_repair_item_part_id?: string | null
          raw_description?: string | null
          raw_notes?: string | null
          raw_part_number?: string | null
          raw_qty?: number | null
          raw_sell?: number | null
          raw_unit_cost?: number | null
          review_status?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          mapped_confidence?: number | null
          mapped_menu_repair_item_id?: string | null
          mapped_menu_repair_item_part_id?: string | null
          raw_description?: string | null
          raw_notes?: string | null
          raw_part_number?: string | null
          raw_qty?: number | null
          raw_sell?: number | null
          raw_unit_cost?: number | null
          review_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_batch_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "supplier_quote_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quote_batches: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          processed_at: string | null
          shop_id: string
          source_type: string
          status: string
          storage_path: string | null
          supplier_id: string | null
          supplier_name: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          processed_at?: string | null
          shop_id: string
          source_type?: string
          status?: string
          storage_path?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          processed_at?: string | null
          shop_id?: string
          source_type?: string
          status?: string
          storage_path?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_batches_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_batches_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          account_no: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          shop_id: string
        }
        Insert: {
          account_no?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          shop_id: string
        }
        Update: {
          account_no?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          shop_id?: string
        }
        Relationships: []
      }
      system_lifecycle_operation_keys: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          operation_key: string
          operation_name: string
          result: Json
          shop_id: string
          work_order_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key: string
          operation_name: string
          result?: Json
          shop_id: string
          work_order_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key?: string
          operation_name?: string
          result?: Json
          shop_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_lifecycle_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_lifecycle_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "system_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "system_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "system_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "system_lifecycle_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_sessions: {
        Row: {
          ended_at: string | null
          id: string
          inspection_id: string | null
          shift_id: string | null
          shop_id: string | null
          started_at: string | null
          user_id: string | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          inspection_id?: string | null
          shift_id?: string | null
          shop_id?: string | null
          started_at?: string | null
          user_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          inspection_id?: string | null
          shift_id?: string | null
          shop_id?: string | null
          started_at?: string | null
          user_id?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_sessions_shift_fk"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sessions_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sessions_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sessions_wol_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sessions_wol_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tech_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tech_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tech_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tech_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_shifts: {
        Row: {
          created_at: string | null
          end_time: string | null
          excluded_from_payroll: boolean
          id: string
          shop_id: string | null
          start_time: string
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          excluded_from_payroll?: boolean
          id?: string
          shop_id?: string | null
          start_time?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          excluded_from_payroll?: boolean
          id?: string
          shop_id?: string | null
          start_time?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_shifts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_shifts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_items: {
        Row: {
          id: string
          input_type: string | null
          label: string | null
          section: string | null
          template_id: string | null
        }
        Insert: {
          id?: string
          input_type?: string | null
          label?: string | null
          section?: string | null
          template_id?: string | null
        }
        Update: {
          id?: string
          input_type?: string | null
          label?: string | null
          section?: string | null
          template_id?: string | null
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          feature: string | null
          id: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          feature?: string | null
          id?: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          feature?: string | null
          id?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_app_layouts: {
        Row: {
          id: string
          layout: Json
          updated_at: string | null
          user_id: string
          wallpaper: string | null
        }
        Insert: {
          id?: string
          layout: Json
          updated_at?: string | null
          user_id: string
          wallpaper?: string | null
        }
        Update: {
          id?: string
          layout?: Json
          updated_at?: string | null
          user_id?: string
          wallpaper?: string | null
        }
        Relationships: []
      }
      user_plans: {
        Row: {
          created_at: string | null
          features: Json | null
          id: string
          plan_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          id?: string
          plan_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          id?: string
          plan_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_theme_preferences: {
        Row: {
          radius_scale: string | null
          shadow_style: string | null
          shop_id: string
          theme_mode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          radius_scale?: string | null
          shadow_style?: string | null
          shop_id: string
          theme_mode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          radius_scale?: string | null
          shadow_style?: string | null
          shop_id?: string
          theme_mode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_theme_preferences_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_theme_preferences_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_theme_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_widget_layouts: {
        Row: {
          id: string
          layout: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          layout: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          layout?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vehicle_media: {
        Row: {
          created_at: string | null
          filename: string | null
          id: string
          shop_id: string | null
          storage_path: string
          type: string
          uploaded_by: string | null
          url: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string | null
          filename?: string | null
          id?: string
          shop_id?: string | null
          storage_path: string
          type: string
          uploaded_by?: string | null
          url?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string | null
          filename?: string | null
          id?: string
          shop_id?: string | null
          storage_path?: string
          type?: string
          uploaded_by?: string | null
          url?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_media_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_media_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_media_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_menus: {
        Row: {
          created_at: string
          default_labor_hours: number | null
          default_parts: Json
          engine_family: string | null
          id: string
          make: string
          model: string
          service_code: string
          updated_at: string
          year_from: number
          year_to: number
        }
        Insert: {
          created_at?: string
          default_labor_hours?: number | null
          default_parts: Json
          engine_family?: string | null
          id?: string
          make: string
          model: string
          service_code: string
          updated_at?: string
          year_from: number
          year_to: number
        }
        Update: {
          created_at?: string
          default_labor_hours?: number | null
          default_parts?: Json
          engine_family?: string | null
          id?: string
          make?: string
          model?: string
          service_code?: string
          updated_at?: string
          year_from?: number
          year_to?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_menus_service_code_fkey"
            columns: ["service_code"]
            isOneToOne: false
            referencedRelation: "maintenance_services"
            referencedColumns: ["code"]
          },
        ]
      }
      vehicle_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          shop_id: string | null
          uploaded_by: string | null
          url: string
          vehicle_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          shop_id?: string | null
          uploaded_by?: string | null
          url: string
          vehicle_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          shop_id?: string | null
          uploaded_by?: string | null
          url?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_photos_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_photos_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_photos_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_recall_fetch_limits: {
        Row: {
          request_count: number
          scope: string
          shop_id: string
          subject_id: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          request_count?: number
          scope: string
          shop_id: string
          subject_id: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          request_count?: number
          scope?: string
          shop_id?: string
          subject_id?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_recall_fetch_limits_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_recall_fetch_limits_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_recalls: {
        Row: {
          campaign_number: string
          component: string | null
          consequence: string | null
          created_at: string
          id: string
          make: string | null
          manufacturer: string | null
          model: string | null
          model_year: string | null
          nhtsa_campaign: string | null
          notes: string | null
          remedy: string | null
          report_date: string | null
          report_received_date: string | null
          shop_id: string | null
          summary: string | null
          user_id: string | null
          vehicle_id: string | null
          vin: string
        }
        Insert: {
          campaign_number: string
          component?: string | null
          consequence?: string | null
          created_at?: string
          id?: string
          make?: string | null
          manufacturer?: string | null
          model?: string | null
          model_year?: string | null
          nhtsa_campaign?: string | null
          notes?: string | null
          remedy?: string | null
          report_date?: string | null
          report_received_date?: string | null
          shop_id?: string | null
          summary?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          vin: string
        }
        Update: {
          campaign_number?: string
          component?: string | null
          consequence?: string | null
          created_at?: string
          id?: string
          make?: string | null
          manufacturer?: string | null
          model?: string | null
          model_year?: string | null
          nhtsa_campaign?: string | null
          notes?: string | null
          remedy?: string | null
          report_date?: string | null
          report_received_date?: string | null
          shop_id?: string | null
          summary?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          vin?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_recalls_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_recalls_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_recalls_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_recalls_vehicle_shop_fkey"
            columns: ["vehicle_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      vehicles: {
        Row: {
          asset_type: string | null
          body_type: string | null
          color: string | null
          created_at: string | null
          customer_id: string | null
          drivetrain: string | null
          engine: string | null
          engine_family: string | null
          engine_hours: number | null
          engine_type: string | null
          external_id: string | null
          fuel_type: string | null
          id: string
          import_confidence: number | null
          import_notes: string | null
          in_service_date: string | null
          last_service_date: string | null
          license_plate: string | null
          make: string | null
          mileage: string | null
          model: string | null
          notes: string | null
          odometer_unit: string | null
          purchase_date: string | null
          shop_id: string | null
          source_intake_id: string | null
          source_row_id: string | null
          state_province: string | null
          status: string | null
          submodel: string | null
          tags: string | null
          transmission: string | null
          transmission_type: string | null
          unit_number: string | null
          user_id: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          asset_type?: string | null
          body_type?: string | null
          color?: string | null
          created_at?: string | null
          customer_id?: string | null
          drivetrain?: string | null
          engine?: string | null
          engine_family?: string | null
          engine_hours?: number | null
          engine_type?: string | null
          external_id?: string | null
          fuel_type?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          in_service_date?: string | null
          last_service_date?: string | null
          license_plate?: string | null
          make?: string | null
          mileage?: string | null
          model?: string | null
          notes?: string | null
          odometer_unit?: string | null
          purchase_date?: string | null
          shop_id?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          state_province?: string | null
          status?: string | null
          submodel?: string | null
          tags?: string | null
          transmission?: string | null
          transmission_type?: string | null
          unit_number?: string | null
          user_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          asset_type?: string | null
          body_type?: string | null
          color?: string | null
          created_at?: string | null
          customer_id?: string | null
          drivetrain?: string | null
          engine?: string | null
          engine_family?: string | null
          engine_hours?: number | null
          engine_type?: string | null
          external_id?: string | null
          fuel_type?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          in_service_date?: string | null
          last_service_date?: string | null
          license_plate?: string | null
          make?: string | null
          mileage?: string | null
          model?: string | null
          notes?: string | null
          odometer_unit?: string | null
          purchase_date?: string | null
          shop_id?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          state_province?: string | null
          status?: string | null
          submodel?: string | null
          tags?: string | null
          transmission?: string | null
          transmission_type?: string | null
          unit_number?: string | null
          user_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_part_numbers: {
        Row: {
          id: string
          part_id: string
          shop_id: string
          supplier_id: string | null
          vendor_sku: string
        }
        Insert: {
          id?: string
          part_id: string
          shop_id: string
          supplier_id?: string | null
          vendor_sku: string
        }
        Update: {
          id?: string
          part_id?: string
          shop_id?: string
          supplier_id?: string | null
          vendor_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_part_numbers_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "vendor_part_numbers_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_part_numbers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          ai_score: number | null
          caption: string | null
          content_type: string
          created_at: string
          created_by: string | null
          cta: string | null
          duration_seconds: number | null
          generation_notes: string | null
          hook: string | null
          human_rating: number | null
          id: string
          platform_targets: string[]
          published_at: string | null
          render_url: string | null
          script_text: string | null
          shop_id: string
          slug: string | null
          source_asset_id: string | null
          status: string
          template_id: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          voiceover_text: string | null
        }
        Insert: {
          ai_score?: number | null
          caption?: string | null
          content_type: string
          created_at?: string
          created_by?: string | null
          cta?: string | null
          duration_seconds?: number | null
          generation_notes?: string | null
          hook?: string | null
          human_rating?: number | null
          id?: string
          platform_targets?: string[]
          published_at?: string | null
          render_url?: string | null
          script_text?: string | null
          shop_id: string
          slug?: string | null
          source_asset_id?: string | null
          status?: string
          template_id?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          voiceover_text?: string | null
        }
        Update: {
          ai_score?: number | null
          caption?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          cta?: string | null
          duration_seconds?: number | null
          generation_notes?: string | null
          hook?: string | null
          human_rating?: number | null
          id?: string
          platform_targets?: string[]
          published_at?: string | null
          render_url?: string | null
          script_text?: string | null
          shop_id?: string
          slug?: string | null
          source_asset_id?: string | null
          status?: string
          template_id?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          voiceover_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      vin_decodes: {
        Row: {
          created_at: string | null
          decoded_data: Json | null
          engine: string | null
          id: string
          make: string | null
          model: string | null
          trim: string | null
          user_id: string | null
          vin: string
          year: string | null
        }
        Insert: {
          created_at?: string | null
          decoded_data?: Json | null
          engine?: string | null
          id?: string
          make?: string | null
          model?: string | null
          trim?: string | null
          user_id?: string | null
          vin: string
          year?: string | null
        }
        Update: {
          created_at?: string | null
          decoded_data?: Json | null
          engine?: string | null
          id?: string
          make?: string | null
          model?: string | null
          trim?: string | null
          user_id?: string | null
          vin?: string
          year?: string | null
        }
        Relationships: []
      }
      warranties: {
        Row: {
          created_at: string
          customer_id: string | null
          expires_at: string
          id: string
          installed_at: string
          notes: string | null
          part_id: string
          shop_id: string
          supplier_id: string | null
          vehicle_id: string | null
          warranty_months: number
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          expires_at: string
          id: string
          installed_at: string
          notes?: string | null
          part_id: string
          shop_id: string
          supplier_id?: string | null
          vehicle_id?: string | null
          warranty_months?: number
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          installed_at?: string
          notes?: string | null
          part_id?: string
          shop_id?: string
          supplier_id?: string | null
          vehicle_id?: string | null
          warranty_months?: number
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "warranties_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "warranties_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "warranties_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "warranties_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "warranties_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claims: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          status: string
          supplier_rma: string | null
          warranty_id: string
        }
        Insert: {
          created_at?: string
          id: string
          notes?: string | null
          opened_at?: string
          status: string
          supplier_rma?: string | null
          warranty_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          status?: string
          supplier_rma?: string | null
          warranty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claims_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "warranties"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_instances: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          user_id: string
          widget_slug: string
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          user_id: string
          widget_slug: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          user_id?: string
          widget_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_instances_widget_slug_fkey"
            columns: ["widget_slug"]
            isOneToOne: false
            referencedRelation: "widgets"
            referencedColumns: ["slug"]
          },
        ]
      }
      widgets: {
        Row: {
          allowed_sizes: string[]
          default_route: string
          default_size: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          allowed_sizes?: string[]
          default_route: string
          default_size?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          allowed_sizes?: string[]
          default_route?: string
          default_size?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      work_order_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          id: string
          method: string | null
          work_order_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          method?: string | null
          work_order_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          method?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_approvals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_approvals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_approvals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_approvals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_approvals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_correction_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          id: string
          invoice_version_id: string | null
          metadata: Json
          opened_at: string
          opened_by: string | null
          operation_key: string
          reason: string
          scope: string
          shop_id: string
          status: string
          work_order_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          invoice_version_id?: string | null
          metadata?: Json
          opened_at?: string
          opened_by?: string | null
          operation_key: string
          reason: string
          scope?: string
          shop_id: string
          status?: string
          work_order_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          invoice_version_id?: string | null
          metadata?: Json
          opened_at?: string
          opened_by?: string | null
          operation_key?: string
          reason?: string
          scope?: string
          shop_id?: string
          status?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_correction_sessions_invoice_version_id_fkey"
            columns: ["invoice_version_id"]
            isOneToOne: false
            referencedRelation: "invoice_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_correction_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_correction_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_correction_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_correction_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_correction_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_correction_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_correction_sessions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_intelligence: {
        Row: {
          cause: string | null
          cluster_key: string | null
          complaint: string | null
          confidence_score: number | null
          correction: string | null
          created_at: string
          customer_id: string | null
          embedding: string | null
          id: string
          job_category: string | null
          labor_time: number | null
          line_status: string | null
          normalized_text: string | null
          parts: Json
          shop_id: string
          source: string
          symptom: string | null
          tags: string[]
          template_id: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
          work_order_id: string
          work_order_line_id: string
        }
        Insert: {
          cause?: string | null
          cluster_key?: string | null
          complaint?: string | null
          confidence_score?: number | null
          correction?: string | null
          created_at?: string
          customer_id?: string | null
          embedding?: string | null
          id?: string
          job_category?: string | null
          labor_time?: number | null
          line_status?: string | null
          normalized_text?: string | null
          parts?: Json
          shop_id: string
          source?: string
          symptom?: string | null
          tags?: string[]
          template_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          work_order_id: string
          work_order_line_id: string
        }
        Update: {
          cause?: string | null
          cluster_key?: string | null
          complaint?: string | null
          confidence_score?: number | null
          correction?: string | null
          created_at?: string
          customer_id?: string | null
          embedding?: string | null
          id?: string
          job_category?: string | null
          labor_time?: number | null
          line_status?: string | null
          normalized_text?: string | null
          parts?: Json
          shop_id?: string
          source?: string
          symptom?: string | null
          tags?: string[]
          template_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          work_order_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_intelligence_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_intelligence_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_intelligence_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_intelligence_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "learned_job_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_intelligence_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_intelligence_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_intelligence_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_intelligence_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_intelligence_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_intelligence_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_intelligence_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_intelligence_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_invoice_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          issues: Json
          model: string | null
          ok: boolean
          shop_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          issues?: Json
          model?: string | null
          ok?: boolean
          shop_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          issues?: Json
          model?: string | null
          ok?: boolean
          shop_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_invoice_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_invoice_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_invoice_reviews_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_invoice_reviews_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_invoice_reviews_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_invoice_reviews_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_invoice_reviews_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_ai: {
        Row: {
          confidence: number
          created_at: string
          id: string
          intake_id: string | null
          job_scope: string | null
          primary_category: string | null
          secondary_categories: string[]
          shop_id: string
          signals: string[]
          summary: string | null
          work_order_id: string
          work_order_line_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          intake_id?: string | null
          job_scope?: string | null
          primary_category?: string | null
          secondary_categories?: string[]
          shop_id: string
          signals?: string[]
          summary?: string | null
          work_order_id: string
          work_order_line_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          intake_id?: string | null
          job_scope?: string | null
          primary_category?: string | null
          secondary_categories?: string[]
          shop_id?: string
          signals?: string[]
          summary?: string | null
          work_order_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_ai_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_ai_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "work_order_line_ai_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_ai_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_ai_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_ai_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_ai_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_ai_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_ai_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_ai_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_ai_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_dtc_threads: {
        Row: {
          created_at: string
          created_by: string | null
          dtc_code: string | null
          id: string
          messages: Json
          shop_id: string
          summary: Json | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
          work_order_id: string
          work_order_line_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dtc_code?: string | null
          id?: string
          messages?: Json
          shop_id: string
          summary?: Json | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          work_order_id: string
          work_order_line_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dtc_code?: string | null
          id?: string
          messages?: Json
          shop_id?: string
          summary?: Json | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          work_order_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_dtc_threads_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_dtc_threads_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_flat_rate_credits: {
        Row: {
          actual_job_seconds: number
          adjusted_by: string | null
          adjustment_reason: string | null
          created_at: string
          credit_hours: number
          credit_source: string
          credited_at: string
          id: string
          shop_id: string
          technician_id: string
          updated_at: string
          work_order_id: string
          work_order_line_id: string
        }
        Insert: {
          actual_job_seconds?: number
          adjusted_by?: string | null
          adjustment_reason?: string | null
          created_at?: string
          credit_hours: number
          credit_source?: string
          credited_at?: string
          id?: string
          shop_id: string
          technician_id: string
          updated_at?: string
          work_order_id: string
          work_order_line_id: string
        }
        Update: {
          actual_job_seconds?: number
          adjusted_by?: string | null
          adjustment_reason?: string | null
          created_at?: string
          credit_hours?: number
          credit_source?: string
          credited_at?: string
          id?: string
          shop_id?: string
          technician_id?: string
          updated_at?: string
          work_order_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_flat_rate_credits_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_flat_rate_credits_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_history: {
        Row: {
          created_at: string
          id: string
          line_id: string | null
          reason: string
          snapshot: Json
          status: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_id?: string | null
          reason?: string
          snapshot: Json
          status?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_id?: string | null
          reason?: string
          snapshot?: Json
          status?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_history_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_history_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_history_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_labor_segment_corrections: {
        Row: {
          corrected_at: string
          corrected_by: string
          corrected_values: Json
          correction_type: string
          id: string
          original_values: Json
          reason: string
          segment_id: string
          shop_id: string
        }
        Insert: {
          corrected_at?: string
          corrected_by: string
          corrected_values?: Json
          correction_type: string
          id?: string
          original_values?: Json
          reason: string
          segment_id: string
          shop_id: string
        }
        Update: {
          corrected_at?: string
          corrected_by?: string
          corrected_values?: Json
          correction_type?: string
          id?: string
          original_values?: Json
          reason?: string
          segment_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_labor_segment_corrections_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segment_corrections_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "work_order_line_labor_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segment_corrections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segment_corrections_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_labor_segments: {
        Row: {
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          pause_reason: string | null
          shop_id: string
          source: string
          started_at: string
          technician_id: string
          updated_at: string
          work_order_id: string
          work_order_line_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          pause_reason?: string | null
          shop_id: string
          source?: string
          started_at: string
          technician_id: string
          updated_at?: string
          work_order_id: string
          work_order_line_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          pause_reason?: string | null
          shop_id?: string
          source?: string
          started_at?: string
          technician_id?: string
          updated_at?: string
          work_order_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_labor_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_labor_segments_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_line_technicians: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          technician_id: string
          work_order_line_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          technician_id: string
          work_order_line_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          technician_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_line_technicians_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_technicians_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_technicians_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_line_technicians_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_lines: {
        Row: {
          approval_at: string | null
          approval_by: string | null
          approval_note: string | null
          approval_state: string | null
          assigned_tech_id: string | null
          assigned_to: string | null
          cause: string | null
          complaint: string | null
          correction: string | null
          created_at: string | null
          description: string | null
          external_id: string | null
          hold_reason: string | null
          id: string
          import_confidence: number | null
          import_notes: string | null
          inspection_session_id: string | null
          inspection_template_id: string | null
          intake_json: Json | null
          intake_status: string | null
          intake_submitted_at: string | null
          intake_submitted_by: string | null
          job_priority: string | null
          job_type: string | null
          labor_time: number | null
          line_no: number | null
          line_status: string | null
          line_type: string
          menu_item_id: string | null
          notes: string | null
          odometer_km: number | null
          on_hold_since: string | null
          parts: string | null
          parts_needed: Json | null
          parts_received: Json | null
          parts_required: Json | null
          price_estimate: number | null
          priority: number | null
          punchable: boolean | null
          punched_in_at: string | null
          punched_out_at: string | null
          quoted_at: string | null
          service_code: string | null
          shop_id: string
          source_fleet_service_request_line_id: string | null
          source_inspection_id: string | null
          source_inspection_item_key: string | null
          source_intake_id: string | null
          source_row_id: string | null
          status: string
          technician_notes: string | null
          template_id: string | null
          tools: string | null
          updated_at: string | null
          urgency: string | null
          user_id: string | null
          vehicle_id: string | null
          voided_at: string | null
          voided_by: string | null
          voided_note: string | null
          voided_reason: string | null
          work_order_id: string
        }
        Insert: {
          approval_at?: string | null
          approval_by?: string | null
          approval_note?: string | null
          approval_state?: string | null
          assigned_tech_id?: string | null
          assigned_to?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          hold_reason?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          inspection_session_id?: string | null
          inspection_template_id?: string | null
          intake_json?: Json | null
          intake_status?: string | null
          intake_submitted_at?: string | null
          intake_submitted_by?: string | null
          job_priority?: string | null
          job_type?: string | null
          labor_time?: number | null
          line_no?: number | null
          line_status?: string | null
          line_type?: string
          menu_item_id?: string | null
          notes?: string | null
          odometer_km?: number | null
          on_hold_since?: string | null
          parts?: string | null
          parts_needed?: Json | null
          parts_received?: Json | null
          parts_required?: Json | null
          price_estimate?: number | null
          priority?: number | null
          punchable?: boolean | null
          punched_in_at?: string | null
          punched_out_at?: string | null
          quoted_at?: string | null
          service_code?: string | null
          shop_id: string
          source_fleet_service_request_line_id?: string | null
          source_inspection_id?: string | null
          source_inspection_item_key?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
          technician_notes?: string | null
          template_id?: string | null
          tools?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_note?: string | null
          voided_reason?: string | null
          work_order_id: string
        }
        Update: {
          approval_at?: string | null
          approval_by?: string | null
          approval_note?: string | null
          approval_state?: string | null
          assigned_tech_id?: string | null
          assigned_to?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          hold_reason?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          inspection_session_id?: string | null
          inspection_template_id?: string | null
          intake_json?: Json | null
          intake_status?: string | null
          intake_submitted_at?: string | null
          intake_submitted_by?: string | null
          job_priority?: string | null
          job_type?: string | null
          labor_time?: number | null
          line_no?: number | null
          line_status?: string | null
          line_type?: string
          menu_item_id?: string | null
          notes?: string | null
          odometer_km?: number | null
          on_hold_since?: string | null
          parts?: string | null
          parts_needed?: Json | null
          parts_received?: Json | null
          parts_required?: Json | null
          price_estimate?: number | null
          priority?: number | null
          punchable?: boolean | null
          punched_in_at?: string | null
          punched_out_at?: string | null
          quoted_at?: string | null
          service_code?: string | null
          shop_id?: string
          source_fleet_service_request_line_id?: string | null
          source_inspection_id?: string | null
          source_inspection_item_key?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
          technician_notes?: string | null
          template_id?: string | null
          tools?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_note?: string | null
          voided_reason?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_lines_assigned_tech_id_fkey"
            columns: ["assigned_tech_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_inspection_session_fk"
            columns: ["inspection_session_id"]
            isOneToOne: false
            referencedRelation: "inspection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_inspection_session_id_fkey"
            columns: ["inspection_session_id"]
            isOneToOne: false
            referencedRelation: "inspection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_source_fleet_service_request_line_id_fkey"
            columns: ["source_fleet_service_request_line_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_request_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_media: {
        Row: {
          client_mutation_id: string | null
          content_type: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          id: string
          kind: string | null
          note: string | null
          quote_line_id: string | null
          shop_id: string
          source: string | null
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          url: string
          user_id: string | null
          visibility: string
          work_order_id: string
          work_order_line_id: string | null
        }
        Insert: {
          client_mutation_id?: string | null
          content_type?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind?: string | null
          note?: string | null
          quote_line_id?: string | null
          shop_id: string
          source?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          url: string
          user_id?: string | null
          visibility?: string
          work_order_id: string
          work_order_line_id?: string | null
        }
        Update: {
          client_mutation_id?: string | null
          content_type?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind?: string | null
          note?: string | null
          quote_line_id?: string | null
          shop_id?: string
          source?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          url?: string
          user_id?: string | null
          visibility?: string
          work_order_id?: string
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_media_quote_line_id_fkey"
            columns: ["quote_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_quote_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_media_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_media_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_media_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_media_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_media_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_media_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_media_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_media_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_media_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_media_annotations: {
        Row: {
          client_mutation_id: string | null
          created_at: string
          created_by: string
          id: string
          media_id: string
          overlay: Json
          shop_id: string
          version: number
          visibility: string
        }
        Insert: {
          client_mutation_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          media_id: string
          overlay?: Json
          shop_id: string
          version: number
          visibility?: string
        }
        Update: {
          client_mutation_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          media_id?: string
          overlay?: Json
          shop_id?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_media_annotations_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "work_order_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_media_annotations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_media_annotations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_part_allocations: {
        Row: {
          created_at: string
          id: string
          location_id: string
          part_id: string
          qty: number
          shop_id: string
          source_request_item_id: string | null
          stock_move_id: string | null
          unit_cost: number
          work_order_id: string
          work_order_line_id: string
          work_order_part_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          part_id: string
          qty: number
          shop_id: string
          source_request_item_id?: string | null
          stock_move_id?: string | null
          unit_cost?: number
          work_order_id: string
          work_order_line_id: string
          work_order_part_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          part_id?: string
          qty?: number
          shop_id?: string
          source_request_item_id?: string | null
          stock_move_id?: string | null
          unit_cost?: number
          work_order_id?: string
          work_order_line_id?: string
          work_order_part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wopa_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "wopa_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "wopa_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "wopa_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "wopa_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_source_request_item_id_fkey"
            columns: ["source_request_item_id"]
            isOneToOne: false
            referencedRelation: "part_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_stock_move_id_fkey"
            columns: ["stock_move_id"]
            isOneToOne: false
            referencedRelation: "stock_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_work_order_part_id_fkey"
            columns: [
              "work_order_part_id",
              "shop_id",
              "work_order_id",
              "work_order_line_id",
              "part_id",
            ]
            isOneToOne: false
            referencedRelation: "invoice_net_issued_parts"
            referencedColumns: [
              "id",
              "shop_id",
              "work_order_id",
              "work_order_line_id",
              "part_id",
            ]
          },
          {
            foreignKeyName: "work_order_part_allocations_work_order_part_id_fkey"
            columns: [
              "work_order_part_id",
              "shop_id",
              "work_order_id",
              "work_order_line_id",
              "part_id",
            ]
            isOneToOne: false
            referencedRelation: "work_order_parts"
            referencedColumns: [
              "id",
              "shop_id",
              "work_order_id",
              "work_order_line_id",
              "part_id",
            ]
          },
        ]
      }
      work_order_parts: {
        Row: {
          created_at: string | null
          description_snapshot: string | null
          id: string
          is_active: boolean
          lifecycle_status: string
          manufacturer_snapshot: string | null
          part_id: string | null
          part_number_snapshot: string | null
          quantity: number
          quantity_allocated: number
          quantity_cancelled: number
          quantity_consumed: number
          quantity_ordered: number
          quantity_received: number
          quantity_requested: number
          quantity_returned: number
          shop_id: string | null
          sku_snapshot: string | null
          source_parts_request_id: string | null
          source_parts_request_item_id: string | null
          supplier_snapshot: string | null
          total_price: number | null
          unit_cost_snapshot: number | null
          unit_price: number | null
          unit_sell_price_snapshot: number | null
          updated_at: string
          vendor_snapshot: string | null
          work_order_id: string
          work_order_line_id: string | null
        }
        Insert: {
          created_at?: string | null
          description_snapshot?: string | null
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          manufacturer_snapshot?: string | null
          part_id?: string | null
          part_number_snapshot?: string | null
          quantity?: number
          quantity_allocated?: number
          quantity_cancelled?: number
          quantity_consumed?: number
          quantity_ordered?: number
          quantity_received?: number
          quantity_requested?: number
          quantity_returned?: number
          shop_id?: string | null
          sku_snapshot?: string | null
          source_parts_request_id?: string | null
          source_parts_request_item_id?: string | null
          supplier_snapshot?: string | null
          total_price?: number | null
          unit_cost_snapshot?: number | null
          unit_price?: number | null
          unit_sell_price_snapshot?: number | null
          updated_at?: string
          vendor_snapshot?: string | null
          work_order_id: string
          work_order_line_id?: string | null
        }
        Update: {
          created_at?: string | null
          description_snapshot?: string | null
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          manufacturer_snapshot?: string | null
          part_id?: string | null
          part_number_snapshot?: string | null
          quantity?: number
          quantity_allocated?: number
          quantity_cancelled?: number
          quantity_consumed?: number
          quantity_ordered?: number
          quantity_received?: number
          quantity_requested?: number
          quantity_returned?: number
          shop_id?: string | null
          sku_snapshot?: string | null
          source_parts_request_id?: string | null
          source_parts_request_item_id?: string | null
          supplier_snapshot?: string | null
          total_price?: number | null
          unit_cost_snapshot?: number | null
          unit_price?: number | null
          unit_sell_price_snapshot?: number | null
          updated_at?: string
          vendor_snapshot?: string | null
          work_order_id?: string
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "work_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_source_parts_request_id_fkey"
            columns: ["source_parts_request_id"]
            isOneToOne: false
            referencedRelation: "part_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_source_parts_request_item_id_fkey"
            columns: ["source_parts_request_item_id"]
            isOneToOne: false
            referencedRelation: "part_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_quote_lines: {
        Row: {
          ai_cause: string | null
          ai_complaint: string | null
          ai_correction: string | null
          approved_at: string | null
          approved_by: string | null
          converted_at: string | null
          created_at: string
          created_by: string | null
          customer_pricing_snapshot_id: string | null
          decision: string | null
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          defer_reason: string | null
          deferred_at: string | null
          deferred_by: string | null
          description: string
          discount_total: number
          est_labor_hours: number | null
          external_id: string | null
          grand_total: number | null
          group_id: string | null
          id: string
          job_type: string
          labor_hours: number | null
          labor_rate: number | null
          labor_total: number | null
          line_type: string
          metadata: Json | null
          notes: string | null
          parts_total: number | null
          qty: number | null
          sent_at: string | null
          sent_by: string | null
          sent_to_customer_at: string | null
          shop_id: string
          source_row_id: string | null
          source_work_order_line_id: string | null
          stage: string | null
          status: string
          subtotal: number | null
          suggested_by: string | null
          tax_total: number | null
          title: string | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string
          work_order_line_id: string | null
        }
        Insert: {
          ai_cause?: string | null
          ai_complaint?: string | null
          ai_correction?: string | null
          approved_at?: string | null
          approved_by?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_pricing_snapshot_id?: string | null
          decision?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          defer_reason?: string | null
          deferred_at?: string | null
          deferred_by?: string | null
          description: string
          discount_total?: number
          est_labor_hours?: number | null
          external_id?: string | null
          grand_total?: number | null
          group_id?: string | null
          id?: string
          job_type?: string
          labor_hours?: number | null
          labor_rate?: number | null
          labor_total?: number | null
          line_type?: string
          metadata?: Json | null
          notes?: string | null
          parts_total?: number | null
          qty?: number | null
          sent_at?: string | null
          sent_by?: string | null
          sent_to_customer_at?: string | null
          shop_id: string
          source_row_id?: string | null
          source_work_order_line_id?: string | null
          stage?: string | null
          status?: string
          subtotal?: number | null
          suggested_by?: string | null
          tax_total?: number | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id: string
          work_order_line_id?: string | null
        }
        Update: {
          ai_cause?: string | null
          ai_complaint?: string | null
          ai_correction?: string | null
          approved_at?: string | null
          approved_by?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_pricing_snapshot_id?: string | null
          decision?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          defer_reason?: string | null
          deferred_at?: string | null
          deferred_by?: string | null
          description?: string
          discount_total?: number
          est_labor_hours?: number | null
          external_id?: string | null
          grand_total?: number | null
          group_id?: string | null
          id?: string
          job_type?: string
          labor_hours?: number | null
          labor_rate?: number | null
          labor_total?: number | null
          line_type?: string
          metadata?: Json | null
          notes?: string | null
          parts_total?: number | null
          qty?: number | null
          sent_at?: string | null
          sent_by?: string | null
          sent_to_customer_at?: string | null
          shop_id?: string
          source_row_id?: string | null
          source_work_order_line_id?: string | null
          stage?: string | null
          status?: string
          subtotal?: number | null
          suggested_by?: string | null
          tax_total?: number | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_quote_lines_customer_pricing_snapshot_id_fkey"
            columns: ["customer_pricing_snapshot_id"]
            isOneToOne: false
            referencedRelation: "pricing_resolution_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_source_work_order_line_id_fkey"
            columns: ["source_work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_source_work_order_line_id_fkey"
            columns: ["source_work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quote_lines_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          advisor_id: string | null
          approval_state: string | null
          assigned_tech: string | null
          created_at: string | null
          created_by: string | null
          custom_id: string | null
          customer_agreed_at: string | null
          customer_approval_at: string | null
          customer_approval_signature_path: string | null
          customer_approval_signature_url: string | null
          customer_approved_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_pricing_fee_agreement_id: string | null
          customer_pricing_fee_resolved_at: string | null
          customer_pricing_fee_total: number | null
          customer_signature_url: string | null
          estimate_authorized_at: string | null
          estimate_converted_at: string | null
          estimate_created_at: string | null
          estimate_created_by: string | null
          estimate_expires_at: string | null
          estimate_number: string | null
          estimate_parts_completed_at: string | null
          estimate_parts_completed_by: string | null
          estimate_revision: number
          estimate_sent_at: string | null
          estimate_sent_by: string | null
          estimate_status: string | null
          expected_completion_at: string | null
          external_id: string | null
          id: string
          import_confidence: number | null
          import_notes: string | null
          inspection_id: string | null
          inspection_pdf_url: string | null
          inspection_type: string | null
          intake_json: Json | null
          intake_status: string | null
          intake_submitted_at: string | null
          intake_submitted_by: string | null
          invoice_last_sent_to: string | null
          invoice_pdf_url: string | null
          invoice_sent_at: string | null
          invoice_total: number | null
          invoice_url: string | null
          is_waiter: boolean
          labor_total: number | null
          notes: string | null
          odometer_km: number | null
          outstanding_balance: number
          paid_at: string | null
          parts_total: number | null
          payment_status: string
          portal_submitted_at: string | null
          priority: number | null
          quote: Json | null
          quote_url: string | null
          record_type: string
          scheduled_at: string | null
          shop_id: string
          shop_supplies_amount_override: number | null
          shop_supplies_enabled_override: boolean | null
          source_fleet_program_id: string | null
          source_fleet_service_request_id: string | null
          source_intake_id: string | null
          source_row_id: string | null
          status: string
          type: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_color: string | null
          vehicle_drivetrain: string | null
          vehicle_engine: string | null
          vehicle_engine_hours: number | null
          vehicle_fuel_type: string | null
          vehicle_id: string | null
          vehicle_info: string | null
          vehicle_license_plate: string | null
          vehicle_make: string | null
          vehicle_mileage: number | null
          vehicle_model: string | null
          vehicle_submodel: string | null
          vehicle_transmission: string | null
          vehicle_unit_number: string | null
          vehicle_vin: string | null
          vehicle_year: number | null
        }
        Insert: {
          advisor_id?: string | null
          approval_state?: string | null
          assigned_tech?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_id?: string | null
          customer_agreed_at?: string | null
          customer_approval_at?: string | null
          customer_approval_signature_path?: string | null
          customer_approval_signature_url?: string | null
          customer_approved_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_pricing_fee_agreement_id?: string | null
          customer_pricing_fee_resolved_at?: string | null
          customer_pricing_fee_total?: number | null
          customer_signature_url?: string | null
          estimate_authorized_at?: string | null
          estimate_converted_at?: string | null
          estimate_created_at?: string | null
          estimate_created_by?: string | null
          estimate_expires_at?: string | null
          estimate_number?: string | null
          estimate_parts_completed_at?: string | null
          estimate_parts_completed_by?: string | null
          estimate_revision?: number
          estimate_sent_at?: string | null
          estimate_sent_by?: string | null
          estimate_status?: string | null
          expected_completion_at?: string | null
          external_id?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          inspection_id?: string | null
          inspection_pdf_url?: string | null
          inspection_type?: string | null
          intake_json?: Json | null
          intake_status?: string | null
          intake_submitted_at?: string | null
          intake_submitted_by?: string | null
          invoice_last_sent_to?: string | null
          invoice_pdf_url?: string | null
          invoice_sent_at?: string | null
          invoice_total?: number | null
          invoice_url?: string | null
          is_waiter?: boolean
          labor_total?: number | null
          notes?: string | null
          odometer_km?: number | null
          outstanding_balance?: number
          paid_at?: string | null
          parts_total?: number | null
          payment_status?: string
          portal_submitted_at?: string | null
          priority?: number | null
          quote?: Json | null
          quote_url?: string | null
          record_type?: string
          scheduled_at?: string | null
          shop_id: string
          shop_supplies_amount_override?: number | null
          shop_supplies_enabled_override?: boolean | null
          source_fleet_program_id?: string | null
          source_fleet_service_request_id?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_color?: string | null
          vehicle_drivetrain?: string | null
          vehicle_engine?: string | null
          vehicle_engine_hours?: number | null
          vehicle_fuel_type?: string | null
          vehicle_id?: string | null
          vehicle_info?: string | null
          vehicle_license_plate?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_submodel?: string | null
          vehicle_transmission?: string | null
          vehicle_unit_number?: string | null
          vehicle_vin?: string | null
          vehicle_year?: number | null
        }
        Update: {
          advisor_id?: string | null
          approval_state?: string | null
          assigned_tech?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_id?: string | null
          customer_agreed_at?: string | null
          customer_approval_at?: string | null
          customer_approval_signature_path?: string | null
          customer_approval_signature_url?: string | null
          customer_approved_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_pricing_fee_agreement_id?: string | null
          customer_pricing_fee_resolved_at?: string | null
          customer_pricing_fee_total?: number | null
          customer_signature_url?: string | null
          estimate_authorized_at?: string | null
          estimate_converted_at?: string | null
          estimate_created_at?: string | null
          estimate_created_by?: string | null
          estimate_expires_at?: string | null
          estimate_number?: string | null
          estimate_parts_completed_at?: string | null
          estimate_parts_completed_by?: string | null
          estimate_revision?: number
          estimate_sent_at?: string | null
          estimate_sent_by?: string | null
          estimate_status?: string | null
          expected_completion_at?: string | null
          external_id?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          inspection_id?: string | null
          inspection_pdf_url?: string | null
          inspection_type?: string | null
          intake_json?: Json | null
          intake_status?: string | null
          intake_submitted_at?: string | null
          intake_submitted_by?: string | null
          invoice_last_sent_to?: string | null
          invoice_pdf_url?: string | null
          invoice_sent_at?: string | null
          invoice_total?: number | null
          invoice_url?: string | null
          is_waiter?: boolean
          labor_total?: number | null
          notes?: string | null
          odometer_km?: number | null
          outstanding_balance?: number
          paid_at?: string | null
          parts_total?: number | null
          payment_status?: string
          portal_submitted_at?: string | null
          priority?: number | null
          quote?: Json | null
          quote_url?: string | null
          record_type?: string
          scheduled_at?: string | null
          shop_id?: string
          shop_supplies_amount_override?: number | null
          shop_supplies_enabled_override?: boolean | null
          source_fleet_program_id?: string | null
          source_fleet_service_request_id?: string | null
          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_color?: string | null
          vehicle_drivetrain?: string | null
          vehicle_engine?: string | null
          vehicle_engine_hours?: number | null
          vehicle_fuel_type?: string | null
          vehicle_id?: string | null
          vehicle_info?: string | null
          vehicle_license_plate?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_submodel?: string | null
          vehicle_transmission?: string | null
          vehicle_unit_number?: string | null
          vehicle_vin?: string | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_customer_pricing_fee_agreement_id_fkey"
            columns: ["customer_pricing_fee_agreement_id"]
            isOneToOne: false
            referencedRelation: "customer_pricing_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_estimate_created_by_fkey"
            columns: ["estimate_created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_estimate_parts_completed_by_fkey"
            columns: ["estimate_parts_completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_estimate_sent_by_fkey"
            columns: ["estimate_sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_document_requirements: {
        Row: {
          accept_statuses: string[]
          created_at: string
          created_by: string | null
          doc_type: string
          expires_required: boolean
          expires_warning_days: number
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          priority: number
          review_statuses: string[]
          shop_id: string
          updated_at: string
          updated_by: string | null
          workforce_category: string | null
          workforce_role: string | null
        }
        Insert: {
          accept_statuses?: string[]
          created_at?: string
          created_by?: string | null
          doc_type: string
          expires_required?: boolean
          expires_warning_days?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          priority?: number
          review_statuses?: string[]
          shop_id: string
          updated_at?: string
          updated_by?: string | null
          workforce_category?: string | null
          workforce_role?: string | null
        }
        Update: {
          accept_statuses?: string[]
          created_at?: string
          created_by?: string | null
          doc_type?: string
          expires_required?: boolean
          expires_warning_days?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          priority?: number
          review_statuses?: string[]
          shop_id?: string
          updated_at?: string
          updated_by?: string | null
          workforce_category?: string | null
          workforce_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_document_requirements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_document_requirements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_job_resume_contexts: {
        Row: {
          assignment_id: string | null
          break_punch_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          metadata: Json
          pause_reason: string
          paused_at: string
          paused_job_session_id: string | null
          resumed_at: string | null
          shop_id: string
          status: string
          updated_at: string
          user_id: string
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          break_punch_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          pause_reason: string
          paused_at: string
          paused_job_session_id?: string | null
          resumed_at?: string | null
          shop_id: string
          status?: string
          updated_at?: string
          user_id: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          break_punch_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          pause_reason?: string
          paused_at?: string
          paused_job_session_id?: string | null
          resumed_at?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_job_resume_contexts_break_punch_id_fkey"
            columns: ["break_punch_id"]
            isOneToOne: false
            referencedRelation: "punch_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_paused_job_session_id_fkey"
            columns: ["paused_job_session_id"]
            isOneToOne: false
            referencedRelation: "work_order_line_labor_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_job_resume_contexts_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_operation_keys: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          operation_key: string
          operation_name: string
          result: Json
          shop_id: string
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key: string
          operation_name: string
          result?: Json
          shop_id: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation_key?: string
          operation_name?: string
          result?: Json
          shop_id?: string
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_operation_keys_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_capabilities: {
        Row: {
          access_level: string
          action_key: string
          capability_key: string
          created_at: string
          description: string
          is_protected: boolean
          module_key: string
          updated_at: string
          workspace_key: string
        }
        Insert: {
          access_level: string
          action_key: string
          capability_key: string
          created_at?: string
          description: string
          is_protected?: boolean
          module_key: string
          updated_at?: string
          workspace_key: string
        }
        Update: {
          access_level?: string
          action_key?: string
          capability_key?: string
          created_at?: string
          description?: string
          is_protected?: boolean
          module_key?: string
          updated_at?: string
          workspace_key?: string
        }
        Relationships: []
      }
      workspace_role_capability_presets: {
        Row: {
          capability_key: string
          created_at: string
          effect: string
          role_key: string
          updated_at: string
        }
        Insert: {
          capability_key: string
          created_at?: string
          effect: string
          role_key: string
          updated_at?: string
        }
        Update: {
          capability_key?: string
          created_at?: string
          effect?: string
          role_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_role_capability_presets_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "workspace_capabilities"
            referencedColumns: ["capability_key"]
          },
        ]
      }
    }
    Views: {
      invoice_net_issued_parts: {
        Row: {
          description_snapshot: string | null
          id: string | null
          line_total: number | null
          manufacturer_snapshot: string | null
          net_issued_quantity: number | null
          part_id: string | null
          part_number_snapshot: string | null
          shop_id: string | null
          sku_snapshot: string | null
          supplier_snapshot: string | null
          unit_cost_snapshot: number | null
          unit_sell_price: number | null
          vendor_snapshot: string | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "work_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_event_health: {
        Row: {
          active_domains_last_7d: number | null
          events_last_24h: number | null
          events_last_7d: number | null
          last_event_at: string | null
          shop_id: string | null
          unresolved_failure_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      part_stock_summary: {
        Row: {
          category: string | null
          move_count: number | null
          name: string | null
          on_hand: number | null
          part_id: string | null
          price: number | null
          shop_id: string | null
          sku: string | null
        }
        Relationships: []
      }
      shop_public_profiles: {
        Row: {
          city: string | null
          geo_lat: number | null
          geo_lng: number | null
          id: string | null
          images: string[] | null
          logo_url: string | null
          name: string | null
          province: string | null
          rating: number | null
        }
        Insert: {
          city?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string | null
          images?: string[] | null
          logo_url?: string | null
          name?: string | null
          province?: string | null
          rating?: number | null
        }
        Update: {
          city?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string | null
          images?: string[] | null
          logo_url?: string | null
          name?: string | null
          province?: string | null
          rating?: number | null
        }
        Relationships: []
      }
      shop_reviews_public: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string | null
          rating: number | null
          replied_at: string | null
          shop_id: string | null
          shop_owner_reply: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string | null
          rating?: number | null
          replied_at?: string | null
          shop_id?: string | null
          shop_owner_reply?: never
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string | null
          rating?: number | null
          replied_at?: string | null
          shop_id?: string | null
          shop_owner_reply?: never
        }
        Relationships: [
          {
            foreignKeyName: "shop_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_events: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_table: string | null
          event_type: string | null
          id: string | null
          payload: Json | null
          shop_id: string | null
          source_system: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          event_type?: string | null
          id?: string | null
          payload?: Json | null
          shop_id?: string | null
          source_system?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          event_type?: string | null
          id?: string | null
          payload?: Json | null
          shop_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      v_menu_repair_item_match_stats: {
        Row: {
          acceptance_rate: number | null
          accepted_count: number | null
          dismissed_count: number | null
          feedback_count: number | null
          menu_repair_item_id: string | null
          shop_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_smart_match_feedback_menu_repair_item_id_fkey"
            columns: ["menu_repair_item_id"]
            isOneToOne: false
            referencedRelation: "menu_repair_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_smart_match_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_smart_match_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      v_part_stock: {
        Row: {
          location_id: string | null
          part_id: string | null
          qty_available: number | null
          qty_on_hand: number | null
          qty_reserved: number | null
        }
        Relationships: []
      }
      v_portal_invoices: {
        Row: {
          approval_state: string | null
          created_at: string | null
          customer_id: string | null
          invoice_last_sent_to: string | null
          invoice_pdf_url: string | null
          invoice_sent_at: string | null
          invoice_total: number | null
          invoice_url: string | null
          shop_id: string | null
          status: string | null
          updated_at: string | null
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          approval_state?: string | null
          created_at?: string | null
          customer_id?: string | null
          invoice_last_sent_to?: string | null
          invoice_pdf_url?: string | null
          invoice_sent_at?: string | null
          invoice_total?: number | null
          invoice_url?: string | null
          shop_id?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          approval_state?: string | null
          created_at?: string | null
          customer_id?: string | null
          invoice_last_sent_to?: string | null
          invoice_pdf_url?: string | null
          invoice_sent_at?: string | null
          invoice_total?: number | null
          invoice_url?: string | null
          shop_id?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_quote_queue: {
        Row: {
          approval_at: string | null
          approval_by: string | null
          approval_note: string | null
          approval_state: string | null
          assigned_tech_id: string | null
          assigned_to: string | null
          cause: string | null
          complaint: string | null
          correction: string | null
          created_at: string | null
          description: string | null
          hold_reason: string | null
          id: string | null
          inspection_session_id: string | null
          job_type: string | null
          labor_time: number | null
          line_status: string | null
          notes: string | null
          on_hold_since: string | null
          parts: string | null
          parts_needed: Json | null
          parts_received: Json | null
          parts_required: Json | null
          price_estimate: number | null
          priority: number | null
          punched_in_at: string | null
          punched_out_at: string | null
          shop_id: string | null
          status: string | null
          template_id: string | null
          tools: string | null
          updated_at: string | null
          urgency: string | null
          user_id: string | null
          vehicle_id: string | null
          work_order_custom_id: string | null
          work_order_customer_id: string | null
          work_order_id: string | null
          work_order_vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_lines_assigned_tech_id_fkey"
            columns: ["assigned_tech_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_inspection_session_fk"
            columns: ["inspection_session_id"]
            isOneToOne: false
            referencedRelation: "inspection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_inspection_session_id_fkey"
            columns: ["inspection_session_id"]
            isOneToOne: false
            referencedRelation: "inspection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_fk"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["work_order_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["work_order_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_shift_rollups: {
        Row: {
          shift_id: string | null
          user_id: string | null
          worked_seconds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_shop_boost_overview: {
        Row: {
          import_file_count: number | null
          import_row_count: number | null
          intake_created_at: string | null
          intake_id: string | null
          intake_processed_at: string | null
          intake_source: string | null
          intake_status: string | null
          latest_metrics: Json | null
          latest_scores: Json | null
          latest_snapshot_created_at: string | null
          latest_snapshot_id: string | null
          shop_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_boost_intakes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_boost_intakes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      v_shop_boost_suggestions: {
        Row: {
          category: string | null
          confidence: number | null
          created_at: string | null
          id: string | null
          intake_id: string | null
          labor_hours_suggestion: number | null
          name: string | null
          price_suggestion: number | null
          reason: string | null
          shop_id: string | null
          suggestion_type: string | null
        }
        Relationships: []
      }
      v_shop_health_latest: {
        Row: {
          intake_id: string | null
          metrics: Json | null
          narrative_summary: string | null
          period_end: string | null
          period_start: string | null
          scores: Json | null
          shop_id: string | null
          snapshot_created_at: string | null
          snapshot_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_health_snapshots_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_health_snapshots_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
          {
            foreignKeyName: "shop_health_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_health_snapshots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      v_staff_invites_common: {
        Row: {
          confidence: number | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          intake_id: string | null
          name: string | null
          notes: string | null
          phone: string | null
          role: string | null
          shop_id: string | null
          source_type: string | null
          status: string | null
          username: string | null
        }
        Relationships: []
      }
      v_work_order_board_cards_fleet: {
        Row: {
          activity_at: string | null
          advisor_id: string | null
          advisor_name: string | null
          assigned_summary: string | null
          assigned_tech_count: number | null
          custom_id: string | null
          customer_id: string | null
          display_name: string | null
          first_tech_name: string | null
          fleet_id: string | null
          fleet_name: string | null
          fleet_stage_label: string | null
          has_waiting_parts: boolean | null
          is_waiter: boolean | null
          jobs_blocked: number | null
          jobs_completed: number | null
          jobs_open: number | null
          jobs_total: number | null
          jobs_waiting_parts: number | null
          overall_stage: string | null
          parts_blocker_count: number | null
          portal_stage_label: string | null
          portal_status_note: string | null
          priority: number | null
          progress_pct: number | null
          risk_level: string | null
          risk_reason: string | null
          shop_id: string | null
          tech_names: string[] | null
          time_in_stage_seconds: number | null
          unit_label: string | null
          vehicle_id: string | null
          vehicle_label: string | null
          work_order_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_work_order_board_cards_portal: {
        Row: {
          activity_at: string | null
          advisor_id: string | null
          advisor_name: string | null
          assigned_summary: string | null
          assigned_tech_count: number | null
          custom_id: string | null
          customer_id: string | null
          display_name: string | null
          first_tech_name: string | null
          fleet_id: string | null
          fleet_name: string | null
          fleet_stage_label: string | null
          has_waiting_parts: boolean | null
          is_waiter: boolean | null
          jobs_blocked: number | null
          jobs_completed: number | null
          jobs_open: number | null
          jobs_total: number | null
          jobs_waiting_parts: number | null
          overall_stage: string | null
          parts_blocker_count: number | null
          portal_stage_label: string | null
          portal_status_note: string | null
          priority: number | null
          progress_pct: number | null
          risk_level: string | null
          risk_reason: string | null
          shop_id: string | null
          tech_names: string[] | null
          time_in_stage_seconds: number | null
          unit_label: string | null
          vehicle_id: string | null
          vehicle_label: string | null
          work_order_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_work_order_board_cards_shop: {
        Row: {
          activity_at: string | null
          advisor_id: string | null
          advisor_name: string | null
          assigned_summary: string | null
          assigned_tech_count: number | null
          custom_id: string | null
          customer_id: string | null
          display_name: string | null
          first_tech_name: string | null
          fleet_stage_label: string | null
          has_waiting_parts: boolean | null
          is_waiter: boolean | null
          jobs_blocked: number | null
          jobs_completed: number | null
          jobs_open: number | null
          jobs_total: number | null
          jobs_waiting_parts: number | null
          overall_stage: string | null
          parts_blocker_count: number | null
          portal_stage_label: string | null
          portal_status_note: string | null
          priority: number | null
          progress_pct: number | null
          risk_level: string | null
          risk_reason: string | null
          shop_id: string | null
          tech_names: string[] | null
          time_in_stage_seconds: number | null
          unit_label: string | null
          vehicle_id: string | null
          vehicle_label: string | null
          work_order_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _ensure_same_shop: { Args: { _wo: string }; Returns: boolean }
      accept_customer_portal_invite_atomic: {
        Args: {
          p_actor_email: string
          p_actor_user_id: string
          p_at?: string
          p_invite_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      accept_financial_outbox_delivery: {
        Args: {
          p_delivery_id: string
          p_provider_message_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      accept_fleet_portal_invite_atomic: {
        Args: {
          p_actor_email: string
          p_actor_user_id: string
          p_at?: string
          p_token_hash: string
        }
        Returns: Json
      }
      accept_property_portal_invite: {
        Args: { p_raw_token: string }
        Returns: Json
      }
      add_ai_suggested_quote_lines_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_items: Json
          p_operation_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      add_portal_diagnostic_line_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_customer_id: string
          p_description: string
          p_notes: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      add_portal_request_line_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_customer_id: string
          p_description: string
          p_line_kind: string
          p_line_type: string
          p_notes: string
          p_operation_key: string
          p_shop_id: string
          p_source_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      add_repair_line_from_vehicle_service: {
        Args: {
          p_engine_family: string
          p_qty?: number
          p_service_code: string
          p_vehicle_make: string
          p_vehicle_model: string
          p_vehicle_year: number
          p_work_order_id: string
        }
        Returns: Json
      }
      agent_approve_action: {
        Args: { p_action_id: string; p_approved_by?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          last_error_at: string | null
          max_attempts: number
          payload: Json
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          request_id: string
          requires_approval: boolean
          result: Json | null
          risk: Database["public"]["Enums"]["agent_action_risk"]
          run_after: string
          status: Database["public"]["Enums"]["agent_action_status"]
          summary: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_actions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agent_can_start: { Args: never; Returns: boolean }
      agent_reject_action: {
        Args: { p_action_id: string; p_reason?: string; p_rejected_by?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          last_error_at: string | null
          max_attempts: number
          payload: Json
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          request_id: string
          requires_approval: boolean
          result: Json | null
          risk: Database["public"]["Enums"]["agent_action_risk"]
          run_after: string
          status: Database["public"]["Enums"]["agent_action_status"]
          summary: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_actions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_approval_compatibility_bundle_atomic: {
        Args: {
          p_actor_user_id: string
          p_approved_line_ids: string[]
          p_approved_quote_line_ids: string[]
          p_at?: string
          p_customer_id: string
          p_declined_line_ids: string[]
          p_declined_quote_line_ids: string[]
          p_operation_key: string
          p_shop_id: string
          p_signature_url: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_canonical_offline_shift_punch_atomic: {
        Args: {
          p_actor_auth_user_id: string
          p_actor_profile_id: string
          p_event_type: string
          p_note?: string
          p_operation_key: string
          p_shift_id: string
          p_shop_id: string
          p_timestamp: string
        }
        Returns: Json
      }
      apply_customer_pricing_to_quote_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_quote_line_ids: string[]
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_customer_pricing_v2_to_quote_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_quote_line_ids: string[]
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_customer_quote_decision_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_customer_id: string
          p_decision: string
          p_decline_remaining: boolean
          p_operation_key: string
          p_quote_line_ids: string[]
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_customer_quote_decision_engine_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_customer_id: string
          p_decision: string
          p_decline_remaining: boolean
          p_operation_key: string
          p_quote_line_ids: string[]
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_job_punch_transition_atomic: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_allow_concurrent?: boolean
          p_at?: string
          p_cause?: string
          p_correction?: string
          p_details?: Json
          p_event?: string
          p_hold_reason?: string
          p_notes?: string
          p_operation_key: string
          p_preserve_line_status?: boolean
          p_release_to_awaiting?: boolean
          p_shop_id: string
          p_start_source?: string
          p_technician_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      apply_offline_line_mutation_atomic: {
        Args: {
          p_action_type: string
          p_actor_user_id: string
          p_operation_key: string
          p_payload: Json
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      apply_offline_shift_punch_atomic: {
        Args: {
          p_actor_user_id: string
          p_event_type: string
          p_note?: string
          p_operation_key: string
          p_shift_id: string
          p_shop_id: string
          p_timestamp: string
        }
        Returns: Json
      }
      apply_portal_booking_command_atomic: {
        Args: {
          p_action: string
          p_actor_mode: string
          p_actor_user_id: string
          p_at?: string
          p_booking_id: string
          p_customer_id: string
          p_ends_at: string
          p_notes: string
          p_operation_key: string
          p_reason?: string
          p_shop_id: string
          p_starts_at: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      apply_portal_line_decision_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_customer_id: string
          p_decision: string
          p_line_id: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_portal_quote_decision_atomic: {
        Args: {
          p_at?: string
          p_decision: string
          p_decline_remaining: boolean
          p_operation_key: string
          p_quote_line_ids: string[]
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_punch_correction: {
        Args: {
          p_actor_profile_id: string
          p_corrected_timestamp: string
          p_punch_id: string
          p_reason: string
          p_shop_id: string
        }
        Returns: {
          actor_profile_id: string
          corrected_timestamp: string
          created_at: string
          event_type: string
          id: string
          original_timestamp: string
          punch_id: string
          reason: string
          shift_id: string
          shop_id: string
          target_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "punch_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_shift_correction: {
        Args: {
          p_actor_profile_id: string
          p_corrected_end_time: string
          p_corrected_start_time: string
          p_correction_type: string
          p_reason: string
          p_shift_id: string
          p_shop_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      apply_shop_quote_decision_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_contact_method: string
          p_decision: string
          p_note: string
          p_operation_key: string
          p_quote_line_ids: string[]
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      apply_stock_move:
        | {
            Args: {
              p_loc: string
              p_part: string
              p_qty: number
              p_reason: Database["public"]["Enums"]["stock_move_reason"]
              p_ref_id?: string
              p_ref_kind?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_loc: string
              p_part: string
              p_qty: number
              p_reason: string
              p_ref_id: string
              p_ref_kind: string
            }
            Returns: string
          }
      apply_stripe_subscription_webhook_snapshot: {
        Args: {
          p_customer_id: string
          p_event_created_at: string
          p_event_id: string
          p_shop_id: string
          p_snapshot: Json
          p_subscription_id: string
        }
        Returns: boolean
      }
      approve_inspection_form_import: {
        Args: { p_job_id: string; p_sections: Json; p_title: string }
        Returns: string
      }
      approve_lines: {
        Args: {
          _approved_ids: string[]
          _approver?: string
          _decline_unchecked?: boolean
          _declined_ids?: string[]
          _wo: string
        }
        Returns: undefined
      }
      approve_payroll_period_atomic: {
        Args: {
          p_actor_profile_id: string
          p_period_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      archive_customer_account_atomic: {
        Args: {
          p_actor_user_id: string
          p_customer_id: string
          p_operation_key: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      assign_work_order_line_technician_atomic: {
        Args: {
          p_assigned_by: string
          p_operation_key: string
          p_shop_id: string
          p_technician_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      attach_signed_inspection_pdf_atomic: {
        Args: {
          p_actor_user_id: string
          p_expected_sync_revision: number
          p_inspection_id: string
          p_pdf_sha256: string
          p_pdf_storage_path: string
          p_pdf_url: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      attach_stripe_acquisition_checkout: {
        Args: {
          p_checkout_session_id: string
          p_intent_id: string
          p_nonce: string
        }
        Returns: boolean
      }
      begin_financial_outbox_delivery: {
        Args: {
          p_delivery_id: string
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: boolean
      }
      begin_stripe_acquisition_intent: {
        Args: {
          p_founding_discount_applied: boolean
          p_nonce: string
          p_plan_key: string
          p_request_key: string
          p_stripe_price_id: string
          p_trial_days: number
        }
        Returns: {
          checkout_session_id: string
          intent_id: string
          intent_nonce: string
          intent_status: string
        }[]
      }
      book_portal_repair_quote_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_customer_id: string
          p_ends_at: string
          p_operation_key: string
          p_quote_line_id: string
          p_starts_at: string
          p_visit_type: string
        }
        Returns: Json
      }
      bootstrap_owner_atomic: {
        Args: {
          p_business_name: string
          p_city: string
          p_country: string
          p_owner_pin_hash: string
          p_postal_code: string
          p_province: string
          p_shop_name: string
          p_street: string
          p_timezone: string
        }
        Returns: {
          created_shop: boolean
          shop_id: string
        }[]
      }
      can_access_conversation: {
        Args: { actor_user_id?: string; target_conversation_id: string }
        Returns: boolean
      }
      can_access_estimate_quote_line: {
        Args: {
          p_action: string
          p_metadata: Json
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: boolean
      }
      can_manage_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      can_read_estimate_internal_details: {
        Args: { p_shop_id: string }
        Returns: boolean
      }
      can_select_estimate_quote_line: {
        Args: {
          p_approved_at: string
          p_declined_at: string
          p_deferred_at: string
          p_sent_to_customer_at: string
          p_shop_id: string
          p_stage: string
          p_status: string
          p_work_order_id: string
          p_work_order_line_id: string
        }
        Returns: boolean
      }
      can_select_estimate_work_order: {
        Args: {
          p_customer_id: string
          p_estimate_number: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: boolean
      }
      can_update_estimate_part_request_items: {
        Args: { p_shop_id: string }
        Returns: boolean
      }
      can_update_part_request_items: {
        Args: { p_shop_id: string }
        Returns: boolean
      }
      canonical_shop_membership_role: {
        Args: { p_role: string }
        Returns: string
      }
      chat_participants_key: {
        Args: { _recipients: string[]; _sender: string }
        Returns: string
      }
      check_plan_limit: { Args: { _feature: string }; Returns: boolean }
      claim_completed_repair_learning_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_lease_token: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      claim_completed_repair_learning_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
        }
        Returns: {
          actor_user_id: string
          lease_token: string
          shop_id: string
          work_order_line_id: string
        }[]
      }
      claim_financial_outbox_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
        }
        Returns: {
          aggregate_id: string
          attempts: number
          dedupe_key: string
          event_type: string
          outbox_id: string
          payload: Json
          shop_id: string
        }[]
      }
      claim_financial_outbox_delivery: {
        Args: {
          p_lease_seconds?: number
          p_outbox_id: string
          p_recipient_email: string
          p_recipient_kind: string
          p_worker_id: string
        }
        Returns: {
          delivery_attempts: number
          delivery_id: string
          delivery_key: string
          delivery_status: string
          should_send: boolean
        }[]
      }
      claim_stripe_acquisition_intent: {
        Args: {
          p_checkout_email: string
          p_checkout_session_id: string
          p_customer_id: string
          p_intent_id: string
          p_nonce: string
          p_stripe_price_id: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: {
          claimed: boolean
          denial_reason: string
          shop_id: string
        }[]
      }
      claim_stripe_webhook_event: {
        Args: {
          p_event_created_at: string
          p_event_id: string
          p_event_type: string
          p_lease_seconds: number
          p_livemode: boolean
          p_object_id: string
          p_stripe_account_id: string
        }
        Returns: {
          already_processed: boolean
          attempt_count: number
          claim_token: string
          claimed: boolean
          in_progress: boolean
        }[]
      }
      clear_auth: { Args: never; Returns: undefined }
      close_work_order_correction_session: {
        Args: {
          p_actor_user_id: string
          p_correction_session_id: string
          p_metadata?: Json
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          id: string
          invoice_version_id: string | null
          metadata: Json
          opened_at: string
          opened_by: string | null
          operation_key: string
          reason: string
          scope: string
          shop_id: string
          status: string
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_order_correction_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_ai_route_quota: {
        Args: {
          p_actor_id: string
          p_actual_cost_usd: number
          p_feature: string
          p_receipt_id: string
          p_shop_id: string
          p_succeeded: boolean
        }
        Returns: boolean
      }
      complete_canonical_shift: {
        Args: {
          p_profile_id: string
          p_shift_id: string
          p_shop_id: string
          p_timestamp?: string
          p_user_id: string
        }
        Returns: {
          end_time: string
          id: string
          inserted_events: Json
          shop_id: string
          start_time: string
          status: string
          user_id: string
        }[]
      }
      complete_estimate_parts_quote_atomic: {
        Args: {
          p_expected_revision: number
          p_idempotency_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      complete_financial_outbox_claim: {
        Args: { p_outbox_id: string; p_worker_id: string }
        Returns: boolean
      }
      complete_scheduled_shift_end_atomic: {
        Args: {
          p_execution_time?: string
          p_schedule_date?: string
          p_schedule_source?: string
          p_scheduled_end: string
          p_shift_id: string
          p_shop_id: string
          p_user_id: string
        }
        Returns: Json
      }
      complete_stripe_webhook_event: {
        Args: { p_claim_token: string; p_event_id: string }
        Returns: boolean
      }
      consume_agent_human_approval_intent: {
        Args: {
          p_approval_kind: string
          p_approver_user_id: string
          p_engineering_case_id: string
          p_mission_id?: string
          p_token_sha256: string
        }
        Returns: boolean
      }
      consume_ai_route_quota: {
        Args: {
          p_actor_id: string
          p_actor_max: number
          p_feature: string
          p_hard_budget_usd: number
          p_reservation_cost_usd: number
          p_shop_id: string
          p_shop_max: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          denial_reason: string
          receipt_id: string
          retry_after_seconds: number
        }[]
      }
      consume_vehicle_recall_fetch_quota: {
        Args: { p_actor_id: string; p_shop_id: string; p_vehicle_id: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      convert_fleet_service_request_to_work_order_atomic: {
        Args: { p_service_request_id: string }
        Returns: {
          conversion_status: string
          work_order_id: string
        }[]
      }
      convert_owned_fleet_service_request_to_work_order_atomic: {
        Args: { p_service_request_id: string }
        Returns: {
          conversion_status: string
          work_order_id: string
        }[]
      }
      correct_work_order_line_labor_segment: {
        Args: {
          p_action: string
          p_actor_profile_id: string
          p_ended_at: string
          p_reason: string
          p_segment_id: string
          p_shop_id: string
          p_started_at: string
          p_technician_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      create_actor_messaging_conversation: {
        Args: {
          _booking_id: string
          _channel: string
          _context_id: string
          _context_type: string
          _conversation_id: string
          _created_by: string
          _customer_id: string
          _participants: Json
          _shop_id: string
          _title: string
          _vehicle_id: string
          _work_order_id: string
        }
        Returns: string
      }
      create_customer_account_atomic: {
        Args: {
          p_account_type: string
          p_actor_user_id?: string
          p_address?: string
          p_allow_duplicate?: boolean
          p_business_name?: string
          p_city?: string
          p_email?: string
          p_match_existing?: boolean
          p_name: string
          p_notes?: string
          p_operation_key?: string
          p_phone?: string
          p_postal_code?: string
          p_province?: string
          p_shop_id: string
          p_vin?: string
        }
        Returns: Json
      }
      create_customer_pricing_agreement_atomic: {
        Args: {
          p_actor_user_id: string
          p_approval_reason: string
          p_at?: string
          p_currency: string
          p_customer_id: string
          p_effective_from: string
          p_effective_until: string
          p_labor_discount_percent: number
          p_labor_rate: number
          p_name: string
          p_notes: string
          p_operation_key: string
          p_parts_discount_percent: number
          p_shop_id: string
          p_source_type: string
        }
        Returns: Json
      }
      create_customer_pricing_agreement_v2_atomic: {
        Args: {
          p_actor_user_id: string
          p_approval_reason: string
          p_at?: string
          p_currency: string
          p_customer_fee_cap: number
          p_customer_fee_type: string
          p_customer_fee_value: number
          p_customer_id: string
          p_effective_from: string
          p_effective_until: string
          p_expiry_warning_days: number
          p_labor_discount_percent: number
          p_labor_rate: number
          p_minimum_parts_margin_percent: number
          p_name: string
          p_notes: string
          p_operation_key: string
          p_parts_discount_percent: number
          p_parts_markup_matrix: Json
          p_shop_id: string
          p_source_type: string
        }
        Returns: Json
      }
      create_estimate_atomic: {
        Args: {
          p_customer: Json
          p_expires_at: string
          p_idempotency_key: string
          p_lines: Json
          p_notes: string
          p_shop_id: string
          p_vehicle: Json
        }
        Returns: Json
      }
      create_fleet_service_request_atomic: {
        Args: {
          p_fleet_id: string
          p_lines: Json
          p_operation_key: string
          p_requested_for_date: string
          p_summary: string
          p_title: string
          p_vehicle_id: string
        }
        Returns: string
      }
      create_menu_item_with_parts_intake: {
        Args: {
          p_actor_auth_user_id: string
          p_actor_profile_id: string
          p_idempotency_key: string
          p_item: Json
          p_parts: Json
          p_shop_id: string
        }
        Returns: Json
      }
      create_messaging_conversation: {
        Args: {
          _booking_id: string
          _channel: string
          _context_id: string
          _context_type: string
          _conversation_id: string
          _created_by: string
          _customer_id: string
          _participant_kinds: string[]
          _participant_user_ids: string[]
          _shop_id: string
          _title: string
          _vehicle_id: string
          _work_order_id: string
        }
        Returns: string
      }
      create_part_request_with_items: {
        Args: {
          p_items: Json
          p_job_id?: string
          p_notes?: string
          p_work_order_id: string
        }
        Returns: string
      }
      create_portal_quote_request_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_customer_id: string
          p_description: string
          p_fulfillment: string
          p_notes: string
          p_operation_key: string
          p_qty: number
          p_request_kind: string
          p_shop_id: string
          p_vehicle_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      create_work_order_with_custom_id: {
        Args: {
          p_advisor_id?: string
          p_customer_id: string
          p_is_waiter?: boolean
          p_notes?: string
          p_priority?: number
          p_shop_id: string
          p_vehicle_id: string
        }
        Returns: {
          advisor_id: string | null
          approval_state: string | null
          assigned_tech: string | null
          created_at: string | null
          created_by: string | null
          custom_id: string | null
          customer_agreed_at: string | null
          customer_approval_at: string | null
          customer_approval_signature_path: string | null
          customer_approval_signature_url: string | null
          customer_approved_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_pricing_fee_agreement_id: string | null
          customer_pricing_fee_resolved_at: string | null
          customer_pricing_fee_total: number | null
          customer_signature_url: string | null
          estimate_authorized_at: string | null
          estimate_converted_at: string | null
          estimate_created_at: string | null
          estimate_created_by: string | null
          estimate_expires_at: string | null
          estimate_number: string | null
          estimate_parts_completed_at: string | null
          estimate_parts_completed_by: string | null
          estimate_revision: number
          estimate_sent_at: string | null
          estimate_sent_by: string | null
          estimate_status: string | null
          expected_completion_at: string | null
          external_id: string | null
          id: string
          import_confidence: number | null
          import_notes: string | null
          inspection_id: string | null
          inspection_pdf_url: string | null
          inspection_type: string | null
          intake_json: Json | null
          intake_status: string | null
          intake_submitted_at: string | null
          intake_submitted_by: string | null
          invoice_last_sent_to: string | null
          invoice_pdf_url: string | null
          invoice_sent_at: string | null
          invoice_total: number | null
          invoice_url: string | null
          is_waiter: boolean
          labor_total: number | null
          notes: string | null
          odometer_km: number | null
          outstanding_balance: number
          paid_at: string | null
          parts_total: number | null
          payment_status: string
          portal_submitted_at: string | null
          priority: number | null
          quote: Json | null
          quote_url: string | null
          record_type: string
          scheduled_at: string | null
          shop_id: string
          shop_supplies_amount_override: number | null
          shop_supplies_enabled_override: boolean | null
          source_fleet_program_id: string | null
          source_fleet_service_request_id: string | null
          source_intake_id: string | null
          source_row_id: string | null
          status: string
          type: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_color: string | null
          vehicle_drivetrain: string | null
          vehicle_engine: string | null
          vehicle_engine_hours: number | null
          vehicle_fuel_type: string | null
          vehicle_id: string | null
          vehicle_info: string | null
          vehicle_license_plate: string | null
          vehicle_make: string | null
          vehicle_mileage: number | null
          vehicle_model: string | null
          vehicle_submodel: string | null
          vehicle_transmission: string | null
          vehicle_unit_number: string | null
          vehicle_vin: string | null
          vehicle_year: number | null
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_shop_id: { Args: never; Returns: string }
      delete_menu_item_with_parts_intake: {
        Args: {
          p_actor_auth_user_id: string
          p_actor_profile_id: string
          p_menu_item_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      dispatch_actor_profile_id: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: string
      }
      dispatch_assign_service_visit_atomic: {
        Args: {
          p_actor_user_id: string
          p_assigned_user_id: string
          p_expected_version: number
          p_operation_key: string
          p_service_vehicle_id: string
          p_shop_id: string
          p_visit_id: string
        }
        Returns: Json
      }
      dispatch_board_snapshot: {
        Args: {
          p_actor_user_id: string
          p_shop_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: Json
      }
      dispatch_can_execute: {
        Args: { p_actor_user_id: string; p_shop_id: string; p_visit_id: string }
        Returns: boolean
      }
      dispatch_can_manage: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: boolean
      }
      dispatch_create_service_visit_atomic: {
        Args: {
          p_actor_user_id: string
          p_assigned_user_id: string
          p_booking_id: string
          p_dispatch_notes: string
          p_estimated_distance_km: number
          p_estimated_travel_minutes: number
          p_mode: string
          p_operation_key: string
          p_scheduled_end: string
          p_scheduled_start: string
          p_service_address_id: string
          p_service_vehicle_id: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      dispatch_mobile_active_snapshot: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: Json
      }
      dispatch_record_visit_event: {
        Args: {
          p_actor_user_id: string
          p_event_type: string
          p_from_status?: string
          p_metadata?: Json
          p_to_status?: string
          p_visit_id: string
        }
        Returns: undefined
      }
      dispatch_reschedule_service_visit_atomic: {
        Args: {
          p_actor_user_id: string
          p_ends_at: string
          p_expected_version: number
          p_operation_key: string
          p_shop_id: string
          p_starts_at: string
          p_visit_id: string
        }
        Returns: Json
      }
      dispatch_sync_event_status: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      dispatch_sync_primary_resource: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      dispatch_sync_technician_reservation: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      dispatch_transition_service_visit_atomic: {
        Args: {
          p_actor_user_id: string
          p_actual_distance_km: number
          p_actual_travel_minutes: number
          p_expected_version: number
          p_operation_key: string
          p_shop_id: string
          p_to_status: string
          p_visit_id: string
        }
        Returns: Json
      }
      dispatch_update_service_visit_atomic: {
        Args: {
          p_actor_user_id: string
          p_dispatch_notes: string
          p_estimated_distance_km: number
          p_estimated_travel_minutes: number
          p_expected_version: number
          p_operation_key: string
          p_service_address_id: string
          p_shop_id: string
          p_visit_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      dispatch_visit_history: {
        Args: { p_actor_user_id: string; p_shop_id: string; p_visit_id: string }
        Returns: Json
      }
      dispatch_visit_snapshot: { Args: { p_visit_id: string }; Returns: Json }
      estimate_actor_for_shop: {
        Args: { p_allowed_roles: string[]; p_shop_id: string }
        Returns: {
          canonical_role: string
          profile_id: string
        }[]
      }
      evaluate_fleet_pm_due_events: {
        Args: { p_fleet_id: string; p_vehicle_id?: string }
        Returns: {
          created: boolean
          due_event_id: string
          policy_id: string
          vehicle_id: string
        }[]
      }
      evaluate_fleet_pretrip_compliance: {
        Args: { p_at?: string }
        Returns: Json
      }
      fail_stripe_webhook_event: {
        Args: { p_claim_token: string; p_error: string; p_event_id: string }
        Returns: boolean
      }
      field_actor_can_access_service_vehicle: {
        Args: { p_service_vehicle_id: string; p_shop_id: string }
        Returns: boolean
      }
      field_assign_service_vehicle: {
        Args: {
          p_profile_id: string
          p_service_vehicle_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      field_receive_po_part_to_truck_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_purchase_order_id: string
          p_purchase_order_line_id: string
          p_quantity: number
          p_service_vehicle_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      field_resolve_or_create_part_identity_atomic: {
        Args: {
          p_actor_user_id: string
          p_code: string
          p_connection_id?: string
          p_create_if_missing?: boolean
          p_external_id?: string
          p_manufacturer?: string
          p_metadata?: Json
          p_name?: string
          p_operation_key?: string
          p_package_quantity?: number
          p_part_number?: string
          p_provider?: string
          p_shop_id: string
          p_supplier_id?: string
          p_supplier_sku?: string
          p_unit_cost?: number
          p_unit_of_measure?: string
          p_unit_sell_price?: number
        }
        Returns: Json
      }
      field_return_truck_part_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_quantity: number
          p_service_visit_id: string
          p_shop_id: string
          p_work_order_part_id: string
        }
        Returns: Json
      }
      field_storage_path_uuid: { Args: { p_value: string }; Returns: string }
      field_transfer_stock_to_truck_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_part_id: string
          p_quantity: number
          p_service_vehicle_id: string
          p_shop_id: string
          p_source_location_id: string
        }
        Returns: Json
      }
      field_transfer_stock_to_truck_authorized_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_part_id: string
          p_quantity: number
          p_service_vehicle_id: string
          p_shop_id: string
          p_source_location_id: string
        }
        Returns: Json
      }
      field_transition_truck_record: {
        Args: { p_action: string; p_ended_at?: string; p_record_id: string }
        Returns: Json
      }
      field_truck_inventory_activity: {
        Args: {
          p_actor_user_id: string
          p_limit?: number
          p_service_vehicle_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      field_truck_inventory_snapshot: {
        Args: {
          p_actor_user_id: string
          p_query?: string
          p_service_vehicle_id?: string
          p_service_visit_id?: string
          p_shop_id: string
        }
        Returns: Json
      }
      field_truck_inventory_snapshot_with_activity: {
        Args: {
          p_activity_limit?: number
          p_actor_user_id: string
          p_query?: string
          p_service_vehicle_id?: string
          p_service_visit_id?: string
          p_shop_id: string
        }
        Returns: Json
      }
      field_use_truck_part_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_part_id: string
          p_quantity: number
          p_service_visit_id: string
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      finalize_estimate_send_atomic: {
        Args: {
          p_actor_profile_id: string
          p_actor_user_id: string
          p_event_id: string
          p_quote_url: string
          p_revision: number
          p_sent_at: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      finalize_inspection_pdf_atomic: {
        Args: {
          p_actor_user_id: string
          p_expected_sync_revision: number
          p_inspection_id: string
          p_pdf_sha256: string
          p_pdf_storage_path: string
          p_pdf_url: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      finalize_invoice_version: {
        Args: {
          p_actor_user_id: string
          p_currency: string
          p_discount_total: number
          p_invoice_id: string
          p_operation_key: string
          p_shop_id: string
          p_snapshot: Json
          p_subtotal: number
          p_tax_total: number
          p_total: number
          p_work_order_id: string
        }
        Returns: {
          created_at: string
          currency: string
          discount_total: number
          id: string
          invoice_id: string | null
          issued_at: string | null
          issued_by: string | null
          lifecycle_status: string
          outstanding_total: number | null
          paid_total: number
          refunded_total: number
          shop_id: string
          snapshot: Json
          snapshot_hash: string
          subtotal: number
          superseded_by_invoice_version_id: string | null
          supersedes_invoice_version_id: string | null
          tax_total: number
          total: number
          updated_at: string
          version_number: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_payroll_export_atomic: {
        Args: {
          p_actor_profile_id: string
          p_batch_id: string
          p_file_sha256: string
          p_file_size_bytes: number
          p_period_id: string
          p_provider_template_version: string
          p_shop_id: string
          p_storage_bucket: string
          p_storage_path: string
        }
        Returns: Json
      }
      find_customer_account_duplicates: {
        Args: {
          p_actor_user_id?: string
          p_business_name?: string
          p_email?: string
          p_exclude_customer_id?: string
          p_name?: string
          p_phone?: string
          p_shop_id: string
          p_vin?: string
        }
        Returns: Json
      }
      finish_completed_repair_learning_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_lease_token: string
          p_result?: Json
          p_shop_id: string
          p_succeeded: boolean
          p_work_order_line_id: string
        }
        Returns: Json
      }
      finish_completed_repair_learning_worker: {
        Args: {
          p_actor_user_id: string
          p_lease_token: string
          p_result?: Json
          p_shop_id: string
          p_succeeded: boolean
          p_work_order_line_id: string
        }
        Returns: Json
      }
      first_segment_uuid: { Args: { p: string }; Returns: string }
      fleet_defect_descriptor: { Args: { p_key: string }; Returns: Json }
      get_customer_account_center: {
        Args: {
          p_actor_user_id?: string
          p_customer_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      get_customer_pricing_account_summary: {
        Args: { p_at?: string; p_customer_id: string; p_shop_id: string }
        Returns: Json
      }
      get_fleet_defect_queue: { Args: { p_fleet_id?: string }; Returns: Json }
      get_invoice_net_issued_parts: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: Json
      }
      get_operational_observability_health: {
        Args: { p_now?: string }
        Returns: {
          ai_active_recommendation_count: number
          ai_cron_probably_running: boolean
          ai_last_expiration_event_at: string
          ai_pending_approval_count: number
          ai_stale_recommendation_count: number
          events_last_24h: number
          events_last_6h: number
          events_previous_24h: number
          health_status: string
          last_event_at: string
          recent_business_writes: number
          shop_id: string
          unresolved_failure_count: number
        }[]
      }
      get_work_order_assignments: {
        Args: { p_work_order_id: string }
        Returns: {
          full_name: string
          has_active: boolean
          role: string
          technician_id: string
        }[]
      }
      has_column: { Args: { _col: string; _table: unknown }; Returns: boolean }
      import_inspection_quote_package_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_inspection_id: string
          p_items: Json
          p_operation_key: string
          p_requested_vehicle_id: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      increment_user_limit: {
        Args: { increment_by?: number; input_shop_id: string }
        Returns: undefined
      }
      insert_ai_event: {
        Args: {
          p_entity_id?: string
          p_entity_table?: string
          p_event_type: string
          p_payload: Json
          p_shop_id: string
          p_training_source?: string
          p_user_id?: string
        }
        Returns: string
      }
      invoice_is_historical_import: {
        Args: { p_metadata: Json }
        Returns: boolean
      }
      is_agent_developer: { Args: never; Returns: boolean }
      is_customer: { Args: { _customer: string }; Returns: boolean }
      is_shop_member: { Args: { p_shop: string }; Returns: boolean }
      is_shop_member_v2: { Args: { shop_id: string }; Returns: boolean }
      is_staff_for_shop: { Args: { _shop: string }; Returns: boolean }
      manage_fleet_driver_intake: {
        Args: {
          p_action: string
          p_action_date?: string
          p_defect_ids: string[]
          p_reason?: string
          p_resolution_code?: string
          p_response_type?: string
        }
        Returns: Json
      }
      manage_fleet_pm_program: {
        Args: {
          p_action: string
          p_assignment_mode: string
          p_cadence: string
          p_fleet_id: string
          p_interval_days: number
          p_interval_hours: number
          p_interval_km: number
          p_name: string
          p_notes: string
          p_operation_key: string
          p_program_id: string
          p_requires_fleet_approval: boolean
          p_tasks: Json
          p_vehicle_ids: string[]
        }
        Returns: Json
      }
      manage_fleet_unit_defects: {
        Args: {
          p_action: string
          p_defect_ids: string[]
          p_deferred_until?: string
          p_reason?: string
          p_requested_for_date?: string
        }
        Returns: Json
      }
      manage_fleet_unit_enrollment: {
        Args: {
          p_action: string
          p_driver_profile_id?: string
          p_fleet_id: string
          p_license_plate?: string
          p_make?: string
          p_model?: string
          p_nickname?: string
          p_pretrip_due_local_time?: string
          p_route_label?: string
          p_unit_number?: string
          p_vehicle_id?: string
          p_vin?: string
          p_year?: number
        }
        Returns: Json
      }
      manage_fleet_workspace: {
        Args: {
          p_action: string
          p_contact_email?: string
          p_contact_name?: string
          p_contact_phone?: string
          p_fleet_id: string
          p_member_user_id?: string
          p_name?: string
          p_notes?: string
          p_role?: string
        }
        Returns: Json
      }
      mark_active: { Args: never; Returns: undefined }
      mark_all_portal_notifications_read: { Args: never; Returns: number }
      mark_financial_outbox_delivery_ambiguous: {
        Args: { p_delivery_id: string; p_error: string; p_worker_id: string }
        Returns: boolean
      }
      mark_portal_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      mark_work_order_ready_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      match_learned_job_templates: {
        Args: { p_embedding: string; p_match_count?: number; p_shop_id: string }
        Returns: {
          confidence_score: number
          default_labor_hours: number
          default_parts: Json
          id: string
          job_category: string
          label: string
          similarity: number
          tags: Json
          usage_count: number
        }[]
      }
      match_work_order_intelligence: {
        Args: { p_embedding: string; p_match_count?: number; p_shop_id: string }
        Returns: {
          cause: string
          complaint: string
          correction: string
          id: string
          job_category: string
          labor_time: number
          parts: Json
          similarity: number
          symptom: string
          tags: Json
          vehicle_make: string
          vehicle_model: string
          vehicle_year: number
        }[]
      }
      materialize_offline_parts_request_draft_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_payload: Json
          p_shop_id: string
          p_work_order_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      materialize_offline_work_order_draft_atomic: {
        Args: {
          p_actor_user_id: string
          p_customer_id: string
          p_operation_key: string
          p_payload: Json
          p_shop_id: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      merge_customer_accounts_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_reason: string
          p_shop_id: string
          p_source_customer_id: string
          p_target_customer_id: string
        }
        Returns: Json
      }
      mobile_actor_has_field_service_access: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: boolean
      }
      mobile_actor_is_field_operator: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: boolean
      }
      mobile_can_manage_followups: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: boolean
      }
      mobile_can_manage_work_orders: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: boolean
      }
      mobile_configure_service_v1_atomic: {
        Args: {
          p_actor_user_id: string
          p_default_visit_minutes: number
          p_dispatch_enabled: boolean
          p_enable_current_actor_field_operator: boolean
          p_field_operator_count_target: number
          p_service_model: string
          p_service_vehicle_name: string
          p_service_vehicle_unit_number: string
          p_service_vehicles_enabled: boolean
          p_shop_id: string
          p_solo_mode: boolean
          p_truck_inventory_enabled: boolean
        }
        Returns: Json
      }
      mobile_create_service_call_atomic: {
        Args: {
          p_actor_user_id: string
          p_address_line1: string
          p_city: string
          p_concern: string
          p_currency: string
          p_customer_id: string
          p_customer_name: string
          p_duration_minutes: number
          p_operation_key: string
          p_phone: string
          p_postal_code: string
          p_province_state: string
          p_quoted_price: number
          p_service_mode: string
          p_shop_id: string
          p_starts_at: string
          p_vehicle_id: string
          p_vehicle_make: string
          p_vehicle_model: string
          p_vehicle_plate: string
          p_vehicle_year: number
        }
        Returns: Json
      }
      mobile_create_service_followup_atomic: {
        Args: {
          p_actor_user_id: string
          p_disposition: string
          p_estimated_amount: number
          p_follow_up_at: string
          p_notes: string
          p_operation_key: string
          p_recommendation: string
          p_service_visit_id: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      mobile_dispatch_profile_eligible: {
        Args: { p_profile_id: string; p_shop_id: string }
        Returns: boolean
      }
      mobile_is_field_operator: {
        Args: { p_profile_id: string; p_shop_id: string }
        Returns: boolean
      }
      mobile_is_shop_member: { Args: { p_shop_id: string }; Returns: boolean }
      mobile_materialize_service_visit_work_order_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_shop_id: string
          p_visit_id: string
        }
        Returns: Json
      }
      mobile_profile_has_field_service_access: {
        Args: { p_profile_id: string; p_shop_id: string }
        Returns: boolean
      }
      mobile_replay_service_visit_transition_atomic: {
        Args: {
          p_actor_user_id: string
          p_expected_version: number
          p_from_status: string
          p_operation_key: string
          p_shop_id: string
          p_to_status: string
          p_visit_id: string
        }
        Returns: Json
      }
      mobile_update_service_followup_status_atomic: {
        Args: {
          p_actor_user_id: string
          p_converted_work_order_id: string
          p_followup_id: string
          p_operation_key: string
          p_shop_id: string
          p_status: string
        }
        Returns: Json
      }
      open_work_order_correction_session: {
        Args: {
          p_actor_user_id: string
          p_metadata?: Json
          p_operation_key: string
          p_reason: string
          p_scope: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          id: string
          invoice_version_id: string | null
          metadata: Json
          opened_at: string
          opened_by: string | null
          operation_key: string
          reason: string
          scope: string
          shop_id: string
          status: string
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_order_correction_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      part_request_item_is_quote_ready: {
        Args: {
          p_description: string
          p_part_id: string
          p_qty: number
          p_requested_manufacturer: string
          p_requested_part_number: string
          p_unit_price: number
        }
        Returns: boolean
      }
      parts_allocate_request_item: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_qty: number
          p_request_item_id: string
        }
        Returns: Json
      }
      parts_allocated: {
        Args: { p_location_id?: string; p_part_id: string; p_shop_id: string }
        Returns: number
      }
      parts_assert_work_order_mutable: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: undefined
      }
      parts_attach_and_issue_line_part_atomic: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_part_id: string
          p_qty: number
          p_unit_cost: number
          p_work_order_line_id: string
        }
        Returns: Json
      }
      parts_attach_inventory_to_request_item_atomic: {
        Args: { p_item_id: string; p_part_id: string }
        Returns: Json
      }
      parts_attach_request_item: {
        Args: { p_request_item_id: string }
        Returns: string
      }
      parts_attach_request_item_unchecked: {
        Args: { p_request_item_id: string }
        Returns: string
      }
      parts_available: {
        Args: { p_location_id?: string; p_part_id: string; p_shop_id: string }
        Returns: number
      }
      parts_begin_operation: {
        Args: {
          p_actor_user_id: string
          p_aggregate_id: string
          p_aggregate_type: string
          p_operation_key: string
          p_operation_type: string
          p_shop_id: string
        }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          operation_key: string
          operation_type: string
          result: Json | null
          shop_id: string
        }
        SetofOptions: {
          from: "*"
          to: "parts_operation_keys"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      parts_cancel_request_item: {
        Args: { p_idempotency_key: string; p_request_item_id: string }
        Returns: Json
      }
      parts_commit_request_package_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_request_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      parts_complete_operation: {
        Args: { p_operation_id: string; p_result: Json }
        Returns: Json
      }
      parts_complete_request_handoff_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_operation_key: string
          p_request_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      parts_create_and_attach_inventory_atomic: {
        Args: {
          p_category: string
          p_cost: number
          p_initial_qty: number
          p_item_id: string
          p_location_id: string
          p_manufacturer: string
          p_name: string
          p_operation_key: string
          p_part_number: string
          p_sell_price: number
          p_sku: string
          p_supplier: string
        }
        Returns: Json
      }
      parts_create_or_reuse_po_line_for_request: {
        Args: {
          p_idempotency_key: string
          p_location_id?: string
          p_notes?: string
          p_po_id?: string
          p_qty: number
          p_request_item_id: string
          p_supplier_id?: string
          p_unit_cost?: number
        }
        Returns: Json
      }
      parts_create_po_line_for_request: {
        Args: {
          p_idempotency_key?: string
          p_location_id?: string
          p_po_id: string
          p_qty: number
          p_request_item_id: string
          p_unit_cost?: number
        }
        Returns: Json
      }
      parts_create_supplier_quote_request: {
        Args: {
          p_channel: string
          p_idempotency_key: string
          p_item_ids: string[]
          p_message: string
          p_request_id: string
          p_subject: string
          p_supplier_id: string
        }
        Returns: Json
      }
      parts_dismiss_empty_request_atomic: {
        Args: {
          p_actor_user_id: string
          p_request_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      parts_ensure_request_quote_line: {
        Args: { p_request_id: string }
        Returns: Json
      }
      parts_ensure_work_order_part: {
        Args: { p_request_item_id: string }
        Returns: string
      }
      parts_issue_by_line_part_atomic: {
        Args: {
          p_actor_user_id: string
          p_location_id: string
          p_operation_key: string
          p_part_id: string
          p_qty: number
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      parts_issue_work_order_part: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_qty: number
          p_work_order_part_id: string
        }
        Returns: Json
      }
      parts_lifecycle_assert_line_access: {
        Args: { p_shop_id: string; p_work_order_line_id: string }
        Returns: undefined
      }
      parts_lifecycle_assert_shop_access: {
        Args: { p_shop_id: string }
        Returns: undefined
      }
      parts_lifecycle_status: {
        Args: {
          p_allocated: number
          p_cancelled: number
          p_consumed: number
          p_ordered: number
          p_received: number
          p_requested: number
          p_returned: number
        }
        Returns: string
      }
      parts_mark_purchase_order_contacted: {
        Args: { p_channel: string; p_idempotency_key: string; p_po_id: string }
        Returns: Json
      }
      parts_on_hand: {
        Args: { p_location_id?: string; p_part_id: string; p_shop_id: string }
        Returns: number
      }
      parts_place_purchase_order: {
        Args: {
          p_contact_channel?: string
          p_idempotency_key: string
          p_po_id: string
        }
        Returns: Json
      }
      parts_publish_request_notification: {
        Args: { p_request_id: string; p_stage: string }
        Returns: undefined
      }
      parts_publish_request_notification_with_table: {
        Args: { p_request_id: string; p_stage: string }
        Returns: undefined
      }
      parts_receive_free_text_po_line: {
        Args: {
          p_idempotency_key: string
          p_po_id: string
          p_po_line_id: string
          p_qty: number
        }
        Returns: Json
      }
      parts_receive_request_item: {
        Args: {
          p_idempotency_key?: string
          p_location_id: string
          p_po_line_id?: string
          p_qty: number
          p_request_item_id: string
          p_unit_cost?: number
        }
        Returns: Json
      }
      parts_reconcile_pick_request_notification: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      parts_reconcile_request_lifecycle: {
        Args: { p_request_id: string }
        Returns: Json
      }
      parts_reconcile_work_order_part: {
        Args: { p_work_order_part_id: string }
        Returns: undefined
      }
      parts_record_supplier_quote_response: {
        Args: {
          p_idempotency_key: string
          p_items: Json
          p_quote_request_id: string
          p_response_notes: string
        }
        Returns: Json
      }
      parts_replace_request_item: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_new_part_id: string
          p_qty: number
          p_request_item_id: string
        }
        Returns: Json
      }
      parts_request_is_operationally_released: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      parts_request_operational_stage: {
        Args: { p_request_id: string }
        Returns: string
      }
      parts_request_pick_for_line_atomic: {
        Args: {
          p_actor_user_id?: string
          p_operation_key?: string
          p_source?: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      parts_request_work_order_line_atomic: {
        Args: {
          p_actor_user_id?: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      parts_return_to_stock: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_qty: number
          p_work_order_part_id: string
        }
        Returns: Json
      }
      parts_set_stock_on_hand_snapshot: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_metadata?: Json
          p_part_id: string
          p_shop_id: string
          p_target_qty: number
        }
        Returns: Json
      }
      parts_sync_technician_ready_notification: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      parts_sync_technician_ready_notification_with_table: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      parts_sync_work_order_line_fulfillment_status: {
        Args: { p_request_id: string; p_stage: string }
        Returns: undefined
      }
      parts_update_attach_allocate_item_atomic: {
        Args: {
          p_actor_user_id: string
          p_create_allocation: boolean
          p_description: string
          p_location_id: string
          p_operation_key: string
          p_part_id: string
          p_po_id: string
          p_qty: number
          p_request_item_id: string
          p_requested_manufacturer: string
          p_requested_part_number: string
          p_shop_id: string
          p_unit_sell_price: number
          p_warning_accepted: boolean
          p_warning_reason: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      parts_upsert_pick_request_notification: {
        Args: {
          p_remaining: number
          p_request_id: string
          p_required: number
          p_shop_id: string
          p_source: string
          p_staged: number
          p_work_order_id: string
          p_work_order_line_id: string
        }
        Returns: undefined
      }
      parts_void_work_order_line_atomic: {
        Args: {
          p_actor_user_id: string
          p_consumed_disposition: string
          p_mode: string
          p_note: string
          p_operation_key: string
          p_ordered_disposition: string
          p_reason: string
          p_received_disposition: string
          p_reserved_disposition: string
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      pause_all_active_technician_labor_atomic: {
        Args: {
          p_actor_user_id: string
          p_at: string
          p_details?: Json
          p_event: string
          p_operation_key: string
          p_reason: string
          p_shop_id: string
          p_source_event_id?: string
          p_technician_id: string
        }
        Returns: Json
      }
      plan_user_limit:
        | { Args: { p_plan: string }; Returns: number }
        | {
            Args: { p_plan: string; p_stripe_subscription_status: string }
            Returns: number
          }
      portal_request_start_atomic: {
        Args: {
          p_customer_id: string
          p_ends_at: string
          p_notes: string
          p_shop_id: string
          p_source_row_id?: string
          p_starts_at: string
          p_vehicle_id: string
          p_visit_type: string
        }
        Returns: {
          booking_id: string
          deduped: boolean
          work_order_id: string
        }[]
      }
      post_payment_event: {
        Args: {
          p_actor_user_id: string
          p_amount: number
          p_currency: string
          p_event_kind: string
          p_invoice_version_id: string
          p_metadata?: Json
          p_occurred_at: string
          p_operation_key: string
          p_payment_method: string
          p_processor: string
          p_processor_event_id: string
          p_processor_payment_id: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      process_sendgrid_delivery_event: {
        Args: {
          p_email_log_id: string
          p_error_text: string
          p_event_at: string
          p_event_type: string
          p_payload: Json
          p_provider_event_id: string
          p_provider_message_id: string
          p_suppression_email: string
        }
        Returns: boolean
      }
      profixiq_can_finalize_workforce: { Args: never; Returns: boolean }
      profixiq_can_manage_workforce: { Args: never; Returns: boolean }
      profixiq_current_role: { Args: never; Returns: string }
      profixiq_fleet_has_product_access: {
        Args: { p_fleet_id: string }
        Returns: boolean
      }
      profixiq_has_portal_customer_shop: {
        Args: { p_shop_id: string }
        Returns: boolean
      }
      profixiq_is_assigned_to_line: {
        Args: { p_line_id: string }
        Returns: boolean
      }
      profixiq_is_assigned_to_work_order: {
        Args: { p_work_order_id: string }
        Returns: boolean
      }
      profixiq_is_portal_customer_for: {
        Args: { p_customer_id: string; p_shop_id: string }
        Returns: boolean
      }
      profixiq_is_portal_customer_work_order: {
        Args: { p_work_order_id: string }
        Returns: boolean
      }
      profixiq_shop_has_product_access: {
        Args: { p_capability: string; p_shop_id: string }
        Returns: boolean
      }
      profixiq_workforce_profile_id: { Args: never; Returns: string }
      profixiq_workforce_role: { Args: never; Returns: string }
      profixiq_workforce_shop_id: { Args: never; Returns: string }
      quote_line_pricing_is_protected: {
        Args: {
          p_approved_at: string
          p_converted_at: string
          p_declined_at: string
          p_deferred_at: string
          p_sent_at: string
          p_sent_to_customer_at: string
          p_stage: string
          p_status: string
          p_work_order_line_id: string
        }
        Returns: boolean
      }
      realtime_conversation_id: { Args: { topic: string }; Returns: string }
      recalculate_estimate_work_order_totals: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: undefined
      }
      receive_part_request_item: {
        Args: {
          p_idempotency_key?: string
          p_item_id: string
          p_location_id: string
          p_po_id?: string
          p_qty: number
        }
        Returns: Json
      }
      receive_po_part_and_allocate:
        | {
            Args: {
              p_location_id: string
              p_part_id: string
              p_po_id: string
              p_qty: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_location_id: string
              p_operation_id: string
              p_part_id: string
              p_po_id: string
              p_qty: number
            }
            Returns: Json
          }
      reconcile_work_order_approval_state_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: string
      }
      record_offline_photo_receipt_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_payload: Json
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      record_payroll_export_download_atomic: {
        Args: {
          p_actor_profile_id: string
          p_batch_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      record_portal_enrollment_scan: {
        Args: { p_slug: string }
        Returns: boolean
      }
      record_stripe_acquisition_completion: {
        Args: {
          p_checkout_email: string
          p_checkout_session_id: string
          p_customer_id: string
          p_event_created_at: string
          p_event_id: string
          p_intent_id: string
          p_nonce: string
          p_stripe_price_id: string
          p_subscription_id: string
        }
        Returns: boolean
      }
      release_financial_outbox_claim: {
        Args: {
          p_error: string
          p_next_attempt_at: string
          p_outbox_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      remediate_quote_line_pricing_quarantine: {
        Args: {
          p_actor_user_id: string
          p_items: Json
          p_note?: string
          p_operation_key: string
          p_quote_line_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      reopen_inspection: {
        Args: { p_inspection_id: string; p_reason: string }
        Returns: Json
      }
      replace_payroll_period_snapshot: {
        Args: {
          p_actor_profile_id: string
          p_entries: Json
          p_exceptions: Json
          p_period_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      replace_shop_hours_atomic: {
        Args: { p_hours: Json; p_shop_id: string }
        Returns: undefined
      }
      replace_staff_schedule_template: {
        Args: {
          p_actor_profile_id: string
          p_shop_id: string
          p_target_user_id: string
          p_templates: Json
        }
        Returns: number
      }
      replace_work_order_line_flat_rate_credits: {
        Args: {
          p_actor_profile_id: string
          p_credits: Json
          p_line_id: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      reserve_estimate_send_atomic: {
        Args: {
          p_actor_profile_id: string
          p_actor_user_id: string
          p_allow_resend: boolean
          p_idempotency_key: string
          p_quote_line_ids: string[]
          p_revision: number
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      resolve_fleet_id_from_vehicle: {
        Args: { p_vehicle_id: string }
        Returns: string
      }
      respond_fleet_defect_clarification: {
        Args: {
          p_clarification_id: string
          p_evidence: Json
          p_response_text: string
        }
        Returns: Json
      }
      retire_customer_pricing_agreement_atomic: {
        Args: {
          p_actor_user_id: string
          p_agreement_id: string
          p_at?: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      return_estimate_to_parts_atomic: {
        Args: {
          p_expected_revision: number
          p_idempotency_key: string
          p_note: string
          p_quote_line_ids: string[]
          p_reason_code: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      review_menu_item_part_intake: {
        Args: {
          p_actor_auth_user_id: string
          p_actor_profile_id: string
          p_catalog_part_id: string
          p_operation_key: string
          p_quantity: number
          p_request_item_id: string
          p_shop_id: string
          p_unit_cost: number
        }
        Returns: Json
      }
      save_estimate_draft_atomic: {
        Args: {
          p_expected_revision: number
          p_expires_at: string
          p_idempotency_key: string
          p_lines: Json
          p_notes: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      save_fleet_pretrip_template: {
        Args: {
          p_failure_config: Json
          p_fleet_id: string
          p_name: string
          p_operation_key: string
          p_sections: Json
          p_vehicle_type: string
        }
        Returns: Json
      }
      save_inspection_progress_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_operation_key: string
          p_session: Json
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      save_inspection_progress_v2_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_operation_key: string
          p_session: Json
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      save_inspection_progress_v3_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_operation_key: string
          p_session: Json
          p_shop_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      save_staff_schedule_override_atomic: {
        Args: {
          p_actor_auth_user_id: string
          p_actor_profile_id: string
          p_end_time: string
          p_notes: string
          p_override_id: string
          p_schedule_date: string
          p_shop_id: string
          p_start_time: string
          p_status: string
          p_target_user_id: string
          p_unpaid_break_minutes: number
        }
        Returns: {
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          notes: string | null
          schedule_date: string
          shop_id: string
          source_type: string
          start_time: string | null
          status: string
          unpaid_break_minutes: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_schedule_overrides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_work_order_media_annotation_atomic: {
        Args: {
          p_client_mutation_id: string
          p_media_id: string
          p_overlay: Json
          p_visibility: string
        }
        Returns: Json
      }
      scheduler_actor_matches: {
        Args: { p_actor_user_id: string }
        Returns: boolean
      }
      scheduler_apply_booking_command_atomic: {
        Args: {
          p_action: string
          p_actor_mode: string
          p_actor_user_id: string
          p_at?: string
          p_booking_id: string
          p_customer_id: string
          p_ends_at: string
          p_mode?: string
          p_notes: string
          p_operation_key: string
          p_reason?: string
          p_resource_id?: string
          p_shop_id: string
          p_starts_at: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      scheduler_assign_event_resource_atomic: {
        Args: {
          p_actor_user_id: string
          p_event_id: string
          p_operation_key: string
          p_resource_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      scheduler_availability_snapshot: {
        Args: {
          p_mode?: string
          p_public_only?: boolean
          p_resource_id?: string
          p_shop_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: Json
      }
      scheduler_can_manage: { Args: { p_shop_id: string }; Returns: boolean }
      scheduler_list_events: {
        Args: {
          p_ends_at: string
          p_mode?: string
          p_shop_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      scheduler_list_resources: { Args: { p_shop_id: string }; Returns: Json }
      scheduler_pick_resource: {
        Args: {
          p_ends_at: string
          p_exclude_event_id?: string
          p_mode: string
          p_preferred_resource_id?: string
          p_public_only?: boolean
          p_shop_id: string
          p_starts_at: string
        }
        Returns: string
      }
      scheduler_rebalance_fallback_reservations: {
        Args: { p_mode: string; p_shop_id: string }
        Returns: number
      }
      scheduler_same_shop: { Args: { p_shop_id: string }; Returns: boolean }
      scheduler_upsert_resource: {
        Args: {
          p_active: boolean
          p_actor_user_id: string
          p_code: string
          p_mode: string
          p_name: string
          p_public_bookable: boolean
          p_resource_id: string
          p_resource_type: string
          p_shop_id: string
          p_sort_order?: number
        }
        Returns: Json
      }
      search_estimate_work_order_ids: {
        Args: {
          p_limit: number
          p_mode: string
          p_offset: number
          p_search: string
          p_shop_id: string
          p_status: string
        }
        Returns: {
          work_order_id: string
        }[]
      }
      seed_default_hours: { Args: { shop_id: string }; Returns: undefined }
      send_for_approval: {
        Args: { _line_ids: string[]; _set_wo_status?: boolean; _wo: string }
        Returns: undefined
      }
      set_authenticated: { Args: { uid: string }; Returns: undefined }
      set_current_shop_id: { Args: { p_shop_id: string }; Returns: undefined }
      set_last_active_now: { Args: never; Returns: undefined }
      set_part_request_status: {
        Args: {
          p_request: string
          p_status: Database["public"]["Enums"]["part_request_status"]
        }
        Returns: undefined
      }
      set_shop_role_capability_policy_atomic: {
        Args: { p_capability_key: string; p_effect: string; p_role_key: string }
        Returns: Json
      }
      set_staff_capability_override_atomic: {
        Args: {
          p_capability_key: string
          p_effect: string
          p_target_profile_id: string
        }
        Returns: Json
      }
      shop_assistant_add_work_order_line_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_description: string
          p_job_type?: string
          p_labor_time?: number
          p_notes?: string
          p_price_estimate?: number
          p_shop_id: string
          p_urgency?: string
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_assert_line_snapshot: {
        Args: {
          p_mode: string
          p_only_unassigned?: boolean
          p_shop_id: string
          p_target_versions: Json
          p_work_order_id: string
        }
        Returns: number
      }
      shop_assistant_assign_work_order_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_only_unassigned?: boolean
          p_shop_id: string
          p_technician_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_cancel_booking_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_booking_id: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_convert_fleet_service_request_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_service_request_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_create_booking_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_customer_id: string
          p_ends_at: string
          p_mode?: string
          p_notes?: string
          p_resource_id?: string
          p_shop_id: string
          p_starts_at: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      shop_assistant_create_customer_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_email?: string
          p_name: string
          p_phone?: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_create_fleet_service_request_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_fleet_id: string
          p_requested_for_date?: string
          p_shop_id: string
          p_summary: string
          p_title: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      shop_assistant_create_inventory_part_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_category: string
          p_cost: number
          p_description: string
          p_initial_quantity: number
          p_location_id: string
          p_low_stock_threshold: number
          p_manufacturer: string
          p_name: string
          p_part_number: string
          p_price: number
          p_reorder_quantity: number
          p_shop_id: string
          p_sku: string
        }
        Returns: Json
      }
      shop_assistant_create_part_request_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_items: Json
          p_notes?: string
          p_shop_id: string
          p_work_order_id: string
          p_work_order_line_id: string
        }
        Returns: Json
      }
      shop_assistant_create_purchase_order_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_expected_at: string
          p_lines: Json
          p_notes: string
          p_shop_id: string
          p_supplier_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_create_vehicle_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_customer_id: string
          p_license_plate?: string
          p_make?: string
          p_mileage?: string
          p_model?: string
          p_notes?: string
          p_shop_id: string
          p_unit_number?: string
          p_vin?: string
          p_year?: number
        }
        Returns: Json
      }
      shop_assistant_create_work_order_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_advisor_id?: string
          p_customer_id: string
          p_is_waiter?: boolean
          p_notes?: string
          p_priority?: number
          p_shop_id: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      shop_assistant_finalize_invoice_atomic: {
        Args: {
          p_action_id: string
          p_actor_profile_id: string
          p_actor_user_id: string
          p_shop_id: string
          p_snapshot: Json
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_hold_work_order_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_reason: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_invoice_source_fingerprint: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: string
      }
      shop_assistant_json_fingerprint: {
        Args: { p_value: Json }
        Returns: string
      }
      shop_assistant_lock_action_for_tool: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_shop_id: string
          p_tool_name: string
        }
        Returns: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          domain: string
          error: Json | null
          execution_finished_at: string | null
          execution_started_at: string | null
          expires_at: string
          id: string
          idempotency_key: string
          input: Json
          preview: Json
          requested_by: string
          result: Json | null
          risk: string
          shop_id: string
          status: string
          target_versions: Json
          thread_id: string
          tool_name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shop_assistant_actions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shop_assistant_mark_work_order_ready_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_place_purchase_order_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_contact_channel: string
          p_purchase_order_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_profile_id: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: string
      }
      shop_assistant_profile_role: {
        Args: { p_actor_user_id: string; p_shop_id: string }
        Returns: string
      }
      shop_assistant_receive_part_request_item_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_item_id: string
          p_location_id: string
          p_purchase_order_id?: string
          p_quantity: number
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_receive_purchase_order_line_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_location_id?: string
          p_purchase_order_id: string
          p_purchase_order_line_id: string
          p_quantity: number
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_record_approval_decision_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_all_pending: boolean
          p_contact_method: string
          p_decision: string
          p_item_ids: string[]
          p_note: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_release_work_order_hold_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      shop_assistant_reopen_inspection_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_inspection_id: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_reschedule_booking_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_booking_id: string
          p_ends_at?: string
          p_note?: string
          p_shop_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      shop_assistant_set_inventory_stock_atomic: {
        Args: {
          p_action_id: string
          p_actor_user_id: string
          p_location_id: string
          p_part_id: string
          p_quantity_on_hand: number
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_assistant_succeed_action: {
        Args: { p_action_id: string; p_result: Json; p_shop_id: string }
        Returns: Json
      }
      shop_assistant_timestamp_version_matches: {
        Args: { p_current: string; p_expected: string }
        Returns: boolean
      }
      shop_id_for: { Args: { uid: string }; Returns: string }
      shop_role: { Args: { shop_id: string }; Returns: string }
      shop_role_v2: { Args: { shop_id: string }; Returns: string }
      shop_users_actor_can_manage: {
        Args: { target_shop_id: string }
        Returns: boolean
      }
      sign_inspection: {
        Args: {
          p_expected_sync_revision: number
          p_inspection_id: string
          p_role: string
          p_signature_hash?: string
          p_signature_image_path?: string
          p_signed_name: string
        }
        Returns: undefined
      }
      start_canonical_shift: {
        Args: {
          p_profile_id: string
          p_shop_id: string
          p_timestamp?: string
          p_user_id: string
        }
        Returns: {
          end_time: string
          id: string
          inserted_events: Json
          shop_id: string
          start_time: string
          status: string
          user_id: string
        }[]
      }
      submit_estimate_to_parts_atomic: {
        Args: {
          p_expected_revision: number
          p_idempotency_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      submit_fleet_pretrip_report: {
        Args: {
          p_checklist: Json
          p_evidence: Json
          p_fleet_id: string
          p_notes: string
          p_odometer_km: number
          p_report_id: string
          p_template_assignment_id: string
          p_trailer_vehicle_id: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      submit_staff_time_off_request: {
        Args: {
          p_actor_profile_id: string
          p_ends_at: string
          p_is_partial_day: boolean
          p_reason: string
          p_request_type: string
          p_shop_id: string
          p_starts_at: string
          p_target_user_id: string
        }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          is_partial_day: boolean
          reason: string | null
          request_type: string
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shop_id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_time_off_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_fleet_defect_notification: {
        Args: { p_pretrip_id: string }
        Returns: undefined
      }
      sync_quote_line_pricing_from_parts: {
        Args: { p_quote_line_id: string; p_shop_id: string }
        Returns: Json
      }
      sync_work_order_line_flat_rate_credits: {
        Args: { p_line_id: string }
        Returns: undefined
      }
      transition_staff_time_off_request: {
        Args: {
          p_actor_profile_id: string
          p_next_status: string
          p_request_id: string
          p_review_note: string
          p_shop_id: string
        }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          is_partial_day: boolean
          reason: string | null
          request_type: string
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shop_id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_time_off_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_customer_commercial_controls_atomic: {
        Args: {
          p_account_hold_reason: string
          p_account_status: string
          p_actor_user_id: string
          p_billing_notes: string
          p_customer_id: string
          p_customer_reference: string
          p_operation_key: string
          p_payment_terms: string
          p_payment_terms_days: number
          p_po_required: boolean
          p_primary_approval_contact_id: string
          p_primary_billing_contact_id: string
          p_shop_id: string
          p_tax_exempt: boolean
          p_tax_exemption_reference: string
        }
        Returns: Json
      }
      update_menu_item_with_parts_intake: {
        Args: {
          p_actor_auth_user_id: string
          p_actor_profile_id: string
          p_item: Json
          p_menu_item_id: string
          p_parts: Json
          p_shop_id: string
        }
        Returns: Json
      }
      user_is_in_shop: { Args: { target_shop_id: string }; Returns: boolean }
      validate_estimate_lines: { Args: { p_lines: Json }; Returns: undefined }
      void_invoice_version: {
        Args: {
          p_actor_user_id: string
          p_invoice_version_id: string
          p_operation_key: string
          p_reason: string
          p_shop_id: string
        }
        Returns: {
          created_at: string
          currency: string
          discount_total: number
          id: string
          invoice_id: string | null
          issued_at: string | null
          issued_by: string | null
          lifecycle_status: string
          outstanding_total: number | null
          paid_total: number
          refunded_total: number
          shop_id: string
          snapshot: Json
          snapshot_hash: string
          subtotal: number
          superseded_by_invoice_version_id: string | null
          supersedes_invoice_version_id: string | null
          tax_total: number
          total: number
          updated_at: string
          version_number: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wo_release_parts_holds_for_part: {
        Args: { p_part_id: string }
        Returns: number
      }
      work_order_delete_draft_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      work_order_delete_empty_shell_atomic: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      work_order_financial_lock_state: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: Json
      }
      work_order_is_financially_locked: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: boolean
      }
      workspace_actor_can_manage_work_order_assignments: {
        Args: { p_shop_id: string }
        Returns: boolean
      }
      workspace_actor_can_manage_work_order_line_assignments: {
        Args: { p_work_order_line_id: string }
        Returns: boolean
      }
      workspace_current_actor_capabilities: {
        Args: { p_capability_keys?: string[] }
        Returns: {
          access_level: string
          canonical_role: string
          capability_key: string
          decision_source: string
          granted: boolean
          profile_id: string
          shop_id: string
        }[]
      }
    }
    Enums: {
      agent_action_risk: "low" | "medium" | "high"
      agent_action_status:
        | "proposed"
        | "awaiting_approval"
        | "approved"
        | "rejected"
        | "executing"
        | "succeeded"
        | "failed"
        | "canceled"
      agent_job_kind:
        | "notify_discord"
        | "analyze_request"
        | "create_issue_pr"
        | "run_checks"
        | "apply_fix"
      agent_job_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "canceled"
        | "dead"
      agent_message_direction: "to_agent" | "to_user"
      agent_request_intent:
        | "feature_request"
        | "bug_report"
        | "inspection_catalog_add"
        | "service_catalog_add"
        | "refactor"
      agent_request_status:
        | "submitted"
        | "in_progress"
        | "awaiting_approval"
        | "approved"
        | "rejected"
        | "failed"
        | "merged"
      ai_training_source:
        | "quote"
        | "appointment"
        | "inspection"
        | "work_order"
        | "customer"
        | "vehicle"
        | "fleet"
      analytics_event_type:
        | "impression"
        | "view"
        | "click"
        | "like"
        | "comment"
        | "share"
        | "save"
        | "watch_time"
        | "engagement"
        | "rank"
        | "lead"
        | "other"
      brand_asset_kind:
        | "logo"
        | "icon"
        | "wordmark"
        | "badge"
        | "favicon"
        | "watermark"
      brand_source_app: "profixiq" | "shopreel"
      content_asset_type:
        | "image"
        | "video"
        | "audio"
        | "document"
        | "thumbnail"
        | "other"
      content_piece_type:
        | "idea"
        | "hook"
        | "title"
        | "caption"
        | "script"
        | "voiceover"
        | "blog"
        | "seo_meta"
        | "cta"
        | "hashtags"
        | "faq"
        | "platform_copy"
      content_source_type:
        | "inspection"
        | "inspection_item"
        | "work_order"
        | "work_order_line"
        | "vehicle_media"
        | "manual"
        | "other"
      content_status:
        | "draft"
        | "queued"
        | "processing"
        | "ready"
        | "published"
        | "failed"
        | "archived"
      content_type:
        | "workflow_demo"
        | "repair_story"
        | "inspection_highlight"
        | "before_after"
        | "educational_tip"
        | "how_to"
        | "findings_on_vehicle"
        | "blog_post"
        | "faq"
        | "google_business_post"
        | "email_snippet"
        | "social_post"
      fitment_event_type: "allocated" | "consumed"
      fleet_program_cadence:
        | "monthly"
        | "quarterly"
        | "mileage_based"
        | "hours_based"
      inspection_item_status: "ok" | "fail" | "na" | "recommend"
      inspection_status:
        | "new"
        | "in_progress"
        | "paused"
        | "completed"
        | "aborted"
      job_type_enum: "diagnosis" | "inspection" | "maintenance" | "repair"
      part_request_item_status:
        | "requested"
        | "quoted"
        | "awaiting_customer_approval"
        | "approved"
        | "reserved"
        | "picking"
        | "picked"
        | "ordered"
        | "partially_received"
        | "received"
        | "consumed"
        | "cancelled"
        | "partially_ordered"
        | "partially_consumed"
        | "partially_returned"
        | "returned"
      part_request_status:
        | "requested"
        | "quoted"
        | "approved"
        | "fulfilled"
        | "rejected"
        | "cancelled"
        | "partially_ordered"
        | "partially_consumed"
        | "partially_returned"
        | "returned"
        | "deferred"
      plan_t:
        | "starter"
        | "pro"
        | "pro_plus"
        | "complete_10"
        | "complete_50"
        | "complete_100"
        | "complete_unlimited"
        | "unlimited"
        | "free"
        | "diy"
      publication_status:
        | "draft"
        | "queued"
        | "publishing"
        | "published"
        | "failed"
        | "skipped"
      publish_platform:
        | "instagram_reels"
        | "facebook"
        | "youtube_shorts"
        | "tiktok"
        | "blog"
        | "linkedin"
        | "google_business"
        | "email"
      punch_event_type:
        | "start"
        | "break_start"
        | "break_end"
        | "lunch_start"
        | "lunch_end"
        | "end"
      quote_request_status: "pending" | "in_progress" | "done"
      shift_status: "active" | "ended"
      shopreel_draft_status: "draft" | "in_review" | "approved"
      shopreel_opportunity_action: "accepted" | "dismissed" | "generated"
      shopreel_opportunity_status:
        | "new"
        | "accepted"
        | "dismissed"
        | "generated"
      stock_move_reason:
        | "receive"
        | "adjust"
        | "consume"
        | "return"
        | "transfer_out"
        | "transfer_in"
        | "wo_allocate"
        | "wo_release"
        | "seed"
      user_role_enum:
        | "owner"
        | "admin"
        | "manager"
        | "mechanic"
        | "advisor"
        | "parts"
        | "customer"
        | "driver"
        | "dispatcher"
        | "fleet_manager"
        | "foreman"
        | "lead_hand"
        | "service"
        | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_action_risk: ["low", "medium", "high"],
      agent_action_status: [
        "proposed",
        "awaiting_approval",
        "approved",
        "rejected",
        "executing",
        "succeeded",
        "failed",
        "canceled",
      ],
      agent_job_kind: [
        "notify_discord",
        "analyze_request",
        "create_issue_pr",
        "run_checks",
        "apply_fix",
      ],
      agent_job_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "canceled",
        "dead",
      ],
      agent_message_direction: ["to_agent", "to_user"],
      agent_request_intent: [
        "feature_request",
        "bug_report",
        "inspection_catalog_add",
        "service_catalog_add",
        "refactor",
      ],
      agent_request_status: [
        "submitted",
        "in_progress",
        "awaiting_approval",
        "approved",
        "rejected",
        "failed",
        "merged",
      ],
      ai_training_source: [
        "quote",
        "appointment",
        "inspection",
        "work_order",
        "customer",
        "vehicle",
        "fleet",
      ],
      analytics_event_type: [
        "impression",
        "view",
        "click",
        "like",
        "comment",
        "share",
        "save",
        "watch_time",
        "engagement",
        "rank",
        "lead",
        "other",
      ],
      brand_asset_kind: [
        "logo",
        "icon",
        "wordmark",
        "badge",
        "favicon",
        "watermark",
      ],
      brand_source_app: ["profixiq", "shopreel"],
      content_asset_type: [
        "image",
        "video",
        "audio",
        "document",
        "thumbnail",
        "other",
      ],
      content_piece_type: [
        "idea",
        "hook",
        "title",
        "caption",
        "script",
        "voiceover",
        "blog",
        "seo_meta",
        "cta",
        "hashtags",
        "faq",
        "platform_copy",
      ],
      content_source_type: [
        "inspection",
        "inspection_item",
        "work_order",
        "work_order_line",
        "vehicle_media",
        "manual",
        "other",
      ],
      content_status: [
        "draft",
        "queued",
        "processing",
        "ready",
        "published",
        "failed",
        "archived",
      ],
      content_type: [
        "workflow_demo",
        "repair_story",
        "inspection_highlight",
        "before_after",
        "educational_tip",
        "how_to",
        "findings_on_vehicle",
        "blog_post",
        "faq",
        "google_business_post",
        "email_snippet",
        "social_post",
      ],
      fitment_event_type: ["allocated", "consumed"],
      fleet_program_cadence: [
        "monthly",
        "quarterly",
        "mileage_based",
        "hours_based",
      ],
      inspection_item_status: ["ok", "fail", "na", "recommend"],
      inspection_status: [
        "new",
        "in_progress",
        "paused",
        "completed",
        "aborted",
      ],
      job_type_enum: ["diagnosis", "inspection", "maintenance", "repair"],
      part_request_item_status: [
        "requested",
        "quoted",
        "awaiting_customer_approval",
        "approved",
        "reserved",
        "picking",
        "picked",
        "ordered",
        "partially_received",
        "received",
        "consumed",
        "cancelled",
        "partially_ordered",
        "partially_consumed",
        "partially_returned",
        "returned",
      ],
      part_request_status: [
        "requested",
        "quoted",
        "approved",
        "fulfilled",
        "rejected",
        "cancelled",
        "partially_ordered",
        "partially_consumed",
        "partially_returned",
        "returned",
        "deferred",
      ],
      plan_t: [
        "starter",
        "pro",
        "pro_plus",
        "complete_10",
        "complete_50",
        "complete_100",
        "complete_unlimited",
        "unlimited",
        "free",
        "diy",
      ],
      publication_status: [
        "draft",
        "queued",
        "publishing",
        "published",
        "failed",
        "skipped",
      ],
      publish_platform: [
        "instagram_reels",
        "facebook",
        "youtube_shorts",
        "tiktok",
        "blog",
        "linkedin",
        "google_business",
        "email",
      ],
      punch_event_type: [
        "start",
        "break_start",
        "break_end",
        "lunch_start",
        "lunch_end",
        "end",
      ],
      quote_request_status: ["pending", "in_progress", "done"],
      shift_status: ["active", "ended"],
      shopreel_draft_status: ["draft", "in_review", "approved"],
      shopreel_opportunity_action: ["accepted", "dismissed", "generated"],
      shopreel_opportunity_status: [
        "new",
        "accepted",
        "dismissed",
        "generated",
      ],
      stock_move_reason: [
        "receive",
        "adjust",
        "consume",
        "return",
        "transfer_out",
        "transfer_in",
        "wo_allocate",
        "wo_release",
        "seed",
      ],
      user_role_enum: [
        "owner",
        "admin",
        "manager",
        "mechanic",
        "advisor",
        "parts",
        "customer",
        "driver",
        "dispatcher",
        "fleet_manager",
        "foreman",
        "lead_hand",
        "service",
        "unknown",
      ],
    },
  },
} as const
