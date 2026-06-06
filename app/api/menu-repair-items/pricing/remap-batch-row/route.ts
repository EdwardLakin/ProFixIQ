import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";


type Body = {
  rowId?: string | null;
  mappedMenuRepairItemId?: string | null;
  mappedMenuRepairItemPartId?: string | null;
  reviewStatus?: "matched" | "needs_review" | "unmatched" | null;
};

function safeTrim(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

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

    const rowId = safeTrim(body?.rowId);
    if (!rowId) {
      return NextResponse.json({ ok: false, error: "rowId is required" }, { status: 400 });
    }

    const reviewStatus =
      body?.reviewStatus === "matched" ||
      body?.reviewStatus === "needs_review" ||
      body?.reviewStatus === "unmatched"
        ? body.reviewStatus
        : "matched";

    const mappedMenuRepairItemId = safeTrim(body?.mappedMenuRepairItemId);
    const mappedMenuRepairItemPartId = safeTrim(body?.mappedMenuRepairItemPartId);

    const { error } = await supabase
      .from("supplier_quote_batch_rows")
      .update({
        mapped_menu_repair_item_id: mappedMenuRepairItemId,
        mapped_menu_repair_item_part_id: mappedMenuRepairItemPartId,
        mapped_confidence: reviewStatus === "matched" ? 1 : 0.5,
        review_status: mappedMenuRepairItemId ? reviewStatus : "unmatched",
      })
      .eq("id", rowId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rowId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
