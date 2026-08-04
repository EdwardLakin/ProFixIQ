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
          idempotency_keyÛµã‹h‘éì¶»§q«^tÁ}Ñ•¡¹¥¥…¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÁÁ±å}½™™±¥¹•}±¥¹•}µÕÑ…Ñ¥½¹}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ¥½¹}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}Á…å±½…è)Í½¸(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÁÁ±å}½™™±¥¹•}Í¡¥™Ñ}ÁÕ¹¡}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•Ù•¹Ñ}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€Á}¹½Ñ”üèÍÑÉ¥¹œ(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡¥™Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Ñ¥µ•ÍÑ…µÀèÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÁÁ±å}Á½ÉÑ…±}‰½½­¥¹}½µµ…¹‘}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ¥½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}…Ñ½É}µ½‘”èÍÑÉ¥¹œ(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}…ĞüèÍÑÉ¥¹œ(€€€€€€€€€Á}‰½½­¥¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÕÍÑ½µ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•¹‘Í}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}¹½Ñ•ÌèÍÑÉ¥¹œ(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}É•…Í½¸üèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑ…ÉÑÍ}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}Ù•¡¥±•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÁÁ±å}Á½ÉÑ…±}±¥¹•}‘•¥Í¥½¹}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}…ĞüèÍÑÉ¥¹œ(€€€€€€€€€Á}ÕÍÑ½µ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}‘•¥Í¥½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÁÁ±å}ÁÕ¹¡}½ÉÉ•Ñ¥½¸èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÁÉ½™¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}½ÉÉ•Ñ•‘}Ñ¥µ•ÍÑ…µÀèÍÑÉ¥¹œ(€€€€€€€€€Á}ÁÕ¹¡}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€…Ñ½É}ÁÉ½™¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€½ÉÉ•Ñ•‘}Ñ¥µ•ÍÑ…µÀèÍÑÉ¥¹œ(€€€€€€€€€É•…Ñ•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€•Ù•¹Ñ}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€¥èÍÑÉ¥¹œ(€€€€€€€€€½É¥¥¹…±}Ñ¥µ•ÍÑ…µÀèÍÑÉ¥¹œ(€€€€€€€€€ÁÕ¹¡}¥èÍÑÉ¥¹œ(€€€€€€€€€É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€Í¡¥™Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Ñ…É•Ñ}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€M•Ñ½™=ÁÑ¥½¹Ìèì(€€€€€€€€€™É½´è€ˆ¨ˆ(€€€€€€€€€Ñ¼è€‰ÁÕ¹¡}½ÉÉ•Ñ¥½¹Ìˆ(€€€€€€€€€¥Í=¹•Q½=¹”èÑÉÕ”(€€€€€€€€€¥ÍM•Ñ½™I•ÑÕÉ¸è™…±Í”(€€€€€€€ô(€€€€€ô(€€€€€…ÁÁ±å}Í¡¥™Ñ}½ÉÉ•Ñ¥½¸èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÁÉ½™¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}½ÉÉ•Ñ•‘}•¹‘}Ñ¥µ”èÍÑÉ¥¹œ(€€€€€€€€€Á}½ÉÉ•Ñ•‘}ÍÑ…ÉÑ}Ñ¥µ”èÍÑÉ¥¹œ(€€€€€€€€€Á}½ÉÉ•Ñ¥½¹}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€Á}É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡¥™Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Ñ…É•Ñ}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÁÁ±å}Í¡½Á}ÅÕ½Ñ•}‘•¥Í¥½¹}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}…ĞüèÍÑÉ¥¹œ(€€€€€€€€€Á}½¹Ñ…Ñ}µ•Ñ¡½èÍÑÉ¥¹œ(€€€€€€€€€Á}‘•¥Í¥½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}¹½Ñ”èÍÑÉ¥¹œ(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}ÅÕ½Ñ•}±¥¹•}¥‘ÌèÍÑÉ¥¹mt(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÁÁ±å}ÍÑ½­}µ½Ù”è(€€€€€€€ğì(€€€€€€€€€€€ÉÌèì(€€€€€€€€€€€€€Á}±½ŒèÍÑÉ¥¹œ(€€€€€€€€€€€€€Á}Á…ÉĞèÍÑÉ¥¹œ(€€€€€€€€€€€€€Á}ÅÑäè¹Õµ‰•È(€€€€€€€€€€€€€Á}É•…Í½¸è…Ñ…‰…Í•l‰ÁÕ‰±¥Œ‰ul‰¹ÕµÌ‰ul‰ÍÑ½­}µ½Ù•}É•…Í½¸‰t(€€€€€€€€€€€€€Á}É•™}¥üèÍÑÉ¥¹œ(€€€€€€€€€€€€€Á}É•™}­¥¹üèÍÑÉ¥¹œ(€€€€€€€€€€€ô(€€€€€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€€€€€ô(€€€€€€€ğì(€€€€€€€€€€€ÉÌèì(€€€€€€€€€€€€€Á}±½ŒèÍÑÉ¥¹œ(€€€€€€€€€€€€€Á}Á…ÉĞèÍÑÉ¥¹œ(€€€€€€€€€€€€€Á}ÅÑäè¹Õµ‰•È(€€€€€€€€€€€€€Á}É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€€€€€Á}É•™}¥èÍÑÉ¥¹œ(€€€€€€€€€€€€€Á}É•™}­¥¹èÍÑÉ¥¹œ(€€€€€€€€€€€ô(€€€€€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€€€€€ô(€€€€€…ÁÁ±å}ÍÑÉ¥Á•}ÍÕ‰ÍÉ¥ÁÑ¥½¹}İ•‰¡½½­}Í¹…ÁÍ¡½Ğèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}ÕÍÑ½µ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•Ù•¹Ñ}É•…Ñ•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}•Ù•¹Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¹…ÁÍ¡½Ğè)Í½¸(€€€€€€€€€Á}ÍÕ‰ÍÉ¥ÁÑ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…ÁÁÉ½Ù•}¥¹ÍÁ•Ñ¥½¹}™½Éµ}¥µÁ½ÉĞèì(€€€€€€€ÉÌèìÁ}©½‰}¥èÍÑÉ¥¹œìÁ}Í•Ñ¥½¹Ìè)Í½¸ìÁ}Ñ¥Ñ±”èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€…ÁÁÉ½Ù•}±¥¹•Ìèì(€€€€€€€ÉÌèì(€€€€€€€€€}…ÁÁÉ½Ù•‘}¥‘ÌèÍÑÉ¥¹mt(€€€€€€€€€}…ÁÁÉ½Ù•ÈüèÍÑÉ¥¹œ(€€€€€€€€€}‘•±¥¹•}Õ¹¡•­•üè‰½½±•…¸(€€€€€€€€€}‘•±¥¹•‘}¥‘ÌüèÍÑÉ¥¹mt(€€€€€€€€€}İ¼èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹ÌèÕ¹‘•™¥¹•(€€€€€ô(€€€€€…ÁÁÉ½Ù•}Á…åÉ½±±}Á•É¥½‘}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÁÉ½™¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Á•É¥½‘}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÍÍ¥¹}İ½É­}½É‘•É}±¥¹•}Ñ•¡¹¥¥…¹}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…ÍÍ¥¹•‘}‰äèÍÑÉ¥¹œ(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Ñ•¡¹¥¥…¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÑÑ…¡}Í¥¹•‘}¥¹ÍÁ•Ñ¥½¹}Á‘™}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•áÁ•Ñ•‘}Íå¹}É•Ù¥Í¥½¸è¹Õµ‰•È(€€€€€€€€€Á}¥¹ÍÁ•Ñ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Á‘™}Í¡„ÈÔØèÍÑÉ¥¹œ(€€€€€€€€€Á}Á‘™}ÍÑ½É…•}Á…Ñ èÍÑÉ¥¹œ(€€€€€€€€€Á}Á‘™}ÕÉ°èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…ÑÑ…¡}ÍÑÉ¥Á•}…ÅÕ¥Í¥Ñ¥½¹}¡•­½ÕĞèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}¡•­½ÕÑ}Í•ÍÍ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}¥¹Ñ•¹Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}¹½¹”èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€‰•¥¹}™¥¹…¹¥…±}½ÕÑ‰½á}‘•±¥Ù•Éäèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}‘•±¥Ù•Éå}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}±•…Í•}Í•½¹‘Ìüè¹Õµ‰•È(€€€€€€€€€Á}İ½É­•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€‰•¥¹}ÍÑÉ¥Á•}…ÅÕ¥Í¥Ñ¥½¹}¥¹Ñ•¹Ğèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}™½Õ¹‘¥¹}‘¥Í½Õ¹Ñ}…ÁÁ±¥•è‰½½±•…¸(€€€€€€€€€Á}¹½¹”èÍÑÉ¥¹œ(€€€€€€€€€Á}Á±…¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}É•ÅÕ•ÍÑ}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑÉ¥Á•}ÁÉ¥•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÑÉ¥…±}‘…åÌè¹Õµ‰•È(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€¡•­½ÕÑ}Í•ÍÍ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€€€¥¹Ñ•¹Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€¥¹Ñ•¹Ñ}¹½¹”èÍÑÉ¥¹œ(€€€€€€€€€¥¹Ñ•¹Ñ}ÍÑ…ÑÕÌèÍÑÉ¥¹œ(€€€€€€€õmt(€€€€€ô(€€€€€‰½½­}Á½ÉÑ…±}É•Á…¥É}ÅÕ½Ñ•}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}…ĞüèÍÑÉ¥¹œ(€€€€€€€€€Á}ÕÍÑ½µ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•¹‘Í}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}ÅÕ½Ñ•}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑ…ÉÑÍ}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}Ù¥Í¥Ñ}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€…¹}…•ÍÍ}½¹Ù•ÉÍ…Ñ¥½¸èì(€€€€€€€ÉÌèì…Ñ½É}ÕÍ•É}¥üèÍÑÉ¥¹œìÑ…É•Ñ}½¹Ù•ÉÍ…Ñ¥½¹}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…¹}…•ÍÍ}•ÍÑ¥µ…Ñ•}ÅÕ½Ñ•}±¥¹”èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ¥½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}µ•Ñ…‘…Ñ„è)Í½¸(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…¹}µ…¹…•}ÁÉ½™¥±”èì(€€€€€€€ÉÌèìÑ…É•Ñ}ÁÉ½™¥±•}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…¹}É•…‘}•ÍÑ¥µ…Ñ•}¥¹Ñ•É¹…±}‘•Ñ…¥±Ìèì(€€€€€€€ÉÌèìÁ}Í¡½Á}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…¹}Í•±•Ñ}•ÍÑ¥µ…Ñ•}ÅÕ½Ñ•}±¥¹”èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…ÁÁÉ½Ù•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}‘•±¥¹•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}‘•™•ÉÉ•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}Í•¹Ñ}Ñ½}ÕÍÑ½µ•É}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑ…”èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑ…ÑÕÌèÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…¹}Í•±•Ñ}•ÍÑ¥µ…Ñ•}İ½É­}½É‘•Èèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}ÕÍÑ½µ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•ÍÑ¥µ…Ñ•}¹Õµ‰•ÈèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…¹}ÕÁ‘…Ñ•}•ÍÑ¥µ…Ñ•}Á…ÉÑ}É•ÅÕ•ÍÑ}¥Ñ•µÌèì(€€€€€€€ÉÌèìÁ}Í¡½Á}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€…¹}ÕÁ‘…Ñ•}Á…ÉÑ}É•ÅÕ•ÍÑ}¥Ñ•µÌèì(€€€€€€€ÉÌèìÁ}Í¡½Á}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€¡…Ñ}Á…ÉÑ¥¥Á…¹ÑÍ}­•äèì(€€€€€€€ÉÌèì}É•¥Á¥•¹ÑÌèÍÑÉ¥¹mtì}Í•¹‘•ÈèÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€¡…Ñ}Á½ÍÑ}µ•ÍÍ…”èì(€€€€€€€ÉÌèì}¡…Ñ}¥üèÍÑÉ¥¹œì}½¹Ñ•¹ĞèÍÑÉ¥¹œì}É•¥Á¥•¹ÑÌèÍÑÉ¥¹mtô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€¡•­}Á±…¹}±¥µ¥ĞèìÉÌèì}™•…ÑÕÉ”èÍÑÉ¥¹œôìI•ÑÕÉ¹Ìè‰½½±•…¸ô(€€€€€±…¥µ}™¥¹…¹¥…±}½ÕÑ‰½á}‰…Ñ èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}±•…Í•}Í•½¹‘Ìüè¹Õµ‰•È(€€€€€€€€€Á}±¥µ¥Ğüè¹Õµ‰•È(€€€€€€€€€Á}İ½É­•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€…É•…Ñ•}¥èÍÑÉ¥¹œ(€€€€€€€€€…ÑÑ•µÁÑÌè¹Õµ‰•È(€€€€€€€€€‘•‘ÕÁ•}­•äèÍÑÉ¥¹œ(€€€€€€€€€•Ù•¹Ñ}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€½ÕÑ‰½á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á…å±½…è)Í½¸(€€€€€€€€€Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€õmt(€€€€€ô(€€€€€±…¥µ}™¥¹…¹¥…±}½ÕÑ‰½á}‘•±¥Ù•Éäèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}±•…Í•}Í•½¹‘Ìüè¹Õµ‰•È(€€€€€€€€€Á}½ÕÑ‰½á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}É•¥Á¥•¹Ñ}•µ…¥°èÍÑÉ¥¹œ(€€€€€€€€€Á}É•¥Á¥•¹Ñ}­¥¹èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€‘•±¥Ù•Éå}…ÑÑ•µÁÑÌè¹Õµ‰•È(€€€€€€€€€‘•±¥Ù•Éå}¥èÍÑÉ¥¹œ(€€€€€€€€€‘•±¥Ù•Éå}­•äèÍÑÉ¥¹œ(€€€€€€€€€‘•±¥Ù•Éå}ÍÑ…ÑÕÌèÍÑÉ¥¹œ(€€€€€€€€€Í¡½Õ±‘}Í•¹è‰½½±•…¸(€€€€€€€õmt(€€€€€ô(€€€€€±…¥µ}ÍÑÉ¥Á•}…ÅÕ¥Í¥Ñ¥½¹}¥¹Ñ•¹Ğèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}¡•­½ÕÑ}•µ…¥°èÍÑÉ¥¹œ(€€€€€€€€€Á}¡•­½ÕÑ}Í•ÍÍ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÕÍÑ½µ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}¥¹Ñ•¹Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}¹½¹”èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑÉ¥Á•}ÁÉ¥•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÕ‰ÍÉ¥ÁÑ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€±…¥µ•è‰½½±•…¸(€€€€€€€€€‘•¹¥…±}É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€õmt(€€€€€ô(€€€€€±…¥µ}ÍÑÉ¥Á•}İ•‰¡½½­}•Ù•¹Ğèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}•Ù•¹Ñ}É•…Ñ•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}•Ù•¹Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•Ù•¹Ñ}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€Á}±•…Í•}Í•½¹‘Ìè¹Õµ‰•È(€€€€€€€€€Á}±¥Ù•µ½‘”è‰½½±•…¸(€€€€€€€€€Á}½‰©•Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑÉ¥Á•}…½Õ¹Ñ}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€…±É•…‘å}ÁÉ½•ÍÍ•è‰½½±•…¸(€€€€€€€€€…ÑÑ•µÁÑ}½Õ¹Ğè¹Õµ‰•È(€€€€€€€€€±…¥µ}Ñ½­•¸èÍÑÉ¥¹œ(€€€€€€€€€±…¥µ•è‰½½±•…¸(€€€€€€€€€¥¹}ÁÉ½É•ÍÌè‰½½±•…¸(€€€€€€€õmt(€€€€€ô(€€€€€±•…É}…ÕÑ èìÉÌè¹•Ù•ÈìI•ÑÕÉ¹ÌèÕ¹‘•™¥¹•ô(€€€€€±½Í•}İ½É­}½É‘•É}½ÉÉ•Ñ¥½¹}Í•ÍÍ¥½¸èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}½ÉÉ•Ñ¥½¹}Í•ÍÍ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}µ•Ñ…‘…Ñ„üè)Í½¸(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€±½Í•‘}…ĞèÍÑÉ¥¹œğ¹Õ±°(€€€€€€€€€±½Í•‘}‰äèÍÑÉ¥¹œğ¹Õ±°(€€€€€€€€€¥èÍÑÉ¥¹œ(€€€€€€€€€¥¹Ù½¥•}Ù•ÉÍ¥½¹}¥èÍÑÉ¥¹œğ¹Õ±°(€€€€€€€€€µ•Ñ…‘…Ñ„è)Í½¸(€€€€€€€€€½Á•¹•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€½Á•¹•‘}‰äèÍÑÉ¥¹œğ¹Õ±°(€€€€€€€€€½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€Í½Á”èÍÑÉ¥¹œ(€€€€€€€€€Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€ÍÑ…ÑÕÌèÍÑÉ¥¹œ(€€€€€€€€€İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€M•Ñ½™=ÁÑ¥½¹Ìèì(€€€€€€€€€™É½´è€ˆ¨ˆ(€€€€€€€€€Ñ¼è€‰İ½É­}½É‘•É}½ÉÉ•Ñ¥½¹}Í•ÍÍ¥½¹Ìˆ(€€€€€€€€€¥Í=¹•Q½=¹”èÑÉÕ”(€€€€€€€€€¥ÍM•Ñ½™I•ÑÕÉ¸è™…±Í”(€€€€€€€ô(€€€€€ô(€€€€€½µÁ±•Ñ•}…¥}É½ÕÑ•}ÅÕ½Ñ„èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}…ÑÕ…±}½ÍÑ}ÕÍè¹Õµ‰•È(€€€€€€€€€Á}™•…ÑÕÉ”èÍÑÉ¥¹œ(€€€€€€€€€Á}É••¥ÁÑ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÕ••‘•è‰½½±•…¸(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€½µÁ±•Ñ•}…¹½¹¥…±}Í¡¥™Ğèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}ÁÉ½™¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡¥™Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Ñ¥µ•ÍÑ…µÀüèÍÑÉ¥¹œ(€€€€€€€€€Á}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€•¹‘}Ñ¥µ”èÍÑÉ¥¹œ(€€€€€€€€€¥èÍÑÉ¥¹œ(€€€€€€€€€¥¹Í•ÉÑ•‘}•Ù•¹ÑÌè)Í½¸(€€€€€€€€€Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€ÍÑ…ÉÑ}Ñ¥µ”èÍÑÉ¥¹œ(€€€€€€€€€ÍÑ…ÑÕÌèÍÑÉ¥¹œ(€€€€€€€€€ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€õmt(€€€€€ô(€€€€€½µÁ±•Ñ•}•ÍÑ¥µ…Ñ•}Á…ÉÑÍ}ÅÕ½Ñ•}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}•áÁ•Ñ•‘}É•Ù¥Í¥½¸è¹Õµ‰•È(€€€€€€€€€Á}¥‘•µÁ½Ñ•¹å}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€½µÁ±•Ñ•}™¥¹…¹¥…±}½ÕÑ‰½á}±…¥´èì(€€€€€€€ÉÌèìÁ}½ÕÑ‰½á}¥èÍÑÉ¥¹œìÁ}İ½É­•É}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€½µÁ±•Ñ•}Í¡•‘Õ±•‘}Í¡¥™Ñ}•¹‘}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}•á•ÕÑ¥½¹}Ñ¥µ”üèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡•‘Õ±•}‘…Ñ”üèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡•‘Õ±•}Í½ÕÉ”üèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡•‘Õ±•‘}•¹èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡¥™Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€½µÁ±•Ñ•}ÍÑÉ¥Á•}İ•‰¡½½­}•Ù•¹Ğèì(€€€€€€€ÉÌèìÁ}±…¥µ}Ñ½­•¸èÍÑÉ¥¹œìÁ}•Ù•¹Ñ}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìè‰½½±•…¸(€€€€€ô(€€€€€½¹ÍÕµ•}…¥}É½ÕÑ•}ÅÕ½Ñ„èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}…Ñ½É}µ…àè¹Õµ‰•È(€€€€€€€€€Á}™•…ÑÕÉ”èÍÑÉ¥¹œ(€€€€€€€€€Á}¡…É‘}‰Õ‘•Ñ}ÕÍè¹Õµ‰•È(€€€€€€€€€Á}É•Í•ÉÙ…Ñ¥½¹}½ÍÑ}ÕÍè¹Õµ‰•È(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}µ…àè¹Õµ‰•È(€€€€€€€€€Á}İ¥¹‘½İ}Í•½¹‘Ìè¹Õµ‰•È(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€…±±½İ•è‰½½±•…¸(€€€€€€€€€‘•¹¥…±}É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€É••¥ÁÑ}¥èÍÑÉ¥¹œ(€€€€€€€€€É•ÑÉå}…™Ñ•É}Í•½¹‘Ìè¹Õµ‰•È(€€€€€€€õmt(€€€€€ô(€€€€€½¹ÍÕµ•}Ù•¡¥±•}É•…±±}™•Ñ¡}ÅÕ½Ñ„èì(€€€€€€€ÉÌèìÁ}…Ñ½É}¥èÍÑÉ¥¹œìÁ}Í¡½Á}¥èÍÑÉ¥¹œìÁ}Ù•¡¥±•}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€…±±½İ•è‰½½±•…¸(€€€€€€€€€É•ÑÉå}…™Ñ•É}Í•½¹‘Ìè¹Õµ‰•È(€€€€€€€õmt(€€€€€ô(€€€€€½¹Ù•ÉÑ}™±••Ñ}Í•ÉÙ¥•}É•ÅÕ•ÍÑ}Ñ½}İ½É­}½É‘•É}…Ñ½µ¥Œèì(€€€€€€€ÉÌèìÁ}Í•ÉÙ¥•}É•ÅÕ•ÍÑ}¥èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€½¹Ù•ÉÍ¥½¹}ÍÑ…ÑÕÌèÍÑÉ¥¹œ(€€€€€€€€€İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€õmt(€€€€€ô(€€€€€½ÉÉ•Ñ}İ½É­}½É‘•É}±¥¹•}±…‰½É}Í•µ•¹Ğèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ¥½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}…Ñ½É}ÁÉ½™¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}•¹‘•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}É•…Í½¸èÍÑÉ¥¹œ(€€€€€€€€€Á}Í•µ•¹Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÑ…ÉÑ•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}Ñ•¡¹¥¥…¹}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}İ½É­}½É‘•É}±¥¹•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€É•…Ñ•}•ÍÑ¥µ…Ñ•}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}ÕÍÑ½µ•Èè)Í½¸(€€€€€€€€€Á}•áÁ¥É•Í}…ĞèÍÑÉ¥¹œ(€€€€€€€€€Á}¥‘•µÁ½Ñ•¹å}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}±¥¹•Ìè)Í½¸(€€€€€€€€€Á}¹½Ñ•ÌèÍÑÉ¥¹œ(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Ù•¡¥±”è)Í½¸(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€É•…Ñ•}™±••Ñ}Í•ÉÙ¥•}É•ÅÕ•ÍÑ}…Ñ½µ¥Œèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}™±••Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}±¥¹•Ìè)Í½¸(€€€€€€€€€Á}½Á•É…Ñ¥½¹}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}É•ÅÕ•ÍÑ•‘}™½É}‘…Ñ”èÍÑÉ¥¹œ(€€€€€€€€€Á}ÍÕµµ…ÉäèÍÑÉ¥¹œ(€€€€€€€€€Á}Ñ¥Ñ±”èÍÑÉ¥¹œ(€€€€€€€€€Á}Ù•¡¥±•}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€É•…Ñ•}µ•¹Õ}¥Ñ•µ}İ¥Ñ¡}Á…ÉÑÍ}¥¹Ñ…­”èì(€€€€€€€ÉÌèì(€€€€€€€€€Á}…Ñ½É}…ÕÑ¡}ÕÍ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}…Ñ½É}ÁÉ½™¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}¥‘•µÁ½Ñ•¹å}­•äèÍÑÉ¥¹œ(€€€€€€€€€Á}¥Ñ•´è)Í½¸(€€€€€€€€€Á}Á…ÉÑÌè)Í½¸(€€€€€€€€€Á}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹Ìè)Í½¸(€€€€€ô(€€€€€É•…Ñ•}µ•ÍÍ…¥¹}½¹Ù•ÉÍ…Ñ¥½¸èì(€€€€€€€ÉÌèì(€€€€€€€€€}‰½½­¥¹}¥èÍÑÉ¥¹œ(€€€€€€€€€}¡…¹¹•°èÍÑÉ¥¹œ(€€€€€€€€€}½¹Ñ•áÑ}¥èÍÑÉ¥¹œ(€€€€€€€€€}½¹Ñ•áÑ}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€}½¹Ù•ÉÍ…Ñ¥½¹}¥èÍÑÉ¥¹œ(€€€€€€€€€}É•…Ñ•‘}‰äèÍÑÉ¥¹œ(€€€€€€€€€}ÕÍÑ½µ•É}¥èÍÑÉ¥¹œ(€€€€€€€€€}Á…ÉÑ¥¥Á…¹Ñ}­¥¹‘ÌèÍÑÉ¥¹mt(€€€€€€€€€}Á…ÉÑ¥¥Á…¹Ñ}ÕÍ•É}¥‘ÌèÍÑÉ¥¹mt(€€€€€€€€€}Í¡½Á}¥èÍÑÉ¥¹œ(€€€€€€€€€}Ñ¥Ñ±”èÍÑÉ¥¹œ(€€€€€€€€€}Ù•¡¥±•}¥èÍÑÉ¥¹œ(€€€€€€€€€}İ½É­}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€É•…Ñ•}Á…ÉÑ}É•ÅÕ•ÍÑ}İ¥Ñ¡}¥Ñ•µÌèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}¥Ñ•µÌè)Í½¸(€€€€€€€€€Á}©½‰}¥üèÍÑÉ¥¹œ