export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireJobPunchActorAccess } from "@/features/work-orders/server/authorizeJobPunchTransition";
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

  const authorization = await requireJobPunchActorAccess({
    lineId: id,
    action: "finish",
    operationKey,
  });
  if (!authorization.ok) return authorization.response;

  const result = await completeWorkOrderLine({
    supabase: authorization.access.supabase,
    lineId: id,
    technicianId: authorization.access.authUserId,
    actorUserId: authorization.access.authUserId,
    operationKey,
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
