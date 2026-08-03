import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { recordQuoteTraining } from "@/features/integrations/ai";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { maybeRefreshPricingSnapshotForLine } from "@/features/work-orders/server/maybeRefreshPricingSnapshotForLine";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;

type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate: number;
  summary: string;
  confidence: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
};

type Body = {
  workOrderLineId: string;
  suggestion: AISuggestion;
};

function isBody(x: unknown): x is Body {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;

  const suggestion = o.suggestion;
  const parts =
    typeof suggestion === "object" &&
    suggestion !== null &&
    Array.isArray((suggestion as Record<string, unknown>).parts);

  return typeof o.workOrderLineId === "string" && parts;
}

function safeQty(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  return v > 0 ? v : 1;
}

function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) return null;
  return { url, key };
}

async function resolveLineScope(
  sb: SupabaseClient<DB>,
  workOrderLineId: string,
  shopId: string,
): Promise<{
  workOrderId: string;
  beforeLine: {
    id: string;
    price_estimate: number | null;
    labor_time: number | null;
    status: string | null;
    approval_state: string | null;
  } | null;
} | null> {
  const { data: line, error: lineErr } = await sb
    .from("work_order_lines")
    .select("id, work_order_id, price_estimate, labor_time, status, approval_state, work_orders!inner(id, shop_id)")
    .eq("id", workOrderLineId)
    .eq("work_orders.shop_id", shopId)
    .maybeSingle();

  if (lineErr) return null;
  if (!line?.id || !line.work_order_id) return null;

  const beforeLine = {
    id: String(line.id),
    price_estimate: typeof line.price_estimate === "number" ? line.price_estimate : null,
    labor_time: typeof line.labor_time === "number" ? line.labor_time : null,
    status: typeof line.status === "string" ? line.status : null,
    approval_state: typeof line.approval_state === "string" ? line.approval_state : null,
  };

  return { workOrderId: line.work_order_id, beforeLine };
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
    if (!access.ok) return access.response;

    const shopId = access.profile.shop_id;
    if (!shopId) {
      return NextResponse.json({ error: "Shop not found" }, { status: 403 });
    }

    const body: unknown = await req.json();
    if (!isBody(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { workOrderLineId, suggestion } = body;

    const env = getSupabaseEnv();
    if (!env) {
      return NextResponse.json(
        {
          error: "Server misconfiguration — Supabase env missing",
          detail:
            "Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).",
        },
        { status: 500 },
      );
    }

    // Service role is retained for compatibility/privileged cross-table writes after shop-scoped validation.
    const sb = createClient<DB>(env.url, env.key);

    const resolved = await resolveLineScope(sb, workOrderLineId, shopId);
    if (!resolved) {
      return NextResponse.json({ error: "Work order line not found" }, { status: 404 });
    }

    // Quote suggestions are estimates, not inventory reservations. Preserve the
    // suggestions for explicit manual matching instead of creating unlinked
    // work_order_part_allocations that could later be mistaken for issued stock.
    const unmatched: { name: string; qty: number }[] = [];
    const partsList = Array.isArray(suggestion.parts) ? suggestion.parts : [];
    for (const p of partsList) {
      const name = typeof p?.name === "string" ? p.name.trim() : "";
      const qty = safeQty(p?.qty);
      unmatched.push({ name: name || "(missing name)", qty });
    }

    const { data: afterLine, error: updateErr } = await sb
      .from("work_order_lines")
      .update({ approval_state: "pending" })
      .eq("id", workOrderLineId)
      .eq("work_order_id", resolved.workOrderId)
      .select("id, price_estimate, labor_time, status, approval_state")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed updating approval state", detail: updateErr.message },
        { status: 500 },
      );
    }

    const { data: verifiedWorkOrder } = await sb
      .from("work_orders")
      .select("id")
      .eq("id", resolved.workOrderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (!verifiedWorkOrder?.id) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    try {
      const { data: line } = await sb
        .from("work_order_lines")
        .select("id, work_order_id, description, complaint, work_orders!inner(id, shop_id)")
        .eq("id", workOrderLineId)
        .eq("work_order_id", resolved.workOrderId)
        .eq("work_orders.shop_id", shopId)
        .maybeSingle();

      if (line?.id) {
        await recordQuoteTraining({
          quoteId: workOrderLineId,
          shopId,
          workOrderId: line.work_order_id ?? null,
          workOrderLineId,
          vehicleYmm: null,
          payload: {
            complaint: line.complaint ?? null,
            description: line.description ?? null,
            suggestion,
            unmatched,
          },
        });
      }
    } catch (trainErr: unknown) {
      console.warn("AI training for apply-ai quote failed:", trainErr);
    }

    await maybeRefreshPricingSnapshotForLine({
      supabase: sb,
      userId: "system_apply_ai",
      before: resolved.beforeLine ?? null,
      after: afterLine
        ? {
            id: String(afterLine.id),
            price_estimate: typeof afterLine.price_estimate === "number" ? afterLine.price_estimate : null,
            labor_time: typeof afterLine.labor_time === "number" ? afterLine.labor_time : null,
            status: typeof afterLine.status === "string" ? afterLine.status : null,
            approval_state: typeof afterLine.approval_state === "string" ? afterLine.approval_state : null,
          }
        : null,
      quoteSource: "quote_apply_ai",
      quoteReference: workOrderLineId,
    });

    await logOperationalEvent({
      supabase: sb,
      event: "work_order_quote_ai_suggestions_recorded",
      actorId: "system_apply_ai",
      entityType: "work_order_line",
      entityId: workOrderLineId,
      details: {
        shop_id: shopId,
        suggested_parts_count: partsList.length,
        unmatched_parts_count: unmatched.length,
      },
    });

    // TODO: move this endpoint behind AI action executor/idempotent action model.
    return NextResponse.json({ ok: true, unmatched });
  } catch (e: unknown) {
    console.error("apply-ai Quote Error 👉", e);
    return NextResponse.json({ error: "Failed applying AI quote" }, { status: 500 });
  }
}
