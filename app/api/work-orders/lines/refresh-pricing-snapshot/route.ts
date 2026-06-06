import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { findMenuRepairItemForWorkOrderLine } from "@/features/menu-repair-items/server/findMenuRepairItemForWorkOrderLine";
import { createPricingSnapshotFromWorkOrderLine } from "@/features/menu-repair-items/server/createPricingSnapshotFromWorkOrderLine";


type Body = {
  workOrderLineId?: string;
  pricingValidDays?: number | null;
  quoteReference?: string | null;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseRoute();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderLineId = safeTrim(body?.workOrderLineId);

    if (!workOrderLineId) {
      return NextResponse.json(
        { ok: false, error: "workOrderLineId is required" },
        { status: 400 },
      );
    }

    const menuRepairItemId = await findMenuRepairItemForWorkOrderLine({
      supabase,
      workOrderLineId,
    });

    if (!menuRepairItemId) {
      return NextResponse.json(
        { ok: false, error: "No linked menu repair item found for this work order line" },
        { status: 404 },
      );
    }

    const result = await createPricingSnapshotFromWorkOrderLine({
      supabase,
      workOrderLineId,
      menuRepairItemId,
      pricingValidDays:
        typeof body?.pricingValidDays === "number" &&
        Number.isFinite(body.pricingValidDays)
          ? body.pricingValidDays
          : 30,
      uploadedBy: user.id,
      quoteSource: "price_refresh",
      quoteReference: safeTrim(body?.quoteReference) || workOrderLineId,
    });

    return NextResponse.json(result);
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
