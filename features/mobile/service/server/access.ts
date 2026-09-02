import "server-only";

import { NextResponse } from "next/server";

import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import {
  resolveFieldServiceAccessContract,
  type FieldServiceAccessContract,
} from "@/features/mobile/service/fieldServiceAccessContract";
import type { FieldWorkspaceCapabilities } from "@/features/mobile/service/fieldWorkspaceCapabilities";
import {
  getActorCapabilities,
  hasAnyRole,
  ROLE_GROUPS,
  type ActorCapabilities,
} from "@/features/shared/lib/rbac";
import {
  FIELD_PRODUCT_CAPABILITIES,
  resolveShopProductAccess,
  SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export type ShopAccess = Extract<
  Awaited<ReturnType<typeof requireShopScopedApiAccess>>,
  { ok: true }
>;

const FIELD_ASSIGNMENT_PAGE_SIZE = 500;

export type MobileFieldServiceAccess = FieldServiceAccessContract;

export type MobileFieldServiceWorkspaceAccess = MobileFieldServiceAccess & {
  workspaceCapabilities: FieldWorkspaceCapabilities;
};

export type CanonicalShopOrFieldProductScope = "shop" | "field";

type CanonicalShopOrFieldApiAccessOptions = Omit<
  NonNullable<Parameters<typeof requireShopScopedApiAccess>[0]>,
  "requiredProductCapabilities"
>;

export function resolveFieldWorkspaceCapabilities(input: {
  role: string | null | undefined;
  standaloneFieldWorkspace?: boolean;
  canConfigureFieldService: boolean;
  canSwitchWorkspace: boolean;
}): FieldWorkspaceCapabilities {
  if (input.standaloneFieldWorkspace === true) {
    const standaloneOwner = input.canConfigureFieldService;
    return {
      canManageScheduling: standaloneOwner,
      canManageParts: standaloneOwner,
      canManageOperations: standaloneOwner,
      canManageInspectionTemplates: standaloneOwner,
      canConfigureFieldService: standaloneOwner,
      canSwitchWorkspace: input.canSwitchWorkspace,
    };
  }

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
  subscriptionPackage?: string | null;
  isCanonicalWorkspaceOwner?: boolean;
}): MobileFieldServiceAccess {
  return resolveFieldServiceAccessContract(input);
}

export async function getMobileFieldServiceAccess(
  access: ShopAccess,
): Promise<MobileFieldServiceAccess> {
  const [settingsResult, operatorResult, entitlementResult, shopResult] =
    await Promise.all([
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
      access.supabase
        .from("shops")
        .select("subscription_package,owner_id")
        .eq("id", access.profile.shop_id)
        .maybeSingle<{
          subscription_package: string | null;
          owner_id: string | null;
        }>(),
    ]);

  const error =
    settingsResult.error ||
    operatorResult.error ||
    entitlementResult.error ||
    shopResult.error;
  if (error) throw new Error(error.message);

  return resolveMobileFieldServiceAccess({
    serviceModel: settingsResult.data?.service_model,
    onboardingCompletedAt: settingsResult.data?.onboarding_completed_at,
    isFieldOperator: Boolean(operatorResult.data),
    canonicalRole: access.canonicalRole,
    productEntitled: entitlementResult.data === true,
    subscriptionPackage: shopResult.data?.subscription_package ?? null,
    isCanonicalWorkspaceOwner:
      shopResult.data?.owner_id === access.profile.id ||
      shopResult.data?.owner_id === access.authUserId,
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
      standaloneFieldWorkspace: fieldAccess.standaloneFieldWorkspace,
      canConfigureFieldService: fieldAccess.canConfigure,
      canSwitchWorkspace: canAccessShop || canAccessFleet,
    }),
  };
}

/**
 * Resolve a shared Shop/Field surface without treating tenant-level Field
 * entitlement as actor authorization. Shop keeps its existing role-shaped
 * access; the Field branch must also pass the canonical workspace contract.
 */
export async function resolveCanonicalShopOrFieldProductScope(
  access: ShopAccess,
): Promise<CanonicalShopOrFieldProductScope | null> {
  const shopAccess = await resolveShopProductAccess({
    supabase: access.supabase,
    shopId: access.profile.shop_id,
    capabilities: SHOP_PRODUCT_CAPABILITIES,
  });
  if (shopAccess.entitled) return "shop";
  if (shopAccess.error) throw new Error(shopAccess.error);

  const fieldAccess = await getMobileFieldServiceAccess(access);
  return fieldAccess.canAccessFieldService ? "field" : null;
}

