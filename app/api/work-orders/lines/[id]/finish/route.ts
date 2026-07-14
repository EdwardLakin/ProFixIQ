export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";

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

  const result = await applyJobPunchTransition({
    supabase,
    lineId: id,
    action: "finish",
    technicianId: user.id,
    options: {
      operationKey,
      finish: {
        cause: body.cause,
        correction: body.correction,
      },
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.payload ?? { success: true });
}
