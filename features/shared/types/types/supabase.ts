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
       …200137 tokens truncated…er_id: string
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
      work_order_financial_lock_state: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: Json
      }
      work_order_is_financially_locked: {
        Args: { p_shop_id: string; p_work_order_id: string }
        Returns: boolean
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

