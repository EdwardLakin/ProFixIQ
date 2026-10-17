import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentPartsView from "@/features/equipment/parts/components/EquipmentPartsView";
import { loadEquipmentParts } from "@/features/equipment/parts/server/loadEquipmentParts";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { equipmentShellItem } from "@/features/equipment/lib/equipmentShellNav";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { PARTS_REQUEST_QUEUE_ROLES } from "@/features/parts/server/loadPartsRequestQueue";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentPartsPage() {
  noStore();
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });
  if (!equipmentShellItem("parts").visibleTo(canonicalRole))
    redirect("/equipment/dashboard");
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled")
    return (
      <EquipmentAccessState state={entitlement} retryHref="/equipment/parts" />
    );
  // Navigation capability is deliberately broader than canonical queue access.
  if (!PARTS_REQUEST_QUEUE_ROLES.includes(canonicalRole))
    return <EquipmentPartsView restricted />;
  try {
    const rows = await loadEquipmentParts({
      supabase: createServerSupabaseRSC(),
      admin: createAdminSupabase(),
      shopId: profile.shop_id,
      role: canonicalRole,
    });
    return <EquipmentPartsView rows={rows} />;
  } catch {
    return <EquipmentPartsView error />;
  }
}
