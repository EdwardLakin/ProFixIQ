import { NextResponse } from "next/server";
import { buildWorkOrderCompletedEvent } from "@/features/integrations/shopreel/server/buildProFixIQStoryEvents";
import { postStoryEventToShopReel } from "@/features/integrations/shopreel/server/postStoryEventToShopReel";
import { syncWorkOrderToHistory } from "@/features/work-orders/server/syncWorkOrderToHistory";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import { normalizeWorkOrderStatus } from "@/features/work-orders/lib/work-order-status";
import { isReviewableQuoteLine } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { seedCompletedWorkOrderIntelligence } from "@/features/ai/server/workOrderIntelligence";

function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/"); // ["", "api", "work-orders", "<id>", "mark-ready"]
  return parts.length >= 5 ? parts[3] : null;
}

function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const { supabase } = access;
  const shopId = access.profile.shop_id;
  const woId = getIdFromUrl(req.url);
  if (!woId) {
    return NextResponse.json({ ok: false, error: "Missing work order id" }, { status: 400 });
  }

  try {
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id")
      .eq("id", woId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (workOrderError) throw workOrderError;
    if (!workOrder) {
      return NextResponse.json(
        { ok: false, error: "Work order not found" },
        { status: 404 },
      );
    }

    // verify all lines completed first
    const { data: lines, error: lnErr } = await supabase
      .from("work_order_lines")
      .select("id,status")
      .eq("work_order_id", woId)
      .eq("shop_id", shopId);
    if (lnErr) throw lnErr;

    const notDone = (lines ?? []).some((l) => {
      const normalized = normalizeWorkOrderLineStatus(l.status ?? "pending");
      return !["completed", "declined", "deferred"].includes(normalized);
    });
    if (notDone) {
      return NextResponse.json({ ok: false, error: "All lines must be completed first." }, { status: 400 });
    }

    const { data: quoteLines, error: quoteErr } = await supabase
      .from("work_order_quote_lines")
      .select("status,stage,approved_at,declined_at,work_order_line_id")
      .eq("work_order_id", woId)
      .eq("shop_id", shopId);
    if (quoteErr) throw quoteErr;

    if ((quoteLines ?? []).some((line) => isReviewableQuoteLine(line))) {
      return NextResponse.json({ ok: false, error: "Active pending quote lines must be resolved before invoicing." }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from("work_orders")
      .update({ status: normalizeWorkOrderStatus("ready_to_invoice") })
      .eq("id", woId)
      .eq("shop_id", shopId);
    if (updErr) throw updErr;

    const event = await buildWorkOrderCompletedEvent(woId);

    if (event) {
      await postStoryEventToShopReel(event).catch((error: unknown) => {
        console.error("[shopreel] failed to sync completed work order", error);
      });
    }

    let historySync: { ok: true; historyId: string | null; skippedReason?: string } | null = null;

    try {
      historySync = await syncWorkOrderToHistory(supabase, woId);
    } catch (historyError) {
      console.warn("[work-orders/mark-ready] history sync failed:", historyError);
    }

    try {
      await seedCompletedWorkOrderIntelligence({
        supabase,
        shopId,
        workOrderId: woId,
        source: "ready_to_invoice",
      });
    } catch (intelligenceError) {
      console.warn(
        "[work-orders/mark-ready] completed-repair learning failed:",
        intelligenceError,
      );
    }

    return NextResponse.json({ ok: true, historySync });
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "Failed to mark ready";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
