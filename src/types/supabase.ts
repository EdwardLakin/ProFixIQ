export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  public: {
    Tables: {
      work_order_lines: {
        Row: {
          id: string;
          work_order_id: string | null;
          vehicle_id: string | null;
          complaint: string | null;
          cause: string | null;
          correction: string | null;
          status: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed';
          assigned_to: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          work_order_id?: string | null;
          vehicle_id?: string | null;
          complaint?: string | null;
          cause?: string | null;
          correction?: string | null;
          status?: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed';
          assigned_to?: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          work_order_id?: string | null;
          vehicle_id?: string | null;
          complaint?: string | null;
          cause?: string | null;
          correction?: string | null;
          status?: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed';
          assigned_to?: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_order_lines_assigned_to_fkey';
            columns: ['assigned_to'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_lines_work_order_id_fkey';
            columns: ['work_order_id'];
            referencedRelation: 'work_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_lines_vehicle_id_fkey';
            columns: ['vehicle_id'];
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          }
        ];
      };

      profiles: {
        Row: {
          id: string;
          plan: 'diy' | 'pro' | 'elite';
          created_at: string | null;
        };
        Insert: {
          id: string;
          plan?: 'diy' | 'pro' | 'elite';
          created_at?: string | null;
        };
        Update: {
          id?: string;
          plan?: 'diy' | 'pro' | 'elite';
          created_at?: string | null;
        };
        Relationships: [];
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
        Relationships: [];
      };
    };

    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}