import "server-only";

import { NextResponse } from "next/server";
import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";

type JobPunchLine = {
  id: string;
  shop_id: string;
  work_order_id: string | null;
  line_type: string | null;
  assigned_tech_id: string | null;
  assigned_to: string | null;
};

type JobPunchAccess = Awaited<ReturnType<typeof requireShopScopedApiAccess>>;

export async function requireJobPunchActorAccess(input: {
  lineId: string;
  action: "start" | "pause" | "resume" | "finish";
  operationKey: string;
}): Promise<
  | {
      ok: true;
      access: Extract<JobPunchAccess, { ok: true }>;
      line: JobPunchLine;
    }
  | { ok: false; response: NextResponse }
> {
  const access = await requireShopScopedApiAccess({
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access;

  const admin = createAdminSupabase();
  const lineResult = await admin
    .from("work_order_lines")
    .select("id,shop_id,work_order_id,line_type,assigned_tech_id,assigned_to")
    .eq("id", input.lineId)
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

  const receipt = await admin
    .from("workforce_operation_keys")
    .select("actor_user_id,work_order_line_id")
    .eq("shop_id", line.shop_id)
    .eq("operation_name", `job_punch:${input.action}`)
    .eq("operation_key", input.operationKey)
    .maybeSingle<{
      actor_user_id: string | null;
      work_order_line_id: string | null;
    }>();
  if (receipt.error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unable to authorize this job transition." },
        { status: 500 },
      ),
    };
  }
  if (
    receipt.data?.actor_user_id === access.authUserId &&
    receipt.data.work_order_line_id === line.id
  ) {
    return { ok: true, access, line };
  }

  try {
    const authority = await resolveWorkOrderProductAuthority(
      access,
      line.work_order_id,
    );
    if (!authority.authorized) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unable to authorize this job transition." },
        { status: 503 },
      ),
    };
  }

  // Capability and assignment remain inside the locked atomic transition so a
  // committed receipt can replay after either live authorization changes.
  return { ok: true, access, line };
}
