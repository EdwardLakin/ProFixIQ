import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type CorrectionBody = {
  action?: "add" | "correct" | "move" | "void";
  segment_id?: string | null;
  technician_id?: string | null;
  work_order_line_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  reason?: string;
};

export async function POST(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager"],
    requiredCapability: "canReviewWorkforceTime",
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as CorrectionBody | null;
  const action = body?.action;
  const reason = body?.reason?.trim();
  if (!action || !["add", "correct", "move", "void"].includes(action) || !reason) {
    return NextResponse.json(
      { error: "A valid action and correction reason are required" },
      { status: 400 },
    );
  }
  if (action !== "add" && !body?.segment_id) {
    return NextResponse.json(
      { error: "segment_id is required for this correction" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase() as any;
  const { data, error } = await admin.rpc(
    "correct_work_order_line_labor_segment",
    {
      p_shop_id: access.profile.shop_id,
      p_actor_profile_id: access.profile.id,
      p_action: action,
      p_segment_id: body?.segment_id ?? null,
      p_technician_id: body?.technician_id ?? null,
      p_work_order_line_id: body?.work_order_line_id ?? null,
      p_started_at: body?.started_at ?? null,
      p_ended_at: body?.ended_at ?? null,
      p_reason: reason,
    },
  );

  if (error) {
    const conflict = /locked|overlap|not found|must belong|end time/i.test(
      error.message,
    );
    return NextResponse.json(
      { error: error.message },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json(data ?? { ok: true });
}
