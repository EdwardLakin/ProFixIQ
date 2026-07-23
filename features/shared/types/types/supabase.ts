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
          locked_by?: string | n