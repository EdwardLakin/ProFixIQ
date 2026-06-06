import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";


function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const url = new URL(req.url);
    const batchId = safeTrim(url.searchParams.get("batchId"));

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!batchId) {
      return NextResponse.json({ ok: false, error: "batchId is required" }, { status: 400 });
    }

    const { data: batch, error: batchErr } = await supabase
      .from("supplier_quote_batches")
      .select("id, shop_id, supplier_name, status, created_at")
      .eq("id", batchId)
      .maybeSingle();

    if (batchErr) {
      return NextResponse.json({ ok: false, error: batchErr.message }, { status: 500 });
    }

    if (!batch?.id || !batch.shop_id) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }

    const { data: rows, error: rowsErr } = await supabase
      .from("supplier_quote_batch_rows")
      .select(
        "id, raw_part_number, raw_description, raw_qty, raw_unit_cost, raw_sell, raw_notes, mapped_menu_repair_item_id, mapped_menu_repair_item_part_id, mapped_confidence, review_status",
      )
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });

    if (rowsErr) {
      return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    }

    const { data: repairItems, error: repairErr } = await supabase
      .from("menu_repair_items")
      .select("id, name, complaint, vehicle_year, vehicle_make, vehicle_model")
      .eq("shop_id", batch.shop_id)
      .order("name", { ascending: true });

    if (repairErr) {
      return NextResponse.json({ ok: false, error: repairErr.message }, { status: 500 });
    }

    const repairIds = (repairItems ?? []).map((x) => x.id);
    const { data: parts, error: partsErr } = repairIds.length
      ? await supabase
          .from("menu_repair_item_parts")
          .select("id, menu_repair_item_id, part_name, part_number, supplier_part_number")
          .in("menu_repair_item_id", repairIds)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };

    if (partsErr) {
      return NextResponse.json({ ok: false, error: partsErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      batch,
      rows: rows ?? [],
      repairItems: repairItems ?? [],
      repairParts: parts ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
