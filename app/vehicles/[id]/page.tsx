import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import VehicleWorkspace from "@/features/vehicles/components/VehicleWorkspace";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import {
  loadVehicleWorkspaceSnapshot,
  vehicleWorkspaceCreateWorkOrderHref,
} from "@/features/vehicles/server/loadVehicleWorkspaceSnapshot";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VehicleWorkspacePageProps = {
  params: Promise<{ id: string }>;
};

export default async function VehicleWorkspacePage({
  params,
}: VehicleWorkspacePageProps) {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: VEHICLE_WORKSPACE_READER_ROLES,
  });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  // Keep the authenticated cookie-backed client here. The read model relies on
  // database RLS in addition to its explicit shop filters and role redaction.
  const snapshot = await loadVehicleWorkspaceSnapshot({
    supabase: createServerSupabaseRSC(),
    shopId: profile.shop_id,
    role: canonicalRole,
    vehicleId: id,
  });

  // Malformed, cross-shop, missing, and unassigned-work access all have the same
  // public result so callers cannot use this route to enumerate vehicle IDs.
  if (!snapshot) notFound();

  return (
    <VehicleWorkspace
      snapshot={snapshot}
      createWorkOrderHref={vehicleWorkspaceCreateWorkOrderHref(snapshot)}
    />
  );
}
