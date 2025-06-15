export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type WorkOrderStatus =
  | "unassigned"
  | "in_progress"
  | "on_hold"
  | "completed";

export interface Database {
  public: {
    Tables: {
      work_order_lines: {
        Row: {
          id: number;
          complaint: string;
          cause: string | null;
          correction: string | null;
          tools: string[] | null;
          labor_time: number | null;
          priority: "diagnose" | "repair" | "maintenance";
          assigned_to: string | null;
          status: WorkOrderStatus;
          hold_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["work_order_lines"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["work_order_lines"]["Row"]
        >;
        Relationships: [];
      };
    };
    Enums: {
      WorkOrderStatus: WorkOrderStatus;
    };
  };
}
