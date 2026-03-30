import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ImportRow = {
  rawPartNumber?: string | null;
  rawDescription?: string | null;
  rawQty?: number | null;
  rawUnitCost?: number | null;
  rawSell?: number | null;
  rawNotes?: string | null;
};

type Body = {
  batchId?: string | null;
  rows?: ImportRow[] | null;
};

function safeTrim(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

    const batchId = safeTrim(body?.batchId);
    const rows = Array.isArray(body?.rows) ? body!.rows : [];

    if (!batchId) {
      return NextResponse.json({ ok: false, error: "batchId is required" }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "rows is required" }, { status: 400 });
    }

    const { data: batch, error: batchErr } = await supabase
      .from("supplier_quote_batches")
      .select("id, shop_id")
      .eq("id", batchId)
      .maybeSingle();

    if (batchErr) {
      return NextResponse.json({ ok: false, error: batchErr.message }, { status: 500 });
    }

    if (!batch?.id) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }

    const insertRows = rows
      .map((row) => {
        const rawDescription = safeTrim(row.rawDescription);
        const rawPartNumber = safeTrim(row.rawPartNumber);

        if (!rawDescription && !rawPartNumber) return null;

        const insertRow: DB["public"]["Tables"]["supplier_quote_batch_rows"]["Insert"] = {
          batch_id: batchId,
          raw_part_number: rawPartNumber,
          raw_description: rawDescription,
          raw_qty: finiteOrNull(row.rawQty),
          raw_unit_cost: finiteOrNull(row.rawUnitCost),
          raw_sell: finiteOrNull(row.rawSell),
          raw_notes: safeTrim(row.rawNotes),
          review_status: "unmatched",
        };

        return insertRow;
      })
      .filter(
        (
          row,
        ): row is DB["public"]["Tables"]["supplier_quote_batch_rows"]["Insert"] =>
          Boolean(row),
      );

    if (insertRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows to import" },
        { status: 400 },
      );
    }

    const { error: insertErr } = await supabase
      .from("supplier_quote_batch_rows")
      .insert(insertRows);

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    const { error: batchUpdateErr } = await supabase
      .from("supplier_quote_batches")
      .update({ status: "parsed" })
      .eq("id", batchId);

    if (batchUpdateErr) {
      return NextResponse.json({ ok: false, error: batchUpdateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      batchId,
      inserted: insertRows.length,
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
