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
            referencedRelation: "work_orders"
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
      ai_training_events: {
        Row: {
          created_at: string
          id: string
          payload: Json
          shop_id: string
          source: string
          vehicle_ymm: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          shop_id: string
          source: string
          vehicle_ymm?: string | null
        }
        Update: {
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
          shop_id: string | null
          starts_at: string
          status: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          shop_id?: string | null
          starts_at: string
          status?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          shop_id?: string | null
          starts_at?: string
          status?: string
          vehicle_id?: string | null
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
        ]
      }
      chat_participants: {
        Row: {
          chat_id: string | null
          id: string
          joined_at: string | null
          profile_id: string | null
          role: string | null
        }
        Insert: {
          chat_id?: string | null
          id?: string
          joined_at?: string | null
          profile_id?: string | null
          role?: string | null
        }
        Update: {
          chat_id?: string | null
          id?: string
          joined_at?: string | null
          profile_id?: string | null
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
      conversation_participants: {
        Row: {
          added_at: string | null
          conversation_id: string | null
          id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          added_at?: string | null
          conversation_id?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          added_at?: string | null
          conversation_id?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
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
          context_id: string | null
          context_type: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_group: boolean | null
          title: string | null
        }
        Insert: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          title?: string | null
        }
        Update: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          title?: string | null
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
          created_at: string | null
          customer_id: string
          email: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          email: string
          id?: string
          token: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          email?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_invites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          email: string | null
          first_name: string | null
          id: string
          is_fleet: boolean
          last_name: string | null
          name: string | null
          notes: string | null
          phone: string | null
          phone_number: string | null
          postal_code: string | null
          province: string | null
          shop_id: string | null
          street: string | null
          user_id: string | null
          vehicle: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_fleet?: boolean
          last_name?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          phone_number?: string | null
          postal_code?: string | null
          province?: string | null
          shop_id?: string | null
          street?: string | null
          user_id?: string | null
          vehicle?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_fleet?: boolean
          last_name?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          phone_number?: string | null
          postal_code?: string | null
          province?: string | null
          shop_id?: string | null
          street?: string | null
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
          created_at: string | null
          email: string
          error: string | null
          event_type: string
          id: string
          sg_event_id: string | null
          status: string | null
          timestamp: string
        }
        Insert: {
          created_at?: string | null
          email: string
          error?: string | null
          event_type: string
          id?: string
          sg_event_id?: string | null
          status?: string | null
          timestamp: string
        }
        Update: {
          created_at?: string | null
          email?: string
          error?: string | null
          event_type?: string
          id?: string
          sg_event_id?: string | null
          status?: string | null
          timestamp?: string
        }
        Relationships: []
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
      fleet_vehicles: {
        Row: {
          active: boolean
          custom_interval_days: number | null
          custom_interval_hours: number | null
          custom_interval_km: number | null
          fleet_id: string
          nickname: string | null
          vehicle_id: string
        }
        Insert: {
          active?: boolean
          custom_interval_days?: number | null
          custom_interval_hours?: number | null
          custom_interval_km?: number | null
          fleet_id: string
          nickname?: string | null
          vehicle_id: string
        }
        Update: {
          active?: boolean
          custom_interval_days?: number | null
          custom_interval_hours?: number | null
          custom_interval_km?: number | null
          fleet_id?: string
          nickname?: string | null
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
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          shop_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          shop_id?: string
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
          created_at: string | null
          customer_id: string
          description: string | null
          id: string
          notes: string | null
          service_date: string
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          description?: string | null
          id?: string
          notes?: string | null
          service_date?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          notes?: string | null
          service_date?: string
          vehicle_id?: string | null
          work_order_id?: string | null
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
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
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
      inspection_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          labor_hours: number | null
          sections: Json
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
          tags?: string[] | null
          template_name?: string
          updated_at?: string | null
          user_id?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      inspections: {
        Row: {
          ai_summary: string | null
          completed: boolean | null
          created_at: string | null
          id: string
          inspection_type: string | null
          is_draft: boolean | null
          location: string | null
          notes: string | null
          pdf_url: string | null
          photo_urls: string[] | null
          quote_id: string | null
          shop_id: string | null
          started_at: string | null
          status: string | null
          summary: Json | null
          template_id: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          completed?: boolean | null
          created_at?: string | null
          id?: string
          inspection_type?: string | null
          is_draft?: boolean | null
          location?: string | null
          notes?: string | null
          pdf_url?: string | null
          photo_urls?: string[] | null
          quote_id?: string | null
          shop_id?: string | null
          started_at?: string | null
          status?: string | null
          summary?: Json | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          completed?: boolean | null
          created_at?: string | null
          id?: string
          inspection_type?: string | null
          is_draft?: boolean | null
          location?: string | null
          notes?: string | null
          pdf_url?: string | null
          photo_urls?: string[] | null
          quote_id?: string | null
          shop_id?: string | null
          started_at?: string | null
          status?: string | null
          summary?: Json | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
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
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
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
          quantity: number
          unit_cost: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_item_id: string
          name: string
          quantity?: number
          unit_cost?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_item_id?: string
          name?: string
          quantity?: number
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
          description: string
          id: string
          markup_pct: number | null
          part_id: string | null
          qty: number
          quoted_price: number | null
          request_id: string
          vendor: string | null
          work_order_line_id: string | null
        }
        Insert: {
          approved?: boolean
          description: string
          id?: string
          markup_pct?: number | null
          part_id?: string | null
          qty: number
          quoted_price?: number | null
          request_id: string
          vendor?: string | null
          work_order_line_id?: string | null
        }
        Update: {
          approved?: boolean
          description?: string
          id?: string
          markup_pct?: number | null
          part_id?: string | null
          qty?: number
          quoted_price?: number | null
          request_id?: string
          vendor?: string | null
          work_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "part_requests"
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
          id: string
          notes: string | null
          requested_by: string | null
          shop_id: string
          status: Database["public"]["Enums"]["part_request_status"]
          work_order_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["part_request_status"]
          work_order_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["part_request_status"]
          work_order_id?: string | null
        }
        Relationships: []
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
          id: string
          low_stock_threshold: number | null
          name: string
          part_number: string | null
          price: number | null
          shop_id: string | null
          sku: string | null
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
          id?: string
          low_stock_threshold?: number | null
          name: string
          part_number?: string | null
          price?: number | null
          shop_id?: string | null
          sku?: string | null
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
          id?: string
          low_stock_threshold?: number | null
          name?: string
          part_number?: string | null
          price?: number | null
          shop_id?: string | null
          sku?: string | null
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
            referencedRelation: "work_orders"
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
      payroll_pay_periods: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          processed: boolean | null
          shop_id: string | null
          start_date: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          processed?: boolean | null
          shop_id?: string | null
          start_date: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          processed?: boolean | null
          shop_id?: string | null
          start_date?: string
        }
        Relationships: [
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
      payroll_timecards: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string | null
          hours_worked: number | null
          id: string
          shop_id: string | null
          user_id: string | null
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          created_at?: string | null
          hours_worked?: number | null
          id?: string
          shop_id?: string | null
          user_id?: string | null
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          hours_worked?: number | null
          id?: string
          shop_id?: string | null
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
      profiles: {
        Row: {
          agent_role: string | null
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
          phone: string | null
          plan: Database["public"]["Enums"]["plan_t"] | null
          postal_code: string | null
          province: string | null
          role: string | null
          shop_id: string | null
          shop_name: string | null
          street: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          agent_role?: string | null
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
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_t"] | null
          postal_code?: string | null
          province?: string | null
          role?: string | null
          shop_id?: string | null
          shop_name?: string | null
          street?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          agent_role?: string | null
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
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_t"] | null
          postal_code?: string | null
          province?: string | null
          role?: string | null
          shop_id?: string | null
          shop_name?: string | null
          street?: string | null
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
          status: string | null
          title: string
          total: number | null
          updated_at: string | null
          user_id: string | null
          work_order_id: string | null
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
          status?: string | null
          title: string
          total?: number | null
          updated_at?: string | null
          user_id?: string | null
          work_order_id?: string | null
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
          status?: string | null
          title?: string
          total?: number | null
          updated_at?: string | null
          user_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_menu_items: {
        Row: {
          created_at: string
          id: string
          labor_time: number | null
          make: string
          model: string
          parts: Json
          title: string
          updated_at: string
          year_bucket: string
        }
        Insert: {
          created_at?: string
          id?: string
          labor_time?: number | null
          make: string
          model: string
          parts?: Json
          title: string
          updated_at?: string
          year_bucket: string
        }
        Update: {
          created_at?: string
          id?: string
          labor_time?: number | null
          make?: string
          model?: string
          parts?: Json
          title?: string
          updated_at?: string
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
          province: string | null
          timezone: string | null
          user_id: string | null
        }
        Insert: {
          allow_customer_quotes?: boolean | null
          allow_self_booking?: boolean | null
          created_at?: string | null
          id?: string
          province?: string | null
          timezone?: string | null
          user_id?: string | null
        }
        Update: {
          allow_customer_quotes?: boolean | null
          allow_self_booking?: boolean | null
          created_at?: string | null
          id?: string
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
      shops: {
        Row: {
          accepts_online_booking: boolean | null
          active_user_count: number | null
          address: string | null
          auto_generate_pdf: boolean | null
          auto_send_quote_email: boolean | null
          business_name: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
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
          min_notice_minutes: number | null
          name: string | null
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
          slug: string | null
          street: string | null
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
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
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
          min_notice_minutes?: number | null
          name?: string | null
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
          slug?: string | null
          street?: string | null
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
          business_name?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
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
          min_notice_minutes?: number | null
          name?: string | null
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
          slug?: string | null
          street?: string | null
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
          started_at: string | null
          user_id: string | null
          work_order_id: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          inspection_id?: string | null
          started_at?: string | null
          user_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          inspection_id?: string | null
          started_at?: string | null
          user_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
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
          start_time: string
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          start_time?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          start_time?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
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
      vehicles: {
        Row: {
          color: string | null
          created_at: string | null
          customer_id: string | null
          drivetrain: string | null
          engine: string | null
          engine_hours: number | null
          engine_type: string | null
          fuel_type: string | null
          id: string
          license_plate: string | null
          make: string | null
          mileage: string | null
          model: string | null
          shop_id: string | null
          submodel: string | null
          transmission: string | null
          transmission_type: string | null
          unit_number: string | null
          user_id: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          customer_id?: string | null
          drivetrain?: string | null
          engine?: string | null
          engine_hours?: number | null
          engine_type?: string | null
          fuel_type?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          mileage?: string | null
          model?: string | null
          shop_id?: string | null
          submodel?: string | null
          transmission?: string | null
          transmission_type?: string | null
          unit_number?: string | null
          user_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          customer_id?: string | null
          drivetrain?: string | null
          engine?: string | null
          engine_hours?: number | null
          engine_type?: string | null
          fuel_type?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          mileage?: string | null
          model?: string | null
          shop_id?: string | null
          submodel?: string | null
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
          work_order_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          method?: string | null
          work_order_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          method?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_approvals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
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
            referencedRelation: "work_orders"
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
          hold_reason: string | null
          id: string
          inspection_session_id: string | null
          inspection_template_id: string | null
          job_type: string | null
          labor_time: number | null
          line_no: number | null
          line_status: string | null
          menu_item_id: string | null
          notes: string | null
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
          shop_id: string | null
          status: string | null
          template_id: string | null
          tools: string | null
          updated_at: string | null
          urgency: string | null
          user_id: string | null
          vehicle_id: string | null
          work_order_id: string | null
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
          hold_reason?: string | null
          id?: string
          inspection_session_id?: string | null
          inspection_template_id?: string | null
          job_type?: string | null
          labor_time?: number | null
          line_no?: number | null
          line_status?: string | null
          menu_item_id?: string | null
          notes?: string | null
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
          shop_id?: string | null
          status?: string | null
          template_id?: string | null
          tools?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
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
          hold_reason?: string | null
          id?: string
          inspection_session_id?: string | null
          inspection_template_id?: string | null
          job_type?: string | null
          labor_time?: number | null
          line_no?: number | null
          line_status?: string | null
          menu_item_id?: string | null
          notes?: string | null
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
          shop_id?: string | null
          status?: string | null
          template_id?: string | null
          tools?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id?: string | null
          vehicle_id?: string | null
          work_order_id?: string | null
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
        }
        Insert: {
          created_at?: string | null
          id?: string
          kind?: string | null
          shop_id: string
          url: string
          user_id?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          kind?: string | null
          shop_id?: string
          url?: string
          user_id?: string | null
          work_order_id?: string
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
          work_order_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          part_id?: string | null
          quantity?: number
          shop_id?: string | null
          total_price?: number | null
          unit_price?: number | null
          work_order_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          part_id?: string | null
          quantity?: number
          shop_id?: string | null
          total_price?: number | null
          unit_price?: number | null
          work_order_id?: string | null
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
          created_at: string
          description: string
          est_labor_hours: number | null
          id: string
          job_type: string
          notes: string | null
          status: string
          suggested_by: string | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string
        }
        Insert: {
          ai_cause?: string | null
          ai_complaint?: string | null
          ai_correction?: string | null
          created_at?: string
          description: string
          est_labor_hours?: number | null
          id?: string
          job_type?: string
          notes?: string | null
          status?: string
          suggested_by?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id: string
        }
        Update: {
          ai_cause?: string | null
          ai_complaint?: string | null
          ai_correction?: string | null
          created_at?: string
          description?: string
          est_labor_hours?: number | null
          id?: string
          job_type?: string
          notes?: string | null
          status?: string
          suggested_by?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string
        }
        Relationships: [
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
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          approval_state: string | null
          assigned_tech: string | null
          created_at: string | null
          created_by: string | null
          custom_id: string | null
          customer_approval_at: string | null
          customer_approval_signature_path: string | null
          customer_approval_signature_url: string | null
          customer_approved_by: string | null
          customer_id: string | null
          customer_name: string | null
          id: string
          inspection_id: string | null
          inspection_pdf_url: string | null
          inspection_type: string | null
          invoice_total: number | null
          invoice_url: string | null
          labor_total: number | null
          notes: string | null
          parts_total: number | null
          priority: number | null
          quote: Json | null
          quote_url: string | null
          shop_id: string | null
          status: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_color: string | null
          vehicle_engine_hours: number | null
          vehicle_id: string | null
          vehicle_info: string | null
          vehicle_mileage: number | null
          vehicle_unit_number: string | null
        }
        Insert: {
          approval_state?: string | null
          assigned_tech?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_id?: string | null
          customer_approval_at?: string | null
          customer_approval_signature_path?: string | null
          customer_approval_signature_url?: string | null
          customer_approved_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          inspection_id?: string | null
          inspection_pdf_url?: string | null
          inspection_type?: string | null
          invoice_total?: number | null
          invoice_url?: string | null
          labor_total?: number | null
          notes?: string | null
          parts_total?: number | null
          priority?: number | null
          quote?: Json | null
          quote_url?: string | null
          shop_id?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_color?: string | null
          vehicle_engine_hours?: number | null
          vehicle_id?: string | null
          vehicle_info?: string | null
          vehicle_mileage?: number | null
          vehicle_unit_number?: string | null
        }
        Update: {
          approval_state?: string | null
          assigned_tech?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_id?: string | null
          customer_approval_at?: string | null
          customer_approval_signature_path?: string | null
          customer_approval_signature_url?: string | null
          customer_approved_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          inspection_id?: string | null
          inspection_pdf_url?: string | null
          inspection_type?: string | null
          invoice_total?: number | null
          invoice_url?: string | null
          labor_total?: number | null
          notes?: string | null
          parts_total?: number | null
          priority?: number | null
          quote?: Json | null
          quote_url?: string | null
          shop_id?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_color?: string | null
          vehicle_engine_hours?: number | null
          vehicle_id?: string | null
          vehicle_info?: string | null
          vehicle_mileage?: number | null
          vehicle_unit_number?: string | null
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
    Views: {
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
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _ensure_same_shop: { Args: { _wo: string }; Returns: boolean }
      agent_can_start: { Args: never; Returns: boolean }
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
      can_manage_profile: {
        Args: { target_profile_id: string }
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
      create_part_request: {
        Args: { p_items: Json; p_notes: string; p_work_order: string }
        Returns: string
      }
      current_shop_id: { Args: never; Returns: string }
      first_segment_uuid: { Args: { p: string }; Returns: string }
      has_column: { Args: { col: string; tab: unknown }; Returns: boolean }
      increment_user_limit: {
        Args: { increment_by?: number; input_shop_id: string }
        Returns: undefined
      }
      is_customer: { Args: { _customer: string }; Returns: boolean }
      is_shop_member: { Args: { p_shop: string }; Returns: boolean }
      is_staff_for_shop: { Args: { _shop: string }; Returns: boolean }
      mark_active: { Args: never; Returns: undefined }
      recompute_work_order_status: {
        Args: { p_wo: string }
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_part_quote: {
        Args: {
          p_item: string
          p_price: number
          p_request: string
          p_vendor: string
        }
        Returns: undefined
      }
    }
    Enums: {
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
      part_request_status:
        | "requested"
        | "quoted"
        | "approved"
        | "fulfilled"
        | "rejected"
        | "cancelled"
      plan_t: "free" | "diy" | "pro" | "pro_plus"
      punch_event_type:
        | "start"
        | "break_start"
        | "break_end"
        | "lunch_start"
        | "lunch_end"
        | "end"
      quote_request_status: "pending" | "in_progress" | "done"
      shift_status: "active" | "ended"
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
      part_request_status: [
        "requested",
        "quoted",
        "approved",
        "fulfilled",
        "rejected",
        "cancelled",
      ],
      plan_t: ["free", "diy", "pro", "pro_plus"],
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
      ],
    },
  },
} as const
