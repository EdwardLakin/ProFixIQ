import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { computeMaintenanceSuggestionsForWorkOrder } from "@/features/maintenance/server/computeMaintenanceSuggestions";

type DB = Database;

function getWorkOrderId(req: NextRequest): string | null {
  const url = new URL(req.url);
  const workOrderId = url.searchParams.get("workOrderId");
  return workOrderId?.trim() || null;
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workOrderId = getWorkOrderId(req);
  if (!workOrderId) {
    return NextResponse.json(
      { error: "workOrderId is required" },
      { status: 400 },
    );
  }

  try {
    const result = await computeMaintenanceSuggestionsForWorkOrder({
      supabase,
      workOrderId,
    });

    return NextResponse.json({
      ok: true,
      workOrderId,
      suggestions: result.suggestions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load suggestions";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
