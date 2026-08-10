import "server-only";

import { NextResponse } from "next/server";

import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function requireMobileServiceOperatorApiAccess() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access;

  const actor = getActorCapabilities({ role: access.profile.role });
  const managementRole = [
    "owner",
    "admin",
    "manager",
    "advisor",
    "service",
  ].includes(access.canonicalRole);

  const { data: fieldOperator, error } = await access.supabase
    .from("mobile_field_operators")
    .select("profile_id")
    .eq("shop_id", access.profile.shop_id)
    .eq("profile_id", access.profile.id)
    .eq("enabled", true)
    .maybeSingle<{ profile_id: string }>();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unable to verify Mobile Service access." },
        { status: 500 },
      ),
    };
  }

  const isFieldOperator = Boolean(fieldOperator);
  if (!managementRole && !isFieldOperator && !actor.canManageScheduling) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ...access,
    actor,
    isFieldOperator,
    managementRole,
  };
}
