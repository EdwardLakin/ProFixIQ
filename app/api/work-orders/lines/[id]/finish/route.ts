export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { finishViaEquipmentLastOff } from "@/features/equipment/dispatch/server/equipmentFinish";
import { completeWorkOrderLine } from "@/features/work-orders/server/completeWorkOrderLine";

type Body = {
  cause?: string | null;
  correction?: string | null;
  operationKey?: string;
  idempotencyKey?: string;
};

function extractLineId(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(
    /\/api\/work-orders\/lines\/([^/]+)\/finish$/,
  );
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const id = extractLineId(req);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    body.operationKey?.trim() ||
    body.idempotencyKey?.trim() ||
    "";
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  // Equipment shops: the last technician to punch off closes the line. Returns
  // `handled: false` for every other case, so the existing finish below is unchanged.
  const equipment = await finishViaEquipmentLastOff({
    userSupabase: supabase,
    authUserId: user.id,
    lineId: id,
    operationKey,
    cause: body.cause,
    correction: body.correction,
  });
  if (equipment.handled) {
    if (!equipment.ok) {
      return NextResponse.json({ error: equipment.error }, { status: equipment.status });
    }
    return NextResponse.json(equipment.payload);
  }

  const result = await completeWorkOrderLine({
    supabase,
    lineId: id,
    technicianId: user.id,
    actorUserId: user.id,
    operationKey,
    enforceProductAccess: true,
    enforceAssignedWork: true,
    cause: body.cause,
    correction: body.correction,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const payload =
    result.payload && typeof result.payload === "object"
      ? result.payload
      : { success: true };
  return NextResponse.json({
    ...payload,
    menuRepairLearning: result.menuRepairLearning,
  });
}
