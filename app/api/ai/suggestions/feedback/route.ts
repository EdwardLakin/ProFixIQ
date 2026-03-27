import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;

type FeedbackBody = {
  workOrderId?: string;
  workOrderLineId?: string | null;
  suggestionId?: string | null;
  title?: string;
  laborHours?: number | null;
  parts?: Array<{ name?: string; qty?: number | null }> | null;
  accepted?: boolean;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeParts(value: unknown): Json {
  if (!Array.isArray(value)) return [];
  return value
    .map((part) => {
      const row = (part ?? {}) as {
        name?: unknown;
        description?: unknown;
        item?: unknown;
        qty?: unknown;
        quantity?: unknown;
      };

      const name =
        asNonEmptyString(row.name) ??
        asNonEmptyString(row.description) ??
        asNonEmptyString(row.item);

      const qty =
        asNullableNumber(row.qty) ??
        asNullableNumber(row.quantity) ??
        1;

      if (!name) return null;

      return {
        name,
        qty: qty && qty > 0 ? qty : 1,
      };
    })
    .filter(Boolean) as Json;
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as FeedbackBody | null;

    const workOrderId = asNonEmptyString(body?.workOrderId);
    const workOrderLineId = asNonEmptyString(body?.workOrderLineId ?? null);
    const suggestionId = asNonEmptyString(body?.suggestionId ?? null);
    const title = asNonEmptyString(body?.title);
    const laborHours = asNullableNumber(body?.laborHours ?? null);
    const accepted = body?.accepted === true;

    if (!workOrderId) {
      return NextResponse.json(
        { error: "Missing workOrderId" },
        { status: 400 },
      );
    }

    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (workOrderError) {
      return NextResponse.json(
        { error: workOrderError.message },
        { status: 500 },
      );
    }

    if (!workOrder?.shop_id) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 },
      );
    }

    if (workOrderLineId) {
      const { data: line, error: lineError } = await supabase
        .from("work_order_lines")
        .select("id, work_order_id")
        .eq("id", workOrderLineId)
        .maybeSingle();

      if (lineError) {
        return NextResponse.json({ error: lineError.message }, { status: 500 });
      }

      if (!line || line.work_order_id !== workOrderId) {
        return NextResponse.json(
          { error: "Invalid workOrderLineId for work order" },
          { status: 400 },
        );
      }
    }

    const insertPayload: DB["public"]["Tables"]["ai_suggestion_feedback"]["Insert"] =
      {
        shop_id: workOrder.shop_id,
        work_order_id: workOrderId,
        work_order_line_id: workOrderLineId,
        suggestion_id: suggestionId,
        title,
        labor_hours: laborHours,
        parts: normalizeParts(body?.parts),
        accepted,
        created_by: user.id,
      };

    const { error: insertError } = await supabase
      .from("ai_suggestion_feedback")
      .insert(insertPayload);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
