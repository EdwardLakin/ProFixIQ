

export interface User {
  id: string;
  email: string;
  full_name?: string;
  plan: "free" | "diy" | "pro" | "pro_plus";
}

export interface Project {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export type JobStatus = 'awaiting' | 'in_progress' | 'on_hold' | 'completed';

export type JobLine = {
  id: string;
  status: JobStatus;
  complaint?: string | null;
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  assigned_tech_full_name?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  hold_reason?: string | null;
  work_order_id?: string | null;
};

// Extend your Database type to support Supabase relationships
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      work_order_lines: {
        Row: {
          id?: string;
          work_order_id?: string | null;
          vehicle_id?: string | null;
          complaint?: string | null;
          cause?: string | null;
          correction?: string | null;
          status?: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed' | 'queued' | 'awaiting' | 'in_progress';
          assigned_to?: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at?: string;
          updated_at?: string;
          assigned_tech_id?: string | null;         // ✅ FIXED: add '?'
          punched_in_at?: string | null;            // ✅ FIXED: add '?'
          punched_out_at?: string | null;           // ✅ FIXED: add '?'
          hold_reason?: string | null;
        };
          
        Insert: {
          id?: string;
          work_order_id?: string | null;
          vehicle_id?: string | null;
          complaint?: string | null;
          cause?: string | null;
          correction?: string | null;
          status?: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed' | 'queued' | 'awaiting' | 'in_progress';
          assigned_to?: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at?: string;
          updated_at?: string;
          assigned_tech_id?: string | null;         // ✅ FIXED: add '?'
          punched_in_at?: string | null;            // ✅ FIXED: add '?'
          punched_out_at?: string | null;           // ✅ FIXED: add '?'
          hold_reason?: string | null;
        };
        Update: Partial<Database['public']['Tables']['work_order_lines']['Row']>;
      };

      vehicles: {
        Row: {
          id: string;
          year: number | null;
          make: string | null;
          model: string | null;
        };
        Insert: {
          id?: string;
          year?: number | null;
          make?: string | null;
          model?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vehicles']['Row']>;
      };

      profiles: {
        Row: {
          id: string;
          full_name: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
    };
  };
}