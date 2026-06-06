import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { buildWorkOrderCompletedEvent } from "@/features/integrations/shopreel/server/buildProFixIQStoryEvents";
import { postStoryEventToShopReel } from "@/features/integrations/shopreel/server/postStoryEventToShopReel";
import { syncWorkOrderToHistory } from "@/features/work-orders/server/syncWorkOrderToHistory";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import { normalizeWorkOrderStatus } from "@/features/work-orders/lib/work-order-status";


function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/"); // ["", "api", "work-orders", "<id>", "mark-ready"]
  return parts.length >= 5 ? parts[3] : null;
}

function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();
  const woId = getIdFromUrl(req.url);
  if (!woId) {
    return NextResponse.json({ ok: false, error: "Missing work order id" }, { status: 400 });
  }

  try {
    // verify all lines completed first
    const { data: lines, error: lnErr } = await supabase
      .from("work_order_lines")
      .select("id,status")
      .eq("work_order_id", woId);
    if (lnErr) throw lnErr;

    const notDone = (lines ?? []).some((l) => {
      const normalized = normalizeWorkOrderLineStatus(l.status ?? "pending");
      return !["completed", "declined", "deferred"].includes(normalized);
    });
    if (notDone) {
      return NextResponse.json({ ok: false, error: "All lines must be completed first." }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from("work_orders")
      .update({ status: normalizeWorkOrderStatus("ready_to_invoice") })
      .eq("id", woId);
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

    return NextResponse.json({ ok: true, historySync });
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "Failed to mark ready";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
