// app/api/work-orders/import-from-inspection/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { insertPrioritizedJobsFromInspection } from "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";

type ImportBody = {
  workOrderId: string;
  inspectionId: string;
  userId: string;
  vehicleId: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ImportBody>;
    const { workOrderId, inspectionId, userId, vehicleId } = body;

    if (!workOrderId || !inspectionId || !userId || !vehicleId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await insertPrioritizedJobsFromInspection(workOrderId, inspectionId, userId, vehicleId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Keep logs private; respond with a generic error
    console.error("import-from-inspection error:", message);
    return NextResponse.json(
      { error: "Failed to import inspection jobs." },
      { status: 500 }
    );
  }
}

// Ensure Node runtime (OpenAI SDK, if used downstream)
export const runtime = "nodejs";