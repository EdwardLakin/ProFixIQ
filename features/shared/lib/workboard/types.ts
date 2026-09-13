import type { WorkOrderOperationalStage } from "@/features/work-orders/lib/operational-stage";

export type WorkOrderBoardStage = WorkOrderOperationalStage;

export type WorkOrderBoardRisk = "none" | "warn" | "danger";

export type WorkOrderBoardRow = {
  work_order_id: string;
  custom_id: string | null;
  shop_id?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
  fleet_id?: string | null;
  fleet_name?: string | null;

  display_name: string | null;
  unit_label: string | null;
  vehicle_label: string | null;
  /** Storage path of the newest photo for this work order's vehicle. */
  vehicle_photo_path?: string | null;
  /**
   * Short-lived signed URL for `vehicle_photo_path`. The bucket is private, so
   * the board mints these client-side after loading rows; it is never stored.
   */
  vehicle_photo_url?: string | null;

  jobs_total: number;
  jobs_completed: number;
  progress_pct: number;

  parts_blocker_count?: number;
  has_waiting_parts?: boolean;

  assigned_tech_count?: number;
  assigned_summary?: string | null;

  overall_stage?: WorkOrderBoardStage;
  risk_level?: WorkOrderBoardRisk;
  risk_reason?: string | null;
  time_in_stage_seconds?: number | null;
  activity_at?: string | null;

  portal_stage_label?: string | null;
  portal_status_note?: string | null;
  fleet_stage_label?: string | null;

  // ✅ new board display fields
  priority?: number | null;
  is_waiter?: boolean | null;
  advisor_id?: string | null;
  advisor_name?: string | null;
  first_tech_name?: string | null;
  tech_names?: string[] | null;

  jobs_open?: number;
  jobs_blocked?: number;
  jobs_waiting_parts?: number;
};

export type WorkOrderBoardVariant = "shop" | "fleet" | "portal";
