import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export const CREATE_WORK_ORDER_STALE_EVENT =
  "profixiq:create-work-order-stale";

export const STALE_CREATE_WORK_ORDER_MESSAGE =
  "This saved work order no longer exists. The stale draft was cleared; create a new work order before adding lines.";

export class StaleCreateWorkOrderError extends Error {
  constructor(
    readonly workOrderId: string,
    message = STALE_CREATE_WORK_ORDER_MESSAGE,
  ) {
    super(message);
    this.name = "StaleCreateWorkOrderError";
  }
}

export function signalStaleCreateWorkOrder(workOrderId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CREATE_WORK_ORDER_STALE_EVENT, {
      detail: { workOrderId },
    }),
  );
}

export function isMissingWorkOrderWriteError(error: unknown): boolean {
  const value = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
  } | null;
  const text = [value?.code, value?.message, value?.details]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    text.includes("work_order_lines_work_order_id_fkey") ||
    text.includes("foreign key") && text.includes("work_order") ||
    text.includes("work order no longer exists") ||
    text.includes("work order not found")
  );
}

export async function requireMutableWorkOrder(input: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId?: string | null;
}): Promise<{ id: string; shop_id: string | null }> {
  let query = input.supabase
    .from("work_orders")
    .select("id,shop_id")
    .eq("id", input.workOrderId);
  if (input.shopId) query = query.eq("shop_id", input.shopId);

  const { data, error } = await query.maybeSingle<{
    id: string;
    shop_id: string | null;
  }>();
  if (error) throw error;
  if (!data) {
    signalStaleCreateWorkOrder(input.workOrderId);
    throw new StaleCreateWorkOrderError(input.workOrderId);
  }
  return data;
}
