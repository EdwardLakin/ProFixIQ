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
          },
          {
            foreignKeyName: 'profiles_shop_id_fkey',
            columns: ['shop_id'],
            referencedRelation: 'shop',
            referencedColumns: ['id']
          }
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
      }
      
      work_orders: {
        Row: {
          id: string;
          vehicle_id: string | null;
          inspection_id: string | null;
          status: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'queued';
          location?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'queued';
          location?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'queued';
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
          },
          {
            foreignKeyName: 'profiles_shop_id_fkey',
            columns: ['shop_id'],
            referencedRelation: 'shop',
            referencedColumns: ['id']
          }
        ];
      }

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
    urgency: string | null;
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
    urgency: string | null;
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
    urgency: string | null;
  };
  Relationships: [
    {
      foreignKeyName: 'parts_requests_job_id_fkey';
      columns: ['job_id'];
      referencedRelation: 'work_order_lines';
      referencedColumns: ['id'];
    }
  ];
};

        profiles: {
          Row: {
            id: string;
            full_name: string | null;
            plan?: 'free' | 'diy' | 'pro' | 'pro_plus';
            created_at?: string | null;
            shop_id?: string | null;
            business_name: string | null;
            phone: string | null;
            role: 'owner' | 'admin' | 'manager' | 'mechanic' | null;
            shop_name: string | null;
          };
          Insert: {
            id: string;
            full_name: string | null;
            plan?: 'free' | 'diy' | 'pro' | 'pro_plus';
            created_at?: string | null;
            shop_id?: string | null;
            business_name: string | null;
            phone: string | null;
            role: 'owner' | 'admin' | 'manager' | 'mechanic' | null ;
            shop_name: string | null;
          };
          Update: {
            id?: string;
            full_name?: string | null;
            plan?: 'free' | 'diy' | 'pro' | 'pro_plus';
            created_at?: string | null;
            shop_id?: string | null;
            business_name?: string | null;
            phone?: string | null;
            role?: 'owner' | 'admin' | 'manager' | 'mechanic' | null;
            shop_name?: string | null;
          };
       
        Relationships: [
          {
            foreignKeyName: 'profiles_shop_id_fkey';
            columns: ['shop_id'];
            referencedRelation: 'shop';
            referencedColumns: ['id'];
          }
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
          foreignKeyName: 'profiles_shop_id_fkey',
          columns: ['shop_id'],
          referencedRelation: 'shop',
          referencedColumns: ['id']
        }
        ];
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
        Relationships: [
        {
          foreignKeyName: 'profiles_shop_id_fkey',
          columns: ['shop_id'],
          referencedRelation: 'shop',
          referencedColumns: ['id']
        }
        ];
      };

      shop: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          role: 'owner' | 'admin' | 'manager' | 'mechanic' | null;
    // Add any other fields you use
        };
          Insert: {
          id?: string;
          name: string;
          created_at?: string;
          role: 'owner' | 'admin' | 'manager' | 'mechanic' | null;
        };
          Update: {
          id?: string;
          name?: string;
          created_at?: string;
          role: 'owner' | 'admin' | 'manager' | 'mechanic' | null;
        };
          Relationships: [];
        }

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
          },
          {
            foreignKeyName: 'profiles_shop_id_fkey',
            columns: ['shop_id'],
            referencedRelation: 'shop',
            referencedColumns: ['id']
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