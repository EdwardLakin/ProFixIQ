import { NextResponse } from "next/server";
import type { Database, Json } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { recordAutomationEvidence } from "@/features/ai/server/automationEvidence";

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
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageWorkOrders",
    });
    if (!access.ok) return access.response;
    const { supabase } = access;
    const shopId = access.profile.shop_id;

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
      .eq("shop_id", shopId)
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
        .select("id, work_order_id, shop_id")
        .eq("id", workOrderLineId)
        .eq("shop_id", shopId)
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
        shop_id: shopId,
        work_order_id: workOrderId,
        work_order_line_id: workOrderLineId,
        suggestion_id: suggestionId,
        title,
        labor_hours: laborHours,
        parts: normalizeParts(body?.parts),
        accepted,
        created_by: access.profile.id,
      };

    const { data: feedback, error: insertError } = await supabase
      .from("ai_suggestion_feedback")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !feedback) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    let evidenceWarning: string | undefined;
    try {
      const outcome = accepted ? "matched" : "corrected";
      const metadata: Json = {
        accepted,
        suggestion_id: suggestionId,
        title,
        labor_hours: laborHours,
        work_order_id: workOrderId,
        work_order_line_id: workOrderLineId,
      };
      await Promise.all([
        recordAutomationEvidence({
          shopId,
          capability: "work_order_line_creation",
          evidenceKey: `suggestion_feedback:${feedback.id}`,
          outcome,
          source: "advisor_suggestion_feedback",
          sourceEntityType: "ai_suggestion_feedback",
          sourceEntityId: feedback.id,
          metadata,
          recordedBy: access.profile.id,
        }),
        recordAutomationEvidence({
          shopId,
          capability: "quote_preparation",
          evidenceKey: `suggestion_feedback:${feedback.id}`,
          outcome,
          source: "advisor_suggestion_feedback",
          sourceEntityType: "ai_suggestion_feedback",
          sourceEntityId: feedback.id,
          metadata,
          recordedBy: access.profile.id,
        }),
      ]);
    } catch (evidenceError) {
      console.warn("[ai/suggestions/feedback] readiness evidence failed:", evidenceError);
      evidenceWarning = "Feedback saved, but readiness evidence could not be updated";
    }

    return NextResponse.json({ ok: true, warning: evidenceWarning });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
