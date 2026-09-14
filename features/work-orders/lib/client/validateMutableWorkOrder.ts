import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  getCreateResumeBlocker,
  type CreateResumeLine,
  type CreateResumeWorkOrder,
} from "@/features/work-orders/lib/resumableCreateWorkOrder";

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

export function signalStaleCreateWorkOrder(
  workOrderId: string,
  message = STALE_CREATE_WORK_ORDER_MESSAGE,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CREATE_WORK_ORDER_STALE_EVENT, {
      detail: { workOrderId, message },
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
    (text.includes("foreign key") && text.includes("work order")) ||
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

type ResumableWorkOrder =
  DB["public"]["Tables"]["work_orders"]["Row"] & CreateResumeWorkOrder;
type ResumableLine =
  DB["public"]["Tables"]["work_order_lines"]["Row"] & CreateResumeLine;

export async function requireResumableCreateWorkOrder(input: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId?: string | null;
}): Promise<{ workOrder: ResumableWorkOrder; lines: ResumableLine[] }> {
  let workOrderQuery = input.supabase
    .from("work_orders")
    .select("*")
    .eq("id", input.workOrderId);
  if (input.shopId) {
    workOrderQuery = workOrderQuery.eq("shop_id", input.shopId);
  }

  const { data: workOrder, error: workOrderError } =
    await workOrderQuery.maybeSingle<ResumableWorkOrder>();
  if (workOrderError) throw workOrderError;
  if (!workOrder) {
    signalStaleCreateWorkOrder(input.workOrderId);
    throw new StaleCreateWorkOrderError(input.workOrderId);
  }

  if (!workOrder.shop_id) {
    throw new Error("Work order is missing shop context.");
  }

  const { data: lineRows, error: linesError } = await input.supabase
    .from("work_order_lines")
    .select("*")
    .eq("work_order_id", input.workOrderId)
    .eq("shop_id", workOrder.shop_id)
    .is("voided_at", null);
  if (linesError) throw linesError;
  const lines = (lineRows ?? []) as ResumableLine[];
  const lineIds = lines.map((line) => line.id);

  let inspectionQuery = input.supabase
    .from("inspections")
    .select("id")
    .eq("shop_id", workOrder.shop_id)
    .limit(1);
  inspectionQuery =
    lineIds.length > 0
      ? inspectionQuery.or(
          `work_order_id.eq.${input.workOrderId},work_order_line_id.in.(${lineIds.join(",")})`,
        )
      : inspectionQuery.eq("work_order_id", input.workOrderId);
  const { data: inspections, error: inspectionError } = await inspectionQuery;
  if (inspectionError) throw inspectionError;

  const { data: assignments, error: assignmentError } =
    lineIds.length > 0
      ? await input.supabase
          .from("work_order_line_technicians")
          .select("work_order_line_id")
          .in("work_order_line_id", lineIds)
          .limit(1)
      : { data: [], error: null };
  if (assignmentError) throw assignmentError;

  const blocker = getCreateResumeBlocker({
    workOrder,
    lines,
    hasBridgeAssignment: Boolean(assignments?.length),
    hasInspection: Boolean(inspections?.length),
  });
  if (blocker) {
    const message = `This work order can’t be continued here: ${blocker}`;
    signalStaleCreateWorkOrder(input.workOrderId, message);
    throw new StaleCreateWorkOrderError(input.workOrderId, message);
  }

  return { workOrder, lines };
}
