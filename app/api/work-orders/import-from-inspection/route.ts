// app/api/work-orders/import-from-inspection/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  insertPrioritizedJobsFromInspection,
} from "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";

type DB = Database;

type ImportBody = {
  workOrderId: string;
  inspectionId: string;
  vehicleId: string;
  autoGenerateParts?: boolean;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const body = (await req.json()) as Partial<ImportBody>;
    const { workOrderId, inspectionId, vehicleId, autoGenerateParts } = body;

    if (!workOrderId || !inspectionId || !vehicleId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure requester can see the WO (RLS enforced).
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
      return NextResponse.json(
        { error: "Work order not found." },
        { status: 404 },
      );
    }

    const res = await insertPrioritizedJobsFromInspection({
      supabase,
      inspectionId,
      workOrderId,
      vehicleId,
      userId: user.id,
      autoGenerateParts: autoGenerateParts ?? true,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      insertedCount: res.insertedCount,
      partsRequestsCount: res.partsRequestsCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("import-from-inspection error:", message);
    return NextResponse.json(
      { error: "Failed to import inspection jobs." },
      { status: 500 },
    );
  }
}