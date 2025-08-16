export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type InspectionItem = {
  item: string;
  status?: "ok" | "fail" | "recommend";
  value?: string;
  unit?: string;
  notes?: string;
  photoUrls?: string[];
  recommend?: string[];
};

export type InspectionSection = {
  title: string;
  items: InspectionItem[];
};

export interface Database {
  public: {
    Tables: {

      shop_time_off: {
  Row: {
    id: string;
    shop_id: string;
    starts_at: string;   // timestamptz ISO
    ends_at: string;     // timestamptz ISO
    reason: string | null;
  };
  Insert: {
    id?: string;
    shop_id: string;
    starts_at: string;
    ends_at: string;
    reason?: string | null;
  };
  Update: {
    id?: string;
    shop_id?: string;
    starts_at?: string;
    ends_at?: string;
    reason?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: "shop_time_off_shop_id_fkey";
      columns: ["shop_id"];
      isOneToOne: false;
      referencedRelation: "shop";
      referencedColumns: ["id"];
    }
  ];
};

      shop_hours: {
  Row: {
    id: string;
    shop_id: string;
    weekday: number;     // 0-6
    open_time: string;   // "08:00"
    close_time: string;  // "17:00"
  };
  Insert: {
    id?: string;
    shop_id: string;
    weekday: number;
    open_time: string;
    close_time: string;
  };
  Update: {
    id?: string;
    shop_id?: string;
    weekday?: number;
    open_time?: string;
    close_time?: string;
  };
  Relationships: [
    {
      foreignKeyName: "shop_hours_shop_id_fkey";
      columns: ["shop_id"];
      isOneToOne: false;
      referencedRelation: "shop";
      referencedColumns: ["id"];
    }
  ];
};

      bookings: {
  Row: {
    id: string;
    shop_id: string;
    customer_id: string | null;
    vehicle_id: string | null;
    starts_at: string;        // timestamptz ISO
    ends_at: string;          // timestamptz ISO
    status: "pending" | "confirmed" | "cancelled" | "completed";
    notes: string | null;
    created_at: string;       // timestamptz ISO
    created_by: string | null;
  };
  Insert: {
    id?: string;
    shop_id: string;
    customer_id?: string | null;
    vehicle_id?: string | null;
    starts_at: string;
    ends_at: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed";
    notes?: string | null;
    created_at?: string;
    created_by?: string | null;
  };
  Update: {
    id?: string;
    shop_id?: string;
    customer_id?: string | null;
    vehicle_id?: string | null;
    starts_at?: string;
    ends_at?: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed";
    notes?: string | null;
    created_at?: string;
    created_by?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: "bookings_shop_id_fkey";
      columns: ["shop_id"];
      isOneToOne: false;
      referencedRelation: "shop";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "bookings_customer_id_fkey";
      columns: ["customer_id"];
      isOneToOne: false;
      referencedRelation: "customers";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "bookings_vehicle_id_fkey";
      columns: ["vehicle_id"];
      isOneToOne: false;
      referencedRelation: "vehicles";
      referencedColumns: ["id"];
    }
  ];
};

