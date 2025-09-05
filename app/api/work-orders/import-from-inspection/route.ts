// app/api/work-orders/import-from-inspection/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { insertPrioritizedJobsFromInspection } from "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";

// If that file uses OpenAI, make sure *it* imports from lib/server/openai

export async function POST(req: Request) {
  try {
    const { workOrderId, inspectionId, userId, vehicleId } = await req.json();

    if (!workOrderId || !inspectionId || !userId || !vehicleId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await insertPrioritizedJobsFromInspection(workOrderId, inspectionId, userId, vehicleId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // don’t leak secrets
    return NextResponse.json({ error: "Failed to import inspection jobs." }, { status: 500 });
  }
}

export const runtime = "nodejs"; // ensure Node runtime for OpenAI SDK