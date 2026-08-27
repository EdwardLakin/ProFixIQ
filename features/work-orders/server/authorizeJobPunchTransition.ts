import "server-only";

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type JobPunchLine = {
  id: string;
  shop_id: string;
  work_order_id: string | null;
  line_type: string | null;
  assigned_tech_id: string | null;
  assigned_to: string | null;
};

type JobPunchAccess = Awaited<ReturnType<typeof requireShopScopedApiAccess>>;

export async function requireJobPunchActorAccess(lineId: string): Promise<
  | {
      ok: true;
      access: Extract<JobPunchAccess, { ok: true }>;
      line: JobPunchLine;
    }
  | { ok: false; response: NextResponse }
> {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access;

  const lineResult = await createAdminSupabase()
    .from("work_order_lines")
    .select("id,shop_id,work_order_id,line_type,assigned_tech_id,assigned_to")
    .eq("id", lineId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle<JobPunchLine>();

  if (lineResult.error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unable to authorize this job transition." },
        { status: 500 },
      ),
    };
  }

  const line = lineResult.data;
  if (!line?.id || !line.shop_id || !line.work_order_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Work-order line not found." },
        { status: 404 },
      ),
    };
  }
  if ((line.line_type ?? "job") === "info") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Info lines are non-actionable." },
        { status: 409 },
      ),
    };
  }

  // The atomic RPC checks an actor/action/line/key receipt before current
  // capability and assignment. Keep the HTTP layer identity/shop scoped, then
  // delegate that ordered decision to the transaction boundary.
  return { ok: true, access, line };
}
