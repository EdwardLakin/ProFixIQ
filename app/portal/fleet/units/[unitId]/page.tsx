import FleetUnitDetailWorkspace from "@/features/fleet/components/FleetUnitDetailWorkspace";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

type Props = { params: Promise<{ unitId: string }> };

export default async function PortalFleetUnitDetailPage({ params }: Props) {
  const { unitId } = await params;
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canViewUnitMaintenanceRecord) {
    redirect("/portal/fleet/units");
  }

  return (
    <FleetUnitDetailWorkspace
      unitId={unitId}
      fleetId={actor.primaryFleetId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
import { redirect } from "next/navigation";
