import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { addMaintenanceSuggestionToWorkOrder } from "@/features/maintenance/server/addMaintenanceSuggestionToWorkOrder";

type DB = Database;

type RequestBody = {
  workOrderId?: string;
  serviceCodes?: string[];
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;

  const workOrderId = body?.workOrderId?.trim();
  const serviceCodes = Array.isArray(body?.serviceCodes)
    ? body!.serviceCodes.map((code) => code.trim()).filter(Boolean)
    : [];

  if (!workOrderId || serviceCodes.length === 0) {
    return NextResponse.json(
      { error: "workOrderId and serviceCodes are required" },
      { status: 400 },
    );
  }

  const added: Array<{
    serviceCode: string;
    addedLineId: string;
    addPath: "menu_item" | "generic";
  }> = [];

  const skipped: Array<{
    serviceCode: string;
    error: string;
  }> = [];

  for (const serviceCode of serviceCodes) {
    try {
      const result = await addMaintenanceSuggestionToWorkOrder({
        supabase,
        workOrderId,
        serviceCode,
        userId: user.id,
      });

      added.push({
        serviceCode: result.serviceCode,
        addedLineId: result.addedLineId,
        addPath: result.addPath,
      });
    } catch (error) {
      skipped.push({
        serviceCode,
        error: error instanceof Error ? error.message : "Failed to add bundle item",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    added,
    skipped,
  });
}
