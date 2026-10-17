import { unstable_noStore as noStore } from "next/cache";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentDispatchView from "@/features/equipment/dispatch/components/EquipmentDispatchView";
import { loadEquipmentDispatch } from "@/features/equipment/dispatch/server/loadEquipmentDispatch";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import {
  getMobileFieldServiceAccess,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentDispatchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
    requiredCapability: "canManageScheduling",
  });
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled")
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref="/equipment/dispatch"
      />
    );
  const params = (await searchParams) ?? {};
  const filters = parseEquipmentQueueFilters(params);
  const workOrderId =
    typeof params.workOrder === "string" ? params.workOrder : "";
  const supabase = createServerSupabaseRSC();
  // Field eligibility gates dispatch creation, never read-only board access.
  const dispatchAccessPromise = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return (
      await getMobileFieldServiceAccess({
        supabase,
        profile,
        canonicalRole,
        authUserId: user?.id ?? profile.id,
      } as unknown as ShopAccess)
    ).decision;
  })().catch(() => "unavailable" as const);
  try {
    const [data, dispatchAccess] = await Promise.all([
      loadEquipmentDispatch({
        supabase,
        admin: createAdminSupabase(),
        shopId: profile.shop_id,
        actorUserId: profile.id,
        role: canonicalRole,
        filters,
        workOrderId,
      }),
      dispatchAccessPromise,
    ]);
    return (
      <EquipmentDispatchView
        data={data}
        dispatchAccess={dispatchAccess}
        filters={filters}
        shopId={profile.shop_id}
        actorId={profile.id}
      />
    );
  } catch {
    return (
      <EquipmentDispatchView
        error
        filters={filters}
        shopId={profile.shop_id}
        actorId={profile.id}
      />
    );
  }
}
