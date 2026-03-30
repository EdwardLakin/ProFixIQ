import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function tokenize(v: string): string[] {
  return safeTrim(v)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

function overlapScore(a: string, b: string): number {
  const aa = new Set(tokenize(a));
  const bb = new Set(tokenize(b));

  if (aa.size === 0 || bb.size === 0) return 0;

  let overlap = 0;
  for (const token of aa) {
    if (bb.has(token)) overlap += 1;
  }

  return overlap / Math.max(aa.size, bb.size, 1);
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { batchId?: string | null } | null;
    const batchId = safeTrim(body?.batchId);

    if (!batchId) {
      return NextResponse.json({ ok: false, error: "batchId is required" }, { status: 400 });
    }

    const { data: batch, error: batchErr } = await supabase
      .from("supplier_quote_batches")
      .select("id, shop_id")
      .eq("id", batchId)
      .maybeSingle();

    if (batchErr) {
      return NextResponse.json({ ok: false, error: batchErr.message }, { status: 500 });
    }

    if (!batch?.id || !batch.shop_id) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }

    const { data: rawRows, error: rawErr } = await supabase
      .from("supplier_quote_batch_rows")
      .select(
        "id, raw_part_number, raw_description, raw_qty, raw_unit_cost, raw_sell, raw_notes, mapped_menu_repair_item_id, mapped_menu_repair_item_part_id, mapped_confidence, review_status",
      )
      .eq("batch_id", batchId);

    if (rawErr) {
      return NextResponse.json({ ok: false, error: rawErr.message }, { status: 500 });
    }

    const { data: repairItems, error: repairErr } = await supabase
      .from("menu_repair_items")
      .select("id, name, complaint")
      .eq("shop_id", batch.shop_id);

    if (repairErr) {
      return NextResponse.json({ ok: false, error: repairErr.message }, { status: 500 });
    }

    const { data: repairParts, error: partsErr } = await supabase
      .from("menu_repair_item_parts")
      .select("id, menu_repair_item_id, part_name, part_number, supplier_part_number")
      .eq("shop_id", batch.shop_id);

    if (partsErr) {
      return NextResponse.json({ ok: false, error: partsErr.message }, { status: 500 });
    }

    let matched = 0;
    let needsReview = 0;
    let unmatched = 0;

    for (const row of rawRows ?? []) {
      const rowText = [row.raw_part_number ?? "", row.raw_description ?? "", row.raw_notes ?? ""]
        .filter(Boolean)
        .join(" ")
        .trim();

      let bestRepair:
        | {
            id: string;
            score: number;
          }
        | null = null;

      for (const repair of repairItems ?? []) {
        const repairText = [repair.name ?? "", repair.complaint ?? ""].filter(Boolean).join(" ").trim();
        const score = overlapScore(rowText, repairText);
        if (!bestRepair || score > bestRepair.score) {
          bestRepair = { id: repair.id, score };
        }
      }

      let bestPart:
        | {
            id: string;
            menuRepairItemId: string;
            score: number;
          }
        | null = null;

      for (const part of repairParts ?? []) {
        const partText = [
          part.part_name ?? "",
          part.part_number ?? "",
          part.supplier_part_number ?? "",
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        const score = overlapScore(rowText, partText);

        if (!bestPart || score > bestPart.score) {
          bestPart = {
            id: part.id,
            menuRepairItemId: part.menu_repair_item_id,
            score,
          };
        }
      }

      let mappedMenuRepairItemId: string | null = null;
      let mappedMenuRepairItemPartId: string | null = null;
      let mappedConfidence = 0;

      if (bestPart && bestPart.score >= 0.45) {
        mappedMenuRepairItemId = bestPart.menuRepairItemId;
        mappedMenuRepairItemPartId = bestPart.id;
        mappedConfidence = bestPart.score;
      } else if (bestRepair && bestRepair.score >= 0.35) {
        mappedMenuRepairItemId = bestRepair.id;
        mappedConfidence = bestRepair.score;
      }

      const reviewStatus =
        mappedConfidence >= 0.75
          ? "matched"
          : mappedConfidence >= 0.35
            ? "needs_review"
            : "unmatched";

      const { error: updateErr } = await supabase
        .from("supplier_quote_batch_rows")
        .update({
          mapped_menu_repair_item_id: mappedMenuRepairItemId,
          mapped_menu_repair_item_part_id: mappedMenuRepairItemPartId,
          mapped_confidence: mappedConfidence,
          review_status: reviewStatus,
        })
        .eq("id", row.id);

      if (updateErr) {
        return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
      }

      if (reviewStatus === "matched") matched += 1;
      else if (reviewStatus === "needs_review") needsReview += 1;
      else unmatched += 1;
    }

    const nextBatchStatus = needsReview > 0 || unmatched > 0 ? "review_required" : "parsed";

    const { error: batchUpdateErr } = await supabase
      .from("supplier_quote_batches")
      .update({ status: nextBatchStatus })
      .eq("id", batchId);

    if (batchUpdateErr) {
      return NextResponse.json({ ok: false, error: batchUpdateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      batchId,
      matched,
      needsReview,
      unmatched,
      status: nextBatchStatus,
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