        // ---------------------------------------------
// customer_settings
// ---------------------------------------------
customer_settings: {
  Row: {
    customer_id: string;
    comm_email_enabled: boolean;
    comm_sms_enabled: boolean;
    marketing_opt_in: boolean;
    preferred_contact: "email" | "sms" | "phone" | null;
    units: "imperial" | "metric" | null;
    language: string | null;
    timezone: string | null;
    updated_at: string; // timestamptz ISO
  };
  Insert: {
    customer_id: string;
    comm_email_enabled?: boolean;
    comm_sms_enabled?: boolean;
    marketing_opt_in?: boolean;
    preferred_contact?: "email" | "sms" | "phone" | null;
    units?: "imperial" | "metric" | null;
    language?: string | null;
    timezone?: string | null;
    updated_at?: string;
  };
  Update: {
    customer_id?: string;
    comm_email_enabled?: boolean;
    comm_sms_enabled?: boolean;
    marketing_opt_in?: boolean;
    preferred_contact?: "email" | "sms" | "phone" | null;
    units?: "imperial" | "metric" | null;
    language?: string | null;
    timezone?: string | null;
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: "customer_settings_customer_id_fkey";
      columns: ["customer_id"];
      isOneToOne: true;
      referencedRelation: "customers";
      referencedColumns: ["id"];
    }
  ];
};

        history: {
  Row: {
    id: string;
    customer_id: string;
    vehicle_id: string;
    inspection_id: string | null;
    work_order_id: string | null;
    description: string | null;
    notes: string | null;
    service_date: string | null; // ISO date string
    status: string | null; // could be 'completed', 'in_progress', etc.
    created_at: string;
    type: 'inspection' | 'work_order' | 'note' | 'other';
  };
  Insert: {
    id?: string;
    customer_id: string;
    vehicle_id: string;
    inspection_id?: string | null;
    work_order_id?: string | null;
    description?: string | null;
    notes?: string | null;
    service_date?: string | null;
    status?: string | null;
    created_at?: string;
    type: 'inspection' | 'work_order' | 'note' | 'other';
  };
  Update: {
    id?: string;
    customer_id?: string;
    vehicle_id?: string;
    inspection_id?: string | null;
    work_order_id?: string | null;
    description?: string | null;
    notes?: string | null;
    service_date?: string | null;
    status?: string | null;
    created_at?: string;
    type?: 'inspection' | 'work_order' | 'note' | 'other';
  };
  Relationships: [
    {
      foreignKeyName: "history_customer_id_fkey";
      columns: ["customer_id"];
      isOneToOne: false;
      referencedRelation: "customers";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "history_vehicle_id_fkey";
      columns: ["vehicle_id"];
      isOneToOne: false;
      referencedRelation: "vehicles";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "history_inspection_id_fkey";
      columns: ["inspection_id"];
      isOneToOne: false;
      referencedRelation: "inspections";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "history_work_order_id_fkey";
      columns: ["work_order_id"];
      isOneToOne: false;
      referencedRelation: "work_orders";
      referencedColumns: ["id"];
    }
  ];
};

      inspection_templates: {
        Row: {
          id: string;
          user_id: string;
          template_name: string;
          sections: InspectionSection[];
          description?: string | null;
          tags?: string[] | null;
          vehicle_type?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          user_id: string;
          template_name: string;
          sections: InspectionSection[];
          description?: string | null;
          tags?: string[] | null;
          vehicle_type?: string | null;
          is_public?: boolean;
        };
        Update: Partial<{
          template_name: string;
          sections: InspectionSection[];
          description?: string | null;
          tags?: string[] | null;
          vehicle_type?: string | null;
          is_public?: boolean;
          updated_at?: string;
        }>;
      };

      vehicle_photos: {
        Row: {
          id: string;
          vehicle_id: string;
          uploaded_by: string | null;
          url: string;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          uploaded_by?: string | null;
          url: string;
          caption?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vehicle_id?: string;
          uploaded_by?: string | null;
          url?: string;
          caption?: string | null;
          created_at?: string;
        };
      };

      work_order_lines: {
        Row: {
          vehicles: {
            year: number | null;
            make: string | null;
            model: string | null;
          };
          id: string;
          work_order_id: string | null;
          vehicle_id: string | null;
          complaint: string | null;
          cause: string | null;
          correction: string | null;
          status:
            | "ready"
            | "active"
            | "paused"
            | "on_hold"
            | "completed"
            | "queued"
            | "awaiting"
            | "in_progress";
          job_type?: "diagnosis" | "inspection-fail" | "maintenance" | "repair";
          assigned_to: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at: string;
          updated_at: string;
          punched_in_at: string;
          punched_out_at: string;
          hold_reason: string | null;
          assigned_tech_id: string | null;
        };
        Insert: {
          id?: string;
          work_order_id?: string | null;
          vehicle_id?: string | null;
          complaint?: string | null;
          cause?: string | null;
          correction?: string | null;
          status?:
            | "ready"
            | "active"
            | "paused"
            | "on_hold"
            | "completed"
            | "queued"
            | "awaiting"
            | "in_progress";
          job_type?: "diagnosis" | "inspection-fail" | "maintenance" | "repair";
          assigned_to?: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at?: string;
          updated_at?: string;
          punched_in_at: string | null;
          punched_out_at: string | null;
          hold_reason: string | null;
          assigned_tech_id: string | null;
        };
        Update: {
          id?: string;
          work_order_id?: string | null;
          vehicle_id?: string | null;
          complaint?: string | null;
          cause?: string | null;
          correction?: string | null;
          status?:
            | "ready"
            | "active"
            | "paused"
            | "on_hold"
            | "completed"
            | "queued"
            | "awaiting"
            | "in_progress";
          job_type?: "diagnosis" | "inspection-fail" | "maintenance" | "repair";
          assigned_to?: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at?: string;
          updated_at?: string;
          assigned_tech_id: string | null;
          punched_in_at: string | null;
          punched_out_at: string | null;
          hold_reason: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_lines_assigned_to_fkey";
            columns: ["assigned_to"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_order_lines_work_order_id_fkey";
            columns: ["work_order_id"];
            referencedRelation: "work_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_order_lines_vehicle_id_fkey";
            columns: ["vehicle_id"];
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_shop_id_fkey";
            columns: ["shop_id"];
            referencedRelation: "shop";
            referencedColumns: ["id"];
          },
        ];
      };

      menu_items: {
        Row: {
          id: string;
          name: string;
          category: string;
          labor_time: number | null;
          parts_cost: number | null;
          total_price: number;
          user_id: string;
          created_at?: string;
        };
        Insert: {
          name: string;
          category?: string;
          labor_time?: number | null;
          parts_cost?: number | null;
          total_price: number;
          user_id: string;
          created_at?: string;
        };
        Update: {
          name?: string;
          category?: string;
          labor_time?: number | null;
          parts_cost?: number | null;
          total_price?: number;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      work_orders: {
        Row: {
          quote_url: any;
          id: string;
          vehicle_id: string | null;
          inspection_id: string | null;
          status:
            | "open"
            | "in_progress"
            | "paused"
            | "completed"
            | "cancelled"
            | "queued";
          location?: string | null;
          created_at: string;
          quote_sent_at?: string;
          started_at?: string; // ⬅️ Add this
          completed_at?: string; // ⬅️ Add this
          quote?: Json | null; // ⬅️ Add thi
        };
        Insert: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?:
            | "open"
            | "in_progress"
            | "paused"
            | "completed"
            | "cancelled"
            | "queued";
          location?: string | null;
          created_at?: string;
          quote_sent_at?: string;
          started_at?: string; // ⬅️ Add this
          completed_at?: string; // ⬅️ Add this
          quote?: Json | null; // ⬅️ Add thi
        };
        Update: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?:
            | "open"
            | "in_progress"
            | "paused"
            | "completed"
            | "cancelled"
            | "queued";
          location?: string | null;
          created_at?: string;
          quote_sent_at?: string;
          started_at?: string; // ⬅️ Add this
          completed_at?: string; // ⬅️ Add this
          quote?: Json | null; // ⬅️ Add thi
        };
        Relationships: [
          {
            foreignKeyName: "work_orders_vehicle_id_fkey";
            columns: ["vehicle_id"];
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_orders_inspection_id_fkey";
            columns: ["inspection_id"];
            referencedRelation: "inspections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_shop_id_fkey";
            columns: ["shop_id"];
            referencedRelation: "shop";
            referencedColumns: ["id"];
          },
        ];
      };

      parts_requests: {
        Row: {
          id: string;
          job_id: string;
          part_name: string;
          quantity: number;
          notes: string | null;
          created_at: string;
          requested_by?: string;
          photo_urls: string[];
          workOrderId: string;
          urgency: "low" | "medium" | "high";
          viewed_at: string | null;
          fulfilled_at: string | null;
          archived: boolean;
        };
        Insert: {
          id?: string;
          job_id: string;
          part_name: string;
          quantity: number;
          notes?: string | null;
          created_at?: string;
          requested_by?: string;
          photo_urls: string[];
          work_order_id?: string;
          urgency: "low" | "medium" | "high";
          viewed_at: string | null;
          fulfilled_at: string | null;
          archived: boolean;
        };
        Update: {
          id?: string;
          job_id?: string;
          part_name?: string;
          quantity?: number;
          notes?: string | null;
          created_at?: string;
          requested_by?: string;
          photo_urls: string[];
          workOrderId: string;
          urgency: "low" | "medium" | "high";
          viewed_at: string | null;
          fulfilled_at: string | null;
          archived: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "parts_requests_job_id_fkey";
            columns: ["job_id"];
            referencedRelation: "work_order_lines";
            referencedColumns: ["id"];
          },
        ];
      };

      parts: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number | null;
          cost: number | null;
          part_number: string | null;
          category: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price?: number | null;
          cost?: number | null;
          part_number?: string | null;
          category?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price?: number | null;
          cost?: number | null;
          part_number?: string | null;
          category?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      parts_request_messages: {
        Row: {
          id: string;
          request_id: string;
          sender_id: string | null;
          message: string;
          created_at: string;
        };
        Insert: {
          id: string;
          request_id: string;
          sender_id?: string | null;
          message: string;
          created_at?: string;
        };
      };

      quote_lines: {
        Row: {
          id: string;
          quote_id: string;
          name: string;
          description: string;
          labor_hours: number;
          parts_cost: number;
          total_price: number;
          part_name: string;
          part_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          name: string;
          description: string;
          labor_hours: number;
          parts_cost: number;
          total_price: number;
          part_name: string;
          part_price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          quote_id?: string;
          name?: string;
          description?: string;
          labor_hours?: number;
          parts_cost?: number;
          total_price?: number;
          part_name?: string;
          part_price?: number;
          created_at?: string;
        };
      };

      quotes: {
        Row: {
          id: string;
          work_order_id: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          work_order_id: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          work_order_id?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_work_order_id_fkey";
            columns: ["work_order_id"];
            referencedRelation: "work_orders";
            referencedColumns: ["id"];
          },
        ];
      };

      vin_decodes: {
        Row: {
          id: string;
          vin: string;
          user_id: string;
          year: string | null;
          make: string | null;
          model: string | null;
          trim: string | null;
          engine: string | null;
          created_at: string;
        };
        Insert: {
          vin: string;
          user_id: string;
          year?: string | null;
          make?: string | null;
          model?: string | null;
          trim?: string | null;
          engine?: string | null;
        };
        Update: Partial<{
          vin: string;
          user_id: string;
          year: string | null;
          make: string | null;
          model: string | null;
          trim: string | null;
          engine: string | null;
        }>;
      };

      // 1. conversations table
      conversations: {
        Row: {
          id: string;
          created_by: string;
          context_type: string | null;
          context_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          created_by: string;
          context_type?: string | null;
          context_id?: string | null;
          created_at?: string;
        };
        Update: {
          context_type?: string | null;
          context_id?: string | null;
          created_at?: string;
        };
      };

      // 2. conversation_participants table
      conversation_participants: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: string | null;
          added_at: string;
        };
        Insert: {
          id: string;
          conversation_id: string;
          user_id: string;
          role?: string | null;
          added_at?: string;
        };
        Update: {
          role?: string | null;
          added_at?: string;
        };
      };

      // 3. messages table
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          sent_at: string;
          read_by: string[] | null;
        };
        Insert: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          sent_at?: string;
          read_by?: string[] | null;
        };
        Update: {
          content?: string;
          sent_at?: string;
          read_by?: string[] | null;
        };
      };

      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          plan?: "free" | "diy" | "pro" | "pro_plus";
          created_at?: string | null;
          shop_id?: string | null;
          business_name: string | null;
          phone: string | null;
          street: string | null;
