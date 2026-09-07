import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { loadPermissionAdministrationSnapshot } from "@/features/workspace/authorization/server/permissionAdministration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredWorkspaceCapability: WORKSPACE_CAPABILITIES.manageTeamPermissions,
  });
  if (!access.ok) return access.response;

  const requestedProfileId =
    new URL(request.url).searchParams.get("profileId")?.trim() ?? "";
  if (requestedProfileId && !UUID_RE.test(requestedProfileId)) {
    return NextResponse.json(
      { error: "A valid employee id is required" },
      { status: 400 },
    );
  }

  const result = await loadPermissionAdministrationSnapshot({
    supabase: access.supabase,
    shopId: access.profile.shop_id,
    targetProfileId: requestedProfileId || null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(
    { snapshot: result.snapshot },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
