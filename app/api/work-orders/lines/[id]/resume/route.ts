export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireJobPunchActorAccess } from "@/features/work-orders/server/authorizeJobPunchTransition";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";

function getId(req: NextRequest) {
  const match = req.nextUrl.pathname.match(
    /\/api\/work-orders\/lines\/([^/]+)\/resume$/,
  );
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const id = getId(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    allowConcurrentJobPunches?: boolean;
    toAwaiting?: boolean;
    operationKey?: string;
    idempotencyKey?: string;
  } | null;
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    body?.operationKey?.trim() ||
    body?.idempotencyKey?.trim() ||
    "";
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  const authorization = await requireJobPunchActorAccess({
    lineId: id,
    action: "resume",
    operationKey,
  });
  if (!authorization.ok) return authorization.response;
  const { access, line } = authorization;

  const result = await applyJobPunchTransition({
    supabase: access.supabase,
    shopId: line.shop_id,
    lineId: id,
    action: "resume",
    technicianId: access.profile.id,
    actorUserId: access.authUserId,
    options: {
      operationKey,
      allowConcurrentJobPunches: body?.allowConcurrentJobPunches === true,
      resume: {
        toAwaiting: body?.toAwaiting === true,
      },
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result.payload ?? { ok: true });
}
