import "server-only";

import { NextResponse } from "next/server";
import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

type JobPunchLine = {
  id: string;
  shop_id: string;
  work_order_id: string | null;
  line_type: string | null;
  assigned_tech_id: string | null;
  assigned_to: string | null;
};

type JobPunchAccess = Awaited<ReturnType<typeof requireShopScopedApiAccess>>;

export async function requireAssignedJobPunchAccess(lineId: string): Promise<
  | {
      ok: true;
      access: Extract<JobPunchAccess, { ok: true }>;
      line: JobPunchLine;
    }
  | { ok: false; response: NextResponse }
> {
  const access = await requireShopScopedApiAccess({
    requiredWorkspaceCapability:
      WORKSPACE_CAPABILITIES.executeAssignedWorkOrderJobs,
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access;

  const admin = createAdminSupabase();
  const actorIds = [...new Set([access.profile.id, access.authUserId])];
  const [lineResult, assignmentResult] = await Promise.all([
    admin
      .from("work_order_lines")
      .select("id,shop_id,work_order_id,line_type,assigned_tech_id,assigned_to")
      .eq("id", lineId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<JobPunchLine>(),
    admin
      .from("work_order_line_technicians")
      .select("id")
      .eq("work_order_line_id", lineId)
      .in("technician_id", actorIds)
      .limit(1)
      .maybeSingle<{ id: string }>(),
  ]);

  if (lineResult.error || assignmentResult.error) {
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

  const assigned =
    actorIds.includes(line.assigned_tech_id ?? "") ||
    actorIds.includes(line.assigned_to ?? "") ||
    Boolean(assignmentResult.data?.id);
  if (!assigned) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "An assigned technician is required for this job action." },
        { status: 403 },
      ),
    };
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

  return { ok: true, access, line };
}
