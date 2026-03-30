import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  supplierId?: string | null;
  supplierName?: string | null;
  menuRepairItemIds?: string[] | null;
};

function safeTrim(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json().catch(() => null)) as Body | null;

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const ids = Array.isArray(body?.menuRepairItemIds)
      ? body!.menuRepairItemIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "menuRepairItemIds is required" }, { status: 400 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
    }

    const shopId = profile?.shop_id ?? null;
    if (!shopId) {
      return NextResponse.json({ ok: false, error: "Missing shop context" }, { status: 400 });
    }

    const { data: batch, error: batchErr } = await supabase
      .from("supplier_quote_batches")
      .insert({
        shop_id: shopId,
        supplier_id: safeTrim(body?.supplierId),
        supplier_name: safeTrim(body?.supplierName),
        source_type: "csv_upload",
        status: "uploaded",
        uploaded_by: user.id,
      })
      .select("id")
      .single();

    if (batchErr || !batch?.id) {
      return NextResponse.json(
        { ok: false, error: batchErr?.message ?? "Failed to create quote batch" },
        { status: 500 },
      );
    }

    const { data: repairItems, error: itemErr } = await supabase
      .from("menu_repair_items")
      .select(
        "id, name, complaint, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission",
      )
      .in("id", ids)
      .eq("shop_id", shopId);

    if (itemErr) {
      return NextResponse.json({ ok: false, error: itemErr.message }, { status: 500 });
    }

    const { data: parts, error: partsErr } = await supabase
      .from("menu_repair_item_parts")
      .select(
        "id, menu_repair_item_id, part_name, part_number, supplier_part_number, qty, fitment_notes, last_seen_supplier",
      )
      .in("menu_repair_item_id", ids)
      .eq("shop_id", shopId)
      .order("sort_order", { ascending: true });

    if (partsErr) {
      return NextResponse.json({ ok: false, error: partsErr.message }, { status: 500 });
    }

    const repairById = new Map((repairItems ?? []).map((item) => [item.id, item]));
    const batchRows: DB["public"]["Tables"]["supplier_quote_batch_rows"]["Insert"][] = [];

    for (const part of parts ?? []) {
      const repair = repairById.get(part.menu_repair_item_id);
      if (!repair) continue;

      const vehicleLabel = [
        repair.vehicle_year ?? "",
        repair.vehicle_make ?? "",
        repair.vehicle_model ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const rawDescription = [
        repair.name ?? repair.complaint ?? "Repair item",
        vehicleLabel ? `(${vehicleLabel})` : "",
        part.part_name,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      batchRows.push({
        batch_id: batch.id,
        raw_part_number: part.part_number ?? part.supplier_part_number ?? null,
        raw_description: rawDescription,
        raw_qty: part.qty ?? 1,
        raw_notes: part.fitment_notes ?? null,
        mapped_menu_repair_item_id: repair.id,
        mapped_menu_repair_item_part_id: part.id,
        mapped_confidence: 1,
        review_status: "matched",
      });
    }

    if (batchRows.length > 0) {
      const { error: rowErr } = await supabase
        .from("supplier_quote_batch_rows")
        .insert(batchRows);

      if (rowErr) {
        return NextResponse.json({ ok: false, error: rowErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      rowsInserted: batchRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}
