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
      assistant_notification_rollout_markers: {
        Row: {
          contract: string
          deployment_id: string | null
          deployment_sha: string
          finalized_at: string | null
          first_observed_at: string
          last_observed_at: string
        }
        Insert: {
          contract: string
          deployment_id?: string | null
          deployment_sha: string
          finalized_at?: string | null
          first_observed_at?: string
          last_observed_at?: string
        }
        Update: {
          contract?: string
          deployment_id?: string | null
          deployment_sha?: string
          finalized_at?: string | null
          first_observed_at?: string
          last_observed_at?: string
        }
        Relationships: []
      }
      assistant_notifications: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          code: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          fingerprint: string
          first_seen_at: string
          href: string | null
          id: string
          last_seen_at: string
          level: string
          message: string
          metadata: Json
          resolved_at: string | null
          role: string | null
          shop_id: string
          source: string
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          code: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          fingerprint: string
          first_seen_at?: string
          href?: string | null
          id?: string
          last_seen_at?: string
          level: string
          message: string
          metadata?: Json
          resolved_at?: string | null
          role?: string | null
          shop_id: string
          source?: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          code?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          fingerprint?: string
          first_seen_at?: string
          href?: string | null
          id?: string
          last_seen_at?: string
          level?: string
          message?: string
          metadata?: Json
          resolved_at?: string | null
          role?: string | null
          shop_id?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_notifications_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_notifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_notifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_notifications_user_id_fkey"
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
      manual_work_order_line_creation_receipts: {
        Row: {
          created_at: string
          line_id: string
          request_sha256: string
          shop_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          line_id: string
          request_sha256: string
          shop_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          line_id?: string
          request_sha256?: string
          shop_id?: string
          work_order_id?: string
        }
        Relationships: []
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
            cÛÝ¼ßfòµë(š+myÒ6†÷ö–Có¢7G&–æp¢7F'FVEöCó¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æuö¦ö'5öFWVæG5ööåö¦ö%ö–Eöf¶W’ ¢6öÇVÖç3¢²&FWVæG5ööåö¦ö%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ööæ&ö&F–æuö¦ö'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æuö¦ö'5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æuö¦ö'5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æuö¦ö'5÷'Våö–Eöf¶W’ ¢6öÇVÖç3¢²''Våö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ööæ&ö&F–æu÷'Vç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æuö¦ö'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æuö¦ö'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷ööæ&ö&F–æu÷'Vç3¢°¢&÷s¢°¢7F—fF–öåö&Æö6¶W'3¢§6öà¢7F—fF–öå÷6æ6†÷C¢§6öà¢7F—fF–öå÷7FGW3¢7G&–æp¢GFV×Eö6÷VçC¢çVÖ&W ¢6ö×ÆWFVEöC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢W'&÷%ö6öFS¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vS¢7G&–ærÂçVÆÀ¢f–ÆVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–çF¶Uö–C¢7G&–æp¢Æö6µ÷Fö¶Vã¢7G&–ærÂçVÆÀ¢Æö6¶VEöC¢7G&–ærÂçVÆÀ¢Ö…öGFV×G3¢çVÖ&W ¢ÖWG&–73¢§6öà¢÷&6†W7G&F÷%÷fW'6–öã¢7G&–æp¢&WG'•ögFW#¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7F'FVEöC¢7G&–ærÂçVÆÀ¢7FFS¢7G&–æp¢G&–vvW%÷6÷W&6S¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢7F—fF–öåö&Æö6¶W'3ó¢§6öà¢7F—fF–öå÷6æ6†÷Có¢§6öà¢7F—fF–öå÷7FGW3ó¢7G&–æp¢GFV×Eö6÷VçCó¢çVÖ&W ¢6ö×ÆWFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢W'&÷%ö6öFSó¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢f–ÆVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çF¶Uö–C¢7G&–æp¢Æö6µ÷Fö¶Vãó¢7G&–ærÂçVÆÀ¢Æö6¶VEöCó¢7G&–ærÂçVÆÀ¢Ö…öGFV×G3ó¢çVÖ&W ¢ÖWG&–73ó¢§6öà¢÷&6†W7G&F÷%÷fW'6–öãó¢7G&–æp¢&WG'•ögFW#ó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7F'FVEöCó¢7G&–ærÂçVÆÀ¢7FFSó¢7G&–æp¢G&–vvW%÷6÷W&6Só¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢7F—fF–öåö&Æö6¶W'3ó¢§6öà¢7F—fF–öå÷6æ6†÷Có¢§6öà¢7F—fF–öå÷7FGW3ó¢7G&–æp¢GFV×Eö6÷VçCó¢çVÖ&W ¢6ö×ÆWFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢W'&÷%ö6öFSó¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢f–ÆVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–æp¢Æö6µ÷Fö¶Vãó¢7G&–ærÂçVÆÀ¢Æö6¶VEöCó¢7G&–ærÂçVÆÀ¢Ö…öGFV×G3ó¢çVÖ&W ¢ÖWG&–73ó¢§6öà¢÷&6†W7G&F÷%÷fW'6–öãó¢7G&–æp¢&WG'•ögFW#ó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7F'FVEöCó¢7G&–ærÂçVÆÀ¢7FFSó¢7G&–æp¢G&–vvW%÷6÷W&6Só¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æu÷'Vç5ö7&VFVEö'•öf¶W’ ¢6öÇVÖç3¢²&7&VFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æu÷'Vç5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æu÷'Vç5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æu÷'Vç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ööæ&ö&F–æu÷'Vç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷'G3¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢Æö6F–öã¢7G&–ærÂçVÆÀ¢'Eö–C¢7G&–ærÂçVÆÀ¢VçF—G“¢çVÖ&W ¢&W7Fö6µ÷F‡&W6†öÆC¢çVÖ&W"ÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Æö6F–öãó¢7G&–ærÂçVÆÀ¢'Eö–Có¢7G&–ærÂçVÆÀ¢VçF—G“ó¢çVÖ&W ¢&W7Fö6µ÷F‡&W6†öÆCó¢çVÖ&W"ÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Æö6F–öãó¢7G&–ærÂçVÆÀ¢'Eö–Có¢7G&–ærÂçVÆÀ¢VçF—G“ó¢çVÖ&W ¢&W7Fö6µ÷F‡&W6†öÆCó¢çVÖ&W"ÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷'G5ö–×÷'EöÖF6…ö6æF–FFW3¢°¢&÷s¢°¢6æF–FFU÷'Eö–C¢7G&–ærÂçVÆÀ¢6öæf–FVæ6S¢çVÖ&W ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢ÖWFFF¢§6öà¢&æ³¢çVÖ&W ¢&V6öã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7Fv–æu÷&÷uö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6æF–FFU÷'Eö–Có¢7G&–ærÂçVÆÀ¢6öæf–FVæ6S¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖWFFFó¢§6öà¢&æ³ó¢çVÖ&W ¢&V6öãó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7Fv–æu÷&÷uö–C¢7G&–æp¢Ð¢WFFS¢°¢6æF–FFU÷'Eö–Có¢7G&–ærÂçVÆÀ¢6öæf–FVæ6Só¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖWFFFó¢§6öà¢&æ³ó¢çVÖ&W ¢&V6öãó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7Fv–æu÷&÷uö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'EöÖF6…ö6æF–FFW5ö6æF–FFU÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²&6æF–FFU÷'Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'EöÖF6…ö6æF–FFW5ö6æF–FFU÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²&6æF–FFU÷'Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'EöÖF6…ö6æF–FFW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'EöÖF6…ö6æF–FFW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'EöÖF6…ö6æF–FFW5÷7Fv–æu÷&÷uö–Eöf¶W’ ¢6öÇVÖç3¢²'7Fv–æu÷&÷uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷'G5ö–×÷'E÷7Fv–ær ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷'G5ö–×÷'E÷7Fv–æs¢°¢&÷s¢°¢WFõ÷&öÖ÷FS¢&ööÆVà¢6÷7C¢çVÖ&W"ÂçVÆÀ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢–çF¶Uö–C¢7G&–æp¢ÖVEö6FVv÷'“¢7G&–ærÂçVÆÀ¢ÖF6…÷&V6öã¢7G&–ærÂçVÆÀ¢ÖF6†VE÷'Eö–C¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEö'&æC¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEöæÖS¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEöæÖUö¶W“¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷'EöçVÖ&W#¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷6·S¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷fVæF÷#¢7G&–ærÂçVÆÀ¢6µö–æfó¢7G&–ærÂçVÆÀ¢&–6S¢çVÖ&W"ÂçVÆÀ¢&öÖ÷FVEöC¢7G&–ærÂçVÆÀ¢VçF—G•ööåö†æC¢çVÖ&W"ÂçVÆÀ¢&uöV6†ó¢§6öà¢&u÷&÷uö–C¢7G&–ærÂçVÆÀ¢&Wf–Wuöæ÷FW3¢7G&–ærÂçVÆÀ¢&Wf–WvVEöC¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Uö6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢6÷W&6U÷7—7FVÓ¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢7VvvW7FVEö7F–öã¢7G&–ærÂçVÆÀ¢Væ—EööeöÖV7W&S¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢v&æ–æw3¢§6öà¢Ð¢–ç6W'C¢°¢WFõ÷&öÖ÷FSó¢&ööÆVà¢6÷7Có¢çVÖ&W"ÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢–çF¶Uö–C¢7G&–æp¢ÖVEö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢ÖF6…÷&V6öãó¢7G&–ærÂçVÆÀ¢ÖF6†VE÷'Eö–Có¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEö'&æCó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEöæÖSó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEöæÖUö¶W“ó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷6·Só¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷fVæF÷#ó¢7G&–ærÂçVÆÀ¢6µö–æfóó¢7G&–ærÂçVÆÀ¢&–6Só¢çVÖ&W"ÂçVÆÀ¢&öÖ÷FVEöCó¢7G&–ærÂçVÆÀ¢VçF—G•ööåö†æCó¢çVÖ&W"ÂçVÆÀ¢&uöV6†óó¢§6öà¢&u÷&÷uö–Có¢7G&–ærÂçVÆÀ¢&Wf–Wuöæ÷FW3ó¢7G&–ærÂçVÆÀ¢&Wf–WvVEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“ó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Uö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢6÷W&6U÷7—7FVÓó¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢7VvvW7FVEö7F–öãó¢7G&–ærÂçVÆÀ¢Væ—EööeöÖV7W&Só¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢v&æ–æw3ó¢§6öà¢Ð¢WFFS¢°¢WFõ÷&öÖ÷FSó¢&ööÆVà¢6÷7Có¢çVÖ&W"ÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–æp¢ÖVEö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢ÖF6…÷&V6öãó¢7G&–ærÂçVÆÀ¢ÖF6†VE÷'Eö–Có¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEö'&æCó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEöæÖSó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VEöæÖUö¶W“ó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷6·Só¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷fVæF÷#ó¢7G&–ærÂçVÆÀ¢6µö–æfóó¢7G&–ærÂçVÆÀ¢&–6Só¢çVÖ&W"ÂçVÆÀ¢&öÖ÷FVEöCó¢7G&–ærÂçVÆÀ¢VçF—G•ööåö†æCó¢çVÖ&W"ÂçVÆÀ¢&uöV6†óó¢§6öà¢&u÷&÷uö–Có¢7G&–ærÂçVÆÀ¢&Wf–Wuöæ÷FW3ó¢7G&–ærÂçVÆÀ¢&Wf–WvVEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“ó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6Uö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢6÷W&6U÷7—7FVÓó¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢7VvvW7FVEö7F–öãó¢7G&–ærÂçVÆÀ¢Væ—EööeöÖV7W&Só¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢v&æ–æw3ó¢§6öà¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'E÷7Fv–æuö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'E÷7Fv–æuö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'E÷7Fv–æuöÖF6†VE÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²&ÖF6†VE÷'Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'E÷7Fv–æuöÖF6†VE÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²&ÖF6†VE÷'Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'E÷7Fv–æu÷&u÷&÷uö–Eöf¶W’ ¢6öÇVÖç3¢²'&u÷&÷uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö–×÷'E÷&÷w2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'E÷7Fv–æu÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5ö–×÷'E÷7Fv–æu÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷'G5÷6÷W&6UöÆ–6W3¢°¢&÷s¢°¢Æ–5÷G—S¢7G&–æp¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢ÆVv7•öÆ&VÃ¢7G&–ærÂçVÆÀ¢ÆVv7•÷'EöçVÖ&W#¢7G&–ærÂçVÆÀ¢ÆVv7•÷6·S¢7G&–ærÂçVÆÀ¢ÖWFFF¢§6öà¢'Eö–C¢7G&–æp¢&u÷&÷uö–C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Uö†6ƒ¢7G&–ærÂçVÆÀ¢6÷W&6U÷7—7FVÓ¢7G&–ærÂçVÆÀ¢7Fv–æu÷&÷uö–C¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢fVæF÷%öÆ–3¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢Æ–5÷G—Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢ÆVv7•öÆ&VÃó¢7G&–ærÂçVÆÀ¢ÆVv7•÷'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢ÆVv7•÷6·Só¢7G&–ærÂçVÆÀ¢ÖWFFFó¢§6öà¢'Eö–C¢7G&–æp¢&u÷&÷uö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Uö†6ƒó¢7G&–ærÂçVÆÀ¢6÷W&6U÷7—7FVÓó¢7G&–ærÂçVÆÀ¢7Fv–æu÷&÷uö–Có¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fVæF÷%öÆ–3ó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢Æ–5÷G—Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢ÆVv7•öÆ&VÃó¢7G&–ærÂçVÆÀ¢ÆVv7•÷'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢ÆVv7•÷6·Só¢7G&–ærÂçVÆÀ¢ÖWFFFó¢§6öà¢'Eö–Có¢7G&–æp¢&u÷&÷uö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6Uö†6ƒó¢7G&–ærÂçVÆÀ¢6÷W&6U÷7—7FVÓó¢7G&–ærÂçVÆÀ¢7Fv–æu÷&÷uö–Có¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fVæF÷%öÆ–3ó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5÷&u÷&÷uö–Eöf¶W’ ¢6öÇVÖç3¢²'&u÷&÷uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö–×÷'E÷&÷w2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷'G5÷6÷W&6UöÆ–6W5÷7Fv–æu÷&÷uö–Eöf¶W’ ¢6öÇVÖç3¢²'7Fv–æu÷&÷uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷'G5ö–×÷'E÷7Fv–ær ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷–ÖVçE÷6WGF–æw3¢°¢&÷s¢°¢ÆÆ÷u÷'F–Å÷–ÖVçG3¢&ööÆVà¢7&VFVEöC¢7G&–æp¢FVfVÇEö7W'&Væ7“¢7G&–æp¢FVfVÇEöFW÷6—E÷W&6VçC¢çVÖ&W ¢Ö–æ–×VÕ÷–ÖVçEö6VçG3¢çVÖ&W ¢ÆFf÷&ÕöfVUö'3¢çVÖ&W ¢÷'FÅ÷–ÖVçG5öVæ&ÆVC¢&ööÆVà¢&V6V—EöVÖ–ÅöVæ&ÆVC¢&ööÆVà¢&WV—&U÷–ÖVçEö&Vf÷&U÷&VÆV6S¢&ööÆVà¢6†÷ö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢ÆÆ÷u÷'F–Å÷–ÖVçG3ó¢&ööÆVà¢7&VFVEöCó¢7G&–æp¢FVfVÇEö7W'&Væ7“ó¢7G&–æp¢FVfVÇEöFW÷6—E÷W&6VçCó¢çVÖ&W ¢Ö–æ–×VÕ÷–ÖVçEö6VçG3ó¢çVÖ&W ¢ÆFf÷&ÕöfVUö'3ó¢çVÖ&W ¢÷'FÅ÷–ÖVçG5öVæ&ÆVCó¢&ööÆVà¢&V6V—EöVÖ–ÅöVæ&ÆVCó¢&ööÆVà¢&WV—&U÷–ÖVçEö&Vf÷&U÷&VÆV6Só¢&ööÆVà¢6†÷ö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢ÆÆ÷u÷'F–Å÷–ÖVçG3ó¢&ööÆVà¢7&VFVEöCó¢7G&–æp¢FVfVÇEö7W'&Væ7“ó¢7G&–æp¢FVfVÇEöFW÷6—E÷W&6VçCó¢çVÖ&W ¢Ö–æ–×VÕ÷–ÖVçEö6VçG3ó¢çVÖ&W ¢ÆFf÷&ÕöfVUö'3ó¢çVÖ&W ¢÷'FÅ÷–ÖVçG5öVæ&ÆVCó¢&ööÆVà¢&V6V—EöVÖ–ÅöVæ&ÆVCó¢&ööÆVà¢&WV—&U÷–ÖVçEö&Vf÷&U÷&VÆV6Só¢&ööÆVà¢6†÷ö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷–ÖVçE÷6WGF–æw5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷–ÖVçE÷6WGF–æw5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷—&öÆÅ÷6WGF–æw3¢°¢&÷s¢°¢'&V·5ö&U÷–C¢&ööÆVà¢6FVæ6S¢7G&–æp¢7&VFVEöC¢7G&–æp¢F–Ç•ö÷fW'F–ÖUögFW%öÖ–çWFW3¢çVÖ&W ¢FVfVÇEöÇVæ6…öGW&F–öåöÖ–çWFW3¢çVÖ&W ¢Væ&ÆVC¢&ööÆVà¢–C¢7G&–æp¢ÇVæ6…ö—5÷–C¢&ööÆVà¢ÇVæ6…÷&WV—&VEögFW%öÖ–çWFW3¢çVÖ&W ¢–Eö'&VµöGW&F–öåöÖ–çWFW3¢çVÖ&W ¢–Eö'&V·5÷W%öF“¢çVÖ&W ¢W&–öEöæ6†÷%öFFS¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7W7–6–÷W5÷6†–gEöÖ–çWFW3¢çVÖ&W ¢WFFVEöC¢7G&–æp¢vVVµ÷7F'G5ööã¢çVÖ&W ¢vVV¶Ç•ö÷fW'F–ÖUögFW%öÖ–çWFW3¢çVÖ&W ¢Ð¢–ç6W'C¢°¢'&V·5ö&U÷–Có¢&ööÆVà¢6FVæ6Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢F–Ç•ö÷fW'F–ÖUögFW%öÖ–çWFW3ó¢çVÖ&W ¢FVfVÇEöÇVæ6…öGW&F–öåöÖ–çWFW3ó¢çVÖ&W ¢Væ&ÆVCó¢&ööÆVà¢–Có¢7G&–æp¢ÇVæ6…ö—5÷–Có¢&ööÆVà¢ÇVæ6…÷&WV—&VEögFW%öÖ–çWFW3ó¢çVÖ&W ¢–Eö'&VµöGW&F–öåöÖ–çWFW3ó¢çVÖ&W ¢–Eö'&V·5÷W%öF“ó¢çVÖ&W ¢W&–öEöæ6†÷%öFFSó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7W7–6–÷W5÷6†–gEöÖ–çWFW3ó¢çVÖ&W ¢WFFVEöCó¢7G&–æp¢vVVµ÷7F'G5ööãó¢çVÖ&W ¢vVV¶Ç•ö÷fW'F–ÖUögFW%öÖ–çWFW3ó¢çVÖ&W ¢Ð¢WFFS¢°¢'&V·5ö&U÷–Có¢&ööÆVà¢6FVæ6Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢F–Ç•ö÷fW'F–ÖUögFW%öÖ–çWFW3ó¢çVÖ&W ¢FVfVÇEöÇVæ6…öGW&F–öåöÖ–çWFW3ó¢çVÖ&W ¢Væ&ÆVCó¢&ööÆVà¢–Có¢7G&–æp¢ÇVæ6…ö—5÷–Có¢&ööÆVà¢ÇVæ6…÷&WV—&VEögFW%öÖ–çWFW3ó¢çVÖ&W ¢–Eö'&VµöGW&F–öåöÖ–çWFW3ó¢çVÖ&W ¢–Eö'&V·5÷W%öF“ó¢çVÖ&W ¢W&–öEöæ6†÷%öFFSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7W7–6–÷W5÷6†–gEöÖ–çWFW3ó¢çVÖ&W ¢WFFVEöCó¢7G&–æp¢vVVµ÷7F'G5ööãó¢çVÖ&W ¢vVV¶Ç•ö÷fW'F–ÖUögFW%öÖ–çWFW3ó¢çVÖ&W ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷—&öÆÅ÷6WGF–æw5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷—&öÆÅ÷6WGF–æw5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷&öf–ÆW3¢°¢&÷s¢°¢FG&W75öÆ–æS¢7G&–ærÂçVÆÀ¢FG&W75öÆ–æS#¢7G&–ærÂçVÆÀ¢6—G“¢7G&–ærÂçVÆÀ¢6÷VçG'“¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢FW67&—F–öã¢7G&–ærÂçVÆÀ¢VÖ–Ã¢7G&–ærÂçVÆÀ¢†÷W'3¢§6öâÂçVÆÀ¢–ÖvW3¢7G&–æuµÒÂçVÆÀ¢ÆF—GVFS¢çVÖ&W"ÂçVÆÀ¢Æöæv—GVFS¢çVÖ&W"ÂçVÆÀ¢†öæS¢7G&–ærÂçVÆÀ¢÷7FÅö6öFS¢7G&–ærÂçVÆÀ¢&÷f–æ6S¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢FvÆ–æS¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢vV'6—FS¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢FG&W75öÆ–æSó¢7G&–ærÂçVÆÀ¢FG&W75öÆ–æS#ó¢7G&–ærÂçVÆÀ¢6—G“ó¢7G&–ærÂçVÆÀ¢6÷VçG'“ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢†÷W'3ó¢§6öâÂçVÆÀ¢–ÖvW3ó¢7G&–æuµÒÂçVÆÀ¢ÆF—GVFSó¢çVÖ&W"ÂçVÆÀ¢Æöæv—GVFSó¢çVÖ&W"ÂçVÆÀ¢†öæSó¢7G&–ærÂçVÆÀ¢÷7FÅö6öFSó¢7G&–ærÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢FvÆ–æSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢vV'6—FSó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢FG&W75öÆ–æSó¢7G&–ærÂçVÆÀ¢FG&W75öÆ–æS#ó¢7G&–ærÂçVÆÀ¢6—G“ó¢7G&–ærÂçVÆÀ¢6÷VçG'“ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢†÷W'3ó¢§6öâÂçVÆÀ¢–ÖvW3ó¢7G&–æuµÒÂçVÆÀ¢ÆF—GVFSó¢çVÖ&W"ÂçVÆÀ¢Æöæv—GVFSó¢çVÖ&W"ÂçVÆÀ¢†öæSó¢7G&–ærÂçVÆÀ¢÷7FÅö6öFSó¢7G&–ærÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢FvÆ–æSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢vV'6—FSó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&öf–ÆW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&öf–ÆW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷&F–æw3¢°¢&÷s¢°¢6öÖÖVçC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7W7FöÖW%ö–C¢7G&–æp¢–C¢7G&–æp¢66÷&S¢çVÖ&W ¢6†÷ö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢6öÖÖVçCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–C¢7G&–æp¢–Có¢7G&–æp¢66÷&S¢çVÖ&W ¢6†÷ö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢6öÖÖVçCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–Có¢7G&–æp¢–Có¢7G&–æp¢66÷&Só¢çVÖ&W ¢6†÷ö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&F–æw5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&F–æw5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&F–æw5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷&Wf–Ww3¢°¢&÷s¢°¢6öÖÖVçC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢—5÷V&Æ–3¢&ööÆVà¢V&Æ–5öæÖS¢7G&–ærÂçVÆÀ¢&F–æs¢çVÖ&W ¢&WÆ–VEöC¢7G&–ærÂçVÆÀ¢&Wf–WvW%÷W6W%ö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢6†÷ö÷væW%÷&WÇ“¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢6öÖÖVçCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5÷V&Æ–3ó¢&ööÆVà¢V&Æ–5öæÖSó¢7G&–ærÂçVÆÀ¢&F–æs¢çVÖ&W ¢&WÆ–VEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvW%÷W6W%ö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢6†÷ö÷væW%÷&WÇ“ó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢6öÖÖVçCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5÷V&Æ–3ó¢&ööÆVà¢V&Æ–5öæÖSó¢7G&–ærÂçVÆÀ¢&F–æsó¢çVÖ&W ¢&WÆ–VEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvW%÷W6W%ö–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢6†÷ö÷væW%÷&WÇ“ó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&Wf–Ww5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&Wf–Ww5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&Wf–Ww5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷&öÆUö6&–Æ—G•÷öÆ–6–W3¢°¢&÷s¢°¢6&–Æ—G•ö¶W“¢7G&–æp¢6†ævVEö'•÷&öf–ÆUö–C¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢VffV7C¢7G&–æp¢–C¢7G&–æp¢&öÆUö¶W“¢7G&–æp¢6†÷ö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢6&–Æ—G•ö¶W“¢7G&–æp¢6†ævVEö'•÷&öf–ÆUö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢VffV7C¢7G&–æp¢–Có¢7G&–æp¢&öÆUö¶W“¢7G&–æp¢6†÷ö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢6&–Æ—G•ö¶W“ó¢7G&–æp¢6†ævVEö'•÷&öf–ÆUö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢VffV7Có¢7G&–æp¢–Có¢7G&–æp¢&öÆUö¶W“ó¢7G&–æp¢6†÷ö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&öÆUö6&–Æ—G•÷öÆ–6–W5ö6&–Æ—G•ö¶W•öf¶W’ ¢6öÇVÖç3¢²&6&–Æ—G•ö¶W’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&·76Uö6&–Æ—F–W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&6&–Æ—G•ö¶W’%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&öÆUö6&–Æ—G•÷öÆ–6–W5ö6†ævVEö'•÷&öf–ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²&6†ævVEö'•÷&öf–ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&öÆUö6&–Æ—G•÷öÆ–6–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&öÆUö6&–Æ—G•÷öÆ–6–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷66†VGVÆW3¢°¢&÷s¢°¢&öö¶VEö'“¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢FFS¢7G&–æp¢–C¢7G&–æp¢—5ö&öö¶VC¢&ööÆVâÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢F–ÖU÷6Æ÷C¢7G&–æp¢Ð¢–ç6W'C¢°¢&öö¶VEö'“ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FFS¢7G&–æp¢–Có¢7G&–æp¢—5ö&öö¶VCó¢&ööÆVâÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢F–ÖU÷6Æ÷C¢7G&–æp¢Ð¢WFFS¢°¢&öö¶VEö'“ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FFSó¢7G&–æp¢–Có¢7G&–æp¢—5ö&öö¶VCó¢&ööÆVâÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢F–ÖU÷6Æ÷Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷66†VGVÆW5ö&öö¶VEö'•öf¶W’ ¢6öÇVÖç3¢²&&öö¶VEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW%ö&öö¶–æw2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷6WGF–æw3¢°¢&÷s¢°¢ÆÆ÷uö7W7FöÖW%÷V÷FW3¢&ööÆVâÂçVÆÀ¢ÆÆ÷u÷6VÆeö&öö¶–æs¢&ööÆVâÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢&–6–æu÷&Vg&W6…öF—3¢çVÖ&W"ÂçVÆÀ¢&÷f–æ6S¢7G&–ærÂçVÆÀ¢F–ÖW¦öæS¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢ÆÆ÷uö7W7FöÖW%÷V÷FW3ó¢&ööÆVâÂçVÆÀ¢ÆÆ÷u÷6VÆeö&öö¶–æsó¢&ööÆVâÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢&–6–æu÷&Vg&W6…öF—3ó¢çVÖ&W"ÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢F–ÖW¦öæSó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢ÆÆ÷uö7W7FöÖW%÷V÷FW3ó¢&ööÆVâÂçVÆÀ¢ÆÆ÷u÷6VÆeö&öö¶–æsó¢&ööÆVâÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢&–6–æu÷&Vg&W6…öF—3ó¢çVÖ&W"ÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢F–ÖW¦öæSó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢6†÷÷F–ÖUööfc¢°¢&÷s¢°¢VæG5öC¢7G&–æp¢–C¢7G&–æp¢&V6öã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7F'G5öC¢7G&–æp¢Ð¢–ç6W'C¢°¢VæG5öC¢7G&–æp¢–Có¢7G&–æp¢&V6öãó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'G5öC¢7G&–æp¢Ð¢WFFS¢°¢VæG5öCó¢7G&–æp¢–Có¢7G&–æp¢&V6öãó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'G5öCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷F–ÖUööfe÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷F–ÖUööfe÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷F–ÖU÷6Æ÷G3¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢VæE÷F–ÖS¢7G&–æp¢–C¢7G&–æp¢—5ö&öö¶VC¢&ööÆVâÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7F'E÷F–ÖS¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖS¢7G&–æp¢–Có¢7G&–æp¢—5ö&öö¶VCó¢&ööÆVâÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'E÷F–ÖS¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖSó¢7G&–æp¢–Có¢7G&–æp¢—5ö&öö¶VCó¢&ööÆVâÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'E÷F–ÖSó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢6†÷÷W6W'3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢—5ö7F—fS¢&ööÆVà¢&öÆS¢7G&–æp¢6†÷ö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢&öÆSó¢7G&–æp¢6†÷ö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢&öÆSó¢7G&–æp¢6†÷ö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷W6W'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷W6W'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷W6W'5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷÷fV†–6ÆUöÖVçUö—FV×3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢ÖVçUö—FVÕö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢fV†–6ÆUöÖVçUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖVçUö—FVÕö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢fV†–6ÆUöÖVçUö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖVçUö—FVÕö–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢fV†–6ÆUöÖVçUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷fV†–6ÆUöÖVçUö—FV×5öÖVçUö—FVÕö–Eöf¶W’ ¢6öÇVÖç3¢²&ÖVçUö—FVÕö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&ÖVçUö—FV×2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷fV†–6ÆUöÖVçUö—FV×5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷fV†–6ÆUöÖVçUö—FV×5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷fV†–6ÆUöÖVçUö—FV×5÷fV†–6ÆUöÖVçUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUöÖVçUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆUöÖVçW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅöG&gG3¢°¢&÷s¢°¢ævÆS¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢÷÷'GVæ—G•ö–C¢7G&–æp¢&Wf–WvVEöC¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“¢7G&–ærÂçVÆÀ¢67&—C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅöG&gE÷7FGW2%Ð¢F—FÆS¢7G&–æp¢WFFVEöC¢7G&–æp¢WFFVEö'“¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢ævÆSó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢÷÷'GVæ—G•ö–C¢7G&–æp¢&Wf–WvVEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“ó¢7G&–ærÂçVÆÀ¢67&—Có¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3ó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅöG&gE÷7FGW2%Ð¢F—FÆS¢7G&–æp¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢ævÆSó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢÷÷'GVæ—G•ö–Có¢7G&–æp¢&Wf–WvVEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“ó¢7G&–ærÂçVÆÀ¢67&—Có¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7FGW3ó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅöG&gE÷7FGW2%Ð¢F—FÆSó¢7G&–æp¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöG&gG5ö7&VFVEö'•öf¶W’ ¢6öÇVÖç3¢²&7&VFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöG&gG5ö÷÷'GVæ—G•ö–Eöf¶W’ ¢6öÇVÖç3¢²&÷÷'GVæ—G•ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷&VVÅö÷÷'GVæ—F–W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöG&gG5÷&Wf–WvVEö'•öf¶W’ ¢6öÇVÖç3¢²'&Wf–WvVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöG&gG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöG&gG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöG&gG5÷WFFVEö'•öf¶W’ ¢6öÇVÖç3¢²'WFFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅöWfVçEöFVÆ—fW&–W3¢°¢&÷s¢°¢GFV×Eö6÷VçC¢çVÖ&W ¢7&VFVEöC¢7G&–æp¢FVÆ—fW&VEöC¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vS¢7G&–ærÂçVÆÀ¢WfVçEö¶W“¢7G&–æp¢WfVçE÷G—S¢7G&–æp¢‡GG÷7FGW3¢çVÖ&W"ÂçVÆÀ¢–C¢7G&–æp¢–çFVw&F–öåö–C¢7G&–ærÂçVÆÀ¢–ÆöC¢§6öà¢&WVW7E÷W&Ã¢7G&–æp¢&W7öç6Uö&öG“¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢GFV×Eö6÷VçCó¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢FVÆ—fW&VEöCó¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢WfVçEö¶W“¢7G&–æp¢WfVçE÷G—S¢7G&–æp¢‡GG÷7FGW3ó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢–çFVw&F–öåö–Có¢7G&–ærÂçVÆÀ¢–ÆöCó¢§6öà¢&WVW7E÷W&Ã¢7G&–æp¢&W7öç6Uö&öG“ó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢GFV×Eö6÷VçCó¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢FVÆ—fW&VEöCó¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢WfVçEö¶W“ó¢7G&–æp¢WfVçE÷G—Só¢7G&–æp¢‡GG÷7FGW3ó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢–çFVw&F–öåö–Có¢7G&–ærÂçVÆÀ¢–ÆöCó¢§6öà¢&WVW7E÷W&Ãó¢7G&–æp¢&W7öç6Uö&öG“ó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöWfVçEöFVÆ—fW&–W5ö–çFVw&F–öåö–Eöf¶W’ ¢6öÇVÖç3¢²&–çFVw&F–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷&VVÅö–çFVw&F–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöWfVçEöFVÆ—fW&–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöWfVçEöFVÆ—fW&–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅö–çFVw&F–öç3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢Væ&ÆVC¢&ööÆVà¢Væ&ÆVEöWfVçE÷G—W3¢7G&–æuµÐ¢–C¢7G&–æp¢Æ7EöW'&÷%öC¢7G&–ærÂçVÆÀ¢Æ7EöW'&÷%öÖW76vS¢7G&–ærÂçVÆÀ¢Æ7E÷7V66W75öC¢7G&–ærÂçVÆÀ¢Æ7E÷FW7FVEöC¢7G&–ærÂçVÆÀ¢&VÖ÷FU÷6†÷ö–C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6†÷&VVÅö&6U÷W&Ã¢7G&–æp¢WFFVEöC¢7G&–æp¢WFFVEö'“¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢Væ&ÆVCó¢&ööÆVà¢Væ&ÆVEöWfVçE÷G—W3ó¢7G&–æuµÐ¢–Có¢7G&–æp¢Æ7EöW'&÷%öCó¢7G&–ærÂçVÆÀ¢Æ7EöW'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢Æ7E÷7V66W75öCó¢7G&–ærÂçVÆÀ¢Æ7E÷FW7FVEöCó¢7G&–ærÂçVÆÀ¢&VÖ÷FU÷6†÷ö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6†÷&VVÅö&6U÷W&Ãó¢7G&–æp¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢Væ&ÆVCó¢&ööÆVà¢Væ&ÆVEöWfVçE÷G—W3ó¢7G&–æuµÐ¢–Có¢7G&–æp¢Æ7EöW'&÷%öCó¢7G&–ærÂçVÆÀ¢Æ7EöW'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢Æ7E÷7V66W75öCó¢7G&–ærÂçVÆÀ¢Æ7E÷FW7FVEöCó¢7G&–ærÂçVÆÀ¢&VÖ÷FU÷6†÷ö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6†÷&VVÅö&6U÷W&Ãó¢7G&–æp¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö–çFVw&F–öç5ö7&VFVEö'•öf¶W’ ¢6öÇVÖç3¢²&7&VFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö–çFVw&F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö–çFVw&F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö–çFVw&F–öç5÷WFFVEö'•öf¶W’ ¢6öÇVÖç3¢²'WFFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅöÖçVÅö76WG3¢°¢&÷s¢°¢76WE÷G—S¢7G&–æp¢6öçFVçEövöÃ¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢FW67&—F–öã¢7G&–ærÂçVÆÀ¢GW&F–öå÷6V6öæG3¢çVÖ&W"ÂçVÆÀ¢–C¢7G&–æp¢ÖWFFFö§6öã¢§6öà¢æ÷FS¢7G&–ærÂçVÆÀ¢ÆFf÷&Õ÷F&vWG3¢7G&–æuµÐ¢&–Ö'•öf–ÆU÷W&Ã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷G—S¢7G&–æp¢7FGW3¢7G&–æp¢Fw3¢7G&–æuµÐ¢F‡VÖ&æ–Å÷W&Ã¢7G&–ærÂçVÆÀ¢F—FÆS¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢76WE÷G—S¢7G&–æp¢6öçFVçEövöÃó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢GW&F–öå÷6V6öæG3ó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢ÖWFFFö§6öãó¢§6öà¢æ÷FSó¢7G&–ærÂçVÆÀ¢ÆFf÷&Õ÷F&vWG3ó¢7G&–æuµÐ¢&–Ö'•öf–ÆU÷W&Ãó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷G—Só¢7G&–æp¢7FGW3ó¢7G&–æp¢Fw3ó¢7G&–æuµÐ¢F‡VÖ&æ–Å÷W&Ãó¢7G&–ærÂçVÆÀ¢F—FÆS¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢76WE÷G—Só¢7G&–æp¢6öçFVçEövöÃó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢GW&F–öå÷6V6öæG3ó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢ÖWFFFö§6öãó¢§6öà¢æ÷FSó¢7G&–ærÂçVÆÀ¢ÆFf÷&Õ÷F&vWG3ó¢7G&–æuµÐ¢&–Ö'•öf–ÆU÷W&Ãó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6U÷G—Só¢7G&–æp¢7FGW3ó¢7G&–æp¢Fw3ó¢7G&–æuµÐ¢F‡VÖ&æ–Å÷W&Ãó¢7G&–ærÂçVÆÀ¢F—FÆSó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöÖçVÅö76WG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅöÖçVÅö76WG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅö÷÷'GVæ—F–W3¢°¢&÷s¢°¢66WFVEöC¢7G&–ærÂçVÆÀ¢7FVEö'“¢7G&–ærÂçVÆÀ¢ævÆS¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢F—6Ö—76VEöC¢7G&–ærÂçVÆÀ¢WfVçE÷G—S¢7G&–æp¢f—'7EövVæW&FVEöC¢7G&–ærÂçVÆÀ¢vVæW&FVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢6÷W&6Uöö67W'&VEöC¢7G&–æp¢7FGW3¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢7F÷'•÷6÷W&6Uö–C¢7G&–æp¢7VÖÖ'“¢7G&–ærÂçVÆÀ¢F—FÆS¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢66WFVEöCó¢7G&–ærÂçVÆÀ¢7FVEö'“ó¢7G&–ærÂçVÆÀ¢ævÆSó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢F—6Ö—76VEöCó¢7G&–ærÂçVÆÀ¢WfVçE÷G—S¢7G&–æp¢f—'7EövVæW&FVEöCó¢7G&–ærÂçVÆÀ¢vVæW&FVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢6†÷ö–C¢7G&–æp¢6÷W&6Uöö67W'&VEöC¢7G&–æp¢7FGW3ó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢7F÷'•÷6÷W&6Uö–C¢7G&–æp¢7VÖÖ'“ó¢7G&–ærÂçVÆÀ¢F—FÆS¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢66WFVEöCó¢7G&–ærÂçVÆÀ¢7FVEö'“ó¢7G&–ærÂçVÆÀ¢ævÆSó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢F—6Ö—76VEöCó¢7G&–ærÂçVÆÀ¢WfVçE÷G—Só¢7G&–æp¢f—'7EövVæW&FVEöCó¢7G&–ærÂçVÆÀ¢vVæW&FVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢6÷W&6Uöö67W'&VEöCó¢7G&–æp¢7FGW3ó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢7F÷'•÷6÷W&6Uö–Có¢7G&–æp¢7VÖÖ'“ó¢7G&–ærÂçVÆÀ¢F—FÆSó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—F–W5ö7FVEö'•öf¶W’ ¢6öÇVÖç3¢²&7FVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—F–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—F–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—F–W5÷7F÷'•÷6÷W&6Uö–Eöf¶W’ ¢6öÇVÖç3¢²'7F÷'•÷6÷W&6Uö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'6†÷&VVÅ÷7F÷'•÷6÷W&6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅö÷÷'GVæ—G•÷7FGW5ö†—7F÷'“¢°¢&÷s¢°¢7F–öã ¢ÂFF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•ö7F–öâ%Ð¢ÂçVÆÀ¢6†ævVEöC¢7G&–æp¢6†ævVEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢æW‡E÷7FGW3¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢æ÷FS¢7G&–ærÂçVÆÀ¢÷÷'GVæ—G•ö–C¢7G&–æp¢&Wf–÷W5÷7FGW3 ¢ÂFF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢ÂçVÆÀ¢6†÷ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7F–öãó ¢ÂFF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•ö7F–öâ%Ð¢ÂçVÆÀ¢6†ævVEöCó¢7G&–æp¢6†ævVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢æW‡E÷7FGW3¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢æ÷FSó¢7G&–ærÂçVÆÀ¢÷÷'GVæ—G•ö–C¢7G&–æp¢&Wf–÷W5÷7FGW3ó ¢ÂFF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢ÂçVÆÀ¢6†÷ö–C¢7G&–æp¢Ð¢WFFS¢°¢7F–öãó ¢ÂFF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•ö7F–öâ%Ð¢ÂçVÆÀ¢6†ævVEöCó¢7G&–æp¢6†ævVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢æW‡E÷7FGW3ó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢æ÷FSó¢7G&–ærÂçVÆÀ¢÷÷'GVæ—G•ö–Có¢7G&–æp¢&Wf–÷W5÷7FGW3ó ¢ÂFF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'6†÷&VVÅö÷÷'GVæ—G•÷7FGW2%Ð¢ÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—G•÷7FGW5ö†—7F÷'•ö6†ævVEö'•öf¶W’ ¢6öÇVÖç3¢²&6†ævVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—G•÷7FGW5ö†—7F÷'•ö÷÷'GVæ—G•ö–Eöf¶W’ ¢6öÇVÖç3¢²&÷÷'GVæ—G•ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷&VVÅö÷÷'GVæ—F–W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—G•÷7FGW5ö†—7F÷'•÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅö÷÷'GVæ—G•÷7FGW5ö†—7F÷'•÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅ÷V&Æ–6F–öç3¢°¢&÷s¢°¢GFV×Eö6÷VçC¢çVÖ&W ¢6F–öåö÷fW'&–FS¢7G&–ærÂçVÆÀ¢6öææV7F–öåö–C¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vS¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷÷7Eö–C¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷W&Ã¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢ÆFf÷&Ó¢7G&–æp¢V&Æ—6…÷–ÆöEö§6öã¢§6öà¢V&Æ—6†VEöC¢7G&–ærÂçVÆÀ¢&W7öç6Uö§6öã¢§6öà¢66†VGVÆVEöf÷#¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢F—FÆUö÷fW'&–FS¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢f–FVõö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢GFV×Eö6÷VçCó¢çVÖ&W ¢6F–öåö÷fW'&–FSó¢7G&–ærÂçVÆÀ¢6öææV7F–öåö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷÷7Eö–Có¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷W&Ãó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÆFf÷&Ó¢7G&–æp¢V&Æ—6…÷–ÆöEö§6öãó¢§6öà¢V&Æ—6†VEöCó¢7G&–ærÂçVÆÀ¢&W7öç6Uö§6öãó¢§6öà¢66†VGVÆVEöf÷#ó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3ó¢7G&–æp¢F—FÆUö÷fW'&–FSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢f–FVõö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢GFV×Eö6÷VçCó¢çVÖ&W ¢6F–öåö÷fW'&–FSó¢7G&–ærÂçVÆÀ¢6öææV7F–öåö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷÷7Eö–Có¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷W&Ãó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÆFf÷&Óó¢7G&–æp¢V&Æ—6…÷–ÆöEö§6öãó¢§6öà¢V&Æ—6†VEöCó¢7G&–ærÂçVÆÀ¢&W7öç6Uö§6öãó¢§6öà¢66†VGVÆVEöf÷#ó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7FGW3ó¢7G&–æp¢F—FÆUö÷fW'&–FSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢f–FVõö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷V&Æ–6F–öç5ö6öææV7F–öåö–Eöf¶W’ ¢6öÇVÖç3¢²&6öææV7F–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷&VVÅ÷6ö6–Åö6öææV7F–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷V&Æ–6F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷V&Æ–6F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷V&Æ–6F–öç5÷f–FVõö–Eöf¶W’ ¢6öÇVÖç3¢²'f–FVõö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'f–FV÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅ÷V&Æ—6…ö¦ö'3¢°¢&÷s¢°¢GFV×Eö6÷VçC¢çVÖ&W ¢6ö×ÆWFVEöC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢W'&÷%öÖW76vS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢Æö6¶VEöC¢7G&–ærÂçVÆÀ¢Æö6¶VEö'“¢7G&–ærÂçVÆÀ¢V&Æ–6F–öåö–C¢7G&–æp¢'VåögFW#¢7G&–æp¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢GFV×Eö6÷VçCó¢çVÖ&W ¢6ö×ÆWFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Æö6¶VEöCó¢7G&–ærÂçVÆÀ¢Æö6¶VEö'“ó¢7G&–ærÂçVÆÀ¢V&Æ–6F–öåö–C¢7G&–æp¢'VåögFW#ó¢7G&–æp¢6†÷ö–C¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢GFV×Eö6÷VçCó¢çVÖ&W ¢6ö×ÆWFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢W'&÷%öÖW76vSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Æö6¶VEöCó¢7G&–ærÂçVÆÀ¢Æö6¶VEö'“ó¢7G&–ærÂçVÆÀ¢V&Æ–6F–öåö–Có¢7G&–æp¢'VåögFW#ó¢7G&–æp¢6†÷ö–Có¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷V&Æ—6…ö¦ö'5÷V&Æ–6F–öåö–Eöf¶W’ ¢6öÇVÖç3¢²'V&Æ–6F–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&6öçFVçE÷V&Æ–6F–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷V&Æ—6…ö¦ö'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷V&Æ—6…ö¦ö'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷&VVÅ÷6ö6–Åö6öææV7F–öç3¢°¢&÷s¢°¢66W75÷Fö¶Vã¢7G&–ærÂçVÆÀ¢66÷VçEö–C¢7G&–ærÂçVÆÀ¢66÷VçEöæÖS¢7G&–ærÂçVÆÀ¢6öææV7F–öåö7F—fS¢&ööÆVâÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢ÖWFö–ç7Fw&Õö'W6–æW75ö–C¢7G&–ærÂçVÆÀ¢ÖWF÷vUö–C¢7G&–ærÂçVÆÀ¢ÖWF÷vUöæÖS¢7G&–ærÂçVÆÀ¢ÖWFFFö§6öã¢§6öà¢ÆFf÷&Ó¢7G&–æp¢&Vg&W6…÷Fö¶Vã¢7G&–ærÂçVÆÀ¢66÷W3¢7G&–æuµÐ¢6†÷ö–C¢7G&–æp¢Fö¶VåöW‡—&W5öC¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢66W75÷Fö¶Vãó¢7G&–ærÂçVÆÀ¢66÷VçEö–Có¢7G&–ærÂçVÆÀ¢66÷VçEöæÖSó¢7G&–ærÂçVÆÀ¢6öææV7F–öåö7F—fSó¢&ööÆVâÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÖWFö–ç7Fw&Õö'W6–æW75ö–Có¢7G&–ærÂçVÆÀ¢ÖWF÷vUö–Có¢7G&–ærÂçVÆÀ¢ÖWF÷vUöæÖSó¢7G&–ærÂçVÆÀ¢ÖWFFFö§6öãó¢§6öà¢ÆFf÷&Ó¢7G&–æp¢&Vg&W6…÷Fö¶Vãó¢7G&–ærÂçVÆÀ¢66÷W3ó¢7G&–æuµÐ¢6†÷ö–C¢7G&–æp¢Fö¶VåöW‡—&W5öCó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢66W75÷Fö¶Vãó¢7G&–ærÂçVÆÀ¢66÷VçEö–Có¢7G&–ærÂçVÆÀ¢66÷VçEöæÖSó¢7G&–ærÂçVÆÀ¢6öææV7F–öåö7F—fSó¢&ööÆVâÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÖWFö–ç7Fw&Õö'W6–æW75ö–Có¢7G&–ærÂçVÆÀ¢ÖWF÷vUö–Có¢7G&–ærÂçVÆÀ¢ÖWF÷vUöæÖSó¢7G&–ærÂçVÆÀ¢ÖWFFFö§6öãó¢§6öà¢ÆFf÷&Óó¢7G&–æp¢&Vg&W6…÷Fö¶Vãó¢7G&–ærÂçVÆÀ¢66÷W3ó¢7G&–æuµÐ¢6†÷ö–Có¢7G&–æp¢Fö¶VåöW‡—&W5öCó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢6†÷&VVÅ÷7F÷'•÷6÷W&6W3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢WfVçEö¶W“¢7G&–æp¢WfVçE÷G—S¢7G&–æp¢–C¢7G&–æp¢–ævW7E÷7FGW3¢7G&–æp¢–ævW7FVEöC¢7G&–æp¢ö67W'&VEöC¢7G&–æp¢–ÆöC¢§6öà¢6†÷ö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢WfVçEö¶W“¢7G&–æp¢WfVçE÷G—S¢7G&–æp¢–Có¢7G&–æp¢–ævW7E÷7FGW3ó¢7G&–æp¢–ævW7FVEöCó¢7G&–æp¢ö67W'&VEöC¢7G&–æp¢–ÆöCó¢§6öà¢6†÷ö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢WfVçEö¶W“ó¢7G&–æp¢WfVçE÷G—Só¢7G&–æp¢–Có¢7G&–æp¢–ævW7E÷7FGW3ó¢7G&–æp¢–ævW7FVEöCó¢7G&–æp¢ö67W'&VEöCó¢7G&–æp¢–ÆöCó¢§6öà¢6†÷ö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷7F÷'•÷6÷W&6W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷&VVÅ÷7F÷'•÷6÷W&6W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢6†÷3¢°¢&÷s¢°¢66WG5ööæÆ–æUö&öö¶–æs¢&ööÆVâÂçVÆÀ¢7F—fU÷W6W%ö6÷VçC¢çVÖ&W"ÂçVÆÀ¢FG&W73¢7G&–ærÂçVÆÀ¢WFõövVæW&FU÷Fc¢&ööÆVâÂçVÆÀ¢WFõ÷6VæE÷V÷FUöVÖ–Ã¢&ööÆVâÂçVÆÀ¢&–ÆÆ&ÆU÷W6W%ö6÷VçC¢çVÖ&W ¢&–ÆÆ–æuöVçF—FÆVÖVçEö÷fW'&–FS¢7G&–ærÂçVÆÀ¢&–ÆÆ–æuöVçF—FÆVÖVçE÷WFFVEöC¢7G&–æp¢&–ÆÆ–æuöw&6U÷VçF–Ã¢7G&–ærÂçVÆÀ¢'W6–æW75öæÖS¢7G&–ærÂçVÆÀ¢6—G“¢7G&–ærÂçVÆÀ¢6÷VçG'“¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢FVfVÇE÷7Fö6µöÆö6F–öåö–C¢7G&–ærÂçVÆÀ¢F–væ÷7F–5öfVS¢çVÖ&W"ÂçVÆÀ¢VÖ–Ã¢7G&–ærÂçVÆÀ¢VÖ–Åööåö6ö×ÆWFS¢&ööÆVâÂçVÆÀ¢vVõöÆC¢çVÖ&W"ÂçVÆÀ¢vVõöÆæs¢çVÖ&W"ÂçVÆÀ¢–C¢7G&–æp¢–ÖvW3¢7G&–æuµÒÂçVÆÀ¢–çfö–6Uöfö÷FW#¢7G&–ærÂçVÆÀ¢–çfö–6U÷FW&×3¢7G&–ærÂçVÆÀ¢Æ&÷%÷&FS¢çVÖ&W"ÂçVÆÀ¢Æö6F–öå÷G—S¢7G&–æp¢Æövõ÷W&Ã¢7G&–ærÂçVÆÀ¢Ö…öÆVEöF—3¢çVÖ&W"ÂçVÆÀ¢Ö…÷W6W'3¢çVÖ&W"ÂçVÆÀ¢ÖVçU÷&W—%÷&–6–æu÷fÆ–EöF—3¢çVÖ&W ¢Ö–åöæ÷F–6UöÖ–çWFW3¢çVÖ&W"ÂçVÆÀ¢æÖS¢7G&–ærÂçVÆÀ¢÷&væ—¦F–öåö–C¢7G&–ærÂçVÆÀ¢÷væW%ö–C¢7G&–æp¢÷væW%÷–ã¢7G&–ærÂçVÆÀ¢÷væW%÷–åö†6ƒ¢7G&–ærÂçVÆÀ¢†öæUöçVÖ&W#¢7G&–ærÂçVÆÀ¢–ã¢7G&–ærÂçVÆÀ¢Æã¢7G&–ærÂçVÆÀ¢÷7FÅö6öFS¢7G&–ærÂçVÆÀ¢&÷f–æ6S¢7G&–ærÂçVÆÀ¢&F–æs¢çVÖ&W"ÂçVÆÀ¢&WV—&UöWF†÷&—¦F–öã¢&ööÆVâÂçVÆÀ¢&WV—&Uö6W6Uö6÷'&V7F–öã¢&ööÆVâÂçVÆÀ¢6†÷öæÖS¢7G&–ærÂçVÆÀ¢6†÷÷7WÆ–W5ö6öÖ÷VçC¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5öVæ&ÆVC¢&ööÆVâÂçVÆÀ¢6†÷÷7WÆ–W5öfÆEöÖ÷VçC¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5÷W&6VçC¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5÷G—S¢7G&–ærÂçVÆÀ¢6ÇVs¢7G&–ærÂçVÆÀ¢7G&VWC¢7G&–ærÂçVÆÀ¢7G&—Uö66÷VçEö–C¢7G&–ærÂçVÆÀ¢7G&—Uö&–ÆÆ–æu÷7–æ5öW'&÷#¢7G&–ærÂçVÆÀ¢7G&—Uö&–ÆÆ–æu÷7–æ5÷&WV—&VC¢&ööÆVà¢7G&—Uö&–ÆÆ–æu÷7–æ6VEöC¢7G&–ærÂçVÆÀ¢7G&—Uö6†&vW5öVæ&ÆVC¢&ööÆVà¢7G&—Uö6†V6¶÷WE÷6W76–öåö–C¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7Eö6†&vUöÖöFVÃ¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöF6†&ö&E÷G—S¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöfVW5ö6öÆÆV7F÷#¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöÆ÷76W5ö6öÆÆV7F÷#¢7G&–ærÂçVÆÀ¢7G&—Uö7W'&VçE÷W&–öEöVæC¢7G&–ærÂçVÆÀ¢7G&—Uö7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢7G&—UöFVfVÇEö7W'&Væ7“¢7G&–æp¢7G&—UöFWF–Ç5÷7V&Ö—GFVC¢&ööÆVà¢7G&—Uööæ&ö&F–æuö6ö×ÆWFVC¢&ööÆVà¢7G&—U÷–÷WG5öVæ&ÆVC¢&ööÆVà¢7G&—U÷ÆFf÷&ÕöfVUö'3¢çVÖ&W ¢7G&—U÷&–6–æuöÖöFVÃ¢7G&–æp¢7G&—U÷7V'67&—F–öåö–C¢7G&–ærÂçVÆÀ¢7G&—U÷7V'67&—F–öå÷7FGW3¢7G&–ærÂçVÆÀ¢7G&—U÷G&–ÅöVæC¢7G&–ærÂçVÆÀ¢7V'67&—F–öå÷6¶vS¢7G&–ærÂçVÆÀ¢7WÆ–W5÷W&6VçC¢çVÖ&W"ÂçVÆÀ¢F…÷&FS¢çVÖ&W"ÂçVÆÀ¢F–ÖW¦öæS¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–ærÂçVÆÀ¢W6Uö“¢&ööÆVâÂçVÆÀ¢W6W%öÆ–Ö—C¢çVÖ&W"ÂçVÆÀ¢Ð¢–ç6W'C¢°¢66WG5ööæÆ–æUö&öö¶–æsó¢&ööÆVâÂçVÆÀ¢7F—fU÷W6W%ö6÷VçCó¢çVÖ&W"ÂçVÆÀ¢FG&W73ó¢7G&–ærÂçVÆÀ¢WFõövVæW&FU÷Fcó¢&ööÆVâÂçVÆÀ¢WFõ÷6VæE÷V÷FUöVÖ–Ãó¢&ööÆVâÂçVÆÀ¢&–ÆÆ&ÆU÷W6W%ö6÷VçCó¢çVÖ&W ¢&–ÆÆ–æuöVçF—FÆVÖVçEö÷fW'&–FSó¢7G&–ærÂçVÆÀ¢&–ÆÆ–æuöVçF—FÆVÖVçE÷WFFVEöCó¢7G&–æp¢&–ÆÆ–æuöw&6U÷VçF–Ãó¢7G&–ærÂçVÆÀ¢'W6–æW75öæÖSó¢7G&–ærÂçVÆÀ¢6—G“ó¢7G&–ærÂçVÆÀ¢6÷VçG'“ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢FVfVÇE÷7Fö6µöÆö6F–öåö–Có¢7G&–ærÂçVÆÀ¢F–væ÷7F–5öfVSó¢çVÖ&W"ÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢VÖ–Åööåö6ö×ÆWFSó¢&ööÆVâÂçVÆÀ¢vVõöÆCó¢çVÖ&W"ÂçVÆÀ¢vVõöÆæsó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢–ÖvW3ó¢7G&–æuµÒÂçVÆÀ¢–çfö–6Uöfö÷FW#ó¢7G&–ærÂçVÆÀ¢–çfö–6U÷FW&×3ó¢7G&–ærÂçVÆÀ¢Æ&÷%÷&FSó¢çVÖ&W"ÂçVÆÀ¢Æö6F–öå÷G—Só¢7G&–æp¢Æövõ÷W&Ãó¢7G&–ærÂçVÆÀ¢Ö…öÆVEöF—3ó¢çVÖ&W"ÂçVÆÀ¢Ö…÷W6W'3ó¢çVÖ&W"ÂçVÆÀ¢ÖVçU÷&W—%÷&–6–æu÷fÆ–EöF—3ó¢çVÖ&W ¢Ö–åöæ÷F–6UöÖ–çWFW3ó¢çVÖ&W"ÂçVÆÀ¢æÖSó¢7G&–ærÂçVÆÀ¢÷&væ—¦F–öåö–Có¢7G&–ærÂçVÆÀ¢÷væW%ö–C¢7G&–æp¢÷væW%÷–ãó¢7G&–ærÂçVÆÀ¢÷væW%÷–åö†6ƒó¢7G&–ærÂçVÆÀ¢†öæUöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢–ãó¢7G&–ærÂçVÆÀ¢Æãó¢7G&–ærÂçVÆÀ¢÷7FÅö6öFSó¢7G&–ærÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢&F–æsó¢çVÖ&W"ÂçVÆÀ¢&WV—&UöWF†÷&—¦F–öãó¢&ööÆVâÂçVÆÀ¢&WV—&Uö6W6Uö6÷'&V7F–öãó¢&ööÆVâÂçVÆÀ¢6†÷öæÖSó¢7G&–ærÂçVÆÀ¢6†÷÷7WÆ–W5ö6öÖ÷VçCó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5öVæ&ÆVCó¢&ööÆVâÂçVÆÀ¢6†÷÷7WÆ–W5öfÆEöÖ÷VçCó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5÷W&6VçCó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5÷G—Só¢7G&–ærÂçVÆÀ¢6ÇVsó¢7G&–ærÂçVÆÀ¢7G&VWCó¢7G&–ærÂçVÆÀ¢7G&—Uö66÷VçEö–Có¢7G&–ærÂçVÆÀ¢7G&—Uö&–ÆÆ–æu÷7–æ5öW'&÷#ó¢7G&–ærÂçVÆÀ¢7G&—Uö&–ÆÆ–æu÷7–æ5÷&WV—&VCó¢&ööÆVà¢7G&—Uö&–ÆÆ–æu÷7–æ6VEöCó¢7G&–ærÂçVÆÀ¢7G&—Uö6†&vW5öVæ&ÆVCó¢&ööÆVà¢7G&—Uö6†V6¶÷WE÷6W76–öåö–Có¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7Eö6†&vUöÖöFVÃó¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöF6†&ö&E÷G—Só¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöfVW5ö6öÆÆV7F÷#ó¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöÆ÷76W5ö6öÆÆV7F÷#ó¢7G&–ærÂçVÆÀ¢7G&—Uö7W'&VçE÷W&–öEöVæCó¢7G&–ærÂçVÆÀ¢7G&—Uö7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢7G&—UöFVfVÇEö7W'&Væ7“ó¢7G&–æp¢7G&—UöFWF–Ç5÷7V&Ö—GFVCó¢&ööÆVà¢7G&—Uööæ&ö&F–æuö6ö×ÆWFVCó¢&ööÆVà¢7G&—U÷–÷WG5öVæ&ÆVCó¢&ööÆVà¢7G&—U÷ÆFf÷&ÕöfVUö'3ó¢çVÖ&W ¢7G&—U÷&–6–æuöÖöFVÃó¢7G&–æp¢7G&—U÷7V'67&—F–öåö–Có¢7G&–ærÂçVÆÀ¢7G&—U÷7V'67&—F–öå÷7FGW3ó¢7G&–ærÂçVÆÀ¢7G&—U÷G&–ÅöVæCó¢7G&–ærÂçVÆÀ¢7V'67&—F–öå÷6¶vSó¢7G&–ærÂçVÆÀ¢7WÆ–W5÷W&6VçCó¢çVÖ&W"ÂçVÆÀ¢F…÷&FSó¢çVÖ&W"ÂçVÆÀ¢F–ÖW¦öæSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6Uö“ó¢&ööÆVâÂçVÆÀ¢W6W%öÆ–Ö—Có¢çVÖ&W"ÂçVÆÀ¢Ð¢WFFS¢°¢66WG5ööæÆ–æUö&öö¶–æsó¢&ööÆVâÂçVÆÀ¢7F—fU÷W6W%ö6÷VçCó¢çVÖ&W"ÂçVÆÀ¢FG&W73ó¢7G&–ærÂçVÆÀ¢WFõövVæW&FU÷Fcó¢&ööÆVâÂçVÆÀ¢WFõ÷6VæE÷V÷FUöVÖ–Ãó¢&ööÆVâÂçVÆÀ¢&–ÆÆ&ÆU÷W6W%ö6÷VçCó¢çVÖ&W ¢&–ÆÆ–æuöVçF—FÆVÖVçEö÷fW'&–FSó¢7G&–ærÂçVÆÀ¢&–ÆÆ–æuöVçF—FÆVÖVçE÷WFFVEöCó¢7G&–æp¢&–ÆÆ–æuöw&6U÷VçF–Ãó¢7G&–ærÂçVÆÀ¢'W6–æW75öæÖSó¢7G&–ærÂçVÆÀ¢6—G“ó¢7G&–ærÂçVÆÀ¢6÷VçG'“ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢FVfVÇE÷7Fö6µöÆö6F–öåö–Có¢7G&–ærÂçVÆÀ¢F–væ÷7F–5öfVSó¢çVÖ&W"ÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢VÖ–Åööåö6ö×ÆWFSó¢&ööÆVâÂçVÆÀ¢vVõöÆCó¢çVÖ&W"ÂçVÆÀ¢vVõöÆæsó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢–ÖvW3ó¢7G&–æuµÒÂçVÆÀ¢–çfö–6Uöfö÷FW#ó¢7G&–ærÂçVÆÀ¢–çfö–6U÷FW&×3ó¢7G&–ærÂçVÆÀ¢Æ&÷%÷&FSó¢çVÖ&W"ÂçVÆÀ¢Æö6F–öå÷G—Só¢7G&–æp¢Æövõ÷W&Ãó¢7G&–ærÂçVÆÀ¢Ö…öÆVEöF—3ó¢çVÖ&W"ÂçVÆÀ¢Ö…÷W6W'3ó¢çVÖ&W"ÂçVÆÀ¢ÖVçU÷&W—%÷&–6–æu÷fÆ–EöF—3ó¢çVÖ&W ¢Ö–åöæ÷F–6UöÖ–çWFW3ó¢çVÖ&W"ÂçVÆÀ¢æÖSó¢7G&–ærÂçVÆÀ¢÷&væ—¦F–öåö–Có¢7G&–ærÂçVÆÀ¢÷væW%ö–Có¢7G&–æp¢÷væW%÷–ãó¢7G&–ærÂçVÆÀ¢÷væW%÷–åö†6ƒó¢7G&–ærÂçVÆÀ¢†öæUöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢–ãó¢7G&–ærÂçVÆÀ¢Æãó¢7G&–ærÂçVÆÀ¢÷7FÅö6öFSó¢7G&–ærÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢&F–æsó¢çVÖ&W"ÂçVÆÀ¢&WV—&UöWF†÷&—¦F–öãó¢&ööÆVâÂçVÆÀ¢&WV—&Uö6W6Uö6÷'&V7F–öãó¢&ööÆVâÂçVÆÀ¢6†÷öæÖSó¢7G&–ærÂçVÆÀ¢6†÷÷7WÆ–W5ö6öÖ÷VçCó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5öVæ&ÆVCó¢&ööÆVâÂçVÆÀ¢6†÷÷7WÆ–W5öfÆEöÖ÷VçCó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5÷W&6VçCó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5÷G—Só¢7G&–ærÂçVÆÀ¢6ÇVsó¢7G&–ærÂçVÆÀ¢7G&VWCó¢7G&–ærÂçVÆÀ¢7G&—Uö66÷VçEö–Có¢7G&–ærÂçVÆÀ¢7G&—Uö&–ÆÆ–æu÷7–æ5öW'&÷#ó¢7G&–ærÂçVÆÀ¢7G&—Uö&–ÆÆ–æu÷7–æ5÷&WV—&VCó¢&ööÆVà¢7G&—Uö&–ÆÆ–æu÷7–æ6VEöCó¢7G&–ærÂçVÆÀ¢7G&—Uö6†&vW5öVæ&ÆVCó¢&ööÆVà¢7G&—Uö6†V6¶÷WE÷6W76–öåö–Có¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7Eö6†&vUöÖöFVÃó¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöF6†&ö&E÷G—Só¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöfVW5ö6öÆÆV7F÷#ó¢7G&–ærÂçVÆÀ¢7G&—Uö6öææV7EöÆ÷76W5ö6öÆÆV7F÷#ó¢7G&–ærÂçVÆÀ¢7G&—Uö7W'&VçE÷W&–öEöVæCó¢7G&–ærÂçVÆÀ¢7G&—Uö7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢7G&—UöFVfVÇEö7W'&Væ7“ó¢7G&–æp¢7G&—UöFWF–Ç5÷7V&Ö—GFVCó¢&ööÆVà¢7G&—Uööæ&ö&F–æuö6ö×ÆWFVCó¢&ööÆVà¢7G&—U÷–÷WG5öVæ&ÆVCó¢&ööÆVà¢7G&—U÷ÆFf÷&ÕöfVUö'3ó¢çVÖ&W ¢7G&—U÷&–6–æuöÖöFVÃó¢7G&–æp¢7G&—U÷7V'67&—F–öåö–Có¢7G&–ærÂçVÆÀ¢7G&—U÷7V'67&—F–öå÷7FGW3ó¢7G&–ærÂçVÆÀ¢7G&—U÷G&–ÅöVæCó¢7G&–ærÂçVÆÀ¢7V'67&—F–öå÷6¶vSó¢7G&–ærÂçVÆÀ¢7WÆ–W5÷W&6VçCó¢çVÖ&W"ÂçVÆÀ¢F…÷&FSó¢çVÖ&W"ÂçVÆÀ¢F–ÖW¦öæSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6Uö“ó¢&ööÆVâÂçVÆÀ¢W6W%öÆ–Ö—Có¢çVÖ&W"ÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷5ö÷væW%öf² ¢6öÇVÖç3¢²&÷væW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffeöf–Æ&–Æ—G•ö&Æö6·3¢°¢&÷s¢°¢&Æö6µ÷G—S¢7G&–æp¢7&VFVEöC¢7G&–æp¢VæG5öC¢7G&–æp¢–C¢7G&–æp¢Æ&VÃ¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Uö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷G—S¢7G&–æp¢7F'G5öC¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢&Æö6µ÷G—S¢7G&–æp¢7&VFVEöCó¢7G&–æp¢VæG5öC¢7G&–æp¢–Có¢7G&–æp¢Æ&VÃó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷G—S¢7G&–æp¢7F'G5öC¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢&Æö6µ÷G—Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢VæG5öCó¢7G&–æp¢–Có¢7G&–æp¢Æ&VÃó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷G—Só¢7G&–æp¢7F'G5öCó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffeöf–Æ&–Æ—G•ö&Æö6·5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeöf–Æ&–Æ—G•ö&Æö6·5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeöf–Æ&–Æ—G•ö&Æö6·5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffeö6&–Æ—G•ö÷fW'&–FW3¢°¢&÷s¢°¢6&–Æ—G•ö¶W“¢7G&–æp¢6†ævVEö'•÷&öf–ÆUö–C¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢VffV7C¢7G&–æp¢–C¢7G&–æp¢&öf–ÆUö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢6&–Æ—G•ö¶W“¢7G&–æp¢6†ævVEö'•÷&öf–ÆUö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢VffV7C¢7G&–æp¢–Có¢7G&–æp¢&öf–ÆUö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢6&–Æ—G•ö¶W“ó¢7G&–æp¢6†ævVEö'•÷&öf–ÆUö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢VffV7Có¢7G&–æp¢–Có¢7G&–æp¢&öf–ÆUö–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6&–Æ—G•ö÷fW'&–FW5ö6&–Æ—G•ö¶W•öf¶W’ ¢6öÇVÖç3¢²&6&–Æ—G•ö¶W’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&·76Uö6&–Æ—F–W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&6&–Æ—G•ö¶W’%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6&–Æ—G•ö÷fW'&–FW5ö6†ævVEö'•÷&öf–ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²&6†ævVEö'•÷&öf–ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6&–Æ—G•ö÷fW'&–FW5÷&öf–ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'&öf–ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6&–Æ—G•ö÷fW'&–FW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6&–Æ—G•ö÷fW'&–FW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffeö6W'F–f–6F–öç3¢°¢&÷s¢°¢6W'EöæÖS¢7G&–æp¢6W'EöçVÖ&W#¢7G&–ærÂçVÆÀ¢6W'E÷G—S¢7G&–æp¢7&VFVEöC¢7G&–æp¢W‡—'•öFFS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢—77VUöFFS¢7G&–ærÂçVÆÀ¢—77V–æuö&öG“¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6W'EöæÖS¢7G&–æp¢6W'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢6W'E÷G—Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢W‡—'•öFFSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—77VUöFFSó¢7G&–ærÂçVÆÀ¢—77V–æuö&öG“ó¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢6W'EöæÖSó¢7G&–æp¢6W'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢6W'E÷G—Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢W‡—'•öFFSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—77VUöFFSó¢7G&–ærÂçVÆÀ¢—77V–æuö&öG“ó¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6W'F–f–6F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6W'F–f–6F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö6W'F–f–6F–öç5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffeö–çf—FUö6æF–FFW3¢°¢&÷s¢°¢6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢7&VFVE÷&öf–ÆUö–C¢7G&–ærÂçVÆÀ¢7&VFVE÷W6W%ö–C¢7G&–ærÂçVÆÀ¢VÖ–Ã¢7G&–ærÂçVÆÀ¢VÖ–ÅöÆ3¢7G&–ærÂçVÆÀ¢W'&÷#¢7G&–ærÂçVÆÀ¢gVÆÅöæÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢†öæS¢7G&–ærÂçVÆÀ¢&öÆS¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'W6W%÷&öÆUöVçVÒ%ÒÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6S¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W&æÖS¢7G&–ærÂçVÆÀ¢W6W&æÖUöÆ3¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7&VFVE÷&öf–ÆUö–Có¢7G&–ærÂçVÆÀ¢7&VFVE÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢VÖ–ÅöÆ3ó¢7G&–ærÂçVÆÀ¢W'&÷#ó¢7G&–ærÂçVÆÀ¢gVÆÅöæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢†öæSó¢7G&–ærÂçVÆÀ¢&öÆSó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'W6W%÷&öÆUöVçVÒ%ÒÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Só¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W&æÖSó¢7G&–ærÂçVÆÀ¢W6W&æÖUöÆ3ó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7&VFVE÷&öf–ÆUö–Có¢7G&–ærÂçVÆÀ¢7&VFVE÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢VÖ–ÅöÆ3ó¢7G&–ærÂçVÆÀ¢W'&÷#ó¢7G&–ærÂçVÆÀ¢gVÆÅöæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢†öæSó¢7G&–ærÂçVÆÀ¢&öÆSó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'W6W%÷&öÆUöVçVÒ%ÒÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6Só¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W&æÖSó¢7G&–ærÂçVÆÀ¢W6W&æÖUöÆ3ó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FUö6æF–FFW5ö7&VFVE÷&öf–ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²&7&VFVE÷&öf–ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FUö6æF–FFW5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FUö6æF–FFW5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FUö6æF–FFW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FUö6æF–FFW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffeö–çf—FU÷7VvvW7F–öç3¢°¢&÷s¢°¢6÷VçE÷7VvvW7FVC¢çVÖ&W ¢7&VFVEöC¢7G&–æp¢VÖ–Ã¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–C¢7G&–ærÂçVÆÀ¢gVÆÅöæÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢&öÆS¢7G&–æp¢6†÷ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6÷VçE÷7VvvW7FVCó¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢gVÆÅöæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢&öÆS¢7G&–æp¢6†÷ö–C¢7G&–æp¢Ð¢WFFS¢°¢6÷VçE÷7VvvW7FVCó¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢gVÆÅöæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢&öÆSó¢7G&–æp¢6†÷ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FU÷7VvvW7F–öç5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FU÷7VvvW7F–öç5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FU÷7VvvW7F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffeö–çf—FU÷7VvvW7F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffe÷66†VGVÆUö÷fW'&–FW3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢VæE÷F–ÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢æ÷FW3¢7G&–ærÂçVÆÀ¢66†VGVÆUöFFS¢7G&–æp¢6†÷ö–C¢7G&–æp¢6÷W&6U÷G—S¢7G&–æp¢7F'E÷F–ÖS¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢Vç–Eö'&VµöÖ–çWFW3¢çVÖ&W ¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢66†VGVÆUöFFS¢7G&–æp¢6†÷ö–C¢7G&–æp¢6÷W&6U÷G—Só¢7G&–æp¢7F'E÷F–ÖSó¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢Vç–Eö'&VµöÖ–çWFW3ó¢çVÖ&W ¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢66†VGVÆUöFFSó¢7G&–æp¢6†÷ö–Có¢7G&–æp¢6÷W&6U÷G—Só¢7G&–æp¢7F'E÷F–ÖSó¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢Vç–Eö'&VµöÖ–çWFW3ó¢çVÖ&W ¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷66†VGVÆUö÷fW'&–FW5ö7&VFVEö'•öf¶W’ ¢6öÇVÖç3¢²&7&VFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷66†VGVÆUö÷fW'&–FW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷66†VGVÆUö÷fW'&–FW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷66†VGVÆUö÷fW'&–FW5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffe÷66†VGVÆU÷FV×ÆFW3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢F•ööe÷vVV³¢çVÖ&W ¢VffV7F—fUög&öÓ¢7G&–ærÂçVÆÀ¢VffV7F—fU÷Fó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢—5÷v÷&¶–æuöF“¢&ööÆVà¢6†÷ö–C¢7G&–æp¢7F'E÷F–ÖS¢7G&–ærÂçVÆÀ¢Vç–Eö'&VµöÖ–çWFW3¢çVÖ&W ¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢F•ööe÷vVV³¢çVÖ&W ¢VffV7F—fUög&öÓó¢7G&–ærÂçVÆÀ¢VffV7F—fU÷Fóó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5÷v÷&¶–æuöF“ó¢&ööÆVà¢6†÷ö–C¢7G&–æp¢7F'E÷F–ÖSó¢7G&–ærÂçVÆÀ¢Vç–Eö'&VµöÖ–çWFW3ó¢çVÖ&W ¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢F•ööe÷vVV³ó¢çVÖ&W ¢VffV7F—fUög&öÓó¢7G&–ærÂçVÆÀ¢VffV7F—fU÷Fóó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5÷v÷&¶–æuöF“ó¢&ööÆVà¢6†÷ö–Có¢7G&–æp¢7F'E÷F–ÖSó¢7G&–ærÂçVÆÀ¢Vç–Eö'&VµöÖ–çWFW3ó¢çVÖ&W ¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷66†VGVÆU÷FV×ÆFW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷66†VGVÆU÷FV×ÆFW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷66†VGVÆU÷FV×ÆFW5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Ffe÷F–ÖUööfe÷&WVW7G3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢VæG5öC¢7G&–æp¢–C¢7G&–æp¢—5÷'F–ÅöF“¢&ööÆVà¢&V6öã¢7G&–ærÂçVÆÀ¢&WVW7E÷G—S¢7G&–æp¢&WVW7FVEöC¢7G&–æp¢&WVW7FVEö'“¢7G&–æp¢&Wf–Wuöæ÷FS¢7G&–ærÂçVÆÀ¢&Wf–WvVEöC¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7F'G5öC¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢VæG5öC¢7G&–æp¢–Có¢7G&–æp¢—5÷'F–ÅöF“ó¢&ööÆVà¢&V6öãó¢7G&–ærÂçVÆÀ¢&WVW7E÷G—S¢7G&–æp¢&WVW7FVEöCó¢7G&–æp¢&WVW7FVEö'“¢7G&–æp¢&Wf–Wuöæ÷FSó¢7G&–ærÂçVÆÀ¢&Wf–WvVEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“ó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7F'G5öC¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢VæG5öCó¢7G&–æp¢–Có¢7G&–æp¢—5÷'F–ÅöF“ó¢&ööÆVà¢&V6öãó¢7G&–ærÂçVÆÀ¢&WVW7E÷G—Só¢7G&–æp¢&WVW7FVEöCó¢7G&–æp¢&WVW7FVEö'“ó¢7G&–æp¢&Wf–Wuöæ÷FSó¢7G&–ærÂçVÆÀ¢&Wf–WvVEöCó¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“ó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7F'G5öCó¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷F–ÖUööfe÷&WVW7G5÷&WVW7FVEö'•öf¶W’ ¢6öÇVÖç3¢²'&WVW7FVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷F–ÖUööfe÷&WVW7G5÷&Wf–WvVEö'•öf¶W’ ¢6öÇVÖç3¢²'&Wf–WvVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷F–ÖUööfe÷&WVW7G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷F–ÖUööfe÷&WVW7G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Ffe÷F–ÖUööfe÷&WVW7G5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7Fö6µöÆö6F–öç3¢°¢&÷s¢°¢6öFS¢7G&–æp¢–C¢7G&–æp¢æÖS¢7G&–æp¢6†÷ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6öFS¢7G&–æp¢–Có¢7G&–æp¢æÖS¢7G&–æp¢6†÷ö–C¢7G&–æp¢Ð¢WFFS¢°¢6öFSó¢7G&–æp¢–Có¢7G&–æp¢æÖSó¢7G&–æp¢6†÷ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢7Fö6µöÖ÷fW3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–FV×÷FVæ7•ö¶W“¢7G&–ærÂçVÆÀ¢Æ–fV7–6ÆU÷VçF—G“¢çVÖ&W ¢Æö6F–öåö–C¢7G&–æp¢ÖWFFF¢§6öà¢'Eö–C¢7G&–æp¢'E÷&WVW7Eö—FVÕö–C¢7G&–ærÂçVÆÀ¢W&6†6Uö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢G•ö6†ævS¢çVÖ&W ¢&V6öã¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'7Fö6µöÖ÷fU÷&V6öâ%Ð¢&VfW&Væ6Uö–C¢7G&–ærÂçVÆÀ¢&VfW&Væ6Uö¶–æC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%÷'Eö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–FV×÷FVæ7•ö¶W“ó¢7G&–ærÂçVÆÀ¢Æ–fV7–6ÆU÷VçF—G“ó¢çVÖ&W ¢Æö6F–öåö–C¢7G&–æp¢ÖWFFFó¢§6öà¢'Eö–C¢7G&–æp¢'E÷&WVW7Eö—FVÕö–Có¢7G&–ærÂçVÆÀ¢W&6†6Uö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢G•ö6†ævS¢çVÖ&W ¢&V6öã¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'7Fö6µöÖ÷fU÷&V6öâ%Ð¢&VfW&Væ6Uö–Có¢7G&–ærÂçVÆÀ¢&VfW&Væ6Uö¶–æCó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%÷'Eö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–FV×÷FVæ7•ö¶W“ó¢7G&–ærÂçVÆÀ¢Æ–fV7–6ÆU÷VçF—G“ó¢çVÖ&W ¢Æö6F–öåö–Có¢7G&–æp¢ÖWFFFó¢§6öà¢'Eö–Có¢7G&–æp¢'E÷&WVW7Eö—FVÕö–Có¢7G&–ærÂçVÆÀ¢W&6†6Uö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢G•ö6†ævSó¢çVÖ&W ¢&V6öãó¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'7Fö6µöÖ÷fU÷&V6öâ%Ð¢&VfW&Væ6Uö–Có¢7G&–ærÂçVÆÀ¢&VfW&Væ6Uö¶–æCó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢v÷&µö÷&FW%÷'Eö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5öÆö6F–öåö–Eöf¶W’ ¢6öÇVÖç3¢²&Æö6F–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'7Fö6µöÆö6F–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷'E÷&WVW7Eö—FVÕö–Eöf¶W’ ¢6öÇVÖç3¢²''E÷&WVW7Eö—FVÕö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷&WVW7Eö—FV×2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷W&6†6Uö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'W&6†6Uö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'W&6†6Uö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷6†÷öf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷6†÷öf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷v÷&µö÷&FW%÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%÷'Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&–çfö–6UöæWEö—77VVE÷'G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7Fö6µöÖ÷fW5÷v÷&µö÷&FW%÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%÷'Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%÷'G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7WÆ–W%ö6FÆöuö—FV×3¢°¢&÷s¢°¢'&æC¢7G&–ærÂçVÆÀ¢6ö×F–&–Æ—G“¢§6öâÂçVÆÀ¢6÷7C¢çVÖ&W"ÂçVÆÀ¢FW67&—F–öã¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷6·S¢7G&–æp¢–C¢7G&–æp¢&–6S¢çVÖ&W"ÂçVÆÀ¢7WÆ–W%ö–C¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢'&æCó¢7G&–ærÂçVÆÀ¢6ö×F–&–Æ—G“ó¢§6öâÂçVÆÀ¢6÷7Có¢çVÖ&W"ÂçVÆÀ¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷6·S¢7G&–æp¢–Có¢7G&–æp¢&–6Só¢çVÖ&W"ÂçVÆÀ¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢'&æCó¢7G&–ærÂçVÆÀ¢6ö×F–&–Æ—G“ó¢§6öâÂçVÆÀ¢6÷7Có¢çVÖ&W"ÂçVÆÀ¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢W‡FW&æÅ÷6·Só¢7G&–æp¢–Có¢7G&–æp¢&–6Só¢çVÖ&W"ÂçVÆÀ¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7WÆ–W%ö6FÆöuö—FV×5÷7WÆ–W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'7WÆ–W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G5÷7WÆ–W'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7WÆ–W%÷V÷FUö&F6…÷&÷w3¢°¢&÷s¢°¢&F6…ö–C¢7G&–æp¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢ÖVEö6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢ÖVEöÖVçU÷&W—%ö—FVÕö–C¢7G&–ærÂçVÆÀ¢ÖVEöÖVçU÷&W—%ö—FVÕ÷'Eö–C¢7G&–ærÂçVÆÀ¢&uöFW67&—F–öã¢7G&–ærÂçVÆÀ¢&uöæ÷FW3¢7G&–ærÂçVÆÀ¢&u÷'EöçVÖ&W#¢7G&–ærÂçVÆÀ¢&u÷G“¢çVÖ&W"ÂçVÆÀ¢&u÷6VÆÃ¢çVÖ&W"ÂçVÆÀ¢&u÷Væ—Eö6÷7C¢çVÖ&W"ÂçVÆÀ¢&Wf–Wu÷7FGW3¢7G&–æp¢Ð¢–ç6W'C¢°¢&F6…ö–C¢7G&–æp¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖVEö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢ÖVEöÖVçU÷&W—%ö—FVÕö–Có¢7G&–ærÂçVÆÀ¢ÖVEöÖVçU÷&W—%ö—FVÕ÷'Eö–Có¢7G&–ærÂçVÆÀ¢&uöFW67&—F–öãó¢7G&–ærÂçVÆÀ¢&uöæ÷FW3ó¢7G&–ærÂçVÆÀ¢&u÷'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢&u÷G“ó¢çVÖ&W"ÂçVÆÀ¢&u÷6VÆÃó¢çVÖ&W"ÂçVÆÀ¢&u÷Væ—Eö6÷7Có¢çVÖ&W"ÂçVÆÀ¢&Wf–Wu÷7FGW3ó¢7G&–æp¢Ð¢WFFS¢°¢&F6…ö–Có¢7G&–æp¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖVEö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢ÖVEöÖVçU÷&W—%ö—FVÕö–Có¢7G&–ærÂçVÆÀ¢ÖVEöÖVçU÷&W—%ö—FVÕ÷'Eö–Có¢7G&–ærÂçVÆÀ¢&uöFW67&—F–öãó¢7G&–ærÂçVÆÀ¢&uöæ÷FW3ó¢7G&–ærÂçVÆÀ¢&u÷'EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢&u÷G“ó¢çVÖ&W"ÂçVÆÀ¢&u÷6VÆÃó¢çVÖ&W"ÂçVÆÀ¢&u÷Væ—Eö6÷7Có¢çVÖ&W"ÂçVÆÀ¢&Wf–Wu÷7FGW3ó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7WÆ–W%÷V÷FUö&F6…÷&÷w5ö&F6…ö–Eöf¶W’ ¢6öÇVÖç3¢²&&F6…ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'7WÆ–W%÷V÷FUö&F6†W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7WÆ–W%÷V÷FUö&F6†W3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢f–ÆUöæÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢&ö6W76VEöC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷G—S¢7G&–æp¢7FGW3¢7G&–æp¢7F÷&vU÷Fƒ¢7G&–ærÂçVÆÀ¢7WÆ–W%ö–C¢7G&–ærÂçVÆÀ¢7WÆ–W%öæÖS¢7G&–ærÂçVÆÀ¢WÆöFVEö'“¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢f–ÆUöæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢&ö6W76VEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷G—Só¢7G&–æp¢7FGW3ó¢7G&–æp¢7F÷&vU÷Fƒó¢7G&–ærÂçVÆÀ¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢7WÆ–W%öæÖSó¢7G&–ærÂçVÆÀ¢WÆöFVEö'“ó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢f–ÆUöæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢&ö6W76VEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6U÷G—Só¢7G&–æp¢7FGW3ó¢7G&–æp¢7F÷&vU÷Fƒó¢7G&–ærÂçVÆÀ¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢7WÆ–W%öæÖSó¢7G&–ærÂçVÆÀ¢WÆöFVEö'“ó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7WÆ–W%÷V÷FUö&F6†W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7WÆ–W%÷V÷FUö&F6†W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7WÆ–W%÷V÷FUö&F6†W5÷7WÆ–W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'7WÆ–W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'7WÆ–W'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢7WÆ–W'3¢°¢&÷s¢°¢66÷VçEöæó¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢VÖ–Ã¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢—5ö7F—fS¢&ööÆVà¢æÖS¢7G&–æp¢æ÷FW3¢7G&–ærÂçVÆÀ¢†öæS¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢66÷VçEöæóó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢æÖS¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢†öæSó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢Ð¢WFFS¢°¢66÷VçEöæóó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢VÖ–Ãó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢æÖSó¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢†öæSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—3¢°¢&÷s¢°¢7F÷%÷W6W%ö–C¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢÷W&F–öåö¶W“¢7G&–æp¢÷W&F–öåöæÖS¢7G&–æp¢&W7VÇC¢§6öà¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7F÷%÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢÷W&F–öåö¶W“¢7G&–æp¢÷W&F–öåöæÖS¢7G&–æp¢&W7VÇCó¢§6öà¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7F÷%÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢÷W&F–öåö¶W“ó¢7G&–æp¢÷W&F–öåöæÖSó¢7G&–æp¢&W7VÇCó¢§6öà¢6†÷ö–Có¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'7—7FVÕöÆ–fV7–6ÆUö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢FV6…÷6W76–öç3¢°¢&÷s¢°¢VæFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–ç7V7F–öåö–C¢7G&–ærÂçVÆÀ¢6†–gEö–C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7F'FVEöC¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢VæFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–ç7V7F–öåö–Có¢7G&–ærÂçVÆÀ¢6†–gEö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'FVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢VæFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–ç7V7F–öåö–Có¢7G&–ærÂçVÆÀ¢6†–gEö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'FVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷6†–gEöf² ¢6öÇVÖç3¢²'6†–gEö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'FV6…÷6†–gG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷6†÷öf² ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷6†÷öf² ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷vöÅöf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷vöÅöf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢FV6…÷6†–gG3¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢VæE÷F–ÖS¢7G&–ærÂçVÆÀ¢W†6ÇVFVEög&öÕ÷—&öÆÃ¢&ööÆVà¢–C¢7G&–æp¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7F'E÷F–ÖS¢7G&–æp¢7FGW3¢7G&–æp¢G—S¢7G&–æp¢W6W%ö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖSó¢7G&–ærÂçVÆÀ¢W†6ÇVFVEög&öÕ÷—&öÆÃó¢&ööÆVà¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'E÷F–ÖSó¢7G&–æp¢7FGW3ó¢7G&–æp¢G—Só¢7G&–æp¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢VæE÷F–ÖSó¢7G&–ærÂçVÆÀ¢W†6ÇVFVEög&öÕ÷—&öÆÃó¢&ööÆVà¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F'E÷F–ÖSó¢7G&–æp¢7FGW3ó¢7G&–æp¢G—Só¢7G&–æp¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6†–gG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6†–gG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'FV6…÷6†–gG5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢FV×ÆFUö—FV×3¢°¢&÷s¢°¢–C¢7G&–æp¢–çWE÷G—S¢7G&–ærÂçVÆÀ¢Æ&VÃ¢7G&–ærÂçVÆÀ¢6V7F–öã¢7G&–ærÂçVÆÀ¢FV×ÆFUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢–Có¢7G&–æp¢–çWE÷G—Só¢7G&–ærÂçVÆÀ¢Æ&VÃó¢7G&–ærÂçVÆÀ¢6V7F–öãó¢7G&–ærÂçVÆÀ¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢–Có¢7G&–æp¢–çWE÷G—Só¢7G&–ærÂçVÆÀ¢Æ&VÃó¢7G&–ærÂçVÆÀ¢6V7F–öãó¢7G&–ærÂçVÆÀ¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢W6vUöÆöw3¢°¢&÷s¢°¢fVGW&S¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢W6VEöC¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢fVGW&Só¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢W6VEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢fVGW&Só¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢W6VEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢W6W%ööÆ–÷WG3¢°¢&÷s¢°¢–C¢7G&–æp¢Æ–÷WC¢§6öà¢WFFVEöC¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–æp¢vÆÇW#¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢–Có¢7G&–æp¢Æ–÷WC¢§6öà¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–æp¢vÆÇW#ó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢–Có¢7G&–æp¢Æ–÷WCó¢§6öà¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–æp¢vÆÇW#ó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢W6W%÷Æç3¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢fVGW&W3¢§6öâÂçVÆÀ¢–C¢7G&–æp¢ÆåöæÖS¢7G&–æp¢W6W%ö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢fVGW&W3ó¢§6öâÂçVÆÀ¢–Có¢7G&–æp¢ÆåöæÖS¢7G&–æp¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢fVGW&W3ó¢§6öâÂçVÆÀ¢–Có¢7G&–æp¢ÆåöæÖSó¢7G&–æp¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢W6W%÷F†VÖU÷&VfW&Væ6W3¢°¢&÷s¢°¢&F—W5÷66ÆS¢7G&–ærÂçVÆÀ¢6†F÷u÷7G–ÆS¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢F†VÖUöÖöFS¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢&F—W5÷66ÆSó¢7G&–ærÂçVÆÀ¢6†F÷u÷7G–ÆSó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢F†VÖUöÖöFSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢&F—W5÷66ÆSó¢7G&–ærÂçVÆÀ¢6†F÷u÷7G–ÆSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢F†VÖUöÖöFSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'W6W%÷F†VÖU÷&VfW&Væ6W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'W6W%÷F†VÖU÷&VfW&Væ6W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'W6W%÷F†VÖU÷&VfW&Væ6W5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢W6W%÷v–FvWEöÆ–÷WG3¢°¢&÷s¢°¢–C¢7G&–æp¢Æ–÷WC¢§6öà¢WFFVEöC¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢–Có¢7G&–æp¢Æ–÷WC¢§6öà¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–æp¢Ð¢WFFS¢°¢–Có¢7G&–æp¢Æ–÷WCó¢§6öà¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢fV†–6ÆUöÖVF–¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢f–ÆVæÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7F÷&vU÷Fƒ¢7G&–æp¢G—S¢7G&–æp¢WÆöFVEö'“¢7G&–ærÂçVÆÀ¢W&Ã¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢f–ÆVæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F÷&vU÷Fƒ¢7G&–æp¢G—S¢7G&–æp¢WÆöFVEö'“ó¢7G&–ærÂçVÆÀ¢W&Ãó¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢f–ÆVæÖSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7F÷&vU÷Fƒó¢7G&–æp¢G—Só¢7G&–æp¢WÆöFVEö'“ó¢7G&–ærÂçVÆÀ¢W&Ãó¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆUöÖVF–÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆUöÖVF–÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆUöÖVF–÷WÆöFVEö'•öf¶W’ ¢6öÇVÖç3¢²'WÆöFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆUöÖVF–÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢fV†–6ÆUöÖVçW3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢FVfVÇEöÆ&÷%ö†÷W'3¢çVÖ&W"ÂçVÆÀ¢FVfVÇE÷'G3¢§6öà¢Væv–æUöfÖ–Ç“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢Ö¶S¢7G&–æp¢ÖöFVÃ¢7G&–æp¢6W'f–6Uö6öFS¢7G&–æp¢WFFVEöC¢7G&–æp¢–V%ög&öÓ¢çVÖ&W ¢–V%÷Fó¢çVÖ&W ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢FVfVÇEöÆ&÷%ö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢FVfVÇE÷'G3¢§6öà¢Væv–æUöfÖ–Ç“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Ö¶S¢7G&–æp¢ÖöFVÃ¢7G&–æp¢6W'f–6Uö6öFS¢7G&–æp¢WFFVEöCó¢7G&–æp¢–V%ög&öÓ¢çVÖ&W ¢–V%÷Fó¢çVÖ&W ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢FVfVÇEöÆ&÷%ö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢FVfVÇE÷'G3ó¢§6öà¢Væv–æUöfÖ–Ç“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Ö¶Só¢7G&–æp¢ÖöFVÃó¢7G&–æp¢6W'f–6Uö6öFSó¢7G&–æp¢WFFVEöCó¢7G&–æp¢–V%ög&öÓó¢çVÖ&W ¢–V%÷Fóó¢çVÖ&W ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆUöÖVçW5÷6W'f–6Uö6öFUöf¶W’ ¢6öÇVÖç3¢²'6W'f–6Uö6öFR%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&Ö–çFVææ6U÷6W'f–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&6öFR%Ð¢ÒÀ¢Ð¢Ð¢fV†–6ÆU÷†÷F÷3¢°¢&÷s¢°¢6F–öã¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢6†÷ö–C¢7G&–ærÂçVÆÀ¢WÆöFVEö'“¢7G&–ærÂçVÆÀ¢W&Ã¢7G&–æp¢fV†–6ÆUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6F–öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢WÆöFVEö'“ó¢7G&–ærÂçVÆÀ¢W&Ã¢7G&–æp¢fV†–6ÆUö–C¢7G&–æp¢Ð¢WFFS¢°¢6F–öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢WÆöFVEö'“ó¢7G&–ærÂçVÆÀ¢W&Ãó¢7G&–æp¢fV†–6ÆUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷†÷F÷5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷†÷F÷5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷†÷F÷5÷WÆöFVEö'•öf¶W’ ¢6öÇVÖç3¢²'WÆöFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷†÷F÷5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢fV†–6ÆU÷&V6ÆÅöfWF6…öÆ–Ö—G3¢°¢&÷s¢°¢&WVW7Eö6÷VçC¢çVÖ&W ¢66÷S¢7G&–æp¢6†÷ö–C¢7G&–æp¢7V&¦V7Eö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢v–æF÷u÷7F'FVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢&WVW7Eö6÷VçCó¢çVÖ&W ¢66÷S¢7G&–æp¢6†÷ö–C¢7G&–æp¢7V&¦V7Eö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢v–æF÷u÷7F'FVEöCó¢7G&–æp¢Ð¢WFFS¢°¢&WVW7Eö6÷VçCó¢çVÖ&W ¢66÷Só¢7G&–æp¢6†÷ö–Có¢7G&–æp¢7V&¦V7Eö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢v–æF÷u÷7F'FVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷&V6ÆÅöfWF6…öÆ–Ö—G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷&V6ÆÅöfWF6…öÆ–Ö—G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢fV†–6ÆU÷&V6ÆÇ3¢°¢&÷s¢°¢6×–våöçVÖ&W#¢7G&–æp¢6ö×öæVçC¢7G&–ærÂçVÆÀ¢6öç6WVVæ6S¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢Ö¶S¢7G&–ærÂçVÆÀ¢ÖçVf7GW&W#¢7G&–ærÂçVÆÀ¢ÖöFVÃ¢7G&–ærÂçVÆÀ¢ÖöFVÅ÷–V#¢7G&–ærÂçVÆÀ¢æ‡G6ö6×–vã¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢&VÖVG“¢7G&–ærÂçVÆÀ¢&W÷'EöFFS¢7G&–ærÂçVÆÀ¢&W÷'E÷&V6V—fVEöFFS¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7VÖÖ'“¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢f–ã¢7G&–æp¢Ð¢–ç6W'C¢°¢6×–våöçVÖ&W#¢7G&–æp¢6ö×öæVçCó¢7G&–ærÂçVÆÀ¢6öç6WVVæ6Só¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢Ö¶Só¢7G&–ærÂçVÆÀ¢ÖçVf7GW&W#ó¢7G&–ærÂçVÆÀ¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢ÖöFVÅ÷–V#ó¢7G&–ærÂçVÆÀ¢æ‡G6ö6×–vãó¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢&VÖVG“ó¢7G&–ærÂçVÆÀ¢&W÷'EöFFSó¢7G&–ærÂçVÆÀ¢&W÷'E÷&V6V—fVEöFFSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7VÖÖ'“ó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢f–ã¢7G&–æp¢Ð¢WFFS¢°¢6×–våöçVÖ&W#ó¢7G&–æp¢6ö×öæVçCó¢7G&–ærÂçVÆÀ¢6öç6WVVæ6Só¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢Ö¶Só¢7G&–ærÂçVÆÀ¢ÖçVf7GW&W#ó¢7G&–ærÂçVÆÀ¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢ÖöFVÅ÷–V#ó¢7G&–ærÂçVÆÀ¢æ‡G6ö6×–vãó¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢&VÖVG“ó¢7G&–ærÂçVÆÀ¢&W÷'EöFFSó¢7G&–ærÂçVÆÀ¢&W÷'E÷&V6V—fVEöFFSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7VÖÖ'“ó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢f–ãó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷&V6ÆÇ5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷&V6ÆÇ5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷&V6ÆÇ5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆU÷&V6ÆÇ5÷fV†–6ÆU÷6†÷öf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B"Â'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B"Â'6†÷ö–B%Ð¢ÒÀ¢Ð¢Ð¢fV†–6ÆW3¢°¢&÷s¢°¢76WE÷G—S¢7G&–ærÂçVÆÀ¢&öG•÷G—S¢7G&–ærÂçVÆÀ¢6öÆ÷#¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢G&—fWG&–ã¢7G&–ærÂçVÆÀ¢Væv–æS¢7G&–ærÂçVÆÀ¢Væv–æUöfÖ–Ç“¢7G&–ærÂçVÆÀ¢Væv–æUö†÷W'3¢çVÖ&W"ÂçVÆÀ¢Væv–æU÷G—S¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–C¢7G&–ærÂçVÆÀ¢gVVÅ÷G—S¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–×÷'Eö6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3¢7G&–ærÂçVÆÀ¢–å÷6W'f–6UöFFS¢7G&–ærÂçVÆÀ¢Æ7E÷6W'f–6UöFFS¢7G&–ærÂçVÆÀ¢Æ–6Vç6U÷ÆFS¢7G&–ærÂçVÆÀ¢Ö¶S¢7G&–ærÂçVÆÀ¢Ö–ÆVvS¢7G&–ærÂçVÆÀ¢ÖöFVÃ¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢öFöÖWFW%÷Væ—C¢7G&–ærÂçVÆÀ¢W&6†6UöFFS¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–C¢7G&–ærÂçVÆÀ¢7FFU÷&÷f–æ6S¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–ærÂçVÆÀ¢7V&ÖöFVÃ¢7G&–ærÂçVÆÀ¢Fw3¢7G&–ærÂçVÆÀ¢G&ç6Ö—76–öã¢7G&–ærÂçVÆÀ¢G&ç6Ö—76–öå÷G—S¢7G&–ærÂçVÆÀ¢Væ—EöçVÖ&W#¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢f–ã¢7G&–ærÂçVÆÀ¢–V#¢çVÖ&W"ÂçVÆÀ¢Ð¢–ç6W'C¢°¢76WE÷G—Só¢7G&–ærÂçVÆÀ¢&öG•÷G—Só¢7G&–ærÂçVÆÀ¢6öÆ÷#ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢G&—fWG&–ãó¢7G&–ærÂçVÆÀ¢Væv–æSó¢7G&–ærÂçVÆÀ¢Væv–æUöfÖ–Ç“ó¢7G&–ærÂçVÆÀ¢Væv–æUö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢Væv–æU÷G—Só¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢gVVÅ÷G—Só¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–×÷'Eö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3ó¢7G&–ærÂçVÆÀ¢–å÷6W'f–6UöFFSó¢7G&–ærÂçVÆÀ¢Æ7E÷6W'f–6UöFFSó¢7G&–ærÂçVÆÀ¢Æ–6Vç6U÷ÆFSó¢7G&–ærÂçVÆÀ¢Ö¶Só¢7G&–ærÂçVÆÀ¢Ö–ÆVvSó¢7G&–ærÂçVÆÀ¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢öFöÖWFW%÷Væ—Có¢7G&–ærÂçVÆÀ¢W&6†6UöFFSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢7FFU÷&÷f–æ6Só¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–ærÂçVÆÀ¢7V&ÖöFVÃó¢7G&–ærÂçVÆÀ¢Fw3ó¢7G&–ærÂçVÆÀ¢G&ç6Ö—76–öãó¢7G&–ærÂçVÆÀ¢G&ç6Ö—76–öå÷G—Só¢7G&–ærÂçVÆÀ¢Væ—EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢f–ãó¢7G&–ærÂçVÆÀ¢–V#ó¢çVÖ&W"ÂçVÆÀ¢Ð¢WFFS¢°¢76WE÷G—Só¢7G&–ærÂçVÆÀ¢&öG•÷G—Só¢7G&–ærÂçVÆÀ¢6öÆ÷#ó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢G&—fWG&–ãó¢7G&–ærÂçVÆÀ¢Væv–æSó¢7G&–ærÂçVÆÀ¢Væv–æUöfÖ–Ç“ó¢7G&–ærÂçVÆÀ¢Væv–æUö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢Væv–æU÷G—Só¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢gVVÅ÷G—Só¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–×÷'Eö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3ó¢7G&–ærÂçVÆÀ¢–å÷6W'f–6UöFFSó¢7G&–ærÂçVÆÀ¢Æ7E÷6W'f–6UöFFSó¢7G&–ærÂçVÆÀ¢Æ–6Vç6U÷ÆFSó¢7G&–ærÂçVÆÀ¢Ö¶Só¢7G&–ærÂçVÆÀ¢Ö–ÆVvSó¢7G&–ærÂçVÆÀ¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢öFöÖWFW%÷Væ—Có¢7G&–ærÂçVÆÀ¢W&6†6UöFFSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢7FFU÷&÷f–æ6Só¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–ærÂçVÆÀ¢7V&ÖöFVÃó¢7G&–ærÂçVÆÀ¢Fw3ó¢7G&–ærÂçVÆÀ¢G&ç6Ö—76–öãó¢7G&–ærÂçVÆÀ¢G&ç6Ö—76–öå÷G—Só¢7G&–ærÂçVÆÀ¢Væ—EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢f–ãó¢7G&–ærÂçVÆÀ¢–V#ó¢çVÖ&W"ÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆW5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fV†–6ÆW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢fVæF÷%÷'EöçVÖ&W'3¢°¢&÷s¢°¢–C¢7G&–æp¢'Eö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢7WÆ–W%ö–C¢7G&–ærÂçVÆÀ¢fVæF÷%÷6·S¢7G&–æp¢Ð¢–ç6W'C¢°¢–Có¢7G&–æp¢'Eö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢fVæF÷%÷6·S¢7G&–æp¢Ð¢WFFS¢°¢–Có¢7G&–æp¢'Eö–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢fVæF÷%÷6·Só¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'fVæF÷%÷'EöçVÖ&W'5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fVæF÷%÷'EöçVÖ&W'5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'fVæF÷%÷'EöçVÖ&W'5÷7WÆ–W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'7WÆ–W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'7WÆ–W'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢f–FV÷3¢°¢&÷s¢°¢•÷66÷&S¢çVÖ&W"ÂçVÆÀ¢6F–öã¢7G&–ærÂçVÆÀ¢6öçFVçE÷G—S¢7G&–æp¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢7F¢7G&–ærÂçVÆÀ¢GW&F–öå÷6V6öæG3¢çVÖ&W"ÂçVÆÀ¢vVæW&F–öåöæ÷FW3¢7G&–ærÂçVÆÀ¢†öö³¢7G&–ærÂçVÆÀ¢‡VÖå÷&F–æs¢çVÖ&W"ÂçVÆÀ¢–C¢7G&–æp¢ÆFf÷&Õ÷F&vWG3¢7G&–æuµÐ¢V&Æ—6†VEöC¢7G&–ærÂçVÆÀ¢&VæFW%÷W&Ã¢7G&–ærÂçVÆÀ¢67&—E÷FW‡C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6ÇVs¢7G&–ærÂçVÆÀ¢6÷W&6Uö76WEö–C¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢FV×ÆFUö–C¢7G&–ærÂçVÆÀ¢F‡VÖ&æ–Å÷W&Ã¢7G&–ærÂçVÆÀ¢F—FÆS¢7G&–æp¢WFFVEöC¢7G&–æp¢fö–6V÷fW%÷FW‡C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢•÷66÷&Só¢çVÖ&W"ÂçVÆÀ¢6F–öãó¢7G&–ærÂçVÆÀ¢6öçFVçE÷G—S¢7G&–æp¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7Fó¢7G&–ærÂçVÆÀ¢GW&F–öå÷6V6öæG3ó¢çVÖ&W"ÂçVÆÀ¢vVæW&F–öåöæ÷FW3ó¢7G&–ærÂçVÆÀ¢†öö³ó¢7G&–ærÂçVÆÀ¢‡VÖå÷&F–æsó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢ÆFf÷&Õ÷F&vWG3ó¢7G&–æuµÐ¢V&Æ—6†VEöCó¢7G&–ærÂçVÆÀ¢&VæFW%÷W&Ãó¢7G&–ærÂçVÆÀ¢67&—E÷FW‡Có¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6ÇVsó¢7G&–ærÂçVÆÀ¢6÷W&6Uö76WEö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢F‡VÖ&æ–Å÷W&Ãó¢7G&–ærÂçVÆÀ¢F—FÆS¢7G&–æp¢WFFVEöCó¢7G&–æp¢fö–6V÷fW%÷FW‡Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢•÷66÷&Só¢çVÖ&W"ÂçVÆÀ¢6F–öãó¢7G&–ærÂçVÆÀ¢6öçFVçE÷G—Só¢7G&–æp¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7Fó¢7G&–ærÂçVÆÀ¢GW&F–öå÷6V6öæG3ó¢çVÖ&W"ÂçVÆÀ¢vVæW&F–öåöæ÷FW3ó¢7G&–ærÂçVÆÀ¢†öö³ó¢7G&–ærÂçVÆÀ¢‡VÖå÷&F–æsó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢ÆFf÷&Õ÷F&vWG3ó¢7G&–æuµÐ¢V&Æ—6†VEöCó¢7G&–ærÂçVÆÀ¢&VæFW%÷W&Ãó¢7G&–ærÂçVÆÀ¢67&—E÷FW‡Có¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6ÇVsó¢7G&–ærÂçVÆÀ¢6÷W&6Uö76WEö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢F‡VÖ&æ–Å÷W&Ãó¢7G&–ærÂçVÆÀ¢F—FÆSó¢7G&–æp¢WFFVEöCó¢7G&–æp¢fö–6V÷fW%÷FW‡Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'f–FV÷5ö7&VFVEö'•öf¶W’ ¢6öÇVÖç3¢²&7&VFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'f–FV÷5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'f–FV÷5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'f–FV÷5÷6÷W&6Uö76WEö–Eöf¶W’ ¢6öÇVÖç3¢²'6÷W&6Uö76WEö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&76WG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'f–FV÷5÷FV×ÆFUö–Eöf¶W’ ¢6öÇVÖç3¢²'FV×ÆFUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&6öçFVçE÷FV×ÆFW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢f–åöFV6öFW3¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢FV6öFVEöFF¢§6öâÂçVÆÀ¢Væv–æS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢Ö¶S¢7G&–ærÂçVÆÀ¢ÖöFVÃ¢7G&–ærÂçVÆÀ¢G&–Ó¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢f–ã¢7G&–æp¢–V#¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FV6öFVEöFFó¢§6öâÂçVÆÀ¢Væv–æSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Ö¶Só¢7G&–ærÂçVÆÀ¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢G&–Óó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢f–ã¢7G&–æp¢–V#ó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FV6öFVEöFFó¢§6öâÂçVÆÀ¢Væv–æSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢Ö¶Só¢7G&–ærÂçVÆÀ¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢G&–Óó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢f–ãó¢7G&–æp¢–V#ó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢v'&çF–W3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢W‡—&W5öC¢7G&–æp¢–C¢7G&–æp¢–ç7FÆÆVEöC¢7G&–æp¢æ÷FW3¢7G&–ærÂçVÆÀ¢'Eö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢7WÆ–W%ö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢v'&çG•öÖöçF‡3¢çVÖ&W ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢W‡—&W5öC¢7G&–æp¢–C¢7G&–æp¢–ç7FÆÆVEöC¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢'Eö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v'&çG•öÖöçF‡3ó¢çVÖ&W ¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢W‡—&W5öCó¢7G&–æp¢–Có¢7G&–æp¢–ç7FÆÆVEöCó¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢'Eö–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢7WÆ–W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v'&çG•öÖöçF‡3ó¢çVÖ&W ¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷7WÆ–W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'7WÆ–W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'7WÆ–W'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v'&çF–W5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v'&çG•ö6Æ–×3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢æ÷FW3¢7G&–ærÂçVÆÀ¢÷VæVEöC¢7G&–æp¢7FGW3¢7G&–æp¢7WÆ–W%÷&Ö¢7G&–ærÂçVÆÀ¢v'&çG•ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢–C¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢÷VæVEöCó¢7G&–æp¢7FGW3¢7G&–æp¢7WÆ–W%÷&Öó¢7G&–ærÂçVÆÀ¢v'&çG•ö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢÷VæVEöCó¢7G&–æp¢7FGW3ó¢7G&–æp¢7WÆ–W%÷&Öó¢7G&–ærÂçVÆÀ¢v'&çG•ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v'&çG•ö6Æ–×5÷v'&çG•ö–Eöf¶W’ ¢6öÇVÖç3¢²'v'&çG•ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v'&çF–W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v–FvWEö–ç7Fæ6W3¢°¢&÷s¢°¢6öæf–s¢§6öà¢7&VFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢W6W%ö–C¢7G&–æp¢v–FvWE÷6ÇVs¢7G&–æp¢Ð¢–ç6W'C¢°¢6öæf–só¢§6öà¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢W6W%ö–C¢7G&–æp¢v–FvWE÷6ÇVs¢7G&–æp¢Ð¢WFFS¢°¢6öæf–só¢§6öà¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢W6W%ö–Có¢7G&–æp¢v–FvWE÷6ÇVsó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v–FvWEö–ç7Fæ6W5÷v–FvWE÷6ÇVuöf¶W’ ¢6öÇVÖç3¢²'v–FvWE÷6ÇVr%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v–FvWG2 ¢&VfW&Væ6VD6öÇVÖç3¢²'6ÇVr%Ð¢ÒÀ¢Ð¢Ð¢v–FvWG3¢°¢&÷s¢°¢ÆÆ÷vVE÷6—¦W3¢7G&–æuµÐ¢FVfVÇE÷&÷WFS¢7G&–æp¢FVfVÇE÷6—¦S¢7G&–æp¢–C¢7G&–æp¢æÖS¢7G&–æp¢6ÇVs¢7G&–æp¢Ð¢–ç6W'C¢°¢ÆÆ÷vVE÷6—¦W3ó¢7G&–æuµÐ¢FVfVÇE÷&÷WFS¢7G&–æp¢FVfVÇE÷6—¦Só¢7G&–æp¢–Có¢7G&–æp¢æÖS¢7G&–æp¢6ÇVs¢7G&–æp¢Ð¢WFFS¢°¢ÆÆ÷vVE÷6—¦W3ó¢7G&–æuµÐ¢FVfVÇE÷&÷WFSó¢7G&–æp¢FVfVÇE÷6—¦Só¢7G&–æp¢–Có¢7G&–æp¢æÖSó¢7G&–æp¢6ÇVsó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢v÷&µö÷&FW%ö&÷fÇ3¢°¢&÷s¢°¢&÷fVEöC¢7G&–ærÂçVÆÀ¢&÷fVEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢ÖWF†öC¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢&÷fVEöCó¢7G&–ærÂçVÆÀ¢&÷fVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÖWF†öCó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢WFFS¢°¢&÷fVEöCó¢7G&–ærÂçVÆÀ¢&÷fVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÖWF†öCó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö&÷fÇ5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö&÷fÇ5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö&÷fÇ5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö&÷fÇ5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö&÷fÇ5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç3¢°¢&÷s¢°¢6Æ÷6VEöC¢7G&–ærÂçVÆÀ¢6Æ÷6VEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–çfö–6U÷fW'6–öåö–C¢7G&–ærÂçVÆÀ¢ÖWFFF¢§6öà¢÷VæVEöC¢7G&–æp¢÷VæVEö'“¢7G&–ærÂçVÆÀ¢÷W&F–öåö¶W“¢7G&–æp¢&V6öã¢7G&–æp¢66÷S¢7G&–æp¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6Æ÷6VEöCó¢7G&–ærÂçVÆÀ¢6Æ÷6VEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çfö–6U÷fW'6–öåö–Có¢7G&–ærÂçVÆÀ¢ÖWFFFó¢§6öà¢÷VæVEöCó¢7G&–æp¢÷VæVEö'“ó¢7G&–ærÂçVÆÀ¢÷W&F–öåö¶W“¢7G&–æp¢&V6öã¢7G&–æp¢66÷Só¢7G&–æp¢6†÷ö–C¢7G&–æp¢7FGW3ó¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢WFFS¢°¢6Æ÷6VEöCó¢7G&–ærÂçVÆÀ¢6Æ÷6VEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–çfö–6U÷fW'6–öåö–Có¢7G&–ærÂçVÆÀ¢ÖWFFFó¢§6öà¢÷VæVEöCó¢7G&–æp¢÷VæVEö'“ó¢7G&–ærÂçVÆÀ¢÷W&F–öåö¶W“ó¢7G&–æp¢&V6öãó¢7G&–æp¢66÷Só¢7G&–æp¢6†÷ö–Có¢7G&–æp¢7FGW3ó¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5ö–çfö–6U÷fW'6–öåö–Eöf¶W’ ¢6öÇVÖç3¢²&–çfö–6U÷fW'6–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&–çfö–6U÷fW'6–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%ö–çFVÆÆ–vVæ6S¢°¢&÷s¢°¢6W6S¢7G&–ærÂçVÆÀ¢6ÇW7FW%ö¶W“¢7G&–ærÂçVÆÀ¢6ö×Æ–çC¢7G&–ærÂçVÆÀ¢6öæf–FVæ6U÷66÷&S¢çVÖ&W"ÂçVÆÀ¢6÷'&V7F–öã¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢VÖ&VFF–æs¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢¦ö%ö6FVv÷'“¢7G&–ærÂçVÆÀ¢Æ&÷%÷F–ÖS¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷7FGW3¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷FW‡C¢7G&–ærÂçVÆÀ¢'G3¢§6öà¢6†÷ö–C¢7G&–æp¢6÷W&6S¢7G&–æp¢7–×FöÓ¢7G&–ærÂçVÆÀ¢Fw3¢7G&–æuµÐ¢FV×ÆFUö–C¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ¶S¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖöFVÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷–V#¢çVÖ&W"ÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6W6Só¢7G&–ærÂçVÆÀ¢6ÇW7FW%ö¶W“ó¢7G&–ærÂçVÆÀ¢6ö×Æ–çCó¢7G&–ærÂçVÆÀ¢6öæf–FVæ6U÷66÷&Só¢çVÖ&W"ÂçVÆÀ¢6÷'&V7F–öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢VÖ&VFF–æsó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢¦ö%ö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢Æ&÷%÷F–ÖSó¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷7FGW3ó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷FW‡Có¢7G&–ærÂçVÆÀ¢'G3ó¢§6öà¢6†÷ö–C¢7G&–æp¢6÷W&6Só¢7G&–æp¢7–×FöÓó¢7G&–ærÂçVÆÀ¢Fw3ó¢7G&–æuµÐ¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ¶Só¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖöFVÃó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷–V#ó¢çVÖ&W"ÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢WFFS¢°¢6W6Só¢7G&–ærÂçVÆÀ¢6ÇW7FW%ö¶W“ó¢7G&–ærÂçVÆÀ¢6ö×Æ–çCó¢7G&–ærÂçVÆÀ¢6öæf–FVæ6U÷66÷&Só¢çVÖ&W"ÂçVÆÀ¢6÷'&V7F–öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢VÖ&VFF–æsó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢¦ö%ö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢Æ&÷%÷F–ÖSó¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷7FGW3ó¢7G&–ærÂçVÆÀ¢æ÷&ÖÆ—¦VE÷FW‡Có¢7G&–ærÂçVÆÀ¢'G3ó¢§6öà¢6†÷ö–Có¢7G&–æp¢6÷W&6Só¢7G&–æp¢7–×FöÓó¢7G&–ærÂçVÆÀ¢Fw3ó¢7G&–æuµÐ¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ¶Só¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖöFVÃó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷–V#ó¢çVÖ&W"ÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6Uö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷FV×ÆFUö–Eöf¶W’ ¢6öÇVÖç3¢²'FV×ÆFUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&ÆV&æVEö¦ö%÷FV×ÆFW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çFVÆÆ–vVæ6U÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢—77VW3¢§6öà¢ÖöFVÃ¢7G&–ærÂçVÆÀ¢ö³¢&ööÆVà¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—77VW3ó¢§6öà¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢ö³ó¢&ööÆVà¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—77VW3ó¢§6öà¢ÖöFVÃó¢7G&–ærÂçVÆÀ¢ö³ó¢&ööÆVà¢6†÷ö–Có¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%ö–çfö–6U÷&Wf–Ww5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æUö“¢°¢&÷s¢°¢6öæf–FVæ6S¢çVÖ&W ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢¦ö%÷66÷S¢7G&–ærÂçVÆÀ¢&–Ö'•ö6FVv÷'“¢7G&–ærÂçVÆÀ¢6V6öæF'•ö6FVv÷&–W3¢7G&–æuµÐ¢6†÷ö–C¢7G&–æp¢6–væÇ3¢7G&–æuµÐ¢7VÖÖ'“¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6öæf–FVæ6Só¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢¦ö%÷66÷Só¢7G&–ærÂçVÆÀ¢&–Ö'•ö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢6V6öæF'•ö6FVv÷&–W3ó¢7G&–æuµÐ¢6†÷ö–C¢7G&–æp¢6–væÇ3ó¢7G&–æuµÐ¢7VÖÖ'“ó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢WFFS¢°¢6öæf–FVæ6Só¢çVÖ&W ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢¦ö%÷66÷Só¢7G&–ærÂçVÆÀ¢&–Ö'•ö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢6V6öæF'•ö6FVv÷&–W3ó¢7G&–æuµÐ¢6†÷ö–Có¢7G&–æp¢6–væÇ3ó¢7G&–æuµÐ¢7VÖÖ'“ó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷v÷&µö÷&FW%öÆ–æUöf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö•÷v÷&µö÷&FW%öÆ–æUöf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢GF5ö6öFS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢ÖW76vW3¢§6öà¢6†÷ö–C¢7G&–æp¢7VÖÖ'“¢§6öâÂçVÆÀ¢WFFVEöC¢7G&–æp¢WFFVEö'“¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢GF5ö6öFSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÖW76vW3ó¢§6öà¢6†÷ö–C¢7G&–æp¢7VÖÖ'“ó¢§6öâÂçVÆÀ¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢GF5ö6öFSó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢ÖW76vW3ó¢§6öà¢6†÷ö–Có¢7G&–æp¢7VÖÖ'“ó¢§6öâÂçVÆÀ¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöGF5÷F‡&VG5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢G'VP¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G3¢°¢&÷s¢°¢7GVÅö¦ö%÷6V6öæG3¢çVÖ&W ¢F§W7FVEö'“¢7G&–ærÂçVÆÀ¢F§W7FÖVçE÷&V6öã¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VF—Eö†÷W'3¢çVÖ&W ¢7&VF—E÷6÷W&6S¢7G&–æp¢7&VF—FVEöC¢7G&–æp¢–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢FV6†æ–6–åö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7GVÅö¦ö%÷6V6öæG3ó¢çVÖ&W ¢F§W7FVEö'“ó¢7G&–ærÂçVÆÀ¢F§W7FÖVçE÷&V6öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VF—Eö†÷W'3¢çVÖ&W ¢7&VF—E÷6÷W&6Só¢7G&–æp¢7&VF—FVEöCó¢7G&–æp¢–Có¢7G&–æp¢6†÷ö–C¢7G&–æp¢FV6†æ–6–åö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢WFFS¢°¢7GVÅö¦ö%÷6V6öæG3ó¢çVÖ&W ¢F§W7FVEö'“ó¢7G&–ærÂçVÆÀ¢F§W7FÖVçE÷&V6öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VF—Eö†÷W'3ó¢çVÖ&W ¢7&VF—E÷6÷W&6Só¢7G&–æp¢7&VF—FVEöCó¢7G&–æp¢–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢FV6†æ–6–åö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5öF§W7FVEö'•öf¶W’ ¢6öÇVÖç3¢²&F§W7FVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷FV6†æ–6–åö–Eöf¶W’ ¢6öÇVÖç3¢²'FV6†æ–6–åö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æUö†—7F÷'“¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢Æ–æUö–C¢7G&–ærÂçVÆÀ¢&V6öã¢7G&–æp¢6æ6†÷C¢§6öà¢7FGW3¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢Æ–æUö–Có¢7G&–ærÂçVÆÀ¢&V6öãó¢7G&–æp¢6æ6†÷C¢§6öà¢7FGW3ó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢Æ–æUö–Có¢7G&–ærÂçVÆÀ¢&V6öãó¢7G&–æp¢6æ6†÷Có¢§6öà¢7FGW3ó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö†—7F÷'•öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²&Æ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö†—7F÷'•öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²&Æ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö†—7F÷'•÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö†—7F÷'•÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö†—7F÷'•÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö†—7F÷'•÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUö†—7F÷'•÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçEö6÷'&V7F–öç3¢°¢&÷s¢°¢6÷'&V7FVEöC¢7G&–æp¢6÷'&V7FVEö'“¢7G&–æp¢6÷'&V7FVE÷fÇVW3¢§6öà¢6÷'&V7F–öå÷G—S¢7G&–æp¢–C¢7G&–æp¢÷&–v–æÅ÷fÇVW3¢§6öà¢&V6öã¢7G&–æp¢6VvÖVçEö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢6÷'&V7FVEöCó¢7G&–æp¢6÷'&V7FVEö'“¢7G&–æp¢6÷'&V7FVE÷fÇVW3ó¢§6öà¢6÷'&V7F–öå÷G—S¢7G&–æp¢–Có¢7G&–æp¢÷&–v–æÅ÷fÇVW3ó¢§6öà¢&V6öã¢7G&–æp¢6VvÖVçEö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢Ð¢WFFS¢°¢6÷'&V7FVEöCó¢7G&–æp¢6÷'&V7FVEö'“ó¢7G&–æp¢6÷'&V7FVE÷fÇVW3ó¢§6öà¢6÷'&V7F–öå÷G—Só¢7G&–æp¢–Có¢7G&–æp¢÷&–v–æÅ÷fÇVW3ó¢§6öà¢&V6öãó¢7G&–æp¢6VvÖVçEö–Có¢7G&–æp¢6†÷ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçEö6÷'&V7F–öç5ö6÷'&V7FVEö'•öf¶W’ ¢6öÇVÖç3¢²&6÷'&V7FVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçEö6÷'&V7F–öç5÷6VvÖVçEö–Eöf¶W’ ¢6öÇVÖç3¢²'6VvÖVçEö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçEö6÷'&V7F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçEö6÷'&V7F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢VæFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢W6U÷&V6öã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6S¢7G&–æp¢7F'FVEöC¢7G&–æp¢FV6†æ–6–åö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢VæFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢W6U÷&V6öãó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Só¢7G&–æp¢7F'FVEöC¢7G&–æp¢FV6†æ–6–åö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢VæFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢W6U÷&V6öãó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6Só¢7G&–æp¢7F'FVEöCó¢7G&–æp¢FV6†æ–6–åö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5ö7&VFVEö'•öf¶W’ ¢6öÇVÖç3¢²&7&VFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷FV6†æ–6–åö–Eöf¶W’ ¢6öÇVÖç3¢²'FV6†æ–6–åö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æU÷FV6†æ–6–ç3¢°¢&÷s¢°¢76–væVEöC¢7G&–æp¢76–væVEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢FV6†æ–6–åö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢76–væVEöCó¢7G&–æp¢76–væVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢FV6†æ–6–åö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢WFFS¢°¢76–væVEöCó¢7G&–æp¢76–væVEö'“ó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢FV6†æ–6–åö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æU÷FV6†æ–6–ç5ö76–væVEö'•öf¶W’ ¢6öÇVÖç3¢²&76–væVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æU÷FV6†æ–6–ç5÷FV6†æ–6–åö–Eöf¶W’ ¢6öÇVÖç3¢²'FV6†æ–6–åö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æU÷FV6†æ–6–ç5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æU÷FV6†æ–6–ç5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÆ–æW3¢°¢&÷s¢°¢&÷fÅöC¢7G&–ærÂçVÆÀ¢&÷fÅö'“¢7G&–ærÂçVÆÀ¢&÷fÅöæ÷FS¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFS¢7G&–ærÂçVÆÀ¢76–væVE÷FV6…ö–C¢7G&–ærÂçVÆÀ¢76–væVE÷Fó¢7G&–ærÂçVÆÀ¢6W6S¢7G&–ærÂçVÆÀ¢6ö×Æ–çC¢7G&–ærÂçVÆÀ¢6÷'&V7F–öã¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢FW67&—F–öã¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–C¢7G&–ærÂçVÆÀ¢†öÆE÷&V6öã¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–×÷'Eö6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷6W76–öåö–C¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷FV×ÆFUö–C¢7G&–ærÂçVÆÀ¢–çF¶Uö§6öã¢§6öâÂçVÆÀ¢–çF¶U÷7FGW3¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEöC¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEö'“¢7G&–ærÂçVÆÀ¢¦ö%÷&–÷&—G“¢7G&–ærÂçVÆÀ¢¦ö%÷G—S¢7G&–ærÂçVÆÀ¢Æ&÷%÷F–ÖS¢çVÖ&W"ÂçVÆÀ¢Æ–æUöæó¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷7FGW3¢7G&–ærÂçVÆÀ¢Æ–æU÷G—S¢7G&–æp¢ÖVçUö—FVÕö–C¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢öFöÖWFW%ö¶Ó¢çVÖ&W"ÂçVÆÀ¢öåö†öÆE÷6–æ6S¢7G&–ærÂçVÆÀ¢'G3¢7G&–ærÂçVÆÀ¢'G5öæVVFVC¢§6öâÂçVÆÀ¢'G5÷&V6V—fVC¢§6öâÂçVÆÀ¢'G5÷&WV—&VC¢§6öâÂçVÆÀ¢&–6UöW7F–ÖFS¢çVÖ&W"ÂçVÆÀ¢&–÷&—G“¢çVÖ&W"ÂçVÆÀ¢Væ6†&ÆS¢&ööÆVâÂçVÆÀ¢Væ6†VEö–åöC¢7G&–ærÂçVÆÀ¢Væ6†VEö÷WEöC¢7G&–ærÂçVÆÀ¢V÷FVEöC¢7G&–ærÂçVÆÀ¢6W'f–6Uö6öFS¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7EöÆ–æUö–C¢7G&–ærÂçVÆÀ¢6÷W&6Uö–ç7V7F–öåö–C¢7G&–ærÂçVÆÀ¢6÷W&6Uö–ç7V7F–öåö—FVÕö¶W“¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–C¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢FV6†æ–6–åöæ÷FW3¢7G&–ærÂçVÆÀ¢FV×ÆFUö–C¢7G&–ærÂçVÆÀ¢FööÇ3¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢W&vVæ7“¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢fö–FVEöC¢7G&–ærÂçVÆÀ¢fö–FVEö'“¢7G&–ærÂçVÆÀ¢fö–FVEöæ÷FS¢7G&–ærÂçVÆÀ¢fö–FVE÷&V6öã¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢&÷fÅöCó¢7G&–ærÂçVÆÀ¢&÷fÅö'“ó¢7G&–ærÂçVÆÀ¢&÷fÅöæ÷FSó¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFSó¢7G&–ærÂçVÆÀ¢76–væVE÷FV6…ö–Có¢7G&–ærÂçVÆÀ¢76–væVE÷Fóó¢7G&–ærÂçVÆÀ¢6W6Só¢7G&–ærÂçVÆÀ¢6ö×Æ–çCó¢7G&–ærÂçVÆÀ¢6÷'&V7F–öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢†öÆE÷&V6öãó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–×÷'Eö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3ó¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷6W76–öåö–Có¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢–çF¶Uö§6öãó¢§6öâÂçVÆÀ¢–çF¶U÷7FGW3ó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEöCó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEö'“ó¢7G&–ærÂçVÆÀ¢¦ö%÷&–÷&—G“ó¢7G&–ærÂçVÆÀ¢¦ö%÷G—Só¢7G&–ærÂçVÆÀ¢Æ&÷%÷F–ÖSó¢çVÖ&W"ÂçVÆÀ¢Æ–æUöæóó¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷7FGW3ó¢7G&–ærÂçVÆÀ¢Æ–æU÷G—Só¢7G&–æp¢ÖVçUö—FVÕö–Có¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢öFöÖWFW%ö¶Óó¢çVÖ&W"ÂçVÆÀ¢öåö†öÆE÷6–æ6Só¢7G&–ærÂçVÆÀ¢'G3ó¢7G&–ærÂçVÆÀ¢'G5öæVVFVCó¢§6öâÂçVÆÀ¢'G5÷&V6V—fVCó¢§6öâÂçVÆÀ¢'G5÷&WV—&VCó¢§6öâÂçVÆÀ¢&–6UöW7F–ÖFSó¢çVÖ&W"ÂçVÆÀ¢&–÷&—G“ó¢çVÖ&W"ÂçVÆÀ¢Væ6†&ÆSó¢&ööÆVâÂçVÆÀ¢Væ6†VEö–åöCó¢7G&–ærÂçVÆÀ¢Væ6†VEö÷WEöCó¢7G&–ærÂçVÆÀ¢V÷FVEöCó¢7G&–ærÂçVÆÀ¢6W'f–6Uö6öFSó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7EöÆ–æUö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–ç7V7F–öåö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–ç7V7F–öåö—FVÕö¶W“ó¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢FV6†æ–6–åöæ÷FW3ó¢7G&–ærÂçVÆÀ¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢FööÇ3ó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢W&vVæ7“ó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢fö–FVEöCó¢7G&–ærÂçVÆÀ¢fö–FVEö'“ó¢7G&–ærÂçVÆÀ¢fö–FVEöæ÷FSó¢7G&–ærÂçVÆÀ¢fö–FVE÷&V6öãó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢WFFS¢°¢&÷fÅöCó¢7G&–ærÂçVÆÀ¢&÷fÅö'“ó¢7G&–ærÂçVÆÀ¢&÷fÅöæ÷FSó¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFSó¢7G&–ærÂçVÆÀ¢76–væVE÷FV6…ö–Có¢7G&–ærÂçVÆÀ¢76–væVE÷Fóó¢7G&–ærÂçVÆÀ¢6W6Só¢7G&–ærÂçVÆÀ¢6ö×Æ–çCó¢7G&–ærÂçVÆÀ¢6÷'&V7F–öãó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FW67&—F–öãó¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢†öÆE÷&V6öãó¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–×÷'Eö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3ó¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷6W76–öåö–Có¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢–çF¶Uö§6öãó¢§6öâÂçVÆÀ¢–çF¶U÷7FGW3ó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEöCó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEö'“ó¢7G&–ærÂçVÆÀ¢¦ö%÷&–÷&—G“ó¢7G&–ærÂçVÆÀ¢¦ö%÷G—Só¢7G&–ærÂçVÆÀ¢Æ&÷%÷F–ÖSó¢çVÖ&W"ÂçVÆÀ¢Æ–æUöæóó¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷7FGW3ó¢7G&–ærÂçVÆÀ¢Æ–æU÷G—Só¢7G&–æp¢ÖVçUö—FVÕö–Có¢7G&–ærÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢öFöÖWFW%ö¶Óó¢çVÖ&W"ÂçVÆÀ¢öåö†öÆE÷6–æ6Só¢7G&–ærÂçVÆÀ¢'G3ó¢7G&–ærÂçVÆÀ¢'G5öæVVFVCó¢§6öâÂçVÆÀ¢'G5÷&V6V—fVCó¢§6öâÂçVÆÀ¢'G5÷&WV—&VCó¢§6öâÂçVÆÀ¢&–6UöW7F–ÖFSó¢çVÖ&W"ÂçVÆÀ¢&–÷&—G“ó¢çVÖ&W"ÂçVÆÀ¢Væ6†&ÆSó¢&ööÆVâÂçVÆÀ¢Væ6†VEö–åöCó¢7G&–ærÂçVÆÀ¢Væ6†VEö÷WEöCó¢7G&–ærÂçVÆÀ¢V÷FVEöCó¢7G&–ærÂçVÆÀ¢6W'f–6Uö6öFSó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7EöÆ–æUö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–ç7V7F–öåö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–ç7V7F–öåö—FVÕö¶W“ó¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢FV6†æ–6–åöæ÷FW3ó¢7G&–ærÂçVÆÀ¢FV×ÆFUö–Có¢7G&–ærÂçVÆÀ¢FööÇ3ó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢W&vVæ7“ó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢fö–FVEöCó¢7G&–ærÂçVÆÀ¢fö–FVEö'“ó¢7G&–ærÂçVÆÀ¢fö–FVEöæ÷FSó¢7G&–ærÂçVÆÀ¢fö–FVE÷&V6öãó¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5ö76–væVE÷FV6…ö–Eöf¶W’ ¢6öÇVÖç3¢²&76–væVE÷FV6…ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5ö–ç7V7F–öå÷6W76–öåöf² ¢6öÇVÖç3¢²&–ç7V7F–öå÷6W76–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&–ç7V7F–öå÷6W76–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5ö–ç7V7F–öå÷6W76–öåö–Eöf¶W’ ¢6öÇVÖç3¢²&–ç7V7F–öå÷6W76–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&–ç7V7F–öå÷6W76–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7EöÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7EöÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&fÆVWE÷6W'f–6U÷&WVW7EöÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÖVF–¢°¢&÷s¢°¢6Æ–VçEö×WFF–öåö–C¢7G&–ærÂçVÆÀ¢6öçFVçE÷G—S¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢f–ÆUöæÖS¢7G&–ærÂçVÆÀ¢f–ÆU÷6—¦S¢çVÖ&W"ÂçVÆÀ¢–C¢7G&–æp¢¶–æC¢7G&–ærÂçVÆÀ¢æ÷FS¢7G&–ærÂçVÆÀ¢V÷FUöÆ–æUö–C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6S¢7G&–ærÂçVÆÀ¢7F÷&vUö'V6¶WC¢7G&–ærÂçVÆÀ¢7F÷&vU÷Fƒ¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢W&Ã¢7G&–æp¢W6W%ö–C¢7G&–ærÂçVÆÀ¢f—6–&–Æ—G“¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢6Æ–VçEö×WFF–öåö–Có¢7G&–ærÂçVÆÀ¢6öçFVçE÷G—Só¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢f–ÆUöæÖSó¢7G&–ærÂçVÆÀ¢f–ÆU÷6—¦Só¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢¶–æCó¢7G&–ærÂçVÆÀ¢æ÷FSó¢7G&–ærÂçVÆÀ¢V÷FUöÆ–æUö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6Só¢7G&–ærÂçVÆÀ¢7F÷&vUö'V6¶WCó¢7G&–ærÂçVÆÀ¢7F÷&vU÷Fƒó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢W&Ã¢7G&–æp¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢f—6–&–Æ—G“ó¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢6Æ–VçEö×WFF–öåö–Có¢7G&–ærÂçVÆÀ¢6öçFVçE÷G—Só¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢f–ÆUöæÖSó¢7G&–ærÂçVÆÀ¢f–ÆU÷6—¦Só¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–æp¢¶–æCó¢7G&–ærÂçVÆÀ¢æ÷FSó¢7G&–ærÂçVÆÀ¢V÷FUöÆ–æUö–Có¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6Só¢7G&–ærÂçVÆÀ¢7F÷&vUö'V6¶WCó¢7G&–ærÂçVÆÀ¢7F÷&vU÷Fƒó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢W&Ãó¢7G&–æp¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢f—6–&–Æ—G“ó¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷V÷FUöÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'V÷FUöÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%÷V÷FUöÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%öÖVF–öææ÷FF–öç3¢°¢&÷s¢°¢6Æ–VçEö×WFF–öåö–C¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–æp¢–C¢7G&–æp¢ÖVF–ö–C¢7G&–æp¢÷fW&Æ“¢§6öà¢6†÷ö–C¢7G&–æp¢fW'6–öã¢çVÖ&W ¢f—6–&–Æ—G“¢7G&–æp¢Ð¢–ç6W'C¢°¢6Æ–VçEö×WFF–öåö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“¢7G&–æp¢–Có¢7G&–æp¢ÖVF–ö–C¢7G&–æp¢÷fW&Æ“ó¢§6öà¢6†÷ö–C¢7G&–æp¢fW'6–öã¢çVÖ&W ¢f—6–&–Æ—G“ó¢7G&–æp¢Ð¢WFFS¢°¢6Æ–VçEö×WFF–öåö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–æp¢–Có¢7G&–æp¢ÖVF–ö–Có¢7G&–æp¢÷fW&Æ“ó¢§6öà¢6†÷ö–Có¢7G&–æp¢fW'6–öãó¢çVÖ&W ¢f—6–&–Æ—G“ó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–öææ÷FF–öç5öÖVF–ö–Eöf¶W’ ¢6öÇVÖç3¢²&ÖVF–ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÖVF– ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–öææ÷FF–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÖVF–öææ÷FF–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%÷'EöÆÆö6F–öç3¢°¢&÷s¢°¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢Æö6F–öåö–C¢7G&–æp¢'Eö–C¢7G&–æp¢G“¢çVÖ&W ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷&WVW7Eö—FVÕö–C¢7G&–ærÂçVÆÀ¢7Fö6µöÖ÷fUö–C¢7G&–ærÂçVÆÀ¢Væ—Eö6÷7C¢çVÖ&W ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢v÷&µö÷&FW%÷'Eö–C¢7G&–æp¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢Æö6F–öåö–C¢7G&–æp¢'Eö–C¢7G&–æp¢G“¢çVÖ&W ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷&WVW7Eö—FVÕö–Có¢7G&–ærÂçVÆÀ¢7Fö6µöÖ÷fUö–Có¢7G&–ærÂçVÆÀ¢Væ—Eö6÷7Có¢çVÖ&W ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢v÷&µö÷&FW%÷'Eö–C¢7G&–æp¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢Æö6F–öåö–Có¢7G&–æp¢'Eö–Có¢7G&–æp¢G“ó¢çVÖ&W ¢6†÷ö–Có¢7G&–æp¢6÷W&6U÷&WVW7Eö—FVÕö–Có¢7G&–ærÂçVÆÀ¢7Fö6µöÖ÷fUö–Có¢7G&–ærÂçVÆÀ¢Væ—Eö6÷7Có¢çVÖ&W ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–æp¢v÷&µö÷&FW%÷'Eö–Có¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5öÆö6F–öåö–Eöf¶W’ ¢6öÇVÖç3¢²&Æö6F–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'7Fö6µöÆö6F–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷6÷W&6U÷&WVW7Eö—FVÕö–Eöf¶W’ ¢6öÇVÖç3¢²'6÷W&6U÷&WVW7Eö—FVÕö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷&WVW7Eö—FV×2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷7Fö6µöÖ÷fUö–Eöf¶W’ ¢6öÇVÖç3¢²'7Fö6µöÖ÷fUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'7Fö6µöÖ÷fW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷v÷&µö÷&FW%÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢°¢'v÷&µö÷&FW%÷'Eö–B"À¢'6†÷ö–B"À¢'v÷&µö÷&FW%ö–B"À¢'v÷&µö÷&FW%öÆ–æUö–B"À¢''Eö–B"À¢Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&–çfö–6UöæWEö—77VVE÷'G2 ¢&VfW&Væ6VD6öÇVÖç3¢°¢&–B"À¢'6†÷ö–B"À¢'v÷&µö÷&FW%ö–B"À¢'v÷&µö÷&FW%öÆ–æUö–B"À¢''Eö–B"À¢Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'EöÆÆö6F–öç5÷v÷&µö÷&FW%÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢°¢'v÷&µö÷&FW%÷'Eö–B"À¢'6†÷ö–B"À¢'v÷&µö÷&FW%ö–B"À¢'v÷&µö÷&FW%öÆ–æUö–B"À¢''Eö–B"À¢Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%÷'G2 ¢&VfW&Væ6VD6öÇVÖç3¢°¢&–B"À¢'6†÷ö–B"À¢'v÷&µö÷&FW%ö–B"À¢'v÷&µö÷&FW%öÆ–æUö–B"À¢''Eö–B"À¢Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%÷'G3¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢FW67&—F–öå÷6æ6†÷C¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢—5ö7F—fS¢&ööÆVà¢Æ–fV7–6ÆU÷7FGW3¢7G&–æp¢ÖçVf7GW&W%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢'Eö–C¢7G&–ærÂçVÆÀ¢'EöçVÖ&W%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢VçF—G“¢çVÖ&W ¢VçF—G•öÆÆö6FVC¢çVÖ&W ¢VçF—G•ö6æ6VÆÆVC¢çVÖ&W ¢VçF—G•ö6öç7VÖVC¢çVÖ&W ¢VçF—G•ö÷&FW&VC¢çVÖ&W ¢VçF—G•÷&V6V—fVC¢çVÖ&W ¢VçF—G•÷&WVW7FVC¢çVÖ&W ¢VçF—G•÷&WGW&æVC¢çVÖ&W ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6·U÷6æ6†÷C¢7G&–ærÂçVÆÀ¢6÷W&6U÷'G5÷&WVW7Eö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷'G5÷&WVW7Eö—FVÕö–C¢7G&–ærÂçVÆÀ¢7WÆ–W%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢F÷FÅ÷&–6S¢çVÖ&W"ÂçVÆÀ¢Væ—Eö6÷7E÷6æ6†÷C¢çVÖ&W"ÂçVÆÀ¢Væ—E÷&–6S¢çVÖ&W"ÂçVÆÀ¢Væ—E÷6VÆÅ÷&–6U÷6æ6†÷C¢çVÖ&W"ÂçVÆÀ¢WFFVEöC¢7G&–æp¢fVæF÷%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FW67&—F–öå÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢Æ–fV7–6ÆU÷7FGW3ó¢7G&–æp¢ÖçVf7GW&W%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢'Eö–Có¢7G&–ærÂçVÆÀ¢'EöçVÖ&W%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢VçF—G“ó¢çVÖ&W ¢VçF—G•öÆÆö6FVCó¢çVÖ&W ¢VçF—G•ö6æ6VÆÆVCó¢çVÖ&W ¢VçF—G•ö6öç7VÖVCó¢çVÖ&W ¢VçF—G•ö÷&FW&VCó¢çVÖ&W ¢VçF—G•÷&V6V—fVCó¢çVÖ&W ¢VçF—G•÷&WVW7FVCó¢çVÖ&W ¢VçF—G•÷&WGW&æVCó¢çVÖ&W ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6·U÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷'G5÷&WVW7Eö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷'G5÷&WVW7Eö—FVÕö–Có¢7G&–ærÂçVÆÀ¢7WÆ–W%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢F÷FÅ÷&–6Só¢çVÖ&W"ÂçVÆÀ¢Væ—Eö6÷7E÷6æ6†÷Có¢çVÖ&W"ÂçVÆÀ¢Væ—E÷&–6Só¢çVÖ&W"ÂçVÆÀ¢Væ—E÷6VÆÅ÷&–6U÷6æ6†÷Có¢çVÖ&W"ÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fVæF÷%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢FW67&—F–öå÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢Æ–fV7–6ÆU÷7FGW3ó¢7G&–æp¢ÖçVf7GW&W%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢'Eö–Có¢7G&–ærÂçVÆÀ¢'EöçVÖ&W%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢VçF—G“ó¢çVÖ&W ¢VçF—G•öÆÆö6FVCó¢çVÖ&W ¢VçF—G•ö6æ6VÆÆVCó¢çVÖ&W ¢VçF—G•ö6öç7VÖVCó¢çVÖ&W ¢VçF—G•ö÷&FW&VCó¢çVÖ&W ¢VçF—G•÷&V6V—fVCó¢çVÖ&W ¢VçF—G•÷&WVW7FVCó¢çVÖ&W ¢VçF—G•÷&WGW&æVCó¢çVÖ&W ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6·U÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷'G5÷&WVW7Eö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷'G5÷&WVW7Eö—FVÕö–Có¢7G&–ærÂçVÆÀ¢7WÆ–W%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢F÷FÅ÷&–6Só¢çVÖ&W"ÂçVÆÀ¢Væ—Eö6÷7E÷6æ6†÷Có¢çVÖ&W"ÂçVÆÀ¢Væ—E÷&–6Só¢çVÖ&W"ÂçVÆÀ¢Væ—E÷6VÆÅ÷&–6U÷6æ6†÷Có¢çVÖ&W"ÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fVæF÷%÷6æ6†÷Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷6÷W&6U÷'G5÷&WVW7Eö–Eöf¶W’ ¢6öÇVÖç3¢²'6÷W&6U÷'G5÷&WVW7Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷&WVW7G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷6÷W&6U÷'G5÷&WVW7Eö—FVÕö–Eöf¶W’ ¢6öÇVÖç3¢²'6÷W&6U÷'G5÷&WVW7Eö—FVÕö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷&WVW7Eö—FV×2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW%÷V÷FUöÆ–æW3¢°¢&÷s¢°¢•ö6W6S¢7G&–ærÂçVÆÀ¢•ö6ö×Æ–çC¢7G&–ærÂçVÆÀ¢•ö6÷'&V7F–öã¢7G&–ærÂçVÆÀ¢&÷fVEöC¢7G&–ærÂçVÆÀ¢&÷fVEö'“¢7G&–ærÂçVÆÀ¢6öçfW'FVEöC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æu÷6æ6†÷Eö–C¢7G&–ærÂçVÆÀ¢FV6—6–öã¢7G&–ærÂçVÆÀ¢FV6Æ–æU÷&V6öã¢7G&–ærÂçVÆÀ¢FV6Æ–æVEöC¢7G&–ærÂçVÆÀ¢FV6Æ–æVEö'“¢7G&–ærÂçVÆÀ¢FVfW%÷&V6öã¢7G&–ærÂçVÆÀ¢FVfW'&VEöC¢7G&–ærÂçVÆÀ¢FVfW'&VEö'“¢7G&–ærÂçVÆÀ¢FW67&—F–öã¢7G&–æp¢F—66÷VçE÷F÷FÃ¢çVÖ&W ¢W7EöÆ&÷%ö†÷W'3¢çVÖ&W"ÂçVÆÀ¢W‡FW&æÅö–C¢7G&–ærÂçVÆÀ¢w&æE÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢w&÷Wö–C¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢¦ö%÷G—S¢7G&–æp¢Æ&÷%ö†÷W'3¢çVÖ&W"ÂçVÆÀ¢Æ&÷%÷&FS¢çVÖ&W"ÂçVÆÀ¢Æ&÷%÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷G—S¢7G&–æp¢ÖWFFF¢§6öâÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢'G5÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢G“¢çVÖ&W"ÂçVÆÀ¢6VçEöC¢7G&–ærÂçVÆÀ¢6VçEö'“¢7G&–ærÂçVÆÀ¢6VçE÷Fõö7W7FöÖW%öC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷&÷uö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢7FvS¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢7V'F÷FÃ¢çVÖ&W"ÂçVÆÀ¢7VvvW7FVEö'“¢7G&–ærÂçVÆÀ¢F…÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢F—FÆS¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–æp¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢•ö6W6Só¢7G&–ærÂçVÆÀ¢•ö6ö×Æ–çCó¢7G&–ærÂçVÆÀ¢•ö6÷'&V7F–öãó¢7G&–ærÂçVÆÀ¢&÷fVEöCó¢7G&–ærÂçVÆÀ¢&÷fVEö'“ó¢7G&–ærÂçVÆÀ¢6öçfW'FVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æu÷6æ6†÷Eö–Có¢7G&–ærÂçVÆÀ¢FV6—6–öãó¢7G&–ærÂçVÆÀ¢FV6Æ–æU÷&V6öãó¢7G&–ærÂçVÆÀ¢FV6Æ–æVEöCó¢7G&–ærÂçVÆÀ¢FV6Æ–æVEö'“ó¢7G&–ærÂçVÆÀ¢FVfW%÷&V6öãó¢7G&–ærÂçVÆÀ¢FVfW'&VEöCó¢7G&–ærÂçVÆÀ¢FVfW'&VEö'“ó¢7G&–ærÂçVÆÀ¢FW67&—F–öã¢7G&–æp¢F—66÷VçE÷F÷FÃó¢çVÖ&W ¢W7EöÆ&÷%ö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢w&æE÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢w&÷Wö–Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢¦ö%÷G—Só¢7G&–æp¢Æ&÷%ö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢Æ&÷%÷&FSó¢çVÖ&W"ÂçVÆÀ¢Æ&÷%÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷G—Só¢7G&–æp¢ÖWFFFó¢§6öâÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢'G5÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢G“ó¢çVÖ&W"ÂçVÆÀ¢6VçEöCó¢7G&–ærÂçVÆÀ¢6VçEö'“ó¢7G&–ærÂçVÆÀ¢6VçE÷Fõö7W7FöÖW%öCó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢7FvSó¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢7V'F÷FÃó¢çVÖ&W"ÂçVÆÀ¢7VvvW7FVEö'“ó¢7G&–ærÂçVÆÀ¢F…÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢F—FÆSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢•ö6W6Só¢7G&–ærÂçVÆÀ¢•ö6ö×Æ–çCó¢7G&–ærÂçVÆÀ¢•ö6÷'&V7F–öãó¢7G&–ærÂçVÆÀ¢&÷fVEöCó¢7G&–ærÂçVÆÀ¢&÷fVEö'“ó¢7G&–ærÂçVÆÀ¢6öçfW'FVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æu÷6æ6†÷Eö–Có¢7G&–ærÂçVÆÀ¢FV6—6–öãó¢7G&–ærÂçVÆÀ¢FV6Æ–æU÷&V6öãó¢7G&–ærÂçVÆÀ¢FV6Æ–æVEöCó¢7G&–ærÂçVÆÀ¢FV6Æ–æVEö'“ó¢7G&–ærÂçVÆÀ¢FVfW%÷&V6öãó¢7G&–ærÂçVÆÀ¢FVfW'&VEöCó¢7G&–ærÂçVÆÀ¢FVfW'&VEö'“ó¢7G&–ærÂçVÆÀ¢FW67&—F–öãó¢7G&–æp¢F—66÷VçE÷F÷FÃó¢çVÖ&W ¢W7EöÆ&÷%ö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢w&æE÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢w&÷Wö–Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢¦ö%÷G—Só¢7G&–æp¢Æ&÷%ö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢Æ&÷%÷&FSó¢çVÖ&W"ÂçVÆÀ¢Æ&÷%÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷G—Só¢7G&–æp¢ÖWFFFó¢§6öâÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢'G5÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢G“ó¢çVÖ&W"ÂçVÆÀ¢6VçEöCó¢7G&–ærÂçVÆÀ¢6VçEö'“ó¢7G&–ærÂçVÆÀ¢6VçE÷Fõö7W7FöÖW%öCó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢7FvSó¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢7V'F÷FÃó¢çVÖ&W"ÂçVÆÀ¢7VvvW7FVEö'“ó¢7G&–ærÂçVÆÀ¢F…÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢F—FÆSó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–æp¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5ö7W7FöÖW%÷&–6–æu÷6æ6†÷Eö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%÷&–6–æu÷6æ6†÷Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&–6–æu÷&W6öÇWF–öå÷6æ6†÷G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷6÷W&6U÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'6÷W&6U÷v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷6÷W&6U÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'6÷W&6U÷v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷V÷FUöÆ–æW5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&µö÷&FW'3¢°¢&÷s¢°¢Gf—6÷%ö–C¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFS¢7G&–ærÂçVÆÀ¢&6†—fVEöC¢7G&–ærÂçVÆÀ¢&6†—fVEö'•÷W6W%ö–C¢7G&–ærÂçVÆÀ¢76–væVE÷FV6ƒ¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢7W7FöÕö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%öw&VVEöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷Fƒ¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷W&Ã¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fVEö'“¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%öæÖS¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVUöw&VVÖVçEö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷&W6öÇfVEöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢7W7FöÖW%÷6–væGW&U÷W&Ã¢7G&–ærÂçVÆÀ¢W7F–ÖFUöWF†÷&—¦VEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFUö6öçfW'FVEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEö'“¢7G&–ærÂçVÆÀ¢W7F–ÖFUöW‡—&W5öC¢7G&–ærÂçVÆÀ¢W7F–ÖFUöçVÖ&W#¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEö'“¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷&Wf—6–öã¢çVÖ&W ¢W7F–ÖFU÷6VçEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷6VçEö'“¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷7FGW3¢7G&–ærÂçVÆÀ¢W‡V7FVEö6ö×ÆWF–öåöC¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–C¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–×÷'Eö6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3¢7G&–ærÂçVÆÀ¢–ç7V7F–öåö–C¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷Fe÷W&Ã¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷G—S¢7G&–ærÂçVÆÀ¢–çF¶Uö§6öã¢§6öâÂçVÆÀ¢–çF¶U÷7FGW3¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEöC¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEö'“¢7G&–ærÂçVÆÀ¢–çfö–6UöÆ7E÷6VçE÷Fó¢7G&–ærÂçVÆÀ¢–çfö–6U÷Fe÷W&Ã¢7G&–ærÂçVÆÀ¢–çfö–6U÷6VçEöC¢7G&–ærÂçVÆÀ¢–çfö–6U÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢–çfö–6U÷W&Ã¢7G&–ærÂçVÆÀ¢—5÷v—FW#¢&ööÆVà¢Æ&÷%÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢öFöÖWFW%ö¶Ó¢çVÖ&W"ÂçVÆÀ¢÷WG7FæF–æuö&Ææ6S¢çVÖ&W ¢–EöC¢7G&–ærÂçVÆÀ¢'G5÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢–ÖVçE÷7FGW3¢7G&–æp¢÷'FÅ÷7V&Ö—GFVEöC¢7G&–ærÂçVÆÀ¢&–÷&—G“¢çVÖ&W"ÂçVÆÀ¢V÷FS¢§6öâÂçVÆÀ¢V÷FU÷W&Ã¢7G&–ærÂçVÆÀ¢&V6÷&E÷G—S¢7G&–æp¢66†VGVÆVEöC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6†÷÷7WÆ–W5öÖ÷VçEö÷fW'&–FS¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5öVæ&ÆVEö÷fW'&–FS¢&ööÆVâÂçVÆÀ¢6÷W&6UöfÆVWE÷&öw&Õö–C¢7G&–ærÂçVÆÀ¢6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7Eö–C¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–C¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢G—S¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö6öÆ÷#¢7G&–ærÂçVÆÀ¢fV†–6ÆUöG&—fWG&–ã¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æS¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æUö†÷W'3¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUögVVÅ÷G—S¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–æfó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÆ–6Vç6U÷ÆFS¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ¶S¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ–ÆVvS¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUöÖöFVÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷7V&ÖöFVÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷G&ç6Ö—76–öã¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷Væ—EöçVÖ&W#¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷f–ã¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷–V#¢çVÖ&W"ÂçVÆÀ¢Ð¢–ç6W'C¢°¢Gf—6÷%ö–Có¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFSó¢7G&–ærÂçVÆÀ¢&6†—fVEöCó¢7G&–ærÂçVÆÀ¢&6†—fVEö'•÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢76–væVE÷FV6ƒó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7W7FöÕö–Có¢7G&–ærÂçVÆÀ¢7W7FöÖW%öw&VVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷Fƒó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷W&Ãó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fVEö'“ó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢7W7FöÖW%öæÖSó¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVUöw&VVÖVçEö–Có¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷&W6öÇfVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢7W7FöÖW%÷6–væGW&U÷W&Ãó¢7G&–ærÂçVÆÀ¢W7F–ÖFUöWF†÷&—¦VEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUö6öçfW'FVEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢W7F–ÖFUöW‡—&W5öCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEö'“ó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷&Wf—6–öãó¢çVÖ&W ¢W7F–ÖFU÷6VçEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷6VçEö'“ó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷7FGW3ó¢7G&–ærÂçVÆÀ¢W‡V7FVEö6ö×ÆWF–öåöCó¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–×÷'Eö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3ó¢7G&–ærÂçVÆÀ¢–ç7V7F–öåö–Có¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷Fe÷W&Ãó¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷G—Só¢7G&–ærÂçVÆÀ¢–çF¶Uö§6öãó¢§6öâÂçVÆÀ¢–çF¶U÷7FGW3ó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEöCó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEö'“ó¢7G&–ærÂçVÆÀ¢–çfö–6UöÆ7E÷6VçE÷Fóó¢7G&–ærÂçVÆÀ¢–çfö–6U÷Fe÷W&Ãó¢7G&–ærÂçVÆÀ¢–çfö–6U÷6VçEöCó¢7G&–ærÂçVÆÀ¢–çfö–6U÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢–çfö–6U÷W&Ãó¢7G&–ærÂçVÆÀ¢—5÷v—FW#ó¢&ööÆVà¢Æ&÷%÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢öFöÖWFW%ö¶Óó¢çVÖ&W"ÂçVÆÀ¢÷WG7FæF–æuö&Ææ6Só¢çVÖ&W ¢–EöCó¢7G&–ærÂçVÆÀ¢'G5÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢–ÖVçE÷7FGW3ó¢7G&–æp¢÷'FÅ÷7V&Ö—GFVEöCó¢7G&–ærÂçVÆÀ¢&–÷&—G“ó¢çVÖ&W"ÂçVÆÀ¢V÷FSó¢§6öâÂçVÆÀ¢V÷FU÷W&Ãó¢7G&–ærÂçVÆÀ¢&V6÷&E÷G—Só¢7G&–æp¢66†VGVÆVEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6†÷÷7WÆ–W5öÖ÷VçEö÷fW'&–FSó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5öVæ&ÆVEö÷fW'&–FSó¢&ööÆVâÂçVÆÀ¢6÷W&6UöfÆVWE÷&öw&Õö–Có¢7G&–ærÂçVÆÀ¢6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7Eö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢G—Só¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö6öÆ÷#ó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöG&—fWG&–ãó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æSó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æUö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUögVVÅ÷G—Só¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–æfóó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÆ–6Vç6U÷ÆFSó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ¶Só¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ–ÆVvSó¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUöÖöFVÃó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷7V&ÖöFVÃó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷G&ç6Ö—76–öãó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷Væ—EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷f–ãó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷–V#ó¢çVÖ&W"ÂçVÆÀ¢Ð¢WFFS¢°¢Gf—6÷%ö–Có¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFSó¢7G&–ærÂçVÆÀ¢&6†—fVEöCó¢7G&–ærÂçVÆÀ¢&6†—fVEö'•÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢76–væVE÷FV6ƒó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢7W7FöÕö–Có¢7G&–ærÂçVÆÀ¢7W7FöÖW%öw&VVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷Fƒó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷W&Ãó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fVEö'“ó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢7W7FöÖW%öæÖSó¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVUöw&VVÖVçEö–Có¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷&W6öÇfVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢7W7FöÖW%÷6–væGW&U÷W&Ãó¢7G&–ærÂçVÆÀ¢W7F–ÖFUöWF†÷&—¦VEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUö6öçfW'FVEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢W7F–ÖFUöW‡—&W5öCó¢7G&–ærÂçVÆÀ¢W7F–ÖFUöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEö'“ó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷&Wf—6–öãó¢çVÖ&W ¢W7F–ÖFU÷6VçEöCó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷6VçEö'“ó¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷7FGW3ó¢7G&–ærÂçVÆÀ¢W‡V7FVEö6ö×ÆWF–öåöCó¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–Có¢7G&–ærÂçVÆÀ¢–Có¢7G&–æp¢–×÷'Eö6öæf–FVæ6Só¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3ó¢7G&–ærÂçVÆÀ¢–ç7V7F–öåö–Có¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷Fe÷W&Ãó¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷G—Só¢7G&–ærÂçVÆÀ¢–çF¶Uö§6öãó¢§6öâÂçVÆÀ¢–çF¶U÷7FGW3ó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEöCó¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEö'“ó¢7G&–ærÂçVÆÀ¢–çfö–6UöÆ7E÷6VçE÷Fóó¢7G&–ærÂçVÆÀ¢–çfö–6U÷Fe÷W&Ãó¢7G&–ærÂçVÆÀ¢–çfö–6U÷6VçEöCó¢7G&–ærÂçVÆÀ¢–çfö–6U÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢–çfö–6U÷W&Ãó¢7G&–ærÂçVÆÀ¢—5÷v—FW#ó¢&ööÆVà¢Æ&÷%÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢æ÷FW3ó¢7G&–ærÂçVÆÀ¢öFöÖWFW%ö¶Óó¢çVÖ&W"ÂçVÆÀ¢÷WG7FæF–æuö&Ææ6Só¢çVÖ&W ¢–EöCó¢7G&–ærÂçVÆÀ¢'G5÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢–ÖVçE÷7FGW3ó¢7G&–æp¢÷'FÅ÷7V&Ö—GFVEöCó¢7G&–ærÂçVÆÀ¢&–÷&—G“ó¢çVÖ&W"ÂçVÆÀ¢V÷FSó¢§6öâÂçVÆÀ¢V÷FU÷W&Ãó¢7G&–ærÂçVÆÀ¢&V6÷&E÷G—Só¢7G&–æp¢66†VGVÆVEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢6†÷÷7WÆ–W5öÖ÷VçEö÷fW'&–FSó¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5öVæ&ÆVEö÷fW'&–FSó¢&ööÆVâÂçVÆÀ¢6÷W&6UöfÆVWE÷&öw&Õö–Có¢7G&–ærÂçVÆÀ¢6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7Eö–Có¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–æp¢G—Só¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢W6W%ö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö6öÆ÷#ó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöG&—fWG&–ãó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æSó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æUö†÷W'3ó¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUögVVÅ÷G—Só¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–æfóó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÆ–6Vç6U÷ÆFSó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ¶Só¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ–ÆVvSó¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUöÖöFVÃó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷7V&ÖöFVÃó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷G&ç6Ö—76–öãó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷Væ—EöçVÖ&W#ó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷f–ãó¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷–V#ó¢çVÖ&W"ÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5ö7W7FöÖW%÷&–6–æuöfVUöw&VVÖVçEö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%÷&–6–æuöfVUöw&VVÖVçEö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW%÷&–6–æuöw&VVÖVçG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5öW7F–ÖFUö7&VFVEö'•öf¶W’ ¢6öÇVÖç3¢²&W7F–ÖFUö7&VFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5öW7F–ÖFU÷'G5ö6ö×ÆWFVEö'•öf¶W’ ¢6öÇVÖç3¢²&W7F–ÖFU÷'G5ö6ö×ÆWFVEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5öW7F–ÖFU÷6VçEö'•öf¶W’ ¢6öÇVÖç3¢²&W7F–ÖFU÷6VçEö'’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&¶f÷&6UöFö7VÖVçE÷&WV—&VÖVçG3¢°¢&÷s¢°¢66WE÷7FGW6W3¢7G&–æuµÐ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢Fö5÷G—S¢7G&–æp¢W‡—&W5÷&WV—&VC¢&ööÆVà¢W‡—&W5÷v&æ–æuöF—3¢çVÖ&W ¢–C¢7G&–æp¢—5ö7F—fS¢&ööÆVà¢—5÷&WV—&VC¢&ööÆVà¢Æ&VÃ¢7G&–æp¢&–÷&—G“¢çVÖ&W ¢&Wf–Wu÷7FGW6W3¢7G&–æuµÐ¢6†÷ö–C¢7G&–æp¢WFFVEöC¢7G&–æp¢WFFVEö'“¢7G&–ærÂçVÆÀ¢v÷&¶f÷&6Uö6FVv÷'“¢7G&–ærÂçVÆÀ¢v÷&¶f÷&6U÷&öÆS¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢66WE÷7FGW6W3ó¢7G&–æuµÐ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢Fö5÷G—S¢7G&–æp¢W‡—&W5÷&WV—&VCó¢&ööÆVà¢W‡—&W5÷v&æ–æuöF—3ó¢çVÖ&W ¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢—5÷&WV—&VCó¢&ööÆVà¢Æ&VÃ¢7G&–æp¢&–÷&—G“ó¢çVÖ&W ¢&Wf–Wu÷7FGW6W3ó¢7G&–æuµÐ¢6†÷ö–C¢7G&–æp¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢v÷&¶f÷&6Uö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢v÷&¶f÷&6U÷&öÆSó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢66WE÷7FGW6W3ó¢7G&–æuµÐ¢7&VFVEöCó¢7G&–æp¢7&VFVEö'“ó¢7G&–ærÂçVÆÀ¢Fö5÷G—Só¢7G&–æp¢W‡—&W5÷&WV—&VCó¢&ööÆVà¢W‡—&W5÷v&æ–æuöF—3ó¢çVÖ&W ¢–Có¢7G&–æp¢—5ö7F—fSó¢&ööÆVà¢—5÷&WV—&VCó¢&ööÆVà¢Æ&VÃó¢7G&–æp¢&–÷&—G“ó¢çVÖ&W ¢&Wf–Wu÷7FGW6W3ó¢7G&–æuµÐ¢6†÷ö–Có¢7G&–æp¢WFFVEöCó¢7G&–æp¢WFFVEö'“ó¢7G&–ærÂçVÆÀ¢v÷&¶f÷&6Uö6FVv÷'“ó¢7G&–ærÂçVÆÀ¢v÷&¶f÷&6U÷&öÆSó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6UöFö7VÖVçE÷&WV—&VÖVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6UöFö7VÖVçE÷&WV—&VÖVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G3¢°¢&÷s¢°¢76–væÖVçEö–C¢7G&–ærÂçVÆÀ¢'&Vµ÷Væ6…ö–C¢7G&–æp¢6æ6VÅ÷&V6öã¢7G&–ærÂçVÆÀ¢6æ6VÆÆVEöC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢ÖWFFF¢§6öà¢W6U÷&V6öã¢7G&–æp¢W6VEöC¢7G&–æp¢W6VEö¦ö%÷6W76–öåö–C¢7G&–ærÂçVÆÀ¢&W7VÖVEöC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢76–væÖVçEö–Có¢7G&–ærÂçVÆÀ¢'&Vµ÷Væ6…ö–C¢7G&–æp¢6æ6VÅ÷&V6öãó¢7G&–ærÂçVÆÀ¢6æ6VÆÆVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖWFFFó¢§6öà¢W6U÷&V6öã¢7G&–æp¢W6VEöC¢7G&–æp¢W6VEö¦ö%÷6W76–öåö–Có¢7G&–ærÂçVÆÀ¢&W7VÖVEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–C¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢76–væÖVçEö–Có¢7G&–ærÂçVÆÀ¢'&Vµ÷Væ6…ö–Có¢7G&–æp¢6æ6VÅ÷&V6öãó¢7G&–ærÂçVÆÀ¢6æ6VÆÆVEöCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢ÖWFFFó¢§6öà¢W6U÷&V6öãó¢7G&–æp¢W6VEöCó¢7G&–æp¢W6VEö¦ö%÷6W76–öåö–Có¢7G&–ærÂçVÆÀ¢&W7VÖVEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–æp¢7FGW3ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢W6W%ö–Có¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5ö'&Vµ÷Væ6…ö–Eöf¶W’ ¢6öÇVÖç3¢²&'&Vµ÷Væ6…ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'Væ6…öWfVçG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷W6VEö¦ö%÷6W76–öåö–Eöf¶W’ ¢6öÇVÖç3¢²'W6VEö¦ö%÷6W76–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö¦ö%÷&W7VÖUö6öçFW‡G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&¶f÷&6Uö÷W&F–öåö¶W—3¢°¢&÷s¢°¢7F÷%÷W6W%ö–C¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢÷W&F–öåö¶W“¢7G&–æp¢÷W&F–öåöæÖS¢7G&–æp¢&W7VÇC¢§6öà¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7F÷%÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢÷W&F–öåö¶W“¢7G&–æp¢÷W&F–öåöæÖS¢7G&–æp¢&W7VÇCó¢§6öà¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7F÷%÷W6W%ö–Có¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–æp¢–Có¢7G&–æp¢÷W&F–öåö¶W“ó¢7G&–æp¢÷W&F–öåöæÖSó¢7G&–æp¢&W7VÇCó¢§6öà¢6†÷ö–Có¢7G&–æp¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&¶f÷&6Uö÷W&F–öåö¶W—5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢v÷&·76Uö6&–Æ—F–W3¢°¢&÷s¢°¢66W75öÆWfVÃ¢7G&–æp¢7F–öåö¶W“¢7G&–æp¢6&–Æ—G•ö¶W“¢7G&–æp¢7&VFVEöC¢7G&–æp¢FW67&—F–öã¢7G&–æp¢—5÷&÷FV7FVC¢&ööÆVà¢ÖöGVÆUö¶W“¢7G&–æp¢WFFVEöC¢7G&–æp¢v÷&·76Uö¶W“¢7G&–æp¢Ð¢–ç6W'C¢°¢66W75öÆWfVÃ¢7G&–æp¢7F–öåö¶W“¢7G&–æp¢6&–Æ—G•ö¶W“¢7G&–æp¢7&VFVEöCó¢7G&–æp¢FW67&—F–öã¢7G&–æp¢—5÷&÷FV7FVCó¢&ööÆVà¢ÖöGVÆUö¶W“¢7G&–æp¢WFFVEöCó¢7G&–æp¢v÷&·76Uö¶W“¢7G&–æp¢Ð¢WFFS¢°¢66W75öÆWfVÃó¢7G&–æp¢7F–öåö¶W“ó¢7G&–æp¢6&–Æ—G•ö¶W“ó¢7G&–æp¢7&VFVEöCó¢7G&–æp¢FW67&—F–öãó¢7G&–æp¢—5÷&÷FV7FVCó¢&ööÆVà¢ÖöGVÆUö¶W“ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢v÷&·76Uö¶W“ó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢v÷&·76U÷&öÆUö6&–Æ—G•÷&W6WG3¢°¢&÷s¢°¢6&–Æ—G•ö¶W“¢7G&–æp¢7&VFVEöC¢7G&–æp¢VffV7C¢7G&–æp¢&öÆUö¶W“¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢–ç6W'C¢°¢6&–Æ—G•ö¶W“¢7G&–æp¢7&VFVEöCó¢7G&–æp¢VffV7C¢7G&–æp¢&öÆUö¶W“¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢WFFS¢°¢6&–Æ—G•ö¶W“ó¢7G&–æp¢7&VFVEöCó¢7G&–æp¢VffV7Có¢7G&–æp¢&öÆUö¶W“ó¢7G&–æp¢WFFVEöCó¢7G&–æp¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&·76U÷&öÆUö6&–Æ—G•÷&W6WG5ö6&–Æ—G•ö¶W•öf¶W’ ¢6öÇVÖç3¢²&6&–Æ—G•ö¶W’%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&·76Uö6&–Æ—F–W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&6&–Æ—G•ö¶W’%Ð¢ÒÀ¢Ð¢Ð¢Ð¢f–Ww3¢°¢–çfö–6UöæWEö—77VVE÷'G3¢°¢&÷s¢°¢FW67&—F–öå÷6æ6†÷C¢7G&–ærÂçVÆÀ¢–C¢7G&–ærÂçVÆÀ¢Æ–æU÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢ÖçVf7GW&W%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢æWEö—77VVE÷VçF—G“¢çVÖ&W"ÂçVÆÀ¢'Eö–C¢7G&–ærÂçVÆÀ¢'EöçVÖ&W%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6·U÷6æ6†÷C¢7G&–ærÂçVÆÀ¢7WÆ–W%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢Væ—Eö6÷7E÷6æ6†÷C¢çVÖ&W"ÂçVÆÀ¢Væ—E÷6VÆÅ÷&–6S¢çVÖ&W"ÂçVÆÀ¢fVæF÷%÷6æ6†÷C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''E÷7Fö6µ÷7VÖÖ'’ ¢&VfW&Væ6VD6öÇVÖç3¢²''Eö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷'Eö–Eöf¶W’ ¢6öÇVÖç3¢²''Eö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢''G2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷V÷FU÷VWVR ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%÷'G5÷v÷&µö÷&FW%öÆ–æUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%öÆ–æUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW%öÆ–æW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢÷W&F–öæÅöWfVçEö†VÇFƒ¢°¢&÷s¢°¢7F—fUöFöÖ–ç5öÆ7EóvC¢çVÖ&W"ÂçVÆÀ¢WfVçG5öÆ7Eó#Fƒ¢çVÖ&W"ÂçVÆÀ¢WfVçG5öÆ7EóvC¢çVÖ&W"ÂçVÆÀ¢Æ7EöWfVçEöC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢Vç&W6öÇfVEöf–ÇW&Uö6÷VçC¢çVÖ&W"ÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢&÷W&F–öæÅöWfVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢&÷W&F–öæÅöWfVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢'E÷7Fö6µ÷7VÖÖ'“¢°¢&÷s¢°¢6FVv÷'“¢7G&–ærÂçVÆÀ¢Ö÷fUö6÷VçC¢çVÖ&W"ÂçVÆÀ¢æÖS¢7G&–ærÂçVÆÀ¢öåö†æC¢çVÖ&W"ÂçVÆÀ¢'Eö–C¢7G&–ærÂçVÆÀ¢&–6S¢çVÖ&W"ÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6·S¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢6†÷÷V&Æ–5÷&öf–ÆW3¢°¢&÷s¢°¢6—G“¢7G&–ærÂçVÆÀ¢vVõöÆC¢çVÖ&W"ÂçVÆÀ¢vVõöÆæs¢çVÖ&W"ÂçVÆÀ¢–C¢7G&–ærÂçVÆÀ¢–ÖvW3¢7G&–æuµÒÂçVÆÀ¢Æövõ÷W&Ã¢7G&–ærÂçVÆÀ¢æÖS¢7G&–ærÂçVÆÀ¢&÷f–æ6S¢7G&–ærÂçVÆÀ¢&F–æs¢çVÖ&W"ÂçVÆÀ¢Ð¢–ç6W'C¢°¢6—G“ó¢7G&–ærÂçVÆÀ¢vVõöÆCó¢çVÖ&W"ÂçVÆÀ¢vVõöÆæsó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–ærÂçVÆÀ¢–ÖvW3ó¢7G&–æuµÒÂçVÆÀ¢Æövõ÷W&Ãó¢7G&–ærÂçVÆÀ¢æÖSó¢7G&–ærÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢&F–æsó¢çVÖ&W"ÂçVÆÀ¢Ð¢WFFS¢°¢6—G“ó¢7G&–ærÂçVÆÀ¢vVõöÆCó¢çVÖ&W"ÂçVÆÀ¢vVõöÆæsó¢çVÖ&W"ÂçVÆÀ¢–Có¢7G&–ærÂçVÆÀ¢–ÖvW3ó¢7G&–æuµÒÂçVÆÀ¢Æövõ÷W&Ãó¢7G&–ærÂçVÆÀ¢æÖSó¢7G&–ærÂçVÆÀ¢&÷f–æ6Só¢7G&–ærÂçVÆÀ¢&F–æsó¢çVÖ&W"ÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢6†÷÷&Wf–Ww5÷V&Æ–3¢°¢&÷s¢°¢6öÖÖVçC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–ærÂçVÆÀ¢&F–æs¢çVÖ&W"ÂçVÆÀ¢&WÆ–VEöC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6†÷ö÷væW%÷&WÇ“¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢6öÖÖVçCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–ærÂçVÆÀ¢&F–æsó¢çVÖ&W"ÂçVÆÀ¢&WÆ–VEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6†÷ö÷væW%÷&WÇ“ó¢æWfW ¢Ð¢WFFS¢°¢6öÖÖVçCó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢–Có¢7G&–ærÂçVÆÀ¢&F–æsó¢çVÖ&W"ÂçVÆÀ¢&WÆ–VEöCó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6†÷ö÷væW%÷&WÇ“ó¢æWfW ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&Wf–Ww5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷÷&Wf–Ww5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢Væ–f–VEöWfVçG3¢°¢&÷s¢°¢7&VFVEöC¢7G&–ærÂçVÆÀ¢VçF—G•ö–C¢7G&–ærÂçVÆÀ¢VçF—G•÷F&ÆS¢7G&–ærÂçVÆÀ¢WfVçE÷G—S¢7G&–ærÂçVÆÀ¢–C¢7G&–ærÂçVÆÀ¢–ÆöC¢§6öâÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷7—7FVÓ¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢VçF—G•ö–Có¢7G&–ærÂçVÆÀ¢VçF—G•÷F&ÆSó¢7G&–ærÂçVÆÀ¢WfVçE÷G—Só¢7G&–ærÂçVÆÀ¢–Có¢7G&–ærÂçVÆÀ¢–ÆöCó¢§6öâÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷7—7FVÓó¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢VçF—G•ö–Có¢7G&–ærÂçVÆÀ¢VçF—G•÷F&ÆSó¢7G&–ærÂçVÆÀ¢WfVçE÷G—Só¢7G&–ærÂçVÆÀ¢–Có¢7G&–ærÂçVÆÀ¢–ÆöCó¢§6öâÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢6÷W&6U÷7—7FVÓó¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢&÷W&F–öæÅöWfVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢&÷W&F–öæÅöWfVçG5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢eöÖVçU÷&W—%ö—FVÕöÖF6…÷7FG3¢°¢&÷s¢°¢66WFæ6U÷&FS¢çVÖ&W"ÂçVÆÀ¢66WFVEö6÷VçC¢çVÖ&W"ÂçVÆÀ¢F—6Ö—76VEö6÷VçC¢çVÖ&W"ÂçVÆÀ¢fVVF&6µö6÷VçC¢çVÖ&W"ÂçVÆÀ¢ÖVçU÷&W—%ö—FVÕö–C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢&–ç7V7F–öå÷6Ö'EöÖF6…öfVVF&6µöÖVçU÷&W—%ö—FVÕö–Eöf¶W’ ¢6öÇVÖç3¢²&ÖVçU÷&W—%ö—FVÕö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&ÖVçU÷&W—%ö—FV×2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢&–ç7V7F–öå÷6Ö'EöÖF6…öfVVF&6µ÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢&–ç7V7F–öå÷6Ö'EöÖF6…öfVVF&6µ÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷'E÷7Fö6³¢°¢&÷s¢°¢Æö6F–öåö–C¢7G&–ærÂçVÆÀ¢'Eö–C¢7G&–ærÂçVÆÀ¢G•öf–Æ&ÆS¢çVÖ&W"ÂçVÆÀ¢G•ööåö†æC¢çVÖ&W"ÂçVÆÀ¢G•÷&W6W'fVC¢çVÖ&W"ÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢e÷÷'FÅö–çfö–6W3¢°¢&÷s¢°¢&÷fÅ÷7FFS¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢–çfö–6UöÆ7E÷6VçE÷Fó¢7G&–ærÂçVÆÀ¢–çfö–6U÷Fe÷W&Ã¢7G&–ærÂçVÆÀ¢–çfö–6U÷6VçEöC¢7G&–ærÂçVÆÀ¢–çfö–6U÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢–çfö–6U÷W&Ã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢Ð¢–ç6W'C¢°¢&÷fÅ÷7FFSó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢–çfö–6UöÆ7E÷6VçE÷Fóó¢7G&–ærÂçVÆÀ¢–çfö–6U÷Fe÷W&Ãó¢7G&–ærÂçVÆÀ¢–çfö–6U÷6VçEöCó¢7G&–ærÂçVÆÀ¢–çfö–6U÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢–çfö–6U÷W&Ãó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢WFFS¢°¢&÷fÅ÷7FFSó¢7G&–ærÂçVÆÀ¢7&VFVEöCó¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–Có¢7G&–ærÂçVÆÀ¢–çfö–6UöÆ7E÷6VçE÷Fóó¢7G&–ærÂçVÆÀ¢–çfö–6U÷Fe÷W&Ãó¢7G&–ærÂçVÆÀ¢–çfö–6U÷6VçEöCó¢7G&–ærÂçVÆÀ¢–çfö–6U÷F÷FÃó¢çVÖ&W"ÂçVÆÀ¢–çfö–6U÷W&Ãó¢7G&–ærÂçVÆÀ¢6†÷ö–Có¢7G&–ærÂçVÆÀ¢7FGW3ó¢7G&–ærÂçVÆÀ¢WFFVEöCó¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–Có¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–Có¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷V÷FU÷VWVS¢°¢&÷s¢°¢&÷fÅöC¢7G&–ærÂçVÆÀ¢&÷fÅö'“¢7G&–ærÂçVÆÀ¢&÷fÅöæ÷FS¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFS¢7G&–ærÂçVÆÀ¢76–væVE÷FV6…ö–C¢7G&–ærÂçVÆÀ¢76–væVE÷Fó¢7G&–ærÂçVÆÀ¢6W6S¢7G&–ærÂçVÆÀ¢6ö×Æ–çC¢7G&–ærÂçVÆÀ¢6÷'&V7F–öã¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢FW67&—F–öã¢7G&–ærÂçVÆÀ¢†öÆE÷&V6öã¢7G&–ærÂçVÆÀ¢–C¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷6W76–öåö–C¢7G&–ærÂçVÆÀ¢¦ö%÷G—S¢7G&–ærÂçVÆÀ¢Æ&÷%÷F–ÖS¢çVÖ&W"ÂçVÆÀ¢Æ–æU÷7FGW3¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢öåö†öÆE÷6–æ6S¢7G&–ærÂçVÆÀ¢'G3¢7G&–ærÂçVÆÀ¢'G5öæVVFVC¢§6öâÂçVÆÀ¢'G5÷&V6V—fVC¢§6öâÂçVÆÀ¢'G5÷&WV—&VC¢§6öâÂçVÆÀ¢&–6UöW7F–ÖFS¢çVÖ&W"ÂçVÆÀ¢&–÷&—G“¢çVÖ&W"ÂçVÆÀ¢Væ6†VEö–åöC¢7G&–ærÂçVÆÀ¢Væ6†VEö÷WEöC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–ærÂçVÆÀ¢FV×ÆFUö–C¢7G&–ærÂçVÆÀ¢FööÇ3¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–ærÂçVÆÀ¢W&vVæ7“¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö7W7FöÕö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%÷fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5ö76–væVE÷FV6…ö–Eöf¶W’ ¢6öÇVÖç3¢²&76–væVE÷FV6…ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5ö–ç7V7F–öå÷6W76–öåöf² ¢6öÇVÖç3¢²&–ç7V7F–öå÷6W76–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&–ç7V7F–öå÷6W76–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5ö–ç7V7F–öå÷6W76–öåö–Eöf¶W’ ¢6öÇVÖç3¢²&–ç7V7F–öå÷6W76–öåö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&–ç7V7F–öå÷6W76–öç2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%öf² ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷÷'FÅö–çfö–6W2 ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWB ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÂ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷ ¢&VfW&Væ6VD6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW%öÆ–æW5÷v÷&µö÷&FW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'v÷&µö÷&FW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%ö7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'v÷&µö÷&FW%÷fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷6†–gE÷&öÆÇW3¢°¢&÷s¢°¢6†–gEö–C¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢v÷&¶VE÷6V6öæG3¢çVÖ&W"ÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'Væ6…öWfVçG5÷6†–gEö–Eöf¶W’ ¢6öÇVÖç3¢²'6†–gEö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'FV6…÷6†–gG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'Væ6…öWfVçG5÷W6W%ö–Eöf¶W’ ¢6öÇVÖç3¢²'W6W%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷6†÷ö&ö÷7Eö÷fW'f–Ws¢°¢&÷s¢°¢–×÷'Eöf–ÆUö6÷VçC¢çVÖ&W"ÂçVÆÀ¢–×÷'E÷&÷uö6÷VçC¢çVÖ&W"ÂçVÆÀ¢–çF¶Uö7&VFVEöC¢7G&–ærÂçVÆÀ¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢–çF¶U÷&ö6W76VEöC¢7G&–ærÂçVÆÀ¢–çF¶U÷6÷W&6S¢7G&–ærÂçVÆÀ¢–çF¶U÷7FGW3¢7G&–ærÂçVÆÀ¢ÆFW7EöÖWG&–73¢§6öâÂçVÆÀ¢ÆFW7E÷66÷&W3¢§6öâÂçVÆÀ¢ÆFW7E÷6æ6†÷Eö7&VFVEöC¢7G&–ærÂçVÆÀ¢ÆFW7E÷6æ6†÷Eö–C¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷ö&ö÷7Eö–çF¶W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ö&ö÷7Eö–çF¶W5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷6†÷ö&ö÷7E÷7VvvW7F–öç3¢°¢&÷s¢°¢6FVv÷'“¢7G&–ærÂçVÆÀ¢6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢–C¢7G&–ærÂçVÆÀ¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢Æ&÷%ö†÷W'5÷7VvvW7F–öã¢çVÖ&W"ÂçVÆÀ¢æÖS¢7G&–ærÂçVÆÀ¢&–6U÷7VvvW7F–öã¢çVÖ&W"ÂçVÆÀ¢&V6öã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢7VvvW7F–öå÷G—S¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢e÷6†÷ö†VÇF…öÆFW7C¢°¢&÷s¢°¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢ÖWG&–73¢§6öâÂçVÆÀ¢æ'&F—fU÷7VÖÖ'“¢7G&–ærÂçVÆÀ¢W&–öEöVæC¢7G&–ærÂçVÆÀ¢W&–öE÷7F'C¢7G&–ærÂçVÆÀ¢66÷&W3¢§6öâÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6æ6†÷Eö7&VFVEöC¢7G&–ærÂçVÆÀ¢6æ6†÷Eö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'6†÷ö†VÇF…÷6æ6†÷G5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷ö&ö÷7Eö–çF¶W2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ö†VÇF…÷6æ6†÷G5ö–çF¶Uö–Eöf¶W’ ¢6öÇVÖç3¢²&–çF¶Uö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'e÷6†÷ö&ö÷7Eö÷fW'f–Wr ¢&VfW&Væ6VD6öÇVÖç3¢²&–çF¶Uö–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ö†VÇF…÷6æ6†÷G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'6†÷ö†VÇF…÷6æ6†÷G5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷7Ffeö–çf—FW5ö6öÖÖöã¢°¢&÷s¢°¢6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢VÖ–Ã¢7G&–ærÂçVÆÀ¢gVÆÅöæÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–ærÂçVÆÀ¢–çF¶Uö–C¢7G&–ærÂçVÆÀ¢æÖS¢7G&–ærÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢†öæS¢7G&–ærÂçVÆÀ¢&öÆS¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷G—S¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–ærÂçVÆÀ¢W6W&æÖS¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢µÐ¢Ð¢e÷v÷&µö÷&FW%ö&ö&Eö6&G5öfÆVWC¢°¢&÷s¢°¢7F—f—G•öC¢7G&–ærÂçVÆÀ¢Gf—6÷%ö–C¢7G&–ærÂçVÆÀ¢Gf—6÷%öæÖS¢7G&–ærÂçVÆÀ¢76–væVE÷7VÖÖ'“¢7G&–ærÂçVÆÀ¢76–væVE÷FV6…ö6÷VçC¢çVÖ&W"ÂçVÆÀ¢7W7FöÕö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢F—7Æ•öæÖS¢7G&–ærÂçVÆÀ¢f—'7E÷FV6…öæÖS¢7G&–ærÂçVÆÀ¢fÆVWEö–C¢7G&–ærÂçVÆÀ¢fÆVWEöæÖS¢7G&–ærÂçVÆÀ¢fÆVWE÷7FvUöÆ&VÃ¢7G&–ærÂçVÆÀ¢†5÷v—F–æu÷'G3¢&ööÆVâÂçVÆÀ¢—5÷v—FW#¢&ööÆVâÂçVÆÀ¢¦ö'5ö&Æö6¶VC¢çVÖ&W"ÂçVÆÀ¢¦ö'5ö6ö×ÆWFVC¢çVÖ&W"ÂçVÆÀ¢¦ö'5ö÷Vã¢çVÖ&W"ÂçVÆÀ¢¦ö'5÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢¦ö'5÷v—F–æu÷'G3¢çVÖ&W"ÂçVÆÀ¢÷fW&ÆÅ÷7FvS¢7G&–ærÂçVÆÀ¢'G5ö&Æö6¶W%ö6÷VçC¢çVÖ&W"ÂçVÆÀ¢÷'FÅ÷7FvUöÆ&VÃ¢7G&–ærÂçVÆÀ¢÷'FÅ÷7FGW5öæ÷FS¢7G&–ærÂçVÆÀ¢&–÷&—G“¢çVÖ&W"ÂçVÆÀ¢&öw&W75÷7C¢çVÖ&W"ÂçVÆÀ¢&—6µöÆWfVÃ¢7G&–ærÂçVÆÀ¢&—6µ÷&V6öã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢FV6…öæÖW3¢7G&–æuµÒÂçVÆÀ¢F–ÖUö–å÷7FvU÷6V6öæG3¢çVÖ&W"ÂçVÆÀ¢Væ—EöÆ&VÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÆ&VÃ¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢&fÆVWE÷fV†–6ÆW5öfÆVWEö–Eöf¶W’ ¢6öÇVÖç3¢²&fÆVWEö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&fÆVWG2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷÷'FÃ¢°¢&÷s¢°¢7F—f—G•öC¢7G&–ærÂçVÆÀ¢Gf—6÷%ö–C¢7G&–ærÂçVÆÀ¢Gf—6÷%öæÖS¢7G&–ærÂçVÆÀ¢76–væVE÷7VÖÖ'“¢7G&–ærÂçVÆÀ¢76–væVE÷FV6…ö6÷VçC¢çVÖ&W"ÂçVÆÀ¢7W7FöÕö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢F—7Æ•öæÖS¢7G&–ærÂçVÆÀ¢f—'7E÷FV6…öæÖS¢7G&–ærÂçVÆÀ¢fÆVWEö–C¢7G&–ærÂçVÆÀ¢fÆVWEöæÖS¢7G&–ærÂçVÆÀ¢fÆVWE÷7FvUöÆ&VÃ¢7G&–ærÂçVÆÀ¢†5÷v—F–æu÷'G3¢&ööÆVâÂçVÆÀ¢—5÷v—FW#¢&ööÆVâÂçVÆÀ¢¦ö'5ö&Æö6¶VC¢çVÖ&W"ÂçVÆÀ¢¦ö'5ö6ö×ÆWFVC¢çVÖ&W"ÂçVÆÀ¢¦ö'5ö÷Vã¢çVÖ&W"ÂçVÆÀ¢¦ö'5÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢¦ö'5÷v—F–æu÷'G3¢çVÖ&W"ÂçVÆÀ¢÷fW&ÆÅ÷7FvS¢7G&–ærÂçVÆÀ¢'G5ö&Æö6¶W%ö6÷VçC¢çVÖ&W"ÂçVÆÀ¢÷'FÅ÷7FvUöÆ&VÃ¢7G&–ærÂçVÆÀ¢÷'FÅ÷7FGW5öæ÷FS¢7G&–ærÂçVÆÀ¢&–÷&—G“¢çVÖ&W"ÂçVÆÀ¢&öw&W75÷7C¢çVÖ&W"ÂçVÆÀ¢&—6µöÆWfVÃ¢7G&–ærÂçVÆÀ¢&—6µ÷&V6öã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢FV6…öæÖW3¢7G&–æuµÒÂçVÆÀ¢F–ÖUö–å÷7FvU÷6V6öæG3¢çVÖ&W"ÂçVÆÀ¢Væ—EöÆ&VÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÆ&VÃ¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢e÷v÷&µö÷&FW%ö&ö&Eö6&G5÷6†÷¢°¢&÷s¢°¢7F—f—G•öC¢7G&–ærÂçVÆÀ¢Gf—6÷%ö–C¢7G&–ærÂçVÆÀ¢Gf—6÷%öæÖS¢7G&–ærÂçVÆÀ¢76–væVE÷7VÖÖ'“¢7G&–ærÂçVÆÀ¢76–væVE÷FV6…ö6÷VçC¢çVÖ&W"ÂçVÆÀ¢7W7FöÕö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢F—7Æ•öæÖS¢7G&–ærÂçVÆÀ¢f—'7E÷FV6…öæÖS¢7G&–ærÂçVÆÀ¢fÆVWE÷7FvUöÆ&VÃ¢7G&–ærÂçVÆÀ¢†5÷v—F–æu÷'G3¢&ööÆVâÂçVÆÀ¢—5÷v—FW#¢&ööÆVâÂçVÆÀ¢¦ö'5ö&Æö6¶VC¢çVÖ&W"ÂçVÆÀ¢¦ö'5ö6ö×ÆWFVC¢çVÖ&W"ÂçVÆÀ¢¦ö'5ö÷Vã¢çVÖ&W"ÂçVÆÀ¢¦ö'5÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢¦ö'5÷v—F–æu÷'G3¢çVÖ&W"ÂçVÆÀ¢÷fW&ÆÅ÷7FvS¢7G&–ærÂçVÆÀ¢'G5ö&Æö6¶W%ö6÷VçC¢çVÖ&W"ÂçVÆÀ¢÷'FÅ÷7FvUöÆ&VÃ¢7G&–ærÂçVÆÀ¢÷'FÅ÷7FGW5öæ÷FS¢7G&–ærÂçVÆÀ¢&–÷&—G“¢çVÖ&W"ÂçVÆÀ¢&öw&W75÷7C¢çVÖ&W"ÂçVÆÀ¢&—6µöÆWfVÃ¢7G&–ærÂçVÆÀ¢&—6µ÷&V6öã¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–ærÂçVÆÀ¢FV6…öæÖW3¢7G&–æuµÒÂçVÆÀ¢F–ÖUö–å÷7FvU÷6V6öæG3¢çVÖ&W"ÂçVÆÀ¢Væ—EöÆ&VÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÆ&VÃ¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–ærÂçVÆÀ¢Ð¢&VÆF–öç6†—3¢°¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5ö7W7FöÖW%ö–Eöf¶W’ ¢6öÇVÖç3¢²&7W7FöÖW%ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢&7W7FöÖW'2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷÷V&Æ–5÷&öf–ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷6†÷ö–Eöf¶W’ ¢6öÇVÖç3¢²'6†÷ö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'6†÷2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢°¢f÷&V–vä¶W”æÖS¢'v÷&µö÷&FW'5÷fV†–6ÆUö–Eöf¶W’ ¢6öÇVÖç3¢²'fV†–6ÆUö–B%Ð¢—4öæUFôöæS¢fÇ6P¢&VfW&Væ6VE&VÆF–öã¢'fV†–6ÆW2 ¢&VfW&Væ6VD6öÇVÖç3¢²&–B%Ð¢ÒÀ¢Ð¢Ð¢Ð¢gVæ7F–öç3¢°¢öVç7W&U÷6ÖU÷6†÷¢²&w3¢²÷vó¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢66WEö7W7FöÖW%÷÷'FÅö–çf—FUöFöÖ–3¢°¢&w3¢°¢ö7F÷%öVÖ–Ã¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö–çf—FUö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢66WEöf–ææ6–Åö÷WF&÷…öFVÆ—fW'“¢°¢&w3¢°¢öFVÆ—fW'•ö–C¢7G&–æp¢÷&÷f–FW%öÖW76vUö–C¢7G&–æp¢÷v÷&¶W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢66WEöfÆVWE÷÷'FÅö–çf—FUöFöÖ–3¢°¢&w3¢°¢ö7F÷%öVÖ–Ã¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢÷Fö¶Våö†6ƒ¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢66WE÷&÷W'G•÷÷'FÅö–çf—FS¢°¢&w3¢²÷&u÷Fö¶Vã¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢FEö•÷7VvvW7FVE÷V÷FUöÆ–æW5öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö—FV×3¢§6öà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢FE÷÷'FÅöF–væ÷7F–5öÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFW67&—F–öã¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢FE÷÷'FÅ÷&WVW7EöÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFW67&—F–öã¢7G&–æp¢öÆ–æUö¶–æC¢7G&–æp¢öÆ–æU÷G—S¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6Uö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢FE÷&W—%öÆ–æUög&öÕ÷fV†–6ÆU÷6W'f–6S¢°¢&w3¢°¢öVæv–æUöfÖ–Ç“¢7G&–æp¢÷G“ó¢çVÖ&W ¢÷6W'f–6Uö6öFS¢7G&–æp¢÷fV†–6ÆUöÖ¶S¢7G&–æp¢÷fV†–6ÆUöÖöFVÃ¢7G&–æp¢÷fV†–6ÆU÷–V#¢çVÖ&W ¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢vVçEö&÷fUö7F–öã¢°¢&w3¢²ö7F–öåö–C¢7G&–æs²ö&÷fVEö'“ó¢7G&–ærÐ¢&WGW&ç3¢°¢&÷fVEöC¢7G&–ærÂçVÆÀ¢&÷fVEö'“¢7G&–ærÂçVÆÀ¢GFV×G3¢çVÖ&W ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢¶–æC¢7G&–æp¢Æ7EöW'&÷#¢7G&–ærÂçVÆÀ¢Æ7EöW'&÷%öC¢7G&–ærÂçVÆÀ¢Ö…öGFV×G3¢çVÖ&W ¢–ÆöC¢§6öà¢&V¦V7FVEöC¢7G&–ærÂçVÆÀ¢&V¦V7FVEö'“¢7G&–ærÂçVÆÀ¢&V¦V7FVE÷&V6öã¢7G&–ærÂçVÆÀ¢&WVW7Eö–C¢7G&–æp¢&WV—&W5ö&÷fÃ¢&ööÆVà¢&W7VÇC¢§6öâÂçVÆÀ¢&—6³¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²&vVçEö7F–öå÷&—6²%Ð¢'VåögFW#¢7G&–æp¢7FGW3¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²&vVçEö7F–öå÷7FGW2%Ð¢7VÖÖ'“¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢&vVçEö7F–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢vVçEö6å÷7F'C¢²&w3¢æWfW#²&WGW&ç3¢&ööÆVâÐ¢vVçE÷&V¦V7Eö7F–öã¢°¢&w3¢²ö7F–öåö–C¢7G&–æs²÷&V6öãó¢7G&–æs²÷&V¦V7FVEö'“ó¢7G&–ærÐ¢&WGW&ç3¢°¢&÷fVEöC¢7G&–ærÂçVÆÀ¢&÷fVEö'“¢7G&–ærÂçVÆÀ¢GFV×G3¢çVÖ&W ¢7&VFVEöC¢7G&–æp¢–C¢7G&–æp¢¶–æC¢7G&–æp¢Æ7EöW'&÷#¢7G&–ærÂçVÆÀ¢Æ7EöW'&÷%öC¢7G&–ærÂçVÆÀ¢Ö…öGFV×G3¢çVÖ&W ¢–ÆöC¢§6öà¢&V¦V7FVEöC¢7G&–ærÂçVÆÀ¢&V¦V7FVEö'“¢7G&–ærÂçVÆÀ¢&V¦V7FVE÷&V6öã¢7G&–ærÂçVÆÀ¢&WVW7Eö–C¢7G&–æp¢&WV—&W5ö&÷fÃ¢&ööÆVà¢&W7VÇC¢§6öâÂçVÆÀ¢&—6³¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²&vVçEö7F–öå÷&—6²%Ð¢'VåögFW#¢7G&–æp¢7FGW3¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²&vVçEö7F–öå÷7FGW2%Ð¢7VÖÖ'“¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢&vVçEö7F–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢Ç•ö&÷fÅö6ö×F–&–Æ—G•ö'VæFÆUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö&÷fVEöÆ–æUö–G3¢7G&–æuµÐ¢ö&÷fVE÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFV6Æ–æVEöÆ–æUö–G3¢7G&–æuµÐ¢öFV6Æ–æVE÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6–væGW&U÷W&Ã¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ö76–væVEö¦ö%÷Væ6…÷G&ç6—F–öåöFöÖ–3¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆÆ÷uö6öæ7W'&VçCó¢&ööÆVà¢öCó¢7G&–æp¢ö6W6Só¢7G&–æp¢ö6÷'&V7F–öãó¢7G&–æp¢öFWF–Ç3ó¢§6öà¢öWfVçCó¢7G&–æp¢ö†öÆE÷&V6öãó¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&W6W'fUöÆ–æU÷7FGW3ó¢&ööÆVà¢÷&VÆV6U÷Fõöv—F–æsó¢&ööÆVà¢÷6†÷ö–C¢7G&–æp¢÷7F'E÷6÷W&6Só¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ö6æöæ–6ÅööffÆ–æU÷6†–gE÷Væ6…öFöÖ–3¢°¢&w3¢°¢ö7F÷%öWF…÷W6W%ö–C¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öWfVçE÷G—S¢7G&–æp¢öæ÷FSó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†–gEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F–ÖW7F×¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ö7W7FöÖW%÷&–6–æu÷Fõ÷V÷FUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ö7W7FöÖW%÷&–6–æu÷c%÷Fõ÷V÷FUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ö7W7FöÖW%÷V÷FUöFV6—6–öåöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFV6—6–öã¢7G&–æp¢öFV6Æ–æU÷&VÖ–æ–æs¢&ööÆVà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ö7W7FöÖW%÷V÷FUöFV6—6–öåöVæv–æUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFV6—6–öã¢7G&–æp¢öFV6Æ–æU÷&VÖ–æ–æs¢&ööÆVà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ö¦ö%÷Væ6…÷G&ç6—F–öåöFöÖ–3¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆÆ÷uö6öæ7W'&VçCó¢&ööÆVà¢öCó¢7G&–æp¢ö6W6Só¢7G&–æp¢ö6÷'&V7F–öãó¢7G&–æp¢öFWF–Ç3ó¢§6öà¢öWfVçCó¢7G&–æp¢ö†öÆE÷&V6öãó¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&W6W'fUöÆ–æU÷7FGW3ó¢&ööÆVà¢÷&VÆV6U÷Fõöv—F–æsó¢&ööÆVà¢÷6†÷ö–C¢7G&–æp¢÷7F'E÷6÷W&6Só¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ööffÆ–æUöÆ–æUö×WFF–öåöFöÖ–3¢°¢&w3¢°¢ö7F–öå÷G—S¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷–ÆöC¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•ööffÆ–æU÷6†–gE÷Væ6…öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öWfVçE÷G—S¢7G&–æp¢öæ÷FSó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†–gEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F–ÖW7F×¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷÷'FÅö&öö¶–æuö6öÖÖæEöFöÖ–3¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%öÖöFS¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö&öö¶–æuö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öVæG5öC¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öãó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷÷'FÅöÆ–æUöFV6—6–öåöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFV6—6–öã¢7G&–æp¢öÆ–æUö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷÷'FÅ÷'G5ö†öÆEöÆ–æUöFV6—6–öåöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFV6—6–öã¢7G&–æp¢öÆ–æUö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷÷'FÅ÷V÷FUöFV6—6–öåöFöÖ–3¢°¢&w3¢°¢öCó¢7G&–æp¢öFV6—6–öã¢7G&–æp¢öFV6Æ–æU÷&VÖ–æ–æs¢&ööÆVà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷&UöÆ&÷%÷'G5÷V÷FUö†öÆEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢öFWF–Ç3ó¢§6öà¢öWfVçCó¢7G&–æp¢öW‡V7FVEöÆ–æU÷WFFVEöCó¢7G&–æp¢ö†öÆE÷&V6öãó¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷Væ6…ö6÷'&V7F–öã¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö6÷'&V7FVE÷F–ÖW7F×¢7G&–æp¢÷Væ6…ö–C¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢7F÷%÷&öf–ÆUö–C¢7G&–æp¢6÷'&V7FVE÷F–ÖW7F×¢7G&–æp¢7&VFVEöC¢7G&–æp¢WfVçE÷G—S¢7G&–æp¢–C¢7G&–æp¢÷&–v–æÅ÷F–ÖW7F×¢7G&–æp¢Væ6…ö–C¢7G&–æp¢&V6öã¢7G&–æp¢6†–gEö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢F&vWE÷W6W%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'Væ6…ö6÷'&V7F–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢Ç•÷6†–gEö6÷'&V7F–öã¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö6÷'&V7FVEöVæE÷F–ÖS¢7G&–æp¢ö6÷'&V7FVE÷7F'E÷F–ÖS¢7G&–æp¢ö6÷'&V7F–öå÷G—S¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†–gEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F&vWE÷W6W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷6†÷÷V÷FUöFV6—6–öåöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö6öçF7EöÖWF†öC¢7G&–æp¢öFV6—6–öã¢7G&–æp¢öæ÷FS¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷7FfeöÆ–æUöFV6—6–öåöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢öFV6—6–öã¢7G&–æp¢öÆ–æUö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ç•÷7Fö6µöÖ÷fS ¢Â°¢&w3¢°¢öÆö3¢7G&–æp¢÷'C¢7G&–æp¢÷G“¢çVÖ&W ¢÷&V6öã¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²'7Fö6µöÖ÷fU÷&V6öâ%Ð¢÷&Veö–Có¢7G&–æp¢÷&Veö¶–æCó¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢Â°¢&w3¢°¢öÆö3¢7G&–æp¢÷'C¢7G&–æp¢÷G“¢çVÖ&W ¢÷&V6öã¢7G&–æp¢÷&Veö–C¢7G&–æp¢÷&Veö¶–æC¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢Ç•÷7G&—U÷7V'67&—F–öå÷vV&†ööµ÷6æ6†÷C¢°¢&w3¢°¢ö7W7FöÖW%ö–C¢7G&–æp¢öWfVçEö7&VFVEöC¢7G&–æp¢öWfVçEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6æ6†÷C¢§6öà¢÷7V'67&—F–öåö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢&÷fUö–ç7V7F–öåöf÷&Õö–×÷'C¢°¢&w3¢²ö¦ö%ö–C¢7G&–æs²÷6V7F–öç3¢§6öã²÷F—FÆS¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢&÷fUöÆ–æW3¢°¢&w3¢°¢ö&÷fVEö–G3¢7G&–æuµÐ¢ö&÷fW#ó¢7G&–æp¢öFV6Æ–æU÷Væ6†V6¶VCó¢&ööÆVà¢öFV6Æ–æVEö–G3ó¢7G&–æuµÐ¢÷vó¢7G&–æp¢Ð¢&WGW&ç3¢VæFVf–æV@¢Ð¢&÷fU÷—&öÆÅ÷W&–öEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢÷W&–öEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&6†—fUö7W7FöÖW%ö66÷VçEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&6†—fU÷v÷&µö÷&FW%öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢76W'E÷V÷FU÷'G5÷V&Æ—6†&ÆS¢°¢&w3¢°¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢76–vå÷v÷&µö÷&FW%öÆ–æU÷FV6†æ–6–åöFöÖ–3 ¢Â°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öW‡V7FVE÷WFFVEöCó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Â°¢&w3¢°¢ö76–væVEö'“¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢76–vå÷v÷&µö÷&FW%÷&–Ö'•÷FV6†æ–6–åö'VÆµöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ööæÇ•÷Væ76–væVC¢&ööÆVà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢76—7FçEöæ÷F–f–6F–öå÷G'W7FVE÷w&—FW%÷&öÆÆ÷WEö6ö×ÆWFS¢°¢&w3¢æWfW ¢&WGW&ç3¢&ööÆVà¢Ð¢GF6…÷6–væVEö–ç7V7F–öå÷FeöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öW‡V7FVE÷7–æ5÷&Wf—6–öã¢çVÖ&W ¢ö–ç7V7F–öåö–C¢7G&–æp¢÷Fe÷6†#Sc¢7G&–æp¢÷Fe÷7F÷&vU÷Fƒ¢7G&–æp¢÷Fe÷W&Ã¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢GF6…÷7G&—Uö7V—6—F–öåö6†V6¶÷WC¢°¢&w3¢°¢ö6†V6¶÷WE÷6W76–öåö–C¢7G&–æp¢ö–çFVçEö–C¢7G&–æp¢öæöæ6S¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢&Vv–åöf–ææ6–Åö÷WF&÷…öFVÆ—fW'“¢°¢&w3¢°¢öFVÆ—fW'•ö–C¢7G&–æp¢öÆV6U÷6V6öæG3ó¢çVÖ&W ¢÷v÷&¶W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢&Vv–å÷7G&—Uö7V—6—F–öåö–çFVçC¢°¢&w3¢°¢öf÷VæF–æuöF—66÷VçEöÆ–VC¢&ööÆVà¢öæöæ6S¢7G&–æp¢÷Æåö¶W“¢7G&–æp¢÷&WVW7Eö¶W“¢7G&–æp¢÷7G&—U÷&–6Uö–C¢7G&–æp¢÷G&–ÅöF—3¢çVÖ&W ¢Ð¢&WGW&ç3¢°¢6†V6¶÷WE÷6W76–öåö–C¢7G&–æp¢–çFVçEö–C¢7G&–æp¢–çFVçEöæöæ6S¢7G&–æp¢–çFVçE÷7FGW3¢7G&–æp¢ÕµÐ¢Ð¢&ööµ÷÷'FÅ÷&W—%÷V÷FUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öVæG5öC¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷f—6—E÷G—S¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&ö÷G7G&ö÷væW%öFöÖ–3¢°¢&w3¢°¢ö'W6–æW75öæÖS¢7G&–æp¢ö6—G“¢7G&–æp¢ö6÷VçG'“¢7G&–æp¢ö÷væW%÷–åö†6ƒ¢7G&–æp¢÷÷7FÅö6öFS¢7G&–æp¢÷&÷f–æ6S¢7G&–æp¢÷6†÷öæÖS¢7G&–æp¢÷7G&VWC¢7G&–æp¢÷F–ÖW¦öæS¢7G&–æp¢Ð¢&WGW&ç3¢°¢7&VFVE÷6†÷¢&ööÆVà¢6†÷ö–C¢7G&–æp¢ÕµÐ¢Ð¢6åö66W75ö6öçfW'6F–öã¢°¢&w3¢²7F÷%÷W6W%ö–Có¢7G&–æs²F&vWEö6öçfW'6F–öåö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6åö66W75öW7F–ÖFU÷V÷FUöÆ–æS¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢öÖWFFF¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢6åöÖævU÷&öf–ÆS¢°¢&w3¢²F&vWE÷&öf–ÆUö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6å÷&VEöW7F–ÖFUö–çFW&æÅöFWF–Ç3¢°¢&w3¢²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6å÷6VÆV7EöW7F–ÖFU÷V÷FUöÆ–æS¢°¢&w3¢°¢ö&÷fVEöC¢7G&–æp¢öFV6Æ–æVEöC¢7G&–æp¢öFVfW'&VEöC¢7G&–æp¢÷6VçE÷Fõö7W7FöÖW%öC¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7FvS¢7G&–æp¢÷7FGW3¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢6å÷6VÆV7EöW7F–ÖFU÷v÷&µö÷&FW#¢°¢&w3¢°¢ö7W7FöÖW%ö–C¢7G&–æp¢öW7F–ÖFUöçVÖ&W#¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢6å÷WFFUöW7F–ÖFU÷'E÷&WVW7Eö—FV×3¢°¢&w3¢²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6å÷WFFU÷'E÷&WVW7Eö—FV×3¢°¢&w3¢²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6æöæ–6Å÷6†÷öÖVÖ&W'6†—÷&öÆS¢°¢&w3¢²÷&öÆS¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢6†E÷'F–6—çG5ö¶W“¢°¢&w3¢²÷&V6—–VçG3¢7G&–æuµÓ²÷6VæFW#¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢6†V6µ÷ÆåöÆ–Ö—C¢²&w3¢²öfVGW&S¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢6Æ–Õö6ö×ÆWFVE÷&W—%öÆV&æ–æuöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢öÆV6U÷Fö¶Vã¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6Æ–Õö6ö×ÆWFVE÷&W—%öÆV&æ–æuö&F6ƒ¢°¢&w3¢°¢öÆV6U÷6V6öæG3ó¢çVÖ&W ¢öÆ–Ö—Có¢çVÖ&W ¢÷v÷&¶W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢7F÷%÷W6W%ö–C¢7G&–æp¢ÆV6U÷Fö¶Vã¢7G&–æp¢6†÷ö–C¢7G&–æp¢v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢ÕµÐ¢Ð¢6Æ–Õöf–ææ6–Åö÷WF&÷…ö&F6ƒ¢°¢&w3¢°¢öÆV6U÷6V6öæG3ó¢çVÖ&W ¢öÆ–Ö—Có¢çVÖ&W ¢÷v÷&¶W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢vw&VvFUö–C¢7G&–æp¢GFV×G3¢çVÖ&W ¢FVGWUö¶W“¢7G&–æp¢WfVçE÷G—S¢7G&–æp¢÷WF&÷…ö–C¢7G&–æp¢–ÆöC¢§6öà¢6†÷ö–C¢7G&–æp¢ÕµÐ¢Ð¢6Æ–Õöf–ææ6–Åö÷WF&÷…öFVÆ—fW'“¢°¢&w3¢°¢öÆV6U÷6V6öæG3ó¢çVÖ&W ¢ö÷WF&÷…ö–C¢7G&–æp¢÷&V6—–VçEöVÖ–Ã¢7G&–æp¢÷&V6—–VçEö¶–æC¢7G&–æp¢÷v÷&¶W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢FVÆ—fW'•öGFV×G3¢çVÖ&W ¢FVÆ—fW'•ö–C¢7G&–æp¢FVÆ—fW'•ö¶W“¢7G&–æp¢FVÆ—fW'•÷7FGW3¢7G&–æp¢6†÷VÆE÷6VæC¢&ööÆVà¢ÕµÐ¢Ð¢6Æ–Õ÷7G&—Uö7V—6—F–öåö–çFVçC¢°¢&w3¢°¢ö6†V6¶÷WEöVÖ–Ã¢7G&–æp¢ö6†V6¶÷WE÷6W76–öåö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢ö–çFVçEö–C¢7G&–æp¢öæöæ6S¢7G&–æp¢÷7G&—U÷&–6Uö–C¢7G&–æp¢÷7V'67&—F–öåö–C¢7G&–æp¢÷W6W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢6Æ–ÖVC¢&ööÆVà¢FVæ–Å÷&V6öã¢7G&–æp¢6†÷ö–C¢7G&–æp¢ÕµÐ¢Ð¢6Æ–Õ÷7G&—U÷vV&†ööµöWfVçC¢°¢&w3¢°¢öWfVçEö7&VFVEöC¢7G&–æp¢öWfVçEö–C¢7G&–æp¢öWfVçE÷G—S¢7G&–æp¢öÆV6U÷6V6öæG3¢çVÖ&W ¢öÆ—fVÖöFS¢&ööÆVà¢öö&¦V7Eö–C¢7G&–æp¢÷7G&—Uö66÷VçEö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢Ç&VG•÷&ö6W76VC¢&ööÆVà¢GFV×Eö6÷VçC¢çVÖ&W ¢6Æ–Õ÷Fö¶Vã¢7G&–æp¢6Æ–ÖVC¢&ööÆVà¢–å÷&öw&W73¢&ööÆVà¢ÕµÐ¢Ð¢6ÆV%öWFƒ¢²&w3¢æWfW#²&WGW&ç3¢VæFVf–æVBÐ¢6Æ÷6U÷v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öã¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö6÷'&V7F–öå÷6W76–öåö–C¢7G&–æp¢öÖWFFFó¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢6Æ÷6VEöC¢7G&–ærÂçVÆÀ¢6Æ÷6VEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–çfö–6U÷fW'6–öåö–C¢7G&–ærÂçVÆÀ¢ÖWFFF¢§6öà¢÷VæVEöC¢7G&–æp¢÷VæVEö'“¢7G&–ærÂçVÆÀ¢÷W&F–öåö¶W“¢7G&–æp¢&V6öã¢7G&–æp¢66÷S¢7G&–æp¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢6ö×ÆWFUö•÷&÷WFU÷V÷F¢°¢&w3¢°¢ö7F÷%ö–C¢7G&–æp¢ö7GVÅö6÷7E÷W6C¢çVÖ&W ¢öfVGW&S¢7G&–æp¢÷&V6V—Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7V66VVFVC¢&ööÆVà¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢6ö×ÆWFUö6æöæ–6Å÷6†–gC¢°¢&w3¢°¢÷&öf–ÆUö–C¢7G&–æp¢÷6†–gEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F–ÖW7F×ó¢7G&–æp¢÷W6W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢VæE÷F–ÖS¢7G&–æp¢–C¢7G&–æp¢–ç6W'FVEöWfVçG3¢§6öà¢6†÷ö–C¢7G&–æp¢7F'E÷F–ÖS¢7G&–æp¢7FGW3¢7G&–æp¢W6W%ö–C¢7G&–æp¢ÕµÐ¢Ð¢6ö×ÆWFUöW7F–ÖFU÷'G5÷V÷FUöFöÖ–3¢°¢&w3¢°¢öW‡V7FVE÷&Wf—6–öã¢çVÖ&W ¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6ö×ÆWFUöf–ææ6–Åö÷WF&÷…ö6Æ–Ó¢°¢&w3¢²ö÷WF&÷…ö–C¢7G&–æs²÷v÷&¶W%ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6ö×ÆWFU÷66†VGVÆVE÷6†–gEöVæEöFöÖ–3¢°¢&w3¢°¢öW†V7WF–öå÷F–ÖSó¢7G&–æp¢÷66†VGVÆUöFFSó¢7G&–æp¢÷66†VGVÆU÷6÷W&6Só¢7G&–æp¢÷66†VGVÆVEöVæC¢7G&–æp¢÷6†–gEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷W6W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6ö×ÆWFU÷7G&—U÷vV&†ööµöWfVçC¢°¢&w3¢²ö6Æ–Õ÷Fö¶Vã¢7G&–æs²öWfVçEö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6öç7VÖUövVçEö‡VÖåö&÷fÅö–çFVçC¢°¢&w3¢°¢ö&÷fÅö¶–æC¢7G&–æp¢ö&÷fW%÷W6W%ö–C¢7G&–æp¢öVæv–æVW&–æuö66Uö–C¢7G&–æp¢öÖ—76–öåö–Có¢7G&–æp¢÷Fö¶Vå÷6†#Sc¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢6öç7VÖUö•÷&÷WFU÷V÷F¢°¢&w3¢°¢ö7F÷%ö–C¢7G&–æp¢ö7F÷%öÖƒ¢çVÖ&W ¢öfVGW&S¢7G&–æp¢ö†&Eö'VFvWE÷W6C¢çVÖ&W ¢÷&W6W'fF–öåö6÷7E÷W6C¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷6†÷öÖƒ¢çVÖ&W ¢÷v–æF÷u÷6V6öæG3¢çVÖ&W ¢Ð¢&WGW&ç3¢°¢ÆÆ÷vVC¢&ööÆVà¢FVæ–Å÷&V6öã¢7G&–æp¢&V6V—Eö–C¢7G&–æp¢&WG'•ögFW%÷6V6öæG3¢çVÖ&W ¢ÕµÐ¢Ð¢6öç7VÖU÷fV†–6ÆU÷&V6ÆÅöfWF6…÷V÷F¢°¢&w3¢²ö7F÷%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–æs²÷fV†–6ÆUö–C¢7G&–ærÐ¢&WGW&ç3¢°¢ÆÆ÷vVC¢&ööÆVà¢&WG'•ögFW%÷6V6öæG3¢çVÖ&W ¢ÕµÐ¢Ð¢6öçfW'EöfÆVWE÷6W'f–6U÷&WVW7E÷Fõ÷v÷&µö÷&FW%öFöÖ–3¢°¢&w3¢²÷6W'f–6U÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢°¢6öçfW'6–öå÷7FGW3¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢ÕµÐ¢Ð¢6öçfW'Eö÷væVEöfÆVWE÷6W'f–6U÷&WVW7E÷Fõ÷v÷&µö÷&FW%öFöÖ–3¢°¢&w3¢²÷6W'f–6U÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢°¢6öçfW'6–öå÷7FGW3¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢ÕµÐ¢Ð¢6÷'&V7E÷v÷&µö÷&FW%öÆ–æUöÆ&÷%÷6VvÖVçC¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öVæFVEöC¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6VvÖVçEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'FVEöC¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFUö7F÷%öÖW76v–æuö6öçfW'6F–öã¢°¢&w3¢°¢ö&öö¶–æuö–C¢7G&–æp¢ö6†ææVÃ¢7G&–æp¢ö6öçFW‡Eö–C¢7G&–æp¢ö6öçFW‡E÷G—S¢7G&–æp¢ö6öçfW'6F–öåö–C¢7G&–æp¢ö7&VFVEö'“¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢÷'F–6—çG3¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷F—FÆS¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢7&VFUö7W7FöÖW%ö66÷VçEöFöÖ–3¢°¢&w3¢°¢ö66÷VçE÷G—S¢7G&–æp¢ö7F÷%÷W6W%ö–Có¢7G&–æp¢öFG&W73ó¢7G&–æp¢öÆÆ÷uöGWÆ–6FSó¢&ööÆVà¢ö'W6–æW75öæÖSó¢7G&–æp¢ö6—G“ó¢7G&–æp¢öVÖ–Ãó¢7G&–æp¢öÖF6…öW†—7F–æsó¢&ööÆVà¢öæÖS¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢ö÷W&F–öåö¶W“ó¢7G&–æp¢÷†öæSó¢7G&–æp¢÷÷7FÅö6öFSó¢7G&–æp¢÷&÷f–æ6Só¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷f–ãó¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFUö7W7FöÖW%÷&–6–æuöw&VVÖVçEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö&÷fÅ÷&V6öã¢7G&–æp¢öCó¢7G&–æp¢ö7W'&Væ7“¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öVffV7F—fUög&öÓ¢7G&–æp¢öVffV7F—fU÷VçF–Ã¢7G&–æp¢öÆ&÷%öF—66÷VçE÷W&6VçC¢çVÖ&W ¢öÆ&÷%÷&FS¢çVÖ&W ¢öæÖS¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'G5öF—66÷VçE÷W&6VçC¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6U÷G—S¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFUö7W7FöÖW%÷&–6–æuöw&VVÖVçE÷c%öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö&÷fÅ÷&V6öã¢7G&–æp¢öCó¢7G&–æp¢ö7W'&Væ7“¢7G&–æp¢ö7W7FöÖW%öfVUö6¢çVÖ&W ¢ö7W7FöÖW%öfVU÷G—S¢7G&–æp¢ö7W7FöÖW%öfVU÷fÇVS¢çVÖ&W ¢ö7W7FöÖW%ö–C¢7G&–æp¢öVffV7F—fUög&öÓ¢7G&–æp¢öVffV7F—fU÷VçF–Ã¢7G&–æp¢öW‡—'•÷v&æ–æuöF—3¢çVÖ&W ¢öÆ&÷%öF—66÷VçE÷W&6VçC¢çVÖ&W ¢öÆ&÷%÷&FS¢çVÖ&W ¢öÖ–æ–×VÕ÷'G5öÖ&v–å÷W&6VçC¢çVÖ&W ¢öæÖS¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'G5öF—66÷VçE÷W&6VçC¢çVÖ&W ¢÷'G5öÖ&·WöÖG&—ƒ¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6U÷G—S¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFUöW7F–ÖFUöFöÖ–3¢°¢&w3¢°¢ö7W7FöÖW#¢§6öà¢öW‡—&W5öC¢7G&–æp¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆ–æW3¢§6öà¢öæ÷FW3¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷fV†–6ÆS¢§6öà¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFUöfÆVWE÷6W'f–6U÷&WVW7EöFöÖ–3¢°¢&w3¢°¢öfÆVWEö–C¢7G&–æp¢öÆ–æW3¢§6öà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&WVW7FVEöf÷%öFFS¢7G&–æp¢÷7VÖÖ'“¢7G&–æp¢÷F—FÆS¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢7&VFUöÖçVÅ÷v÷&µö÷&FW%öÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öWF†VçF–6FVE÷W6W%ö–C¢7G&–æp¢ö6ö×Æ–çC¢7G&–æp¢ö6÷'&V7F–öã¢7G&–æp¢öÆ&÷%÷F–ÖS¢çVÖ&W ¢öÆ–æUö–C¢7G&–æp¢÷'G5÷FW‡C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷W&vVæ7“¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFUöÖVçUö—FVÕ÷v—F…÷'G5ö–çF¶S¢°¢&w3¢°¢ö7F÷%öWF…÷W6W%ö–C¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢ö—FVÓ¢§6öà¢÷'G3¢§6öà¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFUöÖW76v–æuö6öçfW'6F–öã¢°¢&w3¢°¢ö&öö¶–æuö–C¢7G&–æp¢ö6†ææVÃ¢7G&–æp¢ö6öçFW‡Eö–C¢7G&–æp¢ö6öçFW‡E÷G—S¢7G&–æp¢ö6öçfW'6F–öåö–C¢7G&–æp¢ö7&VFVEö'“¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢÷'F–6—çEö¶–æG3¢7G&–æuµÐ¢÷'F–6—çE÷W6W%ö–G3¢7G&–æuµÐ¢÷6†÷ö–C¢7G&–æp¢÷F—FÆS¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢7&VFU÷'E÷&WVW7E÷v—F…ö—FV×3¢°¢&w3¢°¢ö—FV×3¢§6öà¢ö¦ö%ö–Có¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢7&VFU÷÷'FÅ÷V÷FU÷&WVW7EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öFW67&—F–öã¢7G&–æp¢ögVÆf–ÆÆÖVçC¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7Eö¶–æC¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7&VFU÷v÷&µö÷&FW%÷v—F…ö7W7FöÕö–C¢°¢&w3¢°¢öGf—6÷%ö–Có¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢ö—5÷v—FW#ó¢&ööÆVà¢öæ÷FW3ó¢7G&–æp¢÷&–÷&—G“ó¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢Gf—6÷%ö–C¢7G&–ærÂçVÆÀ¢&÷fÅ÷7FFS¢7G&–ærÂçVÆÀ¢&6†—fVEöC¢7G&–ærÂçVÆÀ¢&6†—fVEö'•÷W6W%ö–C¢7G&–ærÂçVÆÀ¢76–væVE÷FV6ƒ¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–ærÂçVÆÀ¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢7W7FöÕö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%öw&VVEöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷Fƒ¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fÅ÷6–væGW&U÷W&Ã¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö&÷fVEö'“¢7G&–ærÂçVÆÀ¢7W7FöÖW%ö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%öæÖS¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVUöw&VVÖVçEö–C¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷&W6öÇfVEöC¢7G&–ærÂçVÆÀ¢7W7FöÖW%÷&–6–æuöfVU÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢7W7FöÖW%÷6–væGW&U÷W&Ã¢7G&–ærÂçVÆÀ¢W7F–ÖFUöWF†÷&—¦VEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFUö6öçfW'FVEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFUö7&VFVEö'“¢7G&–ærÂçVÆÀ¢W7F–ÖFUöW‡—&W5öC¢7G&–ærÂçVÆÀ¢W7F–ÖFUöçVÖ&W#¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷'G5ö6ö×ÆWFVEö'“¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷&Wf—6–öã¢çVÖ&W ¢W7F–ÖFU÷6VçEöC¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷6VçEö'“¢7G&–ærÂçVÆÀ¢W7F–ÖFU÷7FGW3¢7G&–ærÂçVÆÀ¢W‡V7FVEö6ö×ÆWF–öåöC¢7G&–ærÂçVÆÀ¢W‡FW&æÅö–C¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–×÷'Eö6öæf–FVæ6S¢çVÖ&W"ÂçVÆÀ¢–×÷'Eöæ÷FW3¢7G&–ærÂçVÆÀ¢–ç7V7F–öåö–C¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷Fe÷W&Ã¢7G&–ærÂçVÆÀ¢–ç7V7F–öå÷G—S¢7G&–ærÂçVÆÀ¢–çF¶Uö§6öã¢§6öâÂçVÆÀ¢–çF¶U÷7FGW3¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEöC¢7G&–ærÂçVÆÀ¢–çF¶U÷7V&Ö—GFVEö'“¢7G&–ærÂçVÆÀ¢–çfö–6UöÆ7E÷6VçE÷Fó¢7G&–ærÂçVÆÀ¢–çfö–6U÷Fe÷W&Ã¢7G&–ærÂçVÆÀ¢–çfö–6U÷6VçEöC¢7G&–ærÂçVÆÀ¢–çfö–6U÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢–çfö–6U÷W&Ã¢7G&–ærÂçVÆÀ¢—5÷v—FW#¢&ööÆVà¢Æ&÷%÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢æ÷FW3¢7G&–ærÂçVÆÀ¢öFöÖWFW%ö¶Ó¢çVÖ&W"ÂçVÆÀ¢÷WG7FæF–æuö&Ææ6S¢çVÖ&W ¢–EöC¢7G&–ærÂçVÆÀ¢'G5÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢–ÖVçE÷7FGW3¢7G&–æp¢÷'FÅ÷7V&Ö—GFVEöC¢7G&–ærÂçVÆÀ¢&–÷&—G“¢çVÖ&W"ÂçVÆÀ¢V÷FS¢§6öâÂçVÆÀ¢V÷FU÷W&Ã¢7G&–ærÂçVÆÀ¢&V6÷&E÷G—S¢7G&–æp¢66†VGVÆVEöC¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢6†÷÷7WÆ–W5öÖ÷VçEö÷fW'&–FS¢çVÖ&W"ÂçVÆÀ¢6†÷÷7WÆ–W5öVæ&ÆVEö÷fW'&–FS¢&ööÆVâÂçVÆÀ¢6÷W&6UöfÆVWE÷&öw&Õö–C¢7G&–ærÂçVÆÀ¢6÷W&6UöfÆVWE÷6W'f–6U÷&WVW7Eö–C¢7G&–ærÂçVÆÀ¢6÷W&6Uö–çF¶Uö–C¢7G&–ærÂçVÆÀ¢6÷W&6U÷&÷uö–C¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢G—S¢7G&–ærÂçVÆÀ¢WFFVEöC¢7G&–ærÂçVÆÀ¢W6W%ö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö6öÆ÷#¢7G&–ærÂçVÆÀ¢fV†–6ÆUöG&—fWG&–ã¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æS¢7G&–ærÂçVÆÀ¢fV†–6ÆUöVæv–æUö†÷W'3¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUögVVÅ÷G—S¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–C¢7G&–ærÂçVÆÀ¢fV†–6ÆUö–æfó¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÆ–6Vç6U÷ÆFS¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ¶S¢7G&–ærÂçVÆÀ¢fV†–6ÆUöÖ–ÆVvS¢çVÖ&W"ÂçVÆÀ¢fV†–6ÆUöÖöFVÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷7V&ÖöFVÃ¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷G&ç6Ö—76–öã¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷Væ—EöçVÖ&W#¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷f–ã¢7G&–ærÂçVÆÀ¢fV†–6ÆU÷–V#¢çVÖ&W"ÂçVÆÀ¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'v÷&µö÷&FW'2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢7W'&VçE÷6†÷ö–C¢²&w3¢æWfW#²&WGW&ç3¢7G&–ærÐ¢FVÆWFUöÖVçUö—FVÕ÷v—F…÷'G5ö–çF¶S¢°¢&w3¢°¢ö7F÷%öWF…÷W6W%ö–C¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öÖVçUö—FVÕö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢F—7F6…ö7F÷%÷&öf–ÆUö–C¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢F—7F6…ö76–vå÷6W'f–6U÷f—6—EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö76–væVE÷W6W%ö–C¢7G&–æp¢öW‡V7FVE÷fW'6–öã¢çVÖ&W ¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷f—6—Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢F—7F6…ö&ö&E÷6æ6†÷C¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v–æF÷uöVæC¢7G&–æp¢÷v–æF÷u÷7F'C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢F—7F6…ö6åöW†V7WFS¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–æs²÷f—6—Eö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢F—7F6…ö6åöÖævS¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢F—7F6…ö7&VFU÷6W'f–6U÷f—6—EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö76–væVE÷W6W%ö–C¢7G&–æp¢ö&öö¶–æuö–C¢7G&–æp¢öF—7F6…öæ÷FW3¢7G&–æp¢öW7F–ÖFVEöF—7Fæ6Uö¶Ó¢çVÖ&W ¢öW7F–ÖFVE÷G&fVÅöÖ–çWFW3¢çVÖ&W ¢öÖöFS¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷66†VGVÆVEöVæC¢7G&–æp¢÷66†VGVÆVE÷7F'C¢7G&–æp¢÷6W'f–6UöFG&W75ö–C¢7G&–æp¢÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢F—7F6…öÖö&–ÆUö7F—fU÷6æ6†÷C¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢F—7F6…÷&V6÷&E÷f—6—EöWfVçC¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öWfVçE÷G—S¢7G&–æp¢ög&öÕ÷7FGW3ó¢7G&–æp¢öÖWFFFó¢§6öà¢÷Fõ÷7FGW3ó¢7G&–æp¢÷f—6—Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢VæFVf–æV@¢Ð¢F—7F6…÷&W66†VGVÆU÷6W'f–6U÷f—6—EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öVæG5öC¢7G&–æp¢öW‡V7FVE÷fW'6–öã¢çVÖ&W ¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷f—6—Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢F—7F6…÷7–æ5öWfVçE÷7FGW3¢°¢&w3¢²÷f—6—Eö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢F—7F6…÷7–æ5÷&–Ö'•÷&W6÷W&6S¢°¢&w3¢²÷f—6—Eö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢F—7F6…÷7–æ5÷FV6†æ–6–å÷&W6W'fF–öã¢°¢&w3¢²÷f—6—Eö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢F—7F6…÷G&ç6—F–öå÷6W'f–6U÷f—6—EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö7GVÅöF—7Fæ6Uö¶Ó¢çVÖ&W ¢ö7GVÅ÷G&fVÅöÖ–çWFW3¢çVÖ&W ¢öW‡V7FVE÷fW'6–öã¢çVÖ&W ¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷Fõ÷7FGW3¢7G&–æp¢÷f—6—Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢F—7F6…÷WFFU÷6W'f–6U÷f—6—EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öF—7F6…öæ÷FW3¢7G&–æp¢öW7F–ÖFVEöF—7Fæ6Uö¶Ó¢çVÖ&W ¢öW7F–ÖFVE÷G&fVÅöÖ–çWFW3¢çVÖ&W ¢öW‡V7FVE÷fW'6–öã¢çVÖ&W ¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6W'f–6UöFG&W75ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷f—6—Eö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢F—7F6…÷f—6—Eö†—7F÷'“¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–æs²÷f—6—Eö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢F—7F6…÷f—6—E÷6æ6†÷C¢²&w3¢²÷f—6—Eö–C¢7G&–ærÓ²&WGW&ç3¢§6öâÐ¢W7F–ÖFUö7F÷%öf÷%÷6†÷¢°¢&w3¢²öÆÆ÷vVE÷&öÆW3¢7G&–æuµÓ²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢°¢6æöæ–6Å÷&öÆS¢7G&–æp¢&öf–ÆUö–C¢7G&–æp¢ÕµÐ¢Ð¢WfÇVFUöfÆVWE÷ÕöGVUöWfVçG3¢°¢&w3¢²öfÆVWEö–C¢7G&–æs²÷fV†–6ÆUö–Có¢7G&–ærÐ¢&WGW&ç3¢°¢7&VFVC¢&ööÆVà¢GVUöWfVçEö–C¢7G&–æp¢öÆ–7•ö–C¢7G&–æp¢fV†–6ÆUö–C¢7G&–æp¢ÕµÐ¢Ð¢WfÇVFUöfÆVWE÷&WG&—ö6ö×Æ–æ6S¢°¢&w3¢²öCó¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢f–Å÷7G&—U÷vV&†ööµöWfVçC¢°¢&w3¢²ö6Æ–Õ÷Fö¶Vã¢7G&–æs²öW'&÷#¢7G&–æs²öWfVçEö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢f–VÆEö7F÷%ö6åö66W75÷6W'f–6U÷fV†–6ÆS¢°¢&w3¢²÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢f–VÆEö76–vå÷6W'f–6U÷fV†–6ÆS¢°¢&w3¢°¢÷&öf–ÆUö–C¢7G&–æp¢÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆEö6öæf–wW&U÷7FæFÆöæUö÷væW%öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öFVfVÇE÷f—6—EöÖ–çWFW3¢çVÖ&W ¢öF—7F6…öVæ&ÆVC¢&ööÆVà¢öVæ&ÆUö7W'&VçEö7F÷%öf–VÆEö÷W&F÷#¢&ööÆVà¢öf–VÆEö÷W&F÷%ö6÷VçE÷F&vWC¢çVÖ&W ¢÷6W'f–6UöÖöFVÃ¢7G&–æp¢÷6W'f–6U÷fV†–6ÆUöæÖS¢7G&–æp¢÷6W'f–6U÷fV†–6ÆU÷Væ—EöçVÖ&W#¢7G&–æp¢÷6W'f–6U÷fV†–6ÆW5öVæ&ÆVC¢&ööÆVà¢÷6†÷ö–C¢7G&–æp¢÷6öÆõöÖöFS¢&ööÆVà¢÷G'V6µö–çfVçF÷'•öVæ&ÆVC¢&ööÆVà¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷&V6V—fU÷õ÷'E÷Fõ÷G'V6µöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷W&6†6Uö÷&FW%ö–C¢7G&–æp¢÷W&6†6Uö÷&FW%öÆ–æUö–C¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷&W6öÇfUö÷%ö7&VFU÷'Eö–FVçF—G•öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö6öFS¢7G&–æp¢ö6öææV7F–öåö–Có¢7G&–æp¢ö7&VFUö–eöÖ—76–æsó¢&ööÆVà¢öW‡FW&æÅö–Có¢7G&–æp¢öÖçVf7GW&W#ó¢7G&–æp¢öÖWFFFó¢§6öà¢öæÖSó¢7G&–æp¢ö÷W&F–öåö¶W“ó¢7G&–æp¢÷6¶vU÷VçF—G“ó¢çVÖ&W ¢÷'EöçVÖ&W#ó¢7G&–æp¢÷&÷f–FW#ó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7WÆ–W%ö–Có¢7G&–æp¢÷7WÆ–W%÷6·Só¢7G&–æp¢÷Væ—Eö6÷7Có¢çVÖ&W ¢÷Væ—EööeöÖV7W&Só¢7G&–æp¢÷Væ—E÷6VÆÅ÷&–6Só¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷&WGW&å÷G'V6µ÷'EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷6W'f–6U÷f—6—Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%÷'Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷6W'f–6U÷fV†–6ÆUö76–væÖVçE÷V&çF–æU÷&W÷'C¢°¢&w3¢²öÆ–Ö—Có¢çVÖ&W#²÷6†÷ö–Có¢7G&–ærÐ¢&WGW&ç3¢°¢76–væVEö'•÷&öf–ÆUö–C¢7G&–æp¢76–væÖVçEö7&VFVEöC¢7G&–æp¢76–væÖVçE÷WFFVEöC¢7G&–æp¢&öf–ÆUö–C¢7G&–æp¢V&çF–æUö–C¢çVÖ&W ¢V&çF–æVEöC¢7G&–æp¢&V6öã¢7G&–æp¢6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢6÷W&6UöÖ–w&F–öã¢7G&–æp¢ÕµÐ¢Ð¢f–VÆE÷7F÷&vU÷F…÷WV–C¢²&w3¢²÷fÇVS¢7G&–ærÓ²&WGW&ç3¢7G&–ærÐ¢f–VÆE÷G&ç6fW%÷7Fö6µ÷Fõ÷G'V6µöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6UöÆö6F–öåö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷G&ç6fW%÷7Fö6µ÷Fõ÷G'V6µöWF†÷&—¦VEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6UöÆö6F–öåö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷G&ç6—F–öå÷G'V6µ÷&V6÷&C¢°¢&w3¢²ö7F–öã¢7G&–æs²öVæFVEöCó¢7G&–æs²÷&V6÷&Eö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷G'V6µö–çfVçF÷'•ö7F—f—G“¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆ–Ö—Có¢çVÖ&W ¢÷6W'f–6U÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷G'V6µö–çfVçF÷'•÷6æ6†÷C¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷VW'“ó¢7G&–æp¢÷6W'f–6U÷fV†–6ÆUö–Có¢7G&–æp¢÷6W'f–6U÷f—6—Eö–Có¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷G'V6µö–çfVçF÷'•÷6æ6†÷E÷v—F…ö7F—f—G“¢°¢&w3¢°¢ö7F—f—G•öÆ–Ö—Có¢çVÖ&W ¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷VW'“ó¢7G&–æp¢÷6W'f–6U÷fV†–6ÆUö–Có¢7G&–æp¢÷6W'f–6U÷f—6—Eö–Có¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–VÆE÷W6U÷G'V6µ÷'EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷6W'f–6U÷f—6—Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–æÆ—¦UöW7F–ÖFU÷6VæEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öWfVçEö–C¢7G&–æp¢÷V÷FU÷W&Ã¢7G&–æp¢÷&Wf—6–öã¢çVÖ&W ¢÷6VçEöC¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–æÆ—¦Uö–ç7V7F–öå÷FeöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öW‡V7FVE÷7–æ5÷&Wf—6–öã¢çVÖ&W ¢ö–ç7V7F–öåö–C¢7G&–æp¢÷Fe÷6†#Sc¢7G&–æp¢÷Fe÷7F÷&vU÷Fƒ¢7G&–æp¢÷Fe÷W&Ã¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–æÆ—¦Uö–çfö–6U÷fW'6–öã¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö7W'&Væ7“¢7G&–æp¢öF—66÷VçE÷F÷FÃ¢çVÖ&W ¢ö–çfö–6Uö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6æ6†÷C¢§6öà¢÷7V'F÷FÃ¢çVÖ&W ¢÷F…÷F÷FÃ¢çVÖ&W ¢÷F÷FÃ¢çVÖ&W ¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢7&VFVEöC¢7G&–æp¢7W'&Væ7“¢7G&–æp¢F—66÷VçE÷F÷FÃ¢çVÖ&W ¢–C¢7G&–æp¢–çfö–6Uö–C¢7G&–ærÂçVÆÀ¢—77VVEöC¢7G&–ærÂçVÆÀ¢—77VVEö'“¢7G&–ærÂçVÆÀ¢Æ–fV7–6ÆU÷7FGW3¢7G&–æp¢÷WG7FæF–æu÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢–E÷F÷FÃ¢çVÖ&W ¢&VgVæFVE÷F÷FÃ¢çVÖ&W ¢6†÷ö–C¢7G&–æp¢6æ6†÷C¢§6öà¢6æ6†÷Eö†6ƒ¢7G&–æp¢7V'F÷FÃ¢çVÖ&W ¢7WW'6VFVEö'•ö–çfö–6U÷fW'6–öåö–C¢7G&–ærÂçVÆÀ¢7WW'6VFW5ö–çfö–6U÷fW'6–öåö–C¢7G&–ærÂçVÆÀ¢F…÷F÷FÃ¢çVÖ&W ¢F÷FÃ¢çVÖ&W ¢WFFVEöC¢7G&–æp¢fW'6–öåöçVÖ&W#¢çVÖ&W ¢fö–E÷&V6öã¢7G&–ærÂçVÆÀ¢fö–FVEöC¢7G&–ærÂçVÆÀ¢fö–FVEö'“¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢&–çfö–6U÷fW'6–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢f–æÆ—¦U÷—&öÆÅöW‡÷'EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö&F6…ö–C¢7G&–æp¢öf–ÆU÷6†#Sc¢7G&–æp¢öf–ÆU÷6—¦Uö'—FW3¢çVÖ&W ¢÷W&–öEö–C¢7G&–æp¢÷&÷f–FW%÷FV×ÆFU÷fW'6–öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F÷&vUö'V6¶WC¢7G&–æp¢÷7F÷&vU÷Fƒ¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–æEö7W7FöÖW%ö66÷VçEöGWÆ–6FW3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–Có¢7G&–æp¢ö'W6–æW75öæÖSó¢7G&–æp¢öVÖ–Ãó¢7G&–æp¢öW†6ÇVFUö7W7FöÖW%ö–Có¢7G&–æp¢öæÖSó¢7G&–æp¢÷†öæSó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷f–ãó¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–æ—6…ö6ö×ÆWFVE÷&W—%öÆV&æ–æuöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢öÆV6U÷Fö¶Vã¢7G&–æp¢÷&W7VÇCó¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷7V66VVFVC¢&ööÆVà¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f–æ—6…ö6ö×ÆWFVE÷&W—%öÆV&æ–æu÷v÷&¶W#¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆV6U÷Fö¶Vã¢7G&–æp¢÷&W7VÇCó¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷7V66VVFVC¢&ööÆVà¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢f—'7E÷6VvÖVçE÷WV–C¢²&w3¢²¢7G&–ærÓ²&WGW&ç3¢7G&–ærÐ¢fÆVWEöFVfV7EöFW67&—F÷#¢²&w3¢²ö¶W“¢7G&–ærÓ²&WGW&ç3¢§6öâÐ¢vWEö7W7FöÖW%ö66÷VçEö6VçFW#¢°¢&w3¢°¢ö7F÷%÷W6W%ö–Có¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢vWEö7W7FöÖW%÷&–6–æuö66÷VçE÷7VÖÖ'“¢°¢&w3¢²öCó¢7G&–æs²ö7W7FöÖW%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢vWEöfÆVWEöFVfV7E÷VWVS¢²&w3¢²öfÆVWEö–Có¢7G&–ærÓ²&WGW&ç3¢§6öâÐ¢vWEö–çfö–6UöæWEö—77VVE÷'G3¢°¢&w3¢²÷6†÷ö–C¢7G&–æs²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢vWEö÷W&F–öæÅöö'6W'f&–Æ—G•ö†VÇFƒ¢°¢&w3¢²öæ÷só¢7G&–ærÐ¢&WGW&ç3¢°¢•ö7F—fU÷&V6öÖÖVæFF–öåö6÷VçC¢çVÖ&W ¢•ö7&öå÷&ö&&Ç•÷'Vææ–æs¢&ööÆVà¢•öÆ7EöW‡—&F–öåöWfVçEöC¢7G&–æp¢•÷VæF–æuö&÷fÅö6÷VçC¢çVÖ&W ¢•÷7FÆU÷&V6öÖÖVæFF–öåö6÷VçC¢çVÖ&W ¢WfVçG5öÆ7Eó#Fƒ¢çVÖ&W ¢WfVçG5öÆ7Eófƒ¢çVÖ&W ¢WfVçG5÷&Wf–÷W5ó#Fƒ¢çVÖ&W ¢†VÇF…÷7FGW3¢7G&–æp¢Æ7EöWfVçEöC¢7G&–æp¢&V6VçEö'W6–æW75÷w&—FW3¢çVÖ&W ¢6†÷ö–C¢7G&–æp¢Vç&W6öÇfVEöf–ÇW&Uö6÷VçC¢çVÖ&W ¢ÕµÐ¢Ð¢vWE÷v÷&µö÷&FW%ö76–væÖVçG3¢°¢&w3¢²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢°¢gVÆÅöæÖS¢7G&–æp¢†5ö7F—fS¢&ööÆVà¢&öÆS¢7G&–æp¢FV6†æ–6–åö–C¢7G&–æp¢ÕµÐ¢Ð¢†5ö6öÇVÖã¢²&w3¢²ö6öÃ¢7G&–æs²÷F&ÆS¢Væ¶æ÷vâÓ²&WGW&ç3¢&ööÆVâÐ¢–×÷'Eö–ç7V7F–öå÷V÷FU÷6¶vUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö–ç7V7F–öåö–C¢7G&–æp¢ö—FV×3¢§6öà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&WVW7FVE÷fV†–6ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢–æ7&VÖVçE÷W6W%öÆ–Ö—C¢°¢&w3¢²–æ7&VÖVçEö'“ó¢çVÖ&W#²–çWE÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢–ç6W'Eö•öWfVçC¢°¢&w3¢°¢öVçF—G•ö–Có¢7G&–æp¢öVçF—G•÷F&ÆSó¢7G&–æp¢öWfVçE÷G—S¢7G&–æp¢÷–ÆöC¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷G&–æ–æu÷6÷W&6Só¢7G&–æp¢÷W6W%ö–Có¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢–çfö–6Uö—5ö†—7F÷&–6Åö–×÷'C¢°¢&w3¢²öÖWFFF¢§6öâÐ¢&WGW&ç3¢&ööÆVà¢Ð¢—5övVçEöFWfVÆ÷W#¢²&w3¢æWfW#²&WGW&ç3¢&ööÆVâÐ¢—5ö7W7FöÖW#¢²&w3¢²ö7W7FöÖW#¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢—5÷6†÷öÖVÖ&W#¢²&w3¢²÷6†÷¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢—5÷6†÷öÖVÖ&W%÷c#¢²&w3¢²6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢—5÷7Ffeöf÷%÷6†÷¢²&w3¢²÷6†÷¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢ÖævUöfÆVWEöG&—fW%ö–çF¶S¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F–öåöFFSó¢7G&–æp¢öFVfV7Eö–G3¢7G&–æuµÐ¢÷&V6öãó¢7G&–æp¢÷&W6öÇWF–öåö6öFSó¢7G&–æp¢÷&W7öç6U÷G—Só¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢ÖævUöfÆVWE÷Õ÷&öw&Ó¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö76–væÖVçEöÖöFS¢7G&–æp¢ö6FVæ6S¢7G&–æp¢öfÆVWEö–C¢7G&–æp¢ö–çFW'fÅöF—3¢çVÖ&W ¢ö–çFW'fÅö†÷W'3¢çVÖ&W ¢ö–çFW'fÅö¶Ó¢çVÖ&W ¢öæÖS¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&öw&Õö–C¢7G&–æp¢÷&WV—&W5öfÆVWEö&÷fÃ¢&ööÆVà¢÷F6·3¢§6öà¢÷fV†–6ÆUö–G3¢7G&–æuµÐ¢Ð¢&WGW&ç3¢§6öà¢Ð¢ÖævUöfÆVWE÷Væ—EöFVfV7G3¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢öFVfV7Eö–G3¢7G&–æuµÐ¢öFVfW'&VE÷VçF–Ãó¢7G&–æp¢÷&V6öãó¢7G&–æp¢÷&WVW7FVEöf÷%öFFSó¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢ÖævUöfÆVWE÷Væ—EöVç&öÆÆÖVçC¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢öG&—fW%÷&öf–ÆUö–Có¢7G&–æp¢öfÆVWEö–C¢7G&–æp¢öÆ–6Vç6U÷ÆFSó¢7G&–æp¢öÖ¶Só¢7G&–æp¢öÖöFVÃó¢7G&–æp¢öæ–6¶æÖSó¢7G&–æp¢÷&WG&—öGVUöÆö6Å÷F–ÖSó¢7G&–æp¢÷&÷WFUöÆ&VÃó¢7G&–æp¢÷Væ—EöçVÖ&W#ó¢7G&–æp¢÷fV†–6ÆUö–Có¢7G&–æp¢÷f–ãó¢7G&–æp¢÷–V#ó¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢ÖævUöfÆVWE÷v÷&·76S¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö6öçF7EöVÖ–Ãó¢7G&–æp¢ö6öçF7EöæÖSó¢7G&–æp¢ö6öçF7E÷†öæSó¢7G&–æp¢öfÆVWEö–C¢7G&–æp¢öÖVÖ&W%÷W6W%ö–Có¢7G&–æp¢öæÖSó¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢÷&öÆSó¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Ö&µö7F—fS¢²&w3¢æWfW#²&WGW&ç3¢VæFVf–æVBÐ¢Ö&µöÆÅ÷÷'FÅöæ÷F–f–6F–öç5÷&VC¢²&w3¢æWfW#²&WGW&ç3¢çVÖ&W"Ð¢Ö&µö76—7FçEöæ÷F–f–6F–öå÷G'W7FVE÷w&—FW%÷&öÆÆ÷WC¢°¢&w3¢²öFWÆ÷–ÖVçEö–Có¢7G&–æs²öFWÆ÷–ÖVçE÷6†¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢Ö&µöf–ææ6–Åö÷WF&÷…öFVÆ—fW'•öÖ&–wV÷W3¢°¢&w3¢²öFVÆ—fW'•ö–C¢7G&–æs²öW'&÷#¢7G&–æs²÷v÷&¶W%ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Ö&µ÷÷'FÅöæ÷F–f–6F–öå÷&VC¢°¢&w3¢²öæ÷F–f–6F–öåö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢Ö&µ÷v÷&µö÷&FW%÷&VG•öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢ÖF6…öÆV&æVEö¦ö%÷FV×ÆFW3¢°¢&w3¢²öVÖ&VFF–æs¢7G&–æs²öÖF6…ö6÷VçCó¢çVÖ&W#²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢°¢6öæf–FVæ6U÷66÷&S¢çVÖ&W ¢FVfVÇEöÆ&÷%ö†÷W'3¢çVÖ&W ¢FVfVÇE÷'G3¢§6öà¢–C¢7G&–æp¢¦ö%ö6FVv÷'“¢7G&–æp¢Æ&VÃ¢7G&–æp¢6–Ö–Æ&—G“¢çVÖ&W ¢Fw3¢§6öà¢W6vUö6÷VçC¢çVÖ&W ¢ÕµÐ¢Ð¢ÖF6…÷v÷&µö÷&FW%ö–çFVÆÆ–vVæ6S¢°¢&w3¢²öVÖ&VFF–æs¢7G&–æs²öÖF6…ö6÷VçCó¢çVÖ&W#²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢°¢6W6S¢7G&–æp¢6ö×Æ–çC¢7G&–æp¢6÷'&V7F–öã¢7G&–æp¢–C¢7G&–æp¢¦ö%ö6FVv÷'“¢7G&–æp¢Æ&÷%÷F–ÖS¢çVÖ&W ¢'G3¢§6öà¢6–Ö–Æ&—G“¢çVÖ&W ¢7–×FöÓ¢7G&–æp¢Fw3¢§6öà¢fV†–6ÆUöÖ¶S¢7G&–æp¢fV†–6ÆUöÖöFVÃ¢7G&–æp¢fV†–6ÆU÷–V#¢çVÖ&W ¢ÕµÐ¢Ð¢ÖFW&–Æ—¦UööffÆ–æU÷'G5÷&WVW7EöG&gEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷–ÆöC¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢ÖFW&–Æ—¦UööffÆ–æU÷v÷&µö÷&FW%öG&gEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷–ÆöC¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢ÖW&vUö7W7FöÖW%ö66÷VçG5öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6Uö7W7FöÖW%ö–C¢7G&–æp¢÷F&vWEö7W7FöÖW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Öö&–ÆUö7F÷%ö†5öf–VÆE÷6W'f–6Uö66W73¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆUö7F÷%ö—5öf–VÆEö÷W&F÷#¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆUö6åöÖævUöföÆÆ÷wW3¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆUö6åöÖævU÷v÷&µö÷&FW'3¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆUö6öæf–wW&U÷6W'f–6U÷cöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öFVfVÇE÷f—6—EöÖ–çWFW3¢çVÖ&W ¢öF—7F6…öVæ&ÆVC¢&ööÆVà¢öVæ&ÆUö7W'&VçEö7F÷%öf–VÆEö÷W&F÷#¢&ööÆVà¢öf–VÆEö÷W&F÷%ö6÷VçE÷F&vWC¢çVÖ&W ¢÷6W'f–6UöÖöFVÃ¢7G&–æp¢÷6W'f–6U÷fV†–6ÆUöæÖS¢7G&–æp¢÷6W'f–6U÷fV†–6ÆU÷Væ—EöçVÖ&W#¢7G&–æp¢÷6W'f–6U÷fV†–6ÆW5öVæ&ÆVC¢&ööÆVà¢÷6†÷ö–C¢7G&–æp¢÷6öÆõöÖöFS¢&ööÆVà¢÷G'V6µö–çfVçF÷'•öVæ&ÆVC¢&ööÆVà¢Ð¢&WGW&ç3¢§6öà¢Ð¢Öö&–ÆUö7&VFU÷6W'f–6Uö6ÆÅöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öFG&W75öÆ–æS¢7G&–æp¢ö6—G“¢7G&–æp¢ö6öæ6W&ã¢7G&–æp¢ö7W'&Væ7“¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢ö7W7FöÖW%öæÖS¢7G&–æp¢öGW&F–öåöÖ–çWFW3¢çVÖ&W ¢ö÷W&F–öåö¶W“¢7G&–æp¢÷†öæS¢7G&–æp¢÷÷7FÅö6öFS¢7G&–æp¢÷&÷f–æ6U÷7FFS¢7G&–æp¢÷V÷FVE÷&–6S¢çVÖ&W ¢÷6W'f–6UöÖöFS¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢÷fV†–6ÆUöÖ¶S¢7G&–æp¢÷fV†–6ÆUöÖöFVÃ¢7G&–æp¢÷fV†–6ÆU÷ÆFS¢7G&–æp¢÷fV†–6ÆU÷–V#¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢Öö&–ÆUö7&VFU÷6W'f–6UöföÆÆ÷wWöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öF—7÷6—F–öã¢7G&–æp¢öW7F–ÖFVEöÖ÷VçC¢çVÖ&W ¢öföÆÆ÷u÷WöC¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öÖÖVæFF–öã¢7G&–æp¢÷6W'f–6U÷f—6—Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Öö&–ÆUöF—7F6…÷&öf–ÆUöVÆ–v–&ÆS¢°¢&w3¢²÷&öf–ÆUö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆUö—5öf–VÆEö÷W&F÷#¢°¢&w3¢²÷&öf–ÆUö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆUö—5÷6†÷öÖVÖ&W#¢²&w3¢²÷6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢Öö&–ÆUöÖFW&–Æ—¦U÷6W'f–6U÷f—6—E÷v÷&µö÷&FW%öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷f—6—Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Öö&–ÆU÷&öf–ÆUö†5öf–VÆE÷6W'f–6Uö66W73¢°¢&w3¢²÷&öf–ÆUö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆU÷&WÆ•÷6W'f–6U÷f—6—E÷G&ç6—F–öåöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öW‡V7FVE÷fW'6–öã¢çVÖ&W ¢ög&öÕ÷7FGW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷Fõ÷7FGW3¢7G&–æp¢÷f—6—Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Öö&–ÆU÷6W'f–6U÷f—6—E÷G&ç6—F–öå÷&V6V—EöW†—7G3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢Öö&–ÆU÷WFFU÷6W'f–6UöföÆÆ÷wW÷7FGW5öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö6öçfW'FVE÷v÷&µö÷&FW%ö–C¢7G&–æp¢öföÆÆ÷wWö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7FGW3¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢×WFFU÷v÷&µö÷&FW%öÆ–æUö76–væÖVçEöFöÖ–3¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öW‡V7FVE÷WFFVEöCó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢÷Vå÷v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öã¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÖWFFFó¢§6öà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öã¢7G&–æp¢÷66÷S¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢6Æ÷6VEöC¢7G&–ærÂçVÆÀ¢6Æ÷6VEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢–çfö–6U÷fW'6–öåö–C¢7G&–ærÂçVÆÀ¢ÖWFFF¢§6öà¢÷VæVEöC¢7G&–æp¢÷VæVEö'“¢7G&–ærÂçVÆÀ¢÷W&F–öåö¶W“¢7G&–æp¢&V6öã¢7G&–æp¢66÷S¢7G&–æp¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'v÷&µö÷&FW%ö6÷'&V7F–öå÷6W76–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢'E÷&WVW7Eö—FVÕö—5÷V÷FU÷&VG“¢°¢&w3¢°¢öFW67&—F–öã¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7FVEöÖçVf7GW&W#¢7G&–æp¢÷&WVW7FVE÷'EöçVÖ&W#¢7G&–æp¢÷Væ—E÷&–6S¢çVÖ&W ¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢'G5öÆÆö6FU÷&WVW7Eö—FVÓ¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7Eö—FVÕö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5öÆÆö6FVC¢°¢&w3¢²öÆö6F–öåö–Có¢7G&–æs²÷'Eö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢çVÖ&W ¢Ð¢'G5ö76W'E÷v÷&µö÷&FW%ö×WF&ÆS¢°¢&w3¢²÷6†÷ö–C¢7G&–æs²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5öGF6…öæEö—77VUöÆ–æU÷'EöFöÖ–3¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷Væ—Eö6÷7C¢çVÖ&W ¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5öGF6…ö–çfVçF÷'•÷Fõ÷&WVW7Eö—FVÕöFöÖ–3¢°¢&w3¢²ö—FVÕö–C¢7G&–æs²÷'Eö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢'G5öGF6…÷&WVW7Eö—FVÓ¢°¢&w3¢²÷&WVW7Eö—FVÕö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢'G5öGF6…÷&WVW7Eö—FVÕ÷Væ6†V6¶VC¢°¢&w3¢²÷&WVW7Eö—FVÕö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢'G5öf–Æ&ÆS¢°¢&w3¢²öÆö6F–öåö–Có¢7G&–æs²÷'Eö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢çVÖ&W ¢Ð¢'G5ö&Vv–åö÷W&F–öã¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢övw&VvFUö–C¢7G&–æp¢övw&VvFU÷G—S¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢ö÷W&F–öå÷G—S¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢vw&VvFUö–C¢7G&–æp¢vw&VvFU÷G—S¢7G&–æp¢6ö×ÆWFVEöC¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢÷W&F–öåö¶W“¢7G&–æp¢÷W&F–öå÷G—S¢7G&–æp¢&W7VÇC¢§6öâÂçVÆÀ¢6†÷ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢''G5ö÷W&F–öåö¶W—2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢'G5ö6æ6VÅ÷&WVW7Eö—FVÓ¢°¢&w3¢²ö–FV×÷FVæ7•ö¶W“¢7G&–æs²÷&WVW7Eö—FVÕö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢'G5ö6öÖÖ—E÷&WVW7E÷6¶vUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&WVW7Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5ö6ö×ÆWFUö÷W&F–öã¢°¢&w3¢²ö÷W&F–öåö–C¢7G&–æs²÷&W7VÇC¢§6öâÐ¢&WGW&ç3¢§6öà¢Ð¢'G5ö6ö×ÆWFU÷&WVW7Eö†æFöfeöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&WVW7Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5ö7&VFUöæEöGF6…ö–çfVçF÷'•öFöÖ–3¢°¢&w3¢°¢ö6FVv÷'“¢7G&–æp¢ö6÷7C¢çVÖ&W ¢ö–æ—F–Å÷G“¢çVÖ&W ¢ö—FVÕö–C¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢öÖçVf7GW&W#¢7G&–æp¢öæÖS¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'EöçVÖ&W#¢7G&–æp¢÷6VÆÅ÷&–6S¢çVÖ&W ¢÷6·S¢7G&–æp¢÷7WÆ–W#¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5ö7&VFUö÷%÷&WW6U÷õöÆ–æUöf÷%÷&WVW7C¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆö6F–öåö–Có¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢÷õö–Có¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7Eö—FVÕö–C¢7G&–æp¢÷7WÆ–W%ö–Có¢7G&–æp¢÷Væ—Eö6÷7Có¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5ö7&VFU÷õöÆ–æUöf÷%÷&WVW7C¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“ó¢7G&–æp¢öÆö6F–öåö–Có¢7G&–æp¢÷õö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7Eö—FVÕö–C¢7G&–æp¢÷Væ—Eö6÷7Có¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5ö7&VFU÷7WÆ–W%÷V÷FU÷&WVW7C¢°¢&w3¢°¢ö6†ææVÃ¢7G&–æp¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢ö—FVÕö–G3¢7G&–æuµÐ¢öÖW76vS¢7G&–æp¢÷&WVW7Eö–C¢7G&–æp¢÷7V&¦V7C¢7G&–æp¢÷7WÆ–W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5öF—6Ö—75öV×G•÷&WVW7EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷&WVW7Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5öVç7W&U÷&WVW7E÷V÷FUöÆ–æS¢°¢&w3¢²÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢'G5öVç7W&U÷v÷&µö÷&FW%÷'C¢°¢&w3¢²÷&WVW7Eö—FVÕö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢'G5ö—77VUö'•öÆ–æU÷'EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5ö—77VU÷v÷&µö÷&FW%÷'C¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷v÷&µö÷&FW%÷'Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5öÆ–fV7–6ÆUö76W'EöÆ–æUö66W73¢°¢&w3¢²÷6†÷ö–C¢7G&–æs²÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5öÆ–fV7–6ÆUö76W'E÷6†÷ö66W73¢°¢&w3¢²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5öÆ–fV7–6ÆU÷7FGW3¢°¢&w3¢°¢öÆÆö6FVC¢çVÖ&W ¢ö6æ6VÆÆVC¢çVÖ&W ¢ö6öç7VÖVC¢çVÖ&W ¢ö÷&FW&VC¢çVÖ&W ¢÷&V6V—fVC¢çVÖ&W ¢÷&WVW7FVC¢çVÖ&W ¢÷&WGW&æVC¢çVÖ&W ¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢'G5öÖ&µ÷W&6†6Uö÷&FW%ö6öçF7FVC¢°¢&w3¢²ö6†ææVÃ¢7G&–æs²ö–FV×÷FVæ7•ö¶W“¢7G&–æs²÷õö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢'G5ööåö†æC¢°¢&w3¢²öÆö6F–öåö–Có¢7G&–æs²÷'Eö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢çVÖ&W ¢Ð¢'G5÷Æ6U÷W&6†6Uö÷&FW#¢°¢&w3¢°¢ö6öçF7Eö6†ææVÃó¢7G&–æp¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢÷õö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷V&Æ—6…÷&WVW7Eöæ÷F–f–6F–öã¢°¢&w3¢²÷&WVW7Eö–C¢7G&–æs²÷7FvS¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷V&Æ—6…÷&WVW7Eöæ÷F–f–6F–öå÷v—F…÷F&ÆS¢°¢&w3¢²÷&WVW7Eö–C¢7G&–æs²÷7FvS¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷&V6V—fUög&VU÷FW‡E÷õöÆ–æS¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢÷õö–C¢7G&–æp¢÷õöÆ–æUö–C¢7G&–æp¢÷G“¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷&V6V—fU÷&WVW7Eö—FVÓ¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“ó¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷õöÆ–æUö–Có¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7Eö—FVÕö–C¢7G&–æp¢÷Væ—Eö6÷7Có¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷&V6öæ6–ÆU÷–6µ÷&WVW7Eöæ÷F–f–6F–öã¢°¢&w3¢²÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷&V6öæ6–ÆU÷&WVW7EöÆ–fV7–6ÆS¢°¢&w3¢²÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢'G5÷&V6öæ6–ÆU÷v÷&µö÷&FW%÷'C¢°¢&w3¢²÷v÷&µö÷&FW%÷'Eö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷&V6÷&E÷7WÆ–W%÷V÷FU÷&W7öç6S¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢ö—FV×3¢§6öà¢÷V÷FU÷&WVW7Eö–C¢7G&–æp¢÷&W7öç6Uöæ÷FW3¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷&WÆ6U÷&WVW7Eö—FVÓ¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢öæWu÷'Eö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7Eö—FVÕö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷&WVW7Eö—5ö÷W&F–öæÆÇ•÷&VÆV6VC¢°¢&w3¢²÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢'G5÷&WVW7Eö÷W&F–öæÅ÷7FvS¢°¢&w3¢²÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢'G5÷&WVW7E÷–6µöf÷%öÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–Có¢7G&–æp¢ö÷W&F–öåö¶W“ó¢7G&–æp¢÷6÷W&6Só¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷&WVW7E÷v÷&µö÷&FW%öÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–Có¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷&WGW&å÷Fõ÷7Fö6³¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷v÷&µö÷&FW%÷'Eö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷6WE÷7Fö6µööåö†æE÷6æ6†÷C¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢öÖWFFFó¢§6öà¢÷'Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F&vWE÷G“¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷7–æ5÷FV6†æ–6–å÷&VG•öæ÷F–f–6F–öã¢°¢&w3¢²÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷7–æ5÷FV6†æ–6–å÷&VG•öæ÷F–f–6F–öå÷v—F…÷F&ÆS¢°¢&w3¢²÷&WVW7Eö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷7–æ5÷v÷&µö÷&FW%öÆ–æUögVÆf–ÆÆÖVçE÷7FGW3¢°¢&w3¢²÷&WVW7Eö–C¢7G&–æs²÷7FvS¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷WFFUöGF6…öÆÆö6FUö—FVÕöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö7&VFUöÆÆö6F–öã¢&ööÆVà¢öFW67&—F–öã¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷õö–C¢7G&–æp¢÷G“¢çVÖ&W ¢÷&WVW7Eö—FVÕö–C¢7G&–æp¢÷&WVW7FVEöÖçVf7GW&W#¢7G&–æp¢÷&WVW7FVE÷'EöçVÖ&W#¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷Væ—E÷6VÆÅ÷&–6S¢çVÖ&W ¢÷v&æ–æuö66WFVC¢&ööÆVà¢÷v&æ–æu÷&V6öã¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢'G5÷W6W'E÷–6µ÷&WVW7Eöæ÷F–f–6F–öã¢°¢&w3¢°¢÷&VÖ–æ–æs¢çVÖ&W ¢÷&WVW7Eö–C¢7G&–æp¢÷&WV—&VC¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6S¢7G&–æp¢÷7FvVC¢çVÖ&W ¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢VæFVf–æV@¢Ð¢'G5÷fö–E÷v÷&µö÷&FW%öÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö6öç7VÖVEöF—7÷6—F–öã¢7G&–æp¢öÖöFS¢7G&–æp¢öæ÷FS¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢ö÷&FW&VEöF—7÷6—F–öã¢7G&–æp¢÷&V6öã¢7G&–æp¢÷&V6V—fVEöF—7÷6—F–öã¢7G&–æp¢÷&W6W'fVEöF—7÷6—F–öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢W6UöÆÅö7F—fU÷FV6†æ–6–åöÆ&÷%öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öC¢7G&–æp¢öFWF–Ç3ó¢§6öà¢öWfVçC¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6UöWfVçEö–Có¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢Æå÷W6W%öÆ–Ö—C ¢Â²&w3¢²÷Æã¢7G&–ærÓ²&WGW&ç3¢çVÖ&W"Ð¢Â°¢&w3¢²÷Æã¢7G&–æs²÷7G&—U÷7V'67&—F–öå÷7FGW3¢7G&–ærÐ¢&WGW&ç3¢çVÖ&W ¢Ð¢÷'FÅ÷&WVW7E÷7F'EöFöÖ–3¢°¢&w3¢°¢ö7W7FöÖW%ö–C¢7G&–æp¢öVæG5öC¢7G&–æp¢öæ÷FW3¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6÷W&6U÷&÷uö–Có¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢÷f—6—E÷G—S¢7G&–æp¢Ð¢&WGW&ç3¢°¢&öö¶–æuö–C¢7G&–æp¢FVGWVC¢&ööÆVà¢v÷&µö÷&FW%ö–C¢7G&–æp¢ÕµÐ¢Ð¢÷7E÷–ÖVçEöWfVçC¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÖ÷VçC¢çVÖ&W ¢ö7W'&Væ7“¢7G&–æp¢öWfVçEö¶–æC¢7G&–æp¢ö–çfö–6U÷fW'6–öåö–C¢7G&–æp¢öÖWFFFó¢§6öà¢öö67W'&VEöC¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷–ÖVçEöÖWF†öC¢7G&–æp¢÷&ö6W76÷#¢7G&–æp¢÷&ö6W76÷%öWfVçEö–C¢7G&–æp¢÷&ö6W76÷%÷–ÖVçEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&ö6W75÷6VæFw&–EöFVÆ—fW'•öWfVçC¢°¢&w3¢°¢öVÖ–ÅöÆöuö–C¢7G&–æp¢öW'&÷%÷FW‡C¢7G&–æp¢öWfVçEöC¢7G&–æp¢öWfVçE÷G—S¢7G&–æp¢÷–ÆöC¢§6öà¢÷&÷f–FW%öWfVçEö–C¢7G&–æp¢÷&÷f–FW%öÖW76vUö–C¢7G&–æp¢÷7W&W76–öåöVÖ–Ã¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—ö6åöf–æÆ—¦U÷v÷&¶f÷&6S¢²&w3¢æWfW#²&WGW&ç3¢&ööÆVâÐ¢&öf—†—ö6åöÖævU÷v÷&¶f÷&6S¢²&w3¢æWfW#²&WGW&ç3¢&ööÆVâÐ¢&öf—†—ö7W'&VçE÷&öÆS¢²&w3¢æWfW#²&WGW&ç3¢7G&–ærÐ¢&öf—†—öfÆVWEö†5÷&öGV7Eö66W73¢°¢&w3¢²öfÆVWEö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—ö†5÷÷'FÅö7W7FöÖW%÷6†÷¢°¢&w3¢²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—ö—5ö76–væVE÷FõöÆ–æS¢°¢&w3¢²öÆ–æUö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—ö—5ö76–væVE÷Fõ÷v÷&µö÷&FW#¢°¢&w3¢²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—ö—5÷÷'FÅö7W7FöÖW%öf÷#¢°¢&w3¢²ö7W7FöÖW%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—ö—5÷÷'FÅö7W7FöÖW%÷v÷&µö÷&FW#¢°¢&w3¢²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—÷6†÷ö†5÷&öGV7Eö66W73¢°¢&w3¢²ö6&–Æ—G“¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&öf—†—÷v÷&¶f÷&6U÷&öf–ÆUö–C¢²&w3¢æWfW#²&WGW&ç3¢7G&–ærÐ¢&öf—†—÷v÷&¶f÷&6U÷&öÆS¢²&w3¢æWfW#²&WGW&ç3¢7G&–ærÐ¢&öf—†—÷v÷&¶f÷&6U÷6†÷ö–C¢²&w3¢æWfW#²&WGW&ç3¢7G&–ærÐ¢V÷FUöÆ–æU÷&–6–æuö—5÷&÷FV7FVC¢°¢&w3¢°¢ö&÷fVEöC¢7G&–æp¢ö6öçfW'FVEöC¢7G&–æp¢öFV6Æ–æVEöC¢7G&–æp¢öFVfW'&VEöC¢7G&–æp¢÷6VçEöC¢7G&–æp¢÷6VçE÷Fõö7W7FöÖW%öC¢7G&–æp¢÷7FvS¢7G&–æp¢÷7FGW3¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢&VÇF–ÖUö6öçfW'6F–öåö–C¢²&w3¢²F÷–3¢7G&–ærÓ²&WGW&ç3¢7G&–ærÐ¢&V6Æ7VÆFUöW7F–ÖFU÷v÷&µö÷&FW%÷F÷FÇ3¢°¢&w3¢²÷6†÷ö–C¢7G&–æs²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢&V6V—fU÷'E÷&WVW7Eö—FVÓ¢°¢&w3¢°¢ö–FV×÷FVæ7•ö¶W“ó¢7G&–æp¢ö—FVÕö–C¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷õö–Có¢7G&–æp¢÷G“¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢&V6V—fU÷õ÷'EöæEöÆÆö6FS ¢Â°¢&w3¢°¢öÆö6F–öåö–C¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷õö–C¢7G&–æp¢÷G“¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢Â°¢&w3¢°¢öÆö6F–öåö–C¢7G&–æp¢ö÷W&F–öåö–C¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷õö–C¢7G&–æp¢÷G“¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢&V6öæ6–ÆU÷v÷&µö÷&FW%ö&÷fÅ÷7FFUöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢&V6÷&EööffÆ–æU÷†÷Fõ÷&V6V—EöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷–ÆöC¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&V6÷&E÷—&öÆÅöW‡÷'EöF÷væÆöEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö&F6…ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&V6÷&E÷÷'FÅöVç&öÆÆÖVçE÷66ã¢°¢&w3¢²÷6ÇVs¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢&V6÷&E÷7G&—Uö7V—6—F–öåö6ö×ÆWF–öã¢°¢&w3¢°¢ö6†V6¶÷WEöVÖ–Ã¢7G&–æp¢ö6†V6¶÷WE÷6W76–öåö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öWfVçEö7&VFVEöC¢7G&–æp¢öWfVçEö–C¢7G&–æp¢ö–çFVçEö–C¢7G&–æp¢öæöæ6S¢7G&–æp¢÷7G&—U÷&–6Uö–C¢7G&–æp¢÷7V'67&—F–öåö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢&VÆV6Uöf–ææ6–Åö÷WF&÷…ö6Æ–Ó¢°¢&w3¢°¢öW'&÷#¢7G&–æp¢öæW‡EöGFV×EöC¢7G&–æp¢ö÷WF&÷…ö–C¢7G&–æp¢÷v÷&¶W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢&ööÆVà¢Ð¢&VÖVF–FU÷V÷FUöÆ–æU÷&–6–æu÷V&çF–æS¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö—FV×3¢§6öà¢öæ÷FSó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&V÷Våö–ç7V7F–öã¢°¢&w3¢²ö–ç7V7F–öåö–C¢7G&–æs²÷&V6öã¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢&WÆ6U÷—&öÆÅ÷W&–öE÷6æ6†÷C¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öVçG&–W3¢§6öà¢öW†6WF–öç3¢§6öà¢÷W&–öEö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&WÆ6U÷6†÷ö†÷W'5öFöÖ–3¢°¢&w3¢²ö†÷W'3¢§6öã²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢&WÆ6U÷7Ffe÷66†VGVÆU÷FV×ÆFS¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F&vWE÷W6W%ö–C¢7G&–æp¢÷FV×ÆFW3¢§6öà¢Ð¢&WGW&ç3¢çVÖ&W ¢Ð¢&WÆ6U÷v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G3¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö7&VF—G3¢§6öà¢öÆ–æUö–C¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&W÷'E÷v÷&µö÷&FW%öÆ–æUö76–væÖVçEöÖ&–wV—F–W3¢°¢&w3¢²÷6†÷ö–Có¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢&W6W'fUöW7F–ÖFU÷6VæEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆÆ÷u÷&W6VæC¢&ööÆVà¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷&Wf—6–öã¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&W6öÇfUöfÆVWEö–Eög&öÕ÷fV†–6ÆS¢°¢&w3¢²÷fV†–6ÆUö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢&W7öæEöfÆVWEöFVfV7Eö6Æ&–f–6F–öã¢°¢&w3¢°¢ö6Æ&–f–6F–öåö–C¢7G&–æp¢öWf–FVæ6S¢§6öà¢÷&W7öç6U÷FW‡C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&WF—&Uö7W7FöÖW%÷&–6–æuöw&VVÖVçEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öw&VVÖVçEö–C¢7G&–æp¢öCó¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&WGW&åöW7F–ÖFU÷Fõ÷'G5öFöÖ–3¢°¢&w3¢°¢öW‡V7FVE÷&Wf—6–öã¢çVÖ&W ¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öæ÷FS¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷&V6öåö6öFS¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢&Wf–WuöÖVçUö—FVÕ÷'Eö–çF¶S¢°¢&w3¢°¢ö7F÷%öWF…÷W6W%ö–C¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö6FÆöu÷'Eö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷&WVW7Eö—FVÕö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷Væ—Eö6÷7C¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢6fUöW7F–ÖFUöG&gEöFöÖ–3¢°¢&w3¢°¢öW‡V7FVE÷&Wf—6–öã¢çVÖ&W ¢öW‡—&W5öC¢7G&–æp¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢öÆ–æW3¢§6öà¢öæ÷FW3¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6fUöfÆVWE÷&WG&—÷FV×ÆFS¢°¢&w3¢°¢öf–ÇW&Uö6öæf–s¢§6öà¢öfÆVWEö–C¢7G&–æp¢öæÖS¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6V7F–öç3¢§6öà¢÷fV†–6ÆU÷G—S¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6fUö–ç7V7F–öå÷&öw&W75öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6W76–öã¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6fUö–ç7V7F–öå÷&öw&W75÷c%öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6W76–öã¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6fUö–ç7V7F–öå÷&öw&W75÷c5öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6W76–öã¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6fU÷7Ffe÷66†VGVÆUö÷fW'&–FUöFöÖ–3¢°¢&w3¢°¢ö7F÷%öWF…÷W6W%ö–C¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öVæE÷F–ÖS¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷fW'&–FUö–C¢7G&–æp¢÷66†VGVÆUöFFS¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'E÷F–ÖS¢7G&–æp¢÷7FGW3¢7G&–æp¢÷F&vWE÷W6W%ö–C¢7G&–æp¢÷Vç–Eö'&VµöÖ–çWFW3¢çVÖ&W ¢Ð¢&WGW&ç3¢°¢7&VFVEöC¢7G&–æp¢7&VFVEö'“¢7G&–ærÂçVÆÀ¢VæE÷F–ÖS¢7G&–ærÂçVÆÀ¢–C¢7G&–æp¢æ÷FW3¢7G&–ærÂçVÆÀ¢66†VGVÆUöFFS¢7G&–æp¢6†÷ö–C¢7G&–æp¢6÷W&6U÷G—S¢7G&–æp¢7F'E÷F–ÖS¢7G&–ærÂçVÆÀ¢7FGW3¢7G&–æp¢Vç–Eö'&VµöÖ–çWFW3¢çVÖ&W ¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'7Ffe÷66†VGVÆUö÷fW'&–FW2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢6fU÷v÷&µö÷&FW%öÖVF–öææ÷FF–öåöFöÖ–3¢°¢&w3¢°¢ö6Æ–VçEö×WFF–öåö–C¢7G&–æp¢öÖVF–ö–C¢7G&–æp¢ö÷fW&Æ“¢§6öà¢÷f—6–&–Æ—G“¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢66†VGVÆW%ö7F÷%öÖF6†W3¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢66†VGVÆW%öÇ•ö&öö¶–æuö6öÖÖæEöFöÖ–3¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%öÖöFS¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢ö&öö¶–æuö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öVæG5öC¢7G&–æp¢öÖöFSó¢7G&–æp¢öæ÷FW3¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öãó¢7G&–æp¢÷&W6÷W&6Uö–Có¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢66†VGVÆW%ö76–våöWfVçE÷&W6÷W&6UöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öWfVçEö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&W6÷W&6Uö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢66†VGVÆW%öf–Æ&–Æ—G•÷6æ6†÷C¢°¢&w3¢°¢öÖöFSó¢7G&–æp¢÷V&Æ–5ööæÇ“ó¢&ööÆVà¢÷&W6÷W&6Uö–Có¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v–æF÷uöVæC¢7G&–æp¢÷v–æF÷u÷7F'C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢66†VGVÆW%ö6åöÖævS¢²&w3¢²÷6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢66†VGVÆW%öÆ—7EöWfVçG3¢°¢&w3¢°¢öVæG5öC¢7G&–æp¢öÖöFSó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢66†VGVÆW%öÆ—7E÷&W6÷W&6W3¢²&w3¢²÷6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢§6öâÐ¢66†VGVÆW%÷–6µ÷&W6÷W&6S¢°¢&w3¢°¢öVæG5öC¢7G&–æp¢öW†6ÇVFUöWfVçEö–Có¢7G&–æp¢öÖöFS¢7G&–æp¢÷&VfW'&VE÷&W6÷W&6Uö–Có¢7G&–æp¢÷V&Æ–5ööæÇ“ó¢&ööÆVà¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢Ð¢&WGW&ç3¢7G&–æp¢Ð¢66†VGVÆW%÷&V&Ææ6UöfÆÆ&6µ÷&W6W'fF–öç3¢°¢&w3¢²öÖöFS¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢çVÖ&W ¢Ð¢66†VGVÆW%÷6ÖU÷6†÷¢²&w3¢²÷6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢66†VGVÆW%÷W6W'E÷&W6÷W&6S¢°¢&w3¢°¢ö7F—fS¢&ööÆVà¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö6öFS¢7G&–æp¢öÖöFS¢7G&–æp¢öæÖS¢7G&–æp¢÷V&Æ–5ö&öö¶&ÆS¢&ööÆVà¢÷&W6÷W&6Uö–C¢7G&–æp¢÷&W6÷W&6U÷G—S¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6÷'Eö÷&FW#ó¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢6V&6…öW7F–ÖFU÷v÷&µö÷&FW%ö–G3¢°¢&w3¢°¢öÆ–Ö—C¢çVÖ&W ¢öÖöFS¢7G&–æp¢ööfg6WC¢çVÖ&W ¢÷6V&6ƒ¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7FGW3¢7G&–æp¢Ð¢&WGW&ç3¢°¢v÷&µö÷&FW%ö–C¢7G&–æp¢ÕµÐ¢Ð¢6VVEöFVfVÇEö†÷W'3¢²&w3¢²6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢VæFVf–æVBÐ¢6VæEöf÷%ö&÷fÃ¢°¢&w3¢²öÆ–æUö–G3¢7G&–æuµÓ²÷6WE÷võ÷7FGW3ó¢&ööÆVã²÷vó¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢6WEöWF†VçF–6FVC¢²&w3¢²V–C¢7G&–ærÓ²&WGW&ç3¢VæFVf–æVBÐ¢6WEö7W'&VçE÷6†÷ö–C¢²&w3¢²÷6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢VæFVf–æVBÐ¢6WEöÆ7Eö7F—fUöæ÷s¢²&w3¢æWfW#²&WGW&ç3¢VæFVf–æVBÐ¢6WE÷'E÷&WVW7E÷7FGW3¢°¢&w3¢°¢÷&WVW7C¢7G&–æp¢÷7FGW3¢FF&6U²'V&Æ–2%Õ²$VçV×2%Õ²''E÷&WVW7E÷7FGW2%Ð¢Ð¢&WGW&ç3¢VæFVf–æV@¢Ð¢6WE÷6†÷÷&öÆUö6&–Æ—G•÷öÆ–7•öFöÖ–3¢°¢&w3¢²ö6&–Æ—G•ö¶W“¢7G&–æs²öVffV7C¢7G&–æs²÷&öÆUö¶W“¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢6WE÷7Ffeö6&–Æ—G•ö÷fW'&–FUöFöÖ–3¢°¢&w3¢°¢ö6&–Æ—G•ö¶W“¢7G&–æp¢öVffV7C¢7G&–æp¢÷F&vWE÷&öf–ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEöFE÷v÷&µö÷&FW%öÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öFW67&—F–öã¢7G&–æp¢ö¦ö%÷G—Só¢7G&–æp¢öÆ&÷%÷F–ÖSó¢çVÖ&W ¢öæ÷FW3ó¢7G&–æp¢÷&–6UöW7F–ÖFSó¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷W&vVæ7“ó¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö76W'EöÆ–æU÷6æ6†÷C¢°¢&w3¢°¢öÖöFS¢7G&–æp¢ööæÇ•÷Væ76–væVCó¢&ööÆVà¢÷6†÷ö–C¢7G&–æp¢÷F&vWE÷fW'6–öç3¢§6öà¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢çVÖ&W ¢Ð¢6†÷ö76—7FçEö76–vå÷v÷&µö÷&FW%öFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ööæÇ•÷Væ76–væVCó¢&ööÆVà¢÷6†÷ö–C¢7G&–æp¢÷FV6†æ–6–åö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö6æ6VÅö&öö¶–æuöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö&öö¶–æuö–C¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö6öçfW'EöfÆVWE÷6W'f–6U÷&WVW7EöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷6W'f–6U÷&WVW7Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFUö&öö¶–æuöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öVæG5öC¢7G&–æp¢öÖöFSó¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢÷&W6÷W&6Uö–Có¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFUö7W7FöÖW%öFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öVÖ–Ãó¢7G&–æp¢öæÖS¢7G&–æp¢÷†öæSó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFUöfÆVWE÷6W'f–6U÷&WVW7EöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öfÆVWEö–C¢7G&–æp¢÷&WVW7FVEöf÷%öFFSó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7VÖÖ'“¢7G&–æp¢÷F—FÆS¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFUö–çfVçF÷'•÷'EöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö6FVv÷'“¢7G&–æp¢ö6÷7C¢çVÖ&W ¢öFW67&—F–öã¢7G&–æp¢ö–æ—F–Å÷VçF—G“¢çVÖ&W ¢öÆö6F–öåö–C¢7G&–æp¢öÆ÷u÷7Fö6µ÷F‡&W6†öÆC¢çVÖ&W ¢öÖçVf7GW&W#¢7G&–æp¢öæÖS¢7G&–æp¢÷'EöçVÖ&W#¢7G&–æp¢÷&–6S¢çVÖ&W ¢÷&V÷&FW%÷VçF—G“¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷6·S¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFU÷'E÷&WVW7EöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö—FV×3¢§6öà¢öæ÷FW3ó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFU÷W&6†6Uö÷&FW%öFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öW‡V7FVEöC¢7G&–æp¢öÆ–æW3¢§6öà¢öæ÷FW3¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7WÆ–W%ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFU÷fV†–6ÆUöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢öÆ–6Vç6U÷ÆFSó¢7G&–æp¢öÖ¶Só¢7G&–æp¢öÖ–ÆVvSó¢7G&–æp¢öÖöFVÃó¢7G&–æp¢öæ÷FW3ó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷Væ—EöçVÖ&W#ó¢7G&–æp¢÷f–ãó¢7G&–æp¢÷–V#ó¢çVÖ&W ¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö7&VFU÷v÷&µö÷&FW%öFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öGf—6÷%ö–Có¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢ö—5÷v—FW#ó¢&ööÆVà¢öæ÷FW3ó¢7G&–æp¢÷&–÷&—G“ó¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEöf–æÆ—¦Uö–çfö–6UöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷6æ6†÷C¢§6öà¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö†öÆE÷v÷&µö÷&FW%öFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçEö–çfö–6U÷6÷W&6Uöf–ævW'&–çC¢°¢&w3¢²÷6†÷ö–C¢7G&–æs²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢6†÷ö76—7FçEö§6öåöf–ævW'&–çC¢°¢&w3¢²÷fÇVS¢§6öâÐ¢&WGW&ç3¢7G&–æp¢Ð¢6†÷ö76—7FçEöÆö6µö7F–öåöf÷%÷FööÃ¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷FööÅöæÖS¢7G&–æp¢Ð¢&WGW&ç3¢°¢6öæf—&ÖVEöC¢7G&–ærÂçVÆÀ¢6öæf—&ÖVEö'“¢7G&–ærÂçVÆÀ¢7&VFVEöC¢7G&–æp¢FöÖ–ã¢7G&–æp¢W'&÷#¢§6öâÂçVÆÀ¢W†V7WF–öåöf–æ—6†VEöC¢7G&–ærÂçVÆÀ¢W†V7WF–öå÷7F'FVEöC¢7G&–ærÂçVÆÀ¢W‡—&W5öC¢7G&–æp¢–C¢7G&–æp¢–FV×÷FVæ7•ö¶W“¢7G&–æp¢–çWC¢§6öà¢&Wf–Ws¢§6öà¢&WVW7FVEö'“¢7G&–æp¢&W7VÇC¢§6öâÂçVÆÀ¢&—6³¢7G&–æp¢6†÷ö–C¢7G&–æp¢7FGW3¢7G&–æp¢F&vWE÷fW'6–öç3¢§6öà¢F‡&VEö–C¢7G&–æp¢FööÅöæÖS¢7G&–æp¢WFFVEöC¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'6†÷ö76—7FçEö7F–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢6†÷ö76—7FçEöÖ&µ÷v÷&µö÷&FW%÷&VG•öFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷Æ6U÷W&6†6Uö÷&FW%öFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö6öçF7Eö6†ææVÃ¢7G&–æp¢÷W&6†6Uö÷&FW%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷&öf–ÆUö–C¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢6†÷ö76—7FçE÷&öf–ÆU÷&öÆS¢°¢&w3¢²ö7F÷%÷W6W%ö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢7G&–æp¢Ð¢6†÷ö76—7FçE÷&V6V—fU÷'E÷&WVW7Eö—FVÕöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö—FVÕö–C¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷W&6†6Uö÷&FW%ö–Có¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷&V6V—fU÷W&6†6Uö÷&FW%öÆ–æUöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆö6F–öåö–Có¢7G&–æp¢÷W&6†6Uö÷&FW%ö–C¢7G&–æp¢÷W&6†6Uö÷&FW%öÆ–æUö–C¢7G&–æp¢÷VçF—G“¢çVÖ&W ¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷&V6÷&Eö&÷fÅöFV6—6–öåöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆÅ÷VæF–æs¢&ööÆVà¢ö6öçF7EöÖWF†öC¢7G&–æp¢öFV6—6–öã¢7G&–æp¢ö—FVÕö–G3¢7G&–æuµÐ¢öæ÷FS¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷&VÆV6U÷v÷&µö÷&FW%ö†öÆEöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷&V÷Våö–ç7V7F–öåöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö–ç7V7F–öåö–C¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷&W66†VGVÆUö&öö¶–æuöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö&öö¶–æuö–C¢7G&–æp¢öVæG5öCó¢7G&–æp¢öæ÷FSó¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷6WEö–çfVçF÷'•÷7Fö6µöFöÖ–3¢°¢&w3¢°¢ö7F–öåö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆö6F–öåö–C¢7G&–æp¢÷'Eö–C¢7G&–æp¢÷VçF—G•ööåö†æC¢çVÖ&W ¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷7V66VVEö7F–öã¢°¢&w3¢²ö7F–öåö–C¢7G&–æs²÷&W7VÇC¢§6öã²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢6†÷ö76—7FçE÷F–ÖW7F×÷fW'6–öåöÖF6†W3¢°¢&w3¢²ö7W'&VçC¢7G&–æs²öW‡V7FVC¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6†÷ö–Eöf÷#¢²&w3¢²V–C¢7G&–ærÓ²&WGW&ç3¢7G&–ærÐ¢6†÷÷&öÆS¢²&w3¢²6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢7G&–ærÐ¢6†÷÷&öÆU÷c#¢²&w3¢²6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢7G&–ærÐ¢6†÷÷W6W'5ö7F÷%ö6åöÖævS¢°¢&w3¢²F&vWE÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢6–våö–ç7V7F–öã¢°¢&w3¢°¢öW‡V7FVE÷7–æ5÷&Wf—6–öã¢çVÖ&W ¢ö–ç7V7F–öåö–C¢7G&–æp¢÷&öÆS¢7G&–æp¢÷6–væGW&Uö†6ƒó¢7G&–æp¢÷6–væGW&Uö–ÖvU÷Fƒó¢7G&–æp¢÷6–væVEöæÖS¢7G&–æp¢Ð¢&WGW&ç3¢VæFVf–æV@¢Ð¢7F'Eö6æöæ–6Å÷6†–gC¢°¢&w3¢°¢÷&öf–ÆUö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F–ÖW7F×ó¢7G&–æp¢÷W6W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢VæE÷F–ÖS¢7G&–æp¢–C¢7G&–æp¢–ç6W'FVEöWfVçG3¢§6öà¢6†÷ö–C¢7G&–æp¢7F'E÷F–ÖS¢7G&–æp¢7FGW3¢7G&–æp¢W6W%ö–C¢7G&–æp¢ÕµÐ¢Ð¢7V&Ö—EöW7F–ÖFU÷Fõ÷'G5öFöÖ–3¢°¢&w3¢°¢öW‡V7FVE÷&Wf—6–öã¢çVÖ&W ¢ö–FV×÷FVæ7•ö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7V&Ö—EöfÆVWE÷&WG&—÷&W÷'C¢°¢&w3¢°¢ö6†V6¶Æ—7C¢§6öà¢öWf–FVæ6S¢§6öà¢öfÆVWEö–C¢7G&–æp¢öæ÷FW3¢7G&–æp¢ööFöÖWFW%ö¶Ó¢çVÖ&W ¢÷&W÷'Eö–C¢7G&–æp¢÷FV×ÆFUö76–væÖVçEö–C¢7G&–æp¢÷G&–ÆW%÷fV†–6ÆUö–C¢7G&–æp¢÷fV†–6ÆUö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7V&Ö—Eö–ç7V7F–öåöf–æF–æw5öFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öCó¢7G&–æp¢öW‡V7FVE÷7–æ5÷&Wf—6–öã¢çVÖ&W ¢ö–ç7V7F–öåö–C¢7G&–æp¢ö—FV×3¢§6öà¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&WVW7FVE÷fV†–6ÆUö–C¢7G&–æp¢÷6VÆV7F–öã¢§6öà¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢7V&Ö—E÷7Ffe÷F–ÖUööfe÷&WVW7C¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öVæG5öC¢7G&–æp¢ö—5÷'F–ÅöF“¢&ööÆVà¢÷&V6öã¢7G&–æp¢÷&WVW7E÷G—S¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷7F'G5öC¢7G&–æp¢÷F&vWE÷W6W%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢7&VFVEöC¢7G&–æp¢VæG5öC¢7G&–æp¢–C¢7G&–æp¢—5÷'F–ÅöF“¢&ööÆVà¢&V6öã¢7G&–ærÂçVÆÀ¢&WVW7E÷G—S¢7G&–æp¢&WVW7FVEöC¢7G&–æp¢&WVW7FVEö'“¢7G&–æp¢&Wf–Wuöæ÷FS¢7G&–ærÂçVÆÀ¢&Wf–WvVEöC¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7F'G5öC¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'7Ffe÷F–ÖUööfe÷&WVW7G2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢7–æ5öfÆVWEöFVfV7Eöæ÷F–f–6F–öã¢°¢&w3¢²÷&WG&—ö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢7–æ5÷V÷FUöÆ–æU÷&–6–æuög&öÕ÷'G3¢°¢&w3¢²÷V÷FUöÆ–æUö–C¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢7–æ5÷v÷&µö÷&FW%öÆ–æUöfÆE÷&FUö7&VF—G3¢°¢&w3¢²öÆ–æUö–C¢7G&–ærÐ¢&WGW&ç3¢VæFVf–æV@¢Ð¢G&ç6—F–öåöÆVv7•÷V÷FU÷6VæEöFöÖ–3¢°¢&w3¢°¢ö7F–öã¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢öÆÆ÷u÷&W6VæC¢&ööÆVà¢öW‡V7FVEöÆ–æW3¢§6öà¢öf–ÇW&S¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷V÷FUöÆ–æUö–G3¢7G&–æuµÐ¢÷V÷FU÷W&Ã¢7G&–æp¢÷6VçEöC¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢G&ç6—F–öå÷7Ffe÷F–ÖUööfe÷&WVW7C¢°¢&w3¢°¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢öæW‡E÷7FGW3¢7G&–æp¢÷&WVW7Eö–C¢7G&–æp¢÷&Wf–Wuöæ÷FS¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢7&VFVEöC¢7G&–æp¢VæG5öC¢7G&–æp¢–C¢7G&–æp¢—5÷'F–ÅöF“¢&ööÆVà¢&V6öã¢7G&–ærÂçVÆÀ¢&WVW7E÷G—S¢7G&–æp¢&WVW7FVEöC¢7G&–æp¢&WVW7FVEö'“¢7G&–æp¢&Wf–Wuöæ÷FS¢7G&–ærÂçVÆÀ¢&Wf–WvVEöC¢7G&–ærÂçVÆÀ¢&Wf–WvVEö'“¢7G&–ærÂçVÆÀ¢6†÷ö–C¢7G&–æp¢7F'G5öC¢7G&–æp¢7FGW3¢7G&–æp¢WFFVEöC¢7G&–æp¢W6W%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢'7Ffe÷F–ÖUööfe÷&WVW7G2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢WFFUö7W7FöÖW%ö6öÖÖW&6–Åö6öçG&öÇ5öFöÖ–3¢°¢&w3¢°¢ö66÷VçEö†öÆE÷&V6öã¢7G&–æp¢ö66÷VçE÷7FGW3¢7G&–æp¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö&–ÆÆ–æuöæ÷FW3¢7G&–æp¢ö7W7FöÖW%ö–C¢7G&–æp¢ö7W7FöÖW%÷&VfW&Væ6S¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷–ÖVçE÷FW&×3¢7G&–æp¢÷–ÖVçE÷FW&×5öF—3¢çVÖ&W ¢÷õ÷&WV—&VC¢&ööÆVà¢÷&–Ö'•ö&÷fÅö6öçF7Eö–C¢7G&–æp¢÷&–Ö'•ö&–ÆÆ–æuö6öçF7Eö–C¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷F…öW†V×C¢&ööÆVà¢÷F…öW†V×F–öå÷&VfW&Væ6S¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢WFFUöÖVçUö—FVÕ÷v—F…÷'G5ö–çF¶S¢°¢&w3¢°¢ö7F÷%öWF…÷W6W%ö–C¢7G&–æp¢ö7F÷%÷&öf–ÆUö–C¢7G&–æp¢ö—FVÓ¢§6öà¢öÖVçUö—FVÕö–C¢7G&–æp¢÷'G3¢§6öà¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢W6W%ö—5ö–å÷6†÷¢²&w3¢²F&vWE÷6†÷ö–C¢7G&–ærÓ²&WGW&ç3¢&ööÆVâÐ¢fÆ–FFUöW7F–ÖFUöÆ–æW3¢²&w3¢²öÆ–æW3¢§6öâÓ²&WGW&ç3¢VæFVf–æVBÐ¢fö–Eö–çfö–6U÷fW'6–öã¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö–çfö–6U÷fW'6–öåö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷&V6öã¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢Ð¢&WGW&ç3¢°¢7&VFVEöC¢7G&–æp¢7W'&Væ7“¢7G&–æp¢F—66÷VçE÷F÷FÃ¢çVÖ&W ¢–C¢7G&–æp¢–çfö–6Uö–C¢7G&–ærÂçVÆÀ¢—77VVEöC¢7G&–ærÂçVÆÀ¢—77VVEö'“¢7G&–ærÂçVÆÀ¢Æ–fV7–6ÆU÷7FGW3¢7G&–æp¢÷WG7FæF–æu÷F÷FÃ¢çVÖ&W"ÂçVÆÀ¢–E÷F÷FÃ¢çVÖ&W ¢&VgVæFVE÷F÷FÃ¢çVÖ&W ¢6†÷ö–C¢7G&–æp¢6æ6†÷C¢§6öà¢6æ6†÷Eö†6ƒ¢7G&–æp¢7V'F÷FÃ¢çVÖ&W ¢7WW'6VFVEö'•ö–çfö–6U÷fW'6–öåö–C¢7G&–ærÂçVÆÀ¢7WW'6VFW5ö–çfö–6U÷fW'6–öåö–C¢7G&–ærÂçVÆÀ¢F…÷F÷FÃ¢çVÖ&W ¢F÷FÃ¢çVÖ&W ¢WFFVEöC¢7G&–æp¢fW'6–öåöçVÖ&W#¢çVÖ&W ¢fö–E÷&V6öã¢7G&–ærÂçVÆÀ¢fö–FVEöC¢7G&–ærÂçVÆÀ¢fö–FVEö'“¢7G&–ærÂçVÆÀ¢v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢6WFöd÷F–öç3¢°¢g&öÓ¢"¢ ¢Fó¢&–çfö–6U÷fW'6–öç2 ¢—4öæUFôöæS¢G'VP¢—56WFöe&WGW&ã¢fÇ6P¢Ð¢Ð¢võ÷&VÆV6U÷'G5ö†öÆG5öf÷%÷'C¢°¢&w3¢²÷'Eö–C¢7G&–ærÐ¢&WGW&ç3¢çVÖ&W ¢Ð¢v÷&µö÷&FW%öFVÆWFUöG&gEöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢v÷&µö÷&FW%öFVÆWFUöV×G•÷6†VÆÅöFöÖ–3¢°¢&w3¢°¢ö7F÷%÷W6W%ö–C¢7G&–æp¢ö÷W&F–öåö¶W“¢7G&–æp¢÷6†÷ö–C¢7G&–æp¢÷v÷&µö÷&FW%ö–C¢7G&–æp¢Ð¢&WGW&ç3¢§6öà¢Ð¢v÷&µö÷&FW%öf–ææ6–ÅöÆö6µ÷7FFS¢°¢&w3¢²÷6†÷ö–C¢7G&–æs²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢§6öà¢Ð¢v÷&µö÷&FW%ö—5öf–ææ6–ÆÇ•öÆö6¶VC¢°¢&w3¢²÷6†÷ö–C¢7G&–æs²÷v÷&µö÷&FW%ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢v÷&·76Uö7F÷%ö6åöÖævU÷v÷&µö÷&FW%ö76–væÖVçG3¢°¢&w3¢²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢v÷&·76Uö7F÷%ö6åöÖævU÷v÷&µö÷&FW%öÆ–æUö76–væÖVçG3¢°¢&w3¢²÷v÷&µö÷&FW%öÆ–æUö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢v÷&·76Uö7F÷%ö†5ö6&–Æ—G“¢°¢&w3¢²ö6&–Æ—G•ö¶W“¢7G&–æs²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢v÷&·76Uö7F÷%ö—5÷7Ffeöf÷%÷6†÷¢°¢&w3¢²÷6†÷ö–C¢7G&–ærÐ¢&WGW&ç3¢&ööÆVà¢Ð¢v÷&·76Uö7W'&VçEö7F÷%ö6&–Æ—F–W3¢°¢&w3¢²ö6&–Æ—G•ö¶W—3ó¢7G&–æuµÒÐ¢&WGW&ç3¢°¢66W75öÆWfVÃ¢7G&–æp¢6æöæ–6Å÷&öÆS¢7G&–æp¢6&–Æ—G•ö¶W“¢7G&–æp¢FV6—6–öå÷6÷W&6S¢7G&–æp¢w&çFVC¢&ööÆVà¢&öf–ÆUö–C¢7G&–æp¢6†÷ö–C¢7G&–æp¢ÕµÐ¢Ð¢Ð¢VçV×3¢°¢vVçEö7F–öå÷&—6³¢&Æ÷r"Â&ÖVF—VÒ"Â&†–v‚ ¢vVçEö7F–öå÷7FGW3 ¢Â'&÷÷6VB ¢Â&v—F–æuö&÷fÂ ¢Â&&÷fVB ¢Â'&V¦V7FVB ¢Â&W†V7WF–ær ¢Â'7V66VVFVB ¢Â&f–ÆVB ¢Â&6æ6VÆVB ¢vVçEö¦ö%ö¶–æC ¢Â&æ÷F–g•öF—66÷&B ¢Â&æÇ—¦U÷&WVW7B ¢Â&7&VFUö—77VU÷" ¢Â''Våö6†V6·2 ¢Â&Ç•öf—‚ ¢vVçEö¦ö%÷7FGW3 ¢Â'VWVVB ¢Â''Vææ–ær ¢Â'7V66VVFVB ¢Â&f–ÆVB ¢Â&6æ6VÆVB ¢Â&FVB ¢vVçEöÖW76vUöF—&V7F–öã¢'FõövVçB"Â'Fõ÷W6W" ¢vVçE÷&WVW7Eö–çFVçC ¢Â&fVGW&U÷&WVW7B ¢Â&'Vu÷&W÷'B ¢Â&–ç7V7F–öåö6FÆöuöFB ¢Â'6W'f–6Uö6FÆöuöFB ¢Â'&Vf7F÷" ¢vVçE÷&WVW7E÷7FGW3 ¢Â'7V&Ö—GFVB ¢Â&–å÷&öw&W72 ¢Â&v—F–æuö&÷fÂ ¢Â&&÷fVB ¢Â'&V¦V7FVB ¢Â&f–ÆVB ¢Â&ÖW&vVB ¢•÷G&–æ–æu÷6÷W&6S ¢Â'V÷FR ¢Â&ö–çFÖVçB ¢Â&–ç7V7F–öâ ¢Â'v÷&µö÷&FW" ¢Â&7W7FöÖW" ¢Â'fV†–6ÆR ¢Â&fÆVWB ¢æÇ—F–75öWfVçE÷G—S ¢Â&–×&W76–öâ ¢Â'f–Wr ¢Â&6Æ–6² ¢Â&Æ–¶R ¢Â&6öÖÖVçB ¢Â'6†&R ¢Â'6fR ¢Â'vF6…÷F–ÖR ¢Â&VævvVÖVçB ¢Â'&æ² ¢Â&ÆVB ¢Â&÷F†W" ¢'&æEö76WEö¶–æC ¢Â&Æövò ¢Â&–6öâ ¢Â'v÷&FÖ&² ¢Â&&FvR ¢Â&ff–6öâ ¢Â'vFW&Ö&² ¢'&æE÷6÷W&6Uö¢'&öf—†—"Â'6†÷&VVÂ ¢6öçFVçEö76WE÷G—S ¢Â&–ÖvR ¢Â'f–FVò ¢Â&VF–ò ¢Â&Fö7VÖVçB ¢Â'F‡VÖ&æ–Â ¢Â&÷F†W" ¢6öçFVçE÷–V6U÷G—S ¢Â&–FV ¢Â&†öö² ¢Â'F—FÆR ¢Â&6F–öâ ¢Â'67&—B ¢Â'fö–6V÷fW" ¢Â&&Æör ¢Â'6VõöÖWF ¢Â&7F ¢Â&†6‡Fw2 ¢Â&f ¢Â'ÆFf÷&Õö6÷’ ¢6öçFVçE÷6÷W&6U÷G—S ¢Â&–ç7V7F–öâ ¢Â&–ç7V7F–öåö—FVÒ ¢Â'v÷&µö÷&FW" ¢Â'v÷&µö÷&FW%öÆ–æR ¢Â'fV†–6ÆUöÖVF– ¢Â&ÖçVÂ ¢Â&÷F†W" ¢6öçFVçE÷7FGW3 ¢Â&G&gB ¢Â'VWVVB ¢Â'&ö6W76–ær ¢Â'&VG’ ¢Â'V&Æ—6†VB ¢Â&f–ÆVB ¢Â&&6†—fVB ¢6öçFVçE÷G—S ¢Â'v÷&¶fÆ÷uöFVÖò ¢Â'&W—%÷7F÷'’ ¢Â&–ç7V7F–öåö†–v†Æ–v‡B ¢Â&&Vf÷&UögFW" ¢Â&VGV6F–öæÅ÷F— ¢Â&†÷u÷Fò ¢Â&f–æF–æw5ööå÷fV†–6ÆR ¢Â&&Æöu÷÷7B ¢Â&f ¢Â&vöövÆUö'W6–æW75÷÷7B ¢Â&VÖ–Å÷6æ—WB ¢Â'6ö6–Å÷÷7B ¢f—FÖVçEöWfVçE÷G—S¢&ÆÆö6FVB"Â&6öç7VÖVB ¢fÆVWE÷&öw&Õö6FVæ6S ¢Â&ÖöçF†Ç’ ¢Â'V'FW&Ç’ ¢Â&Ö–ÆVvUö&6VB ¢Â&†÷W'5ö&6VB ¢–ç7V7F–öåö—FVÕ÷7FGW3¢&ö²"Â&f–Â"Â&æ"Â'&V6öÖÖVæB ¢–ç7V7F–öå÷7FGW3 ¢Â&æWr ¢Â&–å÷&öw&W72 ¢Â'W6VB ¢Â&6ö×ÆWFVB ¢Â&&÷'FVB ¢¦ö%÷G—UöVçVÓ¢&F–væ÷6—2"Â&–ç7V7F–öâ"Â&Ö–çFVææ6R"Â'&W—" ¢'E÷&WVW7Eö—FVÕ÷7FGW3 ¢Â'&WVW7FVB ¢Â'V÷FVB ¢Â&v—F–æuö7W7FöÖW%ö&÷fÂ ¢Â&&÷fVB ¢Â'&W6W'fVB ¢Â'–6¶–ær ¢Â'–6¶VB ¢Â&÷&FW&VB ¢Â''F–ÆÇ•÷&V6V—fVB ¢Â'&V6V—fVB ¢Â&6öç7VÖVB ¢Â&6æ6VÆÆVB ¢Â''F–ÆÇ•ö÷&FW&VB ¢Â''F–ÆÇ•ö6öç7VÖVB ¢Â''F–ÆÇ•÷&WGW&æVB ¢Â'&WGW&æVB ¢'E÷&WVW7E÷7FGW3 ¢Â'&WVW7FVB ¢Â'V÷FVB ¢Â&&÷fVB ¢Â&gVÆf–ÆÆVB ¢Â'&V¦V7FVB ¢Â&6æ6VÆÆVB ¢Â''F–ÆÇ•ö÷&FW&VB ¢Â''F–ÆÇ•ö6öç7VÖVB ¢Â''F–ÆÇ•÷&WGW&æVB ¢Â'&WGW&æVB ¢Â&FVfW'&VB ¢Æå÷C ¢Â'7F'FW" ¢Â'&ò ¢Â'&õ÷ÇW2 ¢Â&6ö×ÆWFUó ¢Â&6ö×ÆWFUóS ¢Â&6ö×ÆWFUó ¢Â&6ö×ÆWFU÷VæÆ–Ö—FVB ¢Â'VæÆ–Ö—FVB ¢Â&g&VR ¢Â&F—’ ¢V&Æ–6F–öå÷7FGW3 ¢Â&G&gB ¢Â'VWVVB ¢Â'V&Æ—6†–ær ¢Â'V&Æ—6†VB ¢Â&f–ÆVB ¢Â'6¶—VB ¢V&Æ—6…÷ÆFf÷&Ó ¢Â&–ç7Fw&Õ÷&VVÇ2 ¢Â&f6V&öö² ¢Â'–÷WGV&U÷6†÷'G2 ¢Â'F–·Fö² ¢Â&&Æör ¢Â&Æ–æ¶VF–â ¢Â&vöövÆUö'W6–æW72 ¢Â&VÖ–Â ¢Væ6…öWfVçE÷G—S ¢Â'7F'B ¢Â&'&Vµ÷7F'B ¢Â&'&VµöVæB ¢Â&ÇVæ6…÷7F'B ¢Â&ÇVæ6…öVæB ¢Â&VæB ¢V÷FU÷&WVW7E÷7FGW3¢'VæF–ær"Â&–å÷&öw&W72"Â&FöæR ¢6†–gE÷7FGW3¢&7F—fR"Â&VæFVB ¢6†÷&VVÅöG&gE÷7FGW3¢&G&gB"Â&–å÷&Wf–Wr"Â&&÷fVB ¢6†÷&VVÅö÷÷'GVæ—G•ö7F–öã¢&66WFVB"Â&F—6Ö—76VB"Â&vVæW&FVB ¢6†÷&VVÅö÷÷'GVæ—G•÷7FGW3 ¢Â&æWr ¢Â&66WFVB ¢Â&F—6Ö—76VB ¢Â&vVæW&FVB ¢7Fö6µöÖ÷fU÷&V6öã ¢Â'&V6V—fR ¢Â&F§W7B ¢Â&6öç7VÖR ¢Â'&WGW&â ¢Â'G&ç6fW%ö÷WB ¢Â'G&ç6fW%ö–â ¢Â'võöÆÆö6FR ¢Â'võ÷&VÆV6R ¢Â'6VVB ¢W6W%÷&öÆUöVçVÓ ¢Â&÷væW" ¢Â&FÖ–â ¢Â&ÖævW" ¢Â&ÖV6†æ–2 ¢Â&Gf—6÷" ¢Â''G2 ¢Â&7W7FöÖW" ¢Â&G&—fW" ¢Â&F—7F6†W" ¢Â&fÆVWEöÖævW" ¢Â&f÷&VÖâ ¢Â&ÆVEö†æB ¢Â'6W'f–6R ¢Â'Væ¶æ÷vâ ¢Ð¢6ö×÷6—FUG—W3¢°¢µò–âæWfW%Ó¢æWfW ¢Ð¢Ð§Ð §G—RFF&6Uv—F†÷WD–çFW&æÇ2ÒöÖ—CÄFF&6RÂ%õô–çFW&æÅ7W&6R#à §G—RFVfVÇE66†VÖÒFF&6Uv—F†÷WD–çFW&æÇ5´W‡G&7CÆ¶W–öbFF&6RÂ'V&Æ–2#åÐ ¦W‡÷'BG—RF&ÆW3À¢FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG0¢Â¶W–öb„FVfVÇE66†VÖ²%F&ÆW2%ÒbFVfVÇE66†VÖ²%f–Ww2%Ò¢Â²66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ2ÒÀ¢F&ÆTæÖRW‡FVæG2FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0¢Ð¢ò¶W–öb„FF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%F&ÆW2%Ò`¢FF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%f–Ww2%Ò¢¢æWfW"ÒæWfW"À£âÒFVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0§Ð¢ò„FF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%F&ÆW2%Ò`¢FF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%f–Ww2%Ò•µF&ÆTæÖUÒW‡FVæG2°¢&÷s¢–æfW" ¢Ð¢ò ¢¢æWfW ¢¢FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2¶W–öb„FVfVÇE66†VÖ²%F&ÆW2%Ò`¢FVfVÇE66†VÖ²%f–Ww2%Ò¢ò„FVfVÇE66†VÖ²%F&ÆW2%Ò`¢FVfVÇE66†VÖ²%f–Ww2%Ò•´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5ÒW‡FVæG2°¢&÷s¢–æfW" ¢Ð¢ò ¢¢æWfW ¢¢æWfW  ¦W‡÷'BG—RF&ÆW4–ç6W'CÀ¢FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG0¢Â¶W–öbFVfVÇE66†VÖ²%F&ÆW2%Ð¢Â²66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ2ÒÀ¢F&ÆTæÖRW‡FVæG2FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0¢Ð¢ò¶W–öbFF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%F&ÆW2%Ð¢¢æWfW"ÒæWfW"À£âÒFVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0§Ð¢òFF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%F&ÆW2%ÕµF&ÆTæÖUÒW‡FVæG2°¢–ç6W'C¢–æfW"¢Ð¢ò¢¢æWfW ¢¢FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2¶W–öbFVfVÇE66†VÖ²%F&ÆW2%Ð¢òFVfVÇE66†VÖ²%F&ÆW2%Õ´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5ÒW‡FVæG2°¢–ç6W'C¢–æfW"¢Ð¢ò¢¢æWfW ¢¢æWfW  ¦W‡÷'BG—RF&ÆW5WFFSÀ¢FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG0¢Â¶W–öbFVfVÇE66†VÖ²%F&ÆW2%Ð¢Â²66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ2ÒÀ¢F&ÆTæÖRW‡FVæG2FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0¢Ð¢ò¶W–öbFF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%F&ÆW2%Ð¢¢æWfW"ÒæWfW"À£âÒFVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0§Ð¢òFF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²%F&ÆW2%ÕµF&ÆTæÖUÒW‡FVæG2°¢WFFS¢–æfW"P¢Ð¢òP¢¢æWfW ¢¢FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç2W‡FVæG2¶W–öbFVfVÇE66†VÖ²%F&ÆW2%Ð¢òFVfVÇE66†VÖ²%F&ÆW2%Õ´FVfVÇE66†VÖF&ÆTæÖT÷$÷F–öç5ÒW‡FVæG2°¢WFFS¢–æfW"P¢Ð¢òP¢¢æWfW ¢¢æWfW  ¦W‡÷'BG—RVçV×3À¢FVfVÇE66†VÖVçVÔæÖT÷$÷F–öç2W‡FVæG0¢Â¶W–öbFVfVÇE66†VÖ²$VçV×2%Ð¢Â²66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ2ÒÀ¢VçVÔæÖRW‡FVæG2FVfVÇE66†VÖVçVÔæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0¢Ð¢ò¶W–öbFF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖVçVÔæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²$VçV×2%Ð¢¢æWfW"ÒæWfW"À£âÒFVfVÇE66†VÖVçVÔæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0§Ð¢òFF&6Uv—F†÷WD–çFW&æÇ5´FVfVÇE66†VÖVçVÔæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²$VçV×2%Õ´VçVÔæÖUÐ¢¢FVfVÇE66†VÖVçVÔæÖT÷$÷F–öç2W‡FVæG2¶W–öbFVfVÇE66†VÖ²$VçV×2%Ð¢òFVfVÇE66†VÖ²$VçV×2%Õ´FVfVÇE66†VÖVçVÔæÖT÷$÷F–öç5Ð¢¢æWfW  ¦W‡÷'BG—R6ö×÷6—FUG—W3À¢V&Æ–46ö×÷6—FUG—TæÖT÷$÷F–öç2W‡FVæG0¢Â¶W–öbFVfVÇE66†VÖ²$6ö×÷6—FUG—W2%Ð¢Â²66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ2ÒÀ¢6ö×÷6—FUG—TæÖRW‡FVæG2V&Æ–46ö×÷6—FUG—TæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0¢Ð¢ò¶W–öbFF&6Uv—F†÷WD–çFW&æÇ5µV&Æ–46ö×÷6—FUG—TæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²$6ö×÷6—FUG—W2%Ð¢¢æWfW"ÒæWfW"À£âÒV&Æ–46ö×÷6—FUG—TæÖT÷$÷F–öç2W‡FVæG2°¢66†VÖ¢¶W–öbFF&6Uv—F†÷WD–çFW&æÇ0§Ð¢òFF&6Uv—F†÷WD–çFW&æÇ5µV&Æ–46ö×÷6—FUG—TæÖT÷$÷F–öç5²'66†VÖ%ÕÕ²$6ö×÷6—FUG—W2%Õ´6ö×÷6—FUG—TæÖUÐ¢¢V&Æ–46ö×÷6—FUG—TæÖT÷$÷F–öç2W‡FVæG2¶W–öbFVfVÇE66†VÖ²$6ö×÷6—FUG—W2%Ð¢òFVfVÇE66†VÖ²$6ö×÷6—FUG—W2%ÕµV&Æ–46ö×÷6—FUG—TæÖT÷$÷F–öç5Ð¢¢æWfW  ¦W‡÷'B6öç7B6öç7FçG2Ò°¢V&Æ–3¢°¢VçV×3¢°¢vVçEö7F–öå÷&—6³¢²&Æ÷r"Â&ÖVF—VÒ"Â&†–v‚%ÒÀ¢vVçEö7F–öå÷7FGW3¢°¢'&÷÷6VB"À¢&v—F–æuö&÷fÂ"À¢&&÷fVB"À¢'&V¦V7FVB"À¢&W†V7WF–ær"À¢'7V66VVFVB"À¢&f–ÆVB"À¢&6æ6VÆVB"À¢ÒÀ¢vVçEö¦ö%ö¶–æC¢°¢&æ÷F–g•öF—66÷&B"À¢&æÇ—¦U÷&WVW7B"À¢&7&VFUö—77VU÷""À¢''Våö6†V6·2"À¢&Ç•öf—‚"À¢ÒÀ¢vVçEö¦ö%÷7FGW3¢°¢'VWVVB"À¢''Vææ–ær"À¢'7V66VVFVB"À¢&f–ÆVB"À¢&6æ6VÆVB"À¢&FVB"À¢ÒÀ¢vVçEöÖW76vUöF—&V7F–öã¢²'FõövVçB"Â'Fõ÷W6W"%ÒÀ¢vVçE÷&WVW7Eö–çFVçC¢°¢&fVGW&U÷&WVW7B"À¢&'Vu÷&W÷'B"À¢&–ç7V7F–öåö6FÆöuöFB"À¢'6W'f–6Uö6FÆöuöFB"À¢'&Vf7F÷""À¢ÒÀ¢vVçE÷&WVW7E÷7FGW3¢°¢'7V&Ö—GFVB"À¢&–å÷&öw&W72"À¢&v—F–æuö&÷fÂ"À¢&&÷fVB"À¢'&V¦V7FVB"À¢&f–ÆVB"À¢&ÖW&vVB"À¢ÒÀ¢•÷G&–æ–æu÷6÷W&6S¢°¢'V÷FR"À¢&ö–çFÖVçB"À¢&–ç7V7F–öâ"À¢'v÷&µö÷&FW""À¢&7W7FöÖW""À¢'fV†–6ÆR"À¢&fÆVWB"À¢ÒÀ¢æÇ—F–75öWfVçE÷G—S¢°¢&–×&W76–öâ"À¢'f–Wr"À¢&6Æ–6²"À¢&Æ–¶R"À¢&6öÖÖVçB"À¢'6†&R"À¢'6fR"À¢'vF6…÷F–ÖR"À¢&VævvVÖVçB"À¢'&æ²"À¢&ÆVB"À¢&÷F†W""À¢ÒÀ¢'&æEö76WEö¶–æC¢°¢&Æövò"À¢&–6öâ"À¢'v÷&FÖ&²"À¢&&FvR"À¢&ff–6öâ"À¢'vFW&Ö&²"À¢ÒÀ¢'&æE÷6÷W&6Uö¢²'&öf—†—"Â'6†÷&VVÂ%ÒÀ¢6öçFVçEö76WE÷G—S¢°¢&–ÖvR"À¢'f–FVò"À¢&VF–ò"À¢&Fö7VÖVçB"À¢'F‡VÖ&æ–Â"À¢&÷F†W""À¢ÒÀ¢6öçFVçE÷–V6U÷G—S¢°¢&–FV"À¢&†öö²"À¢'F—FÆR"À¢&6F–öâ"À¢'67&—B"À¢'fö–6V÷fW""À¢&&Æör"À¢'6VõöÖWF"À¢&7F"À¢&†6‡Fw2"À¢&f"À¢'ÆFf÷&Õö6÷’"À¢ÒÀ¢6öçFVçE÷6÷W&6U÷G—S¢°¢&–ç7V7F–öâ"À¢&–ç7V7F–öåö—FVÒ"À¢'v÷&µö÷&FW""À¢'v÷&µö÷&FW%öÆ–æR"À¢'fV†–6ÆUöÖVF–"À¢&ÖçVÂ"À¢&÷F†W""À¢ÒÀ¢6öçFVçE÷7FGW3¢°¢&G&gB"À¢'VWVVB"À¢'&ö6W76–ær"À¢'&VG’"À¢'V&Æ—6†VB"À¢&f–ÆVB"À¢&&6†—fVB"À¢ÒÀ¢6öçFVçE÷G—S¢°¢'v÷&¶fÆ÷uöFVÖò"À¢'&W—%÷7F÷'’"À¢&–ç7V7F–öåö†–v†Æ–v‡B"À¢&&Vf÷&UögFW""À¢&VGV6F–öæÅ÷F—"À¢&†÷u÷Fò"À¢&f–æF–æw5ööå÷fV†–6ÆR"À¢&&Æöu÷÷7B"À¢&f"À¢&vöövÆUö'W6–æW75÷÷7B"À¢&VÖ–Å÷6æ—WB"À¢'6ö6–Å÷÷7B"À¢ÒÀ¢f—FÖVçEöWfVçE÷G—S¢²&ÆÆö6FVB"Â&6öç7VÖVB%ÒÀ¢fÆVWE÷&öw&Õö6FVæ6S¢°¢&ÖöçF†Ç’"À¢'V'FW&Ç’"À¢&Ö–ÆVvUö&6VB"À¢&†÷W'5ö&6VB"À¢ÒÀ¢–ç7V7F–öåö—FVÕ÷7FGW3¢²&ö²"Â&f–Â"Â&æ"Â'&V6öÖÖVæB%ÒÀ¢–ç7V7F–öå÷7FGW3¢°¢&æWr"À¢&–å÷&öw&W72"À¢'W6VB"À¢&6ö×ÆWFVB"À¢&&÷'FVB"À¢ÒÀ¢¦ö%÷G—UöVçVÓ¢²&F–væ÷6—2"Â&–ç7V7F–öâ"Â&Ö–çFVææ6R"Â'&W—"%ÒÀ¢'E÷&WVW7Eö—FVÕ÷7FGW3¢°¢'&WVW7FVB"À¢'V÷FVB"À¢&v—F–æuö7W7FöÖW%ö&÷fÂ"À¢&&÷fVB"À¢'&W6W'fVB"À¢'–6¶–ær"À¢'–6¶VB"À¢&÷&FW&VB"À¢''F–ÆÇ•÷&V6V—fVB"À¢'&V6V—fVB"À¢&6öç7VÖVB"À¢&6æ6VÆÆVB"À¢''F–ÆÇ•ö÷&FW&VB"À¢''F–ÆÇ•ö6öç7VÖVB"À¢''F–ÆÇ•÷&WGW&æVB"À¢'&WGW&æVB"À¢ÒÀ¢'E÷&WVW7E÷7FGW3¢°¢'&WVW7FVB"À¢'V÷FVB"À¢&&÷fVB"À¢&gVÆf–ÆÆVB"À¢'&V¦V7FVB"À¢&6æ6VÆÆVB"À¢''F–ÆÇ•ö÷&FW&VB"À¢''F–ÆÇ•ö6öç7VÖVB"À¢''F–ÆÇ•÷&WGW&æVB"À¢'&WGW&æVB"À¢&FVfW'&VB"À¢ÒÀ¢Æå÷C¢°¢'7F'FW""À¢'&ò"À¢'&õ÷ÇW2"À¢&6ö×ÆWFUó"À¢&6ö×ÆWFUóS"À¢&6ö×ÆWFUó"À¢&6ö×ÆWFU÷VæÆ–Ö—FVB"À¢'VæÆ–Ö—FVB"À¢&g&VR"À¢&F—’"À¢ÒÀ¢V&Æ–6F–öå÷7FGW3¢°¢&G&gB"À¢'VWVVB"À¢'V&Æ—6†–ær"À¢'V&Æ—6†VB"À¢&f–ÆVB"À¢'6¶—VB"À¢ÒÀ¢V&Æ—6…÷ÆFf÷&Ó¢°¢&–ç7Fw&Õ÷&VVÇ2"À¢&f6V&öö²"À¢'–÷WGV&U÷6†÷'G2"À¢'F–·Fö²"À¢&&Æör"À¢&Æ–æ¶VF–â"À¢&vöövÆUö'W6–æW72"À¢&VÖ–Â"À¢ÒÀ¢Væ6…öWfVçE÷G—S¢°¢'7F'B"À¢&'&Vµ÷7F'B"À¢&'&VµöVæB"À¢&ÇVæ6…÷7F'B"À¢&ÇVæ6…öVæB"À¢&VæB"À¢ÒÀ¢V÷FU÷&WVW7E÷7FGW3¢²'VæF–ær"Â&–å÷&öw&W72"Â&FöæR%ÒÀ¢6†–gE÷7FGW3¢²&7F—fR"Â&VæFVB%ÒÀ¢6†÷&VVÅöG&gE÷7FGW3¢²&G&gB"Â&–å÷&Wf–Wr"Â&&÷fVB%ÒÀ¢6†÷&VVÅö÷÷'GVæ—G•ö7F–öã¢²&66WFVB"Â&F—6Ö—76VB"Â&vVæW&FVB%ÒÀ¢6†÷&VVÅö÷÷'GVæ—G•÷7FGW3¢°¢&æWr"À¢&66WFVB"À¢&F—6Ö—76VB"À¢&vVæW&FVB"À¢ÒÀ¢7Fö6µöÖ÷fU÷&V6öã¢°¢'&V6V—fR"À¢&F§W7B"À¢&6öç7VÖR"À¢'&WGW&â"À¢'G&ç6fW%ö÷WB"À¢'G&ç6fW%ö–â"À¢'võöÆÆö6FR"À¢'võ÷&VÆV6R"À¢'6VVB"À¢ÒÀ¢W6W%÷&öÆUöVçVÓ¢°¢&÷væW""À¢&FÖ–â"À¢&ÖævW""À¢&ÖV6†æ–2"À¢&Gf—6÷""À¢''G2"À¢&7W7FöÖW""À¢&G&—fW""À¢&F—7F6†W""À¢&fÆVWEöÖævW""À¢&f÷&VÖâ"À¢&ÆVEö†æB"À¢'6W'f–6R"À¢'Væ¶æ÷vâ"À¢ÒÀ¢ÒÀ¢ÒÀ§Ò26öç7@ 