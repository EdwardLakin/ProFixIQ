import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { findMenuRepairItemForWorkOrderLine } from "@/features/menu-repair-items/server/findMenuRepairItemForWorkOrderLine";
import { createPricingSnapshotFromWorkOrderLine } from "@/features/menu-repair-items/server/createPricingSnapshotFromWorkOrderLine";

type DB = Database;

type WorkOrderLineLite = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  | "id"
  | "price_estimate"
  | "labor_time"
  | "status"
  | "approval_state"
>;

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function changedNumber(a: unknown, b: unknown): boolean {
  return numOrNull(a) !== numOrNull(b);
}

function changedString(a: unknown, b: unknown): boolean {
  const aa = typeof a === "string" ? a.trim() : "";
  const bb = typeof b === "string" ? b.trim() : "";
  return aa !== bb;
}

export async function maybeRefreshPricingSnapshotForLine(args: {
  supabase: SupabaseClient<DB>;
  userId: string;
  before: WorkOrderLineLite | null;
  after: WorkOrderLineLite | null;
  pricingValidDays?: number | null;
  quoteSource?: string | null;
  quoteReference?: string | null;
}) {
  const {
    supabase,
    userId,
    before,
    after,
    pricingValidDays = 30,
    quoteSource = "price_refresh",
    quoteReference = null,
  } = args;

  if (!after?.id) {
    return { ok: false as const, reason: "missing_after_line" };
  }

  const meaningfulChange =
    changedNumber(before?.price_estimate, after.price_estimate) ||
    changedNumber(before?.labor_time, after.labor_time) ||
    changedString(before?.status, after.status) ||
    changedString(before?.approval_state, after.approval_state);

  if (!meaningfulChange) {
    return { ok: true as const, skipped: true, reason: "no_meaningful_change" };
  }

  const menuRepairItemId = await findMenuRepairItemForWorkOrderLine({
    supabase,
    workOrderLineId: after.id,
  });

  if (!menuRepairItemId) {
    return { ok: true as const, skipped: true, reason: "no_linked_menu_repair_item" };
  }

  const result = await createPricingSnapshotFromWorkOrderLine({
    supabase,
    workOrderLineId: after.id,
    menuRepairItemId,
    pricingValidDays,
    uploadedBy: userId,
    quoteSource,
    quoteReference: quoteReference || after.id,
  });

  return { skipped: false as const, ...result };
}
