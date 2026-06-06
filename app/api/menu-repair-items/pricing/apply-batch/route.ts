import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  batchId?: string | null;
  pricingValidDays?: number | null;
  makeActive?: boolean | null;
};

function safeTrim(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function validDaysOrDefault(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 30;
  return n > 0 ? n : 30;
}

function addDaysIso(startIso: string, days: number): string {
  const base = new Date(startIso);
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

type BatchRow = {
  id: string;
  raw_part_number: string | null;
  raw_description: string | null;
  raw_qty: number | null;
  raw_unit_cost: number | null;
  raw_sell: number | null;
  raw_notes: string | null;
  mapped_menu_repair_item_id: string | null;
  mapped_menu_repair_item_part_id: string | null;
  mapped_confidence: number | null;
  review_status: string;
};

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const body = (await req.json().catch(() => null)) as Body | null;

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const batchId = safeTrim(body?.batchId);
    if (!batchId) {
      return NextResponse.json({ ok: false, error: "batchId is required" }, { status: 400 });
    }

    const { data: batch, error: batchErr } = await supabase
      .from("supplier_quote_batches")
      .select("id, shop_id, supplier_id, supplier_name")
      .eq("id", batchId)
      .maybeSingle();

    if (batchErr) {
      return NextResponse.json({ ok: false, error: batchErr.message }, { status: 500 });
    }

    if (!batch?.id || !batch.shop_id) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }

    const { data: rows, error: rowErr } = await supabase
      .from("supplier_quote_batch_rows")
      .select(
        "id, raw_part_number, raw_description, raw_qty, raw_unit_cost, raw_sell, raw_notes, mapped_menu_repair_item_id, mapped_menu_repair_item_part_id, mapped_confidence, review_status",
      )
      .eq("batch_id", batchId)
      .in("review_status", ["matched", "needs_review"]);

    if (rowErr) {
      return NextResponse.json({ ok: false, error: rowErr.message }, { status: 500 });
    }

    const grouped = new Map<string, BatchRow[]>();
    for (const row of (rows ?? []) as BatchRow[]) {
      const repairId = row.mapped_menu_repair_item_id;
      if (!repairId) continue;
      const arr = grouped.get(repairId) ?? [];
      arr.push(row);
      grouped.set(repairId, arr);
    }

    const pricingValidDays = validDaysOrDefault(body?.pricingValidDays);
    const quotedAt = new Date().toISOString();
    const validUntil = addDaysIso(quotedAt, pricingValidDays);

    const createdSnapshots: Array<{
      menuRepairItemId: string;
      snapshotId: string;
      partsInserted: number;
    }> = [];

    for (const [menuRepairItemId, repairRows] of grouped.entries()) {
      const totalCost = repairRows.reduce(
        (sum, row) => sum + ((finiteOrNull(row.raw_unit_cost) ?? 0) * (finiteOrNull(row.raw_qty) ?? 1)),
        0,
      );

      const totalSell = repairRows.reduce(
        (sum, row) => sum + ((finiteOrNull(row.raw_sell) ?? 0) * (finiteOrNull(row.raw_qty) ?? 1)),
        0,
      );

      const { data: snapshot, error: snapshotErr } = await supabase
        .from("menu_repair_item_pricing_snapshots")
        .insert({
          menu_repair_item_id: menuRepairItemId,
          shop_id: batch.shop_id,
          supplier_id: batch.supplier_id ?? null,
          supplier_name: batch.supplier_name ?? null,
          quote_source: "csv_upload",
          quote_reference: batchId,
          quoted_at: quotedAt,
          valid_until: validUntil,
          pricing_valid_days: pricingValidDays,
          total_cost: totalCost > 0 ? totalCost : null,
          total_sell: totalSell > 0 ? totalSell : null,
          currency: "CAD",
          import_batch_id: batchId,
          uploaded_by: user.id,
        })
        .select("id")
        .single();

      if (snapshotErr || !snapshot?.id) {
        return NextResponse.json(
          { ok: false, error: snapshotErr?.message ?? "Failed to create snapshot" },
          { status: 500 },
        );
      }

      const partRows = repairRows.map(
        (row): DB["public"]["Tables"]["menu_repair_item_pricing_parts"]["Insert"] => ({
          pricing_snapshot_id: snapshot.id,
          menu_repair_item_part_id: row.mapped_menu_repair_item_part_id ?? null,
          part_name:
            safeTrim(row.raw_description) ??
            safeTrim(row.raw_part_number) ??
            "Quoted part",
          quoted_part_number: safeTrim(row.raw_part_number),
          supplier_part_number: safeTrim(row.raw_part_number),
          qty: finiteOrNull(row.raw_qty) ?? 1,
          unit_cost: finiteOrNull(row.raw_unit_cost),
          unit_sell: finiteOrNull(row.raw_sell),
          notes: safeTrim(row.raw_notes),
          match_confidence: finiteOrNull(row.mapped_confidence),
        }),
      );

      if (partRows.length > 0) {
        const { error: partsErr } = await supabase
          .from("menu_repair_item_pricing_parts")
          .insert(partRows);

        if (partsErr) {
          return NextResponse.json({ ok: false, error: partsErr.message }, { status: 500 });
        }
      }

      if (body?.makeActive !== false) {
        const { error: activeErr } = await supabase
          .from("menu_repair_items")
          .update({ active_pricing_snapshot_id: snapshot.id })
          .eq("id", menuRepairItemId);

        if (activeErr) {
          return NextResponse.json({ ok: false, error: activeErr.message }, { status: 500 });
        }
      }

      createdSnapshots.push({
        menuRepairItemId,
        snapshotId: snapshot.id,
        partsInserted: partRows.length,
      });
    }

    const { error: batchUpdateErr } = await supabase
      .from("supplier_quote_batches")
      .update({
        status: "applied",
        processed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (batchUpdateErr) {
      return NextResponse.json({ ok: false, error: batchUpdateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      batchId,
      appliedCount: createdSnapshots.length,
      snapshots: createdSnapshots,
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
