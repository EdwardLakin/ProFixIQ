import { NextResponse } from "next/server";
import { getMobileActiveJobs } from "@/features/dispatch/server/commands";
import { dispatchErrorResponse } from "@/features/dispatch/server/http";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canPerformAssignedWork && !actor.canManageScheduling) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const snapshot = await getMobileActiveJobs({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
    });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return dispatchErrorResponse(error);
  }
}
