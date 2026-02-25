// app/api/work-orders/import-from-inspection/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { insertPrioritizedJobsFromInspection } from "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";

type ImportBody = {
  workOrderId: string;
  inspectionId: string;
  vehicleId: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ImportBody>;
    const { workOrderId, inspectionId, vehicleId } = body;

    if (!workOrderId || !inspectionId || !vehicleId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure requester can see the WO (RLS enforced).
    // Explicitly fetch minimal WO fields to prevent blind imports.
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json(
        { error: `Failed to load work order: ${woErr.message}` },
        { status: 400 },
      );
    }
    if (!wo) {
      return NextResponse.json({ error: "Work order not found." }, { status: 404 });
    }

    // The library function should do its own RLS-safe inserts.
    // We pass only the authenticated user id.
    await insertPrioritizedJobsFromInspection(
      workOrderId,
      inspectionId,
      user.id,
      vehicleId,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("import-from-inspection error:", message);
    return NextResponse.json(
      { error: "Failed to import inspection jobs." },
      { status: 500 },
    );
  }
}