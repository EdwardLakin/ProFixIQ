import { notFound } from "next/navigation";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { loadEquipmentAssetRecord } from "@/features/equipment/server/equipmentAssetProfileService";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import {
  loadVehicleWorkspaceSnapshot,
  vehicleWorkspaceCreateWorkOrderHref,
} from "@/features/vehicles/server/loadVehicleWorkspaceSnapshot";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";
import ShopCreateWorkOrderPage from "@/features/work-orders/app/work-orders/create/ShopCreateWorkOrderPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentCreateWorkOrderPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: ROLE_GROUPS.workOrderCreators,
  });
  const { assetId } = await params;
  if (!isAssetId(assetId)) notFound();
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled")
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref={`/equipment/work-orders/create/${assetId}`}
      />
    );
  const supabase = createServerSupabaseRSC();
  const equipment = await loadEquipmentAssetRecord({
    supabase,
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
    assetId,
  });
  if (!equipment?.profile) notFound();
  const snapshot = await loadVehicleWorkspaceSnapshot({
    supabase,
    shopId: profile.shop_id,
    role: canonicalRole,
    vehicleId: assetId,
  });
  if (
    !snapshot?.currentAccount ||
    !vehicleWorkspaceCreateWorkOrderHref(snapshot)
  )
    notFound();
  return (
    <ShopCreateWorkOrderPage
      key={`${profile.shop_id}:${assetId}:${snapshot.currentAccount.id}`}
      equipmentContext={{
        shopId: profile.shop_id,
        assetId,
        customerId: snapshot.currentAccount.id,
      }}
    />
  );
}
