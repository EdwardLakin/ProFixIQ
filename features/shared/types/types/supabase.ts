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
          city: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
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
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
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
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
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
            isOneToOne: false
            referencedRelation: "work_order_lines"
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
      inspection_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
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
      menu_items: {
        Row: {
          category: string | null
          cause: string | null
          complaint: string | null
          correction: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          labor_hours: number | null
          labor_time: number | null
          name: string | null
          part_cost: number | null
          shop_id: string | null
          tools: string | null
          total_price: number | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          labor_hours?: number | null
          labor_time?: number | null
          name?: string | null
          part_cost?: number | null
          shop_id?: string | null
          tools?: string | null
          total_price?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          cause?: string | null
          complaint?: string | null
          correction?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          labor_hours?: number | null
          labor_time?: number | null
          name?: string | null
          part_cost?: number | null
          shop_id?: string | null
          tools?: string | null
          total_price?: number | null
          user_id?: string | null
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
      messages: {
        Row: {
          attachments: Json
          chat_id: string | null
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
          chat_id?: string | null
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
          chat_id?: string | null
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
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          year_range: unknown | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          make: string
          model: string
          part_id?: string | null
          shop_id?: string | null
          year_range?: unknown | null
        }
        Update: {
          created_at?: string | null
          id?: string
          make?: string
          model?: string
          part_id?: string | null
          shop_id?: string | null
          year_range?: unknown | null
        }
        Relationships: [
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
          description: string | null
          id: string
          name: string
          part_number: string | null
          price: number | null
          shop_id: string | null
          sku: string | null
          supplier: string | null
        }
        Insert: {
          category?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          part_number?: string | null
          price?: number | null
          shop_id?: string | null
          sku?: string | null
          supplier?: string | null
        }
        Update: {
          category?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          part_number?: string | null
          price?: number | null
          shop_id?: string | null
          sku?: string | null
          supplier?: string | null
        }
        Relationships: []
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
      profiles: {
        Row: {
          business_name: string | null
          city: string | null
          completed_onboarding: boolean
          created_at: string | null
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          phone: string | null
          plan: Database["public"]["Enums"]["plan_t"] | null
          postal_code: string | null
          province: string | null
          role: string | null
          shop_id: string | null
          shop_name: string | null
          street: string | null
          updated_at: string | null
        }
        Insert: {
          business_name?: string | null
          city?: string | null
          completed_onboarding?: boolean
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_active_at?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_t"] | null
          postal_code?: string | null
          province?: string | null
          role?: string | null
          shop_id?: string | null
          shop_name?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Update: {
          business_name?: string | null
          city?: string | null
          completed_onboarding?: boolean
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_t"] | null
          postal_code?: string | null
          province?: string | null
          role?: string | null
          shop_id?: string | null
          shop_name?: string | null
          street?: string | null
          updated_at?: string | null
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
          status: string
          type: string
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
      vehicles: {
        Row: {
          color: string | null
          created_at: string | null
          customer_id: string | null
          engine_hours: number | null
          id: string
          license_plate: string | null
          make: string | null
          mileage: string | null
          model: string | null
          shop_id: string | null
          unit_number: string | null
          user_id: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          customer_id?: string | null
          engine_hours?: number | null
          id?: string
          license_plate?: string | null
          make?: string | null
          mileage?: string | null
          model?: string | null
          shop_id?: string | null
          unit_number?: string | null
          user_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          customer_id?: string | null
          engine_hours?: number | null
          id?: string
          license_plate?: string | null
          make?: string | null
          mileage?: string | null
          model?: string | null
          shop_id?: string | null
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
      vin_decodes: {
        Row: {
          created_at: string | null
          decoded_data: Json | null
          id: string
          user_id: string | null
          vin: string
        }
        Insert: {
          created_at?: string | null
          decoded_data?: Json | null
          id?: string
          user_id?: string | null
          vin: string
        }
        Update: {
          created_at?: string | null
          decoded_data?: Json | null
          id?: string
          user_id?: string | null
          vin?: string
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
          job_type: string | null
          labor_time: number | null
          line_status: string | null
          notes: string | null
          on_hold_since: string | null
          parts_needed: Json | null
          parts_received: Json | null
          parts_required: Json | null
          priority: number | null
          punched_in_at: string | null
          punched_out_at: string | null
          shop_id: string | null
          status: string | null
          template_id: string | null
          tools: string | null
          updated_at: string | null
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
          job_type?: string | null
          labor_time?: number | null
          line_status?: string | null
          notes?: string | null
          on_hold_since?: string | null
          parts_needed?: Json | null
          parts_received?: Json | null
          parts_required?: Json | null
          priority?: number | null
          punched_in_at?: string | null
          punched_out_at?: string | null
          shop_id?: string | null
          status?: string | null
          template_id?: string | null
          tools?: string | null
          updated_at?: string | null
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
          job_type?: string | null
          labor_time?: number | null
          line_status?: string | null
          notes?: string | null
          on_hold_since?: string | null
          parts_needed?: Json | null
          parts_received?: Json | null
          parts_required?: Json | null
          priority?: number | null
          punched_in_at?: string | null
          punched_out_at?: string | null
          shop_id?: string | null
          status?: string | null
          template_id?: string | null
          tools?: string | null
          updated_at?: string | null
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
            referencedRelation: "work_orders"
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
      work_orders: {
        Row: {
          approval_state: string | null
          assigned_tech: string | null
          created_at: string | null
          custom_id: string | null
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
          custom_id?: string | null
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
          custom_id?: string | null
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
    }
    Functions: {
      _ensure_same_shop: {
        Args: { _wo: string }
        Returns: boolean
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
      check_plan_limit: {
        Args: { _feature: string }
        Returns: boolean
      }
      clear_auth: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      current_shop_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      first_segment_uuid: {
        Args: { p: string }
        Returns: string
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      has_column: {
        Args: { _col: string; _table: unknown }
        Returns: boolean
      }
      increment_user_limit: {
        Args: { increment_by?: number; input_shop_id: string }
        Returns: undefined
      }
      is_customer: {
        Args: { _customer: string }
        Returns: boolean
      }
      is_staff_for_shop: {
        Args: { _shop: string }
        Returns: boolean
      }
      mark_active: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      seed_default_hours: {
        Args: { shop_id: string }
        Returns: undefined
      }
      send_for_approval: {
        Args: { _line_ids: string[]; _set_wo_status?: boolean; _wo: string }
        Returns: undefined
      }
      set_authenticated: {
        Args: { uid: string }
        Returns: undefined
      }
      set_last_active_now: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      shop_id_for: {
        Args: { uid: string }
        Returns: string
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
    }
    Enums: {
      job_type_enum: "diagnosis" | "inspection" | "maintenance" | "repair"
      plan_t: "free" | "diy" | "pro" | "pro_plus"
      punch_event_type:
        | "start"
        | "break_start"
        | "break_end"
        | "lunch_start"
        | "lunch_end"
        | "end"
      shift_status: "active" | "ended"
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
      job_type_enum: ["diagnosis", "inspection", "maintenance", "repair"],
      plan_t: ["free", "diy", "pro", "pro_plus"],
      punch_event_type: [
        "start",
        "break_start",
        "break_end",
        "lunch_start",
        "lunch_end",
        "end",
      ],
      shift_status: ["active", "ended"],
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
