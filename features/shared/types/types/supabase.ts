Warning: truncated output (original token count: 251485)
Total output lines: 31708

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
          first_observed_at: string
          last_observed_at: string
        }
        Insert: {
          contract: string
          deployment_id?: string | null
          deployment_sha: string
          first_observed_at?: string
          last_observed_at?: string
        }
        Update: {
          contract?: string
          deployment_id?: string | null
          deployment_sha?: string
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
          tax_amount…181485 tokens truncated…       invoice_pdf_url?: string | null
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
      apply_assigned_job_punch_transition_atomic: {
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
      apply_portal_parts_hold_line_decision_atomic: {
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
      apply_pre_labor_parts_quote_hold_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_details?: Json
          p_event?: string
          p_expected_line_updated_at?: string
          p_hold_reason?: string
          p_notes?: string
          p_operation_key: string
          p_shop_id: string
          p_work_order_line_id: string
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
      apply_staff_line_decision_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_decision: string
          p_line_id: string
          p_operation_key: string
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
      archive_work_order_atomic: {
        Args: {
          p_actor_user_id: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      assert_quote_parts_publishable: {
        Args: {
          p_quote_line_ids: string[]
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      assign_work_order_line_technician_atomic:
        | {
            Args: {
              p_action: string
              p_actor_user_id: string
              p_expected_updated_at?: string
              p_operation_key: string
              p_shop_id: string
              p_technician_id: string
              p_work_order_line_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_assigned_by: string
              p_operation_key: string
              p_shop_id: string
              p_technician_id: string
              p_work_order_line_id: string
            }
            Returns: Json
          }
      assign_work_order_primary_technician_bulk_atomic: {
        Args: {
          p_actor_user_id: string
          p_only_unassigned: boolean
          p_operation_key: string
          p_shop_id: string
          p_technician_id: string
          p_work_order_id: string
        }
        Returns: Json
      }
      assistant_notification_trusted_writer_rollout_complete: {
        Args: never
        Returns: boolean
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
      create_manual_work_order_line_atomic: {
        Args: {
          p_actor_profile_id: string
          p_authenticated_user_id: string
          p_complaint: string
          p_correction: string
          p_labor_time: number
          p_line_id: string
          p_parts_text: string
          p_shop_id: string
          p_urgency: string
          p_work_order_id: string
        }
        Returns: Json
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
          archived_at: string | null
          archived_by_user_id: string | null
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
      field_configure_standalone_owner_atomic: {
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
      field_service_vehicle_assignment_quarantine_report: {
        Args: { p_limit?: number; p_shop_id?: string }
        Returns: {
          assigned_by_profile_id: string
          assignment_created_at: string
          assignment_updated_at: string
          profile_id: string
          quarantine_id: number
          quarantined_at: string
          reason: string
          service_vehicle_id: string
          shop_id: string
          source_migration: string
        }[]
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
      mark_assistant_notification_trusted_writer_rollout: {
        Args: { p_deployment_id?: string; p_deployment_sha: string }
        Returns: undefined
      }
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
      mobile_service_visit_transition_receipt_exists: {
        Args: {
          p_actor_user_id: string
          p_operation_key: string
          p_shop_id: string
        }
        Returns: boolean
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
      mutate_work_order_line_assignment_atomic: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_expected_updated_at?: string
          p_operation_key: string
          p_shop_id: string
          p_technician_id: string
          p_work_order_line_id: string
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
      report_work_order_line_assignment_ambiguities: {
        Args: { p_shop_id?: string }
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
      submit_inspection_findings_atomic: {
        Args: {
          p_actor_user_id: string
          p_at?: string
          p_expected_sync_revision: number
          p_inspection_id: string
          p_items: Json
          p_operation_key: string
          p_requested_vehicle_id: string
          p_selection: Json
          p_shop_id: string
          p_work_order_id: string
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
      transition_legacy_quote_send_atomic: {
        Args: {
          p_action: string
          p_actor_profile_id: string
          p_actor_user_id: string
          p_allow_resend: boolean
          p_expected_lines: Json
          p_failure: string
          p_operation_key: string
          p_quote_line_ids: string[]
          p_quote_url: string
          p_sent_at: string
          p_shop_id: string
          p_work_order_id: string
        }
        Returns: Json
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
      workspace_actor_has_capability: {
        Args: { p_capability_key: string; p_shop_id: string }
        Returns: boolean
      }
      workspace_actor_is_staff_for_shop: {
        Args: { p_shop_id: string }
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
