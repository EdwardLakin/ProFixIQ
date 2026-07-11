export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { startTechnicianJobLabor } from "@/features/work-orders/server/technicianJobLabor";

function getId(req: NextRequest) {
  const m = req.nextUrl.pathname.match(
    /\/api\/work-orders\/lines\/([^/]+)\/start$/,
  );
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const id = getId(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createServerSupabaseRoute();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr)
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    allowConcurrentJobPunches?: boolean;
  } | null;

  const result = await startTechnicianJobLabor({
    supabase,
    lineId: id,
    technicianId: auth.user.id,
    allowConcurrentJobPunches: body?.allowConcurrentJobPunches === true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result.payload ?? { ok: true });
}
