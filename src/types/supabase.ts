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
          status: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed' | 'queued' | 'awaiting' | 'in_progress';
          job_type?: 'diagnosis' | 'inspection-fail' | 'maintenance' | 'repair';
          assigned_to: string | null;
          labor_time?: number | null;
          parts_needed?: string[] | null;
          parts_received?: string[] | null;
          created_at: string;
          updated_at: string;
          punched_in_at: string | null;
          punched_out_at: string | null;
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
          status?: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed' | 'queued' | 'awaiting' | 'in_progress';
          job_type?: 'diagnosis' | 'inspection-fail' | 'maintenance' | 'repair';
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
          status?: 'ready' | 'active' | 'paused' | 'on_hold' | 'completed' | 'queued' | 'awaiting' | 'in_progress';
          job_type?: 'diagnosis' | 'inspection-fail' | 'maintenance' | 'repair';
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
      
      work_orders: {
        Row: {
          id: string;
          vehicle_id: string | null;
          inspection_id: string | null;
          status: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
          location?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
          location?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
          location?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_orders_vehicle_id_fkey';
            columns: ['vehicle_id'];
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_orders_inspection_id_fkey';
            columns: ['inspection_id'];
            referencedRelation: 'inspections';
            referencedColumns: ['id'];
          }
        ];
      }

      profiles: {
        Row: {
          id: string;
          full_name: string;
          plan: 'diy' | 'pro' | 'elite';
          created_at: string | null;
        };
        Insert: {
          id: string;
          full_name: string;
          plan?: 'diy' | 'pro' | 'elite';
          created_at?: string | null;
        };
        Update: {
          id?: string;
          full_name: string;
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

      customers: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          phone?: string;
          email?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          phone?: string;
          email?: string;
          created_at?: string;
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
            foreignKeyName: 'vehicles_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    

    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}