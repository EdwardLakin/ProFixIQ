export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";

type Body = {
  cause?: string | null;
  correction?: string | null;
};

function extractLineId(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/api\/work-orders\/lines\/([^/]+)\/finish$/);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const id = extractLineId(req);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });

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

  const result = await applyJobPunchTransition({
    supabase,
    lineId: id,
    action: "finish",
    technicianId: user.id,
    options: {
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
