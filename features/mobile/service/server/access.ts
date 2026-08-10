import "server-only";

import { NextResponse } from "next/server";

import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type ShopAccess = Extract<
  Awaited<ReturnType<typeof requireShopScopedApiAccess>>,
  { ok: true }
>;

export async function isExplicitMobileFieldOperator(
  access: ShopAccess,
): Promise<boolean> {
  const { data, error } = await access.supabase
    .from("mobile_field_operators")
    .select("profile_id")
    .eq("shop_id", access.profile.shop_id)
    .eq("profile_id", access.profile.id)
    .eq("enabled", true)
    .maybeSingle<{ profile_id: string }>();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function canFieldOperatorAccessWorkOrder(
  access: ShopAccess,
  workOrderId: string,
): Promise<boolean> {
  if (!(await isExplicitMobileFieldOperator(access))) return false;
  const { data, error } = await access.supabase
    .from("service_visits")
    .select("id")
    .eq("shop_id", access.profile.shop_id)
    .eq("work_order_id", workOrderId)
    .eq("assigned_user_id", access.profile.id)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

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

  let isFieldOperator = false;
  try {
    isFieldOperator = await isExplicitMobileFieldOperator(access);
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unable to verify Mobile Service access." },
        { status: 500 },
      ),
    };
  }

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
