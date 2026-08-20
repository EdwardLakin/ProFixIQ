import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { WORKSPACE_CAPABILITY_KEYS } from "@/features/workspace/authorization/capabilities";
import { resolveCurrentWorkspaceCapabilities } from "@/features/workspace/authorization/server/resolveWorkspaceCapabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const result = await resolveCurrentWorkspaceCapabilities({
    supabase: access.supabase,
    profileId: access.profile.id,
    shopId: access.profile.shop_id,
    capabilityKeys: WORKSPACE_CAPABILITY_KEYS,
  });
  if (result.error) {
    return NextResponse.json(
      { error: "Authorization service unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { capabilities: result.capabilities },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
