import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  createCanonicalQuoteLines,
  safeTrim,
  type CanonicalQuoteItem,
} from "@/features/work-orders/lib/work-orders/canonicalQuoteLines";


type Body = {
  workOrderId: string;
  vehicleId?: string | null;
  items: CanonicalQuoteItem[];
};

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = safeTrim(body?.workOrderId);
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!workOrderId || items.length === 0) {
      return NextResponse.json(
        { error: "Missing workOrderId or items" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json(
        { error: `Failed to load work order: ${woErr.message}` },
        { status: 500 },
      );
    }

    if (!wo?.shop_id) {
      return NextResponse.json(
        { error: "Work order has no shop_id; cannot create quote lines." },
        { status: 400 },
      );
    }

    const result = await createCanonicalQuoteLines({
      supabase,
      shopId: wo.shop_id,
      workOrderId,
      vehicleId: safeTrim(body?.vehicleId) || wo.vehicle_id || null,
      suggestedBy: user.id,
      items,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ids: result.ids,
      items: result.items,
      createdCount: result.createdCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
      createdPartRequestIds: result.createdPartRequestIds,
      partRequestIds: result.partRequestIds,
      createdPartRequestItemCount: result.createdPartRequestItemCount,
      skippedPartRequestItemCount: result.skippedPartRequestItemCount,
      followUps: [
        "Add a database unique constraint for inspection finding identity when production data can be backfilled safely.",
        "Phase 5D-2 should relink quote-originated part_request_items to approved/materialized work_order_lines and invoice materialization.",
      ],
    });
  } catch (err) {
    console.error("[quotes/add] error:", err);
    return NextResponse.json(
      { error: "Failed to add quote items" },
      { status: 500 },
    );
  }
}
