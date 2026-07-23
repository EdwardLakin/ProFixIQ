export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
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
      admin_users: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
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
      agent_job_events: {
        Row: {
          created_at: string
          detail: Json
          event: string
          id: number
          job_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          event: string
          id?: number
          job_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          event?: string
          id?: number
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
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
      agent_knowledge: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          shop_id: string | null
          slug: string
          tags: string[] | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          shop_id?: string | null
          slug: string
          tags?: string[] | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          shop_id?: string | null
          slug?: string
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          attempts: number
          body: Json
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          direction: Database["public"]["Enums"]["agent_message_direction"]
          id: string
          kind: string
          last_error: string | null
          last_error_at: string | null
          max_attempts: number
          processed_at: string | null
          processed_by: string | null
          request_id: string
          run_after: string
        }
        Insert: {
          attempts?: number
          body?: Json
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["agent_message_direction"]
          id?: string
          kind: string
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number
          processed_at?: string | null
          processed_by?: string | null
          request_id: string
          run_after?: string
        }
        Update: {
          attempts?: number
          body?: Json
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["agent_message_direction"]
          id?: string
          kind?: string
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number
          processed_at?: string | null
          processed_by?: string | null
          request_id?: string
          run_after?: string
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
      ai_generation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          id: string
          input_payload: Json
          model: string | null
          output_payload: Json
          prompt_version: string | null
          provider: string | null
          requested_by: string | null
          score_predicted: number | null
          shop_id: string
          started_at: string | null
          status: string
          system_prompt: string | null
          template_id: string | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          user_prompt: string | null
          video_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_payload?: Json
          model?: string | null
          output_payload?: Json
          prompt_version?: string | null
          provider?: string | null
          requested_by?: string | null
          score_predicted?: number | null
          shop_id: string
          started_at?: string | null
          status?: string
          system_prompt?: string | null
          template_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          updated_at?: string
          user_prompt?: string | null
          video_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_payload?: Json
          model?: string | null
          output_payload?: Json
          prompt_version?: string | null
          provider?: string | null
          requested_by?: string | null
          score_predicted?: number | null
          shop_id?: string
          started_at?: string | null
          status?: string
          system_prompt?: string | null
          template_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          updated_at?: string
          user_prompt?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_runs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_runs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_runs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "ai_generation_runs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
          {
            foreignKeyName: "ai_training_data_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "ai_training_events_v"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_events: {
        Row: {
          ai_event_id: string | null
          created_at: string
          id: string
          payload: Json
          shop_id: string
          source: string
          vehicle_ymm: string | null
        }
        Insert: {
          ai_event_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          shop_id: string
          source: string
          vehicle_ymm?: string | null
        }
        Update: {
          ai_event_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          shop_id?: string
          source?: string
          vehicle_ymm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_training_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
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
      bookings: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          ends_at: string
          id: string
          notes: string | null
          shop_id: string
          starts_at: string
          status: string
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          shop_id: string
          starts_at: string
          status?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          shop_id?: string
          starts_at?: string
          status?: string
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
      content_analytics_events: {
        Row: {
          content_event_id: string | null
          content_piece_id: string | null
          created_at: string
          event_count: number | null
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          event_value: number | null
          id: string
          metadata: Json
          occurred_at: string
          platform: Database["public"]["Enums"]["publish_platform"] | null
          publication_id: string | null
          shop_id: string
        }
        Insert: {
          content_event_id?: string | null
          content_piece_id?: string | null
          created_at?: string
          event_count?: number | null
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          event_value?: number | null
          id?: string
          metadata?: Json
          occurred_at?: string
          platform?: Database["public"]["Enums"]["publish_platform"] | null
          publication_id?: string | null
          shop_id: string
        }
        Update: {
          content_event_id?: string | null
          content_piece_id?: string | null
          created_at?: string
          event_count?: number | null
          event_type?: Database["public"]["Enums"]["analytics_event_type"]
          event_value?: number | null
          id?: string
          metadata?: Json
          occurred_at?: string
          platform?: Database["public"]["Enums"]["publish_platform"] | null
          publication_id?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_analytics_events_content_event_id_fkey"
            columns: ["content_event_id"]
            isOneToOne: false
            referencedRelation: "content_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_analytics_events_content_piece_id_fkey"
            columns: ["content_piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_analytics_events_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "content_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_analytics_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_analytics_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
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
      content_calendar_items: {
        Row: {
          calendar_id: string
          caption: string | null
          content_type: string
          created_at: string | null
          cta: string | null
          hook: string | null
          id: string
          platform_targets: string[] | null
          publish_date: string
          shop_id: string
          source_video_id: string | null
          source_work_order_id: string | null
          status: string
          title: string | null
        }
        Insert: {
          calendar_id: string
          caption?: string | null
          content_type: string
          created_at?: string | null
          cta?: string | null
          hook?: string | null
          id?: string
          platform_targets?: string[] | null
          publish_date: string
          shop_id: string
          source_video_id?: string | null
          source_work_order_id?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          calendar_id?: string
          caption?: string | null
          content_type?: string
          created_at?: string | null
          cta?: string | null
          hook?: string | null
          id?: string
          platform_targets?: string[] | null
          publish_date?: string
          shop_id?: string
          source_video_id?: string | null
          source_work_order_id?: string | null
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_calendar_items_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "content_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      content_calendars: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          shop_id: string
          start_date: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          shop_id: string
          start_date: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          shop_id?: string
          start_date?: string
          status?: string
          title?: string
        }
        Relationships: []
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
          id: string
          participant_kind: string
          role: string | null
          user_id: string
        }
        Insert: {
          added_at?: string | null
          conversation_id: string
          id?: string
          participant_kind?: string
          role?: string | null
          user_id: string
        }
        Update: {
          added_at?: string | null
          conversation_id?: string
          id?: string
          participant_kind?: string
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
        Relationships: []
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
            referencedRelation: "shops"
            referencedColumns: ["id"]
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
        Relationships: [
          {
            foreignKeyName: "customer_quotes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_quotes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_settings: {
        Row: {
          comm_email_enabled: boolean
          comm_sms_enabled: boolean
          customer_id: string
          language: string | null
          marketing_opt_in: boolean
          preferred_contact: string | null
          timezone: string | null
          units: string | null
          updated_at: string
        }
        Insert: {
          comm_email_enabled?: boolean
          comm_sms_enabled?: boolean
          customer_id: string
          language?: string | null
          marketing_opt_in?: boolean
          preferred_contact?: string | null
          timezone?: string | null
          units?: string | null
          updated_at?: string
        }
        Update: {
          comm_email_enabled?: boolean
          comm_sms_enabled?: boolean
          customer_id?: string
          language?: string | null
          marketing_opt_in?: boolean
          preferred_contact?: string | null
          timezone?: string | null
          units?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_settings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          business_name: string | null
          city: string | null
          created_at: string | null
          customer_since: string | null
          email: string | null
          external_id: string | null
          first_name: string | null
          id: string
          import_confidence: number | null
          import_notes: string | null
          is_fleet: boolean
          last_name: string | null
          name: string | null
          notes: string | null
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
          address?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          customer_since?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          is_fleet?: boolean
          last_name?: string | null
          name?: string | null
          notes?: string | null
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
          address?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          customer_since?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          import_confidence?: number | null
          import_notes?: string | null
          is_fleet?: boolean
          last_name?: string | null
          name?: string | null
          notes?: string | null
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
      cvip_specs: {
        Row: {
          component: string
          created_at: string
          defect_group: string
          description: string | null
          fail_operator: string
          id: string
          jurisdiction: string
          mandatory_measurement: boolean
          measurement_type: string
          notes: string | null
          source_section: string | null
          source_standard: string
          spec_code: string
          threshold_max: number | null
          threshold_min: number | null
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          component: string
          created_at?: string
          defect_group: string
          description?: string | null
          fail_operator?: string
          id?: string
          jurisdiction?: string
          mandatory_measurement?: boolean
          measurement_type: string
          notes?: string | null
          source_section?: string | null
          source_standard?: string
          spec_code: string
          threshold_max?: number | null
          threshold_min?: number | null
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          component?: string
          created_at?: string
          defect_group?: string
          description?: string | null
          fail_operator?: string
          id?: string
          jurisdiction?: string
          mandatory_measurement?: boolean
          measurement_type?: string
          notes?: string | null
          source_section?: string | null
          source_standard?: string
          spec_code?: string
          threshold_max?: number | null
          threshold_min?: number | null
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cvip_thresholds: {
        Row: {
          axle_position: string | null
          category: string
          chamber_size: string | null
          component: string
          extra_tag: string | null
          fail_max: number | null
          fail_min: number | null
          id: string
          jurisdiction_code: string
          location_code: string | null
          measurement_type: string
          spec_code: string
          unit: string
          warn_max: number | null
          warn_min: number | null
        }
        Insert: {
          axle_position?: string | null
          category: string
          chamber_size?: string | null
          component: string
          extra_tag?: string | null
          fail_max?: number | null
          fail_min?: number | null
          id?: string
          jurisdiction_code?: string
          location_code?: string | null
          measurement_type: string
          spec_code: string
          unit: string
          warn_max?: number | null
          warn_min?: number | null
        }
        Update: {
          axle_position?: string | null
          category?: string
          chamber_size?: string | null
          component?: string
          extra_tag?: string | null
          fail_max?: number | null
          fail_min?: number | null
          id?: string
          jurisdiction_code?: string
          location_code?: string | null
          measurement_type?: string
          spec_code?: string
          unit?: string
          warn_max?: number | null
          warn_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cvip_thresholds_spec_code_fkey"
            columns: ["spec_code"]
            isOneToOne: false
            referencedRelation: "cvip_specs"
            referencedColumns: ["spec_code"]
          },
        ]
      }
      cvip_thresholds_master: {
        Row: {
          code: string
          description: string | null
          direction: string
          fail_max_imperial: number | null
          fail_max_metric: number | null
          fail_min_imperial: number | null
          fail_min_metric: number | null
          id: string
          label: string
          notes: Json | null
          spec_id: string
          unit_imperial: string | null
          unit_metric: string | null
        }
        Insert: {
          code: string
          description?: string | null
          direction: string
          fail_max_imperial?: number | null
          fail_max_metric?: number | null
          fail_min_imperial?: number | null
          fail_min_metric?: number | null
          id?: string
          label: string
          notes?: Json | null
          spec_id: string
          unit_imperial?: string | null
          unit_metric?: string | null
        }
        Update: {
          code?: string
          description?: string | null
          direction?: string
          fail_max_imperial?: number | null
          fail_max_metric?: number | null
          fail_min_imperial?: number | null
          fail_min_metric?: number | null
          id?: string
          label?: string
          notes?: Json | null
          spec_id?: string
          unit_imperial?: string | null
          unit_metric?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cvip_thresholds_master_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "cvip_specs"
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
          snapshot: Json | null
        }
        Insert: {
          country?: string
          created_at?: string
          has_unlocked?: boolean
          id?: string
          intake_id?: string | null
          shop_id?: string | null
          shop_name: string
          snapshot?: Json | null
        }
        Update: {
          country?: string
          created_at?: string
          has_unlocked?: boolean
          id?: string
          intake_id?: string | null
          shop_id?: string | null
          shop_name?: string
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_shop_boosts_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "shop_boost_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_shop_boosts_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "v_shop_boost_overview"
            referencedColumns: ["intake_id"]
          },
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
      email_logs: {
        Row: {
          created_at: string
          created_by: string | null
          error_text: string | null
          id: string
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
          error_text?: string | null
          id?: string
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
          error_text?: string | null
          id?: string
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
          doc_type: string
          expires_at: string | null
          file_path: string
          id: string
          shop_id: string
          status: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          bucket_id?: string
          doc_type: string
          expires_at?: string | null
          file_path: string
          id?: string
          shop_id: string
          status?: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          bucket_id?: string
          doc_type?: string
          expires_at?: string | null
          file_path?: string
          id?: string
          shop_id?: string
          status?: string
          uploaded_at?: string
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
            foreignKeyName: "employee_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      fleet_dispatch_assignments: {
        Row: {
          created_at: string
          driver_name: string | null
          driver_profile_id: string
          fleet_id: string
          id: string
          next_pretrip_due: string | null
          route_label: string | null
          shop_id: string
          state: string
          unit_label: string | null
          updated_at: string
          vehicle_id: string
          vehicle_identifier: string | null
        }
        Insert: {
          created_at?: string
          driver_name?: string | null
          driver_profile_id: string
          fleet_id: string
          id?: string
          next_pretrip_due?: string | null
          route_label?: string | null
          shop_id: string
          state?: string
          unit_label?: string | null
          updated_at?: string
          vehicle_id: string
          vehicle_identifier?: string | null
        }
        Update: {
          created_at?: string
          driver_name?: string | null
          driver_profile_id?: string
          fleet_id?: string
          id?: string
          next_pretrip_due?: string | null
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
      fleet_form_uploads: {
        Row: {
          created_at: string | null
          created_by: string | null
          detected_profile: Json | null
          error: string | null
          error_message: string | null
          extracted_text: string | null
          id: string
          mapped_sections: Json | null
          original_filename: string | null
          page_count: number | null
          parse_version: string | null
          parsed_sections: Json | null
          status: string
          storage_path: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          detected_profile?: Json | null
          error?: string | null
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          mapped_sections?: Json | null
          original_filename?: string | null
          page_count?: number | null
          parse_version?: string | null
          parsed_sections?: Json | null
          status?: string
          storage_path: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          detected_profile?: Json | null
          error?: string | null
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          mapped_sections?: Json | null
          original_filename?: string | null
          page_count?: number | null
          parse_version?: string | null
          parsed_sections?: Json | null
          status?: string
          storage_path?: string
          updated_at?: string | null
        }
        Relationships: []
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
          role: string
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
            foreignKeyName: "fleet_members_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "shops"
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
            foreignKeyName: "fleet_pretrip_reports_vehicle_id_fkey"
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
        }
        Insert: {
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
        }
        Update: {
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
      fleet_service_requests: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          fleet_id: string
          id: string
          scheduled_for_date: string | null
          severity: string
          shop_id: string
          source_pretrip_id: string | null
          status: string
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
          scheduled_for_date?: string | null
          severity: string
          shop_id: string
          source_pretrip_id?: string | null
          status?: string
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
          scheduled_for_date?: string | null
          severity?: string
          shop_id?: string
          source_pretrip_id?: string | null
          status?: string
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
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "history_imported_from_session_id_fkey"
            columns: ["imported_from_session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
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
      inspection_session_payloads: {
        Row: {
          payload: Json
          session_id: string
          updated_at: string
        }
        Insert: {
          payload: Json
          session_id: string
          updated_at?: string
        }
        Update: {
          payload?: Json
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_session_payloads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
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
            isOneToOne: true
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: true
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
          },
          {
            foreignKeyName: "inspection_sessions_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: true
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
          locked: boolean | null
          notes: string | null
          pdf_storage_path: string | null
          pdf_url: string | null
          photo_urls: string[] | null
          quote_id: string | null
          shop_id: string
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
          locked?: boolean | null
          notes?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          photo_urls?: string[] | null
          quote_id?: string | null
          shop_id: string
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
          locked?: boolean | null
          notes?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          photo_urls?: string[] | null
          quote_id?: string | null
          shop_id?: string
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
            foreignKeyName: "inspections_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
          },
          {
            foreignKeyName: "inspections_work_order_line_fk"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
      integration_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          provider: string
          request: Json | null
          response: Json | null
          shop_id: string | null
          success: boolean
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          provider: string
          request?: Json | null
          response?: Json | null
          shop_id?: string | null
          success?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          provider?: string
          request?: Json | null
          response?: Json | null
          shop_id?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          provider: string
          shop_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          provider: string
          shop_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
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
          paid_at: string | null
          parts_cost: number
          shop_id: string
          status: string
          subtotal: number
          tax_total: number
          tech_id: string | null
          total: number
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
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
          paid_at?: string | null
          parts_cost?: number
          shop_id: string
          status?: string
          subtotal?: number
          tax_total?: number
          tech_id?: string | null
          total?: number
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
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
          paid_at?: string | null
          parts_cost?: number
          shop_id?: string
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
            foreignKeyName: "invoices_tech_id_fkey"
            columns: ["tech_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          event_type: string
          id: string
          lead_value: number | null
          meta: Json
          occurred_at: string
          shop_id: string
          source_platform: string | null
          video_id: string | null
          video_platform_post_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          lead_value?: number | null
          meta?: Json
          occurred_at?: string
          shop_id: string
          source_platform?: string | null
          video_id?: string | null
          video_platform_post_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          lead_value?: number | null
          meta?: Json
          occurred_at?: string
          shop_id?: string
          source_platform?: string | null
          video_id?: string | null
          video_platform_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "lead_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_video_platform_post_id_fkey"
            columns: ["video_platform_post_id"]
            isOneToOne: false
            referencedRelation: "video_platform_posts"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
      learning_feedback: {
        Row: {
          ai_generation_run_id: string | null
          created_at: string
          created_by: string | null
          feedback_type: string
          id: string
          note: string | null
          payload: Json
          score: number | null
          shop_id: string
          video_id: string | null
        }
        Insert: {
          ai_generation_run_id?: string | null
          created_at?: string
          created_by?: string | null
          feedback_type: string
          id?: string
          note?: string | null
          payload?: Json
          score?: number | null
          shop_id: string
          video_id?: string | null
        }
        Update: {
          ai_generation_run_id?: string | null
          created_at?: string
          created_by?: string | null
          feedback_type?: string
          id?: string
          note?: string | null
          payload?: Json
          score?: number | null
          shop_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_feedback_ai_generation_run_id_fkey"
            columns: ["ai_generation_run_id"]
            isOneToOne: false
            referencedRelation: "ai_generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_feedback_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_feedback_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "learning_feedback_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
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
            foreignKeyName: "menu_items_inspection_template_id_fkey"
            columns: ["inspection_template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
      message_reads: {
        Row: {
          conversation_id: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
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
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "v_my_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      onboarding_activation_events: {
        Row: {
          canonical_id: string | null
          canonical_table: string | null
          created_at: string
          entity_id: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json
          plan_id: string | null
          session_id: string
          shop_id: string
          status: string
        }
        Insert: {
          canonical_id?: string | null
          canonical_table?: string | null
          created_at?: string
          entity_id?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json
          plan_id?: string | null
          session_id: string
          shop_id: string
          status?: string
        }
        Update: {
          canonical_id?: string | null
          canonical_table?: string | null
          created_at?: string
          entity_id?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json
          plan_id?: string | null
          session_id?: string
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_activation_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "onboarding_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_activation_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "onboarding_activation_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_activation_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_activation_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_activation_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_activation_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          plan: Json
          risk_flags: Json
          session_id: string
          shop_id: string
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          plan?: Json
          risk_flags?: Json
          session_id: string
          shop_id: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          plan?: Json
          risk_flags?: Json
          session_id?: string
          shop_id?: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_activation_plans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_activation_plans_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_activation_plans_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_entities: {
        Row: {
          canonical_fingerprint: string | null
          canonical_id: string | null
          canonical_table: string | null
          confidence: number | null
          created_at: string
          display_name: string | null
          entity_type: string
          id: string
          normalized: Json
          review_reason: string | null
          session_id: string
          shop_id: string
          source_external_id: string | null
          source_file_id: string | null
          source_row_id: string | null
          source_row_index: number | null
          status: string
          updated_at: string
        }
        Insert: {
          canonical_fingerprint?: string | null
          canonical_id?: string | null
          canonical_table?: string | null
          confidence?: number | null
          created_at?: string
          display_name?: string | null
          entity_type: string
          id?: string
          normalized?: Json
          review_reason?: string | null
          session_id: string
          shop_id: string
          source_external_id?: string | null
          source_file_id?: string | null
          source_row_id?: string | null
          source_row_index?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          canonical_fingerprint?: string | null
          canonical_id?: string | null
          canonical_table?: string | null
          confidence?: number | null
          created_at?: string
          display_name?: string | null
          entity_type?: string
          id?: string
          normalized?: Json
          review_reason?: string | null
          session_id?: string
          shop_id?: string
          source_external_id?: string | null
          source_file_id?: string | null
          source_row_id?: string | null
          source_row_index?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_entities_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entities_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entities_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entities_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "onboarding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entities_source_row_id_fkey"
            columns: ["source_row_id"]
            isOneToOne: false
            referencedRelation: "onboarding_raw_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_entity_links: {
        Row: {
          confidence: number | null
          created_at: string
          evidence: Json
          from_entity_id: string
          id: string
          link_type: string
          session_id: string
          shop_id: string
          status: string
          to_entity_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          evidence?: Json
          from_entity_id: string
          id?: string
          link_type: string
          session_id: string
          shop_id: string
          status?: string
          to_entity_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          evidence?: Json
          from_entity_id?: string
          id?: string
          link_type?: string
          session_id?: string
          shop_id?: string
          status?: string
          to_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_entity_links_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "onboarding_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entity_links_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entity_links_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entity_links_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_entity_links_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "onboarding_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_files: {
        Row: {
          created_at: string
          declared_domain: string | null
          detected_domain: string | null
          file_size_bytes: number | null
          header_row: Json
          id: string
          mime_type: string | null
          original_filename: string | null
          parse_error: string | null
          parse_status: string
          row_count: number
          session_id: string
          shop_id: string
          storage_bucket: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          declared_domain?: string | null
          detected_domain?: string | null
          file_size_bytes?: number | null
          header_row?: Json
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          parse_error?: string | null
          parse_status?: string
          row_count?: number
          session_id: string
          shop_id: string
          storage_bucket: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          declared_domain?: string | null
          detected_domain?: string | null
          file_size_bytes?: number | null
          header_row?: Json
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          parse_error?: string | null
          parse_status?: string
          row_count?: number
          session_id?: string
          shop_id?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_files_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_files_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_files_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_raw_rows: {
        Row: {
          created_at: string
          detected_domain: string | null
          error_reason: string | null
          file_id: string
          id: string
          normalized_preview: Json
          parse_status: string
          raw: Json
          row_hash: string | null
          session_id: string
          shop_id: string
          source_row_index: number
        }
        Insert: {
          created_at?: string
          detected_domain?: string | null
          error_reason?: string | null
          file_id: string
          id?: string
          normalized_preview?: Json
          parse_status?: string
          raw?: Json
          row_hash?: string | null
          session_id: string
          shop_id: string
          source_row_index: number
        }
        Update: {
          created_at?: string
          detected_domain?: string | null
          error_reason?: string | null
          file_id?: string
          id?: string
          normalized_preview?: Json
          parse_status?: string
          raw?: Json
          row_hash?: string | null
          session_id?: string
          shop_id?: string
          source_row_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_raw_rows_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "onboarding_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_raw_rows_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_raw_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_raw_rows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_review_items: {
        Row: {
          created_at: string
          details: Json
          domain: string | null
          entity_id: string | null
          id: string
          issue_type: string
          link_id: string | null
          recommended_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string
          severity: string
          shop_id: string
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          domain?: string | null
          entity_id?: string | null
          id?: string
          issue_type: string
          link_id?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id: string
          severity?: string
          shop_id: string
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          domain?: string | null
          entity_id?: string | null
          id?: string
          issue_type?: string
          link_id?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string
          severity?: string
          shop_id?: string
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_review_items_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "onboarding_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_review_items_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "onboarding_entity_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_review_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_review_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_review_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          activated_at: string | null
          analyzed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          shop_id: string
          source: string | null
          stats: Json
          status: string
          summary: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          analyzed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shop_id: string
          source?: string | null
          stats?: Json
          status?: string
          summary?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          analyzed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shop_id?: string
          source?: string | null
          stats?: Json
          status?: string
          summary?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_sessions_shop_id_fkey"
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
      part_fitment_events: {
        Row: {
          allocation_id: string | null
          confidence_score: number | null
          confidence_source: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["fitment_event_type"]
          id: string
          part_brand: string | null
          part_id: string
          part_number: string | null
          part_supplier: string | null
          qty: number
          shop_id: string
          source: string
          unit_cost: number | null
          vehicle_id: string | null
          vehicle_signature_id: string | null
          vehicle_trim: string | null
          vehicle_year: number | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          allocation_id?: string | null
          confidence_score?: number | null
          confidence_source?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["fitment_event_type"]
          id?: string
          part_brand?: string | null
          part_id: string
          part_number?: string | null
          part_supplier?: string | null
          qty?: number
          shop_id: string
          source?: string
          unit_cost?: number | null
          vehicle_id?: string | null
          vehicle_signature_id?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          allocation_id?: string | null
          confidence_score?: number | null
          confidence_source?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["fitment_event_type"]
          id?: string
          part_brand?: string | null
          part_id?: string
          part_number?: string | null
          part_supplier?: string | null
          qty?: number
          shop_id?: string
          source?: string
          unit_cost?: number | null
          vehicle_id?: string | null
          vehicle_signature_id?: string | null
          vehicle_trim?: string | null
          vehicle_year?: number | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_fitment_events_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: true
            referencedRelation: "work_order_part_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_fitment_events_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_vehicle_signature_id_fkey"
            columns: ["vehicle_signature_id"]
            isOneToOne: false
            referencedRelation: "vehicle_signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
          },
          {
            foreignKeyName: "part_fitment_events_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
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
          quoted_price: number | null
          quote_line_id: string | null
          request_id: string
          requested_manufacturer: string | null
          requested_part_number: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["part_request_item_status"]
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
          location_id?: string | null
          markup_pct?: number | null
          menu_item_id?: string | null
          part_id?: string | null
          po_id?: string | null
          qty: number
          qty_approved?: number
          qty_assigned?: number
          qty_consumed?: number
          qty_ordered?: number
          qty_picked?: number
          qty_received?: number
          qty_requested?: number
          qty_reserved?: number
          qty_returned?: number
          quoted_price?: number | null
          quote_line_id?: string | null
          request_id: string
          requested_manufacturer?: string | null
          requested_part_number?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["part_request_item_status"]
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
          quoted_price?: number | null
          quote_line_id?: string | null
          request_id?: string
          requested_manufacturer?: string | null
          requested_part_number?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["part_request_item_status"]
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
            foreignKeyName: "part_request_items_location_fk"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
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
            foreignKeyName: "part_request_items_quote_line_id_fkey"
            columns: ["quote_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_quote_lines"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
          quote_line_id: string | null
          requested_by: string | null
          shop_id: string
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
          quote_line_id?: string | null
          requested_by?: string | null
          shop_id: string
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
          quote_line_id?: string | null
          requested_by?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["part_request_status"]
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_requests_quote_line_id_fkey"
            columns: ["quote_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_quote_lines"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
          },
          {
            foreignKeyName: "part_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
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
      parts_quote_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["quote_request_status"]
          updated_at: string
          work_order_id: string
          work_order_line_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["quote_request_status"]
          updated_at?: string
          work_order_id: string
          work_order_line_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["quote_request_status"]
          updated_at?: string
          work_order_id?: string
          work_order_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "parts_quote_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_quote_requests_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_quote_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_quote_requests_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
          },
          {
            foreignKeyName: "parts_quote_requests_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          description: string | null
          id: string
          metadata: Json
          paid_at: string | null
          platform_fee_cents: number
          shop_id: string
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_connected_account_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          updated_at: string | null
          work_order_id: string | null
          work_order_line_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          currency: string
          customer_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          platform_fee_cents?: number
          shop_id: string
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          updated_at?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          platform_fee_cents?: number
          shop_id?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          updated_at?: string | null
          work_order_id?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
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
      payroll_deductions: {
        Row: {
          amount: number
          created_at: string | null
          deduction_type: string
          id: string
          timecard_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          deduction_type: string
          id?: string
          timecard_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          deduction_type?: string
          id?: string
          timecard_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_deductions_timecard_id_fkey"
            columns: ["timecard_id"]
            isOneToOne: false
            referencedRelation: "payroll_timecards"
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
          exported_at: string | null
          exported_by: string | null
          id: string
          payload: Json
          period_id: string
          provider_type: string
          row_count: number
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          payload?: Json
          period_id: string
          provider_type?: string
          row_count?: number
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          payload?: Json
          period_id?: string
          provider_type?: string
          row_count?: number
          shop_id?: string
          status?: string
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
      payroll_export_log: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          pay_period_id: string | null
          provider_id: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          pay_period_id?: string | null
          provider_id?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          pay_period_id?: string | null
          provider_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_export_log_pay_period_id_fkey"
            columns: ["pay_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_log_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payroll_providers"
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
          created_at: string | null
          end_date: string
          exported_at: string | null
          exported_by: string | null
          id: string
          locked_at: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          processed: boolean | null
          shop_id: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          end_date: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          processed?: boolean | null
          shop_id?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          end_date?: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          processed?: boolean | null
          shop_id?: string | null
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
      payroll_providers: {
        Row: {
          api_base_url: string | null
          api_key: string | null
          created_at: string | null
          id: string
          provider_name: string
          shop_id: string | null
        }
        Insert: {
          api_base_url?: string | null
          api_key?: string | null
          created_at?: string | null
          id?: string
          provider_name: string
          shop_id?: string | null
        }
        Update: {
          api_base_url?: string | null
          api_key?: string | null
          created_at?: string | null
          id?: string
          provider_name?: string
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_providers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_providers_shop_id_fkey"
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
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notifications: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string | null
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
          work_order_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
          work_order_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          tech_signature_hash?: string | null
          tech_signature_path?: string | null
          tech_signature_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      property_approval_thresholds: {
        Row: {
          created_at: string
          id: string
          portfolio_id: string | null
          property_id: string | null
          requires_owner_approval: boolean
          shop_id: string
          threshold_cents: number
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          portfolio_id?: string | null
          property_id?: string | null
          requires_owner_approval?: boolean
          shop_id: string
          threshold_cents?: number
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          portfolio_id?: string | null
          property_id?: string | null
          requires_owner_approval?: boolean
          shop_id?: string
          threshold_cents?: number
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_approval_thresholds_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_approval_thresholds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_approval_thresholds_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_approval_thresholds_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_approval_thresholds_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
        ]
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
      property_request_read_receipts: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          read_at: string
          reader_profile_id: string | null
          reader_type: string
          request_id: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          read_at?: string
          reader_profile_id?: string | null
          reader_type?: string
          request_id: string
          shop_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          read_at?: string
          reader_profile_id?: string | null
          reader_type?: string
          request_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_request_read_receipts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "property_request_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_read_receipts_reader_profile_id_fkey"
            columns: ["reader_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_read_receipts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "property_maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_read_receipts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_read_receipts_shop_id_fkey"
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
            foreignKeyName: "punch_events_shift_fk"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string
          description: string | null
          id: string
          location_id: string | null
          part_id: string | null
          po_id: string
          qty: number
          received_qty: number
          sku: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          location_id?: string | null
          part_id?: string | null
          po_id: string
          qty: number
          received_qty?: number
          sku?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          location_id?: string | null
          part_id?: string | null
          po_id?: string
          qty?: number
          received_qty?: number
          sku?: string | null
          unit_cost?: number | null
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
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
          received_at: string | null
          shipping_total: number | null
          shop_id: string
          status: string
          subtotal: number | null
          supplier_id: string
          tax_total: number | null
          total: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          received_at?: string | null
          shipping_total?: number | null
          shop_id: string
          status?: string
          subtotal?: number | null
          supplier_id: string
          tax_total?: number | null
          total?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          received_at?: string | null
          shipping_total?: number | null
          shop_id?: string
          status?: string
          subtotal?: number | null
          supplier_id?: string
          tax_total?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          id: string
          invoice_id: string
          last_error: string | null
          last_synced_at: string | null
          metadata: Json
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
          id?: string
          invoice_id: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
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
          id?: string
          invoice_id?: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
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
            isOneToOne: true
            referencedRelation: "invoices"
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
      reel_plans: {
        Row: {
          created_at: string | null
          estimated_duration_seconds: number | null
          hook: string | null
          id: string
          music_direction: string | null
          overlays: Json
          shop_id: string
          shots: Json
          status: string
          title: string | null
          video_id: string
          voiceover_text: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_duration_seconds?: number | null
          hook?: string | null
          id?: string
          music_direction?: string | null
          overlays?: Json
          shop_id: string
          shots?: Json
          status?: string
          title?: string | null
          video_id: string
          voiceover_text?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_duration_seconds?: number | null
          hook?: string | null
          id?: string
          music_direction?: string | null
          overlays?: Json
          shop_id?: string
          shots?: Json
          status?: string
          title?: string | null
          video_id?: string
          voiceover_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_plans_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "reel_plans_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_render_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          output_url: string | null
          render_payload: Json
          shop_id: string
          source_id: string | null
          source_type: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          video_id: string | null
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          output_url?: string | null
          render_payload: Json
          shop_id: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          video_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          output_url?: string | null
          render_payload?: Json
          shop_id?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          video_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_render_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "reel_render_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_menu_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          labor_time: number | null
          make: string
          model: string
          parts: Json
          published_at: string | null
          published_by: string | null
          shop_id: string | null
          title: string
          updated_at: string
          visibility: string
          year_bucket: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          labor_time?: number | null
          make: string
          model: string
          parts?: Json
          published_at?: string | null
          published_by?: string | null
          shop_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
          year_bucket: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          labor_time?: number | null
          make?: string
          model?: string
          parts?: Json
          published_at?: string | null
          published_by?: string | null
          shop_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
          year_bucket?: string
        }
        Relationships: []
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
      shop_content_signals: {
        Row: {
          avg_engagement_score: number | null
          content_type: string
          id: string
          last_updated: string | null
          posts_generated: number | null
          shop_id: string
          total_leads: number | null
          total_views: number | null
        }
        Insert: {
          avg_engagement_score?: number | null
          content_type: string
          id?: string
          last_updated?: string | null
          posts_generated?: number | null
          shop_id: string
          total_leads?: number | null
          total_views?: number | null
        }
        Update: {
          avg_engagement_score?: number | null
          content_type?: string
          id?: string
          last_updated?: string | null
          posts_generated?: number | null
          shop_id?: string
          total_leads?: number | null
          total_views?: number | null
        }
        Relationships: []
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
      shop_marketing_memory: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          memory_key: string
          memory_value: Json
          shop_id: string
          source_id: string | null
          source_type: string | null
          updated_at: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          memory_key: string
          memory_value?: Json
          shop_id: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          memory_key?: string
          memory_value?: Json
          shop_id?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      shop_onboarding_idempotency: {
        Row: {
          created_at: string
          domain: string
          id: string
          materialization_key: string
          run_id: string
          shop_id: string
          source_row_hash: string
          status: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          materialization_key: string
          run_id: string
          shop_id: string
          source_row_hash: string
          status?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          materialization_key?: string
          run_id?: string
          shop_id?: string
          source_row_hash?: string
          status?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_onboarding_idempotency_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "shop_onboarding_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_idempotency_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_onboarding_idempotency_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
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
      shop_payroll_settings: {
        Row: {
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
          breaks_are_paid: boolean
          shop_id: string
          suspicious_shift_minutes: number
          updated_at: string
          week_starts_on: number
          weekly_overtime_after_minutes: number
        }
        Insert: {
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
          breaks_are_paid?: boolean
          shop_id: string
          suspicious_shift_minutes?: number
          updated_at?: string
          week_starts_on?: number
          weekly_overtime_after_minutes?: number
        }
        Update: {
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
          breaks_are_paid?: boolean
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
      shop_reel_settings: {
        Row: {
          brand_voice: string
          created_at: string
          default_cta: string
          default_location: string
          id: string
          onboarding_completed: boolean
          publish_mode: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          brand_voice?: string
          created_at?: string
          default_cta?: string
          default_location?: string
          id?: string
          onboarding_completed?: boolean
          publish_mode?: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          brand_voice?: string
          created_at?: string
          default_cta?: string
          default_location?: string
          id?: string
          onboarding_completed?: boolean
          publish_mode?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_reel_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reel_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
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
      shop_tax_overrides: {
        Row: {
          created_at: string | null
          id: string
          override_rate: number
          shop_id: string | null
          tax_rate_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          override_rate: number
          shop_id?: string | null
          tax_rate_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          override_rate?: number
          shop_id?: string | null
          tax_rate_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_tax_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_tax_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_tax_overrides_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
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
      shopreel_manual_asset_files: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_name: string
          file_path: string
          file_type: string
          file_url: string | null
          height: number | null
          id: string
          manual_asset_id: string
          metadata_json: Json
          mime_type: string
          shop_id: string
          size_bytes: number | null
          sort_order: number
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          file_path: string
          file_type: string
          file_url?: string | null
          height?: number | null
          id?: string
          manual_asset_id: string
          metadata_json?: Json
          mime_type: string
          shop_id: string
          size_bytes?: number | null
          sort_order?: number
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          file_path?: string
          file_type?: string
          file_url?: string | null
          height?: number | null
          id?: string
          manual_asset_id?: string
          metadata_json?: Json
          mime_type?: string
          shop_id?: string
          size_bytes?: number | null
          sort_order?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopreel_manual_asset_files_manual_asset_id_fkey"
            columns: ["manual_asset_id"]
            isOneToOne: false
            referencedRelation: "shopreel_manual_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_manual_asset_files_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopreel_manual_asset_files_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
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
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
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
          logo_url: string | null
          max_lead_days: number | null
          max_users: number | null
          menu_repair_pricing_valid_days: number
          min_notice_minutes: number | null
          name: string | null
          organization_id: string | null
          owner_id: string | null
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
          slug: string | null
          street: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_current_period_end: string | null
          stripe_customer_id: string | null
          stripe_default_currency: string
          stripe_details_submitted: boolean
          stripe_onboarding_completed: boolean
          stripe_payouts_enabled: boolean
          stripe_platform_fee_bps: number
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          stripe_trial_end: string | null
          supplies_percent: number | null
          shop_supplies_enabled: boolean | null
          shop_supplies_type: string | null
          shop_supplies_percent: number | null
          shop_supplies_flat_amount: number | null
          shop_supplies_cap_amount: number | null
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
          logo_url?: string | null
          max_lead_days?: number | null
          max_users?: number | null
          menu_repair_pricing_valid_days?: number
          min_notice_minutes?: number | null
          name?: string | null
          organization_id?: string | null
          owner_id?: string | null
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
          slug?: string | null
          street?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_default_currency?: string
          stripe_details_submitted?: boolean
          stripe_onboarding_completed?: boolean
          stripe_payouts_enabled?: boolean
          stripe_platform_fee_bps?: number
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          stripe_trial_end?: string | null
          supplies_percent?: number | null
          shop_supplies_enabled?: boolean | null
          shop_supplies_type?: string | null
          shop_supplies_percent?: number | null
          shop_supplies_flat_amount?: number | null
          shop_supplies_cap_amount?: number | null
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
          logo_url?: string | null
          max_lead_days?: number | null
          max_users?: number | null
          menu_repair_pricing_valid_days?: number
          min_notice_minutes?: number | null
          name?: string | null
          organization_id?: string | null
          owner_id?: string | null
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
          slug?: string | null
          street?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_default_currency?: string
          stripe_details_submitted?: boolean
          stripe_onboarding_completed?: boolean
          stripe_payouts_enabled?: boolean
          stripe_platform_fee_bps?: number
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          stripe_trial_end?: string | null
          supplies_percent?: number | null
          shop_supplies_enabled?: boolean | null
          shop_supplies_type?: string | null
          shop_supplies_percent?: number | null
          shop_supplies_flat_amount?: number | null
          shop_supplies_cap_amount?: number | null
          tax_rate?: number | null
          timezone?: string | null
          updated_at?: string | null
          use_ai?: boolean | null
          user_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shops_default_stock_location_id_fkey"
            columns: ["default_stock_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shops_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          location_id: string
          part_id: string
          qty_change: number
          reason: Database["public"]["Enums"]["stock_move_reason"]
          reference_id: string | null
          reference_kind: string | null
          shop_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          part_id: string
          qty_change: number
          reason: Database["public"]["Enums"]["stock_move_reason"]
          reference_id?: string | null
          reference_kind?: string | null
          shop_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          part_id?: string
          qty_change?: number
          reason?: Database["public"]["Enums"]["stock_move_reason"]
          reference_id?: string | null
          reference_kind?: string | null
          shop_id?: string
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
      supplier_orders: {
        Row: {
          created_at: string | null
          external_order_id: string | null
          id: string
          items: Json | null
          shop_id: string | null
          status: string
          supplier_id: string | null
          work_order_id: string | null
        }
        Insert: {
          created_at?: string | null
          external_order_id?: string | null
          id?: string
          items?: Json | null
          shop_id?: string | null
          status: string
          supplier_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string | null
          external_order_id?: string | null
          id?: string
          items?: Json | null
          shop_id?: string | null
          status?: string
          supplier_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parts_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "supplier_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "supplier_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "supplier_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "supplier_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_history: {
        Row: {
          catalog_item_id: string | null
          changed_at: string | null
          id: string
          new_price: number | null
          old_price: number | null
        }
        Insert: {
          catalog_item_id?: string | null
          changed_at?: string | null
          id?: string
          new_price?: number | null
          old_price?: number | null
        }
        Update: {
          catalog_item_id?: string | null
          changed_at?: string | null
          id?: string
          new_price?: number | null
          old_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_history_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_catalog_items"
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
      tax_calculation_log: {
        Row: {
          breakdown: Json | null
          created_at: string | null
          gst: number | null
          hst: number | null
          id: string
          jurisdiction_id: string | null
          pst: number | null
          quote_id: string | null
          shop_id: string | null
          total_tax: number
          work_order_id: string | null
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string | null
          gst?: number | null
          hst?: number | null
          id?: string
          jurisdiction_id?: string | null
          pst?: number | null
          quote_id?: string | null
          shop_id?: string | null
          total_tax: number
          work_order_id?: string | null
        }
        Update: {
          breakdown?: Json | null
          created_at?: string | null
          gst?: number | null
          hst?: number | null
          id?: string
          jurisdiction_id?: string | null
          pst?: number | null
          quote_id?: string | null
          shop_id?: string | null
          total_tax?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_calculation_log_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_calculation_log_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "customer_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_calculation_log_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_calculation_log_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_calculation_log_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_portal_invoices"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tax_calculation_log_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_fleet"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tax_calculation_log_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_portal"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tax_calculation_log_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "v_work_order_board_cards_shop"
            referencedColumns: ["work_order_id"]
          },
          {
            foreignKeyName: "tax_calculation_log_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_jurisdictions: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tax_providers: {
        Row: {
          api_base_url: string | null
          api_key: string | null
          created_at: string | null
          id: string
          provider_name: string
          shop_id: string | null
        }
        Insert: {
          api_base_url?: string | null
          api_key?: string | null
          created_at?: string | null
          id?: string
          provider_name: string
          shop_id?: string | null
        }
        Update: {
          api_base_url?: string | null
          api_key?: string | null
          created_at?: string | null
          id?: string
          provider_name?: string
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_providers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_providers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string | null
          effective_from: string
          effective_to: string | null
          id: string
          jurisdiction_id: string | null
          rate: number
          tax_type: string
        }
        Insert: {
          created_at?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          jurisdiction_id?: string | null
          rate: number
          tax_type: string
        }
        Update: {
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          jurisdiction_id?: string | null
          rate?: number
          tax_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
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
            foreignKeyName: "tech_sessions_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
          id?: string
          shop_id?: string | null
          start_time?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_shifts_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_shifts_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_shifts_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        ]
      }
      vehicle_signatures: {
        Row: {
          created_at: string
          drivetrain: string | null
          engine: string | null
          fuel_type: string | null
          id: string
          make: string | null
          model: string | null
          shop_id: string
          transmission: string | null
          trim: string | null
          updated_at: string
          vehicle_id: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          drivetrain?: string | null
          engine?: string | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          model?: string | null
          shop_id: string
          transmission?: string | null
          trim?: string | null
          updated_at?: string
          vehicle_id?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          drivetrain?: string | null
          engine?: string | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          model?: string | null
          shop_id?: string
          transmission?: string | null
          trim?: string | null
          updated_at?: string
          vehicle_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_signatures_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_signatures_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_signatures_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          body_type: string | null
          created_at: string | null
          customer_id: string | null
          asset_type: string | null
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
          transmission: string | null
          transmission_type: string | null
          tags: string | null
          unit_number: string | null
          user_id: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          body_type?: string | null
          created_at?: string | null
          customer_id?: string | null
          asset_type?: string | null
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
          transmission?: string | null
          transmission_type?: string | null
          tags?: string | null
          unit_number?: string | null
          user_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          body_type?: string | null
          created_at?: string | null
          customer_id?: string | null
          asset_type?: string | null
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
          transmission?: string | null
          transmission_type?: string | null
          tags?: string | null
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
      video_metrics: {
        Row: {
          avg_watch_seconds: number
          bookings: number
          clicks: number
          comments: number
          created_at: string
          id: string
          impressions: number
          leads: number
          likes: number
          meta: Json
          metric_date: string
          platform: string
          revenue: number
          saves: number
          shares: number
          shop_id: string
          updated_at: string
          video_id: string
          video_platform_post_id: string | null
          views: number
          watch_time_seconds: number
        }
        Insert: {
          avg_watch_seconds?: number
          bookings?: number
          clicks?: number
          comments?: number
          created_at?: string
          id?: string
          impressions?: number
          leads?: number
          likes?: number
          meta?: Json
          metric_date?: string
          platform: string
          revenue?: number
          saves?: number
          shares?: number
          shop_id: string
          updated_at?: string
          video_id: string
          video_platform_post_id?: string | null
          views?: number
          watch_time_seconds?: number
        }
        Update: {
          avg_watch_seconds?: number
          bookings?: number
          clicks?: number
          comments?: number
          created_at?: string
          id?: string
          impressions?: number
          leads?: number
          likes?: number
          meta?: Json
          metric_date?: string
          platform?: string
          revenue?: number
          saves?: number
          shares?: number
          shop_id?: string
          updated_at?: string
          video_id?: string
          video_platform_post_id?: string | null
          views?: number
          watch_time_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_metrics_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_metrics_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_metrics_video_platform_post_id_fkey"
            columns: ["video_platform_post_id"]
            isOneToOne: false
            referencedRelation: "video_platform_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_platform_posts: {
        Row: {
          caption_override: string | null
          created_at: string
          external_post_id: string | null
          external_url: string | null
          hashtag_set: string[]
          id: string
          meta: Json
          platform: string
          post_status: string
          published_at: string | null
          scheduled_for: string | null
          shop_id: string
          updated_at: string
          video_id: string
        }
        Insert: {
          caption_override?: string | null
          created_at?: string
          external_post_id?: string | null
          external_url?: string | null
          hashtag_set?: string[]
          id?: string
          meta?: Json
          platform: string
          post_status?: string
          published_at?: string | null
          scheduled_for?: string | null
          shop_id: string
          updated_at?: string
          video_id: string
        }
        Update: {
          caption_override?: string | null
          created_at?: string
          external_post_id?: string | null
          external_url?: string | null
          hashtag_set?: string[]
          id?: string
          meta?: Json
          platform?: string
          post_status?: string
          published_at?: string | null
          scheduled_for?: string | null
          shop_id?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_platform_posts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_platform_posts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_platform_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_platform_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_publications: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          platform_video_id: string | null
          published_at: string | null
          status: string | null
          video_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          platform_video_id?: string | null
          published_at?: string | null
          status?: string | null
          video_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          platform_video_id?: string | null
          published_at?: string | null
          status?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_publications_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_publications_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
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
      viral_hook_tests: {
        Row: {
          content_type: string | null
          created_at: string | null
          hook_text: string
          id: string
          score_predicted: number | null
          selected: boolean
          shop_id: string
          video_id: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          hook_text: string
          id?: string
          score_predicted?: number | null
          selected?: boolean
          shop_id: string
          video_id?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          hook_text?: string
          id?: string
          score_predicted?: number | null
          selected?: boolean
          shop_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viral_hook_tests_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "v_video_performance_summary"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "viral_hook_tests_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
          source_intake_id: string | null
          source_row_id: string | null
          status: string
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
          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
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
          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
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
            foreignKeyName: "fk_wol_inspection_session"
            columns: ["inspection_session_id"]
            isOneToOne: false
            referencedRelation: "inspection_sessions"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "work_order_lines_inspection_template_id_fkey"
            columns: ["inspection_template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_lines_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
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
          created_at: string | null
          id: string
          kind: string | null
          shop_id: string
          url: string
          user_id: string | null
          work_order_id: string
          work_order_line_id: string | null
          storage_bucket: string | null
          storage_path: string | null
          file_name: string | null
          content_type: string | null
          file_size: number | null
          note: string | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kind?: string | null
          shop_id: string
          url: string
          user_id?: string | null
          work_order_id: string
          work_order_line_id?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          file_name?: string | null
          content_type?: string | null
          file_size?: number | null
          note?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kind?: string | null
          shop_id?: string
          url?: string
          user_id?: string | null
          work_order_id?: string
          work_order_line_id?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          file_name?: string | null
          content_type?: string | null
          file_size?: number | null
          note?: string | null
          source?: string | null
        }
        Relationships: [
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
          work_order_id: string | null
          work_order_line_id: string
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
          work_order_id?: string | null
          work_order_line_id: string
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
          work_order_id?: string | null
          work_order_line_id?: string
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
            foreignKeyName: "work_order_part_allocations_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_shop_fk"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
          },
          {
            foreignKeyName: "work_order_part_allocations_work_order_line_id_fkey"
            columns: ["work_order_line_id"]
            isOneToOne: false
            referencedRelation: "work_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_parts: {
        Row: {
          created_at: string | null
          id: string
          part_id: string | null
          quantity: number
          shop_id: string | null
          total_price: number | null
          unit_price: number | null
          work_order_id: string
          work_order_line_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          part_id?: string | null
          quantity?: number
          shop_id?: string | null
          total_price?: number | null
          unit_price?: number | null
          work_order_id: string
          work_order_line_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          part_id?: string | null
          quantity?: number
          shop_id?: string | null
          total_price?: number | null
          unit_price?: number | null
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
        ]
      }
      work_order_quote_lines: {
        Row: {
          ai_cause: string | null
          ai_complaint: string | null
          ai_correction: string | null
          approved_at: string | null
          created_at: string
          declined_at: string | null
          description: string
          est_labor_hours: number | null
          grand_total: number | null
          group_id: string | null
          id: string
          job_type: string
          labor_hours: number | null
          labor_total: number | null
          metadata: Json | null
          notes: string | null
          parts_total: number | null
          qty: number | null
          sent_to_customer_at: string | null
          shop_id: string
          stage: string | null
          status: string
          subtotal: number | null
          suggested_by: string | null
          tax_total: number | null
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
          created_at?: string
          declined_at?: string | null
          description: string
          est_labor_hours?: number | null
          grand_total?: number | null
          group_id?: string | null
          id?: string
          job_type?: string
          labor_hours?: number | null
          labor_total?: number | null
          metadata?: Json | null
          notes?: string | null
          parts_total?: number | null
          qty?: number | null
          sent_to_customer_at?: string | null
          shop_id: string
          stage?: string | null
          status?: string
          subtotal?: number | null
          suggested_by?: string | null
          tax_total?: number | null
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
          created_at?: string
          declined_at?: string | null
          description?: string
          est_labor_hours?: number | null
          grand_total?: number | null
          group_id?: string | null
          id?: string
          job_type?: string
          labor_hours?: number | null
          labor_total?: number | null
          metadata?: Json | null
          notes?: string | null
          parts_total?: number | null
          qty?: number | null
          sent_to_customer_at?: string | null
          shop_id?: string
          stage?: string | null
          status?: string
          subtotal?: number | null
          suggested_by?: string | null
          tax_total?: number | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "woql_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "woql_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
          customer_signature_url: string | null
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
          shop_supplies_enabled_override: boolean | null
          shop_supplies_amount_override: number | null
          invoice_url: string | null
          is_waiter: boolean
          labor_total: number | null
          notes: string | null
          odometer_km: number | null
          parts_total: number | null
          portal_submitted_at: string | null
          priority: number | null
          quote: Json | null
          quote_url: string | null
          scheduled_at: string | null
          shop_id: string
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
          customer_signature_url?: string | null
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
          shop_supplies_enabled_override?: boolean | null
          shop_supplies_amount_override?: number | null
          invoice_url?: string | null
          is_waiter?: boolean
          labor_total?: number | null
          notes?: string | null
          odometer_km?: number | null
          parts_total?: number | null
          portal_submitted_at?: string | null
          priority?: number | null
          quote?: Json | null
          quote_url?: string | null
          scheduled_at?: string | null
          shop_id: string
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
          customer_signature_url?: string | null
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
          shop_supplies_enabled_override?: boolean | null
          shop_supplies_amount_override?: number | null
          invoice_url?: string | null
          is_waiter?: boolean
          labor_total?: number | null
          notes?: string | null
          odometer_km?: number | null
          parts_total?: number | null
          portal_submitted_at?: string | null
          priority?: number | null
          quote?: Json | null
          quote_url?: string | null
          scheduled_at?: string | null
          shop_id?: string
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
            foreignKeyName: "work_orders_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_assigned_tech_fkey"
            columns: ["assigned_tech"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "work_orders_source_fleet_program_id_fkey"
            columns: ["source_fleet_program_id"]
            isOneToOne: false
            referencedRelation: "fleet_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_source_fleet_service_request_id_fkey"
            columns: ["source_fleet_service_request_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_requests"
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
    }
    Views: {
      ai_training_events_v: {
        Row: {
          created_at: string | null
          id: string | null
          payload: Json | null
          shop_id: string | null
          source: string | null
          vehicle_ymm: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          payload?: Json | null
          shop_id?: string | null
          source?: string | null
          vehicle_ymm?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          payload?: Json | null
          shop_id?: string | null
          source?: string | null
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
      fitment_stats: {
        Row: {
          allocations: number | null
          consumptions: number | null
          first_seen_at: string | null
          last_seen_at: string | null
          part_id: string | null
          shop_id: string | null
          vehicle_signature_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_fitment_events_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "part_fitment_events_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_fitment_events_vehicle_signature_id_fkey"
            columns: ["vehicle_signature_id"]
            isOneToOne: false
            referencedRelation: "vehicle_signatures"
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
      stock_balances: {
        Row: {
          location_id: string | null
          on_hand: number | null
          part_id: string | null
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
        Relationships: []
      }
      v_fleet_inspection_buckets: {
        Row: {
          due_14_days: number | null
          due_30_days: number | null
          due_7_days: number | null
          shop_id: string | null
          shop_name: string | null
          total_due_30_days: number | null
        }
        Relationships: [
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
        ]
      }
      v_fleet_inspections_due_14: {
        Row: {
          days_until_due: number | null
          interval_days: number | null
          last_inspection_date: string | null
          next_inspection_date: string | null
          notes: string | null
          schedule_id: string | null
          shop_id: string | null
          shop_name: string | null
          unit_number: string | null
          vehicle_id: string | null
          vin: string | null
        }
        Relationships: [
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
      v_fleet_inspections_due_30: {
        Row: {
          days_until_due: number | null
          interval_days: number | null
          last_inspection_date: string | null
          next_inspection_date: string | null
          notes: string | null
          schedule_id: string | null
          shop_id: string | null
          shop_name: string | null
          unit_number: string | null
          vehicle_id: string | null
          vin: string | null
        }
        Relationships: [
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
      v_fleet_inspections_due_7: {
        Row: {
          days_until_due: number | null
          interval_days: number | null
          last_inspection_date: string | null
          next_inspection_date: string | null
          notes: string | null
          schedule_id: string | null
          shop_id: string | null
          shop_name: string | null
          unit_number: string | null
          vehicle_id: string | null
          vin: string | null
        }
        Relationships: [
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
      v_global_saved_menu_items: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          labor_time: number | null
          make: string | null
          model: string | null
          parts: Json | null
          published_at: string | null
          published_by: string | null
          shop_id: string | null
          title: string | null
          updated_at: string | null
          visibility: string | null
          year_bucket: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          labor_time?: number | null
          make?: string | null
          model?: string | null
          parts?: Json | null
          published_at?: string | null
          published_by?: string | null
          shop_id?: string | null
          title?: string | null
          updated_at?: string | null
          visibility?: string | null
          year_bucket?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          labor_time?: number | null
          make?: string | null
          model?: string | null
          parts?: Json | null
          published_at?: string | null
          published_by?: string | null
          shop_id?: string | null
          title?: string | null
          updated_at?: string | null
          visibility?: string | null
          year_bucket?: string | null
        }
        Relationships: []
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
      v_my_conversation_ids: {
        Row: {
          conversation_id: string | null
        }
        Relationships: []
      }
      v_my_messages: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          id: string | null
          sender_id: string | null
          sent_at: string | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          sender_id?: string | null
          sent_at?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          sender_id?: string | null
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
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        Insert: {
          location_id?: string | null
          part_id?: string | null
          qty_available?: never
          qty_on_hand?: number | null
          qty_reserved?: number | null
        }
        Update: {
          location_id?: string | null
          part_id?: string | null
          qty_available?: never
          qty_on_hand?: number | null
          qty_reserved?: number | null
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
      v_parts_reconciliation: {
        Row: {
          alloc_total: number | null
          diff: number | null
          status: string | null
          wop_total: number | null
          work_order_id: string | null
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
          shop_supplies_enabled_override: boolean | null
          shop_supplies_amount_override: number | null
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
          shop_supplies_enabled_override?: boolean | null
          shop_supplies_amount_override?: number | null
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
          shop_supplies_enabled_override?: boolean | null
          shop_supplies_amount_override?: number | null
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
            foreignKeyName: "fk_wol_inspection_session"
            columns: ["inspection_session_id"]
            isOneToOne: false
            referencedRelation: "inspection_sessions"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "punch_events_shift_fk"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "tech_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      v_top_content_types_by_shop: {
        Row: {
          avg_engagement_score: number | null
          content_type: string | null
          posts_generated: number | null
          shop_id: string | null
          total_leads: number | null
          total_views: number | null
        }
        Relationships: [
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
        ]
      }
      v_vehicle_service_history: {
        Row: {
          created_at: string | null
          description: string | null
          make: string | null
          menu_item_id: string | null
          menu_name: string | null
          model: string | null
          status: string | null
          vehicle_id: string | null
          work_order_id: string | null
          work_order_line_id: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_lines_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
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
      v_video_performance_summary: {
        Row: {
          bookings: number | null
          clicks: number | null
          comments: number | null
          content_type: string | null
          engagement_score: number | null
          impressions: number | null
          leads: number | null
          likes: number | null
          platform_posts_count: number | null
          revenue: number | null
          saves: number | null
          shares: number | null
          shop_id: string | null
          status: string | null
          title: string | null
          video_id: string | null
          views: number | null
        }
        Relationships: [
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
        ]
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
            foreignKeyName: "work_orders_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "work_orders_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "work_orders_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      v_work_order_line_labor_rollups: {
        Row: {
          active_segment_count: number | null
          active_tech_count: number | null
          first_started_at: string | null
          last_ended_at: string | null
          shop_id: string | null
          work_order_id: string | null
          work_order_line_id: string | null
          worked_seconds: number | null
        }
        Relationships: [
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
            referencedRelation: "v_vehicle_service_history"
            referencedColumns: ["work_order_line_id"]
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
    }
    Functions: {
      _ensure_same_shop: { Args: { _wo: string }; Returns: boolean }
      accept_property_portal_invite: {
        Args: { p_raw_token: string }
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
      agent_claim_next_job: {
        Args: {
          kinds?: Database["public"]["Enums"]["agent_job_kind"][]
          worker_id: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "agent_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agent_claim_next_message: {
        Args: { kinds?: string[]; worker_id: string }
        Returns: {
          attempts: number
          body: Json
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          direction: Database["public"]["Enums"]["agent_message_direction"]
          id: string
          kind: string
          last_error: string | null
          last_error_at: string | null
          max_attempts: number
          processed_at: string | null
          processed_by: string | null
          request_id: string
          run_after: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agent_create_action: {
        Args: {
          p_kind: string
          p_payload: Json
          p_request_id: string
          p_requires_approval: boolean
          p_risk: Database["public"]["Enums"]["agent_action_risk"]
          p_summary: string
        }
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
      agent_job_heartbeat: {
        Args: { job_id: string; worker_id: string }
        Returns: undefined
      }
      agent_mark_job_canceled: {
        Args: { job_id: string; reason?: string }
        Returns: undefined
      }
      agent_mark_job_failed: {
        Args: { err: string; job_id: string; retry_in_seconds?: number }
        Returns: undefined
      }
      agent_mark_job_succeeded: { Args: { job_id: string }; Returns: undefined }
      agent_mark_message_failed: {
        Args: { err: string; message_id: string; retry_in_seconds?: number }
        Returns: undefined
      }
      agent_mark_message_succeeded: {
        Args: { message_id: string; processed_by_in?: string }
        Returns: undefined
      }
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
      apply_stock_move: {
        Args: {
          p_loc: string
          p_part: string
          p_qty: number
          p_reason: string
          p_ref_id: string
          p_ref_kind: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          part_id: string
          qty_change: number
          reason: Database["public"]["Enums"]["stock_move_reason"]
          reference_id: string | null
          reference_kind: string | null
          shop_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_moves"
          isOneToOne: true
          isSetofReturn: false
        }
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
      assign_unassigned_lines: {
        Args: { tech_id: string; wo_id: string }
        Returns: undefined
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
      can_manage_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      can_view_work_order: {
        Args: { p_work_order_id: string }
        Returns: boolean
      }
      chat_participants_key: {
        Args: { _recipients: string[]; _sender: string }
        Returns: string
      }
      chat_post_message: {
        Args: { _chat_id?: string; _content: string; _recipients: string[] }
        Returns: string
      }
      check_plan_limit: { Args: { _feature: string }; Returns: boolean }
      clear_auth: { Args: never; Returns: undefined }
      create_messaging_conversation: {
        Args: {
          _booking_id: string | null
          _channel: string
          _context_id: string | null
          _context_type: string | null
          _conversation_id: string
          _created_by: string
          _customer_id: string | null
          _participant_kinds: string[]
          _participant_user_ids: string[]
          _shop_id: string
          _title: string | null
          _vehicle_id: string | null
          _work_order_id: string | null
        }
        Returns: string
      }
      compute_labor_cost_for_work_order: {
        Args: { p_work_order_id: string }
        Returns: number
      }
      compute_parts_cost_for_work_order: {
        Args: { p_work_order_id: string }
        Returns: number
      }
      consume_part_request_item_on_picked:
        | { Args: { p_request_item_id: string }; Returns: undefined }
        | {
            Args: { p_location_id: string; p_request_item_id: string }
            Returns: undefined
          }
      create_fleet_form_upload: {
        Args: { _filename: string; _path: string }
        Returns: string
      }
      approve_inspection_form_import: {
        Args: { p_job_id: string; p_sections: Json; p_title: string }
        Returns: string
      }
      create_part_request: {
        Args: { p_items: Json; p_notes: string; p_work_order: string }
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
      create_work_order_with_custom_id:
        | {
            Args: {
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
              customer_signature_url: string | null
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
              parts_total: number | null
              portal_submitted_at: string | null
              priority: number | null
              quote: Json | null
              quote_url: string | null
              scheduled_at: string | null
              shop_id: string
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
        | {
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
              customer_signature_url: string | null
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
              parts_total: number | null
              portal_submitted_at: string | null
              priority: number | null
              quote: Json | null
              quote_url: string | null
              scheduled_at: string | null
              shop_id: string
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
      delete_part_request: { Args: { p_request_id: string }; Returns: string }
      ensure_same_shop_policies: {
        Args: { shop_col: string; tab: unknown }
        Returns: undefined
      }
      find_menu_item_for_vehicle_service: {
        Args: {
          p_engine_family: string
          p_make: string
          p_model: string
          p_service_code: string
          p_shop_id: string
          p_year: number
        }
        Returns: string
      }
      first_segment_uuid: { Args: { p: string }; Returns: string }
      generate_next_work_order_custom_id: {
        Args: { p_shop_id: string; p_user_id: string }
        Returns: string
      }
      generate_work_order_custom_id: {
        Args: { p_shop_id: string; p_user_id: string }
        Returns: string
      }
      get_default_stock_location: {
        Args: { p_shop_id: string }
        Returns: string
      }
      get_live_invoice_id: {
        Args: { p_work_order_id: string }
        Returns: string
      }
      get_or_create_vehicle_signature:
        | { Args: { p_shop_id: string; p_vehicle_id: string }; Returns: string }
        | {
            Args: {
              p_drivetrain: string
              p_engine: string
              p_fuel_type: string
              p_make: string
              p_model: string
              p_shop_id: string
              p_transmission: string
              p_trim: string
              p_vehicle_id: string
              p_year: number
            }
            Returns: string
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
      has_column: { Args: { col: string; tab: unknown }; Returns: boolean }
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
      invoice_is_locked: {
        Args: { issued_at: string; s: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_agent_developer: { Args: never; Returns: boolean }
      is_customer: { Args: { _customer: string }; Returns: boolean }
      is_shop_member: { Args: { p_shop_id: string }; Returns: boolean }
      is_shop_member_v2: { Args: { shop_id: string }; Returns: boolean }
      is_staff_for_shop: { Args: { _shop: string }; Returns: boolean }
      mark_active: { Args: never; Returns: undefined }
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
      parts_reconcile_request_lifecycle: {
        Args: { p_request_id: string }
        Returns: Json
      }
      parts_request_operational_stage: {
        Args: { p_request_id: string }
        Returns: string
      }
      maybe_release_line_hold_for_parts: {
        Args: { p_work_order_line_id: string }
        Returns: undefined
      }
      plan_user_limit:
        | { Args: { p_plan: string }; Returns: number }
        | {
            Args: { p_plan: string; p_stripe_subscription_status?: string }
            Returns: number
          }
      portal_approve_line: { Args: { p_line_id: string }; Returns: undefined }
      portal_approve_part_request_item: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      portal_decline_line: { Args: { p_line_id: string }; Returns: undefined }
      portal_decline_part_request_item: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      portal_list_approvals: { Args: never; Returns: Json }
      punch_in: { Args: { p_line_id: string }; Returns: undefined }
      punch_out: { Args: { line_id: string }; Returns: undefined }
      recalc_shop_active_user_count: {
        Args: { p_shop_id: string }
        Returns: undefined
      }
      receive_part_request_item: {
        Args: {
          p_item_id: string
          p_location_id: string
          p_po_id?: string
          p_qty: number
        }
        Returns: {
          move_id: string
          qty_received: number
          status: Database["public"]["Enums"]["part_request_item_status"]
        }[]
      }
      receive_po_part_and_allocate: {
        Args: {
          p_location_id: string
          p_part_id: string
          p_po_id: string
          p_qty: number
        }
        Returns: Json
      }
      recompute_live_invoice_costs: {
        Args: { p_work_order_id: string }
        Returns: undefined
      }
      recompute_work_order_status: {
        Args: { p_wo: string }
        Returns: undefined
      }
      record_video_metric: {
        Args: {
          p_avg_watch_seconds?: number
          p_bookings?: number
          p_clicks?: number
          p_comments?: number
          p_impressions?: number
          p_leads?: number
          p_likes?: number
          p_meta?: Json
          p_metric_date: string
          p_platform: string
          p_revenue?: number
          p_saves?: number
          p_shares?: number
          p_shop_id: string
          p_video_id: string
          p_views?: number
          p_watch_time_seconds?: number
        }
        Returns: {
          avg_watch_seconds: number
          bookings: number
          clicks: number
          comments: number
          created_at: string
          id: string
          impressions: number
          leads: number
          likes: number
          meta: Json
          metric_date: string
          platform: string
          revenue: number
          saves: number
          shares: number
          shop_id: string
          updated_at: string
          video_id: string
          video_platform_post_id: string | null
          views: number
          watch_time_seconds: number
        }
        SetofOptions: {
          from: "*"
          to: "video_metrics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      replace_shop_hours_atomic: {
        Args: { p_hours: Json; p_shop_id: string }
        Returns: undefined
      }
      reserve_part_request_items_for_line:
        | { Args: { p_work_order_line_id: string }; Returns: undefined }
        | {
            Args: { p_location_id: string; p_work_order_line_id: string }
            Returns: undefined
          }
      resolve_fleet_id_from_vehicle: {
        Args: { p_vehicle_id: string }
        Returns: string
      }
      restock_consumed_part_request_item:
        | {
            Args: { p_qty?: number; p_request_item_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_location_id?: string
              p_qty?: number
              p_request_item_id: string
            }
            Returns: undefined
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
      shop_id_for: { Args: { uid: string }; Returns: string }
      shop_role: { Args: { shop_id: string }; Returns: string }
      shop_role_v2: { Args: { shop_id: string }; Returns: string }
      shop_staff_user_count: { Args: { p_shop_id: string }; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_inspection: {
        Args: {
          p_inspection_id: string
          p_role: string
          p_signature_hash?: string
          p_signature_image_path?: string
          p_signed_name: string
        }
        Returns: undefined
      }
      sync_invoice_from_work_order: {
        Args: { p_work_order_id: string }
        Returns: undefined
      }
      sync_invoice_from_work_order_admin: {
        Args: { p_work_order_id: string }
        Returns: undefined
      }
      unreserve_part_request_item:
        | {
            Args: { p_qty?: number; p_request_item_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_location_id?: string
              p_qty?: number
              p_request_item_id: string
            }
            Returns: undefined
          }
      update_part_quote: {
        Args: {
          p_item: string
          p_price: number
          p_request: string
          p_vendor: string
        }
        Returns: undefined
      }
      upsert_part_allocation_from_request_item: {
        Args: {
          p_create_stock_move?: boolean
          p_location_id: string
          p_request_item_id: string
        }
        Returns: Json
      }
      user_is_in_shop: { Args: { target_shop_id: string }; Returns: boolean }
      wo_release_parts_holds_for_part: {
        Args: { p_part_id: string }
        Returns: number
      }
      work_order_in_my_shop: {
        Args: { p_work_order_id: string }
        Returns: boolean
      }
      work_orders_set_intake: {
        Args: { p_intake: Json; p_submit?: boolean; p_work_order_id: string }
        Returns: undefined
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
        | "partially_ordered"
        | "partially_received"
        | "received"
        | "partially_consumed"
        | "consumed"
        | "partially_returned"
        | "returned"
        | "cancelled"
      part_request_status:
        | "requested"
        | "quoted"
        | "approved"
        | "partially_ordered"
        | "partially_consumed"
        | "partially_returned"
        | "returned"
        | "fulfilled"
        | "rejected"
        | "deferred"
        | "cancelled"
      plan_t: "free" | "diy" | "pro" | "pro_plus"
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
        "partially_ordered",
        "partially_received",
        "received",
        "partially_consumed",
        "consumed",
        "partially_returned",
        "returned",
        "cancelled",
      ],
      part_request_status: [
        "requested",
        "quoted",
        "approved",
        "partially_ordered",
        "partially_consumed",
        "partially_returned",
        "returned",
        "fulfilled",
        "rejected",
        "deferred",
        "cancelled",
      ],
      plan_t: ["free", "diy", "pro", "pro_plus"],
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
      ],
    },
  },
} as const
