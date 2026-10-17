import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentLineStatusView from "@/features/equipment/dispatch/components/EquipmentLineStatusView";
import { deriveLineView } from "@/features/equipment/dispatch/lib/lineStatus";
import { loadEquipmentLineStatus } from "@/features/equipment/dispatch/server/loadLineStatus";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { getActorCapabilities, ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Floor technicians reach a line through their assignment; dispatch staff see any line in the shop. */
const LINE_ROLES = [...new Set([...ROLE_GROUPS.shopWideOperators, ...ROLE_GROUPS.floorTechnicians])];

export default async function EquipmentLinePage({
  params,
}: {
  params: Promise<{ lineId: string }>;
}) {
  noStore();

  const { lineId } = await params;
  if (!UUID.test(lineId)) notFound();

  const { profile, canonicalRole } = await requireShopPageAccess({ allowRoles: LINE_ROLES });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref={`/equipment/line/${lineId}`} />;
  }

  const viewerCanManage = getActorCapabilities({ role: canonicalRole }).canManageScheduling;
  const status = await loadEquipmentLineStatus({
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    lineId,
    viewerProfileId: profile.id,
    viewerCanManage,
  });
  if (!status) notFound();

  const view = deriveLineView({
    lineStatus: status.line.status,
    approvalState: status.line.approvalState,
    holdReason: status.line.holdReason,
    segments: status.segments,
    viewerProfileId: profile.id,
    viewerCanManage,
  });

  return <EquipmentLineStatusView status={status} view={view} />;
}
