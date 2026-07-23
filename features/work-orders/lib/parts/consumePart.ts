// features/work-orders/lib/parts/consumePart.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export type ConsumePartInput = {
  work_order_line_id: string;
  part_id: string;
  location_id: string;
  qty: number;
  unit_cost?: number | null;
  idempotency_key: string;
};

export type ConsumePartResult =
  | {
      ok: true;
      idempotent: boolean;
      work_order_part_id: string;
      stock_move_id: string;
      issued_qty: number;
      net_issued_qty: number;
      on_hand_after: number;
    }
  | {
      ok: false;
      error: string;
    };

type RpcResult = {
  idempotent?: unknown;
  issued_qty?: unknown;
  net_issued_qty?: unknown;
  on_hand_after?: unknown;
  stock_move_id?: unknown;
  work_order_part_id?: unknown;
};

function asFiniteNumber(value: unknown): number {
  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }
  return "Failed to use part.";
}

export async function consumePart(
  input: ConsumePartInput,
): Promise<ConsumePartResult> {
  const supabase = createServerSupabaseRoute();

  try {
    if (!input.work_order_line_id || !input.part_id) {
      return { ok: false, error: "Pick a work-order line and part first." };
    }
    if (!input.location_id) {
      return { ok: false, error: "Pick an inventory location first." };
    }
    if (!Number.isFinite(input.qty) || input.qty <= 0) {
      return { ok: false, error: "Quantity must be greater than 0." };
    }
    if (!input.idempotency_key.trim()) {
      return { ok: false, error: "A stable operation key is required." };
    }
    if (
      input.unit_cost != null &&
      (!Number.isFinite(input.unit_cost) || input.unit_cost < 0)
    ) {
      return { ok: false, error: "Unit cost cannot be negative." };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { ok: false, error: "You must be signed in to use a part." };
    }

    const { data: workOrderLine, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, shop_id")
      .eq("id", input.work_order_line_id)
      .single();

    if (lineError || !workOrderLine) {
      return {
        ok: false,
        error: lineError?.message || "Work-order line was not found.",
      };
    }

    const workOrderId =
      typeof workOrderLine.work_order_id === "string"
        ? workOrderLine.work_order_id
        : "";
    const shopId =
      typeof workOrderLine.shop_id === "string" ? workOrderLine.shop_id : "";
    if (!workOrderId || !shopId) {
      return {
        ok: false,
        error: "Work-order line is missing its work order or shop.",
      };
    }

    const { data, error } = await supabase.rpc(
      "parts_attach_and_issue_line_part_atomic",
      {
        p_work_order_line_id: input.work_order_line_id,
        p_part_id: input.part_id,
        p_location_id: input.location_id,
        p_qty: input.qty,
        p_unit_cost: input.unit_cost ?? null,
        p_idempotency_key: `${shopId}:attach-issue:${input.idempotency_key.trim()}`,
      },
    );

    if (error) {
      console.error("Use Part RPC failed", {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
        workOrderLineId: input.work_order_line_id,
      });
      return { ok: false, error: error.message || "Failed to use part." };
    }

    const result =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as RpcResult)
        : null;
    if (
      !result ||
      typeof result.work_order_part_id !== "string" ||
      typeof result.stock_move_id !== "string"
    ) {
      console.error("Use Part RPC returned an invalid result", {
        data,
        workOrderLineId: input.work_order_line_id,
      });
      return {
        ok: false,
        error: "Part use completed without a valid inventory receipt.",
      };
    }

    revalidatePath(`/work-orders/${workOrderId}`);

    return {
      ok: true,
      idempotent: result.idempotent === true,
      work_order_part_id: result.work_order_part_id,
      stock_move_id: result.stock_move_id,
      issued_qty: asFiniteNumber(result.issued_qty),
      net_issued_qty: asFiniteNumber(result.net_issued_qty),
      on_hand_after: asFiniteNumber(result.on_hand_after),
    };
  } catch (error: unknown) {
    console.error("Use Part server action failed", {
      error,
      workOrderLineId: input.work_order_line_id,
    });
    return { ok: false, error: errorMessage(error) };
  }
}