export async function requireCanonicalShopOrFieldApiAccess(
  options: CanonicalShopOrFieldApiAccessOptions = {},
) {
  const access = await requireShopScopedApiAccess({
    ...options,
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access;

  try {
    const productScope = await resolveCanonicalShopOrFieldProductScope(access);
    if (!productScope) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Canonical Shop or Field access is required." },
          { status: 403 },
        ),
      };
    }
    return { ...access, productScope };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unable to verify product access." },
        { status: 503 },
      ),
    };
  }
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
  const canManageLinkedFieldWork =
    fieldAccess.standaloneFieldWorkspace || actor.canManageScheduling;
  const fieldAuthorized =
    fieldAccess.canAccessFieldService &&
    (canManageLinkedFieldWork || actor.canPerformAssignedWork);
  if (!fieldAuthorized) return false;

  let query = access.supabase
    .from("service_visits")
    .select("id")
    .eq("shop_id", access.profile.shop_id)
    .eq("work_order_id", workOrderId)
    .eq("mode", "mobile");
  if (!canManageLinkedFieldWork) {
    query = query.eq("assigned_user_id", access.profile.id);
  }

  const { data, error } = await query.limit(1).maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function canFieldActorAccessWorkOrder(
  access: ShopAccess,
  workOrderId: string,
): Promise<boolean> {
  const actor = getActorCapabilities({ role: access.profile.role });
  const fieldAccess = await getMobileFieldServiceAccess(access);
  if (
    !fieldAccess.canAccessFieldService ||
    (!actor.canManageScheduling && !actor.canPerformAssignedWork)
  ) {
    return false;
  }

  let query = access.supabase
    .from("service_visits")
    .select("id")
    .eq("shop_id", access.profile.shop_id)
    .eq("work_order_id", workOrderId)
    .eq("mode", "mobile");
  if (!actor.canManageScheduling) {
    query = query.eq("assigned_user_id", access.profile.id);
  }

  const { data, error } = await query.limit(1).maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export async function listFieldOperatorAssignedWorkOrderIds(
  access: ShopAccess,
): Promise<string[]> {
  const actor = getActorCapabilities({ role: access.profile.role });
  const fieldAccess = await getMobileFieldServiceAccess(access);
  const canManageLinkedFieldWork =
    fieldAccess.standaloneFieldWorkspace || actor.canManageScheduling;
  if (
    !fieldAccess.canAccessFieldService ||
    (!canManageLinkedFieldWork && !actor.canPerformAssignedWork)
  ) {
    return [];
  }

  const workOrderIds = new Set<string>();
  let from = 0;

  while (true) {
    let query = access.supabase
      .from("service_visits")
      .select("work_order_id")
      .eq("shop_id", access.profile.shop_id)
      .eq("mode", "mobile");
    if (!canManageLinkedFieldWork) {
      query = query.eq("assigned_user_id", access.profile.id);
    }

    const { data, error } = await query
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

export type WorkOrderProductAuthority =
  | { authorized: true; product: "shop" | "field" }
  | { authorized: false; product: null };

/**
 * Resolve one shared Work Order against its product and relationship contract.
 * Shop retains tenant-wide role-shaped behavior. Field remains limited to a
 * linked mobile visit managed by the caller or assigned to the caller.
 */
export async function resolveWorkOrderProductAuthority(
  access: ShopAccess,
  workOrderId: string,
): Promise<WorkOrderProductAuthority> {
  const shopAccess = await resolveShopProductAccess({
    supabase: access.supabase,
    shopId: access.profile.shop_id,
    capabilities: SHOP_PRODUCT_CAPABILITIES,
  });
  if (shopAccess.entitled) return { authorized: true, product: "shop" };

  if (await canFieldActorAccessWorkOrder(access, workOrderId)) {
    return { authorized: true, product: "field" };
  }

  if (shopAccess.error) throw new Error(shopAccess.error);
  return { authorized: false, product: null };
}

function fieldAccessDeniedResponse(fieldAccess: MobileFieldServiceAccess) {
  const error =
    fieldAccess.decision === "plan_required"
      ? "Field Service is not included in this shop's plan."
      : fieldAccess.decision === "setup_required"
        ? "Field Service setup must be completed before using this route."
        : "Your account is not an enabled Field operator.";

  return NextResponse.json(
    {
      error,
      code: fieldAccess.code,
      decision: fieldAccess.decision,
      productEntitled: fieldAccess.productEntitled,
      configurationComplete: fieldAccess.configurationComplete,
      canConfigure: fieldAccess.canConfigure,
      canAccessFieldService: false,
    },
    {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function requireMobileServiceOperatorApiAccess(
  options: { requiredCapability?: keyof ActorCapabilities } = {},
) {
  const access = await requireShopScopedApiAccess({
    ...options,
    requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES,
  });
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
      response: fieldAccessDeniedResponse(fieldAccess),
    };
  }

  return {
    ...access,
    actor: getActorCapabilities({ role: access.profile.role }),
    isFieldOperator: fieldAccess.isFieldOperator,
    standaloneFieldWorkspace: fieldAccess.standaloneFieldWorkspace,
    managementRole:
      fieldAccess.canAccessFieldService &&
      (fieldAccess.standaloneFieldWorkspace ||
        hasAnyRole(access.canonicalRole, ROLE_GROUPS.billingOperators)),
    fieldServiceEnabled: fieldAccess.fieldServiceEnabled,
    canConfigure: fieldAccess.canConfigure,
  };
}

export async function requireMobileServiceConfigurationApiAccess() {
  const access = await requireShopScopedApiAccess({
    requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES,
  });
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

  if (!fieldAccess.productEntitled) {
    return {
      ok: false as const,
      response: fieldAccessDeniedResponse(fieldAccess),
    };
  }

  if (!fieldAccess.canConfigure) {
    return {
      ok: false as const,
      response: fieldAccessDeniedResponse(fieldAccess),
    };
  }

  return {
    ...access,
    fieldAccess,
  };
}

export async function requireMobileServiceSetupApiAccess() {
  const access = await requireShopScopedApiAccess({
    requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES,
  });
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

  if (!fieldAccess.productEntitled) {
    return {
      ok: false as const,
      response: fieldAccessDeniedResponse(fieldAccess),
    };
  }

  return {
    ...access,
    fieldAccess,
  };
}
