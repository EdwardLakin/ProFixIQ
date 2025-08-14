import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];

/**
 * UI-facing job shape used by the queue and cards.
 * - Keep all the Work Order Line fields, but redefine `assigned_to` and `vehicles`
 *   to the flexible UI forms we actually need.
 */
export type QueueJob = Omit<JobLine, "assigned_to" | "vehicles"> & {
  /**
   * In DB it's usually string | null (user id).
   * Sometimes a view/join may return an object; allow both for UI flexibility.
   */
  assigned_to: { id: string; full_name: string | null } | string | null;

  /**
   * Match the embedded shape your `work_order_lines.Row.vehicles` actually has:
   * year/make/model only, nullable fields, and the whole object can be null.
   * (Using Pick avoids bringing in unrelated Vehicle columns.)
   */
  vehicles: Pick<VehicleRow, "year" | "make" | "model"> | null;
};