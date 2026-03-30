import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createPricingSnapshotFromWorkOrderLine } from "@/features/menu-repair-items/server/createPricingSnapshotFromWorkOrderLine";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  workOrderLineId?: string;
  menuRepairItemId?: string;
  pricingValidDays?: number | null;
  quoteSource?: string | null;
  quoteReference?: string | null;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

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
    const menuRepairItemId = safeTrim(body?.menuRepairItemId);

    if (!workOrderLineId || !menuRepairItemId) {
      return NextResponse.json(
        {
          ok: false,
          error: "workOrderLineId and menuRepairItemId are required",
        },
        { status: 400 },
      );
    }

    const pricingValidDays =
      typeof body?.pricingValidDays === "number" &&
      Number.isFinite(body.pricingValidDays)
        ? body.pricingValidDays
        : 30;

    const result = await createPricingSnapshotFromWorkOrderLine({
      supabase,
      workOrderLineId,
      menuRepairItemId,
      pricingValidDays,
      uploadedBy: user.id,
      quoteSource: safeTrim(body?.quoteSource) || "work_order_capture",
      quoteReference: safeTrim(body?.quoteReference) || null,
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