city: string | null;
province: string | null;
postal_code: string | null;
          role:
            | "owner"
            | "admin"
            | "manager"
            | "mechanic"
            | "advisor"
            | "parts"
            | null;
          shop_name: string | null;
        };
        Insert: {
          id: string;
          full_name: string | null;
          email: string | null;
          plan?: "free" | "diy" | "pro" | "pro_plus";
          created_at?: string | null;
          shop_id?: string | null;
          business_name: string | null;
          phone: string | null;
          street: string | null;
            city: string | null;
            province: string | null;
            postal_code: string | null;
          role:
            | "owner"
            | "admin"
            | "manager"
            | "mechanic"
            | "advisor"
            | "parts"
            | null;
          shop_name: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email: string | null;
          plan?: "free" | "diy" | "pro" | "pro_plus";
          created_at?: string | null;
          shop_id?: string | null;
          business_name?: string | null;
          phone?: string | null;
          street: string | null;
city: string | null;
province: string | null;
postal_code: string | null;
          role?:
            | "owner"
            | "admin"
            | "manager"
            | "mechanic"
            | "advisor"
            | "parts"
            | null;
          shop_name?: string | null;
        };

        Relationships: [
          {
            foreignKeyName: "profiles_shop_id_fkey";
            columns: ["shop_id"];
            referencedRelation: "shop";
            referencedColumns: ["id"];
          },
        ];
      };

      tech_shifts: {
        Row: {
          id: string;
          tech_id: string;
          start_time: string; // ISO date string
          ended_time: string | null;
          break_start: string | null;
          break_end: string | null;
          lunch_start: string | null;
          lunch_end: string | null;
          status:
            | "not_started"
            | "punched_in"
            | "on_break"
            | "on_lunch"
            | "punched_out"
            | "ended"
            | "active";
          created_at: string;
        };
        Insert: {
          id?: string;
          tech_id: string;
          start_time: string;
          ended_time?: string | null;
          break_start?: string | null;
          lunch_start?: string | null;
          status:
            | "not_started"
            | "punched_in"
            | "on_break"
            | "on_lunch"
            | "punched_out"
            | "ended"
            | "active";
          created_at?: string;
        };
        Update: {
          start_time?: string | null;
          end_time?: string | null;
          break_start?: string | null;
          break_end?: string | null;
          lunch_start?: string | null;
          lunch_end?: string | null;
          status?:
            | "not_started"
            | "punched_in"
            | "on_break"
            | "on_lunch"
            | "punched_out"
            | "ended"
            | "active";
        };
        Relationships: [
          {
            foreignKeyName: "tech_shifts_tech_id_fkey";
            columns: ["tech_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      punch_events: {
        Row: {
          id: string;
          created_at: string;
          tech_id: string;
          shift_id: string;
          type:
            | "start"
            | "break_start"
            | "break_end"
            | "lunch_start"
            | "lunch_end"
            | "end";
          timestamp: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          tech_id: string;
          shift_id: string;
          type:
            | "start"
            | "break_start"
            | "break_end"
            | "lunch_start"
            | "lunch_end"
            | "end";
          timestamp?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          tech_id?: string;
          shift_id?: string;
          type?:
            | "start"
            | "break_start"
            | "break_end"
            | "lunch_start"
            | "lunch_end"
            | "end";
          timestamp?: string;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "punch_events_shift_id_fkey";
            columns: ["shift_id"];
            referencedRelation: "tech_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "punch_events_tech_id_fkey";
            columns: ["tech_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      inspections: {
        Row: {
          id: string;
          user_id: string;
          template: string;
          result: Json;
          vehicle: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          template: string;
          result: Json;
          vehicle?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          template?: string;
          result?: Json;
          vehicle?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_shop_id_fkey";
            columns: ["shop_id"];
            referencedRelation: "shop";
            referencedColumns: ["id"];
          },
        ];
      };

      customers: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string;
          email: string;
          street: string | null;
city: string | null;
province: string | null;
postal_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          phone?: string;
          email?: string;
          street: string | null;
city: string | null;
province: string | null;
postal_code: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          phone?: string;
          email?: string;
          street: string | null;
city: string | null;
province: string | null;
postal_code: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_shop_id_fkey";
            columns: ["shop_id"];
            referencedRelation: "shop";
            referencedColumns: ["id"];
          },
        ];
      };

      shops: {
        Row: {
          slug: string;
          id: string;
          name: string;
          created_at: string;
          role:
            | "owner"
            | "admin"
            | "manager"
            | "mechanic"
            | "advisor"
            | "parts"
            | "customer"
            | null;
          address: string | null;
          city: string | null;
          province: string | null;
          postal_code: string | null;
          phone_number: string | null;
          email: string | null;
          logo_url: string | null;
          default_labor_rate: number | null;
          default_shop_supplies_percent: number | null;
          default_diagnostic_fee: number | null;
          default_tax_rate: number | null;
          require_cause_correction: boolean | null;
          require_job_authorization: boolean | null;
          enable_ai: boolean | null;
          invoice_terms: string | null;
          invoice_footer: string | null;
          auto_email_quotes: boolean | null;
          auto_pdf_quotes: boolean | null;
          timezone: string | null;
          accepts_online_booking: boolean | null;
          owner_pin_hash: string | null;
          // Add any other fields you use
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          role:
            | "owner"
            | "admin"
            | "manager"
            | "mechanic"
            | "advisor"
            | "parts"
            | "customer"
            | null;
          address: string | null;
          city: string | null;
          province: string | null;
          postal_code: string | null;
          phone_number: string | null;
          email: string | null;
          logo_url: string | null;
          default_labor_rate: number | null;
          default_shop_supplies_percent: number | null;
          default_diagnostic_fee: number | null;
          default_tax_rate: number | null;
          require_cause_correction: boolean | null;
          require_job_authorization: boolean | null;
          enable_ai: boolean | null;
          invoice_terms: string | null;
          invoice_footer: string | null;
          auto_email_quotes: boolean | null;
          auto_pdf_quotes: boolean | null;
          timezone: string | null;
          accepts_online_booking: boolean | null;
          owner_pin_hash: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          role:
            | "owner"
            | "admin"
            | "manager"
            | "mechanic"
            | "advisor"
            | "parts"
            | "customer"
            | null;
          address: string | null;
          city: string | null;
          province: string | null;
          postal_code: string | null;
          phone_number: string | null;
          email: string | null;
          logo_url: string | null;
          default_labor_rate: number | null;
          default_shop_supplies_percent: number | null;
          default_diagnostic_fee: number | null;
          default_tax_rate: number | null;
          require_cause_correction: boolean | null;
          require_job_authorization: boolean | null;
          enable_ai: boolean | null;
          invoice_terms: string | null;
          invoice_footer: string | null;
          auto_email_quotes: boolean | null;
          auto_pdf_quotes: boolean | null;
          timezone: string | null;
          accepts_online_booking: boolean | null;
          owner_pin_hash: string | null;
        };
        Relationships: [];
      };

      vehicles: {
        Row: {
          id: string;
          year: string;
          make: string;
          model: string;
          vin: string;
          license_plate: string;
          mileage: string;
          color: string;
          created_at: string;
          customer_id?: string | null;
        };
        Insert: {
          id?: string;
          year?: string;
          make: string;
          model: string;
          vin?: string;
          license_plate?: string;
          mileage?: string;
          color?: string;
          created_at?: string;
          customer_id?: string | null;
        };
        Update: {
          id?: string;
          year?: string;
          make?: string;
          model?: string;
          vin?: string;
          license_plate?: string;
          mileage?: string;
          color?: string;
          created_at?: string;
          customer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey";
            columns: ["customer_id"];
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_shop_id_fkey";
            columns: ["shop_id"];
            referencedRelation: "shop";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ... your full Database interface above ...

export type QuoteLine = Database["public"]["Tables"]["quote_lines"]["Row"];
export type QuoteLineWithPart = QuoteLine & {
  price: number | null;
  labor_hours: number | null;
  part?: {
    name: string;
    price: number;
  } | null;
};

// Canonical DB row aliases
export type WorkOrderLineRow =
  Database["public"]["Tables"]["work_order_lines"]["Row"];

// UI-friendly job card type used by queue/components
export type JobLine = {
  id: string;
  status:
    | "ready"
    | "active"
    | "paused"
    | "on_hold"
    | "completed"
    | "queued"
    | "awaiting"
    | "in_progress";
  complaint: string | null;

  // joined vehicle basics for cards/lists
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  };

  // joined profile name for "assigned_to"
  assigned_to?: {
    full_name?: string | null;
  };

  punched_in_at?: string | null;
  punched_out_at?: string | null;
  hold_reason?: string | null;
  created_at: string;
};

export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "mechanic"
  | "advisor"
  | "parts"
  | "customer";

  export type CustomerSettingsRow =
  Database["public"]["Tables"]["customer_settings"]["Row"];

export type CustomerSettingsUpsert =
  Database["public"]["Tables"]["customer_settings"]["Insert"];

  // Minimal chat message shape used by the app’s AI helpers
export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;              // optional timestamp
  conversation_id?: string | null;  // optional, if you thread chats
  meta?: Record<string, unknown>;   // optional, for extra data
};