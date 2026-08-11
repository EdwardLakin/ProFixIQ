import "server-only";

import { NextResponse } from "next/server";

import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type ShopAccess = Extract<
  Awaited<ReturnType<typeof requireShopScopedApiAccess>>,
  { ok: true }
>;

export type MobileFieldServiceAccess = {
  fieldServiceEnabled: boolean;
  isFieldOperator: boolean;
  canConfigure: boolean;
  canAccessFieldService: boolean;
};

export function resolveMobileFieldServiceAccess(input: {
  serviceModel: string | null | undefined;
  onboardingCompletedAt: string | null | undefined;
  isFieldOperator: boolean;
  canonicalRole: string;
}): MobileFieldServiceAccess {
  const fieldServiceEnabled = Boolean(
    input.onboardingCompletedAt &&
      ["mobile", "both"].includes(input.serviceModel ?? ""),
  );
  const canConfigure = ["owner", "admin"].includes(input.canonicalRole);

  return {
    fieldServiceEnabled,
    isFieldOperator: input.isFieldOperator,
    canConfigure,
    canAccessFieldService: fieldServiceEnabled && input.isFieldOperator,
  };
}

export async function getMobileFieldServiceAccess(
  access: ShopAccess,
): Promise<MobileFieldServiceAccess> {
  const [settingsResult, operatorResult] = await Promise.all([
    access.supabase
      .from("mobile_service_settings")
      .select("service_model,onboarding_completed_at")
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle(),
    access.supabase
      .from("mobile_field_operators")
      .select("profile_id")
      .eq("shop_id", access.profile.shop_id)
      .eq("profile_id", access.profile.id)
      .eq("enabled", true)
      .maybeSingle<{ profile_id: string }>(),
  ]);

  const error = settingsResult.error || operatorResult.error;
  if (error) throw new Error(error.message);

  return resolveMobileFieldServiceAccess({
    serviceModel: settingsResult.data?.service_model,
    onboardingCompletedAt: settingsResult.data?.onboarding_completed_at,
    isFieldOperator: Boolean(operatorResult.data),
    canonicalRole: access.canonicalRole,
  });
}

export async function isExplicitMobileFieldOperator(
  access: ShopAccess,
): Promise<boolean> {
  return (await getMobileFieldServiceAccess(access)).isFieldOperator;
}

export async function canFieldOperatorAccessWorkOrder(
  access: ShopAccess,
  workOrderId: string,
): Promise<boolean> {
  const actor = getActorCapabilities({ role: access.profile.role });
  const fieldAccess = await getMobileFieldServiceAccess(access);
  const fieldAuthorized =
    fieldAccess.canAccessFieldService && actor.canPerformAssignedWork;
  if (!fieldAuthorized) return false;

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

  let fieldAccess: MobileFieldServiceAccess;
  try {
    fieldAccess = await getMobileFieldServiceAccess(access);
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unable to verify Field Service access." },
        { status: 500 },
      ),
    };
  }

  if (!fieldAccess.canAccessFieldService) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ...access,
    actor: getActorCapabilities({ role: access.profile.role }),
    isFieldOperator: fieldAccess.isFieldOperator,
    managementRole: fieldAccess.canAccessFieldService && [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
    ].includes(access.canonicalRole),
    fieldServiceEnabled: fieldAccess.fieldServiceEnabled,
  };
}
