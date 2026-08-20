import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  WORKSPACE_CAPABILITIES,
  WORKSPACE_CAPABILITY_KEYS,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EFFECTS = new Set(["inherit", "allow", "deny"] as const);

type Effect = "inherit" | "allow" | "deny";
type Body = {
  roleKey?: string;
  capabilityKey?: string;
  effect?: string;
};

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredWorkspaceCapability: WORKSPACE_CAPABILITIES.manageTeamPermissions,
  });
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  const roleKey = body?.roleKey?.trim() ?? "";
  const capabilityKey = body?.capabilityKey?.trim() ?? "";
  const effect = body?.effect?.trim().toLowerCase() ?? "";

  if (
    !roleKey ||
    !WORKSPACE_CAPABILITY_KEYS.includes(
      capabilityKey as WorkspaceCapabilityKey,
    ) ||
    !EFFECTS.has(effect as Effect)
  ) {
    return NextResponse.json(
      { error: "A valid role, capability, and effect are required" },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "set_shop_role_capability_policy_atomic",
    {
      p_role_key: roleKey,
      p_capability_key: capabilityKey,
      p_effect: effect,
    },
  );
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : 400 },
    );
  }

  return NextResponse.json(data);
}
