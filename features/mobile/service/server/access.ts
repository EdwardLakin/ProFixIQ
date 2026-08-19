import "server-only";

import { NextResponse } from "next/server";

import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import type { FieldWorkspaceCapabilities } from "@/features/mobile/service/fieldWorkspaceCapabilities";
import {
  getActorCapabilities,
  hasAnyRole,
  ROLE_GROUPS,
} from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type ShopAccess = Extract<
  Awaited<ReturnType<typeof requireShopScopedApiAccess>>,
  { ok: true }
>;

const FIELD_ASSIGNMENT_PAGE_SIZE = 500;

export type MobileFieldServiceAccess = {
  fieldServiceEnabled: boolean;
  isFieldOperator: boolean;
  canConfigure: boolean;
  canAccessFieldService: boolean;
};

export type MobileFieldServiceWorkspaceAccess = MobileFieldServiceAccess & {
  workspaceCapabilities: FieldWorkspaceCapabilities;
};

export function resolveFieldWorkspaceCapabilities(input: {
  role: string | null | undefined;
  canConfigureFieldService: boolean;
  canSwitchWorkspace: boolean;
}): FieldWorkspaceCapabilities {
  const actor = getActorCapabilities({ role: input.role });
  return {
    canManageScheduling: actor.canManageScheduling,
    canManageParts: actor.canManageParts,
    canManageOperations: actor.canManageWorkOrders,
    canManageInspectionTemplates: hasAnyRole(
      input.role,
      ROLE_GROUPS.billingOperators,
    ),
    canConfigureFieldService: input.canConfigureFieldService,
    canSwitchWorkspace: input.canSwitchWorkspace,
  };
}

export function resolveMobileFieldServiceAccess(input: {
  serviceModel: string | null | undefined;
  onboardingCompletedAt: string | null | undefined;
  isFieldOperator: boolean;
  canonicalRole: string;
  productEntitled: boolean;
}): MobileFieldServiceAccess {
  const fieldServiceEnabled = Boolean(
    input.productEntitled &&
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
  const [settingsResult, operatorResult, entitlementResult] = await Promise.all(
    [
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
      access.supabase.rpc("profixiq_shop_has_product_access", {
        p_capability: "field_service",
        p_shop_id: access.profile.shop_id,
      }),
    ],
  );

  const error =
    settingsResult.error || operatorResult.error || entitlementResult.error;
  if (error) throw new Error(error.message);

  return resolveMobileFieldServiceAccess({
    serviceModel: settingsResult.data?.service_model,
    onboardingCompletedAt: settingsResult.data?.onboarding_completed_at,
    isFieldOperator: Boolean(operatorResult.data),
    canonicalRole: access.canonicalRole,
    productEntitled: entitlementResult.data === true,
  });
}

export async function getMobileFieldServiceWorkspaceAccess(
  access: ShopAccess,
): Promise<MobileFieldServiceWorkspaceAccess> {
  const fieldAccess = await getMobileFieldServiceAccess(access);
  let canAccessShop = false;
  let canAccessFleet = false;

  if (fieldAccess.canAccessFieldService) {
    const [shopEntitlement, fleetWorkspaceAccess] = await Promise.all([
      access.supabase.rpc("profixiq_shop_has_product_access", {
        p_capability: "shop",
        p_shop_id: access.profile.shop_id,
      }),
      (async () => {
        try {
          const fleetActor = await resolveFleetActorContext(access.supabase, {
            userId: access.authUserId,
          });
          return fleetActor.capabilities.canAccessFleetIntake;
        } catch {
          // Another workspace is optional; its own route remains authoritative.
          return false;
        }
      })(),
    ]);
    canAccessShop = !shopEntitlement.error && shopEntitlement.data === true;
    canAccessFleet = fleetWorkspaceAccess;
  }

  return {
    ...fieldAccess,
    workspaceCapabilities: resolveFieldWorkspaceCapabilities({
      role: access.profile.role,
      canConfigureFieldService: fieldAccess.canConfigure,
      canSwitchWorkspace: canAccessShop || canAccessFleet,
    }),
  };
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

export async function listFieldOperatorAssignedWorkOrderIds(
  access: ShopAccess,
): Promise<string[]> {
  const actor = getActorCapabilities({ role: access.profile.role });
  const fieldAccess = await getMobileFieldServiceAccess(access);
  if (!fieldAccess.canAccessFieldService || !actor.canPerformAssignedWork) {
    return [];
  }

  const workOrderIds = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await access.supabase
      .from("service_visits")
      .select("work_order_id")
      .eq("shop_id", access.profile.shop_id)
      .eq("assigned_user_id", access.profile.id)
      .not("work_order_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + FIELD_ASSIGNMENT_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as Array<{ work_order_id: string | null }>;
    if (page.length === 0) break;
    for (const visit of page) {
      if (visit.work_order_id) workOrderIds.add(visit.work_order_id);
    }
    from += page.length;
  }

  return [...workOrderIds];
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
    managementRole:
      fieldAccess.canAccessFieldService &&
      hasAnyRole(access.canonicalRole, ROLE_GROUPS.billingOperators),
    fieldServiceEnabled: fieldAccess.fieldServiceEnabled,
  };
}
