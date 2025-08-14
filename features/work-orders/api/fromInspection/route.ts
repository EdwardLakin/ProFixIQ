import { NextRequest, NextResponse } from "next/server";
import { insertPrioritizedJobsFromInspection } from "@work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  inspectionId: string;
  workOrderId: string;
  vehicleId: string;
};

export async function POST(req: NextRequest) {
  try {
    const { inspectionId, workOrderId, vehicleId } = (await req.json()) as Body;

    if (!inspectionId || !workOrderId || !vehicleId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await insertPrioritizedJobsFromInspection(
      inspectionId,
      workOrderId,
      vehicleId,
      user.id,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to insert jobs from inspection:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}