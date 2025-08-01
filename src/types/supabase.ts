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
          quote_sent_at?: string;
        };
        Insert: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'queued';
          location?: string | null;
          created_at?: string;
          quote_sent_at?: string;
        };
        Update: {
          id?: string;
          vehicle_id?: string | null;
          inspection_id?: string | null;
          status?: 'open' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'queued';
          location?: string | null;
          created_at?: string;
          quote_sent_at?: string;
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
    urgency: 'low' | 'medium' | 'high' ;
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
    urgency: 'low' | 'medium' | 'high' ;
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
    urgency: 'low' | 'medium' | 'high' ;
    viewed_at: string | null;
    fulfilled_at: string | null;
    archived: boolean;
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
      foreignKeyName: 'quotes_work_order_id_fkey';
      columns: ['work_order_id'];
      referencedRelation: 'work_orders';
      referencedColumns: ['id'];
    }
  ];
}

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
            plan?: 'free' | 'diy' | 'pro' | 'pro_plus';
            created_at?: string | null;
            shop_id?: string | null;
            business_name: string | null;
            phone: string | null;
            role: 'owner' | 'admin' | 'manager' | 'mechanic' | 'advisor' | 'parts' | null;
            shop_name: string | null;
          };
          Insert: {
            id: string;
            full_name: string | null;
            email: string | null;
            plan?: 'free' | 'diy' | 'pro' | 'pro_plus';
            created_at?: string | null;
            shop_id?: string | null;
            business_name: string | null;
            phone: string | null;
            role: 'owner' | 'admin' | 'manager' | 'mechanic' | 'advisor' | 'parts' | null ;
            shop_name: string | null;
          };
          Update: {
            id?: string;
            full_name?: string | null;
            email: string | null;
            plan?: 'free' | 'diy' | 'pro' | 'pro_plus';
            created_at?: string | null;
            shop_id?: string | null;
            business_name?: string | null;
            phone?: string | null;
            role?: 'owner' | 'admin' | 'manager' | 'mechanic' | 'advisor' | 'parts' | null;
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
    status: 'not_started' | 'punched_in' | 'on_break' | 'on_lunch' | 'punched_out' | 'ended' | 'active';
    created_at: string;
  };
  Insert: {
    id?: string;
    tech_id: string;
    start_time: string;
    ended_time?: string | null;
    break_start?: string | null;
    lunch_start?: string | null;
    status:  'not_started' | 'punched_in' | 'on_break' | 'on_lunch' | 'punched_out' | 'ended' | 'active';
    created_at?: string;
  };
  Update: {
    start_time?: string | null;
    end_time?: string | null;
    break_start?: string | null;
    break_end?: string | null;
    lunch_start?: string | null;
    lunch_end?: string | null;
    status?:  'not_started' | 'punched_in' | 'on_break' | 'on_lunch' | 'punched_out' | 'ended' | 'active';
  };
  Relationships: [
    {
      foreignKeyName: 'tech_shifts_tech_id_fkey';
      columns: ['tech_id'];
      referencedRelation: 'profiles';
      referencedColumns: ['id'];
    }
  ];
};

punch_events: {
  Row: {
    id: string;
    created_at: string;
    tech_id: string;
    shift_id: string;
    type: 'start' | 'break_start' | 'break_end' | 'lunch_start' | 'lunch_end' | 'end';
    timestamp: string;
    notes: string | null;
  };
  Insert: {
    id?: string;
    created_at?: string;
    tech_id: string;
    shift_id: string;
    type: 'start' | 'break_start' | 'break_end' | 'lunch_start' | 'lunch_end' | 'end';
    timestamp?: string;
    notes?: string | null;
  };
  Update: {
    id?: string;
    created_at?: string;
    tech_id?: string;
    shift_id?: string;
    type?: 'start' | 'break_start' | 'break_end' | 'lunch_start' | 'lunch_end' | 'end';
    timestamp?: string;
    notes?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: 'punch_events_shift_id_fkey';
      columns: ['shift_id'];
      referencedRelation: 'tech_shifts';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'punch_events_tech_id_fkey';
      columns: ['tech_id'];
      referencedRelation: 'profiles';
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
          [x: string]: any;
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
          role: 'owner' | 'admin' | 'manager' | 'mechanic' | 'advisor' | 'parts' | null;
    // Add any other fields you use
        };
          Insert: {
          id?: string;
          name: string;
          created_at?: string;
          role: 'owner' | 'admin' | 'manager' | 'mechanic' | 'advisor' | 'parts' | null;
        };
          Update: {
          id?: string;
          name?: string;
          created_at?: string;
          role: 'owner' | 'admin' | 'manager' | 'mechanic' | 'advisor' | 'parts' | null;
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

// ... your full Database interface above ...

export type QuoteLine = Database['public']['Tables']['quote_lines']['Row'];
export type QuoteLineWithPart = QuoteLine & {
  price: number | null;
  labor_hours: number | null;
  part?: {
    name: string;
    price: number;
  } | null;
};