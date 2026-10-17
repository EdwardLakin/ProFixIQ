import Link from "next/link";
import { notFound } from "next/navigation";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentWorkOrderProviders from "@/features/equipment/components/EquipmentWorkOrderProviders";
import { loadEquipmentAssetRecord } from "@/features/equipment/server/equipmentAssetProfileService";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";
import {
  loadCurrentWorkOrderWorkspaceSnapshot,
  WORK_ORDER_WORKSPACE_READER_ROLES,
} from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";
import { WorkOrderWorkspaceFrame } from "@/features/work-orders/workspace/WorkOrderWorkspaceFrame";
import WorkOrderOperationalTimelineDock from "@/features/operations/components/WorkOrderOperationalTimelineDock";
import WorkOrderIdClient from "../../../work-orders/[id]/Client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: WORK_ORDER_WORKSPACE_READER_ROLES,
  });
  const { id } = await params;
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled")
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref={`/equipment/work-orders/${id}`}
      />
    );
  const snapshot = await loadCurrentWorkOrderWorkspaceSnapshot({ routeId: id });
  if (
    !snapshot?.workOrder.vehicleId ||
    snapshot.workOrder.shopId !== profile.shop_id
  )
    notFound();
  const equipment = await loadEquipmentAssetRecord({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
    assetId: snapshot.workOrder.vehicleId,
  });
  if (!equipment?.profile) notFound();
  return (
    <EquipmentWorkOrderProviders>
      <nav aria-label="Equipment work navigation" className="flex flex-wrap gap-4 p-4 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
        <Link href="/equipment/work-orders">Back to Equipment Work</Link>
        <Link href={`/equipment/${snapshot.workOrder.vehicleId}`}>
          Equipment asset
        </Link>
        <Link href={`/work-orders/${snapshot.workOrder.id}/approve`}>
          Customer approval
        </Link>
      </nav>
      <WorkOrderWorkspaceFrame initialResource={snapshot.resource}>
        <WorkOrderIdClient equipment />
        <WorkOrderOperationalTimelineDock />
      </WorkOrderWorkspaceFrame>
    </EquipmentWorkOrderProviders>
  );
}
